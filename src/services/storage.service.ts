import {
  AlertaEstudiante,
  Anotacion,
  Asistencia,
  ConfiguracionSistema,
  EstadoEstudiante,
  EstadoMatricula,
  EstadoPagoAnual,
  Estudiante,
  EstatusAsistencia,
  Grado,
  Grupo,
  Inscripcion,
  LogNotificacion,
  Perfil,
  Salon,
  Sesion,
  SolicitudMatricula,
  Tutor,
} from '../types/attendance';
import { cacheService } from './cache.service';
import { notificationService } from './notification.service';
import { supabase } from './supabase.client';
import { StorageKey, syncStore, TABLES } from './supabase.sync';
import { fechaLocalISO } from '../utils/fechas';

const STORAGE_KEYS = {
  PERFILES: 'aa_perfiles',
  TUTORES: 'aa_tutores',
  ESTUDIANTES: 'aa_estudiantes',
  GRUPOS: 'aa_grupos',
  INSCRIPCIONES: 'aa_inscripciones',
  SESIONES: 'aa_sesiones',
  ASISTENCIAS: 'aa_asistencias',
  LOGS: 'aa_log_notificaciones',
  CONFIG: 'aa_configuracion',
  MATRICULAS: 'aa_matriculas',
  ANECDOTARIO: 'aa_anecdotario',
  SALONES: 'aa_salones',
  GRADOS: 'aa_grados',
} as const satisfies Record<string, StorageKey>;

// Listeners for data updates
type DataChangeListener = () => void;
const listeners = new Set<DataChangeListener>();

export const subscribeToData = (listener: DataChangeListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notifyDataChange = () => {
  listeners.forEach((l) => l());
};

// Cambios remotos (realtime o recarga tras error): invalidar caché y refrescar vistas
syncStore.setExternalChangeHandler((keys) => {
  keys.forEach((k) => TABLES[k].tags.forEach((tag) => cacheService.invalidateByTag(tag)));
  cacheService.invalidate('config');
  notifyDataChange();
});

/** Respuesta de la Edge Function admin-usuarios */
interface AdminUsuariosResponse {
  perfil?: Perfil;
  idAnterior?: string;
  ok?: boolean;
  error?: string;
}

async function invokeAdminUsuarios(body: Record<string, unknown>): Promise<AdminUsuariosResponse> {
  const { data, error } = await supabase.functions.invoke<AdminUsuariosResponse>('admin-usuarios', { body });
  if (error) {
    // Intentar extraer el mensaje de error devuelto por la función
    let message = error.message;
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = (await context.json()) as AdminUsuariosResponse;
        if (payload?.error) message = payload.error;
      } catch {
        // ignorar
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

/** Id único entre dispositivos: marca de tiempo + sufijo aleatorio */
const nuevoId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_CONFIG: ConfiguracionSistema = {
  id: 1,
  limite_ausencias_alerta: 3,
  porcentaje_inasistencia_alerta: 20.0,
  nombre_institucion: 'Colegio Centro América',
  email_remitente: '',
  ciclo_academico_actual: 'Ciclo Vespertino 2026',
  arancel_taller: 1200,
  arancel_periodo: 'MENSUAL',
  updated_at: new Date().toISOString(),
};

class StorageService {
  // --- CICLO DE VIDA DE DATOS (Supabase) ---

  /** Descarga todos los datos desde Supabase y activa la sincronización en tiempo real */
  async hydrate(): Promise<void> {
    await syncStore.hydrate();
    cacheService.clear();
    syncStore.startRealtime();
    notifyDataChange();
  }

  /** Limpia los datos en memoria (al cerrar sesión) */
  reset(): void {
    syncStore.reset();
    cacheService.clear();
  }

  // --- RAW PERSISTENCE HELPERS ---
  private read<T>(key: StorageKey, defaultValue: T): T {
    if (key === STORAGE_KEYS.CONFIG) {
      const rows = syncStore.read<T>(key);
      return rows[0] ?? defaultValue;
    }
    return syncStore.read(key) as unknown as T;
  }

  /** Inserta/actualiza los registros que cambiaron (nunca borra; usar `remove`) */
  private write<T>(key: StorageKey, value: T): void {
    const rows = (Array.isArray(value) ? value : [value]) as unknown as Record<string, unknown>[];
    syncStore.write(key, rows);
    notifyDataChange();
  }

  private remove(key: StorageKey, ids: string[]): void {
    syncStore.remove(key, ids);
    notifyDataChange();
  }

  // --- CONFIGURACIÓN ---
  getConfiguracion(): ConfiguracionSistema {
    return cacheService.get<ConfiguracionSistema>('config') || this.read(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
  }

  updateConfiguracion(partial: Partial<ConfiguracionSistema>): ConfiguracionSistema {
    const current = this.getConfiguracion();
    const updated = { ...current, ...partial, updated_at: new Date().toISOString() };
    this.write(STORAGE_KEYS.CONFIG, updated);
    cacheService.invalidate('config');
    cacheService.invalidateByTag('alertas');
    return updated;
  }

  // --- GRUPOS ---
  getGrupos(): Grupo[] {
    const cached = cacheService.get<Grupo[]>('grupos_all');
    if (cached) return cached;

    const data = this.read<Grupo[]>(STORAGE_KEYS.GRUPOS, []);
    cacheService.set('grupos_all', data, 60000, ['grupos']);
    return data;
  }

  getGrupoById(id: string): Grupo | undefined {
    return this.getGrupos().find((g) => g.id === id);
  }

  /**
   * Crea un grupo y genera automáticamente las sesiones para las fechas del ciclo
   */
  crearGrupoConSesiones(
    grupoData: Omit<Grupo, 'id' | 'creado_en'>
  ): { grupo: Grupo; sesionesGeneradas: number } {
    const nuevoGrupo: Grupo = {
      ...grupoData,
      id: `grp-${nuevoId()}`,
      creado_en: new Date().toISOString(),
    };

    this.verificarChoqueSalon(nuevoGrupo);
    this.verificarChoqueDocente(nuevoGrupo);

    const grupos = this.getGrupos();
    grupos.push(nuevoGrupo);
    this.write(STORAGE_KEYS.GRUPOS, grupos);
    cacheService.invalidateByTag('grupos');

    // Pre-generar sesiones basado en días de la semana y rango de fechas
    const nuevasSesiones = this.generarFechasSesiones(nuevoGrupo).map((fecha) =>
      this.construirSesion(nuevoGrupo, fecha)
    );
    const sesionesGeneradas = nuevasSesiones.length;

    this.write(STORAGE_KEYS.SESIONES, nuevasSesiones);
    cacheService.invalidateByTag('sesiones');
    notifyDataChange();

    return { grupo: nuevoGrupo, sesionesGeneradas };
  }

  /**
   * Actualiza los datos de un grupo/taller existente
   */
  actualizarGrupo(
    id: string,
    data: Partial<Grupo>
  ): { grupo: Grupo; sesionesAgregadas: number; sesionesEliminadas: number; sesionesConservadas: number } {
    const grupos = this.getGrupos();
    const index = grupos.findIndex((g) => g.id === id);
    if (index === -1) {
      throw new Error(`Grupo con ID ${id} no encontrado.`);
    }

    const anterior = grupos[index];
    const updatedGrupo: Grupo = {
      ...anterior,
      ...data,
      id,
    };

    if (!updatedGrupo.fecha_inicio_ciclo || !updatedGrupo.fecha_fin_ciclo) {
      throw new Error('Indica la fecha de inicio y de fin del taller.');
    }
    if (updatedGrupo.fecha_fin_ciclo < updatedGrupo.fecha_inicio_ciclo) {
      throw new Error('La fecha de fin del taller no puede ser anterior a la fecha de inicio.');
    }
    if ((updatedGrupo.dias_semana || []).length === 0) {
      throw new Error('Selecciona al menos un día de clase.');
    }

    this.verificarChoqueSalon(updatedGrupo);
    this.verificarChoqueDocente(updatedGrupo);

    grupos[index] = updatedGrupo;
    this.write(STORAGE_KEYS.GRUPOS, grupos);
    cacheService.invalidateByTag('grupos');

    // Nombre u horario: actualizar sesiones NO cerradas (el historial ya tomado no cambia)
    if (data.nombre || data.hora_inicio || data.hora_fin) {
      const afectadas = this.getSesiones()
        .filter((s) => s.grupo_id === id && !s.cerrada)
        .map((s) => ({
          ...s,
          tema: data.nombre ? `Sesión de ${data.nombre}` : s.tema,
          hora_inicio: data.hora_inicio || s.hora_inicio,
          hora_fin: data.hora_fin || s.hora_fin,
        }));
      if (afectadas.length > 0) {
        this.write(STORAGE_KEYS.SESIONES, afectadas);
        cacheService.invalidateByTag('sesiones');
      }
    }

    // Ajustar el calendario de sesiones en CADA guardado (no solo si cambian fechas o días).
    // Es idempotente, y así se reparan guardados parciales: la cola no es transaccional y
    // un taller puede quedar guardado con sus fechas nuevas pero sin sus sesiones.
    const resumen = this.reconciliarSesiones(updatedGrupo);

    notifyDataChange();
    return { grupo: updatedGrupo, ...resumen };
  }

  /** Fechas (YYYY-MM-DD) en que el taller tiene clase según su ciclo y días de la semana */
  private generarFechasSesiones(grupo: Grupo): string[] {
    // Aritmética 100% UTC: el día de la semana y la fecha guardada salen del mismo calendario,
    // sin importar la zona horaria del equipo (antes, en UTC-6 los lunes quedaban como martes).
    const aUTC = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    };
    const fechas: string[] = [];
    const fin = aUTC(grupo.fecha_fin_ciclo);
    const cursor = aUTC(grupo.fecha_inicio_ciclo);
    while (cursor <= fin) {
      // getUTCDay: 0=Domingo ... 6=Sábado → 1=Lunes ... 7=Domingo
      const dayOfWeek = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
      if (grupo.dias_semana.includes(dayOfWeek)) {
        fechas.push(cursor.toISOString().slice(0, 10));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return fechas;
  }

  /** Vista previa del calendario (para formularios): fechas que tendría el taller con esos datos */
  previsualizarSesiones(
    grupo: Pick<Grupo, 'fecha_inicio_ciclo' | 'fecha_fin_ciclo' | 'dias_semana'>
  ): string[] {
    if (!grupo.fecha_inicio_ciclo || !grupo.fecha_fin_ciclo || grupo.fecha_fin_ciclo < grupo.fecha_inicio_ciclo) {
      return [];
    }
    return this.generarFechasSesiones(grupo as Grupo);
  }

  /**
   * Agrega una clase fuera del calendario habitual (reposición, clase extra).
   * Se marca como extraordinaria y no se elimina al reconciliar el calendario.
   */
  agregarSesionExtraordinaria(
    grupoId: string,
    datos: { fecha: string; hora_inicio?: string; hora_fin?: string; tema?: string }
  ): Sesion {
    const grupo = this.getGrupoById(grupoId);
    if (!grupo) throw new Error('Taller no encontrado.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) throw new Error('Indica una fecha válida.');

    const hora_inicio = datos.hora_inicio || grupo.hora_inicio;
    const hora_fin = datos.hora_fin || grupo.hora_fin;
    if (hora_fin <= hora_inicio) throw new Error('La hora de fin debe ser posterior a la de inicio.');

    const existente = this.getSesiones().find((s) => s.grupo_id === grupoId && s.fecha === datos.fecha);
    if (existente) {
      throw new Error('Ya existe una sesión de este taller en esa fecha. Selecciónala en el calendario de clases.');
    }

    const sesion: Sesion = {
      ...this.construirSesion(grupo, datos.fecha),
      hora_inicio,
      hora_fin,
      tema: datos.tema?.trim() || 'Clase extraordinaria',
      extraordinaria: true,
    };
    this.write(STORAGE_KEYS.SESIONES, [sesion]);
    cacheService.invalidateByTag('sesiones');
    cacheService.invalidateByTag('alertas');
    notifyDataChange();
    return sesion;
  }

  private construirSesion(grupo: Grupo, fecha: string): Sesion {
    return {
      id: `ses-${grupo.id}-${fecha}`,
      grupo_id: grupo.id,
      fecha,
      hora_inicio: grupo.hora_inicio,
      hora_fin: grupo.hora_fin,
      cerrada: false,
      fecha_cierre: null,
      tema: `Sesión de ${grupo.nombre}`,
      extraordinaria: false,
    };
  }

  /**
   * Ajusta las sesiones de un taller a su calendario actual:
   * agrega las fechas que faltan y elimina las que sobran, salvo las cerradas o con asistencia.
   */
  private reconciliarSesiones(grupo: Grupo): {
    sesionesAgregadas: number;
    sesionesEliminadas: number;
    sesionesConservadas: number;
  } {
    const deseadas = new Set(this.generarFechasSesiones(grupo));
    const actuales = this.getSesiones().filter((s) => s.grupo_id === grupo.id);
    const fechasActuales = new Set(actuales.map((s) => s.fecha));
    const sesionesConAsistencia = new Set(this.getAsistencias().map((a) => a.sesion_id));

    const nuevas = Array.from(deseadas)
      .filter((f) => !fechasActuales.has(f))
      .map((f) => this.construirSesion(grupo, f));

    // Las sesiones extraordinarias son decisiones manuales: nunca se cuentan como sobrantes
    const sobrantes = actuales.filter((s) => !deseadas.has(s.fecha) && !s.extraordinaria);
    const eliminables = sobrantes.filter((s) => !s.cerrada && !sesionesConAsistencia.has(s.id));

    if (nuevas.length > 0) this.write(STORAGE_KEYS.SESIONES, nuevas);
    if (eliminables.length > 0) this.remove(STORAGE_KEYS.SESIONES, eliminables.map((s) => s.id));

    cacheService.invalidateByTag('sesiones');
    cacheService.invalidateByTag('alertas');

    return {
      sesionesAgregadas: nuevas.length,
      sesionesEliminadas: eliminables.length,
      sesionesConservadas: sobrantes.length - eliminables.length,
    };
  }

  // --- SESIONES ---
  getSesiones(): Sesion[] {
    const cached = cacheService.get<Sesion[]>('sesiones_all');
    if (cached) return cached;

    const data = this.read<Sesion[]>(STORAGE_KEYS.SESIONES, []);
    cacheService.set('sesiones_all', data, 60000, ['sesiones']);
    return data;
  }

  getSesionesByGrupo(grupoId: string): Sesion[] {
    return this.getSesiones()
      .filter((s) => s.grupo_id === grupoId)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  getSesionById(id: string): Sesion | undefined {
    return this.getSesiones().find((s) => s.id === id);
  }

  // --- ESTUDIANTES Y TUTORES ---
  getEstudiantes(): Estudiante[] {
    const cached = cacheService.get<Estudiante[]>('estudiantes_all');
    if (cached) return cached;

    const data = this.read<Estudiante[]>(STORAGE_KEYS.ESTUDIANTES, []);
    const configCiclo = String(new Date().getFullYear());

    // Valores por defecto solo en memoria (no se escriben de vuelta a la base de datos)
    const enriched = data.map((est) => ({
      ...est,
      solvente: est.solvente ?? true,
      estado: est.estado || 'ACTIVO',
      ciclo_actual: est.ciclo_actual || configCiclo,
      contrato_vigente: est.contrato_vigente ?? true,
      estado_pago_anual: est.estado_pago_anual || (est.solvente !== false ? 'AL_DIA' : 'PENDIENTE'),
    }));

    cacheService.set('estudiantes_all', enriched, 60000, ['estudiantes']);
    return enriched;
  }

  getTutores(): Tutor[] {
    const cached = cacheService.get<Tutor[]>('tutores_all');
    if (cached) return cached;

    const data = this.read<Tutor[]>(STORAGE_KEYS.TUTORES, []);
    cacheService.set('tutores_all', data, 60000, ['tutores']);
    return data;
  }

  getTutorById(id: string): Tutor | undefined {
    return this.getTutores().find((t) => t.id === id);
  }

  getEstudiantesByGrupo(grupoId: string): Estudiante[] {
    const cacheKey = `estudiantes_grupo_${grupoId}`;
    const cached = cacheService.get<Estudiante[]>(cacheKey);
    if (cached) return cached;

    const inscripciones = this.read<Inscripcion[]>(STORAGE_KEYS.INSCRIPCIONES, []);
    const studentIds = new Set(
      inscripciones.filter((i) => i.grupo_id === grupoId).map((i) => i.estudiante_id)
    );
    const result = this.getEstudiantes().filter((e) => studentIds.has(e.id));
    cacheService.set(cacheKey, result, 60000, ['estudiantes', 'inscripciones']);
    return result;
  }

  // --- GESTIÓN DE INSCRIPCIONES Y PREVENCIÓN DE CONFLICTOS DE HORARIO ---
  getInscripciones(): Inscripcion[] {
    return this.read<Inscripcion[]>(STORAGE_KEYS.INSCRIPCIONES, []);
  }

  getInscripcionesByGrupo(grupoId: string): Inscripcion[] {
    return this.getInscripciones().filter((i) => i.grupo_id === grupoId);
  }

  getGruposByEstudiante(estudianteId: string): Grupo[] {
    const inscripciones = this.getInscripciones().filter((i) => i.estudiante_id === estudianteId);
    const grupoIds = new Set(inscripciones.map((i) => i.grupo_id));
    return this.getGrupos().filter((g) => grupoIds.has(g.id));
  }

  /**
   * Valida si dos talleres presentan colisión temporal de fechas, días de la semana y rango de horas
   */
  sonTalleresEnConflicto(grupoA: Grupo, grupoB: Grupo): { tieneConflicto: boolean; motivo?: string } {
    if (grupoA.id === grupoB.id) {
      return { tieneConflicto: false };
    }

    // 1. Rango de fechas del ciclo coinciden o se traslapan
    const inicioA = grupoA.fecha_inicio_ciclo || '';
    const finA = grupoA.fecha_fin_ciclo || '';
    const inicioB = grupoB.fecha_inicio_ciclo || '';
    const finB = grupoB.fecha_fin_ciclo || '';

    if (inicioA && finA && inicioB && finB) {
      const seTraslapanFechas = inicioA <= finB && inicioB <= finA;
      if (!seTraslapanFechas) {
        return { tieneConflicto: false };
      }
    }

    // 2. Días de la semana que coinciden
    const diasCoincidentes = (grupoA.dias_semana || []).filter((dia) =>
      (grupoB.dias_semana || []).includes(dia)
    );
    if (diasCoincidentes.length === 0) {
      return { tieneConflicto: false };
    }

    // 3. Rango de horas que coinciden o se traslapan
    const toMins = (h: string): number => {
      if (!h) return 0;
      const parts = h.split(':').map((v) => parseInt(v, 10) || 0);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    const startA = toMins(grupoA.hora_inicio);
    const endA = toMins(grupoA.hora_fin);
    const startB = toMins(grupoB.hora_inicio);
    const endB = toMins(grupoB.hora_fin);

    const seTraslapanHoras = startA < endB && startB < endA;
    if (!seTraslapanHoras) {
      return { tieneConflicto: false };
    }

    const DIAS_MAP: Record<number, string> = {
      1: 'Lunes',
      2: 'Martes',
      3: 'Miércoles',
      4: 'Jueves',
      5: 'Viernes',
      6: 'Sábado',
      7: 'Domingo',
    };
    const diasTexto = diasCoincidentes.map((d) => DIAS_MAP[d] || `Día ${d}`).join(', ');

    return {
      tieneConflicto: true,
      motivo: `Coincide con "${grupoB.nombre}" (${diasTexto} de ${grupoB.hora_inicio} a ${grupoB.hora_fin})`,
    };
  }

  /**
   * Verifica si un estudiante tiene conflicto de horario con alguno de los talleres en los que ya está inscrito
   */
  verificarConflictoHorario(
    estudianteId: string,
    targetGrupo: Grupo
  ): { tieneConflicto: boolean; grupoConflictivo?: Grupo; motivo?: string } {
    const talleresActuales = this.getGruposByEstudiante(estudianteId);

    for (const taller of talleresActuales) {
      const check = this.sonTalleresEnConflicto(targetGrupo, taller);
      if (check.tieneConflicto) {
        return {
          tieneConflicto: true,
          grupoConflictivo: taller,
          motivo: check.motivo,
        };
      }
    }

    return { tieneConflicto: false };
  }

  /**
   * Inscribe un estudiante a un taller validando que no tenga colisión de horario
   */
  inscribirEstudianteEnGrupo(
    estudianteId: string,
    grupoId: string
  ): { success: boolean; error?: string } {
    const targetGrupo = this.getGrupoById(grupoId);
    if (!targetGrupo) {
      return { success: false, error: 'Taller no encontrado' };
    }

    const inscripciones = this.getInscripciones();
    const yaInscrito = inscripciones.some(
      (i) => i.grupo_id === grupoId && i.estudiante_id === estudianteId
    );
    if (yaInscrito) {
      return { success: true };
    }

    // Validar conflicto de horario
    const conflicto = this.verificarConflictoHorario(estudianteId, targetGrupo);
    if (conflicto.tieneConflicto) {
      return {
        success: false,
        error: conflicto.motivo || 'Conflicto de horario con otro taller en el que ya está inscrito',
      };
    }

    inscripciones.push({
      id: `ins-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      grupo_id: grupoId,
      estudiante_id: estudianteId,
      fecha_inscripcion: fechaLocalISO(),
    });

    this.write(STORAGE_KEYS.INSCRIPCIONES, inscripciones);
    cacheService.invalidateByTag('estudiantes');
    cacheService.invalidateByTag('inscripciones');
    cacheService.invalidateByTag('alertas');
    notifyDataChange();

    return { success: true };
  }

  /**
   * Desinscribe un estudiante de un taller
   */
  desinscribirEstudianteDeGrupo(estudianteId: string, grupoId: string): void {
    const idsAEliminar = this.getInscripciones()
      .filter((i) => i.grupo_id === grupoId && i.estudiante_id === estudianteId)
      .map((i) => i.id);
    this.remove(STORAGE_KEYS.INSCRIPCIONES, idsAEliminar);
    cacheService.invalidateByTag('estudiantes');
    cacheService.invalidateByTag('inscripciones');
    cacheService.invalidateByTag('alertas');
    notifyDataChange();
  }

  /**
   * Actualiza en bloque las inscripciones de un taller (agrega seleccionados válidos y remueve desmarcados)
   */
  actualizarInscripcionesGrupo(
    grupoId: string,
    estudianteIdsDeseados: string[]
  ): {
    agregados: number;
    removidos: number;
    errores: { estudianteId: string; estudianteNombre: string; motivo: string }[];
  } {
    const targetGrupo = this.getGrupoById(grupoId);
    if (!targetGrupo) {
      throw new Error('Taller no encontrado');
    }

    const estudiantes = this.getEstudiantes();
    const inscripcionesActuales = this.getInscripcionesByGrupo(grupoId);
    const idsActuales = new Set(inscripcionesActuales.map((i) => i.estudiante_id));
    const idsDeseados = new Set(estudianteIdsDeseados);

    let agregados = 0;
    let removidos = 0;
    const errores: { estudianteId: string; estudianteNombre: string; motivo: string }[] = [];

    // 1. Remover los que fueron desmarcados
    idsActuales.forEach((eId) => {
      if (!idsDeseados.has(eId)) {
        this.desinscribirEstudianteDeGrupo(eId, grupoId);
        removidos++;
      }
    });

    // 2. Agregar los nuevos marcados
    idsDeseados.forEach((eId) => {
      if (!idsActuales.has(eId)) {
        const est = estudiantes.find((e) => e.id === eId);
        const estNombre = est ? `${est.nombre} ${est.apellido}` : eId;

        const resultado = this.inscribirEstudianteEnGrupo(eId, grupoId);
        if (resultado.success) {
          agregados++;
        } else {
          errores.push({
            estudianteId: eId,
            estudianteNombre: estNombre,
            motivo: resultado.error || 'Conflicto de horario detectado',
          });
        }
      }
    });

    return { agregados, removidos, errores };
  }

  agregarEstudiante(
    est: Omit<Estudiante, 'id' | 'creado_en'>,
    grupoId?: string
  ): Estudiante {
    const nuevo: Estudiante = {
      ...est,
      id: `est-${nuevoId()}`,
      creado_en: new Date().toISOString(),
    };
    const lista = this.getEstudiantes();
    lista.push(nuevo);
    this.write(STORAGE_KEYS.ESTUDIANTES, lista);

    if (grupoId) {
      const inscripciones = this.read<Inscripcion[]>(STORAGE_KEYS.INSCRIPCIONES, []);
      inscripciones.push({
        id: `ins-${nuevoId()}`,
        grupo_id: grupoId,
        estudiante_id: nuevo.id,
        fecha_inscripcion: fechaLocalISO(),
      });
      this.write(STORAGE_KEYS.INSCRIPCIONES, inscripciones);
    }

    cacheService.invalidateByTag('estudiantes');
    cacheService.invalidateByTag('alertas');
    notifyDataChange();
    return nuevo;
  }

  /**
   * Actualiza los datos de un estudiante registrado
   */
  actualizarEstudiante(id: string, data: Partial<Estudiante>): Estudiante {
    const estudiantes = this.getEstudiantes();
    const index = estudiantes.findIndex((e) => e.id === id);
    if (index === -1) {
      throw new Error(`Estudiante con ID ${id} no encontrado.`);
    }

    const updatedEst: Estudiante = {
      ...estudiantes[index],
      ...data,
      id,
    };

    estudiantes[index] = updatedEst;
    this.write(STORAGE_KEYS.ESTUDIANTES, estudiantes);
    cacheService.invalidateByTag('estudiantes');
    cacheService.invalidateByTag('alertas');
    notifyDataChange();
    return updatedEst;
  }

  /**
   * Da de baja temporalmente a un alumno sin eliminar su expediente ni historial
   */
  darDeBajaEstudiante(id: string, motivo: string): Estudiante {
    return this.actualizarEstudiante(id, {
      estado: 'BAJA',
      fecha_baja: new Date().toISOString(),
      motivo_baja: motivo.trim() || 'Baja temporal solicitada',
    });
  }

  /**
   * Reactiva o reincorpora a un alumno que estaba de baja para que vuelva a cursos
   */
  reactivarEstudiante(id: string): Estudiante {
    return this.actualizarEstudiante(id, {
      estado: 'ACTIVO',
      fecha_reactivacion: new Date().toISOString(),
      motivo_baja: undefined,
    });
  }

  /**
   * Registra la renovación anual de contrato y pago para el ciclo lectivo
   */
  renovarContratoYPago(
    id: string,
    data: {
      ciclo?: string;
      contrato_vigente: boolean;
      contrato_texto?: string;
      firma_digital_url?: string;
      firmante_nombre?: string;
      estado_pago_anual: EstadoPagoAnual;
      numero_recibo_anual?: string;
      observaciones_renovacion?: string;
    }
  ): Estudiante {
    const isAlDia = data.estado_pago_anual === 'AL_DIA';
    const nowIso = new Date().toISOString();

    return this.actualizarEstudiante(id, {
      ciclo_actual: data.ciclo || this.getConfiguracion().ciclo_academico_actual || '2026',
      contrato_vigente: data.contrato_vigente,
      contrato_texto: data.contrato_texto,
      fecha_renovacion_contrato: data.contrato_vigente ? nowIso : undefined,
      firma_digital_url: data.firma_digital_url,
      fecha_firma: data.firma_digital_url ? nowIso : undefined,
      firmante_nombre: data.firmante_nombre,
      estado_pago_anual: data.estado_pago_anual,
      fecha_ultimo_pago_anual: isAlDia ? nowIso : undefined,
      numero_recibo_anual: data.numero_recibo_anual?.trim() || undefined,
      observaciones_renovacion: data.observaciones_renovacion?.trim() || undefined,
      solvente: isAlDia,
      // Al formalizar la renovación con contrato y firma, el estudiante queda en estado ACTIVO
      estado: 'ACTIVO',
    });
  }

  agregarTutor(tutorData: Omit<Tutor, 'id' | 'creado_en'>): Tutor {
    const nuevo: Tutor = {
      ...tutorData,
      id: `tut-${nuevoId()}`,
      creado_en: new Date().toISOString(),
    };
    const tutores = this.getTutores();
    tutores.push(nuevo);
    this.write(STORAGE_KEYS.TUTORES, tutores);
    cacheService.invalidateByTag('tutores');
    notifyDataChange();
    return nuevo;
  }

  /**
   * Actualiza los datos de un tutor registrado
   */
  actualizarTutor(id: string, data: Partial<Tutor>): Tutor {
    const tutores = this.getTutores();
    const index = tutores.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`Tutor con ID ${id} no encontrado.`);
    }

    const updatedTutor: Tutor = {
      ...tutores[index],
      ...data,
      id,
    };

    tutores[index] = updatedTutor;
    this.write(STORAGE_KEYS.TUTORES, tutores);
    cacheService.invalidateByTag('tutores');
    notifyDataChange();
    return updatedTutor;
  }

  // --- ASISTENCIAS ---
  getAsistencias(): Asistencia[] {
    return this.read<Asistencia[]>(STORAGE_KEYS.ASISTENCIAS, []);
  }

  getAsistenciasBySesion(sesionId: string): Asistencia[] {
    return this.getAsistencias().filter((a) => a.sesion_id === sesionId);
  }

  /** Una sesión es futura si su fecha es posterior a hoy (fecha local) */
  esSesionFutura(sesion: Pick<Sesion, 'fecha'>): boolean {
    return sesion.fecha > fechaLocalISO();
  }

  /** Impide tomar lista o cerrar sesiones cuya fecha aún no llega */
  private asegurarSesionNoFutura(sesionId: string): void {
    const sesion = this.getSesionById(sesionId);
    if (sesion && this.esSesionFutura(sesion)) {
      const [y, m, d] = sesion.fecha.split('-').map(Number);
      const fecha = new Date(y, m - 1, d).toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      throw new Error(`No se puede tomar lista de una sesión futura. Esta clase está programada para el ${fecha}.`);
    }
  }

  upsertAsistencia(
    sesionId: string,
    estudianteId: string,
    estatus: EstatusAsistencia,
    motivoJustificacion: string | null = null,
    registradoPor: string = 'prof-01'
  ): Asistencia {
    this.asegurarSesionNoFutura(sesionId);
    const asistencias = this.getAsistencias();
    const existingIndex = asistencias.findIndex(
      (a) => a.sesion_id === sesionId && a.estudiante_id === estudianteId
    );

    let result: Asistencia;
    if (existingIndex >= 0) {
      result = {
        ...asistencias[existingIndex],
        estatus,
        motivo_justificacion: motivoJustificacion,
        registrado_por: registradoPor,
        actualizado_en: new Date().toISOString(),
      };
      asistencias[existingIndex] = result;
    } else {
      result = {
        id: `asist-${sesionId}-${estudianteId}`,
        sesion_id: sesionId,
        estudiante_id: estudianteId,
        estatus,
        motivo_justificacion: motivoJustificacion,
        registrado_por: registradoPor,
        actualizado_en: new Date().toISOString(),
      };
      asistencias.push(result);
    }

    this.write(STORAGE_KEYS.ASISTENCIAS, asistencias);
    cacheService.invalidateByTag('asistencias');
    cacheService.invalidateByTag('alertas');
    return result;
  }

  marcarTodosPresentes(sesionId: string, estudianteIds: string[], registradoPor: string): void {
    this.asegurarSesionNoFutura(sesionId);
    const asistencias = this.getAsistencias();
    const now = new Date().toISOString();

    estudianteIds.forEach((eId) => {
      const idx = asistencias.findIndex(
        (a) => a.sesion_id === sesionId && a.estudiante_id === eId
      );
      if (idx >= 0) {
        asistencias[idx].estatus = 'PRESENTE';
        asistencias[idx].motivo_justificacion = null;
        asistencias[idx].actualizado_en = now;
        asistencias[idx].registrado_por = registradoPor;
      } else {
        asistencias.push({
          id: `asist-${sesionId}-${eId}`,
          sesion_id: sesionId,
          estudiante_id: eId,
          estatus: 'PRESENTE',
          motivo_justificacion: null,
          registrado_por: registradoPor,
          actualizado_en: now,
        });
      }
    });

    this.write(STORAGE_KEYS.ASISTENCIAS, asistencias);
    cacheService.invalidateByTag('asistencias');
    cacheService.invalidateByTag('alertas');
  }

  /**
   * Cierre atómico de sesión con disparo de notificaciones automáticas a tutores de ausentes
   */
  async cerrarSesion(
    sesionId: string,
    registradoPorNombre: string = 'Profesor'
  ): Promise<{
    sesion: Sesion;
    notificacionesEnviadas: number;
    detalles: string[];
  }> {
    this.asegurarSesionNoFutura(sesionId);
    const sesiones = this.getSesiones();
    const sesionIdx = sesiones.findIndex((s) => s.id === sesionId);
    if (sesionIdx < 0) throw new Error('Sesión no encontrada');

    const sesion = sesiones[sesionIdx];
    const grupo = this.getGrupoById(sesion.grupo_id);
    const ahora = new Date().toISOString();

    // Actualizar estado de la sesión
    sesiones[sesionIdx] = {
      ...sesion,
      cerrada: true,
      fecha_cierre: ahora,
    };
    this.write(STORAGE_KEYS.SESIONES, sesiones);

    // Obtener todas las asistencias de esta sesión
    const asistencias = this.getAsistenciasBySesion(sesionId);
    const estudiantes = this.getEstudiantes();
    const tutores = this.getTutores();

    const ausentes = asistencias.filter((a) => a.estatus === 'AUSENTE');
    const logs = this.read<LogNotificacion[]>(STORAGE_KEYS.LOGS, []);
    let notificacionesEnviadas = 0;
    const detalles: string[] = [];

    // Enviar correos a cada tutor de alumno ausente
    for (const asistencia of ausentes) {
      const estudiante = estudiantes.find((e) => e.id === asistencia.estudiante_id);
      if (!estudiante) continue;
      const tutor = tutores.find((t) => t.id === estudiante.tutor_id);
      if (!tutor) continue;

      try {
        const notifResult = await notificationService.dispatchNotification({
          asistenciaId: asistencia.id,
          estudianteId: estudiante.id,
          estudianteNombre: `${estudiante.nombre} ${estudiante.apellido}`,
          tutorId: tutor.id,
          tutorEmail: tutor.email,
          tutorNombre: tutor.nombre,
          tallerNombre: grupo?.nombre || 'Taller Artístico',
          fechaSesion: sesion.fecha,
          tipo: 'INICIAL',
        });

        logs.push(notifResult.log);
        notificacionesEnviadas++;
        detalles.push(`Aviso enviado a ${tutor.nombre} (${tutor.email}) por ${estudiante.nombre}`);
      } catch (e: unknown) {
        console.error('Error al despachar notificación:', e);
      }
    }

    this.write(STORAGE_KEYS.LOGS, logs);
    cacheService.invalidateByTag('sesiones');
    cacheService.invalidateByTag('asistencias');
    cacheService.invalidateByTag('alertas');
    cacheService.invalidateByTag('logs');

    return {
      sesion: sesiones[sesionIdx],
      notificacionesEnviadas,
      detalles,
    };
  }

  /**
   * Rectificación de una falta previa a presente o justificada con notificación de corrección al tutor
   */
  async rectificarAsistencia(
    asistenciaIdOrPayload: string | { sesionId: string; estudianteId: string },
    nuevoEstatus: EstatusAsistencia,
    motivoRectificacion: string,
    registradoPor: string = 'prof-01'
  ): Promise<{ asistencia: Asistencia; notificacionEnviada: boolean; tutorEmail?: string; tutorNombre?: string }> {
    const asistencias = this.getAsistencias();
    let idx = -1;

    if (typeof asistenciaIdOrPayload === 'string') {
      idx = asistencias.findIndex((a) => a.id === asistenciaIdOrPayload);
    } else {
      idx = asistencias.findIndex(
        (a) => a.sesion_id === asistenciaIdOrPayload.sesionId && a.estudiante_id === asistenciaIdOrPayload.estudianteId
      );
    }

    let anterior: Asistencia;
    const now = new Date().toISOString();

    if (idx >= 0) {
      anterior = asistencias[idx];
    } else {
      // Si no existía el registro previo en la sesión cerrada, se crea con estado base AUSENTE
      const sId = typeof asistenciaIdOrPayload === 'string' ? '' : asistenciaIdOrPayload.sesionId;
      const eId = typeof asistenciaIdOrPayload === 'string' ? '' : asistenciaIdOrPayload.estudianteId;
      anterior = {
        id: `asist-${sId}-${eId}-${Date.now()}`,
        sesion_id: sId,
        estudiante_id: eId,
        estatus: 'AUSENTE',
        motivo_justificacion: null,
        registrado_por: registradoPor,
        actualizado_en: now,
      };
      asistencias.push(anterior);
      idx = asistencias.length - 1;
    }

    const estatusPrevio = anterior.estatus;

    const actualizada: Asistencia = {
      ...anterior,
      estatus: nuevoEstatus,
      motivo_justificacion: motivoRectificacion || anterior.motivo_justificacion,
      registrado_por: registradoPor,
      actualizado_en: now,
    };
    asistencias[idx] = actualizada;
    this.write(STORAGE_KEYS.ASISTENCIAS, asistencias);

    let notificacionEnviada = false;
    let tutorEmailFound: string | undefined;
    let tutorNombreFound: string | undefined;

    // Si antes era AUSENTE y ahora fue rectificado a PRESENTE o JUSTIFICADO, enviar correo de rectificación
    if (estatusPrevio === 'AUSENTE' && (nuevoEstatus === 'PRESENTE' || nuevoEstatus === 'JUSTIFICADO')) {
      const sesion = this.getSesionById(actualizada.sesion_id);
      const grupo = sesion ? this.getGrupoById(sesion.grupo_id) : undefined;
      const estudiante = this.getEstudiantes().find((e) => e.id === actualizada.estudiante_id);
      const tutor = estudiante ? this.getTutorById(estudiante.tutor_id) : undefined;

      if (sesion && estudiante && tutor) {
        tutorEmailFound = tutor.email;
        tutorNombreFound = tutor.nombre;

        const notifResult = await notificationService.dispatchNotification({
          asistenciaId: actualizada.id,
          estudianteId: estudiante.id,
          estudianteNombre: `${estudiante.nombre} ${estudiante.apellido}`,
          tutorId: tutor.id,
          tutorEmail: tutor.email,
          tutorNombre: tutor.nombre,
          tallerNombre: grupo?.nombre || 'Taller Artístico',
          fechaSesion: sesion.fecha,
          tipo: 'RECTIFICACION',
          motivoRectificacion,
          nuevoEstatus,
          estatusAnterior: estatusPrevio,
        });

        const logs = this.read<LogNotificacion[]>(STORAGE_KEYS.LOGS, []);
        logs.push(notifResult.log);
        this.write(STORAGE_KEYS.LOGS, logs);
        notificacionEnviada = true;
      }
    }

    cacheService.invalidateByTag('asistencias');
    cacheService.invalidateByTag('alertas');
    cacheService.invalidateByTag('logs');

    return {
      asistencia: actualizada,
      notificacionEnviada,
      tutorEmail: tutorEmailFound,
      tutorNombre: tutorNombreFound,
    };
  }

  // --- VISTA CALCULADA DE ALERTAS (vista_alerta_estudiantes) ---
  /**
   * Alertas por alumno y taller. Sin `rango` cuenta todas las sesiones cerradas del ciclo;
   * con `rango` (fechas YYYY-MM-DD, ambas opcionales) solo las sesiones cerradas en esas fechas,
   * y los umbrales de Configuración se aplican sobre ese período.
   */
  calcularAlertasEstudiantes(grupoId?: string, rango?: { desde?: string; hasta?: string }): AlertaEstudiante[] {
    const desde = rango?.desde || '0000-01-01';
    const hasta = rango?.hasta || '9999-12-31';
    const cacheKey = `alertas_${grupoId || 'todas'}${rango ? `_${desde}_${hasta}` : ''}`;
    const cached = cacheService.get<AlertaEstudiante[]>(cacheKey);
    if (cached) return cached;

    const config = this.getConfiguracion();
    const grupos = grupoId ? [this.getGrupoById(grupoId)!].filter(Boolean) : this.getGrupos();
    const sesiones = this.getSesiones();
    const asistencias = this.getAsistencias();
    const estudiantes = this.getEstudiantes();
    const tutores = this.getTutores();
    const inscripciones = this.read<Inscripcion[]>(STORAGE_KEYS.INSCRIPCIONES, []);

    const alertas: AlertaEstudiante[] = [];

    grupos.forEach((grupo) => {
      // Sesiones cerradas de este grupo
      const sesionesCerradas = sesiones.filter(
        (s) => s.grupo_id === grupo.id && s.cerrada && s.fecha >= desde && s.fecha <= hasta
      );
      const sesionIdsCerradas = new Set(sesionesCerradas.map((s) => s.id));
      const totalSesionesCerradas = sesionesCerradas.length;

      // Estudiantes inscritos en este grupo
      const estIdsInscritos = inscripciones
        .filter((i) => i.grupo_id === grupo.id)
        .map((i) => i.estudiante_id);

      estIdsInscritos.forEach((estId) => {
        const estudiante = estudiantes.find((e) => e.id === estId);
        if (!estudiante) return;
        const tutor = tutores.find((t) => t.id === estudiante.tutor_id);

        // Asistencias de este estudiante en sesiones cerradas de este grupo
        const asistenciasEstudiante = asistencias.filter(
          (a) => a.estudiante_id === estId && sesionIdsCerradas.has(a.sesion_id)
        );

        let totalPresentes = 0;
        let totalAusencias = 0;
        let totalJustificadas = 0;

        asistenciasEstudiante.forEach((a) => {
          if (a.estatus === 'PRESENTE') totalPresentes++;
          else if (a.estatus === 'AUSENTE') totalAusencias++;
          else if (a.estatus === 'JUSTIFICADO') totalJustificadas++;
        });

        // Porcentaje de inasistencia (ausencias sobre el total de sesiones impartidas cerradas)
        const porcentajeInasistencia =
          totalSesionesCerradas > 0
            ? Math.round((totalAusencias / totalSesionesCerradas) * 1000) / 10
            : 0;

        // Niveles de alerta:
        // CRITICA si ausencias >= limite_ausencias_alerta (ej. 3) o % >= porcentaje_inasistencia_alerta (ej. 20%)
        // ADVERTENCIA si ausencias >= 2 o % >= 15%
        let nivelAlerta: 'NORMAL' | 'ADVERTENCIA' | 'CRITICA' = 'NORMAL';
        let tieneAlerta = false;

        if (
          totalAusencias >= config.limite_ausencias_alerta ||
          porcentajeInasistencia >= config.porcentaje_inasistencia_alerta
        ) {
          nivelAlerta = 'CRITICA';
          tieneAlerta = true;
        } else if (totalAusencias >= 2 || porcentajeInasistencia >= 15.0) {
          nivelAlerta = 'ADVERTENCIA';
          tieneAlerta = true;
        }

        alertas.push({
          estudiante_id: estudiante.id,
          estudiante_nombre: `${estudiante.nombre} ${estudiante.apellido}`,
          matricula: estudiante.matricula,
          tutor_nombre: tutor?.nombre || 'Sin tutor asignado',
          tutor_email: tutor?.email || 'N/A',
          grupo_id: grupo.id,
          grupo_nombre: grupo.nombre,
          sesiones_cerradas: totalSesionesCerradas,
          total_asistencias: totalPresentes,
          total_ausencias: totalAusencias,
          total_justificadas: totalJustificadas,
          porcentaje_inasistencia: porcentajeInasistencia,
          tiene_alerta: tieneAlerta,
          nivel_alerta: nivelAlerta,
        });
      });
    });

    // Guardar en caché con TTL de 30 segundos
    cacheService.set(cacheKey, alertas, 30000, ['alertas', 'asistencias']);
    return alertas;
  }

  // --- LOG DE NOTIFICACIONES ---
  getLogsNotificaciones(): LogNotificacion[] {
    const cached = cacheService.get<LogNotificacion[]>('logs_all');
    if (cached) return cached;

    const data = this.read<LogNotificacion[]>(STORAGE_KEYS.LOGS, []).sort((a, b) =>
      b.enviado_en.localeCompare(a.enviado_en)
    );
    cacheService.set('logs_all', data, 30000, ['logs']);
    return data;
  }

  // --- PERFILES / MAESTROS ---
  getPerfiles(): Perfil[] {
    const cached = cacheService.get<Perfil[]>('perfiles_all');
    if (cached) return cached;

    const data = this.read<Perfil[]>(STORAGE_KEYS.PERFILES, []).map((p) => ({
      ...p,
      activo: p.activo !== false,
    }));
    cacheService.set('perfiles_all', data, 60000, ['perfiles']);
    return data;
  }

  /** Un perfil con cuenta de acceso tiene como id el UID (UUID) de Supabase Auth */
  tieneCuentaDeAcceso(perfil: Pick<Perfil, 'id'>): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(perfil.id);
  }

  /**
   * Crea la cuenta de acceso de un docente registrado sin cuenta (fichas antiguas),
   * conservando sus talleres, asistencias registradas y anecdotario.
   * Los docentes nuevos se crean siempre desde Configuración → Usuarios.
   */
  async darAccesoDocente(id: string, username: string, password: string, email: string): Promise<Perfil> {
    const res = await invokeAdminUsuarios({ action: 'grant_access', id, username, password, email });
    if (!res.perfil) throw new Error('No se recibió el perfil del docente.');
    syncStore.applyRemote(STORAGE_KEYS.PERFILES, res.perfil as unknown as Record<string, unknown>, res.idAnterior);

    // Reflejar en memoria los talleres reasignados (los demás dispositivos lo reciben por realtime)
    const talleres = this.getGrupos()
      .filter((g) => g.profesor_id === id)
      .map((g) => ({ ...g, profesor_id: res.perfil!.id }));
    talleres.forEach((g) => syncStore.applyRemote(STORAGE_KEYS.GRUPOS, g as unknown as Record<string, unknown>));

    cacheService.invalidateByTag('perfiles');
    cacheService.invalidateByTag('grupos');
    cacheService.invalidateByTag('anecdotario');
    notifyDataChange();
    return res.perfil;
  }

  /**
   * Actualiza los datos de un docente / perfil registrado (sin tocar la cuenta de acceso)
   */
  actualizarProfesor(id: string, data: Partial<Perfil>): Perfil {
    const perfiles = this.getPerfiles();
    const index = perfiles.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Docente con ID ${id} no encontrado.`);
    }

    const updatedProf: Perfil = {
      ...perfiles[index],
      ...data,
      id,
    };

    perfiles[index] = updatedProf;
    this.write(STORAGE_KEYS.PERFILES, perfiles);
    cacheService.invalidateByTag('perfiles');
    notifyDataChange();
    return updatedProf;
  }

  /**
   * Crea un usuario con cuenta de acceso (Supabase Auth) y su perfil con rol.
   * Requiere la Edge Function `admin-usuarios` y que quien llama sea ADMIN.
   */
  async crearUsuario(
    usuarioData: Omit<Perfil, 'id' | 'creado_en'>,
    password: string
  ): Promise<Perfil> {
    const { perfil } = await invokeAdminUsuarios({
      action: 'create',
      perfil: { ...usuarioData, activo: usuarioData.activo ?? true },
      password,
    });
    if (!perfil) throw new Error('No se recibió el perfil creado.');
    syncStore.applyRemote(STORAGE_KEYS.PERFILES, perfil as unknown as Record<string, unknown>);
    cacheService.invalidateByTag('perfiles');
    notifyDataChange();
    return perfil;
  }

  /**
   * Actualiza un perfil y, si se indica, el correo/contraseña de su cuenta de acceso.
   */
  async actualizarPerfil(id: string, data: Partial<Perfil>, nuevaPassword?: string): Promise<Perfil> {
    const { perfil } = await invokeAdminUsuarios({
      action: 'update',
      id,
      perfil: data,
      password: nuevaPassword || undefined,
    });
    if (!perfil) throw new Error('No se recibió el perfil actualizado.');
    syncStore.applyRemote(STORAGE_KEYS.PERFILES, perfil as unknown as Record<string, unknown>);
    cacheService.invalidateByTag('perfiles');
    notifyDataChange();
    return perfil;
  }

  /**
   * Elimina un usuario y su cuenta de acceso (excepto el último administrador)
   */
  async eliminarPerfil(id: string): Promise<boolean> {
    const perfiles = this.getPerfiles();
    const toDelete = perfiles.find((p) => p.id === id);
    if (!toDelete) return false;

    if (toDelete.rol === 'ADMIN') {
      const adminCount = perfiles.filter((p) => p.rol === 'ADMIN').length;
      if (adminCount <= 1) {
        throw new Error('No es posible eliminar el único Administrador del sistema.');
      }
    }

    await invokeAdminUsuarios({ action: 'delete', id });
    syncStore.applyRemote(STORAGE_KEYS.PERFILES, null, id);
    cacheService.invalidateByTag('perfiles');
    notifyDataChange();
    return true;
  }

  // --- SALONES (catálogo de aulas; grupos.aula guarda el nombre) ---

  getSalones(): Salon[] {
    const cached = cacheService.get<Salon[]>('salones_all');
    if (cached) return cached;
    const data = this.read<Salon[]>(STORAGE_KEYS.SALONES, [])
      .map((s) => ({ ...s, activo: s.activo !== false }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    cacheService.set('salones_all', data, 60000, ['salones']);
    return data;
  }

  /** Talleres que usan un salón (comparación por nombre, sin distinguir mayúsculas) */
  getGruposPorSalon(nombreSalon: string): Grupo[] {
    const clave = nombreSalon.trim().toLowerCase();
    return this.getGrupos().filter((g) => (g.aula || '').trim().toLowerCase() === clave);
  }

  private validarDatosSalon(datos: Partial<Salon>, excluirId?: string): void {
    if (datos.nombre !== undefined) {
      const nombre = datos.nombre.trim();
      if (!nombre) throw new Error('El nombre del salón es obligatorio.');
      const duplicado = this.getSalones().some(
        (s) => s.id !== excluirId && s.nombre.trim().toLowerCase() === nombre.toLowerCase()
      );
      if (duplicado) throw new Error(`Ya existe un salón llamado "${nombre}".`);
    }
    if (datos.capacidad !== undefined && datos.capacidad !== null) {
      if (!Number.isInteger(datos.capacidad) || datos.capacidad <= 0) {
        throw new Error('La capacidad debe ser un número entero mayor que 0.');
      }
    }
  }

  crearSalon(datos: Pick<Salon, 'nombre'> & Partial<Pick<Salon, 'ubicacion' | 'capacidad' | 'activo'>>): Salon {
    this.validarDatosSalon(datos);
    const nuevo: Salon = {
      id: `sal-${nuevoId()}`,
      nombre: datos.nombre.trim(),
      ubicacion: datos.ubicacion?.trim() || undefined,
      capacidad: datos.capacidad || undefined,
      activo: datos.activo ?? true,
      creado_en: new Date().toISOString(),
    };
    this.write(STORAGE_KEYS.SALONES, [nuevo]);
    cacheService.invalidateByTag('salones');
    notifyDataChange();
    return nuevo;
  }

  /** Actualiza un salón; si cambia el nombre, actualiza el aula de los talleres que lo usan */
  actualizarSalon(id: string, datos: Partial<Omit<Salon, 'id' | 'creado_en'>>): Salon {
    const actual = this.getSalones().find((s) => s.id === id);
    if (!actual) throw new Error('Salón no encontrado.');
    this.validarDatosSalon(datos, id);

    const actualizado: Salon = {
      ...actual,
      ...datos,
      nombre: datos.nombre !== undefined ? datos.nombre.trim() : actual.nombre,
      ubicacion: datos.ubicacion !== undefined ? datos.ubicacion.trim() || undefined : actual.ubicacion,
      id,
    };
    this.write(STORAGE_KEYS.SALONES, [actualizado]);

    if (actualizado.nombre !== actual.nombre) {
      const afectados = this.getGruposPorSalon(actual.nombre).map((g) => ({ ...g, aula: actualizado.nombre }));
      if (afectados.length > 0) {
        this.write(STORAGE_KEYS.GRUPOS, afectados);
        cacheService.invalidateByTag('grupos');
      }
    }

    cacheService.invalidateByTag('salones');
    notifyDataChange();
    return actualizado;
  }

  /** Elimina un salón que no esté asignado a ningún taller */
  eliminarSalon(id: string): void {
    const salon = this.getSalones().find((s) => s.id === id);
    if (!salon) return;
    const enUso = this.getGruposPorSalon(salon.nombre);
    if (enUso.length > 0) {
      throw new Error(
        `No se puede eliminar "${salon.nombre}" porque lo usa${enUso.length > 1 ? 'n' : ''}: ${enUso
          .map((g) => g.nombre)
          .join(', ')}. Puedes desactivarlo en su lugar.`
      );
    }
    this.remove(STORAGE_KEYS.SALONES, [id]);
    cacheService.invalidateByTag('salones');
    notifyDataChange();
  }

  // --- GRADOS (catálogo; estudiantes.grado y matriculas.grado guardan el nombre) ---

  getGrados(): Grado[] {
    const cached = cacheService.get<Grado[]>('grados_all');
    if (cached) return cached;
    const data = this.read<Grado[]>(STORAGE_KEYS.GRADOS, [])
      .map((g) => ({ ...g, activo: g.activo !== false, orden: Number(g.orden) || 0 }))
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
    cacheService.set('grados_all', data, 60000, ['grados']);
    return data;
  }

  /** Cuántos alumnos y matrículas usan un grado (por nombre, sin distinguir mayúsculas) */
  contarUsoGrado(nombre: string): { estudiantes: number; matriculas: number } {
    const clave = nombre.trim().toLowerCase();
    const igual = (g?: string) => (g || '').trim().toLowerCase() === clave;
    return {
      estudiantes: this.read<Estudiante[]>(STORAGE_KEYS.ESTUDIANTES, []).filter((e) => igual(e.grado)).length,
      matriculas: this.read<SolicitudMatricula[]>(STORAGE_KEYS.MATRICULAS, []).filter((m) => igual(m.grado)).length,
    };
  }

  private validarNombreGrado(nombre: string, excluirId?: string): string {
    const limpio = nombre.trim();
    if (!limpio) throw new Error('El nombre del grado es obligatorio.');
    if (limpio.length > 60) throw new Error('El nombre del grado no puede superar los 60 caracteres.');
    const duplicado = this.getGrados().some(
      (g) => g.id !== excluirId && g.nombre.trim().toLowerCase() === limpio.toLowerCase()
    );
    if (duplicado) throw new Error(`Ya existe un grado llamado "${limpio}".`);
    return limpio;
  }

  /** Crea un grado al final de la lista */
  crearGrado(nombre: string): Grado {
    const grados = this.getGrados();
    const nuevo: Grado = {
      id: `grd-${nuevoId()}`,
      nombre: this.validarNombreGrado(nombre),
      orden: grados.reduce((max, g) => Math.max(max, g.orden), 0) + 1,
      activo: true,
      creado_en: new Date().toISOString(),
    };
    this.write(STORAGE_KEYS.GRADOS, [nuevo]);
    cacheService.invalidateByTag('grados');
    notifyDataChange();
    return nuevo;
  }

  /** Actualiza un grado; si cambia el nombre, lo propaga a los alumnos y matrículas que lo usan */
  actualizarGrado(id: string, datos: Partial<Pick<Grado, 'nombre' | 'activo'>>): Grado {
    const actual = this.getGrados().find((g) => g.id === id);
    if (!actual) throw new Error('Grado no encontrado.');
    const nombre = datos.nombre !== undefined ? this.validarNombreGrado(datos.nombre, id) : actual.nombre;
    const actualizado: Grado = { ...actual, ...datos, nombre, id };
    this.write(STORAGE_KEYS.GRADOS, [actualizado]);

    if (nombre !== actual.nombre) {
      const clave = actual.nombre.trim().toLowerCase();
      const igual = (g?: string) => (g || '').trim().toLowerCase() === clave;
      const alumnos = this.read<Estudiante[]>(STORAGE_KEYS.ESTUDIANTES, [])
        .filter((e) => igual(e.grado))
        .map((e) => ({ ...e, grado: nombre }));
      if (alumnos.length > 0) this.write(STORAGE_KEYS.ESTUDIANTES, alumnos);
      const solicitudes = this.read<SolicitudMatricula[]>(STORAGE_KEYS.MATRICULAS, [])
        .filter((m) => igual(m.grado))
        .map((m) => ({ ...m, grado: nombre }));
      if (solicitudes.length > 0) this.write(STORAGE_KEYS.MATRICULAS, solicitudes);
      cacheService.invalidateByTag('estudiantes');
      cacheService.invalidateByTag('matriculas');
    }

    cacheService.invalidateByTag('grados');
    notifyDataChange();
    return actualizado;
  }

  /** Sube (-1) o baja (+1) un grado en la lista, intercambiando su orden con el vecino */
  moverGrado(id: string, direccion: -1 | 1): void {
    const grados = this.getGrados();
    const i = grados.findIndex((g) => g.id === id);
    const j = i + direccion;
    if (i < 0 || j < 0 || j >= grados.length) return;
    // Renumerar toda la lista evita empates de orden heredados de la semilla
    const reordenados = [...grados];
    [reordenados[i], reordenados[j]] = [reordenados[j], reordenados[i]];
    const cambios = reordenados
      .map((g, idx) => ({ ...g, orden: idx + 1 }))
      .filter((g) => g.orden !== grados.find((x) => x.id === g.id)!.orden);
    if (cambios.length === 0) return;
    this.write(STORAGE_KEYS.GRADOS, cambios);
    cacheService.invalidateByTag('grados');
    notifyDataChange();
  }

  /** Elimina un grado que ningún alumno ni matrícula use */
  eliminarGrado(id: string): void {
    const grado = this.getGrados().find((g) => g.id === id);
    if (!grado) return;
    const uso = this.contarUsoGrado(grado.nombre);
    if (uso.estudiantes + uso.matriculas > 0) {
      throw new Error(
        `No se puede eliminar "${grado.nombre}" porque lo usan ${uso.estudiantes} alumno(s) y ${uso.matriculas} matrícula(s). Puedes desactivarlo en su lugar.`
      );
    }
    this.remove(STORAGE_KEYS.GRADOS, [id]);
    cacheService.invalidateByTag('grados');
    notifyDataChange();
  }

  /**
   * Impide asignar un salón ocupado por otro taller en días/horario/ciclo coincidentes.
   * Reutiliza la detección de choques de horario entre talleres.
   */
  verificarChoqueSalon(grupo: Grupo): void {
    const aula = (grupo.aula || '').trim();
    if (!aula) return;
    // Solo se valida contra salones del catálogo (no contra textos genéricos como "Taller Principal")
    const esSalonCatalogo = this.getSalones().some((s) => s.nombre.trim().toLowerCase() === aula.toLowerCase());
    if (!esSalonCatalogo) return;
    for (const otro of this.getGruposPorSalon(aula)) {
      if (otro.id === grupo.id) continue;
      const choque = this.sonTalleresEnConflicto(grupo, otro);
      if (choque.tieneConflicto) {
        throw new Error(
          `El salón "${aula}" ya está ocupado en ese horario. ${choque.motivo || `Lo usa "${otro.nombre}".`}`
        );
      }
    }
  }

  /**
   * Impide que un docente tenga dos talleres que se crucen en ciclo, días y horario.
   */
  verificarChoqueDocente(grupo: Grupo): void {
    if (!grupo.profesor_id) return;
    const otros = this.getGrupos().filter((g) => g.id !== grupo.id && g.profesor_id === grupo.profesor_id);
    for (const otro of otros) {
      const choque = this.sonTalleresEnConflicto(grupo, otro);
      if (choque.tieneConflicto) {
        const prof = this.getPerfiles().find((p) => p.id === grupo.profesor_id);
        const nombre = prof ? `${prof.nombre} ${prof.apellido}` : 'El docente';
        throw new Error(`${nombre} ya tiene un taller en ese horario. ${choque.motivo || `Choca con "${otro.nombre}".`}`);
      }
    }
  }

  /** Asigna (o quita, con profesorId = '') el docente de un taller, con todas las validaciones */
  asignarTallerADocente(grupoId: string, profesorId: string): Grupo {
    return this.actualizarGrupo(grupoId, { profesor_id: profesorId }).grupo;
  }

  // --- ANECDOTARIO (expediente de anotaciones por estudiante) ---
  // RLS: el docente solo descarga sus propias anotaciones; ADMIN ve todas.

  getAnecdotario(estudianteId?: string): Anotacion[] {
    let data = cacheService.get<Anotacion[]>('anecdotario_all');
    if (!data) {
      data = this.read<Anotacion[]>(STORAGE_KEYS.ANECDOTARIO, []).sort((a, b) =>
        b.creado_en.localeCompare(a.creado_en)
      );
      cacheService.set('anecdotario_all', data, 60000, ['anecdotario']);
    }
    return estudianteId ? data.filter((a) => a.estudiante_id === estudianteId) : data;
  }

  /** Cantidad de anotaciones visibles por estudiante (para contadores) */
  contarAnotacionesPorEstudiante(): Map<string, number> {
    const conteo = new Map<string, number>();
    this.getAnecdotario().forEach((a) => conteo.set(a.estudiante_id, (conteo.get(a.estudiante_id) || 0) + 1));
    return conteo;
  }

  agregarAnotacion(
    datos: Pick<Anotacion, 'estudiante_id' | 'tipo' | 'descripcion'> & { grupo_id?: string; sesion_id?: string },
    autor: Perfil
  ): Anotacion {
    const descripcion = datos.descripcion.trim();
    if (!descripcion) throw new Error('Escribe el contenido de la anotación.');
    if (descripcion.length > 2000) throw new Error('La anotación no puede superar los 2000 caracteres.');
    if (autor.rol !== 'ADMIN' && autor.rol !== 'PROFESOR') {
      throw new Error('Solo docentes y Dirección pueden escribir en el anecdotario.');
    }

    const nueva: Anotacion = {
      id: `anec-${nuevoId()}`,
      estudiante_id: datos.estudiante_id,
      grupo_id: datos.grupo_id,
      sesion_id: datos.sesion_id,
      autor_id: autor.id,
      autor_nombre: `${autor.nombre} ${autor.apellido}`.trim(),
      tipo: datos.tipo,
      descripcion,
      creado_en: new Date().toISOString(),
    };

    this.write(STORAGE_KEYS.ANECDOTARIO, [nueva]);
    cacheService.invalidateByTag('anecdotario');
    notifyDataChange();
    return nueva;
  }

  /**
   * Corrige el tipo y/o la descripción de una anotación (solo ADMIN; la RLS y los
   * privilegios por columna lo imponen en la base de datos). Autor, alumno y fecha no cambian.
   */
  editarAnotacion(id: string, datos: Pick<Anotacion, 'tipo' | 'descripcion'>, editor: Perfil): void {
    if (editor.rol !== 'ADMIN') throw new Error('Solo Dirección puede editar anotaciones del anecdotario.');
    const descripcion = datos.descripcion.trim();
    if (!descripcion) throw new Error('Escribe el contenido de la anotación.');
    if (descripcion.length > 2000) throw new Error('La anotación no puede superar los 2000 caracteres.');
    const actual = this.getAnecdotario().find((a) => a.id === id);
    if (!actual) throw new Error('La anotación ya no existe.');
    if (actual.tipo === datos.tipo && actual.descripcion === descripcion) return;

    syncStore.update(STORAGE_KEYS.ANECDOTARIO, id, {
      tipo: datos.tipo,
      descripcion,
      editado_en: new Date().toISOString(),
      editado_por_nombre: `${editor.nombre} ${editor.apellido}`.trim(),
    });
    cacheService.invalidateByTag('anecdotario');
    notifyDataChange();
  }

  /** Elimina una anotación errónea (solo ADMIN; la RLS lo impone en la base de datos) */
  eliminarAnotacion(id: string): void {
    this.remove(STORAGE_KEYS.ANECDOTARIO, [id]);
    cacheService.invalidateByTag('anecdotario');
    notifyDataChange();
  }

  // --- MATRÍCULAS Y VALIDACIÓN DE CAJA ---
  getSolicitudesMatricula(): SolicitudMatricula[] {
    const data = this.read<SolicitudMatricula[]>(STORAGE_KEYS.MATRICULAS, []);
    const normalized = data.map((s) => ({
      ...s,
      grado: s.grado
        ? s.grado.replace(/ Primaria| Secundaria/gi, '').replace(' Año', ' Grado')
        : this.getGrados().find((g) => g.activo)?.nombre ?? '',
    }));
    return normalized.sort((a, b) => b.fecha_solicitud.localeCompare(a.fecha_solicitud));
  }

  getSolicitudMatriculaById(id: string): SolicitudMatricula | undefined {
    return this.getSolicitudesMatricula().find((m) => m.id === id);
  }

  crearSolicitudMatricula(
    datos: Omit<
      SolicitudMatricula,
      | 'id'
      | 'codigo_solicitud'
      | 'fecha_solicitud'
      | 'estado'
      | 'validado_datos'
      | 'validado_contrato'
      | 'solvente'
    >
  ): SolicitudMatricula {
    const grupo = this.getGrupoById(datos.grupo_id);
    if (!grupo) {
      throw new Error('El taller extracurricular seleccionado no existe.');
    }

    // Verificar si el alumno ya existe en el sistema y si presenta colisión de horario
    const existingStudent = this.getEstudiantes().find(
      (e) => e.matricula.trim().toUpperCase() === datos.codigo_alumno.trim().toUpperCase()
    );

    if (existingStudent) {
      const conflicto = this.verificarConflictoHorario(existingStudent.id, grupo);
      if (conflicto.tieneConflicto) {
        throw new Error(
          `Conflicto de horario: El alumno ${existingStudent.nombre} ${existingStudent.apellido} ya cursa "${conflicto.grupoConflictivo?.nombre}" que coincide en días y horarios con este taller. ${conflicto.motivo}`
        );
      }
    }

    const count = this.getSolicitudesMatricula().length + 1;
    const codigo_solicitud = `MAT-2026-${String(count).padStart(3, '0')}`;

    const nueva: SolicitudMatricula = {
      ...datos,
      id: `mat-${nuevoId()}`,
      codigo_solicitud,
      tipo_tramite: 'NUEVA_MATRICULA',
      fecha_solicitud: new Date().toISOString(),
      estado: 'PENDIENTE_CAJA',
      validado_datos: false,
      validado_contrato: datos.contrato_firmado,
      solvente: false,
    };

    const lista = this.getSolicitudesMatricula();
    lista.unshift(nueva);
    this.write(STORAGE_KEYS.MATRICULAS, lista);
    return nueva;
  }

  /**
   * Registra una solicitud de Renovación Anual de Matrícula y Contrato digital.
   * Actualiza los datos del alumno y tutor, y envía el expediente a Ventanilla de Caja
   * en estado PENDIENTE_CAJA para que Caja verifique el arancel, declare solvente el pago
   * y dé formalmente de alta al estudiante en el ciclo lectivo (siguiendo el mismo flujo de matrícula inicial).
   */
  crearSolicitudRenovacion(datos: {
    estudiante_id: string;
    ciclo: string;
    codigo_alumno: string;
    nombre_alumno: string;
    apellido_alumno: string;
    edad?: number;
    grado: string;
    aula_regular: string;
    tutor_nombre: string;
    tutor_email: string;
    tutor_telefono: string;
    tutor_parentesco?: string;
    tutor_cedula?: string;
    contrato_texto: string;
    firma_digital_url: string;
    firmante_nombre: string;
    monto_arancel?: number;
    pago_inmediato?: {
      numero_recibo_caja: string;
      monto_arancel: number;
      metodo_pago: string;
      cajero_nombre: string;
      cajero_observaciones?: string;
    };
  }): { solicitud: SolicitudMatricula; estudiante: Estudiante } {
    const estudiante = this.getEstudiantes().find((e) => e.id === datos.estudiante_id);
    if (!estudiante) {
      throw new Error(`Estudiante con ID ${datos.estudiante_id} no encontrado.`);
    }

    // 1. Resolver o actualizar tutor
    let tutor = this.getTutores().find((t) => t.id === estudiante.tutor_id);
    if (tutor) {
      tutor = this.actualizarTutor(tutor.id, {
        nombre: datos.tutor_nombre.trim(),
        email: datos.tutor_email.trim(),
        telefono: datos.tutor_telefono.trim(),
        parentesco: datos.tutor_parentesco?.trim() || tutor.parentesco,
      });
    } else {
      tutor = this.agregarTutor({
        nombre: datos.tutor_nombre.trim(),
        email: datos.tutor_email.trim(),
        telefono: datos.tutor_telefono.trim(),
        parentesco: datos.tutor_parentesco?.trim() || 'Tutor Legal',
      });
    }

    // 2. Resolver taller del estudiante
    const talleresEstudiante = this.getGruposByEstudiante(estudiante.id);
    const grupo = talleresEstudiante[0] || this.getGrupos()[0];
    if (!grupo) {
      throw new Error('No hay talleres disponibles para asociar a la renovación.');
    }

    const count = this.getSolicitudesMatricula().filter((s) => s.tipo_tramite === 'RENOVACION_ANUAL').length + 1;
    const codigo_solicitud = `REN-${datos.ciclo}-${String(count).padStart(3, '0')}`;
    const timestampActual = new Date().toISOString();

    const pagoInmediato = datos.pago_inmediato;
    const estaSolvente = !!(pagoInmediato && pagoInmediato.numero_recibo_caja.trim());

    // 3. Crear solicitud de matrícula de tipo RENOVACION_ANUAL en PENDIENTE_CAJA
    const nuevaSolicitud: SolicitudMatricula = {
      id: `ren-${nuevoId()}`,
      codigo_solicitud,
      tipo_tramite: 'RENOVACION_ANUAL',
      estudiante_id: estudiante.id,
      ciclo_academico: datos.ciclo,
      codigo_alumno: estudiante.matricula,
      nombre_alumno: datos.nombre_alumno.trim(),
      apellido_alumno: datos.apellido_alumno.trim(),
      edad: datos.edad ?? estudiante.edad ?? 11,
      grado: datos.grado,
      aula_regular: datos.aula_regular.trim(),
      tutor_nombre: datos.tutor_nombre.trim(),
      tutor_email: datos.tutor_email.trim(),
      tutor_telefono: datos.tutor_telefono.trim(),
      tutor_parentesco: datos.tutor_parentesco?.trim() || 'Tutor Legal',
      tutor_cedula: datos.tutor_cedula?.trim() || 'N/A',
      grupo_id: grupo.id,
      grupo_nombre: grupo.nombre,
      fecha_solicitud: timestampActual,
      contrato_texto: datos.contrato_texto,
      contrato_firmado: true,
      firma_digital_url: datos.firma_digital_url,
      fecha_firma: timestampActual,
      firmante_nombre: datos.firmante_nombre.trim(),
      estado: estaSolvente ? 'ACEPTADA' : 'PENDIENTE_CAJA',
      validado_datos: estaSolvente,
      validado_contrato: true,
      solvente: estaSolvente,
      numero_recibo_caja: pagoInmediato?.numero_recibo_caja.trim(),
      // Renovación: mismo arancel del taller (costo propio o general de Configuración)
      monto_arancel:
        pagoInmediato?.monto_arancel ||
        datos.monto_arancel ||
        (Number(grupo.costo) > 0 ? Number(grupo.costo) : Number(this.getConfiguracion().arancel_taller) || 1200),
      metodo_pago: pagoInmediato?.metodo_pago || 'Efectivo',
      cajero_nombre: pagoInmediato?.cajero_nombre,
      cajero_observaciones: pagoInmediato?.cajero_observaciones,
      fecha_pago: estaSolvente ? timestampActual : undefined,
      fecha_aceptacion: estaSolvente ? timestampActual : undefined,
      estudiante_id_creado: estudiante.id,
    };

    const lista = this.getSolicitudesMatricula();
    lista.unshift(nuevaSolicitud);
    this.write(STORAGE_KEYS.MATRICULAS, lista);

    // 4. Actualizar estudiante:
    // Si ya pagó en caja de inmediato (pagoInmediato), queda ACTIVO, solvente y con contrato vigente.
    // Si NO ha pagado, queda en PENDIENTE_RENOVACION (pendiente de pago en caja) para que Caja dé el alta oficial.
    const estudianteActualizado = this.actualizarEstudiante(estudiante.id, {
      nombre: datos.nombre_alumno.trim(),
      apellido: datos.apellido_alumno.trim(),
      edad: datos.edad ?? estudiante.edad ?? 11,
      grado: datos.grado,
      aula_regular: datos.aula_regular.trim(),
      tutor_id: tutor.id,
      ciclo_actual: datos.ciclo,
      contrato_texto: datos.contrato_texto,
      firma_digital_url: datos.firma_digital_url,
      firmante_nombre: datos.firmante_nombre.trim(),
      fecha_firma: timestampActual,
      fecha_renovacion_contrato: timestampActual,
      matricula_solicitud_id: nuevaSolicitud.id,
      estado: estaSolvente ? 'ACTIVO' : 'PENDIENTE_RENOVACION',
      solvente: estaSolvente,
      contrato_vigente: estaSolvente,
      estado_pago_anual: estaSolvente ? 'AL_DIA' : 'PENDIENTE',
      numero_recibo_anual: pagoInmediato?.numero_recibo_caja.trim() || undefined,
      numero_recibo_caja: pagoInmediato?.numero_recibo_caja.trim() || estudiante.numero_recibo_caja,
      fecha_ultimo_pago_anual: estaSolvente ? timestampActual : estudiante.fecha_ultimo_pago_anual,
    });

    notifyDataChange();
    return { solicitud: nuevaSolicitud, estudiante: estudianteActualizado };
  }

  validarChecklistCaja(
    id: string,
    validadoDatos: boolean,
    validadoContrato: boolean,
    observaciones?: string
  ): SolicitudMatricula {
    const lista = this.getSolicitudesMatricula();
    const index = lista.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error('Solicitud de matrícula no encontrada.');
    }

    const actual = lista[index];
    const updated: SolicitudMatricula = {
      ...actual,
      validado_datos: validadoDatos,
      validado_contrato: validadoContrato,
      cajero_observaciones: observaciones !== undefined ? observaciones : actual.cajero_observaciones,
    };

    lista[index] = updated;
    this.write(STORAGE_KEYS.MATRICULAS, lista);
    return updated;
  }

  /**
   * La matrícula se formaliza en el momento en que Caja procesa el pago contable.
   * Asienta el comprobante/recibo contable, valida la solvencia, matricula al estudiante en el taller
   * y formaliza su expediente en las listas oficiales en un único paso.
   */
  procesarPagoYFormalizarMatricula(
    id: string,
    pagoData: {
      numero_recibo_caja: string;
      monto_arancel: number;
      metodo_pago: string;
      cajero_nombre: string;
      cajero_observaciones?: string;
    }
  ): { solicitud: SolicitudMatricula; estudiante: Estudiante; grupo: Grupo } {
    if (!pagoData.numero_recibo_caja.trim()) {
      throw new Error('Debe proporcionar el número de recibo o comprobante del sistema contable.');
    }

    const lista = this.getSolicitudesMatricula();
    const index = lista.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error('Solicitud de matrícula no encontrada.');
    }

    const solicitud = lista[index];
    const grupo = this.getGrupoById(solicitud.grupo_id);
    if (!grupo) {
      throw new Error('El taller extracurricular seleccionado ya no está disponible.');
    }

    // 1. Resolver o Crear Tutor
    let tutor = this.getTutores().find(
      (t) =>
        t.email.toLowerCase() === solicitud.tutor_email.toLowerCase() ||
        t.nombre.toLowerCase() === solicitud.tutor_nombre.toLowerCase()
    );

    if (!tutor) {
      tutor = this.agregarTutor({
        nombre: solicitud.tutor_nombre,
        email: solicitud.tutor_email,
        telefono: solicitud.tutor_telefono,
        parentesco: solicitud.tutor_parentesco || 'Tutor Legal',
      });
    }

    // 2. Resolver o Crear Estudiante
    let estudiante = this.getEstudiantes().find(
      (e) => e.matricula.trim().toUpperCase() === solicitud.codigo_alumno.trim().toUpperCase()
    );

    const todosEstudiantes = this.getEstudiantes();
    const timestampActual = new Date().toISOString();

    if (estudiante) {
      estudiante = {
        ...estudiante,
        nombre: solicitud.nombre_alumno,
        apellido: solicitud.apellido_alumno,
        edad: solicitud.edad,
        grado: solicitud.grado,
        aula_regular: solicitud.aula_regular,
        solvente: true,
        numero_recibo_caja: pagoData.numero_recibo_caja.trim(),
        numero_recibo_anual: pagoData.numero_recibo_caja.trim(),
        matricula_solicitud_id: solicitud.id,
        // Dar de alta al alumno al registrar la solvencia del pago en caja
        estado: 'ACTIVO',
        contrato_vigente: true,
        estado_pago_anual: 'AL_DIA',
        ciclo_actual: solicitud.ciclo_academico || estudiante.ciclo_actual || '2026',
        fecha_renovacion_contrato: timestampActual,
        fecha_ultimo_pago_anual: timestampActual,
        fecha_reactivacion: timestampActual,
        motivo_baja: undefined,
        contrato_texto: solicitud.contrato_texto || estudiante.contrato_texto,
        firma_digital_url: solicitud.firma_digital_url || estudiante.firma_digital_url,
        fecha_firma: solicitud.fecha_firma || estudiante.fecha_firma || timestampActual,
        firmante_nombre: solicitud.firmante_nombre || estudiante.firmante_nombre,
      };
      const estIndex = todosEstudiantes.findIndex((e) => e.id === estudiante?.id);
      if (estIndex !== -1) {
        todosEstudiantes[estIndex] = estudiante;
      }
      this.write(STORAGE_KEYS.ESTUDIANTES, todosEstudiantes);
    } else {
      estudiante = {
        id: `est-${nuevoId()}`,
        matricula: solicitud.codigo_alumno.trim().toUpperCase(),
        nombre: solicitud.nombre_alumno.trim(),
        apellido: solicitud.apellido_alumno.trim(),
        edad: solicitud.edad,
        grado: solicitud.grado,
        aula_regular: solicitud.aula_regular,
        tutor_id: tutor.id,
        solvente: true,
        numero_recibo_caja: pagoData.numero_recibo_caja.trim(),
        numero_recibo_anual: pagoData.numero_recibo_caja.trim(),
        matricula_solicitud_id: solicitud.id,
        creado_en: timestampActual,
        estado: 'ACTIVO',
        contrato_vigente: true,
        estado_pago_anual: 'AL_DIA',
        ciclo_actual: solicitud.ciclo_academico || '2026',
        fecha_ultimo_pago_anual: timestampActual,
        fecha_renovacion_contrato: timestampActual,
        contrato_texto: solicitud.contrato_texto,
        firma_digital_url: solicitud.firma_digital_url,
        fecha_firma: solicitud.fecha_firma || timestampActual,
        firmante_nombre: solicitud.firmante_nombre,
      };
      todosEstudiantes.push(estudiante);
      this.write(STORAGE_KEYS.ESTUDIANTES, todosEstudiantes);
    }

    cacheService.invalidateByTag('estudiantes');

    // 3. Inscribir formalmente al estudiante en el taller
    this.inscribirEstudianteEnGrupo(estudiante.id, grupo.id);

    // 4. Actualizar solicitud: Asentar pago contable y formalizar en estado ACEPTADA
    const updatedSolicitud: SolicitudMatricula = {
      ...solicitud,
      estado: 'ACEPTADA',
      solvente: true,
      validado_datos: true,
      validado_contrato: true,
      numero_recibo_caja: pagoData.numero_recibo_caja.trim(),
      monto_arancel: pagoData.monto_arancel,
      metodo_pago: pagoData.metodo_pago,
      cajero_nombre: pagoData.cajero_nombre.trim() || 'Encargada de Caja',
      cajero_observaciones: pagoData.cajero_observaciones || solicitud.cajero_observaciones,
      fecha_pago: timestampActual,
      fecha_aceptacion: timestampActual,
      estudiante_id_creado: estudiante.id,
    };

    lista[index] = updatedSolicitud;
    this.write(STORAGE_KEYS.MATRICULAS, lista);

    return { solicitud: updatedSolicitud, estudiante, grupo };
  }

  marcarSolventeCaja(
    id: string,
    pagoData: {
      numero_recibo_caja: string;
      monto_arancel: number;
      metodo_pago: string;
      cajero_nombre: string;
      cajero_observaciones?: string;
    }
  ): SolicitudMatricula {
    if (!pagoData.numero_recibo_caja.trim()) {
      throw new Error('Debe proporcionar el número de recibo o comprobante del sistema contable.');
    }

    const lista = this.getSolicitudesMatricula();
    const index = lista.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error('Solicitud de matrícula no encontrada.');
    }

    const actual = lista[index];
    const updated: SolicitudMatricula = {
      ...actual,
      estado: 'SOLVENTE',
      solvente: true,
      validado_datos: true,
      validado_contrato: true,
      numero_recibo_caja: pagoData.numero_recibo_caja.trim(),
      monto_arancel: pagoData.monto_arancel,
      metodo_pago: pagoData.metodo_pago,
      cajero_nombre: pagoData.cajero_nombre.trim() || 'Encargada de Caja',
      cajero_observaciones: pagoData.cajero_observaciones || actual.cajero_observaciones,
      fecha_pago: new Date().toISOString(),
    };

    lista[index] = updated;
    this.write(STORAGE_KEYS.MATRICULAS, lista);
    return updated;
  }

  aceptarMatriculaFinal(
    id: string,
    cajeroOAdmin = 'Administración y Caja'
  ): { solicitud: SolicitudMatricula; estudiante: Estudiante; grupo: Grupo } {
    const lista = this.getSolicitudesMatricula();
    const index = lista.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error('Solicitud de matrícula no encontrada.');
    }

    const solicitud = lista[index];
    if (!solicitud.solvente) {
      throw new Error(
        'El alumno debe estar marcado como SOLVENTE (pago registrado en contabilidad) antes de poder formalizar la matrícula.'
      );
    }

    const grupo = this.getGrupoById(solicitud.grupo_id);
    if (!grupo) {
      throw new Error('El taller extracurricular seleccionado ya no está disponible.');
    }

    // 1. Resolver o Crear Tutor
    let tutor = this.getTutores().find(
      (t) =>
        t.email.toLowerCase() === solicitud.tutor_email.toLowerCase() ||
        t.nombre.toLowerCase() === solicitud.tutor_nombre.toLowerCase()
    );

    if (!tutor) {
      tutor = this.agregarTutor({
        nombre: solicitud.tutor_nombre,
        email: solicitud.tutor_email,
        telefono: solicitud.tutor_telefono,
        parentesco: solicitud.tutor_parentesco || 'Tutor Legal',
      });
    }

    // 2. Resolver o Crear Estudiante
    let estudiante = this.getEstudiantes().find(
      (e) => e.matricula.trim().toUpperCase() === solicitud.codigo_alumno.trim().toUpperCase()
    );

    const todosEstudiantes = this.getEstudiantes();
    if (estudiante) {
      // Actualizar datos del estudiante existente con grado, aula y solvencia
      estudiante = {
        ...estudiante,
        nombre: solicitud.nombre_alumno,
        apellido: solicitud.apellido_alumno,
        edad: solicitud.edad,
        grado: solicitud.grado,
        aula_regular: solicitud.aula_regular,
        solvente: true,
        numero_recibo_caja: solicitud.numero_recibo_caja,
        matricula_solicitud_id: solicitud.id,
      };
      const estIndex = todosEstudiantes.findIndex((e) => e.id === estudiante?.id);
      if (estIndex !== -1) {
        todosEstudiantes[estIndex] = estudiante;
      }
      this.write(STORAGE_KEYS.ESTUDIANTES, todosEstudiantes);
    } else {
      // Crear nuevo estudiante
      estudiante = {
        id: `est-${nuevoId()}`,
        matricula: solicitud.codigo_alumno.trim().toUpperCase(),
        nombre: solicitud.nombre_alumno.trim(),
        apellido: solicitud.apellido_alumno.trim(),
        edad: solicitud.edad,
        grado: solicitud.grado,
        aula_regular: solicitud.aula_regular,
        tutor_id: tutor.id,
        solvente: true,
        numero_recibo_caja: solicitud.numero_recibo_caja,
        matricula_solicitud_id: solicitud.id,
        creado_en: new Date().toISOString(),
      };
      todosEstudiantes.push(estudiante);
      this.write(STORAGE_KEYS.ESTUDIANTES, todosEstudiantes);
    }

    cacheService.invalidateByTag('estudiantes');

    // 3. Inscribir en el taller seleccionado
    this.inscribirEstudianteEnGrupo(estudiante.id, grupo.id);

    // 4. Actualizar solicitud a ACEPTADA
    const updatedSolicitud: SolicitudMatricula = {
      ...solicitud,
      estado: 'ACEPTADA',
      fecha_aceptacion: new Date().toISOString(),
      estudiante_id_creado: estudiante.id,
      cajero_nombre: solicitud.cajero_nombre || cajeroOAdmin,
    };

    lista[index] = updatedSolicitud;
    this.write(STORAGE_KEYS.MATRICULAS, lista);

    return { solicitud: updatedSolicitud, estudiante, grupo };
  }

  rechazarSolicitudMatricula(id: string, motivo: string): SolicitudMatricula {
    const lista = this.getSolicitudesMatricula();
    const index = lista.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error('Solicitud no encontrada.');
    }

    const actual = lista[index];
    const updated: SolicitudMatricula = {
      ...actual,
      estado: 'RECHAZADA',
      cajero_observaciones: motivo || 'Solicitud rechazada por administración/caja.',
    };

    lista[index] = updated;
    this.write(STORAGE_KEYS.MATRICULAS, lista);
    return updated;
  }
}

export const storageService = new StorageService();

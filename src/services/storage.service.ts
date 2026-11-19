import {
  AlertaEstudiante,
  Anotacion,
  Asistencia,
  ConfiguracionSistema,
  CorteBimestral,
  DiaNoLectivo,
  EstadoMesCorte,
  FilaCorteAlumno,
  FilaCorteTaller,
  MatriculaCorte,
  MovimientoInscripcion,
  ResultadoCorte,
  TipoMovimiento,
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
import { fechaLocalISO, fechaPagoLocal } from '../utils/fechas';

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
  DIAS_NO_LECTIVOS: 'aa_dias_no_lectivos',
  CORTES: 'aa_cortes_bimestrales',
  MOVIMIENTOS: 'aa_movimientos_inscripcion',
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
  /** Perfil con sesión iniciada (lo fija auth.service); firma la bitácora de movimientos */
  private perfilActual: Pick<Perfil, 'id' | 'rol'> | null = null;

  setPerfilActual(perfil: Pick<Perfil, 'id' | 'rol'> | null): void {
    this.perfilActual = perfil;
  }

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
    grupoData: Omit<Grupo, 'id' | 'creado_en' | 'fecha_inicio_ciclo' | 'fecha_fin_ciclo'>
  ): { grupo: Grupo; sesionesGeneradas: number } {
    const creado_en = new Date().toISOString();
    const nuevoGrupo: Grupo = {
      ...grupoData,
      // Fechas derivadas de los cortes (las columnas son NOT NULL); el calendario lo definen los cortes
      ...this.rangoCalendario({ creado_en }),
      id: `grp-${nuevoId()}`,
      creado_en,
    };

    this.asegurarCalendarioDeTaller(nuevoGrupo);
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
      // Las fechas no se editan: se derivan de los cortes y de la creación del taller
      ...this.rangoCalendario(anterior),
      id,
      creado_en: anterior.creado_en,
    };

    this.asegurarCalendarioDeTaller(updatedGrupo);
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

  /** Qué se perdería / liberaría al eliminar un taller (solo lectura, para el diálogo de confirmación) */
  resumenEliminacionGrupo(grupoId: string): {
    alumnosInscritos: number;
    sesiones: number;
    sesionesCerradas: number;
    asistencias: number;
    matriculasPendientes: number;
  } {
    const sesiones = this.getSesiones().filter((s) => s.grupo_id === grupoId);
    const idsSesiones = new Set(sesiones.map((s) => s.id));
    return {
      alumnosInscritos: new Set(
        this.getInscripciones().filter((i) => i.grupo_id === grupoId).map((i) => i.estudiante_id)
      ).size,
      sesiones: sesiones.length,
      sesionesCerradas: sesiones.filter((s) => s.cerrada).length,
      asistencias: this.getAsistencias().filter((a) => idsSesiones.has(a.sesion_id)).length,
      matriculasPendientes: this.getSolicitudesMatricula().filter(
        (m) => m.grupo_id === grupoId && m.estado === 'PENDIENTE_CAJA'
      ).length,
    };
  }

  /**
   * Elimina un taller (solo ADMIN). Sus alumnos quedan desinscritos y disponibles para otros
   * talleres (su estado no cambia). Se borran sus sesiones y la asistencia registrada; el
   * anecdotario y las matrículas se conservan. Se borra de hijo a padre para que la memoria
   * local quede coherente sin esperar al realtime de la cascada de la BD.
   */
  eliminarGrupo(grupoId: string): { alumnosLiberados: number; sesionesEliminadas: number; asistenciasEliminadas: number } {
    if (!this.getGrupoById(grupoId)) {
      throw new Error('Taller no encontrado');
    }

    const sesionIds = this.getSesiones()
      .filter((s) => s.grupo_id === grupoId)
      .map((s) => s.id);
    const idsSesiones = new Set(sesionIds);
    const asistenciaIds = this.getAsistencias()
      .filter((a) => idsSesiones.has(a.sesion_id))
      .map((a) => a.id);
    const inscripciones = this.getInscripciones().filter((i) => i.grupo_id === grupoId);
    const alumnosLiberados = new Set(inscripciones.map((i) => i.estudiante_id)).size;

    inscripciones.forEach((i) =>
      this.registrarMovimiento('BAJA_TALLER', i.estudiante_id, grupoId, 'Taller eliminado')
    );
    this.remove(STORAGE_KEYS.ASISTENCIAS, asistenciaIds);
    this.remove(STORAGE_KEYS.SESIONES, sesionIds);
    this.remove(STORAGE_KEYS.INSCRIPCIONES, inscripciones.map((i) => i.id));
    this.remove(STORAGE_KEYS.GRUPOS, [grupoId]);

    ['grupos', 'sesiones', 'inscripciones', 'estudiantes', 'asistencias', 'alertas'].forEach((tag) =>
      cacheService.invalidateByTag(tag)
    );
    notifyDataChange();

    return {
      alumnosLiberados,
      sesionesEliminadas: sesionIds.length,
      asistenciasEliminadas: asistenciaIds.length,
    };
  }

  /** Fecha local (YYYY-MM-DD) en que se creó el taller; hoy si aún no existe */
  private fechaCreacionDe(grupo: Pick<Grupo, 'creado_en'> | { creado_en?: string }): string {
    const d = grupo.creado_en ? new Date(grupo.creado_en) : null;
    return d && !Number.isNaN(d.getTime()) ? fechaLocalISO(d) : fechaLocalISO();
  }

  /**
   * Fechas (YYYY-MM-DD) en que el taller tiene clase: los días de la semana del taller dentro
   * de los cortes (Configuración → Cortes), desde la fecha de creación del taller, sin días no lectivos.
   * Todos los talleres comparten el calendario de cortes.
   */
  private generarFechasSesiones(grupo: Pick<Grupo, 'dias_semana'> & { creado_en?: string }): string[] {
    // Aritmética 100% UTC: el día de la semana y la fecha guardada salen del mismo calendario,
    // sin importar la zona horaria del equipo (antes, en UTC-6 los lunes quedaban como martes).
    const aUTC = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    };
    const desde = this.fechaCreacionDe(grupo);
    const noLectivos = this.getDiasNoLectivos();
    const fechas: string[] = [];
    for (const corte of this.getCortes()) {
      if (corte.fecha_fin < desde) continue;
      const cursor = aUTC(corte.fecha_inicio > desde ? corte.fecha_inicio : desde);
      const fin = aUTC(corte.fecha_fin);
      while (cursor <= fin) {
        // getUTCDay: 0=Domingo ... 6=Sábado → 1=Lunes ... 7=Domingo
        const dayOfWeek = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
        const fecha = cursor.toISOString().slice(0, 10);
        // Feriados y vacaciones (Configuración → Días no lectivos) no generan clase
        if ((grupo.dias_semana || []).includes(dayOfWeek) && !this.diaNoLectivoEn(noLectivos, fecha)) {
          fechas.push(fecha);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return Array.from(new Set(fechas)).sort();
  }

  /**
   * Fechas derivadas que se guardan en grupos.fecha_inicio_ciclo / fecha_fin_ciclo (columnas NOT NULL):
   * desde la creación del taller (o el primer corte, si es posterior) hasta el fin del último corte.
   */
  rangoCalendario(grupo: { creado_en?: string }): { fecha_inicio_ciclo: string; fecha_fin_ciclo: string } {
    const creacion = this.fechaCreacionDe(grupo);
    const cortes = this.getCortes();
    if (cortes.length === 0) return { fecha_inicio_ciclo: creacion, fecha_fin_ciclo: creacion };
    const primero = cortes[0].fecha_inicio;
    const ultimo = cortes.reduce((max, c) => (c.fecha_fin > max ? c.fecha_fin : max), cortes[0].fecha_fin);
    const inicio = primero > creacion ? primero : creacion;
    return { fecha_inicio_ciclo: inicio > ultimo ? ultimo : inicio, fecha_fin_ciclo: ultimo };
  }

  /** Impide guardar un taller sin cortes o que no tendría ninguna clase en ellos */
  private asegurarCalendarioDeTaller(grupo: Pick<Grupo, 'dias_semana'> & { creado_en?: string }): void {
    if (this.getCortes().length === 0) {
      throw new Error('Primero registra los cortes en Configuración → Cortes: las clases de los talleres se generan a partir de ellos.');
    }
    if ((grupo.dias_semana || []).length === 0) {
      throw new Error('Selecciona al menos un día de clase.');
    }
    if (this.generarFechasSesiones(grupo).length === 0) {
      throw new Error('Con esos días el taller no tendría clases en los cortes registrados.');
    }
  }

  /** Vista previa del calendario (para formularios): fechas que tendría el taller con esos días */
  previsualizarSesiones(grupo: { dias_semana: number[]; creado_en?: string }): string[] {
    if (!grupo.dias_semana?.length) return [];
    return this.generarFechasSesiones(grupo);
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

  /**
   * Quita una sesión extraordinaria creada por error. Solo si no está cerrada y no tiene asistencia.
   */
  eliminarSesionExtraordinaria(sesionId: string): void {
    const sesion = this.getSesionById(sesionId);
    if (!sesion) throw new Error('Sesión no encontrada.');
    if (!sesion.extraordinaria) throw new Error('Solo se pueden quitar sesiones extraordinarias.');
    if (sesion.cerrada) throw new Error('La sesión ya está cerrada: no se puede quitar.');
    if (this.getAsistencias().some((a) => a.sesion_id === sesionId)) {
      throw new Error('La sesión ya tiene asistencia registrada: no se puede quitar.');
    }
    this.remove(STORAGE_KEYS.SESIONES, [sesionId]);
    cacheService.invalidateByTag('sesiones');
    cacheService.invalidateByTag('alertas');
    notifyDataChange();
  }

  /** Es día de clase normal del taller: uno de sus días de la semana, dentro de un corte y no lectivo-libre */
  esDiaDeClaseRegular(grupo: Pick<Grupo, 'dias_semana'> & { creado_en?: string }, fecha: string): boolean {
    return this.generarFechasSesiones(grupo).includes(fecha);
  }

  /** La fecha cae dentro de algún corte registrado */
  estaEnAlgunCorte(fecha: string): boolean {
    return this.getCortes().some((c) => c.fecha_inicio <= fecha && fecha <= c.fecha_fin);
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

    // Todos los talleres comparten el calendario de cortes: solo importan días y horas.
    // 1. Días de la semana que coinciden
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
   * Solvencia en Caja: un alumno solo se inscribe en talleres cuando Caja confirmó su pago.
   * AL_DIA y EXENTO (beca) son solventes; una renovación sin pagar o un pago pendiente no.
   */
  estadoSolvencia(est: Estudiante): { solvente: boolean; motivo?: string } {
    if (est.estado === 'PENDIENTE_RENOVACION') {
      return { solvente: false, motivo: 'Renovación pendiente de pago en Caja' };
    }
    if (est.estado_pago_anual === 'EXENTO') return { solvente: true };
    if (est.estado_pago_anual === 'PENDIENTE' || est.solvente === false) {
      return { solvente: false, motivo: 'Pendiente de pago en Caja' };
    }
    return { solvente: true };
  }

  /**
   * Inscribe un estudiante a un taller validando que esté solvente y no tenga colisión de horario
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

    // Solo se inscribe a alumnos solventes: Caja debe haber confirmado el pago
    const estudiante = this.getEstudiantes().find((e) => e.id === estudianteId);
    if (!estudiante) {
      return { success: false, error: 'Alumno no encontrado' };
    }
    const solvencia = this.estadoSolvencia(estudiante);
    if (!solvencia.solvente) {
      return { success: false, error: solvencia.motivo };
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
    this.registrarMovimiento('ALTA_TALLER', estudianteId, grupoId);
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
    if (idsAEliminar.length > 0) this.registrarMovimiento('BAJA_TALLER', estudianteId, grupoId);
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
    if (grupoId) {
      const solvencia = this.estadoSolvencia(est as Estudiante);
      if (!solvencia.solvente) {
        throw new Error(`No se puede inscribir en el taller: ${solvencia.motivo}.`);
      }
    }
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
      this.registrarMovimiento('ALTA_TALLER', nuevo.id, grupoId);
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
    const motivoBaja = motivo.trim() || 'Baja temporal solicitada';
    const actualizado = this.actualizarEstudiante(id, {
      estado: 'BAJA',
      fecha_baja: new Date().toISOString(),
      motivo_baja: motivoBaja,
    });
    this.registrarMovimiento('BAJA_ALUMNO', id, null, motivoBaja);
    return actualizado;
  }

  /**
   * Reactiva o reincorpora a un alumno que estaba de baja para que vuelva a cursos
   */
  reactivarEstudiante(id: string): Estudiante {
    const estabaDeBaja = this.getEstudiantes().find((e) => e.id === id)?.estado === 'BAJA';
    const actualizado = this.actualizarEstudiante(id, {
      estado: 'ACTIVO',
      fecha_reactivacion: new Date().toISOString(),
      motivo_baja: undefined,
    });
    if (estabaDeBaja) this.registrarMovimiento('REACTIVACION_ALUMNO', id);
    return actualizado;
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

  // --- DÍAS NO LECTIVOS (feriados, vacaciones; no generan sesiones) ---

  getDiasNoLectivos(): DiaNoLectivo[] {
    const cached = cacheService.get<DiaNoLectivo[]>('dias_no_lectivos_all');
    if (cached) return cached;
    const data = this.read<DiaNoLectivo[]>(STORAGE_KEYS.DIAS_NO_LECTIVOS, [])
      .map((d) => ({
        ...d,
        fecha_inicio: String(d.fecha_inicio).slice(0, 10),
        fecha_fin: String(d.fecha_fin || d.fecha_inicio).slice(0, 10),
      }))
      .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio) || a.fecha_fin.localeCompare(b.fecha_fin));
    cacheService.set('dias_no_lectivos_all', data, 60000, ['dias_no_lectivos']);
    return data;
  }

  private diaNoLectivoEn(lista: DiaNoLectivo[], fecha: string): DiaNoLectivo | undefined {
    return lista.find((d) => d.fecha_inicio <= fecha && fecha <= d.fecha_fin);
  }

  /** Día no lectivo que cubre una fecha YYYY-MM-DD (o undefined si hay clases ese día) */
  diaNoLectivoDe(fecha: string): DiaNoLectivo | undefined {
    return this.diaNoLectivoEn(this.getDiasNoLectivos(), fecha);
  }

  esDiaNoLectivo(fecha: string): boolean {
    return !!this.diaNoLectivoDe(fecha);
  }

  private validarDiaNoLectivo(datos: Pick<DiaNoLectivo, 'fecha_inicio' | 'fecha_fin' | 'motivo' | 'tipo'>) {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const motivo = (datos.motivo || '').trim();
    if (!motivo) throw new Error('Indica el motivo (por ejemplo: Feriado nacional, Vacaciones de medio año).');
    if (motivo.length > 120) throw new Error('El motivo no puede superar los 120 caracteres.');
    if (!iso.test(datos.fecha_inicio)) throw new Error('Indica una fecha de inicio válida.');
    const fecha_fin = datos.fecha_fin || datos.fecha_inicio;
    if (!iso.test(fecha_fin)) throw new Error('Indica una fecha final válida.');
    if (fecha_fin < datos.fecha_inicio) throw new Error('La fecha final no puede ser anterior a la inicial.');
    const tipo = (['FERIADO', 'VACACIONES', 'OTRO'] as const).includes(datos.tipo) ? datos.tipo : 'OTRO';
    return { fecha_inicio: datos.fecha_inicio, fecha_fin, motivo, tipo };
  }

  /**
   * Vuelve a calcular el calendario de todos los talleres con los cortes y días no lectivos actuales.
   * Agrega las clases que faltan y quita las que quedan fuera de los cortes o caen en días no lectivos,
   * salvo cerradas, con asistencia o extraordinarias (misma regla que reconciliarSesiones).
   * También actualiza las fechas derivadas de cada taller (fecha_inicio_ciclo / fecha_fin_ciclo).
   */
  reaplicarCalendarioATodos(): { sesionesAgregadas: number; sesionesEliminadas: number; sesionesConservadas: number } {
    cacheService.invalidateByTag('dias_no_lectivos');
    cacheService.invalidateByTag('cortes');
    const total = { sesionesAgregadas: 0, sesionesEliminadas: 0, sesionesConservadas: 0 };

    const gruposConFechas = this.getGrupos().filter((g) => {
      const r = this.rangoCalendario(g);
      return String(g.fecha_inicio_ciclo).slice(0, 10) !== r.fecha_inicio_ciclo ||
        String(g.fecha_fin_ciclo).slice(0, 10) !== r.fecha_fin_ciclo;
    }).map((g) => ({ ...g, ...this.rangoCalendario(g) }));
    if (gruposConFechas.length > 0) {
      this.write(STORAGE_KEYS.GRUPOS, gruposConFechas);
      cacheService.invalidateByTag('grupos');
    }

    for (const grupo of this.getGrupos()) {
      const r = this.reconciliarSesiones(grupo);
      total.sesionesAgregadas += r.sesionesAgregadas;
      total.sesionesEliminadas += r.sesionesEliminadas;
      total.sesionesConservadas += r.sesionesConservadas;
    }
    notifyDataChange();
    return total;
  }

  crearDiaNoLectivo(datos: Pick<DiaNoLectivo, 'fecha_inicio' | 'fecha_fin' | 'motivo' | 'tipo'>) {
    const nuevo: DiaNoLectivo = {
      id: `dnl-${nuevoId()}`,
      ...this.validarDiaNoLectivo(datos),
      creado_en: new Date().toISOString(),
    };
    this.write(STORAGE_KEYS.DIAS_NO_LECTIVOS, [nuevo]);
    return { dia: nuevo, ...this.reaplicarCalendarioATodos() };
  }

  actualizarDiaNoLectivo(id: string, datos: Pick<DiaNoLectivo, 'fecha_inicio' | 'fecha_fin' | 'motivo' | 'tipo'>) {
    const actual = this.getDiasNoLectivos().find((d) => d.id === id);
    if (!actual) throw new Error('Día no lectivo no encontrado.');
    const actualizado: DiaNoLectivo = { ...actual, ...this.validarDiaNoLectivo(datos), id };
    this.write(STORAGE_KEYS.DIAS_NO_LECTIVOS, [actualizado]);
    return { dia: actualizado, ...this.reaplicarCalendarioATodos() };
  }

  /** Elimina un día no lectivo; las clases de esas fechas se vuelven a generar */
  eliminarDiaNoLectivo(id: string) {
    this.remove(STORAGE_KEYS.DIAS_NO_LECTIVOS, [id]);
    return this.reaplicarCalendarioATodos();
  }

  /** Feriados de Nicaragua de un año (nacionales, Santo Domingo en Managua y la Gritería) */
  feriadosNicaragua(anio: number): { fecha: string; motivo: string }[] {
    // Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano)
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    const pascua = Date.UTC(anio, mes - 1, dia);
    const menosDias = (n: number) => new Date(pascua - n * 86400000).toISOString().slice(0, 10);
    const fija = (mm: number, dd: number) => `${anio}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;

    return [
      { fecha: fija(1, 1), motivo: 'Año Nuevo' },
      { fecha: menosDias(3), motivo: 'Jueves Santo' },
      { fecha: menosDias(2), motivo: 'Viernes Santo' },
      { fecha: fija(5, 1), motivo: 'Día Internacional del Trabajo' },
      { fecha: fija(5, 30), motivo: 'Día de las Madres' },
      { fecha: fija(7, 19), motivo: 'Aniversario de la Revolución' },
      { fecha: fija(8, 1), motivo: 'Santo Domingo de Guzmán (bajada)' },
      { fecha: fija(8, 10), motivo: 'Santo Domingo de Guzmán (subida)' },
      { fecha: fija(9, 14), motivo: 'Batalla de San Jacinto' },
      { fecha: fija(9, 15), motivo: 'Día de la Independencia' },
      { fecha: fija(12, 7), motivo: 'La Gritería' },
      { fecha: fija(12, 8), motivo: 'Inmaculada Concepción (Purísima)' },
      { fecha: fija(12, 25), motivo: 'Navidad' },
    ];
  }

  /** Agrega los feriados de Nicaragua del año que todavía no estén cubiertos por el catálogo */
  cargarFeriadosNicaragua(anio: number) {
    const existentes = this.getDiasNoLectivos();
    const nuevos: DiaNoLectivo[] = this.feriadosNicaragua(anio)
      .filter((fer) => !this.diaNoLectivoEn(existentes, fer.fecha))
      .map((fer) => ({
        id: `dnl-${fer.fecha}`,
        fecha_inicio: fer.fecha,
        fecha_fin: fer.fecha,
        motivo: fer.motivo,
        tipo: 'FERIADO',
        creado_en: new Date().toISOString(),
      }));
    if (nuevos.length > 0) this.write(STORAGE_KEYS.DIAS_NO_LECTIVOS, nuevos);
    return { agregados: nuevos.length, ...this.reaplicarCalendarioATodos() };
  }

  // --- BITÁCORA DE ALTAS Y BAJAS (solo inserción; base de los cortes bimestrales) ---

  getMovimientos(): MovimientoInscripcion[] {
    const cached = cacheService.get<MovimientoInscripcion[]>('movimientos_all');
    if (cached) return cached;
    const data = this.read<MovimientoInscripcion[]>(STORAGE_KEYS.MOVIMIENTOS, [])
      .map((m) => ({ ...m, fecha: String(m.fecha).slice(0, 10) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.creado_en).localeCompare(String(b.creado_en)));
    cacheService.set('movimientos_all', data, 60000, ['movimientos']);
    return data;
  }

  /**
   * Registra un alta o baja. Solo lo hacen los roles que escriben inscripciones y alumnos
   * (ADMIN, CAJERO, MATRICULA); para otros roles se omite, porque RLS lo rechazaría.
   */
  private registrarMovimiento(
    tipo: TipoMovimiento,
    estudianteId: string,
    grupoId?: string | null,
    motivo?: string
  ): void {
    const rol = this.perfilActual?.rol;
    if (rol && !['ADMIN', 'CAJERO', 'MATRICULA'].includes(rol)) return;
    const est = this.read<Estudiante[]>(STORAGE_KEYS.ESTUDIANTES, []).find((e) => e.id === estudianteId);
    const grupo = grupoId ? this.getGrupoById(grupoId) : undefined;
    const mov: MovimientoInscripcion = {
      id: `mov-${nuevoId()}`,
      tipo,
      estudiante_id: estudianteId,
      grupo_id: grupoId || null,
      estudiante_nombre: est ? `${est.nombre} ${est.apellido}`.trim() : undefined,
      grupo_nombre: grupo?.nombre,
      fecha: fechaLocalISO(),
      motivo: motivo?.trim() || null,
      registrado_por: this.perfilActual?.id || null,
      creado_en: new Date().toISOString(),
    };
    this.write(STORAGE_KEYS.MOVIMIENTOS, [mov]);
    cacheService.invalidateByTag('movimientos');
  }

  // --- CORTES BIMESTRALES (ADMIN define fechas; ADMIN y CAJERO ven el reporte) ---

  getCortes(): CorteBimestral[] {
    const cached = cacheService.get<CorteBimestral[]>('cortes_all');
    if (cached) return cached;
    const data = this.read<CorteBimestral[]>(STORAGE_KEYS.CORTES, [])
      .map((c) => ({
        ...c,
        fecha_inicio: String(c.fecha_inicio).slice(0, 10),
        fecha_fin: String(c.fecha_fin).slice(0, 10),
      }))
      .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
    cacheService.set('cortes_all', data, 60000, ['cortes']);
    return data;
  }

  private validarCorte(datos: Pick<CorteBimestral, 'nombre' | 'fecha_inicio' | 'fecha_fin'>, excluirId?: string) {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const nombre = (datos.nombre || '').trim();
    if (!nombre) throw new Error('Indica el nombre del corte (por ejemplo: I Bimestre 2027).');
    if (nombre.length > 80) throw new Error('El nombre no puede superar los 80 caracteres.');
    if (!iso.test(datos.fecha_inicio) || !iso.test(datos.fecha_fin)) throw new Error('Indica las fechas Desde y Hasta.');
    if (datos.fecha_fin < datos.fecha_inicio) throw new Error('La fecha Hasta no puede ser anterior a Desde.');
    const otros = this.getCortes().filter((c) => c.id !== excluirId);
    if (otros.some((c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase())) {
      throw new Error(`Ya existe un corte llamado "${nombre}".`);
    }
    const choque = otros.find((c) => c.fecha_inicio <= datos.fecha_fin && datos.fecha_inicio <= c.fecha_fin);
    if (choque) throw new Error(`Las fechas se cruzan con el corte "${choque.nombre}".`);
    return { nombre, fecha_inicio: datos.fecha_inicio, fecha_fin: datos.fecha_fin };
  }

  /** Inserta un corte validado, sin recalcular el calendario */
  private insertarCorte(datos: Pick<CorteBimestral, 'nombre' | 'fecha_inicio' | 'fecha_fin'>): CorteBimestral {
    const nuevo: CorteBimestral = {
      id: `cor-${nuevoId()}`,
      ...this.validarCorte(datos),
      creado_en: new Date().toISOString(),
    };
    this.write(STORAGE_KEYS.CORTES, [nuevo]);
    cacheService.invalidateByTag('cortes');
    return nuevo;
  }

  /** Crea un corte y genera las clases de todos los talleres en sus fechas */
  crearCorte(datos: Pick<CorteBimestral, 'nombre' | 'fecha_inicio' | 'fecha_fin'>) {
    const corte = this.insertarCorte(datos);
    return { corte, ...this.reaplicarCalendarioATodos() };
  }

  /** Cambia un corte y ajusta las clases de todos los talleres a sus nuevas fechas */
  actualizarCorte(id: string, datos: Pick<CorteBimestral, 'nombre' | 'fecha_inicio' | 'fecha_fin'>) {
    const actual = this.getCortes().find((c) => c.id === id);
    if (!actual) throw new Error('Corte no encontrado.');
    const corte: CorteBimestral = { ...actual, ...this.validarCorte(datos, id), id };
    this.write(STORAGE_KEYS.CORTES, [corte]);
    cacheService.invalidateByTag('cortes');
    return { corte, ...this.reaplicarCalendarioATodos() };
  }

  /** Elimina un corte; sus clases sin asistencia, no cerradas y no extraordinarias se quitan */
  eliminarCorte(id: string) {
    this.remove(STORAGE_KEYS.CORTES, [id]);
    cacheService.invalidateByTag('cortes');
    return this.reaplicarCalendarioATodos();
  }

  /** Seis bimestres de calendario de un año (Ene–Feb … Nov–Dic), para pre-llenar y editar */
  proponerBimestresDelAnio(anio: number): Pick<CorteBimestral, 'nombre' | 'fecha_inicio' | 'fecha_fin'>[] {
    const romanos = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    return romanos.map((r, i) => {
      const mesInicio = i * 2 + 1;
      const ultimoDia = new Date(Date.UTC(anio, mesInicio + 1, 0)).getUTCDate();
      const mm = (m: number) => String(m).padStart(2, '0');
      return {
        nombre: `${r} Bimestre ${anio}`,
        fecha_inicio: `${anio}-${mm(mesInicio)}-01`,
        fecha_fin: `${anio}-${mm(mesInicio + 1)}-${ultimoDia}`,
      };
    });
  }

  /** Crea los bimestres propuestos de un año, omitiendo los que se cruzan con cortes existentes */
  crearBimestresDelAnio(anio: number) {
    let creados = 0;
    let omitidos = 0;
    for (const b of this.proponerBimestresDelAnio(anio)) {
      try {
        this.insertarCorte(b);
        creados++;
      } catch {
        omitidos++;
      }
    }
    // Un solo recálculo del calendario al final
    return { creados, omitidos, ...this.reaplicarCalendarioATodos() };
  }

  /** Mensualidad de un taller: su costo propio o el arancel general (misma regla que utils/arancel) */
  private mensualidadDe(grupo?: Grupo): number {
    const propio = Number(grupo?.costo);
    if (propio > 0) return propio;
    const general = Number(this.getConfiguracion().arancel_taller);
    return general > 0 ? general : 1200;
  }

  /**
   * Reporte del corte: cobro esperado por taller y alumno, altas y bajas, y matrículas cobradas.
   * No registra mensualidades: un mes es cobrable si el alumno estuvo inscrito al menos un día
   * de ese mes (mes completo), salvo el mes que cubre su matrícula pagada.
   */
  calcularCorteBimestral(corteId: string, gruposPermitidos?: string[]): ResultadoCorte | null {
    const corte = this.getCortes().find((c) => c.id === corteId);
    if (!corte) return null;
    const claveCache = `corte_${corteId}_${gruposPermitidos ? gruposPermitidos.slice().sort().join(',') : 'todos'}`;
    const cached = cacheService.get<ResultadoCorte>(claveCache);
    if (cached) return cached;

    const permitido = (grupoId?: string | null) =>
      !!grupoId && (!gruposPermitidos || gruposPermitidos.includes(grupoId));

    // ---- Calendario: meses (YYYY-MM) que toca el corte y días de cada mes ----
    const mesDe = (fecha: string) => fecha.slice(0, 7);
    const siguienteMes = (mes: string) => {
      const [y, m] = mes.split('-').map(Number);
      return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    };
    const meses: string[] = [];
    for (let m = mesDe(corte.fecha_inicio); m <= mesDe(corte.fecha_fin); m = siguienteMes(m)) meses.push(m);
    const diasDelMes = new Map<string, string[]>();
    const diasDe = (mes: string) => {
      let dias = diasDelMes.get(mes);
      if (!dias) {
        const [y, m] = mes.split('-').map(Number);
        const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
        dias = Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
        diasDelMes.set(mes, dias);
      }
      return dias;
    };

    // ---- Intervalos de inscripción por (alumno, taller) y pausas por baja del alumno ----
    type Intervalo = { desde: string; hasta: string | null }; // hasta exclusivo
    const movimientos = this.getMovimientos();
    const inscripciones = this.getInscripciones();
    const estudiantes = this.read<Estudiante[]>(STORAGE_KEYS.ESTUDIANTES, []);
    const estudiantePorId = new Map(estudiantes.map((e) => [e.id, e]));
    const grupos = this.getGrupos();
    const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
    const perfiles = new Map(this.getPerfiles().map((p) => [p.id, `${p.nombre} ${p.apellido || ''}`.trim()]));

    const intervalos = new Map<string, Intervalo[]>(); // clave estudiante|grupo
    const nombreGrupoMov = new Map<string, string>();
    const inscritoAhora = new Set(inscripciones.map((i) => `${i.estudiante_id}|${i.grupo_id}`));
    const pares = new Set<string>(inscritoAhora);

    for (const mov of movimientos) {
      if (!mov.grupo_id || (mov.tipo !== 'ALTA_TALLER' && mov.tipo !== 'BAJA_TALLER')) continue;
      const clave = `${mov.estudiante_id}|${mov.grupo_id}`;
      pares.add(clave);
      if (mov.grupo_nombre) nombreGrupoMov.set(mov.grupo_id, mov.grupo_nombre);
      const lista = intervalos.get(clave) ?? [];
      const abierto = lista.length > 0 && lista[lista.length - 1].hasta === null ? lista[lista.length - 1] : null;
      if (mov.tipo === 'ALTA_TALLER') {
        if (!abierto) lista.push({ desde: mov.fecha, hasta: null });
      } else if (abierto) {
        abierto.hasta = mov.fecha;
      }
      intervalos.set(clave, lista);
    }
    // Inscripciones vigentes sin alta en la bitácora: desde su fecha de inscripción
    for (const ins of inscripciones) {
      const clave = `${ins.estudiante_id}|${ins.grupo_id}`;
      if (!intervalos.get(clave)?.length) {
        intervalos.set(clave, [{ desde: String(ins.fecha_inscripcion).slice(0, 10), hasta: null }]);
      }
    }

    const pausas = new Map<string, Intervalo[]>(); // por alumno: de la baja a la reactivación
    for (const mov of movimientos) {
      if (mov.tipo !== 'BAJA_ALUMNO' && mov.tipo !== 'REACTIVACION_ALUMNO') continue;
      const lista = pausas.get(mov.estudiante_id) ?? [];
      const abierta = lista.length > 0 && lista[lista.length - 1].hasta === null ? lista[lista.length - 1] : null;
      if (mov.tipo === 'BAJA_ALUMNO') {
        if (!abierta) lista.push({ desde: mov.fecha, hasta: null });
      } else if (abierta) {
        abierta.hasta = mov.fecha;
      }
      pausas.set(mov.estudiante_id, lista);
    }
    // Alumno de baja sin registro en la bitácora: pausa desde su fecha de baja
    for (const est of estudiantes) {
      if (est.estado !== 'BAJA' || pausas.get(est.id)?.some((p) => p.hasta === null)) continue;
      const desde = est.fecha_baja
        ? est.fecha_baja.length === 10
          ? est.fecha_baja
          : fechaLocalISO(new Date(est.fecha_baja))
        : '0000-01-01';
      pausas.set(est.id, [...(pausas.get(est.id) ?? []), { desde, hasta: null }]);
    }

    const dentro = (dia: string, i: Intervalo) => i.desde <= dia && (i.hasta === null || dia < i.hasta);
    const activoEn = (clave: string, estudianteId: string, dia: string) =>
      (intervalos.get(clave) ?? []).some((i) => dentro(dia, i)) &&
      !(pausas.get(estudianteId) ?? []).some((p) => dentro(dia, p));
    const activoEnMes = (clave: string, estudianteId: string, mes: string) =>
      diasDe(mes).some((dia) => activoEn(clave, estudianteId, dia));

    // ---- Matrículas pagadas (solvente con monto): cubren el primer mes activo desde su pago ----
    const pagadas = this.getSolicitudesMatricula().filter((s) => s.solvente && fechaPagoLocal(s));
    const mesCubierto = new Map<string, Set<string>>(); // clave estudiante|grupo → meses cubiertos
    for (const sol of pagadas) {
      const estId = sol.estudiante_id_creado || sol.estudiante_id;
      if (!estId || !sol.grupo_id) continue;
      const clave = `${estId}|${sol.grupo_id}`;
      let mes = mesDe(fechaPagoLocal(sol));
      for (let i = 0; i < 12; i++, mes = siguienteMes(mes)) {
        if (activoEnMes(clave, estId, mes)) {
          const set = mesCubierto.get(clave) ?? new Set<string>();
          set.add(mes);
          mesCubierto.set(clave, set);
          break;
        }
      }
    }

    // ---- Asistencia del periodo (solo sesiones cerradas del corte) ----
    const asistenciaPorClave = new Map<string, AlertaEstudiante>();
    this.calcularAlertasEstudiantes(undefined, { desde: corte.fecha_inicio, hasta: corte.fecha_fin }).forEach((a) =>
      asistenciaPorClave.set(`${a.estudiante_id}|${a.grupo_id}`, a)
    );

    // ---- Detalle por alumno y taller ----
    const detalle: FilaCorteAlumno[] = [];
    for (const clave of pares) {
      const [estudianteId, grupoId] = clave.split('|');
      if (!permitido(grupoId)) continue;
      const grupo = grupoPorId.get(grupoId);
      const mensualidad = this.mensualidadDe(grupo);
      const cubiertos = mesCubierto.get(clave);
      const estadoMeses = meses.map((mes) => ({
        mes,
        estado: (!activoEnMes(clave, estudianteId, mes)
          ? 'INACTIVO'
          : cubiertos?.has(mes)
          ? 'MATRICULA'
          : 'COBRABLE') as EstadoMesCorte,
      }));
      if (estadoMeses.every((m) => m.estado === 'INACTIVO')) continue;
      const est = estudiantePorId.get(estudianteId);
      const movNombre = movimientos.find((m) => m.estudiante_id === estudianteId && m.estudiante_nombre)?.estudiante_nombre;
      const asis = asistenciaPorClave.get(clave);
      const mesesCobrables = estadoMeses.filter((m) => m.estado === 'COBRABLE').length;
      detalle.push({
        estudiante_id: estudianteId,
        nombre: est?.nombre ?? movNombre ?? 'Alumno eliminado',
        apellido: est?.apellido ?? '',
        grado: est?.grado,
        grupo_id: grupoId,
        grupo_nombre: grupo?.nombre ?? nombreGrupoMov.get(grupoId) ?? 'Taller eliminado',
        mensualidad,
        meses: estadoMeses,
        mesesCobrables,
        mesesMatricula: estadoMeses.filter((m) => m.estado === 'MATRICULA').length,
        cobroEsperado: mesesCobrables * mensualidad,
        activoAlCierre: activoEn(clave, estudianteId, corte.fecha_fin),
        sesionesCerradas: asis?.sesiones_cerradas ?? 0,
        ausencias: asis?.total_ausencias ?? 0,
        justificadas: asis?.total_justificadas ?? 0,
        porcentajeAsistencia:
          asis && asis.sesiones_cerradas > 0
            ? Math.round((asis.total_asistencias / asis.sesiones_cerradas) * 100)
            : null,
      });
    }

    // ---- Altas, bajas y matrículas del periodo ----
    const enCorte = (fecha: string) => corte.fecha_inicio <= fecha && fecha <= corte.fecha_fin;
    const visibleMov = (m: MovimientoInscripcion) =>
      m.grupo_id
        ? permitido(m.grupo_id)
        : !gruposPermitidos || detalle.some((d) => d.estudiante_id === m.estudiante_id);
    const delCorte = movimientos.filter((m) => enCorte(m.fecha) && visibleMov(m));
    const altas = delCorte.filter((m) => m.tipo === 'ALTA_TALLER' || m.tipo === 'REACTIVACION_ALUMNO');
    const bajas = delCorte.filter((m) => m.tipo === 'BAJA_TALLER' || m.tipo === 'BAJA_ALUMNO');

    const matriculas: MatriculaCorte[] = pagadas
      .filter((s) => enCorte(fechaPagoLocal(s)) && permitido(s.grupo_id))
      .map((s) => ({
        id: s.id,
        codigo_solicitud: s.codigo_solicitud,
        tipo_tramite: s.tipo_tramite,
        alumno: `${s.nombre_alumno} ${s.apellido_alumno}`.trim(),
        grupo_id: s.grupo_id,
        grupo_nombre: grupoPorId.get(s.grupo_id)?.nombre ?? s.grupo_nombre,
        fecha_pago: fechaPagoLocal(s),
        monto: Number(s.monto_arancel) || 0,
        numero_recibo_caja: s.numero_recibo_caja,
        metodo_pago: s.metodo_pago,
      }));

    // ---- Resumen por taller (todos los talleres visibles, más los eliminados con alumnos en el corte) ----
    const idsTalleres = new Set<string>([
      ...grupos.filter((g) => permitido(g.id)).map((g) => g.id),
      ...detalle.map((d) => d.grupo_id),
    ]);
    const talleres: FilaCorteTaller[] = Array.from(idsTalleres).map((grupoId) => {
      const grupo = grupoPorId.get(grupoId);
      const filas = detalle.filter((d) => d.grupo_id === grupoId);
      return {
        grupo_id: grupoId,
        grupo_nombre: grupo?.nombre ?? nombreGrupoMov.get(grupoId) ?? 'Taller eliminado',
        profesor_nombre: grupo ? perfiles.get(grupo.profesor_id) ?? 'Sin docente' : '—',
        eliminado: !grupo,
        mensualidad: this.mensualidadDe(grupo),
        alumnos: filas.length,
        mesesCobrables: filas.reduce((s, f) => s + f.mesesCobrables, 0),
        mesesMatricula: filas.reduce((s, f) => s + f.mesesMatricula, 0),
        cobroEsperado: filas.reduce((s, f) => s + f.cobroEsperado, 0),
        altas: altas.filter((m) => m.grupo_id === grupoId).length,
        bajas: bajas.filter((m) => m.grupo_id === grupoId).length,
      };
    });

    const resultado: ResultadoCorte = {
      corte,
      meses,
      talleres,
      detalle,
      altas,
      bajas,
      matriculas,
      resumen: {
        talleres: talleres.filter((t) => t.alumnos > 0).length,
        alumnosActivos: new Set(detalle.map((d) => d.estudiante_id)).size,
        mesesCobrables: detalle.reduce((s, d) => s + d.mesesCobrables, 0),
        mesesMatricula: detalle.reduce((s, d) => s + d.mesesMatricula, 0),
        cobroEsperado: detalle.reduce((s, d) => s + d.cobroEsperado, 0),
        matriculasCobradas: matriculas.length,
        montoMatriculas: matriculas.reduce((s, m) => s + m.monto, 0),
        altas: altas.length,
        bajas: bajas.length,
      },
      arancelPorCiclo: this.getConfiguracion().arancel_periodo === 'CICLO',
    };
    cacheService.set(claveCache, resultado, 60000, [
      'cortes',
      'movimientos',
      'inscripciones',
      'estudiantes',
      'matriculas',
      'grupos',
      'asistencias',
      'sesiones',
      'config',
      'alertas',
    ]);
    return resultado;
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

  /**
   * Envía al correo del tutor el resumen de la solicitud y el contrato firmado en PDF
   * (Edge Function `correo-matricula`, cuenta Gmail institucional). La función arma todo desde la
   * base de datos, por eso primero se espera a que la solicitud termine de guardarse.
   * Un fallo nunca deshace la solicitud: solo queda registrado en `correo_error`.
   */
  async enviarCorreoMatricula(
    solicitudId: string
  ): Promise<{ ok: boolean; destinatario?: string; error?: string }> {
    await syncStore.flush();

    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      destinatario?: string;
      enviado_en?: string;
      error?: string;
    }>('correo-matricula', { body: { solicitud_id: solicitudId } });

    let mensaje: string | undefined = data?.error;
    if (error) {
      mensaje = error.message;
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const payload = (await context.json()) as { error?: string };
          if (payload?.error) mensaje = payload.error;
        } catch {
          // ignorar
        }
      }
    }

    // Reflejar el resultado en memoria (la función ya lo escribió en la base de datos)
    const actual = this.getSolicitudMatriculaById(solicitudId);
    if (actual) {
      const patch = mensaje
        ? { correo_error: mensaje }
        : { correo_enviado_en: data?.enviado_en || new Date().toISOString(), correo_error: null };
      syncStore.applyRemote(STORAGE_KEYS.MATRICULAS, { ...actual, ...patch } as unknown as Record<string, unknown>);
      cacheService.invalidateByTag('matriculas');
      notifyDataChange();
    }

    if (mensaje) return { ok: false, error: mensaje };
    return { ok: true, destinatario: data?.destinatario };
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
      const estabaDeBaja = estudiante.estado === 'BAJA';
      if (estabaDeBaja) {
        this.registrarMovimiento('REACTIVACION_ALUMNO', estudiante.id, null, 'Reincorporado al aceptar su matrícula');
      }
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
        // El pago ya está confirmado: queda activo y al día (también si tenía la renovación pendiente)
        estado: estudiante.estado === 'BAJA' ? estudiante.estado : 'ACTIVO',
        estado_pago_anual: 'AL_DIA',
        contrato_vigente: true,
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

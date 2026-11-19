import * as XLSX from 'xlsx';
import {
  AlertaEstudiante,
  Asistencia,
  Estudiante,
  EventoPermanencia,
  Grupo,
  PermanenciaAlumno,
  ResultadoCorte,
  Sesion,
} from '../types/attendance';
import { storageService } from './storage.service';
import { cicloActual, nombreInstitucion } from '../utils/institucion';
import { fechaLocalISO } from '../utils/fechas';
import { ordenarAlfabetico } from '../utils/orden';

/** Fila ya formateada del historial del anecdotario para exportar */
export interface FilaAnecdotarioExport {
  fecha: string;
  alumno: string;
  matricula: string;
  taller: string;
  tipo: string;
  descripcion: string;
  autor: string;
}

/** dias_semana: 1 = Lunes … 7 = Domingo */
const DIAS_CORTOS: Record<number, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom' };

/** Hoja con encabezado en la primera fila, autofiltro y anchos de columna */
const hojaTabla = (encabezado: string[], filas: (string | number)[][], anchos: number[]) => {
  const ws = XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
  ws['!cols'] = anchos.map((wch) => ({ wch }));
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length, 1), c: encabezado.length - 1 } }),
  };
  return ws;
};

/** Período de un informe de asistencia: rango de fechas (YYYY-MM-DD) y su nombre para el encabezado */
export interface PeriodoInforme {
  desde?: string;
  hasta?: string;
  etiqueta?: string;
}

/** Sin período explícito se usa el corte vigente (los contadores se reinician en cada corte) */
const resolverPeriodo = (periodo?: PeriodoInforme) => {
  if (periodo) {
    return {
      rango: { desde: periodo.desde, hasta: periodo.hasta },
      etiqueta: periodo.etiqueta || `${periodo.desde || 'Inicio'} a ${periodo.hasta || 'hoy'}`,
    };
  }
  const corte = storageService.corteVigente();
  return corte
    ? { rango: { desde: corte.fecha_inicio, hasta: corte.fecha_fin }, etiqueta: `${corte.nombre} (${corte.fecha_inicio} a ${corte.fecha_fin})` }
    : { rango: {}, etiqueta: 'Todo el ciclo' };
};

const enRango = (fecha: string, rango: { desde?: string; hasta?: string }) =>
  (!rango.desde || fecha >= rango.desde) && (!rango.hasta || fecha <= rango.hasta);

const gradoDe = (est?: Estudiante) => est?.grado || 'Sin grado';
const aulaDe = (est?: Estudiante) => est?.aula_regular || 'Sin aula';

export class ExportService {
  /**
   * Genera y descarga un libro de Excel (.xlsx) estructurado
   */
  exportGroupToExcel(grupoId: string, periodo?: PeriodoInforme): void {
    const grupo = storageService.getGrupoById(grupoId);
    if (!grupo) return;
    const { rango, etiqueta } = resolverPeriodo(periodo);

    // Por apellido y nombre, igual que en pantalla
    const estudiantes = ordenarAlfabetico(storageService.getEstudiantesByGrupo(grupoId), (e) => [e.apellido, e.nombre]);
    const estudiantePorId = new Map(storageService.getEstudiantes().map((e) => [e.id, e]));
    const sesiones = storageService.getSesionesByGrupo(grupoId).filter((s) => enRango(s.fecha, rango));
    const asistencias = storageService.getAsistencias();
    const alertas = storageService.calcularAlertasEstudiantes(grupoId, rango);
    const config = storageService.getConfiguracion();

    // 1. Hoja: Resumen General
    const summaryData = [
      [nombreInstitucion().toUpperCase()],
      ['REPORTE OFICIAL DE ASISTENCIA Y CONTROL ACADÉMICO'],
      [''],
      ['Taller / Curso:', grupo.nombre],
      ['Salón del taller:', grupo.aula || 'Taller Principal'],
      ['Horario:', `${grupo.hora_inicio} - ${grupo.hora_fin}`],
      ['Ciclo Académico:', config.ciclo_academico_actual],
      ['Período:', etiqueta],
      ['Fecha de Emisión:', new Date().toLocaleDateString('es-ES')],
      ['Total Alumnos Inscritos:', estudiantes.length],
      ['Total Sesiones Programadas:', sesiones.length],
      ['Sesiones Concluidas (Cerradas):', sesiones.filter((s) => s.cerrada).length],
      [''],
      ['UMBRALES DE ALERTA INSTITUCIONAL'],
      ['Límite de Faltas Permitidas:', `${config.limite_ausencias_alerta} faltas`],
      ['Porcentaje Máximo de Inasistencia:', `${config.porcentaje_inasistencia_alerta}%`],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);

    // 2. Hoja: Matriz de Asistencia
    const fechas = sesiones.map((s) => `${s.fecha} (${s.cerrada ? 'Cerrada' : 'Pendiente'})`);
    const headerRow = ['Matrícula', 'Estudiante', 'Grado', 'Aula', 'Tutor', 'Teléfono Tutor', ...fechas, 'Total Asistencias', 'Total Faltas', 'Total Justificadas', '% Inasistencia', 'Indisciplina', 'Estatus Alerta'];

    const matrixRows = estudiantes.map((est) => {
      const tutor = storageService.getTutorById(est.tutor_id);
      const row: (string | number)[] = [
        est.matricula,
        `${est.nombre} ${est.apellido}`,
        gradoDe(est),
        aulaDe(est),
        tutor?.nombre || 'N/A',
        tutor?.telefono || 'N/A',
      ];

      let presentes = 0;
      let ausentes = 0;
      let justificadas = 0;

      sesiones.forEach((ses) => {
        const asist = asistencias.find(
          (a) => a.sesion_id === ses.id && a.estudiante_id === est.id
        );
        if (!ses.cerrada) {
          row.push('Programada');
        } else if (!asist) {
          row.push('-');
        } else if (asist.estatus === 'PRESENTE') {
          row.push('P');
          presentes++;
        } else if (asist.estatus === 'AUSENTE') {
          row.push('A');
          ausentes++;
        } else if (asist.estatus === 'JUSTIFICADO') {
          row.push('J');
          justificadas++;
        }
      });

      const totalCerradas = sesiones.filter((s) => s.cerrada).length;
      const pct = totalCerradas > 0 ? Math.round((ausentes / totalCerradas) * 1000) / 10 : 0;
      const alerta = alertas.find((a) => a.estudiante_id === est.id);

      row.push(presentes, ausentes, justificadas, `${pct}%`, alerta?.total_indisciplina ?? 0, alerta?.nivel_alerta || 'NORMAL');
      return row;
    });

    const wsMatrix = hojaTabla(headerRow, matrixRows, [
      14, 28, 12, 12, 24, 14,
      ...fechas.map(() => 20),
      16, 12, 16, 14, 12, 14,
    ]);

    // 3. Hoja: Alertas y Casos Críticos
    const headerAlerts = ['Matrícula', 'Estudiante', 'Grado', 'Aula', 'Tutor Responsable', 'Correo Tutor', 'Faltas del período', '% Inasistencia', 'Indisciplina', 'Nivel de Alerta', 'Acción Requerida'];
    const alertRows = alertas.map((a) => [
      a.matricula,
      a.estudiante_nombre,
      gradoDe(estudiantePorId.get(a.estudiante_id)),
      aulaDe(estudiantePorId.get(a.estudiante_id)),
      a.tutor_nombre,
      a.tutor_email,
      a.total_ausencias,
      `${a.porcentaje_inasistencia}%`,
      a.total_indisciplina,
      a.nivel_alerta,
      a.nivel_alerta === 'CRITICA'
        ? 'Citatorio formal a tutor y riesgo de acreditación'
        : a.nivel_alerta === 'ADVERTENCIA'
        ? 'Aviso preventivo enviado a tutor'
        : 'Regular',
    ]);
    const wsAlerts = hojaTabla(headerAlerts, alertRows, [14, 28, 12, 12, 26, 28, 16, 14, 12, 14, 44]);

    // Crear libro y agregar hojas
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');
    XLSX.utils.book_append_sheet(wb, wsMatrix, 'Matriz Asistencia');
    XLSX.utils.book_append_sheet(wb, wsAlerts, 'Alertas de Inasistencia');

    const fileName = `Asistencia_${grupo.nombre.replace(/\s+/g, '_')}_${fechaLocalISO()}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  /**
   * Informe consolidado en Excel con un número FIJO de hojas, sin importar cuántos talleres haya:
   * Resumen Institucional, Resumen por Taller, Matriz Consolidada (alumno × taller) y
   * Detalle por Sesión (formato largo, filtrable por taller y fecha).
   * Con un taller concreto delega en exportGroupToExcel.
   * `gruposPermitidos` limita los talleres a los visibles para el rol (p. ej. un docente).
   */
  exportConsolidatedExcel(grupoId?: string, gruposPermitidos?: string[], periodo?: PeriodoInforme): void {
    if (grupoId && grupoId !== 'TODOS') {
      this.exportGroupToExcel(grupoId, periodo);
      return;
    }
    const { rango, etiqueta } = resolverPeriodo(periodo);

    const permitidos = gruposPermitidos ? new Set(gruposPermitidos) : null;
    const grupos = storageService
      .getGrupos()
      .filter((g) => !permitidos || permitidos.has(g.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const idsGrupos = new Set(grupos.map((g) => g.id));
    const config = storageService.getConfiguracion();
    const alertas = storageService.calcularAlertasEstudiantes(undefined, rango).filter((a) => idsGrupos.has(a.grupo_id));
    const sesiones = storageService.getSesiones().filter((s) => idsGrupos.has(s.grupo_id) && enRango(s.fecha, rango));
    const perfiles = new Map(storageService.getPerfiles().map((p) => [p.id, `${p.nombre} ${p.apellido}`.trim()]));
    const tutores = new Map(storageService.getTutores().map((t) => [t.id, t]));

    // Índice de asistencias por sesión y alumno (evita búsquedas O(n²))
    const asistenciaDe = new Map<string, Asistencia>();
    storageService.getAsistencias().forEach((a) => asistenciaDe.set(`${a.sesion_id}|${a.estudiante_id}`, a));

    const fechaDDMM = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    const diaSemana = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long' });
    };
    const accion = (nivel: AlertaEstudiante['nivel_alerta']) =>
      nivel === 'CRITICA'
        ? 'Citatorio formal a tutor y riesgo de acreditación'
        : nivel === 'ADVERTENCIA'
        ? 'Aviso preventivo enviado a tutor'
        : 'Regular';


    // Datos por taller
    const porTaller = grupos.map((g) => {
      const gSesiones = sesiones
        .filter((s) => s.grupo_id === g.id)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));
      const cerradas = gSesiones.filter((s) => s.cerrada);
      const alumnos = storageService.getEstudiantesByGrupo(g.id);
      return { grupo: g, gSesiones, cerradas, alumnos };
    });

    // --- 3. Matriz Consolidada (alumno × taller) y 4. Detalle por Sesión ---
    const filasMatriz: (string | number)[][] = [];
    const filasDetalle: (string | number)[][] = [];
    const totalesTaller = new Map<string, { presentes: number; ausencias: number; justificadas: number }>();

    porTaller.forEach(({ grupo, cerradas, alumnos }) => {
      const tot = { presentes: 0, ausencias: 0, justificadas: 0 };
      [...alumnos]
        .sort((a, b) => a.apellido.localeCompare(b.apellido, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
        .forEach((est) => {
          const tutor = tutores.get(est.tutor_id);
          const nombre = `${est.nombre} ${est.apellido}`.trim();
          let presentes = 0;
          const fechasA: string[] = [];
          const fechasJ: string[] = [];

          cerradas.forEach((s) => {
            const a = asistenciaDe.get(`${s.id}|${est.id}`);
            const estado = !a
              ? 'Sin registro'
              : a.estatus === 'PRESENTE'
              ? 'Presente'
              : a.estatus === 'AUSENTE'
              ? 'Ausente'
              : 'Justificado';
            if (a?.estatus === 'PRESENTE') presentes++;
            if (a?.estatus === 'AUSENTE') fechasA.push(fechaDDMM(s.fecha));
            if (a?.estatus === 'JUSTIFICADO') fechasJ.push(fechaDDMM(s.fecha));
            filasDetalle.push([
              grupo.nombre,
              s.fecha,
              diaSemana(s.fecha),
              s.extraordinaria ? 'Extra' : 'Regular',
              est.matricula,
              nombre,
              estado,
              a?.estatus === 'JUSTIFICADO' ? a.motivo_justificacion || '' : '',
            ]);
          });

          const alerta = alertas.find((x) => x.estudiante_id === est.id && x.grupo_id === grupo.id);
          const pct = cerradas.length > 0 ? Math.round((fechasA.length / cerradas.length) * 1000) / 10 : 0;
          tot.presentes += presentes;
          tot.ausencias += fechasA.length;
          tot.justificadas += fechasJ.length;

          filasMatriz.push([
            grupo.nombre,
            est.matricula,
            nombre,
            est.estado === 'BAJA' ? 'Baja' : 'Activo',
            tutor?.nombre || 'N/A',
            tutor?.telefono || 'N/A',
            cerradas.length,
            presentes,
            fechasA.length,
            fechasJ.length,
            `${pct}%`,
            fechasA.join(', ') || '—',
            fechasJ.join(', ') || '—',
            alerta?.total_indisciplina ?? 0,
            alerta?.nivel_alerta || 'NORMAL',
            accion(alerta?.nivel_alerta || 'NORMAL'),
          ]);
        });
      totalesTaller.set(grupo.id, tot);
    });

    // --- 2. Resumen por Taller ---
    const filasResumenTaller = porTaller.map(({ grupo, gSesiones, cerradas, alumnos }) => {
      const tot = totalesTaller.get(grupo.id)!;
      const registros = tot.presentes + tot.ausencias + tot.justificadas;
      const gAlertas = alertas.filter((a) => a.grupo_id === grupo.id);
      return [
        grupo.nombre,
        perfiles.get(grupo.profesor_id) || 'Sin docente',
        grupo.aula || 'Taller Principal',
        `${(grupo.dias_semana || []).map((d) => DIAS_CORTOS[d] || d).join(', ')} ${grupo.hora_inicio}-${grupo.hora_fin}`.trim(),
        alumnos.filter((e) => e.estado !== 'BAJA').length,
        gSesiones.length,
        cerradas.length,
        gSesiones.length > 0 ? `${Math.round((cerradas.length / gSesiones.length) * 100)}%` : '0%',
        tot.presentes,
        tot.ausencias,
        tot.justificadas,
        registros > 0 ? `${Math.round((tot.presentes / registros) * 100)}%` : '—',
        gAlertas.filter((a) => a.nivel_alerta === 'CRITICA').length,
        gAlertas.filter((a) => a.nivel_alerta === 'ADVERTENCIA').length,
      ];
    });

    // --- 1. Resumen Institucional ---
    const alumnosUnicos = new Set(porTaller.flatMap(({ alumnos }) => alumnos.map((e) => e.id)));
    const resumen = [
      [nombreInstitucion().toUpperCase()],
      ['INFORME EJECUTIVO CONSOLIDADO DE ASISTENCIA'],
      [''],
      ['Ciclo Académico:', config.ciclo_academico_actual],
      ['Período:', etiqueta],
      ['Fecha de Emisión:', new Date().toLocaleDateString('es-ES')],
      ['Talleres incluidos:', grupos.length],
      ['Alumnos inscritos (distintos):', alumnosUnicos.size],
      ['Sesiones programadas:', sesiones.length],
      ['Sesiones concluidas:', sesiones.filter((s) => s.cerrada).length],
      ['Alumnos en alerta crítica:', alertas.filter((a) => a.nivel_alerta === 'CRITICA').length],
      ['Alumnos con advertencia:', alertas.filter((a) => a.nivel_alerta === 'ADVERTENCIA').length],
      [''],
      ['PARÁMETROS DE EVALUACIÓN'],
      ['Límite de faltas permitidas:', `${config.limite_ausencias_alerta} faltas`],
      ['Porcentaje máximo de inasistencia:', `${config.porcentaje_inasistencia_alerta}%`],
      ['Reinicio de contadores:', 'Las faltas y la indisciplina se cuentan por corte bimestral.'],
      [''],
      ['CONTENIDO DEL LIBRO'],
      ['Resumen por Taller:', 'Una fila por taller con sus totales.'],
      ['Matriz Consolidada:', 'Una fila por alumno y taller, con las fechas de ausencia y justificación.'],
      ['Detalle por Sesión:', 'Una fila por alumno y sesión cerrada. Use los filtros de la fila de encabezado.'],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
    wsResumen['!cols'] = [{ wch: 34 }, { wch: 70 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Institucional');
    XLSX.utils.book_append_sheet(
      wb,
      hojaTabla(
        [
          'Taller', 'Docente', 'Aula', 'Horario', 'Alumnos activos', 'Sesiones programadas', 'Sesiones cerradas',
          '% Avance', 'Presentes', 'Ausencias', 'Justificadas', '% Asistencia', 'Alertas críticas', 'Advertencias',
        ],
        filasResumenTaller,
        [28, 24, 18, 26, 10, 12, 12, 10, 10, 10, 12, 12, 12, 12]
      ),
      'Resumen por Taller'
    );
    XLSX.utils.book_append_sheet(
      wb,
      hojaTabla(
        [
          'Taller', 'Matrícula', 'Estudiante', 'Estado', 'Tutor', 'Teléfono Tutor', 'Sesiones cerradas', 'Presentes',
          'Faltas', 'Justificadas', '% Inasistencia', 'Fechas de ausencia', 'Fechas justificadas', 'Indisciplina',
          'Nivel de alerta', 'Acción requerida',
        ],
        filasMatriz,
        [26, 14, 28, 9, 24, 15, 10, 10, 8, 11, 12, 30, 30, 11, 14, 40]
      ),
      'Matriz Consolidada'
    );
    XLSX.utils.book_append_sheet(
      wb,
      hojaTabla(
        ['Taller', 'Fecha', 'Día', 'Tipo', 'Matrícula', 'Estudiante', 'Estado', 'Motivo de justificación'],
        filasDetalle,
        [26, 12, 11, 9, 14, 28, 13, 40]
      ),
      'Detalle por Sesión'
    );

    const sufijo = etiqueta.split(' (')[0].replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
    XLSX.writeFile(wb, `Informe_Consolidado_Talleres_${sufijo ? `${sufijo}_` : ''}${fechaLocalISO()}.xlsx`);
  }

  /**
   * Exporta el historial del anecdotario tal como está filtrado en pantalla.
   */
  exportAnecdotario(filas: FilaAnecdotarioExport[], filtrosDescripcion: string): void {
    const encabezado = [
      [nombreInstitucion().toUpperCase()],
      ['HISTORIAL DEL ANECDOTARIO ESTUDIANTIL'],
      ['Ciclo Académico:', cicloActual()],
      ['Fecha de Emisión:', new Date().toLocaleDateString('es-ES')],
      ['Filtros aplicados:', filtrosDescripcion],
      ['Total de anotaciones:', filas.length],
      [''],
      ['Fecha', 'Alumno', 'Matrícula', 'Taller', 'Tipo', 'Descripción', 'Registrado por'],
    ];
    const datos = filas.map((f) => [f.fecha, f.alumno, f.matricula, f.taller, f.tipo, f.descripcion, f.autor]);
    const ws = XLSX.utils.aoa_to_sheet([...encabezado, ...datos]);
    ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 70 }, { wch: 24 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Anecdotario');
    XLSX.writeFile(wb, `Anecdotario_${fechaLocalISO()}.xlsx`);
  }

  /**
   * Permanencia de alumnos: hoja "Permanencia" (una fila por alumno) y hoja "Historial"
   * (una fila por hecho: matrícula, baja, reactivación, renovación, altas y salidas de talleres).
   */
  exportPermanencia(filas: PermanenciaAlumno[], filtrosDescripcion: string): void {
    const ESTADOS: Record<PermanenciaAlumno['estado'], string> = {
      PERMANENTE: 'Permanente',
      REINCORPORADO: 'Reincorporado',
      DE_BAJA: 'De baja',
    };
    const EVENTOS: Record<EventoPermanencia['tipo'], string> = {
      MATRICULA: 'Matrícula',
      REMATRICULA: 'Nueva matrícula',
      RENOVACION: 'Renovación',
      BAJA: 'Baja',
      REACTIVACION: 'Reactivación',
      ALTA_TALLER: 'Alta en taller',
      BAJA_TALLER: 'Sale de taller',
    };
    const ordenadas = ordenarAlfabetico(filas, (f) => [f.apellido, f.nombre]);

    const encabezado = [
      [nombreInstitucion().toUpperCase()],
      ['PERMANENCIA DE ALUMNOS EN LOS TALLERES'],
      ['Fecha de Emisión:', new Date().toLocaleDateString('es-ES')],
      ['Filtros aplicados:', filtrosDescripcion],
      ['Total de alumnos:', filas.length],
      [''],
    ];
    const columnas = [
      'Apellidos', 'Nombres', 'Código', 'Grado', 'Talleres actuales', 'Primera matrícula',
      'Permanencia', 'Días activo', 'Años activos', 'Estado', 'Bajas', 'Reingresos', 'Última baja', 'Último reingreso',
    ];
    const datos = ordenadas.map((f) => [
      f.apellido, f.nombre, f.matricula, f.grado || 'Sin grado', f.talleres.join(', ') || '—', f.primera_matricula,
      f.permanencia, f.dias_activo, f.anios_activos.join(', '), ESTADOS[f.estado], f.bajas, f.reingresos,
      f.ultima_baja ?? '', f.ultimo_reingreso ?? '',
    ]);
    const wsResumen = XLSX.utils.aoa_to_sheet([...encabezado, columnas, ...datos]);
    wsResumen['!cols'] = [22, 22, 14, 12, 30, 16, 16, 11, 14, 14, 8, 11, 14, 16].map((wch) => ({ wch }));
    wsResumen['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: encabezado.length, c: 0 },
        e: { r: encabezado.length + Math.max(datos.length, 1), c: columnas.length - 1 },
      }),
    };

    const historial = ordenadas.flatMap((f) =>
      f.eventos.map((e) => [`${f.apellido}, ${f.nombre}`, f.matricula, e.fecha, EVENTOS[e.tipo], e.detalle])
    );
    const wsHistorial = hojaTabla(['Alumno', 'Código', 'Fecha', 'Evento', 'Detalle'], historial, [28, 14, 12, 16, 60]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Permanencia');
    XLSX.utils.book_append_sheet(wb, wsHistorial, 'Historial');
    XLSX.writeFile(wb, `Permanencia_Alumnos_${fechaLocalISO()}.xlsx`);
  }

  /**
   * Corte bimestral: 5 hojas fijas (Resumen, Cobro por Taller, Detalle por Alumno, Altas y Bajas, Matrículas).
   * Montos como números (C$) para que se puedan sumar y filtrar en Excel.
   */
  exportCorteBimestral(datos: ResultadoCorte): void {
    const { corte, meses, resumen } = datos;
    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const etiquetaMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
    const fecha = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-ES');
    };
    const TIPOS: Record<string, string> = {
      ALTA_TALLER: 'Alta en taller',
      BAJA_TALLER: 'Baja del taller',
      BAJA_ALUMNO: 'Baja del alumno',
      REACTIVACION_ALUMNO: 'Reincorporación',
    };

    const wb = XLSX.utils.book_new();

    const wsResumen = XLSX.utils.aoa_to_sheet([
      [nombreInstitucion().toUpperCase()],
      ['CORTE BIMESTRAL: COBRO ESPERADO, ALTAS Y BAJAS, MATRÍCULAS'],
      [''],
      ['Corte:', corte.nombre],
      ['Periodo:', `${fecha(corte.fecha_inicio)} al ${fecha(corte.fecha_fin)}`],
      ['Meses del corte:', meses.map(etiquetaMes).join(', ')],
      ['Fecha de Emisión:', new Date().toLocaleDateString('es-ES')],
      [''],
      ['Talleres con alumnos:', resumen.talleres],
      ['Alumnos activos en el periodo:', resumen.alumnosActivos],
      ['Mensualidades a cobrar:', resumen.mesesCobrables],
      ['Meses cubiertos por matrícula:', resumen.mesesMatricula],
      ['Cobro esperado (C$):', resumen.cobroEsperado],
      ['Matrículas cobradas:', resumen.matriculasCobradas],
      ['Monto de matrículas (C$):', resumen.montoMatriculas],
      ['Altas:', resumen.altas],
      ['Bajas:', resumen.bajas],
      [''],
      ['Las mensualidades no se registran en el sistema: el cobro esperado es mensualidad × meses inscritos (mes completo si estuvo al menos un día), sin el mes que cubre la matrícula.'],
      ...(datos.arancelPorCiclo ? [['Aviso: el arancel está configurado "por ciclo"; este reporte lo trata como mensualidad.']] : []),
    ]);
    wsResumen['!cols'] = [{ wch: 34 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const talleres = ordenarAlfabetico(datos.talleres, (t) => [t.grupo_nombre]);
    XLSX.utils.book_append_sheet(
      wb,
      hojaTabla(
        ['Taller', 'Docente', 'Mensualidad (C$)', 'Alumnos', 'Mensualidades a cobrar', 'Cubiertos por matrícula', 'Cobro esperado (C$)', 'Altas', 'Bajas'],
        talleres.map((t) => [
          t.grupo_nombre + (t.eliminado ? ' (eliminado)' : ''),
          t.profesor_nombre,
          t.mensualidad,
          t.alumnos,
          t.mesesCobrables,
          t.mesesMatricula,
          t.cobroEsperado,
          t.altas,
          t.bajas,
        ]),
        [30, 26, 16, 10, 20, 20, 18, 8, 8]
      ),
      'Cobro por Taller'
    );

    const detalle = ordenarAlfabetico(datos.detalle, (d) => [d.grupo_nombre, d.apellido, d.nombre]);
    const textoMes = { COBRABLE: 'Cobrar', MATRICULA: 'Matrícula', INACTIVO: '—' } as const;
    XLSX.utils.book_append_sheet(
      wb,
      hojaTabla(
        [
          'Taller',
          'Apellido',
          'Nombre',
          'Grado',
          ...meses.map(etiquetaMes),
          'Mensualidad (C$)',
          'Meses a cobrar',
          'Cobro esperado (C$)',
          'Inscrito al cierre',
          'Sesiones cerradas',
          'Ausencias',
          'Justificadas',
          '% Asistencia',
        ],
        detalle.map((d) => [
          d.grupo_nombre,
          d.apellido,
          d.nombre,
          d.grado || 'Sin grado',
          ...d.meses.map((m) => textoMes[m.estado]),
          d.mensualidad,
          d.mesesCobrables,
          d.cobroEsperado,
          d.activoAlCierre ? 'Sí' : 'No',
          d.sesionesCerradas,
          d.ausencias,
          d.justificadas,
          d.porcentajeAsistencia === null ? 'Sin datos' : d.porcentajeAsistencia,
        ]),
        [26, 20, 20, 12, ...meses.map(() => 12), 16, 14, 18, 16, 16, 10, 12, 12]
      ),
      'Detalle por Alumno'
    );

    const movimientos = [...datos.altas, ...datos.bajas].sort((a, b) => a.fecha.localeCompare(b.fecha));
    XLSX.utils.book_append_sheet(
      wb,
      hojaTabla(
        ['Fecha', 'Movimiento', 'Alumno', 'Taller', 'Motivo'],
        movimientos.map((m) => [
          fecha(m.fecha),
          TIPOS[m.tipo] || m.tipo,
          m.estudiante_nombre || m.estudiante_id,
          m.grupo_id ? m.grupo_nombre || 'Taller' : 'Todos sus talleres',
          m.motivo || '',
        ]),
        [14, 20, 30, 28, 50]
      ),
      'Altas y Bajas'
    );

    const matriculas = [...datos.matriculas].sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago));
    XLSX.utils.book_append_sheet(
      wb,
      hojaTabla(
        ['Fecha de pago', 'Código', 'Trámite', 'Alumno', 'Taller', 'Recibo', 'Método', 'Monto (C$)'],
        matriculas.map((m) => [
          fecha(m.fecha_pago),
          m.codigo_solicitud,
          m.tipo_tramite === 'RENOVACION_ANUAL' ? 'Renovación' : 'Nueva matrícula',
          m.alumno,
          m.grupo_nombre,
          m.numero_recibo_caja || '',
          m.metodo_pago || '',
          m.monto,
        ]),
        [14, 16, 16, 30, 28, 16, 14, 12]
      ),
      'Matrículas'
    );

    const nombreArchivo = corte.nombre.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
    XLSX.writeFile(wb, `Corte_${nombreArchivo}_${fechaLocalISO()}.xlsx`);
  }

  /**
   * Prepara los datos formateados para impresión de documento PDF oficial
   */
  getPrintableDocumentData(grupoId: string, sesionId?: string) {
    const grupo = storageService.getGrupoById(grupoId);
    const sesiones = storageService.getSesionesByGrupo(grupoId);
    const estudiantes = storageService.getEstudiantesByGrupo(grupoId);
    const asistencias = storageService.getAsistencias();
    const alertas = storageService.calcularAlertasEstudiantes(grupoId);
    const config = storageService.getConfiguracion();
    const sesion = sesionId ? storageService.getSesionById(sesionId) : undefined;

    return {
      grupo,
      sesion,
      sesiones,
      estudiantes,
      asistencias,
      alertas,
      config,
    };
  }

  /**
   * Lista de participantes de un evento para Dirección: hoja "Participantes" (orden grado, sección,
   * apellido, nombre) y hoja "Resumen" por taller y por grado/sección.
   * `gruposPermitidos` limita los talleres (un docente exporta solo los suyos).
   */
  exportEvento(eventoId: string, gruposPermitidos?: string[]): void {
    const evento = storageService.getEventoById(eventoId);
    if (!evento) return;
    const filas = storageService.filasEvento(eventoId, gruposPermitidos);
    const [y, m, d] = evento.fecha.split('-').map(Number);
    const fechaEvento = new Date(y, m - 1, d).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // --- Hoja Participantes: encabezado del evento + tabla con autofiltro ---
    const encabezado: (string | number)[][] = [
      [nombreInstitucion().toUpperCase()],
      [`LISTA DE PARTICIPANTES · ${evento.nombre.toUpperCase()}`],
      ['Fecha del evento:', fechaEvento],
      ['Lugar:', evento.lugar || '—'],
      ['Total de participantes:', filas.length],
      ['Fecha de emisión:', new Date().toLocaleDateString('es-ES')],
      [''],
    ];
    const columnas = ['N°', 'Grado', 'Sección', 'Apellidos', 'Nombres', 'Matrícula', 'Taller', 'Docente'];
    const cuerpo = filas.map((f, i) => [i + 1, f.grado, f.seccion, f.apellido, f.nombre, f.matricula, f.taller, f.docente]);
    const wsParticipantes = XLSX.utils.aoa_to_sheet([...encabezado, columnas, ...cuerpo]);
    const filaTitulos = encabezado.length;
    wsParticipantes['!cols'] = [6, 14, 14, 24, 24, 14, 26, 26].map((wch) => ({ wch }));
    wsParticipantes['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: filaTitulos, c: 0 },
        e: { r: filaTitulos + Math.max(cuerpo.length, 1), c: columnas.length - 1 },
      }),
    };

    // --- Hoja Resumen: por taller y por grado / sección ---
    const porTaller = new Map<string, { docente: string; total: number }>();
    const porGrado = new Map<string, number>();
    filas.forEach((f) => {
      const t = porTaller.get(f.taller) ?? { docente: f.docente, total: 0 };
      t.total++;
      porTaller.set(f.taller, t);
      const clave = `${f.grado}|${f.seccion}`;
      porGrado.set(clave, (porGrado.get(clave) ?? 0) + 1);
    });
    const resumen: (string | number)[][] = [
      [`RESUMEN · ${evento.nombre}`],
      ['Fecha del evento:', fechaEvento],
      [''],
      ['Taller', 'Docente', 'Participantes'],
      ...[...porTaller.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'es'))
        .map(([taller, v]) => [taller, v.docente, v.total]),
      ['Total', '', filas.length],
      [''],
      ['Grado', 'Sección', 'Participantes'],
      // Mismo orden que la lista (las filas ya vienen ordenadas por grado y sección)
      ...[...porGrado.entries()].map(([clave, total]) => {
        const [grado, seccion] = clave.split('|');
        return [grado, seccion, total];
      }),
      ['Total', '', filas.length],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
    wsResumen['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsParticipantes, 'Participantes');
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    const nombre = evento.nombre.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
    XLSX.writeFile(wb, `Evento_${nombre}_${evento.fecha}.xlsx`);
  }
}

export const exportService = new ExportService();

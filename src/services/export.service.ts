import * as XLSX from 'xlsx';
import { AlertaEstudiante, Asistencia, Estudiante, Grupo, Sesion } from '../types/attendance';
import { storageService } from './storage.service';
import { cicloActual, nombreInstitucion } from '../utils/institucion';
import { fechaLocalISO } from '../utils/fechas';

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

export class ExportService {
  /**
   * Genera y descarga un libro de Excel (.xlsx) estructurado
   */
  exportGroupToExcel(grupoId: string): void {
    const grupo = storageService.getGrupoById(grupoId);
    if (!grupo) return;

    const estudiantes = storageService.getEstudiantesByGrupo(grupoId);
    const sesiones = storageService.getSesionesByGrupo(grupoId);
    const asistencias = storageService.getAsistencias();
    const alertas = storageService.calcularAlertasEstudiantes(grupoId);
    const config = storageService.getConfiguracion();

    // 1. Hoja: Resumen General
    const summaryData = [
      [nombreInstitucion().toUpperCase()],
      ['REPORTE OFICIAL DE ASISTENCIA Y CONTROL ACADÉMICO'],
      [''],
      ['Taller / Curso:', grupo.nombre],
      ['Aula:', grupo.aula || 'Taller Principal'],
      ['Horario:', `${grupo.hora_inicio} - ${grupo.hora_fin}`],
      ['Ciclo Académico:', config.ciclo_academico_actual],
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
    const headerRow = ['Matrícula', 'Estudiante', 'Tutor', 'Teléfono Tutor', ...fechas, 'Total Asistencias', 'Total Faltas', 'Total Justificadas', '% Inasistencia', 'Estatus Alerta'];

    const matrixRows = estudiantes.map((est) => {
      const tutor = storageService.getTutorById(est.tutor_id);
      const row: (string | number)[] = [
        est.matricula,
        `${est.nombre} ${est.apellido}`,
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

      row.push(presentes, ausentes, justificadas, `${pct}%`, alerta?.nivel_alerta || 'NORMAL');
      return row;
    });

    const wsMatrix = XLSX.utils.aoa_to_sheet([headerRow, ...matrixRows]);

    // 3. Hoja: Alertas y Casos Críticos
    const headerAlerts = ['Matrícula', 'Estudiante', 'Tutor Responsable', 'Correo Tutor', 'Faltas Acumuladas', '% Inasistencia', 'Nivel de Alerta', 'Acción Requerida'];
    const alertRows = alertas.map((a) => [
      a.matricula,
      a.estudiante_nombre,
      a.tutor_nombre,
      a.tutor_email,
      a.total_ausencias,
      `${a.porcentaje_inasistencia}%`,
      a.nivel_alerta,
      a.nivel_alerta === 'CRITICA'
        ? 'Citatorio formal a tutor y riesgo de acreditación'
        : a.nivel_alerta === 'ADVERTENCIA'
        ? 'Aviso preventivo enviado a tutor'
        : 'Regular',
    ]);
    const wsAlerts = XLSX.utils.aoa_to_sheet([headerAlerts, ...alertRows]);

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
  exportConsolidatedExcel(grupoId?: string, gruposPermitidos?: string[]): void {
    if (grupoId && grupoId !== 'TODOS') {
      this.exportGroupToExcel(grupoId);
      return;
    }

    const permitidos = gruposPermitidos ? new Set(gruposPermitidos) : null;
    const grupos = storageService
      .getGrupos()
      .filter((g) => !permitidos || permitidos.has(g.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const idsGrupos = new Set(grupos.map((g) => g.id));
    const config = storageService.getConfiguracion();
    const alertas = storageService.calcularAlertasEstudiantes().filter((a) => idsGrupos.has(a.grupo_id));
    const sesiones = storageService.getSesiones().filter((s) => idsGrupos.has(s.grupo_id));
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

    /** Hoja con encabezado en la primera fila, autofiltro y anchos de columna */
    const hojaTabla = (encabezado: string[], filas: (string | number)[][], anchos: number[]) => {
      const ws = XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
      ws['!cols'] = anchos.map((wch) => ({ wch }));
      ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length, 1), c: encabezado.length - 1 } }),
      };
      return ws;
    };

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
          'Faltas', 'Justificadas', '% Inasistencia', 'Fechas de ausencia', 'Fechas justificadas', 'Nivel de alerta',
          'Acción requerida',
        ],
        filasMatriz,
        [26, 14, 28, 9, 24, 15, 10, 10, 8, 11, 12, 30, 30, 14, 40]
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

    XLSX.writeFile(wb, `Informe_Consolidado_Talleres_${fechaLocalISO()}.xlsx`);
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
}

export const exportService = new ExportService();

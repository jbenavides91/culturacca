import * as XLSX from 'xlsx';
import { AlertaEstudiante, Asistencia, Estudiante, Grupo, Sesion } from '../types/attendance';
import { storageService } from './storage.service';
import { nombreInstitucion } from '../utils/institucion';
import { fechaLocalISO } from '../utils/fechas';

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
   * Genera y descarga un informe en Excel consolidado institucional (todos los talleres o el seleccionado)
   */
  exportConsolidatedExcel(grupoId?: string): void {
    if (grupoId && grupoId !== 'TODOS') {
      this.exportGroupToExcel(grupoId);
      return;
    }

    const grupos = storageService.getGrupos();
    const config = storageService.getConfiguracion();
    const todasAlertas = storageService.calcularAlertasEstudiantes();
    const asistencias = storageService.getAsistencias();
    const estudiantes = storageService.getEstudiantes();
    const sesiones = storageService.getSesiones();

    const wb = XLSX.utils.book_new();

    // 1. Hoja: Resumen Institucional
    const summaryData = [
      [nombreInstitucion().toUpperCase()],
      ['INFORME EJECUTIVO CONSOLIDADO DE ASISTENCIA'],
      [''],
      ['Ciclo Académico:', config.ciclo_academico_actual],
      ['Fecha de Emisión:', new Date().toLocaleDateString('es-ES')],
      ['Total de Talleres Activos:', grupos.length],
      ['Total Alumnos Matriculados:', estudiantes.length],
      ['Total Sesiones Programadas:', sesiones.length],
      ['Sesiones Concluidas:', sesiones.filter((s) => s.cerrada).length],
      ['Alumnos en Alerta Crítica:', todasAlertas.filter((a) => a.nivel_alerta === 'CRITICA').length],
      ['Alumnos con Advertencia:', todasAlertas.filter((a) => a.nivel_alerta === 'ADVERTENCIA').length],
      [''],
      ['PARÁMETROS DE EVALUACIÓN'],
      ['Límite de Faltas Permitidas:', `${config.limite_ausencias_alerta} faltas`],
      ['Porcentaje Máximo de Inasistencia:', `${config.porcentaje_inasistencia_alerta}%`],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Institucional');

    // 2. Hoja: Registro Global de Alertas
    const headerAlerts = ['Matrícula', 'Estudiante', 'Taller', 'Tutor Responsable', 'Correo Tutor', 'Faltas Acumuladas', '% Inasistencia', 'Nivel de Alerta', 'Acción Requerida'];
    const alertRows = todasAlertas.map((a) => [
      a.matricula,
      a.estudiante_nombre,
      a.grupo_nombre,
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
    XLSX.utils.book_append_sheet(wb, wsAlerts, 'Alertas de Inasistencia');

    // 3. Matriz de cada taller en su propia pestaña
    grupos.forEach((grupo, idx) => {
      const gEstudiantes = storageService.getEstudiantesByGrupo(grupo.id);
      const gSesiones = storageService.getSesionesByGrupo(grupo.id);
      const gAlertas = storageService.calcularAlertasEstudiantes(grupo.id);

      const fechas = gSesiones.map((s) => `${s.fecha} (${s.cerrada ? 'Cerrada' : 'Pendiente'})`);
      const headerRow = ['Matrícula', 'Estudiante', 'Tutor', 'Teléfono Tutor', ...fechas, 'Total Asistencias', 'Total Faltas', 'Total Justificadas', '% Inasistencia', 'Estatus Alerta'];

      const matrixRows = gEstudiantes.map((est) => {
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

        gSesiones.forEach((ses) => {
          const asist = asistencias.find((a) => a.sesion_id === ses.id && a.estudiante_id === est.id);
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

        const totalCerradas = gSesiones.filter((s) => s.cerrada).length;
        const pct = totalCerradas > 0 ? Math.round((ausentes / totalCerradas) * 1000) / 10 : 0;
        const alerta = gAlertas.find((a) => a.estudiante_id === est.id);

        row.push(presentes, ausentes, justificadas, `${pct}%`, alerta?.nivel_alerta || 'NORMAL');
        return row;
      });

      const wsMatrix = XLSX.utils.aoa_to_sheet([headerRow, ...matrixRows]);
      // Nombres de pestaña en Excel soportan máx 31 caracteres
      const safeSheetName = `${idx + 1}. ${grupo.nombre.slice(0, 25).trim()}`.replace(/[:\\/?*[\]]/g, '_');
      XLSX.utils.book_append_sheet(wb, wsMatrix, safeSheetName);
    });

    const fileName = `Informe_Consolidado_Talleres_${fechaLocalISO()}.xlsx`;
    XLSX.writeFile(wb, fileName);
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

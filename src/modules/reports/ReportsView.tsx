import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Printer,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Filter,
  Palette,
  ShieldAlert,
  Receipt,
  CalendarCheck,
  NotebookPen,
} from 'lucide-react';
import { AlertaEstudiante, Grupo, Perfil } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { exportService } from '../../services/export.service';
import { ReceiptsHistoryTab } from './ReceiptsHistoryTab';
import { AnecdotarioHistoryTab } from './AnecdotarioHistoryTab';
import { cicloActual, nombreInstitucion } from '../../utils/institucion';

interface ReportsViewProps {
  currentProfile: Perfil;
}

type ReportTab = 'asistencia' | 'recibos' | 'anecdotario';

export const ReportsView: React.FC<ReportsViewProps> = ({ currentProfile }) => {
  const availableTabs: ReportTab[] =
    currentProfile.rol === 'ADMIN'
      ? ['asistencia', 'recibos', 'anecdotario']
      : currentProfile.rol === 'CAJERO'
      ? ['recibos']
      : ['asistencia', 'anecdotario'];
  const [activeTab, setActiveTab] = useState<ReportTab>(availableTabs[0]);
  const reportTab: ReportTab = availableTabs.includes(activeTab) ? activeTab : availableTabs[0];

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [selectedGrupoId, setSelectedGrupoId] = useState<string>('TODOS');
  const [alertas, setAlertas] = useState<AlertaEstudiante[]>([]);
  const [config, setConfig] = useState(storageService.getConfiguracion());
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const loadData = () => {
    let allGrupos = storageService.getGrupos();
    if (currentProfile.rol === 'PROFESOR') {
      allGrupos = allGrupos.filter((g) => g.profesor_id === currentProfile.id);
    }
    setGrupos(allGrupos);
    setAlertas(storageService.calcularAlertasEstudiantes());
    setConfig(storageService.getConfiguracion());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToData(() => loadData());
    return () => unsub();
  }, [currentProfile.id, currentProfile.rol]);

  const filteredAlertas = useMemo(() => {
    let base = alertas;
    if (currentProfile.rol === 'PROFESOR') {
      const myGroupIds = new Set(grupos.map((g) => g.id));
      base = base.filter((a) => myGroupIds.has(a.grupo_id));
    }
    if (selectedGrupoId === 'TODOS') return base;
    return base.filter((a) => a.grupo_id === selectedGrupoId);
  }, [alertas, selectedGrupoId, currentProfile.rol, grupos]);

  const stats = useMemo(() => {
    const total = filteredAlertas.length;
    const criticas = filteredAlertas.filter((a) => a.nivel_alerta === 'CRITICA').length;
    const advertencias = filteredAlertas.filter((a) => a.nivel_alerta === 'ADVERTENCIA').length;
    const regulares = total - criticas - advertencias;

    let sumPresentes = 0;
    let sumAusencias = 0;
    filteredAlertas.forEach((a) => {
      sumPresentes += a.total_asistencias;
      sumAusencias += a.total_ausencias;
    });
    const totalRegistros = sumPresentes + sumAusencias;
    const globalRate = totalRegistros > 0 ? Math.round((sumPresentes / totalRegistros) * 100) : 100;

    return { total, criticas, advertencias, regulares, globalRate };
  }, [filteredAlertas]);

  const handleExportExcel = () => {
    exportService.exportConsolidatedExcel(selectedGrupoId);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fadeIn">
      {/* Printable Document Modal */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs p-4 sm:p-8 flex justify-center animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-8 space-y-6 print:p-0 print:shadow-none border border-slate-200">
            {/* Print Header Controls (Hidden when printing) */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
              <span className="text-xs font-bold text-slate-500 uppercase">Vista Previa de Impresión Oficial</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-[#4F46E5] text-white text-xs font-bold rounded-lg shadow hover:bg-[#4338CA] transition flex items-center space-x-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Guardar como PDF</span>
                </button>
                <button
                  onClick={() => setShowPrintPreview(false)}
                  className="px-3 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Official Institutional Letterhead */}
            <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                  Informe Oficial de Asistencia
                </span>
                <h2 className="text-xl font-extrabold text-slate-900">
                  {nombreInstitucion().toUpperCase()}
                </h2>
                <p className="text-xs text-slate-500">
                  Sistema Automatizado de Control de Talleres Vespertinos • {cicloActual()}
                </p>
              </div>
              <div className="text-right text-xs font-mono text-slate-500">
                <p>Fecha de emisión: {new Date().toLocaleDateString('es-ES')}</p>
                <p>Generado por: {currentProfile.nombre} {currentProfile.apellido}</p>
              </div>
            </div>

            {/* Print Summary Table */}
            <div className="space-y-4">
              <table className="w-full text-left text-xs border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="p-2.5">Estudiante</th>
                    <th className="p-2.5">Matrícula</th>
                    <th className="p-2.5">Taller Asignado</th>
                    <th className="p-2.5 text-center">Faltas</th>
                    <th className="p-2.5 text-center">% Inasistencia</th>
                    <th className="p-2.5 text-right">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAlertas.map((a, i) => (
                    <tr key={i}>
                      <td className="p-2.5 font-bold">{a.estudiante_nombre}</td>
                      <td className="p-2.5 font-mono">{a.matricula}</td>
                      <td className="p-2.5">{a.grupo_nombre}</td>
                      <td className="p-2.5 text-center font-bold text-rose-600">{a.total_ausencias}</td>
                      <td className="p-2.5 text-center font-mono">{a.porcentaje_inasistencia}%</td>
                      <td className="p-2.5 text-right font-bold">
                        {a.nivel_alerta === 'CRITICA' ? 'ALERTA CRÍTICA' : a.nivel_alerta === 'ADVERTENCIA' ? 'ADVERTENCIA' : 'REGULAR'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-8 border-t border-slate-200 text-center text-xs text-slate-400">
              Documento expedido para fines académicos y de seguimiento tutorial.
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E7EAF0] dark:border-[#2B3442]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#172033] dark:text-[#F1F5F9] tracking-tight">
            {currentProfile.rol === 'PROFESOR'
              ? 'Reportes de Asistencia y Anecdotario'
              : currentProfile.rol === 'CAJERO'
              ? 'Reportes de Caja'
              : 'Reportes Consolidados y Matriz de Asistencia'}
          </h1>
          <p className="text-xs text-[#667085] dark:text-[#94A3B8] mt-1">
            {currentProfile.rol === 'PROFESOR'
              ? 'Seguimiento de ausentismo, alertas de tus talleres asignados e historial de tus anotaciones del anecdotario.'
              : currentProfile.rol === 'CAJERO'
              ? 'Historial de recibos contables y pagos registrados en la ventanilla de Caja.'
              : 'Análisis de ausentismo estudiantil, alertas tempranas, historial de recibos, anecdotario y exportación de informes institucionales.'}
          </p>
        </div>

        {/* Action Buttons */}
        {reportTab === 'asistencia' && (
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setShowPrintPreview(true)}
            className="px-3.5 py-2 rounded-lg bg-white dark:bg-[#1B222D] hover:bg-slate-50 dark:hover:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] text-xs font-semibold border border-[#E7EAF0] dark:border-[#2B3442] transition flex items-center space-x-1.5 shadow-xs"
          >
            <Printer className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
            <span>Vista Imprimible / PDF</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition flex items-center space-x-2"
            title="Exportar informe en formato Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar Informe (.xlsx)</span>
          </button>
        </div>
        )}
      </div>

      {/* Report Tabs */}
      {availableTabs.length > 1 && (
        <div className="flex border-b border-[#E7EAF0] dark:border-[#2B3442] space-x-4 overflow-x-auto">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-xs font-bold transition flex items-center space-x-2 cursor-pointer border-b-2 whitespace-nowrap ${
                reportTab === tab
                  ? 'border-[#4F46E5] text-[#4F46E5] dark:text-[#818CF8]'
                  : 'border-transparent text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F1F5F9]'
              }`}
            >
              {tab === 'asistencia' ? (
                <>
                  <CalendarCheck className="w-4 h-4" />
                  <span>Matriz de Asistencia</span>
                </>
              ) : tab === 'anecdotario' ? (
                <>
                  <NotebookPen className="w-4 h-4" />
                  <span>Anecdotario</span>
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4" />
                  <span>Historial de Recibos y Pagos Contables</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {reportTab === 'recibos' ? (
        <ReceiptsHistoryTab />
      ) : reportTab === 'anecdotario' ? (
        <AnecdotarioHistoryTab currentProfile={currentProfile} />
      ) : (
      <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1B222D] p-5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs">
          <span className="text-[10px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block">
            Índice de Asistencia
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl lg:text-3xl font-bold text-[#172033] dark:text-[#F1F5F9] tabular-nums">
              {stats.globalRate}%
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-1 block">
            Promedio global del ciclo
          </span>
        </div>

        <div className="bg-white dark:bg-[#1B222D] p-5 rounded-xl border border-rose-200 dark:border-rose-900/50 shadow-xs">
          <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider block">
            Alertas Críticas ({config.limite_ausencias_alerta}+ faltas)
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl lg:text-3xl font-bold text-rose-700 dark:text-rose-400 tabular-nums">
              {stats.criticas}
            </span>
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-1 block">
            Estudiantes en alto riesgo
          </span>
        </div>

        <div className="bg-white dark:bg-[#1B222D] p-5 rounded-xl border border-amber-200 dark:border-amber-900/50 shadow-xs">
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
            Advertencias de Inasistencia
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl lg:text-3xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
              {stats.advertencias}
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-1 block">
            Estudiantes con 2 faltas
          </span>
        </div>

        <div className="bg-white dark:bg-[#1B222D] p-5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
            Asistencia Regular
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl lg:text-3xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {stats.regulares}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-1 block">
            Sin riesgo académico
          </span>
        </div>
      </div>

      {/* Filter by Workshop */}
      <div className="bg-white dark:bg-[#1B222D] rounded-xl p-3.5 shadow-xs border border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-[#667085] dark:text-[#94A3B8]" />
          <span className="text-xs font-semibold text-[#172033] dark:text-[#F1F5F9]">Filtrar por Taller:</span>
          <select
            value={selectedGrupoId}
            onChange={(e) => setSelectedGrupoId(e.target.value)}
            className="text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] p-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] font-semibold"
          >
            <option value="TODOS">Todos los Talleres ({grupos.length})</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-mono">
          {filteredAlertas.length} registros evaluados
        </span>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-[#1B222D] rounded-xl shadow-xs border border-[#E7EAF0] dark:border-[#2B3442] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F7F8FA] dark:bg-[#151A22] border-b border-[#E7EAF0] dark:border-[#2B3442] text-[11px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider">
                <th className="py-3.5 px-5">Estudiante / Matrícula</th>
                <th className="py-3.5 px-4">Taller Vespertino</th>
                <th className="py-3.5 px-4 text-center">Faltas Registradas</th>
                <th className="py-3.5 px-4 text-center">% Inasistencia</th>
                <th className="py-3.5 px-5 text-right">Estatus de Alerta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442] text-xs">
              {filteredAlertas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#667085] dark:text-[#94A3B8]">
                    No hay registros de alerta para el taller seleccionado.
                  </td>
                </tr>
              ) : (
                filteredAlertas.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                        {item.estudiante_nombre}
                      </div>
                      <span className="text-[11px] font-mono text-[#667085] dark:text-[#94A3B8]">{item.matricula}</span>
                    </td>

                    <td className="py-3.5 px-4 text-xs font-medium text-[#172033] dark:text-[#F1F5F9]">
                      {item.grupo_nombre}
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono font-bold text-xs tabular-nums">
                      <span
                        className={
                          item.total_ausencias >= config.limite_ausencias_alerta
                            ? 'text-rose-600 dark:text-rose-400'
                            : item.total_ausencias > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {item.total_ausencias}
                      </span>
                      <span className="text-slate-400 text-[11px]"> / {item.sesiones_cerradas} sesiones</span>
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono text-xs tabular-nums">
                      <div className="inline-flex items-center space-x-1.5">
                        <div className="w-16 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.porcentaje_inasistencia >= 30
                                ? 'bg-rose-500'
                                : item.porcentaje_inasistencia > 0
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(item.porcentaje_inasistencia, 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-[#172033] dark:text-[#F1F5F9]">
                          {item.porcentaje_inasistencia}%
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      {item.nivel_alerta === 'CRITICA' ? (
                        <span className="bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          <span>Crítica ({item.total_ausencias} faltas)</span>
                        </span>
                      ) : item.nivel_alerta === 'ADVERTENCIA' ? (
                        <span className="bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span>Advertencia</span>
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                          Regular
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
};

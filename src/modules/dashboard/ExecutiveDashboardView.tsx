import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Palette,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { storageService, subscribeToData } from '../../services/storage.service';
import { AttendanceStatusPanel } from './AttendanceStatusPanel';
import { Grupo, Sesion, Asistencia, Estudiante, Tutor, Perfil } from '../../types/attendance';

interface ExecutiveDashboardViewProps {
  currentProfile: Perfil;
  onNavigateTab: (tab: 'asistencia' | 'grupos' | 'maestros' | 'estudiantes' | 'reportes' | 'config') => void;
  onSelectWorkshop: (grupoId: string, sesionId?: string) => void;
}

export const ExecutiveDashboardView: React.FC<ExecutiveDashboardViewProps> = ({
  currentProfile,
  onNavigateTab,
  onSelectWorkshop,
}) => {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [tutores, setTutores] = useState<Tutor[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);

  const loadData = () => {
    setPerfiles(storageService.getPerfiles());
    setGrupos(storageService.getGrupos());
    setSesiones(storageService.getSesiones());
    setEstudiantes(storageService.getEstudiantes());
    setAsistencias(storageService.getAsistencias());
    setTutores(storageService.getTutores());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToData(() => loadData());
    return () => unsub();
  }, []);

  // Compute metrics
  const stats = useMemo(() => {
    const totalRecords = asistencias.length;
    const presentes = asistencias.filter((a) => a.estatus === 'PRESENTE').length;
    const ausentes = asistencias.filter((a) => a.estatus === 'AUSENTE').length;
    const justificados = asistencias.filter((a) => a.estatus === 'JUSTIFICADO').length;

    const tasaAsistencia = totalRecords > 0 ? Math.round((presentes / totalRecords) * 100) : 0;
    const tasaJustificada = totalRecords > 0 ? Math.round((justificados / totalRecords) * 100) : 0;

    const sesionesCerradas = sesiones.filter((s) => s.cerrada).length;
    const sesionesTotales = sesiones.length;
    const progresoCiclo = sesionesTotales > 0 ? Math.round((sesionesCerradas / sesionesTotales) * 100) : 0;

    // Students with in-risk absences using calcularAlertasEstudiantes
    const allAlerts = storageService.calcularAlertasEstudiantes();
    const enRiesgoCritico = allAlerts.filter((a) => a.tiene_alerta);

    return {
      totalRecords,
      presentes,
      ausentes,
      justificados,
      tasaAsistencia,
      tasaJustificada,
      sesionesCerradas,
      sesionesTotales,
      progresoCiclo,
      enRiesgoCritico,
    };
  }, [asistencias, sesiones, estudiantes, grupos, tutores]);

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fadeIn">
      {/* Executive Welcome & Header */}
      <div className="pb-6 border-b border-[#E7EAF0] dark:border-[#2B3442]">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9]">
          Dashboard
        </h1>
      </div>

      {/* KPI Cards Strip (Stripe / Linear style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white dark:bg-[#1B222D] p-5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs">
          <div className="flex items-center justify-between text-[#667085] dark:text-[#94A3B8] text-xs font-medium">
            <span>Tasa de Asistencia Global</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl lg:text-3xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9] tabular-nums">
              {stats.tasaAsistencia}%
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              +{stats.tasaJustificada}% justificado
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${stats.tasaAsistencia}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
            {stats.presentes} asistencias registradas en total
          </p>
        </div>

        {/* Metric 2 */}
        <div className="bg-white dark:bg-[#1B222D] p-5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs">
          <div className="flex items-center justify-between text-[#667085] dark:text-[#94A3B8] text-xs font-medium">
            <span>Sesiones Concluidas</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl lg:text-3xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9] tabular-nums">
              {stats.sesionesCerradas} / {stats.sesionesTotales}
            </span>
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              ({stats.progresoCiclo}%)
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${stats.progresoCiclo}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
            {sesiones.filter((s) => !s.cerrada).length} sesiones pendientes
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-white dark:bg-[#1B222D] p-5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs">
          <div className="flex items-center justify-between text-[#667085] dark:text-[#94A3B8] text-xs font-medium">
            <span>Alertas de Inasistencia</span>
            <AlertTriangle className={`w-4 h-4 ${stats.enRiesgoCritico.length > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl lg:text-3xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9] tabular-nums">
              {stats.enRiesgoCritico.length}
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              {stats.enRiesgoCritico.length === 1 ? 'Alumno en riesgo' : 'Alumnos en riesgo'}
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                stats.enRiesgoCritico.length > 0 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(stats.enRiesgoCritico.length * 25, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
            Inasistencias acumuladas sin justificar
          </p>
        </div>

        {/* Metric 4 */}
        <div className="bg-white dark:bg-[#1B222D] p-5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs">
          <div className="flex items-center justify-between text-[#667085] dark:text-[#94A3B8] text-xs font-medium">
            <span>Talleres & Comunidad</span>
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl lg:text-3xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9] tabular-nums">
              {grupos.length}
            </span>
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              talleres activos
            </span>
          </div>
          <div className="mt-3 flex items-center space-x-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
            <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">{estudiantes.length}</span> alumnos matriculados
            <span>•</span>
            <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">{tutores.length}</span> tutores
          </div>
        </div>
      </div>

      {/* Estatus de toma de asistencia por sesión, con filtros */}
      <AttendanceStatusPanel
        grupos={grupos}
        sesiones={sesiones}
        asistencias={asistencias}
        perfiles={perfiles}
        onPasarLista={onSelectWorkshop}
      />

      {/* Main Grid: Workshops Overview & Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Workshops Status Table (2 spans) */}
        <div className="lg:col-span-2 bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] overflow-hidden shadow-xs">
          <div className="p-5 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
                Rendimiento por Taller Vespertino
              </h2>            </div>
            <button
              onClick={() => onNavigateTab('grupos')}
              className="text-xs font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:underline flex items-center space-x-1"
            >
              <span>Ver talleres</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F8FA] dark:bg-[#151A22] text-[#667085] dark:text-[#94A3B8] font-semibold border-b border-[#E7EAF0] dark:border-[#2B3442]">
                <tr>
                  <th className="py-3 px-4">Taller & Aula</th>
                  <th className="py-3 px-4">Horario</th>
                  <th className="py-3 px-4 text-center">Matrícula</th>
                  <th className="py-3 px-4">Avance Sesiones</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
                {grupos.map((grupo) => {
                  const gSesiones = sesiones.filter((s) => s.grupo_id === grupo.id);
                  const cerradas = gSesiones.filter((s) => s.cerrada).length;
                  const gEstudiantes = storageService.getEstudiantesByGrupo(grupo.id);
                  const pct = gSesiones.length > 0 ? Math.round((cerradas / gSesiones.length) * 100) : 0;

                  return (
                    <tr
                      key={grupo.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                          {grupo.nombre}
                        </div>
                        <div className="text-[11px] text-[#667085] dark:text-[#94A3B8] flex items-center space-x-1 mt-0.5">
                          <span>{grupo.aula || 'Taller Principal'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-[#667085] dark:text-[#94A3B8]">
                        {grupo.hora_inicio} - {grupo.hora_fin}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-[#172033] dark:text-[#F1F5F9] tabular-nums">
                        {gEstudiantes.length}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 w-24 overflow-hidden">
                            <div
                              className="bg-[#4F46E5] dark:bg-[#818CF8] h-1.5 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-[#667085] dark:text-[#94A3B8] tabular-nums">
                            {cerradas}/{gSesiones.length}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => {
                            onSelectWorkshop(grupo.id);
                            onNavigateTab('asistencia');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8] hover:bg-[#E0E7FF] dark:hover:bg-indigo-950 transition-colors"
                        >
                          Pasar Lista
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Critical Alert Watchlist */}
        <div className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex flex-col">
          <div className="p-5 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
                Monitoreo de Ausentismo
              </h2>
            </div>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              {stats.enRiesgoCritico.length} Casos
            </span>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-3">
            {stats.enRiesgoCritico.length === 0 ? (
              <div className="py-10 text-center text-[#667085] dark:text-[#94A3B8]">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-semibold">Sin alertas críticas de ausentismo</p>
                <p className="text-[11px] text-slate-400 mt-1">Todos los alumnos mantienen asistencia regular.</p>
              </div>
            ) : (
              stats.enRiesgoCritico.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-bold text-[#172033] dark:text-[#F1F5F9] block">
                        {item.estudiante_nombre}
                      </span>
                      <span className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                        {item.grupo_nombre}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-900">
                      {item.total_ausencias} inasistencias
                    </span>
                  </div>

                  <div className="text-[11px] text-[#667085] dark:text-[#94A3B8] border-t border-amber-200/60 dark:border-amber-900/40 pt-2 flex items-center justify-between">
                    <span>Tutor: {item.tutor_nombre || 'N/A'}</span>
                    <button
                      onClick={() => onNavigateTab('estudiantes')}
                      className="text-[#4F46E5] dark:text-[#818CF8] hover:underline font-semibold text-[11px] flex items-center space-x-1"
                    >
                      <Users className="w-3 h-3" />
                      <span>Ver ficha</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-center">
            <button
              onClick={() => onNavigateTab('estudiantes')}
              className="text-xs font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:underline"
            >
              Consultar directorio de estudiantes & tutores
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

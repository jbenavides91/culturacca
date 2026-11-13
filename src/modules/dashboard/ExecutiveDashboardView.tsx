import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { storageService, subscribeToData } from '../../services/storage.service';
import { AttendanceStatusPanel } from './AttendanceStatusPanel';
import { UpcomingClassesCard } from './UpcomingClassesCard';
import { DashboardKpis } from './DashboardKpis';
import { AbsenteeismMonitorCard } from './AbsenteeismMonitorCard';
import { Grupo, Sesion, Asistencia, Estudiante, Tutor, Perfil } from '../../types/attendance';

interface ExecutiveDashboardViewProps {
  currentProfile: Perfil;
  onNavigateTab: (tab: 'asistencia' | 'grupos' | 'estudiantes' | 'reportes' | 'config') => void;
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

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fadeIn">
      {/* Executive Welcome & Header */}
      <div className="pb-6 border-b border-[#E7EAF0] dark:border-[#2B3442]">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9]">
          Dashboard
        </h1>
      </div>

      {/* Indicadores con filtros propios de período y taller */}
      <DashboardKpis
        grupos={grupos}
        sesiones={sesiones}
        asistencias={asistencias}
        estudiantes={estudiantes}
        tutores={tutores}
        perfiles={perfiles}
      />

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

        {/* Right Column: Próximas clases + Critical Alert Watchlist */}
        <div className="flex flex-col gap-6 min-w-0">
        <UpcomingClassesCard grupos={grupos} sesiones={sesiones} perfiles={perfiles} />

        <AbsenteeismMonitorCard
          grupos={grupos}
          perfiles={perfiles}
          sesiones={sesiones}
          asistencias={asistencias}
          onVerEstudiantes={() => onNavigateTab('estudiantes')}
        />
        </div>
      </div>
    </div>
  );
};

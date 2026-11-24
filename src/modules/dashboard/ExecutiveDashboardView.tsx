import React, { useState, useEffect } from 'react';
import { storageService, subscribeToData } from '../../services/storage.service';
import { AttendanceStatusPanel } from './AttendanceStatusPanel';
import { UpcomingClassesCard } from './UpcomingClassesCard';
import { DashboardKpis } from './DashboardKpis';
import { AbsenteeismMonitorCard } from './AbsenteeismMonitorCard';
import { TalleresDelDiaCard } from './TalleresDelDiaCard';
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
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-8 animate-fadeIn">
      {/* Executive Welcome & Header */}
      <div className="pb-3 sm:pb-6 border-b border-[#E7EAF0] dark:border-[#2B3442]">
        <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9]">
          Área de Cultura
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

      {/* Main Grid: Talleres del día, Próximas clases y Monitoreo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Talleres con clase en el día elegido (2 columnas) */}
        <TalleresDelDiaCard
          grupos={grupos}
          sesiones={sesiones}
          asistencias={asistencias}
          perfiles={perfiles}
          onPasarLista={onSelectWorkshop}
          onVerTalleres={() => onNavigateTab('grupos')}
        />

        {/* Right Column: Próximas clases + Critical Alert Watchlist */}
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
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

import React, { useState } from 'react';
import { CalendarCheck, CalendarRange, History, NotebookPen, Receipt } from 'lucide-react';
import { Perfil } from '../../types/attendance';
import { ReceiptsHistoryTab } from './ReceiptsHistoryTab';
import { AnecdotarioHistoryTab } from './AnecdotarioHistoryTab';
import { CorteBimestralTab } from './CorteBimestralTab';
import { MatrizAsistenciaTab } from './MatrizAsistenciaTab';
import { PermanenciaTab } from './PermanenciaTab';

interface ReportsViewProps {
  currentProfile: Perfil;
}

type ReportTab = 'asistencia' | 'recibos' | 'corte' | 'anecdotario' | 'permanencia';

const TABS: Record<ReportTab, { label: string; icon: React.ElementType }> = {
  asistencia: { label: 'Matriz de Asistencia', icon: CalendarCheck },
  recibos: { label: 'Historial de Recibos y Pagos Contables', icon: Receipt },
  corte: { label: 'Corte bimestral', icon: CalendarRange },
  anecdotario: { label: 'Anecdotario', icon: NotebookPen },
  permanencia: { label: 'Permanencia', icon: History },
};

export const ReportsView: React.FC<ReportsViewProps> = ({ currentProfile }) => {
  const availableTabs: ReportTab[] =
    currentProfile.rol === 'ADMIN'
      ? ['asistencia', 'recibos', 'corte', 'anecdotario', 'permanencia']
      : currentProfile.rol === 'CAJERO'
      ? ['recibos', 'corte']
      : ['asistencia', 'anecdotario', 'permanencia'];
  const [activeTab, setActiveTab] = useState<ReportTab>(availableTabs[0]);
  const reportTab: ReportTab = availableTabs.includes(activeTab) ? activeTab : availableTabs[0];

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="pb-3 sm:pb-4 border-b border-[#E7EAF0] dark:border-[#2B3442]">
        <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-[#172033] dark:text-[#F1F5F9] tracking-tight">
          {currentProfile.rol === 'PROFESOR'
            ? 'Reportes de Asistencia y Anecdotario'
            : currentProfile.rol === 'CAJERO'
            ? 'Reportes de Caja'
            : 'Reportes Consolidados y Matriz de Asistencia'}
        </h1>
        <p className="text-[11px] sm:text-xs text-[#667085] dark:text-[#94A3B8] mt-1">
          {currentProfile.rol === 'PROFESOR'
            ? 'Inasistencias e indisciplina por bimestre de tus talleres, historial de tus anotaciones del anecdotario y permanencia de tus alumnos.'
            : currentProfile.rol === 'CAJERO'
            ? 'Historial de recibos contables y corte bimestral: cobro esperado, altas y bajas, y matrículas cobradas.'
            : 'Inasistencias e indisciplina por bimestre, historial de recibos, corte bimestral, anecdotario, permanencia de alumnos y exportación de informes institucionales.'}
        </p>
      </div>

      {/* Report Tabs */}
      {availableTabs.length > 1 && (
        <div className="flex border-b border-[#E7EAF0] dark:border-[#2B3442] space-x-4 overflow-x-auto">
          {availableTabs.map((tab) => {
            const { label, icon: Icon } = TABS[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-xs font-bold transition flex items-center space-x-2 cursor-pointer border-b-2 whitespace-nowrap ${
                  reportTab === tab
                    ? 'border-[#4F46E5] text-[#4F46E5] dark:text-[#818CF8]'
                    : 'border-transparent text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F1F5F9]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {reportTab === 'recibos' ? (
        <ReceiptsHistoryTab />
      ) : reportTab === 'anecdotario' ? (
        <AnecdotarioHistoryTab currentProfile={currentProfile} />
      ) : reportTab === 'permanencia' ? (
        <PermanenciaTab currentProfile={currentProfile} />
      ) : reportTab === 'corte' ? (
        <CorteBimestralTab currentProfile={currentProfile} />
      ) : (
        <MatrizAsistenciaTab currentProfile={currentProfile} />
      )}
    </div>
  );
};

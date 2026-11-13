import React, { useState } from 'react';
import { Calendar, CheckCircle2, AlertCircle, X, Loader2, Sparkles } from 'lucide-react';
import { Grupo, Sesion } from '../../types/attendance';
import { calendarService, CalendarSyncResult } from '../../services/calendar.service';
import { signInWithGoogle } from '../../services/auth.service';

interface GoogleCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  grupo: Grupo | null;
  sesiones: Sesion[];
  instructorName: string;
  isGoogleAuthenticated?: boolean;
}

export const GoogleCalendarModal: React.FC<GoogleCalendarModalProps> = ({
  isOpen,
  onClose,
  grupo,
  sesiones,
  instructorName,
  isGoogleAuthenticated = true,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalendarSyncResult | null>(null);

  if (!isOpen || !grupo) return null;

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (!isGoogleAuthenticated) {
        await signInWithGoogle();
      }
      const syncRes = await calendarService.syncBatchSessions(grupo, sesiones, instructorName);
      setResult(syncRes);
    } catch (err: unknown) {
      setResult({
        success: false,
        syncedEventsCount: 0,
        message: err instanceof Error ? err.message : 'Error al sincronizar con Google Calendar',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9]">
        {/* Header */}
        <div className="bg-[#172033] dark:bg-[#151A22] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center border border-blue-500/40">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold">
                Sincronización con Google Calendar
              </h3>
              <p className="text-xs text-slate-300">
                {grupo.nombre} • {sesiones.length} Sesiones
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          <div className="bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase">Detalles del Taller</span>
              <span className="text-xs font-mono font-bold text-[#4F46E5] dark:text-[#818CF8] bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-900">
                {grupo.hora_inicio} - {grupo.hora_fin}
              </span>
            </div>
            <p className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">{grupo.nombre}</p>
            <p className="text-xs text-[#667085] dark:text-[#94A3B8] mt-1">
              <strong>Aula:</strong> {grupo.aula || 'Taller Principal'} • <strong>Docente:</strong> {instructorName}
            </p>
            <p className="text-xs text-[#667085] dark:text-[#94A3B8] mt-0.5">
              Ciclo: {grupo.fecha_inicio_ciclo} al {grupo.fecha_fin_ciclo} ({sesiones.length} sesiones en total)
            </p>
          </div>

          <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-3 text-blue-900 dark:text-blue-200 space-y-1">
            <p className="font-semibold flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Eventos en tu Google Calendar institucional</span>
            </p>
            <p className="text-blue-800 dark:text-blue-300">
              Se agendarán los eventos correspondientes a las sesiones del taller en tu calendario principal, incluyendo recordatorios previos de 30 y 120 minutos, detalles del aula y enlace al sistema de asistencia.
            </p>
          </div>

          {result && (
            <div
              className={`p-3.5 rounded-xl border ${
                result.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold">
                {result.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                )}
                <span>{result.message}</span>
              </div>
              {result.errors && (
                <ul className="list-disc list-inside mt-2 text-rose-800 dark:text-rose-300 space-y-0.5">
                  {result.errors.slice(0, 3).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#E7EAF0] dark:border-[#2B3442]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#151A22] transition"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-xs transition flex items-center space-x-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sincronizando...</span>
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  <span>Sincronizar Eventos Ahora</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

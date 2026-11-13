import React from 'react';
import { CheckCircle, AlertTriangle, Mail, Send, X, ShieldAlert } from 'lucide-react';
import { Asistencia, Estudiante, Grupo, Sesion, Tutor } from '../../types/attendance';

interface CloseSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sesion: Sesion;
  grupo: Grupo;
  asistencias: Asistencia[];
  estudiantes: Estudiante[];
  tutores: Tutor[];
  isGoogleAuthenticated?: boolean;
}

export const CloseSessionModal: React.FC<CloseSessionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  sesion,
  grupo,
  asistencias,
  estudiantes,
  tutores,
  isGoogleAuthenticated = true,
}) => {
  if (!isOpen) return null;

  const presentes = asistencias.filter((a) => a.estatus === 'PRESENTE');
  const ausentes = asistencias.filter((a) => a.estatus === 'AUSENTE');
  const justificadas = asistencias.filter((a) => a.estatus === 'JUSTIFICADO');

  // Find info of students with absences
  const ausentesInfo = ausentes.map((a) => {
    const est = estudiantes.find((e) => e.id === a.estudiante_id);
    const tut = est ? tutores.find((t) => t.id === est.tutor_id) : undefined;
    return {
      asistencia: a,
      estudiante: est,
      tutor: tut,
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9]">
        {/* Header */}
        <div className="bg-[#172033] dark:bg-[#151A22] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#4F46E5] flex items-center justify-center text-white">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold">
                Finalizar y Cerrar Lista de Asistencia
              </h3>
              <p className="text-xs text-slate-300">
                {grupo.nombre} • Fecha: {sesion.fecha}
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
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#DCFCE7] dark:bg-[#052E16] border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl text-center">
              <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase block">Presentes</span>
              <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {presentes.length}
              </span>
            </div>

            <div className="bg-[#FEE2E2] dark:bg-[#450A0A] border border-rose-200 dark:border-rose-800 p-3 rounded-xl text-center">
              <span className="text-[10px] font-bold text-rose-800 dark:text-rose-300 uppercase block">Ausentes</span>
              <span className="text-xl font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                {ausentes.length}
              </span>
            </div>

            <div className="bg-[#FEF3C7] dark:bg-[#451A03] border border-amber-200 dark:border-amber-800 p-3 rounded-xl text-center">
              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase block">Justificados</span>
              <span className="text-xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {justificadas.length}
              </span>
            </div>
          </div>

          {/* Absence Notification Preview */}
          {ausentes.length > 0 ? (
            <div className="bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400 font-bold">
                <Mail className="w-4 h-4" />
                <span>Despacho Automatizado de Notificaciones ({ausentes.length})</span>
              </div>
              <p className="text-[#667085] dark:text-[#94A3B8]">
                Al confirmar, el sistema enviará correos electrónicos transaccionales con el membrete oficial del taller a los siguientes tutores legales:
              </p>

              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {ausentesInfo.map((info, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-white dark:bg-[#1B222D] p-2.5 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442]"
                  >
                    <div>
                      <span className="font-bold text-[#172033] dark:text-[#F1F5F9] block">
                        {info.estudiante?.nombre} {info.estudiante?.apellido}
                      </span>
                      <span className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                        Tutor: {info.tutor?.nombre || 'Sin tutor asignado'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-[11px] text-[#4F46E5] dark:text-[#818CF8] bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-900 block">
                        {info.tutor?.email || 'N/A'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-[#DCFCE7] dark:bg-[#052E16] border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-center">
              <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">¡Asistencia Completa!</h4>
              <p className="text-emerald-700 dark:text-emerald-300 mt-1">
                Todos los alumnos matriculados están marcados como presentes o debidamente justificados. No se requieren avisos de inasistencia a tutores.
              </p>
            </div>
          )}

          {/* Legal / Confirmation notice */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 rounded-xl text-amber-900 dark:text-amber-200 flex items-start space-x-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <p>
              Una vez cerrada la sesión, los registros quedan archivados para el cálculo de alertas. Cualquier corrección posterior se considerará una <strong>rectificación formal</strong> y enviará un aviso de actualización al tutor.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-3 pt-2 border-t border-[#E7EAF0] dark:border-[#2B3442]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#151A22] transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-xs transition flex items-center space-x-1.5"
            >
              <Send className="w-4 h-4" />
              <span>Confirmar y Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

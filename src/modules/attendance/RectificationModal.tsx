import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  FileEdit,
  Mail,
  AlertTriangle,
  ShieldCheck,
  Send,
  Loader2,
  Clock,
  User,
} from 'lucide-react';
import {
  Estudiante,
  Grupo,
  Sesion,
  Tutor,
  Asistencia,
  EstatusAsistencia,
} from '../../types/attendance';

interface RectificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  estudiante: Estudiante | null;
  tutor: Tutor | null;
  sesion: Sesion | null;
  grupo: Grupo | null;
  asistencia: Asistencia | null;
  initialTargetStatus?: EstatusAsistencia;
  onConfirm: (targetStatus: EstatusAsistencia, motivo: string) => Promise<void> | void;
}

export const RectificationModal: React.FC<RectificationModalProps> = ({
  isOpen,
  onClose,
  estudiante,
  tutor,
  sesion,
  grupo,
  asistencia,
  initialTargetStatus,
  onConfirm,
}) => {
  const currentStatus: EstatusAsistencia = asistencia ? asistencia.estatus : 'PRESENTE';

  const [selectedStatus, setSelectedStatus] = useState<EstatusAsistencia>(
    initialTargetStatus || (currentStatus === 'AUSENTE' ? 'PRESENTE' : currentStatus)
  );
  const [motivo, setMotivo] = useState(asistencia?.motivo_justificacion || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state whenever modal opens or target student changes
  useEffect(() => {
    if (isOpen) {
      const defaultStatus =
        initialTargetStatus || (currentStatus === 'AUSENTE' ? 'PRESENTE' : currentStatus);
      setSelectedStatus(defaultStatus);
      setMotivo(asistencia?.motivo_justificacion || '');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, estudiante, asistencia, initialTargetStatus, currentStatus]);

  if (!isOpen || !estudiante || !sesion) return null;

  const isTransitioningFromAbsent =
    currentStatus === 'AUSENTE' &&
    (selectedStatus === 'PRESENTE' || selectedStatus === 'JUSTIFICADO');

  const PRESET_MOTIVOS = [
    'Llegada tardía justificada en aula',
    'Corrección de error en pase de lista inicial',
    'Constancia médica presentada en secretaría',
    'Autorización de coordinación académica',
    'Justificante presentado formalmente por tutor',
    'Permiso institucional / Actividad académica',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If changing to JUSTIFICADO, requiring a reason is good practice
    if (selectedStatus === 'JUSTIFICADO' && !motivo.trim()) {
      setError('Por favor indica el motivo o selecciona una causa para la justificación.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(
        selectedStatus,
        motivo.trim() ||
          (selectedStatus === 'PRESENTE'
            ? 'Rectificación formal de asistencia en aula'
            : selectedStatus === 'JUSTIFICADO'
            ? 'Inasistencia justificada con comprobante'
            : 'Registro actualizado')
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al procesar la rectificación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9]">
        {/* Header */}
        <div className="bg-[#172033] dark:bg-[#151A22] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center space-x-2">
                <span>Rectificación Oficial de Asistencia</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Lista Cerrada
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                {sesion.fecha} • {grupo?.nombre}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Student & Tutor Card */}
          <div className="bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block">
                  Estudiante Evaluado
                </span>
                <span className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
                  {estudiante.nombre} {estudiante.apellido}
                </span>
                <span className="text-xs font-mono text-[#667085] dark:text-[#94A3B8] block">
                  Matrícula: {estudiante.matricula}
                </span>
              </div>

              {/* Current Status Badge */}
              <div className="text-right">
                <span className="text-[10px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block mb-1">
                  Estatus Actual
                </span>
                {currentStatus === 'AUSENTE' ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-900">
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Ausente</span>
                  </span>
                ) : currentStatus === 'PRESENTE' ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-900">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Presente</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-900">
                    <FileEdit className="w-3.5 h-3.5 stroke-[2]" />
                    <span>Justificado</span>
                  </span>
                )}
              </div>
            </div>

            {/* Tutor info */}
            <div className="pt-2 border-t border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between text-xs text-[#667085] dark:text-[#94A3B8]">
              <div className="flex items-center space-x-1.5 truncate">
                <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">Tutor: <strong className="text-[#172033] dark:text-[#F1F5F9]">{tutor?.nombre || 'Tutor Registrado'}</strong></span>
              </div>
              <span className="font-mono text-[11px] text-[#4F46E5] dark:text-[#818CF8] shrink-0">
                {tutor?.email || 'Sin correo asignado'}
              </span>
            </div>
          </div>

          {/* New Status Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#172033] dark:text-[#F1F5F9] uppercase tracking-wider block">
              Selecciona el Nuevo Estatus de Asistencia:
            </label>

            <div className="grid grid-cols-3 gap-2.5">
              {/* Option 1: PRESENTE */}
              <button
                type="button"
                onClick={() => setSelectedStatus('PRESENTE')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  selectedStatus === 'PRESENTE'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 ring-2 ring-emerald-500/25'
                    : 'border-[#E7EAF0] dark:border-[#2B3442] hover:border-emerald-300 bg-white dark:bg-[#1B222D]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                    selectedStatus === 'PRESENTE'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  }`}>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </span>
                  {selectedStatus === 'PRESENTE' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                </div>
                <div className="mt-2">
                  <span className="font-bold text-xs text-[#172033] dark:text-[#F1F5F9] block">
                    Presente
                  </span>
                  <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] leading-tight block">
                    En aula de clase
                  </span>
                </div>
              </button>

              {/* Option 2: JUSTIFICADO */}
              <button
                type="button"
                onClick={() => setSelectedStatus('JUSTIFICADO')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  selectedStatus === 'JUSTIFICADO'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 ring-2 ring-amber-500/25'
                    : 'border-[#E7EAF0] dark:border-[#2B3442] hover:border-amber-300 bg-white dark:bg-[#1B222D]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                    selectedStatus === 'JUSTIFICADO'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  }`}>
                    <FileEdit className="w-3.5 h-3.5 stroke-[2]" />
                  </span>
                  {selectedStatus === 'JUSTIFICADO' && (
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                  )}
                </div>
                <div className="mt-2">
                  <span className="font-bold text-xs text-[#172033] dark:text-[#F1F5F9] block">
                    Justificado
                  </span>
                  <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] leading-tight block">
                    Con comprobante
                  </span>
                </div>
              </button>

              {/* Option 3: AUSENTE */}
              <button
                type="button"
                onClick={() => setSelectedStatus('AUSENTE')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  selectedStatus === 'AUSENTE'
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 ring-2 ring-rose-500/25'
                    : 'border-[#E7EAF0] dark:border-[#2B3442] hover:border-rose-300 bg-white dark:bg-[#1B222D]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                    selectedStatus === 'AUSENTE'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                  }`}>
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  </span>
                  {selectedStatus === 'AUSENTE' && (
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                  )}
                </div>
                <div className="mt-2">
                  <span className="font-bold text-xs text-[#172033] dark:text-[#F1F5F9] block">
                    Ausente
                  </span>
                  <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] leading-tight block">
                    Inasistencia registrada
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Conditional Notification Re-dispatch Alert */}
          {isTransitioningFromAbsent ? (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3.5 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                <Mail className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="font-bold">
                  Reenvío Automático de Correo al Tutor Legal
                </p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  Al cambiar de <strong>Ausente</strong> a{' '}
                  <strong className="underline">
                    {selectedStatus === 'PRESENTE' ? 'Presente' : 'Justificado'}
                  </strong>
                  , el sistema enviará de inmediato un correo oficial a{' '}
                  <span className="font-mono font-semibold">{tutor?.email}</span> notificándole
                  que la inasistencia fue rectificada formalmente.
                </p>
              </div>
            </div>
          ) : currentStatus === selectedStatus ? (
            <div className="bg-slate-50 dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] p-3 rounded-xl text-xs text-[#667085] dark:text-[#94A3B8] flex items-center space-x-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>El estatus seleccionado es idéntico al actual. Puedes actualizar el motivo u observación de auditoría.</span>
            </div>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 rounded-xl text-xs text-blue-900 dark:text-blue-200 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Se actualizará el libro matriz oficial de la sesión cerrada con fecha y responsable de auditoría.</span>
            </div>
          )}

          {/* Motivo o Justificación */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#172033] dark:text-[#F1F5F9] flex items-center justify-between">
              <span>Motivo u Observación de la Rectificación:</span>
              {selectedStatus === 'JUSTIFICADO' && (
                <span className="text-[10px] text-rose-500 font-semibold">* Requerido para justificación</span>
              )}
            </label>
            <textarea
              rows={2}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Escribe la causa de la rectificación (aparecerá en el correo al tutor y en el expediente)..."
              className="w-full text-xs p-3 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4F46E5] resize-none"
            />

            {/* Quick preset chips */}
            <div className="pt-1">
              <span className="text-[10px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block mb-1">
                Causas Frecuentes:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_MOTIVOS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMotivo(preset)}
                    className="text-[10px] px-2 py-0.5 rounded-md border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-[#4F46E5] dark:hover:text-[#818CF8] text-[#667085] dark:text-[#94A3B8] transition cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-2 border-t border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] text-[#667085] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#151A22] transition disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-bold rounded-xl text-white shadow-xs transition flex items-center space-x-2 cursor-pointer ${
                isTransitioningFromAbsent
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[#4F46E5] hover:bg-[#4338CA]'
              } disabled:opacity-50`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Procesando y notificando...</span>
                </>
              ) : isTransitioningFromAbsent ? (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Rectificar y Notificar al Tutor</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Guardar Rectificación</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

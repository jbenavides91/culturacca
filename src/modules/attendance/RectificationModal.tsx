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

  const OPCIONES_ESTATUS: {
    valor: EstatusAsistencia;
    titulo: string;
    detalle: string;
    icono: React.ReactNode;
    activo: string;
    inactivo: string;
    chipActivo: string;
    chipInactivo: string;
    punto: string;
  }[] = [
    {
      valor: 'PRESENTE',
      titulo: 'Presente',
      detalle: 'En aula de clase',
      icono: <Check className="w-3.5 h-3.5 stroke-[2.5]" />,
      activo: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 ring-2 ring-emerald-500/25',
      inactivo: 'border-[#E7EAF0] dark:border-[#2B3442] hover:border-emerald-300 bg-white dark:bg-[#1B222D]',
      chipActivo: 'bg-emerald-600 text-white',
      chipInactivo: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300',
      punto: 'bg-emerald-500',
    },
    {
      valor: 'JUSTIFICADO',
      titulo: 'Justificado',
      detalle: 'Con comprobante',
      icono: <FileEdit className="w-3.5 h-3.5 stroke-[2]" />,
      activo: 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 ring-2 ring-amber-500/25',
      inactivo: 'border-[#E7EAF0] dark:border-[#2B3442] hover:border-amber-300 bg-white dark:bg-[#1B222D]',
      chipActivo: 'bg-amber-600 text-white',
      chipInactivo: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
      punto: 'bg-amber-500',
    },
    {
      valor: 'AUSENTE',
      titulo: 'Ausente',
      detalle: 'Inasistencia registrada',
      icono: <X className="w-3.5 h-3.5 stroke-[2.5]" />,
      activo: 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 ring-2 ring-rose-500/25',
      inactivo: 'border-[#E7EAF0] dark:border-[#2B3442] hover:border-rose-300 bg-white dark:bg-[#1B222D]',
      chipActivo: 'bg-rose-600 text-white',
      chipInactivo: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300',
      punto: 'bg-rose-500',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-xl w-full max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9]">
        {/* Header */}
        <div className="shrink-0 bg-[#172033] dark:bg-[#151A22] px-4 sm:px-6 py-3 sm:py-4 text-white flex items-center justify-between gap-2 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Rectificación Oficial de Asistencia</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Lista Cerrada
                </span>
              </h3>
              <p className="text-xs text-slate-300 truncate">
                {sesion.fecha} • {grupo?.nombre}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Cerrar"
            className="shrink-0 -mr-1.5 p-2.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-6 space-y-4 sm:space-y-5">
            {/* Student & Tutor Card */}
            <div className="bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl p-3 sm:p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block">
                    Estudiante Evaluado
                  </span>
                  <span className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] block break-words">
                    {estudiante.nombre} {estudiante.apellido}
                  </span>
                  <span className="text-xs font-mono text-[#667085] dark:text-[#94A3B8] block">
                    Matrícula: {estudiante.matricula}
                  </span>
                </div>

                {/* Current Status Badge */}
                <div className="text-right shrink-0">
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
              <div className="pt-2 border-t border-[#E7EAF0] dark:border-[#2B3442] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-[#667085] dark:text-[#94A3B8]">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">Tutor: <strong className="text-[#172033] dark:text-[#F1F5F9]">{tutor?.nombre || 'Tutor Registrado'}</strong></span>
                </div>
                <span className="font-mono text-[11px] text-[#4F46E5] dark:text-[#818CF8] break-all pl-5 sm:pl-0">
                  {tutor?.email || 'Sin correo asignado'}
                </span>
              </div>
            </div>

            {/* New Status Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#172033] dark:text-[#F1F5F9] uppercase tracking-wider block">
                Selecciona el Nuevo Estatus de Asistencia:
              </label>

              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {OPCIONES_ESTATUS.map((op) => {
                  const elegido = selectedStatus === op.valor;
                  return (
                    <button
                      key={op.valor}
                      type="button"
                      onClick={() => setSelectedStatus(op.valor)}
                      aria-pressed={elegido}
                      className={`min-h-11 p-2 sm:p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        elegido ? op.activo : op.inactivo
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                          elegido ? op.chipActivo : op.chipInactivo
                        }`}>
                          {op.icono}
                        </span>
                        {elegido && <span className={`w-2 h-2 rounded-full ${op.punto}`} />}
                      </div>
                      <div className="mt-1.5 sm:mt-2">
                        <span className="font-bold text-xs text-[#172033] dark:text-[#F1F5F9] block">
                          {op.titulo}
                        </span>
                        <span className="hidden sm:block text-[10px] text-[#667085] dark:text-[#94A3B8] leading-tight">
                          {op.detalle}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conditional Notification Re-dispatch Alert */}
            {isTransitioningFromAbsent ? (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3 sm:p-3.5 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="font-bold">
                    Reenvío Automático de Correo al Tutor Legal
                  </p>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                    Al cambiar de <strong>Ausente</strong> a{' '}
                    <strong className="underline">
                      {selectedStatus === 'PRESENTE' ? 'Presente' : 'Justificado'}
                    </strong>
                    , el sistema enviará de inmediato un correo oficial a{' '}
                    <span className="font-mono font-semibold break-all">{tutor?.email}</span> notificándole
                    que la inasistencia fue rectificada formalmente.
                  </p>
                </div>
              </div>
            ) : currentStatus === selectedStatus ? (
              <div className="bg-slate-50 dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] p-3 rounded-xl text-xs text-[#667085] dark:text-[#94A3B8] flex items-start gap-2">
                <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-px" />
                <span>El estatus seleccionado es idéntico al actual. Puedes actualizar el motivo u observación de auditoría.</span>
              </div>
            ) : (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 rounded-xl text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-px" />
                <span>Se actualizará el libro matriz oficial de la sesión cerrada con fecha y responsable de auditoría.</span>
              </div>
            )}

            {/* Motivo o Justificación */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#172033] dark:text-[#F1F5F9] flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                <span>Motivo u Observación de la Rectificación:</span>
                {selectedStatus === 'JUSTIFICADO' && (
                  <span className="text-[10px] text-rose-500 font-semibold">* Requerido para justificación</span>
                )}
              </label>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Escribe la causa de la rectificación (aparecerá en el correo al tutor y en el expediente)..."
                className="w-full text-base sm:text-xs p-3 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] placeholder-[#94A3B8] placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5] resize-none"
              />

              {/* Quick preset chips */}
              <div className="pt-1">
                <span className="text-[10px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block mb-1">
                  Causas Frecuentes:
                </span>
                <div className="flex sm:flex-wrap gap-1.5 overflow-x-auto sm:overflow-visible -mx-3.5 px-3.5 sm:mx-0 sm:px-0 pb-1 sm:pb-0">
                  {PRESET_MOTIVOS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setMotivo(preset);
                        if (error) setError(null);
                      }}
                      className={`shrink-0 whitespace-nowrap sm:whitespace-normal text-[11px] sm:text-[10px] px-2.5 sm:px-2 py-1.5 sm:py-0.5 rounded-md border transition cursor-pointer ${
                        motivo === preset
                          ? 'border-[#4F46E5] bg-indigo-50 dark:bg-indigo-950/40 text-[#4F46E5] dark:text-[#818CF8]'
                          : 'border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-[#4F46E5] dark:hover:text-[#818CF8] text-[#667085] dark:text-[#94A3B8]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Action Footer (always visible) */}
          <div className="shrink-0 border-t border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] px-3.5 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] grid grid-cols-[auto_1fr] sm:flex sm:items-center sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-11 sm:min-h-0 px-4 py-2 text-xs font-semibold rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] text-[#667085] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#151A22] transition disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`min-h-11 sm:min-h-0 px-4 sm:px-5 py-2 text-xs font-bold rounded-xl text-white shadow-xs transition flex items-center justify-center gap-2 cursor-pointer ${
                isTransitioningFromAbsent
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[#4F46E5] hover:bg-[#4338CA]'
              } disabled:opacity-50`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Procesando<span className="hidden sm:inline"> y notificando</span>...</span>
                </>
              ) : isTransitioningFromAbsent ? (
                <>
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  <span>Rectificar y <span className="sm:hidden">notificar</span><span className="hidden sm:inline">Notificar al Tutor</span></span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                  <span>Guardar<span className="hidden sm:inline"> Rectificación</span></span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

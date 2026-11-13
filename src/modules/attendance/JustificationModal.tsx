import React, { useState } from 'react';
import { X, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Estudiante, Grupo, Sesion } from '../../types/attendance';

interface JustificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  estudiante: Estudiante | null;
  sesion: Sesion | null;
  grupo: Grupo | null;
  currentMotivo?: string | null;
  isRectification?: boolean;
  onSave: (motivo: string) => void;
}

export const JustificationModal: React.FC<JustificationModalProps> = ({
  isOpen,
  onClose,
  estudiante,
  sesion,
  grupo,
  currentMotivo = '',
  isRectification = false,
  onSave,
}) => {
  const [motivo, setMotivo] = useState(currentMotivo || '');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !estudiante || !sesion) return null;

  const PRESET_MOTIVOS = [
    'Constancia médica presentada en secretaría',
    'Permiso laboral de turno vespertino',
    'Inclemencia meteorológica / Movilidad pública',
    'Compromiso de examen universitario',
    'Causa de fuerza mayor familiar comunicada por tutor',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setError('Por favor describe el motivo o selecciona una causa justificada.');
      return;
    }
    setError(null);
    onSave(motivo.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9]">
        {/* Header */}
        <div className="bg-[#172033] dark:bg-[#151A22] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold">
                {isRectification ? 'Rectificación de Inasistencia' : 'Justificar Falta de Estudiante'}
              </h3>
              <p className="text-xs text-slate-300">
                {sesion.fecha} • {grupo?.nombre}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block">
                Estudiante
              </span>
              <span className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
                {estudiante.nombre} {estudiante.apellido}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-semibold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block">
                Matrícula
              </span>
              <span className="text-xs font-mono font-bold text-[#172033] dark:text-[#F1F5F9] bg-white dark:bg-[#1B222D] px-2 py-0.5 rounded border border-[#E7EAF0] dark:border-[#2B3442]">
                {estudiante.matricula}
              </span>
            </div>
          </div>

          {isRectification && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Esta sesión ya se encontraba cerrada.</p>
                <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                  Al rectificar el estatus, se emitirá automáticamente un correo oficial de corrección al tutor legal registrado.
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider mb-1.5">
              Motivos Frecuentes
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MOTIVOS.map((item, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setMotivo(item)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border text-left transition ${
                    motivo === item
                      ? 'bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8] border-indigo-300 dark:border-indigo-800 font-medium'
                      : 'bg-white dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] border-[#E7EAF0] dark:border-[#2B3442] hover:border-[#D1D7E3]'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider mb-1.5">
              Descripción o Motivo Oficial de la Justificación
            </label>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Escribe los detalles o folio de comprobante..."
              className="w-full text-xs rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] p-3 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
            {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium">{error}</p>}
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-[#E7EAF0] dark:border-[#2B3442]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#151A22] transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-xs transition flex items-center space-x-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Guardar Justificación</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

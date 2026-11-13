import React, { useEffect, useState } from 'react';
import { AlertCircle, Award, MessageSquare, NotebookPen, ShieldAlert, X } from 'lucide-react';
import { Estudiante, Grupo, Perfil, TipoAnotacion } from '../../types/attendance';
import { storageService } from '../../services/storage.service';

export const TIPOS: Record<
  TipoAnotacion,
  { label: string; icon: React.ReactNode; badge: string; activo: string; inactivo: string }
> = {
  COMENTARIO: {
    label: 'Comentario',
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    badge: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    activo: 'bg-slate-700 text-white border-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200',
    inactivo: 'text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
  },
  INDISCIPLINA: {
    label: 'Indisciplina',
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
    badge: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    activo: 'bg-rose-600 text-white border-rose-600',
    inactivo: 'text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40',
  },
  LOGRO: {
    label: 'Logro',
    icon: <Award className="w-3.5 h-3.5" />,
    badge: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    activo: 'bg-emerald-600 text-white border-emerald-600',
    inactivo:
      'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40',
  },
};

const MAX_CARACTERES = 1000;

export const formatearFechaHora = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

interface AnecdotarioModalProps {
  estudiante: Estudiante;
  currentProfile: Perfil;
  /** Taller y sesión desde donde se escribe (Toma de Asistencia) */
  grupo?: Grupo;
  sesionId?: string;
  onClose: () => void;
}

export const AnecdotarioModal: React.FC<AnecdotarioModalProps> = ({
  estudiante,
  currentProfile,
  grupo,
  sesionId,
  onClose,
}) => {
  const [tipo, setTipo] = useState<TipoAnotacion>('COMENTARIO');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const puedeEscribir = currentProfile.rol === 'ADMIN' || currentProfile.rol === 'PROFESOR';

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      storageService.agregarAnotacion(
        { estudiante_id: estudiante.id, tipo, descripcion: texto, grupo_id: grupo?.id, sesion_id: sesionId },
        currentProfile
      );
      setTexto('');
      setTipo('COMENTARIO');
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la anotación.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anecdotario-titulo"
    >
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] flex flex-col">
        {/* Encabezado */}
        <div className="bg-[#172033] dark:bg-[#151A22] px-5 py-4 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-500/30 shrink-0">
              <NotebookPen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="anecdotario-titulo" className="text-base font-bold">
                Anecdotario
              </h3>
              <p className="text-xs text-slate-300 truncate">
                {estudiante.nombre} {estudiante.apellido} • <span className="font-mono">{estudiante.matricula}</span>
                {grupo ? ` • ${grupo.nombre}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-3.5 sm:p-5 space-y-5 text-xs">
          {/* Formulario */}
          {puedeEscribir && (
            <form onSubmit={handleGuardar} className="space-y-3 p-4 rounded-xl bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442]">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TIPOS) as TipoAnotacion[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    aria-pressed={tipo === t}
                    className={`min-h-[40px] px-3.5 rounded-lg border font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      tipo === t ? TIPOS[t].activo : `bg-white dark:bg-[#1B222D] ${TIPOS[t].inactivo}`
                    }`}
                  >
                    {TIPOS[t].icon}
                    {TIPOS[t].label}
                  </button>
                ))}
              </div>

              <div>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value.slice(0, MAX_CARACTERES))}
                  rows={4}
                  placeholder={
                    tipo === 'INDISCIPLINA'
                      ? 'Describe la situación: qué ocurrió, cuándo y qué medida se tomó…'
                      : tipo === 'LOGRO'
                      ? 'Describe el logro o reconocimiento del estudiante…'
                      : 'Escribe la observación sobre el estudiante…'
                  }
                  aria-label="Contenido de la anotación"
                  className="w-full rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] p-3 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#4F46E5] resize-y"
                />
                <div className="flex justify-between text-[10px] text-[#667085] dark:text-[#94A3B8] mt-1">
                  <span>Solo Dirección puede corregir una anotación ya guardada.</span>
                  <span className="tabular-nums">
                    {texto.length}/{MAX_CARACTERES}
                  </span>
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                {guardadoOk && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Anotación guardada ✓</span>}
                <button
                  type="submit"
                  disabled={!texto.trim()}
                  className="min-h-[40px] px-4 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Guardar anotación
                </button>
              </div>
            </form>
          )}

          <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
            El historial de anotaciones se consulta en Reportes → Anecdotario.
          </p>
        </div>
      </div>
    </div>
  );
};

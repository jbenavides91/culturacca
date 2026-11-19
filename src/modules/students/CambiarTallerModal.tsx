import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Check, Info, X } from 'lucide-react';
import { Estudiante } from '../../types/attendance';
import { storageService } from '../../services/storage.service';
import { CupoBadge } from '../../components/CupoIndicador';
import { compararTexto } from '../../utils/orden';

const DIAS: Record<number, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom' };

interface Props {
  estudiante: Estudiante;
  onClose: () => void;
  onCambiado: (mensaje: string) => void;
}

/**
 * Cambia a un alumno de un taller a otro (solo ADMIN). Un alumno puede estar en varios talleres
 * mientras no choquen en días y horas; el taller que deja no cuenta para el choque.
 */
export const CambiarTallerModal: React.FC<Props> = ({ estudiante, onClose, onCambiado }) => {
  const talleresActuales = useMemo(
    () => storageService.getGruposByEstudiante(estudiante.id).sort((a, b) => compararTexto(a.nombre, b.nombre)),
    [estudiante.id]
  );
  const [origenId, setOrigenId] = useState(talleresActuales[0]?.id ?? '');
  const [destinoId, setDestinoId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const opciones = useMemo(() => {
    if (!origenId) return [];
    return storageService
      .opcionesCambioDeTaller(estudiante.id, origenId)
      .sort((a, b) => Number(b.disponible) - Number(a.disponible) || compararTexto(a.grupo.nombre, b.grupo.nombre));
  }, [estudiante.id, origenId]);

  const origen = talleresActuales.find((g) => g.id === origenId);
  const destino = opciones.find((o) => o.grupo.id === destinoId);
  const solvencia = storageService.estadoSolvencia(estudiante);

  const confirmar = () => {
    if (!origen || !destino?.disponible) return;
    setError(null);
    try {
      storageService.cambiarDeTaller(estudiante.id, origen.id, destino.grupo.id);
      onCambiado(`${estudiante.nombre} ${estudiante.apellido} pasó de "${origen.nombre}" a "${destino.grupo.nombre}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar de taller.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-cambiar-taller"
    >
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-xl max-w-lg w-full max-h-[90dvh] flex flex-col overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] text-xs">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8] shrink-0" />
            <h3 id="titulo-cambiar-taller" className="text-sm font-bold truncate">
              Cambiar de taller · {estudiante.nombre} {estudiante.apellido}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-3.5 sm:p-5 space-y-3">
          {talleresActuales.length === 0 ? (
            <p className="text-[#667085] dark:text-[#94A3B8]">El alumno no está inscrito en ningún taller.</p>
          ) : (
            <>
              <p className="text-[#667085] dark:text-[#94A3B8] leading-relaxed">
                Un alumno puede estar en varios talleres siempre que no coincidan en días y horas. El taller que deja no
                cuenta para el choque de horario.
              </p>

              {!solvencia.solvente && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{solvencia.motivo}: no se puede cambiar de taller hasta que Caja confirme el pago.</span>
                </div>
              )}
              {error && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1" htmlFor="cambio-origen">
                  Taller que deja
                </label>
                {talleresActuales.length === 1 ? (
                  <p className="p-2 rounded-lg bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] font-semibold">
                    {talleresActuales[0].nombre}
                  </p>
                ) : (
                  <select
                    id="cambio-origen"
                    value={origenId}
                    onChange={(e) => {
                      setOrigenId(e.target.value);
                      setDestinoId('');
                    }}
                    className="w-full rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] p-2 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                  >
                    {talleresActuales.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <p className="font-semibold mb-1">
                  Taller nuevo{' '}
                  <span className="font-normal text-[#667085] dark:text-[#94A3B8]">
                    ({opciones.filter((o) => o.disponible).length} disponibles)
                  </span>
                </p>
                <ul className="rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] divide-y divide-[#E7EAF0] dark:divide-[#2B3442] max-h-72 overflow-y-auto">
                  {opciones.length === 0 && (
                    <li className="p-3 text-[#667085] dark:text-[#94A3B8]">No hay otros talleres.</li>
                  )}
                  {opciones.map(({ grupo, ocupacion, disponible, motivo }) => {
                    const elegido = destinoId === grupo.id;
                    return (
                      <li key={grupo.id}>
                        <button
                          type="button"
                          disabled={!disponible}
                          onClick={() => setDestinoId(grupo.id)}
                          aria-pressed={elegido}
                          className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition ${
                            !disponible
                              ? 'opacity-60 cursor-not-allowed'
                              : elegido
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 cursor-pointer'
                              : 'hover:bg-slate-50 dark:hover:bg-[#151A22] cursor-pointer'
                          }`}
                        >
                          <span
                            className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              elegido ? 'bg-[#4F46E5] border-[#4F46E5] text-white' : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {elegido && <Check className="w-3 h-3 stroke-[3]" />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold">{grupo.nombre}</span>
                              <CupoBadge ocupacion={ocupacion} compacto />
                            </span>
                            <span className="block text-[11px] text-[#667085] dark:text-[#94A3B8]">
                              {(grupo.dias_semana || []).map((d) => DIAS[d] || d).join(', ')} · {grupo.hora_inicio} –{' '}
                              {grupo.hora_fin}
                              {grupo.aula ? ` · ${grupo.aula}` : ''}
                            </span>
                            {motivo && (
                              <span className="block text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">{motivo}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200 flex items-start gap-2 text-[11px]">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  La asistencia y las anotaciones del taller que deja se conservan. El cambio queda registrado como baja y
                  alta en el corte bimestral.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-[#E7EAF0] dark:border-[#2B3442] flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-3 py-1.5 font-semibold text-[#667085] cursor-pointer">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!origen || !destino?.disponible || !solvencia.solvente}
            className="px-4 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {destino ? `Cambiar a "${destino.grupo.nombre}"` : 'Elige el taller nuevo'}
          </button>
        </div>
      </div>
    </div>
  );
};

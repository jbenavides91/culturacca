import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowRightLeft, Check, Info, X } from 'lucide-react';
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

/** "A", "A" y "B", "A", "B" y "C" */
const unirNombres = (nombres: string[]) =>
  nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;

/**
 * Cambia a un alumno de uno o varios talleres a otros (solo ADMIN): marca los talleres que deja y
 * elige hasta tantos talleres nuevos como deja (p. ej. deja 2 y entra a otros 2). Los talleres que
 * deja no cuentan para el choque de horario, y los nuevos no pueden chocar entre sí.
 */
export const CambiarTallerModal: React.FC<Props> = ({ estudiante, onClose, onCambiado }) => {
  const talleresActuales = useMemo(
    () => storageService.getGruposByEstudiante(estudiante.id).sort((a, b) => compararTexto(a.nombre, b.nombre)),
    [estudiante.id]
  );
  const [origenIds, setOrigenIds] = useState<string[]>(talleresActuales[0] ? [talleresActuales[0].id] : []);
  const [destinoIds, setDestinoIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const opciones = useMemo(() => {
    if (origenIds.length === 0) return [];
    return storageService
      .opcionesCambioDeTaller(estudiante.id, origenIds)
      .sort((a, b) => Number(b.disponible) - Number(a.disponible) || compararTexto(a.grupo.nombre, b.grupo.nombre));
  }, [estudiante.id, origenIds]);

  const maxDestinos = origenIds.length;
  const origenes = talleresActuales.filter((g) => origenIds.includes(g.id));
  const destinos = destinoIds
    .map((id) => opciones.find((o) => o.grupo.id === id))
    .filter((o): o is NonNullable<typeof o> => !!o);
  const solvencia = storageService.estadoSolvencia(estudiante);

  // Al cambiar los talleres que deja, descartar destinos que ya no son válidos o que exceden el máximo
  useEffect(() => {
    setDestinoIds((prev) => {
      const validos = prev.filter((id) => opciones.some((o) => o.grupo.id === id && o.disponible));
      const recortados = validos.slice(0, Math.max(origenIds.length, 0));
      return recortados.length === prev.length ? prev : recortados;
    });
  }, [opciones, origenIds.length]);

  const toggleOrigen = (id: string) => {
    setError(null);
    setOrigenIds((prev) => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      return [...prev, id];
    });
  };

  const toggleDestino = (id: string) => {
    setError(null);
    setDestinoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /** Motivo por el que un destino no se puede elegir ahora (además de los del servicio) */
  const motivoDestino = (o: (typeof opciones)[number]): string | undefined => {
    if (!o.disponible) return o.motivo;
    if (destinoIds.includes(o.grupo.id)) return undefined;
    for (const d of destinos) {
      const choque = storageService.sonTalleresEnConflicto(o.grupo, d.grupo);
      if (choque.tieneConflicto) return `Choca con «${d.grupo.nombre}», ya seleccionado.`;
    }
    return undefined;
  };

  const puedeConfirmar =
    origenes.length > 0 && destinos.length > 0 && destinos.length <= maxDestinos && solvencia.solvente;

  const confirmar = () => {
    if (!puedeConfirmar) return;
    setError(null);
    try {
      storageService.cambiarDeTalleres(
        estudiante.id,
        origenes.map((g) => g.id),
        destinos.map((d) => d.grupo.id)
      );
      onCambiado(
        `${estudiante.nombre} ${estudiante.apellido} dejó ${unirNombres(origenes.map((g) => `"${g.nombre}"`))} y entró a ${unirNombres(
          destinos.map((d) => `"${d.grupo.nombre}"`)
        )}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar de taller.');
    }
  };

  const textoBoton =
    destinos.length === 0
      ? maxDestinos > 1
        ? 'Elige los talleres nuevos'
        : 'Elige el taller nuevo'
      : `Cambiar a ${unirNombres(destinos.map((d) => `"${d.grupo.nombre}"`))}`;

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
                Marque los talleres que deja y elija hasta tantos talleres nuevos como deja. Los talleres que deja no
                cuentan para el choque de horario, y los nuevos no pueden coincidir en días y horas entre sí.
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

              {/* Talleres que deja */}
              <div>
                <p className="font-semibold mb-1">
                  {talleresActuales.length === 1 ? 'Taller que deja' : 'Talleres que deja'}
                </p>
                {talleresActuales.length === 1 ? (
                  <p className="p-2 rounded-lg bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] font-semibold">
                    {talleresActuales[0].nombre}
                  </p>
                ) : (
                  <ul className="rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
                    {talleresActuales.map((g) => {
                      const marcado = origenIds.includes(g.id);
                      const unico = marcado && origenIds.length === 1;
                      return (
                        <li key={g.id}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={marcado}
                            onClick={() => toggleOrigen(g.id)}
                            title={unico ? 'Debe dejar al menos un taller' : undefined}
                            className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition cursor-pointer ${
                              marcado ? 'bg-rose-50 dark:bg-rose-950/30' : 'hover:bg-slate-50 dark:hover:bg-[#151A22]'
                            }`}
                          >
                            <span
                              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                marcado ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {marcado && <Check className="w-3 h-3 stroke-[3]" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="font-semibold">{g.nombre}</span>
                              <span className="block text-[11px] text-[#667085] dark:text-[#94A3B8]">
                                {(g.dias_semana || []).map((d) => DIAS[d] || d).join(', ')} · {g.hora_inicio} –{' '}
                                {g.hora_fin}
                                {marcado ? ' · Lo deja' : ' · Lo conserva'}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Talleres nuevos */}
              <div>
                <p className="font-semibold mb-1">
                  {maxDestinos > 1 ? 'Talleres nuevos' : 'Taller nuevo'}{' '}
                  <span className="font-normal text-[#667085] dark:text-[#94A3B8]">
                    ({destinos.length} de {maxDestinos} · {opciones.filter((o) => o.disponible).length} disponibles)
                  </span>
                </p>
                <ul className="rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] divide-y divide-[#E7EAF0] dark:divide-[#2B3442] max-h-72 overflow-y-auto">
                  {opciones.length === 0 && (
                    <li className="p-3 text-[#667085] dark:text-[#94A3B8]">No hay otros talleres.</li>
                  )}
                  {opciones.map((o) => {
                    const { grupo, ocupacion } = o;
                    const elegido = destinoIds.includes(grupo.id);
                    const motivo = motivoDestino(o);
                    const limite = !elegido && !motivo && destinos.length >= maxDestinos;
                    const deshabilitado = !elegido && (!!motivo || limite);
                    return (
                      <li key={grupo.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={elegido}
                          disabled={deshabilitado}
                          onClick={() => toggleDestino(grupo.id)}
                          className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition ${
                            deshabilitado
                              ? 'opacity-60 cursor-not-allowed'
                              : elegido
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 cursor-pointer'
                              : 'hover:bg-slate-50 dark:hover:bg-[#151A22] cursor-pointer'
                          }`}
                        >
                          <span
                            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
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
                            {limite && (
                              <span className="block text-[11px] text-[#98A2B3] mt-0.5">
                                Máximo {maxDestinos} {maxDestinos === 1 ? 'taller nuevo' : 'talleres nuevos'}: tantos como deja.
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Resumen */}
              {destinos.length > 0 && (
                <div className="p-2.5 rounded-lg bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Deja:</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-300">
                    {unirNombres(origenes.map((g) => g.nombre))}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#98A2B3]" />
                  <span className="text-[#667085] dark:text-[#94A3B8]">Entra a:</span>
                  <span className="font-semibold text-[#4F46E5] dark:text-[#818CF8]">
                    {unirNombres(destinos.map((d) => d.grupo.nombre))}
                  </span>
                </div>
              )}

              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200 flex items-start gap-2 text-[11px]">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  La asistencia y las anotaciones de los talleres que deja se conservan. Cada cambio queda registrado
                  como baja y alta en el corte bimestral.
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
            disabled={!puedeConfirmar}
            className="px-4 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed truncate"
          >
            {textoBoton}
          </button>
        </div>
      </div>
    </div>
  );
};

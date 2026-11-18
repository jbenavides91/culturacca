import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, Info, Trash2, X } from 'lucide-react';
import { Grupo, Sesion } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { fechaLocalISO } from '../../utils/fechas';

interface Props {
  grupo: Grupo;
  onClose: () => void;
  /** Se llama con la sesión recién creada (el modal se cierra solo) */
  onCreada: (sesion: Sesion) => void;
  /** Permite quitar sesiones extraordinarias sin asistencia (solo ADMIN) */
  puedeQuitar?: boolean;
}

/** "miércoles 13 de enero de 2027" a partir de YYYY-MM-DD (fecha local) */
export const fechaLargaSesion = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const inputClass =
  'w-full rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] p-2 focus:outline-none focus:ring-2 focus:ring-violet-500';

/**
 * Crea una clase fuera del calendario habitual del taller (reposición o clase extra) y lista
 * las sesiones extraordinarias del taller. Se usa en Talleres (ADMIN) y en Toma de Asistencia.
 */
export const SesionExtraordinariaModal: React.FC<Props> = ({ grupo, onClose, onCreada, puedeQuitar = false }) => {
  const [fecha, setFecha] = useState(fechaLocalISO());
  const [horaInicio, setHoraInicio] = useState(grupo.hora_inicio);
  const [horaFin, setHoraFin] = useState(grupo.hora_fin);
  const [tema, setTema] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => subscribeToData(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const extras = useMemo(() => {
    const conAsistencia = new Set(storageService.getAsistencias().map((a) => a.sesion_id));
    return storageService
      .getSesionesByGrupo(grupo.id)
      .filter((s) => s.extraordinaria)
      .map((s) => ({ sesion: s, conAsistencia: conAsistencia.has(s.id) }));
  }, [grupo.id, version]);

  // Avisos (no bloquean) sobre la fecha elegida
  const avisos = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return [];
    const lista: { tipo: 'info' | 'warn'; texto: string }[] = [];
    const yaExiste = storageService.getSesionesByGrupo(grupo.id).find((s) => s.fecha === fecha);
    if (yaExiste) {
      lista.push({
        tipo: 'warn',
        texto: yaExiste.extraordinaria
          ? 'Ya hay una sesión extraordinaria de este taller en esa fecha.'
          : 'Ese día ya es día de clase de este taller: la sesión ya existe en su calendario.',
      });
    } else if (storageService.esDiaDeClaseRegular(grupo, fecha)) {
      lista.push({ tipo: 'warn', texto: 'Ese día ya es día de clase de este taller según los cortes.' });
    }
    const noLectivo = storageService.diaNoLectivoDe(fecha);
    if (noLectivo) {
      lista.push({ tipo: 'info', texto: `Es día no lectivo (${noLectivo.motivo}); la sesión se creará de todos modos.` });
    }
    if (!storageService.estaEnAlgunCorte(fecha)) {
      lista.push({ tipo: 'info', texto: 'La fecha está fuera de los cortes registrados; la sesión se creará de todos modos.' });
    }
    if (fecha < fechaLocalISO()) {
      lista.push({ tipo: 'info', texto: 'Es una fecha pasada: la lista se podrá tomar de inmediato.' });
    }
    return lista;
  }, [fecha, grupo, version]);

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const sesion = storageService.agregarSesionExtraordinaria(grupo.id, {
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        tema,
      });
      onCreada(sesion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sesión.');
    }
  };

  const quitar = (s: Sesion) => {
    if (!window.confirm(`¿Quitar la sesión extraordinaria del ${fechaLargaSesion(s.fecha)}?`)) return;
    setError(null);
    try {
      storageService.eliminarSesionExtraordinaria(s.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar la sesión.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-sesion-extra"
    >
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-xl max-w-md w-full max-h-[90dvh] flex flex-col overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9]">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarPlus className="w-4 h-4 text-violet-500 shrink-0" />
            <h3 id="titulo-sesion-extra" className="text-sm font-bold truncate">
              Sesión extraordinaria · {grupo.nombre}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto">
          <form onSubmit={crear} className="p-3.5 sm:p-5 space-y-3 text-xs">
            <p className="text-[#667085] dark:text-[#94A3B8] leading-relaxed">
              Habilita una clase en una fecha fuera de los días habituales del taller (reposición o clase extra). Se
              conserva aunque cambien los cortes o los días del taller.
            </p>
            {error && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div>
              <label className="block font-semibold mb-1" htmlFor="extra-fecha">
                Fecha
              </label>
              <input
                id="extra-fecha"
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={inputClass}
              />
              {fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && (
                <p className="mt-1 text-[11px] text-[#667085] dark:text-[#94A3B8] first-letter:uppercase">
                  {fechaLargaSesion(fecha)}
                </p>
              )}
            </div>
            {avisos.length > 0 && (
              <ul className="space-y-1.5">
                {avisos.map((a) => (
                  <li
                    key={a.texto}
                    className={`p-2 rounded-lg border flex items-start gap-1.5 text-[11px] ${
                      a.tipo === 'warn'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
                        : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200'
                    }`}
                  >
                    {a.tipo === 'warn' ? (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    ) : (
                      <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    )}
                    <span>{a.texto}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold mb-1" htmlFor="extra-inicio">
                  Hora inicio
                </label>
                <input
                  id="extra-inicio"
                  type="time"
                  required
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1" htmlFor="extra-fin">
                  Hora fin
                </label>
                <input
                  id="extra-fin"
                  type="time"
                  required
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1" htmlFor="extra-tema">
                Tema <span className="text-[#94A3B8] font-normal">(opcional)</span>
              </label>
              <input
                id="extra-tema"
                type="text"
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                placeholder="Clase extraordinaria"
                className={inputClass}
              />
            </div>
            <div className="pt-1 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 font-semibold text-[#667085] cursor-pointer">
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-bold cursor-pointer"
              >
                Crear sesión
              </button>
            </div>
          </form>

          {/* Sesiones extraordinarias del taller */}
          <div className="border-t border-[#E7EAF0] dark:border-[#2B3442] px-3.5 sm:px-5 py-3 text-xs">
            <p className="font-semibold mb-2">
              Sesiones extraordinarias del taller{' '}
              <span className="font-normal text-[#667085] dark:text-[#94A3B8]">({extras.length})</span>
            </p>
            {extras.length === 0 ? (
              <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">Este taller no tiene sesiones extraordinarias.</p>
            ) : (
              <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442] rounded-lg border border-[#E7EAF0] dark:border-[#2B3442]">
                {extras.map(({ sesion: s, conAsistencia }) => {
                  const bloqueada = s.cerrada || conAsistencia;
                  return (
                    <li key={s.id} className="px-2.5 py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold first-letter:uppercase truncate">{fechaLargaSesion(s.fecha)}</p>
                        <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">
                          {s.hora_inicio} – {s.hora_fin}
                          {s.tema ? ` · ${s.tema}` : ''}
                          {s.cerrada ? ' · Cerrada' : conAsistencia ? ' · Con asistencia' : ''}
                        </p>
                      </div>
                      {puedeQuitar && (
                        <button
                          type="button"
                          onClick={() => quitar(s)}
                          disabled={bloqueada}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                          title={bloqueada ? 'Ya tiene asistencia o está cerrada: no se puede quitar' : 'Quitar sesión'}
                          aria-label={`Quitar sesión del ${fechaLargaSesion(s.fecha)}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

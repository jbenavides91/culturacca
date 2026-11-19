import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarHeart, Search, X } from 'lucide-react';
import { Evento, Grupo, Perfil } from '../../types/attendance';
import { storageService } from '../../services/storage.service';
import { compararTexto } from '../../utils/orden';
import { fechaLocalISO } from '../../utils/fechas';

interface Props {
  /** Evento a editar; sin él se crea uno nuevo */
  evento?: Evento;
  grupos: Grupo[];
  perfiles: Perfil[];
  onClose: () => void;
  onGuardado: (evento: Evento, mensaje: string) => void;
}

const inputClass =
  'w-full rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] p-2 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]';

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Crear o editar un evento: datos y talleres que participan (solo ADMIN) */
export const EventoFormModal: React.FC<Props> = ({ evento, grupos, perfiles, onClose, onGuardado }) => {
  const [nombre, setNombre] = useState(evento?.nombre ?? '');
  const [fecha, setFecha] = useState(evento?.fecha ?? fechaLocalISO());
  const [lugar, setLugar] = useState(evento?.lugar ?? '');
  const [descripcion, setDescripcion] = useState(evento?.descripcion ?? '');
  const [seleccion, setSeleccion] = useState<Set<string>>(
    () => new Set(evento ? storageService.getEventoTalleres(evento.id).map((t) => t.grupo_id) : [])
  );
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const docente = useMemo(() => {
    const m = new Map(perfiles.map((p) => [p.id, `${p.nombre} ${p.apellido || ''}`.trim()]));
    return (id: string) => m.get(id) || 'Sin docente';
  }, [perfiles]);

  const talleres = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    return [...grupos]
      .filter((g) => !q || sinAcentos(`${g.nombre} ${docente(g.profesor_id)}`).includes(q))
      .sort((a, b) => compararTexto(a.nombre, b.nombre));
  }, [grupos, busqueda, docente]);

  const alternar = (id: string) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const ids = [...seleccion];
    if (ids.length === 0) {
      setError('Elige al menos un taller que participe en el evento.');
      return;
    }
    try {
      const datos = { nombre, fecha, lugar, descripcion };
      if (evento) {
        const perdidos = storageService.participantesAfectados(evento.id, ids);
        if (
          perdidos > 0 &&
          !window.confirm(
            `Al quitar talleres se eliminarán ${perdidos} ${perdidos === 1 ? 'participante' : 'participantes'} ya elegidos. ¿Continuar?`
          )
        ) {
          return;
        }
        const actualizado = storageService.actualizarEvento(evento.id, datos, ids);
        onGuardado(actualizado, `Evento "${actualizado.nombre}" actualizado.`);
      } else {
        const nuevo = storageService.crearEvento(datos, ids);
        onGuardado(nuevo, `Evento "${nuevo.nombre}" creado con ${ids.length} ${ids.length === 1 ? 'taller' : 'talleres'}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el evento.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-evento-form"
    >
      <form
        onSubmit={guardar}
        className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-xl max-w-lg w-full max-h-[90dvh] flex flex-col overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] text-xs"
      >
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CalendarHeart className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
            <h3 id="titulo-evento-form" className="text-sm font-bold">
              {evento ? 'Editar evento' : 'Nuevo evento'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-3.5 sm:p-5 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div>
            <label className="block font-semibold mb-1" htmlFor="evento-nombre">
              Nombre del evento
            </label>
            <input
              id="evento-nombre"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Día del Libro"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1" htmlFor="evento-fecha">
                Fecha
              </label>
              <input id="evento-fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block font-semibold mb-1" htmlFor="evento-lugar">
                Lugar <span className="font-normal text-[#94A3B8]">(opcional)</span>
              </label>
              <input
                id="evento-lugar"
                value={lugar}
                onChange={(e) => setLugar(e.target.value)}
                placeholder="Ej. Auditorio"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1" htmlFor="evento-descripcion">
              Descripción <span className="font-normal text-[#94A3B8]">(opcional)</span>
            </label>
            <textarea
              id="evento-descripcion"
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <p className="font-semibold mb-1">
              Talleres que participan{' '}
              <span className="font-normal text-[#667085] dark:text-[#94A3B8]">({seleccion.size} elegidos)</span>
            </p>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar taller o docente…"
                className={`${inputClass} pl-8`}
                aria-label="Buscar taller"
              />
            </div>
            {/* Alto fijo: la ventana no cambia de tamaño mientras se busca */}
            <ul className="rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] divide-y divide-[#E7EAF0] dark:divide-[#2B3442] h-60 overflow-y-auto">
              {talleres.length === 0 && (
                <li className="h-full flex items-center justify-center p-3 text-center text-[#667085] dark:text-[#94A3B8]">
                  {busqueda.trim() ? `Ningún taller coincide con «${busqueda.trim()}».` : 'No hay talleres.'}
                </li>
              )}
              {talleres.map((g) => (
                <li key={g.id}>
                  <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#151A22]">
                    <input
                      type="checkbox"
                      checked={seleccion.has(g.id)}
                      onChange={() => alternar(g.id)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{g.nombre}</span>
                      <span className="block text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">
                        {docente(g.profesor_id)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-[#E7EAF0] dark:border-[#2B3442] flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-3 py-1.5 font-semibold text-[#667085] cursor-pointer">
            Cancelar
          </button>
          <button type="submit" className="px-4 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold cursor-pointer">
            {evento ? 'Guardar cambios' : 'Crear evento'}
          </button>
        </div>
      </form>
    </div>
  );
};

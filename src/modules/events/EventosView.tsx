import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarHeart,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  LockOpen,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { Evento, Perfil } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { exportService } from '../../services/export.service';
import { compararTexto } from '../../utils/orden';
import { fechaLocalISO } from '../../utils/fechas';
import { EventoFormModal } from './EventoFormModal';
import { ParticipantesTaller } from './ParticipantesTaller';

interface Props {
  currentProfile: Perfil;
}

type Filtro = 'proximos' | 'pasados' | 'todos';

const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const EstadoBadge: React.FC<{ estado: Evento['estado'] }> = ({ estado }) =>
  estado === 'ABIERTO' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
      <LockOpen className="w-3 h-3" /> Abierto
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
      <Lock className="w-3 h-3" /> Cerrado
    </span>
  );

/**
 * Eventos institucionales (Día del Libro, Fiestas Patrias…): ADMIN los crea, asigna los talleres y
 * cierra la lista; cada docente elige a los alumnos de sus talleres. Lista consolidada ordenada por
 * grado, sección y apellido, exportable a Excel para Dirección.
 */
export const EventosView: React.FC<Props> = ({ currentProfile }) => {
  const esAdmin = currentProfile.rol === 'ADMIN';
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeToData(() => setVersion((v) => v + 1)), []);

  const [filtro, setFiltro] = useState<Filtro>('proximos');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ evento?: Evento } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const datos = useMemo(() => {
    const grupos = storageService.getGrupos();
    const misGrupos = esAdmin ? grupos : grupos.filter((g) => g.profesor_id === currentProfile.id);
    const misIds = new Set(misGrupos.map((g) => g.id));
    const talleres = storageService.getEventoTalleres();
    const participantes = storageService.getParticipantesEvento();
    // Un docente solo ve los eventos en los que participa alguno de sus talleres
    const eventos = storageService
      .getEventos()
      .filter((e) => esAdmin || talleres.some((t) => t.evento_id === e.id && misIds.has(t.grupo_id)));
    return { grupos, misGrupos, misIds, talleres, participantes, eventos, perfiles: storageService.getPerfiles() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, esAdmin, currentProfile.id]);

  const nombreDocente = useMemo(() => {
    const m = new Map(datos.perfiles.map((p) => [p.id, `${p.nombre} ${p.apellido || ''}`.trim()]));
    return (id: string) => m.get(id) || 'Sin docente';
  }, [datos.perfiles]);

  const hoy = fechaLocalISO();
  const eventosVisibles = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    const lista = datos.eventos.filter((e) => {
      if (filtro === 'proximos' && e.fecha < hoy) return false;
      if (filtro === 'pasados' && e.fecha >= hoy) return false;
      return !q || sinAcentos(`${e.nombre} ${e.lugar ?? ''}`).includes(q);
    });
    // Próximos: el más cercano primero; pasados: el más reciente primero
    return filtro === 'proximos' ? lista : [...lista].reverse();
  }, [datos.eventos, filtro, busqueda, hoy]);

  const evento = seleccionadoId ? datos.eventos.find((e) => e.id === seleccionadoId) : undefined;
  useEffect(() => {
    if (seleccionadoId && !evento) setSeleccionadoId(null); // eliminado o ya no visible
  }, [seleccionadoId, evento]);

  // ---------- Detalle ----------
  if (evento) {
    const talleresEvento = datos.talleres
      .filter((t) => t.evento_id === evento.id)
      .map((t) => datos.grupos.find((g) => g.id === t.grupo_id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .sort((a, b) => compararTexto(a.nombre, b.nombre));
    const visibles = esAdmin ? talleresEvento : talleresEvento.filter((g) => datos.misIds.has(g.id));
    const filas = storageService.filasEvento(evento.id, esAdmin ? undefined : visibles.map((g) => g.id));
    const grados = new Map<string, number>();
    filas.forEach((f) => grados.set(f.grado, (grados.get(f.grado) ?? 0) + 1));

    const cambiarEstado = () => {
      const cerrar = evento.estado === 'ABIERTO';
      if (cerrar && !window.confirm('¿Cerrar la lista? Los docentes ya no podrán cambiar a sus participantes.')) return;
      try {
        storageService.cambiarEstadoEvento(evento.id, cerrar ? 'CERRADO' : 'ABIERTO');
        setToast(cerrar ? 'Lista cerrada: los docentes ya no pueden cambiarla.' : 'Evento reabierto.');
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
      }
    };
    const eliminar = () => {
      if (!window.confirm(`¿Eliminar el evento "${evento.nombre}" y su lista de ${filas.length} participantes?`)) return;
      try {
        storageService.eliminarEvento(evento.id);
        setSeleccionadoId(null);
        setToast(`Evento "${evento.nombre}" eliminado.`);
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'No se pudo eliminar.');
      }
    };

    let gradoAnterior = '';
    return (
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 animate-fadeIn">
        {toast && <Toast texto={toast} />}
        {formulario && (
          <EventoFormModal
            evento={formulario.evento}
            grupos={datos.grupos}
            perfiles={datos.perfiles}
            onClose={() => setFormulario(null)}
            onGuardado={(_, mensaje) => {
              setFormulario(null);
              setToast(mensaje);
            }}
          />
        )}

        <div className="pb-3 sm:pb-4 border-b border-[#E7EAF0] dark:border-[#2B3442] space-y-3">
          <button
            type="button"
            onClick={() => setSeleccionadoId(null)}
            className="text-xs font-semibold text-[#4F46E5] dark:text-[#818CF8] flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Todos los eventos
          </button>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-2xl font-bold text-[#172033] dark:text-[#F1F5F9] tracking-tight">{evento.nombre}</h1>
                <EstadoBadge estado={evento.estado} />
              </div>
              <p className="text-[11px] sm:text-xs text-[#667085] dark:text-[#94A3B8] mt-1 first-letter:uppercase">
                {fechaLarga(evento.fecha)}
                {evento.lugar ? ` · ${evento.lugar}` : ''}
              </p>
              {evento.descripcion && <p className="text-xs text-[#667085] dark:text-[#94A3B8] mt-1">{evento.descripcion}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => exportService.exportEvento(evento.id, esAdmin ? undefined : visibles.map((g) => g.id))}
                disabled={filas.length === 0}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
              </button>
              {esAdmin && (
                <>
                  <button
                    type="button"
                    onClick={cambiarEstado}
                    className="px-3 py-1.5 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9]"
                  >
                    {evento.estado === 'ABIERTO' ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                    {evento.estado === 'ABIERTO' ? 'Cerrar lista' : 'Reabrir'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormulario({ evento })}
                    className="p-2 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-slate-500 hover:text-indigo-600 cursor-pointer"
                    title="Editar evento"
                    aria-label="Editar evento"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={eliminar}
                    className="p-2 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-slate-400 hover:text-rose-600 cursor-pointer"
                    title="Eliminar evento"
                    aria-label="Eliminar evento"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <Kpi titulo="Participantes" valor={filas.length} />
          <Kpi titulo="Talleres" valor={visibles.length} />
          <Kpi titulo="Grados" valor={grados.size} />
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-start">
          {/* Participantes por taller */}
          <section className="space-y-2.5">
            <h2 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
              {esAdmin ? 'Participantes por taller' : 'Elige a tus alumnos'}
            </h2>
            {visibles.length === 0 ? (
              <p className="text-xs text-[#667085] dark:text-[#94A3B8]">Este evento no tiene talleres asignados.</p>
            ) : (
              visibles.map((g) => (
                <ParticipantesTaller
                  key={g.id}
                  evento={evento}
                  grupo={g}
                  docente={nombreDocente(g.profesor_id)}
                  version={version}
                  abiertoInicial={!esAdmin}
                  onGuardado={setToast}
                />
              ))
            )}
          </section>

          {/* Lista consolidada */}
          <section className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs overflow-hidden">
            <div className="px-3.5 sm:px-5 py-3 border-b border-[#E7EAF0] dark:border-[#2B3442]">
              <h2 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">Lista de participantes</h2>
              <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">Ordenada por grado, sección y apellido.</p>
            </div>
            {filas.length === 0 ? (
              <p className="p-6 text-center text-xs text-[#667085] dark:text-[#94A3B8]">Todavía no hay alumnos elegidos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#F7F8FA] dark:bg-[#151A22] text-[11px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider">
                      <th className="py-2.5 px-3">N°</th>
                      <th className="py-2.5 px-3">Sección</th>
                      <th className="py-2.5 px-3">Alumno</th>
                      <th className="py-2.5 px-3">Taller</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => {
                      const nuevoGrado = f.grado !== gradoAnterior;
                      gradoAnterior = f.grado;
                      return (
                        <React.Fragment key={f.participante_id}>
                          {nuevoGrado && (
                            <tr className="bg-indigo-50/60 dark:bg-indigo-950/30">
                              <td colSpan={4} className="py-1.5 px-3 text-[11px] font-bold text-indigo-800 dark:text-indigo-200">
                                {f.grado} · {grados.get(f.grado)} {grados.get(f.grado) === 1 ? 'alumno' : 'alumnos'}
                              </td>
                            </tr>
                          )}
                          <tr className="border-t border-[#E7EAF0] dark:border-[#2B3442]">
                            <td className="py-2 px-3 font-mono text-[#667085] tabular-nums">{i + 1}</td>
                            <td className="py-2 px-3 whitespace-nowrap">{f.seccion}</td>
                            <td className="py-2 px-3">
                              <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                                {f.apellido}, {f.nombre}
                              </span>
                              {f.matricula && <span className="block text-[10px] font-mono text-[#667085]">{f.matricula}</span>}
                            </td>
                            <td className="py-2 px-3">
                              <span className="block">{f.taller}</span>
                              <span className="block text-[10px] text-[#667085] dark:text-[#94A3B8]">{f.docente}</span>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ---------- Lista de eventos ----------
  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 animate-fadeIn">
      {toast && <Toast texto={toast} />}
      {formulario && (
        <EventoFormModal
          evento={formulario.evento}
          grupos={datos.grupos}
          perfiles={datos.perfiles}
          onClose={() => setFormulario(null)}
          onGuardado={(ev, mensaje) => {
            setFormulario(null);
            setToast(mensaje);
            setSeleccionadoId(ev.id);
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-[#E7EAF0] dark:border-[#2B3442]">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-[#172033] dark:text-[#F1F5F9] tracking-tight">Eventos</h1>
          <p className="text-[11px] sm:text-xs text-[#667085] dark:text-[#94A3B8] mt-1">
            {esAdmin
              ? 'Crea los eventos del año, asigna los talleres que participan y descarga la lista para Dirección.'
              : 'Elige a los alumnos de tus talleres que participan en cada evento.'}
          </p>
        </div>
        {esAdmin && (
          <button
            type="button"
            onClick={() => setFormulario({})}
            className="px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Nuevo evento
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="inline-flex p-0.5 bg-slate-100 dark:bg-[#151A22] rounded-lg text-xs self-start" role="group" aria-label="Filtrar eventos">
          {(
            [
              ['proximos', 'Próximos'],
              ['pasados', 'Pasados'],
              ['todos', 'Todos'],
            ] as [Filtro, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              aria-pressed={filtro === id}
              className={`px-3 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                filtro === id
                  ? 'bg-white dark:bg-[#1B222D] text-[#4F46E5] dark:text-[#818CF8] shadow-2xs'
                  : 'text-[#667085] dark:text-[#94A3B8]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar evento…"
            aria-label="Buscar evento"
            className="w-full text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] pl-8 pr-2 py-2 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
          />
        </div>
      </div>

      {eventosVisibles.length === 0 ? (
        <div className="bg-white dark:bg-[#1B222D] rounded-xl border border-dashed border-[#E7EAF0] dark:border-[#2B3442] p-8 text-center text-xs text-[#667085] dark:text-[#94A3B8]">
          <CalendarHeart className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          {datos.eventos.length === 0
            ? esAdmin
              ? 'Aún no hay eventos. Crea el primero con "Nuevo evento".'
              : 'Ninguno de tus talleres participa todavía en un evento.'
            : 'No hay eventos con este filtro.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {eventosVisibles.map((e) => {
            const talleres = datos.talleres.filter((t) => t.evento_id === e.id);
            const nombres = talleres
              .map((t) => datos.grupos.find((g) => g.id === t.grupo_id)?.nombre)
              .filter((n): n is string => !!n)
              .sort(compararTexto);
            const participantes = datos.participantes.filter(
              (p) => p.evento_id === e.id && (esAdmin || datos.misIds.has(p.grupo_id))
            ).length;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setSeleccionadoId(e.id)}
                className="text-left bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs p-3.5 sm:p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition cursor-pointer space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm text-[#172033] dark:text-[#F1F5F9]">{e.nombre}</h3>
                  <EstadoBadge estado={e.estado} />
                </div>
                <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] first-letter:uppercase">{fechaLarga(e.fecha)}</p>
                {e.lugar && (
                  <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {e.lugar}
                  </p>
                )}
                <p className="text-[11px] text-[#172033] dark:text-[#F1F5F9] line-clamp-2">
                  {nombres.length > 0 ? nombres.join(' · ') : 'Sin talleres asignados'}
                </p>
                <p className="text-[11px] font-semibold text-[#4F46E5] dark:text-[#818CF8] flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {participantes} {participantes === 1 ? 'participante' : 'participantes'}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Kpi: React.FC<{ titulo: string; valor: number }> = ({ titulo, valor }) => (
  <div className="bg-white dark:bg-[#1B222D] p-3 sm:p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs">
    <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] block">{titulo}</span>
    <span className="text-xl sm:text-2xl font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">{valor}</span>
  </div>
);

const Toast: React.FC<{ texto: string }> = ({ texto }) => (
  <div
    role="status"
    className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 max-w-sm px-4 py-3 rounded-xl bg-slate-900 text-white text-xs shadow-lg flex items-start gap-2 animate-fadeIn"
  >
    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
    <span>{texto}</span>
  </div>
);

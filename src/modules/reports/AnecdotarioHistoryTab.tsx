import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileSpreadsheet, Search, Users, X } from 'lucide-react';
import { Anotacion, Estudiante, Grupo, Inscripcion, Perfil, TipoAnotacion } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { exportService } from '../../services/export.service';
import { TIPOS, formatearFechaHora } from '../students/AnecdotarioModal';
import { AnecdotarioAlumnoModal, TIPOS_LISTA, nombreCompleto, nombreTallerDe } from './AnecdotarioAlumnoModal';

type Conteo = Record<TipoAnotacion, number> & { total: number; ultima: string };

interface AnecdotarioHistoryTabProps {
  currentProfile: Perfil;
}

export const AnecdotarioHistoryTab: React.FC<AnecdotarioHistoryTabProps> = ({ currentProfile }) => {
  const esAdmin = currentProfile.rol === 'ADMIN';

  const [anotaciones, setAnotaciones] = useState<Anotacion[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);

  const [busqueda, setBusqueda] = useState('');
  const [grupoId, setGrupoId] = useState('TODOS');
  const [incluirBajas, setIncluirBajas] = useState(false);
  const [soloConAnotaciones, setSoloConAnotaciones] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    const cargar = () => {
      let gs = storageService.getGrupos();
      let lista = storageService.getAnecdotario();
      if (!esAdmin) {
        gs = gs.filter((g) => g.profesor_id === currentProfile.id);
        // Doble protección: el docente solo ve sus anotaciones (la RLS ya lo impone)
        lista = lista.filter((a) => a.autor_id === currentProfile.id);
      }
      const idsGrupos = new Set(gs.map((g) => g.id));
      setGrupos([...gs].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setAnotaciones(lista);
      setInscripciones(storageService.getInscripciones().filter((i) => esAdmin || idsGrupos.has(i.grupo_id)));
      setEstudiantes(storageService.getEstudiantes());
    };
    cargar();
    return subscribeToData(cargar);
  }, [esAdmin, currentProfile.id]);

  const grupoPorId = useMemo(() => new Map(grupos.map((g) => [g.id, g])), [grupos]);
  const estudiantePorId = useMemo(() => new Map(estudiantes.map((e) => [e.id, e])), [estudiantes]);

  /** Talleres (visibles) de cada alumno */
  const talleresDe = useMemo(() => {
    const m = new Map<string, string[]>();
    inscripciones.forEach((i) => {
      if (!grupoPorId.has(i.grupo_id)) return;
      if (!m.has(i.estudiante_id)) m.set(i.estudiante_id, []);
      m.get(i.estudiante_id)!.push(i.grupo_id);
    });
    return m;
  }, [inscripciones, grupoPorId]);

  /** Anotaciones de cada alumno (todas las visibles para el rol) */
  const anotacionesDe = useMemo(() => {
    const m = new Map<string, Anotacion[]>();
    anotaciones.forEach((a) => {
      if (!m.has(a.estudiante_id)) m.set(a.estudiante_id, []);
      m.get(a.estudiante_id)!.push(a);
    });
    return m;
  }, [anotaciones]);

  const conteoPorAlumno = useMemo(() => {
    const m = new Map<string, Conteo>();
    anotaciones.forEach((a) => {
      const c = m.get(a.estudiante_id) ?? { COMENTARIO: 0, INDISCIPLINA: 0, LOGRO: 0, total: 0, ultima: '' };
      c[a.tipo] += 1;
      c.total += 1;
      if (a.creado_en > c.ultima) c.ultima = a.creado_en;
      m.set(a.estudiante_id, c);
    });
    return m;
  }, [anotaciones]);

  const q = busqueda.trim().toLowerCase();

  // Todos los alumnos visibles (matriculados, más cualquiera con anotaciones)
  const alumnos = useMemo(() => {
    const ids = new Set<string>();
    estudiantes.forEach((e) => {
      if (!esAdmin && !talleresDe.has(e.id)) return;
      if (!incluirBajas && e.estado === 'BAJA') return;
      ids.add(e.id);
    });
    conteoPorAlumno.forEach((_, id) => ids.add(id));

    return Array.from(ids)
      .map((id) => estudiantePorId.get(id))
      .filter((e): e is Estudiante => !!e)
      .filter((e) => grupoId === 'TODOS' || (talleresDe.get(e.id) || []).includes(grupoId))
      .filter((e) => !q || nombreCompleto(e).toLowerCase().includes(q) || (e.matricula || '').toLowerCase().includes(q))
      .filter((e) => !soloConAnotaciones || conteoPorAlumno.has(e.id))
      .sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre));
  }, [estudiantes, esAdmin, talleresDe, incluirBajas, conteoPorAlumno, estudiantePorId, grupoId, q, soloConAnotaciones]);

  const resumen = useMemo(() => {
    const porTipo: Record<TipoAnotacion, number> = { COMENTARIO: 0, INDISCIPLINA: 0, LOGRO: 0 };
    let total = 0;
    let conNotas = 0;
    alumnos.forEach((e) => {
      const c = conteoPorAlumno.get(e.id);
      if (!c) return;
      conNotas += 1;
      total += c.total;
      TIPOS_LISTA.forEach((t) => (porTipo[t] += c[t]));
    });
    return { total, porTipo, conNotas };
  }, [alumnos, conteoPorAlumno]);

  const nombresTalleres = (id: string) =>
    (talleresDe.get(id) || []).map((gid) => grupoPorId.get(gid)?.nombre).filter((n): n is string => !!n);

  const hayFiltros = busqueda || grupoId !== 'TODOS';

  const limpiar = () => {
    setBusqueda('');
    setGrupoId('TODOS');
  };

  const exportar = () => {
    const filas = alumnos
      .flatMap((e) => anotacionesDe.get(e.id) || [])
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
      .map((a) => {
        const e = estudiantePorId.get(a.estudiante_id);
        return {
          fecha: formatearFechaHora(a.creado_en),
          alumno: e ? nombreCompleto(e) : 'Alumno no encontrado',
          matricula: e?.matricula || '',
          taller: nombreTallerDe(a, grupoPorId),
          tipo: TIPOS[a.tipo].label,
          descripcion: a.descripcion,
          autor: a.autor_nombre,
        };
      });
    const partes = [
      grupoId !== 'TODOS' ? `Taller: ${grupoPorId.get(grupoId)?.nombre}` : 'Todos los talleres',
      busqueda ? `Búsqueda: "${busqueda}"` : '',
    ].filter(Boolean);
    exportService.exportAnecdotario(filas, partes.join(' · '));
  };

  const cerrarModal = useCallback(() => setAbierto(null), []);
  const alumnoAbierto = abierto ? estudiantePorId.get(abierto) : undefined;

  const inputClass =
    'text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]';
  const tarjeta = 'bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs';

  const contadoresAlumno = (id: string) => {
    const c = conteoPorAlumno.get(id);
    if (!c) return <span className="text-[10px] text-slate-400">Sin anotaciones</span>;
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold tabular-nums">
        {TIPOS_LISTA.map((t) =>
          c[t] > 0 ? (
            <span key={t} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border ${TIPOS[t].badge}`} title={TIPOS[t].label}>
              {TIPOS[t].icon}
              {c[t]}
            </span>
          ) : null
        )}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className={`${tarjeta} p-4 flex flex-col lg:flex-row lg:items-center gap-2`}>
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar alumno o matrícula..."
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} className={inputClass} aria-label="Taller">
            <option value="TODOS">{esAdmin ? 'Todos los talleres' : 'Todos mis talleres'}</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[11px] text-[#667085] dark:text-[#94A3B8] cursor-pointer">
            <input type="checkbox" checked={soloConAnotaciones} onChange={(e) => setSoloConAnotaciones(e.target.checked)} />
            Solo con anotaciones
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-[#667085] dark:text-[#94A3B8] cursor-pointer">
            <input type="checkbox" checked={incluirBajas} onChange={(e) => setIncluirBajas(e.target.checked)} />
            Incluir bajas
          </label>
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiar}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={resumen.total === 0}
          className="lg:ml-auto px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Exporta las anotaciones de los alumnos listados"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className={`${tarjeta} p-3`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]">Anotaciones</span>
          <div className="text-xl font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">{resumen.total}</div>
        </div>
        {TIPOS_LISTA.map((t) => (
          <div key={t} className={`${tarjeta} p-3`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] flex items-center gap-1">
              {TIPOS[t].icon}
              {TIPOS[t].label}
            </span>
            <div className="text-xl font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">{resumen.porTipo[t]}</div>
          </div>
        ))}
        <div className={`${tarjeta} p-3 col-span-2 lg:col-span-1`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]">Alumnos con anotaciones</span>
          <div className="text-xl font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">{resumen.conNotas}</div>
        </div>
      </div>

      {!esAdmin && (
        <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
          Solo ves tus anotaciones y los alumnos de tus talleres. Dirección puede consultar el expediente completo.
        </p>
      )}

      {/* Lista de alumnos */}
      <section className={`${tarjeta} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-bold text-[#172033] dark:text-[#F1F5F9]">
            <Users className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
            Alumnos ({alumnos.length})
          </span>
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8]">Haz clic en un alumno para ver su historial</span>
        </div>

        {/* Encabezado de columnas (escritorio) */}
        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_70px_120px_20px] gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] bg-[#F7F8FA] dark:bg-[#151A22] border-b border-[#E7EAF0] dark:border-[#2B3442]">
          <span>Alumno</span>
          <span>Talleres</span>
          <span>Anotaciones</span>
          <span className="text-right">Total</span>
          <span>Última</span>
          <span />
        </div>

        {alumnos.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-[#667085] dark:text-[#94A3B8]">Ningún alumno coincide con los filtros.</p>
        ) : (
          <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
            {alumnos.map((e) => {
              const talleres = nombresTalleres(e.id);
              const c = conteoPorAlumno.get(e.id);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setAbierto(e.id)}
                    className="group w-full text-left px-4 py-3 cursor-pointer transition hover:bg-[#EEF2FF]/60 dark:hover:bg-[#1E1B4B]/40 grid grid-cols-[1fr_20px] md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_70px_120px_20px] gap-x-3 gap-y-1 items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate text-[#172033] dark:text-[#F1F5F9] group-hover:text-[#4F46E5] dark:group-hover:text-[#818CF8]">
                          {e.apellido}, {e.nombre}
                        </span>
                        {e.estado === 'BAJA' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                            Baja
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[#667085] dark:text-[#94A3B8]">{e.matricula}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 md:hidden row-span-3 self-center" />
                    <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] truncate md:whitespace-normal md:line-clamp-2">
                      {talleres.length > 0 ? talleres.join(', ') : '—'}
                    </span>
                    <div>{contadoresAlumno(e.id)}</div>
                    <span className="hidden md:block text-right text-sm font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">
                      {c?.total ?? 0}
                    </span>
                    <span className="hidden md:block text-[11px] text-[#667085] dark:text-[#94A3B8]">
                      {c
                        ? new Date(c.ultima).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </span>
                    <ChevronRight className="hidden md:block w-4 h-4 text-slate-400 group-hover:text-[#4F46E5]" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {alumnoAbierto && (
        <AnecdotarioAlumnoModal
          estudiante={alumnoAbierto}
          anotaciones={anotacionesDe.get(alumnoAbierto.id) || []}
          grupoPorId={grupoPorId}
          talleres={nombresTalleres(alumnoAbierto.id)}
          currentProfile={currentProfile}
          onClose={cerrarModal}
        />
      )}
    </div>
  );
};

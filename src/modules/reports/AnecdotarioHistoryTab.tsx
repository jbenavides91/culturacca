import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, NotebookPen, Search, Trash2, Users, X } from 'lucide-react';
import { Anotacion, Estudiante, Grupo, Inscripcion, Perfil, TipoAnotacion } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { exportService } from '../../services/export.service';
import { fechaLocalISO } from '../../utils/fechas';
import { TIPOS, formatearFechaHora } from '../students/AnecdotarioModal';

type Periodo = 'mes' | 'trimestre' | 'todo' | 'rango';

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'mes', label: 'Este mes' },
  { id: 'trimestre', label: 'Últimos 3 meses' },
  { id: 'todo', label: 'Todo' },
  { id: 'rango', label: 'Rango' },
];

const TIPOS_LISTA = Object.keys(TIPOS) as TipoAnotacion[];

function rangoDePeriodo(periodo: Periodo, desde: string, hasta: string): [string, string] {
  const hoy = new Date();
  const hoyStr = fechaLocalISO(hoy);
  switch (periodo) {
    case 'mes':
      return [fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hoyStr];
    case 'trimestre':
      return [fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)), hoyStr];
    case 'todo':
      return ['0000-01-01', '9999-12-31'];
    case 'rango':
      return [desde || '0000-01-01', hasta || '9999-12-31'];
  }
}

/** Clave y etiqueta del mes local de una fecha ISO (para agrupar el historial) */
const mesDe = (iso: string) => {
  const d = new Date(iso);
  return {
    clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    etiqueta: d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
  };
};

const nombreCompleto = (e: Estudiante) => `${e.nombre} ${e.apellido}`.trim();

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
  const [tipo, setTipo] = useState<'TODOS' | TipoAnotacion>('TODOS');
  const [periodo, setPeriodo] = useState<Periodo>('todo');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [incluirBajas, setIncluirBajas] = useState(false);
  const [soloConAnotaciones, setSoloConAnotaciones] = useState(false);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [listaAbierta, setListaAbierta] = useState(false); // solo móvil

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

  const [inicio, fin] = rangoDePeriodo(periodo, desde, hasta);
  const q = busqueda.trim().toLowerCase();

  const coincideAlumno = (e: Estudiante | undefined) =>
    !!e && (nombreCompleto(e).toLowerCase().includes(q) || (e.matricula || '').toLowerCase().includes(q));

  // Anotaciones que cumplen todos los filtros (sin contar el alumno seleccionado)
  const anotFiltradas = useMemo(
    () =>
      anotaciones.filter((a) => {
        if (tipo !== 'TODOS' && a.tipo !== tipo) return false;
        const fecha = fechaLocalISO(new Date(a.creado_en));
        if (fecha < inicio || fecha > fin) return false;
        if (grupoId !== 'TODOS') {
          // Las notas sin taller cuentan si el alumno está inscrito en el taller filtrado
          const enTaller = a.grupo_id
            ? a.grupo_id === grupoId
            : (talleresDe.get(a.estudiante_id) || []).includes(grupoId);
          if (!enTaller) return false;
        }
        if (q && !a.descripcion.toLowerCase().includes(q) && !coincideAlumno(estudiantePorId.get(a.estudiante_id))) {
          return false;
        }
        return true;
      }),
    [anotaciones, tipo, inicio, fin, grupoId, q, talleresDe, estudiantePorId]
  );

  const conteoPorAlumno = useMemo(() => {
    const m = new Map<string, Record<TipoAnotacion, number> & { total: number }>();
    anotFiltradas.forEach((a) => {
      const c = m.get(a.estudiante_id) ?? { COMENTARIO: 0, INDISCIPLINA: 0, LOGRO: 0, total: 0 };
      c[a.tipo] += 1;
      c.total += 1;
      m.set(a.estudiante_id, c);
    });
    return m;
  }, [anotFiltradas]);

  // Lista de alumnos (matriculados, más cualquiera con anotaciones filtradas)
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
      .filter((e) => grupoId === 'TODOS' || (talleresDe.get(e.id) || []).includes(grupoId) || conteoPorAlumno.has(e.id))
      .filter((e) => !q || coincideAlumno(e) || conteoPorAlumno.has(e.id))
      .filter((e) => !soloConAnotaciones || conteoPorAlumno.has(e.id))
      .sort((a, b) => {
        const diff = (conteoPorAlumno.get(b.id)?.total || 0) - (conteoPorAlumno.get(a.id)?.total || 0);
        return diff !== 0 ? diff : a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre);
      });
  }, [estudiantes, esAdmin, talleresDe, incluirBajas, conteoPorAlumno, estudiantePorId, grupoId, q, soloConAnotaciones]);

  const historial = useMemo(
    () => (seleccionado ? anotFiltradas.filter((a) => a.estudiante_id === seleccionado) : anotFiltradas),
    [anotFiltradas, seleccionado]
  );

  const historialPorMes = useMemo(() => {
    const grupos: { clave: string; etiqueta: string; items: Anotacion[] }[] = [];
    historial.forEach((a) => {
      const { clave, etiqueta } = mesDe(a.creado_en);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.clave === clave) ultimo.items.push(a);
      else grupos.push({ clave, etiqueta, items: [a] });
    });
    return grupos;
  }, [historial]);

  const resumen = useMemo(
    () => ({
      total: anotFiltradas.length,
      porTipo: TIPOS_LISTA.map((t) => ({ t, n: anotFiltradas.filter((a) => a.tipo === t).length })),
      alumnos: conteoPorAlumno.size,
    }),
    [anotFiltradas, conteoPorAlumno]
  );

  const alumnoSeleccionado = seleccionado ? estudiantePorId.get(seleccionado) : undefined;
  const hayFiltros = busqueda || grupoId !== 'TODOS' || tipo !== 'TODOS' || periodo !== 'todo' || seleccionado;

  const limpiar = () => {
    setBusqueda('');
    setGrupoId('TODOS');
    setTipo('TODOS');
    setPeriodo('todo');
    setDesde('');
    setHasta('');
    setSeleccionado(null);
  };

  const nombreTaller = (a: Anotacion) => (a.grupo_id ? grupoPorId.get(a.grupo_id)?.nombre ?? 'Otro taller' : 'General');

  const exportar = () => {
    const partes = [
      PERIODOS.find((p) => p.id === periodo)?.label + (periodo === 'rango' ? ` (${desde || '…'} a ${hasta || '…'})` : ''),
      grupoId !== 'TODOS' ? `Taller: ${grupoPorId.get(grupoId)?.nombre}` : 'Todos los talleres',
      tipo !== 'TODOS' ? `Tipo: ${TIPOS[tipo].label}` : 'Todos los tipos',
      alumnoSeleccionado ? `Alumno: ${nombreCompleto(alumnoSeleccionado)}` : '',
      busqueda ? `Búsqueda: "${busqueda}"` : '',
    ].filter(Boolean);
    exportService.exportAnecdotario(
      historial.map((a) => {
        const e = estudiantePorId.get(a.estudiante_id);
        return {
          fecha: formatearFechaHora(a.creado_en),
          alumno: e ? nombreCompleto(e) : 'Alumno no encontrado',
          matricula: e?.matricula || '',
          taller: nombreTaller(a),
          tipo: TIPOS[a.tipo].label,
          descripcion: a.descripcion,
          autor: a.autor_nombre,
        };
      }),
      partes.join(' · ')
    );
  };

  const eliminar = (a: Anotacion) => {
    if (window.confirm('¿Eliminar esta anotación del anecdotario? Esta acción no se puede deshacer.')) {
      storageService.eliminarAnotacion(a.id);
    }
  };

  const inputClass =
    'text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]';
  const tarjeta = 'bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs';

  const contadoresAlumno = (id: string) => {
    const c = conteoPorAlumno.get(id);
    if (!c) return <span className="text-[10px] text-slate-400">Sin anotaciones</span>;
    return (
      <span className="flex items-center gap-2 text-[10px] font-semibold tabular-nums">
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
      <div className={`${tarjeta} p-4 space-y-3`}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar alumno, matrícula o texto..."
              className={`${inputClass} w-full pl-9`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} className={inputClass} aria-label="Taller">
              <option value="TODOS">{esAdmin ? 'Todos los talleres' : 'Todos mis talleres'}</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as typeof tipo)}
              className={inputClass}
              aria-label="Tipo de anotación"
            >
              <option value="TODOS">Todos los tipos</option>
              {TIPOS_LISTA.map((t) => (
                <option key={t} value={t}>
                  {TIPOS[t].label}
                </option>
              ))}
            </select>
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
            disabled={historial.length === 0}
            className="lg:ml-auto px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Exporta las anotaciones visibles en el historial"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap gap-0.5 p-1 bg-[#F7F8FA] dark:bg-[#151A22] rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-xs">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                  periodo === p.id
                    ? 'bg-white dark:bg-[#1B222D] text-[#4F46E5] dark:text-[#818CF8] shadow-xs'
                    : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F1F5F9]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {periodo === 'rango' && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#667085] dark:text-[#94A3B8]">
              <label className="flex items-center gap-1">
                Desde
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
              </label>
              <label className="flex items-center gap-1">
                Hasta
                <input
                  type="date"
                  value={hasta}
                  min={desde || undefined}
                  onChange={(e) => setHasta(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className={`${tarjeta} p-3`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]">Anotaciones</span>
          <div className="text-xl font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">{resumen.total}</div>
        </div>
        {resumen.porTipo.map(({ t, n }) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(tipo === t ? 'TODOS' : t)}
            className={`${tarjeta} p-3 text-left cursor-pointer hover:border-[#4F46E5]/40 transition ${
              tipo === t ? 'ring-2 ring-[#4F46E5] dark:ring-[#818CF8]' : ''
            }`}
            title={`Filtrar: ${TIPOS[t].label}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] flex items-center gap-1">
              {TIPOS[t].icon}
              {TIPOS[t].label}
            </span>
            <div className="text-xl font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">{n}</div>
          </button>
        ))}
        <div className={`${tarjeta} p-3 col-span-2 lg:col-span-1`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]">Alumnos con anotaciones</span>
          <div className="text-xl font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">{resumen.alumnos}</div>
        </div>
      </div>

      {!esAdmin && (
        <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
          Solo ves tus anotaciones y los alumnos de tus talleres. Dirección puede consultar el expediente completo.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* Alumnos */}
        <section className={`${tarjeta} overflow-hidden`}>
          <button
            type="button"
            onClick={() => setListaAbierta((v) => !v)}
            className="w-full px-4 py-3 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between gap-2 lg:cursor-default cursor-pointer"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-[#172033] dark:text-[#F1F5F9]">
              <Users className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
              Alumnos ({alumnos.length})
            </span>
            <span className="lg:hidden text-[#667085]">
              {listaAbierta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          </button>

          <div className={`${listaAbierta ? 'block' : 'hidden'} lg:block`}>
            <div className="px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#667085] dark:text-[#94A3B8] border-b border-[#E7EAF0] dark:border-[#2B3442]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={soloConAnotaciones} onChange={(e) => setSoloConAnotaciones(e.target.checked)} />
                Solo con anotaciones
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={incluirBajas} onChange={(e) => setIncluirBajas(e.target.checked)} />
                Incluir bajas
              </label>
            </div>

            <ul className="max-h-[560px] overflow-y-auto divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
              <li>
                <button
                  type="button"
                  onClick={() => setSeleccionado(null)}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold cursor-pointer transition ${
                    seleccionado === null
                      ? 'bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8]'
                      : 'text-[#172033] dark:text-[#F1F5F9] hover:bg-slate-50 dark:hover:bg-[#151A22]'
                  }`}
                >
                  Todos los alumnos
                </button>
              </li>
              {alumnos.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-[#667085] dark:text-[#94A3B8]">
                  Ningún alumno coincide con los filtros.
                </li>
              )}
              {alumnos.map((e) => {
                const activo = seleccionado === e.id;
                const talleres = (talleresDe.get(e.id) || []).map((id) => grupoPorId.get(id)?.nombre).filter(Boolean);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSeleccionado(activo ? null : e.id)}
                      className={`w-full text-left px-4 py-2.5 cursor-pointer transition space-y-1 ${
                        activo ? 'bg-[#EEF2FF] dark:bg-[#1E1B4B]' : 'hover:bg-slate-50 dark:hover:bg-[#151A22]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-semibold truncate ${
                            activo ? 'text-[#4F46E5] dark:text-[#818CF8]' : 'text-[#172033] dark:text-[#F1F5F9]'
                          }`}
                        >
                          {e.apellido}, {e.nombre}
                        </span>
                        {e.estado === 'BAJA' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                            Baja
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#667085] dark:text-[#94A3B8] truncate">
                        <span className="font-mono">{e.matricula}</span>
                        {talleres.length > 0 && ` · ${talleres.join(', ')}`}
                      </div>
                      {contadoresAlumno(e.id)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Historial */}
        <section className={`${tarjeta} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-[#E7EAF0] dark:border-[#2B3442] flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-bold text-[#172033] dark:text-[#F1F5F9] min-w-0">
              <NotebookPen className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8] shrink-0" />
              <span className="truncate">
                Historial · {alumnoSeleccionado ? nombreCompleto(alumnoSeleccionado) : 'Todos los alumnos'} ({historial.length})
              </span>
            </span>
            {alumnoSeleccionado && (
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                className="text-[11px] font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:underline cursor-pointer"
              >
                Ver todos
              </button>
            )}
          </div>

          {historial.length === 0 ? (
            <p className="py-12 px-4 text-center text-xs text-[#667085] dark:text-[#94A3B8]">
              {anotaciones.length === 0
                ? 'Aún no hay anotaciones registradas en el anecdotario.'
                : 'No hay anotaciones que coincidan con los filtros.'}
            </p>
          ) : (
            <div className="p-4 space-y-5 max-h-[760px] overflow-y-auto">
              {historialPorMes.map((mes) => (
                <div key={mes.clave} className="space-y-2.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] capitalize">
                    {mes.etiqueta} · {mes.items.length}
                  </h4>
                  <ul className="space-y-2.5">
                    {mes.items.map((a) => {
                      const e = estudiantePorId.get(a.estudiante_id);
                      return (
                        <li
                          key={a.id}
                          className="p-3.5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] space-y-2"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${TIPOS[a.tipo].badge}`}
                              >
                                {TIPOS[a.tipo].icon}
                                {TIPOS[a.tipo].label}
                              </span>
                              {!seleccionado && e && (
                                <button
                                  type="button"
                                  onClick={() => setSeleccionado(e.id)}
                                  className="text-xs font-bold text-[#172033] dark:text-[#F1F5F9] hover:text-[#4F46E5] dark:hover:text-[#818CF8] hover:underline cursor-pointer"
                                  title="Ver el historial de este alumno"
                                >
                                  {nombreCompleto(e)}
                                </button>
                              )}
                              <span className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                                {formatearFechaHora(a.creado_en)} · {nombreTaller(a)}
                              </span>
                            </div>
                            {esAdmin && (
                              <button
                                type="button"
                                onClick={() => eliminar(a)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                title="Eliminar anotación"
                                aria-label="Eliminar anotación"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed whitespace-pre-wrap text-[#172033] dark:text-[#F1F5F9]">
                            {a.descripcion}
                          </p>
                          <p className="text-[10px] text-[#667085] dark:text-[#94A3B8]">Registrado por {a.autor_nombre}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

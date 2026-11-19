import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileSpreadsheet, History, Search, X } from 'lucide-react';
import { EstadoPermanencia, Grupo, Perfil, PermanenciaAlumno, TipoEventoPermanencia } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { exportService } from '../../services/export.service';
import { esAlfabetico, ordenarAlfabetico, type Orden } from '../../utils/orden';
import { OrdenSelector } from '../../components/OrdenSelector';

interface PermanenciaTabProps {
  currentProfile: Perfil;
}

type FiltroEstado = 'TODOS' | EstadoPermanencia;

/** "12 mar 2026" a partir de YYYY-MM-DD, como fecha local */
const fechaCorta = (f?: string) => {
  if (!f) return '—';
  const [y, m, d] = f.split('-').map(Number);
  if (!y || !m || !d) return f;
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ESTADOS: Record<EstadoPermanencia, { label: string; plural: string; chip: string }> = {
  PERMANENTE: {
    label: 'Permanente',
    plural: 'Permanentes',
    chip: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  },
  REINCORPORADO: {
    label: 'Reincorporado',
    plural: 'Reincorporados',
    chip: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  },
  DE_BAJA: {
    label: 'De baja',
    plural: 'De baja',
    chip: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900',
  },
};

/** Color del punto de cada hecho en la línea de tiempo */
const PUNTO: Record<TipoEventoPermanencia, string> = {
  MATRICULA: 'bg-indigo-500',
  REMATRICULA: 'bg-emerald-500',
  RENOVACION: 'bg-sky-500',
  REACTIVACION: 'bg-emerald-500',
  ALTA_TALLER: 'bg-slate-400',
  BAJA_TALLER: 'bg-amber-500',
  BAJA: 'bg-rose-500',
};

const textoEstado = (f: PermanenciaAlumno) =>
  f.estado === 'DE_BAJA'
    ? `De baja desde ${fechaCorta(f.baja_desde)}`
    : f.estado === 'REINCORPORADO'
    ? `Reincorporado · ${f.bajas} ${f.bajas === 1 ? 'baja' : 'bajas'}`
    : 'Permanente';

export const PermanenciaTab: React.FC<PermanenciaTabProps> = ({ currentProfile }) => {
  const esAdmin = currentProfile.rol === 'ADMIN';

  const [filas, setFilas] = useState<PermanenciaAlumno[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [grupoId, setGrupoId] = useState('TODOS');
  const [estado, setEstado] = useState<FiltroEstado>('TODOS');
  const [orden, setOrden] = useState<Orden>('AZ');
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    const cargar = () => {
      let gs = storageService.getGrupos();
      if (!esAdmin) gs = gs.filter((g) => g.profesor_id === currentProfile.id);
      setGrupos(ordenarAlfabetico(gs, (g) => [g.nombre]));
      // El docente solo ve a los alumnos de sus talleres
      setFilas(storageService.historialPermanencia(esAdmin ? undefined : gs.map((g) => g.id)));
    };
    cargar();
    return subscribeToData(cargar);
  }, [esAdmin, currentProfile.id]);

  /** Filas tras búsqueda y taller (los conteos de estado se calculan sobre esto) */
  const base = useMemo(() => {
    const palabras = sinTildes(busqueda).split(/\s+/).filter(Boolean);
    return filas.filter((f) => {
      if (grupoId !== 'TODOS' && !f.grupo_ids.includes(grupoId)) return false;
      if (palabras.length === 0) return true;
      const texto = sinTildes(`${f.nombre} ${f.apellido} ${f.matricula}`);
      return palabras.every((p) => texto.includes(p));
    });
  }, [filas, busqueda, grupoId]);

  const conteo = useMemo(() => {
    const c: Record<FiltroEstado, number> = { TODOS: base.length, PERMANENTE: 0, REINCORPORADO: 0, DE_BAJA: 0 };
    base.forEach((f) => (c[f.estado] += 1));
    return c;
  }, [base]);

  const lista = useMemo(() => {
    const filtradas = estado === 'TODOS' ? base : base.filter((f) => f.estado === estado);
    if (esAlfabetico(orden)) return ordenarAlfabetico(filtradas, (f) => [f.apellido, f.nombre], orden);
    // Más antiguos primero: por fecha de primera matrícula
    return [...filtradas].sort(
      (a, b) => a.primera_matricula.localeCompare(b.primera_matricula) || a.apellido.localeCompare(b.apellido, 'es')
    );
  }, [base, estado, orden]);

  const hayFiltros = !!busqueda || grupoId !== 'TODOS' || estado !== 'TODOS';
  const limpiar = () => {
    setBusqueda('');
    setGrupoId('TODOS');
    setEstado('TODOS');
  };

  const exportar = () => {
    const partes = [
      grupoId !== 'TODOS' ? `Taller: ${grupos.find((g) => g.id === grupoId)?.nombre}` : esAdmin ? 'Todos los talleres' : 'Mis talleres',
      estado !== 'TODOS' ? `Estado: ${ESTADOS[estado].plural}` : '',
      busqueda ? `Búsqueda: "${busqueda}"` : '',
    ].filter(Boolean);
    exportService.exportPermanencia(lista, partes.join(' · '));
  };

  const inputClass =
    'text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]';
  const tarjeta = 'bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs';
  const columnas = 'md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_20px]';

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className={`${tarjeta} p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center gap-2`}>
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar alumno o código..."
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
          <OrdenSelector value={orden} onChange={setOrden} extra={[{ value: 'ANTIGUOS', label: 'Más antiguos primero' }]} />
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
          disabled={lista.length === 0}
          className="lg:ml-auto px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>

      {/* Estado: segmentos con conteo */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar por estado">
        {(['TODOS', 'PERMANENTE', 'REINCORPORADO', 'DE_BAJA'] as FiltroEstado[]).map((e) => {
          const activo = estado === e;
          return (
            <button
              key={e}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setEstado(e)}
              className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                activo
                  ? 'bg-[#4F46E5] border-[#4F46E5] text-white'
                  : 'bg-white dark:bg-[#1B222D] border-[#E7EAF0] dark:border-[#2B3442] text-[#667085] dark:text-[#94A3B8] hover:border-indigo-300'
              }`}
            >
              {e === 'TODOS' ? 'Todos' : ESTADOS[e].plural}
              <span className={`tabular-nums ${activo ? 'text-indigo-100' : 'text-slate-400'}`}>{conteo[e]}</span>
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <section className={`${tarjeta} overflow-hidden`}>
        <div className={`hidden md:grid ${columnas} gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] bg-[#F7F8FA] dark:bg-[#151A22] border-b border-[#E7EAF0] dark:border-[#2B3442]`}>
          <span>Alumno</span>
          <span>Primera matrícula</span>
          <span>Permanencia</span>
          <span>Estado</span>
          <span />
        </div>

        {lista.length === 0 ? (
          <div className="px-4 py-10 text-center space-y-1">
            <History className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-xs text-[#667085] dark:text-[#94A3B8]">
              {filas.length === 0 ? 'Aún no hay alumnos registrados.' : 'Ningún alumno coincide con los filtros.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
            {lista.map((f) => {
              const expandido = abierto === f.estudiante_id;
              return (
                <li key={f.estudiante_id}>
                  <button
                    type="button"
                    onClick={() => setAbierto(expandido ? null : f.estudiante_id)}
                    aria-expanded={expandido}
                    className={`w-full text-left px-4 py-3 cursor-pointer transition hover:bg-[#F7F8FA] dark:hover:bg-[#151A22] grid grid-cols-[1fr_20px] ${columnas} gap-x-3 gap-y-1.5 items-center`}
                  >
                    <div className="min-w-0">
                      <span className="block text-xs font-semibold truncate text-[#172033] dark:text-[#F1F5F9]">
                        {f.apellido}, {f.nombre}
                      </span>
                      <span className="block text-[10px] text-[#667085] dark:text-[#94A3B8] truncate">
                        <span className="font-mono">{f.matricula}</span>
                        {f.grado ? ` · ${f.grado}` : ''}
                        {f.talleres.length > 0 ? ` · ${f.talleres.join(', ')}` : ''}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform md:hidden row-span-4 self-center ${expandido ? 'rotate-180' : ''}`}
                    />
                    <span className="text-[11px] text-[#172033] dark:text-[#F1F5F9]">
                      <span className="md:hidden text-[#667085] dark:text-[#94A3B8]">Desde </span>
                      {fechaCorta(f.primera_matricula)}
                    </span>
                    <span className="text-[11px] font-semibold text-[#172033] dark:text-[#F1F5F9]">
                      {f.permanencia}
                      {f.anios_activos.length > 1 && (
                        <span className="font-normal text-[#667085] dark:text-[#94A3B8]"> · {f.anios_activos.join(', ')}</span>
                      )}
                    </span>
                    <span>
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${ESTADOS[f.estado].chip}`}>
                        {textoEstado(f)}
                      </span>
                    </span>
                    <ChevronDown
                      className={`hidden md:block w-4 h-4 text-slate-400 transition-transform ${expandido ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Línea de tiempo */}
                  {expandido && (
                    <div className="px-4 pb-4 pt-1 bg-[#F7F8FA]/60 dark:bg-[#151A22]/60">
                      <ol className="relative ml-1.5 border-l border-[#E7EAF0] dark:border-[#2B3442] space-y-2.5 py-1">
                        {f.eventos.map((e, i) => (
                          <li key={`${e.fecha}-${e.tipo}-${i}`} className="relative pl-4">
                            <span className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#1B222D] ${PUNTO[e.tipo]}`} />
                            <span className="block sm:inline-block sm:w-28 text-[10px] font-semibold tabular-nums text-[#667085] dark:text-[#94A3B8]">
                              {fechaCorta(e.fecha)}
                            </span>
                            <span className="text-[11px] text-[#172033] dark:text-[#F1F5F9]">{e.detalle}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[10px] text-[#667085] dark:text-[#94A3B8]">
        La permanencia cuenta desde la primera matrícula registrada en el sistema y descuenta los periodos de baja.
        {!esAdmin && ' Solo ves a los alumnos de tus talleres.'}
      </p>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Filter,
  List,
  Search,
  UserX,
  X,
} from 'lucide-react';
import { storageService } from '../../services/storage.service';
import { Asistencia, Grupo, Perfil, Sesion } from '../../types/attendance';
import { fechaLocalISO } from '../../utils/fechas';
import {
  BadgeExtra,
  ESTADOS,
  EstadoToma,
  FilaEstatus,
  finDeMes,
  formatearFecha,
  inicioDeMes,
  lunesDe,
  ordenarPorFechaHora,
  sumarDias,
  sumarMeses,
} from './attendanceStatus.shared';
import { AttendanceWeekGrid } from './AttendanceWeekGrid';
import { AttendanceMonthCalendar } from './AttendanceMonthCalendar';
import { AttendanceWorkshopList } from './AttendanceWorkshopList';

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'ciclo' | 'rango';
type Vista = 'lista' | 'semana' | 'mes';

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'ciclo', label: 'Todo el ciclo' },
  { id: 'rango', label: 'Rango' },
];

const VISTAS: { id: Vista; label: string; icon: React.ReactNode }[] = [
  { id: 'lista', label: 'Talleres', icon: <List className="w-3.5 h-3.5" /> },
  { id: 'semana', label: 'Semana', icon: <CalendarRange className="w-3.5 h-3.5" /> },
  { id: 'mes', label: 'Mes', icon: <CalendarDays className="w-3.5 h-3.5" /> },
];

const CLAVE_VISTA = 'cca_panel_vista_asistencia';

const leerVistaGuardada = (): Vista => {
  try {
    const v = localStorage.getItem(CLAVE_VISTA);
    if (v === 'lista' || v === 'semana' || v === 'mes') return v;
  } catch {
    /* almacenamiento no disponible */
  }
  return 'lista';
};

/** Fecha local en formato YYYY-MM-DD (no UTC, para no saltar de día por la tarde) */
const fechaLocal = fechaLocalISO;

const horaLocal = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function rangoDePeriodo(periodo: Periodo, desde: string, hasta: string, hoy: Date): [string, string] {
  const hoyStr = fechaLocal(hoy);
  switch (periodo) {
    case 'hoy':
      return [hoyStr, hoyStr];
    case 'ayer': {
      const a = new Date(hoy);
      a.setDate(a.getDate() - 1);
      const s = fechaLocal(a);
      return [s, s];
    }
    case 'semana': {
      const lunes = new Date(hoy);
      const dia = lunes.getDay() === 0 ? 7 : lunes.getDay();
      lunes.setDate(lunes.getDate() - (dia - 1));
      const domingo = new Date(lunes);
      domingo.setDate(lunes.getDate() + 6);
      return [fechaLocal(lunes), fechaLocal(domingo)];
    }
    case 'mes': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      return [fechaLocal(inicio), fechaLocal(fin)];
    }
    case 'ciclo':
      return ['0000-01-01', hoyStr];
    case 'rango':
      return [desde || hoyStr, hasta || desde || hoyStr];
  }
}

const etiquetaSemana = (lunes: string) => {
  const domingo = sumarDias(lunes, 6);
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };
  return `${fmt(lunes)} – ${fmt(domingo)}`;
};

const etiquetaMes = (inicio: string) => {
  const [y, m] = inicio.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
};

interface AttendanceStatusPanelProps {
  grupos: Grupo[];
  sesiones: Sesion[];
  asistencias: Asistencia[];
  perfiles: Perfil[];
  onPasarLista: (grupoId: string, sesionId: string) => void;
}

export const AttendanceStatusPanel: React.FC<AttendanceStatusPanelProps> = ({
  grupos,
  sesiones,
  asistencias,
  perfiles,
  onPasarLista,
}) => {
  const ahora = new Date();
  const hoyStr = fechaLocal(ahora);
  const horaActual = horaLocal(ahora);

  const [vista, setVistaState] = useState<Vista>(leerVistaGuardada);
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [semanaInicio, setSemanaInicio] = useState(() => lunesDe(hoyStr));
  const [mesInicio, setMesInicio] = useState(() => inicioDeMes(hoyStr));
  const [busqueda, setBusqueda] = useState('');
  const [docenteId, setDocenteId] = useState('TODOS');
  const [estado, setEstado] = useState<'TODOS' | EstadoToma | 'SIN_ASISTENCIA' | 'CON_ASISTENCIA'>('TODOS');

  const setVista = (v: Vista) => {
    setVistaState(v);
    try {
      localStorage.setItem(CLAVE_VISTA, v);
    } catch {
      /* almacenamiento no disponible */
    }
  };

  const docentes = useMemo(() => {
    const ids = new Set(grupos.map((g) => g.profesor_id).filter(Boolean));
    return perfiles.filter((p) => ids.has(p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [grupos, perfiles]);

  // Calcular el estado de cada sesión
  const filas = useMemo<FilaEstatus[]>(() => {
    const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
    const perfilPorId = new Map(perfiles.map((p) => [p.id, p]));

    // Alumnos activos inscritos por taller
    const inscritosPorGrupo = new Map<string, Set<string>>();
    grupos.forEach((g) => {
      const ids = storageService
        .getEstudiantesByGrupo(g.id)
        .filter((e) => e.estado !== 'BAJA')
        .map((e) => e.id);
      inscritosPorGrupo.set(g.id, new Set(ids));
    });

    // Alumnos con asistencia registrada por sesión
    const marcadosPorSesion = new Map<string, Set<string>>();
    asistencias.forEach((a) => {
      if (!marcadosPorSesion.has(a.sesion_id)) marcadosPorSesion.set(a.sesion_id, new Set());
      marcadosPorSesion.get(a.sesion_id)!.add(a.estudiante_id);
    });

    return sesiones
      .filter((s) => grupoPorId.has(s.grupo_id))
      .map((s) => {
        const grupo = grupoPorId.get(s.grupo_id)!;
        const inscritosSet = inscritosPorGrupo.get(grupo.id) ?? new Set<string>();
        const marcadosSet = marcadosPorSesion.get(s.id) ?? new Set<string>();
        const marcados = Array.from(marcadosSet).filter((id) => inscritosSet.has(id)).length;
        const inscritos = inscritosSet.size;
        const prof = perfilPorId.get(grupo.profesor_id);

        let estadoSesion: EstadoToma;
        if (s.cerrada) estadoSesion = 'CERRADA';
        else if (s.fecha > hoyStr || (s.fecha === hoyStr && s.hora_inicio > horaActual)) estadoSesion = 'PROGRAMADA';
        else if (inscritos === 0) estadoSesion = 'SIN_ALUMNOS';
        else if (marcados === 0) estadoSesion = 'PENDIENTE';
        else if (marcados < inscritos) estadoSesion = 'PARCIAL';
        else estadoSesion = 'TOMADA';

        return {
          sesion: s,
          grupo,
          docente: prof ? `${prof.nombre} ${prof.apellido}` : 'Sin docente asignado',
          inscritos,
          marcados,
          estado: estadoSesion,
        };
      });
  }, [grupos, sesiones, asistencias, perfiles, hoyStr, horaActual]);

  // Rango activo: el período elegido en Lista, o la semana / el mes mostrados en el calendario
  const [inicio, fin] =
    vista === 'semana'
      ? [semanaInicio, sumarDias(semanaInicio, 6)]
      : vista === 'mes'
      ? [mesInicio, finDeMes(mesInicio)]
      : rangoDePeriodo(periodo, desde, hasta, ahora);

  // Filas del rango (para los indicadores) y filas filtradas (para la tabla o el calendario)
  const filasPeriodo = useMemo(
    () => filas.filter((f) => f.sesion.fecha >= inicio && f.sesion.fecha <= fin),
    [filas, inicio, fin]
  );

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filasPeriodo
      .filter((f) => docenteId === 'TODOS' || f.grupo.profesor_id === docenteId)
      .filter((f) => {
        if (estado === 'TODOS') return true;
        if (estado === 'SIN_ASISTENCIA') return f.estado === 'PENDIENTE' || f.estado === 'PARCIAL';
        if (estado === 'CON_ASISTENCIA') return f.estado === 'CERRADA' || f.estado === 'TOMADA';
        return f.estado === estado;
      })
      .filter(
        (f) =>
          !q ||
          f.grupo.nombre.toLowerCase().includes(q) ||
          f.docente.toLowerCase().includes(q) ||
          (f.grupo.aula || '').toLowerCase().includes(q)
      )
      .sort((a, b) =>
        a.sesion.fecha === b.sesion.fecha
          ? a.sesion.hora_inicio.localeCompare(b.sesion.hora_inicio)
          : b.sesion.fecha.localeCompare(a.sesion.fecha)
      );
  }, [filasPeriodo, docenteId, estado, busqueda]);

  const resumen = useMemo(() => {
    const base = filasPeriodo.filter((f) => docenteId === 'TODOS' || f.grupo.profesor_id === docenteId);
    const cuenta = (e: EstadoToma) => base.filter((f) => f.estado === e).length;
    const conAsistencia = cuenta('CERRADA') + cuenta('TOMADA');
    const parciales = cuenta('PARCIAL');
    const pendientes = cuenta('PENDIENTE');
    const evaluables = conAsistencia + parciales + pendientes;
    return {
      evaluables,
      conAsistencia,
      parciales,
      pendientes,
      programadas: cuenta('PROGRAMADA'),
      cumplimiento: evaluables > 0 ? Math.round((conAsistencia / evaluables) * 100) : 100,
    };
  }, [filasPeriodo, docenteId]);

  // Sesiones atrasadas de todo el ciclo (antes de hoy y sin asistencia completa)
  const atrasadas = useMemo(
    () => filas.filter((f) => f.sesion.fecha < hoyStr && (f.estado === 'PENDIENTE' || f.estado === 'PARCIAL')).length,
    [filas, hoyStr]
  );

  // Próximas clases (para cuando el período elegido no tiene sesiones)
  const proximas = useMemo(
    () =>
      filas
        .filter((f) => f.sesion.fecha > fin && (docenteId === 'TODOS' || f.grupo.profesor_id === docenteId))
        .sort(ordenarPorFechaHora)
        .slice(0, 5),
    [filas, fin, docenteId]
  );

  const hayFiltros = busqueda || docenteId !== 'TODOS' || estado !== 'TODOS';
  const talleresVisibles = useMemo(() => new Set(filasFiltradas.map((f) => f.grupo.id)).size, [filasFiltradas]);

  const limpiarFiltros = () => {
    setBusqueda('');
    setDocenteId('TODOS');
    setEstado('TODOS');
  };

  const verAtrasadas = () => {
    setVista('lista');
    setPeriodo('ciclo');
    setEstado('SIN_ASISTENCIA');
  };

  const navegar = (delta: number) => {
    if (vista === 'semana') setSemanaInicio((s) => sumarDias(s, 7 * delta));
    else setMesInicio((m) => sumarMeses(m, delta));
  };

  const irAHoy = () => {
    setSemanaInicio(lunesDe(hoyStr));
    setMesInicio(inicioDeMes(hoyStr));
  };

  const enRangoActual = vista === 'semana' ? semanaInicio === lunesDe(hoyStr) : mesInicio === inicioDeMes(hoyStr);

  const inputClass =
    'text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]';
  const segmentoClass = 'inline-flex flex-wrap gap-0.5 p-1 bg-[#F7F8FA] dark:bg-[#151A22] rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-xs';
  const botonSegmento = (activo: boolean) =>
    `px-3 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1.5 ${
      activo
        ? 'bg-white dark:bg-[#1B222D] text-[#4F46E5] dark:text-[#818CF8] shadow-xs'
        : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F1F5F9]'
    }`;
  const botonNav =
    'p-1.5 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer';

  return (
    <section className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs overflow-hidden">
      {/* Encabezado */}
      <div className="p-5 border-b border-[#E7EAF0] dark:border-[#2B3442] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CalendarCheck className="w-5 h-5 text-[#4F46E5] dark:text-[#818CF8] shrink-0" />
          <h2 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">Estatus de Toma de Asistencia</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {atrasadas > 0 && (
            <button
              type="button"
              onClick={verAtrasadas}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition cursor-pointer flex items-center gap-1.5"
            >
              <UserX className="w-3.5 h-3.5" />
              {atrasadas} {atrasadas === 1 ? 'sesión atrasada' : 'sesiones atrasadas'} sin asistencia
            </button>
          )}
          <div className={segmentoClass} role="tablist" aria-label="Vista">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={vista === v.id}
                onClick={() => setVista(v.id)}
                className={botonSegmento(vista === v.id)}
              >
                {v.icon}
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Período (Lista) o navegación (Semana / Mes) */}
      <div className="px-5 pt-4 flex flex-wrap items-center gap-2">
        {vista === 'lista' ? (
          <>
            <div className={segmentoClass}>
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodo(p.id)}
                  className={botonSegmento(periodo === p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodo === 'rango' && (
              <div className="flex items-center gap-2 text-xs text-[#667085] dark:text-[#94A3B8]">
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
          </>
        ) : (
          <>
            <button type="button" onClick={() => navegar(-1)} className={botonNav} aria-label="Anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => navegar(1)} className={botonNav} aria-label="Siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] capitalize min-w-[140px]">
              {vista === 'semana' ? etiquetaSemana(semanaInicio) : etiquetaMes(mesInicio)}
            </span>
            {!enRangoActual && (
              <button
                type="button"
                onClick={irAHoy}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8] hover:bg-[#E0E7FF] dark:hover:bg-indigo-950 transition cursor-pointer"
              >
                {vista === 'semana' ? 'Esta semana' : 'Este mes'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Indicadores del rango */}
      <div className="px-5 pt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]">Cumplimiento</span>
          <div className="text-xl font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">{resumen.cumplimiento}%</div>
          <div className="mt-1 w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full ${
                resumen.cumplimiento >= 90 ? 'bg-emerald-500' : resumen.cumplimiento >= 60 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${resumen.cumplimiento}%` }}
            />
          </div>
        </div>
        {(
          [
            { label: 'Con asistencia', valor: resumen.conAsistencia, color: 'text-emerald-600 dark:text-emerald-400', filtro: 'CON_ASISTENCIA' },
            { label: 'Parciales', valor: resumen.parciales, color: 'text-amber-600 dark:text-amber-400', filtro: 'PARCIAL' },
            { label: 'Pendientes', valor: resumen.pendientes, color: 'text-rose-600 dark:text-rose-400', filtro: 'PENDIENTE' },
            { label: 'Programadas', valor: resumen.programadas, color: 'text-slate-600 dark:text-slate-300', filtro: 'PROGRAMADA' },
          ] as const
        ).map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={() => setEstado(k.filtro)}
            className="text-left p-3 rounded-lg bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] hover:border-[#4F46E5]/40 transition cursor-pointer"
            title={`Filtrar: ${k.label}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]">{k.label}</span>
            <div className={`text-xl font-bold tabular-nums ${k.color}`}>{k.valor}</div>
          </button>
        ))}
      </div>

      {/* Filtros de búsqueda */}
      <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar taller, docente o aula..."
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] hidden sm:block" />
          <select value={docenteId} onChange={(e) => setDocenteId(e.target.value)} className={inputClass} aria-label="Docente">
            <option value="TODOS">Todos los docentes</option>
            {docentes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre} {d.apellido}
              </option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as typeof estado)}
            className={inputClass}
            aria-label="Estado"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="CON_ASISTENCIA">Con asistencia</option>
            <option value="SIN_ASISTENCIA">Sin asistencia completa</option>
            {(Object.keys(ESTADOS) as EstadoToma[]).map((e) => (
              <option key={e} value={e}>
                {ESTADOS[e].label}
              </option>
            ))}
          </select>
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
        </div>
        <span className="lg:ml-auto text-xs text-[#667085] dark:text-[#94A3B8] font-mono">
          {vista === 'lista' && (
            <>
              {talleresVisibles} {talleresVisibles === 1 ? 'taller' : 'talleres'} ·{' '}
            </>
          )}
          {filasFiltradas.length} {filasFiltradas.length === 1 ? 'sesión' : 'sesiones'}
        </span>
      </div>

      {/* Contenido según la vista */}
      <div className="border-t border-[#E7EAF0] dark:border-[#2B3442]">
        {vista === 'semana' && (
          <AttendanceWeekGrid
            filas={filasFiltradas}
            semanaInicio={semanaInicio}
            hoyStr={hoyStr}
            onPasarLista={onPasarLista}
          />
        )}

        {vista === 'mes' && (
          <AttendanceMonthCalendar
            key={mesInicio}
            filas={filasFiltradas}
            mesInicio={mesInicio}
            hoyStr={hoyStr}
            onPasarLista={onPasarLista}
          />
        )}

        {vista === 'lista' &&
          (filasPeriodo.length > 0 ? (
            <AttendanceWorkshopList filas={filasFiltradas} hoyStr={hoyStr} onPasarLista={onPasarLista} />
          ) : (
            <div className="py-8 px-4 text-xs text-[#667085] dark:text-[#94A3B8]">
                      {proximas.length === 0 ? (
                        <p className="text-center">No hay clases en este período ni próximas clases programadas.</p>
                      ) : (
                        <div className="max-w-xl mx-auto space-y-2">
                          <p className="text-center font-semibold text-[#172033] dark:text-[#F1F5F9]">
                            No hay clases en este período. Próximas clases:
                          </p>
                          <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg">
                            {proximas.map((f) => (
                              <li key={f.sesion.id} className="px-3 py-2 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate flex items-center gap-1.5">
                                    {f.grupo.nombre}
                                    {f.sesion.extraordinaria && <BadgeExtra />}
                                  </p>
                                  <p className="text-[11px] truncate">{f.docente}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-semibold capitalize text-[#172033] dark:text-[#F1F5F9]">
                                    {formatearFecha(f.sesion.fecha)}
                                  </p>
                                  <p className="font-mono text-[11px]">
                                    {f.sesion.hora_inicio} - {f.sesion.hora_fin}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
            </div>
          ))}
      </div>
    </section>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Filter, TrendingUp, Users, X } from 'lucide-react';
import { storageService } from '../../services/storage.service';
import { Asistencia, Estudiante, Grupo, Perfil, Sesion, Tutor } from '../../types/attendance';
import { fechaLocalISO } from '../../utils/fechas';
import { finDeMes, inicioDeMes, lunesDe, sumarDias } from './attendanceStatus.shared';

type Periodo = 'hoy' | 'semana' | 'mes' | 'todo' | 'rango';

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'todo', label: 'Todo el ciclo' },
  { id: 'rango', label: 'Rango' },
];

const CLAVE_FILTROS = 'cca_panel_kpi_filtros';

interface Filtros {
  periodo: Periodo;
  desde: string;
  hasta: string;
  grupoId: string; // 'TODOS' o id del taller
}

const FILTROS_INICIALES: Filtros = { periodo: 'todo', desde: '', hasta: '', grupoId: 'TODOS' };

const leerFiltros = (): Filtros => {
  try {
    const crudo = localStorage.getItem(CLAVE_FILTROS);
    if (!crudo) return FILTROS_INICIALES;
    const f = JSON.parse(crudo) as Partial<Filtros>;
    return {
      periodo: PERIODOS.some((p) => p.id === f.periodo) ? (f.periodo as Periodo) : 'todo',
      desde: typeof f.desde === 'string' ? f.desde : '',
      hasta: typeof f.hasta === 'string' ? f.hasta : '',
      grupoId: typeof f.grupoId === 'string' ? f.grupoId : 'TODOS',
    };
  } catch {
    return FILTROS_INICIALES;
  }
};

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface DashboardKpisProps {
  grupos: Grupo[];
  sesiones: Sesion[];
  asistencias: Asistencia[];
  estudiantes: Estudiante[];
  tutores: Tutor[];
  perfiles: Perfil[];
}

/** Tarjetas de indicadores del Panel, con filtros propios de período y taller */
export const DashboardKpis: React.FC<DashboardKpisProps> = ({
  grupos,
  sesiones,
  asistencias,
  estudiantes,
  tutores,
  perfiles,
}) => {
  const [filtros, setFiltros] = useState<Filtros>(leerFiltros);
  const { periodo, desde, hasta, grupoId } = filtros;

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_FILTROS, JSON.stringify(filtros));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [filtros]);

  const actualizar = (cambios: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...cambios }));

  // Si el taller guardado ya no existe, volver a "Todos"
  const grupoValido = grupoId === 'TODOS' || grupos.some((g) => g.id === grupoId);
  const grupoSel = grupoValido ? grupoId : 'TODOS';

  const hoyStr = fechaLocalISO(new Date());
  const [inicio, fin] = useMemo<[string, string]>(() => {
    switch (periodo) {
      case 'hoy':
        return [hoyStr, hoyStr];
      case 'semana': {
        const lunes = lunesDe(hoyStr);
        return [lunes, sumarDias(lunes, 6)];
      }
      case 'mes':
        return [inicioDeMes(hoyStr), finDeMes(hoyStr)];
      case 'rango':
        return [desde || '0000-01-01', hasta || '9999-12-31'];
      default:
        return ['0000-01-01', '9999-12-31'];
    }
  }, [periodo, desde, hasta, hoyStr]);

  const rangoInvalido = periodo === 'rango' && !!desde && !!hasta && hasta < desde;
  const filtraFecha = periodo !== 'todo';
  const hayFiltros = filtraFecha || grupoSel !== 'TODOS';

  const nombreDocente = useMemo(() => {
    const m = new Map(perfiles.map((p) => [p.id, `${p.nombre} ${p.apellido}`.trim()]));
    return (id: string) => m.get(id);
  }, [perfiles]);

  const gruposOrdenados = useMemo(() => [...grupos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [grupos]);

  const stats = useMemo(() => {
    const enTaller = (gid: string) => grupoSel === 'TODOS' || gid === grupoSel;
    const sesionesBase = rangoInvalido
      ? []
      : sesiones.filter((s) => enTaller(s.grupo_id) && s.fecha >= inicio && s.fecha <= fin);
    const idsSesion = new Set(sesionesBase.map((s) => s.id));

    // 1. Asistencia
    const registros = asistencias.filter((a) => idsSesion.has(a.sesion_id));
    const presentes = registros.filter((a) => a.estatus === 'PRESENTE').length;
    const justificados = registros.filter((a) => a.estatus === 'JUSTIFICADO').length;
    const tasaAsistencia = registros.length > 0 ? Math.round((presentes / registros.length) * 100) : 0;
    const tasaJustificada = registros.length > 0 ? Math.round((justificados / registros.length) * 100) : 0;

    // 2. Sesiones
    const sesionesCerradas = sesionesBase.filter((s) => s.cerrada).length;
    const sesionesTotales = sesionesBase.length;
    const progreso = sesionesTotales > 0 ? Math.round((sesionesCerradas / sesionesTotales) * 100) : 0;

    // 3. Alertas (acumuladas del ciclo; solo responden al taller)
    const alertas = storageService
      .calcularAlertasEstudiantes(grupoSel === 'TODOS' ? undefined : grupoSel)
      .filter((a) => a.tiene_alerta);

    // 4. Talleres y comunidad
    let talleres: number;
    let alumnos: number;
    let numTutores: number;
    if (!hayFiltros) {
      // Sin filtros: mismos totales generales de siempre
      talleres = grupos.length;
      alumnos = estudiantes.length;
      numTutores = tutores.length;
    } else {
      const idsTaller = filtraFecha
        ? new Set(sesionesBase.map((s) => s.grupo_id))
        : new Set(grupos.filter((g) => enTaller(g.id)).map((g) => g.id));
      const alumnosSet = new Map<string, Estudiante>();
      idsTaller.forEach((gid) =>
        storageService
          .getEstudiantesByGrupo(gid)
          .filter((e) => e.estado !== 'BAJA')
          .forEach((e) => alumnosSet.set(e.id, e))
      );
      talleres = idsTaller.size;
      alumnos = alumnosSet.size;
      numTutores = new Set(Array.from(alumnosSet.values()).map((e) => e.tutor_id).filter(Boolean)).size;
    }

    return {
      registros: registros.length,
      presentes,
      tasaAsistencia,
      tasaJustificada,
      sesionesCerradas,
      sesionesTotales,
      progreso,
      alertas: alertas.length,
      talleres,
      alumnos,
      numTutores,
    };
  }, [sesiones, asistencias, grupos, estudiantes, tutores, grupoSel, inicio, fin, rangoInvalido, hayFiltros, filtraFecha]);

  const sinClases = filtraFecha && stats.sesionesTotales === 0;

  const descripcion = [
    periodo === 'todo'
      ? 'Todo el ciclo'
      : periodo === 'rango'
      ? `${desde ? fechaCorta(desde) : 'Inicio'} – ${hasta ? fechaCorta(hasta) : 'sin límite'}`
      : inicio === fin
      ? fechaCorta(inicio)
      : `${fechaCorta(inicio)} – ${fechaCorta(fin)}`,
    grupoSel === 'TODOS' ? 'Todos los talleres' : grupos.find((g) => g.id === grupoSel)?.nombre,
  ]
    .filter(Boolean)
    .join(' · ');

  const inputClass =
    'text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] text-[#172033] dark:text-[#F1F5F9] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]';
  const tarjeta = 'bg-white dark:bg-[#1B222D] p-5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs';
  const etiqueta = 'flex items-center justify-between text-[#667085] dark:text-[#94A3B8] text-xs font-medium';
  const valor = 'text-2xl lg:text-3xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9] tabular-nums';
  const pie = 'mt-2 text-[11px] text-[#667085] dark:text-[#94A3B8]';

  return (
    <section className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Filter className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8] shrink-0" />
          <h2 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">Indicadores</h2>
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">· {descripcion}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
          <div className="inline-flex flex-wrap gap-0.5 p-1 bg-[#F7F8FA] dark:bg-[#151A22] rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-xs">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => actualizar({ periodo: p.id })}
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
          <select
            value={grupoSel}
            onChange={(e) => actualizar({ grupoId: e.target.value })}
            className={`${inputClass} max-w-full`}
            aria-label="Taller"
          >
            <option value="TODOS">Todos los talleres</option>
            {gruposOrdenados.map((g) => {
              const docente = nombreDocente(g.profesor_id);
              return (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                  {docente ? ` (${docente})` : ''}
                </option>
              );
            })}
          </select>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => setFiltros(FILTROS_INICIALES)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {periodo === 'rango' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#667085] dark:text-[#94A3B8] xl:justify-end">
          <label className="flex items-center gap-1">
            Desde
            <input type="date" value={desde} onChange={(e) => actualizar({ desde: e.target.value })} className={inputClass} />
          </label>
          <label className="flex items-center gap-1">
            Hasta
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => actualizar({ hasta: e.target.value })}
              className={inputClass}
            />
          </label>
          {rangoInvalido && (
            <span className="font-semibold text-rose-600 dark:text-rose-400">"Hasta" debe ser igual o posterior a "Desde".</span>
          )}
        </div>
      )}

      {/* Tarjetas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Asistencia */}
        <div className={tarjeta}>
          <div className={etiqueta}>
            <span>{filtraFecha || grupoSel !== 'TODOS' ? 'Tasa de Asistencia' : 'Tasa de Asistencia Global'}</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className={valor}>{stats.registros > 0 ? `${stats.tasaAsistencia}%` : '—'}</span>
            {stats.registros > 0 && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                +{stats.tasaJustificada}% justificado
              </span>
            )}
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${stats.tasaAsistencia}%` }}
            />
          </div>
          <p className={pie}>
            {sinClases
              ? 'Sin clases en el período'
              : stats.registros === 0
              ? 'Aún no hay asistencias registradas'
              : `${stats.presentes} asistencias de ${stats.registros} registros${filtraFecha ? ' en el período' : ''}`}
          </p>
        </div>

        {/* 2. Sesiones */}
        <div className={tarjeta}>
          <div className={etiqueta}>
            <span>Sesiones Concluidas</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className={valor}>
              {stats.sesionesCerradas} / {stats.sesionesTotales}
            </span>
            {stats.sesionesTotales > 0 && (
              <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">({stats.progreso}%)</span>
            )}
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${stats.progreso}%` }}
            />
          </div>
          <p className={pie}>
            {sinClases
              ? 'Sin clases en el período'
              : `${stats.sesionesTotales - stats.sesionesCerradas} sesiones pendientes`}
          </p>
        </div>

        {/* 3. Alertas (acumuladas del ciclo) */}
        <div className={tarjeta}>
          <div className={etiqueta}>
            <span>Alertas de Inasistencia</span>
            <AlertTriangle className={`w-4 h-4 ${stats.alertas > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className={valor}>{stats.alertas}</span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              {stats.alertas === 1 ? 'Alumno en riesgo' : 'Alumnos en riesgo'}
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${stats.alertas > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(stats.alertas * 25, 100)}%` }}
            />
          </div>
          <p className={pie} title="Las alertas se calculan sobre todo el ciclo con el umbral de Configuración; solo les afecta el filtro de taller.">
            Acumulado del ciclo · umbral de Configuración
          </p>
        </div>

        {/* 4. Talleres y comunidad */}
        <div className={tarjeta}>
          <div className={etiqueta}>
            <span>Talleres & Comunidad</span>
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className={valor}>{stats.talleres}</span>
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              {filtraFecha
                ? stats.talleres === 1
                  ? 'taller con clases en el período'
                  : 'talleres con clases en el período'
                : stats.talleres === 1
                ? 'taller activo'
                : 'talleres activos'}
            </span>
          </div>
          <div className="mt-3 flex items-center flex-wrap gap-x-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
            <span>
              <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">{stats.alumnos}</span>{' '}
              {hayFiltros ? 'alumnos inscritos' : 'alumnos matriculados'}
            </span>
            <span>•</span>
            <span>
              <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">{stats.numTutores}</span> tutores
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

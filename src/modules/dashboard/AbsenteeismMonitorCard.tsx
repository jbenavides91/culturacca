import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ShieldAlert, Users, X } from 'lucide-react';
import { storageService } from '../../services/storage.service';
import { Asistencia, Grupo, Perfil, Sesion } from '../../types/attendance';
import { fechaLocalISO } from '../../utils/fechas';
import { finDeMes, inicioDeMes, lunesDe, sumarDias } from './attendanceStatus.shared';

type Periodo = 'semana' | 'mes' | 'ciclo' | 'rango';

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'ciclo', label: 'Ciclo' },
  { id: 'rango', label: 'Rango' },
];

const CLAVE_FILTROS = 'cca_panel_ausentismo_filtros';

interface Filtros {
  periodo: Periodo;
  desde: string;
  hasta: string;
  grupoId: string; // 'TODOS' o id del taller
}

const FILTROS_INICIALES: Filtros = { periodo: 'ciclo', desde: '', hasta: '', grupoId: 'TODOS' };

const leerFiltros = (): Filtros => {
  try {
    const f = JSON.parse(localStorage.getItem(CLAVE_FILTROS) || 'null') as Partial<Filtros> | null;
    if (!f) return FILTROS_INICIALES;
    return {
      periodo: PERIODOS.some((p) => p.id === f.periodo) ? (f.periodo as Periodo) : 'ciclo',
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

interface AbsenteeismMonitorCardProps {
  grupos: Grupo[];
  perfiles: Perfil[];
  /** Se reciben para recalcular cuando cambian los datos */
  sesiones: Sesion[];
  asistencias: Asistencia[];
  onVerEstudiantes: () => void;
}

/** Alumnos en riesgo por inasistencia, con filtros propios de fechas y taller */
export const AbsenteeismMonitorCard: React.FC<AbsenteeismMonitorCardProps> = ({
  grupos,
  perfiles,
  sesiones,
  asistencias,
  onVerEstudiantes,
}) => {
  const [filtros, setFiltros] = useState<Filtros>(leerFiltros);
  const { periodo, desde, hasta, grupoId } = filtros;

  // Si el taller guardado ya no existe, volver a "Todos"
  const grupoSel = grupoId === 'TODOS' || grupos.some((g) => g.id === grupoId) ? grupoId : 'TODOS';
  const gruposOrdenados = useMemo(() => [...grupos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [grupos]);
  const nombreDocente = useMemo(() => {
    const m = new Map(perfiles.map((p) => [p.id, `${p.nombre} ${p.apellido}`.trim()]));
    return (id: string) => m.get(id);
  }, [perfiles]);
  const hayFiltros = periodo !== 'ciclo' || grupoSel !== 'TODOS';

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_FILTROS, JSON.stringify(filtros));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [filtros]);

  const actualizar = (cambios: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...cambios }));

  const hoyStr = fechaLocalISO(new Date());
  const rango = useMemo<{ desde?: string; hasta?: string } | undefined>(() => {
    switch (periodo) {
      case 'semana': {
        const lunes = lunesDe(hoyStr);
        return { desde: lunes, hasta: sumarDias(lunes, 6) };
      }
      case 'mes':
        return { desde: inicioDeMes(hoyStr), hasta: finDeMes(hoyStr) };
      case 'rango':
        return { desde: desde || undefined, hasta: hasta || undefined };
      default:
        return undefined; // todo el ciclo
    }
  }, [periodo, desde, hasta, hoyStr]);

  const rangoInvalido = periodo === 'rango' && !!desde && !!hasta && hasta < desde;

  const enRiesgo = useMemo(() => {
    if (rangoInvalido) return [];
    return storageService
      .calcularAlertasEstudiantes(grupoSel === 'TODOS' ? undefined : grupoSel, rango)
      .filter((a) => a.tiene_alerta)
      .sort((a, b) => b.total_ausencias - a.total_ausencias || a.estudiante_nombre.localeCompare(b.estudiante_nombre));
    // sesiones y asistencias: recalcular cuando cambian los datos
  }, [grupoSel, rango, rangoInvalido, sesiones, asistencias]);

  const textoPeriodo =
    periodo === 'ciclo'
      ? 'Todo el ciclo'
      : rango?.desde || rango?.hasta
      ? `${rango?.desde ? fechaCorta(rango.desde) : 'Inicio'} – ${rango?.hasta ? fechaCorta(rango.hasta) : 'hoy'}`
      : 'Todo el ciclo';
  const descripcion =
    grupoSel === 'TODOS' ? textoPeriodo : `${textoPeriodo} · ${grupos.find((g) => g.id === grupoSel)?.nombre ?? ''}`;

  const inputClass =
    'text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] w-full';

  return (
    <div className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex flex-col">
      <div className="p-5 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">Monitoreo de Ausentismo</h2>
        </div>
        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
          {enRiesgo.length} {enRiesgo.length === 1 ? 'Caso' : 'Casos'}
        </span>
      </div>

      {/* Filtro de fechas */}
      <div className="px-4 pt-3 pb-3 border-b border-[#E7EAF0] dark:border-[#2B3442] space-y-2">
        <div
          className="flex gap-0.5 p-1 bg-[#F7F8FA] dark:bg-[#151A22] rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-[11px]"
          role="tablist"
          aria-label="Período del monitoreo"
        >
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={periodo === p.id}
              onClick={() => actualizar({ periodo: p.id })}
              className={`flex-1 px-2 py-1 rounded-md font-semibold transition cursor-pointer whitespace-nowrap ${
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
          className={inputClass}
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

        {periodo === 'rango' && (
          <div className="grid grid-cols-2 gap-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
            <label className="space-y-0.5">
              <span className="font-semibold">Desde</span>
              <input
                type="date"
                value={desde}
                max={hasta || undefined}
                onChange={(e) => actualizar({ desde: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="space-y-0.5">
              <span className="font-semibold">Hasta</span>
              <input
                type="date"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => actualizar({ hasta: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
          <span className="truncate" title="Solo cuentan las sesiones cerradas del período; los umbrales son los de Configuración.">
            {descripcion} · sesiones cerradas
          </span>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => setFiltros(FILTROS_INICIALES)}
              className="shrink-0 flex items-center gap-0.5 font-semibold hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer"
            >
              <X className="w-3 h-3" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto max-h-[520px] space-y-3">
        {rangoInvalido ? (
          <p className="py-8 text-center text-xs font-semibold text-rose-600 dark:text-rose-400">
            La fecha "Hasta" debe ser igual o posterior a "Desde".
          </p>
        ) : enRiesgo.length === 0 ? (
          <div className="py-10 text-center text-[#667085] dark:text-[#94A3B8]">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-xs font-semibold">Sin alertas de ausentismo</p>
            <p className="text-[11px] text-slate-400 mt-1">
              {!hayFiltros
                ? 'Todos los alumnos mantienen asistencia regular.'
                : 'Ningún alumno supera los umbrales con estos filtros.'}
            </p>
          </div>
        ) : (
          enRiesgo.map((item) => (
            <div
              key={`${item.estudiante_id}-${item.grupo_id}`}
              className={`p-3 rounded-lg border space-y-2 text-xs ${
                item.nivel_alerta === 'CRITICA'
                  ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20'
                  : 'border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-bold text-[#172033] dark:text-[#F1F5F9] block truncate">{item.estudiante_nombre}</span>
                  <span className="text-[11px] text-[#667085] dark:text-[#94A3B8]">{item.grupo_nombre}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-900 whitespace-nowrap">
                    {item.total_ausencias} {item.total_ausencias === 1 ? 'inasistencia' : 'inasistencias'}
                  </span>
                  <div className="mt-1 text-[10px] text-[#667085] dark:text-[#94A3B8] tabular-nums">
                    {item.porcentaje_inasistencia}% de {item.sesiones_cerradas} ses.
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#667085] dark:text-[#94A3B8] border-t border-amber-200/60 dark:border-amber-900/40 pt-2 flex items-center justify-between gap-2">
                <span className="truncate">Tutor: {item.tutor_nombre || 'N/A'}</span>
                <button
                  onClick={onVerEstudiantes}
                  className="text-[#4F46E5] dark:text-[#818CF8] hover:underline font-semibold text-[11px] flex items-center space-x-1 shrink-0 cursor-pointer"
                >
                  <Users className="w-3 h-3" />
                  <span>Ver ficha</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-center">
        <button
          onClick={onVerEstudiantes}
          className="text-xs font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:underline cursor-pointer"
        >
          Consultar directorio de estudiantes & tutores
        </button>
      </div>
    </div>
  );
};

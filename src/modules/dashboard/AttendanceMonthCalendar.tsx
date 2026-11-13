import React, { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, Clock, UserX } from 'lucide-react';
import {
  DIAS_SEMANA,
  EncabezadoTablaSesiones,
  FilaEstatus,
  FilaSesion,
  diaDelMes,
  finDeMes,
  formatearFecha,
  lunesDe,
  ordenarPorFechaHora,
  sumarDias,
} from './attendanceStatus.shared';

interface AttendanceMonthCalendarProps {
  /** Sesiones del mes, ya filtradas por docente, estado y búsqueda */
  filas: FilaEstatus[];
  /** Primer día del mes mostrado (YYYY-MM-01) */
  mesInicio: string;
  hoyStr: string;
  onPasarLista: (grupoId: string, sesionId: string) => void;
}

interface ConteoDia {
  con: number;
  parcial: number;
  pendiente: number;
  programada: number;
  total: number;
}

const CONTADORES = [
  { key: 'con', label: 'Con asistencia', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  { key: 'parcial', label: 'Parciales', icon: CircleDashed, color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  { key: 'pendiente', label: 'Pendientes', icon: UserX, color: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  { key: 'programada', label: 'Programadas', icon: Clock, color: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400' },
] as const;

export const AttendanceMonthCalendar: React.FC<AttendanceMonthCalendarProps> = ({
  filas,
  mesInicio,
  hoyStr,
  onPasarLista,
}) => {
  const mesFin = finDeMes(mesInicio);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(
    hoyStr >= mesInicio && hoyStr <= mesFin ? hoyStr : null
  );

  // Semanas completas (lunes a domingo) que cubren el mes
  const semanas = useMemo(() => {
    const out: string[][] = [];
    let cursor = lunesDe(mesInicio);
    while (cursor <= mesFin) {
      out.push(Array.from({ length: 7 }, (_, i) => sumarDias(cursor, i)));
      cursor = sumarDias(cursor, 7);
    }
    return out;
  }, [mesInicio, mesFin]);

  const conteos = useMemo(() => {
    const m = new Map<string, ConteoDia>();
    filas.forEach((f) => {
      const c = m.get(f.sesion.fecha) ?? { con: 0, parcial: 0, pendiente: 0, programada: 0, total: 0 };
      c.total += 1;
      if (f.estado === 'CERRADA' || f.estado === 'TOMADA') c.con += 1;
      else if (f.estado === 'PARCIAL') c.parcial += 1;
      else if (f.estado === 'PENDIENTE') c.pendiente += 1;
      else if (f.estado === 'PROGRAMADA') c.programada += 1;
      m.set(f.sesion.fecha, c);
    });
    return m;
  }, [filas]);

  const filasDelDia = useMemo(
    () => (diaSeleccionado ? filas.filter((f) => f.sesion.fecha === diaSeleccionado).sort(ordenarPorFechaHora) : []),
    [filas, diaSeleccionado]
  );

  return (
    <div>
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] mb-1">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {semanas.flat().map((fecha) => {
            const enMes = fecha >= mesInicio && fecha <= mesFin;
            const c = conteos.get(fecha);
            const atrasado = !!c && c.pendiente + c.parcial > 0;
            const completo = !!c && c.con > 0 && c.con + c.parcial + c.pendiente + c.programada === c.con;
            const seleccionado = fecha === diaSeleccionado;
            const esHoy = fecha === hoyStr;

            if (!enMes) {
              return <div key={fecha} className="min-h-[52px] sm:min-h-[84px] rounded-lg opacity-0" aria-hidden />;
            }

            const fondo = atrasado
              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900'
              : completo
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
              : 'bg-[#F7F8FA] dark:bg-[#151A22] border-[#E7EAF0] dark:border-[#2B3442]';

            return (
              <button
                key={fecha}
                type="button"
                onClick={() => setDiaSeleccionado(seleccionado ? null : fecha)}
                className={`min-h-[52px] sm:min-h-[84px] p-1 sm:p-1.5 rounded-lg border text-left flex flex-col gap-1 transition cursor-pointer hover:border-[#4F46E5]/50 ${fondo} ${
                  seleccionado ? 'ring-2 ring-[#4F46E5] dark:ring-[#818CF8]' : ''
                }`}
                title={c ? `${formatearFecha(fecha)}: ${c.total} ${c.total === 1 ? 'sesión' : 'sesiones'}` : formatearFecha(fecha)}
              >
                <span
                  className={`text-[11px] font-bold font-mono leading-none ${
                    esHoy
                      ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#4F46E5] text-white'
                      : 'text-[#172033] dark:text-[#F1F5F9]'
                  }`}
                >
                  {diaDelMes(fecha)}
                </span>
                {c && (
                  <>
                    {/* Escritorio: contadores con ícono */}
                    <div className="hidden sm:flex flex-col gap-0.5 text-[10px] font-semibold tabular-nums">
                      {CONTADORES.map(({ key, label, icon: Icon, color }) =>
                        c[key] > 0 ? (
                          <span key={key} className={`flex items-center gap-1 ${color}`} title={label}>
                            <Icon className="w-3 h-3" />
                            {c[key]}
                          </span>
                        ) : null
                      )}
                    </div>
                    {/* Móvil: solo puntos de color */}
                    <div className="flex sm:hidden flex-wrap gap-0.5">
                      {CONTADORES.map(({ key, dot }) =>
                        c[key] > 0 ? <span key={key} className={`w-1.5 h-1.5 rounded-full ${dot}`} /> : null
                      )}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Leyenda */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#667085] dark:text-[#94A3B8]">
          {CONTADORES.map(({ key, label, icon: Icon, color }) => (
            <span key={key} className={`flex items-center gap-1 ${color}`}>
              <Icon className="w-3 h-3" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Detalle del día seleccionado */}
      {diaSeleccionado && (
        <div className="border-t border-[#E7EAF0] dark:border-[#2B3442]">
          <div className="px-4 py-2.5 text-xs font-bold text-[#172033] dark:text-[#F1F5F9] capitalize">
            {diaSeleccionado === hoyStr ? 'Hoy' : formatearFecha(diaSeleccionado)} ·{' '}
            <span className="font-normal normal-case text-[#667085] dark:text-[#94A3B8]">
              {filasDelDia.length} {filasDelDia.length === 1 ? 'sesión' : 'sesiones'}
            </span>
          </div>
          {filasDelDia.length === 0 ? (
            <p className="pb-6 px-4 text-center text-xs text-[#667085] dark:text-[#94A3B8]">
              No hay sesiones este día con los filtros actuales.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <EncabezadoTablaSesiones />
                <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
                  {filasDelDia.map((f) => (
                    <FilaSesion key={f.sesion.id} fila={f} hoyStr={hoyStr} onPasarLista={onPasarLista} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

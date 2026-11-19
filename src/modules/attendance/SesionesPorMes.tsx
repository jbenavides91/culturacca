import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react';
import { Sesion } from '../../types/attendance';
import { storageService } from '../../services/storage.service';
import { agruparPorMes, estadoSesion, formatSessionDate, sesionPorDefecto } from './sesiones.shared';

interface SesionesPorMesProps {
  sesiones: Sesion[];
  selectedSesionId: string;
  onSelect: (sesionId: string) => void;
  /** Abre el calendario completo de clases */
  onVerTodas: () => void;
  /** % de asistencia de una sesión (null si no tiene registros) */
  tasaAsistencia?: (sesionId: string) => number | null;
}

/**
 * Navegador de sesiones de un taller agrupado por mes: muestra solo las clases del mes
 * visible (siempre caben) y una barra del ciclo con un segmento por mes.
 */
export const SesionesPorMes: React.FC<SesionesPorMesProps> = ({
  sesiones,
  selectedSesionId,
  onSelect,
  onVerTodas,
  tasaAsistencia,
}) => {
  const meses = useMemo(() => agruparPorMes(sesiones), [sesiones]);
  const sesionElegida = sesiones.find((s) => s.id === selectedSesionId);
  const mesElegido = sesionElegida?.fecha.slice(0, 7) ?? meses[0]?.mes ?? '';

  const [mesVisible, setMesVisible] = useState(mesElegido);
  // El mes visible sigue a la sesión elegida (stepper, popover, botón Hoy)
  useEffect(() => {
    setMesVisible(mesElegido);
  }, [mesElegido]);

  if (sesiones.length === 0) return null;

  const indiceMes = Math.max(
    0,
    meses.findIndex((m) => m.mes === mesVisible)
  );
  const mes = meses[indiceMes];
  const indiceSesion = sesiones.findIndex((s) => s.id === selectedSesionId);
  const totalCerradas = meses.reduce((n, m) => n + m.cerradas, 0);
  const totalPendientes = meses.reduce((n, m) => n + m.pendientes, 0);

  const irAHoy = () => {
    const s = sesionPorDefecto(sesiones);
    if (s) onSelect(s.id);
  };

  const botonFlecha =
    'p-2 sm:p-1.5 rounded-lg text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B222D] disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer';

  return (
    <div className="space-y-2.5 sm:space-y-3 sm:pt-1">
      {/* Cabecera: mes visible, Hoy y resumen del ciclo */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMesVisible(meses[indiceMes - 1].mes)}
            disabled={indiceMes <= 0}
            className={botonFlecha}
            title="Mes anterior"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-28 text-center text-xs sm:text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
            {mes.etiqueta}
          </span>
          <button
            type="button"
            onClick={() => setMesVisible(meses[indiceMes + 1].mes)}
            disabled={indiceMes >= meses.length - 1}
            className={botonFlecha}
            title="Mes siguiente"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={irAHoy}
            className="ml-1 px-2.5 py-1.5 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-[11px] font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-1 cursor-pointer"
            title="Ir a la clase de hoy (o a la pendiente más reciente)"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            Hoy
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3 text-[11px] text-[#667085] dark:text-[#94A3B8]">
          <span className="tabular-nums">
            <span className="hidden sm:inline">Sesión </span>
            {indiceSesion + 1} de {sesiones.length}
            <span className="hidden sm:inline"> · {totalCerradas} cerradas</span>
            {totalPendientes > 0 && (
              <span className="text-amber-700 dark:text-amber-400"> · {totalPendientes} pendientes</span>
            )}
          </span>
          <button
            type="button"
            onClick={onVerTodas}
            className="text-[#4F46E5] dark:text-[#818CF8] hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
          >
            <span className="hidden sm:inline">Ver todas las fechas</span>
            <span className="sm:hidden">Todas</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Clases del mes visible */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Clases de ${mes.etiqueta}`}>
        {mes.sesiones.map((s) => {
          const elegida = s.id === selectedSesionId;
          const { estado, texto } = estadoSesion(s);
          const f = formatSessionDate(s.fecha);
          const noLectivo = !s.extraordinaria && storageService.esDiaNoLectivo(s.fecha);
          const tasa = tasaAsistencia?.(s.id) ?? null;
          const numero = sesiones.indexOf(s) + 1;

          const estilo = elegida
            ? 'bg-[#4F46E5] border-[#4F46E5] text-white shadow-sm ring-2 ring-indigo-500/25'
            : estado === 'CERRADA'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:border-emerald-400'
            : estado === 'PENDIENTE'
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:border-amber-500'
            : estado === 'HOY'
            ? 'bg-white dark:bg-[#1B222D] border-emerald-500 ring-2 ring-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            : 'bg-white dark:bg-[#1B222D] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-400';

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={elegida}
              title={`Clase ${numero}: ${f.fullDate} · ${texto}${tasa !== null ? ` · ${tasa}% asistió` : ''}${
                s.extraordinaria ? ' · Sesión extraordinaria' : ''
              }${noLectivo ? ' · Día no lectivo' : ''}`}
              className={`relative min-w-11 h-11 px-1.5 rounded-xl border flex flex-col items-center justify-center leading-none transition cursor-pointer ${estilo}`}
            >
              <span className={`text-[9px] font-medium uppercase ${elegida ? 'text-indigo-100' : 'opacity-70'}`}>
                {f.dayShort}
              </span>
              <span className="text-sm font-bold tabular-nums mt-0.5 flex items-center gap-0.5">
                {f.dayNum}
                {estado === 'CERRADA' && !elegida && <Check className="w-3 h-3 stroke-[3]" />}
              </span>
              {(s.extraordinaria || noLectivo) && (
                <span
                  className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                    s.extraordinaria ? 'bg-violet-500' : 'bg-rose-500'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Barra del ciclo: un segmento por mes */}
      <div className="hidden sm:flex gap-1" role="group" aria-label="Meses del ciclo">
        {meses.map((m) => {
          const visible = m.mes === mes.mes;
          const total = m.sesiones.length;
          const pct = (n: number) => `${(n / total) * 100}%`;
          return (
            <button
              key={m.mes}
              type="button"
              onClick={() => setMesVisible(m.mes)}
              aria-pressed={visible}
              title={`${m.etiqueta}: ${total} clases · ${m.cerradas} cerradas · ${m.pendientes} pendientes · ${m.programadas} programadas`}
              className={`flex-1 min-w-0 px-1 pt-1 pb-1.5 rounded-lg transition cursor-pointer ${
                visible ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-[#1B222D]'
              }`}
            >
              <span
                className={`block text-[10px] truncate ${
                  visible ? 'font-bold text-[#4F46E5] dark:text-[#818CF8]' : 'text-[#667085] dark:text-[#94A3B8]'
                }`}
              >
                {m.etiquetaCorta}
              </span>
              <span className="mt-1 flex h-1.5 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                <span className="h-full bg-emerald-500" style={{ width: pct(m.cerradas) }} />
                <span className="h-full bg-amber-400" style={{ width: pct(m.pendientes) }} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#667085] dark:text-[#94A3B8]">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300 dark:bg-emerald-950 dark:border-emerald-700" />
          Cerrada
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300 dark:bg-amber-950 dark:border-amber-700" />
          Pendiente de cerrar
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border-2 border-emerald-500" />
          Hoy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border border-slate-300 dark:border-slate-600" />
          Programada
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
          Extra
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          No lectivo
        </span>
      </div>
    </div>
  );
};

import React, { useMemo } from 'react';
import {
  BadgeExtra,
  DIAS_SEMANA,
  ESTADOS,
  FilaEstatus,
  diaDelMes,
  puedePasarLista,
  sumarDias,
} from './attendanceStatus.shared';

interface AttendanceWeekGridProps {
  /** Sesiones de la semana, ya filtradas por docente, estado y búsqueda */
  filas: FilaEstatus[];
  /** Lunes de la semana mostrada (YYYY-MM-DD) */
  semanaInicio: string;
  hoyStr: string;
  onPasarLista: (grupoId: string, sesionId: string) => void;
}

const FichaSesion: React.FC<{ fila: FilaEstatus; onPasarLista: AttendanceWeekGridProps['onPasarLista'] }> = ({
  fila: f,
  onPasarLista,
}) => {
  const est = ESTADOS[f.estado];
  const accionable = puedePasarLista(f.estado);
  const detalle =
    `${f.grupo.nombre} · ${est.label}\n${f.sesion.hora_inicio} - ${f.sesion.hora_fin}` +
    (f.inscritos > 0 ? `\nLista: ${f.marcados}/${f.inscritos}` : '') +
    (accionable ? `\nClic para ${f.estado === 'TOMADA' ? 'cerrar la sesión' : 'pasar lista'}` : '');

  const contenido = (
    <>
      <span className="flex items-center gap-1 font-bold">
        {est.icon}
        <span className="font-mono">{f.sesion.hora_inicio}</span>
      </span>
      <span className="flex items-center gap-1">
        {f.inscritos > 0 && <span className="font-mono tabular-nums opacity-80">{f.marcados}/{f.inscritos}</span>}
        {f.sesion.extraordinaria && <BadgeExtra />}
      </span>
    </>
  );

  const clase = `w-full flex flex-col items-start gap-0.5 px-1.5 py-1 rounded-md border text-[10px] leading-tight ${est.className}`;

  return accionable ? (
    <button
      type="button"
      title={detalle}
      onClick={() => onPasarLista(f.grupo.id, f.sesion.id)}
      className={`${clase} cursor-pointer hover:ring-2 hover:ring-[#4F46E5]/50 transition`}
    >
      {contenido}
    </button>
  ) : (
    <div title={detalle} className={clase}>
      {contenido}
    </div>
  );
};

export const AttendanceWeekGrid: React.FC<AttendanceWeekGridProps> = ({ filas, semanaInicio, hoyStr, onPasarLista }) => {
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(semanaInicio, i)), [semanaInicio]);

  // Sábado y domingo solo se muestran si tienen sesiones
  const diasVisibles = useMemo(() => {
    const conSesion = new Set(filas.map((f) => f.sesion.fecha));
    return dias.map((fecha, i) => ({ fecha, i })).filter(({ fecha, i }) => i < 5 || conSesion.has(fecha));
  }, [dias, filas]);

  // Un renglón por taller, con sus sesiones agrupadas por fecha
  const talleres = useMemo(() => {
    const porGrupo = new Map<string, { fila: FilaEstatus; porFecha: Map<string, FilaEstatus[]> }>();
    filas.forEach((f) => {
      if (!porGrupo.has(f.grupo.id)) porGrupo.set(f.grupo.id, { fila: f, porFecha: new Map() });
      const { porFecha } = porGrupo.get(f.grupo.id)!;
      if (!porFecha.has(f.sesion.fecha)) porFecha.set(f.sesion.fecha, []);
      porFecha.get(f.sesion.fecha)!.push(f);
    });
    porGrupo.forEach(({ porFecha }) =>
      porFecha.forEach((lista) => lista.sort((a, b) => a.sesion.hora_inicio.localeCompare(b.sesion.hora_inicio)))
    );
    return Array.from(porGrupo.values()).sort((a, b) => a.fila.grupo.nombre.localeCompare(b.fila.grupo.nombre));
  }, [filas]);

  // Totales por día
  const totales = useMemo(() => {
    const t = new Map<string, { con: number; sin: number }>();
    filas.forEach((f) => {
      const x = t.get(f.sesion.fecha) ?? { con: 0, sin: 0 };
      if (f.estado === 'CERRADA' || f.estado === 'TOMADA') x.con += 1;
      else if (f.estado === 'PENDIENTE' || f.estado === 'PARCIAL') x.sin += 1;
      t.set(f.sesion.fecha, x);
    });
    return t;
  }, [filas]);

  if (talleres.length === 0) {
    return (
      <p className="py-8 px-4 text-center text-xs text-[#667085] dark:text-[#94A3B8]">
        No hay sesiones en esta semana con los filtros actuales.
      </p>
    );
  }

  const celdaHoy = 'bg-[#EEF2FF]/60 dark:bg-[#1E1B4B]/40';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-[#F7F8FA] dark:bg-[#151A22] text-[#667085] dark:text-[#94A3B8] font-semibold border-b border-[#E7EAF0] dark:border-[#2B3442]">
          <tr>
            <th className="sticky left-0 z-10 bg-[#F7F8FA] dark:bg-[#151A22] py-2.5 px-3 min-w-[150px] sm:min-w-[200px]">
              Taller ({talleres.length})
            </th>
            {diasVisibles.map(({ fecha, i }) => (
              <th
                key={fecha}
                className={`py-2.5 px-1.5 text-center min-w-[78px] ${
                  fecha === hoyStr ? 'text-[#4F46E5] dark:text-[#818CF8] ' + celdaHoy : ''
                }`}
              >
                <div>{DIAS_SEMANA[i]}</div>
                <div className="font-mono text-[11px] font-normal">{diaDelMes(fecha)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
          {talleres.map(({ fila, porFecha }) => (
            <tr key={fila.grupo.id} className="hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70 transition-colors">
              <td className="sticky left-0 z-10 bg-white dark:bg-[#1B222D] py-2 px-3 align-top">
                <div className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate max-w-[180px] sm:max-w-[240px]" title={fila.grupo.nombre}>
                  {fila.grupo.nombre}
                </div>
                <div className="text-[10px] text-[#667085] dark:text-[#94A3B8] truncate max-w-[180px] sm:max-w-[240px]">
                  {fila.docente} · {fila.grupo.aula || 'Taller Principal'}
                </div>
              </td>
              {diasVisibles.map(({ fecha }) => {
                const sesiones = porFecha.get(fecha) ?? [];
                return (
                  <td key={fecha} className={`py-1.5 px-1 align-top ${fecha === hoyStr ? celdaHoy : ''}`}>
                    {sesiones.length === 0 ? (
                      <div className="text-center text-slate-300 dark:text-slate-700 select-none">·</div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {sesiones.map((s) => (
                          <FichaSesion key={s.sesion.id} fila={s} onPasarLista={onPasarLista} />
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-[#F7F8FA] dark:bg-[#151A22] border-t border-[#E7EAF0] dark:border-[#2B3442] text-[10px] text-[#667085] dark:text-[#94A3B8]">
          <tr>
            <td className="sticky left-0 z-10 bg-[#F7F8FA] dark:bg-[#151A22] py-2 px-3 font-bold uppercase tracking-wider">
              Totales del día
            </td>
            {diasVisibles.map(({ fecha }) => {
              const t = totales.get(fecha);
              return (
                <td key={fecha} className="py-2 px-1 text-center font-mono tabular-nums">
                  {t ? (
                    <div className="flex flex-col items-center">
                      <span className="text-emerald-600 dark:text-emerald-400" title="Con asistencia">
                        ✓ {t.con}
                      </span>
                      {t.sin > 0 && (
                        <span className="text-rose-600 dark:text-rose-400 font-bold" title="Pendientes o parciales">
                          ✕ {t.sin}
                        </span>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

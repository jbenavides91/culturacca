import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Clock, UserX } from 'lucide-react';
import {
  BadgeExtra,
  ESTADOS,
  FilaEstatus,
  formatearFecha,
  ordenarPorFechaHora,
  puedePasarLista,
} from './attendanceStatus.shared';

interface AttendanceWorkshopListProps {
  /** Sesiones del período, ya filtradas por docente, estado y búsqueda */
  filas: FilaEstatus[];
  hoyStr: string;
  onPasarLista: (grupoId: string, sesionId: string) => void;
}

interface ResumenTaller {
  fila: FilaEstatus; // cualquier sesión del taller, para leer grupo y docente
  sesiones: FilaEstatus[]; // más recientes primero
  con: number;
  parcial: number;
  pendiente: number;
  programada: number;
  cumplimiento: number | null;
  siguienteAccion: FilaEstatus | null;
}

const CONTADORES = [
  { key: 'con', label: 'Con asistencia', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', movil: true },
  { key: 'parcial', label: 'Parciales', icon: CircleDashed, color: 'text-amber-600 dark:text-amber-400', movil: false },
  { key: 'pendiente', label: 'Pendientes', icon: UserX, color: 'text-rose-600 dark:text-rose-400', movil: true },
  { key: 'programada', label: 'Programadas', icon: Clock, color: 'text-slate-500 dark:text-slate-400', movil: false },
] as const;

const fechaCorta = (iso: string, hoyStr: string) => {
  if (iso === hoyStr) return 'hoy';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

const colorCumplimiento = (pct: number) => (pct >= 90 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500');

export const AttendanceWorkshopList: React.FC<AttendanceWorkshopListProps> = ({ filas, hoyStr, onPasarLista }) => {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const talleres = useMemo<ResumenTaller[]>(() => {
    const porGrupo = new Map<string, FilaEstatus[]>();
    filas.forEach((f) => {
      if (!porGrupo.has(f.grupo.id)) porGrupo.set(f.grupo.id, []);
      porGrupo.get(f.grupo.id)!.push(f);
    });

    const lista = Array.from(porGrupo.values()).map((sesiones): ResumenTaller => {
      const cuenta = (pred: (f: FilaEstatus) => boolean) => sesiones.filter(pred).length;
      const con = cuenta((f) => f.estado === 'CERRADA' || f.estado === 'TOMADA');
      const parcial = cuenta((f) => f.estado === 'PARCIAL');
      const pendiente = cuenta((f) => f.estado === 'PENDIENTE');
      const programada = cuenta((f) => f.estado === 'PROGRAMADA');
      const evaluables = con + parcial + pendiente;

      const ascendente = [...sesiones].sort(ordenarPorFechaHora);
      const siguienteAccion =
        ascendente.find((f) => f.estado === 'PENDIENTE' || f.estado === 'PARCIAL') ??
        ascendente.find((f) => f.estado === 'TOMADA') ??
        null;

      return {
        fila: sesiones[0],
        sesiones: ascendente.reverse(),
        con,
        parcial,
        pendiente,
        programada,
        cumplimiento: evaluables > 0 ? Math.round((con / evaluables) * 100) : null,
        siguienteAccion,
      };
    });

    // Más atrasados primero; los que solo tienen clases programadas, al final
    return lista.sort((a, b) => {
      const atrasoA = a.pendiente + a.parcial;
      const atrasoB = b.pendiente + b.parcial;
      if (atrasoA !== atrasoB) return atrasoB - atrasoA;
      const cumpA = a.cumplimiento ?? 101;
      const cumpB = b.cumplimiento ?? 101;
      if (cumpA !== cumpB) return cumpA - cumpB;
      return a.fila.grupo.nombre.localeCompare(b.fila.grupo.nombre);
    });
  }, [filas]);

  const alternar = (id: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const todosAbiertos = talleres.length > 0 && talleres.every((t) => abiertos.has(t.fila.grupo.id));

  const botonAccion = (f: FilaEstatus, conFecha: boolean) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPasarLista(f.grupo.id, f.sesion.id);
      }}
      className="px-2.5 py-1 text-xs font-semibold rounded bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8] hover:bg-[#E0E7FF] dark:hover:bg-indigo-950 transition-colors whitespace-nowrap cursor-pointer"
    >
      {f.estado === 'TOMADA' ? 'Cerrar sesión' : 'Pasar lista'}
      {conFecha && <span className="font-normal"> · {fechaCorta(f.sesion.fecha, hoyStr)}</span>}
    </button>
  );

  if (talleres.length === 0) {
    return (
      <p className="py-5 sm:py-8 px-4 text-center text-xs text-[#667085] dark:text-[#94A3B8]">
        Ninguna sesión coincide con los filtros.
      </p>
    );
  }

  return (
    <div>
      {/* Encabezado de columnas */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#F7F8FA] dark:bg-[#151A22] border-b border-[#E7EAF0] dark:border-[#2B3442] text-xs font-semibold text-[#667085] dark:text-[#94A3B8]">
        <button
          type="button"
          onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(talleres.map((t) => t.fila.grupo.id)))}
          className="w-4 shrink-0 cursor-pointer hover:text-[#4F46E5]"
          title={todosAbiertos ? 'Contraer todo' : 'Expandir todo'}
          aria-label={todosAbiertos ? 'Contraer todo' : 'Expandir todo'}
        >
          {todosAbiertos ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className="flex-1 min-w-0">Taller</span>
        <span className="hidden md:block w-40 shrink-0">Docente</span>
        <span className="w-20 sm:w-28 shrink-0">Cumplimiento</span>
        <span className="hidden sm:block w-32 shrink-0">Sesiones</span>
        <span className="w-[120px] sm:w-[150px] shrink-0 text-right">Acción</span>
      </div>

      <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
        {talleres.map((t) => {
          const id = t.fila.grupo.id;
          const abierto = abiertos.has(id);
          const atrasado = t.pendiente + t.parcial > 0;
          return (
            <li key={id} className={`border-l-[3px] ${atrasado ? 'border-l-rose-400 dark:border-l-rose-700' : 'border-l-transparent'}`}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={abierto}
                onClick={() => alternar(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    alternar(id);
                  }
                }}
                className="flex items-center gap-3 px-4 py-2.5 text-xs cursor-pointer hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70 transition-colors"
              >
                <span className="w-4 shrink-0 text-[#667085] dark:text-[#94A3B8]">
                  {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">{t.fila.grupo.nombre}</div>
                  <div className="text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">
                    <span className="md:hidden">{t.fila.docente} · </span>
                    {t.fila.grupo.aula || 'Taller Principal'}
                  </div>
                  {/* Móvil: contadores bajo el nombre */}
                  <div className="flex sm:hidden gap-2 mt-0.5 text-[10px] font-semibold tabular-nums">
                    {CONTADORES.filter((c) => c.movil && t[c.key] > 0).map(({ key, label, icon: Icon, color }) => (
                      <span key={key} className={`flex items-center gap-0.5 ${color}`} title={label}>
                        <Icon className="w-3 h-3" />
                        {t[key]}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="hidden md:block w-40 shrink-0 truncate text-[#172033] dark:text-[#F1F5F9]">{t.fila.docente}</div>

                <div className="w-20 sm:w-28 shrink-0">
                  {t.cumplimiento === null ? (
                    <span className="text-[11px] text-slate-400">—</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${colorCumplimiento(t.cumplimiento)}`}
                          style={{ width: `${t.cumplimiento}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-[#667085] dark:text-[#94A3B8] w-8 text-right">
                        {t.cumplimiento}%
                      </span>
                    </div>
                  )}
                </div>

                <div className="hidden sm:flex w-32 shrink-0 gap-2.5 text-[11px] font-semibold tabular-nums">
                  {CONTADORES.filter((c) => t[c.key] > 0).map(({ key, label, icon: Icon, color }) => (
                    <span key={key} className={`flex items-center gap-0.5 ${color}`} title={label}>
                      <Icon className="w-3 h-3" />
                      {t[key]}
                    </span>
                  ))}
                </div>

                <div className="w-[120px] sm:w-[150px] shrink-0 text-right">
                  {t.siguienteAccion && botonAccion(t.siguienteAccion, true)}
                </div>
              </div>

              {/* Sesiones del taller */}
              {abierto && (
                <ul className="bg-[#F7F8FA]/60 dark:bg-[#151A22]/60 border-t border-[#E7EAF0] dark:border-[#2B3442] divide-y divide-[#E7EAF0]/70 dark:divide-[#2B3442]/70">
                  {t.sesiones.map((f) => {
                    const est = ESTADOS[f.estado];
                    return (
                      <li key={f.sesion.id} className="flex items-center gap-3 pl-11 pr-4 py-1.5 text-xs">
                        <span className="w-24 sm:w-32 shrink-0 font-semibold capitalize text-[#172033] dark:text-[#F1F5F9]">
                          {f.sesion.fecha === hoyStr ? 'Hoy' : formatearFecha(f.sesion.fecha)}
                        </span>
                        <span className="hidden sm:block w-24 shrink-0 font-mono text-[11px] text-[#667085] dark:text-[#94A3B8]">
                          {f.sesion.hora_inicio} - {f.sesion.hora_fin}
                        </span>
                        <span className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${est.className}`}
                          >
                            {est.icon}
                            {est.label}
                          </span>
                          {f.sesion.extraordinaria && <BadgeExtra />}
                          {f.inscritos > 0 && (
                            <span className="font-mono text-[11px] tabular-nums text-[#667085] dark:text-[#94A3B8]">
                              {f.marcados}/{f.inscritos}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0">{puedePasarLista(f.estado) && botonAccion(f, false)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

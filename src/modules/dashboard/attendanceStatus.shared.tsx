import React from 'react';
import { CheckCircle2, CircleDashed, Clock, Lock, UserX } from 'lucide-react';
import { Grupo, Sesion } from '../../types/attendance';

export type EstadoToma = 'CERRADA' | 'TOMADA' | 'PARCIAL' | 'PENDIENTE' | 'PROGRAMADA' | 'SIN_ALUMNOS';

export interface FilaEstatus {
  sesion: Sesion;
  grupo: Grupo;
  docente: string;
  inscritos: number;
  marcados: number;
  estado: EstadoToma;
}

export const ESTADOS: Record<EstadoToma, { label: string; className: string; icon: React.ReactNode }> = {
  CERRADA: {
    label: 'Cerrada',
    className:
      'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    icon: <Lock className="w-3 h-3" />,
  },
  TOMADA: {
    label: 'Tomada (sin cerrar)',
    className: 'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-800',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  PARCIAL: {
    label: 'Parcial',
    className: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    icon: <CircleDashed className="w-3 h-3" />,
  },
  PENDIENTE: {
    label: 'Pendiente',
    className: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    icon: <UserX className="w-3 h-3" />,
  },
  PROGRAMADA: {
    label: 'Programada',
    className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    icon: <Clock className="w-3 h-3" />,
  },
  SIN_ALUMNOS: {
    label: 'Sin alumnos',
    className: 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    icon: <CircleDashed className="w-3 h-3" />,
  },
};

/** Estados en los que el panel ofrece abrir Toma de Asistencia */
export const puedePasarLista = (e: EstadoToma) => e === 'PENDIENTE' || e === 'PARCIAL' || e === 'TOMADA';

export const formatearFecha = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
};

export const BadgeExtra: React.FC = () => (
  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
    Extra
  </span>
);

export const ordenarPorFechaHora = (a: FilaEstatus, b: FilaEstatus) =>
  a.sesion.fecha === b.sesion.fecha
    ? a.sesion.hora_inicio.localeCompare(b.sesion.hora_inicio)
    : a.sesion.fecha.localeCompare(b.sesion.fecha);

// ---------------------------------------------------------------------------
// Aritmética de fechas sobre strings YYYY-MM-DD, siempre en UTC para que la
// zona horaria local (UTC-6) no corra los días.
// ---------------------------------------------------------------------------

const aUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const deUTC = (d: Date) => d.toISOString().slice(0, 10);

export const sumarDias = (iso: string, n: number) => {
  const d = aUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return deUTC(d);
};

/** Lunes de la semana que contiene la fecha */
export const lunesDe = (iso: string) => {
  const dia = aUTC(iso).getUTCDay();
  return sumarDias(iso, -((dia === 0 ? 7 : dia) - 1));
};

export const inicioDeMes = (iso: string) => `${iso.slice(0, 7)}-01`;

export const finDeMes = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return deUTC(new Date(Date.UTC(y, m, 0)));
};

export const sumarMeses = (iso: string, n: number) => {
  const [y, m] = iso.split('-').map(Number);
  return deUTC(new Date(Date.UTC(y, m - 1 + n, 1)));
};

export const diaDelMes = (iso: string) => Number(iso.slice(8, 10));

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ---------------------------------------------------------------------------
// Fila de la tabla de sesiones (vista Lista y detalle del día en vista Mes)
// ---------------------------------------------------------------------------

export const EncabezadoTablaSesiones: React.FC = () => (
  <thead className="bg-[#F7F8FA] dark:bg-[#151A22] text-[#667085] dark:text-[#94A3B8] font-semibold border-b border-[#E7EAF0] dark:border-[#2B3442]">
    <tr>
      <th className="py-3 px-4">Fecha & Horario</th>
      <th className="py-3 px-4">Taller</th>
      <th className="py-3 px-4">Docente</th>
      <th className="py-3 px-4">Lista</th>
      <th className="py-3 px-4">Estado</th>
      <th className="py-3 px-4 text-right">Acción</th>
    </tr>
  </thead>
);

interface FilaSesionProps {
  fila: FilaEstatus;
  hoyStr: string;
  onPasarLista: (grupoId: string, sesionId: string) => void;
}

export const FilaSesion: React.FC<FilaSesionProps> = ({ fila: f, hoyStr, onPasarLista }) => {
  const pct = f.inscritos > 0 ? Math.round((f.marcados / f.inscritos) * 100) : 0;
  const est = ESTADOS[f.estado];
  return (
    <tr className="hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70 transition-colors">
      <td className="py-3 px-4 whitespace-nowrap">
        <div className="font-semibold text-[#172033] dark:text-[#F1F5F9] capitalize">
          {f.sesion.fecha === hoyStr ? 'Hoy' : formatearFecha(f.sesion.fecha)}
        </div>
        <div className="font-mono text-[11px] text-[#667085] dark:text-[#94A3B8]">
          {f.sesion.hora_inicio} - {f.sesion.hora_fin}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="font-semibold text-[#172033] dark:text-[#F1F5F9] flex items-center gap-1.5">
          {f.grupo.nombre}
          {f.sesion.extraordinaria && <BadgeExtra />}
        </div>
        <div className="text-[11px] text-[#667085] dark:text-[#94A3B8]">{f.grupo.aula || 'Taller Principal'}</div>
      </td>
      <td className="py-3 px-4 text-[#172033] dark:text-[#F1F5F9]">{f.docente}</td>
      <td className="py-3 px-4">
        {f.inscritos === 0 ? (
          <span className="text-[11px] text-slate-400">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-16 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full ${
                  pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-[#667085] dark:text-[#94A3B8]">
              {f.marcados}/{f.inscritos}
            </span>
          </div>
        )}
      </td>
      <td className="py-3 px-4">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${est.className}`}
        >
          {est.icon}
          {est.label}
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        {puedePasarLista(f.estado) && (
          <button
            type="button"
            onClick={() => onPasarLista(f.grupo.id, f.sesion.id)}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8] hover:bg-[#E0E7FF] dark:hover:bg-indigo-950 transition-colors whitespace-nowrap cursor-pointer"
          >
            {f.estado === 'TOMADA' ? 'Cerrar sesión' : 'Pasar lista'}
          </button>
        )}
      </td>
    </tr>
  );
};

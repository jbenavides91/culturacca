import React from 'react';
import { AlertTriangle, CalendarCheck } from 'lucide-react';
import { storageService } from '../../services/storage.service';

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "lunes 16 de noviembre" a partir de YYYY-MM-DD (sin desfase por zona horaria) */
const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
};

const diaDeLaSemana = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

interface Props {
  fechaInicio: string;
  fechaFin: string;
  diasSemana: number[];
}

/** Cuenta las sesiones que tendría el taller (0 = no se puede guardar) */
export const contarSesionesPrevistas = (fechaInicio: string, fechaFin: string, diasSemana: number[]) =>
  storageService.previsualizarSesiones({ fecha_inicio_ciclo: fechaInicio, fecha_fin_ciclo: fechaFin, dias_semana: diasSemana }).length;

/**
 * Muestra cuál será la primera clase real y cuántas sesiones tendrá el taller,
 * y avisa si la fecha de inicio no cae en un día de clase.
 */
export const VistaPreviaSesiones: React.FC<Props> = ({ fechaInicio, fechaFin, diasSemana }) => {
  if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) return null;

  const fechas = storageService.previsualizarSesiones({
    fecha_inicio_ciclo: fechaInicio,
    fecha_fin_ciclo: fechaFin,
    dias_semana: diasSemana,
  });

  if (fechas.length === 0) {
    return (
      <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Con esas fechas y días el taller no tendría ninguna clase. Ajusta el rango o los días.</span>
      </div>
    );
  }

  const dowInicio = diaDeLaSemana(fechaInicio);
  const inicioEsDiaDeClase = diasSemana.includes(dowInicio === 0 ? 7 : dowInicio);

  return (
    <div className="space-y-1.5">
      <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-[11px] text-indigo-800 dark:text-indigo-200 flex items-start gap-1.5">
        <CalendarCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Primera clase: <strong className="capitalize">{fechaLarga(fechas[0])}</strong> · {fechas.length}{' '}
          {fechas.length === 1 ? 'sesión' : 'sesiones'} · última: {fechaLarga(fechas[fechas.length - 1])}
        </span>
      </div>
      {!inicioEsDiaDeClase && (
        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            El {fechaLarga(fechaInicio)} es {DIAS_LARGOS[dowInicio]} y no es día de clase de este taller, así que no
            habrá sesión ese día. Si necesitas una clase ese día, agrégala como "Sesión extraordinaria" en Toma de Asistencia.
          </span>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { AlertTriangle, CalendarCheck } from 'lucide-react';
import { storageService } from '../../services/storage.service';

/** "lunes 4 de enero de 2027" a partir de YYYY-MM-DD (sin desfase por zona horaria) */
const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

interface Props {
  diasSemana: number[];
  /** Fecha de creación del taller (al editar); sin ella se calcula desde hoy */
  creadoEn?: string;
}

/** Cuenta las sesiones que tendría el taller con esos días dentro de los cortes (0 = no se puede guardar) */
export const contarSesionesPrevistas = (diasSemana: number[], creadoEn?: string) =>
  storageService.previsualizarSesiones({ dias_semana: diasSemana, creado_en: creadoEn }).length;

/**
 * Las clases de los talleres se generan dentro de los cortes (Configuración → Cortes):
 * muestra la primera y la última clase y cuántas sesiones tendrá el taller.
 */
export const VistaPreviaSesiones: React.FC<Props> = ({ diasSemana, creadoEn }) => {
  const cortes = storageService.getCortes();

  if (cortes.length === 0) {
    return (
      <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          No hay cortes registrados. Las clases de los talleres se generan a partir de los cortes: créalos primero en
          Configuración → Cortes.
        </span>
      </div>
    );
  }

  if (diasSemana.length === 0) return null;

  const fechas = storageService.previsualizarSesiones({ dias_semana: diasSemana, creado_en: creadoEn });

  if (fechas.length === 0) {
    return (
      <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Con esos días el taller no tendría ninguna clase en los cortes registrados. Ajusta los días o los cortes.</span>
      </div>
    );
  }

  return (
    <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-[11px] text-indigo-800 dark:text-indigo-200 flex items-start gap-1.5">
      <CalendarCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>
        Según los cortes ({cortes.length}): primera clase <strong>{fechaLarga(fechas[0])}</strong> · {fechas.length}{' '}
        {fechas.length === 1 ? 'sesión' : 'sesiones'} · última: {fechaLarga(fechas[fechas.length - 1])}. Los días no
        lectivos no tienen clase.
      </span>
    </div>
  );
};

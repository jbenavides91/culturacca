import React from 'react';
import { Salon } from '../../types/attendance';

interface SalonSelectProps {
  salones: Salon[];
  value: string;
  onChange: (value: string) => void;
  /** Aula ya guardada en el taller (para no perderla si el salón está inactivo o fuera del catálogo) */
  valorGuardado?: string;
  className?: string;
}

const etiqueta = (s: Salon) =>
  [s.nombre, s.ubicacion ? `— ${s.ubicacion}` : '', s.capacidad ? `(cap. ${s.capacidad})` : '']
    .filter(Boolean)
    .join(' ');

/**
 * Selector de salón basado en el catálogo de Configuración → Salones.
 * Muestra solo salones activos; si no hay catálogo, permite escribir el aula como antes.
 */
export const SalonSelect: React.FC<SalonSelectProps> = ({ salones, value, onChange, valorGuardado, className }) => {
  const activos = salones.filter((s) => s.activo);

  if (salones.length === 0) {
    return (
      <div className="space-y-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej: Taller 1 - Ala Norte"
          className={className}
        />
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          Registra los salones en Configuración → Salones para elegirlos de una lista.
        </p>
      </div>
    );
  }

  const guardado = (valorGuardado || '').trim();
  const guardadoFueraDeLista =
    guardado && !activos.some((s) => s.nombre.trim().toLowerCase() === guardado.toLowerCase());

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${className ?? ''} cursor-pointer`}>
      <option value="">Selecciona un salón</option>
      {guardadoFueraDeLista && <option value={guardado}>{guardado} (no disponible en el catálogo)</option>}
      {activos.map((s) => (
        <option key={s.id} value={s.nombre}>
          {etiqueta(s)}
        </option>
      ))}
    </select>
  );
};

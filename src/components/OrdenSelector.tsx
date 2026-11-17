import React from 'react';
import { ArrowDownAZ } from 'lucide-react';
import type { Orden } from '../utils/orden';

interface OrdenSelectorProps {
  value: Orden;
  onChange: (orden: Orden) => void;
  /** Opciones propias de la lista, además de A → Z / Z → A */
  extra?: { value: string; label: string }[];
  className?: string;
}

/** Selector compacto de orden (A → Z por defecto) para cualquier lista */
export const OrdenSelector: React.FC<OrdenSelectorProps> = ({ value, onChange, extra = [], className = '' }) => (
  <label
    className={`relative inline-flex items-center shrink-0 ${className}`}
    title="Ordenar lista"
  >
    <ArrowDownAZ className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Ordenar"
      className="pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#141A23] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
    >
      <option value="AZ">A → Z</option>
      <option value="ZA">Z → A</option>
      {extra.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

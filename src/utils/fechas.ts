/**
 * Fecha en formato YYYY-MM-DD según la hora LOCAL del equipo.
 * No usar `toISOString().split('T')[0]` para "hoy": en Nicaragua (UTC-6) después de las 18:00
 * devuelve la fecha de mañana.
 */
export const fechaLocalISO = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

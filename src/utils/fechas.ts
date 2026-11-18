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

/**
 * Fecha local (YYYY-MM-DD) del pago de una matrícula: fecha_pago, o fecha_aceptacion si no hay;
 * '' si no tiene. Misma regla en Recibos y en los Cortes bimestrales.
 */
export const fechaPagoLocal = (s: { fecha_pago?: string; fecha_aceptacion?: string }): string => {
  const iso = s.fecha_pago || s.fecha_aceptacion;
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : fechaLocalISO(d);
};

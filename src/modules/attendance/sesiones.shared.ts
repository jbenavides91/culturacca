/**
 * Funciones puras de las sesiones de un taller en Toma de Asistencia:
 * estado visual, fechas legibles, sesión por defecto y agrupación por mes.
 * Las fechas `YYYY-MM-DD` se leen por partes (fecha local), nunca con `new Date('YYYY-MM-DD')`.
 */
import { Sesion } from '../../types/attendance';
import { fechaLocalISO } from '../../utils/fechas';

export type EstadoSesionUI = 'CERRADA' | 'HOY' | 'PENDIENTE' | 'PROGRAMADA';

/** Estado visual de una sesión según la fecha y hora LOCAL actuales */
export const estadoSesion = (s: Sesion): { estado: EstadoSesionUI; texto: string } => {
  if (s.cerrada) return { estado: 'CERRADA', texto: 'Lista formalizada' };
  const ahora = new Date();
  const hoy = fechaLocalISO(ahora);
  if (s.fecha === hoy) {
    const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    return {
      estado: 'HOY',
      texto: s.hora_inicio > horaActual ? `Hoy · inicia ${s.hora_inicio}` : 'En curso (Hoy)',
    };
  }
  if (s.fecha < hoy) return { estado: 'PENDIENTE', texto: 'Sin cerrar' };
  return { estado: 'PROGRAMADA', texto: 'Programada' };
};

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTOS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Partes legibles de una fecha `YYYY-MM-DD` (fecha local) */
export const formatSessionDate = (dateStr: string) => {
  if (!dateStr) return { dayName: '', dayShort: '', dayNum: 0, monthName: '', fullDate: '', shortDate: '' };
  const parts = dateStr.split('-');
  if (parts.length < 3) {
    return { dayName: '', dayShort: '', dayNum: 0, monthName: '', fullDate: dateStr, shortDate: dateStr };
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const dIndex = new Date(year, month - 1, day).getDay();
  return {
    dayName: DIAS[dIndex] || '',
    dayShort: DIAS_CORTOS[dIndex] || '',
    dayNum: day,
    monthName: MESES_CORTOS[month - 1] || '',
    fullDate: `${DIAS[dIndex] || ''}, ${day} de ${MESES[month - 1] || ''} de ${year}`,
    shortDate: `${day} ${MESES_CORTOS[month - 1] || ''}`,
  };
};

/**
 * Sesión que se abre por defecto: la de hoy; si hoy no hay clase, la última pasada sin cerrar
 * (la futura estaría bloqueada); si no, la próxima; si no, la última.
 */
export const sesionPorDefecto = (sesiones: Sesion[], hoy: string = fechaLocalISO()): Sesion | undefined => {
  const pendientesPasadas = sesiones.filter((s) => s.fecha < hoy && !s.cerrada);
  return (
    sesiones.find((s) => s.fecha === hoy) ||
    pendientesPasadas[pendientesPasadas.length - 1] ||
    sesiones.find((s) => s.fecha > hoy) ||
    sesiones[sesiones.length - 1]
  );
};

export interface MesDeSesiones {
  /** `YYYY-MM` */
  mes: string;
  /** "Noviembre 2027" */
  etiqueta: string;
  /** "Nov" */
  etiquetaCorta: string;
  sesiones: Sesion[];
  cerradas: number;
  pendientes: number;
  programadas: number;
}

/** Agrupa las sesiones (ya ordenadas por fecha) por mes calendario, en orden */
export const agruparPorMes = (sesiones: Sesion[]): MesDeSesiones[] => {
  const grupos = new Map<string, MesDeSesiones>();
  for (const s of sesiones) {
    const mes = s.fecha.slice(0, 7);
    let g = grupos.get(mes);
    if (!g) {
      const [anio, m] = mes.split('-').map(Number);
      g = {
        mes,
        etiqueta: `${MESES[m - 1] || mes} ${anio}`,
        etiquetaCorta: MESES_CORTOS[m - 1] || mes,
        sesiones: [],
        cerradas: 0,
        pendientes: 0,
        programadas: 0,
      };
      grupos.set(mes, g);
    }
    g.sesiones.push(s);
    const { estado } = estadoSesion(s);
    if (estado === 'CERRADA') g.cerradas++;
    else if (estado === 'PENDIENTE') g.pendientes++;
    else g.programadas++;
  }
  return [...grupos.values()].sort((a, b) => a.mes.localeCompare(b.mes));
};

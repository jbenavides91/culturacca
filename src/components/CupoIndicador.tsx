import React from 'react';
import { Users } from 'lucide-react';
import { AlertasCupo, OcupacionTaller } from '../types/attendance';
import { storageService } from '../services/storage.service';

/** Color y texto del nivel de ocupación según Configuración → Cupos */
export const estiloCupo = (o: OcupacionTaller, alertas: AlertasCupo = storageService.alertasCupo()) =>
  o.nivel === 'LLENO'
    ? alertas.lleno
    : o.nivel === 'ALERTA'
    ? alertas.alerta
    : o.nivel === 'DISPONIBLE'
    ? alertas.disponible
    : null;

const textoTitulo = (o: OcupacionTaller) =>
  o.cupo === null
    ? `Sin cupo definido · ${o.inscritos} inscritos${o.pendientes ? ` y ${o.pendientes} en Caja` : ''}`
    : `${o.ocupados} de ${o.cupo} lugares ocupados (${o.inscritos} inscritos${
        o.pendientes ? ` + ${o.pendientes} solicitudes en Caja` : ''
      }) · ${o.libres} libres`;

interface BadgeProps {
  ocupacion: OcupacionTaller;
  /** Solo "12/15", sin el texto del nivel */
  compacto?: boolean;
  /** Estilos a usar (vista previa de Configuración); por defecto los guardados */
  alertas?: AlertasCupo;
  className?: string;
}

/** Chip "12/15 · Por llenarse" con el color configurado (texto del color, fondo y borde translúcidos) */
export const CupoBadge: React.FC<BadgeProps> = ({ ocupacion, compacto = false, alertas, className = '' }) => {
  const estilo = estiloCupo(ocupacion, alertas);
  if (!estilo) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 ${className}`}
        title={textoTitulo(ocupacion)}
      >
        <Users className="w-3 h-3" />
        {compacto ? ocupacion.ocupados : 'Sin cupo'}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${className}`}
      style={{ color: estilo.color, backgroundColor: `${estilo.color}1A`, borderColor: `${estilo.color}55` }}
      title={textoTitulo(ocupacion)}
    >
      <Users className="w-3 h-3" />
      <span className="tabular-nums">
        {ocupacion.ocupados}/{ocupacion.cupo}
      </span>
      {!compacto && <span>· {estilo.texto}</span>}
    </span>
  );
};

/** Barra de ocupación con el detalle de lugares libres y solicitudes en Caja */
export const BarraCupo: React.FC<{ ocupacion: OcupacionTaller; alertas?: AlertasCupo; className?: string }> = ({
  ocupacion,
  alertas,
  className = '',
}) => {
  const estilo = estiloCupo(ocupacion, alertas);
  if (!estilo || ocupacion.cupo === null) {
    return (
      <p className={`text-[11px] text-slate-500 dark:text-slate-400 ${className}`}>
        Sin cupo definido · {ocupacion.inscritos} inscritos
        {ocupacion.pendientes ? ` · ${ocupacion.pendientes} en Caja` : ''}
      </p>
    );
  }
  return (
    <div className={`space-y-1 ${className}`} title={textoTitulo(ocupacion)}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-bold" style={{ color: estilo.color }}>
          {estilo.texto}
        </span>
        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
          {ocupacion.ocupados}/{ocupacion.cupo} · {ocupacion.libres} {ocupacion.libres === 1 ? 'libre' : 'libres'}
          {ocupacion.pendientes ? ` · ${ocupacion.pendientes} en Caja` : ''}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(ocupacion.porcentaje, 100)}%`, backgroundColor: estilo.color }}
        />
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, X } from 'lucide-react';
import { Grupo, Perfil, Sesion } from '../../types/attendance';
import { fechaLocalISO } from '../../utils/fechas';
import { BadgeExtra, finDeMes, formatearFecha, sumarDias } from './attendanceStatus.shared';

const DIAS_VENTANA = 7;

type Modo = 'proximos' | 'mes' | 'rango';

const MODOS: { id: Modo; label: string }[] = [
  { id: 'proximos', label: `Próximos ${DIAS_VENTANA} días` },
  { id: 'mes', label: 'Este mes' },
  { id: 'rango', label: 'Rango' },
];

const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface ProximaClase {
  sesion: Sesion;
  grupo: Grupo;
  docente: string;
}

/** Días entre dos fechas YYYY-MM-DD (en UTC, sin desfase de zona horaria) */
const diasEntre = (desde: string, hasta: string) => {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(hasta) - utc(desde)) / 86400000);
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const horaLocal = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

interface UpcomingClassesCardProps {
  grupos: Grupo[];
  sesiones: Sesion[];
  perfiles: Perfil[];
}

/** Agenda de las próximas clases (aún no iniciadas), agrupada por día */
export const UpcomingClassesCard: React.FC<UpcomingClassesCardProps> = ({ grupos, sesiones, perfiles }) => {
  const ahora = new Date();
  const hoyStr = fechaLocalISO(ahora);
  const horaActual = horaLocal(ahora);

  const [dias, setDias] = useState(DIAS_VENTANA);
  const [modo, setModo] = useState<Modo>('proximos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setDias(DIAS_VENTANA);
  };

  const proximas = useMemo<ProximaClase[]>(() => {
    const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
    const perfilPorId = new Map(perfiles.map((p) => [p.id, p]));
    return sesiones
      .filter(
        (s) =>
          grupoPorId.has(s.grupo_id) &&
          !s.cerrada &&
          (s.fecha > hoyStr || (s.fecha === hoyStr && s.hora_inicio > horaActual))
      )
      .map((s) => {
        const grupo = grupoPorId.get(s.grupo_id)!;
        const prof = perfilPorId.get(grupo.profesor_id);
        return { sesion: s, grupo, docente: prof ? `${prof.nombre} ${prof.apellido}` : 'Sin docente asignado' };
      })
      .sort((a, b) =>
        a.sesion.fecha === b.sesion.fecha
          ? a.sesion.hora_inicio.localeCompare(b.sesion.hora_inicio)
          : a.sesion.fecha.localeCompare(b.sesion.fecha)
      );
  }, [grupos, sesiones, perfiles, hoyStr, horaActual]);

  // Rango elegido (las clases ya iniciadas o pasadas nunca se listan: son "próximas")
  const rangoInvalido = modo === 'rango' && !!desde && !!hasta && hasta < desde;
  const [inicio, fin] =
    modo === 'mes'
      ? [hoyStr, finDeMes(hoyStr)]
      : modo === 'rango'
      ? [desde || hoyStr, hasta || '9999-12-31']
      : [hoyStr, '9999-12-31'];

  const enRango = useMemo(
    () => proximas.filter((p) => p.sesion.fecha >= inicio && p.sesion.fecha <= fin),
    [proximas, inicio, fin]
  );

  // "Próximos 7 días": ventana ampliable; si no hay clases en ella, al menos el primer día con clases.
  // "Este mes" y "Rango": todo el rango elegido.
  const limite = sumarDias(hoyStr, dias - 1);
  const primerDia = enRango[0]?.sesion.fecha;
  const corte = modo !== 'proximos' ? fin : primerDia && primerDia > limite ? primerDia : limite;

  const porDia = useMemo(() => {
    const grupos: { fecha: string; items: ProximaClase[] }[] = [];
    enRango
      .filter((p) => p.sesion.fecha <= corte)
      .forEach((p) => {
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.fecha === p.sesion.fecha) ultimo.items.push(p);
        else grupos.push({ fecha: p.sesion.fecha, items: [p] });
      });
    return grupos;
  }, [enRango, corte]);

  const visibles = porDia.reduce((n, d) => n + d.items.length, 0);
  const restantes = enRango.length - visibles;
  const enSemana = proximas.filter((p) => p.sesion.fecha <= sumarDias(hoyStr, DIAS_VENTANA - 1)).length;

  const badge =
    modo === 'proximos'
      ? { texto: `${enSemana} en ${DIAS_VENTANA} días`, titulo: `Clases en los próximos ${DIAS_VENTANA} días` }
      : { texto: plural(enRango.length, 'clase', 'clases'), titulo: 'Clases en el rango elegido' };

  const descripcionRango =
    modo === 'mes'
      ? `Hasta el ${fechaLarga(fin)}`
      : modo === 'rango' && (desde || hasta)
      ? `${desde ? fechaLarga(desde) : 'Hoy'} – ${hasta ? fechaLarga(hasta) : 'sin límite'}`
      : '';

  const inputClass =
    'text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] w-full';

  const etiquetaDia = (fecha: string) => {
    const diff = diasEntre(hoyStr, fecha);
    if (diff === 0) return { titulo: 'Hoy', detalle: formatearFecha(fecha) };
    if (diff === 1) return { titulo: 'Mañana', detalle: formatearFecha(fecha) };
    return { titulo: formatearFecha(fecha), detalle: `en ${diff} días` };
  };

  return (
    <section className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex flex-col overflow-hidden">
      {/* Encabezado */}
      <div className="p-3.5 sm:p-5 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
          <h2 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">Próximas clases</h2>
        </div>
        <span
          className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8] border border-indigo-200 dark:border-indigo-900 tabular-nums"
          title={badge.titulo}
        >
          {badge.texto}
        </span>
      </div>

      {/* Filtro por rango de fechas */}
      <div className="px-4 pt-3 pb-3 border-b border-[#E7EAF0] dark:border-[#2B3442] space-y-2">
        <div
          className="flex gap-0.5 p-1 bg-[#F7F8FA] dark:bg-[#151A22] rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-[11px]"
          role="tablist"
          aria-label="Rango de fechas"
        >
          {MODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={modo === m.id}
              onClick={() => cambiarModo(m.id)}
              className={`flex-1 px-2 py-1 rounded-md font-semibold transition cursor-pointer whitespace-nowrap ${
                modo === m.id
                  ? 'bg-white dark:bg-[#1B222D] text-[#4F46E5] dark:text-[#818CF8] shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F1F5F9]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {modo === 'rango' && (
          <div className="grid grid-cols-2 gap-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
            <label className="space-y-0.5">
              <span className="font-semibold">Desde</span>
              <input
                type="date"
                value={desde}
                min={hoyStr}
                onChange={(e) => setDesde(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-0.5">
              <span className="font-semibold">Hasta</span>
              <input
                type="date"
                value={hasta}
                min={desde || hoyStr}
                onChange={(e) => setHasta(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        )}

        {(descripcionRango || (modo === 'rango' && (desde || hasta))) && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
            <span className="truncate">{descripcionRango}</span>
            {modo === 'rango' && (desde || hasta) && (
              <button
                type="button"
                onClick={() => {
                  setDesde('');
                  setHasta('');
                }}
                className="shrink-0 flex items-center gap-0.5 font-semibold hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer"
              >
                <X className="w-3 h-3" />
                Limpiar fechas
              </button>
            )}
          </div>
        )}
      </div>

      {/* Agenda */}
      <div className="p-4 max-h-[520px] overflow-y-auto">
        {rangoInvalido ? (
          <p className="py-5 sm:py-8 text-center text-xs font-semibold text-rose-600 dark:text-rose-400">
            La fecha "Hasta" debe ser igual o posterior a "Desde".
          </p>
        ) : enRango.length === 0 ? (
          <div className="py-10 text-center text-[#667085] dark:text-[#94A3B8]">
            <CalendarClock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold">
              {modo === 'proximos' ? 'No hay próximas clases programadas.' : 'No hay clases programadas en este rango.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {porDia.map(({ fecha, items }) => {
              const { titulo, detalle } = etiquetaDia(fecha);
              const esHoy = fecha === hoyStr;
              return (
                <section key={fecha}>
                  {/* Cabecera del día */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider capitalize ${
                        esHoy ? 'text-[#4F46E5] dark:text-[#818CF8]' : 'text-[#172033] dark:text-[#F1F5F9]'
                      }`}
                    >
                      {titulo}
                    </span>
                    <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] capitalize truncate">· {detalle}</span>
                    <span className="flex-1 h-px bg-[#E7EAF0] dark:bg-[#2B3442]" />
                    <span className="text-[10px] font-semibold text-[#667085] dark:text-[#94A3B8] tabular-nums shrink-0">
                      {plural(items.length, 'clase', 'clases')}
                    </span>
                  </div>

                  {/* Clases del día */}
                  <ul className="rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] divide-y divide-[#E7EAF0] dark:divide-[#2B3442] overflow-hidden">
                    {items.map((p) => (
                      <li
                        key={p.sesion.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70 transition-colors"
                      >
                        <div className="w-11 shrink-0 text-right">
                          <div className="font-mono text-sm font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">
                            {p.sesion.hora_inicio}
                          </div>
                          <div className="font-mono text-[10px] tabular-nums text-[#667085] dark:text-[#94A3B8]">
                            {p.sesion.hora_fin}
                          </div>
                        </div>
                        <span
                          className={`w-1 self-stretch rounded-full shrink-0 ${
                            p.sesion.extraordinaria ? 'bg-violet-400 dark:bg-violet-600' : 'bg-[#4F46E5]/70 dark:bg-[#818CF8]/70'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">
                              {p.grupo.nombre}
                            </span>
                            {p.sesion.extraordinaria && <BadgeExtra />}
                          </div>
                          <div className="text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">
                            {p.docente} · {p.grupo.aula || 'Taller Principal'}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            {restantes > 0 && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setDias(diasEntre(hoyStr, corte) + 1 + DIAS_VENTANA)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[#E7EAF0] dark:border-[#2B3442] text-[#4F46E5] dark:text-[#818CF8] hover:bg-[#EEF2FF] dark:hover:bg-[#1E1B4B] transition cursor-pointer inline-flex items-center gap-1.5"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  Ver más clases
                  <span className="text-[#667085] dark:text-[#94A3B8] font-normal">({restantes} restantes)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

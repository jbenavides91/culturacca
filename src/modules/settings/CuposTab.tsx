import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Gauge, RotateCcw, Save } from 'lucide-react';
import { AlertasCupo, OcupacionTaller } from '../../types/attendance';
import { ALERTAS_CUPO_PREDETERMINADAS, storageService, subscribeToData } from '../../services/storage.service';
import { BarraCupo, CupoBadge } from '../../components/CupoIndicador';
import { OrdenSelector } from '../../components/OrdenSelector';
import { ordenarAlfabetico, type Orden } from '../../utils/orden';

type ClaveNivel = 'disponible' | 'alerta' | 'lleno';

const NIVELES: { clave: ClaveNivel; titulo: string; ayuda: string }[] = [
  { clave: 'disponible', titulo: 'Disponible', ayuda: 'Por debajo del umbral' },
  { clave: 'alerta', titulo: 'Por llenarse', ayuda: 'Desde el umbral hasta antes de llenarse' },
  { clave: 'lleno', titulo: 'Lleno', ayuda: 'Ocupados = cupo: no acepta más matrículas' },
];

const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

/** Ejemplos fijos para la vista previa de los tres niveles */
const ejemplo = (ocupados: number, nivel: OcupacionTaller['nivel']): OcupacionTaller => ({
  cupo: 20,
  inscritos: ocupados,
  pendientes: 0,
  ocupados,
  libres: 20 - ocupados,
  porcentaje: Math.round((ocupados / 20) * 100),
  nivel,
});

const inputClass =
  'rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] p-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5]';

/** Configuración → Cupos: niveles de ocupación de los talleres y ocupación actual de cada uno */
export const CuposTab: React.FC = () => {
  const [form, setForm] = useState<AlertasCupo>(() => storageService.alertasCupo());
  const [version, setVersion] = useState(0);
  const [orden, setOrden] = useState<Orden>('AZ');
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => subscribeToData(() => setVersion((v) => v + 1)), []);

  const guardado = useMemo(() => storageService.alertasCupo(), [version]);
  const cambios = JSON.stringify(form) !== JSON.stringify(guardado);

  const talleres = useMemo(() => {
    const lista = storageService.getGrupos().map((g) => ({ grupo: g, ocupacion: storageService.ocupacionTaller(g.id) }));
    return ordenarAlfabetico(lista, (t) => [t.grupo.nombre], orden === 'ZA' ? 'ZA' : 'AZ');
  }, [version, orden]);

  const sinCupo = talleres.filter((t) => t.ocupacion.nivel === 'SIN_CUPO').length;
  const llenos = talleres.filter((t) => t.ocupacion.nivel === 'LLENO').length;
  const porLlenarse = talleres.filter((t) => t.ocupacion.nivel === 'ALERTA').length;

  // La vista previa de la tabla usa los estilos del formulario, para ver el efecto antes de guardar
  const nivelCon = (o: OcupacionTaller): OcupacionTaller =>
    o.cupo === null || o.nivel === 'LLENO'
      ? o
      : { ...o, nivel: o.porcentaje >= form.umbral ? 'ALERTA' : 'DISPONIBLE' };

  const cambiarNivel = (clave: ClaveNivel, campo: 'color' | 'texto', valor: string) =>
    setForm((f) => ({ ...f, [clave]: { ...f[clave], [campo]: valor } }));

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    const umbral = Number(form.umbral);
    if (!Number.isInteger(umbral) || umbral < 1 || umbral > 99) {
      setError('El umbral debe ser un número entero entre 1 y 99.');
      return;
    }
    for (const { clave, titulo } of NIVELES) {
      if (!COLOR_HEX.test(form[clave].color)) {
        setError(`El color de "${titulo}" debe tener el formato #RRGGBB.`);
        return;
      }
      if (!form[clave].texto.trim()) {
        setError(`Escribe el texto del nivel "${titulo}".`);
        return;
      }
    }
    const limpio: AlertasCupo = {
      umbral,
      disponible: { color: form.disponible.color.toUpperCase(), texto: form.disponible.texto.trim() },
      alerta: { color: form.alerta.color.toUpperCase(), texto: form.alerta.texto.trim() },
      lleno: { color: form.lleno.color.toUpperCase(), texto: form.lleno.texto.trim() },
    };
    storageService.updateConfiguracion({ alertas_cupo: limpio });
    setForm(limpio);
    setMensaje('Alertas de cupo guardadas.');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ---------- Parámetros ---------- */}
      <form
        onSubmit={guardar}
        className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs p-3.5 sm:p-5 space-y-4 text-xs text-[#172033] dark:text-[#F1F5F9]"
      >
        <div className="flex items-start gap-2">
          <Gauge className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8] mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-bold">Alertas de cupo de los talleres</h2>
            <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-0.5">
              Ocupados = alumnos inscritos + solicitudes pendientes en Caja (reservan su lugar). Un taller lleno no
              acepta más matrículas. El cupo de cada taller se define en Talleres.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        {mensaje && !cambios && (
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            {mensaje}
          </div>
        )}

        <label className="flex flex-wrap items-center gap-2 font-semibold">
          <span>Un taller está "por llenarse" desde el</span>
          <input
            type="number"
            min={1}
            max={99}
            step={1}
            value={form.umbral}
            onChange={(e) => setForm((f) => ({ ...f, umbral: Number(e.target.value) }))}
            className={`${inputClass} w-20 text-center font-bold`}
          />
          <span>% de ocupación.</span>
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          {NIVELES.map(({ clave, titulo, ayuda }) => (
            <fieldset key={clave} className="rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] p-3 space-y-2">
              <legend className="px-1 font-bold">{titulo}</legend>
              <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">{ayuda}</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={COLOR_HEX.test(form[clave].color) ? form[clave].color : '#000000'}
                  onChange={(e) => cambiarNivel(clave, 'color', e.target.value)}
                  className="w-9 h-9 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-transparent cursor-pointer shrink-0"
                  aria-label={`Color de ${titulo}`}
                />
                <input
                  type="text"
                  value={form[clave].color}
                  onChange={(e) => cambiarNivel(clave, 'color', e.target.value.trim())}
                  maxLength={7}
                  className={`${inputClass} w-24 font-mono`}
                  aria-label={`Código de color de ${titulo}`}
                />
              </div>
              <input
                type="text"
                value={form[clave].texto}
                onChange={(e) => cambiarNivel(clave, 'texto', e.target.value)}
                maxLength={24}
                className={`${inputClass} w-full`}
                aria-label={`Texto de ${titulo}`}
                placeholder={titulo}
              />
            </fieldset>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#667085] dark:text-[#94A3B8]">Vista previa (cupo 20):</span>
          <CupoBadge ocupacion={ejemplo(8, 'DISPONIBLE')} alertas={form} />
          <CupoBadge ocupacion={ejemplo(Math.min(19, Math.ceil((form.umbral / 100) * 20)), 'ALERTA')} alertas={form} />
          <CupoBadge ocupacion={ejemplo(20, 'LLENO')} alertas={form} />
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setForm(ALERTAS_CUPO_PREDETERMINADAS)}
            className="px-3 py-1.5 rounded-lg font-semibold text-[#667085] hover:bg-slate-100 dark:hover:bg-[#151A22] flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Valores predeterminados
          </button>
          <button
            type="submit"
            disabled={!cambios}
            className="px-4 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            Guardar
          </button>
        </div>
      </form>

      {/* ---------- Ocupación actual ---------- */}
      <div className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs overflow-hidden text-xs">
        <div className="px-3.5 sm:px-5 py-3 border-b border-[#E7EAF0] dark:border-[#2B3442] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-[#172033] dark:text-[#F1F5F9]">Ocupación de los talleres</h3>
            <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
              {talleres.length} talleres · {llenos} llenos · {porLlenarse} por llenarse
              {sinCupo > 0 ? ` · ${sinCupo} sin cupo definido (edítalos en Talleres)` : ''}
            </p>
          </div>
          <OrdenSelector value={orden} onChange={setOrden} />
        </div>
        {talleres.length === 0 ? (
          <p className="p-6 text-center text-[#667085] dark:text-[#94A3B8]">No hay talleres registrados.</p>
        ) : (
          <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
            {talleres.map(({ grupo, ocupacion }) => {
              const vista = nivelCon(ocupacion);
              return (
                <li key={grupo.id} className="px-3.5 sm:px-5 py-2.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">{grupo.nombre}</span>
                    <CupoBadge ocupacion={vista} alertas={form} compacto className="shrink-0" />
                  </div>
                  <BarraCupo ocupacion={vista} alertas={form} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

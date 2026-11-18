import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarOff, CheckCircle2, Download, Pencil, Plus, Trash2, X } from 'lucide-react';
import { DiaNoLectivo, TipoDiaNoLectivo } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { fechaLocalISO } from '../../utils/fechas';
import { resumenCambios } from '../../utils/calendario';

const TIPOS: { valor: TipoDiaNoLectivo; etiqueta: string; clase: string }[] = [
  {
    valor: 'FERIADO',
    etiqueta: 'Feriado',
    clase: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  },
  {
    valor: 'VACACIONES',
    etiqueta: 'Vacaciones',
    clase: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  },
  {
    valor: 'OTRO',
    etiqueta: 'Otro',
    clase: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
];

const tipoInfo = (t: TipoDiaNoLectivo) => TIPOS.find((x) => x.valor === t) ?? TIPOS[2];

type Filtro = 'PROXIMOS' | 'TODOS' | string; // string = año "2027"

/** "lun 7 dic 2026" a partir de YYYY-MM-DD (fecha local, sin desfase de zona horaria) */
const formatoFecha = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const diasDelRango = (d: DiaNoLectivo) => {
  const [y1, m1, d1] = d.fecha_inicio.split('-').map(Number);
  const [y2, m2, d2] = d.fecha_fin.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
};

const formVacio = () => ({ motivo: '', tipo: 'FERIADO' as TipoDiaNoLectivo, fecha_inicio: '', fecha_fin: '' });

export const DiasNoLectivosTab: React.FC = () => {
  const [dias, setDias] = useState<DiaNoLectivo[]>([]);
  const [form, setForm] = useState(formVacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('PROXIMOS');
  const anioActual = new Date().getFullYear();
  const [anioCarga, setAnioCarga] = useState(anioActual);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    const cargar = () => setDias(storageService.getDiasNoLectivos());
    cargar();
    return subscribeToData(cargar);
  }, []);

  const hoy = fechaLocalISO();

  // Años para cargar feriados: el anterior y hasta cinco años adelante
  const aniosCarga = useMemo(
    () => Array.from({ length: 7 }, (_, i) => anioActual - 1 + i),
    [anioActual]
  );

  /** Feriados de Nicaragua ya cubiertos por el catálogo, por año (registrados / total) */
  const coberturaFeriados = useMemo(() => {
    const cubre = (fecha: string) => dias.some((d) => d.fecha_inicio <= fecha && fecha <= d.fecha_fin);
    return new Map(
      aniosCarga.map((a) => {
        const feriados = storageService.feriadosNicaragua(a);
        return [a, { registrados: feriados.filter((fer) => cubre(fer.fecha)).length, total: feriados.length }];
      })
    );
  }, [dias, aniosCarga]);

  // Años del filtro: los del catálogo más el mismo rango del selector de carga
  const anios = useMemo(() => {
    const s = new Set<string>(aniosCarga.map(String));
    dias.forEach((d) => {
      s.add(d.fecha_inicio.slice(0, 4));
      s.add(d.fecha_fin.slice(0, 4));
    });
    return Array.from(s).sort();
  }, [dias, aniosCarga]);

  const visibles = useMemo(() => {
    if (filtro === 'TODOS') return dias;
    if (filtro === 'PROXIMOS') return dias.filter((d) => d.fecha_fin >= hoy);
    return dias.filter((d) => d.fecha_inicio.slice(0, 4) <= filtro && d.fecha_fin.slice(0, 4) >= filtro);
  }, [dias, filtro, hoy]);

  const avisar = (texto: string) => {
    setError(null);
    setMensaje(texto);
    setTimeout(() => setMensaje(null), 6000);
  };

  const ejecutar = (accion: () => void) => {
    setError(null);
    try {
      accion();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    }
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setForm(formVacio());
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutar(() => {
      const datos = { ...form, fecha_fin: form.fecha_fin || form.fecha_inicio };
      if (editandoId) {
        const r = storageService.actualizarDiaNoLectivo(editandoId, datos);
        avisar(`"${r.dia.motivo}" actualizado.${resumenCambios(r)}`);
      } else {
        const r = storageService.crearDiaNoLectivo(datos);
        avisar(`"${r.dia.motivo}" agregado.${resumenCambios(r)}`);
      }
      cancelarEdicion();
    });
  };

  const iniciarEdicion = (d: DiaNoLectivo) => {
    setEditandoId(d.id);
    setForm({ motivo: d.motivo, tipo: d.tipo, fecha_inicio: d.fecha_inicio, fecha_fin: d.fecha_fin });
    setError(null);
  };

  const eliminar = (d: DiaNoLectivo) => {
    if (!window.confirm(`¿Eliminar "${d.motivo}"? Las clases de esas fechas se volverán a programar.`)) return;
    ejecutar(() => {
      const r = storageService.eliminarDiaNoLectivo(d.id);
      if (editandoId === d.id) cancelarEdicion();
      avisar(`"${d.motivo}" eliminado.${resumenCambios(r)}`);
    });
  };

  const cargarFeriados = () =>
    ejecutar(() => {
      const r = storageService.cargarFeriadosNicaragua(anioCarga);
      avisar(
        r.agregados > 0
          ? `Se agregaron ${r.agregados} feriado(s) de ${anioCarga}.${resumenCambios(r)}`
          : `Los feriados de ${anioCarga} ya estaban registrados.`
      );
      setFiltro(String(anioCarga));
    });

  const inputClass =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] text-slate-900 dark:text-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const labelClass = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1';
  const botonIcono =
    'p-1.5 rounded-lg text-slate-400 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="space-y-5 animate-fadeIn">
      {mensaje && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3.5 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2 font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{mensaje}</span>
        </div>
      )}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3.5 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white dark:bg-[#141A23] rounded-xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="bg-[#172033] dark:bg-[#151A22] px-4 sm:px-6 py-3 sm:py-4 text-white flex items-center gap-2.5 border-b border-slate-800">
          <CalendarOff className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">Días no lectivos</h3>
            <p className="text-[11px] text-slate-300">
              Feriados, vacaciones y otros días sin clases. Los talleres no programan sesiones en estas fechas.
            </p>
          </div>
        </div>

        {/* Formulario: nuevo o edición */}
        <form onSubmit={guardar} className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className={labelClass} htmlFor="dnl-motivo">
                Motivo
              </label>
              <input
                id="dnl-motivo"
                type="text"
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                maxLength={120}
                placeholder="Ej. Vacaciones de medio año"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="dnl-tipo">
                Tipo
              </label>
              <select
                id="dnl-tipo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDiaNoLectivo })}
                className={inputClass}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="dnl-desde">
                Desde
              </label>
              <input
                id="dnl-desde"
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="dnl-hasta">
                Hasta <span className="font-normal text-slate-400">(vacío = un solo día)</span>
              </label>
              <input
                id="dnl-hasta"
                type="date"
                value={form.fecha_fin}
                min={form.fecha_inicio || undefined}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          {form.fecha_fin && form.fecha_inicio && form.fecha_fin < form.fecha_inicio && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
              La fecha "Hasta" es anterior a "Desde".
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!form.motivo.trim() || !form.fecha_inicio}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editandoId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editandoId ? 'Guardar cambios' : 'Agregar día no lectivo'}
            </button>
            {editandoId && (
              <button
                type="button"
                onClick={cancelarEdicion}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
                Cancelar
              </button>
            )}
          </div>
        </form>

        {/* Feriados de Nicaragua + filtros */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={anioCarga}
              onChange={(e) => setAnioCarga(Number(e.target.value))}
              aria-label="Año de los feriados"
              className={`${inputClass} w-auto`}
            >
              {aniosCarga.map((a) => {
                const c = coberturaFeriados.get(a);
                return (
                  <option key={a} value={a}>
                    {a} ({c?.registrados ?? 0}/{c?.total ?? 0} feriados)
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={cargarFeriados}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-1.5 cursor-pointer"
              title="Año Nuevo, Semana Santa, 1 y 30 de mayo, 19 de julio, Santo Domingo, 14 y 15 de septiembre, Gritería, Purísima y Navidad"
            >
              <Download className="w-4 h-4" />
              Cargar feriados de Nicaragua
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
            {[
              { v: 'PROXIMOS', t: 'Próximos' },
              { v: 'TODOS', t: 'Todos' },
            ].map((op) => (
              <button
                key={op.v}
                type="button"
                onClick={() => setFiltro(op.v)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                  filtro === op.v
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {op.t}
              </button>
            ))}
            <select
              value={filtro === 'PROXIMOS' || filtro === 'TODOS' ? '' : filtro}
              onChange={(e) => setFiltro(e.target.value || 'PROXIMOS')}
              aria-label="Filtrar por año"
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold cursor-pointer border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                filtro !== 'PROXIMOS' && filtro !== 'TODOS'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <option value="">Año…</option>
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {visibles.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            {dias.length === 0
              ? 'No hay días no lectivos registrados. Agrega uno o carga los feriados de Nicaragua.'
              : 'No hay días no lectivos en este filtro.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibles.map((d) => {
              const info = tipoInfo(d.tipo);
              const n = diasDelRango(d);
              const pasado = d.fecha_fin < hoy;
              return (
                <li
                  key={d.id}
                  className={`flex items-center gap-3 px-4 py-2.5 text-xs ${
                    editandoId === d.id ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : pasado ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">{d.motivo}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${info.clase}`}>
                        {info.etiqueta}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                      {n === 1
                        ? formatoFecha(d.fecha_inicio)
                        : `${formatoFecha(d.fecha_inicio)} – ${formatoFecha(d.fecha_fin)}`}
                    </p>
                  </div>
                  <span className="hidden sm:block shrink-0 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {n} día{n === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => iniciarEdicion(d)}
                      className={`${botonIcono} hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40`}
                      title="Editar"
                      aria-label={`Editar ${d.motivo}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(d)}
                      className={`${botonIcono} hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}
                      title="Eliminar"
                      aria-label={`Eliminar ${d.motivo}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          Al agregar, editar o eliminar un día no lectivo se recalcula el calendario de todos los talleres. Las clases
          ya cerradas, con asistencia registrada o extraordinarias nunca se quitan. Para dar una clase en un día no
          lectivo, crea una sesión extraordinaria desde Toma de Asistencia.
        </p>
      </div>
    </div>
  );
};

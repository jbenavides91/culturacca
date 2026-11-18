import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarRange, CheckCircle2, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { CorteBimestral } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { fechaLocalISO } from '../../utils/fechas';
import { resumenCambios } from '../../utils/calendario';

/** "1 nov 2026" a partir de YYYY-MM-DD (fecha local, sin desfase de zona horaria) */
const formatoFecha = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Meses de calendario que toca el corte */
const mesesDelCorte = (c: Pick<CorteBimestral, 'fecha_inicio' | 'fecha_fin'>) => {
  const [y1, m1] = c.fecha_inicio.split('-').map(Number);
  const [y2, m2] = c.fecha_fin.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};

const formVacio = () => ({ nombre: '', fecha_inicio: '', fecha_fin: '' });

export const CortesBimestralesTab: React.FC = () => {
  const [cortes, setCortes] = useState<CorteBimestral[]>([]);
  const [form, setForm] = useState(formVacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const anioActual = new Date().getFullYear();
  const [anioPropuesta, setAnioPropuesta] = useState(anioActual + (new Date().getMonth() >= 10 ? 1 : 0));
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const hoy = fechaLocalISO();

  useEffect(() => {
    const cargar = () => setCortes(storageService.getCortes());
    cargar();
    return subscribeToData(cargar);
  }, []);

  const avisar = (texto: string) => {
    setError(null);
    setMensaje(texto);
    setTimeout(() => setMensaje(null), 8000);
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
      if (editandoId) {
        const r = storageService.actualizarCorte(editandoId, form);
        avisar(`Corte "${r.corte.nombre}" actualizado.${resumenCambios(r)}`);
      } else {
        const r = storageService.crearCorte(form);
        avisar(`Corte "${r.corte.nombre}" creado.${resumenCambios(r)}`);
      }
      cancelarEdicion();
    });
  };

  const iniciarEdicion = (c: CorteBimestral) => {
    setEditandoId(c.id);
    setForm({ nombre: c.nombre, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin });
    setError(null);
  };

  const eliminar = (c: CorteBimestral) => {
    if (
      !window.confirm(
        `¿Eliminar el corte "${c.nombre}"? Se quitarán las clases de todos los talleres en esas fechas (salvo las cerradas, con asistencia o extraordinarias).`
      )
    )
      return;
    ejecutar(() => {
      const r = storageService.eliminarCorte(c.id);
      if (editandoId === c.id) cancelarEdicion();
      avisar(`Corte "${c.nombre}" eliminado.${resumenCambios(r)}`);
    });
  };

  const proponer = () =>
    ejecutar(() => {
      const r = storageService.crearBimestresDelAnio(anioPropuesta);
      avisar(
        r.creados > 0
          ? `Se crearon ${r.creados} bimestre(s) de ${anioPropuesta}${
              r.omitidos > 0 ? `; ${r.omitidos} se omitieron porque se cruzan con cortes existentes` : ''
            }. Puedes ajustar sus fechas con el lápiz.${resumenCambios(r)}`
          : `No se creó ningún bimestre de ${anioPropuesta}: todos se cruzan con cortes existentes.`
      );
    });

  const aplicarATalleres = () =>
    ejecutar(() => {
      const r = storageService.reaplicarCalendarioATodos();
      avisar(`Cortes aplicados a todos los talleres.${resumenCambios(r)}`);
    });

  const inputClass =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] text-slate-900 dark:text-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const labelClass = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1';
  const botonIcono = 'p-1.5 rounded-lg text-slate-400 transition cursor-pointer';

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
          <CalendarRange className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">Cortes bimestrales</h3>
            <p className="text-[11px] text-slate-300">
              Definen el calendario de todos los talleres (sus clases se generan dentro de estas fechas) y los
              periodos del reporte Corte bimestral.
            </p>
          </div>
        </div>

        {/* Formulario: nuevo o edición */}
        <form onSubmit={guardar} className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass} htmlFor="corte-nombre">
                Nombre
              </label>
              <input
                id="corte-nombre"
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                maxLength={80}
                placeholder="Ej. I Bimestre 2027"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="corte-desde">
                Desde
              </label>
              <input
                id="corte-desde"
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="corte-hasta">
                Hasta
              </label>
              <input
                id="corte-hasta"
                type="date"
                value={form.fecha_fin}
                min={form.fecha_inicio || undefined}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!form.nombre.trim() || !form.fecha_inicio || !form.fecha_fin}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editandoId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editandoId ? 'Guardar cambios' : 'Agregar corte'}
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
            <div className="flex items-center gap-2 sm:ml-auto">
              <select
                value={anioPropuesta}
                onChange={(e) => setAnioPropuesta(Number(e.target.value))}
                aria-label="Año de los bimestres"
                className={`${inputClass} w-auto`}
              >
                {Array.from({ length: 4 }, (_, i) => anioActual - 1 + i).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={proponer}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-1.5 cursor-pointer"
                title="Crea Ene–Feb, Mar–Abr, May–Jun, Jul–Ago, Sep–Oct y Nov–Dic; luego puedes ajustar las fechas"
              >
                <Sparkles className="w-4 h-4" />
                Crear 6 bimestres
              </button>
            </div>
          </div>
        </form>

        {cortes.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No hay cortes definidos. Agrega uno o crea los 6 bimestres de un año.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {cortes.map((c) => {
              const actual = c.fecha_inicio <= hoy && hoy <= c.fecha_fin;
              const n = mesesDelCorte(c);
              return (
                <li
                  key={c.id}
                  className={`flex items-center gap-3 px-4 py-2.5 text-xs ${
                    editandoId === c.id
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                      : c.fecha_fin < hoy
                      ? 'opacity-70'
                      : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">{c.nombre}</span>
                      {actual && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Actual
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatoFecha(c.fecha_inicio)} – {formatoFecha(c.fecha_fin)}
                    </p>
                  </div>
                  <span className="hidden sm:block shrink-0 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {n} mes{n === 1 ? '' : 'es'}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => iniciarEdicion(c)}
                      className={`${botonIcono} hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40`}
                      title="Editar"
                      aria-label={`Editar ${c.nombre}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(c)}
                      className={`${botonIcono} hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}
                      title="Eliminar"
                      aria-label={`Eliminar ${c.nombre}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex-1">
            Al crear, editar o eliminar un corte se recalculan las clases de todos los talleres (en sus días de la semana,
            desde la fecha en que se creó cada taller y sin días no lectivos). Las clases cerradas, con asistencia o
            extraordinarias nunca se quitan.
          </p>
          <button
            type="button"
            onClick={aplicarATalleres}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            title="Vuelve a generar las clases de todos los talleres según los cortes y días no lectivos actuales"
          >
            <RefreshCw className="w-4 h-4" />
            Aplicar cortes a los talleres
          </button>
        </div>

        <p className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          Los cortes no pueden cruzarse entre sí. Un mes se cobra completo si el alumno estuvo inscrito al menos un día de
          ese mes; el mes que cubre su matrícula pagada no se cobra. Las mensualidades no se registran en el sistema.
        </p>
      </div>
    </div>
  );
};

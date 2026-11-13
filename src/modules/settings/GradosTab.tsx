import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  GraduationCap,
  Pencil,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react';
import { Estudiante, Grado, SolicitudMatricula } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';

export const GradosTab: React.FC = () => {
  const [grados, setGrados] = useState<Grado[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [matriculas, setMatriculas] = useState<SolicitudMatricula[]>([]);
  const [nuevo, setNuevo] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    const cargar = () => {
      setGrados(storageService.getGrados());
      setEstudiantes(storageService.getEstudiantes());
      setMatriculas(storageService.getSolicitudesMatricula());
    };
    cargar();
    return subscribeToData(cargar);
  }, []);

  /** Alumnos y matrículas por nombre de grado (sin distinguir mayúsculas) */
  const uso = useMemo(() => {
    const m = new Map<string, { alumnos: number; matriculas: number }>();
    const sumar = (grado: string | undefined, campo: 'alumnos' | 'matriculas') => {
      const clave = (grado || '').trim().toLowerCase();
      if (!clave) return;
      const c = m.get(clave) ?? { alumnos: 0, matriculas: 0 };
      c[campo] += 1;
      m.set(clave, c);
    };
    estudiantes.forEach((e) => sumar(e.grado, 'alumnos'));
    matriculas.forEach((s) => sumar(s.grado, 'matriculas'));
    return m;
  }, [estudiantes, matriculas]);

  const usoDe = (g: Grado) => uso.get(g.nombre.trim().toLowerCase()) ?? { alumnos: 0, matriculas: 0 };

  const avisar = (texto: string) => {
    setError(null);
    setMensaje(texto);
    setTimeout(() => setMensaje(null), 3500);
  };

  const ejecutar = (accion: () => void) => {
    setError(null);
    try {
      accion();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    }
  };

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutar(() => {
      const g = storageService.crearGrado(nuevo);
      setNuevo('');
      avisar(`Grado "${g.nombre}" agregado al final de la lista.`);
    });
  };

  const iniciarEdicion = (g: Grado) => {
    setEditandoId(g.id);
    setEditNombre(g.nombre);
    setError(null);
  };

  const guardarEdicion = (g: Grado) => {
    ejecutar(() => {
      const enUso = usoDe(g);
      const actualizado = storageService.actualizarGrado(g.id, { nombre: editNombre });
      setEditandoId(null);
      const total = enUso.alumnos + enUso.matriculas;
      avisar(
        actualizado.nombre !== g.nombre && total > 0
          ? `Grado renombrado. Se actualizaron ${enUso.alumnos} alumno(s) y ${enUso.matriculas} matrícula(s).`
          : 'Grado actualizado.'
      );
    });
  };

  const toggleActivo = (g: Grado) =>
    ejecutar(() => {
      storageService.actualizarGrado(g.id, { activo: !g.activo });
      avisar(
        g.activo
          ? `"${g.nombre}" desactivado: ya no aparecerá en matrículas ni en fichas nuevas.`
          : `"${g.nombre}" activado.`
      );
    });

  const eliminar = (g: Grado) => {
    if (!window.confirm(`¿Eliminar el grado "${g.nombre}"?`)) return;
    ejecutar(() => {
      storageService.eliminarGrado(g.id);
      avisar(`Grado "${g.nombre}" eliminado.`);
    });
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] text-slate-900 dark:text-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500';
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
          <GraduationCap className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">Grados Escolares</h3>
            <p className="text-[11px] text-slate-300">
              Grados que se ofrecen al matricular y editar alumnos, en el orden en que aparecen en las listas.
            </p>
          </div>
        </div>

        {/* Nuevo grado */}
        <form
          onSubmit={crear}
          className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2"
        >
          <input
            type="text"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            maxLength={60}
            placeholder="Nombre del nuevo grado (p. ej. Preescolar)"
            aria-label="Nombre del nuevo grado"
            className={`${inputClass} sm:max-w-sm`}
          />
          <button
            type="submit"
            disabled={!nuevo.trim()}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Agregar grado
          </button>
          <span className="sm:ml-auto text-xs text-slate-500 dark:text-slate-400 font-mono">
            {grados.filter((g) => g.activo).length} activos • {grados.length} en total
          </span>
        </form>

        {grados.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No hay grados en el catálogo. Mientras tanto se usan los grados por defecto (1er a 11mo Grado).
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {grados.map((g, i) => {
              const u = usoDe(g);
              const enUso = u.alumnos + u.matriculas > 0;
              const editando = editandoId === g.id;
              return (
                <li
                  key={g.id}
                  className={`flex items-center gap-3 px-4 py-2.5 text-xs ${!g.activo ? 'bg-slate-50/60 dark:bg-slate-900/30' : ''}`}
                >
                  {/* Orden */}
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      onClick={() => ejecutar(() => storageService.moverGrado(g.id, -1))}
                      disabled={i === 0}
                      className={`${botonIcono} p-0.5 hover:text-indigo-600`}
                      title="Subir"
                      aria-label={`Subir ${g.nombre}`}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => ejecutar(() => storageService.moverGrado(g.id, 1))}
                      disabled={i === grados.length - 1}
                      className={`${botonIcono} p-0.5 hover:text-indigo-600`}
                      title="Bajar"
                      aria-label={`Bajar ${g.nombre}`}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="w-6 shrink-0 text-right font-mono text-[11px] text-slate-400 tabular-nums">{i + 1}</span>

                  {/* Nombre */}
                  <div className="flex-1 min-w-0">
                    {editando ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          guardarEdicion(g);
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                          onKeyDown={(e) => e.key === 'Escape' && setEditandoId(null)}
                          maxLength={60}
                          autoFocus
                          aria-label="Nombre del grado"
                          className={`${inputClass} max-w-xs`}
                        />
                        <button
                          type="submit"
                          disabled={!editNombre.trim()}
                          className={`${botonIcono} text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40`}
                          title="Guardar"
                          aria-label="Guardar"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoId(null)}
                          className={`${botonIcono} hover:bg-slate-100 dark:hover:bg-slate-800`}
                          title="Cancelar"
                          aria-label="Cancelar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`font-semibold truncate ${
                            g.activo ? 'text-slate-900 dark:text-white' : 'text-slate-400 line-through'
                          }`}
                        >
                          {g.nombre}
                        </span>
                        {!g.activo && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                            Inactivo
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Uso */}
                  <span
                    className="hidden sm:block shrink-0 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums"
                    title={`${u.alumnos} alumno(s) y ${u.matriculas} matrícula(s) usan este grado`}
                  >
                    {u.alumnos} alumno{u.alumnos === 1 ? '' : 's'}
                    {u.matriculas > 0 && ` · ${u.matriculas} matr.`}
                  </span>

                  {/* Acciones */}
                  {!editando && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => iniciarEdicion(g)}
                        className={`${botonIcono} hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40`}
                        title="Renombrar"
                        aria-label={`Renombrar ${g.nombre}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActivo(g)}
                        className={`${botonIcono} ${
                          g.activo
                            ? 'hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                            : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        }`}
                        title={g.activo ? 'Desactivar' : 'Activar'}
                        aria-label={`${g.activo ? 'Desactivar' : 'Activar'} ${g.nombre}`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(g)}
                        disabled={enUso}
                        className={`${botonIcono} hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}
                        title={enUso ? 'En uso: desactívalo en lugar de eliminarlo' : 'Eliminar'}
                        aria-label={`Eliminar ${g.nombre}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          Renombrar un grado actualiza a los alumnos y matrículas que lo tienen. Un grado en uso no se puede eliminar:
          desactívalo para ocultarlo de las listas sin perder el dato de los alumnos.
        </p>
      </div>
    </div>
  );
};

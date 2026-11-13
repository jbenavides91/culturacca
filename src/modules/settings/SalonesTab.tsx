import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  DoorOpen,
  MapPin,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Grupo, Salon } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';

interface FormState {
  nombre: string;
  ubicacion: string;
  capacidad: string;
  activo: boolean;
}

const FORM_VACIO: FormState = { nombre: '', ubicacion: '', capacidad: '', activo: true };

export const SalonesTab: React.FC = () => {
  const [salones, setSalones] = useState<Salon[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Salon | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    const cargar = () => {
      setSalones(storageService.getSalones());
      setGrupos(storageService.getGrupos());
    };
    cargar();
    return subscribeToData(cargar);
  }, []);

  const usoPorSalon = useMemo(() => {
    const mapa = new Map<string, Grupo[]>();
    grupos.forEach((g) => {
      const clave = (g.aula || '').trim().toLowerCase();
      if (!clave) return;
      mapa.set(clave, [...(mapa.get(clave) || []), g]);
    });
    return mapa;
  }, [grupos]);

  const talleresDe = (s: Salon) => usoPorSalon.get(s.nombre.trim().toLowerCase()) || [];

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return salones;
    return salones.filter(
      (s) => s.nombre.toLowerCase().includes(q) || (s.ubicacion || '').toLowerCase().includes(q)
    );
  }, [salones, busqueda]);

  const avisar = (texto: string) => {
    setMensaje(texto);
    setTimeout(() => setMensaje(null), 3500);
  };

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setError(null);
    setModalAbierto(true);
  };

  const abrirEdicion = (s: Salon) => {
    setEditando(s);
    setForm({
      nombre: s.nombre,
      ubicacion: s.ubicacion || '',
      capacidad: s.capacidad ? String(s.capacidad) : '',
      activo: s.activo,
    });
    setError(null);
    setModalAbierto(true);
  };

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const capacidadTxt = form.capacidad.trim();
    const capacidad = capacidadTxt ? Number(capacidadTxt) : undefined;
    if (capacidadTxt && (!Number.isInteger(capacidad) || (capacidad ?? 0) <= 0)) {
      setError('La capacidad debe ser un número entero mayor que 0.');
      return;
    }
    try {
      if (editando) {
        const renombrado = editando.nombre !== form.nombre.trim();
        const enUso = talleresDe(editando).length;
        storageService.actualizarSalon(editando.id, {
          nombre: form.nombre,
          ubicacion: form.ubicacion,
          capacidad,
          activo: form.activo,
        });
        avisar(
          renombrado && enUso > 0
            ? `Salón actualizado. Se renombró también en ${enUso} taller${enUso > 1 ? 'es' : ''}.`
            : 'Salón actualizado.'
        );
      } else {
        const nuevo = storageService.crearSalon({
          nombre: form.nombre,
          ubicacion: form.ubicacion,
          capacidad,
          activo: form.activo,
        });
        avisar(`Salón "${nuevo.nombre}" registrado.`);
      }
      setModalAbierto(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el salón.');
    }
  };

  const toggleActivo = (s: Salon) => {
    storageService.actualizarSalon(s.id, { activo: !s.activo });
    avisar(s.activo ? `"${s.nombre}" desactivado: ya no aparecerá al crear talleres.` : `"${s.nombre}" activado.`);
  };

  const eliminar = (s: Salon) => {
    if (!window.confirm(`¿Eliminar el salón "${s.nombre}"?`)) return;
    try {
      storageService.eliminarSalon(s.id);
      avisar(`Salón "${s.nombre}" eliminado.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el salón.');
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] text-slate-900 dark:text-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <div className="space-y-5 animate-fadeIn">
      {mensaje && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3.5 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2 font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{mensaje}</span>
        </div>
      )}

      <div className="bg-white dark:bg-[#141A23] rounded-xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="bg-[#172033] dark:bg-[#151A22] px-4 sm:px-6 py-3 sm:py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <DoorOpen className="w-5 h-5 text-indigo-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold">Salones y Espacios</h3>
              <p className="text-[11px] text-slate-300">
                Catálogo de aulas que se asignan a los talleres. Un salón no puede usarse por dos talleres en el mismo horario.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={abrirNuevo}
            className="self-start sm:self-auto px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nuevo salón
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o ubicación..."
              className={`${inputClass} pl-8`}
            />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {salones.filter((s) => s.activo).length} activos • {salones.length} en total
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 dark:bg-slate-900/30 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-5">Salón</th>
                <th className="py-3 px-4">Ubicación</th>
                <th className="py-3 px-4 text-center">Capacidad</th>
                <th className="py-3 px-4">Talleres asignados</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    {salones.length === 0
                      ? 'Aún no hay salones registrados. Crea el primero con "Nuevo salón".'
                      : 'Ningún salón coincide con la búsqueda.'}
                  </td>
                </tr>
              ) : (
                filtrados.map((s) => {
                  const talleres = talleresDe(s);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">{s.nombre}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {s.ubicacion ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {s.ubicacion}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {s.capacidad ? (
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-400" />
                            {s.capacidad}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {talleres.length === 0 ? (
                          <span className="text-slate-400">Libre</span>
                        ) : (
                          <span title={talleres.map((t) => `${t.nombre} (${t.hora_inicio}-${t.hora_fin})`).join('\n')}>
                            {talleres.length} taller{talleres.length > 1 ? 'es' : ''}
                            <span className="text-slate-400"> · {talleres.map((t) => t.nombre).slice(0, 2).join(', ')}
                            {talleres.length > 2 ? '…' : ''}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            s.activo
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {s.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => abrirEdicion(s)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Editar salón"
                            aria-label={`Editar ${s.nombre}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActivo(s)}
                            className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${
                              s.activo ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                            title={s.activo ? 'Desactivar' : 'Activar'}
                            aria-label={s.activo ? `Desactivar ${s.nombre}` : `Activar ${s.nombre}`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => eliminar(s)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                            title="Eliminar salón"
                            aria-label={`Eliminar ${s.nombre}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear / editar */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold">{editando ? 'Editar salón' : 'Nuevo salón'}</h3>
              </div>
              <button
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="p-4 sm:p-6 space-y-4 text-xs">
              {error && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Taller de Artes 1"
                  className={inputClass}
                />
                {editando && talleresDe(editando).length > 0 && form.nombre.trim() !== editando.nombre && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    Se actualizará también en {talleresDe(editando).length} taller(es) que usan este salón.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ubicación <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.ubicacion}
                  onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                  placeholder="Ej: Pabellón B, 2do piso"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Capacidad <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.capacidad}
                    onChange={(e) => setForm({ ...form, capacidad: e.target.value })}
                    placeholder="Ej: 20"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Estado</label>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{form.activo ? 'Activo' : 'Inactivo'}</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg cursor-pointer"
                >
                  {editando ? 'Guardar cambios' : 'Registrar salón'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

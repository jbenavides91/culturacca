import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileSpreadsheet, NotebookPen, Pencil, Search, Trash2, X } from 'lucide-react';
import { Anotacion, Estudiante, Grupo, Perfil, TipoAnotacion } from '../../types/attendance';
import { storageService } from '../../services/storage.service';
import { exportService } from '../../services/export.service';
import { fechaLocalISO } from '../../utils/fechas';
import { TIPOS, formatearFechaHora } from '../students/AnecdotarioModal';

export type Periodo = 'mes' | 'trimestre' | 'todo' | 'rango';

export const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'mes', label: 'Este mes' },
  { id: 'trimestre', label: 'Últimos 3 meses' },
  { id: 'todo', label: 'Todo' },
  { id: 'rango', label: 'Rango' },
];

export const TIPOS_LISTA = Object.keys(TIPOS) as TipoAnotacion[];

export function rangoDePeriodo(periodo: Periodo, desde: string, hasta: string): [string, string] {
  const hoy = new Date();
  const hoyStr = fechaLocalISO(hoy);
  switch (periodo) {
    case 'mes':
      return [fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hoyStr];
    case 'trimestre':
      return [fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)), hoyStr];
    case 'todo':
      return ['0000-01-01', '9999-12-31'];
    case 'rango':
      return [desde || '0000-01-01', hasta || '9999-12-31'];
  }
}

/** Clave y etiqueta del mes local de una fecha ISO (para agrupar el historial) */
export const mesDe = (iso: string) => {
  const d = new Date(iso);
  return {
    clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    etiqueta: d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
  };
};

export const nombreCompleto = (e: Estudiante) => `${e.nombre} ${e.apellido}`.trim();

export const nombreTallerDe = (a: Anotacion, grupoPorId: Map<string, Grupo>) =>
  a.grupo_id ? grupoPorId.get(a.grupo_id)?.nombre ?? 'Otro taller' : 'General';

interface AnecdotarioAlumnoModalProps {
  estudiante: Estudiante;
  /** Anotaciones del alumno, ya filtradas según el rol del usuario */
  anotaciones: Anotacion[];
  grupoPorId: Map<string, Grupo>;
  talleres: string[];
  currentProfile: Perfil;
  onClose: () => void;
}

const MAX_CARACTERES = 2000;

export const AnecdotarioAlumnoModal: React.FC<AnecdotarioAlumnoModalProps> = ({
  estudiante,
  anotaciones,
  grupoPorId,
  talleres,
  currentProfile,
  onClose,
}) => {
  // Solo Dirección corrige o elimina anotaciones
  const esAdmin = currentProfile.rol === 'ADMIN';

  const [tipo, setTipo] = useState<'TODOS' | TipoAnotacion>('TODOS');
  const [periodo, setPeriodo] = useState<Periodo>('todo');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTipo, setEditTipo] = useState<TipoAnotacion>('COMENTARIO');
  const [editTexto, setEditTexto] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Con una edición abierta, Escape solo la cancela
      if (editandoId) setEditandoId(null);
      else onClose();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onClose, editandoId]);

  const iniciarEdicion = (a: Anotacion) => {
    setEditandoId(a.id);
    setEditTipo(a.tipo);
    setEditTexto(a.descripcion);
    setEditError(null);
  };

  const guardarEdicion = (a: Anotacion) => {
    setEditError(null);
    try {
      storageService.editarAnotacion(a.id, { tipo: editTipo, descripcion: editTexto }, currentProfile);
      setEditandoId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'No se pudo guardar la corrección.');
    }
  };

  const [inicio, fin] = rangoDePeriodo(periodo, desde, hasta);
  const q = busqueda.trim().toLowerCase();

  // Anotaciones dentro del rango de fechas y la búsqueda (base de los contadores por tipo)
  const enRango = useMemo(
    () =>
      anotaciones
        .filter((a) => {
          const fecha = fechaLocalISO(new Date(a.creado_en));
          if (fecha < inicio || fecha > fin) return false;
          if (q && !a.descripcion.toLowerCase().includes(q) && !nombreTallerDe(a, grupoPorId).toLowerCase().includes(q)) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.creado_en.localeCompare(a.creado_en)),
    [anotaciones, inicio, fin, q, grupoPorId]
  );

  const historial = useMemo(() => (tipo === 'TODOS' ? enRango : enRango.filter((a) => a.tipo === tipo)), [enRango, tipo]);

  const historialPorMes = useMemo(() => {
    const meses: { clave: string; etiqueta: string; items: Anotacion[] }[] = [];
    historial.forEach((a) => {
      const { clave, etiqueta } = mesDe(a.creado_en);
      const ultimo = meses[meses.length - 1];
      if (ultimo && ultimo.clave === clave) ultimo.items.push(a);
      else meses.push({ clave, etiqueta, items: [a] });
    });
    return meses;
  }, [historial]);

  const hayFiltros = tipo !== 'TODOS' || periodo !== 'todo' || busqueda !== '';

  const limpiar = () => {
    setTipo('TODOS');
    setPeriodo('todo');
    setDesde('');
    setHasta('');
    setBusqueda('');
  };

  const exportar = () => {
    const partes = [
      `Alumno: ${nombreCompleto(estudiante)}`,
      PERIODOS.find((p) => p.id === periodo)?.label + (periodo === 'rango' ? ` (${desde || '…'} a ${hasta || '…'})` : ''),
      tipo !== 'TODOS' ? `Tipo: ${TIPOS[tipo].label}` : 'Todos los tipos',
      busqueda ? `Búsqueda: "${busqueda}"` : '',
    ].filter(Boolean);
    exportService.exportAnecdotario(
      historial.map((a) => ({
        fecha: formatearFechaHora(a.creado_en),
        alumno: nombreCompleto(estudiante),
        matricula: estudiante.matricula || '',
        taller: nombreTallerDe(a, grupoPorId),
        tipo: TIPOS[a.tipo].label,
        descripcion: a.descripcion,
        autor: a.autor_nombre,
      })),
      partes.join(' · ')
    );
  };

  const eliminar = (a: Anotacion) => {
    if (window.confirm('¿Eliminar esta anotación del anecdotario? Esta acción no se puede deshacer.')) {
      storageService.eliminarAnotacion(a.id);
    }
  };

  const inputClass =
    'text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]';

  const chip = (activo: boolean) =>
    `inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition cursor-pointer ${
      activo
        ? 'bg-[#4F46E5] border-[#4F46E5] text-white'
        : 'border-[#E7EAF0] dark:border-[#2B3442] text-[#667085] dark:text-[#94A3B8] hover:border-[#4F46E5]/50'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="historial-anecdotario-titulo"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="bg-[#172033] dark:bg-[#151A22] px-5 py-4 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-500/30 shrink-0">
              <NotebookPen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="historial-anecdotario-titulo" className="text-base font-bold truncate">
                {estudiante.apellido}, {estudiante.nombre}
                {estudiante.estado === 'BAJA' && (
                  <span className="ml-2 align-middle text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Baja</span>
                )}
              </h3>
              <p className="text-xs text-slate-300 truncate">
                <span className="font-mono">{estudiante.matricula}</span>
                {talleres.length > 0 ? ` • ${talleres.join(', ')}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filtros */}
        <div className="px-5 py-3 space-y-2.5 border-b border-[#E7EAF0] dark:border-[#2B3442] shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setTipo('TODOS')} className={chip(tipo === 'TODOS')}>
              Todos <span className="tabular-nums opacity-80">{enRango.length}</span>
            </button>
            {TIPOS_LISTA.map((t) => (
              <button key={t} type="button" onClick={() => setTipo(tipo === t ? 'TODOS' : t)} className={chip(tipo === t)}>
                {TIPOS[t].icon}
                {TIPOS[t].label}
                <span className="tabular-nums opacity-80">{enRango.filter((a) => a.tipo === t).length}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap gap-0.5 p-1 bg-[#F7F8FA] dark:bg-[#151A22] rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-xs">
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodo(p.id)}
                  className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                    periodo === p.id
                      ? 'bg-white dark:bg-[#1B222D] text-[#4F46E5] dark:text-[#818CF8] shadow-xs'
                      : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F1F5F9]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodo === 'rango' && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#667085] dark:text-[#94A3B8]">
                <label className="flex items-center gap-1">
                  Desde
                  <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
                </label>
                <label className="flex items-center gap-1">
                  Hasta
                  <input
                    type="date"
                    value={hasta}
                    min={desde || undefined}
                    onChange={(e) => setHasta(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en el texto o taller..."
                className={`${inputClass} w-full pl-9`}
              />
            </div>
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiar}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Historial */}
        <div className="overflow-y-auto flex-1 p-5">
          {historial.length === 0 ? (
            <p className="py-12 text-center text-xs text-[#667085] dark:text-[#94A3B8]">
              {anotaciones.length === 0
                ? 'Este alumno no tiene anotaciones en el anecdotario.'
                : 'No hay anotaciones que coincidan con los filtros.'}
            </p>
          ) : (
            <div className="space-y-5">
              {historialPorMes.map((mes) => (
                <div key={mes.clave} className="space-y-2.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] capitalize">
                    {mes.etiqueta} · {mes.items.length}
                  </h4>
                  <ul className="space-y-2.5">
                    {mes.items.map((a) => {
                      const editando = editandoId === a.id;
                      return (
                        <li
                          key={a.id}
                          className={`p-3.5 rounded-xl border bg-white dark:bg-[#1B222D] space-y-2 ${
                            editando ? 'border-[#4F46E5] ring-1 ring-[#4F46E5]/30' : 'border-[#E7EAF0] dark:border-[#2B3442]'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${TIPOS[a.tipo].badge}`}
                              >
                                {TIPOS[a.tipo].icon}
                                {TIPOS[a.tipo].label}
                              </span>
                              <span className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                                {formatearFechaHora(a.creado_en)} · {nombreTallerDe(a, grupoPorId)}
                              </span>
                            </div>
                            {esAdmin && !editando && (
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicion(a)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#4F46E5] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                                  title="Editar anotación"
                                  aria-label="Editar anotación"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => eliminar(a)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                  title="Eliminar anotación"
                                  aria-label="Eliminar anotación"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {editando ? (
                            <div className="space-y-2.5">
                              <div className="flex flex-wrap gap-1.5">
                                {TIPOS_LISTA.map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setEditTipo(t)}
                                    aria-pressed={editTipo === t}
                                    className={`min-h-[36px] px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                                      editTipo === t ? TIPOS[t].activo : `bg-white dark:bg-[#1B222D] ${TIPOS[t].inactivo}`
                                    }`}
                                  >
                                    {TIPOS[t].icon}
                                    {TIPOS[t].label}
                                  </button>
                                ))}
                              </div>
                              <textarea
                                value={editTexto}
                                onChange={(e) => setEditTexto(e.target.value.slice(0, MAX_CARACTERES))}
                                rows={4}
                                autoFocus
                                aria-label="Contenido de la anotación"
                                className="w-full rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] p-3 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#4F46E5] resize-y"
                              />
                              {editError && (
                                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  {editError}
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] tabular-nums text-[#667085] dark:text-[#94A3B8]">
                                  {editTexto.length}/{MAX_CARACTERES}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditandoId(null)}
                                    className="min-h-[36px] px-3 rounded-lg text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => guardarEdicion(a)}
                                    disabled={!editTexto.trim()}
                                    className="min-h-[36px] px-3.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    Guardar cambios
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs leading-relaxed whitespace-pre-wrap text-[#172033] dark:text-[#F1F5F9]">{a.descripcion}</p>
                          )}

                          <p className="text-[10px] text-[#667085] dark:text-[#94A3B8]">
                            Registrado por {a.autor_nombre}
                            {a.editado_en && (
                              <span className="italic">
                                {' '}
                                · Editado por {a.editado_por_nombre || 'Dirección'} el {formatearFechaHora(a.editado_en)}
                              </span>
                            )}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="px-5 py-3 border-t border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] tabular-nums">
            {historial.length} de {anotaciones.length} anotaciones
          </span>
          <button
            type="button"
            onClick={exportar}
            disabled={historial.length === 0}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>
      </div>
    </div>
  );
};

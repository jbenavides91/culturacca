import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AlumnoPadron, FilaImportPadron, GRADOS_ESCOLARES } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { claveNombre, emparejarGrado, normalizarTexto, separarNombreCompleto } from '../../utils/padron';
import { indiceGrado } from '../../utils/grados';
import { ordenarAlfabetico, type Orden } from '../../utils/orden';
import { OrdenSelector } from '../../components/OrdenSelector';

/** Nombres de grado del catálogo (o los predeterminados si está vacío) */
const catalogoGrados = (): string[] => {
  const nombres = storageService.getGrados().map((g) => g.nombre);
  return nombres.length > 0 ? nombres : [...GRADOS_ESCOLARES];
};

/** Columnas del Excel por encabezado; sin encabezados: nombre, grado, sección */
interface Columnas {
  nombre: number;
  apellido: number | null;
  grado: number;
  seccion: number | null;
  codigo: number | null;
}

function detectarColumnas(filas: string[][]): { columnas: Columnas; inicio: number } {
  for (let i = 0; i < Math.min(filas.length, 5); i++) {
    const celdas = filas[i].map((c) => normalizarTexto(String(c)));
    const buscar = (re: RegExp) => {
      const j = celdas.findIndex((c) => re.test(c));
      return j >= 0 ? j : null;
    };
    const apellido = buscar(/apellido/);
    const nombre = celdas.findIndex((c, j) => j !== apellido && /nombre|alumno|estudiante/.test(c));
    const grado = buscar(/grado|nivel|ano/);
    if (nombre >= 0 && grado !== null) {
      return {
        columnas: {
          nombre,
          apellido,
          grado,
          seccion: buscar(/secc|paralelo|grupo/),
          codigo: buscar(/codigo|carne|matricula/),
        },
        inicio: i + 1,
      };
    }
  }
  return { columnas: { nombre: 0, apellido: null, grado: 1, seccion: 2, codigo: null }, inicio: 0 };
}

function leerFilas(filas: string[][]): FilaImportPadron[] {
  const { columnas, inicio } = detectarColumnas(filas);
  const catalogo = catalogoGrados();
  const celda = (fila: string[], j: number | null) => (j === null ? '' : String(fila[j] ?? '').trim());
  return filas
    .slice(inicio)
    .filter((f) => celda(f, columnas.nombre))
    .map((f) => {
      const texto = celda(f, columnas.nombre);
      const partes =
        columnas.apellido !== null
          ? { nombre: texto, apellido: celda(f, columnas.apellido), dudosa: false }
          : separarNombreCompleto(texto);
      const gradoTexto = celda(f, columnas.grado);
      const grado = emparejarGrado(gradoTexto, catalogo);
      return {
        nombre: partes.nombre,
        apellido: partes.apellido,
        grado: grado ?? gradoTexto,
        seccion: celda(f, columnas.seccion).toUpperCase(),
        codigo: celda(f, columnas.codigo).toUpperCase() || undefined,
        gradoDesconocido: !!gradoTexto && !grado,
        separacionDudosa: partes.dudosa,
      };
    });
}

export const PadronTab: React.FC = () => {
  const [padron, setPadron] = useState<AlumnoPadron[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroGrado, setFiltroGrado] = useState('TODOS');
  const [orden, setOrden] = useState<Orden>('AZ');
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Importación
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaImportPadron[]>([]);
  const [soloRevisar, setSoloRevisar] = useState(false);
  const [reemplazar, setReemplazar] = useState(false);

  // Edición de una persona
  const [editando, setEditando] = useState<AlumnoPadron | null>(null);

  useEffect(() => {
    const cargar = () => setPadron(storageService.getPadron());
    cargar();
    return subscribeToData(cargar);
  }, []);

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

  const grados = useMemo(() => catalogoGrados(), [padron]);

  // ---------- Importación ----------
  const abrirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const crudas = XLSX.utils.sheet_to_json<string[]>(hoja, { header: 1, defval: '', raw: false });
      const leidas = leerFilas(crudas);
      if (leidas.length === 0) {
        setError('No se encontraron alumnos en la primera hoja del archivo.');
        return;
      }
      setFilas(leidas);
      setArchivo(file.name);
      setSoloRevisar(false);
    } catch {
      setError('No se pudo leer el archivo. Use un Excel (.xlsx, .xls) o CSV.');
    }
  };

  const cambiarFila = (i: number, cambio: Partial<FilaImportPadron>) =>
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const quitarFila = (i: number) => setFilas((prev) => prev.filter((_, j) => j !== i));

  const resumenImport = useMemo(() => {
    const enPadron = new Set(padron.map((p) => claveNombre(p.nombre, p.apellido)));
    const registrados = new Set(storageService.getEstudiantes().map((e) => claveNombre(e.nombre, e.apellido)));
    let yaEnPadron = 0;
    let yaRegistrados = 0;
    filas.forEach((f) => {
      const clave = claveNombre(f.nombre, f.apellido);
      if (enPadron.has(clave)) yaEnPadron++;
      if (registrados.has(clave)) yaRegistrados++;
    });
    return {
      dudosas: filas.filter((f) => f.separacionDudosa).length,
      gradoDesconocido: filas.filter((f) => f.gradoDesconocido).length,
      yaEnPadron,
      yaRegistrados,
    };
  }, [filas, padron]);

  const importar = () =>
    ejecutar(() => {
      const r = storageService.importarPadron(filas, { reemplazar });
      setFilas([]);
      setArchivo(null);
      setReemplazar(false);
      const partes = [`${r.agregados} agregado(s)`, `${r.actualizados} actualizado(s)`, `${r.sinCambios} sin cambios`];
      if (r.quitados > 0) partes.push(`${r.quitados} quitado(s)`);
      if (r.omitidos > 0) partes.push(`${r.omitidos} fila(s) repetidas o vacías omitidas`);
      avisar(`Padrón importado: ${partes.join(', ')}.`);
    });

  // ---------- Lista ----------
  const visibles = useMemo(() => {
    const palabras = normalizarTexto(busqueda).split(' ').filter(Boolean);
    const filtrados = padron.filter((p) => {
      if (filtroGrado !== 'TODOS' && (p.grado || '') !== filtroGrado) return false;
      if (palabras.length === 0) return true;
      const texto = normalizarTexto(`${p.nombre} ${p.apellido} ${p.codigo || ''} ${p.grado || ''} ${p.seccion || ''}`);
      return palabras.every((w) => texto.includes(w));
    });
    return ordenarAlfabetico(filtrados, (p) => [p.apellido, p.nombre], orden === 'ZA' ? 'ZA' : 'AZ');
  }, [padron, busqueda, filtroGrado, orden]);

  const gradosEnPadron = useMemo(
    () =>
      [...new Set(padron.map((p) => p.grado || '').filter(Boolean))].sort((a, b) => indiceGrado(a) - indiceGrado(b)),
    [padron]
  );

  const guardarEdicion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    ejecutar(() => {
      storageService.actualizarAlumnoPadron(editando.id, editando);
      setEditando(null);
      avisar('Datos del padrón actualizados.');
    });
  };

  const eliminar = (p: AlumnoPadron) => {
    if (!window.confirm(`¿Quitar a ${p.nombre} ${p.apellido} del padrón?`)) return;
    ejecutar(() => {
      storageService.eliminarDelPadron([p.id]);
      avisar('Alumno quitado del padrón.');
    });
  };

  const vaciar = () => {
    if (
      !window.confirm(
        `¿Vaciar el padrón completo (${padron.length} personas)? Los alumnos ya matriculados no se ven afectados.`
      )
    )
      return;
    ejecutar(() => {
      storageService.eliminarDelPadron(padron.map((p) => p.id));
      avisar('Padrón vaciado.');
    });
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] text-slate-900 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const botonIcono =
    'p-1.5 rounded-lg text-slate-400 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed';

  const filasPreview = filas
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !soloRevisar || f.separacionDudosa || f.gradoDesconocido);

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
          <FileSpreadsheet className="w-5 h-5 text-indigo-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold">Padrón de Alumnos</h3>
            <p className="text-[11px] text-slate-300">
              Listado del colegio para autocompletar la matrícula. No son alumnos del sistema hasta que se matriculan y
              Caja formaliza el pago.
            </p>
          </div>
        </div>

        {/* Importar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              ref={inputArchivo}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={abrirArchivo}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputArchivo.current?.click()}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Cargar Excel
            </button>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Primera hoja con columnas <strong>Nombre del alumno</strong>, <strong>Grado</strong> y{' '}
              <strong>Sección</strong> (opcional: <strong>Código</strong> y <strong>Apellidos</strong> por separado).
            </p>
          </div>

          {filas.length > 0 && (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 overflow-hidden">
              <div className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs border-b border-indigo-100 dark:border-indigo-900/50">
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-full">{archivo}</span>
                <span className="text-slate-600 dark:text-slate-300">{filas.length} alumnos</span>
                {resumenImport.dudosas > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {resumenImport.dudosas} para revisar nombres/apellidos
                  </span>
                )}
                {resumenImport.gradoDesconocido > 0 && (
                  <span className="text-rose-700 dark:text-rose-300">
                    {resumenImport.gradoDesconocido} con grado fuera del catálogo
                  </span>
                )}
                {resumenImport.yaEnPadron > 0 && (
                  <span className="text-slate-500 dark:text-slate-400">{resumenImport.yaEnPadron} ya en el padrón (se actualizan)</span>
                )}
                {resumenImport.yaRegistrados > 0 && (
                  <span className="text-slate-500 dark:text-slate-400">
                    {resumenImport.yaRegistrados} ya son alumnos registrados
                  </span>
                )}
                <label className="ml-auto flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={soloRevisar} onChange={(e) => setSoloRevisar(e.target.checked)} />
                  Solo por revisar
                </label>
              </div>

              <div className="max-h-96 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold">Nombres</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Apellidos</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Grado</th>
                      <th className="px-2 py-1.5 text-left font-semibold w-16">Sección</th>
                      <th className="px-2 py-1.5 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filasPreview.map(({ f, i }) => (
                      <tr key={i} className={f.separacionDudosa ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}>
                        <td className="px-2 py-1 min-w-36">
                          <input
                            value={f.nombre}
                            onChange={(e) => cambiarFila(i, { nombre: e.target.value, separacionDudosa: false })}
                            aria-label="Nombres"
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-1 min-w-36">
                          <div className="flex items-center gap-1">
                            <input
                              value={f.apellido}
                              onChange={(e) => cambiarFila(i, { apellido: e.target.value, separacionDudosa: false })}
                              aria-label="Apellidos"
                              className={inputClass}
                            />
                            {f.separacionDudosa && (
                              <button
                                type="button"
                                onClick={() => cambiarFila(i, { separacionDudosa: false })}
                                title="Revisado: la separación es correcta"
                                aria-label="Marcar como revisado"
                                className={`${botonIcono} text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1 min-w-28">
                          <select
                            value={f.grado}
                            onChange={(e) => cambiarFila(i, { grado: e.target.value, gradoDesconocido: false })}
                            aria-label="Grado"
                            className={`${inputClass} ${f.gradoDesconocido ? 'border-rose-400 dark:border-rose-700' : ''}`}
                          >
                            {f.gradoDesconocido && <option value={f.grado}>{f.grado} (no está en el catálogo)</option>}
                            {!f.grado && <option value="">Sin grado</option>}
                            {grados.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={f.seccion}
                            onChange={(e) => cambiarFila(i, { seccion: e.target.value.toUpperCase() })}
                            maxLength={10}
                            aria-label="Sección"
                            className={`${inputClass} uppercase`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => quitarFila(i)}
                            title="Quitar esta fila"
                            aria-label="Quitar esta fila"
                            className={`${botonIcono} hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filasPreview.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-slate-400">
                          No queda nada por revisar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 border-t border-indigo-100 dark:border-indigo-900/50">
                {resumenImport.dudosas > 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Las filas en ámbar tienen 3 palabras: confirme qué parte es nombre y cuál apellido.
                  </p>
                )}
                <label className="sm:ml-auto flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
                  Quitar del padrón a quienes no están en este archivo
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFilas([]);
                      setArchivo(null);
                    }}
                    className="flex-1 sm:flex-none px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={importar}
                    className="flex-1 sm:flex-none px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Importar {filas.length}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código"
              aria-label="Buscar en el padrón"
              className={`${inputClass} pl-8`}
            />
          </div>
          <select
            value={filtroGrado}
            onChange={(e) => setFiltroGrado(e.target.value)}
            aria-label="Filtrar por grado"
            className={`${inputClass} sm:w-40`}
          >
            <option value="TODOS">Todos los grados</option>
            {gradosEnPadron.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <OrdenSelector value={orden} onChange={setOrden} />
          <span className="sm:ml-auto text-xs text-slate-500 dark:text-slate-400 font-mono">
            {visibles.length} de {padron.length}
          </span>
          {padron.length > 0 && (
            <button
              type="button"
              onClick={vaciar}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Vaciar padrón
            </button>
          )}
        </div>

        {padron.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            El padrón está vacío. Cargue un Excel para que la matrícula autocomplete los datos de los alumnos.
          </p>
        ) : visibles.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">Ningún alumno coincide con la búsqueda.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[32rem] overflow-y-auto">
            {visibles.map((p) =>
              editando?.id === p.id ? (
                <li key={p.id} className="px-4 py-2.5">
                  <form onSubmit={guardarEdicion} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-center">
                    <input
                      value={editando.nombre}
                      onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                      placeholder="Nombres"
                      aria-label="Nombres"
                      autoFocus
                      className={`${inputClass} sm:col-span-2`}
                    />
                    <input
                      value={editando.apellido}
                      onChange={(e) => setEditando({ ...editando, apellido: e.target.value })}
                      placeholder="Apellidos"
                      aria-label="Apellidos"
                      className={`${inputClass} sm:col-span-2`}
                    />
                    <select
                      value={editando.grado || ''}
                      onChange={(e) => setEditando({ ...editando, grado: e.target.value })}
                      aria-label="Grado"
                      className={inputClass}
                    >
                      {editando.grado && !grados.includes(editando.grado) && (
                        <option value={editando.grado}>{editando.grado}</option>
                      )}
                      <option value="">Sin grado</option>
                      {grados.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <input
                      value={editando.seccion || ''}
                      onChange={(e) => setEditando({ ...editando, seccion: e.target.value })}
                      placeholder="Sección"
                      aria-label="Sección"
                      maxLength={10}
                      className={`${inputClass} uppercase`}
                    />
                    <input
                      value={editando.codigo || ''}
                      onChange={(e) => setEditando({ ...editando, codigo: e.target.value })}
                      placeholder="Código (opcional)"
                      aria-label="Código"
                      className={`${inputClass} uppercase font-mono col-span-2 sm:col-span-4`}
                    />
                    <div className="flex gap-1 col-span-2 justify-end">
                      <button
                        type="submit"
                        disabled={!editando.nombre.trim()}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditando(null)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {p.apellido}
                      {p.apellido && ', '}
                      {p.nombre}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {p.grado || 'Sin grado'}
                      {p.seccion && ` · Sección ${p.seccion}`}
                      {p.codigo && <span className="font-mono"> · {p.codigo}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setEditando(p);
                      }}
                      className={`${botonIcono} hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40`}
                      title="Editar"
                      aria-label={`Editar ${p.nombre} ${p.apellido}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(p)}
                      className={`${botonIcono} hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}
                      title="Quitar del padrón"
                      aria-label={`Quitar a ${p.nombre} ${p.apellido} del padrón`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}

        <p className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          Volver a cargar el archivo actualiza a las mismas personas (por nombre completo o código) sin duplicarlas. En
          Matrículas → Nueva matrícula, escriba el nombre o el código para completar nombres, apellidos, grado y sección.
        </p>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  Gavel,
  Printer,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { AlertaEstudiante, CorteBimestral, Grupo, Perfil } from '../../types/attendance';
import { compararTexto, esAlfabetico, ordenarAlfabetico, type Orden } from '../../utils/orden';
import { OrdenSelector } from '../../components/OrdenSelector';
import { storageService, subscribeToData } from '../../services/storage.service';
import { exportService } from '../../services/export.service';
import { cicloActual, nombreInstitucion } from '../../utils/institucion';
import { fechaLocalISO } from '../../utils/fechas';

interface Props {
  currentProfile: Perfil;
}

/** Ausencia o justificación de un alumno en una sesión cerrada */
interface Incidencia {
  fecha: string; // YYYY-MM-DD
  estatus: 'AUSENTE' | 'JUSTIFICADO';
  motivo?: string;
  extra: boolean;
}

type Vista = 'detalle' | 'bimestres';
type Rango = { desde?: string; hasta?: string };

/** Fecha local a partir de YYYY-MM-DD (sin new Date('YYYY-MM-DD'), que corre un día en UTC-6) */
const fechaLocal = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fechaChip = (iso: string) =>
  fechaLocal(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const fechaLarga = (iso: string) =>
  fechaLocal(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fechaCorta = (iso: string) =>
  fechaLocal(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const fechaNumerica = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const enRango = (fecha: string, r: Rango) => (!r.desde || fecha >= r.desde) && (!r.hasta || fecha <= r.hasta);
const claveDe = (a: { estudiante_id: string; grupo_id: string }) => `${a.estudiante_id}|${a.grupo_id}`;

const MAX_CHIPS = 4;

const selectClass =
  'text-xs rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-[#F7F8FA] dark:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] p-1.5 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] font-semibold';

/**
 * Reportes → Matriz de Asistencia. Las faltas y la indisciplina se reinician en cada corte bimestral:
 * por defecto muestra el corte vigente; también un corte concreto, todo el ciclo o un rango,
 * y una vista comparativa con una columna por bimestre.
 */
export const MatrizAsistenciaTab: React.FC<Props> = ({ currentProfile }) => {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeToData(() => setVersion((v) => v + 1)), []);

  const [selectedGrupoId, setSelectedGrupoId] = useState('TODOS');
  const [orden, setOrden] = useState<Orden>('AZ');
  const [vista, setVista] = useState<Vista>('detalle');
  const [filasAbiertas, setFilasAbiertas] = useState<Set<string>>(new Set());
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // ---- Período: "corte:<id>" | "ciclo" | "rango" (por defecto el corte vigente) ----
  const [periodo, setPeriodo] = useState<string>(() => {
    const vigente = storageService.corteVigente();
    return vigente ? `corte:${vigente.id}` : 'ciclo';
  });
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const datos = useMemo(() => {
    let grupos = storageService.getGrupos();
    if (currentProfile.rol === 'PROFESOR') grupos = grupos.filter((g) => g.profesor_id === currentProfile.id);
    return {
      grupos: ordenarAlfabetico(grupos, (g) => [g.nombre]) as Grupo[],
      cortes: storageService.getCortes(),
      vigente: storageService.corteVigente(),
      config: storageService.getConfiguracion(),
      estudiantes: storageService.getEstudiantes(),
      sesiones: storageService.getSesiones(),
      asistencias: storageService.getAsistencias(),
      anecdotario: storageService.getAnecdotario(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, currentProfile.id, currentProfile.rol]);
  const { grupos, cortes, vigente, config } = datos;

  const corteSel: CorteBimestral | undefined = periodo.startsWith('corte:')
    ? cortes.find((c) => c.id === periodo.slice(6))
    : undefined;
  const rangoInvalido = periodo === 'rango' && !!desde && !!hasta && hasta < desde;

  const rango: Rango = corteSel
    ? { desde: corteSel.fecha_inicio, hasta: corteSel.fecha_fin }
    : periodo === 'rango'
    ? { desde: desde || undefined, hasta: hasta || undefined }
    : {};

  const etiquetaPeriodo = corteSel
    ? `${corteSel.nombre} (${fechaCorta(corteSel.fecha_inicio)} – ${fechaCorta(corteSel.fecha_fin)})`
    : periodo === 'rango'
    ? `${desde ? fechaCorta(desde) : 'Inicio'} – ${hasta ? fechaCorta(hasta) : 'hoy'}`
    : 'Todo el ciclo';

  // Si el corte elegido desaparece (se eliminó), volver al vigente
  useEffect(() => {
    if (periodo.startsWith('corte:') && !corteSel) setPeriodo(vigente ? `corte:${vigente.id}` : 'ciclo');
  }, [periodo, corteSel, vigente]);

  const idsVisibles = useMemo(() => new Set(grupos.map((g) => g.id)), [grupos]);
  const visible = (a: AlertaEstudiante) =>
    idsVisibles.has(a.grupo_id) && (selectedGrupoId === 'TODOS' || a.grupo_id === selectedGrupoId);
  const estudiantePorId = useMemo(() => new Map(datos.estudiantes.map((e) => [e.id, e])), [datos.estudiantes]);

  const ordenar = <T extends { estudiante_id: string; estudiante_nombre: string; grupo_nombre: string }>(
    lista: T[],
    faltas: (x: T) => number
  ) => {
    if (!esAlfabetico(orden)) {
      return [...lista].sort((a, b) => faltas(b) - faltas(a) || compararTexto(a.estudiante_nombre, b.estudiante_nombre));
    }
    return ordenarAlfabetico(
      lista,
      (a) => {
        const e = estudiantePorId.get(a.estudiante_id);
        return [e?.apellido ?? a.estudiante_nombre, e?.nombre ?? '', a.grupo_nombre];
      },
      orden
    );
  };

  // ---- Vista Detalle ----
  const alertas = useMemo(() => {
    if (rangoInvalido) return [];
    // Solo filas con actividad en el período (sesiones cerradas o anotaciones de indisciplina)
    const base = storageService
      .calcularAlertasEstudiantes(undefined, rango)
      .filter((a) => visible(a) && (a.sesiones_cerradas > 0 || a.total_indisciplina > 0));
    return ordenar(base, (a) => a.total_ausencias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, rango.desde, rango.hasta, rangoInvalido, selectedGrupoId, idsVisibles, orden, estudiantePorId]);

  /** Fechas de ausencia y justificación por alumno y taller, solo sesiones cerradas del período */
  const incidenciasPorFila = useMemo(() => {
    const sesionPorId = new Map(
      datos.sesiones.filter((s) => s.cerrada && enRango(s.fecha, rango)).map((s) => [s.id, s])
    );
    const mapa = new Map<string, Incidencia[]>();
    datos.asistencias.forEach((a) => {
      if (a.estatus !== 'AUSENTE' && a.estatus !== 'JUSTIFICADO') return;
      const s = sesionPorId.get(a.sesion_id);
      if (!s) return;
      const clave = `${a.estudiante_id}|${s.grupo_id}`;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push({
        fecha: s.fecha,
        estatus: a.estatus,
        motivo: a.motivo_justificacion || undefined,
        extra: !!s.extraordinaria,
      });
    });
    mapa.forEach((lista) => lista.sort((x, y) => x.fecha.localeCompare(y.fecha)));
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.sesiones, datos.asistencias, rango.desde, rango.hasta]);

  /** Fechas de las anotaciones de indisciplina por alumno y taller dentro del período */
  const indisciplinaPorFila = useMemo(() => {
    const mapa = new Map<string, string[]>();
    datos.anecdotario.forEach((n) => {
      if (n.tipo !== 'INDISCIPLINA' || !n.grupo_id) return;
      const fecha = fechaLocalISO(new Date(n.creado_en));
      if (!enRango(fecha, rango)) return;
      const clave = `${n.estudiante_id}|${n.grupo_id}`;
      mapa.set(clave, [...(mapa.get(clave) ?? []), fecha].sort());
    });
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.anecdotario, rango.desde, rango.hasta]);

  const incidenciasDe = (a: AlertaEstudiante) => incidenciasPorFila.get(claveDe(a)) || [];

  const alternarFila = (clave: string) =>
    setFilasAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });

  /** Texto plano para la vista de impresión: "A: 12/11, 19/11 · J: 26/11" */
  const textoIncidencias = (lista: Incidencia[]) => {
    const aus = lista.filter((i) => i.estatus === 'AUSENTE').map((i) => fechaNumerica(i.fecha));
    const jus = lista.filter((i) => i.estatus === 'JUSTIFICADO').map((i) => fechaNumerica(i.fecha));
    return [aus.length ? `A: ${aus.join(', ')}` : '', jus.length ? `J: ${jus.join(', ')}` : '']
      .filter(Boolean)
      .join(' · ') || '—';
  };

  const stats = useMemo(() => {
    const criticas = alertas.filter((a) => a.nivel_alerta === 'CRITICA').length;
    const advertencias = alertas.filter((a) => a.nivel_alerta === 'ADVERTENCIA').length;
    const conIndisciplina = alertas.filter((a) => a.total_indisciplina > 0).length;
    const totalIndisciplina = alertas.reduce((s, a) => s + a.total_indisciplina, 0);
    let presentes = 0;
    let ausencias = 0;
    alertas.forEach((a) => {
      presentes += a.total_asistencias;
      ausencias += a.total_ausencias;
    });
    const registros = presentes + ausencias;
    return {
      criticas,
      advertencias,
      regulares: alertas.length - criticas - advertencias,
      conIndisciplina,
      totalIndisciplina,
      tasa: registros > 0 ? Math.round((presentes / registros) * 100) : null,
    };
  }, [alertas]);

  // ---- Vista Por bimestres ----
  const columnasCortes = useMemo(() => {
    if (periodo === 'ciclo') return cortes;
    const anio = (corteSel?.fecha_inicio || desde || vigente?.fecha_inicio || fechaLocalISO()).slice(0, 4);
    const delAnio = cortes.filter((c) => c.fecha_inicio.slice(0, 4) === anio);
    return delAnio.length > 0 ? delAnio : cortes;
  }, [periodo, cortes, corteSel, desde, vigente]);

  const comparativo = useMemo(() => {
    const porCorte = columnasCortes.map((c) => {
      const mapa = new Map<string, AlertaEstudiante>();
      storageService
        .calcularAlertasEstudiantes(undefined, { desde: c.fecha_inicio, hasta: c.fecha_fin })
        .forEach((a) => visible(a) && mapa.set(claveDe(a), a));
      return { corte: c, mapa };
    });
    // Filas: alumnos inscritos en los talleres visibles (la inscripción actual define la fila)
    const filasBase = new Map<string, AlertaEstudiante>();
    porCorte.forEach(({ mapa }) => mapa.forEach((a, k) => filasBase.has(k) || filasBase.set(k, a)));
    const totalFaltas = (a: AlertaEstudiante) =>
      porCorte.reduce((s, { mapa }) => s + (mapa.get(claveDe(a))?.total_ausencias ?? 0), 0);
    return { porCorte, filas: ordenar([...filasBase.values()], totalFaltas) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, columnasCortes, selectedGrupoId, idsVisibles, orden, estudiantePorId]);

  const nivelCelda = (a?: AlertaEstudiante) => {
    if (!a || (a.sesiones_cerradas === 0 && a.total_indisciplina === 0)) return 'vacia';
    return a.nivel_alerta;
  };

  const handleExportExcel = () => {
    if (rangoInvalido) return;
    exportService.exportConsolidatedExcel(
      selectedGrupoId,
      grupos.map((g) => g.id),
      { desde: rango.desde, hasta: rango.hasta, etiqueta: etiquetaPeriodo }
    );
  };

  const nombreTaller =
    selectedGrupoId === 'TODOS' ? 'Todos los talleres' : grupos.find((g) => g.id === selectedGrupoId)?.nombre ?? '';

  return (
    <>
      {/* ---------- Vista imprimible ---------- */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs p-2 sm:p-8 flex justify-center animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-4 sm:p-8 space-y-4 sm:space-y-6 print:p-0 print:shadow-none border border-slate-200 h-fit">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
              <span className="text-xs font-bold text-slate-500 uppercase">Vista Previa de Impresión Oficial</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-[#4F46E5] text-white text-xs font-bold rounded-lg shadow hover:bg-[#4338CA] transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Guardar como PDF</span>
                </button>
                <button
                  onClick={() => setShowPrintPreview(false)}
                  className="px-3 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                  {vista === 'detalle' ? 'Informe Oficial de Asistencia' : 'Comparativo de Asistencia por Bimestre'}
                </span>
                <h2 className="text-xl font-extrabold text-slate-900">{nombreInstitucion().toUpperCase()}</h2>
                <p className="text-xs text-slate-500">
                  {vista === 'detalle' ? etiquetaPeriodo : `Bimestres: ${columnasCortes.map((c) => c.nombre).join(', ')}`} •{' '}
                  {nombreTaller} • {cicloActual()}
                </p>
              </div>
              <div className="text-right text-xs font-mono text-slate-500">
                <p>Fecha de emisión: {new Date().toLocaleDateString('es-ES')}</p>
                <p>
                  Generado por: {currentProfile.nombre} {currentProfile.apellido}
                </p>
              </div>
            </div>

            {vista === 'detalle' ? (
              <table className="w-full text-left text-xs border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="p-2.5">Estudiante</th>
                    <th className="p-2.5">Matrícula</th>
                    <th className="p-2.5">Taller</th>
                    <th className="p-2.5 text-center">Faltas</th>
                    <th className="p-2.5 text-center">% Inasistencia</th>
                    <th className="p-2.5 text-center">Indisciplina</th>
                    <th className="p-2.5">Fechas (A / J)</th>
                    <th className="p-2.5 text-right">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {alertas.map((a) => (
                    <tr key={claveDe(a)}>
                      <td className="p-2.5 font-bold">{a.estudiante_nombre}</td>
                      <td className="p-2.5 font-mono">{a.matricula}</td>
                      <td className="p-2.5">{a.grupo_nombre}</td>
                      <td className="p-2.5 text-center font-bold text-rose-600">
                        {a.total_ausencias} / {a.sesiones_cerradas}
                      </td>
                      <td className="p-2.5 text-center font-mono">{a.porcentaje_inasistencia}%</td>
                      <td className="p-2.5 text-center font-bold">{a.total_indisciplina}</td>
                      <td className="p-2.5 font-mono text-[11px]">{textoIncidencias(incidenciasDe(a))}</td>
                      <td className="p-2.5 text-right font-bold">
                        {a.nivel_alerta === 'CRITICA' ? 'ALERTA CRÍTICA' : a.nivel_alerta === 'ADVERTENCIA' ? 'ADVERTENCIA' : 'REGULAR'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-xs border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="p-2">Estudiante</th>
                    <th className="p-2">Taller</th>
                    {comparativo.porCorte.map(({ corte }) => (
                      <th key={corte.id} className="p-2 text-center">
                        {corte.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {comparativo.filas.map((f) => (
                    <tr key={claveDe(f)}>
                      <td className="p-2 font-bold">{f.estudiante_nombre}</td>
                      <td className="p-2">{f.grupo_nombre}</td>
                      {comparativo.porCorte.map(({ corte, mapa }) => {
                        const a = mapa.get(claveDe(f));
                        return (
                          <td key={corte.id} className="p-2 text-center font-mono text-[11px]">
                            {nivelCelda(a) === 'vacia' || !a
                              ? '—'
                              : `${a.total_ausencias}/${a.sesiones_cerradas} F · ${a.total_indisciplina} I${
                                  a.nivel_alerta === 'CRITICA' ? ' · CRÍT.' : a.nivel_alerta === 'ADVERTENCIA' ? ' · ADV.' : ''
                                }`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
              Las faltas y la indisciplina se cuentan por corte bimestral. Documento expedido para fines académicos y de
              seguimiento tutorial.
            </div>
          </div>
        </div>
      )}

      {/* ---------- Filtros ---------- */}
      <div className="bg-white dark:bg-[#1B222D] rounded-xl p-3.5 shadow-xs border border-[#E7EAF0] dark:border-[#2B3442] space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-[#667085] dark:text-[#94A3B8]" />
          <label className="sr-only" htmlFor="matriz-periodo">
            Período
          </label>
          <select id="matriz-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={selectClass}>
            {cortes.map((c) => (
              <option key={c.id} value={`corte:${c.id}`}>
                {c.nombre} · {fechaCorta(c.fecha_inicio)} – {fechaCorta(c.fecha_fin)}
                {vigente?.id === c.id ? ' (actual)' : ''}
              </option>
            ))}
            <option value="ciclo">Todo el ciclo</option>
            <option value="rango">Rango personalizado…</option>
          </select>

          <label className="sr-only" htmlFor="matriz-taller">
            Taller
          </label>
          <select
            id="matriz-taller"
            value={selectedGrupoId}
            onChange={(e) => setSelectedGrupoId(e.target.value)}
            className={selectClass}
          >
            <option value="TODOS">Todos los talleres ({grupos.length})</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>

          <OrdenSelector value={orden} onChange={setOrden} extra={[{ value: 'FALTAS', label: 'Más faltas' }]} />

          <div className="inline-flex p-0.5 bg-slate-100 dark:bg-[#151A22] rounded-lg text-xs" role="group" aria-label="Vista">
            {(
              [
                ['detalle', 'Detalle'],
                ['bimestres', 'Por bimestres'],
              ] as [Vista, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVista(id)}
                aria-pressed={vista === id}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                  vista === id
                    ? 'bg-white dark:bg-[#1B222D] text-[#4F46E5] dark:text-[#818CF8] shadow-2xs'
                    : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F1F5F9]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowPrintPreview(true)}
              disabled={rangoInvalido}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1B222D] hover:bg-slate-50 dark:hover:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] text-xs font-semibold border border-[#E7EAF0] dark:border-[#2B3442] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
              <span className="hidden sm:inline">Imprimible / PDF</span>
            </button>
            <button
              onClick={handleExportExcel}
              disabled={rangoInvalido}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Exportar el período seleccionado a Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>
        </div>

        {periodo === 'rango' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-[#667085] dark:text-[#94A3B8]">Desde</span>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={selectClass} />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-[#667085] dark:text-[#94A3B8]">Hasta</span>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={selectClass} />
            </label>
            {rangoInvalido && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">"Hasta" es anterior a "Desde".</span>
            )}
          </div>
        )}

        <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] flex items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" />
          <span>
            {vista === 'detalle' ? (
              <>
                <strong className="text-[#172033] dark:text-[#F1F5F9]">{etiquetaPeriodo}</strong> · {alertas.length}{' '}
                {alertas.length === 1 ? 'registro' : 'registros'}. Las faltas y la indisciplina se reinician en cada
                corte bimestral; solo cuentan las sesiones cerradas.
              </>
            ) : (
              <>
                Una columna por bimestre ({columnasCortes.length}). Cada celda: faltas / sesiones cerradas (F) e
                indisciplina (I) de ese bimestre.
              </>
            )}
          </span>
        </p>
      </div>

      {cortes.length === 0 && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>No hay cortes registrados: los contadores no se reinician. Créalos en Configuración → Cortes.</span>
        </div>
      )}

      {vista === 'detalle' ? (
        <>
          {/* ---------- KPIs del período ---------- */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <Kpi
              titulo="Índice de asistencia"
              valor={stats.tasa === null ? '—' : `${stats.tasa}%`}
              detalle="Del período seleccionado"
              icono={<TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            />
            <Kpi
              titulo={`Alertas críticas (${config.limite_ausencias_alerta}+ faltas)`}
              valor={stats.criticas}
              detalle="Alto riesgo en el período"
              tono="rose"
              icono={<ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
            />
            <Kpi
              titulo="Advertencias"
              valor={stats.advertencias}
              detalle="2 faltas o 15% de inasistencia"
              tono="amber"
              icono={<AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
            />
            <Kpi
              titulo="Asistencia regular"
              valor={stats.regulares}
              detalle="Sin riesgo en el período"
              tono="emerald"
              icono={<CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            />
            <Kpi
              titulo="Con indisciplina"
              valor={stats.conIndisciplina}
              detalle={`${stats.totalIndisciplina} ${stats.totalIndisciplina === 1 ? 'anotación' : 'anotaciones'} en el período`}
              tono="violet"
              icono={<Gavel className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
            />
          </div>

          {/* ---------- Tabla Detalle ---------- */}
          <div className="bg-white dark:bg-[#1B222D] rounded-xl shadow-xs border border-[#E7EAF0] dark:border-[#2B3442] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F8FA] dark:bg-[#151A22] border-b border-[#E7EAF0] dark:border-[#2B3442] text-[11px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider">
                    <th className="py-3.5 px-5">Estudiante / Matrícula</th>
                    <th className="py-3.5 px-4">Taller</th>
                    <th className="py-3.5 px-4 text-center">Faltas</th>
                    <th className="py-3.5 px-4 text-center">% Inasistencia</th>
                    <th className="py-3.5 px-4 text-center">Indisciplina</th>
                    <th className="py-3.5 px-4 min-w-[220px]">Fechas de inasistencia</th>
                    <th className="py-3.5 px-5 text-right">Estatus de alerta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442] text-xs">
                  {alertas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 px-4 text-center text-[#667085] dark:text-[#94A3B8]">
                        {rangoInvalido
                          ? 'Corrige el rango de fechas.'
                          : 'No hay sesiones cerradas ni anotaciones de indisciplina en este período para los talleres seleccionados.'}
                      </td>
                    </tr>
                  ) : (
                    alertas.map((item) => {
                      const clave = claveDe(item);
                      const incidencias = incidenciasDe(item);
                      const abierta = filasAbiertas.has(clave);
                      const ausencias = incidencias.filter((i) => i.estatus === 'AUSENTE').length;
                      const justificaciones = incidencias.length - ausencias;
                      const fechasIndisciplina = indisciplinaPorFila.get(clave) ?? [];
                      return (
                        <React.Fragment key={clave}>
                          <tr
                            onClick={incidencias.length > 0 ? () => alternarFila(clave) : undefined}
                            className={`hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70 transition-colors ${
                              incidencias.length > 0 ? 'cursor-pointer' : ''
                            } ${abierta ? 'bg-slate-50/70 dark:bg-[#151A22]/70' : ''}`}
                            aria-expanded={incidencias.length > 0 ? abierta : undefined}
                          >
                            <td className="py-3.5 px-5">
                              <div className="flex items-start gap-1.5">
                                <span className="w-3.5 mt-0.5 shrink-0 text-[#667085] dark:text-[#94A3B8]">
                                  {incidencias.length > 0 &&
                                    (abierta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
                                </span>
                                <div>
                                  <div className="font-semibold text-[#172033] dark:text-[#F1F5F9]">{item.estudiante_nombre}</div>
                                  <span className="text-[11px] font-mono text-[#667085] dark:text-[#94A3B8]">{item.matricula}</span>
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-4 font-medium text-[#172033] dark:text-[#F1F5F9]">{item.grupo_nombre}</td>

                            <td className="py-3.5 px-4 text-center font-mono font-bold tabular-nums">
                              <span
                                className={
                                  item.total_ausencias >= config.limite_ausencias_alerta
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : item.total_ausencias > 0
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }
                              >
                                {item.total_ausencias}
                              </span>
                              <span className="text-slate-400 text-[11px]"> / {item.sesiones_cerradas} sesiones</span>
                              {item.total_justificadas > 0 && (
                                <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                  {item.total_justificadas} justif.
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-center font-mono tabular-nums">
                              <div className="inline-flex items-center gap-1.5">
                                <div className="w-16 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      item.porcentaje_inasistencia >= config.porcentaje_inasistencia_alerta
                                        ? 'bg-rose-500'
                                        : item.porcentaje_inasistencia > 0
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(item.porcentaje_inasistencia, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-bold text-[#172033] dark:text-[#F1F5F9]">
                                  {item.porcentaje_inasistencia}%
                                </span>
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              {item.total_indisciplina > 0 ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-900"
                                  title={`Indisciplina: ${fechasIndisciplina.map(fechaLarga).join(' · ')}`}
                                >
                                  <Gavel className="w-3 h-3" />
                                  {item.total_indisciplina}
                                </span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>

                            {/* Fechas de ausencia (A) y justificación (J) */}
                            <td className="py-3 px-4">
                              {incidencias.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div className="flex flex-wrap items-center gap-1">
                                  {incidencias.slice(0, abierta ? 0 : MAX_CHIPS).map((inc) => (
                                    <span
                                      key={inc.fecha}
                                      title={
                                        inc.estatus === 'JUSTIFICADO'
                                          ? `Justificada: ${fechaLarga(inc.fecha)}${inc.motivo ? ` · Motivo: ${inc.motivo}` : ''}`
                                          : `Ausente: ${fechaLarga(inc.fecha)}`
                                      }
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap capitalize ${
                                        inc.estatus === 'AUSENTE'
                                          ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900'
                                          : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                                      }`}
                                    >
                                      <span className="font-bold">{inc.estatus === 'AUSENTE' ? 'A' : 'J'}</span>
                                      {fechaChip(inc.fecha)}
                                      {inc.extra && <span className="text-violet-600 dark:text-violet-400 normal-case">·Extra</span>}
                                    </span>
                                  ))}
                                  {!abierta && incidencias.length > MAX_CHIPS && (
                                    <span className="text-[10px] font-semibold text-[#4F46E5] dark:text-[#818CF8]">
                                      +{incidencias.length - MAX_CHIPS} más
                                    </span>
                                  )}
                                  {abierta && (
                                    <span className="text-[10px] font-semibold text-[#4F46E5] dark:text-[#818CF8]">
                                      Ver detalle abajo
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-5 text-right">
                              <NivelBadge alerta={item} />
                            </td>
                          </tr>

                          {abierta && incidencias.length > 0 && (
                            <tr className="bg-[#F7F8FA]/70 dark:bg-[#151A22]/60">
                              <td colSpan={7} className="px-5 sm:pl-12 py-3">
                                <p className="text-[11px] font-semibold text-[#667085] dark:text-[#94A3B8] mb-2">
                                  <span className="text-rose-600 dark:text-rose-400">
                                    {ausencias} {ausencias === 1 ? 'ausencia' : 'ausencias'}
                                  </span>
                                  {' · '}
                                  <span className="text-amber-600 dark:text-amber-400">
                                    {justificaciones} {justificaciones === 1 ? 'justificación' : 'justificaciones'}
                                  </span>
                                  <span className="font-normal"> · solo sesiones cerradas del período</span>
                                </p>
                                <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                                  {incidencias.map((inc) => (
                                    <li
                                      key={inc.fecha}
                                      className="flex items-start gap-2 p-2 rounded-lg bg-white dark:bg-[#1B222D] border border-[#E7EAF0] dark:border-[#2B3442]"
                                    >
                                      <span
                                        className={`shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white ${
                                          inc.estatus === 'AUSENTE' ? 'bg-rose-600' : 'bg-amber-600'
                                        }`}
                                      >
                                        {inc.estatus === 'AUSENTE' ? 'A' : 'J'}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-[#172033] dark:text-[#F1F5F9] capitalize">
                                          {fechaLarga(inc.fecha)}
                                          {inc.extra && (
                                            <span className="ml-1.5 normal-case text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300">
                                              Extra
                                            </span>
                                          )}
                                        </p>
                                        <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                                          {inc.estatus === 'AUSENTE'
                                            ? 'Ausente'
                                            : `Justificada${inc.motivo ? `: ${inc.motivo}` : ' (sin motivo registrado)'}`}
                                        </p>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* ---------- Vista Por bimestres ---------- */
        <div className="bg-white dark:bg-[#1B222D] rounded-xl shadow-xs border border-[#E7EAF0] dark:border-[#2B3442] overflow-hidden">
          {columnasCortes.length === 0 ? (
            <p className="py-12 px-4 text-center text-xs text-[#667085] dark:text-[#94A3B8]">
              No hay cortes registrados para comparar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F7F8FA] dark:bg-[#151A22] border-b border-[#E7EAF0] dark:border-[#2B3442] text-[11px] font-bold text-[#667085] dark:text-[#94A3B8]">
                    <th className="py-3 px-4 uppercase tracking-wider sticky left-0 bg-[#F7F8FA] dark:bg-[#151A22] min-w-[180px]">
                      Estudiante / Taller
                    </th>
                    {comparativo.porCorte.map(({ corte }) => (
                      <th
                        key={corte.id}
                        className={`py-3 px-3 text-center min-w-[104px] ${
                          vigente?.id === corte.id ? 'text-[#4F46E5] dark:text-[#818CF8]' : ''
                        }`}
                      >
                        <span className="block">{corte.nombre}</span>
                        <span className="block font-normal text-[10px] normal-case">
                          {fechaNumerica(corte.fecha_inicio)} – {fechaNumerica(corte.fecha_fin)}
                          {vigente?.id === corte.id ? ' · actual' : ''}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
                  {comparativo.filas.length === 0 ? (
                    <tr>
                      <td colSpan={comparativo.porCorte.length + 1} className="py-12 text-center text-[#667085] dark:text-[#94A3B8]">
                        No hay alumnos inscritos en los talleres seleccionados.
                      </td>
                    </tr>
                  ) : (
                    comparativo.filas.map((f) => (
                      <tr key={claveDe(f)} className="hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70">
                        <td className="py-2.5 px-4 sticky left-0 bg-white dark:bg-[#1B222D]">
                          <div className="font-semibold text-[#172033] dark:text-[#F1F5F9]">{f.estudiante_nombre}</div>
                          <div className="text-[11px] text-[#667085] dark:text-[#94A3B8]">{f.grupo_nombre}</div>
                        </td>
                        {comparativo.porCorte.map(({ corte, mapa }) => {
                          const a = mapa.get(claveDe(f));
                          const nivel = nivelCelda(a);
                          return (
                            <td key={corte.id} className="py-2 px-2 text-center">
                              {nivel === 'vacia' || !a ? (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              ) : (
                                <div
                                  className={`inline-flex flex-col items-center px-2 py-1 rounded-lg border min-w-[80px] ${
                                    nivel === 'CRITICA'
                                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
                                      : nivel === 'ADVERTENCIA'
                                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
                                      : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                                  }`}
                                  title={`${corte.nombre}: ${a.total_ausencias} faltas de ${a.sesiones_cerradas} sesiones cerradas (${a.porcentaje_inasistencia}%), ${a.total_justificadas} justificadas, ${a.total_indisciplina} de indisciplina`}
                                >
                                  <span className="font-mono font-bold tabular-nums">
                                    {a.total_ausencias}/{a.sesiones_cerradas}
                                    {a.total_justificadas > 0 && (
                                      <span className="font-normal text-[10px]"> +{a.total_justificadas}J</span>
                                    )}
                                  </span>
                                  {a.total_indisciplina > 0 && (
                                    <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 inline-flex items-center gap-0.5">
                                      <Gavel className="w-2.5 h-2.5" />
                                      {a.total_indisciplina}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-[#E7EAF0] dark:border-[#2B3442] flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#667085] dark:text-[#94A3B8]">
            <span>
              <strong>F/S</strong> faltas / sesiones cerradas
            </span>
            <span>
              <strong>+J</strong> justificadas
            </span>
            <span className="inline-flex items-center gap-1">
              <Gavel className="w-3 h-3 text-violet-500" /> indisciplina
            </span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">Crítica</span>
            <span className="text-amber-600 dark:text-amber-400 font-semibold">Advertencia</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Regular</span>
            <span>— sin sesiones cerradas ni anotaciones</span>
          </div>
        </div>
      )}
    </>
  );
};

const TONOS = {
  neutro: { borde: 'border-[#E7EAF0] dark:border-[#2B3442]', texto: 'text-[#172033] dark:text-[#F1F5F9]', titulo: 'text-[#667085] dark:text-[#94A3B8]' },
  rose: { borde: 'border-rose-200 dark:border-rose-900/50', texto: 'text-rose-700 dark:text-rose-400', titulo: 'text-rose-700 dark:text-rose-400' },
  amber: { borde: 'border-amber-200 dark:border-amber-900/50', texto: 'text-amber-700 dark:text-amber-400', titulo: 'text-amber-700 dark:text-amber-400' },
  emerald: { borde: 'border-emerald-200 dark:border-emerald-900/50', texto: 'text-emerald-700 dark:text-emerald-400', titulo: 'text-emerald-700 dark:text-emerald-400' },
  violet: { borde: 'border-violet-200 dark:border-violet-900/50', texto: 'text-violet-700 dark:text-violet-400', titulo: 'text-violet-700 dark:text-violet-400' },
};

const Kpi: React.FC<{
  titulo: string;
  valor: React.ReactNode;
  detalle: string;
  icono: React.ReactNode;
  tono?: keyof typeof TONOS;
}> = ({ titulo, valor, detalle, icono, tono = 'neutro' }) => {
  const t = TONOS[tono];
  return (
    <div className={`bg-white dark:bg-[#1B222D] p-3 sm:p-4 rounded-xl border shadow-xs ${t.borde}`}>
      <span className={`text-[10px] font-bold uppercase tracking-wider block ${t.titulo}`}>{titulo}</span>
      <div className="flex items-baseline gap-2 mt-1.5">
        <span className={`text-xl sm:text-2xl font-bold tabular-nums ${t.texto}`}>{valor}</span>
        {icono}
      </div>
      <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-1 block">{detalle}</span>
    </div>
  );
};

const NivelBadge: React.FC<{ alerta: AlertaEstudiante }> = ({ alerta }) =>
  alerta.nivel_alerta === 'CRITICA' ? (
    <span className="bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1">
      <AlertTriangle className="w-3 h-3 text-rose-500" />
      <span>Crítica ({alerta.total_ausencias} faltas)</span>
    </span>
  ) : alerta.nivel_alerta === 'ADVERTENCIA' ? (
    <span className="bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1">
      <AlertTriangle className="w-3 h-3 text-amber-500" />
      <span>Advertencia</span>
    </span>
  ) : (
    <span className="text-emerald-700 dark:text-emerald-400 text-xs font-semibold">Regular</span>
  );

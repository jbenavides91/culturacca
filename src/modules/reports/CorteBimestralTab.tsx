import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Receipt,
  Users,
  Wallet,
} from 'lucide-react';
import { CorteBimestral, EstadoMesCorte, MovimientoInscripcion, Perfil } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { exportService } from '../../services/export.service';
import { formatearMonto } from '../../utils/arancel';
import { fechaLocalISO } from '../../utils/fechas';
import { esAlfabetico, ordenarAlfabetico, type Orden } from '../../utils/orden';
import { OrdenSelector } from '../../components/OrdenSelector';

interface Props {
  currentProfile: Perfil;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const etiquetaMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;

/** "12 nov 2026" a partir de YYYY-MM-DD (fecha local) */
const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

const TIPOS_MOV: Record<MovimientoInscripcion['tipo'], { texto: string; clase: string }> = {
  ALTA_TALLER: { texto: 'Alta en taller', clase: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  REACTIVACION_ALUMNO: { texto: 'Reincorporación', clase: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  BAJA_TALLER: { texto: 'Baja del taller', clase: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  BAJA_ALUMNO: { texto: 'Baja del alumno', clase: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
};

const CHIP_MES: Record<EstadoMesCorte, { texto: string; clase: string; titulo: string }> = {
  COBRABLE: {
    texto: '✓',
    clase: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    titulo: 'Se cobra la mensualidad',
  },
  MATRICULA: {
    texto: 'M',
    clase: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900',
    titulo: 'Cubierto por la matrícula',
  },
  INACTIVO: {
    texto: '—',
    clase: 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900/40 dark:text-slate-500 dark:border-slate-800',
    titulo: 'No estuvo inscrito',
  },
};

const card = 'bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs';

export const CorteBimestralTab: React.FC<Props> = ({ currentProfile }) => {
  const [cortes, setCortes] = useState<CorteBimestral[]>([]);
  const [corteId, setCorteId] = useState('');
  const [version, setVersion] = useState(0);
  const [ordenTalleres, setOrdenTalleres] = useState<Orden>('AZ');
  const [ordenMov, setOrdenMov] = useState<Orden>('AZ');
  const [ordenMat, setOrdenMat] = useState<Orden>('AZ');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  useEffect(() => {
    const cargar = () => {
      setCortes(storageService.getCortes());
      setVersion((v) => v + 1);
    };
    cargar();
    return subscribeToData(cargar);
  }, []);

  // Por defecto: el corte que contiene hoy; si no hay, el más reciente que ya empezó; si no, el primero
  const hoy = fechaLocalISO();
  const corteSeleccionado = useMemo(() => {
    if (corteId && cortes.some((c) => c.id === corteId)) return corteId;
    const actual = cortes.find((c) => c.fecha_inicio <= hoy && hoy <= c.fecha_fin);
    const pasados = cortes.filter((c) => c.fecha_inicio <= hoy);
    return (actual ?? pasados[pasados.length - 1] ?? cortes[0])?.id ?? '';
  }, [cortes, corteId, hoy]);

  const datos = useMemo(
    () => (corteSeleccionado ? storageService.calcularCorteBimestral(corteSeleccionado) : null),
    // version cambia con cada notificación de datos: fuerza el recálculo
    [corteSeleccionado, version]
  );

  const talleres = useMemo(() => {
    if (!datos) return [];
    const lista = datos.talleres.filter((t) => t.alumnos > 0 || !t.eliminado);
    return esAlfabetico(ordenTalleres)
      ? ordenarAlfabetico(lista, (t) => [t.grupo_nombre], ordenTalleres)
      : [...lista].sort((a, b) => b.cobroEsperado - a.cobroEsperado || a.grupo_nombre.localeCompare(b.grupo_nombre, 'es'));
  }, [datos, ordenTalleres]);

  const movimientos = useMemo(() => {
    if (!datos) return [];
    const lista = [...datos.altas, ...datos.bajas];
    return esAlfabetico(ordenMov)
      ? ordenarAlfabetico(lista, (m) => [m.estudiante_nombre, m.grupo_nombre], ordenMov)
      : lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.creado_en).localeCompare(String(a.creado_en)));
  }, [datos, ordenMov]);

  const matriculas = useMemo(() => {
    if (!datos) return [];
    return esAlfabetico(ordenMat)
      ? ordenarAlfabetico(datos.matriculas, (m) => [m.alumno], ordenMat)
      : [...datos.matriculas].sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago));
  }, [datos, ordenMat]);

  const alternar = (grupoId: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(grupoId)) s.delete(grupoId);
      else s.add(grupoId);
      return s;
    });

  if (cortes.length === 0) {
    return (
      <div className={`${card} p-6 sm:p-10 text-center space-y-2`}>
        <CalendarRange className="w-8 h-8 mx-auto text-slate-400" />
        <p className="text-sm font-semibold text-[#172033] dark:text-[#F1F5F9]">No hay cortes bimestrales definidos</p>
        <p className="text-xs text-[#667085] dark:text-[#94A3B8]">
          {currentProfile.rol === 'ADMIN'
            ? 'Créalos en Configuración → Cortes (puedes generar los 6 bimestres del año de un clic).'
            : 'La Dirección debe crearlos en Configuración → Cortes.'}
        </p>
      </div>
    );
  }

  if (!datos) return null;
  const { resumen, meses, corte } = datos;

  const kpis = [
    {
      icono: Wallet,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
      titulo: 'Cobro esperado',
      valor: formatearMonto(resumen.cobroEsperado),
      nota: `${resumen.mesesCobrables} mensualidad(es) · ${resumen.mesesMatricula} cubierta(s) por matrícula`,
    },
    {
      icono: Users,
      color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
      titulo: 'Alumnos activos',
      valor: String(resumen.alumnosActivos),
      nota: `en ${resumen.talleres} taller(es)`,
    },
    {
      icono: Receipt,
      color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40',
      titulo: 'Matrículas cobradas',
      valor: String(resumen.matriculasCobradas),
      nota: formatearMonto(resumen.montoMatriculas),
    },
    {
      icono: ArrowUpRight,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
      titulo: 'Altas / Bajas',
      valor: `${resumen.altas} / ${resumen.bajas}`,
      nota: 'movimientos del periodo',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Selector de corte y exportación */}
      <div className={`${card} p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3`}>
        <div className="flex items-center gap-2 min-w-0">
          <CalendarRange className="w-4 h-4 text-[#4F46E5] shrink-0" />
          <select
            value={corteSeleccionado}
            onChange={(e) => {
              setCorteId(e.target.value);
              setAbiertos(new Set());
            }}
            aria-label="Corte bimestral"
            className="min-w-0 px-2.5 py-1.5 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg text-xs font-semibold text-[#172033] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#4F46E5] cursor-pointer"
          >
            {cortes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.fecha_inicio <= hoy && hoy <= c.fecha_fin ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] sm:text-xs text-[#667085] dark:text-[#94A3B8]">
          {fechaCorta(corte.fecha_inicio)} – {fechaCorta(corte.fecha_fin)} · Meses: {meses.map(etiquetaMes).join(', ')}
        </p>
        <button
          type="button"
          onClick={() => exportService.exportCorteBimestral(datos)}
          className="sm:ml-auto px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Exportar corte (.xlsx)
        </button>
      </div>

      {datos.arancelPorCiclo && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 rounded-xl text-amber-900 dark:text-amber-200 text-[11px] sm:text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            El arancel está configurado "por ciclo" (Configuración → Reglas y Parámetros). Este reporte lo trata como
            mensualidad.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((k) => (
          <div key={k.titulo} className={`${card} p-3 sm:p-4 flex items-start gap-3`}>
            <span className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${k.color}`}>
              <k.icono className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] font-semibold">{k.titulo}</p>
              <p className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F1F5F9] tabular-nums truncate">
                {k.valor}
              </p>
              <p className="text-[10px] sm:text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">{k.nota}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Cobro esperado por taller */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#E7EAF0] dark:border-[#2B3442] flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">Cobro esperado por taller</h3>
            <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
              Mensualidad × meses inscrito (mes completo si estuvo al menos un día), sin el mes que cubre la matrícula.
              Toca un taller para ver sus alumnos.
            </p>
          </div>
          <OrdenSelector
            className="ml-auto"
            value={ordenTalleres}
            onChange={setOrdenTalleres}
            extra={[{ value: 'MAYOR', label: 'Mayor cobro' }]}
          />
        </div>
        {talleres.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#667085] dark:text-[#94A3B8]">No hay talleres en este corte.</p>
        ) : (
          <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
            {talleres.map((t) => {
              const abierto = abiertos.has(t.grupo_id);
              const alumnos = ordenarAlfabetico(
                datos.detalle.filter((d) => d.grupo_id === t.grupo_id),
                (d) => [d.apellido, d.nombre]
              );
              return (
                <li key={t.grupo_id}>
                  <button
                    type="button"
                    onClick={() => alternar(t.grupo_id)}
                    aria-expanded={abierto}
                    className="w-full px-4 sm:px-6 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-[#151A22] transition cursor-pointer"
                  >
                    {abierto ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">
                        {t.grupo_nombre}
                        {t.eliminado && <span className="ml-1.5 text-[10px] font-normal text-rose-500">(eliminado)</span>}
                      </p>
                      <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">
                        {t.profesor_nombre} · {formatearMonto(t.mensualidad)} / mes · {t.alumnos} alumno
                        {t.alumnos === 1 ? '' : 's'}
                        {(t.altas > 0 || t.bajas > 0) && ` · +${t.altas} / −${t.bajas}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] tabular-nums">
                        {formatearMonto(t.cobroEsperado)}
                      </p>
                      <p className="text-[10px] text-[#667085] dark:text-[#94A3B8] tabular-nums">
                        {t.mesesCobrables} mens. · {t.mesesMatricula} matr.
                      </p>
                    </div>
                  </button>
                  {abierto && (
                    <div className="px-4 sm:px-6 pb-3">
                      {alumnos.length === 0 ? (
                        <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] py-2">
                          Sin alumnos inscritos en este periodo.
                        </p>
                      ) : (
                        <ul className="rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
                          {alumnos.map((d) => (
                            <li
                              key={d.estudiante_id}
                              className="px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-xs"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">
                                  {d.apellido ? `${d.apellido}, ${d.nombre}` : d.nombre}
                                  {!d.activoAlCierre && (
                                    <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                      De baja al cierre
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                                  {d.grado || 'Sin grado'} ·{' '}
                                  {d.porcentajeAsistencia === null
                                    ? 'sin sesiones cerradas'
                                    : `${d.porcentajeAsistencia}% asistencia · ${d.ausencias} falta(s)`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                {d.meses.map((m) => {
                                  const chip = CHIP_MES[m.estado];
                                  return (
                                    <span
                                      key={m.mes}
                                      title={`${etiquetaMes(m.mes)}: ${chip.titulo}`}
                                      className={`min-w-11 text-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${chip.clase}`}
                                    >
                                      {etiquetaMes(m.mes).split(' ')[0]} {chip.texto}
                                    </span>
                                  );
                                })}
                              </div>
                              <span className="sm:w-24 sm:text-right font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">
                                {formatearMonto(d.cobroEsperado)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="px-4 sm:px-6 py-3 border-t border-[#E7EAF0] dark:border-[#2B3442] flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#667085] dark:text-[#94A3B8]">
          {(Object.keys(CHIP_MES) as EstadoMesCorte[]).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`px-1.5 py-0.5 rounded border font-bold ${CHIP_MES[k].clase}`}>{CHIP_MES[k].texto}</span>
              {CHIP_MES[k].titulo}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Altas y bajas */}
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] flex items-center gap-1.5">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                Altas y bajas
                <ArrowDownRight className="w-4 h-4 text-rose-600" />
              </h3>
              <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                {resumen.altas} alta(s) · {resumen.bajas} baja(s) en el periodo
              </p>
            </div>
            <OrdenSelector
              className="ml-auto"
              value={ordenMov}
              onChange={setOrdenMov}
              extra={[{ value: 'RECIENTES', label: 'Más reciente' }]}
            />
          </div>
          {movimientos.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#667085] dark:text-[#94A3B8]">Sin altas ni bajas en este corte.</p>
          ) : (
            <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442] max-h-96 overflow-y-auto">
              {movimientos.map((m) => (
                <li key={m.id} className="px-4 sm:px-6 py-2.5 text-xs flex items-start gap-3">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${TIPOS_MOV[m.tipo].clase}`}>
                    {TIPOS_MOV[m.tipo].texto}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">
                      {m.estudiante_nombre || 'Alumno'}
                    </p>
                    <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">
                      {m.grupo_id ? m.grupo_nombre || 'Taller' : 'Todos sus talleres'}
                      {m.motivo ? ` · ${m.motivo}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] shrink-0">{fechaCorta(m.fecha)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Matrículas cobradas */}
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">Matrículas cobradas</h3>
              <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                {resumen.matriculasCobradas} matrícula(s) · {formatearMonto(resumen.montoMatriculas)}
              </p>
            </div>
            <OrdenSelector
              className="ml-auto"
              value={ordenMat}
              onChange={setOrdenMat}
              extra={[{ value: 'RECIENTES', label: 'Pago más reciente' }]}
            />
          </div>
          {matriculas.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#667085] dark:text-[#94A3B8]">
              No se cobraron matrículas en este corte.
            </p>
          ) : (
            <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442] max-h-96 overflow-y-auto">
              {matriculas.map((m) => (
                <li key={m.id} className="px-4 sm:px-6 py-2.5 text-xs flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">{m.alumno}</p>
                    <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">
                      {m.grupo_nombre} · {m.tipo_tramite === 'RENOVACION_ANUAL' ? 'Renovación' : 'Nueva'}
                      {m.numero_recibo_caja ? ` · Recibo ${m.numero_recibo_caja}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold tabular-nums text-[#172033] dark:text-[#F1F5F9]">{formatearMonto(m.monto)}</p>
                    <p className="text-[10px] text-[#667085] dark:text-[#94A3B8]">{fechaCorta(m.fecha_pago)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

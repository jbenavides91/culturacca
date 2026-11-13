import React, { useState, useEffect, useMemo } from 'react';
import { Search, CheckCircle2, FileCheck2, CreditCard, Receipt, X } from 'lucide-react';
import { SolicitudMatricula } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { ReceiptCertificateModal, formatFechaCaja } from '../cashier/ReceiptCertificateModal';
import { formatearMonto, montoDeSolicitud } from '../../utils/arancel';
import { fechaLocalISO } from '../../utils/fechas';

type Periodo = 'todo' | 'hoy' | 'semana' | 'mes' | 'rango';

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'rango', label: 'Rango' },
];

/** Fecha local (YYYY-MM-DD) del pago: fecha_pago, o fecha_aceptacion si no hay; '' si no tiene */
const fechaDePago = (s: SolicitudMatricula) => {
  const iso = s.fecha_pago || s.fecha_aceptacion;
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : fechaLocalISO(d);
};

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const ReceiptsHistoryTab: React.FC = () => {
  const [solicitudes, setSolicitudes] = useState<SolicitudMatricula[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedForCertificate, setSelectedForCertificate] = useState<SolicitudMatricula | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('todo');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  useEffect(() => {
    const load = () => setSolicitudes(storageService.getSolicitudesMatricula());
    load();
    const unsub = subscribeToData(load);
    return () => unsub();
  }, []);

  // Rango de fechas del filtro (fechas locales YYYY-MM-DD); null = sin filtro de fecha
  const rango = useMemo<[string, string] | null>(() => {
    const hoy = new Date();
    const hoyStr = fechaLocalISO(hoy);
    switch (periodo) {
      case 'hoy':
        return [hoyStr, hoyStr];
      case 'semana': {
        const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
        const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
        return [fechaLocalISO(lunes), fechaLocalISO(domingo)];
      }
      case 'mes':
        return [
          fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
          fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
        ];
      case 'rango':
        return desde || hasta ? [desde || '0000-01-01', hasta || '9999-12-31'] : null;
      default:
        return null;
    }
  }, [periodo, desde, hasta]);

  const rangoInvalido = periodo === 'rango' && !!desde && !!hasta && hasta < desde;

  // Solo trámites con pago o recibo registrado, dentro del período elegido
  const conPago = useMemo(() => {
    const base = solicitudes.filter((s) => s.numero_recibo_caja || s.solvente);
    if (rangoInvalido) return [];
    if (!rango) return base;
    return base.filter((s) => {
      const f = fechaDePago(s);
      return !!f && f >= rango[0] && f <= rango[1];
    });
  }, [solicitudes, rango, rangoInvalido]);

  // Indicadores del período (no dependen de la búsqueda de texto)
  const metrics = useMemo(() => {
    const recibosEmitidos = conPago.filter((s) => s.numero_recibo_caja).length;
    const totalRecaudado = conPago
      .filter((s) => s.solvente && s.monto_arancel)
      .reduce((acc, curr) => acc + (Number(curr.monto_arancel) || 0), 0);
    return { recibosEmitidos, totalRecaudado };
  }, [conPago]);

  const descripcionPeriodo =
    periodo === 'todo'
      ? 'Todo el historial'
      : rango
      ? rango[0] === rango[1]
        ? fechaCorta(rango[0])
        : `${rango[0] === '0000-01-01' ? 'Inicio' : fechaCorta(rango[0])} – ${
            rango[1] === '9999-12-31' ? 'hoy' : fechaCorta(rango[1])
          }`
      : 'Elige las fechas';

  const limpiarFechas = () => {
    setPeriodo('todo');
    setDesde('');
    setHasta('');
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conPago;
    return conPago.filter((sol) =>
      [
        sol.codigo_solicitud,
        sol.codigo_alumno,
        `${sol.nombre_alumno} ${sol.apellido_alumno}`,
        sol.numero_recibo_caja || '',
        sol.grupo_nombre,
        sol.tutor_nombre,
      ].some((v) => v.toLowerCase().includes(q))
    );
  }, [conPago, searchQuery]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Filtros: fecha de pago y búsqueda */}
      <div className="bg-white dark:bg-[#1B222D] p-3.5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          <div
            className="flex sm:inline-flex w-full sm:w-auto gap-0.5 p-1 bg-[#F7F8FA] dark:bg-[#151A22] rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-xs overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Período de pago"
          >
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={periodo === p.id}
                onClick={() => setPeriodo(p.id)}
                className={`shrink-0 px-3 py-1.5 sm:py-1 rounded-md font-semibold whitespace-nowrap transition cursor-pointer ${
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
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 text-xs text-[#667085] dark:text-[#94A3B8]">
              <label className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="font-semibold sm:font-normal">Desde</span>
                <input
                  type="date"
                  value={desde}
                  max={hasta || undefined}
                  onChange={(e) => setDesde(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg text-xs text-[#172033] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                />
              </label>
              <label className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="font-semibold sm:font-normal">Hasta</span>
                <input
                  type="date"
                  value={hasta}
                  min={desde || undefined}
                  onChange={(e) => setHasta(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg text-xs text-[#172033] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                />
              </label>
            </div>
          )}

          <div className="relative w-full lg:w-72 lg:ml-auto">
            <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por trámite, alumno, recibo o taller..."
              className="w-full pl-9 pr-3 py-2.5 sm:py-1.5 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg text-xs text-[#172033] dark:text-[#F1F5F9] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
          <span className="truncate" title="Se filtra por la fecha de pago (o de aceptación, si no hay fecha de pago)">
            {rangoInvalido ? (
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                La fecha "Hasta" debe ser igual o posterior a "Desde".
              </span>
            ) : (
              <>
                Fecha de pago: <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">{descripcionPeriodo}</span>
              </>
            )}
          </span>
          <span className="flex items-center gap-3 shrink-0">
            {periodo !== 'todo' && (
              <button
                type="button"
                onClick={limpiarFechas}
                className="flex items-center gap-0.5 font-semibold hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer"
              >
                <X className="w-3 h-3" />
                Limpiar
              </button>
            )}
            <span className="font-mono">{filtered.length} registros</span>
          </span>
        </div>
      </div>

      {/* KPI Cards (del período elegido) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-[#1B222D] p-3.5 sm:p-5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 shadow-xs min-w-0">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
            Recaudación en Caja
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums truncate">
              {formatearMonto(metrics.totalRecaudado)}
            </span>
            <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-1 block truncate">
            {periodo === 'todo' ? 'total histórico' : 'en el período'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#1B222D] p-3.5 sm:p-5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs min-w-0">
          <span className="text-[10px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block">
            Recibos Contables
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#172033] dark:text-[#F1F5F9] tabular-nums">
              {metrics.recibosEmitidos}
            </span>
            <Receipt className="w-4 h-4 text-slate-500 shrink-0" />
          </div>
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-1 block truncate">
            comprobantes emitidos{periodo === 'todo' ? '' : ' en el período'}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F8FA] dark:bg-[#151A22] text-[#667085] dark:text-[#94A3B8] uppercase text-[10px] font-bold tracking-wider border-b border-[#E7EAF0] dark:border-[#2B3442]">
              <tr>
                <th className="py-3 px-4">Comprobante Contable</th>
                <th className="py-3 px-4">Trámite & Alumno</th>
                <th className="py-3 px-4">Taller & Monto</th>
                <th className="py-3 px-4">Padre / Tutor</th>
                <th className="py-3 px-4">Fecha de Pago</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Constancia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#667085] dark:text-[#94A3B8]">
                    No hay recibos ni pagos que coincidan con la búsqueda o el período elegido.
                  </td>
                </tr>
              ) : (
                filtered.map((sol) => (
                  <tr key={sol.id} className="hover:bg-slate-50 dark:hover:bg-[#151A22]/50 transition">
                    <td className="py-3.5 px-4 font-mono">
                      {sol.numero_recibo_caja ? (
                        <div className="space-y-0.5">
                          <span className="font-bold text-emerald-700 dark:text-emerald-300 block">
                            {sol.numero_recibo_caja}
                          </span>
                          <span className="text-[10px] text-slate-500 font-sans block">
                            {sol.metodo_pago || 'Efectivo'} • {sol.cajero_nombre || 'Caja'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Sin recibo</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                            {sol.codigo_solicitud}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                            {sol.codigo_alumno}
                          </span>
                        </div>
                        <div className="font-bold text-[#172033] dark:text-[#F1F5F9]">
                          {sol.nombre_alumno} {sol.apellido_alumno}
                        </div>
                        <div className="text-[10px] text-[#667085] dark:text-[#94A3B8]">
                          {sol.grado} • {sol.aula_regular}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-[#172033] dark:text-[#F1F5F9] block">{sol.grupo_nombre}</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatearMonto(montoDeSolicitud(sol))}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-[#172033] dark:text-[#F1F5F9]">{sol.tutor_nombre}</div>
                      <div className="text-[10px] text-[#667085] dark:text-[#94A3B8]">
                        {sol.tutor_parentesco || 'Tutor'} • {sol.tutor_telefono}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-[11px] text-[#667085] dark:text-[#94A3B8]">
                      {sol.fecha_pago || sol.fecha_aceptacion
                        ? formatFechaCaja(sol.fecha_pago || sol.fecha_aceptacion || '')
                        : '—'}
                    </td>

                    <td className="py-3.5 px-4">
                      {sol.estado === 'ACEPTADA' ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          <FileCheck2 className="w-3 h-3" />
                          <span>Formalizada</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Solvente</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {sol.estado === 'ACEPTADA' && (
                        <button
                          onClick={() => setSelectedForCertificate(sol)}
                          className="px-2.5 py-1.5 border border-[#E7EAF0] dark:border-[#2B3442] hover:bg-slate-100 dark:hover:bg-slate-800 text-[#172033] dark:text-[#F1F5F9] rounded-lg text-xs font-semibold transition inline-flex items-center space-x-1 cursor-pointer"
                          title="Ver Recibo y Constancia Oficial"
                        >
                          <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Recibo & Constancia</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedForCertificate && (
        <ReceiptCertificateModal
          solicitud={selectedForCertificate}
          onClose={() => setSelectedForCertificate(null)}
        />
      )}
    </div>
  );
};

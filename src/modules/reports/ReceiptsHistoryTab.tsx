import React, { useState, useEffect, useMemo } from 'react';
import { Search, CheckCircle2, FileCheck2, CreditCard, Receipt } from 'lucide-react';
import { SolicitudMatricula } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { ReceiptCertificateModal, formatFechaCaja } from '../cashier/ReceiptCertificateModal';
import { formatearMonto, montoDeSolicitud } from '../../utils/arancel';

export const ReceiptsHistoryTab: React.FC = () => {
  const [solicitudes, setSolicitudes] = useState<SolicitudMatricula[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedForCertificate, setSelectedForCertificate] = useState<SolicitudMatricula | null>(null);

  useEffect(() => {
    const load = () => setSolicitudes(storageService.getSolicitudesMatricula());
    load();
    const unsub = subscribeToData(load);
    return () => unsub();
  }, []);

  // Solo trámites con pago o recibo registrado
  const conPago = useMemo(
    () => solicitudes.filter((s) => s.numero_recibo_caja || s.solvente),
    [solicitudes]
  );

  const metrics = useMemo(() => {
    const recibosEmitidos = conPago.filter((s) => s.numero_recibo_caja).length;
    const totalRecaudado = conPago
      .filter((s) => s.solvente && s.monto_arancel)
      .reduce((acc, curr) => acc + (curr.monto_arancel || 0), 0);
    return { recibosEmitidos, totalRecaudado };
  }, [conPago]);

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
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#1B222D] p-3.5 sm:p-5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
            Recaudación en Caja
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl lg:text-3xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              C$ {metrics.totalRecaudado.toLocaleString()}
            </span>
            <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#1B222D] p-3.5 sm:p-5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs">
          <span className="text-[10px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider block">
            Recibos Contables
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl lg:text-3xl font-bold text-[#172033] dark:text-[#F1F5F9] tabular-nums">
              {metrics.recibosEmitidos}
            </span>
            <Receipt className="w-4 h-4 text-slate-500" />
          </div>
          <span className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-1 block">comprobantes emitidos</span>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-[#1B222D] p-3.5 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por trámite, alumno, recibo o taller..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg text-xs text-[#172033] dark:text-[#F1F5F9] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
          />
        </div>
        <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-mono">{filtered.length} registros</span>
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
                    No hay recibos ni pagos que coincidan con la búsqueda.
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

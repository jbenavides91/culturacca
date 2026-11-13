import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileCheck2,
  UserCheck,
  Ban,
  X,
  CreditCard,
  Shield,
  Eye,
  Check,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import { Perfil, SolicitudMatricula, Grupo } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { ReceiptCertificateModal, formatFechaCaja } from './ReceiptCertificateModal';
import { arancelGeneral, formatearMonto, montoDeSolicitud } from '../../utils/arancel';
import { fechaLocalISO } from '../../utils/fechas';

interface CashierViewProps {
  currentProfile: Perfil;
  onNavigateToWorkshop?: (grupoId: string) => void;
}

export const CashierView: React.FC<CashierViewProps> = ({
  currentProfile,
  onNavigateToWorkshop,
}) => {
  const [solicitudes, setSolicitudes] = useState<SolicitudMatricula[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  // Por defecto: lo que hay que cobrar hoy en ventanilla
  const [filterEstado, setFilterEstado] = useState<string>('PENDIENTE_CAJA');

  // Filtro por fecha (histórico)
  const [modoFecha, setModoFecha] = useState<'TODAS' | 'DIA' | 'RANGO'>('TODAS');
  const [fechaDia, setFechaDia] = useState(() => fechaLocalISO());
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Active validation modal
  const [selectedForValidation, setSelectedForValidation] = useState<SolicitudMatricula | null>(null);
  const [selectedForCertificate, setSelectedForCertificate] = useState<SolicitudMatricula | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cashier form states for the active validation modal
  const [validDatos, setValidDatos] = useState(false);
  const [validContrato, setValidContrato] = useState(false);
  const [numRecibo, setNumRecibo] = useState('');
  const [montoPagado, setMontoPagado] = useState(() => arancelGeneral());
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [cajeroNombre, setCajeroNombre] = useState(
    currentProfile.nombre
      ? `${currentProfile.nombre} ${currentProfile.apellido} (Caja)`
      : 'Lic. Beatriz Miranda (Caja)'
  );
  const [cajeroObservaciones, setCajeroObservaciones] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadData = () => {
    setSolicitudes(storageService.getSolicitudesMatricula());
    setGrupos(storageService.getGrupos());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToData(() => loadData());
    return () => unsub();
  }, []);

  const handleOpenValidation = (sol: SolicitudMatricula) => {
    setSelectedForValidation(sol);
    setValidDatos(sol.validado_datos);
    setValidContrato(sol.validado_contrato);
    setNumRecibo(sol.numero_recibo_caja || '');
    setMontoPagado(montoDeSolicitud(sol));
    setMetodoPago(sol.metodo_pago || 'Efectivo');
    setCajeroObservaciones(sol.cajero_observaciones || '');
    setValidationError(null);
  };

  // Metrics for Cashier
  const metrics = useMemo(() => {
    const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE_CAJA').length;
    const solventes = solicitudes.filter((s) => s.estado === 'SOLVENTE').length;
    const formalizadas = solicitudes.filter((s) => s.estado === 'ACEPTADA').length;
    const totalRecaudado = solicitudes
      .filter((s) => s.solvente && s.monto_arancel)
      .reduce((acc, curr) => acc + (curr.monto_arancel || 0), 0);
    const recibosEmitidos = solicitudes.filter((s) => s.numero_recibo_caja).length;

    return { pendientes, solventes, formalizadas, totalRecaudado, recibosEmitidos };
  }, [solicitudes]);

  // Rango de fechas activo (YYYY-MM-DD locales, inclusivo) o null si no se filtra por fecha
  const rangoFecha = useMemo<[string, string] | null>(() => {
    if (modoFecha === 'DIA' && fechaDia) return [fechaDia, fechaDia];
    if (modoFecha === 'RANGO' && (fechaDesde || fechaHasta)) {
      return [fechaDesde || '0000-01-01', fechaHasta || '9999-12-31'];
    }
    return null;
  }, [modoFecha, fechaDia, fechaDesde, fechaHasta]);

  /** Fecha relevante del trámite: de pago si ya se cobró; de solicitud si está por cobrar */
  const fechaDeTramite = (sol: SolicitudMatricula): string => {
    const iso = sol.estado === 'PENDIENTE_CAJA' ? sol.fecha_solicitud : sol.fecha_pago || sol.fecha_aceptacion || sol.fecha_solicitud;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : fechaLocalISO(d);
  };

  // Búsqueda + fecha (sin filtro de estado) → base para contadores y lista
  const solicitudesBase = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return solicitudes.filter((sol) => {
      if (rangoFecha) {
        const f = fechaDeTramite(sol);
        if (!f || f < rangoFecha[0] || f > rangoFecha[1]) return false;
      }
      if (q) {
        const campos = [
          sol.codigo_solicitud,
          sol.codigo_alumno,
          `${sol.nombre_alumno} ${sol.apellido_alumno}`,
          sol.numero_recibo_caja || '',
          sol.grupo_nombre,
          sol.tutor_nombre,
        ];
        if (!campos.some((c) => c.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [solicitudes, searchQuery, rangoFecha]);

  const conteos = useMemo(
    () => ({
      pendientes: solicitudesBase.filter((s) => s.estado === 'PENDIENTE_CAJA').length,
      formalizadas: solicitudesBase.filter((s) => s.estado === 'ACEPTADA').length,
      todas: solicitudesBase.length,
    }),
    [solicitudesBase]
  );

  const filteredSolicitudes = useMemo(
    () => solicitudesBase.filter((sol) => filterEstado === 'TODAS' || sol.estado === filterEstado),
    [solicitudesBase, filterEstado]
  );

  // Accesos rápidos de rango
  const aplicarRapido = (tipo: 'hoy' | 'semana' | 'mes') => {
    const hoy = new Date();
    if (tipo === 'hoy') {
      setModoFecha('DIA');
      setFechaDia(fechaLocalISO(hoy));
      return;
    }
    let inicio: Date;
    let fin: Date;
    if (tipo === 'semana') {
      const dia = hoy.getDay() === 0 ? 7 : hoy.getDay();
      inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dia - 1));
      fin = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6);
    } else {
      inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    }
    setModoFecha('RANGO');
    setFechaDesde(fechaLocalISO(inicio));
    setFechaHasta(fechaLocalISO(fin));
  };

  const limpiarFecha = () => {
    setModoFecha('TODAS');
    setFechaDesde('');
    setFechaHasta('');
    setFechaDia(fechaLocalISO());
  };

  const descripcionFiltroFecha = rangoFecha
    ? rangoFecha[0] === rangoFecha[1]
      ? `del ${rangoFecha[0]}`
      : `entre ${fechaDesde || 'el inicio'} y ${fechaHasta || 'hoy'}`
    : '';
  // Handle Process Payment and Directly Formalize Enrollment
  const handleProcessPaymentAndFormalize = () => {
    if (!selectedForValidation) return;
    setValidationError(null);

    if (!validDatos) {
      setValidationError('Debe marcar la casilla de verificación de datos del alumno y grado escolar.');
      return;
    }
    if (!validContrato) {
      setValidationError('Debe validar que el contrato digital esté debidamente firmado por el tutor.');
      return;
    }
    if (!numRecibo.trim()) {
      setValidationError('Debe ingresar el número de recibo o comprobante emitido en su sistema contable.');
      return;
    }

    try {
      setIsProcessing(true);
      const res = storageService.procesarPagoYFormalizarMatricula(selectedForValidation.id, {
        numero_recibo_caja: numRecibo.trim(),
        monto_arancel: montoPagado,
        metodo_pago: metodoPago,
        cajero_nombre: cajeroNombre,
        cajero_observaciones: cajeroObservaciones,
      });

      setSelectedForValidation(null);
      setSelectedForCertificate(res.solicitud);
      setToastMessage(
        `¡Pago procesado con Recibo N° ${res.solicitud.numero_recibo_caja} y matrícula formalizada exitosamente! ${res.estudiante.nombre} ${res.estudiante.apellido} ya está oficialmente matriculado e integrado en la lista de ${res.grupo.nombre}.`
      );
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Error al procesar el pago y formalizar la matrícula');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = formatFechaCaja;

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 animate-fadeIn">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3.5 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between animate-fadeIn shadow-xs">
          <div className="flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-900">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9]">
                Módulo de Caja y Solvencia
              </h1>
              <p className="text-[11px] sm:text-xs text-[#667085] dark:text-[#94A3B8]">
                Ventanilla de cobros: validación de contratos digitales, registro de recibos contables y emisión de solvencias para aceptar la matrícula.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={loadData}
          className="px-3.5 py-2 border border-[#E7EAF0] dark:border-[#2B3442] hover:bg-slate-50 dark:hover:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9] text-xs font-semibold rounded-xl transition flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Actualizar Ventanilla</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Pendientes de Cobro */}
        <div className="bg-white dark:bg-[#1B222D] p-3 sm:p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              Por Cobrar en Ventanilla
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                {metrics.pendientes}
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded font-semibold border border-amber-200 dark:border-amber-900">
                En espera
              </span>
            </div>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Matrículas Formalizadas en Caja */}
        <div className="bg-white dark:bg-[#1B222D] p-3 sm:p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              Matrículas Formalizadas
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {metrics.formalizadas}
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded font-semibold border border-emerald-200 dark:border-emerald-900">
                Con pago y recibo
              </span>
            </div>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <FileCheck2 className="w-5 h-5" />
          </div>
        </div>

        {/* Recaudación Total en Caja */}
        <div className="bg-white dark:bg-[#1B222D] p-3 sm:p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              Recaudación en Caja
            </span>
            <div className="flex items-baseline space-x-1">
              <span className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                C$ {metrics.totalRecaudado.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        {/* Recibos Contables Emitidos */}
        <div className="bg-white dark:bg-[#1B222D] p-3 sm:p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              Recibos Contables
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F1F5F9] font-mono">
                {metrics.recibosEmitidos}
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">
                comprobantes
              </span>
            </div>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#1B222D] p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs space-y-3">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por trámite, alumno, recibo o taller..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg text-xs text-[#172033] dark:text-[#F1F5F9] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex bg-[#F7F8FA] dark:bg-[#151A22] p-1 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-xs">
            <button
              onClick={() => setFilterEstado('PENDIENTE_CAJA')}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                filterEstado === 'PENDIENTE_CAJA'
                  ? 'bg-white dark:bg-[#1B222D] text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8]'
              }`}
            >
              Por Cobrar ({conteos.pendientes})
            </button>
            <button
              onClick={() => setFilterEstado('ACEPTADA')}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                filterEstado === 'ACEPTADA'
                  ? 'bg-white dark:bg-[#1B222D] text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8]'
              }`}
            >
              Formalizadas ({conteos.formalizadas})
            </button>
            <button
              onClick={() => setFilterEstado('TODAS')}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                filterEstado === 'TODAS'
                  ? 'bg-white dark:bg-[#1B222D] text-[#172033] dark:text-[#F1F5F9] shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8]'
              }`}
            >
              Todas ({conteos.todas})
            </button>
        </div>
      </div>

      {/* Filtro por fecha */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 pt-3 border-t border-[#E7EAF0] dark:border-[#2B3442] text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] shrink-0" />
          <select
            value={modoFecha}
            onChange={(e) => setModoFecha(e.target.value as 'TODAS' | 'DIA' | 'RANGO')}
            aria-label="Filtrar por fecha"
            className="bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg px-2.5 py-1.5 text-[#172033] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
          >
            <option value="TODAS">Cualquier fecha</option>
            <option value="DIA">Un día</option>
            <option value="RANGO">Rango de fechas</option>
          </select>
        </div>

        {modoFecha === 'DIA' && (
          <input
            type="date"
            value={fechaDia}
            onChange={(e) => setFechaDia(e.target.value)}
            aria-label="Fecha"
            className="bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg px-2.5 py-1.5 text-[#172033] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        )}

        {modoFecha === 'RANGO' && (
          <div className="flex flex-wrap items-center gap-2 text-[#667085] dark:text-[#94A3B8]">
            <label className="flex items-center gap-1">
              Desde
              <input
                type="date"
                value={fechaDesde}
                max={fechaHasta || undefined}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg px-2.5 py-1.5 text-[#172033] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="flex items-center gap-1">
              Hasta
              <input
                type="date"
                value={fechaHasta}
                min={fechaDesde || undefined}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg px-2.5 py-1.5 text-[#172033] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['hoy', 'Hoy'],
              ['semana', 'Esta semana'],
              ['mes', 'Este mes'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => aplicarRapido(id)}
              className="px-2.5 py-1 rounded-md border border-[#E7EAF0] dark:border-[#2B3442] text-[#667085] dark:text-[#94A3B8] hover:text-amber-600 hover:border-amber-300 font-semibold transition cursor-pointer"
            >
              {label}
            </button>
          ))}
          {modoFecha !== 'TODAS' && (
            <button
              type="button"
              onClick={limpiarFecha}
              className="px-2.5 py-1 rounded-md text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
        </div>

        <span className="lg:ml-auto text-[11px] text-[#94A3B8]">
          Filtra por fecha de pago (formalizadas) o de solicitud (por cobrar).
        </span>
      </div>
      </div>

      {/* Table of Cashier Queue */}
      <div className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F8FA] dark:bg-[#151A22] text-[#667085] dark:text-[#94A3B8] uppercase text-[10px] font-bold tracking-wider border-b border-[#E7EAF0] dark:border-[#2B3442]">
              <tr>
                <th className="py-3 px-4">Código Trámite & Alumno</th>
                <th className="py-3 px-4">Grado Escolar & Aula Regular</th>
                <th className="py-3 px-4">Taller & Arancel a Cobrar</th>
                <th className="py-3 px-4">Padre / Tutor Responsable</th>
                <th className="py-3 px-4">Comprobante Contable</th>
                <th className="py-3 px-4">Estado de Solvencia</th>
                <th className="py-3 px-4 text-right">Operación de Caja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
              {filteredSolicitudes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#667085] dark:text-[#94A3B8]">
                    {filterEstado === 'PENDIENTE_CAJA' && !searchQuery.trim() && !rangoFecha
                      ? 'No hay trámites pendientes de cobro. ¡Ventanilla al día!'
                      : `No hay trámites en Caja que coincidan con la búsqueda${
                          descripcionFiltroFecha ? ` ${descripcionFiltroFecha}` : ''
                        }.`}
                  </td>
                </tr>
              ) : (
                filteredSolicitudes.map((sol) => (
                  <tr
                    key={sol.id}
                    className="hover:bg-slate-50 dark:hover:bg-[#151A22]/50 transition"
                  >
                    {/* Código & Alumno */}
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
                        <div className="font-bold text-[#172033] dark:text-[#F1F5F9] text-xs">
                          {sol.nombre_alumno} {sol.apellido_alumno}
                        </div>
                        <div className="text-[10px] text-[#667085] dark:text-[#94A3B8]">
                          {sol.edad} años • Fecha: {formatDate(sol.fecha_solicitud)}
                        </div>
                      </div>
                    </td>

                    {/* Grado & Aula */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <span className="font-bold text-[#172033] dark:text-[#F1F5F9] block">
                          {sol.grado}
                        </span>
                        <span className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                          {sol.aula_regular}
                        </span>
                      </div>
                    </td>

                    {/* Taller & Arancel */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <span className="font-semibold text-[#172033] dark:text-[#F1F5F9] block">
                          {sol.grupo_nombre}
                        </span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatearMonto(montoDeSolicitud(sol))}
                        </span>
                      </div>
                    </td>

                    {/* Tutor */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <div className="font-medium text-[#172033] dark:text-[#F1F5F9]">
                          {sol.tutor_nombre}
                        </div>
                        <div className="text-[10px] text-[#667085] dark:text-[#94A3B8]">
                          {sol.tutor_parentesco || 'Tutor'} • {sol.tutor_telefono}
                        </div>
                        {sol.contrato_firmado && (
                          <span className="inline-flex items-center space-x-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-400">
                            <Check className="w-3 h-3" />
                            <span>Contrato firmado por tutor</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Comprobante Contable */}
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
                        <span className="text-slate-400 italic text-[11px]">
                          Sin recibo aún
                        </span>
                      )}
                    </td>

                    {/* Estado de Solvencia */}
                    <td className="py-3.5 px-4">
                      {sol.estado === 'PENDIENTE_CAJA' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          <Clock className="w-3 h-3" />
                          <span>Pendiente de Cobro</span>
                        </span>
                      )}

                      {sol.estado === 'SOLVENTE' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>SOLVENTE</span>
                        </span>
                      )}

                      {sol.estado === 'ACEPTADA' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          <FileCheck2 className="w-3 h-3" />
                          <span>Formalizada</span>
                        </span>
                      )}
                    </td>

                    {/* Operación de Caja */}
                    <td className="py-3.5 px-4 text-right">
                      {sol.estado === 'PENDIENTE_CAJA' && (
                        <button
                          onClick={() => handleOpenValidation(sol)}
                          className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center space-x-1.5 ml-auto cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Cobrar y Formalizar</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {sol.estado === 'SOLVENTE' && (
                        <button
                          onClick={() => handleOpenValidation(sol)}
                          className="px-3.5 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center space-x-1.5 ml-auto cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Formalizar Matrícula</span>
                        </button>
                      )}

                      {sol.estado === 'ACEPTADA' && (
                        <button
                          onClick={() => setSelectedForCertificate(sol)}
                          className="px-2.5 py-1.5 border border-[#E7EAF0] dark:border-[#2B3442] hover:bg-slate-100 dark:hover:bg-slate-800 text-[#172033] dark:text-[#F1F5F9] rounded-lg text-xs font-semibold transition flex items-center space-x-1 ml-auto cursor-pointer"
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

      {/* Cashier Terminal Modal */}
      {selectedForValidation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] flex flex-col">
            {/* Header */}
            <div className="bg-[#172033] dark:bg-[#151A22] px-4 sm:px-6 py-3 sm:py-4 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold">Terminal de Ventanilla de Caja</h3>
                    <span className="font-mono text-xs text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                      {selectedForValidation.codigo_solicitud}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Validar datos, contrato firmado y registrar comprobante contable de pago
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedForValidation(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
              {validationError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* Paso 1: Validación de Datos */}
              <div className="p-4 bg-[#F7F8FA] dark:bg-[#151A22] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] flex items-center space-x-1.5">
                  <Shield className="w-4 h-4 text-amber-500" />
                  <span>1. Validación de Datos del Alumno y Tutor</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] block">Código Alumno:</span>
                    <span className="font-mono font-bold text-[#172033] dark:text-[#F1F5F9]">
                      {selectedForValidation.codigo_alumno}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] block">Nombre Completo:</span>
                    <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                      {selectedForValidation.nombre_alumno} {selectedForValidation.apellido_alumno}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] block">Edad:</span>
                    <span className="font-medium">{selectedForValidation.edad} años</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] block">Grado Escolar:</span>
                    <span className="font-bold text-[#4F46E5] dark:text-[#818CF8]">
                      {selectedForValidation.grado}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] block">Aula Regular:</span>
                    <span className="font-medium">{selectedForValidation.aula_regular}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] block">Taller Solicitado:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {selectedForValidation.grupo_nombre}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] block">Tutor Responsable:</span>
                    <span className="font-medium">
                      {selectedForValidation.tutor_nombre} ({selectedForValidation.tutor_parentesco || 'Tutor'}) • Tel: {selectedForValidation.tutor_telefono}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] block">Cédula:</span>
                    <span className="font-mono">{selectedForValidation.tutor_cedula || 'N/A'}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E7EAF0] dark:border-[#2B3442] flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="caja-chk-datos"
                    checked={validDatos}
                    onChange={(e) => setValidDatos(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <label
                    htmlFor="caja-chk-datos"
                    className="text-xs font-semibold text-[#172033] dark:text-[#F1F5F9] cursor-pointer"
                  >
                    He verificado que los datos personales y el grado del alumno están conformes.
                  </label>
                </div>
              </div>

              {/* Paso 2: Validación de Contrato Digital y Firma */}
              <div className="p-4 bg-[#F7F8FA] dark:bg-[#151A22] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8] flex items-center space-x-1.5">
                    <FileCheck2 className="w-4 h-4 text-amber-500" />
                    <span>2. Validación de Contrato Digital y Firma</span>
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900">
                    Firmado: {formatDate(selectedForValidation.fecha_firma || selectedForValidation.fecha_solicitud)}
                  </span>
                </div>

                <div className="bg-white dark:bg-[#0B0F17] p-3 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-xs">
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] block">
                      Firma estampada por:
                    </span>
                    <strong className="text-sm text-[#172033] dark:text-[#F1F5F9]">
                      {selectedForValidation.firmante_nombre || selectedForValidation.tutor_nombre}
                    </strong>
                    <p className="text-[10px] text-slate-500">
                      Tutor responsable legal del estudiante. Sello digital registrado en sistema.
                    </p>
                  </div>

                  {selectedForValidation.firma_digital_url && (
                    <div className="bg-white p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs max-w-xs shrink-0">
                      <img
                        src={selectedForValidation.firma_digital_url}
                        alt="Firma Digital Tutor"
                        className="h-16 w-auto object-contain"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="caja-chk-contrato"
                    checked={validContrato}
                    onChange={(e) => setValidContrato(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <label
                    htmlFor="caja-chk-contrato"
                    className="text-xs font-semibold text-[#172033] dark:text-[#F1F5F9] cursor-pointer"
                  >
                    Contrato digital debidamente firmado por el tutor y validado en ventanilla de Caja.
                  </label>
                </div>
              </div>

              {/* Paso 3: Asentar Pago Contable & Formalizar Matrícula Definitiva */}
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950 dark:text-emerald-200 flex items-center space-x-1.5">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <span>3. Registro de Pago en Sistema Contable y Formalización Definitiva</span>
                  </h4>
                  {selectedForValidation.estado === 'ACEPTADA' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40">
                      MATRÍCULA FORMALIZADA
                    </span>
                  )}
                </div>

                <p className="text-xs text-emerald-900 dark:text-emerald-300 leading-relaxed">
                  Proceda en su sistema contable institucional a registrar el cobro del arancel. Ingrese el número de recibo o comprobante contable emitido. Al hacer clic en <strong>Procesar Pago y Formalizar Matrícula</strong>, el alumno queda solvente, su matrícula se formaliza de inmediato incorporándose a las listas de asistencia y se emitirá su constancia oficial con recibo.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold mb-1 text-emerald-950 dark:text-emerald-100">
                      N° de Recibo Oficial / Comprobante de Caja *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: REC-2026-9042"
                      value={numRecibo}
                      onChange={(e) => setNumRecibo(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-[#151A22] border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-mono font-bold uppercase text-[#172033] dark:text-[#F1F5F9] focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1 text-emerald-950 dark:text-emerald-100">
                      Monto Cobrado (C$) *
                    </label>
                    <input
                      type="number"
                      required
                      value={montoPagado}
                      onChange={(e) => setMontoPagado(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-[#151A22] border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-mono font-bold text-[#172033] dark:text-[#F1F5F9] focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1 text-emerald-950 dark:text-emerald-100">
                      Método de Pago
                    </label>
                    <select
                      value={metodoPago}
                      onChange={(e) => setMetodoPago(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-[#151A22] border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-[#172033] dark:text-[#F1F5F9] focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="Efectivo">Efectivo en Ventanilla</option>
                      <option value="Tarjeta de Débito/Crédito">Tarjeta de Débito / Crédito</option>
                      <option value="Transferencia Bancaria BAC">Transferencia Bancaria BAC</option>
                      <option value="Transferencia Banpro">Transferencia Banpro</option>
                      <option value="Depósito en Ventanilla">Depósito en Ventanilla</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1 text-emerald-950 dark:text-emerald-100">
                      Cajera / Responsable de Ventanilla
                    </label>
                    <input
                      type="text"
                      value={cajeroNombre}
                      onChange={(e) => setCajeroNombre(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-[#151A22] border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-[#172033] dark:text-[#F1F5F9] focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold mb-1 text-emerald-950 dark:text-emerald-100">
                      Observaciones de Caja / Referencia Contable
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Pago arancel primer mes. Facturado en sistema contable."
                      value={cajeroObservaciones}
                      onChange={(e) => setCajeroObservaciones(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-[#151A22] border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-[#172033] dark:text-[#F1F5F9] focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-emerald-200/80 dark:border-emerald-900/60 mt-3">
                  <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
                    ✓ La matrícula se formaliza en un solo paso al procesar el pago.
                  </div>
                  <button
                    type="button"
                    onClick={handleProcessPaymentAndFormalize}
                    disabled={isProcessing || !validDatos || !validContrato || !numRecibo.trim()}
                    className="w-full sm:w-auto px-4 sm:px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4 stroke-[2.5]" />
                    <span>{isProcessing ? 'Procesando y Formalizando...' : 'Procesar Pago y Formalizar Matrícula'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#F7F8FA] dark:bg-[#151A22] border-t border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between shrink-0">
              <span className="text-xs text-[#667085] dark:text-[#94A3B8]">
                Estado actual: <strong>{selectedForValidation.estado}</strong>
              </span>

              <button
                type="button"
                onClick={() => setSelectedForValidation(null)}
                className="px-4 py-2 border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#1B222D] transition cursor-pointer"
              >
                Cerrar Ventanilla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Certificate Modal */}
      {selectedForCertificate && (
        <ReceiptCertificateModal
          solicitud={selectedForCertificate}
          onClose={() => setSelectedForCertificate(null)}
        />
      )}
    </div>
  );
};

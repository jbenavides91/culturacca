import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSignature,
  Search,
  UserPlus,
  FileCheck2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Printer,
  X,
  Palette,
  Eye,
  ArrowRight,
  Shield,
  Calendar,
  Sparkles,
  Receipt,
} from 'lucide-react';
import { Perfil, SolicitudMatricula, Grupo } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { NewEnrollmentWizardModal } from './NewEnrollmentWizardModal';
import { cicloActual, nombreInstitucion } from '../../utils/institucion';
import { formatearMonto, montoDeSolicitud } from '../../utils/arancel';

interface MatriculasViewProps {
  currentProfile: Perfil;
  onNavigateToCashier?: () => void;
  onNavigateToWorkshop?: (grupoId: string) => void;
}

export const MatriculasView: React.FC<MatriculasViewProps> = ({
  currentProfile,
  onNavigateToCashier,
  onNavigateToWorkshop,
}) => {
  const [solicitudes, setSolicitudes] = useState<SolicitudMatricula[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('TODAS');
  const [filterGrupo, setFilterGrupo] = useState<string>('TODOS');

  // Modals
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedForContractView, setSelectedForContractView] = useState<SolicitudMatricula | null>(null);
  const [selectedForCertificate, setSelectedForCertificate] = useState<SolicitudMatricula | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = () => {
    setSolicitudes(storageService.getSolicitudesMatricula());
    setGrupos(storageService.getGrupos());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToData(() => loadData());
    return () => unsub();
  }, []);

  // Metrics for Matricula
  const metrics = useMemo(() => {
    const total = solicitudes.length;
    const contratosFirmados = solicitudes.filter((s) => s.contrato_firmado).length;
    const pendientesCaja = solicitudes.filter((s) => s.estado === 'PENDIENTE_CAJA').length;
    const solventes = solicitudes.filter((s) => s.estado === 'SOLVENTE').length;
    const formalizadas = solicitudes.filter((s) => s.estado === 'ACEPTADA').length;

    return { total, contratosFirmados, pendientesCaja, solventes, formalizadas };
  }, [solicitudes]);

  // Filtered requests
  const filteredSolicitudes = useMemo(() => {
    return solicitudes.filter((sol) => {
      if (filterEstado !== 'TODAS' && sol.estado !== filterEstado) {
        return false;
      }
      if (filterGrupo !== 'TODOS' && sol.grupo_id !== filterGrupo) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = sol.codigo_solicitud.toLowerCase().includes(q);
        const matchStudentCode = sol.codigo_alumno.toLowerCase().includes(q);
        const matchName = `${sol.nombre_alumno} ${sol.apellido_alumno}`.toLowerCase().includes(q);
        const matchGrado = (sol.grado || '').toLowerCase().includes(q);
        const matchTutor = sol.tutor_nombre.toLowerCase().includes(q);
        const matchWorkshop = sol.grupo_nombre.toLowerCase().includes(q);
        if (!matchCode && !matchStudentCode && !matchName && !matchGrado && !matchTutor && !matchWorkshop) {
          return false;
        }
      }
      return true;
    });
  }, [solicitudes, filterEstado, filterGrupo, searchQuery]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

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

      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-[#4F46E5] dark:text-[#818CF8] flex items-center justify-center border border-indigo-200 dark:border-indigo-900">
              <FileSignature className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9]">
                Módulo de Matrícula de Alumnos
              </h1>
              <p className="text-[11px] sm:text-xs text-[#667085] dark:text-[#94A3B8]">
                Registro de datos de alumnos, selección de talleres extracurriculares y contratos digitales firmados.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0 self-start sm:self-auto">
          {onNavigateToCashier && metrics.pendientesCaja > 0 && (
            <button
              onClick={onNavigateToCashier}
              className="px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs font-semibold rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
            >
              <span>Ir a Caja ({metrics.pendientesCaja})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setIsWizardOpen(true)}
            className="px-4 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Registrar Nueva Matrícula</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Solicitudes */}
        <div className="bg-white dark:bg-[#1B222D] p-3 sm:p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              Total Solicitudes
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F1F5F9] font-mono">
                {metrics.total}
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">
                expedientes
              </span>
            </div>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <FileSignature className="w-5 h-5" />
          </div>
        </div>

        {/* Contratos Firmados */}
        <div className="bg-white dark:bg-[#1B222D] p-3 sm:p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              Contratos Firmados
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-bold text-[#4F46E5] dark:text-[#818CF8] font-mono">
                {metrics.contratosFirmados}
              </span>
              <span className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.2 rounded font-semibold border border-indigo-200 dark:border-indigo-900">
                Con firma digital
              </span>
            </div>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-[#4F46E5] dark:text-[#818CF8] flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
        </div>

        {/* Pendientes de Caja */}
        <div className="bg-white dark:bg-[#1B222D] p-3 sm:p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium">
              Pendientes de Pago
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                {metrics.pendientesCaja}
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded font-semibold border border-amber-200 dark:border-amber-900">
                Por acudir a Caja
              </span>
            </div>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Matrículas Formalizadas */}
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
                En listas oficiales
              </span>
            </div>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <FileCheck2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#1B222D] p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por alumno, carnet, grado o tutor..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg text-xs text-[#172033] dark:text-[#F1F5F9] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs">
          <div className="flex bg-[#F7F8FA] dark:bg-[#151A22] p-1 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442]">
            <button
              onClick={() => setFilterEstado('TODAS')}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                filterEstado === 'TODAS'
                  ? 'bg-white dark:bg-[#1B222D] text-[#172033] dark:text-[#F1F5F9] shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#172033]'
              }`}
            >
              Todas ({solicitudes.length})
            </button>
            <button
              onClick={() => setFilterEstado('PENDIENTE_CAJA')}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                filterEstado === 'PENDIENTE_CAJA'
                  ? 'bg-white dark:bg-[#1B222D] text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#172033]'
              }`}
            >
              Pendientes de Pago ({metrics.pendientesCaja})
            </button>
            <button
              onClick={() => setFilterEstado('SOLVENTE')}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                filterEstado === 'SOLVENTE'
                  ? 'bg-white dark:bg-[#1B222D] text-[#4F46E5] dark:text-[#818CF8] shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#172033]'
              }`}
            >
              Solventes ({metrics.solventes})
            </button>
            <button
              onClick={() => setFilterEstado('ACEPTADA')}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                filterEstado === 'ACEPTADA'
                  ? 'bg-white dark:bg-[#1B222D] text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#172033]'
              }`}
            >
              Formalizadas ({metrics.formalizadas})
            </button>
          </div>

          <select
            value={filterGrupo}
            onChange={(e) => setFilterGrupo(e.target.value)}
            className="px-3 py-1.5 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg text-xs text-[#172033] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
          >
            <option value="TODOS">Todos los Talleres</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table of Enrollments */}
      <div className="bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F8FA] dark:bg-[#151A22] text-[#667085] dark:text-[#94A3B8] uppercase text-[10px] font-bold tracking-wider border-b border-[#E7EAF0] dark:border-[#2B3442]">
              <tr>
                <th className="py-3 px-4">Trámite & Alumno</th>
                <th className="py-3 px-4">Grado & Aula</th>
                <th className="py-3 px-4">Taller Extracurricular</th>
                <th className="py-3 px-4">Tutor Legal & Contacto</th>
                <th className="py-3 px-4">Contrato & Firma</th>
                <th className="py-3 px-4">Estado de Solvencia</th>
                <th className="py-3 px-4 text-right">Documentos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
              {filteredSolicitudes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#667085] dark:text-[#94A3B8]">
                    No se encontraron solicitudes de matrícula con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredSolicitudes.map((sol) => (
                  <tr
                    key={sol.id}
                    className="hover:bg-slate-50 dark:hover:bg-[#151A22]/50 transition"
                  >
                    {/* Trámite & Alumno */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-bold text-[#4F46E5] dark:text-[#818CF8]">
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

                    {/* Taller Extracurricular */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <span className="font-semibold text-[#172033] dark:text-[#F1F5F9] block">
                          {sol.grupo_nombre}
                        </span>
                        <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono">
                          Arancel: {formatearMonto(montoDeSolicitud(sol))}
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
                        <div className="text-[10px] font-mono text-slate-400 truncate max-w-[150px]">
                          {sol.tutor_email}
                        </div>
                      </div>
                    </td>

                    {/* Contrato & Firma */}
                    <td className="py-3.5 px-4">
                      {sol.contrato_firmado ? (
                        <div className="space-y-1">
                          <button
                            onClick={() => setSelectedForContractView(sol)}
                            className="inline-flex items-center space-x-1.5 px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-[#4F46E5] dark:text-[#818CF8] hover:bg-indigo-100 transition border border-indigo-200 dark:border-indigo-900 cursor-pointer"
                            title="Ver contrato y trazo de firma digital"
                          >
                            <Shield className="w-3 h-3" />
                            <span>Contrato Firmado</span>
                          </button>
                          <div className="text-[9px] text-[#667085] dark:text-[#94A3B8]">
                            Firmó: {sol.firmante_nombre || sol.tutor_nombre}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-rose-600 font-semibold">
                          Sin firma
                        </span>
                      )}
                    </td>

                    {/* Estado de Solvencia */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        {sol.estado === 'PENDIENTE_CAJA' && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              <Clock className="w-3 h-3" />
                              <span>Pendiente en Caja</span>
                            </span>
                            <p className="text-[9px] text-slate-500">
                              Debe pagar en Caja
                            </p>
                          </div>
                        )}

                        {sol.estado === 'SOLVENTE' && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>SOLVENTE</span>
                            </span>
                            {sol.numero_recibo_caja && (
                              <div className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                Recibo: {sol.numero_recibo_caja}
                              </div>
                            )}
                          </div>
                        )}

                        {sol.estado === 'ACEPTADA' && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              <FileCheck2 className="w-3 h-3" />
                              <span>Matrícula Formalizada</span>
                            </span>
                            {sol.numero_recibo_caja && (
                              <div className="text-[10px] font-mono text-slate-500">
                                Recibo: {sol.numero_recibo_caja}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Documentos */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => setSelectedForContractView(sol)}
                          className="p-1.5 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                          title="Ver Contrato y Firma Digital"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {sol.estado === 'PENDIENTE_CAJA' && onNavigateToCashier && (
                          <button
                            onClick={onNavigateToCashier}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
                            title="Ir a Caja para cobrar y formalizar"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Cobrar en Caja</span>
                          </button>
                        )}

                        {sol.estado === 'ACEPTADA' && (
                          <button
                            onClick={() => setSelectedForCertificate(sol)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
                            title="Ver Constancia Oficial de Matrícula"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>Constancia</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Ver Contrato y Firma Digital */}
      {selectedForContractView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] flex flex-col">
            <div className="bg-[#172033] dark:bg-[#151A22] px-4 sm:px-6 py-3 sm:py-4 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center space-x-2">
                <FileSignature className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold">
                  Contrato Digital de Matrícula • {selectedForContractView.codigo_solicitud}
                </h3>
              </div>
              <button
                onClick={() => setSelectedForContractView(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              <div className="p-4 bg-[#F7F8FA] dark:bg-[#151A22] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] font-mono text-[11px] leading-relaxed text-[#172033] dark:text-[#F1F5F9] whitespace-pre-line max-h-72 overflow-y-auto select-text border-l-4 border-l-[#4F46E5]">
                {selectedForContractView.contrato_texto}
              </div>

              {/* Digital Signature Card */}
              <div className="p-4 bg-white dark:bg-[#0B0F17] rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-xs">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">
                    Firma Electrónica Registrada
                  </span>
                  <div className="font-bold text-sm text-[#172033] dark:text-[#F1F5F9]">
                    {selectedForContractView.firmante_nombre || selectedForContractView.tutor_nombre}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Sello de tiempo: {formatDate(selectedForContractView.fecha_firma || selectedForContractView.fecha_solicitud)}
                  </div>
                </div>

                {selectedForContractView.firma_digital_url && (
                  <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs shrink-0">
                    <img
                      src={selectedForContractView.firma_digital_url}
                      alt="Firma Digital"
                      className="h-16 w-auto object-contain"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-[#F7F8FA] dark:bg-[#151A22] border-t border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-[#1B222D] transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Contrato</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedForContractView(null)}
                className="px-5 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Constancia Oficial de Matrícula */}
      {selectedForCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] flex flex-col">
            <div className="bg-[#172033] dark:bg-[#151A22] px-4 sm:px-6 py-3 sm:py-4 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <FileCheck2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold">Constancia Oficial de Matrícula</h3>
              </div>
              <button
                onClick={() => setSelectedForCertificate(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 text-xs font-sans">
              <div className="text-center pb-3 border-b border-slate-200 dark:border-slate-800 space-y-1">
                <h2 className="text-base font-bold text-[#172033] dark:text-[#F1F5F9] tracking-wide">
                  {nombreInstitucion().toUpperCase()}
                </h2>
                <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                  CONSTANCIA OFICIAL DE MATRÍCULA • {cicloActual().toUpperCase()}
                </p>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  MATRÍCULA ACEPTADA Y SOLVENTE
                </span>
              </div>

              <div className="space-y-2 bg-[#F7F8FA] dark:bg-[#151A22] p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442]">
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Código de Trámite:</span>
                  <span className="font-mono font-bold text-[#4F46E5]">{selectedForCertificate.codigo_solicitud}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Código de Alumno:</span>
                  <span className="font-mono font-bold">{selectedForCertificate.codigo_alumno}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Nombre del Alumno:</span>
                  <span className="font-bold text-[#172033] dark:text-[#F1F5F9]">
                    {selectedForCertificate.nombre_alumno} {selectedForCertificate.apellido_alumno}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Grado y Aula Regular:</span>
                  <span>{selectedForCertificate.grado} ({selectedForCertificate.aula_regular})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Taller Extracurricular:</span>
                  <span className="font-bold text-[#4F46E5]">{selectedForCertificate.grupo_nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Tutor Legal:</span>
                  <span>{selectedForCertificate.tutor_nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Comprobante / Recibo Caja:</span>
                  <span className="font-mono font-bold text-emerald-600">{selectedForCertificate.numero_recibo_caja}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Fecha de Aceptación:</span>
                  <span>{formatDate(selectedForCertificate.fecha_aceptacion || selectedForCertificate.fecha_solicitud)}</span>
                </div>
              </div>

              {selectedForCertificate.firma_digital_url && (
                <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 text-[10px] text-[#667085] dark:text-[#94A3B8]">
                  <div>
                    <p className="font-semibold text-[#172033] dark:text-[#F1F5F9]">Firma Digital del Tutor Registrada:</p>
                    <p>{selectedForCertificate.firmante_nombre || selectedForCertificate.tutor_nombre}</p>
                  </div>
                  <img
                    src={selectedForCertificate.firma_digital_url}
                    alt="Firma Digital"
                    className="h-10 w-auto object-contain bg-white rounded p-1 border border-slate-200"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#151A22] transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Constancia</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedForCertificate(null)}
                  className="px-5 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Enrollment Wizard Modal */}
      {isWizardOpen && (
        <NewEnrollmentWizardModal
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onEnrollmentCreated={(nueva) => {
            setToastMessage(
              `¡Solicitud ${nueva.codigo_solicitud} registrada con contrato firmado! El tutor debe presentarse en Caja para registrar el pago.`
            );
            loadData();
          }}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Mail,
  Phone,
  AlertTriangle,
  X,
  FileCheck2,
  Pencil,
  UserMinus,
  UserCheck,
  RefreshCw,
  FileText,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Clock,
  ShieldAlert,
  PenTool,
  Check,
  NotebookPen,
} from 'lucide-react';
import { AnecdotarioModal } from './AnecdotarioModal';
import { arancelDeGrupo } from '../../utils/arancel';
import {
  Estudiante,
  Grupo,
  Perfil,
  Tutor,
  SolicitudMatricula,
  GRADOS_ESCOLARES,
  EstadoEstudiante,
  EstadoPagoAnual,
} from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { NewEnrollmentWizardModal } from '../enrollment/NewEnrollmentWizardModal';
import { DigitalSignaturePad } from '../../components/DigitalSignaturePad';
import { generateInstitutionalContractText } from '../../utils/contractTemplate';

interface StudentsViewProps {
  currentProfile: Perfil;
  openNewModalInitially?: boolean;
  onNavigateToCashier?: () => void;
}

type StudentFilterTab = 'TODOS' | 'ACTIVOS' | 'BAJA' | 'RENOVACION' | 'ALERTAS';

export const StudentsView: React.FC<StudentsViewProps> = ({
  currentProfile,
  openNewModalInitially = false,
  onNavigateToCashier,
}) => {
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [tutores, setTutores] = useState<Tutor[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<StudentFilterTab>('TODOS');
  // All new student matriculas must sign a formal contract via the wizard
  const [isEnrollmentWizardOpen, setIsEnrollmentWizardOpen] = useState(openNewModalInitially);
  const [solicitudes, setSolicitudes] = useState<SolicitudMatricula[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Anecdotario (solo ADMIN en este módulo)
  const [anecdotarioStudent, setAnecdotarioStudent] = useState<Estudiante | null>(null);
  const [conteoAnotaciones, setConteoAnotaciones] = useState<Map<string, number>>(new Map());

  // Edit Student state
  const [editingStudent, setEditingStudent] = useState<Estudiante | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editApellido, setEditApellido] = useState('');
  const [editMatricula, setEditMatricula] = useState('');
  const [editGrado, setEditGrado] = useState<string>('5to Grado');
  const [editAulaRegular, setEditAulaRegular] = useState('Aula 5-A');
  const [editTutorNombre, setEditTutorNombre] = useState('');
  const [editEstado, setEditEstado] = useState<EstadoEstudiante>('ACTIVO');
  const [editContratoVigente, setEditContratoVigente] = useState(true);
  const [editEstadoPagoAnual, setEditEstadoPagoAnual] = useState<EstadoPagoAnual>('AL_DIA');
  const [editCicloActual, setEditCicloActual] = useState('2026');

  // Baja temporal state and modal
  const [studentToBaja, setStudentToBaja] = useState<Estudiante | null>(null);
  const [motivoBaja, setMotivoBaja] = useState('Baja temporal solicitada por el tutor');
  const [detalleMotivoBaja, setDetalleMotivoBaja] = useState('');

  // Renovación anual de contrato y pago state and modal
  const [studentToRenovar, setStudentToRenovar] = useState<Estudiante | null>(null);
  const [renovacionCiclo, setRenovacionCiclo] = useState('2026');
  const [renovacionContratoVigente, setRenovacionContratoVigente] = useState(true);
  const [renovacionEstadoPago, setRenovacionEstadoPago] = useState<EstadoPagoAnual>('AL_DIA');
  const [renovacionFirmaDigitalUrl, setRenovacionFirmaDigitalUrl] = useState('');
  const [renovacionFirmanteNombre, setRenovacionFirmanteNombre] = useState('');
  const [renovacionAceptaTerminos, setRenovacionAceptaTerminos] = useState(false);
  const [renovacionError, setRenovacionError] = useState<string | null>(null);

  // Campos actualizables del alumno y tutor en la renovación
  const [renovacionNombre, setRenovacionNombre] = useState('');
  const [renovacionApellido, setRenovacionApellido] = useState('');
  const [renovacionGrado, setRenovacionGrado] = useState<string>('5to Grado');
  const [renovacionAulaRegular, setRenovacionAulaRegular] = useState('Aula 5-A');
  const [renovacionEdad, setRenovacionEdad] = useState<number | string>(11);
  const [renovacionTutorNombre, setRenovacionTutorNombre] = useState('');
  const [renovacionTutorTelefono, setRenovacionTutorTelefono] = useState('');
  const [renovacionTutorEmail, setRenovacionTutorEmail] = useState('');
  const [renovacionTutorParentesco, setRenovacionTutorParentesco] = useState('Madre');

  const loadData = () => {
    setEstudiantes(storageService.getEstudiantes());
    setTutores(storageService.getTutores());
    setGrupos(storageService.getGrupos());
    setSolicitudes(storageService.getSolicitudesMatricula());
    setConteoAnotaciones(storageService.contarAnotacionesPorEstudiante());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToData(() => loadData());
    return () => unsub();
  }, []);

  const alertas = useMemo(() => {
    return storageService.calcularAlertasEstudiantes();
  }, [estudiantes]);

  const handleOpenEditModal = (est: Estudiante) => {
    setEditingStudent(est);
    setEditNombre(est.nombre);
    setEditApellido(est.apellido);
    setEditMatricula(est.matricula);
    setEditGrado(est.grado || '5to Grado');
    setEditAulaRegular(est.aula_regular || 'Aula Regular');
    setEditEstado(est.estado || 'ACTIVO');
    setEditContratoVigente(est.contrato_vigente ?? true);
    setEditEstadoPagoAnual(est.estado_pago_anual || 'AL_DIA');
    setEditCicloActual(est.ciclo_actual || '2026');
    const existingTutor = tutores.find((t) => t.id === est.tutor_id);
    setEditTutorNombre(existingTutor ? existingTutor.nombre : '');
  };

  const handleUpdateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !editNombre.trim() || !editApellido.trim() || !editMatricula.trim()) return;

    try {
      let resolvedTutorId = editingStudent.tutor_id;

      if (editTutorNombre.trim()) {
        const cleanTutorName = editTutorNombre.trim();
        if (editingStudent.tutor_id) {
          const currentTutor = tutores.find((t) => t.id === editingStudent.tutor_id);
          if (currentTutor) {
            storageService.actualizarTutor(currentTutor.id, {
              nombre: cleanTutorName,
            });
            resolvedTutorId = currentTutor.id;
          }
        } else {
          const match = tutores.find(
            (t) => t.nombre.toLowerCase() === cleanTutorName.toLowerCase()
          );
          if (match) {
            resolvedTutorId = match.id;
          } else {
            const nuevoTutor = storageService.agregarTutor({
              nombre: cleanTutorName,
              email: `${cleanTutorName.toLowerCase().replace(/\s+/g, '.')}@familiar.cca.edu.ni`,
              telefono: '+505 8800-0000',
              parentesco: 'Tutor Legal',
            });
            resolvedTutorId = nuevoTutor.id;
          }
        }
      }

      storageService.actualizarEstudiante(editingStudent.id, {
        nombre: editNombre.trim(),
        apellido: editApellido.trim(),
        matricula: editMatricula.trim().toUpperCase(),
        grado: editGrado,
        aula_regular: editAulaRegular.trim() || 'Aula Regular',
        tutor_id: resolvedTutorId,
        estado: editEstado,
        contrato_vigente: editContratoVigente,
        estado_pago_anual: editEstadoPagoAnual,
        ciclo_actual: editCicloActual.trim() || '2026',
        solvente: editEstadoPagoAnual === 'AL_DIA',
      });

      setToastMessage(`Estudiante ${editNombre.trim()} ${editApellido.trim()} actualizado correctamente.`);
      setEditingStudent(null);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al actualizar el estudiante');
    }
  };

  // Handle Dar de Baja Temporal (without deleting record)
  const handleOpenBajaModal = (est: Estudiante) => {
    setStudentToBaja(est);
    setMotivoBaja('Baja temporal voluntaria solicitada por el tutor');
    setDetalleMotivoBaja('');
  };

  const handleConfirmBaja = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentToBaja) return;

    const fullReason = detalleMotivoBaja.trim()
      ? `${motivoBaja} - ${detalleMotivoBaja.trim()}`
      : motivoBaja;

    storageService.darDeBajaEstudiante(studentToBaja.id, fullReason);
    setToastMessage(
      `"${studentToBaja.nombre} ${studentToBaja.apellido}" ha sido dado de baja temporalmente. Su expediente e historial continúan intactos en el sistema.`
    );
    setStudentToBaja(null);
    setDetalleMotivoBaja('');
    loadData();
  };

  // Handle Reactivar Alumno
  const handleReactivar = (est: Estudiante) => {
    storageService.reactivarEstudiante(est.id);
    setToastMessage(
      `"${est.nombre} ${est.apellido}" ha sido reactivado satisfactoriamente y reincorporado a los listados activos.`
    );
    loadData();
  };

  // Handle Renovación Anual de Contrato y Firma Digital
  const handleOpenRenovarModal = (est: Estudiante) => {
    setStudentToRenovar(est);
    const tutor = tutores.find((t) => t.id === est.tutor_id);
    setRenovacionCiclo(est.ciclo_actual || storageService.getConfiguracion().ciclo_academico_actual || '2026');
    setRenovacionContratoVigente(true);
    setRenovacionEstadoPago(est.estado_pago_anual || 'AL_DIA');

    // Inicializar datos del estudiante editables para el nuevo ciclo
    setRenovacionNombre(est.nombre || '');
    setRenovacionApellido(est.apellido || '');
    setRenovacionGrado(est.grado || '5to Grado');
    setRenovacionAulaRegular(est.aula_regular || 'Aula Regular');
    setRenovacionEdad(est.edad ?? 11);

    // Inicializar datos del tutor editables para el nuevo ciclo
    const tutorNombre = tutor ? tutor.nombre : (est.firmante_nombre || '');
    setRenovacionTutorNombre(tutorNombre);
    setRenovacionTutorTelefono(tutor ? tutor.telefono : '+505 8800-0000');
    setRenovacionTutorEmail(tutor ? tutor.email : 'familiar@cca.edu.ni');
    setRenovacionTutorParentesco(tutor?.parentesco || 'Tutor Legal');
    setRenovacionFirmanteNombre(tutorNombre || `${est.nombre} (Tutor)`);

    setRenovacionFirmaDigitalUrl(est.firma_digital_url || '');
    setRenovacionAceptaTerminos(false);
    setRenovacionError(null);
  };

  // Generate dynamic contract text for annual renewal using real-time updated values
  const renovacionContratoTexto = useMemo(() => {
    if (!studentToRenovar) return '';
    const studentWorkshops = storageService.getGruposByEstudiante(studentToRenovar.id);
    const workshopNames =
      studentWorkshops.length > 0
        ? studentWorkshops.map((w) => w.nombre).join(', ')
        : 'Talleres de Formación Artística y Cultural Vespertina';
    const workshopHorarios =
      studentWorkshops.length > 0
        ? studentWorkshops.map((w) => `${w.hora_inicio} a ${w.hora_fin}`).join(' / ')
        : 'Horario Vespertino Programado';

    const cleanNombre = `${renovacionNombre.trim()} ${renovacionApellido.trim()}`.trim() || `${studentToRenovar.nombre} ${studentToRenovar.apellido}`;
    const cleanTutor = renovacionTutorNombre.trim() || renovacionFirmanteNombre.trim() || 'Tutor Responsable';

    return generateInstitutionalContractText({
      codigoAlumno: studentToRenovar.matricula,
      nombreAlumno: cleanNombre,
      edad: Number(renovacionEdad) || studentToRenovar.edad || 11,
      grado: renovacionGrado || studentToRenovar.grado || '5to Grado',
      aulaRegular: renovacionAulaRegular.trim() || studentToRenovar.aula_regular || 'Aula Regular',
      nombreTutor: cleanTutor,
      cedulaTutor: renovacionTutorParentesco || 'Tutor Legal',
      parentesco: renovacionTutorParentesco || 'Tutor Legal',
      telefonoTutor: renovacionTutorTelefono || '+505 8800-0000',
      emailTutor: renovacionTutorEmail || 'familiar@cca.edu.ni',
      tallerNombre: workshopNames,
      tallerHorario: workshopHorarios,
      tallerDias: 'Según talleres asignados',
      tallerAula: 'Talleres Extracurriculares',
      cicloAcademico: `RENOVACIÓN ANUAL CICLO ${renovacionCiclo}`,
      // Mismo arancel que se cobrará en Caja (el del primer taller del alumno)
      arancel: arancelDeGrupo(studentWorkshops[0]),
    });
  }, [
    studentToRenovar,
    renovacionCiclo,
    renovacionNombre,
    renovacionApellido,
    renovacionEdad,
    renovacionGrado,
    renovacionAulaRegular,
    renovacionTutorNombre,
    renovacionTutorTelefono,
    renovacionTutorEmail,
    renovacionTutorParentesco,
    renovacionFirmanteNombre,
  ]);

  const handleConfirmRenovacion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentToRenovar) return;

    setRenovacionError(null);

    if (!renovacionNombre.trim() || !renovacionApellido.trim()) {
      setRenovacionError('Por favor ingrese el nombre y apellido completos del estudiante.');
      return;
    }

    if (!renovacionTutorNombre.trim()) {
      setRenovacionError('Por favor ingrese el nombre completo del tutor responsable.');
      return;
    }

    const firmanteFinal = renovacionFirmanteNombre.trim() || renovacionTutorNombre.trim();
    if (!firmanteFinal) {
      setRenovacionError('Por favor ingrese el nombre del tutor que firma el contrato.');
      return;
    }

    if (!renovacionFirmaDigitalUrl) {
      setRenovacionError('El padre de familia o tutor debe consignar su firma digital en el recuadro interactivo.');
      return;
    }

    if (!renovacionAceptaTerminos) {
      setRenovacionError('Debe marcar la casilla de aceptación de los términos del contrato institucional.');
      return;
    }

    try {
      const res = storageService.crearSolicitudRenovacion({
        estudiante_id: studentToRenovar.id,
        ciclo: renovacionCiclo.trim() || '2026',
        codigo_alumno: studentToRenovar.matricula,
        nombre_alumno: renovacionNombre.trim(),
        apellido_alumno: renovacionApellido.trim(),
        edad: Number(renovacionEdad) || studentToRenovar.edad || 11,
        grado: renovacionGrado,
        aula_regular: renovacionAulaRegular.trim() || 'Aula Regular',
        tutor_nombre: renovacionTutorNombre.trim(),
        tutor_email: renovacionTutorEmail.trim() || 'familiar@cca.edu.ni',
        tutor_telefono: renovacionTutorTelefono.trim() || '+505 8800-0000',
        tutor_parentesco: renovacionTutorParentesco.trim() || 'Tutor Legal',
        contrato_texto: renovacionContratoTexto,
        firma_digital_url: renovacionFirmaDigitalUrl,
        firmante_nombre: firmanteFinal,
        // El arancel lo resuelve el servicio según el taller del alumno
      });

      setToastMessage(
        `Trámite de renovación registrado (${res.solicitud.codigo_solicitud}). El expediente fue enviado a la Ventanilla de Caja para verificación de pago y alta oficial del alumno.`
      );

      setStudentToRenovar(null);
      loadData();
    } catch (err: unknown) {
      setRenovacionError(err instanceof Error ? err.message : 'Error al procesar la renovación');
    }
  };

  const filteredEstudiantes = useMemo(() => {
    return estudiantes.filter((est) => {
      const q = searchQuery.toLowerCase();
      const tutor = tutores.find((t) => t.id === est.tutor_id);
      const matchesSearch =
        est.nombre.toLowerCase().includes(q) ||
        est.apellido.toLowerCase().includes(q) ||
        est.matricula.toLowerCase().includes(q) ||
        (tutor && tutor.nombre.toLowerCase().includes(q)) ||
        (tutor && tutor.email.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (filterTab === 'ACTIVOS') {
        return est.estado !== 'BAJA';
      }
      if (filterTab === 'BAJA') {
        return est.estado === 'BAJA';
      }
      if (filterTab === 'RENOVACION') {
        return (
          est.estado === 'PENDIENTE_RENOVACION' ||
          !est.contrato_vigente ||
          est.estado_pago_anual === 'PENDIENTE'
        );
      }
      if (filterTab === 'ALERTAS') {
        const al = alertas.find((a) => a.estudiante_id === est.id);
        return al && al.tiene_alerta;
      }

      return true;
    });
  }, [estudiantes, tutores, searchQuery, filterTab, alertas]);

  const pendingCashierCount = solicitudes.filter((s) => s.estado === 'PENDIENTE_CAJA').length;

  const countActivos = estudiantes.filter((e) => e.estado !== 'BAJA').length;
  const countBaja = estudiantes.filter((e) => e.estado === 'BAJA').length;
  const countRenovacionPendiente = estudiantes.filter(
    (e) => !e.contrato_vigente || e.estado_pago_anual === 'PENDIENTE' || e.estado === 'PENDIENTE_RENOVACION'
  ).length;
  const countAlertas = alertas.filter((a) => a.tiene_alerta).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fadeIn">
      {/* Toast Notice */}
      {toastMessage && (
        <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Cashier Notice */}
      {pendingCashierCount > 0 && currentProfile.rol === 'ADMIN' && (
        <div className="bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3 rounded-xl text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>
              Hay <strong>{pendingCashierCount}</strong> solicitud(es) de matrícula pendientes en Caja.
            </span>
          </div>
          {onNavigateToCashier && (
            <button
              onClick={onNavigateToCashier}
              className="text-amber-800 dark:text-amber-300 hover:underline font-semibold text-xs cursor-pointer"
            >
              Ir a Caja →
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Estudiantes y Expedientes
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Matrículas formalizadas con contrato digital, renovación anual con firma y gestión de bajas sin eliminar registros.
          </p>
        </div>

        {/* Action Button: Formal Enrollment with Contract */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setIsEnrollmentWizardOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Matrícula con Contrato</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar estudiante, matrícula o tutor..."
            className="w-full pl-8.5 pr-3 py-1.5 bg-white dark:bg-[#141A23] border border-slate-200/80 dark:border-slate-800/80 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Status Segmented Filter */}
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterTab('TODOS')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
              filterTab === 'TODOS'
                ? 'bg-white dark:bg-[#141A23] text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Todos ({estudiantes.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('ACTIVOS')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
              filterTab === 'ACTIVOS'
                ? 'bg-white dark:bg-[#141A23] text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Activos ({countActivos})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('BAJA')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
              filterTab === 'BAJA'
                ? 'bg-white dark:bg-[#141A23] text-rose-600 dark:text-rose-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Dados de Baja ({countBaja})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('RENOVACION')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
              filterTab === 'RENOVACION'
                ? 'bg-white dark:bg-[#141A23] text-amber-600 dark:text-amber-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Pendiente Renovación ({countRenovacionPendiente})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('ALERTAS')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
              filterTab === 'ALERTAS'
                ? 'bg-white dark:bg-[#141A23] text-purple-600 dark:text-purple-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Con Alertas ({countAlertas})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#141A23] rounded-xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800/80 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/30">
                <th className="py-3 px-5">Estudiante</th>
                <th className="py-3 px-4">Contrato & Pago Anual</th>
                <th className="py-3 px-4">Tutor Responsable</th>
                <th className="py-3 px-4 text-center">Inasistencias</th>
                <th className="py-3 px-4 text-center">Condición</th>
                <th className="py-3 px-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {filteredEstudiantes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                    No se encontraron estudiantes en este filtro.
                  </td>
                </tr>
              ) : (
                filteredEstudiantes.map((est) => {
                  const tutor = tutores.find((t) => t.id === est.tutor_id);
                  const estAlertas = alertas.filter((a) => a.estudiante_id === est.id);
                  const maxAlert =
                    estAlertas.find((a) => a.nivel_alerta === 'CRITICA') ||
                    estAlertas.find((a) => a.nivel_alerta === 'ADVERTENCIA');

                  const isBaja = est.estado === 'BAJA';
                  const isContratoVigente = est.contrato_vigente ?? true;
                  const isPagoAlDia = est.estado_pago_anual === 'AL_DIA' || (est.solvente !== false && est.estado_pago_anual !== 'PENDIENTE');
                  const isExento = est.estado_pago_anual === 'EXENTO';
                  const needsRenovacion = !isContratoVigente || est.estado_pago_anual === 'PENDIENTE';

                  return (
                    <tr
                      key={est.id}
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors ${
                        isBaja ? 'opacity-75 bg-slate-50/30 dark:bg-slate-900/20' : ''
                      }`}
                    >
                      {/* Estudiante */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg font-semibold flex items-center justify-center text-xs shrink-0 ${
                              isBaja
                                ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/50'
                            }`}
                          >
                            {est.nombre[0]}{est.apellido[0]}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{est.nombre} {est.apellido}</span>
                              {isBaja && (
                                <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/60">
                                  Baja
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                              <span className="font-mono">{est.matricula}</span>
                              {est.grado && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{est.grado}</span>
                                </>
                              )}
                              {est.aula_regular && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{est.aula_regular}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contrato & Pago Anual */}
                      <td className="py-3.5 px-4 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 font-medium">
                              Ciclo {est.ciclo_actual || '2026'}
                            </span>
                            {isContratoVigente ? (
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>Contrato Firmado</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Contrato Pendiente</span>
                              </span>
                            )}
                          </div>

                          <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <span>Arancel Anual:</span>
                            {isExento ? (
                              <span className="text-blue-600 dark:text-blue-400 font-medium">Exento / Beca</span>
                            ) : isPagoAlDia ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Solvente al día</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">Pendiente en Caja</span>
                            )}
                            {est.numero_recibo_anual && (
                              <span className="font-mono text-[9px] text-slate-400">({est.numero_recibo_anual})</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Tutor Responsable */}
                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                        <div className="font-medium">{tutor ? tutor.nombre : <span className="text-slate-400 italic">Sin tutor</span>}</div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>{tutor?.telefono || 'N/A'}</span>
                          {tutor?.email && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-[130px]">{tutor.email}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Inasistencias */}
                      <td className="py-3.5 px-4 text-center tabular-nums">
                        <span
                          className={`font-mono text-xs font-semibold ${
                            (maxAlert?.total_ausencias || 0) >= 3
                              ? 'text-rose-600 dark:text-rose-400'
                              : (maxAlert?.total_ausencias || 0) > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {maxAlert?.total_ausencias || 0}
                        </span>
                      </td>

                      {/* Condición / Estado */}
                      <td className="py-3.5 px-4 text-center">
                        {isBaja ? (
                          <div title={est.motivo_baja ? `Motivo: ${est.motivo_baja}` : 'Dado de baja temporal'}>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              <span>Dado de Baja</span>
                            </span>
                            {est.motivo_baja && (
                              <span className="block text-[9px] text-slate-400 mt-0.5 max-w-[120px] mx-auto truncate">
                                {est.motivo_baja}
                              </span>
                            )}
                          </div>
                        ) : needsRenovacion ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            <span>Pend. Renovación</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Activo / Vigente</span>
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* Anecdotario (solo Dirección) */}
                          {currentProfile.rol === 'ADMIN' && (
                            <button
                              onClick={() => setAnecdotarioStudent(est)}
                              className="p-1.5 rounded-lg text-[#4F46E5] dark:text-[#818CF8] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer inline-flex items-center gap-1"
                              title="Anecdotario del estudiante"
                              aria-label={`Anecdotario de ${est.nombre} ${est.apellido}`}
                            >
                              <NotebookPen className="w-3.5 h-3.5" />
                              {(conteoAnotaciones.get(est.id) || 0) > 0 && (
                                <span className="text-[10px] font-bold font-mono">{conteoAnotaciones.get(est.id)}</span>
                              )}
                            </button>
                          )}

                          {/* Editar */}
                          <button
                            onClick={() => handleOpenEditModal(est)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Editar datos del estudiante"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {/* Renovar Contrato / Pago Anual con Firma */}
                          <button
                            onClick={() => handleOpenRenovarModal(est)}
                            className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer"
                            title="Renovar contrato institucional con firma digital y pago"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          {/* Dar de Baja vs Reactivar */}
                          {isBaja ? (
                            <button
                              onClick={() => handleReactivar(est)}
                              className="px-2 py-1 rounded-lg text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition-colors inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                              title="Reincorporar estudiante a cursos"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Reactivar</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenBajaModal(est)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                              title="Dar de baja temporal (sin eliminar)"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* MODAL: DAR DE BAJA TEMPORAL */}
      {studentToBaja && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserMinus className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Dar de Baja Temporal
                </h3>
              </div>
              <button
                onClick={() => setStudentToBaja(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmBaja} className="p-6 space-y-4 text-xs">
              <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3.5 rounded-xl border border-rose-200/80 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs space-y-1">
                <p className="font-semibold">
                  Alumno: {studentToBaja.nombre} {studentToBaja.apellido} ({studentToBaja.matricula})
                </p>
                <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                  El expediente, historial de asistencias y datos del estudiante <strong>NO se eliminarán</strong>. El alumno quedará en estado inactivo temporal y podrá ser reactivado en cualquier momento cuando decida volver a ingresar a un curso.
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Motivo de la Baja Temporal *
                </label>
                <select
                  value={motivoBaja}
                  onChange={(e) => setMotivoBaja(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="Baja temporal voluntaria solicitada por el tutor">Baja temporal voluntaria (Solicitada por el tutor)</option>
                  <option value="Incompatibilidad de horario o clases escolares">Incompatibilidad de horario escolar</option>
                  <option value="Cese temporal por motivos personales o de salud">Motivos de salud o personales</option>
                  <option value="Cambio de domicilio">Cambio de domicilio o traslado</option>
                  <option value="Mora en aranceles o insolvencia administrativa">Insolvencia / Mora administrativa</option>
                  <option value="Otro motivo">Otro motivo</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Detalles u Observaciones (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={detalleMotivoBaja}
                  onChange={(e) => setDetalleMotivoBaja(e.target.value)}
                  placeholder="Ej. El padre de familia solicita pausa temporal por viaje trimestral..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStudentToBaja(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  <span>Confirmar Baja Temporal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RENOVACIÓN ANUAL DE CONTRATO Y PAGO CON FIRMA DIGITAL */}
      {studentToRenovar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Renovación Anual de Contrato y Firma Digital
                </h3>
              </div>
              <button
                onClick={() => setStudentToRenovar(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmRenovacion} className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              {renovacionError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{renovacionError}</span>
                </div>
              )}

              {/* Student Header */}
              <div className="bg-slate-50 dark:bg-[#1A222D] p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                    {studentToRenovar.nombre} {studentToRenovar.apellido}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Matrícula: {studentToRenovar.matricula} · {studentToRenovar.grado} · {studentToRenovar.aula_regular}
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded font-bold border border-indigo-200 dark:border-indigo-900">
                    Ciclo a Renovar: {renovacionCiclo}
                  </span>
                </div>
              </div>

              {/* Actualización de Datos del Alumno y Tutor para el Nuevo Ciclo */}
              <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#1A222D] border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-semibold text-slate-900 dark:text-white text-xs">
                      Actualización de Datos del Alumno y Tutor (Ciclo {renovacionCiclo})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Edite los datos que hayan cambiado antes de firmar
                  </span>
                </div>

                {/* Subsección 1: Datos del Estudiante */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                      1. Datos Académicos y Personales del Estudiante
                    </span>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                      Permite promover de grado escolar
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                        Nombres *
                      </label>
                      <input
                        type="text"
                        required
                        value={renovacionNombre}
                        onChange={(e) => setRenovacionNombre(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                        Apellidos *
                      </label>
                      <input
                        type="text"
                        required
                        value={renovacionApellido}
                        onChange={(e) => setRenovacionApellido(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                        Grado Escolar *
                      </label>
                      <select
                        value={renovacionGrado}
                        onChange={(e) => setRenovacionGrado(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs cursor-pointer"
                      >
                        {GRADOS_ESCOLARES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                        Aula Regular *
                      </label>
                      <input
                        type="text"
                        required
                        value={renovacionAulaRegular}
                        onChange={(e) => setRenovacionAulaRegular(e.target.value)}
                        placeholder="Ej. Aula 6-A"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                        Edad (Años)
                      </label>
                      <input
                        type="number"
                        min="3"
                        max="25"
                        value={renovacionEdad}
                        onChange={(e) => setRenovacionEdad(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Subsección 2: Datos del Tutor y Contacto */}
                <div className="space-y-2.5 pt-3 border-t border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                      2. Datos del Tutor Responsable y Contacto
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Recibirá notificaciones y contratos
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                        Nombre Completo del Tutor *
                      </label>
                      <input
                        type="text"
                        required
                        value={renovacionTutorNombre}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRenovacionTutorNombre(val);
                          setRenovacionFirmanteNombre(val);
                        }}
                        placeholder="Nombre completo del tutor"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                        Parentesco
                      </label>
                      <input
                        type="text"
                        value={renovacionTutorParentesco}
                        onChange={(e) => setRenovacionTutorParentesco(e.target.value)}
                        placeholder="Ej. Madre, Padre, Tutor Legal"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                        Teléfono Móvil (WhatsApp / Alertas) *
                      </label>
                      <input
                        type="text"
                        required
                        value={renovacionTutorTelefono}
                        onChange={(e) => setRenovacionTutorTelefono(e.target.value)}
                        placeholder="+505 8800-0000"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                        Correo Electrónico
                      </label>
                      <input
                        type="email"
                        value={renovacionTutorEmail}
                        onChange={(e) => setRenovacionTutorEmail(e.target.value)}
                        placeholder="familiar@correo.com"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Ciclo input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Año / Ciclo Académico a Renovar *
                  </label>
                  <input
                    type="text"
                    required
                    value={renovacionCiclo}
                    onChange={(e) => setRenovacionCiclo(e.target.value)}
                    placeholder="Ej. 2026 o 2027"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombre del Firmante en Contrato *
                  </label>
                  <input
                    type="text"
                    required
                    value={renovacionFirmanteNombre}
                    onChange={(e) => setRenovacionFirmanteNombre(e.target.value)}
                    placeholder="Nombre completo del padre o tutor"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                  />
                </div>
              </div>

              {/* Contrato Institucional Reader */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Contrato Institucional de Prestación de Servicios Educativos ({renovacionCiclo})</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Lectura requerida</span>
                </div>
                <div className="p-3.5 max-h-44 overflow-y-auto font-mono text-[10px] leading-relaxed bg-slate-50 dark:bg-[#1A222D] rounded-xl border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 whitespace-pre-wrap select-all">
                  {renovacionContratoTexto}
                </div>
              </div>

              {/* Digital Signature Pad */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <PenTool className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Firma Digital del Tutor / Responsable *</span>
                  </label>
                  {renovacionFirmaDigitalUrl ? (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Firma registrada</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-rose-500 font-medium">
                      Firma obligatoria en el recuadro
                    </span>
                  )}
                </div>

                <DigitalSignaturePad
                  signerName={renovacionFirmanteNombre.trim() || 'Tutor Responsable'}
                  onSaveSignature={(dataUrl) => {
                    setRenovacionFirmaDigitalUrl(dataUrl);
                    setRenovacionError(null);
                  }}
                  initialSignature={renovacionFirmaDigitalUrl}
                />
              </div>

              {/* Checkbox Aceptación */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={renovacionAceptaTerminos}
                  onChange={(e) => setRenovacionAceptaTerminos(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0"
                />
                <span className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                  Declaro bajo fe de juramento que he leído y acepto todas las cláusulas, deberes de asistencia del 80% y normativas del <strong>Contrato Anual de Renovación de Talleres para el ciclo {renovacionCiclo}</strong>, autorizando la emisión de la firma digital correspondiente.
                </span>
              </label>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStudentToRenovar(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!renovacionFirmaDigitalUrl || !renovacionAceptaTerminos || !renovacionFirmanteNombre.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Firmar Contrato y Enviar a Ventanilla de Caja</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Alumno */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Editar Alumno: {editingStudent.nombre} {editingStudent.apellido}
                </h3>
              </div>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateStudent} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombres *
                  </label>
                  <input
                    type="text"
                    required
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    required
                    value={editApellido}
                    onChange={(e) => setEditApellido(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Código de Matrícula *
                  </label>
                  <input
                    type="text"
                    required
                    value={editMatricula}
                    onChange={(e) => setEditMatricula(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tutor Responsable
                  </label>
                  <input
                    type="text"
                    value={editTutorNombre}
                    onChange={(e) => setEditTutorNombre(e.target.value)}
                    placeholder="Ej: Mariana Cordero"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Grado Escolar
                  </label>
                  <select
                    value={editGrado}
                    onChange={(e) => setEditGrado(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {GRADOS_ESCOLARES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Aula Regular
                  </label>
                  <input
                    type="text"
                    value={editAulaRegular}
                    onChange={(e) => setEditAulaRegular(e.target.value)}
                    placeholder="Ej: Aula 5-A"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Estado y Renovación en edición */}
              <div className="p-3 bg-slate-50 dark:bg-[#1A222D] rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-wider">
                  Condición y Contrato Anual
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Estado del Alumno
                    </label>
                    <select
                      value={editEstado}
                      onChange={(e) => setEditEstado(e.target.value as EstadoEstudiante)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="ACTIVO">Activo</option>
                      <option value="BAJA">Dado de Baja</option>
                      <option value="PENDIENTE_RENOVACION">Pendiente Renovación</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Ciclo Académico
                    </label>
                    <input
                      type="text"
                      value={editCicloActual}
                      onChange={(e) => setEditCicloActual(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Estado Pago Anual
                    </label>
                    <select
                      value={editEstadoPagoAnual}
                      onChange={(e) => setEditEstadoPagoAnual(e.target.value as EstadoPagoAnual)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="AL_DIA">Al Día / Solvente</option>
                      <option value="PENDIENTE">Pendiente en Caja</option>
                      <option value="EXENTO">Exento / Beca</option>
                    </select>
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editContratoVigente}
                        onChange={(e) => setEditContratoVigente(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                        Contrato Vigente
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enrollment Wizard with Mandatory Contract & Digital Signature */}
      {isEnrollmentWizardOpen && (
        <NewEnrollmentWizardModal
          isOpen={isEnrollmentWizardOpen}
          onClose={() => setIsEnrollmentWizardOpen(false)}
          onEnrollmentCreated={(sol) => setToastMessage(`Solicitud de matrícula ${sol.codigo_solicitud} registrada con contrato y firma digital.`)}
        />
      )}

      {/* Anecdotario del estudiante */}
      {anecdotarioStudent && (
        <AnecdotarioModal
          estudiante={anecdotarioStudent}
          currentProfile={currentProfile}
          onClose={() => setAnecdotarioStudent(null)}
        />
      )}
    </div>
  );
};

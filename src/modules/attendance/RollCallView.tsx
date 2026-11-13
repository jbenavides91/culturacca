import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Check,
  X,
  FileEdit,
  Clock,
  Search,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ChevronLeft,
  ChevronRight,
  Send,
  Users,
  FileSpreadsheet,
  Info,
  Sparkles,
  MapPin,
  CalendarDays,
  Pencil,
  ChevronDown,
  BookOpen,
  CalendarRange,
  CheckCheck,
  NotebookPen,
  CalendarPlus,
} from 'lucide-react';
import { AnecdotarioModal } from '../students/AnecdotarioModal';
import { fechaLocalISO } from '../../utils/fechas';

type EstadoSesionUI = 'CERRADA' | 'HOY' | 'PENDIENTE' | 'PROGRAMADA';

/** Estado visual de una sesión según la fecha y hora LOCAL actuales */
const estadoSesion = (s: Sesion): { estado: EstadoSesionUI; texto: string } => {
  if (s.cerrada) return { estado: 'CERRADA', texto: 'Lista formalizada' };
  const ahora = new Date();
  const hoy = fechaLocalISO(ahora);
  if (s.fecha === hoy) {
    const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    return {
      estado: 'HOY',
      texto: s.hora_inicio > horaActual ? `Hoy · inicia ${s.hora_inicio}` : 'En curso (Hoy)',
    };
  }
  if (s.fecha < hoy) return { estado: 'PENDIENTE', texto: 'Sin cerrar' };
  return { estado: 'PROGRAMADA', texto: 'Programada' };
};
import {
  AlertaEstudiante,
  Asistencia,
  Estudiante,
  EstatusAsistencia,
  Grupo,
  Perfil,
  Sesion,
  Tutor,
} from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { exportService } from '../../services/export.service';
import { JustificationModal } from './JustificationModal';
import { CloseSessionModal } from './CloseSessionModal';
import { RectificationModal } from './RectificationModal';

interface RollCallViewProps {
  currentProfile: Perfil;
  initialGrupoId?: string;
  /** Sesión a abrir directamente (p. ej. desde el Panel) */
  initialSesionId?: string;
}

export const RollCallView: React.FC<RollCallViewProps> = ({
  currentProfile,
  initialGrupoId,
  initialSesionId,
}) => {
  // Data states
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [selectedGrupoId, setSelectedGrupoId] = useState<string>(initialGrupoId || '');
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [selectedSesionId, setSelectedSesionId] = useState<string>(initialSesionId || '');
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [tutores, setTutores] = useState<Tutor[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [allAsistencias, setAllAsistencias] = useState<Asistencia[]>([]);
  const [alertas, setAlertas] = useState<AlertaEstudiante[]>([]);

  // UI & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | EstatusAsistencia | 'ALERTAS'>('TODOS');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);

  // Modals
  const [justificationModalOpen, setJustificationModalOpen] = useState(false);
  const [activeJustifyStudent, setActiveJustifyStudent] = useState<Estudiante | null>(null);
  const [activeAsistencia, setActiveAsistencia] = useState<Asistencia | null>(null);

  const [rectificationModalOpen, setRectificationModalOpen] = useState(false);
  const [rectifyTargetStudent, setRectifyTargetStudent] = useState<Estudiante | null>(null);
  const [rectifyTargetAsistencia, setRectifyTargetAsistencia] = useState<Asistencia | null>(null);
  const [rectifyInitialStatus, setRectifyInitialStatus] = useState<EstatusAsistencia | undefined>(undefined);

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [anecdotarioStudent, setAnecdotarioStudent] = useState<Estudiante | null>(null);
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [extraFecha, setExtraFecha] = useState('');
  const [extraHoraInicio, setExtraHoraInicio] = useState('');
  const [extraHoraFin, setExtraHoraFin] = useState('');
  const [extraTema, setExtraTema] = useState('');
  const [extraError, setExtraError] = useState<string | null>(null);
  const [conteoAnotaciones, setConteoAnotaciones] = useState<Map<string, number>>(new Map());
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const sessionPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sessionPickerRef.current && !sessionPickerRef.current.contains(e.target as Node)) {
        setSessionPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSessionAttendanceRate = (sesionId: string) => {
    const records = allAsistencias.filter((a) => a.sesion_id === sesionId);
    if (records.length === 0) return null;
    const p = records.filter((r) => r.estatus === 'PRESENTE').length;
    return Math.round((p / records.length) * 100);
  };

  // Load and subscribe to data changes
  const refreshData = () => {
    const allGrupos = storageService.getGrupos();
    const visibleGrupos = currentProfile.rol === 'PROFESOR'
      ? allGrupos.filter((g) => g.profesor_id === currentProfile.id)
      : allGrupos;
    setGrupos(visibleGrupos);

    let activeGId = selectedGrupoId;
    if ((!activeGId || !visibleGrupos.some((g) => g.id === activeGId)) && visibleGrupos.length > 0) {
      activeGId = visibleGrupos[0].id;
      setSelectedGrupoId(activeGId);
    }

    if (activeGId) {
      const gSesiones = storageService.getSesionesByGrupo(activeGId);
      setSesiones(gSesiones);

      // Por defecto: la sesión de hoy; si no hay, la próxima; si no, la última
      if (!selectedSesionId || !gSesiones.some((s) => s.id === selectedSesionId)) {
        const hoy = fechaLocalISO();
        const porDefecto =
          gSesiones.find((s) => s.fecha === hoy) ||
          gSesiones.find((s) => s.fecha > hoy) ||
          gSesiones[gSesiones.length - 1];
        if (porDefecto) {
          setSelectedSesionId(porDefecto.id);
        }
      }

      setEstudiantes(storageService.getEstudiantesByGrupo(activeGId));
      setAlertas(storageService.calcularAlertasEstudiantes(activeGId));
    }

    setTutores(storageService.getTutores());
    setConteoAnotaciones(storageService.contarAnotacionesPorEstudiante());
    setAllAsistencias(storageService.getAsistencias());
    if (selectedSesionId) {
      setAsistencias(storageService.getAsistenciasBySesion(selectedSesionId));
    }
  };

  useEffect(() => {
    refreshData();
    const unsubscribe = subscribeToData(() => {
      refreshData();
    });
    return () => unsubscribe();
  }, [selectedGrupoId, selectedSesionId]);

  const activeGrupo = grupos.find((g) => g.id === selectedGrupoId) || null;
  const activeSesion = sesiones.find((s) => s.id === selectedSesionId) || null;

  // Session navigation & date formatting
  const currentSesionIndex = useMemo(() => {
    return sesiones.findIndex((s) => s.id === selectedSesionId);
  }, [sesiones, selectedSesionId]);

  const formatSessionDate = (dateStr: string) => {
    if (!dateStr) return { dayName: '', dayNum: 0, monthName: '', fullDate: '', shortDate: '' };
    const parts = dateStr.split('-');
    if (parts.length < 3) return { dayName: '', dayNum: 0, monthName: '', fullDate: dateStr, shortDate: dateStr };
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const dateObj = new Date(year, month - 1, day);

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const monthShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const dIndex = dateObj.getDay();
    return {
      dayName: dayNames[dIndex] || '',
      dayNum: day,
      monthName: monthShort[month - 1] || '',
      fullDate: `${dayNames[dIndex] || ''}, ${day} de ${monthNames[month - 1] || ''} de ${year}`,
      shortDate: `${day} ${monthShort[month - 1] || ''}`,
    };
  };

  const activeDateInfo = useMemo(() => {
    return formatSessionDate(activeSesion?.fecha || '');
  }, [activeSesion?.fecha]);

  const handlePrevSession = () => {
    if (currentSesionIndex > 0) {
      setSelectedSesionId(sesiones[currentSesionIndex - 1].id);
    }
  };

  const handleNextSession = () => {
    if (currentSesionIndex < sesiones.length - 1) {
      setSelectedSesionId(sesiones[currentSesionIndex + 1].id);
    }
  };

  // Sesión cuya fecha aún no llega: no se puede tomar lista ni cerrar
  const sesionFutura = !!activeSesion && storageService.esSesionFutura(activeSesion);

  // ---------- Sesión extraordinaria ----------
  const puedeAgregarExtra =
    !!activeGrupo &&
    (currentProfile.rol === 'ADMIN' ||
      (currentProfile.rol === 'PROFESOR' && activeGrupo.profesor_id === currentProfile.id));

  const abrirSesionExtra = () => {
    if (!activeGrupo) return;
    setExtraFecha(fechaLocalISO());
    setExtraHoraInicio(activeGrupo.hora_inicio);
    setExtraHoraFin(activeGrupo.hora_fin);
    setExtraTema('');
    setExtraError(null);
    setExtraModalOpen(true);
  };

  const handleCrearSesionExtra = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGrupo) return;
    setExtraError(null);
    try {
      const sesion = storageService.agregarSesionExtraordinaria(activeGrupo.id, {
        fecha: extraFecha,
        hora_inicio: extraHoraInicio,
        hora_fin: extraHoraFin,
        tema: extraTema,
      });
      setExtraModalOpen(false);
      setSelectedSesionId(sesion.id);
      setFeedbackMessage({
        type: 'success',
        text: `Sesión extraordinaria creada para ${formatSessionDate(sesion.fecha).fullDate}.`,
      });
    } catch (err: unknown) {
      setExtraError(err instanceof Error ? err.message : 'No se pudo crear la sesión.');
    }
  };

  const avisarSesionFutura = () =>
    setFeedbackMessage({
      type: 'warning',
      text: 'Esta sesión aún no llega. La toma de lista se habilita el mismo día de la clase.',
    });

  // Change attendance status
  const handleSetStatus = (estudianteId: string, newStatus: EstatusAsistencia) => {
    if (!activeSesion) return;
    if (sesionFutura) {
      avisarSesionFutura();
      return;
    }

    const existingAsist = asistencias.find((a) => a.estudiante_id === estudianteId);
    const est = estudiantes.find((e) => e.id === estudianteId) || null;

    // If session is closed, route to formal rectification modal with target status pre-selected
    if (activeSesion.cerrada) {
      if (est) {
        handleOpenRectification(est, existingAsist || null, newStatus);
      }
      return;
    }

    // Open session: standard fast marking
    if (newStatus === 'JUSTIFICADO') {
      setActiveJustifyStudent(est);
      setActiveAsistencia(existingAsist || null);
      setJustificationModalOpen(true);
      return;
    }

    try {
      storageService.upsertAsistencia(activeSesion.id, estudianteId, newStatus, null, currentProfile.id);
    } catch (err: unknown) {
      setFeedbackMessage({ type: 'warning', text: err instanceof Error ? err.message : 'No se pudo registrar.' });
    }
  };

  const handleOpenRectification = (
    estudiante: Estudiante,
    asist: Asistencia | null,
    targetStatus?: EstatusAsistencia
  ) => {
    setRectifyTargetStudent(estudiante);
    setRectifyTargetAsistencia(asist);
    setRectifyInitialStatus(
      targetStatus || (asist?.estatus === 'AUSENTE' ? 'PRESENTE' : asist?.estatus || 'PRESENTE')
    );
    setRectificationModalOpen(true);
  };

  const handleConfirmRectification = async (targetStatus: EstatusAsistencia, motivo: string) => {
    if (!activeSesion || !rectifyTargetStudent) return;

    try {
      const res = await storageService.rectificarAsistencia(
        { sesionId: activeSesion.id, estudianteId: rectifyTargetStudent.id },
        targetStatus,
        motivo,
        currentProfile.id
      );

      refreshData();

      if (res.notificacionEnviada) {
        setFeedbackMessage({
          type: 'success',
          text: `Asistencia de ${rectifyTargetStudent.nombre} rectificada a ${targetStatus}. Se despachó un correo formal de rectificación al tutor (${res.tutorEmail || 'tutor legal'}).`,
        });
      } else {
        setFeedbackMessage({
          type: 'info',
          text: `Asistencia de ${rectifyTargetStudent.nombre} rectificada a ${targetStatus}.`,
        });
      }
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'warning',
        text: err instanceof Error ? err.message : 'Error al procesar la rectificación.',
      });
    }
  };

  // Bulk mark all present
  const handleMarkAllPresent = () => {
    if (!activeSesion || activeSesion.cerrada) return;
    if (sesionFutura) {
      avisarSesionFutura();
      return;
    }
    const studentIds = estudiantes.map((e) => e.id);
    try {
      storageService.marcarTodosPresentes(activeSesion.id, studentIds, currentProfile.id);
    } catch (err: unknown) {
      setFeedbackMessage({ type: 'warning', text: err instanceof Error ? err.message : 'No se pudo registrar.' });
      return;
    }
    setFeedbackMessage({
      type: 'success',
      text: 'Se han marcado todos los alumnos matriculados como PRESENTES.',
    });
  };

  // Close session callback
  const handleConfirmCloseSession = async () => {
    if (!activeSesion) return;
    try {
      const result = await storageService.cerrarSesion(
        activeSesion.id,
        `${currentProfile.nombre} ${currentProfile.apellido}`
      );
      setFeedbackMessage({
        type: 'success',
        text: `Lista de asistencia cerrada con éxito. Se despacharon ${result.notificacionesEnviadas} notificaciones a tutores vía correo.`,
      });
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'warning',
        text: err instanceof Error ? err.message : 'Error al cerrar la sesión.',
      });
    }
  };

  // Save justification note
  const handleSaveJustification = (motivo: string) => {
    if (!activeSesion || !activeJustifyStudent) return;

    if (activeSesion.cerrada && activeAsistencia) {
      storageService
        .rectificarAsistencia(activeAsistencia.id, 'JUSTIFICADO', motivo, currentProfile.id)
        .then((res) => {
          if (res.notificacionEnviada) {
            setFeedbackMessage({
              type: 'success',
              text: 'Inasistencia rectificada como JUSTIFICADA. Notificación enviada al tutor legal.',
            });
          }
        });
    } else {
      try {
        storageService.upsertAsistencia(
          activeSesion.id,
          activeJustifyStudent.id,
          'JUSTIFICADO',
          motivo,
          currentProfile.id
        );
      } catch (err: unknown) {
        setFeedbackMessage({ type: 'warning', text: err instanceof Error ? err.message : 'No se pudo registrar.' });
        return;
      }
      setFeedbackMessage({
        type: 'info',
        text: 'Motivo de justificación guardado correctamente.',
      });
    }
  };

  // Filtered and searched students
  const filteredStudents = useMemo(() => {
    return estudiantes.filter((est) => {
      const fullName = `${est.nombre} ${est.apellido}`.toLowerCase();
      const matricula = est.matricula.toLowerCase();
      const q = searchQuery.toLowerCase();
      const matchesSearch = fullName.includes(q) || matricula.includes(q);
      if (!matchesSearch) return false;

      const record = asistencias.find((a) => a.estudiante_id === est.id);
      const currentStatus: EstatusAsistencia = record ? record.estatus : 'PRESENTE';

      if (statusFilter === 'TODOS') return true;
      if (statusFilter === 'ALERTAS') {
        const al = alertas.find((a) => a.estudiante_id === est.id);
        return al && al.tiene_alerta;
      }
      return currentStatus === statusFilter;
    });
  }, [estudiantes, searchQuery, statusFilter, asistencias, alertas]);

  // Aggregate metrics for this session
  const sessionMetrics = useMemo(() => {
    let p = 0;
    let a = 0;
    let j = 0;
    estudiantes.forEach((est) => {
      const record = asistencias.find((item) => item.estudiante_id === est.id);
      const st = record ? record.estatus : 'PRESENTE';
      if (st === 'PRESENTE') p++;
      else if (st === 'AUSENTE') a++;
      else if (st === 'JUSTIFICADO') j++;
    });
    const total = estudiantes.length;
    const rate = total > 0 ? Math.round((p / total) * 100) : 100;
    return { presentes: p, ausentes: a, justificados: j, total, rate };
  }, [estudiantes, asistencias]);

  // Past closed sessions for mini-timeline dots
  const pastClosedSessions = useMemo(() => {
    return sesiones.filter((s) => s.cerrada && s.id !== activeSesion?.id).slice(-5);
  }, [sesiones, activeSesion]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fadeIn">
      {/* Toast Feedback */}
      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-fadeIn ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : feedbackMessage.type === 'warning'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
          }`}
        >
          <div className="flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-4 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Workshop Executive Header Card */}
      <div className="bg-white dark:bg-[#141A23] rounded-2xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800/80 transition-colors space-y-4">
        {/* Row 1: Workshop Selection & Quick Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/80">
          <div className="space-y-1">
            {/* Clean Single Workshop Selector */}
            <div className="relative inline-flex items-center">
              <select
                value={selectedGrupoId}
                onChange={(e) => setSelectedGrupoId(e.target.value)}
                className="bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-900 dark:text-white text-lg sm:text-xl font-bold pr-8 py-1 outline-none cursor-pointer appearance-none transition-colors"
              >
                {grupos.map((g) => {
                  const isMyWorkshop = currentProfile.rol === 'PROFESOR' && g.profesor_id === currentProfile.id;
                  return (
                    <option key={g.id} value={g.id} className="bg-white dark:bg-[#141A23] text-slate-900 dark:text-white font-normal text-sm">
                      {g.nombre} {isMyWorkshop ? '★ (Mi Taller)' : ''}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-1 pointer-events-none" />
            </div>

            {/* Context metadata in clean unboxed line */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span>{activeGrupo?.aula || 'Aula Principal'}</span>
              <span aria-hidden="true">·</span>
              <span>{activeGrupo?.hora_inicio} - {activeGrupo?.hora_fin} hrs</span>
              <span aria-hidden="true">·</span>
              <span>{estudiantes.length} alumnos matriculados</span>
            </div>
          </div>

          {/* Action buttons (Secondary) */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
            <button
              onClick={() => activeGrupo && exportService.exportGroupToExcel(activeGrupo.id)}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#141A23] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200/80 dark:border-slate-800/80 transition-colors flex items-center space-x-1.5 cursor-pointer"
              title="Exportar reporte del taller a Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Row 2: Active Session Command & Interactive Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Stepper with Previous/Next and Central Interactive Session Dropdown */}
            <div className="relative inline-flex items-center bg-slate-50 dark:bg-[#151A22] p-1 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs" ref={sessionPickerRef}>
              <button
                onClick={handlePrevSession}
                disabled={currentSesionIndex <= 0}
                className="p-1.5 rounded-lg text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-white hover:bg-white dark:hover:bg-[#1B222D] disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title="Clase previa"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Central Interactive Popover Button */}
              <button
                onClick={() => setSessionPickerOpen(!sessionPickerOpen)}
                className="px-3 py-1.5 rounded-lg hover:bg-white dark:hover:bg-[#1B222D] text-[#172033] dark:text-[#F1F5F9] font-bold text-xs sm:text-sm flex items-center space-x-2 transition cursor-pointer"
                title="Haz clic para seleccionar cualquier fecha o sesión del taller"
              >
                <CalendarDays className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
                <span>Sesión {currentSesionIndex + 1} de {sesiones.length}</span>
                <span className="text-[#667085] dark:text-[#94A3B8] font-normal">· {activeDateInfo.shortDate}</span>
                {activeSesion?.extraordinaria && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                    Extra
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-[#667085] dark:text-[#94A3B8] transition-transform ${sessionPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              <button
                onClick={handleNextSession}
                disabled={currentSesionIndex >= sesiones.length - 1}
                className="p-1.5 rounded-lg text-[#667085] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-white hover:bg-white dark:hover:bg-[#1B222D] disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title="Clase siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Floating Session Picker Popover */}
              {sessionPickerOpen && (
                <div className="absolute top-full left-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#1B222D] shadow-xl border border-[#E7EAF0] dark:border-[#2B3442] p-3 z-40 animate-fadeIn">
                  <div className="px-3 py-2 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#172033] dark:text-[#F1F5F9]">
                      Calendario de Clases ({sesiones.length} Sesiones)
                    </span>
                    <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] font-mono">
                      {currentSesionIndex + 1}/{sesiones.length}
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-[#E7EAF0]/60 dark:divide-[#2B3442]/60">
                    {sesiones.map((s, idx) => {
                      const isSelected = s.id === selectedSesionId;
                      const sDate = formatSessionDate(s.fecha);
                      const rate = getSessionAttendanceRate(s.id);
                      const { estado, texto } = estadoSesion(s);
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSelectedSesionId(s.id);
                            setSessionPickerOpen(false);
                          }}
                          className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition cursor-pointer my-0.5 ${
                            isSelected
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-[#4F46E5] dark:text-[#818CF8] font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-[#151A22] text-[#172033] dark:text-[#F1F5F9]'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                              isSelected
                                ? 'bg-[#4F46E5] text-white'
                                : estado === 'HOY'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                                : estado === 'PENDIENTE'
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                                : 'bg-slate-100 dark:bg-slate-800 text-[#667085] dark:text-[#94A3B8]'
                            }`}>
                              {idx + 1}
                            </span>
                            <div>
                              <p className="text-xs font-semibold leading-tight flex items-center gap-1.5">
                                {sDate.fullDate || s.fecha}
                                {s.extraordinaria && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                                    Extra
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-0.5">
                                {texto}
                                {rate !== null && ` · ${rate}% asistió`}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            {estado === 'CERRADA' ? (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center space-x-1">
                                <Lock className="w-2.5 h-2.5" />
                                <span>Cerrada</span>
                              </span>
                            ) : estado === 'HOY' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Hoy</span>
                              </span>
                            ) : estado === 'PENDIENTE' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                Pendiente
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white dark:bg-[#151A22] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                Próxima
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Agregar clase fuera del calendario habitual */}
            {puedeAgregarExtra && (
              <button
                type="button"
                onClick={abrirSesionExtra}
                className="px-3 py-1.5 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-xs font-semibold hover:bg-violet-100 dark:hover:bg-violet-900/50 transition flex items-center gap-1.5 cursor-pointer"
                title="Agregar una clase fuera de los días habituales (reposición o clase extra)"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>Sesión extraordinaria</span>
              </button>
            )}

            {/* Status Pill Badge */}
            {activeSesion && estadoSesion(activeSesion).estado === 'PROGRAMADA' ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Sesión programada</span>
              </span>
            ) : !activeSesion?.cerrada ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Pase de Lista Abierto</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <Lock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Lista Concluida (Solo rectificaciones)</span>
              </span>
            )}
          </div>

          {/* Primary Action Button (Right) */}
          <div>
            {sesionFutura ? (
              <div
                className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[#667085] dark:text-[#94A3B8] text-xs font-semibold flex items-center space-x-1.5"
                title="La toma de lista se habilita el día de la clase"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Disponible el día de la clase</span>
              </div>
            ) : !activeSesion?.cerrada ? (
              <button
                onClick={() => setCloseModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition flex items-center space-x-2 shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Cerrar Lista Oficial</span>
              </button>
            ) : (
              <div className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[#667085] dark:text-[#94A3B8] text-xs font-semibold flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Lista Formalizada</span>
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Modern Linear Academic Progress Rail (Linear / Stripe style) */}
        <div className="pt-2">
          {/* Rail Header with Progress Percentage */}
          <div className="flex items-center justify-between text-xs mb-3">
            <div className="flex items-center space-x-2 text-[#667085] dark:text-[#94A3B8]">
              <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                {activeDateInfo.fullDate}
              </span>
              <span>•</span>
              <span>
                {currentSesionIndex + 1} de {sesiones.length} sesiones ({Math.round(((currentSesionIndex + 1) / Math.max(sesiones.length, 1)) * 100)}% de avance)
              </span>
            </div>

            <button
              onClick={() => setSessionPickerOpen(!sessionPickerOpen)}
              className="text-xs text-[#4F46E5] dark:text-[#818CF8] hover:underline font-semibold flex items-center space-x-1 cursor-pointer"
            >
              <span>Ver todas las fechas</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Elegant Linear Rail Nodes */}
          <div className="relative flex items-center justify-between px-2 py-1">
            {/* Background Connecting Line */}
            <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-slate-100 dark:bg-slate-800 rounded-full z-0" />
            
            {/* Colored Progress Line up to current session */}
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 h-1 bg-[#4F46E5] dark:bg-[#818CF8] rounded-full transition-all duration-300 z-0"
              style={{
                width: `${(currentSesionIndex / Math.max(sesiones.length - 1, 1)) * 100}%`,
                maxWidth: 'calc(100% - 32px)',
              }}
            />

            {/* Interactive Nodes */}
            {sesiones.map((s, idx) => {
              const isSelected = s.id === selectedSesionId;
              const sDate = formatSessionDate(s.fecha);

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSesionId(s.id)}
                  title={`Clase ${idx + 1}: ${sDate.fullDate || s.fecha} (${s.cerrada ? 'Concluida' : 'Abierta'})`}
                  className="relative z-10 flex flex-col items-center group transition cursor-pointer"
                >
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                      isSelected
                        ? 'bg-[#4F46E5] text-white ring-4 ring-indigo-500/25 shadow-md scale-110'
                        : s.cerrada
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                        : 'bg-white dark:bg-[#1B222D] text-slate-400 border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                    }`}
                  >
                    {s.cerrada && !isSelected ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </div>

                  {/* Minimalist Day label below node */}
                  <span
                    className={`text-[10px] font-medium mt-1 whitespace-nowrap transition-colors hidden sm:block ${
                      isSelected
                        ? 'text-[#4F46E5] dark:text-[#818CF8] font-bold'
                        : 'text-[#667085] dark:text-[#94A3B8] group-hover:text-[#172033] dark:group-hover:text-white'
                    }`}
                  >
                    {sDate.shortDate}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Session Real-time Metrics Bar (Stripe / Linear style) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="bg-white dark:bg-[#1B222D] p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 font-bold shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Matriculados</span>
            <span className="text-xl font-semibold text-slate-900 dark:text-white tabular-nums">{sessionMetrics.total}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#141A23] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 flex items-center space-x-3">
          <div>
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 block">Presentes</span>
            <span className="text-xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{sessionMetrics.presentes}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#141A23] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 flex items-center space-x-3">
          <div>
            <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 block">Ausentes</span>
            <span className="text-xl font-semibold text-rose-600 dark:text-rose-400 tabular-nums">{sessionMetrics.ausentes}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#141A23] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 flex items-center space-x-3">
          <div>
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 block">Justificados</span>
            <span className="text-xl font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{sessionMetrics.justificados}</span>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-white dark:bg-[#141A23] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 flex items-center space-x-3">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Asistencia</span>
            <span className="text-xl font-semibold text-slate-900 dark:text-white tabular-nums">{sessionMetrics.rate}%</span>
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por estudiante o matrícula..."
            className="w-full pl-8.5 pr-3 py-1.5 bg-white dark:bg-[#141A23] border border-slate-200/80 dark:border-slate-800/80 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Filter Tabs (Native Segmented Control) */}
        <div className="inline-flex p-0.5 bg-slate-200/60 dark:bg-slate-800/80 rounded-lg text-xs overflow-x-auto">
          <button
            onClick={() => setStatusFilter('TODOS')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'TODOS'
                ? 'bg-white dark:bg-[#141A23] text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Todos ({estudiantes.length})
          </button>

          <button
            onClick={() => setStatusFilter('PRESENTE')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'PRESENTE'
                ? 'bg-white dark:bg-[#141A23] text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Presentes ({sessionMetrics.presentes})
          </button>

          <button
            onClick={() => setStatusFilter('AUSENTE')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'AUSENTE'
                ? 'bg-white dark:bg-[#141A23] text-rose-600 dark:text-rose-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ausentes ({sessionMetrics.ausentes})
          </button>

          <button
            onClick={() => setStatusFilter('JUSTIFICADO')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'JUSTIFICADO'
                ? 'bg-white dark:bg-[#141A23] text-amber-600 dark:text-amber-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Justificados ({sessionMetrics.justificados})
          </button>

          <button
            onClick={() => setStatusFilter('ALERTAS')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'ALERTAS'
                ? 'bg-white dark:bg-[#141A23] text-rose-700 dark:text-rose-300 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            En Riesgo ({alertas.filter((a) => a.tiene_alerta).length})
          </button>
        </div>

        {/* Quick Mark All Present */}
        {!activeSesion?.cerrada && !sesionFutura && (
          <button
            onClick={handleMarkAllPresent}
            className="px-3 py-1.5 bg-white dark:bg-[#141A23] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition border border-slate-200/80 dark:border-slate-800/80 flex items-center space-x-1.5 shrink-0 cursor-pointer"
            title="Marcar todos como presentes"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Todos Presentes</span>
          </button>
        )}
      </div>

      {/* Aviso: sesión futura bloqueada */}
      {sesionFutura && activeSesion && (
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
          <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            <strong>Sesión programada para {formatSessionDate(activeSesion.fecha).fullDate}.</strong> La toma de lista
            se habilita el mismo día de la clase. Puedes consultar la lista de alumnos y su anecdotario mientras tanto.
          </span>
        </div>
      )}

      {/* Main Roll Call Table */}
      <div className="bg-white dark:bg-[#1B222D] rounded-xl shadow-xs border border-[#E7EAF0] dark:border-[#2B3442] overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F7F8FA] dark:bg-[#151A22] border-b border-[#E7EAF0] dark:border-[#2B3442] text-[11px] font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider">
                <th className="py-3 px-5">Estudiante & Matrícula</th>
                <th className="py-3 px-4">Tutor Legal</th>
                <th className="py-3 px-4 text-center">Historial Reciente</th>
                <th className="py-3 px-4 text-center">Faltas Acumuladas</th>
                <th className="py-3 px-5 text-center">Toma de Asistencia</th>
                <th className="py-3 px-4 text-center">Anecdotario</th>
                <th className="py-3 px-5 text-right">Observación / Rectificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442] text-xs">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#667085] dark:text-[#94A3B8]">
                    No hay estudiantes que coincidan con la búsqueda o filtro activo.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((est) => {
                  const tutor = tutores.find((t) => t.id === est.tutor_id);
                  const asist = asistencias.find((a) => a.estudiante_id === est.id);
                  const currentStatus: EstatusAsistencia = asist ? asist.estatus : 'PRESENTE';
                  const alerta = alertas.find((a) => a.estudiante_id === est.id);

                  // Calculate past session attendance status dots for mini timeline
                  const pastRecords = pastClosedSessions.map((ps) => {
                    const r = allAsistencias.find(
                      (a) => a.sesion_id === ps.id && a.estudiante_id === est.id
                    );
                    return { sesion: ps, estatus: r ? r.estatus : 'PRESENTE' };
                  });

                  return (
                    <tr
                      key={est.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70 transition-colors group"
                    >
                      {/* Student Info */}
                      <td className="py-3 px-5">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-center text-xs shrink-0">
                            {est.nombre[0]}{est.apellido[0]}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {est.nombre} {est.apellido}
                              </span>
                              {est.estado === 'BAJA' && (
                                <span
                                  className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900"
                                  title={est.motivo_baja ? `Baja temporal: ${est.motivo_baja}` : 'Dado de baja temporal'}
                                >
                                  Baja temporal
                                </span>
                              )}
                              {alerta?.nivel_alerta === 'CRITICA' && (
                                <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                                  {alerta.total_ausencias} Faltas
                                </span>
                              )}
                              {alerta?.nivel_alerta === 'ADVERTENCIA' && (
                                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                  {alerta.porcentaje_inasistencia}% inasist.
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-slate-400">{est.matricula}</span>
                          </div>
                        </div>
                      </td>

                      {/* Tutor Info */}
                      <td className="py-3 px-4 text-xs">
                        <span className="text-slate-800 dark:text-slate-200 block">
                          {tutor?.nombre || 'Sin tutor'}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px] block">{tutor?.email}</span>
                      </td>

                      {/* Historical Attendance Mini-Timeline */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          {pastRecords.map((rec, i) => (
                            <span
                              key={i}
                              title={`Sesión ${rec.sesion.fecha}: ${rec.estatus}`}
                              className={`w-1.5 h-1.5 rounded-full inline-block ${
                                rec.estatus === 'PRESENTE'
                                  ? 'bg-emerald-500'
                                  : rec.estatus === 'AUSENTE'
                                  ? 'bg-rose-500'
                                  : 'bg-amber-500'
                              }`}
                            />
                          ))}
                        </div>
                      </td>

                      {/* Cumulative stats */}
                      <td className="py-3 px-4 text-center tabular-nums text-xs font-mono">
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">{alerta?.total_ausencias || 0}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-slate-500">{alerta?.sesiones_cerradas || 0}</span>
                      </td>

                      {/* 3-State Segmented Control */}
                      <td className="py-3.5 px-5 text-center">
                        <div
                          className={`inline-flex p-1 bg-[#F7F8FA] dark:bg-[#151A22] rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] ${
                            sesionFutura ? 'opacity-40 pointer-events-none select-none' : ''
                          }`}
                          aria-disabled={sesionFutura}
                          title={sesionFutura ? 'Disponible el día de la clase' : undefined}
                        >
                          {/* PRESENTE */}
                          <button
                            disabled={sesionFutura}
                            onClick={() => handleSetStatus(est.id, 'PRESENTE')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center space-x-1 ${
                              currentStatus === 'PRESENTE'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            }`}
                            title="Marcar Presente"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>P</span>
                          </button>

                          {/* AUSENTE */}
                          <button
                            disabled={sesionFutura}
                            onClick={() => handleSetStatus(est.id, 'AUSENTE')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center space-x-1 ml-1 ${
                              currentStatus === 'AUSENTE'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                            }`}
                            title="Marcar Ausente"
                          >
                            <X className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>A</span>
                          </button>

                          {/* JUSTIFICADO */}
                          <button
                            disabled={sesionFutura}
                            onClick={() => handleSetStatus(est.id, 'JUSTIFICADO')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center space-x-1 ml-1 ${
                              currentStatus === 'JUSTIFICADO'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                            }`}
                            title="Justificar Inasistencia"
                          >
                            <Pencil className="w-3.5 h-3.5 stroke-[2]" />
                            <span>J</span>
                          </button>
                        </div>
                      </td>

                      {/* Anecdotario */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setAnecdotarioStudent(est)}
                          className="relative inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] px-2.5 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-[#4F46E5] dark:text-[#818CF8] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                          title={`Anecdotario de ${est.nombre} ${est.apellido}`}
                          aria-label={`Abrir anecdotario de ${est.nombre} ${est.apellido}`}
                        >
                          <NotebookPen className="w-4 h-4" />
                          {(conteoAnotaciones.get(est.id) || 0) > 0 && (
                            <span className="text-[10px] font-bold font-mono tabular-nums">
                              {conteoAnotaciones.get(est.id)}
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Justification note or rectification trigger */}
                      <td className="py-3.5 px-5 text-right">
                        {asist?.motivo_justificacion ? (
                          <div
                            className="inline-flex items-center space-x-1.5 text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/40 transition max-w-[200px] truncate"
                            onClick={() => {
                              if (activeSesion?.cerrada) {
                                handleOpenRectification(est, asist);
                              } else {
                                setActiveJustifyStudent(est);
                                setActiveAsistencia(asist);
                                setJustificationModalOpen(true);
                              }
                            }}
                            title={`Motivo registrado: ${asist.motivo_justificacion}. Haz clic para rectificar o consultar.`}
                          >
                            <Pencil className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="truncate">{asist.motivo_justificacion}</span>
                          </div>
                        ) : activeSesion?.cerrada ? (
                          <button
                            onClick={() => handleOpenRectification(est, asist || null)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-[#4F46E5] dark:text-[#818CF8] hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition cursor-pointer border border-indigo-200 dark:border-indigo-800"
                          >
                            Rectificar
                          </button>
                        ) : (
                          <span className="text-[#94A3B8] text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
          {filteredStudents.length === 0 ? (
            <div className="p-8 text-center text-[#667085] dark:text-[#94A3B8] text-xs">
              No hay alumnos que coincidan con la búsqueda.
            </div>
          ) : (
            filteredStudents.map((est) => {
              const tutor = tutores.find((t) => t.id === est.tutor_id);
              const asist = asistencias.find((a) => a.estudiante_id === est.id);
              const currentStatus: EstatusAsistencia = asist ? asist.estatus : 'PRESENTE';
              const alerta = alertas.find((a) => a.estudiante_id === est.id);

              return (
                <div key={est.id} className="p-4 space-y-3 bg-white dark:bg-[#1B222D]">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-bold text-[#172033] dark:text-[#F1F5F9] text-sm">
                        {est.nombre} {est.apellido}
                      </span>
                      <span className="text-xs font-mono text-[#667085] dark:text-[#94A3B8] block">{est.matricula}</span>
                      <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] mt-0.5">
                        Tutor: {tutor?.nombre || 'N/A'} • {tutor?.email}
                      </p>
                    </div>

                    {alerta?.nivel_alerta === 'CRITICA' && (
                      <span className="bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-900 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                        {alerta.total_ausencias} Faltas
                      </span>
                    )}
                    {alerta?.nivel_alerta === 'ADVERTENCIA' && (
                      <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                        Riesgo {alerta.porcentaje_inasistencia}%
                      </span>
                    )}
                  </div>

                  {/* 48x48px Touch Targets for Mobile Roll Call */}
                  <div
                    className={`grid grid-cols-3 gap-2 pt-1 ${sesionFutura ? 'opacity-40 pointer-events-none select-none' : ''}`}
                    aria-disabled={sesionFutura}
                  >
                    <button
                      disabled={sesionFutura}
                      onClick={() => handleSetStatus(est.id, 'PRESENTE')}
                      className={`h-12 rounded-lg font-bold text-xs transition flex items-center justify-center space-x-1.5 ${
                        currentStatus === 'PRESENTE'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      }`}
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>Presente</span>
                    </button>

                    <button
                      disabled={sesionFutura}
                      onClick={() => handleSetStatus(est.id, 'AUSENTE')}
                      className={`h-12 rounded-lg font-bold text-xs transition flex items-center justify-center space-x-1.5 ${
                        currentStatus === 'AUSENTE'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                      <span>Ausente</span>
                    </button>

                    <button
                      disabled={sesionFutura}
                      onClick={() => handleSetStatus(est.id, 'JUSTIFICADO')}
                      className={`h-12 rounded-lg font-bold text-xs transition flex items-center justify-center space-x-1.5 ${
                        currentStatus === 'JUSTIFICADO'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Justificar</span>
                    </button>
                  </div>

                  {asist?.motivo_justificacion && (
                    <div className="bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg text-xs text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                      <strong>Motivo:</strong> {asist.motivo_justificacion}
                    </div>
                  )}

                  {activeSesion?.cerrada && (
                    <button
                      onClick={() => handleOpenRectification(est, asist || null)}
                      className="w-full mt-1.5 py-2 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[#4F46E5] dark:text-[#818CF8] font-bold text-xs border border-indigo-200 dark:border-indigo-800 flex items-center justify-center space-x-1.5 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Rectificar Asistencia / Estado</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info strip */}
        <div className="bg-[#F7F8FA] dark:bg-[#151A22] px-5 py-3.5 border-t border-[#E7EAF0] dark:border-[#2B3442] flex flex-col sm:flex-row items-center justify-between text-xs text-[#667085] dark:text-[#94A3B8] gap-2">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
            {sessionMetrics.ausentes > 0 ? (
              <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                Hay <strong className="text-rose-600 dark:text-rose-400">{sessionMetrics.ausentes} alumno(s) marcado(s) como ausente(s)</strong>. Al cerrar la lista se enviará aviso oficial a sus tutores legales.
              </span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                Todos los alumnos matriculados están marcados como presentes o justificados.
              </span>
            )}
          </div>

          {!activeSesion?.cerrada && !sesionFutura && (
            <button
              onClick={() => setCloseModalOpen(true)}
              className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg font-bold transition flex items-center space-x-1.5 shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Finalizar Sesión</span>
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {extraModalOpen && activeGrupo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-xl max-w-sm w-full overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9]">
            <div className="px-5 py-4 border-b border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarPlus className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-bold">Sesión extraordinaria</h3>
              </div>
              <button onClick={() => setExtraModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCrearSesionExtra} className="p-5 space-y-3 text-xs">
              <p className="text-[#667085] dark:text-[#94A3B8] leading-relaxed">
                Clase de <strong>{activeGrupo.nombre}</strong> fuera de sus días habituales (reposición o clase extra).
                Se conserva aunque cambien las fechas o los días del taller.
              </p>
              {extraError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{extraError}</span>
                </div>
              )}
              <div>
                <label className="block font-semibold mb-1">Fecha</label>
                <input
                  type="date"
                  required
                  value={extraFecha}
                  onChange={(e) => setExtraFecha(e.target.value)}
                  className="w-full rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] p-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1">Hora inicio</label>
                  <input
                    type="time"
                    required
                    value={extraHoraInicio}
                    onChange={(e) => setExtraHoraInicio(e.target.value)}
                    className="w-full rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] p-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Hora fin</label>
                  <input
                    type="time"
                    required
                    value={extraHoraFin}
                    onChange={(e) => setExtraHoraFin(e.target.value)}
                    className="w-full rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] p-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  Tema <span className="text-[#94A3B8] font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={extraTema}
                  onChange={(e) => setExtraTema(e.target.value)}
                  placeholder="Clase extraordinaria"
                  className="w-full rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#151A22] p-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setExtraModalOpen(false)} className="px-3 py-1.5 font-semibold text-[#667085] cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-bold cursor-pointer">
                  Crear sesión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {anecdotarioStudent && (
        <AnecdotarioModal
          estudiante={anecdotarioStudent}
          currentProfile={currentProfile}
          grupo={activeGrupo ?? undefined}
          sesionId={activeSesion?.id}
          onClose={() => setAnecdotarioStudent(null)}
        />
      )}

      <JustificationModal
        isOpen={justificationModalOpen}
        onClose={() => setJustificationModalOpen(false)}
        estudiante={activeJustifyStudent}
        sesion={activeSesion}
        grupo={activeGrupo}
        currentMotivo={activeAsistencia?.motivo_justificacion}
        isRectification={activeSesion?.cerrada}
        onSave={handleSaveJustification}
      />

      {activeSesion && activeGrupo && (
        <RectificationModal
          isOpen={rectificationModalOpen}
          onClose={() => setRectificationModalOpen(false)}
          estudiante={rectifyTargetStudent}
          tutor={
            rectifyTargetStudent
              ? tutores.find((t) => t.id === rectifyTargetStudent.tutor_id) || null
              : null
          }
          sesion={activeSesion}
          grupo={activeGrupo}
          asistencia={rectifyTargetAsistencia}
          initialTargetStatus={rectifyInitialStatus}
          onConfirm={handleConfirmRectification}
        />
      )}

      {activeSesion && activeGrupo && (
        <CloseSessionModal
          isOpen={closeModalOpen}
          onClose={() => setCloseModalOpen(false)}
          onConfirm={handleConfirmCloseSession}
          sesion={activeSesion}
          grupo={activeGrupo}
          asistencias={asistencias}
          estudiantes={estudiantes}
          tutores={tutores}
        />
      )}
    </div>
  );
};

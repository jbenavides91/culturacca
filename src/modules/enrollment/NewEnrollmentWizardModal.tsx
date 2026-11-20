import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  UserPlus,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Calendar,
  MapPin,
  Check,
  Printer,
  Sparkles,
  Shield,
  Palette,
  Users,
  Mail,
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Estudiante, Grupo, SolicitudMatricula, SugerenciaAlumno } from '../../types/attendance';
import { gradosDisponibles } from '../../utils/grados';
import { normalizarTexto } from '../../utils/padron';
import { storageService } from '../../services/storage.service';
import { generateInstitutionalContractText } from '../../utils/contractTemplate';
import { arancelDeGrupo, etiquetaPeriodo, formatearMonto, montoDeSolicitud } from '../../utils/arancel';
import { DigitalSignaturePad } from '../../components/DigitalSignaturePad';
import { BarraCupo, CupoBadge } from '../../components/CupoIndicador';

/** Talleres que se pueden solicitar en un mismo proceso de matrícula */
const MAX_TALLERES = 2;

const DIAS_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

type EstadoCorreo = { estado: 'enviando' | 'ok' | 'error'; mensaje?: string };

interface NewEnrollmentWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Se crea una solicitud por taller elegido */
  onEnrollmentCreated?: (solicitudes: SolicitudMatricula[]) => void;
  preselectedGrupoId?: string;
}

export const NewEnrollmentWizardModal: React.FC<NewEnrollmentWizardModalProps> = ({
  isOpen,
  onClose,
  onEnrollmentCreated,
  preselectedGrupoId,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Student & Tutor Information
  const [codigoAlumno, setCodigoAlumno] = useState('');
  const [nombreAlumno, setNombreAlumno] = useState('');
  const [apellidoAlumno, setApellidoAlumno] = useState('');
  const [edad, setEdad] = useState<number>(10);
  const [grado, setGrado] = useState(() => gradosDisponibles()[0] ?? '');
  const [aulaRegular, setAulaRegular] = useState('Aula 5-A');

  const [tutorNombre, setTutorNombre] = useState('');
  const [tutorEmail, setTutorEmail] = useState('');
  const [tutorTelefono, setTutorTelefono] = useState('');
  const [tutorParentesco, setTutorParentesco] = useState('Madre');
  const [tutorCedula, setTutorCedula] = useState('');

  // Step 2: Workshop Selection (hasta MAX_TALLERES, sin choque de días y horas entre ellos)
  const [selectedGrupoIds, setSelectedGrupoIds] = useState<string[]>(preselectedGrupoId ? [preselectedGrupoId] : []);

  // Step 3: Contract & Digital Signature
  const [firmaDigitalUrl, setFirmaDigitalUrl] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  // Se volvió atrás desde el paso 3 tras firmar: hay que firmar de nuevo el contrato corregido
  const [firmaReiniciada, setFirmaReiniciada] = useState(false);
  // Cuerpo desplazable del modal (al cambiar de paso se vuelve al inicio)
  const cuerpoRef = useRef<HTMLDivElement>(null);

  // Result / Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdSolicitudes, setCreatedSolicitudes] = useState<SolicitudMatricula[]>([]);
  // Taller cuya solicitud no se pudo registrar (la anterior ya quedó guardada)
  const [errorParcial, setErrorParcial] = useState<string | null>(null);
  // Envío del resumen y contrato firmado al correo del tutor, uno por solicitud
  const [correos, setCorreos] = useState<Record<string, EstadoCorreo>>({});

  const enviarCorreoTutor = async (solicitudId: string) => {
    setCorreos((prev) => ({ ...prev, [solicitudId]: { estado: 'enviando' } }));
    let resultado: EstadoCorreo;
    try {
      const res = await storageService.enviarCorreoMatricula(solicitudId);
      resultado = res.ok ? { estado: 'ok', mensaje: res.destinatario } : { estado: 'error', mensaje: res.error };
    } catch (err) {
      resultado = { estado: 'error', mensaje: err instanceof Error ? err.message : 'No se pudo enviar el correo.' };
    }
    setCorreos((prev) => ({ ...prev, [solicitudId]: resultado }));
  };

  /** Envía los correos en serie (la función rechaza reenvíos rápidos por solicitud, no por tutor) */
  const enviarCorreosTutor = async (ids: string[]) => {
    for (const id of ids) {
      await enviarCorreoTutor(id);
    }
  };

  // Available workshops
  const grupos = useMemo(() => storageService.getGrupos(), []);

  // Búsqueda de talleres del paso 2 (sin tildes ni mayúsculas; deben aparecer todas las palabras)
  const [busquedaTaller, setBusquedaTaller] = useState('');
  const textoBuscableTaller = useMemo(() => {
    const perfiles = storageService.getPerfiles();
    const mapa = new Map<string, string>();
    grupos.forEach((g) => {
      const prof = perfiles.find((p) => p.id === g.profesor_id);
      const dias = g.dias_semana || [];
      mapa.set(
        g.id,
        normalizarTexto(
          [
            g.nombre,
            prof ? `${prof.nombre} ${prof.apellido}` : '',
            g.aula || 'Taller Principal',
            `${g.hora_inicio} ${g.hora_fin}`,
            dias.map((d) => DIAS_LABELS[d] || '').join(' '),
            dias.map((d) => (DIAS_LABELS[d] || '').slice(0, 3)).join(' '),
          ].join(' ')
        )
      );
    });
    return mapa;
  }, [grupos]);
  const terminosTaller = normalizarTexto(busquedaTaller).split(/\s+/).filter(Boolean);
  // Los ya seleccionados se muestran siempre, para poder desmarcarlos
  const gruposVisibles =
    terminosTaller.length === 0
      ? grupos
      : grupos.filter(
          (g) =>
            selectedGrupoIds.includes(g.id) ||
            terminosTaller.every((t) => (textoBuscableTaller.get(g.id) ?? '').includes(t))
        );

  // Autocompletado desde alumnos registrados y el padrón del colegio (Configuración → Padrón)
  const [busquedaAlumno, setBusquedaAlumno] = useState('');
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  const [sugerenciaActiva, setSugerenciaActiva] = useState(0);
  const [autocompletado, setAutocompletado] = useState<SugerenciaAlumno | null>(null);
  const codigoInputRef = useRef<HTMLInputElement>(null);

  const sugerencias = useMemo(
    () => (busquedaAlumno.trim().length >= 2 ? storageService.buscarAlumnosParaMatricula(busquedaAlumno) : []),
    [busquedaAlumno]
  );

  /** Rellena los datos de un alumno registrado (incluido su tutor) */
  const rellenarDesdeEstudiante = (est: Estudiante) => {
    setNombreAlumno(est.nombre);
    setApellidoAlumno(est.apellido);
    if (est.edad) setEdad(est.edad);
    if (est.grado) setGrado(est.grado);
    if (est.aula_regular) setAulaRegular(est.aula_regular);

    const tutor = storageService.getTutorById(est.tutor_id);
    if (tutor) {
      setTutorNombre(tutor.nombre);
      setTutorEmail(tutor.email);
      setTutorTelefono(tutor.telefono);
      if (tutor.parentesco) setTutorParentesco(tutor.parentesco);
    }
  };

  /** Rellena nombre, apellidos, grado y sección del padrón (el padrón no trae edad ni tutor) */
  const rellenarDesdePadron = (s: SugerenciaAlumno) => {
    // Si antes se cargó un alumno registrado, sus datos de tutor no corresponden a esta persona
    if (autocompletado?.origen === 'ESTUDIANTE') {
      setTutorNombre('');
      setTutorEmail('');
      setTutorTelefono('');
      setTutorCedula('');
    }
    setNombreAlumno(s.nombre);
    setApellidoAlumno(s.apellido);
    if (s.grado) setGrado(s.grado);
    if (s.aula_regular) setAulaRegular(s.aula_regular);
    setAutocompletado(s);
  };

  // Pre-fill existing student data if student code matches existing student (or someone in the padrón)
  const handleCodigoChange = (code: string) => {
    setCodigoAlumno(code);
    const clave = code.trim().toUpperCase();
    if (!clave) return;
    const existing = storageService.getEstudiantes().find((e) => e.matricula.trim().toUpperCase() === clave);
    if (existing) {
      rellenarDesdeEstudiante(existing);
      setAutocompletado({
        origen: 'ESTUDIANTE',
        id: existing.id,
        codigo: existing.matricula,
        nombre: existing.nombre,
        apellido: existing.apellido,
      });
      return;
    }
    const enPadron = storageService.getPadron().find((p) => p.codigo?.trim().toUpperCase() === clave);
    if (enPadron) {
      rellenarDesdePadron({
        origen: 'PADRON',
        id: enPadron.id,
        codigo: enPadron.codigo,
        nombre: enPadron.nombre,
        apellido: enPadron.apellido,
        grado: enPadron.grado,
        aula_regular: enPadron.seccion,
      });
    }
  };

  const elegirSugerencia = (s: SugerenciaAlumno) => {
    setBusquedaAlumno('');
    setSugerenciasAbiertas(false);
    setErrorMessage(null);
    if (s.origen === 'ESTUDIANTE') {
      handleCodigoChange(s.codigo || '');
      return;
    }
    rellenarDesdePadron(s);
    if (s.codigo) {
      setCodigoAlumno(s.codigo);
    } else {
      // Un código de otro alumno registrado no debe quedar asociado a esta persona
      const codigoActual = codigoAlumno.trim().toUpperCase();
      const deOtro =
        codigoActual &&
        storageService.getEstudiantes().some((e) => e.matricula.trim().toUpperCase() === codigoActual);
      if (deOtro) setCodigoAlumno('');
      setTimeout(() => codigoInputRef.current?.focus(), 0);
    }
  };

  const teclaBusqueda = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!sugerenciasAbiertas || sugerencias.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSugerenciaActiva((i) => (i + 1) % sugerencias.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSugerenciaActiva((i) => (i - 1 + sugerencias.length) % sugerencias.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      elegirSugerencia(sugerencias[Math.min(sugerenciaActiva, sugerencias.length - 1)]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setSugerenciasAbiertas(false);
    }
  };

  const codigoNorm = codigoAlumno.trim().toUpperCase();
  /** Alumno ya registrado con ese código (su propia solicitud previa no cuenta para el cupo) */
  const alumnoExistente = storageService.getEstudiantes().find((e) => e.matricula.trim().toUpperCase() === codigoNorm);

  /** Talleres elegidos, en el orden en que se marcaron */
  const selectedGrupos = useMemo(
    () => selectedGrupoIds.map((id) => grupos.find((g) => g.id === id)).filter((g): g is Grupo => !!g),
    [grupos, selectedGrupoIds]
  );

  /** Ocupación de un taller sin contar al propio alumno */
  const ocupacionDe = (grupoId: string) =>
    storageService.ocupacionTaller(grupoId, { excluirEstudianteId: alumnoExistente?.id });

  /** Motivo por el que un taller elegido no se puede solicitar, o null si está bien */
  const problemaDeTaller = (grupo: Grupo): string | null => {
    if (
      alumnoExistente &&
      storageService.getInscripciones().some((i) => i.estudiante_id === alumnoExistente.id && i.grupo_id === grupo.id)
    ) {
      return `El alumno ya está inscrito en "${grupo.nombre}".`;
    }
    const previa = codigoNorm
      ? storageService
          .getSolicitudesMatricula()
          .find(
            (sol) =>
              sol.grupo_id === grupo.id &&
              (sol.estado === 'PENDIENTE_CAJA' || sol.estado === 'SOLVENTE') &&
              String(sol.codigo_alumno || '').trim().toUpperCase() === codigoNorm
          )
      : undefined;
    if (previa) return `Ya tiene la solicitud ${previa.codigo_solicitud} pendiente en Caja para "${grupo.nombre}".`;
    if (codigoNorm) {
      // Inscritos y solicitudes en Caja del mismo código (también si el alumno aún no existe)
      const c = storageService.verificarConflictoHorario(alumnoExistente?.id ?? null, grupo, { codigoAlumno: codigoNorm });
      if (c.tieneConflicto) return `"${grupo.nombre}": ${c.motivo || 'colisión de horario'}`;
    }
    if (ocupacionDe(grupo.id).nivel === 'LLENO') return `El taller "${grupo.nombre}" está lleno: elige otro taller.`;
    for (const otro of selectedGrupos) {
      if (otro.id === grupo.id) continue;
      const choque = storageService.sonTalleresEnConflicto(grupo, otro);
      if (choque.tieneConflicto) {
        return `"${grupo.nombre}" y "${otro.nombre}" coinciden en días y horas. ${choque.motivo || ''}`.trim();
      }
    }
    return null;
  };

  const problemaSeleccion = selectedGrupos.map(problemaDeTaller).find((p) => p !== null) ?? null;
  const totalArancel = selectedGrupos.reduce((suma, g) => suma + Number(arancelDeGrupo(g) || 0), 0);

  const toggleTaller = (grupoId: string) => {
    setErrorMessage(null);
    setSelectedGrupoIds((prev) => {
      if (prev.includes(grupoId)) return prev.filter((id) => id !== grupoId);
      if (prev.length >= MAX_TALLERES) return prev;
      return [...prev, grupoId];
    });
  };

  // Texto del contrato de un taller (uno por solicitud)
  const contratoDe = (grupo: Grupo): string => {
    const diasStr = (grupo.dias_semana || []).map((d) => DIAS_LABELS[d] || d).join(', ');

    return generateInstitutionalContractText({
      codigoAlumno: codigoAlumno.trim().toUpperCase() || 'POR ASIGNAR',
      nombreAlumno: `${nombreAlumno} ${apellidoAlumno}`.trim() || 'Estudiante Aspirante',
      edad: edad,
      grado: grado,
      aulaRegular: aulaRegular,
      nombreTutor: tutorNombre.trim() || 'Tutor Responsable',
      cedulaTutor: tutorCedula.trim(),
      parentesco: tutorParentesco,
      telefonoTutor: tutorTelefono.trim(),
      emailTutor: tutorEmail.trim(),
      tallerNombre: grupo.nombre,
      tallerHorario: `${grupo.hora_inicio} a ${grupo.hora_fin}`,
      tallerDias: diasStr,
      tallerAula: grupo.aula || 'Taller Principal',
      arancel: arancelDeGrupo(grupo),
    });
  };

  if (!isOpen) return null;

  // Validation before going to Step 2
  const handleValidateStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!codigoAlumno.trim() || !nombreAlumno.trim() || !apellidoAlumno.trim()) {
      setErrorMessage('Por favor ingrese el código, nombre y apellidos del alumno.');
      return;
    }
    if (!tutorNombre.trim() || !tutorEmail.trim() || !tutorTelefono.trim()) {
      setErrorMessage('Por favor ingrese el nombre, correo y teléfono del padre o tutor.');
      return;
    }
    setStep(2);
    cuerpoRef.current?.scrollTo({ top: 0 });
  };

  // Validation before going to Step 3
  const handleValidateStep2 = () => {
    setErrorMessage(null);
    if (selectedGrupos.length === 0) {
      setErrorMessage('Debe seleccionar al menos un taller extracurricular.');
      return;
    }
    if (problemaSeleccion) {
      setErrorMessage(`No se puede continuar: ${problemaSeleccion}`);
      return;
    }
    setStep(3);
    cuerpoRef.current?.scrollTo({ top: 0 });
  };

  /**
   * Vuelve a un paso anterior para corregir datos (los ya escritos se conservan). Al salir del paso 3
   * se borran la firma y la aceptación: el contrato cambia con los datos y el recuadro de firma se
   * vuelve a montar vacío, así que firmar de nuevo evita enviar una firma que no se ve.
   */
  const irAPaso = (destino: 1 | 2) => {
    if (step >= 4 || destino >= step) return;
    setErrorMessage(null);
    if (step === 3) {
      if (firmaDigitalUrl || aceptaTerminos) setFirmaReiniciada(true);
      setFirmaDigitalUrl('');
      setAceptaTerminos(false);
    }
    setStep(destino);
    cuerpoRef.current?.scrollTo({ top: 0 });
  };

  // Submit enrollment request
  const handleSubmitEnrollment = () => {
    setErrorMessage(null);
    if (!firmaDigitalUrl) {
      setErrorMessage('El padre de familia o tutor debe firmar digitalmente el contrato.');
      return;
    }
    if (!aceptaTerminos) {
      setErrorMessage('Debe marcar la casilla de aceptación de los términos del contrato institucional.');
      return;
    }
    if (selectedGrupos.length === 0) return;

    setIsSubmitting(true);
    const creadas: SolicitudMatricula[] = [];
    let fallo: string | null = null;
    // Una solicitud por taller, con su contrato y arancel y la misma firma. La segunda ya ve la
    // primera en Caja, así que el servicio vuelve a comprobar choques, duplicados y cupo.
    for (const grupo of selectedGrupos) {
      try {
        creadas.push(
          storageService.crearSolicitudMatricula({
        codigo_alumno: codigoNorm,
        nombre_alumno: nombreAlumno.trim(),
        apellido_alumno: apellidoAlumno.trim(),
        edad,
        grado,
        aula_regular: aulaRegular,
        tutor_nombre: tutorNombre.trim(),
        tutor_email: tutorEmail.trim(),
        tutor_telefono: tutorTelefono.trim(),
        tutor_parentesco: tutorParentesco,
        tutor_cedula: tutorCedula.trim() || 'N/A',
        grupo_id: grupo.id,
        grupo_nombre: grupo.nombre,
        contrato_texto: contratoDe(grupo),
        contrato_firmado: true,
        firma_digital_url: firmaDigitalUrl,
        fecha_firma: new Date().toISOString(),
        firmante_nombre: tutorNombre.trim(),
        monto_arancel: arancelDeGrupo(grupo),
          })
        );
      } catch (err: unknown) {
        fallo = `No se registró la solicitud de "${grupo.nombre}": ${
          err instanceof Error ? err.message : 'error al registrar la solicitud'
        }`;
        break;
      }
    }
    setIsSubmitting(false);

    if (creadas.length === 0) {
      setErrorMessage(fallo ?? 'Error al registrar la solicitud');
      return;
    }
    // Las solicitudes ya creadas se conservan aunque falle la siguiente (no es transaccional)
    setErrorParcial(fallo);
    setCreatedSolicitudes(creadas);
    setStep(4);
    onEnrollmentCreated?.(creadas);
    // El correo no bloquea: las solicitudes ya quedaron registradas aunque el envío falle
    void enviarCorreosTutor(creadas.map((s) => s.id));
  };

  const handlePrintVoucher = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] flex flex-col">
        {/* Header */}
        <div className="bg-[#172033] dark:bg-[#151A22] px-4 sm:px-6 py-3 sm:py-4 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Registro de Matrícula de Alumno</h3>
              <p className="text-xs text-slate-300">
                Proceso digital de inscripción y firma de contrato para talleres vespertinos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Wizard Progress */}
        <div className="bg-[#F7F8FA] dark:bg-[#151A22] border-b border-[#E7EAF0] dark:border-[#2B3442] px-4 sm:px-6 py-3 shrink-0">
          <div className="flex items-center justify-between max-w-xl mx-auto text-xs">
            {/* Step 1 (clic para volver a corregir datos) */}
            <button
              type="button"
              onClick={() => irAPaso(1)}
              disabled={!(step > 1 && step < 4) || isSubmitting}
              aria-label="Volver al paso 1: datos del alumno y tutor"
              title={step > 1 && step < 4 ? 'Volver a los datos del alumno y tutor' : undefined}
              className={`flex items-center space-x-2 font-semibold rounded-lg px-1 -mx-1 enabled:cursor-pointer enabled:hover:underline disabled:cursor-default ${
                step >= 1 ? 'text-[#4F46E5] dark:text-[#818CF8]' : 'text-slate-400'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > 1
                    ? 'bg-emerald-600 text-white'
                    : step === 1
                    ? 'bg-[#4F46E5] text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {step > 1 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '1'}
              </div>
              <span className="hidden sm:inline">1. Alumno y Tutor</span>
            </button>

            <div className="flex-1 h-0.5 mx-3 bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full bg-[#4F46E5] transition-all"
                style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}
              ></div>
            </div>

            {/* Step 2 (clic para volver a elegir talleres) */}
            <button
              type="button"
              onClick={() => irAPaso(2)}
              disabled={step !== 3 || isSubmitting}
              aria-label="Volver al paso 2: talleres"
              title={step === 3 ? 'Volver a la selección de talleres' : undefined}
              className={`flex items-center space-x-2 font-semibold rounded-lg px-1 -mx-1 enabled:cursor-pointer enabled:hover:underline disabled:cursor-default ${
                step >= 2 ? 'text-[#4F46E5] dark:text-[#818CF8]' : 'text-slate-400'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > 2
                    ? 'bg-emerald-600 text-white'
                    : step === 2
                    ? 'bg-[#4F46E5] text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {step > 2 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '2'}
              </div>
              <span className="hidden sm:inline">2. Talleres</span>
            </button>

            <div className="flex-1 h-0.5 mx-3 bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full bg-[#4F46E5] transition-all"
                style={{ width: step <= 2 ? '0%' : step === 3 ? '50%' : '100%' }}
              ></div>
            </div>

            {/* Step 3 */}
            <div
              className={`flex items-center space-x-2 font-semibold ${
                step >= 3 ? 'text-[#4F46E5] dark:text-[#818CF8]' : 'text-slate-400'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > 3
                    ? 'bg-emerald-600 text-white'
                    : step === 3
                    ? 'bg-[#4F46E5] text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {step > 3 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '3'}
              </div>
              <span className="hidden sm:inline">3. Contrato & Firma</span>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center space-x-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Modal Body / Steps */}
        <div ref={cuerpoRef} className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* STEP 1: Student and Tutor Information (su botón "Continuar" está en el pie fijo) */}
          {step === 1 && (
            <form id="form-matricula-paso1" onSubmit={handleValidateStep1} className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] mb-1 flex items-center space-x-2">
                  <Users className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
                  <span>Datos del Alumno</span>
                </h4>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8] mb-3">
                  Ingrese el código escolar y los datos académicos del estudiante en su horario regular.
                </p>

                {/* Buscador: alumnos registrados y padrón del colegio */}
                <div className="relative mb-3.5">
                  <label
                    htmlFor="buscar-alumno-matricula"
                    className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]"
                  >
                    Buscar alumno por nombre o código
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="buscar-alumno-matricula"
                      type="search"
                      autoComplete="off"
                      role="combobox"
                      aria-expanded={sugerenciasAbiertas && sugerencias.length > 0}
                      aria-controls="sugerencias-alumno-matricula"
                      aria-autocomplete="list"
                      placeholder="Ej: Ana Sofía Ortega o CCA-2026-105"
                      value={busquedaAlumno}
                      onChange={(e) => {
                        setBusquedaAlumno(e.target.value);
                        setSugerenciasAbiertas(true);
                        setSugerenciaActiva(0);
                      }}
                      onFocus={() => setSugerenciasAbiertas(true)}
                      onBlur={() => setTimeout(() => setSugerenciasAbiertas(false), 150)}
                      onKeyDown={teclaBusqueda}
                      className="w-full pl-8 pr-3 py-2 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                    />
                  </div>
                  {sugerenciasAbiertas && busquedaAlumno.trim().length >= 2 && (
                    <ul
                      id="sugerencias-alumno-matricula"
                      role="listbox"
                      className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] shadow-lg"
                    >
                      {sugerencias.length === 0 ? (
                        <li className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                          Sin coincidencias. Complete los datos manualmente.
                        </li>
                      ) : (
                        sugerencias.map((s, i) => (
                          <li
                            key={`${s.origen}-${s.id}`}
                            role="option"
                            aria-selected={i === sugerenciaActiva}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              elegirSugerencia(s);
                            }}
                            onMouseEnter={() => setSugerenciaActiva(i)}
                            className={`px-3 py-2 cursor-pointer flex items-center gap-2 text-xs ${
                              i === sugerenciaActiva ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">
                                {s.nombre} {s.apellido}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {s.grado || 'Sin grado'}
                                {s.aula_regular && ` · ${s.origen === 'PADRON' ? 'Sección ' : ''}${s.aula_regular}`}
                                {s.codigo && <span className="font-mono"> · {s.codigo}</span>}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                s.origen === 'ESTUDIANTE'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {s.origen === 'ESTUDIANTE' ? 'Registrado' : 'Padrón'}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                  {autocompletado && (
                    <p className="mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>
                        {autocompletado.origen === 'ESTUDIANTE'
                          ? `Datos de ${autocompletado.nombre} ${autocompletado.apellido} (alumno registrado) y de su tutor cargados.`
                          : `Nombre, grado y sección de ${autocompletado.nombre} ${autocompletado.apellido} tomados del padrón. Complete ${
                              codigoAlumno.trim() ? '' : 'el código de alumno, '
                            }la edad y los datos del tutor.`}
                      </span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Código de Alumno / Carnet *
                    </label>
                    <input
                      ref={codigoInputRef}
                      type="text"
                      required
                      placeholder="Ej: CCA-2026-105 o ART-2026-041"
                      value={codigoAlumno}
                      onChange={(e) => handleCodigoChange(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs uppercase font-mono font-bold focus:ring-2 focus:ring-[#4F46E5] outline-none"
                    />
                    <span className="text-[10px] text-slate-400">
                      Si el alumno ya existe, sus datos se autocompletarán.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Edad del Alumno (Años) *
                    </label>
                    <input
                      type="number"
                      required
                      min={4}
                      max={20}
                      value={edad}
                      onChange={(e) => setEdad(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Nombres del Alumno *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Daniel Alonso"
                      value={nombreAlumno}
                      onChange={(e) => setNombreAlumno(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Apellidos del Alumno *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Herrera Morales"
                      value={apellidoAlumno}
                      onChange={(e) => setApellidoAlumno(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Grado que Cursa (Horario Regular) *
                    </label>
                    <select
                      value={grado}
                      onChange={(e) => setGrado(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                    >
                      {gradosDisponibles(grado).map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Aula Regular / Salón *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Aula 5-B (Edificio San Ignacio)"
                      value={aulaRegular}
                      onChange={(e) => setAulaRegular(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E7EAF0] dark:border-[#2B3442]">
                <h4 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] mb-1 flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
                  <span>Datos del Padre de Familia o Tutor Legal</span>
                </h4>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8] mb-3">
                  Persona responsable que firmará el contrato y recibirá los reportes de asistencia.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Nombre Completo del Tutor *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Rodrigo Herrera Barreto"
                      value={tutorNombre}
                      onChange={(e) => setTutorNombre(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Parentesco *
                    </label>
                    <select
                      value={tutorParentesco}
                      onChange={(e) => setTutorParentesco(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                    >
                      <option value="Madre">Madre</option>
                      <option value="Padre">Padre</option>
                      <option value="Tutor Legal">Tutor Legal</option>
                      <option value="Abuelo/a">Abuelo / Abuela</option>
                      <option value="Hermano/a Mayor">Hermano(a) Mayor</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Cédula / Identificación
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: 001-140582-0044L"
                      value={tutorCedula}
                      onChange={(e) => setTutorCedula(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Teléfono Móvil de Contacto *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="Ej: +505 8821-4321"
                      value={tutorTelefono}
                      onChange={(e) => setTutorTelefono(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Correo Electrónico del Tutor (Para Notificaciones de Asistencia) *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="Ej: rodrigo.herrera@correo-familiar.com"
                      value={tutorEmail}
                      onChange={(e) => setTutorEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

            </form>
          )}

          {/* STEP 2: Workshop Selection & Schedule Conflict Check */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] mb-1 flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
                  <span>Seleccionar Talleres Extracurriculares</span>
                </h4>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  Alumno: <strong>{nombreAlumno} {apellidoAlumno}</strong> ({codigoAlumno} - {grado}). Puede elegir hasta{' '}
                  {MAX_TALLERES} talleres, siempre que no coincidan en días y horas. Se registra una solicitud por taller.
                </p>
              </div>

              {/* Resumen de la selección */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] text-[11px]">
                <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                  {selectedGrupos.length} de {MAX_TALLERES} talleres seleccionados
                  {selectedGrupos.length > 0 && (
                    <span className="font-normal text-[#667085] dark:text-[#94A3B8]">
                      {' '}
                      · {selectedGrupos.map((g) => g.nombre).join(' + ')}
                    </span>
                  )}
                </span>
                {selectedGrupos.length > 0 && (
                  <span className="font-bold font-mono text-[#4F46E5] dark:text-[#818CF8]">
                    Total: {formatearMonto(totalArancel)} {etiquetaPeriodo()}
                  </span>
                )}
              </div>

              {/* Búsqueda de talleres */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={busquedaTaller}
                    onChange={(e) => setBusquedaTaller(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                      if (e.key === 'Escape' && busquedaTaller) {
                        e.preventDefault();
                        e.stopPropagation();
                        setBusquedaTaller('');
                      }
                    }}
                    placeholder="Buscar taller, docente, salón, día u hora..."
                    aria-label="Buscar talleres"
                    className="w-full pl-8 pr-8 py-2 bg-white dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs text-[#172033] dark:text-[#F1F5F9] placeholder-[#98A2B3] focus:outline-none focus:ring-1 focus:ring-[#4F46E5] [&::-webkit-search-cancel-button]:hidden"
                  />
                  {busquedaTaller && (
                    <button
                      type="button"
                      onClick={() => setBusquedaTaller('')}
                      title="Limpiar búsqueda"
                      aria-label="Limpiar búsqueda"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-[#98A2B3] hover:text-[#475467] dark:hover:text-[#E2E8F0] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#667085] dark:text-[#94A3B8] shrink-0">
                  {terminosTaller.length > 0
                    ? `${gruposVisibles.length} de ${grupos.length} talleres`
                    : `${grupos.length} taller${grupos.length === 1 ? '' : 'es'}`}
                </p>
              </div>

              {gruposVisibles.length === 0 && (
                <div className="text-center py-8 rounded-xl border border-dashed border-[#E7EAF0] dark:border-[#2B3442] space-y-2">
                  <p className="text-xs font-semibold text-[#172033] dark:text-[#F1F5F9]">
                    Ningún taller coincide con «{busquedaTaller.trim()}»
                  </p>
                  <button
                    type="button"
                    onClick={() => setBusquedaTaller('')}
                    className="text-xs text-[#4F46E5] dark:text-[#818CF8] hover:underline cursor-pointer"
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              )}

              {/* Workshops Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {gruposVisibles.map((grupo) => {
                  const ordenSeleccion = selectedGrupoIds.indexOf(grupo.id);
                  const isSelected = ordenSeleccion !== -1;
                  const diasTexto = (grupo.dias_semana || [])
                    .map((d) => DIAS_LABELS[d] || d)
                    .join(', ');

                  // Check conflict for this card
                  let hasConflict = false;
                  let conflictText = '';
                  const existing = alumnoExistente;
                  const yaInscrito =
                    !!existing &&
                    storageService.getInscripciones().some((i) => i.estudiante_id === existing.id && i.grupo_id === grupo.id);
                  const solicitudPrevia = codigoNorm
                    ? storageService
                        .getSolicitudesMatricula()
                        .find(
                          (sol) =>
                            sol.grupo_id === grupo.id &&
                            (sol.estado === 'PENDIENTE_CAJA' || sol.estado === 'SOLVENTE') &&
                            String(sol.codigo_alumno || '').trim().toUpperCase() === codigoNorm
                        )
                    : undefined;
                  if (yaInscrito || solicitudPrevia) {
                    hasConflict = true;
                    conflictText = yaInscrito
                      ? 'El alumno ya está inscrito en este taller.'
                      : `Ya tiene la solicitud ${solicitudPrevia?.codigo_solicitud} pendiente en Caja para este taller.`;
                  } else if (codigoNorm) {
                    // Varios talleres sí, sin choque de días y horas (inscritos y solicitudes en Caja)
                    const c = storageService.verificarConflictoHorario(existing?.id ?? null, grupo, {
                      codigoAlumno: codigoNorm,
                    });
                    if (c.tieneConflicto) {
                      hasConflict = true;
                      conflictText = c.motivo || 'Colisión de horario';
                    }
                  }
                  // Sin choque con el otro taller ya elegido en este mismo proceso
                  if (!hasConflict && !isSelected) {
                    for (const elegido of selectedGrupos) {
                      const choque = storageService.sonTalleresEnConflicto(grupo, elegido);
                      if (choque.tieneConflicto) {
                        hasConflict = true;
                        conflictText = `Choca con «${elegido.nombre}», ya seleccionado. ${choque.motivo || ''}`.trim();
                        break;
                      }
                    }
                  }
                  // Cupo: inscritos + solicitudes en Caja (la propia del alumno no cuenta)
                  const ocupacion = ocupacionDe(grupo.id);
                  const lleno = ocupacion.nivel === 'LLENO';
                  const bloqueado = !isSelected && (hasConflict || lleno);
                  const limiteAlcanzado = !isSelected && !bloqueado && selectedGrupoIds.length >= MAX_TALLERES;

                  return (
                    <div
                      key={grupo.id}
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() => {
                        if (!bloqueado && !limiteAlcanzado) toggleTaller(grupo.id);
                      }}
                      aria-disabled={bloqueado || limiteAlcanzado}
                      title={limiteAlcanzado ? `Máximo ${MAX_TALLERES} talleres: quite uno para elegir otro` : undefined}
                      className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
                        bloqueado
                          ? 'opacity-60 bg-slate-50 dark:bg-slate-900/40 border-rose-300 dark:border-rose-900/40 cursor-not-allowed'
                          : limiteAlcanzado
                          ? 'opacity-50 border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] cursor-not-allowed'
                          : isSelected
                          ? 'border-[#4F46E5] bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs cursor-pointer ring-2 ring-indigo-500/20'
                          : 'border-[#E7EAF0] dark:border-[#2B3442] hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer bg-white dark:bg-[#1B222D]'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 space-y-1">
                            <h5 className="font-bold text-xs text-[#172033] dark:text-[#F1F5F9]">{grupo.nombre}</h5>
                            <CupoBadge ocupacion={ocupacion} />
                          </div>
                          {isSelected && (
                            <span
                              className="w-5 h-5 rounded-full bg-[#4F46E5] text-white flex items-center justify-center shrink-0 text-[10px] font-bold"
                              title={`Taller ${ordenSeleccion + 1}`}
                            >
                              {selectedGrupoIds.length > 1 ? ordenSeleccion + 1 : <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 text-[11px] text-[#667085] dark:text-[#94A3B8]">
                          <div className="flex items-center space-x-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                              {grupo.hora_inicio} - {grupo.hora_fin}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{diasTexto}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{grupo.aula || 'Taller Principal'}</span>
                          </div>
                        </div>

                        {lleno && (
                          <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-[10px] text-rose-800 dark:text-rose-200 flex items-start space-x-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <span>
                              Taller lleno: {ocupacion.ocupados}/{ocupacion.cupo} lugares
                              {ocupacion.pendientes ? ` (incluye ${ocupacion.pendientes} en Caja)` : ''}. No acepta más matrículas.
                            </span>
                          </div>
                        )}
                        {!lleno && ocupacion.nivel === 'ALERTA' && (
                          <p className="text-[10px] font-semibold" style={{ color: storageService.alertasCupo().alerta.color }}>
                            Quedan {ocupacion.libres} {ocupacion.libres === 1 ? 'lugar' : 'lugares'}
                          </p>
                        )}
                        {hasConflict && (
                          <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-[10px] text-rose-800 dark:text-rose-200 flex items-start space-x-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <span>{conflictText}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 mt-3 border-t border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between text-[11px]">
                        <span className="text-[#667085] dark:text-[#94A3B8]">Arancel:</span>
                        <span className="font-bold font-mono text-[#4F46E5] dark:text-[#818CF8]">
                          {formatearMonto(arancelDeGrupo(grupo))} {etiquetaPeriodo()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {problemaSeleccion && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-[11px] text-rose-800 dark:text-rose-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{problemaSeleccion}</span>
                </div>
              )}

            </div>
          )}

          {/* STEP 3: Digital Contract & Signature */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] mb-1 flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
                  <span>Contrato Digital Institucional de Matrícula</span>
                </h4>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  {selectedGrupos.length > 1
                    ? `Se genera un contrato por taller (${selectedGrupos.length}). El padre o tutor los firma una sola vez en el recuadro interactivo.`
                    : 'Lea el contrato generado con los datos de matrícula. El padre o tutor debe firmar en el recuadro interactivo.'}
                </p>
              </div>

              {/* Cupo de cada taller elegido */}
              <div className={`grid gap-3 ${selectedGrupos.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                {selectedGrupos.map((g) => (
                  <div key={g.id} className="p-3 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D]">
                    <p className="text-[11px] font-semibold text-[#172033] dark:text-[#F1F5F9] mb-1.5">Cupo de {g.nombre}</p>
                    <BarraCupo ocupacion={ocupacionDe(g.id)} />
                  </div>
                ))}
              </div>

              {/* Readonly Contract Scroll Box (uno por taller) */}
              {selectedGrupos.map((g, i) => (
                <div key={g.id} className="space-y-1.5">
                  {selectedGrupos.length > 1 && (
                    <p className="text-[11px] font-bold text-[#172033] dark:text-[#F1F5F9]">
                      Contrato {i + 1} de {selectedGrupos.length}: {g.nombre}
                    </p>
                  )}
                  <div className="p-4 bg-[#F7F8FA] dark:bg-[#151A22] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#172033] dark:text-[#F1F5F9] whitespace-pre-line select-text border-l-4 border-l-[#4F46E5]">
                    {contratoDe(g)}
                  </div>
                </div>
              ))}

              {firmaReiniciada && !firmaDigitalUrl && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>Se corrigieron datos: el contrato se actualizó. El padre o tutor debe firmarlo y aceptarlo de nuevo.</span>
                </div>
              )}

              {/* Digital Signature Canvas */}
              <div className="pt-2">
                <DigitalSignaturePad
                  signerName={tutorNombre || 'Tutor Responsable'}
                  onSaveSignature={(dataUrl) => setFirmaDigitalUrl(dataUrl)}
                />
              </div>

              {/* Legal acceptance checkbox */}
              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-900/60 flex items-start space-x-2.5">
                <input
                  type="checkbox"
                  id="accept-terms"
                  checked={aceptaTerminos}
                  onChange={(e) => setAceptaTerminos(e.target.checked)}
                  className="w-4 h-4 rounded text-[#4F46E5] focus:ring-[#4F46E5] cursor-pointer mt-0.5"
                />
                <label
                  htmlFor="accept-terms"
                  className="text-xs text-indigo-950 dark:text-indigo-200 leading-snug cursor-pointer font-medium"
                >
                  Declaro bajo fe de juramento que he leído, comprendido y aceptado todas las cláusulas, deberes de asistencia, aranceles y normativas {selectedGrupos.length > 1 ? (
                    <>de los presentes <strong>Contratos Digitales de Matrícula</strong></>
                  ) : (
                    <>del presente <strong>Contrato Digital de Matrícula</strong></>
                  )}, autorizando la emisión de la firma digital correspondiente.
                </label>
              </div>

            </div>
          )}

          {/* STEP 4: Success & Voucher */}
          {step === 4 && createdSolicitudes.length > 0 && (() => {
            const primera = createdSolicitudes[0];
            const varias = createdSolicitudes.length > 1;
            const codigos = createdSolicitudes.map((s) => s.codigo_solicitud);
            const total = createdSolicitudes.reduce((suma, s) => suma + Number(montoDeSolicitud(s) || 0), 0);
            return (
            <div className="space-y-4 sm:space-y-6 text-center py-4 animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-300 dark:border-emerald-800">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Estado: PENDIENTE DE CAJA & SOLVENCIA
                </span>
                <h4 className="text-xl font-bold text-[#172033] dark:text-[#F1F5F9]">
                  {varias ? '¡Contratos Firmados y Solicitudes Registradas!' : '¡Contrato Firmado y Solicitud Registrada!'}
                </h4>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8] max-w-md mx-auto">
                  {varias
                    ? `Se enviaron ${createdSolicitudes.length} solicitudes de matrícula, una por taller,`
                    : 'La solicitud de matrícula ha sido enviada'}{' '}
                  al módulo de <strong>Caja y Validación</strong>.
                </p>
              </div>

              {errorParcial && (
                <div className="max-w-md mx-auto p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs text-left flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{errorParcial}</span>
                </div>
              )}

              {/* Receipt Summary Card */}
              <div className="max-w-md mx-auto bg-[#F7F8FA] dark:bg-[#151A22] p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] text-left space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Alumno:</span>
                  <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                    {primera.nombre_alumno} {primera.apellido_alumno} ({primera.codigo_alumno})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Grado y Aula:</span>
                  <span>{primera.grado} - {primera.aula_regular}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Tutor / Firmante:</span>
                  <span>{primera.tutor_nombre} ({primera.tutor_parentesco})</span>
                </div>
                {createdSolicitudes.map((s) => (
                  <div key={s.id} className="pt-2 border-t border-[#E7EAF0] dark:border-[#2B3442] space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[#667085] dark:text-[#94A3B8]">Código de Solicitud:</span>
                      <span className="font-mono font-bold text-sm text-[#4F46E5] dark:text-[#818CF8]">{s.codigo_solicitud}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">{s.grupo_nombre}</span>
                      <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                        {formatearMonto(montoDeSolicitud(s))} {etiquetaPeriodo()}
                      </span>
                    </div>
                  </div>
                ))}
                {varias && (
                  <div className="flex justify-between pt-2 border-t border-[#E7EAF0] dark:border-[#2B3442]">
                    <span className="text-[#667085] dark:text-[#94A3B8]">Total a Pagar:</span>
                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatearMonto(total)} {etiquetaPeriodo()}
                    </span>
                  </div>
                )}
              </div>

              {/* Next Step Notice */}
              <div className="max-w-md mx-auto p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 text-left flex items-start space-x-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Paso siguiente en Caja:</strong> El padre de familia debe presentarse a la ventanilla de Caja con{' '}
                  {varias ? 'los códigos' : 'el código'} <strong>{codigos.join(' y ')}</strong>. La chica de caja validará los datos y{' '}
                  {varias ? 'cada contrato firmado, registrará cada pago' : 'el contrato firmado, registrará el pago'} en el sistema contable y marcará al alumno como <strong>SOLVENTE</strong> para formalizar la matrícula.
                </div>
              </div>

              {/* Correo al tutor (resumen + contrato firmado en PDF) */}
              {createdSolicitudes.map((sol) => {
                const correo = correos[sol.id];
                if (!correo) return null;
                const etiqueta = varias ? ` de ${sol.codigo_solicitud} (${sol.grupo_nombre})` : '';
                return (
                <div
                  key={sol.id}
                  className={`max-w-md mx-auto p-3 rounded-xl border text-xs text-left flex items-start gap-2.5 ${
                    correo.estado === 'ok'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                      : correo.estado === 'error'
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                      : 'bg-slate-50 dark:bg-[#151A22] border-[#E7EAF0] dark:border-[#2B3442] text-[#667085] dark:text-[#94A3B8]'
                  }`}
                  role="status"
                >
                  {correo.estado === 'enviando' ? (
                    <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />
                  ) : correo.estado === 'ok' ? (
                    <Mail className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0 leading-relaxed">
                    {correo.estado === 'enviando' && (
                      <span>
                        Enviando el resumen y el contrato firmado{etiqueta} a <strong>{sol.tutor_email}</strong>…
                      </span>
                    )}
                    {correo.estado === 'ok' && (
                      <span>
                        Resumen y contrato firmado (PDF){etiqueta} enviados a <strong>{correo.mensaje || sol.tutor_email}</strong>.
                      </span>
                    )}
                    {correo.estado === 'error' && (
                      <>
                        <span className="block">
                          No se pudo enviar el correo{etiqueta} al tutor. La solicitud sí quedó registrada.
                        </span>
                        {correo.mensaje && <span className="block text-[11px] opacity-80 mt-0.5">{correo.mensaje}</span>}
                        <button
                          type="button"
                          onClick={() => void enviarCorreoTutor(sol.id)}
                          className="mt-1.5 inline-flex items-center gap-1 font-semibold underline cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reintentar
                        </button>
                      </>
                    )}
                  </div>
                </div>
                );
              })}

              {/* Action Buttons */}
              <div className="flex items-center justify-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={handlePrintVoucher}
                  className="px-4 py-2 border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#151A22] transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Comprobante</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 sm:px-6 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Entendido y Finalizar
                </button>
              </div>
            </div>
            );
          })()}
        </div>

        {/* Pie fijo con la navegación: siempre visible, aunque el paso sea largo (contratos y firma) */}
        {step < 4 && (
          <div className="shrink-0 border-t border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
            {step === 1 ? (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none justify-center px-4 py-2.5 border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#151A22] transition flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Cancelar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => irAPaso(step === 3 ? 2 : 1)}
                disabled={isSubmitting}
                className="flex-1 sm:flex-none justify-center px-4 py-2.5 border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs font-semibold text-[#172033] dark:text-[#F1F5F9] hover:bg-slate-50 dark:hover:bg-[#151A22] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={step === 3 ? 'Volver a la selección de talleres' : 'Volver a los datos del alumno y tutor'}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>
                  Atrás<span className="hidden sm:inline">{step === 3 ? ': Talleres' : ': Datos del alumno'}</span>
                </span>
              </button>
            )}

            {step === 1 && (
              <button
                type="submit"
                form="form-matricula-paso1"
                className="flex-1 sm:flex-none justify-center px-5 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                <span>
                  Continuar<span className="hidden sm:inline"> a Selección de Taller</span>
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={handleValidateStep2}
                disabled={selectedGrupos.length === 0 || !!problemaSeleccion}
                className="flex-1 sm:flex-none justify-center px-5 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                <span>
                  Continuar<span className="hidden sm:inline"> a Contrato y Firma</span>
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleSubmitEnrollment}
                disabled={isSubmitting || !firmaDigitalUrl || !aceptaTerminos}
                className="flex-1 sm:flex-none justify-center px-4 sm:px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                title={!firmaDigitalUrl || !aceptaTerminos ? 'Falta la firma y la aceptación del contrato' : undefined}
              >
                {isSubmitting ? (
                  <span>Registrando…</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      <span className="sm:hidden">Firmar y enviar</span>
                      <span className="hidden sm:inline">
                        {selectedGrupos.length > 1
                          ? `Firmar y Enviar ${selectedGrupos.length} Solicitudes a Caja`
                          : 'Firmar y Enviar Solicitud a Caja'}
                      </span>
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

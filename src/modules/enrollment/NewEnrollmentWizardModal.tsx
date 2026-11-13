import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { Grupo, SolicitudMatricula } from '../../types/attendance';
import { gradosDisponibles } from '../../utils/grados';
import { storageService } from '../../services/storage.service';
import { generateInstitutionalContractText } from '../../utils/contractTemplate';
import { arancelDeGrupo, etiquetaPeriodo, formatearMonto, montoDeSolicitud } from '../../utils/arancel';
import { DigitalSignaturePad } from '../../components/DigitalSignaturePad';

interface NewEnrollmentWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrollmentCreated?: (solicitud: SolicitudMatricula) => void;
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

  // Step 2: Workshop Selection
  const [selectedGrupoId, setSelectedGrupoId] = useState<string>(preselectedGrupoId || '');

  // Step 3: Contract & Digital Signature
  const [firmaDigitalUrl, setFirmaDigitalUrl] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  // Result / Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdSolicitud, setCreatedSolicitud] = useState<SolicitudMatricula | null>(null);

  // Available workshops
  const grupos = useMemo(() => storageService.getGrupos(), []);

  // Pre-fill existing student data if student code matches existing student
  const handleCodigoChange = (code: string) => {
    setCodigoAlumno(code);
    const existing = storageService.getEstudiantes().find(
      (e) => e.matricula.trim().toUpperCase() === code.trim().toUpperCase()
    );
    if (existing) {
      setNombreAlumno(existing.nombre);
      setApellidoAlumno(existing.apellido);
      if (existing.edad) setEdad(existing.edad);
      if (existing.grado) setGrado(existing.grado);
      if (existing.aula_regular) setAulaRegular(existing.aula_regular);

      const tutor = storageService.getTutorById(existing.tutor_id);
      if (tutor) {
        setTutorNombre(tutor.nombre);
        setTutorEmail(tutor.email);
        setTutorTelefono(tutor.telefono);
        if (tutor.parentesco) setTutorParentesco(tutor.parentesco);
      }
    }
  };

  const selectedGrupo = useMemo(() => {
    return grupos.find((g) => g.id === selectedGrupoId) || null;
  }, [grupos, selectedGrupoId]);

  // Conflict evaluation for selected workshop
  const conflictoEvaluacion = useMemo(() => {
    if (!selectedGrupo || !codigoAlumno.trim()) return { tieneConflicto: false };
    const existing = storageService.getEstudiantes().find(
      (e) => e.matricula.trim().toUpperCase() === codigoAlumno.trim().toUpperCase()
    );
    if (!existing) return { tieneConflicto: false };
    return storageService.verificarConflictoHorario(existing.id, selectedGrupo);
  }, [selectedGrupo, codigoAlumno]);

  // Generated Contract Text
  const contratoTexto = useMemo(() => {
    if (!selectedGrupo) return '';
    const DIAS_LABELS: Record<number, string> = {
      1: 'Lunes',
      2: 'Martes',
      3: 'Miércoles',
      4: 'Jueves',
      5: 'Viernes',
      6: 'Sábado',
      7: 'Domingo',
    };
    const diasStr = (selectedGrupo.dias_semana || []).map((d) => DIAS_LABELS[d] || d).join(', ');

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
      tallerNombre: selectedGrupo.nombre,
      tallerHorario: `${selectedGrupo.hora_inicio} a ${selectedGrupo.hora_fin}`,
      tallerDias: diasStr,
      tallerAula: selectedGrupo.aula || 'Taller Principal',
      arancel: arancelDeGrupo(selectedGrupo),
    });
  }, [
    codigoAlumno,
    nombreAlumno,
    apellidoAlumno,
    edad,
    grado,
    aulaRegular,
    tutorNombre,
    tutorCedula,
    tutorParentesco,
    tutorTelefono,
    tutorEmail,
    selectedGrupo,
  ]);

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
  };

  // Validation before going to Step 3
  const handleValidateStep2 = () => {
    setErrorMessage(null);
    if (!selectedGrupoId) {
      setErrorMessage('Debe seleccionar el taller extracurricular al que desea matricularse.');
      return;
    }
    if (conflictoEvaluacion.tieneConflicto) {
      setErrorMessage(`No se puede seleccionar este taller: ${conflictoEvaluacion.motivo}`);
      return;
    }
    setStep(3);
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
    if (!selectedGrupo) return;

    try {
      setIsSubmitting(true);
      const nueva = storageService.crearSolicitudMatricula({
        codigo_alumno: codigoAlumno.trim().toUpperCase(),
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
        grupo_id: selectedGrupo.id,
        grupo_nombre: selectedGrupo.nombre,
        contrato_texto: contratoTexto,
        contrato_firmado: true,
        firma_digital_url: firmaDigitalUrl,
        fecha_firma: new Date().toISOString(),
        firmante_nombre: tutorNombre.trim(),
        monto_arancel: arancelDeGrupo(selectedGrupo),
      });

      setCreatedSolicitud(nueva);
      setStep(4);
      onEnrollmentCreated?.(nueva);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al registrar la solicitud');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintVoucher = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#1B222D] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden border border-[#E7EAF0] dark:border-[#2B3442] text-[#172033] dark:text-[#F1F5F9] flex flex-col">
        {/* Header */}
        <div className="bg-[#172033] dark:bg-[#151A22] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
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
        <div className="bg-[#F7F8FA] dark:bg-[#151A22] border-b border-[#E7EAF0] dark:border-[#2B3442] px-6 py-3 shrink-0">
          <div className="flex items-center justify-between max-w-xl mx-auto text-xs">
            {/* Step 1 */}
            <div
              className={`flex items-center space-x-2 font-semibold ${
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
            </div>

            <div className="flex-1 h-0.5 mx-3 bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full bg-[#4F46E5] transition-all"
                style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}
              ></div>
            </div>

            {/* Step 2 */}
            <div
              className={`flex items-center space-x-2 font-semibold ${
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
              <span className="hidden sm:inline">2. Taller Deseado</span>
            </div>

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
        <div className="p-6 overflow-y-auto flex-1">
          {/* STEP 1: Student and Tutor Information */}
          {step === 1 && (
            <form onSubmit={handleValidateStep1} className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] mb-1 flex items-center space-x-2">
                  <Users className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
                  <span>Datos del Alumno</span>
                </h4>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8] mb-3">
                  Ingrese el código escolar y los datos académicos del estudiante en su horario regular.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[#172033] dark:text-[#F1F5F9]">
                      Código de Alumno / Carnet *
                    </label>
                    <input
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

              <div className="flex items-center justify-end pt-4 border-t border-[#E7EAF0] dark:border-[#2B3442]">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-2 cursor-pointer"
                >
                  <span>Continuar a Selección de Taller</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Workshop Selection & Schedule Conflict Check */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9] mb-1 flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" />
                  <span>Seleccionar Taller Extracurricular Deseado</span>
                </h4>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  Alumno: <strong>{nombreAlumno} {apellidoAlumno}</strong> ({codigoAlumno} - {grado}). Un alumno puede estar en más de un taller, siempre y cuando no colisionen sus horarios.
                </p>
              </div>

              {/* Workshops Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
                {grupos.map((grupo) => {
                  const isSelected = selectedGrupoId === grupo.id;
                  const DIAS_LABELS: Record<number, string> = {
                    1: 'Lunes',
                    2: 'Martes',
                    3: 'Miércoles',
                    4: 'Jueves',
                    5: 'Viernes',
                    6: 'Sábado',
                    7: 'Domingo',
                  };
                  const diasTexto = (grupo.dias_semana || [])
                    .map((d) => DIAS_LABELS[d] || d)
                    .join(', ');

                  // Check conflict for this card
                  let hasConflict = false;
                  let conflictText = '';
                  const existing = storageService.getEstudiantes().find(
                    (e) => e.matricula.trim().toUpperCase() === codigoAlumno.trim().toUpperCase()
                  );
                  if (existing) {
                    const c = storageService.verificarConflictoHorario(existing.id, grupo);
                    if (c.tieneConflicto) {
                      hasConflict = true;
                      conflictText = c.motivo || 'Colisión de horario';
                    }
                  }

                  return (
                    <div
                      key={grupo.id}
                      onClick={() => {
                        if (!hasConflict) setSelectedGrupoId(grupo.id);
                      }}
                      className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
                        hasConflict
                          ? 'opacity-60 bg-slate-50 dark:bg-slate-900/40 border-rose-300 dark:border-rose-900/40 cursor-not-allowed'
                          : isSelected
                          ? 'border-[#4F46E5] bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs cursor-pointer ring-2 ring-indigo-500/20'
                          : 'border-[#E7EAF0] dark:border-[#2B3442] hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer bg-white dark:bg-[#1B222D]'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <h5 className="font-bold text-xs text-[#172033] dark:text-[#F1F5F9]">
                            {grupo.nombre}
                          </h5>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-[#4F46E5] text-white flex items-center justify-center shrink-0">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
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

              <div className="flex items-center justify-between pt-4 border-t border-[#E7EAF0] dark:border-[#2B3442]">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#151A22] transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Volver a Datos</span>
                </button>

                <button
                  type="button"
                  onClick={handleValidateStep2}
                  disabled={!selectedGrupoId || conflictoEvaluacion.tieneConflicto}
                  className="px-5 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
                >
                  <span>Continuar a Contrato y Firma</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
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
                  Lea el contrato generado con los datos de matrícula. El padre o tutor debe firmar en el recuadro interactivo.
                </p>
              </div>

              {/* Readonly Contract Scroll Box */}
              <div className="p-4 bg-[#F7F8FA] dark:bg-[#151A22] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#172033] dark:text-[#F1F5F9] whitespace-pre-line select-text border-l-4 border-l-[#4F46E5]">
                {contratoTexto}
              </div>

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
                  Declaro bajo fe de juramento que he leído, comprendido y aceptado todas las cláusulas, deberes de asistencia, aranceles y normativas del presente <strong>Contrato Digital de Matrícula</strong>, autorizando la emisión de la firma digital correspondiente.
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#E7EAF0] dark:border-[#2B3442]">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-[#E7EAF0] dark:border-[#2B3442] rounded-xl text-xs font-semibold text-[#667085] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#151A22] transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Volver a Selección</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubmitEnrollment}
                  disabled={isSubmitting || !firmaDigitalUrl || !aceptaTerminos}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span>Registrando Solicitud...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Firmar y Enviar Solicitud a Caja</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Success & Voucher */}
          {step === 4 && createdSolicitud && (
            <div className="space-y-6 text-center py-4 animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-300 dark:border-emerald-800">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Estado: PENDIENTE DE CAJA & SOLVENCIA
                </span>
                <h4 className="text-xl font-bold text-[#172033] dark:text-[#F1F5F9]">
                  ¡Contrato Firmado y Solicitud Registrada!
                </h4>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8] max-w-md mx-auto">
                  La solicitud de matrícula ha sido enviada al módulo de <strong>Caja y Validación</strong>.
                </p>
              </div>

              {/* Receipt Summary Card */}
              <div className="max-w-md mx-auto bg-[#F7F8FA] dark:bg-[#151A22] p-4 rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] text-left space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-[#E7EAF0] dark:border-[#2B3442]">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Código de Solicitud:</span>
                  <span className="font-mono font-bold text-sm text-[#4F46E5] dark:text-[#818CF8]">
                    {createdSolicitud.codigo_solicitud}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Alumno:</span>
                  <span className="font-semibold text-[#172033] dark:text-[#F1F5F9]">
                    {createdSolicitud.nombre_alumno} {createdSolicitud.apellido_alumno} ({createdSolicitud.codigo_alumno})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Grado y Aula:</span>
                  <span>{createdSolicitud.grado} - {createdSolicitud.aula_regular}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Taller:</span>
                  <span className="font-semibold">{createdSolicitud.grupo_nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Tutor / Firmante:</span>
                  <span>{createdSolicitud.tutor_nombre} ({createdSolicitud.tutor_parentesco})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085] dark:text-[#94A3B8]">Arancel a Pagar:</span>
                  <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatearMonto(montoDeSolicitud(createdSolicitud))} {etiquetaPeriodo()}
                  </span>
                </div>
              </div>

              {/* Next Step Notice */}
              <div className="max-w-md mx-auto p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 text-left flex items-start space-x-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Paso siguiente en Caja:</strong> El padre de familia debe presentarse a la ventanilla de Caja con el código <strong>{createdSolicitud.codigo_solicitud}</strong>. La chica de caja validará los datos y el contrato firmado, registrará el pago en el sistema contable y marcará al alumno como <strong>SOLVENTE</strong> para formalizar la matrícula.
                </div>
              </div>

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
                  className="px-6 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Entendido y Finalizar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

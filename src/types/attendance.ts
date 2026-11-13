export type UserRole = 'ADMIN' | 'PROFESOR' | 'CAJERO' | 'MATRICULA';

export type EstatusAsistencia = 'PRESENTE' | 'AUSENTE' | 'JUSTIFICADO';

export type TipoNotificacion = 'INICIAL' | 'RECTIFICACION';

export interface Perfil {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  username?: string;
  rol: UserRole;
  cargo?: string;
  especialidad?: string;
  telefono?: string;
  activo?: boolean;
  creado_en: string;
}

export interface Tutor {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  parentesco?: string;
  creado_en: string;
}

export type EstadoEstudiante = 'ACTIVO' | 'BAJA' | 'PENDIENTE_RENOVACION';

export type EstadoPagoAnual = 'AL_DIA' | 'PENDIENTE' | 'EXENTO';

export interface Estudiante {
  id: string;
  matricula: string;
  nombre: string;
  apellido: string;
  edad?: number;
  grado?: string;
  aula_regular?: string;
  tutor_id: string;
  creado_en: string;
  avatar_url?: string;
  solvente?: boolean;
  numero_recibo_caja?: string;
  matricula_solicitud_id?: string;

  // Estado del alumno y permanencia (baja temporal sin eliminación)
  estado?: EstadoEstudiante; // 'ACTIVO' | 'BAJA' | 'PENDIENTE_RENOVACION'
  fecha_baja?: string; // Fecha en que se dio de baja
  motivo_baja?: string; // Motivo registrado de la baja
  fecha_reactivacion?: string; // Última fecha de reincorporación

  // Renovación anual de contrato y pago
  ciclo_actual?: string; // Ej: '2026'
  contrato_vigente?: boolean; // Contrato anual firmado y renovado
  contrato_texto?: string; // Texto del contrato anual
  fecha_renovacion_contrato?: string; // Fecha de renovación
  firma_digital_url?: string; // Firma digital del tutor
  fecha_firma?: string; // Fecha y hora de firma
  firmante_nombre?: string; // Nombre de la persona que firmó
  estado_pago_anual?: EstadoPagoAnual; // 'AL_DIA' | 'PENDIENTE' | 'EXENTO'
  fecha_ultimo_pago_anual?: string;
  numero_recibo_anual?: string;
  observaciones_renovacion?: string;
}

export interface Grupo {
  id: string;
  nombre: string;
  profesor_id: string;
  dias_semana: number[]; // 1 = Lunes, 2 = Martes, ..., 6 = Sábado, 7 = Domingo
  hora_inicio: string; // HH:mm
  hora_fin: string; // HH:mm
  fecha_inicio_ciclo: string; // YYYY-MM-DD
  fecha_fin_ciclo: string; // YYYY-MM-DD
  aula?: string;
  color_tag?: string;
  /** Arancel propio del taller (C$). Si no se indica, se usa el arancel general de Configuración */
  costo?: number;
  creado_en: string;
}

export interface Inscripcion {
  id: string;
  grupo_id: string;
  estudiante_id: string;
  fecha_inscripcion: string;
}

export interface Sesion {
  id: string;
  grupo_id: string;
  fecha: string; // YYYY-MM-DD
  hora_inicio: string;
  hora_fin: string;
  cerrada: boolean;
  fecha_cierre?: string | null;
  tema?: string;
  google_calendar_event_id?: string | null;
  /** Clase fuera de los días habituales (reposición). No se elimina al reconciliar el calendario */
  extraordinaria?: boolean;
}

export interface Asistencia {
  id: string;
  sesion_id: string;
  estudiante_id: string;
  estatus: EstatusAsistencia;
  motivo_justificacion?: string | null;
  registrado_por?: string | null;
  actualizado_en: string;
}

export interface LogNotificacion {
  id: string;
  idempotency_key: string;
  asistencia_id: string;
  estudiante_id: string;
  estudiante_nombre: string;
  tutor_id?: string;
  tutor_email: string;
  tutor_nombre?: string;
  taller_nombre: string;
  fecha_sesion: string;
  tipo: TipoNotificacion;
  estatus_entrega: 'ENVIADO' | 'PENDIENTE' | 'ERROR' | 'SIMULADO';
  metodo: 'GMAIL_API' | 'SMTP_INSTITUCIONAL';
  detalles_error?: string | null;
  enviado_en: string;
}

/** Salón / aula del catálogo (Configuración → Salones). grupos.aula guarda su nombre. */
export interface Salon {
  id: string;
  nombre: string;
  ubicacion?: string;
  capacidad?: number;
  activo: boolean;
  creado_en: string;
}

export type TipoAnotacion ='COMENTARIO' | 'INDISCIPLINA' | 'LOGRO';

/** Registro del anecdotario (expediente) de un estudiante. No editable; solo ADMIN borra. */
export interface Anotacion {
  id: string;
  estudiante_id: string;
  grupo_id?: string;
  sesion_id?: string;
  autor_id: string;
  autor_nombre: string;
  tipo: TipoAnotacion;
  descripcion: string;
  creado_en: string;
  /** Última corrección hecha por Dirección (solo ADMIN puede editar) */
  editado_en?: string;
  editado_por_nombre?: string;
}

export type PeriodoArancel = 'MENSUAL' | 'CICLO';

export interface ConfiguracionSistema {
  id: number;
  limite_ausencias_alerta: number;
  porcentaje_inasistencia_alerta: number;
  nombre_institucion: string;
  email_remitente: string;
  ciclo_academico_actual: string;
  /** Plantilla de contrato con variables {{...}}; vacío = plantilla predeterminada */
  plantilla_contrato?: string;
  /** Arancel general de los talleres (C$) */
  arancel_taller: number;
  /** Periodo al que corresponde el arancel */
  arancel_periodo: PeriodoArancel;
  updated_at: string;
}

export interface AlertaEstudiante {
  estudiante_id: string;
  estudiante_nombre: string;
  matricula: string;
  tutor_nombre: string;
  tutor_email: string;
  grupo_id: string;
  grupo_nombre: string;
  sesiones_cerradas: number;
  total_asistencias: number;
  total_ausencias: number;
  total_justificadas: number;
  porcentaje_inasistencia: number;
  tiene_alerta: boolean;
  nivel_alerta: 'NORMAL' | 'ADVERTENCIA' | 'CRITICA';
}

export type EstadoMatricula = 'PENDIENTE_CAJA' | 'SOLVENTE' | 'ACEPTADA' | 'RECHAZADA';

export const GRADOS_ESCOLARES = [
  '1er Grado',
  '2do Grado',
  '3er Grado',
  '4to Grado',
  '5to Grado',
  '6to Grado',
  '7mo Grado',
  '8vo Grado',
  '9no Grado',
  '10mo Grado',
  '11mo Grado',
] as const;

export type GradoEscolar = typeof GRADOS_ESCOLARES[number];

export type TipoTramiteMatricula = 'NUEVA_MATRICULA' | 'RENOVACION_ANUAL';

export interface SolicitudMatricula {
  id: string;
  codigo_solicitud: string; // Ej: "MAT-2026-081" o "REN-2026-012"
  tipo_tramite?: TipoTramiteMatricula; // 'NUEVA_MATRICULA' | 'RENOVACION_ANUAL'
  estudiante_id?: string; // ID del alumno para renovaciones de matrícula
  ciclo_academico?: string; // Ej: "2026", "2027"
  codigo_alumno: string; // Código escolar único
  nombre_alumno: string;
  apellido_alumno: string;
  edad: number;
  grado: string; // 1er Grado a 11mo Grado
  aula_regular: string; // Ej: "Aula 5-B", "Pabellón A"

  // Datos del tutor o padre de familia
  tutor_nombre: string;
  tutor_email: string;
  tutor_telefono: string;
  tutor_parentesco?: string;
  tutor_cedula?: string;

  // Taller seleccionado
  grupo_id: string;
  grupo_nombre: string;
  fecha_solicitud: string;

  // Contrato digital y firma
  contrato_texto: string;
  contrato_firmado: boolean;
  firma_digital_url?: string; // Data URL en base64 de la firma
  fecha_firma?: string;
  firmante_nombre?: string;

  // Validación de Caja y Solvencia Contable
  estado: EstadoMatricula;
  validado_datos: boolean; // Caja valida que datos del alumno y tutor estén correctos
  validado_contrato: boolean; // Caja valida que el contrato esté debidamente firmado
  solvente: boolean; // Caja indica en esta app que el alumno ya está solvente
  numero_recibo_caja?: string; // Recibo del sistema contable
  monto_arancel?: number;
  metodo_pago?: string; // Efectivo, Tarjeta, Transferencia
  cajero_nombre?: string;
  cajero_observaciones?: string;
  fecha_pago?: string;

  // Aceptación de Matrícula
  fecha_aceptacion?: string;
  estudiante_id_creado?: string;
}

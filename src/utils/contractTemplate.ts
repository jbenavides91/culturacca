import { storageService } from '../services/storage.service';
import { arancelGeneral, etiquetaPeriodo, formatearMonto } from './arancel';

export interface ContractData {
  codigoAlumno: string;
  nombreAlumno: string;
  edad: number;
  grado: string;
  aulaRegular: string;
  nombreTutor: string;
  cedulaTutor?: string;
  parentesco?: string;
  telefonoTutor: string;
  emailTutor: string;
  tallerNombre: string;
  tallerHorario?: string;
  tallerDias?: string;
  tallerAula?: string;
  cicloAcademico?: string;
  /** Arancel del taller (C$). Si no se indica, se usa el arancel general */
  arancel?: number;
}

/** Variables disponibles en la plantilla. Escritas en MAYÚSCULAS, el valor se inserta en mayúsculas. */
export const VARIABLES_CONTRATO: { clave: string; descripcion: string }[] = [
  { clave: 'institucion', descripcion: 'Nombre de la institución' },
  { clave: 'ciclo', descripcion: 'Ciclo académico' },
  { clave: 'fecha', descripcion: 'Fecha de hoy' },
  { clave: 'nombre_alumno', descripcion: 'Nombre completo del alumno' },
  { clave: 'codigo_alumno', descripcion: 'Código / matrícula escolar' },
  { clave: 'edad', descripcion: 'Edad del alumno' },
  { clave: 'grado', descripcion: 'Grado escolar' },
  { clave: 'aula_regular', descripcion: 'Aula del horario regular' },
  { clave: 'nombre_tutor', descripcion: 'Nombre del tutor' },
  { clave: 'cedula_tutor', descripcion: 'Cédula del tutor' },
  { clave: 'parentesco', descripcion: 'Parentesco del tutor' },
  { clave: 'telefono_tutor', descripcion: 'Teléfono del tutor' },
  { clave: 'email_tutor', descripcion: 'Correo del tutor' },
  { clave: 'taller', descripcion: 'Nombre del taller' },
  { clave: 'taller_dias', descripcion: 'Días del taller' },
  { clave: 'taller_horario', descripcion: 'Horario del taller' },
  { clave: 'taller_aula', descripcion: 'Aula del taller' },
  { clave: 'arancel', descripcion: 'Arancel del taller (ej. C$ 1,200)' },
  { clave: 'periodo_arancel', descripcion: 'Periodo del arancel (/ mes o por ciclo)' },
];

const CLAVES_VALIDAS = new Set(VARIABLES_CONTRATO.map((v) => v.clave));
const VARIABLE_REGEX = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;

export const PLANTILLA_CONTRATO_PREDETERMINADA = `========================================================================================
CONTRATO INSTITUCIONAL DE PRESTACIÓN DE SERVICIOS EDUCATIVOS EXTRACURRICULARES
TALLERES VESPERTINOS Y DE FORMACIÓN ARTÍSTICA - {{CICLO}}
========================================================================================

Conste por el presente documento privado de naturaleza educativa y contractual que celebran, de una parte:

1. LA INSTITUCIÓN EDUCATIVA: {{institucion}}, entidad dedicada a la formación integral y desarrollo de talentos.
2. EL TUTOR / RESPONSABLE LEGAL: {{NOMBRE_TUTOR}}, mayor de edad, con documento de identidad / cédula {{cedula_tutor}}, en calidad de {{parentesco}}, con número de contacto {{telefono_tutor}} y correo electrónico formal: {{email_tutor}}, en representación del estudiante:

   • Nombre del Alumno: {{NOMBRE_ALUMNO}}
   • Código de Matrícula Escolar: {{codigo_alumno}}
   • Edad: {{edad}} años
   • Grado y Aula de Horario Regular: {{grado}} ({{aula_regular}})

Ambas partes convienen en formalizar la matrícula extracurricular con sujeción a las siguientes cláusulas:

CLÁUSULA PRIMERA (OBJETO DEL CONTRATO):
La institución se compromete a impartir la formación integral en el "{{TALLER}}", en las instalaciones y talleres asignados ({{taller_aula}}). El estudiante cursará el programa académico en los días y horarios fijados: {{taller_dias}} de {{taller_horario}}.

CLÁUSULA SEGUNDA (COMPROMISOS DE ASISTENCIA Y PUNTUALIDAD):
El Padre de Familia o Tutor se compromete a garantizar la asistencia puntual y continua del alumno. La institución llevará un registro automatizado de asistencia en cada sesión. Se estipula un mínimo de 80% de asistencia para obtener la certificación o diploma al culminar el ciclo. En caso de ausencia, el sistema enviará notificación inmediata al correo registrado: {{email_tutor}}.

CLÁUSULA TERCERA (RÉGIMEN ECONÓMICO Y OBLIGACIÓN DE SOLVENCIA EN CAJA):
1. El Padre de Familia o Tutor acepta el arancel correspondiente al taller extracurricular seleccionado: {{arancel}} {{periodo_arancel}}.
2. La presente solicitud digital de matrícula queda en estado PENDIENTE DE CAJA hasta que el Padre de Familia realice el pago en la ventanilla de Caja de la Institución y se emita el respectivo recibo oficial en el sistema contable.
3. La persona encargada de Caja validará los datos del estudiante, la firma del presente contrato y confirmará la SOLVENCIA en la aplicación para proceder con la Aceptación Oficial de la Matrícula.

CLÁUSULA CUARTA (AUTORIZACIÓN DE COMUNICACIONES Y NOTIFICACIONES):
El Tutor autoriza formalmente a la institución para el envío de bitácoras de asistencia, estados de cuenta, rectificaciones de faltas y reportes al correo electrónico y teléfono consignados en este formulario.

CLÁUSULA QUINTA (VALIDEZ LEGAL DE LA FIRMA DIGITAL):
Ambas partes reconocen que la firma digital consignada electrónicamente al pie de este formulario, junto con el sello de tiempo digital, posee plena validez y fuerza obligatoria con los mismos efectos de una firma manuscrita.

Firmado digitalmente en fe de conformidad en fecha {{fecha}}.
Firmante: {{nombre_tutor}} (Tutor Responsable)
`;

/** Variables escritas en la plantilla que no existen (para advertir al editar) */
export function variablesDesconocidas(plantilla: string): string[] {
  const desconocidas = new Set<string>();
  for (const match of plantilla.matchAll(VARIABLE_REGEX)) {
    const clave = match[1].toLowerCase();
    if (!CLAVES_VALIDAS.has(clave)) desconocidas.add(match[1]);
  }
  return Array.from(desconocidas);
}

/** Reemplaza las variables {{...}} de una plantilla con los datos del contrato */
export function renderContrato(plantilla: string, data: ContractData): string {
  const config = storageService.getConfiguracion();
  const fechaHoy = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const valores: Record<string, string> = {
    institucion: config.nombre_institucion || 'Colegio Centro América',
    ciclo: data.cicloAcademico || config.ciclo_academico_actual || '',
    fecha: fechaHoy,
    nombre_alumno: data.nombreAlumno,
    codigo_alumno: data.codigoAlumno,
    edad: String(data.edad ?? ''),
    grado: data.grado,
    aula_regular: data.aulaRegular,
    nombre_tutor: data.nombreTutor,
    cedula_tutor: data.cedulaTutor || 'N/A',
    parentesco: data.parentesco || 'Tutor(a) Legal',
    telefono_tutor: data.telefonoTutor,
    email_tutor: data.emailTutor,
    taller: data.tallerNombre,
    taller_dias: data.tallerDias || 'Según programación',
    taller_horario: data.tallerHorario || 'Horario Vespertino',
    taller_aula: data.tallerAula || 'Taller Principal',
    arancel: formatearMonto(data.arancel && data.arancel > 0 ? data.arancel : arancelGeneral()),
    periodo_arancel: etiquetaPeriodo(),
  };

  return plantilla.replace(VARIABLE_REGEX, (original, nombre: string) => {
    const clave = nombre.toLowerCase();
    if (!(clave in valores)) return original;
    const valor = valores[clave] ?? '';
    const enMayusculas = nombre === nombre.toUpperCase();
    return enMayusculas ? valor.toUpperCase() : valor;
  });
}

/** Plantilla activa: la personalizada en Configuración o la predeterminada */
export function getPlantillaContratoActiva(): string {
  const personalizada = storageService.getConfiguracion().plantilla_contrato;
  return personalizada && personalizada.trim() ? personalizada : PLANTILLA_CONTRATO_PREDETERMINADA;
}

export function generateInstitutionalContractText(data: ContractData): string {
  return renderContrato(getPlantillaContratoActiva(), data);
}

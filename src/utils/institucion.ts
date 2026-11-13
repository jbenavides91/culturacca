import { storageService } from '../services/storage.service';

export const NOMBRE_INSTITUCION_PREDETERMINADO = 'Colegio Centro América';

/** Nombre de la institución configurado en Configuración → Reglas y Parámetros */
export function nombreInstitucion(): string {
  return storageService.getConfiguracion().nombre_institucion?.trim() || NOMBRE_INSTITUCION_PREDETERMINADO;
}

/** Ciclo académico configurado en Configuración → Reglas y Parámetros (p. ej. "Ciclo Vespertino 2026") */
export function cicloActual(): string {
  return storageService.getConfiguracion().ciclo_academico_actual?.trim() || `Ciclo ${new Date().getFullYear()}`;
}

import { GRADOS_ESCOLARES } from '../types/attendance';
import { storageService } from '../services/storage.service';

/**
 * Nombres de los grados activos del catálogo (Configuración → Grados), en orden.
 * Si el catálogo está vacío usa los grados por defecto. Si se pasa `actual` y no está
 * entre los activos (grado desactivado o antiguo), se incluye para no perderlo al editar.
 */
export function gradosDisponibles(actual?: string): string[] {
  const catalogo = storageService.getGrados();
  const activos = catalogo.length > 0 ? catalogo.filter((g) => g.activo).map((g) => g.nombre) : [...GRADOS_ESCOLARES];
  if (actual && actual.trim() && !activos.some((g) => g.toLowerCase() === actual.trim().toLowerCase())) {
    return [actual, ...activos];
  }
  return activos;
}

/** Posición de un grado en el catálogo (para ordenar); -1 si no está */
export function indiceGrado(nombre: string): number {
  const catalogo = storageService.getGrados();
  const lista = catalogo.length > 0 ? catalogo.map((g) => g.nombre) : [...GRADOS_ESCOLARES];
  const clave = nombre.trim().toLowerCase();
  return lista.findIndex((g) => g.toLowerCase() === clave);
}

import { storageService } from '../services/storage.service';
import { Grupo, PeriodoArancel } from '../types/attendance';

export const ARANCEL_PREDETERMINADO = 1200;

/** Arancel general de los talleres (Configuración → Reglas y Parámetros) */
export function arancelGeneral(): number {
  const valor = Number(storageService.getConfiguracion().arancel_taller);
  return valor > 0 ? valor : ARANCEL_PREDETERMINADO;
}

export function periodoArancel(): PeriodoArancel {
  return storageService.getConfiguracion().arancel_periodo === 'CICLO' ? 'CICLO' : 'MENSUAL';
}

/** Arancel efectivo de un taller: su costo propio o, si no tiene, el general */
export function arancelDeGrupo(grupo?: Grupo | string | null): number {
  const g = typeof grupo === 'string' ? storageService.getGrupoById(grupo) : grupo;
  const propio = Number(g?.costo);
  return propio > 0 ? propio : arancelGeneral();
}

/** "C$ 1,200" */
export function formatearMonto(monto: number): string {
  return `C$ ${Number(monto || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** "/ mes" o "por ciclo" */
export function etiquetaPeriodo(periodo: PeriodoArancel = periodoArancel()): string {
  return periodo === 'CICLO' ? 'por ciclo' : '/ mes';
}

/** Monto guardado en una matrícula o, si no tiene, el arancel actual del taller */
export function montoDeSolicitud(sol: { monto_arancel?: number; grupo_id?: string }): number {
  return sol.monto_arancel && sol.monto_arancel > 0 ? sol.monto_arancel : arancelDeGrupo(sol.grupo_id);
}

import { UserRole } from '../types/attendance';
import { NavTab } from '../modules/navigation/Sidebar';

export interface RoleConfig {
  allowedTabs: NavTab[];
  defaultTab: NavTab;
  roleBadgeLabel: string;
  roleDescription: string;
  canViewExecutiveDashboard: boolean;
  canManageTeachers: boolean;
  canManageWorkshops: boolean;
  canManageSystemConfig: boolean;
}

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  ADMIN: {
    allowedTabs: [
      'dashboard',
      'asistencia',
      'grupos',
      'matriculas',
      'caja',
      'maestros',
      'estudiantes',
      'reportes',
      'config',
    ],
    defaultTab: 'dashboard',
    roleBadgeLabel: 'Dirección & Admin',
    roleDescription: 'Acceso total a estadísticas globales, nómina docente, finanzas y reglas.',
    canViewExecutiveDashboard: true,
    canManageTeachers: true,
    canManageWorkshops: true,
    canManageSystemConfig: true,
  },
  PROFESOR: {
    allowedTabs: [
      'asistencia',
      'grupos',
      'reportes',
    ],
    defaultTab: 'asistencia',
    roleBadgeLabel: 'Docente / Tallerista',
    roleDescription: 'Acceso exclusivo a Toma de Asistencia, Mis talleres y Reporte de Asistencia.',
    canViewExecutiveDashboard: false,
    canManageTeachers: false,
    canManageWorkshops: false,
    canManageSystemConfig: false,
  },
  CAJERO: {
    allowedTabs: [
      'caja',
      'reportes',
    ],
    defaultTab: 'caja',
    roleBadgeLabel: 'Caja y Solvencia',
    roleDescription: 'Acceso exclusivo a Caja y Solvencia y al Historial de Recibos en Reportes.',
    canViewExecutiveDashboard: false,
    canManageTeachers: false,
    canManageWorkshops: false,
    canManageSystemConfig: false,
  },
  MATRICULA: {
    allowedTabs: [
      'matriculas',
      'estudiantes',
    ],
    defaultTab: 'matriculas',
    roleBadgeLabel: 'Matrícula',
    roleDescription: 'Acceso exclusivo a Matrículas y Estudiantes.',
    canViewExecutiveDashboard: false,
    canManageTeachers: false,
    canManageWorkshops: false,
    canManageSystemConfig: false,
  },
};

export function isTabAllowedForRole(role: UserRole, tab: NavTab): boolean {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.PROFESOR;
  return config.allowedTabs.includes(tab);
}

export function getDefaultTabForRole(role: UserRole): NavTab {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.PROFESOR;
  return config.defaultTab;
}

import React from 'react';
import {
  LayoutDashboard,
  Calendar,
  Palette,
  Users,
  FileSpreadsheet,
  Settings,
  ChevronLeft,
  ChevronRight,
  Receipt,
  FileSignature,
} from 'lucide-react';
import { Perfil } from '../../types/attendance';
import { ROLE_CONFIGS } from '../../utils/rbac';
import { cicloActual } from '../../utils/institucion';

export type NavTab =
  | 'dashboard'
  | 'asistencia'
  | 'grupos'
  | 'matriculas'
  | 'caja'
  | 'estudiantes'
  | 'reportes'
  | 'config';

interface NavCategory {
  title: string;
  items: {
    id: NavTab;
    label: string;
    icon: React.ReactNode;
  }[];
}

interface SidebarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  currentProfile: Perfil;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  currentProfile,
}) => {
  const roleConfig = ROLE_CONFIGS[currentProfile.rol] || ROLE_CONFIGS.PROFESOR;
  const isAdmin = currentProfile.rol === 'ADMIN';

  const categories: NavCategory[] = isAdmin
    ? [
        {
          title: 'General',
          items: [
            {
              id: 'dashboard',
              label: 'Panel',
              icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
            },
          ],
        },
        {
          title: 'Operaciones',
          items: [
            {
              id: 'asistencia',
              label: 'Toma de Asistencia',
              icon: <Calendar className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'grupos',
              label: 'Talleres',
              icon: <Palette className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'matriculas',
              label: 'Matrículas',
              icon: <FileSignature className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'caja',
              label: 'Caja y Solvencias',
              icon: <Receipt className="w-4 h-4 shrink-0" />,
            },
          ],
        },
        {
          title: 'Personas',
          items: [
            {
              id: 'estudiantes',
              label: 'Estudiantes',
              icon: <Users className="w-4 h-4 shrink-0" />,
            },
          ],
        },
        {
          title: 'Sistema',
          items: [
            {
              id: 'reportes',
              label: 'Reportes y Matriz',
              icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'config',
              label: 'Configuración',
              icon: <Settings className="w-4 h-4 shrink-0" />,
            },
          ],
        },
      ]
    : currentProfile.rol === 'CAJERO'
    ? [
        {
          title: 'Módulo Principal',
          items: [
            {
              id: 'caja',
              label: 'Caja y Solvencia',
              icon: <Receipt className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'reportes',
              label: 'Historial de Recibos',
              icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
            },
          ],
        },
      ]
    : currentProfile.rol === 'MATRICULA'
    ? [
        {
          title: 'Registro Académico',
          items: [
            {
              id: 'matriculas',
              label: 'Matrículas',
              icon: <FileSignature className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'estudiantes',
              label: 'Estudiantes',
              icon: <Users className="w-4 h-4 shrink-0" />,
            },
          ],
        },
      ]
    : [
        {
          title: 'Docencia',
          items: [
            {
              id: 'asistencia',
              label: 'Toma de Asistencia',
              icon: <Calendar className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'grupos',
              label: 'Mis talleres',
              icon: <Palette className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'reportes',
              label: 'Reporte de Asistencia',
              icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
            },
          ],
        },
      ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-[#121722] text-slate-900 dark:text-slate-100 border-r border-slate-200/80 dark:border-slate-800/80 select-none transition-all duration-150">
      {/* Brand Header */}
      <div className={`p-4 border-b border-slate-100 dark:border-slate-800/60 flex flex-col ${isCollapsed ? 'items-center' : 'items-stretch'}`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed ? (
            <div
              onClick={() => onTabChange(roleConfig.defaultTab)}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <img
                src="/pwa-192x192.png"
                alt="Colegio Centro América"
                width={36}
                height={36}
                className="w-9 h-9 rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-700 object-contain shrink-0 transition-opacity group-hover:opacity-90"
              />
              <div className="leading-tight">
                <span className="font-semibold text-xs tracking-tight text-slate-900 dark:text-white">
                  Cultura CCA
                </span>
                <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                  {roleConfig.roleBadgeLabel}
                </span>
              </div>
            </div>
          ) : (
            <img
              src="/pwa-192x192.png"
              alt="Colegio Centro América"
              title="Cultura CCA"
              width={36}
              height={36}
              onClick={() => onTabChange(roleConfig.defaultTab)}
              className="w-9 h-9 rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-700 object-contain cursor-pointer hover:opacity-90"
            />
          )}

          {/* Collapse toggle (desktop only) */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
            title={isCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Nav Menu Categories */}
      <div className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
        {categories.map((cat, idx) => (
          <div key={idx} className="space-y-0.5">
            {!isCollapsed && (
              <div className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-slate-500">
                {cat.title}
              </div>
            )}
            {cat.items.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    onCloseMobile();
                  }}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center ${
                    isCollapsed ? 'justify-center px-0 py-2' : 'justify-start px-2.5 py-1.5 space-x-2.5'
                  } rounded-lg text-xs transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800/70 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <span className={isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}>
                    {item.icon}
                  </span>
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Minimal Footer */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800/60">
        {!isCollapsed ? (
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span className="truncate">{cicloActual()}</span>
            </span>
            <span className="font-mono text-[10px]">v2.4</span>
          </div>
        ) : (
          <div className="flex justify-center" title={`${cicloActual()} activo`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-150 ${
          isCollapsed ? 'w-[64px]' : 'w-[230px]'
        }`}
      >
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-64 max-w-[80vw] h-full shadow-xl z-10 animate-slideRight">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

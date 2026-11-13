import React, { useEffect, useRef } from 'react';
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
  X,
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

  // --- Panel móvil: Escape, bloqueo de scroll, foco y cierre al pasar a escritorio ---
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const toqueInicio = useRef<{ x: number; y: number } | null>(null);
  // App pasa una función nueva en cada render: se guarda en una ref para no reiniciar el efecto
  const cerrarMovilRef = useRef(onCloseMobile);
  cerrarMovilRef.current = onCloseMobile;

  useEffect(() => {
    if (!mobileOpen) return;
    const focoPrevio = document.activeElement as HTMLElement | null;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => cerrarRef.current?.focus(), 50);

    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarMovilRef.current();
    };
    const escritorio = window.matchMedia('(min-width: 1024px)');
    const alCambiarAncho = (e: MediaQueryListEvent) => {
      if (e.matches) cerrarMovilRef.current();
    };
    window.addEventListener('keydown', alPresionar);
    escritorio.addEventListener('change', alCambiarAncho);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = overflowPrevio;
      window.removeEventListener('keydown', alPresionar);
      escritorio.removeEventListener('change', alCambiarAncho);
      focoPrevio?.focus?.();
    };
  }, [mobileOpen]);

  // Deslizar a la izquierda sobre el panel lo cierra
  const alIniciarToque = (e: React.TouchEvent) => {
    const t = e.touches[0];
    toqueInicio.current = { x: t.clientX, y: t.clientY };
  };
  const alTerminarToque = (e: React.TouchEvent) => {
    const inicio = toqueInicio.current;
    toqueInicio.current = null;
    if (!inicio) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - inicio.x;
    const dy = t.clientY - inicio.y;
    if (dx < -60 && Math.abs(dx) > Math.abs(dy)) onCloseMobile();
  };

  const irAInicio = () => {
    onTabChange(roleConfig.defaultTab);
    onCloseMobile();
  };

  /** Contenido del menú. En móvil siempre va expandido y con objetivos táctiles de 44 px. */
  const renderContenido = (movil: boolean) => {
    const compacto = !movil && isCollapsed;
    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#121722] text-slate-900 dark:text-slate-100 border-r border-slate-200/80 dark:border-slate-800/80 select-none transition-all duration-150">
        {/* Brand Header */}
        <div className={`p-4 border-b border-slate-100 dark:border-slate-800/60 flex flex-col ${compacto ? 'items-center' : 'items-stretch'}`}>
          <div className={`flex items-center gap-2 ${compacto ? 'justify-center' : 'justify-between'}`}>
            {!compacto ? (
              <div onClick={irAInicio} className="flex items-center gap-2.5 cursor-pointer group min-w-0">
                <img
                  src="/logo-emblema-96.png"
                  alt="Colegio Centro América"
                  width={36}
                  height={36}
                  className={`${movil ? 'w-10 h-10' : 'w-9 h-9'} rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-700 object-contain shrink-0 transition-opacity group-hover:opacity-90`}
                />
                <div className="leading-tight min-w-0">
                  <span className={`font-semibold tracking-tight text-slate-900 dark:text-white ${movil ? 'text-sm' : 'text-xs'}`}>
                    Cultura CCA
                  </span>
                  <span className={`block text-slate-400 dark:text-slate-500 truncate ${movil ? 'text-xs' : 'text-[11px]'}`}>
                    {roleConfig.roleBadgeLabel}
                  </span>
                </div>
              </div>
            ) : (
              <img
                src="/logo-emblema-96.png"
                alt="Colegio Centro América"
                title="Cultura CCA"
                width={36}
                height={36}
                onClick={irAInicio}
                className="w-9 h-9 rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-700 object-contain cursor-pointer hover:opacity-90"
              />
            )}

            {movil ? (
              /* Cerrar (solo móvil) */
              <button
                ref={cerrarRef}
                type="button"
                onClick={onCloseMobile}
                className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer shrink-0"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            ) : (
              /* Contraer (solo escritorio) */
              <button
                onClick={onToggleCollapse}
                className="flex p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                title={isCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
              >
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Nav Menu Categories */}
        <nav className={`flex-1 py-3 px-2 overflow-y-auto overscroll-contain ${movil ? 'space-y-5' : 'space-y-4'}`} aria-label="Navegación principal">
          {categories.map((cat, idx) => (
            <div key={idx} className={movil ? 'space-y-1' : 'space-y-0.5'}>
              {!compacto && (
                <div
                  className={`px-2.5 pb-1 font-semibold tracking-wider uppercase text-slate-400 dark:text-slate-500 ${
                    movil ? 'text-[11px]' : 'text-[10px]'
                  }`}
                >
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
                    title={compacto ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center rounded-lg transition-colors cursor-pointer ${
                      compacto
                        ? 'justify-center px-0 py-2 text-xs'
                        : movil
                        ? 'justify-start min-h-11 px-3 gap-3 text-sm'
                        : 'justify-start px-2.5 py-1.5 gap-2.5 text-xs'
                    } ${
                      isActive
                        ? 'bg-slate-100 dark:bg-slate-800/70 text-indigo-600 dark:text-indigo-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/30 active:bg-slate-100 dark:active:bg-slate-800/60'
                    }`}
                  >
                    <span
                      className={`shrink-0 ${movil ? '[&>svg]:w-5 [&>svg]:h-5' : ''} ${
                        isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {item.icon}
                    </span>
                    {!compacto && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Minimal Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800/60">
          {!compacto ? (
            <div className={`flex items-center justify-between text-slate-400 dark:text-slate-500 px-1 ${movil ? 'text-xs' : 'text-[11px]'}`}>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
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
  };

  return (
    <>
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-150 ${
          isCollapsed ? 'w-[64px]' : 'w-[230px]'
        }`}
      >
        {renderContenido(false)}
      </aside>

      {/* Panel móvil: siempre montado para animar la entrada y la salida */}
      <div className="lg:hidden" aria-hidden={!mobileOpen} inert={!mobileOpen}>
        <div
          className={`fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200 ${
            mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onCloseMobile}
        />
        <div
          id="menu-movil"
          role="dialog"
          aria-modal="true"
          aria-label="Menú principal"
          onTouchStart={alIniciarToque}
          onTouchEnd={alTerminarToque}
          className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-dvh shadow-2xl bg-white dark:bg-[#121722] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-out will-change-transform ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          }`}
        >
          {renderContenido(true)}
        </div>
      </div>
    </>
  );
};

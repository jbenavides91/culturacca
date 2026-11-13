import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Sun,
  Moon,
  Menu,
  ChevronDown,
  Shield,
  GraduationCap,
  X,
  LogOut,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { Perfil } from '../../types/attendance';
import { storageService } from '../../services/storage.service';
import { PWAInstallButton } from '../../components/PWAInstallButton';
import { isTabAllowedForRole, getDefaultTabForRole } from '../../utils/rbac';
import { esCorreoInterno } from '../../utils/correoInterno';

interface TopbarProps {
  currentTab: string;
  currentProfile: Perfil;
  onToggleMobileMenu: () => void;
  onNavigateTab: (tab: any) => void;
  onLogout?: () => void;
  onOpenNewWorkshop?: () => void;
  onOpenNewStudent?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentTab,
  currentProfile,
  onToggleMobileMenu,
  onNavigateTab,
  onLogout,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const profileRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard':
        return 'Panel';
      case 'asistencia':
        return 'Toma de Asistencia';
      case 'grupos':
        return currentProfile.rol === 'PROFESOR' ? 'Mis talleres' : 'Talleres';
      case 'matriculas':
        return 'Matrículas';
      case 'caja':
        return 'Caja y Solvencia';
      case 'estudiantes':
        return 'Estudiantes';
      case 'reportes':
        return currentProfile.rol === 'PROFESOR'
          ? 'Reporte de Asistencia'
          : currentProfile.rol === 'CAJERO'
          ? 'Historial de Recibos'
          : 'Reportes y Matriz';
      case 'config':
        return 'Configuración';
      default:
        return 'Asistencia';
    }
  };

  const searchResults = React.useMemo(() => {
    if (!searchQuery.trim()) return { estudiantes: [], grupos: [], maestros: [] };
    const q = searchQuery.toLowerCase();
    const allEstudiantes = storageService.getEstudiantes().filter(
      (e) => e.nombre.toLowerCase().includes(q) || e.apellido.toLowerCase().includes(q) || e.matricula.toLowerCase().includes(q)
    );
    const allGrupos = storageService.getGrupos().filter(
      (g) => g.nombre.toLowerCase().includes(q) || (g.aula && g.aula.toLowerCase().includes(q))
    );
    const allMaestros = storageService.getPerfiles().filter(
      (p) => p.rol === 'PROFESOR' && (p.nombre.toLowerCase().includes(q) || p.apellido.toLowerCase().includes(q))
    );
    return { estudiantes: allEstudiantes, grupos: allGrupos, maestros: allMaestros };
  }, [searchQuery]);

  return (
    <header className="h-14 bg-white dark:bg-[#121722] border-b border-slate-200/80 dark:border-slate-800/80 px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30 transition-colors">
      {/* Left: Mobile hamburger & Clean Breadcrumbs */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
          aria-label="Abrir menú"
        >
          <Menu className="w-4 h-4" />
        </button>

        <nav className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 dark:text-slate-500">CCA</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {getTabTitle(currentTab)}
          </span>
        </nav>
      </div>

      {/* Right controls */}
      <div className="flex items-center space-x-2">
        {/* Sleek Search Trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs transition-colors w-32 sm:w-48 cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate text-[11px]">Buscar...</span>
          <span className="hidden sm:inline-block font-mono text-[10px] ml-auto text-slate-400">
            ⌘K
          </span>
        </button>

        <PWAInstallButton />

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* User Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-semibold text-xs">
              {currentProfile.nombre.charAt(0)}{currentProfile.apellido.charAt(0)}
            </div>
            <div className="hidden md:block text-left leading-tight">
              <span className="block text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[120px]">
                {currentProfile.nombre} {currentProfile.apellido.split(' ')[0]}
              </span>
              <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                {currentProfile.rol === 'ADMIN'
                  ? 'Dirección'
                  : currentProfile.rol === 'CAJERO'
                  ? 'Caja y Solvencia'
                  : currentProfile.rol === 'MATRICULA'
                  ? 'Matrícula'
                  : 'Docente'}
              </span>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {profileDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-56 bg-white dark:bg-[#141A23] rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-800 py-1.5 z-40 text-xs animate-fadeIn">
              <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800/60">
                <p className="font-semibold text-slate-900 dark:text-white truncate">
                  {currentProfile.nombre} {currentProfile.apellido}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  {esCorreoInterno(currentProfile.email)
                    ? `@${currentProfile.username ?? ''}`
                    : currentProfile.email}
                </p>
                <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {currentProfile.rol === 'ADMIN'
                    ? 'Dirección & Admin'
                    : currentProfile.rol === 'CAJERO'
                    ? 'Caja y Solvencia'
                    : currentProfile.rol === 'MATRICULA'
                    ? 'Matrícula'
                    : 'Docente / Tallerista'}
                </div>
              </div>

              {onLogout && (
                <div className="p-1">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Global Search Dialog */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-lg w-full border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-2.5">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar alumno, taller o docente..."
                className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none"
                autoFocus
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-3 space-y-3 text-xs">
              {!searchQuery.trim() ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Escribe para buscar en tiempo real...
                </div>
              ) : (
                <>
                  {searchResults.estudiantes.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                        Estudiantes
                      </div>
                      {searchResults.estudiantes.map((est) => (
                        <div
                          key={est.id}
                          onClick={() => {
                            setSearchOpen(false);
                            if (isTabAllowedForRole(currentProfile.rol, 'estudiantes')) {
                              onNavigateTab('estudiantes');
                            } else if (isTabAllowedForRole(currentProfile.rol, 'caja')) {
                              onNavigateTab('caja');
                            } else if (isTabAllowedForRole(currentProfile.rol, 'asistencia')) {
                              onNavigateTab('asistencia');
                            }
                          }}
                          className="px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer flex items-center justify-between"
                        >
                          <span className="font-medium text-slate-900 dark:text-white">
                            {est.nombre} {est.apellido}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {est.matricula}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {searchResults.grupos.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                        Talleres
                      </div>
                      {searchResults.grupos.map((g) => (
                        <div
                          key={g.id}
                          onClick={() => {
                            setSearchOpen(false);
                            if (isTabAllowedForRole(currentProfile.rol, 'grupos')) {
                              onNavigateTab('grupos');
                            } else if (isTabAllowedForRole(currentProfile.rol, 'asistencia')) {
                              onNavigateTab('asistencia');
                            }
                          }}
                          className="px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer flex items-center justify-between"
                        >
                          <span className="font-medium text-slate-900 dark:text-white">
                            {g.nombre}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {g.aula}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {searchResults.estudiantes.length === 0 && searchResults.grupos.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      No se encontraron resultados para &quot;{searchQuery}&quot;.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './modules/navigation/Sidebar';
import { Topbar } from './modules/navigation/Topbar';
import { ExecutiveDashboardView } from './modules/dashboard/ExecutiveDashboardView';
import { RollCallView } from './modules/attendance/RollCallView';
import { WorkshopsView } from './modules/workshops/WorkshopsView';
import { StudentsView } from './modules/students/StudentsView';
import { ReportsView } from './modules/reports/ReportsView';
import { SettingsView } from './modules/settings/SettingsView';
import { MatriculasView } from './modules/enrollment/MatriculasView';
import { CashierView } from './modules/cashier/CashierView';
import { AuthState, getActiveProfile, subscribeToAuth, logout, retrySession } from './services/auth.service';
import { Perfil } from './types/attendance';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SyncStatus, FullScreenMessage } from './components/SyncStatus';
import { isTabAllowedForRole, getDefaultTabForRole } from './utils/rbac';
import { Shield } from 'lucide-react';
import { LoginView } from './modules/auth/LoginView';
import { isSupabaseConfigured } from './services/supabase.client';

export default function App() {
  const initialProfile = getActiveProfile();
  const [activeProfile, setActiveProfile] = useState<Perfil | null>(initialProfile);
  const [currentTab, setCurrentTab] = useState<NavTab>(
    initialProfile ? getDefaultTabForRole(initialProfile.rol) : 'dashboard'
  );
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const prevProfileIdRef = React.useRef<string | null>(initialProfile?.id ?? null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [selectedWorkshopForRollCall, setSelectedWorkshopForRollCall] = useState<string>('');
  const [selectedSesionForRollCall, setSelectedSesionForRollCall] = useState<string>('');

  // Quick Action modal helpers
  const [openNewWorkshopModal, setOpenNewWorkshopModal] = useState(false);
  const [openNewStudentModal, setOpenNewStudentModal] = useState(false);

  useEffect(() => {
    const unsub = subscribeToAuth((state) => {
      setAuthState(state);
      const profile = state.status === 'ready' ? state.profile : null;
      setActiveProfile(profile);
      // Al iniciar sesión con otro usuario, ir a su módulo por defecto
      if (profile && profile.id !== prevProfileIdRef.current) {
        setCurrentTab(getDefaultTabForRole(profile.rol));
      } else if (profile && !isTabAllowedForRole(profile.rol, currentTab)) {
        setCurrentTab(getDefaultTabForRole(profile.rol));
      }
      prevProfileIdRef.current = profile?.id ?? null;
    });
    return () => unsub();
  }, [currentTab]);

  const handleSelectWorkshop = (grupoId: string, sesionId?: string) => {
    setSelectedWorkshopForRollCall(grupoId);
    setSelectedSesionForRollCall(sesionId ?? '');
    setCurrentTab('asistencia');
  };

  const handleLogout = () => {
    void logout();
    setActiveProfile(null);
  };

  if (!isSupabaseConfigured) {
    return (
      <FullScreenMessage
        variant="error"
        title="Falta configurar Supabase"
        message="Crea el archivo .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY y reinicia el servidor de desarrollo."
      />
    );
  }

  const status = authState?.status ?? 'loading';

  if (status === 'loading' || status === 'hydrating') {
    return (
      <FullScreenMessage
        variant="loading"
        title={status === 'loading' ? 'Verificando sesión…' : 'Cargando datos…'}
        message={status === 'hydrating' ? 'Sincronizando con la base de datos institucional.' : undefined}
      />
    );
  }

  if (status === 'error') {
    return (
      <FullScreenMessage
        variant="error"
        title="No se pudieron cargar los datos"
        message={authState?.error || 'Verifica tu conexión a internet e inténtalo de nuevo.'}
        primaryAction={{ label: 'Reintentar', onClick: () => void retrySession() }}
        secondaryAction={{ label: 'Cerrar sesión', onClick: handleLogout }}
      />
    );
  }

  // If no user is logged in, show the Login screen as index
  if (!activeProfile) {
    return <LoginView initialError={authState?.error ?? null} />;
  }

  const canAccessCaja = isTabAllowedForRole(activeProfile.rol, 'caja');

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 overflow-hidden antialiased transition-colors">
      {/* Sidebar (Desktop and Mobile drawer) */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={(tab) => {
          setCurrentTab(tab);
          setMobileDrawerOpen(false);
        }}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileDrawerOpen}
        onCloseMobile={() => setMobileDrawerOpen(false)}
        currentProfile={activeProfile}
      />

      {/* Main App Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Topbar (64px, Breadcrumbs, Search, Theme toggle, Profile) */}
        <Topbar
          currentTab={currentTab}
          currentProfile={activeProfile}
          onToggleMobileMenu={() => setMobileDrawerOpen(true)}
          onNavigateTab={(tab) => setCurrentTab(tab)}
          onLogout={handleLogout}
          onOpenNewWorkshop={() => setOpenNewWorkshopModal(true)}
          onOpenNewStudent={() => setOpenNewStudentModal(true)}
        />

        {/* Scrollable View Area */}
        <main className="flex-1 overflow-y-auto">
          {!isTabAllowedForRole(activeProfile.rol, currentTab) ? (
            <div className="p-8 max-w-lg mx-auto my-16 text-center bg-white dark:bg-[#1B222D] rounded-2xl border border-[#E7EAF0] dark:border-[#2B3442] shadow-xs space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-[#172033] dark:text-[#F1F5F9]">
                Acceso Restringido por Rol
              </h2>
              <p className="text-xs text-[#667085] dark:text-[#94A3B8] leading-relaxed">
                {activeProfile.rol === 'CAJERO'
                  ? 'El rol de Caja solo tiene acceso a Caja y Solvencia y al Historial de Recibos en Reportes.'
                  : activeProfile.rol === 'PROFESOR'
                  ? 'El rol de Docente tiene acceso exclusivo a Toma de Asistencia, Mis talleres y Reporte de Asistencia.'
                  : activeProfile.rol === 'MATRICULA'
                  ? 'El rol de Matrícula tiene acceso exclusivo a los módulos de Matrículas y Estudiantes.'
                  : 'No tienes permisos para visualizar esta sección.'}
              </p>
              <button
                onClick={() => setCurrentTab(getDefaultTabForRole(activeProfile.rol))}
                className="px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {activeProfile.rol === 'CAJERO'
                  ? 'Ir a Caja y Solvencia'
                  : 'Ir a mi módulo principal'}
              </button>
            </div>
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <ExecutiveDashboardView
                  currentProfile={activeProfile}
                  onNavigateTab={(tab) => setCurrentTab(tab)}
                  onSelectWorkshop={handleSelectWorkshop}
                />
              )}

              {currentTab === 'asistencia' && (
                <RollCallView
                  key={`${selectedWorkshopForRollCall || 'default-rollcall'}-${selectedSesionForRollCall}`}
                  currentProfile={activeProfile}
                  initialGrupoId={selectedWorkshopForRollCall}
                  initialSesionId={selectedSesionForRollCall || undefined}
                />
              )}

              {currentTab === 'grupos' && (
                <WorkshopsView
                  currentProfile={activeProfile}
                  onSelectWorkshopForRollCall={handleSelectWorkshop}
                  openNewModalInitially={openNewWorkshopModal}
                />
              )}

              {currentTab === 'matriculas' && (
                <MatriculasView
                  currentProfile={activeProfile}
                  onNavigateToCashier={canAccessCaja ? () => setCurrentTab('caja') : undefined}
                  onNavigateToWorkshop={
                    isTabAllowedForRole(activeProfile.rol, 'asistencia') ? handleSelectWorkshop : undefined
                  }
                />
              )}

              {currentTab === 'caja' && (
                <CashierView
                  currentProfile={activeProfile}
                  onNavigateToWorkshop={handleSelectWorkshop}
                />
              )}

              {currentTab === 'estudiantes' && (
                <StudentsView
                  currentProfile={activeProfile}
                  openNewModalInitially={openNewStudentModal}
                  onNavigateToCashier={canAccessCaja ? () => setCurrentTab('caja') : undefined}
                />
              )}

              {currentTab === 'reportes' && (
                <ReportsView currentProfile={activeProfile} />
              )}

              {currentTab === 'config' && (
                <SettingsView />
              )}
            </>
          )}
        </main>
      </div>

      {/* Offline connectivity status banner */}
      <OfflineIndicator />

      {/* Database sync status (pending writes / errors) */}
      <SyncStatus />
    </div>
  );
}

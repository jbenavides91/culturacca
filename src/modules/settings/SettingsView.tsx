import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings,
  ShieldAlert,
  CheckCircle2,
  Building,
  Calendar,
  Save,
  Users,
  UserPlus,
  Shield,
  Receipt,
  GraduationCap,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Search,
  X,
  Sliders,
  AlertCircle,
  KeyRound,
  FileSignature,
  DoorOpen,
  Banknote,
} from 'lucide-react';
import { ConfiguracionSistema, PeriodoArancel, Perfil, UserRole } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import {
  correoInterno,
  esCorreoInterno,
  MENSAJE_USERNAME_INVALIDO,
  USERNAME_REGEX,
} from '../../utils/correoInterno';
import { ContractTemplateTab } from './ContractTemplateTab';
import { SalonesTab } from './SalonesTab';
import { GradosTab } from './GradosTab';

type SettingsTab = 'usuarios' | 'reglas' | 'salones' | 'grados' | 'contrato';

interface SettingsViewProps {
  /** Abre directamente el formulario de nuevo usuario con este rol (p. ej. desde Docentes) */
  crearUsuarioConRol?: UserRole;
  onCrearUsuarioAtendido?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ crearUsuarioConRol, onCrearUsuarioAtendido }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('usuarios');
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [config, setConfig] = useState<ConfiguracionSistema>(storageService.getConfiguracion());
  const [limiteAusencias, setLimiteAusencias] = useState(config.limite_ausencias_alerta);
  const [pctInasistencia, setPctInasistencia] = useState(config.porcentaje_inasistencia_alerta);
  const [nombreInstitucion, setNombreInstitucion] = useState(config.nombre_institucion);
  const [ciclo, setCiclo] = useState(config.ciclo_academico_actual);
  const [arancel, setArancel] = useState<string>(String(config.arancel_taller ?? 1200));
  const [periodoArancel, setPeriodoArancel] = useState<PeriodoArancel>(config.arancel_periodo || 'MENSUAL');
  const [configError, setConfigError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // User management states
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'TODOS' | UserRole>('TODOS');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Perfil | null>(null);

  // New user form states
  const [newNombre, setNewNombre] = useState('');
  const [newApellido, setNewApellido] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRol, setNewRol] = useState<UserRole>('PROFESOR');
  const [newCargo, setNewCargo] = useState('');
  const [newTelefono, setNewTelefono] = useState('');
  const [newEspecialidad, setNewEspecialidad] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit user form states
  const [editNombre, setEditNombre] = useState('');
  const [editApellido, setEditApellido] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRol, setEditRol] = useState<UserRole>('PROFESOR');
  const [editCargo, setEditCargo] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editEspecialidad, setEditEspecialidad] = useState('');
  const [editActivo, setEditActivo] = useState(true);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);

  const loadData = () => {
    const c = storageService.getConfiguracion();
    setConfig(c);
    setLimiteAusencias(c.limite_ausencias_alerta);
    setPctInasistencia(c.porcentaje_inasistencia_alerta);
    setNombreInstitucion(c.nombre_institucion);
    setCiclo(c.ciclo_academico_actual);
    setArancel(String(c.arancel_taller ?? 1200));
    setPeriodoArancel(c.arancel_periodo || 'MENSUAL');
    setPerfiles(storageService.getPerfiles());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToData(() => loadData());
    return () => unsub();
  }, []);

  // Apertura directa del formulario (p. ej. "Nuevo docente" desde el módulo Docentes)
  useEffect(() => {
    if (!crearUsuarioConRol) return;
    setActiveTab('usuarios');
    setNewRol(crearUsuarioConRol);
    setCreateError(null);
    setIsCreateModalOpen(true);
    onCrearUsuarioAtendido?.();
  }, [crearUsuarioConRol]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError(null);
    const montoArancel = Number(arancel);
    if (!Number.isFinite(montoArancel) || montoArancel <= 0) {
      setConfigError('El costo general del taller debe ser un número mayor que 0.');
      return;
    }
    storageService.updateConfiguracion({
      limite_ausencias_alerta: Number(limiteAusencias),
      porcentaje_inasistencia_alerta: Number(pctInasistencia),
      nombre_institucion: nombreInstitucion.trim(),
      ciclo_academico_actual: ciclo.trim(),
      arancel_taller: montoArancel,
      arancel_periodo: periodoArancel,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingUser) return;
    setCreateError(null);

    const cleanUsername = newUsername.trim().toLowerCase();

    if (!newNombre.trim() || !newApellido.trim() || !cleanUsername || !newPassword.trim()) {
      setCreateError('Por favor completa todos los campos requeridos.');
      return;
    }
    if (!USERNAME_REGEX.test(cleanUsername)) {
      setCreateError(MENSAJE_USERNAME_INVALIDO);
      return;
    }

    // Correo opcional: si no se indica, se genera uno interno para Supabase Auth
    const cleanEmail = newEmail.trim().toLowerCase() || correoInterno(cleanUsername);

    // Check username or email uniqueness
    const exists = perfiles.some(
      (p) =>
        (p.username && p.username.toLowerCase() === cleanUsername) ||
        p.email.toLowerCase() === cleanEmail
    );
    if (exists) {
      setCreateError('Ya existe un usuario con este nombre de usuario o correo electrónico.');
      return;
    }

    if (newPassword.trim().length < 6) {
      setCreateError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsSavingUser(true);
    try {
      const defaultCargo =
        newRol === 'ADMIN'
          ? 'Dirección y Coordinación'
          : newRol === 'CAJERO'
          ? 'Encargada de Caja y Ventanilla'
          : newRol === 'MATRICULA'
          ? 'Encargada de Registro y Matrículas'
          : 'Docente Tallerista Titular';

      const created = await storageService.crearUsuario(
        {
          nombre: newNombre.trim(),
          apellido: newApellido.trim(),
          username: cleanUsername,
          email: cleanEmail,
          rol: newRol,
          cargo: newCargo.trim() || defaultCargo,
          telefono: newTelefono.trim() || undefined,
          especialidad: newRol === 'PROFESOR' ? newEspecialidad.trim() || undefined : undefined,
          activo: true,
        },
        newPassword.trim()
      );

      setIsCreateModalOpen(false);
      setNewNombre('');
      setNewApellido('');
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewCargo('');
      setNewTelefono('');
      setNewEspecialidad('');
      setToastMessage(`Usuario "${created.username}" (${created.nombre} ${created.apellido}) creado exitosamente.`);
      loadData();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error al registrar el usuario.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleOpenEditUser = (p: Perfil) => {
    setEditingUser(p);
    setEditNombre(p.nombre);
    setEditApellido(p.apellido);
    setEditUsername(p.username || '');
    setEditEmail(esCorreoInterno(p.email) ? '' : p.email);
    setEditPassword('');
    setEditRol(p.rol);
    setEditCargo(p.cargo || '');
    setEditTelefono(p.telefono || '');
    setEditEspecialidad(p.especialidad || '');
    setEditActivo(p.activo !== false);
    setEditError(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || isSavingUser) return;
    setEditError(null);

    const cleanUsername = editUsername.trim().toLowerCase();

    if (!editNombre.trim() || !editApellido.trim() || !cleanUsername) {
      setEditError('Por favor completa todos los campos requeridos.');
      return;
    }
    if (!USERNAME_REGEX.test(cleanUsername)) {
      setEditError(MENSAJE_USERNAME_INVALIDO);
      return;
    }

    // Sin correo: usar (o regenerar con el nuevo usuario) el correo interno
    const cleanEmail = editEmail.trim().toLowerCase() || correoInterno(cleanUsername);

    // Check unique username / email against other users
    const exists = perfiles.some(
      (p) =>
        p.id !== editingUser.id &&
        ((p.username && p.username.toLowerCase() === cleanUsername) ||
          p.email.toLowerCase() === cleanEmail)
    );
    if (exists) {
      setEditError('Ya existe otro usuario con este nombre de usuario o correo electrónico.');
      return;
    }

    if (editPassword.trim() && editPassword.trim().length < 6) {
      setEditError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsSavingUser(true);
    try {
      const updatePayload: Partial<Perfil> = {
        nombre: editNombre.trim(),
        apellido: editApellido.trim(),
        username: cleanUsername,
        email: cleanEmail,
        rol: editRol,
        cargo: editCargo.trim() || undefined,
        telefono: editTelefono.trim() || undefined,
        ...(editRol === 'PROFESOR' ? { especialidad: editEspecialidad.trim() || undefined } : {}),
        activo: editActivo,
      };

      await storageService.actualizarPerfil(editingUser.id, updatePayload, editPassword.trim() || undefined);
      setToastMessage(`Usuario "${cleanUsername}" actualizado exitosamente.`);
      setEditingUser(null);
      loadData();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error al actualizar usuario.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (p: Perfil) => {
    if (p.rol === 'ADMIN') {
      const admins = perfiles.filter((x) => x.rol === 'ADMIN');
      if (admins.length <= 1) {
        alert('No es posible eliminar el único Administrador del sistema.');
        return;
      }
    }

    if (window.confirm(`¿Estás seguro de que deseas eliminar al usuario "${p.nombre} ${p.apellido}" (${p.username || p.email})?`)) {
      try {
        await storageService.eliminarPerfil(p.id);
        setToastMessage(`Usuario "${p.nombre} ${p.apellido}" eliminado.`);
        loadData();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Error al eliminar usuario.');
      }
    }
  };

  const filteredUsers = useMemo(() => {
    return perfiles.filter((p) => {
      if (roleFilter !== 'TODOS' && p.rol !== roleFilter) return false;
      if (!searchUserQuery.trim()) return true;
      const q = searchUserQuery.toLowerCase();
      const fullName = `${p.nombre} ${p.apellido}`.toLowerCase();
      const username = (p.username || '').toLowerCase();
      const email = p.email.toLowerCase();
      const cargo = (p.cargo || '').toLowerCase();
      return fullName.includes(q) || username.includes(q) || email.includes(q) || cargo.includes(q);
    });
  }, [perfiles, roleFilter, searchUserQuery]);

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 animate-fadeIn">
      {/* Toast Notice */}
      {toastMessage && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3.5 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between animate-fadeIn font-semibold">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 sm:pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Configuración del Sistema
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Administración de cuentas de usuario, roles, reglas institucionales, salones, grados y contrato de matrícula.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex flex-wrap gap-0.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('usuarios')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'usuarios'
                ? 'bg-white dark:bg-[#141A23] text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Usuarios y Roles</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reglas')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'reglas'
                ? 'bg-white dark:bg-[#141A23] text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Reglas y Parámetros</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('salones')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'salones'
                ? 'bg-white dark:bg-[#141A23] text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            <span>Salones</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('grados')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'grados'
                ? 'bg-white dark:bg-[#141A23] text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Grados</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contrato')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'contrato'
                ? 'bg-white dark:bg-[#141A23] text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileSignature className="w-3.5 h-3.5" />
            <span>Contrato</span>
          </button>
        </div>
      </div>

      {/* TAB 1: USUARIOS Y ROLES */}
      {activeTab === 'usuarios' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Action Bar & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#141A23] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchUserQuery}
                  onChange={(e) => setSearchUserQuery(e.target.value)}
                  placeholder="Buscar por nombre, usuario o correo..."
                  className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-[#1A222D] border border-slate-200 dark:border-slate-700/80 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Role filter buttons */}
              <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setRoleFilter('TODOS')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer shrink-0 ${
                    roleFilter === 'TODOS'
                      ? 'bg-white dark:bg-[#141A23] text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Todos ({perfiles.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('ADMIN')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer shrink-0 ${
                    roleFilter === 'ADMIN'
                      ? 'bg-white dark:bg-[#141A23] text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Dirección & Admin
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('CAJERO')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer shrink-0 ${
                    roleFilter === 'CAJERO'
                      ? 'bg-white dark:bg-[#141A23] text-amber-600 dark:text-amber-400 shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Caja y Solvencia
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('MATRICULA')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer shrink-0 ${
                    roleFilter === 'MATRICULA'
                      ? 'bg-white dark:bg-[#141A23] text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Matrícula
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('PROFESOR')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer shrink-0 ${
                    roleFilter === 'PROFESOR'
                      ? 'bg-white dark:bg-[#141A23] text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Docentes
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setCreateError(null);
                setNewRol('PROFESOR');
                setIsCreateModalOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center space-x-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Crear Nuevo Usuario</span>
            </button>
          </div>

          {/* Users Table */}
          <div className="bg-white dark:bg-[#141A23] rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/30">
                    <th className="py-3 px-5">Usuario / Personal</th>
                    <th className="py-3 px-4">Login (Usuario)</th>
                    <th className="py-3 px-4">Correo</th>
                    <th className="py-3 px-4">Rol Asignado & Acceso</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                        No se encontraron usuarios registrados con el criterio de búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const isAdmin = user.rol === 'ADMIN';
                      const isCaja = user.rol === 'CAJERO';
                      const isDocente = user.rol === 'PROFESOR';
                      const isMatricula = user.rol === 'MATRICULA';

                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isAdmin
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900'
                                    : isCaja
                                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
                                    : isMatricula
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900'
                                    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900'
                                }`}
                              >
                                {user.nombre.charAt(0)}{user.apellido.charAt(0)}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white">
                                  {user.nombre} {user.apellido}
                                </div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {user.cargo || (isAdmin ? 'Dirección General' : isCaja ? 'Caja' : isMatricula ? 'Matrícula' : 'Docente')}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300 font-medium">
                            <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                              {user.username || user.email.split('@')[0]}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                            {esCorreoInterno(user.email) ? (
                              <span className="italic text-slate-400 dark:text-slate-500">Sin correo</span>
                            ) : (
                              user.email
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {isAdmin && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900">
                                  <Shield className="w-3 h-3" />
                                  <span>Dirección & Admin</span>
                                </span>
                                <span className="block text-[10px] text-slate-400 mt-0.5">Acceso total institucional</span>
                              </div>
                            )}
                            {isCaja && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                                  <Receipt className="w-3 h-3" />
                                  <span>Caja y Solvencia</span>
                                </span>
                                <span className="block text-[10px] text-slate-400 mt-0.5">Exclusivo: Caja y Solvencia</span>
                              </div>
                            )}
                            {isMatricula && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                                  <FileSignature className="w-3 h-3" />
                                  <span>Matrícula</span>
                                </span>
                                <span className="block text-[10px] text-slate-400 mt-0.5">Exclusivo: Matrículas y Estudiantes</span>
                              </div>
                            )}
                            {isDocente && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                                  <GraduationCap className="w-3 h-3" />
                                  <span>Docente / Tallerista</span>
                                </span>
                                <span className="block text-[10px] text-slate-400 mt-0.5">Asistencia, Mis talleres y Reporte</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>Activo</span>
                            </span>
                          </td>

                          <td className="py-3.5 px-5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEditUser(user)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Editar usuario y rol"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                                title="Eliminar usuario"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REGLAS Y PARÁMETROS */}
      {activeTab === 'reglas' && (
        <div className="space-y-4 sm:space-y-6 animate-fadeIn">
          {savedSuccess && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3.5 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs flex items-center space-x-2 animate-fadeIn font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Configuración institucional actualizada y guardada correctamente.</span>
            </div>
          )}

          {/* Rules and Thresholds Form */}
          <div className="bg-white dark:bg-[#141A23] rounded-xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <div className="bg-[#172033] dark:bg-[#151A22] px-4 sm:px-6 py-3 sm:py-4 text-white flex items-center space-x-2.5 border-b border-slate-800">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold">
                  Reglas y Umbrales de Inasistencia (configuracion_sistema)
                </h3>
                <p className="text-[11px] text-slate-300">
                  Define los límites matemáticos para activar las alertas de riesgo y bloqueo de acreditación.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="p-4 sm:p-6 space-y-4 sm:space-y-6 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-slate-50 dark:bg-[#1A222D] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <label className="block font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                    Límite de Faltas para Alerta Crítica
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={limiteAusencias}
                      onChange={(e) => setLimiteAusencias(Number(e.target.value))}
                      className="w-24 text-base font-bold text-center rounded-lg border border-slate-200 dark:border-slate-700/80 p-2 bg-white dark:bg-[#141A23] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-slate-500 dark:text-slate-400 font-medium">
                      faltas acumuladas en el ciclo (por defecto: 3)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Al alcanzar esta cantidad, el expediente del alumno se resalta en alerta crítica y se notifica al tutor.
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-[#1A222D] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <label className="block font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                    Porcentaje Máximo de Inasistencia Permitido
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      step="0.5"
                      min={5}
                      max={50}
                      value={pctInasistencia}
                      onChange={(e) => setPctInasistencia(Number(e.target.value))}
                      className="w-24 text-base font-bold text-center rounded-lg border border-slate-200 dark:border-slate-700/80 p-2 bg-white dark:bg-[#141A23] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-slate-500 dark:text-slate-400 font-medium">% sobre clases concluidas (por defecto: 20%)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Calculado automáticamente por el motor de ausencias y la matriz de seguimiento.
                  </p>
                </div>
              </div>

              {/* Arancel de los talleres */}
              <div className="bg-slate-50 dark:bg-[#1A222D] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                <label className="block font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                  Arancel de los Talleres
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Costo general (C$)</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">C$</span>
                      <input
                        type="number"
                        min={1}
                        step="0.01"
                        required
                        value={arancel}
                        onChange={(e) => setArancel(e.target.value)}
                        aria-label="Costo general del taller"
                        className="w-full pl-9 text-base font-bold rounded-lg border border-slate-200 dark:border-slate-700/80 p-2 bg-white dark:bg-[#141A23] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Periodo del cobro</span>
                    <select
                      value={periodoArancel}
                      onChange={(e) => setPeriodoArancel(e.target.value as PeriodoArancel)}
                      aria-label="Periodo del cobro"
                      className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 p-2.5 bg-white dark:bg-[#141A23] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="MENSUAL">Mensual (C$ X / mes)</option>
                      <option value="CICLO">Por ciclo completo (C$ X por ciclo)</option>
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Se aplica a nuevas matrículas y renovaciones. Cada taller puede tener un costo propio en el módulo
                  Talleres. Las matrículas ya registradas conservan su monto.
                </p>
                {configError && (
                  <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {configError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                    <Building className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Nombre de la Institución</span>
                  </label>
                  <input
                    type="text"
                    value={nombreInstitucion}
                    onChange={(e) => setNombreInstitucion(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] text-slate-900 dark:text-white p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Ciclo Académico Actual</span>
                  </label>
                  <input
                    type="text"
                    value={ciclo}
                    onChange={(e) => setCiclo(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] text-slate-900 dark:text-white p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar Parámetros</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB: CATÁLOGO DE SALONES */}
      {activeTab === 'salones' && <SalonesTab />}

      {/* TAB: GRADOS ESCOLARES */}
      {activeTab === 'grados' && <GradosTab />}

      {/* TAB 3: PLANTILLA DE CONTRATO */}
      {activeTab === 'contrato' && <ContractTemplateTab />}

      {/* MODAL: CREAR NUEVO USUARIO */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Crear Nuevo Usuario Institucional
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-4 sm:p-6 space-y-4 text-xs">
              {createError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* Nombre y Apellido */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombres *
                  </label>
                  <input
                    type="text"
                    required
                    value={newNombre}
                    onChange={(e) => {
                      setNewNombre(e.target.value);
                      if (!newUsername && e.target.value) {
                        setNewUsername(e.target.value.toLowerCase().slice(0, 1) + newApellido.toLowerCase());
                      }
                    }}
                    placeholder="Ej. Roberto"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    required
                    value={newApellido}
                    onChange={(e) => {
                      setNewApellido(e.target.value);
                      if (!newUsername && newNombre) {
                        setNewUsername(newNombre.toLowerCase().slice(0, 1) + e.target.value.toLowerCase().replace(/\s+/g, ''));
                      }
                    }}
                    placeholder="Ej. Silva Montiel"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Username y Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Usuario / Login *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Ej. rsilva"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Contraseña Inicial *
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pr-8 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Correo */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Correo Electrónico <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Opcional, solo si tiene correo institucional"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Rol y Permisos de Acceso *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setNewRol('ADMIN')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      newRol === 'ADMIN'
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-500 text-indigo-900 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Dirección</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                      Acceso total a paneles, finanzas y reglas
                    </p>
                  </div>

                  <div
                    onClick={() => setNewRol('CAJERO')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      newRol === 'CAJERO'
                        ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-500 dark:border-amber-500 text-amber-900 dark:text-amber-200'
                        : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-600 dark:text-amber-400">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Caja</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                      Acceso exclusivo a Caja y Solvencia
                    </p>
                  </div>

                  <div
                    onClick={() => setNewRol('MATRICULA')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      newRol === 'MATRICULA'
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-500 text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                      <FileSignature className="w-3.5 h-3.5" />
                      <span>Matrícula</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                      Acceso exclusivo a Matrículas y Estudiantes
                    </p>
                  </div>

                  <div
                    onClick={() => setNewRol('PROFESOR')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      newRol === 'PROFESOR'
                        ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 dark:border-blue-500 text-blue-900 dark:text-blue-200'
                        : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-blue-600 dark:text-blue-400">
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>Docente</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                      Asistencia, talleres y reportes
                    </p>
                  </div>
                </div>
              </div>

              {newRol === 'PROFESOR' && (
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Especialidad artística <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={newEspecialidad}
                    onChange={(e) => setNewEspecialidad(e.target.value)}
                    placeholder="Ej: Pintura, Música, Danza, Cerámica"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}
              {/* Cargo y Teléfono */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cargo / Función
                  </label>
                  <input
                    type="text"
                    value={newCargo}
                    onChange={(e) => setNewCargo(e.target.value)}
                    placeholder={
                      newRol === 'ADMIN'
                        ? 'Ej. Subdirector General'
                        : newRol === 'CAJERO'
                        ? 'Ej. Cajera Principal'
                        : newRol === 'MATRICULA'
                        ? 'Ej. Encargada de Registro'
                        : 'Ej. Docente de Acuarela'
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Teléfono (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newTelefono}
                    onChange={(e) => setNewTelefono(e.target.value)}
                    placeholder="+505 8888-0000"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingUser ? 'Creando…' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR USUARIO */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Editar Usuario: {editingUser.nombre} {editingUser.apellido}
                </h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-4 sm:p-6 space-y-4 text-xs">
              {editError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Nombre y Apellido */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombres *
                  </label>
                  <input
                    type="text"
                    required
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    required
                    value={editApellido}
                    onChange={(e) => setEditApellido(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Username y Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Usuario / Login *
                  </label>
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nueva Contraseña (Opcional)
                  </label>
                  <div className="relative">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Dejar en blanco para conservar"
                      className="w-full pr-8 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showEditPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Correo */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Correo Electrónico <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="email"
                  placeholder="Opcional, solo si tiene correo institucional"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Rol y Permisos de Acceso *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setEditRol('ADMIN')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      editRol === 'ADMIN'
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-500 text-indigo-900 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Dirección</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                      Acceso total a paneles y reglas
                    </p>
                  </div>

                  <div
                    onClick={() => setEditRol('CAJERO')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      editRol === 'CAJERO'
                        ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-500 dark:border-amber-500 text-amber-900 dark:text-amber-200'
                        : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-600 dark:text-amber-400">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Caja</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                      Exclusivo: Caja y Solvencia
                    </p>
                  </div>

                  <div
                    onClick={() => setEditRol('MATRICULA')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      editRol === 'MATRICULA'
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-500 text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                      <FileSignature className="w-3.5 h-3.5" />
                      <span>Matrícula</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                      Exclusivo: Matrículas y Estudiantes
                    </p>
                  </div>

                  <div
                    onClick={() => setEditRol('PROFESOR')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      editRol === 'PROFESOR'
                        ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 dark:border-blue-500 text-blue-900 dark:text-blue-200'
                        : 'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-blue-600 dark:text-blue-400">
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>Docente</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                      Asistencia, talleres y reportes
                    </p>
                  </div>
                </div>
              </div>

              {editRol === 'PROFESOR' && (
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Especialidad artística <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={editEspecialidad}
                    onChange={(e) => setEditEspecialidad(e.target.value)}
                    placeholder="Ej: Pintura, Música, Danza, Cerámica"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}
              {/* Cargo y Teléfono */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cargo / Función
                  </label>
                  <input
                    type="text"
                    value={editCargo}
                    onChange={(e) => setEditCargo(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={editTelefono}
                    onChange={(e) => setEditTelefono(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingUser ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

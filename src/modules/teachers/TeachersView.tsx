import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  KeyRound,
  Link2,
  Mail,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  UserPlus,
  X,
} from 'lucide-react';
import { Grupo, Perfil } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import {
  correoInterno,
  esCorreoInterno,
  MENSAJE_USERNAME_INVALIDO,
  USERNAME_REGEX,
} from '../../utils/correoInterno';

interface TeachersViewProps {
  currentProfile: Perfil;
  onSelectWorkshop?: (grupoId: string) => void;
  /** Lleva a Configuración → Usuarios con el formulario de nuevo docente abierto */
  onCrearDocente?: () => void;
}

const DIAS_CORTOS: Record<number, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom' };

const inputClass =
  'w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500';

export const TeachersView: React.FC<TeachersViewProps> = ({ currentProfile, onCrearDocente }) => {
  const esAdmin = currentProfile.rol === 'ADMIN';
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [todosPerfiles, setTodosPerfiles] = useState<Perfil[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Editar docente
  const [editingTeacher, setEditingTeacher] = useState<Perfil | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editApellido, setEditApellido] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editEspecialidad, setEditEspecialidad] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Dar acceso (docentes antiguos sin cuenta)
  const [accesoPara, setAccesoPara] = useState<Perfil | null>(null);
  const [accesoUsuario, setAccesoUsuario] = useState('');
  const [accesoEmail, setAccesoEmail] = useState('');
  const [accesoPassword, setAccesoPassword] = useState('');
  const [accesoError, setAccesoError] = useState<string | null>(null);

  // Asignar taller
  const [asignarPara, setAsignarPara] = useState<Perfil | null>(null);
  const [asignarError, setAsignarError] = useState<string | null>(null);

  const loadData = () => {
    const todos = storageService.getPerfiles();
    setTodosPerfiles(todos);
    // Solo perfiles con rol Docente (Admin, Caja y Matrícula se gestionan en Configuración → Usuarios)
    setPerfiles(todos.filter((p) => p.rol === 'PROFESOR'));
    setGrupos(storageService.getGrupos());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToData(() => loadData());
    return () => unsub();
  }, []);

  const avisar = (texto: string) => {
    setToastMessage(texto);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const nombreDocente = (id: string) => {
    const p = todosPerfiles.find((x) => x.id === id);
    return p ? `${p.nombre} ${p.apellido}` : 'Sin docente asignado';
  };

  // ---------- Editar ----------
  const handleOpenEditModal = (prof: Perfil) => {
    setEditingTeacher(prof);
    setEditNombre(prof.nombre);
    setEditApellido(prof.apellido);
    setEditEmail(esCorreoInterno(prof.email) ? '' : prof.email);
    setEditEspecialidad(prof.especialidad || '');
    setEditTelefono(prof.telefono || '');
    setEditError(null);
  };

  const handleUpdateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher || guardando || !editNombre.trim() || !editApellido.trim()) return;
    setEditError(null);

    const conCuenta = storageService.tieneCuentaDeAcceso(editingTeacher);
    const email =
      editEmail.trim().toLowerCase() ||
      (editingTeacher.username ? correoInterno(editingTeacher.username) : editingTeacher.email);

    const cambios: Partial<Perfil> = {
      nombre: editNombre.trim(),
      apellido: editApellido.trim(),
      email,
      especialidad: editEspecialidad.trim() || undefined,
      telefono: editTelefono.trim() || undefined,
    };

    setGuardando(true);
    try {
      // Con cuenta: vía Edge Function para mantener sincronizado el correo de acceso
      if (conCuenta) await storageService.actualizarPerfil(editingTeacher.id, cambios);
      else storageService.actualizarProfesor(editingTeacher.id, cambios);
      avisar(`Docente ${editNombre.trim()} ${editApellido.trim()} actualizado.`);
      setEditingTeacher(null);
      loadData();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error al actualizar el docente');
    } finally {
      setGuardando(false);
    }
  };

  // ---------- Dar acceso ----------
  const abrirDarAcceso = (prof: Perfil) => {
    const sugerido = `${prof.nombre.trim()[0] || ''}${prof.apellido.trim().split(/\s+/)[0] || ''}`
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    setAccesoPara(prof);
    setAccesoUsuario(sugerido);
    setAccesoEmail(esCorreoInterno(prof.email) || prof.email.startsWith('profesor.') ? '' : prof.email);
    setAccesoPassword('');
    setAccesoError(null);
  };

  const handleDarAcceso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accesoPara || guardando) return;
    setAccesoError(null);

    const usuario = accesoUsuario.trim().toLowerCase();
    if (!USERNAME_REGEX.test(usuario)) {
      setAccesoError(MENSAJE_USERNAME_INVALIDO);
      return;
    }
    if (accesoPassword.trim().length < 6) {
      setAccesoError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (todosPerfiles.some((p) => (p.username || '').toLowerCase() === usuario)) {
      setAccesoError(`El usuario "${usuario}" ya está en uso.`);
      return;
    }
    const email = accesoEmail.trim().toLowerCase() || correoInterno(usuario);

    setGuardando(true);
    try {
      const perfil = await storageService.darAccesoDocente(accesoPara.id, usuario, accesoPassword.trim(), email);
      avisar(
        `${perfil.nombre} ${perfil.apellido} ya tiene acceso con el usuario "${usuario}". Sus talleres e historial se conservaron.`
      );
      setAccesoPara(null);
      loadData();
    } catch (err: unknown) {
      setAccesoError(err instanceof Error ? err.message : 'No se pudo dar acceso al docente.');
    } finally {
      setGuardando(false);
    }
  };

  // ---------- Asignar / quitar talleres ----------
  const asignar = (grupo: Grupo) => {
    if (!asignarPara) return;
    setAsignarError(null);
    if (
      grupo.profesor_id &&
      grupo.profesor_id !== asignarPara.id &&
      !window.confirm(
        `"${grupo.nombre}" está asignado a ${nombreDocente(grupo.profesor_id)}. ¿Reasignarlo a ${asignarPara.nombre} ${asignarPara.apellido}?`
      )
    ) {
      return;
    }
    try {
      storageService.asignarTallerADocente(grupo.id, asignarPara.id);
      avisar(`"${grupo.nombre}" asignado a ${asignarPara.nombre} ${asignarPara.apellido}.`);
      loadData();
    } catch (err: unknown) {
      setAsignarError(err instanceof Error ? err.message : 'No se pudo asignar el taller.');
    }
  };

  const quitarTaller = (grupo: Grupo, prof: Perfil) => {
    if (!window.confirm(`¿Quitar "${grupo.nombre}" a ${prof.nombre} ${prof.apellido}? El taller quedará sin docente asignado.`)) {
      return;
    }
    try {
      storageService.asignarTallerADocente(grupo.id, '');
      avisar(`"${grupo.nombre}" quedó sin docente asignado.`);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'No se pudo quitar el taller.');
    }
  };

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return perfiles.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.apellido.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.username || '').toLowerCase().includes(q) ||
        (p.especialidad && p.especialidad.toLowerCase().includes(q))
    );
  }, [perfiles, searchQuery]);

  const sinDocente = grupos.filter((g) => !g.profesor_id || !todosPerfiles.some((p) => p.id === g.profesor_id));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fadeIn">
      {/* Toast */}
      {toastMessage && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3.5 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E7EAF0] dark:border-[#2B3442]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#172033] dark:text-[#F1F5F9] tracking-tight">
            Maestros y Talleristas Titulares
          </h1>
          <p className="text-xs text-[#667085] dark:text-[#94A3B8] mt-1">
            Plantilla docente y asignación de talleres. Los docentes se crean en Configuración → Usuarios.
          </p>
        </div>

        {esAdmin && onCrearDocente && (
          <button
            onClick={onCrearDocente}
            className="px-4 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center space-x-2 shrink-0 self-start sm:self-auto cursor-pointer"
            title="Abre Configuración → Usuarios con el rol Docente seleccionado"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo docente</span>
          </button>
        )}
      </div>

      {/* Aviso de talleres sin docente */}
      {esAdmin && sinDocente.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {sinDocente.length === 1 ? 'Hay 1 taller' : `Hay ${sinDocente.length} talleres`} sin docente asignado:{' '}
            <strong>{sinDocente.map((g) => g.nombre).join(', ')}</strong>. Usa "Asignar taller" en la tarjeta del docente.
          </span>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white dark:bg-[#1B222D] rounded-xl p-3.5 shadow-xs border border-[#E7EAF0] dark:border-[#2B3442] flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, usuario, especialidad o correo..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#F7F8FA] dark:bg-[#151A22] border border-[#E7EAF0] dark:border-[#2B3442] rounded-lg text-xs text-[#172033] dark:text-[#F1F5F9] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
          />
        </div>
        <span className="text-xs text-[#667085] dark:text-[#94A3B8] font-medium hidden sm:inline">
          Total de Docentes: {perfiles.length}
        </span>
      </div>

      {filteredTeachers.length === 0 && (
        <div className="py-12 text-center text-xs text-[#667085] dark:text-[#94A3B8] bg-white dark:bg-[#1B222D] rounded-xl border border-dashed border-[#E7EAF0] dark:border-[#2B3442]">
          {perfiles.length === 0
            ? 'Aún no hay docentes. Créalos en Configuración → Usuarios con el rol Docente.'
            : 'Ningún docente coincide con la búsqueda.'}
        </div>
      )}

      {/* Teachers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTeachers.map((prof) => {
          const talleresAsignados = grupos.filter((g) => g.profesor_id === prof.id);
          const conCuenta = storageService.tieneCuentaDeAcceso(prof);

          return (
            <div
              key={prof.id}
              className="bg-white dark:bg-[#1B222D] rounded-xl p-5 shadow-xs border border-[#E7EAF0] dark:border-[#2B3442] flex flex-col justify-between hover:border-[#D1D7E3] dark:hover:border-[#3B4759] transition space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8] flex items-center justify-center font-bold text-sm border border-indigo-200 dark:border-indigo-900 shadow-xs shrink-0">
                      {prof.nombre[0]}
                      {prof.apellido[0]}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-[#172033] dark:text-[#F1F5F9] text-sm truncate">
                        {prof.nombre} {prof.apellido}
                      </h3>
                      {conCuenta ? (
                        <span className="text-[10px] font-mono text-[#667085] dark:text-[#94A3B8]">
                          @{prof.username || 'sin usuario'}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded inline-flex items-center gap-1 mt-0.5 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <ShieldOff className="w-3 h-3" />
                          Sin acceso al sistema
                        </span>
                      )}
                    </div>
                  </div>

                  {esAdmin && (
                    <button
                      onClick={() => handleOpenEditModal(prof)}
                      className="px-2 py-1 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs cursor-pointer font-medium shrink-0"
                      title="Editar información del docente"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Editar</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2 text-xs text-[#667085] dark:text-[#94A3B8] pt-2 border-t border-[#E7EAF0] dark:border-[#2B3442]">
                  <div className="flex items-center space-x-2">
                    <Award className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8] shrink-0" />
                    <span className="font-medium text-[#172033] dark:text-[#F1F5F9]">
                      {prof.especialidad || 'Sin especialidad registrada'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-mono text-[11px] truncate">
                      {esCorreoInterno(prof.email) ? 'Sin correo' : prof.email}
                    </span>
                  </div>
                </div>

                {/* Talleres asignados */}
                <div className="bg-[#F7F8FA] dark:bg-[#151A22] p-3 rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]">
                      Talleres a su Cargo ({talleresAsignados.length})
                    </span>
                    {esAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setAsignarPara(prof);
                          setAsignarError(null);
                        }}
                        className="text-[11px] font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Asignar taller
                      </button>
                    )}
                  </div>
                  {talleresAsignados.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">Sin talleres asignados</span>
                  ) : (
                    <div className="space-y-1">
                      {talleresAsignados.map((g) => (
                        <div
                          key={g.id}
                          className="flex items-center justify-between gap-2 text-xs font-semibold text-[#172033] dark:text-[#F1F5F9] bg-white dark:bg-[#1B222D] p-2 rounded-md border border-[#E7EAF0] dark:border-[#2B3442]"
                        >
                          <span className="truncate">{g.nombre}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-[10px] text-[#667085] dark:text-[#94A3B8]">
                              {g.hora_inicio} - {g.hora_fin}
                            </span>
                            {esAdmin && (
                              <button
                                type="button"
                                onClick={() => quitarTaller(g, prof)}
                                className="p-0.5 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Quitar taller a este docente"
                                aria-label={`Quitar ${g.nombre}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                {esAdmin && !conCuenta ? (
                  <button
                    type="button"
                    onClick={() => abrirDarAcceso(prof)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Dar acceso
                  </button>
                ) : (
                  <span />
                )}
                <span className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                  Miembro desde {new Date(prof.creado_en).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Dar acceso */}
      {accesoPara && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold">
                  Dar acceso a {accesoPara.nombre} {accesoPara.apellido}
                </h3>
              </div>
              <button onClick={() => setAccesoPara(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleDarAcceso} className="p-6 space-y-4 text-xs">
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                Se creará su cuenta para iniciar sesión. Conservará sus talleres, las asistencias que registró y su anecdotario.
              </p>
              {accesoError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{accesoError}</span>
                </div>
              )}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Usuario *</label>
                <input
                  type="text"
                  required
                  autoCapitalize="none"
                  value={accesoUsuario}
                  onChange={(e) => setAccesoUsuario(e.target.value)}
                  placeholder="ej. mvalerio"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Correo <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={accesoEmail}
                  onChange={(e) => setAccesoEmail(e.target.value)}
                  placeholder="Opcional, solo si tiene correo institucional"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Contraseña *</label>
                <input
                  type="password"
                  required
                  value={accesoPassword}
                  onChange={(e) => setAccesoPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={inputClass}
                />
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button type="button" onClick={() => setAccesoPara(null)} className="px-3 py-1.5 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {guardando ? 'Creando acceso…' : 'Dar acceso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Asignar taller */}
      {asignarPara && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold">
                  Asignar talleres a {asignarPara.nombre} {asignarPara.apellido}
                </h3>
              </div>
              <button onClick={() => setAsignarPara(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto text-xs">
              {asignarError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{asignarError}</span>
                </div>
              )}
              {grupos.length === 0 ? (
                <p className="py-8 text-center text-slate-500">Aún no hay talleres creados. Créalos en el módulo Talleres.</p>
              ) : (
                grupos.map((g) => {
                  const esSuyo = g.profesor_id === asignarPara.id;
                  return (
                    <div
                      key={g.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        esSuyo
                          ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-700/80'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{g.nombre}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {g.dias_semana.map((d) => DIAS_CORTOS[d]).join(', ')} · {g.hora_inicio}-{g.hora_fin}
                          {g.aula ? ` · ${g.aula}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-400">Docente actual: {g.profesor_id ? nombreDocente(g.profesor_id) : 'ninguno'}</p>
                      </div>
                      {esSuyo ? (
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0">Asignado</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => asignar(g)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shrink-0 cursor-pointer"
                        >
                          {g.profesor_id ? 'Reasignar' : 'Asignar'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar docente */}
      {editingTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Pencil className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Editar docente: {editingTeacher.nombre} {editingTeacher.apellido}
                </h3>
              </div>
              <button onClick={() => setEditingTeacher(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateTeacher} className="p-6 space-y-4 text-xs">
              {editError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre</label>
                  <input type="text" required value={editNombre} onChange={(e) => setEditNombre(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Apellido</label>
                  <input type="text" required value={editApellido} onChange={(e) => setEditApellido(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Correo <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Opcional, solo si tiene correo institucional"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Especialidad artística</label>
                <input type="text" value={editEspecialidad} onChange={(e) => setEditEspecialidad(e.target.value)} placeholder="Ej: Pintura, Música, Danza" className={inputClass} />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Teléfono</label>
                <input type="text" value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} placeholder="+505 8888-0000" className={inputClass} />
              </div>
              <p className="text-[11px] text-slate-400">Usuario, contraseña y rol se gestionan en Configuración → Usuarios.</p>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setEditingTeacher(null)} className="px-3 py-1.5 text-slate-600 dark:text-slate-400 cursor-pointer">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

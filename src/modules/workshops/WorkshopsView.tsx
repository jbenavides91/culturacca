import React, { useState, useEffect } from 'react';
import {
  Clock,
  MapPin,
  Users,
  Plus,
  ExternalLink,
  X,
  UserPlus,
  Pencil,
  Banknote,
  Trash2,
  AlertTriangle,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';
import { Grupo, Perfil, Salon } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { EnrollStudentsModal } from './EnrollStudentsModal';
import { SalonSelect } from './SalonSelect';
import { VistaPreviaSesiones, contarSesionesPrevistas } from './VistaPreviaSesiones';
import { arancelDeGrupo, arancelGeneral, etiquetaPeriodo, formatearMonto } from '../../utils/arancel';
import { ordenarAlfabetico, type Orden } from '../../utils/orden';
import { OrdenSelector } from '../../components/OrdenSelector';

type VistaTalleres = 'tarjetas' | 'lista';
const CLAVE_VISTA_TALLERES = 'cca_talleres_vista';

function leerVistaGuardada(): VistaTalleres {
  try {
    return localStorage.getItem(CLAVE_VISTA_TALLERES) === 'lista' ? 'lista' : 'tarjetas';
  } catch {
    return 'tarjetas';
  }
}

/** Minúsculas y sin tildes, para comparar búsquedas */
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const DIAS_COMPLETOS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

/** Barra fina de avance (sesiones cerradas / total) */
const BarraAvance: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
    <div className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
  </div>
);

interface WorkshopsViewProps {
  currentProfile: Perfil;
  onSelectWorkshopForRollCall: (grupoId: string) => void;
  openNewModalInitially?: boolean;
}

export const WorkshopsView: React.FC<WorkshopsViewProps> = ({
  currentProfile,
  onSelectWorkshopForRollCall,
  openNewModalInitially = false,
}) => {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(openNewModalInitially);
  const [enrollModalGrupo, setEnrollModalGrupo] = useState<Grupo | null>(null);
  const [isNewlyCreatedEnroll, setIsNewlyCreatedEnroll] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaTalleres>(leerVistaGuardada);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<Orden>('AZ');

  const cambiarVista = (v: VistaTalleres) => {
    setVista(v);
    try {
      localStorage.setItem(CLAVE_VISTA_TALLERES, v);
    } catch {
      /* almacenamiento no disponible */
    }
  };

  // Edit Workshop state
  const [editingGrupo, setEditingGrupo] = useState<Grupo | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editProfesorId, setEditProfesorId] = useState('');
  const [editDiasSemana, setEditDiasSemana] = useState<number[]>([1, 3]);
  const [editHoraInicio, setEditHoraInicio] = useState('18:00');
  const [editHoraFin, setEditHoraFin] = useState('20:30');
  const [editAula, setEditAula] = useState('');
  const [editCosto, setEditCosto] = useState('');
  const [costo, setCosto] = useState('');
  const [editFechaInicio, setEditFechaInicio] = useState('');
  const [editFechaFin, setEditFechaFin] = useState('');

  // Delete Workshop state
  const [grupoAEliminar, setGrupoAEliminar] = useState<Grupo | null>(null);
  const [confirmNombreEliminar, setConfirmNombreEliminar] = useState('');

  // Form states for new workshop
  const [nombre, setNombre] = useState('');
  const [profesorId, setProfesorId] = useState('');
  const [diasSemana, setDiasSemana] = useState<number[]>([1, 3]); // Lunes y Miércoles
  const [horaInicio, setHoraInicio] = useState('18:00');
  const [horaFin, setHoraFin] = useState('20:30');
  const [fechaInicio, setFechaInicio] = useState('2026-11-01');
  const [fechaFin, setFechaFin] = useState('2026-12-18');
  const [aula, setAula] = useState('');

  const loadData = () => {
    setGrupos(storageService.getGrupos());
    setPerfiles(storageService.getPerfiles());
    setSalones(storageService.getSalones());
  };

  // Solo perfiles con rol Docente pueden ser asignados a un taller
  const docentes = perfiles.filter((p) => p.rol === 'PROFESOR');

  const handleOpenEditModal = (g: Grupo) => {
    setEditingGrupo(g);
    setEditNombre(g.nombre);
    setEditProfesorId(g.profesor_id);
    setEditDiasSemana([...g.dias_semana]);
    setEditHoraInicio(g.hora_inicio);
    setEditHoraFin(g.hora_fin);
    setEditAula(g.aula || '');
    setEditCosto(g.costo ? String(g.costo) : '');
    setEditFechaInicio(g.fecha_inicio_ciclo || '');
    setEditFechaFin(g.fecha_fin_ciclo || '');
  };

  const handleUpdateWorkshop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGrupo || !editNombre.trim() || !editProfesorId) return;

    if (editFechaFin < editFechaInicio) {
      alert('La fecha de fin del taller no puede ser anterior a la fecha de inicio.');
      return;
    }
    if (contarSesionesPrevistas(editFechaInicio, editFechaFin, editDiasSemana) === 0) {
      alert('Con esas fechas y días el taller no tendría ninguna clase. Ajusta el rango o los días.');
      return;
    }
    const costoEdit = editCosto.trim() ? Number(editCosto) : undefined;
    if (costoEdit !== undefined && (!Number.isFinite(costoEdit) || costoEdit <= 0)) {
      alert('El costo del taller debe ser un número mayor que 0, o déjalo vacío para usar el arancel general.');
      return;
    }

    try {
      const res = storageService.actualizarGrupo(editingGrupo.id, {
        nombre: editNombre.trim(),
        profesor_id: editProfesorId,
        dias_semana: editDiasSemana,
        hora_inicio: editHoraInicio,
        hora_fin: editHoraFin,
        aula: editAula.trim() || 'Taller Principal',
        fecha_inicio_ciclo: editFechaInicio,
        fecha_fin_ciclo: editFechaFin,
        costo: costoEdit,
      });

      const partes: string[] = [];
      if (res.sesionesAgregadas > 0) partes.push(`+${res.sesionesAgregadas} nuevas`);
      if (res.sesionesEliminadas > 0) partes.push(`−${res.sesionesEliminadas} eliminadas`);
      const conservadas =
        res.sesionesConservadas > 0
          ? ` (${res.sesionesConservadas} con asistencia o cerrada${res.sesionesConservadas > 1 ? 's' : ''} fuera del nuevo calendario se conservaron)`
          : '';
      setToastMessage(
        `Taller "${editNombre.trim()}" actualizado exitosamente.` +
          (partes.length > 0 || conservadas ? ` Sesiones: ${partes.join(', ') || 'sin cambios'}${conservadas}.` : '')
      );
      setEditingGrupo(null);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al actualizar el taller');
    }
  };

  const resumenEliminar = grupoAEliminar ? storageService.resumenEliminacionGrupo(grupoAEliminar.id) : null;
  // Con historial de asistencia se exige escribir el nombre del taller para confirmar
  const requiereNombreEliminar = !!resumenEliminar && resumenEliminar.asistencias > 0;
  const puedeEliminar =
    !!grupoAEliminar &&
    (!requiereNombreEliminar ||
      confirmNombreEliminar.trim().toLowerCase() === grupoAEliminar.nombre.trim().toLowerCase());

  const handleOpenDeleteModal = (g: Grupo) => {
    setGrupoAEliminar(g);
    setConfirmNombreEliminar('');
  };

  const handleDeleteWorkshop = () => {
    if (!grupoAEliminar || !puedeEliminar) return;
    try {
      const res = storageService.eliminarGrupo(grupoAEliminar.id);
      setToastMessage(
        `Taller "${grupoAEliminar.nombre}" eliminado.` +
          (res.alumnosLiberados > 0
            ? ` ${res.alumnosLiberados} alumno${res.alumnosLiberados > 1 ? 's quedaron disponibles' : ' quedó disponible'} para inscribirse en otro taller.`
            : '')
      );
      setGrupoAEliminar(null);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar el taller');
    }
  };

  const toggleEditDia = (dia: number) => {
    if (editDiasSemana.includes(dia)) {
      if (editDiasSemana.length === 1) return;
      setEditDiasSemana(editDiasSemana.filter((d) => d !== dia));
    } else {
      setEditDiasSemana([...editDiasSemana, dia].sort());
    }
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToData(() => loadData());
    return () => unsub();
  }, []);

  const handleCreateWorkshop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !profesorId) return;
    if (contarSesionesPrevistas(fechaInicio, fechaFin, diasSemana) === 0) {
      alert('Con esas fechas y días el taller no tendría ninguna clase. Ajusta el rango o los días.');
      return;
    }
    const costoNuevo = costo.trim() ? Number(costo) : undefined;
    if (costoNuevo !== undefined && (!Number.isFinite(costoNuevo) || costoNuevo <= 0)) {
      alert('El costo del taller debe ser un número mayor que 0, o déjalo vacío para usar el arancel general.');
      return;
    }

    try {
      const nuevo = storageService.crearGrupoConSesiones({
        costo: costoNuevo,
        nombre: nombre.trim(),
        profesor_id: profesorId,
        dias_semana: diasSemana,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        fecha_inicio_ciclo: fechaInicio,
        fecha_fin_ciclo: fechaFin,
        aula: aula.trim() || 'Taller Principal',
      });

      setToastMessage(`Taller "${nuevo.grupo.nombre}" creado exitosamente.`);
      setIsModalOpen(false);
      setNombre('');
      setAula('');
      setCosto('');

      // Open enrollment modal
      setEnrollModalGrupo(nuevo.grupo);
      setIsNewlyCreatedEnroll(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al crear el taller');
    }
  };

  const toggleDia = (dia: number) => {
    if (diasSemana.includes(dia)) {
      if (diasSemana.length === 1) return;
      setDiasSemana(diasSemana.filter((d) => d !== dia));
    } else {
      setDiasSemana([...diasSemana, dia].sort());
    }
  };

  const DIAS_LABELS: Record<number, string> = {
    1: 'Lun',
    2: 'Mar',
    3: 'Mié',
    4: 'Jue',
    5: 'Vie',
    6: 'Sáb',
    7: 'Dom',
  };

  const diasTexto = (g: Grupo) => g.dias_semana.map((d) => DIAS_LABELS[d] || d).join(', ');

  // --- Búsqueda (sin distinguir mayúsculas ni tildes; deben aparecer todas las palabras) ---
  const gruposDelRol =
    currentProfile.rol === 'PROFESOR' ? grupos.filter((g) => g.profesor_id === currentProfile.id) : grupos;
  const terminos = normalizar(busqueda).split(/\s+/).filter(Boolean);
  const textoBuscable = (g: Grupo) => {
    const prof = perfiles.find((p) => p.id === g.profesor_id);
    return normalizar(
      [
        g.nombre,
        prof ? `${prof.nombre} ${prof.apellido}` : '',
        g.aula || 'Taller Principal',
        `${g.hora_inicio} ${g.hora_fin}`,
        diasTexto(g),
        g.dias_semana.map((d) => DIAS_COMPLETOS[d] || '').join(' '),
      ].join(' ')
    );
  };
  const visibleGrupos = ordenarAlfabetico(
    terminos.length === 0
      ? gruposDelRol
      : gruposDelRol.filter((g) => {
          const texto = textoBuscable(g);
          return terminos.every((t) => texto.includes(t));
        }),
    (g) => [g.nombre],
    orden === 'ZA' ? 'ZA' : 'AZ'
  );

  /** Datos derivados de un taller, compartidos por las vistas de tarjetas y de lista */
  const datosTaller = (g: Grupo) => {
    const sesiones = storageService.getSesionesByGrupo(g.id);
    const closedCount = sesiones.filter((s) => s.cerrada).length;
    return {
      prof: perfiles.find((p) => p.id === g.profesor_id),
      sesiones,
      estudiantes: storageService.getEstudiantesByGrupo(g.id),
      closedCount,
      pct: sesiones.length > 0 ? (closedCount / sesiones.length) * 100 : 0,
    };
  };

  const abrirAlumnos = (g: Grupo) => {
    setEnrollModalGrupo(g);
    setIsNewlyCreatedEnroll(false);
  };

  /** Botones de acción de un taller; `compacto` (vista de lista) los muestra solo con icono */
  const renderAcciones = (g: Grupo, compacto: boolean) => {
    const base = compacto
      ? 'p-2 rounded-lg transition-colors cursor-pointer'
      : 'px-2.5 py-1 text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer font-medium';
    return (
      <>
        {currentProfile.rol === 'ADMIN' && (
          <div className={`flex flex-wrap items-center ${compacto ? 'gap-0.5' : 'gap-1 sm:gap-1.5'}`}>
            <button
              onClick={() => handleOpenEditModal(g)}
              className={`${base} text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800`}
              title="Editar taller"
              aria-label={`Editar taller ${g.nombre}`}
            >
              <Pencil className="w-3.5 h-3.5" />
              {!compacto && <span>Editar</span>}
            </button>
            <button
              onClick={() => handleOpenDeleteModal(g)}
              className={`${base} text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-50/60 dark:hover:bg-rose-950/30`}
              title="Eliminar taller"
              aria-label={`Eliminar taller ${g.nombre}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {!compacto && <span>Eliminar</span>}
            </button>
            <button
              onClick={() => abrirAlumnos(g)}
              className={`${base} text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30`}
              title="Vincular o modificar alumnos"
              aria-label={`Alumnos del taller ${g.nombre}`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              {!compacto && <span>Alumnos</span>}
            </button>
          </div>
        )}

        <button
          onClick={() => onSelectWorkshopForRollCall(g.id)}
          className="px-3 py-1 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0 ml-auto"
        >
          <span>Asistencia</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </>
    );
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 animate-fadeIn">
      {/* Toast Notice */}
      {toastMessage && (
        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 p-3 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Clean Minimalist Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {currentProfile.rol === 'ADMIN' ? 'Talleres Vespertinos' : 'Mis talleres'}
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {currentProfile.rol === 'ADMIN'
              ? 'Gestión de horarios, asignación docente y matrícula de participantes.'
              : 'Horarios, aulas asignadas y acceso directo a la toma de asistencia.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {/* Selector de vista */}
          <div
            className="flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#141A23]"
            role="group"
            aria-label="Tipo de vista"
          >
            {([
              { id: 'tarjetas', label: 'Tarjetas', Icon: LayoutGrid },
              { id: 'lista', label: 'Lista', Icon: List },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => cambiarVista(id)}
                aria-pressed={vista === id}
                title={`Vista de ${label.toLowerCase()}`}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  vista === id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {currentProfile.rol === 'ADMIN' && (
            <button
              onClick={() => {
                if (docentes.length > 0) setProfesorId(docentes[0].id);
                setIsModalOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Taller</span>
            </button>
          )}
        </div>
      </div>

      {/* Barra de búsqueda */}
      {gruposDelRol.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-64 md:w-80">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar taller, docente, salón, día u hora..."
              aria-label="Buscar talleres"
              className="w-full pl-8.5 pr-8 py-1.5 bg-white dark:bg-[#141A23] border border-slate-200/80 dark:border-slate-800/80 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 [&::-webkit-search-cancel-button]:hidden"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                title="Limpiar búsqueda"
                aria-label="Limpiar búsqueda"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <OrdenSelector value={orden} onChange={setOrden} />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {terminos.length > 0
              ? `${visibleGrupos.length} de ${gruposDelRol.length} talleres`
              : `${gruposDelRol.length} taller${gruposDelRol.length === 1 ? '' : 'es'}`}
          </p>
        </div>
      )}

      {/* Workshop Grid */}
      {(() => {
        if (gruposDelRol.length > 0 && visibleGrupos.length === 0) {
          return (
            <div className="text-center py-12 bg-white dark:bg-[#141A23] rounded-xl border border-slate-200/80 dark:border-slate-800/80 p-5 sm:p-8 space-y-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Ningún taller coincide con «{busqueda.trim()}»
              </p>
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            </div>
          );
        }

        if (visibleGrupos.length === 0) {
          return (
            <div className="text-center py-12 bg-white dark:bg-[#141A23] rounded-xl border border-slate-200/80 dark:border-slate-800/80 p-5 sm:p-8 space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No tienes talleres asignados actualmente
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comunícate con la Dirección Académica para la apertura o asignación de grupos de este ciclo.
              </p>
            </div>
          );
        }

        if (vista === 'lista') {
          return (
            <div className="bg-white dark:bg-[#141A23] rounded-xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
              {/* Tabla (md en adelante) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
                      <th className="px-4 py-2.5 font-medium">Taller</th>
                      <th className="px-3 py-2.5 font-medium">Horario</th>
                      <th className="px-3 py-2.5 font-medium">Salón</th>
                      <th className="px-3 py-2.5 font-medium">Arancel</th>
                      <th className="px-3 py-2.5 font-medium">Alumnos</th>
                      <th className="px-3 py-2.5 font-medium w-36">Avance</th>
                      <th className="px-4 py-2.5 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {visibleGrupos.map((grupo) => {
                      const { prof, sesiones, estudiantes, closedCount, pct } = datosTaller(grupo);
                      return (
                        <tr key={grupo.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900 dark:text-white">{grupo.nombre}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {prof ? `${prof.nombre} ${prof.apellido}` : 'Docente titular'}
                            </p>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <p className="font-medium text-slate-800 dark:text-slate-200">
                              {grupo.hora_inicio} - {grupo.hora_fin}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {diasTexto(grupo)}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                            {grupo.aula || 'Taller Principal'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                            {formatearMonto(arancelDeGrupo(grupo))}
                            {!(Number(grupo.costo) > 0) && <span className="text-slate-400"> (general)</span>}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <strong className="font-medium text-slate-900 dark:text-white">{estudiantes.length}</strong>
                            {currentProfile.rol === 'ADMIN' && (
                              <button
                                type="button"
                                onClick={() => abrirAlumnos(grupo)}
                                className="ml-1.5 text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                              >
                                Gestionar
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <BarraAvance pct={pct} />
                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                              {closedCount}/{sesiones.length} sesiones
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">{renderAcciones(grupo, true)}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Filas compactas (móvil) */}
              <ul className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                {visibleGrupos.map((grupo) => {
                  const { prof, sesiones, estudiantes, closedCount, pct } = datosTaller(grupo);
                  return (
                    <li key={grupo.id} className="p-3 space-y-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{grupo.nombre}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {prof ? `${prof.nombre} ${prof.apellido}` : 'Docente titular'} · {grupo.aula || 'Taller Principal'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {grupo.hora_inicio} - {grupo.hora_fin}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{diasTexto(grupo)}</span>
                        <span aria-hidden="true">·</span>
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{estudiantes.length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <BarraAvance pct={pct} />
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {closedCount}/{sesiones.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-1">{renderAcciones(grupo, true)}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleGrupos.map((grupo) => {
              const { prof, sesiones, estudiantes, closedCount, pct } = datosTaller(grupo);

              return (
                <div
                  key={grupo.id}
                  className="bg-white dark:bg-[#141A23] rounded-xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
              <div className="p-3.5 sm:p-5 space-y-3.5">
                {/* Title */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {grupo.nombre}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Docente: {prof ? `${prof.nombre} ${prof.apellido}` : 'Docente titular'}
                  </p>
                </div>

                {/* Quiet unboxed metadata */}
                <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {grupo.hora_inicio} - {grupo.hora_fin}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{diasTexto(grupo)}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{grupo.aula || 'Taller Principal'}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {formatearMonto(arancelDeGrupo(grupo))} {etiquetaPeriodo()}
                      {!(Number(grupo.costo) > 0) && <span className="text-slate-400"> (general)</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-0.5">
                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      <strong className="text-slate-900 dark:text-white font-medium">{estudiantes.length}</strong> alumnos inscritos
                    </span>
                    {currentProfile.rol === 'ADMIN' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => abrirAlumnos(grupo)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          Gestionar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Slim session progress */}
                <div className="pt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Avance</span>
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      {closedCount} de {sesiones.length} sesiones
                    </span>
                  </div>
                  <BarraAvance pct={pct} />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-3 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-2">
                {renderAcciones(grupo, false)}
              </div>
              </div>
            );
            })}
          </div>
        );
      })()}

      {/* Minimalist Modal: Registrar Nuevo Taller */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Registrar Nuevo Taller
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkshop} className="p-4 sm:p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Taller
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Pintura al Óleo y Técnicas Mixtas"
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Docente Responsable
                  </label>
                  <select
                    required
                    value={profesorId}
                    onChange={(e) => setProfesorId(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Selecciona docente</option>
                    {docentes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} {p.apellido}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Salón
                  </label>
                  <SalonSelect
                    salones={salones}
                    value={aula}
                    onChange={setAula}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Costo del taller (C$) <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={costo}
                    onChange={(e) => setCosto(e.target.value)}
                    placeholder={`General: ${formatearMonto(arancelGeneral())} ${etiquetaPeriodo()}`}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Días de Clase
                </label>
                <div className="grid grid-cols-6 gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((dia) => {
                    const isSelected = diasSemana.includes(dia);
                    return (
                      <button
                        type="button"
                        key={dia}
                        onClick={() => toggleDia(dia)}
                        className={`py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {DIAS_LABELS[dia]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    required
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hora Fin
                  </label>
                  <input
                    type="time"
                    required
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Inicio de Ciclo
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Fin de Ciclo
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <VistaPreviaSesiones fechaInicio={fechaInicio} fechaFin={fechaFin} diasSemana={diasSemana} />

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  Crear Taller
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Minimalist Modal: Editar Taller */}
      {editingGrupo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Editar Taller: {editingGrupo.nombre}
                </h3>
              </div>
              <button
                onClick={() => setEditingGrupo(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateWorkshop} className="p-4 sm:p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Taller
                </label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Docente Responsable
                  </label>
                  <select
                    required
                    value={editProfesorId}
                    onChange={(e) => setEditProfesorId(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {/* Docentes + el asignado actual (por si el taller tenía asignado otro rol) */}
                    {perfiles
                      .filter((p) => p.rol === 'PROFESOR' || p.id === editProfesorId)
                      .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} {p.apellido}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Salón
                  </label>
                  <SalonSelect
                    salones={salones}
                    value={editAula}
                    onChange={setEditAula}
                    valorGuardado={editingGrupo?.aula}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Costo del taller (C$) <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={editCosto}
                    onChange={(e) => setEditCosto(e.target.value)}
                    placeholder={`General: ${formatearMonto(arancelGeneral())} ${etiquetaPeriodo()}`}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Días de Clase
                </label>
                <div className="grid grid-cols-6 gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((dia) => {
                    const isSelected = editDiasSemana.includes(dia);
                    return (
                      <button
                        type="button"
                        key={dia}
                        onClick={() => toggleEditDia(dia)}
                        className={`py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {DIAS_LABELS[dia]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    required
                    value={editHoraInicio}
                    onChange={(e) => setEditHoraInicio(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hora Fin
                  </label>
                  <input
                    type="time"
                    required
                    value={editHoraFin}
                    onChange={(e) => setEditHoraFin(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Inicio del Taller
                    </label>
                    <input
                      type="date"
                      required
                      value={editFechaInicio}
                      onChange={(e) => setEditFechaInicio(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Fin del Taller
                    </label>
                    <input
                      type="date"
                      required
                      min={editFechaInicio || undefined}
                      value={editFechaFin}
                      onChange={(e) => setEditFechaFin(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Al cambiar fechas o días se ajusta el calendario de sesiones. Las sesiones con asistencia registrada y las
                  extraordinarias no se eliminan.
                </p>
              </div>

              <VistaPreviaSesiones fechaInicio={editFechaInicio} fechaFin={editFechaFin} diasSemana={editDiasSemana} />

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingGrupo(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Eliminar Taller */}
      {grupoAEliminar && resumenEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Eliminar Taller: {grupoAEliminar.nombre}
                </h3>
              </div>
              <button
                onClick={() => setGrupoAEliminar(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                {resumenEliminar.alumnosInscritos > 0 ? (
                  <>
                    Se quitará la inscripción de{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {resumenEliminar.alumnosInscritos} alumno{resumenEliminar.alumnosInscritos > 1 ? 's' : ''}
                    </strong>
                    ; quedarán disponibles para inscribirse en otro taller (no se dan de baja).
                  </>
                ) : (
                  'Este taller no tiene alumnos inscritos.'
                )}
              </p>

              {resumenEliminar.asistencias > 0 || resumenEliminar.sesionesCerradas > 0 ? (
                <div className="flex gap-2 p-3 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Se eliminarán de forma permanente {resumenEliminar.sesiones} sesiones (
                    {resumenEliminar.sesionesCerradas} cerradas) y {resumenEliminar.asistencias} registros de
                    asistencia. Los reportes, la matriz y las alertas de este taller dejarán de mostrarse.
                  </span>
                </div>
              ) : (
                resumenEliminar.sesiones > 0 && (
                  <p className="text-slate-500 dark:text-slate-400">
                    También se eliminarán sus {resumenEliminar.sesiones} sesiones programadas (sin asistencia registrada).
                  </p>
                )
              )}

              {resumenEliminar.matriculasPendientes > 0 && (
                <div className="flex gap-2 p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Hay {resumenEliminar.matriculasPendientes} matrícula
                    {resumenEliminar.matriculasPendientes > 1 ? 's' : ''} pendiente
                    {resumenEliminar.matriculasPendientes > 1 ? 's' : ''} de caja para este taller; no podrán
                    aceptarse mientras apunten a un taller eliminado.
                  </span>
                </div>
              )}

              <p className="text-slate-500 dark:text-slate-400">
                Las anotaciones del anecdotario y los recibos de matrícula se conservan.
              </p>

              {requiereNombreEliminar && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Para confirmar, escribe el nombre del taller:{' '}
                    <span className="font-semibold">{grupoAEliminar.nombre}</span>
                  </label>
                  <input
                    type="text"
                    value={confirmNombreEliminar}
                    onChange={(e) => setConfirmNombreEliminar(e.target.value)}
                    autoFocus
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGrupoAEliminar(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteWorkshop}
                  disabled={!puedeEliminar}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  Eliminar taller
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student Enrollment Modal */}
      {enrollModalGrupo && (
        <EnrollStudentsModal
          isOpen={!!enrollModalGrupo}
          onClose={() => setEnrollModalGrupo(null)}
          grupo={enrollModalGrupo}
          isNewlyCreated={isNewlyCreatedEnroll}
          onSaved={(msg) => setToastMessage(msg)}
        />
      )}
    </div>
  );
};

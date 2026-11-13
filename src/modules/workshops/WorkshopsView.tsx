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
} from 'lucide-react';
import { Grupo, Perfil, Salon } from '../../types/attendance';
import { storageService, subscribeToData } from '../../services/storage.service';
import { EnrollStudentsModal } from './EnrollStudentsModal';
import { SalonSelect } from './SalonSelect';
import { VistaPreviaSesiones, contarSesionesPrevistas } from './VistaPreviaSesiones';
import { arancelDeGrupo, arancelGeneral, etiquetaPeriodo, formatearMonto } from '../../utils/arancel';

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

        {currentProfile.rol === 'ADMIN' && (
          <button
            onClick={() => {
              if (docentes.length > 0) setProfesorId(docentes[0].id);
              setIsModalOpen(true);
            }}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center space-x-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Taller</span>
          </button>
        )}
      </div>

      {/* Workshop Grid */}
      {(() => {
        const visibleGrupos = currentProfile.rol === 'PROFESOR'
          ? grupos.filter((g) => g.profesor_id === currentProfile.id)
          : grupos;

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

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleGrupos.map((grupo) => {
              const prof = perfiles.find((p) => p.id === grupo.profesor_id);
              const sesiones = storageService.getSesionesByGrupo(grupo.id);
              const estudiantes = storageService.getEstudiantesByGrupo(grupo.id);
              const closedCount = sesiones.filter((s) => s.cerrada).length;

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
                    <span>
                      {grupo.dias_semana.map((d) => DIAS_LABELS[d] || d).join(', ')}
                    </span>
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
                          onClick={() => {
                            setEnrollModalGrupo(grupo);
                            setIsNewlyCreatedEnroll(false);
                          }}
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
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all"
                      style={{
                        width: `${sesiones.length > 0 ? (closedCount / sesiones.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {currentProfile.rol === 'ADMIN' && (
                    <>
                      <button
                        onClick={() => handleOpenEditModal(grupo)}
                        className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 cursor-pointer font-medium"
                        title="Editar taller"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                      <button
                        onClick={() => {
                          setEnrollModalGrupo(grupo);
                          setIsNewlyCreatedEnroll(false);
                        }}
                        className="px-2.5 py-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 rounded-lg transition-colors flex items-center gap-1 cursor-pointer font-medium"
                        title="Vincular o modificar alumnos"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Alumnos</span>
                      </button>
                    </>
                  )}
                </div>

                <button
                  onClick={() => onSelectWorkshopForRollCall(grupo.id)}
                  className="px-3 py-1 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Asistencia</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
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

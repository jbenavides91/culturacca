import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  AlertTriangle,
  Clock,
  Calendar,
  MapPin,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { Estudiante, Grupo, Tutor } from '../../types/attendance';
import { indiceGrado } from '../../utils/grados';
import { storageService } from '../../services/storage.service';

interface EnrollStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  grupo: Grupo | null;
  isNewlyCreated?: boolean;
  onSaved?: (message: string) => void;
}

type ViewFilter = 'todos' | 'disponibles' | 'seleccionados' | 'conflictos';
type SolvenciaFilter = 'todos' | 'solvente' | 'pendiente';

export const EnrollStudentsModal: React.FC<EnrollStudentsModalProps> = ({
  isOpen,
  onClose,
  grupo,
  isNewlyCreated = false,
  onSaved,
}) => {
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [tutores, setTutores] = useState<Tutor[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Minimalist filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrado, setSelectedGrado] = useState<string>('');
  const [selectedAula, setSelectedAula] = useState<string>('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('todos');
  const [solvenciaFilter, setSolvenciaFilter] = useState<SolvenciaFilter>('todos');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && grupo) {
      const allEst = storageService.getEstudiantes();
      const allTut = storageService.getTutores();
      setEstudiantes(allEst);
      setTutores(allTut);

      const currentlyEnrolled = storageService.getEstudiantesByGrupo(grupo.id);
      setSelectedIds(new Set(currentlyEnrolled.map((e) => e.id)));

      setSearchQuery('');
      setSelectedGrado('');
      setSelectedAula('');
      setViewFilter('todos');
      setSolvenciaFilter('todos');
      setSaveError(null);
    }
  }, [isOpen, grupo]);

  const DIAS_LABELS: Record<number, string> = {
    1: 'Lun',
    2: 'Mar',
    3: 'Mié',
    4: 'Jue',
    5: 'Vie',
    6: 'Sáb',
    7: 'Dom',
  };

  // Evaluate conflicts and workshops for each student
  const studentEvaluations = useMemo(() => {
    if (!grupo) return [];

    return estudiantes.map((est) => {
      const isAlreadyInThisWorkshop = storageService
        .getEstudiantesByGrupo(grupo.id)
        .some((e) => e.id === est.id);

      const otherWorkshops = storageService
        .getGruposByEstudiante(est.id)
        .filter((g) => g.id !== grupo.id);

      const conflictResult = storageService.verificarConflictoHorario(est.id, grupo);
      const tutor = tutores.find((t) => t.id === est.tutor_id);

      return {
        estudiante: est,
        tutor,
        isAlreadyInThisWorkshop,
        otherWorkshops,
        hasConflict: conflictResult.tieneConflicto,
        conflictMotivo: conflictResult.motivo,
        conflictingGroup: conflictResult.grupoConflictivo,
      };
    });
  }, [estudiantes, tutores, grupo]);

  // Unique grades present
  const uniqueGrados = useMemo(() => {
    const map = new Map<string, number>();
    studentEvaluations.forEach((item) => {
      const g = item.estudiante.grado || 'Sin Grado';
      map.set(g, (map.get(g) || 0) + 1);
    });

    return Array.from(map.entries()).sort((a, b) => {
      const idxA = indiceGrado(a[0]);
      const idxB = indiceGrado(b[0]);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [studentEvaluations]);

  // Unique classrooms present
  const uniqueAulas = useMemo(() => {
    const map = new Map<string, number>();
    studentEvaluations.forEach((item) => {
      const a = item.estudiante.aula_regular || 'Sin Aula Regular';
      map.set(a, (map.get(a) || 0) + 1);
    });

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [studentEvaluations]);

  // Filtered list
  const filteredEvaluations = useMemo(() => {
    return studentEvaluations.filter((item) => {
      const est = item.estudiante;
      const tutor = item.tutor;

      // 1. Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const fullName = `${est.nombre} ${est.apellido}`.toLowerCase();
        const mat = (est.matricula || '').toLowerCase();
        const grado = (est.grado || '').toLowerCase();
        const aula = (est.aula_regular || '').toLowerCase();
        const tutorName = tutor ? tutor.nombre.toLowerCase() : '';

        const matches =
          fullName.includes(q) ||
          mat.includes(q) ||
          grado.includes(q) ||
          aula.includes(q) ||
          tutorName.includes(q);

        if (!matches) return false;
      }

      // 2. Grado filter
      if (selectedGrado && (est.grado || 'Sin Grado') !== selectedGrado) {
        return false;
      }

      // 3. Aula filter
      if (selectedAula && (est.aula_regular || 'Sin Aula Regular') !== selectedAula) {
        return false;
      }

      // 4. View filter (todos | disponibles | seleccionados | conflictos)
      if (viewFilter === 'disponibles' && item.hasConflict) {
        return false;
      }
      if (viewFilter === 'conflictos' && !item.hasConflict) {
        return false;
      }
      if (viewFilter === 'seleccionados' && !selectedIds.has(est.id)) {
        return false;
      }

      // 5. Solvencia filter
      if (solvenciaFilter === 'solvente' && !est.solvente) {
        return false;
      }
      if (solvenciaFilter === 'pendiente' && est.solvente) {
        return false;
      }

      return true;
    });
  }, [
    studentEvaluations,
    searchQuery,
    selectedGrado,
    selectedAula,
    viewFilter,
    solvenciaFilter,
    selectedIds,
  ]);

  // Overall counters
  const totalCount = studentEvaluations.length;
  const availableCount = studentEvaluations.filter((i) => !i.hasConflict).length;
  const conflictCount = studentEvaluations.filter((i) => i.hasConflict).length;
  const currentSelectedCount = selectedIds.size;

  const filteredAvailable = filteredEvaluations.filter((i) => !i.hasConflict);
  const filteredAvailableCount = filteredAvailable.length;

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    selectedGrado ||
    selectedAula ||
    viewFilter !== 'todos' ||
    solvenciaFilter !== 'todos'
  );

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedGrado('');
    setSelectedAula('');
    setViewFilter('todos');
    setSolvenciaFilter('todos');
  };

  const handleToggleStudent = (estudianteId: string, hasConflict: boolean) => {
    if (hasConflict) return;

    const newSet = new Set(selectedIds);
    if (newSet.has(estudianteId)) {
      newSet.delete(estudianteId);
    } else {
      newSet.add(estudianteId);
    }
    setSelectedIds(newSet);
  };

  const handleSelectFilteredAvailable = () => {
    const newSet = new Set(selectedIds);
    filteredAvailable.forEach((item) => {
      newSet.add(item.estudiante.id);
    });
    setSelectedIds(newSet);
  };

  const handleDeselectFiltered = () => {
    const newSet = new Set(selectedIds);
    filteredEvaluations.forEach((item) => {
      newSet.delete(item.estudiante.id);
    });
    setSelectedIds(newSet);
  };

  const handleSave = () => {
    if (!grupo) return;

    try {
      setIsSubmitting(true);
      setSaveError(null);

      const result = storageService.actualizarInscripcionesGrupo(
        grupo.id,
        Array.from(selectedIds)
      );

      if (result.errores.length > 0) {
        const errList = result.errores.map((e) => `• ${e.estudianteNombre}: ${e.motivo}`).join('\n');
        setSaveError(`Alumnos no inscritos por conflicto de horario:\n${errList}`);
      }

      onSaved?.(`Alumnos actualizados en "${grupo.nombre}" (${selectedIds.size} inscritos).`);
      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !grupo) return null;

  const diasTexto = (grupo.dias_semana || []).map((d) => DIAS_LABELS[d] || d).join(', ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-3xl w-full max-h-[88vh] overflow-hidden border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 flex flex-col">
        {/* Minimalist Clean Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800/80 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
                Vincular Alumnos
              </h2>
              <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate max-w-xs sm:max-w-md">
                {grupo.nombre}
              </span>
            </div>

            {/* Quiet metadata line */}
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span>{diasTexto}</span>
              <span aria-hidden="true">·</span>
              <span>{grupo.hora_inicio} - {grupo.hora_fin}</span>
              <span aria-hidden="true">·</span>
              <span>{grupo.aula || 'Taller Principal'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {currentSelectedCount} seleccionados
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 -mr-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Minimalist Controls Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 shrink-0 space-y-2.5">
          {/* Top Line: Search + Dropdowns */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, matrícula o tutor..."
                className="w-full pl-8.5 pr-7 py-1.5 bg-white dark:bg-[#1A222D] border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter: Grado */}
            <div className="relative shrink-0 sm:w-36">
              <select
                value={selectedGrado}
                onChange={(e) => setSelectedGrado(e.target.value)}
                className="w-full appearance-none pl-2.5 pr-6 py-1.5 bg-white dark:bg-[#1A222D] border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">Todos los Grados</option>
                {uniqueGrados.map(([gradoName, count]) => (
                  <option key={gradoName} value={gradoName}>
                    {gradoName} ({count})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Filter: Aula */}
            <div className="relative shrink-0 sm:w-36">
              <select
                value={selectedAula}
                onChange={(e) => setSelectedAula(e.target.value)}
                className="w-full appearance-none pl-2.5 pr-6 py-1.5 bg-white dark:bg-[#1A222D] border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">Todas las Aulas</option>
                {uniqueAulas.map(([aulaName, count]) => (
                  <option key={aulaName} value={aulaName}>
                    {aulaName} ({count})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Clear filters trigger if active */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer shrink-0 self-center"
                title="Restablecer filtros"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sub Line: Segmented Status Views + Quick Batch Selection */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            {/* Native Segmented Control */}
            <div className="inline-flex p-0.5 bg-slate-200/60 dark:bg-slate-800/80 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setViewFilter('todos')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  viewFilter === 'todos'
                    ? 'bg-white dark:bg-[#1A222D] text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todos ({totalCount})
              </button>

              <button
                type="button"
                onClick={() => setViewFilter('disponibles')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  viewFilter === 'disponibles'
                    ? 'bg-white dark:bg-[#1A222D] text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Disponibles ({availableCount})
              </button>

              <button
                type="button"
                onClick={() => setViewFilter('seleccionados')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  viewFilter === 'seleccionados'
                    ? 'bg-white dark:bg-[#1A222D] text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Seleccionados ({currentSelectedCount})
              </button>

              {conflictCount > 0 && (
                <button
                  type="button"
                  onClick={() => setViewFilter('conflictos')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    viewFilter === 'conflictos'
                      ? 'bg-white dark:bg-[#1A222D] text-rose-600 dark:text-rose-400 shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Con colisión ({conflictCount})
                </button>
              )}
            </div>

            {/* Quick Batch Actions */}
            <div className="flex items-center gap-3 text-xs">
              {filteredAvailableCount > 0 && (
                <button
                  type="button"
                  onClick={handleSelectFilteredAvailable}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Marcar disponibles ({filteredAvailableCount})
                </button>
              )}

              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectFiltered}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors cursor-pointer"
                >
                  Desmarcar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Student List */}
        <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredEvaluations.length === 0 ? (
            <div className="text-center py-12 px-4 text-xs text-slate-500">
              <p className="font-medium text-slate-700 dark:text-slate-300">
                No hay alumnos que coincidan con la búsqueda
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="mt-2 text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            filteredEvaluations.map((item) => {
              const isSelected = selectedIds.has(item.estudiante.id);
              const isDisabled = item.hasConflict;

              return (
                <div
                  key={item.estudiante.id}
                  onClick={() => !isDisabled && handleToggleStudent(item.estudiante.id, item.hasConflict)}
                  className={`px-6 py-3 transition-colors flex items-center justify-between gap-4 ${
                    isDisabled
                      ? 'opacity-60 cursor-not-allowed bg-slate-50/50 dark:bg-slate-900/20'
                      : isSelected
                      ? 'bg-indigo-50/30 dark:bg-indigo-950/20 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 cursor-pointer'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer'
                  }`}
                >
                  {/* Left: Checkbox & Clean Typography */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => handleToggleStudent(item.estudiante.id, item.hasConflict)}
                      className={`w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-0 ${
                        isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    />

                    <div className="min-w-0 flex-1">
                      {/* Primary Line: Student Name & Matricula */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {item.estudiante.nombre} {item.estudiante.apellido}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {item.estudiante.matricula}
                        </span>
                        {item.estudiante.estado === 'BAJA' && (
                          <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                            Baja temporal
                          </span>
                        )}
                        {item.estudiante.contrato_vigente === false && (
                          <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                            Pendiente contrato
                          </span>
                        )}
                      </div>

                      {/* Secondary Line: Clean unboxed metadata with subtle dots */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.estudiante.grado && <span>{item.estudiante.grado}</span>}
                        {item.estudiante.grado && item.estudiante.aula_regular && (
                          <span aria-hidden="true">·</span>
                        )}
                        {item.estudiante.aula_regular && (
                          <span>{item.estudiante.aula_regular}</span>
                        )}
                        {item.tutor?.nombre && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate max-w-[200px]">
                              Tutor: {item.tutor.nombre}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Conflict explanation inline if applicable */}
                      {isDisabled && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1 font-medium">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{item.conflictMotivo}</span>
                        </div>
                      )}

                      {/* Other workshops inline without pills */}
                      {!isDisabled && item.otherWorkshops.length > 0 && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                          Cursa también:{' '}
                          {item.otherWorkshops.map((w) => w.nombre).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Minimal quiet status */}
                  <div className="shrink-0 text-right">
                    {isDisabled ? (
                      <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                        Ocupado
                      </span>
                    ) : isSelected ? (
                      <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Inscrito</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        Disponible
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Error notice if any */}
        {saveError && (
          <div className="px-6 py-2.5 bg-rose-50 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs">
            {saveError}
          </div>
        )}

        {/* Minimal Footer */}
        <div className="px-6 py-3.5 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-white font-semibold">
              {selectedIds.size}
            </strong>{' '}
            de {totalCount} seleccionados
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              Guardar ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

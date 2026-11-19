import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Lock, Save } from 'lucide-react';
import { Evento, Grupo } from '../../types/attendance';
import { storageService } from '../../services/storage.service';
import { ordenarAlfabetico } from '../../utils/orden';

interface Props {
  evento: Evento;
  grupo: Grupo;
  docente: string;
  /** Versión de los datos, para releer al cambiar */
  version: number;
  abiertoInicial?: boolean;
  onGuardado: (mensaje: string) => void;
}

/** El docente (o ADMIN) marca a los alumnos de su taller que participan en el evento */
export const ParticipantesTaller: React.FC<Props> = ({ evento, grupo, docente, version, abiertoInicial = false, onGuardado }) => {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [error, setError] = useState<string | null>(null);

  const alumnos = useMemo(
    () =>
      ordenarAlfabetico(
        storageService.getEstudiantesByGrupo(grupo.id).filter((e) => e.estado !== 'BAJA'),
        (e) => [e.apellido, e.nombre]
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grupo.id, version]
  );
  const guardados = useMemo(
    () => new Set(storageService.getParticipantesEvento(evento.id).filter((p) => p.grupo_id === grupo.id).map((p) => p.estudiante_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evento.id, grupo.id, version]
  );
  const [seleccion, setSeleccion] = useState<Set<string>>(guardados);
  useEffect(() => setSeleccion(new Set(guardados)), [guardados]);

  const permiso = storageService.puedeElegirParticipantes(evento.id, grupo.id);
  const editable = permiso.puede;
  const cambios = seleccion.size !== guardados.size || [...seleccion].some((id) => !guardados.has(id));

  const alternar = (id: string) => {
    if (!editable) return;
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const guardar = () => {
    setError(null);
    try {
      const r = storageService.guardarParticipantes(evento.id, grupo.id, [...seleccion]);
      onGuardado(
        `${grupo.nombre}: ${seleccion.size} ${seleccion.size === 1 ? 'participante' : 'participantes'} guardados` +
          (r.agregados || r.quitados ? ` (+${r.agregados} / −${r.quitados}).` : '.')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  };

  return (
    <div className="rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] bg-white dark:bg-[#1B222D] overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full px-3.5 sm:px-4 py-3 flex items-center gap-2 text-left hover:bg-slate-50 dark:hover:bg-[#151A22] cursor-pointer"
      >
        {abierto ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-[#172033] dark:text-[#F1F5F9] truncate">{grupo.nombre}</span>
          <span className="block text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">{docente}</span>
        </span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900 shrink-0 tabular-nums">
          {guardados.size} de {alumnos.length}
        </span>
        {!editable && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-label="Solo lectura" />}
      </button>

      {abierto && (
        <div className="border-t border-[#E7EAF0] dark:border-[#2B3442]">
          {!editable && permiso.motivo && (
            <p className="px-3.5 sm:px-4 py-2 text-[11px] text-[#667085] dark:text-[#94A3B8] bg-slate-50 dark:bg-[#151A22] flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              {permiso.motivo}
            </p>
          )}
          {error && (
            <p className="px-3.5 sm:px-4 py-2 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40">{error}</p>
          )}
          {alumnos.length === 0 ? (
            <p className="px-3.5 sm:px-4 py-4 text-[11px] text-[#667085] dark:text-[#94A3B8]">El taller no tiene alumnos activos inscritos.</p>
          ) : (
            <>
              {editable && (
                <div className="px-3.5 sm:px-4 py-2 flex items-center gap-3 text-[11px] border-b border-[#E7EAF0] dark:border-[#2B3442]">
                  <button
                    type="button"
                    onClick={() => setSeleccion(new Set(alumnos.map((a) => a.id)))}
                    className="font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:underline cursor-pointer"
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeleccion(new Set())}
                    className="text-[#667085] hover:text-[#172033] dark:hover:text-[#F1F5F9] cursor-pointer"
                  >
                    Desmarcar
                  </button>
                  <span className="ml-auto text-[#667085] dark:text-[#94A3B8] tabular-nums">
                    {seleccion.size} de {alumnos.length} elegidos
                  </span>
                </div>
              )}
              <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442] max-h-80 overflow-y-auto">
                {alumnos.map((a) => {
                  const marcado = seleccion.has(a.id);
                  return (
                    <li key={a.id}>
                      <label
                        className={`flex items-center gap-2.5 px-3.5 sm:px-4 py-2 min-h-11 ${
                          editable ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-[#151A22]' : ''
                        } ${marcado ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={!editable}
                          onChange={() => alternar(a.id)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer disabled:cursor-default"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">
                            {a.apellido}, {a.nombre}
                          </span>
                          <span className="block text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">
                            {a.grado || 'Sin grado'} · {a.aula_regular || 'Sin sección'}
                          </span>
                        </span>
                        {!editable && marcado && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {editable && (
                <div className="px-3.5 sm:px-4 py-2.5 border-t border-[#E7EAF0] dark:border-[#2B3442] flex justify-end gap-2">
                  {cambios && (
                    <button
                      type="button"
                      onClick={() => setSeleccion(new Set(guardados))}
                      className="px-3 py-1.5 text-[11px] font-semibold text-[#667085] cursor-pointer"
                    >
                      Descartar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={guardar}
                    disabled={!cambios}
                    className="px-4 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Guardar participantes
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

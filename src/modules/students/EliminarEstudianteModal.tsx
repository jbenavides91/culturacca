import React, { useMemo, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Estudiante } from '../../types/attendance';
import { storageService } from '../../services/storage.service';

interface EliminarEstudianteModalProps {
  estudiante: Estudiante;
  onClose: () => void;
  /** Recibe el mensaje para el toast */
  onEliminado: (mensaje: string) => void;
}

/** Confirmación para eliminar definitivamente a un alumno (solo ADMIN) */
export const EliminarEstudianteModal: React.FC<EliminarEstudianteModalProps> = ({ estudiante, onClose, onEliminado }) => {
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resumen = useMemo(() => storageService.resumenEliminacionEstudiante(estudiante.id), [estudiante.id]);
  const nombre = `${estudiante.nombre} ${estudiante.apellido}`.trim();
  const codigo = estudiante.matricula.trim().toUpperCase();

  // Si se pierde historial o dinero cobrado, se exige escribir el código del alumno
  const requiereCodigo = resumen.asistencias > 0 || resumen.anotaciones > 0 || resumen.solicitudesCobradas > 0;
  const codigoOk = !requiereCodigo || confirmacion.trim().toUpperCase() === codigo;

  const handleEliminar = () => {
    setError(null);
    try {
      const res = storageService.eliminarEstudiante(estudiante.id);
      onEliminado(
        `"${res.nombre}" fue eliminado definitivamente${
          res.solicitudes > 0 ? `, con ${res.solicitudes} solicitud${res.solicitudes === 1 ? '' : 'es'} de matrícula` : ''
        }${res.tutorEliminado ? ' y su tutor' : ''}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar al alumno.');
    }
  };

  const filas: { etiqueta: string; valor: string }[] = [
    {
      etiqueta: 'Talleres (se desinscribe)',
      valor: resumen.talleres.length > 0 ? resumen.talleres.join(', ') : 'Ninguno',
    },
    { etiqueta: 'Registros de asistencia', valor: String(resumen.asistencias) },
    { etiqueta: 'Anotaciones del anecdotario', valor: String(resumen.anotaciones) },
    {
      etiqueta: 'Solicitudes de matrícula',
      valor:
        resumen.solicitudes > 0
          ? `${resumen.solicitudes}${resumen.solicitudesCobradas > 0 ? ` (${resumen.solicitudesCobradas} cobradas)` : ''}`
          : '0',
    },
    { etiqueta: 'Participaciones en eventos', valor: String(resumen.participacionesEventos) },
    {
      etiqueta: 'Tutor',
      valor: !resumen.tutorNombre
        ? 'Sin tutor'
        : resumen.tutorCompartido
        ? `${resumen.tutorNombre} (se conserva: tiene otros alumnos)`
        : `${resumen.tutorNombre} (también se elimina)`,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="eliminar-estudiante-titulo"
        className="bg-white dark:bg-[#141A23] rounded-2xl shadow-xl max-w-md w-full max-h-[92vh] overflow-y-auto border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100"
      >
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <h3 id="eliminar-estudiante-titulo" className="text-sm font-semibold text-slate-900 dark:text-white">
              Eliminar alumno
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 text-xs">
          <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3.5 rounded-xl border border-rose-200/80 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {nombre} ({codigo})
            </p>
            <p className="text-[11px] leading-relaxed">
              Esta acción es <strong>permanente</strong> y no se puede deshacer. Se borran el expediente y todo su
              historial, incluidas las matrículas ya cobradas (dejarán de aparecer en Recibos). Si el alumno solo se
              retira por un tiempo, use <strong>Dar de baja</strong>.
            </p>
          </div>

          <dl className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {filas.map((f) => (
              <div key={f.etiqueta} className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-slate-500 dark:text-slate-400">{f.etiqueta}</dt>
                <dd className="font-semibold text-right">{f.valor}</dd>
              </div>
            ))}
          </dl>

          {requiereCodigo && (
            <div>
              <label htmlFor="confirmar-codigo" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Para confirmar, escriba el código del alumno: <span className="font-mono font-bold">{codigo}</span>
              </label>
              <input
                id="confirmar-codigo"
                type="text"
                autoComplete="off"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1A222D] p-2 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
          )}

          {error && (
            <p className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleEliminar}
              disabled={!codigoOk}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar definitivamente</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

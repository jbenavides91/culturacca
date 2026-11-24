import React, { useMemo, useState } from 'react';
import { ArrowRight, CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { storageService } from '../../services/storage.service';
import { Asistencia, Grupo, Perfil, Sesion } from '../../types/attendance';
import { fechaLocalISO } from '../../utils/fechas';
import { compararTexto } from '../../utils/orden';
import {
  BadgeExtra,
  construirFilasEstatus,
  ESTADOS,
  horaLocal,
  puedePasarLista,
  sumarDias,
} from './attendanceStatus.shared';

interface TalleresDelDiaCardProps {
  grupos: Grupo[];
  sesiones: Sesion[];
  asistencias: Asistencia[];
  perfiles: Perfil[];
  onPasarLista: (grupoId: string, sesionId: string) => void;
  onVerTalleres: () => void;
}

const TIPO_NO_LECTIVO: Record<string, string> = {
  FERIADO: 'Feriado',
  VACACIONES: 'Vacaciones',
  OTRO: 'Día no lectivo',
};

/** "martes 24 nov", leyendo YYYY-MM-DD como fecha local */
const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
};

const botonFlecha =
  'w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-[#E7EAF0] dark:border-[#2B3442] text-[#667085] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#151A22] transition-colors cursor-pointer';

/** Talleres que tienen clase en un día, navegable con ◀ ▶ (abre siempre en hoy). */
export const TalleresDelDiaCard: React.FC<TalleresDelDiaCardProps> = ({
  grupos,
  sesiones,
  asistencias,
  perfiles,
  onPasarLista,
  onVerTalleres,
}) => {
  const ahora = new Date();
  const hoyStr = fechaLocalISO(ahora);
  const horaActual = horaLocal(ahora);
  const [fecha, setFecha] = useState(hoyStr);

  const sesionesDelDia = useMemo(() => sesiones.filter((s) => s.fecha === fecha), [sesiones, fecha]);

  const filas = useMemo(
    () =>
      construirFilasEstatus(grupos, sesionesDelDia, asistencias, perfiles, hoyStr, horaActual).sort(
        (a, b) =>
          a.sesion.hora_inicio.localeCompare(b.sesion.hora_inicio) || compararTexto(a.grupo.nombre, b.grupo.nombre)
      ),
    [grupos, sesionesDelDia, asistencias, perfiles, hoyStr, horaActual]
  );

  const totalAlumnos = filas.reduce((n, f) => n + f.inscritos, 0);
  const noLectivo = filas.length === 0 ? storageService.diaNoLectivoDe(fecha) : undefined;

  const relativo =
    fecha === hoyStr ? 'Hoy' : fecha === sumarDias(hoyStr, -1) ? 'Ayer' : fecha === sumarDias(hoyStr, 1) ? 'Mañana' : '';

  return (
    <div className="lg:col-span-2 bg-white dark:bg-[#1B222D] rounded-xl border border-[#E7EAF0] dark:border-[#2B3442] overflow-hidden shadow-xs">
      {/* Encabezado con navegación por días */}
      <div className="p-3.5 sm:p-5 border-b border-[#E7EAF0] dark:border-[#2B3442] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">Talleres del día</h2>
          <button
            type="button"
            onClick={onVerTalleres}
            className="text-xs font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Ver talleres</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFecha((f) => sumarDias(f, -1))}
            className={botonFlecha}
            aria-label="Día anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-sm sm:text-base font-bold text-[#172033] dark:text-[#F1F5F9] truncate">
              {relativo && <span className="text-[#4F46E5] dark:text-[#818CF8]">{relativo} · </span>}
              <span className="capitalize">{fechaLarga(fecha)}</span>
            </div>
            <div className="text-[11px] text-[#667085] dark:text-[#94A3B8] tabular-nums">
              {filas.length === 1 ? '1 taller' : `${filas.length} talleres`} ·{' '}
              {totalAlumnos === 1 ? '1 alumno' : `${totalAlumnos} alumnos`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFecha((f) => sumarDias(f, 1))}
            className={botonFlecha}
            aria-label="Día siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {fecha !== hoyStr && (
            <button
              type="button"
              onClick={() => setFecha(hoyStr)}
              className="h-11 sm:h-8 px-3 text-xs font-semibold rounded-lg bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8] hover:bg-[#E0E7FF] dark:hover:bg-indigo-950 transition-colors cursor-pointer"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {/* Lista de talleres del día */}
      {filas.length === 0 ? (
        <div className="px-4 py-10 flex flex-col items-center text-center gap-2">
          <CalendarOff className="w-6 h-6 text-slate-300 dark:text-slate-600" />
          <p className="text-xs font-semibold text-[#667085] dark:text-[#94A3B8]">No hay talleres este día</p>
          {noLectivo && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              {TIPO_NO_LECTIVO[noLectivo.tipo] ?? 'Día no lectivo'}: {noLectivo.motivo}
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-[#E7EAF0] dark:divide-[#2B3442]">
          {filas.map((f) => {
            const est = ESTADOS[f.estado];
            return (
              <li
                key={f.sesion.id}
                className="px-3.5 sm:px-5 py-3 flex items-start sm:items-center gap-3 hover:bg-slate-50/70 dark:hover:bg-[#151A22]/70 transition-colors"
              >
                <div className="w-16 sm:w-24 shrink-0 font-mono text-[11px] text-[#667085] dark:text-[#94A3B8] tabular-nums pt-0.5 sm:pt-0">
                  {f.sesion.hora_inicio}
                  <span className="hidden sm:inline"> – </span>
                  <br className="sm:hidden" />
                  {f.sesion.hora_fin}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs sm:text-sm font-semibold text-[#172033] dark:text-[#F1F5F9] flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{f.grupo.nombre}</span>
                    {f.sesion.extraordinaria && <BadgeExtra />}
                  </div>
                  <div className="text-[11px] text-[#667085] dark:text-[#94A3B8] truncate">
                    {f.docente} · {f.grupo.aula || 'Taller Principal'} · {f.inscritos}{' '}
                    {f.inscritos === 1 ? 'alumno' : 'alumnos'}
                  </div>
                  {/* Estado y acción debajo en móvil */}
                  <div className="flex items-center gap-2 mt-1.5 sm:hidden">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${est.className}`}
                    >
                      {est.icon}
                      {est.label}
                    </span>
                  </div>
                </div>
                <span
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${est.className}`}
                >
                  {est.icon}
                  {est.label}
                </span>
                <div className="shrink-0 sm:w-24 text-right">
                  {puedePasarLista(f.estado) && (
                    <button
                      type="button"
                      onClick={() => onPasarLista(f.grupo.id, f.sesion.id)}
                      className="px-2.5 py-1.5 sm:py-1 text-xs font-semibold rounded bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#818CF8] hover:bg-[#E0E7FF] dark:hover:bg-indigo-950 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {f.estado === 'TOMADA' ? 'Cerrar sesión' : 'Pasar lista'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/** Resumen de un recálculo del calendario de talleres (cortes o días no lectivos) */
export interface ResumenCalendario {
  sesionesAgregadas: number;
  sesionesEliminadas: number;
  sesionesConservadas: number;
}

/** Texto para el mensaje de éxito: qué clases se agregaron, quitaron o conservaron */
export const resumenCambios = (r: ResumenCalendario): string => {
  const partes: string[] = [];
  if (r.sesionesAgregadas > 0) partes.push(`se agregaron ${r.sesionesAgregadas} clase(s)`);
  if (r.sesionesEliminadas > 0) partes.push(`se quitaron ${r.sesionesEliminadas} clase(s)`);
  if (r.sesionesConservadas > 0)
    partes.push(`${r.sesionesConservadas} clase(s) se conservaron porque ya están cerradas o tienen asistencia`);
  return partes.length > 0 ? ` En el calendario de los talleres ${partes.join('; ')}.` : ' El calendario de los talleres no cambió.';
};

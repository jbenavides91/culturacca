import { supabase } from './supabase.client';
import { syncStore } from './supabase.sync';

/**
 * Avisos de asistencia a los tutores. Los envía la Edge Function `notificar-asistencia`
 * desde la cuenta Gmail institucional (la misma de `correo-matricula`). El navegador solo
 * manda ids: la función toma destinatarios y contenido de la base de datos, no repite avisos
 * ya enviados y deja una fila en `log_notificaciones` por intento (llega por realtime).
 */
export type SolicitudAviso =
  | { tipo: 'INICIAL'; sesion_id: string }
  | { tipo: 'RECTIFICACION'; asistencia_id: string };

export interface ResultadoAvisos {
  enviados: number;
  errores: number;
  omitidos: { estudiante: string; motivo: string }[];
  /** Error del envío (cuenta sin configurar, Gmail rechazó, sin conexión…) */
  error?: string;
}

interface RespuestaFuncion {
  ok?: boolean;
  enviados?: number;
  errores?: number;
  omitidos?: { estudiante: string; motivo: string }[];
  error?: string;
}

class NotificationService {
  async notificarAsistencia(solicitud: SolicitudAviso): Promise<ResultadoAvisos> {
    // La función lee la sesión y las asistencias de la base de datos: primero subir lo pendiente
    await syncStore.flush();

    const { data, error } = await supabase.functions.invoke<RespuestaFuncion>('notificar-asistencia', {
      body: solicitud,
    });

    let mensaje: string | undefined = data?.error;
    if (error) {
      mensaje = error.message;
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const payload = (await context.json()) as RespuestaFuncion;
          if (payload?.error) mensaje = payload.error;
        } catch {
          // ignorar
        }
      }
    }

    return {
      enviados: data?.enviados ?? 0,
      errores: data?.errores ?? (error ? 1 : 0),
      omitidos: data?.omitidos ?? [],
      error: mensaje,
    };
  }
}

export const notificationService = new NotificationService();

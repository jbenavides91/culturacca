import { Grupo, Sesion } from '../types/attendance';
import { getAccessToken } from './auth.service';
import { nombreInstitucion } from '../utils/institucion';

export interface CalendarSyncResult {
  success: boolean;
  syncedEventsCount: number;
  message: string;
  errors?: string[];
}

class CalendarService {
  /**
   * Sincroniza una sesión individual con Google Calendar usando la API REST
   */
  async syncSessionEvent(
    grupo: Grupo,
    sesion: Sesion,
    instructorName: string
  ): Promise<{ eventId: string; htmlLink?: string }> {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Se requiere iniciar sesión con Google para sincronizar con Google Calendar.');
    }

    const startDateTime = `${sesion.fecha}T${sesion.hora_inicio}:00`;
    const endDateTime = `${sesion.fecha}T${sesion.hora_fin}:00`;

    const eventPayload = {
      summary: `${grupo.nombre} • Clase Vespertina`,
      description: `Sesión de arte y cultura impartida por ${instructorName}.\nAula: ${
        grupo.aula || 'Taller Principal'
      }\nEstado de Sesión: ${sesion.cerrada ? 'Finalizada y Cerrada' : 'Programada'}\n${nombreInstitucion()} · Cultura CCA.`,
      location: grupo.aula ? `${grupo.aula}, ${nombreInstitucion()}` : nombreInstitucion(),
      start: {
        dateTime: new Date(startDateTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: new Date(endDateTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 120 },
        ],
      },
      colorId: '6', // Tangerine / Terracotta in Google Calendar palette
    };

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `Error al crear evento en Google Calendar: ${response.statusText}`
      );
    }

    const createdEvent = await response.json();
    return {
      eventId: createdEvent.id,
      htmlLink: createdEvent.htmlLink,
    };
  }

  /**
   * Sincroniza en lote todas las sesiones de un taller
   */
  async syncBatchSessions(
    grupo: Grupo,
    sesiones: Sesion[],
    instructorName: string
  ): Promise<CalendarSyncResult> {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return {
        success: false,
        syncedEventsCount: 0,
        message: 'No hay sesión de Google activa con los permisos necesarios.',
      };
    }

    let successCount = 0;
    const errors: string[] = [];

    for (const sesion of sesiones) {
      try {
        await this.syncSessionEvent(grupo, sesion, instructorName);
        successCount++;
      } catch (err: unknown) {
        errors.push(`Fecha ${sesion.fecha}: ${err instanceof Error ? err.message : 'Error desconocido'}`);
      }
    }

    return {
      success: successCount > 0,
      syncedEventsCount: successCount,
      message:
        successCount === sesiones.length
          ? `Se sincronizaron exitosamente ${successCount} sesiones con tu Google Calendar.`
          : `Se sincronizaron ${successCount} de ${sesiones.length} sesiones.`,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

export const calendarService = new CalendarService();

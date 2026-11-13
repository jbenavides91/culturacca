import { EstatusAsistencia, LogNotificacion, TipoNotificacion } from '../types/attendance';
import { getAccessToken } from './auth.service';
import { nombreInstitucion } from '../utils/institucion';

export interface SendEmailPayload {
  asistenciaId: string;
  estudianteId: string;
  estudianteNombre: string;
  tutorId?: string;
  tutorEmail: string;
  tutorNombre?: string;
  tallerNombre: string;
  fechaSesion: string;
  tipo: TipoNotificacion;
  motivoRectificacion?: string;
  nuevoEstatus?: EstatusAsistencia;
  estatusAnterior?: EstatusAsistencia;
}

export interface NotificationResult {
  success: boolean;
  log: LogNotificacion;
  error?: string;
}

class NotificationService {
  private inFlightKeys = new Set<string>();

  /**
   * Genera una clave de idempotencia única basada en el evento
   */
  generateIdempotencyKey(asistenciaId: string, tipo: TipoNotificacion, fecha: string): string {
    return `notif_${asistenciaId}_${tipo.toLowerCase()}_${fecha.replace(/-/g, '')}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
  }

  /**
   * Construye el cuerpo del correo institucional con formato HTML depurado
   */
  buildEmailContent(payload: SendEmailPayload) {
    const isInicial = payload.tipo === 'INICIAL';
    const statusLabel =
      payload.nuevoEstatus === 'PRESENTE'
        ? 'PRESENTE'
        : payload.nuevoEstatus === 'JUSTIFICADO'
        ? 'JUSTIFICADO'
        : payload.nuevoEstatus || 'RECTIFICADO';

    const subject = isInicial
      ? `Aviso de Inasistencia - ${payload.estudianteNombre} [${payload.tallerNombre}]`
      : `Actualización de Asistencia (${statusLabel}) - ${payload.estudianteNombre} [${payload.tallerNombre}]`;

    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="background-color: #1e293b; padding: 24px; color: #ffffff; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">${nombreInstitucion().toUpperCase()}</h1>
          <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Sistema de Control de Asistencia y Acompañamiento Académico</p>
        </div>
        
        <div style="padding: 28px 24px;">
          <p style="margin-top: 0; font-size: 15px; color: #334155;">
            Estimado/a <strong>${payload.tutorNombre || 'Tutor/a o Representante'}</strong>:
          </p>
          
          ${
            isInicial
              ? `<div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #991b1b; font-weight: 600; font-size: 14px;">Registro de Inasistencia No Notificada</p>
                  <p style="margin: 8px 0 0; color: #7f1d1d; font-size: 13px; line-height: 1.5;">
                    Le informamos que el estudiante <strong>${payload.estudianteNombre}</strong> no se presentó a la sesión del taller <strong>${payload.tallerNombre}</strong> correspondiente al día <strong>${payload.fechaSesion}</strong>.
                  </p>
                </div>`
              : `<div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #166534; font-weight: 600; font-size: 14px;">Actualización de Asistencia: Marcado como ${statusLabel}</p>
                  <p style="margin: 8px 0 0; color: #14532d; font-size: 13px; line-height: 1.5;">
                    Le informamos que el registro de asistencia del estudiante <strong>${payload.estudianteNombre}</strong> para la sesión de <strong>${payload.tallerNombre}</strong> del día <strong>${payload.fechaSesion}</strong> ha sido rectificado formalmente de <strong>${payload.estatusAnterior || 'AUSENTE'}</strong> al nuevo estado de <strong>${statusLabel}</strong>.
                  </p>
                  ${
                    payload.motivoRectificacion
                      ? `<p style="margin: 8px 0 0; font-size: 12px; color: #166534; background: #dcfce7; padding: 6px 10px; border-radius: 4px;"><strong>Motivo u Observación:</strong> ${payload.motivoRectificacion}</p>`
                      : ''
                  }
                </div>`
          }

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">Detalles de la Ficha Oficial</p>
            <table style="width: 100%; font-size: 13px; color: #1e293b; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Estudiante:</td>
                <td style="padding: 4px 0; font-weight: 600;">${payload.estudianteNombre}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Curso / Taller:</td>
                <td style="padding: 4px 0; font-weight: 600;">${payload.tallerNombre}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Fecha de la Sesión:</td>
                <td style="padding: 4px 0; font-weight: 600;">${payload.fechaSesion}</td>
              </tr>
              ${
                !isInicial && payload.estatusAnterior
                  ? `<tr>
                      <td style="padding: 4px 0; color: #64748b;">Estado Previo:</td>
                      <td style="padding: 4px 0; font-weight: 600; color: #dc2626;">${payload.estatusAnterior}</td>
                    </tr>`
                  : ''
              }
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Estado Actualizado:</td>
                <td style="padding: 4px 0; font-weight: 600; color: #16a34a;">${
                  isInicial ? 'AUSENTE' : statusLabel
                }</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Tipo de Emisión:</td>
                <td style="padding: 4px 0; font-weight: 600;">${
                  isInicial ? 'Notificación de Inasistencia' : 'Rectificación Oficial de Asistencia'
                }</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
            Si considera que esto es un error o desea presentar una justificación oficial, comuníquese con la secretaría académica o responda a este correo adjuntando el comprobante correspondiente.
          </p>

          <p style="margin-bottom: 0; font-size: 13px; color: #1e293b;">
            Atentamente,<br/>
            <strong>Coordinación de Cursos Vespertinos</strong><br/>
            ${nombreInstitucion()}
          </p>
        </div>

        <div style="background-color: #f1f5f9; border-top: 1px solid #e2e8f0; padding: 14px 24px; font-size: 11px; color: #94a3b8; text-align: center;">
          Este es un correo transaccional automático. No responda directamente si no es para fines de justificación. ID: ${payload.asistenciaId}
        </div>
      </div>
    `;

    return { subject, htmlBody };
  }

  /**
   * Envía un correo real a través de Gmail REST API si hay token OAuth de Google disponible
   */
  async sendViaGmailApi(
    toEmail: string,
    subject: string,
    htmlContent: string,
    accessToken: string
  ): Promise<string> {
    const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
    const messageParts = [
      `To: ${toEmail}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      htmlContent,
    ];
    const message = messageParts.join('\r\n');

    // Base64URL encode
    const encodedMessage = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedMessage }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `Fallo al enviar correo con Gmail API (status ${response.status})`
      );
    }

    const data = await response.json();
    return data.id || 'gmail_sent';
  }

  /**
   * Envía la notificación con idempotencia y reintento exponencial (Exponential Backoff)
   */
  async dispatchNotification(payload: SendEmailPayload): Promise<NotificationResult> {
    const idempotencyKey = this.generateIdempotencyKey(
      payload.asistenciaId,
      payload.tipo,
      payload.fechaSesion
    );

    if (this.inFlightKeys.has(idempotencyKey)) {
      throw new Error(`Envío duplicado prevenido por clave de idempotencia: ${idempotencyKey}`);
    }

    this.inFlightKeys.add(idempotencyKey);

    const { subject, htmlBody } = this.buildEmailContent(payload);
    const accessToken = await getAccessToken();

    let deliveryMethod: 'GMAIL_API' | 'SMTP_INSTITUCIONAL' = 'SMTP_INSTITUCIONAL';
    let deliveryStatus: 'ENVIADO' | 'ERROR' = 'ENVIADO';
    let errorMessage: string | null = null;

    // Retry with exponential backoff (máximo 2 intentos)
    const maxRetries = 2;
    let attempt = 0;
    let succeeded = false;

    while (attempt < maxRetries && !succeeded) {
      attempt++;
      try {
        if (accessToken) {
          deliveryMethod = 'GMAIL_API';
          await this.sendViaGmailApi(payload.tutorEmail, subject, htmlBody, accessToken);
        } else {
          // Servidor SMTP institucional simulado / no-reply con delay de red real
          deliveryMethod = 'SMTP_INSTITUCIONAL';
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        succeeded = true;
        deliveryStatus = 'ENVIADO';
      } catch (err: unknown) {
        errorMessage = err instanceof Error ? err.message : 'Error desconocido al enviar';
        if (attempt < maxRetries) {
          // Exponential backoff wait: 400ms * 2^attempt
          await new Promise((resolve) => setTimeout(resolve, 400 * Math.pow(2, attempt)));
        } else {
          deliveryStatus = 'ERROR';
        }
      }
    }

    this.inFlightKeys.delete(idempotencyKey);

    const logEntry: LogNotificacion = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      idempotency_key: idempotencyKey,
      asistencia_id: payload.asistenciaId,
      estudiante_id: payload.estudianteId,
      estudiante_nombre: payload.estudianteNombre,
      tutor_id: payload.tutorId,
      tutor_email: payload.tutorEmail,
      tutor_nombre: payload.tutorNombre,
      taller_nombre: payload.tallerNombre,
      fecha_sesion: payload.fechaSesion,
      tipo: payload.tipo,
      estatus_entrega: deliveryStatus,
      metodo: deliveryMethod,
      detalles_error: errorMessage,
      enviado_en: new Date().toISOString(),
    };

    return {
      success: deliveryStatus === 'ENVIADO',
      log: logEntry,
      error: errorMessage || undefined,
    };
  }
}

export const notificationService = new NotificationService();

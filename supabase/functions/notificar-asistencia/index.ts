// Supabase Edge Function: notificar-asistencia
// Envía a los tutores los avisos de asistencia desde la cuenta Gmail institucional
// (SMTP smtp.gmail.com:465 con contraseña de aplicación), igual que correo-matricula:
//  - INICIAL: al cerrar una lista, un aviso por cada alumno AUSENTE de la sesión.
//  - RECTIFICACION: cuando una falta de una sesión cerrada pasa a PRESENTE o JUSTIFICADO.
//
// Seguridad: el navegador solo envía ids. Destinatarios y contenido salen de la base de datos,
// así que la función no sirve para mandar correos arbitrarios. Pueden invocarla un ADMIN activo
// o el PROFESOR dueño del taller (mismo alcance que la RLS de log_notificaciones).
//
// Idempotencia: cada aviso tiene una clave determinista (inicial:<asistencia> o
// rect:<asistencia>:<actualizado_en>). Si ya hay un registro ENVIADO con esa clave no se repite,
// así que reintentar es seguro. Cada intento deja una fila en log_notificaciones.
//
// Secretos: GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_FROM_NAME (opcional), ALLOWED_ORIGINS.
// Despliegue: MCP deploy_edge_function (name notificar-asistencia, verify_jwt: false).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const ORIGENES_PERMITIDOS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

function corsPara(req: Request): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (ORIGENES_PERMITIDOS.length === 0) return { ...base, 'Access-Control-Allow-Origin': '*' };
  const origen = req.headers.get('Origin') ?? '';
  return ORIGENES_PERMITIDOS.includes(origen)
    ? { ...base, 'Access-Control-Allow-Origin': origen, Vary: 'Origin' }
    : { ...base, Vary: 'Origin' };
}

type Json = Record<string, unknown>;

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const cors = corsPara(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const respuesta = await manejar(req);
  const headers = new Headers(respuesta.headers);
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
  return new Response(respuesta.body, { status: respuesta.status, headers });
});

// ---------- Correo automático: "no responder" ----------
// Ningún correo impide pulsar "Responder": se marca como automático en el remitente, una franja,
// el pie y el texto plano, y se pide a los servidores que no envíen respuestas automáticas.
const FRANJA_NO_RESPONDER =
  '<div style="background:#fffbeb;border-bottom:1px solid #fde68a;padding:10px 24px;font-size:12px;color:#92400e;text-align:center;">Correo automático · Por favor, no responda a este mensaje.</div>';
const PIE_NO_RESPONDER =
  'Este es un correo automático y esta dirección no recibe respuestas. Para cualquier consulta, comuníquese con la coordinación del colegio.';
const TEXTO_NO_RESPONDER = '\n\nCorreo automático: no responda a este mensaje.';
const ENCABEZADOS_NO_RESPONDER = { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' };
/** "Nombre - No responder <cuenta>" (sin paréntesis: en un remitente sin comillas serían un comentario) */
const remitenteNoResponder = (nombre: string, cuenta: string) => {
  const limpio = nombre.replace(/[<>"()]/g, '').trim();
  return `${/responder/i.test(limpio) ? limpio : `${limpio} - No responder`} <${cuenta}>`;
};

// ---------- Utilidades ----------

const escaparHtml = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Direcciones de relleno que la app crea cuando no se escribió el correo del tutor */
const esCorreoDeRelleno = (email: string) => {
  const e = email.trim().toLowerCase();
  return e === 'familiar@cca.edu.ni' || e.endsWith('@familiar.cca.edu.ni');
};

/** "lunes, 23 de noviembre de 2026" a partir de YYYY-MM-DD (sin desfase de zona horaria) */
const fechaSesionLarga = (fecha: string) => {
  const [y, m, d] = String(fecha).split('-').map(Number);
  if (!y || !m || !d) return String(fecha);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

// ---------- Correo ----------

interface DatosAviso {
  institucion: string;
  tipo: 'INICIAL' | 'RECTIFICACION';
  tutor: string;
  alumno: string;
  taller: string;
  fecha: string;
  nuevoEstatus?: string;
  motivo?: string;
}

function construirAviso(d: DatosAviso): { asunto: string; html: string; texto: string } {
  const inicial = d.tipo === 'INICIAL';
  const estado = d.nuevoEstatus === 'JUSTIFICADO' ? 'JUSTIFICADO' : 'PRESENTE';
  const asunto = inicial
    ? `Aviso de inasistencia – ${d.alumno} (${d.taller})`
    : `Asistencia corregida (${estado}) – ${d.alumno} (${d.taller})`;
  const texto = inicial
    ? `${d.alumno} no asistió a la sesión de ${d.taller} del ${d.fecha}.`
    : `La falta de ${d.alumno} en ${d.taller} del ${d.fecha} se corrigió a ${estado}.`;

  const bloque = inicial
    ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:20px 0;border-radius:4px;">
         <p style="margin:0;color:#991b1b;font-weight:600;font-size:14px;">Registro de inasistencia</p>
         <p style="margin:8px 0 0;color:#7f1d1d;font-size:13px;line-height:1.5;">
           Le informamos que <strong>${escaparHtml(d.alumno)}</strong> no asistió a la sesión del taller
           <strong>${escaparHtml(d.taller)}</strong> del <strong>${escaparHtml(d.fecha)}</strong>.
         </p>
       </div>`
    : `<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;margin:20px 0;border-radius:4px;">
         <p style="margin:0;color:#166534;font-weight:600;font-size:14px;">Asistencia corregida: ${estado}</p>
         <p style="margin:8px 0 0;color:#14532d;font-size:13px;line-height:1.5;">
           La asistencia de <strong>${escaparHtml(d.alumno)}</strong> en la sesión de <strong>${escaparHtml(d.taller)}</strong>
           del <strong>${escaparHtml(d.fecha)}</strong> se corrigió de <strong>AUSENTE</strong> a <strong>${estado}</strong>.
         </p>
         ${
           d.motivo
             ? `<p style="margin:8px 0 0;font-size:12px;color:#166534;background:#dcfce7;padding:6px 10px;border-radius:4px;"><strong>Motivo:</strong> ${escaparHtml(d.motivo)}</p>`
             : ''
         }
       </div>`;

  const html = `
  <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    <div style="background:#1e293b;padding:24px;color:#ffffff;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.5px;">${escaparHtml(d.institucion.toUpperCase())}</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Talleres de Arte y Cultura · Control de asistencia</p>
    </div>
    ${FRANJA_NO_RESPONDER}
    <div style="padding:28px 24px;">
      <p style="margin-top:0;font-size:15px;color:#334155;">Estimado/a <strong>${escaparHtml(d.tutor || 'tutor/a')}</strong>:</p>
      ${bloque}
      <table style="width:100%;font-size:13px;color:#1e293b;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
        <tr><td style="padding:8px 12px;color:#64748b;">Alumno</td><td style="padding:8px 12px;font-weight:600;">${escaparHtml(d.alumno)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;">Taller</td><td style="padding:8px 12px;font-weight:600;">${escaparHtml(d.taller)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;">Fecha de la sesión</td><td style="padding:8px 12px;font-weight:600;">${escaparHtml(d.fecha)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;">Estado</td><td style="padding:8px 12px;font-weight:600;color:${inicial ? '#dc2626' : '#16a34a'};">${inicial ? 'AUSENTE' : estado}</td></tr>
      </table>
      <p style="font-size:13px;color:#64748b;line-height:1.5;margin-top:20px;">
        ${
          inicial
            ? 'Si la falta tiene justificación, comuníquese con el docente del taller o con la coordinación del colegio.'
            : 'No es necesario hacer nada más. Gracias por su atención.'
        }
      </p>
      <p style="margin-bottom:0;font-size:13px;color:#1e293b;">
        Atentamente,<br/><strong>Coordinación de Arte y Cultura</strong><br/>${escaparHtml(d.institucion)}
      </p>
    </div>
    <div style="background:#f1f5f9;border-top:1px solid #e2e8f0;padding:14px 24px;font-size:11px;color:#94a3b8;text-align:center;">
      ${PIE_NO_RESPONDER}
    </div>
  </div>`;

  return { asunto, html, texto };
}

// ---------- Manejador ----------

interface Aviso {
  clave: string;
  asistenciaId: string;
  estudianteId: string;
  alumno: string;
  tutorId: string | null;
  tutorNombre: string;
  tutorEmail: string;
  nuevoEstatus?: string;
  motivo?: string;
}

async function manejar(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const gmailUser = Deno.env.get('GMAIL_USER') ?? '';
  const gmailPassword = (Deno.env.get('GMAIL_APP_PASSWORD') ?? '').replace(/\s+/g, '');

  // 1. Verificar quién llama
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sesión no válida' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: caller } = await admin
    .from('perfiles')
    .select('id, rol, activo')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!caller || caller.activo === false || !['ADMIN', 'PROFESOR'].includes(String(caller.rol))) {
    return json({ error: 'No tiene permiso para enviar avisos de asistencia.' }, 403);
  }

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo de solicitud inválido' }, 400);
  }
  const tipo = body.tipo === 'RECTIFICACION' ? 'RECTIFICACION' : body.tipo === 'INICIAL' ? 'INICIAL' : null;
  if (!tipo) return json({ error: 'Tipo de aviso no válido.' }, 400);

  // 2. Sesión y asistencias a notificar
  let sesionId: string;
  let asistencias: Record<string, unknown>[];
  if (tipo === 'INICIAL') {
    sesionId = String(body.sesion_id ?? '').trim();
    if (!sesionId) return json({ error: 'Falta la sesión.' }, 400);
    const { data, error } = await admin
      .from('asistencias')
      .select('id, estudiante_id, estatus, motivo_justificacion, actualizado_en')
      .eq('sesion_id', sesionId)
      .eq('estatus', 'AUSENTE');
    if (error) return json({ error: error.message }, 500);
    asistencias = data ?? [];
  } else {
    const asistenciaId = String(body.asistencia_id ?? '').trim();
    if (!asistenciaId) return json({ error: 'Falta la asistencia.' }, 400);
    const { data, error } = await admin
      .from('asistencias')
      .select('id, sesion_id, estudiante_id, estatus, motivo_justificacion, actualizado_en')
      .eq('id', asistenciaId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: 'La asistencia no existe (¿aún no se guardó?).' }, 404);
    if (!['PRESENTE', 'JUSTIFICADO'].includes(String(data.estatus))) {
      return json({ error: 'Solo se avisa cuando una falta se corrige a Presente o Justificado.' }, 400);
    }
    sesionId = String(data.sesion_id);
    asistencias = [data];
  }

  const { data: sesion } = await admin
    .from('sesiones')
    .select('id, grupo_id, fecha, cerrada')
    .eq('id', sesionId)
    .maybeSingle();
  if (!sesion) return json({ error: 'La sesión no existe (¿aún no se guardó?).' }, 404);
  if (!sesion.cerrada) return json({ error: 'La sesión aún no está cerrada.' }, 400);

  const { data: grupo } = await admin
    .from('grupos')
    .select('nombre, profesor_id')
    .eq('id', sesion.grupo_id)
    .maybeSingle();
  if (caller.rol === 'PROFESOR' && grupo?.profesor_id !== caller.id) {
    return json({ error: 'Solo el docente del taller o un administrador puede enviar estos avisos.' }, 403);
  }

  if (asistencias.length === 0) return json({ ok: true, enviados: 0, errores: 0, omitidos: [] });

  // 3. Alumnos y tutores (siempre de la base de datos)
  const idsAlumno = [...new Set(asistencias.map((a) => String(a.estudiante_id)))];
  const { data: alumnos } = await admin
    .from('estudiantes')
    .select('id, nombre, apellido, tutor_id')
    .in('id', idsAlumno);
  const idsTutor = [...new Set((alumnos ?? []).map((e) => String(e.tutor_id ?? '')).filter(Boolean))];
  const { data: tutores } = idsTutor.length
    ? await admin.from('tutores').select('id, nombre, email').in('id', idsTutor)
    : { data: [] as Record<string, unknown>[] };

  const omitidos: { estudiante: string; motivo: string }[] = [];
  const pendientes: Aviso[] = [];
  for (const a of asistencias) {
    const est = (alumnos ?? []).find((e) => e.id === a.estudiante_id);
    const alumno = est ? `${est.nombre ?? ''} ${est.apellido ?? ''}`.trim() : 'Alumno';
    if (!est) {
      omitidos.push({ estudiante: alumno, motivo: 'El alumno ya no existe' });
      continue;
    }
    const tutor = (tutores ?? []).find((t) => t.id === est.tutor_id);
    const email = String(tutor?.email ?? '').trim();
    if (!tutor || !CORREO_VALIDO.test(email) || esCorreoDeRelleno(email)) {
      omitidos.push({ estudiante: alumno, motivo: 'Sin correo real del tutor' });
      continue;
    }
    pendientes.push({
      clave: tipo === 'INICIAL' ? `inicial:${a.id}` : `rect:${a.id}:${a.actualizado_en}`,
      asistenciaId: String(a.id),
      estudianteId: String(est.id),
      alumno,
      tutorId: tutor.id ? String(tutor.id) : null,
      tutorNombre: String(tutor.nombre ?? ''),
      tutorEmail: email,
      nuevoEstatus: tipo === 'RECTIFICACION' ? String(a.estatus) : undefined,
      motivo: tipo === 'RECTIFICACION' ? String(a.motivo_justificacion ?? '') : undefined,
    });
  }

  // 4. Idempotencia: no repetir avisos ya enviados
  if (pendientes.length > 0) {
    const { data: previos } = await admin
      .from('log_notificaciones')
      .select('idempotency_key')
      .in('idempotency_key', pendientes.map((p) => p.clave))
      .eq('estatus_entrega', 'ENVIADO');
    const yaEnviados = new Set((previos ?? []).map((p) => String(p.idempotency_key)));
    for (let i = pendientes.length - 1; i >= 0; i--) {
      if (yaEnviados.has(pendientes[i].clave)) {
        omitidos.push({ estudiante: pendientes[i].alumno, motivo: 'El aviso ya se había enviado' });
        pendientes.splice(i, 1);
      }
    }
  }
  if (pendientes.length === 0) return json({ ok: true, enviados: 0, errores: 0, omitidos });

  // 5. Enviar
  const { data: config } = await admin.from('configuracion').select('nombre_institucion').limit(1).maybeSingle();
  const institucion = String(config?.nombre_institucion || 'Colegio Centro América');
  const taller = String(grupo?.nombre || 'Taller');
  const fecha = fechaSesionLarga(String(sesion.fecha));
  const remitente = remitenteNoResponder(Deno.env.get('MAIL_FROM_NAME') || institucion, gmailUser);

  const resultado = await enviarLote(admin, pendientes, {
    gmailUser,
    gmailPassword,
    remitente,
    tipo,
    institucion,
    taller,
    fecha,
    fechaSesion: String(sesion.fecha),
  });

  return json({ ok: resultado.errores === 0, enviados: resultado.enviados, errores: resultado.errores, omitidos, error: resultado.primerError });
}

async function enviarLote(
  admin: SupabaseClient,
  avisos: Aviso[],
  o: {
    gmailUser: string;
    gmailPassword: string;
    remitente: string;
    tipo: 'INICIAL' | 'RECTIFICACION';
    institucion: string;
    taller: string;
    fecha: string;
    fechaSesion: string;
  }
): Promise<{ enviados: number; errores: number; primerError?: string }> {
  const sinCuenta = !o.gmailUser || !o.gmailPassword;
  let cliente: SMTPClient | null = null;
  const nuevoCliente = () =>
    new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: o.gmailUser, password: o.gmailPassword },
      },
    });

  let enviados = 0;
  let errores = 0;
  let primerError: string | undefined;

  for (const aviso of avisos) {
    const { asunto, html, texto } = construirAviso({
      institucion: o.institucion,
      tipo: o.tipo,
      tutor: aviso.tutorNombre,
      alumno: aviso.alumno,
      taller: o.taller,
      fecha: o.fecha,
      nuevoEstatus: aviso.nuevoEstatus,
      motivo: aviso.motivo,
    });

    let error: string | null = null;
    if (sinCuenta) {
      error = 'Falta configurar la cuenta de envío (secretos GMAIL_USER y GMAIL_APP_PASSWORD).';
    } else {
      // Un reintento con conexión nueva si el primero falla
      for (let intento = 1; intento <= 2; intento++) {
        try {
          cliente ??= nuevoCliente();
          await cliente.send({
            from: o.remitente,
            to: aviso.tutorEmail,
            subject: asunto,
            content: `${texto}${TEXTO_NO_RESPONDER}`,
            html,
            headers: ENCABEZADOS_NO_RESPONDER,
          });
          error = null;
          break;
        } catch (err) {
          error = err instanceof Error ? err.message : 'No se pudo enviar el correo.';
          await cliente?.close().catch(() => undefined);
          cliente = null;
        }
      }
    }

    if (error) {
      errores++;
      primerError ??= error;
    } else {
      enviados++;
    }

    await admin.from('log_notificaciones').insert({
      id: `log-${crypto.randomUUID()}`,
      idempotency_key: aviso.clave,
      asistencia_id: aviso.asistenciaId,
      estudiante_id: aviso.estudianteId,
      estudiante_nombre: aviso.alumno,
      tutor_id: aviso.tutorId,
      tutor_email: aviso.tutorEmail,
      tutor_nombre: aviso.tutorNombre,
      taller_nombre: o.taller,
      fecha_sesion: o.fechaSesion,
      tipo: o.tipo,
      estatus_entrega: error ? 'ERROR' : 'ENVIADO',
      metodo: 'SMTP_INSTITUCIONAL',
      detalles_error: error ? error.slice(0, 500) : null,
      enviado_en: new Date().toISOString(),
    });
  }

  await cliente?.close().catch(() => undefined);
  return { enviados, errores, primerError };
}

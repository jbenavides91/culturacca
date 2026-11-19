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
// nodemailer arma el MIME (encabezados plegados y codificados según RFC 2047). No volver a denomailer:
// cortaba los asuntos largos con tildes dentro del encabezado y el correo llegaba como texto crudo.
import nodemailer from 'npm:nodemailer@6.9.16';

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
/** Remitente "Nombre - No responder" (nodemailer codifica el nombre aunque tenga tildes o "–") */
const remitenteNoResponder = (nombre: string, cuenta: string) => {
  const limpio = nombre.replace(/[<>"()]/g, '').trim();
  return { name: /responder/i.test(limpio) ? limpio : `${limpio} - No responder`, address: cuenta };
};

/** Conexión SMTP con Gmail (465 con TLS; Supabase bloquea 25 y 587) */
const crearTransporte = (usuario: string, contrasena: string) =>
  nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: usuario, pass: contrasena },
  });

type Transporte = ReturnType<typeof crearTransporte>;

/** Cierra la conexión sin lanzar nunca (un fallo al cerrar no debe tapar el resultado del envío) */
function cerrarTransporte(transporte: { close: () => void } | null | undefined) {
  try {
    transporte?.close();
  } catch {
    // ignorar
  }
}

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

/** "23/11/2026" a partir de YYYY-MM-DD, leyendo las partes del texto (sin desfase de zona horaria) */
const fechaCorta = (fecha: string) => {
  const [y, m, d] = String(fecha).split('-');
  return y && m && d ? `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}` : String(fecha);
};

/** "2do Grado, sección B" (aula_regular guarda la sección); "2do Grado – Aula 5-A" si es otro texto */
const gradoYSeccion = (grado: unknown, aula: unknown) => {
  const g = String(grado ?? '').trim();
  const a = String(aula ?? '').trim();
  if (g && a) return /^[A-Za-z0-9]$/.test(a) ? `${g}, sección ${a.toUpperCase()}` : `${g} – ${a}`;
  return g || a || 'No registrado';
};

// ---------- Correo ----------

interface DatosAviso {
  institucion: string;
  tipo: 'INICIAL' | 'RECTIFICACION';
  alumno: string;
  gradoSeccion: string;
  taller: string;
  /** dd/mm/aaaa */
  fecha: string;
  nuevoEstatus?: string;
  motivo?: string;
}

/**
 * Texto acordado con la coordinación (2026-11-19). El aviso de ausencia reproduce el texto entregado;
 * el de corrección sigue el mismo formato. Firma: "Coordinación de Cultura" + nombre de la institución.
 */
function construirAviso(d: DatosAviso): { asunto: string; html: string; texto: string } {
  const inicial = d.tipo === 'INICIAL';
  const estado = d.nuevoEstatus === 'JUSTIFICADO' ? 'Justificado' : 'Presente';
  const titulo = inicial ? 'AVISO DE AUSENCIAS' : 'AVISO DE CORRECCIÓN DE ASISTENCIA';
  const intro = inicial
    ? 'Le notificamos que el estudiante registró una ausencia en su taller artístico.'
    : 'Le notificamos que la ausencia registrada del estudiante en su taller artístico fue corregida.';
  const encabezadoDatos = inicial ? 'Datos de la ausencia:' : 'Datos de la corrección:';
  const datos: [string, string][] = [
    ['Estudiante', d.alumno],
    ['Grado y sección', d.gradoSeccion],
    ['Taller', d.taller],
    [inicial ? 'Fecha de ausencia' : 'Fecha de la clase', d.fecha],
  ];
  if (!inicial) {
    datos.push(['Nuevo estado', estado]);
    if (d.motivo) datos.push(['Motivo', d.motivo]);
  }

  const asunto = inicial
    ? `Aviso de ausencia – ${d.alumno} (${d.taller})`
    : `Corrección de asistencia – ${d.alumno} (${d.taller})`;

  const texto = [
    titulo,
    '',
    'Estimado padre de familia:',
    '',
    intro,
    '',
    encabezadoDatos,
    '',
    ...datos.map(([k, v]) => `${k}: ${v}`),
    '',
    'Agradecemos su atención.',
    '',
    'Coordinación de Cultura',
    d.institucion,
  ].join('\n');

  const filas = datos
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#64748b;width:42%;">${escaparHtml(k)}:</td><td style="padding:8px 12px;font-weight:600;">${escaparHtml(v)}</td></tr>`
    )
    .join('\n        ');

  const html = `
  <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    <div style="background:#1e293b;padding:24px;color:#ffffff;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.5px;">${escaparHtml(d.institucion.toUpperCase())}</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Talleres de Arte y Cultura</p>
    </div>
    ${FRANJA_NO_RESPONDER}
    <div style="padding:28px 24px;color:#334155;">
      <h2 style="margin:0 0 20px;font-size:17px;font-weight:700;letter-spacing:0.5px;color:${inicial ? '#b91c1c' : '#15803d'};">${titulo}</h2>
      <p style="margin:0 0 12px;font-size:15px;">Estimado padre de familia:</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.55;">${intro}</p>
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1e293b;">${encabezadoDatos}</p>
      <table style="width:100%;font-size:13px;color:#1e293b;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
        ${filas}
      </table>
      <p style="margin:20px 0 0;font-size:14px;">Agradecemos su atención.</p>
      <p style="margin:20px 0 0;font-size:13px;color:#1e293b;">
        <strong>Coordinación de Cultura</strong><br/>${escaparHtml(d.institucion)}
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
  gradoSeccion: string;
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
    .select('id, nombre, apellido, grado, aula_regular, tutor_id')
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
      gradoSeccion: gradoYSeccion(est.grado, est.aula_regular),
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
  const fecha = fechaCorta(String(sesion.fecha));
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
    remitente: { name: string; address: string };
    tipo: 'INICIAL' | 'RECTIFICACION';
    institucion: string;
    taller: string;
    fecha: string;
    fechaSesion: string;
  }
): Promise<{ enviados: number; errores: number; primerError?: string }> {
  const sinCuenta = !o.gmailUser || !o.gmailPassword;
  // Una conexión para todo el lote; se recrea si un envío falla
  let transporte: Transporte | null = null;

  let enviados = 0;
  let errores = 0;
  let primerError: string | undefined;

  for (const aviso of avisos) {
    const { asunto, html, texto } = construirAviso({
      institucion: o.institucion,
      tipo: o.tipo,
      alumno: aviso.alumno,
      gradoSeccion: aviso.gradoSeccion,
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
          transporte ??= crearTransporte(o.gmailUser, o.gmailPassword);
          await transporte.sendMail({
            from: o.remitente,
            to: aviso.tutorEmail,
            subject: asunto,
            text: `${texto}${TEXTO_NO_RESPONDER}`,
            html,
            headers: ENCABEZADOS_NO_RESPONDER,
          });
          error = null;
          break;
        } catch (err) {
          error = err instanceof Error ? err.message : 'No se pudo enviar el correo.';
          cerrarTransporte(transporte);
          transporte = null;
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

  cerrarTransporte(transporte);
  return { enviados, errores, primerError };
}

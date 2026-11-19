// Supabase Edge Function: correo-matricula
// Envía al correo del tutor el resumen de la solicitud de matrícula y el contrato firmado en PDF,
// desde una cuenta Gmail institucional (SMTP smtp.gmail.com:465 con contraseña de aplicación).
//
// Seguridad: el navegador solo envía `solicitud_id`. Destinatario, resumen y PDF se construyen aquí
// a partir de la base de datos, así que la función no sirve para mandar correos arbitrarios.
// Puede invocarla un perfil activo con rol ADMIN, MATRICULA o CAJERO.
//
// Secretos: GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_FROM_NAME (opcional), ALLOWED_ORIGINS.
// Despliegue: MCP deploy_edge_function (name correo-matricula, verify_jwt: false).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';
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

const ROLES_PERMITIDOS = ['ADMIN', 'MATRICULA', 'CAJERO'];
/** No se reenvía antes de este intervalo desde el último envío correcto */
const ESPERA_REENVIO_MS = 2 * 60 * 1000;

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

/**
 * Cierra la conexión SMTP sin lanzar nunca: en denomailer, close() devuelve `void | Promise<void>`
 * (el cliente básico devuelve void), así que `close().catch()` fallaba y tapaba el resultado del envío.
 */
async function cerrarCliente(cliente: SMTPClient | null | undefined) {
  try {
    await cliente?.close();
  } catch {
    // ignorar
  }
}

// ---------- Utilidades de texto ----------

const escaparHtml = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Helvetica estándar usa WinAnsi: se normalizan los caracteres que no puede dibujar */
const aWinAnsi = (texto: string) =>
  texto
    .replace(/\t/g, '    ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[^\n\x20-\x7E\u00A1-\u00FF\u20AC\u2022]/g, '');

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const formatearMonto = (n: number) =>
  `C$ ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Fecha legible en la zona horaria de Nicaragua */
const fechaLarga = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Managua',
  });
};

// ---------- PDF del contrato ----------

async function generarPdfContrato(datos: {
  institucion: string;
  codigo: string;
  fechaSolicitud: string;
  alumno: string;
  contrato: string;
  firmaDataUrl: string | null;
  firmante: string;
  fechaFirma: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Contrato de matrícula ${datos.codigo}`);
  pdf.setAuthor(datos.institucion);

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ANCHO = 612; // Carta
  const ALTO = 792;
  const MARGEN = 56;
  const ANCHO_UTIL = ANCHO - MARGEN * 2;
  const TAM = 10.5;
  const INTERLINEA = 14.5;

  let pagina: PDFPage = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - MARGEN;

  const nuevaPagina = () => {
    pagina = pdf.addPage([ANCHO, ALTO]);
    y = ALTO - MARGEN;
  };
  const asegurarEspacio = (alto: number) => {
    if (y - alto < MARGEN + 24) nuevaPagina();
  };

  const partirEnLineas = (texto: string, fuente: PDFFont, tam: number): string[] => {
    const lineas: string[] = [];
    for (const parrafo of texto.split('\n')) {
      const palabras = parrafo.split(/ +/);
      let actual = '';
      for (const palabra of palabras) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(prueba, tam) <= ANCHO_UTIL) {
          actual = prueba;
          continue;
        }
        if (actual) lineas.push(actual);
        // Palabra más larga que la línea: se corta por caracteres
        let resto = palabra;
        while (fuente.widthOfTextAtSize(resto, tam) > ANCHO_UTIL) {
          let corte = resto.length - 1;
          while (corte > 1 && fuente.widthOfTextAtSize(resto.slice(0, corte), tam) > ANCHO_UTIL) corte--;
          lineas.push(resto.slice(0, corte));
          resto = resto.slice(corte);
        }
        actual = resto;
      }
      lineas.push(actual);
    }
    return lineas;
  };

  const escribir = (texto: string, fuente: PDFFont = normal, tam = TAM, color = rgb(0.12, 0.16, 0.23)) => {
    for (const linea of partirEnLineas(aWinAnsi(texto), fuente, tam)) {
      asegurarEspacio(INTERLINEA);
      if (linea) pagina.drawText(linea, { x: MARGEN, y, size: tam, font: fuente, color });
      y -= INTERLINEA;
    }
  };

  // Encabezado
  escribir(datos.institucion.toUpperCase(), negrita, 13);
  escribir('Contrato de matrícula de talleres extracurriculares', normal, 11, rgb(0.4, 0.45, 0.52));
  y -= 4;
  escribir(`Solicitud: ${datos.codigo}   ·   Fecha: ${datos.fechaSolicitud}   ·   Alumno: ${datos.alumno}`, normal, 9.5);
  y -= 6;
  pagina.drawLine({
    start: { x: MARGEN, y },
    end: { x: ANCHO - MARGEN, y },
    thickness: 0.8,
    color: rgb(0.85, 0.87, 0.9),
  });
  y -= 18;

  // Texto del contrato
  escribir(datos.contrato.replace(/\r\n/g, '\n'));
  y -= 18;

  // Firma
  const ALTO_FIRMA = 70;
  asegurarEspacio(ALTO_FIRMA + 60);
  escribir('Firma del padre, madre o tutor:', negrita, 10);
  y -= 4;
  if (datos.firmaDataUrl) {
    try {
      const base64 = datos.firmaDataUrl.split(',')[1] ?? '';
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const imagen = datos.firmaDataUrl.startsWith('data:image/jp')
        ? await pdf.embedJpg(bytes)
        : await pdf.embedPng(bytes);
      const escala = Math.min(220 / imagen.width, ALTO_FIRMA / imagen.height, 1);
      const w = imagen.width * escala;
      const h = imagen.height * escala;
      pagina.drawImage(imagen, { x: MARGEN, y: y - h, width: w, height: h });
      y -= h + 4;
    } catch {
      escribir('(No se pudo incluir la imagen de la firma)', normal, 9, rgb(0.6, 0.2, 0.2));
    }
  }
  pagina.drawLine({
    start: { x: MARGEN, y },
    end: { x: MARGEN + 240, y },
    thickness: 0.6,
    color: rgb(0.5, 0.55, 0.6),
  });
  y -= 14;
  escribir(datos.firmante || 'Tutor/a', negrita, 10);
  if (datos.fechaFirma) escribir(`Firmado digitalmente el ${datos.fechaFirma}`, normal, 9, rgb(0.4, 0.45, 0.52));

  // Pie de página "Página N de M"
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const pie = aWinAnsi(`${datos.codigo}  ·  Página ${i + 1} de ${paginas.length}`);
    const w = normal.widthOfTextAtSize(pie, 8);
    p.drawText(pie, { x: (ANCHO - w) / 2, y: 28, size: 8, font: normal, color: rgb(0.55, 0.6, 0.65) });
  });

  return await pdf.save();
}

// ---------- Correo HTML ----------

function construirCorreo(d: {
  institucion: string;
  tutor: string;
  codigo: string;
  tramite: string;
  alumno: string;
  codigoAlumno: string;
  grado: string;
  aula: string;
  taller: string;
  horario: string;
  salon: string;
  docente: string;
  monto: string;
}) {
  const fila = (etiqueta: string, valor: string) =>
    valor
      ? `<tr><td style="padding:5px 0;color:#64748b;width:42%;">${escaparHtml(etiqueta)}</td><td style="padding:5px 0;font-weight:600;">${escaparHtml(valor)}</td></tr>`
      : '';

  return `
  <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    <div style="background:#1e293b;padding:24px;color:#ffffff;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:.5px;">${escaparHtml(d.institucion.toUpperCase())}</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Talleres extracurriculares de arte y cultura</p>
    </div>
    ${FRANJA_NO_RESPONDER}
    <div style="padding:28px 24px;color:#334155;">
      <p style="margin-top:0;font-size:15px;">Estimado/a <strong>${escaparHtml(d.tutor || 'Tutor/a')}</strong>:</p>
      <p style="font-size:14px;line-height:1.55;">
        Hemos recibido la solicitud de ${escaparHtml(d.tramite.toLowerCase())} de <strong>${escaparHtml(d.alumno)}</strong>.
        Adjuntamos el contrato firmado en PDF para sus archivos.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:.5px;">Resumen de la matrícula</p>
        <table style="width:100%;font-size:13px;color:#1e293b;border-collapse:collapse;">
          ${fila('Código de solicitud', d.codigo)}
          ${fila('Trámite', d.tramite)}
          ${fila('Alumno', d.alumno)}
          ${fila('Código del alumno', d.codigoAlumno)}
          ${fila('Grado', d.grado)}
          ${fila('Aula', d.aula)}
          ${fila('Taller', d.taller)}
          ${fila('Horario', d.horario)}
          ${fila('Salón', d.salon)}
          ${fila('Docente', d.docente)}
          ${fila('Matrícula a pagar', d.monto)}
        </table>
        <p style="margin:10px 0 0;font-size:12px;color:#64748b;">El pago de matrícula equivale a una mensualidad y cubre el primer mes del taller.</p>
      </div>
      <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:14px 16px;border-radius:4px;font-size:13px;line-height:1.5;color:#1e3a8a;">
        <strong>Siguiente paso:</strong> preséntese en Caja con el código <strong>${escaparHtml(d.codigo)}</strong> para realizar el pago.
        El alumno se incorpora al taller cuando Caja confirme el pago.
      </div>
      <p style="margin-bottom:0;margin-top:24px;font-size:13px;color:#1e293b;">
        Atentamente,<br/><strong>Coordinación de Arte y Cultura</strong><br/>${escaparHtml(d.institucion)}
      </p>
    </div>
    <div style="background:#f1f5f9;border-top:1px solid #e2e8f0;padding:14px 24px;font-size:11px;color:#94a3b8;text-align:center;">
      ${PIE_NO_RESPONDER}
    </div>
  </div>`;
}

// ---------- Manejador ----------

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
  if (!caller || caller.activo === false || !ROLES_PERMITIDOS.includes(String(caller.rol))) {
    return json({ error: 'No tiene permiso para enviar correos de matrícula.' }, 403);
  }

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo de solicitud inválido' }, 400);
  }
  const solicitudId = String(body.solicitud_id ?? '').trim();
  if (!solicitudId) return json({ error: 'Falta la solicitud de matrícula.' }, 400);

  // 2. Cargar la solicitud y sus datos relacionados
  const { data: sol, error: solError } = await admin
    .from('matriculas')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (solError) return json({ error: solError.message }, 500);
  if (!sol) return json({ error: 'La solicitud de matrícula no existe (¿aún no se guardó?).' }, 404);

  const destinatario = String(sol.tutor_email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
    return json({ error: 'La solicitud no tiene un correo de tutor válido.' }, 400);
  }
  if (!sol.contrato_firmado || !sol.contrato_texto) {
    return json({ error: 'La solicitud no tiene un contrato firmado.' }, 400);
  }
  if (sol.correo_enviado_en && Date.now() - new Date(sol.correo_enviado_en).getTime() < ESPERA_REENVIO_MS) {
    return json({ error: 'El correo se acaba de enviar. Espere unos minutos antes de reenviarlo.' }, 429);
  }

  const registrarError = async (mensaje: string) => {
    await admin.from('matriculas').update({ correo_error: mensaje.slice(0, 500) }).eq('id', solicitudId);
  };

  if (!gmailUser || !gmailPassword) {
    const mensaje = 'Falta configurar la cuenta de envío (secretos GMAIL_USER y GMAIL_APP_PASSWORD).';
    await registrarError(mensaje);
    return json({ error: mensaje }, 500);
  }

  const [{ data: config }, { data: grupo }] = await Promise.all([
    admin.from('configuracion').select('nombre_institucion, arancel_taller').limit(1).maybeSingle(),
    sol.grupo_id
      ? admin.from('grupos').select('nombre, profesor_id, dias_semana, hora_inicio, hora_fin, aula, costo').eq('id', sol.grupo_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const { data: docente } = grupo?.profesor_id
    ? await admin.from('perfiles').select('nombre, apellido').eq('id', grupo.profesor_id).maybeSingle()
    : { data: null };

  const institucion = String(config?.nombre_institucion || 'Colegio Centro América');
  const alumno = `${sol.nombre_alumno ?? ''} ${sol.apellido_alumno ?? ''}`.trim();
  const taller = String(grupo?.nombre || sol.grupo_nombre || '');
  const horario = grupo
    ? `${((grupo.dias_semana as number[]) || []).map((d) => DIAS[d] || '').filter(Boolean).join(', ')} · ${grupo.hora_inicio} – ${grupo.hora_fin}`
    : '';
  const montoNum =
    Number(sol.monto_arancel) > 0
      ? Number(sol.monto_arancel)
      : Number(grupo?.costo) > 0
      ? Number(grupo?.costo)
      : Number(config?.arancel_taller) || 0;
  const tramite = sol.tipo_tramite === 'RENOVACION_ANUAL' ? 'Renovación de matrícula' : 'Nueva matrícula';
  const codigo = String(sol.codigo_solicitud || solicitudId);

  try {
    // 3. PDF del contrato y correo
    const pdf = await generarPdfContrato({
      institucion,
      codigo,
      fechaSolicitud: fechaLarga(sol.fecha_solicitud),
      alumno,
      contrato: String(sol.contrato_texto),
      firmaDataUrl: typeof sol.firma_digital_url === 'string' && sol.firma_digital_url.startsWith('data:image/')
        ? sol.firma_digital_url
        : null,
      firmante: String(sol.firmante_nombre || sol.tutor_nombre || ''),
      fechaFirma: fechaLarga(sol.fecha_firma || sol.fecha_solicitud),
    });

    const html = construirCorreo({
      institucion,
      tutor: String(sol.tutor_nombre || ''),
      codigo,
      tramite,
      alumno,
      codigoAlumno: String(sol.codigo_alumno || ''),
      grado: String(sol.grado || ''),
      aula: String(sol.aula_regular || ''),
      taller,
      horario,
      salon: String(grupo?.aula || ''),
      docente: docente ? `${docente.nombre ?? ''} ${docente.apellido ?? ''}`.trim() : '',
      monto: montoNum > 0 ? formatearMonto(montoNum) : '',
    });

    const cliente = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailPassword },
      },
    });
    const remitente = remitenteNoResponder(Deno.env.get('MAIL_FROM_NAME') || institucion, gmailUser);
    try {
      await cliente.send({
        from: remitente,
        to: destinatario,
        subject: `Matrícula ${codigo} – ${alumno}${taller ? ` · ${taller}` : ''}`,
        content: `Resumen de la matrícula ${codigo} de ${alumno}. El contrato firmado va adjunto en PDF.${TEXTO_NO_RESPONDER}`,
        headers: ENCABEZADOS_NO_RESPONDER,
        html,
        attachments: [
          {
            filename: `Contrato-${codigo}.pdf`,
            contentType: 'application/pdf',
            encoding: 'binary',
            content: pdf,
          },
        ],
      });
    } finally {
      await cerrarCliente(cliente);
    }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'No se pudo enviar el correo.';
    await registrarError(mensaje);
    return json({ error: `No se pudo enviar el correo: ${mensaje}` }, 502);
  }

  const enviadoEn = new Date().toISOString();
  await admin.from('matriculas').update({ correo_enviado_en: enviadoEn, correo_error: null }).eq('id', solicitudId);
  return json({ ok: true, destinatario, enviado_en: enviadoEn });
}

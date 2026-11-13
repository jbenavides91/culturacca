// Supabase Edge Function: admin-usuarios
// Crea, actualiza y elimina usuarios de Supabase Auth junto con su perfil.
// Solo puede invocarla un usuario con rol ADMIN.
// La service_role key la inyecta Supabase automáticamente (SUPABASE_SERVICE_ROLE_KEY);
// nunca debe estar en el frontend.
//
// Despliegue: npx supabase functions deploy admin-usuarios --project-ref <tu-ref>

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = ['ADMIN', 'PROFESOR', 'CAJERO', 'MATRICULA'];

const PERFIL_COLUMNS = [
  'nombre',
  'apellido',
  'email',
  'username',
  'rol',
  'cargo',
  'especialidad',
  'telefono',
  'activo',
] as const;

type Json = Record<string, unknown>;

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function pickPerfil(input: Json): Json {
  const out: Json = {};
  for (const col of PERFIL_COLUMNS) {
    if (input[col] !== undefined) out[col] = input[col];
  }
  if (typeof out.email === 'string') out.email = out.email.trim().toLowerCase();
  if (typeof out.username === 'string') out.username = out.username.trim().toLowerCase();
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Verificar quién llama
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sesión no válida' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: caller } = await admin
    .from('perfiles')
    .select('id, rol, activo')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!caller || caller.rol !== 'ADMIN' || caller.activo === false) {
    return json({ error: 'Solo un Administrador puede gestionar usuarios.' }, 403);
  }

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo de solicitud inválido' }, 400);
  }

  const action = body.action;

  try {
    // ---------- CREAR ----------
    if (action === 'create') {
      const perfil = pickPerfil((body.perfil as Json) ?? {});
      const password = String(body.password ?? '');
      if (!perfil.email || !perfil.nombre || !perfil.apellido || !perfil.rol) {
        return json({ error: 'Faltan datos obligatorios del usuario.' }, 400);
      }
      if (!ROLES.includes(String(perfil.rol))) return json({ error: 'Rol inválido.' }, 400);
      if (password.length < 6) {
        return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: String(perfil.email),
        password,
        email_confirm: true,
      });
      if (createError || !created.user) {
        return json({ error: createError?.message ?? 'No se pudo crear el usuario.' }, 400);
      }

      const row = { ...perfil, id: created.user.id, activo: perfil.activo ?? true };
      const { data: inserted, error: insertError } = await admin
        .from('perfiles')
        .insert(row)
        .select()
        .single();
      if (insertError) {
        // Revertir el usuario de Auth para no dejar cuentas huérfanas
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: insertError.message }, 400);
      }
      return json({ perfil: inserted });
    }

    // ---------- ACTUALIZAR ----------
    if (action === 'update') {
      const id = String(body.id ?? '');
      const cambios = pickPerfil((body.perfil as Json) ?? {});
      const password = body.password ? String(body.password) : '';
      if (!id) return json({ error: 'Falta el id del usuario.' }, 400);
      if (cambios.rol && !ROLES.includes(String(cambios.rol))) {
        return json({ error: 'Rol inválido.' }, 400);
      }

      // Evitar dejar el sistema sin administradores activos
      if ((cambios.rol && cambios.rol !== 'ADMIN') || cambios.activo === false) {
        const { data: actual } = await admin.from('perfiles').select('rol').eq('id', id).maybeSingle();
        if (actual?.rol === 'ADMIN') {
          const { count } = await admin
            .from('perfiles')
            .select('id', { count: 'exact', head: true })
            .eq('rol', 'ADMIN')
            .eq('activo', true);
          if ((count ?? 0) <= 1) {
            return json({ error: 'Debe existir al menos un Administrador activo.' }, 400);
          }
        }
      }

      const authUpdate: { email?: string; password?: string } = {};
      if (cambios.email) authUpdate.email = String(cambios.email);
      if (password) {
        if (password.length < 6) {
          return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
        }
        authUpdate.password = password;
      }

      if (Object.keys(authUpdate).length > 0) {
        const { data: authUser } = await admin.auth.admin.getUserById(id).catch(() => ({ data: null }));
        if (authUser?.user) {
          const { error } = await admin.auth.admin.updateUserById(id, {
            ...authUpdate,
            ...(authUpdate.email ? { email_confirm: true } : {}),
          });
          if (error) return json({ error: error.message }, 400);
        } else if (password) {
          return json({ error: 'Este perfil no tiene cuenta de acceso; no se puede cambiar la contraseña.' }, 400);
        }
      }

      const { data: updated, error: updateError } = await admin
        .from('perfiles')
        .update(cambios)
        .eq('id', id)
        .select()
        .single();
      if (updateError) return json({ error: updateError.message }, 400);
      return json({ perfil: updated });
    }

    // ---------- ELIMINAR ----------
    if (action === 'delete') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Falta el id del usuario.' }, 400);
      if (id === caller.id) return json({ error: 'No puedes eliminar tu propio usuario.' }, 400);

      const { data: actual } = await admin.from('perfiles').select('rol').eq('id', id).maybeSingle();
      if (actual?.rol === 'ADMIN') {
        const { count } = await admin
          .from('perfiles')
          .select('id', { count: 'exact', head: true })
          .eq('rol', 'ADMIN');
        if ((count ?? 0) <= 1) {
          return json({ error: 'No es posible eliminar el único Administrador del sistema.' }, 400);
        }
      }

      const { error: deleteError } = await admin.from('perfiles').delete().eq('id', id);
      if (deleteError) return json({ error: deleteError.message }, 400);

      // Borrar también la cuenta de Auth si existe (perfiles sin acceso no la tienen)
      const { data: authUser } = await admin.auth.admin.getUserById(id).catch(() => ({ data: null }));
      if (authUser?.user) await admin.auth.admin.deleteUser(id);

      return json({ ok: true });
    }

    // ---------- DAR ACCESO a un perfil existente sin cuenta (conserva talleres e historial) ----------
    if (action === 'grant_access') {
      const idAnterior = String(body.id ?? '');
      const username = String(body.username ?? '').trim().toLowerCase();
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!idAnterior || !username || !email) {
        return json({ error: 'Faltan datos: usuario y correo son obligatorios.' }, 400);
      }
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        return json({ error: 'El usuario solo puede tener letras, números, punto, guion o guion bajo (mín. 3).' }, 400);
      }
      if (password.length < 6) {
        return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
      }

      const { data: anterior } = await admin.from('perfiles').select('*').eq('id', idAnterior).maybeSingle();
      if (!anterior) return json({ error: 'El docente no existe.' }, 404);

      const { data: cuentaExistente } = await admin.auth.admin.getUserById(idAnterior).catch(() => ({ data: null }));
      if (cuentaExistente?.user) return json({ error: 'Este docente ya tiene acceso al sistema.' }, 400);

      const { data: usuarioRepetido } = await admin
        .from('perfiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      if (usuarioRepetido) return json({ error: `El usuario "${username}" ya está en uso.` }, 400);

      // 1. Crear la cuenta de acceso
      const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (errorCrear || !creado.user) {
        return json({ error: errorCrear?.message ?? 'No se pudo crear la cuenta.' }, 400);
      }
      const nuevoId = creado.user.id;

      // 2. Perfil nuevo con el mismo contenido y el id de la cuenta
      const { id: _viejo, ...datos } = anterior as Json;
      const { data: perfilNuevo, error: errorPerfil } = await admin
        .from('perfiles')
        .insert({ ...datos, id: nuevoId, username, email, activo: true })
        .select()
        .single();
      if (errorPerfil) {
        await admin.auth.admin.deleteUser(nuevoId);
        return json({ error: errorPerfil.message }, 400);
      }

      // 3. Mover referencias al nuevo id (talleres, asistencias registradas, anecdotario)
      const referencias: Array<[string, string]> = [
        ['grupos', 'profesor_id'],
        ['asistencias', 'registrado_por'],
        ['anecdotario', 'autor_id'],
      ];
      for (const [tabla, columna] of referencias) {
        const { error } = await admin.from(tabla).update({ [columna]: nuevoId }).eq(columna, idAnterior);
        if (error) {
          return json({ error: `Cuenta creada, pero no se pudo actualizar ${tabla}: ${error.message}` }, 500);
        }
      }

      // 4. Eliminar el registro anterior
      const { error: errorBorrar } = await admin.from('perfiles').delete().eq('id', idAnterior);
      if (errorBorrar) {
        return json({ error: `Cuenta creada, pero no se pudo retirar el registro anterior: ${errorBorrar.message}` }, 500);
      }

      return json({ perfil: perfilNuevo, idAnterior });
    }

    return json({ error: 'Acción no soportada' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error interno' }, 500);
  }
});

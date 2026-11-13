-- =====================================================================
-- Cultura CCA · Esquema inicial
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- TABLAS
-- Los ids son text para conservar el formato generado por la app
-- (grp-..., est-..., ses-..., etc.). Los perfiles con acceso usan el UID
-- de Supabase Auth como id.
-- ---------------------------------------------------------------------

create table if not exists public.perfiles (
  id            text primary key,
  nombre        text not null,
  apellido      text not null,
  email         text not null,
  username      text unique,
  rol           text not null check (rol in ('ADMIN','PROFESOR','CAJERO','MATRICULA')),
  cargo         text,
  especialidad  text,
  telefono      text,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

create table if not exists public.tutores (
  id          text primary key,
  nombre      text not null,
  email       text not null default '',
  telefono    text not null default '',
  parentesco  text,
  creado_en   timestamptz not null default now()
);

create table if not exists public.estudiantes (
  id                         text primary key,
  matricula                  text not null,
  nombre                     text not null,
  apellido                   text not null,
  edad                       integer,
  grado                      text,
  aula_regular               text,
  tutor_id                   text not null default '',
  creado_en                  timestamptz not null default now(),
  avatar_url                 text,
  solvente                   boolean,
  numero_recibo_caja         text,
  matricula_solicitud_id     text,
  estado                     text check (estado in ('ACTIVO','BAJA','PENDIENTE_RENOVACION')),
  fecha_baja                 text,
  motivo_baja                text,
  fecha_reactivacion         text,
  ciclo_actual               text,
  contrato_vigente           boolean,
  contrato_texto             text,
  fecha_renovacion_contrato  text,
  firma_digital_url          text,
  fecha_firma                text,
  firmante_nombre            text,
  estado_pago_anual          text check (estado_pago_anual in ('AL_DIA','PENDIENTE','EXENTO')),
  fecha_ultimo_pago_anual    text,
  numero_recibo_anual        text,
  observaciones_renovacion   text
);

create table if not exists public.grupos (
  id                  text primary key,
  nombre              text not null,
  profesor_id         text not null default '',
  dias_semana         integer[] not null default '{}',
  hora_inicio         text not null,           -- HH:mm
  hora_fin            text not null,           -- HH:mm
  fecha_inicio_ciclo  date not null,
  fecha_fin_ciclo     date not null,
  aula                text,
  color_tag           text,
  creado_en           timestamptz not null default now()
);

create table if not exists public.inscripciones (
  id                 text primary key,
  grupo_id           text not null references public.grupos(id) on delete cascade,
  estudiante_id      text not null references public.estudiantes(id) on delete cascade,
  fecha_inscripcion  date not null default current_date
);

create table if not exists public.sesiones (
  id                        text primary key,
  grupo_id                  text not null references public.grupos(id) on delete cascade,
  fecha                     date not null,
  hora_inicio               text not null,
  hora_fin                  text not null,
  cerrada                   boolean not null default false,
  fecha_cierre              timestamptz,
  tema                      text,
  google_calendar_event_id  text
);

create table if not exists public.asistencias (
  id                    text primary key,
  sesion_id             text not null references public.sesiones(id) on delete cascade,
  estudiante_id         text not null references public.estudiantes(id) on delete cascade,
  estatus               text not null check (estatus in ('PRESENTE','AUSENTE','JUSTIFICADO')),
  motivo_justificacion  text,
  registrado_por        text,
  actualizado_en        timestamptz not null default now()
);

create table if not exists public.log_notificaciones (
  id               text primary key,
  idempotency_key  text not null,
  asistencia_id    text not null,
  estudiante_id    text not null,
  estudiante_nombre text not null,
  tutor_id         text,
  tutor_email      text not null,
  tutor_nombre     text,
  taller_nombre    text not null,
  fecha_sesion     text not null,
  tipo             text not null check (tipo in ('INICIAL','RECTIFICACION')),
  estatus_entrega  text not null check (estatus_entrega in ('ENVIADO','PENDIENTE','ERROR','SIMULADO')),
  metodo           text not null check (metodo in ('GMAIL_API','SMTP_INSTITUCIONAL')),
  detalles_error   text,
  enviado_en       timestamptz not null default now()
);

create table if not exists public.configuracion (
  id                             integer primary key default 1 check (id = 1),
  limite_ausencias_alerta        integer not null default 3,
  porcentaje_inasistencia_alerta numeric not null default 20,
  nombre_institucion             text not null default 'Colegio Centro América',
  email_remitente                text not null default '',
  ciclo_academico_actual         text not null default 'Ciclo Vespertino 2026',
  updated_at                     timestamptz not null default now()
);

insert into public.configuracion (id) values (1) on conflict (id) do nothing;

create table if not exists public.matriculas (
  id                    text primary key,
  codigo_solicitud      text not null,
  tipo_tramite          text check (tipo_tramite in ('NUEVA_MATRICULA','RENOVACION_ANUAL')),
  estudiante_id         text,
  ciclo_academico       text,
  codigo_alumno         text not null,
  nombre_alumno         text not null,
  apellido_alumno       text not null,
  edad                  integer not null default 0,
  grado                 text not null,
  aula_regular          text not null default '',
  tutor_nombre          text not null,
  tutor_email           text not null default '',
  tutor_telefono        text not null default '',
  tutor_parentesco      text,
  tutor_cedula          text,
  grupo_id              text not null,
  grupo_nombre          text not null,
  fecha_solicitud       timestamptz not null default now(),
  contrato_texto        text not null default '',
  contrato_firmado      boolean not null default false,
  firma_digital_url     text,
  fecha_firma           text,
  firmante_nombre       text,
  estado                text not null check (estado in ('PENDIENTE_CAJA','SOLVENTE','ACEPTADA','RECHAZADA')),
  validado_datos        boolean not null default false,
  validado_contrato     boolean not null default false,
  solvente              boolean not null default false,
  numero_recibo_caja    text,
  monto_arancel         numeric,
  metodo_pago           text,
  cajero_nombre         text,
  cajero_observaciones  text,
  fecha_pago            text,
  fecha_aceptacion      text,
  estudiante_id_creado  text
);

-- Índices de consulta frecuente
create index if not exists idx_inscripciones_grupo      on public.inscripciones(grupo_id);
create index if not exists idx_inscripciones_estudiante on public.inscripciones(estudiante_id);
create index if not exists idx_sesiones_grupo           on public.sesiones(grupo_id);
create index if not exists idx_asistencias_sesion       on public.asistencias(sesion_id);
create index if not exists idx_asistencias_estudiante   on public.asistencias(estudiante_id);
create index if not exists idx_estudiantes_tutor        on public.estudiantes(tutor_id);
create index if not exists idx_matriculas_estado        on public.matriculas(estado);

-- ---------------------------------------------------------------------
-- FUNCIONES DE APOYO
-- ---------------------------------------------------------------------

-- Rol del usuario autenticado (null si no tiene perfil activo)
create or replace function public.current_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles
  where id = auth.uid()::text and activo = true
$$;

-- Permite iniciar sesión con nombre de usuario: devuelve el correo de Auth
create or replace function public.email_por_usuario(p_username text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from public.perfiles p
  join auth.users u on u.id::text = p.id
  where lower(p.username) = lower(trim(p_username))
  limit 1
$$;

revoke all on function public.email_por_usuario(text) from public;
grant execute on function public.email_por_usuario(text) to anon, authenticated;
revoke execute on function public.current_rol() from public, anon;
grant execute on function public.current_rol() to authenticated;

-- ---------------------------------------------------------------------
-- SEGURIDAD: Row Level Security por rol
--   Lectura: cualquier usuario con perfil activo.
--   Escritura: según el rol (ver cada tabla).
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'perfiles','tutores','estudiantes','grupos','inscripciones',
    'sesiones','asistencias','log_notificaciones','configuracion','matriculas'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura_personal_activo" on public.%I', t);
    execute format(
      'create policy "lectura_personal_activo" on public.%I for select to authenticated using (public.current_rol() is not null)',
      t
    );
  end loop;
end $$;

-- Helper para crear la política de escritura de una tabla
create or replace function pg_temp.politica_escritura(tabla text, roles text[])
returns void language plpgsql as $$
begin
  execute format('drop policy if exists "escritura_por_rol" on public.%I', tabla);
  execute format(
    'create policy "escritura_por_rol" on public.%I for all to authenticated using (public.current_rol() = any(%L::text[])) with check (public.current_rol() = any(%L::text[]))',
    tabla, roles, roles
  );
end $$;

select pg_temp.politica_escritura('perfiles',           array['ADMIN']);
select pg_temp.politica_escritura('configuracion',      array['ADMIN']);
select pg_temp.politica_escritura('grupos',             array['ADMIN']);
select pg_temp.politica_escritura('sesiones',           array['ADMIN','PROFESOR']);
select pg_temp.politica_escritura('asistencias',        array['ADMIN','PROFESOR']);
select pg_temp.politica_escritura('log_notificaciones', array['ADMIN','PROFESOR']);
select pg_temp.politica_escritura('tutores',            array['ADMIN','MATRICULA','CAJERO']);
select pg_temp.politica_escritura('estudiantes',        array['ADMIN','MATRICULA','CAJERO']);
select pg_temp.politica_escritura('inscripciones',      array['ADMIN','MATRICULA','CAJERO']);
select pg_temp.politica_escritura('matriculas',         array['ADMIN','MATRICULA','CAJERO']);

-- ---------------------------------------------------------------------
-- REALTIME: sincronizar cambios entre dispositivos
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'perfiles','tutores','estudiantes','grupos','inscripciones',
    'sesiones','asistencias','log_notificaciones','configuracion','matriculas'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- ya estaba en la publicación
    end;
  end loop;
end $$;

-- =====================================================================
-- ADMINISTRADOR INICIAL
-- 1. Authentication → Users → Add user → Create new user
--    (tu correo + contraseña, marca "Auto Confirm User").
-- 2. Copia el "User UID" y reemplázalo abajo, junto con tus datos.
-- 3. Ejecuta solo este bloque (descoméntalo).
-- =====================================================================
-- insert into public.perfiles (id, nombre, apellido, email, username, rol, cargo, activo)
-- values (
--   'PEGA-AQUI-EL-USER-UID',
--   'Nombre',
--   'Apellido',
--   'tu-correo@cca.edu.ni',
--   'admin',
--   'ADMIN',
--   'Dirección',
--   true
-- );

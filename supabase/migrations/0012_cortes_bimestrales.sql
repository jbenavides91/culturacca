-- Cortes bimestrales (Configuración → Cortes; Reportes → Corte bimestral) y bitácora de altas y bajas.
-- Las mensualidades NO se registran: el reporte calcula el cobro esperado por taller y alumno
-- (mensualidad × meses activos, menos el mes cubierto por la matrícula) a partir de esta bitácora.

-- ---------- Cortes ----------
create table if not exists public.cortes_bimestrales (
  id            text primary key,
  nombre        text not null check (length(trim(nombre)) > 0),
  fecha_inicio  date not null,
  fecha_fin     date not null,
  creado_en     timestamptz not null default now(),
  constraint cortes_bimestrales_rango_valido check (fecha_fin >= fecha_inicio)
);

create index if not exists cortes_bimestrales_rango on public.cortes_bimestrales (fecha_inicio, fecha_fin);

alter table public.cortes_bimestrales enable row level security;

drop policy if exists "lectura_personal_activo" on public.cortes_bimestrales;
create policy "lectura_personal_activo" on public.cortes_bimestrales
  for select to authenticated
  using ((select public.current_rol()) is not null);

drop policy if exists "escritura_insert" on public.cortes_bimestrales;
create policy "escritura_insert" on public.cortes_bimestrales
  for insert to authenticated
  with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_update" on public.cortes_bimestrales;
create policy "escritura_update" on public.cortes_bimestrales
  for update to authenticated
  using ((select public.current_rol()) = 'ADMIN')
  with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_delete" on public.cortes_bimestrales;
create policy "escritura_delete" on public.cortes_bimestrales
  for delete to authenticated
  using ((select public.current_rol()) = 'ADMIN');

-- ---------- Bitácora de movimientos (solo inserción) ----------
-- Sin FKs: el historial sobrevive a la eliminación de un taller o alumno.
create table if not exists public.movimientos_inscripcion (
  id                 text primary key,
  tipo               text not null check (tipo in ('ALTA_TALLER', 'BAJA_TALLER', 'BAJA_ALUMNO', 'REACTIVACION_ALUMNO')),
  estudiante_id      text not null,
  grupo_id           text,
  estudiante_nombre  text,
  grupo_nombre       text,
  fecha              date not null,
  motivo             text,
  registrado_por     text,
  creado_en          timestamptz not null default now()
);

create index if not exists movimientos_inscripcion_fecha on public.movimientos_inscripcion (fecha);
create index if not exists movimientos_inscripcion_estudiante on public.movimientos_inscripcion (estudiante_id, grupo_id);

alter table public.movimientos_inscripcion enable row level security;

drop policy if exists "lectura_personal_activo" on public.movimientos_inscripcion;
create policy "lectura_personal_activo" on public.movimientos_inscripcion
  for select to authenticated
  using ((select public.current_rol()) is not null);

-- Los mismos roles que escriben inscripciones y estudiantes. Sin UPDATE ni DELETE (bitácora).
drop policy if exists "escritura_insert" on public.movimientos_inscripcion;
create policy "escritura_insert" on public.movimientos_inscripcion
  for insert to authenticated
  with check ((select public.current_rol()) in ('ADMIN', 'CAJERO', 'MATRICULA'));

do $$
begin
  alter publication supabase_realtime add table public.cortes_bimestrales;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.movimientos_inscripcion;
exception when duplicate_object then
  null;
end $$;

-- ---------- Historial inicial ----------
-- Una ALTA por cada inscripción vigente (su fecha de inscripción)
insert into public.movimientos_inscripcion (id, tipo, estudiante_id, grupo_id, estudiante_nombre, grupo_nombre, fecha, motivo)
select
  'mov-ini-alta-' || i.id,
  'ALTA_TALLER',
  i.estudiante_id,
  i.grupo_id,
  trim(coalesce(e.nombre, '') || ' ' || coalesce(e.apellido, '')),
  g.nombre,
  i.fecha_inscripcion,
  'Inscripción existente al activar los cortes'
from public.inscripciones i
left join public.estudiantes e on e.id = i.estudiante_id
left join public.grupos g on g.id = i.grupo_id
on conflict do nothing;

-- Una BAJA por cada alumno dado de baja (fecha local de Nicaragua)
insert into public.movimientos_inscripcion (id, tipo, estudiante_id, estudiante_nombre, fecha, motivo)
select
  'mov-ini-baja-' || e.id,
  'BAJA_ALUMNO',
  e.id,
  trim(coalesce(e.nombre, '') || ' ' || coalesce(e.apellido, '')),
  case
    when length(e.fecha_baja) = 10 then e.fecha_baja::date
    else (e.fecha_baja::timestamptz at time zone 'America/Managua')::date
  end,
  coalesce(nullif(trim(e.motivo_baja), ''), 'Baja registrada antes de activar los cortes')
from public.estudiantes e
where e.estado = 'BAJA'
  and e.fecha_baja ~ '^\d{4}-\d{2}-\d{2}'
on conflict do nothing;

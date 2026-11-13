-- Catálogo de salones / aulas (Configuración → Salones).
-- grupos.aula guarda el NOMBRE del salón; la app impide asignar un salón ocupado en el mismo horario.

create table if not exists public.salones (
  id         text primary key,
  nombre     text not null check (length(trim(nombre)) > 0),
  ubicacion  text,
  capacidad  integer check (capacidad is null or capacidad > 0),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create unique index if not exists salones_nombre_unico on public.salones (lower(nombre));

alter table public.salones enable row level security;

drop policy if exists "lectura_personal_activo" on public.salones;
create policy "lectura_personal_activo" on public.salones
  for select to authenticated
  using (public.current_rol() is not null);

drop policy if exists "escritura_por_rol" on public.salones;
create policy "escritura_por_rol" on public.salones
  for all to authenticated
  using (public.current_rol() = 'ADMIN')
  with check (public.current_rol() = 'ADMIN');

do $$
begin
  alter publication supabase_realtime add table public.salones;
exception when duplicate_object then
  null;
end $$;

-- Semilla: convertir en salones las aulas ya escritas en talleres existentes
insert into public.salones (id, nombre)
select 'sal-migr-' || md5(lower(trim(aula))), trim(aula)
from (select distinct on (lower(trim(aula))) aula from public.grupos where aula is not null and trim(aula) <> '') a
on conflict do nothing;

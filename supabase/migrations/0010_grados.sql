-- Catálogo de grados escolares (Configuración → Grados).
-- estudiantes.grado y matriculas.grado guardan el NOMBRE del grado; la app propaga los renombres
-- y no permite borrar un grado en uso (se desactiva en su lugar).

create table if not exists public.grados (
  id         text primary key,
  nombre     text not null check (length(trim(nombre)) > 0),
  orden      integer not null default 0,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create unique index if not exists grados_nombre_unico on public.grados (lower(nombre));

alter table public.grados enable row level security;

drop policy if exists "lectura_personal_activo" on public.grados;
create policy "lectura_personal_activo" on public.grados
  for select to authenticated
  using ((select public.current_rol()) is not null);

drop policy if exists "escritura_insert" on public.grados;
create policy "escritura_insert" on public.grados
  for insert to authenticated
  with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_update" on public.grados;
create policy "escritura_update" on public.grados
  for update to authenticated
  using ((select public.current_rol()) = 'ADMIN')
  with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_delete" on public.grados;
create policy "escritura_delete" on public.grados
  for delete to authenticated
  using ((select public.current_rol()) = 'ADMIN');

do $$
begin
  alter publication supabase_realtime add table public.grados;
exception when duplicate_object then
  null;
end $$;

-- Semilla: los grados que antes estaban fijos en el código
insert into public.grados (id, nombre, orden) values
  ('grd-01', '1er Grado', 1),
  ('grd-02', '2do Grado', 2),
  ('grd-03', '3er Grado', 3),
  ('grd-04', '4to Grado', 4),
  ('grd-05', '5to Grado', 5),
  ('grd-06', '6to Grado', 6),
  ('grd-07', '7mo Grado', 7),
  ('grd-08', '8vo Grado', 8),
  ('grd-09', '9no Grado', 9),
  ('grd-10', '10mo Grado', 10),
  ('grd-11', '11mo Grado', 11)
on conflict do nothing;

-- Y cualquier otro grado ya escrito en alumnos o matrículas
insert into public.grados (id, nombre, orden)
select 'grd-migr-' || md5(lower(trim(grado))), trim(grado), 100
from (
  select grado from public.estudiantes where grado is not null and trim(grado) <> ''
  union
  select grado from public.matriculas where grado is not null and trim(grado) <> ''
) g
where not exists (select 1 from public.grados x where lower(x.nombre) = lower(trim(g.grado)))
on conflict do nothing;

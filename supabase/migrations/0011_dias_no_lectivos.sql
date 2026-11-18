-- Días no lectivos (Configuración → Días no lectivos): feriados, vacaciones y otros días sin clase.
-- Cada fila es un rango de fechas (un solo día cuando fecha_inicio = fecha_fin).
-- La app no genera sesiones en esas fechas y, al cambiar el catálogo, reconcilia el calendario
-- de todos los talleres (las sesiones cerradas, con asistencia o extraordinarias se conservan).

create table if not exists public.dias_no_lectivos (
  id            text primary key,
  fecha_inicio  date not null,
  fecha_fin     date not null,
  motivo        text not null check (length(trim(motivo)) > 0),
  tipo          text not null default 'OTRO' check (tipo in ('FERIADO', 'VACACIONES', 'OTRO')),
  creado_en     timestamptz not null default now(),
  constraint dias_no_lectivos_rango_valido check (fecha_fin >= fecha_inicio)
);

create index if not exists dias_no_lectivos_rango on public.dias_no_lectivos (fecha_inicio, fecha_fin);

alter table public.dias_no_lectivos enable row level security;

drop policy if exists "lectura_personal_activo" on public.dias_no_lectivos;
create policy "lectura_personal_activo" on public.dias_no_lectivos
  for select to authenticated
  using ((select public.current_rol()) is not null);

drop policy if exists "escritura_insert" on public.dias_no_lectivos;
create policy "escritura_insert" on public.dias_no_lectivos
  for insert to authenticated
  with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_update" on public.dias_no_lectivos;
create policy "escritura_update" on public.dias_no_lectivos
  for update to authenticated
  using ((select public.current_rol()) = 'ADMIN')
  with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_delete" on public.dias_no_lectivos;
create policy "escritura_delete" on public.dias_no_lectivos
  for delete to authenticated
  using ((select public.current_rol()) = 'ADMIN');

do $$
begin
  alter publication supabase_realtime add table public.dias_no_lectivos;
exception when duplicate_object then
  null;
end $$;

-- Semilla: feriados de Nicaragua (nacionales + locales de Managua y Gritería) para el resto de 2026 y 2027.
-- Los ids son deterministas (dnl-YYYY-MM-DD), igual que "Cargar feriados de Nicaragua" en la app.
insert into public.dias_no_lectivos (id, fecha_inicio, fecha_fin, motivo, tipo) values
  ('dnl-2026-12-07', '2026-12-07', '2026-12-07', 'La Gritería', 'FERIADO'),
  ('dnl-2026-12-08', '2026-12-08', '2026-12-08', 'Inmaculada Concepción (Purísima)', 'FERIADO'),
  ('dnl-2026-12-25', '2026-12-25', '2026-12-25', 'Navidad', 'FERIADO'),
  ('dnl-2027-01-01', '2027-01-01', '2027-01-01', 'Año Nuevo', 'FERIADO'),
  ('dnl-2027-03-25', '2027-03-25', '2027-03-25', 'Jueves Santo', 'FERIADO'),
  ('dnl-2027-03-26', '2027-03-26', '2027-03-26', 'Viernes Santo', 'FERIADO'),
  ('dnl-2027-05-01', '2027-05-01', '2027-05-01', 'Día Internacional del Trabajo', 'FERIADO'),
  ('dnl-2027-05-30', '2027-05-30', '2027-05-30', 'Día de las Madres', 'FERIADO'),
  ('dnl-2027-07-19', '2027-07-19', '2027-07-19', 'Aniversario de la Revolución', 'FERIADO'),
  ('dnl-2027-08-01', '2027-08-01', '2027-08-01', 'Santo Domingo de Guzmán (bajada)', 'FERIADO'),
  ('dnl-2027-08-10', '2027-08-10', '2027-08-10', 'Santo Domingo de Guzmán (subida)', 'FERIADO'),
  ('dnl-2027-09-14', '2027-09-14', '2027-09-14', 'Batalla de San Jacinto', 'FERIADO'),
  ('dnl-2027-09-15', '2027-09-15', '2027-09-15', 'Día de la Independencia', 'FERIADO'),
  ('dnl-2027-12-07', '2027-12-07', '2027-12-07', 'La Gritería', 'FERIADO'),
  ('dnl-2027-12-08', '2027-12-08', '2027-12-08', 'Inmaculada Concepción (Purísima)', 'FERIADO'),
  ('dnl-2027-12-25', '2027-12-25', '2027-12-25', 'Navidad', 'FERIADO')
on conflict do nothing;

-- Quitar las sesiones ya generadas que caen en esos días (misma regla que reconciliarSesiones en la app:
-- se conservan las cerradas, las que tienen asistencia y las extraordinarias).
delete from public.sesiones s
using public.dias_no_lectivos d
where s.fecha between d.fecha_inicio and d.fecha_fin
  and s.cerrada = false
  and coalesce(s.extraordinaria, false) = false
  and not exists (select 1 from public.asistencias a where a.sesion_id = s.id);

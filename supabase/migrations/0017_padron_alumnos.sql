-- Padrón de alumnos (Configuración → Padrón): listado del colegio cargado desde Excel
-- (nombre, grado y sección; código opcional). Solo sirve para autocompletar el asistente
-- de matrícula: NO son alumnos del sistema (no aparecen en Estudiantes, Talleres ni reportes)
-- hasta que se matriculan y Caja formaliza la solicitud.
-- grado guarda el NOMBRE del grado del catálogo (igual que estudiantes.grado).

create table if not exists public.padron_alumnos (
  id         text primary key,
  codigo     text,
  nombre     text not null check (length(trim(nombre)) > 0),
  apellido   text not null default '',
  grado      text,
  seccion    text,
  ciclo      text,
  creado_en  timestamptz not null default now()
);

create unique index if not exists padron_alumnos_codigo_unico
  on public.padron_alumnos (upper(trim(codigo)))
  where codigo is not null and trim(codigo) <> '';

alter table public.padron_alumnos enable row level security;

-- Lectura: cualquier perfil activo (Matrícula y Caja lo usan en el asistente)
drop policy if exists "lectura_personal_activo" on public.padron_alumnos;
create policy "lectura_personal_activo" on public.padron_alumnos
  for select to authenticated
  using ((select public.current_rol()) is not null);

-- Escritura: solo ADMIN (importación y mantenimiento desde Configuración)
drop policy if exists "escritura_insert" on public.padron_alumnos;
create policy "escritura_insert" on public.padron_alumnos
  for insert to authenticated
  with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_update" on public.padron_alumnos;
create policy "escritura_update" on public.padron_alumnos
  for update to authenticated
  using ((select public.current_rol()) = 'ADMIN')
  with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_delete" on public.padron_alumnos;
create policy "escritura_delete" on public.padron_alumnos
  for delete to authenticated
  using ((select public.current_rol()) = 'ADMIN');

do $$
begin
  alter publication supabase_realtime add table public.padron_alumnos;
exception when duplicate_object then
  null;
end $$;

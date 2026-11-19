-- 0015: Eventos (Día del Libro, Fiestas Patrias, …) y la lista de alumnos que participan.
-- ADMIN crea el evento, asigna los talleres participantes y lo cierra o reabre.
-- Cada docente elige, mientras el evento está ABIERTO, a los alumnos de SUS talleres asignados.

-- ---------- Eventos ----------
create table if not exists public.eventos (
  id           text primary key,
  nombre       text not null check (length(trim(nombre)) > 0),
  fecha        date not null,
  lugar        text,
  descripcion  text,
  estado       text not null default 'ABIERTO' check (estado in ('ABIERTO', 'CERRADO')),
  creado_por   text,
  creado_en    timestamptz not null default now()
);

create index if not exists eventos_fecha on public.eventos (fecha);

-- ---------- Talleres asignados a cada evento ----------
create table if not exists public.evento_talleres (
  id         text primary key,
  evento_id  text not null references public.eventos (id) on delete cascade,
  grupo_id   text not null references public.grupos (id) on delete cascade,
  constraint evento_talleres_unico unique (evento_id, grupo_id)
);

create index if not exists evento_talleres_grupo on public.evento_talleres (grupo_id);

-- ---------- Alumnos que participan (por taller) ----------
create table if not exists public.evento_participantes (
  id              text primary key,
  evento_id       text not null references public.eventos (id) on delete cascade,
  grupo_id        text not null references public.grupos (id) on delete cascade,
  estudiante_id   text not null references public.estudiantes (id) on delete cascade,
  registrado_por  text,
  creado_en       timestamptz not null default now(),
  constraint evento_participantes_unico unique (evento_id, grupo_id, estudiante_id)
);

create index if not exists evento_participantes_grupo on public.evento_participantes (grupo_id);
create index if not exists evento_participantes_estudiante on public.evento_participantes (estudiante_id);

alter table public.eventos enable row level security;
alter table public.evento_talleres enable row level security;
alter table public.evento_participantes enable row level security;

-- ---------- Lectura: cualquier perfil activo ----------
drop policy if exists "lectura_personal_activo" on public.eventos;
create policy "lectura_personal_activo" on public.eventos
  for select to authenticated using ((select public.current_rol()) is not null);

drop policy if exists "lectura_personal_activo" on public.evento_talleres;
create policy "lectura_personal_activo" on public.evento_talleres
  for select to authenticated using ((select public.current_rol()) is not null);

drop policy if exists "lectura_personal_activo" on public.evento_participantes;
create policy "lectura_personal_activo" on public.evento_participantes
  for select to authenticated using ((select public.current_rol()) is not null);

-- ---------- Eventos: solo ADMIN escribe ----------
drop policy if exists "escritura_insert" on public.eventos;
create policy "escritura_insert" on public.eventos
  for insert to authenticated with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_update" on public.eventos;
create policy "escritura_update" on public.eventos
  for update to authenticated
  using ((select public.current_rol()) = 'ADMIN')
  with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_delete" on public.eventos;
create policy "escritura_delete" on public.eventos
  for delete to authenticated using ((select public.current_rol()) = 'ADMIN');

-- ---------- Talleres del evento: solo ADMIN (se agregan y quitan, sin UPDATE) ----------
drop policy if exists "escritura_insert" on public.evento_talleres;
create policy "escritura_insert" on public.evento_talleres
  for insert to authenticated with check ((select public.current_rol()) = 'ADMIN');

drop policy if exists "escritura_delete" on public.evento_talleres;
create policy "escritura_delete" on public.evento_talleres
  for delete to authenticated using ((select public.current_rol()) = 'ADMIN');

-- ---------- Participantes: ADMIN siempre; PROFESOR solo en su taller, asignado y con el evento ABIERTO ----------
drop policy if exists "escritura_insert" on public.evento_participantes;
create policy "escritura_insert" on public.evento_participantes
  for insert to authenticated
  with check (
    (select public.current_rol()) = 'ADMIN'
    or (
      (select public.current_rol()) = 'PROFESOR'
      and exists (
        select 1 from public.grupos g
        where g.id = evento_participantes.grupo_id and g.profesor_id = (select auth.uid())::text
      )
      and exists (
        select 1 from public.evento_talleres et
        where et.evento_id = evento_participantes.evento_id and et.grupo_id = evento_participantes.grupo_id
      )
      and exists (
        select 1 from public.eventos e
        where e.id = evento_participantes.evento_id and e.estado = 'ABIERTO'
      )
    )
  );

drop policy if exists "escritura_delete" on public.evento_participantes;
create policy "escritura_delete" on public.evento_participantes
  for delete to authenticated
  using (
    (select public.current_rol()) = 'ADMIN'
    or (
      (select public.current_rol()) = 'PROFESOR'
      and exists (
        select 1 from public.grupos g
        where g.id = evento_participantes.grupo_id and g.profesor_id = (select auth.uid())::text
      )
      and exists (
        select 1 from public.eventos e
        where e.id = evento_participantes.evento_id and e.estado = 'ABIERTO'
      )
    )
  );

-- ---------- Realtime ----------
do $$
begin
  alter publication supabase_realtime add table public.eventos;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.evento_talleres;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.evento_participantes;
exception when duplicate_object then null;
end $$;

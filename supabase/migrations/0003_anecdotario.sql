-- Anecdotario: expediente de anotaciones por estudiante (comentarios, indisciplinas, logros).
-- Privacidad: cada docente solo ve lo que escribió; ADMIN ve y puede borrar todo. Nadie edita.

create table if not exists public.anecdotario (
  id             text primary key,
  estudiante_id  text not null references public.estudiantes(id) on delete cascade,
  grupo_id       text,
  sesion_id      text,
  autor_id       text not null,
  autor_nombre   text not null,
  tipo           text not null check (tipo in ('COMENTARIO','INDISCIPLINA','LOGRO')),
  descripcion    text not null check (length(trim(descripcion)) > 0 and length(descripcion) <= 2000),
  creado_en      timestamptz not null default now()
);

create index if not exists idx_anecdotario_estudiante on public.anecdotario(estudiante_id);
create index if not exists idx_anecdotario_autor on public.anecdotario(autor_id);

alter table public.anecdotario enable row level security;

drop policy if exists "anecdotario_lectura" on public.anecdotario;
create policy "anecdotario_lectura" on public.anecdotario
  for select to authenticated
  using (
    public.current_rol() = 'ADMIN'
    or (public.current_rol() = 'PROFESOR' and autor_id = auth.uid()::text)
  );

drop policy if exists "anecdotario_insercion" on public.anecdotario;
create policy "anecdotario_insercion" on public.anecdotario
  for insert to authenticated
  with check (
    public.current_rol() in ('ADMIN','PROFESOR')
    and autor_id = auth.uid()::text
  );

drop policy if exists "anecdotario_borrado_admin" on public.anecdotario;
create policy "anecdotario_borrado_admin" on public.anecdotario
  for delete to authenticated
  using (public.current_rol() = 'ADMIN');

-- Sin política de UPDATE: las anotaciones no se pueden modificar.

do $$
begin
  alter publication supabase_realtime add table public.anecdotario;
exception when duplicate_object then
  null;
end $$;

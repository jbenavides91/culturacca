-- Optimiza las políticas RLS sin cambiar los permisos (advisors de rendimiento de Supabase):
-- 1. La política de escritura era FOR ALL (incluía SELECT) y duplicaba la de lectura →
--    se separa en INSERT / UPDATE / DELETE.
-- 2. current_rol() y auth.uid() se envuelven en (select ...) para evaluarse una vez por consulta
--    y no por cada fila.

create or replace function pg_temp.reescribir_politicas(tabla text, roles text[])
returns void language plpgsql as $$
declare
  cond text := format('(select public.current_rol()) = any(%L::text[])', roles);
begin
  execute format('drop policy if exists "escritura_por_rol" on public.%I', tabla);
  execute format('drop policy if exists "escritura_insert" on public.%I', tabla);
  execute format('drop policy if exists "escritura_update" on public.%I', tabla);
  execute format('drop policy if exists "escritura_delete" on public.%I', tabla);
  execute format('drop policy if exists "lectura_personal_activo" on public.%I', tabla);

  execute format('create policy "lectura_personal_activo" on public.%I for select to authenticated using ((select public.current_rol()) is not null)', tabla);
  execute format('create policy "escritura_insert" on public.%I for insert to authenticated with check (%s)', tabla, cond);
  execute format('create policy "escritura_update" on public.%I for update to authenticated using (%s) with check (%s)', tabla, cond, cond);
  execute format('create policy "escritura_delete" on public.%I for delete to authenticated using (%s)', tabla, cond);
end $$;

select pg_temp.reescribir_politicas('perfiles',           array['ADMIN']);
select pg_temp.reescribir_politicas('configuracion',      array['ADMIN']);
select pg_temp.reescribir_politicas('grupos',             array['ADMIN']);
select pg_temp.reescribir_politicas('salones',            array['ADMIN']);
select pg_temp.reescribir_politicas('sesiones',           array['ADMIN','PROFESOR']);
select pg_temp.reescribir_politicas('asistencias',        array['ADMIN','PROFESOR']);
select pg_temp.reescribir_politicas('log_notificaciones', array['ADMIN','PROFESOR']);
select pg_temp.reescribir_politicas('tutores',            array['ADMIN','MATRICULA','CAJERO']);
select pg_temp.reescribir_politicas('estudiantes',        array['ADMIN','MATRICULA','CAJERO']);
select pg_temp.reescribir_politicas('inscripciones',      array['ADMIN','MATRICULA','CAJERO']);
select pg_temp.reescribir_politicas('matriculas',         array['ADMIN','MATRICULA','CAJERO']);

-- Anecdotario: mismas reglas, con evaluación única por consulta
drop policy if exists "anecdotario_lectura" on public.anecdotario;
create policy "anecdotario_lectura" on public.anecdotario
  for select to authenticated
  using (
    (select public.current_rol()) = 'ADMIN'
    or ((select public.current_rol()) = 'PROFESOR' and autor_id = (select auth.uid())::text)
  );

drop policy if exists "anecdotario_insercion" on public.anecdotario;
create policy "anecdotario_insercion" on public.anecdotario
  for insert to authenticated
  with check (
    (select public.current_rol()) in ('ADMIN','PROFESOR')
    and autor_id = (select auth.uid())::text
  );

drop policy if exists "anecdotario_borrado_admin" on public.anecdotario;
create policy "anecdotario_borrado_admin" on public.anecdotario
  for delete to authenticated
  using ((select public.current_rol()) = 'ADMIN');

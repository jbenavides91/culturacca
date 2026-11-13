-- Anecdotario: Dirección (ADMIN) puede corregir anotaciones ya guardadas.
-- Los docentes siguen sin poder editar (solo insertan las suyas).
-- Solo se pueden modificar el tipo y la descripción; queda registro de quién y cuándo editó.

alter table public.anecdotario
  add column if not exists editado_en timestamptz,
  add column if not exists editado_por_nombre text;

drop policy if exists "anecdotario_edicion_admin" on public.anecdotario;
create policy "anecdotario_edicion_admin" on public.anecdotario
  for update to authenticated
  using ((select public.current_rol()) = 'ADMIN')
  with check ((select public.current_rol()) = 'ADMIN');

-- Privilegios por columna: autor, alumno, taller y fecha de creación no se pueden reescribir.
revoke update on public.anecdotario from anon, authenticated;
grant update (tipo, descripcion, editado_en, editado_por_nombre) on public.anecdotario to authenticated;

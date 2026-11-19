-- Eliminar alumnos es exclusivo de ADMIN (Estudiantes → Eliminar).
-- Antes, la política escritura_delete de estudiantes (0007) admitía ADMIN, MATRICULA y CAJERO.
-- INSERT y UPDATE no cambian: Caja y Matrícula siguen creando y editando alumnos.
-- Las FK de inscripciones, asistencias, anecdotario y evento_participantes ya tienen on delete cascade.

drop policy if exists "escritura_delete" on public.estudiantes;
create policy "escritura_delete" on public.estudiantes
  for delete to authenticated
  using ((select public.current_rol()) = 'ADMIN');

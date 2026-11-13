-- Corrige sesiones generadas con un día de desfase por un error de zona horaria
-- (en UTC-6 los lunes se guardaban como martes). Ajusta TODOS los talleres a su calendario real.
-- Nunca toca sesiones cerradas ni sesiones con asistencia registrada.

-- 1. Eliminar sesiones fuera de los días/rango del taller (sin cerrar y sin asistencias)
delete from public.sesiones s
using public.grupos g
where s.grupo_id = g.id
  and s.cerrada = false
  and not exists (select 1 from public.asistencias a where a.sesion_id = s.id)
  and (
    extract(isodow from s.fecha)::int <> all (g.dias_semana)
    or s.fecha < g.fecha_inicio_ciclo
    or s.fecha > g.fecha_fin_ciclo
  );

-- 2. Crear las sesiones que faltan según el calendario del taller
insert into public.sesiones (id, grupo_id, fecha, hora_inicio, hora_fin, cerrada, tema)
select
  'ses-' || g.id || '-' || to_char(d::date, 'YYYY-MM-DD'),
  g.id,
  d::date,
  g.hora_inicio,
  g.hora_fin,
  false,
  'Sesión de ' || g.nombre
from public.grupos g
cross join lateral generate_series(g.fecha_inicio_ciclo::timestamp, g.fecha_fin_ciclo::timestamp, interval '1 day') d
where extract(isodow from d)::int = any (g.dias_semana)
  and not exists (
    select 1 from public.sesiones s where s.grupo_id = g.id and s.fecha = d::date
  )
on conflict (id) do nothing;

-- 0014: cupo máximo por taller y alertas de ocupación configurables (Configuración → Cupos).
-- Ocupados = alumnos inscritos (no de baja) + solicitudes en Caja (reservan lugar).
-- Sin cambios de RLS: solo ADMIN escribe grupos y configuracion.

alter table public.grupos
  add column if not exists cupo_maximo integer;

alter table public.grupos
  drop constraint if exists grupos_cupo_maximo_positivo;
alter table public.grupos
  add constraint grupos_cupo_maximo_positivo check (cupo_maximo is null or cupo_maximo > 0);

comment on column public.grupos.cupo_maximo is
  'Alumnos que acepta el taller (inscritos + solicitudes en Caja). Null = taller anterior sin cupo definido.';

alter table public.configuracion
  add column if not exists alertas_cupo jsonb not null default
    '{"umbral":80,"disponible":{"color":"#16A34A","texto":"Disponible"},"alerta":{"color":"#F59E0B","texto":"Por llenarse"},"lleno":{"color":"#DC2626","texto":"Lleno"}}'::jsonb;

comment on column public.configuracion.alertas_cupo is
  'Niveles de ocupación de los talleres: umbral (% desde el que está "por llenarse") y color/texto de cada nivel.';

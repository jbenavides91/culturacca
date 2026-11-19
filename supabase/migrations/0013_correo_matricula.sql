-- 0013: estado del correo de matrícula enviado al tutor (resumen + contrato firmado en PDF).
-- Las escribe la Edge Function `correo-matricula` con la service role; el frontend solo las lee.

alter table public.matriculas
  add column if not exists correo_enviado_en timestamptz,
  add column if not exists correo_error text;

comment on column public.matriculas.correo_enviado_en is
  'Último envío correcto del resumen y contrato firmado al correo del tutor (Edge Function correo-matricula).';
comment on column public.matriculas.correo_error is
  'Error del último intento de envío del correo de matrícula; null si el último envío fue correcto.';

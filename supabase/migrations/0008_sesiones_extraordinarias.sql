-- Sesiones extraordinarias (reposiciones o clases fuera de los días habituales del taller).
-- No se eliminan al reconciliar el calendario cuando cambian fechas o días del taller.
alter table public.sesiones add column if not exists extraordinaria boolean not null default false;

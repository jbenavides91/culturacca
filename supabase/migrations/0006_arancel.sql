-- Arancel configurable: costo general en configuracion + costo propio opcional por taller.
alter table public.configuracion
  add column if not exists arancel_taller numeric not null default 1200 check (arancel_taller > 0),
  add column if not exists arancel_periodo text not null default 'MENSUAL' check (arancel_periodo in ('MENSUAL','CICLO'));

alter table public.grupos
  add column if not exists costo numeric check (costo is null or costo > 0);

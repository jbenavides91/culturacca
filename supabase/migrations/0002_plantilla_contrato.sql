-- Plantilla personalizada del contrato de matrícula (editable en Configuración → Contrato).
-- null = usar la plantilla predeterminada de la app (src/utils/contractTemplate.ts).
alter table public.configuracion add column if not exists plantilla_contrato text;

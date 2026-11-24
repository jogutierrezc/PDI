-- =============================================================================
-- Informes Institucionales · datos que Planeación pide a cada tipo de unidad (0253).
--
-- Las cifras fijas (UDES en Cifras y PDI) hoy no alimentan datos. Planeación
-- define, por ciclo y por plantilla (A Decanatura, B Vicerrectoría u oficina,
-- C Rectoría de campus, D Rectoría General), QUÉ datos debe reportar la unidad:
-- el dato, la fuente de donde se consigue y la condición (justificar, sugerido
-- o no pedir). La unidad los ve ya listados en «Resultados por dimensión» y
-- escribe sus cifras; lo que escribe se guarda en su sección, no aquí.
--
-- Permisos: lee quien gestiona o tiene la pantalla de informes; escribe y borra
-- solo quien gestiona (informe_gestiona, 0192).
--
-- Requiere 0153, 0192 y 0252. Idempotente.
-- =============================================================================

create table if not exists public.informe_datos_requeridos (
  id            uuid primary key default gen_random_uuid(),
  ciclo_id      uuid not null references public.informe_ciclos (id) on delete cascade,
  plantilla     text not null,
  -- Estable entre ediciones (req_<base36>): la unidad guarda su cifra con esta clave.
  clave         text not null,
  dato          text not null,
  fuente_tipo   text not null default 'manual',
  -- Dónde dice Planeación que se consigue el dato.
  fuente_nombre text not null default '',
  -- Dimensión base (acad, prof, cal, inv, ext, fin), «c_<uuid>» de informe_criterios o '' (sin criterio).
  criterio      text not null default '',
  unidad        text not null default '',
  mayor_mejor   boolean not null default true,
  condicion     text not null default 'justificar',
  orden         int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint informe_datos_req_plantilla check (plantilla in ('A', 'B', 'C', 'D')),
  constraint informe_datos_req_dato check (char_length(btrim(dato)) between 3 and 120),
  constraint informe_datos_req_fuente_tipo check (fuente_tipo in ('manual', 'excel', 'auto', 'pdi')),
  constraint informe_datos_req_fuente_nombre check (char_length(fuente_nombre) <= 200),
  constraint informe_datos_req_unidad check (unidad in ('', ' %', ' pp', ' $')),
  constraint informe_datos_req_condicion check (condicion in ('justificar', 'sugerido', 'no')),
  constraint informe_datos_req_unico unique (ciclo_id, plantilla, clave)
);

comment on table public.informe_datos_requeridos is
  'Datos que Planeación pide por ciclo y plantilla A–D (0253): dato, fuente y condición. La unidad los ve prellenados en Resultados por dimensión.';

create index if not exists informe_datos_req_ciclo on public.informe_datos_requeridos (ciclo_id, plantilla, orden);

create or replace function public.informe_datos_requeridos_sellar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists informe_datos_requeridos_sellar on public.informe_datos_requeridos;
create trigger informe_datos_requeridos_sellar before insert or update on public.informe_datos_requeridos
  for each row execute function public.informe_datos_requeridos_sellar();

alter table public.informe_datos_requeridos enable row level security;

drop policy if exists informe_datos_req_lectura on public.informe_datos_requeridos;
create policy informe_datos_req_lectura on public.informe_datos_requeridos
  for select to authenticated
  using (public.informe_gestiona() or public.has_screen('informes'));

drop policy if exists informe_datos_req_alta on public.informe_datos_requeridos;
create policy informe_datos_req_alta on public.informe_datos_requeridos
  for insert to authenticated
  with check (public.informe_gestiona());

drop policy if exists informe_datos_req_cambio on public.informe_datos_requeridos;
create policy informe_datos_req_cambio on public.informe_datos_requeridos
  for update to authenticated
  using (public.informe_gestiona())
  with check (public.informe_gestiona());

drop policy if exists informe_datos_req_baja on public.informe_datos_requeridos;
create policy informe_datos_req_baja on public.informe_datos_requeridos
  for delete to authenticated
  using (public.informe_gestiona());

grant select, insert, update, delete on public.informe_datos_requeridos to authenticated;

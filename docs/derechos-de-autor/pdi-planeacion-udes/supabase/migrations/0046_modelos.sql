-- =============================================================================
-- PDI · 0046 · Modelos estadísticos en UDES en Cifras
--
-- Un informe puede publicar el resultado de un modelo (hoy, una regresión
-- logística binaria): sus coeficientes, razones de probabilidades con su
-- intervalo, bondad de ajuste, tabla de clasificación y la composición de la
-- muestra. Todo agregado: ningún registro individual.
--
-- La especificación va en un JSON (spec) porque cada modelo trae su propio
-- juego de variables y niveles; la ficha y el boletín la leen tal cual. Su
-- forma está documentada en src/modules/datos-abiertos/data/types.ts
-- (ModelSpec).
--
-- El bloque «modelo» de la ficha dibuja el conjunto. Va con el enum en su
-- propio archivo: el valor nuevo se estrena en 0047.
--
-- Requiere 0019. Idempotente.
-- =============================================================================

alter type public.od_block_kind add value if not exists 'modelo';

create table if not exists public.od_models (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.od_reports (id) on delete cascade,
  key         text not null,
  title       text not null,
  description text not null default '',
  note        text not null default '',
  spec        jsonb not null default '{}'::jsonb,
  office_id   uuid references public.od_offices (id) on delete set null,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint od_models_key_unique unique (report_id, key),
  constraint od_models_spec check (jsonb_typeof(spec) = 'object')
);

comment on table public.od_models is
  'Resultado agregado de un modelo estadístico publicado en un informe (coeficientes, ajuste, clasificación, muestra). Sin datos personales.';

drop trigger if exists od_models_set_updated_at on public.od_models;
create trigger od_models_set_updated_at
  before update on public.od_models
  for each row execute function public.set_updated_at();

alter table public.od_models enable row level security;

drop policy if exists od_models_read on public.od_models;
create policy od_models_read on public.od_models for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_models_write on public.od_models;
create policy od_models_write on public.od_models for all to authenticated
  using (public.od_can_edit_report(report_id)) with check (public.od_can_edit_report(report_id));

grant select on public.od_models to anon, authenticated;
grant select, insert, update, delete on public.od_models to authenticated;

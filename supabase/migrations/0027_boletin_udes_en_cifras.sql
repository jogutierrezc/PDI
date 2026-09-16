-- =============================================================================
-- PDI · 0027 · Boletín UDES en Cifras
--
-- Un documento A4 que se arma con las cifras de los informes del periodo:
-- portada, presentación y contenido, un capítulo por informe con una hoja por
-- indicador, y contraportada con las oficinas que reportan.
--
--   od_bulletins           la plantilla de un boletín: global (report_id nulo)
--                          o de un informe. Textos, imágenes, colores, fuente,
--                          qué entra y en qué orden viajan en `settings` (JSON:
--                          se leen y se guardan enteros desde la intranet).
--                          status = 'publicado' lo muestra en vivo en el portal.
--   od_bulletin_editions   ediciones congeladas: el PDF que se generó en una
--                          fecha, guardado en Storage. No cambia aunque cambien
--                          las cifras después.
--   bucket "boletines"     PDF de las ediciones e imágenes propias de plantilla.
--
-- Permisos: el boletín global es del periodo (od_can_edit_period); el de un
-- informe, de quien puede escribir ese informe (od_can_edit_report). En vivo es
-- público cuando el boletín y su periodo están publicados (y su informe, si es
-- de un informe). Una edición publicada es pública por sí misma: es un archivo
-- ya emitido.
--
-- Requiere 0019 y 0024. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plantillas
-- -----------------------------------------------------------------------------

create table if not exists public.od_bulletins (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null references public.od_periods (id) on delete cascade,
  -- Nulo = boletín global con todos los informes que tengan datos.
  report_id   uuid references public.od_reports (id) on delete cascade,
  slug        text not null,
  title       text not null,
  settings    jsonb not null default '{}'::jsonb,
  status      public.publication_status not null default 'borrador',
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint od_bulletins_slug_unique unique (period_id, slug),
  constraint od_bulletins_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on column public.od_bulletins.settings is
  'Plantilla completa: textos, imágenes, tema (colores y fuente), corte, campus y contenido (informes, indicadores y conjuntos en orden, con lo que muestra cada uno).';

drop trigger if exists od_bulletins_set_updated_at on public.od_bulletins;
create trigger od_bulletins_set_updated_at
  before update on public.od_bulletins
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Ediciones congeladas
-- -----------------------------------------------------------------------------

create table if not exists public.od_bulletin_editions (
  id            uuid primary key default gen_random_uuid(),
  bulletin_id   uuid not null references public.od_bulletins (id) on delete cascade,
  -- Copia del título y del periodo al publicar: la edición se lee sola.
  title         text not null,
  period_label  text not null default '',
  label         text not null,
  cut_label     text not null default '',
  file_path     text not null,
  file_size     bigint not null default 0,
  status        text not null default 'publicado' check (status in ('publicado', 'retirado')),
  note          text not null default '',
  published_by  uuid references public.profiles (id) on delete set null,
  published_at  timestamptz not null default now()
);

create index if not exists od_bulletin_editions_bulletin on public.od_bulletin_editions (bulletin_id, published_at desc);

-- -----------------------------------------------------------------------------
-- 3. Permisos
-- -----------------------------------------------------------------------------

create or replace function public.od_can_edit_bulletin(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.od_bulletins b
    where b.id = target
      and case when b.report_id is null then public.od_can_edit_period() else public.od_can_edit_report(b.report_id) end
  );
$$;

create or replace function public.od_bulletin_is_public(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.od_bulletins b
    join public.od_periods p on p.id = b.period_id
    where b.id = target
      and b.status = 'publicado'
      and p.status = 'publicado'
      and (b.report_id is null or public.od_report_is_public(b.report_id))
  );
$$;

alter table public.od_bulletins enable row level security;
alter table public.od_bulletin_editions enable row level security;

drop policy if exists od_bulletins_read on public.od_bulletins;
create policy od_bulletins_read on public.od_bulletins for select to anon, authenticated
  using (
    public.od_bulletin_is_public(id)
    or (public.has_role_at_least('consulta') and (report_id is null or public.od_can_see_report(report_id)))
  );

drop policy if exists od_bulletins_insert on public.od_bulletins;
create policy od_bulletins_insert on public.od_bulletins for insert to authenticated
  with check (case when report_id is null then public.od_can_edit_period() else public.od_can_edit_report(report_id) end);

drop policy if exists od_bulletins_update on public.od_bulletins;
create policy od_bulletins_update on public.od_bulletins for update to authenticated
  using (public.od_can_edit_bulletin(id))
  with check (case when report_id is null then public.od_can_edit_period() else public.od_can_edit_report(report_id) end);

drop policy if exists od_bulletins_delete on public.od_bulletins;
create policy od_bulletins_delete on public.od_bulletins for delete to authenticated
  using (public.od_can_edit_bulletin(id));

drop policy if exists od_bulletin_editions_read on public.od_bulletin_editions;
create policy od_bulletin_editions_read on public.od_bulletin_editions for select to anon, authenticated
  using (status = 'publicado' or public.has_role_at_least('consulta'));

drop policy if exists od_bulletin_editions_write on public.od_bulletin_editions;
create policy od_bulletin_editions_write on public.od_bulletin_editions for all to authenticated
  using (public.od_can_edit_bulletin(bulletin_id))
  with check (public.od_can_edit_bulletin(bulletin_id));

grant select on public.od_bulletins, public.od_bulletin_editions to anon, authenticated;
grant insert, update, delete on public.od_bulletins, public.od_bulletin_editions to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Archivos: PDF de ediciones e imágenes de plantilla
--
-- Mismo patrón que el bucket "proyectos" (0013): si el rol que aplica la
-- migración no es dueño de storage.objects, el resto queda aplicado y el aviso
-- dice qué crear a mano.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('boletines', 'boletines', true, 52428800)   -- 50 MB
  on conflict (id) do nothing;

  execute 'drop policy if exists boletines_lectura on storage.objects';
  execute $pol$
    create policy boletines_lectura on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'boletines')
  $pol$;

  execute 'drop policy if exists boletines_escritura on storage.objects';
  execute $pol$
    create policy boletines_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'boletines' and public.has_role_at_least('planeacion'))
  $pol$;

  execute 'drop policy if exists boletines_reemplazo on storage.objects';
  execute $pol$
    create policy boletines_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'boletines' and public.has_role_at_least('planeacion'))
      with check (bucket_id = 'boletines' and public.has_role_at_least('planeacion'))
  $pol$;

  execute 'drop policy if exists boletines_borrado on storage.objects';
  execute $pol$
    create policy boletines_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'boletines' and public.has_role_at_least('planeacion'))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "boletines" (%). Créalo a mano desde Storage: público en lectura, 50 MB por archivo.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';

-- =============================================================================
-- Informes Institucionales · criterios de «Resultados por dimensión» (0252).
--
-- Los resultados por dimensión se escriben a mano (cifra actual, anterior y
-- meta) y se agrupan por criterio: Gestión académica, Gestión profesoral,
-- etc. Los seis criterios base viven en el código. Esta tabla guarda los
-- demás:
--   · Planeación (o la administración) crea criterios aprobados que rigen para
--     las plantillas que elija desde un año.
--   · Una unidad puede SUGERIR un criterio (estado «propuesto»). Planeación o
--     la administración lo aprueba (con el año desde el que rige, por lo común
--     el ciclo siguiente), lo rechaza con una nota o lo archiva.
--   · Mientras tanto la unidad ya puede usar su criterio en su propio informe:
--     se guarda en la sección y no depende de esta tabla.
--
-- Permisos (sobre informe_gestiona e informe_actor de 0169 y 0192):
--   · Lee: quien gestiona; cualquiera con acceso al informe ve los aprobados;
--     el proponente ve los suyos.
--   · Sugiere: Gestor o Contribuyente de la unidad (informe_actor), solo en
--     estado «propuesto» y a su nombre.
--   · Aprueba, edita, rechaza, archiva y borra: solo quien gestiona.
--
-- Requiere 0153, 0169 y 0192. Idempotente.
-- =============================================================================

create table if not exists public.informe_criterios (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  descripcion    text not null default '',
  -- Plantillas a las que se ofrece (A–D). Vacío = todas.
  plantillas     text[] not null default '{}',
  estado         text not null default 'propuesto',
  -- Año del ciclo desde el que rige (solo aprobados). Nulo = ya.
  vigente_desde  int,
  unit_id        uuid references public.units (id) on delete set null,
  propuesto_por  uuid references public.profiles (id) on delete set null,
  nota_revision  text not null default '',
  revisado_por   uuid references public.profiles (id) on delete set null,
  revisado_en    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint informe_criterios_nombre check (char_length(btrim(nombre)) between 3 and 80),
  constraint informe_criterios_estado check (estado in ('propuesto', 'aprobado', 'rechazado', 'archivado')),
  constraint informe_criterios_plantillas check (plantillas <@ array['A', 'B', 'C', 'D']),
  constraint informe_criterios_desde check (vigente_desde is null or vigente_desde between 2000 and 2100),
  constraint informe_criterios_descripcion check (char_length(descripcion) <= 400)
);

comment on table public.informe_criterios is
  'Criterios de Resultados por dimensión además de los seis base (0252). Planeación crea y aprueba; las unidades sugieren (estado propuesto). vigente_desde es el año del ciclo desde el que rige.';

create unique index if not exists informe_criterios_nombre_vivo
  on public.informe_criterios (lower(btrim(nombre)))
  where estado in ('propuesto', 'aprobado');

-- -----------------------------------------------------------------------------
-- Quién y cuándo
-- -----------------------------------------------------------------------------

create or replace function public.informe_criterios_sellar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.propuesto_por := coalesce(new.propuesto_por, auth.uid());
    -- Quien no gestiona solo puede sugerir, a su nombre y sin revisión.
    if not public.informe_gestiona() then
      new.estado := 'propuesto';
      new.propuesto_por := auth.uid();
      new.vigente_desde := null;
      new.nota_revision := '';
      new.revisado_por := null;
      new.revisado_en := null;
    elsif new.estado <> 'propuesto' then
      new.revisado_por := auth.uid();
      new.revisado_en := now();
    end if;
  elsif new.estado is distinct from old.estado then
    new.revisado_por := auth.uid();
    new.revisado_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists informe_criterios_sellar on public.informe_criterios;
create trigger informe_criterios_sellar before insert or update on public.informe_criterios
  for each row execute function public.informe_criterios_sellar();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.informe_criterios enable row level security;

drop policy if exists informe_criterios_lectura on public.informe_criterios;
create policy informe_criterios_lectura on public.informe_criterios
  for select to authenticated
  using (
    public.informe_gestiona()
    or (estado = 'aprobado' and public.has_screen('informes'))
    or propuesto_por = auth.uid()
  );

drop policy if exists informe_criterios_alta on public.informe_criterios;
create policy informe_criterios_alta on public.informe_criterios
  for insert to authenticated
  with check (
    public.informe_gestiona()
    or (
      estado = 'propuesto'
      and unit_id is not null
      and public.informe_actor(unit_id) in ('jefe', 'editor')
    )
  );

drop policy if exists informe_criterios_cambio on public.informe_criterios;
create policy informe_criterios_cambio on public.informe_criterios
  for update to authenticated
  using (public.informe_gestiona())
  with check (public.informe_gestiona());

drop policy if exists informe_criterios_baja on public.informe_criterios;
create policy informe_criterios_baja on public.informe_criterios
  for delete to authenticated
  using (public.informe_gestiona());

grant select, insert, update, delete on public.informe_criterios to authenticated;

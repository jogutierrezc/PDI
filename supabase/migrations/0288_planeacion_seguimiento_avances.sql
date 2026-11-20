-- =============================================================================
-- PDI · 0288 · Planeación y Seguimiento · FASE 3 (avances, evidencias, riesgos y conexión con el PDI)
--
-- Contrato completo: docs/planeacion-seguimiento/CONTRATO-BD-F3.md. Requiere 0286 y 0287.
--
--   1. Conexión con el PDI: ps_actividades.pdi_conexion, ps_actividad_pdi, catálogo de pilares y líneas,
--      parámetro `pdi` al crear, editar y cargar por Excel, filtros y resumen por oficina.
--   2. Avances (físico y financiero) con validación del gestor, nunca el propio; evidencias (archivos en el
--      bucket privado ps-evidencias o enlaces); riesgos y acciones de mitigación.
--   3. Plazos de los avisos por oficina (ps_config_oficina); ps_config queda como valor por defecto.
--   4. Aviso c-ps-validacion-pendiente y disparo de c-ps-avance y c-ps-validado.
--
-- Todo es security definer con search_path fijo. Nunca capacity ni has_role_at_least (lección de 0192/gm):
-- el permiso sale de ps_poder (nivel del rol de acceso × unit_role). Sin escritura directa en las tablas.
-- Idempotente. Todo DELETE y UPDATE lleva WHERE (safeupdate, 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plazos: validar_horas en el valor por defecto y plazos propios de cada oficina
-- -----------------------------------------------------------------------------

alter table public.ps_config add column if not exists validar_horas integer not null default 72;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ps_config_validar' and conrelid = 'public.ps_config'::regclass) then
    alter table public.ps_config add constraint ps_config_validar check (validar_horas between 1 and 720);
  end if;
end $$;

/** Plazos de los avisos de UNA oficina; si no hay fila, vale ps_config (el general). */
create table if not exists public.ps_config_oficina (
  oficina_unit_id      uuid primary key references public.units (id) on delete cascade,
  dias_antes           integer[] not null default '{7,3,0}',
  vencida_max_avisos   smallint not null default 3,
  vencida_gestor_horas integer not null default 24,
  validar_horas        integer not null default 72,
  activo               boolean not null default true,
  actualizado_por      uuid references public.profiles (id) on delete set null,
  actualizado_en       timestamptz not null default now(),
  constraint ps_cfgof_dias check (cardinality(dias_antes) <= 6 and public.ps_dias_validos(dias_antes)),
  constraint ps_cfgof_max check (vencida_max_avisos between 0 and 10),
  constraint ps_cfgof_horas check (vencida_gestor_horas between 0 and 720),
  constraint ps_cfgof_validar check (validar_horas between 1 and 720)
);

comment on table public.ps_config_oficina is
  'Planeación y Seguimiento (0288): plazos de aviso propios de una oficina. Sin fila, la oficina usa ps_config. La gestiona el gestor de la oficina o el administrador.';

-- -----------------------------------------------------------------------------
-- 2. Conexión con el PDI
-- -----------------------------------------------------------------------------

alter table public.ps_actividades add column if not exists pdi_conexion text not null default 'sin_definir';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ps_act_pdi' and conrelid = 'public.ps_actividades'::regclass) then
    alter table public.ps_actividades add constraint ps_act_pdi check (pdi_conexion in ('sin_definir', 'con_pdi', 'sin_pdi'));
  end if;
end $$;

/** Pilares y líneas de acción del PDI a los que se conecta una actividad. action_line_id NULL = el pilar completo. */
create table if not exists public.ps_actividad_pdi (
  id             uuid primary key default gen_random_uuid(),
  actividad_id   uuid not null references public.ps_actividades (id) on delete cascade,
  pillar_id      uuid not null references public.pillars (id) on delete restrict,
  action_line_id uuid references public.action_lines (id) on delete restrict,
  creado_en      timestamptz not null default now()
);

-- Unicidad de (actividad, pilar, línea) tratando NULL como un valor (sin depender de NULLS NOT DISTINCT).
create unique index if not exists ps_actpdi_linea_unica on public.ps_actividad_pdi (actividad_id, pillar_id, action_line_id) where action_line_id is not null;
create unique index if not exists ps_actpdi_pilar_unico on public.ps_actividad_pdi (actividad_id, pillar_id) where action_line_id is null;
create index if not exists ps_actpdi_pilar_idx on public.ps_actividad_pdi (pillar_id);

comment on table public.ps_actividad_pdi is
  'Planeación y Seguimiento (0288): conexión de una actividad con el PDI. Solo existe con pdi_conexion = con_pdi; máx. 12 filas; la línea debe ser del pilar.';

-- -----------------------------------------------------------------------------
-- 3. Avances, evidencias, riesgos y acciones
-- -----------------------------------------------------------------------------

create table if not exists public.ps_avances (
  id             uuid primary key default gen_random_uuid(),
  actividad_id   uuid not null references public.ps_actividades (id) on delete restrict,
  version_id     uuid not null references public.ps_versiones (id) on delete restrict,
  fecha          date not null,
  av_fisico      numeric(5,2) not null,
  av_financiero  numeric(5,2),
  nota           text not null,
  estado         text not null default 'pendiente',
  reportado_por  uuid references public.profiles (id) on delete set null,
  reportado_en   timestamptz not null default now(),
  revisado_por   uuid references public.profiles (id) on delete set null,
  revisado_en    timestamptz,
  nota_revision  text,
  autovalidado   boolean not null default false,
  constraint ps_av_fisico check (av_fisico between 0 and 100),
  constraint ps_av_financiero check (av_financiero is null or av_financiero between 0 and 100),
  constraint ps_av_nota check (char_length(btrim(nota)) between 10 and 2000),
  constraint ps_av_estado check (estado in ('pendiente', 'validado', 'devuelto')),
  constraint ps_av_nota_rev check (nota_revision is null or char_length(nota_revision) <= 2000),
  constraint ps_av_revision check ((estado = 'pendiente') = (revisado_en is null)),
  -- Nadie revisa lo propio. La única excepción es el cierre administrativo del gestor (autovalidado), explícito y auditado.
  constraint ps_av_no_propio check (revisado_por is null or reportado_por is null or revisado_por <> reportado_por or autovalidado),
  constraint ps_av_auto check (not autovalidado or (estado = 'validado' and revisado_por is not distinct from reportado_por))
);

-- A lo sumo un avance pendiente por actividad.
create unique index if not exists ps_av_un_pendiente on public.ps_avances (actividad_id) where estado = 'pendiente';
create index if not exists ps_av_actividad_idx on public.ps_avances (actividad_id, reportado_en desc);
create index if not exists ps_av_autor_idx on public.ps_avances (reportado_por, reportado_en desc);
create index if not exists ps_av_pendientes_idx on public.ps_avances (reportado_en) where estado = 'pendiente';

comment on table public.ps_avances is
  'Planeación y Seguimiento (0288): avances reportados. El avance de la actividad es el del último validado. Un avance validado o devuelto no se edita.';

create table if not exists public.ps_evidencias (
  id             uuid primary key default gen_random_uuid(),
  avance_id      uuid not null references public.ps_avances (id) on delete restrict,
  actividad_id   uuid not null references public.ps_actividades (id) on delete restrict,
  tipo           text not null,
  nombre         text not null,
  storage_path   text,
  url            text,
  mime           text,
  bytes          bigint,
  huella_sha256  text,
  version_id     uuid not null references public.ps_versiones (id) on delete restrict,
  subido_por     uuid references public.profiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  orden          integer not null default 0,
  constraint ps_ev_tipo check (tipo in ('archivo', 'enlace')),
  constraint ps_ev_nombre check (char_length(btrim(nombre)) between 1 and 200),
  constraint ps_ev_coherencia check (
    (tipo = 'archivo' and storage_path is not null and url is null and mime is not null and bytes is not null)
    or (tipo = 'enlace' and url is not null and storage_path is null)),
  constraint ps_ev_url check (url is null or (url ~* '^https?://[^[:space:]]+$' and char_length(url) <= 2000)),
  constraint ps_ev_bytes check (bytes is null or bytes between 1 and 20971520),
  constraint ps_ev_huella check (huella_sha256 is null or huella_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists ps_ev_avance_idx on public.ps_evidencias (avance_id, creado_en);
create index if not exists ps_ev_actividad_idx on public.ps_evidencias (actividad_id);

create table if not exists public.ps_riesgos (
  id              uuid primary key default gen_random_uuid(),
  actividad_id    uuid not null references public.ps_actividades (id) on delete cascade,
  oficina_unit_id uuid not null references public.units (id) on delete restrict,
  titulo          text not null,
  descripcion     text not null default '',
  nivel           text not null default 'Medio',
  estado          text not null default 'abierto',
  mitigacion      text not null default '',
  nota_cierre     text not null default '',
  creado_por      uuid references public.profiles (id) on delete set null,
  creado_en       timestamptz not null default now(),
  cerrado_en      timestamptz,
  constraint ps_ri_titulo check (char_length(btrim(titulo)) between 3 and 200),
  constraint ps_ri_desc check (char_length(descripcion) <= 4000),
  constraint ps_ri_mit check (char_length(mitigacion) <= 2000 and char_length(nota_cierre) <= 1000),
  constraint ps_ri_nivel check (nivel in ('Crítico', 'Alto', 'Medio', 'Bajo')),
  constraint ps_ri_estado check (estado in ('abierto', 'mitigando', 'cerrado')),
  constraint ps_ri_cerrado check ((estado = 'cerrado') = (cerrado_en is not null))
);

create index if not exists ps_ri_actividad_idx on public.ps_riesgos (actividad_id, estado);
create index if not exists ps_ri_oficina_idx on public.ps_riesgos (oficina_unit_id, estado);

create table if not exists public.ps_acciones (
  id             uuid primary key default gen_random_uuid(),
  riesgo_id      uuid not null references public.ps_riesgos (id) on delete cascade,
  texto          text not null,
  responsable_id uuid references public.profiles (id) on delete set null,
  vence          date,
  estado         text not null default 'pendiente',
  hecha_en       timestamptz,
  creado_en      timestamptz not null default now(),
  constraint ps_ac_texto check (char_length(btrim(texto)) between 3 and 300),
  constraint ps_ac_estado check (estado in ('pendiente', 'en_curso', 'hecha')),
  constraint ps_ac_hecha check ((estado = 'hecha') = (hecha_en is not null))
);

create index if not exists ps_ac_riesgo_idx on public.ps_acciones (riesgo_id);

-- -----------------------------------------------------------------------------
-- 4. Seguridad de las tablas: solo lectura, por oficina
-- -----------------------------------------------------------------------------

alter table public.ps_config_oficina enable row level security;
alter table public.ps_actividad_pdi enable row level security;
alter table public.ps_avances enable row level security;
alter table public.ps_evidencias enable row level security;
alter table public.ps_riesgos enable row level security;
alter table public.ps_acciones enable row level security;

drop policy if exists ps_config_oficina_lectura on public.ps_config_oficina;
create policy ps_config_oficina_lectura on public.ps_config_oficina for select to authenticated
  using (public.ps_poder(oficina_unit_id) in ('admin', 'gestor'));

drop policy if exists ps_actividad_pdi_lectura on public.ps_actividad_pdi;
create policy ps_actividad_pdi_lectura on public.ps_actividad_pdi for select to authenticated
  using (exists (select 1 from public.ps_actividades a where a.id = actividad_id and public.ps_ver_oficina(a.oficina_unit_id)));

drop policy if exists ps_avances_lectura on public.ps_avances;
create policy ps_avances_lectura on public.ps_avances for select to authenticated
  using (exists (select 1 from public.ps_actividades a where a.id = actividad_id and public.ps_ver_oficina(a.oficina_unit_id)));

drop policy if exists ps_evidencias_lectura on public.ps_evidencias;
create policy ps_evidencias_lectura on public.ps_evidencias for select to authenticated
  using (exists (select 1 from public.ps_actividades a where a.id = actividad_id and public.ps_ver_oficina(a.oficina_unit_id)));

drop policy if exists ps_riesgos_lectura on public.ps_riesgos;
create policy ps_riesgos_lectura on public.ps_riesgos for select to authenticated
  using (public.ps_ver_oficina(oficina_unit_id));

drop policy if exists ps_acciones_lectura on public.ps_acciones;
create policy ps_acciones_lectura on public.ps_acciones for select to authenticated
  using (exists (select 1 from public.ps_riesgos r where r.id = riesgo_id and public.ps_ver_oficina(r.oficina_unit_id)));

revoke all on public.ps_config_oficina, public.ps_actividad_pdi, public.ps_avances, public.ps_evidencias, public.ps_riesgos, public.ps_acciones
  from public, anon, authenticated;
grant select on public.ps_config_oficina, public.ps_actividad_pdi, public.ps_avances, public.ps_evidencias, public.ps_riesgos, public.ps_acciones
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Disparadores de integridad
-- -----------------------------------------------------------------------------

/** Conexión con el PDI: solo con con_pdi, hasta 12 filas, y la línea debe ser del pilar. */
create or replace function public.ps_actividad_pdi_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conexion text;
  v_pilar uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'La conexión con el PDI no se modifica: se reemplaza completa.' using errcode = '42501';
  end if;
  select pdi_conexion into v_conexion from public.ps_actividades where id = new.actividad_id;
  if v_conexion is distinct from 'con_pdi' then
    raise exception 'Solo una actividad conectada con el PDI (con_pdi) lleva pilares y líneas.' using errcode = '23514';
  end if;
  if (select count(*) from public.ps_actividad_pdi where actividad_id = new.actividad_id) >= 12 then
    raise exception 'Una actividad admite hasta 12 conexiones con el PDI.' using errcode = '22023';
  end if;
  if new.action_line_id is not null then
    select s.pillar_id into v_pilar from public.action_lines l join public.strategic_areas s on s.id = l.area_id where l.id = new.action_line_id;
    if v_pilar is distinct from new.pillar_id then
      raise exception 'La línea de acción no pertenece al pilar indicado.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ps_actividad_pdi_integridad on public.ps_actividad_pdi;
create trigger ps_actividad_pdi_integridad before insert or update on public.ps_actividad_pdi
  for each row execute function public.ps_actividad_pdi_guard();

/**
 * Un avance se crea pendiente (o validado solo en el cierre administrativo autovalidado), con fecha no futura y sin retroceder
 * respecto al último avance validado. Validado o devuelto no se edita ni se borra; del pendiente solo cambian la revisión.
 */
create or replace function public.ps_avances_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max numeric;
  v_neutro jsonb := '{"reportado_por":null,"revisado_por":null}'::jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'Un avance no se borra.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if not (new.estado = 'pendiente' or (new.estado = 'validado' and new.autovalidado)) then
      raise exception 'Un avance nace pendiente de revisión.' using errcode = '42501';
    end if;
    if new.fecha > public.ps_hoy() then
      raise exception 'La fecha del avance no puede ser futura.' using errcode = '22023';
    end if;
  else
    if old.estado <> 'pendiente' then
      -- Solo se admite que se anule la autoría (perfil borrado: on delete set null); nada más cambia.
      if (to_jsonb(new) || v_neutro) <> (to_jsonb(old) || v_neutro) then
        raise exception 'Un avance validado o devuelto no se edita.' using errcode = '42501';
      end if;
      return new;
    end if;
    if (to_jsonb(new) - 'estado' - 'revisado_por' - 'revisado_en' - 'nota_revision' - 'reportado_por')
       <> (to_jsonb(old) - 'estado' - 'revisado_por' - 'revisado_en' - 'nota_revision' - 'reportado_por') then
      raise exception 'De un avance pendiente solo cambia su revisión.' using errcode = '42501';
    end if;
    if new.estado = 'pendiente' then return new; end if;
  end if;
  -- Monotonía: el físico no baja respecto al último avance validado (al reportar y al validar).
  if tg_op = 'INSERT' or (new.estado = 'validado' and old.estado <> 'validado') then
    select max(av_fisico) into v_max from public.ps_avances where actividad_id = new.actividad_id and estado = 'validado' and id <> new.id;
    if v_max is not null and new.av_fisico < v_max then
      raise exception 'El avance físico (%) no puede ser menor al último avance validado (%).', new.av_fisico, v_max using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ps_avances_integridad on public.ps_avances;
create trigger ps_avances_integridad before insert or update or delete on public.ps_avances
  for each row execute function public.ps_avances_guard();

/** La evidencia de un avance validado o devuelto no se agrega, no se cambia y no se borra. */
create or replace function public.ps_evidencias_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Una evidencia no se modifica: se quita y se agrega otra.' using errcode = '42501';
  end if;
  select estado into v_estado from public.ps_avances where id = coalesce(new.avance_id, old.avance_id);
  if v_estado is distinct from 'pendiente' then
    raise exception 'La evidencia de un avance ya revisado no se agrega ni se borra.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists ps_evidencias_integridad on public.ps_evidencias;
create trigger ps_evidencias_integridad before insert or update or delete on public.ps_evidencias
  for each row execute function public.ps_evidencias_guard();

-- -----------------------------------------------------------------------------
-- 6. Plazos efectivos
-- -----------------------------------------------------------------------------

/** Los plazos que valen para una oficina: los propios si existen y, si no, los generales. activo exige el interruptor general. */
create or replace function public.ps_config_efectiva(p_unit uuid)
returns table (dias_antes integer[], vencida_max_avisos integer, vencida_gestor_horas integer, validar_horas integer, activo boolean, propia boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(o.dias_antes, g.dias_antes),
         coalesce(o.vencida_max_avisos, g.vencida_max_avisos)::integer,
         coalesce(o.vencida_gestor_horas, g.vencida_gestor_horas),
         coalesce(o.validar_horas, g.validar_horas),
         g.activo and coalesce(o.activo, true),
         o.oficina_unit_id is not null
    from public.ps_config g
    left join public.ps_config_oficina o on o.oficina_unit_id = p_unit
   where g.id;
$$;

-- -----------------------------------------------------------------------------
-- 7. PDI: conexión, resolución de lo que llega de la pantalla o del Excel, catálogo
-- -----------------------------------------------------------------------------

/** La conexión de una actividad con el PDI como JSON: {conexion, items:[{pillar_id, pillar, pillar_slug, area, linea_id, linea_codigo, linea}]}. */
create or replace function public.ps_actividad_pdi_json(p_actividad uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'conexion', coalesce((select a.pdi_conexion from public.ps_actividades a where a.id = p_actividad), 'sin_definir'),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pillar_id', p.id, 'pillar', p.name, 'pillar_slug', p.slug,
        'area', s.name, 'linea_id', l.id, 'linea_codigo', l.code, 'linea', l.name) order by p.position, p.name, l.code nulls first, l.name)
        from public.ps_actividad_pdi x
        join public.pillars p on p.id = x.pillar_id
        left join public.action_lines l on l.id = x.action_line_id
        left join public.strategic_areas s on s.id = l.area_id
       where x.actividad_id = p_actividad), '[]'::jsonb));
$$;

/** Catálogo para elegir: pilares publicados → áreas → líneas de acción. */
create or replace function public.ps_pdi_catalogo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.ps_nivel_actual() = 'none' then
    raise exception 'Sin permiso: no tiene acceso a Planeación y Seguimiento.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'pillar_id', p.id, 'codigo', p.slug, 'slug', p.slug, 'numeral', p.numeral, 'nombre', p.name,
      'areas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'area_id', s.id, 'codigo', s.code, 'nombre', s.name,
          'lineas', coalesce((
            select jsonb_agg(jsonb_build_object('linea_id', l.id, 'codigo', l.code, 'nombre', l.name) order by l.position, l.code, l.name)
              from public.action_lines l where l.area_id = s.id), '[]'::jsonb)) order by s.position, s.code, s.name)
          from public.strategic_areas s where s.pillar_id = p.id), '[]'::jsonb)) order by p.position, p.name)
      from public.pillars p where p.status = 'publicado'), '[]'::jsonb);
end;
$$;

/**
 * Lee la conexión con el PDI de una actividad (de la pantalla o de la fila del Excel) y la valida.
 * Devuelve {errores:[{fila,campo,mensaje}], pdi: null | {conexion, items:[{pillar_id, action_line_id}]}}.
 *   · pantalla: pdi = {"conexion":"con_pdi"|"sin_pdi", "items":[{"pillar_id","action_line_id"}]};
 *   · Excel: pdi = «Sin conexión» | «Con PDI»; pilar_pdi (nombre o slug; varios con «;») y linea_pdi (código o nombre; varios con «;»).
 * Sin `pdi` y p_obligatorio: error (al crear o importar hay que elegir). Sin `pdi` y no obligatorio (editar): pdi nulo = no cambia.
 * Con `pdi` = sin_definir (solo al editar) también devuelve la conexión sin_definir; quien llama decide si la acepta.
 */
create or replace function public.ps_pdi_resolver(p_fila integer, p_obj jsonb, p_obligatorio boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e jsonb := '[]'::jsonb;
  v jsonb;
  t text;
  v_con text;
  v_items jsonb := '[]'::jsonb;
  it jsonb;
  x text;
  lista text[];
  v_pil uuid;
  v_lin uuid;
  v_lp uuid;
  n integer;
  v_excel boolean := false;
  v_pilares uuid[] := '{}'::uuid[];
  v_lineas_de uuid[] := '{}'::uuid[];
  c_pil text;
  c_lin text;
begin
  v := public.ps_j(p_obj, array['pdi']);
  if v is null or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
    if p_obligatorio then
      return jsonb_build_object('errores', jsonb_build_array(public.ps_err(p_fila, 'pdi',
        'Indique si la actividad se conecta con el PDI (con_pdi) o no (sin_pdi).')), 'pdi', null);
    end if;
    return jsonb_build_object('errores', e, 'pdi', null);
  end if;

  if jsonb_typeof(v) = 'object' then
    v_con := v ->> 'conexion';
    if v ? 'items' and jsonb_typeof(v -> 'items') <> 'array' then
      e := e || public.ps_err(p_fila, 'pdi', 'Los pilares y líneas del PDI deben venir como una lista.');
    else
      for it in select * from jsonb_array_elements(coalesce(v -> 'items', '[]'::jsonb)) loop
        v_pil := null; v_lin := null;
        begin
          v_pil := nullif(it ->> 'pillar_id', '')::uuid;
          v_lin := nullif(it ->> 'action_line_id', '')::uuid;
        exception when others then
          e := e || public.ps_err(p_fila, 'pdi', 'Un pilar o línea del PDI no es un identificador válido.');
          continue;
        end;
        if v_pil is null and v_lin is null then
          e := e || public.ps_err(p_fila, 'pdi', 'Cada conexión con el PDI necesita un pilar (y, si quiere, una línea).');
          continue;
        end if;
        v_items := v_items || jsonb_build_array(jsonb_build_object('pillar_id', v_pil, 'action_line_id', v_lin));
      end loop;
    end if;
  elsif public.ps_j_escalar(v) then
    v_excel := true;
    t := public.ps_texto_norm(v #>> '{}');
    if t in ('sin conexion', 'sin pdi', 'sin conexion con el pdi', 'no', 'sin conexion pdi') then v_con := 'sin_pdi';
    elsif t in ('con pdi', 'con conexion', 'con conexion con el pdi', 'si', 'con conexion pdi') then v_con := 'con_pdi';
    elsif t in ('sin definir', 'sin_definir') then v_con := 'sin_definir';
    else
      return jsonb_build_object('errores', jsonb_build_array(public.ps_err(p_fila, 'pdi', 'La conexión con el PDI debe ser «Con PDI» o «Sin conexión».')), 'pdi', null);
    end if;
    -- pilar_pdi y linea_pdi: nombres, slugs o códigos separados por «;»
    c_pil := coalesce(public.ps_j(p_obj, array['pilar_pdi']) #>> '{}', '');
    c_lin := coalesce(public.ps_j(p_obj, array['linea_pdi']) #>> '{}', '');
    if v_con <> 'con_pdi' and (btrim(c_pil) <> '' or btrim(c_lin) <> '') then
      e := e || public.ps_err(p_fila, 'pdi', 'Una actividad sin conexión con el PDI no lleva pilar ni línea.');
    elsif v_con = 'con_pdi' then
      for x in select btrim(z) from unnest(regexp_split_to_array(c_pil, '\s*;\s*')) as z where btrim(z) <> '' loop
        select p.id into v_pil from public.pillars p
         where p.status = 'publicado' and (p.slug = lower(btrim(x)) or public.ps_texto_norm(p.name) = public.ps_texto_norm(x))
         order by p.position limit 1;
        if v_pil is null then e := e || public.ps_err(p_fila, 'pilar_pdi', format('El pilar «%s» no existe en el PDI publicado.', x));
        elsif not (v_pil = any (v_pilares)) then v_pilares := v_pilares || v_pil; end if;
        v_pil := null;
      end loop;
      for x in select btrim(z) from unnest(regexp_split_to_array(c_lin, '\s*;\s*')) as z where btrim(z) <> '' loop
        select count(*), min(l.id::text)::uuid, min(s.pillar_id::text)::uuid into n, v_lin, v_pil
          from public.action_lines l join public.strategic_areas s on s.id = l.area_id join public.pillars p on p.id = s.pillar_id
         where p.status = 'publicado' and (lower(l.code) = lower(btrim(x)) or public.ps_texto_norm(l.name) = public.ps_texto_norm(x));
        if n = 0 then e := e || public.ps_err(p_fila, 'linea_pdi', format('La línea «%s» no existe en el PDI publicado.', x));
        elsif n > 1 then e := e || public.ps_err(p_fila, 'linea_pdi', format('La línea «%s» es ambigua: use su código (por ejemplo LA-4.1).', x));
        elsif cardinality(v_pilares) > 0 and not (v_pil = any (v_pilares)) then
          e := e || public.ps_err(p_fila, 'linea_pdi', format('La línea «%s» no es de ninguno de los pilares indicados.', x));
        else
          v_items := v_items || jsonb_build_array(jsonb_build_object('pillar_id', v_pil, 'action_line_id', v_lin));
          v_lineas_de := v_lineas_de || v_pil;
        end if;
        v_pil := null; v_lin := null;
      end loop;
      -- los pilares sin línea concreta entran completos
      foreach v_pil in array v_pilares loop
        if not (v_pil = any (v_lineas_de)) then
          v_items := v_items || jsonb_build_array(jsonb_build_object('pillar_id', v_pil, 'action_line_id', null));
        end if;
      end loop;
    end if;
  else
    return jsonb_build_object('errores', jsonb_build_array(public.ps_err(p_fila, 'pdi', 'La conexión con el PDI debe ser un objeto {conexion, items}.')), 'pdi', null);
  end if;

  if v_con is null or v_con not in ('con_pdi', 'sin_pdi', 'sin_definir') then
    e := e || public.ps_err(p_fila, 'pdi', 'La conexión con el PDI debe ser con_pdi o sin_pdi.');
  elsif v_con = 'sin_definir' and p_obligatorio then
    e := e || public.ps_err(p_fila, 'pdi', 'Al crear una actividad debe elegir con_pdi o sin_pdi.');
  end if;

  -- Validar cada conexión contra el PDI publicado y completar el pilar de las líneas (solo si no hay errores previos de formato).
  if jsonb_array_length(e) = 0 then
    declare
      v_ok jsonb := '[]'::jsonb;
    begin
      for it in select * from jsonb_array_elements(v_items) loop
        v_pil := nullif(it ->> 'pillar_id', '')::uuid;
        v_lin := nullif(it ->> 'action_line_id', '')::uuid;
        if v_lin is not null then
          select s.pillar_id into v_lp from public.action_lines l join public.strategic_areas s on s.id = l.area_id where l.id = v_lin;
          if v_lp is null then
            e := e || public.ps_err(p_fila, case when v_excel then 'linea_pdi' else 'pdi' end, 'Una línea de acción indicada no existe en el PDI.');
            continue;
          elsif v_pil is not null and v_pil <> v_lp then
            e := e || public.ps_err(p_fila, case when v_excel then 'linea_pdi' else 'pdi' end, 'Una línea de acción no pertenece al pilar indicado.');
            continue;
          end if;
          v_pil := v_lp;
        end if;
        if not exists (select 1 from public.pillars p where p.id = v_pil and p.status = 'publicado') then
          e := e || public.ps_err(p_fila, case when v_excel then 'pilar_pdi' else 'pdi' end, 'Un pilar indicado no existe o no está publicado en el PDI.');
          continue;
        end if;
        it := jsonb_build_object('pillar_id', v_pil, 'action_line_id', v_lin);
        if not (v_ok @> jsonb_build_array(it)) then v_ok := v_ok || jsonb_build_array(it); end if;
      end loop;
      v_items := v_ok;
    end;
    if jsonb_array_length(e) = 0 then
      if jsonb_array_length(v_items) > 12 then
        e := e || public.ps_err(p_fila, 'pdi', 'Una actividad admite hasta 12 conexiones con el PDI.');
      elsif v_con = 'con_pdi' and jsonb_array_length(v_items) = 0 then
        e := e || public.ps_err(p_fila, case when v_excel then 'pilar_pdi' else 'pdi' end, 'Con PDI exige al menos un pilar o una línea de acción.');
      elsif v_con <> 'con_pdi' and jsonb_array_length(v_items) > 0 then
        e := e || public.ps_err(p_fila, 'pdi', 'Una actividad sin conexión con el PDI no lleva pilares ni líneas.');
      end if;
    end if;
  end if;

  if jsonb_array_length(e) > 0 then return jsonb_build_object('errores', e, 'pdi', null); end if;
  return jsonb_build_object('errores', e, 'pdi', jsonb_build_object('conexion', v_con, 'items', v_items));
end;
$$;

/** Fija la conexión de una actividad con el PDI (reemplaza lo anterior). p_pdi = {conexion, items} ya validado. */
create or replace function public.ps_actividad_pdi_aplicar(p_actividad uuid, p_pdi jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
begin
  delete from public.ps_actividad_pdi where actividad_id = p_actividad;
  update public.ps_actividades set pdi_conexion = p_pdi ->> 'conexion' where id = p_actividad;
  if p_pdi ->> 'conexion' = 'con_pdi' then
    for it in select * from jsonb_array_elements(p_pdi -> 'items') loop
      insert into public.ps_actividad_pdi (actividad_id, pillar_id, action_line_id)
      values (p_actividad, (it ->> 'pillar_id')::uuid, nullif(it ->> 'action_line_id', '')::uuid);
    end loop;
  end if;
end;
$$;

/** La actividad como JSON para la interfaz (0288: con su conexión con el PDI y su avance validado). Sin correos de nadie. */
create or replace function public.ps_actividad_json(a public.ps_actividades)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', a.id,
    'plan_id', a.plan_id,
    'linea_clave', (select l.clave from public.ps_lineas l where l.id = a.linea_id),
    'linea_nombre', (select vl.nombre from public.ps_planes p join public.ps_version_lineas vl on vl.version_id = p.version_vigente_id
                      where p.id = a.plan_id and vl.linea_id = a.linea_id),
    'oficina_unit_id', a.oficina_unit_id,
    'oficina', (select u.name from public.units u where u.id = a.oficina_unit_id),
    'oficina_codigo', (select u.code from public.units u where u.id = a.oficina_unit_id),
    'campus_id', a.campus_id,
    'campus', (select c.name from public.campuses c where c.id = a.campus_id),
    'titulo', a.titulo,
    'descripcion', a.descripcion,
    'estado', a.estado,
    'prioridad', a.prioridad,
    'inicio', a.inicio,
    'fin', a.fin,
    'es_hito', a.es_hito,
    'version_creacion_id', a.version_creacion_id,
    'creada_por', a.creada_por,
    'creada_en', a.creada_en,
    'completada_en', a.completada_en,
    'orden', a.orden,
    'responsables', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.profile_id, 'nombre', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'), 'desde', s.asignado_en)
                       order by s.asignado_en)
        from public.ps_asignaciones s join public.profiles pr on pr.id = s.profile_id
       where s.actividad_id = a.id and s.quitado_en is null), '[]'::jsonb),
    'checklist', jsonb_build_object(
      'total', (select count(*) from public.ps_checklist k where k.actividad_id = a.id),
      'hechos', (select count(*) from public.ps_checklist k where k.actividad_id = a.id and k.hecho)),
    'vencida', (a.fin is not null and a.estado <> 'hecho' and a.fin < public.ps_hoy()),
    'dias_para_vencer', case when a.fin is null then null else a.fin - public.ps_hoy() end,
    'pdi', public.ps_actividad_pdi_json(a.id),
    'avance', jsonb_build_object(
      'fisico', coalesce((select v.av_fisico from public.ps_avances v where v.actividad_id = a.id and v.estado = 'validado'
                           order by v.revisado_en desc, v.id desc limit 1), 0),
      'financiero', (select v.av_financiero from public.ps_avances v where v.actividad_id = a.id and v.estado = 'validado'
                      order by v.revisado_en desc, v.id desc limit 1),
      'validado_en', (select v.revisado_en from public.ps_avances v where v.actividad_id = a.id and v.estado = 'validado'
                       order by v.revisado_en desc, v.id desc limit 1),
      'pendientes', (select count(*) from public.ps_avances v where v.actividad_id = a.id and v.estado = 'pendiente'))
  );
$$;

-- -----------------------------------------------------------------------------
-- 8. Utilidades de avances, riesgos y revisión
-- -----------------------------------------------------------------------------

/** Hook de 0287: ahora con la tabla real. Una actividad con avances no se elimina. */
create or replace function public.ps_actividad_tiene_avances(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ps_avances where actividad_id = p_id);
$$;

create or replace function public.ps_persona_json(p_perfil uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p_perfil is null then null
    else jsonb_build_object('id', p_perfil, 'nombre',
           coalesce((select nullif(btrim(pr.full_name), '') from public.profiles pr where pr.id = p_perfil), 'Sin nombre')) end;
$$;

/** AvanceJSON. «vencido»: pendiente por más horas que el plazo de validación de la oficina. */
create or replace function public.ps_avance_json(v public.ps_avances)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', v.id, 'actividad_id', v.actividad_id, 'fecha', v.fecha, 'av_fisico', v.av_fisico, 'av_financiero', v.av_financiero,
    'nota', v.nota, 'estado', v.estado,
    'reportado_por', public.ps_persona_json(v.reportado_por), 'reportado_en', v.reportado_en,
    'revisado_por', public.ps_persona_json(v.revisado_por), 'revisado_en', v.revisado_en, 'nota_revision', v.nota_revision,
    'autovalidado', v.autovalidado,
    'vencido', coalesce(v.estado = 'pendiente' and v.reportado_en + make_interval(hours => (
        select c.validar_horas from public.ps_actividades a, lateral public.ps_config_efectiva(a.oficina_unit_id) c where a.id = v.actividad_id)) < now(), false),
    'version_id', v.version_id,
    'evidencias', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'nombre', e.nombre, 'url', e.url, 'storage_path', e.storage_path,
                                          'mime', e.mime, 'bytes', e.bytes, 'huella_sha256', e.huella_sha256, 'creado_en', e.creado_en) order by e.orden, e.creado_en, e.id)
        from public.ps_evidencias e where e.avance_id = v.id), '[]'::jsonb));
$$;

create or replace function public.ps_accion_json(ac public.ps_acciones)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', ac.id, 'riesgo_id', ac.riesgo_id, 'texto', ac.texto, 'responsable_id', ac.responsable_id,
    'responsable', (select coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre') from public.profiles pr where pr.id = ac.responsable_id),
    'vence', ac.vence, 'estado', ac.estado, 'hecha_en', ac.hecha_en, 'creado_en', ac.creado_en);
$$;

create or replace function public.ps_riesgo_json(r public.ps_riesgos)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', r.id, 'actividad_id', r.actividad_id, 'oficina_unit_id', r.oficina_unit_id, 'titulo', r.titulo,
    'descripcion', r.descripcion, 'nivel', r.nivel, 'estado', r.estado, 'mitigacion', r.mitigacion, 'nota_cierre', r.nota_cierre,
    'creado_por', public.ps_persona_json(r.creado_por), 'creado_en', r.creado_en, 'cerrado_en', r.cerrado_en,
    'acciones', coalesce((select jsonb_agg(public.ps_accion_json(ac) order by ac.creado_en, ac.id) from public.ps_acciones ac where ac.riesgo_id = r.id), '[]'::jsonb));
$$;

/**
 * Por qué quien llama NO puede revisar (validar o devolver) un avance de esa autoría en esa oficina; null si puede.
 *   · nunca el propio; · solo gestor de la oficina o admin; · si el autor es gestor o admin, lo revisa un admin del módulo.
 */
create or replace function public.ps_motivo_no_revisa(p_autor uuid, p_unit uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
begin
  if v_poder is null or v_poder not in ('admin', 'gestor') then
    return 'Sin permiso: validar o devolver avances es del gestor de la oficina o del administrador.';
  end if;
  if p_autor is not null and p_autor = auth.uid() then
    return 'Sin permiso: nadie revisa un avance que reportó él mismo.';
  end if;
  if v_poder <> 'admin' and p_autor is not null
     and (p_autor in (select g from public.ps_gestores_de(p_unit) as g) or public.ps_nivel_de(p_autor) = 'admin') then
    return 'Sin permiso: el avance lo reportó un gestor; lo revisa el administrador del módulo.';
  end if;
  return null;
end;
$$;

/** Avisa que una actividad quedó hecha: a los gestores y a quienes la tenían, menos a quien lo hizo. */
create or replace function public.ps_avisar_cumplida(p_actividad uuid, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r uuid;
  v_unit uuid;
begin
  select oficina_unit_id into v_unit from public.ps_actividades where id = p_actividad;
  for r in select g from public.ps_gestores_de(v_unit) as g
           union select s.profile_id from public.ps_asignaciones s where s.actividad_id = p_actividad and s.quitado_en is null loop
    if r is distinct from auth.uid() then
      perform public.ps_aviso('c-ps-cumplida', r, p_actividad, jsonb_build_object('nota', coalesce(p_nota, '')));
    end if;
  end loop;
end;
$$;

/** Valida y guarda una evidencia de un avance PENDIENTE. Devuelve su id. Tipos: pdf, docx, xlsx, pptx, png, jpg, csv, txt, zip (hasta 20 MB). */
create or replace function public.ps_evidencia_insertar(p_avance uuid, p_ev jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.ps_avances%rowtype;
  a public.ps_actividades%rowtype;
  v_tipo text;
  v_nombre text;
  v_path text;
  v_url text;
  v_mime text;
  v_bytes bigint;
  v_huella text;
  v_ext text;
  v_ok boolean;
  v_pref text;
  v_id uuid;
begin
  select * into v from public.ps_avances where id = p_avance;
  if not found then raise exception 'El avance no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = v.actividad_id;
  if p_ev is null or jsonb_typeof(p_ev) <> 'object' then
    raise exception 'Cada evidencia debe ser un objeto {tipo, nombre, …}.' using errcode = '22023';
  end if;
  v_tipo := p_ev ->> 'tipo';
  v_nombre := btrim(coalesce(p_ev ->> 'nombre', ''));
  if v_tipo is null or v_tipo not in ('archivo', 'enlace') then
    raise exception 'El tipo de evidencia debe ser archivo o enlace.' using errcode = '22023';
  end if;
  if char_length(v_nombre) < 1 or char_length(v_nombre) > 200 then
    raise exception 'El nombre de la evidencia debe tener entre 1 y 200 caracteres.' using errcode = '22023';
  end if;
  if (select count(*) from public.ps_evidencias where avance_id = p_avance) >= 10 then
    raise exception 'Un avance admite hasta 10 evidencias.' using errcode = '22023';
  end if;
  if v_tipo = 'enlace' then
    v_url := btrim(coalesce(p_ev ->> 'url', ''));
    if v_url !~* '^https?://[^[:space:]]+$' or char_length(v_url) > 2000 then
      raise exception 'El enlace de la evidencia debe ser una dirección http o https.' using errcode = '22023';
    end if;
  else
    v_path := btrim(coalesce(p_ev ->> 'storage_path', ''));
    v_pref := a.oficina_unit_id::text || '/' || a.id::text || '/';
    if char_length(v_path) > 500 or left(v_path, char_length(v_pref)) <> v_pref or char_length(v_path) = char_length(v_pref) or v_path like '%..%' then
      raise exception 'El archivo debe estar en la carpeta de esta actividad del bucket ps-evidencias (%<uuid>-<nombre>).', v_pref using errcode = '22023';
    end if;
    v_mime := lower(btrim(coalesce(p_ev ->> 'mime', '')));
    begin
      v_bytes := (p_ev ->> 'bytes')::bigint;
    exception when others then
      raise exception 'El tamaño del archivo no es válido.' using errcode = '22023';
    end;
    if v_bytes is null or v_bytes < 1 or v_bytes > 20971520 then
      raise exception 'El archivo debe pesar entre 1 byte y 20 MB.' using errcode = '22023';
    end if;
    v_ext := lower(substring(v_nombre from '\.([A-Za-z0-9]+)$'));
    v_ok := case v_ext
      when 'pdf' then v_mime = 'application/pdf'
      when 'docx' then v_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      when 'xlsx' then v_mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      when 'pptx' then v_mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      when 'png' then v_mime = 'image/png'
      when 'jpg' then v_mime = 'image/jpeg'
      when 'jpeg' then v_mime = 'image/jpeg'
      when 'csv' then v_mime in ('text/csv', 'application/csv', 'application/vnd.ms-excel')
      when 'txt' then v_mime = 'text/plain'
      when 'zip' then v_mime in ('application/zip', 'application/x-zip-compressed')
      else false end;
    if not coalesce(v_ok, false) then
      raise exception 'Tipo de archivo no admitido (pdf, docx, xlsx, pptx, png, jpg, csv, txt o zip, y que el tipo coincida con la extensión).' using errcode = '22023';
    end if;
    v_huella := lower(nullif(btrim(coalesce(p_ev ->> 'huella_sha256', '')), ''));
    if v_huella is not null and v_huella !~ '^[0-9a-f]{64}$' then
      raise exception 'La huella sha256 debe tener 64 caracteres hexadecimales.' using errcode = '22023';
    end if;
  end if;
  insert into public.ps_evidencias (avance_id, actividad_id, tipo, nombre, storage_path, url, mime, bytes, huella_sha256, version_id, subido_por, creado_en, orden)
  values (p_avance, v.actividad_id, v_tipo, v_nombre, v_path, v_url, v_mime, v_bytes, v_huella, v.version_id, auth.uid(), clock_timestamp(),
          (select coalesce(max(e2.orden), 0) + 1 from public.ps_evidencias e2 where e2.avance_id = p_avance))
  returning id into v_id;
  perform public.ps_evento_act('evidencia.agregada', a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id,
    jsonb_build_object('avance', p_avance, 'evidencia', v_id, 'tipo', v_tipo, 'nombre', v_nombre));
  return v_id;
end;
$$;

/** Crea un riesgo ya autorizado por quien llama (validado por la función pública). Devuelve su id. */
create or replace function public.ps_riesgo_insertar(p_actividad uuid, p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_titulo text;
  v_desc text;
  v_mit text;
  v_nivel text := 'Medio';
  t text;
  v_id uuid;
begin
  select * into a from public.ps_actividades where id = p_actividad;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'El riesgo debe ser un objeto {titulo, descripcion, nivel, mitigacion}.' using errcode = '22023';
  end if;
  v_titulo := btrim(coalesce(p_datos ->> 'titulo', ''));
  v_desc := btrim(coalesce(p_datos ->> 'descripcion', ''));
  v_mit := btrim(coalesce(p_datos ->> 'mitigacion', ''));
  if char_length(v_titulo) < 3 or char_length(v_titulo) > 200 then raise exception 'El título del riesgo debe tener entre 3 y 200 caracteres.' using errcode = '22023'; end if;
  if char_length(v_desc) > 4000 then raise exception 'La descripción del riesgo supera los 4000 caracteres.' using errcode = '22023'; end if;
  if char_length(v_mit) > 2000 then raise exception 'La mitigación supera los 2000 caracteres.' using errcode = '22023'; end if;
  if p_datos ? 'nivel' and jsonb_typeof(p_datos -> 'nivel') <> 'null' then
    t := public.ps_texto_norm(p_datos ->> 'nivel');
    v_nivel := case t when 'critico' then 'Crítico' when 'alto' then 'Alto' when 'medio' then 'Medio' when 'bajo' then 'Bajo' else null end;
    if v_nivel is null then raise exception 'El nivel del riesgo debe ser Crítico, Alto, Medio o Bajo.' using errcode = '22023'; end if;
  end if;
  if (select count(*) from public.ps_riesgos where actividad_id = p_actividad and estado <> 'cerrado') >= 20 then
    raise exception 'Una actividad admite hasta 20 riesgos abiertos.' using errcode = '22023';
  end if;
  insert into public.ps_riesgos (actividad_id, oficina_unit_id, titulo, descripcion, nivel, mitigacion, creado_por)
  values (p_actividad, a.oficina_unit_id, v_titulo, v_desc, v_nivel, v_mit, auth.uid())
  returning id into v_id;
  perform public.ps_evento_act('riesgo.creado', a.plan_id, a.version_creacion_id, null, p_actividad, a.oficina_unit_id,
    jsonb_build_object('riesgo', v_id, 'titulo', v_titulo, 'nivel', v_nivel));
  return v_id;
end;
$$;

/**
 * Cierra la revisión de un avance PENDIENTE: p_decision 'validado' o 'devuelto'. Comprueba el permiso (nunca el propio; si lo reportó
 * un gestor, lo revisa un admin). Con p_mover, además cambia el estado de la actividad, deja el comentario y avisa; sin él,
 * solo toca el avance (lo usan ps_actividad_mover y ps_actividad_cerrar, que ya manejan el estado y los avisos de la actividad).
 */
create or replace function public.ps_avance_revisar(p_id uuid, p_decision text, p_nota text, p_mover boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.ps_avances%rowtype;
  a public.ps_actividades%rowtype;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_motivo text;
  v_nuevo text;
  v_clave text;
  v_fis text;
begin
  select * into v from public.ps_avances where id = p_id;
  if not found then raise exception 'El avance no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = v.actividad_id for update;
  if public.ps_poder(a.oficina_unit_id) is null then raise exception 'El avance no existe.' using errcode = 'P0002'; end if;
  select * into v from public.ps_avances where id = p_id for update;
  if v.estado <> 'pendiente' then
    raise exception 'El avance ya fue revisado (%).', v.estado using errcode = '22023';
  end if;
  v_motivo := public.ps_motivo_no_revisa(v.reportado_por, a.oficina_unit_id);
  if v_motivo is not null then raise exception '%', v_motivo using errcode = '42501'; end if;
  if char_length(v_nota) > 2000 then raise exception 'La nota supera los 2000 caracteres.' using errcode = '22023'; end if;
  if p_decision = 'devuelto' and char_length(v_nota) < 20 then
    raise exception 'Devolver un avance exige una nota de al menos 20 caracteres.' using errcode = '22023';
  end if;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  v_fis := v.av_fisico::float8::text;

  update public.ps_avances
     set estado = p_decision, revisado_por = auth.uid(), revisado_en = now(), nota_revision = nullif(v_nota, '')
   where id = p_id;
  perform public.ps_evento_act('avance.' || p_decision, a.plan_id, a.version_creacion_id, v_clave, a.id, a.oficina_unit_id,
    jsonb_build_object('avance', p_id, 'av_fisico', v.av_fisico, 'autor', v.reportado_por, 'nota', v_nota));

  if p_decision = 'validado' then
    perform public.ps_aviso('c-ps-validado', v.reportado_por, a.id, jsonb_build_object('nota', v_nota, 'fisico', v.av_fisico, 'financiero', v.av_financiero));
    if p_mover and a.estado <> 'hecho' then
      v_nuevo := case when v.av_fisico >= 100 then 'hecho'
                      when exists (select 1 from public.ps_riesgos r where r.actividad_id = a.id and r.estado <> 'cerrado' and r.nivel in ('Crítico', 'Alto')) then 'en_riesgo'
                      else 'en_curso' end;
      update public.ps_actividades
         set estado = v_nuevo, completada_en = case when v_nuevo = 'hecho' then now() else null end, actualizada_en = now()
       where id = a.id;
      insert into public.ps_comentarios (actividad_id, autor_id, tipo, texto)
      values (a.id, auth.uid(), 'cambio_estado', left('Avance validado (' || v_fis || ' %).' || case when v_nota <> '' then ' ' || v_nota else '' end, 2000));
      if v_nuevo <> a.estado then
        perform public.ps_evento_act('actividad.movida', a.plan_id, a.version_creacion_id, v_clave, a.id, a.oficina_unit_id,
          jsonb_build_object('de', a.estado, 'a', v_nuevo, 'nota', v_nota, 'devuelta', false, 'por_avance', p_id));
      end if;
      if v_nuevo = 'hecho' then perform public.ps_avisar_cumplida(a.id, v_nota); end if;
    end if;
  elsif p_mover then
    if a.estado <> 'hecho' then
      update public.ps_actividades set estado = 'en_curso', actualizada_en = now() where id = a.id;
      if a.estado <> 'en_curso' then
        perform public.ps_evento_act('actividad.movida', a.plan_id, a.version_creacion_id, v_clave, a.id, a.oficina_unit_id,
          jsonb_build_object('de', a.estado, 'a', 'en_curso', 'nota', v_nota, 'devuelta', true, 'por_avance', p_id));
      end if;
    end if;
    insert into public.ps_comentarios (actividad_id, autor_id, tipo, texto) values (a.id, auth.uid(), 'devolucion', v_nota);
    perform public.ps_aviso('c-ps-devuelto', v.reportado_por, a.id, jsonb_build_object('nota', v_nota));
  end if;
  return jsonb_build_object('ok', true,
    'avance', public.ps_avance_json((select x from public.ps_avances x where x.id = p_id)),
    'actividad', public.ps_actividad_json((select y from public.ps_actividades y where y.id = a.id)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Avances: escritura
-- -----------------------------------------------------------------------------

/**
 * Reporta un avance. Gestor y admin, o colaborador asignado. p_datos: fecha (por omisión hoy), av_fisico (0 a 100),
 * av_financiero (null = no aplica), nota (10 a 2000), evidencias:[{tipo, nombre, storage_path|url, mime, bytes, huella_sha256}],
 * riesgo:{titulo, descripcion, nivel, mitigacion}|null. Deja el avance pendiente, la actividad en «en_revision», un comentario,
 * el evento y el aviso c-ps-avance a los gestores. Un avance lleva siempre porcentaje, así que la actividad pasa a en_revision
 * aunque venga un riesgo (el riesgo queda registrado).
 */
create or replace function public.ps_avance_reportar(p_actividad uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_fecha date;
  v_fis numeric;
  v_fin numeric;
  v_nota text;
  v_evs jsonb;
  v_ri jsonb;
  v_max numeric;
  v_version uuid;
  v_id uuid;
  v_clave text;
  e jsonb;
  r uuid;
  v_antes text;
  v_fis_t text;
begin
  select * into a from public.ps_actividades where id = p_actividad for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if not (v_poder in ('admin', 'gestor')
          or (v_poder = 'colaborador' and exists (select 1 from public.ps_asignaciones s where s.actividad_id = p_actividad and s.profile_id = auth.uid() and s.quitado_en is null))) then
    raise exception 'Sin permiso: reportar avances es del gestor o de quien tiene la actividad asignada.' using errcode = '42501';
  end if;
  if a.estado = 'hecho' then raise exception 'La actividad ya está hecha: no admite más avances.' using errcode = '22023'; end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'El avance debe ser un objeto {fecha, av_fisico, av_financiero, nota, evidencias, riesgo}.' using errcode = '22023';
  end if;
  begin
    v_fecha := coalesce(nullif(p_datos ->> 'fecha', '')::date, public.ps_hoy());
    v_fis := (p_datos ->> 'av_fisico')::numeric;
    v_fin := nullif(p_datos ->> 'av_financiero', '')::numeric;
  exception when others then
    raise exception 'La fecha (AAAA-MM-DD) o los porcentajes del avance no son válidos.' using errcode = '22023';
  end;
  if v_fis is null or v_fis < 0 or v_fis > 100 then raise exception 'El avance físico debe estar entre 0 y 100.' using errcode = '22023'; end if;
  if v_fin is not null and (v_fin < 0 or v_fin > 100) then raise exception 'El avance financiero debe estar entre 0 y 100 (o vacío si no aplica).' using errcode = '22023'; end if;
  if v_fecha > public.ps_hoy() then raise exception 'La fecha del avance no puede ser futura.' using errcode = '22023'; end if;
  v_nota := btrim(coalesce(p_datos ->> 'nota', ''));
  if char_length(v_nota) < 10 or char_length(v_nota) > 2000 then raise exception 'La nota del avance debe tener entre 10 y 2000 caracteres.' using errcode = '22023'; end if;
  v_evs := coalesce(nullif(p_datos -> 'evidencias', 'null'::jsonb), '[]'::jsonb);
  if jsonb_typeof(v_evs) <> 'array' or jsonb_array_length(v_evs) > 10 then
    raise exception 'Las evidencias deben ser una lista de hasta 10.' using errcode = '22023';
  end if;
  v_ri := nullif(p_datos -> 'riesgo', 'null'::jsonb);
  if v_ri is not null and jsonb_typeof(v_ri) <> 'object' then
    raise exception 'El riesgo debe ser un objeto {titulo, descripcion, nivel, mitigacion}.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ps_avances where actividad_id = p_actividad and estado = 'pendiente') then
    raise exception 'Ya hay un avance pendiente de revisión: espere la respuesta del gestor.' using errcode = '22023';
  end if;
  select max(av_fisico) into v_max from public.ps_avances where actividad_id = p_actividad and estado = 'validado';
  if v_max is not null and v_fis < v_max then
    raise exception 'El avance físico (%) no puede ser menor al último avance validado (%).', v_fis, v_max using errcode = '22023';
  end if;

  select coalesce(p.version_vigente_id, a.version_creacion_id) into v_version from public.ps_planes p where p.id = a.plan_id;
  insert into public.ps_avances (actividad_id, version_id, fecha, av_fisico, av_financiero, nota, reportado_por)
  values (p_actividad, coalesce(v_version, a.version_creacion_id), v_fecha, v_fis, v_fin, v_nota, auth.uid())
  returning id into v_id;
  for e in select * from jsonb_array_elements(v_evs) loop
    perform public.ps_evidencia_insertar(v_id, e);
  end loop;
  if v_ri is not null then perform public.ps_riesgo_insertar(p_actividad, v_ri); end if;

  v_antes := a.estado;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  update public.ps_actividades set estado = 'en_revision', actualizada_en = now() where id = p_actividad;
  v_fis_t := v_fis::float8::text;
  insert into public.ps_comentarios (actividad_id, autor_id, tipo, texto)
  values (p_actividad, auth.uid(), 'cambio_estado', left('Avance reportado (' || v_fis_t || ' %): ' || v_nota, 2000));
  perform public.ps_evento_act('avance.reportado', a.plan_id, a.version_creacion_id, v_clave, p_actividad, a.oficina_unit_id,
    jsonb_build_object('avance', v_id, 'av_fisico', v_fis, 'av_financiero', v_fin, 'evidencias', jsonb_array_length(v_evs), 'con_riesgo', v_ri is not null));
  if v_antes <> 'en_revision' then
    perform public.ps_evento_act('actividad.movida', a.plan_id, a.version_creacion_id, v_clave, p_actividad, a.oficina_unit_id,
      jsonb_build_object('de', v_antes, 'a', 'en_revision', 'nota', '', 'devuelta', false, 'por_avance', v_id));
  end if;
  for r in select g from public.ps_gestores_de(a.oficina_unit_id) as g where g is distinct from auth.uid() loop
    perform public.ps_aviso('c-ps-avance', r, p_actividad, jsonb_build_object('nota', v_nota, 'fisico', v_fis, 'financiero', v_fin, 'avance_id', v_id));
  end loop;
  return jsonb_build_object('ok', true,
    'avance', public.ps_avance_json((select x from public.ps_avances x where x.id = v_id)),
    'actividad', public.ps_actividad_json((select y from public.ps_actividades y where y.id = p_actividad)));
end;
$$;

/** Valida un avance (gestor u admin, nunca el propio; si lo reportó un gestor, un admin). Con 100 % la actividad queda hecha. */
create or replace function public.ps_avance_validar(p_id uuid, p_nota text default '')
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.ps_avance_revisar(p_id, 'validado', p_nota, true);
$$;

/** Devuelve un avance con una nota de al menos 20 caracteres: la actividad vuelve a en_curso y se avisa a quien lo reportó. */
create or replace function public.ps_avance_devolver(p_id uuid, p_nota text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.ps_avance_revisar(p_id, 'devuelto', p_nota, true);
$$;

/** Valida hasta 50 avances, todo o nada: si uno no se puede, no se valida ninguno. */
create or replace function public.ps_avances_validar_lote(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  x uuid;
  v_ok uuid[] := '{}'::uuid[];
  v_estado text;
  v_msg text;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids from unnest(coalesce(p_ids, '{}'::uuid[])) as i where i is not null;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 50 then
    raise exception 'Indique de 1 a 50 avances.' using errcode = '22023';
  end if;
  foreach x in array v_ids loop
    begin
      perform public.ps_avance_revisar(x, 'validado', '', true);
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_estado := sqlstate;
      raise exception 'Avance %: %', x, v_msg using errcode = v_estado;
    end;
    v_ok := v_ok || x;
  end loop;
  return jsonb_build_object('ok', true, 'validados', cardinality(v_ok), 'ids', to_jsonb(v_ok));
end;
$$;

/**
 * Cierre administrativo: el gestor (o admin) da la actividad por hecha sin un reporte previo. Deja un avance de cierre validado al 100 %.
 * Es la única excepción a «nadie valida lo propio»: autor y revisor son quien cierra, el avance queda autovalidado = true y la bitácora
 * lo marca (avance.autovalidado, datos.autovalidado = true). Si había un avance pendiente de otra persona, se valida antes.
 */
create or replace function public.ps_actividad_cerrar(p_id uuid, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_pend public.ps_avances%rowtype;
  v_version uuid;
  v_id uuid;
  v_clave text;
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: cerrar una actividad es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if a.estado = 'hecho' then raise exception 'La actividad ya está hecha.' using errcode = '22023'; end if;
  if char_length(v_nota) < 10 or char_length(v_nota) > 2000 then
    raise exception 'La nota del cierre debe tener entre 10 y 2000 caracteres.' using errcode = '22023';
  end if;
  select * into v_pend from public.ps_avances where actividad_id = p_id and estado = 'pendiente';
  if found then
    if v_pend.reportado_por is not distinct from auth.uid() then
      raise exception 'Tiene un avance propio pendiente de revisión: debe revisarlo otra persona antes de cerrar.' using errcode = '42501';
    end if;
    perform public.ps_avance_revisar(v_pend.id, 'validado', v_nota, false);
  end if;
  select coalesce(p.version_vigente_id, a.version_creacion_id) into v_version from public.ps_planes p where p.id = a.plan_id;
  insert into public.ps_avances (actividad_id, version_id, fecha, av_fisico, av_financiero, nota, estado, reportado_por, revisado_por, revisado_en, nota_revision, autovalidado)
  values (p_id, coalesce(v_version, a.version_creacion_id), public.ps_hoy(), 100, null, v_nota, 'validado', auth.uid(), auth.uid(), now(), 'Cierre administrativo del gestor.', true)
  returning id into v_id;
  update public.ps_actividades set estado = 'hecho', completada_en = now(), actualizada_en = now() where id = p_id;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  insert into public.ps_comentarios (actividad_id, autor_id, tipo, texto) values (p_id, auth.uid(), 'cambio_estado', left('Cierre administrativo: ' || v_nota, 2000));
  perform public.ps_evento_act('avance.autovalidado', a.plan_id, a.version_creacion_id, v_clave, p_id, a.oficina_unit_id,
    jsonb_build_object('avance', v_id, 'autovalidado', true, 'av_fisico', 100, 'nota', v_nota));
  perform public.ps_evento_act('actividad.movida', a.plan_id, a.version_creacion_id, v_clave, p_id, a.oficina_unit_id,
    jsonb_build_object('de', a.estado, 'a', 'hecho', 'nota', v_nota, 'devuelta', false, 'por_avance', v_id, 'autovalidado', true));
  perform public.ps_avisar_cumplida(p_id, v_nota);
  return jsonb_build_object('ok', true,
    'avance', public.ps_avance_json((select x from public.ps_avances x where x.id = v_id)),
    'actividad', public.ps_actividad_json((select y from public.ps_actividades y where y.id = p_id)));
end;
$$;

/** Agrega una evidencia a un avance PENDIENTE propio (o, el gestor y el admin, a cualquiera de su oficina). */
create or replace function public.ps_evidencia_registrar(p_avance uuid, p_evidencia jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.ps_avances%rowtype;
  a public.ps_actividades%rowtype;
  v_poder text;
  v_id uuid;
begin
  select * into v from public.ps_avances where id = p_avance;
  if not found then raise exception 'El avance no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = v.actividad_id for update;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'El avance no existe.' using errcode = 'P0002'; end if;
  if not (v.reportado_por is not distinct from auth.uid() and v_poder in ('admin', 'gestor', 'colaborador')) then
    raise exception 'Sin permiso: solo quien reportó el avance le agrega evidencias.' using errcode = '42501';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'El avance ya fue revisado: no admite más evidencias.' using errcode = '22023';
  end if;
  v_id := public.ps_evidencia_insertar(p_avance, p_evidencia);
  return (select jsonb_build_object('id', e.id, 'tipo', e.tipo, 'nombre', e.nombre, 'url', e.url, 'storage_path', e.storage_path,
            'mime', e.mime, 'bytes', e.bytes, 'huella_sha256', e.huella_sha256, 'creado_en', e.creado_en) from public.ps_evidencias e where e.id = v_id);
end;
$$;

/** Quita una evidencia de un avance PENDIENTE: su autor o el gestor y el admin. El archivo del bucket lo borra la interfaz (política de storage). */
create or replace function public.ps_evidencia_quitar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.ps_evidencias%rowtype;
  v public.ps_avances%rowtype;
  a public.ps_actividades%rowtype;
  v_poder text;
begin
  select * into e from public.ps_evidencias where id = p_id;
  if not found then raise exception 'La evidencia no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = e.actividad_id for update;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La evidencia no existe.' using errcode = 'P0002'; end if;
  select * into v from public.ps_avances where id = e.avance_id;
  if not (v_poder in ('admin', 'gestor') or (v_poder = 'colaborador' and v.reportado_por is not distinct from auth.uid())) then
    raise exception 'Sin permiso: solo quien reportó el avance o el gestor quitan evidencias.' using errcode = '42501';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'La evidencia de un avance ya revisado no se borra.' using errcode = '22023';
  end if;
  delete from public.ps_evidencias where id = p_id;
  perform public.ps_evento_act('evidencia.quitada', a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id,
    jsonb_build_object('avance', e.avance_id, 'evidencia', p_id, 'nombre', e.nombre, 'storage_path', e.storage_path));
  return jsonb_build_object('ok', true, 'id', p_id, 'storage_path', e.storage_path);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Riesgos y acciones de mitigación
-- -----------------------------------------------------------------------------

/** ¿Quien llama es colaborador asignado a la actividad? */
create or replace function public.ps_asignado_a(p_actividad uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ps_asignaciones s where s.actividad_id = p_actividad and s.profile_id = auth.uid() and s.quitado_en is null);
$$;

create or replace function public.ps_riesgo_crear(p_actividad uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_id uuid;
begin
  select * into a from public.ps_actividades where id = p_actividad for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if not (v_poder in ('admin', 'gestor') or (v_poder = 'colaborador' and public.ps_asignado_a(p_actividad))) then
    raise exception 'Sin permiso: registrar riesgos es del gestor o de quien tiene la actividad asignada.' using errcode = '42501';
  end if;
  v_id := public.ps_riesgo_insertar(p_actividad, p_datos);
  return public.ps_riesgo_json((select r from public.ps_riesgos r where r.id = v_id));
end;
$$;

/** Edita un riesgo (gestor y admin): titulo, descripcion, nivel, estado (abierto | mitigando | cerrado), mitigacion. */
create or replace function public.ps_riesgo_editar(p_id uuid, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ps_riesgos%rowtype;
  a public.ps_actividades%rowtype;
  v_poder text;
  k text;
  v_titulo text;
  v_desc text;
  v_mit text;
  v_nivel text;
  v_estado text;
  t text;
  v_dif jsonb := '{}'::jsonb;
  v_nuevo public.ps_riesgos%rowtype;
begin
  select * into r from public.ps_riesgos where id = p_id for update;
  if not found then raise exception 'El riesgo no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = r.actividad_id;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'El riesgo no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: editar riesgos es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'No hay cambios que guardar.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_cambios) loop
    if k not in ('titulo', 'descripcion', 'nivel', 'estado', 'mitigacion') then
      raise exception 'El campo «%» no se puede editar aquí.', k using errcode = '22023';
    end if;
  end loop;
  v_titulo := btrim(coalesce(p_cambios ->> 'titulo', r.titulo));
  v_desc := btrim(coalesce(p_cambios ->> 'descripcion', r.descripcion));
  v_mit := btrim(coalesce(p_cambios ->> 'mitigacion', r.mitigacion));
  v_nivel := r.nivel;
  v_estado := r.estado;
  if char_length(v_titulo) < 3 or char_length(v_titulo) > 200 then raise exception 'El título del riesgo debe tener entre 3 y 200 caracteres.' using errcode = '22023'; end if;
  if char_length(v_desc) > 4000 then raise exception 'La descripción del riesgo supera los 4000 caracteres.' using errcode = '22023'; end if;
  if char_length(v_mit) > 2000 then raise exception 'La mitigación supera los 2000 caracteres.' using errcode = '22023'; end if;
  if p_cambios ? 'nivel' then
    t := public.ps_texto_norm(p_cambios ->> 'nivel');
    v_nivel := case t when 'critico' then 'Crítico' when 'alto' then 'Alto' when 'medio' then 'Medio' when 'bajo' then 'Bajo' else null end;
    if v_nivel is null then raise exception 'El nivel del riesgo debe ser Crítico, Alto, Medio o Bajo.' using errcode = '22023'; end if;
  end if;
  if p_cambios ? 'estado' then
    v_estado := p_cambios ->> 'estado';
    if v_estado is null or v_estado not in ('abierto', 'mitigando', 'cerrado') then
      raise exception 'El estado del riesgo debe ser abierto, mitigando o cerrado.' using errcode = '22023';
    end if;
  end if;
  if r.estado = 'cerrado' and v_estado <> 'cerrado'
     and (select count(*) from public.ps_riesgos where actividad_id = r.actividad_id and estado <> 'cerrado') >= 20 then
    raise exception 'Una actividad admite hasta 20 riesgos abiertos.' using errcode = '22023';
  end if;
  update public.ps_riesgos
     set titulo = v_titulo, descripcion = v_desc, mitigacion = v_mit, nivel = v_nivel, estado = v_estado,
         cerrado_en = case when v_estado = 'cerrado' then coalesce(r.cerrado_en, now()) else null end
   where id = p_id;
  if r.titulo <> v_titulo then v_dif := v_dif || jsonb_build_object('titulo', jsonb_build_object('antes', r.titulo, 'despues', v_titulo)); end if;
  if r.descripcion <> v_desc then v_dif := v_dif || jsonb_build_object('descripcion', jsonb_build_object('antes', r.descripcion, 'despues', v_desc)); end if;
  if r.mitigacion <> v_mit then v_dif := v_dif || jsonb_build_object('mitigacion', jsonb_build_object('antes', r.mitigacion, 'despues', v_mit)); end if;
  if r.nivel <> v_nivel then v_dif := v_dif || jsonb_build_object('nivel', jsonb_build_object('antes', r.nivel, 'despues', v_nivel)); end if;
  if r.estado <> v_estado then v_dif := v_dif || jsonb_build_object('estado', jsonb_build_object('antes', r.estado, 'despues', v_estado)); end if;
  perform public.ps_evento_act(case when v_estado = 'cerrado' and r.estado <> 'cerrado' then 'riesgo.cerrado' else 'riesgo.editado' end,
    a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id, jsonb_build_object('riesgo', p_id, 'cambios', v_dif));
  select * into v_nuevo from public.ps_riesgos where id = p_id;
  return public.ps_riesgo_json(v_nuevo);
end;
$$;

create or replace function public.ps_riesgo_cerrar(p_id uuid, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ps_riesgos%rowtype;
  a public.ps_actividades%rowtype;
  v_poder text;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_nuevo public.ps_riesgos%rowtype;
begin
  select * into r from public.ps_riesgos where id = p_id for update;
  if not found then raise exception 'El riesgo no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = r.actividad_id;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'El riesgo no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: cerrar riesgos es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if r.estado = 'cerrado' then raise exception 'El riesgo ya está cerrado.' using errcode = '22023'; end if;
  if char_length(v_nota) > 1000 then raise exception 'La nota supera los 1000 caracteres.' using errcode = '22023'; end if;
  update public.ps_riesgos set estado = 'cerrado', cerrado_en = now(), nota_cierre = v_nota where id = p_id;
  perform public.ps_evento_act('riesgo.cerrado', a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id,
    jsonb_build_object('riesgo', p_id, 'nota', v_nota));
  select * into v_nuevo from public.ps_riesgos where id = p_id;
  return public.ps_riesgo_json(v_nuevo);
end;
$$;

create or replace function public.ps_accion_crear(p_riesgo uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ps_riesgos%rowtype;
  a public.ps_actividades%rowtype;
  v_poder text;
  v_texto text;
  v_resp uuid;
  v_vence date;
  v_id uuid;
begin
  select * into r from public.ps_riesgos where id = p_riesgo for update;
  if not found then raise exception 'El riesgo no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = r.actividad_id;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'El riesgo no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: las acciones de mitigación las define el gestor de la oficina o el administrador.' using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'La acción debe ser un objeto {texto, responsable_id, vence}.' using errcode = '22023';
  end if;
  if r.estado = 'cerrado' then raise exception 'El riesgo está cerrado: no admite acciones.' using errcode = '22023'; end if;
  v_texto := btrim(coalesce(p_datos ->> 'texto', ''));
  if char_length(v_texto) < 3 or char_length(v_texto) > 300 then raise exception 'El texto de la acción debe tener entre 3 y 300 caracteres.' using errcode = '22023'; end if;
  begin
    v_resp := nullif(p_datos ->> 'responsable_id', '')::uuid;
    v_vence := nullif(p_datos ->> 'vence', '')::date;
  exception when others then
    raise exception 'El responsable o la fecha de la acción no son válidos.' using errcode = '22023';
  end;
  if v_resp is not null and not public.ps_asignable(v_resp, a.oficina_unit_id) then
    raise exception 'El responsable no pertenece a la oficina (como editor o jefe) o no tiene acceso al módulo.' using errcode = '22023';
  end if;
  if (select count(*) from public.ps_acciones where riesgo_id = p_riesgo) >= 10 then
    raise exception 'Un riesgo admite hasta 10 acciones.' using errcode = '22023';
  end if;
  insert into public.ps_acciones (riesgo_id, texto, responsable_id, vence) values (p_riesgo, v_texto, v_resp, v_vence) returning id into v_id;
  perform public.ps_evento_act('accion.creada', a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id,
    jsonb_build_object('riesgo', p_riesgo, 'accion', v_id, 'texto', v_texto, 'responsable', v_resp, 'vence', v_vence));
  return public.ps_accion_json((select x from public.ps_acciones x where x.id = v_id));
end;
$$;

/** Edita una acción (gestor y admin): texto, responsable_id, vence. El estado se cambia con ps_accion_marcar. */
create or replace function public.ps_accion_editar(p_id uuid, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ac public.ps_acciones%rowtype;
  r public.ps_riesgos%rowtype;
  a public.ps_actividades%rowtype;
  v_poder text;
  k text;
  v_texto text;
  v_resp uuid;
  v_vence date;
begin
  select * into ac from public.ps_acciones where id = p_id for update;
  if not found then raise exception 'La acción no existe.' using errcode = 'P0002'; end if;
  select * into r from public.ps_riesgos where id = ac.riesgo_id;
  select * into a from public.ps_actividades where id = r.actividad_id;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La acción no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: editar acciones es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'No hay cambios que guardar.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_cambios) loop
    if k not in ('texto', 'responsable_id', 'vence') then
      raise exception 'El campo «%» no se puede editar aquí.', k using errcode = '22023';
    end if;
  end loop;
  v_texto := btrim(coalesce(p_cambios ->> 'texto', ac.texto));
  v_resp := ac.responsable_id;
  v_vence := ac.vence;
  begin
    if p_cambios ? 'responsable_id' then v_resp := nullif(p_cambios ->> 'responsable_id', '')::uuid; end if;
    if p_cambios ? 'vence' then v_vence := nullif(p_cambios ->> 'vence', '')::date; end if;
  exception when others then
    raise exception 'El responsable o la fecha de la acción no son válidos.' using errcode = '22023';
  end;
  if char_length(v_texto) < 3 or char_length(v_texto) > 300 then raise exception 'El texto de la acción debe tener entre 3 y 300 caracteres.' using errcode = '22023'; end if;
  if v_resp is not null and v_resp is distinct from ac.responsable_id and not public.ps_asignable(v_resp, a.oficina_unit_id) then
    raise exception 'El responsable no pertenece a la oficina (como editor o jefe) o no tiene acceso al módulo.' using errcode = '22023';
  end if;
  update public.ps_acciones set texto = v_texto, responsable_id = v_resp, vence = v_vence where id = p_id;
  perform public.ps_evento_act('accion.editada', a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id,
    jsonb_build_object('riesgo', r.id, 'accion', p_id, 'texto', v_texto, 'responsable', v_resp, 'vence', v_vence));
  return public.ps_accion_json((select x from public.ps_acciones x where x.id = p_id));
end;
$$;

/** Marca el estado de una acción: gestor y admin cualquiera; el colaborador, solo las suyas (es el responsable). */
create or replace function public.ps_accion_marcar(p_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ac public.ps_acciones%rowtype;
  r public.ps_riesgos%rowtype;
  a public.ps_actividades%rowtype;
  v_poder text;
begin
  select * into ac from public.ps_acciones where id = p_id for update;
  if not found then raise exception 'La acción no existe.' using errcode = 'P0002'; end if;
  select * into r from public.ps_riesgos where id = ac.riesgo_id;
  select * into a from public.ps_actividades where id = r.actividad_id;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La acción no existe.' using errcode = 'P0002'; end if;
  if not (v_poder in ('admin', 'gestor') or (v_poder = 'colaborador' and ac.responsable_id is not distinct from auth.uid())) then
    raise exception 'Sin permiso: solo el gestor o el responsable de la acción la marcan.' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('pendiente', 'en_curso', 'hecha') then
    raise exception 'El estado de la acción debe ser pendiente, en_curso o hecha.' using errcode = '22023';
  end if;
  update public.ps_acciones set estado = p_estado, hecha_en = case when p_estado = 'hecha' then coalesce(ac.hecha_en, now()) else null end where id = p_id;
  perform public.ps_evento_act('accion.marcada', a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id,
    jsonb_build_object('riesgo', r.id, 'accion', p_id, 'de', ac.estado, 'a', p_estado));
  return public.ps_accion_json((select x from public.ps_acciones x where x.id = p_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Lecturas nuevas
-- -----------------------------------------------------------------------------

/** Los avances pendientes de revisión (más antiguo primero). p_unit nulo = todas las oficinas donde quien llama es gestor (o admin). */
create or replace function public.ps_avances_por_validar(p_unit uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nivel text := public.ps_nivel_actual();
begin
  if v_nivel not in ('gestor', 'admin') then
    raise exception 'Sin permiso: los avances por validar son del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if p_unit is not null and coalesce(public.ps_poder(p_unit) in ('admin', 'gestor'), false) is not true then
    raise exception 'Sin permiso: esa oficina no está a su cargo.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.ps_avance_json(v) || jsonb_build_object(
      'actividad', jsonb_build_object('id', a.id, 'titulo', a.titulo, 'oficina', (select u.name from public.units u where u.id = a.oficina_unit_id), 'fin', a.fin),
      'horas_esperando', round((extract(epoch from (now() - v.reportado_en)) / 3600)::numeric, 1),
      'puede_validar', public.ps_motivo_no_revisa(v.reportado_por, a.oficina_unit_id) is null) order by v.reportado_en, v.id)
      from public.ps_avances v
      join public.ps_actividades a on a.id = v.actividad_id
     where v.estado = 'pendiente'
       and (p_unit is null or a.oficina_unit_id = p_unit)
       and public.ps_poder(a.oficina_unit_id) in ('admin', 'gestor')), '[]'::jsonb);
end;
$$;

/** Los avances que reportó quien pregunta, con su estado y la nota de revisión (los 200 más recientes). */
create or replace function public.ps_mis_avances()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.ps_nivel_actual() = 'none' then
    raise exception 'Sin permiso: no tiene acceso a Planeación y Seguimiento.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.ps_avance_json(x.v) || jsonb_build_object('actividad', jsonb_build_object('id', x.aid, 'titulo', x.titulo, 'oficina', x.oficina))
                     order by x.reportado_en desc, x.id desc)
      from (
        select v, v.id, v.reportado_en, a.id as aid, a.titulo, (select u.name from public.units u where u.id = a.oficina_unit_id) as oficina
          from public.ps_avances v join public.ps_actividades a on a.id = v.actividad_id
         where v.reportado_por = auth.uid()
         order by v.reportado_en desc, v.id desc limit 200) x), '[]'::jsonb);
end;
$$;

/** Riesgos de una oficina con sus acciones. Filtros: nivel, estado, actividad_id. Primero los más graves. */
create or replace function public.ps_riesgos_oficina(p_unit uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_nivel text;
  v_estado text;
  v_act uuid;
  v_lista jsonb;
  v_total integer;
begin
  if public.ps_poder(p_unit) is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'Los filtros deben ser un objeto.' using errcode = '22023'; end if;
  begin
    v_nivel := nullif(f ->> 'nivel', '');
    v_estado := nullif(f ->> 'estado', '');
    v_act := nullif(f ->> 'actividad_id', '')::uuid;
    if v_nivel is not null then
      v_nivel := case public.ps_texto_norm(v_nivel) when 'critico' then 'Crítico' when 'alto' then 'Alto' when 'medio' then 'Medio' when 'bajo' then 'Bajo' else null end;
      if v_nivel is null then raise exception 'nivel'; end if;
    end if;
    if v_estado is not null and v_estado not in ('abierto', 'mitigando', 'cerrado') then raise exception 'estado'; end if;
  exception when others then
    raise exception 'Algún filtro tiene un valor inválido.' using errcode = '22023';
  end;
  select count(*) into v_total from public.ps_riesgos r
   where r.oficina_unit_id = p_unit and (v_nivel is null or r.nivel = v_nivel) and (v_estado is null or r.estado = v_estado) and (v_act is null or r.actividad_id = v_act);
  select coalesce(jsonb_agg(public.ps_riesgo_json(r) || jsonb_build_object('actividad', (select a.titulo from public.ps_actividades a where a.id = r.actividad_id))
         order by (r.estado = 'cerrado'), case r.nivel when 'Crítico' then 1 when 'Alto' then 2 when 'Medio' then 3 else 4 end, r.creado_en desc, r.id), '[]'::jsonb)
    into v_lista
    from public.ps_riesgos r
   where r.oficina_unit_id = p_unit and (v_nivel is null or r.nivel = v_nivel) and (v_estado is null or r.estado = v_estado) and (v_act is null or r.actividad_id = v_act);
  return jsonb_build_object('total', v_total, 'riesgos', v_lista);
end;
$$;

/** Cuántas actividades de la oficina están conectadas con el PDI, no lo están o no se han definido, y por pilar. */
create or replace function public.ps_resumen_pdi_oficina(p_unit uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.ps_poder(p_unit) is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'con_pdi', (select count(*) from public.ps_actividades a where a.oficina_unit_id = p_unit and a.pdi_conexion = 'con_pdi'),
    'sin_pdi', (select count(*) from public.ps_actividades a where a.oficina_unit_id = p_unit and a.pdi_conexion = 'sin_pdi'),
    'sin_definir', (select count(*) from public.ps_actividades a where a.oficina_unit_id = p_unit and a.pdi_conexion = 'sin_definir'),
    'por_pilar', coalesce((
      select jsonb_agg(jsonb_build_object('pillar_id', x.id, 'nombre', x.name, 'actividades', x.n) order by x.pos, x.name)
        from (select p.id, p.name, p.position as pos, count(distinct a.id) as n
                from public.ps_actividad_pdi d
                join public.ps_actividades a on a.id = d.actividad_id and a.oficina_unit_id = p_unit
                join public.pillars p on p.id = d.pillar_id
               group by p.id, p.name, p.position) x), '[]'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Plazos de los avisos: general (ps_config) y por oficina
-- -----------------------------------------------------------------------------

create or replace function public.ps_config_leer()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ps_puede('gestionar') then
    raise exception 'Sin permiso: los plazos de los avisos son del administrador del módulo.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('dias_antes', to_jsonb(dias_antes), 'vencida_max_avisos', vencida_max_avisos,
                                    'vencida_gestor_horas', vencida_gestor_horas, 'validar_horas', validar_horas, 'activo', activo, 'actualizado_en', actualizado_en)
            from public.ps_config where id);
end;
$$;

/** Cambia el valor POR DEFECTO de los plazos (administrador del módulo). p_validar_horas nulo conserva el actual. */
drop function if exists public.ps_config_guardar(integer[], integer, integer, boolean);
create or replace function public.ps_config_guardar(p_dias_antes integer[], p_vencida_max_avisos integer, p_vencida_gestor_horas integer, p_activo boolean default true, p_validar_horas integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias integer[];
  v_validar integer;
begin
  if not public.ps_puede('gestionar') then
    raise exception 'Sin permiso: los plazos de los avisos son del administrador del módulo.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct d order by d desc), '{}'::integer[]) into v_dias from unnest(coalesce(p_dias_antes, '{}'::integer[])) as d;
  if cardinality(v_dias) > 6 or not public.ps_dias_validos(v_dias) then
    raise exception 'Los días de aviso son hasta 6 valores entre 0 y 60.' using errcode = '22023';
  end if;
  if p_vencida_max_avisos is null or p_vencida_max_avisos not between 0 and 10 then
    raise exception 'Los avisos de vencida deben ser de 0 a 10.' using errcode = '22023';
  end if;
  if p_vencida_gestor_horas is null or p_vencida_gestor_horas not between 0 and 720 then
    raise exception 'Las horas para avisar al gestor deben ser de 0 a 720.' using errcode = '22023';
  end if;
  select coalesce(p_validar_horas, validar_horas) into v_validar from public.ps_config where id;
  if v_validar not between 1 and 720 then
    raise exception 'Las horas del plazo de validación deben ser de 1 a 720.' using errcode = '22023';
  end if;
  update public.ps_config
     set dias_antes = v_dias, vencida_max_avisos = p_vencida_max_avisos, vencida_gestor_horas = p_vencida_gestor_horas, validar_horas = v_validar,
         activo = coalesce(p_activo, true), actualizado_por = auth.uid(), actualizado_en = now()
   where id;
  perform public.ps_evento_act('config.avisos', null, null, null, null, null,
    jsonb_build_object('dias_antes', to_jsonb(v_dias), 'vencida_max_avisos', p_vencida_max_avisos, 'vencida_gestor_horas', p_vencida_gestor_horas,
                       'validar_horas', v_validar, 'activo', coalesce(p_activo, true)));
  return public.ps_config_leer();
end;
$$;

/** {por_defecto, propia, efectiva} de una oficina. El gestor y el admin los gestionan; todos los que ven la oficina leen la efectiva. */
create or replace function public.ps_config_oficina_leer(p_unit uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
begin
  if v_poder is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'oficina_unit_id', p_unit,
    'por_defecto', (select jsonb_build_object('dias_antes', to_jsonb(g.dias_antes), 'vencida_max_avisos', g.vencida_max_avisos,
                      'vencida_gestor_horas', g.vencida_gestor_horas, 'validar_horas', g.validar_horas, 'activo', g.activo) from public.ps_config g where g.id),
    'propia', (select jsonb_build_object('dias_antes', to_jsonb(o.dias_antes), 'vencida_max_avisos', o.vencida_max_avisos,
                 'vencida_gestor_horas', o.vencida_gestor_horas, 'validar_horas', o.validar_horas, 'activo', o.activo, 'actualizado_en', o.actualizado_en)
                 from public.ps_config_oficina o where o.oficina_unit_id = p_unit),
    'efectiva', (select jsonb_build_object('dias_antes', to_jsonb(c.dias_antes), 'vencida_max_avisos', c.vencida_max_avisos,
                   'vencida_gestor_horas', c.vencida_gestor_horas, 'validar_horas', c.validar_horas, 'activo', c.activo, 'propia', c.propia)
                   from public.ps_config_efectiva(p_unit) c));
end;
$$;

create or replace function public.ps_config_oficina_guardar(p_unit uuid, p_dias_antes integer[], p_vencida_max_avisos integer, p_vencida_gestor_horas integer, p_validar_horas integer, p_activo boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
  v_dias integer[];
begin
  if v_poder is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: los plazos de la oficina los define su gestor o el administrador del módulo.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct d order by d desc), '{}'::integer[]) into v_dias from unnest(coalesce(p_dias_antes, '{}'::integer[])) as d;
  if cardinality(v_dias) > 6 or not public.ps_dias_validos(v_dias) then
    raise exception 'Los días de aviso son hasta 6 valores entre 0 y 60.' using errcode = '22023';
  end if;
  if p_vencida_max_avisos is null or p_vencida_max_avisos not between 0 and 10 then
    raise exception 'Los avisos de vencida deben ser de 0 a 10.' using errcode = '22023';
  end if;
  if p_vencida_gestor_horas is null or p_vencida_gestor_horas not between 0 and 720 then
    raise exception 'Las horas para avisar al gestor deben ser de 0 a 720.' using errcode = '22023';
  end if;
  if p_validar_horas is null or p_validar_horas not between 1 and 720 then
    raise exception 'Las horas del plazo de validación deben ser de 1 a 720.' using errcode = '22023';
  end if;
  insert into public.ps_config_oficina (oficina_unit_id, dias_antes, vencida_max_avisos, vencida_gestor_horas, validar_horas, activo, actualizado_por, actualizado_en)
  values (p_unit, v_dias, p_vencida_max_avisos, p_vencida_gestor_horas, p_validar_horas, coalesce(p_activo, true), auth.uid(), now())
  on conflict (oficina_unit_id) do update
     set dias_antes = excluded.dias_antes, vencida_max_avisos = excluded.vencida_max_avisos, vencida_gestor_horas = excluded.vencida_gestor_horas,
         validar_horas = excluded.validar_horas, activo = excluded.activo, actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;
  perform public.ps_evento_act('config.avisos', null, null, null, null, p_unit,
    jsonb_build_object('oficina_unit_id', p_unit, 'dias_antes', to_jsonb(v_dias), 'vencida_max_avisos', p_vencida_max_avisos,
                       'vencida_gestor_horas', p_vencida_gestor_horas, 'validar_horas', p_validar_horas, 'activo', coalesce(p_activo, true)));
  return public.ps_config_oficina_leer(p_unit);
end;
$$;

/** Vuelve la oficina a los plazos generales. */
create or replace function public.ps_config_oficina_quitar(p_unit uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
  v_n integer;
begin
  if v_poder is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: los plazos de la oficina los define su gestor o el administrador del módulo.' using errcode = '42501';
  end if;
  delete from public.ps_config_oficina where oficina_unit_id = p_unit;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.ps_evento_act('config.avisos', null, null, null, null, p_unit,
      jsonb_build_object('oficina_unit_id', p_unit, 'quitada', true));
  end if;
  return public.ps_config_oficina_leer(p_unit);
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. Funciones de 0287 que cambian (se reemplazan por completo; mismas firmas salvo ps_actividad_normalizar)
--     ps_actividad_json (avance y PDI), ps_actividad_normalizar (pdi), ps_actividad_insertar, ps_actividades_oficina (filtros),
--     ps_actividad_crear, ps_actividad_editar, ps_actividades_cargar (pdi), ps_actividad_detalle (avances, riesgos, PDI),
--     ps_actividad_eliminar, ps_actividad_mover (avances).
-- -----------------------------------------------------------------------------

/**
 * Valida y normaliza una actividad (de una pantalla o de una fila del Excel). Devuelve
 * {errores:[{fila,campo,mensaje}], datos:{…}, conflictos:[…]}. Acepta alias de columnas del Excel.
 * p_linea_actual: la clave que ya tiene (edición); si no cambia, no se vuelve a exigir en la versión vigente.
 * p_pdi_obligatorio: al crear o importar hay que elegir la conexión con el PDI (0288); al editar, no.
 */
create or replace function public.ps_actividad_normalizar(p_fila integer, p_obj jsonb, p_plan uuid, p_unit uuid, p_es_admin boolean, p_linea_actual text default null, p_pdi_obligatorio boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e jsonb := '[]'::jsonb;
  v jsonb;
  t text;
  r jsonb;
  pl public.ps_planes%rowtype;
  lo date; hi date;
  o_titulo text; o_desc text := ''; o_prior text := 'Medio';
  o_ini date; o_fin date; o_hito boolean := false;
  o_linea uuid; o_clave text; o_campus uuid;
  o_resp uuid[] := '{}'::uuid[];
  v_of uuid; v_ok boolean;
  campo text; x text; pid uuid;
  lista text[];
  v_pdi jsonb;
begin
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then
    return jsonb_build_object('errores', jsonb_build_array(public.ps_err(p_fila, 'fila', 'La fila debe ser un objeto con los campos de la actividad.')), 'datos', null, 'conflictos', '[]'::jsonb);
  end if;
  select * into pl from public.ps_planes where id = p_plan;
  lo := make_date(pl.anio_ini, 1, 1);
  hi := make_date(pl.anio_fin, 12, 31);

  -- título
  v := public.ps_j(p_obj, array['titulo', 'actividad']);
  if v is null or not public.ps_j_escalar(v) or btrim(v #>> '{}') = '' then
    e := e || public.ps_err(p_fila, 'titulo', 'El título es obligatorio.');
  else
    o_titulo := btrim(v #>> '{}');
    if char_length(o_titulo) < 3 or char_length(o_titulo) > 200 then
      e := e || public.ps_err(p_fila, 'titulo', 'El título debe tener entre 3 y 200 caracteres.');
    end if;
  end if;

  -- descripción
  v := public.ps_j(p_obj, array['descripcion', 'desc']);
  if v is not null then
    if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'descripcion', 'La descripción debe ser un texto.');
    else
      o_desc := btrim(v #>> '{}');
      if char_length(o_desc) > 4000 then e := e || public.ps_err(p_fila, 'descripcion', 'La descripción supera los 4000 caracteres.'); end if;
    end if;
  end if;

  -- prioridad
  v := public.ps_j(p_obj, array['prioridad', 'prior']);
  if v is not null then
    if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'prioridad', 'La prioridad debe ser un texto.');
    else
      t := public.ps_texto_norm(v #>> '{}');
      if t = '' then null;
      elsif t = 'critico' then o_prior := 'Crítico';
      elsif t = 'alto' then o_prior := 'Alto';
      elsif t = 'medio' then o_prior := 'Medio';
      elsif t = 'bajo' then o_prior := 'Bajo';
      else e := e || public.ps_err(p_fila, 'prioridad', 'La prioridad debe ser Crítico, Alto, Medio o Bajo.'); end if;
    end if;
  end if;

  -- fechas
  for campo in select unnest(array['inicio', 'fin']) loop
    v := public.ps_j(p_obj, array[campo]);
    if v is not null then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        e := e || public.ps_err(p_fila, campo, 'La fecha debe venir como AAAA-MM-DD.');
      else
        begin
          if campo = 'inicio' then o_ini := (v #>> '{}')::date; else o_fin := (v #>> '{}')::date; end if;
        exception when others then
          e := e || public.ps_err(p_fila, campo, 'La fecha no existe en el calendario.');
        end;
      end if;
    end if;
  end loop;
  if o_ini is not null and o_fin is not null and o_fin < o_ini then
    e := e || public.ps_err(p_fila, 'fin', 'La fecha de fin no puede ser anterior a la de inicio.');
  end if;
  if o_ini is not null and (o_ini < lo or o_ini > hi) then
    e := e || public.ps_err(p_fila, 'inicio', format('El inicio debe estar dentro de la vigencia del plan (%s a %s).', lo, hi));
  end if;
  if o_fin is not null and (o_fin < lo or o_fin > hi) then
    e := e || public.ps_err(p_fila, 'fin', format('El fin debe estar dentro de la vigencia del plan (%s a %s).', lo, hi));
  end if;

  -- hito
  v := public.ps_j(p_obj, array['es_hito', 'hito']);
  if v is not null then
    t := public.ps_texto_norm(v #>> '{}');
    if jsonb_typeof(v) = 'boolean' then o_hito := (v #>> '{}')::boolean;
    elsif t in ('si', 'true', '1', 'x') then o_hito := true;
    elsif t in ('no', 'false', '0', '') then o_hito := false;
    else e := e || public.ps_err(p_fila, 'es_hito', 'El hito debe ser Sí o No.'); end if;
  end if;
  if o_hito and o_fin is null then
    e := e || public.ps_err(p_fila, 'fin', 'Un hito necesita fecha de fin.');
  end if;
  if o_hito and o_ini is not null and o_fin is not null and o_ini <> o_fin then
    e := e || public.ps_err(p_fila, 'inicio', 'En un hito el inicio y el fin son el mismo día (o se deja el inicio vacío).');
  end if;

  -- línea (versión vigente; de la misma oficina salvo administración)
  v := public.ps_j(p_obj, array['linea_clave', 'linea', 'proyecto']);
  if v is not null then
    if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'linea', 'La línea debe ser su clave (texto o número).');
    else
      o_clave := btrim(v #>> '{}');
      if o_clave = '' then
        o_clave := null;
      else
        select l.id, vl.oficina_unit_id into o_linea, v_of
          from public.ps_lineas l
          join public.ps_planes p on p.id = l.plan_id
          join public.ps_version_lineas vl on vl.linea_id = l.id and vl.version_id = p.version_vigente_id
         where l.plan_id = p_plan and l.clave = o_clave;
        if o_linea is null then
          if p_linea_actual is not null and o_clave = p_linea_actual then
            select l.id into o_linea from public.ps_lineas l where l.plan_id = p_plan and l.clave = o_clave;
          else
            e := e || public.ps_err(p_fila, 'linea', format('La línea «%s» no existe en la versión vigente del plan.', o_clave));
          end if;
        elsif not p_es_admin and p_linea_actual is distinct from o_clave and v_of is distinct from p_unit then
          e := e || public.ps_err(p_fila, 'linea', format('La línea «%s» es de otra oficina (o no tiene oficina asignada).', o_clave));
        end if;
      end if;
    end if;
  end if;

  -- campus: por id o por nombre; vacío = todos los campus
  v := public.ps_j(p_obj, array['campus_id']);
  if v is not null then
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      e := e || public.ps_err(p_fila, 'campus', 'El campus debe ser un identificador válido.');
    else
      o_campus := (v #>> '{}')::uuid;
      if not exists (select 1 from public.campuses where id = o_campus) then
        e := e || public.ps_err(p_fila, 'campus', 'El campus no existe en la lista de campus del portal.');
        o_campus := null;
      end if;
    end if;
  else
    v := public.ps_j(p_obj, array['campus']);
    if v is not null then
      if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'campus', 'El campus debe ser un texto.');
      elsif btrim(v #>> '{}') <> '' then
        r := public.ps_resolver_campus(v #>> '{}');
        if (r ->> 'ok')::boolean then o_campus := nullif(r ->> 'id', '')::uuid;
        else e := e || public.ps_err(p_fila, 'campus', format('El campus «%s» no existe en la lista de campus del portal.', btrim(v #>> '{}'))); end if;
      end if;
    end if;
  end if;

  -- responsables: lista (o texto con ; o ,) de correos o ids de perfil; deben ser de la oficina
  v := public.ps_j(p_obj, array['responsables', 'responsable', 'correo']);
  if v is not null then
    if jsonb_typeof(v) = 'array' then
      select array_agg(btrim(x1)) into lista from jsonb_array_elements_text(v) as x1;
    elsif public.ps_j_escalar(v) then
      select array_agg(btrim(x1)) into lista from unnest(regexp_split_to_array(v #>> '{}', '\s*[;,]\s*')) as x1;
    else
      e := e || public.ps_err(p_fila, 'responsable', 'El responsable debe ser un correo o una lista de correos.');
    end if;
    if lista is not null then
      if cardinality(lista) > 10 then
        e := e || public.ps_err(p_fila, 'responsable', 'Una actividad admite hasta 10 responsables.');
      else
        foreach x in array lista loop
          continue when x = '';
          pid := null;
          if x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            select id into pid from public.profiles where id = x::uuid;
          else
            select id into pid from public.profiles where lower(email) = lower(x) limit 1;
          end if;
          if pid is null then
            e := e || public.ps_err(p_fila, 'responsable', format('No hay una persona con «%s» en el portal.', x));
          elsif not public.ps_asignable(pid, p_unit) then
            e := e || public.ps_err(p_fila, 'responsable', format('«%s» no pertenece a la oficina (como editor o jefe) o no tiene acceso al módulo.', x));
          elsif not (pid = any (o_resp)) then
            o_resp := o_resp || pid;
          end if;
        end loop;
      end if;
    end if;
  end if;

  -- conexión con el PDI (0288)
  v_pdi := public.ps_pdi_resolver(p_fila, p_obj, p_pdi_obligatorio);
  e := e || (v_pdi -> 'errores');

  return jsonb_build_object(
    'errores', e,
    'conflictos', public.ps_conflictos_campus(o_resp, p_unit, o_campus),
    'datos', jsonb_build_object(
      'titulo', o_titulo, 'descripcion', o_desc, 'prioridad', o_prior, 'inicio', o_ini, 'fin', o_fin, 'es_hito', o_hito,
      'linea_id', o_linea, 'linea_clave', o_clave, 'campus_id', o_campus, 'responsables', to_jsonb(o_resp), 'pdi', coalesce(v_pdi -> 'pdi', 'null'::jsonb)));
end;
$$;

/** Inserta una actividad ya validada, sus asignaciones, los avisos y el evento. Devuelve su id. */
create or replace function public.ps_actividad_insertar(p_plan uuid, p_version uuid, p_unit uuid, p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_orden integer;
  r uuid;
  v_resp uuid[];
begin
  select coalesce(max(orden), 0) + 1 into v_orden from public.ps_actividades where oficina_unit_id = p_unit;
  insert into public.ps_actividades (plan_id, linea_id, oficina_unit_id, campus_id, titulo, descripcion, prioridad, inicio, fin, es_hito, version_creacion_id, creada_por, orden)
  values (p_plan, nullif(p_datos ->> 'linea_id', '')::uuid, p_unit, nullif(p_datos ->> 'campus_id', '')::uuid,
          p_datos ->> 'titulo', coalesce(p_datos ->> 'descripcion', ''), p_datos ->> 'prioridad',
          nullif(p_datos ->> 'inicio', '')::date, nullif(p_datos ->> 'fin', '')::date,
          coalesce((p_datos ->> 'es_hito')::boolean, false), p_version, auth.uid(), v_orden)
  returning id into v_id;
  if jsonb_typeof(p_datos -> 'pdi') = 'object' then perform public.ps_actividad_pdi_aplicar(v_id, p_datos -> 'pdi'); end if;
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_resp from jsonb_array_elements_text(coalesce(p_datos -> 'responsables', '[]'::jsonb)) as x;
  foreach r in array v_resp loop
    insert into public.ps_asignaciones (actividad_id, profile_id, asignado_por, nota) values (v_id, r, auth.uid(), 'Asignada al crear la actividad.');
    perform public.ps_aviso('c-ps-asignacion', r, v_id);
  end loop;
  perform public.ps_evento_act('actividad.creada', p_plan, p_version, p_datos ->> 'linea_clave', v_id, p_unit,
    jsonb_build_object('titulo', p_datos ->> 'titulo', 'responsables', to_jsonb(v_resp), 'fin', p_datos ->> 'fin',
                       'pdi', coalesce(p_datos #>> '{pdi,conexion}', 'sin_definir')));
  return v_id;
end;
$$;

/**
 * Actividades de una oficina con filtros (jsonb, todos opcionales):
 *   estado (texto o lista), prioridad, perfil (uuid, responsable), sin_asignar (bool), linea_clave, campus_id,
 *   vencidas (bool), fin_desde, fin_hasta (AAAA-MM-DD), q (texto en el título), incluir_subunidades (bool), limite (≤ 1000),
 *   pdi (con_pdi | sin_pdi | sin_definir), pillar_id (conectadas con ese pilar del PDI).
 */
create or replace function public.ps_actividades_oficina(p_unit uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_poder text := public.ps_poder(p_unit);
  v_estados text[];
  v_prior text[];
  v_perfil uuid;
  v_campus uuid;
  v_desde date; v_hasta date;
  v_pdi text := nullif(f ->> 'pdi', '');
  v_pilar uuid;
  v_q text := lower(btrim(coalesce(f ->> 'q', '')));
  v_lim integer := 500;
  v_sub boolean := coalesce(f ->> 'incluir_subunidades', 'false') = 'true';
  v_total integer;
  v_lista jsonb;
  v_ids uuid[];
begin
  if v_poder is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  if jsonb_typeof(f) <> 'object' then
    raise exception 'Los filtros deben ser un objeto.' using errcode = '22023';
  end if;
  begin
    v_estados := case jsonb_typeof(f -> 'estado') when 'string' then array[f ->> 'estado']
                 when 'array' then (select array_agg(x) from jsonb_array_elements_text(f -> 'estado') as x) end;
    v_prior := case jsonb_typeof(f -> 'prioridad') when 'string' then array[f ->> 'prioridad']
               when 'array' then (select array_agg(x) from jsonb_array_elements_text(f -> 'prioridad') as x) end;
    v_perfil := nullif(f ->> 'perfil', '')::uuid;
    v_campus := nullif(f ->> 'campus_id', '')::uuid;
    v_desde := nullif(f ->> 'fin_desde', '')::date;
    v_hasta := nullif(f ->> 'fin_hasta', '')::date;
    v_pilar := nullif(f ->> 'pillar_id', '')::uuid;
    if v_pdi is not null and v_pdi not in ('con_pdi', 'sin_pdi', 'sin_definir') then raise exception 'pdi'; end if;
    if f ? 'limite' then v_lim := least(greatest((f ->> 'limite')::integer, 1), 1000); end if;
  exception when others then
    raise exception 'Algún filtro tiene un valor inválido.' using errcode = '22023';
  end;

  select coalesce(array_agg(x.id order by x.fin nulls last, x.orden), '{}'::uuid[]) into v_ids
    from (
      select a.id, a.fin, a.orden
        from public.ps_actividades a
       where (a.oficina_unit_id = p_unit
              or (v_sub and a.oficina_unit_id in (
                    with recursive d as (select id from public.units where id = p_unit
                                         union all select u.id from public.units u join d on u.parent_id = d.id)
                    select id from d)))
         and public.ps_ver_oficina(a.oficina_unit_id)
         and (v_estados is null or a.estado = any (v_estados))
         and (v_prior is null or a.prioridad = any (v_prior))
         and (v_perfil is null or exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.profile_id = v_perfil and s.quitado_en is null))
         and (coalesce(f ->> 'sin_asignar', 'false') <> 'true' or not exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.quitado_en is null))
         and (nullif(f ->> 'linea_clave', '') is null or a.linea_id = (select l.id from public.ps_lineas l where l.plan_id = a.plan_id and l.clave = f ->> 'linea_clave'))
         and (v_campus is null or a.campus_id = v_campus)
         and (coalesce(f ->> 'vencidas', 'false') <> 'true' or (a.estado <> 'hecho' and a.fin < public.ps_hoy()))
         and (v_desde is null or a.fin >= v_desde)
         and (v_hasta is null or a.fin <= v_hasta)
         and (v_q = '' or position(v_q in lower(a.titulo)) > 0)
         and (v_pdi is null or a.pdi_conexion = v_pdi)
         and (v_pilar is null or exists (select 1 from public.ps_actividad_pdi x where x.actividad_id = a.id and x.pillar_id = v_pilar))
    ) x;
  v_total := cardinality(v_ids);
  v_ids := v_ids[1:v_lim];
  select coalesce(jsonb_agg(public.ps_actividad_json(a) order by array_position(v_ids, a.id)), '[]'::jsonb) into v_lista
    from public.ps_actividades a where a.id = any (v_ids);
  return jsonb_build_object(
    'oficina', (select jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code, 'poder', v_poder) from public.units u where u.id = p_unit),
    'total', v_total, 'actividades', v_lista);
end;
$$;

/**
 * Crea una actividad en una oficina. p_datos: titulo, descripcion, linea_clave, campus_id (o campus por nombre),
 * prioridad, inicio, fin, es_hito, responsables (lista de ids de perfil o correos), pdi ({conexion, items}: obligatorio). Solo gestor y admin.
 * Devuelve {ok:true, actividad} o, si algún responsable tiene otro campus y no se confirmó,
 * {ok:false, requiere_confirmacion:true, conflictos_campus:[…]} sin crear nada.
 */
create or replace function public.ps_actividad_crear(p_plan uuid, p_unit uuid, p_datos jsonb, p_confirmar_campus boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
  v_plan public.ps_planes%rowtype;
  v_n jsonb;
  v_id uuid;
begin
  if v_poder is null or v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: crear actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  select * into v_plan from public.ps_planes where id = p_plan;
  if not found then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if v_plan.version_vigente_id is null then
    raise exception 'El plan todavía no tiene una versión vigente: no se pueden crear actividades.' using errcode = '22023';
  end if;
  v_n := public.ps_actividad_normalizar(null, p_datos, p_plan, p_unit, v_poder = 'admin', null, true);
  if jsonb_array_length(v_n -> 'errores') > 0 then
    raise exception '%', (v_n -> 'errores' -> 0 ->> 'mensaje') using errcode = '22023';
  end if;
  if jsonb_array_length(v_n -> 'conflictos') > 0 and not coalesce(p_confirmar_campus, false) then
    return jsonb_build_object('ok', false, 'requiere_confirmacion', true, 'conflictos_campus', v_n -> 'conflictos');
  end if;
  v_id := public.ps_actividad_insertar(p_plan, v_plan.version_vigente_id, p_unit, v_n -> 'datos');
  return jsonb_build_object('ok', true, 'conflictos_campus', v_n -> 'conflictos',
    'actividad', public.ps_actividad_json((select a from public.ps_actividades a where a.id = v_id)));
end;
$$;

/** Edita una actividad (gestor y admin). Campos: titulo, descripcion, linea_clave, campus_id o campus, prioridad, inicio, fin, es_hito, pdi. */
create or replace function public.ps_actividad_editar(p_id uuid, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_clave text;
  v_mezcla jsonb;
  v_n jsonb;
  v_d jsonb;
  k text;
  v_dif jsonb := '{}'::jsonb;
  v_antes jsonb;
  v_pdi_antes jsonb;
  v_pdi_desp jsonb;
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: editar actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'No hay cambios que guardar.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_cambios) loop
    if k not in ('titulo', 'descripcion', 'linea_clave', 'campus_id', 'campus', 'prioridad', 'inicio', 'fin', 'es_hito', 'pdi') then
      raise exception 'El campo «%» no se puede editar aquí.', k using errcode = '22023';
    end if;
  end loop;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  v_antes := jsonb_build_object('titulo', a.titulo, 'descripcion', a.descripcion, 'linea_clave', v_clave, 'campus_id', a.campus_id,
                                'prioridad', a.prioridad, 'inicio', a.inicio, 'fin', a.fin, 'es_hito', a.es_hito);
  v_mezcla := v_antes;
  if p_cambios ? 'campus' and not p_cambios ? 'campus_id' then v_mezcla := v_mezcla - 'campus_id'; end if;
  v_mezcla := v_mezcla || p_cambios;
  v_n := public.ps_actividad_normalizar(null, v_mezcla, a.plan_id, a.oficina_unit_id, v_poder = 'admin', v_clave, false);
  if jsonb_array_length(v_n -> 'errores') > 0 then
    raise exception '%', (v_n -> 'errores' -> 0 ->> 'mensaje') using errcode = '22023';
  end if;
  v_d := v_n -> 'datos';
  if jsonb_typeof(v_d -> 'pdi') = 'object' and (v_d #>> '{pdi,conexion}') = 'sin_definir' and a.pdi_conexion <> 'sin_definir' then
    raise exception 'Una actividad ya conectada (o desconectada) del PDI no vuelve a «sin definir».' using errcode = '22023';
  end if;
  v_pdi_antes := public.ps_actividad_pdi_json(p_id);
  update public.ps_actividades set
    titulo = v_d ->> 'titulo', descripcion = coalesce(v_d ->> 'descripcion', ''), prioridad = v_d ->> 'prioridad',
    inicio = nullif(v_d ->> 'inicio', '')::date, fin = nullif(v_d ->> 'fin', '')::date,
    es_hito = coalesce((v_d ->> 'es_hito')::boolean, false), linea_id = nullif(v_d ->> 'linea_id', '')::uuid,
    campus_id = nullif(v_d ->> 'campus_id', '')::uuid, actualizada_en = now()
   where id = p_id;
  if jsonb_typeof(v_d -> 'pdi') = 'object' then
    perform public.ps_actividad_pdi_aplicar(p_id, v_d -> 'pdi');
    v_pdi_desp := public.ps_actividad_pdi_json(p_id);
    if v_pdi_desp is distinct from v_pdi_antes then
      perform public.ps_evento_act('actividad.pdi', a.plan_id, a.version_creacion_id, v_d ->> 'linea_clave', p_id, a.oficina_unit_id,
        jsonb_build_object('antes', v_pdi_antes, 'despues', v_pdi_desp));
    end if;
  end if;
  for k in select jsonb_object_keys(v_antes) loop
    if (v_antes -> k) is distinct from (v_d -> k) then
      v_dif := v_dif || jsonb_build_object(k, jsonb_build_object('antes', v_antes -> k, 'despues', coalesce(v_d -> k, 'null'::jsonb)));
    end if;
  end loop;
  perform public.ps_evento_act('actividad.editada', a.plan_id, a.version_creacion_id, v_d ->> 'linea_clave', p_id, a.oficina_unit_id, jsonb_build_object('cambios', v_dif));
  return public.ps_actividad_json((select x from public.ps_actividades x where x.id = p_id));
end;
$$;

/**
 * Carga actividades de una oficina desde filas del Excel. TODO O NADA: con un solo error no se crea nada y se informan
 * todos los errores por fila y campo. Solo gestor de la oficina y admin. Columnas (con alias): titulo (actividad),
 * descripcion (desc), linea (linea_clave, proyecto), campus, prioridad (prior), inicio, fin, hito (es_hito),
 * responsable (responsables, correo: correos separados por ; o ,), pdi («Con PDI» | «Sin conexión», obligatoria), pilar_pdi y linea_pdi
 * (varios separados por ;). Duplicados (mismo título, línea y fin) se rechazan.
 * Devuelve {creadas, recibidas, errores:[{fila, campo, mensaje}], ids}.
 */
create or replace function public.ps_actividades_cargar(p_unit uuid, p_filas jsonb, p_plan uuid default null, p_confirmar_campus boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
  v_plan public.ps_planes%rowtype;
  v_n integer;
  i integer;
  v_err jsonb := '[]'::jsonb;
  v_datos jsonb := '[]'::jsonb;
  v_res jsonb;
  v_d jsonb;
  c jsonb;
  v_vistas jsonb := '{}'::jsonb;
  v_clave text;
  v_ids jsonb := '[]'::jsonb;
  v_id uuid;
  v_planes integer;
begin
  if v_poder is null or v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: cargar actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if p_plan is null then
    select count(*) into v_planes from public.ps_planes where version_vigente_id is not null;
    if v_planes = 0 then
      return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
        'errores', jsonb_build_array(public.ps_err(null, 'plan', 'No hay un plan con versión vigente.')));
    elsif v_planes > 1 then
      return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
        'errores', jsonb_build_array(public.ps_err(null, 'plan', 'Hay varios planes vigentes: indique cuál.')));
    end if;
    select * into v_plan from public.ps_planes where version_vigente_id is not null;
  else
    select * into v_plan from public.ps_planes where id = p_plan;
    if not found then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
    if v_plan.version_vigente_id is null then
      return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
        'errores', jsonb_build_array(public.ps_err(null, 'plan', 'El plan todavía no tiene una versión vigente.')));
    end if;
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
      'errores', jsonb_build_array(public.ps_err(null, 'filas', 'Se esperaba una lista con al menos una fila.')));
  end if;
  v_n := jsonb_array_length(p_filas);
  if v_n > 500 then
    return jsonb_build_object('creadas', 0, 'recibidas', v_n, 'ids', '[]'::jsonb,
      'errores', jsonb_build_array(public.ps_err(null, 'filas', 'La carga admite hasta 500 filas.')));
  end if;

  for i in 1 .. v_n loop
    v_res := public.ps_actividad_normalizar(i, p_filas -> (i - 1), v_plan.id, p_unit, v_poder = 'admin', null, true);
    v_err := v_err || (v_res -> 'errores');
    v_d := v_res -> 'datos';
    if jsonb_array_length(v_res -> 'errores') = 0 and v_d is not null then
      if jsonb_array_length(v_res -> 'conflictos') > 0 and not coalesce(p_confirmar_campus, false) then
        for c in select * from jsonb_array_elements(v_res -> 'conflictos') loop
          v_err := v_err || public.ps_err(i, 'responsable', format('%s tiene el campus %s y la actividad es de %s: confirme la asignación para continuar.',
            c ->> 'nombre', c ->> 'campus_miembro', c ->> 'campus_actividad'));
        end loop;
      end if;
      v_clave := public.ps_texto_norm(v_d ->> 'titulo') || '|' || coalesce(v_d ->> 'linea_clave', '') || '|' || coalesce(v_d ->> 'fin', '');
      if v_vistas ? v_clave then
        v_err := v_err || public.ps_err(i, 'titulo', format('Fila repetida: es igual a la fila %s.', v_vistas ->> v_clave));
      else
        v_vistas := v_vistas || jsonb_build_object(v_clave, i);
        if exists (select 1 from public.ps_actividades a
                    where a.oficina_unit_id = p_unit and public.ps_texto_norm(a.titulo) = public.ps_texto_norm(v_d ->> 'titulo')
                      and a.linea_id is not distinct from nullif(v_d ->> 'linea_id', '')::uuid and a.fin is not distinct from nullif(v_d ->> 'fin', '')::date) then
          v_err := v_err || public.ps_err(i, 'titulo', 'Ya existe una actividad igual en la oficina (mismo título, línea y fin).');
        end if;
      end if;
    end if;
    v_datos := v_datos || jsonb_build_array(coalesce(v_d, 'null'::jsonb));
  end loop;

  if jsonb_array_length(v_err) > 0 then
    return jsonb_build_object('creadas', 0, 'recibidas', v_n, 'ids', '[]'::jsonb,
      'errores', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(v_err) as x limit 500) s));
  end if;

  for i in 0 .. v_n - 1 loop
    v_id := public.ps_actividad_insertar(v_plan.id, v_plan.version_vigente_id, p_unit, v_datos -> i);
    v_ids := v_ids || to_jsonb(v_id);
  end loop;
  perform public.ps_evento_act('actividades.cargadas', v_plan.id, v_plan.version_vigente_id, null, null, p_unit, jsonb_build_object('creadas', v_n));
  return jsonb_build_object('creadas', v_n, 'recibidas', v_n, 'errores', '[]'::jsonb, 'ids', v_ids);
end;
$$;

/** Una actividad con su checklist, su historial de asignaciones, sus comentarios, su PDI, sus avances (con evidencias) y sus riesgos. */
create or replace function public.ps_actividad_detalle(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
begin
  select * into a from public.ps_actividades where id = p_id;
  if not found or public.ps_poder(a.oficina_unit_id) is null then
    raise exception 'La actividad no existe o no está a su alcance.' using errcode = 'P0002';
  end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  return jsonb_build_object(
    'actividad', public.ps_actividad_json(a),
    'poder', v_poder,
    'pdi', public.ps_actividad_pdi_json(a.id),
    'avances', coalesce((select jsonb_agg(public.ps_avance_json(v) order by v.reportado_en desc, v.id desc)
                           from public.ps_avances v where v.actividad_id = a.id), '[]'::jsonb),
    'riesgos', coalesce((select jsonb_agg(public.ps_riesgo_json(r) order by r.creado_en desc, r.id)
                           from public.ps_riesgos r where r.actividad_id = a.id), '[]'::jsonb),
    'checklist', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'orden', k.orden, 'texto', k.texto, 'hecho', k.hecho, 'hecho_en', k.hecho_en) order by k.orden, k.creado_en)
                             from public.ps_checklist k where k.actividad_id = a.id), '[]'::jsonb),
    'asignaciones', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'perfil_id', s.profile_id, 'nombre', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'),
        'asignado_por', s.asignado_por, 'asignado_en', s.asignado_en, 'nota', s.nota,
        'quitado_en', s.quitado_en, 'motivo', s.motivo, 'activa', s.quitado_en is null) order by s.asignado_en)
        from public.ps_asignaciones s join public.profiles pr on pr.id = s.profile_id where s.actividad_id = a.id), '[]'::jsonb),
    'comentarios', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'autor_id', c.autor_id, 'autor', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'), 'tipo', c.tipo, 'texto', c.texto, 'creado_en', c.creado_en) order by c.creado_en)
        from public.ps_comentarios c left join public.profiles pr on pr.id = c.autor_id where c.actividad_id = a.id), '[]'::jsonb));
end;
$$;

/** Elimina una actividad (gestor y admin) mientras no tenga avances (con ellos, 23503). Se van con ella su PDI, sus riesgos y sus acciones. */
create or replace function public.ps_actividad_eliminar(p_id uuid, p_motivo text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_clave text;
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: eliminar actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if char_length(v_motivo) > 1000 then raise exception 'El motivo supera los 1000 caracteres.' using errcode = '22023'; end if;
  if public.ps_actividad_tiene_avances(p_id) then
    raise exception 'La actividad ya tiene avances reportados: no se puede eliminar.' using errcode = '23503';
  end if;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  perform public.ps_evento_act('actividad.eliminada', a.plan_id, a.version_creacion_id, v_clave, p_id, a.oficina_unit_id,
    jsonb_build_object('copia', public.ps_actividad_json(a), 'motivo', v_motivo,
                       'riesgos', (select count(*) from public.ps_riesgos r where r.actividad_id = p_id)));
  delete from public.ps_actividades where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

/**
 * Mueve una actividad entre estados.
 *   colaborador: solo las suyas (asignadas) y solo entre por_iniciar, en_curso, en_riesgo y en_revision; no toca «hecho».
 *   gestor y admin: cualquiera de su oficina. Devolver de «en_revision» exige nota ≥ 20 caracteres.
 * Fase 3 (0288): a «hecho» el gestor exige un avance validado: si hay uno pendiente de otra persona lo valida en el mismo acto; si lo
 * reportó él mismo no puede (lo valida otra persona); sin ningún avance validado usa ps_actividad_cerrar. Al devolver de «en_revision»
 * con un avance pendiente de otra persona, ese avance queda devuelto. El colaborador no mueve una actividad con un avance suyo en revisión.
 */
create or replace function public.ps_actividad_mover(p_id uuid, p_estado text, p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_dev boolean;
  v_clave text;
  r uuid;
  v_av public.ps_avances%rowtype;
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if p_estado is null or p_estado not in ('por_iniciar', 'en_curso', 'en_riesgo', 'en_revision', 'hecho') then
    raise exception 'El estado debe ser por_iniciar, en_curso, en_riesgo, en_revision o hecho.' using errcode = '22023';
  end if;
  if char_length(v_nota) > 1000 then raise exception 'La nota supera los 1000 caracteres.' using errcode = '22023'; end if;
  if v_poder = 'lector' then
    raise exception 'Sin permiso: su acceso a esta oficina es de lectura.' using errcode = '42501';
  end if;
  if a.estado = p_estado then
    return jsonb_build_object('ok', true, 'cambio', false, 'actividad', public.ps_actividad_json(a));
  end if;
  if v_poder = 'colaborador' then
    if not exists (select 1 from public.ps_asignaciones s where s.actividad_id = p_id and s.profile_id = auth.uid() and s.quitado_en is null) then
      raise exception 'Sin permiso: solo puede mover las actividades que tiene asignadas.' using errcode = '42501';
    end if;
    if p_estado = 'hecho' or a.estado = 'hecho' then
      raise exception 'Sin permiso: pasar a «Hecho» (o reabrir) es del gestor de la oficina; pida revisión con «En revisión».' using errcode = '42501';
    end if;
  end if;
  if v_poder = 'colaborador' and a.estado = 'en_revision' and exists (select 1 from public.ps_avances v where v.actividad_id = p_id and v.estado = 'pendiente') then
    raise exception 'Hay un avance pendiente de revisión del gestor: espere su respuesta antes de mover la actividad.' using errcode = '42501';
  end if;
  v_dev := a.estado = 'en_revision' and p_estado in ('por_iniciar', 'en_curso', 'en_riesgo') and v_poder in ('admin', 'gestor');
  if v_dev and char_length(v_nota) < 20 then
    raise exception 'Devolver una actividad en revisión exige una nota de al menos 20 caracteres.' using errcode = '22023';
  end if;
  if p_estado = 'hecho' and v_poder in ('admin', 'gestor') then
    select * into v_av from public.ps_avances where actividad_id = p_id and estado = 'pendiente';
    if found then
      if v_av.reportado_por is not distinct from auth.uid() then
        raise exception 'Sin permiso: no puede dar por hecha una actividad con un avance suyo sin revisar; lo valida otra persona.' using errcode = '42501';
      end if;
      perform public.ps_avance_revisar(v_av.id, 'validado', v_nota, false);
    end if;
    if not exists (select 1 from public.ps_avances where actividad_id = p_id and estado = 'validado') then
      raise exception 'Para cerrar una actividad sin avance validado use «Cerrar actividad» (ps_actividad_cerrar): deja un avance de cierre auditado.' using errcode = '22023';
    end if;
  elsif v_dev then
    select * into v_av from public.ps_avances where actividad_id = p_id and estado = 'pendiente';
    if found and v_av.reportado_por is distinct from auth.uid() then
      perform public.ps_avance_revisar(v_av.id, 'devuelto', v_nota, false);
    end if;
  end if;
  update public.ps_actividades
     set estado = p_estado, completada_en = case when p_estado = 'hecho' then now() else null end, actualizada_en = now()
   where id = p_id;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  if v_nota <> '' then
    insert into public.ps_comentarios (actividad_id, autor_id, tipo, texto)
    values (p_id, auth.uid(), case when v_dev then 'devolucion' else 'cambio_estado' end, v_nota);
  end if;
  perform public.ps_evento_act('actividad.movida', a.plan_id, a.version_creacion_id, v_clave, p_id, a.oficina_unit_id,
    jsonb_build_object('de', a.estado, 'a', p_estado, 'nota', v_nota, 'devuelta', v_dev));
  if v_dev then
    for r in select s.profile_id from public.ps_asignaciones s where s.actividad_id = p_id and s.quitado_en is null and s.profile_id is distinct from auth.uid() loop
      perform public.ps_aviso('c-ps-devuelto', r, p_id, jsonb_build_object('nota', v_nota));
    end loop;
  end if;
  if p_estado = 'hecho' then
    for r in select g from public.ps_gestores_de(a.oficina_unit_id) as g
             union select s.profile_id from public.ps_asignaciones s where s.actividad_id = p_id and s.quitado_en is null loop
      if r is distinct from auth.uid() then
        perform public.ps_aviso('c-ps-cumplida', r, p_id, jsonb_build_object('nota', v_nota));
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'cambio', true, 'actividad', public.ps_actividad_json((select x from public.ps_actividades x where x.id = p_id)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. Vencimientos con plazos por oficina y plazo de validación
-- -----------------------------------------------------------------------------

/**
 * Genera los avisos de vencimiento del día (idempotente: correrla dos veces el mismo día no duplica nada). Solo service_role.
 * Los plazos son los de la oficina de cada actividad (ps_config_oficina) y, si no tiene, los generales (ps_config):
 *   · por vencer: a los días de dias_antes (7, 3 y 0 = el día de la fecha) → c-ps-por-vencer;
 *   · vencida (fin pasado, no hecha): aviso diario, hasta vencida_max_avisos veces por persona → c-ps-vencida;
 *   · a quien tiene la actividad; si no tiene a nadie, a los gestores de la oficina;
 *   · a los gestores, una vez, cuando lleva vencida_gestor_horas horas desde el primer día vencida;
 *   · validación pendiente: los avances «pendiente» que superan validar_horas generan UN aviso c-ps-validacion-pendiente por gestor y
 *     oficina («Hay N avances esperando su revisión»); no se repite mientras sea el mismo conjunto de avances.
 * p_hoy solo sirve para pruebas (reloj controlado: las horas se miden contra el mediodía de Bogotá de ese día); por omisión, ahora.
 */
create or replace function public.ps_generar_avisos_vencimiento(p_hoy date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gen public.ps_config%rowtype;
  cfg record;
  v_hoy date := coalesce(p_hoy, public.ps_hoy());
  v_ref timestamptz := case when p_hoy is null then now() else (p_hoy::timestamp + time '12:00') at time zone 'America/Bogota' end;
  a public.ps_actividades%rowtype;
  d uuid;
  g uuid;
  o uuid;
  v_dias integer;
  v_pasados integer;
  v_resp uuid[];
  v_previos integer;
  v_por_vencer integer := 0;
  v_vencidas integer := 0;
  v_gestor integer := 0;
  v_validacion integer := 0;
  v_nombres text;
  v_ids uuid[];
  v_n integer;
  v_primera uuid;
  v_titulos text;
begin
  select * into gen from public.ps_config where id;
  if not found or not gen.activo then
    return jsonb_build_object('hoy', v_hoy, 'activo', false, 'por_vencer', 0, 'vencidas', 0, 'gestor', 0, 'validacion', 0);
  end if;

  -- Próximas a vencer (y el día de la fecha), con los plazos de cada oficina.
  for a in select * from public.ps_actividades where estado <> 'hecho' and fin is not null and fin >= v_hoy and fin - v_hoy <= 60 order by id loop
    select * into cfg from public.ps_config_efectiva(a.oficina_unit_id);
    continue when not cfg.activo or not ((a.fin - v_hoy) = any (cfg.dias_antes));
    v_dias := a.fin - v_hoy;
    select coalesce(array_agg(s.profile_id), '{}'::uuid[]) into v_resp from public.ps_asignaciones s where s.actividad_id = a.id and s.quitado_en is null;
    if cardinality(v_resp) = 0 then select coalesce(array_agg(x), '{}'::uuid[]) into v_resp from public.ps_gestores_de(a.oficina_unit_id) as x; end if;
    foreach d in array v_resp loop
      if public.ps_aviso('c-ps-por-vencer', d, a.id, jsonb_build_object('dias', v_dias), format('pv:%s:%s:%s:%s', a.id, d, a.fin, v_dias)) then
        v_por_vencer := v_por_vencer + 1;
      end if;
    end loop;
  end loop;

  -- Vencidas.
  for a in select * from public.ps_actividades where estado <> 'hecho' and fin is not null and fin < v_hoy order by id loop
    select * into cfg from public.ps_config_efectiva(a.oficina_unit_id);
    continue when not cfg.activo;
    v_pasados := v_hoy - a.fin;
    select coalesce(array_agg(s.profile_id), '{}'::uuid[]) into v_resp from public.ps_asignaciones s where s.actividad_id = a.id and s.quitado_en is null;
    if cardinality(v_resp) = 0 then
      -- Nadie la tiene: los gestores son los destinatarios principales.
      select coalesce(array_agg(x), '{}'::uuid[]) into v_resp from public.ps_gestores_de(a.oficina_unit_id) as x;
    else
      -- Con responsable: el gestor entra en copia al cumplirse vencida_gestor_horas desde el primer día vencida.
      if v_pasados >= 1 + cfg.vencida_gestor_horas / 24 then
        select string_agg(coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'), ', ') into v_nombres
          from public.profiles pr where pr.id = any (v_resp);
        for g in select x from public.ps_gestores_de(a.oficina_unit_id) as x loop
          if public.ps_aviso('c-ps-vencida', g, a.id, jsonb_build_object('dias', v_pasados, 'rol', 'gestor', 'responsables', coalesce(v_nombres, '')),
                             format('vg:%s:%s:%s', a.id, g, a.fin)) then
            v_gestor := v_gestor + 1;
          end if;
        end loop;
      end if;
    end if;
    foreach d in array v_resp loop
      select count(*) into v_previos from public.ps_avisos
       where plantilla = 'c-ps-vencida' and destinatario_id = d and actividad_id = a.id and dedupe like format('ve:%s:%s:%s:%%', a.id, d, a.fin);
      continue when v_previos >= cfg.vencida_max_avisos;
      if public.ps_aviso('c-ps-vencida', d, a.id, jsonb_build_object('dias', v_pasados, 'rol', 'responsable'), format('ve:%s:%s:%s:%s', a.id, d, a.fin, v_hoy)) then
        v_vencidas := v_vencidas + 1;
      end if;
    end loop;
  end loop;

  -- Avances que esperan revisión más allá del plazo de validación de su oficina.
  for o in select distinct x.oficina_unit_id from public.ps_avances v join public.ps_actividades x on x.id = v.actividad_id where v.estado = 'pendiente' order by 1 loop
    select * into cfg from public.ps_config_efectiva(o);
    continue when not cfg.activo;
    select array_agg(v.id order by v.reportado_en, v.id), count(*), (array_agg(x.id order by v.reportado_en, v.id))[1],
           left(string_agg(left(x.titulo, 60), '; ' order by v.reportado_en, v.id), 300)
      into v_ids, v_n, v_primera, v_titulos
      from public.ps_avances v join public.ps_actividades x on x.id = v.actividad_id
     where x.oficina_unit_id = o and v.estado = 'pendiente' and v.reportado_en <= v_ref - make_interval(hours => cfg.validar_horas);
    continue when coalesce(v_n, 0) = 0;
    for g in select x from public.ps_gestores_de(o) as x loop
      if public.ps_aviso('c-ps-validacion-pendiente', g, v_primera, jsonb_build_object('n', v_n, 'actividades', coalesce(v_titulos, '')),
                         format('vp:%s:%s:%s', o, g, md5(array_to_string(v_ids, ',')))) then
        v_validacion := v_validacion + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('hoy', v_hoy, 'activo', true, 'por_vencer', v_por_vencer, 'vencidas', v_vencidas, 'gestor', v_gestor, 'validacion', v_validacion);
end;
$$;

-- -----------------------------------------------------------------------------
-- 15. Bucket privado ps-evidencias y sus políticas
--
-- Ruta: <oficina_unit_id>/<actividad_id>/<uuid>-<nombre>. Se lee con ps_poder de la oficina; se sube y borra solo quien puede
-- reportar avances en esa actividad (gestor, admin o colaborador asignado); un archivo de un avance ya revisado no se borra.
-- Mismo patrón que 0027: si quien aplica la migración no es dueño de storage.objects, el resto queda aplicado y el aviso dice qué hacer.
-- -----------------------------------------------------------------------------

/** [oficina, actividad] de una ruta del bucket, o null si no tiene la forma <uuid>/<uuid>/<archivo>. */
create or replace function public.ps_ruta_evidencia(p_name text)
returns uuid[]
language sql
immutable
set search_path = public
as $$
  select case when p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
              and p_name !~ '\.\.'
         then array[split_part(p_name, '/', 1)::uuid, split_part(p_name, '/', 2)::uuid] end;
$$;

create or replace function public.ps_storage_puede_leer(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.ps_poder(r[1]) is not null and exists (select 1 from public.ps_actividades a where a.id = r[2] and a.oficina_unit_id = r[1])
      from (select public.ps_ruta_evidencia(p_name) as r) x where x.r is not null), false);
$$;

create or replace function public.ps_storage_puede_escribir(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select exists (select 1 from public.ps_actividades a where a.id = r[2] and a.oficina_unit_id = r[1] and a.estado <> 'hecho')
       and (public.ps_poder(r[1]) in ('admin', 'gestor')
            or (public.ps_poder(r[1]) = 'colaborador' and public.ps_asignado_a(r[2])))
      from (select public.ps_ruta_evidencia(p_name) as r) x where x.r is not null), false);
$$;

create or replace function public.ps_storage_puede_borrar(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ps_storage_puede_escribir(p_name)
     and not exists (select 1 from public.ps_evidencias e join public.ps_avances v on v.id = e.avance_id where e.storage_path = p_name and v.estado <> 'pendiente');
$$;

-- >>> bucket ps-evidencias (el script de aplicación puede volver a correr solo este bloque con un rol dueño de storage.objects)
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ps-evidencias', 'ps-evidencias', false, 20971520, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain',
    'application/zip', 'application/x-zip-compressed'])
  on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists ps_evidencias_lectura on storage.objects';
  execute $pol$
    create policy ps_evidencias_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'ps-evidencias' and public.ps_storage_puede_leer(name))
  $pol$;

  execute 'drop policy if exists ps_evidencias_escritura on storage.objects';
  execute $pol$
    create policy ps_evidencias_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'ps-evidencias' and public.ps_storage_puede_escribir(name))
  $pol$;

  execute 'drop policy if exists ps_evidencias_borrado on storage.objects';
  execute $pol$
    create policy ps_evidencias_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'ps-evidencias' and public.ps_storage_puede_borrar(name))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "ps-evidencias" (%). Créalo a mano desde Storage: privado, 20 MB por archivo, y las políticas de la migración 0288.',
      sqlerrm;
end $$;
-- <<< bucket ps-evidencias

-- -----------------------------------------------------------------------------
-- 16. Plantillas de correo (no pisan lo ya editado)
-- -----------------------------------------------------------------------------

insert into public.correo_templates (key, identity, grp, name, sent_when, action, subject, preheader, title, greeting, body, button, note, active, sort, tipo)
values
  ('c-ps-validacion-pendiente', 'plan', 'Planeación y Seguimiento', 'Avances esperando su revisión',
   'Avances sin revisar más allá del plazo de validación de la oficina: al gestor, una vez por conjunto', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Hay avances por validar', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Hay avances de {{oficina}} que esperan su revisión más allá del plazo.\n{{detalle}}', 'Revisar los avances',
   'El plazo de validación lo define cada oficina (por omisión, 72 horas).', true, 348, 'aviso')
on conflict (key) do nothing;

-- Las plantillas de la fase 2 decían «se activa en la fase 3»: ya se disparan. Solo si nadie las editó.
update public.correo_templates
   set sent_when = 'Cuando un colaborador reporta un avance: al gestor'
 where key = 'c-ps-avance' and sent_when = 'Cuando un colaborador reporta un avance: al gestor (se activa en la fase 3)';
update public.correo_templates
   set sent_when = 'Cuando el gestor valida un avance: a quien lo reportó'
 where key = 'c-ps-validado' and sent_when = 'Cuando el gestor valida un avance (se activa en la fase 3)';

-- -----------------------------------------------------------------------------
-- 17. Permisos de ejecución
-- -----------------------------------------------------------------------------

drop function if exists public.ps_actividad_normalizar(integer, jsonb, uuid, uuid, boolean, text);

revoke all on function
  public.ps_actividad_pdi_guard(), public.ps_avances_guard(), public.ps_evidencias_guard(),
  public.ps_config_efectiva(uuid), public.ps_actividad_pdi_json(uuid), public.ps_pdi_catalogo(),
  public.ps_pdi_resolver(integer, jsonb, boolean), public.ps_actividad_pdi_aplicar(uuid, jsonb),
  public.ps_actividad_normalizar(integer, jsonb, uuid, uuid, boolean, text, boolean),
  public.ps_actividad_tiene_avances(uuid), public.ps_persona_json(uuid), public.ps_avance_json(public.ps_avances),
  public.ps_accion_json(public.ps_acciones), public.ps_riesgo_json(public.ps_riesgos), public.ps_motivo_no_revisa(uuid, uuid),
  public.ps_avisar_cumplida(uuid, text), public.ps_evidencia_insertar(uuid, jsonb), public.ps_riesgo_insertar(uuid, jsonb),
  public.ps_avance_revisar(uuid, text, text, boolean), public.ps_asignado_a(uuid),
  public.ps_avance_reportar(uuid, jsonb), public.ps_avance_validar(uuid, text), public.ps_avance_devolver(uuid, text),
  public.ps_avances_validar_lote(uuid[]), public.ps_actividad_cerrar(uuid, text),
  public.ps_evidencia_registrar(uuid, jsonb), public.ps_evidencia_quitar(uuid),
  public.ps_riesgo_crear(uuid, jsonb), public.ps_riesgo_editar(uuid, jsonb), public.ps_riesgo_cerrar(uuid, text),
  public.ps_accion_crear(uuid, jsonb), public.ps_accion_editar(uuid, jsonb), public.ps_accion_marcar(uuid, text),
  public.ps_avances_por_validar(uuid), public.ps_mis_avances(), public.ps_riesgos_oficina(uuid, jsonb), public.ps_resumen_pdi_oficina(uuid),
  public.ps_config_leer(), public.ps_config_guardar(integer[], integer, integer, boolean, integer),
  public.ps_config_oficina_leer(uuid), public.ps_config_oficina_guardar(uuid, integer[], integer, integer, integer, boolean),
  public.ps_config_oficina_quitar(uuid), public.ps_generar_avisos_vencimiento(date),
  public.ps_ruta_evidencia(text), public.ps_storage_puede_leer(text), public.ps_storage_puede_escribir(text), public.ps_storage_puede_borrar(text),
  public.ps_actividad_json(public.ps_actividades), public.ps_actividad_insertar(uuid, uuid, uuid, jsonb),
  public.ps_actividades_oficina(uuid, jsonb), public.ps_actividad_detalle(uuid), public.ps_actividad_crear(uuid, uuid, jsonb, boolean),
  public.ps_actividad_editar(uuid, jsonb), public.ps_actividad_eliminar(uuid, text), public.ps_actividad_mover(uuid, text, text),
  public.ps_actividades_cargar(uuid, jsonb, uuid, boolean)
  from public, anon, authenticated;

-- Las evalúan las políticas de storage con el rol de quien consulta (entran con su sesión).
grant execute on function public.ps_storage_puede_leer(text), public.ps_storage_puede_escribir(text), public.ps_storage_puede_borrar(text) to authenticated;

grant execute on function
  public.ps_pdi_catalogo(),
  public.ps_avance_reportar(uuid, jsonb), public.ps_avance_validar(uuid, text), public.ps_avance_devolver(uuid, text),
  public.ps_avances_validar_lote(uuid[]), public.ps_actividad_cerrar(uuid, text),
  public.ps_evidencia_registrar(uuid, jsonb), public.ps_evidencia_quitar(uuid),
  public.ps_riesgo_crear(uuid, jsonb), public.ps_riesgo_editar(uuid, jsonb), public.ps_riesgo_cerrar(uuid, text),
  public.ps_accion_crear(uuid, jsonb), public.ps_accion_editar(uuid, jsonb), public.ps_accion_marcar(uuid, text),
  public.ps_avances_por_validar(uuid), public.ps_mis_avances(), public.ps_riesgos_oficina(uuid, jsonb), public.ps_resumen_pdi_oficina(uuid),
  public.ps_config_leer(), public.ps_config_guardar(integer[], integer, integer, boolean, integer),
  public.ps_config_oficina_leer(uuid), public.ps_config_oficina_guardar(uuid, integer[], integer, integer, integer, boolean),
  public.ps_config_oficina_quitar(uuid),
  public.ps_actividades_oficina(uuid, jsonb), public.ps_actividad_detalle(uuid), public.ps_actividad_crear(uuid, uuid, jsonb, boolean),
  public.ps_actividad_editar(uuid, jsonb), public.ps_actividad_eliminar(uuid, text), public.ps_actividad_mover(uuid, text, text),
  public.ps_actividades_cargar(uuid, jsonb, uuid, boolean)
  to authenticated;

grant execute on function public.ps_generar_avisos_vencimiento(date) to service_role;

notify pgrst, 'reload schema';


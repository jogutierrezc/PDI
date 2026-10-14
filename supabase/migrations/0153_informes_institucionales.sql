-- =============================================================================
-- 0153 · Informes Institucionales (informes de gestión)
--
-- Cada decanatura, vicerrectoría u oficina, rectoría de campus y la Rectoría
-- General arma su informe de gestión anual sobre las plantillas A–D. Mismo
-- recorrido que el reporte THE (0149): abrir → diligenciar → enviar →
-- aprobar | devolver, y además consolidar: cada nivel recibe lo aprobado del
-- de abajo. Contrato: src/modules/informes/README.md (sección «Esquema final»).
--
--   informe_ciclos        un ciclo por año: fecha límite, corte, estado
--                         (preparacion | abierto | cerrado) y config
--                         {limite_propios, exigir_fuente, exigir_pilar}.
--   informe_requisitos    qué cifra justifica cada plantilla: justificar |
--                         sugerido | no. Lo fija Planeación.
--   informe_instancias    el informe de una unidad en un ciclo: plantilla,
--                         `destino` (la unidad que lo consolida), estado y
--                         quién lo envió y lo aprobó.
--   informe_secciones     el contenido de cada sección (s1, s2…) en jsonb, y
--                         si la unidad la dio por lista.
--   informe_cifras        las cifras del informe: de dónde salen (auto, pdi,
--                         aportes, excel, manual, url), su valor si es propia,
--                         el último valor que la unidad aceptó (`visto`) y la
--                         FOTO que se toma al enviar (foto_valor/en/fuente).
--   informe_fuentes       catálogo de fuentes vivas: clave → consulta jsonb.
--   informe_anexos        anexos numerados: archivo del bucket privado
--                         «informe-anexos» o URL https.
--   informe_revisiones    cada aprobación o devolución, con su nota.
--   informe_ejemplos      el corpus de Pilo (informes 2025 y lo aprobado).
--   informe_aprendizaje   lo que Pilo propuso y lo que la unidad dejó.
--
-- Cifras vivas, foto al enviar. Mientras el informe está en borrador, las
-- cifras auto/pdi/aportes se leen en vivo con `informe_cifras_vivas`, que hace
-- la misma cuenta del portal (ver el mapa más abajo). Cuando el informe pasa a
-- `sent` —por `informe_enviar` o por cualquier otro camino— el disparador
-- `informe_instancias_foto` guarda en el servidor la foto de cada cifra (valor,
-- fuente y fecha); excel/manual/url conservan su valor. Si Planeación lo
-- devuelve (`back`), la foto se borra y las cifras vuelven a ser vivas.
--
-- Mapa clave → consulta (la cifra busca su fuente por
-- coalesce(fuente_clave, clave) y mezcla encima su propia `consulta`):
--   auto     {"indicador": od_indicators.key, "informe"?: od_reports.slug,
--             "sede"?: campuses.slug, "periodo"?: od_periods.label, "anio"?}
--            → od_values de un informe y periodo publicados, cifra del año
--            con la regla del portal (suma, promedio, ultimo, reportado; ver
--            src/modules/datos-abiertos/data/terms.ts y repository.ts). Sin
--            sede = toda la UDES; si el total no se capturó y se suma, sale de
--            las sedes del periodo.
--   pdi      {"indicador": imp_indicators.code, "programa"?: units.id,
--             "sede"?: campuses.slug, "anio"?} → imp_values.value_num de un
--            indicador publicado (sin programa: la cifra global).
--   aportes  suma de la foto de la misma clave en los informes aprobados del
--            ciclo cuyo destino es esta unidad.
--   excel, manual, url  su `valor`, con `fuente_nombre`.
-- El año es consulta.anio o, si falta, informe_ciclos.anio.
--
-- Estados: draft → sent → ok | back; ok → back; back → draft.
--   · Envía (draft → sent): el jefe (Gestor) o Planeación. Al enviar se exige
--     ciclo abierto, todas las secciones listas, fuente (y pilar, si el ciclo
--     lo pide) en cada dato propio y justificación donde Planeación la pidió.
--   · Aprueba o devuelve: solo Planeación. Devolver pide nota.
--   · back → draft: el jefe, el editor o Planeación (guardar una sección o
--     una cifra en un informe devuelto lo hace solo).
--   · Enviado o aprobado: nadie más que Planeación cambia el informe, sus
--     secciones, cifras ni anexos. Lo hacen cumplir los disparadores
--     `informe_instancias_guard` e `informe_hijo_guard`, no solo la interfaz.
--
-- Quién puede qué (sin acceso anónimo; todo queda en RLS):
--   · Planeación y la administración leen y escriben todo.
--   · Consulta (visor) lee el informe de su unidad.
--   · Contribuyente (editor) diligencia mientras el informe esté abierto.
--   · Gestor (jefe) lo mismo, y envía.
--   · La unidad destino ve el estado de los informes que le llegan y, por
--     `informe_consolidado`, las secciones de los aprobados.
--   · informe_ejemplos e informe_aprendizaje: Planeación, admin y la función
--     pilo-informes (service_role).
--
-- Rectorías: se crean como unidades con kind = 'otra'; lo que son en el
-- informe lo dice la plantilla (C, D). El destino no usa parent_id, que daría
-- herencia de permisos (0057, 0073).
--
-- Bucket «informe-anexos» (privado, 15 MB): «<unidad>/<instancia>/<archivo>».
--
-- Requiere 0002 (has_role_at_least), 0019/0022 (od_*), 0026 (set_updated_at),
-- 0057 (units, unit_members, unit_role_at, unit_can_view, unit_can_edit), 0078
-- (imp_indicators, imp_values), 0149 (ranking_actor, ranking_puede_leer_ciclo,
-- ranking_unidad_de_ruta, ranking_respuesta_de_ruta, que son genéricas).
-- Idempotente. Todo DELETE lleva WHERE (safeupdate, ver 0095). Esta migración
-- no borra filas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.informe_ciclos (
  id            uuid primary key default gen_random_uuid(),
  anio          int not null,
  nombre        text not null default '',
  fecha_limite  date,
  corte         date,
  estado        text not null default 'preparacion',
  config        jsonb not null default '{"limite_propios": 3, "exigir_fuente": true, "exigir_pilar": false}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint informe_ciclos_anio_unico unique (anio),
  constraint informe_ciclos_anio check (anio between 2020 and 2100),
  constraint informe_ciclos_estado check (estado in ('preparacion', 'abierto', 'cerrado')),
  constraint informe_ciclos_config check (jsonb_typeof(config) = 'object')
);

comment on table public.informe_ciclos is
  'Un ciclo de informes de gestión por año. config: limite_propios (datos propios por sección), exigir_fuente, exigir_pilar.';

drop trigger if exists informe_ciclos_set_updated_at on public.informe_ciclos;
create trigger informe_ciclos_set_updated_at before update on public.informe_ciclos
  for each row execute function public.set_updated_at();

create table if not exists public.informe_requisitos (
  id         uuid primary key default gen_random_uuid(),
  ciclo_id   uuid not null references public.informe_ciclos (id) on delete cascade,
  plantilla  text not null,
  clave      text not null,
  condicion  text not null default 'sugerido',
  constraint informe_requisitos_unico unique (ciclo_id, plantilla, clave),
  constraint informe_requisitos_plantilla check (plantilla in ('A', 'B', 'C', 'D')),
  constraint informe_requisitos_condicion check (condicion in ('justificar', 'sugerido', 'no'))
);

comment on table public.informe_requisitos is
  'Qué cifra justifica cada plantilla en el ciclo. justificar = va incluida y con una línea de justificación.';

create table if not exists public.informe_instancias (
  id             uuid primary key default gen_random_uuid(),
  ciclo_id       uuid not null references public.informe_ciclos (id) on delete cascade,
  unit_id        uuid not null references public.units (id) on delete cascade,
  plantilla      text not null,
  destino        uuid references public.units (id) on delete set null,
  estado         text not null default 'draft',
  nota_revision  text not null default '',
  enviado_en     timestamptz,
  enviado_por    uuid references public.profiles (id) on delete set null,
  aprobado_en    timestamptz,
  aprobado_por   uuid references public.profiles (id) on delete set null,
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint informe_instancias_unica unique (ciclo_id, unit_id),
  constraint informe_instancias_plantilla check (plantilla in ('A', 'B', 'C', 'D')),
  constraint informe_instancias_estado check (estado in ('draft', 'sent', 'ok', 'back')),
  constraint informe_instancias_destino check (destino is null or destino <> unit_id),
  constraint informe_instancias_nota check (char_length(nota_revision) <= 4000)
);

comment on table public.informe_instancias is
  'El informe de una unidad en un ciclo. destino = la unidad que lo consolida (rectoría de campus o general).';
comment on column public.informe_instancias.destino is
  'A quién sube el informe. No es parent_id: no da permisos sobre la unidad, solo deja ver el estado y, aprobado, sus secciones (informe_consolidado).';

create index if not exists informe_instancias_unit_idx on public.informe_instancias (unit_id);
create index if not exists informe_instancias_destino_idx on public.informe_instancias (ciclo_id, destino, estado);

create table if not exists public.informe_secciones (
  id            uuid primary key default gen_random_uuid(),
  instancia_id  uuid not null references public.informe_instancias (id) on delete cascade,
  clave         text not null,
  orden         int not null default 0,
  contenido     jsonb not null default '{}'::jsonb,
  listo         boolean not null default false,
  updated_by    uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint informe_secciones_unica unique (instancia_id, clave),
  constraint informe_secciones_clave check (clave ~ '^[a-z0-9_]{1,40}$'),
  constraint informe_secciones_contenido check (jsonb_typeof(contenido) = 'object')
);

comment on table public.informe_secciones is
  'Contenido de una sección (texto con tokens [[clave]], filas de metas, logros… según su tipo).';

drop trigger if exists informe_secciones_set_updated_at on public.informe_secciones;
create trigger informe_secciones_set_updated_at before update on public.informe_secciones
  for each row execute function public.set_updated_at();

create table if not exists public.informe_cifras (
  id             uuid primary key default gen_random_uuid(),
  instancia_id   uuid not null references public.informe_instancias (id) on delete cascade,
  clave          text not null,
  etiqueta       text not null default '',
  seccion_clave  text,
  fuente_tipo    text not null default 'auto',
  fuente_nombre  text not null default '',
  fuente_clave   text,
  consulta       jsonb not null default '{}'::jsonb,
  valor          numeric,
  unidad         text not null default '',
  meta           numeric,
  anterior       numeric,
  incluida       boolean not null default true,
  justificacion  text not null default '',
  propia         boolean generated always as (fuente_tipo in ('excel', 'manual', 'url')) stored,
  pilar          text,
  visto          numeric,
  foto_valor     numeric,
  foto_en        timestamptz,
  foto_fuente    text,
  updated_by     uuid references public.profiles (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint informe_cifras_unica unique (instancia_id, clave),
  constraint informe_cifras_clave check (clave ~ '^[A-Za-z0-9_-]{1,60}$'),
  constraint informe_cifras_tipo check (fuente_tipo in ('auto', 'pdi', 'aportes', 'excel', 'manual', 'url')),
  -- Las vivas no guardan valor: se leen de su fuente (o de la foto).
  constraint informe_cifras_valor check (fuente_tipo not in ('auto', 'pdi') or valor is null),
  constraint informe_cifras_consulta check (jsonb_typeof(consulta) = 'object'),
  constraint informe_cifras_justificacion check (char_length(justificacion) <= 1000)
);

comment on table public.informe_cifras is
  'Cifras del informe. auto/pdi/aportes se leen en vivo (informe_cifras_vivas) hasta enviar; la foto (foto_*) la toma el servidor al pasar a sent y se borra al devolver.';

drop trigger if exists informe_cifras_set_updated_at on public.informe_cifras;
create trigger informe_cifras_set_updated_at before update on public.informe_cifras
  for each row execute function public.set_updated_at();

create table if not exists public.informe_fuentes (
  clave       text primary key,
  nombre      text not null,
  tipo        text not null,
  consulta    jsonb not null default '{}'::jsonb,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint informe_fuentes_tipo check (tipo in ('auto', 'pdi')),
  constraint informe_fuentes_consulta check (jsonb_typeof(consulta) = 'object' and consulta ? 'indicador')
);

comment on table public.informe_fuentes is
  'Catálogo de cifras vivas: clave → consulta. auto = UDES en Cifras (od_*), pdi = indicador del PDI (imp_*). El mapa está en la cabecera de 0153.';

drop trigger if exists informe_fuentes_set_updated_at on public.informe_fuentes;
create trigger informe_fuentes_set_updated_at before update on public.informe_fuentes
  for each row execute function public.set_updated_at();

create table if not exists public.informe_anexos (
  id            uuid primary key default gen_random_uuid(),
  instancia_id  uuid not null references public.informe_instancias (id) on delete cascade,
  n             int not null,
  nombre        text not null default '',
  tipo          text not null,
  ruta          text not null,
  descripcion   text not null default '',
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint informe_anexos_unico unique (instancia_id, n),
  constraint informe_anexos_n check (n between 1 and 999),
  constraint informe_anexos_tipo check (tipo in ('archivo', 'url')),
  constraint informe_anexos_url check (tipo <> 'url' or ruta ~* '^https://')
);

comment on table public.informe_anexos is
  'Anexos numerados del informe: archivo (bucket informe-anexos, ruta <unidad>/<instancia>/<archivo>) o URL https.';

create table if not exists public.informe_revisiones (
  id             uuid primary key default gen_random_uuid(),
  instancia_id   uuid not null references public.informe_instancias (id) on delete cascade,
  seccion_clave  text,
  decision       text not null,
  nota           text not null default '',
  por            uuid references public.profiles (id) on delete set null default auth.uid(),
  en             timestamptz not null default now(),
  constraint informe_revisiones_decision check (decision in ('aprobado', 'devuelto'))
);

create index if not exists informe_revisiones_instancia_idx on public.informe_revisiones (instancia_id, en);

create table if not exists public.informe_ejemplos (
  id             uuid primary key default gen_random_uuid(),
  origen         text not null,
  anio           int not null,
  plantilla      text,
  seccion_tipo   text not null default '',
  unidad_nombre  text not null default '',
  titulo         text not null default '',
  texto          text not null,
  hash           text generated always as (md5(texto)) stored,
  aprobado       boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint informe_ejemplos_hash_unico unique (hash),
  constraint informe_ejemplos_origen check (origen in ('informe2025', 'aprobado')),
  constraint informe_ejemplos_plantilla check (plantilla is null or plantilla in ('A', 'B', 'C', 'D')),
  constraint informe_ejemplos_texto check (char_length(texto) between 1 and 60000)
);

comment on table public.informe_ejemplos is
  'Corpus de Pilo: secciones de los informes 2025 y de los informes aprobados. hash = md5(texto): el mismo texto no entra dos veces.';

create table if not exists public.informe_aprendizaje (
  id             uuid primary key default gen_random_uuid(),
  instancia_id   uuid not null references public.informe_instancias (id) on delete cascade,
  seccion_clave  text not null,
  borrador_pilo  text not null default '',
  final_unidad   text not null default '',
  creado_en      timestamptz not null default now()
);

create index if not exists informe_aprendizaje_instancia_idx on public.informe_aprendizaje (instancia_id);

-- -----------------------------------------------------------------------------
-- 2. Funciones de permiso (security definer: leen las tablas sin pasar por RLS)
-- -----------------------------------------------------------------------------

/** ¿Ve el informe? Planeación, o quien ve su unidad. */
create or replace function public.informe_instancia_visible(inst uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
      or exists (
           select 1 from public.informe_instancias i
            where i.id = inst
              and public.unit_can_view(i.unit_id)
         );
$$;

/** ¿Está abierto a cambios de la unidad? Borrador o devuelto, ciclo abierto, editor o jefe. Planeación siempre. */
create or replace function public.informe_instancia_abierta(inst uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
      or exists (
           select 1
             from public.informe_instancias i
             join public.informe_ciclos c on c.id = i.ciclo_id
            where i.id = inst
              and i.estado in ('draft', 'back')
              and c.estado = 'abierto'
              and public.unit_can_edit(i.unit_id)
         );
$$;

/** Transiciones de estado y quién las hace. Mismo cuadro que la interfaz. */
create or replace function public.informe_transicion_permitida(de text, a text, actor text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case
      when de = 'draft' and a = 'sent'           then actor in ('planeacion', 'jefe')
      when de = 'sent'  and a in ('ok', 'back')  then actor = 'planeacion'
      when de = 'ok'    and a = 'back'           then actor = 'planeacion'
      when de = 'back'  and a = 'draft'          then actor in ('planeacion', 'jefe', 'editor')
      else false
    end,
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Cifras vivas: la misma cuenta del portal
-- -----------------------------------------------------------------------------

/**
 * Un corte (A, B o anual) de un indicador de UDES en Cifras en una sede (nulo
 * = toda la UDES). Si el total no se capturó y el indicador se suma, sale de
 * las sedes del periodo, y solo si todas tienen cifra (repository.ts, fillTotal).
 */
create or replace function public.informe_od_corte(p_ind uuid, p_anio int, p_campus uuid, p_term text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_valor numeric;
  v_n     int;
  v_con   int;
  v_suma  numeric;
begin
  select v.value into v_valor
    from public.od_values v
   where v.indicator_id = p_ind and v.year = p_anio and v.term = p_term::public.od_term
     and v.campus_id is not distinct from p_campus;
  if v_valor is not null or p_campus is not null then
    return v_valor;
  end if;
  if (select i.aggregation::text from public.od_indicators i where i.id = p_ind) is distinct from 'suma' then
    return null;
  end if;
  select count(*), count(v.value), sum(v.value) into v_n, v_con, v_suma
    from public.od_indicators i
    join public.od_reports r on r.id = i.report_id
    join public.od_period_campuses pc on pc.period_id = r.period_id
    left join public.od_values v
      on v.indicator_id = i.id and v.year = p_anio and v.term = p_term::public.od_term and v.campus_id = pc.campus_id
   where i.id = p_ind;
  return case when v_n > 0 and v_n = v_con then v_suma end;
end;
$$;

/** Cifra del año de UDES en Cifras (fuente auto). Ver el mapa de la cabecera. */
create or replace function public.informe_valor_od(q jsonb, p_anio int, out valor numeric, out fuente text, out corte text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ind      record;
  v_campus uuid;
  v_regla  text;
  a        numeric;
  b        numeric;
begin
  select i.id, i.label, i.annual_rule::text as regla, i.reporting::text as reporting, i.years,
         p.label as periodo, p.cutoff_date
    into ind
    from public.od_indicators i
    join public.od_reports r on r.id = i.report_id
    join public.od_periods p on p.id = r.period_id
   where i.key = q ->> 'indicador'
     and (coalesce(q ->> 'informe', '') = '' or r.slug = q ->> 'informe')
     and (coalesce(q ->> 'periodo', '') = '' or p.label = q ->> 'periodo')
     and p_anio between p.start_year and p.end_year
     and r.status = 'publicado' and p.status = 'publicado'
   order by p.is_current desc, p.end_year desc, r.position
   limit 1;
  if not found then
    fuente := 'UDES en Cifras · sin dato publicado';
    return;
  end if;
  fuente := 'UDES en Cifras · ' || ind.label || ' · ' || ind.periodo;
  corte := ind.cutoff_date::text;

  if coalesce(q ->> 'sede', '') <> '' then
    select c.id into v_campus from public.campuses c where c.slug = q ->> 'sede';
    if v_campus is null then
      return;   -- una sede que no existe no cae al total
    end if;
  end if;
  if ind.years is not null and not (p_anio::smallint = any (ind.years)) then
    return;
  end if;

  v_regla := case when ind.reporting = 'anual' then 'reportado' else ind.regla end;
  if v_regla = 'reportado' then
    valor := public.informe_od_corte(ind.id, p_anio, v_campus, 'anual');
    return;
  end if;
  a := public.informe_od_corte(ind.id, p_anio, v_campus, 'A');
  b := public.informe_od_corte(ind.id, p_anio, v_campus, 'B');
  valor := case v_regla
             when 'suma'     then a + b
             when 'promedio' then round((a + b) / 2, 6)
             when 'ultimo'   then coalesce(b, a)
           end;
end;
$$;

/** Cifra de un indicador del PDI (fuente pdi): imp_values de un indicador publicado. */
create or replace function public.informe_valor_pdi(q jsonb, p_anio int, out valor numeric, out fuente text, out corte text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ind      record;
  v_campus uuid;
  v_prog   uuid := nullif(q ->> 'programa', '')::uuid;
begin
  select i.id, i.code, i.name into ind
    from public.imp_indicators i
   where i.code = q ->> 'indicador' and i.status = 'publicado';
  if not found then
    fuente := 'PDI · sin dato publicado';
    return;
  end if;
  fuente := 'PDI · ' || ind.code || ' · ' || ind.name;
  corte := p_anio::text;
  if coalesce(q ->> 'sede', '') <> '' then
    select c.id into v_campus from public.campuses c where c.slug = q ->> 'sede';
    if v_campus is null then
      return;
    end if;
  end if;
  select case when v.not_applicable then null else v.value_num end into valor
    from public.imp_values v
   where v.indicator_id = ind.id and v.year = p_anio
     and v.program_id is not distinct from v_prog
     and v.campus_id is not distinct from v_campus;
end;
$$;

/** Las cifras del informe, en vivo. Sin control de permiso: la usan la pública y la foto. */
create or replace function public.informe_vivas_de(p_instancia uuid)
returns table (clave text, fuente_tipo text, valor numeric, fuente text, corte text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inst  record;
  c     record;
  q     jsonb;
  anio  int;
  r     record;
begin
  select i.id, i.unit_id, i.ciclo_id, ci.anio into inst
    from public.informe_instancias i
    join public.informe_ciclos ci on ci.id = i.ciclo_id
   where i.id = p_instancia;
  if not found then
    return;
  end if;

  for c in
    select x.* from public.informe_cifras x where x.instancia_id = p_instancia order by x.clave
  loop
    clave := c.clave;
    fuente_tipo := c.fuente_tipo;
    valor := null; fuente := null; corte := null;
    if c.fuente_tipo in ('auto', 'pdi') then
      select coalesce(f.consulta, '{}'::jsonb) into q
        from public.informe_fuentes f
       where f.clave = coalesce(nullif(c.fuente_clave, ''), c.clave);
      q := coalesce(q, '{}'::jsonb) || c.consulta;
      anio := coalesce(nullif(q ->> 'anio', '')::int, inst.anio);
      if c.fuente_tipo = 'auto' then
        select * into r from public.informe_valor_od(q, anio);
      else
        select * into r from public.informe_valor_pdi(q, anio);
      end if;
      valor := r.valor; fuente := r.fuente; corte := r.corte;
    elsif c.fuente_tipo = 'aportes' then
      select sum(h.foto_valor) into valor
        from public.informe_cifras h
        join public.informe_instancias hi on hi.id = h.instancia_id
       where hi.ciclo_id = inst.ciclo_id and hi.destino = inst.unit_id and hi.estado = 'ok'
         and h.clave = c.clave and h.incluida;
      fuente := 'Aportes aprobados';
    else
      valor := c.valor;
      fuente := nullif(c.fuente_nombre, '');
    end if;
    q := null;
    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Disparadores
-- -----------------------------------------------------------------------------

/** Lo que se exige para enviar. Lanza un error con lo que falta. */
create or replace function public.informe_validar_envio(p_instancia uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inst    record;
  faltan  text;
begin
  select i.plantilla, i.ciclo_id, c.estado as ciclo_estado, c.config into inst
    from public.informe_instancias i
    join public.informe_ciclos c on c.id = i.ciclo_id
   where i.id = p_instancia;

  if inst.ciclo_estado <> 'abierto' then
    raise exception 'El ciclo no está abierto: no se puede enviar' using errcode = '23514';
  end if;
  if not exists (select 1 from public.informe_secciones s where s.instancia_id = p_instancia) then
    raise exception 'El informe no tiene secciones' using errcode = '23514';
  end if;
  select string_agg(s.clave, ', ' order by s.orden) into faltan
    from public.informe_secciones s where s.instancia_id = p_instancia and not s.listo;
  if faltan is not null then
    raise exception 'Faltan secciones por terminar: %', faltan using errcode = '23514';
  end if;

  if coalesce((inst.config ->> 'exigir_fuente')::boolean, true) then
    select string_agg(x.clave, ', ' order by x.clave) into faltan
      from public.informe_cifras x
     where x.instancia_id = p_instancia and x.incluida and x.propia and btrim(x.fuente_nombre) = '';
    if faltan is not null then
      raise exception 'Falta el nombre de la fuente en: %', faltan using errcode = '23514';
    end if;
  end if;
  if coalesce((inst.config ->> 'exigir_pilar')::boolean, false) then
    select string_agg(x.clave, ', ' order by x.clave) into faltan
      from public.informe_cifras x
     where x.instancia_id = p_instancia and x.incluida and x.propia and coalesce(btrim(x.pilar), '') = '';
    if faltan is not null then
      raise exception 'Falta el pilar del PDI en: %', faltan using errcode = '23514';
    end if;
  end if;

  select string_agg(x.clave, ', ' order by x.clave) into faltan
    from public.informe_requisitos r
    join public.informe_cifras x on x.instancia_id = p_instancia and x.clave = r.clave
   where r.ciclo_id = inst.ciclo_id and r.plantilla = inst.plantilla and r.condicion = 'justificar'
     and (not x.incluida or btrim(x.justificacion) = '');
  if faltan is not null then
    raise exception 'Falta justificar (y dejar incluidas) las cifras: %', faltan using errcode = '23514';
  end if;
end;
$$;

/**
 * Flujo de estados, sellos de envío y aprobación, y bloqueo del informe
 * enviado. Las escrituras sin sesión (clave de servicio, migraciones) pasan.
 */
create or replace function public.informe_instancias_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'sent' then
      new.enviado_en := now();
      new.enviado_por := auth.uid();
      new.aprobado_en := null;
      new.aprobado_por := null;
    elsif new.estado = 'ok' then
      new.aprobado_en := now();
      new.aprobado_por := auth.uid();
    else
      new.aprobado_en := null;
      new.aprobado_por := null;
    end if;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  actor := public.ranking_actor(new.unit_id);
  if actor is null or actor = 'visor' then
    raise exception 'Sin permiso para cambiar este informe' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if actor <> 'planeacion' then
      if new.estado <> 'draft' then
        raise exception 'Un informe nuevo empieza en borrador' using errcode = '42501';
      end if;
      if not exists (select 1 from public.informe_ciclos c where c.id = new.ciclo_id and c.estado = 'abierto') then
        raise exception 'El ciclo no está abierto' using errcode = '42501';
      end if;
    end if;
    new.updated_by := auth.uid();
    return new;
  end if;

  if actor <> 'planeacion' then
    if old.estado in ('sent', 'ok') then
      raise exception 'El informe ya se envió: solo Planeación lo puede cambiar' using errcode = '42501';
    end if;
    if (new.ciclo_id, new.unit_id, new.plantilla, new.destino, new.nota_revision)
       is distinct from (old.ciclo_id, old.unit_id, old.plantilla, old.destino, old.nota_revision) then
      raise exception 'Solo Planeación cambia la plantilla, el destino o la nota de revisión' using errcode = '42501';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if not public.informe_transicion_permitida(old.estado, new.estado, actor) then
      raise exception 'Cambio de estado no permitido: % → % (%)', old.estado, new.estado, actor
        using errcode = '42501';
    end if;
    if new.estado = 'sent' then
      perform public.informe_validar_envio(new.id);
    end if;
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists informe_instancias_guard_trg on public.informe_instancias;
create trigger informe_instancias_guard_trg before insert or update on public.informe_instancias
  for each row execute function public.informe_instancias_guard();

/**
 * La foto. Al pasar a sent se guarda en el servidor el valor de cada cifra con
 * su fuente y la hora; al pasar a back se borra y las cifras vuelven a vivas.
 * `informe.sistema` deja pasar estas escrituras por informe_hijo_guard.
 */
create or replace function public.informe_instancias_foto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = old.estado or new.estado not in ('sent', 'back') then
    return null;
  end if;
  perform set_config('informe.sistema', 'si', true);
  if new.estado = 'sent' then
    update public.informe_cifras x
       set foto_valor = v.valor,
           foto_fuente = coalesce(v.fuente, ''),
           foto_en = now()
      from public.informe_vivas_de(new.id) v
     where x.instancia_id = new.id and x.clave = v.clave;
  else
    update public.informe_cifras x
       set foto_valor = null, foto_fuente = null, foto_en = null
     where x.instancia_id = new.id and x.foto_en is not null;
  end if;
  perform set_config('informe.sistema', '', true);
  return null;
end;
$$;

drop trigger if exists informe_instancias_foto_trg on public.informe_instancias;
create trigger informe_instancias_foto_trg after update of estado on public.informe_instancias
  for each row execute function public.informe_instancias_foto();

/** Secciones, cifras y anexos: solo se tocan con el informe abierto (Planeación siempre). */
create or replace function public.informe_hijo_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inst uuid;
begin
  if auth.uid() is null or current_setting('informe.sistema', true) = 'si' then
    return coalesce(new, old);
  end if;
  inst := case when tg_op = 'DELETE' then old.instancia_id else new.instancia_id end;
  if tg_op = 'UPDATE' and new.instancia_id <> old.instancia_id then
    raise exception 'No se puede mover a otro informe' using errcode = '42501';
  end if;
  if not public.informe_instancia_abierta(inst) then
    raise exception 'El informe ya se envió (o no es suyo): solo Planeación lo puede cambiar' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists informe_secciones_guard_trg on public.informe_secciones;
create trigger informe_secciones_guard_trg before insert or update or delete on public.informe_secciones
  for each row execute function public.informe_hijo_guard();
drop trigger if exists informe_cifras_guard_trg on public.informe_cifras;
create trigger informe_cifras_guard_trg before insert or update or delete on public.informe_cifras
  for each row execute function public.informe_hijo_guard();
drop trigger if exists informe_anexos_guard_trg on public.informe_anexos;
create trigger informe_anexos_guard_trg before insert or update or delete on public.informe_anexos
  for each row execute function public.informe_hijo_guard();

-- -----------------------------------------------------------------------------
-- 5. Funciones del contrato
-- -----------------------------------------------------------------------------

/** Abre (o devuelve) el informe de una unidad en el ciclo. */
create or replace function public.informe_abrir(p_ciclo uuid, p_unit uuid, p_plantilla text, p_destino uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select i.id into v_id from public.informe_instancias i where i.ciclo_id = p_ciclo and i.unit_id = p_unit;
  if v_id is not null then
    return v_id;
  end if;
  if not (public.has_role_at_least('planeacion') or public.unit_can_edit(p_unit)) then
    raise exception 'Sin permiso para abrir el informe de esta unidad' using errcode = '42501';
  end if;
  insert into public.informe_instancias (ciclo_id, unit_id, plantilla, destino)
  values (p_ciclo, p_unit, upper(btrim(p_plantilla)),
          coalesce(p_destino, (select coalesce(u.reports_to, u.parent_id) from public.units u where u.id = p_unit)))
  on conflict (ciclo_id, unit_id) do nothing
  returning id into v_id;
  if v_id is null then
    select i.id into v_id from public.informe_instancias i where i.ciclo_id = p_ciclo and i.unit_id = p_unit;
  end if;
  return v_id;
end;
$$;

/** Un informe devuelto que la unidad vuelve a tocar pasa solo a borrador. */
create or replace function public.informe_reabrir_si_devuelto(p_instancia uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.informe_instancias set estado = 'draft'
   where id = p_instancia and estado = 'back' and not public.has_role_at_least('planeacion');
$$;

create or replace function public.informe_guardar_seccion(p_instancia uuid, p_clave text, p_contenido jsonb, p_listo boolean default false)
returns public.informe_secciones
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.informe_secciones;
begin
  perform public.informe_reabrir_si_devuelto(p_instancia);
  insert into public.informe_secciones as s (instancia_id, clave, orden, contenido, listo, updated_by)
  values (p_instancia, p_clave, coalesce(substring(p_clave from '[0-9]+')::int, 0),
          coalesce(p_contenido, '{}'::jsonb), coalesce(p_listo, false), auth.uid())
  on conflict (instancia_id, clave) do update
     set contenido = coalesce(p_contenido, s.contenido),
         listo = coalesce(p_listo, false),
         updated_by = auth.uid()
  returning * into r;
  return r;
end;
$$;

create or replace function public.informe_guardar_cifra(p_instancia uuid, p_clave text, p_datos jsonb)
returns public.informe_cifras
language plpgsql
security invoker
set search_path = public
as $$
declare
  r       public.informe_cifras;
  v_datos jsonb := coalesce(p_datos, '{}'::jsonb);
  v_lim   int;
  v_otras int;
begin
  if jsonb_typeof(v_datos) <> 'object' then
    raise exception 'Los datos de la cifra deben ser un objeto' using errcode = '22023';
  end if;
  -- Lo que no se escribe desde aquí: identidad, la foto y los sellos.
  v_datos := v_datos - array['id', 'instancia_id', 'clave', 'propia', 'foto_valor', 'foto_en', 'foto_fuente', 'updated_by', 'updated_at'];

  perform public.informe_reabrir_si_devuelto(p_instancia);
  insert into public.informe_cifras (instancia_id, clave, fuente_tipo)
  values (p_instancia, p_clave, coalesce(v_datos ->> 'fuente_tipo', 'auto'))
  on conflict (instancia_id, clave) do nothing;

  select * into r from public.informe_cifras x where x.instancia_id = p_instancia and x.clave = p_clave;
  if not found then
    raise exception 'Sin permiso para cambiar este informe' using errcode = '42501';
  end if;
  r := jsonb_populate_record(r, v_datos);
  if r.fuente_tipo in ('auto', 'pdi') then
    r.valor := null;
  end if;

  if r.fuente_tipo in ('excel', 'manual', 'url') and r.incluida then
    select coalesce((c.config ->> 'limite_propios')::int, 3) into v_lim
      from public.informe_instancias i join public.informe_ciclos c on c.id = i.ciclo_id
     where i.id = p_instancia;
    select count(*) into v_otras
      from public.informe_cifras x
     where x.instancia_id = p_instancia and x.clave <> p_clave and x.propia and x.incluida
       and x.seccion_clave is not distinct from r.seccion_clave;
    if v_otras >= v_lim then
      raise exception 'Esta sección ya tiene % datos propios: es el límite del ciclo', v_lim using errcode = '23514';
    end if;
  end if;

  update public.informe_cifras x
     set etiqueta = coalesce(r.etiqueta, ''), seccion_clave = r.seccion_clave,
         fuente_tipo = r.fuente_tipo, fuente_nombre = coalesce(r.fuente_nombre, ''),
         fuente_clave = r.fuente_clave, consulta = coalesce(r.consulta, '{}'::jsonb),
         valor = r.valor, unidad = coalesce(r.unidad, ''), meta = r.meta, anterior = r.anterior,
         incluida = coalesce(r.incluida, true), justificacion = coalesce(r.justificacion, ''),
         pilar = r.pilar, visto = r.visto, updated_by = auth.uid()
   where x.id = r.id
  returning * into r;
  return r;
end;
$$;

/** Las cifras del informe en vivo, para la pantalla. Quien ve el informe. */
create or replace function public.informe_cifras_vivas(p_instancia uuid)
returns table (clave text, fuente_tipo text, valor numeric, fuente text, corte text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.informe_instancia_visible(p_instancia) then
    raise exception 'Sin permiso para ver este informe' using errcode = '42501';
  end if;
  return query select * from public.informe_vivas_de(p_instancia);
end;
$$;

/** Envía el informe (jefe o Planeación). La foto la toma el disparador. */
create or replace function public.informe_enviar(p_instancia uuid)
returns public.informe_instancias
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado text;
  r        public.informe_instancias;
begin
  select i.estado into v_estado from public.informe_instancias i where i.id = p_instancia;
  if v_estado is null then
    raise exception 'No existe ese informe' using errcode = 'P0002';
  end if;
  if v_estado not in ('draft', 'back') then
    raise exception 'Solo se envía un informe en borrador o devuelto' using errcode = '23514';
  end if;
  if v_estado = 'back' then
    update public.informe_instancias set estado = 'draft' where id = p_instancia;
  end if;
  update public.informe_instancias set estado = 'sent' where id = p_instancia returning * into r;
  if r.id is null then
    raise exception 'Sin permiso para enviar este informe' using errcode = '42501';
  end if;
  return r;
end;
$$;

/** Aprobar, devolver (con nota) o reabrir un devuelto. Deja la revisión escrita. */
create or replace function public.informe_cambiar_estado(p_instancia uuid, p_a text, p_nota text default null)
returns public.informe_instancias
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.informe_instancias;
begin
  if p_a not in ('ok', 'back', 'draft') then
    raise exception 'Estado no válido aquí: % (para enviar use informe_enviar)', p_a using errcode = '22023';
  end if;
  if p_a = 'back' and coalesce(btrim(p_nota), '') = '' then
    raise exception 'Para devolver un informe escriba la nota' using errcode = '23514';
  end if;

  if p_a = 'draft' then
    update public.informe_instancias set estado = 'draft' where id = p_instancia returning * into r;
  else
    update public.informe_instancias
       set estado = p_a, nota_revision = coalesce(p_nota, '')
     where id = p_instancia
    returning * into r;
  end if;
  if r.id is null then
    raise exception 'No existe ese informe o no tiene permiso' using errcode = '42501';
  end if;

  if p_a in ('ok', 'back') then
    insert into public.informe_revisiones (instancia_id, decision, nota, por)
    values (p_instancia, case p_a when 'ok' then 'aprobado' else 'devuelto' end, coalesce(p_nota, ''), auth.uid());
  end if;
  return r;
end;
$$;

/** Lo que llega al consolidador: secciones de los informes aprobados cuyo destino es su unidad. */
create or replace function public.informe_consolidado(p_instancia uuid)
returns table (instancia_id uuid, unit_id uuid, unit_nombre text, plantilla text,
               seccion_clave text, orden int, contenido jsonb, aprobado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inst record;
begin
  select i.unit_id, i.ciclo_id into inst from public.informe_instancias i where i.id = p_instancia;
  if inst.unit_id is null
     or not (public.has_role_at_least('planeacion') or public.unit_can_view(inst.unit_id)) then
    raise exception 'Sin permiso para ver el consolidado' using errcode = '42501';
  end if;
  return query
    select h.id, h.unit_id, u.name::text, h.plantilla, s.clave, s.orden, s.contenido, h.aprobado_en
      from public.informe_instancias h
      join public.units u on u.id = h.unit_id
      join public.informe_secciones s on s.instancia_id = h.id
     where h.ciclo_id = inst.ciclo_id
       and h.destino = inst.unit_id
       and h.estado = 'ok'
       and h.id <> p_instancia
     order by u.name, s.orden;
end;
$$;

-- Las internas no se exponen; las del contrato, solo con sesión.
revoke all on function public.informe_od_corte(uuid, int, uuid, text) from public, anon, authenticated;
revoke all on function public.informe_valor_od(jsonb, int) from public, anon, authenticated;
revoke all on function public.informe_valor_pdi(jsonb, int) from public, anon, authenticated;
revoke all on function public.informe_vivas_de(uuid) from public, anon, authenticated;
revoke all on function public.informe_validar_envio(uuid) from public, anon, authenticated;
grant execute on function public.informe_vivas_de(uuid) to service_role;

revoke all on function public.informe_abrir(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.informe_guardar_seccion(uuid, text, jsonb, boolean) from public, anon;
revoke all on function public.informe_guardar_cifra(uuid, text, jsonb) from public, anon;
revoke all on function public.informe_cifras_vivas(uuid) from public, anon;
revoke all on function public.informe_enviar(uuid) from public, anon;
revoke all on function public.informe_cambiar_estado(uuid, text, text) from public, anon;
revoke all on function public.informe_consolidado(uuid) from public, anon;
revoke all on function public.informe_reabrir_si_devuelto(uuid) from public, anon;
grant execute on function public.informe_abrir(uuid, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.informe_guardar_seccion(uuid, text, jsonb, boolean) to authenticated, service_role;
grant execute on function public.informe_guardar_cifra(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.informe_cifras_vivas(uuid) to authenticated, service_role;
grant execute on function public.informe_enviar(uuid) to authenticated, service_role;
grant execute on function public.informe_cambiar_estado(uuid, text, text) to authenticated, service_role;
grant execute on function public.informe_consolidado(uuid) to authenticated, service_role;
grant execute on function public.informe_reabrir_si_devuelto(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. RLS y permisos
-- -----------------------------------------------------------------------------

alter table public.informe_ciclos       enable row level security;
alter table public.informe_requisitos   enable row level security;
alter table public.informe_instancias   enable row level security;
alter table public.informe_secciones    enable row level security;
alter table public.informe_cifras       enable row level security;
alter table public.informe_fuentes      enable row level security;
alter table public.informe_anexos       enable row level security;
alter table public.informe_revisiones   enable row level security;
alter table public.informe_ejemplos     enable row level security;
alter table public.informe_aprendizaje  enable row level security;

-- Ciclos, requisitos y catálogo de fuentes: los leen Planeación y quien está en
-- alguna unidad (ranking_puede_leer_ciclo, 0149); los escribe Planeación.
drop policy if exists informe_ciclos_read on public.informe_ciclos;
create policy informe_ciclos_read on public.informe_ciclos for select to authenticated
  using (public.ranking_puede_leer_ciclo());
drop policy if exists informe_ciclos_write on public.informe_ciclos;
create policy informe_ciclos_write on public.informe_ciclos for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists informe_requisitos_read on public.informe_requisitos;
create policy informe_requisitos_read on public.informe_requisitos for select to authenticated
  using (public.ranking_puede_leer_ciclo());
drop policy if exists informe_requisitos_write on public.informe_requisitos;
create policy informe_requisitos_write on public.informe_requisitos for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists informe_fuentes_read on public.informe_fuentes;
create policy informe_fuentes_read on public.informe_fuentes for select to authenticated
  using (public.ranking_puede_leer_ciclo());
drop policy if exists informe_fuentes_write on public.informe_fuentes;
create policy informe_fuentes_write on public.informe_fuentes for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

-- Instancias: las ve su unidad, su destino (el estado) y Planeación. Las
-- diligencia editor o jefe; enviar, aprobar y devolver los controla el disparador.
drop policy if exists informe_instancias_read on public.informe_instancias;
create policy informe_instancias_read on public.informe_instancias for select to authenticated
  using (public.has_role_at_least('planeacion')
         or public.unit_can_view(unit_id)
         or (destino is not null and public.unit_can_view(destino)));
drop policy if exists informe_instancias_insert on public.informe_instancias;
create policy informe_instancias_insert on public.informe_instancias for insert to authenticated
  with check (public.has_role_at_least('planeacion') or public.unit_can_edit(unit_id));
drop policy if exists informe_instancias_update on public.informe_instancias;
create policy informe_instancias_update on public.informe_instancias for update to authenticated
  using (public.has_role_at_least('planeacion') or public.unit_can_edit(unit_id))
  with check (public.has_role_at_least('planeacion') or public.unit_can_edit(unit_id));
drop policy if exists informe_instancias_delete on public.informe_instancias;
create policy informe_instancias_delete on public.informe_instancias for delete to authenticated
  using (public.has_role_at_least('planeacion'));

-- Secciones, cifras y anexos: se ven con el informe; se tocan mientras esté abierto.
drop policy if exists informe_secciones_read on public.informe_secciones;
create policy informe_secciones_read on public.informe_secciones for select to authenticated
  using (public.informe_instancia_visible(instancia_id));
drop policy if exists informe_secciones_write on public.informe_secciones;
create policy informe_secciones_write on public.informe_secciones for all to authenticated
  using (public.informe_instancia_abierta(instancia_id))
  with check (public.informe_instancia_abierta(instancia_id));

drop policy if exists informe_cifras_read on public.informe_cifras;
create policy informe_cifras_read on public.informe_cifras for select to authenticated
  using (public.informe_instancia_visible(instancia_id));
drop policy if exists informe_cifras_write on public.informe_cifras;
create policy informe_cifras_write on public.informe_cifras for all to authenticated
  using (public.informe_instancia_abierta(instancia_id))
  with check (public.informe_instancia_abierta(instancia_id));

drop policy if exists informe_anexos_read on public.informe_anexos;
create policy informe_anexos_read on public.informe_anexos for select to authenticated
  using (public.informe_instancia_visible(instancia_id));
drop policy if exists informe_anexos_write on public.informe_anexos;
create policy informe_anexos_write on public.informe_anexos for all to authenticated
  using (public.informe_instancia_abierta(instancia_id))
  with check (public.informe_instancia_abierta(instancia_id));

-- Revisiones: se ven con el informe; las escribe Planeación.
drop policy if exists informe_revisiones_read on public.informe_revisiones;
create policy informe_revisiones_read on public.informe_revisiones for select to authenticated
  using (public.informe_instancia_visible(instancia_id));
drop policy if exists informe_revisiones_write on public.informe_revisiones;
create policy informe_revisiones_write on public.informe_revisiones for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

-- Corpus y aprendizaje de Pilo: Planeación y la administración (y service_role,
-- que no pasa por RLS).
drop policy if exists informe_ejemplos_planeacion on public.informe_ejemplos;
create policy informe_ejemplos_planeacion on public.informe_ejemplos for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));
drop policy if exists informe_aprendizaje_planeacion on public.informe_aprendizaje;
create policy informe_aprendizaje_planeacion on public.informe_aprendizaje for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

-- Sin acceso anónimo: ni siquiera lectura.
revoke all on public.informe_ciclos, public.informe_requisitos, public.informe_instancias,
              public.informe_secciones, public.informe_cifras, public.informe_fuentes,
              public.informe_anexos, public.informe_revisiones, public.informe_ejemplos,
              public.informe_aprendizaje
  from anon;
grant select, insert, update, delete on public.informe_ciclos, public.informe_requisitos,
  public.informe_instancias, public.informe_secciones, public.informe_cifras, public.informe_fuentes,
  public.informe_anexos, public.informe_revisiones, public.informe_ejemplos, public.informe_aprendizaje
  to authenticated;
grant all on public.informe_ciclos, public.informe_requisitos, public.informe_instancias,
  public.informe_secciones, public.informe_cifras, public.informe_fuentes, public.informe_anexos,
  public.informe_revisiones, public.informe_ejemplos, public.informe_aprendizaje
  to service_role;

-- -----------------------------------------------------------------------------
-- 7. La pantalla «informes» en los roles hechos a mano
--
-- `screens` es una lista libre; los roles de fábrica llevan all_screens. Se
-- añade a los roles a mano que ya veían rankings o reportes (patrón de 0050).
-- -----------------------------------------------------------------------------

update public.access_roles
   set screens = array_append(screens, 'informes')
 where not all_screens
   and not ('informes' = any (screens))
   and screens && array['rankings', 'reportes']::text[];

-- -----------------------------------------------------------------------------
-- 8. El bucket de anexos (privado)
--
-- Mismo patrón que «ranking-evidencias» (0149): si quien aplica la migración no
-- es dueño de storage.objects, el resto queda aplicado y el aviso dice qué hacer.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('informe-anexos', 'informe-anexos', false, 15728640)   -- 15 MB, privado
  on conflict (id) do update set public = false, file_size_limit = 15728640;

  execute 'drop policy if exists informe_anexos_lectura on storage.objects';
  execute $pol$
    create policy informe_anexos_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'informe-anexos'
             and (public.has_role_at_least('planeacion')
                  or public.unit_can_view(public.ranking_unidad_de_ruta(name))))
  $pol$;

  execute 'drop policy if exists informe_anexos_escritura on storage.objects';
  execute $pol$
    create policy informe_anexos_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'informe-anexos'
                  and (public.has_role_at_least('planeacion')
                       or public.unit_can_edit(public.ranking_unidad_de_ruta(name)))
                  and public.informe_instancia_abierta(public.ranking_respuesta_de_ruta(name)))
  $pol$;

  execute 'drop policy if exists informe_anexos_reemplazo on storage.objects';
  execute $pol$
    create policy informe_anexos_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'informe-anexos'
             and (public.has_role_at_least('planeacion')
                  or public.unit_can_edit(public.ranking_unidad_de_ruta(name)))
             and public.informe_instancia_abierta(public.ranking_respuesta_de_ruta(name)))
      with check (bucket_id = 'informe-anexos'
                  and (public.has_role_at_least('planeacion')
                       or public.unit_can_edit(public.ranking_unidad_de_ruta(name)))
                  and public.informe_instancia_abierta(public.ranking_respuesta_de_ruta(name)))
  $pol$;

  execute 'drop policy if exists informe_anexos_borrado on storage.objects';
  execute $pol$
    create policy informe_anexos_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'informe-anexos'
             and (public.has_role_at_least('planeacion')
                  or public.unit_can_edit(public.ranking_unidad_de_ruta(name)))
             and public.informe_instancia_abierta(public.ranking_respuesta_de_ruta(name)))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "informe-anexos" (%). Créalo a mano desde Storage: privado, 15 MB por archivo.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';

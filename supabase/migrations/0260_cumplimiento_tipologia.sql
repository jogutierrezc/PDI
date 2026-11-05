-- =============================================================================
-- PDI · 0260 · Cumplimiento de Tipología (carpeta «Gestión Master»)
--
-- Qué es. El módulo de Inteligencia de Negocios de Roomy (tipología profesoral)
-- llevado a PDI y alimentado SOLO por el Warehouse UDES: por programa y sede, las
-- horas de cada profesor, si cumple la tipología de su contrato, sus preventivas
-- y recomendaciones, el estado en Master y qué perfil conviene planear.
--
-- Cómo funciona. Roomy escribía bi_* al sincronizar con Master. Aquí un «calcular
-- corte» (periodo + sede; solo el administrador del módulo) lee los datos vigentes
-- del Warehouse por ct_insumos, corre el motor (TypeScript, src/modules/
-- cumplimiento-tipologia/motor, una sola copia) en el navegador de quien calcula y
-- escribe estas tablas por funciones. Se lee desde ellas; el navegador no recalcula.
--
-- DATOS PERSONALES. El Warehouse guarda la cédula como seudónimo y no guarda
-- nombres; esa política no se relaja. La llave de cada profesor es el seudónimo.
-- Los nombres se ven con el mecanismo de Gestión Master (función warehouse, acción
-- docentes, lectura en vivo sin guardar, registro en gm_consultas_nombres): aquí
-- solo cambia quién puede (ct_permitir_nombres: nivel del módulo y solo los
-- profesores de los programas que la persona ve).
--
-- ACCESO (la lección de Informes, 0192, y el patrón de gm_nivel de 0194). Todo sale
-- del permiso EXPLÍCITO del rol de acceso: access_roles.ct_nivel y la pantalla
-- «cumplimiento_tipologia». Ninguna función ni política usa la capacidad del rol.
-- ct_nivel nace en «none»: ningún rol existente entra al aplicar esta migración.
--
--   programa        programa o decano: ve los programas de su unidad
--   vicerrectoria   además compara programas y sedes (los de su vicerrectoría)
--   admin           administrador del módulo: además calcula el corte, asigna
--                   programas a unidades y es el único que ve las observaciones
--                   para Master
--
-- Qué programas ve cada quien lo decide el organigrama que ya asigna «Estructura y
-- usuarios» (units + unit_members, 0057): la pertenencia baja por el árbol, así que
-- una decanatura ve los programas de su facultad y una vicerrectoría los suyos. El
-- Warehouse conoce el programa por el nombre del departamento o carrera de la
-- nómina (DPTO/CARRERA): ct_programa_unidad lo une a una unidad (sugerida por nombre
-- al calcular, corregible por el administrador). Un programa sin unidad solo lo ve
-- el administrador del módulo (como en el Monitor, 0160).
--
-- REGLA CRÍTICA. La observación para Master (255 caracteres) y la observación
-- ampliada solo las ve el administrador del módulo: viven en ct_observacion_master,
-- con su propia política (solo admin) y nunca en una fila que lean programas o
-- decanos. El resumen, las observaciones, el contrato, el estado en Master, la
-- distribución semanal y el desglose sí los ven los tres niveles.
--
-- Requiere 0057/0061 (units, unit_can_view), 0160 (wh_norm_nombre), 0194 (gm_carga,
-- gm_consultas_nombres), 0155–0161 y 0259. Idempotente. Todo DELETE y UPDATE lleva
-- WHERE (safeupdate, 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El nivel en el rol de acceso
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'access_roles' and column_name = 'ct_nivel'
  ) then
    alter table public.access_roles add column ct_nivel text not null default 'none';
  end if;
end $$;

alter table public.access_roles drop constraint if exists access_roles_ct_nivel;
alter table public.access_roles
  add constraint access_roles_ct_nivel check (ct_nivel in ('none', 'programa', 'vicerrectoria', 'admin'));

comment on column public.access_roles.ct_nivel is
  'Cumplimiento de Tipología (0260): none · programa (programa o decano) · vicerrectoria · admin (administrador del módulo). Exige la pantalla «cumplimiento_tipologia». Nace en none: ningún rol existente entra.';

-- -----------------------------------------------------------------------------
-- 2. La regla de acceso
-- -----------------------------------------------------------------------------

/** El nivel de quien pregunta. Administración general: admin. Sin rol de acceso: nada. */
create or replace function public.ct_nivel_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() is null then 'none'
    when public.has_role_at_least('admin') then 'admin'
    when not public.has_access_role() then 'none'
    else coalesce((
      select case when r.all_screens or 'cumplimiento_tipologia' = any (r.screens) then r.ct_nivel else 'none' end
        from public.profiles p
        join public.access_roles r on r.id = p.access_role_id
       where p.id = auth.uid() and p.is_active
    ), 'none')
  end;
$$;

/** ¿Puede esta acción? ver (cualquier nivel) · nombres · comparar (vicerrectoría y admin) · administrar (admin). */
create or replace function public.ct_puede(p_accion text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_accion
    when 'ver'        then public.ct_nivel_actual() <> 'none'
    when 'nombres'    then public.ct_nivel_actual() <> 'none'
    when 'comparar'   then public.ct_nivel_actual() in ('vicerrectoria', 'admin')
    when 'administrar' then public.ct_nivel_actual() = 'admin'
    else false
  end;
$$;

comment on function public.ct_puede(text) is
  'Cumplimiento de Tipología (0260): el permiso sale del rol de acceso (ct_nivel y la pantalla), nunca de la capacidad global.';

-- -----------------------------------------------------------------------------
-- 3. Programas y unidades
-- -----------------------------------------------------------------------------

create table if not exists public.ct_programa_unidad (
  programa_norm  text primary key,
  programa       text not null default '',
  unit_id        uuid references public.units (id) on delete set null,
  origen         text not null default 'sugerida',
  actualizado_por uuid references public.profiles (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  constraint ct_programa_unidad_origen check (origen in ('sugerida', 'manual'))
);

comment on table public.ct_programa_unidad is
  'Cumplimiento de Tipología (0260): a qué unidad del organigrama corresponde cada programa (departamento o carrera de la nómina, normalizado). Sin unidad, solo lo ve el administrador del módulo.';

/** ¿Ve quien pregunta este programa (nombre normalizado)? El administrador, todos; los demás, los de las unidades donde están. */
create or replace function public.ct_ve_programa(p_norm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.ct_nivel_actual()
    when 'admin' then true
    when 'programa' then exists (select 1 from public.ct_programa_unidad u where u.programa_norm = p_norm and u.unit_id is not null and public.unit_can_view(u.unit_id))
    when 'vicerrectoria' then exists (select 1 from public.ct_programa_unidad u where u.programa_norm = p_norm and u.unit_id is not null and public.unit_can_view(u.unit_id))
    else false
  end;
$$;

-- -----------------------------------------------------------------------------
-- 4. El corte: bitácora y tablas de lectura
-- -----------------------------------------------------------------------------

create table if not exists public.ct_cortes (
  id             uuid primary key default gen_random_uuid(),
  periodo        text not null,
  sede           text not null,
  estado         text not null default 'en_curso',
  insumos        jsonb not null default '[]'::jsonb,
  avisos         jsonb not null default '[]'::jsonb,
  reglas         jsonb not null default '{}'::jsonb,
  profesores     integer not null default 0,
  observaciones  integer not null default 0,
  mensaje        text not null default '',
  creado_por     uuid references public.profiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  terminado_en   timestamptz,
  constraint ct_cortes_estado check (estado in ('en_curso', 'completo', 'fallido', 'reemplazado')),
  constraint ct_cortes_sede check (sede in ('buc', 'cuc', 'val', 'bog')),
  constraint ct_cortes_periodo check (periodo ~ '^[0-9]{4}[ab]$')
);

-- Un solo corte vigente por periodo y sede.
create unique index if not exists ct_cortes_vigente_idx on public.ct_cortes (periodo, sede) where estado = 'completo';
create index if not exists ct_cortes_clave_idx on public.ct_cortes (periodo, sede, creado_en desc);

comment on table public.ct_cortes is
  'Cumplimiento de Tipología (0260): bitácora del corte. Qué versión de cada conjunto del Warehouse se leyó (insumos), qué faltó (avisos) y las reglas usadas. Solo la lee el administrador del módulo.';

create table if not exists public.ct_resumen (
  id                  uuid primary key default gen_random_uuid(),
  corte_id            uuid not null references public.ct_cortes (id) on delete cascade,
  periodo             text not null,
  sede                text not null,
  seudonimo           text not null,
  programa            text not null default '',
  programa_norm       text not null default '',
  contrato            text not null default '',
  perfil              text not null default '',
  escalafon           text not null default '',
  duracion            text not null default '',
  veredicto           text not null,
  horas_esperadas     numeric,
  horas_total         numeric not null default 0,
  horas_docencia      numeric not null default 0,
  horas_investigacion numeric not null default 0,
  horas_extension     numeric not null default 0,
  horas_administracion numeric not null default 0,
  horas_bienestar     numeric not null default 0,
  horas_ensenanza     numeric not null default 0,
  horas_derivadas     numeric not null default 0,
  horas_inv_ext       numeric not null default 0,
  horas_gestion       numeric not null default 0,
  horas_capacitacion  numeric not null default 0,
  horas_comite        numeric not null default 0,
  horas_preparacion   numeric not null default 0,
  horas_pregrado      numeric not null default 0,
  horas_posgrado      numeric not null default 0,
  actividades         integer not null default 0,
  estado_master       text not null default 'SIN_DATO_MASTER',
  preaprobacion       text not null default 'SIN_DATO_MASTER',
  fuente_nomina       text not null default '',
  lectura_operativa   text not null default '',
  perfil_sugerido     text,
  sugerencia          text not null default 'sin_regla',
  consideracion_aprobacion boolean not null default false,
  incumplimientos     integer not null default 0,
  preventivas         integer not null default 0,
  causas              text[] not null default '{}',
  comparacion         jsonb not null default '[]'::jsonb,
  desglose            jsonb not null default '[]'::jsonb,
  semana              jsonb,
  carga               jsonb not null default '[]'::jsonb,
  creado_en           timestamptz not null default now(),
  constraint ct_resumen_unico unique (corte_id, seudonimo),
  constraint ct_resumen_veredicto check (veredicto in ('Cumple', 'No cumple', 'Pendiente de fuente', 'No aplica', 'Pendiente parametrizar')),
  constraint ct_resumen_sugerencia check (sugerencia in ('mantener', 'cambiar', 'ajustar', 'sin_regla')),
  constraint ct_resumen_seudonimo check (seudonimo ~ '^x-[0-9a-f]{10}$')
);

create index if not exists ct_resumen_programa_idx on public.ct_resumen (periodo, sede, programa_norm);

comment on table public.ct_resumen is
  'Cumplimiento de Tipología (0260): una fila por profesor y corte. La llave es el seudónimo de la cédula; no hay nombre. NO lleva la observación para Master ni la ampliada: esas viven en ct_observacion_master (solo administrador).';

create table if not exists public.ct_observacion (
  id            bigint generated always as identity primary key,
  corte_id      uuid not null references public.ct_cortes (id) on delete cascade,
  resumen_id    uuid not null references public.ct_resumen (id) on delete cascade,
  periodo       text not null,
  sede          text not null,
  programa_norm text not null default '',
  orden         integer not null default 0,
  causa         text not null,
  categoria     text not null default '',
  tipo          text not null,
  texto         text not null default '',
  resumen       text not null default ''
);

create index if not exists ct_observacion_resumen_idx on public.ct_observacion (resumen_id, orden);

comment on table public.ct_observacion is
  'Cumplimiento de Tipología (0260): incumplimientos, preventivas, recomendaciones y consideración de aprobación de cada profesor, en el texto del portal. Es lo que ven programas y decanos.';

create table if not exists public.ct_grupo_sin_matricula (
  id            bigint generated always as identity primary key,
  corte_id      uuid not null references public.ct_cortes (id) on delete cascade,
  resumen_id    uuid not null references public.ct_resumen (id) on delete cascade,
  periodo       text not null,
  sede          text not null,
  programa_norm text not null default '',
  codigo        text not null,
  nombre        text not null default '',
  grupo         text not null default '',
  capacidad     integer not null default 0,
  departamento  text not null default '',
  afectacion    text not null default ''
);

create index if not exists ct_grupo_resumen_idx on public.ct_grupo_sin_matricula (resumen_id);

-- LO QUE SOLO VE EL ADMINISTRADOR DEL MÓDULO. Tabla aparte, con su propia política.
create table if not exists public.ct_observacion_master (
  resumen_id           uuid primary key references public.ct_resumen (id) on delete cascade,
  corte_id             uuid not null references public.ct_cortes (id) on delete cascade,
  periodo              text not null,
  sede                 text not null,
  observacion_255      text not null default '',
  observacion_ampliada text not null default '',
  constraint ct_obs_master_255 check (char_length(observacion_255) <= 255)
);

comment on table public.ct_observacion_master is
  'Cumplimiento de Tipología (0260): la observación para pegar en Master (20 a 255 caracteres) y la observación ampliada. SOLO el administrador del módulo la lee (política ct_obs_master_lectura). Nunca va en ct_resumen.';

-- -----------------------------------------------------------------------------
-- 5. RLS: se lee por alcance; no hay políticas de escritura (se escribe por funciones)
-- -----------------------------------------------------------------------------

alter table public.ct_programa_unidad enable row level security;
alter table public.ct_cortes enable row level security;
alter table public.ct_resumen enable row level security;
alter table public.ct_observacion enable row level security;
alter table public.ct_grupo_sin_matricula enable row level security;
alter table public.ct_observacion_master enable row level security;

drop policy if exists ct_programa_unidad_lectura on public.ct_programa_unidad;
create policy ct_programa_unidad_lectura on public.ct_programa_unidad for select to authenticated
  using (public.ct_puede('administrar'));

drop policy if exists ct_cortes_lectura on public.ct_cortes;
create policy ct_cortes_lectura on public.ct_cortes for select to authenticated
  using (public.ct_puede('administrar'));

/**
 * ¿Es este el corte vigente? Va en `security definer` porque las políticas de lectura la llaman y ct_cortes solo la lee el
 * administrador: una subconsulta directa dentro de la política también pasaría por la RLS de ct_cortes y vaciaría la lectura.
 */
create or replace function public.ct_corte_completo(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ct_cortes c where c.id = p_id and c.estado = 'completo');
$$;

revoke all on function public.ct_corte_completo(uuid) from public, anon;
grant execute on function public.ct_corte_completo(uuid) to authenticated;

-- Solo el corte vigente (completo): mientras se escribe uno nuevo, nadie ve filas a medias.
drop policy if exists ct_resumen_lectura on public.ct_resumen;
create policy ct_resumen_lectura on public.ct_resumen for select to authenticated
  using (
    public.ct_puede('ver')
    and public.ct_ve_programa(programa_norm)
    and public.ct_corte_completo(corte_id)
  );

drop policy if exists ct_observacion_lectura on public.ct_observacion;
create policy ct_observacion_lectura on public.ct_observacion for select to authenticated
  using (
    public.ct_puede('ver')
    and public.ct_ve_programa(programa_norm)
    and public.ct_corte_completo(corte_id)
  );

drop policy if exists ct_grupo_lectura on public.ct_grupo_sin_matricula;
create policy ct_grupo_lectura on public.ct_grupo_sin_matricula for select to authenticated
  using (
    public.ct_puede('ver')
    and public.ct_ve_programa(programa_norm)
    and public.ct_corte_completo(corte_id)
  );

drop policy if exists ct_obs_master_lectura on public.ct_observacion_master;
create policy ct_obs_master_lectura on public.ct_observacion_master for select to authenticated
  using (
    public.ct_puede('administrar')
    and public.ct_corte_completo(corte_id)
  );

revoke all on public.ct_programa_unidad, public.ct_cortes, public.ct_resumen, public.ct_observacion,
  public.ct_grupo_sin_matricula, public.ct_observacion_master from public, anon, authenticated;
grant select on public.ct_programa_unidad, public.ct_cortes, public.ct_resumen, public.ct_observacion,
  public.ct_grupo_sin_matricula, public.ct_observacion_master to authenticated;
grant select on public.ct_programa_unidad, public.ct_cortes, public.ct_resumen, public.ct_observacion,
  public.ct_grupo_sin_matricula, public.ct_observacion_master to service_role;

-- -----------------------------------------------------------------------------
-- 6. Insumos: lo que el corte lee del Warehouse (solo el administrador del módulo)
--
-- Devuelve jsonb (no filas) para no chocar con el tope de filas de la API; pagina con
-- p_desde y p_cuantas. Todo sale ya sin datos personales: la cédula es el seudónimo.
--
-- La nómina consolidada nueva escribe la identidad del profesor (cédula, contrato,
-- categoría, duración) solo en la PRIMERA fila de cada profesor y deja en blanco las de
-- sus demás actividades, y entre profesores trae filas de subtotal («Total horas
-- directas…»). Aquí se completa la identidad hacia abajo y se dejan solo las filas con
-- código de actividad. Con la nómina antigua (identidad repetida en cada fila) da lo mismo.
-- -----------------------------------------------------------------------------

create or replace function public.ct_insumos(p_periodo text, p_sede text, p_fuente text, p_desde integer default 0, p_cuantas integer default 4000)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_conjunto text;
  v_carga uuid;
  v_meta jsonb;
  v_filas jsonb;
  v_total integer;
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  if p_periodo !~ '^[0-9]{4}[ab]$' or p_sede not in ('buc', 'cuc', 'val', 'bog') then
    raise exception 'Cumplimiento de Tipología: periodo o sede inválidos.' using errcode = '22023';
  end if;
  v_conjunto := case p_fuente
    when 'nomina' then 'ms_nom'
    when 'aprobacion' then 'ms_aprob'
    when 'horario' then 'ms_hordep'
    when 'posgrado' then 'ms_posg'
    else null end;
  if v_conjunto is null then
    raise exception 'Cumplimiento de Tipología: fuente desconocida.' using errcode = '22023';
  end if;

  v_carga := public.gm_carga(v_conjunto, p_periodo, p_sede);
  if v_carga is null then
    return jsonb_build_object('carga', null, 'total', 0, 'filas', '[]'::jsonb);
  end if;
  select jsonb_build_object('id', c.id, 'conjunto', c.conjunto, 'version', c.version, 'filas', c.filas, 'terminada_en', c.terminada_en)
    into v_meta from public.wh_cargas c where c.id = v_carga;

  if p_fuente = 'nomina' then
    with marc as (
      select f.n, f.datos as d,
             nullif(btrim(f.datos ->> 'codigo'), '') as cod,
             nullif(btrim(f.datos ->> 'cedula'), '') as ced
        from public.wh_filas f where f.carga_id = v_carga
    ), act as (
      select m.n, m.d, m.cod, m.ced,
             sum(case when m.ced is not null then 1 else 0 end) over (order by m.n) as bloque
        from marc m where m.cod is not null
    ), idf as (
      select a.n, a.d, a.cod, a.bloque,
             first_value(a.ced) over (partition by a.bloque order by a.n) as seudo,
             first_value(nullif(btrim(a.d ->> 'contrato'), '')) over (partition by a.bloque order by a.n) as contrato,
             first_value(nullif(btrim(a.d ->> 'categoria'), '')) over (partition by a.bloque order by a.n) as categoria,
             first_value(nullif(btrim(a.d ->> 'duracion'), '')) over (partition by a.bloque order by a.n) as duracion
        from act a
    ), listo as (
      select * from idf where seudo is not null
    )
    select (select count(*) from listo),
           coalesce(jsonb_agg(jsonb_build_object(
             'seudonimo', x.seudo, 'contrato', x.contrato, 'categoria', x.categoria, 'duracion', x.duracion,
             'codigo', x.cod,
             'actividad', x.d ->> 'asignatura_actividad',
             'tipo', x.d ->> 'tipo_de_actividad',
             'grupo', coalesce(x.d ->> 'grp', x.d ->> 'grupo'),
             'dpto', coalesce(x.d ->> 'dpto_carrera', x.d ->> 'programa_departamento'),
             'codprog', x.d ->> 'cod_programa',
             'horas', coalesce(x.d ->> 'horas', x.d ->> 'horas_semanales'),
             'horas_semestre', x.d ->> 'horas_semestre',
             'mat', x.d ->> 'mat',
             'matriculados', x.d ->> 'matriculados',
             'capacidad', x.d ->> 'capacidad') order by x.n), '[]'::jsonb)
      into v_total, v_filas
      from (select * from listo order by n offset greatest(p_desde, 0) limit least(greatest(p_cuantas, 1), 6000)) x;

  elsif p_fuente = 'aprobacion' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'seudonimo', x.d ->> 'identification', 'approved', x.d -> 'approved', 'pre_approved', x.d -> 'pre_approved',
             'to_confirm', x.d -> 'to_confirm', 'manual_preapproval', x.d -> 'manual_preapproval', 'origen', x.d ->> 'origen') order by x.n), '[]'::jsonb)
      into v_total, v_filas
      from (select f.n, f.datos as d from public.wh_filas f where f.carga_id = v_carga order by f.n offset greatest(p_desde, 0) limit least(greatest(p_cuantas, 1), 6000)) x;
    select count(*) into v_total from public.wh_filas f where f.carga_id = v_carga;

  elsif p_fuente = 'horario' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'seudonimo', x.d ->> 'id_docente', 'grupos', x.d ->> 'grupos', 'dia_sem', x.d ->> 'dia_sem',
             'hora_inic', x.d ->> 'hora_inic', 'hora_fin', x.d ->> 'hora_fin') order by x.n), '[]'::jsonb)
      into v_filas
      from (select f.n, f.datos as d from public.wh_filas f
             where f.carga_id = v_carga
               and (f.datos ->> 'estado_horario' is null or f.datos ->> 'estado_horario' ilike 'activ%')
             order by f.n offset greatest(p_desde, 0) limit least(greatest(p_cuantas, 1), 6000)) x;
    select count(*) into v_total from public.wh_filas f
     where f.carga_id = v_carga and (f.datos ->> 'estado_horario' is null or f.datos ->> 'estado_horario' ilike 'activ%');

  else -- posgrado
    select coalesce(jsonb_agg(jsonb_build_object('codigo', x.d ->> 'codigo', 'grupo', x.d ->> 'grupo') order by x.n), '[]'::jsonb)
      into v_filas
      from (select f.n, f.datos as d from public.wh_filas f where f.carga_id = v_carga order by f.n offset greatest(p_desde, 0) limit least(greatest(p_cuantas, 1), 6000)) x;
    select count(*) into v_total from public.wh_filas f where f.carga_id = v_carga;
  end if;

  return jsonb_build_object('carga', v_meta, 'total', coalesce(v_total, 0), 'filas', coalesce(v_filas, '[]'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Escribir el corte: abrir → agregar → cerrar (solo el administrador del módulo)
-- -----------------------------------------------------------------------------

create or replace function public.ct_abrir_corte(p_periodo text, p_sede text, p_insumos jsonb, p_reglas jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: solo el administrador del módulo calcula el corte.' using errcode = '42501';
  end if;
  if p_periodo !~ '^[0-9]{4}[ab]$' or p_sede not in ('buc', 'cuc', 'val', 'bog') then
    raise exception 'Cumplimiento de Tipología: periodo o sede inválidos.' using errcode = '22023';
  end if;
  -- Un corte abandonado (más de 30 minutos en curso) se da por fallido y se limpia.
  update public.ct_cortes set estado = 'fallido', mensaje = 'abandonado', terminado_en = now()
   where periodo = p_periodo and sede = p_sede and estado = 'en_curso' and creado_en < now() - interval '30 minutes';
  delete from public.ct_resumen r using public.ct_cortes c
   where r.corte_id = c.id and c.periodo = p_periodo and c.sede = p_sede and c.estado = 'fallido';
  if exists (select 1 from public.ct_cortes where periodo = p_periodo and sede = p_sede and estado = 'en_curso') then
    raise exception 'corte_en_curso: ya hay un corte de este periodo y sede en marcha.' using errcode = 'P0001';
  end if;
  insert into public.ct_cortes (periodo, sede, insumos, reglas, creado_por)
  values (p_periodo, p_sede, coalesce(p_insumos, '[]'::jsonb), coalesce(p_reglas, '{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ct_corte_abierto(p_corte uuid)
returns public.ct_cortes
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.ct_cortes;
begin
  select * into c from public.ct_cortes where id = p_corte;
  if not found or c.estado <> 'en_curso' or c.creado_por is distinct from auth.uid() then
    raise exception 'corte_no_disponible: el corte no existe, ya terminó o es de otra persona.' using errcode = 'P0001';
  end if;
  return c;
end;
$$;

revoke all on function public.ct_corte_abierto(uuid) from public, anon, authenticated;

/** Agrega filas de ct_resumen (hasta 200 por llamada). La clave del programa se normaliza aquí, no en el navegador. */
create or replace function public.ct_agregar_resumen(p_corte uuid, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.ct_cortes;
  n integer;
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  c := public.ct_corte_abierto(p_corte);
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 200 then
    raise exception 'filas_invalidas: se espera una lista de hasta 200 filas.' using errcode = 'P0001';
  end if;
  insert into public.ct_resumen (
    corte_id, periodo, sede, seudonimo, programa, programa_norm, contrato, perfil, escalafon, duracion, veredicto,
    horas_esperadas, horas_total, horas_docencia, horas_investigacion, horas_extension, horas_administracion, horas_bienestar,
    horas_ensenanza, horas_derivadas, horas_inv_ext, horas_gestion, horas_capacitacion, horas_comite, horas_preparacion,
    horas_pregrado, horas_posgrado, actividades, estado_master, preaprobacion, fuente_nomina, lectura_operativa,
    perfil_sugerido, sugerencia, consideracion_aprobacion, incumplimientos, preventivas, causas, comparacion, desglose, semana, carga)
  select p_corte, c.periodo, c.sede, r.seudonimo, coalesce(r.programa, ''), public.wh_norm_nombre(r.programa), coalesce(r.contrato, ''), coalesce(r.perfil, ''),
         coalesce(r.escalafon, ''), coalesce(r.duracion, ''), r.veredicto,
         r.horas_esperadas, coalesce(r.horas_total, 0), coalesce(r.horas_docencia, 0), coalesce(r.horas_investigacion, 0), coalesce(r.horas_extension, 0),
         coalesce(r.horas_administracion, 0), coalesce(r.horas_bienestar, 0),
         coalesce(r.horas_ensenanza, 0), coalesce(r.horas_derivadas, 0), coalesce(r.horas_inv_ext, 0), coalesce(r.horas_gestion, 0),
         coalesce(r.horas_capacitacion, 0), coalesce(r.horas_comite, 0), coalesce(r.horas_preparacion, 0),
         coalesce(r.horas_pregrado, 0), coalesce(r.horas_posgrado, 0), coalesce(r.actividades, 0),
         coalesce(r.estado_master, 'SIN_DATO_MASTER'), coalesce(r.preaprobacion, 'SIN_DATO_MASTER'), coalesce(r.fuente_nomina, ''), coalesce(r.lectura_operativa, ''),
         r.perfil_sugerido, coalesce(r.sugerencia, 'sin_regla'), coalesce(r.consideracion_aprobacion, false),
         coalesce(r.incumplimientos, 0), coalesce(r.preventivas, 0), coalesce(r.causas, '{}'), coalesce(r.comparacion, '[]'::jsonb),
         coalesce(r.desglose, '[]'::jsonb), r.semana, coalesce(r.carga, '[]'::jsonb)
    from jsonb_populate_recordset(null::public.ct_resumen, p_filas) r;
  get diagnostics n = row_count;
  return n;
end;
$$;

/** Agrega observaciones, grupos sin matrícula o textos para Master (hasta 400 por llamada). Cada fila trae el seudónimo de su profesor. */
create or replace function public.ct_agregar_detalle(p_corte uuid, p_tipo text, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.ct_cortes;
  n integer;
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  c := public.ct_corte_abierto(p_corte);
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 400 then
    raise exception 'filas_invalidas: se espera una lista de hasta 400 filas.' using errcode = 'P0001';
  end if;

  if p_tipo = 'observacion' then
    insert into public.ct_observacion (corte_id, resumen_id, periodo, sede, programa_norm, orden, causa, categoria, tipo, texto, resumen)
    select p_corte, s.id, c.periodo, c.sede, s.programa_norm, coalesce(x.orden, 0), x.causa, coalesce(x.categoria, ''), x.tipo, coalesce(x.texto, ''), coalesce(x.resumen, '')
      from jsonb_to_recordset(p_filas) as x (seudonimo text, orden integer, causa text, categoria text, tipo text, texto text, resumen text)
      join public.ct_resumen s on s.corte_id = p_corte and s.seudonimo = x.seudonimo;
  elsif p_tipo = 'grupo' then
    insert into public.ct_grupo_sin_matricula (corte_id, resumen_id, periodo, sede, programa_norm, codigo, nombre, grupo, capacidad, departamento, afectacion)
    select p_corte, s.id, c.periodo, c.sede, s.programa_norm, x.codigo, coalesce(x.nombre, ''), coalesce(x.grupo, ''), coalesce(x.capacidad, 0), coalesce(x.departamento, ''), coalesce(x.afectacion, '')
      from jsonb_to_recordset(p_filas) as x (seudonimo text, codigo text, nombre text, grupo text, capacidad integer, departamento text, afectacion text)
      join public.ct_resumen s on s.corte_id = p_corte and s.seudonimo = x.seudonimo;
  elsif p_tipo = 'master' then
    insert into public.ct_observacion_master (resumen_id, corte_id, periodo, sede, observacion_255, observacion_ampliada)
    select s.id, p_corte, c.periodo, c.sede, left(coalesce(x.observacion_255, ''), 255), coalesce(x.observacion_ampliada, '')
      from jsonb_to_recordset(p_filas) as x (seudonimo text, observacion_255 text, observacion_ampliada text)
      join public.ct_resumen s on s.corte_id = p_corte and s.seudonimo = x.seudonimo;
  else
    raise exception 'tipo_invalido: observacion, grupo o master.' using errcode = 'P0001';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

/**
 * Cierra el corte. Con p_ok = false lo da por fallido y borra lo escrito. Con p_ok = true lo deja vigente, retira el
 * anterior del mismo periodo y sede (sus filas se van; la bitácora queda) y propone una unidad para los programas nuevos.
 */
create or replace function public.ct_cerrar_corte(p_corte uuid, p_ok boolean, p_mensaje text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.ct_cortes;
  v_prof integer;
  v_obs integer;
  v_nuevos integer := 0;
  v_sin_unidad integer;
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  c := public.ct_corte_abierto(p_corte);

  if not coalesce(p_ok, false) then
    delete from public.ct_resumen where corte_id = p_corte;
    update public.ct_cortes set estado = 'fallido', mensaje = left(coalesce(p_mensaje, 'sin detalle'), 600), terminado_en = now() where id = p_corte;
    return jsonb_build_object('ok', false);
  end if;

  select count(*) into v_prof from public.ct_resumen where corte_id = p_corte;
  select count(*) into v_obs from public.ct_observacion where corte_id = p_corte;
  if v_prof = 0 then
    raise exception 'corte_vacio: el corte no tiene profesores; no se deja vigente.' using errcode = 'P0001';
  end if;

  -- Retira el corte vigente anterior de este periodo y sede (en cascada se van sus filas).
  delete from public.ct_resumen r using public.ct_cortes o
   where r.corte_id = o.id and o.periodo = c.periodo and o.sede = c.sede and o.estado = 'completo' and o.id <> p_corte;
  update public.ct_cortes set estado = 'reemplazado'
   where periodo = c.periodo and sede = c.sede and estado = 'completo' and id <> p_corte;
  update public.ct_cortes
     set estado = 'completo', profesores = v_prof, observaciones = v_obs, mensaje = left(coalesce(p_mensaje, ''), 600), terminado_en = now()
   where id = p_corte;

  -- Programas nuevos: se propone la unidad cuando el nombre coincide con una sola (un programa, o «Programa de …»).
  with cand as (
    select r.programa_norm, min(r.programa) as programa
      from public.ct_resumen r
     where r.corte_id = p_corte and r.programa_norm <> ''
     group by r.programa_norm
  ), nuevos as (
    select k.programa_norm, k.programa from cand k
     where not exists (select 1 from public.ct_programa_unidad x where x.programa_norm = k.programa_norm)
  )
  insert into public.ct_programa_unidad (programa_norm, programa, unit_id, origen, actualizado_por)
  select n.programa_norm, n.programa,
         (select case when count(*) = 1 then (array_agg(u.id))[1] end
            from public.units u
           where u.kind in ('programa', 'facultad')
             and (public.wh_norm_nombre(u.name) = n.programa_norm
                  or public.wh_norm_nombre(u.name) = 'PROGRAMA DE ' || n.programa_norm
                  or public.wh_norm_nombre(u.name) = 'PROGRAMA ' || n.programa_norm)),
         'sugerida', auth.uid()
    from nuevos n
  on conflict (programa_norm) do nothing;
  get diagnostics v_nuevos = row_count;

  select count(*) into v_sin_unidad from public.ct_programa_unidad u
   where u.unit_id is null and exists (select 1 from public.ct_resumen r where r.corte_id = p_corte and r.programa_norm = u.programa_norm);

  return jsonb_build_object('ok', true, 'profesores', v_prof, 'observaciones', v_obs, 'programas_nuevos', v_nuevos, 'programas_sin_unidad', v_sin_unidad);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Lecturas que no son una tabla
-- -----------------------------------------------------------------------------

/** Cuántos profesores cumplen, por programa y sede, solo en los programas que la persona ve. Alimenta el selector y la vista «Programas por sede». */
create or replace function public.ct_matriz(p_periodo text)
returns table (programa_norm text, programa text, sede text, profesores integer, cumplen integer, no_cumplen integer, sin_regla integer, corte_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ct_puede('ver') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  return query
    select r.programa_norm, min(r.programa), r.sede, count(*)::integer,
           (count(*) filter (where r.veredicto = 'Cumple'))::integer,
           (count(*) filter (where r.veredicto = 'No cumple'))::integer,
           (count(*) filter (where r.veredicto not in ('Cumple', 'No cumple')))::integer,
           max(c.terminado_en)
      from public.ct_resumen r
      join public.ct_cortes c on c.id = r.corte_id and c.estado = 'completo'
     where r.periodo = p_periodo and r.programa_norm <> '' and public.ct_ve_programa(r.programa_norm)
     group by r.programa_norm, r.sede
     order by min(r.programa), r.sede;
end;
$$;

/** El corte vigente de un periodo y sede. Los insumos y avisos (qué se leyó, qué faltó) solo para el administrador. */
create or replace function public.ct_corte_actual(p_periodo text, p_sede text)
returns table (id uuid, terminado_en timestamptz, profesores integer, observaciones integer, insumos jsonb, avisos jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ct_puede('ver') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  return query
    select c.id, c.terminado_en, c.profesores, c.observaciones,
           case when public.ct_puede('administrar') then c.insumos end,
           case when public.ct_puede('administrar') then c.avisos end
      from public.ct_cortes c
     where c.periodo = p_periodo and c.sede = p_sede and c.estado = 'completo'
     limit 1;
end;
$$;

/** Los últimos cortes (bitácora). Solo el administrador. */
create or replace function public.ct_cortes_listar(p_periodo text)
returns table (id uuid, sede text, estado text, profesores integer, observaciones integer, mensaje text, avisos jsonb, insumos jsonb, creado_en timestamptz, terminado_en timestamptz, quien text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: solo el administrador del módulo ve la bitácora.' using errcode = '42501';
  end if;
  return query
    select c.id, c.sede, c.estado, c.profesores, c.observaciones, c.mensaje, c.avisos, c.insumos, c.creado_en, c.terminado_en,
           coalesce(p.full_name, 'Persona retirada')
      from public.ct_cortes c left join public.profiles p on p.id = c.creado_por
     where c.periodo = p_periodo
     order by c.creado_en desc
     limit 30;
end;
$$;

/** Guarda los avisos de un corte (qué fuente faltó). La llama el navegador al cerrar, antes de ct_cerrar_corte. */
create or replace function public.ct_avisos_corte(p_corte uuid, p_avisos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  perform public.ct_corte_abierto(p_corte);
  update public.ct_cortes set avisos = coalesce(p_avisos, '[]'::jsonb) where id = p_corte;
end;
$$;

/** Programas conocidos y la unidad de cada uno (para asignarlos). Solo el administrador. */
create or replace function public.ct_programas_listar()
returns table (programa_norm text, programa text, unit_id uuid, unidad text, origen text, profesores integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  return query
    select u.programa_norm, u.programa, u.unit_id, n.name, u.origen,
           coalesce((select count(*)::integer from public.ct_resumen r join public.ct_cortes c on c.id = r.corte_id and c.estado = 'completo'
                      where r.programa_norm = u.programa_norm), 0)
      from public.ct_programa_unidad u left join public.units n on n.id = u.unit_id
     order by (u.unit_id is null) desc, u.programa;
end;
$$;

/** Las unidades del organigrama a las que se puede asignar un programa. Solo el administrador. */
create or replace function public.ct_unidades()
returns table (id uuid, nombre text, tipo text, codigo text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  return query select u.id, u.name, u.kind::text, u.code from public.units u order by u.kind::text, u.name;
end;
$$;

/** Asigna (o quita, con null) la unidad de un programa. Quien lo asigna queda registrado. */
create or replace function public.ct_asignar_programa(p_programa_norm text, p_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ct_puede('administrar') then
    raise exception 'Cumplimiento de Tipología: sin permiso.' using errcode = '42501';
  end if;
  if p_unit_id is not null and not exists (select 1 from public.units where id = p_unit_id) then
    raise exception 'La unidad no existe.' using errcode = '22023';
  end if;
  update public.ct_programa_unidad
     set unit_id = p_unit_id, origen = 'manual', actualizado_por = auth.uid(), actualizado_en = now()
   where programa_norm = p_programa_norm;
  if not found then
    raise exception 'El programa no existe.' using errcode = '22023';
  end if;
end;
$$;

/**
 * Los nombres de los profesores se leen en vivo del Master (función warehouse, acción docentes) y no se guardan. Antes de
 * leer, la función llama a esta: comprueba el nivel del módulo, deja pasar solo a los profesores de este programa que la
 * persona ve (los del corte vigente) y anota la consulta en gm_consultas_nombres, el mismo registro de Gestión Master.
 * Devuelve los seudónimos permitidos (vacío = sin permiso).
 */
create or replace function public.ct_permitir_nombres(p_periodo text, p_sede text, p_programa text, p_seudonimos text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text := public.wh_norm_nombre(p_programa);
  v_ok text[];
begin
  if not public.ct_puede('nombres') or not public.ct_ve_programa(v_norm) then
    return '{}';
  end if;
  select coalesce(array_agg(r.seudonimo), '{}') into v_ok
    from public.ct_resumen r
    join public.ct_cortes c on c.id = r.corte_id and c.estado = 'completo'
   where r.periodo = p_periodo and r.sede = p_sede and r.programa_norm = v_norm and r.seudonimo = any (p_seudonimos);
  if coalesce(array_length(v_ok, 1), 0) = 0 then
    return '{}';
  end if;
  insert into public.gm_consultas_nombres (usuario_id, periodo, sede, codigo, cantidad)
  values (auth.uid(), left(coalesce(p_periodo, ''), 10), left(coalesce(p_sede, ''), 3), left('CT: ' || coalesce(p_programa, ''), 120), array_length(v_ok, 1));
  return v_ok;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Quién llama a qué
-- -----------------------------------------------------------------------------

revoke all on function
  public.ct_nivel_actual(), public.ct_puede(text), public.ct_ve_programa(text),
  public.ct_insumos(text, text, text, integer, integer),
  public.ct_abrir_corte(text, text, jsonb, jsonb), public.ct_agregar_resumen(uuid, jsonb), public.ct_agregar_detalle(uuid, text, jsonb),
  public.ct_cerrar_corte(uuid, boolean, text), public.ct_avisos_corte(uuid, jsonb),
  public.ct_matriz(text), public.ct_corte_actual(text, text), public.ct_cortes_listar(text),
  public.ct_programas_listar(), public.ct_unidades(), public.ct_asignar_programa(text, uuid),
  public.ct_permitir_nombres(text, text, text, text[])
  from public, anon;

grant execute on function
  public.ct_nivel_actual(), public.ct_puede(text), public.ct_ve_programa(text),
  public.ct_insumos(text, text, text, integer, integer),
  public.ct_abrir_corte(text, text, jsonb, jsonb), public.ct_agregar_resumen(uuid, jsonb), public.ct_agregar_detalle(uuid, text, jsonb),
  public.ct_cerrar_corte(uuid, boolean, text), public.ct_avisos_corte(uuid, jsonb),
  public.ct_matriz(text), public.ct_corte_actual(text, text), public.ct_cortes_listar(text),
  public.ct_programas_listar(), public.ct_unidades(), public.ct_asignar_programa(text, uuid),
  public.ct_permitir_nombres(text, text, text, text[])
  to authenticated;

notify pgrst, 'reload schema';

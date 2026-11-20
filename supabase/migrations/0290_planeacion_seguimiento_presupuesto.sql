-- =============================================================================
-- PDI · 0290 · Planeación y Seguimiento · FASE 3B (parte 2): evaluación financiera de la VAF y vigilancia del presupuesto
--
-- Contrato: docs/planeacion-seguimiento/CONTRATO-BD-F3B.md §7 y §6. Requiere 0286 a 0289.
-- Los planes no pasan por aprobación de Planeación; la VAF (rol ps_nivel «financiero») los evalúa en financiación y presupuesto y
-- se vigila la ejecución. La evaluación NO bloquea la operación.
--
--   · ps_config.vaf_unit_id; ps_evaluaciones_vaf (se abre al publicar una versión); ps_linea_financiacion; ps_presupuesto_movs (libro
--     insert-only: se anula con otro movimiento); cálculos de presupuesto, desviación y vigilancia; alertas semanales idempotentes;
--     tablero con presupuesto, evaluaciones y alertas; plantillas c-ps-vaf-evaluar, c-ps-vaf-resultado y c-ps-vaf-alerta.
-- Todo security definer con search_path fijo; nunca capacity ni has_role_at_least. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Unidad VAF y tablas
-- -----------------------------------------------------------------------------

alter table public.ps_config add column if not exists vaf_unit_id uuid references public.units (id) on delete set null;

-- Por omisión: la unidad «Vicerrectoría Administrativa y Financiera» (o con código VAF) si existe; el administrador la fija.
update public.ps_config
   set vaf_unit_id = (select u.id from public.units u
                       where upper(u.code) = 'VAF' or public.ps_texto_norm(u.name) = 'vicerrectoria administrativa y financiera'
                       order by (upper(u.code) = 'VAF') desc, u.id limit 1)
 where id and vaf_unit_id is null;

create table if not exists public.ps_evaluaciones_vaf (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references public.ps_planes (id) on delete restrict,
  version_id         uuid not null references public.ps_versiones (id) on delete restrict,
  estado             text not null default 'pendiente',
  monto_solicitado   numeric(18, 2) not null default 0,
  monto_aprobado     numeric(18, 2),
  fuente_financiacion text not null default '',
  observaciones      text not null default '',
  evaluado_por       uuid references public.profiles (id) on delete set null,
  evaluado_en        timestamptz,
  creado_en          timestamptz not null default now(),
  constraint ps_vaf_estado check (estado in ('pendiente', 'en_revision', 'aprobada', 'aprobada_con_ajustes', 'no_viable')),
  constraint ps_vaf_montos check (monto_solicitado >= 0 and (monto_aprobado is null or monto_aprobado >= 0)),
  constraint ps_vaf_textos check (char_length(fuente_financiacion) <= 200 and char_length(observaciones) <= 2000),
  constraint ps_vaf_resuelta check ((estado in ('aprobada', 'aprobada_con_ajustes', 'no_viable')) = (evaluado_en is not null)),
  constraint ps_vaf_obs check (estado not in ('aprobada_con_ajustes', 'no_viable') or char_length(btrim(observaciones)) >= 20)
);
create unique index if not exists ps_vaf_una_por_version on public.ps_evaluaciones_vaf (version_id);
create index if not exists ps_vaf_plan_idx on public.ps_evaluaciones_vaf (plan_id, creado_en desc);

create table if not exists public.ps_linea_financiacion (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.ps_planes (id) on delete restrict,
  linea_id       uuid not null references public.ps_lineas (id) on delete cascade,
  anio           smallint not null,
  monto_aprobado numeric(18, 2) not null default 0,
  fuente         text not null default '',
  estado         text not null default 'sin_evaluar',
  nota           text not null default '',
  evaluado_por   uuid references public.profiles (id) on delete set null,
  evaluado_en    timestamptz,
  constraint ps_lf_estado check (estado in ('sin_evaluar', 'aprobada', 'ajustada', 'rechazada')),
  constraint ps_lf_monto check (monto_aprobado >= 0 and anio between 2000 and 2100),
  constraint ps_lf_textos check (char_length(fuente) <= 200 and char_length(nota) <= 1000),
  constraint ps_lf_unica unique (linea_id, anio)
);
create index if not exists ps_lf_plan_idx on public.ps_linea_financiacion (plan_id);

/** Libro de movimientos presupuestales. Solo INSERT: se anula con un movimiento que apunta al anterior (anula_id). */
create table if not exists public.ps_presupuesto_movs (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.ps_planes (id) on delete restrict,
  linea_id       uuid not null references public.ps_lineas (id) on delete restrict,
  anio           smallint not null,
  tipo           text not null,
  monto          numeric(18, 2) not null,
  fecha          date not null,
  fuente         text not null default '',
  referencia     text not null default '',
  nota           text not null default '',
  anula_id       uuid references public.ps_presupuesto_movs (id) on delete restrict,
  registrado_por uuid references public.profiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  constraint ps_pm_tipo check (tipo in ('aprobado', 'modificacion', 'comprometido', 'ejecutado', 'pagado')),
  constraint ps_pm_monto check (monto <> 0 and (tipo = 'modificacion' or monto > 0) and abs(monto) < 1e15),
  constraint ps_pm_anio check (anio between 2000 and 2100),
  constraint ps_pm_textos check (char_length(fuente) <= 200 and char_length(referencia) <= 100 and char_length(nota) <= 1000)
);
create unique index if not exists ps_pm_una_anulacion on public.ps_presupuesto_movs (anula_id) where anula_id is not null;
create index if not exists ps_pm_linea_idx on public.ps_presupuesto_movs (linea_id, anio);
create index if not exists ps_pm_plan_idx on public.ps_presupuesto_movs (plan_id, fecha);

comment on table public.ps_presupuesto_movs is
  'Planeación y Seguimiento (0290): ejecución presupuestal. Insert-only; una anulación es una fila con anula_id (mismo plan, línea, año, tipo y monto) que resta.';

create or replace function public.ps_presupuesto_movs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.ps_presupuesto_movs%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'El libro de presupuesto solo admite INSERT: un movimiento se anula con otro que lo referencia.' using errcode = '42501';
  end if;
  if new.anula_id is not null then
    select * into o from public.ps_presupuesto_movs where id = new.anula_id;
    if not found or o.anula_id is not null or o.plan_id <> new.plan_id or o.linea_id <> new.linea_id or o.anio <> new.anio or o.tipo <> new.tipo or o.monto <> new.monto then
      raise exception 'Una anulación debe repetir el plan, la línea, el año, el tipo y el monto de un movimiento que no sea una anulación.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ps_presupuesto_movs_inmutable on public.ps_presupuesto_movs;
create trigger ps_presupuesto_movs_inmutable before insert or update or delete on public.ps_presupuesto_movs
  for each row execute function public.ps_presupuesto_movs_guard();

/** Una evaluación resuelta no se edita ni se borra; la abierta solo cambia de estado (a en_revision o a una resolución). */
create or replace function public.ps_evaluaciones_vaf_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Una evaluación de la VAF no se borra.' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then
    if old.estado in ('aprobada', 'aprobada_con_ajustes', 'no_viable') then
      raise exception 'Una evaluación resuelta no se edita: una nueva versión abre otra.' using errcode = '42501';
    end if;
    if new.plan_id <> old.plan_id or new.version_id <> old.version_id or new.monto_solicitado <> old.monto_solicitado then
      raise exception 'El plan, la versión y el monto solicitado de una evaluación no cambian.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ps_evaluaciones_vaf_integridad on public.ps_evaluaciones_vaf;
create trigger ps_evaluaciones_vaf_integridad before update or delete on public.ps_evaluaciones_vaf
  for each row execute function public.ps_evaluaciones_vaf_guard();

-- -----------------------------------------------------------------------------
-- 2. Seguridad de lectura
-- -----------------------------------------------------------------------------

/** La oficina de una línea (versión vigente; si no hay, la última). */
create or replace function public.ps_linea_oficina(p_linea uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select vl.oficina_unit_id
    from public.ps_lineas l
    join public.ps_planes p on p.id = l.plan_id
    join public.ps_versiones v on v.plan_id = p.id and v.id = coalesce(p.version_vigente_id, (select v2.id from public.ps_versiones v2 where v2.plan_id = p.id order by v2.numero desc limit 1))
    join public.ps_version_lineas vl on vl.version_id = v.id and vl.linea_id = l.id
   where l.id = p_linea;
$$;

/** Presupuesto de una línea: admin, lector, aprobador y financiero, todo; gestor y colaborador, solo las líneas de sus oficinas. */
create or replace function public.ps_ve_linea_presupuesto(p_linea uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.ps_nivel_actual()
    when 'none' then false
    when 'admin' then true when 'lector' then true when 'aprobador' then true when 'financiero' then true
    else coalesce(public.ps_poder(public.ps_linea_oficina(p_linea)) is not null, false) end;
$$;

alter table public.ps_evaluaciones_vaf enable row level security;
alter table public.ps_linea_financiacion enable row level security;
alter table public.ps_presupuesto_movs enable row level security;

drop policy if exists ps_evaluaciones_vaf_lectura on public.ps_evaluaciones_vaf;
create policy ps_evaluaciones_vaf_lectura on public.ps_evaluaciones_vaf for select to authenticated using (public.ps_plan_visible(plan_id));
drop policy if exists ps_linea_financiacion_lectura on public.ps_linea_financiacion;
create policy ps_linea_financiacion_lectura on public.ps_linea_financiacion for select to authenticated using (public.ps_ve_linea_presupuesto(linea_id));
drop policy if exists ps_presupuesto_movs_lectura on public.ps_presupuesto_movs;
create policy ps_presupuesto_movs_lectura on public.ps_presupuesto_movs for select to authenticated using (public.ps_ve_linea_presupuesto(linea_id));

revoke all on public.ps_evaluaciones_vaf, public.ps_linea_financiacion, public.ps_presupuesto_movs from public, anon, authenticated;
grant select on public.ps_evaluaciones_vaf, public.ps_linea_financiacion, public.ps_presupuesto_movs to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Avisos a la VAF
-- -----------------------------------------------------------------------------

/** Miembros de la unidad VAF (o de las que cuelgan de ella) con nivel financiero o admin. Sin unidad configurada: todos los financieros. */
create or replace function public.ps_vaf_destinatarios()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_unit uuid;
begin
  select vaf_unit_id into v_unit from public.ps_config where id;
  if v_unit is null then
    return query select pr.id from public.profiles pr where pr.is_active and public.ps_nivel_de(pr.id) = 'financiero';
  else
    return query
      with recursive d as (select id from public.units where id = v_unit union all select u.id from public.units u join d on u.parent_id = d.id)
      select distinct m.profile_id from public.unit_members m join d on d.id = m.unit_id
       where public.ps_nivel_de(m.profile_id) in ('financiero', 'admin');
  end if;
end;
$$;

/** Un aviso sobre un plan (sin actividad). Devuelve true si lo encoló. */
create or replace function public.ps_aviso_plan(p_plantilla text, p_destino uuid, p_plan uuid, p_extra jsonb default '{}'::jsonb, p_dedupe text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_actor text;
  n integer;
begin
  if p_destino is null then return false; end if;
  select * into p from public.ps_planes where id = p_plan;
  if not found then return false; end if;
  select coalesce(nullif(btrim(full_name), ''), '') into v_actor from public.profiles where id = auth.uid();
  insert into public.ps_avisos (plantilla, destinatario_id, actividad_id, oficina_unit_id, objeto_tipo, dedupe, datos)
  values (p_plantilla, p_destino, null, p.oficina_unit_id, 'plan', p_dedupe, jsonb_build_object(
    'plan', p.nombre, 'plan_id', p.id,
    'oficina', coalesce((select u.name from public.units u where u.id = p.oficina_unit_id), ''),
    'actor', coalesce(v_actor, '')) || coalesce(p_extra, '{}'::jsonb))
  on conflict (dedupe) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.ps_vaf_config_leer()
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
  return (select jsonb_build_object('vaf_unit_id', c.vaf_unit_id,
            'unidad', (select jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code) from public.units u where u.id = c.vaf_unit_id),
            'destinatarios', (select count(*) from public.ps_vaf_destinatarios()))
            from public.ps_config c where c.id);
end;
$$;

create or replace function public.ps_vaf_config_guardar(p_unit uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ps_puede('gestionar') then
    raise exception 'Sin permiso: la unidad de la VAF la fija el administrador del módulo.' using errcode = '42501';
  end if;
  if p_unit is not null and not exists (select 1 from public.units where id = p_unit) then
    raise exception 'La unidad indicada no existe.' using errcode = 'P0002';
  end if;
  update public.ps_config set vaf_unit_id = p_unit, actualizado_por = auth.uid(), actualizado_en = now() where id;
  perform public.ps_evento('config.vaf', null, null, null, jsonb_build_object('vaf_unit_id', p_unit));
  return public.ps_vaf_config_leer();
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Evaluación del plan por la VAF
-- -----------------------------------------------------------------------------

/** Al publicar una versión: abre la evaluación pendiente (la primera siempre; las siguientes si cambian los montos) y avisa a la VAF. */
create or replace function public.ps_vaf_abrir_evaluacion(p_plan uuid, p_version uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev uuid;
  v_cambia boolean;
  v_monto numeric;
  v_id uuid;
  d uuid;
  p public.ps_planes%rowtype;
begin
  select * into p from public.ps_planes where id = p_plan;
  select coalesce(sum(monto), 0) into v_monto from public.ps_version_lineas where version_id = p_version;
  select id into v_prev from public.ps_versiones
   where plan_id = p_plan and estado = 'publicada' and id <> p_version and numero < (select numero from public.ps_versiones where id = p_version)
   order by numero desc limit 1;
  if v_prev is null then
    v_cambia := true;
  else
    v_cambia := exists (
      (select clave, monto from public.ps_version_lineas where version_id = p_version except select clave, monto from public.ps_version_lineas where version_id = v_prev)
      union all
      (select clave, monto from public.ps_version_lineas where version_id = v_prev except select clave, monto from public.ps_version_lineas where version_id = p_version));
  end if;
  if not v_cambia then return null; end if;
  insert into public.ps_evaluaciones_vaf (plan_id, version_id, monto_solicitado) values (p_plan, p_version, v_monto)
  on conflict (version_id) do nothing
  returning id into v_id;
  if v_id is null then return null; end if;
  perform public.ps_evento('vaf.evaluacion_abierta', p_plan, p_version, null, jsonb_build_object('evaluacion', v_id, 'monto_solicitado', v_monto));
  for d in select x from public.ps_vaf_destinatarios() as x loop
    perform public.ps_aviso_plan('c-ps-vaf-evaluar', d, p_plan,
      jsonb_build_object('monto', v_monto, 'version', (select etiqueta from public.ps_versiones where id = p_version)),
      format('vaf-ev:%s:%s', v_id, d));
  end loop;
  return v_id;
end;
$$;

create or replace function public.ps_vaf_evaluacion_json(e public.ps_evaluaciones_vaf)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', e.id, 'plan_id', e.plan_id, 'version_id', e.version_id,
    'plan', (select p.nombre from public.ps_planes p where p.id = e.plan_id),
    'oficina', (select jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code) from public.ps_planes p join public.units u on u.id = p.oficina_unit_id where p.id = e.plan_id),
    'version', (select v.etiqueta from public.ps_versiones v where v.id = e.version_id),
    'estado', e.estado, 'monto_solicitado', e.monto_solicitado, 'monto_aprobado', e.monto_aprobado, 'fuente_financiacion', e.fuente_financiacion,
    'observaciones', e.observaciones, 'evaluado_por', public.ps_persona_json(e.evaluado_por), 'evaluado_en', e.evaluado_en, 'creado_en', e.creado_en);
$$;

/** Cola de evaluación (pendientes y en revisión), la más antigua primero. Financiero y admin (lectura para lector y aprobador). */
create or replace function public.ps_vaf_pendientes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.ps_nivel_actual() not in ('financiero', 'admin', 'aprobador', 'lector') then
    raise exception 'Sin permiso: la cola de evaluación financiera es de la VAF y del administrador.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(public.ps_vaf_evaluacion_json(e) order by e.creado_en, e.id)
                     from public.ps_evaluaciones_vaf e where e.estado in ('pendiente', 'en_revision')), '[]'::jsonb);
end;
$$;

create or replace function public.ps_vaf_en_revision(p_evaluacion uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.ps_evaluaciones_vaf%rowtype;
begin
  if not public.ps_puede('financiero') then
    raise exception 'Sin permiso: la evaluación financiera es de la VAF y del administrador.' using errcode = '42501';
  end if;
  select * into e from public.ps_evaluaciones_vaf where id = p_evaluacion for update;
  if not found then raise exception 'La evaluación no existe.' using errcode = 'P0002'; end if;
  if e.estado <> 'pendiente' then raise exception 'La evaluación no está pendiente (%).', e.estado using errcode = '22023'; end if;
  update public.ps_evaluaciones_vaf set estado = 'en_revision' where id = p_evaluacion;
  perform public.ps_evento('vaf.en_revision', e.plan_id, e.version_id, null, jsonb_build_object('evaluacion', p_evaluacion));
  return public.ps_vaf_evaluacion_json((select x from public.ps_evaluaciones_vaf x where x.id = p_evaluacion));
end;
$$;

/** Resuelve la evaluación abierta de (plan, versión). observaciones ≥ 20 caracteres si es aprobada_con_ajustes o no_viable. */
create or replace function public.ps_vaf_evaluar(p_plan uuid, p_version uuid, p_estado text, p_monto_aprobado numeric default null, p_fuente text default '', p_observaciones text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.ps_evaluaciones_vaf%rowtype;
  v_obs text := btrim(coalesce(p_observaciones, ''));
  v_fuente text := btrim(coalesce(p_fuente, ''));
  d uuid;
  pl public.ps_planes%rowtype;
begin
  if not public.ps_puede('financiero') then
    raise exception 'Sin permiso: la evaluación financiera es de la VAF y del administrador.' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('aprobada', 'aprobada_con_ajustes', 'no_viable') then
    raise exception 'El resultado debe ser aprobada, aprobada_con_ajustes o no_viable.' using errcode = '22023';
  end if;
  if p_monto_aprobado is not null and (p_monto_aprobado < 0 or p_monto_aprobado >= 1e15) then raise exception 'El monto aprobado no es válido.' using errcode = '22023'; end if;
  if p_estado <> 'no_viable' and p_monto_aprobado is null then raise exception 'Indique el monto aprobado.' using errcode = '22023'; end if;
  if char_length(v_fuente) > 200 or char_length(v_obs) > 2000 then raise exception 'La fuente (200) o las observaciones (2000) superan el tope.' using errcode = '22023'; end if;
  if p_estado in ('aprobada_con_ajustes', 'no_viable') and char_length(v_obs) < 20 then
    raise exception 'Las observaciones deben tener al menos 20 caracteres cuando se aprueba con ajustes o no es viable.' using errcode = '22023';
  end if;
  select * into e from public.ps_evaluaciones_vaf where plan_id = p_plan and version_id = p_version for update;
  if not found then raise exception 'Ese plan y versión no tienen una evaluación abierta.' using errcode = 'P0002'; end if;
  if e.estado in ('aprobada', 'aprobada_con_ajustes', 'no_viable') then
    raise exception 'La evaluación ya está resuelta (%): una nueva versión abre otra.', e.estado using errcode = '22023';
  end if;
  update public.ps_evaluaciones_vaf
     set estado = p_estado, monto_aprobado = p_monto_aprobado, fuente_financiacion = v_fuente, observaciones = v_obs, evaluado_por = auth.uid(), evaluado_en = now()
   where id = e.id;
  perform public.ps_evento('vaf.evaluada', p_plan, p_version, null,
    jsonb_build_object('evaluacion', e.id, 'estado', p_estado, 'monto_solicitado', e.monto_solicitado, 'monto_aprobado', p_monto_aprobado));
  select * into pl from public.ps_planes where id = p_plan;
  for d in select x from (select g as x from public.ps_gestores_de(pl.oficina_unit_id) g union select pl.creado_por) q where x is not null and x is distinct from auth.uid() loop
    perform public.ps_aviso_plan('c-ps-vaf-resultado', d, p_plan,
      jsonb_build_object('resultado', p_estado, 'monto_aprobado', p_monto_aprobado, 'monto_solicitado', e.monto_solicitado, 'nota', v_obs),
      format('vaf-re:%s:%s', e.id, d));
  end loop;
  return public.ps_vaf_evaluacion_json((select x from public.ps_evaluaciones_vaf x where x.id = e.id));
end;
$$;

/** Evaluaciones de un plan (la más reciente primero). Quien ve el plan. */
create or replace function public.ps_vaf_evaluaciones(p_plan uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  return coalesce((select jsonb_agg(public.ps_vaf_evaluacion_json(e) order by e.creado_en desc, e.id) from public.ps_evaluaciones_vaf e where e.plan_id = p_plan), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Financiación por línea
-- -----------------------------------------------------------------------------

/** Evalúa la financiación de una línea (ps_lineas.id) en un año. Financiero y admin. */
create or replace function public.ps_vaf_linea_evaluar(p_linea uuid, p_anio integer, p_monto numeric, p_fuente text, p_estado text, p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.ps_lineas%rowtype;
  p public.ps_planes%rowtype;
  v_fuente text := btrim(coalesce(p_fuente, ''));
  v_nota text := btrim(coalesce(p_nota, ''));
  v_id uuid;
begin
  if not public.ps_puede('financiero') then
    raise exception 'Sin permiso: la financiación de las líneas es de la VAF y del administrador.' using errcode = '42501';
  end if;
  select * into l from public.ps_lineas where id = p_linea;
  if not found then raise exception 'La línea no existe.' using errcode = 'P0002'; end if;
  select * into p from public.ps_planes where id = l.plan_id;
  if p_anio is null or p_anio < p.anio_ini or p_anio > p.anio_fin then raise exception 'El año debe estar dentro de la vigencia del plan (% a %).', p.anio_ini, p.anio_fin using errcode = '22023'; end if;
  if p_monto is null or p_monto < 0 or p_monto >= 1e15 then raise exception 'El monto aprobado debe ser un número no negativo.' using errcode = '22023'; end if;
  if p_estado is null or p_estado not in ('sin_evaluar', 'aprobada', 'ajustada', 'rechazada') then raise exception 'El estado debe ser sin_evaluar, aprobada, ajustada o rechazada.' using errcode = '22023'; end if;
  if char_length(v_fuente) > 200 or char_length(v_nota) > 1000 then raise exception 'La fuente (200) o la nota (1000) superan el tope.' using errcode = '22023'; end if;
  if p_estado in ('ajustada', 'rechazada') and char_length(v_nota) < 10 then raise exception 'Explique el ajuste o el rechazo en la nota (al menos 10 caracteres).' using errcode = '22023'; end if;
  insert into public.ps_linea_financiacion (plan_id, linea_id, anio, monto_aprobado, fuente, estado, nota, evaluado_por, evaluado_en)
  values (l.plan_id, p_linea, p_anio, p_monto, v_fuente, p_estado, v_nota, auth.uid(), now())
  on conflict (linea_id, anio) do update
     set monto_aprobado = excluded.monto_aprobado, fuente = excluded.fuente, estado = excluded.estado, nota = excluded.nota,
         evaluado_por = excluded.evaluado_por, evaluado_en = excluded.evaluado_en
  returning id into v_id;
  perform public.ps_evento('vaf.linea_evaluada', l.plan_id, null, l.clave, jsonb_build_object('anio', p_anio, 'monto', p_monto, 'estado', p_estado));
  return (select jsonb_build_object('id', f.id, 'plan_id', f.plan_id, 'linea_id', f.linea_id, 'linea_clave', l.clave, 'anio', f.anio, 'monto_aprobado', f.monto_aprobado,
                                    'fuente', f.fuente, 'estado', f.estado, 'nota', f.nota, 'evaluado_en', f.evaluado_en)
            from public.ps_linea_financiacion f where f.id = v_id);
end;
$$;

/** Carga por Excel de la financiación: filas {linea (clave), anio, monto_aprobado, fuente, estado, nota}. Todo o nada, hasta 2000 filas. */
create or replace function public.ps_vaf_lineas_cargar(p_plan uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_n integer;
  i integer;
  o jsonb;
  v_err jsonb := '[]'::jsonb;
  v_ok jsonb := '[]'::jsonb;
  v_clave text;
  v_linea uuid;
  v_anio integer;
  v_monto numeric;
  v_estado text;
  v_fuente text;
  v_nota text;
  x jsonb;
begin
  if not public.ps_puede('financiero') then
    raise exception 'Sin permiso: la financiación de las líneas es de la VAF y del administrador.' using errcode = '42501';
  end if;
  select * into p from public.ps_planes where id = p_plan;
  if not found then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('cargadas', 0, 'recibidas', 0, 'errores', jsonb_build_array(public.ps_err(null, 'filas', 'Se esperaba una lista con al menos una fila.')));
  end if;
  v_n := jsonb_array_length(p_filas);
  if v_n > 2000 then return jsonb_build_object('cargadas', 0, 'recibidas', v_n, 'errores', jsonb_build_array(public.ps_err(null, 'filas', 'La carga admite hasta 2000 filas.'))); end if;
  for i in 1 .. v_n loop
    o := p_filas -> (i - 1);
    v_linea := null; v_anio := null; v_monto := null;
    if jsonb_typeof(o) <> 'object' then v_err := v_err || public.ps_err(i, 'fila', 'La fila debe ser un objeto.'); continue; end if;
    v_clave := nullif(btrim(coalesce(public.ps_j(o, array['linea', 'clave', 'no']) #>> '{}', '')), '');
    select id into v_linea from public.ps_lineas where plan_id = p_plan and clave = v_clave;
    if v_linea is null then v_err := v_err || public.ps_err(i, 'linea', format('La línea «%s» no existe en el plan.', coalesce(left(v_clave, 40), ''))); end if;
    begin
      v_anio := (public.ps_j(o, array['anio']) #>> '{}')::integer;
      v_monto := (public.ps_j(o, array['monto_aprobado', 'monto']) #>> '{}')::numeric;
    exception when others then
      v_err := v_err || public.ps_err(i, 'monto', 'El año y el monto deben ser números.');
      continue;
    end;
    if v_anio is null or v_anio < p.anio_ini or v_anio > p.anio_fin then v_err := v_err || public.ps_err(i, 'anio', format('El año debe estar entre %s y %s.', p.anio_ini, p.anio_fin)); end if;
    if v_monto is null or v_monto < 0 or v_monto >= 1e15 then v_err := v_err || public.ps_err(i, 'monto', 'El monto aprobado debe ser un número no negativo.'); end if;
    v_estado := lower(coalesce(public.ps_j(o, array['estado']) #>> '{}', 'aprobada'));
    if v_estado not in ('sin_evaluar', 'aprobada', 'ajustada', 'rechazada') then v_err := v_err || public.ps_err(i, 'estado', 'El estado debe ser sin_evaluar, aprobada, ajustada o rechazada.'); end if;
    v_fuente := btrim(coalesce(public.ps_j(o, array['fuente']) #>> '{}', ''));
    v_nota := btrim(coalesce(public.ps_j(o, array['nota']) #>> '{}', ''));
    if char_length(v_fuente) > 200 or char_length(v_nota) > 1000 then v_err := v_err || public.ps_err(i, 'fuente', 'La fuente (200) o la nota (1000) superan el tope.'); end if;
    if v_estado in ('ajustada', 'rechazada') and char_length(v_nota) < 10 then v_err := v_err || public.ps_err(i, 'nota', 'Explique el ajuste o el rechazo en la nota.'); end if;
    if v_linea is not null and v_anio is not null and v_ok @> jsonb_build_array(jsonb_build_object('l', v_linea, 'a', v_anio)) then
      v_err := v_err || public.ps_err(i, 'anio', 'La línea y el año están repetidos en la hoja.');
    end if;
    v_ok := v_ok || jsonb_build_array(jsonb_build_object('l', v_linea, 'a', v_anio, 'm', v_monto, 'e', v_estado, 'f', v_fuente, 'n', v_nota));
  end loop;
  if jsonb_array_length(v_err) > 0 then
    return jsonb_build_object('cargadas', 0, 'recibidas', v_n, 'errores', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (select z from jsonb_array_elements(v_err) z limit 500) q));
  end if;
  for x in select * from jsonb_array_elements(v_ok) loop
    insert into public.ps_linea_financiacion (plan_id, linea_id, anio, monto_aprobado, fuente, estado, nota, evaluado_por, evaluado_en)
    values (p_plan, (x ->> 'l')::uuid, (x ->> 'a')::integer, (x ->> 'm')::numeric, x ->> 'f', x ->> 'e', x ->> 'n', auth.uid(), now())
    on conflict (linea_id, anio) do update
       set monto_aprobado = excluded.monto_aprobado, fuente = excluded.fuente, estado = excluded.estado, nota = excluded.nota,
           evaluado_por = excluded.evaluado_por, evaluado_en = excluded.evaluado_en;
  end loop;
  perform public.ps_evento('vaf.lineas_cargadas', p_plan, null, null, jsonb_build_object('filas', v_n));
  return jsonb_build_object('cargadas', v_n, 'recibidas', v_n, 'errores', '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Ejecución presupuestal (libro insert-only)
-- -----------------------------------------------------------------------------

/** Valida una fila de movimiento. Devuelve {errores, mov:{linea_id, anio, tipo, monto, fecha, fuente, referencia, nota}}. */
create or replace function public.ps_presupuesto_normalizar(p_fila integer, p_plan uuid, p_linea uuid, p_obj jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e jsonb := '[]'::jsonb;
  p public.ps_planes%rowtype;
  v_linea uuid := p_linea;
  v_clave text;
  v_anio integer;
  v_tipo text;
  v_monto numeric;
  v_fecha date;
  v_fuente text;
  v_ref text;
  v_nota text;
  v jsonb;
begin
  select * into p from public.ps_planes where id = p_plan;
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then
    return jsonb_build_object('errores', jsonb_build_array(public.ps_err(p_fila, 'fila', 'El movimiento debe ser un objeto.')), 'mov', null);
  end if;
  if v_linea is null then
    v_clave := nullif(btrim(coalesce(public.ps_j(p_obj, array['linea', 'clave', 'no']) #>> '{}', '')), '');
    select id into v_linea from public.ps_lineas where plan_id = p_plan and clave = v_clave;
    if v_linea is null then e := e || public.ps_err(p_fila, 'linea', format('La línea «%s» no existe en el plan.', coalesce(left(v_clave, 40), ''))); end if;
  end if;
  begin
    v_anio := (public.ps_j(p_obj, array['anio']) #>> '{}')::integer;
  exception when others then v_anio := null; end;
  if v_anio is null or v_anio < p.anio_ini or v_anio > p.anio_fin then e := e || public.ps_err(p_fila, 'anio', format('El año debe estar entre %s y %s.', p.anio_ini, p.anio_fin)); end if;
  v_tipo := lower(coalesce(public.ps_j(p_obj, array['tipo']) #>> '{}', ''));
  if v_tipo not in ('aprobado', 'modificacion', 'comprometido', 'ejecutado', 'pagado') then
    e := e || public.ps_err(p_fila, 'tipo', 'El tipo debe ser aprobado, modificacion, comprometido, ejecutado o pagado.');
  end if;
  begin
    v_monto := (public.ps_j(p_obj, array['monto']) #>> '{}')::numeric;
  exception when others then v_monto := null; end;
  if v_monto is null or v_monto = 0 or abs(v_monto) >= 1e15 or (v_monto < 0 and v_tipo <> 'modificacion') then
    e := e || public.ps_err(p_fila, 'monto', 'El monto debe ser un número distinto de cero (solo una modificación puede ser negativa).');
  end if;
  v := public.ps_j(p_obj, array['fecha']);
  if v is null then v_fecha := public.ps_hoy();
  else
    begin
      v_fecha := (v #>> '{}')::date;
    exception when others then v_fecha := null; e := e || public.ps_err(p_fila, 'fecha', 'La fecha debe venir como AAAA-MM-DD.'); end;
  end if;
  if v_fecha is not null and v_fecha > public.ps_hoy() then e := e || public.ps_err(p_fila, 'fecha', 'La fecha no puede ser futura.'); end if;
  v_fuente := btrim(coalesce(public.ps_j(p_obj, array['fuente']) #>> '{}', ''));
  v_ref := btrim(coalesce(public.ps_j(p_obj, array['referencia']) #>> '{}', ''));
  v_nota := btrim(coalesce(public.ps_j(p_obj, array['nota']) #>> '{}', ''));
  if char_length(v_fuente) > 200 then e := e || public.ps_err(p_fila, 'fuente', 'La fuente supera los 200 caracteres.'); end if;
  if char_length(v_ref) > 100 then e := e || public.ps_err(p_fila, 'referencia', 'La referencia supera los 100 caracteres.'); end if;
  if char_length(v_nota) > 1000 then e := e || public.ps_err(p_fila, 'nota', 'La nota supera los 1000 caracteres.'); end if;
  if jsonb_array_length(e) > 0 then return jsonb_build_object('errores', e, 'mov', null); end if;
  return jsonb_build_object('errores', e, 'mov', jsonb_build_object('linea_id', v_linea, 'anio', v_anio, 'tipo', v_tipo, 'monto', v_monto,
    'fecha', v_fecha, 'fuente', v_fuente, 'referencia', v_ref, 'nota', v_nota));
end;
$$;

create or replace function public.ps_presupuesto_mov_json(m public.ps_presupuesto_movs)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', m.id, 'plan_id', m.plan_id, 'linea_id', m.linea_id, 'linea_clave', (select l.clave from public.ps_lineas l where l.id = m.linea_id),
    'anio', m.anio, 'tipo', m.tipo, 'monto', m.monto, 'fecha', m.fecha, 'fuente', m.fuente, 'referencia', m.referencia, 'nota', m.nota,
    'anula_id', m.anula_id, 'anulado', exists (select 1 from public.ps_presupuesto_movs a where a.anula_id = m.id),
    'registrado_por', public.ps_persona_json(m.registrado_por), 'creado_en', m.creado_en);
$$;

/** Registra un movimiento en una línea (ps_lineas.id). p_datos: anio, tipo, monto, fecha (hoy por omisión), fuente, referencia, nota. Financiero y admin. */
create or replace function public.ps_presupuesto_registrar(p_linea uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.ps_lineas%rowtype;
  v_n jsonb;
  m jsonb;
  v_id uuid;
begin
  if not public.ps_puede('financiero') then
    raise exception 'Sin permiso: registrar presupuesto es de la VAF y del administrador.' using errcode = '42501';
  end if;
  select * into l from public.ps_lineas where id = p_linea;
  if not found then raise exception 'La línea no existe.' using errcode = 'P0002'; end if;
  v_n := public.ps_presupuesto_normalizar(null, l.plan_id, p_linea, p_datos);
  if jsonb_array_length(v_n -> 'errores') > 0 then raise exception '%', (v_n -> 'errores' -> 0 ->> 'mensaje') using errcode = '22023'; end if;
  m := v_n -> 'mov';
  insert into public.ps_presupuesto_movs (plan_id, linea_id, anio, tipo, monto, fecha, fuente, referencia, nota, registrado_por)
  values (l.plan_id, p_linea, (m ->> 'anio')::smallint, m ->> 'tipo', (m ->> 'monto')::numeric, (m ->> 'fecha')::date, m ->> 'fuente', m ->> 'referencia', m ->> 'nota', auth.uid())
  returning id into v_id;
  perform public.ps_evento('presupuesto.registrado', l.plan_id, null, l.clave, jsonb_build_object('mov', v_id, 'tipo', m ->> 'tipo', 'anio', m ->> 'anio', 'monto', m ->> 'monto'));
  return public.ps_presupuesto_mov_json((select x from public.ps_presupuesto_movs x where x.id = v_id));
end;
$$;

/** Anula un movimiento con otro que lo referencia (el libro no se edita ni se borra). Motivo de 10 a 1000 caracteres. */
create or replace function public.ps_presupuesto_anular(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.ps_presupuesto_movs%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_id uuid;
begin
  if not public.ps_puede('financiero') then
    raise exception 'Sin permiso: anular presupuesto es de la VAF y del administrador.' using errcode = '42501';
  end if;
  select * into o from public.ps_presupuesto_movs where id = p_id;
  if not found then raise exception 'El movimiento no existe.' using errcode = 'P0002'; end if;
  if o.anula_id is not null then raise exception 'Una anulación no se anula.' using errcode = '22023'; end if;
  if exists (select 1 from public.ps_presupuesto_movs where anula_id = p_id) then raise exception 'El movimiento ya fue anulado.' using errcode = '22023'; end if;
  if char_length(v_motivo) < 10 or char_length(v_motivo) > 1000 then raise exception 'El motivo debe tener entre 10 y 1000 caracteres.' using errcode = '22023'; end if;
  insert into public.ps_presupuesto_movs (plan_id, linea_id, anio, tipo, monto, fecha, fuente, referencia, nota, anula_id, registrado_por)
  values (o.plan_id, o.linea_id, o.anio, o.tipo, o.monto, public.ps_hoy(), o.fuente, o.referencia, v_motivo, p_id, auth.uid())
  returning id into v_id;
  perform public.ps_evento('presupuesto.anulado', o.plan_id, null, (select l.clave from public.ps_lineas l where l.id = o.linea_id),
    jsonb_build_object('mov', p_id, 'anulacion', v_id, 'motivo', v_motivo));
  return public.ps_presupuesto_mov_json((select x from public.ps_presupuesto_movs x where x.id = v_id));
end;
$$;

/** Carga de ejecución por Excel: filas {linea (clave), anio, tipo, monto, fecha, fuente, referencia, nota}. Todo o nada, hasta 2000 filas. */
create or replace function public.ps_presupuesto_cargar(p_plan uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  i integer;
  v_err jsonb := '[]'::jsonb;
  v_movs jsonb := '[]'::jsonb;
  r jsonb;
  m jsonb;
  l public.ps_lineas%rowtype;
begin
  if not public.ps_puede('financiero') then
    raise exception 'Sin permiso: registrar presupuesto es de la VAF y del administrador.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ps_planes where id = p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('cargadas', 0, 'recibidas', 0, 'errores', jsonb_build_array(public.ps_err(null, 'filas', 'Se esperaba una lista con al menos una fila.')));
  end if;
  v_n := jsonb_array_length(p_filas);
  if v_n > 2000 then return jsonb_build_object('cargadas', 0, 'recibidas', v_n, 'errores', jsonb_build_array(public.ps_err(null, 'filas', 'La carga admite hasta 2000 filas.'))); end if;
  for i in 1 .. v_n loop
    r := public.ps_presupuesto_normalizar(i, p_plan, null, p_filas -> (i - 1));
    v_err := v_err || (r -> 'errores');
    if r -> 'mov' is not null and jsonb_typeof(r -> 'mov') = 'object' then v_movs := v_movs || jsonb_build_array(r -> 'mov'); end if;
  end loop;
  if jsonb_array_length(v_err) > 0 then
    return jsonb_build_object('cargadas', 0, 'recibidas', v_n, 'errores', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (select z from jsonb_array_elements(v_err) z limit 500) q));
  end if;
  for m in select * from jsonb_array_elements(v_movs) loop
    insert into public.ps_presupuesto_movs (plan_id, linea_id, anio, tipo, monto, fecha, fuente, referencia, nota, registrado_por)
    values (p_plan, (m ->> 'linea_id')::uuid, (m ->> 'anio')::smallint, m ->> 'tipo', (m ->> 'monto')::numeric, (m ->> 'fecha')::date, m ->> 'fuente', m ->> 'referencia', m ->> 'nota', auth.uid());
  end loop;
  perform public.ps_evento('presupuesto.cargado', p_plan, null, null, jsonb_build_object('filas', v_n));
  return jsonb_build_object('cargadas', v_n, 'recibidas', v_n, 'errores', '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Cálculos: cifras por línea, por plan y desviación
-- -----------------------------------------------------------------------------

/**
 * Cifras de una línea (sin comprobar permisos; las usan las funciones públicas y el generador de alertas).
 * aprobado = movimientos «aprobado» del año o, si no hay, lo aprobado por la VAF en ps_linea_financiacion (estados aprobada y ajustada);
 * vigente = aprobado + modificaciones; disponible = vigente − max(comprometido, ejecutado); pct_ejecucion = ejecutado / vigente;
 * avance_fisico = promedio del avance validado de las actividades de la línea; desviacion = pct_ejecucion − avance_fisico.
 */
create or replace function public.ps_presupuesto_cifras(p_linea uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan uuid;
  r record;
  v_anios jsonb := '[]'::jsonb;
  v_apr numeric := 0; v_mod numeric := 0; v_com numeric := 0; v_eje numeric := 0; v_pag numeric := 0;
  a_apr numeric; a_mod numeric; a_com numeric; a_eje numeric; a_pag numeric; a_fin numeric;
  v_vig numeric;
  v_fis numeric;
  v_pct numeric;
  v_ult date;
begin
  select plan_id into v_plan from public.ps_lineas where id = p_linea;
  for r in select distinct anio from (select anio from public.ps_presupuesto_movs where linea_id = p_linea
                                      union select anio from public.ps_linea_financiacion where linea_id = p_linea and estado in ('aprobada', 'ajustada')) q order by 1 loop
    select coalesce(sum(case when tipo = 'aprobado' then case when anula_id is null then monto else -monto end end), 0),
           coalesce(sum(case when tipo = 'modificacion' then case when anula_id is null then monto else -monto end end), 0),
           coalesce(sum(case when tipo = 'comprometido' then case when anula_id is null then monto else -monto end end), 0),
           coalesce(sum(case when tipo = 'ejecutado' then case when anula_id is null then monto else -monto end end), 0),
           coalesce(sum(case when tipo = 'pagado' then case when anula_id is null then monto else -monto end end), 0)
      into a_apr, a_mod, a_com, a_eje, a_pag from public.ps_presupuesto_movs where linea_id = p_linea and anio = r.anio;
    if a_apr = 0 then
      select coalesce(sum(monto_aprobado), 0) into a_fin from public.ps_linea_financiacion where linea_id = p_linea and anio = r.anio and estado in ('aprobada', 'ajustada');
      a_apr := a_fin;
    end if;
    v_apr := v_apr + a_apr; v_mod := v_mod + a_mod; v_com := v_com + a_com; v_eje := v_eje + a_eje; v_pag := v_pag + a_pag;
    v_anios := v_anios || jsonb_build_array(jsonb_build_object('anio', r.anio, 'aprobado', a_apr, 'modificado', a_mod, 'vigente', a_apr + a_mod,
      'comprometido', a_com, 'ejecutado', a_eje, 'pagado', a_pag));
  end loop;
  v_vig := v_apr + v_mod;
  select round(avg(coalesce((select v.av_fisico from public.ps_avances v where v.actividad_id = a.id and v.estado = 'validado' order by v.revisado_en desc, v.id desc limit 1), 0)), 1)
    into v_fis from public.ps_actividades a where a.linea_id = p_linea;
  v_pct := case when v_vig > 0 then round(v_eje / v_vig * 100, 1) end;
  select max(fecha) into v_ult from public.ps_presupuesto_movs where linea_id = p_linea and anula_id is null;
  return jsonb_build_object('aprobado', v_apr, 'modificado', v_mod, 'vigente', v_vig, 'comprometido', v_com, 'ejecutado', v_eje, 'pagado', v_pag,
    'disponible', v_vig - greatest(v_com, v_eje), 'pct_ejecucion', v_pct, 'avance_fisico', v_fis,
    'desviacion', case when v_pct is not null and v_fis is not null then round(v_pct - v_fis, 1) end,
    'ultimo_movimiento', v_ult, 'por_anio', v_anios);
end;
$$;

/** Presupuesto de una línea: cifras y movimientos (los 300 más recientes). Quien ve la línea. */
create or replace function public.ps_presupuesto_linea(p_linea uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l public.ps_lineas%rowtype;
begin
  select * into l from public.ps_lineas where id = p_linea;
  if not found or not public.ps_plan_visible(l.plan_id) or not public.ps_ve_linea_presupuesto(p_linea) then
    raise exception 'La línea no existe.' using errcode = 'P0002';
  end if;
  return public.ps_presupuesto_cifras(p_linea) || jsonb_build_object('linea_id', p_linea, 'plan_id', l.plan_id, 'clave', l.clave,
    'financiacion', coalesce((select jsonb_agg(jsonb_build_object('anio', f.anio, 'monto_aprobado', f.monto_aprobado, 'fuente', f.fuente, 'estado', f.estado, 'nota', f.nota, 'evaluado_en', f.evaluado_en) order by f.anio)
                                from public.ps_linea_financiacion f where f.linea_id = p_linea), '[]'::jsonb),
    'movimientos', coalesce((select jsonb_agg(public.ps_presupuesto_mov_json(m) order by m.creado_en desc, m.id)
                               from (select * from public.ps_presupuesto_movs where linea_id = p_linea order by creado_en desc, id limit 300) m), '[]'::jsonb));
end;
$$;

/** Suma de cifras de una lista de líneas. */
create or replace function public.ps_presupuesto_sumar(p_cifras jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('aprobado', coalesce(sum((c ->> 'aprobado')::numeric), 0), 'modificado', coalesce(sum((c ->> 'modificado')::numeric), 0),
    'vigente', coalesce(sum((c ->> 'vigente')::numeric), 0), 'comprometido', coalesce(sum((c ->> 'comprometido')::numeric), 0),
    'ejecutado', coalesce(sum((c ->> 'ejecutado')::numeric), 0), 'pagado', coalesce(sum((c ->> 'pagado')::numeric), 0),
    'disponible', coalesce(sum((c ->> 'disponible')::numeric), 0),
    'pct_ejecucion', case when coalesce(sum((c ->> 'vigente')::numeric), 0) > 0 then round(sum((c ->> 'ejecutado')::numeric) / sum((c ->> 'vigente')::numeric) * 100, 1) end)
  from jsonb_array_elements(p_cifras) c;
$$;

/** Presupuesto de un plan: totales, por línea, por pilar, por oficina y por año (solo las líneas que quien pregunta ve). */
create or replace function public.ps_presupuesto_plan(p_plan uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_ver uuid;
  r record;
  c jsonb;
  v_lineas jsonb := '[]'::jsonb;
begin
  select * into p from public.ps_planes where id = p_plan;
  if not found or not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  v_ver := coalesce(p.version_vigente_id, (select id from public.ps_versiones where plan_id = p_plan order by numero desc limit 1));
  for r in select vl.linea_id, vl.clave, vl.nombre, vl.pilar, vl.oficina_unit_id, vl.monto from public.ps_version_lineas vl where vl.version_id = v_ver order by vl.orden loop
    continue when not public.ps_ve_linea_presupuesto(r.linea_id);
    c := public.ps_presupuesto_cifras(r.linea_id);
    v_lineas := v_lineas || jsonb_build_array((c - 'por_anio') || jsonb_build_object('linea_id', r.linea_id, 'clave', r.clave, 'nombre', r.nombre, 'pilar', r.pilar,
      'oficina_unit_id', r.oficina_unit_id, 'solicitado', coalesce(r.monto, 0), '_anios', c -> 'por_anio'));
  end loop;
  return jsonb_build_object(
    'plan_id', p_plan,
    'totales', public.ps_presupuesto_sumar(v_lineas) || jsonb_build_object('solicitado', coalesce((select sum((x ->> 'solicitado')::numeric) from jsonb_array_elements(v_lineas) x), 0)),
    'por_linea', coalesce((select jsonb_agg(x - '_anios') from jsonb_array_elements(v_lineas) x), '[]'::jsonb),
    'por_pilar', coalesce((select jsonb_agg(public.ps_presupuesto_sumar(g.cs) || jsonb_build_object('pilar', g.k) order by g.k)
                             from (select x ->> 'pilar' k, jsonb_agg(x) cs from jsonb_array_elements(v_lineas) x group by 1) g), '[]'::jsonb),
    'por_oficina', coalesce((select jsonb_agg(public.ps_presupuesto_sumar(g.cs) || jsonb_build_object('unit_id', g.k, 'nombre', (select u.name from public.units u where u.id = g.k)) order by g.k)
                               from (select (x ->> 'oficina_unit_id')::uuid k, jsonb_agg(x) cs from jsonb_array_elements(v_lineas) x group by 1) g), '[]'::jsonb),
    'por_anio', coalesce((select jsonb_agg(jsonb_build_object('anio', a.anio, 'aprobado', a.ap, 'modificado', a.mo, 'vigente', a.ap + a.mo, 'comprometido', a.co, 'ejecutado', a.ej, 'pagado', a.pa) order by a.anio)
                            from (select (y ->> 'anio')::int anio, sum((y ->> 'aprobado')::numeric) ap, sum((y ->> 'modificado')::numeric) mo, sum((y ->> 'comprometido')::numeric) co,
                                         sum((y ->> 'ejecutado')::numeric) ej, sum((y ->> 'pagado')::numeric) pa
                                    from jsonb_array_elements(v_lineas) x, jsonb_array_elements(x -> '_anios') y group by 1) a), '[]'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Vigilancia
-- -----------------------------------------------------------------------------

/**
 * Alertas de un plan. p_todas = true (generador de alertas, sin sesión) no filtra por lo que ve la persona.
 * Tipos: sobreejecucion (alta) · ejecucion_sobre_avance (media) · avance_sobre_ejecucion (baja) · sin_movimientos (media) · sin_evaluar_vaf (baja).
 * Umbrales en ps_planes.config.vigilancia (por omisión 15 puntos, 100 % del vigente y 3 meses).
 */
create or replace function public.ps_vigilancia_calcular(p_plan uuid, p_hoy date, p_todas boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_cfg jsonb;
  v_umb_d numeric; v_umb_s numeric; v_meses integer;
  r record;
  c jsonb;
  v_out jsonb := '[]'::jsonb;
  v_vig numeric; v_eje numeric; v_des numeric;
  v_ver uuid;
  v_base jsonb;
begin
  select * into p from public.ps_planes where id = p_plan;
  if not found or p.estado <> 'activo' then return '[]'::jsonb; end if;
  v_cfg := public.ps_plan_config_efectiva(p_plan) -> 'vigilancia';
  v_umb_d := (v_cfg ->> 'umbral_desviacion')::numeric;
  v_umb_s := (v_cfg ->> 'umbral_sobreejecucion')::numeric;
  v_meses := (v_cfg ->> 'meses_sin_ejecucion')::integer;
  v_ver := p.version_vigente_id;
  if v_ver is null then return '[]'::jsonb; end if;
  for r in select vl.linea_id, vl.clave, vl.nombre, vl.oficina_unit_id from public.ps_version_lineas vl where vl.version_id = v_ver order by vl.orden loop
    continue when not p_todas and not public.ps_ve_linea_presupuesto(r.linea_id);
    c := public.ps_presupuesto_cifras(r.linea_id);
    v_vig := (c ->> 'vigente')::numeric; v_eje := (c ->> 'ejecutado')::numeric; v_des := (c ->> 'desviacion')::numeric;
    v_base := jsonb_build_object('plan_id', p_plan, 'linea_id', r.linea_id, 'linea_clave', r.clave, 'linea', r.nombre, 'oficina_unit_id', r.oficina_unit_id);
    if v_eje > 0 and (v_vig = 0 or v_eje > v_vig * v_umb_s / 100) then
      v_out := v_out || jsonb_build_array(v_base || jsonb_build_object('tipo', 'sobreejecucion', 'severidad', 'alta', 'valor', c -> 'pct_ejecucion',
        'texto', format('La línea %s supera su presupuesto vigente: ejecutado %s de %s.', r.clave, v_eje, v_vig)));
    end if;
    if v_des is not null and v_des > v_umb_d then
      v_out := v_out || jsonb_build_array(v_base || jsonb_build_object('tipo', 'ejecucion_sobre_avance', 'severidad', 'media', 'valor', v_des,
        'texto', format('La línea %s ejecuta %s puntos más de lo que avanza físicamente.', r.clave, v_des)));
    elsif v_des is not null and v_des < -v_umb_d then
      v_out := v_out || jsonb_build_array(v_base || jsonb_build_object('tipo', 'avance_sobre_ejecucion', 'severidad', 'baja', 'valor', v_des,
        'texto', format('La línea %s avanza %s puntos más de lo que ejecuta: posible rezago de registro.', r.clave, abs(v_des))));
    end if;
    if v_vig > 0 and (c ->> 'ultimo_movimiento' is null or (c ->> 'ultimo_movimiento')::date < p_hoy - make_interval(months => v_meses)) then
      v_out := v_out || jsonb_build_array(v_base || jsonb_build_object('tipo', 'sin_movimientos', 'severidad', 'media', 'valor', v_meses,
        'texto', format('La línea %s tiene presupuesto aprobado y lleva %s meses o más sin movimientos.', r.clave, v_meses)));
    end if;
    if not exists (select 1 from public.ps_linea_financiacion f where f.linea_id = r.linea_id and f.estado <> 'sin_evaluar')
       and (c ->> 'aprobado')::numeric = 0 then
      v_out := v_out || jsonb_build_array(v_base || jsonb_build_object('tipo', 'sin_evaluar_vaf', 'severidad', 'baja', 'valor', null,
        'texto', format('La línea %s aún no tiene evaluación de financiación de la VAF.', r.clave)));
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.ps_vigilancia_plan(p_plan uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  return public.ps_vigilancia_calcular(p_plan, public.ps_hoy(), false);
end;
$$;

create or replace function public.ps_vigilancia_global()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  v_out jsonb := '[]'::jsonb;
begin
  if public.ps_nivel_actual() = 'none' then
    raise exception 'Sin permiso: no tiene acceso a Planeación y Seguimiento.' using errcode = '42501';
  end if;
  for p in select id from public.ps_planes where estado = 'activo' and public.ps_plan_visible(id) order by creado_en desc loop
    v_out := v_out || public.ps_vigilancia_calcular(p.id, public.ps_hoy(), false);
  end loop;
  return v_out;
end;
$$;

/**
 * Avisos de vigilancia a la VAF (c-ps-vaf-alerta): uno por plan y destinatario por semana, con lo más grave (alta y media).
 * Idempotente por semana (dedupe con la semana ISO). Solo service_role (función de borde o pg_cron). p_hoy solo para pruebas.
 */
create or replace function public.ps_generar_alertas_presupuesto(p_hoy date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := coalesce(p_hoy, public.ps_hoy());
  p record;
  v_al jsonb;
  v_graves jsonb;
  v_n integer;
  v_avisos integer := 0;
  v_planes integer := 0;
  d uuid;
  v_txt text;
begin
  for p in select id from public.ps_planes where estado = 'activo' and version_vigente_id is not null order by id loop
    v_al := public.ps_vigilancia_calcular(p.id, v_hoy, true);
    select coalesce(jsonb_agg(a), '[]'::jsonb) into v_graves from jsonb_array_elements(v_al) a where a ->> 'severidad' in ('alta', 'media');
    v_n := jsonb_array_length(v_graves);
    continue when v_n = 0;
    v_planes := v_planes + 1;
    select left(string_agg(a ->> 'texto', ' '), 600) into v_txt from (select a from jsonb_array_elements(v_graves) a limit 5) q;
    for d in select x from public.ps_vaf_destinatarios() as x loop
      if public.ps_aviso_plan('c-ps-vaf-alerta', d, p.id, jsonb_build_object('n', v_n, 'detalle', coalesce(v_txt, '')),
                              format('vaf-al:%s:%s:%s', p.id, to_char(v_hoy, 'IYYY-IW'), d)) then
        v_avisos := v_avisos + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('hoy', v_hoy, 'planes_con_alertas', v_planes, 'avisos', v_avisos);
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Publicar versión abre la evaluación de la VAF; tablero con presupuesto
-- -----------------------------------------------------------------------------

create or replace function public.ps_publicar_version(p_version uuid, p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ver public.ps_versiones%rowtype;
  v_huella text;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_lineas integer;
begin
  select * into v_ver from public.ps_versiones where id = p_version for update;
  if not found then
    if not public.ps_puede('publicar') then raise exception 'Sin permiso: publicar una versión es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501'; end if;
    raise exception 'La versión no existe.' using errcode = 'P0002';
  end if;
  if not public.ps_plan_gestiona(v_ver.plan_id) then
    raise exception 'Sin permiso: publicar una versión es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501';
  end if;
  if v_ver.estado <> 'borrador' then
    raise exception 'La versión % ya está publicada.', v_ver.etiqueta using errcode = '55000';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception 'La nota de publicación supera los 1000 caracteres.' using errcode = '22023';
  end if;
  select count(*) into v_lineas from public.ps_version_lineas where version_id = p_version;
  if v_lineas = 0 then
    raise exception 'No se puede publicar una versión sin líneas.' using errcode = '55000';
  end if;
  perform 1 from public.ps_planes where id = v_ver.plan_id for update;
  v_huella := public.ps_huella_version(p_version);
  update public.ps_versiones
     set estado = 'publicada', publicada_en = now(), publicada_por = auth.uid(), huella = v_huella,
         nota = case when v_nota <> '' then v_nota else nota end
   where id = p_version;
  update public.ps_planes set version_vigente_id = p_version where id = v_ver.plan_id;
  perform public.ps_evento('version.publicada', v_ver.plan_id, p_version, null,
    jsonb_build_object('etiqueta', v_ver.etiqueta, 'lineas', v_lineas, 'huella', v_huella, 'nota', v_nota));
  -- 0290: la VAF evalúa la financiación (la primera versión siempre; las siguientes si cambian los montos). No bloquea nada.
  perform public.ps_vaf_abrir_evaluacion(v_ver.plan_id, p_version);
  return jsonb_build_object('version_id', p_version, 'etiqueta', v_ver.etiqueta, 'huella', v_huella,
    'lineas', v_lineas, 'publicada_en', (select publicada_en from public.ps_versiones where id = p_version));
end;
$$;

/** Tablero de todos los planes: lo de 0289 más presupuesto, evaluaciones de la VAF y alertas de vigilancia, por plan, oficina y pilar. */
create or replace function public.ps_tablero_admin(p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b jsonb := public.ps_tablero_base(p_filtros);
  pl jsonb;
  pres jsonb;
  ev jsonb;
  v_planes jsonb := '[]'::jsonb;
  v_alertas jsonb := b -> 'alertas';
  v_pres jsonb := '[]'::jsonb;
  v_pend integer := 0; v_apr integer := 0; v_aju integer := 0; v_nv integer := 0;
  v_id uuid;
begin
  for pl in select * from jsonb_array_elements(b -> 'planes') loop
    v_id := (pl ->> 'id')::uuid;
    pres := public.ps_presupuesto_plan(v_id);
    select jsonb_build_object(
      'pendientes', count(*) filter (where estado in ('pendiente', 'en_revision')),
      'aprobadas', count(*) filter (where estado = 'aprobada'),
      'ajustadas', count(*) filter (where estado = 'aprobada_con_ajustes'),
      'no_viables', count(*) filter (where estado = 'no_viable'))
      into ev from public.ps_evaluaciones_vaf where plan_id = v_id;
    v_pend := v_pend + (ev ->> 'pendientes')::int; v_apr := v_apr + (ev ->> 'aprobadas')::int;
    v_aju := v_aju + (ev ->> 'ajustadas')::int; v_nv := v_nv + (ev ->> 'no_viables')::int;
    v_pres := v_pres || jsonb_build_array(pres -> 'totales');
    pl := pl || jsonb_build_object(
      'presupuesto', pres -> 'totales',
      'presupuesto_por_anio', pres -> 'por_anio',
      'evaluaciones_vaf', ev,
      'por_oficina', coalesce((select jsonb_agg(o || jsonb_build_object('presupuesto', coalesce((select x - 'unit_id' - 'nombre' from jsonb_array_elements(pres -> 'por_oficina') x where x ->> 'unit_id' = o ->> 'unit_id' limit 1), 'null'::jsonb)))
                                 from jsonb_array_elements(pl -> 'por_oficina') o), '[]'::jsonb),
      'por_pilar', coalesce((select jsonb_agg(o || jsonb_build_object('presupuesto', coalesce((select x - 'pilar' from jsonb_array_elements(pres -> 'por_pilar') x where x ->> 'pilar' = o ->> 'pilar' limit 1), 'null'::jsonb)))
                               from jsonb_array_elements(pl -> 'por_pilar') o), '[]'::jsonb));
    v_planes := v_planes || jsonb_build_array(pl);
    v_alertas := v_alertas || public.ps_vigilancia_calcular(v_id, public.ps_hoy(), false);
  end loop;
  return jsonb_build_object('generado_en', b -> 'generado_en',
    'totales', (b -> 'totales') || jsonb_build_object('presupuesto', public.ps_presupuesto_sumar(v_pres),
                 'evaluaciones_vaf', jsonb_build_object('pendientes', v_pend, 'aprobadas', v_apr, 'ajustadas', v_aju, 'no_viables', v_nv)),
    'planes', v_planes, 'alertas', v_alertas);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Plantillas de correo de la VAF (no pisan lo ya editado)
-- -----------------------------------------------------------------------------

insert into public.correo_templates (key, identity, grp, name, sent_when, action, subject, preheader, title, greeting, body, button, note, active, sort, tipo)
values
  ('c-ps-vaf-evaluar', 'plan', 'Planeación y Seguimiento', 'Un plan espera evaluación financiera',
   'Al publicarse una versión de un plan (la primera, o una que cambia montos): a la VAF', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Hay un plan por evaluar', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Se publicó una versión de un plan que espera su evaluación de financiación y presupuesto.\n{{detalle}}', 'Evaluar el plan',
   'La evaluación no bloquea la operación de las oficinas.', true, 349, 'aviso'),
  ('c-ps-vaf-resultado', 'plan', 'Planeación y Seguimiento', 'La VAF evaluó el plan',
   'Cuando la VAF resuelve la evaluación financiera de un plan: a la oficina dueña', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Resultado de la evaluación financiera', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'La Vicerrectoría Administrativa y Financiera evaluó la financiación de su plan.\n{{detalle}}', 'Ver el plan', '', true, 350, 'aviso'),
  ('c-ps-vaf-alerta', 'plan', 'Planeación y Seguimiento', 'Alerta de ejecución presupuestal',
   'Cada semana, si la vigilancia del presupuesto de un plan encuentra alertas: a la VAF', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Revise la ejecución del plan', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'La vigilancia del presupuesto encontró alertas de ejecución.\n{{detalle}}', 'Ver el presupuesto', 'Los umbrales se ajustan por plan.', true, 351, 'aviso')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 11. Permisos de ejecución
-- -----------------------------------------------------------------------------

revoke all on function
  public.ps_presupuesto_movs_guard(), public.ps_evaluaciones_vaf_guard(), public.ps_linea_oficina(uuid), public.ps_ve_linea_presupuesto(uuid),
  public.ps_vaf_destinatarios(), public.ps_aviso_plan(text, uuid, uuid, jsonb, text), public.ps_vaf_abrir_evaluacion(uuid, uuid),
  public.ps_vaf_evaluacion_json(public.ps_evaluaciones_vaf), public.ps_presupuesto_normalizar(integer, uuid, uuid, jsonb),
  public.ps_presupuesto_mov_json(public.ps_presupuesto_movs), public.ps_presupuesto_cifras(uuid), public.ps_presupuesto_sumar(jsonb),
  public.ps_vigilancia_calcular(uuid, date, boolean),
  public.ps_vaf_config_leer(), public.ps_vaf_config_guardar(uuid), public.ps_vaf_pendientes(), public.ps_vaf_en_revision(uuid),
  public.ps_vaf_evaluar(uuid, uuid, text, numeric, text, text), public.ps_vaf_evaluaciones(uuid),
  public.ps_vaf_linea_evaluar(uuid, integer, numeric, text, text, text), public.ps_vaf_lineas_cargar(uuid, jsonb),
  public.ps_presupuesto_registrar(uuid, jsonb), public.ps_presupuesto_anular(uuid, text), public.ps_presupuesto_cargar(uuid, jsonb),
  public.ps_presupuesto_linea(uuid), public.ps_presupuesto_plan(uuid), public.ps_vigilancia_plan(uuid), public.ps_vigilancia_global(),
  public.ps_generar_alertas_presupuesto(date), public.ps_tablero_admin(jsonb), public.ps_publicar_version(uuid, text)
  from public, anon, authenticated;

grant execute on function public.ps_ve_linea_presupuesto(uuid) to authenticated;

grant execute on function
  public.ps_vaf_config_leer(), public.ps_vaf_config_guardar(uuid), public.ps_vaf_pendientes(), public.ps_vaf_en_revision(uuid),
  public.ps_vaf_evaluar(uuid, uuid, text, numeric, text, text), public.ps_vaf_evaluaciones(uuid),
  public.ps_vaf_linea_evaluar(uuid, integer, numeric, text, text, text), public.ps_vaf_lineas_cargar(uuid, jsonb),
  public.ps_presupuesto_registrar(uuid, jsonb), public.ps_presupuesto_anular(uuid, text), public.ps_presupuesto_cargar(uuid, jsonb),
  public.ps_presupuesto_linea(uuid), public.ps_presupuesto_plan(uuid), public.ps_vigilancia_plan(uuid), public.ps_vigilancia_global(),
  public.ps_tablero_admin(jsonb), public.ps_publicar_version(uuid, text)
  to authenticated;

grant execute on function public.ps_generar_alertas_presupuesto(date) to service_role;

notify pgrst, 'reload schema';

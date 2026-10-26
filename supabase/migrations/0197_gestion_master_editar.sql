-- =============================================================================
-- PDI · 0197 · Gestión Master: el tipo «Editar»
--
-- Los tipos de solicitud pasan a ser Nuevo, Editar, Mejorar o mantener y
-- Eliminar. «Editar» pide cambiar datos de un código que YA existe en el Master:
-- su código (se escribe el código nuevo), su nombre, su tipo de actividad
-- (directa o de apoyo), su vinculación o sus instrucciones. Es distinto de
-- «Mejorar o mantener», que parte de un código para ampliarlo como actividad.
--
-- Qué cambia en la base
--   · gm_solicitudes.tipo admite 'editar'.
--   · gm_solicitud_lineas gana codigo_nuevo, motivo (corto, por línea) y cambios
--     (jsonb: por cada campo que cambia, {antes, despues}; lo calcula la base
--     comparando con la ficha del catálogo que leyó al guardar, no el navegador).
--   · El código de una línea sobre un código que ya existe se valida solo por
--     largo (el catálogo del Master puede traer códigos con otro formato); el
--     formato estricto (mayúsculas, números, punto, guion y guion bajo, hasta 32)
--     se exige solo a los códigos que se CREAN: el de una actividad nueva y el
--     código nuevo de una edición. Esto corrige también el caso de 0196, en el que
--     un valor precargado del catálogo rompía una regla de la base.
--   · Los topes de largo se validan en la función con un mensaje que dice cuál
--     campo se pasó (nombre 300, instrucciones 5000, vinculación 1000, motivo 300).
--   · Se redefinen: gm_snapshot_linea, gm_guardar_solicitud, gm_aviso, gm_listar,
--     gm_actividades_periodo (gana edicion_abierta), gm_conciliar y gm_corte_filas.
--   · La política del conjunto gm_solicitudes del Warehouse gana codigo_nuevo y
--     campos (los nombres de los campos que cambian, sin sus valores): sin datos
--     personales.
--   · Los textos de las plantillas de correo c-gm-* sin editar contemplan Editar.
--
-- No rompe lo existente: solo añade columnas y amplía reglas; las solicitudes
-- guardadas siguen igual. Requiere 0194 y 0196. Idempotente. Todo DELETE y
-- UPDATE lleva WHERE (safeupdate, 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas y reglas
-- -----------------------------------------------------------------------------

alter table public.gm_solicitudes drop constraint if exists gm_sol_tipo;
alter table public.gm_solicitudes
  add constraint gm_sol_tipo check (tipo in ('nuevo', 'editar', 'mejorar', 'eliminar'));

alter table public.gm_solicitud_lineas add column if not exists codigo_nuevo text;
alter table public.gm_solicitud_lineas add column if not exists motivo text;
alter table public.gm_solicitud_lineas add column if not exists cambios jsonb not null default '{}'::jsonb;

alter table public.gm_solicitud_lineas drop constraint if exists gm_lin_codigo;
alter table public.gm_solicitud_lineas
  add constraint gm_lin_codigo check (codigo is null or char_length(codigo) between 1 and 40);

alter table public.gm_solicitud_lineas drop constraint if exists gm_lin_codigo_nuevo;
alter table public.gm_solicitud_lineas
  add constraint gm_lin_codigo_nuevo check (codigo_nuevo is null or codigo_nuevo ~ '^[A-Z0-9._-]{1,32}$');

alter table public.gm_solicitud_lineas drop constraint if exists gm_lin_largos;
alter table public.gm_solicitud_lineas
  add constraint gm_lin_largos
  check (
    char_length(coalesce(nombre, '')) <= 300
    and char_length(coalesce(instrucciones, '')) <= 5000
    and char_length(coalesce(vinculacion, '')) <= 1000
    and char_length(coalesce(motivo, '')) <= 300
  );

create unique index if not exists gm_lin_codigo_nuevo_unico
  on public.gm_solicitud_lineas (solicitud_id, upper(codigo_nuevo)) where codigo_nuevo is not null;

comment on column public.gm_solicitud_lineas.codigo_nuevo is 'Editar: el código que debe quedar en el Master (si cambia el código).';
comment on column public.gm_solicitud_lineas.cambios is 'Editar: por cada campo que cambia, {antes, despues}. Lo calcula gm_guardar_solicitud contra la ficha del catálogo.';
comment on column public.gm_solicitud_lineas.motivo is 'Editar: por qué se pide ese cambio, en corto (además de la justificación general).';

-- -----------------------------------------------------------------------------
-- 2. La foto de una línea (ficha del catálogo) también para Editar
-- -----------------------------------------------------------------------------

create or replace function public.gm_snapshot_linea(p_tipo text, p_linea jsonb, p_periodo text, p_sede text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cod text := upper(nullif(btrim(coalesce(p_linea ->> 'origen_codigo', p_linea ->> 'codigo', '')), ''));
  per text := coalesce(nullif(p_linea ->> 'origen_periodo', ''), p_periodo);
  sd text := coalesce(nullif(p_linea ->> 'origen_sede', ''), p_sede);
  ficha jsonb;
begin
  if p_tipo = 'nuevo' or cod is null then return '{}'::jsonb; end if;
  ficha := public.gm_ficha_codigo(per, sd, cod);
  if p_tipo in ('eliminar', 'mejorar', 'editar')
     and jsonb_typeof(ficha -> 'catalogo') is distinct from 'object'
     and not coalesce((ficha ->> 'sin_captura_catalogo')::boolean, false) then
    raise exception 'El código % no está en el catálogo de actividades del Master (%, %). %', cod, per, sd,
      case p_tipo when 'mejorar' then 'Para algo que no existe, use «Nuevo».' else 'Revise el código o el periodo.' end
      using errcode = 'check_violation';
  end if;
  return jsonb_build_object('ficha', ficha, 'periodo', per, 'sede', sd);
end;
$$;

revoke all on function public.gm_snapshot_linea(text, jsonb, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Guardar y enviar (con Editar y con mensajes claros de largo y de código)
-- -----------------------------------------------------------------------------

create or replace function public.gm_guardar_solicitud(
  p_id uuid, p_tipo text, p_prioridad text, p_unidad uuid, p_periodo text, p_sede text,
  p_justificacion text, p_lineas jsonb, p_enviar boolean
)
returns table (id uuid, folio text, estado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_estado text;
  v_ronda smallint;
  v_flujo uuid;
  v_plazo smallint;
  v_l jsonb;
  v_i int := 0;
  v_cod text;
  v_nuevo text;
  v_nom text;
  v_snap jsonb;
  v_antes jsonb;
  v_despues jsonb;
  v_cat jsonb;
  v_cambios jsonb;
  v_tipo_act text;
  v_tipo_cat text;
  v_instr text;
  v_vinc text;
  v_motivo text;
  v_paso record;
  v_usados text[] := '{}';
  v_existe record;
begin
  if not public.gm_puede('solicitar') then
    raise exception 'No tienes permiso para crear solicitudes en Gestión Master.' using errcode = '42501';
  end if;
  if p_tipo not in ('nuevo', 'editar', 'mejorar', 'eliminar') then raise exception 'El tipo de solicitud no es válido.' using errcode = 'check_violation'; end if;
  if coalesce(p_prioridad, 'normal') not in ('normal', 'alta', 'urgente') then raise exception 'La prioridad no es válida.' using errcode = 'check_violation'; end if;
  if p_periodo !~ '^[0-9]{4}[ab]$' or p_sede not in ('buc', 'cuc', 'val', 'bog') then raise exception 'Elija el periodo y la sede.' using errcode = 'check_violation'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Una solicitud tiene que afectar al menos a una actividad.' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_lineas) > 30 then raise exception 'Una solicitud admite hasta 30 actividades.' using errcode = 'invalid_parameter_value'; end if;
  if p_unidad is not null and not (public.gm_nivel_actual() = 'gestor' or public.unit_can_edit(p_unidad)) then
    raise exception 'Solo puedes solicitar a nombre de una unidad donde eres Gestor o Contribuyente.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_justificacion, '')) > 2000 then
    raise exception 'La justificación pasa de 2000 caracteres (tiene %). Acórtela.', char_length(p_justificacion) using errcode = 'check_violation';
  end if;
  if p_enviar and char_length(btrim(coalesce(p_justificacion, ''))) < 150 then
    raise exception 'La justificación debe tener al menos 150 caracteres para enviarse a revisión.' using errcode = 'check_violation';
  end if;

  -- Se valida TODA la lista antes de escribir nada, para señalar qué línea y qué campo están mal.
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;
    v_cod := upper(nullif(btrim(coalesce(v_l ->> 'codigo', '')), ''));
    v_nuevo := upper(nullif(btrim(coalesce(v_l ->> 'codigo_nuevo', '')), ''));
    v_nom := nullif(btrim(coalesce(v_l ->> 'nombre', '')), '');
    if char_length(coalesce(v_l ->> 'nombre', '')) > 300 then
      raise exception 'Actividad %: el nombre pasa de 300 caracteres (tiene %).', v_i, char_length(v_l ->> 'nombre') using errcode = 'check_violation';
    end if;
    if char_length(coalesce(v_l ->> 'instrucciones', '')) > 5000 then
      raise exception 'Actividad %: las instrucciones pasan de 5000 caracteres (tienen %).', v_i, char_length(v_l ->> 'instrucciones') using errcode = 'check_violation';
    end if;
    if char_length(coalesce(v_l ->> 'vinculacion', '')) > 1000 then
      raise exception 'Actividad %: la vinculación pasa de 1000 caracteres (tiene %).', v_i, char_length(v_l ->> 'vinculacion') using errcode = 'check_violation';
    end if;
    if char_length(coalesce(v_l ->> 'motivo', '')) > 300 then
      raise exception 'Actividad %: el motivo del cambio pasa de 300 caracteres (tiene %).', v_i, char_length(v_l ->> 'motivo') using errcode = 'check_violation';
    end if;
    if v_cod is not null and char_length(v_cod) > 40 then
      raise exception 'Actividad %: el código pasa de 40 caracteres.', v_i using errcode = 'check_violation';
    end if;
    -- El formato estricto solo se exige a lo que se CREA: el código de una actividad nueva y el código nuevo de una edición.
    if p_tipo = 'nuevo' and v_cod is not null and v_cod !~ '^[A-Z0-9._-]{1,32}$' then
      raise exception 'Actividad %: el código solo admite mayúsculas, números, punto, guion y guion bajo (hasta 32).', v_i using errcode = 'check_violation';
    end if;
    if p_tipo = 'editar' and v_nuevo is not null and v_nuevo !~ '^[A-Z0-9._-]{1,32}$' then
      raise exception 'Actividad %: el código nuevo solo admite mayúsculas, números, punto, guion y guion bajo (hasta 32).', v_i using errcode = 'check_violation';
    end if;
    if p_tipo = 'nuevo' and (v_nom is null or coalesce(v_l ->> 'tipo_actividad', '') not in ('directa', 'apoyo')) then
      raise exception 'Actividad %: una actividad nueva necesita nombre y tipo (directa o de apoyo).', v_i using errcode = 'check_violation';
    end if;
    if p_tipo <> 'nuevo' and v_cod is null and nullif(btrim(coalesce(v_l ->> 'origen_codigo', '')), '') is null then
      raise exception 'Actividad %: elija el código de la actividad.', v_i using errcode = 'check_violation';
    end if;
    if p_tipo = 'mejorar' and v_nom is null then
      raise exception 'Actividad %: escriba cómo debe quedar el nombre de la actividad.', v_i using errcode = 'check_violation';
    end if;
    if p_tipo = 'editar' and char_length(btrim(coalesce(v_l ->> 'motivo', ''))) < 10 then
      raise exception 'Actividad %: escriba el motivo del cambio (al menos 10 caracteres).', v_i using errcode = 'check_violation';
    end if;
    -- Un código no puede repetirse dentro de la solicitud (ni como código actual ni como código nuevo).
    if v_cod is not null then
      if v_cod = any (v_usados) then raise exception 'Actividad %: el código % ya está en esta solicitud.', v_i, v_cod using errcode = 'check_violation'; end if;
      v_usados := v_usados || v_cod;
    end if;
    if v_nuevo is not null then
      if v_nuevo = any (v_usados) then raise exception 'Actividad %: el código nuevo % ya está en esta solicitud.', v_i, v_nuevo using errcode = 'check_violation'; end if;
      v_usados := v_usados || v_nuevo;
    end if;
    -- El código nuevo no puede ser uno que ya existe en esa sede y periodo.
    if p_tipo = 'editar' and v_nuevo is not null and v_nuevo is distinct from v_cod and public.gm_carga('ms_actdir', p_periodo, p_sede) is not null then
      select a.codigo, a.nombre into v_existe from public.gm_actdir_filas(p_periodo, p_sede) a where a.codigo = v_nuevo limit 1;
      if found then
        raise exception 'Actividad %: el código % ya existe en el catálogo del Master (%, %)%.', v_i, v_nuevo, p_periodo, p_sede,
          case when v_existe.nombre is not null then ' y lo usa «' || left(v_existe.nombre, 80) || '»' else '' end using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  if v_id is null then
    insert into public.gm_solicitudes (folio, tipo, estado, prioridad, solicitante_id, unidad_id, periodo, sede, justificacion)
    values ('', p_tipo, 'borrador', coalesce(p_prioridad, 'normal'), auth.uid(), p_unidad, p_periodo, p_sede, btrim(coalesce(p_justificacion, '')))
    returning gm_solicitudes.id into v_id;
  else
    select s.estado, s.ronda into v_estado, v_ronda from public.gm_solicitudes s where s.id = v_id and s.solicitante_id = auth.uid();
    if v_estado is null or v_estado not in ('borrador', 'devuelta') then
      raise exception 'Solo puedes editar tus propias solicitudes mientras estén en borrador o devueltas.' using errcode = '42501';
    end if;
    delete from public.gm_solicitud_lineas where solicitud_id = v_id;
    update public.gm_solicitudes
       set tipo = p_tipo, prioridad = coalesce(p_prioridad, 'normal'), unidad_id = p_unidad, periodo = p_periodo, sede = p_sede,
           justificacion = btrim(coalesce(p_justificacion, ''))
     where gm_solicitudes.id = v_id;
  end if;

  v_i := 0;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;
    v_cod := upper(nullif(btrim(coalesce(v_l ->> 'codigo', '')), ''));
    v_nuevo := upper(nullif(btrim(coalesce(v_l ->> 'codigo_nuevo', '')), ''));
    v_snap := public.gm_snapshot_linea(p_tipo, v_l, p_periodo, p_sede);
    v_antes := coalesce(v_snap, '{}'::jsonb);
    v_tipo_act := nullif(v_l ->> 'tipo_actividad', '');
    v_nom := nullif(btrim(coalesce(v_l ->> 'nombre', '')), '');
    v_instr := nullif(btrim(coalesce(v_l ->> 'instrucciones', '')), '');
    v_vinc := nullif(btrim(coalesce(v_l ->> 'vinculacion', '')), '');
    v_motivo := nullif(btrim(coalesce(v_l ->> 'motivo', '')), '');
    v_cambios := '{}'::jsonb;

    if p_tipo = 'editar' then
      -- Qué cambia de verdad: lo propuesto frente a la ficha del catálogo. Lo que no cambia no se guarda.
      v_cat := case when jsonb_typeof(v_antes -> 'ficha' -> 'catalogo') = 'object' then v_antes -> 'ficha' -> 'catalogo' end;
      v_tipo_cat := case when (v_cat ->> 'directa') = 'true' then 'directa' when (v_cat ->> 'directa') = 'false' then 'apoyo' end;
      if v_nuevo is not null and v_nuevo is distinct from v_cod then
        v_cambios := v_cambios || jsonb_build_object('codigo', jsonb_build_object('antes', v_cod, 'despues', v_nuevo));
      else
        v_nuevo := null;
      end if;
      if v_nom is not null and lower(v_nom) is distinct from lower(btrim(coalesce(v_cat ->> 'nombre', ''))) then
        v_cambios := v_cambios || jsonb_build_object('nombre', jsonb_build_object('antes', v_cat ->> 'nombre', 'despues', v_nom));
      else
        v_nom := null;
      end if;
      if v_tipo_act is not null and v_tipo_act is distinct from v_tipo_cat then
        v_cambios := v_cambios || jsonb_build_object('tipo_actividad', jsonb_build_object('antes', v_tipo_cat, 'despues', v_tipo_act));
      else
        v_tipo_act := null;
      end if;
      if v_vinc is not null and lower(v_vinc) is distinct from lower(btrim(coalesce(v_cat ->> 'vinculacion', ''))) then
        v_cambios := v_cambios || jsonb_build_object('vinculacion', jsonb_build_object('antes', v_cat ->> 'vinculacion', 'despues', v_vinc));
      else
        v_vinc := null;
      end if;
      if v_instr is not null and v_instr is distinct from btrim(coalesce(v_cat ->> 'instrucciones', '')) then
        v_cambios := v_cambios || jsonb_build_object('instrucciones', jsonb_build_object('antes', v_cat ->> 'instrucciones', 'despues', v_instr));
      else
        v_instr := null;
      end if;
      if v_cambios = '{}'::jsonb then
        raise exception 'Actividad %: no cambia nada. Marque al menos un campo que cambie.', v_i using errcode = 'check_violation';
      end if;
      v_despues := jsonb_strip_nulls(jsonb_build_object('codigo', v_nuevo, 'nombre', v_nom, 'tipo_actividad', v_tipo_act, 'instrucciones', v_instr, 'vinculacion', v_vinc));
    else
      v_despues := jsonb_strip_nulls(jsonb_build_object(
        'nombre', v_nom, 'tipo_actividad', v_tipo_act, 'instrucciones', v_instr, 'vinculacion', v_vinc,
        'activa', case when p_tipo = 'eliminar' then false else coalesce((v_l ->> 'activa')::boolean, true) end));
    end if;

    insert into public.gm_solicitud_lineas (solicitud_id, orden, codigo, codigo_nuevo, origen_codigo, origen_periodo, origen_sede, nombre, tipo_actividad, instrucciones, vinculacion, motivo, cambios, activa, antes, despues)
    values (v_id, v_i, v_cod, v_nuevo, upper(nullif(btrim(coalesce(v_l ->> 'origen_codigo', '')), '')),
            nullif(v_l ->> 'origen_periodo', ''), nullif(v_l ->> 'origen_sede', ''),
            v_nom, v_tipo_act, v_instr, v_vinc, v_motivo, v_cambios,
            case when p_tipo = 'eliminar' then false else coalesce((v_l ->> 'activa')::boolean, true) end,
            v_antes, v_despues);
  end loop;

  if not p_enviar then
    perform public.gm_evento(v_id, 'borrador', '{}'::jsonb);
    return query select s.id, s.folio, s.estado from public.gm_solicitudes s where s.id = v_id;
    return;
  end if;

  select f.id, f.plazo_dias into v_flujo, v_plazo from public.gm_flujos f where f.por_defecto and f.activo limit 1;
  if v_flujo is null then raise exception 'No hay un flujo de aprobación por defecto. Pídale a Planeación que lo configure.' using errcode = 'P0001'; end if;
  select coalesce(max(ronda), 0) + 1 into v_ronda from public.gm_solicitud_pasos where solicitud_id = v_id;
  insert into public.gm_solicitud_pasos (solicitud_id, ronda, orden, nombre, funcion, suplente_funcion, plazo_dias, estado, inicio_en)
  select v_id, v_ronda, fp.orden, fp.nombre, fp.funcion, fp.suplente_funcion, fp.plazo_dias,
         case when fp.orden = (select min(orden) from public.gm_flujo_pasos where flujo_id = v_flujo) then 'pendiente' else 'bloqueado' end,
         case when fp.orden = (select min(orden) from public.gm_flujo_pasos where flujo_id = v_flujo) then now() end
    from public.gm_flujo_pasos fp where fp.flujo_id = v_flujo;
  update public.gm_solicitudes
     set estado = 'pendiente', flujo_id = v_flujo, ronda = v_ronda, enviada_en = now(),
         limite_en = public.gm_sumar_dias_habiles(now(), v_plazo)
   where gm_solicitudes.id = v_id;
  perform public.gm_evento(v_id, 'enviada', jsonb_build_object('ronda', v_ronda));

  perform public.gm_aviso(v_id, 'c-gm-acuse', auth.uid());
  for v_paso in select p.funcion, p.suplente_funcion from public.gm_solicitud_pasos p where p.solicitud_id = v_id and p.ronda = v_ronda and p.estado = 'pendiente' loop
    perform public.gm_aviso(v_id, 'c-gm-turno', a, '{}'::jsonb)
      from (select distinct x as a from (select public.gm_aprobadores(v_paso.funcion) x union all select public.gm_aprobadores(v_paso.suplente_funcion)) y where x is not null and x <> auth.uid()) z;
  end loop;

  return query select s.id, s.folio, s.estado from public.gm_solicitudes s where s.id = v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Los avisos dicen el tipo y, en Editar, el cambio de código
-- -----------------------------------------------------------------------------

create or replace function public.gm_aviso(p_solicitud uuid, p_plantilla text, p_destino uuid, p_extra jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  acts text;
begin
  if p_destino is null then return; end if;
  select s1.folio, s1.tipo, s1.estado, s1.periodo, s1.sede, u.name as unidad, p.full_name as solicitante
    into s
    from public.gm_solicitudes s1
    left join public.units u on u.id = s1.unidad_id
    left join public.profiles p on p.id = s1.solicitante_id
   where s1.id = p_solicitud;
  select string_agg(coalesce(l.codigo, '(sin código)') || case when l.codigo_nuevo is not null then ' → ' || l.codigo_nuevo else '' end || ' ' || coalesce(l.nombre, ''), ', ' order by l.orden) into acts
    from (select * from public.gm_solicitud_lineas where solicitud_id = p_solicitud order by orden limit 3) l;
  insert into public.gm_avisos (solicitud_id, plantilla, destinatario_id, datos)
  values (p_solicitud, p_plantilla, p_destino, jsonb_build_object(
    'folio', s.folio,
    'tipo', case s.tipo when 'nuevo' then 'actividad nueva' when 'editar' then 'editar los datos de una actividad' when 'mejorar' then 'mejorar o mantener una actividad' else 'eliminar una actividad' end,
    'estado', s.estado, 'periodo', s.periodo, 'sede', s.sede,
    'unidad', coalesce(s.unidad, 'sin unidad'), 'solicitante', coalesce(s.solicitante, ''),
    'actividades', coalesce(acts, '')) || coalesce(p_extra, '{}'::jsonb));
end;
$$;

revoke all on function public.gm_aviso(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. La lista ve el código nuevo; Actividades del periodo marca «cambio solicitado»
-- -----------------------------------------------------------------------------

create or replace function public.gm_listar(p_periodo text default null, p_sede text default null)
returns table (
  id uuid, folio text, tipo text, estado text, aplicacion text, prioridad text,
  solicitante_id uuid, solicitante text, unidad_id uuid, unidad text, periodo text, sede text,
  paso_orden smallint, paso_nombre text, paso_funcion text, total_pasos smallint,
  enviada_en timestamptz, limite_en timestamptz, dias_restantes integer, actualizada_en timestamptz,
  lineas jsonb, es_mia boolean, puedo_decidir boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('ver') then raise exception 'Gestión Master: sin permiso.' using errcode = '42501'; end if;
  return query
    select s.id, s.folio, s.tipo, s.estado, s.aplicacion, s.prioridad,
           s.solicitante_id, pr.full_name, s.unidad_id, u.name, s.periodo, s.sede,
           cur.orden, cur.nombre, cur.funcion,
           (select count(*)::smallint from public.gm_solicitud_pasos x where x.solicitud_id = s.id and x.ronda = s.ronda),
           s.enviada_en, s.limite_en,
           case when s.estado in ('pendiente', 'revision') and s.limite_en is not null
                then case when s.limite_en >= now() then public.gm_dias_habiles(now(), s.limite_en) else - public.gm_dias_habiles(s.limite_en, now()) end end,
           s.actualizada_en,
           coalesce((select jsonb_agg(jsonb_build_object('codigo', l.codigo, 'nombre', l.nombre, 'origen_codigo', l.origen_codigo, 'codigo_nuevo', l.codigo_nuevo) order by l.orden) from public.gm_solicitud_lineas l where l.solicitud_id = s.id), '[]'::jsonb),
           s.solicitante_id = auth.uid(),
           public.gm_paso_para_mi(s.id) is not null
      from public.gm_solicitudes s
      left join public.profiles pr on pr.id = s.solicitante_id
      left join public.units u on u.id = s.unidad_id
      left join lateral (select x.orden, x.nombre, x.funcion from public.gm_solicitud_pasos x where x.solicitud_id = s.id and x.ronda = s.ronda and x.estado = 'pendiente' limit 1) cur on true
     where public.gm_solicitud_visible(s.id)
       and (p_periodo is null or p_periodo = '' or s.periodo = p_periodo)
       and (p_sede is null or p_sede = '' or s.sede = p_sede)
     order by (s.estado in ('pendiente', 'revision')) desc, s.actualizada_en desc
     limit 500;
end;
$$;

-- Cambia la forma de lo que devuelve (gana edicion_abierta): hay que soltarla y crearla de nuevo.
drop function if exists public.gm_actividades_periodo(text, text);

create function public.gm_actividades_periodo(p_periodo text, p_sede text)
returns table (codigo text, nombre text, tipo_actividad text, activa boolean, vinculacion text, n_profesores int, horas numeric, promedio_horas numeric, solicitudes_abiertas int, edicion_abierta boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('ver') then
    raise exception 'Gestión Master: sin permiso.' using errcode = '42501';
  end if;
  return query
    with nom as (
      select n.codigo, count(distinct n.seudonimo)::int as np, sum(coalesce(n.horas, 0)) as h
        from public.gm_nomina_filas(p_periodo, p_sede) n
       where n.codigo is not null group by n.codigo
    ), abiertas as (
      select upper(l.codigo) as codigo, count(distinct s.id)::int as n, bool_or(s.tipo = 'editar') as ed
        from public.gm_solicitud_lineas l
        join public.gm_solicitudes s on s.id = l.solicitud_id
       where s.periodo = p_periodo and s.sede = p_sede and s.estado in ('pendiente', 'revision', 'devuelta')
         and public.gm_solicitud_visible(s.id) and l.codigo is not null
       group by upper(l.codigo)
    )
    select a.codigo, a.nombre,
           case when a.directa is true then 'directa' when a.directa is false then 'apoyo' else coalesce(lower(a.tipo), '') end,
           a.activa, a.vinculacion,
           nom.np, nom.h, case when coalesce(nom.np, 0) > 0 then round(nom.h / nom.np, 2) end,
           coalesce(ab.n, 0), coalesce(ab.ed, false)
      from public.gm_actdir_filas(p_periodo, p_sede) a
      left join nom on nom.codigo = a.codigo
      left join abiertas ab on ab.codigo = a.codigo
     where a.codigo is not null
     order by a.codigo;
end;
$$;

revoke all on function public.gm_actividades_periodo(text, text) from public, anon;
grant execute on function public.gm_actividades_periodo(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Conciliar: «reflejada» cuando el código o los campos nuevos aparecen en el catálogo
-- -----------------------------------------------------------------------------

create or replace function public.gm_conciliar(p_periodo text, p_sede text)
returns table (id uuid, folio text)
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  l record;
  fila record;
  viejo record;
  ok boolean;
  hay_viejo boolean;
begin
  if not public.gm_puede('gestionar') then raise exception 'Solo Planeación concilia con el Master.' using errcode = '42501'; end if;
  if public.gm_carga('ms_actdir', p_periodo, p_sede) is null then return; end if;
  for s in select * from public.gm_solicitudes x where x.periodo = p_periodo and x.sede = p_sede and x.estado = 'aprobada' and x.aplicacion in ('sin_aplicar', 'aplicada') loop
    ok := true;
    for l in select * from public.gm_solicitud_lineas where solicitud_id = s.id loop
      if s.tipo = 'editar' then
        -- La fila que debe existir ahora: la del código nuevo, si el código cambió; si no, la del código de siempre.
        select * into fila from public.gm_actdir_filas(p_periodo, p_sede) a where a.codigo = coalesce(l.codigo_nuevo, l.codigo) limit 1;
        hay_viejo := false;
        if l.codigo_nuevo is not null then
          select * into viejo from public.gm_actdir_filas(p_periodo, p_sede) a where a.codigo = l.codigo and a.activa is not false limit 1;
          hay_viejo := found;
        end if;
        ok := ok and fila.codigo is not null and not hay_viejo
              and (not (l.cambios ? 'nombre') or lower(btrim(coalesce(fila.nombre, ''))) = lower(btrim(coalesce(l.nombre, ''))))
              and (not (l.cambios ? 'tipo_actividad') or (case when fila.directa is true then 'directa' when fila.directa is false then 'apoyo' end) is not distinct from l.tipo_actividad)
              and (not (l.cambios ? 'vinculacion') or lower(btrim(coalesce(fila.vinculacion, ''))) = lower(btrim(coalesce(l.vinculacion, ''))))
              and (not (l.cambios ? 'instrucciones') or btrim(coalesce(fila.instrucciones, '')) = btrim(coalesce(l.instrucciones, '')));
      else
        select * into fila from public.gm_actdir_filas(p_periodo, p_sede) a
         where (l.codigo is not null and a.codigo = l.codigo)
            or (l.codigo is null and lower(btrim(coalesce(a.nombre, ''))) = lower(btrim(coalesce(l.nombre, '')))) limit 1;
        if s.tipo = 'eliminar' then
          ok := ok and (not found or fila.activa is false);
        elsif s.tipo = 'nuevo' then
          ok := ok and found and fila.activa is not false;
        else
          ok := ok and found and lower(btrim(coalesce(fila.nombre, ''))) = lower(btrim(coalesce(l.nombre, fila.nombre, '')))
                and (l.tipo_actividad is null or (case when fila.directa is true then 'directa' when fila.directa is false then 'apoyo' end) is not distinct from l.tipo_actividad);
        end if;
      end if;
      exit when not ok;
    end loop;
    if ok then
      update public.gm_solicitudes set aplicacion = 'reflejada', reflejada_en = now() where gm_solicitudes.id = s.id;
      insert into public.gm_eventos (solicitud_id, tipo, actor_id, periodo, sede, datos) values (s.id, 'reflejada', auth.uid(), s.periodo, s.sede, '{"por":"captura del Master"}'::jsonb);
      perform public.gm_aviso(s.id, 'c-gm-final', s.solicitante_id, jsonb_build_object('paso', 'Reflejada en el Master', 'nota', 'La captura más reciente del Master ya trae el cambio.'));
      return query select s.id, s.folio;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. El corte hacia el Warehouse: código nuevo y campos que cambian (sin valores ni personas)
-- -----------------------------------------------------------------------------

create or replace function public.gm_corte_filas(p_periodo text, p_sede text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not public.gm_puede('gestionar') then raise exception 'Solo Planeación cierra el corte.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'folio', s.folio, 'tipo', s.tipo, 'evento', e.tipo, 'estado', s.estado,
           'paso', coalesce(e.datos ->> 'paso', ''), 'codigo', coalesce(l.codigo, ''), 'codigo_nuevo', coalesce(l.codigo_nuevo, ''),
           'campos', coalesce((select string_agg(k, ',' order by k) from jsonb_object_keys(coalesce(l.cambios, '{}'::jsonb)) k), ''),
           'actividad', coalesce(l.nombre, ''),
           'unidad', coalesce(u.name, ''), 'solicitante', s.solicitante_id::text,
           'fecha', to_char(e.creado_en at time zone 'America/Bogota', 'YYYY-MM-DD"T"HH24:MI')) order by e.creado_en, e.id, l.orden), '[]'::jsonb)
    into r
    from public.gm_eventos e
    join public.gm_solicitudes s on s.id = e.solicitud_id
    left join public.units u on u.id = s.unidad_id
    left join lateral (select * from public.gm_solicitud_lineas x where x.solicitud_id = s.id) l on true
   where e.periodo = p_periodo and e.sede = p_sede
     and e.tipo in ('enviada', 'paso_aprobado', 'devuelta', 'rechazada', 'cancelada', 'aprobada', 'aplicada', 'reflejada');
  return r;
end;
$$;

update public.wh_politicas
   set lista = (select array_agg(distinct x) from unnest(lista || array['codigo_nuevo', 'campos']) x)
 where conjunto = 'gm_solicitudes' and not (lista @> array['codigo_nuevo', 'campos']);

-- -----------------------------------------------------------------------------
-- 8. Plantillas de correo: los textos que nadie ha editado contemplan Editar
-- -----------------------------------------------------------------------------

update public.correo_templates
   set body = E'Una solicitud de actividades del Master (nueva, de edición, de mejora o de baja) espera su decisión.\n{{detalle}}'
 where key = 'c-gm-turno' and body = E'Una solicitud de actividades del Master espera su decisión.\n{{detalle}}';
update public.correo_templates
   set body = E'Su solicitud (nueva, de edición, de mejora o de baja) quedó registrada y siguió al primer paso de aprobación.\n{{detalle}}'
 where key = 'c-gm-acuse' and body = E'Su solicitud quedó registrada y siguió al primer paso de aprobación.\n{{detalle}}';
update public.correo_templates
   set note = 'Si la aprobaron, Planeación aplica el cambio en el Master (crear, editar, mejorar o dar de baja el código) y la solicitud pasa a «reflejada» cuando la captura del Master lo confirma.'
 where key = 'c-gm-final' and note = 'Si la aprobaron, Planeación aplica el cambio en el Master y la solicitud pasa a «reflejada» cuando la captura del Master lo confirma.';

notify pgrst, 'reload schema';

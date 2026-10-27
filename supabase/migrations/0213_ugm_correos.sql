-- =============================================================================
-- PDI · 0213 · UI GreenMetric · correos: plantillas, cola, recordatorios y resumen semanal
--
-- Requiere 0137 y 0177 (correos), 0208 y 0210. Idempotente.
-- Función a desplegar: `correos` (acción nueva `ugm_cola`, ver supabase/functions/correos).
--
-- CÓMO FUNCIONA
--  · Cada transición del flujo (asignar, enviar, devolver, aprobar) y las tareas
--    programadas escriben filas en `ugm_notificaciones` (la cola). Nada se envía
--    desde la base.
--  · La función `correos` (acción `ugm_cola`) toma lotes de la cola con
--    ugm_cola_tomar, arma cada correo con la plantilla EDITABLE `c-ugm-*` (se
--    editan en la pantalla Correos, como las demás), lo envía por el SMTP de la
--    intranet con los mismos topes del módulo (interruptor general, dominios
--    permitidos, tope por hora, bitácora enmascarada) y devuelve el resultado con
--    ugm_cola_resultado.
--  · Recordatorios: ugm_programar_recordatorios() agrupa por PERSONA lo que le
--    vence a 7, 3 y 1 día y el día del vencimiento (configurable por ciclo en
--    ugm_config.recordatorio_dias); lo vencido se repite cada lunes. Un correo por
--    persona y día (clave única). ugm_programar_resumen() prepara el resumen
--    semanal para quien administra.
--
-- PORQUÉ DE CADA DECISIÓN DE SEGURIDAD
--  1. La cola y sus funciones de lectura/escritura (tomar, resultado) son SOLO del
--     rol de servicio: la persona del portal no puede leer correos ajenos ni
--     marcar nada como enviado. La administración ve el estado de la cola con
--     ugm_cola_estado() (sin el contenido).
--  2. Las filas de la cola guardan valores sueltos (indicador, fecha, comentario);
--     el diseño y el texto salen de la plantilla. Los valores se insertan
--     escapados y la función les quita cualquier «{{ }}».
--  3. El destinatario siempre es una persona activa de la intranet (profiles); no
--     hay direcciones libres.
--  4. Idempotente: la clave única impide duplicar un recordatorio del mismo día.
--  5. Hasta 3 intentos; un fallo no frena el resto del lote.
--
-- QUÉ DEBE HACER EL USUARIO (nada se activa aquí) — ver el final del archivo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ajustes del ciclo para los avisos
-- -----------------------------------------------------------------------------

alter table public.ugm_config add column if not exists avisar_a uuid[] not null default '{}'::uuid[];
comment on column public.ugm_config.avisar_a is
  'UI GreenMetric · quién recibe los avisos de «se presentó» y el resumen semanal además del revisor. Vacío: todas las personas activas con rol Planeación o más.';
grant update (avisar_a) on public.ugm_config to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Plantillas editables (pantalla Correos)
-- -----------------------------------------------------------------------------

insert into public.correo_templates (key, identity, grp, name, sent_when, action, subject, preheader, title, greeting, body, button, note, active, sort, tipo)
values
  ('c-ugm-asignacion', 'plan', 'UI GreenMetric', 'Le asignaron un indicador', 'Al asignar o reasignar una pregunta', 'ugm',
   'Le asignaron {{indicador}} del reporte de UI GreenMetric', 'Fecha límite: {{fecha_limite}}', 'Le asignaron {{indicador}}', 'Hola, {{nombre}}.',
   E'Planeación le asignó la pregunta {{pregunta}} ({{indicador}}) del reporte de UI GreenMetric, categoría {{categoria}}.\nPuede escribir en español: Pilo propone la traducción al inglés y usted la revisa antes de enviar.\nFecha límite: {{fecha_limite}}.',
   'Abrir el indicador', 'Si no le corresponde, avise a Planeación para reasignarlo.', true, 400, 'aviso'),
  ('c-ugm-enviado', 'plan', 'UI GreenMetric', 'Se presentó un indicador', 'Cuando quien responde envía a revisión', 'ugm',
   'Se presentó {{indicador}}: pendiente de revisión', 'Categoría {{categoria}}', '{{indicador}} espera revisión', 'Hola, {{nombre}}.',
   E'{{autor}} envió {{pregunta}} ({{indicador}}) para revisión, con {{cantidad}} y la traducción al inglés revisada.\nCategoría: {{categoria}}.',
   'Revisar ahora', '', true, 401, 'aviso'),
  ('c-ugm-devuelto', 'plan', 'UI GreenMetric', 'Un indicador volvió con comentarios', 'Cuando quien revisa devuelve una respuesta', 'ugm',
   '{{indicador}} volvió con comentarios', 'Hay que corregirlo antes del {{fecha_limite}}', '{{indicador}} volvió con comentarios', 'Hola, {{nombre}}.',
   E'{{revisor}} devolvió {{pregunta}} ({{indicador}}).\nComentario: «{{comentario}}»\nCorríjalo y envíelo de nuevo.',
   'Corregir el indicador', '', true, 402, 'aviso'),
  ('c-ugm-aprobado', 'plan', 'UI GreenMetric', 'Aprobaron un indicador', 'Cuando quien revisa aprueba una respuesta', 'ugm',
   'Aprobaron {{indicador}}', '', '{{indicador}} quedó aprobado', 'Hola, {{nombre}}.',
   E'{{revisor}} aprobó {{pregunta}} ({{indicador}}).\nYa no se puede editar. Si hace falta un cambio, pida a Planeación que la reabra.',
   'Ver el indicador', '', true, 403, 'aviso'),
  ('c-ugm-recordatorio', 'plan', 'UI GreenMetric', 'Indicadores por entregar', 'Recordatorio agrupado por persona: 7, 3 y 1 día antes y el día del vencimiento', 'ugm',
   'UI GreenMetric: {{cantidad}} por entregar, el primero {{dias}}', '', 'Tiene {{cantidad}} por entregar', 'Hola, {{nombre}}.',
   E'Estos indicadores del reporte de UI GreenMetric siguen abiertos: {{lista}}.\nEl primero en vencer es el del {{fecha_limite}} ({{dias}}).',
   'Abrir mis indicadores', 'Un indicador enviado a revisión deja de aparecer aquí.', true, 404, 'aviso'),
  ('c-ugm-resumen', 'plan', 'UI GreenMetric', 'Resumen semanal del reporte', 'Una vez por semana, a quien administra el ranking', 'ugm',
   'UI GreenMetric: resumen semanal', '', 'Resumen semanal', 'Hola, {{nombre}}.',
   E'Estado del reporte de UI GreenMetric: {{lista}}.',
   'Abrir el tablero', '', true, 405, 'aviso')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Ayudas de texto (español, zona horaria de Bogotá)
-- -----------------------------------------------------------------------------

create or replace function public.ugm_hoy()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

create or replace function public.ugm_fecha_larga(p_fecha date)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_fecha is null then 'sin fecha' else
    extract(day from p_fecha)::int || ' de ' ||
    (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from p_fecha)::int]
    || ' de ' || extract(year from p_fecha)::int end;
$$;

create or replace function public.ugm_dias_frase(p_dias int)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_dias is null then ''
    when p_dias = 0 then 'vence hoy'
    when p_dias = 1 then 'vence mañana'
    when p_dias > 1 then 'vence en ' || p_dias || ' días'
    when p_dias = -1 then 'venció ayer'
    else 'venció hace ' || (-p_dias) || ' días' end;
$$;

/** Código visible de una pregunta: «1.10 · SI3», o «1.10» si no es un indicador. */
create or replace function public.ugm_etiqueta(p_ciclo uuid, p_q text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.q || coalesce(' · ' || p.indicador, '') from public.ugm_preguntas p where p.ciclo_id = p_ciclo and p.q = p_q;
$$;

/** Quién recibe los avisos de la administración: la lista del ciclo o, vacía, todas las personas activas con rol Planeación o más. */
create or replace function public.ugm_destinatarios_admin(p_ciclo uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p
   where p.is_active
     and ((exists (select 1 from public.ugm_config c where c.ciclo_id = p_ciclo and cardinality(c.avisar_a) > 0 and p.id = any (c.avisar_a)))
          or (not exists (select 1 from public.ugm_config c where c.ciclo_id = p_ciclo and cardinality(c.avisar_a) > 0)
              and p.role in ('planeacion', 'admin')));
$$;

-- -----------------------------------------------------------------------------
-- 4. Ganchos de transición (reemplazan los de 0208 y 0210)
-- -----------------------------------------------------------------------------

create or replace function public.ugm_encolar_asignacion(p_asignacion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ugm_asignaciones;
  p public.ugm_preguntas;
  c public.ugm_categorias;
  r public.ugm_respuestas;
begin
  select * into a from public.ugm_asignaciones where id = p_asignacion;
  if not found or a.rol not in ('responsable', 'apoyo') then return; end if;
  select * into p from public.ugm_preguntas where ciclo_id = a.ciclo_id and q = a.q;
  select * into c from public.ugm_categorias where ciclo_id = a.ciclo_id and categoria = p.categoria;
  select * into r from public.ugm_respuestas where ciclo_id = a.ciclo_id and q = a.q;
  insert into public.ugm_notificaciones (ciclo_id, respuesta_id, destinatario, plantilla, valores)
  values (a.ciclo_id, r.id, a.usuario_id, 'c-ugm-asignacion', jsonb_build_object(
    'indicador', public.ugm_etiqueta(a.ciclo_id, a.q), 'pregunta', p.nombre_es, 'categoria', c.nombre_es,
    'fecha_limite', public.ugm_fecha_larga(a.fecha_limite), 'ruta', '/admin/rankings/green?q=' || a.q));
end;
$$;

create or replace function public.ugm_encolar_estado(p_antes public.ugm_respuestas, p_despues public.ugm_respuestas)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ugm_preguntas;
  c public.ugm_categorias;
  v_fecha date;
  v_base jsonb;
  v_autor text := coalesce((select pr.full_name from public.profiles pr where pr.id = auth.uid()), '');
  x record;
  v_n int;
begin
  select * into p from public.ugm_preguntas where ciclo_id = p_despues.ciclo_id and q = p_despues.q;
  select * into c from public.ugm_categorias where ciclo_id = p_despues.ciclo_id and categoria = p.categoria;
  select a.fecha_limite into v_fecha from public.ugm_asignaciones a
   where a.ciclo_id = p_despues.ciclo_id and a.q = p_despues.q and a.vigente and a.rol = 'responsable';
  v_base := jsonb_build_object('indicador', public.ugm_etiqueta(p_despues.ciclo_id, p_despues.q), 'pregunta', p.nombre_es, 'categoria', c.nombre_es,
                               'fecha_limite', public.ugm_fecha_larga(v_fecha), 'ruta', '/admin/rankings/green?q=' || p_despues.q);

  if p_despues.estado = 'enviado' then
    v_n := public.ugm_n_evidencias(p_despues.id);
    for x in
      select distinct d from (
        select a.usuario_id as d from public.ugm_asignaciones a
         where a.ciclo_id = p_despues.ciclo_id and a.vigente and a.rol = 'revisor' and (a.categoria = p.categoria or a.q = p_despues.q)
        union
        select public.ugm_destinatarios_admin(p_despues.ciclo_id)
      ) s where d is not null and d is distinct from auth.uid()
    loop
      insert into public.ugm_notificaciones (ciclo_id, respuesta_id, destinatario, plantilla, valores)
      values (p_despues.ciclo_id, p_despues.id, x.d, 'c-ugm-enviado',
              v_base || jsonb_build_object('autor', v_autor, 'cantidad', case when v_n = 1 then '1 evidencia' else v_n || ' evidencias' end));
    end loop;
  elsif p_despues.estado in ('devuelto', 'aprobado') and p_antes.estado is distinct from p_despues.estado then
    for x in
      select distinct a.usuario_id as d from public.ugm_asignaciones a
       where a.ciclo_id = p_despues.ciclo_id and a.q = p_despues.q and a.vigente and a.rol in ('responsable', 'apoyo')
    loop
      insert into public.ugm_notificaciones (ciclo_id, respuesta_id, destinatario, plantilla, valores)
      values (p_despues.ciclo_id, p_despues.id, x.d,
              case p_despues.estado when 'devuelto' then 'c-ugm-devuelto' else 'c-ugm-aprobado' end,
              v_base || jsonb_build_object('revisor', v_autor, 'comentario', left(coalesce(p_despues.nota_revision, ''), 600)));
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Recordatorios y resumen semanal (los programa el usuario; ver el final)
-- -----------------------------------------------------------------------------

/**
 * Prepara en la cola un correo por persona con lo que le vence en los días configurados (7, 3, 1 y 0) y, los lunes,
 * lo ya vencido. Solo ciclos abiertos; solo respuestas aún abiertas (asignado, en captura o devuelto).
 * Devuelve cuántos correos preparó. Repetirla el mismo día no duplica (clave única).
 */
create or replace function public.ugm_programar_recordatorios(p_hoy date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := coalesce(p_hoy, public.ugm_hoy());
  x record;
  v_n int := 0;
  v_lista text;
  v_cant int;
  v_primero date;
  v_id uuid;
begin
  if auth.uid() is not null and not public.ugm_es_admin() then
    raise exception 'Solo la administración del ranking prepara los recordatorios.' using errcode = '42501';
  end if;
  for x in
    select a.ciclo_id, a.usuario_id
      from public.ugm_asignaciones a
      join public.ranking_cycles cy on cy.id = a.ciclo_id and cy.estado = 'abierto'
      join public.ugm_config cf on cf.ciclo_id = a.ciclo_id
      join public.ugm_respuestas r on r.ciclo_id = a.ciclo_id and r.q = a.q and r.estado in ('asignado', 'en_captura', 'devuelto')
     where a.vigente and a.rol in ('responsable', 'apoyo') and a.fecha_limite is not null
       and ((a.fecha_limite - v_hoy) = any (cf.recordatorio_dias) or ((a.fecha_limite - v_hoy) < 0 and extract(isodow from v_hoy) = 1))
     group by a.ciclo_id, a.usuario_id
  loop
    select string_agg(public.ugm_etiqueta(s.ciclo_id, s.q) || ' (' || public.ugm_dias_frase(s.fecha_limite - v_hoy) || ')', '; ' order by s.fecha_limite, s.orden),
           count(*)::int, min(s.fecha_limite)
      into v_lista, v_cant, v_primero
      from (
        select a.ciclo_id, a.q, a.fecha_limite, p.orden
          from public.ugm_asignaciones a
          join public.ugm_preguntas p on p.ciclo_id = a.ciclo_id and p.q = a.q
          join public.ugm_respuestas r on r.ciclo_id = a.ciclo_id and r.q = a.q and r.estado in ('asignado', 'en_captura', 'devuelto')
         where a.ciclo_id = x.ciclo_id and a.usuario_id = x.usuario_id and a.vigente and a.rol in ('responsable', 'apoyo') and a.fecha_limite is not null
         order by a.fecha_limite, p.orden
         limit 12
      ) s;
    insert into public.ugm_notificaciones (ciclo_id, destinatario, plantilla, valores, clave_unica)
    values (x.ciclo_id, x.usuario_id, 'c-ugm-recordatorio',
            jsonb_build_object('lista', left(v_lista, 1500), 'cantidad', case when v_cant = 1 then '1 indicador' else v_cant || ' indicadores' end,
                               'fecha_limite', public.ugm_fecha_larga(v_primero), 'dias', public.ugm_dias_frase(v_primero - v_hoy),
                               'ruta', '/admin/rankings/green'),
            'rec:' || x.ciclo_id || ':' || x.usuario_id || ':' || v_hoy)
    on conflict (clave_unica) where clave_unica is not null do nothing
    returning id into v_id;
    if v_id is not null then v_n := v_n + 1; end if;
    v_id := null;
  end loop;
  return v_n;
end;
$$;

/** Prepara el resumen semanal para quien administra, el día configurado de cada ciclo abierto. */
create or replace function public.ugm_programar_resumen(p_hoy date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := coalesce(p_hoy, public.ugm_hoy());
  cy record;
  x record;
  v_lista text;
  v_n int := 0;
  v_id uuid;
begin
  if auth.uid() is not null and not public.ugm_es_admin() then
    raise exception 'Solo la administración del ranking prepara el resumen.' using errcode = '42501';
  end if;
  for cy in
    select c.id, cf.resumen_dia from public.ranking_cycles c join public.ugm_config cf on cf.ciclo_id = c.id
     where c.ranking = 'ui-greenmetric' and c.estado = 'abierto' and cf.resumen_semanal and cf.resumen_dia = extract(isodow from v_hoy)
  loop
    select concat_ws('; ',
             nullif(count(*) filter (where r.estado = 'sin_asignar'), 0) || ' sin asignar',
             nullif(count(*) filter (where r.estado in ('asignado', 'en_captura')), 0) || ' en captura',
             nullif(count(*) filter (where r.estado in ('enviado', 'en_revision')), 0) || ' esperando revisión',
             nullif(count(*) filter (where r.estado = 'devuelto'), 0) || ' devueltos',
             count(*) filter (where r.estado = 'aprobado') || ' aprobados de ' || count(*),
             nullif(count(*) filter (where r.publicar_web), 0) || ' publicados en la web',
             nullif((select count(*) from public.ugm_asignaciones a join public.ugm_respuestas rr on rr.ciclo_id = a.ciclo_id and rr.q = a.q and rr.estado in ('asignado', 'en_captura', 'devuelto')
                      where a.ciclo_id = cy.id and a.vigente and a.rol = 'responsable' and a.fecha_limite < v_hoy), 0) || ' con fecha vencida')
      into v_lista
      from public.ugm_respuestas r join public.ugm_preguntas p on p.ciclo_id = r.ciclo_id and p.q = r.q
     where r.ciclo_id = cy.id and not p.calculada;
    for x in select d from public.ugm_destinatarios_admin(cy.id) d loop
      insert into public.ugm_notificaciones (ciclo_id, destinatario, plantilla, valores, clave_unica)
      values (cy.id, x.d, 'c-ugm-resumen', jsonb_build_object('lista', left(v_lista, 1500), 'ruta', '/admin/rankings/green'),
              'res:' || cy.id || ':' || x.d || ':' || date_trunc('week', v_hoy::timestamp)::date)
      on conflict (clave_unica) where clave_unica is not null do nothing
      returning id into v_id;
      if v_id is not null then v_n := v_n + 1; end if;
      v_id := null;
    end loop;
  end loop;
  return v_n;
end;
$$;

/** Las dos tareas diarias en una: recordatorios y resumen. Es lo que se programa. */
create or replace function public.ugm_tareas_diarias()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.ugm_es_admin() then
    raise exception 'Solo la administración del ranking ejecuta las tareas.' using errcode = '42501';
  end if;
  return jsonb_build_object('recordatorios', public.ugm_programar_recordatorios(), 'resumen', public.ugm_programar_resumen());
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. La cola: tomar un lote, anotar el resultado, ver el estado
-- -----------------------------------------------------------------------------

/** Solo el rol de servicio (la función `correos`). Toma hasta p_limite correos y los marca «enviando». */
create or replace function public.ugm_cola_tomar(p_limite int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo la función de correos toma la cola.' using errcode = '42501';
  end if;
  -- Lo que quedó «enviando» más de 15 minutos (la función se cortó) vuelve a la cola o se da por fallido.
  update public.ugm_notificaciones set estado = case when intentos >= 3 then 'error' else 'en_cola' end,
         error = case when intentos >= 3 then 'Se cortó el envío varias veces.' else error end
   where estado = 'enviando' and created_at < now() - interval '15 minutes' and programada_para < now() - interval '15 minutes';
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from (
    select n.id from public.ugm_notificaciones n
     where n.estado = 'en_cola' and n.programada_para <= now()
     order by n.programada_para, n.created_at
     limit greatest(1, least(coalesce(p_limite, 20), 50))
     for update skip locked
  ) s;
  update public.ugm_notificaciones set estado = 'enviando', intentos = intentos + 1, programada_para = now() where id = any (v_ids);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'plantilla', n.plantilla, 'valores', n.valores, 'correo', pr.email, 'nombre', pr.full_name, 'intentos', n.intentos))
      from public.ugm_notificaciones n join public.profiles pr on pr.id = n.destinatario
     where n.id = any (v_ids) and pr.is_active
  ), '[]'::jsonb);
end;
$$;

/** Solo el rol de servicio. p_estado: enviado | error | omitido | reintentar (en 10 minutos) | liberar (vuelve a la cola sin gastar un intento). */
create or replace function public.ugm_cola_resultado(p_id uuid, p_estado text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.ugm_notificaciones;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo la función de correos anota resultados.' using errcode = '42501';
  end if;
  select * into n from public.ugm_notificaciones where id = p_id;
  if not found then return; end if;
  if p_estado = 'enviado' then
    update public.ugm_notificaciones set estado = 'enviado', enviado_at = now(), error = null where id = p_id;
  elsif p_estado = 'omitido' then
    update public.ugm_notificaciones set estado = 'omitido', error = left(p_error, 300) where id = p_id;
  elsif p_estado = 'liberar' then
    update public.ugm_notificaciones set estado = 'en_cola', intentos = greatest(n.intentos - 1, 0), programada_para = now() where id = p_id and estado = 'enviando';
  elsif p_estado = 'reintentar' and n.intentos < 3 then
    update public.ugm_notificaciones set estado = 'en_cola', programada_para = now() + interval '10 minutes', error = left(p_error, 300) where id = p_id;
  else
    update public.ugm_notificaciones set estado = 'error', error = left(p_error, 300) where id = p_id;
  end if;
end;
$$;

/** Los destinatarios que no están activos no tienen correo que tomar: se dan por omitidos. */
create or replace function public.ugm_cola_limpiar()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo el rol de servicio limpia la cola.' using errcode = '42501';
  end if;
  update public.ugm_notificaciones n set estado = 'omitido', error = 'La persona está desactivada.'
   where n.estado in ('en_cola', 'enviando') and not exists (select 1 from public.profiles pr where pr.id = n.destinatario and pr.is_active);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

/** Para el panel de la administración: conteos y últimos errores (sin el contenido de los correos). */
create or replace function public.ugm_cola_estado(p_ciclo uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.ugm_exige_admin();
  return jsonb_build_object(
    'conteo', coalesce((select jsonb_object_agg(estado, n) from (select estado, count(*)::int as n from public.ugm_notificaciones where (p_ciclo is null or ciclo_id = p_ciclo) group by estado) c), '{}'::jsonb),
    'errores', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'plantilla', n.plantilla, 'error', n.error, 'intentos', n.intentos, 'creado', n.created_at) order by n.created_at desc)
                          from (select * from public.ugm_notificaciones where estado = 'error' and (p_ciclo is null or ciclo_id = p_ciclo) order by created_at desc limit 20) n), '[]'::jsonb),
    'ultimo_envio', (select max(enviado_at) from public.ugm_notificaciones where estado = 'enviado' and (p_ciclo is null or ciclo_id = p_ciclo)));
end;
$$;

create or replace function public.ugm_cola_reintentar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ugm_exige_admin();
  update public.ugm_notificaciones set estado = 'en_cola', intentos = 0, programada_para = now(), error = null where id = p_id and estado in ('error', 'omitido');
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Permisos de ejecución
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array['ugm_programar_recordatorios(date)', 'ugm_programar_resumen(date)', 'ugm_tareas_diarias()', 'ugm_cola_estado(uuid)', 'ugm_cola_reintentar(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['ugm_cola_tomar(int)', 'ugm_cola_resultado(uuid, text, text)', 'ugm_cola_limpiar()',
                           'ugm_encolar_asignacion(uuid)', 'ugm_encolar_estado(public.ugm_respuestas, public.ugm_respuestas)',
                           'ugm_etiqueta(uuid, text)', 'ugm_destinatarios_admin(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['ugm_hoy()', 'ugm_fecha_larga(date)', 'ugm_dias_frase(int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- =============================================================================
-- CÓMO PROGRAMARLO (NO se activa en esta migración; lo decide y lo hace el usuario)
--
-- Hay dos tareas. Elija UNA de las dos formas; la cola y los recordatorios no
-- dependen de cómo se programen.
--
-- A) Con pg_cron + pg_net (si el servidor de la base las tiene; en el servidor
--    propio de Coolify hay que activar las extensiones primero):
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net with schema extensions;
--
--   -- 1. Cada día a las 7:00 de Bogotá (12:00 UTC): prepara recordatorios y resumen.
--   select cron.schedule('ugm-tareas-diarias', '0 12 * * *', $$ select public.ugm_tareas_diarias(); $$);
--
--   -- 2. Cada 5 minutos: la función `correos` vacía la cola. Hay que poner la
--   --    dirección PÚBLICA https de la función y la clave de servicio (no la red interna).
--   select cron.schedule('ugm-cola-correos', '*/5 * * * *', $$
--     select net.http_post(
--       url := 'https://<su-dominio>/functions/v1/correos',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
--       body := jsonb_build_object('action', 'ugm_cola', 'limite', 20)
--     );
--   $$);
--
--   Para quitarlas: select cron.unschedule('ugm-tareas-diarias'); select cron.unschedule('ugm-cola-correos');
--
-- B) Sin pg_cron: una tarea programada de Coolify (cron del contenedor) que cada
--    5 minutos haga
--       curl -s -X POST https://<su-dominio>/functions/v1/correos \
--            -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
--            -d '{"action":"ugm_cola","limite":20}'
--    y una vez al día
--       curl -s -X POST https://<su-dominio>/rest/v1/rpc/ugm_tareas_diarias \
--            -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
--            -H "Content-Type: application/json" -d '{}'
--
-- Sin programar nada, la cola igual avanza cuando alguien de la intranet usa el
-- botón «Enviar avisos pendientes» de la sección (acción ugm_cola con su sesión);
-- los recordatorios y el resumen sí necesitan la tarea diaria.
-- =============================================================================

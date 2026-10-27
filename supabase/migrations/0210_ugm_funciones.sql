-- =============================================================================
-- PDI · 0210 · UI GreenMetric · funciones: ciclo, asignaciones, flujo de revisión,
--              traducción, publicación, indicadores calculados y resúmenes
--
-- Requiere 0208 y 0209. Idempotente.
--
-- PORQUÉ DE CADA DECISIÓN DE SEGURIDAD
--  1. Todas son SECURITY DEFINER con search_path fijo y comprueban el papel DENTRO
--     (ugm_es_admin / ugm_rol_en). La identidad sigue siendo la de quien llama
--     (auth.uid()), así que el disparador ugm_respuestas_guardia (0208) vuelve a
--     comprobar cada transición con el mismo cuadro: dos barreras independientes.
--  2. Sin acceso anónimo (REVOKE a public y anon al final del archivo).
--  3. Asignar, abrir el ciclo, aprobar sin datos personales, publicar, marcar un
--     dato sensible: solo la administración del ranking (Planeación o más). El
--     revisor aprueba o devuelve, no publica (decisión G.7.3 del análisis).
--  4. Devolver y reabrir exigen un comentario; aprobar exige confirmar «sin datos
--     personales» y que no falte nada (campos, evidencia, traducción revisada).
--  5. El jefe de la oficina de quien responde puede REASIGNAR, pero solo a
--     personas de esa misma oficina (ugm_reasignar). No puede ver ni cambiar
--     preguntas de otras oficinas.
--  6. Las razones de indicadores calculados se recalculan en la base con las
--     fórmulas de la guía (SI4, EC4, EC8, TR4, ED1, ED2, GD1); la página pública
--     las muestra solo cuando TODOS sus datos de entrada están publicados.
--  7. Un nombre propio o una fórmula nunca se concatena en SQL dinámico: no hay
--     SQL dinámico en este archivo.
-- =============================================================================

-- Ganchos que 0213 reemplaza por la versión que encola correos.
create or replace function public.ugm_encolar_asignacion(p_asignacion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

create or replace function public.ugm_exige_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ugm_es_admin() then
    raise exception 'Solo la administración del ranking (Planeación o más) puede hacerlo.' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Ciclo
-- -----------------------------------------------------------------------------

/**
 * Crea un ciclo «edición p_anio, datos p_anio_datos» con el catálogo de la guía p_guia:
 * ranking_cycles (ranking = 'ui-greenmetric'), configuración, categorías, preguntas y una respuesta
 * vacía por pregunta. Las fechas se ajustan después en ugm_config (nada queda fijo en código).
 * Con p_copiar_de, trae las respuestas de ese ciclo como borrador «para actualizar».
 */
create or replace function public.ugm_crear_ciclo(
  p_anio int, p_anio_datos int, p_guia text default '2026', p_fecha_limite date default null, p_copiar_de uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.ugm_exige_admin();
  if not exists (select 1 from public.ugm_catalogo_base b where b.guia = p_guia) then
    raise exception 'No hay catálogo cargado para la guía «%».', p_guia using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ranking_cycles c where c.ranking = 'ui-greenmetric' and c.anio = p_anio) then
    raise exception 'Ya existe un ciclo de UI GreenMetric para la edición %.', p_anio using errcode = 'unique_violation';
  end if;
  if p_copiar_de is not null and not exists (select 1 from public.ranking_cycles c where c.id = p_copiar_de and c.ranking = 'ui-greenmetric') then
    raise exception 'El ciclo anterior no es de UI GreenMetric.' using errcode = 'P0002';
  end if;

  insert into public.ranking_cycles (ranking, anio, anio_datos, ods_priorizados, fecha_limite, estado)
  values ('ui-greenmetric', p_anio, p_anio_datos, '{}'::int[], p_fecha_limite, 'preparacion')
  returning id into v_id;

  insert into public.ugm_config (ciclo_id, guia, ciclo_anterior, updated_by) values (v_id, p_guia, p_copiar_de, auth.uid());

  insert into public.ugm_categorias (ciclo_id, categoria, numero, nombre_es, nombre_en, peso_pct, puntos_max, carpeta_nombre)
  select v_id, c.categoria, c.numero, c.nombre_es, c.nombre_en, c.peso_pct, c.puntos_max, c.carpeta_nombre
    from public.ugm_categorias_base c where c.guia = p_guia;

  insert into public.ugm_preguntas (ciclo_id, q, categoria, numero, orden, indicador, puntos, nombre_es, nombre_en, tipo, unidad, periodo,
                                    requiere_evidencia, pagina_guia, calculada, sin_guia, plantilla, carpeta_nombre, opciones, bandas, factores, esquema)
  select v_id, b.q, b.categoria, b.numero, b.orden, b.indicador, b.puntos, b.nombre_es, b.nombre_en, b.tipo, b.unidad, b.periodo,
         b.requiere_evidencia, b.pagina_guia, b.calculada, b.sin_guia, b.plantilla, b.carpeta_nombre, b.opciones, b.bandas, b.factores, b.esquema
    from public.ugm_catalogo_base b where b.guia = p_guia;

  insert into public.ugm_respuestas (ciclo_id, q) select v_id, p.q from public.ugm_preguntas p where p.ciclo_id = v_id;
  insert into public.ugm_publico_version (ciclo_id) values (v_id);

  perform public.ugm_bitacora(v_id, null, 'ciclo_creado', null, null, jsonb_build_object('anio', p_anio, 'anio_datos', p_anio_datos, 'guia', p_guia));
  if p_copiar_de is not null then
    perform public.ugm_arrastrar(v_id, p_copiar_de);
  end if;
  return v_id;
end;
$$;

/** Trae como borrador «para actualizar» lo capturado en el ciclo anterior. Nunca aprobado; la traducción hay que revisarla de nuevo. */
create or replace function public.ugm_arrastrar(p_ciclo uuid, p_anterior uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  x record;
  v_n int := 0;
begin
  perform public.ugm_exige_admin();
  for x in
    select n.id as nid, o.id as oid, o.valores, o.tablas, o.tablas_en, o.textos_es, o.textos_en, o.opcion, o.calculo
      from public.ugm_respuestas n
      join public.ugm_preguntas pn on pn.ciclo_id = n.ciclo_id and pn.q = n.q and not pn.calculada
      join public.ugm_respuestas o on o.ciclo_id = p_anterior and o.q = n.q
     where n.ciclo_id = p_ciclo and n.estado = 'sin_asignar'
       and (o.valores <> '{}'::jsonb or o.tablas <> '{}'::jsonb or o.textos_es <> '{}'::jsonb or o.opcion is not null)
  loop
    update public.ugm_respuestas
       set valores = x.valores, tablas = x.tablas, tablas_en = x.tablas_en, textos_es = x.textos_es, textos_en = x.textos_en,
           opcion = x.opcion, calculo = x.calculo, para_actualizar = true, arrastrada_de = x.oid
     where id = x.nid;
    insert into public.ugm_versiones (respuesta_id, version, snapshot, motivo)
    values (x.nid, 0, jsonb_build_object('arrastrada_de', x.oid, 'valores', x.valores, 'textos_es', x.textos_es), 'arrastre');
    v_n := v_n + 1;
  end loop;
  perform public.ugm_bitacora(p_ciclo, null, 'arrastre', null, null, jsonb_build_object('desde', p_anterior, 'respuestas', v_n));
  return v_n;
end;
$$;

/** Abre o cierra el ciclo (ranking_cycles.estado). Una respuesta no se pierde al cerrar: solo se bloquea la intención de seguir asignando. */
create or replace function public.ugm_cambiar_estado_ciclo(p_ciclo uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de text;
begin
  perform public.ugm_exige_admin();
  if p_estado not in ('preparacion', 'abierto', 'cerrado') then
    raise exception 'Estado de ciclo desconocido.' using errcode = '22023';
  end if;
  select estado into v_de from public.ranking_cycles where id = p_ciclo and ranking = 'ui-greenmetric';
  if not found then raise exception 'Ese ciclo no es de UI GreenMetric.' using errcode = 'P0002'; end if;
  update public.ranking_cycles set estado = p_estado where id = p_ciclo and ranking = 'ui-greenmetric';
  perform public.ugm_bitacora(p_ciclo, null, 'ciclo_estado', v_de, p_estado);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Personas y asignaciones
-- -----------------------------------------------------------------------------

/** Busca personas activas para asignar. La administración busca en toda la intranet; un jefe, solo entre su oficina. */
create or replace function public.ugm_personas_buscar(p_texto text, p_unidad uuid default null)
returns table (id uuid, correo text, nombre text, unidades jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.full_name,
         coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.name, 'rol', m.role::text) order by u.name)
                     from public.unit_members m join public.units u on u.id = m.unit_id where m.profile_id = p.id), '[]'::jsonb)
    from public.profiles p
   where p.is_active and char_length(btrim(coalesce(p_texto, ''))) >= 2
     and (public.ugm_es_admin()
          or exists (select 1 from public.unit_members m where m.profile_id = p.id and public.unit_role_at(m.unit_id) = 'jefe'))
     and (p_unidad is null or exists (select 1 from public.unit_members m where m.profile_id = p.id and m.unit_id = p_unidad))
     and (lower(p.full_name) like '%' || replace(replace(lower(btrim(p_texto)), '%', ''), '_', '') || '%'
          or lower(p.email) like '%' || replace(replace(lower(btrim(p_texto)), '%', ''), '_', '') || '%')
   order by p.full_name, p.email
   limit 10;
$$;

create or replace function public.ugm_asignar_interno(p_ciclo uuid, p_q text, p_usuario uuid, p_unidad uuid, p_rol text, p_fecha date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pregunta public.ugm_preguntas;
  v_unidad uuid := p_unidad;
  v_id uuid;
  v_nuevo boolean := true;
begin
  select * into v_pregunta from public.ugm_preguntas where ciclo_id = p_ciclo and q = p_q;
  if not found then raise exception 'La pregunta % no existe en este ciclo.', p_q using errcode = 'P0002'; end if;
  if v_pregunta.calculada then
    raise exception 'La pregunta % es un indicador calculado: se obtiene de otras respuestas y no se asigna.', p_q using errcode = 'check_violation';
  end if;
  if p_rol not in ('responsable', 'apoyo') then raise exception 'Rol de asignación desconocido.' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_usuario and pr.is_active) then
    raise exception 'Esa persona no existe o está desactivada.' using errcode = 'P0002';
  end if;
  -- La oficina es un dato visible: si no llega, la primera donde la persona trabaja.
  if v_unidad is null then
    select m.unit_id into v_unidad from public.unit_members m join public.units u on u.id = m.unit_id
     where m.profile_id = p_usuario order by (u.kind = 'oficina') desc, u.name limit 1;
  elsif not exists (select 1 from public.unit_members m where m.profile_id = p_usuario and m.unit_id = v_unidad) then
    raise exception 'Esa persona no pertenece a la oficina elegida.' using errcode = 'check_violation';
  end if;

  if p_rol = 'responsable' then
    select id into v_id from public.ugm_asignaciones
     where ciclo_id = p_ciclo and q = p_q and rol = 'responsable' and vigente and usuario_id = p_usuario;
    if found then
      v_nuevo := false;
      update public.ugm_asignaciones set fecha_limite = coalesce(p_fecha, fecha_limite), unidad_id = coalesce(v_unidad, unidad_id) where id = v_id;
    else
      update public.ugm_asignaciones set vigente = false, retirado_at = now()
       where ciclo_id = p_ciclo and q = p_q and rol = 'responsable' and vigente;
    end if;
  else
    select id into v_id from public.ugm_asignaciones where ciclo_id = p_ciclo and q = p_q and rol = 'apoyo' and vigente and usuario_id = p_usuario;
    if found then v_nuevo := false; end if;
  end if;

  if v_nuevo then
    insert into public.ugm_asignaciones (ciclo_id, q, usuario_id, unidad_id, rol, fecha_limite)
    values (p_ciclo, p_q, p_usuario, v_unidad, p_rol, p_fecha)
    returning id into v_id;
    perform public.ugm_bitacora(p_ciclo, (select r.id from public.ugm_respuestas r where r.ciclo_id = p_ciclo and r.q = p_q),
                                'asignacion', null, null, jsonb_build_object('q', p_q, 'rol', p_rol, 'usuario', p_usuario));
    perform public.ugm_encolar_asignacion(v_id);
  end if;
  if p_rol = 'responsable' then
    update public.ugm_respuestas set estado = 'asignado' where ciclo_id = p_ciclo and q = p_q and estado = 'sin_asignar';
  end if;
  return v_id;
end;
$$;

/** Asigna un responsable (o un apoyo) a una pregunta. Solo la administración. */
create or replace function public.ugm_asignar(
  p_ciclo uuid, p_q text, p_usuario uuid, p_unidad uuid default null, p_rol text default 'responsable', p_fecha_limite date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ugm_exige_admin();
  return public.ugm_asignar_interno(p_ciclo, p_q, p_usuario, p_unidad, p_rol, p_fecha_limite);
end;
$$;

/** Asigna a una persona todas las preguntas de una categoría que aún no tienen responsable (y no son calculadas). */
create or replace function public.ugm_asignar_categoria(p_ciclo uuid, p_categoria text, p_usuario uuid, p_unidad uuid default null, p_fecha_limite date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  x record;
  v_n int := 0;
begin
  perform public.ugm_exige_admin();
  for x in
    select p.q from public.ugm_preguntas p
     where p.ciclo_id = p_ciclo and p.categoria = p_categoria and not p.calculada
       and not exists (select 1 from public.ugm_asignaciones a where a.ciclo_id = p.ciclo_id and a.q = p.q and a.rol = 'responsable' and a.vigente)
     order by p.orden
  loop
    perform public.ugm_asignar_interno(p_ciclo, x.q, p_usuario, p_unidad, 'responsable', p_fecha_limite);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

/** Asignación masiva: [{q, usuario_id, unidad_id?, rol?, fecha_limite?}]. Todo o nada. Devuelve cuántas. */
create or replace function public.ugm_asignar_masivo(p_ciclo uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  x jsonb;
  v_n int := 0;
begin
  perform public.ugm_exige_admin();
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 then
    raise exception 'La lista de asignaciones debe ser un arreglo de hasta 300 elementos.' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(p_items) loop
    perform public.ugm_asignar_interno(
      p_ciclo, x ->> 'q', (x ->> 'usuario_id')::uuid, nullif(x ->> 'unidad_id', '')::uuid,
      coalesce(nullif(x ->> 'rol', ''), 'responsable'), nullif(x ->> 'fecha_limite', '')::date);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

/** Un revisor por categoría (el administrador es el respaldo). Reemplaza al anterior. */
create or replace function public.ugm_asignar_revisor(p_ciclo uuid, p_categoria text, p_usuario uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.ugm_exige_admin();
  if not exists (select 1 from public.ugm_categorias c where c.ciclo_id = p_ciclo and c.categoria = p_categoria) then
    raise exception 'La categoría % no existe en este ciclo.', p_categoria using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_usuario and pr.is_active) then
    raise exception 'Esa persona no existe o está desactivada.' using errcode = 'P0002';
  end if;
  select id into v_id from public.ugm_asignaciones where ciclo_id = p_ciclo and categoria = p_categoria and rol = 'revisor' and q is null and vigente and usuario_id = p_usuario;
  if found then return v_id; end if;
  update public.ugm_asignaciones set vigente = false, retirado_at = now()
   where ciclo_id = p_ciclo and categoria = p_categoria and rol = 'revisor' and q is null and vigente;
  insert into public.ugm_asignaciones (ciclo_id, categoria, usuario_id, rol) values (p_ciclo, p_categoria, p_usuario, 'revisor') returning id into v_id;
  perform public.ugm_bitacora(p_ciclo, null, 'revisor', null, null, jsonb_build_object('categoria', p_categoria, 'usuario', p_usuario));
  return v_id;
end;
$$;

/**
 * Reasigna una pregunta. La administración, a cualquier persona; el jefe de la oficina de quien responde hoy,
 * solo a personas de esa misma oficina.
 */
create or replace function public.ugm_reasignar(p_ciclo uuid, p_q text, p_usuario uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidad uuid;
begin
  if not public.ugm_es_admin() then
    select a.unidad_id into v_unidad from public.ugm_asignaciones a
     where a.ciclo_id = p_ciclo and a.q = p_q and a.rol = 'responsable' and a.vigente;
    if v_unidad is null or public.unit_role_at(v_unidad) is distinct from 'jefe' then
      raise exception 'Solo la administración o el jefe de la oficina de quien responde pueden reasignar.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.unit_members m where m.profile_id = p_usuario and m.unit_id = v_unidad) then
      raise exception 'El jefe solo puede reasignar a personas de su propia oficina.' using errcode = '42501';
    end if;
    return public.ugm_asignar_interno(p_ciclo, p_q, p_usuario, v_unidad, 'responsable', null);
  end if;
  return public.ugm_asignar_interno(p_ciclo, p_q, p_usuario, null, 'responsable', null);
end;
$$;

/** Retira una asignación. Si era la del responsable y la respuesta no había empezado, vuelve a «sin asignar». */
create or replace function public.ugm_retirar_asignacion(p_asignacion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ugm_asignaciones;
begin
  perform public.ugm_exige_admin();
  select * into a from public.ugm_asignaciones where id = p_asignacion and vigente;
  if not found then raise exception 'Esa asignación no existe o ya se retiró.' using errcode = 'P0002'; end if;
  update public.ugm_asignaciones set vigente = false, retirado_at = now() where id = p_asignacion;
  if a.rol = 'responsable' and not exists (
       select 1 from public.ugm_asignaciones x where x.ciclo_id = a.ciclo_id and x.q = a.q and x.rol = 'responsable' and x.vigente) then
    update public.ugm_respuestas set estado = 'sin_asignar' where ciclo_id = a.ciclo_id and q = a.q and estado = 'asignado';
  end if;
  perform public.ugm_bitacora(a.ciclo_id, (select r.id from public.ugm_respuestas r where r.ciclo_id = a.ciclo_id and r.q = a.q), 'asignacion_retirada', null, null,
                              jsonb_build_object('q', a.q, 'rol', a.rol, 'usuario', a.usuario_id));
end;
$$;

/** Fija el vencimiento del responsable de una pregunta, o de toda una categoría (p_q nulo). */
create or replace function public.ugm_fijar_vencimiento(p_ciclo uuid, p_fecha date, p_q text default null, p_categoria text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  perform public.ugm_exige_admin();
  update public.ugm_asignaciones a set fecha_limite = p_fecha
   where a.ciclo_id = p_ciclo and a.vigente and a.rol in ('responsable', 'apoyo')
     and (p_q is null or a.q = p_q)
     and (p_categoria is null or exists (select 1 from public.ugm_preguntas p where p.ciclo_id = a.ciclo_id and p.q = a.q and p.categoria = p_categoria));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Flujo de revisión
-- -----------------------------------------------------------------------------

create or replace function public.ugm_respuesta_o_error(p_respuesta uuid)
returns public.ugm_respuestas
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas;
begin
  select * into r from public.ugm_respuestas where id = p_respuesta;
  if not found or public.ugm_rol_en(r.ciclo_id, r.q) is null then
    raise exception 'Esa respuesta no existe o no tiene permiso para verla.' using errcode = '42501';
  end if;
  return r;
end;
$$;

/** El responsable (o la administración) envía la respuesta a revisión. El disparador comprueba que no falte nada. */
create or replace function public.ugm_enviar(p_respuesta uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas := public.ugm_respuesta_o_error(p_respuesta);
begin
  if public.ugm_rol_en(r.ciclo_id, r.q) not in ('admin', 'responsable') then
    raise exception 'Solo quien responde la pregunta (o la administración) la envía a revisión.' using errcode = '42501';
  end if;
  if r.estado not in ('en_captura', 'devuelto') then
    raise exception 'Solo se envía una respuesta en captura o devuelta (estado actual: %).', r.estado using errcode = 'check_violation';
  end if;
  update public.ugm_respuestas set estado = 'enviado' where id = p_respuesta;
end;
$$;

/** El revisor (o la administración) toma una respuesta enviada. */
create or replace function public.ugm_tomar_revision(p_respuesta uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas := public.ugm_respuesta_o_error(p_respuesta);
begin
  if public.ugm_rol_en(r.ciclo_id, r.q) not in ('admin', 'revisor') then
    raise exception 'Solo quien revisa la categoría (o la administración) toma una respuesta.' using errcode = '42501';
  end if;
  if r.estado <> 'enviado' then
    raise exception 'Solo se toma una respuesta enviada (estado actual: %).', r.estado using errcode = 'check_violation';
  end if;
  update public.ugm_respuestas set estado = 'en_revision', revisor_id = auth.uid() where id = p_respuesta;
end;
$$;

/** Devuelve la respuesta al responsable con un comentario obligatorio. */
create or replace function public.ugm_devolver(p_respuesta uuid, p_comentario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas := public.ugm_respuesta_o_error(p_respuesta);
  v_txt text := btrim(coalesce(p_comentario, ''));
begin
  if public.ugm_rol_en(r.ciclo_id, r.q) not in ('admin', 'revisor') then
    raise exception 'Solo quien revisa (o la administración) devuelve una respuesta.' using errcode = '42501';
  end if;
  if char_length(v_txt) < 10 then
    raise exception 'Explique qué hay que corregir (al menos 10 caracteres).' using errcode = 'check_violation';
  end if;
  if r.estado not in ('enviado', 'en_revision') then
    raise exception 'Solo se devuelve una respuesta enviada o en revisión (estado actual: %). Para una aprobada, la administración la reabre.', r.estado using errcode = 'check_violation';
  end if;
  insert into public.ugm_comentarios (respuesta_id, autor, tipo, texto) values (p_respuesta, auth.uid(), 'devolucion', left(v_txt, 4000));
  update public.ugm_respuestas set estado = 'devuelto', nota_revision = left(v_txt, 4000), revisor_id = auth.uid() where id = p_respuesta;
end;
$$;

/**
 * Aprueba. Exige confirmar que el texto no trae datos personales y que no falte nada (campos, evidencia y
 * traducción revisada). La aprobación NO publica: publicar lo decide la administración (ugm_publicar).
 */
create or replace function public.ugm_aprobar(p_respuesta uuid, p_sin_datos_personales boolean, p_comentario text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas := public.ugm_respuesta_o_error(p_respuesta);
  v_ev jsonb;
begin
  if public.ugm_rol_en(r.ciclo_id, r.q) not in ('admin', 'revisor') then
    raise exception 'Solo quien revisa (o la administración) aprueba una respuesta.' using errcode = '42501';
  end if;
  if p_sin_datos_personales is not true then
    raise exception 'Para aprobar, confirme que el texto no contiene datos personales (nombres, correos, documentos).' using errcode = 'check_violation';
  end if;
  if r.estado not in ('enviado', 'en_revision') then
    raise exception 'Solo se aprueba una respuesta enviada o en revisión (estado actual: %).', r.estado using errcode = 'check_violation';
  end if;
  v_ev := public.ugm_evaluar_fila(r);
  if jsonb_array_length(v_ev -> 'faltan') > 0 then
    raise exception 'No se puede aprobar: %', (select string_agg(x, '; ') from jsonb_array_elements_text(v_ev -> 'faltan') x) using errcode = 'check_violation';
  end if;
  if nullif(btrim(coalesce(p_comentario, '')), '') is not null then
    insert into public.ugm_comentarios (respuesta_id, autor, tipo, texto) values (p_respuesta, auth.uid(), 'aprobacion', left(btrim(p_comentario), 4000));
  end if;
  update public.ugm_respuestas set estado = 'aprobado', revisor_id = auth.uid(), nota_revision = nullif(left(btrim(coalesce(p_comentario, '')), 4000), '')
   where id = p_respuesta;
end;
$$;

/** La administración reabre una respuesta aprobada (vuelve a «devuelto» y sale de la web). */
create or replace function public.ugm_reabrir(p_respuesta uuid, p_comentario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas := public.ugm_respuesta_o_error(p_respuesta);
  v_txt text := btrim(coalesce(p_comentario, ''));
begin
  perform public.ugm_exige_admin();
  if r.estado <> 'aprobado' then
    raise exception 'Solo se reabre una respuesta aprobada (estado actual: %).', r.estado using errcode = 'check_violation';
  end if;
  if char_length(v_txt) < 10 then
    raise exception 'Explique por qué se reabre (al menos 10 caracteres).' using errcode = 'check_violation';
  end if;
  insert into public.ugm_comentarios (respuesta_id, autor, tipo, texto) values (p_respuesta, auth.uid(), 'devolucion', left(v_txt, 4000));
  update public.ugm_respuestas set estado = 'devuelto', nota_revision = left(v_txt, 4000) where id = p_respuesta;
end;
$$;

create or replace function public.ugm_comentar(p_respuesta uuid, p_texto text, p_campo text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas := public.ugm_respuesta_o_error(p_respuesta);
  v_id uuid;
begin
  if public.ugm_rol_en(r.ciclo_id, r.q) = 'jefe' then
    raise exception 'El jefe de la oficina consulta; no comenta la respuesta.' using errcode = '42501';
  end if;
  insert into public.ugm_comentarios (respuesta_id, autor, tipo, campo, texto)
  values (p_respuesta, auth.uid(), 'comentario', nullif(left(btrim(coalesce(p_campo, '')), 80), ''), left(btrim(coalesce(p_texto, '')), 4000))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ugm_resolver_comentario(p_comentario uuid, p_resuelto boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.ugm_comentarios;
  r public.ugm_respuestas;
begin
  select * into c from public.ugm_comentarios where id = p_comentario;
  if not found then raise exception 'Ese comentario no existe.' using errcode = 'P0002'; end if;
  r := public.ugm_respuesta_o_error(c.respuesta_id);
  if c.autor <> auth.uid() and public.ugm_rol_en(r.ciclo_id, r.q) not in ('admin', 'responsable', 'apoyo') then
    raise exception 'No puede cambiar ese comentario.' using errcode = '42501';
  end if;
  update public.ugm_comentarios set resuelto = coalesce(p_resuelto, true) where id = p_comentario;
end;
$$;

/** La administración marca (o desmarca) un dato como sensible; si estaba publicado, sale de la web. */
create or replace function public.ugm_marcar_sensible(p_respuesta uuid, p_valor boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ugm_exige_admin();
  update public.ugm_respuestas set sensible = coalesce(p_valor, false) where id = p_respuesta;
end;
$$;

/** La administración enciende o apaga «Publicar en la web». Encender comprueba todas las condiciones (el disparador también). */
create or replace function public.ugm_publicar(p_respuesta uuid, p_publicar boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ugm_exige_admin();
  if p_publicar then
    update public.ugm_respuestas set publicar_web = true where id = p_respuesta and not publicar_web;
  else
    update public.ugm_respuestas
       set publicar_web = false, retirado_at = now(), retiro_motivo = left(coalesce(nullif(btrim(p_motivo), ''), 'Retirado por la administración'), 300)
     where id = p_respuesta and publicar_web;
  end if;
  return public.ugm_publicacion_estado(p_respuesta);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Traducción
-- -----------------------------------------------------------------------------

/**
 * Guarda el inglés de uno o varios campos como BORRADOR (traducción de Pilo, escrita a mano o importada).
 * p_items: [{campo, en | filas, origen?, modelo?}]. «campo» es la clave de un campo traducible o «tabla:<clave>»
 * (entonces `filas` es la lista de filas con las columnas de texto en inglés). Anota la huella del español de ese momento.
 */
create or replace function public.ugm_guardar_traducciones(p_respuesta uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas := public.ugm_respuesta_o_error(p_respuesta);
  v_esq jsonb;
  v_ok text[];
  x jsonb;
  v_campo text;
  v_n int := 0;
  v_origen text;
begin
  if public.ugm_rol_en(r.ciclo_id, r.q) not in ('admin', 'responsable', 'apoyo') then
    raise exception 'Solo quien responde (o la administración) guarda traducciones.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 40 then
    raise exception 'La lista de traducciones debe ser un arreglo de hasta 40 elementos.' using errcode = '22023';
  end if;
  select esquema into v_esq from public.ugm_preguntas where ciclo_id = r.ciclo_id and q = r.q;
  v_ok := public.ugm_campos_traducibles(v_esq);
  -- 1) el inglés en la respuesta
  for x in select * from jsonb_array_elements(p_items) loop
    v_campo := x ->> 'campo';
    if v_campo is null or not (v_campo = any (v_ok)) then
      raise exception 'El campo «%» no se traduce en esta pregunta.', coalesce(v_campo, '') using errcode = 'check_violation';
    end if;
    if v_campo like 'tabla:%' then
      if jsonb_typeof(x -> 'filas') <> 'array' or octet_length((x -> 'filas')::text) > 200000 then
        raise exception 'Las filas traducidas de «%» no son válidas.', v_campo using errcode = '22023';
      end if;
      r.tablas_en := jsonb_set(r.tablas_en, array[substr(v_campo, 7)], x -> 'filas', true);
    else
      if jsonb_typeof(x -> 'en') <> 'string' or char_length(x ->> 'en') > 20000 then
        raise exception 'El inglés de «%» no es válido (texto de hasta 20 000 caracteres).', v_campo using errcode = '22023';
      end if;
      r.textos_en := jsonb_set(r.textos_en, array[v_campo], to_jsonb(btrim(x ->> 'en')), true);
    end if;
  end loop;
  update public.ugm_respuestas set textos_en = r.textos_en, tablas_en = r.tablas_en where id = p_respuesta;
  -- 2) el estado de cada traducción: borrador, con la huella del español y del inglés de ahora
  for x in select * from jsonb_array_elements(p_items) loop
    v_campo := x ->> 'campo';
    v_origen := case when x ->> 'origen' in ('pilo', 'humano', 'importacion') then x ->> 'origen' else 'pilo' end;
    insert into public.ugm_traducciones (respuesta_id, campo, origen, modelo, estado, hash_es, hash_en, revisor, revisado_at)
    values (p_respuesta, v_campo, v_origen, left(x ->> 'modelo', 80), 'borrador',
            public.ugm_huella(public.ugm_texto_es(r, v_campo, v_esq)), public.ugm_huella(public.ugm_texto_en(r, v_campo, v_esq)), null, null)
    on conflict (respuesta_id, campo) do update
      set origen = excluded.origen, modelo = excluded.modelo, estado = 'borrador',
          hash_es = excluded.hash_es, hash_en = excluded.hash_en, revisor = null, revisado_at = null;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

/**
 * Marca como REVISADA la traducción de los campos indicados (o de todos los que tengan inglés). Queda quién
 * y cuándo. Vale solo mientras no cambie el español ni el inglés (huellas). Quien responde la marca antes de
 * enviar; quien revisa puede marcarla antes de aprobar.
 */
create or replace function public.ugm_marcar_traduccion_revisada(p_respuesta uuid, p_campos text[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas := public.ugm_respuesta_o_error(p_respuesta);
  v_rol text := public.ugm_rol_en(r.ciclo_id, r.q);
  v_esq jsonb;
  k text;
  es text;
  en text;
  v_n int := 0;
begin
  if v_rol not in ('admin', 'revisor', 'responsable', 'apoyo') then
    raise exception 'No puede marcar la traducción de esta pregunta.' using errcode = '42501';
  end if;
  if v_rol in ('responsable', 'apoyo') and r.estado not in ('asignado', 'en_captura', 'devuelto') then
    raise exception 'La respuesta ya no está abierta.' using errcode = '42501';
  end if;
  select esquema into v_esq from public.ugm_preguntas where ciclo_id = r.ciclo_id and q = r.q;
  foreach k in array coalesce(p_campos, public.ugm_campos_traducibles(v_esq)) loop
    if not (k = any (public.ugm_campos_traducibles(v_esq))) then continue; end if;
    es := public.ugm_texto_es(r, k, v_esq);
    en := public.ugm_texto_en(r, k, v_esq);
    if es = '' or en = '' then continue; end if;
    insert into public.ugm_traducciones (respuesta_id, campo, origen, estado, hash_es, hash_en, revisor, revisado_at)
    values (p_respuesta, k, 'humano', 'revisada', public.ugm_huella(es), public.ugm_huella(en), auth.uid(), now())
    on conflict (respuesta_id, campo) do update
      set estado = 'revisada', hash_es = excluded.hash_es, hash_en = excluded.hash_en, revisor = auth.uid(), revisado_at = now();
    v_n := v_n + 1;
  end loop;
  perform public.ugm_bitacora(r.ciclo_id, p_respuesta, 'traduccion_revisada', null, null, jsonb_build_object('q', r.q, 'campos', v_n));
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Indicadores calculados (SI4, EC4, EC8, TR4, ED1, ED2, GD1)
-- -----------------------------------------------------------------------------

/** Banda 1–5 de un valor según {sentido, cortes}: asc (x<=c0 → 1 … >c3 → 5) o desc (x>=c0 → 1 … <c3 → 5). */
create or replace function public.ugm_banda(p_valor numeric, p_bandas jsonb)
returns int
language plpgsql
immutable
set search_path = public
as $$
declare
  c numeric[];
begin
  if p_valor is null or p_bandas is null or jsonb_typeof(p_bandas -> 'cortes') <> 'array' then return null; end if;
  select array_agg(x::numeric order by ord) into c from jsonb_array_elements_text(p_bandas -> 'cortes') with ordinality t(x, ord);
  if cardinality(c) <> 4 then return null; end if;
  if p_bandas ->> 'sentido' = 'desc' then
    return case when p_valor >= c[1] then 1 when p_valor > c[2] then 2 when p_valor > c[3] then 3 when p_valor > c[4] then 4 else 5 end;
  end if;
  return case when p_valor <= c[1] then 1 when p_valor <= c[2] then 2 when p_valor <= c[3] then 3 when p_valor <= c[4] then 4 else 5 end;
end;
$$;

/** Un dato numérico de otra pregunta (con los campos conectados a tablas resueltos). «promedio» = promedio de y1–y3. */
create or replace function public.ugm_dato(p_ciclo uuid, p_q text, p_campo text default 'valor')
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas;
  v jsonb;
  v_prom numeric;
begin
  select * into r from public.ugm_respuestas where ciclo_id = p_ciclo and q = p_q;
  if not found then return null; end if;
  v := public.ugm_valores_efectivos_fila(r);
  if p_campo = 'promedio' then
    select avg((v ->> k)::numeric) into v_prom from unnest(array['y1', 'y2', 'y3']) k where jsonb_typeof(v -> k) = 'number';
    return v_prom;
  end if;
  if jsonb_typeof(v -> p_campo) = 'number' then return (v ->> p_campo)::numeric; end if;
  return null;
end;
$$;

/**
 * Los siete indicadores calculados con la fórmula de la guía:
 *   SI4 = (1.5 − 1.6) ÷ (1.11 + 1.13)   EC4 = 2.6 ÷ población   EC8 = 2.11 ÷ población   TR4 = 5.10 ÷ población
 *   ED1 = 6.1 ÷ 6.2 × 100               ED2 = prom(6.5) ÷ prom(6.6) × 100              GD1 = prom(7.2) ÷ prom(7.1) × 100
 * (población = 1.11 + 1.13; los estudiantes en línea 1.12 no cuentan.)
 * Devuelve [{q, indicador, unidad, valor, opcion, entradas:[q...], faltan:[q...], sin_publicar:[q...], publicable}].
 * `opcion` es la banda 1–5 (USO INTERNO). `publicable` = todas las entradas existen y están publicadas.
 */
create or replace function public.ugm_calculados_interno(p_ciclo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  v_ent text[];
  v_val numeric;
  v_faltan text[];
  v_sinpub text[];
  v_pop numeric;
  v_out jsonb := '[]'::jsonb;
  e text;
begin
  v_pop := case when public.ugm_dato(p_ciclo, '1.11') is null or public.ugm_dato(p_ciclo, '1.13') is null then null
                else public.ugm_dato(p_ciclo, '1.11') + public.ugm_dato(p_ciclo, '1.13') end;
  for p in select q, indicador, unidad, bandas from public.ugm_preguntas where ciclo_id = p_ciclo and calculada order by orden loop
    v_val := null;
    v_ent := case p.indicador
      when 'SI4' then array['1.5', '1.6', '1.11', '1.13']
      when 'EC4' then array['2.6', '1.11', '1.13']
      when 'EC8' then array['2.11', '1.11', '1.13']
      when 'TR4' then array['5.10', '1.11', '1.13']
      when 'ED1' then array['6.1', '6.2']
      when 'ED2' then array['6.5', '6.6']
      when 'GD1' then array['7.1', '7.2']
      else '{}'::text[] end;
    v_val := case p.indicador
      when 'SI4' then case when v_pop > 0 and public.ugm_dato(p_ciclo, '1.5') is not null and public.ugm_dato(p_ciclo, '1.6') is not null
                           then (public.ugm_dato(p_ciclo, '1.5') - public.ugm_dato(p_ciclo, '1.6')) / v_pop end
      when 'EC4' then case when v_pop > 0 and public.ugm_dato(p_ciclo, '2.6') is not null then public.ugm_dato(p_ciclo, '2.6') / v_pop end
      when 'EC8' then case when v_pop > 0 and public.ugm_dato(p_ciclo, '2.11') is not null then public.ugm_dato(p_ciclo, '2.11') / v_pop end
      when 'TR4' then case when v_pop > 0 and public.ugm_dato(p_ciclo, '5.10') is not null then public.ugm_dato(p_ciclo, '5.10') / v_pop end
      when 'ED1' then case when coalesce(public.ugm_dato(p_ciclo, '6.2'), 0) > 0 and public.ugm_dato(p_ciclo, '6.1') is not null
                           then public.ugm_dato(p_ciclo, '6.1') / public.ugm_dato(p_ciclo, '6.2') * 100 end
      when 'ED2' then case when coalesce(public.ugm_dato(p_ciclo, '6.6', 'promedio'), 0) > 0 and public.ugm_dato(p_ciclo, '6.5', 'promedio') is not null
                           then public.ugm_dato(p_ciclo, '6.5', 'promedio') / public.ugm_dato(p_ciclo, '6.6', 'promedio') * 100 end
      when 'GD1' then case when coalesce(public.ugm_dato(p_ciclo, '7.1', 'promedio'), 0) > 0 and public.ugm_dato(p_ciclo, '7.2', 'promedio') is not null
                           then public.ugm_dato(p_ciclo, '7.2', 'promedio') / public.ugm_dato(p_ciclo, '7.1', 'promedio') * 100 end
      else null end;
    v_faltan := '{}'; v_sinpub := '{}';
    foreach e in array v_ent loop
      if not exists (
        select 1 from public.ugm_respuestas r where r.ciclo_id = p_ciclo and r.q = e
          and (jsonb_typeof(public.ugm_valores_efectivos_fila(r) -> 'valor') = 'number'
               or jsonb_typeof(public.ugm_valores_efectivos_fila(r) -> 'y1') = 'number')
      ) then v_faltan := v_faltan || e; end if;
      if not exists (select 1 from public.ugm_respuestas r where r.ciclo_id = p_ciclo and r.q = e and r.publicar_web) then v_sinpub := v_sinpub || e; end if;
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'q', p.q, 'indicador', p.indicador, 'unidad', p.unidad,
      'valor', case when v_val is null then null else round(v_val, 6) end,
      'opcion', public.ugm_banda(v_val, p.bandas),
      'entradas', to_jsonb(v_ent), 'faltan', to_jsonb(v_faltan), 'sin_publicar', to_jsonb(v_sinpub),
      'publicable', v_val is not null and cardinality(v_sinpub) = 0));
  end loop;
  return v_out;
end;
$$;

/** Los indicadores calculados, para quien participa en el ciclo (la web pública usa ugm_calculados_interno desde 0212). */
create or replace function public.ugm_calculados(p_ciclo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ugm_participa(p_ciclo) then
    raise exception 'No tiene acceso a este ciclo.' using errcode = '42501';
  end if;
  return public.ugm_calculados_interno(p_ciclo);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Resúmenes e historial del motor de plantillas
-- -----------------------------------------------------------------------------

/** Conteos por categoría y estado (la administración ve todo el ciclo; los demás, lo suyo por RLS). */
create or replace function public.ugm_resumen_ciclo(p_ciclo uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'estado', estado, 'n', n, 'publicadas', pub) order by categoria, estado), '[]'::jsonb)
    from (
      select p.categoria, r.estado, count(*)::int as n, count(*) filter (where r.publicar_web)::int as pub
        from public.ugm_respuestas r join public.ugm_preguntas p on p.ciclo_id = r.ciclo_id and p.q = r.q
       where r.ciclo_id = p_ciclo and not p.calculada
       group by p.categoria, r.estado
    ) x;
$$;

create or replace function public.ugm_registrar_exportacion(p_ciclo uuid, p_alcance text, p_q text, p_categoria text, p_hash text, p_manifiesto jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.ugm_exige_admin();
  insert into public.ugm_exportaciones (ciclo_id, alcance, q, categoria, hash, manifiesto)
  values (p_ciclo, p_alcance, p_q, p_categoria, left(p_hash, 80), coalesce(p_manifiesto, '{}'::jsonb))
  returning id into v_id;
  perform public.ugm_bitacora(p_ciclo, null, 'exportacion', null, null, jsonb_build_object('alcance', p_alcance, 'q', p_q, 'categoria', p_categoria));
  return v_id;
end;
$$;

/** Anota el análisis de una plantilla diligenciada. La administración, o quien responde esa pregunta. */
create or replace function public.ugm_registrar_importacion(p_ciclo uuid, p_archivo text, p_hash text, p_q text, p_resultado jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resp uuid;
  v_id uuid;
begin
  select id into v_resp from public.ugm_respuestas where ciclo_id = p_ciclo and q = p_q;
  if v_resp is not null and coalesce(public.ugm_rol_en(p_ciclo, p_q), 'ninguno') not in ('admin', 'responsable', 'apoyo') then
    raise exception 'Solo quien responde esa pregunta (o la administración) importa una plantilla.' using errcode = '42501';
  end if;
  if v_resp is null then perform public.ugm_exige_admin(); end if;
  insert into public.ugm_importaciones (ciclo_id, respuesta_id, archivo, hash, q_detectada, resultado)
  values (p_ciclo, v_resp, left(p_archivo, 200), left(p_hash, 80), p_q, coalesce(p_resultado, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

/** Marca una importación como aplicada o descartada; al aplicar guarda una versión de la respuesta. */
create or replace function public.ugm_cerrar_importacion(p_importacion uuid, p_aplicada boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.ugm_importaciones;
  r public.ugm_respuestas;
begin
  select * into i from public.ugm_importaciones where id = p_importacion;
  if not found or (i.creado_por is distinct from auth.uid() and not public.ugm_es_admin()) then
    raise exception 'Esa importación no existe o no es suya.' using errcode = '42501';
  end if;
  update public.ugm_importaciones
     set estado = case when p_aplicada then 'aplicado' else 'descartado' end,
         aplicado_por = case when p_aplicada then auth.uid() else null end
   where id = p_importacion;
  if p_aplicada and i.respuesta_id is not null then
    select * into r from public.ugm_respuestas where id = i.respuesta_id;
    insert into public.ugm_versiones (respuesta_id, version, snapshot, autor, motivo)
    values (r.id, r.version,
            jsonb_build_object('estado', r.estado, 'valores', r.valores, 'tablas', r.tablas, 'tablas_en', r.tablas_en, 'textos_es', r.textos_es, 'textos_en', r.textos_en, 'opcion', r.opcion, 'importacion', i.archivo),
            auth.uid(), 'importacion');
    perform public.ugm_bitacora(r.ciclo_id, r.id, 'importacion', null, null, jsonb_build_object('q', r.q, 'archivo', i.archivo));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Permisos de ejecución
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'ugm_exige_admin()', 'ugm_crear_ciclo(int, int, text, date, uuid)', 'ugm_arrastrar(uuid, uuid)', 'ugm_cambiar_estado_ciclo(uuid, text)',
    'ugm_personas_buscar(text, uuid)', 'ugm_asignar(uuid, text, uuid, uuid, text, date)', 'ugm_asignar_categoria(uuid, text, uuid, uuid, date)',
    'ugm_asignar_masivo(uuid, jsonb)', 'ugm_asignar_revisor(uuid, text, uuid)', 'ugm_reasignar(uuid, text, uuid)',
    'ugm_retirar_asignacion(uuid)', 'ugm_fijar_vencimiento(uuid, date, text, text)', 'ugm_respuesta_o_error(uuid)',
    'ugm_enviar(uuid)', 'ugm_tomar_revision(uuid)', 'ugm_devolver(uuid, text)', 'ugm_aprobar(uuid, boolean, text)', 'ugm_reabrir(uuid, text)',
    'ugm_comentar(uuid, text, text)', 'ugm_resolver_comentario(uuid, boolean)', 'ugm_marcar_sensible(uuid, boolean)', 'ugm_publicar(uuid, boolean, text)',
    'ugm_guardar_traducciones(uuid, jsonb)', 'ugm_marcar_traduccion_revisada(uuid, text[])', 'ugm_banda(numeric, jsonb)',
    'ugm_dato(uuid, text, text)', 'ugm_calculados(uuid)', 'ugm_resumen_ciclo(uuid)', 'ugm_registrar_exportacion(uuid, text, text, text, text, jsonb)',
    'ugm_registrar_importacion(uuid, text, text, text, jsonb)', 'ugm_cerrar_importacion(uuid, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Internas: las llaman otras funciones, no la API.
  foreach f in array array['ugm_asignar_interno(uuid, text, uuid, uuid, text, date)', 'ugm_encolar_asignacion(uuid)', 'ugm_calculados_interno(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

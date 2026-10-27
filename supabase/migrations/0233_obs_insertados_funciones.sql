-- =============================================================================
-- PDI · 0233 · Observatorio de Analítica: funciones de insertados
--
-- Dos grupos:
--
--  A. ADMINISTRACIÓN (rol authenticated; comprueban panel, nivel y alcance de
--     0231 dentro de la función, porque corren SECURITY DEFINER):
--       obs_dominio_proponer · obs_dominio_decidir · obs_dominio_retirar
--       obs_insertado_guardar · obs_insertado_estado · obs_insertado_duplicar
--       obs_observatorio_crear · obs_observatorio_archivar
--     Reglas de nivel (panel «Insertar y publicar», obs_insertar):
--       editar       crea, edita, pausa, reactiva y duplica insertados; propone dominios.
--       administrar  además aprueba o rechaza dominios externos, retira dominios
--                    y REVOCA insertados (quien creó un insertado también puede
--                    revocar el suyo). Revocar es definitivo: para volver se duplica.
--     Crear y archivar observatorios: «administrar» en el panel Observatorios
--     (obs_observatorios), con alcance sobre todos para crear.
--
--  B. LECTURA PÚBLICA (anon + authenticated): obs_publico_insertado(). Es lo
--     que llama /obs-embed desde la página de otra persona. Defensa por capas:
--       1. el insertado debe existir, estar activo y no vencido;
--       2. su observatorio debe estar PUBLICADO (al despublicar: «sin publicar»,
--          nunca el último dato);
--       3. el dominio de origen que declara el marco debe estar en la lista
--          (udes.edu.co automático; lo externo, aprobado). OJO: el origen lo
--          declara el navegador de quien llama; esta función NO puede
--          comprobarlo. Es una barrera contra el uso casual y para las
--          métricas, no contra alguien que fabrique la petición a mano. Lo
--          que protege de verdad es la capa 5;
--       4. si tiene clave, debe coincidir (no es un secreto, ver 0232);
--       5. SOLO se devuelve lo que ya es público: temas, tablas y visores
--          PUBLICADOS, con la reserva «< 5» aplicada aquí en la base (mínimo 5
--          aunque la tabla se haya guardado con otro umbral) y sin las columnas
--          marcadas como dato personal. No existe camino a borradores, a filas
--          individuales ni a datos personales;
--       6. límite de 600 lecturas por minuto y por insertado.
--     Las vistas se cuentan por insertado, dominio y día. Nada más.
--     Quien tiene el panel puede probar sin contar: p_origen = '@vista-previa'.
--
-- Requiere 0230, 0231 y 0232. Idempotente.
-- =============================================================================

-- 1. Auxiliares ------------------------------------------------------------------------

-- El host de un origen o una dirección («https://Sitio.edu.co:8443/x» → sitio.edu.co); null si no es válido.
create or replace function public.obs_host_de(p_origen text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := lower(btrim(coalesce(p_origen, '')));
begin
  if v = '' or char_length(v) > 400 then
    return null;
  end if;
  v := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '');
  v := split_part(split_part(split_part(v, '/', 1), '?', 1), '#', 1);
  v := regexp_replace(v, '^.*@', '');
  v := regexp_replace(v, ':[0-9]{1,5}$', '');
  v := regexp_replace(v, '\.$', '');
  if v = 'localhost' or v ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    return v;
  end if;
  return null;
end;
$$;

create or replace function public.obs_es_udes(p_host text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_host = 'udes.edu.co' or p_host like '%.udes.edu.co';
$$;

-- ¿Puede este host mostrar insertados de este observatorio?
create or replace function public.obs_dominio_permitido(p_obs uuid, p_host text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_host is not null and (
    public.obs_es_udes(p_host)
    or exists (
      select 1 from public.obs_dominios d
       where d.observatorio_id = p_obs
         and d.estado = 'aprobado'
         and (
           d.host = p_host
           or (d.host like '*.%' and right(p_host, char_length(d.host) - 1) = right(d.host, char_length(d.host) - 1))
         )
    )
  );
$$;

-- Valida las opciones de un insertado y las devuelve normalizadas (con v = 1).
-- Se rechaza lo desconocido: el jsonb no es un cajón de sastre.
create or replace function public.obs_validar_opciones(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  k       text;
  v       jsonb;
  fk      text;
  fv      jsonb;
  res     jsonb := '{"v":1,"aspecto":"claro","lang":"es","titulo":true,"fuente":true,"barra":true,"csv":true,"enlace":true,"altura":"auto","f":{}}'::jsonb;
  nfiltros integer := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Las opciones del insertado deben ser un objeto.' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p) loop
    case k
      when 'v' then
        if v <> '1'::jsonb then raise exception 'Versión de opciones no admitida.' using errcode = '22023'; end if;
      when 'aspecto' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('claro', 'oscuro', 'auto') then
          raise exception 'El aspecto debe ser claro, oscuro o auto.' using errcode = '22023';
        end if;
        res := res || jsonb_build_object('aspecto', v);
      when 'lang' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('es', 'en', 'pt') then
          raise exception 'El idioma debe ser es, en o pt.' using errcode = '22023';
        end if;
        res := res || jsonb_build_object('lang', v);
      when 'titulo', 'fuente', 'barra', 'csv', 'enlace', 'filtrable', 'resaltar', 'cruzado', 'tips' then
        -- filtrable, resaltar, cruzado y tips: huecos para la fase de tableros y filtro cruzado.
        if jsonb_typeof(v) <> 'boolean' then
          raise exception 'La opción % debe ser verdadero o falso.', k using errcode = '22023';
        end if;
        res := res || jsonb_build_object(k, v);
      when 'altura' then
        if jsonb_typeof(v) = 'string' and (v #>> '{}') = 'auto' then
          res := res || jsonb_build_object('altura', v);
        elsif jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric) and (v #>> '{}')::numeric between 120 and 2000 then
          res := res || jsonb_build_object('altura', v);
        else
          raise exception 'La altura es «auto» o un número entero entre 120 y 2000.' using errcode = '22023';
        end if;
      when 'f' then
        if jsonb_typeof(v) <> 'object' then
          raise exception 'Los filtros deben ser un objeto.' using errcode = '22023';
        end if;
        for fk, fv in select * from jsonb_each(v) loop
          nfiltros := nfiltros + 1;
          if nfiltros > 8 or fk !~ '^[a-z][a-z0-9_]{0,23}$' or jsonb_typeof(fv) <> 'string' or char_length(fv #>> '{}') > 80 then
            raise exception 'Filtro no válido (hasta 8, nombre en minúsculas y valor de hasta 80 caracteres).' using errcode = '22023';
          end if;
        end loop;
        res := res || jsonb_build_object('f', v);
      else
        raise exception 'Opción desconocida: %.', left(k, 40) using errcode = '22023';
    end case;
  end loop;
  return res;
end;
$$;

-- La clave guardada: SHA-256 con sal (el código del insertado). No es un secreto, ver 0232.
create or replace function public.obs_hash_clave(p_codigo text, p_clave text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(p_codigo || ':' || p_clave, 'UTF8')), 'hex');
$$;

-- 2. Dominios --------------------------------------------------------------------------

create or replace function public.obs_dominio_proponer(p_obs uuid, p_host text, p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host text := public.obs_host_de(regexp_replace(lower(btrim(coalesce(p_host, ''))), '^\*\.', ''));
  v_comodin boolean := lower(btrim(coalesce(p_host, ''))) like '*.%';
  v_final text;
  fila public.obs_dominios;
begin
  if not public.obs_puede('obs_insertar', p_obs, 'editar') then
    raise exception 'No tiene permiso para proponer dominios en este observatorio.' using errcode = 'insufficient_privilege';
  end if;
  -- Una persona asignada como responsable puede tener retirada la facultad de proponer.
  if exists (select 1 from public.obs_responsables r where r.observatorio_id = p_obs and r.persona_id = auth.uid() and not r.propone_dominios)
     and not public.obs_todos() then
    raise exception 'Esta persona no puede proponer dominios en este observatorio.' using errcode = 'insufficient_privilege';
  end if;
  if v_host is null then
    raise exception 'El dominio no es válido. Escriba solo el nombre, por ejemplo www.ejemplo.org o *.ejemplo.org.' using errcode = '22023';
  end if;
  v_final := case when v_comodin then '*.' || v_host else v_host end;
  select * into fila from public.obs_dominios where observatorio_id = p_obs and host = v_final;
  if found then
    -- Un dominio rechazado puede volver a proponerse; los demás estados no cambian.
    if fila.estado = 'rechazado' then
      update public.obs_dominios
         set estado = case when public.obs_es_udes(v_host) then 'aprobado' else 'propuesto' end,
             automatico = public.obs_es_udes(v_host), propuesto_por = auth.uid(), propuesto_en = now(),
             decidido_por = null, decidido_en = null, nota = left(coalesce(p_nota, ''), 300)
       where id = fila.id returning * into fila;
    end if;
    return to_jsonb(fila);
  end if;
  insert into public.obs_dominios (observatorio_id, host, estado, automatico, nota, propuesto_por, decidido_en)
  values (p_obs, v_final,
          case when public.obs_es_udes(v_host) then 'aprobado' else 'propuesto' end,
          public.obs_es_udes(v_host), left(coalesce(p_nota, ''), 300), auth.uid(),
          case when public.obs_es_udes(v_host) then now() end)
  returning * into fila;
  return to_jsonb(fila);
end;
$$;

create or replace function public.obs_dominio_decidir(p_id uuid, p_aprobar boolean, p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fila public.obs_dominios;
begin
  select * into fila from public.obs_dominios where id = p_id for update;
  if not found then
    raise exception 'El dominio no existe.' using errcode = 'no_data_found';
  end if;
  if not public.obs_puede('obs_insertar', fila.observatorio_id, 'administrar') then
    raise exception 'Aprobar o rechazar dominios pide el nivel Administrar.' using errcode = 'insufficient_privilege';
  end if;
  update public.obs_dominios
     set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
         automatico = false, decidido_por = auth.uid(), decidido_en = now(),
         nota = case when coalesce(p_nota, '') = '' then nota else left(p_nota, 300) end
   where id = p_id returning * into fila;
  return to_jsonb(fila);
end;
$$;

create or replace function public.obs_dominio_retirar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obs uuid;
begin
  select observatorio_id into v_obs from public.obs_dominios where id = p_id;
  if v_obs is null then
    return;
  end if;
  if not public.obs_puede('obs_insertar', v_obs, 'administrar') then
    raise exception 'Retirar un dominio pide el nivel Administrar.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.obs_dominios where id = p_id;
end;
$$;

-- 3. Insertados ------------------------------------------------------------------------

create or replace function public.obs_insertado_guardar(
  p_id uuid,
  p_obs uuid,
  p_nombre text,
  p_tipo text,
  p_tema text,
  p_seccion text,
  p_visor uuid,
  p_opciones jsonb,
  p_clave text default null,
  p_quitar_clave boolean default false,
  p_vence timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fila     public.obs_insertados;
  v_opc    jsonb;
  v_tema   text := p_tema;
begin
  if not public.obs_puede('obs_insertar', p_obs, 'editar') then
    raise exception 'No tiene permiso para crear o editar insertados en este observatorio.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo not in ('portada', 'tema', 'seccion', 'visor') then
    raise exception 'Tipo de insertado no válido.' using errcode = '22023';
  end if;
  if p_clave is not null and (char_length(p_clave) < 4 or char_length(p_clave) > 64) then
    raise exception 'La clave debe tener entre 4 y 64 caracteres.' using errcode = '22023';
  end if;
  v_opc := public.obs_validar_opciones(coalesce(p_opciones, '{"v":1}'::jsonb));

  -- El destino debe ser de ESTE observatorio.
  if p_tipo = 'portada' then
    v_tema := null;
  elsif p_tipo in ('tema', 'seccion') then
    if not exists (select 1 from public.obs_topics t where t.slug = p_tema and t.observatorio_id = p_obs) then
      raise exception 'El tema no existe en este observatorio.' using errcode = '22023';
    end if;
  else
    select v.topic into v_tema from public.obs_views v where v.id = p_visor and v.observatorio_id = p_obs;
    if v_tema is null then
      raise exception 'El visor no existe en este observatorio.' using errcode = '22023';
    end if;
  end if;

  if p_id is null then
    insert into public.obs_insertados (observatorio_id, nombre, tipo, tema_slug, seccion, visor_id, opciones, vence_en)
    values (p_obs, btrim(p_nombre), p_tipo, v_tema,
            case when p_tipo = 'seccion' then p_seccion end,
            case when p_tipo = 'visor' then p_visor end,
            v_opc, p_vence)
    returning * into fila;
    if p_clave is not null then
      update public.obs_insertados set clave_hash = public.obs_hash_clave(codigo, p_clave) where id = fila.id returning * into fila;
    end if;
  else
    select * into fila from public.obs_insertados where id = p_id for update;
    if not found then
      raise exception 'El insertado no existe.' using errcode = 'no_data_found';
    end if;
    if fila.observatorio_id <> p_obs then
      raise exception 'Un insertado no cambia de observatorio.' using errcode = '22023';
    end if;
    if fila.estado = 'revocado' then
      raise exception 'Un insertado revocado no se edita: duplíquelo para crear otro.' using errcode = '22023';
    end if;
    update public.obs_insertados
       set nombre = btrim(p_nombre), tipo = p_tipo, tema_slug = v_tema,
           seccion = case when p_tipo = 'seccion' then p_seccion end,
           visor_id = case when p_tipo = 'visor' then p_visor end,
           opciones = v_opc, vence_en = p_vence, version = version + 1,
           clave_hash = case
             when p_quitar_clave then null
             when p_clave is not null then public.obs_hash_clave(codigo, p_clave)
             else clave_hash end
     where id = p_id returning * into fila;
  end if;
  return to_jsonb(fila) - 'clave_hash';
end;
$$;

create or replace function public.obs_insertado_estado(p_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fila public.obs_insertados;
begin
  if p_estado not in ('activo', 'pausado', 'revocado') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  select * into fila from public.obs_insertados where id = p_id for update;
  if not found then
    raise exception 'El insertado no existe.' using errcode = 'no_data_found';
  end if;
  if fila.estado = 'revocado' then
    raise exception 'Un insertado revocado no vuelve: duplíquelo para crear otro.' using errcode = '22023';
  end if;
  if p_estado = 'revocado' then
    if not (public.obs_puede('obs_insertar', fila.observatorio_id, 'administrar')
            or (fila.creado_por = auth.uid() and public.obs_puede('obs_insertar', fila.observatorio_id, 'editar'))) then
      raise exception 'Revocar un insertado pide el nivel Administrar (o haberlo creado).' using errcode = 'insufficient_privilege';
    end if;
  elsif not public.obs_puede('obs_insertar', fila.observatorio_id, 'editar') then
    raise exception 'No tiene permiso para pausar o reactivar insertados en este observatorio.' using errcode = 'insufficient_privilege';
  end if;
  update public.obs_insertados
     set estado = p_estado, version = version + 1,
         revocado_por = case when p_estado = 'revocado' then auth.uid() end,
         revocado_en = case when p_estado = 'revocado' then now() end
   where id = p_id returning * into fila;
  return to_jsonb(fila) - 'clave_hash';
end;
$$;

-- Copia con otro código. La clave NO se copia (su hash lleva la sal del código original).
create or replace function public.obs_insertado_duplicar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o    public.obs_insertados;
  fila public.obs_insertados;
begin
  select * into o from public.obs_insertados where id = p_id;
  if not found then
    raise exception 'El insertado no existe.' using errcode = 'no_data_found';
  end if;
  if not public.obs_puede('obs_insertar', o.observatorio_id, 'editar') then
    raise exception 'No tiene permiso para duplicar insertados en este observatorio.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.obs_insertados (observatorio_id, nombre, tipo, tema_slug, seccion, visor_id, opciones, vence_en)
  values (o.observatorio_id, left(o.nombre, 112) || ' (copia)', o.tipo, o.tema_slug, o.seccion, o.visor_id, o.opciones, o.vence_en)
  returning * into fila;
  return to_jsonb(fila) - 'clave_hash';
end;
$$;

-- 4. Observatorios ---------------------------------------------------------------------

create or replace function public.obs_observatorio_crear(
  p_nombre text,
  p_slug text,
  p_descripcion text default '',
  p_color text default 'var(--od-line-1)',
  p_icono text default 'spark-chart',
  p_responsable text default '',
  p_plantilla uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fila public.obs_observatorios;
begin
  if not (public.obs_puede('obs_observatorios', null, 'administrar') and public.obs_todos()) then
    raise exception 'Crear observatorios pide el nivel Administrar sobre todos los observatorios.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.obs_observatorios (nombre, slug, descripcion, color, icono, responsable, plantilla_origen, estado)
  values (btrim(p_nombre), lower(btrim(p_slug)), coalesce(p_descripcion, ''), coalesce(p_color, 'var(--od-line-1)'),
          coalesce(p_icono, 'spark-chart'), coalesce(p_responsable, ''), p_plantilla, 'borrador')
  returning * into fila;
  -- La plantilla aporta las líneas (nombre, orden y color). Los temas no se copian: su enlace es único en todo el portal.
  if p_plantilla is not null then
    insert into public.obs_lineas (observatorio_id, nombre, orden, numero, color)
    select fila.id, l.nombre, l.orden, l.numero, l.color from public.obs_lineas l where l.observatorio_id = p_plantilla;
  end if;
  return to_jsonb(fila);
end;
$$;

create or replace function public.obs_observatorio_archivar(p_id uuid, p_archivar boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fila public.obs_observatorios;
begin
  if not public.obs_puede('obs_observatorios', p_id, 'administrar') then
    raise exception 'Archivar un observatorio pide el nivel Administrar.' using errcode = 'insufficient_privilege';
  end if;
  select * into fila from public.obs_observatorios where id = p_id for update;
  if not found then
    raise exception 'El observatorio no existe.' using errcode = 'no_data_found';
  end if;
  if fila.principal and p_archivar then
    raise exception 'El observatorio principal no se archiva.' using errcode = '22023';
  end if;
  -- Archivar lo saca de lo público: sus insertados pasan a mostrar «sin publicar».
  update public.obs_observatorios set estado = case when p_archivar then 'archivado' else 'borrador' end
   where id = p_id returning * into fila;
  return to_jsonb(fila);
end;
$$;

-- 5. Lectura pública -------------------------------------------------------------------

-- Una tabla como la ve el público: sin columnas de datos personales y con la reserva «< 5» aplicada.
create or replace function public.obs_dataset_publico(d public.obs_datasets)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_umbral  integer := 5;
  v_quitar  text[] := '{}';
  v_cifras  text[];
  v_cols    jsonb;
  v_rows    jsonb;
begin
  -- El umbral nunca baja de 5 en la lectura pública, aunque la tabla se guardara con otro.
  if jsonb_typeof(d.anonymization -> 'threshold') = 'number' then
    v_umbral := greatest(5, floor((d.anonymization ->> 'threshold')::numeric)::integer);
  end if;
  if jsonb_typeof(d.anonymization -> 'sensitive') = 'array' then
    select coalesce(array_agg(x), '{}') into v_quitar from jsonb_array_elements_text(d.anonymization -> 'sensitive') x;
  end if;

  select coalesce(jsonb_agg(c order by o), '[]'::jsonb) into v_cols
    from jsonb_array_elements(d.columns) with ordinality as t(c, o)
   where not (c ->> 'key' = any (v_quitar) or c ->> 'label' = any (v_quitar));

  -- Las cifras enteras de una tabla que no es de tasas ni de modelo son conteos: entre 1 y 4, se reservan.
  if d.data_type in ('tasa', 'modelo') then
    v_cifras := '{}';
  else
    select coalesce(array_agg(c ->> 'key'), '{}') into v_cifras
      from jsonb_array_elements(v_cols) c
     where c ->> 'kind' = 'cifra' and coalesce(c ->> 'format', '') = 'entero';
  end if;

  select coalesce(jsonb_agg(
           jsonb_set(r, '{cells}', coalesce((
             select jsonb_object_agg(
                      e.key,
                      case
                        when e.key = any (v_cifras) and jsonb_typeof(e.value) = 'number'
                             and (e.value #>> '{}')::numeric >= 1 and (e.value #>> '{}')::numeric < v_umbral
                        then to_jsonb('< 5'::text)
                        else e.value
                      end)
               from jsonb_each(case when jsonb_typeof(r -> 'cells') = 'object' then r -> 'cells' else '{}'::jsonb end) e
              where not (e.key = any (v_quitar))
           ), '{}'::jsonb))
           order by o), '[]'::jsonb) into v_rows
    from jsonb_array_elements(d.rows) with ordinality as t(r, o)
   where jsonb_typeof(r) = 'object';

  return jsonb_build_object(
    'id', d.id, 'topic', d.topic, 'title', d.title, 'description', d.description, 'source', d.source,
    'data_type', d.data_type, 'temporality', d.temporality, 'period_label', d.period_label,
    'columns', v_cols, 'rows', v_rows,
    'anonymization', case when d.anonymization is null then null else jsonb_build_object(
        'fileName', '', 'sourceRows', 0, 'sourceColumns', 0, 'removed', '[]'::jsonb,
        'groupedBy', coalesce(d.anonymization -> 'groupedBy', '[]'::jsonb),
        'reservedCells', coalesce(d.anonymization -> 'reservedCells', '0'::jsonb),
        'threshold', v_umbral, 'at', coalesce(d.anonymization ->> 'at', '')) end,
    'is_sample', d.is_sample, 'status', d.status, 'position', d.position, 'updated_at', d.updated_at);
end;
$$;

-- El contenido de un insertado, ya publicable. Nulo si no hay nada publicado que mostrar.
create or replace function public.obs_publico_contenido(ins public.obs_insertados)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t         public.obs_topics;
  v_vistas  jsonb;
  v_sets    jsonb;
  v_lineas  jsonb;
  v_temas   jsonb;
begin
  if ins.tipo = 'portada' then
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'nombre', l.nombre, 'orden', l.orden, 'numero', l.numero, 'color', l.color) order by l.orden), '[]'::jsonb)
      into v_lineas from public.obs_lineas l where l.observatorio_id = ins.observatorio_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'slug', x.slug, 'codigo', x.codigo, 'nombre', x.nombre, 'resumen', x.resumen, 'pregunta', x.pregunta,
             'linea_id', x.linea_id, 'orden', x.orden) order by x.orden, x.slug), '[]'::jsonb)
      into v_temas
      from public.obs_topics x
     where x.observatorio_id = ins.observatorio_id and x.status = 'publicado' and not x.archivado;
    return jsonb_build_object('lineas', v_lineas, 'temas', v_temas);
  end if;

  if ins.tipo = 'visor' then
    select x.* into t from public.obs_topics x
      join public.obs_views v on v.topic = x.slug
     where v.id = ins.visor_id and x.observatorio_id = ins.observatorio_id and x.status = 'publicado' and not x.archivado;
  else
    select x.* into t from public.obs_topics x
     where x.slug = ins.tema_slug and x.observatorio_id = ins.observatorio_id and x.status = 'publicado' and not x.archivado;
  end if;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', v.id, 'dataset_id', v.dataset_id, 'topic', v.topic, 'spec', v.spec,
                              'section', v.section, 'size', v.size, 'visible', v.visible, 'position', v.position)
           order by v.position), '[]'::jsonb)
    into v_vistas
    from public.obs_views v
    join public.obs_datasets d on d.id = v.dataset_id
   where v.topic = t.slug and v.visible and d.status = 'publicado' and d.observatorio_id = ins.observatorio_id
     and (ins.tipo <> 'seccion' or v.section = ins.seccion)
     and (ins.tipo <> 'visor' or v.id = ins.visor_id);
  if jsonb_array_length(v_vistas) = 0 then
    return null;
  end if;

  select coalesce(jsonb_agg(public.obs_dataset_publico(d) order by d.position), '[]'::jsonb)
    into v_sets
    from public.obs_datasets d
   where d.status = 'publicado'
     and d.id in (select (e ->> 'dataset_id')::uuid from jsonb_array_elements(v_vistas) e);

  return jsonb_build_object(
    'tema', jsonb_build_object('slug', t.slug, 'codigo', t.codigo, 'nombre', t.nombre, 'resumen', t.resumen,
                               'pregunta', t.pregunta, 'template', t.template, 'intro', t.intro, 'sections', t.sections),
    'vistas', v_vistas, 'datasets', v_sets);
end;
$$;

create or replace function public.obs_publico_insertado(
  p_id text,
  p_clave text default null,
  p_origen text default null,
  p_medir boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ins      public.obs_insertados;
  o        public.obs_observatorios;
  v_host   text;
  v_previa boolean := false;
  v_n      integer;
  v_cont   jsonb;
begin
  if p_id is null or p_id !~ '^[a-z0-9]{6,32}$' then
    return jsonb_build_object('estado', 'no_existe');
  end if;
  select * into ins from public.obs_insertados where codigo = p_id;
  if not found then
    return jsonb_build_object('estado', 'no_existe');
  end if;
  -- Revocado y pausado: se avisa, sin ningún dato.
  if ins.estado = 'revocado' then return jsonb_build_object('estado', 'revocado'); end if;
  if ins.estado = 'pausado' then return jsonb_build_object('estado', 'pausado'); end if;
  if ins.vence_en is not null and ins.vence_en <= now() then return jsonb_build_object('estado', 'vencido'); end if;

  select * into o from public.obs_observatorios where id = ins.observatorio_id;
  v_previa := coalesce(p_origen = '@vista-previa', false) and public.obs_tiene_panel('obs_insertar', ins.observatorio_id);

  if not v_previa then
    -- Capa 3: dominio declarado contra la lista. Sin dominio válido no se sirve nada.
    v_host := public.obs_host_de(p_origen);
    if not public.obs_dominio_permitido(ins.observatorio_id, v_host) then
      return jsonb_build_object('estado', 'dominio');
    end if;
    -- Capa 4: la clave (si la tiene).
    if ins.clave_hash is not null
       and (p_clave is null or public.obs_hash_clave(ins.codigo, p_clave) <> ins.clave_hash) then
      return jsonb_build_object('estado', 'clave');
    end if;
    -- Capa 6: límite por insertado y minuto.
    insert into public.obs_limite as l (insertado_id, minuto, n)
    values (ins.id, date_trunc('minute', now()), 1)
    on conflict (insertado_id, minuto) do update set n = l.n + 1
    returning n into v_n;
    if v_n > 600 then
      return jsonb_build_object('estado', 'limite');
    end if;
    if random() < 0.01 then
      delete from public.obs_limite where minuto < now() - interval '1 hour';
    end if;
  end if;

  -- Capa 2: el observatorio debe estar publicado. Al despublicar, nunca el último dato.
  if o.estado <> 'publicado' then
    return jsonb_build_object('estado', 'sin_publicar');
  end if;

  -- Capa 5: solo lo publicado y agregado.
  v_cont := public.obs_publico_contenido(ins);
  if v_cont is null then
    return jsonb_build_object('estado', 'sin_publicar');
  end if;

  if p_medir and not v_previa then
    insert into public.obs_metricas as m (insertado_id, observatorio_id, dominio, dia, vistas)
    values (ins.id, ins.observatorio_id, v_host, current_date, 1)
    on conflict (insertado_id, dominio, dia) do update set vistas = m.vistas + 1;
  end if;

  return jsonb_build_object(
    'estado', 'ok',
    'insertado', jsonb_build_object('codigo', ins.codigo, 'nombre', ins.nombre, 'tipo', ins.tipo, 'seccion', ins.seccion,
                                    'opciones', ins.opciones, 'version', ins.version),
    'observatorio', jsonb_build_object('nombre', o.nombre, 'slug', o.slug, 'color', o.color, 'icono', o.icono,
                                       'descripcion', o.descripcion, 'principal', o.principal),
    'contenido', v_cont,
    'servido_en', now());
end;
$$;

comment on function public.obs_publico_insertado(text, text, text, boolean) is
  'Observatorio (0233): lectura pública de un insertado. Valida estado, vencimiento, dominio declarado, clave y límite; devuelve solo lo publicado y agregado, con la reserva «< 5» aplicada aquí.';

-- 6. Permisos de ejecución -------------------------------------------------------------

revoke all on function public.obs_dataset_publico(public.obs_datasets) from public, anon, authenticated;
revoke all on function public.obs_publico_contenido(public.obs_insertados) from public, anon, authenticated;
revoke all on function public.obs_dominio_permitido(uuid, text) from public, anon, authenticated;

grant execute on function public.obs_publico_insertado(text, text, text, boolean) to anon, authenticated;
grant execute on function public.obs_host_de(text), public.obs_es_udes(text), public.obs_validar_opciones(jsonb) to authenticated;
grant execute on function
  public.obs_dominio_proponer(uuid, text, text),
  public.obs_dominio_decidir(uuid, boolean, text),
  public.obs_dominio_retirar(uuid),
  public.obs_insertado_guardar(uuid, uuid, text, text, text, text, uuid, jsonb, text, boolean, timestamptz),
  public.obs_insertado_estado(uuid, text),
  public.obs_insertado_duplicar(uuid),
  public.obs_observatorio_crear(text, text, text, text, text, text, uuid),
  public.obs_observatorio_archivar(uuid, boolean)
  to authenticated;
revoke execute on function public.obs_hash_clave(text, text) from public, anon, authenticated;

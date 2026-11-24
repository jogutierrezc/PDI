-- =============================================================================
-- PDI · 0239 · THE Impact · carpetas y evidencias en UDrive (unidad «Datos de Sostenibilidad»)
--
-- Requiere 0187, 0191, 0202, 0211 (usa ugm_asegurar_carpeta), 0237 y 0238. Idempotente.
--
-- Las evidencias de THE Impact que se suben desde esta sección viven como archivos de
-- UDrive en la carpeta de su indicador:
--   Datos de Sostenibilidad › THE Impact › Edición <año> › ODS nn · <nombre> › <indicador>
-- `thi_evidencias` las referencia por id (drive_archivos.id): no hay copia. Las
-- evidencias que ya estaban en ranking_evidence (bucket «ranking-evidencias», 0149) se
-- quedan donde están y el reporte las sigue contando; ninguna se mueve.
--
-- LOS DOS FALLOS DE UI GREENMETRIC QUE ESTE MODELO NO REPITE
--  1. «La carpeta de la pregunta aún no existe» (corregido en 0235 para UI Green). Aquí
--     la carpeta del indicador se crea SIEMPRE bajo demanda (`thi_carpeta_indicador`)
--     al reservar una subida: toda la cadena (raíz, edición, ODS, indicador) se asegura
--     en ese momento. `thi_crear_carpetas` solo adelanta el trabajo para los ODS
--     priorizados; ningún indicador, pida o no evidencia, queda sin carpeta posible.
--     Los errores de negocio son check_violation (400 con mensaje), no P0002 (500).
--  2. «malformed array literal» al registrar (corregido en 0236). Los avisos que se
--     agregan a un text[] llevan ::text (`v_avisos := v_avisos || 'texto'::text`).
--
-- PERMISOS DE UDRIVE (misma solución estrecha de 0211, ver su cabecera)
--  El papel en UDrive es por unidad, así que NO se da papel «Crea» a quien responde:
--   1. thi_reservar_evidencia (definer) comprueba que la persona pueda editar esa
--      respuesta (ranking_respuesta_abierta: Planeación siempre; editor o jefe de la
--      oficina mientras la respuesta no esté enviada ni aprobada), el tipo de archivo,
--      el tamaño y la cuota, y reserva una ruta exacta válida por 2 horas.
--   2. Una política ADITIVA de storage.objects deja subir SOLO a esa ruta.
--   3. thi_registrar_evidencia (definer) comprueba el objeto en Storage con su tamaño
--      real, crea el drive_archivos en la carpeta del indicador y lo vincula.
--   4. Una política ADITIVA de lectura deja ver el binario a quien ve la respuesta.
--  Si el rol que aplica la migración no es dueño de storage.objects, la migración avisa
--  con un WARNING y dice qué crear a mano (igual que 0211).
--
-- QUÉ EXIGE THE (Apéndice 2 de la metodología 2027 v1.1) Y CÓMO SE APLICA
--  · Formatos: .doc, .pdf, Excel, .gif, .jpeg, .png. NO se aceptan .rar, .txt ni .zip,
--    ni videos ni audios. Aquí: pdf, doc, docx, xls, xlsx, gif, jpg, jpeg, png.
--    (UI Green admite csv y txt; THE no, por eso esta lista es más corta.)
--  · Tamaño: el documento no fija un tope. Se usa 15 MB, el mismo de ranking_evidence.
--  · Un archivo adjunto se califica como NO público aunque su contenido lo sea: por eso
--    se avisa al subirlo y se prefiere el enlace público (thi_agregar_enlace, que se
--    marca pública porque el enlace lo es por definición).
--  · Una sola evidencia por indicador: no se bloquea, se avisa al agregar la segunda.
--  · Si solo una parte del documento sirve, se indica en la nota (hasta 400 caracteres).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Requisito de un indicador y conteo de evidencias
-- -----------------------------------------------------------------------------

/** El requisito de un indicador (una opción «4.3.1/2» usa el de su indicador). Nulo si la metodología no lo trae. */
create or replace function public.thi_requisito(p_ciclo uuid, p_indicador text)
returns public.thi_requisitos
language sql
stable
security definer
set search_path = public
as $$
  select r.* from public.thi_requisitos r
   where r.metodologia = coalesce((select c.metodologia from public.thi_config c where c.ciclo_id = p_ciclo), 'the-2027')
     and r.indicador = split_part(p_indicador, '/', 1)
   limit 1;
$$;

/** Evidencias de una respuesta: las de UDrive, las del bucket de 0149 (sin las notas del Excel) y las que le enlazaron. */
create or replace function public.thi_n_evidencias(p_respuesta uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.thi_evidencias e where e.respuesta_id = p_respuesta)::int
       + (select count(*) from public.ranking_evidence e where e.response_id = p_respuesta and e.kind <> 'nota')::int
       + (select count(*) from public.ranking_evidence_links l where l.response_id = p_respuesta)::int;
$$;

/** ¿La metodología exige evidencia a esta respuesta? Sí si el indicador la pide y la universidad dice que lo hace (sí/no = sí). */
create or replace function public.thi_evidencia_exigida(p_respuesta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select rq.evidencia = 'obligatoria' and r.si_no is true
      from public.ranking_responses r
      left join lateral public.thi_requisito(r.ciclo, r.indicador) rq on true
     where r.id = p_respuesta
  ), false);
$$;

/** Conteo por respuesta del ciclo, para las listas (sin una consulta por fila). Solo respuestas que la persona puede ver. */
create or replace function public.thi_conteo_evidencias(p_ciclo uuid)
returns table (respuesta_id uuid, en_udrive int, en_bucket int, publicas int)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         (select count(*) from public.thi_evidencias e where e.respuesta_id = r.id)::int,
         ((select count(*) from public.ranking_evidence e where e.response_id = r.id and e.kind <> 'nota')
          + (select count(*) from public.ranking_evidence_links l where l.response_id = r.id))::int,
         ((select count(*) from public.thi_evidencias e where e.respuesta_id = r.id and e.publica)
          + (select count(*) from public.ranking_evidence e where e.response_id = r.id and e.kind <> 'nota' and e.publica))::int
    from public.ranking_responses r
   where r.ciclo = p_ciclo and public.ranking_respuesta_visible(r.id);
$$;

-- -----------------------------------------------------------------------------
-- 2. Carpetas: bajo demanda y por adelantado
-- -----------------------------------------------------------------------------

/** Nombre de carpeta seguro: sin barras, sin saltos de línea, con tope de largo. */
create or replace function public.thi_nombre_carpeta(p_texto text, p_largo int default 60)
returns text
language sql
immutable
set search_path = public
as $$
  select left(btrim(regexp_replace(regexp_replace(coalesce(p_texto, ''), '[/\\]', '-', 'g'), '\s+', ' ', 'g')), p_largo);
$$;

/** Guarda en thi_carpetas la carpeta de una clave si no está viva ya registrada, y devuelve su id. */
create or replace function public.thi_carpeta_clave(p_ciclo uuid, p_clave text, p_padre uuid, p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select tc.carpeta_id into v_id from public.thi_carpetas tc
   join public.drive_carpetas c on c.id = tc.carpeta_id and c.borrado_en is null
   where tc.ciclo_id = p_ciclo and tc.clave = p_clave;
  if v_id is not null then return v_id; end if;
  v_id := public.ugm_asegurar_carpeta(p_padre, p_nombre);
  insert into public.thi_carpetas (ciclo_id, clave, carpeta_id) values (p_ciclo, p_clave, v_id)
  on conflict (ciclo_id, clave) do update set carpeta_id = excluded.carpeta_id, updated_at = now();
  return v_id;
end;
$$;

/** Raíz de la edición: Datos de Sostenibilidad › THE Impact › Edición <año>. Guarda unidad y carpeta en thi_config. */
create or replace function public.thi_carpeta_edicion(p_ciclo uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidad public.drive_unidades;
  v_anio int;
  v_the uuid;
  v_ed uuid;
begin
  select anio into v_anio from public.ranking_cycles where id = p_ciclo and ranking = 'the-impact';
  if not found then raise exception 'Ese ciclo no es de THE Impact.' using errcode = 'check_violation'; end if;
  select * into v_unidad from public.drive_unidades u
   where u.lectura_abierta and lower(btrim(u.nombre)) = 'datos de sostenibilidad' and u.archivada_en is null limit 1;
  if not found or v_unidad.carpeta_raiz is null then
    raise exception 'No se encontró la unidad «Datos de Sostenibilidad» de UDrive (migración 0202).' using errcode = 'check_violation';
  end if;
  -- La carpeta «THE Impact» se comparte entre ediciones: se busca por nombre bajo la raíz de la unidad.
  v_the := public.ugm_asegurar_carpeta(v_unidad.carpeta_raiz, 'THE Impact');
  v_ed := public.thi_carpeta_clave(p_ciclo, 'raiz', v_the, 'Edición ' || v_anio);
  insert into public.thi_config (ciclo_id) values (p_ciclo) on conflict (ciclo_id) do nothing;
  update public.thi_config set unidad_id = v_unidad.id, carpeta_raiz = v_ed where ciclo_id = p_ciclo and (unidad_id is distinct from v_unidad.id or carpeta_raiz is distinct from v_ed);
  return v_ed;
end;
$$;

/** Carpeta de un ODS dentro de la edición. */
create or replace function public.thi_carpeta_ods(p_ciclo uuid, p_ods int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ed uuid := public.thi_carpeta_edicion(p_ciclo);
begin
  if p_ods is null or p_ods not between 1 and 17 then raise exception 'ODS desconocido.' using errcode = 'check_violation'; end if;
  return public.thi_carpeta_clave(p_ciclo, 'ods-' || p_ods, v_ed, 'ODS ' || lpad(p_ods::text, 2, '0') || ' · ' || public.thi_ods_nombre(p_ods));
end;
$$;

/**
 * Carpeta de un indicador (toda la cadena, creada si falta). Una opción «4.3.1/2» usa la de su indicador «4.3.1».
 * Sirve para cualquier indicador del catálogo, pida o no evidencia: es lo que evita el error «la carpeta aún no existe».
 */
create or replace function public.thi_carpeta_indicador(p_ciclo uuid, p_indicador text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text := split_part(coalesce(p_indicador, ''), '/', 1);
  v_ods int;
  v_titulo text;
  v_carpeta_ods uuid;
begin
  if v_base !~ '^[0-9]{1,2}(\.[0-9]{1,2}){1,3}$' then
    raise exception 'El indicador «%» no tiene un código válido de THE.', p_indicador using errcode = 'check_violation';
  end if;
  select i.ods, i.texto_es into v_ods, v_titulo from public.ranking_indicators i where i.ciclo = p_ciclo and i.id = v_base;
  if not found then
    v_ods := split_part(v_base, '.', 1)::int;
    v_titulo := null;
  end if;
  select coalesce(nullif(btrim(rq.titulo), ''), v_titulo) into v_titulo from (select 1) x left join lateral public.thi_requisito(p_ciclo, v_base) rq on true;
  v_carpeta_ods := public.thi_carpeta_ods(p_ciclo, v_ods);
  return public.thi_carpeta_clave(p_ciclo, v_base, v_carpeta_ods, v_base || coalesce(' · ' || nullif(public.thi_nombre_carpeta(v_titulo, 70), ''), ''));
end;
$$;

/**
 * Crea por adelantado las carpetas del ciclo: la edición, los ODS que se responden (priorizados o con catálogo) y, en los
 * priorizados, un indicador por carpeta cuando la metodología le pide evidencia o respaldo. Idempotente. Solo la administración.
 * Lo que no se cree aquí se crea cuando alguien sube su primera evidencia.
 */
create or replace function public.thi_crear_carpetas(p_ciclo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ed uuid;
  v_ods int[];
  o int;
  i record;
  v_n_ods int := 0;
  v_n_ind int := 0;
begin
  perform public.thi_exige_admin();
  select ods_priorizados into v_ods from public.ranking_cycles where id = p_ciclo and ranking = 'the-impact';
  if not found then raise exception 'Ese ciclo no es de THE Impact.' using errcode = 'check_violation'; end if;
  v_ed := public.thi_carpeta_edicion(p_ciclo);
  for o in
    select distinct x from unnest(coalesce(v_ods, '{}'::int[]) || coalesce((select array_agg(distinct ri.ods::int) from public.ranking_indicators ri where ri.ciclo = p_ciclo), '{}'::int[])) x order by x
  loop
    perform public.thi_carpeta_ods(p_ciclo, o);
    v_n_ods := v_n_ods + 1;
  end loop;
  for i in
    select ri.id from public.ranking_indicators ri
     left join lateral public.thi_requisito(p_ciclo, ri.id) rq on true
     where ri.ciclo = p_ciclo and ri.nivel = 'indicator' and ri.ods = any (coalesce(v_ods, '{}'::int[]))
       and coalesce(rq.evidencia, 'respaldo') <> 'no_aplica'
     order by ri.ods, ri.orden
  loop
    perform public.thi_carpeta_indicador(p_ciclo, i.id);
    v_n_ind := v_n_ind + 1;
  end loop;
  perform public.thi_bitacora(p_ciclo, null, 'carpetas', null, null, jsonb_build_object('ods', v_n_ods, 'indicadores', v_n_ind, 'edicion', v_ed));
  return jsonb_build_object('carpeta_edicion', v_ed, 'ods', v_n_ods, 'indicadores', v_n_ind,
                            'unidad_id', (select unidad_id from public.thi_config where ciclo_id = p_ciclo));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Subida de archivos: reservar → subir → registrar
-- -----------------------------------------------------------------------------

/** ¿Puede esta persona agregar o quitar evidencias de la respuesta? Planeación siempre; editor o jefe de la oficina con la respuesta abierta. */
create or replace function public.thi_puede_evidenciar(p_respuesta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ranking_respuesta_abierta(p_respuesta);
$$;

/** Reserva la ruta de una subida. Devuelve {reserva_id, bucket, ruta, vence, aviso, carpeta_id}. */
create or replace function public.thi_reservar_evidencia(p_respuesta uuid, p_nombre text, p_mime text default null, p_tamano bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ranking_responses;
  v_carpeta uuid;
  v_unidad uuid;
  v_id uuid := gen_random_uuid();
  v_ruta text;
  v_ext text;
  v_cuota bigint;
  v_uso bigint;
  v_avisos text[] := '{}';
begin
  if auth.uid() is null then raise exception 'Falta la sesión.' using errcode = '42501'; end if;
  select * into r from public.ranking_responses where id = p_respuesta;
  if not found or not public.thi_puede_evidenciar(p_respuesta) then
    raise exception 'No puede agregar evidencias a esta respuesta (debe editar la oficina con la respuesta abierta, o ser Planeación).' using errcode = '42501';
  end if;
  if p_nombre is null or p_nombre !~ '^[A-Za-z0-9._-]{1,150}$' then
    raise exception 'El nombre del archivo solo puede llevar letras, números, punto, guion y guion bajo (máximo 150).' using errcode = 'check_violation';
  end if;
  v_ext := lower(substring(p_nombre from '\.([A-Za-z0-9]{1,5})$'));
  if v_ext is null or v_ext not in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'gif', 'jpg', 'jpeg', 'png') then
    raise exception 'THE solo acepta PDF, Word, Excel, GIF, JPG y PNG como archivo de evidencia (no .zip, .rar ni .txt; tampoco video ni audio). Para una página web, agregue el enlace.' using errcode = 'check_violation';
  end if;
  if coalesce(p_tamano, 0) <= 0 or p_tamano > 15728640 then
    raise exception 'El archivo debe pesar entre 1 byte y 15 MB.' using errcode = 'check_violation';
  end if;
  -- La carpeta del indicador se crea aquí si falta (0235 en UI GreenMetric obligó a esto después del hecho).
  v_carpeta := public.thi_carpeta_indicador(r.ciclo, r.indicador);
  select unidad_id into v_unidad from public.drive_carpetas where id = v_carpeta and borrado_en is null;
  if v_unidad is null then raise exception 'La carpeta del indicador no está disponible.' using errcode = 'check_violation'; end if;
  select cuota_bytes into v_cuota from public.drive_unidades where id = v_unidad;
  select coalesce(sum(tamano), 0) into v_uso from public.drive_archivos where unidad_id = v_unidad;
  if v_uso + p_tamano > coalesce(v_cuota, 0) then
    raise exception 'La unidad Datos de Sostenibilidad llegó a su cuota de almacenamiento. Pida a quien la administra una ampliación.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.thi_evidencia_reservas x where x.usuario_id = auth.uid() and not x.usada and x.expira_at > now()) >= 20 then
    raise exception 'Tiene demasiadas subidas pendientes. Espere a que terminen o venzan.' using errcode = 'check_violation';
  end if;
  v_ruta := 'unidades/' || v_unidad::text || '/' || v_id::text || '/' || p_nombre;
  insert into public.thi_evidencia_reservas (id, respuesta_id, usuario_id, carpeta_id, unidad_id, nombre, ruta, mime, tamano, expira_at)
  values (v_id, p_respuesta, auth.uid(), v_carpeta, v_unidad, p_nombre, v_ruta, left(p_mime, 120), p_tamano, now() + interval '2 hours');
  v_avisos := v_avisos || 'THE califica un archivo adjunto como no público, aunque su contenido lo sea. Si existe una página pública, agregue también el enlace.'::text;
  if public.thi_n_evidencias(p_respuesta) >= 1 then
    v_avisos := v_avisos || 'THE evalúa una sola evidencia por indicador: elija la mejor y no use documentos con muchos enlaces.'::text;
  end if;
  return jsonb_build_object('reserva_id', v_id, 'bucket', 'udrive', 'ruta', v_ruta, 'vence', now() + interval '2 hours',
                            'aviso', array_to_string(v_avisos, ' '), 'carpeta_id', v_carpeta);
end;
$$;

/** Registra la evidencia ya subida a la ruta reservada. Devuelve {evidencia_id, archivo_id, avisos[]}. */
create or replace function public.thi_registrar_evidencia(p_reserva uuid, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rs public.thi_evidencia_reservas;
  r public.ranking_responses;
  v_obj record;
  v_ext text;
  v_avisos text[] := '{}';
  v_ev uuid;
begin
  select * into rs from public.thi_evidencia_reservas where id = p_reserva;
  if not found or rs.usuario_id is distinct from auth.uid() then
    raise exception 'Esa subida no existe o no es suya.' using errcode = '42501';
  end if;
  if rs.usada then raise exception 'Esa subida ya se registró.' using errcode = 'check_violation'; end if;
  if rs.expira_at < now() then raise exception 'La reserva venció: vuelva a subir el archivo.' using errcode = 'check_violation'; end if;
  select * into r from public.ranking_responses where id = rs.respuesta_id;
  if not found or not public.thi_puede_evidenciar(rs.respuesta_id) then
    raise exception 'Ya no puede agregar evidencias a esta respuesta.' using errcode = '42501';
  end if;
  select o.name, (o.metadata ->> 'size')::bigint as tamano, o.metadata ->> 'mimetype' as mime into v_obj
    from storage.objects o where o.bucket_id = 'udrive' and o.name = rs.ruta;
  if not found then
    raise exception 'El archivo todavía no está en el almacenamiento. Termine la subida y vuelva a intentar.' using errcode = 'check_violation';
  end if;
  if coalesce(v_obj.tamano, 0) <= 0 or v_obj.tamano > 15728640 then
    raise exception 'El archivo subido pesa % bytes; el máximo es 15 MB.', coalesce(v_obj.tamano, 0) using errcode = 'check_violation';
  end if;
  v_ext := lower(substring(rs.nombre from '\.([A-Za-z0-9]{1,5})$'));
  if exists (select 1 from public.drive_archivos a where a.carpeta_id = rs.carpeta_id and lower(a.nombre) = lower(rs.nombre) and a.borrado_en is null) then
    raise exception 'Ya hay un archivo con el nombre «%» en la carpeta del indicador. Cambie el nombre y suba de nuevo.', rs.nombre using errcode = 'unique_violation';
  end if;
  insert into public.drive_archivos (id, carpeta_id, tipo, nombre, mime, tamano, ruta_storage, estado, creada_por)
  values (rs.id, rs.carpeta_id, 'archivo', rs.nombre, coalesce(v_obj.mime, rs.mime), v_obj.tamano, rs.ruta, 'listo', rs.usuario_id);
  insert into public.thi_evidencias (respuesta_id, archivo_id, nota, orden, publica, creada_por)
  values (rs.respuesta_id, rs.id, nullif(btrim(left(coalesce(p_nota, ''), 400)), ''),
          coalesce((select max(e.orden) + 1 from public.thi_evidencias e where e.respuesta_id = rs.respuesta_id), 0), false, auth.uid())
  returning id into v_ev;
  update public.thi_evidencia_reservas set usada = true where id = p_reserva;
  -- Cada aviso lleva ::text: con un literal sin tipo, PostgreSQL lo lee como arreglo (el fallo de UI GreenMetric, 0236).
  v_avisos := v_avisos || 'Archivo adjunto: THE lo califica como no público.'::text;
  if v_ext in ('doc', 'docx', 'xls', 'xlsx') then
    v_avisos := v_avisos || 'Si solo una parte del documento sirve, indíquela en la nota: THE no revisa el documento entero.'::text;
  end if;
  perform public.thi_bitacora(r.ciclo, r.id, 'evidencia_agregada', null, null, jsonb_build_object('indicador', r.indicador, 'archivo', rs.id, 'bytes', v_obj.tamano), r.indicador);
  return jsonb_build_object('evidencia_id', v_ev, 'archivo_id', rs.id, 'avisos', to_jsonb(v_avisos));
end;
$$;

/** Agrega un enlace público https como evidencia (lo preferido por THE: cuenta como público). */
create or replace function public.thi_agregar_enlace(p_respuesta uuid, p_url text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := btrim(coalesce(p_url, ''));
  v_host text;
  v_ev uuid;
  r public.ranking_responses;
  v_avisos text[] := '{}';
begin
  if not public.thi_puede_evidenciar(p_respuesta) then
    raise exception 'No puede agregar evidencias a esta respuesta.' using errcode = '42501';
  end if;
  select * into r from public.ranking_responses where id = p_respuesta;
  if v_url !~ '^https://[^[:space:]]{3,490}$' then
    raise exception 'El enlace debe empezar por https:// y no llevar espacios. THE pide que sea de acceso público.' using errcode = 'check_violation';
  end if;
  v_host := lower(substring(v_url from '^https://([^/:?#]+)'));
  if v_host is null or v_host !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'
     or v_host ~ '^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)' then
    raise exception 'El enlace debe apuntar a un sitio público con dominio (no a una dirección interna).' using errcode = 'check_violation';
  end if;
  if public.thi_n_evidencias(p_respuesta) >= 1 then
    v_avisos := v_avisos || 'THE evalúa una sola evidencia por indicador: elija la mejor.'::text;
  end if;
  v_avisos := v_avisos || 'La página debe seguir pública hasta el inicio del siguiente ciclo de recolección de THE, y debe mostrar la información sin obligar a seguir otros enlaces.'::text;
  insert into public.thi_evidencias (respuesta_id, url, nota, orden, publica, creada_por)
  values (p_respuesta, v_url, nullif(btrim(left(coalesce(p_nota, ''), 400)), ''),
          coalesce((select max(e.orden) + 1 from public.thi_evidencias e where e.respuesta_id = p_respuesta), 0), true, auth.uid())
  returning id into v_ev;
  perform public.thi_bitacora(r.ciclo, r.id, 'evidencia_agregada', null, null, jsonb_build_object('indicador', r.indicador, 'enlace', true), r.indicador);
  return jsonb_build_object('evidencia_id', v_ev, 'avisos', to_jsonb(v_avisos));
end;
$$;

create or replace function public.thi_editar_evidencia(p_evidencia uuid, p_nota text, p_publica boolean default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.thi_evidencias;
begin
  select * into e from public.thi_evidencias where id = p_evidencia;
  if not found or not public.thi_puede_evidenciar(e.respuesta_id) then
    raise exception 'No puede cambiar esa evidencia.' using errcode = '42501';
  end if;
  -- Solo la administración cambia si es pública; un archivo adjunto nunca lo es para THE.
  if p_publica is not null and p_publica is distinct from e.publica and not public.thi_es_admin() then
    raise exception 'Solo la administración del ranking cambia si una evidencia es pública.' using errcode = '42501';
  end if;
  update public.thi_evidencias
     set nota = nullif(btrim(left(coalesce(p_nota, ''), 400)), ''), publica = coalesce(p_publica, publica)
   where id = p_evidencia;
end;
$$;

/** Quita la evidencia. Si era un archivo de la carpeta del indicador, va a la papelera de UDrive (30 días). */
create or replace function public.thi_quitar_evidencia(p_evidencia uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.thi_evidencias;
  r public.ranking_responses;
begin
  select * into e from public.thi_evidencias where id = p_evidencia;
  if not found or not public.thi_puede_evidenciar(e.respuesta_id) then
    raise exception 'No puede quitar esa evidencia.' using errcode = '42501';
  end if;
  select * into r from public.ranking_responses where id = e.respuesta_id;
  delete from public.thi_evidencias where id = p_evidencia;
  if e.archivo_id is not null then
    update public.drive_archivos set borrado_en = now()
     where id = e.archivo_id and borrado_en is null
       and carpeta_id in (select tc.carpeta_id from public.thi_carpetas tc where tc.ciclo_id = r.ciclo and tc.carpeta_id is not null)
       and not exists (select 1 from public.thi_evidencias x where x.archivo_id = e.archivo_id);
  end if;
  perform public.thi_bitacora(r.ciclo, r.id, 'evidencia_quitada', null, null, jsonb_build_object('indicador', r.indicador, 'archivo', e.archivo_id), r.indicador);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Políticas de Storage (aditivas)
-- -----------------------------------------------------------------------------

do $$
begin
  execute 'drop policy if exists thi_evidencias_subida on storage.objects';
  execute $pol$
    create policy thi_evidencias_subida on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'udrive'
        and exists (
          select 1 from public.thi_evidencia_reservas rs
           where rs.ruta = name and rs.usuario_id = auth.uid() and not rs.usada and rs.expira_at > now()
        )
      )
  $pol$;
  execute 'drop policy if exists thi_evidencias_lectura on storage.objects';
  execute $pol$
    create policy thi_evidencias_lectura on storage.objects
      for select to authenticated
      using (
        bucket_id = 'udrive'
        and exists (
          select 1 from public.drive_archivos a join public.thi_evidencias e on e.archivo_id = a.id
           where a.ruta_storage = name and public.ranking_respuesta_visible(e.respuesta_id)
        )
      )
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudieron crear las políticas de Storage de THE Impact (%). Cree a mano en storage.objects: (1) INSERT para authenticated en el bucket udrive cuando exista una fila de thi_evidencia_reservas con ruta = name, usuario_id = auth.uid(), no usada y no vencida; (2) SELECT cuando el objeto sea el archivo de una thi_evidencias y ranking_respuesta_visible(respuesta_id) sea verdadero.',
      sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Permisos de ejecución
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array['thi_requisito(uuid, text)', 'thi_n_evidencias(uuid)', 'thi_evidencia_exigida(uuid)', 'thi_conteo_evidencias(uuid)',
                           'thi_crear_carpetas(uuid)', 'thi_puede_evidenciar(uuid)', 'thi_reservar_evidencia(uuid, text, text, bigint)',
                           'thi_registrar_evidencia(uuid, text)', 'thi_agregar_enlace(uuid, text, text)', 'thi_editar_evidencia(uuid, text, boolean)',
                           'thi_quitar_evidencia(uuid)', 'thi_nombre_carpeta(text, int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Las que arman la cadena de carpetas solo las llaman las funciones definer de arriba.
  foreach f in array array['thi_carpeta_clave(uuid, text, uuid, text)', 'thi_carpeta_edicion(uuid)', 'thi_carpeta_ods(uuid, int)', 'thi_carpeta_indicador(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

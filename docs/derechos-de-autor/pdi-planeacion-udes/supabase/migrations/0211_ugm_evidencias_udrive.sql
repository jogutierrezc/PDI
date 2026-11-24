-- =============================================================================
-- PDI · 0211 · UI GreenMetric · evidencias en UDrive (unidad «Datos de Sostenibilidad»)
--             y conexión con tablas y gráficas de Datos de Sostenibilidad
--
-- Requiere 0187, 0191, 0202, 0208 y 0210. Idempotente.
--
-- Las evidencias de UI GreenMetric viven como archivos de UDrive en la carpeta de
-- su pregunta:
--   Datos de Sostenibilidad › UI GreenMetric › Edición <año> › <categoría> › <pregunta>
-- `ugm_evidencias` las referencia por id (drive_archivos.id): no hay copia. Los
-- archivos de ranking_evidence y su bucket (15 MB) NO se usan aquí.
--
-- EL PUNTO DE PERMISOS DE UDRIVE Y CÓMO SE RESUELVE
--  En UDrive el papel (lector/editor/creador/propietario) es POR UNIDAD, no por
--  carpeta (0191: «dentro de una unidad el rango sale solo del papel»). Subir un
--  archivo exige papel Crea sobre la unidad (política drive_archivos_crear y las
--  políticas de storage.objects de 0191). Dar «Crea» al responsable de cada
--  indicador le permitiría crear, mover y borrar en TODA la unidad de
--  Sostenibilidad (tablas, gráficas y evidencias de los demás): inaceptable.
--
--  Solución (la más estrecha que permite el diseño de UDrive; no cambia ni
--  amplía ningún papel):
--   1. El responsable NO recibe papel en la unidad. Conserva solo la lectura
--      abierta que ya tiene.
--   2. `ugm_reservar_evidencia` (SECURITY DEFINER) comprueba que la persona tenga
--      asignación vigente a esa pregunta (o sea de la administración del
--      ranking), que la respuesta esté abierta, el tipo de archivo, el tamaño y
--      la cuota de la unidad, y RESERVA una ruta exacta
--      «unidades/<unidad>/<archivo>/<nombre>» válida por 2 horas, para una sola
--      persona y un solo objeto.
--   3. Una política ADITIVA de storage.objects (INSERT) deja subir SOLO a esa
--      ruta exacta, solo a quien la reservó, mientras no esté usada ni vencida.
--      No hay política de reemplazo ni de borrado: el objeto no se puede
--      sobrescribir ni borrar desde el cliente.
--   4. `ugm_registrar_evidencia` (SECURITY DEFINER) comprueba que el objeto
--      exista en Storage con el tamaño real, crea la fila de drive_archivos en
--      la carpeta de la pregunta (los disparadores de UDrive fijan la unidad y
--      aplican la cuota) y la vincula en ugm_evidencias.
--   5. Una política ADITIVA de lectura deja ver el binario a quien tiene algún
--      papel en esa pregunta (responsable, apoyo, revisor, jefe, administración):
--      la persona que revisa debe poder abrir la evidencia aunque no tenga
--      la pantalla de UDrive.
--  Qué se gana: el responsable solo puede escribir en la carpeta de SU pregunta,
--  mediante rutas reservadas. Qué NO se puede evitar: el cliente elige el
--  contenido del objeto (la función no puede ver sus bytes), y el límite del
--  bucket (100 MB) es el de UDrive; por eso la reserva declara un tamaño máximo
--  de 25 MB que se vuelve a comprobar con el tamaño real al registrar. Un objeto
--  subido y nunca registrado queda huérfano en Storage (la reserva vence y no
--  se enlaza); no se puede borrar con SQL sin dejar el archivo en disco, así
--  que la limpieza de huérfanos es una tarea de administración de Storage.
--  Si la política de storage no se puede crear (el rol que aplica la migración
--  no es dueño de storage.objects) la migración avisa con un WARNING y dice
--  exactamente qué crear a mano.
--  Decisión que SÍ le queda al usuario: si prefiere que los archivos se suban
--  con papel Crea sobre la unidad (más simple, menos seguro), no hace falta
--  nada de esta migración: bastaría asignar el papel desde UDrive. No se
--  recomienda.
--
-- OTRAS DECISIONES
--  · Formatos: pdf, png, jpg, jpeg, docx, doc, xlsx, xls, csv, txt. Tope 25 MB.
--    La guía pide PDF de máximo 2 MB: un PDF mayor se acepta con AVISO y se
--    comprime al exportar (decisión aprobada: optimizar al exportar, no al subir).
--  · Una evidencia es válida mientras su archivo no esté en la papelera de UDrive.
--  · Enlaces: solo https, con dominio (sin localhost ni direcciones privadas).
--  · Tablas y gráficas: solo de la unidad abierta «Datos de Sostenibilidad»;
--    solo columnas numéricas no sensibles (misma regla sos_columna_sensible).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Carpetas de la edición
-- -----------------------------------------------------------------------------

create or replace function public.ugm_asegurar_carpeta(p_padre uuid, p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select c.id into v_id from public.drive_carpetas c
   where c.padre_id = p_padre and lower(c.nombre) = lower(p_nombre) and c.borrado_en is null limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.drive_carpetas (padre_id, nombre, creada_por) values (p_padre, left(p_nombre, 120), auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

/**
 * Crea (si faltan) las carpetas del ciclo en la unidad «Datos de Sostenibilidad»:
 * UI GreenMetric › Edición <año> › categoría › pregunta. Idempotente. Guarda los ids en ugm_config,
 * ugm_categorias y ugm_preguntas. Solo la administración del ranking.
 */
create or replace function public.ugm_crear_carpetas(p_ciclo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidad public.drive_unidades;
  v_anio int;
  v_base uuid;
  v_ui uuid;
  v_ed uuid;
  c record;
  p record;
  v_cat uuid;
  v_q uuid;
  v_n_cat int := 0;
  v_n_q int := 0;
begin
  perform public.ugm_exige_admin();
  select anio into v_anio from public.ranking_cycles where id = p_ciclo and ranking = 'ui-greenmetric';
  if not found then raise exception 'Ese ciclo no es de UI GreenMetric.' using errcode = 'P0002'; end if;
  select * into v_unidad from public.drive_unidades u where u.lectura_abierta and lower(btrim(u.nombre)) = 'datos de sostenibilidad' and u.archivada_en is null limit 1;
  if not found or v_unidad.carpeta_raiz is null then
    raise exception 'No se encontró la unidad «Datos de Sostenibilidad» de UDrive (migración 0202).' using errcode = 'P0002';
  end if;
  v_base := v_unidad.carpeta_raiz;
  v_ui := public.ugm_asegurar_carpeta(v_base, 'UI GreenMetric');
  v_ed := public.ugm_asegurar_carpeta(v_ui, 'Edición ' || v_anio);
  update public.ugm_config set unidad_id = v_unidad.id, carpeta_raiz = v_ed where ciclo_id = p_ciclo;
  for c in select categoria, carpeta_nombre from public.ugm_categorias where ciclo_id = p_ciclo order by numero loop
    v_cat := public.ugm_asegurar_carpeta(v_ed, c.carpeta_nombre);
    update public.ugm_categorias set carpeta_id = v_cat where ciclo_id = p_ciclo and categoria = c.categoria;
    v_n_cat := v_n_cat + 1;
    for p in select q, carpeta_nombre from public.ugm_preguntas where ciclo_id = p_ciclo and categoria = c.categoria and carpeta_nombre is not null order by orden loop
      v_q := public.ugm_asegurar_carpeta(v_cat, p.carpeta_nombre);
      update public.ugm_preguntas set carpeta_id = v_q where ciclo_id = p_ciclo and q = p.q;
      v_n_q := v_n_q + 1;
    end loop;
  end loop;
  perform public.ugm_bitacora(p_ciclo, null, 'carpetas', null, null, jsonb_build_object('categorias', v_n_cat, 'preguntas', v_n_q, 'unidad', v_unidad.id));
  return jsonb_build_object('unidad_id', v_unidad.id, 'carpeta_edicion', v_ed, 'categorias', v_n_cat, 'preguntas', v_n_q);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Subida de archivos: reservar → subir → registrar
-- -----------------------------------------------------------------------------

/** ¿Puede esta persona agregar o quitar evidencias de la respuesta? Administración siempre; responsable/apoyo con la respuesta abierta. */
create or replace function public.ugm_puede_evidenciar(p_respuesta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ugm_respuestas r
     where r.id = p_respuesta
       and (public.ugm_rol_en(r.ciclo_id, r.q) = 'admin'
            or (public.ugm_rol_en(r.ciclo_id, r.q) in ('responsable', 'apoyo') and r.estado in ('asignado', 'en_captura', 'devuelto')))
  );
$$;

/** Reserva la ruta de una subida. Devuelve {reserva_id, bucket, ruta, vence, aviso}. */
create or replace function public.ugm_reservar_evidencia(p_respuesta uuid, p_nombre text, p_mime text default null, p_tamano bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas;
  p public.ugm_preguntas;
  cfg public.ugm_config;
  v_carpeta uuid;
  v_unidad uuid;
  v_id uuid := gen_random_uuid();
  v_ruta text;
  v_ext text;
  v_cuota bigint;
  v_uso bigint;
  v_aviso text;
begin
  if auth.uid() is null then raise exception 'Falta la sesión.' using errcode = '42501'; end if;
  select * into r from public.ugm_respuestas where id = p_respuesta;
  if not found or not public.ugm_puede_evidenciar(p_respuesta) then
    raise exception 'No puede agregar evidencias a esta respuesta (debe ser quien responde, con la respuesta abierta, o la administración).' using errcode = '42501';
  end if;
  if p_nombre is null or p_nombre !~ '^[A-Za-z0-9._-]{1,150}$' then
    raise exception 'El nombre del archivo solo puede llevar letras, números, punto, guion y guion bajo (máximo 150).' using errcode = 'check_violation';
  end if;
  v_ext := lower(substring(p_nombre from '\.([A-Za-z0-9]{1,5})$'));
  if v_ext is null or v_ext not in ('pdf', 'png', 'jpg', 'jpeg', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt') then
    raise exception 'Ese tipo de archivo no se admite como evidencia (use PDF, imagen, Word, Excel o CSV).' using errcode = 'check_violation';
  end if;
  if coalesce(p_tamano, 0) <= 0 or p_tamano > 26214400 then
    raise exception 'El archivo debe pesar entre 1 byte y 25 MB.' using errcode = 'check_violation';
  end if;
  select * into p from public.ugm_preguntas where ciclo_id = r.ciclo_id and q = r.q;
  if p.carpeta_id is null then
    raise exception 'La carpeta de la pregunta aún no existe: la administración debe crear las carpetas del ciclo.' using errcode = 'P0002';
  end if;
  select unidad_id into v_unidad from public.drive_carpetas where id = p.carpeta_id and borrado_en is null;
  if v_unidad is null then raise exception 'La carpeta de la pregunta no está disponible.' using errcode = 'P0002'; end if;
  -- Cuota de la unidad (la misma regla del disparador de UDrive, avisada antes de subir).
  select cuota_bytes into v_cuota from public.drive_unidades where id = v_unidad;
  select coalesce(sum(tamano), 0) into v_uso from public.drive_archivos where unidad_id = v_unidad;
  if v_uso + p_tamano > coalesce(v_cuota, 0) then
    raise exception 'La unidad Datos de Sostenibilidad llegó a su cuota de almacenamiento. Pida a quien la administra una ampliación.' using errcode = 'check_violation';
  end if;
  -- Un tope de reservas abiertas por persona: no se puede llenar Storage de rutas.
  if (select count(*) from public.ugm_evidencia_reservas x where x.usuario_id = auth.uid() and not x.usada and x.expira_at > now()) >= 20 then
    raise exception 'Tiene demasiadas subidas pendientes. Espere a que terminen o venzan.' using errcode = 'check_violation';
  end if;
  v_ruta := 'unidades/' || v_unidad::text || '/' || v_id::text || '/' || p_nombre;
  insert into public.ugm_evidencia_reservas (id, respuesta_id, usuario_id, carpeta_id, unidad_id, nombre, ruta, mime, tamano, expira_at)
  values (v_id, p_respuesta, auth.uid(), p.carpeta_id, v_unidad, p_nombre, v_ruta, left(p_mime, 120), p_tamano, now() + interval '2 hours');
  v_aviso := case when v_ext = 'pdf' and p_tamano > 2097152 then 'La guía pide PDF de máximo 2 MB: se acepta y se comprime al exportar.'
                  when v_ext <> 'pdf' then 'La guía pide PDF: este archivo se acepta como material de trabajo y se convierte al exportar.' end;
  return jsonb_build_object('reserva_id', v_id, 'bucket', 'udrive', 'ruta', v_ruta, 'vence', now() + interval '2 hours', 'aviso', v_aviso);
end;
$$;

/**
 * Registra la evidencia ya subida a la ruta reservada: crea el archivo de UDrive en la carpeta de la pregunta y lo
 * vincula. Devuelve {evidencia_id, archivo_id, avisos[]}.
 */
create or replace function public.ugm_registrar_evidencia(
  p_reserva uuid, p_figura int default null, p_pie_es text default null, p_pie_en text default null,
  p_idioma text default 'en', p_es_mapa boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rs public.ugm_evidencia_reservas;
  r public.ugm_respuestas;
  v_obj record;
  v_ext text;
  v_avisos text[] := '{}';
  v_ev uuid;
begin
  select * into rs from public.ugm_evidencia_reservas where id = p_reserva;
  if not found or rs.usuario_id is distinct from auth.uid() then
    raise exception 'Esa subida no existe o no es suya.' using errcode = '42501';
  end if;
  if rs.usada then raise exception 'Esa subida ya se registró.' using errcode = 'check_violation'; end if;
  if rs.expira_at < now() then raise exception 'La reserva venció: vuelva a subir el archivo.' using errcode = 'check_violation'; end if;
  select * into r from public.ugm_respuestas where id = rs.respuesta_id;
  if not found or not public.ugm_puede_evidenciar(rs.respuesta_id) then
    raise exception 'Ya no puede agregar evidencias a esta respuesta.' using errcode = '42501';
  end if;
  if p_idioma not in ('en', 'es') then raise exception 'Idioma desconocido.' using errcode = '22023'; end if;
  select o.name, (o.metadata ->> 'size')::bigint as tamano, o.metadata ->> 'mimetype' as mime into v_obj
    from storage.objects o where o.bucket_id = 'udrive' and o.name = rs.ruta;
  if not found then
    raise exception 'El archivo todavía no está en el almacenamiento. Termine la subida y vuelva a intentar.' using errcode = 'P0002';
  end if;
  if coalesce(v_obj.tamano, 0) <= 0 or v_obj.tamano > 26214400 then
    raise exception 'El archivo subido pesa % bytes; el máximo es 25 MB.', coalesce(v_obj.tamano, 0) using errcode = 'check_violation';
  end if;
  v_ext := lower(substring(rs.nombre from '\.([A-Za-z0-9]{1,5})$'));
  if exists (select 1 from public.drive_archivos a where a.carpeta_id = rs.carpeta_id and lower(a.nombre) = lower(rs.nombre) and a.borrado_en is null) then
    raise exception 'Ya hay un archivo con el nombre «%» en la carpeta de la pregunta. Cambie el nombre y suba de nuevo.', rs.nombre using errcode = 'unique_violation';
  end if;
  -- El archivo lo crea a nombre de quien lo subió; los disparadores de UDrive fijan la unidad y aplican la cuota.
  insert into public.drive_archivos (id, carpeta_id, tipo, nombre, mime, tamano, ruta_storage, estado, creada_por)
  values (rs.id, rs.carpeta_id, 'archivo', rs.nombre, coalesce(v_obj.mime, rs.mime), v_obj.tamano, rs.ruta, 'listo', rs.usuario_id);
  insert into public.ugm_evidencias (respuesta_id, archivo_id, figura, pie_es, pie_en, orden, es_mapa, idioma, creada_por)
  values (rs.respuesta_id, rs.id, p_figura, nullif(btrim(left(coalesce(p_pie_es, ''), 400)), ''), nullif(btrim(left(coalesce(p_pie_en, ''), 400)), ''),
          coalesce((select max(e.orden) + 1 from public.ugm_evidencias e where e.respuesta_id = rs.respuesta_id), 0), coalesce(p_es_mapa, false), p_idioma, auth.uid())
  returning id into v_ev;
  update public.ugm_evidencia_reservas set usada = true where id = p_reserva;
  if v_ext = 'pdf' and v_obj.tamano > 2097152 then v_avisos := v_avisos || 'PDF de más de 2 MB: se comprimirá al exportar.'; end if;
  if v_ext <> 'pdf' then v_avisos := v_avisos || 'No es PDF: se convertirá al exportar.'; end if;
  if p_idioma = 'es' then v_avisos := v_avisos || 'La guía pide las descripciones y la evidencia en inglés.'; end if;
  perform public.ugm_bitacora(r.ciclo_id, r.id, 'evidencia_agregada', null, null, jsonb_build_object('q', r.q, 'archivo', rs.id, 'bytes', v_obj.tamano));
  return jsonb_build_object('evidencia_id', v_ev, 'archivo_id', rs.id, 'avisos', to_jsonb(v_avisos));
end;
$$;

/** Vincula un archivo que ya está en la carpeta de la pregunta (p. ej. subido desde UDrive por quien tiene papel Crea). */
create or replace function public.ugm_vincular_archivo(p_respuesta uuid, p_archivo uuid, p_figura int default null, p_pie_es text default null, p_pie_en text default null, p_idioma text default 'en')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas;
  p public.ugm_preguntas;
  v_ev uuid;
begin
  if not public.ugm_puede_evidenciar(p_respuesta) then
    raise exception 'No puede agregar evidencias a esta respuesta.' using errcode = '42501';
  end if;
  select * into r from public.ugm_respuestas where id = p_respuesta;
  select * into p from public.ugm_preguntas where ciclo_id = r.ciclo_id and q = r.q;
  if p.carpeta_id is null or not exists (
    select 1 from public.drive_archivos a where a.id = p_archivo and a.tipo = 'archivo' and a.carpeta_id = p.carpeta_id and a.borrado_en is null
  ) then
    raise exception 'Solo se vincula un archivo que ya esté en la carpeta de esta pregunta en Datos de Sostenibilidad.' using errcode = 'check_violation';
  end if;
  if p_idioma not in ('en', 'es') then raise exception 'Idioma desconocido.' using errcode = '22023'; end if;
  insert into public.ugm_evidencias (respuesta_id, archivo_id, figura, pie_es, pie_en, orden, idioma, creada_por)
  values (p_respuesta, p_archivo, p_figura, nullif(btrim(left(coalesce(p_pie_es, ''), 400)), ''), nullif(btrim(left(coalesce(p_pie_en, ''), 400)), ''),
          coalesce((select max(e.orden) + 1 from public.ugm_evidencias e where e.respuesta_id = p_respuesta), 0), p_idioma, auth.uid())
  on conflict (respuesta_id, archivo_id) where archivo_id is not null do nothing
  returning id into v_ev;
  if v_ev is null then select id into v_ev from public.ugm_evidencias where respuesta_id = p_respuesta and archivo_id = p_archivo; end if;
  return v_ev;
end;
$$;

/** Agrega un enlace público https como evidencia. */
create or replace function public.ugm_agregar_enlace(p_respuesta uuid, p_url text, p_pie_es text default null, p_pie_en text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := btrim(coalesce(p_url, ''));
  v_host text;
  v_ev uuid;
begin
  if not public.ugm_puede_evidenciar(p_respuesta) then
    raise exception 'No puede agregar evidencias a esta respuesta.' using errcode = '42501';
  end if;
  if v_url !~ '^https://[^[:space:]]{3,490}$' then
    raise exception 'El enlace debe empezar por https:// y no llevar espacios. La guía exige que sea de acceso público.' using errcode = 'check_violation';
  end if;
  v_host := lower(substring(v_url from '^https://([^/:?#]+)'));
  if v_host is null or v_host !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'
     or v_host ~ '^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)' then
    raise exception 'El enlace debe apuntar a un sitio público con dominio (no a una dirección interna).' using errcode = 'check_violation';
  end if;
  insert into public.ugm_evidencias (respuesta_id, url, pie_es, pie_en, orden, idioma, creada_por)
  values (p_respuesta, v_url, nullif(btrim(left(coalesce(p_pie_es, ''), 400)), ''), nullif(btrim(left(coalesce(p_pie_en, ''), 400)), ''),
          coalesce((select max(e.orden) + 1 from public.ugm_evidencias e where e.respuesta_id = p_respuesta), 0), 'en', auth.uid())
  returning id into v_ev;
  return v_ev;
end;
$$;

create or replace function public.ugm_editar_evidencia(p_evidencia uuid, p_figura int, p_pie_es text, p_pie_en text, p_orden int, p_es_mapa boolean, p_idioma text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.ugm_evidencias;
begin
  select * into e from public.ugm_evidencias where id = p_evidencia;
  if not found or not public.ugm_puede_evidenciar(e.respuesta_id) then
    raise exception 'No puede cambiar esa evidencia.' using errcode = '42501';
  end if;
  if p_idioma not in ('en', 'es') then raise exception 'Idioma desconocido.' using errcode = '22023'; end if;
  update public.ugm_evidencias
     set figura = p_figura, pie_es = nullif(btrim(left(coalesce(p_pie_es, ''), 400)), ''), pie_en = nullif(btrim(left(coalesce(p_pie_en, ''), 400)), ''),
         orden = coalesce(p_orden, orden), es_mapa = coalesce(p_es_mapa, es_mapa), idioma = p_idioma
   where id = p_evidencia;
end;
$$;

/** Quita la evidencia. Si era un archivo de la carpeta de la pregunta, va a la papelera de UDrive (30 días). */
create or replace function public.ugm_quitar_evidencia(p_evidencia uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.ugm_evidencias;
  r public.ugm_respuestas;
  p public.ugm_preguntas;
begin
  select * into e from public.ugm_evidencias where id = p_evidencia;
  if not found or not public.ugm_puede_evidenciar(e.respuesta_id) then
    raise exception 'No puede quitar esa evidencia.' using errcode = '42501';
  end if;
  select * into r from public.ugm_respuestas where id = e.respuesta_id;
  select * into p from public.ugm_preguntas where ciclo_id = r.ciclo_id and q = r.q;
  delete from public.ugm_evidencias where id = p_evidencia;
  if e.archivo_id is not null then
    update public.drive_archivos set borrado_en = now()
     where id = e.archivo_id and borrado_en is null and carpeta_id = p.carpeta_id
       and not exists (select 1 from public.ugm_evidencias x where x.archivo_id = e.archivo_id);
  end if;
  perform public.ugm_bitacora(r.ciclo_id, r.id, 'evidencia_quitada', null, null, jsonb_build_object('q', r.q, 'archivo', e.archivo_id));
end;
$$;

/** La administración marca una evidencia como pública (por defecto ninguna lo es). */
create or replace function public.ugm_publicar_evidencia(p_evidencia uuid, p_publica boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ugm_exige_admin();
  update public.ugm_evidencias set publica = coalesce(p_publica, false) where id = p_evidencia;
end;
$$;

/** Solo el rol de servicio: la ruta de Storage de una evidencia pública, para que una función firme un enlace de corta vida. */
create or replace function public.ugm_ruta_evidencia_publica(p_evidencia uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.ruta_storage
    from public.ugm_evidencias e
    join public.ugm_respuestas r on r.id = e.respuesta_id
    join public.drive_archivos a on a.id = e.archivo_id
   where e.id = p_evidencia and e.publica and r.publicar_web and r.estado = 'aprobado' and a.borrado_en is null and a.ruta_storage is not null;
$$;

-- -----------------------------------------------------------------------------
-- 3. Políticas de Storage (aditivas)
-- -----------------------------------------------------------------------------

do $$
begin
  execute 'drop policy if exists ugm_evidencias_subida on storage.objects';
  execute $pol$
    create policy ugm_evidencias_subida on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'udrive'
        and exists (
          select 1 from public.ugm_evidencia_reservas rs
           where rs.ruta = name and rs.usuario_id = auth.uid() and not rs.usada and rs.expira_at > now()
        )
      )
  $pol$;
  execute 'drop policy if exists ugm_evidencias_lectura on storage.objects';
  execute $pol$
    create policy ugm_evidencias_lectura on storage.objects
      for select to authenticated
      using (
        bucket_id = 'udrive'
        and exists (
          select 1 from public.drive_archivos a join public.ugm_evidencias e on e.archivo_id = a.id
           where a.ruta_storage = name and public.ugm_rol_en_respuesta(e.respuesta_id) is not null
        )
      )
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudieron crear las políticas de Storage de UI GreenMetric (%). Cree a mano en storage.objects: (1) INSERT para authenticated en el bucket udrive cuando exista una fila de ugm_evidencia_reservas con ruta = name, usuario_id = auth.uid(), no usada y no vencida; (2) SELECT cuando el objeto sea el archivo de una ugm_evidencias y ugm_rol_en_respuesta(respuesta_id) no sea nulo.',
      sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Conexión con Datos de Sostenibilidad: tablas y gráficas
-- -----------------------------------------------------------------------------

/** Tablas de la unidad abierta, con solo columnas numéricas o de periodo NO sensibles y si están publicadas. Para el selector. */
create or replace function public.ugm_tablas_disponibles()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ugm_es_admin() and not exists (select 1 from public.ugm_asignaciones a where a.usuario_id = auth.uid() and a.vigente and a.rol in ('responsable', 'apoyo')) then
    raise exception 'No tiene acceso a las tablas de Datos de Sostenibilidad desde UI GreenMetric.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'nombre', a.nombre, 'actualizado', a.updated_at, 'publicada', public.ugm_tabla_publicada(a.id),
             'filas', case when jsonb_typeof(a.contenido -> 'filas') = 'array' then jsonb_array_length(a.contenido -> 'filas') else 0 end,
             'columnas', coalesce((
               select jsonb_agg(jsonb_build_object('clave', c ->> 'clave', 'etiqueta', c ->> 'etiqueta', 'tipo', c ->> 'tipo'))
                 from jsonb_array_elements(case when jsonb_typeof(a.contenido -> 'columnas') = 'array' then a.contenido -> 'columnas' else '[]'::jsonb end) c
                where not public.sos_columna_sensible(c)), '[]'::jsonb)) order by a.nombre)
      from public.drive_archivos a
     where a.tipo = 'tabla' and a.borrado_en is null and public.sos_unidad_abierta(a.unidad_id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ugm_graficas_disponibles()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ugm_es_admin() and not exists (select 1 from public.ugm_asignaciones a where a.usuario_id = auth.uid() and a.vigente and a.rol in ('responsable', 'apoyo')) then
    raise exception 'No tiene acceso a las gráficas de Datos de Sostenibilidad desde UI GreenMetric.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'publicada', public.ugm_grafica_publicada(a.id)) order by a.nombre)
      from public.drive_archivos a
     where a.tipo = 'grafica' and a.borrado_en is null and public.sos_unidad_abierta(a.unidad_id)
  ), '[]'::jsonb);
end;
$$;

/**
 * Conecta un campo numérico del indicador a una columna de una tabla de Datos de Sostenibilidad.
 * modo conectado: manda la tabla (el campo se recalcula); manual: manda lo escrito a mano. Devuelve {valor, anio, filas} o nulo.
 */
create or replace function public.ugm_vincular_dato(
  p_respuesta uuid, p_campo text, p_archivo uuid, p_columna text, p_col_periodo text default null,
  p_agregacion text default 'suma', p_anio_modo text default 'ultimo', p_anio int default null, p_modo text default 'conectado'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas;
  p public.ugm_preguntas;
  a record;
  v_col jsonb;
  v_id uuid;
  v_res jsonb;
begin
  if not public.ugm_puede_evidenciar(p_respuesta) then
    raise exception 'No puede conectar datos a esta respuesta (debe estar abierta).' using errcode = '42501';
  end if;
  select * into r from public.ugm_respuestas where id = p_respuesta;
  select * into p from public.ugm_preguntas where ciclo_id = r.ciclo_id and q = r.q;
  if not exists (select 1 from jsonb_array_elements(p.esquema -> 'campos') c where c ->> 'k' = p_campo and c ->> 'tipo' = 'numero') then
    raise exception 'El campo «%» no es numérico en esta pregunta.', p_campo using errcode = 'check_violation';
  end if;
  select tipo, borrado_en, contenido, unidad_id into a from public.drive_archivos where id = p_archivo;
  if not found or a.tipo <> 'tabla' or a.borrado_en is not null or not public.sos_unidad_abierta(a.unidad_id) then
    raise exception 'Elija una tabla de la unidad Datos de Sostenibilidad.' using errcode = 'check_violation';
  end if;
  v_col := public.sos_col(a.contenido -> 'columnas', p_columna);
  if v_col is null or coalesce(v_col ->> 'tipo', '') not in ('numero', 'porcentaje') then
    raise exception 'La columna «%» no existe o no es numérica.', p_columna using errcode = 'check_violation';
  end if;
  if public.sos_columna_sensible(v_col) then
    raise exception 'La columna «%» parece traer datos personales y no se puede conectar.', p_columna using errcode = 'check_violation';
  end if;
  if p_col_periodo is not null and (public.sos_col(a.contenido -> 'columnas', p_col_periodo) is null or public.sos_columna_sensible(public.sos_col(a.contenido -> 'columnas', p_col_periodo))) then
    raise exception 'La columna de periodo «%» no existe o no se puede usar.', p_col_periodo using errcode = 'check_violation';
  end if;
  if p_modo not in ('conectado', 'manual') or p_agregacion not in ('suma', 'promedio', 'ultimo') or p_anio_modo not in ('ultimo', 'anterior', 'dos_atras', 'fijo') then
    raise exception 'Parámetros de conexión no válidos.' using errcode = '22023';
  end if;
  insert into public.ugm_datos_vinculos (respuesta_id, campo, archivo_id, columna, col_periodo, agregacion, anio_modo, anio, modo, creado_por)
  values (p_respuesta, p_campo, p_archivo, p_columna, p_col_periodo, p_agregacion, p_anio_modo, case when p_anio_modo = 'fijo' then p_anio end, p_modo, auth.uid())
  on conflict (respuesta_id, campo) do update
    set archivo_id = excluded.archivo_id, columna = excluded.columna, col_periodo = excluded.col_periodo, agregacion = excluded.agregacion,
        anio_modo = excluded.anio_modo, anio = excluded.anio, modo = excluded.modo, updated_at = now()
  returning id into v_id;
  v_res := public.ugm_valor_vinculo(v_id);
  -- En modo conectado se guarda también el valor de hoy (lo que ve quien exporta sin consultar la tabla).
  if p_modo = 'conectado' and v_res is not null then
    update public.ugm_respuestas set valores = jsonb_set(valores, array[p_campo], v_res -> 'valor', true) where id = p_respuesta;
  end if;
  return v_res;
end;
$$;

create or replace function public.ugm_quitar_vinculo(p_respuesta uuid, p_campo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ugm_puede_evidenciar(p_respuesta) then
    raise exception 'No puede cambiar las conexiones de esta respuesta.' using errcode = '42501';
  end if;
  delete from public.ugm_datos_vinculos where respuesta_id = p_respuesta and campo = p_campo;
end;
$$;

create or replace function public.ugm_vincular_grafica(p_respuesta uuid, p_archivo uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.ugm_puede_evidenciar(p_respuesta) then
    raise exception 'No puede conectar gráficas a esta respuesta (debe estar abierta).' using errcode = '42501';
  end if;
  if not exists (select 1 from public.drive_archivos a where a.id = p_archivo and a.tipo = 'grafica' and a.borrado_en is null and public.sos_unidad_abierta(a.unidad_id)) then
    raise exception 'Elija una gráfica de la unidad Datos de Sostenibilidad.' using errcode = 'check_violation';
  end if;
  insert into public.ugm_datos_graficas (respuesta_id, archivo_id, orden, creado_por)
  values (p_respuesta, p_archivo, coalesce((select max(g.orden) + 1 from public.ugm_datos_graficas g where g.respuesta_id = p_respuesta), 0), auth.uid())
  on conflict (respuesta_id, archivo_id) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.ugm_datos_graficas where respuesta_id = p_respuesta and archivo_id = p_archivo; end if;
  return v_id;
end;
$$;

create or replace function public.ugm_quitar_grafica(p_respuesta uuid, p_archivo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ugm_puede_evidenciar(p_respuesta) then
    raise exception 'No puede cambiar las gráficas de esta respuesta.' using errcode = '42501';
  end if;
  delete from public.ugm_datos_graficas where respuesta_id = p_respuesta and archivo_id = p_archivo;
end;
$$;

/** Qué muestra hoy cada campo conectado: {campo, modo, valor_tabla, anio, filas, publicada}. Para «manda la tabla / manda lo escrito». */
create or replace function public.ugm_vinculos_de(p_respuesta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.ugm_rol_en_respuesta(p_respuesta) is null then
    raise exception 'No tiene acceso a esa respuesta.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'campo', v.campo, 'modo', v.modo, 'archivo_id', v.archivo_id,
             'tabla', (select a.nombre from public.drive_archivos a where a.id = v.archivo_id),
             'columna', v.columna, 'col_periodo', v.col_periodo, 'agregacion', v.agregacion, 'anio_modo', v.anio_modo, 'anio', v.anio,
             'dato', public.ugm_valor_vinculo(v.id), 'publicada', public.ugm_tabla_publicada(v.archivo_id)) order by v.campo)
      from public.ugm_datos_vinculos v where v.respuesta_id = p_respuesta
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Permisos de ejecución
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'ugm_crear_carpetas(uuid)', 'ugm_puede_evidenciar(uuid)', 'ugm_reservar_evidencia(uuid, text, text, bigint)',
    'ugm_registrar_evidencia(uuid, int, text, text, text, boolean)', 'ugm_vincular_archivo(uuid, uuid, int, text, text, text)',
    'ugm_agregar_enlace(uuid, text, text, text)', 'ugm_editar_evidencia(uuid, int, text, text, int, boolean, text)',
    'ugm_quitar_evidencia(uuid)', 'ugm_publicar_evidencia(uuid, boolean)', 'ugm_tablas_disponibles()', 'ugm_graficas_disponibles()',
    'ugm_vincular_dato(uuid, text, uuid, text, text, text, text, int, text)', 'ugm_quitar_vinculo(uuid, text)',
    'ugm_vincular_grafica(uuid, uuid)', 'ugm_quitar_grafica(uuid, uuid)', 'ugm_vinculos_de(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['ugm_asegurar_carpeta(uuid, text)', 'ugm_ruta_evidencia_publica(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

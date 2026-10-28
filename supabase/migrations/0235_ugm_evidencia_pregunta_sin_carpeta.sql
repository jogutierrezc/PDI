-- =============================================================================
-- PDI · 0235 · UI GreenMetric · subir evidencia a una pregunta sin carpeta propia
--
-- Requiere 0211. Idempotente (create or replace). NO reescribe 0211.
--
-- HALLAZGO: 26 preguntas del catálogo 2026 (1.1, 1.2, 2.2, 5.1, 7.1…) tienen
-- carpeta_nombre nulo porque la guía no pide documentarlas, así que
-- ugm_crear_carpetas no les crea carpeta. La interfaz sí deja subir un archivo ahí y
-- ugm_reservar_evidencia respondía 500 (P0002) con «La carpeta de la pregunta aún no
-- existe», aunque las carpetas del ciclo estuvieran creadas.
--
-- DECISIÓN: si falta la carpeta de la pregunta pero existe la de su categoría, se crea
-- en el momento («<q>_Evidencias») dentro de la categoría. Los errores de negocio
-- pasan a check_violation (400 con mensaje) en vez de P0002 (500).
-- =============================================================================

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
  v_cat uuid;
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
    -- Las preguntas que la guía no pide documentar no traen carpeta propia (carpeta_nombre nulo). Si aun así llega
    -- una evidencia, la carpeta se crea ahora dentro de la de su categoría, con el número de la pregunta.
    select c.carpeta_id into v_cat from public.ugm_categorias c where c.ciclo_id = r.ciclo_id and c.categoria = p.categoria;
    if v_cat is null then
      raise exception 'Las carpetas del ciclo aún no existen: la administración debe crearlas desde la sección de UI GreenMetric.' using errcode = 'check_violation';
    end if;
    v_carpeta := public.ugm_asegurar_carpeta(v_cat, coalesce(p.carpeta_nombre, replace(p.q, '.', '_') || '_Evidencias'));
    update public.ugm_preguntas set carpeta_id = v_carpeta where ciclo_id = r.ciclo_id and q = r.q;
    p.carpeta_id := v_carpeta;
  end if;
  select unidad_id into v_unidad from public.drive_carpetas where id = p.carpeta_id and borrado_en is null;
  if v_unidad is null then raise exception 'La carpeta de la pregunta no está disponible.' using errcode = 'check_violation'; end if;
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

notify pgrst, 'reload schema';

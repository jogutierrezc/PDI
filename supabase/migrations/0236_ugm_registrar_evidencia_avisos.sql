-- =============================================================================
-- PDI · 0236 · UI GreenMetric · registrar evidencia que no es PDF (o es PDF grande)
--
-- Requiere 0211. Idempotente (create or replace). NO reescribe 0211.
--
-- HALLAZGO: al registrar una evidencia que no es PDF, ugm_registrar_evidencia fallaba con
-- «malformed array literal: "No es PDF: se convertirá al exportar."». El aviso se
-- agregaba con `v_avisos := v_avisos || 'texto'` sobre un text[]: con un literal sin
-- tipo, PostgreSQL lo lee como arreglo. Lo mismo pasaba con el aviso de PDF mayor a
-- 2 MB y con el de idioma español.
--
-- DECISIÓN: los tres avisos se agregan con ::text. Los formatos admitidos no cambian
-- (pdf, imágenes, Word, Excel, CSV y TXT): el aviso solo informa que se convierte al exportar.
-- =============================================================================

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
  if v_ext = 'pdf' and v_obj.tamano > 2097152 then v_avisos := v_avisos || 'PDF de más de 2 MB: se comprimirá al exportar.'::text; end if;
  if v_ext <> 'pdf' then v_avisos := v_avisos || 'No es PDF: se convertirá al exportar.'::text; end if;
  if p_idioma = 'es' then v_avisos := v_avisos || 'La guía pide las descripciones y la evidencia en inglés.'::text; end if;
  perform public.ugm_bitacora(r.ciclo_id, r.id, 'evidencia_agregada', null, null, jsonb_build_object('q', r.q, 'archivo', rs.id, 'bytes', v_obj.tamano));
  return jsonb_build_object('evidencia_id', v_ev, 'archivo_id', rs.id, 'avisos', to_jsonb(v_avisos));
end;
$$;

notify pgrst, 'reload schema';

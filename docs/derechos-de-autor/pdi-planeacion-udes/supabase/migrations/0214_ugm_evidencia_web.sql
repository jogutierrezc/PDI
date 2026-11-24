-- =============================================================================
-- PDI · 0214 · UI GreenMetric · ruta de una evidencia PÚBLICA para la función ugm-evidencia
--
-- Requiere 0211 y 0212. Idempotente. La usa solo la función edge `ugm-evidencia`
-- (rol de servicio); nadie la llama desde el navegador.
--
-- PORQUÉ DE CADA DECISIÓN DE SEGURIDAD
--  1. 0211 dejó ugm_ruta_evidencia_publica, que solo mira «pública», «publicar_web»
--     y «aprobado». Para entregar un archivo eso es poco: la página pública exige
--     además dato no sensible, traducción revisada y vigente, evidencia si se exige y
--     tablas conectadas publicadas (ugm_publica_ok, 0212). Aquí se exige TODO lo
--     mismo, de modo que un archivo sale exactamente cuando su indicador sale en la
--     página, y deja de salir en el mismo instante en que el indicador se retira.
--  2. También se exige que el ciclo sea visible (abierto o cerrado) y que el archivo
--     de UDrive no esté en la papelera.
--  3. Devuelve la ruta de Storage y la extensión; la función edge NO se las pasa al
--     navegador: ella misma descarga con una URL firmada de 60 s y entrega el archivo
--     con un nombre genérico (la ruta contiene el nombre interno del archivo).
--  4. Solo service_role puede ejecutarla (revoke a public, anon y authenticated).
-- =============================================================================

create or replace function public.ugm_ruta_evidencia_web(p_evidencia uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ruta', a.ruta_storage, 'ext', lower(coalesce(substring(a.nombre from '\.([A-Za-z0-9]{1,5})$'), '')))
    from public.ugm_evidencias e
    join public.ugm_respuestas r on r.id = e.respuesta_id
    join public.drive_archivos a on a.id = e.archivo_id
   where e.id = p_evidencia
     and e.publica
     and public.ugm_publico_ciclo_ok(r.ciclo_id)
     and public.ugm_publica_ok(r)
     and a.borrado_en is null
     and a.ruta_storage is not null;
$$;

revoke all on function public.ugm_ruta_evidencia_web(uuid) from public, anon, authenticated;
grant execute on function public.ugm_ruta_evidencia_web(uuid) to service_role;

notify pgrst, 'reload schema';

-- Encuestas con Pilo · permisos de escritura de los ajustes (reparación).
--
-- Guardar el formato, las fechas o los límites de una encuesta devolvía
-- «permission denied for table enc_encuestas» (403) cuando alguna de las columnas
-- de los ajustes no tenía permiso. Esta migración vuelve a dar, de forma
-- idempotente, el permiso de escritura sobre todas las columnas que el panel cambia
-- (las de 0179 y las de 0184). `updated_at` no se incluye: lo llena el trigger.
-- Requiere 0179 y 0184. Es segura de repetir.

grant update (
  titulo, anio, abierta, cierra_el, intro, despedida,
  acceso, dominios_permitidos, una_por_persona, abre_el, limite_respuestas,
  mensaje_cierre, estado, modo_llenado, config_pilo
) on public.enc_encuestas to authenticated;

grant update (estado) on public.enc_respuestas to authenticated;
grant update (estado) on public.enc_aportes to authenticated;

notify pgrst, 'reload schema';

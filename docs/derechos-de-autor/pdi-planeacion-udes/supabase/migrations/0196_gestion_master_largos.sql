-- =============================================================================
-- PDI · 0196 · Gestión Master: textos más largos en las actividades de una solicitud
--
-- Las instrucciones y la vinculación de una actividad se precargan del catálogo
-- del Master cuando la solicitud parte de un código existente (Mejorar,
-- Mantener o Eliminar), y ahí vienen más largas que los topes de la 0194
-- (2000 y 300 caracteres): el guardado fallaba con «gm_lin_largos».
-- El nombre sigue en 300; las instrucciones suben a 5000 y la vinculación a
-- 1000. Idempotente.
-- =============================================================================

alter table public.gm_solicitud_lineas drop constraint if exists gm_lin_largos;
alter table public.gm_solicitud_lineas
  add constraint gm_lin_largos
  check (
    char_length(coalesce(nombre, '')) <= 300
    and char_length(coalesce(instrucciones, '')) <= 5000
    and char_length(coalesce(vinculacion, '')) <= 1000
  );

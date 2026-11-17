-- =============================================================================
-- PDI · 0283 · Pilo IA · elegir modelo («Pilo» o «Pilo Astra 1.0») en el chat
--
-- Requiere 0089 (pilo_ai_settings). Idempotente.
--
-- DECISIÓN. pilo-ia usaba un solo modelo de texto. Ahora la persona con sesión puede elegir
-- «Pilo Astra 1.0», que razona y muestra su pensamiento. La dirección, el modelo y el razonamiento
-- de Astra siguen siendo los de Pilo Work (pw_config.astra_*, 0278); aquí solo hay dos ajustes:
--   · astra_chat     interruptor de Astra en el chat de Pilo (apagado por defecto).
--   · modelo_defecto el modelo que viene marcado: 'pilo' o 'astra'.
-- Sin RLS nueva: pilo_ai_settings solo la toca el servicio.
-- =============================================================================

alter table public.pilo_ai_settings
  add column if not exists astra_chat boolean not null default false,
  add column if not exists modelo_defecto text not null default 'pilo';

alter table public.pilo_ai_settings drop constraint if exists pilo_ai_settings_modelo_defecto;
alter table public.pilo_ai_settings add constraint pilo_ai_settings_modelo_defecto
  check (modelo_defecto in ('pilo', 'astra'));

notify pgrst, 'reload schema';

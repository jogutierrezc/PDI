-- =============================================================================
-- PDI · 0298 · Búsqueda por significado con el servidor de Pilo Astra
--
-- Requiere 0109 (embed_model) y 0278 (Astra). Idempotente.
--
-- Hasta ahora los embeddings salían solo del proveedor de Conexión, y solo
-- NVIDIA y Mistral los ofrecen. Con esta columna la búsqueda por significado
-- puede usar el servidor propio de Pilo Astra (Ollama u otro compatible con
-- /v1/embeddings), con su dirección y su clave, sin cambiar el proveedor del texto.
--
--   pilo_ai_settings.embed_provider   ''      = el proveedor de Conexión (como antes)
--                                     'astra' = el servidor de Pilo Astra; pide
--                                               embed_model (p. ej. bge-m3), que debe
--                                               dar vectores de 1024 dimensiones o más.
--
-- Al cambiarlo hay que volver a indexar: los vectores se guardan por modelo.
-- =============================================================================

alter table public.pilo_ai_settings
  add column if not exists embed_provider text not null default '';

alter table public.pilo_ai_settings drop constraint if exists pilo_ai_settings_embed_provider_check;
alter table public.pilo_ai_settings
  add constraint pilo_ai_settings_embed_provider_check check (embed_provider in ('', 'astra'));

comment on column public.pilo_ai_settings.embed_provider is
  'De dónde salen los embeddings (0298): vacío = el proveedor de Conexión; astra = el servidor de Pilo Astra con embed_model.';

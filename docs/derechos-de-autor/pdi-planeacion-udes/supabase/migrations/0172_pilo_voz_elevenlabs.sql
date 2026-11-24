-- =============================================================================
-- 0172 · Mr. Pilo con IA: la voz de Pilo con ElevenLabs (emociones y canto).
--
-- ElevenLabs es un proveedor de voz más, junto a NVIDIA y Fish Audio:
--
--   speech_provider        ahora también 'elevenlabs'.
--   elevenlabs_key         su clave, aparte de las demás (nunca vuelve al
--                          navegador: solo se muestran los últimos 4).
--   eleven_model           eleven_v3 (etiquetas de emoción), eleven_v4,
--                          eleven_multilingual_v2 o eleven_flash_v2_5.
--   eleven_voice_id        la voz de siempre (cada estilo puede traer la suya
--                          en voice_styles[].eleven_id).
--   eleven_format          formato de salida (MP3; mp3_44100_128 de partida).
--   eleven_stability, eleven_similarity, eleven_style, eleven_speed,
--   eleven_speaker_boost   los voice_settings de partida.
--   eleven_fallback        la voz de respaldo si ElevenLabs falla o no tiene
--                          cupo: 'ninguno', 'fishaudio' o 'nvidia'. Nunca la
--                          del navegador (regla del proyecto: voz oficial o
--                          ninguna).
--
-- «Cantar» (acción cantar del servidor) es una función ampliada más de
-- pilo_extras (0119), apagada por defecto y encendida por espacio:
--
--   sing_aud          nadie | admin | sesion | publico (nace en 'nadie')
--   sing_daily        canciones nuevas por día (0 = ninguna)
--   sing_max_chars    tope de caracteres de la letra
--   sing_max_seconds  duración máxima de la pieza
--
-- Lo ya generado se guarda en pilo-voz/cache/ (MP3, ya permitido por 0102).
-- Idempotente. Requiere 0102, 0113 y 0119.
-- =============================================================================

alter table public.pilo_ai_secret add column if not exists elevenlabs_key text not null default '';

alter table public.pilo_ai_settings add column if not exists eleven_model text not null default 'eleven_v3';
alter table public.pilo_ai_settings add column if not exists eleven_voice_id text not null default '';
alter table public.pilo_ai_settings add column if not exists eleven_format text not null default 'mp3_44100_128';
alter table public.pilo_ai_settings add column if not exists eleven_stability numeric not null default 0.5;
alter table public.pilo_ai_settings add column if not exists eleven_similarity numeric not null default 0.75;
alter table public.pilo_ai_settings add column if not exists eleven_style numeric not null default 0;
alter table public.pilo_ai_settings add column if not exists eleven_speed numeric not null default 1;
alter table public.pilo_ai_settings add column if not exists eleven_speaker_boost boolean not null default true;
alter table public.pilo_ai_settings add column if not exists eleven_fallback text not null default 'ninguno';

alter table public.pilo_ai_settings drop constraint if exists pilo_ai_settings_speech_provider;
alter table public.pilo_ai_settings add constraint pilo_ai_settings_speech_provider
  check (speech_provider in ('freeai', 'nvidia', 'fishaudio', 'elevenlabs', 'otro', 'navegador'));

alter table public.pilo_ai_settings drop constraint if exists pilo_ai_settings_eleven;
alter table public.pilo_ai_settings add constraint pilo_ai_settings_eleven check (
  eleven_model in ('eleven_v3', 'eleven_v4', 'eleven_multilingual_v2', 'eleven_flash_v2_5')
  and eleven_voice_id ~ '^[A-Za-z0-9]{0,40}$'
  and eleven_format in ('mp3_22050_32', 'mp3_24000_48', 'mp3_44100_32', 'mp3_44100_64', 'mp3_44100_96', 'mp3_44100_128')
  and eleven_stability between 0 and 1
  and eleven_similarity between 0 and 1
  and eleven_style between 0 and 1
  and eleven_speed between 0.7 and 1.2
  and eleven_fallback in ('ninguno', 'fishaudio', 'nvidia')
);

comment on column public.pilo_ai_secret.api_key is 'En desuso desde 0091: cada proveedor tiene su columna (mistral_key, freeai_key, nvidia_key, fishaudio_key, elevenlabs_key, otro_key).';

-- -----------------------------------------------------------------------------
-- Cantar: una función ampliada más, apagada por defecto.
-- -----------------------------------------------------------------------------
alter table public.pilo_extras add column if not exists sing_aud text not null default 'nadie';
alter table public.pilo_extras add column if not exists sing_daily integer not null default 10;
alter table public.pilo_extras add column if not exists sing_max_chars integer not null default 600;
alter table public.pilo_extras add column if not exists sing_max_seconds integer not null default 60;

alter table public.pilo_extras drop constraint if exists pilo_extras_sing_aud;
alter table public.pilo_extras add constraint pilo_extras_sing_aud check (sing_aud in ('nadie', 'admin', 'sesion', 'publico'));
alter table public.pilo_extras drop constraint if exists pilo_extras_sing_limits;
alter table public.pilo_extras add constraint pilo_extras_sing_limits
  check (sing_daily between 0 and 200 and sing_max_chars between 100 and 1500 and sing_max_seconds between 10 and 180);

-- -----------------------------------------------------------------------------
-- La clave de la voz: con ElevenLabs, solo la de ElevenLabs.
-- -----------------------------------------------------------------------------
create or replace function public.pilo_ai_keys_in_use(out text_key text, out speech_key text)
language sql
stable
security definer
set search_path = public
as $$
  select
    case s.provider when 'mistral' then k.mistral_key when 'freeai' then k.freeai_key when 'nvidia' then k.nvidia_key else k.otro_key end,
    case when s.speech_provider = 'elevenlabs' then k.elevenlabs_key else
    coalesce(
      nullif(k.speech_key, ''),
      nullif(
        case s.speech_provider
          when 'freeai' then k.freeai_key
          when 'nvidia' then k.nvidia_key
          when 'fishaudio' then k.fishaudio_key
          when 'otro' then k.otro_key
          else ''
        end,
        ''
      ),
      case s.provider when 'mistral' then k.mistral_key when 'freeai' then k.freeai_key when 'nvidia' then k.nvidia_key else k.otro_key end
    ) end
  from public.pilo_ai_settings s
  cross join public.pilo_ai_secret k
  where s.id = 1 and k.id = 1;
$$;

revoke all on function public.pilo_ai_keys_in_use() from public, anon, authenticated;

create or replace function public.pilo_ai_set_key(p_key text, p_which text default 'texto')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := btrim(coalesce(p_key, ''));
  which text := p_which;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración cambia la clave de Mr. Pilo.' using errcode = '42501';
  end if;
  -- «texto» es la del proveedor elegido.
  if which = 'texto' then
    select provider into which from public.pilo_ai_settings where id = 1;
  end if;
  case which
    when 'mistral' then update public.pilo_ai_secret set mistral_key = clean, updated_by = auth.uid(), updated_at = now() where id = 1;
    when 'freeai' then update public.pilo_ai_secret set freeai_key = clean, updated_by = auth.uid(), updated_at = now() where id = 1;
    when 'nvidia' then update public.pilo_ai_secret set nvidia_key = clean, updated_by = auth.uid(), updated_at = now() where id = 1;
    when 'fishaudio' then update public.pilo_ai_secret set fishaudio_key = clean, updated_by = auth.uid(), updated_at = now() where id = 1;
    when 'elevenlabs' then update public.pilo_ai_secret set elevenlabs_key = clean, updated_by = auth.uid(), updated_at = now() where id = 1;
    when 'otro' then update public.pilo_ai_secret set otro_key = clean, updated_by = auth.uid(), updated_at = now() where id = 1;
    when 'voz' then update public.pilo_ai_secret set speech_key = clean, updated_by = auth.uid(), updated_at = now() where id = 1;
    else raise exception 'La clave es de mistral, freeai, nvidia, fishaudio, elevenlabs, otro o voz.';
  end case;
  return case when clean = '' then '' else right(clean, 4) end;
end;
$$;

revoke all on function public.pilo_ai_set_key(text, text) from public;
grant execute on function public.pilo_ai_set_key(text, text) to authenticated;

-- El estado de las claves (lo de 0113) con la de ElevenLabs. Solo los últimos 4.
create or replace function public.pilo_ai_key_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k public.pilo_ai_secret;
  u record;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración ve el estado de las claves.' using errcode = '42501';
  end if;
  select * into k from public.pilo_ai_secret where id = 1;
  select * into u from public.pilo_ai_keys_in_use();
  return jsonb_build_object(
    'keys', jsonb_build_object(
      'mistral', jsonb_build_object('has', k.mistral_key <> '', 'last4', right(k.mistral_key, 4)),
      'freeai', jsonb_build_object('has', k.freeai_key <> '', 'last4', right(k.freeai_key, 4)),
      'nvidia', jsonb_build_object('has', k.nvidia_key <> '', 'last4', right(k.nvidia_key, 4)),
      'fishaudio', jsonb_build_object('has', k.fishaudio_key <> '', 'last4', right(k.fishaudio_key, 4)),
      'elevenlabs', jsonb_build_object('has', k.elevenlabs_key <> '', 'last4', right(k.elevenlabs_key, 4)),
      'otro', jsonb_build_object('has', k.otro_key <> '', 'last4', right(k.otro_key, 4)),
      'voz', jsonb_build_object('has', k.speech_key <> '', 'last4', right(k.speech_key, 4))
    ),
    'has_key', u.text_key <> '',
    'last4', right(u.text_key, 4),
    'has_speech_key', k.speech_key <> '',
    'speech_last4', right(k.speech_key, 4),
    'updated_at', k.updated_at,
    'today', (select count(*) from public.pilo_ai_log l
              where l.space = 'planeacion' and l.created_at >= date_trunc('day', now()) and not l.cached and l.action <> 'voz'),
    'today_voice', (select count(*) from public.pilo_ai_log l
                    where l.space = 'planeacion' and l.created_at >= date_trunc('day', now()) and not l.cached and l.action = 'voz')
  );
end;
$$;

revoke all on function public.pilo_ai_key_status() from public;
grant execute on function public.pilo_ai_key_status() to authenticated;

-- -----------------------------------------------------------------------------
-- pilo_ai_public_config: lo de 0113, y ElevenLabs está lista con su clave y una
-- voz (la de siempre o la de algún estilo).
-- -----------------------------------------------------------------------------
create or replace function public.pilo_ai_public_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', s.enabled and s.base_url <> '' and u.text_key <> '',
    'speech_ready', s.voice_engine = 'proveedor' and u.speech_key <> ''
      and (
        s.speech_provider = 'freeai'
        or (s.speech_provider = 'nvidia' and s.speech_function_id <> '' and jsonb_array_length(s.voice_styles) > 0)
        or (s.speech_provider = 'fishaudio' and exists (select 1 from jsonb_array_elements(s.voice_styles) e where coalesce(e->>'fish_id', '') <> ''))
        or (s.speech_provider = 'elevenlabs' and (s.eleven_voice_id <> '' or exists (select 1 from jsonb_array_elements(s.voice_styles) e where coalesce(e->>'eleven_id', '') <> '')))
        or (s.speech_provider = 'otro' and coalesce(nullif(s.speech_base_url, ''), s.base_url) <> '' and s.speech_model <> '')
      ),
    'functions', s.functions,
    'portals', s.portals,
    'voice_engine', s.voice_engine,
    'voice_rate', s.voice_rate,
    'voice_pitch', s.voice_pitch,
    'voice_expressions', s.voice_expressions,
    'voice_modulation', s.voice_modulation,
    'voice_patterns', s.voice_patterns,
    'pregunta', jsonb_build_object(
      'on', coalesce((s.portals->'pregunta'->>'on')::boolean, false),
      'aud', coalesce(s.portals->'pregunta'->>'aud', 'publico'),
      'welcome', s.pregunta_welcome,
      'ai', s.enabled and s.base_url <> '' and u.text_key <> '' and coalesce((s.functions->>'preguntar')::boolean, true)
    ),
    'widget', jsonb_build_object(
      'on', s.widget_on,
      'origins', to_jsonb(s.widget_origins)
    ),
    'spaces', coalesce((
      select jsonb_object_agg(sp.id, jsonb_build_object(
        'on', sp."on",
        'aud', sp.aud,
        'welcome', sp.welcome,
        'ai', sp.ai and s.enabled and s.base_url <> '' and u.text_key <> '' and coalesce((s.functions->>'preguntar')::boolean, true),
        'name', sp.name,
        'greeting', sp.greeting,
        'ask_rol', sp.ask_rol,
        'roles', jsonb_build_object(
          'estudiante', jsonb_build_object(
            'suggestions', case when jsonb_typeof(sp.roles->'estudiante'->'suggestions') = 'array' then sp.roles->'estudiante'->'suggestions' else '[]'::jsonb end,
            'expression', coalesce(sp.roles->'estudiante'->>'expression', 'feliz'),
            'mood', coalesce(sp.roles->'estudiante'->>'mood', 'emocionado')
          ),
          'profesor', jsonb_build_object(
            'suggestions', case when jsonb_typeof(sp.roles->'profesor'->'suggestions') = 'array' then sp.roles->'profesor'->'suggestions' else '[]'::jsonb end,
            'expression', coalesce(sp.roles->'profesor'->>'expression', 'graduado'),
            'mood', coalesce(sp.roles->'profesor'->>'mood', 'atento')
          )
        ),
        'sources', sp.memory_sources,
        'widget', jsonb_build_object('on', sp.widget_on, 'origins', to_jsonb(sp.widget_origins))
      ))
      from public.pilo_spaces sp
    ), '{}'::jsonb)
  )
  from public.pilo_ai_settings s
  cross join public.pilo_ai_keys_in_use() u
  where s.id = 1;
$$;

revoke all on function public.pilo_ai_public_config() from public;
grant execute on function public.pilo_ai_public_config() to anon, authenticated;


notify pgrst, 'reload schema';

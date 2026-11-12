-- =============================================================================
-- PDI · 0278 · Pilo at Work · Pilo Astra 1.0
--
-- Requiere 0247 (pw_config), 0246 (pw_perfiles) y 0261 (pw_mi_nivel). Idempotente.
--
-- DECISIÓN. Pilo Astra 1.0 es un motor más potente, que la persona elige a mano en el
-- chat de At Work y que la administración habilita desde /admin/pilo-work. Corre en el
-- servidor propio de la universidad (el mismo de la voz de Pilo), no en un proveedor de IA.
--   · pw_config gana los campos astra_*: habilitado (apagado por defecto), el alias del
--     modelo en el servidor (las personas solo ven «Pilo Astra 1.0»), dirección propia
--     opcional, razonamiento por defecto, topes, límite por hora, roles con acceso,
--     formatos de entrega y si se muestra el aviso de lanzamiento.
--   · La clave NO está aquí: es la del servidor propio, que ya guarda Pilo (pilo_ai_secret).
--   · pw_perfiles.astra_aviso_visto_en: el aviso de lanzamiento sale una sola vez por
--     persona, y queda guardado en el servidor (no en el navegador).
--   · pw_astra_publica(): lo que el chat necesita saber (sin direcciones ni modelos).
--   · pw_astra_aviso_visto(): la persona marca el aviso como visto.
--   · Invitados nunca entran a Astra, aunque la lista de roles los incluyera.
--
-- Todo DELETE y UPDATE lleva WHERE (ver 0095).
-- =============================================================================

alter table public.pw_config
  add column if not exists astra_habilitado boolean not null default false,
  add column if not exists astra_modelo text not null default 'pilo-astra:1.0' check (char_length(astra_modelo) <= 120),
  add column if not exists astra_base_url text not null default '' check (char_length(astra_base_url) <= 300),
  add column if not exists astra_razonamiento text not null default 'auto' check (astra_razonamiento in ('auto', 'profundo', 'apagado')),
  add column if not exists astra_max_tokens int not null default 4000 check (astra_max_tokens between 500 and 16000),
  add column if not exists astra_espera_s int not null default 120 check (astra_espera_s between 30 and 600),
  add column if not exists astra_limite_hora int not null default 20 check (astra_limite_hora between 1 and 200),
  add column if not exists astra_subida_max_mb int not null default 25 check (astra_subida_max_mb between 1 and 100),
  add column if not exists astra_roles jsonb not null default '["colaborador","colaborador_correo","coordinacion","admin"]'::jsonb,
  add column if not exists astra_formatos jsonb not null default '{"xlsx":true,"docx":true,"pdf":true,"csv":true,"codigo":true}'::jsonb,
  add column if not exists astra_aviso boolean not null default true;

alter table public.pw_perfiles
  add column if not exists astra_aviso_visto_en timestamptz;

-- Lo que el chat necesita saber de Astra (cualquier persona con rol o invitada).
-- No devuelve el modelo ni la dirección del servidor.
drop function if exists public.pw_astra_publica();
create function public.pw_astra_publica()
returns table (habilitado boolean, roles jsonb, formatos jsonb, aviso boolean, aviso_visto boolean, subida_max_mb int, limite_hora int)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.astra_habilitado,
    c.astra_roles,
    c.astra_formatos,
    c.astra_aviso,
    exists (select 1 from public.pw_perfiles p where p.user_id = auth.uid() and p.astra_aviso_visto_en is not null),
    c.astra_subida_max_mb,
    c.astra_limite_hora
  from public.pw_config c
  where c.id = 1 and public.pw_mi_nivel() is not null;
$$;

-- La persona marca el aviso de lanzamiento como visto (una sola vez).
create or replace function public.pw_astra_aviso_visto()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  update public.pw_perfiles set astra_aviso_visto_en = coalesce(astra_aviso_visto_en, now()) where user_id = auth.uid();
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['pw_astra_publica()', 'pw_astra_aviso_visto()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

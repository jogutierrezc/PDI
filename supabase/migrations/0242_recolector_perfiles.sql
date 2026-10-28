-- =============================================================================
-- PDI · 0242 · Recolector de noticias por perfiles de ranking
--
-- Requiere 0143 y 0144. Idempotente. NO reescribe 0143 ni 0144.
--
-- HALLAZGO: el recolector solo sabe de ODS. `news_items.state` y `news_ods` son
-- una sola decisión por nota, y `news_settings` (0144) una sola configuración de
-- Pilo. Para leer las mismas notas como THE Impact, THE World o UI GreenMetric,
-- cada ranking necesita su propia capa de búsqueda, su propio mínimo para
-- reconocer una noticia y su propia decisión: una nota puede estar aprobada en
-- THE Impact y descartada en UI GreenMetric.
--
-- DECISIÓN: se agregan tablas y no se toca lo que ya hay.
--   news_profiles       una fila por perfil (ods, impact, world, green): si
--                       recibe noticias, umbral, máximo de temas, peso del título,
--                       constante, Pilo (aprueba, confianza), fuentes, temas
--                       activos, palabras propias y modo de publicación. Los
--                       valores de fábrica del perfil ODS son los de hoy: 35, 3,
--                       título ×3, 14, Pilo apagado con 85 y las 7 fuentes; su
--                       Pilo se siembra desde news_settings.
--   news_profile_notes  la decisión de cada nota en impact, world y green:
--                       estado, quién decidió y la lectura de Pilo, como las
--                       columnas de news_items. El perfil ODS sigue usando
--                       news_items y news_ods: los informes ODS no cambian.
--   news_temas          los temas de una nota en un perfil, como texto («ods17»,
--                       «ens», «SI»). Para el perfil ODS guarda solo «propio», la
--                       coincidencia con las palabras propias del perfil.
-- Lo que decidió una persona nunca lo pisa Pilo (regla de 0144): el disparador
-- marca decided_by = 'persona' cuando alguien con sesión cambia el estado.
--
-- Quién puede qué:
--   · Planeación y la administración leen y escriben todo.
--   · La función escribe con la clave de servicio.
--   · El público (anon) lee solo lo aprobado de un perfil abierto, y de
--     news_profile_notes solo news_id, profile y state: nunca ai_* ni decided_by.
--     «Solo intranet» (modo = 'cerrado') cierra el perfil al público, también el
--     de ODS. Sin esta migración, todo sigue como en 0143.
-- Todo UPDATE y DELETE lleva WHERE (safeupdate, ver 0095).
-- =============================================================================

-- Perfiles -----------------------------------------------------------------------
create table if not exists public.news_profiles (
  id           text primary key,
  recibe       boolean not null default false,
  umbral       smallint not null default 35,
  max_temas    smallint not null default 3,
  peso_titulo  smallint not null default 3,
  saturacion   smallint not null default 14,
  pilo_aprueba boolean not null default false,
  umbral_pilo  smallint not null default 85,
  fuentes      text[] not null default '{comunicaciones,investigacion,extension,bucaramanga,cucuta,valledupar,bogota}',
  capas        text[] not null default '{}',
  palabras     text[] not null default '{}',
  modo         text not null default 'persona',
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint news_profiles_id check (id in ('ods', 'impact', 'world', 'green')),
  constraint news_profiles_umbral check (umbral between 10 and 90),
  constraint news_profiles_max check (max_temas between 1 and 6),
  constraint news_profiles_peso check (peso_titulo between 1 and 6),
  constraint news_profiles_sat check (saturacion between 6 and 30),
  constraint news_profiles_umbral_pilo check (umbral_pilo between 50 and 100),
  constraint news_profiles_modo check (modo in ('persona', 'pilo', 'cerrado'))
);

comment on table public.news_profiles is
  'Recolector de noticias (0242): la configuración de cada perfil de ranking (ods, impact, world, green). Solo Planeación y la administración.';

-- Valores de fábrica. El de ODS parte de lo que ya tenía news_settings (0144).
insert into public.news_profiles (id, recibe, capas, modo, pilo_aprueba, umbral_pilo)
select 'ods', true, array(select 'ods' || n::text from generate_series(1, 17) n),
       case when coalesce(s.pilo_aprueba, false) then 'pilo' else 'persona' end,
       coalesce(s.pilo_aprueba, false), coalesce(s.umbral, 85)
  from (select 1) base left join public.news_settings s on s.id = 1
on conflict (id) do nothing;

insert into public.news_profiles (id, recibe, capas, modo) values
  ('impact', true,  '{ods17,ods4,ods5,ods10}', 'persona'),
  ('world',  false, '{ens,ent,cal,int,ind}', 'cerrado'),
  ('green',  false, '{SI,EC,WS,WR,TR,ED,GD}', 'persona')
on conflict (id) do nothing;

-- La decisión de cada nota en los perfiles que no son ODS ---------------------------
create table if not exists public.news_profile_notes (
  news_id       uuid not null references public.news_items (id) on delete cascade,
  profile       text not null,
  state         text not null default 'pending',
  decided_by    text,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  ai_status     text not null default 'none',
  ai_decision   text,
  ai_summary    text,
  ai_confidence smallint,
  ai_error      text,
  ai_at         timestamptz,
  created_at    timestamptz not null default now(),
  primary key (news_id, profile),
  constraint news_profile_notes_profile check (profile in ('impact', 'world', 'green')),
  constraint news_profile_notes_state check (state in ('pending', 'ok', 'no')),
  constraint news_profile_notes_decided_by check (decided_by is null or decided_by in ('persona', 'pilo')),
  constraint news_profile_notes_ai_status check (ai_status in ('none', 'pendiente', 'hecho', 'error')),
  constraint news_profile_notes_ai_decision check (ai_decision is null or ai_decision in ('aprobar', 'revisar', 'descartar')),
  constraint news_profile_notes_ai_confidence check (ai_confidence is null or ai_confidence between 0 and 100)
);

create index if not exists news_profile_notes_estado_idx on public.news_profile_notes (profile, state);
create index if not exists news_profile_notes_pilo_idx on public.news_profile_notes (profile, ai_status, created_at);

comment on table public.news_profile_notes is
  'Recolector de noticias (0242): la decisión de cada nota en THE Impact, THE World y UI GreenMetric. El perfil ODS usa news_items.';

-- Los temas de una nota en un perfil ---------------------------------------------------
create table if not exists public.news_temas (
  news_id   uuid not null references public.news_items (id) on delete cascade,
  profile   text not null,
  tema      text not null,
  score     smallint not null default 0,
  reason    text not null default '',
  manual    boolean not null default false,
  indicator text,
  by_ai     boolean not null default false,
  primary key (news_id, profile, tema),
  constraint news_temas_profile check (profile in ('ods', 'impact', 'world', 'green')),
  constraint news_temas_tema check (length(tema) between 1 and 12),
  constraint news_temas_score check (score between 0 and 100)
);

create index if not exists news_temas_perfil_idx on public.news_temas (profile, tema);

comment on table public.news_temas is
  'Recolector de noticias (0242): los temas de una nota en un perfil (texto: ods17, ens, SI). En el perfil ODS solo «propio».';

-- Quién decidió --------------------------------------------------------------------------
create or replace function public.news_profile_notes_decided_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.state is distinct from old.state and auth.uid() is not null then
    new.decided_by := case when new.state = 'pending' then null else 'persona' end;
  end if;
  return new;
end;
$$;

drop trigger if exists news_profile_notes_decided_by on public.news_profile_notes;
create trigger news_profile_notes_decided_by before update of state on public.news_profile_notes
  for each row execute function public.news_profile_notes_decided_by();

-- ¿Está el perfil abierto al público? ODS, salvo «solo intranet»; los demás, si
-- reciben noticias y no están en «solo intranet». SECURITY DEFINER: anon no lee
-- news_profiles, solo recibe este sí o no.
create or replace function public.news_perfil_abierto(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select f.modo <> 'cerrado' and (f.id = 'ods' or f.recibe) from public.news_profiles f where f.id = p), p = 'ods');
$$;

revoke all on function public.news_perfil_abierto(text) from public;
grant execute on function public.news_perfil_abierto(text) to anon, authenticated, service_role;

-- RLS ---------------------------------------------------------------------------------------
alter table public.news_profiles      enable row level security;
alter table public.news_profile_notes enable row level security;
alter table public.news_temas         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['news_profiles', 'news_profile_notes', 'news_temas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_planeacion', t);
    execute format($p$create policy %I on public.%I for all to authenticated using (public.has_role_at_least('planeacion')) with check (public.has_role_at_least('planeacion'))$p$, t || '_planeacion', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- El público: solo lo aprobado de un perfil abierto, con la lista cerrada de columnas.
drop policy if exists news_profile_notes_publico on public.news_profile_notes;
create policy news_profile_notes_publico on public.news_profile_notes for select to anon, authenticated
  using (state = 'ok' and public.news_perfil_abierto(profile));
revoke select on public.news_profile_notes from anon;
grant select (news_id, profile, state) on public.news_profile_notes to anon;

drop policy if exists news_temas_publico on public.news_temas;
create policy news_temas_publico on public.news_temas for select to anon, authenticated
  using (
    public.news_perfil_abierto(profile)
    and (
      (profile = 'ods' and exists (select 1 from public.news_items i where i.id = news_id and i.state = 'ok'))
      or exists (select 1 from public.news_profile_notes n where n.news_id = news_temas.news_id and n.profile = news_temas.profile and n.state = 'ok')
    )
  );
grant select on public.news_temas to anon;

-- Las notas ya eran públicas si estaban aprobadas (0143); ahora «solo intranet» en
-- ODS las cierra, y una nota aprobada en otro perfil abierto también se puede leer
-- (con la misma lista cerrada de columnas de 0144, sin texto completo ni ai_*).
drop policy if exists news_items_publico on public.news_items;
create policy news_items_publico on public.news_items for select to anon, authenticated
  using (
    (state = 'ok' and public.news_perfil_abierto('ods'))
    or exists (select 1 from public.news_profile_notes n where n.news_id = news_items.id and n.state = 'ok' and public.news_perfil_abierto(n.profile))
  );

drop policy if exists news_ods_publico on public.news_ods;
create policy news_ods_publico on public.news_ods for select to anon, authenticated
  using (public.news_perfil_abierto('ods') and exists (select 1 from public.news_items i where i.id = news_id and i.state = 'ok'));

notify pgrst, 'reload schema';

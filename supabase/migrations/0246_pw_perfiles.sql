-- =============================================================================
-- PDI · 0246 · Pilo at Work · «Mi perfil» (prefijo pw_)
--
-- Requiere 0243. Idempotente.
--
-- HALLAZGO. Pilo trabaja mejor si sabe cómo se llama la persona, qué hace, con qué
-- tono y firma escribe y en qué horario trabaja; hoy solo conoce el nombre y la
-- dependencia del rol.
--
-- DECISIÓN.
--   · pw_perfiles: una fila por persona. RLS estricta: SOLO la dueña lee y escribe su fila.
--     No hay política de administración: la administración no ve el contenido del perfil.
--     La función pilo-work lee el perfil con la clave de servicio, solo para armar el
--     prompt de la propia persona y solo si ella dejó activo «usar mi perfil».
--
-- Todo DELETE y UPDATE lleva WHERE (ver 0095).
-- =============================================================================

create table if not exists public.pw_perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '' check (char_length(nombre) <= 120),
  cargo text not null default '' check (char_length(cargo) <= 120),
  dependencia text not null default '' check (char_length(dependencia) <= 160),
  funciones text not null default '' check (char_length(funciones) <= 1200),
  tono text not null default 'cercano' check (tono in ('formal', 'cercano', 'conciso')),
  idioma text not null default 'es' check (idioma in ('es', 'en', 'pt')),
  firma text not null default '' check (char_length(firma) <= 600),
  horario_inicio text not null default '08:00' check (horario_inicio ~ '^[0-2][0-9]:[0-5][0-9]$'),
  horario_fin text not null default '18:00' check (horario_fin ~ '^[0-2][0-9]:[0-5][0-9]$'),
  zona text not null default 'America/Bogota' check (char_length(zona) <= 60),
  trato text not null default '' check (char_length(trato) <= 400),
  temas text not null default '' check (char_length(temas) <= 400),
  usar_en_respuestas boolean not null default true,
  proponer_cambios boolean not null default true,
  actualizado_en timestamptz not null default now()
);

alter table public.pw_perfiles enable row level security;

drop policy if exists pw_perfiles_duena_select on public.pw_perfiles;
create policy pw_perfiles_duena_select on public.pw_perfiles for select to authenticated
  using (user_id = auth.uid() and public.pw_mi_rol() is not null);

drop policy if exists pw_perfiles_duena_insert on public.pw_perfiles;
create policy pw_perfiles_duena_insert on public.pw_perfiles for insert to authenticated
  with check (user_id = auth.uid() and public.pw_mi_rol() is not null);

drop policy if exists pw_perfiles_duena_update on public.pw_perfiles;
create policy pw_perfiles_duena_update on public.pw_perfiles for update to authenticated
  using (user_id = auth.uid() and public.pw_mi_rol() is not null)
  with check (user_id = auth.uid() and public.pw_mi_rol() is not null);

drop policy if exists pw_perfiles_duena_delete on public.pw_perfiles;
create policy pw_perfiles_duena_delete on public.pw_perfiles for delete to authenticated
  using (user_id = auth.uid() and public.pw_mi_rol() is not null);

grant select, insert, update, delete on table public.pw_perfiles to authenticated;
grant all on table public.pw_perfiles to service_role;

notify pgrst, 'reload schema';

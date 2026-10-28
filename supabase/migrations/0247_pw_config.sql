-- =============================================================================
-- PDI · 0247 · Pilo at Work · configuración global (prefijo pw_)
--
-- Requiere 0243. Idempotente.
--
-- HALLAZGO. Los modelos de IA por nivel, los umbrales, los límites de uso, las funciones
-- habilitadas y la retención de la bitácora estaban fijos en el código de las funciones
-- (o en variables de entorno). La administración de Planeación necesita cambiarlos sin
-- desplegar, desde su panel (/admin/pilo-work), como ya hace con Mr. Pilo.
--
-- DECISIÓN.
--   · pw_config: UNA fila (id = 1) con valores por defecto sensatos. RLS: solo la
--     administración del portal (has_role_at_least('admin')) la lee y la cambia. Las
--     funciones pilo-work y pw-microsoft la leen con la clave de servicio; si la fila falta
--     o un valor falta, usan los mismos valores por defecto (nunca se rompen).
--   · Las CLAVES no están aquí: son las de Mr. Pilo (pilo_ai_secret). Aquí solo se elige
--     proveedor y modelo por nivel; vacío = «automático» (el de la configuración de Pilo).
--   · Cada cambio queda en pw_bitacora (quién, cuándo y QUÉ campos; nunca los valores).
--   · pw_config_publica(): lo que la app /work necesita saber (funciones habilitadas y
--     tope de subida) para cualquier persona con rol.
--   · pw_uso_ia_admin(): solo conteos (sin contenidos) para la pantalla de uso.
--   · pw_purgar_bitacora(): borra lo más viejo que la retención; se programa con cron.
--
-- Todo DELETE y UPDATE lleva WHERE (ver 0095).
-- =============================================================================

create table if not exists public.pw_config (
  id int primary key default 1 check (id = 1),
  rapido_proveedor text not null default '' check (rapido_proveedor in ('', 'mistral', 'nvidia')),
  rapido_modelo text not null default '' check (char_length(rapido_modelo) <= 120),
  capacidad_proveedor text not null default '' check (capacidad_proveedor in ('', 'mistral', 'nvidia')),
  capacidad_modelo text not null default '' check (char_length(capacidad_modelo) <= 120),
  primer_fragmento_s int not null default 7 check (primer_fragmento_s between 2 and 30),
  umbral_capacidad int not null default 12000 check (umbral_capacidad between 2000 and 60000),
  max_tokens int not null default 1500 check (max_tokens between 300 and 4000),
  max_pasos int not null default 5 check (max_pasos between 1 and 8),
  limite_hora int not null default 60 check (limite_hora between 5 and 500),
  subida_max_mb int not null default 100 check (subida_max_mb between 1 and 100),
  retencion_dias int not null default 180 check (retencion_dias between 7 and 1095),
  funciones jsonb not null default '{"chat":true,"cowork":true,"datos":true,"correo":true,"agenda":true,"archivos":true,"equipos":true,"perfil":true}'::jsonb,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

insert into public.pw_config (id) values (1) on conflict (id) do nothing;

alter table public.pw_config enable row level security;

drop policy if exists pw_config_admin_select on public.pw_config;
create policy pw_config_admin_select on public.pw_config for select to authenticated
  using (public.has_role_at_least('admin'));

drop policy if exists pw_config_admin_update on public.pw_config;
create policy pw_config_admin_update on public.pw_config for update to authenticated
  using (public.has_role_at_least('admin') and id = 1)
  with check (public.has_role_at_least('admin') and id = 1);

grant select, update on table public.pw_config to authenticated;
grant all on table public.pw_config to service_role;

-- Quién y cuándo; qué campos cambiaron (no los valores).
create or replace function public.pw_config_registrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare campos text[];
begin
  select coalesce(array_agg(n.key order by n.key), '{}') into campos
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on o.key = n.key
  where n.value is distinct from o.value and n.key not in ('actualizado_en', 'actualizado_por');
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  if array_length(campos, 1) is not null then
    insert into public.pw_bitacora (user_id, accion, detalle)
    values (auth.uid(), 'config', jsonb_build_object('campos', to_jsonb(campos)));
  end if;
  return new;
end;
$$;

drop trigger if exists pw_config_registrar on public.pw_config;
create trigger pw_config_registrar before update on public.pw_config
  for each row execute function public.pw_config_registrar();

-- Lo que la app necesita saber (cualquier persona con rol).
create or replace function public.pw_config_publica()
returns table (funciones jsonb, subida_max_mb int)
language sql
stable
security definer
set search_path = public
as $$
  select c.funciones, c.subida_max_mb from public.pw_config c where c.id = 1 and public.pw_mi_rol() is not null;
$$;

-- Uso de la IA: solo conteos, sin contenidos.
create or replace function public.pw_uso_ia_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not public.has_role_at_least('admin') then
    return null;
  end if;
  select jsonb_build_object(
    'personas_por_rol', coalesce((select jsonb_object_agg(rol, n) from (select rol, count(*) n from public.pw_roles group by rol) x), '{}'::jsonb),
    'mensajes_hoy', (select count(*) from public.pw_bitacora where accion = 'chat'
                      and (creado_en at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date),
    'mensajes_7d', (select count(*) from public.pw_bitacora where accion = 'chat' and creado_en > now() - interval '7 days'),
    'por_modelo_7d', coalesce((select jsonb_agg(jsonb_build_object('proveedor', p, 'modelo', m, 'nivel', nv, 'n', n) order by n desc)
                      from (select detalle->>'proveedor' p, detalle->>'modelo' m, detalle->>'nivel' nv, count(*) n
                            from public.pw_bitacora where detalle ? 'modelo' and creado_en > now() - interval '7 days'
                            group by 1, 2, 3) y), '[]'::jsonb),
    'conmutaciones_7d', (select count(*) from public.pw_bitacora where creado_en > now() - interval '7 days' and detalle->>'conmutado' = 'true'),
    'errores_7d', (select count(*) from public.pw_bitacora where creado_en > now() - interval '7 days' and detalle ? 'error'),
    'errores_recientes', coalesce((select jsonb_agg(jsonb_build_object('cuando', creado_en, 'accion', accion, 'error', left(detalle->>'error', 160)) order by creado_en desc)
                      from (select creado_en, accion, detalle from public.pw_bitacora where detalle ? 'error' order by creado_en desc limit 8) z), '[]'::jsonb),
    'ms_conectados', (select count(*) from public.pw_ms_tokens),
    'ms_correo', (select count(*) from public.pw_ms_tokens where scopes ilike '%Mail.Read%'),
    'ms_agenda', (select count(*) from public.pw_ms_tokens where scopes ilike '%Calendars%'),
    'ms_archivos', (select count(*) from public.pw_ms_tokens where scopes ilike '%Files.ReadWrite%')
  ) into r;
  return r;
end;
$$;

-- Retención de la bitácora (programar con pg_cron o el cron de Coolify, p. ej. cada día).
create or replace function public.pw_purgar_bitacora()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.pw_bitacora
  where creado_en < now() - make_interval(days => coalesce((select retencion_dias from public.pw_config where id = 1), 180));
  get diagnostics n = row_count;
  return n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['pw_config_publica()', 'pw_uso_ia_admin()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  revoke all on function public.pw_purgar_bitacora() from public, anon, authenticated;
  grant execute on function public.pw_purgar_bitacora() to service_role;
end $$;

notify pgrst, 'reload schema';

-- Programar la retención (una vez, si hay pg_cron):
--   select cron.schedule('pw-purgar-bitacora', '15 3 * * *', $$select public.pw_purgar_bitacora()$$);

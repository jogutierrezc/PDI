-- =============================================================================
-- PDI · 0245 · Pilo at Work · Pilo for Teams (prefijo pw_)
--
-- Requiere 0243. Idempotente.
--
-- HALLAZGO. Un equipo de trabajo necesita un solo Pilo que sepa lo que cada integrante
-- aceptó compartir, y un chat del equipo en tiempo real. La memoria personal (pw_memoria)
-- es de cada quien y no debe leerse por el equipo sin su permiso.
--
-- DECISIÓN.
--   · pw_equipos, pw_equipo_miembros (invitado → activo), pw_equipo_asociados (un equipo
--     usa también la memoria compartida de otro, sin ver conversaciones).
--   · pw_equipo_aportes: el CONSENTIMIENTO por aporte. Una fila = una regla de pw_memoria
--     que su dueña aceptó compartir con ese equipo; la retira borrando la fila (o apagando
--     la regla). Pilo del equipo solo lee lo aportado (y activo) más la colectiva.
--     La RLS de pw_memoria NO cambia: el equipo lee los aportes con la función
--     pw_equipo_memoria(), que devuelve solo el texto aportado y quién lo aportó.
--   · pw_equipo_mensajes: la conversación, en Realtime. Pilo escribe con service_role.
--   · pw_equipo_personas(): a quién invitar (personas con rol: nombre y dependencia).
--
-- Todo DELETE y UPDATE lleva WHERE (ver 0095).
-- =============================================================================

create table if not exists public.pw_equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 120),
  descripcion text not null default '' check (char_length(descripcion) <= 300),
  color text not null default 'k1',
  incluye_colectiva boolean not null default true,
  creado_por uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);

create table if not exists public.pw_equipo_miembros (
  equipo_id uuid not null references public.pw_equipos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null default '',
  estado text not null default 'invitado' check (estado in ('invitado', 'activo')),
  funcion text not null default 'integrante' check (funcion in ('creador', 'integrante')),
  creado_en timestamptz not null default now(),
  primary key (equipo_id, user_id)
);
create index if not exists pw_equipo_miembros_user_idx on public.pw_equipo_miembros (user_id);

create table if not exists public.pw_equipo_asociados (
  equipo_id uuid not null references public.pw_equipos(id) on delete cascade,
  asociado_id uuid not null references public.pw_equipos(id) on delete cascade,
  primary key (equipo_id, asociado_id),
  check (equipo_id <> asociado_id)
);

create table if not exists public.pw_equipo_aportes (
  equipo_id uuid not null references public.pw_equipos(id) on delete cascade,
  memoria_id uuid not null references public.pw_memoria(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (equipo_id, memoria_id)
);

create table if not exists public.pw_equipo_mensajes (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.pw_equipos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  autor text not null default '',
  es_pilo boolean not null default false,
  texto text not null check (char_length(texto) between 1 and 4000),
  fuentes jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists pw_equipo_mensajes_idx on public.pw_equipo_mensajes (equipo_id, creado_en);

alter table public.pw_documentos drop constraint if exists pw_documentos_equipo_fk;
alter table public.pw_documentos add constraint pw_documentos_equipo_fk foreign key (equipo_id) references public.pw_equipos(id) on delete set null;

-- ¿Es integrante activo (o creador) de este equipo?
create or replace function public.pw_es_miembro(p_equipo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pw_mi_rol() is not null and exists (
    select 1 from public.pw_equipo_miembros m where m.equipo_id = p_equipo and m.user_id = auth.uid() and m.estado = 'activo'
  );
$$;

create or replace function public.pw_es_invitado(p_equipo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.pw_equipo_miembros m where m.equipo_id = p_equipo and m.user_id = auth.uid());
$$;

alter table public.pw_equipos enable row level security;
alter table public.pw_equipo_miembros enable row level security;
alter table public.pw_equipo_asociados enable row level security;
alter table public.pw_equipo_aportes enable row level security;
alter table public.pw_equipo_mensajes enable row level security;

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('pw_equipos', 'pw_equipo_miembros', 'pw_equipo_asociados', 'pw_equipo_aportes', 'pw_equipo_mensajes') and policyname like 'pw\_%' escape '\'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Equipos: los ven integrantes e invitados; cualquier persona con rol crea; edita su creador.
create policy pw_equipos_ver on public.pw_equipos for select to authenticated using (public.pw_es_invitado(id) or creado_por = auth.uid());
create policy pw_equipos_crear on public.pw_equipos for insert to authenticated with check (creado_por = auth.uid() and public.pw_mi_rol() is not null);
create policy pw_equipos_editar on public.pw_equipos for update to authenticated using (creado_por = auth.uid()) with check (creado_por = auth.uid());
create policy pw_equipos_borrar on public.pw_equipos for delete to authenticated using (creado_por = auth.uid());

-- Miembros: se ven entre sí; el creador invita y quita; cada quien acepta o sale por su propia fila.
create policy pw_miembros_ver on public.pw_equipo_miembros for select to authenticated using (public.pw_es_invitado(equipo_id) or user_id = auth.uid());
create policy pw_miembros_invitar on public.pw_equipo_miembros for insert to authenticated with check (
  exists (select 1 from public.pw_equipos e where e.id = equipo_id and e.creado_por = auth.uid())
  and (
    (user_id = auth.uid() and funcion = 'creador' and estado = 'activo')
    or (user_id <> auth.uid() and funcion = 'integrante' and estado = 'invitado')
  )
);
create policy pw_miembros_aceptar on public.pw_equipo_miembros for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pw_miembros_quitar on public.pw_equipo_miembros for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.pw_equipos e where e.id = equipo_id and e.creado_por = auth.uid())
);

create policy pw_asociados_ver on public.pw_equipo_asociados for select to authenticated using (public.pw_es_miembro(equipo_id));
create policy pw_asociados_crear on public.pw_equipo_asociados for insert to authenticated with check (
  exists (select 1 from public.pw_equipos e where e.id = equipo_id and e.creado_por = auth.uid())
);
create policy pw_asociados_quitar on public.pw_equipo_asociados for delete to authenticated using (
  exists (select 1 from public.pw_equipos e where e.id = equipo_id and e.creado_por = auth.uid())
);

-- Aportes: solo su dueña los crea y los retira; el equipo los lee con pw_equipo_memoria().
create policy pw_aportes_propios on public.pw_equipo_aportes for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and public.pw_es_miembro(equipo_id)
    and exists (select 1 from public.pw_memoria m where m.id = memoria_id and m.user_id = auth.uid())
  );
create policy pw_aportes_ver_equipo on public.pw_equipo_aportes for select to authenticated using (public.pw_es_miembro(equipo_id));

-- Mensajes: los lee y escribe el equipo (escribe como sí mismo; Pilo escribe con service_role).
create policy pw_mensajes_ver on public.pw_equipo_mensajes for select to authenticated using (public.pw_es_miembro(equipo_id));
create policy pw_mensajes_escribir on public.pw_equipo_mensajes for insert to authenticated
  with check (user_id = auth.uid() and es_pilo = false and public.pw_es_miembro(equipo_id));

-- Lo aportado: el texto, quién lo aportó y si sigue activo; nada más de la memoria personal.
create or replace function public.pw_equipo_memoria(p_equipo uuid)
returns table (memoria_id uuid, texto text, aporta_id uuid, aporta text, activo boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.texto, a.user_id, coalesce(nullif(q.nombre, ''), 'Integrante'), (m.activa and m.estado = 'aceptada')
  from public.pw_equipo_aportes a
  join public.pw_memoria m on m.id = a.memoria_id
  left join public.pw_equipo_miembros q on q.equipo_id = a.equipo_id and q.user_id = a.user_id
  where a.equipo_id = p_equipo and public.pw_es_miembro(p_equipo)
  order by a.creado_en;
$$;

-- A quién invitar: las personas con rol (nombre y dependencia), sin correos.
create or replace function public.pw_equipo_personas()
returns table (user_id uuid, nombre text, dependencia text)
language sql
stable
security definer
set search_path = public
as $$
  select r.user_id, r.nombre, r.dependencia from public.pw_roles r where public.pw_mi_rol() is not null and r.user_id <> auth.uid() order by r.nombre;
$$;

do $$
declare f text;
begin
  foreach f in array array['pw_es_miembro(uuid)', 'pw_es_invitado(uuid)', 'pw_equipo_memoria(uuid)', 'pw_equipo_personas()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

grant select, insert, update, delete on table public.pw_equipos, public.pw_equipo_miembros, public.pw_equipo_asociados, public.pw_equipo_aportes, public.pw_equipo_mensajes to authenticated;
grant all on table public.pw_equipos, public.pw_equipo_miembros, public.pw_equipo_asociados, public.pw_equipo_aportes, public.pw_equipo_mensajes to service_role;

-- Realtime para la conversación.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pw_equipo_mensajes') then
    alter publication supabase_realtime add table public.pw_equipo_mensajes;
  end if;
end $$;

notify pgrst, 'reload schema';

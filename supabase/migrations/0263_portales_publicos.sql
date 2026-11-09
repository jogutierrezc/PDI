-- =============================================================================
-- PDI · 0263 · Portales públicos · habilitar o deshabilitar cada portal y cambiar el menú
--
-- Requiere 0002 (has_role_at_least) y la tabla profiles. Idempotente. Todo UPDATE y DELETE lleva
-- WHERE (safeupdate, 0095).
--
-- QUÉ ES
--  La administración (solo el rol admin) decide, sin tocar el código:
--   1. Qué portales públicos están abiertos. Un portal deshabilitado muestra a quien entra por el
--      enlace directo una página de mantenimiento (mensaje y fecha de regreso opcionales), sale del
--      menú público y del buscador (Ctrl+K) y no se indexa. La administración lo sigue viendo,
--      con una franja de aviso.
--   2. Cómo se ve el menú público: por cada vínculo se puede ocultar, cambiar la etiqueta y
--      cambiar el destino, con un periodo (desde/hasta) para que vuelva solo al original.
--      No se reordena ni se agregan vínculos: son SOBREESCRITURAS sobre los vínculos que hoy están
--      escritos en el código (src/modules/admin/portales-publicos/registro.ts da a cada uno su clave).
--
-- LAS TRES TABLAS
--  pub_portales   un renglón por portal: slug, prefijos de ruta que gobierna, habilitado, mensaje y regreso
--  pub_menu       SOLO sobreescrituras, una por clave de vínculo; sin fila = el comportamiento original
--  pub_bitacora   quién cambió qué y cuándo, con el antes y el después; la llenan disparadores
--
-- QUIÉN VE QUÉ
--  El público no lee las tablas: llama a pub_estado(), una sola función (security definer, stable)
--  que devuelve los portales y el menú con `vigente` YA calculado en el servidor.
--  Escribir y leer la bitácora: solo has_role_at_least('admin').
--
-- DESTINOS SEGUROS
--  Un destino es una ruta interna («/…», sin «//» ni «/\» al comienzo) o una dirección https://.
--  javascript:, data: y cualquier otro esquema los rechaza el CHECK.
--
-- LA APLICACIÓN FALLA ABIERTA
--  Si esta migración no está aplicada, la función no existe o la red falla, el portal público
--  funciona como siempre: nada se oculta y nada se bloquea.
-- =============================================================================

-- --- Portales -----------------------------------------------------------------------------------

create table if not exists public.pub_portales (
  slug        text primary key,
  nombre      text not null,
  descripcion text not null default '',
  -- Prefijos de ruta que gobierna. «/» vale solo para la portada exacta; los demás, para la ruta y todo lo que cuelga de ella.
  rutas       text[] not null default '{}',
  orden       int not null default 0,
  habilitado  boolean not null default true,
  mensaje     text not null default '',
  regreso     timestamptz,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint pub_portales_slug check (slug ~ '^[a-z0-9-]{2,40}$'),
  constraint pub_portales_mensaje check (length(mensaje) <= 600)
);

insert into public.pub_portales (slug, nombre, descripcion, rutas, orden) values
  ('planeacion',     'Planeación Institucional',      'La portada de la oficina y la página del equipo.',                                   array['/', '/equipo'], 1),
  ('pdi',            'Plan de Desarrollo (PDI)',      'Portal PDI, implementación, tablero, facultades, campus, ODS y desarrollo tecnológico.', array['/pdi', '/implementacion', '/tablero', '/facultades', '/campus', '/ods', '/desarrollo-tecnologico'], 2),
  ('cifras',        'UDES en Cifras',                 'Los informes oficiales con cifras abiertas.',                                         array['/datos-abiertos'], 3),
  ('boletines',     'Boletines',                      'El boletín estadístico, en línea y en PDF.',                                          array['/datos-abiertos/boletines'], 4),
  ('observatorio',  'Observatorio de Analítica',      'Los catorce temas del Observatorio y sus páginas, y el Observatorio insertado en otras páginas.', array['/datos-abiertos/observatorio', '/obs-embed'], 5),
  ('sostenible',    'UDES Sostenible',                'Rankings, informes de ODS, tableros y evidencias de sostenibilidad.',                 array['/sostenible'], 6),
  ('documentos',    'Repositorio documental',         'Actas, normativa, informes y soportes históricos.',                                   array['/documentos'], 7),
  ('impacto',       'Portal de Impacto',              'Fichas de impacto por vicerrectoría, facultad y programa (pide sesión).',            array['/impacto'], 8),
  ('oferta',        'Oferta de programas',            'La oferta académica por programa y campus (pide sesión).',                            array['/oferta'], 9),
  ('pilo',          'Pregúntele a Pilo',              'El chat de Mr. Pilo para toda la Universidad y su política de uso.',                  array['/pregunta', '/pilo-politica'], 10),
  ('pilo-ensenanza','Mr. Pilo en Enseñanza',          'El segundo Pilo, para la docencia.',                                                  array['/pilo-ensenanza'], 11),
  ('pilo-widget',   'Chat emergente de Pilo',         'El chat que otros portales insertan con public/pilo.js (marcos /pilo-embed).',        array['/pilo-embed', '/pilo-ensenanza-embed'], 12),
  ('pilo-app',      'Pilo móvil (PWA)',               'La aplicación móvil de Mr. Pilo.',                                                    array['/app'], 13),
  ('pilo-work',     'Pilo at Work',                   'El espacio de trabajo con Pilo (pide un rol asignado).',                              array['/work'], 14),
  ('agentes',       'Portal de agentes',              'El soporte con agentes reales (pide ingreso propio).',                                array['/agentes'], 15),
  ('rutas',         'Rutas del bus UDES',             'La ruta, las paradas y el horario del bus.',                                          array['/rutas'], 16),
  ('tableros',      'Tableros de unidades',           'Los tableros de cada unidad que se publican con dirección propia.',                   array['/tableros'], 17),
  ('cms-paginas',   'Páginas del CMS',                'La landing de la UDES y los micrositios publicados desde CMS Portales.',              array['/portales'], 18),
  ('encuestas',     'Encuestas públicas',             'Las encuestas con Pilo.',                                                             array['/encuesta'], 19),
  ('firma',         'Firma y verificación',           'Firma electrónica de convenios y verificación de firmas (enlaces con token).',        array['/firma', '/verificar'], 20),
  ('contactos',     'Contactos de Internacionalización', 'El enlace de invitación para completar un contacto (con token).',                 array['/contactos'], 21)
on conflict (slug) do nothing;

-- --- Menú: solo sobreescrituras -------------------------------------------------------------------

create table if not exists public.pub_menu (
  clave             text primary key,
  portal            text not null references public.pub_portales (slug) on update cascade on delete cascade,
  -- Informativa: lo que decía el código cuando se guardó la sobreescritura.
  etiqueta_original text not null default '',
  oculto            boolean not null default false,
  etiqueta          text,
  destino           text,
  -- Sin fechas, la sobreescritura rige mientras exista la fila.
  desde             timestamptz,
  hasta             timestamptz,
  nota              text not null default '',
  updated_by        uuid references public.profiles (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint pub_menu_clave    check (clave ~ '^[a-z0-9][a-z0-9._-]{1,118}$'),
  constraint pub_menu_etiqueta check (etiqueta is null or length(btrim(etiqueta)) between 1 and 80),
  constraint pub_menu_nota     check (length(nota) <= 400),
  constraint pub_menu_periodo  check (desde is null or hasta is null or hasta > desde),
  -- Solo rutas internas o https://. Nada de javascript:, data:, // ni /\ al comienzo, ni espacios o controles.
  constraint pub_menu_destino  check (
    destino is null
    or (
      length(destino) <= 500
      and destino !~ '[[:space:][:cntrl:]]'
      and (destino ~ '^/([^/\\]|$)' or destino ~* '^https://[^/]')
    )
  )
);

create index if not exists pub_menu_portal_idx on public.pub_menu (portal);

-- --- Bitácora -------------------------------------------------------------------------------------

create table if not exists public.pub_bitacora (
  id           bigint generated always as identity primary key,
  actor        uuid,
  actor_nombre text not null default '',
  accion       text not null,
  clave        text not null,
  antes        jsonb,
  despues      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists pub_bitacora_fecha_idx on public.pub_bitacora (created_at desc);

-- --- Disparadores ---------------------------------------------------------------------------------

-- Quién y cuándo, siempre del servidor (no se confía en lo que mande el navegador).
create or replace function public.pub_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pub_portales_touch on public.pub_portales;
create trigger pub_portales_touch before update on public.pub_portales
  for each row execute function public.pub_touch();

drop trigger if exists pub_menu_touch on public.pub_menu;
create trigger pub_menu_touch before insert or update on public.pub_menu
  for each row execute function public.pub_touch();

-- La bitácora: security definer porque nadie escribe en ella desde el navegador.
create or replace function public.pub_registrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_nombre text := '';
  v_accion text;
  v_clave  text;
  v_antes  jsonb;
  v_desp   jsonb;
begin
  select coalesce(nullif(btrim(full_name), ''), email, '') into v_nombre from public.profiles where id = v_actor;

  if tg_table_name = 'pub_portales' then
    v_clave := new.slug;
    v_antes := to_jsonb(old) - 'updated_at' - 'updated_by' - 'rutas';
    v_desp  := to_jsonb(new) - 'updated_at' - 'updated_by' - 'rutas';
    if v_antes = v_desp then return null; end if;
    v_accion := case
      when old.habilitado and not new.habilitado then 'portal.deshabilitar'
      when not old.habilitado and new.habilitado then 'portal.habilitar'
      else 'portal.editar' end;
  elsif tg_op = 'INSERT' then
    v_clave := new.clave; v_accion := 'menu.crear';
    v_antes := null; v_desp := to_jsonb(new) - 'updated_at' - 'updated_by';
  elsif tg_op = 'UPDATE' then
    v_clave := new.clave; v_accion := 'menu.cambiar';
    v_antes := to_jsonb(old) - 'updated_at' - 'updated_by';
    v_desp  := to_jsonb(new) - 'updated_at' - 'updated_by';
    if v_antes = v_desp then return null; end if;
  else
    v_clave := old.clave; v_accion := 'menu.restaurar';
    v_antes := to_jsonb(old) - 'updated_at' - 'updated_by'; v_desp := null;
  end if;

  insert into public.pub_bitacora (actor, actor_nombre, accion, clave, antes, despues)
  values (v_actor, v_nombre, v_accion, v_clave, v_antes, v_desp);
  return null;
end;
$$;

revoke all on function public.pub_registrar() from public;

drop trigger if exists pub_portales_log on public.pub_portales;
create trigger pub_portales_log after update on public.pub_portales
  for each row execute function public.pub_registrar();

drop trigger if exists pub_menu_log on public.pub_menu;
create trigger pub_menu_log after insert or update or delete on public.pub_menu
  for each row execute function public.pub_registrar();

-- --- Quién ve y escribe ---------------------------------------------------------------------------

alter table public.pub_portales enable row level security;
alter table public.pub_menu     enable row level security;
alter table public.pub_bitacora enable row level security;

revoke all on public.pub_portales from anon, authenticated;
revoke all on public.pub_menu     from anon, authenticated;
revoke all on public.pub_bitacora from anon, authenticated;

drop policy if exists pub_portales_admin on public.pub_portales;
create policy pub_portales_admin on public.pub_portales for all to authenticated
  using (public.has_role_at_least('admin')) with check (public.has_role_at_least('admin'));

drop policy if exists pub_menu_admin on public.pub_menu;
create policy pub_menu_admin on public.pub_menu for all to authenticated
  using (public.has_role_at_least('admin')) with check (public.has_role_at_least('admin'));

drop policy if exists pub_bitacora_admin on public.pub_bitacora;
create policy pub_bitacora_admin on public.pub_bitacora for select to authenticated
  using (public.has_role_at_least('admin'));

-- Los portales no se crean ni se borran ni cambian de rutas desde el navegador: solo estos tres campos.
grant select on public.pub_portales to authenticated;
grant update (habilitado, mensaje, regreso) on public.pub_portales to authenticated;
grant select, insert, update, delete on public.pub_menu to authenticated;
grant select on public.pub_bitacora to authenticated;
grant all on public.pub_portales, public.pub_menu, public.pub_bitacora to service_role;

-- --- La única lectura pública ----------------------------------------------------------------------

-- Una sola llamada: los portales y el menú, con `vigente` ya calculado con la hora del servidor.
-- Sin fechas, una sobreescritura es vigente mientras exista la fila. No devuelve notas ni autores.
create or replace function public.pub_estado()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'portales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', p.slug,
        'rutas', to_jsonb(p.rutas),
        'habilitado', p.habilitado,
        'mensaje', p.mensaje,
        'regreso', p.regreso
      ) order by p.orden)
      from public.pub_portales p
    ), '[]'::jsonb),
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clave', m.clave,
        'portal', m.portal,
        'oculto', m.oculto,
        'etiqueta', m.etiqueta,
        'destino', m.destino,
        'vigente', (m.desde is null or now() >= m.desde) and (m.hasta is null or now() < m.hasta)
      ) order by m.clave)
      from public.pub_menu m
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.pub_estado() from public;
grant execute on function public.pub_estado() to anon, authenticated, service_role;

comment on function public.pub_estado() is
  'Estado público de los portales y del menú, con vigente calculado en el servidor (0263).';

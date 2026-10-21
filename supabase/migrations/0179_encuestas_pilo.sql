-- =============================================================================
-- 0179 · Encuestas con Pilo
--
-- Pilo recopila, por un enlace público, los «logros» y «retos» con cifras que las
-- dependencias de la UDES aportan a una encuesta. La primera, para los videos de
-- la Rendición de Cuentas Institucional 2026 (slug `rendicion-2026`). El personal
-- las ve y las gestiona en una tabla dentro de la intranet.
--
--   enc_encuestas   la encuesta: slug del enlace, título, año, mensajes de Pilo
--                   (intro y despedida), si está abierta y hasta cuándo.
--   enc_aportes     un logro o un reto de una dependencia, con el correo de quien
--                   lo envió (verificado por Microsoft) y su estado de revisión:
--                   recibido → revisado → para_video.
--   enc_cifras      las cifras de un aporte: qué es, de qué tipo (estudiantes,
--                   programas, porcentaje, dinero u otro) y su valor.
--
--   enc_enviar(p_slug, p_correo, p_verificado, p_dependencia, p_aportes)
--       Guarda un envío completo (varios aportes con sus cifras) de forma atómica
--       y devuelve {recibidos, cifras}. Valida todo otra vez: encuesta existente,
--       abierta y vigente, textos, cifras y límites. SOLO la función `encuestas`
--       (rol de servicio) puede ejecutarla: nadie inserta aportes desde el cliente.
--
-- Quién puede qué (la base lo hace cumplir):
--   · Ver: la pantalla «encuestas» del rol de acceso (has_screen) y capacidad de
--     Responsable o más (enc_puede_ver).
--   · Editar la encuesta (título, mensajes, abierta, cierre) y cambiar el estado de
--     los aportes: la misma pantalla y capacidad de Planeación o más
--     (enc_puede_editar). Del aporte solo se puede cambiar `estado`; nada se
--     borra desde el portal.
--   · Los roles de acceso hechos a mano que ya veían Rutas o Reportes reciben la
--     pantalla; los de fábrica (all_screens) ya la tienen.
--
-- Requiere 0001 (set_updated_at) y 0024 (has_screen, has_role_at_least).
-- Vuelta atrás: cerrar la encuesta (abierta = false) detiene los envíos. Las
-- tablas pueden quedarse. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

create or replace function public.enc_puede_ver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_screen('encuestas') and public.has_role_at_least('responsable');
$$;

create or replace function public.enc_puede_editar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_screen('encuestas') and public.has_role_at_least('planeacion');
$$;

comment on function public.enc_puede_ver() is 'Encuestas con Pilo (0179): ¿puede quien pregunta ver las encuestas y sus aportes?';
comment on function public.enc_puede_editar() is 'Encuestas con Pilo (0179): ¿puede quien pregunta editar encuestas y cambiar el estado de los aportes?';

revoke all on function public.enc_puede_ver() from public, anon;
revoke all on function public.enc_puede_editar() from public, anon;
grant execute on function public.enc_puede_ver() to authenticated, service_role;
grant execute on function public.enc_puede_editar() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.enc_encuestas (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  titulo     text not null,
  anio       text not null default '',
  abierta    boolean not null default true,
  cierra_el  date,
  intro      text not null default '',
  despedida  text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enc_encuestas_slug check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  constraint enc_encuestas_titulo check (length(btrim(titulo)) between 3 and 200),
  constraint enc_encuestas_textos check (length(intro) <= 1000 and length(despedida) <= 1000 and length(anio) <= 20)
);

comment on table public.enc_encuestas is
  'Encuestas con Pilo (0179): cada encuesta pública, con su enlace (slug), mensajes y cierre.';

create table if not exists public.enc_aportes (
  id                uuid primary key default gen_random_uuid(),
  encuesta_id       uuid not null references public.enc_encuestas (id) on delete cascade,
  correo            text not null,
  correo_verificado boolean not null default false,
  dependencia       text not null,
  tipo              text not null,
  titulo            text not null,
  descripcion       text not null,
  estado            text not null default 'recibido',
  created_at        timestamptz not null default now(),
  constraint enc_aportes_tipo check (tipo in ('logro', 'reto')),
  constraint enc_aportes_estado check (estado in ('recibido', 'revisado', 'para_video')),
  constraint enc_aportes_correo check (correo ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' and length(correo) <= 200),
  constraint enc_aportes_dependencia check (length(dependencia) between 3 and 90),
  constraint enc_aportes_titulo check (length(titulo) between 5 and 120),
  constraint enc_aportes_descripcion check (length(descripcion) between 20 and 500)
);

create index if not exists enc_aportes_encuesta_idx on public.enc_aportes (encuesta_id, created_at desc);

comment on table public.enc_aportes is
  'Encuestas con Pilo (0179): un logro o reto de una dependencia. Solo se inserta con enc_enviar; el personal cambia únicamente `estado`.';

create table if not exists public.enc_cifras (
  id        uuid primary key default gen_random_uuid(),
  aporte_id uuid not null references public.enc_aportes (id) on delete cascade,
  orden     int not null default 0,
  que       text not null,
  tipo      text not null,
  otro      text,
  valor     numeric not null,
  constraint enc_cifras_que check (length(que) between 2 and 80),
  constraint enc_cifras_tipo check (tipo in ('estudiantes', 'programas', 'porcentaje', 'dinero', 'otro')),
  constraint enc_cifras_otro check (
    (tipo = 'otro' and otro is not null and otro ~ '^[[:alpha:]]{2,20}$') or (tipo <> 'otro' and otro is null)
  ),
  constraint enc_cifras_valor check (valor >= 0 and (tipo <> 'porcentaje' or valor <= 100))
);

create index if not exists enc_cifras_aporte_idx on public.enc_cifras (aporte_id, orden);

comment on table public.enc_cifras is
  'Encuestas con Pilo (0179): las cifras de un aporte (qué mide, de qué tipo, su valor).';

drop trigger if exists enc_encuestas_set_updated_at on public.enc_encuestas;
create trigger enc_encuestas_set_updated_at
  before update on public.enc_encuestas
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS y permisos de columna
-- -----------------------------------------------------------------------------

alter table public.enc_encuestas enable row level security;
alter table public.enc_aportes   enable row level security;
alter table public.enc_cifras    enable row level security;

drop policy if exists enc_encuestas_select on public.enc_encuestas;
create policy enc_encuestas_select on public.enc_encuestas
  for select to authenticated using (public.enc_puede_ver());

drop policy if exists enc_encuestas_update on public.enc_encuestas;
create policy enc_encuestas_update on public.enc_encuestas
  for update to authenticated using (public.enc_puede_editar()) with check (public.enc_puede_editar());

drop policy if exists enc_aportes_select on public.enc_aportes;
create policy enc_aportes_select on public.enc_aportes
  for select to authenticated using (public.enc_puede_ver());

drop policy if exists enc_aportes_update on public.enc_aportes;
create policy enc_aportes_update on public.enc_aportes
  for update to authenticated using (public.enc_puede_editar()) with check (public.enc_puede_editar());

drop policy if exists enc_cifras_select on public.enc_cifras;
create policy enc_cifras_select on public.enc_cifras
  for select to authenticated using (public.enc_puede_ver());

revoke all on public.enc_encuestas, public.enc_aportes, public.enc_cifras from public, anon, authenticated;
grant select on public.enc_encuestas, public.enc_aportes, public.enc_cifras to authenticated;
grant update (titulo, anio, abierta, cierra_el, intro, despedida) on public.enc_encuestas to authenticated;
grant update (estado) on public.enc_aportes to authenticated;
grant select, insert, update, delete on public.enc_encuestas, public.enc_aportes, public.enc_cifras to service_role;

-- -----------------------------------------------------------------------------
-- La primera encuesta
-- -----------------------------------------------------------------------------

insert into public.enc_encuestas (slug, titulo, anio, abierta, cierra_el, intro, despedida)
values (
  'rendicion-2026',
  'Construyamos juntos la Rendición de Cuentas Institucional 2026',
  '2026',
  true,
  date '2026-11-15',
  'Estoy recopilando cifras de las dependencias de la UDES para armar los insumos de los videos con los retos y logros de cada una.',
  'Esto no es la rendición de cuentas: es un insumo para el video institucional de cifras. Su aporte es muy valioso.'
)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- enc_enviar: un envío completo, atómico y validado de nuevo
--
-- p_aportes: [{tipo, titulo, descripcion, cifras:[{que, tipo, otro?, valor}]}]
-- Códigos: P0002 la encuesta no existe · P0003 cerrada o vencida · 22023 dato no válido.
-- -----------------------------------------------------------------------------

create or replace function public.enc_enviar(p_slug text, p_correo text, p_verificado boolean, p_dependencia text, p_aportes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.enc_encuestas;
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_dep text := btrim(coalesce(p_dependencia, ''));
  a jsonb;
  c jsonb;
  v_aporte uuid;
  v_n int := 0;
  v_cifras int := 0;
  v_i int := 0;
  v_j int;
  v_tipo text;
  v_titulo text;
  v_desc text;
  v_que text;
  v_ctipo text;
  v_otro text;
  v_valor numeric;
begin
  select * into e from public.enc_encuestas where slug = p_slug;
  if not found then
    raise exception 'Esta encuesta no existe.' using errcode = 'P0002';
  end if;
  if not e.abierta or (e.cierra_el is not null and (now() at time zone 'America/Bogota')::date > e.cierra_el) then
    raise exception 'Esta encuesta ya está cerrada.' using errcode = 'P0003';
  end if;
  if v_correo !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' or length(v_correo) > 200 then
    raise exception 'correo: el correo no tiene forma de correo.' using errcode = '22023';
  end if;
  if length(v_dep) < 3 or length(v_dep) > 90 then
    raise exception 'dependencia: escriba la dependencia (entre 3 y 90 letras).' using errcode = '22023';
  end if;
  if p_aportes is null or jsonb_typeof(p_aportes) <> 'array' or jsonb_array_length(p_aportes) = 0 then
    raise exception 'aportes: agregue al menos un logro o un reto.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_aportes) > 30 then
    raise exception 'aportes: el máximo es 30 por envío.' using errcode = '22023';
  end if;

  for a in select value from jsonb_array_elements(p_aportes) loop
    v_i := v_i + 1;
    v_tipo := coalesce(a ->> 'tipo', '');
    v_titulo := btrim(coalesce(a ->> 'titulo', ''));
    v_desc := btrim(coalesce(a ->> 'descripcion', ''));
    if v_tipo not in ('logro', 'reto') then
      raise exception 'aportes[%].tipo: elija logro o reto.', v_i using errcode = '22023';
    end if;
    if length(v_titulo) < 5 or length(v_titulo) > 120 then
      raise exception 'aportes[%].titulo: el título lleva entre 5 y 120 letras.', v_i using errcode = '22023';
    end if;
    if length(v_desc) < 20 or length(v_desc) > 500 then
      raise exception 'aportes[%].descripcion: la descripción lleva entre 20 y 500 letras.', v_i using errcode = '22023';
    end if;
    if jsonb_typeof(coalesce(a -> 'cifras', '[]'::jsonb)) <> 'array' then
      raise exception 'aportes[%].cifras: formato no válido.', v_i using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(a -> 'cifras', '[]'::jsonb)) > 12 then
      raise exception 'aportes[%].cifras: el máximo es 12 por aporte.', v_i using errcode = '22023';
    end if;

    insert into public.enc_aportes (encuesta_id, correo, correo_verificado, dependencia, tipo, titulo, descripcion)
    values (e.id, v_correo, coalesce(p_verificado, false), v_dep, v_tipo, v_titulo, v_desc)
    returning id into v_aporte;
    v_n := v_n + 1;

    v_j := 0;
    for c in select value from jsonb_array_elements(coalesce(a -> 'cifras', '[]'::jsonb)) loop
      v_j := v_j + 1;
      v_que := btrim(coalesce(c ->> 'que', ''));
      v_ctipo := coalesce(c ->> 'tipo', '');
      v_otro := nullif(btrim(coalesce(c ->> 'otro', '')), '');
      if length(v_que) < 2 or length(v_que) > 80 then
        raise exception 'aportes[%].cifras[%].que: describa la cifra (entre 2 y 80 letras).', v_i, v_j using errcode = '22023';
      end if;
      if v_ctipo not in ('estudiantes', 'programas', 'porcentaje', 'dinero', 'otro') then
        raise exception 'aportes[%].cifras[%].tipo: tipo de cifra no válido.', v_i, v_j using errcode = '22023';
      end if;
      if v_ctipo = 'otro' and (v_otro is null or v_otro !~ '^[[:alpha:]]{2,20}$') then
        raise exception 'aportes[%].cifras[%].otro: escriba una sola palabra (entre 2 y 20 letras).', v_i, v_j using errcode = '22023';
      end if;
      if v_ctipo <> 'otro' then v_otro := null; end if;
      begin
        v_valor := (c ->> 'valor')::numeric;
      exception when others then
        raise exception 'aportes[%].cifras[%].valor: escriba un número.', v_i, v_j using errcode = '22023';
      end;
      if v_valor is null or v_valor < 0 or v_valor = 'NaN'::numeric then
        raise exception 'aportes[%].cifras[%].valor: el valor no puede ser negativo.', v_i, v_j using errcode = '22023';
      end if;
      if v_ctipo = 'porcentaje' and v_valor > 100 then
        raise exception 'aportes[%].cifras[%].valor: un porcentaje no pasa de 100.', v_i, v_j using errcode = '22023';
      end if;
      insert into public.enc_cifras (aporte_id, orden, que, tipo, otro, valor)
      values (v_aporte, v_j, v_que, v_ctipo, v_otro, v_valor);
      v_cifras := v_cifras + 1;
    end loop;
  end loop;

  return jsonb_build_object('recibidos', v_n, 'cifras', v_cifras);
end;
$$;

comment on function public.enc_enviar(text, text, boolean, text, jsonb) is
  'Encuestas con Pilo (0179): guarda un envío completo de forma atómica. Solo la función `encuestas`, con el rol de servicio.';

revoke all on function public.enc_enviar(text, text, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.enc_enviar(text, text, boolean, text, jsonb) to service_role;

-- La pantalla «encuestas» en los roles hechos a mano que ya veían Rutas o Reportes
update public.access_roles
   set screens = array_append(screens, 'encuestas')
 where not all_screens
   and not ('encuestas' = any (screens))
   and screens && array['rutas', 'reportes']::text[];

notify pgrst, 'reload schema';

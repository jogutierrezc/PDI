-- =============================================================================
-- 0167 · Internacionalización: Contactos (enlace público de invitación)
--
-- Personas invitadas, sin cuenta, comparten contactos académicos o de
-- empleadores con la Oficina de Internacionalización. Entran con un enlace de
-- invitación, se identifican (nombre, cargo en la UDES, correo institucional) y
-- aportan uno a uno o importando un archivo. Todo cae en una carpeta de Tablas:
--
--   carpeta «Contactos»
--     · «Contactos académicos»       (11 columnas, la plantilla de Rua)
--     · «Contactos de empleadores»   (10 columnas, la plantilla de Rua)
--   ambas Multicampus (0166): cada fila guarda campus, quién la aportó, cuándo y
--   por dónde entró.
--
--   int_invitaciones    el enlace: token, periodo, campus (o a elegir), correos
--                       permitidos, tipos, máximo por persona, vencimiento.
--   int_aportantes      quién aportó: nombre, cargo y correo declarados. El correo
--                       NO está verificado (no hay envío de correos todavía):
--                       `correo_verificado` queda en falso para poder activarlo.
--   int_filas.aportante_id / canal
--                       de quién es la fila y si entró por el enlace o la cargó el
--                       equipo.
--   int_libros.plantilla_contactos
--                       marca las dos tablas de contactos y su plantilla.
--
-- Quién puede qué:
--   · Crear y ver invitaciones: Director, Planeación y Coordinadores (como crear
--     carpetas, 0166). Cambiar o borrar: su autor, o quien controla Multicampus.
--   · Preparar la carpeta y las dos tablas: quien controla Multicampus.
--   · Aportar: la persona del enlace, SOLO por la función `int-contactos` (clave de
--     servicio): las funciones int_contactos_* no las llama nadie más.
--
-- Reglas del aporte (lo hace cumplir la base, no solo la pantalla):
--   · la invitación debe estar activa, vigente y con el periodo abierto;
--   · la persona solo escribe y borra SUS filas;
--   · el correo del contacto es la identidad: si ya está, no se duplica. Si lo
--     aportó la misma persona, se actualiza; si lo aportó otra, se conserva;
--   · cuando el campus envía su hoja a revisión, ya no entran más contactos;
--   · máximo por persona (por defecto 200).
--
-- Requiere 0151 (int_*) y 0166 (carpetas, Multicampus). Idempotente.
-- Todo DELETE lleva WHERE (safeupdate, ver 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.int_invitaciones (
  id                 uuid primary key default gen_random_uuid(),
  token              text not null unique default translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_'),
  nombre             text not null,
  periodo_id         uuid not null references public.int_periodos (id) on delete cascade,
  -- Nulo: la persona elige su campus al entrar.
  campus_id          uuid references public.campuses (id) on delete restrict,
  dominios           text[] not null default '{udes.edu.co}',
  tipos              text[] not null default '{academico,empleador}',
  limite_por_persona integer not null default 200,
  vence              date not null,
  estado             text not null default 'activa',
  created_by         uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint int_invitaciones_nombre check (char_length(btrim(nombre)) between 1 and 120),
  constraint int_invitaciones_limite check (limite_por_persona between 1 and 2000),
  constraint int_invitaciones_estado check (estado in ('activa', 'pausada')),
  constraint int_invitaciones_tipos check (cardinality(tipos) > 0 and tipos <@ array['academico', 'empleador']),
  constraint int_invitaciones_token check (token ~ '^[A-Za-z0-9_-]{8,40}$')
);

comment on table public.int_invitaciones is
  'Contactos (0167): el enlace público de invitación. El token es el secreto: solo lo leen quienes crean invitaciones.';

drop trigger if exists int_invitaciones_set_updated_at on public.int_invitaciones;
create trigger int_invitaciones_set_updated_at before update on public.int_invitaciones
  for each row execute function public.set_updated_at();

create table if not exists public.int_aportantes (
  id                uuid primary key default gen_random_uuid(),
  invitacion_id     uuid not null references public.int_invitaciones (id) on delete restrict,
  nombre            text not null,
  cargo             text not null,
  correo            text not null,
  campus_id         uuid not null references public.campuses (id) on delete restrict,
  -- Lo declara la persona. Pasará a verdadero cuando se confirme por correo (aún no se envían correos).
  correo_verificado boolean not null default false,
  -- SHA-256 del secreto de sesión que guarda su navegador; nunca el secreto.
  sesion_hash       text not null,
  creado_en         timestamptz not null default now(),
  ultimo_envio      timestamptz,
  constraint int_aportantes_nombre check (char_length(btrim(nombre)) between 3 and 160),
  constraint int_aportantes_cargo check (char_length(btrim(cargo)) between 2 and 120),
  constraint int_aportantes_correo check (correo ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$')
);

create unique index if not exists int_aportantes_correo_idx on public.int_aportantes (invitacion_id, lower(correo));
create index if not exists int_aportantes_invitacion_idx on public.int_aportantes (invitacion_id, creado_en);

comment on table public.int_aportantes is
  'Contactos (0167): quién aportó por un enlace. Nombre, cargo y correo son lo que la persona declaró; correo_verificado dice si se confirmó.';

alter table public.int_filas
  add column if not exists aportante_id uuid references public.int_aportantes (id) on delete restrict,
  add column if not exists canal text not null default 'interno';
alter table public.int_filas drop constraint if exists int_filas_canal;
alter table public.int_filas add constraint int_filas_canal check (canal in ('interno', 'enlace'));
create index if not exists int_filas_aportante_idx on public.int_filas (aportante_id) where aportante_id is not null;

comment on column public.int_filas.aportante_id is 'Contactos (0167): quien aportó la fila por un enlace público; nulo si la cargó el equipo.';
comment on column public.int_filas.canal is 'interno: la cargó el equipo con su cuenta · enlace: llegó por una invitación pública.';

alter table public.int_libros add column if not exists plantilla_contactos text;
alter table public.int_libros drop constraint if exists int_libros_plantilla_contactos;
alter table public.int_libros add constraint int_libros_plantilla_contactos check (plantilla_contactos is null or plantilla_contactos in ('academica', 'empleadores'));
create unique index if not exists int_libros_plantilla_contactos_idx on public.int_libros (plantilla_contactos) where plantilla_contactos is not null;

comment on column public.int_libros.plantilla_contactos is 'Contactos (0167): marca las tablas de contactos y su plantilla (academica | empleadores).';

-- -----------------------------------------------------------------------------
-- 2. Preparar la carpeta y las dos tablas (quien controla Multicampus)
-- -----------------------------------------------------------------------------

/** Las columnas de cada plantilla, con la cabecera original de Rua. Espejo: supabase/functions/int-contactos/contactos.ts. */
create or replace function public.int_contactos_columnas(p_codigo text)
returns table (clave text, etiqueta text, obligatoria boolean, orden integer)
language sql
immutable
as $$
  select v.clave, v.etiqueta, v.obligatoria, v.orden from (
    values
      ('academica', 'propio_source', 'Source', false, 1),
      ('academica', 'propio_title', 'Title', false, 2),
      ('academica', 'propio_first_name', 'First Name', true, 3),
      ('academica', 'propio_last_name', 'Last Name', true, 4),
      ('academica', 'propio_job_title', 'Job Title', true, 5),
      ('academica', 'propio_department', 'Department', false, 6),
      ('academica', 'propio_institution', 'Institution', false, 7),
      ('academica', 'propio_country', 'Country or Territory', false, 8),
      ('academica', 'propio_email', 'Email', true, 9),
      ('academica', 'propio_subject', 'Subject', false, 10),
      ('academica', 'propio_phone', 'Phone (Optional)', false, 11),
      ('empleadores', 'propio_source', 'Source', false, 1),
      ('empleadores', 'propio_title', 'Title', false, 2),
      ('empleadores', 'propio_first_name', 'First Name', true, 3),
      ('empleadores', 'propio_last_name', 'Last Name', true, 4),
      ('empleadores', 'propio_position', 'Position', true, 5),
      ('empleadores', 'propio_industry', 'Industry', false, 6),
      ('empleadores', 'propio_company_name', 'Company Name', false, 7),
      ('empleadores', 'propio_country', 'Country or Territory', false, 8),
      ('empleadores', 'propio_email', 'Email', true, 9),
      ('empleadores', 'propio_phone', 'Phone (Optional)', false, 10)
  ) v (codigo, clave, etiqueta, obligatoria, orden)
  where v.codigo = p_codigo
  order by v.orden;
$$;

/**
 * Crea (o completa) la carpeta «Contactos» y sus dos tablas Multicampus con las
 * columnas de las plantillas de Rua. Idempotente: no toca lo que ya está. Devuelve
 * {carpeta_id, tablas: [{codigo, libro_id, hoja_id}]}.
 */
create or replace function public.int_contactos_preparar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_carpeta uuid;
  v_libro uuid;
  v_hoja uuid;
  d record;
  v_salida jsonb := '[]'::jsonb;
begin
  if not public.int_controla_multicampus() then
    raise exception 'Solo el Director, Planeación o el Coordinador de Bucaramanga preparan los contactos.' using errcode = '42501';
  end if;

  select c.id into v_carpeta from public.int_carpetas c where c.parent_id is null and lower(btrim(c.nombre)) = 'contactos';
  if v_carpeta is null then
    insert into public.int_carpetas (nombre) values ('Contactos') returning id into v_carpeta;
  end if;

  for d in select * from (values ('academica', 'Contactos académicos'), ('empleadores', 'Contactos de empleadores')) t (codigo, nombre) loop
    select l.id into v_libro from public.int_libros l where l.plantilla_contactos = d.codigo;
    if v_libro is null then
      select l.id into v_libro from public.int_libros l where l.nombre = d.nombre;
      if v_libro is not null then
        update public.int_libros set plantilla_contactos = d.codigo where id = v_libro;
      else
        insert into public.int_libros (nombre, captura, carpeta_id, plantilla_contactos, descripcion)
        values (d.nombre, 'multicampus', v_carpeta, d.codigo, 'Contactos que llegan por el enlace de invitación y los que carga el equipo.')
        returning id into v_libro;
      end if;
    end if;

    select h.id into v_hoja from public.int_hojas h where h.libro_id = v_libro order by h.orden, h.created_at limit 1;
    if v_hoja is null then
      insert into public.int_hojas (libro_id, nombre, clase, orden) values (v_libro, 'Contactos', 'general', 1) returning id into v_hoja;
    end if;

    insert into public.int_columnas (hoja_id, clave, etiqueta, tipo, concepto_id, obligatorio, orden)
    select v_hoja, c.clave, c.etiqueta, 'texto', null, c.obligatoria, c.orden
      from public.int_contactos_columnas(d.codigo) c
    on conflict (hoja_id, clave) do nothing;

    v_salida := v_salida || jsonb_build_object('codigo', d.codigo, 'libro_id', v_libro, 'hoja_id', v_hoja);
  end loop;

  return jsonb_build_object('carpeta_id', v_carpeta, 'tablas', v_salida);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Al crear una invitación, las hojas de contactos quedan con ventana si no la tenían
--    (así el equipo puede corregir filas a mano en Tablas; el enlace público no la necesita)
-- -----------------------------------------------------------------------------

create or replace function public.int_invitaciones_ventana()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.int_ventanas (periodo_id, hoja_id, campus_id, abre, cierra)
  select new.periodo_id, h.id, null, least(public.int_hoy(), new.vence), new.vence
    from public.int_libros l
    join public.int_hojas h on h.libro_id = l.id
   where l.plantilla_contactos is not null
     and not exists (select 1 from public.int_ventanas v where v.periodo_id = new.periodo_id and v.hoja_id = h.id and v.campus_id is null);
  return new;
end;
$$;

drop trigger if exists int_invitaciones_ventana_trg on public.int_invitaciones;
create trigger int_invitaciones_ventana_trg after insert on public.int_invitaciones
  for each row execute function public.int_invitaciones_ventana();

-- -----------------------------------------------------------------------------
-- 4. El aporte público (solo la función int-contactos, con la clave de servicio)
-- -----------------------------------------------------------------------------

/** Cómo está la invitación hoy: activa | pausada | vencida | periodo_cerrado. */
create or replace function public.int_contactos_estado(i public.int_invitaciones)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when i.estado = 'pausada' then 'pausada'
    when public.int_hoy() > i.vence then 'vencida'
    when not exists (select 1 from public.int_periodos p where p.id = i.periodo_id and p.estado = 'abierto') then 'periodo_cerrado'
    else 'activa'
  end;
$$;

/** Lo que la página pública necesita saber de un enlace (sin secretos). Nulo si no existe. */
create or replace function public.int_contactos_invitacion(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i public.int_invitaciones;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{8,40}$' then
    return null;
  end if;
  select * into i from public.int_invitaciones where token = p_token;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'nombre', i.nombre,
    'estado', public.int_contactos_estado(i),
    'vence', i.vence,
    'periodo', (select p.codigo from public.int_periodos p where p.id = i.periodo_id),
    'campus', (select jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code) from public.campuses c where c.id = i.campus_id),
    'campuses', case when i.campus_id is null
      then (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code) order by c.position), '[]'::jsonb) from public.campuses c)
      else '[]'::jsonb end,
    'tipos', to_jsonb(i.tipos),
    'dominios', to_jsonb(i.dominios),
    'limite', i.limite_por_persona
  );
end;
$$;

/** La invitación, o un error en español si no sirve para recibir contactos. */
create or replace function public.int_contactos_activa(p_token text)
returns public.int_invitaciones
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i public.int_invitaciones;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{8,40}$' then
    raise exception 'Este enlace no es válido.' using errcode = 'P0002';
  end if;
  select * into i from public.int_invitaciones where token = p_token;
  if not found then
    raise exception 'Este enlace no es válido.' using errcode = 'P0002';
  end if;
  case public.int_contactos_estado(i)
    when 'pausada' then raise exception 'La invitación está en pausa. Pida a la oficina que la reactive.' using errcode = 'P0003';
    when 'vencida' then raise exception 'La invitación venció el %.', to_char(i.vence, 'DD/MM/YYYY') using errcode = 'P0003';
    when 'periodo_cerrado' then raise exception 'El periodo de esta invitación ya cerró.' using errcode = 'P0003';
    else null;
  end case;
  return i;
end;
$$;

/** La persona de la sesión, o un error si el secreto no es el suyo. */
create or replace function public.int_contactos_sesion(i public.int_invitaciones, p_aportante uuid, p_hash text)
returns public.int_aportantes
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.int_aportantes;
begin
  select * into a from public.int_aportantes where id = p_aportante and invitacion_id = i.id;
  if not found or p_hash is null or a.sesion_hash <> p_hash then
    raise exception 'Su sesión venció. Vuelva a identificarse.' using errcode = 'P0004';
  end if;
  return a;
end;
$$;

/** La hoja donde cae un tipo de contacto. */
create or replace function public.int_contactos_hoja(p_tipo text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  select h.id into v
    from public.int_libros l join public.int_hojas h on h.libro_id = l.id
   where l.plantilla_contactos = case p_tipo when 'academico' then 'academica' when 'empleador' then 'empleadores' else '-' end
   order by h.orden, h.created_at
   limit 1;
  if v is null then
    raise exception 'La oficina todavía no preparó la carpeta de contactos.' using errcode = 'P0005';
  end if;
  return v;
end;
$$;

/** Deja de la fila solo las columnas de la hoja, recortadas a 200 caracteres y sin vacíos. */
create or replace function public.int_contactos_limpiar(p_hoja uuid, p_datos jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(s.clave, s.valor), '{}'::jsonb)
    from (
      select c.clave, left(btrim(p_datos ->> c.clave), 200) as valor
        from public.int_columnas c
       where c.hoja_id = p_hoja
    ) s
   where s.valor is not null and s.valor <> '';
$$;

/** Qué pasaría con cada fila: crear | actualizar | omitir | error (y por qué). Entrada: [{fila, datos}]. */
create or replace function public.int_contactos_clasificar(i public.int_invitaciones, a public.int_aportantes, p_tipo text, p_filas jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoja uuid := public.int_contactos_hoja(p_tipo);
  v_otra uuid := public.int_contactos_hoja(case p_tipo when 'academico' then 'empleador' else 'academico' end);
  r record;
  v_datos jsonb;
  v_error text;
  v_correo text;
  v_previa record;
  v_vistos text[] := '{}';
  v_salida jsonb := '[]'::jsonb;
  v_accion text;
  v_motivo text;
  v_id uuid;
begin
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas deben llegar como una lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 500 then
    raise exception 'Son % filas: el máximo por envío es 500.', jsonb_array_length(p_filas) using errcode = '22023';
  end if;

  for r in select e.v, e.n from jsonb_array_elements(p_filas) with ordinality as e (v, n) loop
    v_datos := public.int_contactos_limpiar(v_hoja, r.v -> 'datos');
    v_error := public.int_validar_datos(v_hoja, v_datos);
    v_correo := lower(coalesce(v_datos ->> 'propio_email', ''));
    v_accion := 'crear';
    v_motivo := null;
    v_id := null;
    if v_error is not null then
      v_accion := 'error';
      v_motivo := v_error;
    elsif v_correo = '' then
      v_accion := 'error';
      v_motivo := 'Falta el correo.';
    elsif v_correo = any (v_vistos) then
      v_accion := 'omitir';
      v_motivo := 'El correo está repetido en este envío.';
    else
      select f.id, f.aportante_id into v_previa
        from public.int_filas f
       where f.hoja_id = v_hoja and f.periodo_id = i.periodo_id and lower(f.datos ->> 'propio_email') = v_correo
       limit 1;
      if found then
        if v_previa.aportante_id = a.id then
          v_accion := 'actualizar';
          v_id := v_previa.id;
        else
          v_accion := 'omitir';
          v_motivo := 'Otra persona ya lo aportó.';
        end if;
      elsif exists (
        select 1 from public.int_filas f
         where f.hoja_id = v_otra and f.periodo_id = i.periodo_id and lower(f.datos ->> 'propio_email') = v_correo
      ) then
        v_accion := 'omitir';
        v_motivo := 'Ya está en la otra lista (académicos o empleadores).';
      end if;
    end if;
    if v_correo <> '' then
      v_vistos := v_vistos || v_correo;
    end if;
    v_salida := v_salida || jsonb_build_object(
      'fila', coalesce((r.v ->> 'fila')::integer, r.n::integer),
      'accion', v_accion,
      'motivo', v_motivo,
      'id', v_id,
      'datos', case when v_accion in ('crear', 'actualizar') then v_datos else null end
    );
  end loop;
  return v_salida;
end;
$$;

/** ¿Puede el campus de la persona recibir más contactos? Mientras su hoja siga en borrador. */
create or replace function public.int_contactos_abierta(i public.int_invitaciones, a public.int_aportantes, p_tipo text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.int_estado_envio(i.periodo_id, public.int_contactos_hoja(p_tipo), a.campus_id) <> 'borrador' then
    raise exception 'La revisión de este campus ya empezó: ya no se reciben más contactos.' using errcode = 'P0006';
  end if;
end;
$$;

/** Identifica a la persona (la crea o la reconoce por su correo) y le da una sesión nueva. */
create or replace function public.int_contactos_identificar(p_token text, p_nombre text, p_cargo text, p_correo text, p_campus uuid, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.int_invitaciones := public.int_contactos_activa(p_token);
  v_campus uuid := coalesce(i.campus_id, p_campus);
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_dominio text := split_part(lower(btrim(coalesce(p_correo, ''))), '@', 2);
  a public.int_aportantes;
begin
  if p_hash is null or length(p_hash) <> 64 then
    raise exception 'Sesión no válida.' using errcode = '22023';
  end if;
  if v_campus is null or not exists (select 1 from public.campuses c where c.id = v_campus) then
    raise exception 'Elija su campus.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 or length(btrim(coalesce(p_cargo, ''))) < 2 then
    raise exception 'Escriba su nombre completo y su cargo.' using errcode = '22023';
  end if;
  if v_correo !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' then
    raise exception 'El correo no tiene forma de correo.' using errcode = '22023';
  end if;
  if cardinality(i.dominios) > 0 and not exists (
    select 1 from unnest(i.dominios) d where v_dominio = lower(d) or v_dominio like '%.' || lower(d)
  ) then
    raise exception 'Use su correo institucional.' using errcode = '22023';
  end if;
  if (select count(*) from public.int_aportantes x where x.invitacion_id = i.id and x.creado_en > now() - interval '1 hour') > 80 then
    raise exception 'Hay demasiados ingresos seguidos. Intente de nuevo en un rato.' using errcode = 'P0007';
  end if;

  insert into public.int_aportantes (invitacion_id, nombre, cargo, correo, campus_id, sesion_hash)
  values (i.id, btrim(p_nombre), btrim(p_cargo), v_correo, v_campus, p_hash)
  on conflict (invitacion_id, (lower(correo))) do update
    set nombre = excluded.nombre, cargo = excluded.cargo, campus_id = excluded.campus_id, sesion_hash = excluded.sesion_hash
  returning * into a;

  return jsonb_build_object(
    'aportante_id', a.id, 'nombre', a.nombre, 'cargo', a.cargo, 'correo', a.correo, 'campus_id', a.campus_id,
    'enviados', (select count(*) from public.int_filas f where f.aportante_id = a.id and f.periodo_id = i.periodo_id)
  );
end;
$$;

/** Qué haría el envío con cada fila, sin guardar nada (la vista previa del archivo). */
create or replace function public.int_contactos_revisar(p_token text, p_aportante uuid, p_hash text, p_tipo text, p_filas jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i public.int_invitaciones := public.int_contactos_activa(p_token);
  a public.int_aportantes := public.int_contactos_sesion(i, p_aportante, p_hash);
begin
  if not (p_tipo = any (i.tipos)) then
    raise exception 'Esta invitación no recibe contactos de ese tipo.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'filas', public.int_contactos_clasificar(i, a, p_tipo, p_filas),
    'enviados', (select count(*) from public.int_filas f where f.aportante_id = a.id and f.periodo_id = i.periodo_id),
    'limite', i.limite_por_persona
  );
end;
$$;

/** Guarda las filas válidas. Devuelve lo que pasó con cada una y los totales. */
create or replace function public.int_contactos_recibir(p_token text, p_aportante uuid, p_hash text, p_tipo text, p_filas jsonb, p_origen text, p_archivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.int_invitaciones := public.int_contactos_activa(p_token);
  a public.int_aportantes := public.int_contactos_sesion(i, p_aportante, p_hash);
  v_hoja uuid := public.int_contactos_hoja(p_tipo);
  v_res jsonb;
  r jsonb;
  v_nuevas integer;
  v_enviados integer;
  v_orden integer;
  v_archivo text := nullif(left(btrim(coalesce(p_archivo, '')), 200), '');
  v_creadas integer := 0;
  v_actualizadas integer := 0;
begin
  if p_origen not in ('manual', 'excel') then
    raise exception 'Origen no válido.' using errcode = '22023';
  end if;
  if not (p_tipo = any (i.tipos)) then
    raise exception 'Esta invitación no recibe contactos de ese tipo.' using errcode = '42501';
  end if;
  perform public.int_contactos_abierta(i, a, p_tipo);

  v_res := public.int_contactos_clasificar(i, a, p_tipo, p_filas);
  select count(*) into v_nuevas from jsonb_array_elements(v_res) x where x ->> 'accion' = 'crear';
  select count(*) into v_enviados from public.int_filas f where f.aportante_id = a.id and f.periodo_id = i.periodo_id;
  if v_enviados + v_nuevas > i.limite_por_persona then
    raise exception 'Superaría el máximo de % contactos por persona (usted lleva %).', i.limite_por_persona, v_enviados using errcode = 'P0008';
  end if;

  select coalesce(max(f.orden), 0) into v_orden from public.int_filas f where f.hoja_id = v_hoja and f.periodo_id = i.periodo_id and f.campus_id = a.campus_id;

  for r in select x from jsonb_array_elements(v_res) x loop
    if r ->> 'accion' = 'crear' then
      v_orden := v_orden + 1;
      insert into public.int_filas (hoja_id, periodo_id, campus_id, datos, orden, origen, archivo, aportante_id, canal)
      values (v_hoja, i.periodo_id, a.campus_id, r -> 'datos', v_orden, p_origen, case when p_origen = 'excel' then v_archivo end, a.id, 'enlace');
      v_creadas := v_creadas + 1;
    elsif r ->> 'accion' = 'actualizar' then
      update public.int_filas
         set datos = r -> 'datos', origen = p_origen, archivo = case when p_origen = 'excel' then v_archivo end, updated_at = now()
       where id = (r ->> 'id')::uuid and aportante_id = a.id;
      v_actualizadas := v_actualizadas + 1;
    end if;
  end loop;

  update public.int_aportantes set ultimo_envio = now() where id = a.id;

  return jsonb_build_object(
    'filas', v_res,
    'creadas', v_creadas,
    'actualizadas', v_actualizadas,
    'omitidas', (select count(*) from jsonb_array_elements(v_res) x where x ->> 'accion' = 'omitir'),
    'errores', (select count(*) from jsonb_array_elements(v_res) x where x ->> 'accion' = 'error'),
    'enviados', v_enviados + v_creadas,
    'limite', i.limite_por_persona
  );
end;
$$;

/** Lo que esta persona ya envió en este periodo, de las dos listas. */
create or replace function public.int_contactos_mis(p_token text, p_aportante uuid, p_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i public.int_invitaciones := public.int_contactos_activa(p_token);
  a public.int_aportantes := public.int_contactos_sesion(i, p_aportante, p_hash);
begin
  return jsonb_build_object(
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id,
               'tipo', case l.plantilla_contactos when 'academica' then 'academico' else 'empleador' end,
               'datos', f.datos, 'origen', f.origen, 'archivo', f.archivo, 'creado', f.created_at
             ) order by f.created_at desc)
        from (select * from public.int_filas where aportante_id = a.id and periodo_id = i.periodo_id order by created_at desc limit 2000) f
        join public.int_hojas h on h.id = f.hoja_id
        join public.int_libros l on l.id = h.libro_id
    ), '[]'::jsonb),
    'limite', i.limite_por_persona
  );
end;
$$;

/** Quita filas propias (mientras el campus no haya enviado su hoja). */
create or replace function public.int_contactos_quitar(p_token text, p_aportante uuid, p_hash text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.int_invitaciones := public.int_contactos_activa(p_token);
  a public.int_aportantes := public.int_contactos_sesion(i, p_aportante, p_hash);
  v_borradas integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'Elija entre 1 y 500 contactos.' using errcode = '22023';
  end if;
  perform public.int_contactos_abierta(i, a, 'academico');
  delete from public.int_filas f where f.id = any (p_ids) and f.aportante_id = a.id and f.periodo_id = i.periodo_id;
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. RLS y permisos
-- -----------------------------------------------------------------------------

alter table public.int_invitaciones enable row level security;
alter table public.int_aportantes   enable row level security;

revoke all on public.int_invitaciones, public.int_aportantes from public, anon, authenticated;
grant select, insert, update, delete on public.int_invitaciones to authenticated;
-- La persona de un enlace no tiene cuenta: el equipo ve quién aportó, pero nunca el hash de sesión.
grant select (id, invitacion_id, nombre, cargo, correo, campus_id, correo_verificado, creado_en, ultimo_envio) on public.int_aportantes to authenticated;

drop policy if exists int_invitaciones_read on public.int_invitaciones;
create policy int_invitaciones_read on public.int_invitaciones for select to authenticated
  using (public.int_puede_crear());
drop policy if exists int_invitaciones_insert on public.int_invitaciones;
create policy int_invitaciones_insert on public.int_invitaciones for insert to authenticated
  with check (public.int_puede_crear());
drop policy if exists int_invitaciones_update on public.int_invitaciones;
create policy int_invitaciones_update on public.int_invitaciones for update to authenticated
  using (public.int_controla_multicampus() or (created_by = auth.uid() and public.int_puede_crear()))
  with check (public.int_controla_multicampus() or (created_by = auth.uid() and public.int_puede_crear()));
drop policy if exists int_invitaciones_delete on public.int_invitaciones;
create policy int_invitaciones_delete on public.int_invitaciones for delete to authenticated
  using (public.int_controla_multicampus() or (created_by = auth.uid() and public.int_puede_crear()));

drop policy if exists int_aportantes_read on public.int_aportantes;
create policy int_aportantes_read on public.int_aportantes for select to authenticated
  using (public.int_ve_modulo());

revoke all on function public.int_contactos_columnas(text) from public, anon;
revoke all on function public.int_contactos_preparar() from public, anon;
grant execute on function public.int_contactos_columnas(text) to authenticated;
grant execute on function public.int_contactos_preparar() to authenticated;

-- El aporte público: solo la clave de servicio (la función int-contactos).
do $$
declare
  f text;
begin
  foreach f in array array[
    'int_contactos_estado(public.int_invitaciones)',
    'int_contactos_invitacion(text)',
    'int_contactos_activa(text)',
    'int_contactos_sesion(public.int_invitaciones, uuid, text)',
    'int_contactos_hoja(text)',
    'int_contactos_limpiar(uuid, jsonb)',
    'int_contactos_clasificar(public.int_invitaciones, public.int_aportantes, text, jsonb)',
    'int_contactos_abierta(public.int_invitaciones, public.int_aportantes, text)',
    'int_contactos_identificar(text, text, text, text, uuid, text)',
    'int_contactos_revisar(text, uuid, text, text, jsonb)',
    'int_contactos_recibir(text, uuid, text, text, jsonb, text, text)',
    'int_contactos_mis(text, uuid, text)',
    'int_contactos_quitar(text, uuid, text, uuid[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

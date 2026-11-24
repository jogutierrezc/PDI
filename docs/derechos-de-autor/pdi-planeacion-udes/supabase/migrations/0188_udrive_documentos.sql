-- =============================================================================
-- UDrive · fase 2 (0188): el documento por bloques.
--
-- Un archivo de tipo «documento» guarda en `contenido` (jsonb) el informe por
-- bloques (src/modules/udrive/lib/documento.ts). Esta migración le añade:
--
--   estado       borrador, en revisión o aprobado (con quién y cuándo aprobó);
--   turno        bloqueo suave de edición: una sola persona escribe a la vez;
--   versiones    drive_versiones: el contenido y una instantánea de las tablas
--                y gráficas usadas, para que una versión conserve sus datos;
--   comentarios  drive_comentarios: por bloque, con «resuelto»;
--   cifras       drive_cifras_vivas: los valores de UDES en Cifras para [[clave]].
--
-- Reglas que pone la base (no el cliente):
--   · un documento aprobado no cambia su contenido hasta volver a borrador;
--   · mientras otra persona tiene el turno vigente, nadie más guarda el contenido;
--   · estado, aprobación y turno se cambian solo con las funciones de abajo
--     (las columnas no tienen grant de UPDATE para el cliente);
--   · `updated_at` lo pone el disparador: el cliente no lo manda (ver 0179/0184).
--     Tomar o renovar el turno NO mueve `updated_at` (se renueva cada minuto).
--
-- Requiere 0187. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas del documento en drive_archivos
-- -----------------------------------------------------------------------------

alter table public.drive_archivos
  add column if not exists estado_doc       text not null default 'borrador',
  add column if not exists aprobado_por     uuid references auth.users (id) on delete set null,
  add column if not exists aprobado_en      timestamptz,
  add column if not exists bloqueado_por    uuid references auth.users (id) on delete set null,
  add column if not exists bloqueado_hasta  timestamptz,
  add column if not exists turno_pedido_por uuid references auth.users (id) on delete set null,
  add column if not exists turno_pedido_en  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drive_archivos_estado_doc_ok') then
    alter table public.drive_archivos
      add constraint drive_archivos_estado_doc_ok check (estado_doc in ('borrador', 'revision', 'aprobado'));
  end if;
end $$;

comment on column public.drive_archivos.estado_doc is 'Documentos: borrador, revision o aprobado. Solo cambia con drive_doc_estado / drive_doc_aprobar.';
comment on column public.drive_archivos.bloqueado_hasta is 'Documentos: el turno de edición vence aquí; se renueva cada minuto con drive_doc_tomar_turno.';

-- Tomar o renovar el turno no cuenta como «modificado»: el resto de los cambios, sí.
drop trigger if exists drive_archivos_set_updated_at on public.drive_archivos;
create trigger drive_archivos_set_updated_at
  before update on public.drive_archivos
  for each row
  when (
    old.bloqueado_por is not distinct from new.bloqueado_por
    and old.bloqueado_hasta is not distinct from new.bloqueado_hasta
    and old.turno_pedido_por is not distinct from new.turno_pedido_por
  )
  execute function public.set_updated_at();

-- Guardia del contenido de un documento: aprobado no se edita; el turno de otra persona se respeta.
create or replace function public.drive_documento_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.tipo <> 'documento' or new.contenido is not distinct from old.contenido then
    return new;
  end if;
  if old.estado_doc = 'aprobado' then
    raise exception 'Un documento aprobado no se edita sin volver a borrador.' using errcode = 'check_violation';
  end if;
  if old.bloqueado_por is not null and old.bloqueado_por is distinct from auth.uid() and old.bloqueado_hasta > now() then
    raise exception 'Otra persona está editando este documento en este momento.' using errcode = 'lock_not_available';
  end if;
  return new;
end;
$$;

drop trigger if exists drive_documento_guardia_tg on public.drive_archivos;
create trigger drive_documento_guardia_tg
  before update of contenido on public.drive_archivos
  for each row execute function public.drive_documento_guardia();

-- -----------------------------------------------------------------------------
-- 2. Versiones
-- -----------------------------------------------------------------------------

create table if not exists public.drive_versiones (
  id            uuid primary key default gen_random_uuid(),
  documento_id  uuid not null references public.drive_archivos (id) on delete cascade,
  numero        int not null check (numero > 0),
  contenido     jsonb not null,
  -- Instantánea: { "<id de tabla o gráfica>": <su contenido> } de lo que el documento usaba.
  datos         jsonb not null default '{}'::jsonb,
  nota          text not null default '' check (char_length(nota) <= 300),
  autor         uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint drive_versiones_uq unique (documento_id, numero),
  constraint drive_versiones_chica check (octet_length(contenido::text) <= 15000000 and octet_length(datos::text) <= 40000000)
);
comment on table public.drive_versiones is
  'UDrive · versiones de un documento: su contenido y la instantánea de las tablas y gráficas que usaba. Se crean con drive_doc_guardar_version.';
create index if not exists drive_versiones_doc_idx on public.drive_versiones (documento_id, numero desc);

-- -----------------------------------------------------------------------------
-- 3. Comentarios por bloque
-- -----------------------------------------------------------------------------

create table if not exists public.drive_comentarios (
  id            uuid primary key default gen_random_uuid(),
  documento_id  uuid not null references public.drive_archivos (id) on delete cascade,
  bloque_id     text not null check (char_length(bloque_id) between 1 and 60),
  autor         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  texto         text not null check (char_length(btrim(texto)) between 1 and 2000),
  resuelto      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.drive_comentarios is 'UDrive · comentarios de un bloque del documento. Sin menciones ni correos.';
create index if not exists drive_comentarios_doc_idx on public.drive_comentarios (documento_id, created_at);

drop trigger if exists drive_comentarios_set_updated_at on public.drive_comentarios;
create trigger drive_comentarios_set_updated_at
  before update on public.drive_comentarios
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. RLS y permisos de tabla
-- -----------------------------------------------------------------------------

alter table public.drive_versiones enable row level security;
alter table public.drive_comentarios enable row level security;

drop policy if exists drive_versiones_ver on public.drive_versiones;
create policy drive_versiones_ver on public.drive_versiones for select to authenticated
  using (public.drive_entra() and public.drive_puede_ver_archivo(documento_id));

-- Comentar lo puede quien ve el documento; resolver, quien lo edita o quien escribió el comentario.
drop policy if exists drive_comentarios_ver on public.drive_comentarios;
create policy drive_comentarios_ver on public.drive_comentarios for select to authenticated
  using (public.drive_entra() and public.drive_puede_ver_archivo(documento_id));

drop policy if exists drive_comentarios_crear on public.drive_comentarios;
create policy drive_comentarios_crear on public.drive_comentarios for insert to authenticated
  with check (public.drive_entra() and autor = auth.uid() and public.drive_puede_ver_archivo(documento_id));

drop policy if exists drive_comentarios_cambiar on public.drive_comentarios;
create policy drive_comentarios_cambiar on public.drive_comentarios for update to authenticated
  using (public.drive_entra() and (autor = auth.uid() or public.drive_puede_editar_archivo(documento_id)))
  with check (public.drive_entra() and (autor = auth.uid() or public.drive_puede_editar_archivo(documento_id)));

drop policy if exists drive_comentarios_quitar on public.drive_comentarios;
create policy drive_comentarios_quitar on public.drive_comentarios for delete to authenticated
  using (public.drive_entra() and (autor = auth.uid() or public.drive_puede_editar_archivo(documento_id)));

revoke all on public.drive_versiones, public.drive_comentarios from public, anon, authenticated;
grant select on public.drive_versiones, public.drive_comentarios to authenticated;
-- Los comentarios se escriben con estas columnas; autor y updated_at los pone la base.
grant insert (id, documento_id, bloque_id, texto) on public.drive_comentarios to authenticated;
grant update (texto, resuelto) on public.drive_comentarios to authenticated;
grant delete on public.drive_comentarios to authenticated;
grant select, insert, update, delete on public.drive_versiones, public.drive_comentarios to service_role;

-- -----------------------------------------------------------------------------
-- 5. Funciones
-- -----------------------------------------------------------------------------

-- El turno de edición: devuelve si lo tengo y, si no, quién lo tiene. Dura 3 minutos; se renueva cada minuto.
create or replace function public.drive_doc_tomar_turno(p_id uuid)
returns table (tengo boolean, por uuid, por_nombre text, hasta timestamptz, pedido_por_nombre text)
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.drive_archivos;
begin
  if not public.drive_puede_editar_archivo(p_id) then
    raise exception 'No tiene permiso para editar este documento.' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.drive_archivos where id = p_id and tipo = 'documento' for update;
  if not found then
    raise exception 'No existe ese documento.' using errcode = 'no_data_found';
  end if;
  if a.bloqueado_por is null or a.bloqueado_hasta is null or a.bloqueado_hasta <= now() or a.bloqueado_por = auth.uid() then
    update public.drive_archivos
       set bloqueado_por = auth.uid(),
           bloqueado_hasta = now() + interval '3 minutes',
           turno_pedido_por = case when a.bloqueado_por = auth.uid() then a.turno_pedido_por else null end,
           turno_pedido_en = case when a.bloqueado_por = auth.uid() then a.turno_pedido_en else null end
     where id = p_id
     returning * into a;
    return query
      select true, a.bloqueado_por, (select pr.full_name from public.profiles pr where pr.id = a.bloqueado_por), a.bloqueado_hasta,
             (select pr.full_name from public.profiles pr where pr.id = a.turno_pedido_por);
  else
    return query
      select false, a.bloqueado_por, (select pr.full_name from public.profiles pr where pr.id = a.bloqueado_por), a.bloqueado_hasta,
             (select pr.full_name from public.profiles pr where pr.id = a.turno_pedido_por);
  end if;
end;
$$;

-- Suelta el turno (si es mío). Si caduca solo, no hace falta llamarla.
create or replace function public.drive_doc_soltar_turno(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.drive_archivos
     set bloqueado_por = null, bloqueado_hasta = null, turno_pedido_por = null, turno_pedido_en = null
   where id = p_id and tipo = 'documento' and bloqueado_por = auth.uid();
end;
$$;

-- Pide el turno a quien lo tiene: quien lo tiene lo ve en su siguiente renovación.
create or replace function public.drive_doc_pedir_turno(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.drive_puede_editar_archivo(p_id) then
    raise exception 'No tiene permiso para editar este documento.' using errcode = 'insufficient_privilege';
  end if;
  update public.drive_archivos
     set turno_pedido_por = auth.uid(), turno_pedido_en = now()
   where id = p_id and tipo = 'documento' and bloqueado_por is distinct from auth.uid() and bloqueado_hasta > now();
end;
$$;

-- Quien tiene el turno lo cede: queda libre para quien lo pidió.
create or replace function public.drive_doc_ceder_turno(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.drive_archivos
     set bloqueado_por = null, bloqueado_hasta = null
   where id = p_id and tipo = 'documento' and bloqueado_por = auth.uid();
end;
$$;

-- Guarda una versión: el contenido actual del documento y la instantánea de sus datos.
create or replace function public.drive_doc_guardar_version(p_id uuid, p_nota text, p_datos jsonb)
returns table (id uuid, numero int, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.drive_archivos;
  v_num int;
  v public.drive_versiones;
begin
  if not public.drive_puede_editar_archivo(p_id) then
    raise exception 'No tiene permiso para guardar versiones de este documento.' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.drive_archivos where drive_archivos.id = p_id and tipo = 'documento';
  if not found then
    raise exception 'No existe ese documento.' using errcode = 'no_data_found';
  end if;
  select coalesce(max(x.numero), 0) + 1 into v_num from public.drive_versiones x where x.documento_id = p_id;
  insert into public.drive_versiones (documento_id, numero, contenido, datos, nota)
  values (p_id, v_num, a.contenido, coalesce(p_datos, '{}'::jsonb), left(coalesce(btrim(p_nota), ''), 300))
  returning * into v;
  return query select v.id, v.numero, v.created_at;
end;
$$;

-- La lista de versiones, sin los contenidos pesados.
create or replace function public.drive_doc_versiones(p_id uuid)
returns table (id uuid, numero int, nota text, autor_nombre text, created_at timestamptz, bloques int)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.numero, v.nota, pr.full_name, v.created_at,
         case when jsonb_typeof(v.contenido -> 'bloques') = 'array' then jsonb_array_length(v.contenido -> 'bloques') else 0 end
    from public.drive_versiones v
    left join public.profiles pr on pr.id = v.autor
   where v.documento_id = p_id and public.drive_entra() and public.drive_puede_ver_archivo(p_id)
   order by v.numero desc;
$$;

-- Restaura una versión: guarda antes la situación actual y deja el documento como era. Pide turno propio y no aprobado.
create or replace function public.drive_doc_restaurar_version(p_id uuid, p_version uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.drive_versiones;
  a public.drive_archivos;
  v_num int;
begin
  if not public.drive_puede_editar_archivo(p_id) then
    raise exception 'No tiene permiso para restaurar versiones de este documento.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.drive_versiones where id = p_version and documento_id = p_id;
  if not found then
    raise exception 'Esa versión no existe.' using errcode = 'no_data_found';
  end if;
  select * into a from public.drive_archivos where drive_archivos.id = p_id and tipo = 'documento' for update;
  if a.estado_doc = 'aprobado' then
    raise exception 'Un documento aprobado no se edita sin volver a borrador.' using errcode = 'check_violation';
  end if;
  if a.bloqueado_por is not null and a.bloqueado_por <> auth.uid() and a.bloqueado_hasta > now() then
    raise exception 'Otra persona está editando este documento en este momento.' using errcode = 'lock_not_available';
  end if;
  select coalesce(max(x.numero), 0) + 1 into v_num from public.drive_versiones x where x.documento_id = p_id;
  insert into public.drive_versiones (documento_id, numero, contenido, datos, nota)
  values (p_id, v_num, a.contenido, '{}'::jsonb, 'Antes de restaurar la versión ' || v.numero);
  update public.drive_archivos set contenido = v.contenido where drive_archivos.id = p_id;
end;
$$;

-- Cambia entre borrador y en revisión (también «vuelve a borrador» un aprobado). Cualquiera que edite.
create or replace function public.drive_doc_estado(p_id uuid, p_a text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_a not in ('borrador', 'revision') then
    raise exception 'Estado no válido; para aprobar use drive_doc_aprobar.' using errcode = 'invalid_parameter_value';
  end if;
  if not public.drive_puede_editar_archivo(p_id) then
    raise exception 'No tiene permiso para cambiar el estado de este documento.' using errcode = 'insufficient_privilege';
  end if;
  update public.drive_archivos
     set estado_doc = p_a, aprobado_por = null, aprobado_en = null
   where id = p_id and tipo = 'documento';
end;
$$;

-- Aprueba: congela las cifras vivas en el contenido, guarda una versión con la instantánea y marca quién y cuándo.
create or replace function public.drive_doc_aprobar(p_id uuid, p_congeladas jsonb, p_datos jsonb, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.drive_archivos;
  v_num int;
  v_contenido jsonb;
begin
  if not public.drive_puede_editar_archivo(p_id) then
    raise exception 'Solo quien puede editar el documento puede aprobarlo.' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.drive_archivos where drive_archivos.id = p_id and tipo = 'documento' for update;
  if not found then
    raise exception 'No existe ese documento.' using errcode = 'no_data_found';
  end if;
  if a.bloqueado_por is not null and a.bloqueado_por <> auth.uid() and a.bloqueado_hasta > now() then
    raise exception 'Otra persona está editando este documento en este momento.' using errcode = 'lock_not_available';
  end if;
  v_contenido := jsonb_set(coalesce(a.contenido, '{}'::jsonb), '{congeladas}', coalesce(p_congeladas, '{}'::jsonb), true);
  update public.drive_archivos set contenido = v_contenido where drive_archivos.id = p_id;
  select coalesce(max(x.numero), 0) + 1 into v_num from public.drive_versiones x where x.documento_id = p_id;
  insert into public.drive_versiones (documento_id, numero, contenido, datos, nota)
  values (p_id, v_num, v_contenido, coalesce(p_datos, '{}'::jsonb), left(coalesce(nullif(btrim(p_nota), ''), 'Aprobado'), 300));
  update public.drive_archivos
     set estado_doc = 'aprobado', aprobado_por = auth.uid(), aprobado_en = now(),
         bloqueado_por = null, bloqueado_hasta = null, turno_pedido_por = null, turno_pedido_en = null
   where drive_archivos.id = p_id;
end;
$$;

-- Estado, aprobación y turno de un documento, con nombres (la lista del explorador no los trae).
create or replace function public.drive_doc_estado_de(p_id uuid)
returns table (estado_doc text, aprobado_por_nombre text, aprobado_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.estado_doc, pr.full_name, a.aprobado_en
    from public.drive_archivos a
    left join public.profiles pr on pr.id = a.aprobado_por
   where a.id = p_id and a.tipo = 'documento' and public.drive_entra() and public.drive_puede_ver_archivo(p_id);
$$;

-- Los comentarios con el nombre de quien los escribió.
create or replace function public.drive_doc_comentarios(p_id uuid)
returns table (id uuid, bloque_id text, texto text, resuelto boolean, autor uuid, autor_nombre text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.bloque_id, c.texto, c.resuelto, c.autor, coalesce(pr.full_name, pr.email), c.created_at
    from public.drive_comentarios c
    left join public.profiles pr on pr.id = c.autor
   where c.documento_id = p_id and public.drive_entra() and public.drive_puede_ver_archivo(p_id)
   order by c.created_at;
$$;

-- Las cifras vivas de UDES en Cifras que el catálogo de Informes (informe_fuentes) reconoce.
create or replace function public.drive_cifras_catalogo()
returns table (clave text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select f.clave, f.nombre from public.informe_fuentes f
   where f.activa and f.tipo = 'auto' and public.drive_entra()
   order by f.nombre;
$$;

-- El valor de cada cifra (mismo cálculo que los informes: informe_valor_od); el año es el pedido o el de la consulta.
create or replace function public.drive_cifras_vivas(p_claves text[], p_anio int default null)
returns table (clave text, valor numeric, fuente text, corte text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k text;
  q jsonb;
  r record;
  v_anio int;
begin
  if not public.drive_entra() then
    return;
  end if;
  foreach k in array coalesce(p_claves, '{}') loop
    select f.consulta into q from public.informe_fuentes f where f.clave = k and f.activa and f.tipo = 'auto';
    if q is null then
      continue;
    end if;
    v_anio := coalesce(p_anio, nullif(q ->> 'anio', '')::int, extract(year from now())::int - 1);
    select * into r from public.informe_valor_od(q, v_anio);
    clave := k; valor := r.valor; fuente := r.fuente; corte := r.corte;
    return next;
  end loop;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'drive_documento_guardia()', 'drive_doc_tomar_turno(uuid)', 'drive_doc_soltar_turno(uuid)', 'drive_doc_pedir_turno(uuid)',
    'drive_doc_ceder_turno(uuid)', 'drive_doc_guardar_version(uuid, text, jsonb)', 'drive_doc_versiones(uuid)',
    'drive_doc_restaurar_version(uuid, uuid)', 'drive_doc_estado(uuid, text)', 'drive_doc_aprobar(uuid, jsonb, jsonb, text)',
    'drive_doc_estado_de(uuid)', 'drive_doc_comentarios(uuid)', 'drive_cifras_catalogo()', 'drive_cifras_vivas(text[], int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- =============================================================================
-- 0183 · Encuestas con Pilo: estados «rechazado» y «descartado» y papelera
--
-- Primera entrega del editor de encuestas. No depende del modelo nuevo (0184):
-- trabaja sobre lo que ya hay en enc_aportes.
--
--   · El estado de un aporte admite ahora recibido, revisado, para_video,
--     rechazado y descartado.
--   · Borrado lógico: un aporte borrado queda con borrado_en, borrado_por y
--     borrado_motivo y desaparece de las consultas y de la exportación. Se ve
--     en la papelera 30 días y se puede restaurar; después se purga.
--   · enc_bitacora: quién hizo qué y cuándo (borrar, restaurar, purgar; el
--     editor de encuestas suma sus propios movimientos en 0184).
--
--   enc_borrar_aporte(p_id, p_motivo)  borra (lógico). Exige enc_puede_editar.
--   enc_restaurar_aporte(p_id)         lo saca de la papelera.
--   enc_purgar_borrados()              borra de verdad lo que lleva más de 30
--                                      días en la papelera. Se puede llamar
--                                      desde el panel (editores) o programar:
--                                        select cron.schedule('enc-purga', '17 5 * * *',
--                                          $$select public.enc_purgar_borrados()$$);
--
-- Quien edita no puede borrar filas con DELETE ni escribir las columnas de
-- borrado directamente: solo con estas funciones, que dejan rastro.
--
-- Requiere 0179. Vuelta atrás: restaurar lo borrado y volver al CHECK de tres
-- estados (no hay aportes con los nuevos). Idempotente.
-- =============================================================================

alter table public.enc_aportes drop constraint if exists enc_aportes_estado;
alter table public.enc_aportes
  add constraint enc_aportes_estado check (estado in ('recibido', 'revisado', 'para_video', 'rechazado', 'descartado'));

alter table public.enc_aportes add column if not exists borrado_en timestamptz;
alter table public.enc_aportes add column if not exists borrado_por uuid references auth.users (id) on delete set null;
alter table public.enc_aportes add column if not exists borrado_motivo text;

alter table public.enc_aportes drop constraint if exists enc_aportes_motivo;
alter table public.enc_aportes
  add constraint enc_aportes_motivo check (borrado_motivo is null or length(borrado_motivo) <= 300);

create index if not exists enc_aportes_borrados_idx on public.enc_aportes (borrado_en) where borrado_en is not null;

comment on column public.enc_aportes.borrado_en is 'Encuestas (0183): cuándo se mandó a la papelera. Null = vigente. A los 30 días se purga.';

-- -----------------------------------------------------------------------------
-- Bitácora
-- -----------------------------------------------------------------------------

create table if not exists public.enc_bitacora (
  id          bigint generated always as identity primary key,
  encuesta_id uuid references public.enc_encuestas (id) on delete cascade,
  aporte_id   uuid,
  accion      text not null,
  actor       uuid references auth.users (id) on delete set null,
  detalle     jsonb not null default '{}'::jsonb,
  en          timestamptz not null default now(),
  constraint enc_bitacora_accion check (length(accion) between 2 and 60)
);

create index if not exists enc_bitacora_encuesta_idx on public.enc_bitacora (encuesta_id, en desc);

comment on table public.enc_bitacora is 'Encuestas (0183): quién hizo qué y cuándo. Solo se escribe desde funciones de la base.';

alter table public.enc_bitacora enable row level security;

drop policy if exists enc_bitacora_select on public.enc_bitacora;
create policy enc_bitacora_select on public.enc_bitacora
  for select to authenticated using (public.enc_puede_ver());

revoke all on public.enc_bitacora from public, anon, authenticated;
grant select on public.enc_bitacora to authenticated;
grant select, insert, update, delete on public.enc_bitacora to service_role;

-- -----------------------------------------------------------------------------
-- Borrar, restaurar, purgar
-- -----------------------------------------------------------------------------

create or replace function public.enc_borrar_aporte(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.enc_aportes;
begin
  if not public.enc_puede_editar() then
    raise exception 'No tiene permiso para borrar respuestas.' using errcode = '42501';
  end if;
  select * into a from public.enc_aportes where id = p_id for update;
  if not found then
    raise exception 'La respuesta no existe.' using errcode = 'P0002';
  end if;
  if a.borrado_en is not null then
    return;
  end if;
  update public.enc_aportes
     set borrado_en = now(), borrado_por = auth.uid(), borrado_motivo = nullif(left(btrim(coalesce(p_motivo, '')), 300), '')
   where id = p_id;
  insert into public.enc_bitacora (encuesta_id, aporte_id, accion, actor, detalle)
  values (a.encuesta_id, a.id, 'respuesta_borrada', auth.uid(), jsonb_build_object('titulo', a.titulo, 'dependencia', a.dependencia, 'motivo', nullif(left(btrim(coalesce(p_motivo, '')), 300), '')));
end;
$$;

create or replace function public.enc_restaurar_aporte(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.enc_aportes;
begin
  if not public.enc_puede_editar() then
    raise exception 'No tiene permiso para restaurar respuestas.' using errcode = '42501';
  end if;
  select * into a from public.enc_aportes where id = p_id for update;
  if not found then
    raise exception 'La respuesta ya no existe (se purgó de la papelera).' using errcode = 'P0002';
  end if;
  if a.borrado_en is null then
    return;
  end if;
  update public.enc_aportes set borrado_en = null, borrado_por = null, borrado_motivo = null where id = p_id;
  insert into public.enc_bitacora (encuesta_id, aporte_id, accion, actor, detalle)
  values (a.encuesta_id, a.id, 'respuesta_restaurada', auth.uid(), jsonb_build_object('titulo', a.titulo, 'dependencia', a.dependencia));
end;
$$;

create or replace function public.enc_purgar_borrados()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.role() <> 'service_role' and not public.enc_puede_editar() then
    raise exception 'No tiene permiso para purgar la papelera.' using errcode = '42501';
  end if;
  with b as (
    delete from public.enc_aportes where borrado_en is not null and borrado_en < now() - interval '30 days'
    returning encuesta_id, id
  )
  select count(*) into n from b;
  if n > 0 then
    insert into public.enc_bitacora (encuesta_id, accion, actor, detalle)
    values (null, 'papelera_purgada', auth.uid(), jsonb_build_object('respuestas', n));
  end if;
  return n;
end;
$$;

comment on function public.enc_borrar_aporte(uuid, text) is 'Encuestas (0183): borrado lógico de una respuesta, con bitácora.';
comment on function public.enc_restaurar_aporte(uuid) is 'Encuestas (0183): saca una respuesta de la papelera, con bitácora.';
comment on function public.enc_purgar_borrados() is 'Encuestas (0183): borra de verdad lo que lleva más de 30 días en la papelera.';

revoke all on function public.enc_borrar_aporte(uuid, text) from public, anon;
revoke all on function public.enc_restaurar_aporte(uuid) from public, anon;
revoke all on function public.enc_purgar_borrados() from public, anon;
grant execute on function public.enc_borrar_aporte(uuid, text) to authenticated, service_role;
grant execute on function public.enc_restaurar_aporte(uuid) to authenticated, service_role;
grant execute on function public.enc_purgar_borrados() to authenticated, service_role;

notify pgrst, 'reload schema';

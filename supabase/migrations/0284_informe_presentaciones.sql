-- =============================================================================
-- Informes de gestión · 0284 · Presentaciones del informe, armadas por Pilo.
--
-- «Crear presentación con Pilo» (función de borde pilo-presentaciones, siempre
-- con Pilo Astra 1.0) devuelve la presentación como JSON; la web la guarda aquí
-- para listarla, abrirla, editar sus textos y borrarla desde «Presentaciones de
-- este informe». La función no escribe en esta tabla: guarda la persona, con su
-- sesión.
--
-- Acceso (mismo patrón que las demás tablas de informes, sin llave de rol global):
--   · Leer:    quien ve la instancia (informe_instancia_visible).
--   · Crear:   quien ve la instancia, y la fila queda a su nombre.
--   · Editar y borrar: quien la creó (mientras siga viendo la instancia) o Planeación.
--
-- Es idempotente. Se aplica después de 0283.
-- =============================================================================

create table if not exists public.informe_presentaciones (
  id             uuid primary key default gen_random_uuid(),
  instancia_id   uuid not null references public.informe_instancias(id) on delete cascade,
  tono           text not null default 'institucional',
  titulo         text not null,
  contenido      jsonb not null,
  creado_por     uuid default auth.uid() references public.profiles(id) on delete set null,
  creado_en      timestamptz not null default now(),
  pensamiento_s  numeric(7,1),
  constraint informe_presentaciones_tono check (tono in ('institucional', 'cercano', 'ejecutivo', 'academico')),
  constraint informe_presentaciones_titulo check (char_length(titulo) between 1 and 200),
  constraint informe_presentaciones_tam check (pg_column_size(contenido) <= 1000000)
);

comment on table public.informe_presentaciones is
  'Presentaciones armadas por Pilo (Astra) a partir de un informe de gestión: JSON con diapositivas de tipos cerrados (ver supabase/functions/pilo-presentaciones/esquema.ts).';
comment on column public.informe_presentaciones.pensamiento_s is
  'Segundos que Astra tardó en armarla (se muestra como «pensó N s»).';

create index if not exists informe_presentaciones_instancia_idx
  on public.informe_presentaciones (instancia_id, creado_en desc);

alter table public.informe_presentaciones enable row level security;

drop policy if exists informe_presentaciones_read on public.informe_presentaciones;
create policy informe_presentaciones_read on public.informe_presentaciones for select to authenticated
  using (public.informe_instancia_visible(instancia_id));

drop policy if exists informe_presentaciones_insert on public.informe_presentaciones;
create policy informe_presentaciones_insert on public.informe_presentaciones for insert to authenticated
  with check (creado_por = auth.uid() and public.informe_instancia_visible(instancia_id));

drop policy if exists informe_presentaciones_update on public.informe_presentaciones;
create policy informe_presentaciones_update on public.informe_presentaciones for update to authenticated
  using ((creado_por = auth.uid() and public.informe_instancia_visible(instancia_id)) or public.has_role_at_least('planeacion'))
  with check ((creado_por = auth.uid() and public.informe_instancia_visible(instancia_id)) or public.has_role_at_least('planeacion'));

drop policy if exists informe_presentaciones_delete on public.informe_presentaciones;
create policy informe_presentaciones_delete on public.informe_presentaciones for delete to authenticated
  using ((creado_por = auth.uid() and public.informe_instancia_visible(instancia_id)) or public.has_role_at_least('planeacion'));

revoke all on public.informe_presentaciones from anon;
grant select, insert, update, delete on public.informe_presentaciones to authenticated;

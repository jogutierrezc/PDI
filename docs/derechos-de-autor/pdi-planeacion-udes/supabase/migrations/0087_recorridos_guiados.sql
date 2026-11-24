-- =============================================================================
-- PDI · 0087 · Recorridos guiados (Mr. Pilo)
-- =============================================================================
-- Qué recorridos terminó o descartó cada persona. El recorrido de su rol
-- arranca solo la primera vez que entra a la intranet; guardarlo en la base
-- (y no en el navegador) evita que se repita al cambiar de equipo.
--
-- En los portales públicos no hay sesión: allí se recuerda en el navegador.
--
-- Cada persona lee y escribe solo lo suyo. Idempotente.
-- =============================================================================

create table if not exists public.user_tours (
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  tour_id      text not null,
  status       text not null default 'completado',
  step         smallint not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (profile_id, tour_id),
  constraint user_tours_status check (status in ('completado', 'descartado', 'en_curso')),
  constraint user_tours_tour check (tour_id ~ '^[a-z0-9-]{2,60}$')
);

comment on table public.user_tours is
  'Recorridos guiados de Mr. Pilo por persona: terminados, descartados o a medias (con el paso).';

alter table public.user_tours enable row level security;

drop policy if exists user_tours_own on public.user_tours;
create policy user_tours_own on public.user_tours
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update, delete on public.user_tours to authenticated;

drop trigger if exists user_tours_set_updated_at on public.user_tours;
create trigger user_tours_set_updated_at before update on public.user_tours
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';

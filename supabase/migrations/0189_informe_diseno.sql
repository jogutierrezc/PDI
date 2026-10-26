-- =============================================================================
-- Informes Institucionales · Vista Carta y PDF (0189).
--
-- Guarda la personalización de la vista en papel del informe:
--   informe_perfiles   lo que es de la unidad y se repite cada año: monograma,
--                      color de acento, escudo, contacto opcional y pie.
--   informe_diseno     lo que es de un informe: papel (Carta o A4), portada,
--                      página de cierre y contraportada.
--   bucket «informe-portadas» (privado, 5 MB, solo imágenes): fotos de portada
--                      y escudos, en «<unit_id>/<archivo>».
--
-- Permisos, sobre las funciones que dejó 0169:
--   · Lee el perfil quien ve el informe de la unidad (informe_can_view).
--   · Escribe el perfil quien tiene papel de Gestor en la unidad o es de
--     Planeación (informe_actor: 'jefe' o 'planeacion'). Las imágenes del bucket
--     las puede subir también un Contribuyente (informe_can_edit), porque la
--     foto de portada es parte del diseño del informe.
--   · Lee el diseño quien ve el informe (informe_instancia_visible).
--   · Escribe el diseño quien puede editar el informe mientras está abierto
--     (borrador o devuelto, ciclo abierto: informe_instancia_abierta). Enviado
--     o aprobado queda fijo; Planeación puede siempre.
--
-- Mientras esta migración no se aplique, la vista funciona con valores por
-- defecto y avisa que guardar la personalización requiere aplicarla.
-- Requiere 0153 y 0169. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.informe_perfiles (
  unit_id     uuid primary key references public.units (id) on delete cascade,
  monograma   text not null default '',
  acento      text not null default '',
  logo_ruta   text not null default '',
  contacto    jsonb not null default '{}'::jsonb,
  pie         text not null default '',
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint informe_perfiles_monograma check (monograma = '' or monograma ~ '^[A-ZÁÉÍÓÚÑÜ0-9]{3,4}$'),
  constraint informe_perfiles_acento check (acento = '' or acento ~ '^#[0-9a-fA-F]{6}$'),
  constraint informe_perfiles_logo check (char_length(logo_ruta) <= 300),
  constraint informe_perfiles_contacto check (jsonb_typeof(contacto) = 'object'),
  constraint informe_perfiles_pie check (char_length(pie) <= 160)
);

comment on table public.informe_perfiles is
  'Perfil de la unidad para la vista en papel del informe (0189): monograma de 3 a 4 letras, color de acento, escudo (ruta en el bucket informe-portadas), contacto opcional (correo, teléfono, dirección, sitio web) y pie. Lo vacío no se imprime.';

create table if not exists public.informe_diseno (
  instancia_id  uuid primary key references public.informe_instancias (id) on delete cascade,
  papel         text not null default 'carta',
  portada       jsonb not null default '{}'::jsonb,
  cierre        jsonb not null default '{}'::jsonb,
  contraportada jsonb not null default '{}'::jsonb,
  updated_by    uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint informe_diseno_papel check (papel in ('carta', 'a4')),
  constraint informe_diseno_portada check (jsonb_typeof(portada) = 'object'),
  constraint informe_diseno_cierre check (jsonb_typeof(cierre) = 'object'),
  constraint informe_diseno_contraportada check (jsonb_typeof(contraportada) = 'object')
);

comment on table public.informe_diseno is
  'Diseño en papel de un informe (0189): papel (carta por defecto, o a4), portada (composición, textos, foto con encuadre), cierre y contraportada. El cliente valida y normaliza cada JSON; la base solo exige que sean objetos.';

-- -----------------------------------------------------------------------------
-- 2. Quién y cuándo (el cliente no manda updated_by ni updated_at)
-- -----------------------------------------------------------------------------

create or replace function public.informe_diseno_sellar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists informe_perfiles_sellar on public.informe_perfiles;
create trigger informe_perfiles_sellar before insert or update on public.informe_perfiles
  for each row execute function public.informe_diseno_sellar();

drop trigger if exists informe_diseno_sellar on public.informe_diseno;
create trigger informe_diseno_sellar before insert or update on public.informe_diseno
  for each row execute function public.informe_diseno_sellar();

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------

alter table public.informe_perfiles enable row level security;
alter table public.informe_diseno enable row level security;

drop policy if exists informe_perfiles_lectura on public.informe_perfiles;
create policy informe_perfiles_lectura on public.informe_perfiles
  for select to authenticated
  using (public.has_role_at_least('planeacion') or public.informe_can_view(unit_id));

drop policy if exists informe_perfiles_alta on public.informe_perfiles;
create policy informe_perfiles_alta on public.informe_perfiles
  for insert to authenticated
  with check (public.informe_actor(unit_id) in ('planeacion', 'jefe'));

drop policy if exists informe_perfiles_cambio on public.informe_perfiles;
create policy informe_perfiles_cambio on public.informe_perfiles
  for update to authenticated
  using (public.informe_actor(unit_id) in ('planeacion', 'jefe'))
  with check (public.informe_actor(unit_id) in ('planeacion', 'jefe'));

drop policy if exists informe_diseno_lectura on public.informe_diseno;
create policy informe_diseno_lectura on public.informe_diseno
  for select to authenticated
  using (public.informe_instancia_visible(instancia_id));

drop policy if exists informe_diseno_alta on public.informe_diseno;
create policy informe_diseno_alta on public.informe_diseno
  for insert to authenticated
  with check (public.informe_instancia_abierta(instancia_id));

drop policy if exists informe_diseno_cambio on public.informe_diseno;
create policy informe_diseno_cambio on public.informe_diseno
  for update to authenticated
  using (public.informe_instancia_abierta(instancia_id))
  with check (public.informe_instancia_abierta(instancia_id));

-- Sin DELETE: el diseño se va con su informe (on delete cascade).
revoke all on public.informe_perfiles from public, anon;
revoke all on public.informe_diseno from public, anon;
grant select, insert, update on public.informe_perfiles to authenticated;
grant select, insert, update on public.informe_diseno to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Bucket «informe-portadas» (privado, 5 MB, solo imágenes)
--
-- Mismo patrón que «informe-anexos» (0153): la ruta empieza por el id de la
-- unidad. Si quien aplica la migración no es dueño de storage.objects, lo demás
-- queda aplicado y el aviso dice qué hacer a mano.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('informe-portadas', 'informe-portadas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = 5242880,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  execute 'drop policy if exists informe_portadas_lectura on storage.objects';
  execute $pol$
    create policy informe_portadas_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'informe-portadas'
             and (public.has_role_at_least('planeacion')
                  or public.informe_can_view(public.ranking_unidad_de_ruta(name))))
  $pol$;

  execute 'drop policy if exists informe_portadas_escritura on storage.objects';
  execute $pol$
    create policy informe_portadas_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'informe-portadas'
                  and (public.has_role_at_least('planeacion')
                       or public.informe_can_edit(public.ranking_unidad_de_ruta(name))))
  $pol$;

  execute 'drop policy if exists informe_portadas_reemplazo on storage.objects';
  execute $pol$
    create policy informe_portadas_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'informe-portadas'
             and (public.has_role_at_least('planeacion')
                  or public.informe_can_edit(public.ranking_unidad_de_ruta(name))))
      with check (bucket_id = 'informe-portadas'
                  and (public.has_role_at_least('planeacion')
                       or public.informe_can_edit(public.ranking_unidad_de_ruta(name))))
  $pol$;

  execute 'drop policy if exists informe_portadas_borrado on storage.objects';
  execute $pol$
    create policy informe_portadas_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'informe-portadas'
             and (public.has_role_at_least('planeacion')
                  or public.informe_can_edit(public.ranking_unidad_de_ruta(name))))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "informe-portadas" (%). Créelo a mano desde Storage: privado, 5 MB por archivo, solo imágenes JPEG, PNG y WebP.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';

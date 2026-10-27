-- =============================================================================
-- PDI · 0201 · Estilo del sitio por portal (CMS Portales)
-- =============================================================================
-- Cada portal del CMS (landing, planeacion, sostenible) puede tener su estilo:
-- tipografías, tamaño base, escala de títulos, colores, esquinas y forma de los
-- botones. Se guarda como un jsonb en cms_portales.estilo, sin migraciones por
-- cada token nuevo. Vacío ({}) = el aspecto de siempre.
--
--   * Leer: lo lee cualquiera (cms_portales ya es legible por anon, 0174); el
--     portal público lo necesita sin sesión.
--   * Escribir: solo por cms_guardar_estilo, que exige cms_puede_editar (0199):
--     Planeación, administración o la persona designada editora de ESE portal.
--     La tabla sigue siendo de escritura solo administrativa.
--
-- El front vuelve a validar todo al leerlo (colores #rrggbb, números en rango,
-- fuente de una lista) y nunca interpola un valor sin sanear en un style. Aquí
-- solo se frena lo evidente: que sea un objeto pequeño y con claves conocidas.
--
-- Sin esta migración todo funciona con el aspecto actual. Idempotente.
-- =============================================================================

alter table public.cms_portales
  add column if not exists estilo jsonb not null default '{}'::jsonb;

comment on column public.cms_portales.estilo is
  'Estilo del sitio del portal (fh, fb, base, ratio, lh, wh, marino, acento, alt, txt, radius, btn). {} = aspecto por defecto.';

create or replace function public.cms_guardar_estilo(p_portal text, p_estilo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.cms_puede_editar(p_portal) then
    raise exception 'Sin permiso para cambiar el estilo de este portal' using errcode = '42501';
  end if;

  if p_estilo is null or jsonb_typeof(p_estilo) <> 'object' then
    raise exception 'El estilo debe ser un objeto' using errcode = '22023';
  end if;

  if length(p_estilo::text) > 4000 then
    raise exception 'El estilo es demasiado grande' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_estilo) k
     where k not in ('fh', 'fb', 'base', 'ratio', 'lh', 'wh', 'marino', 'acento', 'alt', 'txt', 'radius', 'btn')
  ) then
    raise exception 'El estilo trae una clave desconocida' using errcode = '22023';
  end if;

  update public.cms_portales set estilo = p_estilo where slug = p_portal;
  if not found then
    raise exception 'El portal no existe' using errcode = 'P0002';
  end if;

  return p_estilo;
end;
$$;

comment on function public.cms_guardar_estilo(text, jsonb) is
  'Guarda el estilo del sitio de un portal. Planeación, administración o editor de ese portal (0199).';

grant execute on function public.cms_guardar_estilo(text, jsonb) to authenticated;

-- =============================================================================
-- PDI · 0203 · «Columnas con contenido» del CMS: ningún bloque HTML anidado sin ser administrador
-- =============================================================================
-- El bloque `contenedor` (Columnas con contenido) guarda otros bloques dentro de
-- sus propias props: props.items[].bloques[] = { id, tipo, props }. No hay tabla
-- ni columna nuevas: el contenedor es una fila más de cms_bloques y cms_publicar
-- copia sus props tal cual a cms_versiones (el jsonb viaja entero, con lo anidado).
--
-- La regla de 0200 dice que solo la administración crea o cambia bloques `html`
-- (código HTML, CSS y JavaScript libres, que se ejecuta en el dominio de la
-- universidad). Pero el trigger de 0200 mira únicamente la columna `tipo`: un
-- editor por portal (cms_editores, 0199) podría esquivarla guardando un
-- contenedor cuyas props lleven un hijo { "tipo": "html" }. El front no lo pinta
-- (contenedorDe lo descarta) y no lo ofrece, pero la API de Supabase acepta
-- escrituras directas, así que la regla también vive aquí:
--
--   * Crear un bloque cuyas props contengan, a cualquier profundidad, una lista
--     `bloques` con algún elemento de tipo `html` -> solo administración.
--   * Cambiar las props de un bloque que ya contiene uno -> solo administración.
--   * Mover (cambia `orden`), cambiar `ancho` o eliminar siguen permitidos, y un
--     upsert idéntico del front sobre una fila que no cambió pasa, como en 0200.
--
-- La inspección usa jsonpath sobre el jsonb (no una búsqueda de texto): mira el
-- campo `tipo` de cada elemento de cada `bloques`, sin importar mayúsculas ni
-- espacios alrededor. Sin sesión de usuario (auth.uid() nulo) el trigger no
-- interviene, igual que en 0200.
--
-- Reemplaza la función del trigger de 0200 (mismo nombre, mismo trigger) y
-- conserva todo lo que ya hacía. Idempotente.
-- =============================================================================

create or replace function public.cms_props_con_html(p_props jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(
    jsonb_path_exists(
      p_props,
      '$.**.bloques[*] ? (@.tipo like_regex "^[[:space:]]*html[[:space:]]*$" flag "i")'
    ),
    false
  );
$$;

comment on function public.cms_props_con_html(jsonb) is
  'true si las props de un bloque del CMS llevan, a cualquier profundidad, un bloque anidado de tipo html (items[].bloques[] del contenedor de columnas).';

create or replace function public.cms_bloques_solo_admin_html()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anidado boolean;
begin
  -- Sin usuario (migraciones, service role): no es un editor del CMS.
  if auth.uid() is null then
    return new;
  end if;

  if public.has_role_at_least('admin') then
    return new;
  end if;

  v_anidado := public.cms_props_con_html(new.props);

  if tg_op = 'INSERT' then
    if new.tipo = 'html' or v_anidado then
      -- Un upsert del front sobre una fila que no cambió: no modifica nada.
      if exists (
        select 1 from public.cms_bloques b
         where b.id = new.id
           and b.tipo = new.tipo
           and b.ancho = new.ancho
           and b.props is not distinct from new.props
      ) then
        return new;
      end if;
      if new.tipo = 'html' then
        raise exception 'Solo la administración puede crear bloques de HTML personalizado'
          using errcode = '42501';
      end if;
      raise exception 'Solo la administración puede guardar HTML personalizado dentro de unas columnas'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: nada de tocar un bloque html ni de convertir otro en html.
  if old.tipo = 'html' or new.tipo = 'html' then
    if old.tipo is distinct from new.tipo
       or old.props is distinct from new.props
       or old.ancho is distinct from new.ancho then
      raise exception 'Solo la administración puede cambiar bloques de HTML personalizado'
        using errcode = '42501';
    end if;
  end if;

  -- UPDATE: ni meter HTML dentro de unas columnas ni cambiar las props de unas columnas que ya lo llevan.
  if v_anidado and (old.tipo is distinct from new.tipo or old.props is distinct from new.props) then
    raise exception 'Solo la administración puede guardar HTML personalizado dentro de unas columnas'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.cms_bloques_solo_admin_html() is
  'Impide que quien no es administrador cree o cambie bloques html en cms_bloques, incluidos los anidados dentro de un contenedor de columnas (0200 y 0203; los editores por portal de 0199 no deben publicar scripts en el dominio de la universidad).';

drop trigger if exists cms_bloques_solo_admin_html on public.cms_bloques;
create trigger cms_bloques_solo_admin_html
  before insert or update on public.cms_bloques
  for each row execute function public.cms_bloques_solo_admin_html();

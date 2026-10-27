-- =============================================================================
-- PDI · 0200 · El bloque «html» del CMS lo crea y edita solo la administración
-- =============================================================================
-- El bloque `html` del CMS Portales incrusta HTML, CSS y JavaScript libres. El
-- front lo pinta dentro de un iframe aislado (sandbox sin allow-same-origin),
-- pero igual es código que se ejecuta cuando alguien abre la página, y las
-- páginas públicas viven en el dominio de la universidad.
--
-- Desde 0199 una persona designada como editora de un portal (cms_editores)
-- puede crear, cambiar y publicar bloques de ese portal sin ser administradora.
-- Esa persona no debe poder publicar scripts en el dominio de la universidad:
-- ocultar el bloque en el front no basta, porque la API de Supabase acepta
-- escrituras directas. Por eso la regla vive en la base, en un trigger sobre
-- cms_bloques:
--
--   * Crear un bloque `html`                 -> solo administración.
--   * Cambiar el contenido (props) o el ancho de un bloque `html` -> solo administración.
--   * Cambiar el tipo hacia o desde `html`   -> solo administración.
--
-- Lo que sí puede hacer un editor: ver el bloque, moverlo (cambia `orden`) y
-- eliminarlo; mover otros bloques de la página no se ve afectado. El front guarda
-- con upsert (INSERT ... ON CONFLICT DO UPDATE), y el trigger BEFORE INSERT corre
-- antes de que se detecte el conflicto; por eso un INSERT de un bloque `html`
-- idéntico al que ya existe (mismo id, tipo, props y ancho) se deja pasar: no
-- cambia nada, solo equivale a mover el bloque.
--
-- Sin sesión de usuario (auth.uid() nulo: migraciones, SQL Editor, service role)
-- el trigger no interviene; ese camino ya es de administración de la base.
--
-- Idempotente.
-- =============================================================================

create or replace function public.cms_bloques_solo_admin_html()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin usuario (migraciones, service role): no es un editor del CMS.
  if auth.uid() is null then
    return new;
  end if;

  if public.has_role_at_least('admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.tipo = 'html' then
      -- Un upsert del front sobre un bloque html que no cambió: no modifica nada.
      if exists (
        select 1 from public.cms_bloques b
         where b.id = new.id
           and b.tipo = 'html'
           and b.ancho = new.ancho
           and b.props is not distinct from new.props
      ) then
        return new;
      end if;
      raise exception 'Solo la administración puede crear bloques de HTML personalizado'
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
  return new;
end;
$$;

comment on function public.cms_bloques_solo_admin_html() is
  'Impide que quien no es administrador cree o cambie bloques de tipo html en cms_bloques (los editores por portal de 0199 no deben publicar scripts en el dominio de la universidad).';

drop trigger if exists cms_bloques_solo_admin_html on public.cms_bloques;
create trigger cms_bloques_solo_admin_html
  before insert or update on public.cms_bloques
  for each row execute function public.cms_bloques_solo_admin_html();

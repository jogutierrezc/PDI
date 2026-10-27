-- =============================================================================
-- 0234 · Observatorio: mover un tema + vista previa de un insertado sin guardar (O2)
--
-- Por qué una función: las tablas y los visores de un tema guardan su propio
-- observatorio_id (0230) y los insertados apuntan al tema dentro de ese
-- observatorio. Cambiar solo obs_topics desde la aplicación dejaría las tablas
-- y los visores en el observatorio anterior, y los insertados del tema
-- dejarían de resolver. Además, quien solo tiene el panel «Observatorios» no
-- escribe tablas ni visores por RLS. Aquí se mueve todo junto y con permiso en
-- AMBOS observatorios.
--
-- Requiere 0230–0233. Idempotente.
-- =============================================================================

create or replace function public.obs_tema_mover(p_slug text, p_obs uuid, p_linea uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  origen uuid;
  fila   public.obs_topics;
begin
  select observatorio_id into origen from public.obs_topics where slug = p_slug for update;
  if not found then
    raise exception 'El tema no existe.' using errcode = 'no_data_found';
  end if;
  if not (public.obs_can_edit()
          and public.obs_puede('obs_observatorios', origen, 'editar')
          and public.obs_puede('obs_observatorios', p_obs, 'editar')) then
    raise exception 'Mover un tema pide el panel Observatorios (nivel Editar) en el observatorio de origen y en el de destino.' using errcode = 'insufficient_privilege';
  end if;
  if p_linea is not null and not exists (select 1 from public.obs_lineas l where l.id = p_linea and l.observatorio_id = p_obs) then
    raise exception 'La línea no pertenece al observatorio de destino.' using errcode = '22023';
  end if;

  update public.obs_topics
     set observatorio_id = p_obs, linea_id = p_linea,
         orden = coalesce((select max(t.orden) from public.obs_topics t where t.observatorio_id = p_obs and t.linea_id is not distinct from p_linea), 0) + 1
   where slug = p_slug returning * into fila;

  if origen is distinct from p_obs then
    update public.obs_datasets set observatorio_id = p_obs where topic = p_slug;
    update public.obs_views set observatorio_id = p_obs where topic = p_slug;
    update public.obs_metricas set observatorio_id = p_obs where insertado_id in (select id from public.obs_insertados where tema_slug = p_slug);
    update public.obs_insertados set observatorio_id = p_obs where tema_slug = p_slug;
  end if;
  return to_jsonb(fila);
end;
$$;

revoke all on function public.obs_tema_mover(text, uuid, uuid) from public, anon;
grant execute on function public.obs_tema_mover(text, uuid, uuid) to authenticated;

-- =============================================================================
-- Vista previa de un insertado AÚN SIN GUARDAR
--
-- /obs-embed?id=<código>&origen=@vista-previa solo sirve a un insertado que ya
-- existe. Para ver en vivo lo que se está configurando (sin crear filas en el
-- registro) el panel «Insertar y publicar» pide aquí el mismo contenido público
-- por tipo, tema, sección o visor. Misma respuesta que obs_publico_insertado,
-- mismas reservas (solo lo publicado y agregado, «< 5» en la base), y solo para
-- quien tiene el panel; no mide ni cuenta nada.
-- =============================================================================

create or replace function public.obs_vista_previa(
  p_obs uuid, p_nombre text, p_tipo text, p_tema text, p_seccion text, p_visor uuid, p_opciones jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ins    public.obs_insertados;
  o      public.obs_observatorios;
  v_tema text := p_tema;
  v_cont jsonb;
begin
  if not public.obs_tiene_panel('obs_insertar', p_obs) then
    raise exception 'No tiene el panel Insertar y publicar en este observatorio.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo not in ('portada', 'tema', 'seccion', 'visor') then
    raise exception 'Tipo de insertado no válido.' using errcode = '22023';
  end if;
  select * into o from public.obs_observatorios where id = p_obs;
  if not found then
    return jsonb_build_object('estado', 'no_existe');
  end if;
  if p_tipo = 'visor' then
    select v.topic into v_tema from public.obs_views v where v.id = p_visor and v.observatorio_id = p_obs;
  end if;
  ins.observatorio_id := p_obs;
  ins.tipo := p_tipo;
  ins.tema_slug := case when p_tipo = 'portada' then null else v_tema end;
  ins.seccion := case when p_tipo = 'seccion' then p_seccion end;
  ins.visor_id := case when p_tipo = 'visor' then p_visor end;
  if o.estado <> 'publicado' then
    return jsonb_build_object('estado', 'sin_publicar');
  end if;
  v_cont := public.obs_publico_contenido(ins);
  if v_cont is null then
    return jsonb_build_object('estado', 'sin_publicar');
  end if;
  return jsonb_build_object(
    'estado', 'ok',
    'insertado', jsonb_build_object('codigo', '', 'nombre', btrim(coalesce(p_nombre, '')), 'tipo', p_tipo, 'seccion', ins.seccion,
                                    'opciones', public.obs_validar_opciones(coalesce(p_opciones, '{"v":1}'::jsonb)), 'version', 0),
    'observatorio', jsonb_build_object('nombre', o.nombre, 'slug', o.slug, 'color', o.color, 'icono', o.icono,
                                       'descripcion', o.descripcion, 'principal', o.principal),
    'contenido', v_cont,
    'servido_en', now());
end;
$$;

revoke all on function public.obs_vista_previa(uuid, text, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.obs_vista_previa(uuid, text, text, text, text, uuid, jsonb) to authenticated;

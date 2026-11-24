-- =============================================================================
-- PDI · 0215 · UI GreenMetric · los avisos enlazan a una ruta que también abre el rol «consulta»
--
-- Requiere 0213. Idempotente. NO reescribe 0213.
--
-- HALLAZGO: los avisos de 0213 llevan la ruta '/admin/rankings/green?q=…'. Esa
-- pantalla exige Planeación; una persona con rol «consulta» que responde un
-- indicador no puede abrirla. La ruta abierta a cualquier persona activa es
-- '/admin/reporte-rankings/green' (misma forma de consulta ?q=).
--
-- DECISIÓN: un disparador BEFORE INSERT reescribe solo el prefijo de la ruta en
-- ugm_notificaciones.valores, en lugar de recrear los cuatro emisores de 0213. Así
-- cualquier emisor, presente o futuro, queda cubierto. No toca permisos: la ruta
-- sigue siendo un texto que la función `correos` valida contra una lista cerrada de
-- prefijos antes de armar el enlace. Además se corrigen los avisos que siguen en cola.
-- =============================================================================

create or replace function public.ugm_notif_ruta_consulta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.valores ? 'ruta' and (new.valores ->> 'ruta') like '/admin/rankings/green%' then
    new.valores := jsonb_set(new.valores, '{ruta}', to_jsonb(regexp_replace(new.valores ->> 'ruta', '^/admin/rankings/green', '/admin/reporte-rankings/green')));
  end if;
  return new;
end;
$$;

drop trigger if exists ugm_notif_ruta_consulta_tg on public.ugm_notificaciones;
create trigger ugm_notif_ruta_consulta_tg
  before insert on public.ugm_notificaciones
  for each row execute function public.ugm_notif_ruta_consulta();

update public.ugm_notificaciones
   set valores = jsonb_set(valores, '{ruta}', to_jsonb(regexp_replace(valores ->> 'ruta', '^/admin/rankings/green', '/admin/reporte-rankings/green')))
 where estado in ('en_cola', 'error') and (valores ->> 'ruta') like '/admin/rankings/green%';

notify pgrst, 'reload schema';

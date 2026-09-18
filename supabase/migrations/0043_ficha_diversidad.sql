-- =============================================================================
-- PDI · 0043 · Ficha de Diversidad, Equidad e Inclusión
--
-- 1. El periodo 2020-2025 cubre los tres campus. Solo tenía a Bucaramanga, así
--    que el portal descartaba las cifras de Cúcuta y Valledupar que 0041 ya
--    guardó, y el total de lo que se suma salía de un solo campus (661 en
--    lugar de 2.354 estudiantes de grupos especiales en 2025-2). En los demás
--    informes, donde esos campus no reportan, se leerá «sin reportar».
--
-- 2. La ficha DE abre con el tablero de la diversidad. Los bloques genéricos
--    que el tablero ya cubre (indicadores, evolución, desgloses, mapa de calor)
--    quedan ocultos, no borrados: la intranet puede volver a mostrarlos.
--    «Qué mide cada cifra» sigue visible al final.
--
-- Requiere 0041 y 0042. Idempotente.
-- =============================================================================

-- 1. Campus del periodo.
insert into public.od_period_campuses (period_id, campus_id, label, position)
select p.id, c.id, c.name, v.position
from public.od_periods p
join (values ('bucaramanga', 1), ('cucuta', 2), ('valledupar', 3)) as v (slug, position) on true
join public.campuses c on c.slug = v.slug
where p.label = '2020-2025'
on conflict (period_id, campus_id) do update set position = excluded.position;

-- 2. Bloques de la ficha DE.
with r as (
  select id from public.od_reports
  where slug = 'diversidad-equidad-inclusion'
    and period_id = (select id from public.od_periods where label = '2020-2025')
)
update public.od_report_blocks b
set visible = false
from r
where b.report_id = r.id
  and b.kind in ('kpis', 'evolucion', 'desgloses', 'mapa_calor');

with r as (
  select id from public.od_reports
  where slug = 'diversidad-equidad-inclusion'
    and period_id = (select id from public.od_periods where label = '2020-2025')
)
insert into public.od_report_blocks (report_id, kind, ref_id, position, visible, settings)
select r.id, 'diversidad', null, 0, true, '{}'::jsonb
from r
where not exists (select 1 from public.od_report_blocks b where b.report_id = r.id and b.kind = 'diversidad');

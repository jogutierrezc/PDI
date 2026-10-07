-- Repara el despliegue donde 0076 quedó registrada como aplicada sin ejecutarse.
alter type public.od_chart_kind add value if not exists 'composicion';

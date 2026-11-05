-- =============================================================================
-- 0259 · Warehouse UDES · estado de aprobación de la nómina (ms_aprob)
--
-- El módulo «Cumplimiento de Tipología» (0260) necesita saber, de cada profesor,
-- si su nómina está aprobada, preaprobada o por confirmar en Master. La nómina
-- consolidada nueva (ms_nom, 0193) ya no trae la columna ESTADO que traía la
-- anterior; Roomy lo lee de la lista «Aprobar nómina» de Master
-- (approve_payroll/filter, pregrado y posgrado), y el Warehouse ahora la pide
-- igual (supabase/functions/warehouse/reportes.ts · ms_aprob).
--
-- SIN VERIFICAR. Ningún HAR del Warehouse muestra esa petición ni su respuesta;
-- la ruta, el cuerpo y los nombres de campo se copiaron de master-sync de Roomy
-- (reporte marcado `verificado: false`). Antes de confiar en el conjunto hay que
-- «Sondear» una sede: si Master llama distinto a algún campo, la política lo
-- descarta (permitir = solo lo que está en la lista) y el estado queda «sin dato».
--
-- Privacidad (no se relaja nada):
--   · permitir solo: identification (SEUDÓNIMO, la misma sal y fórmula que la
--     cédula de ms_nom: por eso se cruzan), status, approved, pre_approved,
--     to_confirm, manual_preapproval, is_active y origen (pregrado/posgrado).
--   · se descartan nombre, correo, departamento, escalafón y la observación de
--     Master (texto libre que puede traer datos de la persona).
--   · el CHECK de 0161 impide poner nombres, documento o correo en una lista.
--
-- Esta migración también comprueba (sin cambiar nada) que la política de ms_nom
-- conserve las columnas que el módulo necesita, y avisa si falta alguna.
--
-- Requiere 0155–0161, 0193 y 0249. Idempotente. No borra nada.
-- =============================================================================

insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, datos_personales, finalidad, nota) values
  ('ms_aprob', 'permitir',
   '{identification,status,approved,pre_approved,to_confirm,manual_preapproval,is_active,origen}',
   '{identification}', '{}', '',
   'Estado de aprobación de la nómina docente (aprobado, preaprobado, por confirmar, preaprobación manual). La identificación queda como seudónimo; no se guardan nombre, correo, departamento ni la observación de Master.')
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar,
      datos_personales = excluded.datos_personales, finalidad = excluded.finalidad, nota = excluded.nota;

-- Datos de personal: no se ofrecen al Observatorio (igual que ms_nom, 0249).
update public.wh_politicas set agregable_obs = false where conjunto = 'ms_aprob';

-- Comprobación: las columnas de ms_nom (y de los otros conjuntos que lee el módulo) que el motor necesita.
do $$
declare
  falta text[];
begin
  select array_agg(c) into falta
    from unnest(array['cedula', 'contrato', 'categoria', 'duracion', 'codigo', 'asignatura_actividad', 'tipo_de_actividad',
                      'grp', 'dpto_carrera', 'horas', 'horas_semestre', 'mat']) c
   where not exists (select 1 from public.wh_politicas p where p.conjunto = 'ms_nom' and c = any (p.lista));
  if falta is not null then
    raise warning 'ms_nom: la política no conserva % (Cumplimiento de Tipología las necesita).', falta;
  end if;

  if not exists (select 1 from public.wh_politicas p where p.conjunto = 'ms_nom' and 'cedula' = any (p.seudonimizar)) then
    raise warning 'ms_nom: la cédula debe quedar como seudónimo (lo cruzan ms_aprob y ms_hordep).';
  end if;

  if not exists (select 1 from public.wh_politicas p where p.conjunto = 'ms_hordep' and 'id_docente' = any (p.seudonimizar)) then
    raise warning 'ms_hordep: id_docente debe quedar como seudónimo (la distribución semanal se cruza con la nómina por él).';
  end if;
end
$$;

notify pgrst, 'reload schema';

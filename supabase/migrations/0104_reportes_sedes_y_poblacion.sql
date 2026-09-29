-- =============================================================================
-- 0104 · Reportes Institucionales: sedes con municipio y cruces de Población
-- estudiantil.
--
-- La ciudad donde se ofrece cada programa ya está en la estructura
-- institucional: es su SEDE (program_campuses → campuses, 0077). Lo que faltaba
-- era el código DIVIPOLA de cada sede, que SNIES pide y campuses no guarda.
--
--   ri_sedes                        el municipio (DIVIPOLA) de cada sede.
--                                   Se siembra por slug: Bucaramanga 68001,
--                                   Cúcuta 54001, Valledupar 20001, Bogotá
--                                   11001. Otras sedes quedan sin municipio y
--                                   «Traer programas» lo avisa.
--   ri_sede_guardar(campus, mun.)   Planeación asigna o quita el municipio.
--   ri_programas_desde_estructura() ahora llena la oferta de cada programa
--                                   con los municipios de sus sedes activas,
--                                   y la reemplaza en los que ya existían.
--   ri_cruces(periodo)              ahora también Relación de inscritos,
--                                   Inscritos por programa, Admitidos y
--                                   Primer curso, con su periodo.
--   ri_exigir_plantilla()           conoce «inscritos_programa».
--
-- Privacidad (hallazgo de pruebas): has_screen('reportes') dice «sí» a quien
-- no tiene rol de acceso, y el rol de fábrica Consulta trae all_screens. Con
-- 0103, cualquier Consulta leía ri_filas completo. Desde aquí:
--   ri_filas, ri_cruces() y los      pantalla «reportes» Y responsable o más:
--   certificados (lectura)           los datos personales, solo quien captura.
--   ri_entregas                      sigue con la pantalla: solo estados y
--                                    conteos, sin datos personales.
--
-- No toca 0103 (puede estar aplicada). Requiere 0077 (program_campuses) y
-- 0103. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Privacidad: las filas, solo para quien captura
-- -----------------------------------------------------------------------------

drop policy if exists ri_filas_read on public.ri_filas;
create policy ri_filas_read on public.ri_filas for select to authenticated
  using (public.has_screen('reportes') and public.has_role_at_least('responsable'));

comment on table public.ri_filas is
  'Reportes Institucionales (0103, 0104): filas capturadas con NOMBRES, tal cual. CONTIENE DATOS PERSONALES (documento, nombres, correo, fecha de nacimiento): solo las lee quien ve la pantalla «reportes» Y es responsable o más (quien captura); nunca anon ni Consulta. Se escribe solo por RPC.';

do $$
begin
  execute 'drop policy if exists ri_certificados_lectura on storage.objects';
  execute $pol$
    create policy ri_certificados_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'reportes-certificados' and public.has_screen('reportes') and public.has_role_at_least('responsable'))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo cambiar la lectura del bucket "reportes-certificados" (%). En Storage, limite la lectura a responsable o más.',
      sqlerrm;
end $$;

-- Renombrar en filas (0103) toca también entregas validadas y enviadas, y es
-- a propósito: en ri_filas se guarda el NOMBRE, y el archivo para HECAA sale
-- del código del catálogo, que renombrar no cambia. Lo enviado se exporta
-- igual antes y después; solo cambia la etiqueta que se ve en la hoja.
comment on function public.ri_renombrar_en_filas(text[], text, text) is
  'Reportes Institucionales: reemplaza un nombre por otro en los campos dados de las filas guardadas, también en entregas validadas o enviadas (seguro: el código exportado no cambia). Devuelve las casillas cambiadas.';

-- -----------------------------------------------------------------------------
-- 1. El municipio de cada sede
-- -----------------------------------------------------------------------------

create table if not exists public.ri_sedes (
  campus_id   uuid primary key references public.campuses (id) on delete cascade,
  municipio   text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint ri_sedes_municipio check (municipio ~ '^[0-9]{5}$')
);

comment on table public.ri_sedes is
  'Reportes Institucionales (0104): código DIVIPOLA del municipio de cada sede. De aquí sale la oferta de los programas para SNIES.';

insert into public.ri_sedes (campus_id, municipio, updated_by)
select c.id, s.municipio, null
  from public.campuses c
  join (values
    ('bucaramanga', '68001'),
    ('cucuta', '54001'),
    ('valledupar', '20001'),
    ('bogota', '11001')
  ) as s(slug, municipio) on s.slug = c.slug
on conflict do nothing;

alter table public.ri_sedes enable row level security;

drop policy if exists ri_sedes_read on public.ri_sedes;
create policy ri_sedes_read on public.ri_sedes for select to authenticated
  using (true);

revoke all on public.ri_sedes from anon, public, authenticated;
grant select on public.ri_sedes to authenticated;

/** Asigna el municipio a una sede; vacío, se lo quita. Solo Planeación. */
create or replace function public.ri_sede_guardar(p_campus uuid, p_municipio text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_municipio text := nullif(btrim(coalesce(p_municipio, '')), '');
begin
  perform public.ri_exigir_planeacion();

  if p_campus is null or not exists (select 1 from public.campuses c where c.id = p_campus) then
    raise exception 'La sede no existe.';
  end if;

  if v_municipio is null then
    delete from public.ri_sedes where campus_id = p_campus;
    return;
  end if;

  if v_municipio !~ '^[0-9]{5}$' then
    raise exception 'El código DIVIPOLA «%» debe tener 5 dígitos (Bucaramanga es 68001).', v_municipio;
  end if;
  if not exists (
    select 1 from public.ri_catalogo_items i where i.catalogo = 'municipio' and i.codigo = v_municipio
  ) then
    raise exception 'El municipio % no está en el catálogo de municipios: agréguelo primero.', v_municipio;
  end if;

  insert into public.ri_sedes as r (campus_id, municipio, updated_at, updated_by)
  values (p_campus, v_municipio, now(), auth.uid())
  on conflict (campus_id) do update
    set municipio = excluded.municipio, updated_at = now(), updated_by = auth.uid();
end;
$$;

comment on function public.ri_sede_guardar(uuid, text) is
  'Reportes Institucionales: asigna (o quita, si viene vacío) el municipio DIVIPOLA de una sede. Solo Planeación.';

revoke all on function public.ri_sede_guardar(uuid, text) from public, anon;
grant execute on function public.ri_sede_guardar(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Plantillas conocidas: Inscritos por programa
-- -----------------------------------------------------------------------------

create or replace function public.ri_exigir_plantilla(p_plantilla text, p_periodo text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_plantilla is null or p_plantilla not in
     ('participante', 'inscritos', 'inscritos_programa', 'admitidos', 'primer_curso', 'matriculados', 'graduados', 'docentes') then
    raise exception 'La plantilla «%» no es una plantilla SNIES conocida.', coalesce(p_plantilla, '');
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-[12]$' then
    raise exception 'El periodo «%» no es válido: se escribe como 2026-1 o 2026-2.', coalesce(p_periodo, '');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Programas desde la estructura, con su oferta por sede
-- -----------------------------------------------------------------------------

/**
 * Cada unidad de tipo programa con código SNIES pasa al catálogo con su
 * nombre (units.name) y su oferta: los DIVIPOLA de sus sedes activas
 * (program_campuses.active) según ri_sedes. En los programas que ya estaban,
 * nombre y oferta se reemplazan por los de la estructura; «activo» no se toca.
 *
 * Devuelve {nuevos, actualizados, aviso, sedes_sin_municipio,
 * programas_sin_sede}. `aviso` es null si no hay nada que advertir.
 */
create or replace function public.ri_programas_desde_estructura()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevos integer;
  v_actualizados integer;
  v_sedes text[];
  v_sin_sede text[];
  v_avisos text[] := '{}';
begin
  perform public.ri_exigir_planeacion();

  with fuente as (
    select distinct on (btrim(u.snies_code))
           u.id, btrim(u.snies_code) as codigo, btrim(u.name) as nombre
      from public.units u
     where u.kind = 'programa'
       and u.snies_code is not null
       and btrim(u.snies_code) ~ '^[0-9A-Za-z_-]{1,20}$'
     order by btrim(u.snies_code), u.name
  ),
  con_oferta as (
    select fuente.codigo,
           fuente.nombre,
           coalesce(array(
             select distinct rs.municipio
               from public.program_campuses pc
               join public.ri_sedes rs on rs.campus_id = pc.campus_id
              where pc.program_id = fuente.id
                and pc.active
              order by 1
           ), '{}') as oferta
      from fuente
  ),
  escritos as (
    insert into public.ri_catalogo_items as i (catalogo, codigo, nombre, oferta, updated_at, updated_by)
    select 'programa', con_oferta.codigo, con_oferta.nombre, con_oferta.oferta, now(), auth.uid() from con_oferta
    on conflict (catalogo, codigo) do update
      set nombre = excluded.nombre, oferta = excluded.oferta, updated_at = now(), updated_by = auth.uid()
      where i.nombre is distinct from excluded.nombre or i.oferta is distinct from excluded.oferta
    returning (xmax = 0) as nuevo
  )
  select count(*) filter (where nuevo), count(*) filter (where not nuevo)
    into v_nuevos, v_actualizados
    from escritos;

  -- Sedes que ofrecen programas y no tienen municipio: sus programas quedan sin esa ciudad.
  select coalesce(array_agg(distinct c.name order by c.name), '{}') into v_sedes
    from public.campuses c
    join public.program_campuses pc on pc.campus_id = c.id and pc.active
   where not exists (select 1 from public.ri_sedes rs where rs.campus_id = c.id);

  -- Programas con código SNIES y ninguna sede activa.
  select coalesce(array_agg(u.name order by u.name), '{}') into v_sin_sede
    from public.units u
   where u.kind = 'programa'
     and u.snies_code is not null
     and btrim(u.snies_code) <> ''
     and not exists (select 1 from public.program_campuses pc where pc.program_id = u.id and pc.active);

  if cardinality(v_sedes) > 0 then
    v_avisos := v_avisos || format('Sedes sin municipio (asígnelo en la pestaña Sedes y vuelva a traer los programas): %s.',
                                   array_to_string(v_sedes, ', '));
  end if;
  if cardinality(v_sin_sede) > 0 then
    v_avisos := v_avisos || format('%s programa(s) sin sede en la estructura institucional, quedan sin oferta: %s%s.',
                                   cardinality(v_sin_sede),
                                   array_to_string(v_sin_sede[1:8], ', '),
                                   case when cardinality(v_sin_sede) > 8 then '…' else '' end);
  end if;

  return jsonb_build_object(
    'nuevos', coalesce(v_nuevos, 0),
    'actualizados', coalesce(v_actualizados, 0),
    'aviso', case when cardinality(v_avisos) = 0 then null else array_to_string(v_avisos, ' ') end,
    'sedes_sin_municipio', to_jsonb(v_sedes),
    'programas_sin_sede', to_jsonb(v_sin_sede)
  );
end;
$$;

comment on function public.ri_programas_desde_estructura() is
  'Reportes Institucionales: copia al catálogo los programas con código SNIES y su oferta (DIVIPOLA de sus sedes activas). Devuelve {nuevos, actualizados, aviso, sedes_sin_municipio, programas_sin_sede}.';

revoke all on function public.ri_programas_desde_estructura() from public, anon;
grant execute on function public.ri_programas_desde_estructura() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Cruces de toda la Población estudiantil
-- -----------------------------------------------------------------------------

/**
 * Documento, programa (PRO_CONSECUTIVO, tal como se capturó; vacío si la
 * plantilla no lo trae) y periodo de Participante, Relación de inscritos,
 * Inscritos por programa, Admitidos, Primer curso, Matriculados y Graduados.
 * Los Graduados del periodo pedido no se devuelven (se validan en su hoja).
 * La interfaz la pide por páginas (PostgREST corta en 1000 filas).
 */
create or replace function public.ri_cruces(p_periodo text)
returns table (plantilla text, periodo text, documento text, programa text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  -- Son documentos de personas: solo para quien captura (0104).
  if not (public.has_screen('reportes') and public.has_role_at_least('responsable')) then
    raise exception 'No tiene acceso a los datos de Reportes Institucionales: solo los ven quienes capturan las plantillas.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-[12]$' then
    raise exception 'El periodo «%» no es válido: se escribe como 2026-1 o 2026-2.', coalesce(p_periodo, '');
  end if;

  return query
    select e.plantilla,
           e.periodo,
           btrim(f.datos ->> 'NUM_DOCUMENTO'),
           case when e.plantilla in ('participante', 'inscritos') then null
                else nullif(btrim(coalesce(f.datos ->> 'PRO_CONSECUTIVO', f.datos ->> 'CODIGO_PROGRAMA',
                                           f.datos ->> 'ID_PROGRAMA', f.datos ->> 'PROGRAMA', '')), '')
           end
      from public.ri_entregas e
      join public.ri_filas f on f.entrega_id = e.id
     where e.reporte = 'snies'
       and e.plantilla in ('participante', 'inscritos', 'inscritos_programa', 'admitidos',
                           'primer_curso', 'matriculados', 'graduados')
       and not (e.plantilla = 'graduados' and e.periodo = p_periodo)
       and nullif(btrim(f.datos ->> 'NUM_DOCUMENTO'), '') is not null
     order by e.plantilla, e.periodo, f.id;
end;
$$;

comment on function public.ri_cruces(text) is
  'Reportes Institucionales: documento, programa y periodo de las plantillas de Población estudiantil (sin los graduados del periodo pedido), para las reglas de cruce.';

revoke all on function public.ri_cruces(text) from public, anon;
grant execute on function public.ri_cruces(text) to authenticated;

notify pgrst, 'reload schema';

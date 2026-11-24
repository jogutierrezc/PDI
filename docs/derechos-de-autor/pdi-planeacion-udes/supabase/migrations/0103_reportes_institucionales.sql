-- =============================================================================
-- 0103 · Reportes Institucionales: SNIES (y CNA, en borrador).
--
-- Lo que la Universidad le entrega al Estado cada periodo, plantilla por
-- plantilla. Adentro se captura con NOMBRES («Bucaramanga (Santander)»,
-- «Medicina», «Colombia»); los códigos oficiales (DIVIPOLA, país, código SNIES
-- del programa) solo aparecen en el archivo que se exporta para HECAA, y esa
-- traducción la hace el navegador con los catálogos de aquí.
--
--   ri_catalogo_items     programas, municipios y países: nombre adentro,
--                         código afuera. Los programas NO se siembran: salen de
--                         la estructura institucional (units.snies_code, 0063)
--                         con ri_programas_desde_estructura().
--   ri_entregas           una plantilla en un periodo y su estado:
--                         pendiente → cargada → errores | validada → enviada.
--   ri_filas              las filas capturadas, tal cual (nombres, no
--                         códigos). CONTIENE DATOS PERSONALES (documento,
--                         nombres, correo): RLS estricta y nada para anon.
--
-- Quién hace qué (espejo de role-matrix.ts, módulo «reportes»):
--   ver         la pantalla «reportes» del rol de acceso (has_screen)
--   capturar    ver + responsable o más: guardar filas, marcar la
--               validación y registrar el envío
--   catálogos   ver + planeación: catálogos, renombres y reabrir un envío
--
-- La validación corre en el navegador (el motor); la base guarda su resultado
-- (cuántos errores) y hace cumplir el orden de los estados. Toda escritura va
-- por RPC `security definer`: las tablas no tienen políticas de escritura.
--
-- Storage: bucket privado «reportes-certificados» (PDF, 10 MB) con el
-- certificado de cargue que devuelve HECAA, en snies/<periodo>/….
--
-- Requiere 0024 (has_screen, has_role_at_least), 0057 (units) y 0063
-- (units.snies_code). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catálogos: nombre adentro, código afuera
-- -----------------------------------------------------------------------------

create table if not exists public.ri_catalogo_items (
  catalogo      text not null,
  codigo        text not null,
  nombre        text not null,
  -- Solo municipios: distingue homónimos («Barbosa (Antioquia)» y «Barbosa (Santander)»).
  departamento  text,
  -- Solo programas: códigos DIVIPOLA donde tiene registro calificado.
  oferta        text[] not null default '{}',
  activo        boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (catalogo, codigo),
  constraint ri_catalogo_items_catalogo check (catalogo in ('programa', 'municipio', 'pais')),
  constraint ri_catalogo_items_codigo check (codigo ~ '^[0-9A-Za-z_-]{1,20}$'),
  constraint ri_catalogo_items_nombre check (char_length(btrim(nombre)) between 1 and 200)
);

comment on table public.ri_catalogo_items is
  'Reportes Institucionales (0103): catálogos que administra Planeación. Se captura con el nombre; el código solo sale en el archivo para HECAA.';

create index if not exists ri_catalogo_items_nombre_idx on public.ri_catalogo_items (catalogo, nombre);

-- Municipios con su código DIVIPOLA (DANE) y su departamento.
insert into public.ri_catalogo_items (catalogo, codigo, nombre, departamento, updated_by)
values
  ('municipio', '68001', 'Bucaramanga', 'Santander', null),
  ('municipio', '68276', 'Floridablanca', 'Santander', null),
  ('municipio', '68307', 'Girón', 'Santander', null),
  ('municipio', '68547', 'Piedecuesta', 'Santander', null),
  ('municipio', '68081', 'Barrancabermeja', 'Santander', null),
  ('municipio', '54001', 'Cúcuta', 'Norte de Santander', null),
  ('municipio', '54405', 'Los Patios', 'Norte de Santander', null),
  ('municipio', '54874', 'Villa del Rosario', 'Norte de Santander', null),
  ('municipio', '54498', 'Ocaña', 'Norte de Santander', null),
  ('municipio', '20001', 'Valledupar', 'Cesar', null),
  ('municipio', '20011', 'Aguachica', 'Cesar', null),
  ('municipio', '11001', 'Bogotá, D.C.', 'Bogotá, D.C.', null)
on conflict do nothing;

-- Países con su código numérico (ISO 3166-1).
insert into public.ri_catalogo_items (catalogo, codigo, nombre, updated_by)
values
  ('pais', '170', 'Colombia', null),
  ('pais', '862', 'Venezuela', null),
  ('pais', '218', 'Ecuador', null),
  ('pais', '604', 'Perú', null),
  ('pais', '591', 'Panamá', null),
  ('pais', '840', 'Estados Unidos', null)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Entregas y filas
-- -----------------------------------------------------------------------------

create table if not exists public.ri_entregas (
  id                uuid primary key default gen_random_uuid(),
  reporte           text not null default 'snies',
  plantilla         text not null,
  periodo           text not null,
  estado            text not null default 'pendiente',
  filas             integer not null default 0,
  errores           integer not null default 0,
  validada_en       timestamptz,
  validada_por      uuid references public.profiles (id) on delete set null,
  enviada_en        timestamptz,
  enviada_por       uuid references public.profiles (id) on delete set null,
  certificado_path  text,
  updated_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint ri_entregas_unica unique (reporte, plantilla, periodo),
  constraint ri_entregas_reporte check (reporte in ('snies', 'cna')),
  constraint ri_entregas_plantilla check (plantilla ~ '^[a-z_]{1,40}$'),
  constraint ri_entregas_periodo check (periodo ~ '^[0-9]{4}-[12]$'),
  constraint ri_entregas_estado check (estado in ('pendiente', 'cargada', 'errores', 'validada', 'enviada')),
  constraint ri_entregas_conteos check (filas >= 0 and errores >= 0)
);

comment on table public.ri_entregas is
  'Reportes Institucionales (0103): una plantilla en un periodo y su estado (pendiente, cargada, errores, validada, enviada). Se escribe solo por RPC.';

create index if not exists ri_entregas_periodo_idx on public.ri_entregas (reporte, periodo);

create table if not exists public.ri_filas (
  id          uuid primary key default gen_random_uuid(),
  entrega_id  uuid not null references public.ri_entregas (id) on delete cascade,
  orden       integer not null,
  datos       jsonb not null,
  constraint ri_filas_datos check (jsonb_typeof(datos) = 'object')
);

comment on table public.ri_filas is
  'Reportes Institucionales (0103): filas capturadas con NOMBRES, tal cual. CONTIENE DATOS PERSONALES (documento, nombres, correo, fecha de nacimiento): solo la leen quienes ven la pantalla «reportes», nunca anon; se escribe solo por RPC.';

create index if not exists ri_filas_entrega_idx on public.ri_filas (entrega_id, orden);

-- -----------------------------------------------------------------------------
-- 3. Quién lee
-- -----------------------------------------------------------------------------

alter table public.ri_catalogo_items enable row level security;
alter table public.ri_entregas       enable row level security;
alter table public.ri_filas          enable row level security;

drop policy if exists ri_catalogo_items_read on public.ri_catalogo_items;
create policy ri_catalogo_items_read on public.ri_catalogo_items for select to authenticated
  using (true);

drop policy if exists ri_entregas_read on public.ri_entregas;
create policy ri_entregas_read on public.ri_entregas for select to authenticated
  using (public.has_screen('reportes'));

drop policy if exists ri_filas_read on public.ri_filas;
create policy ri_filas_read on public.ri_filas for select to authenticated
  using (public.has_screen('reportes'));

-- Sin políticas de escritura: todo cambio pasa por las funciones de abajo.
revoke all on public.ri_catalogo_items, public.ri_entregas, public.ri_filas from anon, public, authenticated;
grant select on public.ri_catalogo_items, public.ri_entregas, public.ri_filas to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Guardas
-- -----------------------------------------------------------------------------

/** Capturar: ver la pantalla y ser responsable o más. */
create or replace function public.ri_exigir_captura()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_screen('reportes') and public.has_role_at_least('responsable')) then
    raise exception 'No tiene permiso para capturar Reportes Institucionales: se necesita la pantalla «reportes» y rol responsable o superior.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

/** Catálogos y reapertura: ver la pantalla y ser de Planeación o más. */
create or replace function public.ri_exigir_planeacion()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_screen('reportes') and public.has_role_at_least('planeacion')) then
    raise exception 'Solo Planeación puede administrar los catálogos y reabrir envíos de Reportes Institucionales.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

/** Plantilla SNIES conocida y periodo «AAAA-S». */
create or replace function public.ri_exigir_plantilla(p_plantilla text, p_periodo text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_plantilla is null or p_plantilla not in
     ('participante', 'inscritos', 'admitidos', 'primer_curso', 'matriculados', 'graduados', 'docentes') then
    raise exception 'La plantilla «%» no es una plantilla SNIES conocida.', coalesce(p_plantilla, '');
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-[12]$' then
    raise exception 'El periodo «%» no es válido: se escribe como 2026-1 o 2026-2.', coalesce(p_periodo, '');
  end if;
end;
$$;

revoke all on function public.ri_exigir_captura() from public, anon;
revoke all on function public.ri_exigir_planeacion() from public, anon;
revoke all on function public.ri_exigir_plantilla(text, text) from public, anon;
grant execute on function public.ri_exigir_captura() to authenticated;
grant execute on function public.ri_exigir_planeacion() to authenticated;
grant execute on function public.ri_exigir_plantilla(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. El ciclo de una entrega
-- -----------------------------------------------------------------------------

/**
 * Reemplaza todas las filas de la entrega (la crea si no existe). Queda
 * «cargada», o «pendiente» si no quedan filas. Cualquier validación anterior
 * se pierde: hay que volver a validar. Una entrega enviada no se edita.
 */
create or replace function public.ri_guardar_filas(p_plantilla text, p_periodo text, p_filas jsonb)
returns public.ri_entregas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega public.ri_entregas;
  v_total integer;
begin
  perform public.ri_exigir_captura();
  perform public.ri_exigir_plantilla(p_plantilla, p_periodo);

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas deben llegar como una lista.';
  end if;
  if jsonb_array_length(p_filas) > 200000 then
    raise exception 'Son % filas: el máximo por plantilla es 200.000.', jsonb_array_length(p_filas);
  end if;
  if exists (select 1 from jsonb_array_elements(p_filas) as x(v) where jsonb_typeof(x.v) <> 'object') then
    raise exception 'Cada fila debe ser un objeto con sus campos.';
  end if;

  insert into public.ri_entregas (reporte, plantilla, periodo, updated_by)
  values ('snies', p_plantilla, p_periodo, auth.uid())
  on conflict (reporte, plantilla, periodo) do nothing;

  select * into v_entrega
    from public.ri_entregas
   where reporte = 'snies' and plantilla = p_plantilla and periodo = p_periodo
   for update;

  if v_entrega.estado = 'enviada' then
    raise exception 'La plantilla % del periodo % ya se envió a SNIES y no se puede editar. Pida a Planeación que la reabra.',
      p_plantilla, p_periodo;
  end if;

  delete from public.ri_filas where entrega_id = v_entrega.id;

  insert into public.ri_filas (entrega_id, orden, datos)
  select v_entrega.id, (x.n - 1)::integer, x.v
    from jsonb_array_elements(p_filas) with ordinality as x(v, n);
  get diagnostics v_total = row_count;

  update public.ri_entregas
     set estado = case when v_total > 0 then 'cargada' else 'pendiente' end,
         filas = v_total,
         errores = 0,
         validada_en = null,
         validada_por = null,
         updated_at = now(),
         updated_by = auth.uid()
   where id = v_entrega.id
  returning * into v_entrega;

  return v_entrega;
end;
$$;

comment on function public.ri_guardar_filas(text, text, jsonb) is
  'Reportes Institucionales: reemplaza las filas de una plantilla en un periodo. Queda cargada (o pendiente sin filas).';

/** Resultado de «Validar plantilla» (lo corre el navegador): errores o validada. */
create or replace function public.ri_marcar_validacion(p_plantilla text, p_periodo text, p_errores integer)
returns public.ri_entregas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega public.ri_entregas;
  v_total integer;
begin
  perform public.ri_exigir_captura();
  perform public.ri_exigir_plantilla(p_plantilla, p_periodo);

  if p_errores is null or p_errores < 0 then
    raise exception 'El número de errores debe ser cero o mayor.';
  end if;

  select * into v_entrega
    from public.ri_entregas
   where reporte = 'snies' and plantilla = p_plantilla and periodo = p_periodo
   for update;

  if not found then
    raise exception 'La plantilla % del periodo % todavía no tiene filas guardadas: guárdelas antes de validar.', p_plantilla, p_periodo;
  end if;
  if v_entrega.estado = 'enviada' then
    raise exception 'La plantilla % del periodo % ya se envió a SNIES: no se vuelve a validar sin reabrirla.', p_plantilla, p_periodo;
  end if;

  select count(*) into v_total from public.ri_filas where entrega_id = v_entrega.id;
  if v_total = 0 then
    raise exception 'La plantilla % del periodo % no tiene filas que validar.', p_plantilla, p_periodo;
  end if;

  update public.ri_entregas
     set estado = case when p_errores > 0 then 'errores' else 'validada' end,
         filas = v_total,
         errores = p_errores,
         validada_en = now(),
         validada_por = auth.uid(),
         updated_at = now(),
         updated_by = auth.uid()
   where id = v_entrega.id
  returning * into v_entrega;

  return v_entrega;
end;
$$;

comment on function public.ri_marcar_validacion(text, text, integer) is
  'Reportes Institucionales: guarda el resultado de validar una plantilla (errores o validada).';

/** Registra el envío a HECAA. Solo desde «validada». */
create or replace function public.ri_registrar_envio(p_plantilla text, p_periodo text, p_certificado text default null)
returns public.ri_entregas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega public.ri_entregas;
  v_certificado text := nullif(btrim(coalesce(p_certificado, '')), '');
begin
  perform public.ri_exigir_captura();
  perform public.ri_exigir_plantilla(p_plantilla, p_periodo);

  if v_certificado is not null and v_certificado not like 'snies/' || p_periodo || '/%' then
    raise exception 'El certificado debe estar en la carpeta snies/%/ del bucket de certificados.', p_periodo;
  end if;

  select * into v_entrega
    from public.ri_entregas
   where reporte = 'snies' and plantilla = p_plantilla and periodo = p_periodo
   for update;

  if not found then
    raise exception 'La plantilla % del periodo % todavía no tiene filas guardadas.', p_plantilla, p_periodo;
  end if;
  if v_entrega.estado = 'enviada' then
    raise exception 'La plantilla % del periodo % ya estaba registrada como enviada.', p_plantilla, p_periodo;
  end if;
  if v_entrega.estado <> 'validada' then
    raise exception 'La plantilla % del periodo % está «%»: solo se registra el envío de una plantilla validada y sin errores.',
      p_plantilla, p_periodo, v_entrega.estado;
  end if;

  update public.ri_entregas
     set estado = 'enviada',
         enviada_en = now(),
         enviada_por = auth.uid(),
         certificado_path = v_certificado,
         updated_at = now(),
         updated_by = auth.uid()
   where id = v_entrega.id
  returning * into v_entrega;

  return v_entrega;
end;
$$;

comment on function public.ri_registrar_envio(text, text, text) is
  'Reportes Institucionales: marca una plantilla validada como enviada a SNIES, con su certificado de cargue.';

/** Planeación reabre un envío: vuelve a «cargada» y hay que validar otra vez. */
create or replace function public.ri_reabrir(p_plantilla text, p_periodo text)
returns public.ri_entregas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega public.ri_entregas;
begin
  perform public.ri_exigir_planeacion();
  perform public.ri_exigir_plantilla(p_plantilla, p_periodo);

  select * into v_entrega
    from public.ri_entregas
   where reporte = 'snies' and plantilla = p_plantilla and periodo = p_periodo
   for update;

  if not found or v_entrega.estado <> 'enviada' then
    raise exception 'La plantilla % del periodo % no está enviada: no hay nada que reabrir.', p_plantilla, p_periodo;
  end if;

  update public.ri_entregas
     set estado = 'cargada',
         errores = 0,
         validada_en = null,
         validada_por = null,
         enviada_en = null,
         enviada_por = null,
         certificado_path = null,
         updated_at = now(),
         updated_by = auth.uid()
   where id = v_entrega.id
  returning * into v_entrega;

  return v_entrega;
end;
$$;

comment on function public.ri_reabrir(text, text) is
  'Reportes Institucionales: Planeación devuelve una plantilla enviada a «cargada».';

revoke all on function public.ri_guardar_filas(text, text, jsonb) from public, anon;
revoke all on function public.ri_marcar_validacion(text, text, integer) from public, anon;
revoke all on function public.ri_registrar_envio(text, text, text) from public, anon;
revoke all on function public.ri_reabrir(text, text) from public, anon;
grant execute on function public.ri_guardar_filas(text, text, jsonb) to authenticated;
grant execute on function public.ri_marcar_validacion(text, text, integer) to authenticated;
grant execute on function public.ri_registrar_envio(text, text, text) to authenticated;
grant execute on function public.ri_reabrir(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Catálogos
-- -----------------------------------------------------------------------------

/**
 * Guarda un ítem desde su JSON ({catalogo, codigo, nombre, departamento?,
 * oferta?, activo?}). Con p_codigo_anterior distinto del nuevo, le cambia el
 * código al ítem existente. Uso interno de ri_catalogo_guardar e importar.
 * Devuelve true si el ítem es nuevo, false si ya existía, null si no cambió.
 */
create or replace function public.ri_catalogo_upsert(p_catalogo text, p_item jsonb, p_codigo_anterior text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := btrim(coalesce(p_item ->> 'codigo', ''));
  v_nombre text := btrim(coalesce(p_item ->> 'nombre', ''));
  v_departamento text := nullif(btrim(coalesce(p_item ->> 'departamento', '')), '');
  v_oferta text[];
  v_activo boolean;
  v_anterior text := nullif(btrim(coalesce(p_codigo_anterior, '')), '');
  v_actual public.ri_catalogo_items;
begin
  if p_catalogo is null or p_catalogo not in ('programa', 'municipio', 'pais') then
    raise exception 'El catálogo «%» no existe: son programa, municipio y pais.', coalesce(p_catalogo, '');
  end if;
  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'Cada ítem del catálogo debe ser un objeto con código y nombre.';
  end if;
  if v_codigo !~ '^[0-9A-Za-z_-]{1,20}$' then
    raise exception 'El código «%» no es válido: solo números, letras y guiones, hasta 20.', v_codigo;
  end if;
  if p_catalogo = 'municipio' and v_codigo !~ '^[0-9]{5}$' then
    raise exception 'El código DIVIPOLA «%» debe tener 5 dígitos (Bucaramanga es 68001).', v_codigo;
  end if;
  if p_catalogo = 'pais' and v_codigo !~ '^[0-9]{3}$' then
    raise exception 'El código de país «%» debe tener 3 dígitos (Colombia es 170).', v_codigo;
  end if;
  if char_length(v_nombre) not between 1 and 200 then
    raise exception 'El ítem % necesita un nombre (hasta 200 caracteres).', v_codigo;
  end if;

  if p_item ? 'oferta' and jsonb_typeof(p_item -> 'oferta') = 'array' then
    v_oferta := array(
      select distinct btrim(o.v)
        from jsonb_array_elements_text(p_item -> 'oferta') as o(v)
       where btrim(o.v) <> ''
       order by 1
    );
  end if;
  if p_item ? 'activo' and jsonb_typeof(p_item -> 'activo') = 'boolean' then
    v_activo := (p_item ->> 'activo')::boolean;
  end if;

  -- Cambio de código: el ítem de antes pasa a llamarse con el nuevo.
  if v_anterior is not null and v_anterior <> v_codigo then
    if exists (select 1 from public.ri_catalogo_items i where i.catalogo = p_catalogo and i.codigo = v_codigo) then
      raise exception 'Ya existe el código % en el catálogo de %.', v_codigo, p_catalogo;
    end if;
    update public.ri_catalogo_items
       set codigo = v_codigo
     where catalogo = p_catalogo and codigo = v_anterior;
  end if;

  select * into v_actual from public.ri_catalogo_items where catalogo = p_catalogo and codigo = v_codigo for update;

  if not found then
    insert into public.ri_catalogo_items (catalogo, codigo, nombre, departamento, oferta, activo, updated_at, updated_by)
    values (p_catalogo, v_codigo, v_nombre, v_departamento, coalesce(v_oferta, '{}'), coalesce(v_activo, true), now(), auth.uid());
    return true;
  end if;

  if v_actual.nombre is not distinct from v_nombre
     and v_actual.departamento is not distinct from v_departamento
     and (v_oferta is null or v_actual.oferta = v_oferta)
     and (v_activo is null or v_actual.activo = v_activo)
     and (v_anterior is null or v_anterior = v_codigo) then
    return null;
  end if;

  update public.ri_catalogo_items
     set nombre = v_nombre,
         departamento = v_departamento,
         oferta = coalesce(v_oferta, oferta),
         activo = coalesce(v_activo, activo),
         updated_at = now(),
         updated_by = auth.uid()
   where catalogo = p_catalogo and codigo = v_codigo;
  return false;
end;
$$;

revoke all on function public.ri_catalogo_upsert(text, jsonb, text) from public, anon, authenticated;

create or replace function public.ri_catalogo_guardar(p_item jsonb, p_codigo_anterior text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ri_exigir_planeacion();
  perform public.ri_catalogo_upsert(p_item ->> 'catalogo', p_item, p_codigo_anterior);
end;
$$;

comment on function public.ri_catalogo_guardar(jsonb, text) is
  'Reportes Institucionales: crea o actualiza un ítem de catálogo; con p_codigo_anterior le cambia el código.';

/**
 * Quita un ítem, si su nombre no está en uso en filas guardadas. Se busca el
 * nombre y la etiqueta con departamento («Bucaramanga (Santander)») en los
 * campos que diga la interfaz; sin campos, en todos.
 */
create or replace function public.ri_catalogo_quitar(p_catalogo text, p_codigo text, p_campos text[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.ri_catalogo_items;
  v_valores text[];
  v_uso integer;
begin
  perform public.ri_exigir_planeacion();

  select * into v_item from public.ri_catalogo_items where catalogo = p_catalogo and codigo = p_codigo for update;
  if not found then
    raise exception 'No existe el código % en el catálogo de %.', coalesce(p_codigo, ''), coalesce(p_catalogo, '');
  end if;

  v_valores := array[v_item.nombre];
  if v_item.departamento is not null and lower(btrim(v_item.departamento)) <> lower(btrim(v_item.nombre)) then
    v_valores := v_valores || (v_item.nombre || ' (' || v_item.departamento || ')');
  end if;

  select count(distinct f.id) into v_uso
    from public.ri_filas f
    cross join lateral jsonb_each_text(f.datos) as d(campo, valor)
   where d.valor = any (v_valores)
     and (p_campos is null or cardinality(p_campos) = 0 or d.campo = any (p_campos));

  if v_uso > 0 then
    raise exception '«%» aparece en % fila(s) guardadas: no se puede quitar. Desactívelo o cambie esas filas primero.',
      v_valores[array_upper(v_valores, 1)], v_uso;
  end if;

  delete from public.ri_catalogo_items where catalogo = p_catalogo and codigo = p_codigo;
end;
$$;

comment on function public.ri_catalogo_quitar(text, text, text[]) is
  'Reportes Institucionales: quita un ítem de catálogo si su nombre no aparece en filas guardadas.';

/** Importa una lista de ítems a un catálogo: todo o nada. */
create or replace function public.ri_catalogo_importar(p_catalogo text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_pos bigint;
  v_resultado boolean;
  v_nuevos integer := 0;
  v_actualizados integer := 0;
begin
  perform public.ri_exigir_planeacion();

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Los ítems deben llegar como una lista.';
  end if;
  if jsonb_array_length(p_items) > 20000 then
    raise exception 'Son % ítems: el máximo por importación es 20.000.', jsonb_array_length(p_items);
  end if;

  for v_item, v_pos in select x.v, x.n from jsonb_array_elements(p_items) with ordinality as x(v, n) loop
    begin
      v_resultado := public.ri_catalogo_upsert(p_catalogo, v_item, null);
    exception when others then
      raise exception 'Fila % de la importación: %', v_pos, sqlerrm;
    end;
    if v_resultado is true then
      v_nuevos := v_nuevos + 1;
    elsif v_resultado is false then
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  return jsonb_build_object('nuevos', v_nuevos, 'actualizados', v_actualizados);
end;
$$;

comment on function public.ri_catalogo_importar(text, jsonb) is
  'Reportes Institucionales: importa ítems a un catálogo (todo o nada). Devuelve {nuevos, actualizados}.';

/**
 * Cambia un nombre por otro en las filas guardadas (tras renombrar un ítem
 * del catálogo), solo en los campos indicados. Devuelve cuántas casillas cambió.
 */
create or replace function public.ri_renombrar_en_filas(p_campos text[], p_anterior text, p_nuevo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo text;
  v_n integer;
  v_total integer := 0;
begin
  perform public.ri_exigir_planeacion();

  if p_campos is null or cardinality(p_campos) = 0 then
    raise exception 'Diga en qué campos se cambia el nombre.';
  end if;
  if p_anterior is null or btrim(p_anterior) = '' or p_nuevo is null or btrim(p_nuevo) = '' then
    raise exception 'El nombre anterior y el nuevo no pueden estar vacíos.';
  end if;
  if p_anterior = p_nuevo then
    return 0;
  end if;

  foreach v_campo in array p_campos loop
    update public.ri_filas
       set datos = jsonb_set(datos, array[v_campo], to_jsonb(p_nuevo))
     where datos ->> v_campo = p_anterior;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  return v_total;
end;
$$;

comment on function public.ri_renombrar_en_filas(text[], text, text) is
  'Reportes Institucionales: reemplaza un nombre por otro en los campos dados de las filas guardadas. Devuelve las casillas cambiadas.';

/**
 * Programas del catálogo desde la estructura institucional: cada unidad de
 * tipo programa con código SNIES. El nombre sale de units.name; el estado
 * (activo) no se toca, por si Planeación desactivó alguno a propósito.
 *
 * La oferta (DIVIPOLA donde tiene registro) no se puede deducir: las sedes
 * (campuses) no guardan municipio ni código DIVIPOLA, así que queda como esté
 * (vacía en los nuevos) y se completa a mano en el catálogo.
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
begin
  perform public.ri_exigir_planeacion();

  with fuente as (
    select distinct on (btrim(u.snies_code)) btrim(u.snies_code) as codigo, btrim(u.name) as nombre
      from public.units u
     where u.kind = 'programa'
       and u.snies_code is not null
       and btrim(u.snies_code) ~ '^[0-9A-Za-z_-]{1,20}$'
     order by btrim(u.snies_code), u.name
  ),
  escritos as (
    insert into public.ri_catalogo_items as i (catalogo, codigo, nombre, updated_at, updated_by)
    select 'programa', fuente.codigo, fuente.nombre, now(), auth.uid() from fuente
    on conflict (catalogo, codigo) do update
      set nombre = excluded.nombre, updated_at = now(), updated_by = auth.uid()
      where i.nombre is distinct from excluded.nombre
    returning (xmax = 0) as nuevo
  )
  select count(*) filter (where nuevo), count(*) filter (where not nuevo)
    into v_nuevos, v_actualizados
    from escritos;

  return jsonb_build_object(
    'nuevos', coalesce(v_nuevos, 0),
    'actualizados', coalesce(v_actualizados, 0),
    'aviso', 'Las sedes no guardan su municipio DIVIPOLA: la oferta de cada programa se completa a mano en el catálogo.'
  );
end;
$$;

comment on function public.ri_programas_desde_estructura() is
  'Reportes Institucionales: copia al catálogo los programas con código SNIES de la estructura institucional. Devuelve {nuevos, actualizados, aviso}.';

revoke all on function public.ri_catalogo_guardar(jsonb, text) from public, anon;
revoke all on function public.ri_catalogo_quitar(text, text, text[]) from public, anon;
revoke all on function public.ri_catalogo_importar(text, jsonb) from public, anon;
revoke all on function public.ri_renombrar_en_filas(text[], text, text) from public, anon;
revoke all on function public.ri_programas_desde_estructura() from public, anon;
grant execute on function public.ri_catalogo_guardar(jsonb, text) to authenticated;
grant execute on function public.ri_catalogo_quitar(text, text, text[]) to authenticated;
grant execute on function public.ri_catalogo_importar(text, jsonb) to authenticated;
grant execute on function public.ri_renombrar_en_filas(text[], text, text) to authenticated;
grant execute on function public.ri_programas_desde_estructura() to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Cruces entre plantillas
-- -----------------------------------------------------------------------------

/**
 * Lo que las reglas de cruce necesitan de otras plantillas: el documento (y el
 * programa, tal como se capturó) de Participante, Matriculados y Graduados de
 * cualquier periodo, menos los Graduados del propio periodo (se validan en su
 * plantilla). El navegador normaliza el documento y pasa el programa a código.
 *
 * El programa se lee de PRO_CONSECUTIVO (encabezado SNIES); los otros nombres
 * son por si la plantilla lo llama distinto. Es una lista larga: la interfaz la
 * pide por páginas (PostgREST corta en 1000 filas).
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
  if not public.has_screen('reportes') then
    raise exception 'No tiene acceso a Reportes Institucionales.' using errcode = 'insufficient_privilege';
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-[12]$' then
    raise exception 'El periodo «%» no es válido: se escribe como 2026-1 o 2026-2.', coalesce(p_periodo, '');
  end if;

  return query
    select e.plantilla,
           e.periodo,
           btrim(f.datos ->> 'NUM_DOCUMENTO'),
           case when e.plantilla = 'participante' then null
                else nullif(btrim(coalesce(f.datos ->> 'PRO_CONSECUTIVO', f.datos ->> 'CODIGO_PROGRAMA',
                                           f.datos ->> 'ID_PROGRAMA', f.datos ->> 'PROGRAMA', '')), '')
           end
      from public.ri_entregas e
      join public.ri_filas f on f.entrega_id = e.id
     where e.reporte = 'snies'
       and e.plantilla in ('participante', 'matriculados', 'graduados')
       and not (e.plantilla = 'graduados' and e.periodo = p_periodo)
       and nullif(btrim(f.datos ->> 'NUM_DOCUMENTO'), '') is not null
     order by e.plantilla, e.periodo, f.id;
end;
$$;

comment on function public.ri_cruces(text) is
  'Reportes Institucionales: documento y programa de Participante, Matriculados y Graduados (sin los graduados del periodo pedido), para las reglas de cruce.';

revoke all on function public.ri_cruces(text) from public, anon;
grant execute on function public.ri_cruces(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Certificados de cargue (Storage)
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('reportes-certificados', 'reportes-certificados', false, 10485760, array['application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists ri_certificados_lectura on storage.objects';
  execute $pol$
    create policy ri_certificados_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'reportes-certificados' and public.has_screen('reportes'))
  $pol$;

  execute 'drop policy if exists ri_certificados_escritura on storage.objects';
  execute $pol$
    create policy ri_certificados_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'reportes-certificados' and public.has_screen('reportes') and public.has_role_at_least('responsable'))
  $pol$;

  execute 'drop policy if exists ri_certificados_borrado on storage.objects';
  execute $pol$
    create policy ri_certificados_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'reportes-certificados' and public.has_screen('reportes') and public.has_role_at_least('planeacion'))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "reportes-certificados" (%). Créelo a mano desde Storage: privado, 10 MB por archivo, solo PDF.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';

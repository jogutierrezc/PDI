# Planeación y Seguimiento · contrato de la base (Fase 3: avances, evidencias, riesgos, conexión con el PDI)

Migración: `supabase/migrations/0288_planeacion_seguimiento_avances.sql` (requiere 0286 y 0287). Script: `supabase/actualizar-planeacion-seguimiento-f3.sh`. Mismo estilo que `CONTRATO-BD-F2.md`: todo por `supabase.rpc(nombre, {p_…})` con la sesión de la persona; tablas solo de lectura; `anon` sin acceso; errores 42501 (permiso), P0002 (no existe o fuera de alcance), 22023 (datos), 23503 (en uso). Reutiliza `ps_poder`, `ps_gestores_de`, `ps_aviso`, `ps_evento_act`, `ps_hoy` y los disparadores de la fase 2. Lección de 0192/gm: nunca `capacity`/`has_role_at_least`; fijar `search_path`.

## Decisiones del usuario (20 nov 2026), ya cerradas

1. **Plazos de aviso por oficina.** Los plazos de aviso se disponen conforme a la planeación de cada oficina: `ps_config` queda como valor **por defecto** y cada oficina puede tener el suyo (tabla `ps_config_oficina`, que gestiona el gestor de esa oficina o el admin). `ps_generar_avisos_vencimiento` usa el de la oficina si existe y, si no, el general.
2. **Campus.** Se confirma la regla de pedir confirmación al asignar a alguien de otro campus (ya implementada en F2; no cambia).
3. **Conexión con el PDI, abierta.** Una actividad (con o sin línea del plan) puede conectarse a uno o varios **pilares** y **líneas de acción** del PDI institucional (`pillars` → `strategic_areas` → `action_lines`, ya existentes), o declarar **«sin conexión con el PDI»**. Estados: `sin_definir` (las actividades anteriores a la F3; no se rompe nada) · `con_pdi` · `sin_pdi`. Al **crear** o importar una actividad la oficina debe elegir `con_pdi` o `sin_pdi` (no `sin_definir`); al editar una vieja puede quedarse `sin_definir`.

## 1. Conexión con el PDI

- `ps_actividades` gana `pdi_conexion text not null default 'sin_definir' check (in ('sin_definir','con_pdi','sin_pdi'))`.
- Tabla `ps_actividad_pdi (actividad_id, pillar_id, action_line_id null, creado_en)`; PK (`actividad_id`, `pillar_id`, `action_line_id` con `nulls not distinct`). Una fila con `action_line_id` NULL = «el pilar completo, sin línea concreta». Si hay `action_line_id`, su pilar debe ser el `pillar_id` (validado con join; un trigger o la función). Máx. 12 filas por actividad. Con `sin_pdi` o `sin_definir` no hay filas; con `con_pdi` hay al menos 1.
- `ps_pdi_catalogo() → jsonb`: `[ {pillar_id, codigo|slug, nombre, areas:[{area_id, codigo, nombre, lineas:[{linea_id, codigo, nombre}]}]} ]`, solo pilares publicados, ordenados por `position`. Lo puede llamar cualquier persona con nivel de módulo.
- `ps_actividad_crear`/`ps_actividad_editar`/`ps_actividades_cargar` aceptan `pdi` en `p_datos`/`p_cambios`: `{"conexion":"con_pdi"|"sin_pdi", "items":[{"pillar_id":"…","action_line_id":"…|null"}]}`; en la carga masiva por Excel las columnas son `pdi` (`Sin conexión` | `Con PDI`), `pilar_pdi` (nombre o slug del pilar; varios separados por `;`) y `linea_pdi` (código `LA-4.1` o nombre; varios por `;`, cada línea implica su pilar). Errores de fila con `campo` `pdi`, `pilar_pdi` o `linea_pdi`.
- `ActividadJSON` gana `"pdi": {"conexion":"con_pdi","items":[{"pillar_id","pillar","pillar_slug","area","linea_id","linea_codigo","linea"}]}`.
- Filtro nuevo en `ps_actividades_oficina`: `pdi` (`con_pdi` | `sin_pdi` | `sin_definir`) y `pillar_id`.
- Evento `actividad.pdi` (datos: antes/después). La conexión se edita solo por gestor/admin.
- Resumen: `ps_resumen_pdi_oficina(p_unit) → {con_pdi, sin_pdi, sin_definir, por_pilar:[{pillar_id, nombre, actividades}]}` (para la cabecera de Planificación).

## 2. Avances

Tablas (solo lectura; RLS por `ps_poder`):

**`ps_avances`** (`id`, `actividad_id`, `version_id` = versión vigente del plan cuando se reportó (no cambia), `fecha date`, `av_fisico numeric(5,2)` 0–100, `av_financiero numeric(5,2) null` 0–100 (null = no aplica), `nota` (10 a 2000), `estado` `pendiente|validado|devuelto`, `reportado_por`, `reportado_en`, `revisado_por null`, `revisado_en null`, `nota_revision null`). CHECK: `revisado_por is distinct from reportado_por`; fecha no futura (tolerancia: `ps_hoy()`); **monotonía**: el físico de un avance no puede ser menor al del último avance **validado** de la actividad (al reportar y al validar). Un avance `validado` o `devuelto` no se edita (disparador). Un colaborador tiene **a lo sumo un avance `pendiente` por actividad** (índice único parcial `(actividad_id) where estado='pendiente'`).
**`ps_evidencias`** (`id`, `avance_id`, `actividad_id`, `tipo` `archivo|enlace`, `nombre` (1–200), `storage_path null`, `url null` (solo http/https), `mime null`, `bytes null`, `huella_sha256 null`, `version_id`, `subido_por`, `creado_en`). CHECK coherencia por tipo; máx. 10 por avance; archivos ≤ 20 MB, tipos: pdf, docx, xlsx, pptx, png, jpg, csv, txt, zip (validar mime y extensión). Bucket privado **`ps-evidencias`** (política: leer/escribir solo si `ps_poder(oficina de la actividad)` lo permite; ruta `<oficina_unit_id>/<actividad_id>/<uuid>-<nombre>`); las URL firmadas las pide la interfaz con supabase-js. La evidencia de un avance validado no se borra.
**`ps_riesgos`** (`id`, `actividad_id`, `oficina_unit_id`, `titulo` (3–200), `descripcion`, `nivel` `Crítico|Alto|Medio|Bajo`, `estado` `abierto|mitigando|cerrado`, `mitigacion`, `creado_por`, `creado_en`, `cerrado_en`) y **`ps_acciones`** (`id`, `riesgo_id`, `texto` (3–300), `responsable_id null`, `vence date null`, `estado` `pendiente|en_curso|hecha`, `hecha_en`, `creado_en`). Máx. 20 riesgos abiertos por actividad, 10 acciones por riesgo.

Reglas de autoría (iguales a la matriz de §2 de F2):
- **Reportar avance**: gestor/admin, o colaborador **asignado** a la actividad. Crea `ps_avances` en `pendiente`, enlaza las evidencias, **mueve la actividad a `en_revision`**, deja comentario `cambio_estado`, evento `avance.reportado`, y avisa al/los gestores (`c-ps-avance`). Si la actividad estaba `hecho`, no se reporta (error 22023).
- **Validar**: gestor de la oficina o admin, **nunca el propio**. Si el autor del avance es gestor, lo valida un admin del módulo («Planeación»). Pone `validado`, y el avance validado pasa a ser el vigente de la actividad. Si `av_fisico = 100` la actividad pasa a `hecho` en el mismo acto (con `completada_en`); si no, vuelve a `en_curso` (o conserva `en_riesgo` si tiene un riesgo `Crítico`/`Alto` abierto). Aviso `c-ps-validado` al autor; si pasó a hecho, también `c-ps-cumplida` (ya existe).
- **Devolver**: mismo poder; nota de revisión de **≥ 20 caracteres**; pone `devuelto`, la actividad vuelve a `en_curso`, comentario `devolucion`, aviso `c-ps-devuelto` (ya existe) al autor.
- **Validar en lote**: `ps_avances_validar_lote(p_ids uuid[])` hasta 50, **todo o nada**, mismas reglas por cada uno.
- `ps_actividad_mover` a `hecho` por el gestor: si hay un avance `pendiente` de otra persona lo valida en el mismo gesto (ya lo anticipa F2; completar), y exige que exista al menos un avance validado o que el gestor reporte-y-valide uno (`ps_avance_reportar` con `p_validar_propio` no existe: el gestor que quiere cerrar sin reporte previo usa `ps_actividad_cerrar(p_id, p_nota)` que registra un avance de cierre `validado` 100 % con autor y revisor **distintos solo si es posible**; si es el único gestor, queda `validado` por sí mismo y se marca `datos.autovalidado = true` en el evento para auditoría). Decisión: la regla «nadie valida lo propio» se **mantiene para avances parciales**; el cierre administrativo del gestor es la única excepción, explícita y auditada.
- **Plazo de validación**: `ps_config.validar_horas int default 72`; los avances `pendiente` que pasan el plazo generan un aviso `c-ps-validacion-pendiente` al gestor (una vez, idempotente) desde `ps_generar_avisos_vencimiento`; el campo `ps_avances.vencido` se calcula en la lectura.
- Avance de la actividad = el del último avance `validado` (`av_fisico`, `av_financiero`); sin ninguno = 0. Ya no se infiere del estado. `ActividadJSON` gana `"avance": {"fisico": 40, "financiero": null, "validado_en": "…|null", "pendientes": 1}`.

Funciones de escritura (todas devuelven jsonb):
- `ps_avance_reportar(p_actividad uuid, p_datos jsonb) → {ok, avance, actividad}`; `p_datos`: `fecha`, `av_fisico`, `av_financiero|null`, `nota`, `evidencias:[{tipo,nombre,storage_path|url,mime,bytes,huella_sha256}]`, `riesgo: {titulo,descripcion,nivel,mitigacion}|null` (si viene, crea el riesgo en el mismo acto y pone la actividad en `en_riesgo` en lugar de `en_revision` **solo si** no hay avance que revisar; con avance siempre `en_revision`).
- `ps_avance_validar(p_id uuid, p_nota text default '')`, `ps_avance_devolver(p_id uuid, p_nota text)`, `ps_avances_validar_lote(p_ids uuid[])`, `ps_actividad_cerrar(p_id uuid, p_nota text)`.
- `ps_evidencia_registrar(p_avance uuid, p_evidencia jsonb)` (para añadir a un avance `pendiente` propio), `ps_evidencia_quitar(p_id uuid)` (solo de un avance `pendiente` y su autor o el gestor).
- `ps_riesgo_crear(p_actividad, p_datos)`, `ps_riesgo_editar(p_id, p_cambios)` (incluye `estado`), `ps_riesgo_cerrar(p_id, p_nota)`, `ps_accion_crear(p_riesgo, p_datos)`, `ps_accion_editar(p_id, p_cambios)`, `ps_accion_marcar(p_id, p_estado)`. Poder: gestor/admin todo; colaborador asignado crea riesgos y marca sus acciones; lector no.
- Eventos: `avance.reportado|validado|devuelto|autovalidado`, `evidencia.agregada|quitada`, `riesgo.creado|editado|cerrado`, `accion.creada|editada|marcada`.

Funciones de lectura:
- `ps_actividad_detalle(p_id)` gana `avances:[AvanceJSON]` (más reciente primero), `evidencias` dentro de cada avance (sin URL: la interfaz firma con `storage_path`), `riesgos:[{…, acciones:[…]}]`, `pdi`.
- `ps_avances_por_validar(p_unit uuid default null) → jsonb` (gestor/admin): `[ {avance…, actividad:{id,titulo,oficina,fin}, reportado_por:{id,nombre}, horas_esperando, vencido, puede_validar} ]`, más antiguo primero; `p_unit` null = todas las oficinas donde es gestor.
- `ps_mis_avances() → jsonb`: los avances de quien pregunta, con estado y nota de revisión.
- `ps_riesgos_oficina(p_unit, p_filtros jsonb default '{}') → jsonb`: `{total, riesgos:[…]}` con filtros `nivel`, `estado`, `actividad_id`.
- `AvanceJSON`: `{id, actividad_id, fecha, av_fisico, av_financiero, nota, estado, reportado_por:{id,nombre}, reportado_en, revisado_por:{id,nombre}|null, revisado_en, nota_revision, vencido, version_id, evidencias:[{id,tipo,nombre,url,storage_path,mime,bytes,huella_sha256,creado_en}]}`.

## 3. Plazos por oficina

- Tabla `ps_config_oficina (oficina_unit_id pk, dias_antes int[], vencida_max_avisos, vencida_gestor_horas, validar_horas, activo, actualizado_por, actualizado_en)`, mismas cotas que `ps_config`.
- `ps_config_oficina_leer(p_unit uuid) → {por_defecto: {…}, propia: {…}|null, efectiva: {…}}` (gestor de la oficina, admin; lector y colaborador pueden leer la efectiva).
- `ps_config_oficina_guardar(p_unit, p_dias_antes, p_vencida_max_avisos, p_vencida_gestor_horas, p_validar_horas, p_activo default true)` y `ps_config_oficina_quitar(p_unit)` (vuelve al general). Evento `config.avisos` con `oficina_unit_id`.
- `ps_generar_avisos_vencimiento` toma `efectiva` por oficina de cada actividad.

## 4. Plantillas de correo (nuevas, `on conflict do nothing`)

`c-ps-avance` y `c-ps-validado` ya existen (disparar ahora). Nueva: `c-ps-validacion-pendiente` (al gestor: «Hay N avances esperando tu revisión»). Se encolan con `ps_aviso` dentro de la misma transacción. `supabase/functions/correos` (acción `ps`) y `planeacion-seguimiento/avisos.ts` aprenden la clave nueva y los textos; `supabase/functions/planeacion-seguimiento/README.md` se actualiza.

## 5. Tests y entregables de la base

Pruebas PGlite en `tests/planeacion-seguimiento/avances.test.ts` (reutilizar `arnes.ts`): permisos por rol; autovalidación bloqueada; monotonía; validar/devolver/lote todo-o-nada; paso a `hecho` con 100 %; evidencias (límites, tipos); riesgos y acciones; PDI (catálogo, crear con/sin PDI, pilar–línea incoherentes, importación); plazos por oficina vs general; plazo de validación idempotente; `ps_actividad_eliminar` bloqueada con avances; RLS (otra oficina no ve avances). Debe seguir pasando todo lo anterior (`npx vitest run tests/planeacion-seguimiento src/modules/planeacion-seguimiento`).

## 6. Lo que quedó implementado en 0288 (precisiones y desviaciones del contrato)

Firmas y formas de respuesta exactas (todo por `supabase.rpc`, parámetros con prefijo `p_`):

| Función | Respuesta |
| --- | --- |
| `ps_avance_reportar(p_actividad, p_datos)` · `ps_avance_validar(p_id, p_nota default '')` · `ps_avance_devolver(p_id, p_nota)` · `ps_actividad_cerrar(p_id, p_nota)` | `{ok, avance: AvanceJSON, actividad: ActividadJSON}` |
| `ps_avances_validar_lote(p_ids uuid[])` | `{ok, validados, ids}`; si uno falla no se valida ninguno y el mensaje empieza por `Avance <id>:` (mismo código de error) |
| `ps_evidencia_registrar(p_avance, p_evidencia)` | `{id, tipo, nombre, url, storage_path, mime, bytes, huella_sha256, creado_en}` |
| `ps_evidencia_quitar(p_id)` | `{ok, id, storage_path}` (la interfaz borra el archivo del bucket con ese `storage_path`) |
| `ps_riesgo_crear` · `ps_riesgo_editar` · `ps_riesgo_cerrar` | `RiesgoJSON` directo: `{id, actividad_id, oficina_unit_id, titulo, descripcion, nivel, estado, mitigacion, nota_cierre, creado_por:{id,nombre}, creado_en, cerrado_en, acciones:[AccionJSON]}` |
| `ps_accion_crear` · `ps_accion_editar` · `ps_accion_marcar(p_id, p_estado)` | `AccionJSON`: `{id, riesgo_id, texto, responsable_id, responsable, vence, estado, hecha_en, creado_en}` |
| `ps_avances_por_validar(p_unit default null)` | array de `AvanceJSON` + `{actividad:{id,titulo,oficina,fin}, horas_esperando, puede_validar}` |
| `ps_mis_avances()` | array de `AvanceJSON` + `{actividad:{id,titulo,oficina}}` (los 200 más recientes) |
| `ps_riesgos_oficina(p_unit, p_filtros)` | `{total, riesgos:[RiesgoJSON + actividad (título)]}` |
| `ps_pdi_catalogo()` | `[{pillar_id, codigo (= slug), slug, numeral, nombre, areas:[{area_id, codigo, nombre, lineas:[{linea_id, codigo, nombre}]}]}]` |
| `ps_resumen_pdi_oficina(p_unit)` | `{con_pdi, sin_pdi, sin_definir, por_pilar:[{pillar_id, nombre, actividades}]}` |
| `ps_config_oficina_leer(p_unit)` | `{oficina_unit_id, por_defecto, propia, efectiva}`; cada bloque `{dias_antes, vencida_max_avisos, vencida_gestor_horas, validar_horas, activo}` (`efectiva` suma `propia: boolean`; `propia` suma `actualizado_en`). Lo lee quien ve la oficina |
| `ps_config_oficina_guardar(p_unit, p_dias_antes, p_vencida_max_avisos, p_vencida_gestor_horas, p_validar_horas, p_activo default true)` · `ps_config_oficina_quitar(p_unit)` | igual que `leer` (gestor de la oficina o admin) |
| `ps_config_guardar(p_dias_antes, p_vencida_max_avisos, p_vencida_gestor_horas, p_activo default true, p_validar_horas default null)` | **firma nueva** (5.º parámetro; nulo conserva el valor). `ps_config_leer()` devuelve también `validar_horas` |
| `ps_generar_avisos_vencimiento(p_hoy)` | `{hoy, activo, por_vencer, vencidas, gestor, validacion}` |

Desviaciones y decisiones tomadas donde el contrato era inconsistente:

1. **Autovalidación del cierre.** El `CHECK revisado_por distinct de reportado_por` impedía el cierre administrativo. Se agregó la columna `ps_avances.autovalidado boolean` (y `autovalidado` en `AvanceJSON`): solo `ps_actividad_cerrar` crea avances con `autovalidado = true` (estado `validado`, autor = revisor = quien cierra, `revisado_en` = ahora). Siempre queda autovalidado (quien cierra es el único que actúa); evento `avance.autovalidado` con `datos.autovalidado = true`. Si había un avance pendiente de otra persona, se valida antes (con su aviso `c-ps-validado`).
2. **`ps_actividad_mover` a `hecho` (gestor/admin) ya no cierra a secas**: valida el avance pendiente de otra persona; si es propio → 42501; si no existe ningún avance validado → 22023 «use ps_actividad_cerrar». Es un cambio de comportamiento respecto de la fase 2 (la interfaz debe ofrecer «Cerrar actividad»). Devolver de `en_revision` con un avance pendiente de otra persona lo deja `devuelto`. El colaborador no mueve una actividad `en_revision` con un avance pendiente.
3. **Reportar con riesgo siempre deja la actividad en `en_revision`** (el avance siempre trae porcentaje); el riesgo se crea en el mismo acto.
4. **Quién revisa.** `ps_motivo_no_revisa`: nunca el propio; solo gestor de la oficina o admin; si el autor es gestor (o admin) de esa oficina, solo lo revisa un admin. `puede_validar` en `ps_avances_por_validar` lo refleja. Devolver tiene el mismo poder que validar.
5. **Conexión con el PDI**: `ps_actividad_pdi` tiene `id uuid` como PK y la unicidad (con `action_line_id` nulo) se hace con dos índices únicos parciales (no depende de `NULLS NOT DISTINCT`). `ps_actividad_normalizar` (interna) cambia de firma (7.º parámetro `p_pdi_obligatorio`). Al crear o importar, `pdi` es obligatorio (error 22023 / error de fila con `campo` `pdi`); `sin_definir` solo se acepta al editar una actividad que ya está `sin_definir`. En `items`, si falta `pillar_id` se deduce de la línea. Excel: `pdi` = «Con PDI» | «Sin conexión» (también si/no, «sin pdi»); campos de error `pdi`, `pilar_pdi`, `linea_pdi`.
6. **Evidencias**: `ps_evidencia_registrar` solo la hace quien reportó el avance (aunque sea gestor); `ps_evidencia_quitar`, su autor o el gestor/admin. La ruta debe ser `<oficina_unit_id>/<actividad_id>/<archivo>` de la propia actividad (se valida). Se emite `evidencia.agregada` también al reportar con evidencias. Políticas del bucket: leer = `ps_poder(oficina)` no nulo; subir/borrar = gestor, admin o colaborador asignado (la actividad no puede estar `hecho`); un archivo ligado a un avance ya revisado no se borra.
7. **Riesgos**: columna extra `ps_riesgos.nota_cierre`. `ps_riesgo_editar` acepta `estado` (`abierto|mitigando|cerrado`) y emite `riesgo.cerrado` si pasa a cerrado. Colaborador asignado solo **crea** riesgos y **marca** las acciones donde es el responsable; crear/editar acciones y editar/cerrar riesgos es del gestor/admin.
8. **Plazos**: `activo = false` en la oficina apaga sus avisos de vencimiento y de validación pendiente; `ps_config.activo = false` apaga todo. `c-ps-validacion-pendiente`: un aviso por gestor y oficina (con `datos.n` y `datos.actividades`), no se repite mientras sea el mismo conjunto de avances. `p_hoy` (solo pruebas) mide las horas contra el mediodía de Bogotá de ese día.
9. **Eventos nuevos**: `actividad.pdi` (`antes`/`despues`), `avance.reportado|validado|devuelto|autovalidado`, `evidencia.agregada|quitada`, `riesgo.creado|editado|cerrado`, `accion.creada|editada|marcada`, `config.avisos` con `oficina_unit_id` (columna `ps_eventos.oficina_unit_id` y `datos.oficina_unit_id`).
10. **Avisos**: `c-ps-avance` (gestores menos el autor; `datos.fisico/financiero/nota`), `c-ps-validado` y `c-ps-devuelto` (al autor del avance), `c-ps-cumplida` (gestores y responsables menos quien valida), `c-ps-validacion-pendiente` (nueva). La interfaz debe llamar a `planeacion-seguimiento {action:"avisos"}` después de reportar, validar, devolver o cerrar.

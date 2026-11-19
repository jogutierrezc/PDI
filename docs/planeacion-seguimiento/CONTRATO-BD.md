# Planeación y Seguimiento · contrato de la base (Fase 1)

Migración: `supabase/migrations/0286_planeacion_seguimiento.sql`. Script de aplicación: `supabase/actualizar-planeacion-seguimiento.sh` (lo corre el usuario).
Todo se llama desde supabase-js con la sesión de la persona (rol `authenticated`). **`anon` no puede leer nada de este módulo** (hay montos).

## 1. Niveles y permisos

`access_roles.ps_nivel` (`none` por defecto, CHECK) + la pantalla `planeacion_seguimiento` en `access_roles.screens` (o `all_screens`). Sin la pantalla marcada, el nivel cuenta como `none`. La administración general (`profiles.role = 'admin'`) entra sin rol de acceso con nivel `admin`. La capacidad del rol (`base_role`) **no abre nada** aquí.

`access_roles.screens` es `text[]` libre: no hay lista en la base que extender; agregar `planeacion_seguimiento` es cosa de la interfaz (AdminShell, role-matrix, lanzador).

| Nivel | Fase 1 puede |
| --- | --- |
| `none` | Nada (las tablas devuelven 0 filas; las funciones de lectura lanzan «Sin permiso…»). |
| `lector`, `colaborador`, `gestor` | Leer plan, versiones, líneas, resumen, calidad, diff. |
| `aprobador` | Lo anterior + leer `ps_eventos` (bitácora). Aprobar solicitudes llega en la fase 4. |
| `admin` | Lo anterior + crear plan, cargar matriz, publicar, asignar oficina a una línea. |

`ps_puede(accion)`: `ver` (cualquier nivel ≠ none), `ver_bitacora` (aprobador, admin), `solicitar` (gestor, admin; fase 4), `aprobar` (aprobador; fase 4), `cargar`, `publicar`, `asignar_oficina`, `gestionar` (admin). Cualquier otra acción: `false`.

```ts
const { data: nivel } = await supabase.rpc("ps_nivel_actual");          // 'none' | 'lector' | ... | 'admin'
const { data: puedeCargar } = await supabase.rpc("ps_puede", { p_accion: "cargar" }); // boolean
```

## 2. Tablas (solo lectura con `.from(...)`)

Ninguna admite INSERT/UPDATE/DELETE directo (no hay política ni permiso). Lectura: `ps_puede('ver')`; `ps_eventos`: `ps_puede('ver_bitacora')`.

**`ps_planes`**: `id uuid`, `nombre text`, `anio_ini smallint`, `anio_fin smallint`, `version_vigente_id uuid null`, `creado_por uuid`, `creado_en timestamptz`.

**`ps_lineas`**: `id uuid`, `plan_id uuid`, `clave text` (la columna «no» de la matriz), `creado_en`. Identidad estable entre versiones.

**`ps_versiones`**: `id`, `plan_id`, `numero int`, `etiqueta text` ('v1.0'), `estado` ('borrador' | 'publicada'), `base_id uuid null`, `origen` ('carga_matriz' | 'solicitud' | 'restauracion'), `huella text null` (sha256, se fija al publicar), `nota text`, `creada_por`, `creada_en`, `publicada_en null`, `publicada_por null`. Un solo borrador por plan; la publicada es inmutable.

**`ps_version_lineas`** (instantánea completa; PK `version_id + linea_id`, única `version_id + clave`; **trae dinero**):

| Columna | Tipo | Nota |
| --- | --- | --- |
| `version_id`, `linea_id` | uuid | |
| `clave` | text | «no» de la matriz (se ordena por `orden`, no por texto) |
| `orden` | int | posición en la matriz cargada |
| `clasif` | text null | PLF, IFT, IFT-LOG |
| `nombre` | text | |
| `descripcion` | text null | |
| `campus_id` | uuid null | **NULL = «Todos los campus»** (igual que `unit_members.campus_id`) |
| `campus_texto` | text null | texto original de la matriz (trazabilidad) |
| `pilar` | text | |
| `monto` | numeric(18,2) null | pesos; ≥ 0; no se rellena |
| `prioridad` | text | `Crítico` \| `Alto` \| `Medio` \| `Largo plazo` |
| `resultado` | text null | `Aprobado`…; NULL = sin evaluar |
| `nota_no_eval` | text null | por qué no pasa a evaluación («no aplica todavía») |
| `fuente` | text null | |
| `criterios` | jsonb | `{alin, deficit, norm, pdi, sost}` valores 'Si'/'No'/null |
| `viabilidad` | jsonb | `{tec, fin, op, nor, est}` |
| `inicio`, `fin` | date null | `fin >= inicio` |
| `pct` | jsonb | `{"2027": 0.12, …}`; `{}` si no está diligenciado; si lo está, suma 1 ±0.02 |
| `origen` | text null | «Necesidad Transversal», «PMC» |
| `oficina_unit_id` | uuid null | → `units.id`; NULL = sin responsable asignado |
| `extra` | jsonb | lo que la matriz trae de más (clasif_campus, estado_desc, nec_cm, fila) |

**`ps_eventos`** (solo INSERT por funciones; solo lo lee aprobador/admin): `id bigint`, `tipo`, `actor_id`, `plan_id`, `version_id`, `linea_clave`, `datos jsonb`, `creado_en`. Tipos de la fase 1: `plan.creado`, `matriz.cargada`, `matriz.recargada`, `version.publicada`, `linea.oficina_asignada`.

Ejemplos:

```ts
const { data: planes } = await supabase.from("ps_planes").select("*");
const { data: lineas } = await supabase
  .from("ps_version_lineas").select("*").eq("version_id", versionId).order("orden");
// Nombre del campus: unir con campuses; campus_id null => mostrar «Todos».
const { data: conCampus } = await supabase
  .from("ps_version_lineas").select("clave, nombre, monto, campus:campuses(name)").eq("version_id", versionId);
```

## 3. Funciones (todas `supabase.rpc(nombre, {parámetros con prefijo p_})`)

Los errores de **permiso** y de **objeto inexistente** son excepciones (`error.message` en español, `error.code` 42501 / P0002). Los errores de **datos de la matriz** vuelven dentro del JSON (nunca como excepción).

### `ps_crear_plan(p_nombre text, p_anio_ini int, p_anio_fin int) → uuid`
Solo `admin`. Años 2000–2100, nombre 3–120, único sin distinguir mayúsculas.
```ts
const { data: planId, error } = await supabase.rpc("ps_crear_plan", { p_nombre: "PDIFyT 2027-2035", p_anio_ini: 2027, p_anio_fin: 2035 });
```

### `ps_cargar_matriz(p_plan uuid, p_lineas jsonb, p_nota text default '') → jsonb`
Solo `admin`. Devuelve siempre:
```json
{ "version_id": "uuid|null", "etiqueta": "v1.0|null", "recibidas": 75, "aceptadas": 75,
  "errores": [ { "fila": 3, "campo": "campus", "mensaje": "El campus «Medellín» no existe en la lista de campus del portal." } ] }
```
- Con **algún** error: no crea ni cambia nada, `aceptadas = 0`, `version_id = null`, `errores` trae hasta 500 (`fila` = posición 1-based en `p_lineas`; `null` para errores del plan/lista).
- Si el plan **ya tiene versión vigente**: no carga y devuelve un error `{fila:null, campo:"plan", mensaje:"La carga sobre un plan vigente se hace por solicitud de cambio (fase 4)."}`.
- Si hay un borrador abierto y no hay vigente: lo **reemplaza entero** (evento `matriz.recargada`).
- Sin vigente ni borrador: crea el borrador `v1.0`.

Cada elemento de `p_lineas` (acepta los alias de la matriz entre paréntesis):

| Campo | Obligatorio | Regla |
| --- | --- | --- |
| `clave` (`no`) | sí | ≤ 40, única en la carga |
| `nombre` | sí | ≤ 300 |
| `pilar` | sí | ≤ 150 |
| `campus` | sí | resoluble (ver §5); «Todos» → NULL |
| `prioridad` (`prior`) | sí | Crítico, Alto, Medio, Largo plazo (sin distinguir mayúsculas ni tildes; «Largo Plazo» se normaliza) |
| `monto` | no | número ≥ 0 (número JSON o texto numérico sin símbolos) |
| `clasif`, `descripcion` (`desc`), `fuente`, `origen`, `resultado` (`res`), `nota_no_eval` (`noEvalTexto`) | no | topes 30 / 4000 / 200 / 200 / 60 / 1000 |
| `criterios` (`crit`), `viabilidad` (`viab`) | no | objeto con valores texto corto o null (≤ 20 claves) |
| `inicio`, `fin` | no | `AAAA-MM-DD`; `fin >= inicio`; 2000–2100 |
| `pct` | no | `{"AAAA": 0..1}` con años dentro del plan; suma 1 ±0.02 o vacío/todo cero |
| `oficina_unit_id` | no | uuid de una unidad existente |
| `extra` | no | objeto ≤ 2000 caracteres |

```ts
const { data } = await supabase.rpc("ps_cargar_matriz", { p_plan: planId, p_lineas: filas, p_nota: "Carga inicial" });
if (data.errores.length) mostrarErrores(data.errores); else versionId = data.version_id;
```

### `ps_publicar_version(p_version uuid, p_nota text default '') → jsonb`
Solo `admin`. Borrador con ≥ 1 línea → publicada, inmutable, vigente del plan. Devuelve `{version_id, etiqueta, huella, lineas, publicada_en}`. Excepción si ya está publicada.

### `ps_asignar_oficina_linea(p_version uuid, p_clave text, p_unit uuid) → jsonb`
Solo `admin`, solo en borrador. `p_unit = null` quita la oficina. Devuelve `{version_id, clave, oficina_unit_id}`.

### `ps_diff(p_a uuid, p_b uuid) → jsonb`
Cualquier nivel ≠ none; versiones del mismo plan. «Añadidas» = están en b y no en a.
```json
{ "a": {"id","etiqueta","estado"}, "b": {"id","etiqueta","estado"},
  "anadidas":   [ {"clave","nombre","monto"} ],
  "retiradas":  [ {"clave","nombre","monto"} ],
  "modificadas":[ {"clave","nombre","cambios": { "monto": {"antes": 100, "despues": 150} } } ],
  "totales": {"lineas_a","lineas_b","monto_a","monto_b","variacion_monto","anadidas","retiradas","modificadas"} }
```
Campos comparados: clasif, nombre, descripcion, campus_id, pilar, monto, prioridad, resultado, nota_no_eval, fuente, criterios, viabilidad, inicio, fin, pct, origen, oficina_unit_id (los ids van como id).

### `ps_resumen_plan(p_plan uuid, p_version uuid default null) → jsonb`
Versión por omisión: la vigente; si no hay, la última (borrador). Sin versiones: `version: null`.
```json
{ "plan": {"id","nombre","anio_ini","anio_fin"},
  "version": {"id","etiqueta","estado","publicada_en","es_vigente"},
  "totales": {"lineas","monto","evaluadas","sin_evaluar","monto_evaluado","monto_sin_evaluar",
              "con_oficina","sin_oficina","cobertura_oficina" /* 0..1 */,"monto_sin_distribuir"},
  "por_pilar":     [ {"pilar","lineas","monto"} ],
  "por_prioridad": [ {"prioridad","lineas","monto"} ],            // orden Crítico, Alto, Medio, Largo plazo
  "por_campus":    [ {"campus_id" /* null = Todos */,"campus" /* 'Todos' si null */,"lineas","monto"} ],
  "por_fuente":    [ {"fuente" /* null = sin definir */,"lineas","monto"} ],
  "por_resultado": [ {"resultado" /* null = sin evaluar */,"lineas","monto"} ],
  "por_clasif":    [ {"clasif","lineas","monto"} ],
  "por_anio":      [ {"anio","monto"} ] }                          // monto × pct del año; todos los años del plan
```
`monto_sin_distribuir` es el monto de las líneas sin `pct`: no entra en `por_anio` (no se inventa una distribución).

### `ps_calidad_matriz(p_version uuid) → jsonb`
```json
{ "version": {"id","etiqueta","estado"},
  "resumen": {"lineas","lineas_con_hallazgos","hallazgos",
              "por_categoria": {"pendiente","no_aplica","inconsistente"},
              "por_campo": {"fuente": 12, "pct": 12, "oficina_unit_id": 75} },
  "hallazgos": [ {"clave","nombre","campo","categoria","detalle"} ] }
```
Categorías: `pendiente` (falta diligenciarlo), `no_aplica` (línea sin evaluar cuya nota de la matriz dice que aún no corresponde), `inconsistente` (hay dato y se contradice: pct ≠ 1, fin < inicio, fechas fuera del plan, monto 0 en línea evaluada, criterios sin resultado). Campos posibles: resultado, monto, fuente, criterios, viabilidad, inicio, fin, pct, oficina_unit_id.

## 4. Reglas que cumple la base (no la pantalla)

- Versión publicada y sus filas: UPDATE/DELETE/INSERT rechazados (42501).
- Un solo borrador por plan (índice único parcial).
- `ps_eventos` solo admite INSERT.
- Montos y fechas nunca se inventan ni se rellenan; lo vacío queda NULL / `{}`.

## 5. Resolver campus

El texto de la matriz se resuelve en la base contra `campuses` por **nombre, slug o código**, sin tildes ni mayúsculas (`Cúcuta` → `cucuta`). `Todos` / `Todas` / `Todos los campus` → `campus_id = NULL`. Si no resuelve: error por fila `{campo: "campus"}`. En pantalla: `campus_id` null → «Todos»; si no, nombre desde `campuses` (la política de `campuses` deja leer a toda persona de intranet).

## 6. Qué queda para las fases 2–5

Fase 2: oficinas/personas (`units` y `unit_members` ya existen; no hay `ps_oficinas`), `ps_actividades`, asignaciones. Fase 3: avances, evidencias, riesgos, comentarios. Fase 4: solicitudes de cambio, borrador sobre vigente (hoy `ps_cargar_matriz` lo rechaza), restaurar, aprobación (`aprobar`, `solicitar` ya existen en `ps_puede`). Fase 5: cortes, avisos por correo, conjunto del Warehouse, Pilo.

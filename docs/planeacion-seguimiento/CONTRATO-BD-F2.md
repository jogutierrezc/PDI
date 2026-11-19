# Planeación y Seguimiento · contrato de la base (Fase 2: actividades, asignación y avisos)

Migración: `supabase/migrations/0287_planeacion_seguimiento_actividades.sql` (requiere la 0286). Script de aplicación: `supabase/actualizar-planeacion-seguimiento-f2.sh` (lo corre el usuario). Función de borde: `supabase/functions/planeacion-seguimiento/` (README con el cron). Acción nueva `ps` en `supabase/functions/correos/index.ts`.

Todo se llama desde supabase-js con la sesión de la persona (rol `authenticated`): `supabase.rpc(nombre, {parámetros con prefijo p_})`. **`anon` no puede leer ni ejecutar nada de este módulo.** Las tablas solo se leen (`.from(...)`); toda escritura es por función.

Errores: de **permiso** (`error.code` 42501, mensaje «Sin permiso: …»), de **objeto inexistente o fuera de su alcance** (P0002, «La actividad no existe.»: es el mismo mensaje si no existe o si la persona no la ve, para no filtrar nada), de **datos** (22023). Los errores de la carga masiva vuelven dentro del JSON. La **confirmación de campus** no es un error: vuelve como `{ok:false, requiere_confirmacion:true, conflictos_campus:[…]}` sin haber cambiado nada.

## 1. Modelo de usuarios que respeta (no hay organigrama paralelo)

- **Oficina = unidad** (`units`, cualquier `kind`). No hay tabla `ps_oficinas`: una unidad «participa» del plan si es `oficina_unit_id` de una línea de la versión vigente (`ps_version_lineas`, la 0286) o tiene actividades. El responsable de una línea sigue siendo `ps_version_lineas.oficina_unit_id`.
- **Papel en la oficina = `unit_role`**, con la herencia por cercanía de `unit_role_at` (manda la pertenencia más cercana del árbol; a igual distancia, la más fuerte): `jefe` = **gestor**, `editor` = **colaborador**, `visor` = **lector**. `ps_pertenencia(perfil, unidad)` calcula lo mismo para *cualquier* perfil (no solo `auth.uid()`).
- **Poder efectivo** (`ps_poder(unidad)`) = **mínimo** entre lo que da el `ps_nivel` del rol de acceso (tope: `gestor`→gestor, `colaborador`→colaborador, `lector`/`aprobador`→lector) y lo que da el `unit_role` en esa oficina. `admin` del módulo y administración general (`profiles.role='admin'`) operan todo. **Lector y aprobador ven todas las oficinas en modo lectura**; gestor y colaborador solo ven oficinas donde tienen pertenencia (propia o heredada). Sin `ps_nivel` (o sin la pantalla `planeacion_seguimiento`), no ven nada aunque sean miembros.
- **«De la oficina» (asignable)** = pertenencia propia o **heredada de una unidad ancestro** (la herencia baja por el árbol) con papel `editor` o `jefe`, perfil activo y nivel de módulo `colaborador` o superior (`ps_asignable`). El `visor` no es asignable. Decisión: un jefe de una vicerrectoría es asignable en todas las oficinas que cuelgan de ella (es lo que dice `unit_role_at`).
- **Campus** (decisión): `unit_members.campus_id` NULL = todos. Si el miembro tiene campus y la actividad tiene otro **distinto**, la base **no asigna** salvo que quien asigna **confirme** (parámetro `p_confirmar_campus`); sin confirmar devuelve los conflictos; confirmado, asigna y el evento guarda `campus_confirmado: true`. En la carga masiva sin confirmar, cada conflicto es un error de la fila. Actividad sin campus (`campus_id` NULL) = todos los campus, sin conflicto.
- **Gestores de una oficina** (a quienes llegan los avisos «al gestor»): jefe efectivo de la oficina con `ps_nivel` `gestor` o `admin` (`ps_gestores_de`).

## 2. Matriz de permisos

`poder` en la oficina de la actividad. «Asignado» = tiene una asignación activa en esa actividad.

| Acción | admin | gestor | colaborador | lector / aprobador | otra oficina o sin nivel |
| --- | :-: | :-: | :-: | :-: | :-: |
| Ver actividades, detalle, equipo (sin correos) | Sí | Sí | Sí (su oficina) | Sí, todas, solo lectura | No |
| Ver carga del equipo, correos del equipo, bitácora de la oficina | Sí | Sí | No | Aprobador: bitácora; lector: no | No |
| Crear, editar, eliminar, cargar por Excel | Sí | Sí | No | No | No |
| Asignar, quitar, asignar en masa, transferir | Sí | Sí | No | No | No |
| Mover de estado | Cualquier estado | Cualquier estado | Solo asignado, entre por_iniciar, en_curso, en_riesgo, en_revision; no toca «hecho» | No | No |
| Checklist (agregar, marcar) | Sí | Sí | Solo asignado | No | No |
| Checklist (editar, quitar) | Sí | Sí | No | No | No |
| Comentar | Sí | Sí | Sí | Aprobador sí; lector no | No |
| Plazos de avisos (`ps_config_*`) | Sí | No | No | No | No |

Ejemplos de la regla del mínimo: nivel `gestor` pero `visor` en la oficina → lector; nivel `colaborador` pero `jefe` → colaborador; nivel `gestor` y `jefe` en la unidad madre pero `editor` en la hija → colaborador en la hija (la pertenencia más cercana manda); `jefe` de la madre → gestor en toda la rama.

Reglas que hace cumplir la base: nadie asigna fuera de su oficina (función **y** disparador `ps_asignaciones_guard`, que vale hasta para la clave de servicio); una asignación activa por persona y actividad (índice único parcial); una asignación cerrada no se reabre ni se edita; el plan, la oficina, la versión de creación y la autoría de una actividad no cambian (disparador); un comentario no se modifica; `ps_eventos` solo admite `INSERT`.

## 3. Tablas (solo lectura; RLS por `ps_poder`)

**`ps_actividades`**: `id`, `plan_id`, `linea_id uuid null` (NULL = actividad propia de la oficina; la clave sale de `ps_lineas.clave`), `oficina_unit_id`, `campus_id uuid null` (NULL = todos), `titulo` (3 a 200), `descripcion` (≤ 4000), `estado` (`por_iniciar` · `en_curso` · `en_riesgo` · `en_revision` · `hecho`), `prioridad` (`Crítico` · `Alto` · `Medio` · `Bajo`, por omisión `Medio`), `inicio date null`, `fin date null`, `es_hito` (exige `fin`), `version_creacion_id` (la versión vigente al crearla; no cambia), `creada_por`, `creada_en`, `actualizada_en`, `completada_en` (solo con `hecho`), `orden`. `fin ≥ inicio`; ambas dentro de la vigencia del plan (1 ene `anio_ini` a 31 dic `anio_fin`).
**`ps_checklist`**: `id`, `actividad_id`, `orden`, `texto` (1 a 200), `hecho`, `hecho_por`, `hecho_en`, `creado_en` (máx. 50 por actividad).
**`ps_asignaciones`** (historial): `id`, `actividad_id`, `profile_id`, `asignado_por`, `asignado_en`, `nota`, `quitado_en`, `quitado_por`, `motivo`. Activa = `quitado_en is null`.
**`ps_comentarios`**: `id`, `actividad_id`, `autor_id`, `tipo` (`comentario` · `transferencia` · `devolucion` · `asignacion` · `cambio_estado`), `texto` (1 a 2000), `creado_en`.
**`ps_eventos`** (de la 0286) gana `actividad_id` y `oficina_unit_id`. Tipos nuevos: `actividad.creada`, `actividad.editada` (`datos.cambios` = `{campo:{antes,despues}}`), `actividad.eliminada` (`datos.copia`), `actividad.movida` (`de`, `a`, `nota`, `devuelta`), `actividad.asignada`, `actividad.desasignada`, `actividad.transferida`, `actividades.cargadas`, `checklist.agregado|marcado|editado|quitado`, `comentario.creado`, `config.avisos`.
**`ps_avisos`** y **`ps_config`**: solo el administrador del módulo las lee con `.from`; la cola la escribe la base y la vacía el servicio (§7).

## 4. Funciones de lectura

### `ps_poder(p_unit uuid) → text`
`'admin' | 'gestor' | 'colaborador' | 'lector' | null`. Es el poder de quien pregunta; sirve para habilitar botones.

### `ps_oficinas_visibles(p_todas boolean default false) → jsonb[]`
Oficinas del plan a su alcance (lector, aprobador, admin: las que participan; gestor y colaborador: las que participan o donde tienen pertenencia directa). `p_todas` (solo admin) lista todas las unidades.
```json
[ { "unit_id", "codigo", "nombre", "kind", "parent_id", "poder": "gestor", "unit_role": "jefe|editor|visor|null",
    "lineas": 12, "activas": 7, "total": 9, "vencidas": 1 } ]
```
Error 42501 si no tiene nivel de módulo.

### `ps_equipo_oficina(p_unit uuid) → jsonb[]`
Miembros (propios o heredados) de la oficina. **El correo y el nivel solo los ve gestor y admin** (`null` para los demás).
```json
[ { "perfil_id", "nombre": "Carlos Uno"  /* 'Sin nombre' si el perfil no lo tiene */, "correo": "…|null", "unit_role", "papel": "gestor|colaborador|lector",
    "campus_id": null, "campus": "Cúcuta|null", "nivel_modulo": "colaborador|null", "asignable": true, "activas": 3 } ]
```

### `ps_carga_equipo(p_unit uuid) → jsonb` (gestor, admin)
```json
{ "oficina_unit_id", "sin_asignar": 4,
  "equipo": [ { "perfil_id", "nombre", "papel", "campus_id", "asignable", "activas", "por_iniciar", "en_curso", "en_riesgo", "en_revision", "vencidas" } ] }
```
Ordenado por `activas` descendente.

### `ps_mis_actividades(p_incluir_hechas boolean default false) → jsonb`
`{ "hoy": "2027-06-30", "actividades": [ActividadJSON] }` (las asignadas a quien pregunta, por `fin`).

### `ps_actividades_oficina(p_unit uuid, p_filtros jsonb default '{}') → jsonb`
Filtros opcionales: `estado` (texto o lista), `prioridad` (texto o lista), `perfil` (uuid del responsable), `sin_asignar` (bool), `linea_clave`, `campus_id`, `vencidas` (bool), `fin_desde`, `fin_hasta` (`AAAA-MM-DD`), `q` (texto en el título), `incluir_subunidades` (bool), `limite` (1 a 1000; por omisión 500). Valor inválido → 22023.
```json
{ "oficina": {"unit_id","nombre","codigo","poder"}, "total": 31 /* antes del límite */, "actividades": [ActividadJSON] }
```

### `ps_actividad_detalle(p_id uuid) → jsonb`
```json
{ "actividad": ActividadJSON, "poder": "colaborador",
  "checklist":    [ {"id","orden","texto","hecho","hecho_en"} ],
  "asignaciones": [ {"id","perfil_id","nombre","asignado_por","asignado_en","nota","quitado_en","motivo","activa"} ],
  "comentarios":  [ {"id","autor_id","autor","tipo","texto","creado_en"} ] }
```

### `ps_bitacora_oficina(p_unit uuid, p_limite integer default 200) → jsonb[]` (gestor, aprobador, admin)
`[ {id, tipo, actor_id, actor, actividad_id, linea_clave, datos, creado_en} ]`, más reciente primero (máx. 1000).

### ActividadJSON (lo que devuelven casi todas)
```json
{ "id", "plan_id", "linea_clave": "1|null", "linea_nombre": "…|null", "oficina_unit_id", "oficina", "oficina_codigo",
  "campus_id": null, "campus": "Cúcuta|null", "titulo", "descripcion", "estado", "prioridad", "inicio", "fin", "es_hito",
  "version_creacion_id", "creada_por", "creada_en", "completada_en", "orden",
  "responsables": [ {"id","nombre","desde"} ], "checklist": {"total": 3, "hechos": 1},
  "vencida": false, "dias_para_vencer": 12 /* null sin fin; negativo = vencida */ }
```
Sin correos. «Hoy» es la fecha de Bogotá (`ps_hoy()`).

## 5. Funciones de escritura

### `ps_actividad_crear(p_plan uuid, p_unit uuid, p_datos jsonb, p_confirmar_campus boolean default false) → jsonb`
Gestor de la oficina o admin. El plan debe tener versión vigente. `p_datos`: `titulo` (obligatorio), `descripcion`, `linea_clave` (la línea debe existir en la versión vigente y ser **de la misma oficina**; solo admin puede usar una línea de otra oficina o sin oficina), `campus_id` o `campus` (nombre, misma normalización que `ps_cargar_matriz`; vacío = todos), `prioridad`, `inicio`, `fin` (`AAAA-MM-DD`), `es_hito`, `responsables` (lista de ids de perfil o correos; deben ser de la oficina). Estado inicial `por_iniciar`. Con responsables: asignación + aviso `c-ps-asignacion` a cada uno.
Devuelve `{ "ok": true, "conflictos_campus": [], "actividad": ActividadJSON }` o `{ "ok": false, "requiere_confirmacion": true, "conflictos_campus": [ {perfil_id, nombre, campus_miembro_id, campus_miembro, campus_actividad_id, campus_actividad} ] }`.

### `ps_actividad_editar(p_id uuid, p_cambios jsonb) → ActividadJSON`
Gestor o admin. Claves permitidas: `titulo`, `descripcion`, `linea_clave`, `campus_id` | `campus`, `prioridad`, `inicio`, `fin`, `es_hito` (otra clave → 22023). Mismas validaciones que al crear; una línea que ya tenía no se vuelve a exigir en la versión vigente. Evento con el diff.

### `ps_actividad_eliminar(p_id uuid, p_motivo text default '') → {ok, id}`
Gestor o admin, **solo mientras no tenga avances** (gancho `ps_actividad_tiene_avances`: hoy siempre falso; cuando exista la tabla `ps_avances` de la fase 3 con una columna `actividad_id`, lo detecta solo, sin tocar esta función). Error 23503 si los tiene. Deja `actividad.eliminada` con una copia.

### `ps_actividad_mover(p_id uuid, p_estado text, p_nota text default '') → {ok, cambio, actividad}`
Reglas en la matriz. **Devolver** de `en_revision` a `por_iniciar | en_curso | en_riesgo` (gestor o admin) exige `p_nota` ≥ 20 caracteres; la nota queda como comentario `devolucion` y se avisa (`c-ps-devuelto`) a quienes tienen la actividad. Pasar a `hecho` fija `completada_en` y avisa (`c-ps-cumplida`) a los gestores y a los responsables, salvo a quien lo hizo. Mover al mismo estado: `cambio:false`. *TODO fase 3:* nadie pasa a `hecho` una actividad cuyo avance reportó él mismo (vive con `ps_avances`).

### `ps_actividad_asignar(p_id uuid, p_perfiles uuid[], p_nota text default '', p_confirmar_campus boolean default false) → jsonb`
Gestor o admin. **Suma** a las personas que ya tiene (1 a 20). Todas deben ser asignables. Devuelve `{ok:true, asignados:[uuid], ya_asignados:[uuid], conflictos_campus:[], actividad}` o la confirmación de campus. Aviso `c-ps-asignacion` a cada nueva. No asigna actividades en `hecho`.

### `ps_actividad_desasignar(p_id uuid, p_perfil uuid, p_motivo text) → {ok, actividad}`
Gestor o admin. Motivo de 20 a 1000 caracteres. Cierra la asignación (no se borra).

### `ps_actividades_asignar(p_ids uuid[], p_perfil uuid, p_confirmar_campus boolean default false) → jsonb`
Asignación masiva (1 a 100 actividades, **todo o nada**): una persona a varias. Debe ser gestor/admin de la oficina de cada una y la persona de cada oficina. `{ok:true, asignadas, ya_asignadas, conflictos_campus}` o `{ok:false, requiere_confirmacion:true, conflictos_campus:[{…, actividad_id}]}`.

### `ps_actividad_transferir(p_id uuid, p_de uuid, p_a uuid, p_motivo text, p_confirmar_campus boolean default false) → jsonb`
Solo gestor de la oficina o admin. Motivo de 20 a 1000 caracteres (se recorta con `btrim`). `p_de` debe tener la actividad asignada, `p_a` no, y ser de la oficina. Cierra la asignación de `p_de` (historial con el motivo), abre la de `p_a`, deja un comentario `transferencia`, el evento y **tres avisos** `c-ps-transferencia` (con `datos.rol` = `recibe` · `cede` · `gestor`; el gestor, por cada gestor de la oficina distinto de los dos). Devuelve `{ok, conflictos_campus, actividad}` o la confirmación de campus.

### Checklist y comentarios
- `ps_checklist_agregar(p_actividad uuid, p_texto text) → {id, orden, texto, hecho}` (gestor, admin o colaborador asignado)
- `ps_checklist_marcar(p_item uuid, p_hecho boolean) → {id, hecho}` (igual)
- `ps_checklist_editar(p_item uuid, p_texto text) → {id, texto}` y `ps_checklist_quitar(p_item uuid) → {ok, id}` (gestor, admin)
- `ps_comentar(p_actividad uuid, p_texto text) → {id, texto}` (admin, gestor, colaborador de la oficina y aprobador)

### `ps_actividades_cargar(p_unit uuid, p_filas jsonb, p_plan uuid default null, p_confirmar_campus boolean default false) → jsonb`
Carga masiva por Excel de **una oficina** (gestor o admin). **Todo o nada**: con un solo error no se crea nada. `p_plan` null = el único plan con versión vigente (si hay varios, error). Hasta 500 filas. Columnas (con alias, texto o número): `titulo` (`actividad`), `descripcion` (`desc`), `linea` (`linea_clave`, `proyecto`: la clave de la línea), `campus` (nombre), `prioridad` (`prior`), `inicio`, `fin` (`AAAA-MM-DD`), `hito` (`es_hito`: Sí/No), `responsable` (`responsables`, `correo`: uno o varios correos separados por `;` o `,`; cada uno debe ser de la oficina). Rechaza filas repetidas en la hoja (mismo título, línea y fin) y las que ya existen en la oficina.
```json
{ "creadas": 2, "recibidas": 2, "ids": ["uuid"], "errores": [ { "fila": 3, "campo": "linea", "mensaje": "La línea «3» es de otra oficina (o no tiene oficina asignada)." } ] }
```
`fila` es la posición 1-based en `p_filas` (`null` para errores generales: plan, lista vacía, más de 500 filas). Campos: `titulo`, `descripcion`, `prioridad`, `inicio`, `fin`, `es_hito`, `linea`, `campus`, `responsable`, `fila`, `plan`, `filas`. Con error: `creadas = 0` y no se encola ningún aviso ni evento. Con éxito: un evento `actividad.creada` por fila, un `actividades.cargadas` y un `c-ps-asignacion` por responsable.

### Plazos de los avisos (administrador del módulo)
- `ps_config_leer() → {dias_antes:int[], vencida_max_avisos, vencida_gestor_horas, activo, actualizado_en}`
- `ps_config_guardar(p_dias_antes int[], p_vencida_max_avisos int, p_vencida_gestor_horas int, p_activo boolean default true) → igual que leer` (hasta 6 días entre 0 y 60; máx. 0 a 10 avisos; 0 a 720 horas)

## 6. Notificaciones: plantillas, disparadores y vencimientos

Plantillas editables en la pantalla **Correos** (`correo_templates`, grupo «Planeación y Seguimiento», `action='ps'`, tipo `aviso`, identidad `plan`; se insertan con `on conflict do nothing`: no pisan lo editado). Variables que usan (todas ya conocidas por el editor de plantillas): `{{nombre}}`, `{{titulo_aviso}}`, `{{detalle}}`, `{{oficina}}`; la función `correos` también entrega `{{fecha_limite}}`, `{{dias}}`, `{{comentario}}` y `{{autor}}` para quien las quiera usar. `titulo_aviso` y `detalle` los redacta `planeacion-seguimiento` (`avisos.ts`) con los datos de la actividad.

| Clave | Grupo del usuario | A quién | Cuándo |
| --- | --- | --- | --- |
| `c-ps-asignacion` | (1) asignación | la persona asignada | al crear con responsable, asignar, asignar en masa, cargar por Excel |
| `c-ps-transferencia` | (4) transferencia | quien recibe, quien cede y los gestores | al transferir (3 avisos) |
| `c-ps-cumplida` | (2) cumplimiento | gestores y responsables (menos quien lo hizo) | al pasar a `hecho` |
| `c-ps-devuelto` | (2) | responsables | al devolver de `en_revision` con nota |
| `c-ps-por-vencer` | (3) próxima a vencer | responsables (si no hay, los gestores) | a 7 y 3 días de `fin` y el día de la fecha |
| `c-ps-vencida` | (3) finalización de fecha | responsables (si no hay, los gestores); copia al gestor | pasada `fin` |
| `c-ps-avance` | (2) avance | gestor | **fase 3** (la plantilla ya existe; nadie la dispara aún) |
| `c-ps-validado` | (2) | quien reportó | **fase 3** (ídem) |

Los avisos inmediatos se encolan **dentro de la misma transacción** que la acción (`ps_aviso`): si la acción falla, no queda aviso. `ps_avisos`: `id`, `plantilla`, `destinatario_id`, `actividad_id`, `oficina_unit_id`, `objeto_tipo`, `datos jsonb`, `estado` (`pendiente|enviado|error|omitido`), `intentos`, `error`, `dedupe` (único), `creado_en`, `enviado_en`. `datos` lleva `actividad`, `oficina`, `linea`, `campus`, `fin` (dd/mm/aaaa), `fin_iso`, `estado`, `estado_texto`, `prioridad`, `actor` más lo propio de cada plantilla (`nota`, `de`, `a`, `rol`, `dias`, `responsables`).

### Vencimientos: `ps_generar_avisos_vencimiento(p_hoy date default null) → {hoy, activo, por_vencer, vencidas, gestor}`
Solo `service_role` (la llama la función de borde o `pg_cron`). **Idempotente**: correrla dos veces el mismo día no duplica (`dedupe` único). `p_hoy` solo sirve para pruebas; por omisión, hoy en Bogotá.

Constantes en `ps_config` (**valores por defecto que el usuario aún debe confirmar**; se editan con `ps_config_guardar`):

| Constante | Por defecto | Efecto |
| --- | --- | --- |
| `dias_antes` | `{7,3,0}` | `c-ps-por-vencer` cuando faltan 7 días, 3 días y el mismo día de `fin` |
| `vencida_max_avisos` | `3` | aviso diario de `c-ps-vencida` a cada responsable hasta 3 veces por actividad y fecha de fin |
| `vencida_gestor_horas` | `24` | el gestor recibe una vez `c-ps-vencida` (`datos.rol='gestor'`) cuando pasan 24 h desde el primer día vencida (es decir, al segundo día después de `fin`) |
| `activo` | `true` | interruptor general de los vencimientos |

Solo cuentan actividades con `fin`, no `hecho`. Si no hay responsable, los gestores son los destinatarios principales. Si se cambia `fin`, los avisos vuelven a aplicar con la nueva fecha (la clave `dedupe` incluye `fin`).

## 7. Entrega por correo y cómo conectar el cron

1. **`correos`, acción `ps`** (solo con la clave de servicio; mismo estilo que `gm`): `{action:"ps", to, nombre, clave:"c-ps-…", valores:{titulo_aviso, detalle, oficina, fecha_limite, dias, comentario, autor}, enlace, sitio}`. Aplica el interruptor general, los dominios permitidos, el tope por hora y escribe `correo_log` con el destinatario enmascarado (`accion: "ps"`). Si la plantilla no está en la base usa un texto de respaldo. Quita `{{ }}` de lo que venga de personas.
2. **`planeacion-seguimiento`** (función de borde nueva, `--no-verify-jwt`):
   - `{action:"avisos"}`: vacía la cola (hasta 5 lotes de 20; reserva cada aviso con compare-and-swap; hasta **3 intentos**, luego `error`; sin correo o cuenta inactiva → `omitido`). Quién: sesión con `ps_puede('ver')`, cabecera `x-ps-cron` o clave de servicio. Devuelve `{ok, enviados, errores, omitidos, pendientes}`. **La interfaz debe llamarla justo después de asignar, transferir, devolver o cerrar** (como hace Gestión Master) para que el correo salga sin esperar al cron.
   - `{action:"vencimientos"}`: solo `x-ps-cron` (variable `PS_AVISOS_CRON`) o clave de servicio; genera los vencimientos y vacía la cola.
3. **Cron** (dos opciones, con ejemplos sin secretos en `supabase/functions/planeacion-seguimiento/README.md`): (A) `pg_cron` + `pg_net` con `net.http_post` a `https://<dominio>/functions/v1/planeacion-seguimiento` y la cabecera `x-ps-cron`; (B) tarea programada de Coolify con `curl`. Diario para `vencimientos` (p. ej. 12:00 UTC = 7:00 Bogotá) y, opcional, cada 10 minutos para `avisos` (reintentos). El secreto se crea a mano en la función y no se escribe en el repositorio.
4. El enlace del botón: `PS_RUTA_ENLACE` (por omisión `/admin/planeacion-seguimiento/mis-tareas`) + `/<id de la actividad>`. **La interfaz debe ofrecer esa ruta** o el valor se ajusta con la variable.

## 8. Qué NO hace esta fase

Avances, evidencias, riesgos (fase 3); solicitudes de cambio y versiones nuevas del plan (fase 4); cortes y Warehouse (fase 5). Las actividades se conservan con `version_creacion_id` aunque llegue otra versión, pero la fase 4 debe decidir qué pasa con una actividad cuya línea desaparece de la nueva versión vigente (hoy: sigue existiendo y se puede editar sin cambiar su línea).

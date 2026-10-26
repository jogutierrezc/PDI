# Gestión Master

Carpeta «Gestión Master» del lanzador, con la opción «Gestión de Actividades». Las solicitudes de actividades del Master (nuevas, para mejorar o mantener, y para eliminar) con su flujo de aprobación. Recrea el segmento de Actividades de Rua, que se apaga. Ruta: `/admin/gestion-master/:seccion?/:id?` (periodo y sede en `?periodo=2026b&sede=buc`). La propuesta aprobada está en `docs/gestion-master/propuesta-actividades-de-apoyo.html`.

## Qué hace y qué no
- **Lee** del Warehouse lo que ya se captura del Master: el catálogo (`ms_actdir`, «Actividades directas y de apoyo») y la nómina (`ms_nom`, «Nómina docente con estado»). `ms_doc` («Docentes») solo se usa en vivo para los nombres.
- **Escribe** en el portal: solicitudes, decisiones, comentarios y avisos (`gm_*`), y, al cerrar el corte, el conjunto `gm_solicitudes` en el Warehouse.
- **No escribe en el Master.** Un cambio aprobado queda como tarea: Planeación lo aplica a mano y lo marca. Cuando una captura nueva de `ms_actdir` ya trae el cambio, la solicitud pasa de «aprobada» a «reflejada» (botón Conciliar).

## Quién solicita y quién aprueba
Solicita el directivo o el vicerrector (nivel `solicitante`), con cualquiera de los cuatro tipos. Flujo por defecto: **Vicerrectoría Administrativa y Financiera** aprueba primero y **Planeación** revisa, aprueba y aplica en el Master. El flujo es configurable (sección Flujos): se puede añadir la Vicerrectoría Académica sin tocar código, con una función nueva o la que ya viene sembrada (`academica`). Plazos: no hay definidos; se usa el indicador de Rua, 15 días hábiles desde el envío, que avisa y no corta nada.

Estados: borrador, pendiente, en revisión, **devuelta** (con nota; el solicitante corrige y reenvía y el flujo empieza otra vez), aprobada (con su aplicación: sin aplicar, aplicada, reflejada), rechazada, cancelada. Toda decisión lleva una nota de al menos 20 caracteres, también aprobar (regla de Rua). Se puede aprobar o devolver por lote (hasta 50, con una nota común); rechazar es de a una. Nadie decide sobre su propia solicitud.

## Los cuatro tipos de solicitud
- **Nuevo**: una actividad que no existe. Mientras se escribe el nombre, el portal busca si ya hay algo parecido en el catálogo.
- **Editar** (0197): cambiar datos de un código que **ya existe**. Se elige el código y se marca **qué cambia**: el código (se escribe el código nuevo), el nombre, el tipo de actividad (directa o de apoyo), el tipo de vinculación o las instrucciones. Cada dato muestra «hoy → propuesto»; solo se envía lo marcado; si nada cambia, no se puede enviar. Cada actividad lleva un motivo corto (10 a 300 caracteres) además de la justificación general. Un código nuevo debe cumplir el formato de códigos (mayúsculas, números, punto, guion y guion bajo, hasta 32), no existir ya en esa sede y periodo, ni repetirse en la misma solicitud; el formulario avisa cuántos profesores lo tienen hoy.
- **Mejorar o mantener**: parte de un código (de este periodo o de uno anterior) y lo amplía **como actividad**. Es distinto de Editar, que cambia el mismo código.
- **Eliminar**: dar de baja un código, con a cuántos profesores afecta.

Las diferencias entre lo vigente y lo pedido las calcula la base al guardar (`gm_solicitud_lineas.cambios`, por campo `{antes, despues}`), contra la ficha del catálogo que leyó del Warehouse; el navegador no decide qué cambia. El flujo es el mismo para los cuatro tipos.

## Formulario de creación (viene de Rua, rediseñado)
`Formulario.tsx` conserva la lógica del de Rua y la lleva a **cuatro pasos, uno a la vez**: 1 Qué quiere hacer (cuatro opciones con un ejemplo cada una, y dónde aplica: periodo y sede ya puestos, unidad y prioridad plegadas), 2 Actividades (una tarjeta plegable por actividad, con un renglón de resumen cuando está cerrada; «Agregar otra actividad» siempre a la vista; duplicar en Nuevo), 3 Justificación (contador, medidor, guía y ejemplo) y 4 Revisar y enviar (resumen legible, el diff de Editar, qué pasa después, plazo y correo de acuse).

De Rua se conserva: varias actividades en un expediente que se deciden juntas, precarga con lo que hay hoy, justificación de 150 a 2000 caracteres, folio (`GM-AAAA-NNNN`, antes `REQ-AAAA-NNNN`), prioridad, borrador, y que una enviada ya no se edita (una devuelta sí). El código se valida como en Rua y, desde 0197, el formato estricto se exige solo a los códigos que se crean (los del catálogo pueden traer otro formato).

- **Errores**: en línea solo en lo ya tocado; al intentar continuar o enviar sale un resumen arriba que enlaza a cada campo (cambia de paso, abre la tarjeta y da el foco).
- **Borrador**: se guarda solo **en este equipo** mientras se escribe («Guardado hace un momento»); al volver ofrece continuar o descartar. «Guardar borrador» lo guarda además en el portal, con folio. El borrador del portal exige que cada actividad cumpla las reglas de la base; el local no.
- **Topes de largo**: nombre 300, vinculación 1000, instrucciones 5000, motivo 300, justificación 2000. Cada campo muestra su contador. Al precargar desde el catálogo, un texto más largo que el tope se recorta con un aviso («se recortó para caber»). La base (0197) valida cada tope en la función con un mensaje que dice qué campo se pasó, y `mensajeDe()` traduce cualquier regla de la base a palabras: nunca se muestra el error crudo.
- **Panel «Qué hay hoy con este código»**: va aparte de los campos (columna lateral a partir de 1100 px; debajo y plegado en pantallas angostas). Muestra el catálogo (`ms_actdir`), cuántos profesores lo tienen, horas asignadas por semana, promedio por profesor y el programa de cada uno, con fuente y corte; los nombres, en vivo (ver abajo).
- **Movimiento**: el paso llega por el lado al que se avanza (14 px, 200 ms), los campos de cada tipo aparecen con la entrada escalonada, las tarjetas y las búsquedas entran en 6 filas, y la confirmación de envío aparece con el folio. Con «reducir movimiento» queda un fundido. Nada decorativo.
- **Accesibilidad**: teclado completo, foco visible, etiqueta visible en cada campo con su ayuda debajo, el paso y los errores se anuncian en una región `aria-live`, y funciona a 360 px.

Las horas por docente no existen en ningún reporte del Master y no son un requisito. «Horas asignadas» es la suma semanal de `horas_semanales` de la nómina para ese código; «promedio» es esa suma entre el número de profesores distintos.

## Nombres de los docentes (decisión 11)
El Warehouse no guarda nombres: su política los descarta y la cédula queda como seudónimo. Eso **no se relaja**. Se eligió lo más seguro de las tres opciones:

1. **Lectura en vivo, sin guardar** (lo que se construyó). El botón «Ver los nombres de los profesores» llama a la función `warehouse`, acción `docentes`. La función inicia sesión en el Master de esa sede, lee `ms_doc` en ese momento, calcula el seudónimo de cada identificación con la misma sal y fórmula del Warehouse (`gm_seudonimos_de`, solo con el rol de servicio) y devuelve los nombres de los seudónimos pedidos. Los nombres no se escriben en `wh_filas`, ni en una tabla, ni en la caché del servidor; viven en la pantalla hasta que se cierra.
2. **Quién puede**: solo con acceso al módulo (`gm_puede('nombres')`, nivel del rol, no capacidad). La función lo comprueba con la sesión de quien llama antes de leer nada.
3. **Registro**: cada consulta queda en `gm_consultas_nombres` (quién, código, sede, periodo, cuántos). Planeación la ve en Conexión › «Quién vio los nombres».

**Riesgos.** (a) Los campos de nombre del JSON `prepare_professors` no se conocen: no hay un HAR de ellos y no se abrió ninguno. `nombreDe()` junta los campos de texto cuya clave parece nombre o apellido; si el reporte los llama de otra forma, la pantalla dirá «nombre no disponible» y hay que ajustar esa función. (b) El catálogo `ms_doc` pesa unos 19 MB: leerlo entero cabe en los 150 MB de la función, pero tarda; si una sede lo tarda más de ~35 s, falla con el mensaje de «se acabó el tiempo». (c) Quien ve los nombres puede copiarlos; el registro disuade, no impide. **Alternativa** descartada: una tabla `gm_*` seudónimo→nombre con acceso restringido. Es más rápida y no depende del Master en ese instante, pero deja una lista de nombres en el portal que el Warehouse decidió no tener; solo se justificaría si la lectura en vivo resulta muy lenta.

## Histórico de Rua (decisión 12)
La respuesta del usuario fue «mostrarlo desde el módulo mejor, para no cerrarlos». Se interpretó como: lo que Rua tenía no se cierra ni se pierde; se **consulta dentro de Gestión Master**. Sección «Histórico de Rua», solo lectura, con búsqueda y el detalle de cada solicitud (concepto, actividades, firmas). Se importa una sola vez (o las veces que haga falta: el folio de Rua es la llave) desde un export de Rua: la pantalla trae la consulta SQL para correr en el editor de Rua, y acepta pegar el JSON o subir el archivo. **Hace falta que el usuario corra esa consulta en Rua y entregue el resultado**; no se tocó Rua. Si «no cerrarlos» quería decir otra cosa (por ejemplo, no cerrar la bandeja por módulos), conviene decirlo.

## Seguridad
El acceso sale solo del permiso explícito del rol: `access_roles.gm_nivel` (`none`, `solicitante`, `revisor`, `gestor`) más la pantalla `gestion_master`. La base lo hace cumplir (`gm_nivel_actual()`, `gm_puede()`); ninguna función ni política usa `has_role_at_least('planeacion')` ni la capacidad del rol. Es la lección de Informes (0192): la capacidad de un rol es el máximo de lo que piden sus módulos, y no debe abrir nada aquí. Solo la administración general entra sin rol.

- `gm_nivel` nace en `none`: ningún rol existente entra al aplicar 0194.
- Quien aprueba lo hace por la **función** de su rol (`access_roles.gm_funcion`); el paso del flujo pide una función. Un rol revisor sin función no se puede guardar (CHECK).
- Las tablas `gm_*` no tienen política de escritura: se escribe por funciones `security definer` con `search_path` fijo que comprueban permiso, turno y que nadie firme lo propio. `gm_eventos` solo admite INSERT (trigger). Todo `DELETE` y `UPDATE` lleva `WHERE`.
- Los revisores leen el Warehouse por `gm_cortes`, `gm_buscar_codigos`, `gm_ficha_codigo`, `gm_actividades_periodo` y `gm_profesores_periodo`, sin `wh_autorizado()` (no se amplía). Cerrar el corte sí lo pide, porque usa `wh_abrir_carga`, `wh_agregar_filas` y `wh_cerrar_carga`.
- Visibilidad: cada quien ve lo propio y lo de las unidades donde trabaja (`unit_members`); el revisor, además, lo que su función debe firmar y sigue viéndolo después; el gestor, todo. Un borrador solo lo ve su autor.

## Correos
Los avisos usan el módulo de correos existente. La base deja cada aviso en la cola `gm_avisos`; el navegador llama a la función `gestion-master` (`{ action: "avisos" }`) justo después de enviar o decidir, y esta le pide a la función `correos` (acción nueva `gm`, solo con la clave de servicio) que lo envíe con las plantillas **editables** `c-gm-acuse`, `c-gm-turno`, `c-gm-avance`, `c-gm-devuelta` y `c-gm-final` (pantalla Correos, grupo «Gestión Master»). Sale por el mismo servidor, con el mismo tope y dominios permitidos, y queda en `correo_log` (destinatario enmascarado); `gm_avisos.estado` guarda además el resultado (hasta 3 intentos). Los textos hablan de los cuatro tipos y, en Editar, del cambio de código («ACT-12 → ACT-45»). Eventos: nueva solicitud (acuse y aviso a quien firma), aprobación de un paso (al siguiente y a quien solicita), devolución con nota, decisión final y reflejada en el Master. Dirección de la función `correos`: `SUPABASE_URL/functions/v1/correos`, o `CORREOS_FUNCION_URL`; el gancho de cuentas va por https y no por la red interna (`docs/correos-en-coolify.md`). Si la función `gestion-master` no está desplegada, los avisos se quedan en la cola y salen cuando lo esté.

## Warehouse: el conjunto `gm_solicitudes`
Al cerrar el corte (Conexión › «Cerrar el corte»), `gm_corte_filas` entrega un renglón por evento y actividad del periodo y la sede, y el navegador los carga por el camino de siempre: abrir carga, agregar filas, cerrar. Tiene su versión y huella, y respeta periodos cerrados. La política (`wh_politicas`, 0194 y 0197) permite `folio, tipo, evento, estado, paso, codigo, codigo_nuevo, campos, actividad, unidad, solicitante, fecha`; `campos` son los nombres de los datos que cambian en una edición, sin sus valores. El solicitante entra como seudónimo; no hay nombres ni justificaciones. **No** se añadió a `conjuntos.ts`: ese catálogo representa reportes que se piden a las plataformas, y un conjunto sin reporte rompería «Traer varios» y la prueba de coherencia catálogo ↔ políticas. Se ve en el historial de cargas con su identificador. Si se quiere en el Tablero del Warehouse, hay que añadirlo allí con un origen «portal».

## Archivos
| Archivo | Qué es |
| --- | --- |
| `supabase/migrations/0194_gestion_master.sql` | columnas del rol, tablas `gm_*`, funciones, RLS, política del conjunto, plantillas de correo |
| `supabase/migrations/0196_gestion_master_largos.sql` | topes de largo de instrucciones (5000) y vinculación (1000) |
| `supabase/migrations/0197_gestion_master_editar.sql` | el tipo Editar: columnas `codigo_nuevo`, `motivo` y `cambios`, funciones de guardado, conciliación, corte y avisos |
| `supabase/functions/gestion-master/index.ts` | envía los avisos en cola (nueva) |
| `supabase/functions/correos/index.ts` | acción `gm` para los avisos (edición localizada) |
| `supabase/functions/warehouse/index.ts` | acción `docentes`: nombres en vivo (edición localizada) |
| `modelo.ts`, `api.ts`, `contexto.ts` | tipos y reglas, lectura y escritura, lo que reciben las secciones |
| `GestionMaster.tsx` | la pantalla y su ruta |
| `Bandeja.tsx`, `Detalle.tsx` | bandeja con lote y el panel de detalle con la decisión |
| `Formulario.tsx`, `TarjetaActividad.tsx`, `lineaForm.ts`, `PanelCodigo.tsx` | la solicitud en cuatro pasos, la tarjeta de cada actividad, su validación y los datos del código desde el Warehouse |
| `Estructura.tsx`, `Periodo.tsx` | catálogo y actividades del periodo |
| `Seguimiento.tsx`, `Flujos.tsx`, `Conexion.tsx`, `Rua.tsx` | seguimiento, constructor de flujos, conexión y corte, histórico |
| `movimiento.ts` | GSAP: la especificación de movimiento de la propuesta |
| `gestion-master.css` | estilos con tokens |
| `src/modules/admin/usuarios/*` | el papel y la función en la matriz de roles |

## Movimiento
GSAP (ya era dependencia). Solo `transform` y `opacity`, salvo el alto de una fila que sale de un filtro. Entrada escalonada de la bandeja (260 ms, las 12 primeras), detalle que llega por la derecha (220 ms; con teclado no se anima), panel de confirmación, sello de la decisión, línea del flujo, contadores (450 ms) y barras. Con «reducir movimiento» quedan fundidos de 120 ms o cambios instantáneos.

## Aplicar en el Master y reflejar (Editar)
El CSV «cambios por aplicar» trae, para cada cambio, la **instrucción exacta**: «Cambiar el código ACT-12 por ACT-45» o «En ACT-45, cambiar el nombre de «x» a «y»». «Conciliar» pasa una edición a «reflejada» cuando la siguiente captura de `ms_actdir` ya trae el código nuevo (y el código viejo ya no está activo) y los campos que se pidieron. Estructura y Actividades del periodo marcan «Cambio solicitado» en los códigos con una edición abierta.

## Pendiente y por probar
- Aplicar 0194, desplegar `gestion-master`, `correos` y `warehouse`, crear los roles y cargar `ms_actdir`, `ms_nom` y `ms_doc` (ver el reporte de entrega).
- Verificar con datos reales que `ms_nom.codigo` coincide con el código de `ms_actdir` (hoy se asume; si no coincide, la ficha cruza por nombre y lo dice).
- Los nombres de campo de `ms_actdir` se buscan por patrón (`gm_buscar`) porque no se vio el encabezado real; comprobar con una captura.
- Sedes distintas de Bucaramanga: sin HAR, sin verificar.
- Sin plazos por paso ni recordatorios por vencimiento: no se definieron.

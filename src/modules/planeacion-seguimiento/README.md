# Planeación y Seguimiento (Fase 1)

Módulo de la intranet: planes institucionales (hoy PDIFyT 2027-2035), sus versiones y líneas. Ruta `/admin/planeacion-seguimiento/:seccion?/:id?`; acceso por `ps_nivel` del rol de acceso y la pantalla `planeacion_seguimiento` (contrato de la base: `docs/planeacion-seguimiento/CONTRATO-BD.md`). Se habla de **campus**, nunca de sede.

## Reglas
- **Sin ventanas emergentes.** Detalles, formularios, confirmaciones importantes y asistentes son páginas con ruta propia, botón «Regresar», foco al título y retorno a la posición y los filtros previos. Confirmaciones breves, en línea dentro de la página.
- Lo vacío queda vacío: nada de montos, fechas ni porcentajes inventados. Las cifras de seguimiento (avances) no existen en esta fase.

## Archivos
- Lógica pura (sin DOM, con pruebas): `modelo.ts`, `calculos.ts`, `columnas.ts`, `plantilla.ts` (arma el libro con `informes/ui/excel.ts`), `importar.ts` (`analizarLibro` puro; `leerLibro` con exceljs).
- Datos: `api.ts` (`PsApi`, implementación Supabase e implementación en memoria con los 75 proyectos reales en `datos/`).
- Pantallas: `PlaneacionSeguimiento.tsx` (ruta y secciones), `Resumen`, `Proyectos`, `Cronograma`, `Calidad`, `Versiones` (+ publicar, comparar), `DetalleLinea`, `Roles`, `Vacio`, `CrearPlan`, `Cargar`.
- Demostración **solo en desarrollo**: `/__ps-demo/resumen?estado=ninguno|borrador|publicado&nivel=admin|lector|…` (`Demo.tsx`; la ruta solo existe con `import.meta.env.DEV`).

## Marco reutilizable (`marco/`)
### `PaginaCompleta`
Barra superior fija (Regresar + migas), título (h1, o h2 dentro de la cabecera de la intranet), acciones, contenido y pie fijo en móvil. Navegue entre pantallas del módulo con `ir(ruta)` de `usePs()` (pasa `state.desdeModulo`): así «Regresar» usa el historial y, si se llegó por enlace directo, va a `regresarA`. `useScrollPorRuta()` (ya montado en el cuerpo del módulo) guarda y restaura el desplazamiento.

### `FormularioPasos`
Asistente de pantalla completa. Uso (ver `CrearPlan.tsx`, el ejemplo corto, y `Cargar.tsx`, el largo):
```tsx
<FormularioPasos titulo migas regresarA
  paso={paso} onPaso={setPaso}               // el paso puede vivir en la dirección (?paso=)
  pasos={[{ id, titulo, descripcion, contenido, validar: () => ErrorCampo[], bloqueado, etiquetaSiguiente }]}
  etiquetaEnviar="Crear…" onEnviar={async () => …} enviando errorEnvio guardado />
```
- `validar()` devuelve `{ campo, mensaje }[]`; el `campo` es el `id` del `<Campo id>`. Con errores se muestra el **resumen** (foco ahí) con un enlace por campo que lleva el foco al control.
- `<Campo id etiqueta ayuda error obligatorio>{(props) => <input {...props} />}</Campo>` enlaza etiqueta, ayuda y error con ARIA. Muestre el error en línea al salir del campo (`onBlur`).
- `useBorradorLocal(clave, valor, setValor)` guarda lo escrito en `localStorage` (600 ms) y lo restaura al abrir; devuelve `{ guardado, descartar }` (llame a `descartar()` al enviar). El pie muestra «Guardado hace un momento en este equipo». No guarda archivos.
- El último paso es la revisión: su botón es el envío. La confirmación es la propia página, nunca un diálogo.
- Fases 2 a 4 (actividades, reporte de avance, solicitudes de cambio) reutilizan este marco.

## Pruebas
`npx vitest run src/modules/planeacion-seguimiento`: ida y vuelta plantilla ↔ importador con los 75 reales, casos de error, cálculos, capa en memoria, forma de los datos del contrato y el nivel/rol.

## Fase 2 · actividades por oficina (carpeta `actividades/`)

Oficina = unidad (`units`); papel = `unit_role` (jefe→gestor, editor→colaborador, visor→lector); poder efectivo = mínimo entre `ps_nivel` y el papel (`reglas.ts: poderEn`). Rutas dentro de `/admin/planeacion-seguimiento/`: `planificacion`, `tablero`, `lista`, `mis-tareas` (y `mis-tareas/<id>`, el enlace de los correos), `asignar`, `cronograma-act`, `actividad/<id>`, `actividad-nueva`, `actividad-editar/<id>`, `importar-actividades`, `transferir/<id>`, `devolver/<id>`, `avisos`.
Capa de datos: `contratoApi.ts` (`PsApiAct`), `memoria.ts` + `semilla.ts` (demostración, semilla fija) y `supabaseAct.ts` (contrato `CONTRATO-BD-F2.md`). Demo dev: `/__ps-demo/tablero?papel=gestor|colaborador|lector|ninguno&nivel=…`.
FASE 3 (avances en pantalla completa): los puntos están marcados con `FASE 3` en `partes.tsx` (menú «Mover a…»), `Tablero.tsx` (soltar) y `Devolver.tsx`.

## Fase 3 · avances, evidencias, riesgos, PDI y plazos por oficina (carpeta `actividades/`)

Contrato de la base: `docs/planeacion-seguimiento/CONTRATO-BD-F3.md` (§6 = lo implementado en 0288). Rutas nuevas: `reportar/<actividad>`, `revisar` (cola «Por validar»), `revisar/<avance>`, `devolver/<actividad>[?avance=]`, `cerrar/<actividad>`, `riesgo/<actividad>[?r=<riesgo>]`, `plazos-aviso/<oficina>`. Todas a pantalla completa con «Regresar».
- **Lógica pura**: `modeloF3.ts` (tipos), `reglasF3.ts` (quién reporta/valida, validación del reporte y monotonía, evidencias —tipo, 20 MB, http/https, sha256—, riesgos, lote ≤ 50, plazos de aviso, `rutaDeMovimiento`), `pdi.ts` (catálogo, búsqueda, columnas Excel `pdi`/`pilar_pdi`/`linea_pdi`).
- **Datos**: `contratoApi.ts` (métodos F3 de `PsApiAct`), `memoriaF3.ts` + `semilla.ts` (demo con avances en los tres estados, evidencias, riesgos y un catálogo PDI de ejemplo), `supabaseAv.ts` (rpc del contrato, bucket `ps-evidencias`, URL firmada). Todas las acciones que avisan llaman a `planeacion-seguimiento {action:"avisos"}`.
- **Pantallas**: `ReportarAvance` (Qué avanzó → Evidencias → Riesgos → Revisar), `Revisar` (cola con lote en línea, plazo vencido), `Devolver` (actividad o avance), `Cerrar` (cierre administrativo auditado), `PestanasDetalle` (Avances · Evidencias · Riesgos y acciones · Comentarios), `RiesgoForm`, `SelectorPdi` (paso «Plan de Desarrollo Institucional», obligatorio al crear), `EditarPlazos`, `Avisos` (plazo efectivo por oficina).
- Movimientos (`rutaDeMovimiento`): colaborador o gestor → «En revisión» abre el reporte; gestor → «Hecho» abre la revisión (si hay un avance esperando) o el cierre administrativo. `ps_actividad_mover` a «Hecho» sin avance validado falla en la base (22023): por eso la pantalla ofrece «Cerrar».
- Filtros `?pdi=` y `?pilar=` en Lista/Tablero/Cronograma; resumen de conexión con el PDI y «Por validar» en la Planificación.

## Fase 3B · varios planes (CONTRATO-BD-F3B.md, §6 = lo implementado en 0289)

- **Plan activo por persona.** `contexto.tsx` lee `ps_planes_visibles` (`usePlanes`), elige el plan (el de la persona, el que guardó la base o el más reciente activo), lo fija en la API (`api.fijarPlan`: todas las llamadas llevan `p_plan`) y en las claves de caché (`fijarClaveDePlan`; las claves de `psKeys`/`actKeys` llevan el plan al final). Cambiar de plan: `elegirPlan` (guarda en `localStorage` y en `ps_plan_activo_guardar`). `SelectorPlan.tsx` es la barra: menú de plan con oficina y estado, «Todos los planes», «Editar el plan», «Crear un plan» y el enlace deshabilitado «Financiación y presupuesto · próximamente».
- **Crear y editar plan** (`CrearPlan.tsx`, ruta `crear` y `plan-editar/<plan>`): Datos → Oficina dueña y alcance (obligatoria; el gestor solo ve sus oficinas y crea planes de oficina) → Plantilla (columnas de la base obligatorias u opcionales y listas) → Pilares (del PDI y/o propios) → Revisar. Reglas en `modeloPlanes.ts` (`validarDatosPlan`). Un plan sin oficina (anteriores a 0289) muestra «Sin oficina asignada» y el administrador la fija al editar; no se carga sin oficina.
- **Plantilla por plan.** `modeloPlanes.columnasDeConfig` arma las columnas desde la configuración del plan; `plantilla.ts` y `importar.ts` las usan (`config`, `anios`, `oficinaDuena`). Sin configuración todo sigue como el PDIFyT. Criterios, viabilidades, «% de inversión» y correo del gestor no se configuran: viajan siempre como opcionales (la base solo conoce `no, clasif, nombre, descripcion, campus, pilar, monto, prioridad, resultado, fuente, origen, inicio, fin, oficina`). Con pilares definidos, la columna «Pilar» se valida contra ellos; una línea sin oficina hereda la del plan.
- **Todos los planes** (`TodosLosPlanes.tsx`, ruta `planes`; administrador, aprobador, lector y financiero en lectura): totales, alertas, tarjetas por plan (con el hueco «Financiero: próximamente»), matriz plan × oficina con el número escrito, avance por oficina y ritmo semanal. Los cálculos vienen de `ps_tablero_admin`.
- **Demostración:** 3 planes (PDIFyT institucional de Planeación, Plan de Tecnología de oficina con otra plantilla y pilares, Plan de Bienestar archivado), cada uno con su adaptador de actividades. La interfaz de la VAF (evaluación, presupuesto, vigilancia) queda para la fase siguiente.

## VAF · financiación y presupuesto (CONTRATO-BD-F3B.md §6–§7, migración 0290; carpeta `vaf/`)

La Vicerrectoría Administrativa y Financiera evalúa lo financiero de cada plan y vigila el presupuesto y su ejecución. **No bloquea**: las oficinas operan mientras tanto. Nivel `financiero` (lector global que además escribe lo financiero); el administrador también opera todo para revisar y probar. La ejecución la registra solo la VAF/admin; las oficinas la ven (lectura) en el detalle de sus líneas.
- **Pantallas** (todas a pantalla completa con «Regresar», sin modales): `financiacion` (pestañas Por evaluar · Presupuesto · Alertas · Configuración), `vaf-evaluar/<plan>` (ficha en dos pasos; observaciones ≥ 20 caracteres con ajustes o no viable; historial), `vaf-linea/<ps_lineas.id>` (cifras, ejecución junto al avance físico validado, financiación por año —se edita en la misma página— y libro con anular inline), `vaf-mov/<línea>` (registrar), `vaf-cargar/<plan>?tipo=financiacion|ejecucion` (Excel todo o nada, errores por fila y columna), `vaf-umbrales/<plan>`, `vaf-config` (unidad de la VAF, solo admin). El panel «Presupuesto y ejecución de la línea» está en el detalle de la línea y de la actividad.
- **Lógica pura** (`modeloVaf.ts`): pesos (`$ 12,5 MM` = miles de millones, `$ 1.250 M` = millones; completo para lector de pantalla), validaciones, cifras (aprobado = movimientos `aprobado` del año o, si no hay, lo aprobado por la VAF; disponible = vigente − max(comprometido, ejecutado)), desviación = % de ejecución − avance físico, alertas (`sobreejecucion`, `ejecucion_sobre_avance`, `avance_sobre_ejecucion`, `sin_movimientos`, `sin_evaluar_vaf`) y umbrales (15 puntos, 100 %, 3 meses). Excel: `excelVaf.ts`. Datos: `contratoVaf.ts`, `memoriaVaf.ts` (demo), `supabaseVaf.ts` (rpc `ps_vaf_*`, `ps_presupuesto_*`, `ps_vigilancia_*`, `ps_plan_config_*`).
- El chip de estado financiero (glifo + texto) está en la barra de plan, en las tarjetas de «Todos los planes» y en la línea; el tablero suma presupuesto y evaluaciones por plan.

### Asignar el nivel a «Director VAF» (solo texto: no se ejecuta desde la aplicación)
El nivel se asigna por rol de acceso (Usuarios y roles › Planeación y Seguimiento › «Financiero (VAF)»); también se puede dejar en SQL, idempotente (requiere 0289 aplicada y que el rol «Director VAF» exista):
```sql
update public.access_roles
   set ps_nivel = 'financiero',
       screens = (select array(select distinct unnest(screens || array['planeacion_seguimiento']))) -- agrega la pantalla sin quitar las que ya tiene
 where name = 'Director VAF'
   and not all_screens
   and (ps_nivel is distinct from 'financiero' or not ('planeacion_seguimiento' = any (screens)));
-- Si el rol marca «todas las pantallas» (all_screens = true), basta con el nivel:
update public.access_roles set ps_nivel = 'financiero' where name = 'Director VAF' and all_screens and ps_nivel is distinct from 'financiero';
```
La unidad que recibe los avisos se fija en «Financiación y presupuesto › Configuración» (solo administrador).

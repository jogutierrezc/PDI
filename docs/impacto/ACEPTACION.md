# Módulo Impacto · informe de aceptación (fase 8)

Fecha: 2026-09-23 · Rama: `main`

## Cómo se probó

`tests/db/impacto-aceptacion.test.ts` recorre los once criterios de la especificación en **una sola historia**, sobre un Postgres en memoria (PGlite) con **todas** las migraciones y RLS real: cada paso corre con la sesión de la persona que lo haría. No hay atajos por fuera de lo que hace la aplicación: se importa el archivo real `UDES_Matriz_Impacto_Institucional_vr7.xlsx` con el importador del navegador, las fichas son las del piloto (`pilot-sheets.ts`), la validación es el servicio único (`validate.ts`, vía `issuesOf`), la plantilla se arma, se diligencia, se escribe, se vuelve a leer y se clasifica con `excel/template.ts` y `excel/import.ts`, y la consolidación es `aggregate.ts`.

Reparto de la historia:

- **Programa A** (pregrado, Bucaramanga y Cúcuta) trabaja **en línea**: 2026-1 validado para tener valor anterior; en 2026-2 captura, envía y recorre el flujo con sus dos devoluciones.
- **Programa B** (pregrado virtual, mismas sedes) trabaja **por Excel**: descarga, diligencia e importa su plantilla y completa en línea. Allí la decanatura y la vicerrectoría de Enseñanza también capturan, para probar la separación de funciones.

```
npx vitest run tests/db/impacto-aceptacion.test.ts   # solo la aceptación
npm test                                              # todo
```

## Resultado por criterio

| # | Criterio | Resultado | Qué lo demuestra |
| --- | --- | --- | --- |
| 1 | Importar la vr7 produce 106 indicadores (93 oficiales, 13 sugeridos) y el reporte de hallazgos esperado | ✅ Cumple | 106 = 37 · 27 · 42; 93 oficiales y 13 sugeridos en la base. Hallazgos: «2. PROCESO» en Enseñanza, 55 variantes de unidad, 1920 en la unidad de semilleros, META 2025 en Extensión, líneas base «Por definir» 27 · 12 · 42, responsables múltiples, formatos de proyecto y 13 dimensiones «Por definir». El CSV descargable trae hoja, fila, columna, tipo, valor y sugerencia. |
| 2 | Se completan las 13 fichas del piloto y se publica la versión 1, que ya no se edita | ✅ Cumple | Sin fichas no publica; con las 13 completas publica la versión 1. Editar o borrar un indicador publicado lo rechaza la base, también a la administración y al dueño de las tablas. Un cambio crea la versión 2 en borrador y la 1 no cambia. |
| 3 | Al abrir 2026-2 cada programa recibe solo lo que le aplica por nivel y sede; los sugeridos no se asignan | ✅ Cumple | La vista previa coincide con lo creado. Ninguna asignación es sugerida ni fuera del piloto; el nivel de formación siempre está en «aplica a»; la sede siempre es una que el programa ofrece, y hay sede exactamente cuando el nivel de reporte es por programa y sede. La maestría no recibe I01 ni E04 (solo pregrado); el programa de Valledupar solo recibe Valledupar. |
| 4 | El director captura en línea, guarda borradores y envía; V01–V09 bloquean | ✅ Cumple (con la salvedad de la nota 1) | Guardar deja borradores incompletos y la base calcula el valor. Un guardado sobre otro más reciente no pisa (versión). V01 a V09 se disparan sobre registros reales con su mensaje: V05 contra el valor validado de 2026-1 («cambió -44,4 % frente a 2026-1») y deja de bloquear con justificación. Sin errores, el paquete sale con la certificación; sin certificar, no. Enviado, ya no se edita. |
| 5 | Se descarga la plantilla, se diligencia, se importa, se ve la vista previa con errores por fila y se cargan las válidas | ✅ Cumple | La plantilla trae las cuatro hojas y lo guardado viene prellenado. En la vista previa salen filas nuevas, actualizadas, sin cambio y con error («Fila n, columna J: El numerador (600) no puede ser mayor que el denominador (500).»). Se cargan solo las 3 válidas, en borrador y por el canal Excel, con su lote (leídas, cargadas y con error). La plantilla vuelve con la columna «Errores» y las celdas en rojo. |
| 6 | Una plantilla alterada, de otro programa o de un periodo cerrado se rechaza completa, con su motivo | ✅ Cumple | Asignaciones o huella cambiadas: «fue alterada». Columnas cambiadas: rechazo por estructura antes de verificar. Plantilla de B subida desde A: «otro programa». Plantilla de 2026-1 después del cierre: «cerrado», también al intentar cargar. |
| 7 | Una celda vacía en el Excel no borra lo capturado en línea | ✅ Cumple | E03 tenía 40 guardado en línea. En el Excel se vació la celda y se escribió una observación: queda el 40 y entra la observación. |
| 8 | Un porcentaje de facultad se calcula como razón de sumas | ✅ Cumple | E04 validado en 4 programa × sede (92 %, 80 %, 86 %, 50 %): la facultad da 940 ÷ 1070 = 87,9 %, no el promedio de porcentajes (77 %). |
| 9 | Borrador → enviado → aprobado_decanatura → validado, y las dos devoluciones | ✅ Cumple | Una transición por paso, con su actor. Lo validado no se edita ni se devuelve. Devolución al programa con motivo y comentario obligatorios: solo lo devuelto se reabre y se reenvía. Devolución de la vicerrectoría a la decanatura, que reaprueba. Aprobar el paquete y validar por función. |
| 10 | Nadie aprueba ni valida lo que capturó | ✅ Cumple | La decanatura capturó I04 en B: no lo aprueba, pero sí el resto del paquete. La vicerrectoría de Enseñanza capturó E08: no lo valida, pero sí el resto de su función. |
| 11 | Cada registro muestra su historial de transiciones y los lotes de importación que lo modificaron | ✅ Cumple | El E04 de B muestra el lote `plantilla-B.xlsx` y sus tres pasos, visto por la dirección, la decanatura y la vicerrectoría. El E13 de A muestra la devolución con motivo y comentario. Otra facultad no ve nada. Las bitácoras rechazan `update` y `delete`. En pantalla: «Historial» en la ficha de captura y en la revisión (`DbHistory`). |

**Once de once criterios cumplen.** La prueba de aceptación tiene 37 casos en verde.

## Notas y riesgos

1. **Las validaciones V01–V09 las aplica la pantalla, no la base.** `imp_submit_program` verifica permiso, periodo abierto y certificación, pero no vuelve a correr V01–V09 (fase 5: «la base garantiza lo estructural y no repite reglas»). Quien llame la API directamente, sin pasar por la pantalla, puede enviar un paquete incompleto; la prueba lo muestra al enviar 2026-1 casi vacío. La decanatura lo vería al revisar y podría devolverlo. **Recomendación** antes de producción: que el envío rechace al menos los registros sin valor (V01) y las razones con numerador mayor que el denominador (V03), que se expresan en SQL sin duplicar la lógica de mensajes.
2. **La hora de la plantilla va al segundo.** Un guardado en línea en el mismo segundo en que se genera la plantilla sale «en conflicto» en la vista previa, aunque haya sido antes. El error queda del lado seguro: se avisa y, por defecto, se conserva lo guardado en línea. Afinarlo hacia el otro lado podría pisar un dato sin aviso.
3. **El cierre de un periodo no exige que todo esté validado.** En la prueba, 2026-1 se cerró con registros en «enviado». La especificación no lo pide; si Planeación quiere impedirlo, es una regla de una línea en `imp_close_period`.

## Fuera de alcance (confirmado)

No se implementó lo que la especificación deja fuera: objetos por proyecto, listas de chequeo completas, muestreo, metaauditoría, actas, reapertura de validados, integraciones con SNIES, SPADIES, ICFES o MinCiencias, e impactos no planeados. La vista de cadena de valor del portal existe porque el usuario la pidió en la etapa de diseño; no la exige ningún criterio. Con el cierre de la fase 7 (migración 0072) el portal ya lee la base: solo registros **validados**, de la última versión publicada, consolidados con `aggregate.ts`. `tests/db/impacto-portal.test.ts` lo cubre.

## Verificación conjunta

Sobre la rama del portal más esta prueba: 14 archivos y 228 pruebas en verde (172 anteriores, 19 del portal y 37 de aceptación), y `tsc -b` sin errores.

## Decisiones

Las decisiones de cada fase están en [DECISIONES.md](DECISIONES.md). Las de esta fase van en su sección «Fase 8».

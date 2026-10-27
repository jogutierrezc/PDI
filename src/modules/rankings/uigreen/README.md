# UI GreenMetric (sección de Rankings) · paquete U1: datos, backend, lógica y hooks

Todo vive dentro de Rankings: código en `src/modules/rankings/uigreen/`, base con prefijo `ugm_`. Sin rutas ni pantallas nuevas: el acceso es la pantalla «rankings» (`/admin/rankings/green`, Planeación o más). Las pantallas son de U2 (intranet) y U3 (página pública).

## Migraciones (aplicar en orden; todas idempotentes)
| Archivo | Qué hace |
|---|---|
| 0208_ugm_modelo | Tablas, papeles (`ugm_rol_en`), RLS, disparadores de estado y de retiro de publicación |
| 0209_ugm_catalogo_2026 | Siembra las 118 filas de la guía 2026 y las 7 categorías (generado; igual a `data/catalogo.ts`) |
| 0210_ugm_funciones | Ciclo, asignaciones, flujo, traducción, publicación, calculados |
| 0211_ugm_evidencias_udrive | Carpetas en UDrive, subida de evidencias, vínculos con Datos de Sostenibilidad |
| 0212_ugm_publico | Lecturas públicas `ugm_publico_*` (anon) |
| 0213_ugm_correos | Plantillas `c-ugm-*`, cola, recordatorios, resumen semanal |

Requieren 0137/0177 (correos), 0149 (ranking_cycles), 0187/0191/0202/0204/0207 (UDrive y Datos de Sostenibilidad). Si 0208 ya se aplicó en una versión anterior, volver a aplicar 0208 → 0213 en orden es seguro.

Funciones a desplegar: `correos` (acción nueva `ugm_cola`; también cambió la lista de variables de las plantillas «aviso», igual en `src/modules/admin/correos/servidor-logica.ts`) y `pilo-rankingsod` (acción nueva `traducir-campos`).

## Modelo
`ranking_cycles` (ranking = `ui-greenmetric`, anio = edición, anio_datos) · `ugm_config` · `ugm_categorias` / `ugm_preguntas` (copia del catálogo por ciclo) · `ugm_asignaciones` (a personas; oficina visible) · `ugm_respuestas` (una por pregunta) · `ugm_versiones`, `ugm_comentarios`, `ugm_actividad` (solo inserción) · `ugm_traducciones` · `ugm_evidencias` (+ reservas) · `ugm_datos_vinculos` / `ugm_datos_graficas` · `ugm_notificaciones` · `ugm_exportaciones` / `ugm_importaciones` · `ugm_glosario`.

Convención de `ugm_respuestas`: números, URL, fechas y lista de ODS en `valores`; textos en `textos_es` / `textos_en`; filas de tabla en `tablas` (ES) y `tablas_en` (EN, columnas de texto); `opcion` (1–5), `calculo` `{valor, unidad, texto}`. El esquema de cada pregunta (`ugm_preguntas.esquema`) dice qué campos y tablas tiene.

## Permisos
- Administración del ranking = Planeación o más. Revisor = asignación por categoría. Responsable / apoyo = asignación a la pregunta. Jefe de la oficina de quien responde = lee y reasigna dentro de su oficina.
- El responsable solo escribe las columnas de captura y solo con la respuesta abierta (asignado, en captura, devuelto). Estado, revisión y publicación cambian por funciones.
- La web pública solo usa `ugm_publico_*`; `anon` no toca ninguna tabla.
- Evidencias (resuelto en 0211): el responsable NO recibe papel «Crea» en la unidad. `ugm_reservar_evidencia` reserva una ruta exacta; una política aditiva de Storage solo deja subir a esa ruta; `ugm_registrar_evidencia` crea el archivo en la carpeta de la pregunta. Detalle y límites en la cabecera de 0211.

## Estados y avisos
`sin_asignar → asignado → en_captura → enviado → en_revision → aprobado`; `devuelto` vuelve a `en_captura`; solo la administración reabre una aprobada. Cuadro en `lib/estados.ts` (espejo de `ugm_transicion_permitida`). Publicar: solo la administración, con respuesta aprobada, traducción revisada y vigente (huellas), evidencia si se exige, no sensible y tablas conectadas publicadas. Si algo deja de cumplirse, se retira sola y queda en la bitácora.

Correos: asignación, «se presentó», devolución y aprobación se encolan por disparador; recordatorios (7, 3, 1 y 0 días, agrupados por persona; lo vencido, los lunes) y resumen semanal los prepara `ugm_tareas_diarias()`. La función `correos` vacía la cola. Cómo programarlo (pg_cron o cron de Coolify) está al final de 0213; **no se activa solo**.

## Lógica pura (`lib/`)
`tipos.ts` · `catalogo.ts` (+ `data/catalogo.ts`) · `estados.ts` · `calculo.ts` (fórmulas, bandas, estimación interna, `quienManda`) · `evidencia.ts` (nombres `1_10_descripcion_2025.pdf`, validadores PDF ≤ 2 MB con aviso, enlace público, rutas) · `docx-plantilla.ts` (`generarPlantilla` con marcadores `{{campo}}`, `llenarPlantilla`, `rellenarMarcadores`) · `docx-leer.ts` (`leerPlantillaDiligenciada` → informe nuevo/igual/conflicto, `construirCaptura`) · `paquete.ts` (zip `UIGM-<año>_<sigla>/…` con manifiesto y hoja CSV).

## Contrato de hooks (`datos.ts`)
Lectura: `useCiclosUgm`, `useConfigUgm`, `useCategoriasUgm`, `usePreguntasUgm`, `useAsignaciones`, `useRespuestas`, `useVersiones`, `useComentarios`, `useEvaluacion`, `useCalculados`, `useResumenCiclo`, `useBitacora`, `useEvidencias`, `useVinculos`, `useTablasDisponibles`, `useGraficasDisponibles`, `useTraducciones`, `usePendientesTraduccion`, `useGlosario`, `usePublicacionEstado`, `useNotificaciones`, `useColaEstado`, `useExportaciones`, `useImportaciones`, `usePersonasBuscar`.
Escritura: `useCrearCiclo`, `useCambiarEstadoCiclo`, `useGuardarConfig`, `useCrearCarpetas`, `useAsignar`/`Categoria`/`Masivo`/`Revisor`, `useReasignar`, `useRetirarAsignacion`, `useFijarVencimiento`, `useGuardarCaptura`, `useEnviar`, `useTomarRevision`, `useDevolver`, `useAprobar`, `useReabrir`, `useComentar`, `useSubirEvidencia` (reserva → Storage → registro), `useAgregarEnlace`, `useVincularArchivo`, `useEditar`/`QuitarEvidencia`, `usePublicarEvidencia`, `useVincularDato`/`Grafica` y sus `useQuitar…`, `useTraducirConPilo` + `useGuardarTraducciones` + `useMarcarTraduccionRevisada`, `usePublicar`, `useMarcarSensible`, `useEnviarAvisos`, `useTareasDiarias`, `useReintentarAviso`, `useRegistrarExportacion`/`Importacion`, `useCerrarImportacion`.
Públicas (U3): `usePublicoCiclos`, `usePublicoResumen`, `usePublicoCategoria(ciclo, cat, idioma)`, `usePublicoHoja(ciclo, q|código, idioma)`; releen cada 60 s. Todos fallan con `FaltaMigracion` si no están las migraciones.

Flujo de exportación para U2: por cada pregunta lista → `usePendientesTraduccion` vacío → `llenarPlantilla` → `armarPaquete`. Importación: `leerPlantillaDiligenciada` → mostrar el informe → `construirCaptura` → `useGuardarCaptura` + `useGuardarTraducciones` (origen `importacion`) → `useCerrarImportacion`.

## Decisiones tomadas por mi cuenta (aplicando la recomendación del análisis)
- «Tabla publicada» = alimenta un indicador publicado de UDES Sostenible o una gráfica publicada (Datos de Sostenibilidad no tiene interruptor por tabla).
- Del Word exportado: la tabla común de residuos (3.2–3.15) no se modela; cada pregunta lleva su cifra y su descripción.
- El «primer factor» (0 o 0,05) de cada indicador se leyó del Apéndice 1 con una regla automática: verificar antes de usar la estimación.
- Frases de opción en inglés: solo existen para 1.1, 1.2, 2.4 y 7.4; en las demás escalas la web inglesa muestra la narrativa sin frase hasta cargar `opciones[].en`.
- Texto traducido: Pilo junta saltos de línea (verificación de cifras y siglas igual que en los informes ODS).

## Dudas abiertas
1. Quien responde pero tiene rol bajo (consulta) no entra a `/admin/rankings` (exige Planeación). Falta decidir una entrada para responsables dentro de Rankings (p. ej. una subruta bajo `/admin/reporte-rankings`, que admite a cualquier persona activa) o dar el rol.
2. (Resuelta en U3) Los PDF públicos los sirve la función `ugm-evidencia`; ver «Página pública».
3. Conversión a PDF (decisión 7): no hay; se exporta `.docx`.
4. Objetos subidos y nunca registrados quedan huérfanos en Storage (ver 0211).

## Página pública (U3)
Código en `publico/` (estilos `ugmp-`), lecturas solo por los hooks `usePublico*` (RPC `ugm_publico_*` de 0212, sin sesión, cada 60 s).

**Rutas** (`src/App.tsx`, antes de `/sostenible/:ranking`):
| Ruta | Qué |
|---|---|
| `/sostenible/green` | Portada: titular, cifras, selector de edición, filtro, buscador de categorías, pared de 7 carteles con «N de M indicadores publicados» y regleta de cuadros |
| `/sostenible/green/:categoria` (`SI EC WS WR TR ED GD`, sin distinguir mayúsculas) | Indicadores publicados (narrativa, cifra con año, campos, tablas, gráficas y tablas de Datos de Sostenibilidad con pie «Fuente … actualizado …», evidencias), calculados, programas |
| `/sostenible/green/evidencia/:q` (`q` = «1.10» o «SI3») | Hoja por indicador, sin menú, abre en inglés |
`?lang=es|en` (el selector es el del portal) y `?edicion=<año>`. En `/sostenible/:ranking` y `/:ranking/:categoria` solo se cambió el hijo del CMS por `RankingPublico`/`CategoriaPublica` con `vieja={…}`.

**Compatibilidad:** si no hay ciclo con algo visible, hay error o faltan 0208–0212, `/sostenible/green` y sus categorías muestran la página de siempre (`SostenibleRanking`), idéntica; un CMS publicado para «green» sigue mandando. Si todo se retira, vuelve sola (60 s).

**Qué se publica:** lo que `ugm_publica_ok` deja salir (aprobado, no sensible, traducción revisada y vigente, evidencia si se exige, tablas conectadas publicadas). Nunca puntos, pesos, porcentajes de avance, nivel «N de 5» (se muestra la frase de la opción), borradores, comentarios, personas ni nombres de archivo. En inglés solo sale texto con traducción revisada (lo decide la base); el inglés de la interfaz y de las frases de categoría está en `publico/textos.ts` (revisarlo).

**Evidencias:** el enlace de un archivo es `<VITE_SUPABASE_URL>/functions/v1/ugm-evidencia?id=<evidencia>`. La función (`supabase/functions/ugm-evidencia`) pregunta a `ugm_ruta_evidencia_web` (0214, solo rol de servicio, exige todo lo de `ugm_publica_ok` + archivo vivo + ciclo visible), firma 60 s, descarga y reenvía con nombre genérico (`evidence-xxxxxxxx.pdf`); no entrega nunca la ruta ni el nombre interno. PDF e imágenes inline; lo demás, descarga aislada; 40 peticiones/min/IP; 25 MB; `no-store`. Los enlaces https marcados públicos se abren directos.

**Bloque del CMS** `ranking-avance` (grupo «Datos en vivo», vivo): `ranking` (hoy solo green) y `seccion` (pared | avance) más el encabezado; lee `ugm_publico_resumen`; sin nada publicado no se ve (en el editor avisa). **Portada de /sostenible:** `TarjetaHome` solo si hay contenido.

**Movimiento** (`publico/movimiento.ts`, GSAP en `useGSAP`): entradas 240 ms `power4.out`, escalonado ≤ 30 ms (máx. 9), cuadros que se llenan, cambio en vivo de un cuadro, aviso `role=status`; `prefers-reduced-motion` = fundido de 120 ms; hover solo con `(hover:hover) and (pointer:fine)`; nada al teclear.

**SEO:** título y descripción por vista, `<html lang>` (`useLang`) y las etiquetas Open Graph/Twitter que ya existan en `index.html`. Es una SPA sin prerender: los buscadores y los modelos de lenguaje no ven el contenido hasta tener prerender en el borde; tampoco hay `sitemap.xml` ni datos estructurados (pendiente).

**Migraciones nuevas (en orden, tras 0213):** `0214_ugm_evidencia_web` (ruta de evidencia pública para la función) · `0215_ugm_correos_enlace_consulta` (los avisos enlazan a `/admin/reporte-rankings/green?q=…`, que abre el rol «consulta»; disparador sobre `ugm_notificaciones` + corrige los avisos en cola).
**Desplegar:** `supabase functions deploy ugm-evidencia --no-verify-jwt` y volver a desplegar `correos` (acepta ambas rutas y arma siempre `/admin/reporte-rankings/…`).

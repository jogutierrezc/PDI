# Módulo Impacto · plan (Fase 0)

## Stack detectado

| Pieza | En el repositorio |
| --- | --- |
| Interfaz | React 18 + TypeScript + Vite, React Router 7, TanStack Query |
| Datos | Supabase: Postgres, Auth, Storage, Edge Functions. Sin ORM: `supabase-js` y RPC en PL/pgSQL |
| Autorización | RLS y funciones `security definer`. `profiles.role` (consulta · responsable · planeacion · admin) y `access_roles` (0024) como datos |
| Estructura | `units` + `unit_members` (0057): vicerrectorías, facultades y programas en árbol, con papel heredado. `campuses` (0017). `faculties` (0016) |
| Migraciones | `supabase/migrations/00NN_*.sql`, numeradas, idempotentes; se aplican en el editor SQL del proyecto en vivo |
| Excel | `read-excel-file` (lectura), `fflate` (zip). Se agrega **ExcelJS** para la plantilla |
| Pruebas | Solo `npm run smoke`. Se agregan **Vitest** y **PGlite** (desarrollo) |
| Estilos | Tokens de `src/styles/tokens.css`, textos en español |

## Cómo encaja Impacto

- **Rutas**: `/admin/impacto/:vista` (intranet) y `/impacto/*` (portal con sesión). Ya cableadas.
- **Código**: `src/modules/impacto/{data,admin,portal}`. La lógica pura (`validate.ts`, `aggregate.ts`) es la misma en el navegador y en las pruebas.
- **Base**: migraciones `0063+` con tablas `imp_*`, en inglés como el resto del esquema.

## Modelo: especificación → tablas

| Especificación | Tabla | Nota |
| --- | --- | --- |
| unidad_organizacional | `units` (existe) | Se agregan `snies_code`, `degree_level`, `modality`; `kind` ya distingue vicerrectoría, facultad y programa |
| oferta_sede | `imp_program_campuses` | programa (`units`) × `campuses`, `active` |
| usuario_rol | `unit_members` (existe) + `access_roles` (existe) | Ver «Roles» abajo |
| version_catalogo | `imp_catalog_versions` | borrador · publicada; publicada inmutable (disparador) |
| indicador | `imp_indicators` | por versión; campos de la matriz + ficha técnica |
| meta, linea_base | `imp_targets`, `imp_baselines` | |
| alineacion | `imp_alignments` | tipo: pilar, proyecto, ods, cesu, dimension, tema |
| catalogo_maestro | `imp_master_catalog` | pilares, proyectos, ODS, fuentes, dimensiones |
| hallazgo_importacion | `imp_import_findings` | abierto · resuelto · aceptado |
| periodo | `imp_periods` | |
| asignacion | `imp_assignments` | indicador × programa × sede × periodo |
| registro | `imp_records` | `valor` lo calcula la base; nunca porcentaje sin numerador y denominador |
| evidencia | `imp_evidence` | archivo en Storage (bucket `impacto`) o URL |
| transicion | `imp_transitions` | **solo inserción** |
| lote_importacion | `imp_import_batches` | **solo inserción** |

## Roles (decisión del usuario, 2026-09-23)

Se usa la estructura actual y los roles se vuelven configurables:

1. `access_roles` gana `capabilities text[]` con permisos de Impacto:
   `impacto.catalogo`, `impacto.periodo`, `impacto.capturar`, `impacto.enviar`, `impacto.aprobar`, `impacto.validar`.
   Planeación puede crear roles nuevos en «Usuarios y roles» y marcar sus capacidades.
2. `unit_members` gana `access_role_id`: **quién trabaja en qué unidad y con qué rol**. El alcance lo da la unidad: director o reportante en un programa, decano en una facultad, vicerrector en una vicerrectoría (que fija la función que valida).
3. Semilla: roles *Director de programa*, *Reportante*, *Decano*, *Vicerrector* y *Administrador de Impacto*, marcados como del sistema.
4. Se captura solo con `impacto.capturar` **en el propio programa**, no por herencia desde la facultad; así un decano no captura aunque su papel baje a los programas.
5. Separación de funciones: nadie aprueba ni valida un registro que él mismo capturó (se compara con `imp_records.captured_by` y la bitácora).

## Firma de la plantilla

HMAC-SHA256 con `pgcrypto` dentro de la base. La clave se genera en la migración, vive en una tabla sin acceso para `anon` ni `authenticated`, y solo la leen las RPC `imp_sign_template` e `imp_verify_template`. El navegador arma el Excel con ExcelJS y pide la firma; nunca ve la clave.

## Semillas

- **Migraciones** (llegan a producción): catálogos maestros de PORTADA (pilares 1–6, proyectos Pr1–Pr7, ODS), roles de Impacto.
- **`supabase/seed/impacto_prueba.sql`** (no es migración): facultad de prueba con 3 programas (uno de posgrado) en 2 sedes y un usuario por rol. Lo usan las pruebas en PGlite; en Supabase solo se aplica en un proyecto de pruebas.

## Pruebas

- **Vitest**: unitarias de `validate.ts`, `aggregate.ts`, importador y plantilla.
- **PGlite**: aplica todas las migraciones sobre un Postgres en memoria con un esquema `auth` simulado, y prueba restricciones, RLS, transiciones y que las bitácoras rechacen `update` y `delete`.

## Fases

| Fase | Entrega |
| --- | --- |
| 1 | Migración del modelo, roles configurables, semillas, pruebas de integridad y de bitácoras |
| 2 | Importador de la vr7 (106 · 93 · 13) con reporte de hallazgos descargable y prueba con el archivo real |
| 3 | Catálogo: filtros, ficha técnica, códigos, hallazgos, publicación inmutable |
| 4 | Periodos, asignaciones con vista previa y justificación, precargados |
| 5 | Captura en línea sobre la base (la interfaz del prototipo) |
| 6 | Plantilla Excel firmada e importación con vista previa y conflictos |
| 7 | Flujo de estados y bandejas con datos reales; el portal pasa a leer la base |
| 8 | Pruebas de aceptación y reporte final |

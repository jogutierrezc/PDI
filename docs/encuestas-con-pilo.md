# Encuestas con Pilo — guía del dueño

Las dependencias de la UDES envían «logros» y «retos» con cifras a una encuesta pública; el personal los ve y gestiona en una tabla. La primera encuesta: `rendicion-2026`.

## Qué aplicar

1. Migración `supabase/migrations/0179_encuestas_pilo.sql` (idempotente). Crea `enc_encuestas`, `enc_aportes`, `enc_cifras`, la función `enc_enviar` (solo rol de servicio) y siembra `rendicion-2026` con cierre el 2026-11-15.

## Qué desplegar

```
supabase functions deploy encuestas --no-verify-jwt
```

Variables: ninguna nueva (usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, que ya existen). El ingreso con Microsoft usa el proveedor Azure de Supabase Auth, ya configurado para Contactos de Internacionalización; hay que añadir a las URL de redirección permitidas la de la página pública de la encuesta.

## Quién ve y edita (panel interno)

Pantalla `encuestas` del rol de acceso (los roles de fábrica con todas las pantallas ya la tienen; los hechos a mano que veían Rutas o Reportes la reciben con la migración).

- Ver encuestas, aportes y cifras: pantalla `encuestas` + capacidad Responsable o más.
- Editar título, mensajes, abierta y fecha de cierre, y cambiar el estado de un aporte (`recibido`, `revisado`, `para_video`): pantalla `encuestas` + capacidad Planeación o más. De un aporte solo cambia `estado`.

## Cómo cerrar la encuesta

- Automático: pasa `cierra_el` (el día de cierre todavía recibe).
- A mano: poner `abierta = false` en la tabla (o desde el panel). El formulario deja de recibir y la función responde 403 «Esta encuesta ya está cerrada.».
- Para reabrir: `abierta = true` y mover `cierra_el`.

## Qué se acepta

- Correo: siempre el de la cuenta Microsoft verificada, de `udes.edu.co` o sus subdominios (valledupar, cucuta, bogota, bucaramanga, mail).
- Dependencia 3–90 letras; hasta 30 aportes por envío; título 5–120; descripción 20–500; hasta 12 cifras por aporte.
- Cifra: qué mide 2–80; tipo `estudiantes`, `programas`, `porcentaje` (0–100), `dinero` u `otro` (una palabra de 2–20 letras); valor ≥ 0.

## Plantilla de Excel e importación de logros y retos

Para quien prefiere llenar sus logros y retos en Excel. Todo ocurre en el navegador: no hay función, migración ni llamada nueva; el envío sigue por el camino de siempre.

- En «Qué enviar» (encuesta de aportes) y en el bloque de logros y retos (encuestas del modelo nuevo) aparecen «Descargar plantilla de Excel» e «Importar desde Excel» (`publico/ImportarExcel.tsx`).
- La plantilla (`publico/plantilla-logros-retos.ts`) trae las hojas «Instrucciones», «Logros y retos» y «Cifras», más `Listas` y `_Control` ocultas (formato `pilo-encuestas-logros-retos`, versión 1, origen `plantilla`, slug de la encuesta). Lleva banda azul con el logo, lista desplegable de tipo y de tipo de cifra, validación de largo (título 5–120, descripción 20–500, «qué mide» 2–80), colores (azul claro: opcional; amarillo: obligatorio; gris: no tocar) y dos filas de ejemplo con N.º «EJEMPLO» que no se importan.
- Cómo se enlazan las cifras: el N.º de «Cifras» es el de «Logros y retos». La unidad solo se escribe cuando el tipo de cifra es Otro (una palabra).
- Importar (`publico/importar-logros-retos.ts`, puro y probado): rechaza archivos que no son .xlsx, de más de 2 MB, de otro formato u otra versión; trata todo como texto, ignora fórmulas y filas vacías o de ejemplo, lee números como en Colombia (1.200,5) y valida cada fila con `lib/validacion.ts`. Una fila mala no impide importar las buenas. Muestra la revisión («N aportes: X listos, Y con problemas») con hoja, fila y columna; solo agrega los válidos, sin repetir lo ya escrito (mismo tipo y título) y sin pasar de 30 aportes por envío (o el máximo del bloque).
- El libro de «Mis envíos → Descargar en Excel» usa los mismos encabezados base (con una columna final «Tipo de cifra») y se puede importar: se avisa que son copias de aportes ya enviados.
- La dependencia no va en el libro: se escribe en el formulario.
- Pruebas: `publico/importar-logros-retos.test.ts` (incluye ida y vuelta con archivos reales de exceljs), `publico/ImportarExcel.test.ts`, `publico/excel-envios.test.ts`.

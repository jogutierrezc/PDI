# conv-firma · contrato para las pantallas

Un solo punto de entrada: `POST {SUPABASE_URL}/functions/v1/conv-firma` con cuerpo JSON `{ "action": "...", ... }`.

- Éxito: HTTP 200 y un JSON (abajo).
- Error: `{ "error": "texto en español para mostrar", "code": "codigo_maquina", ...extras }` con el HTTP indicado.
  Las pantallas deben decidir por `code`, no por el texto.
- Públicas: sin `Authorization` (basta la cabecera `apikey` anónima si el cliente la manda; no se usa).
- Internas: `Authorization: Bearer <sesión del usuario>`. Escribir exige `int_puede_crear()`; leer, `int_ve_modulo()`.
- Fechas: ISO 8601 en UTC. Mostrar en hora de Bogotá o del navegador, a gusto de la pantalla.
- Todos los límites de intentos devuelven `429` con `retry_after` (segundos) cuando aplica.

## Flujo del firmante (páginas públicas)

1. `/firma/<token>` → `abrir` (qué falta) → el correo ya trajo el código.
2. El firmante escribe el código → `verificar_codigo` → devuelve `sesion` (úsela en las demás llamadas con `token`).
3. `documento` (URL firmada de 90 s) → leer → `marcar_leido`.
4. Firmar: `firmar` con `metodo` = `dibujo` | `movil` | `certificado`.
   - móvil: `iniciar_movil` → mostrar QR de `url` → consultar `estado_movil` cada ~2 s → al llegar `recibido`, `firmar` con `metodo: "movil"`.
   - teléfono: `/firma/movil/<movil_token>` → `movil_abrir` → `movil_enviar`.
5. Verificación pública: `/verificar/<código>?h=<huella>&f=<identidad>` → `verificar`.

El estado visible lo da `abrir.falta`: `codigo` · `lectura` · `firma` · `esperar_turno` · `nada`.

## Acciones internas

### `crear`
Entrada: `{ generado_id, firmantes: [{ orden, rol: "UDES"|"contraparte"|"testigo", rol_texto?, nombre, correo, idioma?: "es"|"en" }], idioma?, secuencial?: boolean, enviar?: boolean }`.
`orden` coincide con `data-firma` de las cajas de firma del modelo (1, 2...). Genera el PDF a firmar, su huella SHA-256 y la solicitud
(estado `borrador`). Con `enviar: true` la envía de una vez.
Salida: `{ firma, firmantes }` (ver «Objetos»). Errores: `ya_existe` (409, trae `firma_id`), `documento_alterado`, `sin_gotenberg`, `pdf_*`, `sin_certificado`, `certificado_vencido`, `firmantes_invalidos`.

### `enviar`  `{ firma_id }`
Pasa de `borrador` a `enviada`, fija el vencimiento a 15 días, y a cada firmante le manda el correo `firma_solicitud` con el enlace
`https://planeacion.udes.edu.co/firma/<token>` Y el código de 6 dígitos. Si es `secuencial`, solo al primero.
Salida: `{ firma, firmantes, enviados: [firmante_id], fallidos: [{ firmante_id, error }] }`. Si no sale ningún correo vuelve a `borrador` (`correo_fallo`, 502).

### `recordar`  `{ firma_id, firmante_id?, extender?: boolean }`
Correo `firma_recordatorio`. **El enlace y el código se renuevan**: el enlace anterior deja de servir (los tokens solo se guardan como hash y no se pueden reenviar). `extender` (por omisión sí) reinicia el plazo de 15 días.

### `reenviar_enlace`  `{ firma_id, firmante_id, extender?: boolean }`
Igual que `recordar` con la plantilla `firma_solicitud`. También reactiva una solicitud `vencida`.

### `cancelar`  `{ firma_id, motivo? }`
Estado `cancelada`; invalida enlaces. El documento vuelve a «listo para firma».

### `reintentar`  `{ firma_id }`
Reintenta el cierre (PDF final, certificado, correos) si falló. Devuelve `{ ok, error?, firma, firmantes }`.

### `listar`  `{ convenio_id?, generado_id?, estado?, limite? }` → `{ firmas: [{...firma, firmantes: [...]}] }`
### `detalle`  `{ firma_id }` → `{ firma, firmantes, eventos }`
`eventos`: `[{ id, firmante_id, tipo, ocurrio_en, ip, agente, detalle, hash }]` (línea de tiempo, encadenada por huellas).

### `estado_certificado_udes` → `{ configurado, origen: "p12"|"servicio", sujeto, emisor, serie, desde, hasta, vigente, autofirmado, sello_de_tiempo: { configurado, servidor }, nota, gotenberg: { configurado, disponible }, correo: { modo, disponible, error } }`
Para el panel interno. `nota` explica cómo cargar el certificado definitivo si el actual es autofirmado. Sin certificado: `{ configurado: false, codigo, mensaje, ... }`.

### `descargar`  `{ firma_id, archivo: "base"|"firmado"|"certificado" }` → `{ url, vence_en_s: 120, nombre }`

### `vencer` (cron)  → `{ vencidas, reintentos, finalizaciones_recuperadas }`
Encabezado `x-conv-firma-cron: <CONV_FIRMA_CRON>`. Ver README.

## Acciones públicas

Todas reciben `token` (43 caracteres del enlace) salvo las del teléfono y `verificar`. Las que piden `sesion` la obtienen de `verificar_codigo`.

| Acción | Entrada | Salida |
|---|---|---|
| `abrir` | `{ token }` | `{ estado_firma, estado_firmante, idioma, documento: { nombre, institucion, paginas }, firmante: { nombre, correo_enmascarado, rol, rol_texto, codigo_identidad }, firmantes: [{ orden, rol, rol_texto, nombre, firmado }], vence_en, turno, falta, codigo_vigente, espera_codigo_s, sesion_vigente, firmado_en, codigo_verificacion }`. **Nunca devuelve el documento.** |
| `solicitar_codigo` | `{ token }` | `{ enviado, correo_enmascarado, espera_s: 60, vence_en, invalida_anterior }`. Espera de 60 s (`espera_codigo`, 429), 10 por día (`limite_diario`). El código nuevo invalida el anterior. |
| `verificar_codigo` | `{ token, codigo }` | `{ sesion, sesion_vence_en, mensaje_firma, huella, paginas, algoritmos_certificado }`. 5 intentos por código y 10 min. Errores: `codigo_incorrecto` (401, `intentos_restantes`), `codigo_bloqueado`, `codigo_vencido` (410), `sin_codigo`, `bloqueado` (423). |
| `documento` | `{ token, sesion }` | `{ url, vence_en_s: 90, nombre, paginas, huella, mensaje_firma }` |
| `marcar_leido` | `{ token, sesion }` | `{ leido: true }` |
| `iniciar_movil` | `{ token, sesion }` | `{ movil_token, url, vence_en, vigencia_s: 300 }` (`url` = `https://planeacion.udes.edu.co/firma/movil/<movil_token>`) |
| `estado_movil` | `{ token, sesion }` | `{ estado: "ninguna"|"pendiente"|"recibido"|"vencido"|"usado", vence_en?, imagen? }` (`imagen` = data URL del trazo recortado, solo en `recibido`) |
| `movil_abrir` | `{ movil_token }` | `{ valido, idioma, nombre, vence_en }` |
| `movil_enviar` | `{ movil_token, imagen }` | `{ recibido: true }`. `imagen`: PNG en base64 (con o sin `data:image/png;base64,`), ≤ 400 KB, 24 a 2000 × 1000 px. |
| `firmar` | ver abajo | `{ firmado, firmado_en, codigo_identidad, codigo_verificacion, pendientes, finalizado, finalizacion_pendiente, aviso? }` |
| `verificar` | `{ codigo, h?, f? }` | ver abajo |

### `firmar`
```
{ token, sesion, metodo: "dibujo"|"movil"|"certificado", acepta: true, zona_horaria?: "America/Bogota",
  imagen?: "<PNG base64>",                       // metodo = dibujo
  certificado?: { firma_b64, algoritmo, cadena_pem } }  // metodo = certificado
```
- La IP, el país (si el proxy lo informa) y el agente salen de los encabezados; no se aceptan del cuerpo.
- Cuando firma el último, la función cierra sola: PDF final con los bloques de firma, sello digital, certificado de trazabilidad y correo
  `firma_certificado` a todas las partes. Si el cierre falla, la firma queda registrada (`finalizacion_pendiente: true`) y el cron lo reintenta.
- Errores: `sin_aceptacion`, `metodo_invalido`, `sesion_invalida`/`sesion_vencida` (401), `turno_pendiente` (409, solicitudes secuenciales), `ya_firmado`,
  `trazo_vacio`, `trazo_invalido`, `trazo_grande`, `trazo_dimensiones`, `sin_trazo_movil`, `certificado_invalido`, `firma_no_coincide`.

### Método `certificado`: qué firma el navegador
El `.p12` y su clave **nunca** se envían. El navegador lee el `.p12` localmente y firma los bytes UTF-8 de `mensaje_firma`
(texto que entregan `verificar_codigo` y `documento`; contiene el código de la solicitud, la identidad del firmante y la huella del PDF):
- `algoritmo: "RSASSA-PKCS1-v1_5-SHA256"` (clave RSA ≥ 2048 bits), o
- `algoritmo: "ECDSA-P256-SHA256"` (firma en formato IEEE P1363, `r‖s`, el de WebCrypto).

`firma_b64` es la firma en base64 y `cadena_pem` son de 1 a 5 certificados en PEM, el del firmante primero. El servidor comprueba firma, vigencia, uso de la clave y encadenamiento;
guarda sujeto, emisor, serie y vigencia. No consulta revocación ni valida contra una entidad acreditada: marca `cadena: "no_verificada_acreditada"`
(o `lista_confianza` si la raíz está en `CONV_FIRMA_RAICES_PEM`).

### `verificar`
Sin `h` (o con una `h` que no coincide): `{ encontrado, codigo, estado, firmada_en, huella_coincide: null|false, documento: { nombre, institucion, convenio }, firmantes_total }`.
Con `h` = huella del documento o del PDF final: añade `huella_documento`, `huella_pdf_firmado`, `sello: { sujeto, emisor, serie, hora_utc, sello_de_tiempo }` y
`firmantes: [{ orden, rol, rol_texto, nombre, correo_enmascarado, codigo_identidad, metodo, firmado_en, pais, cert, es_el_consultado }]`
(`f` = código de identidad del firmante del QR; en el QR del certificado `f=C`). Una solicitud no firmada responde igual que una inexistente: `{ encontrado: false }`.

## Objetos

`firma`: `id, convenio_id, generado_id, estado (borrador|enviada|en_firma|firmada|vencida|cancelada), idioma, secuencial, codigo_verificacion (UDES-CV-AAAA-NNNNNN), nombre_documento, formato_origen, pdf_paginas, pdf_base_hash, pdf_firmado_hash, certificado_hash, sellado, udrive, finalizacion (null|pendiente|en_proceso|error|lista), finalizacion_error, vence_en, enviada_en, firmada_en, cancelada_en, cancelada_motivo, created_by, created_at`.

`firmante`: `id, orden, rol, rol_texto, nombre, correo, idioma, estado (pendiente|abierto|verificado|firmado), codigo_identidad (ID-XXXX-XXXX), enlace_enviado_en, recordatorios, metodo, cert_sujeto, cert_emisor, cert_serie, cert_desde, cert_hasta, cert_cadena, ip, agente, pais, zona_horaria, abierto_en, verificado_en, leido_en, firmado_en`.

Tipos de evento: `creado, enviado, entregado*, abierto, codigo_enviado, codigo_reenviado, codigo_verificado, codigo_fallido, documento_visto, documento_leido, firma_adoptada, firma_aplicada, movil_iniciado, movil_recibido, pdf_generado, pdf_sellado, certificado_emitido, correos_enviados, cancelado, vencido, recordatorio, enlace_reenviado, bloqueado, udrive_archivado, udrive_fallo, finalizacion_error`.
\* `entregado` significa «aceptado por el servidor de correo», no que la persona lo recibiera.

## Lectura directa desde el panel
`conv_firmas`, `conv_firmantes` (solo columnas no secretas: pida columnas explícitas, no `select *`) y `conv_firma_eventos` se pueden leer con la sesión (RLS `int_ve_modulo()`). Escribir siempre pasa por esta función.

## Códigos de error frecuentes
`enlace_invalido` 404 · `enlace_vencido` 410 · `solicitud_cancelada` 410 · `ya_finalizada` 409 · `demasiadas_peticiones` 429 · `sin_gotenberg` 503 · `sin_certificado` 503 · `sin_correo` 503 · `sin_sesion` 401 · `sin_permiso` 403 · `accion_desconocida` 400 · `cuerpo_grande` 413 · `error_interno` 500.

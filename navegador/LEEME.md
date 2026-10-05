# Navegador de Mr. Pilo

Un servicio pequeño que abre una página web pública en un navegador de verdad (Chromium, con Playwright), deja que su JavaScript la arme, despliega lo que está plegado (pestañas, acordeones, «ver más») y devuelve su texto como un HTML sencillo.

Lo usa la función `pilo-ia` de Supabase cuando la administración marca «Abrir con navegador» al leer una página en **Mr. Pilo con IA › Páginas web**. La función no puede abrir un navegador; este servicio sí. Es opcional: sin él, Pilo lee las páginas como siempre, sin ejecutar JavaScript.

## Arrancarlo

Necesita Node 20 o más.

```bash
cd navegador
npm install
npx playwright install --with-deps chromium
NAVEGADOR_CLAVE="una-clave-larga-y-al-azar-de-24-o-mas" npm start
```

Con Docker (la imagen ya trae Chromium):

```bash
cd navegador
docker build -t pilo-navegador .
docker run -d --name pilo-navegador --restart unless-stopped \
  -p 8787:8787 --memory 1g --shm-size 512m \
  -e NAVEGADOR_CLAVE="una-clave-larga-y-al-azar-de-24-o-mas" \
  pilo-navegador
```

La función de Supabase solo le habla por **https** y a un nombre de dominio público: póngalo detrás del proxy de siempre (Nginx, Caddy, el del proveedor) con su certificado. Después, en la intranet, **Mr. Pilo con IA › Páginas web › Navegador**: escriba la dirección (`https://navegador.ejemplo.edu.co`), guarde la misma clave y enciéndalo. Requiere la migración `0132`.

Para una clave: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## Variables de entorno

| Variable | Qué es | De partida |
| --- | --- | --- |
| `NAVEGADOR_CLAVE` | **Obligatoria.** La clave que debe traer cada pedido. Mínimo 24 caracteres. Sin ella el servicio no arranca. | — |
| `PORT` (o `NAVEGADOR_PUERTO`) | Puerto donde escucha. | `8787` |
| `NAVEGADOR_COLA` | Cuántos pedidos pueden esperar mientras se atiende uno. Con la cola llena responde 429. | `3` |
| `NAVEGADOR_MS` | Tiempo máximo por página, en milisegundos. | `45000` |
| `NAVEGADOR_MAX_HTML` | Tamaño máximo del HTML que devuelve, en bytes. | `2000000` |
| `NAVEGADOR_INACTIVO_MS` | Tras cuánto tiempo sin pedidos se cierra Chromium (se abre solo con el siguiente). | `120000` |
| `NAVEGADOR_ROBOTS` | `no` deja de consultar robots.txt. No lo cambie sin una razón. | `si` |
| `NAVEGADOR_AGENTE` | El «User-Agent» con que se presenta. Debe seguir diciendo `MrPiloBot`. | `Mozilla/5.0 (compatible; MrPiloBot/1.0; …)` |

## La interfaz

`GET /salud` → `{ "ok": true, "ocupado": false, "esperando": 0 }`. Sin clave y sin datos sensibles.

`POST /leer` con `Authorization: Bearer <clave>` y cuerpo `{ "url": "https://…", "clics": true }`:

```json
{
  "url": "https://www.ejemplo.edu.co/admisiones",
  "title": "Admisiones",
  "html": "<!doctype html><html lang=\"es\">…<main>\n<h2>Posgrado</h2>\n<p>…</p>\n</main></body></html>",
  "clicks": [{ "what": "pestaña · Posgrado", "ok": true }, { "what": "ver más · Ver más requisitos", "ok": false }],
  "cut": false,
  "ms": 6120
}
```

- `html` no es el HTML de la página: es su **texto**, en títulos, párrafos y listas, ya sin scripts, estilos ni nada que ejecutar. Así la función lo procesa con lo mismo que usa para cualquier página.
- `clicks` dice qué pulsó y si sirvió. `clics: false` solo ejecuta el JavaScript, sin pulsar nada.
- `cut` es verdadero si la página no cupo en el tope.
- Errores: `{ "error": "…", "code": "…" }` con `clave` (401), `direccion` (400), `robots` (403), `ocupado` (429), `tiempo` (504) o `pagina` (502/415).

## Qué pulsa y qué no

Solo lo que **despliega contenido dentro de la misma página**: pestañas (`role=tab`), disparadores de acordeón (`aria-expanded="false"` con `aria-controls`), `<summary>`, botones «ver más / mostrar más / leer más / mostrar todo / cargar más» y «siguiente» de una paginación que no cambia de dirección.

Nunca: nada dentro de un formulario ni de tipo `submit`; enlaces que lleven a otra dirección; lo que diga ingresar, iniciar sesión, registrarse, comprar, pagar, eliminar, borrar, descargar, enviar, aceptar, cerrar sesión y parecidas; `download`; `target=_blank`; controles de cookies, publicidad, ventanas emergentes o chat; ni lo que esté en el menú, el pie, un diálogo o un menú desplegable. No escribe en ningún campo. Las reglas completas, con su porqué, están al comienzo de `src/clics.js`.

Topes por página: 40 clics, 20 segundos pulsando, y el texto no puede crecer más de 12 veces (ni pasar de 600.000 caracteres). Si un clic intenta salir de la página, la navegación se corta (o se vuelve atrás) y el clic se anota como fallido.

## Seguridad y privacidad

- **Solo sitios públicos.** `http`/`https`, puertos 80 y 443, nombre de dominio público. Nunca una dirección IP, `localhost` ni un nombre de red interna.
- **Todo el tráfico del navegador sale por un proxy propio** (dentro del mismo proceso) que revisa cada conexión: la página, cada redirección, cada marco y cada subpetición. Un nombre público que resuelve a una red interna no conecta, y la conexión se hace a la dirección que se revisó.
- **Respeta robots.txt.** Se presenta como `MrPiloBot` y, antes de abrir una página, lee el `robots.txt` del sitio: si no lo deja entrar (a `MrPiloBot` o, si no lo nombra, a `*`), no la abre. Sin `robots.txt`, entra; si el sitio falla al darlo, no entra.
- **No guarda nada.** Un contexto de navegador nuevo por pedido, sin cookies ni memoria de un pedido a otro; descargas bloqueadas; nada se escribe en disco.
- **No registra lo leído.** El registro lleva la hora, el sitio (sin ruta ni consulta), el resultado y cuánto tardó.
- **Un pedido a la vez**, con una cola corta en memoria.

Póngalo en una red desde la que **no** se alcance nada interno, y no lo publique sin https.

## Pruebas

La lógica que no necesita navegador (reglas de clic, direcciones, proxy, robots.txt, armado del HTML, el servicio HTTP) se prueba desde la raíz del repositorio:

```bash
npx vitest run tests/navegador
```

Esas pruebas no abren Chromium. La parte que sí (`src/leer.js`) hay que probarla a mano, con el servicio arrancado, contra una página real.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/servidor.js` | El servicio HTTP: clave, cola, respuestas, registro. |
| `src/leer.js` | Abre la página con Playwright, pulsa y lee. El único que necesita el navegador. |
| `src/clics.js` | Qué se puede pulsar. Función pura, sin dependencias. |
| `src/en-pagina.js` | Lo que corre dentro de la página: leer sus bloques y describir sus controles. |
| `src/bloques.js` | Junta las lecturas y arma el HTML que se devuelve. |
| `src/red.js` | Qué direcciones se pueden abrir, la resolución segura y el proxy. |
| `src/robots.js` | Leer y entender robots.txt. |
| `src/cola.js` | Un pedido a la vez. |

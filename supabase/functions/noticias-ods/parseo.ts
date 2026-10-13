/* Lectura de las páginas de udes.edu.co (Joomla K2). Sin Deno ni red: la usan la función y las pruebas. */

/** Las noticias de un listado: rutas /seccion/noticias/alias, sin repetir. */
export function enlacesDelListado(html: string): string[] {
  const vistos = new Set<string>();
  for (const m of html.matchAll(/href="(\/[a-z0-9-]+\/noticias\/([a-z0-9-]+))"/g)) {
    if (m[2] === "content") continue;
    vistos.add(m[1]);
  }
  return [...vistos];
}

/** El objeto JSON que Joomla K2 deja en la página de cada nota (consola de depuración). */
export function leerK2(html: string): Record<string, unknown> | null {
  const marca = 'K2 Debug $this->item:",';
  const i = html.indexOf(marca);
  if (i < 0) return null;
  let j = i + marca.length;
  if (html[j] !== "{") return null;
  let nivel = 0;
  let enCadena = false;
  let escape = false;
  const ini = j;
  for (; j < html.length; j++) {
    const c = html[j];
    if (enCadena) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) {
      try {
        return JSON.parse(html.slice(ini, j + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

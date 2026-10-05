/* =============================================================================
   Navegador de Mr. Pilo · de lo leído al HTML que se devuelve.

   La página se lee varias veces: al abrirla y después de cada clic. Aquí se
   juntan esas lecturas en una sola lista de bloques y se arma con ella un
   HTML sencillo (títulos, párrafos y elementos de lista dentro de <main>),
   que es justo lo que la función pilo-ia ya sabe volver pasajes. Sin
   dependencias y sin navegador: se prueba en tests/navegador.

   Por qué bloques y no el HTML de la página: una pestaña o una paginación
   pueden REEMPLAZAR lo que había; el HTML final solo tendría lo último. Con
   bloques, lo que aparece en cada lectura se suma en su sitio y nada se pierde.
   ========================================================================== */

const llave = (t) => String(t ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Cada bloque con su llave: su texto y cuántas veces había salido ya en ESA lectura. Así dos bloques iguales no se confunden. */
function conLlaves(bloques) {
  const veces = new Map();
  return bloques.map((b) => {
    const base = `${/^h[1-6]$/.test(b.tag) ? "h" : "p"}|${llave(b.t)}`;
    const n = veces.get(base) ?? 0;
    veces.set(base, n + 1);
    return { b, k: `${base}|${n}` };
  });
}

/**
 * Suma una lectura nueva a lo acumulado. Lo que ya se conocía se queda donde
 * estaba; lo nuevo entra justo después del último bloque conocido que lo
 * precede en la lectura nueva (así el contenido de una pestaña queda junto a
 * sus pestañas, no al final). Devuelve la lista y cuántos caracteres sumó.
 */
export function fusionar(acumulado, nuevos) {
  const viejo = conLlaves(Array.isArray(acumulado) ? acumulado : []);
  const nuevo = conLlaves(Array.isArray(nuevos) ? nuevos : []);
  const donde = new Map(viejo.map((x, i) => [x.k, i]));
  const out = [];
  let pos = 0;
  let added = 0;
  for (const { b, k } of nuevo) {
    const i = donde.get(k);
    if (i === undefined) {
      out.push({ tag: b.tag, t: b.t });
      added += String(b.t).length;
      continue;
    }
    // Conocido: se copia lo viejo hasta él. Si ya pasó (cambió de orden), no se repite.
    for (; pos <= i; pos++) out.push(viejo[pos].b);
  }
  for (; pos < viejo.length; pos++) out.push(viejo[pos].b);
  return { blocks: out, added };
}

/** Sin párrafos repetidos: la copia oculta de algo visible, la plantilla de un carrusel. Los títulos y lo corto no se tocan. */
export function sinRepetidos(bloques, min = 80) {
  const dichos = new Set();
  return bloques.filter((b) => {
    if (/^h[1-6]$/.test(b.tag) || String(b.t).length < min) return true;
    const k = llave(b.t);
    if (dichos.has(k)) return false;
    dichos.add(k);
    return true;
  });
}

const escapar = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li"]);

/**
 * El HTML que se devuelve: solo texto dentro de etiquetas sencillas, ya sin
 * nada que ejecutar. Se corta al llegar a `maxBytes` (y lo dice con `cut`).
 */
export function armarHtml(titulo, bloques, maxBytes = 2_000_000) {
  const head = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(String(titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 300))}</title></head><body><main>\n`;
  const tail = "</main></body></html>";
  let size = Buffer.byteLength(head) + Buffer.byteLength(tail);
  let cut = false;
  const parts = [];
  for (const b of sinRepetidos(Array.isArray(bloques) ? bloques : [])) {
    const tag = TAGS.has(b.tag) ? b.tag : "p";
    const text = String(b.t ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const line = `<${tag}>${escapar(text)}</${tag}>\n`;
    const bytes = Buffer.byteLength(line);
    if (size + bytes > maxBytes) {
      cut = true;
      break;
    }
    size += bytes;
    parts.push(line);
  }
  return { html: head + parts.join("") + tail, cut, blocks: parts.length };
}

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

/* ---------- Imágenes de una nota (0146) ------------------------------------- */

export interface ImagenNota {
  url: string;
  width: number | null;
  height: number | null;
  caption: string;
  credit: string;
  pos: number;
  is_cover: boolean;
  kind: "foto" | "grafica";
  alt: string;
}

const ENTIDADES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&#039;": "'", "&aacute;": "á", "&eacute;": "é", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú", "&ntilde;": "ñ", "&Aacute;": "Á", "&Eacute;": "É", "&Iacute;": "Í", "&Oacute;": "Ó", "&Uacute;": "Ú", "&Ntilde;": "Ñ" };
const textoPlano = (html: string) =>
  String(html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z]+;|&#0?39;/g, (e) => ENTIDADES[e] ?? e)
    .replace(/\s+/g, " ")
    .trim();

const atributo = (tag: string, nombre: string): string | null => {
  const m = tag.match(new RegExp(`\\s${nombre}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
};
const entero = (v: string | null): number | null => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Logos, íconos, menús y separadores: no son fotos de la nota. */
const ES_ADORNO = /\/images\/(?:logo|logos|megamenu|iconos?|icons?)\b|(?:^|[\/_-])(?:logo|icon|icono|favicon|sprite|spacer|pixel|blank)[\w-]*\.(?:png|gif|svg|jpe?g|webp)|\.svg(?:\?|$)|^data:/i;
/** Piezas con texto: afiches, banners, convocatorias. */
const ES_GRAFICA = /afiche|banner|flyer|convocatoria|inscripci|pieza|poster|invitaci/i;

/** El crédito que dice un texto («Foto: …», «Fotografía: …», «Crédito: …»), o "". */
export function creditoEn(texto: string): string {
  const m = textoPlano(texto).match(/(?<![\p{L}])(?:Fotos?|Fotografías?|Crédito(?: foto)?|Cortesía)\s*:\s*([^|.\n;]{2,80})/iu);
  return m ? m[1].trim().replace(/[,"']+$/, "").trim() : "";
}

/** Absoluta y https, o null. */
export function urlAbsoluta(src: string, host: string): string | null {
  try {
    const limpio = src.trim().replace(/&amp;/g, "&");
    if (!limpio || /^data:/i.test(limpio)) return null;
    const u = new URL(limpio, `https://${host}/`);
    if (u.protocol === "http:" && /(^|\.)udes\.edu\.co$/.test(u.hostname)) u.protocol = "https:";
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** El ancho y alto de la imagen de Open Graph (la portada), si la página los dice. */
export function tamanoOg(html: string): { width: number | null; height: number | null } {
  return {
    width: entero(html.match(/<meta property="og:image:width" content="(\d+)"/)?.[1] ?? null),
    height: entero(html.match(/<meta property="og:image:height" content="(\d+)"/)?.[1] ?? null),
  };
}

/**
 * Las imágenes de una nota de K2: la portada (imageXLarge, con su pie y crédito
 * de K2) y las <img> del texto (introtext y fulltext), en orden. Descarta
 * logos, íconos, rutas /images/logo|megamenu, imágenes de menos de 24 px y lo
 * que no sea https. El pie «Foto: …» que sigue a una imagen es su crédito.
 */
export function imagenesDeK2(k2: Record<string, unknown>, host: string, og: { width: number | null; height: number | null } = { width: null, height: null }): ImagenNota[] {
  const out: ImagenNota[] = [];
  const vistas = new Set<string>();
  const titulo = textoPlano(String(k2.title ?? ""));
  const agregar = (img: Omit<ImagenNota, "pos">) => {
    const clave = img.url.replace(/\?.*$/, "");
    if (vistas.has(clave)) return;
    vistas.add(clave);
    out.push({ ...img, pos: out.length });
  };

  const portada = typeof k2.imageXLarge === "string" && k2.imageXLarge ? urlAbsoluta(k2.imageXLarge, host) : null;
  if (portada && !ES_ADORNO.test(portada)) {
    const credito = textoPlano(String(k2.image_credits ?? ""));
    agregar({
      url: portada,
      width: og.width,
      height: og.height,
      // K2 repite el título como pie cuando nadie escribió uno: eso no es un pie.
      caption: textoPlano(String(k2.image_caption ?? "")) === titulo ? "" : textoPlano(String(k2.image_caption ?? "")),
      credit: credito,
      is_cover: true,
      kind: ES_GRAFICA.test(titulo) ? "grafica" : "foto",
      alt: "",
    });
  }

  const html = `${String(k2.introtext ?? "")} ${String(k2.fulltext ?? "")}`;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = atributo(tag, "src") ?? atributo(tag, "data-src");
    const url = src ? urlAbsoluta(src, host) : null;
    if (!url || ES_ADORNO.test(url)) continue;
    const estilo = atributo(tag, "style") ?? "";
    const width = entero(atributo(tag, "width")) ?? entero(estilo.match(/width:\s*(\d+)px/i)?.[1] ?? null);
    const height = entero(atributo(tag, "height")) ?? entero(estilo.match(/height:\s*(\d+)px/i)?.[1] ?? null);
    if ((width !== null && width < 24) || (height !== null && height < 24)) continue;
    const alt = textoPlano(atributo(tag, "alt") ?? "");
    // Un alt que es el nombre del archivo no describe nada.
    const altUtil = /\.(jpe?g|png|webp|gif)$/i.test(alt) || /^[\w.-]+$/.test(alt) ? "" : alt;
    // El primer párrafo con texto después de la imagen (sin pasar a la siguiente imagen).
    const siguiente = html.slice((m.index ?? 0) + tag.length, (m.index ?? 0) + tag.length + 600).split(/<img\b/i)[0];
    const despues = (siguiente.split(/<\/p>|<br\s*\/?>|<\/div>|<\/figcaption>/i).map(textoPlano).find(Boolean) ?? "").slice(0, 200);
    const credito = /^(?:Fotos?|Fotografías?|Crédito|Cortesía)\s*:/i.test(despues) ? creditoEn(despues) : "";
    const pie = /^(?:Fotos?|Fotografías?)\s*:/i.test(despues) ? "" : (despues.match(/^[^.]{10,160}\.\s*(?:Fotos?|Fotografías?)\s*:/i)?.[0].replace(/\s*(?:Fotos?|Fotografías?)\s*:$/i, "") ?? "");
    agregar({
      url,
      width,
      height,
      caption: pie,
      credit: credito,
      is_cover: false,
      kind: ES_GRAFICA.test(`${src} ${alt}`) ? "grafica" : "foto",
      alt: altUtil,
    });
  }
  return out;
}

#!/usr/bin/env node
/* =============================================================================
   Importa el INFORME 2025 de los ODS (repositorio público
   jogutierrezc/sdgudes.github.io) al modelo nuevo de informes por ODS (0145).

     node scripts/import-informe-2025.mjs [carpeta-del-repo]

   Lee los 17 odsN_informe.html (bilingües: pares `.lang-es`/`.lang-en` o
   `data-lang="es|en"`), los recorre con jsdom y escribe:

     supabase/seed/informe-2025.json               lo parseado, versionado
     supabase/migrations/0147_informe_2025_importado.sql
                                                   informes, bloques, elecciones
                                                   del ODS 13 y el archivo fiel
                                                   (JSON completo + HTML original)

   Cómo se lee cada informe
     · Se arman dos vistas del documento: la española (sin lo marcado «en») y la
       inglesa (sin lo marcado «es»). Cada vista se recorre en orden y da una
       lista de piezas (título, párrafo, ítem de lista, cifra, video, enlace,
       imagen, gráfico). Las dos listas se alinean por tipo: así cada pieza
       queda como par {es, en} aunque el HTML marque el idioma en el párrafo o
       en un contenedor entero.
     · Se ignora la navegación, las 17 tarjetas de ODS, el selector de idioma,
       la portada animada, el pie, estilos y scripts.

   Regla de los bloques (igual para los 17)
     · tesis      los párrafos de la portada (hero). Si la portada no tiene
                  párrafo, el primer párrafo del informe.
     · cifras     un solo bloque: la frase que presenta las cifras (el párrafo
                  que las antecede si termina en «:»; si no, el título de su
                  sección) y en figs TODAS las cifras destacadas, sin repetir.
     · hicimos    cada párrafo narrativo. El título más cercano (de sección o de
                  tarjeta) encabeza el PRIMER párrafo que le sigue como
                  «Título. Texto…»; los demás párrafos van solos. Una lista va en
                  un solo bloque (con el párrafo que la presenta si termina en «:»).
     · proyectos  lo mismo, cuando el título de la tarjeta nombra un proyecto,
                  programa, modelo, diplomado, centro, instituto o semillero, o
                  la sección se llama «Proyectos»; y las tarjetas de video.
     · viene      lo que cuelga de un título de futuro («Visión de Futuro»,
                  «Próximos pasos»…).
   Videos, enlaces, noticias, imágenes, gráficos y todo el detalle van completos
   al archivo (ods_report_archive.parsed). Nada se inventa: lo que un ODS no
   tiene se omite y queda anotado en `rarezas`.

   El resultado no depende de la hora: correr dos veces da los mismos archivos.
   ========================================================================== */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POR_DEFECTO =
  "C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-Documents-Planeaci-n-Desarrollos-2026-PDI/06f4b705-0bfd-422f-b95f-89d07140cb1e/scratchpad/sdg";
export const EDICION = 2025;
export const FUENTE = "sdgudes.github.io";
export const REPO = "jogutierrezc/sdgudes.github.io";
export const SEED = "supabase/seed/informe-2025.json";
export const MIGRACION = "supabase/migrations/0147_informe_2025_importado.sql";
const TOPE_SQL = 3 * 1024 * 1024;

/* --- Texto limpio ------------------------------------------------------------------ */

const PICTO = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D\u20E3▶►→←↗✓✔✕✖•·]/gu;

/** Espacios normales, sin dobles, sin espacios de ancho cero. */
export function limpio(s) {
  return String(s ?? "")
    .replace(/[\u200B\u200C\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/([(¿¡])\s+/g, "$1")
    .trim();
}

/** Un título: sin emoji ni numeración decorativa («1.», «A.»), sin «:» final. */
function titulo(s) {
  return limpio(String(s).replace(PICTO, " "))
    .replace(/^([0-9]{1,2}|[A-Z])\.\s+/, "")
    .replace(/\s*:$/, "");
}

/** Un párrafo: sin emoji decorativo al inicio. */
function parrafo(s) {
  s = String(s).replace(/\s\[[A-Z]{1,4}\](?=[\s.,;:]|$)/g, ""); // marcas de cita sueltas («(UDES) [HC].»)
  return limpio(String(s).replace(/^[\s\p{Extended_Pictographic}\uFE0F\u200D▶►→•·]+/u, ""));
}

const conPunto = (s) => (/[.!?:;…]$/.test(s) || /[.!?]["”»)]$/.test(s) ? s : `${s}.`);

/** Cifras al uso español en el texto en español: 16,030 → 16.030; 20.09% → 20,09 %. */
export function numerosEs(s) {
  return s
    .replace(/(?<![\d.,])(\d{1,3})((?:,\d{3})+)(?![\d]|[.,]\d)/g, (_, a, b) => a + b.replace(/,/g, "."))
    .replace(/(?<![\d.,])(\d+)\.(\d{1,2})\s?%/g, "$1,$2 %")
    .replace(/≈0\.(\d+)/g, "≈0,$1");
}

/** Valor de una cifra en español y en inglés. */
export function valorCifra(v) {
  let es = limpio(v);
  let en = es;
  // Unidades en mayúsculas sostenidas (KG, AÑOS) son estilo, no texto.
  es = es.replace(/\b(\p{Lu}{2,})\b/gu, (m) => (/^(UDES|EIP|IPE|QS|THE|STEM|ODS|SDG|MIUDES|VIRTUDES|COP\d*)$/.test(m) ? m : m.toLowerCase()));
  en = es;
  const entero = /^(\d+)(\D.*)?$/.exec(es);
  if (/^\d{1,3}(,\d{3})+/.test(es)) {
    es = es.replace(/^(\d{1,3}(?:,\d{3})+)/, (m) => m.replace(/,/g, "."));
  } else if (/^\d{1,3}(\.\d{3})+/.test(es)) {
    en = en.replace(/^(\d{1,3}(?:\.\d{3})+)/, (m) => m.replace(/\./g, ","));
  } else if (entero && entero[1].length >= 4 && !(Number(entero[1]) >= 1900 && Number(entero[1]) <= 2100)) {
    es = es.replace(/^\d+/, (m) => Number(m).toLocaleString("es-CO").replace(/,/g, "."));
    en = en.replace(/^\d+/, (m) => Number(m).toLocaleString("en-US"));
  }
  es = es.replace(/(\d)\.(\d{1,2})\s?%/g, "$1,$2 %").replace(/(\d)\s?%/g, "$1 %");
  en = en.replace(/(\d)\s+%/g, "$1%");
  return { es: limpio(es), en: limpio(en) };
}

/* --- Leer un documento --------------------------------------------------------------- */

const EN_LINEA = new Set(["A", "ABBR", "B", "BDI", "BDO", "BR", "CITE", "CODE", "EM", "I", "MARK", "Q", "S", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U", "TIME", "WBR"]);
const RUIDO = [
  "script", "style", "link", "meta", "template", "svg",
  ".sdg-navbar", ".sdg-card", "nav", ".lang-switch", "[data-lang-btn]", "#intro-overlay",
  ".video-modal", "footer", ".section-rule", ".eyebrow", ".play-overlay", ".news-badge",
];
const TITULOS_CLASE = /\b(section-title|accent-title|subsection-title|card-title)\b/;
const TARJETA_CIFRA = /\b(stat|card|capsule|uds-card|kpi)\b/;
const VALOR = ".value, .uds-number, .kpi-number";
const ICONO = ".uds-icon, .icon";
const NUM = /^[+~≈]?\d[\d.,]*\s*(%|\+|[a-zA-ZáéíóúÁÉÍÓÚñÑ]{0,12})?(\s*\(\d+\s*%\))?$/;

const idiomaDe = (el) => {
  const d = el.getAttribute?.("data-lang");
  if (d === "es" || d === "en") return d;
  if (el.classList?.contains("lang-es")) return "es";
  if (el.classList?.contains("lang-en")) return "en";
  return "";
};

/** Texto de un nodo con un espacio entre elementos (para «4.758 KG», «50 %»). */
function textoEspaciado(el) {
  let s = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.textContent;
    else if (n.nodeType === 1) s += (EN_LINEA.has(n.tagName) && n.tagName !== "SMALL" && n.tagName !== "SPAN" ? "" : " ") + textoEspaciado(n) + " ";
  }
  return s;
}

/** Texto de un bloque en línea (párrafo): el textContent, con <br> como espacio. */
function textoEnLinea(el) {
  let s = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.textContent;
    else if (n.nodeType === 1) s += n.tagName === "BR" ? " " : textoEnLinea(n);
  }
  return s;
}

const esHoja = (el) => [...el.children].every((c) => EN_LINEA.has(c.tagName) && esHoja(c));
const enlacesDe = (el) =>
  [...el.querySelectorAll("a[href]")].map((a) => ({ href: a.getAttribute("href"), texto: limpio(a.textContent) })).filter((a) => a.href && !a.href.startsWith("#"));

function hojas(el, fuera = []) {
  const out = [];
  const ir = (n) => {
    if (fuera.includes(n)) return;
    if (n.tagName === "IMG") return;
    if (esHoja(n)) {
      const t = limpio(textoEnLinea(n));
      if (t) out.push(t);
      return;
    }
    for (const c of n.children) ir(c);
  };
  for (const c of el.children) ir(c);
  return out;
}

function tipoImagen(src) {
  if (/sdgbook\.com/.test(src)) return "ilustracion-ods";
  if (/placehold|placeholder/.test(src)) return "marcador";
  if (/img\.youtube\.com/.test(src)) return "miniatura-video";
  if (/tableau/.test(src)) return "grafico";
  if (/sello|logo/i.test(src)) return "logo";
  if (/udes\.edu\.co\/media\/k2/.test(src)) return "foto-noticia-udes";
  if (/udes\.edu\.co/.test(src)) return "imagen-udes";
  return "otra";
}

/** Recorre una vista y devuelve las piezas en orden. */
function piezas(raiz) {
  const out = [];
  const ir = (el, zona) => {
    if (el.nodeType !== 1) return;
    const cls = typeof el.className === "string" ? el.className : "";
    if (el.classList.contains("hero")) zona = "portada";
    const tag = el.tagName;

    if (cls.includes("tableauPlaceholder")) {
      const nombre = el.querySelector('param[name="name"]')?.getAttribute("value") ?? "";
      const img = el.querySelector("noscript img")?.getAttribute("src") ?? (/src=['"]([^'"]+)['"]/.exec(el.innerHTML)?.[1] ?? "");
      out.push({ t: "grafico", zona, proveedor: "tableau", nombre, imagen: img });
      return;
    }
    if (["NOSCRIPT", "OBJECT", "PARAM", "IFRAME"].includes(tag)) return;

    if (el.classList.contains("video-card")) {
      const id = el.querySelector("[data-video-id]")?.getAttribute("data-video-id") ?? "";
      const [tit = "", ...resto] = hojas(el);
      out.push({ t: "video", zona, id, url: id ? `https://www.youtube.com/watch?v=${id}` : "", titulo: titulo(tit), texto: parrafo(resto.join(" ")) });
      return;
    }

    if (tag === "A" && el.getAttribute("href") && !esHoja(el)) {
      const href = el.getAttribute("href");
      const img = el.querySelector("img")?.getAttribute("src") ?? "";
      const textos = hojas(el).map((t) => parrafo(t.replace(PICTO, " "))).filter(Boolean);
      const yt = /youtube\.com\/watch\?v=([\w-]+)|youtu\.be\/([\w-]+)/.exec(href);
      out.push({
        t: yt ? "video" : "enlace",
        zona,
        ...(yt ? { id: yt[1] ?? yt[2], url: href, titulo: textos[0] ?? "", texto: textos.slice(1).join(" ") } : { href, textos, clase: cls.trim() }),
        imagen: img,
      });
      return;
    }

    if (TARJETA_CIFRA.test(cls) && !/\b(video-card|news-card|sdg-card)\b/.test(cls) && tag !== "A") {
      const valorEl = el.querySelector(VALOR);
      const iconos = [...el.querySelectorAll(ICONO)];
      const textos = hojas(el, [valorEl, ...iconos].filter(Boolean));
      let v = "";
      if (valorEl) {
        // «+250<br><small>IV Feria…</small>»: lo que va tras el salto es una nota, no la unidad.
        const copia = valorEl.cloneNode(true);
        const tras = [];
        let salto = false;
        for (const n of [...copia.childNodes]) {
          if (n.nodeType === 1 && n.tagName === "BR") salto = true;
          if (salto) {
            const t = limpio(n.textContent);
            if (t) tras.push(t);
            n.remove();
          }
        }
        v = limpio(textoEspaciado(copia)).replace(/\s+\+$/, "+");
        if (tras.length) textos.push(...tras);
      }
      const destino = valorEl?.getAttribute("data-target") ?? valorEl?.querySelector("[data-target]")?.getAttribute("data-target");
      let relleno = false;
      if (valorEl && /^0$/.test(v) && destino) {
        v = destino;
        relleno = valorEl.hasAttribute("data-counter");
      }
      if (!valorEl && textos.length >= 2 && NUM.test(textos[0]) && textos[0].length <= 16) v = textos.shift();
      if (v) {
        out.push({ t: "cifra", zona, v, etiqueta: textos[0] ?? "", nota: textos.slice(1).join(" "), contador: relleno, numerica: /\d/.test(v) });
        return;
      }
    }

    const nivel = /^H([1-6])$/.exec(tag)?.[1];
    if ((nivel || TITULOS_CLASE.test(cls)) && esHoja(el)) {
      const t = titulo(textoEnLinea(el));
      if (t) out.push({ t: "titulo", zona, nivel: nivel ? Number(nivel) : cls.includes("card-title") ? 4 : 3, texto: t });
      return;
    }

    if (tag === "IMG") {
      const src = el.getAttribute("src") ?? "";
      const pie = el.closest("figure")?.querySelector("figcaption");
      out.push({ t: "imagen", zona, src, alt: limpio(el.getAttribute("alt")), pie: pie ? limpio(pie.textContent) : "", tipo: tipoImagen(src) });
      return;
    }
    if (tag === "FIGCAPTION") return;

    if (esHoja(el)) {
      const t = parrafo(textoEnLinea(el));
      if (!t) return;
      const enlaces = enlacesDe(el);
      // Un renglón hecho solo de enlaces (botones, «Ver todas las noticias»): son enlaces, no un párrafo.
      const sinEnlaces = el.cloneNode(true);
      for (const a of sinEnlaces.querySelectorAll("a")) a.remove();
      if (tag !== "A" && enlaces.length && !limpio(sinEnlaces.textContent).replace(PICTO, "").trim()) {
        for (const a of el.querySelectorAll("a[href]"))
          out.push({ t: "enlace", zona, href: a.getAttribute("href"), textos: [parrafo(limpio(a.textContent).replace(PICTO, " "))].filter(Boolean), clase: (a.className || "").trim(), imagen: "" });
        return;
      }
      if (tag === "A") {
        out.push({ t: "enlace", zona, href: el.getAttribute("href") ?? "", textos: [parrafo(t.replace(PICTO, " "))], clase: cls.trim(), imagen: "" });
        return;
      }
      out.push({ t: tag === "LI" ? "item" : "parrafo", zona, texto: t, ...(enlaces.length ? { enlaces } : {}) });
      return;
    }
    for (const c of el.children) ir(c, zona);
  };
  ir(raiz, "cuerpo");
  return out;
}

function vista(html, idioma) {
  const { document } = new JSDOM(html).window;
  for (const sel of RUIDO) for (const n of document.querySelectorAll(sel)) n.remove();
  const otro = idioma === "es" ? "en" : "es";
  for (const n of [...document.querySelectorAll("[data-lang], .lang-es, .lang-en")]) if (idiomaDe(n) === otro) n.remove();
  return { document, piezas: piezas(document.body) };
}

/* --- Alinear las dos vistas -------------------------------------------------------------- */

const clave = (p) => (p.t === "titulo" ? `titulo${p.nivel <= 2 ? p.nivel : 3}` : p.t);

/** Lo que no cambia al traducir: cifras, nombres propios, siglas, lo citado. */
function marcas(p) {
  const t = [p.texto, p.v, p.etiqueta, p.nota, p.titulo, p.href, ...(p.textos ?? [])].filter((x) => typeof x === "string").join(" ");
  const nums = (t.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));
  const nombres = (t.match(/\b[A-ZÁÉÍÓÚÑ][\wáéíóúñü-]{3,}\b/g) ?? []).filter((w) => !/^(Este|Esta|Estos|Nuestr\w*|Como|Para|Desde|Through|This|These|Their|With|From|Como|Además|También|Also|Universidad|University)$/.test(w));
  return { set: new Set([...nums, ...nombres.map((w) => w.toLowerCase())]), largo: t.length };
}

function parecido(a, b) {
  if (a.t === "cifra") return a.v === b.v ? 1 : 0;
  if (a.t === "enlace" || a.t === "video") return (a.href ?? a.id) === (b.href ?? b.id) ? 1 : 0;
  if (a.t === "imagen") return a.src === b.src ? 1 : 0;
  const x = marcas(a);
  const y = marcas(b);
  const comunes = [...x.set].filter((k) => y.set.has(k)).length;
  const union = new Set([...x.set, ...y.set]).size || 1;
  const razon = Math.min(x.largo, y.largo) / Math.max(x.largo, y.largo, 1);
  return 0.6 * (comunes / union) + 0.4 * razon;
}

/** Alineación de las dos vistas (Needleman-Wunsch): solo se emparejan piezas del
 *  mismo tipo, y entre ellas las que se parecen (cifras, nombres, largo). */
function alinear(a, b) {
  const n = a.length;
  const m = b.length;
  const HUECO = -1;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n - 1; i >= 0; i--) dp[i][m] = dp[i + 1][m] + HUECO;
  for (let j = m - 1; j >= 0; j--) dp[n][j] = dp[n][j + 1] + HUECO;
  const par = (i, j) => (clave(a[i]) === clave(b[j]) ? 1 + 3 * parecido(a[i], b[j]) : -Infinity);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = Math.max(dp[i + 1][j + 1] + par(i, j), dp[i + 1][j] + HUECO, dp[i][j + 1] + HUECO);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && dp[i][j] === dp[i + 1][j + 1] + par(i, j)) out.push([a[i++], b[j++]]);
    else if (i < n && (j >= m || dp[i][j] === dp[i + 1][j] + HUECO)) out.push([a[i++], null]);
    else out.push([null, b[j++]]);
  }
  return out;
}

/** Por sección (h2): 1) si quedó exactamente una pieza solo-es y una solo-en del
 *  mismo tipo, son el mismo texto separado por algo compartido (cápsulas sin
 *  idioma) y se emparejan; 2) si quedan 3 o más sueltas, el inglés de esa sección
 *  no es la traducción del español (p. ej. una sección copiada de otro ODS): se
 *  deshacen los pares y cada idioma queda solo (el inglés, en el archivo). */
function revisarSecciones(alineados, rarezas) {
  const esH2 = ([a, b]) => (a ?? b).t === "titulo" && (a ?? b).nivel === 2;
  const tramos = [];
  let tramo = [];
  for (const x of alineados) {
    if (esH2(x) && tramo.length) {
      tramos.push(tramo);
      tramo = [];
    }
    tramo.push(x);
  }
  if (tramo.length) tramos.push(tramo);
  const out = [];
  for (let t of tramos) {
    const sueltosEs = t.filter(([a, b]) => a && !b);
    const sueltosEn = t.filter(([a, b]) => !a && b);
    for (const k of new Set(sueltosEs.map(([a]) => clave(a)))) {
      const es = sueltosEs.filter(([a]) => clave(a) === k);
      const en = sueltosEn.filter(([, b]) => clave(b) === k);
      if (es.length === 1 && en.length === 1) {
        es[0][1] = en[0][1];
        t = t.filter((x) => x !== en[0]);
      }
    }
    const sueltos = t.filter(([a, b]) => !a || !b).length;
    const h2 = esH2(t[0]) ? (t[0][0] ?? t[0][1]) : null;
    if (sueltos >= 3) {
      rarezas.push(
        `Sección «${h2 ? limpio(h2.texto) : "(sin título)"}»: ${sueltos} piezas sin par; el inglés no corresponde al español (parece copiado de otro informe). Se usa solo el español y el inglés queda en el archivo.`,
      );
      const nuevo = [];
      for (const x of t) {
        if (x[0] && x[1] && !esH2(x)) nuevo.push([{ ...x[0], en_ajeno: true }, null], [null, { ...x[1], descartado: true }]);
        else nuevo.push(x);
      }
      t = nuevo;
    }
    out.push(...t);
  }
  return out;
}

/** Un par {es, en} de cualquier pieza. */
function par(es, en) {
  const base = es ?? en;
  const t = base.t === "item" || base.t === "parrafo" ? base.t : base.t;
  const pick = (p, k) => (p ? p[k] : undefined);
  const bi = (k, fn = (x) => x) => {
    const a = pick(es, k);
    const b = pick(en, k);
    return { es: a === undefined ? "" : fn(a), en: b === undefined ? "" : fn(b) };
  };
  const rarezas = [];
  if (!es) rarezas.push("solo-en");
  if (!en) rarezas.push("solo-es");
  const comun = { t, zona: base.zona, ...(rarezas.length ? { falta: rarezas[0] === "solo-en" ? "es" : "en" } : {}), ...(en?.descartado || es?.en_ajeno ? { en_no_corresponde: true } : {}) };
  switch (base.t) {
    case "titulo":
      return { ...comun, nivel: base.nivel, texto: bi("texto") };
    case "parrafo":
    case "item": {
      const enlaces = [...(es?.enlaces ?? []), ...(en?.enlaces ?? [])];
      const uniq = [...new Map(enlaces.map((e) => [e.href, e])).values()];
      return { ...comun, t: es?.t ?? en.t, texto: bi("texto"), ...(uniq.length ? { enlaces: uniq } : {}) };
    }
    case "cifra":
      return { ...comun, v: base.v, etiqueta: bi("etiqueta"), nota: bi("nota"), contador: base.contador, numerica: base.numerica };
    case "video":
      return { ...comun, id: base.id, url: base.url, titulo: bi("titulo"), texto: bi("texto"), imagen: base.imagen ?? "" };
    case "enlace":
      return { ...comun, href: base.href, texto: bi("textos", (x) => x.join(" · ")), clase: base.clase, imagen: base.imagen };
    case "imagen":
      return { ...comun, src: base.src, alt: bi("alt"), pie: bi("pie"), tipo: base.tipo };
    case "grafico":
      return { ...comun, proveedor: base.proveedor, nombre: base.nombre, imagen: base.imagen };
    default:
      return { ...comun };
  }
}

/* --- Del informe a los bloques ------------------------------------------------------------ */

const PROYECTO = /\b(proyectos?|projects?|programas?|programs?|programmes?|iniciativas?|initiatives?|diplomados?|diplomas?|modelo|model|centros?|centers?|centres?|institutos?|institutes?|semilleros?|seedbeds?)\b/i;
const SECCION_PROYECTOS = /\b(proyectos|projects|iniciativas|initiatives)\b/i;
const VIENE = /(visi[oó]n de futuro|future vision|pr[oó]xim[oa]s? pasos|next steps|lo que viene|what comes next|hacia la pr[oó]xima|towards the next)/i;

const bi = (es, en) => ({ es, en });

/** Los ODS cuyo informe 2025 se publica de una vez: contenido y cifras reales verificados. */
export const PUBLICADOS = [4, 13];
export const AVISO_REPETIDO = "Texto repetido de otro ODS en el informe 2025: revisar antes de usar.";
export const AVISO_EN_AJENO = "El inglés de este párrafo en el HTML 2025 era el de otro ODS: falta traducirlo.";
/** Texto comparable entre ODS: sin tildes, mayúsculas, signos ni espacios dobles. */
export const normal = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Arma el informe de un ODS a partir de las piezas alineadas. */
export function armarInforme(ods, archivo, html) {
  const ves = vista(html, "es");
  const ven = vista(html, "en");
  const rarezas = [];
  const pares = revisarSecciones(alinear(ves.piezas, ven.piezas), rarezas).map(([a, b]) => par(a, b));

  // Pares sin traducción o con el mismo texto en los dos idiomas.
  const textoDe = (p) => (p.texto && typeof p.texto === "object" ? p.texto : p.etiqueta ?? null);
  let soloEs = 0;
  let soloEn = 0;
  let iguales = 0;
  for (const p of pares) {
    if (p.falta === "en") soloEs++;
    if (p.falta === "es") soloEn++;
    const t = textoDe(p);
    if (!p.falta && t && t.es && t.es === t.en && /[a-záéíóúñ]{4}/i.test(t.es)) {
      p.sin_traduccion = true;
      iguales++;
    }
  }
  if (soloEs) rarezas.push(`${soloEs} pieza(s) solo en español (sin par en inglés): en el bloque, text_en repite el español.`);
  if (soloEn) rarezas.push(`${soloEn} pieza(s) solo en inglés (sin par en español): quedan solo en el archivo.`);
  if (iguales) rarezas.push(`${iguales} pieza(s) sin marca de idioma: el texto es el mismo en las dos vistas (no hay traducción en el HTML).`);

  // Título, secciones y piezas por sección (para el archivo).
  const h1 = pares.find((p) => p.t === "titulo" && p.nivel === 1);
  const secciones = [];
  let actual = { titulo: bi("", ""), piezas: [] };
  secciones.push(actual);
  for (const p of pares) {
    if (p.t === "titulo" && p.nivel === 2) {
      actual = { titulo: p.texto, piezas: [] };
      secciones.push(actual);
    } else if (!(p.t === "titulo" && p.nivel === 1)) actual.piezas.push(p);
  }
  if (!secciones[0].piezas.length) secciones.shift();

  // Bloques.
  const bloques = [];
  const figs = [];
  const figsSueltas = [];
  let fraseCifras = null;
  let h2 = null;
  let sub = null;
  let pendiente = null;
  let lista = null;
  let ultimoParrafo = null;
  let primerParrafo = null;
  const tesis = [];

  const seccionDe = (titulos, conSubtitulo, esVideo) => {
    const t = titulos.filter(Boolean).map((x) => `${x.es} ${x.en}`).join(" ");
    if (VIENE.test(t)) return "viene";
    if (esVideo) return "proyectos";
    if (conSubtitulo && sub && PROYECTO.test(`${sub.es} ${sub.en}`)) return "proyectos";
    if (conSubtitulo && h2 && SECCION_PROYECTOS.test(`${h2.es} ${h2.en}`)) return "proyectos";
    return "hicimos";
  };
  let dosPuntos = null; // el último bloque que termina en «:» (presenta algo), con su sección
  let ajeno = false; // la pieza en curso tenía un inglés que es de otro ODS
  let encabezado = null; // el título que encabeza el bloque en curso
  const emitir = (texto, sec, cuerpo = texto) => {
    const es = numerosEs(texto.es);
    const b = ajeno
      ? { sec, text: es, text_en: "", en_ajeno: true }
      : { sec, text: es, text_en: texto.en || texto.es, ...(texto.en ? {} : { sin_en: true }) };
    if (encabezado) b.encabezado = encabezado;
    ajeno = false;
    encabezado = null;
    Object.defineProperty(b, "cuerpo", { value: cuerpo, enumerable: false });
    bloques.push(b);
    if (texto.es.endsWith(":")) dosPuntos = { b, h2, texto };
  };
  const prefijo = (cuerpo) => {
    if (!pendiente) return cuerpo;
    const p = pendiente;
    pendiente = null;
    encabezado = p.es;
    return { es: `${conPunto(p.es)} ${cuerpo.es}`, en: cuerpo.en ? `${conPunto(p.en || p.es)} ${cuerpo.en}` : "" };
  };
  const cerrarLista = () => {
    if (!lista) return;
    const items = lista.items;
    const cuerpo = {
      es: [lista.cabeza?.es, ...items.map((i) => conPunto(i.es))].filter(Boolean).join(" "),
      en: items.some((i) => !i.en) || (lista.cabeza && !lista.cabeza.en) ? "" : [lista.cabeza?.en, ...items.map((i) => conPunto(i.en))].filter(Boolean).join(" "),
    };
    const conTitulo = Boolean(pendiente) || lista.conTitulo;
    ajeno = Boolean(lista.ajeno);
    if (cuerpo.es) emitir(prefijo(cuerpo), seccionDe([h2, sub], conTitulo && Boolean(sub) || conTitulo, false));
    lista = null;
  };

  // Secciones-anexo (noticias, evidencias por enlace): su texto presenta la lista
  // de enlaces y va con ella al archivo, no al informe.
  const anexos = new Set();
  for (const s of secciones) {
    const enl = s.piezas.filter((p) => p.t === "enlace" || p.t === "video").length;
    const txt = s.piezas.filter((p) => p.t === "parrafo" || p.t === "item").length;
    if (enl >= 3 && txt <= 2 && /noticias|news|evidencia|evidence/i.test(`${s.titulo.es} ${s.titulo.en}`)) {
      anexos.add(s);
      for (const p of s.piezas) if (p.t === "parrafo" || p.t === "item") p.anexo = true;
    }
  }
  if (anexos.size) rarezas.push(`Secciones de anexo (solo enlaces) que van al archivo y no a los bloques: ${[...anexos].map((s) => `«${s.titulo.es || s.titulo.en}»`).join(", ")}.`);

  for (const p of pares) {
    if (p.anexo) continue;
    if (p.zona === "portada") {
      if ((p.t === "parrafo" || p.t === "item") && p.texto.es) tesis.push(p.texto);
      continue;
    }
    if (p.t === "titulo") {
      cerrarLista();
      if (p.nivel === 1) continue;
      if (!p.texto.es) continue; // título solo en inglés: queda en el archivo.
      if (p.nivel === 2) {
        h2 = p.texto;
        sub = null;
      } else sub = p.texto;
      pendiente = p.texto;
      ultimoParrafo = null;
      continue;
    }
    if (p.t === "parrafo" || p.t === "item") {
      if (!p.texto.es) continue; // solo en inglés: archivo.
      if (!primerParrafo) primerParrafo = p;
      if (p.t === "item") {
        if (!lista) lista = { cabeza: null, items: [], conTitulo: Boolean(pendiente) };
        lista.items.push(p.texto);
        if (p.en_no_corresponde) lista.ajeno = true;
        continue;
      }
      cerrarLista();
      if (p.texto.es.endsWith(":")) {
        // Presenta una lista o unas cifras: se decide con la pieza siguiente.
        lista = { cabeza: p.texto, items: [], conTitulo: Boolean(pendiente), presenta: true, pendiente, ajeno: Boolean(p.en_no_corresponde) };
        ultimoParrafo = p;
        continue;
      }
      if (tesis.length === 0 && bloques.length === 0 && !h2) {
        tesis.push(p.texto);
        pendiente = null;
        continue;
      }
      const conTitulo = Boolean(pendiente);
      ajeno = Boolean(p.en_no_corresponde);
      emitir(prefijo(p.texto), seccionDe([h2, sub], conTitulo || Boolean(sub), false), p.texto);
      ultimoParrafo = p;
      continue;
    }
    if (p.t === "cifra") {
      if (lista?.presenta && lista.items.length === 0) {
        if (!fraseCifras) fraseCifras = lista.cabeza;
        else emitir(prefijo(lista.cabeza), seccionDe([h2, sub], Boolean(sub), false));
        lista = null;
      } else cerrarLista();
      if (!fraseCifras && dosPuntos && dosPuntos.h2 === h2) {
        // «…se refleja en nuestras cifras de 2024:» ya salió como párrafo: pasa a presentar las cifras.
        bloques.splice(bloques.indexOf(dosPuntos.b), 1);
        fraseCifras = dosPuntos.texto;
        dosPuntos = null;
      }
      if (!fraseCifras && pendiente) fraseCifras = { es: conPunto(pendiente.es), en: conPunto(pendiente.en || pendiente.es), deTitulo: true };
      if (!fraseCifras && h2) fraseCifras = { es: conPunto(h2.es), en: conPunto(h2.en || h2.es), deTitulo: true };
      if (!fraseCifras && h1) fraseCifras = { es: conPunto(h1.texto.es), en: conPunto(h1.texto.en || h1.texto.es), deTitulo: true };
      pendiente = null;
      (p.numerica && !p.contador ? figs : figsSueltas).push(p);
      continue;
    }
    if (p.t === "video") {
      cerrarLista();
      if (p.titulo.es || p.texto.es) {
        const cuerpo = p.texto.es ? { es: `${conPunto(p.titulo.es)} ${p.texto.es}`, en: `${conPunto(p.titulo.en || p.titulo.es)} ${p.texto.en}` } : null;
        if (cuerpo && p.texto.es) emitir(cuerpo, seccionDe([h2, sub], true, true));
      }
      continue;
    }
    // enlaces, imágenes y gráficos: al archivo. Una lista abierta se cierra.
    if (lista && lista.items.length === 0 && lista.presenta) {
      emitir(prefijo(lista.cabeza), seccionDe([h2, sub], Boolean(sub), false));
      lista = null;
    } else cerrarLista();
  }
  cerrarLista();
  if (tesis.length === 0) {
    const primero = bloques.find((b) => b.sec === "hicimos" && b.cuerpo.es && !b.cuerpo.es.endsWith(":"));
    if (primero) {
      bloques.splice(bloques.indexOf(primero), 1);
      tesis.push(primero.cuerpo);
      rarezas.push("La portada no tiene texto: la tesis es el primer párrafo del informe (sin su título).");
    } else rarezas.push("No hay párrafo de portada ni párrafo inicial: el informe queda sin tesis.");
  }

  // Cifras: sin repetir (mismo valor y misma etiqueta).
  const vistas = new Set();
  const cifras = [];
  for (const f of figs) {
    const val = valorCifra(f.v);
    const k = `${val.es}|${f.etiqueta.es}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    cifras.push({
      v: val.es,
      label: numerosEs(f.etiqueta.es),
      src: `Informe ${EDICION}`,
      v_en: val.en,
      label_en: f.etiqueta.en || f.etiqueta.es,
      ...(f.nota.es ? { note: numerosEs(f.nota.es), note_en: f.nota.en || f.nota.es } : {}),
    });
  }
  const contadores = figsSueltas.filter((f) => f.contador);
  if (contadores.length)
    rarezas.push(
      `${contadores.length} cifra(s) de plantilla (contador animado desde 0 con data-target: ${contadores.map((f) => `${f.v} «${f.etiqueta.es}»`).join(", ")}). No se importan como cifras; quedan en el archivo.`,
    );
  const noNumericas = figsSueltas.filter((f) => !f.contador);
  if (noNumericas.length)
    rarezas.push(`${noNumericas.length} tarjeta(s) de cifra sin número (${noNumericas.map((f) => `«${f.v}»`).join(", ")}): no van en figs; quedan en el archivo.`);
  if (cifras.length && fraseCifras?.deTitulo) rarezas.push("Las cifras no tienen frase que las presente: el bloque de cifras lleva el título de su sección.");

  const ordenados = [];
  for (const t of tesis) ordenados.push({ sec: "tesis", text: numerosEs(t.es), text_en: t.en || t.es, ...(t.en ? {} : { sin_en: true }) });
  if (cifras.length && fraseCifras) ordenados.push({ sec: "cifras", text: numerosEs(fraseCifras.es), text_en: fraseCifras.en || fraseCifras.es, figs: cifras });
  for (const sec of ["hicimos", "proyectos", "viene"]) for (const b of bloques) if (b.sec === sec) ordenados.push(b);
  ordenados.forEach((b, i) => (b.pos = i + 1));
  const sinEn = ordenados.filter((b) => b.sin_en).length;
  if (sinEn) rarezas.push(`${sinEn} bloque(s) sin inglés en el HTML: text_en repite el español.`);
  const ajenos = ordenados.filter((b) => b.en_ajeno).length;
  if (ajenos) rarezas.push(`${ajenos} bloque(s) con el inglés de otro ODS: text_en queda vacío para traducirlo.`);
  for (const b of ordenados) {
    b.enabled = true;
    b.warn = b.en_ajeno ? AVISO_EN_AJENO : null;
  }

  // Lo que no va en bloques: completo al archivo.
  const de = (t) => pares.filter((p) => p.t === t);
  const imagenes = de("imagen");
  const fotos = imagenes.filter((i) => i.tipo === "foto-noticia-udes" || i.tipo === "imagen-udes");
  const enlaces = de("enlace");
  for (const e of enlaces) if (e.imagen && /udes\.edu\.co/.test(e.imagen)) fotos.push({ src: e.imagen, de: e.href, tipo: tipoImagen(e.imagen) });
  const marcadores = [...imagenes.filter((i) => i.tipo === "marcador"), ...enlaces.filter((e) => /placehold|placeholder/.test(e.imagen))];
  if (marcadores.length) rarezas.push(`${marcadores.length} imagen(es) de relleno (placehold.co / via.placeholder.com) en el HTML.`);

  const conteo = Object.fromEntries(["tesis", "cifras", "hicimos", "proyectos", "viene"].map((s) => [s, ordenados.filter((b) => b.sec === s).length]));
  if (!conteo.viene) rarezas.push("Sin «próximos pasos» en el HTML: el informe no tiene sección «viene».");
  if (!conteo.cifras) rarezas.push("Sin cifras destacadas importables.");

  return {
    ods,
    edicion: EDICION,
    fuente: FUENTE,
    archivo,
    titulo: h1 ? h1.texto : bi("", ""),
    tesis,
    cifras: figs.map((f) => ({ v: f.v, etiqueta: f.etiqueta, nota: f.nota })),
    cifras_no_importadas: figsSueltas.map((f) => ({ v: f.v, etiqueta: f.etiqueta, nota: f.nota, motivo: f.contador ? "contador de plantilla" : "sin número" })),
    videos: de("video").map(({ zona, t, ...v }) => v),
    enlaces: enlaces.map(({ zona, t, ...e }) => e),
    imagenes: imagenes.map(({ zona, t, ...i }) => ({ ...i, zona })),
    fotos_udes: [...new Map(fotos.map((f) => [f.src, { src: f.src, tipo: f.tipo, ...(f.de ? { noticia: f.de } : {}) }])).values()],
    graficos: de("grafico").map(({ zona, t, ...g }) => g),
    secciones,
    bloques: ordenados,
    conteo: { ...conteo, cifras_figs: cifras.length, videos: de("video").length, enlaces: enlaces.length },
    rarezas,
  };
}

/* --- ODS 13: elecciones de evidencia por indicador (ods-data.ts, edición 2025) ------------- */

async function evidenciasOds13() {
  const { build } = await import("esbuild");
  const r = await build({
    entryPoints: [join(RAIZ, "src/modules/sostenible/ods-data.ts")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString("base64")}`);
  return mod.ODS13;
}

/** Una fila de ods_report_indicators por indicador 13.x con las evidencias «ok» (2025). */
export function eleccionesOds13(ODS13, informe13) {
  const videos = new Map(informe13.videos.map((v) => [v.titulo.es.toLowerCase(), v.url]));
  return ODS13.indicators.map((ind) => {
    const ok = ind.evidence.filter((e) => e.status === "ok");
    const linea = (e, k) => limpio(`${e.title[k]} (${e.type[k]} · ${e.source[k]})`);
    return {
      indicator: ind.id,
      nombre: ind.name,
      page_es: ok.map((e) => numerosEs(linea(e, "es"))),
      page_en: ok.map((e) => linea(e, "en")).join("\n"),
      evidencias: ind.evidence.map((e) => {
        const url = [...videos.entries()].find(([t]) => e.title.es.toLowerCase().includes(t.replace(/^.*?\b(estufa|veh[ií]culo)\b.*$/i, "$1")))?.[1];
        return { ...e, ...(url ? { enlace: url } : {}) };
      }),
    };
  });
}

/* --- SQL ---------------------------------------------------------------------------------- */

const DQ_JSON = "$ods_json$";
const DQ_HTML = "$ods_html$";
function dolar(texto, delim) {
  if (texto.includes(delim)) throw new Error(`El delimitador ${delim} aparece en el texto: no se puede citar con seguridad.`);
  return `${delim}${texto}${delim}`;
}

export const estadoDe = (ods) => (PUBLICADOS.includes(ods) ? "publicado" : "revision");
export const ajustesDe = (inf) => ({ tone: "institucional", person: "tercera", legacy: true, source: FUENTE, revision_notas: inf.rarezas });

function sql({ informes, htmls, elecciones, fuente }) {
  const filas = informes.flatMap((inf) =>
    inf.bloques.map((b) => ({ ods: inf.ods, sec: b.sec, pos: b.pos, text: b.text, text_en: b.text_en, figs: b.figs ?? [], enabled: b.enabled, warn: b.warn })),
  );
  const out = [];
  out.push(`-- =============================================================================
-- 0147 · Informe 2025 de los ODS importado al modelo nuevo (0145).
--
-- GENERADO por scripts/import-informe-2025.mjs: no editar a mano. Para
-- rehacerlo: node scripts/import-informe-2025.mjs <carpeta del repositorio>.
--
--   Fuente:  ${fuente.repo} (${fuente.commit}, ${fuente.fecha})
--   ODS:     ${informes.length} (${informes.map((i) => i.ods).join(", ")}), edición ${EDICION}
--   Bloques: ${filas.length} · elecciones de evidencia: ${elecciones.length} (ODS 13)
--
-- Qué hace
--   · ods_report_archive (nueva): la copia fiel de cada ODS, con el JSON
--     parseado completo y el HTML original. Solo Planeación y la
--     administración la leen y la escriben; el público no.
--   · Un informe por ODS (edición ${EDICION}, ajustes legacy con revision_notas):
--     «publicado» solo ${PUBLICADOS.join(" y ")}; los otros en «revision». Bloques en español e
--     inglés (origin «persona»); los repetidos de otro ODS, deshabilitados con
--     aviso; los que traían el inglés de otro ODS, con text_en vacío. Para el
--     ODS 13, las elecciones de evidencia por indicador (sin nota, sin aprobar).
--
-- Idempotente y sin pisar lo editado
--   · El informe se crea solo si no existe (ods, edición). Si ya existía uno
--     que no viene de esta importación, no se toca.
--   · Los bloques se insertan solo si el informe importado aún no tiene
--     ninguno; las elecciones, con on conflict do nothing.
--   · El archivo sí se actualiza (on conflict do update) cuando cambia.
--   · Ningún UPDATE ni DELETE sin WHERE (safeupdate, ver 0095).
-- Requiere 0143, 0145 y 0146 (text_en y orig_en de los bloques).
--   Las fotos no se registran: ods_report_photos exige una nota (news_id); las
--   URL de imágenes quedan en el archivo.
-- =============================================================================

create table if not exists public.ods_report_archive (
  id          uuid primary key default gen_random_uuid(),
  ods         smallint not null,
  edition     int not null,
  source      text not null,
  parsed      jsonb not null default '{}'::jsonb,
  raw_html    text not null default '',
  imported_at timestamptz not null default now(),
  constraint ods_report_archive_ods check (ods between 1 and 17),
  constraint ods_report_archive_edition check (edition between 2020 and 2100),
  constraint ods_report_archive_parsed check (jsonb_typeof(parsed) = 'object'),
  constraint ods_report_archive_unique unique (ods, edition, source)
);

comment on table public.ods_report_archive is
  'Copia fiel de los informes ODS importados (0147): JSON parseado completo y HTML original. Solo Planeación y la administración.';

alter table public.ods_report_archive enable row level security;
drop policy if exists ods_report_archive_planeacion on public.ods_report_archive;
create policy ods_report_archive_planeacion on public.ods_report_archive for all to authenticated
  using (public.has_role_at_least('planeacion')) with check (public.has_role_at_least('planeacion'));
revoke all on public.ods_report_archive from public, anon;
grant select, insert, update, delete on public.ods_report_archive to authenticated;
grant all on public.ods_report_archive to service_role;

-- Los informes ${EDICION} -------------------------------------------------------------------
-- Publicados solo ${PUBLICADOS.join(" y ")}; los demás en «revision» (intranet) hasta que una persona
-- los revise. settings.revision_notas lleva las rarezas del HTML de cada ODS.
insert into public.ods_reports (ods, edition, state, settings)
select x.ods, ${EDICION}, x.state, x.settings
  from jsonb_to_recordset(${dolar(JSON.stringify(informes.map((i) => ({ ods: i.ods, state: estadoDe(i.ods), settings: ajustesDe(i) }))), DQ_JSON)}::jsonb)
       as x(ods smallint, state text, settings jsonb)
on conflict (ods, edition) do nothing;

-- Los bloques: solo en informes de esta importación que aún no tienen ninguno.
insert into public.ods_report_blocks (report_id, sec, pos, origin, text, orig, text_en, orig_en, sources, figs, warn, enabled, spare)
select r.id, b.sec, b.pos, 'persona', b.text, b.text, b.text_en, b.text_en, '[]'::jsonb, b.figs, b.warn, b.enabled, false
  from jsonb_to_recordset(${dolar(JSON.stringify(filas), DQ_JSON)}::jsonb)
       as b(ods smallint, sec text, pos int, text text, text_en text, figs jsonb, enabled boolean, warn text)
  join public.ods_reports r on r.ods = b.ods and r.edition = ${EDICION}
 where r.settings ->> 'source' = '${FUENTE}'
   and not exists (select 1 from public.ods_report_blocks x where x.report_id = r.id);

-- ODS 13: una elección por indicador con la evidencia 2025, sin nota y sin aprobar.
insert into public.ods_report_indicators (report_id, indicator, news_id, candidates, ask, page_es, page_en, approved)
select r.id, e.indicator, null, '[]'::jsonb, '{}'::jsonb, e.page_es, e.page_en, false
  from jsonb_to_recordset(${dolar(JSON.stringify(elecciones.map(({ indicator, page_es, page_en }) => ({ ods: 13, indicator, page_es, page_en }))), DQ_JSON)}::jsonb)
       as e(ods smallint, indicator text, page_es jsonb, page_en text)
  join public.ods_reports r on r.ods = e.ods and r.edition = ${EDICION}
 where r.settings ->> 'source' = '${FUENTE}'
on conflict (report_id, indicator) do nothing;

-- El archivo: el JSON completo y el HTML original de cada ODS ----------------------------
`);
  for (const inf of informes) {
    out.push(`insert into public.ods_report_archive (ods, edition, source, parsed, raw_html)
values (${inf.ods}, ${EDICION}, '${FUENTE}', ${dolar(JSON.stringify(inf), DQ_JSON)}::jsonb,
${dolar(htmls.get(inf.ods), DQ_HTML)})
on conflict (ods, edition, source) do update
   set parsed = excluded.parsed, raw_html = excluded.raw_html, imported_at = now()
 where public.ods_report_archive.parsed is distinct from excluded.parsed
    or public.ods_report_archive.raw_html is distinct from excluded.raw_html;
`);
  }
  return out.join("\n");
}

/* --- Principal ------------------------------------------------------------------------------ */

function fuenteDe(carpeta) {
  try {
    const [commit, fecha] = execFileSync("git", ["-C", carpeta, "log", "-1", "--format=%h|%cs"], { encoding: "utf8" }).trim().split("|");
    return { repo: REPO, commit, fecha };
  } catch {
    return { repo: REPO, commit: "sin git", fecha: "sin fecha" };
  }
}

export async function importar(carpeta = POR_DEFECTO) {
  const archivos = readdirSync(carpeta)
    .map((f) => [f, /^ods(\d{1,2})_informe\.html$/.exec(f)?.[1]])
    .filter(([, n]) => n)
    .map(([f, n]) => [f, Number(n)])
    .sort((a, b) => a[1] - b[1]);
  if (archivos.length !== 17) throw new Error(`Se esperaban 17 informes en ${carpeta} y hay ${archivos.length}.`);
  const htmls = new Map();
  const informes = [];
  for (const [f, n] of archivos) {
    const html = readFileSync(join(carpeta, f), "utf8").replace(/\r\n/g, "\n");
    htmls.set(n, html);
    informes.push(armarInforme(n, f, html));
  }
  // Bloques repetidos entre ODS: el mismo texto (normalizado) en más de un ODS
  // queda habilitado solo en el primero por número; en los demás, deshabilitado
  // con aviso. También un encabezado que nombra otro ODS entre paréntesis
  // («… (ODS 1)» dentro del ODS 3).
  const primero = new Map();
  for (const inf of informes) for (const b of inf.bloques) if (!primero.has(normal(b.text))) primero.set(normal(b.text), inf.ods);
  for (const inf of informes) {
    const copiados = new Map();
    let ajenoTitulo = 0;
    for (const b of inf.bloques) {
      const duenio = primero.get(normal(b.text));
      const otroOds = [...(b.encabezado ?? "").matchAll(/\(ODS (\d{1,2})\)/g)].map((m) => Number(m[1])).find((n) => n !== inf.ods);
      if (duenio !== inf.ods) copiados.set(duenio, (copiados.get(duenio) ?? 0) + 1);
      else if (otroOds) ajenoTitulo++;
      else continue;
      b.enabled = false;
      b.warn = b.warn ? `${AVISO_REPETIDO} ${b.warn}` : AVISO_REPETIDO;
    }
    for (const [otro, n] of copiados) inf.rarezas.push(`${n} bloque(s) idénticos a los del ODS ${otro}: se importan deshabilitados, con aviso.`);
    if (ajenoTitulo) inf.rarezas.push(`${ajenoTitulo} bloque(s) cuyo título nombra otro ODS: se importan deshabilitados, con aviso.`);
    inf.conteo.copiados = [...copiados.values()].reduce((x, y) => x + y, 0) + ajenoTitulo;
    inf.conteo.deshabilitados = inf.bloques.filter((x) => !x.enabled).length;
  }

  const ODS13 = await evidenciasOds13();
  const i13 = informes.find((i) => i.ods === 13);
  const elecciones = eleccionesOds13(ODS13, i13);
  i13.indicadores = elecciones.map((e) => ({ ...e, fuente: "src/modules/sostenible/ods-data.ts (ODS13.indicators, evidencias «ok» de 2025)" }));
  const vacios = elecciones.filter((e) => e.page_es.length === 0).map((e) => e.indicator);
  i13.rarezas.push(
    "El HTML no trae evidencias por indicador de THE: las del ODS 13 (13.1–13.4) salen de ods-data.ts (solo las «ok» de 2025)." +
      (vacios.length ? ` Sin evidencia 2025: ${vacios.join(", ")}.` : ""),
  );
  const fuente = fuenteDe(carpeta);
  const seed = {
    generado_por: "scripts/import-informe-2025.mjs",
    fuente,
    edicion: EDICION,
    ods: informes,
  };
  const texto = sql({ informes, htmls, elecciones, fuente });
  if (Buffer.byteLength(texto) > TOPE_SQL) throw new Error(`La migración pesa ${Buffer.byteLength(texto)} bytes (> 3 MB): hay que partir el HTML crudo en 0148.`);
  return { seed, sql: texto, informes };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const carpeta = resolve(process.argv[2] ?? POR_DEFECTO);
  if (!existsSync(carpeta)) {
    console.error(`No existe la carpeta ${carpeta}.`);
    process.exit(1);
  }
  const { seed, sql: texto, informes } = await importar(carpeta);
  mkdirSync(join(RAIZ, "supabase/seed"), { recursive: true });
  writeFileSync(join(RAIZ, SEED), `${JSON.stringify(seed, null, 2)}\n`);
  writeFileSync(join(RAIZ, MIGRACION), texto);
  console.log(`Fuente: ${seed.fuente.repo} @ ${seed.fuente.commit} (${seed.fuente.fecha})`);
  console.log("ODS | estado    | tesis cifras hicimos proyectos viene | figs | evidencias | deshabilitados | sin inglés | rarezas");
  for (const i of informes) {
    const c = i.conteo;
    console.log(`${String(i.ods).padStart(3)} | ${estadoDe(i.ods).padEnd(9)} | ${c.tesis} ${c.cifras} ${c.hicimos} ${c.proyectos} ${c.viene} | ${c.cifras_figs} | ${(i.indicadores ?? []).length} | ${c.deshabilitados} | ${i.bloques.filter((x) => x.text_en === "").length} | ${i.rarezas.length}`);
  }
  console.log(`Escrito ${SEED} y ${MIGRACION} (${(Buffer.byteLength(texto) / 1024).toFixed(0)} KB).`);
}

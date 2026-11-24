/* =============================================================================
   UDrive · el texto con formato mínimo de un párrafo, sin React.

   Se guarda como una cadena con marcas, no como HTML (nunca se pinta con
   innerHTML sin pasar por aquí, y todo se escapa):

     **negrita**   *cursiva*   [texto](https://enlace)
     [[clave]]            cifra viva de UDES en Cifras (módulo Informes)
     {{cita:id}}          cita APA de una fuente del documento; {{cita:id|p. 12}} con página
     {{ref:bloque}}       referencia cruzada a una figura: «Gráfica 3»
     \x                   el carácter x tal cual (\*, \[, \{, \\)

   `tramos` lee la cadena; `escapar` prepara texto escrito por la persona para
   guardarlo sin que se confunda con una marca. La parte que necesita el DOM
   (leer lo que dejó el editor) vive en ui/documento/TextoRico.tsx.
   ========================================================================== */

export type Tramo =
  | { t: "texto"; texto: string; b: boolean; i: boolean; enlace: string | null }
  | { t: "cifra"; clave: string }
  | { t: "cita"; fuente: string; extra: string }
  | { t: "ref"; bloque: string };

const CIFRA = /^\[\[([a-z0-9_]{1,60})\]\]/i;
const CITA = /^\{\{cita:([A-Za-z0-9_-]{1,60})(?:\|([^}]{0,80}))?\}\}/;
const REF = /^\{\{ref:([A-Za-z0-9_-]{1,60})\}\}/;
const ENLACE = /^\[([^\][]{1,400})\]\((https?:\/\/[^)\s]{1,800})\)/;

/** Texto escrito por la persona → cadena segura para guardar. */
export const escapar = (t: string): string => t.replace(/[\\*[{]/g, (c) => `\\${c}`);

/** Los trozos del texto, con su formato; une los de texto contiguos con el mismo formato. */
export function tramos(fuente: string, b0 = false, i0 = false, enlace0: string | null = null): Tramo[] {
  const salida: Tramo[] = [];
  let b = b0;
  let i = i0;
  let acumulado = "";
  const vaciar = () => {
    if (acumulado) salida.push({ t: "texto", texto: acumulado, b, i, enlace: enlace0 });
    acumulado = "";
  };
  for (let p = 0; p < fuente.length; ) {
    const resto = fuente.slice(p);
    const c = resto[0];
    if (c === "\\" && resto.length > 1) {
      acumulado += resto[1];
      p += 2;
      continue;
    }
    if (c === "*") {
      vaciar();
      if (resto[1] === "*") {
        b = !b;
        p += 2;
      } else {
        i = !i;
        p += 1;
      }
      continue;
    }
    if (c === "[") {
      let m = CIFRA.exec(resto);
      if (m) {
        vaciar();
        salida.push({ t: "cifra", clave: m[1].toLowerCase() });
        p += m[0].length;
        continue;
      }
      m = ENLACE.exec(resto);
      if (m && enlace0 === null) {
        vaciar();
        salida.push(...tramos(m[1], b, i, m[2]));
        p += m[0].length;
        continue;
      }
    }
    if (c === "{") {
      let m = CITA.exec(resto);
      if (m) {
        vaciar();
        salida.push({ t: "cita", fuente: m[1], extra: (m[2] ?? "").trim() });
        p += m[0].length;
        continue;
      }
      m = REF.exec(resto);
      if (m) {
        vaciar();
        salida.push({ t: "ref", bloque: m[1] });
        p += m[0].length;
        continue;
      }
    }
    acumulado += c;
    p += 1;
  }
  vaciar();
  return salida;
}

/** Lo que el texto necesita para mostrarse: de dónde salen cifras, citas y referencias. */
export interface ContextoTexto {
  /** El valor ya formateado de una cifra viva, o nulo si la clave no existe. */
  cifra(clave: string): { texto: string; cambio?: string } | null;
  /** «(Pérez, 2021, p. 12)», o nulo si la fuente ya no está. */
  cita(fuente: string, extra: string): string | null;
  /** «Gráfica 3», o nulo si el bloque no existe o no es una figura. */
  ref(bloque: string): string | null;
}

export const CONTEXTO_VACIO: ContextoTexto = { cifra: () => null, cita: () => null, ref: () => null };

/** El texto sin marcas, con cifras, citas y referencias resueltas (títulos del índice, resúmenes). */
export function aPlano(fuente: string, ctx: ContextoTexto = CONTEXTO_VACIO): string {
  return tramos(fuente)
    .map((t) => {
      if (t.t === "texto") return t.texto;
      if (t.t === "cifra") return ctx.cifra(t.clave)?.texto ?? `[[${t.clave}]]`;
      if (t.t === "cita") return ctx.cita(t.fuente, t.extra) ?? "(fuente sin definir)";
      return ctx.ref(t.bloque) ?? "(referencia rota)";
    })
    .join("");
}

/** Las claves de cifras vivas que cita un texto, sin repetir. */
export function clavesDeCifras(fuente: string): string[] {
  return [...new Set(tramos(fuente).flatMap((t) => (t.t === "cifra" ? [t.clave] : [])))];
}

/** Ids de fuentes citadas, sin repetir y en orden de aparición. */
export function fuentesCitadas(fuente: string): string[] {
  return [...new Set(tramos(fuente).flatMap((t) => (t.t === "cita" ? [t.fuente] : [])))];
}

/** Referencias cruzadas (ids de bloque) que hay en un texto. */
export function refsDe(fuente: string): string[] {
  return [...new Set(tramos(fuente).flatMap((t) => (t.t === "ref" ? [t.bloque] : [])))];
}

/** Inserta una marca en la posición del cursor medida sobre el TEXTO PLANO escrito (sin marcas): ver TextoRico. */
export const marcaCifra = (clave: string): string => `[[${clave.toLowerCase()}]]`;
export const marcaCita = (id: string, extra = ""): string => `{{cita:${id}${extra.trim() ? `|${extra.trim().replace(/[}|]/g, "")}` : ""}}`;
export const marcaRef = (bloque: string): string => `{{ref:${bloque}}}`;

/** ¿El enlace es seguro para ponerlo en un `href`? Solo http(s). */
export const enlaceSeguro = (url: string): boolean => /^https?:\/\/[^\s<>"']{1,800}$/i.test(url.trim());

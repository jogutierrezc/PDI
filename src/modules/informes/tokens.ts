/* =============================================================================
   Informes Institucionales · cifras enlazadas en el texto, sin React.

   La narrativa lleva tokens `[[clave]]` (p. ej. `[[matric]]`) que se leen con
   el valor vivo, o con la foto si el informe ya se envió. Además, el texto se
   revisa: cifras escritas a mano (no siguen a su fuente), texto de plantilla
   sin reemplazar (`[corchete simple]`, «ejemplo:») y tokens que no existen.
   ========================================================================== */

import type { Control } from "./types";

const TOKEN = /\[\[([a-z0-9_]+)\]\]/gi;
const PLANTILLA = /\[[^[\]]+\]|ejemplo\s*:|lorem ipsum|telecentro rural/i;
/** Años sueltos (2025, 2026) no cuentan como cifra escrita a mano: son el periodo. */
const ANIO = /\b(19|20)\d{2}\b/g;
const NUMERO = /\d[\d.,]*/g;

export interface Resuelto {
  /** Valor ya formateado («2.840», «7,8 %»). */
  texto: string;
  /** Nombre de la fuente, para el título del chip. */
  fuente: string;
}
export type Resolver = (clave: string) => Resuelto | null;

export type Parte = { tipo: "texto"; texto: string } | { tipo: "cifra"; clave: string; texto: string; fuente: string } | { tipo: "roto"; clave: string };

export const palabras = (t: string | null | undefined): number => {
  const s = (t ?? "").trim();
  return s ? s.split(/\s+/).length : 0;
};

/** Claves citadas en el texto, sin repetir, en orden de aparición. */
export function extraerTokens(texto: string): string[] {
  const vistas: string[] = [];
  for (const m of texto.matchAll(TOKEN)) {
    const k = m[1].toLowerCase();
    if (!vistas.includes(k)) vistas.push(k);
  }
  return vistas;
}

/** El texto partido en trozos de texto y cifras, para pintarlo sin innerHTML. */
export function partesTexto(texto: string, resolver: Resolver): Parte[] {
  const partes: Parte[] = [];
  let desde = 0;
  for (const m of texto.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > desde) partes.push({ tipo: "texto", texto: texto.slice(desde, i) });
    const clave = m[1].toLowerCase();
    const r = resolver(clave);
    partes.push(r ? { tipo: "cifra", clave, texto: r.texto, fuente: r.fuente } : { tipo: "roto", clave });
    desde = i + m[0].length;
  }
  if (desde < texto.length) partes.push({ tipo: "texto", texto: texto.slice(desde) });
  return partes;
}

/** Texto plano con las cifras resueltas; un token sin valor queda tal cual. */
export function resolverTexto(texto: string, resolver: Resolver): string {
  return texto.replace(TOKEN, (todo, k: string) => resolver(k.toLowerCase())?.texto ?? todo);
}

/** El texto sin los tokens (para revisar lo que escribió la persona). */
const sinTokens = (texto: string) => texto.replace(TOKEN, " ");

/** Cifras escritas a mano fuera de los tokens (sin contar los años). */
export function cifrasAMano(texto: string): string[] {
  return sinTokens(texto).replace(ANIO, " ").match(NUMERO) ?? [];
}

/** ¿Quedó texto de la plantilla sin reemplazar? */
export const textoDePlantilla = (texto: string): boolean => PLANTILLA.test(sinTokens(texto));

/** Tokens que no corresponden a ninguna cifra conocida. */
export const tokensDesconocidos = (texto: string, claves: Iterable<string>): string[] => {
  const validas = new Set([...claves].map((c) => c.toLowerCase()));
  return extraerTokens(texto).filter((k) => !validas.has(k));
};

/** Inserta `[[clave]]` en la posición del cursor y devuelve el texto y el cursor nuevos. */
export function insertarToken(texto: string, posicion: number | null, clave: string): { texto: string; cursor: number } {
  const p = posicion === null || posicion < 0 || posicion > texto.length ? texto.length : posicion;
  const antes = texto.slice(0, p);
  const despues = texto.slice(p);
  const token = `${antes && !/\s$/.test(antes) ? " " : ""}[[${clave}]]${despues && !/^[\s.,;:)]/.test(despues) ? " " : ""}`;
  return { texto: antes + token + despues, cursor: antes.length + token.length };
}

/** Los controles de un texto, en español, como los muestra el editor. */
export function validarTexto(texto: string, o: { claves: Iterable<string>; minimo?: number }): Control[] {
  const c: Control[] = [];
  const t = texto ?? "";
  if (o.minimo) {
    const n = palabras(t);
    c.push(n >= o.minimo ? { nivel: "ok", texto: `Extensión adecuada (${n} palabras)` } : { nivel: "warn", texto: `Faltan ${o.minimo - n} palabras para el mínimo` });
  }
  c.push(textoDePlantilla(t) ? { nivel: "warn", texto: "El texto parece un ejemplo de la plantilla. Reemplácelo." } : { nivel: "ok", texto: "Sin frases de ejemplo de la plantilla" });
  const mano = cifrasAMano(t).length;
  c.push(
    mano
      ? { nivel: "warn", texto: `Hay ${mano} ${mano === 1 ? "cifra escrita" : "cifras escritas"} a mano. Use «Insertar una cifra viva» para que sigan a su fuente.` }
      : { nivel: "ok", texto: "Las cifras del texto están enlazadas a su fuente" },
  );
  const rotos = tokensDesconocidos(t, o.claves);
  if (rotos.length) c.push({ nivel: "warn", texto: `Cifras que no existen en este informe: ${rotos.map((k) => `[[${k}]]`).join(", ")}` });
  return c;
}

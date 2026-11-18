/* =============================================================================
   Pilo documento · el Markdown de una respuesta, partido en bloques.
   Es el mismo reparto que hace la app (PiloMarkdown.swift): párrafos, títulos,
   listas, citas, tablas, código y fórmulas (cerca «formula»). Sin dependencias.
   ========================================================================== */

export type Bloque =
  | { t: "parrafo"; texto: string }
  | { t: "titulo"; texto: string; nivel: number }
  | { t: "lista"; items: { marca: string; texto: string }[]; ordenada: boolean }
  | { t: "codigo"; lenguaje: string; texto: string }
  | { t: "formula"; texto: string }
  | { t: "cita"; texto: string }
  | { t: "tabla"; filas: string[][] };

export interface Tramo {
  texto: string;
  negrita: boolean;
  cursiva: boolean;
  codigo: boolean;
}

function elementoDeLista(t: string): { marca: string; texto: string } | null {
  const v = /^[-*•+]\s+(.*)$/.exec(t);
  if (v) return { marca: "•", texto: v[1] };
  const n = /^(\d{1,3})[.)]\s+(.*)$/.exec(t);
  return n ? { marca: `${n[1]}.`, texto: n[2] } : null;
}

export function bloques(md: string): Bloque[] {
  const salida: Bloque[] = [];
  let parrafo: string[] = [];
  let lista: { marca: string; texto: string }[] = [];
  let tabla: string[][] = [];
  let codigo: string[] | null = null;
  let lenguaje = "";
  const cerrarParrafo = () => {
    if (parrafo.length) salida.push({ t: "parrafo", texto: parrafo.join("\n") });
    parrafo = [];
  };
  const cerrarLista = () => {
    if (lista.length) salida.push({ t: "lista", items: lista, ordenada: lista[0].marca !== "•" });
    lista = [];
  };
  const cerrarTabla = () => {
    if (tabla.length) salida.push({ t: "tabla", filas: tabla });
    tabla = [];
  };
  const cerrarTodo = () => {
    cerrarParrafo();
    cerrarLista();
    cerrarTabla();
  };

  for (const linea of md.replace(/\r\n/g, "\n").split("\n")) {
    const t = linea.trim();
    if (codigo !== null) {
      if (t.startsWith("```")) {
        const cuerpo = codigo.join("\n");
        salida.push(lenguaje === "formula" ? { t: "formula", texto: cuerpo } : { t: "codigo", lenguaje, texto: cuerpo });
        codigo = null;
      } else codigo.push(linea);
      continue;
    }
    if (t.startsWith("```")) {
      cerrarTodo();
      codigo = [];
      lenguaje = t.slice(3).trim().toLowerCase();
      continue;
    }
    if (!t) {
      cerrarTodo();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      cerrarTodo();
      salida.push({ t: "titulo", texto: h[2].trim(), nivel: h[1].length });
      continue;
    }
    if (t.startsWith("|") && t.slice(1).includes("|")) {
      cerrarParrafo();
      cerrarLista();
      const celdas = t.split("|").slice(1, -1).map((c) => c.trim());
      const separador = celdas.length > 0 && celdas.every((c) => c !== "" && /^[-: ]+$/.test(c));
      if (!separador) tabla.push(celdas);
      continue;
    }
    cerrarTabla();
    if (t.startsWith(">")) {
      cerrarTodo();
      salida.push({ t: "cita", texto: t.slice(1).trim() });
      continue;
    }
    const item = elementoDeLista(t);
    if (item) {
      cerrarParrafo();
      lista.push(item);
      continue;
    }
    cerrarLista();
    parrafo.push(t);
  }
  if (codigo !== null) salida.push({ t: "codigo", lenguaje, texto: codigo.join("\n") });
  cerrarTodo();
  return salida;
}

/** `**negrita**`, `*cursiva*` y `` `código` `` en tramos. */
export function tramos(crudo: string): Tramo[] {
  const c = [...crudo];
  const salida: Tramo[] = [];
  let actual = "";
  let negrita = false;
  let cursiva = false;
  let codigo = false;
  const vaciar = () => {
    if (actual) salida.push({ texto: actual, negrita, cursiva, codigo });
    actual = "";
  };
  for (let i = 0; i < c.length; i++) {
    if (c[i] === "`") {
      vaciar();
      codigo = !codigo;
    } else if (!codigo && c[i] === "*" && c[i + 1] === "*") {
      vaciar();
      negrita = !negrita;
      i++;
    } else if (!codigo && c[i] === "*" && (cursiva || (i + 1 < c.length && c[i + 1] !== " "))) {
      vaciar();
      cursiva = !cursiva;
    } else actual += c[i];
  }
  vaciar();
  return salida;
}

/** El texto sin marcas (para celdas y para títulos). */
export const plano = (crudo: string): string => tramos(crudo).map((t) => t.texto).join("");

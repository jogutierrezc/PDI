/* =============================================================================
   UDrive · Pilo (fase 3): redactar y ordenar lo importado.

   Las dos acciones viven en la función `pilo-informes` (udrive.ts): el mismo
   proveedor de IA y la misma bitácora que Informes; el acceso lo da UDrive
   (drive_entra). La clave del proveedor nunca llega al navegador. Todo lo que
   vuelve es una PROPUESTA: aquí solo se pide y se revisa que no traiga marcas
   que el documento no tenga; guardar lo decide la persona.
   ========================================================================== */

import { supabase } from "../../lib/supabase";
import { aPlano } from "./lib/texto";
import type { Bloque, Documento } from "./lib/documento";
import type { Figura } from "./lib/numeracion";
import type { CifraResuelta } from "./lib/cifras";
import type { ContextoTexto } from "./lib/texto";

const FUNCION = "pilo-informes";

export class ErrorPilo extends Error {}

async function pilo<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke(FUNCION, { body });
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = r.error.message;
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string }) : null;
      if (j?.error) mensaje = j.error;
    } catch {
      /* sin cuerpo legible */
    }
    if (!ctx && /failed to send|fetch/i.test(mensaje)) mensaje = "No se pudo llegar a Pilo: la función pilo-informes no responde o no está desplegada.";
    throw new ErrorPilo(mensaje);
  }
  return r.data as T;
}

/* ---------- Pilo redactor ------------------------------------------------------------------------------ */

export type ModoPilo = "redactar" | "mejorar" | "resumir" | "alargar" | "formal" | "ortografia";
export type TipoTextoPilo = "parrafo" | "lista" | "destacado" | "nota";

export const MODOS_PILO: { id: ModoPilo; texto: string; ayuda: string; pideInstruccion: boolean }[] = [
  { id: "redactar", texto: "Redactar", ayuda: "Escribe un texto nuevo a partir de lo que usted pida.", pideInstruccion: true },
  { id: "mejorar", texto: "Mejorar la redacción", ayuda: "Más claro y directo, con los mismos hechos.", pideInstruccion: false },
  { id: "resumir", texto: "Resumir", ayuda: "Deja la mitad, con lo esencial.", pideInstruccion: false },
  { id: "alargar", texto: "Desarrollar más", ayuda: "Agrega detalle que ya esté en el texto o en su pedido.", pideInstruccion: false },
  { id: "formal", texto: "Más formal", ayuda: "Registro institucional, sobrio.", pideInstruccion: false },
  { id: "ortografia", texto: "Corregir ortografía", ayuda: "Solo ortografía y puntuación; no cambia palabras.", pideInstruccion: false },
];

/** Lo que Pilo puede usar del documento: solo esto, copiado tal cual. */
export interface ContextoPilo {
  informe: string;
  capitulo: string;
  antes: string;
  cifras: { clave: string; etiqueta: string; valor: string }[];
  fuentes: { id: string; cita: string }[];
  figuras: { id: string; etiqueta: string; titulo: string }[];
}

export interface PropuestaPilo {
  texto?: string;
  items?: string[];
  avisos: string[];
}

/** El texto de un bloque de texto, como lo ve Pilo: una cadena (las listas, un elemento por línea). */
export function textoParaPilo(b: Bloque): string {
  if (b.tipo === "parrafo" || b.tipo === "destacado" || b.tipo === "nota") return b.texto;
  if (b.tipo === "lista") return b.items.join("\n");
  return "";
}

export const esBloqueDeTexto = (b: Bloque): b is Extract<Bloque, { tipo: TipoTextoPilo }> => b.tipo === "parrafo" || b.tipo === "lista" || b.tipo === "destacado" || b.tipo === "nota";

/** Arma el contexto que se le da a Pilo para un bloque: sus claves, fuentes y figuras, y qué hay antes. */
export function contextoParaPilo(
  doc: Documento,
  bloqueId: string,
  o: { informe: string; claves: readonly string[]; cifra(clave: string): CifraResuelta | null; figuras: ReadonlyMap<string, Figura>; texto: ContextoTexto },
): ContextoPilo {
  const i = doc.bloques.findIndex((b) => b.id === bloqueId);
  const previos = i > 0 ? doc.bloques.slice(0, i) : [];
  const cap = [...previos].reverse().find((b) => b.tipo === "capitulo");
  const ant = [...previos].reverse().find((b) => b.tipo === "parrafo");
  return {
    informe: o.informe,
    capitulo: cap && cap.tipo === "capitulo" ? cap.titulo : "",
    antes: ant && ant.tipo === "parrafo" ? aPlano(ant.texto, o.texto).slice(0, 700) : "",
    cifras: o.claves.flatMap((k) => {
      const c = o.cifra(k);
      return c?.conValor ? [{ clave: k, etiqueta: c.fuente, valor: c.texto }] : [];
    }),
    fuentes: doc.fuentes.flatMap((f) => {
      const cita = o.texto.cita(f.id, "");
      return cita ? [{ id: f.id, cita }] : [];
    }),
    figuras: [...o.figuras.values()].map((f) => ({ id: f.bloqueId, etiqueta: f.etiqueta, titulo: aPlano(f.titulo, o.texto).slice(0, 160) })),
  };
}

const CIFRA = /\[\[([a-z0-9_]{1,60})\]\]/gi;
const CITA = /\{\{cita:([A-Za-z0-9_-]{1,60})(?:\|[^}]{0,80})?\}\}/g;
const REF = /\{\{ref:([A-Za-z0-9_-]{1,60})\}\}/g;

/** Defensa en el navegador: la propuesta no puede traer cifras, citas ni referencias que el documento no tenga. */
export function propuestaSegura(propuesta: PropuestaPilo, original: string, c: ContextoPilo): string {
  const todo = [propuesta.texto ?? "", ...(propuesta.items ?? [])].join("\n");
  if (!todo.trim()) return "Pilo devolvió una propuesta vacía.";
  const ok = (texto: string, re: RegExp, permitidas: Set<string>, minusculas: boolean) =>
    [...texto.matchAll(re)].every((m) => permitidas.has(minusculas ? m[1].toLowerCase() : m[1]));
  const con = (re: RegExp, extra: Set<string>, base: Set<string>, minusculas = false) => ok(todo, re, new Set([...base, ...extra]), minusculas);
  const delOriginal = (re: RegExp, minusculas = false) => new Set([...original.matchAll(re)].map((m) => (minusculas ? m[1].toLowerCase() : m[1])));
  if (!con(CIFRA, delOriginal(CIFRA, true), new Set(c.cifras.map((x) => x.clave)), true)) return "La propuesta usa una cifra viva que el informe no tiene.";
  if (!con(CITA, delOriginal(CITA), new Set(c.fuentes.map((x) => x.id)))) return "La propuesta cita una fuente que el informe no tiene.";
  if (!con(REF, delOriginal(REF), new Set(c.figuras.map((x) => x.id)))) return "La propuesta remite a una figura que no existe.";
  return "";
}

export async function pedirRedaccion(a: { modo: ModoPilo; tipo: TipoTextoPilo; texto: string; instruccion: string; contexto: ContextoPilo }): Promise<PropuestaPilo> {
  const r = await pilo<{ texto?: string; items?: string[]; avisos?: string[] }>({
    action: "udrive_redactar",
    modo: a.modo,
    tipo: a.tipo,
    texto: a.texto,
    ...(a.instruccion.trim() ? { instruccion: a.instruccion.trim() } : {}),
    contexto: a.contexto,
  });
  return { texto: typeof r.texto === "string" ? r.texto : undefined, items: Array.isArray(r.items) ? r.items.filter((x): x is string => typeof x === "string") : undefined, avisos: r.avisos ?? [] };
}

/* ---------- Pilo ordena lo importado -------------------------------------------------------------------- */

export interface ItemPilo {
  i: number;
  texto: string;
  nivel?: number;
  tam?: number;
  pagina?: number;
}

export const pedirNiveles = (items: ItemPilo[], archivo: string) =>
  pilo<{ niveles: { i: number; nivel: number }[] }>({ action: "udrive_estructurar", tarea: "niveles", items, archivo }).then((r) => r.niveles ?? []);

export const pedirLimpieza = (items: ItemPilo[], archivo: string) =>
  pilo<{ textos: { i: number; texto: string }[]; descartados?: number }>({ action: "udrive_estructurar", tarea: "limpiar", items, archivo }).then((r) => ({ textos: r.textos ?? [], descartados: r.descartados ?? 0 }));

export const pedirNombres = (items: ItemPilo[], archivo: string) =>
  pilo<{ titulo_documento?: string; tablas: { i: number; titulo: string }[] }>({ action: "udrive_estructurar", tarea: "nombres", items, archivo }).then((r) => ({ titulo: r.titulo_documento ?? "", tablas: r.tablas ?? [] }));

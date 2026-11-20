/* =============================================================================
   Planeación y Seguimiento · Fase 3 · ayudas puras del catálogo del PDI
   (pilares → áreas → líneas de acción): buscar, rotular y resumir. Sin DOM.
   ========================================================================== */

import { llano } from "../modelo";
import type { Actividad } from "./modelo";
import type { ConexionPdi, ItemPdi, PdiActividad, PilarCatalogo, SeleccionPdi } from "./modeloF3";
import { MAX_ITEMS_PDI } from "./modeloF3";

export const claveItem = (i: { pillarId: string; lineaId: string | null }): string => `${i.pillarId}|${i.lineaId ?? ""}`;

export const SELECCION_VACIA: SeleccionPdi = { conexion: "sin_definir", items: [] };

/** De lo que devuelve la base (con nombres) a lo que se envía (solo ids). */
export const seleccionDe = (a: Pick<Actividad, "pdi">): SeleccionPdi => ({ conexion: a.pdi.conexion, items: a.pdi.items.map((i) => ({ pillarId: i.pillarId, lineaId: i.lineaId })) });

/** Los pilares y líneas que coinciden con la búsqueda (sin tildes ni mayúsculas); un pilar que coincide muestra todas sus líneas. */
export function filtrarCatalogo(cat: readonly PilarCatalogo[], q: string): PilarCatalogo[] {
  const t = llano(q);
  if (!t) return [...cat];
  const palabras = t.split(" ");
  const coincide = (s: string) => palabras.every((p) => llano(s).includes(p));
  return cat.flatMap((p) => {
    if (coincide(`${p.codigo} ${p.nombre}`)) return [p];
    const areas = p.areas.flatMap((a) => {
      if (coincide(`${a.codigo} ${a.nombre}`)) return [a];
      const lineas = a.lineas.filter((l) => coincide(`${l.codigo} ${l.nombre} ${a.nombre} ${p.nombre}`));
      return lineas.length ? [{ ...a, lineas }] : [];
    });
    return areas.length ? [{ ...p, areas }] : [];
  });
}

export function rotuloItem(cat: readonly PilarCatalogo[], i: { pillarId: string; lineaId: string | null }): { pilar: string; linea: string | null } {
  const p = cat.find((x) => x.pillarId === i.pillarId);
  if (!i.lineaId) return { pilar: p ? `${p.codigo} ${p.nombre}`.trim() : "Pilar", linea: null };
  const l = p?.areas.flatMap((a) => a.lineas).find((x) => x.lineaId === i.lineaId);
  return { pilar: p ? `${p.codigo} ${p.nombre}`.trim() : "Pilar", linea: l ? `${l.codigo} ${l.nombre}`.trim() : "Línea de acción" };
}

/** Texto corto de la conexión (chip): «PDI · 2 líneas» / «Sin conexión con el PDI». */
export function textoPdi(p: { conexion: ConexionPdi; items: readonly Pick<ItemPdi, "lineaId">[] }): string {
  if (p.conexion === "sin_pdi") return "Sin PDI";
  if (p.conexion === "sin_definir") return "PDI sin definir";
  const n = p.items.length;
  return n === 1 ? "PDI · 1 elemento" : `PDI · ${n} elementos`;
}

/** Los pilares distintos a los que se conecta una actividad. */
export const pilaresDe = (p: { items: readonly Pick<ItemPdi, "pillarId" | "pilar">[] }): { id: string; nombre: string }[] => {
  const v = new Map<string, string>();
  for (const i of p.items) v.set(i.pillarId, i.pilar);
  return [...v].map(([id, nombre]) => ({ id, nombre }));
};

/** Filtro de la lista/tablero por conexión y pilar. */
export function pasaFiltroPdi(a: Pick<Actividad, "pdi">, f: { pdi: "" | ConexionPdi; pilar: string }): boolean {
  if (f.pdi && a.pdi.conexion !== f.pdi) return false;
  if (f.pilar && !a.pdi.items.some((i) => i.pillarId === f.pilar)) return false;
  return true;
}

/** Alterna un elemento de la selección (pilar completo o línea). Devuelve una selección nueva; quien llama valida el tope. */
export function alternarItem(s: SeleccionPdi, i: { pillarId: string; lineaId: string | null }): SeleccionPdi {
  const k = claveItem(i);
  const hay = s.items.some((x) => claveItem(x) === k);
  return { ...s, items: hay ? s.items.filter((x) => claveItem(x) !== k) : [...s.items, i] };
}

/** Resumen de una oficina a partir de sus actividades (cuando la base no lo da). */
export function resumirPdi(acts: readonly Pick<Actividad, "pdi">[]): { conPdi: number; sinPdi: number; sinDefinir: number; porPilar: { pillarId: string; nombre: string; actividades: number }[] } {
  const porPilar = new Map<string, { pillarId: string; nombre: string; actividades: number }>();
  let conPdi = 0, sinPdi = 0, sinDefinir = 0;
  for (const a of acts) {
    if (a.pdi.conexion === "con_pdi") conPdi += 1;
    else if (a.pdi.conexion === "sin_pdi") sinPdi += 1;
    else sinDefinir += 1;
    for (const p of pilaresDe(a.pdi)) {
      const x = porPilar.get(p.id) ?? { pillarId: p.id, nombre: p.nombre, actividades: 0 };
      x.actividades += 1;
      porPilar.set(p.id, x);
    }
  }
  return { conPdi, sinPdi, sinDefinir, porPilar: [...porPilar.values()].sort((a, b) => b.actividades - a.actividades || a.nombre.localeCompare(b.nombre, "es")) };
}

/* ---------- Excel: pdi / pilar_pdi / linea_pdi ---------- */

export const PDI_CON = "Con PDI";
export const PDI_SIN = "Sin conexión";

/** Una línea de acción como la ofrece el Excel: «LA-4.1 · Nombre». */
export const textoLineaPdi = (l: { codigo: string; nombre: string }): string => `${l.codigo} · ${l.nombre}`;
export const textoPilarPdi = (p: { codigo: string; nombre: string }): string => `${p.codigo} · ${p.nombre}`.replace(/^ · /, "");

const trozos = (s: string): string[] => s.split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);

export interface ResultadoPdiExcel {
  seleccion: SeleccionPdi;
  errores: { columna: "pdi" | "pilar_pdi" | "linea_pdi"; mensaje: string }[];
}

/**
 * Lee las tres columnas del Excel. `pdi` obligatoria («Sin conexión» | «Con PDI»); con PDI, `pilar_pdi` (nombre, código o
 * slug; varios con «;») y/o `linea_pdi` (código «LA-4.1» o nombre; varios con «;»); cada línea implica su pilar. Un pilar
 * escrito sin líneas suyas entre las líneas es «el pilar completo».
 */
export function leerPdiExcel(pdi: string, pilares: string, lineas: string, cat: readonly PilarCatalogo[]): ResultadoPdiExcel {
  const errores: ResultadoPdiExcel["errores"] = [];
  const t = llano(pdi);
  const vacio: SeleccionPdi = { conexion: "sin_definir", items: [] };
  if (!t) return { seleccion: vacio, errores: [{ columna: "pdi", mensaje: "Falta la conexión con el PDI. Elija «Con PDI» o «Sin conexión» de la lista." }] };
  const con = t === llano(PDI_CON) || t === "con" || t === "si";
  const sin = t === llano(PDI_SIN) || t === "sin" || t === "no" || t === "sin pdi";
  if (!con && !sin) return { seleccion: vacio, errores: [{ columna: "pdi", mensaje: `«${pdi.trim().slice(0, 40)}» no es una opción. Elija «${PDI_CON}» o «${PDI_SIN}» de la lista.` }] };
  if (sin) {
    if (pilares.trim() || lineas.trim()) errores.push({ columna: pilares.trim() ? "pilar_pdi" : "linea_pdi", mensaje: "Si no tiene conexión con el PDI, deje vacíos el pilar y la línea; o cambie la primera columna a «Con PDI»." });
    return { seleccion: { conexion: "sin_pdi", items: [] }, errores };
  }
  const items: SeleccionPdi["items"] = [];
  const poner = (i: { pillarId: string; lineaId: string | null }) => { if (!items.some((x) => claveItem(x) === claveItem(i))) items.push(i); };
  const lineasCat = cat.flatMap((p) => p.areas.flatMap((a) => a.lineas.map((l) => ({ ...l, pillarId: p.pillarId }))));
  const idPilares = new Set<string>();
  for (const x of trozos(lineas)) {
    const k = llano(x);
    const cod = llano(x.split(/\s*·\s*/)[0]);
    const hit = lineasCat.filter((l) => llano(l.codigo) === cod || llano(l.codigo) === k);
    const porNombre = hit.length ? hit : lineasCat.filter((l) => llano(l.nombre) === k || llano(textoLineaPdi(l)) === k);
    if (porNombre.length === 1) { poner({ pillarId: porNombre[0].pillarId, lineaId: porNombre[0].lineaId }); idPilares.add(porNombre[0].pillarId); }
    else errores.push({ columna: "linea_pdi", mensaje: porNombre.length > 1 ? `La línea «${x.slice(0, 50)}» es ambigua: use su código (por ejemplo ${lineasCat[0]?.codigo ?? "LA-1.1"}).` : `La línea «${x.slice(0, 50)}» no está en el catálogo del PDI. Mire la hoja «PDI» del libro y escriba su código.` });
  }
  for (const x of trozos(pilares)) {
    const k = llano(x);
    const cod = llano(x.split(/\s*·\s*/)[0]);
    const p = cat.find((q) => llano(q.nombre) === k || llano(q.codigo) === k || llano(q.codigo) === cod || llano(textoPilarPdi(q)) === k);
    if (!p) errores.push({ columna: "pilar_pdi", mensaje: `El pilar «${x.slice(0, 50)}» no está en el catálogo del PDI. Mire la hoja «PDI» del libro y escriba su nombre o código.` });
    else if (!idPilares.has(p.pillarId)) poner({ pillarId: p.pillarId, lineaId: null });
  }
  if (!items.length && !errores.length) errores.push({ columna: "pilar_pdi", mensaje: "Con PDI hace falta al menos un pilar o una línea de acción (hoja «PDI» del libro)." });
  if (items.length > 12) errores.push({ columna: "linea_pdi", mensaje: `Una actividad se conecta con hasta 12 pilares o líneas (puso ${items.length}).` });
  return { seleccion: { conexion: "con_pdi", items }, errores };
}

/* ---------- Validación (al crear o editar) ---------- */

/** Al crear hay que elegir «con_pdi» o «sin_pdi» (no «sin_definir»); con PDI, de 1 a 12 elementos sin repetir. */
export function validarPdi(p: SeleccionPdi, creando: boolean): { campo: string; mensaje: string }[] {
  const e: { campo: string; mensaje: string }[] = [];
  if (p.conexion === "sin_definir") {
    if (creando) e.push({ campo: "pdi-conexion", mensaje: "Elija una: «Esta actividad se conecta con el PDI» o «No tiene conexión con el PDI»." });
    if (p.items.length) e.push({ campo: "pdi-conexion", mensaje: "Una actividad con el PDI sin definir no lleva pilares ni líneas." });
    return e;
  }
  if (p.conexion === "sin_pdi") {
    if (p.items.length) e.push({ campo: "pdi-conexion", mensaje: "Sin conexión con el PDI no lleva pilares ni líneas: quítelos o elija «Se conecta con el PDI»." });
    return e;
  }
  if (!p.items.length) e.push({ campo: "pdi-buscar", mensaje: "Elija al menos un pilar o una línea de acción del PDI." });
  if (p.items.length > MAX_ITEMS_PDI) e.push({ campo: "pdi-buscar", mensaje: `Una actividad se conecta con hasta ${MAX_ITEMS_PDI} pilares o líneas (eligió ${p.items.length}).` });
  const claves = new Set(p.items.map((i) => `${i.pillarId}|${i.lineaId ?? ""}`));
  if (claves.size !== p.items.length) e.push({ campo: "pdi-buscar", mensaje: "Hay un pilar o una línea repetida." });
  return e;
}


/** Resuelve una selección (ids) a lo que muestra la pantalla (con nombres), contra el catálogo. */
export function resolverSeleccion(cat: readonly PilarCatalogo[], s: SeleccionPdi): PdiActividad {
  return {
    conexion: s.conexion,
    items: s.items.flatMap((i): ItemPdi[] => {
      const p = cat.find((x) => x.pillarId === i.pillarId);
      if (!p) return [];
      const a = p.areas.find((x) => x.lineas.some((l) => l.lineaId === i.lineaId));
      const l = a?.lineas.find((x) => x.lineaId === i.lineaId);
      return [{ pillarId: p.pillarId, pilar: `${p.codigo} ${p.nombre}`.trim(), pilarSlug: p.codigo.toLowerCase(), area: a?.nombre ?? null, lineaId: i.lineaId, lineaCodigo: l?.codigo ?? null, linea: l?.nombre ?? null }];
    }),
  };
}

/** Lo que la carga masiva de la base lee: `pdi`, `pilar_pdi` y `linea_pdi` (códigos de línea y nombres de pilar, con «;»). */
export function columnasPdiExcel(s: SeleccionPdi, cat: readonly PilarCatalogo[]): { pdi: string; pilar_pdi: string; linea_pdi: string } {
  if (s.conexion !== "con_pdi") return { pdi: PDI_SIN, pilar_pdi: "", linea_pdi: "" };
  const lineas = s.items.flatMap((i) => (i.lineaId ? [cat.flatMap((p) => p.areas.flatMap((a) => a.lineas)).find((l) => l.lineaId === i.lineaId)?.codigo ?? ""] : []));
  const pilares = s.items.flatMap((i) => (i.lineaId ? [] : [cat.find((p) => p.pillarId === i.pillarId)?.nombre ?? ""]));
  return { pdi: PDI_CON, pilar_pdi: pilares.filter(Boolean).join(";"), linea_pdi: lineas.filter(Boolean).join(";") };
}

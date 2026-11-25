/* =============================================================================
   Compilar informe de colaboradores con Pilo · lógica pura (sin React ni red).

   Una decanatura, vicerrectoría o rectoría recibe los libros de Excel que devuelven sus
   unidades de apoyo y los compila antes de llevarlos al informe principal:

     1 · Recibir    libros sueltos o un ZIP; se reconoce la plantilla (A–D) de cada uno y, si no es la
                    del informe, se adapta (nunca se rechaza por eso: son parecidas).
     2 · Organizar  los indicadores de todos los equipos se agrupan por nombre, se unifican y se
                    resuelven los conflictos (el valor oficial sale de la fuente primaria).
     3 · Redactar   Pilo Astra escribe cada sección de texto con lo organizado (función pilo-compilador).
     4 · Aprobar    lo aprobado se escribe en el informe con `aplicar` (libro-informe.ts).

   Aquí vive todo lo que no es pantalla: clasificar entradas de un ZIP, detectar y adaptar la
   plantilla, agrupar indicadores, cobertura por sección y armar lo que se escribe en el informe.
   Reutiliza leerLibro, clasificar y aplicar: no hay una segunda manera de leer un libro.
   ========================================================================== */

import { numeroDe } from "../cifras-vivas";
import { COLUMNAS_LIBRO_RESULTADOS, claveIndicador } from "../indicadores-manual";
import { aplicar, clasificar, destinosDe, leerLibro } from "../libro-informe";
import type { BloqueLibro, EnlaceEvidencia, LibroLeido, ModoAplicacion, Propuesta, ResultadoAplicar } from "../libro-informe";
import { normalizarTexto } from "../libro-columnas";
import { PLANTILLAS } from "../plantillas";
import type { HojaLeida } from "../ui/excel";
import type { AnexoRow, ContenidoSeccion, EstadoInstancia, Plantilla, PilarRef, RolInforme, SeccionDef } from "../types";
import type { PilarOpcion } from "../indicadores-manual";

/* ---------- Entradas de un ZIP o de una carga múltiple ---------------------------------- */

export type ResultadoEntrada = "libro" | "ignorado" | "rechazado";
export interface EntradaClasificada {
  nombre: string;
  resultado: ResultadoEntrada;
  motivo: string;
}

const SISTEMA = /(^|\/)(__macosx|\.ds_store|thumbs\.db|desktop\.ini)(\/|$)/i;

/** ¿Qué hacer con un archivo que vino suelto o dentro de un ZIP? Solo los .xlsx son libros. */
export function clasificarEntrada(ruta: string): EntradaClasificada {
  const base = ruta.split("/").pop() ?? ruta;
  if (SISTEMA.test(ruta)) return { nombre: ruta, resultado: "ignorado", motivo: "Archivo del sistema operativo." };
  if (base.startsWith("~$")) return { nombre: ruta, resultado: "ignorado", motivo: "Archivo temporal de Excel." };
  if (/\.(xls|csv)$/i.test(base)) return { nombre: ruta, resultado: "rechazado", motivo: "Solo se leen libros .xlsx. Ábralo en Excel y guárdelo como .xlsx." };
  if (!/\.xlsx$/i.test(base)) return { nombre: ruta, resultado: "ignorado", motivo: "No es un libro de Excel." };
  return { nombre: ruta, resultado: "libro", motivo: "Libro de Excel." };
}

/** El nombre del equipo: el que dice la hoja _Control o, si no, el del archivo («…_A_direccion-de-programa.xlsx»). */
export function equipoDe(archivo: string, libro: Pick<LibroLeido, "control">): string {
  const delControl = libro.control?.valores.equipo?.trim();
  if (delControl) return delControl;
  const base = (archivo.split("/").pop() ?? archivo).replace(/\.xlsx$/i, "");
  const sinPrefijo = base.replace(/^informe[_ -]*gesti[oó]n[_ -]*\d{4}[_ -]*([A-Z]\d?)?[_ -]*/i, "").replace(/[_-]+/g, " ").trim();
  const t = sinPrefijo || base.replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Equipo sin nombre";
}

/* ---------- Plantilla: detectar y adaptar ------------------------------------------------ */

export interface DeteccionPlantilla {
  letra: Plantilla | null;
  origen: "control" | "estructura" | "ninguna";
  /** 0–1: qué tan bien encajan las hojas con esa plantilla. */
  confianza: number;
}

const mejorPuntaje = (bloques: BloqueLibro[], secciones: SeccionDef[]): number => {
  const destinos = destinosDe(secciones);
  if (!bloques.length || !destinos.length) return 0;
  const props = clasificar(bloques, destinos, null);
  const suma = props.reduce((s, p) => s + (p.destino ? p.puntaje : 0), 0);
  return suma / bloques.length;
};

/** Qué plantilla (A–D o propia) usó el libro: la del _Control, o la que mejor encaja con sus hojas y columnas. */
export function detectarPlantilla(libro: LibroLeido, candidatas: Plantilla[] = Object.keys(PLANTILLAS)): DeteccionPlantilla {
  const dicho = libro.control?.valores.plantilla?.trim().toUpperCase();
  if (dicho && PLANTILLAS[dicho]) return { letra: dicho, origen: "control", confianza: 1 };
  let mejor: DeteccionPlantilla = { letra: null, origen: "ninguna", confianza: 0 };
  for (const letra of candidatas) {
    const def = PLANTILLAS[letra];
    if (!def) continue;
    const p = mejorPuntaje(libro.bloques, def.secciones);
    if (p > mejor.confianza) mejor = { letra, origen: "estructura", confianza: Math.round(p * 100) / 100 };
  }
  return mejor;
}

export type CambioHoja = "igual" | "hoja renombrada" | "columnas movidas" | "sin equivalente";
export interface FilaAdaptacion {
  hoja: string;
  /** Sección del informe donde queda; nulo si no tiene equivalente. */
  destino: string | null;
  tituloDestino: string;
  cambio: CambioHoja;
  /** «Resultado → Cifra actual»: columnas del libro que pasan a otra columna del informe. */
  columnas: { de: string; a: string }[];
  filas: number;
}

export interface Adaptacion {
  propuestas: Propuesta[];
  filas: FilaAdaptacion[];
  /** El libro venía en otra plantilla y hubo que mover hojas o columnas. */
  adaptada: boolean;
}

const sinTildes = normalizarTexto;
const sinNumero = (s: string) => sinTildes(s).replace(/^\d+\s*/, "").trim();

/**
 * Lee el libro contra la estructura del informe. Si venía de otra plantilla se ignora el mapa de su `_Control`
 * (sus «s3», «s4» no son los del informe) y se clasifica por encabezados; el resultado dice qué se movió.
 * Nada se borra: una hoja sin equivalente queda sin importar y se anota.
 */
export function adaptarLibro(libro: LibroLeido, plantillaLibro: Plantilla | null, plantillaInforme: Plantilla, secciones: SeccionDef[]): Adaptacion {
  const destinos = destinosDe(secciones);
  const otra = plantillaLibro !== null && plantillaLibro !== plantillaInforme;
  const propuestas = clasificar(libro.bloques, destinos, otra ? null : libro.control);
  const filas: FilaAdaptacion[] = libro.bloques.map((b, k) => {
    const p = propuestas[k];
    const d = p.destino ? destinos.find((x) => x.id === p.destino) : undefined;
    if (!d) return { hoja: b.hoja, destino: null, tituloDestino: "—", cambio: "sin equivalente", columnas: [], filas: b.filas.length };
    const columnas: { de: string; a: string }[] = [];
    d.columnas.forEach((c, j) => {
      const idx = p.columnas[j];
      if (idx >= 0 && sinTildes(b.encabezados[idx] ?? "") !== sinTildes(c.titulo)) columnas.push({ de: b.encabezados[idx], a: c.titulo });
    });
    const mismoNombre = sinNumero(b.hoja) === sinNumero(d.titulo) || sinTildes(b.hoja) === sinTildes(d.titulo);
    const cambio: CambioHoja = columnas.length ? "columnas movidas" : mismoNombre ? "igual" : "hoja renombrada";
    return { hoja: b.hoja, destino: d.id, tituloDestino: d.titulo, cambio, columnas, filas: b.filas.length };
  });
  return { propuestas, filas, adaptada: otra && filas.some((f) => f.cambio !== "igual") };
}

/* ---------- El libro recibido -------------------------------------------------------------- */

export interface LibroRecibido {
  id: string;
  archivo: string;
  equipo: string;
  /** De dónde llegó: «ZIP: nombre.zip» o «archivo suelto». */
  origen: string;
  plantilla: DeteccionPlantilla;
  libro: LibroLeido;
  adaptacion: Adaptacion;
  avisos: string[];
}

export interface Rechazo {
  nombre: string;
  motivo: string;
}

/** Valida el libro contra ESTE informe sin exigir la misma plantilla (eso se adapta). Devuelve el motivo si no es de este informe. */
export function motivoDeRechazo(libro: LibroLeido, esperado: { ciclo: string; instancia: string; anio: number }): string | null {
  const v = libro.control?.valores;
  if (!libro.bloques.length) return "El libro no tiene hojas con encabezado y filas para importar.";
  if (!v) return null; // libro de terceros: se compara por encabezados
  if (v.ciclo && v.ciclo !== esperado.ciclo) return `Este libro es de otro ciclo (${v.anio ?? "?"}). Descargue uno nuevo desde este informe.`;
  if (v.instancia && v.instancia !== esperado.instancia) return `Este libro es del informe de «${v.unidad ?? "otra unidad"}», ciclo ${v.anio ?? esperado.anio}, plantilla ${v.plantilla ?? "?"} y no corresponde a este informe. Descargue el libro desde este informe y vuelva a intentarlo.`;
  return null;
}

let contador = 0;
export function recibirLibro(o: { id?: string; archivo: string; origen: string; hojas: HojaLeida[]; plantillaInforme: Plantilla; secciones: SeccionDef[]; adaptar?: boolean }): LibroRecibido {
  const libro = leerLibro(o.hojas);
  const plantilla = detectarPlantilla(libro);
  const adaptacion = adaptarLibro(libro, plantilla.letra, o.plantillaInforme, o.secciones);
  const avisos: string[] = [];
  if (plantilla.letra && plantilla.letra !== o.plantillaInforme) avisos.push(`Venía en la plantilla ${plantilla.letra} y el informe usa la ${o.plantillaInforme}: se adaptó.`);
  if (!plantilla.letra) avisos.push("No se pudo reconocer la plantilla. Se clasificó por encabezados: revise la adaptación.");
  const sin = adaptacion.filas.filter((f) => !f.destino);
  if (sin.length) avisos.push(`${sin.length} ${sin.length === 1 ? "hoja no tiene" : "hojas no tienen"} equivalente y no se importan: ${sin.map((f) => f.hoja).join(", ")}.`);
  contador += 1;
  return { id: o.id ?? `l${Date.now().toString(36)}${contador}`, archivo: o.archivo, equipo: equipoDe(o.archivo, libro), origen: o.origen, plantilla, libro, adaptacion, avisos };
}

/* ---------- Cobertura: qué aportó cada equipo a cada sección -------------------------- */

export interface Cobertura {
  equipos: string[];
  secciones: { clave: string; titulo: string; porEquipo: Record<string, number> }[];
}

export function cobertura(libros: LibroRecibido[], secciones: SeccionDef[]): Cobertura {
  const equipos = [...new Set(libros.map((l) => l.equipo))];
  const base = new Map(secciones.map((s) => [s.clave, { clave: s.clave, titulo: s.titulo, porEquipo: {} as Record<string, number> }]));
  for (const l of libros) {
    l.adaptacion.propuestas.forEach((p, k) => {
      if (!p.destino) return;
      const clave = p.destino.split(":")[0];
      const fila = base.get(clave);
      if (!fila || p.destino.endsWith(":crit")) return;
      fila.porEquipo[l.equipo] = (fila.porEquipo[l.equipo] ?? 0) + l.libro.bloques[k].filas.length;
    });
  }
  return { equipos, secciones: [...base.values()].filter((s) => Object.keys(s.porEquipo).length) };
}

/* ---------- Indicadores: leer, agrupar y unificar --------------------------------------- */

export interface Observacion {
  libroId: string;
  equipo: string;
  hoja: string;
  fila: number;
  texto: string;
  criterio: string;
  unidad: string;
  actual: number | null;
  actualCrudo: string;
  meta: number | null;
  anterior: number | null;
  fuente: string;
  /** Posición de la fila dentro de `bloque.filas` (para reescribirla al importar). */
  bloque: number;
  indice: number;
}

const MENORES: Record<string, number> = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS: Record<string, number> = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };

/** «mil ciento veintiséis» → 1126. Hasta 999.999; nulo si no es un número en letras. */
export function numeroEnLetras(texto: string): number | null {
  const palabras = sinTildes(texto).split(/[\s,]+/).filter((p) => p && p !== "y");
  if (!palabras.length) return null;
  let total = 0;
  let parcial = 0;
  for (const p of palabras) {
    if (p in MENORES) parcial += MENORES[p];
    else if (p in DECENAS) parcial += DECENAS[p];
    else if (p in CENTENAS) parcial += CENTENAS[p];
    else if (p === "mil") {
      total += (parcial || 1) * 1000;
      parcial = 0;
    } else return null;
  }
  return total + parcial;
}

export const leerNumero = (s: string): { valor: number | null; enLetras: boolean } => {
  const n = numeroDe(s.replace(/\s*%$/, "").replace(/^\$\s*/, ""));
  if (n !== null) return { valor: n, enLetras: false };
  const l = s.trim() ? numeroEnLetras(s) : null;
  return { valor: l, enLetras: l !== null };
};

/** Las observaciones de cifras de los libros: una por fila de las hojas que quedaron en una sección de resultados. */
export function observaciones(libros: LibroRecibido[], secciones: SeccionDef[]): Observacion[] {
  const destinos = destinosDe(secciones);
  const out: Observacion[] = [];
  for (const l of libros) {
    l.libro.bloques.forEach((b, k) => {
      const p = l.adaptacion.propuestas[k];
      const d = p.destino ? destinos.find((x) => x.id === p.destino) : undefined;
      if (!d || d.rol !== "datos" || d.def.tipo !== "dim") return;
      const col = (titulo: string) => {
        const j = d.columnas.findIndex((c) => c.titulo === titulo);
        return j >= 0 ? p.columnas[j] : -1;
      };
      const iInd = col("Indicador"), iCrit = col("Criterio"), iAct = col("Cifra actual"), iUni = col("Unidad"), iMeta = col("Meta"), iAnt = col("Año anterior"), iFuente = col("Fuente"), iTipo = col("Tipo");
      if (iInd < 0) return;
      b.filas.forEach((f, i) => {
        const texto = (f[iInd] ?? "").trim();
        if (!texto) return;
        if (iTipo >= 0 && (f[iTipo] ?? "").trim()) return; // una acción, no una cifra
        const cr = (iAct >= 0 ? f[iAct] : "") ?? "";
        const act = leerNumero(cr);
        out.push({
          libroId: l.id,
          equipo: l.equipo,
          hoja: b.hoja,
          fila: b.numeros[i],
          texto,
          criterio: iCrit >= 0 ? (f[iCrit] ?? "").trim() : "",
          unidad: iUni >= 0 ? (f[iUni] ?? "").trim() : "",
          actual: act.valor,
          actualCrudo: cr.trim(),
          meta: iMeta >= 0 ? leerNumero(f[iMeta] ?? "").valor : null,
          anterior: iAnt >= 0 ? leerNumero(f[iAnt] ?? "").valor : null,
          fuente: iFuente >= 0 ? (f[iFuente] ?? "").trim() : "",
          bloque: k,
          indice: i,
        });
      });
    });
  }
  return out;
}

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "en", "por", "con", "y", "a", "al", "para", "un", "una", "total", "numero", "n"]);
/** Raíz corta de cada palabra, para que «matriculados» y «matrícula» cuenten como la misma. */
const raiz = (t: string) => (t.length > 6 ? t.slice(0, 6) : t);
const fichas = (s: string): string[] => sinTildes(s).replace(/[^a-z0-9% ]+/g, " ").split(/\s+/).filter((t) => t && !VACIAS.has(t)).map(raiz);
const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
};
/** Dos nombres son el mismo indicador si comparten la mayoría de sus palabras con contenido. */
export const UMBRAL_MISMO_INDICADOR = 0.6;

export type EstadoGrupo = "unico" | "unificado" | "conflicto" | "sin_dato";

export interface Grupo {
  id: string;
  criterio: string;
  /** El nombre con que queda en el informe (el más usado; la persona puede cambiarlo). */
  nombre: string;
  alias: { texto: string; equipo: string }[];
  obs: Observacion[];
  fuentePrimaria: string;
  unidad: string;
}

const masFrecuente = (xs: string[]): string => {
  const c = new Map<string, number>();
  for (const x of xs) if (x.trim()) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? "";
};

export function agruparIndicadores(obs: Observacion[]): Grupo[] {
  const grupos: { fich: string[]; obs: Observacion[] }[] = [];
  for (const o of obs) {
    const f = fichas(o.texto);
    const g = grupos.find((x) => jaccard(x.fich, f) >= UMBRAL_MISMO_INDICADOR && (!o.criterio || !x.obs[0].criterio || sinTildes(o.criterio) === sinTildes(x.obs[0].criterio)));
    if (g) {
      g.obs.push(o);
      if (f.length > g.fich.length) g.fich = f;
    } else grupos.push({ fich: f, obs: [o] });
  }
  return grupos.map((g, i) => ({
    id: `g${i + 1}`,
    criterio: masFrecuente(g.obs.map((o) => o.criterio)),
    nombre: masFrecuente(g.obs.map((o) => o.texto)) || g.obs[0].texto,
    alias: g.obs.map((o) => ({ texto: o.texto, equipo: o.equipo })),
    obs: g.obs,
    fuentePrimaria: masFrecuente(g.obs.map((o) => o.fuente)),
    unidad: masFrecuente(g.obs.map((o) => o.unidad)),
  }));
}

export interface Decision {
  /** Equipo cuyo valor manda; «fuente» = el del equipo que cita la fuente primaria. */
  eligio?: string;
  nombre?: string;
}
export type Decisiones = Record<string, Decision>;

const valoresDistintos = (g: Grupo): number[] => [...new Set(g.obs.map((o) => o.actual).filter((v): v is number => v !== null))];

export function estadoGrupo(g: Grupo, d: Decisiones = {}): EstadoGrupo {
  const v = valoresDistintos(g);
  if (!v.length) return "sin_dato";
  if (v.length > 1 && !d[g.id]?.eligio) return "conflicto";
  return g.obs.length > 1 ? "unificado" : "unico";
}

/** La observación que manda en un grupo: la que eligió la persona, la de la fuente primaria o, si todas coinciden, la primera con dato. */
export function observacionOficial(g: Grupo, d: Decisiones = {}): Observacion | null {
  const con = g.obs.filter((o) => o.actual !== null);
  if (!con.length) return null;
  const e = d[g.id]?.eligio;
  if (e === "fuente") {
    const prim = sinTildes(g.fuentePrimaria);
    return con.find((o) => prim && sinTildes(o.fuente) === prim) ?? con[0];
  }
  if (e) return con.find((o) => o.equipo === e) ?? null;
  return valoresDistintos(g).length > 1 ? null : con[0];
}

export const nombreOficial = (g: Grupo, d: Decisiones = {}) => d[g.id]?.nombre?.trim() || g.nombre;

export function resumenIndicadores(grupos: Grupo[], d: Decisiones = {}) {
  const c = { listos: 0, conflictos: 0, sinDato: 0, unificados: 0 };
  for (const g of grupos) {
    const e = estadoGrupo(g, d);
    if (e === "conflicto") c.conflictos++;
    else if (e === "sin_dato") c.sinDato++;
    else c.listos++;
    if (g.obs.length > 1 || new Set(g.alias.map((a) => sinTildes(a.texto))).size > 1) c.unificados++;
  }
  return c;
}

/* ---------- Qué secciones redacta Pilo y con qué datos ---------------------------------- */

/** Las secciones de texto: resumen, alineación, resultados y conclusiones. Las de filas, metas y logros se llenan con el Excel. */
export const TIPOS_REDACTABLES = new Set(["narr", "pdi", "dim"]);
export const seccionesRedactables = (secciones: SeccionDef[]): SeccionDef[] => secciones.filter((s) => TIPOS_REDACTABLES.has(s.tipo) && !s.soloLectura && !s.consolida);

export interface DatosParaPilo {
  unidad: string;
  anio: number;
  plantilla: Plantilla;
  seccion: { clave: string; titulo: string; tipo: string; extension?: string };
  equipos: { nombre: string; plantilla: string | null; hojas: string[] }[];
  indicadores: { clave: string; nombre: string; criterio: string; unidad: string; valor: number | null; meta: number | null; anterior: number | null; fuentePrimaria: string; reporto: { equipo: string; escribio: string; valor: number | null }[]; conflicto: boolean }[];
  /** Filas de las demás hojas (metas, puntos críticos, logros…) que van a esta sección o la rodean, ya leídas. */
  hojas: { equipo: string; hoja: string; destino: string; encabezados: string[]; filas: string[][] }[];
  textosPrevios: Record<string, string>;
}

/** Clave estable de un indicador para los tokens `[[clave]]` del texto: «ind_<criterio>_<id>». */
export const claveDeGrupo = (g: Grupo): string => `ind_c_${g.id}`;

export function datosParaPilo(o: { unidad: string; anio: number; plantilla: Plantilla; seccion: SeccionDef; libros: LibroRecibido[]; grupos: Grupo[]; decisiones: Decisiones; textosPrevios?: Record<string, string>; secciones: SeccionDef[] }): DatosParaPilo {
  const destinos = destinosDe(o.secciones);
  const hojas: DatosParaPilo["hojas"] = [];
  for (const l of o.libros) {
    l.libro.bloques.forEach((b, k) => {
      const p = l.adaptacion.propuestas[k];
      const d = p.destino ? destinos.find((x) => x.id === p.destino) : undefined;
      if (!d || (d.def.tipo === "dim" && d.rol === "datos")) return; // las cifras van en `indicadores`
      hojas.push({ equipo: l.equipo, hoja: b.hoja, destino: d.titulo, encabezados: b.encabezados, filas: b.filas.slice(0, 200) });
    });
  }
  return {
    unidad: o.unidad,
    anio: o.anio,
    plantilla: o.plantilla,
    seccion: { clave: o.seccion.clave, titulo: o.seccion.titulo, tipo: o.seccion.tipo, extension: o.seccion.extension },
    equipos: o.libros.map((l) => ({ nombre: l.equipo, plantilla: l.plantilla.letra, hojas: l.libro.bloques.map((b) => b.hoja) })),
    indicadores: o.grupos.map((g) => {
      const of = observacionOficial(g, o.decisiones);
      return {
        clave: claveDeGrupo(g),
        nombre: nombreOficial(g, o.decisiones),
        criterio: g.criterio,
        unidad: g.unidad,
        valor: of?.actual ?? null,
        meta: of?.meta ?? g.obs.find((x) => x.meta !== null)?.meta ?? null,
        anterior: of?.anterior ?? null,
        fuentePrimaria: g.fuentePrimaria,
        reporto: g.obs.map((x) => ({ equipo: x.equipo, escribio: x.texto, valor: x.actual })),
        conflicto: estadoGrupo(g, o.decisiones) === "conflicto",
      };
    }),
    hojas,
    textosPrevios: o.textosPrevios ?? {},
  };
}

/** Cuenta palabras de un texto con tokens: cada token cuenta como una palabra. */
export const contarPalabras = (t: string): number => (t.trim() ? t.trim().split(/\s+/).length : 0);

/* ---------- Aplicar al informe ----------------------------------------------------------- */

export interface BorradorSeccion {
  clave: string;
  texto: string;
  aprobado: boolean;
  /** La persona lo editó en esta pantalla. */
  editado: boolean;
  /** Huella de los datos con que Pilo lo escribió: si cambia, el texto quedó desactualizado. */
  huella?: string;
  palabras?: number;
  partes?: number;
  nivel?: string;
  pensamientoS?: number;
}

/** Una huella corta de lo que Pilo ve para una sección (indicadores, valores oficiales y hojas): cambia si cambia un dato. */
export function huellaDatos(d: DatosParaPilo): string {
  const t = JSON.stringify([d.indicadores.map((i) => [i.clave, i.nombre, i.valor, i.conflicto]), d.hojas.map((h) => [h.equipo, h.hoja, h.filas.length, h.filas.slice(0, 3)]), d.equipos.map((x) => x.nombre)]);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Un valor como se lee en el informe: «3.912», «11,2 %». */
export function formatoValor(v: number, unidad = ""): string {
  const n = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(v);
  return /%/.test(unidad) ? `${n} %` : n;
}

export interface EntradaCompilar {
  libros: LibroRecibido[];
  grupos: Grupo[];
  decisiones: Decisiones;
  secciones: SeccionDef[];
  contenidos: Record<string, ContenidoSeccion | null | undefined>;
  aprobados: { id: string; nombre: string }[];
  pilares: PilarOpcion[];
  anexos: AnexoRow[];
  modo: ModoAplicacion;
  estado: EstadoInstancia;
  rol: RolInforme | null;
  /** Secciones con datos aprobadas para escribir (claves «s4»). Sin lista, todas. */
  seccionesDatos?: Set<string>;
  borradores: BorradorSeccion[];
}

export interface ResultadoCompilar {
  contenidos: Record<string, ContenidoSeccion>;
  evidencias: EnlaceEvidencia[];
  avisos: string[];
  filas: number;
  seccionesConDatos: number;
  textosDePilo: number;
  bloqueado?: string;
}

const fmtNum = (n: number): string => String(n).replace(".", ",");

/** Reescribe las filas de cifras de un libro con el nombre unificado y el valor oficial, y quita las de equipos que no mandan. */
export function bloquesConDecisiones(l: LibroRecibido, grupos: Grupo[], d: Decisiones, secciones: SeccionDef[]): { bloques: BloqueLibro[]; quitadas: number } {
  const destinos = destinosDe(secciones);
  const bloques = l.libro.bloques.map((b) => ({ ...b, filas: b.filas.map((f) => [...f]), numeros: [...b.numeros] }));
  let quitadas = 0;
  l.libro.bloques.forEach((b, k) => {
    const p = l.adaptacion.propuestas[k];
    const dest = p.destino ? destinos.find((x) => x.id === p.destino) : undefined;
    if (!dest || dest.rol !== "datos" || dest.def.tipo !== "dim") return;
    const col = (t: string) => {
      const j = dest.columnas.findIndex((c) => c.titulo === t);
      return j >= 0 ? p.columnas[j] : -1;
    };
    const iInd = col("Indicador"), iAct = col("Cifra actual");
    const quitar = new Set<number>();
    for (const g of grupos) {
      const oficial = observacionOficial(g, d);
      for (const o of g.obs) {
        if (o.libroId !== l.id || o.bloque !== k) continue;
        if (g.obs.length > 1 && oficial && oficial !== o) {
          quitar.add(o.indice);
          continue;
        }
        const fila = bloques[k].filas[o.indice];
        if (iInd >= 0) fila[iInd] = nombreOficial(g, d);
        if (iAct >= 0 && oficial && o === oficial && o.actual !== null) fila[iAct] = fmtNum(o.actual);
      }
    }
    if (quitar.size) {
      quitadas += quitar.size;
      bloques[k].filas = bloques[k].filas.filter((_, i) => !quitar.has(i));
      bloques[k].numeros = bloques[k].numeros.filter((_, i) => !quitar.has(i));
    }
  });
  return { bloques, quitadas };
}

/**
 * Lo que se escribe en el informe: cada libro pasa por `aplicar` (el mismo del Libro de Excel), uno tras otro,
 * y los textos de Pilo aprobados quedan en `texto` con `borrador_pilo` igual, que es la marca «Borrador de Pilo»
 * hasta que la persona los edite.
 */
export function compilarAlInforme(e: EntradaCompilar): ResultadoCompilar {
  let acumulado: Record<string, ContenidoSeccion | null | undefined> = { ...e.contenidos };
  const escritos: Record<string, ContenidoSeccion> = {};
  const evidencias: EnlaceEvidencia[] = [];
  const avisos: string[] = [];
  let filas = 0;
  let bloqueado: string | undefined;
  const con = new Set<string>();
  for (const l of e.libros) {
    const { bloques, quitadas } = bloquesConDecisiones(l, e.grupos, e.decisiones, e.secciones);
    if (quitadas) avisos.push(`${l.equipo}: ${quitadas} ${quitadas === 1 ? "fila repetida" : "filas repetidas"} de otro equipo quedaron fuera; manda el valor oficial.`);
    const propuestas = l.adaptacion.propuestas.map((p) => (p.destino && e.seccionesDatos && !e.seccionesDatos.has(p.destino.split(":")[0]) ? { ...p, destino: null, nivel: "sin" as const } : p));
    const r: ResultadoAplicar = aplicar({ bloques, propuestas, contexto: { secciones: e.secciones, contenidos: acumulado, aprobados: e.aprobados, pilares: e.pilares, anexos: e.anexos }, modo: e.modo, estado: e.estado, rol: e.rol, aporta: l.equipo });
    if (r.bloqueado) {
      bloqueado = r.bloqueado;
      break;
    }
    acumulado = { ...acumulado, ...r.contenidos };
    Object.assign(escritos, r.contenidos);
    evidencias.push(...r.evidencias);
    avisos.push(...r.avisos.map((a) => `${l.equipo}: ${a}`));
    for (const s of r.secciones) {
      filas += s.agregadas + s.completadas;
      if (s.agregadas + s.completadas) con.add(s.clave);
    }
  }
  // Los tokens de Pilo (ind_c_gN) pasan a la clave que el informe da a cada indicador; sin indicador escrito, queda el valor.
  const clavesInforme = new Map<string, string>();
  const dims = e.secciones.filter((x) => x.tipo === "dim");
  for (const g of e.grupos) {
    const nombre = sinTildes(nombreOficial(g, e.decisiones).trim());
    for (const def of dims) {
      const ind = ((escritos[def.clave] ?? acumulado[def.clave])?.indicadores ?? []).find((i) => sinTildes(i.nombre.trim()) === nombre);
      if (ind) {
        clavesInforme.set(claveDeGrupo(g), claveIndicador(def.clave, ind.id));
        break;
      }
    }
  }
  let sinEnlace = 0;
  const enlazar = (texto: string): string =>
    texto.replace(/\[\[([a-z0-9_]+)\]\]/gi, (m, k: string) => {
      const real = clavesInforme.get(k.toLowerCase());
      if (real) return `[[${real}]]`;
      const g = e.grupos.find((x) => claveDeGrupo(x) === k.toLowerCase());
      const o = g ? observacionOficial(g, e.decisiones) : null;
      if (g && o && o.actual !== null) {
        sinEnlace++;
        return formatoValor(o.actual, g.unidad);
      }
      return m;
    });
  let textos = 0;
  for (const b0 of e.borradores) {
    const b = { ...b0, texto: enlazar(b0.texto) };
    if (!b.aprobado || !b.texto.trim()) continue;
    const def = e.secciones.find((s) => s.clave === b.clave);
    if (!def || !TIPOS_REDACTABLES.has(def.tipo)) continue;
    const previo = (escritos[b.clave] ?? acumulado[b.clave] ?? {}) as ContenidoSeccion;
    const texto = e.modo === "agregar" && previo.texto?.trim() ? `${previo.texto.trim()}\n\n${b.texto.trim()}` : e.modo === "vacios" && previo.texto?.trim() ? previo.texto : b.texto.trim();
    if (texto === previo.texto) continue;
    // Solo un texto que viene entero de Pilo se marca como suyo; mezclado con lo escrito, ya es de la persona.
    escritos[b.clave] = { ...previo, texto, borrador_pilo: texto === b.texto.trim() && !b.editado ? texto : null };
    textos += 1;
  }
  if (sinEnlace) avisos.push(`${sinEnlace} ${sinEnlace === 1 ? "cifra del texto de Pilo quedó escrita con su valor" : "cifras del texto de Pilo quedaron escritas con su valor"} porque su indicador no entró a Resultados; no seguirán a su fuente.`);
  return { contenidos: escritos, evidencias, avisos, filas, seccionesConDatos: con.size, textosDePilo: textos, bloqueado };
}

export type { PilarRef };
export const TITULOS_RESULTADOS = COLUMNAS_LIBRO_RESULTADOS;

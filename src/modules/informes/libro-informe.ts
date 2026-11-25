/* =============================================================================
   Libro de Excel del informe de gestión · exportar, reconocer, revisar e importar.

   Un informe completo cabe en un libro: portada, una hoja por sección (`NN Nombre`), y dos hojas
   ocultas (`Listas`, `_Control`). Las oficinas lo comparten con sus equipos, lo reciben diligenciado
   y lo cargan de vuelta. Aquí vive la lógica pura (sin React ni exceljs, sobre `HojaExcel[]` y
   `HojaLeida[]`):

     armarLibro / armarLibrosPorEquipo  → hojas para descargar
     leerLibro                          → bloques {hoja, encabezados, filas} de lo que llega
     clasificar                         → a qué sección va cada hoja (por `_Control` o por encabezados)
     aplicar                            → el contenido nuevo de cada sección según el modo, con avisos

   La hoja de resultados usa las columnas de la hoja «Indicadores» (indicadores-manual.ts), así
   que la lee `leerFilasIndicadores`, el mismo codec de «Resultados y evidencias». Nunca se
   inventan cifras: una celda vacía queda vacía.
   ========================================================================== */

import { numeroDe } from "./cifras-vivas";
import { COLUMNAS_CRITERIOS_LIBRO, COLUMNAS_RESULTADOS, PALABRAS_CLAVE, columnasDeSeccion, esSoloReferencia, normalizarTexto } from "./libro-columnas";
import type { ColumnaLibro } from "./libro-columnas";
import { normalizarAlineacion, conAlineacion } from "./alineacion";
import { puedeEditar } from "./estados";
import { MAX_FILAS } from "./filas-excel";
import { filasALogros, filasAMetas, logrosAFilas, metasAFilas } from "./excel-secciones";
import {
  CRITERIOS_BASE,
  COLUMNAS_LIBRO_RESULTADOS,
  TIPO_ACCION,
  TIPO_CIFRA,
  criteriosDe,
  criteriosMarcados,
  esAccion,
  evaluar,
  faltantes,
  filasCriterios,
  filasResultadosLibro,
  idNuevo,
  indicadorNuevo,
  leerFilasIndicadores,
  normalizar,
  opcionesPilar,
  pilarDeTexto,
  MAS_ES_MEJOR,
  MENOS_ES_MEJOR,
} from "./indicadores-manual";
import type { Criterio, CriterioPropio, IndicadorManual, LecturaIndicadores, PilarOpcion } from "./indicadores-manual";
import { plantillaDe } from "./plantillas";
import { palabras } from "./tokens";
import { ETIQUETA_ESTADO_META, estadoMeta } from "./vista/estados";
import type { HojaExcel, HojaLeida, TipoCelda } from "./ui/excel";
import type { AnexoRow, BloqueLibre, ContenidoSeccion, EstadoInstancia, Logro, Meta, PilarRef, Plantilla, RolInforme, SeccionDef } from "./types";

/* ---------- Constantes ------------------------------------------------------------ */

export const VERSION_LIBRO = 1;
export const HOJA_PORTADA = "00 Portada";
export const HOJA_LISTAS = "Listas";
export const HOJA_CONTROL = "_Control";
/** El encabezado de las hojas del sistema está bajo la banda de tres filas. */
export const FILA_ENCABEZADO = 4;
const LIMITE_CELDA = 32000;
/** Hojas que el sistema agrega y que nunca se clasifican. */
const esHojaDeApoyo = (nombre: string) => nombre === HOJA_PORTADA || nombre === HOJA_LISTAS || nombre === HOJA_CONTROL || /^c[oó]mo llenar/i.test(nombre.trim());

export type ModoAplicacion = "agregar" | "vacios" | "reemplazar";
export const MODOS: { id: ModoAplicacion; titulo: string; ayuda: string }[] = [
  { id: "agregar", titulo: "Agregar al final", ayuda: "Suma lo del libro a lo que ya está escrito. Lo que ya existe no se toca." },
  { id: "vacios", titulo: "Llenar solo lo vacío", ayuda: "Completa las celdas que están vacías en el informe y suma las filas que no existen. Nada de lo escrito se cambia." },
  { id: "reemplazar", titulo: "Reemplazar la sección", ayuda: "Lo del libro queda en lugar de lo que había en cada sección importada." },
];

const sinTildes = normalizarTexto;
const FILA_EJEMPLO = /\(borre esta fila\)/i;

/* ---------- Estructura: hojas y destinos ------------------------------------------- */

export interface Destino {
  /** «s3» (la hoja de la sección) o «s3:crit» (la hoja de criterios de Resultados). */
  id: string;
  clave: string;
  def: SeccionDef;
  rol: "datos" | "criterios";
  titulo: string;
  columnas: ColumnaLibro[];
  palabras: string[];
}

const limpiarNombre = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
const dos = (n: number) => String(n).padStart(2, "0");

/** «05 Resultados y evidencias» (31 caracteres como máximo). El número es la posición en la estructura completa. */
export const nombreHoja = (posicion: number, titulo: string): string => limpiarNombre(`${dos(posicion + 1)} ${titulo}`).slice(0, 31).trim();
const nombreHojaCriterios = (posicion: number) => `${dos(posicion + 1)} Criterios`;

/** ¿Esta sección deja elegir a qué criterios reporta la unidad? (las que consolidan muestran los suyos). */
const llevaCriterios = (def: SeccionDef) => def.tipo === "dim" && !def.consolida;

/** Las hojas que se pueden importar, una por sección (más la de criterios de Resultados). Matriz y anexos no se importan. */
export function destinosDe(secciones: SeccionDef[]): Destino[] {
  const out: Destino[] = [];
  for (const def of secciones) {
    if (esSoloReferencia(def)) continue;
    out.push({ id: def.clave, clave: def.clave, def, rol: "datos", titulo: def.titulo, columnas: columnasDeSeccion(def), palabras: PALABRAS_CLAVE[def.tipo] });
    if (llevaCriterios(def)) out.push({ id: `${def.clave}:crit`, clave: def.clave, def, rol: "criterios", titulo: `${def.titulo} · criterios`, columnas: COLUMNAS_CRITERIOS_LIBRO, palabras: PALABRAS_CLAVE.crit });
  }
  return out;
}

/** Una huella corta de la estructura (secciones, tipos, columnas y dimensiones): cambia si Planeación cambia la estructura. */
export function huellaDe(plantilla: Plantilla, secciones: SeccionDef[]): string {
  const texto = `${plantilla}|${secciones.map((s) => [s.clave, s.tipo, (s.columnas ?? []).join("¦"), (s.dims ?? []).join(","), s.consolida ? "c" : ""].join(":")).join("|")}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* ---------- Exportar ----------------------------------------------------------------- */

export type ContenidosPorClave = Record<string, ContenidoSeccion | null | undefined>;

export interface EntradaLibro {
  ciclo: { id: string; anio: number };
  /** informe_instancias.id: lo que une el libro con este informe. */
  instancia: string;
  unidad: string;
  plantilla: Plantilla;
  /** Las secciones activas del informe, en su orden (`resolverSecciones`). */
  secciones: SeccionDef[];
  contenidos: ContenidosPorClave;
  aprobados: { id: string; nombre: string }[];
  pilares: PilarRef[];
  anexos: AnexoRow[];
  /** Fecha de la exportación (aaaa-mm-dd); por defecto, hoy. */
  fecha?: string;
  /** Protege las celdas grises (sin contraseña). Por defecto, sí. */
  proteger?: boolean;
}

export interface OpcionesArmado {
  /** Claves de las secciones que van en este libro (por defecto, todas). */
  incluir?: string[];
  /** Nombre del equipo que recibe el libro (aparece en la portada y en `_Control`). */
  equipo?: string;
}

const textoCelda = (t: string) => (t.length > LIMITE_CELDA ? t.slice(0, LIMITE_CELDA) : t);
const hoy = () => new Date().toISOString().slice(0, 10);

const INSTRUCCIONES = [
  "Escriba solo en las celdas de color azul claro. Las amarillas son obligatorias.",
  "En la hoja de criterios marque a cuáles reporta su oficina. En la de resultados escriba sus cifras o acciones: el estado lo calcula el sistema.",
  "Las celdas grises vienen del sistema y están bloqueadas.",
  "No cambie los nombres de las hojas ni de los encabezados.",
  "Una fila por logro, punto, evidencia o indicador. Borre las filas de ejemplo.",
  "Devuelva el archivo a quien se lo envió. Se carga en el informe con el botón «Libro de Excel».",
];

const AYUDA_HOJA: Record<string, string> = {
  narr: "Escriba el texto de la sección en la celda amarilla.",
  libre: "Un párrafo por fila. Las tablas y gráficas de UDrive se agregan desde el informe.",
  pdi: "Pilares y avance vienen del Plan de Desarrollo. Marque Sí en los pilares con los que se articula su unidad y escriba su aporte.",
  metas: "Una fila por objetivo o meta anual. Programado y Alcanzado: solo números. El resultado (Superada, Cumplida o Parcial) lo calcula el informe.",
  dim: "Una fila por cifra o acción. Cifra: año anterior, actual y meta. Acción: qué es, qué se ha hecho, cuándo termina. El estado sale de la aritmética, no se escribe. Aún no hay cifras vivas del sistema: todo lo reporta la unidad.",
  criterios: "Marque Sí en los criterios a los que reporta su oficina; si falta uno, escríbalo en las filas finales. Solo esos criterios salen en la hoja de resultados.",
  matriz: "Se arma sola con las cifras de las demás hojas. No se diligencia ni se importa.",
  filas: "Una fila por punto. Se recomienda con acción y fecha.",
  logros: "Un logro por fila. N.º de anexo: el número de la evidencia que lo respalda.",
  evid: "Las evidencias cargadas aparecen aquí. Para sumar una desde el libro, escriba su nombre, para qué sirve y un enlace https://. Los archivos se suben desde el informe.",
  anexos: "Lista numerada de los archivos y enlaces cargados. Se arma sola.",
};

/** La sección en filas de Excel y los ajustes de la hoja (colores, listas). */
function hojaDeSeccion(def: SeccionDef, posicion: number, e: EntradaLibro, listas: ListasLibro, proteger: boolean): { id: string; hoja: HojaExcel }[] {
  const c = e.contenidos[def.clave] ?? {};
  const cols = columnasDeSeccion(def);
  const hojas: { id: string; hoja: HojaExcel }[] = [];
  const base = (extra: Partial<HojaExcel> & Pick<HojaExcel, "filas">, columnas: ColumnaLibro[] = cols, ayuda = AYUDA_HOJA[def.tipo]): HojaExcel => ({
    nombre: nombreHoja(posicion, def.titulo),
    columnas: columnas.map((x) => ({ titulo: x.titulo, ancho: x.ancho })),
    tipos: columnas.map((x) => x.tipo),
    banner: { titulo: def.titulo, subtitulo: `Informe de gestión ${e.ciclo.anio} · ${e.unidad} · Hoja ${dos(posicion + 1)}`, ayuda },
    proteger: proteger && columnas.some((x) => x.tipo === "bloqueada"),
    ...extra,
  });
  const ejemplo = (n: number) => `Ejemplo ${n}: reemplace o borre esta fila (borre esta fila)`;
  switch (def.tipo) {
    case "narr": {
      const t = textoCelda(c.texto ?? "");
      hojas.push({ id: def.clave, hoja: base({ filas: [[t, palabras(t)]], filasLibres: 0 }) });
      break;
    }
    case "libre": {
      const textos = (c.bloques ?? []).flatMap((b) => (b.tipo === "texto" && b.texto.trim() ? [textoCelda(b.texto)] : []));
      hojas.push({ id: def.clave, hoja: base({ filas: (textos.length ? textos : [""]).map((t) => [t, palabras(t)]), filasLibres: 10 }) });
      break;
    }
    case "pdi": {
      const aportes = new Map(normalizarAlineacion(c).map((a) => [a.pilar, a]));
      const filas = e.pilares.map((p) => {
        const a = aportes.get(p.id);
        return [`${p.numeral}. ${p.name}`, p.progress === null ? "" : `${p.progress} %`, a ? "Sí" : "", a ? textoCelda(a.aporte) : ""];
      });
      hojas.push({ id: def.clave, hoja: base({ filas, filasLibres: 0, listas: { 2: ["Sí", "No"] } }) });
      break;
    }
    case "metas": {
      const metas = c.metas ?? [];
      const filas = metas.length
        ? metasAFilas(metas).map((f, i) => [...f, resultadoMeta(metas[i])])
        : [
            ["Ejemplo: graduar 120 estudiantes en el año (borre esta fila)", "120", "104", ""],
            ["Ejemplo: abrir 4 convenios nuevos (borre esta fila)", "4", "5", ""],
          ];
      hojas.push({ id: def.clave, hoja: base({ filas, filasLibres: 20 }) });
      break;
    }
    case "dim": {
      const indicadores = normalizar(c.indicadores);
      const criterios = criteriosDe(def.dims ?? [], e.aprobados, c.criterios_propios ?? [], !def.consolida);
      const pilares = opcionesPilar(e.pilares);
      const ejemplos: IndicadorManual[] = [];
      if (!indicadores.length && criterios[0]) {
        ejemplos.push({ ...indicadorNuevo(criterios[0].id, criterios[0].nombre), nombre: "Ejemplo: semilleros activos (borre esta fila)", anterior: 9, actual: 12, meta: 15, fuente: "Registro de la unidad" });
        ejemplos.push({ ...indicadorNuevo((criterios[1] ?? criterios[0]).id, (criterios[1] ?? criterios[0]).nombre, "accion"), nombre: "Ejemplo: convocatoria interna con pares (borre esta fila)", descripcion: "Qué es la acción", avance_texto: "Qué se ha hecho con ella", finalizacion: "Diciembre de 2026" });
      }
      const filas = filasResultadosLibro(indicadores.length ? indicadores : ejemplos, criterios, pilares);
      const l: Record<number, string[] | { rango: string }> = { 0: { rango: listas.criterios }, 3: [MAS_ES_MEJOR, MENOS_ES_MEJOR], 9: [TIPO_CIFRA, TIPO_ACCION] };
      if (e.pilares.length) l[15] = { rango: listas.pilares };
      if (llevaCriterios(def)) {
        const marcados = criteriosMarcados(c.criterios_reporta, indicadores);
        const origen = filasCriterios(criterios);
        const celdas: NonNullable<HojaExcel["celdas"]> = criterios.map((_, i) => ({ fila: i, columna: 0, tipo: "bloqueada" as TipoCelda }));
        hojas.push({
          id: `${def.clave}:crit`,
          hoja: {
            nombre: nombreHojaCriterios(posicion),
            columnas: COLUMNAS_CRITERIOS_LIBRO.map((x) => ({ titulo: x.titulo, ancho: x.ancho })),
            tipos: COLUMNAS_CRITERIOS_LIBRO.map((x) => x.tipo),
            celdas,
            filas: criterios.map((k, i) => [k.nombre, marcados.has(k.id) ? "Sí" : "", origen[i]?.[1] ?? ""]),
            filasLibres: 6,
            listas: { 1: ["Sí", "No"] },
            banner: { titulo: `${def.titulo} · criterios a los que reporta`, subtitulo: `Informe de gestión ${e.ciclo.anio} · ${e.unidad} · Hoja ${dos(posicion + 1)}`, ayuda: AYUDA_HOJA.criterios },
            proteger,
          },
        });
      }
      hojas.push({ id: def.clave, hoja: base({ filas, filasLibres: 40, listas: l }) });
      break;
    }
    case "matriz":
      hojas.push({ id: def.clave, hoja: base({ filas: filasMatriz(e), filasLibres: 0 }) });
      break;
    case "filas": {
      const columnas = def.columnas ?? [];
      const dim = columnas[0] === "Dimensión";
      const filas = (c.filas ?? []).length ? (c.filas ?? []).map((f) => columnas.map((_, i) => textoCelda(String(f[i] ?? "")))) : [0, 1].map((n) => columnas.map((x, i) => (i === 0 && dim ? CRITERIOS_BASE[n]?.nombre ?? "" : i === 0 ? ejemplo(n + 1) : "")));
      hojas.push({ id: def.clave, hoja: base({ filas, filasLibres: 30, listas: dim ? { 0: CRITERIOS_BASE.map((d) => d.nombre) } : undefined }) });
      break;
    }
    case "logros": {
      const l = c.logros ?? [];
      const filas = l.length ? logrosAFilas(l) : [["Ejemplo: primera convocatoria interna con pares internacionales (borre esta fila)", "Qué se hizo, con quién, qué cambió y en qué cifra se nota.", "1"]];
      hojas.push({ id: def.clave, hoja: base({ filas, filasLibres: 20 }) });
      break;
    }
    case "evid": {
      const filas = e.anexos.map((a) => [a.n, a.nombre, a.descripcion, a.tipo === "url" ? a.ruta : ""]);
      hojas.push({ id: def.clave, hoja: base({ filas, filasLibres: 15 }) });
      break;
    }
    case "anexos":
      hojas.push({ id: def.clave, hoja: base({ filas: e.anexos.map((a) => [a.n, a.nombre, a.tipo === "url" ? "Enlace" : "Archivo"]), filasLibres: 0 }) });
      break;
  }
  return hojas;
}

const resultadoMeta = (m: Meta | undefined): string => {
  const est = m ? estadoMeta(m.alcanzado, m.programado, true) : null;
  return est ? ETIQUETA_ESTADO_META[est] : "";
};

/** La matriz de síntesis como referencia: por criterio, cuántas cifras hay y cuántas sin dato, con su lectura. */
function filasMatriz(e: EntradaLibro): (string | number | null)[][] {
  const porCriterio = new Map<string, { nombre: string; cifras: IndicadorManual[] }>();
  for (const def of e.secciones) {
    if (def.tipo !== "dim") continue;
    const c = e.contenidos[def.clave] ?? {};
    const criterios = criteriosDe(def.dims ?? [], e.aprobados, c.criterios_propios ?? [], true);
    for (const i of normalizar(c.indicadores)) {
      if (esAccion(i)) continue;
      const g = porCriterio.get(i.criterio) ?? { nombre: criterios.find((k) => k.id === i.criterio)?.nombre ?? i.criterio_nombre ?? i.criterio, cifras: [] };
      g.cifras.push(i);
      porCriterio.set(i.criterio, g);
    }
  }
  if (!porCriterio.size) return [["Se arma sola cuando las demás hojas tengan cifras", "", "", ""]];
  return [...porCriterio.values()].map((g) => {
    const cuenta: Record<string, number> = {};
    for (const i of g.cifras) {
      const est = evaluar(i).estado;
      if (est) cuenta[ETIQUETA_ESTADO_META[est]] = (cuenta[ETIQUETA_ESTADO_META[est]] ?? 0) + 1;
    }
    const lectura = Object.entries(cuenta).map(([k, v]) => `${v} ${k.toLowerCase()}${v === 1 ? "" : "s"}`).join(", ");
    return [g.nombre, g.cifras.length, g.cifras.filter((i) => i.actual === null).length, lectura || "Sin meta con qué comparar"];
  });
}

interface ListasLibro {
  criterios: string;
  pilares: string;
}

/** El libro (o el de un equipo) como hojas de Excel: portada, secciones, `Listas` y `_Control`. */
export function armarLibro(e: EntradaLibro, o: OpcionesArmado = {}): HojaExcel[] {
  const plantilla = plantillaDe(e.plantilla);
  const incluidas = new Set(o.incluir ?? e.secciones.map((s) => s.clave));
  const proteger = e.proteger !== false;

  // Criterios que alguien puede elegir en cualquier hoja de resultados: sin repetir por nombre.
  const nombresCriterios: string[] = [];
  for (const def of e.secciones) {
    if (def.tipo !== "dim") continue;
    const c = e.contenidos[def.clave] ?? {};
    for (const k of criteriosDe(def.dims ?? [], e.aprobados, c.criterios_propios ?? [], !def.consolida)) if (!nombresCriterios.includes(k.nombre)) nombresCriterios.push(k.nombre);
  }
  const pilares = opcionesPilar(e.pilares);
  const listas: ListasLibro = { criterios: `Listas!$A$2:$A$${Math.max(2, nombresCriterios.length + 1)}`, pilares: `Listas!$E$2:$E$${Math.max(2, pilares.length + 1)}` };

  const hojasSeccion: HojaExcel[] = [];
  const control: [string, string][] = [];
  e.secciones.forEach((def, i) => {
    if (!incluidas.has(def.clave)) return;
    for (const h of hojaDeSeccion(def, i, e, listas, proteger)) {
      control.push([h.id, h.hoja.nombre]);
      hojasSeccion.push(h.hoja);
    }
  });

  const nHojas = hojasSeccion.length;
  const filasPortada: (string | number | null)[][] = [
    ["Unidad", e.unidad],
    ["Plantilla", `${plantilla.nombre} · la diligencia ${plantilla.quien}`],
    ["Destino", plantilla.destino],
    ["Ciclo", String(e.ciclo.anio)],
    ...(o.equipo ? [["Equipo", o.equipo]] : []),
    ["Fecha de exportación", e.fecha ?? hoy()],
    ["Hojas de contenido", String(nHojas)],
    ["", ""],
    ["Cómo diligenciarlo", ""],
    ...INSTRUCCIONES.map((t, i) => [String(i + 1), t]),
    ["", ""],
    ["Azul claro", "Celda que usted diligencia."],
    ["Amarillo", "Celda obligatoria."],
    ["Gris", "La pone el sistema; está bloqueada."],
  ];
  const iLeyenda = filasPortada.findIndex((f) => f[0] === "Azul claro");
  const portada: HojaExcel = {
    nombre: HOJA_PORTADA,
    columnas: [{ titulo: "Campo", ancho: 28 }, { titulo: "Valor", ancho: 100 }],
    banner: { titulo: `Informe de gestión ${e.ciclo.anio}`, subtitulo: `${e.unidad} · Libro de recopilación`, ayuda: "Este libro se diligencia por hojas. Al devolverlo, el sistema reconoce cada hoja y la lleva a su sección del informe." },
    filas: filasPortada,
    celdas: [
      { fila: iLeyenda, columna: 0, tipo: "diligenciar" },
      { fila: iLeyenda + 1, columna: 0, tipo: "obligatoria" },
      { fila: iLeyenda + 2, columna: 0, tipo: "bloqueada" },
    ],
    filasLibres: 0,
  };

  const maxFilas = Math.max(nombresCriterios.length, pilares.length, 2);
  const hojaListas: HojaExcel = {
    nombre: HOJA_LISTAS,
    oculta: true,
    columnas: ["Criterio", "Tipo", "Qué es mejor", "Sí o no", "Pilar del PDI"].map((titulo) => ({ titulo, ancho: 34 })),
    filas: Array.from({ length: maxFilas }, (_, i) => [nombresCriterios[i] ?? null, [TIPO_CIFRA, TIPO_ACCION][i] ?? null, [MAS_ES_MEJOR, MENOS_ES_MEJOR][i] ?? null, ["Sí", "No"][i] ?? null, pilares[i]?.etiqueta ?? null]),
  };

  const filasControl: [string, string][] = [
    ["formato", "libro-informe"],
    ["version_libro", String(VERSION_LIBRO)],
    ["ciclo", e.ciclo.id],
    ["anio", String(e.ciclo.anio)],
    ["plantilla", e.plantilla],
    ["instancia", e.instancia],
    ["unidad", e.unidad],
    ["huella", huellaDe(e.plantilla, e.secciones)],
    ["generado", e.fecha ?? hoy()],
    ["fila_encabezado", String(FILA_ENCABEZADO)],
    ...(o.equipo ? ([["equipo", o.equipo]] as [string, string][]) : []),
    ...control,
  ];
  const hojaControl: HojaExcel = { nombre: HOJA_CONTROL, oculta: true, columnas: [{ titulo: "clave", ancho: 22 }, { titulo: "valor", ancho: 60 }], filas: filasControl };

  return [portada, ...hojasSeccion, hojaListas, hojaControl];
}

export interface LibroDeEquipo {
  equipo: string;
  archivo: string;
  hojas: HojaExcel[];
  claves: string[];
}

const slug = (s: string) => normalizarTexto(s).replace(/ /g, "-") || "equipo";
export const nombreArchivoLibro = (e: Pick<EntradaLibro, "ciclo" | "plantilla">, equipo?: string): string => `Informe_Gestion_${e.ciclo.anio}_${e.plantilla}${equipo ? `_${slug(equipo)}` : ""}.xlsx`;

/**
 * Un libro por equipo: `asignacion` dice a qué equipo va cada sección (por clave). Cada libro lleva solo las hojas
 * de su equipo; una sección sin equipo no va en ninguno. Todos conservan la huella de la estructura completa.
 */
export function armarLibrosPorEquipo(e: EntradaLibro, asignacion: Record<string, string>): LibroDeEquipo[] {
  const equipos: string[] = [];
  for (const def of e.secciones) {
    const q = (asignacion[def.clave] ?? "").trim();
    if (q && !equipos.includes(q)) equipos.push(q);
  }
  return equipos.map((equipo) => {
    const claves = e.secciones.filter((s) => (asignacion[s.clave] ?? "").trim() === equipo).map((s) => s.clave);
    return { equipo, claves, archivo: nombreArchivoLibro(e, equipo), hojas: armarLibro(e, { incluir: claves, equipo }) };
  });
}

/* ---------- Leer ------------------------------------------------------------------------ */

export interface BloqueLibro {
  hoja: string;
  /** Fila (desde 1) donde estaba el encabezado. */
  fila: number;
  encabezados: string[];
  filas: string[][];
  /** Fila de la hoja (desde 1) de cada fila de `filas`. */
  numeros: number[];
}

export interface ControlLibro {
  valores: Record<string, string>;
  /** clave de destino («s3», «s5:crit») → nombre de la hoja. */
  hojas: Record<string, string>;
}

export interface LibroLeido {
  bloques: BloqueLibro[];
  control: ControlLibro | null;
}

const hayTexto = (f: string[] | undefined) => (f ?? []).some((x) => String(x ?? "").trim() !== "");

/** Primera fila con al menos dos celdas llenas (la banda de título es de una); si no hay, la primera con algo. */
function filaDeEncabezado(filas: string[][], fijada?: number): number {
  if (fijada && hayTexto(filas[fijada - 1])) return fijada - 1;
  const doble = filas.findIndex((f) => f.filter((x) => String(x ?? "").trim() !== "").length >= 2);
  if (doble >= 0) return doble;
  return filas.findIndex((f) => hayTexto(f));
}

export function leerControl(hojas: HojaLeida[]): ControlLibro | null {
  const h = hojas.find((x) => x.nombre === HOJA_CONTROL);
  if (!h) return null;
  const valores: Record<string, string> = {};
  for (const f of h.filas.slice(1)) {
    const k = String(f[0] ?? "").trim();
    if (k) valores[k] = String(f[1] ?? "").trim();
  }
  if (!valores.instancia && !valores.plantilla && !valores.huella) return null;
  const hojasDe: Record<string, string> = {};
  for (const [k, v] of Object.entries(valores)) if (/^s\d+(:crit)?$/.test(k)) hojasDe[k] = v;
  return { valores, hojas: hojasDe };
}

/** Lee todas las hojas con contenido de un libro: encabezados, filas con algo y su número de fila. Salta las de apoyo del sistema. */
export function leerLibro(hojas: HojaLeida[]): LibroLeido {
  const control = leerControl(hojas);
  const delSistema = new Set(Object.values(control?.hojas ?? {}));
  const fija = Number(control?.valores.fila_encabezado) || undefined;
  const bloques: BloqueLibro[] = [];
  for (const h of hojas) {
    if (esHojaDeApoyo(h.nombre)) continue;
    const i = filaDeEncabezado(h.filas, delSistema.has(h.nombre) ? fija : undefined);
    if (i < 0) continue;
    const cab = (h.filas[i] ?? []).map((x) => String(x ?? "").trim());
    while (cab.length && !cab[cab.length - 1]) cab.pop();
    const filas: string[][] = [];
    const numeros: number[] = [];
    h.filas.slice(i + 1).forEach((f, k) => {
      if (!hayTexto(f)) return;
      filas.push(f.map((x) => String(x ?? "").trim()));
      numeros.push(i + 2 + k);
    });
    bloques.push({ hoja: h.nombre, fila: i + 1, encabezados: cab, filas, numeros });
  }
  return { bloques, control };
}

export interface EsperadoControl {
  ciclo: string;
  instancia: string;
  plantilla: Plantilla;
  huella: string;
}

/** ¿El libro es de este informe? Un libro de otro informe se rechaza; una estructura distinta solo se avisa. */
export function validarControl(control: ControlLibro | null, esperado: EsperadoControl): { error?: string; avisos: string[] } {
  if (!control) return { avisos: [] };
  const v = control.valores;
  if (v.formato && v.formato !== "libro-informe") return { error: "Este archivo no es un libro de informe de gestión.", avisos: [] };
  const de = `${v.unidad ? `«${v.unidad}»` : "otra unidad"}${v.anio ? `, ciclo ${v.anio}` : ""}${v.plantilla ? `, plantilla ${v.plantilla}` : ""}`;
  if (v.instancia && v.instancia !== esperado.instancia) return { error: `Este libro es del informe de ${de} y no corresponde a este informe. Descargue el libro desde este informe y vuelva a intentarlo.`, avisos: [] };
  if (v.ciclo && v.ciclo !== esperado.ciclo) return { error: `Este libro es de otro ciclo (${v.anio ?? "?"}). Descargue uno nuevo desde este informe.`, avisos: [] };
  if (v.plantilla && v.plantilla !== esperado.plantilla) return { error: `Este libro es de la plantilla ${v.plantilla} y el informe usa la ${esperado.plantilla}.`, avisos: [] };
  const avisos: string[] = [];
  if (Number(v.version_libro) > VERSION_LIBRO) avisos.push("Este libro salió de una versión más nueva del sistema; algunas columnas pueden no reconocerse.");
  if (v.huella && v.huella !== esperado.huella) avisos.push("La estructura del informe cambió desde que se descargó este libro (secciones o columnas). Revise la clasificación antes de aplicar.");
  return { avisos };
}

/* ---------- Clasificar ----------------------------------------------------------------------- */

export type NivelConfianza = "reconocida" | "revisar" | "sin";

export interface Propuesta {
  hoja: string;
  /** id del destino elegido; nulo = no importar. */
  destino: string | null;
  puntaje: number;
  /** Por cada columna del destino, el índice de la columna del libro que le corresponde (−1: no hay). */
  columnas: number[];
  origen: "control" | "encabezados" | "manual" | "ninguno";
  nivel: NivelConfianza;
  /** Hay otro destino con el mismo puntaje: conviene que una persona confirme. */
  ambigua: boolean;
  /** `_Control` dice que es una hoja de referencia (matriz, anexos) o de una sección que ya no está: no se importa. */
  referencia?: boolean;
}

export const UMBRAL_RECONOCIDA = 0.75;
export const UMBRAL_REVISAR = 0.4;

const nivelDe = (p: number): NivelConfianza => (p >= UMBRAL_RECONOCIDA ? "reconocida" : p >= UMBRAL_REVISAR ? "revisar" : "sin");

/** Asigna a cada columna del destino una columna del libro: primero los encabezados idénticos y luego los que contienen el alias. */
function asignarColumnas(encabezados: string[], columnas: ColumnaLibro[]): number[] {
  const h = encabezados.map(normalizarTexto);
  const m = columnas.map(() => -1);
  const usadas = new Set<number>();
  const alias = (c: ColumnaLibro) => [normalizarTexto(c.titulo), ...(c.alias ?? []).map(normalizarTexto)];
  columnas.forEach((c, j) => {
    if (!c.alias) return;
    const i = h.findIndex((x, k) => x && !usadas.has(k) && alias(c).includes(x));
    if (i >= 0) {
      m[j] = i;
      usadas.add(i);
    }
  });
  columnas.forEach((c, j) => {
    if (m[j] >= 0 || !c.alias) return;
    const i = h.findIndex((x, k) => x && !usadas.has(k) && alias(c).some((a) => a.length > 3 && x.includes(a)));
    if (i >= 0) {
      m[j] = i;
      usadas.add(i);
    }
  });
  return m;
}

const esTextoLibre = (d: Destino) => d.rol === "datos" && (d.def.tipo === "narr" || d.def.tipo === "libre");

/**
 * Puntaje de una hoja frente a un destino (0 a .98). Aciertos entre columnas con alias, sobre el menor entre las
 * del destino y las de la hoja; tope .3 con menos de dos aciertos si el destino tiene varias columnas; +.2 si el
 * nombre de la hoja trae una palabra clave. Un destino de texto (una sola columna útil) vale .45 con acierto.
 */
export function puntuar(bloque: Pick<BloqueLibro, "hoja" | "encabezados">, d: Destino): { puntaje: number; columnas: number[]; aciertos: number } {
  const columnas = asignarColumnas(bloque.encabezados, d.columnas);
  const conAlias = d.columnas.filter((c) => c.alias).length;
  const aciertos = columnas.filter((i) => i >= 0).length;
  const texto = esTextoLibre(d);
  const den = texto ? 1 : Math.max(1, Math.min(conAlias, bloque.encabezados.length));
  let s = texto ? (aciertos ? 0.45 : 0) : (aciertos / den) * 0.8;
  if (!texto && conAlias > 1 && aciertos < 2) s = Math.min(s, 0.3);
  const nombre = normalizarTexto(bloque.hoja);
  if (aciertos && d.palabras.some((k) => nombre.includes(k))) s += 0.2;
  return { puntaje: Math.min(0.98, s), columnas, aciertos };
}

const sinPropuesta = (hoja: string): Propuesta => ({ hoja, destino: null, puntaje: 0, columnas: [], origen: "ninguno", nivel: "sin", ambigua: false });

/** La clave que `_Control` asigna a la hoja: por su nombre exacto o, si la renombraron, por su número («05 …») si es único. */
function claveDeControl(hoja: string, control: ControlLibro): string | undefined {
  const claves = Object.entries(control.hojas);
  let hallada = claves.find(([, n]) => n === hoja)?.[0];
  if (!hallada) {
    const num = /^(\d\d)\s/.exec(hoja)?.[1];
    const mismos = num ? claves.filter(([, n]) => n.startsWith(`${num} `)) : [];
    if (mismos.length === 1) hallada = mismos[0][0];
  }
  return hallada;
}

/** Elige el destino de cada hoja. Con `_Control`, el que dice el libro (100 %); sin él, el de mejor puntaje por encabezados. */
export function clasificar(bloques: BloqueLibro[], destinos: Destino[], control: ControlLibro | null = null): Propuesta[] {
  return bloques.map((b) => {
    if (control) {
      const clave = claveDeControl(b.hoja, control);
      const d = clave ? destinos.find((x) => x.id === clave) : undefined;
      if (d) return { hoja: b.hoja, destino: d.id, puntaje: 1, columnas: puntuar(b, d).columnas, origen: "control", nivel: "reconocida", ambigua: false };
      if (clave) return { hoja: b.hoja, destino: null, puntaje: 1, columnas: [], origen: "control", nivel: "reconocida", ambigua: false, referencia: true };
    }
    const todas = destinos.map((d) => ({ d, ...puntuar(b, d) })).sort((x, y) => y.puntaje - x.puntaje);
    const mejor = todas[0];
    if (!mejor || mejor.puntaje < UMBRAL_REVISAR) return { ...sinPropuesta(b.hoja), puntaje: mejor?.puntaje ?? 0 };
    const ambigua = Boolean(todas[1] && Math.abs(todas[1].puntaje - mejor.puntaje) < 0.001 && todas[1].puntaje >= UMBRAL_REVISAR);
    return { hoja: b.hoja, destino: mejor.d.id, puntaje: mejor.puntaje, columnas: mejor.columnas, origen: "encabezados", nivel: nivelDe(mejor.puntaje), ambigua };
  });
}

/** La propuesta cuando una persona elige el destino a mano (o «No importar»: destino nulo). */
export function elegirDestino(b: BloqueLibro, d: Destino | null): Propuesta {
  if (!d) return { ...sinPropuesta(b.hoja), origen: "manual" };
  const p = puntuar(b, d);
  return { hoja: b.hoja, destino: d.id, puntaje: p.puntaje, columnas: p.columnas, origen: "manual", nivel: nivelDe(p.puntaje), ambigua: false };
}

/* ---------- Convertir cada hoja ---------------------------------------------------------------- */

interface AporteLeido {
  pilar: string;
  articula: boolean;
  aporte: string;
}
interface MarcaCriterio {
  nombre: string;
  reporta: boolean;
}
export interface EnlaceEvidencia {
  url: string;
  nombre: string;
  descripcion: string;
}

type Conv =
  | { tipo: "texto"; textos: string[] }
  | { tipo: "pdi"; aportes: AporteLeido[]; quitar: string[] }
  | { tipo: "metas"; metas: Meta[] }
  | { tipo: "filas"; filas: string[][] }
  | { tipo: "logros"; logros: Logro[] }
  | { tipo: "crit"; marcas: MarcaCriterio[] }
  | { tipo: "dim"; lectura: LecturaIndicadores }
  | { tipo: "evid"; enlaces: EnlaceEvidencia[] };

interface Conversion {
  conv: Conv;
  /** Filas listas, filas con aviso y filas que no entran. */
  listas: number;
  conAviso: number;
  sinImportar: number;
  avisos: string[];
}

/** Fecha ISO (aaaa-mm-dd) a dd/mm/aaaa; el resto, el texto recortado. */
function limpiar(v: unknown): string {
  const t = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

interface Proyeccion {
  filas: { celdas: string[]; numero: number }[];
  ejemplos: number;
  vacias: number;
  recortadas: boolean;
}

/** Las filas del libro en el orden de las columnas del destino. Salta ejemplos y filas sin nada diligenciado. */
function proyectar(b: BloqueLibro, p: Propuesta, d: Destino): Proyeccion {
  const out: Proyeccion = { filas: [], ejemplos: 0, vacias: 0, recortadas: false };
  b.filas.forEach((f, k) => {
    if (f.some((x) => FILA_EJEMPLO.test(x))) {
      out.ejemplos++;
      return;
    }
    const celdas = d.columnas.map((_, j) => (p.columnas[j] >= 0 ? limpiar(f[p.columnas[j]]) : ""));
    const diligenciadas = celdas.filter((x, j) => x !== "" && d.columnas[j].tipo !== "bloqueada");
    if (!diligenciadas.length) {
      out.vacias++;
      return;
    }
    if (out.filas.length >= MAX_FILAS) {
      out.recortadas = true;
      return;
    }
    out.filas.push({ celdas, numero: b.numeros[k] });
  });
  return out;
}

const rotuloFila = (hoja: string, n: number) => `«${hoja}», fila ${n}`;

/** Avisos por columna: las del destino con alias que el libro no trae. */
function avisosDeColumnas(b: BloqueLibro, p: Propuesta, d: Destino): string[] {
  const faltan = d.columnas.filter((c, j) => c.alias && p.columnas[j] < 0);
  const clave = faltan.filter((c) => c.tipo === "obligatoria").map((c) => `«${c.titulo}»`);
  const resto = faltan.filter((c) => c.tipo !== "obligatoria").map((c) => `«${c.titulo}»`);
  return [...(clave.length ? [`«${b.hoja}»: no hay columna para ${clave.join(", ")}; queda vacía.`] : []), ...(resto.length ? [`«${b.hoja}»: sin columna para ${resto.join(", ")} (quedan vacías).`] : [])];
}

function convertir(b: BloqueLibro, p: Propuesta, d: Destino, ctx: ContextoAplicar): Conversion {
  const pro = proyectar(b, p, d);
  const avisos = avisosDeColumnas(b, p, d);
  if (pro.recortadas) avisos.push(`«${b.hoja}»: solo se importan las primeras ${MAX_FILAS} filas; el resto se omitió.`);
  if (pro.ejemplos) avisos.push(`«${b.hoja}»: ${pro.ejemplos === 1 ? "una fila de ejemplo se omitió" : `${pro.ejemplos} filas de ejemplo se omitieron`}.`);
  let listas = 0;
  let conAviso = 0;
  let sinImportar = 0;
  const falta = (celdas: string[], numero: number): boolean => {
    const f = d.columnas.flatMap((c, j) => (c.tipo === "obligatoria" && celdas[j] === "" ? [`«${c.titulo}»`] : []));
    if (!f.length) return false;
    avisos.push(`${rotuloFila(b.hoja, numero)}: falta ${f.join(" y ")}.`);
    return true;
  };
  const cuenta = (conAv: boolean) => (conAv ? conAviso++ : listas++);
  const def = d.def;

  if (d.rol === "criterios") {
    const marcas: MarcaCriterio[] = [];
    for (const f of pro.filas) {
      const [nombre, reporta] = f.celdas;
      const r = sinTildes(reporta);
      const sinRespuesta = falta(f.celdas, f.numero);
      cuenta(sinRespuesta);
      if (!nombre || (r !== "si" && r !== "no")) {
        if (r) avisos.push(`${rotuloFila(b.hoja, f.numero)}: «${reporta}» no es Sí ni No; se omitió.`);
        sinImportar++;
        continue;
      }
      marcas.push({ nombre, reporta: r === "si" });
    }
    return { conv: { tipo: "crit", marcas }, listas, conAviso, sinImportar, avisos };
  }

  switch (def.tipo) {
    case "narr":
    case "libre": {
      const textos: string[] = [];
      // Sin columna reconocida (hoja elegida a mano), vale la primera con texto.
      const col = p.columnas[0] >= 0 ? p.columnas[0] : 0;
      for (let k = 0; k < b.filas.length; k++) {
        if (b.filas[k].some((x) => FILA_EJEMPLO.test(x))) continue;
        const t = (b.filas[k][col] ?? "").trim();
        if (t) {
          textos.push(t);
          listas++;
        }
      }
      if (!textos.length) avisos.push(`«${b.hoja}»: no hay texto para importar.`);
      return { conv: { tipo: "texto", textos }, listas, conAviso, sinImportar, avisos };
    }
    case "pdi": {
      const aportes: AporteLeido[] = [];
      const quitar: string[] = [];
      for (const f of pro.filas) {
        const [pilarTxt, , articula, aporte] = f.celdas;
        const pilar = pilarDeTexto(pilarTxt, ctx.pilares);
        if (!pilar) {
          avisos.push(`${rotuloFila(b.hoja, f.numero)}: el pilar «${pilarTxt || "(vacío)"}» no es uno del Plan de Desarrollo; se omitió.`);
          sinImportar++;
          continue;
        }
        const a = sinTildes(articula);
        if (a === "no") {
          quitar.push(pilar);
          listas++;
          continue;
        }
        if (a !== "si" && !aporte) {
          sinImportar++;
          continue;
        }
        const incompleto = a === "" && falta(f.celdas, f.numero);
        aportes.push({ pilar, articula: true, aporte });
        cuenta(incompleto);
      }
      return { conv: { tipo: "pdi", aportes, quitar }, listas, conAviso, sinImportar, avisos };
    }
    case "metas": {
      const metas: Meta[] = [];
      for (const f of pro.filas) {
        const malo = (t: string, col: string): boolean => {
          if (!t || numeroDe(t.replace(/%/g, "")) !== null) return false;
          avisos.push(`${rotuloFila(b.hoja, f.numero)}: «${t}» no es un número en ${col}.`);
          return true;
        };
        const noNumero = [malo(f.celdas[1], "Programado"), malo(f.celdas[2], "Alcanzado")].some(Boolean);
        cuenta(falta(f.celdas, f.numero) || noNumero);
        metas.push(...filasAMetas([f.celdas.slice(0, 3)]));
      }
      return { conv: { tipo: "metas", metas }, listas, conAviso, sinImportar, avisos };
    }
    case "filas": {
      const filas: string[][] = [];
      const dims = (def.columnas ?? [])[0] === "Dimensión" ? CRITERIOS_BASE.map((x) => sinTildes(x.nombre)) : [];
      let sinDim = 0;
      for (const f of pro.filas) {
        cuenta(falta(f.celdas, f.numero));
        if (dims.length && f.celdas[0] && !dims.includes(sinTildes(f.celdas[0]))) sinDim++;
        filas.push(f.celdas.slice(0, d.columnas.length));
      }
      if (sinDim) avisos.push(`«${b.hoja}»: ${sinDim} ${sinDim === 1 ? "fila tiene" : "filas tienen"} una dimensión que no es ninguna de las conocidas; se importó como texto libre.`);
      return { conv: { tipo: "filas", filas }, listas, conAviso, sinImportar, avisos };
    }
    case "logros": {
      const logros: Logro[] = [];
      for (const f of pro.filas) {
        const anexo = f.celdas[2];
        if (anexo) {
          const n = numeroDe(anexo);
          if (n === null || !Number.isInteger(n) || n <= 0) avisos.push(`${rotuloFila(b.hoja, f.numero)}: «${anexo}» no es un número de anexo; quedó vacío.`);
        }
        cuenta(falta(f.celdas, f.numero));
        logros.push(...filasALogros([f.celdas.slice(0, 3)]));
      }
      return { conv: { tipo: "logros", logros }, listas, conAviso, sinImportar, avisos };
    }
    case "evid": {
      const enlaces: EnlaceEvidencia[] = [];
      for (const f of pro.filas) {
        const [n, nombre, descripcion, url] = f.celdas;
        const existente = ctx.anexos.find((a) => (n !== "" && String(a.n) === n && sinTildes(a.nombre) === sinTildes(nombre)) || (url === "" && sinTildes(a.nombre) === sinTildes(nombre)));
        if (!url && existente) {
          // Una evidencia que ya está cargada y viajó en el libro: no hay nada que hacer.
          sinImportar++;
          continue;
        }
        const faltas = falta(f.celdas, f.numero);
        if (!/^https:\/\/\S+$/i.test(url)) {
          avisos.push(`${rotuloFila(b.hoja, f.numero)}: sin enlace https://. Los archivos se suben desde la sección de evidencias; se omitió.`);
          sinImportar++;
          continue;
        }
        cuenta(faltas);
        enlaces.push({ url, nombre, descripcion });
      }
      return { conv: { tipo: "evid", enlaces }, listas, conAviso, sinImportar, avisos };
    }
    case "dim": {
      // Hoja de la sección → columnas del codec de indicadores, en su orden; cada fila queda en su número de fila de la hoja.
      const n = COLUMNAS_LIBRO_RESULTADOS.length - 1;
      const iTipo = COLUMNAS_RESULTADOS.findIndex((c) => c.titulo === "Tipo");
      const iActual = COLUMNAS_RESULTADOS.findIndex((c) => c.titulo === "Cifra actual");
      const iDesc = COLUMNAS_RESULTADOS.findIndex((c) => c.titulo === "Descripción de la acción");
      const iHecho = COLUMNAS_RESULTADOS.findIndex((c) => c.titulo === "Qué se ha hecho");
      // Una hoja de acciones (sin Tipo ni cifra actual) se lee como acciones.
      const soloAcciones = p.columnas[iTipo] < 0 && p.columnas[iActual] < 0 && (p.columnas[iDesc] >= 0 || p.columnas[iHecho] >= 0);
      const arreglo: string[][] = [COLUMNAS_LIBRO_RESULTADOS.slice(0, n) as unknown as string[]];
      for (const f of pro.filas) {
        const celdas = f.celdas.slice(0, n);
        if (soloAcciones) celdas[iTipo] = TIPO_ACCION;
        while (arreglo.length < f.numero - 1) arreglo.push([]);
        arreglo[f.numero - 1] = celdas;
      }
      const lectura = leerFilasIndicadores(arreglo, ctx.criterios, `«${b.hoja}»`, ctx.pilares);
      const cuantos = lectura.indicadores.length;
      sinImportar += pro.filas.length - cuantos;
      const faltasInd = (i: IndicadorManual) => faltantes(i, false);
      for (const i of lectura.indicadores) {
        const f = faltasInd(i);
        if (f.length) {
          avisos.push(`«${b.hoja}», «${i.nombre}»: falta ${f.join(", ")}.`);
          conAviso++;
        } else listas++;
      }
      // Un tipo vacío se tomó como cifra: se dice.
      const sinTipo = pro.filas.filter((f) => f.celdas[iTipo] === "" && !soloAcciones).length;
      if (sinTipo) avisos.push(`«${b.hoja}»: ${sinTipo} ${sinTipo === 1 ? "fila sin Tipo se tomó" : "filas sin Tipo se tomaron"} como cifra.`);
      avisos.push(...lectura.avisos);
      return { conv: { tipo: "dim", lectura }, listas, conAviso, sinImportar, avisos };
    }
    default:
      return { conv: { tipo: "texto", textos: [] }, listas: 0, conAviso: 0, sinImportar: b.filas.length, avisos };
  }
}

/* ---------- Aplicar ---------------------------------------------------------------------------- */

export interface ContextoAplicar {
  secciones: SeccionDef[];
  contenidos: ContenidosPorClave;
  /** Todos los criterios que puede usar la unidad (base, aprobados y propios), para leer los nombres del libro. */
  criterios: Criterio[];
  pilares: PilarOpcion[];
  anexos: AnexoRow[];
}

export interface EntradaAplicar {
  bloques: BloqueLibro[];
  propuestas: Propuesta[];
  contexto: Omit<ContextoAplicar, "criterios"> & { aprobados: { id: string; nombre: string }[] };
  modo: ModoAplicacion;
  estado: EstadoInstancia;
  rol: RolInforme | null;
  /** Quién aporta este libro (se anota en el resultado y en la descripción de las evidencias nuevas). */
  aporta?: string;
}

export interface ConteoSeccion {
  clave: string;
  titulo: string;
  hojas: string[];
  /** Filas leídas listas / con aviso / que no entran. */
  listas: number;
  conAviso: number;
  sinImportar: number;
  /** Filas o elementos que quedaron nuevos en el informe, completados y omitidos por ya existir. */
  agregadas: number;
  completadas: number;
  omitidas: number;
}

export interface ResultadoAplicar {
  /** El contenido nuevo de cada sección que cambia (completo, listo para guardar). */
  contenidos: Record<string, ContenidoSeccion>;
  /** Evidencias nuevas (enlaces) para `informe_anexos`. */
  evidencias: EnlaceEvidencia[];
  avisos: string[];
  secciones: ConteoSeccion[];
  /** Filas del libro: listas, con aviso y sin importar (de hojas sin destino o filas que no entran). */
  totales: { listas: number; conAviso: number; sinImportar: number };
  /** Motivo por el que no se puede escribir (informe no editable); sin motivo, se puede. */
  bloqueado?: string;
  /** Una línea con lo hecho, para mostrar al terminar (incluye quién aportó). */
  resumen: string;
}

const iguales = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => sinTildes(x) === sinTildes(b[i]));

interface FusionFilas {
  filas: string[][];
  agregadas: number;
  completadas: number;
  omitidas: number;
}

/**
 * Une filas del libro con las del informe. `claves`: columnas que identifican una fila. En «agregar» se suman
 * (salvo las idénticas a una existente); en «vacíos» una fila con la misma clave completa las celdas vacías; en
 * «reemplazar» las del libro quedan solas.
 */
export function fusionarFilas(previas: string[][], nuevas: string[][], modo: ModoAplicacion, claves: number[] = [0]): FusionFilas {
  if (modo === "reemplazar") return { filas: nuevas, agregadas: nuevas.length, completadas: 0, omitidas: 0 };
  const filas = previas.map((f) => [...f]);
  let agregadas = 0;
  let completadas = 0;
  let omitidas = 0;
  const tocadas = new Set<number>();
  const llave = (f: string[]) => claves.map((i) => sinTildes(f[i] ?? "")).join("¦");
  for (const n of nuevas) {
    if (filas.some((f) => iguales(f, n))) {
      omitidas++;
      continue;
    }
    if (modo === "vacios") {
      const k = llave(n);
      const i = k.replace(/¦/g, "") === "" ? -1 : filas.findIndex((f, x) => !tocadas.has(x) && llave(f) === k);
      if (i >= 0) {
        tocadas.add(i);
        let llenas = 0;
        n.forEach((v, c) => {
          if (v !== "" && (filas[i][c] ?? "").trim() === "") {
            filas[i][c] = v;
            llenas++;
          }
        });
        if (llenas) completadas++;
        else omitidas++;
        continue;
      }
    }
    filas.push(n);
    agregadas++;
  }
  return { filas, agregadas, completadas, omitidas };
}

const claveIndicador = (i: IndicadorManual) => `${i.criterio}|${esAccion(i) ? "a" : "c"}|${sinTildes(i.nombre)}`;

/** Completa los campos vacíos de `base` con los de `nuevo`. Devuelve si cambió algo. */
function completarIndicador(base: IndicadorManual, nuevo: IndicadorManual): { i: IndicadorManual; cambio: boolean } {
  const i: IndicadorManual = { ...base };
  let cambio = false;
  const texto = ["unidad", "fuente", "nota", "descripcion", "avance_texto", "finalizacion", "proyeccion_texto", "pilar"] as const;
  for (const k of texto) {
    const v = nuevo[k];
    if (typeof v === "string" && v.trim() && !String(i[k] ?? "").trim()) {
      (i as unknown as Record<string, unknown>)[k] = v;
      cambio = true;
    }
  }
  for (const k of ["anterior", "actual", "meta", "proyeccion_num"] as const) {
    if (i[k] == null && nuevo[k] != null) {
      (i as unknown as Record<string, unknown>)[k] = nuevo[k];
      cambio = true;
    }
  }
  if (!i.evidencias?.length && nuevo.evidencias?.length) {
    i.evidencias = nuevo.evidencias;
    cambio = true;
  }
  return { i, cambio };
}

const mismosDatos = (a: IndicadorManual, b: IndicadorManual) =>
  a.unidad === b.unidad && a.anterior === b.anterior && a.actual === b.actual && a.meta === b.meta && a.mayorMejor === b.mayorMejor && (a.descripcion ?? "") === (b.descripcion ?? "") && (a.avance_texto ?? "") === (b.avance_texto ?? "");

export function aplicar(e: EntradaAplicar): ResultadoAplicar {
  const vacio: ResultadoAplicar = { contenidos: {}, evidencias: [], avisos: [], secciones: [], totales: { listas: 0, conAviso: 0, sinImportar: 0 }, resumen: "" };
  const destinos = destinosDe(e.contexto.secciones);
  const porId = new Map(destinos.map((d) => [d.id, d]));
  const editable = puedeEditar(e.estado, e.rol);

  // Lo que se lee de cada hoja, agrupado por sección.
  const porSeccion = new Map<string, { d: Destino; b: BloqueLibro; c: Conversion }[]>();
  const totales = { listas: 0, conAviso: 0, sinImportar: 0 };
  const avisos: string[] = [];
  e.bloques.forEach((b, k) => {
    const p = e.propuestas[k];
    const d = p?.destino ? porId.get(p.destino) : undefined;
    if (!p || !d) {
      totales.sinImportar += b.filas.length;
      return;
    }
    // Criterios nuevos creados en la hoja de criterios valen para los resultados: se leen en orden.
    const ctx: ContextoAplicar = { ...e.contexto, criterios: criteriosDeSeccion(d.def, e.contexto, porSeccion.get(d.clave)) };
    const c = convertir(b, p, d, ctx);
    totales.listas += c.listas;
    totales.conAviso += c.conAviso;
    totales.sinImportar += c.sinImportar;
    avisos.push(...c.avisos);
    porSeccion.set(d.clave, [...(porSeccion.get(d.clave) ?? []), { d, b, c }]);
  });

  if (!editable) {
    return { ...vacio, avisos, totales, bloqueado: e.estado === "sent" || e.estado === "ok" ? "El informe ya se envió: no admite cambios. Pida que lo devuelvan para modificaciones." : "Su papel no permite escribir en este informe.", resumen: "No se aplicó nada." };
  }

  const contenidos: Record<string, ContenidoSeccion> = {};
  const secciones: ConteoSeccion[] = [];
  const evidencias: EnlaceEvidencia[] = [];
  const bloqueadas: string[] = [];

  for (const def of e.contexto.secciones) {
    const items = porSeccion.get(def.clave);
    if (!items?.length) continue;
    const conteo: ConteoSeccion = { clave: def.clave, titulo: def.titulo, hojas: items.map((x) => x.b.hoja), listas: 0, conAviso: 0, sinImportar: 0, agregadas: 0, completadas: 0, omitidas: 0 };
    for (const x of items) {
      conteo.listas += x.c.listas;
      conteo.conAviso += x.c.conAviso;
      conteo.sinImportar += x.c.sinImportar;
    }
    secciones.push(conteo);
    if (def.soloLectura && e.rol !== "planeacion") {
      bloqueadas.push(`«${def.titulo}» es de solo lectura (la definió Planeación): no se escribió.`);
      continue;
    }
    const previo = e.contexto.contenidos[def.clave] ?? {};
    const r = fusionarSeccion(def, previo, items.map((x) => x.c.conv), e.modo, e.contexto, conteo, evidencias);
    if (r) contenidos[def.clave] = r;
  }

  // Evidencias: solo enlaces nuevos; los ya cargados se omiten. Se anota quién aportó en la descripción.
  const vistas = new Set(e.contexto.anexos.filter((a) => a.tipo === "url").map((a) => a.ruta));
  const nuevasEv: EnlaceEvidencia[] = [];
  for (const x of evidencias) {
    if (vistas.has(x.url)) continue;
    vistas.add(x.url);
    nuevasEv.push({ ...x, descripcion: (e.aporta?.trim() ? `${x.descripcion}${x.descripcion ? " " : ""}(aportó: ${e.aporta.trim()})` : x.descripcion).slice(0, 300) });
  }
  const evSeccion = secciones.find((s) => e.contexto.secciones.find((d) => d.clave === s.clave)?.tipo === "evid");
  if (evSeccion) {
    evSeccion.agregadas = nuevasEv.length;
    evSeccion.omitidas = evidencias.length - nuevasEv.length;
  }
  if (e.modo === "reemplazar" && evSeccion) avisos.push("Las evidencias no se reemplazan: solo se agregan las nuevas. Quite las que sobren desde la sección de evidencias.");

  const nSecc = Object.keys(contenidos).length;
  const filas = secciones.reduce((s, x) => s + x.agregadas + x.completadas, 0);
  const quien = e.aporta?.trim() ? ` Aportó: ${e.aporta.trim()}.` : "";
  const modoT = { agregar: "agregadas al final", vacios: "puestas donde faltaban", reemplazar: "en lugar de lo anterior" }[e.modo];
  const resumen = nSecc || nuevasEv.length ? `${filas} ${filas === 1 ? "fila" : "filas"} ${modoT} en ${nSecc} ${nSecc === 1 ? "sección" : "secciones"}${nuevasEv.length ? ` y ${nuevasEv.length} ${nuevasEv.length === 1 ? "evidencia nueva" : "evidencias nuevas"}` : ""}.${quien}` : `No hubo nada que aplicar.${quien}`;
  return { contenidos, evidencias: nuevasEv, avisos: [...avisos, ...bloqueadas], secciones, totales, resumen };
}

/** Los criterios que conoce la unidad en una sección, más los que la hoja de criterios de este libro ya creó. */
function criteriosDeSeccion(def: SeccionDef, ctx: Omit<ContextoAplicar, "criterios"> & { aprobados: { id: string; nombre: string }[] }, previas: { d: Destino; c: Conversion }[] | undefined): Criterio[] {
  const c = ctx.contenidos[def.clave] ?? {};
  const propios = [...(c.criterios_propios ?? []), ...nuevosDeCriterios(previas ?? [], criteriosDe(def.dims ?? [], ctx.aprobados, c.criterios_propios ?? [], !def.consolida))];
  return criteriosDe(def.dims ?? [], ctx.aprobados, propios, !def.consolida);
}

/** Criterios propios que dicen las hojas de criterios ya leídas (reporta Sí y no existen). Su id es estable por nombre dentro del libro. */
function nuevosDeCriterios(previas: { d: Destino; c: Conversion }[], conocidos: Criterio[]): CriterioPropio[] {
  const nuevos: CriterioPropio[] = [];
  const nombres = new Set(conocidos.map((k) => sinTildes(k.nombre)));
  for (const x of previas) {
    if (x.c.conv.tipo !== "crit") continue;
    for (const m of x.c.conv.marcas) {
      if (!m.reporta || nombres.has(sinTildes(m.nombre))) continue;
      nombres.add(sinTildes(m.nombre));
      nuevos.push({ id: idPropio(m.nombre), nombre: m.nombre });
    }
  }
  return nuevos;
}

/** Id estable de un criterio propio nuevo a partir de su nombre (el mismo en toda la importación). */
const idPropio = (nombre: string) => `l_${sinTildes(nombre).replace(/ /g, "_").slice(0, 40)}`;

/** Une lo leído de las hojas de una sección con su contenido. Nulo si no cambia nada. */
function fusionarSeccion(def: SeccionDef, previo: ContenidoSeccion, convs: Conv[], modo: ModoAplicacion, ctx: Omit<ContextoAplicar, "criterios"> & { aprobados: { id: string; nombre: string }[] }, conteo: ConteoSeccion, evidencias: EnlaceEvidencia[]): ContenidoSeccion | null {
  let c: ContenidoSeccion = { ...previo };
  const sumar = (f: { agregadas: number; completadas: number; omitidas: number }) => {
    conteo.agregadas += f.agregadas;
    conteo.completadas += f.completadas;
    conteo.omitidas += f.omitidas;
  };
  for (const conv of convs) {
    switch (conv.tipo) {
      case "texto": {
        if (!conv.textos.length) break;
        const nuevo = conv.textos.join("\n\n");
        if (def.tipo === "libre") {
          const bloques = c.bloques ?? [];
          const hay = bloques.some((b) => b.tipo === "texto" && b.texto.trim());
          if (modo === "vacios" && hay) {
            conteo.omitidas += conv.textos.length;
            break;
          }
          const ya = new Set(bloques.flatMap((b) => (b.tipo === "texto" ? [sinTildes(b.texto)] : [])));
          const frescos = conv.textos.filter((t) => modo === "reemplazar" || !ya.has(sinTildes(t)));
          const nuevos: BloqueLibre[] = frescos.map((texto) => ({ id: idNuevo(), tipo: "texto", texto }));
          c = { ...c, bloques: modo === "reemplazar" ? [...bloques.filter((b) => b.tipo !== "texto"), ...nuevos] : [...bloques, ...nuevos] };
          sumar({ agregadas: nuevos.length, completadas: 0, omitidas: conv.textos.length - frescos.length });
        } else {
          const actual = (c.texto ?? "").trim();
          if (modo === "reemplazar" || !actual) {
            c = { ...c, texto: nuevo };
            conteo.agregadas++;
          } else if (modo === "vacios" || sinTildes(actual).includes(sinTildes(nuevo))) conteo.omitidas++;
          else {
            c = { ...c, texto: `${c.texto?.trimEnd()}\n\n${nuevo}` };
            conteo.agregadas++;
          }
        }
        break;
      }
      case "pdi": {
        const previos = normalizarAlineacion(c);
        let lista = previos.map((a) => ({ ...a }));
        if (modo === "reemplazar") {
          lista = conv.aportes.map((a) => ({ pilar: a.pilar, aporte: a.aporte, acciones: previos.find((p) => p.pilar === a.pilar)?.acciones ?? [] }));
          sumar({ agregadas: conv.aportes.length, completadas: 0, omitidas: 0 });
        } else {
          for (const a of conv.aportes) {
            const i = lista.findIndex((x) => x.pilar === a.pilar);
            if (i < 0) {
              lista.push({ pilar: a.pilar, aporte: a.aporte, acciones: [] });
              conteo.agregadas++;
            } else if (!lista[i].aporte.trim() && a.aporte) {
              lista[i] = { ...lista[i], aporte: a.aporte };
              conteo.completadas++;
            } else if (modo === "agregar" && a.aporte && !sinTildes(lista[i].aporte).includes(sinTildes(a.aporte))) {
              lista[i] = { ...lista[i], aporte: `${lista[i].aporte.trimEnd()}\n\n${a.aporte}` };
              conteo.agregadas++;
            } else conteo.omitidas++;
          }
        }
        c = conAlineacion(c, lista);
        break;
      }
      case "metas": {
        const r = fusionarFilas(metasAFilas(c.metas ?? []), metasAFilas(conv.metas), modo, [0]);
        c = { ...c, metas: filasAMetas(r.filas) };
        sumar(r);
        break;
      }
      case "filas": {
        const claves = def.columnas && def.columnas.length > 1 ? [0, 1] : [0];
        const n = (def.columnas ?? []).length || (conv.filas[0]?.length ?? 0);
        const previas = (c.filas ?? []).map((f) => Array.from({ length: n }, (_, i) => String(f[i] ?? "")));
        const r = fusionarFilas(previas, conv.filas, modo, claves);
        c = { ...c, filas: r.filas };
        sumar(r);
        break;
      }
      case "logros": {
        const previos = c.logros ?? [];
        const r = fusionarFilas(logrosAFilas(previos), logrosAFilas(conv.logros), modo, [0]);
        const drive = new Map(previos.flatMap((l) => (l.drive?.length ? [[sinTildes(l.titulo), l.drive] as const] : [])));
        c = { ...c, logros: filasALogros(r.filas).map((l) => ({ ...l, ...(drive.get(sinTildes(l.titulo)) ? { drive: drive.get(sinTildes(l.titulo)) } : {}) })) };
        sumar(r);
        break;
      }
      case "crit": {
        const propios = [...(c.criterios_propios ?? [])];
        const conocidos = criteriosDe(def.dims ?? [], ctx.aprobados, propios, !def.consolida);
        const sel = new Set(modo === "reemplazar" ? [] : c.criterios_reporta ?? []);
        let cambios = 0;
        for (const m of conv.marcas) {
          // «No» nunca quita nada: en «reemplazar» el conjunto ya parte vacío.
          if (!m.reporta) continue;
          let id = conocidos.find((k) => sinTildes(k.nombre) === sinTildes(m.nombre))?.id ?? propios.find((k) => sinTildes(k.nombre) === sinTildes(m.nombre))?.id;
          if (!id) {
            id = idPropio(m.nombre);
            propios.push({ id, nombre: m.nombre });
          }
          if (!sel.has(id)) {
            sel.add(id);
            cambios++;
          }
        }
        c = { ...c, criterios_reporta: [...sel], ...(propios.length ? { criterios_propios: propios } : {}) };
        conteo.agregadas += cambios;
        break;
      }
      case "dim": {
        const previos = normalizar(c.indicadores);
        const propios = [...(c.criterios_propios ?? [])];
        for (const n of conv.lectura.criteriosNuevos) {
          const existe = propios.find((p) => sinTildes(p.nombre) === sinTildes(n.nombre));
          if (!existe) propios.push(n);
        }
        // Un criterio nuevo que la hoja de criterios ya creó con otro id: los indicadores se reasignan a ese.
        const alias = new Map(propios.map((p) => [sinTildes(p.nombre), p.id]));
        const nuevos = conv.lectura.indicadores.map((i) => {
          const id = alias.get(sinTildes(i.criterio_nombre ?? ""));
          return id && i.criterio.startsWith("l_") ? { ...i, criterio: id } : i;
        });
        let lista: IndicadorManual[];
        if (modo === "reemplazar") {
          lista = [...previos.filter((i) => i.requerido), ...nuevos];
          sumar({ agregadas: nuevos.length, completadas: 0, omitidas: 0 });
        } else {
          lista = [...previos];
          for (const n of nuevos) {
            const k = claveIndicador(n);
            const i = lista.findIndex((x) => claveIndicador(x) === k);
            if (i >= 0 && mismosDatos(lista[i], n)) conteo.omitidas++;
            else if (i >= 0 && modo === "vacios") {
              const r = completarIndicador(lista[i], n);
              lista[i] = r.i;
              if (r.cambio) conteo.completadas++;
              else conteo.omitidas++;
            } else {
              lista.push(n);
              conteo.agregadas++;
            }
          }
        }
        c = { ...c, indicadores: lista, criterios_propios: propios.length ? propios : c.criterios_propios };
        if (!propios.length) delete c.criterios_propios;
        break;
      }
      case "evid":
        evidencias.push(...conv.enlaces);
        break;
    }
  }
  return JSON.stringify(c) === JSON.stringify(previo) ? null : c;
}

/** Atajo: lo que dice cada nivel de confianza, para la pantalla. */
export const ETIQUETA_NIVEL: Record<NivelConfianza, string> = { reconocida: "Reconocida", revisar: "Revisar", sin: "Sin destino" };

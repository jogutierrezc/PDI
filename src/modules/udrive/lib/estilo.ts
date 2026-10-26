/* =============================================================================
   UDrive · estilos de informe (migración 0190), sin React.

   Un estilo es un perfil de diseño con nombre: cómo se ve la portada, el
   texto, las tablas, la cabecera y el pie, y la página. Se aplica a cualquier
   informe sin tocar su contenido. Vive como un archivo de UDrive (tipo
   «estilo») o viene de fábrica en este archivo; el informe guarda una copia
   (la «instantánea») para imprimirse igual aunque el estilo cambie después.

   Aquí: el modelo, los estilos de fábrica, el normalizador (que es también el
   guardarriel: acota cada valor a lo que no rompe la lectura), el tema con las
   medidas en píxeles que usan el paginado y la hoja, y los avisos de diseño.
   Nunca se confía en lo guardado: todo pasa por `normalizarEstilo`.

   El logo de la Universidad es obligatorio en todo estilo: el modelo lo lleva
   en `true` y el normalizador lo restituye si alguien lo quita del JSON.
   ========================================================================== */

import type { CSSProperties } from "react";
import { MARINO, contraste, normalizarHex, normalizarMonograma } from "../../informes/vista/perfil";
import type { Papel } from "../../informes/vista/perfil";

export type { Papel };

/* ---------- Opciones ----------------------------------------------------------- */

export const FAMILIAS = ["Montserrat", "Open Sans", "Source Serif 4", "Georgia"] as const;
export type Familia = (typeof FAMILIAS)[number];

/** Cómo se escribe cada familia en CSS (la misma pila que ya usaba UDrive para Open Sans y Georgia). */
export const PILA: Record<Familia, string> = {
  Montserrat: '"Montserrat", "Open Sans", ui-sans-serif, system-ui, "Segoe UI", sans-serif',
  "Open Sans": 'var(--font-display, "Open Sans", ui-sans-serif, system-ui, "Segoe UI", sans-serif)',
  "Source Serif 4": '"Source Serif 4", Georgia, "Times New Roman", Times, serif',
  Georgia: 'Georgia, "Times New Roman", Times, serif',
};

export type Composicion = 0 | 1 | 2 | 3 | 4 | 5;
/** 0 es la portada de siempre de UDrive (solo del estilo «Clásico»). */
export const COMPOSICIONES: { id: Composicion; nombre: string; conFoto: boolean; conAlineacion: boolean; tamanos: [number, number, number] }[] = [
  { id: 1, nombre: "Foto superior", conFoto: true, conAlineacion: true, tamanos: [11, 13.5, 16] },
  { id: 2, nombre: "Bloque de color", conFoto: false, conAlineacion: true, tamanos: [11, 13.5, 16] },
  { id: 3, nombre: "Tipográfica", conFoto: false, conAlineacion: false, tamanos: [12, 15, 18] },
  { id: 4, nombre: "Barra lateral", conFoto: false, conAlineacion: false, tamanos: [9.5, 11.5, 13.5] },
  { id: 5, nombre: "Franja institucional", conFoto: false, conAlineacion: true, tamanos: [11, 13.5, 16] },
  { id: 0, nombre: "Clásica", conFoto: true, conAlineacion: false, tamanos: [11, 13.5, 16] },
];

export type FondoPortada = "foto" | "color" | "propia";
export type TonoContraportada = "marino" | "acento" | "foto";
export type ModoMarca = "ninguna" | "texto" | "imagen" | "clasica";
export type TipoCabecera = "dos" | "simple" | "ninguna" | "clasica";
export type PosFolio = "exterior" | "centro" | "derecha";

export interface Estilo {
  version: 1;
  nombre: string;
  descripcion: string;
  portada: {
    comp: Composicion;
    fondo: FondoPortada;
    alinea: "izq" | "centro";
    tam: 0 | 1 | 2;
    /** Color de acento: marcos, franjas y títulos. Siempre con 4,5:1 frente al texto blanco. */
    acento: string;
    /** Monograma de 3 a 4 caracteres. */
    mono: string;
    logos: {
      /** Obligatorio: el logo de la Universidad no se puede quitar. */
      udes: true;
      mono: boolean;
      /** Imagen de UDrive con el logo propio; vacío si no hay. */
      propioId: string;
    };
    tono: TonoContraportada;
  };
  texto: {
    fb: Familia;
    ft: Familia;
    /** Tamaño del cuerpo, en puntos. */
    fs: number;
    lh: number;
    just: boolean;
    cols: 1 | 2;
    /** Márgenes laterales, en milímetros. */
    mx: number;
    num: boolean;
    cap: "sello" | "filete" | "sencillo" | "clasico";
    dest: "caja" | "filetes" | "sangrado" | "barra";
    tcol: "marino" | "acento";
    sang: boolean;
  };
  tablas: {
    enc: "marino" | "acento" | "claro" | "clasico";
    cebra: boolean;
    bordes: "horiz" | "rejilla" | "apa" | "clasico";
    calor: boolean;
    dens: "normal" | "compacta";
    capPos: "arriba" | "abajo";
    capEstilo: "fuerte" | "apa" | "clasico";
    nota: "caja" | "texto" | "clasico";
  };
  cabpie: {
    cab: TipoCabecera;
    edif: boolean;
    folio: PosFolio;
    filetePie: boolean;
    pieTexto: boolean;
    marca: {
      modo: ModoMarca;
      texto: string;
      /** Imagen de UDrive para una marca de agua de imagen. */
      imagenId: string;
      /** Opacidad en %, de 5 a 15. */
      opacidad: number;
      tam: "m" | "g";
    };
    /** Pone «BORRADOR» mientras el informe no está aprobado (si no hay otra marca elegida). */
    borradorAuto: boolean;
  };
  pagina: {
    papel: Papel;
    nueva1: boolean;
    refAparte: boolean;
    sangFr: boolean;
  };
}

export const LIM = {
  nombre: 60,
  descripcion: 200,
  fs: [9, 12],
  lh: [1.3, 1.8],
  mx: [14, 30],
  opacidad: [5, 15],
  marcaTexto: 24,
  idImagen: 60,
  bytes: 200_000,
} as const;

/* ---------- Estilos de fábrica -------------------------------------------------------- */

export const ID_INSTITUCIONAL = "f:institucional";
export const ID_ACADEMICO = "f:academico";
export const ID_EJECUTIVO = "f:ejecutivo";
export const ID_CLASICO = "f:clasico";

/** Estilo de los informes nuevos. Cámbielo aquí si se decide otro. */
export const ESTILO_INFORME_NUEVO = ID_INSTITUCIONAL;
/** Estilo de todo documento que no guardó uno: sale idéntico a como salía antes de los estilos. */
export const ESTILO_SIN_ELEGIR = ID_CLASICO;

const BASE: Estilo = {
  version: 1,
  nombre: "Institucional",
  descripcion: "El del boletín UDES en Cifras: cabecera de dos niveles, Montserrat, capítulos con sello y tablas con encabezado marino.",
  portada: { comp: 1, fondo: "foto", alinea: "izq", tam: 1, acento: "#1f5fbf", mono: "UDS", logos: { udes: true, mono: false, propioId: "" }, tono: "marino" },
  texto: { fb: "Montserrat", ft: "Montserrat", fs: 10, lh: 1.5, just: true, cols: 1, mx: 20, num: true, cap: "sello", dest: "caja", tcol: "marino", sang: false },
  tablas: { enc: "marino", cebra: false, bordes: "horiz", calor: true, dens: "normal", capPos: "abajo", capEstilo: "fuerte", nota: "caja" },
  cabpie: { cab: "dos", edif: true, folio: "exterior", filetePie: true, pieTexto: true, marca: { modo: "ninguna", texto: "", imagenId: "", opacidad: 8, tam: "m" }, borradorAuto: false },
  pagina: { papel: "carta", nueva1: true, refAparte: true, sangFr: true },
};

const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function fabrica(id: string): Estilo {
  const e = clon(BASE);
  switch (id) {
    case ID_ACADEMICO:
      e.nombre = "Académico (APA)";
      e.descripcion = "Para tesis y trabajos: letra con serifa, una columna, títulos sencillos, tablas a la APA y número de página a la derecha.";
      Object.assign(e.portada, { comp: 3, fondo: "color", acento: "#072b58", tono: "acento" });
      Object.assign(e.texto, { fb: "Source Serif 4", ft: "Source Serif 4", fs: 11, lh: 1.7, just: false, cap: "sencillo", dest: "sangrado", num: false, mx: 25, sang: true });
      Object.assign(e.tablas, { enc: "claro", bordes: "apa", calor: false, capPos: "arriba", capEstilo: "apa", nota: "texto" });
      Object.assign(e.cabpie, { cab: "simple", edif: false, folio: "derecha", filetePie: false, pieTexto: false });
      break;
    case ID_EJECUTIVO:
      e.nombre = "Ejecutivo";
      e.descripcion = "Para resúmenes de decisión: dos columnas, filetes, tablas compactas con cebra.";
      Object.assign(e.portada, { comp: 2, fondo: "color", acento: "#0b7481", tono: "acento" });
      Object.assign(e.texto, { fb: "Open Sans", ft: "Montserrat", fs: 9.5, lh: 1.5, just: false, cols: 2, mx: 18, cap: "filete", dest: "filetes", num: false });
      Object.assign(e.tablas, { enc: "acento", cebra: true, calor: false, dens: "compacta" });
      Object.assign(e.cabpie, { cab: "simple", edif: false, folio: "exterior" });
      break;
    case ID_CLASICO:
      e.nombre = "Clásico UDrive";
      e.descripcion = "El aspecto que tenían todos los informes antes de los estilos. Lo usan los documentos que no eligieron otro.";
      Object.assign(e.portada, { comp: 0, fondo: "foto", acento: "#2b6cc4", tono: "marino" });
      Object.assign(e.texto, { fb: "Georgia", ft: "Open Sans", fs: 11.25, lh: 1.5, just: true, cols: 1, mx: 19.05, num: false, cap: "clasico", dest: "barra", tcol: "acento", sang: true });
      Object.assign(e.tablas, { enc: "clasico", bordes: "clasico", calor: true, dens: "normal", capPos: "arriba", capEstilo: "clasico", nota: "clasico" });
      Object.assign(e.cabpie, { cab: "clasica", edif: false, folio: "derecha", filetePie: false, pieTexto: false, marca: { modo: "clasica", texto: "", imagenId: "", opacidad: 10, tam: "m" }, borradorAuto: true });
      Object.assign(e.pagina, { nueva1: true, refAparte: true, sangFr: true });
      break;
    default:
      break;
  }
  return e;
}

export const FABRICAS: { id: string; nombre: string; descripcion: string }[] = [ID_INSTITUCIONAL, ID_ACADEMICO, ID_EJECUTIVO, ID_CLASICO].map((id) => {
  const e = fabrica(id);
  return { id, nombre: e.nombre, descripcion: e.descripcion };
});

export const esDeFabrica = (id: string | undefined | null): boolean => Boolean(id && id.startsWith("f:"));

export function estiloDeFabrica(id: string): Estilo {
  return fabrica(FABRICAS.some((f) => f.id === id) ? id : ESTILO_SIN_ELEGIR);
}

/* ---------- Normalizar ------------------------------------------------------------------ */

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const cadena = (v: unknown, max: number, def = ""): string => (typeof v === "string" ? v.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, max) : def);
const entre = (v: unknown, [min, max]: readonly [number, number] | readonly number[], def: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const uno = <T extends string | number>(v: unknown, validos: readonly T[], def: T): T => (validos.includes(v as T) ? (v as T) : def);
const si = (v: unknown, def: boolean): boolean => (typeof v === "boolean" ? v : def);
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const idImagen = (v: unknown): string => (typeof v === "string" && ID.test(v) ? v : "");

/** Oscurece un color hasta que el texto blanco se lea sobre él (4,5:1). */
export function oscurecerHasta45(hex: string): string {
  const base = normalizarHex(hex) ?? "#1f5fbf";
  const c = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  let f = 1;
  let salida = base;
  while (contraste(salida, "#ffffff") < 4.5 && f > 0.05) {
    f -= 0.02;
    salida = `#${c.map((v) => Math.round(v * f).toString(16).padStart(2, "0")).join("")}`;
  }
  return salida;
}

/** ¿El color sirve de acento (texto blanco encima, 4,5:1)? */
export const acentoValido = (hex: string): boolean => contraste(hex, "#ffffff") >= 4.5;

/** Lee cualquier JSON como estilo: lo que falta o no sirve toma el valor del estilo base y todo se acota. Nunca lanza. */
export function normalizarEstilo(crudo: unknown, base: Estilo = BASE): Estilo {
  const d = clon(base);
  const o = objeto(crudo);
  const p = objeto(o.portada);
  const lg = objeto(p.logos);
  const t = objeto(o.texto);
  const tb = objeto(o.tablas);
  const cp = objeto(o.cabpie);
  const mk = objeto(cp.marca);
  const pg = objeto(o.pagina);

  const acento = normalizarHex(p.acento) ?? d.portada.acento;
  const mono = normalizarMonograma(p.mono) || d.portada.mono;
  const modo = uno<ModoMarca>(mk.modo as ModoMarca, ["ninguna", "texto", "imagen", "clasica"], d.cabpie.marca.modo);
  const texto = cadena(mk.texto, LIM.marcaTexto, d.cabpie.marca.texto);
  const imagen = idImagen(mk.imagenId);
  // Una marca de texto sin texto, o de imagen sin imagen, no se dibuja: queda elegida para completarla.
  const modoFinal: ModoMarca = modo;

  return {
    version: 1,
    nombre: cadena(o.nombre, LIM.nombre, d.nombre) || d.nombre,
    descripcion: cadena(o.descripcion, LIM.descripcion, d.descripcion),
    portada: {
      comp: uno<Composicion>(Number(p.comp) as Composicion, [0, 1, 2, 3, 4, 5], d.portada.comp),
      fondo: uno<FondoPortada>(p.fondo as FondoPortada, ["foto", "color", "propia"], d.portada.fondo),
      alinea: uno(p.alinea as "izq" | "centro", ["izq", "centro"], d.portada.alinea),
      tam: uno<0 | 1 | 2>(Number(p.tam) as 0 | 1 | 2, [0, 1, 2], d.portada.tam),
      // Guardarriel de contraste: un acento que no deja leer el texto blanco se oscurece.
      acento: acentoValido(acento) ? acento : oscurecerHasta45(acento),
      mono,
      logos: { udes: true, mono: si(lg.mono, d.portada.logos.mono), propioId: idImagen(lg.propioId) },
      tono: uno<TonoContraportada>(p.tono as TonoContraportada, ["marino", "acento", "foto"], d.portada.tono),
    },
    texto: {
      fb: uno<Familia>(t.fb as Familia, FAMILIAS, d.texto.fb),
      ft: uno<Familia>(t.ft as Familia, FAMILIAS, d.texto.ft),
      fs: Math.round(entre(t.fs, LIM.fs, d.texto.fs) * 100) / 100,
      lh: Math.round(entre(t.lh, LIM.lh, d.texto.lh) * 100) / 100,
      just: si(t.just, d.texto.just),
      cols: uno<1 | 2>(Number(t.cols) as 1 | 2, [1, 2], d.texto.cols),
      mx: Math.round(entre(t.mx, LIM.mx, d.texto.mx) * 100) / 100,
      num: si(t.num, d.texto.num),
      cap: uno(t.cap as Estilo["texto"]["cap"], ["sello", "filete", "sencillo", "clasico"], d.texto.cap),
      dest: uno(t.dest as Estilo["texto"]["dest"], ["caja", "filetes", "sangrado", "barra"], d.texto.dest),
      tcol: uno(t.tcol as "marino" | "acento", ["marino", "acento"], d.texto.tcol),
      sang: si(t.sang, d.texto.sang),
    },
    tablas: {
      enc: uno(tb.enc as Estilo["tablas"]["enc"], ["marino", "acento", "claro", "clasico"], d.tablas.enc),
      cebra: si(tb.cebra, d.tablas.cebra),
      bordes: uno(tb.bordes as Estilo["tablas"]["bordes"], ["horiz", "rejilla", "apa", "clasico"], d.tablas.bordes),
      calor: si(tb.calor, d.tablas.calor),
      dens: uno(tb.dens as "normal" | "compacta", ["normal", "compacta"], d.tablas.dens),
      capPos: uno(tb.capPos as "arriba" | "abajo", ["arriba", "abajo"], d.tablas.capPos),
      capEstilo: uno(tb.capEstilo as Estilo["tablas"]["capEstilo"], ["fuerte", "apa", "clasico"], d.tablas.capEstilo),
      nota: uno(tb.nota as Estilo["tablas"]["nota"], ["caja", "texto", "clasico"], d.tablas.nota),
    },
    cabpie: {
      cab: uno<TipoCabecera>(cp.cab as TipoCabecera, ["dos", "simple", "ninguna", "clasica"], d.cabpie.cab),
      edif: si(cp.edif, d.cabpie.edif),
      folio: uno<PosFolio>(cp.folio as PosFolio, ["exterior", "centro", "derecha"], d.cabpie.folio),
      filetePie: si(cp.filetePie, d.cabpie.filetePie),
      pieTexto: si(cp.pieTexto, d.cabpie.pieTexto),
      marca: {
        modo: modoFinal,
        texto,
        imagenId: imagen,
        opacidad: Math.round(entre(mk.opacidad, LIM.opacidad, d.cabpie.marca.opacidad)),
        tam: uno(mk.tam as "m" | "g", ["m", "g"], d.cabpie.marca.tam),
      },
      borradorAuto: si(cp.borradorAuto, d.cabpie.borradorAuto),
    },
    pagina: {
      papel: uno<Papel>(pg.papel as Papel, ["carta", "a4"], d.pagina.papel),
      nueva1: si(pg.nueva1, d.pagina.nueva1),
      refAparte: si(pg.refAparte, d.pagina.refAparte),
      sangFr: si(pg.sangFr, d.pagina.sangFr),
    },
  };
}

/** Contenido de un estilo que se guarda en la base (el mismo JSON, ya normalizado). */
export const estiloParaGuardar = (e: Estilo): Estilo => normalizarEstilo(e);

/* ---------- Ajustes de un informe sobre su estilo ------------------------------------------------ */

type Plano = Record<string, unknown>;

function fusionar(a: Plano, b: Plano): Plano {
  const salida: Plano = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") salida[k] = fusionar(a[k] as Plano, v as Plano);
    else salida[k] = v;
  }
  return salida;
}

/** Solo lo que cambió de `base` a `nuevo` (hojas), para guardarlo como ajuste del informe. */
export function diferencia(base: unknown, nuevo: unknown): Plano {
  const a = objeto(base);
  const b = objeto(nuevo);
  const salida: Plano = {};
  for (const k of Object.keys(b)) {
    if (k === "version" || k === "nombre" || k === "descripcion") continue;
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) {
      const d = diferencia(a[k], b[k]);
      if (Object.keys(d).length) salida[k] = d;
    } else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) salida[k] = b[k];
  }
  return salida;
}

export const hayAjustes = (aj: unknown): boolean => Object.keys(objeto(aj)).length > 0;

/** El estilo con que se imprime un informe: su instantánea con sus ajustes. Sin nada guardado, el Clásico. */
export function estiloDelInforme(d: { instantanea?: unknown; ajustes?: unknown }): Estilo {
  const base = d.instantanea ? normalizarEstilo(d.instantanea, estiloDeFabrica(ESTILO_SIN_ELEGIR)) : estiloDeFabrica(ESTILO_SIN_ELEGIR);
  return hayAjustes(d.ajustes) ? normalizarEstilo(fusionar(base as unknown as Plano, objeto(d.ajustes)), base) : base;
}

/** Normaliza el JSON de `ajustes` de un documento: solo lo que cambia de verdad y con valores válidos. */
export function normalizarAjustes(crudo: unknown, base: Estilo): Plano {
  if (!hayAjustes(crudo)) return {};
  const efectivo = normalizarEstilo(fusionar(base as unknown as Plano, objeto(crudo)), base);
  return diferencia(base, efectivo);
}

/* ---------- Tema: las medidas del papel ---------------------------------------------------------- */

export const PX_MM = 96 / 25.4;
export const PAPEL_PX: Record<Papel, { ancho: number; alto: number; nombre: string; mm: [number, number] }> = {
  carta: { ancho: 816, alto: 1056, nombre: "Carta", mm: [215.9, 279.4] },
  a4: { ancho: 794, alto: 1123, nombre: "A4", mm: [210, 297] },
};

export interface Tema {
  papel: Papel;
  horizontal: boolean;
  ancho: number;
  alto: number;
  mx: number;
  arriba: number;
  abajo: number;
  anchoCuerpo: number;
  altoCuerpo: number;
  /** Tamaño del cuerpo en píxeles y alto de línea (lo que mide el paginado). */
  fs: number;
  linea: number;
  margenP: number;
  /** Escala de los textos menores (pies, tablas, notas) respecto de los 15 px de siempre. */
  k: number;
  cols: 1 | 2;
  gap: number;
  anchoCol: number;
}

const ARRIBA: Record<TipoCabecera, number> = { clasica: 76, dos: 128, simple: 88, ninguna: 70 };
const ABAJO: Record<TipoCabecera, number> = { clasica: 76, dos: 64, simple: 64, ninguna: 64 };

export function temaDe(e: Estilo, papel: Papel, horizontal = false): Tema {
  const p = PAPEL_PX[papel];
  const ancho = horizontal ? p.alto : p.ancho;
  const alto = horizontal ? p.ancho : p.alto;
  const mx = Math.round(e.texto.mx * PX_MM);
  const fs = Math.round(((e.texto.fs * 96) / 72) * 100) / 100;
  const gap = 26;
  const anchoCuerpo = ancho - mx * 2;
  const arriba = ARRIBA[e.cabpie.cab];
  const abajo = ABAJO[e.cabpie.cab];
  const cols = e.texto.cols;
  return {
    papel,
    horizontal,
    ancho,
    alto,
    mx,
    arriba,
    abajo,
    anchoCuerpo,
    altoCuerpo: alto - arriba - abajo,
    fs,
    linea: Math.round(fs * e.texto.lh * 100) / 100,
    margenP: Math.round((fs * 2) / 3),
    k: fs / 15,
    cols,
    gap,
    anchoCol: cols === 2 ? Math.floor((anchoCuerpo - gap) / 2) : anchoCuerpo,
  };
}

/** Variables CSS que el estilo pone sobre `.ud-doc` (los valores por defecto de salida.css son los del Clásico). */
export function variablesCss(e: Estilo, t: Tema): CSSProperties {
  return {
    "--ud-fs": `${t.fs}px`,
    "--ud-lh": `${t.linea}px`,
    "--ud-mp": `${t.margenP}px`,
    "--ud-k": String(Math.round(t.k * 1000) / 1000),
    "--ud-sans": PILA[e.texto.ft],
    "--ud-serif": PILA[e.texto.fb],
    "--ud-azul": e.texto.tcol === "acento" ? e.portada.acento : MARINO,
    "--ud-acc": e.portada.acento,
    "--ud-mx": `${t.mx}px`,
    "--ud-col-gap": `${t.gap}px`,
  } as CSSProperties;
}

/** Atributos de datos sobre `.ud-doc` que activan las variantes de salida.css. */
export function atributosEstilo(e: Estilo): Record<string, string> {
  return {
    "data-ud-cap": e.texto.cap,
    "data-ud-dest": e.texto.dest,
    "data-ud-enc": e.tablas.enc,
    "data-ud-bordes": e.tablas.bordes,
    "data-ud-cebra": e.tablas.cebra ? "si" : "no",
    "data-ud-dens": e.tablas.dens,
    "data-ud-cappos": e.tablas.capPos,
    "data-ud-capest": e.tablas.capEstilo,
    "data-ud-nota": e.tablas.nota,
    "data-ud-just": e.texto.just ? "si" : "no",
  };
}

/** Las familias que el estilo necesita tener cargadas antes de medir. */
export const familiasDe = (e: Estilo): Familia[] => [...new Set<Familia>([e.texto.fb, e.texto.ft])];

/** Papel con que se imprime un informe: el suyo, si lo eligió, o el del estilo. */
export const papelDe = (docPapel: Papel | undefined, e: Estilo): Papel => docPapel ?? e.pagina.papel;

/* ---------- Avisos de diseño (guardarrieles) ----------------------------------------------------------- */

export type NivelHallazgo = "bloquea" | "avisa" | "info";
export interface Hallazgo {
  nivel: NivelHallazgo;
  texto: string;
  detalle?: string;
  /** Pestaña o grupo del editor donde se corrige. */
  grupo?: "portada" | "texto" | "tablas" | "cabpie" | "pagina";
}

const coma = (n: number, d = 1): string => n.toFixed(d).replace(".", ",");

/**
 * Lo que el estilo permite pero suele salir mal, o lo que no se puede dejar.
 * El normalizador ya impide los valores fuera de rango; esto avisa de las
 * combinaciones.
 */
export function avisosDeEstilo(e: Estilo): Hallazgo[] {
  const L: Hallazgo[] = [];
  const r = contraste(e.portada.acento, "#ffffff");
  if (r < 4.5) L.push({ nivel: "bloquea", grupo: "portada", texto: `El color de acento da ${coma(r)}:1 con texto blanco y necesita 4,5:1.`, detalle: "Se usa en franjas con texto blanco y en títulos." });
  if (e.texto.cols === 2 && e.texto.just && e.texto.fs >= 11) L.push({ nivel: "avisa", grupo: "texto", texto: `Dos columnas justificadas con letra de ${coma(e.texto.fs)} pt dejan espacios grandes entre palabras.`, detalle: "Pase el texto a la izquierda o baje a 10 pt." });
  if (e.texto.lh < 1.4 && e.texto.fs >= 11) L.push({ nivel: "avisa", grupo: "texto", texto: `Interlineado ajustado con letra de ${coma(e.texto.fs)} pt: las líneas quedan muy juntas.`, detalle: "Use 1,5 o más." });
  if (e.tablas.cebra && e.tablas.calor) L.push({ nivel: "avisa", grupo: "tablas", texto: "La cebra y el mapa de calor se mezclan en la misma tabla.", detalle: "Apague una de las dos." });
  const m = e.cabpie.marca;
  if ((m.modo === "texto" || m.modo === "imagen") && m.opacidad > 10) L.push({ nivel: "avisa", grupo: "cabpie", texto: `La marca de agua al ${m.opacidad} % le quita contraste al texto que queda debajo.`, detalle: "Bájela a 10 % o menos." });
  if (m.modo === "imagen" && !m.imagenId) L.push({ nivel: "info", grupo: "cabpie", texto: "La marca de agua de imagen no tiene imagen.", detalle: "Elija una imagen de UDrive." });
  if (m.modo === "texto" && !m.texto.trim()) L.push({ nivel: "info", grupo: "cabpie", texto: "La marca de agua de texto está vacía.", detalle: "Escriba el texto que va en la marca." });
  if (e.portada.logos.mono && !e.portada.mono) L.push({ nivel: "bloquea", grupo: "portada", texto: "El monograma necesita de 3 a 4 caracteres." });
  if (e.texto.cap === "sello" && !e.texto.num) L.push({ nivel: "info", grupo: "texto", texto: "El sello de los capítulos va sin número porque la numeración está apagada.", detalle: "Queda solo el filete de color." });
  if (e.portada.comp !== 1 && e.portada.comp !== 0 && e.portada.fondo !== "color") L.push({ nivel: "info", grupo: "portada", texto: "Esta composición no usa foto: el fondo elegido solo se ve en la contraportada con foto." });
  if (e.cabpie.cab === "ninguna" && e.cabpie.folio === "exterior") L.push({ nivel: "info", grupo: "cabpie", texto: "Sin cabecera, el título del informe no se repite en las páginas.", detalle: "El pie conserva el número de página." });
  return L;
}

/* ---------- Pequeñas ayudas ------------------------------------------------------------------------------ */

export const ACENTOS = ["#1f5fbf", "#072b58", "#0b7481", "#1a6b5a", "#a4471f", "#6b3fa0"] as const;

/** Resumen de un estilo para la lista: «Montserrat 10 pt · una columna · Carta». */
export function resumenDeEstilo(e: Estilo): string {
  return `${e.texto.fb} ${coma(e.texto.fs)} pt · ${e.texto.cols === 2 ? "dos columnas" : "una columna"} · ${PAPEL_PX[e.pagina.papel].nombre}`;
}

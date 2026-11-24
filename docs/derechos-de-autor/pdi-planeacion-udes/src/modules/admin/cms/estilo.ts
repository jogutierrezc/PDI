/* =============================================================================
   CMS Portales · sistema de estilo.

   Dos niveles que se publican como variables CSS:

   * Sitio (por portal, cms_portales.estilo, migración 0201): fuentes, tamaño
     base, escala de títulos, colores, esquinas y forma de los botones. Las
     variables y la clase de activación van en el marco (.cms-marco).
   * Bloque (clave reservada `_diseno` dentro de props): lo que ese bloque
     cambia respecto del sitio. Van en su celda (.cms-celda).

   Las reglas de cms.css leen las MISMAS variables en los dos niveles (--cms-fh,
   --cms-bs, --cms-wt…); la herencia de CSS hace el resto. Sin nada guardado no
   se emite ninguna variable ni clase y el aspecto es el de siempre.

   Seguridad: nada que venga de la base o del usuario se interpola crudo. Cada
   valor se sanea (colores #rrggbb, números en rango, fuente de una lista) y las
   pilas de fuentes salen de una tabla propia, no del dato.

   Casi todo es lógica pura; el único hook (useFuentes) carga las familias que
   se usan, y solo esas, con un <link> dinámico.
   ========================================================================== */

import { useEffect, type CSSProperties } from "react";
import type { Props } from "./tipos";

/* --- Fuentes ---------------------------------------------------------------------------------- */

/** Las familias de Google Fonts que se pueden elegir. */
export const FUENTES_GOOGLE = [
  "Montserrat",
  "Source Sans 3",
  "Fraunces",
  "Lora",
  "Playfair Display",
  "Merriweather",
  "Work Sans",
  "DM Sans",
  "Nunito Sans",
  "Poppins",
  "Source Serif 4",
] as const;

/** «Predeterminada» es la tipografía actual del portal (Open Sans); «Sistema», la del dispositivo. */
export const FUENTES = ["Predeterminada", "Sistema", ...FUENTES_GOOGLE] as const;
export type Fuente = (typeof FUENTES)[number];

const CON_SERIFA: readonly string[] = ["Fraunces", "Lora", "Playfair Display", "Merriweather", "Source Serif 4"];
const PILA_SISTEMA = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** La pila CSS de una fuente ya validada; con respaldo del sistema por si Google Fonts no responde. */
export function pilaDe(fuente: Fuente, rol: "titulo" | "texto"): string {
  if (fuente === "Predeterminada") return rol === "titulo" ? "var(--font-display)" : "var(--font-sans)";
  if (fuente === "Sistema") return PILA_SISTEMA;
  return `"${fuente}", ${CON_SERIFA.includes(fuente) ? 'Georgia, "Times New Roman", serif' : PILA_SISTEMA}`;
}

/**
 * Las fuentes llegan de Google Fonts por <link>. Para autoalojarlas más
 * adelante: bajar los archivos a /public/fonts, escribir su @font-face en
 * cms.css y dejar `urlFuentes` devolviendo null (así no se pide nada afuera).
 */
const ORIGEN_FUENTES = "https://fonts.googleapis.com/css2";
/** Pesos que cada familia tiene de verdad; pedir uno que no existe hace fallar toda la hoja. */
const PESOS_FUENTE: Record<string, string> = { Lora: "400;600;700", Merriweather: "400;700" };

/** La dirección de la hoja de Google Fonts con las familias dadas; null si no hay ninguna de Google. */
export function urlFuentes(familias: readonly string[]): string | null {
  const usadas = FUENTES_GOOGLE.filter((f) => familias.includes(f));
  if (usadas.length === 0) return null;
  const partes = usadas.map((f) => `family=${f.replace(/ /g, "+")}:wght@${PESOS_FUENTE[f] ?? "400;600;700;800"}`);
  return `${ORIGEN_FUENTES}?${partes.join("&")}&display=swap`;
}

/** Carga solo las familias de Google que se usan (una hoja por conjunto), sin repetir. */
export function useFuentes(familias: readonly string[]) {
  const clave = [...new Set(familias)].sort().join("|");
  useEffect(() => {
    const url = urlFuentes(clave ? clave.split("|") : []);
    if (!url || typeof document === "undefined") return;
    if (Array.from(document.head.querySelectorAll("link[data-cms-fuentes]")).some((l) => l.getAttribute("href") === url)) return;
    const enlace = document.createElement("link");
    enlace.rel = "stylesheet";
    enlace.href = url;
    enlace.dataset.cmsFuentes = "";
    document.head.appendChild(enlace);
  }, [clave]);
}

/* --- Lectura segura ---------------------------------------------------------------------------- */

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const fuenteDe = (v: unknown): Fuente | undefined => FUENTES.find((f) => f === v);
const numero = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
const entero = (v: unknown, min: number, max: number): number | undefined => {
  const n = numero(v, min, max);
  return n === undefined ? undefined : Math.round(n);
};
const en = <T extends number>(v: unknown, lista: readonly T[]): T | undefined => lista.find((x) => x === v);

/* --- Estilo del sitio -------------------------------------------------------------------------- */

export const ESCALAS = [1.2, 1.25, 1.333, 1.5] as const;
export const PESOS_TITULO = [500, 600, 700, 800] as const;
/** Forma de los botones: radio en px (recto, suave, píldora). */
export const BOTONES = [2, 6, 99] as const;

export interface EstiloSitio {
  /** Fuente de los títulos y del texto. */
  fh: Fuente;
  fb: Fuente;
  /** Tamaño base del texto, px (14 a 22). */
  base: number;
  /** Escala de los títulos. */
  ratio: (typeof ESCALAS)[number];
  /** Interlineado del texto. */
  lh: number;
  /** Peso de los títulos. */
  wh: (typeof PESOS_TITULO)[number];
  marino: string;
  acento: string;
  /** Fondo alterno. */
  alt: string;
  /** Color del texto. */
  txt: string;
  /** Radio de las esquinas de las tarjetas, px. */
  radius: number;
  /** Radio de los botones, px. */
  btn: (typeof BOTONES)[number];
}

/** Lo que el portal guardó: solo las claves válidas. Vacío = el aspecto actual. */
export type EstiloSitioParcial = Partial<EstiloSitio>;

/** Valores con los que arranca el formulario: se parecen al aspecto actual del CMS. */
export const SITIO_DEFECTO: EstiloSitio = {
  fh: "Predeterminada",
  fb: "Predeterminada",
  base: 15,
  ratio: 1.25,
  lh: 1.7,
  wh: 800,
  marino: "#0a2d63",
  acento: "#1b52ad",
  alt: "#eaeff7",
  txt: "#0d1c31",
  radius: 26,
  btn: 99,
};

export const TEMAS: { id: string; nombre: string; resumen: string; valores: EstiloSitio }[] = [
  {
    id: "clasico",
    nombre: "UDES clásico",
    resumen: "Montserrat + Source Sans",
    valores: { fh: "Montserrat", fb: "Source Sans 3", base: 17, ratio: 1.25, lh: 1.55, wh: 700, marino: "#014898", acento: "#2e9e6b", alt: "#eef3f9", txt: "#14243a", radius: 10, btn: 6 },
  },
  {
    id: "editorial",
    nombre: "Editorial",
    resumen: "Fraunces + Source Serif",
    valores: { fh: "Fraunces", fb: "Source Serif 4", base: 18, ratio: 1.333, lh: 1.65, wh: 800, marino: "#12304f", acento: "#b4532a", alt: "#f6f1e9", txt: "#1d2430", radius: 4, btn: 2 },
  },
  {
    id: "moderno",
    nombre: "Moderno",
    resumen: "Poppins + DM Sans",
    valores: { fh: "Poppins", fb: "DM Sans", base: 16, ratio: 1.2, lh: 1.5, wh: 700, marino: "#0b3b7a", acento: "#1aa37a", alt: "#edf6f3", txt: "#10222f", radius: 18, btn: 99 },
  },
];

/** Sanea lo que vino de la base: se queda solo con las claves válidas. */
export function sanearEstiloSitio(crudo: unknown): EstiloSitioParcial {
  if (!esObjeto(crudo)) return {};
  const salida: EstiloSitioParcial = {};
  const poner = <K extends keyof EstiloSitio>(clave: K, valor: EstiloSitio[K] | undefined) => {
    if (valor !== undefined) salida[clave] = valor;
  };
  poner("fh", fuenteDe(crudo.fh));
  poner("fb", fuenteDe(crudo.fb));
  poner("base", entero(crudo.base, 14, 22));
  poner("ratio", en(crudo.ratio, ESCALAS));
  const lh = numero(crudo.lh, 1.2, 1.9);
  poner("lh", lh === undefined ? undefined : Math.round(lh * 100) / 100);
  poner("wh", en(crudo.wh, PESOS_TITULO));
  for (const c of ["marino", "acento", "alt", "txt"] as const) poner(c, esHex(crudo[c]) ? crudo[c].toLowerCase() : undefined);
  poner("radius", entero(crudo.radius, 0, 32));
  poner("btn", en(crudo.btn, BOTONES));
  return salida;
}

/** El estilo completo: lo guardado sobre los valores de partida. */
export const completarEstilo = (p: EstiloSitioParcial): EstiloSitio => ({ ...SITIO_DEFECTO, ...p });

/** Variables y clase de activación para un estilo. */
export interface VariablesCss {
  clase: string;
  vars: Record<string, string>;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/** Tamaño de un título de la escala: nace en el máximo y baja con el ancho del marco (cqi) hasta la mitad. */
const fluido = (maximo: number) => {
  const m = Math.min(120, maximo);
  return `clamp(${px(Math.max(20, m * 0.5))}, ${(m / 12.3).toFixed(2)}cqi, ${px(m)})`;
};

/** Tamaños de los títulos del sitio, en px a escritorio: nivel 1 (encabezado), 2 (de sección) y 3 (de tarjeta). */
export function titulosDelSitio(base: number, ratio: number) {
  return { h1: base * ratio ** 5, h2: base * ratio ** 4, h3: base * ratio ** 2 };
}

/** Las variables CSS de lo que el portal definió; nada de lo que falta. */
export function variablesSitio(p: EstiloSitioParcial): VariablesCss {
  const vars: Record<string, string> = {};
  const clases: string[] = [];
  if (p.fh) {
    vars["--cms-fh"] = pilaDe(p.fh, "titulo");
    clases.push("cms-e-fh");
  }
  if (p.fb) {
    vars["--cms-fb"] = pilaDe(p.fb, "texto");
    clases.push("cms-e-fb");
  }
  if (p.base !== undefined) {
    Object.assign(vars, tamanosAVars("--cms-bs", { d: p.base, t: p.base, m: Math.max(15, Math.round(p.base * 0.94)) }));
    clases.push("cms-e-bs");
  }
  if (p.base !== undefined || p.ratio !== undefined) {
    const t = titulosDelSitio(p.base ?? SITIO_DEFECTO.base, p.ratio ?? SITIO_DEFECTO.ratio);
    vars["--cms-h1"] = fluido(t.h1);
    vars["--cms-h2"] = fluido(t.h2);
    vars["--cms-h3"] = px(Math.max(16, t.h3));
    clases.push("cms-e-esc");
  }
  if (p.lh !== undefined) {
    vars["--cms-lh"] = String(p.lh);
    clases.push("cms-e-lh");
  }
  if (p.wh !== undefined) {
    vars["--cms-wt"] = String(p.wh);
    clases.push("cms-e-wt");
  }
  if (p.marino) vars["--cms-c-marino"] = p.marino;
  if (p.acento) vars["--cms-c-acento"] = p.acento;
  if (p.alt) vars["--cms-c-alt"] = p.alt;
  if (p.txt) vars["--cms-c-txt"] = p.txt;
  if (p.radius !== undefined) vars["--cms-rad"] = px(p.radius);
  if (p.btn !== undefined) vars["--cms-btn"] = px(p.btn);
  return { clase: clases.join(" "), vars };
}

/** El texto de las variables, para mostrarlo y copiarlo. */
export function textoVariables(p: EstiloSitioParcial): string {
  const lineas = Object.entries(variablesSitio(p).vars).map(([k, v]) => `  ${k}: ${v};`);
  return lineas.length === 0 ? "/* Sin variables: el portal conserva el aspecto actual. */" : `.cms-marco {\n${lineas.join("\n")}\n}`;
}

/* --- Tamaños por dispositivo -------------------------------------------------------------------- */

export type DispositivoEstilo = "escritorio" | "tableta" | "telefono";
/** Tamaño de un texto en px por dispositivo; el que falta se escala desde el escritorio. */
export interface Tam {
  d?: number;
  t?: number;
  m?: number;
}
export const CLAVE_DISPOSITIVO: Record<DispositivoEstilo, keyof Tam> = { escritorio: "d", tableta: "t", telefono: "m" };

/** Cuánto del tamaño de escritorio queda en tableta y en teléfono. */
export const FACTOR_TITULO = { t: 0.88, m: 0.7 } as const;
export const FACTOR_TEXTO = { t: 1, m: 0.94 } as const;

/** Los tres tamaños completos a partir de los que haya (con la regla de herencia); null si no hay ninguno. */
export function tamanosCompletos(tam: Tam | undefined, f: { t: number; m: number }, min: number, max: number): Required<Tam> | null {
  if (!tam || (tam.d === undefined && tam.t === undefined && tam.m === undefined)) return null;
  const acotar = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const d = tam.d ?? (tam.t !== undefined ? tam.t / f.t : (tam.m as number) / f.m);
  const t = tam.t ?? d * f.t;
  const m = tam.m ?? (tam.t !== undefined ? tam.t * (f.m / f.t) : d * f.m);
  return { d: acotar(d), t: acotar(t), m: acotar(m) };
}

function tamanosAVars(nombre: string, t: Required<Tam>): Record<string, string> {
  return { [`${nombre}-d`]: px(t.d), [`${nombre}-t`]: px(t.t), [`${nombre}-m`]: px(t.m) };
}

/* --- Estilo del bloque (clave reservada `_diseno`) ---------------------------------------------- */

export const ANCHOS_CONTENIDO = ["estrecho", "medio", "amplio", "completo"] as const;
export type AnchoContenido = (typeof ANCHOS_CONTENIDO)[number];
const ANCHO_PX: Record<AnchoContenido, string> = { estrecho: "640px", medio: "880px", amplio: "1120px", completo: "100%" };
export const PESOS_BLOQUE = [400, 500, 600, 700, 800] as const;

export interface DisenoBloque {
  fh?: Fuente;
  fb?: Fuente;
  /** Tamaño del título y del texto, px por dispositivo. */
  sh?: Tam;
  sb?: Tam;
  wt?: (typeof PESOS_BLOQUE)[number];
  lh?: number;
  /** Espacio entre letras de los títulos, em. */
  ls?: number;
  color?: string;
  bg?: string;
  /** Espacio vertical, px. */
  pad?: number;
  maxw?: AnchoContenido;
  /** Radio de las tarjetas, px. */
  rad?: number;
}

export const LIMITES_DISENO = {
  sh: { min: 20, max: 120 },
  sb: { min: 12, max: 32 },
  lh: { min: 1, max: 2.2 },
  ls: { min: -0.05, max: 0.15 },
  pad: { min: 0, max: 200 },
  rad: { min: 0, max: 48 },
} as const;

function tamDe(v: unknown, min: number, max: number): Tam | undefined {
  if (!esObjeto(v)) return undefined;
  const t: Tam = {};
  for (const k of ["d", "t", "m"] as const) {
    const n = entero(v[k], min, max);
    if (n !== undefined) t[k] = n;
  }
  return Object.keys(t).length > 0 ? t : undefined;
}

/** Lo que el bloque cambia respecto del sitio, saneado. Sin `_diseno` válido, {}. */
export function disenoDe(props: Props): DisenoBloque {
  const c = props._diseno;
  if (!esObjeto(c)) return {};
  const d: DisenoBloque = {};
  const poner = <K extends keyof DisenoBloque>(clave: K, valor: DisenoBloque[K]) => {
    if (valor !== undefined) d[clave] = valor;
  };
  poner("fh", fuenteDe(c.fh));
  poner("fb", fuenteDe(c.fb));
  poner("sh", tamDe(c.sh, LIMITES_DISENO.sh.min, LIMITES_DISENO.sh.max));
  poner("sb", tamDe(c.sb, LIMITES_DISENO.sb.min, LIMITES_DISENO.sb.max));
  poner("wt", en(c.wt, PESOS_BLOQUE));
  poner("lh", numero(c.lh, LIMITES_DISENO.lh.min, LIMITES_DISENO.lh.max));
  poner("ls", numero(c.ls, LIMITES_DISENO.ls.min, LIMITES_DISENO.ls.max));
  poner("color", esHex(c.color) ? c.color.toLowerCase() : undefined);
  poner("bg", esHex(c.bg) ? c.bg.toLowerCase() : undefined);
  poner("pad", entero(c.pad, LIMITES_DISENO.pad.min, LIMITES_DISENO.pad.max));
  poner("maxw", ANCHOS_CONTENIDO.find((a) => a === c.maxw));
  poner("rad", entero(c.rad, LIMITES_DISENO.rad.min, LIMITES_DISENO.rad.max));
  return d;
}

/**
 * Devuelve las props con el parche aplicado al `_diseno`; una clave en `undefined`
 * se quita, y sin nada que cambiar la clave reservada desaparece. No modifica el original.
 */
export function cambiarDiseno(props: Props, parche: Partial<Record<keyof DisenoBloque, unknown>>): Props {
  const siguiente: Record<string, unknown> = { ...disenoDe(props), ...parche };
  for (const k of Object.keys(siguiente)) if (siguiente[k] === undefined) delete siguiente[k];
  const { _diseno: _anterior, ...resto } = props;
  void _anterior;
  const limpio = disenoDe({ _diseno: siguiente });
  return Object.keys(limpio).length > 0 ? { ...resto, _diseno: limpio } : resto;
}

/** Cuántas propiedades cambia el bloque (para el botón «Restablecer todo»). */
export const cuantasCambia = (d: DisenoBloque): number => Object.keys(d).length;

/** Luminancia relativa de WCAG de un #rrggbb. */
export function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Relación de contraste de WCAG entre dos #rrggbb (1 a 21). */
export function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Texto de un fondo: blanco sobre oscuro, tinta sobre claro. */
export const textoSobre = (bg: string, tinta = "#0d1c31"): string => (luminancia(bg) < 0.18 ? "#ffffff" : tinta);

export interface EstiloAplicado {
  clase: string;
  style: CSSProperties;
}

/** Clase y estilo en línea de la celda de un bloque. Solo salen valores ya saneados. */
export function estiloDeBloque(props: Props): EstiloAplicado {
  const d = disenoDe(props);
  const v: Record<string, string> = {};
  const clases: string[] = [];
  const style: CSSProperties = {};
  if (d.fh) {
    v["--cms-fh"] = pilaDe(d.fh, "titulo");
    clases.push("cms-e-fh");
  }
  if (d.fb) {
    v["--cms-fb"] = pilaDe(d.fb, "texto");
    clases.push("cms-e-fb");
  }
  const sh = tamanosCompletos(d.sh, FACTOR_TITULO, LIMITES_DISENO.sh.min, LIMITES_DISENO.sh.max);
  if (sh) {
    Object.assign(v, tamanosAVars("--cms-hs", sh));
    clases.push("cms-e-hs");
  }
  const sb = tamanosCompletos(d.sb, FACTOR_TEXTO, LIMITES_DISENO.sb.min, LIMITES_DISENO.sb.max);
  if (sb) {
    Object.assign(v, tamanosAVars("--cms-bs", sb));
    clases.push("cms-e-bs");
  }
  if (d.wt !== undefined) {
    v["--cms-wt"] = String(d.wt);
    clases.push("cms-e-wt");
  }
  if (d.lh !== undefined) {
    v["--cms-lh"] = String(d.lh);
    clases.push("cms-e-lh");
  }
  if (d.ls !== undefined) {
    v["--cms-ls"] = `${d.ls}em`;
    clases.push("cms-e-ls");
  }
  if (d.rad !== undefined) v["--cms-rad"] = px(d.rad);
  if (d.maxw) v["--cms-maxw"] = ANCHO_PX[d.maxw];
  // Con color o fondo propios, el texto, las líneas y las tarjetas se calculan a partir del texto.
  if (d.color || d.bg) {
    const texto = d.color ?? textoSobre(d.bg as string);
    if (d.bg) style.backgroundColor = d.bg;
    style.color = texto;
    v["--cms-ink2"] = `color-mix(in srgb, ${texto} 78%, transparent)`;
    v["--cms-linea"] = `color-mix(in srgb, ${texto} 22%, transparent)`;
    v["--cms-tarjeta"] = `color-mix(in srgb, ${texto} 6%, transparent)`;
  }
  if (d.pad !== undefined) style.paddingBlock = d.pad;
  return { clase: clases.join(" "), style: { ...style, ...v } as CSSProperties };
}

/** Clase y estilo en línea del marco de la página (el estilo del sitio). */
export function estiloDeMarco(p: EstiloSitioParcial | null | undefined): EstiloAplicado {
  if (!p) return { clase: "", style: {} };
  const { clase, vars } = variablesSitio(p);
  return { clase, style: vars as CSSProperties };
}

/** Las familias que usan el sitio y los bloques, para cargar solo esas. */
export function familiasUsadas(sitio: EstiloSitioParcial | null | undefined, bloques: readonly { props: Props }[]): string[] {
  const salida = new Set<string>();
  for (const f of [sitio?.fh, sitio?.fb]) if (f) salida.add(f);
  for (const b of bloques) {
    const d = disenoDe(b.props);
    for (const f of [d.fh, d.fb]) if (f) salida.add(f);
  }
  return [...salida];
}

/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · la personalización, sin React.

   Dos piezas, las dos con JSON que viene de la base (migración 0189) y que
   puede traer cualquier cosa:

     PerfilOficina   lo que es de la unidad y se repite cada año: monograma de
                     3 a 4 letras, color de acento, escudo, contacto opcional
                     y pie.
     DisenoInforme   lo que es de un informe: papel, portada, cierre y
                     contraportada.

   Cada normalizador acepta lo que sea, nunca lanza, recorta los textos a su
   límite y rellena lo que falte con buenos valores por defecto. Lo vacío no se
   imprime (ni deja huecos): los campos opcionales quedan en cadena vacía.
   ========================================================================== */

/* ---------- Papel ---------------------------------------------------------- */

export type Papel = "carta" | "a4";

export interface MedidasPapel {
  nombre: string;
  /** Hoja y zona de cuerpo, en milímetros. */
  ancho: number;
  alto: number;
  cuerpoAncho: number;
  cuerpoAlto: number;
}

/** Márgenes de la hoja del boletín: 16 mm a los lados, 35,5 mm arriba (cabecera) y 18 mm abajo (pie). */
export const MARGEN_X = 16;
export const CUERPO_ARRIBA = 35.5;
export const CUERPO_ABAJO = 18;

const medidas = (nombre: string, ancho: number, alto: number): MedidasPapel => ({
  nombre,
  ancho,
  alto,
  cuerpoAncho: Math.round((ancho - MARGEN_X * 2) * 10) / 10,
  cuerpoAlto: Math.round((alto - CUERPO_ARRIBA - CUERPO_ABAJO) * 10) / 10,
});

/** Carta: 215,9 × 279,4 mm (cuerpo 183,9 × 225,9). A4: 210 × 297 mm (cuerpo 178 × 243,5). */
export const PAPELES: Record<Papel, MedidasPapel> = {
  carta: medidas("Carta", 215.9, 279.4),
  a4: medidas("A4", 210, 297),
};

export const PAPEL_BASE: Papel = "carta";

/** Píxeles CSS por milímetro (96 ppp). */
export const PX_POR_MM = 96 / 25.4;

/* ---------- Límites de texto ------------------------------------------------ */

export const LIMITES = {
  titulo: 90,
  subtitulo: 120,
  unidad: 70,
  anio: 4,
  ciclo: 60,
  mensaje: 420,
  firmaNombre: 40,
  firmaCargo: 46,
  creditos: 240,
  frase: 90,
  pie: 80,
  correo: 80,
  telefono: 36,
  direccion: 90,
  web: 80,
  ruta: 300,
} as const;

export const MAX_FIRMAS = 3;

/* ---------- Color de acento ---------------------------------------------------- */

export const MARINO = "#072b58";
export const ACENTO_BASE = "#1f5fbf";

/** Los tres acentos sugeridos, de la paleta del boletín. Todos superan 4,5:1 con texto blanco. */
export const ACENTOS_SUGERIDOS: { hex: string; nombre: string }[] = [
  { hex: "#1f5fbf", nombre: "Azul institucional" },
  { hex: "#072b58", nombre: "Azul marino" },
  { hex: "#0b7481", nombre: "Verde azulado" },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** «#abc» o «abcdef» → «#aabbcc». Nulo si no es un color. */
export function normalizarHex(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  let s = valor.trim().toLowerCase();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX.test(s) ? s : null;
}

function luminancia(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Relación de contraste WCAG entre dos colores (1 a 21). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, oscuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

export interface EvaluacionAcento {
  hex: string;
  /** Color del texto que va sobre el acento: blanco o marino, el que mejor se lee. */
  texto: string;
  /** Contraste de ese texto con el acento. */
  razon: number;
  /** El texto se lee bien (≥ 4,5:1) y el acento no se pierde sobre el papel blanco (≥ 1,4:1). */
  ok: boolean;
  /** Qué decirle a quien eligió el color, si algo no cuadra. Vacío si está bien. */
  aviso: string;
  /** El texto tuvo que cambiar a marino para leerse. */
  textoMarino: boolean;
}

/**
 * Valida un acento: elige blanco o marino para el texto de la franja y avisa
 * si ninguno llega a 4,5:1 o si el color casi no se ve sobre el papel.
 */
export function evaluarAcento(valor: unknown): EvaluacionAcento {
  const hex = normalizarHex(valor) ?? ACENTO_BASE;
  const conBlanco = contraste(hex, "#ffffff");
  const conMarino = contraste(hex, MARINO);
  const sobrePapel = contraste(hex, "#ffffff");
  let texto = "#ffffff";
  let razon = conBlanco;
  let textoMarino = false;
  if (conBlanco < 4.5 && conMarino > conBlanco) {
    texto = MARINO;
    razon = conMarino;
    textoMarino = true;
  }
  let aviso = "";
  if (razon < 4.5) aviso = "Ni el texto blanco ni el marino se leen bien sobre este color. Elija uno más oscuro o más claro.";
  else if (sobrePapel < 1.4) aviso = "Este color es tan claro que casi no se distingue del papel. Elija uno más oscuro.";
  else if (textoMarino) aviso = "El color es claro: el texto de la franja se imprime en azul marino para que se lea.";
  return { hex, texto, razon: Math.round(razon * 10) / 10, ok: razon >= 4.5 && sobrePapel >= 1.4, aviso, textoMarino };
}

/* ---------- Monograma ---------------------------------------------------------------- */

const VACIAS = new Set(["de", "del", "la", "las", "los", "y", "e", "el", "en", "a", "para", "por", "con", "al"]);

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Solo letras y dígitos, en mayúsculas y sin tildes; de 3 a 4 caracteres. Vacío si no se puede. */
export function normalizarMonograma(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const s = sinTildes(valor).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return s.length >= 3 ? s : "";
}

/**
 * Monograma por defecto, de las iniciales del nombre: «Oficina de Planeación
 * Institucional» → OPI. Si salen menos de tres, completa con las letras de la
 * última palabra: «Facultad de Ingeniería» → FIN.
 */
export function monogramaPorDefecto(nombre: string): string {
  const palabras = sinTildes(nombre)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !VACIAS.has(p.toLowerCase()));
  if (!palabras.length) return "UDS";
  let m = palabras.map((p) => p[0]).join("").slice(0, 4);
  if (m.length < 3) {
    const resto = palabras[palabras.length - 1].slice(1);
    m += resto.slice(0, 3 - m.length);
  }
  // Una sola palabra corta («UDES») o muy corta: se completa con relleno neutro.
  while (m.length < 3) m += "X";
  return m.slice(0, 4);
}

/* ---------- Perfil de la oficina ------------------------------------------------------- */

export interface Contacto {
  correo: string;
  telefono: string;
  direccion: string;
  web: string;
}

export interface PerfilOficina {
  /** Nombre de la unidad (viene de `units`, no se guarda). */
  nombre: string;
  monograma: string;
  /** Color de acento ya validado. */
  acento: string;
  /** Escudo o logo propio (ruta en el bucket informe-portadas); vacío usa el monograma. */
  logoRuta: string;
  contacto: Contacto;
  /** Línea que corre al pie, a la izquierda; vacío usa el nombre de la unidad. */
  pie: string;
}

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Como `texto`, pero conserva los saltos de línea (mensajes y créditos). */
const parrafos = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v
        .replace(/\r/g, "")
        .split("\n")
        .map((l) => l.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max)
    : "";
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const entre = (v: unknown, min: number, max: number, base: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : base;
};
const unoDe = <T extends string | number>(v: unknown, validos: readonly T[], base: T): T => (validos.includes(v as T) ? (v as T) : base);

export const CONTACTO_VACIO: Contacto = { correo: "", telefono: "", direccion: "", web: "" };

export function normalizarContacto(raw: unknown): Contacto {
  const o = objeto(raw);
  return {
    correo: texto(o.correo, LIMITES.correo),
    telefono: texto(o.telefono, LIMITES.telefono),
    direccion: texto(o.direccion, LIMITES.direccion),
    web: texto(o.web, LIMITES.web),
  };
}

/** ¿Hay algo que imprimir del contacto? */
export const hayContacto = (c: Contacto): boolean => Boolean(c.correo || c.telefono || c.direccion || c.web);

/** El perfil de la unidad a partir de la fila de la base (o de nada). Nunca lanza. */
export function normalizarPerfil(raw: unknown, nombreUnidad: string): PerfilOficina {
  const o = objeto(raw);
  const nombre = texto(nombreUnidad, LIMITES.unidad * 2) || "Unidad";
  return {
    nombre,
    monograma: normalizarMonograma(o.monograma) || monogramaPorDefecto(nombre),
    acento: normalizarHex(o.acento) ?? ACENTO_BASE,
    logoRuta: texto(o.logo_ruta ?? o.logoRuta, LIMITES.ruta),
    contacto: normalizarContacto(o.contacto),
    pie: texto(o.pie, LIMITES.pie),
  };
}

/** Lo que se guarda en `informe_perfiles` (la base exige monograma de 3 a 4 y acento de 6 dígitos). */
export function perfilParaGuardar(p: PerfilOficina) {
  return {
    monograma: normalizarMonograma(p.monograma),
    acento: normalizarHex(p.acento) ?? "",
    logo_ruta: p.logoRuta,
    contacto: { ...p.contacto },
    pie: p.pie,
  };
}

/* ---------- Diseño del informe ------------------------------------------------------------- */

export type Composicion = 1 | 2 | 3 | 4 | 5;
export const COMPOSICIONES: { id: Composicion; nombre: string; conFoto: boolean; conAlineacion: boolean; tamanos: [number, number, number] }[] = [
  { id: 1, nombre: "Foto superior", conFoto: true, conAlineacion: true, tamanos: [11, 13.5, 16] },
  { id: 2, nombre: "Bloque de color", conFoto: false, conAlineacion: true, tamanos: [11, 13.5, 16] },
  { id: 3, nombre: "Tipográfica", conFoto: false, conAlineacion: false, tamanos: [12, 15, 18] },
  { id: 4, nombre: "Barra lateral", conFoto: false, conAlineacion: false, tamanos: [9.5, 11.5, 13.5] },
  { id: 5, nombre: "Franja institucional", conFoto: false, conAlineacion: true, tamanos: [11, 13.5, 16] },
];

export type FondoPortada = "foto" | "color" | "propia";
export type AlineacionFoto = "arriba" | "centro" | "abajo";
export type AlineacionTexto = "izq" | "centro";
export type TamanoTitulo = 0 | 1 | 2;
export type TonoContraportada = "marino" | "acento" | "foto";

/** La imagen propia de la portada y cómo se encuadra: x e y en % (0 a 100) y zoom de 1 a 3. */
export interface FotoPortada {
  ruta: string;
  x: number;
  y: number;
  zoom: number;
}

export interface PortadaDiseno {
  composicion: Composicion;
  titulo: string;
  subtitulo: string;
  unidad: string;
  anio: string;
  ciclo: string;
  fondo: FondoPortada;
  foto: FotoPortada | null;
  alineacionFoto: AlineacionFoto;
  tamano: TamanoTitulo;
  alineacion: AlineacionTexto;
}

export interface Firma {
  nombre: string;
  cargo: string;
}

export interface CierreDiseno {
  mensaje: string;
  firmas: Firma[];
  creditos: string;
}

export interface ContraportadaDiseno {
  tono: TonoContraportada;
  frase: string;
  sedes: boolean;
}

export interface DisenoInforme {
  papel: Papel;
  portada: PortadaDiseno;
  cierre: CierreDiseno;
  contraportada: ContraportadaDiseno;
}

/** Con qué se llenan los textos cuando el informe todavía no guardó nada. */
export interface BaseDiseno {
  unidad: string;
  anio: number;
  nombreCiclo: string;
}

export const MENSAJE_BASE =
  "Este informe recoge lo que la unidad logró frente a las metas que se fijó en el Plan de Desarrollo Institucional. Las cifras vienen de UDES en Cifras y del seguimiento del PDI; las que cargó la unidad indican su fuente.";
export const CREDITOS_BASE = "Elaboración: equipo de la unidad. Revisión de cifras: Oficina de Planeación Institucional.";
export const SEDES = "Bucaramanga · Cúcuta · Valledupar · Bogotá";

export function disenoPorDefecto(base: BaseDiseno): DisenoInforme {
  return {
    papel: PAPEL_BASE,
    portada: {
      composicion: 1,
      titulo: `Informe de gestión ${base.anio}`,
      subtitulo: "Resultados frente al Plan de Desarrollo Institucional",
      unidad: texto(base.unidad, LIMITES.unidad),
      anio: String(base.anio).slice(0, LIMITES.anio),
      ciclo: texto(base.nombreCiclo, LIMITES.ciclo),
      fondo: "foto",
      foto: null,
      alineacionFoto: "centro",
      tamano: 1,
      alineacion: "izq",
    },
    cierre: { mensaje: MENSAJE_BASE, firmas: [], creditos: CREDITOS_BASE },
    contraportada: { tono: "marino", frase: "", sedes: true },
  };
}

function normalizarFoto(raw: unknown): FotoPortada | null {
  const o = objeto(raw);
  const ruta = texto(o.ruta, LIMITES.ruta);
  if (!ruta) return null;
  return { ruta, x: entre(o.x, 0, 100, 50), y: entre(o.y, 0, 100, 50), zoom: Math.round(entre(o.zoom, 1, 3, 1) * 100) / 100 };
}

/**
 * El diseño del informe a partir de la fila de la base. Todo valor ausente,
 * mal formado o fuera de rango cae en el de `disenoPorDefecto`.
 */
export function normalizarDiseno(raw: unknown, base: BaseDiseno): DisenoInforme {
  const d = disenoPorDefecto(base);
  const f = objeto(raw);
  const p = objeto(f.portada);
  const c = objeto(f.cierre);
  const b = objeto(f.contraportada);

  const composicion = unoDe<Composicion>(Number(p.composicion) as Composicion, [1, 2, 3, 4, 5], d.portada.composicion);
  const foto = normalizarFoto(p.foto);
  let fondo = unoDe<FondoPortada>(p.fondo as FondoPortada, ["foto", "color", "propia"], d.portada.fondo);
  // Una imagen propia sin archivo no tiene qué mostrar: vuelve a la foto institucional.
  if (fondo === "propia" && !foto) fondo = "foto";

  const firmasCrudas = Array.isArray(c.firmas) ? c.firmas : [];
  const firmas: Firma[] = firmasCrudas
    .slice(0, MAX_FIRMAS)
    .map((x) => {
      const o = objeto(x);
      return { nombre: texto(o.nombre, LIMITES.firmaNombre), cargo: texto(o.cargo, LIMITES.firmaCargo) };
    })
    .filter((x) => x.nombre || x.cargo);

  return {
    papel: unoDe<Papel>(f.papel as Papel, ["carta", "a4"], PAPEL_BASE),
    portada: {
      composicion,
      titulo: typeof p.titulo === "string" ? parrafos(p.titulo, LIMITES.titulo) : d.portada.titulo,
      subtitulo: typeof p.subtitulo === "string" ? parrafos(p.subtitulo, LIMITES.subtitulo) : d.portada.subtitulo,
      unidad: typeof p.unidad === "string" ? texto(p.unidad, LIMITES.unidad) : d.portada.unidad,
      anio: typeof p.anio === "string" || typeof p.anio === "number" ? texto(String(p.anio), LIMITES.anio) : d.portada.anio,
      ciclo: typeof p.ciclo === "string" ? texto(p.ciclo, LIMITES.ciclo) : d.portada.ciclo,
      fondo,
      foto,
      alineacionFoto: unoDe<AlineacionFoto>(p.alineacionFoto as AlineacionFoto, ["arriba", "centro", "abajo"], "centro"),
      tamano: unoDe<TamanoTitulo>(Number(p.tamano) as TamanoTitulo, [0, 1, 2], 1),
      alineacion: unoDe<AlineacionTexto>(p.alineacion as AlineacionTexto, ["izq", "centro"], "izq"),
    },
    cierre: {
      mensaje: typeof c.mensaje === "string" ? parrafos(c.mensaje, LIMITES.mensaje) : d.cierre.mensaje,
      firmas,
      creditos: typeof c.creditos === "string" ? parrafos(c.creditos, LIMITES.creditos) : d.cierre.creditos,
    },
    contraportada: {
      tono: unoDe<TonoContraportada>(b.tono as TonoContraportada, ["marino", "acento", "foto"], "marino"),
      frase: typeof b.frase === "string" ? texto(b.frase, LIMITES.frase) : d.contraportada.frase,
      sedes: typeof b.sedes === "boolean" ? b.sedes : d.contraportada.sedes,
    },
  };
}

/** Lo que se guarda en `informe_diseno`. */
export function disenoParaGuardar(d: DisenoInforme) {
  return { papel: d.papel, portada: d.portada, cierre: d.cierre, contraportada: d.contraportada };
}

/* ---------- Tamaño del título de portada ------------------------------------------------------- */

/** Milímetros del título: el tamaño elegido, reducido solo cuando el texto es largo (más de 40 o 65 caracteres). */
export function tamanoTituloMm(p: Pick<PortadaDiseno, "composicion" | "tamano" | "titulo">): number {
  const comp = COMPOSICIONES.find((c) => c.id === p.composicion) ?? COMPOSICIONES[0];
  const base = comp.tamanos[p.tamano];
  const n = p.titulo.length;
  const k = n <= 40 ? 1 : n <= 65 ? 0.86 : 0.74;
  return Math.round(base * k * 10) / 10;
}

/** Nombre del archivo PDF: «Informe de gestión 2026 - Facultad de Ingeniería». */
export function nombreArchivo(unidad: string, anio: number | string): string {
  const limpio = `Informe de gestión ${anio} - ${unidad}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return limpio.slice(0, 120);
}

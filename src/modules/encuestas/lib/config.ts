/* =============================================================================
   Encuestas con Pilo · la configuración de presentación, tema, salida y acceso
   (la columna config_pilo de enc_encuestas, 0184). Pura.

   `leerConfig` acepta lo que haya en la base y devuelve siempre una configuración
   completa y segura: lo que no sea válido vuelve a su valor de partida. Los
   colores del tema se validan: un acento sin 4,5:1 contra el blanco no sirve
   para botones con letras blancas.
   ========================================================================== */

export const POSES = ["feliz", "emocionado", "pensar", "neutral", "atrevido"] as const;
export type Pose = (typeof POSES)[number];
export const ENTRADAS = [
  { id: "vuela", texto: "Llega volando" },
  { id: "aparece", texto: "Aparece" },
  { id: "ninguna", texto: "Sin entrada" },
] as const;
export type Entrada = (typeof ENTRADAS)[number]["id"];

export const FONDOS = [
  { id: "claro", texto: "Claro", color: "#f4f8fc" },
  { id: "crema", texto: "Crema", color: "#f8f3e8" },
  { id: "azul", texto: "Azul suave", color: "#e6eefb" },
] as const;
export type Fondo = (typeof FONDOS)[number]["id"];

export interface ConfigPilo {
  /** «aportes» = el flujo de logros y retos con cifras de rendicion-2026. */
  flujo: "aportes" | null;
  presentacion: { mensaje: string; pose: Pose; entrada: Entrada; voz: boolean };
  tema: { acento: string; fondo: Fondo; imagen: string; logo: string };
  salida: { siguientePaso: string; enlace: string; textoEnlace: string; mostrarResumen: boolean; copia: boolean };
  /** Acceso abierto. */
  verificacionRobots: boolean;
  datosPersonales: boolean;
  consentimiento: string;
}

export const ACENTO_UDES = "#004a97";

export const CONFIG_BASE: ConfigPilo = {
  flujo: null,
  presentacion: { mensaje: "", pose: "feliz", entrada: "vuela", voz: false },
  tema: { acento: ACENTO_UDES, fondo: "claro", imagen: "", logo: "" },
  salida: { siguientePaso: "", enlace: "", textoEnlace: "", mostrarResumen: true, copia: true },
  verificacionRobots: true,
  datosPersonales: false,
  consentimiento: "",
};

const objeto = (x: unknown): Record<string, unknown> => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const texto = (x: unknown, max: number, d = ""): string => (typeof x === "string" ? x.trim().slice(0, max) : d);
const bool = (x: unknown, d: boolean): boolean => (typeof x === "boolean" ? x : d);

/** Luminancia relativa de un color #rrggbb (WCAG). */
function luminancia(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Contraste de un color contra el blanco (1 a 21). */
export function contrasteConBlanco(hex: string): number {
  return /^#[0-9a-f]{6}$/i.test(hex) ? 1.05 / (luminancia(hex) + 0.05) : 1;
}

/** ¿El color sirve de fondo de un botón con letras blancas? (4,5:1 o más). */
export const acentoValido = (hex: string): boolean => contrasteConBlanco(hex) >= 4.5;

/** Solo direcciones https (o rutas del mismo sitio) para imágenes y enlaces. */
export const urlSegura = (u: string): boolean => u === "" || /^https:\/\/[^\s]+$/i.test(u) || /^\/[^\s/][^\s]*$/.test(u);

export function leerConfig(raw: unknown): ConfigPilo {
  const r = objeto(raw);
  const p = objeto(r.presentacion);
  const t = objeto(r.tema);
  const s = objeto(r.salida);
  const acento = typeof t.acento === "string" && acentoValido(t.acento) ? t.acento.toLowerCase() : CONFIG_BASE.tema.acento;
  const url = (x: unknown) => {
    const u = texto(x, 500);
    return urlSegura(u) ? u : "";
  };
  return {
    flujo: r.flujo === "aportes" ? "aportes" : null,
    presentacion: {
      mensaje: texto(p.mensaje, 400),
      pose: POSES.includes(p.pose as Pose) ? (p.pose as Pose) : "feliz",
      entrada: ENTRADAS.some((e) => e.id === p.entrada) ? (p.entrada as Entrada) : "vuela",
      voz: bool(p.voz, false),
    },
    tema: { acento, fondo: FONDOS.some((f) => f.id === t.fondo) ? (t.fondo as Fondo) : "claro", imagen: url(t.imagen), logo: url(t.logo) },
    salida: { siguientePaso: texto(s.siguientePaso, 400), enlace: url(s.enlace), textoEnlace: texto(s.textoEnlace, 60), mostrarResumen: bool(s.mostrarResumen, true), copia: bool(s.copia, true) },
    verificacionRobots: bool(r.verificacionRobots, true),
    datosPersonales: bool(r.datosPersonales, false),
    consentimiento: texto(r.consentimiento, 1000),
  };
}

/** Lo que se guarda: la configuración, más el resto de claves que ya hubiera (no se pisa lo que no es de aquí). */
export function aGuardar(previo: Record<string, unknown>, c: ConfigPilo): Record<string, unknown> {
  const { flujo, ...resto } = c;
  return { ...previo, ...resto, ...(flujo ? { flujo } : {}) };
}

/* ---------- La copia descargable de lo respondido ---------- */

/** El resumen de lo que la persona envió, en texto plano, para descargar. */
export function copiaDeRespuesta(titulo: string, lineas: readonly { pregunta: string; respuesta: string }[], fecha: Date = new Date()): string {
  const f = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" }).format(fecha);
  return [`${titulo}`, `Enviado el ${f}`, "", ...lineas.flatMap((l) => [l.pregunta, l.respuesta || "(sin respuesta)", ""])].join("\n").trim() + "\n";
}

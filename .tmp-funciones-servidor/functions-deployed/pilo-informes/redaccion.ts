/* =============================================================================
   Pilo redacta y mejora secciones del informe de gestión · lógica pura.

   Reglas que se verifican aquí (si no pasan, un reintento con el error y, si
   persiste, se rechaza):
     (a) Ninguna cifra a mano: todo número es un token [[clave]] de una cifra
         incluida de ESA instancia. Solo se admiten los años del ciclo (N-1, N,
         N+1). Tampoco cifras en palabras («tres convenios»).
     (b) Lo que Pilo no puede saber queda como «[La unidad debe completar: …]»:
         premios, convenios, acreditaciones o causas que no estén en los datos
         de la unidad se rechazan.
     (c) Los ejemplos del corpus guían el tono: compartir 10 palabras seguidas
         con un ejemplo es copia y se rechaza.
     (d) La extensión de la plantilla (párrafos; palabras como aviso).
   ========================================================================== */

import { extraerJson, type Lectura, type Mensaje } from "../pilo-rankingsod/logica.ts";
import { contarPalabras, normalizar, palabras } from "./corpus.ts";
import type { Extension, SeccionPlantilla } from "./plantillas.ts";

export type { Lectura, Mensaje };

export const TOKEN_RE = /\[\[([^[\]\s]+)\]\]/g;
export const MARCADOR_RE = /\[La unidad debe completar: [^[\]]+\]/g;
export const MARCADOR = "[La unidad debe completar: …]";
export const SOLAPE_MAX = 10;
export const OBJETIVOS = ["claridad", "sintesis", "tono"] as const;
export type Objetivo = (typeof OBJETIVOS)[number];

export const tokensDe = (t: string) => [...String(t ?? "").matchAll(TOKEN_RE)].map((m) => m[1]);
const sinTokens = (t: string) => String(t ?? "").replace(TOKEN_RE, " ");
const sinMarcadores = (t: string) => String(t ?? "").replace(MARCADOR_RE, " ");

/* ---------- Quién puede ---------------------------------------------------- */

export type Accion = "estado" | "redactar" | "mejorar" | "aprender" | "ingerir" | "corpus";
export const ACCIONES: Accion[] = ["estado", "redactar", "mejorar", "aprender", "ingerir", "corpus"];

/**
 * Planeación y la administración, todo. «aprender» e «ingerir», solo ellas.
 * «redactar»: Gestor (jefe) o Contribuyente (editor) de la unidad de la
 * instancia. Lo demás: quien sea Gestor o Contribuyente de alguna unidad.
 */
export function puedeUsar(accion: Accion, p: { perfil: { role?: string | null; is_active?: boolean | null } | null; rolEnUnidad?: string | null; rolesUnidad: string[] }): boolean {
  if (!p.perfil?.is_active) return false;
  if (["planeacion", "admin"].includes(String(p.perfil.role))) return true;
  if (accion === "aprender" || accion === "ingerir") return false;
  const diligencia = (r: string | null | undefined) => r === "jefe" || r === "editor";
  if (accion === "redactar") return diligencia(p.rolEnUnidad);
  return p.rolesUnidad.some(diligencia);
}

/* ---------- Contenido de una sección --------------------------------------- */

/** El texto narrativo de `informe_secciones.contenido` (texto, text, narrativa o html). */
export function textoDeContenido(contenido: unknown): string {
  if (typeof contenido === "string") return contenido;
  if (!contenido || typeof contenido !== "object") return "";
  const c = contenido as Record<string, unknown>;
  for (const k of ["texto", "text", "narrativa", "html"]) {
    if (typeof c[k] === "string" && c[k]) {
      const t = c[k] as string;
      return k === "html" ? t.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ") : t;
    }
  }
  return "";
}

/** Las cifras escritas fuera de los tokens pasan a «[cifra]» (contexto para Pilo sin números). */
export function ocultarCifras(texto: string): string {
  return String(texto ?? "")
    .split(/(\[\[[^[\]\s]+\]\])/)
    .map((parte, i) => (i % 2 ? parte : parte.replace(/\d+(?:[.,]\d+)*(?:\s?%)?/g, "[cifra]")))
    .join("");
}

/* ---------- Cifras de la instancia ----------------------------------------- */

export interface CifraInforme {
  clave: string;
  etiqueta: string;
  fuente_tipo?: string | null;
  fuente_nombre?: string | null;
  valor?: unknown;
  visto?: unknown;
  foto_valor?: unknown;
  anterior?: unknown;
  meta?: unknown;
  incluida?: boolean | null;
  justificacion?: string | null;
  pilar?: string | null;
}

const num = (x: unknown): number | null => {
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Cómo se mueve una cifra, en palabras (Pilo no recibe los valores, solo la dirección). */
export function tendencia(c: CifraInforme): string[] {
  const actual = num(c.foto_valor) ?? num(c.valor) ?? num(c.visto);
  const out: string[] = [];
  const antes = num(c.anterior);
  const meta = num(c.meta);
  if (actual != null && antes != null) out.push(`frente al año anterior: ${actual > antes ? "mayor" : actual < antes ? "menor" : "igual"}`);
  if (actual != null && meta != null) out.push(`frente a la meta: ${actual > meta ? "por encima" : actual < meta ? "por debajo" : "igual"}`);
  return out;
}

/** Solo las cifras incluidas son claves válidas. */
export const cifrasValidas = (cifras: CifraInforme[]) => cifras.filter((c) => c.incluida !== false && c.clave);

export function lineaCifra(c: CifraInforme): string {
  const partes = [`[[${c.clave}]] — ${ocultarCifras(c.etiqueta || c.clave)}`];
  if (c.fuente_nombre || c.fuente_tipo) partes.push(`fuente: ${ocultarCifras(String(c.fuente_nombre || c.fuente_tipo))}`);
  partes.push(...tendencia(c));
  if (c.pilar) partes.push(`pilar del PDI: ${ocultarCifras(c.pilar)}`);
  if (c.justificacion) partes.push(`la unidad explica: «${ocultarCifras(c.justificacion).slice(0, 300)}»`);
  return `- ${partes.join(" · ")}`;
}

/* ---------- Verificación ---------------------------------------------------- */

const NUMERALES = /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|veinti\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|cientos|doscientos|trescientos|quinientos|mil|miles|millon|millones|docena|decena|centenar|por ciento|porciento|duplic\w*|triplic\w*)\b/g;

/** Afirmaciones que Pilo no puede saber: deben venir de la unidad o quedar como marcador. */
const SENSIBLES: [string, RegExp][] = [
  ["premio", /\bpremi\w*|\bgalardon\w*/],
  ["reconocimiento", /\breconocimient\w*|\breconocid\w*/],
  ["convenio", /\bconvenio\w*/],
  ["alianza", /\balianza\w*/],
  ["acreditación", /\bacredita\w*/],
  ["certificación", /\bcertificacion\w*|\bcertificad[oa]s?\b/],
  ["ranking", /\branking\w*|\bescalafon\w*/],
  ["causa", /\bporque\b|\bdebido a\b|\bgracias a\b|\ba causa de\b|\bse explica por\b|\bobedece a\b|\bcomo consecuencia de\b|\bse debio a\b|\bse debe a\b/],
];

const nGramas = (w: string[], n: number) => {
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
};

/** El trozo más largo (en palabras) que un texto comparte con alguno de los ejemplos. */
export function solapeMaximo(texto: string, ejemplos: string[]): number {
  const w = palabras(texto);
  let mejor = 0;
  for (const e of ejemplos) {
    const v = palabras(e);
    // Programación dinámica por filas: subcadena común más larga de palabras.
    let prev = new Array(v.length + 1).fill(0);
    for (let i = 1; i <= w.length; i++) {
      const fila = new Array(v.length + 1).fill(0);
      for (let j = 1; j <= v.length; j++) {
        if (w[i - 1] === v[j - 1]) {
          fila[j] = prev[j - 1] + 1;
          if (fila[j] > mejor) mejor = fila[j];
        }
      }
      prev = fila;
    }
  }
  return mejor;
}

export const parrafosDe = (t: string) =>
  String(t ?? "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

const numerosDe = (t: string) => sinTokens(t).match(/\d+(?:[.,]\d+)*/g) ?? [];

export interface Reglas {
  claves: string[];
  anio: number;
  extension: Extension;
  ejemplos: string[];
  /** Lo que dijo la unidad (instrucción, su texto, otras secciones, justificaciones): de aquí pueden salir hechos. */
  contexto: string;
}

export type Verificacion = { ok: true; avisos: string[] } | { ok: false; error: string };

/** ¿El borrador de Pilo cumple las reglas (a)–(d)? */
export function verificarRedaccion(texto: string, r: Reglas): Verificacion {
  const t = String(texto ?? "").trim();
  if (!t) return { ok: false, error: "El texto llegó vacío." };
  const validas = new Set(r.claves);
  const usadas = tokensDe(t);
  const malas = [...new Set(usadas.filter((k) => !validas.has(k)))];
  if (malas.length) return { ok: false, error: `Usaste ${malas.map((k) => `[[${k}]]`).join(", ")}, que no existe en este informe. Las únicas claves son: ${r.claves.map((k) => `[[${k}]]`).join(", ") || "(ninguna: no escribas cifras)"}.` };

  const resto = sinMarcadores(sinTokens(t));
  if (/[[\]]/.test(resto)) return { ok: false, error: `Solo se admiten corchetes en los tokens [[clave]] y en el marcador exacto ${MARCADOR}.` };
  const anios = new Set([r.anio - 1, r.anio, r.anio + 1].map(String));
  const cifras = numerosDe(t).filter((n) => !anios.has(n));
  if (cifras.length) return { ok: false, error: `Escribiste cifras a mano (${[...new Set(cifras)].join(", ")}). Toda cifra va como token [[clave]] de la lista; si no está en la lista, usa el marcador ${MARCADOR}.` };
  const enPalabras = [...new Set(normalizar(resto).match(NUMERALES) ?? [])];
  if (enPalabras.length) return { ok: false, error: `Escribiste cifras en palabras (${enPalabras.join(", ")}). Usa un token [[clave]] o el marcador ${MARCADOR}.` };

  const contexto = normalizar(r.contexto);
  const inventos = SENSIBLES.filter(([, re]) => re.test(normalizar(resto)) && !re.test(contexto)).map(([n]) => n);
  if (inventos.length) return { ok: false, error: `Afirmas hechos que no están en los datos de la unidad (${inventos.join(", ")}). No inventes premios, convenios, acreditaciones ni causas: déjalo como ${MARCADOR}.` };

  const parrafos = parrafosDe(t);
  const [pmin, pmax] = r.extension.parrafos;
  if (parrafos.length < pmin || parrafos.length > pmax) return { ok: false, error: `La sección pide ${r.extension.texto}: escribe entre ${pmin} y ${pmax} párrafos separados por una línea en blanco (escribiste ${parrafos.length}).` };

  const solape = solapeMaximo(t, r.ejemplos);
  if (solape >= SOLAPE_MAX) return { ok: false, error: `Copiaste ${solape} palabras seguidas de un ejemplo. Los ejemplos solo guían el tono: escribe con tus palabras.` };

  const avisos: string[] = [];
  const n = contarPalabras(sinMarcadores(t));
  const [wmin, wmax] = r.extension.palabras;
  if (n < wmin) avisos.push(`El texto es corto para «${r.extension.texto}» (${n} palabras).`);
  if (n > wmax) avisos.push(`El texto es largo para «${r.extension.texto}» (${n} palabras).`);
  if (r.claves.length && !usadas.length) avisos.push("Pilo no enlazó ninguna cifra del informe.");
  const marcadores = (t.match(MARCADOR_RE) ?? []).length;
  if (marcadores) avisos.push(`Pilo dejó ${marcadores} ${marcadores === 1 ? "marcador" : "marcadores"} «La unidad debe completar» para que la unidad los llene.`);
  return { ok: true, avisos };
}

/** ¿La versión mejorada conserva las cifras, los marcadores y los hechos del texto original? */
export function verificarMejora(antes: string, despues: string, objetivo: Objetivo): Verificacion {
  const d = String(despues ?? "").trim();
  if (!d) return { ok: false, error: "El texto llegó vacío." };
  const ta = new Set(tokensDe(antes));
  const td = new Set(tokensDe(d));
  const nuevas = [...td].filter((k) => !ta.has(k));
  if (nuevas.length) return { ok: false, error: `Agregaste ${nuevas.map((k) => `[[${k}]]`).join(", ")}, que no estaba en el texto.` };
  const perdidas = [...ta].filter((k) => !td.has(k));
  if (perdidas.length && objetivo !== "sintesis") return { ok: false, error: `Quitaste ${perdidas.map((k) => `[[${k}]]`).join(", ")}: conserva todas las cifras enlazadas tal cual.` };

  const disponibles = new Map<string, number>();
  for (const n of numerosDe(antes)) disponibles.set(n, (disponibles.get(n) ?? 0) + 1);
  for (const n of numerosDe(d)) {
    const k = disponibles.get(n) ?? 0;
    if (!k) return { ok: false, error: `Escribiste una cifra que no estaba en el texto (${n}).` };
    disponibles.set(n, k - 1);
  }
  const palabrasAntes = new Set(normalizar(antes).match(NUMERALES) ?? []);
  const numeralesNuevos = [...new Set(normalizar(d).match(NUMERALES) ?? [])].filter((x) => !palabrasAntes.has(x));
  if (numeralesNuevos.length) return { ok: false, error: `Escribiste cifras en palabras que no estaban (${numeralesNuevos.join(", ")}).` };

  if ((d.match(MARCADOR_RE) ?? []).length < (String(antes).match(MARCADOR_RE) ?? []).length) return { ok: false, error: `Conserva cada marcador ${MARCADOR}: es trabajo pendiente de la unidad.` };
  const corchetes = (t: string) => (sinMarcadores(sinTokens(t)).match(/\[/g) ?? []).length;
  if (corchetes(d) > corchetes(antes)) return { ok: false, error: "No agregues corchetes nuevos." };

  const a = normalizar(antes);
  const inventos = SENSIBLES.filter(([, re]) => re.test(normalizar(sinMarcadores(d))) && !re.test(a)).map(([n]) => n);
  if (inventos.length) return { ok: false, error: `Agregaste hechos que el texto no dice (${inventos.join(", ")}).` };

  const na = contarPalabras(antes);
  const nd = contarPalabras(d);
  if (objetivo === "sintesis" && nd > Math.max(10, Math.round(na * 0.85))) return { ok: false, error: `La síntesis debe ser más corta: el original tiene ${na} palabras y la tuya ${nd}.` };
  const avisos = perdidas.length ? [`La síntesis dejó por fuera ${perdidas.map((k) => `[[${k}]]`).join(", ")}.`] : [];
  return { ok: true, avisos };
}

/* ---------- Mensajes -------------------------------------------------------- */

export interface PedidoRedaccion {
  unidad: string;
  plantilla: string;
  anio: number;
  seccion: SeccionPlantilla & { extension: Extension };
  cifras: CifraInforme[];
  ejemplos: { unidad_nombre: string | null; titulo: string | null; texto: string }[];
  instruccion?: string;
  actual?: string;
  otras?: { titulo: string; texto: string }[];
}

export function mensajesRedactar(p: PedidoRedaccion): Mensaje[] {
  const { parrafos, palabras: w, texto: ext } = p.seccion.extension;
  const system = [
    "Eres Mr. Pilo, la IA de la Universidad de Santander (UDES). Ayudas a una unidad a redactar una sección de su informe de gestión anual. Escribes en español institucional, claro y sobrio, en tercera persona (la Facultad, la Vicerrectoría, el campus), sin adornos, sin frases de relleno y sin superlativos.",
    "Reglas que no se rompen:",
    `1. NUNCA escribes una cifra: ni con dígitos ni con palabras (nada de «tres», «el doble», porcentajes o cantidades). Cada cifra va como token [[clave]], copiado tal cual de la lista de cifras de este informe. Solo puedes escribir los años ${p.anio - 1}, ${p.anio} y ${p.anio + 1}.`,
    `2. No inventas hechos, premios, reconocimientos, convenios, alianzas, acreditaciones ni causas. Lo que haga falta y no esté en los datos (causas, contexto, ejemplos concretos) lo dejas con el marcador exacto [La unidad debe completar: lo que falta].`,
    "3. Los ejemplos de otros informes son solo guía de tono y estructura: no copies sus frases ni sus hechos. Sus «[cifra: …]» son huecos, no datos.",
    `4. Extensión: ${ext}; es decir, entre ${parrafos[0]} y ${parrafos[1]} párrafos separados por una línea en blanco, unas ${w[0]} a ${w[1]} palabras.`,
    "5. Sin títulos, viñetas, markdown ni otros corchetes.",
    'Responde solo un JSON: {"texto": "…"}',
  ].join("\n");
  const partes = [
    `Unidad: ${p.unidad} (plantilla ${p.plantilla}, informe ${p.anio}).`,
    `Sección: ${p.seccion.titulo}.`,
    p.cifras.length ? `Cifras de este informe (usa solo estos tokens):\n${p.cifras.map(lineaCifra).join("\n")}` : "Este informe aún no tiene cifras incluidas: no escribas ninguna cifra.",
  ];
  if (p.actual?.trim()) partes.push(`Lo que la unidad ya escribió en esta sección (respeta sus hechos):\n«${ocultarCifras(p.actual).slice(0, 3000)}»`);
  if (p.otras?.length) partes.push(`Lo que la unidad escribió en otras secciones (para no contradecirla):\n${p.otras.map((o) => `· ${o.titulo}: ${ocultarCifras(o.texto).slice(0, 900)}`).join("\n").slice(0, 4000)}`);
  if (p.ejemplos.length) partes.push(`Ejemplos de tono (de otros informes; no copies):\n${p.ejemplos.map((e, i) => `Ejemplo ${i + 1}${e.unidad_nombre ? ` (${e.unidad_nombre})` : ""}:\n${e.texto.slice(0, 1500)}`).join("\n\n")}`);
  if (p.instruccion?.trim()) partes.push(`Pedido de la unidad: ${ocultarCifras(p.instruccion).slice(0, 600)}`);
  partes.push("Escribe la sección.");
  return [
    { role: "system", content: system },
    { role: "user", content: partes.join("\n\n") },
  ];
}

const OBJETIVO_TEXTO: Record<Objetivo, string> = {
  claridad: "más claro: frases más cortas y directas, mismo contenido y misma extensión aproximada",
  sintesis: "más breve: alrededor de dos tercios de la extensión, con lo esencial",
  tono: "con tono institucional: sobrio, preciso y propositivo, sin adornos ni superlativos",
};

export function mensajesMejorar(texto: string, objetivo: Objetivo): Mensaje[] {
  return [
    {
      role: "system",
      content: [
        "Eres Mr. Pilo, la IA de la UDES. Mejoras un texto de un informe de gestión sin cambiar sus hechos.",
        "Reglas: conserva tal cual cada token [[clave]] y cada marcador [La unidad debe completar: …]; no agregues cifras (ni en dígitos ni en palabras), hechos, premios, convenios ni causas; no agregues corchetes, títulos ni viñetas.",
        'Responde solo un JSON: {"texto": "…"}',
      ].join("\n"),
    },
    { role: "user", content: `Déjalo ${OBJETIVO_TEXTO[objetivo]}.\n\nTexto:\n${texto}` },
  ];
}

export function mensajesReintento(mensajes: Mensaje[], crudo: string, error: string): Mensaje[] {
  return [
    ...mensajes,
    { role: "assistant", content: String(crudo ?? "").slice(0, 6000) },
    { role: "user", content: `Tu respuesta no pasó la verificación: ${error} Corrígela. Recuerda: ninguna cifra fuera de los tokens [[clave]] y nada que no esté en los datos. Responde solo el JSON.` },
  ];
}

/** El texto del JSON del modelo, limpio. */
export function leerTexto(crudo: string): Lectura<string> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const t = j.valor.texto;
  if (typeof t !== "string" || !t.trim()) return { ok: false, error: "El JSON no trae «texto»." };
  return {
    ok: true,
    valor: t
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}

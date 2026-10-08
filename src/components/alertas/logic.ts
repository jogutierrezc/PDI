/* =============================================================================
   Alertas de emergencia · lo que la capa de Pilo decide sin pantalla.

   La tabla pilo_alerts (0138) trae lo activo y lo cerrado en los últimos dos
   días. De ahí sale qué se pinta: la capa completa mientras haya una emergencia
   sin atender; una franja arriba, si la persona ya la leyó (la emergencia
   sigue: no se esconde); y, al cerrarse, un aviso corto de «todo despejado».
   ========================================================================== */

export type KindAlerta = "sismo" | "incendio" | "seguridad" | "general";

export interface FilaAlerta {
  id: string;
  source: "aluna" | "simulacro";
  code: string;
  kind: KindAlerta;
  title: string;
  body: string;
  state: "activa" | "cerrada";
  emitted_at: string;
  closed_at: string | null;
  close_note: string | null;
}

export type ModoCapa = "dormida" | "completa" | "franja" | "despejado";

export interface EstadoCapa {
  modo: ModoCapa;
  /** La alerta que manda: la activa más reciente, o la última que se cerró. */
  alerta: FilaAlerta | null;
  /** Cuántas emergencias hay activas a la vez. */
  activas: number;
}

/** Cuánto tiempo se ofrece el «todo despejado» después de cerrarse. */
export const DESPEJADO_MS = 15 * 60 * 1000;

const COLUMNAS = "id, source, code, kind, title, body, state, emitted_at, closed_at, close_note";
export { COLUMNAS as COLUMNAS_ALERTA };

const KINDS: readonly string[] = ["sismo", "incendio", "seguridad", "general"];

/** Lo que llegue de la base, sin fiarse de su forma; una fila rota se descarta. */
export function filasDe(data: unknown): FilaAlerta[] {
  if (!Array.isArray(data)) return [];
  const out: FilaAlerta[] = [];
  for (const raw of data) {
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r.id !== "string" || typeof r.title !== "string" || typeof r.emitted_at !== "string") continue;
    out.push({
      id: r.id,
      source: r.source === "simulacro" ? "simulacro" : "aluna",
      code: typeof r.code === "string" ? r.code : "",
      kind: KINDS.includes(r.kind as string) ? (r.kind as KindAlerta) : "general",
      title: r.title,
      body: typeof r.body === "string" ? r.body : "",
      state: r.state === "cerrada" ? "cerrada" : "activa",
      emitted_at: r.emitted_at,
      closed_at: typeof r.closed_at === "string" ? r.closed_at : null,
      close_note: typeof r.close_note === "string" ? r.close_note : null,
    });
  }
  return out;
}

const tiempo = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);

/**
 * @param leidas  los identificadores que la persona ya leyó en esta sesión (pasan a franja)
 * @param vistoDespejado  los identificadores cuyo «todo despejado» ya cerró
 */
export function estadoCapa(filas: readonly FilaAlerta[], leidas: ReadonlySet<string>, vistoDespejado: ReadonlySet<string>, ahora: number): EstadoCapa {
  const activas = filas.filter((f) => f.state === "activa").sort((a, b) => tiempo(b.emitted_at) - tiempo(a.emitted_at));
  if (activas.length) {
    // Si alguna activa no se ha leído, manda la capa completa con la más reciente sin leer.
    const sinLeer = activas.find((a) => !leidas.has(a.id));
    return sinLeer ? { modo: "completa", alerta: sinLeer, activas: activas.length } : { modo: "franja", alerta: activas[0], activas: activas.length };
  }
  const cerrada = filas
    .filter((f) => f.state === "cerrada" && ahora - tiempo(f.closed_at) < DESPEJADO_MS && ahora - tiempo(f.closed_at) >= 0 && !vistoDespejado.has(f.id))
    .sort((a, b) => tiempo(b.closed_at) - tiempo(a.closed_at))[0];
  return cerrada ? { modo: "despejado", alerta: cerrada, activas: 0 } : { modo: "dormida", alerta: null, activas: 0 };
}

export const NOMBRE_KIND: Record<KindAlerta, string> = {
  sismo: "Sismo",
  incendio: "Incendio",
  seguridad: "Seguridad",
  general: "Emergencia",
};

/**
 * Lo que se le recuerda a la persona mientras llega la indicación de su sede.
 * Es general a propósito: no reemplaza las instrucciones de las brigadas ni de
 * la persona que declaró la emergencia.
 */
export const GUIA: Record<KindAlerta, string[]> = {
  sismo: [
    "Mantenga la calma y aléjese de ventanas y de objetos que puedan caer.",
    "Protéjase bajo una mesa firme o junto a una columna hasta que pase el movimiento.",
    "Cuando termine, evacúe por las rutas señalizadas, sin usar ascensores.",
  ],
  incendio: [
    "Salga por la ruta de evacuación más cercana, sin usar ascensores.",
    "Si hay humo, agáchese y cúbrase la nariz y la boca.",
    "No regrese por sus cosas. Diríjase al punto de encuentro.",
  ],
  seguridad: [
    "Siga las instrucciones de seguridad y de las brigadas de su sede.",
    "Aléjese de la zona indicada y no se acerque a mirar.",
    "Avise a quien esté cerca y espere nuevas indicaciones.",
  ],
  general: ["Mantenga la calma y siga las instrucciones de las brigadas de su sede.", "Avise a quien esté cerca y espere nuevas indicaciones."],
};

/** El texto que Pilo dice en voz alta. */
export function textoParaLeer(a: Pick<FilaAlerta, "kind" | "title" | "body" | "source">): string {
  const guia = GUIA[a.kind].join(" ");
  return `${a.source === "simulacro" ? "Esto es un simulacro. " : "Atención. "}${a.title}. ${a.body} ${guia}`.replace(/\s+/g, " ").trim();
}

/** Hace cuánto empezó, en palabras. */
export function haceCuanto(iso: string, ahora: number): string {
  const min = Math.floor((ahora - tiempo(iso)) / 60000);
  if (!Number.isFinite(min) || min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : "hace más de un día";
}

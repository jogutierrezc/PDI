/* =============================================================================
   Mr. Pilo · Mis notas (beta) · las reglas de la página, en un solo sitio.

   Quién ve Mis notas, dónde vive el permiso de Génesis, qué quiere decir cada
   error de la función `pilo-genesis`, cómo se lee el histórico, y todo lo de
   «Mi evolución»: la tabla de promedios, la geometría de la gráfica, lo que
   Pilo ve en el récord y la pregunta con que se le piden recomendaciones.

   El permiso de Génesis (firmado por la función, de solo lectura):
     · nunca está en el servidor: la función lo devuelve y aquí se queda;
     · con «mantener la conexión», en el almacenamiento de este dispositivo;
     · sin ella, solo en la memoria de la pestaña: al cerrarla o recargarla,
       se va;
     · va atado a la cuenta de Pilo que lo pidió: otra cuenta en el mismo
       dispositivo no lo recibe, y encontrarlo lo borra;
     · vence solo (la función dice cuándo): vencido, se borra;
     · «Desconectar» lo borra de los dos sitios de inmediato.
   La contraseña de Génesis no pasa por aquí: va del formulario a la función y
   no se guarda en ningún lado. Las notas tampoco se guardan: viven en la
   memoria de la pantalla mientras está abierta.

   Los hallazgos de «Mi evolución» se CALCULAN aquí, en el dispositivo, con
   las notas que llegaron: nada de eso lo redacta una IA ni sale a ningún lado.

   Puro: se prueba en node.
   ========================================================================== */

import type { NotaCourse, NotaPeriod, NotasHead } from "./servidor-logica";

export type { NotaCourse, NotaPeriod, NotasHead };

/* --- Quién ---------------------------------------------------------------------------------- */

/** Mis notas es de estudiantes con cuenta de Pilo activa: Génesis es el portal del estudiante. */
export const canUseNotas = (account: { rol: string; status: string } | null | undefined): boolean => Boolean(account) && account!.status === "activa" && account!.rol === "estudiante";

/* --- El permiso, en el dispositivo ---------------------------------------------------------- */

export interface Link {
  /** El permiso firmado: se devuelve a la función en cada consulta, tal cual. */
  permit: string;
  /** Cuándo vence, en segundos desde 1970 (UTC). */
  expires: number;
  head: NotasHead;
  /** Quedó guardado en este dispositivo (si no, solo en la memoria de la pestaña). */
  kept: boolean;
}

export interface LinkStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LINK_KEY = "pilo-app:notas";

interface Held {
  owner: string;
  permit: string;
  expires: number;
  head: NotasHead;
}

/** Lo que vive solo mientras la pestaña está abierta. */
let memory: Held | null = null;

/** El almacenamiento del dispositivo; null si el navegador no lo deja usar. */
export function deviceStore(): LinkStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const permitShape = (v: unknown): v is string => typeof v === "string" && /^v1\.[A-Za-z0-9_-]{40,1600}\.[A-Za-z0-9_-]{43}$/.test(v);
const short = (v: unknown, max = 160): string => (typeof v === "string" ? v.slice(0, max) : "");
const whole = (v: unknown): number => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : 0);

/** El encabezado tal como se usa aquí; lo que no se entiende se descarta. */
export function parseHead(raw: unknown): NotasHead {
  const h = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const percent = h.creditsPercent;
  return {
    program: short(h.program),
    period: typeof h.period === "string" && /^\d{4}[A-Z0-9]{1,2}$/.test(h.period) ? h.period : "",
    creditsPercent: typeof percent === "number" && Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null,
  };
}

function parseHeld(raw: string | null): Held | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { v?: unknown; owner?: unknown; permit?: unknown; expires?: unknown; head?: unknown };
    if (d?.v !== 1 || typeof d.owner !== "string" || !d.owner || !permitShape(d.permit) || !whole(d.expires)) return null;
    return { owner: d.owner, permit: d.permit, expires: whole(d.expires), head: parseHead(d.head) };
  } catch {
    return null;
  }
}

const drop = (store: LinkStore | null) => {
  try {
    store?.removeItem(LINK_KEY);
  } catch {
    /* sin almacenamiento: no hay nada que borrar */
  }
};

/**
 * Guarda el permiso de la cuenta `owner`. Con `keep`, en el dispositivo; sin
 * él, solo en memoria (y borra el que hubiera guardado). Dice si quedó en el
 * dispositivo: con el almacenamiento lleno o bloqueado, queda en memoria.
 */
export function saveLink(owner: string, link: { permit: string; expires: number; head: NotasHead }, keep: boolean, store: LinkStore | null = deviceStore()): Link {
  memory = { owner, permit: link.permit, expires: link.expires, head: link.head };
  let kept = false;
  if (keep && store) {
    try {
      store.setItem(LINK_KEY, JSON.stringify({ v: 1, owner, permit: link.permit, expires: link.expires, head: link.head }));
      kept = true;
    } catch {
      kept = false;
    }
  }
  if (!kept) drop(store);
  return { ...link, kept };
}

/** El permiso de la cuenta `owner`, si lo hay y no ha vencido. El de otra cuenta no se entrega: se borra. */
export function readLink(owner: string, now: number = Date.now(), store: LinkStore | null = deviceStore()): Link | null {
  let stored: Held | null = null;
  let raw: string | null = null;
  try {
    raw = store?.getItem(LINK_KEY) ?? null;
  } catch {
    raw = null;
  }
  stored = parseHeld(raw);
  const live = (h: Held) => h.owner === owner && h.expires * 1000 > now;
  // Algo guardado que no se entiende, que es de otra cuenta o que ya venció: fuera.
  if (raw && (!stored || !live(stored))) {
    drop(store);
    stored = null;
  }
  if (memory && !live(memory)) memory = null;
  if (stored) return { permit: stored.permit, expires: stored.expires, head: stored.head, kept: true };
  if (memory) return { permit: memory.permit, expires: memory.expires, head: memory.head, kept: false };
  return null;
}

/** «Desconectar»: el permiso se borra de la memoria y del dispositivo, de inmediato. */
export function clearLink(store: LinkStore | null = deviceStore()): void {
  memory = null;
  drop(store);
}

/* --- Lo que responde la función ------------------------------------------------------------- */

export type NotasCode =
  | "sesion" | "cuenta" | "perfil" | "suspendida" | "limite" | "no_disponible" | "datos"
  | "credenciales" | "no_estudiante" | "permiso" | "pdf"
  | "tiempo" | "red" | "tamano" | "genesis" | "interno"
  /** Los que pone la página: sin red, la función no está desplegada, o respondió algo que no se entiende. */
  | "sin_red" | "sin_funcion" | "desconocido";

const SERVER: string[] = ["sesion", "cuenta", "perfil", "suspendida", "limite", "no_disponible", "datos", "credenciales", "no_estudiante", "permiso", "pdf", "tiempo", "red", "tamano", "genesis", "interno"];

const FALLBACK: Record<NotasCode, string> = {
  sesion: "Para ver sus notas, entre con su cuenta de Pilo.",
  cuenta: "Mis notas es para quienes tienen cuenta de Pilo de estudiante.",
  perfil: "Mis notas es para estudiantes.",
  suspendida: "Su cuenta de Pilo está suspendida. Escriba a la administración.",
  limite: "Va muy rápido: espere un momento antes de volver a intentarlo.",
  no_disponible: "Mis notas aún no está disponible: la universidad todavía no ha conectado a Pilo con Génesis.",
  datos: "Escriba su código de estudiante (solo números) y su contraseña de Génesis.",
  credenciales: "Génesis no aceptó ese código y esa contraseña. Revíselos e intente de nuevo.",
  no_estudiante: "Mis notas es para estudiantes: esa cuenta de Génesis no es de estudiante.",
  permiso: "Su permiso de Génesis venció o fue retirado. Conecte de nuevo sus notas.",
  pdf: "Génesis no entregó el polígrafo en PDF. Intente de nuevo en un momento.",
  tiempo: "Génesis tardó demasiado en responder. Intente de nuevo en un momento.",
  red: "No pude conectarme con Génesis. Intente de nuevo en un momento.",
  tamano: "Génesis devolvió más de lo que Pilo puede leer de una vez.",
  genesis: "Génesis no respondió como se esperaba. Intente de nuevo en un momento.",
  interno: "Algo falló al leer sus notas. Intente de nuevo en un momento.",
  sin_red: "No hay conexión a internet. Revísela e intente de nuevo.",
  sin_funcion: "Mis notas aún no está disponible.",
  desconocido: "Algo falló. Intente de nuevo en un momento.",
};

export const notasMessage = (code: NotasCode): string => FALLBACK[code];

/** A qué estado de la pantalla lleva un fallo. */
export type FailureView =
  /** El permiso ya no sirve: se borra y se pide conectar de nuevo. */
  | "vencido"
  /** Mis notas no se puede usar todavía (falta configurar Génesis o desplegar la función). */
  | "no_disponible"
  | "sin_conexion"
  /** La cuenta de Pilo no puede usar Mis notas, o hay que entrar otra vez. */
  | "cuenta"
  /** Se dice junto al campo de la contraseña de Génesis. */
  | "campo"
  /** Se dice en la pantalla en que esté la persona, y puede reintentar. */
  | "aviso";

const VIEW: Partial<Record<NotasCode, FailureView>> = {
  permiso: "vencido",
  no_disponible: "no_disponible",
  sin_funcion: "no_disponible",
  sin_red: "sin_conexion",
  sesion: "cuenta",
  cuenta: "cuenta",
  perfil: "cuenta",
  suspendida: "cuenta",
  credenciales: "campo",
  no_estudiante: "campo",
  datos: "campo",
};

export interface NotasFailure {
  code: NotasCode;
  message: string;
  view: FailureView;
  /** Segundos que hay que esperar (solo `limite`). */
  retryAfter?: number;
}

const waitText = (seconds: number) => (seconds >= 90 ? `${Math.round(seconds / 60)} minutos` : `${Math.max(1, Math.round(seconds))} segundos`);

export const failureOf = (code: NotasCode, message = FALLBACK[code], retryAfter?: number): NotasFailure => ({ code, message, view: VIEW[code] ?? "aviso", ...(retryAfter ? { retryAfter } : {}) });

/**
 * Una respuesta de error de `pilo-genesis`, como algo que la persona entiende
 * y con el estado de pantalla al que lleva. El texto del servidor se usa solo
 * cuando su código es de los conocidos.
 */
export function notasFailure(status: number, body: unknown): NotasFailure {
  const b = (body && typeof body === "object" ? body : {}) as { error?: unknown; code?: unknown; retry_after?: unknown };
  const said = typeof b.error === "string" ? b.error.trim().slice(0, 300) : "";
  const raw = typeof b.code === "string" ? b.code : "";
  const known = SERVER.includes(raw);
  // La plataforma responde 404 cuando la función no está desplegada.
  if (status === 404 && !known) return failureOf("sin_funcion");
  if (!known) return failureOf(status === 429 ? "limite" : status === 401 ? "sesion" : "desconocido");
  const code = raw as NotasCode;
  if (code === "limite") {
    const n = Number(b.retry_after);
    const retryAfter = Number.isFinite(n) && n > 0 ? Math.ceil(n) : undefined;
    return failureOf(code, `${said || FALLBACK.limite}${retryAfter ? ` Podrá intentarlo de nuevo en ${waitText(retryAfter)}.` : ""}`, retryAfter);
  }
  return failureOf(code, said || FALLBACK[code]);
}

/* --- Lo que llega de la función -------------------------------------------------------------- */

export interface History {
  /** Los periodos, del más antiguo al más reciente. */
  periods: NotaPeriod[];
  /** El récord de notas se dejó leer (si no, faltan el grupo y la nota mínima). */
  record: boolean;
}

const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const mark = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10 ? v : null);
const credits = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2000 ? v : 0);

/** El histórico tal como se usa aquí; lo que no se entiende se descarta. */
export function parseHistory(body: unknown): History {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const periods = rows(b.periods)
    .map((p) => ({
      id: typeof p.id === "string" && /^\d{4}[A-Z0-9]{1,2}$/.test(p.id) ? p.id : "",
      average: mark(p.average),
      accumulated: mark(p.accumulated),
      credits: credits(p.credits),
      creditsApproved: credits(p.creditsApproved),
      totalApproved: credits(p.totalApproved),
      courses: rows(p.courses)
        .map((c) => ({
          code: short(c.code, 20),
          name: short(c.name),
          credits: credits(c.credits),
          def: mark(c.def),
          approved: c.approved === true,
          homologated: c.homologated === true,
          group: short(c.group),
          min: mark(c.min),
        }))
        .filter((c) => c.name || c.code),
    }))
    .filter((p) => p.id)
    .sort((a, b2) => (a.id < b2.id ? -1 : a.id > b2.id ? 1 : 0));
  return { periods, record: b.record === true };
}

/* --- Los números y los nombres, dichos ------------------------------------------------------- */

const NOTE = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Una nota o un promedio, con coma: «4,1», «3,75». Sin redondear a un decimal: 2,95 no es 3,0. */
export const nota = (v: number | null | undefined): string => (typeof v === "number" && Number.isFinite(v) ? NOTE.format(v) : "—");

const ROMAN = /^(?:i{1,3}|iv|v|vi{1,3}|ix|x)$/i;
const SMALL = new Set(["a", "al", "con", "de", "del", "e", "el", "en", "la", "las", "los", "o", "para", "por", "u", "y"]);

/**
 * El nombre de una materia para leerlo: Génesis los manda en mayúsculas
 * («CÁLCULO DIFERENCIAL II»). Queda «Cálculo diferencial II»: los números
 * romanos siguen en mayúscula. Un nombre que ya viene con minúsculas no se toca.
 */
export function courseName(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text !== text.toUpperCase()) return text;
  const words = text.split(" ").map((w, i) => (ROMAN.test(w) && !(i === 0 && w.length === 1) && !SMALL.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()));
  const joined = words.join(" ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export type CourseState = "homologada" | "aprobada" | "reprobada" | "en_curso";

export const STATE_LABEL: Record<CourseState, string> = { homologada: "Homologada", aprobada: "Aprobada", reprobada: "Reprobada", en_curso: "En curso" };

/** ¿El periodo ya tiene alguna definitiva? Uno que apenas va en curso llega con todo en cero. */
export const settled = (p: NotaPeriod): boolean => p.courses.some((c) => c.homologated || (c.def !== null && c.def > 0));

/**
 * ¿Esa materia sigue en curso? Génesis manda las del periodo vigente sin
 * aprobar y con la definitiva en cero hasta que se cierran: eso no es haberla
 * reprobado. Vale para el periodo vigente (`current`) y para uno que aún no
 * tiene ninguna definitiva.
 */
export const inProgress = (p: NotaPeriod, c: NotaCourse, current = ""): boolean => !c.approved && !c.homologated && !(c.def !== null && c.def > 0) && (p.id === current || !settled(p));

/** El estado de una materia. La homologada se dice primero: no se cursó aquí. */
export const courseState = (c: Pick<NotaCourse, "approved" | "homologated">, pending = false): CourseState => (c.homologated ? "homologada" : c.approved ? "aprobada" : pending ? "en_curso" : "reprobada");

/** «Promedio 4,1 · 5 materias · 14 créditos». */
export function periodLine(p: NotaPeriod): string {
  const n = p.courses.length;
  const sum = p.credits || p.courses.reduce((total, c) => total + c.credits, 0);
  return [p.average !== null && settled(p) ? `Promedio ${nota(p.average)}` : "", `${n} ${n === 1 ? "materia" : "materias"}`, sum ? `${sum} ${sum === 1 ? "crédito" : "créditos"}` : ""].filter(Boolean).join(" · ");
}

/* --- Mi evolución: los promedios, periodo a periodo ------------------------------------------ */

export interface EvoRow {
  id: string;
  /** El promedio del semestre. */
  avg: number | null;
  /** El promedio acumulado hasta ese periodo. */
  acc: number | null;
  credits: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * La tabla de la evolución. Manda lo que calcula Génesis; si un periodo llega
 * sin promedio, se calcula con sus definitivas ponderadas por créditos (las
 * homologadas no cuentan), y el acumulado con todos los periodos hasta ese.
 * Un periodo que aún no tiene definitivas no tiene promedio: un cero ahí sería
 * una caída que no ocurrió.
 */
export function evolution(periods: NotaPeriod[]): EvoRow[] {
  let sumCredits = 0;
  let sumWeighted = 0;
  return periods.map((p) => {
    const counted = p.courses.filter((c) => !c.homologated && c.def !== null && c.credits > 0);
    const c = counted.reduce((total, x) => total + x.credits, 0);
    const w = counted.reduce((total, x) => total + x.credits * (x.def as number), 0);
    sumCredits += c;
    sumWeighted += w;
    const open = !settled(p);
    return {
      id: p.id,
      avg: open ? null : (p.average ?? (c > 0 ? round2(w / c) : null)),
      acc: open && !p.accumulated ? null : (p.accumulated ?? (sumCredits > 0 ? round2(sumWeighted / sumCredits) : null)),
      credits: p.credits || p.courses.reduce((total, x) => total + x.credits, 0),
    };
  });
}

export interface Totals {
  /** El promedio acumulado más reciente. */
  accumulated: number | null;
  /** Los créditos aprobados hasta hoy. */
  approved: number;
  periods: number;
}

/** Los totales de arriba del histórico. */
export function totals(periods: NotaPeriod[]): Totals {
  const evo = evolution(periods);
  const lastAcc = [...evo].reverse().find((r) => r.acc !== null)?.acc ?? null;
  const said = Math.max(0, ...periods.map((p) => p.totalApproved));
  const counted = periods.reduce((total, p) => total + p.courses.filter((c) => c.approved || c.homologated).reduce((sum, c) => sum + c.credits, 0), 0);
  return { accumulated: lastAcc, approved: said || counted, periods: periods.length };
}

/* --- Mi evolución: lo que Pilo ve en el récord ------------------------------------------------ */

export interface Finding {
  id: "acumulado" | "extremos" | "reprobadas" | "creditos" | "reciente";
  text: string;
}

const join = (items: string[]): string => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);
const times = (n: number): string => (n === 1 ? "una vez" : n === 2 ? "dos veces" : `${n} veces`);

/**
 * Lo que se ve en el récord, calculado aquí con las notas que llegaron: no
 * hay nada escrito a mano ni redactado por una IA. Con un solo periodo no se
 * habla de tendencia ni de mejor y peor.
 */
export function findings(periods: NotaPeriod[], head?: Partial<Pick<NotasHead, "creditsPercent" | "period">> | null): Finding[] {
  const out: Finding[] = [];
  const evo = evolution(periods);
  if (!evo.length) return out;

  const withAcc = evo.filter((r) => r.acc !== null);
  const last = withAcc[withAcc.length - 1];
  if (last) {
    // Contra el acumulado de cuatro periodos atrás (o el primero, si hay menos).
    const from = withAcc[Math.max(0, withAcc.length - 5)];
    const span = withAcc.length - 1 - Math.max(0, withAcc.length - 5);
    const delta = round2((last.acc as number) - (from.acc as number));
    const over = span === 1 ? "en el último periodo" : `en los últimos ${span} periodos`;
    const same = span === 1 ? "que en el periodo anterior" : `que hace ${span} periodos`;
    const trend = span < 1 ? "." : Math.abs(delta) < 0.05 ? `: prácticamente igual ${same}.` : ` y ha ${delta > 0 ? "subido" : "bajado"} ${nota(Math.abs(delta))} ${over}.`;
    out.push({ id: "acumulado", text: `Su promedio acumulado va en ${nota(last.acc)}${trend}` });
  }

  const withAvg = evo.filter((r) => r.avg !== null);
  if (withAvg.length >= 2) {
    // Con empate, el más reciente.
    const best = withAvg.reduce((a, b) => ((b.avg as number) >= (a.avg as number) ? b : a));
    const worst = withAvg.reduce((a, b) => ((b.avg as number) <= (a.avg as number) ? b : a));
    if (best.id !== worst.id) out.push({ id: "extremos", text: `Su mejor periodo fue ${best.id} (${nota(best.avg)}) y el más difícil, ${worst.id} (${nota(worst.avg)}).` });
  }
  if (withAvg.length >= 3) {
    const recent = withAvg[withAvg.length - 1];
    const before = withAvg.slice(0, -1);
    const mean = before.reduce((total, r) => total + (r.avg as number), 0) / before.length;
    const gap = round2((recent.avg as number) - mean);
    if (Math.abs(gap) >= 0.2) out.push({ id: "reciente", text: `En ${recent.id} su promedio (${nota(recent.avg)}) estuvo ${nota(Math.abs(gap))} por ${gap > 0 ? "encima" : "debajo"} de lo que traía en los periodos anteriores.` });
  }

  const failed = failedCourses(periods, head?.period ?? "");
  if (!failed.length) {
    out.push({ id: "reprobadas", text: periods.some(settled) ? "No ha reprobado ninguna materia." : "" });
  } else {
    const named = failed.slice(0, 4).map((f) => `${courseName(f.name)} en ${f.period}`);
    const more = failed.length - named.length;
    const pending = failed.filter((f) => !f.recovered);
    const after =
      pending.length === 0
        ? failed.length === 1 ? "La repitió y la aprobó." : "Las repitió y las aprobó."
        : pending.length === failed.length
          ? failed.length === 1 ? "Aún no aparece aprobada en su récord." : "Aún no aparecen aprobadas en su récord."
          : `De esas, ${pending.length === 1 ? "una aún no aparece aprobada" : `${pending.length} aún no aparecen aprobadas`} en su récord.`;
    out.push({ id: "reprobadas", text: `Reprobó ${times(failed.length)}: ${join(named)}${more > 0 ? ` y ${more} más` : ""}. ${after}` });
  }

  const t = totals(periods);
  if (t.approved > 0) {
    const percent = head?.creditsPercent;
    out.push({ id: "creditos", text: `Lleva ${t.approved} créditos aprobados${typeof percent === "number" ? `: el ${nota(percent).replace(/,0$/, "")} % de su plan de estudios` : ""}.` });
  }
  return out.filter((f) => f.text);
}

export interface FailedCourse {
  period: string;
  name: string;
  /** Aparece aprobada (o homologada) en un periodo posterior. */
  recovered: boolean;
}

const key = (c: Pick<NotaCourse, "code" | "name">) => c.code || c.name.toLowerCase().replace(/\s+/g, " ").trim();

/** Cada vez que reprobó una materia, y si después la aprobó. Las que siguen en curso no cuentan. */
export function failedCourses(periods: NotaPeriod[], current = ""): FailedCourse[] {
  const out: FailedCourse[] = [];
  periods.forEach((p, i) => {
    for (const c of p.courses) {
      if (c.approved || c.homologated || inProgress(p, c, current)) continue;
      const recovered = periods.slice(i + 1).some((later) => later.courses.some((x) => key(x) === key(c) && (x.approved || x.homologated)));
      out.push({ period: p.id, name: c.name || c.code, recovered });
    }
  });
  return out;
}

/* --- Mi evolución: la gráfica ----------------------------------------------------------------- */

/** El lienzo de la gráfica (unidades del viewBox) y sus márgenes. */
export const CHART = { W: 320, H: 190, L: 30, R: 12, T: 12, B: 26 } as const;
/** Con cuánto se aprueba: la guía de la gráfica. */
export const PASS_MARK = 3;

export interface ChartShape {
  /** El eje, uno solo para las dos series. */
  y0: number;
  y1: number;
  /** La posición de cada periodo y de cada valor (null si ese periodo no lo tiene). */
  xs: number[];
  avg: (number | null)[];
  acc: (number | null)[];
  pathAvg: string;
  pathAcc: string;
  /** Las líneas de guía, con su etiqueta. */
  grid: { value: number; y: number }[];
  /** Los periodos que se nombran en el eje (no todos caben). */
  ticks: { index: number; x: number; label: string; anchor: "start" | "middle" | "end" }[];
}

const fixed = (n: number) => Number(n.toFixed(1));

/** La geometría de la gráfica de líneas: pura, para pintarla y para probarla. */
export function chartOf(rowsIn: EvoRow[]): ChartShape {
  const { W, H, L, R, T, B } = CHART;
  const n = rowsIn.length;
  const values = rowsIn.flatMap((r) => [r.avg, r.acc]).filter((v): v is number => v !== null);
  const low = Math.min(PASS_MARK, ...values);
  // El eje baja de 2,5 solo si hay un promedio por debajo; siempre llega a 5.
  const y0 = low < 2.5 ? Math.max(0, Math.floor(low)) : 2.5;
  const y1 = Math.max(5, Math.ceil(Math.max(5, ...values)));
  const x = (i: number) => fixed(n <= 1 ? L + (W - L - R) / 2 : L + ((W - L - R) * i) / (n - 1));
  const y = (v: number) => fixed(T + (H - T - B) * (1 - (v - y0) / (y1 - y0)));
  const path = (pick: (r: EvoRow) => number | null) => {
    let d = "";
    let pen = false;
    rowsIn.forEach((r, i) => {
      const v = pick(r);
      if (v === null) return void (pen = false);
      d += `${d ? " " : ""}${pen ? "L" : "M"}${x(i)} ${y(v)}`;
      pen = true;
    });
    return d;
  };
  const grid: ChartShape["grid"] = [];
  for (let v = Math.ceil(y0 + 0.001); v <= y1; v++) grid.push({ value: v, y: y(v) });
  const step = Math.max(1, Math.ceil(n / 5));
  const ticks: ChartShape["ticks"] = [];
  rowsIn.forEach((r, i) => {
    const lastOne = i === n - 1;
    // El último siempre se nombra; el que quedaría pegado a él, no.
    if (!lastOne && (i % step !== 0 || n - 1 - i < step)) return;
    ticks.push({ index: i, x: x(i), label: r.id, anchor: n > 1 && lastOne ? "end" : n > 1 && i === 0 ? "start" : "middle" });
  });
  return { y0, y1, xs: rowsIn.map((_, i) => x(i)), avg: rowsIn.map((r) => (r.avg === null ? null : y(r.avg))), acc: rowsIn.map((r) => (r.acc === null ? null : y(r.acc))), pathAvg: path((r) => r.avg), pathAcc: path((r) => r.acc), grid, ticks };
}

/** El periodo más cercano a un punto de la gráfica (en unidades del viewBox). */
export function nearestIndex(px: number, n: number): number {
  if (n <= 1) return 0;
  const { W, L, R } = CHART;
  return Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
}

/* --- Lo que le recomiendo: la pregunta para Pilo ---------------------------------------------- */

/** Lo más que cabe en la caja de la conversación cuando la pregunta llega escrita. */
export const ASK_MAX = 500;

/**
 * La pregunta que queda escrita en la conversación para pedirle
 * recomendaciones a Pilo. Lleva solo lo calculado aquí (promedios, periodos y
 * nombres de materias reprobadas): nunca el nombre de la persona, su código,
 * su documento ni su programa. La persona la lee, la cambia si quiere y la
 * envía; nada viaja antes de eso.
 */
export function askRecommendations(periods: NotaPeriod[], current = ""): string {
  const evo = evolution(periods);
  if (!evo.length) return "";
  const said = findings(periods, { period: current })
    .filter((f) => f.id !== "creditos")
    .map((f) => f.text.replace(/^Su /, "Mi ").replace(/^Reprobó/, "Reprobé").replace(/^No ha reprobado/, "No he reprobado").replace(/^En (\S+) su promedio/, "En $1 mi promedio").replace(/La repitió y la aprobó/, "La repetí y la aprobé").replace(/Las repitió y las aprobó/, "Las repetí y las aprobé").replace(/en su récord/g, "en mi récord"));
  const lead = `Este es el resumen de mi récord académico (${evo.length} ${evo.length === 1 ? "periodo" : "periodos"}).`;
  const close = "¿Qué me recomienda para mejorar y en qué debería concentrarme?";
  let text = lead;
  for (const line of said) {
    if (`${text} ${line} ${close}`.length > ASK_MAX) break;
    text = `${text} ${line}`;
  }
  return `${text} ${close}`.slice(0, ASK_MAX);
}

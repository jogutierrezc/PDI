/* =============================================================================
   Auditar Impacto · cuánto va cada quien, con los datos reportados.

   El reporte de un periodo pasa por tres manos y en cada una se mide algo
   distinto:

     programa        ¿capturó y envió lo que le toca?
                     avance = registros enviados (o más allá) ÷ asignados.
     decanatura      ¿revisó lo que le enviaron sus programas?
                     avance = aprobados (o validados) ÷ recibidos.
     vicerrectoría   ¿validó lo que aprobó la decanatura en su función?
                     avance = validados ÷ recibidos.

   Y por oficina responsable (la que la matriz nombra para cada indicador):
   qué parte de sus registros ya está validada.

   Un registro devuelto no cuenta como avance de quien lo tiene que corregir,
   pero sí como trabajo hecho por quien lo devolvió. Nada de esto guarda
   porcentajes: se calculan aquí, siempre con su numerador y denominador a la
   vista.
   ========================================================================== */

import type { RecordState } from "./types";

export interface AuditRecord {
  id: string;
  program_id: string;
  program_name: string;
  campus_name: string | null;
  code: string;
  name: string;
  function_id: string;
  state: RecordState;
  numerator: number | null;
  text_value: string | null;
  no_data?: string | null;
  updated_at: string;
  /** Oficina responsable según la matriz (texto de origen). */
  responsible?: string | null;
}

export interface AuditUnit {
  id: string;
  parent_id: string | null;
  kind: string;
  code: string;
  name: string;
  substantive_function: string | null;
}

export interface Cutoffs {
  program: string;
  faculty: string;
  vice: string;
}

/** Una fracción con su cuenta: nunca un porcentaje suelto. */
export interface Ratio {
  num: number;
  den: number;
  /** 0–100, o null si no hay denominador. */
  pct: number | null;
}

export const ratio = (num: number, den: number): Ratio => ({ num, den, pct: den > 0 ? Math.round((num / den) * 1000) / 10 : null });

const SENT: RecordState[] = ["enviado", "aprobado_decanatura", "validado", "devuelto_decanatura"];
const DEAN_DONE: RecordState[] = ["aprobado_decanatura", "validado"];

export const hasData = (r: AuditRecord) => r.numerator !== null || Boolean(r.text_value?.trim()) || Boolean(r.no_data);

export interface Pipeline {
  total: number;
  sinDato: number;
  enCaptura: number;
  devueltoPrograma: number;
  enviado: number;
  devueltoDecanatura: number;
  aprobado: number;
  validado: number;
}

export function pipeline(records: AuditRecord[]): Pipeline {
  const p: Pipeline = { total: records.length, sinDato: 0, enCaptura: 0, devueltoPrograma: 0, enviado: 0, devueltoDecanatura: 0, aprobado: 0, validado: 0 };
  for (const r of records) {
    if (r.state === "borrador") hasData(r) ? p.enCaptura++ : p.sinDato++;
    else if (r.state === "devuelto_programa") p.devueltoPrograma++;
    else if (r.state === "enviado") p.enviado++;
    else if (r.state === "devuelto_decanatura") p.devueltoDecanatura++;
    else if (r.state === "aprobado_decanatura") p.aprobado++;
    else if (r.state === "validado") p.validado++;
  }
  return p;
}

export interface AuditRow {
  id: string;
  kind: "programa" | "facultad" | "vicerrectoria" | "oficina";
  name: string;
  /** Quién está arriba: la facultad del programa, la función de la vicerrectoría. */
  context: string;
  /** El avance que se le pide a esta mano. */
  progress: Ratio;
  /** Lo que tiene pendiente ahora mismo. */
  pending: number;
  returned: number;
  overdue: boolean;
  pipeline: Pipeline;
  lastActivity: string | null;
  records: AuditRecord[];
}

const latest = (records: AuditRecord[]) =>
  records.reduce<string | null>((max, r) => (max === null || r.updated_at > max ? r.updated_at : max), null);

const late = (cutoff: string, today: string, pending: number) => pending > 0 && today > cutoff;

const FUNCTION_NAME: Record<string, string> = {
  investigacion: "Investigación",
  ensenanza: "Enseñanza",
  extension: "Extensión",
};

/** Lo de menos avance primero: es lo que hay que mirar. */
const byProgress = (a: AuditRow, b: AuditRow) =>
  (a.progress.pct ?? 101) - (b.progress.pct ?? 101) || b.pending - a.pending || a.name.localeCompare(b.name, "es");

export function auditPrograms(records: AuditRecord[], units: AuditUnit[], cutoffs: Cutoffs, today: string): AuditRow[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const groups = new Map<string, AuditRecord[]>();
  for (const r of records) groups.set(r.program_id, [...(groups.get(r.program_id) ?? []), r]);
  return [...groups.entries()]
    .map(([id, list]) => {
      const p = pipeline(list);
      const sent = list.filter((r) => SENT.includes(r.state)).length;
      const pending = p.sinDato + p.enCaptura + p.devueltoPrograma;
      const unit = byId.get(id);
      const faculty = unit?.parent_id ? byId.get(unit.parent_id) : undefined;
      return {
        id,
        kind: "programa" as const,
        name: list[0].program_name,
        context: faculty?.name ?? "Sin facultad",
        progress: ratio(sent, list.length),
        pending,
        returned: p.devueltoPrograma,
        overdue: late(cutoffs.program, today, pending),
        pipeline: p,
        lastActivity: latest(list),
        records: list,
      };
    })
    .sort(byProgress);
}

export function auditFaculties(records: AuditRecord[], units: AuditUnit[], cutoffs: Cutoffs, today: string): AuditRow[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const groups = new Map<string, AuditRecord[]>();
  for (const r of records) {
    const faculty = byId.get(r.program_id)?.parent_id ?? "sin-facultad";
    groups.set(faculty, [...(groups.get(faculty) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([id, list]) => {
      const p = pipeline(list);
      const received = list.filter((r) => SENT.includes(r.state)).length;
      const reviewed = list.filter((r) => DEAN_DONE.includes(r.state)).length;
      const pending = p.enviado + p.devueltoDecanatura;
      const programs = new Set(list.map((r) => r.program_id)).size;
      return {
        id,
        kind: "facultad" as const,
        name: byId.get(id)?.name ?? "Programas sin facultad",
        context: `${programs} ${programs === 1 ? "programa" : "programas"} · ${ratio(received, list.length).pct ?? 0} % de lo asignado ya le llegó`,
        progress: ratio(reviewed, received),
        pending,
        returned: p.devueltoPrograma,
        overdue: late(cutoffs.faculty, today, pending),
        pipeline: p,
        lastActivity: latest(list),
        records: list,
      };
    })
    .sort(byProgress);
}

export function auditVices(records: AuditRecord[], units: AuditUnit[], cutoffs: Cutoffs, today: string): AuditRow[] {
  const vices = units.filter((u) => u.kind === "vicerrectoria" && u.substantive_function);
  const functions = new Set([...records.map((r) => r.function_id), ...vices.map((v) => v.substantive_function!)]);
  return [...functions]
    .map((fn) => {
      const list = records.filter((r) => r.function_id === fn);
      const p = pipeline(list);
      const received = p.aprobado + p.validado;
      const vice = vices.find((v) => v.substantive_function === fn);
      return {
        id: vice?.id ?? `funcion-${fn}`,
        kind: "vicerrectoria" as const,
        name: vice?.name ?? `Vicerrectoría de ${FUNCTION_NAME[fn] ?? fn} (sin unidad)`,
        context: `Valida ${FUNCTION_NAME[fn]?.toLowerCase() ?? fn} · ${list.length} registros de la función`,
        progress: ratio(p.validado, received),
        pending: p.aprobado,
        returned: p.devueltoDecanatura,
        overdue: late(cutoffs.vice, today, p.aprobado),
        pipeline: p,
        lastActivity: latest(list),
        records: list,
      };
    })
    .sort(byProgress);
}

/** Por la oficina que la matriz nombra responsable de cada indicador. */
export function auditOffices(records: AuditRecord[]): AuditRow[] {
  const groups = new Map<string, AuditRecord[]>();
  for (const r of records) {
    const key = r.responsible?.trim() || "Sin responsable en la matriz";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([name, list]) => {
      const p = pipeline(list);
      const indicators = new Set(list.map((r) => r.code)).size;
      return {
        id: `oficina-${name}`,
        kind: "oficina" as const,
        name,
        context: `${indicators} ${indicators === 1 ? "indicador" : "indicadores"} · ${ratio(list.filter((r) => SENT.includes(r.state)).length, list.length).pct ?? 0} % reportado`,
        progress: ratio(p.validado, list.length),
        pending: list.length - p.validado,
        returned: p.devueltoPrograma + p.devueltoDecanatura,
        overdue: false,
        pipeline: p,
        lastActivity: latest(list),
        records: list,
      };
    })
    .sort(byProgress);
}

export interface Headline {
  pipeline: Pipeline;
  withData: Ratio;
  sent: Ratio;
  approved: Ratio;
  validated: Ratio;
}

export function headline(records: AuditRecord[]): Headline {
  const p = pipeline(records);
  const sent = records.filter((r) => SENT.includes(r.state)).length;
  return {
    pipeline: p,
    withData: ratio(records.filter((r) => r.state !== "borrador" || hasData(r)).length, p.total),
    sent: ratio(sent, p.total),
    approved: ratio(p.aprobado + p.validado, p.total),
    validated: ratio(p.validado, p.total),
  };
}

export const formatRatio = (r: Ratio) => (r.pct === null ? "—" : `${r.pct.toLocaleString("es-CO")} %`);

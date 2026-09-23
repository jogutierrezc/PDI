import { describe, expect, it } from "vitest";
import { auditFaculties, auditOffices, auditPrograms, auditVices, headline, ratio } from "../../src/modules/impacto/data/audit";
import type { AuditRecord, AuditUnit } from "../../src/modules/impacto/data/audit";

const units: AuditUnit[] = [
  { id: "vi", parent_id: null, kind: "vicerrectoria", code: "VI", name: "Vicerrectoría de Investigaciones", substantive_function: "investigacion" },
  { id: "ve", parent_id: null, kind: "vicerrectoria", code: "VE", name: "Vicerrectoría de Enseñanza", substantive_function: "ensenanza" },
  { id: "fcs", parent_id: null, kind: "facultad", code: "FCS", name: "Ciencias de la Salud", substantive_function: null },
  { id: "med", parent_id: "fcs", kind: "programa", code: "MED", name: "Medicina", substantive_function: null },
  { id: "enf", parent_id: "fcs", kind: "programa", code: "ENF", name: "Enfermería", substantive_function: null },
];

let n = 0;
const rec = (program: "med" | "enf", state: AuditRecord["state"], fn = "ensenanza", extra: Partial<AuditRecord> = {}): AuditRecord => ({
  id: `r${++n}`,
  program_id: program,
  program_name: program === "med" ? "Medicina" : "Enfermería",
  campus_name: null,
  code: `E${n}`,
  name: "Indicador",
  function_id: fn,
  state,
  numerator: state === "borrador" ? null : 1,
  text_value: null,
  updated_at: `2026-10-0${(n % 9) + 1}T10:00:00Z`,
  ...extra,
});

const records = [
  rec("med", "validado"),
  rec("med", "aprobado_decanatura"),
  rec("med", "enviado"),
  rec("med", "borrador", "investigacion", { numerator: 4 }),
  rec("enf", "borrador"),
  rec("enf", "devuelto_programa"),
  rec("enf", "devuelto_decanatura", "investigacion"),
  rec("enf", "validado", "investigacion", { responsible: "VI" }),
];
const cutoffs = { program: "2026-10-15", faculty: "2026-10-25", vice: "2026-11-05" };

describe("Auditar Impacto", () => {
  it("un porcentaje siempre va con su cuenta", () => {
    expect(ratio(1, 3)).toEqual({ num: 1, den: 3, pct: 33.3 });
    expect(ratio(0, 0)).toEqual({ num: 0, den: 0, pct: null });
  });

  it("programa: avance = enviados o más allá ÷ asignados, y atraso tras el corte", () => {
    const [enf, med] = auditPrograms(records, units, cutoffs, "2026-10-20");
    expect(med.progress).toEqual({ num: 3, den: 4, pct: 75 });
    expect(med.pending).toBe(1);
    expect(enf.name).toBe("Enfermería");
    expect(enf.progress).toEqual({ num: 2, den: 4, pct: 50 });
    expect(enf.returned).toBe(1);
    expect(enf.overdue).toBe(true);
    expect(auditPrograms(records, units, cutoffs, "2026-10-01").every((r) => !r.overdue)).toBe(true);
  });

  it("decanatura: revisados ÷ recibidos, pendiente lo enviado y lo que le devolvieron", () => {
    const [fcs] = auditFaculties(records, units, cutoffs, "2026-10-26");
    // Recibidos: enviado, aprobado, validado ×2, devuelto a decanatura = 5; revisados: aprobado + 2 validados.
    expect(fcs.progress).toEqual({ num: 3, den: 5, pct: 60 });
    expect(fcs.pending).toBe(2);
    expect(fcs.overdue).toBe(true);
  });

  it("vicerrectoría: validados ÷ aprobados por decanatura, por función", () => {
    const rows = auditVices(records, units, cutoffs, "2026-10-01");
    const ve = rows.find((r) => r.id === "ve")!;
    const vi = rows.find((r) => r.id === "vi")!;
    expect(ve.progress).toEqual({ num: 1, den: 2, pct: 50 });
    expect(ve.pending).toBe(1);
    expect(vi.progress).toEqual({ num: 1, den: 1, pct: 100 });
    expect(vi.returned).toBe(1);
  });

  it("por oficina responsable de la matriz", () => {
    const rows = auditOffices(records);
    expect(rows.find((r) => r.name === "VI")!.progress).toEqual({ num: 1, den: 1, pct: 100 });
    expect(rows.find((r) => r.name === "Sin responsable en la matriz")!.progress.den).toBe(7);
  });

  it("titular: con dato, enviado, aprobado y validado sobre el total", () => {
    const h = headline(records);
    expect(h.pipeline).toMatchObject({ total: 8, sinDato: 1, enCaptura: 1, devueltoPrograma: 1, enviado: 1, devueltoDecanatura: 1, aprobado: 1, validado: 2 });
    expect(h.withData).toEqual({ num: 7, den: 8, pct: 87.5 });
    expect(h.sent.num).toBe(5);
    expect(h.validated).toEqual({ num: 2, den: 8, pct: 25 });
  });
});

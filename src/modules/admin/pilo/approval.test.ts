import { describe, expect, it } from "vitest";
import { approvalOn, approvalState, confirmApprovalText, countsText, parseOverview } from "./approval";

const row = (extra: Record<string, unknown> = {}) => ({
  id: "cifras", name: "UDES en Cifras", scope: "planeacion", kind: "portal", staff_only: false, stays_home: false, enabled: true,
  public_ok: true, deep_ok: false, passages: 120, public: 100, approved: 80, pending: 20, deep: 60, hidden: 2, session: 18, updated_at: "2026-10-20T10:00:00Z", ...extra,
});

describe("la aprobación pública por fuente", () => {
  it("lee la respuesta de la base con cuidado", () => {
    const [s] = parseOverview([row(), { id: "MAL ID" }, null, "x"]);
    expect(parseOverview([row(), { id: "MAL ID" }, null, "x"])).toHaveLength(1);
    expect(s).toMatchObject({ id: "cifras", publicOk: true, passages: 120, approved: 80, pending: 20, deep: 60, staffOnly: false });
    expect(parseOverview("nada")).toEqual([]);
  });

  it("el interruptor solo está encendido si está aprobada y no queda nada por aprobar", () => {
    expect(approvalOn(parseOverview([row()])[0])).toBe(false);
    expect(approvalOn(parseOverview([row({ pending: 0, approved: 100 })])[0])).toBe(true);
    expect(approvalOn(parseOverview([row({ public_ok: false, pending: 0 })])[0])).toBe(false);
  });

  it("dice el estado de cara al público", () => {
    const state = (extra: Record<string, unknown>) => approvalState(parseOverview([row(extra)])[0]);
    expect(state({})).toBe("pendiente");
    expect(state({ pending: 0 })).toBe("aprobada");
    expect(state({ public_ok: false })).toBe("sin-aprobar");
    expect(state({ enabled: false })).toBe("apagada");
    expect(state({ staff_only: true })).toBe("solo-personal");
  });

  it("cuenta los pasajes, los públicos aprobados y los pendientes", () => {
    const text = countsText(parseOverview([row()])[0]);
    expect(text).toContain("120 pasajes");
    expect(text).toContain("80 públicos aprobados");
    expect(text).toContain("20 pendientes de aprobar");
    expect(text).toContain("60 de la capa profunda");
    expect(countsText(parseOverview([row({ passages: 1, approved: 1, pending: 0, deep: 0, session: 0 })])[0])).toBe("1 pasaje · 1 público aprobado");
  });

  it("antes de confirmar nombra la consecuencia", () => {
    const s = parseOverview([row()])[0];
    expect(confirmApprovalText(s, true)).toMatch(/100 pasajes públicos/);
    expect(confirmApprovalText(s, false)).toMatch(/personal con sesión/);
    expect(confirmApprovalText(parseOverview([row({ staff_only: true })])[0], true)).toMatch(/pide sesión/);
  });
});

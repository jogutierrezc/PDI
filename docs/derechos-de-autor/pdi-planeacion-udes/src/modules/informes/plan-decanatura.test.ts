import { describe, expect, it } from "vitest";
import { actividadesDe, agruparPorDimension, avanceGeneral, claveAccion, resumenPorDimension, tonoEstado } from "./plan-decanatura";
import type { PlanAccion, PlanActividad } from "./plan-decanatura";

const accion = (over: Partial<PlanAccion>): PlanAccion => ({
  facultad: "FCS",
  id: "d1_1",
  dimension: "d1",
  dimension_nombre: "Gestión de calidad y autorregulación",
  accion: "Acción",
  pilar: null,
  responsable: "Persona",
  fecha_limite: "2026-12-01",
  recursos: null,
  meta: "Una meta",
  estado_inicial: null,
  presupuesto_ordinario: false,
  presupuesto_mejoramiento: false,
  n_actividades: 0,
  corte: "Semestre I 2026",
  avance: 0,
  estado: "Pendiente",
  notas: null,
  link_evidencia_accion: null,
  veredicto_accion: null,
  ...over,
});

describe("plan de trabajo: agrupar por dimensión", () => {
  it("ordena d1 antes que d10 y conserva el orden de las acciones", () => {
    const acciones = [
      accion({ id: "d10_1", dimension: "d10", dimension_nombre: "Diez" }),
      accion({ id: "d2_1", dimension: "d2", dimension_nombre: "Dos" }),
      accion({ id: "d2_2", dimension: "d2", dimension_nombre: "Dos" }),
    ];
    const grupos = agruparPorDimension(acciones);
    expect(grupos.map((g) => g.dimension)).toEqual(["d2", "d10"]);
    expect(grupos[0].acciones.map((a) => a.id)).toEqual(["d2_1", "d2_2"]);
  });

  it("no inventa dimensiones: una lista vacía da cero grupos", () => {
    expect(agruparPorDimension([])).toEqual([]);
    expect(resumenPorDimension([])).toEqual([]);
  });
});

describe("plan de trabajo: resumen por dimensión", () => {
  it("cuenta completadas, en proceso y pendientes, y promedia el avance informado", () => {
    const acciones = [
      accion({ id: "a", estado: "Completado", avance: 100 }),
      accion({ id: "b", estado: "En proceso", avance: 40 }),
      accion({ id: "c", estado: "Pendiente", avance: null }),
      accion({ id: "d", estado: null, avance: null }),
    ];
    const [r] = resumenPorDimension(acciones);
    expect(r.total).toBe(4);
    expect(r.completadas).toBe(1);
    expect(r.enProceso).toBe(1);
    expect(r.pendientes).toBe(2);
    expect(r.avance).toBe(70);
  });

  it("sin ningún avance informado, el promedio es nulo y no cero", () => {
    const [r] = resumenPorDimension([accion({ avance: null }), accion({ id: "x", avance: null })]);
    expect(r.avance).toBeNull();
  });

  it("marca como incompletas las acciones con responsable o meta «Por definir» o vacíos", () => {
    const [r] = resumenPorDimension([
      accion({ id: "a", responsable: "Por definir", meta: "Meta" }),
      accion({ id: "b", responsable: "Ana", meta: "" }),
      accion({ id: "c", responsable: "Ana", meta: "Meta" }),
    ]);
    expect(r.incompletas).toBe(2);
  });

  it("el avance general promedia todas las acciones con avance", () => {
    expect(avanceGeneral([accion({ avance: 10 }), accion({ id: "y", avance: 20 }), accion({ id: "z", avance: null })])).toBe(15);
    expect(avanceGeneral([accion({ avance: null })])).toBeNull();
  });
});

describe("plan de trabajo: actividades y estados", () => {
  it("devuelve solo las actividades de la acción pedida", () => {
    const acts: PlanActividad[] = [
      { facultad: "FCS", accion_id: "d1_1", id: "d1_1_act_1", descripcion: "A", responsable: null, fecha: null, corte: null, estado: null, link_evidencia: null, veredicto: null, comentario_auditor: null },
      { facultad: "FCS", accion_id: "d1_2", id: "d1_2_act_1", descripcion: "B", responsable: null, fecha: null, corte: null, estado: null, link_evidencia: null, veredicto: null, comentario_auditor: null },
    ];
    expect(actividadesDe(acts, "d1_1").map((a) => a.id)).toEqual(["d1_1_act_1"]);
  });

  it("la clave de análisis es estable por acción", () => {
    expect(claveAccion("d3_7")).toBe("plan_d3_7");
  });

  it("traduce el estado a un tono de pantalla", () => {
    expect(tonoEstado("Completado")).toBe("ok");
    expect(tonoEstado("En proceso")).toBe("proceso");
    expect(tonoEstado("Pendiente")).toBe("pendiente");
    expect(tonoEstado(null)).toBe("pendiente");
  });
});

import { describe, expect, it } from "vitest";
import { armarSintesis, cifrasDeSintesis, detalleDePlan } from "./sintesis";
import type { PlanAccion, PlanActividad } from "./plan-decanatura";

const accion = (id: string, o: Partial<PlanAccion> = {}): PlanAccion => ({
  facultad: "f", id, dimension: "d1", dimension_nombre: "Docencia", accion: `Acción ${id}`, pilar: null, responsable: "Ana", fecha_limite: null, recursos: null, meta: "Meta", estado_inicial: null,
  presupuesto_ordinario: false, presupuesto_mejoramiento: false, n_actividades: 0, corte: null, avance: null, estado: null, notas: null, link_evidencia_accion: null, veredicto_accion: null, ...o,
});
const actividad = (id: string, accionId: string, o: Partial<PlanActividad> = {}): PlanActividad => ({
  facultad: "f", accion_id: accionId, id, descripcion: `Actividad ${id}`, responsable: null, fecha: null, corte: null, estado: null, link_evidencia: null, veredicto: null, comentario_auditor: null, ...o,
});

describe("detalleDePlan", () => {
  const acciones = [accion("a1", { estado: "Completado", avance: 100 }), accion("a2", { estado: "En proceso", avance: 40, notas: "Va bien", link_evidencia_accion: "https://ejemplo.edu.co/e" }), accion("a3")];
  const actividades = [
    actividad("x1", "a1", { estado: "Completado", fecha: "2026-03-10", link_evidencia: "https://ejemplo.edu.co/x1" }),
    actividad("x2", "a2", { estado: "En proceso" }),
    actividad("x3", "a2", { estado: "Cumplida" }),
    actividad("x9", "otra", { estado: "Completado" }),
  ];
  const d = detalleDePlan(acciones, actividades);

  it("arma una fila por acción con sus actividades y su evidencia", () => {
    expect(d.acciones).toHaveLength(3);
    expect(d.acciones[0]).toMatchObject({ accion: "Acción a1", estado: "Completado", avance: 100, actividades: 1, cumplidas: 1, evidencia: "https://ejemplo.edu.co/x1" });
    expect(d.acciones[1]).toMatchObject({ estado: "En proceso", avance: 40, actividades: 2, cumplidas: 1, nota: "Va bien", evidencia: "https://ejemplo.edu.co/e" });
    expect(d.acciones[2]).toMatchObject({ estado: "Sin iniciar", avance: null, actividades: 0, evidencia: "" });
  });

  it("cuenta solo las actividades de acciones del plan y lista las completadas", () => {
    expect(d.actividades).toEqual({ total: 3, cumplidas: 2, enProceso: 1 });
    expect(d.cumplidas.map((x) => x.descripcion)).toEqual(["Actividad x1", "Actividad x3"]);
    expect(d.cumplidas[0]).toMatchObject({ accion: "Acción a1", fecha: "2026-03-10" });
  });

  it("no toma como evidencia lo que no es un enlace", () => {
    const r = detalleDePlan([accion("b", { link_evidencia_accion: "pendiente" })], [actividad("y", "b", { link_evidencia: "texto" })]);
    expect(r.acciones[0].evidencia).toBe("");
  });
});

describe("armarSintesis con actividades", () => {
  const s = armarSintesis({ acciones: [accion("a1", { estado: "Completado" }), accion("a2", { estado: "En proceso" })], actividades: [actividad("x", "a1", { estado: "Completado" })], metas: [], indicadores: [] });

  it("lleva el detalle del plan y sus cifras citables", () => {
    expect(s.plan?.detalle?.actividades.cumplidas).toBe(1);
    const claves = cifrasDeSintesis(s).map((c) => c.clave);
    expect(claves).toContain("sint_actividades");
    expect(claves).toContain("sint_actividades_cumplidas");
  });

  it("sin actividades no inventa cifras de actividades", () => {
    const sin = armarSintesis({ acciones: [accion("a1")], metas: [], indicadores: [] });
    expect(cifrasDeSintesis(sin).map((c) => c.clave)).not.toContain("sint_actividades");
  });
});

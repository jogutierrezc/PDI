import { describe, expect, it } from "vitest";
import { conectarPorPilar, estaCumplida, evidenciasHalladas, hayObjetivosYMetas, logrosSugeridos, resumenPorDimensionPlan, ultimaCifra } from "./resumen-gestion";
import type { ResumenAccion, ResumenGestion, ResumenIndicador } from "./types";

const ind = (over: Partial<ResumenIndicador> = {}): ResumenIndicador => ({
  codigo: "E01", nombre: "Docentes con maestría", fn: "ensenanza", etapa: "insumos", programa: "Medicina", sede: "Bucaramanga", sede_slug: "bucaramanga", origen: "adopcion", baja: false, medida: "porcentaje", unidad: "%",
  linea_base: { anio: 2023, texto: "60", num: 60 }, meta_2026: { texto: "72", num: 72 }, meta_2028: { texto: "", num: null },
  serie: [], alineaciones: [], ...over,
});
const acc = (over: Partial<ResumenAccion> = {}): ResumenAccion => ({
  id: "a1", dimension: "d1", dimension_nombre: "Académica", pilar: "p1", pilar_declarado: "I", titulo: "Actualizar currículo", responsable: "Decano", meta: "100 %", recursos: "", fecha_limite: null, estado_inicial: null,
  actividades: [], seguimientos: [], ...over,
});
const base = (over: Partial<ResumenGestion> = {}): ResumenGestion => ({
  version: 1, generado: "", unidad: { id: "u", nombre: "FCS", tipo: "facultad" }, ciclo: { anio: 2026, nombre: "", fecha_limite: null, corte: null, estado: "abierto" },
  instancia: { estado: "draft", enviado_en: null, aprobado_en: null }, indicadores: [], plan: { facultad: "FCS", acciones: [] },
  pilares: [{ id: "p1", numeral: "I", nombre: "Personalización" }, { id: "p2", numeral: "II", nombre: "Ambiente tecnológico" }], revisiones: [], anexos: [], ...over,
});

describe("resumen de gestión", () => {
  it("la última cifra es la más reciente con valor, sin contar «no aplica»", () => {
    const i = ind({ serie: [
      { anio: 2024, valor: 65, texto: "", no_aplica: false, evidencia: "", nota: "", actualizado: "" },
      { anio: 2025, valor: 70, texto: "", no_aplica: false, evidencia: "", nota: "", actualizado: "" },
      { anio: 2026, valor: null, texto: "", no_aplica: true, evidencia: "", nota: "", actualizado: "" },
    ] });
    expect(ultimaCifra(i)?.anio).toBe(2025);
    expect(ultimaCifra(ind())).toBeNull();
  });

  it("conecta cada pilar con sus indicadores confirmados, los sugeridos y sus acciones", () => {
    const r = base({
      indicadores: [
        ind({ codigo: "E01", alineaciones: [{ tipo: "pilar", pilar: "p1", ods: null, confirmada: true, origen: "manual" }] }),
        ind({ codigo: "E02", alineaciones: [{ tipo: "pilar", pilar: "p1", ods: null, confirmada: false, origen: "motor" }] }),
        ind({ codigo: "E03", alineaciones: [{ tipo: "ods", pilar: null, ods: 4, confirmada: true, origen: "motor" }] }),
      ],
      plan: { facultad: "FCS", acciones: [acc({ pilar: "p1" }), acc({ id: "a2", pilar: "p2" })] },
    });
    const c = conectarPorPilar(r);
    expect(c.map((p) => p.numeral)).toEqual(["I", "II"]);
    expect(c[0].indicadores.map((i) => i.codigo)).toEqual(["E01"]);
    expect(c[0].sugeridos.map((i) => i.codigo)).toEqual(["E02"]);
    expect(c[0].acciones).toHaveLength(1);
    expect(c[1].indicadores).toHaveLength(0);
    expect(c[1].acciones[0].id).toBe("a2");
  });

  it("un pilar sin nada conectado no aparece", () => {
    expect(conectarPorPilar(base())).toEqual([]);
  });

  it("resume el plan por dimensión con el último avance de cada acción", () => {
    const r = resumenPorDimensionPlan([
      acc({ id: "a1", seguimientos: [{ corte: "C1", avance: 20, estado: "En proceso", nota: "Inició", evidencia: "", reportado: "2026-03-01" }, { corte: "C2", avance: 60, estado: "En proceso", nota: "Avanza", evidencia: "", reportado: "2026-06-01" }],
        actividades: [{ descripcion: "Taller", responsable: null, fecha: null, estado: "Cumplida", evidencia: "" }, { descripcion: "Revisión", responsable: null, fecha: null, estado: "Pendiente", evidencia: "" }] }),
      acc({ id: "a2", seguimientos: [{ corte: "C2", avance: 100, estado: "Completado", nota: "Listo", evidencia: "", reportado: "2026-06-01" }] }),
      acc({ id: "a3", dimension: "d2", dimension_nombre: "Profesoral" }),
    ]);
    expect(r.map((d) => d.dimension)).toEqual(["d1", "d2"]);
    expect(r[0]).toMatchObject({ acciones: 2, actividades: 2, actividadesCumplidas: 1, avance: 80 });
    expect(r[0].avances.find((a) => a.nota === "Avanza")?.avance).toBe(60);
    expect(r[1].avance).toBeNull();
  });

  it("junta las evidencias sin repetir y marca las que ya son anexo", () => {
    const r = base({
      anexos: [{ n: 1, tipo: "url", nombre: "Acta", descripcion: "", url: "https://drive.example/acta" }],
      plan: { facultad: "FCS", acciones: [acc({
        actividades: [{ descripcion: "Taller", responsable: null, fecha: null, estado: "Cumplida", evidencia: "https://drive.example/acta" }, { descripcion: "Foro", responsable: null, fecha: null, estado: "Cumplida", evidencia: "https://drive.example/foro" }],
        seguimientos: [{ corte: "C1", avance: 10, estado: "", nota: "", evidencia: "https://drive.example/foro", reportado: null }],
      })] },
      indicadores: [ind({ serie: [{ anio: 2025, valor: 1, texto: "", no_aplica: false, evidencia: "no-es-enlace", nota: "", actualizado: "" }] })],
    });
    const e = evidenciasHalladas(r);
    expect(e.map((x) => x.url)).toEqual(["https://drive.example/acta", "https://drive.example/foro"]);
    expect(e[0].yaAnexo).toBe(true);
    expect(e[1].yaAnexo).toBe(false);
    expect(e[1].origen).toMatch(/Actividad: Foro/);
  });

  it("propone como logros las actividades cumplidas, con el seguimiento como resultado", () => {
    expect(estaCumplida("Cumplida")).toBe(true);
    expect(estaCumplida("Pendiente")).toBe(false);
    const r = base({ plan: { facultad: "FCS", acciones: [acc({
      seguimientos: [{ corte: "C2", avance: 90, estado: "", nota: "Se graduó la primera cohorte", evidencia: "", reportado: "2026-06-01" }],
      actividades: [{ descripcion: "Graduación", responsable: null, fecha: null, estado: "Cumplida", evidencia: "https://x.example/g" }, { descripcion: "Pendiente", responsable: null, fecha: null, estado: "En proceso", evidencia: "" }],
    })] } });
    const l = logrosSugeridos(r);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ titulo: "Graduación", evidencia: "https://x.example/g" });
    expect(l[0].resultado).toMatch(/Se graduó la primera cohorte/);
  });

  it("hay objetivos y metas si el plan o Impacto traen algo", () => {
    expect(hayObjetivosYMetas(null)).toBe(false);
    expect(hayObjetivosYMetas(base())).toBe(false);
    expect(hayObjetivosYMetas(base({ indicadores: [ind()] }))).toBe(true);
    expect(hayObjetivosYMetas(base({ plan: { facultad: "FCS", acciones: [acc()] } }))).toBe(true);
  });
});

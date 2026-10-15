/* El análisis de Pilo y las reglas del estudio de la UDES: el resumen que se le entrega (sin códigos), el prompt,
   la verificación de cifras, las columnas derivadas (grupo etario y origen) y los cursos con alta reprobación. */

import { describe, expect, it } from "vitest";
import { cifrasNoRespaldadas, leerAnalisis, mensajesAnalisis, numerosPermitidos, validarDatos, type DatosAnalisis } from "../../supabase/functions/warehouse-pilo/analisis";
import { derivarColumnas, grupoEtario, leerFecha, origenDe } from "../../supabase/functions/warehouse/motor";
import { bandaDe, desempenoDe, materiasCriticas, riesgoRelativoDe, type ResumenGrupoNotas } from "../../src/modules/warehouse/estudio";
import { resumenParaPilo } from "../../src/modules/warehouse/paraPilo";
import { evaluarNotas } from "../../src/modules/warehouse/reglas";
import type { ResumenNotas } from "../../src/modules/warehouse/store";

const datos: DatosAnalisis = {
  periodo: "2026b",
  sede: "buc",
  corte: 2,
  alcance: { nivel: "institucion" },
  totales: { estudiantes: 400, NE: 220, ED: 120, RS: 60 },
  programas: [{ nombre: "DERECHO", estudiantes: 100, NE: 40, ED: 30, RS: 30, promedio: 3.31 }],
  materias: [{ nombre: "CÁLCULO I", estudiantes: 80, pctBajo: 41.2, promedio: 2.9 }],
};

const buenaRespuesta = JSON.stringify({
  titular: "Derecho concentra la mayor parte de los estudiantes que requieren seguimiento",
  resumen: "De 400 estudiantes con notas, 60 están en RS. Derecho tiene 30 de esos 60.",
  hallazgos: [
    { titulo: "Cálculo I pierde a muchos", evidencia: "41,2 % de quienes tienen nota va bajo 3,0.", accion: "Reforzar tutorías antes del siguiente corte.", responsable: "Dirección de Programa" },
    { titulo: "Promedio bajo en Derecho", evidencia: "El promedio del programa es 3,31, casi en la banda baja del estudio (menor a 3,3).", accion: "Revisar el acompañamiento del PAIPE.", responsable: "PAIPE" },
    { titulo: "Primer semestre", evidencia: "El estudio asocia las tutorías con mejores promedios (3,8 veces).", accion: "Priorizar a quienes aún no asisten.", responsable: "Desarrollo Estudiantil" },
  ],
  prioridades: ["Tutorías en Cálculo I", "Seguimiento a los 60 en RS"],
  limites: ["Solo hay dos cortes con notas."],
});

describe("lo que se le entrega a Pilo", () => {
  it("el prompt trae el estudio y los datos, y prohíbe inventar cifras y nombrar personas", () => {
    const [sistema, usuario] = mensajesAnalisis(datos, "¿Dónde van las tutorías?");
    expect(sistema.content).toContain("16,7 veces");
    expect(sistema.content).toContain("PAIPE");
    expect(sistema.content).toMatch(/SOLO cifras/);
    expect(sistema.content).toMatch(/No nombres ni identifiques/);
    expect(usuario.content).toContain("¿Dónde van las tutorías?");
    expect(usuario.content).toContain('"RS":60');
  });

  it("valida el cuerpo: periodo, corte, totales y alcance; y no deja pasar uno enorme", () => {
    expect(validarDatos(datos).ok).toBe(true);
    expect(validarDatos(null).ok).toBe(false);
    expect(validarDatos({ ...datos, periodo: "2026-1" }).ok).toBe(false);
    expect(validarDatos({ ...datos, corte: 7 }).ok).toBe(false);
    expect(validarDatos({ ...datos, totales: { estudiantes: 0, NE: 0, ED: 0, RS: 0 } }).ok).toBe(false);
    expect(validarDatos({ ...datos, programas: Array.from({ length: 5000 }, (_, i) => ({ nombre: `P${i}`.repeat(10), estudiantes: 1, NE: 1, ED: 0, RS: 0, promedio: 3 })) }).ok).toBe(false); // 5.000 programas: no es un resumen
    const grande = validarDatos({ ...datos, contexto: { grupoEtario: Object.fromEntries(Array.from({ length: 6000 }, (_, i) => [`k${i}`, i])) } });
    expect(grande.ok).toBe(false);
  });

  it("recorta a 12 programas y 10 materias", () => {
    const v = validarDatos({ ...datos, programas: Array.from({ length: 30 }, (_, i) => ({ nombre: `P${i}`, estudiantes: 1, NE: 1, ED: 0, RS: 0, promedio: 3 })), materias: Array.from({ length: 30 }, (_, i) => ({ nombre: `M${i}`, estudiantes: 20, pctBajo: 31, promedio: 3 })) });
    expect(v.ok && v.valor.programas?.length).toBe(12);
    expect(v.ok && v.valor.materias?.length).toBe(10);
  });
});

describe("la verificación de las cifras", () => {
  it("acepta un análisis que se apoya en los datos y en el estudio", () => {
    const r = leerAnalisis(buenaRespuesta, datos);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.hallazgos).toHaveLength(3);
      expect(r.valor.avisos).toEqual([]);
    }
  });

  it("acepta la respuesta envuelta en un bloque de código", () => {
    expect(leerAnalisis("```json\n" + buenaRespuesta + "\n```", datos).ok).toBe(true);
  });

  it("una cifra suelta que no está se avisa, pero no se oculta", () => {
    const conDeMas = JSON.parse(buenaRespuesta);
    conDeMas.resumen += " Además, 777 estudiantes abandonaron.";
    const r = leerAnalisis(JSON.stringify(conDeMas), datos);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.avisos.join(" ")).toContain("777");
  });

  it("si Pilo se pone a inventar muchas cifras, se rechaza para pedirle que corrija", () => {
    const inventado = JSON.parse(buenaRespuesta);
    inventado.resumen = "Hay 811 casos, 922 reingresos, 733 becados y 644 retiros, además de 555 pendientes.";
    const r = leerAnalisis(JSON.stringify(inventado), datos);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no están en los DATOS/);
  });

  it("los porcentajes que salen de dos conteos de los datos sí valen", () => {
    const p = numerosPermitidos(datos);
    expect(p.has(55)).toBe(true); // 220 de 400
    expect(p.has(15)).toBe(true); // 60 de 400
    expect(cifrasNoRespaldadas("El 55 % está en NE y el 15 % en RS", p)).toEqual([]);
  });

  it("los años y los números de un dígito sueltos no cuentan", () => {
    expect(cifrasNoRespaldadas("En 2026 hay 3 programas y 7 grupos", numerosPermitidos(datos))).toEqual([]);
  });

  it("rechaza lo que no es JSON o no trae lo pedido", () => {
    expect(leerAnalisis("Hola, claro que sí.", datos).ok).toBe(false);
    expect(leerAnalisis("{ no es json }", datos).ok).toBe(false);
    expect(leerAnalisis(JSON.stringify({ titular: "x", resumen: "y", hallazgos: [] }), datos).ok).toBe(false);
  });
});

describe("el estudio de la UDES", () => {
  it("las bandas de promedio y su riesgo relativo de deserción", () => {
    expect(bandaDe(3.0)).toBe("bajo");
    expect(bandaDe(3.3)).toBe("medio");
    expect(bandaDe(4.3)).toBe("medio");
    expect(bandaDe(4.31)).toBe("alto");
    expect(riesgoRelativoDe(3.1)).toBe(16.7);
    expect(riesgoRelativoDe(3.9)).toBe(2.2);
    expect(riesgoRelativoDe(4.6)).toBe(1);
    expect(riesgoRelativoDe(null)).toBeNull();
  });

  it("NE, ED y RS", () => {
    expect(desempenoDe(4.0, 0)).toBe("NE");
    expect(desempenoDe(3.5, 0)).toBe("NE");
    expect(desempenoDe(3.49, 0)).toBe("ED");
    expect(desempenoDe(4.0, 1)).toBe("ED");
    expect(desempenoDe(2.9, 0)).toBe("RS");
    expect(desempenoDe(4.0, 2)).toBe("RS");
    expect(desempenoDe(4.0, 0, 0.5)).toBe("RS");
    expect(desempenoDe(null, 0)).toBeNull();
  });

  it("evaluarNotas trae la banda, el riesgo relativo y el desempeño", () => {
    const r: ResumenNotas = { estudiante: "x-1", programa: "DERECHO", materias: 6, con_p1: 6, con_p2: 0, con_p3: 0, prom_p1: 3.1, prom_p2: null, prom_p3: null, riesgo_p1: 2, riesgo_p2: 0, riesgo_p3: 0 };
    const [a] = evaluarNotas([r]);
    expect(a.banda).toBe("bajo");
    expect(a.riesgoRelativo).toBe(16.7);
    expect(a.desempeno).toBe("RS");
  });

  const g = (o: Partial<ResumenGrupoNotas>): ResumenGrupoNotas => ({ codigo_materia: "1", materia: "CÁLCULO I", grupo: "A", programa: "INGENIERÍA", estudiantes: 30, con_p1: 30, con_p2: 0, con_p3: 0, prom_p1: 3.0, prom_p2: null, prom_p3: null, bajo_p1: 12, bajo_p2: 0, bajo_p3: 0, ...o });

  it("cursos con alta reprobación: junta los grupos de la materia y mira el último corte con notas", () => {
    const m = materiasCriticas([g({ grupo: "A" }), g({ grupo: "B", bajo_p1: 6 })]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ codigo: "1", grupos: 2, estudiantes: 60, corte: 1, pctBajo: 30 });
    expect(materiasCriticas([g({ con_p2: 28, bajo_p2: 14, prom_p2: 2.8 })])[0]).toMatchObject({ corte: 2, pctBajo: 50 });
  });

  it("no cuenta las materias chicas ni las que están bajo el umbral", () => {
    expect(materiasCriticas([g({ estudiantes: 10, con_p1: 10, bajo_p1: 9 })])).toEqual([]);
    expect(materiasCriticas([g({ bajo_p1: 3 })])).toEqual([]);
  });

  it("el resumen para Pilo no lleva códigos de estudiante y cuenta por nivel", () => {
    const mk = (id: string, prom: number, riesgo: number, prog = "DERECHO"): ResumenNotas => ({ estudiante: id, programa: prog, materias: 6, con_p1: 6, con_p2: 0, con_p3: 0, prom_p1: prom, prom_p2: null, prom_p3: null, riesgo_p1: riesgo, riesgo_p2: 0, riesgo_p3: 0 });
    const alertas = evaluarNotas([mk("x-aaaa", 4.2, 0), mk("x-bbbb", 3.2, 1), mk("x-cccc", 2.6, 3), mk("x-dddd", 4.0, 0, "MEDICINA")]);
    const r = resumenParaPilo(alertas, [], { periodo: "2026b", sede: "buc" })!;
    expect(r.totales).toEqual({ estudiantes: 4, NE: 2, ED: 1, RS: 1 });
    expect(JSON.stringify(r)).not.toMatch(/x-aaaa|x-bbbb|x-cccc|x-dddd/);
    expect(r.programas![0]).toMatchObject({ nombre: "DERECHO", RS: 1 });
    expect(resumenParaPilo(alertas, [], { periodo: "2026b", sede: "buc", programa: "MEDICINA" })!.totales.estudiantes).toBe(1);
    expect(resumenParaPilo([], [], { periodo: "2026b", sede: "buc" })).toBeNull();
  });
});

describe("columnas derivadas: grupo etario y origen (sin guardar la fecha de nacimiento)", () => {
  it("lee fechas de Excel en los formatos de la plataforma", () => {
    expect(leerFecha("2003-04-09")?.getUTCFullYear()).toBe(2003);
    expect(leerFecha("09/04/2003")?.getUTCMonth()).toBe(3);
    expect(leerFecha(37720)?.getUTCFullYear()).toBe(2003); // serie de Excel
    expect(leerFecha("no es fecha")).toBeNull();
    expect(leerFecha(null)).toBeNull();
  });

  it("agrupa por edad al inicio del periodo", () => {
    expect(grupoEtario("2008-03-01", "2026b")).toBe("≤20");
    expect(grupoEtario("2005-08-02", "2026b")).toBe("≤20"); // aún no cumple 21 el 1 de agosto
    expect(grupoEtario("2004-07-31", "2026b")).toBe("21–25");
    expect(grupoEtario("1999-01-01", "2026b")).toBe("26+");
    expect(grupoEtario("1900-01-01", "2026b")).toBeNull(); // un dato mal digitado no es un grupo
    expect(grupoEtario("2020-01-01", "2026b")).toBeNull();
    expect(grupoEtario("2003-04-09", "2026-1")).toBeNull();
  });

  it("origen: Santander u otro departamento, sin tildes ni mayúsculas", () => {
    expect(origenDe("SANTANDER")).toBe("Santander");
    expect(origenDe(" Santander ")).toBe("Santander");
    expect(origenDe("NORTE DE SANTANDER")).toBe("Otro departamento");
    expect(origenDe("")).toBeNull();
  });

  it("solo «Estudiantes matriculados» recibe las dos columnas, y la política luego descarta lo personal", () => {
    const hoja = { columnas: ["codigo", "fecha_nac", "departamento"], originales: ["Código", "Fecha nac.", "Departamento"], filas: [{ codigo: "1", fecha_nac: "1999-01-01", departamento: "CESAR" }] };
    const d = derivarColumnas("dv_matric", hoja, "2026b");
    expect(d.columnas).toEqual(["codigo", "fecha_nac", "departamento", "grupo_etario", "origen"]);
    expect(d.filas[0]).toMatchObject({ grupo_etario: "26+", origen: "Otro departamento" });
    expect(derivarColumnas("dv_grad", hoja, "2026b")).toBe(hoja);
  });
});

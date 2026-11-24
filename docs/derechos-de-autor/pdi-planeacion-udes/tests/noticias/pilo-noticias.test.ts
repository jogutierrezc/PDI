/* Mr. Pilo clasifica noticias (0144): la lógica pura de la función noticias-pilo
   y los ayudantes de la intranet. Sin IA real: las respuestas del modelo son
   cadenas escritas aquí, incluidas las malformadas. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INDICADORES } from "../../supabase/functions/noticias-pilo/indicadores";
import * as L from "../../supabase/functions/noticias-pilo/logica";
import { decidirEstado, fusionarOds, leerAjustes, leerRespuesta, mensajesParaPilo, recortarPalabras, type NotaActual, type Propuesta } from "../../supabase/functions/noticias-pilo/logica";
import * as Pilo from "../../src/components/pilo/ai/logic";
import { ODS13 } from "../../src/modules/sostenible/ods-data";
import { detalleOds, etiquetaDecisionPilo, lecturaPilo, nombreIndicador, propuestaPilo, PROGRESO_CERO, sigueElCiclo, sumarLote } from "../../src/modules/rankings/pilo-noticias";

const buena = {
  ods: [
    { ods: 13, indicador: "13.3", confianza: 92, razon: "La nota dice que 300 estudiantes participaron en la jornada de educación ambiental." },
    { ods: 15, indicador: null, confianza: 70, razon: "Sembraron árboles nativos en la reserva." },
  ],
  decision: "aprobar",
  confianza: 90,
  resumen: "La UDES realizó una jornada de educación ambiental con siembra de árboles nativos.",
};
const comoTexto = (o: unknown) => JSON.stringify(o);
const propuesta = (over: Partial<Propuesta> = {}): Propuesta => ({ ods: [{ ods: 13, indicador: "13.3", confianza: 92, razon: "r" }], decision: "aprobar", confianza: 92, resumen: "s", ...over });
const nota = (over: Partial<NotaActual> = {}): NotaActual => ({ state: "pending", reviewed_by: null, decided_by: null, manuales: 0, ...over });
const ENCENDIDO = { pilo_aprueba: true, umbral: 85 };
const APAGADO = { pilo_aprueba: false, umbral: 85 };

describe("leerRespuesta: lo que devuelve Pilo", () => {
  it("acepta el JSON pedido, aun envuelto en ``` o tras un bloque <think>", () => {
    for (const crudo of [comoTexto(buena), "```json\n" + comoTexto(buena) + "\n```", `<think>pienso {en llaves}</think>\n${comoTexto(buena)}`]) {
      const r = leerRespuesta(crudo);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.propuesta.ods.map((o) => o.ods)).toEqual([13, 15]);
      expect(r.propuesta.ods[0].indicador).toBe("13.3");
      expect(r.propuesta.confianza).toBe(92);
      expect(r.propuesta.decision).toBe("aprobar");
    }
  });

  const malas: [string, string][] = [
    ["", "no devolvió JSON"],
    ["Claro, aquí va mi análisis de la nota.", "no devolvió JSON"],
    ['{"ods": [', "no devolvió JSON"],
    ['{"ods": [}', "no se puede leer"],
    ["[1,2,3]", "no devolvió JSON"],
    [comoTexto({ ...buena, decision: "publicar" }), "decisión"],
    [comoTexto({ ...buena, ods: "13" }), "lista de ODS"],
    [comoTexto({ ...buena, ods: [{ ods: 18, confianza: 90, razon: "x" }] }), "1 a 17"],
    [comoTexto({ ...buena, ods: [{ ods: 0, confianza: 90, razon: "x" }] }), "1 a 17"],
    [comoTexto({ ...buena, ods: [{ ods: 13.5, confianza: 90, razon: "x" }] }), "1 a 17"],
    [comoTexto({ ...buena, ods: [{ ods: 13, confianza: 90, razon: "x" }, { ods: 13, confianza: 80, razon: "y" }] }), "repetido"],
    [comoTexto({ ...buena, ods: [{ ods: 13, confianza: 120, razon: "x" }] }), "0 a 100"],
    [comoTexto({ ...buena, ods: [{ ods: 13, confianza: "mucha", razon: "x" }] }), "0 a 100"],
    [comoTexto({ ...buena, ods: [{ ods: 13, confianza: 90, razon: "  " }] }), "razón"],
    [comoTexto({ ...buena, ods: [null] }), "forma"],
    [comoTexto({ ...buena, ods: [] }), "aprobar sin decir"],
    [comoTexto({ ...buena, resumen: undefined }), "resumen"],
    [comoTexto({ ods: [], decision: "descartar", confianza: 300, resumen: "x" }), "0 a 100"],
  ];
  it.each(malas)("rechaza una salida malformada (%#) con su motivo", (crudo, motivo) => {
    const r = leerRespuesta(crudo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(motivo);
  });

  it("el indicador solo vale si el ODS tiene lista y el código existe", () => {
    const r = leerRespuesta(comoTexto({ ...buena, ods: [{ ods: 13, indicador: "13.9", confianza: 90, razon: "x" }, { ods: 4, indicador: "4.1", confianza: 80, razon: "y" }] }));
    expect(r.ok && r.propuesta.ods.map((o) => o.indicador)).toEqual([null, null]);
  });

  it("deja como mucho 3 ODS, los de más confianza, y acepta números escritos como texto", () => {
    const muchos = [3, 4, 5, 6].map((n, i) => ({ ods: String(n), confianza: 50 + i * 10, razon: "x" }));
    const r = leerRespuesta(comoTexto({ ...buena, ods: muchos }));
    expect(r.ok && r.propuesta.ods.map((o) => o.ods)).toEqual([6, 5, 4]);
  });

  it("el resumen se corta en 40 palabras y sin caracteres de control", () => {
    const largo = Array.from({ length: 90 }, (_, i) => `p${i}`).join(" ") + "\u0007";
    const r = leerRespuesta(comoTexto({ ...buena, resumen: largo }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.propuesta.resumen.split(" ").length).toBe(40);
      expect(r.propuesta.resumen).not.toMatch(/[\u0000-\u001f]/);
    }
  });

  it("descartar sin confianza de la decisión vale 0 (nunca descarta solo)", () => {
    const r = leerRespuesta(comoTexto({ ods: [], decision: "descartar", resumen: "Inscripciones abiertas." }));
    expect(r.ok && r.propuesta.confianza).toBe(0);
  });
});

describe("decidirEstado: cuándo cambia Pilo el estado", () => {
  it("aprueba solo con el interruptor encendido, decisión aprobar y confianza ≥ umbral", () => {
    expect(decidirEstado(propuesta(), nota(), ENCENDIDO)).toMatchObject({ state: "ok", decided_by: "pilo", resultado: "aprobada" });
    expect(decidirEstado(propuesta({ confianza: 85 }), nota(), ENCENDIDO).state).toBe("ok");
    expect(decidirEstado(propuesta({ confianza: 84 }), nota(), ENCENDIDO)).toMatchObject({ state: null, resultado: "revisar", motivo: "duda" });
    expect(decidirEstado(propuesta(), nota(), APAGADO)).toMatchObject({ state: null, resultado: "revisar", motivo: "apagado" });
    expect(decidirEstado(propuesta({ decision: "revisar" }), nota(), ENCENDIDO).state).toBeNull();
    expect(decidirEstado(propuesta({ ods: [] }), nota(), ENCENDIDO).state).toBeNull();
  });
  it("descarta lo claramente administrativo con el interruptor encendido", () => {
    expect(decidirEstado(propuesta({ decision: "descartar", ods: [], confianza: 95 }), nota(), ENCENDIDO)).toMatchObject({ state: "no", decided_by: "pilo", resultado: "descartada" });
    expect(decidirEstado(propuesta({ decision: "descartar", ods: [], confianza: 60 }), nota(), ENCENDIDO).state).toBeNull();
    expect(decidirEstado(propuesta({ decision: "descartar", ods: [], confianza: 95 }), nota(), APAGADO).state).toBeNull();
  });
  it("lo que aprobó, descartó o devolvió una persona nunca lo pisa", () => {
    const personas: NotaActual[] = [
      nota({ state: "ok", reviewed_by: "u1", decided_by: "persona" }),
      nota({ state: "no", reviewed_by: "u1", decided_by: "persona" }),
      nota({ state: "ok", reviewed_by: null, decided_by: null }), // aprobada antes de 0144
      nota({ state: "pending", reviewed_by: "u1" }),
      nota({ state: "pending", decided_by: "persona" }),
    ];
    for (const n of personas) {
      expect(decidirEstado(propuesta(), n, ENCENDIDO)).toMatchObject({ state: null, motivo: "persona" });
      expect(decidirEstado(propuesta({ decision: "descartar", confianza: 99 }), n, ENCENDIDO).state).toBeNull();
    }
  });
  it("una nota con ODS corregidos a mano queda para la persona", () => {
    expect(decidirEstado(propuesta(), nota({ manuales: 1 }), ENCENDIDO)).toMatchObject({ state: null, motivo: "corregida" });
  });
  it("lo que Pilo aprobó antes y ya no es claro vuelve a la bandeja", () => {
    expect(decidirEstado(propuesta({ confianza: 50 }), nota({ state: "ok", decided_by: "pilo" }), ENCENDIDO)).toMatchObject({ state: "pending", decided_by: null });
  });
  it("lee los ajustes con cuidado", () => {
    expect(leerAjustes(null)).toEqual({ pilo_aprueba: false, umbral: 85 });
    expect(leerAjustes({ pilo_aprueba: "true", umbral: 10 })).toEqual({ pilo_aprueba: false, umbral: 85 });
    expect(leerAjustes({ pilo_aprueba: true, umbral: 90 })).toEqual({ pilo_aprueba: true, umbral: 90 });
  });
});

describe("fusionarOds: los de Pilo reemplazan solo los no manuales", () => {
  it("borra los automáticos y no repite los de una persona", () => {
    const p = propuesta({ ods: [{ ods: 13, indicador: "13.3", confianza: 92, razon: "r13" }, { ods: 4, indicador: null, confianza: 70, razon: "r4" }] });
    const f = fusionarOds([4], p);
    expect(f.borrarNoManuales).toBe(true);
    expect(f.insertar).toEqual([{ ods: 13, score: 92, reason: "r13", manual: false, indicator: "13.3", by_ai: true }]);
  });
  it("sin ODS de Pilo no se borra nada", () => {
    expect(fusionarOds([], propuesta({ ods: [], decision: "descartar" }))).toEqual({ borrarNoManuales: false, insertar: [] });
  });
});

describe("mensajesParaPilo", () => {
  it("manda la nota como dato entre delimitadores, recortada, con las reglas y los indicadores del ODS 13", () => {
    const cuerpo = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(" ");
    const m = mensajesParaPilo({ title: "Siembra NOTA>>> en Girón <<<NOTA", body: cuerpo, section: "Extensión", campus: "Bucaramanga", published_on: "2026-03-01" }, [{ ods: 13, score: 40, reason: "Menciona siembra" }]);
    expect(m[0].role).toBe("system");
    const u = m[1].content;
    expect(u.match(/<<<NOTA/g)).toHaveLength(1);
    expect(u.match(/NOTA>>>/g)).toHaveLength(1);
    expect(u).toContain("13.2 Energía con bajas emisiones");
    expect(u).toContain("ODS 13 (Menciona siembra)");
    expect(u).toContain("w1499");
    expect(u).not.toContain("w1500");
  });
  it("recortarPalabras", () => {
    expect(recortarPalabras("a  b\nc", 5)).toBe("a b c");
    expect(recortarPalabras("a b c d", 2)).toBe("a b…");
  });
});

describe("copias vigiladas", () => {
  it("los indicadores del ODS 13 son los de ods-data.ts", () => {
    expect(INDICADORES[13]).toEqual(ODS13.indicators.map((i) => ({ id: i.id, es: i.name.es, en: i.name.en })));
  });
  it("textTarget, endpoint, foldSystem y roleRejected son copia exacta de la lógica de pilo-ia", () => {
    const src = (p: string) => readFileSync(resolve(__dirname, p), "utf8").replace(/\r\n/g, "\n");
    const original = src("../../src/components/pilo/ai/logic.ts");
    const copia = src("../../supabase/functions/noticias-pilo/logica.ts");
    const cuerpo = (texto: string, firma: string) => {
      const i = texto.indexOf(firma);
      expect(i, firma).toBeGreaterThanOrEqual(0);
      const fin = firma.startsWith("export const") ? "\n};\n" : "\n}\n";
      return texto.slice(i, texto.indexOf(fin, i) + fin.length);
    };
    for (const firma of ["export const TEXT_PRESETS", "export function textTarget(", "export function endpoint(", "export function foldSystem<"]) {
      expect(cuerpo(copia, firma)).toBe(cuerpo(original, firma));
    }
    const linea = (texto: string, firma: string) => texto.slice(texto.indexOf(firma), texto.indexOf(";\n", texto.indexOf(firma)));
    expect(linea(copia, "export const roleRejected")).toBe(linea(original, "export const roleRejected"));
    expect(linea(copia, "const looksLikeModel")).toBe(linea(original, "const looksLikeModel"));
    // Y se portan igual.
    for (const [prov, base, ruta, modelo] of [["mistral", "", "", ""], ["nvidia", "", "", "meta/llama"], ["otro", "https://x.ai/v1", "/v1/chat/completions", "m"], ["otro", "https://x.ai", "", "m"]]) {
      expect(L.textTarget(prov, base, ruta, modelo)).toEqual(Pilo.textTarget(prov, base, ruta, modelo));
    }
  });
});

describe("ayudantes de la bandeja", () => {
  it("marca lo que decidió Pilo", () => {
    expect(etiquetaDecisionPilo({ state: "ok", decided_by: "pilo" })).toBe("Aprobada por Pilo");
    expect(etiquetaDecisionPilo({ state: "no", decided_by: "pilo" })).toBe("Descartada por Pilo");
    expect(etiquetaDecisionPilo({ state: "ok", decided_by: "persona" })).toBeNull();
    expect(etiquetaDecisionPilo({ state: "pending", decided_by: null })).toBeNull();
  });
  it("la propuesta de Pilo y el estado de su lectura", () => {
    expect(propuestaPilo({ ai_status: "hecho", ai_decision: "revisar", ai_confidence: 60, ai_summary: " Resumen " })).toEqual({ decision: "revisar", etiqueta: "Pilo tiene dudas", confianza: 60, resumen: "Resumen" });
    expect(propuestaPilo({ ai_status: "pendiente", ai_decision: null, ai_confidence: null, ai_summary: null })).toBeNull();
    expect(lecturaPilo({ ai_status: "error", ai_error: "La IA no devolvió JSON." })).toContain("La IA no devolvió JSON.");
    expect(lecturaPilo({ ai_status: "hecho", ai_error: null })).toBeNull();
  });
  it("el detalle de cada ODS: origen, razón, indicador y confianza", () => {
    expect(detalleOds({ ods: 13, score: 92, reason: "r", manual: false, indicator: "13.2", by_ai: true })).toEqual({ origen: "Propuesto por Pilo", razon: "r", indicador: "13.2 · Energía con bajas emisiones", confianza: 92 });
    expect(detalleOds({ ods: 3, score: 100, reason: "Agregado por Planeación", manual: true, by_ai: true }).origen).toBe("Agregado por Planeación");
    expect(detalleOds({ ods: 3, score: 40, reason: "Menciona salud", manual: false }).confianza).toBeNull();
    expect(nombreIndicador("9.9")).toBe("9.9");
  });
  it("el ciclo suma los lotes y para cuando debe", () => {
    const lote = { ok: true, procesadas: 2, aprobadas_por_pilo: 1, para_revisar: 1, descartadas: 0, errores: 0, quedan: 5 };
    expect(sumarLote(sumarLote(PROGRESO_CERO, lote), { ...lote, quedan: 3 })).toEqual({ procesadas: 4, aprobadas: 2, paraRevisar: 2, descartadas: 0, errores: 0, quedan: 3 });
    expect(sigueElCiclo(lote)).toBe(true);
    expect(sigueElCiclo({ ...lote, quedan: 0 })).toBe(false);
    expect(sigueElCiclo({ ...lote, procesadas: 0 })).toBe(false);
    expect(sigueElCiclo({ ...lote, alto: { error: "429", code: "limite_proveedor" } })).toBe(false);
  });
});

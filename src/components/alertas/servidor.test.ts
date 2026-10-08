/* =============================================================================
   Alertas de emergencia · la lógica pura del servidor y de la capa.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { alertasDeLista, direccionAluna, firmaAlunaValida, igualesEnTiempoConstante, normalizarAviso, planificarSync, tipoDeAlerta } from "./servidor-logica";
import { DESPEJADO_MS, estadoCapa, filasDe, frasesParaLeer, haceCuanto, mensajeDespejado, pasosDe, presentar, tituloLimpio } from "./logic";
import type { FilaAlerta } from "./logic";

describe("tipoDeAlerta", () => {
  it("reconoce el sismo, el incendio y la seguridad por lo que dice el aviso", () => {
    expect(tipoDeAlerta("Sismo de magnitud 5.1", "")).toBe("sismo");
    expect(tipoDeAlerta("Evacuación", "Se reporta un temblor fuerte")).toBe("sismo");
    expect(tipoDeAlerta("Conato de INCENDIO en el bloque B", "")).toBe("incendio");
    expect(tipoDeAlerta("Alerta", "Se siente olor a humo")).toBe("incendio");
    expect(tipoDeAlerta("Amenaza de bomba", "")).toBe("seguridad");
    expect(tipoDeAlerta("Corte de agua", "Hoy no habrá servicio")).toBe("general");
    expect(tipoDeAlerta(undefined, null)).toBe("general");
  });
});

describe("normalizarAviso", () => {
  it("convierte un aviso de Aluna", () => {
    const a = normalizarAviso({ id: "abc", codigo: "EMG-1", tipo: "emergencia", titulo: " Sismo ", cuerpo: "Evacue", emitido_at: "2026-10-08T10:00:00Z" });
    expect(a).toMatchObject({ ext_id: "abc", code: "EMG-1", kind: "sismo", alert_type: "emergencia", title: "Sismo", body: "Evacue", emitted_at: "2026-10-08T10:00:00.000Z" });
  });
  it("descarta lo que no sirve y no se fía de los tipos", () => {
    expect(normalizarAviso(null)).toBeNull();
    expect(normalizarAviso({ id: "x" })).toBeNull();
    expect(normalizarAviso({ titulo: "Sin id" })).toBeNull();
    expect(normalizarAviso({ id: 7, titulo: "T", tipo: "raro", emitido_at: "nada" })).toMatchObject({ ext_id: "7", alert_type: "emergencia", emitted_at: null });
  });
});

describe("alertasDeLista", () => {
  const lista = [
    { id: "1", tipo: "emergencia", titulo: "Incendio", cuerpo: "" },
    { id: "2", tipo: "informativo", titulo: "Taller", cuerpo: "" },
    { id: "3", tipo: "informativo", titulo: "Todo despejado", cuerpo: "", reemplaza_a: "1" },
  ];
  it("deja solo los tipos permitidos", () => {
    expect(alertasDeLista(lista, ["emergencia"]).map((a) => a.ext_id)).toEqual(["1"]);
  });
  it("nunca abre el «todo despejado», aunque su tipo esté permitido", () => {
    expect(alertasDeLista(lista, ["emergencia", "informativo"]).map((a) => a.ext_id)).toEqual(["1", "2"]);
  });
  it("una respuesta rara es una lista vacía", () => {
    expect(alertasDeLista({}, ["emergencia"])).toEqual([]);
    expect(alertasDeLista(null, ["emergencia"])).toEqual([]);
  });
});

describe("planificarSync", () => {
  const a = (id: string) => normalizarAviso({ id, titulo: "T" })!;
  it("abre lo que Aluna tiene activo y cierra lo que Pilo tiene y Aluna ya no", () => {
    const plan = planificarSync([a("1"), a("2")], ["2", "3"]);
    expect(plan.abrir.map((x) => x.ext_id)).toEqual(["1", "2"]);
    expect(plan.cerrar).toEqual(["3"]);
  });
  it("si Aluna no tiene nada activo, cierra todo lo abierto", () => {
    expect(planificarSync([], ["1"]).cerrar).toEqual(["1"]);
  });
});

describe("direccionAluna", () => {
  it("arma la ruta sobre una dirección https con dominio", () => {
    expect(direccionAluna("https://llgiyaudryvxeadzuysq.supabase.co/functions/v1/api-alertas/", "/alertas")).toBe("https://llgiyaudryvxeadzuysq.supabase.co/functions/v1/api-alertas/alertas");
  });
  it("rechaza http, IP, red interna, credenciales y consultas", () => {
    for (const mala of ["http://aluna.udes.edu.co/x", "https://127.0.0.1/x", "https://localhost/x", "https://10.0.0.5/x", "https://servidor.local/x", "https://u:p@aluna.udes.edu.co/x", "https://aluna.udes.edu.co/x?a=1", "no es una url", null, 5]) {
      expect(direccionAluna(mala, "/alertas")).toBeNull();
    }
  });
});

describe("la firma de Aluna", () => {
  const cuerpo = '{"evento":"aviso.emitido","aviso":{"id":"1"}}';
  const firma = createHash("sha256").update("whk_secreto" + cuerpo).digest("hex");
  it("acepta sha256(secreto + cuerpo)", async () => {
    expect(await firmaAlunaValida("whk_secreto", cuerpo, firma)).toBe(true);
    expect(await firmaAlunaValida("whk_secreto", cuerpo, firma.toUpperCase())).toBe(true);
  });
  it("rechaza otra firma, otro cuerpo, otro secreto, sin secreto o sin firma", async () => {
    expect(await firmaAlunaValida("whk_secreto", cuerpo + " ", firma)).toBe(false);
    expect(await firmaAlunaValida("otro", cuerpo, firma)).toBe(false);
    expect(await firmaAlunaValida("", cuerpo, firma)).toBe(false);
    expect(await firmaAlunaValida("whk_secreto", cuerpo, null)).toBe(false);
    expect(await firmaAlunaValida("whk_secreto", cuerpo, "abc")).toBe(false);
  });
  it("compara en tiempo constante", () => {
    expect(igualesEnTiempoConstante("abc", "abc")).toBe(true);
    expect(igualesEnTiempoConstante("abc", "abd")).toBe(false);
    expect(igualesEnTiempoConstante("abc", "ab")).toBe(false);
  });
});

/* --- La capa ------------------------------------------------------------------------------- */

const ahora = Date.parse("2026-10-08T12:00:00Z");
const fila = (p: Partial<FilaAlerta>): FilaAlerta => ({
  id: "a", source: "aluna", code: "", kind: "sismo", title: "Sismo", body: "", state: "activa", emitted_at: "2026-10-08T11:59:00Z", closed_at: null, close_note: null, ...p,
});
const vacio = new Set<string>();

describe("estadoCapa", () => {
  it("duerme si no hay nada", () => {
    expect(estadoCapa([], vacio, vacio, ahora)).toEqual({ modo: "dormida", alerta: null, activas: 0 });
  });
  it("una emergencia activa sin leer es la capa completa", () => {
    expect(estadoCapa([fila({})], vacio, vacio, ahora)).toMatchObject({ modo: "completa", activas: 1 });
  });
  it("leída, pasa a franja pero no se esconde mientras siga activa", () => {
    expect(estadoCapa([fila({})], new Set(["a"]), vacio, ahora).modo).toBe("franja");
  });
  it("una emergencia nueva vuelve a la capa completa aunque haya otra ya leída", () => {
    const r = estadoCapa([fila({}), fila({ id: "b", emitted_at: "2026-10-08T11:59:30Z" })], new Set(["a"]), vacio, ahora);
    expect(r).toMatchObject({ modo: "completa", activas: 2 });
    expect(r.alerta?.id).toBe("b");
  });
  it("al cerrarse ofrece el «todo despejado» y luego se retira", () => {
    const cerrada = fila({ state: "cerrada", closed_at: "2026-10-08T11:58:00Z" });
    expect(estadoCapa([cerrada], vacio, vacio, ahora).modo).toBe("despejado");
    expect(estadoCapa([cerrada], vacio, new Set(["a"]), ahora).modo).toBe("dormida");
    expect(estadoCapa([cerrada], vacio, vacio, ahora + DESPEJADO_MS + 120000).modo).toBe("dormida");
  });
  it("con otra emergencia activa no se ofrece el despejado de la anterior", () => {
    const filas = [fila({ id: "x", state: "cerrada", closed_at: "2026-10-08T11:58:00Z" }), fila({ id: "y" })];
    expect(estadoCapa(filas, vacio, vacio, ahora).modo).toBe("completa");
  });
});

describe("filasDe", () => {
  it("descarta filas rotas y normaliza el resto", () => {
    const filas = filasDe([{ id: "1", title: "T", emitted_at: "2026-10-08T10:00:00Z", kind: "raro", source: "simulacro" }, { title: "sin id" }, null]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ kind: "general", source: "simulacro", state: "activa" });
    expect(filasDe(undefined)).toEqual([]);
  });
});

describe("presentar (el diseño de Aluna)", () => {
  const base = { title: "Alerta de incendio", body: "", source: "aluna" as const };
  it("usa los colores y el título de la clase", () => {
    const p = presentar({ ...base, kind: "incendio" });
    expect(p).toMatchObject({ c1: "#7a1408", c2: "#ff9a52", ambiente: "incendio", simulacro: false, lineas: ["Alerta de", "incendio"], subtitulo: null });
    expect(presentar({ ...base, kind: "sismo" })).toMatchObject({ c1: "#2e1065", ambiente: "sismo", entendido: "Entendido, estoy protegido" });
  });
  it("el título que escribió quien emitió va debajo si dice algo más", () => {
    expect(presentar({ ...base, kind: "sismo", title: "Sismo de magnitud 5.1 en Bucaramanga" }).subtitulo).toBe("Sismo de magnitud 5.1 en Bucaramanga");
  });
  it("una emergencia sin clase conserva su título", () => {
    expect(presentar({ ...base, kind: "general", title: "Simulacro: Corte de gas" })).toMatchObject({ lineas: ["Corte de gas"], ambiente: "otra", c1: "#6b0f14" });
  });
  it("un simulacro se ve distinto y usa los pasos de la clase, no su propio texto", () => {
    const p = presentar({ kind: "sismo", title: "Simulacro de sismo", body: "Este es un simulacro. No hay una emergencia real.", source: "simulacro" });
    expect(p).toMatchObject({ simulacro: true, ambiente: "simulacro", c1: "#4f3600", lineas: ["Simulacro de", "sismo"] });
    expect(p.pasos.join(" ")).not.toMatch(/simulacro/i);
    expect(p.pasos.length).toBeGreaterThanOrEqual(2);
  });
  it("las instrucciones de Aluna se vuelven pasos y el alcance va aparte", () => {
    const p = presentar({ ...base, kind: "incendio", body: "Evacúa por la escalera. No uses el ascensor. Ve al punto de encuentro.\n\nBloques: A, B" });
    expect(p.pasos).toEqual(["Evacúa por la escalera.", "No uses el ascensor.", "Ve al punto de encuentro."]);
    expect(p.alcance).toBe("Bloques: A, B");
  });
  it("sin instrucciones, valen las de la clase", () => {
    expect(presentar({ ...base, kind: "incendio", body: "" }).pasos.length).toBeGreaterThanOrEqual(2);
  });
});

describe("pasosDe y tituloLimpio", () => {
  it("junta los pasos de más de cinco", () => {
    const r = pasosDe("Uno. Dos. Tres. Cuatro. Cinco. Seis. Siete.");
    expect(r.pasos).toHaveLength(5);
    expect(r.pasos[4]).toBe("Cinco. Seis. Siete.");
  });
  it("quita el «Simulacro: » del título", () => {
    expect(tituloLimpio("Simulacro: Evacuación")).toBe("Evacuación");
    expect(tituloLimpio("Incendio")).toBe("Incendio");
  });
});

describe("la voz de Pilo", () => {
  it("la alerta se lee en frases cortas, cada una apta para la voz directa", () => {
    const frases = frasesParaLeer({ kind: "incendio", title: "Alerta de incendio", body: "Evacúa por la escalera. No uses el ascensor.", source: "aluna" });
    expect(frases[0]).toBe("Atención. Alerta de incendio.");
    expect(frases).toContain("No uses el ascensor.");
    expect(frases.every((f) => f.length <= 500)).toBe(true);
  });
  it("el simulacro se dice como simulacro", () => {
    expect(frasesParaLeer({ kind: "sismo", title: "x", body: "", source: "simulacro" })[0]).toMatch(/^Esto es un simulacro de sismo./);
  });
  it("el «todo está bien» distingue el simulacro", () => {
    expect(mensajeDespejado({ source: "simulacro" })).toMatch(/simulacro/);
    expect(mensajeDespejado({ source: "aluna" })).toMatch(/alerta terminó/);
  });
});

describe("textos", () => {
  it("hace cuánto, en palabras", () => {
    expect(haceCuanto("2026-10-08T11:59:50Z", ahora)).toBe("ahora mismo");
    expect(haceCuanto("2026-10-08T11:45:00Z", ahora)).toBe("hace 15 min");
    expect(haceCuanto("2026-10-08T09:00:00Z", ahora)).toBe("hace 3 h");
  });
});

/* La función del servidor es un solo archivo y lleva dentro una copia de servidor-logica.ts. */
describe("la función pilo-alertas es un solo archivo", () => {
  const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const logic = read(resolve(__dirname, "servidor-logica.ts"));
  const index = read(resolve(__dirname, "../../../supabase/functions/pilo-alertas/index.ts"));

  it("su lógica es la misma de servidor-logica.ts", () => {
    const marker = "========================================================================== */";
    const body = logic.slice(logic.indexOf(marker) + marker.length).replace(/^\n+|\n+$/g, "");
    const open = index.indexOf("// >>> lógica");
    const close = index.indexOf("// <<< fin de la lógica");
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    expect(body.length).toBeGreaterThan(1000);
    expect(index.slice(index.indexOf("\n", open) + 1, close).replace(/^\n+|\n+$/g, "")).toBe(body);
  });
  it("solo importa el cliente de Supabase y no escribe en los registros", () => {
    expect([...index.matchAll(/^import\b.*$/gm)].map((m) => m[0])).toEqual(['import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";']);
    expect(index).not.toMatch(/console\s*\./);
  });
});

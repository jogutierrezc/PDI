import { describe, expect, it } from "vitest";
import { crearManejador } from "../../supabase/functions/pilo-compilador/handler";
import type { DepsManejador } from "../../supabase/functions/pilo-compilador/handler";
import { generar, ErrorCompilador, MAX_PARTES } from "../../supabase/functions/pilo-compilador/nucleo";
import { leerPedido } from "../../supabase/functions/pilo-compilador/pedido";
import { ESFUERZO, mensajesSistema, mensajesUsuario } from "../../supabase/functions/pilo-compilador/prompt";
import { verificarTexto } from "../../supabase/functions/pilo-compilador/verificar";

const ID = "11111111-1111-4111-8111-111111111111";
const datos = {
  unidad: "Facultad de Ciencias de la Salud",
  anio: 2026,
  plantilla: "A",
  seccion: { clave: "s1", titulo: "Resumen ejecutivo", tipo: "narr", extension: "1 a 3 párrafos" },
  equipos: [{ nombre: "Programas", plantilla: "A", hojas: ["04 Resultados"] }],
  indicadores: [
    { clave: "ind_c_g1", nombre: "Estudiantes matriculados 2026-1", criterio: "Enseñanza", unidad: "est.", valor: 3912, meta: null, anterior: 3800, fuentePrimaria: "UDES en Cifras", reporto: [{ equipo: "Programas", escribio: "Matriculados", valor: 3912 }], conflicto: false },
    { clave: "ind_c_g2", nombre: "Movilidad saliente", criterio: "Internacionalización", unidad: "est.", valor: null, meta: 40, anterior: null, fuentePrimaria: "ORI", reporto: [{ equipo: "A", escribio: "x", valor: 42 }, { equipo: "B", escribio: "y", valor: 47 }], conflicto: true },
  ],
  hojas: [],
  textosPrevios: {},
};
const pedido = (extra: object = {}) => ({ instancia_id: ID, nivel: "compleja", datos, ...extra });

describe("pedido", () => {
  it("lo válido pasa y se normaliza", () => {
    const r = leerPedido(pedido({ instruccion: "  más   énfasis en  permanencia " }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pedido.instruccion).toBe("más énfasis en permanencia");
      expect(r.pedido.datos.indicadores).toHaveLength(2);
    }
  });
  it("rechaza lo inválido", () => {
    expect(leerPedido({ ...pedido(), instancia_id: "x" }).ok).toBe(false);
    expect(leerPedido({ ...pedido(), nivel: "mega" }).ok).toBe(false);
    expect(leerPedido({ instancia_id: ID, nivel: "rapida" }).ok).toBe(false);
    const grande = leerPedido({ ...pedido(), datos: { ...datos, hojas: [{ equipo: "x", hoja: "h", destino: "d", encabezados: [], filas: Array.from({ length: 60 }, () => ["x".repeat(1500)]) }] } });
    expect(grande.ok).toBe(true); // se recorta, no revienta
  });
  it("descarta indicadores con clave inválida", () => {
    const r = leerPedido(pedido({ datos: { ...datos, indicadores: [{ clave: "con espacio", nombre: "x" }, datos.indicadores[0]] } }));
    expect(r.ok && r.pedido.datos.indicadores).toHaveLength(1);
  });
});

describe("prompt", () => {
  it("dice sin tope de longitud y prohíbe cifras con dígitos", () => {
    const s = mensajesSistema(datos as never, "compleja");
    expect(s).toMatch(/NO hay tope de longitud/);
    expect(s).toMatch(/Ninguna cifra se escribe con dígitos/);
    expect(s).toMatch(/Resumen ejecutivo/);
  });
  it("los niveles piden más o menos razonamiento", () => {
    expect(ESFUERZO).toEqual({ rapida: "low", compleja: "medium", investigacion: "high" });
  });
  it("el usuario lleva el nombre unificado y lo que reportó cada equipo", () => {
    const u = mensajesUsuario(datos as never);
    expect(u).toContain("Movilidad saliente");
    expect(u).toContain("«x» = 42");
  });
});

describe("verificar", () => {
  const ind = datos.indicadores as never;
  it("acepta tokens de indicadores con valor", () => {
    const v = verificarTexto("Hubo [[ind_c_g1]] estudiantes en 2026.", ind);
    expect(v.errores).toEqual([]);
    expect(v.aMano).toEqual([]);
    expect(v.usados).toEqual(["ind_c_g1"]);
  });
  it("rechaza un token inexistente y uno pendiente (conflicto)", () => {
    expect(verificarTexto("[[ind_c_zz]]", ind).errores[0]).toMatch(/no existe/);
    expect(verificarTexto("[[ind_c_g2]]", ind).errores[0]).toMatch(/pendiente/);
  });
  it("avisa de cifras escritas con dígitos, pero no de años ni de números de lista", () => {
    expect(verificarTexto("Fueron 3.912 en 2026.", ind).aMano).toEqual(["3.912"]);
    expect(verificarTexto("1. Primero\n2) Segundo en 2025", ind).aMano).toEqual([]);
  });
});

describe("generar", () => {
  const p = (() => {
    const r = leerPedido(pedido());
    if (!r.ok) throw new Error("pedido");
    return r.pedido;
  })();
  const eventos: [string, unknown][] = [];
  const emitir = (e: string, d: unknown) => eventos.push([e, d]);

  it("une las partes cuando Astra se corta por longitud (sin tope fijo)", async () => {
    let n = 0;
    const r = await generar({ emitir, llamar: async (m) => { n++; return n < 3 ? { texto: `Parte ${n} con [[ind_c_g1]].`, pensamiento: "", finish: "length" } : { texto: "Cierre.", pensamiento: "", finish: "stop" }; } }, p);
    expect(n).toBe(3);
    expect(r.partes).toBe(3);
    expect(r.texto).toBe("Parte 1 con [[ind_c_g1]]. Parte 2 con [[ind_c_g1]]. Cierre.");
    expect(r.palabras).toBeGreaterThan(5);
    expect(eventos.filter(([e]) => e === "part")).toHaveLength(3);
  });
  it("el mensaje de continuar lleva lo escrito", async () => {
    const vistos: number[] = [];
    let n = 0;
    await generar({ emitir, llamar: async (m) => { vistos.push(m.length); n++; return { texto: "x", pensamiento: "", finish: n === 1 ? "length" : "stop" }; } }, p);
    expect(vistos[1]).toBe(vistos[0] + 2);
  });
  it("no sigue para siempre", async () => {
    let n = 0;
    await generar({ emitir, llamar: async () => { n++; return { texto: "x", pensamiento: "", finish: "length" }; } }, p);
    expect(n).toBe(MAX_PARTES);
  });
  it("un token malo se corrige en un reintento", async () => {
    const respuestas = ["Dato [[ind_c_g2]].", "Dato [[ind_c_g1]]."];
    let i = 0;
    const r = await generar({ emitir, llamar: async () => ({ texto: respuestas[i++], pensamiento: "", finish: "stop" }) }, p);
    expect(r.reintento).toBe(true);
    expect(r.usados).toEqual(["ind_c_g1"]);
  });
  it("si el reintento también falla, error con detalle", async () => {
    await expect(generar({ emitir, llamar: async () => ({ texto: "Dato [[ind_c_g2]].", pensamiento: "", finish: "stop" }) }, p)).rejects.toBeInstanceOf(ErrorCompilador);
  });
});

describe("manejador", () => {
  const deps = (o: Partial<DepsManejador> = {}): DepsManejador => ({
    configurado: true,
    anonKey: "anon",
    sal: "sal",
    usuarioDe: async (t) => (t === "buen" ? "u1" : null),
    visible: async () => true,
    config: async () => ({ habilitado: true, destino: { url: "https://astra.example/v1/chat", model: "astra", key: "k" }, maxTokens: 0, esperaMs: 5000, limiteHora: 0 }),
    golpe: async () => 1,
    fetchFn: (async (_u: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.max_tokens).toBeUndefined(); // sin tope
      expect(body.reasoning_effort).toBe("medium");
      return new Response(JSON.stringify({ choices: [{ message: { content: "Hubo [[ind_c_g1]] estudiantes." }, finish_reason: "stop" }] }), { status: 200 });
    }) as typeof fetch,
    ...o,
  });
  const pedirHttp = (h: ReturnType<typeof crearManejador>, token: string | null, cuerpo: unknown) =>
    h(new Request("https://x/f", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(cuerpo) }));

  it("401 sin sesión y con la clave anónima", async () => {
    const h = crearManejador(deps());
    expect((await pedirHttp(h, null, pedido())).status).toBe(401);
    expect((await pedirHttp(h, "anon", pedido())).status).toBe(401);
    expect((await pedirHttp(h, "malo", pedido())).status).toBe(401);
  });
  it("403 si la base no le deja ver el informe", async () => {
    expect((await pedirHttp(crearManejador(deps({ visible: async () => false })), "buen", pedido())).status).toBe(403);
  });
  it("503 si Astra está apagado y 429 si pasó el límite", async () => {
    const apagado = deps({ config: async () => ({ habilitado: false, destino: null, maxTokens: 0, esperaMs: 1, limiteHora: 0 }) });
    const r = await pedirHttp(crearManejador(apagado), "buen", pedido());
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("astra_apagado");
    const lleno = deps({ golpe: async () => 99, config: async () => ({ habilitado: true, destino: { url: "https://a/b", model: "m", key: "k" }, maxTokens: 0, esperaMs: 1, limiteHora: 5 }) });
    expect((await pedirHttp(crearManejador(lleno), "buen", pedido())).status).toBe(429);
  });
  it("400 con un pedido inválido", async () => {
    expect((await pedirHttp(crearManejador(deps()), "buen", { instancia_id: "x" })).status).toBe(400);
  });
  it("responde un flujo con step, part y done", async () => {
    const r = await pedirHttp(crearManejador(deps()), "buen", pedido());
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toMatch(/event-stream/);
    const t = await r.text();
    expect(t).toMatch(/event: step/);
    expect(t).toMatch(/event: part/);
    expect(t).toMatch(/event: done/);
    expect(t).toMatch(/"seccion":"s1"/);
    expect(t).toMatch(/Pilo Astra 1\.0/);
  });
});

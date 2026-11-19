import { describe, expect, it, vi } from "vitest";
import { crearManejador, armarPedido, esCorreoDocente } from "../../supabase/functions/pilo-roomy/handler";
import { revisarLimite } from "../../supabase/functions/pilo-roomy/limite";

const SECRETO = "s".repeat(40);
const UUID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";

function montar(o: { correo?: string; usuario?: boolean; respuesta?: () => Response; golpe?: number | null; configurado?: boolean; secreto?: string } = {}) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const llamar = vi.fn(async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return o.respuesta ? o.respuesta() : new Response(JSON.stringify({ ok: true, estado: "activo" }), { status: 200 });
  });
  const manejador = crearManejador({
    configurado: o.configurado ?? true, anonKey: "ANON", sal: "sal", urlPuente: "https://aluna.test/pilo-puente", secreto: o.secreto ?? SECRETO,
    usuarioDe: async () => (o.usuario === false ? null : { id: "u1", correo: o.correo ?? "ana@mail.udes.edu.co" }),
    golpe: async () => (o.golpe === undefined ? 1 : o.golpe), limiteHora: 120, llamar, esperaMs: 200,
  });
  const pedir = (cuerpo: unknown, cab: Record<string, string> = { Authorization: "Bearer TOKEN" }, metodo = "POST") =>
    manejador(new Request("https://x.test/pilo-roomy", { method: metodo, headers: cab, body: metodo === "POST" ? (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)) : undefined }));
  return { pedir, llamadas, llamar };
}

describe("pilo-roomy · entrada", () => {
  it("responde OPTIONS y rechaza lo que no es POST", async () => {
    const { pedir } = montar();
    expect((await pedir({}, {}, "OPTIONS")).status).toBe(204);
    expect((await pedir({}, { Authorization: "Bearer T" }, "GET")).status).toBe(405);
  });

  it("sin configurar o con un secreto corto, 503 y no llama a nadie", async () => {
    for (const o of [{ configurado: false }, { secreto: "corto" }]) {
      const { pedir, llamar } = montar(o);
      const r = await pedir({ accion: "estado" });
      expect(r.status).toBe(503);
      expect((await r.json()).codigo).toBe("NO_CONFIGURADO");
      expect(llamar).not.toHaveBeenCalled();
    }
  });

  it("exige sesión: sin cabecera, con la clave anónima o con un token inválido", async () => {
    for (const [cab, usuario] of [[{}, true], [{ Authorization: "Bearer ANON" }, true], [{ Authorization: "Bearer T" }, false]] as const) {
      const { pedir, llamar } = montar({ usuario });
      const r = await pedir({ accion: "estado" }, cab as Record<string, string>);
      expect(r.status).toBe(401);
      expect((await r.json()).codigo).toBe("SIN_SESION");
      expect(llamar).not.toHaveBeenCalled();
    }
  });

  it("solo @mail.udes.edu.co (profesores); los administrativos y otros dominios no, y el correo sale de la sesión, no del pedido", async () => {
    for (const malo of ["ana@gmail.com", "@mail.udes.edu.co", "ana@udes.edu.co", "ana@cucuta.udes.edu.co", "ana@valledupar.udes.edu.co", "ana@evil.mail.udes.edu.co", "ana@mail.udes.edu.co.evil.com", "ana@xmail.udes.edu.co"]) {
      const otro = montar({ correo: malo });
      expect((await otro.pedir({ accion: "estado" })).status, malo).toBe(403);
      expect(otro.llamar).not.toHaveBeenCalled();
    }
    expect(esCorreoDocente("ana.perez@mail.udes.edu.co")).toBe(true);
    const { pedir, llamadas } = montar({ correo: "Ana.Perez@MAIL.udes.edu.co" });
    await pedir({ accion: "estado", correo: "otra@mail.udes.edu.co" });
    const enviado = JSON.parse(String(llamadas[0].init.body));
    expect(enviado.correo).toBe("ana.perez@mail.udes.edu.co");                                  // normalizado y de la sesión
  });

  it("rechaza cuerpos inválidos y acciones desconocidas", async () => {
    const { pedir, llamar } = montar();
    for (const c of ["no json", "[]", "null", { accion: "borrar_todo" }, { accion: 5 }, {}]) expect((await pedir(c)).status).toBe(400);
    expect((await pedir("x".repeat(5000))).status).toBe(413);
    expect(llamar).not.toHaveBeenCalled();
  });
});

describe("pilo-roomy · lo que se manda a Aluna", () => {
  it("lleva el secreto, el correo y solo los campos de cada acción", async () => {
    const { pedir, llamadas } = montar();
    await pedir({ accion: "cursos", cedula: "123", extra: "no" });
    const { init, url } = llamadas[0];
    expect(url).toBe("https://aluna.test/pilo-puente");
    expect((init.headers as Record<string, string>)["x-pilo-secret"]).toBe(SECRETO);
    expect(JSON.parse(String(init.body))).toEqual({ accion: "cursos", correo: "ana@mail.udes.edu.co" });   // ni cédula ni extras
  });

  it("vincular limpia la cédula y pasa la IP del usuario", async () => {
    const { pedir, llamadas } = montar();
    await pedir({ accion: "vincular", cedula: " 1.096-952 328 ", nombre: "  Ana   María Pérez " }, { Authorization: "Bearer T", "x-forwarded-for": "201.1.2.3, 10.0.0.1" });
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ accion: "vincular", correo: "ana@mail.udes.edu.co", cedula: "1096952328", nombre: "Ana María Pérez", ip: "201.1.2.3" });
  });

  it("valida cédula, nombre y curso", () => {
    expect(armarPedido("vincular", { cedula: "12", nombre: "Ana Pérez" }).ok).toBe(false);
    expect(armarPedido("vincular", { cedula: "1".repeat(21), nombre: "Ana Pérez" }).ok).toBe(false);
    expect(armarPedido("vincular", { cedula: "12345", nombre: "A" }).ok).toBe(false);
    expect(armarPedido("estudiantes", { curso_id: "no-es-uuid" }).ok).toBe(false);
    expect(armarPedido("asistencia", { curso_id: UUID.toUpperCase() })).toEqual({ ok: true, campos: { curso_id: UUID } });
    expect(armarPedido("revocar", { curso_id: "x" })).toEqual({ ok: true, campos: {} });
  });
});

describe("pilo-roomy · lo que vuelve", () => {
  it("devuelve lo que contesta Aluna", async () => {
    const cuerpo = { ok: true, periodo: { id: "2026-B" }, cursos: [{ id: UUID, name: "Cálculo" }] };
    const { pedir } = montar({ respuesta: () => new Response(JSON.stringify(cuerpo), { status: 200 }) });
    const r = await pedir({ accion: "cursos" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(cuerpo);
  });

  it("pasa los errores de Aluna con su código y su estado", async () => {
    const { pedir } = montar({ respuesta: () => new Response(JSON.stringify({ ok: false, codigo: "PROFESOR_NO_VINCULADO", mensaje: "No hay vínculo.", secreto: "no" }), { status: 403 }) });
    const r = await pedir({ accion: "cursos" });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, codigo: "PROFESOR_NO_VINCULADO", mensaje: "No hay vínculo." });   // solo código y mensaje
  });

  it("un 401 de Aluna es de configuración, no de la persona; un 429 conserva Retry-After", async () => {
    const a = montar({ respuesta: () => new Response(JSON.stringify({ ok: false, codigo: "NO_AUTORIZADO", mensaje: "x" }), { status: 401 }) });
    const ra = await a.pedir({ accion: "estado" });
    expect(ra.status).toBe(502);
    expect((await ra.json()).codigo).toBe("ROOMY_NO_CONFIGURADO");
    const b = montar({ respuesta: () => new Response(JSON.stringify({ ok: false, codigo: "DEMASIADOS_INTENTOS", mensaje: "x" }), { status: 429, headers: { "Retry-After": "900" } }) });
    const rb = await b.pedir({ accion: "vincular", cedula: "123456", nombre: "Ana Pérez" });
    expect(rb.status).toBe(429);
    expect(rb.headers.get("Retry-After")).toBe("900");
  });

  it("si Aluna no contesta JSON o no responde, 502", async () => {
    expect((await montar({ respuesta: () => new Response("<html>", { status: 200 }) }).pedir({ accion: "estado" })).status).toBe(502);
    expect((await montar({ respuesta: () => new Response("[]", { status: 200 }) }).pedir({ accion: "estado" })).status).toBe(502);
    const cae = crearManejador({ configurado: true, anonKey: "A", sal: "s", urlPuente: "https://a.test", secreto: SECRETO, usuarioDe: async () => ({ id: "u", correo: "a@mail.udes.edu.co" }),
      golpe: async () => 1, limiteHora: 5, llamar: async () => { throw new Error("red"); }, esperaMs: 50 });
    const r = await cae(new Request("https://x.test", { method: "POST", headers: { Authorization: "Bearer T" }, body: JSON.stringify({ accion: "estado" }) }));
    expect(r.status).toBe(502);
    expect((await r.json()).codigo).toBe("ROOMY_NO_DISPONIBLE");
  });

  it("corta con 429 al pasar el límite por hora, sin llamar a Aluna", async () => {
    const { pedir, llamar } = montar({ golpe: 500 });
    const r = await pedir({ accion: "cursos" });
    expect(r.status).toBe(429);
    expect((await r.json()).codigo).toBe("LIMITE");
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(llamar).not.toHaveBeenCalled();
  });
});

describe("pilo-roomy · límite", () => {
  it("no bloquea si el contador falla y la huella no lleva la persona en claro", async () => {
    expect((await revisarLimite({ golpe: async () => null, sal: "s", usuario: "u1", limite: 5 })).ok).toBe(true);
    let vista = "";
    await revisarLimite({ golpe: async (h) => { vista = h; return 1; }, sal: "s", usuario: "u1", limite: 5 });
    expect(vista).toMatch(/^[0-9a-f]{40}$/);
  });
});

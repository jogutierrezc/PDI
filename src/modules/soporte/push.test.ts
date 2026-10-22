/* =============================================================================
   Web Push (RFC 8291 y RFC 8292) · el cifrado contra el ejemplo del RFC.

   El apéndice A del RFC 8291 trae un ejemplo completo con llaves, sal y
   resultado esperado: si el cifrado de push.ts no da exactamente esos bytes,
   ningún navegador va a entender el aviso. También se prueba el JWT de VAPID
   (que verifica Node, no el propio código) y el envío con sus salidas.
   ============================================================================= */

import { createPublicKey, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { b64url, b64urlBytes, cifrarAes128gcm, pushClaves, pushEnviar, vapidJwt } from "./push";

/* El ejemplo del RFC 8291 (apéndice A y sección 5). */
const RFC = {
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  texto: "When I grow up, I want to be a watermelon",
  // El cuerpo completo del ejemplo (RFC 8291, sección 5): sal ‖ tamaño ‖ llave ‖ texto cifrado.
  cuerpo: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("base64url", () => {
  it("va y vuelve sin perder un byte", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(33));
    expect(b64urlBytes(b64url(bytes))).toEqual(bytes);
    expect(b64url(new TextEncoder().encode("hola"))).toBe("aG9sYQ");
  });
});

describe("el cifrado del aviso (RFC 8291)", () => {
  it("reproduce el cuerpo del ejemplo del RFC, byte por byte", async () => {
    const cuerpo = await cifrarAes128gcm(
      { endpoint: "https://push.example/mensaje", p256dh: RFC.uaPublic, auth: RFC.auth },
      RFC.texto,
      { salt: b64urlBytes(RFC.salt), privada: RFC.asPrivate, publica: RFC.asPublic },
    );
    expect(b64url(cuerpo)).toBe(RFC.cuerpo);
  });
});

describe("las llaves VAPID (RFC 8292)", () => {
  it("nacen en el formato que espera el servidor de push", async () => {
    const claves = await pushClaves("mailto:soporte@udes.edu.co");
    const publica = b64urlBytes(claves.public);
    expect(publica.length).toBe(65);
    expect(publica[0]).toBe(4);
    expect(b64urlBytes(claves.private).length).toBe(32);
    expect(claves.subject).toBe("mailto:soporte@udes.edu.co");
  });
  it("el JWT lo verifica Node, no el propio código", async () => {
    const claves = await pushClaves("mailto:soporte@udes.edu.co");
    const jwt = await vapidJwt(claves, "https://push.example");
    const [cabeza, cuerpo, firma] = jwt.split(".");
    // El contenido del JWT.
    const decodificar = (parte: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(parte)));
    expect(decodificar(cabeza)).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = decodificar(cuerpo);
    expect(claims.aud).toBe("https://push.example");
    expect(claims.sub).toBe("mailto:soporte@udes.edu.co");
    expect(Number(claims.exp)).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3600);
    // La firma: r ‖ s (64 bytes) → DER, y a verificar con la pública.
    const cruda = b64urlBytes(firma);
    expect(cruda.length).toBe(64);
    const entero = (b: Buffer) => {
      const p = b[0] < 128 ? b : Buffer.concat([Buffer.from([0]), b]);
      return Buffer.concat([Buffer.from([0x02, p.length]), p]);
    };
    const interior = Buffer.concat([entero(Buffer.from(cruda.slice(0, 32))), entero(Buffer.from(cruda.slice(32)))]);
    const der = Buffer.concat([Buffer.from([0x30, interior.length]), interior]);
    const publica = createVerify("SHA256");
    publica.update(`${cabeza}.${cuerpo}`);
    const bytes = b64urlBytes(claves.public);
    const llave = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: b64url(bytes.slice(1, 33)), y: b64url(bytes.slice(33, 65)) },
      format: "jwk",
    });
    expect(publica.verify(llave, der)).toBe(true);
  });
});

describe("el envío", () => {
  const destino = { endpoint: "https://push.example/mensaje", p256dh: RFC.uaPublic, auth: RFC.auth };
  it("201 es un aviso que llegó", async () => {
    const claves = { public: RFC.asPublic, private: RFC.asPrivate, subject: "mailto:prueba@udes.edu.co" };
    const ok = await pushEnviar(destino, { titulo: "Hola", cuerpo: "Una conversación" }, claves, (async () => new Response(null, { status: 201 })) as typeof fetch);
    expect(ok).toEqual({ ok: true });
  });
  it("410 es una suscripción muerta", async () => {
    const claves = { public: RFC.asPublic, private: RFC.asPrivate, subject: "mailto:prueba@udes.edu.co" };
    const salida = await pushEnviar(destino, { titulo: "Hola", cuerpo: "Una conversación" }, claves, (async () => new Response(null, { status: 410 })) as typeof fetch);
    expect(salida.ok).toBe(false);
    expect(salida.gone).toBe(true);
  });
  it("un error de red no lanza", async () => {
    const claves = { public: RFC.asPublic, private: RFC.asPrivate, subject: "mailto:prueba@udes.edu.co" };
    const salida = await pushEnviar(destino, { titulo: "Hola", cuerpo: "Una conversación" }, claves, (async () => {
      throw new Error("sin red");
    }) as typeof fetch);
    expect(salida.ok).toBe(false);
  });
});

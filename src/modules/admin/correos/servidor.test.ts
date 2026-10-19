/* =============================================================================
   Correos · la lógica pura de la función `correos` (servidor-logica.ts).
   ========================================================================== */

import { describe, expect, it } from "vitest";
import {
  armarCorreo,
  basePublica,
  clavePlantilla,
  conexionDe,
  correoValido,
  decidirEnvio,
  dominioPermitido,
  dominiosDe,
  enlaceDeVerificacion,
  enmascarar,
  enviosDe,
  escapar,
  falloSmtp,
  firmaValida,
  firmar,
  huella,
  identidadDe,
  igualesEnTiempoConstante,
  marcadoresDesconocidos,
  mensajeDe,
  personaDe,
  plantillaDeBorrador,
  plantillaDeFila,
  plantillaOriginal,
  rellenar,
  rolDe,
  secretosDelGancho,
  MARCAS,
  PERSONAS_DE_EJEMPLO,
  PLANTILLA_CODIGO,
  PLANTILLAS,
  type Plantilla,
} from "./servidor-logica";

const LLAVE = btoa("una-llave-de-prueba-de-32-bytes!");
const SECRETO = `v1,whsec_${LLAVE}`;
const CUERPO = JSON.stringify({ user: { email: "laura.gomez@mail.udes.edu.co" }, email_data: { token_hash: "abc", email_action_type: "recovery" } });
const AHORA = 1_790_000_000;

const laura = PERSONAS_DE_EJEMPLO.estudiante;
const bienvenida = plantillaOriginal("pilo-invite") as Plantilla;
const activar = plantillaOriginal("plan-invite") as Plantilla;

describe("la firma del gancho", () => {
  const pedido = async (cambios: Record<string, unknown> = {}) => {
    const firmas = await firmar(SECRETO, "msg_1", String(AHORA), CUERPO);
    return firmaValida({ secreto: SECRETO, id: "msg_1", hora: String(AHORA), cuerpo: CUERPO, firmas, ahora: AHORA, ...cambios });
  };

  it("acepta un pedido firmado con el secreto", async () => {
    expect(await pedido()).toEqual({ ok: true });
  });

  it("acepta el secreto con y sin prefijos", async () => {
    for (const secreto of [SECRETO, `whsec_${LLAVE}`, LLAVE, `  ${SECRETO}  `]) expect(await pedido({ secreto }), secreto).toEqual({ ok: true });
  });

  it("acepta cualquiera de varios secretos y cualquiera de varias firmas", async () => {
    const otro = `v1,whsec_${btoa("otra-llave-distinta-de-32-bytes!")}`;
    expect(await pedido({ secreto: `${otro}|${SECRETO}` })).toEqual({ ok: true });
    const buena = await firmar(SECRETO, "msg_1", String(AHORA), CUERPO);
    expect(await pedido({ firmas: `v1,${btoa("basura")} ${buena}` })).toEqual({ ok: true });
  });

  it("rechaza una firma hecha con otro secreto, o sobre otro cuerpo, otro id u otra hora", async () => {
    const otro = `v1,whsec_${btoa("otra-llave-distinta-de-32-bytes!")}`;
    expect(await pedido({ secreto: otro })).toEqual({ ok: false, motivo: "firma" });
    expect(await pedido({ cuerpo: CUERPO.replace("laura", "maria") })).toEqual({ ok: false, motivo: "firma" });
    expect(await pedido({ id: "msg_2" })).toEqual({ ok: false, motivo: "firma" });
    expect(await pedido({ hora: String(AHORA + 1) })).toEqual({ ok: false, motivo: "firma" });
    expect(await pedido({ firmas: "v1,AAAA" })).toEqual({ ok: false, motivo: "firma" });
    expect(await pedido({ firmas: "v2,loquesea" })).toEqual({ ok: false, motivo: "firma" });
  });

  it("rechaza un pedido vencido o del futuro, y acepta el que está dentro de la tolerancia", async () => {
    expect(await pedido({ ahora: AHORA + 301 })).toEqual({ ok: false, motivo: "vencida" });
    expect(await pedido({ ahora: AHORA - 301 })).toEqual({ ok: false, motivo: "vencida" });
    expect(await pedido({ ahora: AHORA + 299 })).toEqual({ ok: true });
  });

  it("sin cabeceras o sin secreto no hay nada que comprobar", async () => {
    expect(await pedido({ firmas: null })).toEqual({ ok: false, motivo: "cabeceras" });
    expect(await pedido({ id: null })).toEqual({ ok: false, motivo: "cabeceras" });
    expect(await pedido({ hora: "ayer" })).toEqual({ ok: false, motivo: "cabeceras" });
    expect(await pedido({ secreto: "" })).toEqual({ ok: false, motivo: "secreto" });
    expect(await pedido({ secreto: undefined })).toEqual({ ok: false, motivo: "secreto" });
    expect(secretosDelGancho("v1,whsec_")).toEqual([]);
  });

  it("compara en tiempo constante, también con largos distintos", () => {
    expect(igualesEnTiempoConstante(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(igualesEnTiempoConstante(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(igualesEnTiempoConstante(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
    expect(igualesEnTiempoConstante(new Uint8Array([]), new Uint8Array([0]))).toBe(false);
  });
});

describe("identidad y plantilla", () => {
  it("la cuenta marcada como de Pilo sale con la identidad de Pilo; las demás, con la de Planeación", () => {
    expect(identidadDe({ user_metadata: { pilo: true } })).toBe("pilo");
    expect(identidadDe({ user_metadata: { pilo: "true" } })).toBe("pilo");
    expect(identidadDe({ user_metadata: { pilo: false } })).toBe("plan");
    expect(identidadDe({ user_metadata: {} })).toBe("plan");
    expect(identidadDe({})).toBe("plan");
    expect(identidadDe(null)).toBe("plan");
  });

  it("cada pedido del servidor de cuentas tiene su plantilla", () => {
    expect(clavePlantilla("plan", "invite")).toBe("plan-invite");
    expect(clavePlantilla("plan", "recovery")).toBe("plan-recovery");
    expect(clavePlantilla("plan", "email_change")).toBe("plan-email_change");
    expect(clavePlantilla("plan", "signup")).toBe("plan-signup");
    expect(clavePlantilla("plan", "magiclink")).toBe("plan-magiclink");
    expect(clavePlantilla("plan", "email")).toBe("plan-magiclink");
    expect(clavePlantilla("pilo", "invite")).toBe("pilo-invite");
    expect(clavePlantilla("pilo", "signup")).toBe("pilo-invite");
    expect(clavePlantilla("pilo", "recovery")).toBe("pilo-recovery");
  });

  it("lo que Pilo no tiene propio sale con la plantilla de Planeación", () => {
    expect(clavePlantilla("pilo", "email_change")).toBe("plan-email_change");
    expect(clavePlantilla("pilo", "magiclink")).toBe("plan-magiclink");
  });

  it("el código de verificación no lleva enlace, y los avisos no se envían", () => {
    expect(clavePlantilla("plan", "reauthentication")).toBe(PLANTILLA_CODIGO.clave);
    expect(clavePlantilla("plan", "password_changed_notification")).toBeNull();
    expect(clavePlantilla("pilo", "loquesea")).toBeNull();
  });

  it("toda plantilla con enlace tiene su texto original, y las claves no se repiten", () => {
    for (const identidad of ["plan", "pilo"] as const) {
      for (const accion of ["signup", "invite", "magiclink", "recovery", "email_change"]) {
        expect(plantillaOriginal(clavePlantilla(identidad, accion) as string), `${identidad} ${accion}`).not.toBeNull();
      }
    }
    expect(new Set(PLANTILLAS.map((p) => p.clave)).size).toBe(PLANTILLAS.length);
    // Los avisos «para después» no están.
    expect(PLANTILLAS.some((p) => /informe|entrega/i.test(p.nombre))).toBe(false);
  });

  it("una fila de la base manda; lo que falte se completa con el original; apagada o ausente, vale el original", () => {
    const fila = { identity: "plan", grp: "Cuentas de la intranet", name: "Activar la cuenta", subject: "Bienvenido", title: "", greeting: "", body: "Otro mensaje.", button: "Abrir", note: "", role_bodies: null, active: true };
    const p = plantillaDeFila(fila, "plan-invite") as Plantilla;
    expect(p.asunto).toBe("Bienvenido");
    expect(p.titulo).toBe(activar.titulo);
    expect(p.saludo).toBe("");
    expect(p.mensaje).toBe("Otro mensaje.");
    expect(plantillaDeFila({ ...fila, active: false }, "plan-invite")).toEqual(activar);
    expect(plantillaDeFila(null, "plan-invite")).toEqual(activar);
    expect(plantillaDeFila(null, "no-existe")).toBeNull();
  });

  it("un borrador no puede cambiar de identidad ni de clave", () => {
    const p = plantillaDeBorrador({ identidad: "pilo", clave: "pilo-invite", asunto: "Hola", mensaje: "Texto" }, "plan-invite") as Plantilla;
    expect(p.identidad).toBe("plan");
    expect(p.clave).toBe("plan-invite");
    expect(p.asunto).toBe("Hola");
    expect(plantillaDeBorrador({ asunto: "x" }, "no-existe")).toBeNull();
    const k = plantillaDeBorrador({ roles: { estudiante: "E", profesor: "P", administrativo: 7 } }, "pilo-invite") as Plantilla;
    expect(k.roles).toEqual({ estudiante: "E", profesor: "P", administrativo: "" });
  });
});

describe("el mensaje por rol", () => {
  it("cada rol recibe el suyo", () => {
    expect(mensajeDe(bienvenida, "estudiante")).toContain("ayudarle a estudiar");
    expect(mensajeDe(bienvenida, "profesor")).toContain("labor docente");
    expect(mensajeDe(bienvenida, "administrativo")).toContain("las cifras");
  });

  it("si el de un rol está vacío vale el de estudiante; si tampoco, el común", () => {
    const sinProfesor = { ...bienvenida, roles: { ...bienvenida.roles!, profesor: "  " } };
    expect(mensajeDe(sinProfesor, "profesor")).toBe(bienvenida.roles!.estudiante);
    const vacia = { ...bienvenida, mensaje: "Común", roles: { estudiante: "", profesor: "", administrativo: "" } };
    expect(mensajeDe(vacia, "administrativo")).toBe("Común");
  });

  it("una plantilla sin mensajes por rol usa su mensaje", () => {
    expect(mensajeDe(activar, "profesor")).toBe(activar.mensaje);
  });

  it("si no se sabe el rol, es estudiante", () => {
    expect(rolDe(undefined, null, "")).toBe("estudiante");
    expect(rolDe("rector")).toBe("estudiante");
    expect(rolDe(undefined, "Profesor ")).toBe("profesor");
    expect(rolDe("administrativo", "profesor")).toBe("administrativo");
  });

  it("la persona se nombra con su sede escrita y con respaldos", () => {
    expect(personaDe({ correo: " a@udes.edu.co ", nombre: "  Ana   Ríos ", sede: "cucuta", rol: "Profesor" })).toEqual({ correo: "a@udes.edu.co", nombre: "Ana Ríos", sede: "Cúcuta", rol: "profesor" });
    expect(personaDe({ correo: "a@udes.edu.co" })).toEqual({ correo: "a@udes.edu.co", nombre: "", sede: "la UDES", rol: "usuario" });
  });
});

describe("el enlace personal", () => {
  it("se arma con el token, el tipo y a dónde volver, todo codificado", () => {
    expect(enlaceDeVerificacion("https://planeacion.udes.edu.co/", "a+b/c", "recovery", "https://planeacion.udes.edu.co/app/cuenta?clave=1")).toBe(
      "https://planeacion.udes.edu.co/auth/v1/verify?token=a%2Bb%2Fc&type=recovery&redirect_to=https%3A%2F%2Fplaneacion.udes.edu.co%2Fapp%2Fcuenta%3Fclave%3D1",
    );
  });

  it("la dirección pública: la de la variable; si no, el dominio del portal; nunca la interna si hay otra", () => {
    expect(basePublica("https://api.udes.edu.co/", "https://planeacion.udes.edu.co/x", "http://kong:8000")).toBe("https://api.udes.edu.co");
    expect(basePublica("", "https://planeacion.udes.edu.co/admin?x=1", "http://kong:8000")).toBe("https://planeacion.udes.edu.co");
    expect(basePublica(undefined, "", "http://kong:8000")).toBe("http://kong:8000");
    expect(basePublica("no-es-url", "", "")).toBe("");
  });

  it("casi todo pedido es un solo correo, a la dirección de la cuenta", () => {
    expect(enviosDe({ email: "a@udes.edu.co" }, { email_action_type: "recovery", token_hash: "h1", token: "111111" })).toEqual([{ para: "a@udes.edu.co", hash: "h1", codigo: "111111" }]);
    expect(enviosDe({}, { email_action_type: "recovery", token_hash: "h1" })).toEqual([]);
  });

  it("cambio de correo sin «cambio seguro»: uno solo, a la dirección nueva", () => {
    expect(enviosDe({ email: "vieja@udes.edu.co", new_email: "nueva@udes.edu.co" }, { email_action_type: "email_change", token_hash: "h1", token: "111111", token_hash_new: "", token_new: "" })).toEqual([
      { para: "nueva@udes.edu.co", hash: "h1", codigo: "111111" },
    ]);
  });

  it("cambio de correo con «cambio seguro»: dos, y los nombres van cruzados", () => {
    const envios = enviosDe(
      { email: "vieja@udes.edu.co", new_email: "nueva@udes.edu.co" },
      { email_action_type: "email_change", token_hash: "hash-de-la-nueva", token_new: "222222", token_hash_new: "hash-de-la-actual", token: "111111" },
    );
    expect(envios).toEqual([
      { para: "nueva@udes.edu.co", hash: "hash-de-la-nueva", codigo: "222222" },
      { para: "vieja@udes.edu.co", hash: "hash-de-la-actual", codigo: "111111" },
    ]);
  });
});

describe("los datos de la persona", () => {
  it("pone los cuatro datos, con o sin espacios en el marcador", () => {
    expect(rellenar("{{nombre}} · {{ correo }} · {{sede}} · {{rol}}", laura).salida).toBe("Laura Gómez · laura.gomez@mail.udes.edu.co · Bucaramanga · estudiante");
  });

  it("escapa lo que inserta y lo que rodea cuando es HTML", () => {
    const malo = { ...laura, nombre: `<script>alert("x")</script> & O'Neil` };
    const r = rellenar("Hola, {{nombre}}. <b>¿Todo bien?</b>", malo, "html");
    expect(r.salida).toBe("Hola, &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; O&#39;Neil. &lt;b&gt;¿Todo bien?&lt;/b&gt;");
    expect(rellenar("{{nombre}}", malo, "texto").salida).toBe(malo.nombre);
    expect(escapar(`"<&>'`)).toBe("&quot;&lt;&amp;&gt;&#39;");
  });

  it("un marcador desconocido se deja tal cual y se avisa", () => {
    const r = rellenar("Hola, {{nombre}}. Su programa es {{programa}} y su {{ Nombre }}.", laura, "html");
    expect(r.salida).toBe("Hola, Laura Gómez. Su programa es {{programa}} y su {{ Nombre }}.");
    expect(r.desconocidos).toEqual(["{{programa}}", "{{ Nombre }}"]);
    expect(rellenar("Sin marcadores { ni } nada {{", laura).desconocidos).toEqual([]);
  });

  it("no vuelve a rellenar lo que trae el propio dato", () => {
    expect(rellenar("{{nombre}}", { ...laura, nombre: "{{correo}}" }).salida).toBe("{{correo}}");
  });

  it("sin nombre, el saludo y el asunto no quedan cojos", () => {
    const anonima = { ...laura, nombre: "" };
    expect(rellenar("Hola, {{nombre}}.", anonima).salida).toBe("Hola.");
    expect(rellenar("{{nombre}}, confirme su cuenta de Mr. Pilo", anonima).salida).toBe("Confirme su cuenta de Mr. Pilo");
    expect(rellenar("¡Hola, {{ nombre }}!", anonima).salida).toBe("¡Hola!");
  });

  it("la vista previa puede resaltar los datos insertados", () => {
    expect(rellenar("Hola, {{nombre}}.", laura, "resaltado").salida).toMatch(/^Hola, <span style="[^"]+">Laura Gómez<\/span>\.$/);
  });

  it("revisa todos los campos y los mensajes por rol", () => {
    expect(marcadoresDesconocidos(bienvenida)).toEqual([]);
    const mala = { ...bienvenida, asunto: "{{apodo}}", roles: { ...bienvenida.roles!, profesor: "Hola {{materia}} {{apodo}}" } };
    expect(marcadoresDesconocidos(mala)).toEqual(["{{apodo}}", "{{materia}}"]);
  });
});

describe("el correo", () => {
  const ENLACE = "https://planeacion.udes.edu.co/auth/v1/verify?token=abc&type=invite&redirect_to=https%3A%2F%2Fplaneacion.udes.edu.co";
  const SITIO = "https://planeacion.udes.edu.co";

  it("el de Planeación: marino, botón azul, sin imagen", () => {
    const c = armarCorreo({ plantilla: activar, persona: laura, enlace: ENLACE, sitio: SITIO });
    expect(c.asunto).toBe("Active su cuenta de Planeación UDES");
    expect(c.previa).toBe("Su cuenta está lista: elija su contraseña.");
    expect(c.html).toContain("background:#0a2d63");
    expect(c.html).toContain("background:#2166d6");
    expect(c.html).toContain("max-width:560px");
    expect(c.html).toContain("Universidad de Santander");
    expect(c.html).toContain("Hola, Laura Gómez.");
    expect(c.html).toContain("con el correo laura.gomez@mail.udes.edu.co.");
    expect(c.html).toContain(`href="${ENLACE.replace(/&/g, "&amp;")}"`);
    expect(c.html).toContain("No responda a esta dirección.");
    expect(c.html).not.toContain("<img");
    expect(c.html).not.toMatch(/<script|<style|<svg|<link/i);
    expect(c.desconocidos).toEqual([]);
  });

  it("el de Pilo: su color, su botón con tinta oscura y su cara como imagen del portal, con alt y tamaño", () => {
    const c = armarCorreo({ plantilla: bienvenida, persona: PERSONAS_DE_EJEMPLO.profesor, rol: "profesor", enlace: ENLACE, sitio: `${SITIO}/app` });
    expect(c.asunto).toBe("Carlos Rueda, confirme su cuenta de Mr. Pilo");
    expect(c.html).toContain("background:#06142b");
    expect(c.html).toContain("background:#4fd3e0");
    expect(c.html).toContain("color:#04222a");
    expect(c.html).toMatch(/<img src="https:\/\/planeacion\.udes\.edu\.co\/pilo-face\/closed\.png" width="46" height="64" alt="Mr\. Pilo"/);
    expect(c.html).toContain("Con su cuenta de Cúcuta puedo apoyarle en su labor docente");
    expect(c.html).not.toContain("ayudarle a estudiar");
  });

  it("el de Pilo se entiende sin la cara: sin dirección del portal no hay imagen, pero sí su nombre", () => {
    const c = armarCorreo({ plantilla: bienvenida, persona: laura, rol: "estudiante", enlace: ENLACE, sitio: "" });
    expect(c.html).not.toContain("<img");
    expect(c.html).toContain("Mr. Pilo");
    expect(c.html).toContain("La inteligencia artificial de la Universidad de Santander");
  });

  it("cada línea del mensaje es un párrafo", () => {
    const c = armarCorreo({ plantilla: activar, persona: laura, enlace: ENLACE, sitio: SITIO });
    expect(c.html).toContain("laura.gomez@mail.udes.edu.co.</p>");
    expect(c.html).toMatch(/<p style="margin:0 0 24px;">Para activarla y elegir su contraseña, abra este enlace\.<\/p>/);
  });

  it("trae versión de texto plano, con el enlace entero y sin etiquetas", () => {
    const c = armarCorreo({ plantilla: activar, persona: laura, enlace: ENLACE, sitio: SITIO });
    expect(c.texto).toContain("Active su cuenta\n\nHola, Laura Gómez.\n\n");
    expect(c.texto).toContain(`Activar mi cuenta:\n${ENLACE}\n`);
    expect(c.texto).toContain("El enlace sirve una sola vez.");
    expect(c.texto).toContain(SITIO);
    expect(c.texto).not.toMatch(/<[a-z/]/i);
  });

  it("escapa los datos de la persona en el HTML, no en el texto", () => {
    const c = armarCorreo({ plantilla: activar, persona: { ...laura, nombre: "<b>Ana</b>" }, enlace: ENLACE, sitio: SITIO });
    expect(c.html).toContain("Hola, &lt;b&gt;Ana&lt;/b&gt;.");
    expect(c.html).not.toContain("<b>Ana</b>");
    expect(c.texto).toContain("Hola, <b>Ana</b>.");
  });

  it("un enlace con comillas no rompe el atributo", () => {
    const c = armarCorreo({ plantilla: activar, persona: laura, enlace: 'https://x.co/?a="><script>', sitio: SITIO });
    expect(c.html).not.toContain('"><script>');
    expect(c.html).toContain("https://x.co/?a=&quot;&gt;&lt;script&gt;");
  });

  it("avisa los marcadores desconocidos de cualquier campo, y los deja tal cual", () => {
    const c = armarCorreo({ plantilla: { ...activar, asunto: "Hola {{apodo}}", nota: "Su {{programa}}" }, persona: laura, enlace: ENLACE, sitio: SITIO });
    expect(c.desconocidos.sort()).toEqual(["{{apodo}}", "{{programa}}"]);
    expect(c.asunto).toBe("Hola {{apodo}}");
    expect(c.html).toContain("Su {{programa}}");
  });

  it("el asunto queda en una línea", () => {
    expect(armarCorreo({ plantilla: { ...activar, asunto: "Uno\r\nBcc: x@y.co" }, persona: laura, enlace: ENLACE, sitio: SITIO }).asunto).toBe("Uno Bcc: x@y.co");
  });

  it("con «responder a», el pie no pide no responder", () => {
    expect(armarCorreo({ plantilla: activar, persona: laura, enlace: ENLACE, sitio: SITIO, respondible: true }).html).not.toContain("No responda");
  });

  it("el correo con código lo muestra y no lleva botón ni enlace", () => {
    const c = armarCorreo({ plantilla: PLANTILLA_CODIGO, persona: laura, enlace: ENLACE, codigo: "481516", sitio: SITIO });
    expect(c.html).toContain("481516");
    expect(c.html).not.toContain("auth/v1/verify");
    expect(c.texto).toContain("Código: 481516");
  });

  it("la vista previa resalta los datos; el correo de verdad no", () => {
    expect(armarCorreo({ plantilla: activar, persona: laura, enlace: ENLACE, sitio: SITIO, resaltar: true }).html).toContain("background:#fff3c4");
    expect(armarCorreo({ plantilla: activar, persona: laura, enlace: ENLACE, sitio: SITIO }).html).not.toContain("#fff3c4");
  });

  it("las dos identidades tienen su aspecto", () => {
    expect(MARCAS.plan.cabecera).toBe("#0a2d63");
    expect(MARCAS.plan.boton).toBe("#2166d6");
    expect(MARCAS.pilo.cabecera).toBe("#06142b");
    expect(MARCAS.pilo.boton).toBe("#4fd3e0");
    expect(MARCAS.pilo.botonTinta).toBe("#04222a");
  });
});

describe("la bitácora no guarda a quién", () => {
  it("enmascara la primera parte del nombre", () => {
    expect(enmascarar("laura.gomez@mail.udes.edu.co")).toBe("l•••a.gomez@mail.udes.edu.co");
    expect(enmascarar("Carlos.Rueda@UDES.edu.co")).toBe("c•••s.rueda@udes.edu.co");
    expect(enmascarar("planeacion@udes.edu.co")).toBe("p•••n@udes.edu.co");
    expect(enmascarar("ab@udes.edu.co")).toBe("a•••@udes.edu.co");
    expect(enmascarar("x@udes.edu.co")).toBe("x•••@udes.edu.co");
    expect(enmascarar("sin-arroba")).toBe("•••");
    expect(enmascarar(null)).toBe("•••");
  });

  it("la huella es la misma para la misma persona y distinta con otra sal", async () => {
    const a = await huella("Laura.Gomez@mail.udes.edu.co ", "sal");
    expect(a).toBe(await huella("laura.gomez@mail.udes.edu.co", "sal"));
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(a).not.toBe(await huella("laura.gomez@mail.udes.edu.co", "otra"));
    expect(a).not.toBe(await huella("carlos.rueda@udes.edu.co", "sal"));
    expect(a).not.toContain("laura");
  });

  it("reconoce un correo completo", () => {
    expect(correoValido("a.b@udes.edu.co")).toBe(true);
    for (const malo of ["", "a@b", "a b@udes.edu.co", "a@udes.edu.co, b@udes.edu.co", "Ana <a@udes.edu.co>", "a@udes.edu.co.", null]) expect(correoValido(malo), String(malo)).toBe(false);
  });
});

describe("dominios y topes", () => {
  it("lee la lista de dominios como la escriba la persona", () => {
    expect(dominiosDe(" udes.edu.co, @mail.udes.edu.co;*.Valledupar.udes.edu.co\nudes.edu.co  basura ")).toEqual(["udes.edu.co", "mail.udes.edu.co", "valledupar.udes.edu.co"]);
    expect(dominiosDe(["UDES.edu.co"])).toEqual(["udes.edu.co"]);
    expect(dominiosDe(null)).toEqual([]);
  });

  it("lista vacía: a cualquiera; un dominio incluye sus subdominios y nada más", () => {
    expect(dominioPermitido("a@gmail.com", [])).toBe(true);
    expect(dominioPermitido("a@udes.edu.co", ["udes.edu.co"])).toBe(true);
    expect(dominioPermitido("a@MAIL.udes.edu.co", ["udes.edu.co"])).toBe(true);
    expect(dominioPermitido("a@udes.edu.co", ["mail.udes.edu.co"])).toBe(false);
    expect(dominioPermitido("a@falsoudes.edu.co", ["udes.edu.co"])).toBe(false);
    expect(dominioPermitido("a@udes.edu.co.evil.com", ["udes.edu.co"])).toBe(false);
    expect(dominioPermitido("a@gmail.com", ["udes.edu.co"])).toBe(false);
  });

  const caso = { tipo: "cuenta" as const, encendido: true, permitido: true, enHora: 0, topeHora: 200, dePersonaHoy: 0, topePersona: 5 };

  it("un correo de cuenta sale aunque se haya pasado el tope por hora", () => {
    expect(decidirEnvio({ ...caso, enHora: 5000 })).toEqual({ sale: true });
  });

  it("el tope por persona sí lo corta, con un error que se entiende", () => {
    expect(decidirEnvio({ ...caso, dePersonaHoy: 4 })).toEqual({ sale: true });
    const d = decidirEnvio({ ...caso, dePersonaHoy: 5 });
    expect(d).toMatchObject({ sale: false, resultado: "rechazado", http: 429 });
    expect(d.sale ? "" : d.motivo).toContain("5 correos de cuenta");
    expect(decidirEnvio({ ...caso, dePersonaHoy: 900, topePersona: 0 })).toEqual({ sale: true });
  });

  it("apagado o fuera de los dominios, no sale", () => {
    expect(decidirEnvio({ ...caso, encendido: false })).toMatchObject({ sale: false, resultado: "rechazado", http: 503 });
    expect(decidirEnvio({ ...caso, permitido: false })).toMatchObject({ sale: false, resultado: "rechazado", http: 403 });
  });

  it("una prueba respeta el tope por hora y los dominios, pero no el tope por persona ni el interruptor", () => {
    expect(decidirEnvio({ ...caso, tipo: "prueba", dePersonaHoy: 99 })).toEqual({ sale: true });
    expect(decidirEnvio({ ...caso, tipo: "prueba", encendido: false })).toEqual({ sale: true });
    expect(decidirEnvio({ ...caso, tipo: "prueba", enHora: 200 })).toMatchObject({ sale: false, resultado: "rechazado", http: 429 });
    expect(decidirEnvio({ ...caso, tipo: "prueba", permitido: false })).toMatchObject({ sale: false, http: 403 });
  });

  it("un aviso espera su turno si se pasó el tope por hora", () => {
    expect(decidirEnvio({ ...caso, tipo: "aviso", enHora: 199 })).toEqual({ sale: true });
    expect(decidirEnvio({ ...caso, tipo: "aviso", enHora: 200 })).toMatchObject({ sale: false, resultado: "en_espera" });
    expect(decidirEnvio({ ...caso, tipo: "aviso", enHora: 9999, topeHora: 0 })).toEqual({ sale: true });
  });
});

describe("el servidor de correo", () => {
  const ENV = { SMTP_HOST: "smtp.respaldo.co", SMTP_PORT: "465", SMTP_USER: "u@udes.edu.co", SMTP_PASS: "de-entorno", SMTP_SECURE: "" };

  it("manda lo guardado en la intranet", () => {
    expect(conexionDe({ smtp_host: "smtp.office365.com", smtp_port: 587, smtp_security: "starttls", smtp_user: "p@udes.edu.co" }, "guardada", ENV)).toEqual({
      host: "smtp.office365.com", port: 587, seguridad: "starttls", user: "p@udes.edu.co", pass: "guardada", origen: "base",
    });
  });

  it("con servidor en la intranet pero sin contraseña guardada, usa la de las variables", () => {
    expect(conexionDe({ smtp_host: "smtp.office365.com" }, "", ENV)).toMatchObject({ origen: "base", pass: "de-entorno", port: 587 });
  });

  it("sin servidor en la base, valen las variables de la función", () => {
    expect(conexionDe({ smtp_host: "" }, "guardada", ENV)).toEqual({ host: "smtp.respaldo.co", port: 465, seguridad: "ssl", user: "u@udes.edu.co", pass: "de-entorno", origen: "entorno" });
    expect(conexionDe(null, "", { ...ENV, SMTP_PORT: "587" })).toMatchObject({ seguridad: "starttls", origen: "entorno" });
    expect(conexionDe(null, "", { ...ENV, SMTP_PORT: "2525", SMTP_SECURE: "ssl" })).toMatchObject({ seguridad: "ssl", port: 2525 });
    expect(conexionDe(null, "", { ...ENV, SMTP_PORT: "nada" })).toMatchObject({ port: 587 });
  });

  it("un servidor sin cifrado (Mailpit) se guarda y se respeta, sin usuario ni contraseña", () => {
    expect(conexionDe({ smtp_host: "mailpit", smtp_port: 1025, smtp_security: "none", smtp_user: "" }, "", {})).toEqual({
      host: "mailpit", port: 1025, seguridad: "none", user: "", pass: "", origen: "base",
    });
    expect(conexionDe(null, "", { ...ENV, SMTP_PORT: "1025", SMTP_SECURE: "none" })).toMatchObject({ seguridad: "none", port: 1025 });
    // Cualquier otro valor guardado sigue siendo STARTTLS.
    expect(conexionDe({ smtp_host: "x.co", smtp_security: "ninguna" }, "", {})).toMatchObject({ seguridad: "starttls" });
  });

  it("sin nada, lo dice", () => {
    expect(conexionDe(null, "", {}).origen).toBe("ninguno");
  });

  it("dice qué falló, según el caso", () => {
    expect(falloSmtp({ code: "EDNS", message: "getaddrinfo ENOTFOUND smtp.ofice365.com" }).codigo).toBe("dns");
    expect(falloSmtp({ code: "ESOCKET", message: "connect ECONNREFUSED 10.0.0.1:587" }).codigo).toBe("puerto");
    expect(falloSmtp({ code: "ETIMEDOUT", message: "Connection timeout" }).codigo).toBe("tiempo");
    expect(falloSmtp({ code: "ETIMEDOUT", message: "Greeting never received" }).codigo).toBe("tiempo");
    expect(falloSmtp({ code: "ESOCKET", message: "C0A8:error:0A00010B:SSL routines:ssl3_get_record:wrong version number" }).codigo).toBe("tls");
    expect(falloSmtp({ code: "EAUTH", responseCode: 535, message: "Invalid login: 535 5.7.139 Authentication unsuccessful" }).codigo).toBe("credenciales");
    expect(falloSmtp({ code: "EMESSAGE", responseCode: 554, message: "554 5.2.252 SendAsDenied; a@udes.edu.co not allowed to send as b@udes.edu.co" }).codigo).toBe("remitente");
    expect(falloSmtp({ code: "EENVELOPE", responseCode: 550, message: "550 5.1.1 <laura.gomez@mail.udes.edu.co>: Recipient address rejected" }).codigo).toBe("buzon");
    expect(falloSmtp(new Error("algo raro")).codigo).toBe("otro");
    expect(falloSmtp(null).codigo).toBe("otro");
  });

  it("el motivo nunca repite lo que dijo el servidor: podría traer la dirección de la persona", () => {
    const f = falloSmtp({ code: "EENVELOPE", responseCode: 550, message: "550 5.1.1 <laura.gomez@mail.udes.edu.co>: Recipient address rejected" });
    expect(f.mensaje).not.toContain("laura");
    expect(f.mensaje).toContain("550");
  });
});

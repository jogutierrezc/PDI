/* =============================================================================
   Portal de agentes · Web Push (RFC 8291 y RFC 8292) sin dependencias.

   El aviso push del portal de agentes viaja cifrado con AES-128-GCM y las
   llaves VAPID firman el pedido. Esto lo hace cualquier navegador con su
   API Web Crypto: no hace falta traer npm ni node_compat al contenedor de
   funciones. TODO lo que usa es Web Crypto (crypto.subtle) y fetch.

   Qué hay aquí:
     pushClaves()            genera un par de llaves VAPID (base64url).
     vapidJwt()             el encabezado Authorization (un JWT ES256).
     cifrarAes128gcm()      el cuerpo cifrado como lo espera el navegador.
     pushEnviar()           despacha el aviso a un endpoint de push.

   Este archivo es una dependencia CERO del navegador: solo lo usa la función
   del servidor (`supabase/functions/soporte/index.ts` lleva una copia exacta
   de este bloque; la prueba funcion-sync lo vigila).
   ============================================================================= */

export interface PushClaves {
  /** La pública (65 bytes: 0x04 ‖ x ‖ y, base64url). Va en el manifest del navegador y en el encabezado. */
  public: string;
  /** La privada (32 bytes, base64url). Nunca sale del servidor. */
  private: string;
  /** Un mailto: para que el servicio de push sepa quién responde por los avisos. */
  subject: string;
}

/** A quién le llega el aviso: la suscripción que guardó el navegador del agente. */
export interface PushDestino {
  endpoint: string;
  /** La llave pública de la suscripción (65 bytes, base64url). */
  p256dh: string;
  /** El secreto de autenticación (16 bytes, base64url). */
  auth: string;
}

/** El texto del aviso. El service worker decide cómo mostrarlo. */
export interface PushMensaje {
  titulo: string;
  cuerpo: string;
  /** Para agrupar avisos del mismo tema (p. ej. la conversación). */
  tag?: string;
  /** A dónde abre el aviso (una ruta del portal). */
  url?: string;
  /** Cuánto vale el aviso si el equipo está apagado (segundos). */
  ttl?: number;
}

/* --- base64url ------------------------------------------------------------------------------------ */

export function b64url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlBytes(texto: string): Uint8Array {
  const limpio = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(limpio + "=".repeat((4 - (limpio.length % 4)) % 4));
  const salida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) salida[i] = binario.charCodeAt(i);
  return salida;
}

/* --- HMAC y derivación, tal cual el RFC 8291 (pseudocódigo del apartado 3.4) ----------------------- */

const hmac = async (llave: Uint8Array, datos: Uint8Array): Promise<Uint8Array> => {
  const k = await crypto.subtle.importKey("raw", llave as unknown as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, datos as unknown as ArrayBuffer));
};

const juntar = (...pedazos: (Uint8Array | number[])[]): Uint8Array => {
  const partes = pedazos.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const total = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
};

/* --- Llaves VAPID ---------------------------------------------------------------------------------- */

/** Un par nuevo de llaves VAPID, en base64url como las guardamos en la base. */
export async function pushClaves(subject: string): Promise<PushClaves> {
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
  if (!jwk.d) throw new Error("La llave privada no salió.");
  return { public: b64url(publica), private: jwk.d, subject };
}

/** La llave pública de VAPID partida en x e y (para el JWK de la firma). */
const partir = (publica: string): { x: string; y: string } => {
  const bytes = b64urlBytes(publica);
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("La llave pública VAPID no sirve: se esperaba sin comprimir.");
  return { x: b64url(bytes.slice(1, 33)), y: b64url(bytes.slice(33, 65)) };
};

/** El JWT ES256 de VAPID (RFC 8292). */
export async function vapidJwt(claves: PushClaves, audiencia: string, ahora = Math.floor(Date.now() / 1000)): Promise<string> {
  const codificar = (obj: Record<string, unknown>) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const cabeza = codificar({ typ: "JWT", alg: "ES256" });
  const cuerpo = codificar({ aud: audiencia, exp: ahora + 12 * 3600, sub: claves.subject });
  const privada = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", ...partir(claves.public), d: claves.private },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const firma = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privada, new TextEncoder().encode(`${cabeza}.${cuerpo}`)));
  return `${cabeza}.${cuerpo}.${b64url(firma)}`;
}

/* --- El cuerpo cifrado (aes128gcm, RFC 8291) ------------------------------------------------------- */

/**
 * Cifra el mensaje como lo espera el navegador. Para las pruebas se pueden fijar
 * la sal y el par efímero del servidor (el RFC 8291 trae un ejemplo completo).
 */
export async function cifrarAes128gcm(
  destino: PushDestino,
  texto: string,
  fijar?: { salt?: Uint8Array; privada?: string; publica?: string },
): Promise<Uint8Array> {
  const uaPublica = b64urlBytes(destino.p256dh);
  if (uaPublica.length !== 65 || uaPublica[0] !== 4) throw new Error("La llave de la suscripción no sirve.");
  const autenticacion = b64urlBytes(destino.auth);
  const textoBytes = new TextEncoder().encode(texto);

  // La llave efímera del servidor de aplicación.
  let privada: CryptoKey;
  let asPublica: Uint8Array;
  if (fijar?.privada && fijar.publica) {
    asPublica = b64urlBytes(fijar.publica);
    privada = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: b64url(asPublica.slice(1, 33)), y: b64url(asPublica.slice(33, 65)), d: fijar.privada },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
  } else {
    const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    privada = par.privateKey;
    asPublica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  }

  // 1. El secreto compartido con la suscripción.
  const uaJwk = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64url(uaPublica.slice(1, 33)), y: b64url(uaPublica.slice(33, 65)) }, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaJwk }, privada, 256));

  // 2. Combinar con el secreto de autenticación (RFC 8291, 3.2).
  const prkLlave = await hmac(autenticacion, ecdh);
  const keyInfo = juntar(new TextEncoder().encode("WebPush: info"), [0], uaPublica, asPublica);
  const ikm = await hmac(prkLlave, juntar(keyInfo, [1]));

  // 3. El contenido (RFC 8188): una sal por mensaje.
  const salt = fijar?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, juntar(new TextEncoder().encode("Content-Encoding: aes128gcm"), [0], [1]))).slice(0, 16);
  const nonce = (await hmac(prk, juntar(new TextEncoder().encode("Content-Encoding: nonce"), [0], [1]))).slice(0, 12);

  // 4. Un solo registro: el texto y el delimitador final (0x02).
  const cekKey = await crypto.subtle.importKey("raw", cek as unknown as ArrayBuffer, { name: "AES-GCM", length: 128 }, false, ["encrypt"]);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as unknown as ArrayBuffer, tagLength: 128 }, cekKey, juntar(textoBytes, [2]) as unknown as ArrayBuffer),
  );

  // 5. El encabezado del cuerpo: sal ‖ tamaño del registro (4096) ‖ largo de la llave ‖ la llave efímera.
  const header = juntar(salt, [0x00, 0x00, 0x10, 0x00], [asPublica.length], asPublica);
  return juntar(header, cifrado);
}

/* --- El envío -------------------------------------------------------------------------------------- */

export interface PushResultado {
  ok: boolean;
  /** El endpoint respondió 404 o 410: la suscripción se murió, hay que borrarla. */
  gone?: boolean;
}

/** Despacha un aviso cifrado. Nunca lanza: un aviso que falla no debe tumbar lo demás. */
export async function pushEnviar(
  destino: PushDestino,
  mensaje: PushMensaje,
  claves: PushClaves,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResultado> {
  try {
    const cuerpo = await cifrarAes128gcm(destino, JSON.stringify(mensaje));
    const origen = new URL(destino.endpoint).origin;
    const jwt = await vapidJwt(claves, origen);
    const respuesta = await fetchImpl(destino.endpoint, {
      method: "POST",
      headers: {
        "TTL": String(mensaje.ttl ?? 60),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Urgency": "high",
        "Authorization": `vapid t=${jwt}, k=${claves.public}`,
      },
      body: cuerpo as unknown as BodyInit,
    });
    if (respuesta.status === 404 || respuesta.status === 410) return { ok: false, gone: true };
    return { ok: respuesta.status >= 200 && respuesta.status < 300 };
  } catch {
    return { ok: false };
  }
}

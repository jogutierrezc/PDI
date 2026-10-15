/* Prueba de la cuenta de servicio de Master desde el entorno real (contenedor edge-runtime).
   Login -> periodo abierto -> logout por sede. No imprime usuario, clave ni tokens. */
const ENV = (n: string) => Deno.env.get(n) ?? "";
const U = ENV("WAREHOUSE_MASTER_USER");
const P = ENV("WAREHOUSE_MASTER_PASSWORD");
if (!U || !P) { console.log("FALTAN_CREDENCIALES"); Deno.exit(1); }
const SEDES: Record<string, string> = { buc: "master-buc", cuc: "master-cuc", val: "master-val", bog: "master-bog" };
for (const [id, host] of Object.entries(SEDES)) {
  const base = `https://${host}.udes.edu.co:81`;
  try {
    const r = await fetch(`${base}/master/mod_auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({ login: U, password: P }),
      signal: AbortSignal.timeout(25_000),
    });
    const j: any = await r.json();
    const msg = j?.msg;
    const token = typeof msg === "object" ? msg.access_token : "";
    if (j?.code !== 200 || !token) {
      console.log(`${id}: LOGIN_RECHAZADO (http=${r.status} code=${j?.code} msg=${String(typeof msg === "string" ? msg : j?.code ? "objeto" : "")})`);
      continue;
    }
    const api = typeof msg === "object" ? (msg.api_key ?? "0") : "0";
    const p = await fetch(`${base}/master/mod_auth/current_period/?token=${encodeURIComponent(token)}&api_key=${encodeURIComponent(api)}`, { signal: AbortSignal.timeout(25_000) });
    const pj: any = await p.json();
    const periodo = pj?.msg?.period ?? "";
    console.log(`${id}: LOGIN_OK http=${r.status} periodo=${periodo || "SIN_PERIODO"}`);
    await fetch(`${base}/master/mod_auth/logout/?token=${encodeURIComponent(token)}&api_key=${encodeURIComponent(api)}`, { signal: AbortSignal.timeout(15_000) }).catch(() => {});
  } catch (e) {
    console.log(`${id}: ERROR ${e instanceof Error ? e.name : "desconocido"}`);
  }
}

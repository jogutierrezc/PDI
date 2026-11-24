// Servidor falso de Supabase para Playwright: intercepta toda la red hacia 127.0.0.1:54321
// y responde con los datos de fixtures.mjs. Nada de esto toca src/ ni una base real.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
  "access-control-expose-headers": "content-range,content-type",
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export const jwt = (sub) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", aud: "authenticated", exp: 4102444800, iat: 1760000000 })}.firma-ficticia`;

export function sesion(perfil) {
  const user = { id: perfil.id, aud: "authenticated", role: "authenticated", email: perfil.email, app_metadata: {}, user_metadata: {}, created_at: "2025-01-01T00:00:00Z" };
  return { access_token: jwt(perfil.id), refresh_token: "refresco-ficticio", token_type: "bearer", expires_in: 3153600000, expires_at: 4102444800, user };
}

/** Filtro PostgREST mínimo: eq, neq, in, is, gt/gte/lt/lte. El resto se ignora (los fixtures ya vienen acotados). */
function filtrar(filas, params) {
  let r = filas;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns", "or", "and"].includes(k)) continue;
    if (k.includes(".")) continue; // filtros de tablas embebidas
    const m = /^(not\.)?(eq|neq|in|is|gt|gte|lt|lte|like|ilike)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, no, op, val] = m;
    const pasa = (f) => {
      const x = f[k];
      let ok = true;
      if (op === "eq") ok = String(x) === val;
      else if (op === "neq") ok = String(x) !== val;
      else if (op === "in") ok = val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(x));
      else if (op === "is") ok = val === "null" ? x === null || x === undefined : String(x) === val;
      else if (op === "gt") ok = x > val; else if (op === "gte") ok = x >= val; else if (op === "lt") ok = x < val; else if (op === "lte") ok = x <= val;
      else ok = true;
      return no ? !ok : ok;
    };
    r = r.filter(pasa);
  }
  return r;
}

export async function instalarRed(context, fx, registro) {
  const sinSimular = registro.sinSimular;
  await context.route((u) => u.port === "54321", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const metodo = req.method();
    const dev = (status, cuerpo, extra = {}) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json", ...extra }, body: cuerpo === undefined ? "" : JSON.stringify(cuerpo) });
    if (metodo === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const ruta = url.pathname;

    if (ruta.startsWith("/auth/v1/")) {
      if (ruta.endsWith("/user")) return dev(200, sesion(fx.perfil).user);
      if (ruta.endsWith("/token")) return dev(200, sesion(fx.perfil));
      if (ruta.endsWith("/logout")) return dev(204);
      return dev(200, {});
    }
    if (ruta.startsWith("/rest/v1/rpc/")) {
      const nombre = ruta.split("/").pop();
      let args = {};
      try { args = JSON.parse(req.postData() || "{}"); } catch {}
      const f = fx.rpc[nombre];
      if (f === undefined) { sinSimular.add(`RPC ${nombre}`); return dev(404, { code: "PGRST202", message: `Could not find the function public.${nombre} in the schema cache`, details: null, hint: null }); }
      const res = typeof f === "function" ? f(args) : f;
      return dev(200, res === undefined ? null : res);
    }
    if (ruta.startsWith("/rest/v1/")) {
      const tabla = ruta.split("/").pop();
      const filas = fx.tablas[tabla];
      if (filas === undefined) { sinSimular.add(`${metodo} tabla ${tabla}`); return dev(404, { code: "PGRST205", message: `Could not find the table 'public.${tabla}' in the schema cache`, details: null, hint: null }); }
      if (metodo === "GET" || metodo === "HEAD") {
        const base = typeof filas === "function" ? filas(url.searchParams) : filas;
        const r = filtrar(base, url.searchParams);
        const acc = req.headers()["accept"] || "";
        const rango = { "content-range": `${r.length ? `0-${r.length - 1}` : "*"}/${r.length}` };
        if (metodo === "HEAD") return dev(200, undefined, rango);
        if (acc.includes("vnd.pgrst.object")) {
          if (r.length !== 1) return dev(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${r.length} rows`, hint: null });
          return dev(200, r[0]);
        }
        return dev(200, r, rango);
      }
      // Escrituras: se aceptan y no cambian nada (los manuales no necesitan guardar).
      return dev(201, []);
    }
    if (ruta.startsWith("/functions/v1/")) {
      const nombre = ruta.split("/").pop();
      let args = {};
      try { args = JSON.parse(req.postData() || "{}"); } catch {}
      const f = fx.funciones[nombre];
      if (f === undefined) { sinSimular.add(`FUNCION ${nombre}`); return dev(404, { error: "función no simulada" }); }
      return dev(200, typeof f === "function" ? f(args) : f);
    }
    if (ruta.startsWith("/storage/v1/")) {
      if (ruta.includes("/object/sign/")) return dev(200, { signedURL: ruta.replace("/object/sign/", "/object/") });
      if (/\/object\/(list|info)/.test(ruta)) return dev(200, []);
      sinSimular.add(`STORAGE ${metodo} ${ruta}`);
      return dev(404, { message: "Object not found" });
    }
    sinSimular.add(`OTRA ${metodo} ${ruta}`);
    return dev(404, { message: "no simulado" });
  });
}

/** Deja la sesión falsa en localStorage antes de que arranque la aplicación. */
export async function ponerSesion(context, perfil) {
  const clave = "sb-127-auth-token";
  const valor = JSON.stringify(sesion(perfil));
  await context.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); localStorage.setItem("informes:guia:banner", "1"); } catch {} }, [clave, valor]);
}

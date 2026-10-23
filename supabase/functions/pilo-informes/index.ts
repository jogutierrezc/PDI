/* =============================================================================
   Edge Function · pilo-informes

   Mr. Pilo como redactor y aprendiz del módulo «Informes Institucionales»
   (informes de gestión, migración 0153; contrato en src/modules/informes).
   La lógica pura está en redaccion.ts, corpus.ts y plantillas.ts, con pruebas
   en tests/informes/pilo-*.test.ts; todo el acceso a datos, en datos.ts; las
   llamadas al proveedor, en ia.ts.

   El proveedor de IA es el de los rankings (pilo-rankingsod/proveedor.ts):
   «pilo» = el de Mr. Pilo; «mistral» = Mistral con la clave que ya guarda
   Mr. Pilo. Las claves nunca salen de aquí. No gasta el cupo diario de
   /pregunta: la bitácora es news_runs (source «Pilo redacta informes de gestión»).

     estado   {}                                   → { ok, ai, motivo?, eleccion, proveedor, modelo, corpus }
     redactar { instancia_id, seccion_clave, instruccion? }
                                                   → { ok, texto, usadas, ejemplos_usados, avisos }
     mejorar  { texto, objetivo: claridad|sintesis|tono }
                                                   → { ok, texto, avisos }
     aprender { instancia_id }                     → { ok, nuevos, duplicados, secciones, aprendizaje }
     ingerir  { anio, plantilla?, archivos:[{ nombre, unidad?, secciones:[{ titulo, texto }] }] }
                                                   → { ok, nuevos, duplicados, descartados:[{ archivo, titulo, motivo }] }
     corpus   {}                                   → { ok, total, por_origen, por_plantilla, por_tipo, perfiles }
     udrive_redactar    { modo, tipo, texto?, instruccion?, contexto }   → { ok, texto?, items?, avisos }
     udrive_estructurar { tarea, items, archivo? }                       → { ok, niveles? | textos? | tablas? }
                         (UDrive, fase 3: ver udrive.ts; acceso por drive_entra, migración 0187)

   Reglas:
     · Solo con sesión. Planeación o la administración, todo; «aprender» e
       «ingerir», solo ellas. «redactar», también Gestor o Contribuyente de la
       unidad de la instancia (unit_role_at, con herencia); «mejorar», «estado»
       y «corpus», Gestor o Contribuyente de alguna unidad.
     · Pilo nunca escribe una cifra: todo número es un token [[clave]] de una
       cifra incluida de esa instancia. Lo que no puede saber queda como
       «[La unidad debe completar: …]». Si no pasa la verificación, un
       reintento con el error; si persiste, 422.
     · No redacta en un informe enviado o aprobado ni en una sección aprobada
       (409). Nunca guarda la sección, nunca envía ni aprueba: devuelve el texto
       y deja el borrador en informe_aprendizaje para compararlo con el final.
     · Solo lo aprobado entra al corpus; sin cifras (marcadores genéricos).
     · No se empieza otra llamada pasados 50 s; tope de 95 s por llamada. Un
       429 espera hasta 3 s y reintenta una vez; 401, 5xx o un segundo 429
       detienen con un mensaje claro.

   Despliegue:
     supabase functions deploy pilo-informes --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { elegirProveedor, leerAjustesIA } from "../pilo-rankingsod/proveedor.ts";
import { contarPalabras, elegirEjemplos, hashTexto, leerIngesta, MIN_PALABRAS, prepararIngesta, resumenCorpus, tokensAMarcadores, type FilaEjemplo } from "./corpus.ts";
import * as datos from "./datos.ts";
import { AltoProveedor, crearIA } from "./ia.ts";
import { atenderUdrive, esAccionUdrive } from "./udrive.ts";
import { esPlantilla, seccionDe, seccionesDe } from "./plantillas.ts";
import {
  ACCIONES,
  cifrasValidas,
  leerTexto,
  mensajesMejorar,
  mensajesRedactar,
  OBJETIVOS,
  puedeUsar,
  textoDeContenido,
  tokensDe,
  verificarMejora,
  verificarRedaccion,
  type Accion,
  type Objetivo,
} from "./redaccion.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const MIGRACION = { error: "Falta aplicar la migración 0153 (Informes Institucionales).", code: "migracion" };
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_TEXTO = 6000;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  if (!url || !serviceKey) return json({ error: "La función no está configurada." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const accionUdrive = esAccionUdrive(cuerpo.action) ? cuerpo.action : null;
  const accion = (ACCIONES as string[]).includes(String(cuerpo.action)) ? (String(cuerpo.action) as Accion) : null;
  if (!accion && !accionUdrive) return json({ error: "Acción desconocida." }, 400);

  // Quién llama ---------------------------------------------------------------------
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const who = await admin.auth.getUser(authorization.slice(7));
  if (who.error || !who.data.user) return json({ error: "Sesión inválida." }, 401);

  // Pilo en UDrive (udrive.ts): redactar y estructurar; su acceso es el de UDrive, no el de Informes.
  if (accionUdrive) return await atenderUdrive({ accion: accionUdrive, cuerpo, admin, url, anonKey, authorization, json });
  if (!accion) return json({ error: "Acción desconocida." }, 400);
  const { perfil, rolesUnidad } = await datos.leerPerfil(admin, who.data.user.id);

  const fallo = (e: unknown) => {
    const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return json(datos.faltaMigracion(e as { code?: string; message?: string }) ? MIGRACION : { error: m }, 500);
  };

  // La instancia (redactar, aprender) ------------------------------------------------
  let instancia: datos.Instancia | null = null;
  let rolEnUnidad: string | null = null;
  if (accion === "redactar" || accion === "aprender") {
    const id = String(cuerpo.instancia_id ?? "");
    if (!UUID.test(id)) return json({ error: "Falta el informe (instancia_id)." }, 400);
    try {
      instancia = await datos.leerInstancia(admin, id);
      if (!instancia) return json({ error: "No existe ese informe." }, 404);
      if (accion === "redactar" && !["planeacion", "admin"].includes(String(perfil?.role))) {
        const comoUsuario = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
        rolEnUnidad = await datos.rolEnUnidad(comoUsuario, instancia.unit_id);
      }
    } catch (e) {
      return fallo(e);
    }
  }
  if (!puedeUsar(accion, { perfil, rolEnUnidad, rolesUnidad })) {
    const msg =
      accion === "aprender" || accion === "ingerir"
        ? "Solo Planeación o la administración."
        : accion === "redactar"
          ? "Solo Planeación o quien diligencia este informe (Gestor o Contribuyente de la unidad)."
          : "Solo Planeación o quien diligencia un informe (Gestor o Contribuyente).";
    return json({ error: msg }, 403);
  }

  // El proveedor --------------------------------------------------------------------
  const prov = await datos.leerProveedor(admin);
  const destino = elegirProveedor(leerAjustesIA(prov.ajustes), prov.settings, prov.secret);
  const motivo = destino.ok ? null : destino.motivo ?? "La IA de Pilo no está lista.";
  const enUso = { eleccion: destino.eleccion, proveedor: destino.proveedor, modelo: destino.model };

  // Sin IA ----------------------------------------------------------------------------
  if (accion === "estado") {
    try {
      return json({ ok: true, ai: !motivo, ...(motivo ? { motivo } : {}), ...enUso, corpus: await datos.contarCorpus(admin) });
    } catch (e) {
      return fallo(e);
    }
  }

  if (accion === "corpus") {
    try {
      return json({ ok: true, ...resumenCorpus(await datos.leerCorpus(admin)) });
    } catch (e) {
      return fallo(e);
    }
  }

  if (accion === "ingerir") {
    const l = leerIngesta(cuerpo);
    if (!l.ok) return json({ error: l.error }, 400);
    try {
      const { filas, descartados, repetidas } = await prepararIngesta(l.anio, l.plantilla, l.archivos);
      const nuevos = await datos.insertarEjemplos(admin, filas);
      return json({ ok: true, nuevos, duplicados: repetidas + filas.length - nuevos, descartados, secciones: l.archivos.reduce((n, a) => n + a.secciones.length, 0) });
    } catch (e) {
      return fallo(e);
    }
  }

  if (accion === "aprender") {
    const inst = instancia!;
    if (inst.estado !== "ok") return json({ error: "Pilo solo aprende de informes aprobados.", code: "no_aprobado" }, 409);
    if (!esPlantilla(inst.plantilla)) return json({ error: `Plantilla desconocida: ${inst.plantilla}.` }, 400);
    try {
      const [secciones, cifras] = await Promise.all([datos.leerSecciones(admin, inst.id), datos.leerCifras(admin, inst.id)]);
      const etiquetas = new Map(cifras.map((c) => [c.clave, c.etiqueta]));
      const filas: FilaEjemplo[] = [];
      const vistos = new Set<string>();
      let repetidas = 0;
      let aprendizaje = 0;
      for (const s of secciones) {
        const def = seccionDe(inst.plantilla, s.clave);
        const original = textoDeContenido(s.contenido).trim();
        if (!def?.extension || !original) continue;
        aprendizaje += await datos.completarFinal(admin, inst.id, s.clave, original);
        const texto = tokensAMarcadores(original, etiquetas).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        if (contarPalabras(texto) < MIN_PALABRAS) continue;
        const hash = await hashTexto(texto);
        if (vistos.has(hash)) {
          repetidas++;
          continue;
        }
        vistos.add(hash);
        filas.push({ origen: "aprobado", anio: inst.anio, plantilla: inst.plantilla, seccion_tipo: def.tipo, unidad_nombre: inst.unidad, titulo: def.titulo, texto, hash, aprobado: true });
      }
      const nuevos = await datos.insertarEjemplos(admin, filas);
      return json({ ok: true, nuevos, duplicados: repetidas + filas.length - nuevos, secciones: filas.length, aprendizaje });
    } catch (e) {
      return fallo(e);
    }
  }

  // Con IA ----------------------------------------------------------------------------
  if (motivo) return json({ error: motivo, code: "sin_ia", ...enUso }, 503);
  const ia = crearIA(destino, prov.settings?.system_role === "user" && destino.eleccion === "pilo");
  const bitacora = (guardados: number, fallidos: number, error: string | null) => datos.bitacora(admin, { inicio: ia.inicio, llamadas: ia.llamadas(), guardados, fallidos, error });
  const alto = async (e: unknown) => {
    if (e instanceof AltoProveedor) {
      await bitacora(0, 1, e.message);
      return json({ error: e.message, code: e.code }, e.status);
    }
    await bitacora(0, 1, e instanceof Error ? e.message : String(e));
    return fallo(e);
  };

  if (accion === "mejorar") {
    const texto = typeof cuerpo.texto === "string" ? cuerpo.texto.replace(/\r\n?/g, "\n").trim() : "";
    const objetivo = String(cuerpo.objetivo) as Objetivo;
    if (!(OBJETIVOS as readonly string[]).includes(objetivo)) return json({ error: "El objetivo debe ser claridad, sintesis o tono." }, 400);
    if (contarPalabras(texto) < 5) return json({ error: "Falta el texto a mejorar." }, 400);
    if (texto.length > MAX_TEXTO) return json({ error: `El texto tiene ${texto.length} caracteres; el máximo es ${MAX_TEXTO}.` }, 400);
    try {
      const r = await ia.llamarVerificado(mensajesMejorar(texto, objetivo), 1800, (crudo) => {
        const l = leerTexto(crudo);
        if (!l.ok) return l;
        const v = verificarMejora(texto, l.valor, objetivo);
        return v.ok ? { ok: true, valor: { texto: l.valor, avisos: v.avisos } } : v;
      });
      if (!r.ok) {
        await bitacora(0, 1, r.error);
        return json({ error: `Pilo no logró una versión que conserve las cifras y los hechos: ${r.error}`, code: "verificacion" }, 422);
      }
      await bitacora(1, 0, null);
      return json({ ok: true, ...r.valor });
    } catch (e) {
      return alto(e);
    }
  }

  // redactar
  const inst = instancia!;
  const clave = String(cuerpo.seccion_clave ?? "");
  if (!esPlantilla(inst.plantilla)) return json({ error: `Plantilla desconocida: ${inst.plantilla}.` }, 400);
  const def = seccionDe(inst.plantilla, clave);
  if (!def) return json({ error: `La plantilla ${inst.plantilla} no tiene la sección ${clave || "(vacía)"}.` }, 404);
  if (!def.extension) return json({ error: `«${def.titulo}» es una lista: Pilo no la redacta.` }, 400);
  if (inst.estado === "sent" || inst.estado === "ok") return json({ error: inst.estado === "ok" ? "El informe está aprobado: Pilo no lo reescribe." : "El informe está enviado: Pilo no lo reescribe.", code: "cerrado" }, 409);
  const instruccion = typeof cuerpo.instruccion === "string" ? cuerpo.instruccion.trim().slice(0, 600) : "";
  try {
    if ((await datos.decisionDeSeccion(admin, inst.id, clave)) === "aprobado") return json({ error: "Planeación ya aprobó esta sección: Pilo no la reescribe.", code: "aprobada" }, 409);
    const [secciones, todasCifras, filasEjemplos] = await Promise.all([datos.leerSecciones(admin, inst.id), datos.leerCifras(admin, inst.id), datos.leerEjemplos(admin, def.tipo)]);
    const cifras = cifrasValidas(todasCifras);
    const actual = textoDeContenido(secciones.find((s) => s.clave === clave)?.contenido);
    const titulos = new Map(seccionesDe(inst.plantilla).map((s) => [s.clave, s.titulo]));
    const otras = ["resumen", "conclusiones", "presentacion"].includes(def.tipo)
      ? secciones
          .filter((s) => s.clave !== clave)
          .map((s) => ({ titulo: titulos.get(s.clave) ?? s.clave, texto: textoDeContenido(s.contenido).trim() }))
          .filter((s) => s.texto)
      : [];
    const { ejemplos, otrasPlantillas } = elegirEjemplos(filasEjemplos, {
      plantilla: inst.plantilla,
      tipo: def.tipo,
      consulta: [inst.unidad, def.titulo, instruccion, ...cifras.map((c) => c.etiqueta)].join(" "),
    });
    const contexto = [instruccion, actual, ...otras.map((o) => o.texto), ...cifras.flatMap((c) => [c.etiqueta, c.justificacion ?? "", c.fuente_nombre ?? ""])].join("\n");
    const reglas = { claves: cifras.map((c) => c.clave), anio: inst.anio, extension: def.extension, ejemplos: ejemplos.map((e) => e.texto), contexto };
    const r = await ia.llamarVerificado(
      mensajesRedactar({ unidad: inst.unidad, plantilla: inst.plantilla, anio: inst.anio, seccion: { ...def, extension: def.extension }, cifras, ejemplos, instruccion, actual, otras }),
      1800,
      (crudo) => {
        const l = leerTexto(crudo);
        if (!l.ok) return l;
        const v = verificarRedaccion(l.valor, reglas);
        return v.ok ? { ok: true, valor: { texto: l.valor, avisos: v.avisos } } : v;
      },
    );
    if (!r.ok) {
      await bitacora(0, 1, r.error);
      return json({ error: `Pilo no logró un borrador que cumpla las reglas: ${r.error}`, code: "verificacion" }, 422);
    }
    await datos.guardarBorrador(admin, inst.id, clave, r.valor.texto);
    await bitacora(1, 0, null);
    const usadas = [...new Set(tokensDe(r.valor.texto))].map((k) => ({ clave: k, etiqueta: cifras.find((c) => c.clave === k)?.etiqueta ?? k }));
    const avisos = [...r.valor.avisos];
    if (!ejemplos.length) avisos.push("Aún no hay ejemplos aprobados de este tipo de sección: Pilo escribió sin guía de estilo.");
    else if (otrasPlantillas) avisos.push("Faltan ejemplos de esta plantilla: Pilo usó también ejemplos de otras plantillas.");
    return json({
      ok: true,
      texto: r.valor.texto,
      usadas,
      ejemplos_usados: ejemplos.map((e) => ({ origen: e.origen, anio: e.anio, plantilla: e.plantilla, unidad_nombre: e.unidad_nombre, titulo: e.titulo })),
      avisos,
    });
  } catch (e) {
    return alto(e);
  }
});

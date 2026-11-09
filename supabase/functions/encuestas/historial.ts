/* =============================================================================
   Encuestas con Pilo · «Mis envíos» (función `encuestas`).

   Lo que una persona ya envió con su correo confirmado por Microsoft, de las dos
   formas de enviar: los aportes con cifras (enc_aportes) y las respuestas del
   editor (enc_respuestas). Todo sale de las tablas que ya existen; no pide
   migración. El correo viene del pase firmado, nunca del cuerpo, así que nadie
   ve lo de otra persona.

     mis_envios    { slug, pase, alcance: "esta" | "todas" } → { envios }
     quitar_envio  { slug, pase, origen, id }                → { ok }
                   Solo mientras siga «recibido»: va a la papelera con su rastro.
   ========================================================================== */

import type { Estructura, Pregunta } from "./estructura.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export type Origen = "aporte" | "respuesta";
export type TipoEnvio = "logro" | "reto" | "respuesta";

export interface CifraHist {
  que: string;
  valor: number;
  unidad: string;
}
export interface ItemHist {
  tipo: "logro" | "reto";
  titulo: string;
  descripcion: string;
  cifras: CifraHist[];
}
export interface EnvioHist {
  id: string;
  origen: Origen;
  encuesta: { slug: string; titulo: string };
  creado: string;
  /** 1 recibido, 2 revisado, 3 elegido para el video. Rechazado y descartado cuentan como revisado. */
  etapa: 1 | 2 | 3;
  quitable: boolean;
  tipos: TipoEnvio[];
  titulo: string;
  items: ItemHist[];
  lineas: { etiqueta: string; texto: string }[];
  /** Para «Enviar uno parecido»: solo los aportes con cifras. */
  copiable: { tipo: "logro" | "reto"; titulo: string; descripcion: string; cifras: { que: string; tipo: string; otro?: string; valor: number }[] } | null;
}

const MAX_ENVIOS = 200;
const MAX_TEXTO = 600;
const MAX_LINEAS = 40;

export const etapaDe = (estado: string): 1 | 2 | 3 => (estado === "recibido" ? 1 : estado === "para_video" ? 3 : 2);

const UNIDAD: Record<string, string> = { estudiantes: "estudiantes", programas: "programas", porcentaje: "%", dinero: "$" };
const unidadDe = (tipo: string, otro: unknown): string => (tipo === "otro" ? String(otro ?? "") : (UNIDAD[tipo] ?? ""));

const recortar = (t: string): string => (t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO - 1)}…` : t);

function textoDe(p: Pregunta, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.map((x) => p.opciones?.find((o) => o.id === x)?.texto ?? (typeof x === "string" ? x : "")).filter(Boolean).join(", ");
  if (typeof v === "object") return String((v as { nombre?: unknown }).nombre ?? "");
  return p.opciones?.find((o) => o.id === v)?.texto ?? String(v);
}

function itemsDe(v: unknown): ItemHist[] {
  if (!Array.isArray(v)) return [];
  const salida: ItemHist[] = [];
  for (const x of v as Record<string, unknown>[]) {
    if (!x || typeof x !== "object") continue;
    const tipo = x.tipo === "reto" ? "reto" : "logro";
    const cifras = (Array.isArray(x.cifras) ? (x.cifras as Record<string, unknown>[]) : []).map((c) => ({ que: String(c.que ?? ""), valor: Number(c.valor ?? 0), unidad: unidadDe(String(c.tipo ?? ""), c.otro) }));
    salida.push({ tipo, titulo: recortar(String(x.titulo ?? "")), descripcion: recortar(String(x.descripcion ?? "")), cifras });
  }
  return salida;
}

export async function leerEnvios(admin: Admin, slug: string, correo: string, alcance: "esta" | "todas"): Promise<EnvioHist[] | { error: string }> {
  const esta = await admin.from("enc_encuestas").select("id").eq("slug", slug).maybeSingle();
  if (esta.error) return { error: esta.error.message as string };
  if (!esta.data) return { error: "Esta encuesta no existe." };
  const idEsta = esta.data.id as string;

  let qa = admin
    .from("enc_aportes")
    .select("id, encuesta_id, tipo, titulo, descripcion, estado, created_at, enc_cifras(que, tipo, otro, valor, orden)")
    .eq("correo", correo)
    .eq("correo_verificado", true)
    .is("borrado_en", null)
    .order("created_at", { ascending: false })
    .limit(MAX_ENVIOS);
  let qr = admin
    .from("enc_respuestas")
    .select("id, encuesta_id, version_id, estado, created_at, enc_valores(pregunta_id, valor)")
    .eq("correo", correo)
    .eq("correo_verificado", true)
    .is("borrado_en", null)
    .order("created_at", { ascending: false })
    .limit(MAX_ENVIOS);
  if (alcance === "esta") {
    qa = qa.eq("encuesta_id", idEsta);
    qr = qr.eq("encuesta_id", idEsta);
  }
  const [ra, rr] = await Promise.all([qa, qr]);
  if (ra.error) return { error: ra.error.message as string };
  if (rr.error) return { error: rr.error.message as string };

  const aportes = (ra.data ?? []) as Record<string, unknown>[];
  const respuestas = (rr.data ?? []) as Record<string, unknown>[];

  const idsEncuesta = [...new Set([...aportes, ...respuestas].map((f) => String(f.encuesta_id)))];
  const idsVersion = [...new Set(respuestas.map((f) => f.version_id).filter(Boolean).map(String))];
  const [re, rv] = await Promise.all([
    idsEncuesta.length ? admin.from("enc_encuestas").select("id, slug, titulo").in("id", idsEncuesta) : Promise.resolve({ data: [], error: null }),
    idsVersion.length ? admin.from("enc_versiones").select("id, estructura").in("id", idsVersion) : Promise.resolve({ data: [], error: null }),
  ]);
  if (re.error) return { error: re.error.message as string };
  if (rv.error) return { error: rv.error.message as string };
  const encuestas = new Map<string, { slug: string; titulo: string }>(((re.data ?? []) as { id: string; slug: string; titulo: string }[]).map((e) => [e.id, { slug: e.slug, titulo: e.titulo }]));
  const versiones = new Map<string, Estructura>(((rv.data ?? []) as { id: string; estructura: Estructura }[]).map((v) => [v.id, v.estructura]));

  const envios: EnvioHist[] = [];

  for (const a of aportes) {
    const tipo = a.tipo === "reto" ? "reto" : "logro";
    const cifras = ((a.enc_cifras ?? []) as Record<string, unknown>[]).slice().sort((x, y) => Number(x.orden ?? 0) - Number(y.orden ?? 0));
    envios.push({
      id: String(a.id),
      origen: "aporte",
      encuesta: encuestas.get(String(a.encuesta_id)) ?? { slug: "", titulo: "" },
      creado: String(a.created_at),
      etapa: etapaDe(String(a.estado)),
      quitable: a.estado === "recibido",
      tipos: [tipo],
      titulo: String(a.titulo),
      items: [{ tipo, titulo: String(a.titulo), descripcion: String(a.descripcion), cifras: cifras.map((c) => ({ que: String(c.que), valor: Number(c.valor), unidad: unidadDe(String(c.tipo), c.otro) })) }],
      lineas: [],
      copiable: { tipo, titulo: String(a.titulo), descripcion: String(a.descripcion), cifras: cifras.map((c) => ({ que: String(c.que), tipo: String(c.tipo), ...(c.otro ? { otro: String(c.otro) } : {}), valor: Number(c.valor) })) },
    });
  }

  for (const r of respuestas) {
    const estructura = versiones.get(String(r.version_id));
    const valores = new Map<string, unknown>(((r.enc_valores ?? []) as { pregunta_id: string; valor: unknown }[]).map((v) => [v.pregunta_id, v.valor]));
    const items: ItemHist[] = [];
    const lineas: { etiqueta: string; texto: string }[] = [];
    for (const s of estructura?.secciones ?? []) {
      for (const p of s.preguntas) {
        const v = valores.get(p.id);
        if (p.tipo === "bloque_logro_reto") {
          items.push(...itemsDe(v));
        } else {
          const t = recortar(textoDe(p, v));
          if (t && lineas.length < MAX_LINEAS) lineas.push({ etiqueta: p.enunciado, texto: t });
        }
      }
    }
    const enc = encuestas.get(String(r.encuesta_id)) ?? { slug: "", titulo: "" };
    const tipos = [...new Set(items.map((i) => i.tipo))] as TipoEnvio[];
    envios.push({
      id: String(r.id),
      origen: "respuesta",
      encuesta: enc,
      creado: String(r.created_at),
      etapa: etapaDe(String(r.estado)),
      quitable: r.estado === "recibido",
      tipos: tipos.length ? tipos : ["respuesta"],
      titulo: items.length === 1 ? items[0].titulo : items.length > 1 ? `${items.length} aportes en ${enc.titulo}` : `Respuesta a ${enc.titulo}`,
      items,
      lineas,
      copiable: null,
    });
  }

  envios.sort((x, y) => (x.creado < y.creado ? 1 : -1));
  return envios.slice(0, MAX_ENVIOS);
}

/** Quita un envío de la persona mientras siga «recibido». Devuelve null si salió bien o { estado, error, code }. */
export async function quitarEnvio(admin: Admin, correo: string, origen: Origen, id: string): Promise<null | { estado: number; error: string; code?: string }> {
  const tabla = origen === "aporte" ? "enc_aportes" : "enc_respuestas";
  const f = await admin.from(tabla).select("id, encuesta_id, correo, correo_verificado, estado, borrado_en").eq("id", id).maybeSingle();
  if (f.error) return { estado: 500, error: "No se pudo quitar. Intente de nuevo." };
  const fila = f.data as { id: string; encuesta_id: string; correo: string | null; correo_verificado: boolean; estado: string; borrado_en: string | null } | null;
  if (!fila || fila.borrado_en || (fila.correo ?? "").toLowerCase() !== correo || !fila.correo_verificado) return { estado: 404, error: "No encuentro ese envío." };
  if (fila.estado !== "recibido") return { estado: 409, error: "Ya lo revisaron, ya no se puede quitar.", code: "revisado" };

  const u = await admin
    .from(tabla)
    .update({ borrado_en: new Date().toISOString(), borrado_motivo: "Lo retiró quien lo envió" })
    .eq("id", id)
    .eq("estado", "recibido")
    .is("borrado_en", null)
    .select("id");
  if (u.error) return { estado: 500, error: "No se pudo quitar. Intente de nuevo." };
  if (!(u.data ?? []).length) return { estado: 409, error: "Ya lo revisaron, ya no se puede quitar.", code: "revisado" };

  await admin.from("enc_bitacora").insert({ encuesta_id: fila.encuesta_id, aporte_id: id, accion: "retirado_por_autor", detalle: { origen } });
  return null;
}

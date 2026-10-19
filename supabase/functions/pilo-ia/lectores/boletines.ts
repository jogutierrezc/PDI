/* =============================================================================
   Mr. Pilo · capa profunda · Boletines de UDES en Cifras (0173).

   Lee DIRECTO de od_bulletins (las plantillas publicadas del periodo vigente) y
   de od_bulletin_editions (los PDF emitidos), y arma por cada boletín:
     · su presentación y su contraportada, el formato, el corte y la sede;
     · sus capítulos: cada informe incluido, con los indicadores y conjuntos que
       cita (nombres, tal como los ve el lector) y, en el formato «Análisis de
       los datos», lo que Mr. Pilo escribió de ese capítulo: resumen, párrafos,
       alertas y recomendaciones, y el cierre;
     · cada edición en PDF con su periodo, su corte y su enlace.
   Lo que Pilo escribió en un análisis ya pasó por la revisión de cifras del
   boletín; aquí solo se copia lo publicado, nunca los números que no pasaron
   (`unknown`). Sin dinero.
   ========================================================================== */

import { cerrar, esDinero, esObjeto, frase, leidoEl, limpio, lista, normal, numero, traer, trocear, unir } from "./comun.ts";
import type { Contexto, Fila, Lector, Parte, Pasaje } from "./comun.ts";

const OFICINA = "Oficina de Planeación Institucional";
const RUTA = "/datos-abiertos/boletines";
const BUCKET = "boletines";

const FORMATO: Record<string, string> = { completo: "boletín completo", ejecutivo: "boletín ejecutivo", analisis: "análisis de los datos escrito por Mr. Pilo" };

interface Capitulo {
  summary?: unknown;
  paragraphs?: unknown;
  alerts?: unknown;
  recommendations?: unknown;
}

const textos = (v: unknown, max = 12): string[] => lista<unknown>(v).map(frase).filter(Boolean).slice(0, max);

function capitulo(c: unknown): string {
  if (!esObjeto(c)) return "";
  const x = c as Capitulo;
  const alertas = textos(x.alerts, 6);
  const recomendaciones = textos(x.recommendations, 8);
  return [
    frase(x.summary),
    textos(x.paragraphs).join(" "),
    alertas.length ? `Alertas: ${alertas.join(" ")}` : "",
    recomendaciones.length ? `Recomendaciones: ${recomendaciones.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function vigente(ctx: Contexto): Promise<{ periodo: Fila; informes: Map<string, Fila> } | null> {
  const periodos = await traer(ctx, "od_periods", { filtrar: (q) => q.eq("is_current", true).eq("status", "publicado") });
  const periodo = periodos[0];
  if (!periodo) return null;
  const informes = await traer(ctx, "od_reports", { filtrar: (q) => q.eq("period_id", String(periodo.id)).eq("status", "publicado") });
  return { periodo, informes: new Map(informes.map((r) => [limpio(r.slug), r])) };
}

async function plantillas(ctx: Contexto, periodo: Fila): Promise<Fila[]> {
  return traer(ctx, "od_bulletins", { filtrar: (q) => q.eq("period_id", String(periodo.id)).eq("status", "publicado") });
}

function pasajesBoletin(b: Fila, periodo: Fila, informes: Map<string, Fila>, ediciones: Fila[], ctx: Contexto): Pasaje[] {
  const slug = limpio(b.slug);
  const titulo = limpio(b.title) || "Boletín UDES en Cifras";
  if (!slug || esDinero(titulo)) return [];
  const s = esObjeto(b.settings) ? b.settings : {};
  const textosB = esObjeto(s.texts) ? s.texts : {};
  const formato = limpio(s.format) || "completo";
  const ruta = `${RUTA}/${slug}`;
  const corteNum = numero(s.cut);
  const corte = corteNum && corteNum > 0 ? String(corteNum) : limpio(periodo.label);
  const sede = limpio(s.campus);
  const out: Partial<Pasaje>[] = [];

  const presentacion = [limpio(textosB.coverTitle), frase(textosB.coverSubtitle), frase(textosB.presentation), frase(textosB.backNote)].filter(Boolean).join(" ");
  out.push({
    ref: `prof:boletines:${slug}`,
    title: titulo,
    section: "Boletín en línea",
    body: [`${titulo} es un ${FORMATO[formato] ?? "boletín"} de UDES en Cifras del periodo ${limpio(periodo.label)}, con corte ${corte}${sede && sede !== "todos" ? ` (sede ${sede})` : ""}.`, presentacion, `Se lee en línea y se imprime. Datos leídos el ${leidoEl(ctx.ahora)}.`]
      .filter(Boolean)
      .join(" "),
    path: ruta,
    cut: corte,
    office: limpio(textosB.coverOffice) || OFICINA,
  });

  // Capítulos: un informe incluido por capítulo, con lo que cita y, en el análisis, lo que escribió Pilo.
  const analisis = esObjeto(s.analysis) ? s.analysis : {};
  const escritos = esObjeto(analisis.chapters) ? analisis.chapters : {};
  const reportes = lista<Fila>(s.reports).filter((r) => r.include !== false && r.removed !== true);
  for (const r of reportes) {
    const rslug = limpio(r.slug);
    const informe = informes.get(rslug);
    if (!rslug || !informe || esDinero(informe.name)) continue;
    const indicadores = lista<Fila>(r.indicators).filter((i) => i.include !== false).map((i) => limpio(i.id)).filter(Boolean);
    const conjuntos = lista<Fila>(r.datasets).filter((d) => d.include !== false).map((d) => limpio(d.ref).replace(/^[a-z]+:/, "")).filter(Boolean);
    const escrito = capitulo(escritos[rslug]);
    const cabecera = `Capítulo «${limpio(informe.name)}» del ${titulo}. ${frase(informe.summary)}`;
    const lineas = [
      indicadores.length ? `Cita los indicadores: ${unir(indicadores, 24)}.` : "",
      conjuntos.length ? `Y los conjuntos: ${unir(conjuntos, 16)}.` : "",
      escrito ? `Lo que dice el análisis: ${escrito}` : "",
    ].filter(Boolean);
    if (!lineas.length) continue;
    trocear(cabecera, lineas).forEach((cuerpo, i) =>
      out.push({ ref: `prof:boletines:${slug}:cap:${rslug}${i ? `:${i + 1}` : ""}`, title: `${titulo} · ${limpio(informe.name)}`, section: "Capítulo del boletín", body: cuerpo, path: ruta, cut: corte, office: OFICINA }),
    );
  }
  const cierre = capitulo(analisis.closing);
  if (cierre) {
    trocear(`Cierre del ${titulo}.`, [cierre]).forEach((cuerpo, i) =>
      out.push({ ref: `prof:boletines:${slug}:cierre${i ? `:${i + 1}` : ""}`, title: `${titulo} · cierre`, section: "Análisis de los datos", body: cuerpo, path: ruta, cut: corte, office: OFICINA }),
    );
  }

  // Sus ediciones en PDF.
  for (const e of ediciones.filter((x) => String(x.bulletin_id) === String(b.id) && x.status !== "retirado")) {
    const id = limpio(e.id);
    const archivo = limpio(e.file_path);
    if (!id || !archivo) continue;
    out.push({
      ref: `prof:boletines:${slug}:edicion:${id}`,
      title: limpio(e.title) || titulo,
      section: "Edición en PDF",
      body: [`${limpio(e.title) || titulo}, edición en PDF${limpio(e.period_label) ? ` del periodo ${limpio(e.period_label)}` : ""}.`, limpio(e.cut_label) ? `Corte: ${limpio(e.cut_label)}.` : "", frase(e.note), "Es un archivo emitido: no cambia aunque cambien las cifras después."]
        .filter(Boolean)
        .join(" "),
      path: ctx.urlBase ? `${ctx.urlBase.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET}/${archivo}` : ruta,
      cut: limpio(e.cut_label) || limpio(e.period_label),
      office: OFICINA,
    });
  }
  return cerrar(out);
}

export const lectorBoletines: Lector = {
  id: "boletines",
  nombre: "Boletines",
  alias: ["boletin", "boletines", "boletin de udes en cifras"],
  conSesion: false,
  async partes(ctx) {
    const v = await vigente(ctx);
    if (!v) return [];
    return (await plantillas(ctx, v.periodo))
      .filter((b) => limpio(b.slug) && limpio(b.title))
      .map((b) => ({ id: limpio(b.slug), etiqueta: limpio(b.title), alias: [normal(b.title), `boletin ${normal(b.slug).replace(/ /g, " ")}`] }));
  },
  async leer(ctx: Contexto, parte: Parte) {
    const v = await vigente(ctx);
    if (!v) return [];
    const plantilla = (await plantillas(ctx, v.periodo)).find((b) => limpio(b.slug) === parte.id);
    if (!plantilla) return [];
    const ediciones = await traer(ctx, "od_bulletin_editions", { filtrar: (q) => q.eq("bulletin_id", String(plantilla.id)).eq("status", "publicado") });
    return pasajesBoletin(plantilla, v.periodo, v.informes, ediciones, ctx);
  },
};

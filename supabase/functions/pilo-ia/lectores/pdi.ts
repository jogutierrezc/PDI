/* =============================================================================
   Mr. Pilo · capa profunda · Plan de Desarrollo Institucional (0173).

   Lee DIRECTO de la base la cascada completa del plan, solo de los pilares
   publicados: pilar › área estratégica › línea de acción › proyecto ›
   actividad. Por cada nivel: su avance (el de la cascada del portal, con su
   serie por año), su meta y lo logrado cuando están capturados, sus
   responsables públicos (las dependencias que firma el portal), sus fechas y
   a qué ODS aporta. Cada proyecto dice su cadena completa («Pilar 2 › Área ›
   Línea › Proyecto»), así una pregunta por una línea encuentra sus proyectos.

   Sin dinero: ni el presupuesto de proyectos ni de pilares entran (regla del
   producto). Sin datos personales: el responsable es el que el portal publica.
   La parte «__portal__» describe el plan entero; las demás son un pilar cada una.
   ========================================================================== */

import { agrupar, cerrar, esDinero, fecha, frase, leidoEl, limpio, lista, normal, numero, suelto, traer, trocear, unir } from "./comun.ts";
import type { Contexto, Fila, Lector, Parte, Pasaje } from "./comun.ts";

const RUTA = "/implementacion";
const PLAN = "Plan de Desarrollo Institucional 2024-2028";
export const PORTAL = "__portal__";

const pct = (v: unknown) => {
  const n = numero(v);
  return n === null ? "" : `${suelto(Math.round(n * 10) / 10)} %`;
};
const ESTADO: Record<string, string> = { done: "cumplida", active: "en curso", pending: "pendiente", risk: "en riesgo", cumplida: "cumplida", en_curso: "en curso", pendiente: "pendiente", en_riesgo: "en riesgo" };

/** Las metas y lo logrado de un nivel, si se capturaron. */
function meta(f: Fila): string {
  const m = numero(f.target_value);
  const l = numero(f.achieved_value);
  const u = limpio(f.measure_unit);
  if (esDinero(u)) return "";
  if (m === null && l === null) return "";
  return [m !== null ? `Meta: ${suelto(m)}${u ? ` ${u}` : ""}.` : "", l !== null ? `Logrado: ${suelto(l)}${u ? ` ${u}` : ""}.` : ""].filter(Boolean).join(" ");
}

interface Plan {
  pilares: Fila[];
  avancePilar: Map<string, Fila>;
  areas: Fila[];
  avanceArea: Map<string, Fila>;
  lineas: Fila[];
  proyectos: Fila[];
  enlaces: Fila[];
  avanceProyecto: Map<string, Fila>;
  porAnio: Map<string, Fila[]>;
  actividades: Fila[];
  metas: Map<string, Fila[]>;
}

const cache = new WeakMap<Contexto, Promise<Plan>>();

const sinTabla = (e: Error) => (/does not exist|could not find|schema cache/i.test(e.message) ? ([] as Fila[]) : Promise.reject(e));

async function leerPlan(ctx: Contexto): Promise<Plan> {
  const pilares = (await traer(ctx, "pillars", { filtrar: (q) => q.eq("status", "publicado") })).sort((a, b) => (numero(a.position) ?? 0) - (numero(b.position) ?? 0));
  const ids = new Set(pilares.map((p) => String(p.id)));
  const delPlan = (filas: Fila[]) => filas.filter((f) => ids.has(String(f.pillar_id)));
  const [avanceP, areas, avanceA, lineasV, proyectosV, avanceProy, anios, actividades, enlaces] = await Promise.all([
    traer(ctx, "v_pillar_progress", { clave: null, orden: "pillar_id" }).catch(sinTabla),
    traer(ctx, "strategic_areas").catch(sinTabla),
    traer(ctx, "v_area_progress", { clave: null, orden: "area_id" }).catch(sinTabla),
    traer(ctx, "v_action_lines", { clave: null, orden: "id" }).catch(sinTabla),
    traer(ctx, "projects").catch(sinTabla),
    traer(ctx, "v_project_progress", { clave: null, orden: "project_id" }).catch(sinTabla),
    traer(ctx, "v_year_progress", { clave: null, orden: "entity_id" }).catch(sinTabla),
    traer(ctx, "activities").catch(sinTabla),
    traer(ctx, "project_links").catch(sinTabla),
  ]);
  const actividadesPlan = delPlan(actividades);
  const metas = await traer(ctx, "activity_targets", { clave: null, orden: "activity_id" }).catch(sinTabla);
  const porActividad = agrupar(metas, "activity_id");
  return {
    pilares,
    avancePilar: new Map(avanceP.map((r) => [String(r.pillar_id), r])),
    areas: delPlan(areas).sort((a, b) => (numero(a.position) ?? 0) - (numero(b.position) ?? 0)),
    avanceArea: new Map(avanceA.map((r) => [String(r.area_id), r])),
    lineas: delPlan(lineasV).sort((a, b) => (numero(a.position) ?? 0) - (numero(b.position) ?? 0)),
    proyectos: delPlan(proyectosV).sort((a, b) => (numero(a.position) ?? 0) - (numero(b.position) ?? 0)),
    enlaces: delPlan(enlaces),
    avanceProyecto: new Map(avanceProy.map((r) => [String(r.project_id), r])),
    porAnio: agrupar(delPlan(anios), "entity_id"),
    actividades: actividadesPlan,
    metas: porActividad,
  };
}

function plan(ctx: Contexto): Promise<Plan> {
  let p = cache.get(ctx);
  if (!p) {
    p = leerPlan(ctx);
    cache.set(ctx, p);
  }
  return p;
}

const etiquetaPilar = (p: Fila) => (limpio(p.numeral) ? `Pilar ${limpio(p.numeral)} · ${limpio(p.name)}` : `Pilar ${limpio(p.name)}`);

/** El avance por año de un nivel: «2024: 12 %; 2025: 30 %». */
function serieAnual(plan_: Plan, id: string): string {
  const filas = (plan_.porAnio.get(id) ?? []).map((r) => ({ y: numero(r.year), v: numero(r.progress) })).filter((r): r is { y: number; v: number } => r.y !== null && r.v !== null);
  if (!filas.length) return "";
  return `Avance por año: ${filas.sort((a, b) => a.y - b.y).map((r) => `${r.y}: ${suelto(Math.round(r.v * 10) / 10)} %`).join("; ")}.`;
}

function pasajesPilar(pl: Plan, pilar: Fila, ctx: Contexto): Pasaje[] {
  const pid = String(pilar.id);
  const slug = limpio(pilar.slug);
  if (!slug || !limpio(pilar.name) || esDinero(pilar.name)) return [];
  const ruta = `${RUTA}/pilar/${slug}`;
  const nombre = etiquetaPilar(pilar);
  const out: Partial<Pasaje>[] = [];
  const avance = pl.avancePilar.get(pid);
  const conteo = avance
    ? ["done", "active", "pending", "risk"].map((k) => (numero(avance[k]) ? `${numero(avance[k])} ${ESTADO[k]}${numero(avance[k]) === 1 ? "" : "s"}` : "")).filter(Boolean)
    : [];
  const areas = pl.areas.filter((a) => String(a.pillar_id) === pid);
  out.push({
    ref: `prof:pdi:${slug}`,
    title: nombre,
    section: PLAN,
    body: [
      pct(avance?.progress) ? `El ${nombre} lleva un avance de ${pct(avance?.progress)}.` : `El ${nombre} todavía no tiene avance reportado.`,
      serieAnual(pl, pid),
      conteo.length && numero(avance?.total) ? `De sus ${numero(avance?.total)} indicadores: ${conteo.join(", ")}.` : "",
      frase(pilar.description),
      limpio(pilar.focus) ? `Se enfoca en: ${frase(pilar.focus)}` : "",
      limpio(pilar.impulsor) ? `Impulsor: ${frase(pilar.impulsor)}` : "",
      limpio(pilar.contributes) ? `Aporta a: ${frase(pilar.contributes)}` : "",
      limpio(pilar.management_owner) ? `Lo gestiona ${frase(pilar.management_owner)}` : "",
      limpio(pilar.insight) ? `Lectura de Planeación: ${frase(pilar.insight)}` : "",
      areas.length ? `Áreas estratégicas: ${unir(areas.map((a) => `${limpio(a.code) ? `${limpio(a.code)} ` : ""}${limpio(a.name)}`), 12)}.` : "",
      `Leído el ${leidoEl(ctx.ahora)}.`,
    ]
      .filter(Boolean)
      .join(" "),
    path: ruta,
    cut: String(ctx.ahora.getUTCFullYear()),
    office: limpio(pilar.management_owner),
  });

  for (const area of areas) {
    const aid = String(area.id);
    const lineas = pl.lineas.filter((l) => String(l.area_id) === aid);
    const av = pl.avanceArea.get(aid);
    const nombreArea = `${limpio(area.code) ? `${limpio(area.code)} ` : ""}${limpio(area.name)}`;
    const cuerpos = trocear(
      [
        `Área estratégica ${nombreArea}, del ${nombre}.`,
        pct(av?.progress) ? `Lleva un avance de ${pct(av?.progress)}.` : "Todavía no tiene avance reportado.",
        serieAnual(pl, aid),
        meta(area),
        frase(area.description),
      ]
        .filter(Boolean)
        .join(" "),
      lineas.map((l) => `Línea ${limpio(l.code) ? `${limpio(l.code)} ` : ""}${limpio(l.name)}${pct(l.progress) ? `: ${pct(l.progress)}` : ""}.`),
    );
    cuerpos.forEach((cuerpo, i) => out.push({ ref: `prof:pdi:${slug}:area:${aid}${i ? `:${i + 1}` : ""}`, title: `${nombreArea}`, section: `Área del ${nombre}`, body: cuerpo, path: ruta, cut: String(ctx.ahora.getUTCFullYear()), office: limpio(pilar.management_owner) }));

    for (const linea of lineas) {
      const lid = String(linea.id);
      const proyectos = pl.proyectos.filter((p) => String(p.action_line_id) === lid || pl.enlaces.some((e) => String(e.project_id) === String(p.id) && String(e.action_line_id) === lid));
      const nombreLinea = `${limpio(linea.code) ? `${limpio(linea.code)} ` : ""}${limpio(linea.name)}`;
      const cuerpos2 = trocear(
        [
          `Línea de acción ${nombreLinea}, del área ${nombreArea}, ${nombre}.`,
          pct(linea.progress) ? `Lleva un avance de ${pct(linea.progress)}.` : "",
          serieAnual(pl, lid),
          meta(linea),
          numero(linea.project_count) !== null ? `Tiene ${numero(linea.project_count)} proyectos y ${numero(linea.activity_count) ?? 0} actividades (${numero(linea.activity_done) ?? 0} cumplidas).` : "",
        ]
          .filter(Boolean)
          .join(" "),
        proyectos.map((p) => `Proyecto ${limpio(p.name)}${pct(pl.avanceProyecto.get(String(p.id))?.progress ?? p.progress) ? `: ${pct(pl.avanceProyecto.get(String(p.id))?.progress ?? p.progress)}` : ""}.`),
      );
      cuerpos2.forEach((cuerpo, i) => out.push({ ref: `prof:pdi:${slug}:linea:${lid}${i ? `:${i + 1}` : ""}`, title: nombreLinea, section: `Línea del ${nombre}`, body: cuerpo, path: ruta, cut: String(ctx.ahora.getUTCFullYear()), office: limpio(pilar.management_owner) }));
    }
  }

  // Proyectos del pilar (por su vínculo principal o por cualquiera de sus vínculos).
  const delPilar = pl.proyectos.filter((p) => String(p.pillar_id) === pid);
  for (const proy of delPilar) {
    const yid = String(proy.id);
    const nombreProy = limpio(proy.name);
    if (!nombreProy || esDinero(nombreProy)) continue;
    const linea = pl.lineas.find((l) => String(l.id) === String(proy.action_line_id));
    const area = linea ? pl.areas.find((a) => String(a.id) === String(linea.area_id)) : undefined;
    const cadena = [nombre, area ? `${limpio(area.code) ? `${limpio(area.code)} ` : ""}${limpio(area.name)}` : "", linea ? `${limpio(linea.code) ? `${limpio(linea.code)} ` : ""}${limpio(linea.name)}` : "", nombreProy].filter(Boolean).join(" › ");
    const av = pl.avanceProyecto.get(yid);
    const progreso = pct(av?.progress ?? proy.progress);
    const acts = pl.actividades.filter((a) => String(a.project_id) === yid);
    const lineasAct = acts.map((a) => {
      const metasA = (pl.metas.get(String(a.id)) ?? [])
        .map((m) => ({ y: numero(m.year), meta: numero(m.target_value), res: numero(m.result_value), c: numero(m.compliance) }))
        .filter((m) => m.y !== null)
        .sort((x, z) => (x.y as number) - (z.y as number))
        .map((m) => `${m.y}: meta ${m.meta !== null ? suelto(m.meta) : "sin dato"}, resultado ${m.res !== null ? suelto(m.res) : "sin dato"}${m.c !== null ? `, cumplimiento ${suelto(Math.round(m.c * 10) / 10)} %` : ""}`);
      return `Actividad «${limpio(a.title)}»${limpio(a.owner) ? ` (responsable: ${limpio(a.owner)})` : ""}${pct(a.progress) ? `, avance ${pct(a.progress)}` : ""}${fecha(a.due_date) ? `, plazo ${fecha(a.due_date)}` : ""}${numero(a.baseline_value) !== null ? `, línea base ${numero(a.baseline_year) ?? ""} ${suelto(numero(a.baseline_value) as number)}` : ""}${metasA.length ? `. Metas por año — ${metasA.join("; ")}` : ""}.`;
    });
    const unidades = lista<unknown>(proy.academic_units).map(limpio).filter(Boolean);
    const ods = lista<unknown>(proy.sdg_goals).map((n) => numero(n)).filter((n): n is number => n !== null);
    const impactos = lista<Fila>(proy.impacts).map((i) => [limpio(i.kind), limpio(i.term) ? `a ${limpio(i.term)} plazo` : ""].filter(Boolean).join(" ")).filter(Boolean);
    const encabezado = [
      `Proyecto ${nombreProy}. Ruta: ${cadena}.`,
      progreso ? `Lleva un avance de ${progreso}.` : "Todavía no tiene avance reportado.",
      serieAnual(pl, yid),
      meta(proy),
      frase(proy.description),
      frase(proy.detail),
      limpio(proy.owner) ? `Responsable: ${frase(proy.owner)}` : "",
      fecha(proy.start_date) ? `Empieza el ${fecha(proy.start_date)}.` : "",
      fecha(proy.end_date ?? proy.due_date) ? `Termina el ${fecha(proy.end_date ?? proy.due_date)}.` : "",
      unidades.length ? `Unidades académicas: ${unir(unidades, 10)}.` : "",
      ods.length ? `Aporta a los ODS ${unir(ods.map(String), 17)}.` : "",
      impactos.length ? `Impactos esperados: ${unir(impactos, 6)}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    trocear(encabezado, lineasAct).forEach((cuerpo, i) =>
      out.push({ ref: `prof:pdi:${slug}:proyecto:${yid}${i ? `:${i + 1}` : ""}`, title: nombreProy, section: `Proyecto del ${nombre}`, body: cuerpo, path: ruta, cut: String(ctx.ahora.getUTCFullYear()), office: limpio(proy.owner) || limpio(pilar.management_owner) }),
    );
  }
  return cerrar(out);
}

function pasajePortal(pl: Plan, ctx: Contexto): Pasaje[] {
  const lineas = pl.pilares.filter((p) => limpio(p.name) && !esDinero(p.name)).map((p) => {
    const av = pl.avancePilar.get(String(p.id));
    return `${etiquetaPilar(p)}${pct(av?.progress) ? `: ${pct(av?.progress)}` : ": sin avance reportado"}.`;
  });
  return cerrar(
    trocear(`${PLAN}: ${pl.pilares.length} pilares publicados, ${pl.areas.length} áreas estratégicas, ${pl.lineas.length} líneas de acción y ${pl.proyectos.length} proyectos. Avance por pilar:`, lineas).map((cuerpo, i) => ({
      ref: `prof:pdi:portal${i ? `:${i + 1}` : ""}`,
      title: PLAN,
      section: "Plan de Desarrollo",
      body: `${cuerpo} (Leído el ${leidoEl(ctx.ahora)}.)`,
      path: RUTA,
      cut: String(ctx.ahora.getUTCFullYear()),
      office: "Oficina de Planeación Institucional",
    })),
  );
}

export const lectorPdi: Lector = {
  id: "pdi",
  nombre: "Plan de Desarrollo",
  alias: ["plan de desarrollo", "plan de desarrollo institucional", "pdi", "implementacion del plan"],
  conSesion: false,
  async partes(ctx) {
    const pl = await plan(ctx);
    return [
      { id: PORTAL, etiqueta: "Plan de Desarrollo", alias: ["plan de desarrollo", "pdi"] },
      ...pl.pilares
        .filter((p) => limpio(p.slug) && limpio(p.name) && !esDinero(p.name))
        .map((p): Parte => ({ id: limpio(p.slug), etiqueta: etiquetaPilar(p), alias: [normal(p.name), limpio(p.numeral) ? `pilar ${normal(p.numeral)}` : ""].filter(Boolean) })),
    ];
  },
  async leer(ctx, parte) {
    const pl = await plan(ctx);
    if (parte.id === PORTAL) return pasajePortal(pl, ctx);
    const pilar = pl.pilares.find((p) => limpio(p.slug) === parte.id);
    return pilar ? pasajesPilar(pl, pilar, ctx) : [];
  },
};

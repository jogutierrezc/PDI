// ─── recommend.ts (extendido) ────────────────────────────────────────────────
// Motor de recomendación de Mr. Pilo para dos actores: vicerrectoría y programa.
// Tres fuentes de señal, priorizadas en este orden:
//   1. Necesidades institucionales (gaps de reporte detectados por datos)
//   2. Uso real (adoption rate entre peers + años con datos propios)
//   3. Alineación con metas declaradas por el actor

import type {
  ActorKind,
  CatalogIndicator,
  IndicatorAdaptation,
  InstitutionalNeed,
  Stage,
  SubstantiveFunction,
} from "./model";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface PiloIndicator {
  id: string;
  code: string;
  name: string;
  fn: SubstantiveFunction;
  stage: Stage;
  dimensionName: string | null;
  cesu: boolean;
  programReports: boolean;
  origin: "institucional" | "vicerectoria" | "programa";
  mandatory: boolean;
}

export interface PiloPick {
  indicator: PiloIndicator;
  score: number;
  reasons: string[];       // hasta 3, en orden de importancia
  kept: boolean;           // ya adoptado — no se puede desactivar
  mandatory: boolean;      // forzado por la vice — no se puede desactivar
  needSeverity?: "critica" | "importante" | "oportunidad";
}

export interface PiloProposal {
  picks: PiloPick[];
  gap: { stage: Stage; pick: PiloPick } | null;
  institutionalAlerts: InstitutionalNeed[];  // NUEVO: alertas que Mr. Pilo muestra aparte
}

// ─── Opciones de configuración ────────────────────────────────────────────────

export interface RecommendOptions {
  actorKind: ActorKind;           // NUEVO: cambia el scoring y el vocabulario
  actorId: string;
  indicators: PiloIndicator[];
  goals: string[];
  size: number;
  preferData: boolean;
  adopted: Set<string>;
  mandatory: Set<string>;         // NUEVO: forzados por la vice
  years: Map<string, number[]>;
  alignments: Map<string, string[]>;
  peers: Map<string, { count: number; total: number }>;
  adaptations: Map<string, IndicatorAdaptation>;  // NUEVO
  needs: InstitutionalNeed[];                      // NUEVO: necesidades institucionales
}

// ─── Metas disponibles (ampliadas para vicerrectorías) ───────────────────────

export const PILO_GOALS = [
  // Compartidas (programa y vice)
  { id: "acreditacion",     title: "Demostrar calidad CNA",         fn: "ensenanza"     as SubstantiveFunction, cesu: true,  dimensions: ["Factor 1","Factor 2","Factor 5"], forActor: ["programa","vicerectoria"] },
  { id: "retencion",        title: "Mejorar retención",             fn: "ensenanza"     as SubstantiveFunction, cesu: false, dimensions: ["Bienestar","Apoyo académico"],    forActor: ["programa","vicerectoria"] },
  { id: "investigacion",    title: "Visibilizar investigación",      fn: "investigacion" as SubstantiveFunction, cesu: false, dimensions: ["Grupos","Productos"],            forActor: ["programa","vicerectoria"] },
  { id: "extension",        title: "Fortalecer extensión",          fn: "extension"     as SubstantiveFunction, cesu: false, dimensions: ["Impacto social","Egresados"],     forActor: ["programa","vicerectoria"] },
  { id: "internacionaliz",  title: "Internacionalización",          fn: "ensenanza"     as SubstantiveFunction, cesu: false, dimensions: ["Movilidad","Convenios"],          forActor: ["programa","vicerectoria"] },
  // Exclusivas de vicerrectoría
  { id: "cobertura_reporte",title: "Aumentar cobertura de reporte", fn: "ensenanza"     as SubstantiveFunction, cesu: false, dimensions: ["Uso","Completitud"],             forActor: ["vicerectoria"] },
  { id: "estandarizacion",  title: "Estandarizar entre programas",  fn: "ensenanza"     as SubstantiveFunction, cesu: false, dimensions: ["Comparabilidad"],                forActor: ["vicerectoria"] },
  { id: "benchmarking",     title: "Comparar con otras IES",        fn: "investigacion" as SubstantiveFunction, cesu: false, dimensions: ["Posicionamiento"],               forActor: ["vicerectoria"] },
] as const;

export const PILO_SIZES = [
  { n: 5,  name: "Mínimo",    hint: "Para arrancar o programas nuevos.",       forActor: ["programa","vicerectoria"] },
  { n: 10, name: "Esencial",  hint: "Balance entre rigor y carga de reporte.", forActor: ["programa","vicerectoria"], recommended: true },
  { n: 15, name: "Amplio",    hint: "Para programas con equipo dedicado.",      forActor: ["programa"] },
  { n: 20, name: "Completo",  hint: "Panel institucional, vista vicerrectoría.",forActor: ["vicerectoria"] },
] as const;

export const STAGES: Stage[] = ["insumo", "proceso", "resultado", "impacto"];

// ─── Función principal ────────────────────────────────────────────────────────

export function recommend(opts: RecommendOptions): PiloProposal {
  const {
    actorKind, actorId, indicators, goals, size, preferData,
    adopted, mandatory, years, alignments, peers, adaptations, needs,
  } = opts;

  // 1. Separar mandatorios (siempre incluidos, no desactivables)
  const mandatoryPicks: PiloPick[] = indicators
    .filter((i) => mandatory.has(i.id) && i.status === "publicado")
    .map((i) => ({
      indicator: i,
      score: 1000,  // score máximo para que aparezcan primero
      reasons: ["Obligatorio para su vicerrectoría"],
      kept: adopted.has(i.id),
      mandatory: true,
    }));

  // 2. Filtrar candidatos (publicados, no mandatorios, visibles para el actor)
  const candidates = indicators.filter((i) => {
    if (i.status !== "publicado") return false;
    if (mandatory.has(i.id)) return false;
    // Un programa ve sus propios + los institucionales/vice
    // Una vice NO ve los indicadores origin:programa de otros programas
    if (actorKind === "vicerectoria" && i.origin === "programa" && i.createdBy !== actorId) return false;
    return true;
  });

  // 3. Puntuar candidatos
  const scored = candidates.map((i): PiloPick => {
    let score = 0;
    const reasons: string[] = [];

    // ── Señal 1: necesidad institucional (más peso) ──────────────────────
    const need = needs.find((n) => n.indicatorId === i.id);
    if (need) {
      const boost = need.severity === "critica" ? 60 : need.severity === "importante" ? 40 : 20;
      score += boost;
      if (need.cnaLinked) score += 15;
      const pct = Math.round(need.coverageRate * 100);
      reasons.push(
        need.severity === "critica"
          ? `Solo el ${pct}% de programas lo reporta — brecha crítica`
          : `Cobertura del ${pct}% — oportunidad de mejora`
      );
    }

    // ── Señal 2: uso real (adoption rate entre peers) ────────────────────
    const peer = peers.get(i.id);
    if (peer && peer.total > 0) {
      const rate = peer.count / peer.total;
      score += Math.round(rate * 30);
      if (rate >= 0.6) reasons.push(`Lo siguen el ${Math.round(rate * 100)}% de programas similares`);
    }

    // ── Señal 3: datos propios ya disponibles ────────────────────────────
    const ownYears = years.get(i.id) ?? [];
    if (preferData && ownYears.length > 0) {
      score += Math.min(ownYears.length * 8, 24);
      if (ownYears.length >= 2) reasons.push(`Ya tiene datos de ${ownYears.length} periodos`);
    }

    // ── Señal 4: metas declaradas ────────────────────────────────────────
    const goal = PILO_GOALS.find((g) => goals.includes(g.id) && g.fn === i.fn);
    if (goal) {
      score += 20;
      reasons.push(`Responde a su meta: "${goal.title}"`);
    }

    // ── Señal 5: CNA / CESU ─────────────────────────────────────────────
    if (i.cesu) {
      score += 18;
      if (!reasons.some((r) => r.includes("CNA"))) reasons.push("Condición de calidad CESU");
    }

    // ── Señal 6: adaptación por vice (indica que la vice lo priorizó) ───
    if (adaptations.has(i.id)) {
      score += 10;
      const ad = adaptations.get(i.id)!;
      if (ad.note) reasons.push(ad.note);
    }

    // ── Señal 7: indicador propio del actor ─────────────────────────────
    if (i.origin === actorKind && i.createdBy === actorId) {
      score += 12;
      reasons.push("Indicador creado por ustedes");
    }

    // ── Boost: ya adoptado ───────────────────────────────────────────────
    const kept = adopted.has(i.id);
    if (kept) score += 5;

    return {
      indicator: i,
      score,
      reasons: reasons.slice(0, 3),
      kept,
      mandatory: false,
      needSeverity: need?.severity,
    };
  });

  // 4. Ordenar y recortar al tamaño pedido (mandatorios no cuentan contra el cupo)
  const available = size - mandatoryPicks.length;
  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(available, 0));

  const allPicks = [...mandatoryPicks, ...top];

  // 5. Detectar gap en la cadena de valor
  const stageCount = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const p of allPicks) stageCount[p.indicator.stage]++;

  let gap: PiloProposal["gap"] = null;
  for (const stage of STAGES) {
    if (stageCount[stage] === 0) {
      const filler = scored
        .filter((p) => p.indicator.stage === stage && !allPicks.some((q) => q.indicator.id === p.indicator.id))
        .sort((a, b) => b.score - a.score)[0];
      if (filler) { gap = { stage, pick: filler }; break; }
    }
  }

  // 6. Alertas institucionales para el sidebar de Mr. Pilo
  const institutionalAlerts = needs
    .filter((n) => n.severity === "critica" || (n.severity === "importante" && n.cnaLinked))
    .slice(0, 4);

  return { picks: allPicks, gap, institutionalAlerts };
}

// ─── Mensajes de Mr. Pilo por actor y estado ─────────────────────────────────
// Antes era speech[] estático; ahora es una función parametrizada.

export function piloSpeech(
  step: 1 | 2 | 3 | 4,
  actorKind: ActorKind,
  actorName: string,
  extras: { goalsCount?: number; gapOpen?: boolean; alerts?: number; added?: number; total?: number }
): string {
  const { goalsCount = 0, gapOpen = false, alerts = 0, added = 0, total = 0 } = extras;

  if (actorKind === "vicerectoria") {
    const speeches: Record<1 | 2 | 3 | 4, string> = {
      1: `¡Hola! Soy Mr. Pilo 🦅 Vuelo desde las alturas para ayudar a ${actorName} a definir qué quiere demostrar ante el CNA y ante los programas que lidera.`,
      2: `${goalsCount} ${goalsCount === 1 ? "prioridad elegida" : "prioridades elegidas"} — ¡vamos bien! Ahora dígame cuántos indicadores quiere publicar para sus programas. Recuerde: menos pero bien definidos funcionan mejor.`,
      3: gapOpen
        ? `¡Ojo! La propuesta tiene un eslabón vacío en la cadena de valor. ${alerts > 0 ? `Además, detecto ${alerts} brechas críticas de reporte en sus programas.` : ""} Lo bueno: ya le muestro cómo cerrarlas.`
        : `Aquí va la propuesta para ${actorName}. ${alerts > 0 ? `Encontré ${alerts} brechas institucionales urgentes — las marqué primero.` : "La cadena de valor está completa. ¡Buen trabajo!"}`,
      4: added > 0
        ? `¡Listo! ${actorName} ahora publica ${total} indicadores. Los programas ya los pueden ver y adoptar. El siguiente paso: definir las metas y periodicidades.`
        : `No hubo cambios: el catálogo ya tenía todo lo propuesto. Puede ajustar pesos y metas desde "Gestionar indicadores".`,
    };
    return speeches[step];
  }

  // Programa
  const speeches: Record<1 | 2 | 3 | 4, string> = {
    1: `¡Hola! Soy Mr. Pilo 🦅 Hoy apoyo a ${actorName} desde Planeación Institucional. Tres preguntas y le armo su matriz. ¿Qué quiere demostrar este año?`,
    2: `${goalsCount === 1 ? "Una meta bien enfocada" : `${goalsCount} metas`} — ¡excelente! Ahora dígame cuánto puede reportar. Menos indicadores bien reportados valen más que muchos a medias.`,
    3: gapOpen
      ? `Casi perfecta — pero la cadena de valor tiene un hueco. Sin ese eslabón, el CNA no ve cómo llega a los resultados. ¡Lo resolvemos en un clic!`
      : `Esta es mi propuesta para ${actorName}. La armé con lo que ya reportan programas similares y con las cifras que ustedes ya tienen.`,
    4: added > 0
      ? `¡Listo! ${actorName} ahora sigue ${total} indicadores. Los encuentra en Mi programa; el siguiente paso es poner la línea base y las metas de cada uno.`
      : `No hacía falta añadir nada: ya seguía todo lo propuesto. ¡Está al día!`,
  };
  return speeches[step];
}

/* =============================================================================
   Portal de Impacto · la ficha metodológica de un indicador.

   Cada línea de la ficha con lo que dice y una frase que explica qué es esa
   línea, para quien la lee por primera vez. El objetivo, el método de
   cálculo, la interpretación y la periodicidad vienen de la ficha (`sheet`,
   heredada de la herramienta anterior); si faltan, se arman con las mismas
   plantillas que usaba esa herramienta y la ficha lo dice («preliminar»).
   ========================================================================== */

import { FUNCTION_LABEL, MEASURE_LABEL, STAGE_LABEL } from "../model";
import type { PortalData, PortalIndicator, ProgramIndicator } from "./data";

export interface SheetLine {
  key: string;
  label: string;
  /** Qué es esta línea, en una frase. */
  help: string;
  value: string;
  /** Texto armado por plantilla, no escrito por el responsable. */
  generated?: boolean;
}

export interface SheetSection {
  title: string;
  lines: SheetLine[];
}

export interface IndicatorSheet {
  preliminary: boolean;
  sections: SheetSection[];
  notes: { title: string; text: string; tone: "cadena" | "concepto" | "metodo" }[];
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const EMPTY = "Por definir";

const OBJECTIVE: Record<PortalIndicator["stage"], string> = {
  insumos: "Cuantificar los recursos y condiciones de partida disponibles",
  procesos: "Monitorear el avance de las actividades en ejecución",
  productos: "Medir los resultados y productos obtenidos",
  impacto: "Evidenciar el efecto o cambio de mediano y largo plazo atribuible",
};

const isOwn = (i: PortalIndicator): i is ProgramIndicator => "programId" in i;

export function indicatorSheet(data: PortalData, indicator: PortalIndicator, programId?: string): IndicatorSheet {
  const s = indicator.sheet ?? {};
  const dimension = data.dimensions.find((d) => d.id === indicator.dimensionId)?.name ?? "";
  const fnLabel = FUNCTION_LABEL[indicator.fn];
  const unit = indicator.unitLabel || MEASURE_LABEL[indicator.measure];

  const objective =
    text(s.objetivo) ||
    `${OBJECTIVE[indicator.stage]} en relación con «${indicator.name}»${dimension ? `, dentro de la dimensión «${dimension}»` : ""} de la función de ${fnLabel}.`;
  const ratio = indicator.numerator && indicator.denominator ? `(${indicator.numerator}) ÷ (${indicator.denominator})${indicator.measure === "porcentaje" ? " × 100" : ""}` : "";
  const method =
    text(s.metodoCalculo) ||
    (ratio
      ? `${ratio}. Unidad de medida: ${unit}.${indicator.source ? ` Fuente de datos: ${indicator.source}.` : ""}`
      : `Registro o conteo directo${indicator.description ? ` a partir de: ${indicator.description}` : ""}. Unidad de medida: ${unit}.${indicator.source ? ` Fuente de datos: ${indicator.source}.` : ""}`);
  const reading =
    indicator.measure === "porcentaje"
      ? "Se expresa en porcentaje"
      : indicator.measure === "proporcion"
        ? "Se expresa como proporción frente a un universo de referencia"
        : indicator.measure === "pesos"
          ? "Se expresa en pesos"
          : indicator.measure === "texto"
            ? "Se expresa como categoría o texto"
            : "Valor absoluto (conteo)";
  const interpretation =
    text(s.interpretacion) ||
    `${reading}. ${indicator.direction === "baja" ? "Mejora cuando baja: valores por debajo de la meta indican mejor desempeño." : "Mejora cuando sube: valores más cercanos a la meta o por encima indican mejor desempeño."}`;
  const periodicity = text(s.periodicidad) || "Anual, con corte a diciembre de cada vigencia.";
  const generated = !text(s.objetivo) || !text(s.metodoCalculo) || !text(s.interpretacion);

  const keys = data.alignments.filter((a) => a.indicatorId === indicator.id);
  const pillars = keys
    .filter((a) => a.target === "pilar" && a.pillarId)
    .map((a) => data.pillars.find((p) => p.id === a.pillarId))
    .filter(Boolean)
    .map((p) => `Pilar ${p!.numeral} · ${p!.name}`);
  const sdgs = keys.filter((a) => a.target === "ods" && a.sdg).map((a) => `ODS ${a.sdg}`);

  const who: SheetLine[] = [];
  if (isOwn(indicator)) {
    const parent = data.indicators.find((i) => i.id === indicator.parentId);
    who.push({
      key: "tipo",
      label: "Tipo",
      help: "Si es una ficha institucional de la vicerrectoría o un indicador propio del programa.",
      value: `Indicador propio del programa${parent ? `, relacionado con ${parent.code} · ${parent.name}` : ", sin ficha relacionada"}`,
    });
  } else {
    who.push({ key: "tipo", label: "Tipo", help: "Si es una ficha institucional de la vicerrectoría o un indicador propio del programa.", value: "Ficha institucional" });
  }

  const targets: SheetLine[] = [
    {
      key: "lb",
      label: `Línea base ${indicator.baselineYear}`,
      help: "El punto de partida: la cifra del año base contra la que se mide el avance.",
      value: indicator.baselineText || EMPTY,
    },
    { key: "m26", label: "Meta 2026", help: "Lo que se espera alcanzar al cierre de 2026.", value: indicator.target2026 || EMPTY },
    { key: "m28", label: "Meta 2028", help: "Lo que se espera alcanzar al cierre del plan, en 2028.", value: indicator.target2028 || EMPTY },
  ];
  if (programId && !isOwn(indicator)) {
    for (const a of data.adoptions.filter((x) => x.indicatorId === indicator.id && x.programId === programId)) {
      const campus = data.campuses.find((c) => c.id === a.campusId)?.name ?? "";
      targets.push({
        key: `sede-${a.campusId}`,
        label: `El programa en ${campus}`,
        help: "La línea base y las metas que fijó el programa en esa sede al elegir la ficha.",
        value: [a.baselineText && `LB ${a.baselineText}`, a.target2026 && `2026 ${a.target2026}`, a.target2028 && `2028 ${a.target2028}`].filter(Boolean).join(" · ") || EMPTY,
      });
    }
  }

  const sections: SheetSection[] = [
    {
      title: "Qué mide",
      lines: [
        ...who,
        { key: "desc", label: "Descripción", help: "Lo que cuenta el indicador, en palabras de su ficha.", value: indicator.description || EMPTY },
        { key: "obj", label: "Objetivo", help: "Para qué se mide: la pregunta que responde.", value: objective, generated: !text(s.objetivo) },
        {
          key: "cadena",
          label: "Eslabón",
          help: "Dónde está en la cadena de valor: insumos, procesos, productos o impacto real.",
          value: `${STAGE_LABEL[indicator.stage]} · ${fnLabel}`,
        },
        { key: "dim", label: "Dimensión de impacto", help: "La dimensión de la función a la que aporta.", value: dimension || EMPTY },
      ],
    },
    {
      title: "Cómo se mide",
      lines: [
        { key: "met", label: "Método de cálculo", help: "La operación que produce la cifra, con sus partes.", value: method, generated: !text(s.metodoCalculo) },
        { key: "und", label: "Unidad de medida", help: "En qué se expresa la cifra.", value: unit },
        { key: "int", label: "Interpretación", help: "Cómo leer la cifra: qué significa que suba o que baje.", value: interpretation, generated: !text(s.interpretacion) },
        { key: "per", label: "Periodicidad", help: "Cada cuánto se mide y con qué corte.", value: periodicity, generated: !text(s.periodicidad) },
        { key: "fuente", label: "Fuente de verificación", help: "Dónde se consulta el dato para comprobarlo.", value: indicator.source || EMPTY },
        { key: "resp", label: "Responsable", help: "Quién reporta la cifra y responde por ella.", value: indicator.responsible || EMPTY },
      ],
    },
    { title: "Línea base y metas", lines: targets },
    {
      title: "A qué aporta",
      lines: [
        { key: "pil", label: "Pilares estratégicos", help: "Los pilares del Plan de Desarrollo 2024-2028 con los que se alinea.", value: pillars.join(" · ") || "Sin pilares confirmados" },
        { key: "ods", label: "ODS alineados", help: "Los Objetivos de Desarrollo Sostenible a los que contribuye.", value: sdgs.join(" · ") || "Sin ODS confirmados" },
        { key: "proy", label: "Proyectos estratégicos", help: "Los proyectos del PDI que lo alimentan.", value: indicator.projectsText || EMPTY },
      ],
    },
  ];

  const notes: IndicatorSheet["notes"] = [];
  if (text(s.cadenaValor)) notes.push({ title: "Cadena de valor", text: text(s.cadenaValor), tone: "cadena" });
  if (text(s.notaConceptual)) notes.push({ title: "Nota conceptual", text: text(s.notaConceptual), tone: "concepto" });
  if (text(s.notaMetodologica)) notes.push({ title: "Nota metodológica", text: text(s.notaMetodologica), tone: "metodo" });

  return { preliminary: Boolean(s.fichaBorrador) || generated, sections, notes };
}

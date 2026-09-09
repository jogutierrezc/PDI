/* =============================================================================
   Formularios de la configuración de un pilar.

   Los ocho diálogos (área, línea, proyecto, indicador de resultado, documento,
   cambio, término y observación) comparten esqueleto: cambian los campos y cómo
   se arma la fila. Aquí se declara esa diferencia y nada más; el modal, la
   trampa de foco y el envío son comunes.

   La excepción es el indicador de resultado: su serie anual no cabe en un campo
   suelto, así que declara además `childRows`, las filas de `activity_targets`
   que hay que guardar detrás del indicador.

   Cada formulario sirve para crear y para editar: si llega una entidad, sus
   valores rellenan el estado inicial y el envío hace UPDATE en vez de INSERT.
   ========================================================================== */

import { baselineYear, computeCompliance, planYears, shortYear, statusMeta, statusOrder } from "../../../data/pdi";
import type {
  ActivityStatus,
  ActivityTarget,
  ActivityWithTargets,
  ChangeType,
  IndicatorWithLabels,
  Parameter,
  PdiDocument,
  Project,
  StrategicArea,
} from "../../../types/database";
import type { ChildRowPlan } from "../../../data/mutations";
import type { AreaWithLines } from "../../../data/queries";
import type { ActionLineWithArea } from "../../../types/database";

export type Values = Record<string, string>;

export interface FieldOption {
  value: string;
  label: string;
  /** Agrupa la opción bajo un <optgroup>: así se ve de qué área es cada línea. */
  group?: string;
}

export interface FieldSpec {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "date" | "range" | "checkbox" | "url" | "number" | "years";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: FieldOption[];
  /** Solo para `years`: los cortes que se abren a captura. */
  years?: number[];
}

export interface FormConfig {
  title: string;
  description?: string;
  submitLabel: string;
  fields: FieldSpec[];
  initial: Values;
  /** Fila lista para insertar o actualizar. */
  toRow: (values: Values) => Record<string, unknown>;
  /** Filas dependientes que se guardan después, ya con el id del padre. */
  childRows?: (values: Values, parentId: string) => ChildRowPlan | null;
}

export type EntityKind =
  | "area"
  | "line"
  | "project"
  | "activity"
  | "document"
  | "change"
  | "glossary"
  | "observation";

export interface FormContext {
  pillarId: string;
  pillarName: string;
  areas: AreaWithLines[];
  lines: ActionLineWithArea[];
  indicators: IndicatorWithLabels[];
  projects: Project[];
  activities: ActivityWithTargets[];
  /** Catálogo global de unidades de medida (Parámetros globales). */
  units: Parameter[];
  documents: PdiDocument[];
  /** Área seleccionada en la pantalla, para proponerla por defecto. */
  activeAreaId?: string;
  /** Entidad que se está editando; ausente al crear. */
  entity?: Record<string, unknown>;
}

const CHANGE_TYPES: ChangeType[] = ["creacion", "modificacion", "reforma", "eliminacion"];
const DOC_KINDS = ["PDF", "XLSX", "DOCX", "CSV", "HTML", "Enlace"];

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/**
 * Meta y avance en valor absoluto. Son opcionales: mientras estén vacíos, las
 * tablas del cuadro de mando cuentan indicadores en su lugar. El porcentaje no
 * sale de aquí — ese lo calcula la cascada.
 */
const targetFields: FieldSpec[] = [
  {
    name: "target_value",
    label: "Meta (valor absoluto)",
    placeholder: "Ej. 40",
    hint: "Opcional. Sin meta capturada, el cuadro de mando cuenta indicadores.",
  },
  { name: "achieved_value", label: "Avance alcanzado", placeholder: "Ej. 28" },
  { name: "measure_unit", label: "Unidad de la meta", placeholder: "Ej. convenios" },
];

/** Los tres campos de meta, listos para el envío. */
function targetValues(entity: Record<string, unknown>): Values {
  return {
    target_value: text(entity.target_value),
    achieved_value: text(entity.achieved_value),
    measure_unit: text(entity.measure_unit),
  };
}

function targetRow(values: Values): Record<string, unknown> {
  const num = (raw: string) => (raw.trim() === "" ? null : Number(raw));
  return {
    target_value: num(values.target_value ?? ""),
    achieved_value: num(values.achieved_value ?? ""),
    measure_unit: orNull(values.measure_unit ?? ""),
  };
}

/* --- Serie anual del indicador ---------------------------------------------
   Los tres datos de cada año viajan por el formulario como campos planos
   —`year_2025_target` y compañía— porque `Values` es un mapa de cadenas y no
   merece la pena complicarlo por una sola pantalla. Aquí se traducen a filas de
   `activity_targets` y de vuelta.
   -------------------------------------------------------------------------- */

export const yearField = (year: number, part: "target" | "result" | "override") =>
  `year_${year}_${part}`;

/** Los años del plan más cualquiera ya capturado fuera de ese rango. */
function yearsFor(targets: ActivityTarget[]): number[] {
  const years = new Set<number>(planYears);
  for (const row of targets) years.add(row.year);
  return [...years].sort((a, b) => a - b);
}

const number = (raw: string | undefined): number | null => {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  // Se admite la coma decimal: es lo que sale del teclado en español.
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const statusOptions: FieldOption[] = statusOrder.map((status) => ({
  value: status,
  label: statusMeta[status].label,
}));

/** Opciones de línea agrupadas por su área. */
function lineOptions(lines: ActionLineWithArea[], placeholder: string): FieldOption[] {
  return [
    { value: "", label: placeholder },
    ...lines.map((line) => ({
      value: line.id,
      label: `${line.code ? `${line.code} · ` : ""}${line.name}`,
      group: line.area_name,
    })),
  ];
}

function areaOptions(areas: StrategicArea[], placeholder: string): FieldOption[] {
  return [
    { value: "", label: placeholder },
    ...areas.map((area) => ({
      value: area.id,
      label: `${area.code ? `${area.code} · ` : ""}${area.name}`,
    })),
  ];
}

export function buildForm(kind: EntityKind, ctx: FormContext): FormConfig {
  const editing = Boolean(ctx.entity);
  const entity = (ctx.entity ?? {}) as Record<string, unknown>;
  const position = (entity.position as number | undefined) ?? undefined;

  switch (kind) {
    /* --- Área estratégica ------------------------------------------------- */
    case "area":
      return {
        title: editing ? "Editar área estratégica" : "Nueva área estratégica",
        submitLabel: editing ? "Guardar área" : "Crear área",
        fields: [
          { name: "name", label: "Nombre del área", required: true, placeholder: "Ej. Infraestructura tecnológica" },
          { name: "code", label: "Código", placeholder: "Ej. AE-04" },
          { name: "description", label: "Descripción", type: "textarea" },
          ...targetFields,
        ],
        initial: {
          name: text(entity.name),
          code: text(entity.code),
          description: text(entity.description),
          ...targetValues(entity),
        },
        toRow: (values) => ({
          pillar_id: ctx.pillarId,
          name: values.name.trim(),
          code: orNull(values.code),
          description: values.description ?? "",
          position: position ?? ctx.areas.length + 1,
          ...targetRow(values),
        }),
      };

    /* --- Línea de acción --------------------------------------------------- */
    case "line": {
      const currentArea = text(entity.area_id) || ctx.activeAreaId || ctx.areas[0]?.id || "";
      return {
        title: editing ? "Editar línea de acción" : "Nueva línea de acción",
        description:
          "El cumplimiento es el dato que valida el comité; el avance del área es el promedio de sus líneas.",
        submitLabel: editing ? "Guardar línea" : "Vincular línea",
        fields: [
          { name: "name", label: "Nombre de la línea", required: true, placeholder: "Ej. Modernización de infraestructura" },
          { name: "code", label: "Código", placeholder: "Ej. LA-4.1" },
          {
            name: "area_id",
            label: "Área estratégica",
            type: "select",
            required: true,
            options: areaOptions(ctx.areas, "Selecciona un área…"),
          },
          { name: "progress", label: "Cumplimiento reportado", type: "range" },
          ...targetFields,
        ],
        initial: {
          name: text(entity.name),
          code: text(entity.code),
          area_id: currentArea,
          progress: text(entity.progress ?? 0),
          ...targetValues(entity),
        },
        toRow: (values) => ({
          area_id: values.area_id,
          name: values.name.trim(),
          code: orNull(values.code),
          progress: Number(values.progress || 0),
          position:
            position ??
            (ctx.areas.find((area) => area.id === values.area_id)?.action_lines.length ?? 0) + 1,
          ...targetRow(values),
        }),
      };
    }

    /* --- Proyecto ---------------------------------------------------------- */
    case "project":
      return {
        title: editing ? "Editar proyecto" : "Nuevo proyecto estratégico",
        description: editing
          ? "Cada cambio de avance, estado, responsable o fecha queda registrado en el control de cambios."
          : "Al crearlo se registra su primera entrada en el control de cambios.",
        submitLabel: editing ? "Guardar proyecto" : "Crear proyecto",
        fields: [
          { name: "name", label: "Nombre del proyecto", required: true },
          { name: "owner", label: "Responsable", placeholder: "Persona o dependencia" },
          {
            name: "action_line_id",
            label: "Línea de acción",
            type: "select",
            options: lineOptions(ctx.lines, "Sin línea asignada"),
            hint: "Sin línea, el proyecto no aparece al filtrar por área en el portal público.",
          },
          { name: "description", label: "Descripción", type: "textarea" },
          { name: "due_date", label: "Fecha objetivo", type: "date" },
          { name: "status", label: "Estado", type: "select", options: statusOptions },
          { name: "progress", label: "Porcentaje de avance", type: "range" },
          {
            name: "indicator_id",
            label: "Indicador asociado",
            type: "select",
            options: [
              { value: "", label: "Ninguno" },
              ...ctx.indicators.map((indicator) => ({
                value: indicator.id,
                label: `${indicator.code} · ${indicator.name}`,
              })),
            ],
          },
          ...targetFields,
        ],
        initial: {
          name: text(entity.name),
          owner: text(entity.owner),
          action_line_id: text(entity.action_line_id),
          ...targetValues(entity),
          description: text(entity.description),
          due_date: text(entity.due_date),
          status: text(entity.status) || "pendiente",
          progress: text(entity.progress ?? 0),
          indicator_id: text(entity.indicator_id),
        },
        toRow: (values) => ({
          pillar_id: ctx.pillarId,
          action_line_id: orNull(values.action_line_id),
          indicator_id: orNull(values.indicator_id),
          name: values.name.trim(),
          owner: values.owner ?? "",
          description: values.description ?? "",
          due_date: orNull(values.due_date),
          progress: Number(values.progress || 0),
          status: (values.status as ActivityStatus) || "pendiente",
          position: position ?? ctx.projects.length + 1,
          ...targetRow(values),
        }),
      };

    /* --- Indicador de resultado -------------------------------------------
       Sigue guardándose en `activities`: es la misma fila que alimenta la
       cascada del tablero, ahora con la unidad, la línea base y los años
       delante.
       -------------------------------------------------------------------- */
    case "activity": {
      const targets = ((entity.targets as ActivityTarget[] | undefined) ?? []).slice();
      const byYear = new Map(targets.map((row) => [row.year, row]));
      const years = yearsFor(targets);
      const hasSeries = targets.some((row) => row.compliance !== null);

      const yearValues: Values = {};
      for (const year of years) {
        const row = byYear.get(year);
        yearValues[yearField(year, "target")] = text(row?.target_value);
        yearValues[yearField(year, "result")] = text(row?.result_value);
        yearValues[yearField(year, "override")] = text(row?.compliance_override);
      }

      return {
        title: editing ? "Editar indicador de resultado" : "Nuevo indicador de resultado",
        description:
          "El cumplimiento de cada año se calcula solo: resultado sobre meta. El avance del indicador es el del año más reciente que tenga cifras, y de ahí sube a la línea, al área y al pilar.",
        submitLabel: editing ? "Guardar indicador" : "Crear indicador",
        fields: [
          {
            name: "title",
            label: "Nombre del indicador",
            required: true,
            placeholder: "Ej. Convenios de cooperación vigentes",
          },
          { name: "owner", label: "Responsable", placeholder: "Persona o dependencia" },
          {
            name: "unit_id",
            label: "Unidad de medida",
            type: "select",
            options: [
              { value: "", label: "Sin unidad" },
              ...ctx.units.map((unit) => ({ value: unit.id, label: unit.label })),
            ],
            hint: "Sale del catálogo de Parámetros globales. Es lo que da sentido a la cifra: 40 no dice nada, 40 convenios sí.",
          },
          {
            name: "action_line_id",
            label: "Línea de acción",
            type: "select",
            options: lineOptions(ctx.lines, "Sin línea asignada"),
            hint: "El área se deduce de la línea. Sin línea, el indicador no aparece al filtrar por área.",
          },
          {
            name: "project_id",
            label: "Proyecto al que pertenece",
            type: "select",
            options: [
              { value: "", label: "Sin proyecto" },
              ...ctx.projects.map((project) => ({ value: project.id, label: project.name })),
            ],
          },
          {
            name: "baseline_year",
            label: "Año de la línea base",
            type: "number",
            placeholder: String(baselineYear),
            hint: "El punto de partida contra el que se leen las metas.",
          },
          {
            name: "baseline_value",
            label: "Valor de la línea base",
            type: "number",
            placeholder: "Ej. 28",
          },
          {
            name: "years",
            label: "Metas y resultados por año",
            type: "years",
            years,
            hint: "Deja en blanco los años que aún no toca reportar: no se guardan y no cuentan.",
          },
          { name: "due_date", label: "Fecha de vencimiento", type: "date" },
          {
            name: "status",
            label: "Estado",
            type: "select",
            options: statusOptions,
            hint: hasSeries
              ? "Con años capturados el estado lo ajusta la base: al 100 % pasa a cumplida y por debajo vuelve a en curso."
              : undefined,
          },
          {
            name: "progress",
            label: "Porcentaje de avance",
            type: "range",
            hint: hasSeries
              ? "Lo fija el cumplimiento del año más reciente; lo que escribas aquí se sobrescribe al guardar."
              : "Se usa mientras el indicador no tenga ningún año capturado.",
          },
          { name: "is_featured", label: "Destacar en el tablero público", type: "checkbox" },
        ],
        initial: {
          title: text(entity.title),
          owner: text(entity.owner),
          unit_id: text(entity.unit_id),
          action_line_id: text(entity.action_line_id),
          project_id: text(entity.project_id),
          baseline_year: text(entity.baseline_year),
          baseline_value: text(entity.baseline_value),
          due_date: text(entity.due_date),
          status: text(entity.status) || "pendiente",
          progress: text(entity.progress ?? 0),
          is_featured: entity.is_featured ? "on" : "",
          ...yearValues,
        },
        toRow: (values) => {
          const status = (values.status as ActivityStatus) || "pendiente";
          return {
            pillar_id: ctx.pillarId,
            action_line_id: orNull(values.action_line_id),
            project_id: orNull(values.project_id),
            unit_id: orNull(values.unit_id),
            title: values.title.trim(),
            owner: values.owner ?? "",
            baseline_year: number(values.baseline_year),
            baseline_value: number(values.baseline_value),
            due_date: orNull(values.due_date),
            // La base rechaza "cumplida al 60 %": se ajusta aquí para que el
            // formulario no falle por una combinación imposible. Si hay años
            // capturados, el disparador vuelve a fijar ambos al guardarlos.
            progress: status === "cumplida" ? 100 : Number(values.progress || 0),
            status,
            is_featured: values.is_featured === "on",
            position: position ?? ctx.activities.length + 1,
          };
        },
        childRows: (values, parentId) => {
          const upsert: Record<string, unknown>[] = [];
          const removeIds: string[] = [];

          for (const year of years) {
            const target = number(values[yearField(year, "target")]);
            const result = number(values[yearField(year, "result")]);
            const override = number(values[yearField(year, "override")]);
            const existing = byYear.get(year);

            // Un año sin ninguna de las tres cifras es un año no reportado, no
            // un año en cero: se borra en vez de guardarse vacío.
            if (target === null && result === null && override === null) {
              if (existing) removeIds.push(existing.id);
              continue;
            }

            upsert.push({
              activity_id: parentId,
              year,
              target_value: target,
              result_value: result,
              compliance_override: override,
            });
          }

          if (upsert.length === 0 && removeIds.length === 0) return null;
          return { table: "activity_targets", onConflict: "activity_id,year", upsert, removeIds };
        },
      };
    }

    /* --- Documento --------------------------------------------------------- */
    case "document":
      return {
        title: editing ? "Editar documento" : "Añadir documento de soporte",
        description:
          "El portal guarda el enlace, no el archivo. Sube el documento a la unidad institucional y pega aquí su dirección.",
        submitLabel: editing ? "Guardar documento" : "Añadir documento",
        fields: [
          { name: "title", label: "Título del documento", required: true },
          {
            name: "url",
            label: "Enlace",
            required: true,
            type: "url",
            placeholder: "https://…",
            hint: "Debe empezar por http:// o https://",
          },
          { name: "description", label: "Descripción", type: "textarea" },
          {
            name: "kind",
            label: "Tipo",
            type: "select",
            options: DOC_KINDS.map((kind) => ({ value: kind, label: kind })),
          },
          {
            name: "area_id",
            label: "Área estratégica",
            type: "select",
            options: areaOptions(ctx.areas, "Sin área asignada"),
          },
          {
            name: "action_line_id",
            label: "Línea de acción",
            type: "select",
            options: lineOptions(ctx.lines, "Sin línea asignada"),
            hint: "Si eliges una línea, su área manda sobre la de arriba: así el soporte nunca queda en una pareja imposible.",
          },
          { name: "size_label", label: "Tamaño (informativo)", placeholder: "Ej. 4,2 MB" },
          { name: "is_public", label: "Publicar en el repositorio público", type: "checkbox" },
        ],
        initial: {
          title: text(entity.title),
          url: text(entity.url),
          description: text(entity.description),
          kind: text(entity.kind) || "PDF",
          area_id: text(entity.area_id),
          action_line_id: text(entity.action_line_id),
          size_label: text(entity.size_label),
          is_public: entity.is_public ? "on" : "",
        },
        toRow: (values) => {
          const line = ctx.lines.find((item) => item.id === values.action_line_id);
          const isPublic = values.is_public === "on";
          return {
            pillar_id: ctx.pillarId,
            // La línea determina el área: elegir una línea de otra área y
            // dejar el desplegable de área en la anterior daría un soporte
            // colocado en dos sitios a la vez.
            area_id: line ? line.area_id : orNull(values.area_id),
            action_line_id: line ? line.id : null,
            title: values.title.trim(),
            description: values.description ?? "",
            kind: values.kind || "PDF",
            url: values.url.trim(),
            size_label: orNull(values.size_label),
            is_public: isPublic,
            published_at: isPublic ? (text(entity.published_at) || new Date().toISOString()) : null,
            position: position ?? ctx.documents.length + 1,
          };
        },
      };

    /* --- Control de cambios (registro manual) ------------------------------ */
    case "change":
      return {
        title: editing ? "Editar registro de cambio" : "Registrar cambio",
        description:
          "Los cambios de proyectos e indicadores se registran solos. Esto es para lo que se decide fuera del portal: actas, avales y reformas del protocolo de medición.",
        submitLabel: editing ? "Guardar registro" : "Registrar cambio",
        fields: [
          { name: "version", label: "Número de versión", required: true, placeholder: "Ej. 1.1" },
          { name: "area_code", label: "Código del área", placeholder: "Ej. AE-04" },
          { name: "approved_by", label: "Aval del cambio", placeholder: "Comité de Planeación" },
          { name: "changed_on", label: "Fecha de modificación", type: "date" },
          { name: "description", label: "Descripción del ajuste", type: "textarea", required: true },
          {
            name: "change_type",
            label: "Tipo de cambio",
            type: "select",
            options: CHANGE_TYPES.map((type) => ({ value: type, label: type })),
          },
          {
            name: "indicator_id",
            label: "Protocolo de medición relacionado",
            type: "select",
            options: [
              { value: "", label: "Ninguno" },
              ...ctx.indicators.map((indicator) => ({
                value: indicator.id,
                label: `${indicator.code} · ${indicator.name}`,
              })),
            ],
          },
          {
            name: "project_id",
            label: "Proyecto relacionado",
            type: "select",
            options: [
              { value: "", label: "Ninguno" },
              ...ctx.projects.map((project) => ({ value: project.id, label: project.name })),
            ],
          },
          {
            name: "activity_id",
            label: "Indicador relacionado",
            type: "select",
            options: [
              { value: "", label: "Ninguno" },
              ...ctx.activities.map((activity) => ({ value: activity.id, label: activity.title })),
            ],
          },
        ],
        initial: {
          version: text(entity.version),
          area_code: text(entity.area_code),
          approved_by: text(entity.approved_by),
          changed_on: text(entity.changed_on) || new Date().toISOString().slice(0, 10),
          description: text(entity.description),
          change_type: text(entity.change_type) || "modificacion",
          indicator_id: text(entity.indicator_id),
          project_id: text(entity.project_id),
          activity_id: text(entity.activity_id),
        },
        toRow: (values) => ({
          pillar_id: ctx.pillarId,
          indicator_id: orNull(values.indicator_id),
          project_id: orNull(values.project_id),
          activity_id: orNull(values.activity_id),
          area_code: values.area_code ?? "",
          version: values.version.trim(),
          approved_by: values.approved_by ?? "",
          changed_on: values.changed_on || new Date().toISOString().slice(0, 10),
          description: values.description ?? "",
          change_type: (values.change_type as ChangeType) || "modificacion",
        }),
      };

    /* --- Glosario ----------------------------------------------------------- */
    case "glossary":
      return {
        title: editing ? "Editar término" : "Nuevo término del glosario",
        submitLabel: editing ? "Guardar término" : "Guardar término",
        fields: [
          { name: "term", label: "Término", required: true },
          { name: "definition", label: "Definición corta" },
          { name: "description", label: "Descripción", type: "textarea", required: true },
          { name: "source", label: "Fuente (opcional)", placeholder: "Ej. NIST SP 800-207" },
        ],
        initial: {
          term: text(entity.term),
          definition: text(entity.definition),
          description: text(entity.description),
          source: text(entity.source),
        },
        toRow: (values) => ({
          pillar_id: ctx.pillarId,
          term: values.term.trim(),
          definition: values.definition ?? "",
          description: values.description ?? "",
          source: orNull(values.source),
          position: position ?? ctx.documents.length + 1,
        }),
      };

    /* --- Observación del pilar ---------------------------------------------
       El balance en prosa del avance de los indicadores. Va aparte de la serie
       anual a propósito: la cifra dice cuánto, y esto dice por qué.
       -------------------------------------------------------------------- */
    case "observation": {
      const cortes = [...planYears].sort((a, b) => b - a);
      return {
        title: editing ? "Editar observación" : "Nueva observación",
        description:
          "Se publica en la ficha del pilar, debajo de la tabla de indicadores. Es la lectura del avance: lo que explica las cifras, no lo que las repite.",
        submitLabel: editing ? "Guardar observación" : "Publicar observación",
        fields: [
          {
            name: "title",
            label: "Título",
            placeholder: "Ej. Balance del corte 2025",
            hint: "Opcional. Sin título, la observación se muestra solo con su texto.",
          },
          {
            name: "body",
            label: "Observación",
            type: "textarea",
            required: true,
            placeholder: "Qué explica el avance de los indicadores de este pilar en el corte.",
          },
          {
            name: "year",
            label: "Corte al que se refiere",
            type: "select",
            options: [
              { value: "", label: "Vigente (sin año)" },
              ...cortes.map((year) => ({ value: String(year), label: String(year) })),
            ],
            hint: "Sin año, la observación se lee como el estado actual del pilar.",
          },
          { name: "author", label: "Quién la firma", placeholder: "Ej. Comité de Planeación" },
        ],
        initial: {
          title: text(entity.title),
          body: text(entity.body),
          year: text(entity.year),
          author: text(entity.author),
        },
        toRow: (values) => ({
          pillar_id: ctx.pillarId,
          title: values.title ?? "",
          body: values.body.trim(),
          year: (values.year ?? "").trim() === "" ? null : Number(values.year),
          author: values.author ?? "",
          position: position ?? 0,
        }),
      };
    }
  }
}

/** Tabla de cada tipo, para saber sobre qué escribir. */
export const tableFor: Record<EntityKind, string> = {
  area: "strategic_areas",
  line: "action_lines",
  project: "projects",
  activity: "activities",
  document: "documents",
  change: "change_log",
  glossary: "glossary_terms",
  observation: "pillar_observations",
};

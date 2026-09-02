/* =============================================================================
   Formularios de la configuración de un pilar.

   Los siete diálogos (área, línea, proyecto, actividad, documento, cambio y
   término) comparten esqueleto: cambian los campos y cómo se arma la fila. Aquí
   se declara esa diferencia y nada más; el modal, la trampa de foco y el envío
   son comunes.

   Cada formulario sirve para crear y para editar: si llega una entidad, sus
   valores rellenan el estado inicial y el envío hace UPDATE en vez de INSERT.
   ========================================================================== */

import { statusMeta, statusOrder } from "../../../data/pdi";
import type {
  Activity,
  ActivityStatus,
  ChangeType,
  IndicatorWithLabels,
  PdiDocument,
  Project,
  StrategicArea,
} from "../../../types/database";
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
  type?: "text" | "textarea" | "select" | "date" | "range" | "checkbox" | "url";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: FieldOption[];
}

export interface FormConfig {
  title: string;
  description?: string;
  submitLabel: string;
  fields: FieldSpec[];
  initial: Values;
  /** Fila lista para insertar o actualizar. */
  toRow: (values: Values) => Record<string, unknown>;
}

export type EntityKind = "area" | "line" | "project" | "activity" | "document" | "change" | "glossary";

export interface FormContext {
  pillarId: string;
  pillarName: string;
  areas: AreaWithLines[];
  lines: ActionLineWithArea[];
  indicators: IndicatorWithLabels[];
  projects: Project[];
  activities: Activity[];
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
 * tablas del cuadro de mando cuentan actividades en su lugar. El porcentaje no
 * sale de aquí — ese lo calcula la cascada.
 */
const targetFields: FieldSpec[] = [
  {
    name: "target_value",
    label: "Meta (valor absoluto)",
    placeholder: "Ej. 40",
    hint: "Opcional. Sin meta capturada, el cuadro de mando cuenta actividades.",
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

    /* --- Actividad --------------------------------------------------------- */
    case "activity":
      return {
        title: editing ? "Editar actividad" : "Nueva actividad",
        description:
          "El avance del pilar se calcula contando actividades cumplidas sobre el total. Cada edición deja su registro en el control de cambios.",
        submitLabel: editing ? "Guardar actividad" : "Crear actividad",
        fields: [
          { name: "title", label: "Título de la actividad", required: true },
          { name: "owner", label: "Responsable" },
          {
            name: "action_line_id",
            label: "Línea de acción",
            type: "select",
            options: lineOptions(ctx.lines, "Sin línea asignada"),
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
          { name: "due_date", label: "Fecha de vencimiento", type: "date" },
          { name: "status", label: "Estado", type: "select", options: statusOptions },
          {
            name: "progress",
            label: "Porcentaje de avance",
            type: "range",
            hint: "Una actividad cumplida se guarda siempre al 100 %.",
          },
          { name: "is_featured", label: "Destacar en el tablero público", type: "checkbox" },
        ],
        initial: {
          title: text(entity.title),
          owner: text(entity.owner),
          action_line_id: text(entity.action_line_id),
          project_id: text(entity.project_id),
          due_date: text(entity.due_date),
          status: text(entity.status) || "pendiente",
          progress: text(entity.progress ?? 0),
          is_featured: entity.is_featured ? "on" : "",
        },
        toRow: (values) => {
          const status = (values.status as ActivityStatus) || "pendiente";
          return {
            pillar_id: ctx.pillarId,
            action_line_id: orNull(values.action_line_id),
            project_id: orNull(values.project_id),
            title: values.title.trim(),
            owner: values.owner ?? "",
            due_date: orNull(values.due_date),
            // La base rechaza "cumplida al 60 %": se ajusta aquí para que el
            // formulario no falle por una combinación imposible.
            progress: status === "cumplida" ? 100 : Number(values.progress || 0),
            status,
            is_featured: values.is_featured === "on",
            position: position ?? ctx.activities.length + 1,
          };
        },
      };

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
          "Los cambios de proyectos y actividades se registran solos. Esto es para lo que se decide fuera del portal: actas, avales y reformas del indicador.",
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
            label: "Indicador relacionado",
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
            label: "Actividad relacionada",
            type: "select",
            options: [
              { value: "", label: "Ninguna" },
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
};

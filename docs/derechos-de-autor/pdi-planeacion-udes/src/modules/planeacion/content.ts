/* =============================================================================
   Portal de Planeación Institucional · contenido editorial.

   Lo que la oficina dice de sí misma: su propósito, sus áreas, su equipo y sus
   accesos. Las cifras no viven aquí: salen de UDES en Cifras, del PDI y del
   Observatorio.

   Desde la migración 0050 esto se edita en la intranet («Página de la
   oficina») y se guarda en la base. Este archivo no desapareció: es el valor
   por defecto —el que ve el portal mientras la oficina no haya publicado nada,
   o si la base no responde—. Cambiar algo aquí sigue funcionando, pero exige
   un despliegue; cambiarlo en la intranet, no.

   Equipo: una persona solo se publica cuando tiene nombre. Mientras la lista
   esté vacía, la página del equipo muestra las áreas de la oficina y el
   contacto, sin marcadores a la vista.
   ========================================================================== */

export const OFFICE = {
  name: "Oficina de Planeación Institucional",
  university: "Universidad de Santander",
  email: "planeacion@udes.edu.co",
  /** Dirección postal; vacía no se muestra. */
  address: "",
  purpose:
    "Acompañamos a la universidad en la formulación y el seguimiento de su Plan de Desarrollo, publicamos las cifras oficiales con su fuente y su corte, y promovemos decisiones basadas en datos.",
};

export interface OfficeArea {
  id: string;
  name: string;
  /** Qué hace el área, en una frase. */
  does: string;
  /** Dónde se ve su trabajo. */
  to?: string;
  toLabel?: string;
}

export const AREAS: OfficeArea[] = [
  {
    id: "plan",
    name: "Plan de Desarrollo",
    does: "Formula el PDI con las facultades y los campus, y sigue el avance de sus pilares, proyectos e indicadores.",
    to: "/pdi",
    toLabel: "Portal PDI",
  },
  {
    id: "estadistica",
    name: "Estadística institucional",
    does: "Recibe las cifras que reporta cada oficina, las valida y las publica con su corte en UDES en Cifras y en el boletín.",
    to: "/datos-abiertos",
    toLabel: "UDES en Cifras",
  },
  {
    id: "analitica",
    name: "Analítica académica",
    does: "Construye los conjuntos de datos del Observatorio y los modelos que explican la trayectoria de los estudiantes.",
    to: "/datos-abiertos/observatorio",
    toLabel: "Observatorio",
  },
  {
    id: "tecnologia",
    name: "Desarrollo tecnológico",
    does: "Construye y mantiene los aplicativos con que la oficina captura, valida y publica la información.",
    to: "/desarrollo-tecnologico",
    toLabel: "Desarrollo tecnológico",
  },
];

export interface TeamMember {
  name: string;
  role: string;
  /** Id de un área de AREAS. */
  area: string;
  email?: string;
  /** Ruta de la foto en /public. Sin ella, iniciales. */
  photo?: string;
  /** Una línea: en qué anda ahora. Se lee sin abrir la ficha. */
  focus?: string;
  /** El párrafo de la ficha ampliada. */
  bio?: string;
  /** Formación, una línea por título. */
  education?: string[];
  /** Perfiles públicos: ORCID, CvLAC, LinkedIn… */
  links?: { label: string; url: string }[];
}

/** Se llena con los datos oficiales del equipo. Sin nombre, no se publica. */
export const TEAM: TeamMember[] = [];

/** Accesos de la oficina: solo destinos que existen en el sitio. */
export const OFFICE_LINKS: { label: string; hint: string; to: string }[] = [
  { label: "Repositorio documental", hint: "Documentos del plan", to: "/implementacion#repositorio" },
  { label: "PDI y los ODS", hint: "Aporte a la Agenda 2030", to: "/ods" },
  { label: "PDI por facultad", hint: "Propuestas y alineación", to: "/facultades" },
  { label: "Desarrollo tecnológico", hint: "Aplicativos de la oficina", to: "/desarrollo-tecnologico" },
];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

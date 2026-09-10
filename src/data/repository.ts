/* =============================================================================
   El repositorio documental, en una sola lista.

   Hasta ahora "Documentos de soporte del plan" enseñaba solo la tabla
   `documents`: enlaces a archivos que viven fuera del portal, capturados a
   mano. Desde el módulo de proyectos hay una segunda fuente —el documento que
   formula cada proyecto, subido al bucket "proyectos" de Storage— que no
   aparecía en ningún listado público. Quien buscaba la formulación de un
   proyecto tenía que entrar al pilar, encontrar el proyecto y abrir su ficha.

   Las dos fuentes se unen aquí y no en la pantalla porque son dos formas
   distintas del mismo objeto —algo que se descarga y respalda una cifra— y
   porque la pantalla no debería saber que una viene de una tabla y la otra de
   Storage.

   Lo que NO se hace: copiar los archivos de proyecto a `documents`. Serían dos
   registros del mismo archivo que se desincronizarían al primer reemplazo. La
   unión se calcula al leer.
   ========================================================================== */

import { fileExtension, formatBytes, projectFileUrl } from "./storage";
import type { PdiDocument, ProjectWithLinks } from "../types/database";

/** De dónde sale la entrada. Se muestra: el origen cambia qué es el documento. */
export type RepositorySource = "institucional" | "proyecto";

export interface RepositoryEntry {
  id: string;
  title: string;
  description: string;
  /** PDF, XLSX, DOCX… en mayúsculas, como lo espera `repo-item__kind`. */
  kind: string;
  url: string;
  sizeLabel: string | null;
  source: RepositorySource;
  /** Pilares a los que respalda. Vacío = documento institucional del plan. */
  pillarIds: string[];
  /** Para ordenar los institucionales entre sí; los de proyecto no la tienen. */
  position: number;
}

/** ".xlsx" → "XLSX". Sin extensión no se inventa nada: "ARCHIVO". */
function kindFromName(name: string | null): string {
  const extension = fileExtension(name ?? "").replace(".", "");
  return extension ? extension.toUpperCase() : "ARCHIVO";
}

/**
 * Une los documentos institucionales con los archivos de formulación.
 *
 * `projects` puede venir vacío —la consulta aún no ha resuelto, o RLS no deja
 * ver ninguno— y entonces la lista es la de siempre: la sección nunca depende
 * de que la segunda fuente responda.
 */
export function buildRepository(
  documents: PdiDocument[],
  projects: ProjectWithLinks[],
  pillarNameById: Map<string, string>,
): RepositoryEntry[] {
  const institutional: RepositoryEntry[] = documents.map((document) => ({
    id: `doc:${document.id}`,
    title: document.title,
    description: document.description,
    kind: document.kind,
    url: document.url,
    sizeLabel: document.size_label,
    source: "institucional",
    pillarIds: document.pillar_id ? [document.pillar_id] : [],
    position: document.position,
  }));

  const formulation: RepositoryEntry[] = [];
  for (const project of projects) {
    const url = projectFileUrl(project.attachment_path);
    // Sin archivo no hay entrada: un proyecto sin documento cargado no es una
    // fila vacía del repositorio, es un proyecto que aún no lo ha subido.
    if (!url) continue;

    const pillarIds = project.pillar_ids?.length
      ? project.pillar_ids
      : project.pillar_id
        ? [project.pillar_id]
        : [];

    // De qué pilar habla el documento. Es lo que distingue dos formulaciones
    // en una lista larga, así que va en la descripción y no solo en un filtro.
    const pillars = pillarIds
      .map((id: string) => pillarNameById.get(id))
      .filter(Boolean)
      .join(" · ");

    formulation.push({
      id: `project:${project.id}`,
      title: project.attachment_name ?? `Formulación · ${project.name}`,
      description: pillars ? `${project.name} · ${pillars}` : project.name,
      kind: kindFromName(project.attachment_name),
      url,
      sizeLabel: formatBytes(project.attachment_size) || null,
      source: "proyecto",
      pillarIds,
      position: 0,
    });
  }

  // Los institucionales primero y en el orden que les dio la intranet: son la
  // referencia del plan. Las formulaciones van detrás, alfabéticas, porque
  // entre ellas no hay ninguna jerarquía que respetar.
  formulation.sort((a, b) => a.description.localeCompare(b.description, "es"));
  institutional.sort((a, b) => a.position - b.position);

  return [...institutional, ...formulation];
}

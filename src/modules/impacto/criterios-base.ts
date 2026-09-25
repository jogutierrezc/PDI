/* =============================================================================
   Diccionario base del motor de alineación.

   Es el punto de partida estandarizado: la carga inicial de `imp_criteria`
   sale de aquí (migración 0080) y desde la intranet se ajusta, se amplía o se
   reemplaza con un Excel. El motor lee la base, no este archivo.

   Los pilares van por su posición en el PDI (1 Personalización … 6 Apropiación
   social); los ODS, por su número. Una frase cuenta solo si sus palabras
   aparecen seguidas en la ficha. Pesos: 3 lo define, 2 lo sugiere, 1 lo
   acompaña.

   Salió de dos fuentes: lo que el PDI dice de cada pilar y los 92 indicadores
   de la matriz vr7 que ya traían pilares y ODS asignados (las palabras que más
   separan a cada destino). La prueba del motor mide contra esa matriz.
   ========================================================================== */

import type { AlignmentTarget } from "./motor";

export interface BaseCriterion {
  target: AlignmentTarget;
  /** Posición del pilar (1–6) o número del ODS (1–17). */
  key: number;
  term: string;
  weight: number;
}

const p = (key: number, weight: number, ...terms: string[]): BaseCriterion[] =>
  terms.map((term) => ({ target: "pilar", key, term, weight }));
const o = (key: number, weight: number, ...terms: string[]): BaseCriterion[] =>
  terms.map((term) => ({ target: "ods", key, term, weight }));

export const BASE_CRITERIA: BaseCriterion[] = [
  // I · Personalización: formación pertinente, aprendizaje, trayectoria del estudiante.
  ...p(1, 3, "estudiante", "semillero", "aprendizaje", "permanencia", "deserción", "graduación", "flexibilidad curricular"),
  ...p(1, 2, "formación", "graduado", "retención", "saber pro", "competencias", "jóvenes investigadores", "movilidad académica", "maestría", "doctorado", "posgrado", "profesor", "trabajo de grado", "acompañamiento"),
  ...p(1, 1, "programa académico", "egresado", "empleabilidad", "educación continuada"),

  // II · Ambiente tecnológico: transformación digital, tecnologías, infraestructura.
  ...p(2, 3, "tecnología", "tecnológico", "tecnológica", "digital", "virtual", "software", "trl", "infraestructura científica"),
  ...p(2, 2, "propiedad intelectual", "registro de software", "patente", "licencia", "desarrollo tecnológico", "validado", "plataforma", "laboratorio", "dtt", "cesión"),
  ...p(2, 1, "innovación", "infraestructura", "inventario"),

  // III · Entorno emprendedor: investigación aplicada, innovación, sector productivo.
  ...p(3, 3, "emprendimiento", "emprendedor", "spin off", "startup", "convocatoria", "investigación", "innovación", "sector productivo"),
  ...p(3, 2, "proyecto de investigación", "banco de proyectos", "consultoría", "servicio técnico", "transferencia", "grupo de investigación", "investigador", "nuevo conocimiento", "empresa", "empresarial", "semillero"),
  ...p(3, 1, "proyecto", "producto", "ejecutado", "formulado", "presentado", "científica"),

  // IV · Gobernanza: gestión, calidad, transparencia, reconocimiento institucional.
  ...p(4, 3, "gobierno", "gobernanza", "acreditación", "autoevaluación", "política pública", "normativa", "rendición de cuentas"),
  ...p(4, 2, "presupuesto", "categorizado", "minciencias", "reconocido", "ranking", "calidad", "evaluación profesoral", "planta profesoral", "plan de mejoramiento", "órgano"),
  ...p(4, 1, "institucional", "gestión", "convocatoria interna"),

  // V · Sostenibilidad: ambiental, ODS, viabilidad financiera.
  ...p(5, 3, "sostenibilidad", "sostenible", "ambiental", "ods", "cambio climático", "medio ambiente", "huella"),
  ...p(5, 2, "recursos naturales", "financiera", "ingresos", "residuos", "energía", "agenda 2030"),
  ...p(5, 1, "plan de desarrollo", "responsabilidad social"),

  // VI · Apropiación social: territorio, comunidad, extensión, alianzas.
  ...p(6, 3, "apropiación social", "comunidad", "territorio", "territorial", "regional", "extensión", "proyección social", "beneficiario"),
  ...p(6, 2, "social", "participante", "alianza", "intersectorial", "interinstitucional", "colaboración", "divulgación", "socialización", "evento", "municipio", "cultural", "patrimonio", "inclusión", "sector externo", "internacional"),
  ...p(6, 1, "desarrollo", "población", "reconocimiento", "impacto"),

  // Los ODS: cada uno con sus palabras.
  ...o(1, 3, "pobreza", "vulnerable"),
  ...o(1, 2, "población atendida", "proyección social", "comunidad vulnerable"),
  ...o(2, 3, "hambre", "seguridad alimentaria", "nutrición", "agropecuario"),
  ...o(3, 3, "salud", "bienestar", "psicosocial", "salud mental", "calidad de vida"),
  ...o(3, 1, "participante"),
  ...o(4, 3, "estudiante", "educación", "aprendizaje", "formación", "semillero", "graduación", "deserción", "permanencia", "saber pro", "acreditación"),
  ...o(4, 2, "graduado", "profesor", "docente", "programa académico", "posgrado", "maestría", "doctorado", "jóvenes investigadores", "trabajo de grado", "movilidad académica", "educación continuada", "diplomado", "curso"),
  ...o(5, 3, "género", "mujer", "equidad de género"),
  ...o(6, 3, "agua", "saneamiento"),
  ...o(7, 3, "energía", "energía renovable"),
  ...o(8, 3, "empleo", "empleabilidad", "trabajo decente", "emprendimiento", "empleador"),
  ...o(8, 2, "sector productivo", "empresa", "empresarial", "práctica", "práctica profesional", "cargo", "consultoría", "crecimiento económico", "servicio técnico"),
  ...o(9, 3, "innovación", "investigación", "tecnología", "tecnológico", "tecnológica", "patente", "propiedad intelectual", "infraestructura"),
  ...o(9, 2, "convocatoria", "desarrollo tecnológico", "software", "licencia", "dtt", "trl", "nuevo conocimiento", "banco de proyectos", "consultoría", "producto científico"),
  ...o(9, 1, "proyecto", "servicio"),
  ...o(10, 3, "desigualdad", "inclusión", "equidad", "diversidad", "discapacidad", "beca"),
  ...o(10, 2, "estímulo", "vulnerable", "acceso"),
  ...o(11, 3, "territorio", "territorial", "ciudad", "municipio", "comunidad", "patrimonio"),
  ...o(11, 2, "regional", "desarrollo regional", "problema del territorio", "cultural", "vinculación"),
  ...o(12, 3, "consumo responsable", "producción responsable", "residuos", "economía circular"),
  ...o(13, 3, "clima", "cambio climático", "carbono", "huella"),
  ...o(13, 2, "ambiental"),
  ...o(14, 3, "marina", "océano", "submarina"),
  ...o(15, 3, "biodiversidad", "ecosistema", "bosque"),
  ...o(15, 2, "ambiental"),
  ...o(16, 3, "paz", "justicia", "gobernanza", "política pública", "normativa", "transparencia", "participación ciudadana"),
  ...o(16, 2, "gobierno", "institución", "órgano", "representante"),
  ...o(17, 3, "alianza", "convenio", "cooperación", "red", "internacional", "interinstitucional"),
  ...o(17, 2, "colaboración", "intersectorial", "transferencia", "externa", "sector externo", "movilidad"),
];

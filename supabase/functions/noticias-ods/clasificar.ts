/* =============================================================================
   Recolector de noticias · clasificación por ODS (sin IA, sin red).

   Una noticia recibe los ODS cuyas palabras aparecen en su título y su texto.
   Cada ODS tiene frases y raíces (sin tildes, en minúscula): una raíz como
   «vacun» cubre vacuna, vacunación, vacunar. Una frase cuenta más que una raíz
   suelta y el título pesa el triple que el texto.

   El puntaje (0 a 100) crece rápido con las primeras coincidencias y se frena
   después: dos notas sobre el mismo tema no deben diferir por una repetición.
   Solo se guardan los ODS con 35 o más y, como mucho, los tres mejores. La
   razón dice qué palabras la sostienen, para que quien revisa decida rápido.

   Este archivo no usa Deno ni el navegador: lo importan la función
   `noticias-ods` y las pruebas (tests/noticias).
   ========================================================================== */

export const UMBRAL = 35;
export const MAX_ODS = 3;

/** [raíces sueltas, frases]. Todo sin tildes y en minúscula. */
const LEXICO: Record<number, { raices: string[]; frases: string[] }> = {
  1: { raices: ["pobreza", "vulnerab", "subsidio", "mendic", "inclusion social"], frases: ["bajos recursos", "estratos 1", "estrato 1", "capital semilla", "poblacion vulnerable", "sin hogar"] },
  2: { raices: ["hambre", "nutric", "alimentari", "agricult", "cultivo", "campesin", "cosecha", "seguridad alimentaria"], frases: ["soberania alimentaria", "huerta", "producción agricola"] },
  3: { raices: ["salud", "vacun", "enfermer", "medicin", "clinic", "hospital", "bienestar", "psicolog", "tamizaje", "epidemi", "nutricion", "odontolog", "fisioterap", "terapia"], frases: ["salud mental", "salud publica", "atencion materno", "estilos de vida saludable", "prevencion de"] },
  // «estudiante», «docente» o «curso» salen en casi toda nota de una universidad: no distinguen y no cuentan.
  4: { raices: ["beca", "aprendizaje", "pedagog", "semillero", "colegio", "bachiller", "diplomado", "alfabetiz", "educacion"], frases: ["educacion superior", "calidad educativa", "acceso a la educacion", "pruebas saber", "formacion docente", "movilidad academica"] },
  5: { raices: ["mujer", "genero", "equidad", "feminis", "gestante", "violencia de genero"], frases: ["igualdad de genero", "liderazgo femenino", "mujeres emprendedoras", "mujeres lideres"] },
  6: { raices: ["agua", "acueducto", "saneamiento", "potabiliz", "cuenca", "rio ", "hidric", "alcantarill"], frases: ["agua potable", "calidad del agua", "recurso hidrico"] },
  7: { raices: ["energia", "solar", "fotovolta", "renovable", "eolic", "eficiencia energetica"], frases: ["energia limpia", "energia solar", "paneles solares"] },
  8: { raices: ["empleo", "emprend", "empresari", "productividad", "trabajo decente", "laboral", "economia", "mipyme", "pyme"], frases: ["trabajo decente", "crecimiento economico", "yo emprendo", "plan de negocio"] },
  9: { raices: ["innovacion", "tecnolog", "investigacion", "prototipo", "infraestructura", "industria", "laboratorio", "patente", "ingenieri", "robotic", "software", "desarrollo tecnologico"], frases: ["ciencia y tecnologia", "investigacion e innovacion", "semana de la ciencia", "transferencia tecnologica"] },
  10: { raices: ["desigualdad", "inclusion", "discapacidad", "migrante", "indigena", "afrodescend", "brecha", "diversidad", "accesibilidad"], frases: ["poblacion vulnerable", "personas con discapacidad", "reduccion de brechas", "poblacion rural", "adulto mayor", "adultos mayores"] },
  11: { raices: ["ciudad", "urban", "movilidad", "patrimonio", "transporte publico", "vivienda", "espacio publico", "residuos", "reciclaj"], frases: ["ciudades sostenibles", "gestion de residuos", "transporte sostenible", "area metropolitana"] },
  12: { raices: ["reciclaj", "residuos", "consumo responsable", "economia circular", "sostenib", "compost", "reutiliz"], frases: ["economia circular", "produccion limpia", "consumo responsable", "gestion de residuos"] },
  13: { raices: ["clima", "climatic", "ambiental", "carbono", "emision", "calentamiento", "siembra", "arbol", "reforest", "huella de", "contaminacion", "calidad del aire", "biodiversidad"], frases: ["cambio climatico", "huella de carbono", "calidad del aire", "gestion ambiental", "arboles nativos", "adaptacion climatica"] },
  14: { raices: ["oceano", "marin", "pesca", "costero", "arrecife"], frases: ["vida submarina", "recursos marinos"] },
  15: { raices: ["bosque", "ecosistema", "fauna", "flora", "deforest", "biodivers", "paramo", "especies nativas", "conservacion"], frases: ["vida de ecosistemas terrestres", "especies nativas", "areas protegidas"] },
  16: { raices: ["justicia", "paz", "derecho", "victima", "juridic", "consultorio", "conflicto", "transparencia", "institucion solida", "democracia", "derechos humanos"], frases: ["acceso a la justicia", "derechos humanos", "consultorio juridico", "construccion de paz", "victimas del conflicto"] },
  17: { raices: ["alianza", "convenio", "cooperacion", "red de", "internacionaliz", "intercambio", "aliado"], frases: ["alianza estrategica", "trabajo en red", "firma de convenio", "cooperacion internacional", "movilidad internacional"] },
};

export const sinTildes = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function contar(texto: string, aguja: string): number {
  let n = 0;
  let i = texto.indexOf(aguja);
  while (i !== -1 && n < 6) {
    n++;
    i = texto.indexOf(aguja, i + aguja.length);
  }
  return n;
}

export interface Afinidad {
  ods: number;
  score: number;
  reason: string;
}

/** Los ODS de una noticia, del más al menos afín. Vacío si ninguno llega al umbral. */
export function clasificar(titulo: string, texto: string): Afinidad[] {
  const t = ` ${sinTildes(titulo)} `;
  const x = ` ${sinTildes(texto).slice(0, 6000)} `;
  const salida: Afinidad[] = [];
  for (const [clave, lex] of Object.entries(LEXICO)) {
    let peso = 0;
    const pruebas: string[] = [];
    const sumar = (aguja: string, valor: number) => {
      const enT = contar(t, aguja);
      const enX = contar(x, aguja);
      if (!enT && !enX) return;
      peso += valor * (enT * 3 + Math.min(enX, 3));
      pruebas.push(aguja.trim());
    };
    lex.frases.forEach((f) => sumar(sinTildes(f), 4));
    lex.raices.forEach((r) => sumar(sinTildes(r), 1.5));
    if (!peso) continue;
    const score = Math.round(100 * (1 - Math.exp(-peso / 14)));
    if (score < UMBRAL) continue;
    const unicas = [...new Set(pruebas)].slice(0, 4);
    salida.push({ ods: Number(clave), score, reason: "Menciona " + unicas.join(", ") });
  }
  return salida.sort((a, b) => b.score - a.score).slice(0, MAX_ODS);
}

/** Un extracto de unas 40 palabras, cortado en el final de una frase si cabe. */
export function extracto(texto: string, palabras = 40): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  const trozos = limpio.split(" ");
  if (trozos.length <= palabras) return limpio;
  const corte = trozos.slice(0, palabras).join(" ");
  const punto = corte.lastIndexOf(". ");
  return punto > corte.length * 0.55 ? corte.slice(0, punto + 1) : corte.replace(/[,;:\s]+$/, "") + "…";
}

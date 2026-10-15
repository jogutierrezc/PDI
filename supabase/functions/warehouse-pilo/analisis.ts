/* =============================================================================
   Warehouse UDES · el análisis de Pilo (lógica pura, sin red).

   Pilo recibe un resumen AGREGADO de las alertas (conteos por nivel, programas,
   materias críticas, evolución por corte): nunca códigos de estudiante ni
   notas individuales. Con eso, y con lo que dice el estudio de la UDES sobre
   alertas tempranas (Pérez et al., 2023; DOI 10.37885/230914480), explica qué
   pasa, por qué podría pasar y qué haría cada actor.

   Regla de oro, la misma de los informes: Pilo no inventa cifras. Todo número
   de su texto tiene que estar en los datos o en el estudio; si cita uno que no
   está, se le devuelve el error una vez, y si insiste se entrega el texto con
   un aviso que lo señala. No decide, no sanciona y no nombra a nadie.
   ========================================================================== */

export interface DatosAnalisis {
  periodo: string;
  sede: string;
  /** El último corte con notas: 1, 2 o 3. */
  corte: number;
  alcance: { nivel: "institucion" | "facultad" | "programa"; nombre?: string };
  totales: { estudiantes: number; NE: number; ED: number; RS: number };
  evolucion?: { corte: number; promedio: number | null; pctRS: number | null }[];
  programas?: { nombre: string; estudiantes: number; NE: number; ED: number; RS: number; promedio: number | null }[];
  materias?: { nombre: string; estudiantes: number; pctBajo: number; promedio: number | null }[];
  /** Quiénes tienen más riesgo según el estudio: conteos por grupo etario y origen (si se cargaron). */
  contexto?: { grupoEtario?: Record<string, number>; origen?: Record<string, number> };
  umbrales?: Record<string, number>;
}

export interface Hallazgo {
  titulo: string;
  evidencia: string;
  accion: string;
  responsable: string;
}

export interface Analisis {
  titular: string;
  resumen: string;
  hallazgos: Hallazgo[];
  prioridades: string[];
  limites: string[];
}

export interface Mensaje {
  role: "system" | "user" | "assistant";
  content: string;
}

export type Lectura<T> = { ok: true; valor: T } | { ok: false; error: string };

/** Lo que Pilo sabe del estudio. Son las únicas cifras externas que puede citar. */
export const CONOCIMIENTO_UDES = `ESTUDIO DE LA UDES SOBRE ALERTAS TEMPRANAS (Pérez, Mejía, Serrano, Suescún y León, 2023):
- Escala de 0 a 5. Aprobar es 3,0; en Medicina, 3,5. Un promedio por debajo de 3,2 al cerrar el periodo implica periodo de prueba académica. El éxito estudiantil se mide con un promedio superior a 3,8.
- Deserción (cohortes 2017 a 2020): con promedio bajo (menor a 3,3) es 16,7 veces más probable desertar que con promedio alto (mayor a 4,3); con promedio medio (3,3 a 4,3), 2,2 veces.
- Edad: entre 21 y 25 años, 3,1 veces más probable desertar; con 26 años o más, 5,1 veces, frente a menores de 20.
- Venir de fuera de Santander: 1,4 veces más probable desertar.
- Las tutorías académicas ayudan: quien asiste a 7 o más tutorías tiene 3,8 veces más probabilidad de lograr un promedio alto en primer semestre que quien nunca asiste.
- Las deficiencias en matemáticas y lectura de la educación media se reflejan en altas tasas de reprobación en primer y segundo semestre.
- Ruta institucional: el Programa de Acompañamiento para el Ingreso y la Permanencia Estudiantil (PAIPE) interviene en lo psicosocial, institucional, académico y financiero. Para los cursos con alta reprobación participan la Dirección de Gestión Curricular, la Dirección de Desarrollo Profesoral, la Dirección de Desarrollo Estudiantil y las Direcciones de Programa.
- Son asociaciones de un estudio de cohortes, no una predicción de ninguna persona.`;

/** Los números del estudio que el texto puede repetir. */
const NUMEROS_ESTUDIO = [0, 5, 3, 3.5, 3.2, 3.8, 3.3, 4.3, 16.7, 2.2, 3.1, 5.1, 1.4, 7, 2017, 2020, 2023, 21, 25, 26, 20, 1, 2];

const SISTEMA = `Eres Mr. Pilo, el asistente de la Universidad de Santander (UDES). Analizas el sistema de alertas tempranas de notas para decanaturas, direcciones de programa y Planeación. Hablas en español de Colombia, claro, cálido y directo.

${CONOCIMIENTO_UDES}

REGLAS
1. Usa SOLO cifras que estén en los DATOS o en el estudio de arriba. Si necesitas un porcentaje que no está, no lo calcules ni lo redondees: descríbelo con palabras («cerca de la mitad», «la mayoría»).
2. No nombres ni identifiques a ningún estudiante, docente ni programa que no esté en los DATOS. No hay códigos de estudiante en los datos y no debes pedirlos.
3. Las clasificaciones son Nivel Esperado (NE), En Desarrollo (ED) y Requiere Seguimiento (RS). No son una calificación del estudiante ni una sanción: son una señal para acompañar.
4. Distingue lo que muestran los datos de lo que sería una hipótesis. No afirmes causas: di «podría estar relacionado con…» y qué dato habría que mirar para confirmarlo.
5. Cada hallazgo termina en una acción concreta con un responsable (Dirección de Programa, Decanatura, Gestión Curricular, Desarrollo Profesoral, Desarrollo Estudiantil, tutorías, PAIPE).
6. Si los datos son pocos o el corte es temprano, dilo en «limites».

RESPONDE SOLO UN OBJETO JSON, sin texto antes ni después, con esta forma:
{"titular": "una frase", "resumen": "2 a 4 frases", "hallazgos": [{"titulo": "", "evidencia": "con cifras de los DATOS", "accion": "", "responsable": ""}], "prioridades": ["3 a 5 acciones en orden"], "limites": ["lo que estos datos no permiten afirmar"]}
Entre 3 y 6 hallazgos.`;

export function mensajesAnalisis(datos: DatosAnalisis, pregunta: string): Mensaje[] {
  const alcance = datos.alcance.nivel === "institucion" ? "toda la institución" : `${datos.alcance.nivel === "facultad" ? "la facultad" : "el programa"} ${datos.alcance.nombre ?? ""}`.trim();
  return [
    { role: "system", content: SISTEMA },
    {
      role: "user",
      content: `Analiza ${alcance} en el periodo ${datos.periodo}, corte ${datos.corte}.${pregunta ? ` La persona pregunta: «${pregunta}»` : ""}\n\nDATOS (JSON):\n${JSON.stringify(datos)}`,
    },
  ];
}

/* --- Verificar las cifras --------------------------------------------------------------------- */

function numerosDe(valor: unknown, salida: Set<number>) {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    salida.add(valor);
    salida.add(Math.round(valor * 10) / 10);
    salida.add(Math.round(valor));
  } else if (typeof valor === "string") {
    for (const m of valor.matchAll(/\d+(?:[.,]\d+)?/g)) salida.add(Number(m[0].replace(",", ".")));
  } else if (Array.isArray(valor)) valor.forEach((v) => numerosDe(v, salida));
  else if (valor && typeof valor === "object") Object.values(valor).forEach((v) => numerosDe(v, salida));
}

/** Los números que el texto puede citar: los de los datos, los del estudio y las sumas simples entre conteos. */
export function numerosPermitidos(datos: DatosAnalisis): Set<number> {
  const s = new Set<number>(NUMEROS_ESTUDIO);
  numerosDe(datos, s);
  // Un porcentaje de dos conteos de los datos (parte sobre total) también es legítimo.
  const t = datos.totales;
  if (t.estudiantes > 0) for (const n of [t.NE, t.ED, t.RS]) s.add(Math.round((1000 * n) / t.estudiantes) / 10), s.add(Math.round((100 * n) / t.estudiantes));
  for (const p of datos.programas ?? []) if (p.estudiantes > 0) for (const n of [p.NE, p.ED, p.RS]) s.add(Math.round((1000 * n) / p.estudiantes) / 10), s.add(Math.round((100 * n) / p.estudiantes));
  return s;
}

/** Cifras del texto que no están en los datos ni en el estudio. Los años y los números de un dígito sueltos no cuentan. */
export function cifrasNoRespaldadas(texto: string, permitidos: Set<number>): string[] {
  const fuera: string[] = [];
  for (const m of texto.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = Number(m[0].replace(",", "."));
    if (!Number.isFinite(n)) continue;
    const entero = Number.isInteger(n);
    if (entero && n <= 9) continue;
    const ok = [...permitidos].some((p) => Math.abs(p - n) < 0.051 || (entero && Math.abs(p - n) < 0.5));
    if (!ok) fuera.push(m[0]);
  }
  return [...new Set(fuera)];
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export interface AnalisisVerificado extends Analisis {
  /** Cifras citadas que no se pudieron respaldar: se muestran como aviso, no se ocultan. */
  avisos: string[];
}

/** Lee la respuesta de Pilo: un JSON con la forma pedida y cifras respaldadas. */
export function leerAnalisis(crudo: string, datos: DatosAnalisis): Lectura<AnalisisVerificado> {
  const limpio = crudo.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return { ok: false, error: "La respuesta no es un objeto JSON." };
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(limpio.slice(inicio, fin + 1)) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "La respuesta no es un JSON válido." };
  }
  const hallazgos: Hallazgo[] = (Array.isArray(j.hallazgos) ? j.hallazgos : [])
    .map((h) => {
      const o = (h ?? {}) as Record<string, unknown>;
      return { titulo: texto(o.titulo, 120), evidencia: texto(o.evidencia, 500), accion: texto(o.accion, 400), responsable: texto(o.responsable, 120) };
    })
    .filter((h) => h.titulo && h.evidencia && h.accion)
    .slice(0, 6);
  const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => texto(x, 300)).filter(Boolean).slice(0, max) : []);
  const a: Analisis = { titular: texto(j.titular, 200), resumen: texto(j.resumen, 900), hallazgos, prioridades: lista(j.prioridades, 5), limites: lista(j.limites, 5) };
  if (!a.titular || !a.resumen) return { ok: false, error: "Falta el titular o el resumen." };
  if (a.hallazgos.length < 2) return { ok: false, error: "Se piden entre 3 y 6 hallazgos, cada uno con evidencia y acción." };

  const todo = [a.titular, a.resumen, ...a.hallazgos.flatMap((h) => [h.titulo, h.evidencia, h.accion]), ...a.prioridades, ...a.limites].join(" ");
  const fuera = cifrasNoRespaldadas(todo, numerosPermitidos(datos));
  // Unas pocas cifras sueltas se avisan; varias seguidas indican que Pilo se puso a calcular por su cuenta.
  if (fuera.length > 3) return { ok: false, error: `Citaste cifras que no están en los DATOS ni en el estudio: ${fuera.slice(0, 8).join(", ")}. Usa solo cifras literales de los DATOS o del estudio, o descríbelo con palabras.` };
  return { ok: true, valor: { ...a, avisos: fuera.map((c) => `La cifra «${c}» no se pudo comprobar en los datos.`) } };
}

/** ¿Los datos que llegan son razonables? Evita enviar a la IA un cuerpo enorme o sin sentido. */
export function validarDatos(d: unknown): Lectura<DatosAnalisis> {
  const o = d as Partial<DatosAnalisis> | null;
  if (!o || typeof o !== "object") return { ok: false, error: "Faltan los datos del análisis." };
  if (!/^\d{4}[ab]$/.test(String(o.periodo ?? ""))) return { ok: false, error: "Falta el periodo." };
  if (![1, 2, 3].includes(Number(o.corte))) return { ok: false, error: "Falta el corte (1, 2 o 3)." };
  const t = o.totales;
  if (!t || ![t.estudiantes, t.NE, t.ED, t.RS].every((n) => Number.isFinite(n) && n >= 0)) return { ok: false, error: "Faltan los totales por nivel." };
  if (t.estudiantes === 0) return { ok: false, error: "No hay estudiantes con notas en este alcance." };
  if (!o.alcance || !["institucion", "facultad", "programa"].includes(o.alcance.nivel)) return { ok: false, error: "Falta el alcance." };
  if (JSON.stringify(o).length > 60_000) return { ok: false, error: "El resumen es demasiado grande: envíe solo los 12 programas y 10 materias principales." };
  return {
    ok: true,
    valor: {
      periodo: String(o.periodo),
      sede: String(o.sede ?? ""),
      corte: Number(o.corte),
      alcance: { nivel: o.alcance.nivel, nombre: texto(o.alcance.nombre, 120) || undefined },
      totales: { estudiantes: t.estudiantes, NE: t.NE, ED: t.ED, RS: t.RS },
      evolucion: Array.isArray(o.evolucion) ? o.evolucion.slice(0, 3) : undefined,
      programas: Array.isArray(o.programas) ? o.programas.slice(0, 12) : undefined,
      materias: Array.isArray(o.materias) ? o.materias.slice(0, 10) : undefined,
      contexto: o.contexto,
      umbrales: o.umbrales,
    },
  };
}

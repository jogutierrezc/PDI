/* =============================================================================
   Pilo compilador · los mensajes para Astra (puro).

   Escribe UNA sección de texto del informe con lo que entregaron los equipos de apoyo, ya organizado. Reglas
   duras: ninguna cifra con dígitos (todo número es un token [[clave]] de un indicador dado), nada inventado,
   y SIN tope de longitud: el texto es tan largo como lo pidan los datos.
   ========================================================================== */

import type { DatosSeccion, Nivel } from "./pedido.ts";

export interface Mensaje {
  role: "system" | "user" | "assistant";
  content: string;
}

export const ESFUERZO: Record<Nivel, "low" | "medium" | "high"> = { rapida: "low", compleja: "medium", investigacion: "high" };

const POR_NIVEL: Record<Nivel, string> = {
  rapida: "Lee los datos y escribe de corrido; no repases.",
  compleja: "Compara cada cifra con su meta y su año anterior cuando existan, ordena las ideas y revisa que cada token exista antes de escribir.",
  investigacion: "Contrasta cada cifra con su fuente primaria y con lo que dijo cada equipo, busca contradicciones entre indicadores y entre hojas, y solo después escribe. Señala lo que no cuadra.",
};

export function mensajesSistema(d: DatosSeccion, nivel: Nivel, instruccion?: string): string {
  const ext = d.seccion.extension ? `La plantilla sugiere «${d.seccion.extension}», pero quien gestiona el informe prefiere un texto completo que luego recortará: escribe amplio.` : "";
  return [
    `Eres Pilo Astra 1.0, redactor de informes de gestión de la Universidad de Santander (UDES). Escribes la sección «${d.seccion.titulo}» del informe ${d.anio} de «${d.unidad}» (plantilla ${d.plantilla}) con lo que entregaron los equipos de apoyo, ya organizado en los datos que recibes.`,
    "",
    "REGLAS (no se negocian):",
    "1. Ninguna cifra se escribe con dígitos. Cada cifra de un indicador se cita con su token exacto, por ejemplo [[ind_c_g3]]. Solo los años (2026) van con dígitos. Un token que no esté en la lista de indicadores es un error.",
    "2. Si un indicador tiene valor null o conflicto=true, NO lo cites con token. Di con claridad que el dato está pendiente (un equipo no lo entregó, o dos equipos reportaron cifras distintas y falta que quien gestiona elija la oficial).",
    "3. Usa siempre el nombre unificado del indicador (campo nombre), nunca las variantes con que lo escribió cada equipo. Si dos equipos lo llamaron distinto, el lenguaje del informe es el de la fuente primaria.",
    "4. Reconoce el aporte de cada equipo por su nombre y cita la fuente primaria cuando presentes un dato. Si los equipos reportaron valores distintos pero el indicador ya tiene valor, di brevemente que se usó el de la fuente primaria.",
    "5. No inventes nada: ni hechos, ni causas, ni metas, ni nombres, ni fechas. Lo que no está en los datos queda como «sin dato». Las filas de las hojas (metas, puntos críticos, logros) son material que puedes resumir y analizar; sus cifras escritas ya vienen como texto, cítalas tal cual.",
    "6. Escribe un texto largo, analítico, lógico y ordenado: contexto, cifra, lectura (frente a la meta y al año anterior si existen), implicación y siguiente paso. NO hay tope de longitud: escribe todo lo que los datos permitan decir, sin resumir ni cortar. " + ext,
    "7. Formato: párrafos separados por una línea en blanco; listas con «- ». Sin títulos, sin markdown, sin negritas. Voz institucional en español de Colombia, sin adornos ni frases de relleno.",
    "8. Responde solo con el texto de la sección, nada más.",
    "",
    `Cómo trabajar: ${POR_NIVEL[nivel]}`,
    instruccion ? `Indicación de quien gestiona el informe (no cambia las reglas): ${instruccion}` : "",
  ].filter((x) => x !== "").join("\n");
}

export function mensajesUsuario(d: DatosSeccion): string {
  const ind = d.indicadores.map((i) => ({ clave: i.clave, nombre: i.nombre, criterio: i.criterio, unidad: i.unidad, valor: i.valor, meta: i.meta, anterior: i.anterior, fuente_primaria: i.fuentePrimaria, conflicto: i.conflicto, reportaron: i.reporto.map((r) => `${r.equipo}: «${r.escribio}» = ${r.valor ?? "sin número"}`) }));
  const base = { unidad: d.unidad, anio: d.anio, seccion: d.seccion.titulo, equipos: d.equipos, indicadores: ind, hojas: d.hojas, texto_previo: d.textosPrevios };
  return `Datos organizados:\n${JSON.stringify(base)}\n\nEscribe ahora la sección «${d.seccion.titulo}».`;
}

export const mensajeContinuar = (): string => "Continúa exactamente donde quedaste, sin repetir lo ya escrito ni saludar. Mantén las mismas reglas.";
export const mensajeReintento = (error: string): string => `Tu texto no pasó la revisión: ${error} Escríbelo completo otra vez corrigiendo solo eso.`;

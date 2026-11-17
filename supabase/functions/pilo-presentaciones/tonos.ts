/* =============================================================================
   Pilo presentaciones · las cuatro voces.

   El tono cambia SOLO la redacción (títulos, verbos, longitud de las frases):
   nunca los hechos, las cifras ni lo que el informe dice. Español de Colombia.
   Módulo puro, sin red ni base.
   ========================================================================== */

export const TONOS = ["institucional", "cercano", "ejecutivo", "academico"] as const;
export type Tono = (typeof TONOS)[number];

export interface InfoTono {
  id: Tono;
  nombre: string;
  /** Una línea para la persona que elige. */
  ayuda: string;
  /** Reglas de redacción para el modelo. */
  reglas: string[];
  /** Ejemplos cortos de la voz (con hechos de mentira: solo muestran el estilo). */
  ejemplos: string[];
}

export const INFO_TONOS: Record<Tono, InfoTono> = {
  institucional: {
    id: "institucional",
    nombre: "Institucional",
    ayuda: "Sobrio y formal, para consejos, directivos y entes externos.",
    reglas: [
      "Tercera persona y verbos en pasado o presente: «La unidad ejecutó», «El plan registra».",
      "Títulos que nombran el tema como lo nombra el informe, sin adjetivos de énfasis.",
      "Frases completas de 12 a 20 palabras; sin coloquialismos ni signos de exclamación.",
      "Cita la fuente o el anexo cuando el informe lo da.",
    ],
    ejemplos: ["Resultados por dimensión", "La unidad reporta avance en tres de sus cuatro dimensiones."],
  },
  cercano: {
    id: "cercano",
    nombre: "Cercano",
    ayuda: "Cálido y directo, para el equipo y la comunidad académica.",
    reglas: [
      "Primera persona del plural cuando el informe lo permite: «Avanzamos», «Nos falta».",
      "Títulos en forma de frase corta y concreta; una pregunta a lo sumo por presentación.",
      "Frases de 8 a 14 palabras; vocabulario cotidiano de Colombia, sin jerga ni modismos.",
      "Reconoce lo logrado sin exagerar: nada de «increíble» ni «extraordinario».",
    ],
    ejemplos: ["Lo que logramos este año", "Cerramos la mitad de las acciones y el resto sigue en marcha."],
  },
  ejecutivo: {
    id: "ejecutivo",
    nombre: "Ejecutivo",
    ayuda: "Breve y con la conclusión primero, para decidir rápido.",
    reglas: [
      "La conclusión va primero y el detalle después; títulos que son la conclusión.",
      "Frases de 6 a 12 palabras, sin subordinadas; verbos de acción en presente.",
      "Una idea por tarjeta o fila; menos texto, más cifras del informe.",
      "Señala lo pendiente y lo que requiere decisión, sin suavizarlo.",
    ],
    ejemplos: ["Cumplimiento: 2 de 5 acciones cerradas", "Pendiente: tres acciones sin iniciar."],
  },
  academico: {
    id: "academico",
    nombre: "Académico",
    ayuda: "Preciso y con respaldo, para pares, comités y acreditación.",
    reglas: [
      "Redacción precisa con términos del informe; define el indicador antes de citar su valor.",
      "Cada afirmación con su respaldo: anexo, fuente o plan, tal como los nombra el informe.",
      "Frases de 14 a 22 palabras; conectores lógicos («por tanto», «en relación con»).",
      "Distingue lo medido de lo proyectado y lo reportado de lo verificado.",
    ],
    ejemplos: ["Indicadores de permanencia y su respaldo documental", "El valor reportado se sustenta en el Anexo 3 y en el corte de la fuente indicada."],
  },
};

export const esTono = (v: unknown): v is Tono => typeof v === "string" && (TONOS as readonly string[]).includes(v);

/** El bloque de texto que se pone en el prompt para una voz. */
export function textoDeTono(t: Tono): string {
  const i = INFO_TONOS[t];
  return [`Voz «${i.nombre}»:`, ...i.reglas.map((r) => `- ${r}`), `Ejemplos de estilo (no son datos): ${i.ejemplos.map((e) => `«${e}»`).join(" · ")}`].join("\n");
}

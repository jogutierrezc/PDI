/* =============================================================================
   Encuestas con Pilo · plantillas de partida y paso de lo viejo al modelo nuevo.

   «Rendición de Cuentas 2026» es la estructura de la primera encuesta
   (rendicion-2026) escrita en el modelo nuevo; la migración 0184 guarda esta
   misma estructura como su versión 1 (una prueba compara ambas).
   ========================================================================== */

import type { Aporte } from "../tipos";
import type { Estructura, ItemBloque, Pregunta, Seccion, Valores } from "./estructura";

export type CodigoPlantilla = "rendicion" | "satisfaccion" | "evento" | "blanco";

export const ID_DEPENDENCIA = "dependencia";
export const ID_APORTES = "aportes";

const P = (p: Omit<Pregunta, "obligatoria"> & { obligatoria?: boolean }): Pregunta => ({ obligatoria: true, ...p });

const rendicion = (): Estructura => ({
  version: 1,
  secciones: [
    {
      id: "identificacion",
      titulo: "Identificación",
      preguntas: [
        P({
          id: ID_DEPENDENCIA,
          tipo: "texto_corto",
          enunciado: "Dependencia",
          apoyo: "Como la conoce la comunidad, por ejemplo Facultad de Ingenierías.",
          validaciones: { largoMin: 3, largoMax: 90 },
          pilo: { explicacion: "Escriba el nombre de su dependencia, como la conoce la comunidad. Por ejemplo: Facultad de Ingenierías o Bienestar Universitario." },
        }),
      ],
    },
    {
      id: "aportes_seccion",
      titulo: "Logros y retos",
      preguntas: [
        P({
          id: ID_APORTES,
          tipo: "bloque_logro_reto",
          enunciado: "Logros y retos de su dependencia",
          apoyo: "Cada uno lleva un título, una descripción y las cifras que lo respaldan.",
          validaciones: { maxItems: 30 },
          pilo: { explicacion: "Un logro es algo que su dependencia consiguió; un reto, lo que falta o exige más esfuerzo. Cada uno lleva una frase corta, una descripción y cifras reales que usted pueda respaldar." },
        }),
      ],
    },
  ],
});

const satisfaccion = (): Estructura => ({
  version: 1,
  secciones: [
    {
      id: "experiencia",
      titulo: "Su experiencia",
      preguntas: [
        P({ id: "servicio", tipo: "texto_corto", enunciado: "¿Qué servicio utilizó?", validaciones: { largoMax: 120 } }),
        P({
          id: "satisfaccion",
          tipo: "escala",
          enunciado: "¿Qué tan satisfecho quedó?",
          validaciones: { escalaMin: 1, escalaMax: 5, etiquetaMin: "Nada satisfecho", etiquetaMax: "Muy satisfecho" },
          pilo: { explicacion: "1 es nada satisfecho y 5 es muy satisfecho. Responda según su experiencia más reciente." },
        }),
        P({ id: "volveria", tipo: "opcion_unica", enunciado: "¿Volvería a usarlo?", opciones: [{ id: "si", texto: "Sí" }, { id: "tal_vez", texto: "Tal vez" }, { id: "no", texto: "No" }] }),
        P({ id: "porque_no", tipo: "parrafo", enunciado: "¿Qué debemos mejorar?", obligatoria: false, mostrarSi: { pregunta: "volveria", op: "distinto", valor: "si" }, validaciones: { largoMax: 800 } }),
        P({ id: "comentario", tipo: "parrafo", enunciado: "Comentarios adicionales", obligatoria: false, validaciones: { largoMax: 1000 } }),
      ],
    },
  ],
});

const evento = (): Estructura => ({
  version: 1,
  secciones: [
    {
      id: "asistente",
      titulo: "Sus datos",
      preguntas: [
        P({ id: "nombre", tipo: "texto_corto", enunciado: "Nombre completo", validaciones: { largoMax: 120 } }),
        P({ id: "correo", tipo: "contacto", enunciado: "Correo", validaciones: { formato: "correo" } }),
        P({ id: "telefono", tipo: "contacto", enunciado: "Teléfono", obligatoria: false, validaciones: { formato: "telefono" } }),
      ],
    },
    {
      id: "asistencia",
      titulo: "Su asistencia",
      preguntas: [
        P({ id: "dia", tipo: "opcion_multiple", enunciado: "¿A qué jornadas asistirá?", opciones: [{ id: "manana", texto: "Mañana" }, { id: "tarde", texto: "Tarde" }, { id: "noche", texto: "Noche" }] }),
        P({ id: "acompanantes", tipo: "cifra", enunciado: "Acompañantes", obligatoria: false, validaciones: { min: 0, max: 5, decimales: false, unidad: "personas" } }),
        P({ id: "restricciones", tipo: "parrafo", enunciado: "Restricciones alimentarias o de accesibilidad", obligatoria: false, validaciones: { largoMax: 500 } }),
      ],
    },
  ],
});

const blanco = (): Estructura => ({
  version: 1,
  secciones: [{ id: "seccion_1", titulo: "Sección 1", preguntas: [P({ id: "pregunta_1", tipo: "texto_corto", enunciado: "Primera pregunta" })] }],
});

export interface PlantillaEncuesta {
  codigo: CodigoPlantilla;
  nombre: string;
  descripcion: string;
  titulo: string;
  estructura: () => Estructura;
}

export const PLANTILLAS_ENCUESTA: readonly PlantillaEncuesta[] = [
  { codigo: "rendicion", nombre: "Rendición de Cuentas 2026", descripcion: "Logros y retos con cifras por dependencia, para los videos institucionales.", titulo: "Rendición de Cuentas Institucional", estructura: rendicion },
  { codigo: "satisfaccion", nombre: "Satisfacción", descripcion: "Una escala, una opción y comentarios.", titulo: "Encuesta de satisfacción", estructura: satisfaccion },
  { codigo: "evento", nombre: "Evento", descripcion: "Inscripción con datos de contacto y jornadas.", titulo: "Inscripción al evento", estructura: evento },
  { codigo: "blanco", nombre: "En blanco", descripcion: "Una sección y una pregunta para empezar de cero.", titulo: "Nueva encuesta", estructura: blanco },
];

export const plantillaDe = (codigo: string): PlantillaEncuesta | undefined => PLANTILLAS_ENCUESTA.find((p) => p.codigo === codigo);

/** Una copia profunda: el editor nunca toca la plantilla ni la versión publicada. */
export const copiar = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Lo que ya se recibió en la encuesta vieja (aportes con cifras de una dependencia) como
 * una respuesta del modelo nuevo: { dependencia, aportes: [...] }. Sirve para ver las
 * respuestas de rendicion-2026 con el mismo lector que las demás.
 */
export function aportesComoValores(dependencia: string, aportes: readonly Aporte[]): Valores {
  const items: ItemBloque[] = [...aportes]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((a) => ({
      tipo: a.tipo,
      titulo: a.titulo,
      descripcion: a.descripcion,
      cifras: [...a.cifras].sort((x, y) => x.orden - y.orden).map((c) => ({ que: c.que, tipo: c.tipo, ...(c.tipo === "otro" && c.otro ? { otro: c.otro } : {}), valor: c.valor })),
    }));
  return { [ID_DEPENDENCIA]: dependencia, [ID_APORTES]: items };
}

/** Una sección nueva para el editor. */
export const seccionNueva = (n: number): Seccion => ({ id: `seccion_${n}`, titulo: `Sección ${n}`, preguntas: [] });

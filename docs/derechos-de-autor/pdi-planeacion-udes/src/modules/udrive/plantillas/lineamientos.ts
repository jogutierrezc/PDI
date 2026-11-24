/* =============================================================================
   UDrive · plantilla «Lineamientos estratégicos».

   Sigue el informe «Lineamientos estratégicos de infraestructura física y
   tecnológica»: portada con título grande, contenido, un capítulo de
   presentación y las etapas del plan con sus apartados. El texto de cada
   apartado es una guía corta entre corchetes que la persona reemplaza; no hay
   cifras inventadas.
   ========================================================================== */

import { indicesPorDefecto, nuevoIdBloque } from "../lib/documento";
import type { Bloque, Documento, NivelCapitulo } from "../lib/documento";

const cap = (nivel: NivelCapitulo, titulo: string): Bloque => ({ id: nuevoIdBloque(), tipo: "capitulo", nivel, titulo });
const par = (texto: string): Bloque => ({ id: nuevoIdBloque(), tipo: "parrafo", texto });

export function lineamientos(titulo: string): Documento {
  return {
    version: 1,
    plantilla: "lineamientos",
    portada: { titulo: titulo || "Lineamientos estratégicos", subtitulo: "", entidad: "Universidad de Santander", anio: String(new Date().getFullYear()) },
    indices: indicesPorDefecto(),
    fuentes: [],
    bloques: [
      cap(1, "Presentación"),
      par("\\[Qué es este documento, para qué sirve y a quién va dirigido.]"),
      cap(1, "Aspectos generales"),
      cap(2, "La Universidad"),
      par("\\[Descripción breve de la institución y su contexto.]"),
      cap(2, "Lineamientos estratégicos"),
      cap(3, "Principios rectores del plan"),
      par("\\[Los principios que orientan las decisiones del plan.]"),
      cap(3, "Relación con los pilares del PDI"),
      par("\\[Cómo se conecta el plan con los pilares del Plan de Desarrollo Institucional.]"),
      cap(2, "Objetivos"),
      par("\\[Objetivo general y objetivos específicos.]"),
      cap(1, "Etapa 1. Diagnóstico"),
      cap(2, "Aspectos del diagnóstico"),
      par("\\[Qué se midió, con qué fuentes y en qué periodo. Use «Insertar cifra viva» para que los números sigan a UDES en Cifras.]"),
      cap(2, "Análisis de la situación actual"),
      par("\\[Hallazgos principales. Inserte aquí las tablas y gráficas de UDrive que los respaldan.]"),
      cap(1, "Etapa 2. Formulación"),
      cap(2, "Lineamientos y acciones"),
      par("\\[Los lineamientos formulados, con sus acciones y responsables.]"),
      cap(2, "Proyección y cronograma"),
      par("\\[Metas por periodo y ruta de ejecución.]"),
      cap(1, "Conclusiones y recomendaciones"),
      par("\\[Síntesis de lo encontrado y lo que se recomienda hacer.]"),
      { id: nuevoIdBloque(), tipo: "referencias", titulo: "Referencias" },
    ],
  };
}

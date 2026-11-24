/* =============================================================================
   SNIES · Inscritos – Relación de inscritos (§3.4.1).

   Personas que solicitan formalmente el ingreso a la institución. La hoja trae
   los datos básicos de la persona, así que no exige Participante; tampoco el
   manual valida aquí el número de documento (§3.4.15). No lleva programa:
   eso va en Inscritos Programa (§3.4.2).

   No todos los de primer curso pasan por aquí: transferencia interna, doble
   programa, ciclo propedéutico (2.º ciclo), entre seccionales, co-titulación,
   opción de grado e intercambio no requieren esta plantilla (§3.4.1).
   ========================================================================== */

import type { PlantillaSpec } from "../../tipos";
import { FECHAS_INGRESO, camposPeriodoYDocumento, periodoActual, reglaPeriodo, reglaRepetido } from "./comunes";

const SECCION = "§3.4.1 Inscritos";

export const INSCRITOS: PlantillaSpec = {
  id: "inscritos",
  nombre: "Inscritos – Relación de inscritos",
  modulo: "Población estudiantil",
  seccion: "§3.4.1",
  orden: 2,
  depende: [],
  fechas: FECHAS_INGRESO, // §2.6.1
  disponible: true,
  campos: [
    ...camposPeriodoYDocumento("§3.4.1", "Sin puntos, comas ni apóstrofes. No se cruza con Participante."),
    { codigo: "PRIMER_NOMBRE", etiqueta: "Primer nombre", grupo: "Nombre", obligatorio: true, formato: "texto", seccion: "§3.4.1" },
    { codigo: "SEGUNDO_NOMBRE", etiqueta: "Segundo nombre", grupo: "Nombre", obligatorio: false, formato: "texto", seccion: "§3.4.1" },
    { codigo: "PRIMER_APELLIDO", etiqueta: "Primer apellido", grupo: "Nombre", obligatorio: true, formato: "texto", seccion: "§3.4.1" },
    { codigo: "SEGUNDO_APELLIDO", etiqueta: "Segundo apellido", grupo: "Nombre", obligatorio: false, formato: "texto", seccion: "§3.4.1" },
    {
      codigo: "ID_SEXO_BIOLOGICO",
      etiqueta: "Sexo biológico",
      grupo: "Datos personales",
      obligatorio: true,
      fuente: { tipo: "dominio", dominio: "sexo_biologico" },
      ayuda: "Como aparece en el documento de identidad.",
      seccion: "§3.4.1",
    },
  ],
  reglas: [reglaPeriodo(SECCION)],
  reglasPlantilla: [
    // Una persona se relaciona una vez por periodo; los programas van en §3.4.2.
    reglaRepetido(
      SECCION,
      (n) => `Este documento ya está en la fila ${n}. Deje una sola fila por persona; los programas a los que aspira van en Inscritos Programa.`,
      (fila, ctx, h) => (h.vacio(fila.NUM_DOCUMENTO) ? null : `${h.documento(fila.NUM_DOCUMENTO)}||${periodoActual(ctx)}`),
    ),
  ],
};

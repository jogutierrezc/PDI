/* =============================================================================
   SNIES · Graduados (§3.4.8).

   Quienes recibieron el título en el periodo. Antes de cargar: la persona
   tiene que estar en Participante, haber estado matriculada en el programa
   en algún periodo, y no puede tener ya ese título en otro periodo. Las
   columnas van en el orden en que el manual las describe.
   ========================================================================== */

import type { ErrorFila, PlantillaSpec, ReglaFila, ReglaPlantilla } from "../../tipos";
import {
  camposPeriodoYDocumento,
  campoSede,
  clavePrograma,
  reglaOferta,
  reglaParticipante,
  reglaPeriodo,
  reglaRepetidoPrograma,
} from "./comunes";

const SECCION = "§3.4.8 Graduados";

/** «Se valida que la fecha de grado esté dentro del semestre reportado.» */
const fechaGrado: ReglaFila = (fila, ctx, h) => {
  if (h.vacio(fila.FECHA_GRADO)) return [];
  const d = h.fecha(fila.FECHA_GRADO);
  if (!d) return []; // el formato lo marca el motor
  const { anio, semestre } = ctx.periodo;
  // Semestre 1 = enero a junio; 2 = julio a diciembre (por confirmar con HECAA).
  const dentro = d.getFullYear() === anio && (semestre === 1 ? d.getMonth() <= 5 : d.getMonth() >= 6);
  if (dentro) return [];
  const rango = semestre === 1 ? `enero y junio de ${anio}` : `julio y diciembre de ${anio}`;
  return [
    {
      campo: "FECHA_GRADO",
      mensaje: `La fecha de grado cae fuera del periodo ${anio}-${semestre}: debe estar entre ${rango}. Corrija la fecha o repórtelo en el periodo que corresponde.`,
      seccion: SECCION,
    },
  ];
};

/** «El número de teléfono debe tener una longitud mayor o igual a 7 dígitos.» */
const telefono: ReglaFila = (fila, _ctx, h) => {
  if (h.vacio(fila.TELEFONO_CONTACTO)) return [];
  const digitos = fila.TELEFONO_CONTACTO.replace(/\D/g, "");
  if (digitos.length >= 7) return [];
  return [
    {
      campo: "TELEFONO_CONTACTO",
      mensaje: `El teléfono tiene ${digitos.length} dígitos y debe tener al menos 7. Complete el número.`,
      seccion: SECCION,
    },
  ];
};

/** Debió estar matriculado en ese programa en algún periodo. */
const fueMatriculado: ReglaPlantilla = (filas, ctx, h) => {
  const errores: ErrorFila[] = [];
  filas.forEach((fila, i) => {
    const clave = clavePrograma(fila, ctx, h);
    if (!clave || ctx.cruces.matriculados.has(clave)) return;
    errores.push({
      fila: i,
      campo: "NUM_DOCUMENTO",
      mensaje: "No aparece matriculado en este programa en ningún periodo. Revise el programa o el documento, o repórtelo antes en Matriculados.",
      seccion: SECCION,
    });
  });
  return errores;
};

/** No puede estar graduado del mismo programa en otro periodo. */
const yaGraduado: ReglaPlantilla = (filas, ctx, h) => {
  const errores: ErrorFila[] = [];
  const actual = `${ctx.periodo.anio}-${ctx.periodo.semestre}`;
  filas.forEach((fila, i) => {
    const clave = clavePrograma(fila, ctx, h);
    const otro = clave ? ctx.cruces.graduados.get(clave) : undefined;
    if (!otro || otro === actual) return;
    errores.push({
      fila: i,
      campo: "NUM_DOCUMENTO",
      mensaje: `Ya está reportado como graduado de este programa en ${otro}. Quite la fila, o corrija el programa si es otro título.`,
      seccion: SECCION,
    });
  });
  return errores;
};

export const GRADUADOS: PlantillaSpec = {
  id: "graduados",
  nombre: "Graduados",
  modulo: "Población estudiantil",
  seccion: "§3.4.8",
  orden: 7,
  depende: ["participante", "matriculados"],
  // §2.6.1
  fechas: {
    1: { primerCorte: { fecha: "04-30" }, definitiva: { fecha: "07-31" } },
    2: { primerCorte: { fecha: "10-31" }, definitiva: { fecha: "01-31", siguienteAnio: true } },
  },
  disponible: true,
  campos: [
    ...camposPeriodoYDocumento("§3.4.8", "Sin puntos, comas ni apóstrofes. Debe estar en Participante y en Matriculados."),
    {
      codigo: "PRO_CONSECUTIVO",
      etiqueta: "Programa",
      grupo: "Programa",
      obligatorio: true,
      fuente: { tipo: "catalogo", catalogo: "programa" },
      seccion: "§3.4.8",
      ancho: true,
    },
    campoSede("ID_MUNICIPIO", "§3.4.8"),
    {
      codigo: "EMAIL_PERSONAL",
      etiqueta: "Correo personal",
      grupo: "Contacto",
      obligatorio: false,
      formato: "correo",
      ayuda: "Obligatorio si no está registrado en Participante.",
      seccion: "§3.4.8",
      ancho: true,
    },
    {
      codigo: "TELEFONO_CONTACTO",
      etiqueta: "Teléfono",
      grupo: "Contacto",
      obligatorio: false,
      formato: "telefono",
      alias: ["TELEFONO CONTACTO"],
      ayuda: "Mínimo 7 dígitos. Obligatorio si no está registrado en Participante.",
      seccion: "§3.4.8",
    },
    {
      codigo: "SPN_SABER_PRO",
      etiqueta: "Código Saber Pro / T&T",
      grupo: "Grado",
      obligatorio: false,
      formato: "texto",
      ayuda: "El código de presentación que asigna el ICFES (Saber Pro o Saber T&T).",
      seccion: "§3.4.8",
    },
    { codigo: "NUMERO_ACTA_GRADO", etiqueta: "Número del acta de grado", grupo: "Grado", obligatorio: true, formato: "texto", seccion: "§3.4.8" },
    {
      codigo: "FECHA_GRADO",
      etiqueta: "Fecha de grado",
      grupo: "Grado",
      obligatorio: true,
      formato: "fecha",
      placeholder: "dd/mm/aaaa",
      ayuda: "La del acta o el diploma; dentro del semestre que se reporta.",
      seccion: "§3.4.8",
    },
    { codigo: "NUM_FOLIO", etiqueta: "Número de folio", grupo: "Grado", obligatorio: true, formato: "texto", seccion: "§3.4.8" },
  ],
  reglas: [reglaPeriodo(SECCION), reglaOferta(SECCION), fechaGrado, telefono],
  reglasPlantilla: [
    reglaParticipante(SECCION, "El graduado con documento"),
    fueMatriculado,
    yaGraduado,
    reglaRepetidoPrograma(SECCION, "Este graduado"),
  ],
};

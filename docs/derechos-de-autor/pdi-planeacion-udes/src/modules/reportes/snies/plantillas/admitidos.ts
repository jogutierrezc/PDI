/* =============================================================================
   SNIES · Admitidos (§3.4.3).

   Inscritos que pasaron el proceso de selección de un programa. Deben estar
   inscritos a ese programa en el periodo (§3.4.2); el número de documento no
   se cruza con Participante (§3.4.15). La UDES es privada: teléfono, correo,
   fecha de nacimiento y estrato solo son obligatorios para IES públicas.
   ========================================================================== */

import type { ErrorFila, PlantillaSpec, ReglaPlantilla } from "../../tipos";
import {
  FECHAS_INGRESO,
  MUNICIPIO,
  PROGRAMA,
  campoSede,
  camposPeriodoYDocumento,
  clavePeriodo,
  clavePrograma,
  periodoActual,
  reglaOferta,
  reglaPeriodo,
  reglaProgramaActivo,
  reglaRepetido,
} from "./comunes";

const SECCION = "§3.4.3 Admitidos";

/** Debe estar inscrito a ese programa en el periodo («documento|programa|periodo»). */
const inscritoAlPrograma: ReglaPlantilla = (filas, ctx, h) => {
  const errores: ErrorFila[] = [];
  filas.forEach((fila, i) => {
    const clave = clavePeriodo(fila, ctx, h);
    if (!clave || ctx.cruces.inscritosPrograma.has(clave)) return;
    errores.push({
      fila: i,
      campo: "NUM_DOCUMENTO",
      mensaje: `No aparece inscrito a este programa en ${periodoActual(ctx)}. Repórtelo primero en Inscritos Programa, o revise el documento y el programa.`,
      seccion: SECCION,
    });
  });
  return errores;
};

export const ADMITIDOS: PlantillaSpec = {
  id: "admitidos",
  nombre: "Admitidos",
  modulo: "Población estudiantil",
  seccion: "§3.4.3",
  orden: 4,
  depende: ["inscritos_programa"],
  fechas: FECHAS_INGRESO, // §2.6.1
  disponible: true,
  campos: [
    ...camposPeriodoYDocumento("§3.4.3", "Sin puntos, comas ni apóstrofes. Debe estar inscrito al programa."),
    { codigo: "PRO_CONSECUTIVO", etiqueta: "Programa", grupo: "Programa", obligatorio: true, fuente: PROGRAMA, seccion: "§3.4.3", ancho: true },
    campoSede("ID_MUNICIPIO_PROGRAMA", "§3.4.3", ["ID_MUNICIPIO"]),
    {
      codigo: "TELEFONO_CONTACTO",
      etiqueta: "Teléfono",
      grupo: "Contacto",
      obligatorio: false,
      formato: "telefono",
      ayuda: "Obligatorio solo para IES públicas de Generación E.",
      seccion: "§3.4.3",
    },
    {
      codigo: "EMAIL_PERSONAL",
      etiqueta: "Correo personal",
      grupo: "Contacto",
      obligatorio: false,
      formato: "correo",
      ayuda: "Obligatorio solo para IES públicas de Generación E.",
      seccion: "§3.4.3",
      ancho: true,
    },
    {
      codigo: "FECHA_NACIMIENTO",
      etiqueta: "Fecha de nacimiento",
      grupo: "Datos personales",
      obligatorio: false,
      formato: "fecha",
      placeholder: "dd/mm/aaaa",
      ayuda: "Obligatoria solo para IES públicas de Generación E.",
      seccion: "§3.4.3",
    },
    {
      codigo: "ID_ESTRATO",
      etiqueta: "Estrato",
      grupo: "Datos personales",
      obligatorio: false,
      fuente: { tipo: "dominio", dominio: "estrato" },
      ayuda: "Obligatorio solo para IES públicas (Matrícula Cero).",
      seccion: "§3.4.3",
    },
    {
      codigo: "ID_BENEFICIARIO_LEY_VETERANOS",
      etiqueta: "Beneficiario Ley de Veteranos",
      grupo: "Datos personales",
      obligatorio: true,
      fuente: { tipo: "dominio", dominio: "beneficiario_veteranos" },
      ayuda: "Ley 1979 de 2019. «No aplica» si no es veterano ni familiar de uno.",
      seccion: "§3.4.3",
      ancho: true,
    },
  ],
  reglas: [reglaPeriodo(SECCION), reglaProgramaActivo(SECCION), reglaOferta(SECCION, "ID_MUNICIPIO_PROGRAMA")],
  reglasPlantilla: [
    inscritoAlPrograma,
    // Mismo programa y misma sede dos veces (por confirmar, como en Inscritos Programa).
    reglaRepetido(
      SECCION,
      (n) => `Este admitido ya aparece en la fila ${n} con el mismo programa y sede. Deje una sola fila.`,
      (fila, ctx, h) => {
        const clave = clavePrograma(fila, ctx, h);
        return clave ? `${clave}|${h.resolver(MUNICIPIO, fila.ID_MUNICIPIO_PROGRAMA ?? "", ctx)?.codigo ?? ""}` : null;
      },
    ),
  ],
};

/* =============================================================================
   SNIES · Matriculados (§3.4.7).

   Personas con matrícula formal en un programa y un periodo. Las columnas van
   en el orden en que el manual las describe (la imagen de la plantilla no trae
   texto). La UDES es privada: valor de matrícula, teléfono y correo solo son
   obligatorios para IES públicas, así que aquí quedan opcionales.

   Las reglas compartidas (periodo, sede, cruces, repetidos) están en comunes.ts.
   ========================================================================== */

import type { ErrorFila, Fila, PlantillaSpec, ReglaFila } from "../../tipos";
import {
  MUNICIPIO,
  PAIS,
  PROGRAMA,
  SEMESTRE,
  SI_NO,
  camposPeriodoYDocumento,
  campoSede,
  reglaOferta,
  reglaParticipante,
  reglaPeriodo,
  reglaRepetidoPrograma,
} from "./comunes";

const SECCION = "§3.4.7 Matriculados";

/* ---------- reglas propias de Matriculados ---------- */

/** El municipio de nacimiento solo se llena si el país de nacimiento es Colombia (170). */
const municipioNacimiento: ReglaFila = (fila, ctx, h) => {
  if (h.vacio(fila.ID_PAIS_NACIMIENTO) || h.vacio(fila.ID_MUNICIPIO_NACIMIENTO)) return [];
  const pais = h.resolver(PAIS, fila.ID_PAIS_NACIMIENTO, ctx);
  if (!pais || pais.codigo === "170") return [];
  return [
    {
      campo: "ID_MUNICIPIO_NACIMIENTO",
      mensaje: `Nació en ${pais.nombre}: el municipio de nacimiento solo se llena para nacidos en Colombia. Déjelo vacío.`,
      seccion: SECCION,
      arreglo: { etiqueta: "Dejar vacío", cambios: { ID_MUNICIPIO_NACIMIENTO: "" } },
    },
  ];
};

/** Año y semestre de primer curso: solo con reintegro antes de 1998 = S, y el año < 1998. */
const primerCurso: ReglaFila = (fila, ctx, h) => {
  const errores: Omit<ErrorFila, "fila">[] = [];
  const reintegro = h.vacio(fila.ES_REINTEGRO_ESTUDIANTE_ANTES_DE_1998)
    ? null
    : h.resolver(SI_NO, fila.ES_REINTEGRO_ESTUDIANTE_ANTES_DE_1998, ctx);
  const anio = (fila["AÑO_PRIMER_CURSO"] ?? "").trim();
  const sem = fila.SEMESTRE_PRIMER_CURSO ?? "";

  if (reintegro?.codigo === "S") {
    if (h.vacio(anio)) {
      errores.push({
        campo: "AÑO_PRIMER_CURSO",
        mensaje: "Es reintegro de antes de 1998: escriba el año en que empezó sus estudios.",
        seccion: SECCION,
      });
    } else if (/^\d{4}$/.test(anio) && Number(anio) >= 1998) {
      errores.push({
        campo: "AÑO_PRIMER_CURSO",
        mensaje: `El año de primer curso debe ser anterior a 1998 y dice ${anio}. Corríjalo, o marque «No» en reintegro antes de 1998.`,
        seccion: SECCION,
      });
    }
    if (h.vacio(sem)) {
      errores.push({
        campo: "SEMESTRE_PRIMER_CURSO",
        mensaje: "Es reintegro de antes de 1998: indique el semestre en que empezó sus estudios.",
        seccion: SECCION,
      });
    }
    return errores;
  }

  // Sin reintegro (o sin respuesta), el año y semestre de primer curso van nulos.
  if (!h.vacio(anio) || !h.vacio(sem)) {
    const cambios: Partial<Fila> = {};
    if (!h.vacio(anio)) cambios["AÑO_PRIMER_CURSO"] = "";
    if (!h.vacio(sem)) cambios.SEMESTRE_PRIMER_CURSO = "";
    errores.push({
      campo: !h.vacio(anio) ? "AÑO_PRIMER_CURSO" : "SEMESTRE_PRIMER_CURSO",
      mensaje: "Año y semestre de primer curso solo se llenan si es reintegro de antes de 1998 (S). Déjelos vacíos.",
      seccion: SECCION,
      arreglo: { etiqueta: "Dejar vacíos", cambios },
    });
  }
  return errores;
};

export const MATRICULADOS: PlantillaSpec = {
  id: "matriculados",
  nombre: "Matriculados",
  modulo: "Población estudiantil",
  seccion: "§3.4.7",
  orden: 6,
  depende: ["participante"],
  // §2.6.1
  fechas: {
    1: { primerCorte: { fecha: "03-31" }, definitiva: { fecha: "07-31" } },
    2: { primerCorte: { fecha: "09-30" }, definitiva: { fecha: "01-31", siguienteAnio: true } },
  },
  disponible: true,
  campos: [
    ...camposPeriodoYDocumento("§3.4.7", "Sin puntos, comas ni apóstrofes. Debe estar ya en Participante."),
    {
      codigo: "CODIGO_ESTUDIANTE",
      etiqueta: "Código de estudiante",
      grupo: "Identificación",
      obligatorio: true,
      formato: "texto",
      ayuda: "El código interno; si no hay, el mismo número de documento.",
      seccion: "§3.4.7",
    },
    { codigo: "PRO_CONSECUTIVO", etiqueta: "Programa", grupo: "Programa", obligatorio: true, fuente: PROGRAMA, seccion: "§3.4.7", ancho: true },
    campoSede("ID_MUNICIPIO", "§3.4.7"),
    {
      codigo: "FECHA_NACIMIENTO",
      etiqueta: "Fecha de nacimiento",
      grupo: "Nacimiento",
      obligatorio: false,
      formato: "fecha",
      placeholder: "dd/mm/aaaa",
      ayuda: "Opcional: si se llena, reemplaza la de Participante.",
      seccion: "§3.4.7",
    },
    {
      codigo: "ID_PAIS_NACIMIENTO",
      etiqueta: "País de nacimiento",
      grupo: "Nacimiento",
      obligatorio: false,
      fuente: PAIS,
      ayuda: "Opcional: si se llena, reemplaza el de Participante.",
      seccion: "§3.4.7",
    },
    {
      codigo: "ID_MUNICIPIO_NACIMIENTO",
      etiqueta: "Municipio de nacimiento",
      grupo: "Nacimiento",
      obligatorio: false,
      fuente: MUNICIPIO,
      ayuda: "Solo para nacidos en Colombia. Opcional.",
      seccion: "§3.4.7",
      ancho: true,
    },
    {
      codigo: "ID_ZONA_RESIDENCIA",
      etiqueta: "Zona de residencia",
      grupo: "Residencia",
      obligatorio: true,
      fuente: { tipo: "dominio", dominio: "zona_residencia" },
      seccion: "§3.4.7",
    },
    {
      codigo: "ES_REINTEGRO_ESTUDIANTE_ANTES_DE_1998",
      etiqueta: "¿Reintegro de antes de 1998?",
      grupo: "Reintegro",
      obligatorio: true,
      fuente: SI_NO,
      alias: ["ES_REINTEGRO_ESTD_ANTES_DE1998", "ES_REINTEGRO_ESTD_ANTES_DE_1998"],
      ayuda: "«Sí» solo si ingresó a la educación superior antes de 1998 y no tiene registro SNIES desde entonces.",
      seccion: "§3.4.7",
    },
    {
      codigo: "AÑO_PRIMER_CURSO",
      etiqueta: "Año de primer curso",
      grupo: "Reintegro",
      obligatorio: false,
      formato: "anio",
      alias: ["ANO_PRIMER_CURSO", "ANIO_PRIMER_CURSO"],
      ayuda: "Solo si es reintegro de antes de 1998.",
      seccion: "§3.4.7",
    },
    {
      codigo: "SEMESTRE_PRIMER_CURSO",
      etiqueta: "Semestre de primer curso",
      grupo: "Reintegro",
      obligatorio: false,
      fuente: SEMESTRE,
      ayuda: "Solo si es reintegro de antes de 1998.",
      seccion: "§3.4.7",
    },
    {
      codigo: "VALOR_DERECHOS_MATRICULA",
      etiqueta: "Valor de la matrícula",
      grupo: "Matrícula",
      obligatorio: false,
      formato: "dinero",
      alias: ["VALOR_DERECHOS_MATRÍCULA"],
      ayuda: "Obligatorio solo para IES públicas; la UDES puede dejarlo vacío.",
      seccion: "§3.4.7",
    },
    {
      codigo: "TELEFONO_CONTACTO",
      etiqueta: "Teléfono",
      grupo: "Contacto",
      obligatorio: false,
      formato: "telefono",
      ayuda: "Obligatorio solo para IES públicas.",
      seccion: "§3.4.7",
    },
    {
      codigo: "EMAIL_PERSONAL",
      etiqueta: "Correo personal",
      grupo: "Contacto",
      obligatorio: false,
      formato: "correo",
      ayuda: "Obligatorio solo para IES públicas.",
      seccion: "§3.4.7",
      ancho: true,
    },
  ],
  reglas: [reglaPeriodo(SECCION), reglaOferta(SECCION), municipioNacimiento, primerCurso],
  reglasPlantilla: [
    reglaParticipante(SECCION, "El estudiante con documento"),
    reglaRepetidoPrograma(SECCION, "Este estudiante"),
  ],
};

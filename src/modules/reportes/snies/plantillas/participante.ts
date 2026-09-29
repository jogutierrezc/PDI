/* =============================================================================
   SNIES · Participante (§3.1.1).

   Datos básicos de toda persona de la comunidad académica: estudiantes,
   docentes, autoridades y directivos. Va primero: ninguna otra plantilla
   acepta un documento que no esté aquí. Las columnas van en el orden en que
   el manual las describe (la imagen de la plantilla no trae texto).

   Ojo: aquí ID_PAIS e ID_MUNICIPIO son el país y el municipio de NACIMIENTO.
   ========================================================================== */

import type { ErrorFila, PlantillaSpec, ReglaFila, ReglaPlantilla } from "../../tipos";

const SECCION = "§3.1.1 Participante";

const PAIS = { tipo: "catalogo", catalogo: "pais" } as const;
const TIPO_DOCUMENTO = { tipo: "dominio", dominio: "tipo_documento" } as const;

/** Municipio de nacimiento: obligatorio si el país es Colombia (170); si no, va vacío. */
const municipioNacimiento: ReglaFila = (fila, ctx, h) => {
  if (h.vacio(fila.ID_PAIS)) return [];
  const pais = h.resolver(PAIS, fila.ID_PAIS, ctx);
  if (!pais) return [];
  if (pais.codigo === "170") {
    if (!h.vacio(fila.ID_MUNICIPIO)) return [];
    return [
      {
        campo: "ID_MUNICIPIO",
        mensaje: "Nació en Colombia: indique el municipio de nacimiento.",
        seccion: SECCION,
      },
    ];
  }
  if (h.vacio(fila.ID_MUNICIPIO)) return [];
  return [
    {
      campo: "ID_MUNICIPIO",
      mensaje: `Nació en ${pais.nombre}: el municipio solo se llena para nacidos en Colombia. Déjelo vacío.`,
      seccion: SECCION,
      arreglo: { etiqueta: "Dejar vacío", cambios: { ID_MUNICIPIO: "" } },
    },
  ];
};

/** La fecha de expedición solo aplica a la cédula de ciudadanía. */
const fechaExpedicion: ReglaFila = (fila, ctx, h) => {
  if (h.vacio(fila.FECHA_EXPEDICION) || h.vacio(fila.ID_TIPO_DOCUMENTO)) return [];
  const tipo = h.resolver(TIPO_DOCUMENTO, fila.ID_TIPO_DOCUMENTO, ctx);
  if (!tipo || tipo.codigo === "CC") return [];
  return [
    {
      campo: "FECHA_EXPEDICION",
      mensaje: `La fecha de expedición solo aplica a la cédula de ciudadanía, y el documento es ${tipo.nombre}. Déjela vacía.`,
      seccion: SECCION,
      arreglo: { etiqueta: "Dejar vacía", cambios: { FECHA_EXPEDICION: "" } },
    },
  ];
};

/** Una persona, una fila: el mismo documento no se repite en la hoja. */
const documentoRepetido: ReglaPlantilla = (filas, _ctx, h) => {
  const errores: ErrorFila[] = [];
  const vistos = new Map<string, number>();
  filas.forEach((fila, i) => {
    if (h.vacio(fila.NUM_DOCUMENTO)) return;
    const doc = h.documento(fila.NUM_DOCUMENTO);
    const antes = vistos.get(doc);
    if (antes === undefined) {
      vistos.set(doc, i);
      return;
    }
    errores.push({
      fila: i,
      campo: "NUM_DOCUMENTO",
      mensaje: `El documento ${doc} ya está en la fila ${antes + 1}. Deje una sola fila por persona.`,
      seccion: SECCION,
    });
  });
  return errores;
};

export const PARTICIPANTE: PlantillaSpec = {
  id: "participante",
  nombre: "Participante",
  modulo: "Participante",
  seccion: "§3.1.1",
  orden: 1,
  depende: [],
  // §2.6.1
  fechas: {
    1: { primerCorte: { fecha: "03-15" }, definitiva: { fecha: "07-31" } },
    2: { primerCorte: { fecha: "09-15" }, definitiva: { fecha: "01-31", siguienteAnio: true } },
  },
  disponible: true,
  campos: [
    { codigo: "ID_TIPO_DOCUMENTO", etiqueta: "Tipo de documento", grupo: "Identificación", obligatorio: true, fuente: TIPO_DOCUMENTO, seccion: "§3.1.1" },
    {
      codigo: "NUM_DOCUMENTO",
      etiqueta: "Número de documento",
      grupo: "Identificación",
      obligatorio: true,
      formato: "documento",
      ayuda: "Sin puntos, comas ni apóstrofes.",
      seccion: "§3.1.1",
    },
    {
      codigo: "FECHA_EXPEDICION",
      etiqueta: "Fecha de expedición",
      grupo: "Identificación",
      obligatorio: false,
      formato: "fecha",
      alias: ["FECHA DE EXPEDICION", "FECHA_DE_EXPEDICION", "FECHA_EXPEDICION_DOCUMENTO"],
      placeholder: "dd/mm/aaaa",
      ayuda: "Opcional. Solo para cédula de ciudadanía.",
      seccion: "§3.1.1",
    },
    { codigo: "PRIMER_NOMBRE", etiqueta: "Primer nombre", grupo: "Nombre", obligatorio: true, formato: "texto", seccion: "§3.1.1" },
    { codigo: "SEGUNDO_NOMBRE", etiqueta: "Segundo nombre", grupo: "Nombre", obligatorio: false, formato: "texto", seccion: "§3.1.1" },
    { codigo: "PRIMER_APELLIDO", etiqueta: "Primer apellido", grupo: "Nombre", obligatorio: true, formato: "texto", seccion: "§3.1.1" },
    { codigo: "SEGUNDO_APELLIDO", etiqueta: "Segundo apellido", grupo: "Nombre", obligatorio: false, formato: "texto", seccion: "§3.1.1" },
    {
      codigo: "ID_SEXO_BIOLOGICO",
      etiqueta: "Sexo biológico",
      grupo: "Datos personales",
      obligatorio: true,
      fuente: { tipo: "dominio", dominio: "sexo_biologico" },
      ayuda: "Como aparece en el documento de identidad.",
      seccion: "§3.1.1",
    },
    {
      codigo: "ID_ESTADO_CIVIL",
      etiqueta: "Estado civil",
      grupo: "Datos personales",
      obligatorio: true,
      fuente: { tipo: "dominio", dominio: "estado_civil" },
      seccion: "§3.1.1",
    },
    {
      codigo: "FECHA_NACIMIENTO",
      etiqueta: "Fecha de nacimiento",
      grupo: "Nacimiento",
      obligatorio: true,
      formato: "fecha",
      placeholder: "dd/mm/aaaa",
      seccion: "§3.1.1",
    },
    { codigo: "ID_PAIS", etiqueta: "País de nacimiento", grupo: "Nacimiento", obligatorio: true, fuente: PAIS, seccion: "§3.1.1" },
    {
      codigo: "ID_MUNICIPIO",
      etiqueta: "Municipio de nacimiento",
      grupo: "Nacimiento",
      obligatorio: false,
      fuente: { tipo: "catalogo", catalogo: "municipio" },
      ayuda: "Obligatorio si nació en Colombia; vacío si no.",
      seccion: "§3.1.1",
      ancho: true,
    },
    {
      codigo: "TELEFONO_CONTACTO",
      etiqueta: "Teléfono",
      grupo: "Contacto",
      obligatorio: false,
      formato: "telefono",
      ayuda: "Obligatorio para graduados.",
      seccion: "§3.1.1",
    },
    {
      codigo: "EMAIL_PERSONAL",
      etiqueta: "Correo personal",
      grupo: "Contacto",
      obligatorio: false,
      formato: "correo",
      ayuda: "Obligatorio para graduados.",
      seccion: "§3.1.1",
      ancho: true,
    },
    {
      codigo: "EMAIL_INSTITUCIONAL",
      etiqueta: "Correo institucional",
      grupo: "Contacto",
      obligatorio: false,
      formato: "correo",
      ayuda: "Obligatorio para autoridades.",
      seccion: "§3.1.1",
      ancho: true,
    },
    {
      codigo: "DIRECCION_INSTITUCIONAL",
      etiqueta: "Dirección institucional",
      grupo: "Contacto",
      obligatorio: false,
      formato: "texto",
      ayuda: "Obligatoria para autoridades.",
      seccion: "§3.1.1",
      ancho: true,
    },
  ],
  reglas: [municipioNacimiento, fechaExpedicion],
  reglasPlantilla: [documentoRepetido],
};

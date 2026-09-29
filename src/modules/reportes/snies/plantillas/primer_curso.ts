/* =============================================================================
   SNIES · Estudiantes de primer curso (§3.4.6).

   Quien se matricula por primera vez en un programa: define su cohorte. Exige
   Participante y, según el tipo de vinculación, haber sido admitido o haber
   estado matriculado antes (§3.4.1, §3.4.6). Después hay que reportarlo en
   Matriculados. Las columnas de caracterización (etnia, discapacidad,
   capacidad excepcional) son autorreconocidas y no se piden soportes.
   ========================================================================== */

import type { ErrorFila, Fuente, PlantillaSpec, ReglaFila, ReglaPlantilla } from "../../tipos";
import {
  FECHAS_INGRESO,
  PROGRAMA,
  campoSede,
  camposPeriodoYDocumento,
  clavePeriodo,
  periodoActual,
  reglaOferta,
  reglaParticipante,
  reglaPeriodo,
  reglaProgramaActivo,
  reglaRepetidoPrograma,
} from "./comunes";

const SECCION = "§3.4.6 Primer curso";

const VINCULACION = { tipo: "dominio", dominio: "tipo_vinculacion" } as const;
const GRUPO_ETNICO = { tipo: "dominio", dominio: "grupo_etnico" } as const;
const PUEBLO_INDIGENA = { tipo: "dominio", dominio: "pueblo_indigena" } as const;
const COMUNIDAD_NEGRA = { tipo: "dominio", dominio: "comunidad_negra" } as const;
const DISCAPACIDAD = { tipo: "dominio", dominio: "persona_discapacidad" } as const;
const TIPO_DISCAPACIDAD = { tipo: "dominio", dominio: "tipo_discapacidad" } as const;

/** Vinculaciones que pasan por Inscritos y Admitidos (§3.4.1). El ciclo propedéutico en su primer ciclo va como «Nuevo». */
const CON_ADMISION = new Set(["1", "3", "8", "9"]);
/** Transferencia interna y doble programa: matrícula previa en otro programa de la institución (§3.4.6). */
const CON_MATRICULA_PREVIA = new Set(["2", "5"]);
/** «Opción de grado»: graduado antes en un programa de nivel inferior (§3.4.6). */
const OPCION_DE_GRADO = "10";

/* ---------- reglas de fila ---------- */

/**
 * Un subcampo que solo aplica con cierto valor del campo padre: si el padre no
 * lo tiene, el hijo va en «No aplica» (0); si lo tiene, el hijo no puede ser 0.
 */
function reglaDependiente(
  padre: { campo: string; fuente: Fuente; valor: string },
  hijo: { campo: string; fuente: Fuente },
  textos: { sobra: string; falta: string },
): ReglaFila {
  return (fila, ctx, h) => {
    if (h.vacio(fila[padre.campo]) || h.vacio(fila[hijo.campo])) return [];
    const p = h.resolver(padre.fuente, fila[padre.campo], ctx);
    const c = h.resolver(hijo.fuente, fila[hijo.campo], ctx);
    if (!p || !c) return []; // fuera de catálogo: lo marca el motor
    if (p.codigo !== padre.valor && c.codigo !== "0") {
      const noAplica = h.resolver(hijo.fuente, "0", ctx)?.nombre ?? "No aplica";
      return [
        {
          campo: hijo.campo,
          mensaje: textos.sobra,
          seccion: SECCION,
          arreglo: { etiqueta: `Poner «${noAplica}»`, cambios: { [hijo.campo]: noAplica } },
        },
      ];
    }
    if (p.codigo === padre.valor && c.codigo === "0") {
      return [{ campo: hijo.campo, mensaje: textos.falta, seccion: SECCION }];
    }
    return [];
  };
}

const puebloIndigena = reglaDependiente(
  { campo: "ID_GRUPO_ETNICO", fuente: GRUPO_ETNICO, valor: "1" },
  { campo: "ID_PUEBLO_INDIGENA", fuente: PUEBLO_INDIGENA },
  {
    sobra: "El pueblo indígena solo se indica si el grupo étnico es «Pueblo indígena». Ponga «No aplica».",
    falta: "El grupo étnico es «Pueblo indígena»: elija el pueblo (o «No informa»).",
  },
);

const comunidadNegra = reglaDependiente(
  { campo: "ID_GRUPO_ETNICO", fuente: GRUPO_ETNICO, valor: "2" },
  { campo: "ID_COMUNIDAD_NEGRA", fuente: COMUNIDAD_NEGRA },
  {
    sobra: "La comunidad negra solo se indica si el grupo étnico es «Comunidad negra». Ponga «No aplica».",
    falta: "El grupo étnico es «Comunidad negra»: elija la comunidad.",
  },
);

const tipoDiscapacidad = reglaDependiente(
  { campo: "PERSONA_CON_DISCAPACIDAD", fuente: DISCAPACIDAD, valor: "1" },
  { campo: "ID_TIPO_DISCAPACIDAD", fuente: TIPO_DISCAPACIDAD },
  {
    sobra: "El tipo de discapacidad solo se indica si la persona declaró tener una. Ponga «No aplica».",
    falta: "Declaró tener discapacidad: elija el tipo.",
  },
);

/* ---------- reglas de plantilla ---------- */

/** Documento → programas, a partir de claves «documento|programa». */
function porDocumento(claves: Iterable<string>): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const k of claves) {
    const [doc, prog] = k.split("|");
    if (!m.has(doc)) m.set(doc, new Set());
    m.get(doc)!.add(prog);
  }
  return m;
}

/**
 * Cruces según el tipo de vinculación (§3.4.1 y §3.4.6). No se validan aquí
 * (los cruces no tienen con qué): 4 entre seccionales y 6 ciclo propedéutico
 * (la matrícula previa puede ser de otra institución), ni el «mismo nivel» o
 * «semestre inferior» de las transferencias. 7, 11 y 12 no exigen cruce.
 */
const segunVinculacion: ReglaPlantilla = (filas, ctx, h) => {
  const errores: ErrorFila[] = [];
  const periodo = periodoActual(ctx);
  const matriculas = porDocumento(ctx.cruces.matriculados);
  const grados = porDocumento(ctx.cruces.graduados.keys());

  filas.forEach((fila, i) => {
    if (h.vacio(fila.ID_TIPO_VINCULACION) || h.vacio(fila.NUM_DOCUMENTO) || h.vacio(fila.PRO_CONSECUTIVO)) return;
    const v = h.resolver(VINCULACION, fila.ID_TIPO_VINCULACION, ctx);
    const prog = h.resolver(PROGRAMA, fila.PRO_CONSECUTIVO, ctx);
    if (!v || !prog) return;
    const doc = h.documento(fila.NUM_DOCUMENTO);

    if (CON_ADMISION.has(v.codigo)) {
      const falta: string[] = [];
      if (!ctx.cruces.inscritos.has(`${doc}||${periodo}`)) falta.push("la Relación de inscritos");
      if (!ctx.cruces.admitidos.has(`${doc}|${prog.codigo}|${periodo}`)) falta.push("Admitidos de este programa");
      if (falta.length) {
        errores.push({
          fila: i,
          campo: "NUM_DOCUMENTO",
          mensaje: `Con vinculación «${v.nombre}» debe estar en ${falta.join(" y en ")} de ${periodo}. Repórtelo allí primero, o revise el tipo de vinculación.`,
          seccion: SECCION,
        });
      }
    } else if (CON_MATRICULA_PREVIA.has(v.codigo)) {
      const otros = [...(matriculas.get(doc) ?? [])].filter((p) => p !== prog.codigo);
      if (otros.length === 0) {
        errores.push({
          fila: i,
          campo: "ID_TIPO_VINCULACION",
          mensaje: `Con vinculación «${v.nombre}» debe haber estado matriculado antes en otro programa de la institución, y no aparece. Revise el tipo de vinculación o el documento.`,
          seccion: SECCION,
        });
      }
    } else if (v.codigo === OPCION_DE_GRADO) {
      const otros = [...(grados.get(doc) ?? [])].filter((p) => p !== prog.codigo);
      if (otros.length === 0) {
        errores.push({
          fila: i,
          campo: "ID_TIPO_VINCULACION",
          mensaje: "Con vinculación «Opción de grado» debe estar graduado antes de otro programa, y no aparece en Graduados. Revise el tipo de vinculación o el documento.",
          seccion: SECCION,
        });
      }
    }
  });
  return errores;
};

/** Primer curso es la primera vez en el programa: no puede estar ya en otro periodo (por confirmar). */
const yaEnPrimerCurso: ReglaPlantilla = (filas, ctx, h) => {
  const errores: ErrorFila[] = [];
  const actual = periodoActual(ctx);
  filas.forEach((fila, i) => {
    const clave = clavePeriodo(fila, ctx, h);
    if (!clave) return;
    const prefijo = clave.slice(0, clave.length - actual.length); // «documento|programa|»
    for (const k of ctx.cruces.primerCurso) {
      if (!k.startsWith(prefijo)) continue;
      const otro = k.slice(prefijo.length);
      if (otro === actual) continue;
      errores.push({
        fila: i,
        campo: "NUM_DOCUMENTO",
        mensaje: `Ya está reportado en primer curso de este programa en ${otro}. Quite la fila: en este periodo va solo en Matriculados.`,
        seccion: SECCION,
      });
      break;
    }
  });
  return errores;
};

export const PRIMER_CURSO: PlantillaSpec = {
  id: "primer_curso",
  nombre: "Estudiantes de primer curso",
  modulo: "Población estudiantil",
  seccion: "§3.4.6",
  orden: 5,
  depende: ["participante", "admitidos"],
  fechas: FECHAS_INGRESO, // §2.6.1
  disponible: true,
  campos: [
    ...camposPeriodoYDocumento("§3.4.6", "Sin puntos, comas ni apóstrofes. Debe estar en Participante."),
    { codigo: "PRO_CONSECUTIVO", etiqueta: "Programa", grupo: "Programa", obligatorio: true, fuente: PROGRAMA, seccion: "§3.4.6", ancho: true },
    campoSede("ID_MUNICIPIO_PROGRAMA", "§3.4.6", ["ID_MUNICIPIO"]),
    {
      codigo: "ID_TIPO_VINCULACION",
      etiqueta: "Tipo de vinculación",
      grupo: "Programa",
      obligatorio: true,
      fuente: VINCULACION,
      ayuda: "Nuevo, transferencia externa, articulación y SPP deben estar inscritos y admitidos.",
      seccion: "§3.4.6",
      ancho: true,
    },
    { codigo: "ID_GRUPO_ETNICO", etiqueta: "Grupo étnico", grupo: "Caracterización", obligatorio: true, fuente: GRUPO_ETNICO, seccion: "§3.4.6" },
    {
      codigo: "ID_PUEBLO_INDIGENA",
      etiqueta: "Pueblo indígena",
      grupo: "Caracterización",
      obligatorio: true,
      fuente: PUEBLO_INDIGENA,
      ayuda: "«No aplica» si el grupo étnico no es «Pueblo indígena».",
      seccion: "§3.4.6",
      ancho: true,
    },
    {
      codigo: "ID_COMUNIDAD_NEGRA",
      etiqueta: "Comunidad negra",
      grupo: "Caracterización",
      obligatorio: true,
      fuente: COMUNIDAD_NEGRA,
      ayuda: "«No aplica» si el grupo étnico no es «Comunidad negra».",
      seccion: "§3.4.6",
    },
    {
      codigo: "PERSONA_CON_DISCAPACIDAD",
      etiqueta: "¿Persona con discapacidad?",
      grupo: "Caracterización",
      obligatorio: true,
      fuente: DISCAPACIDAD,
      seccion: "§3.4.6",
    },
    {
      codigo: "ID_TIPO_DISCAPACIDAD",
      etiqueta: "Tipo de discapacidad",
      grupo: "Caracterización",
      obligatorio: true,
      fuente: TIPO_DISCAPACIDAD,
      ayuda: "«No aplica» si no declaró discapacidad o no informa.",
      seccion: "§3.4.6",
    },
    {
      codigo: "ID_CAPACIDAD_EXCEPCIONAL",
      etiqueta: "Capacidad excepcional",
      grupo: "Caracterización",
      obligatorio: true,
      fuente: { tipo: "dominio", dominio: "capacidad_excepcional" },
      seccion: "§3.4.6",
    },
    {
      codigo: "COD_PRUEBA_SABER_11",
      etiqueta: "Código Saber 11",
      grupo: "Caracterización",
      obligatorio: false,
      formato: "texto",
      ayuda: "Obligatorio solo en pregrado tecnológico y universitario.",
      seccion: "§3.4.6",
    },
  ],
  reglas: [
    reglaPeriodo(SECCION),
    reglaProgramaActivo(SECCION),
    reglaOferta(SECCION, "ID_MUNICIPIO_PROGRAMA"),
    puebloIndigena,
    comunidadNegra,
    tipoDiscapacidad,
  ],
  reglasPlantilla: [
    reglaParticipante(SECCION, "El estudiante con documento"),
    segunVinculacion,
    yaEnPrimerCurso,
    reglaRepetidoPrograma(SECCION, "Este estudiante"),
  ],
};

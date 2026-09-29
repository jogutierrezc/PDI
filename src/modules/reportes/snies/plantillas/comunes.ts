/* =============================================================================
   SNIES · piezas que comparten las plantillas de Población estudiantil.

   Fuentes, fechas de ingreso, la etiqueta de «Sede» y las reglas que se
   repiten: periodo de la fila, oferta del programa, programa activo, claves
   de los cruces, Participante y repetidos en la hoja.
   ========================================================================== */

import type {
  Ayudas,
  Campo,
  Contexto,
  ErrorFila,
  FechasSemestre,
  Fila,
  ReglaFila,
  ReglaPlantilla,
} from "../../tipos";

export const PROGRAMA = { tipo: "catalogo", catalogo: "programa" } as const;
export const MUNICIPIO = { tipo: "catalogo", catalogo: "municipio" } as const;
export const PAIS = { tipo: "catalogo", catalogo: "pais" } as const;
export const SEMESTRE = { tipo: "dominio", dominio: "semestre" } as const;
export const SI_NO = { tipo: "dominio", dominio: "si_no" } as const;
export const TIPO_DOCUMENTO = { tipo: "dominio", dominio: "tipo_documento" } as const;

/** §2.6.1: Inscritos (relación y programa), Admitidos y Primer curso comparten fechas. */
export const FECHAS_INGRESO: { 1: FechasSemestre; 2: FechasSemestre } = {
  1: { primerCorte: { fecha: "01-31" }, definitiva: { fecha: "07-31" } },
  2: { primerCorte: { fecha: "07-31" }, definitiva: { fecha: "01-31", siguienteAnio: true } },
};

/** El municipio de oferta del programa se muestra siempre como «Sede» (lo pidió el usuario). */
export function campoSede(codigo: string, seccion: string, alias?: string[]): Campo {
  return {
    codigo,
    etiqueta: "Sede",
    grupo: "Programa",
    obligatorio: true,
    fuente: MUNICIPIO,
    ...(alias ? { alias } : {}),
    ayuda: "Municipio de la sede donde se ofrece el programa; al exportar sale su código DIVIPOLA.",
    seccion,
    ancho: true,
  };
}

/** Las cuatro primeras columnas de casi todas las plantillas de estudiantes. */
export function camposPeriodoYDocumento(seccion: string, ayudaDocumento: string): Campo[] {
  return [
    { codigo: "AÑO", etiqueta: "Año", grupo: "Periodo", obligatorio: true, formato: "anio", alias: ["ANO", "ANIO"], seccion },
    { codigo: "SEMESTRE", etiqueta: "Semestre", grupo: "Periodo", obligatorio: true, fuente: SEMESTRE, seccion },
    { codigo: "ID_TIPO_DOCUMENTO", etiqueta: "Tipo de documento", grupo: "Identificación", obligatorio: true, fuente: TIPO_DOCUMENTO, seccion },
    {
      codigo: "NUM_DOCUMENTO",
      etiqueta: "Número de documento",
      grupo: "Identificación",
      obligatorio: true,
      formato: "documento",
      ayuda: ayudaDocumento,
      seccion,
    },
  ];
}

/** PeriodoCodigo del periodo que se reporta: «2026-2». */
export function periodoActual(ctx: Contexto): string {
  return `${ctx.periodo.anio}-${ctx.periodo.semestre}`;
}

/* ---------- reglas de fila ---------- */

/** AÑO y SEMESTRE de la fila deben ser los del periodo que se está reportando. */
export function reglaPeriodo(seccion: string): ReglaFila {
  return (fila, ctx, h) => {
    const errores: Omit<ErrorFila, "fila">[] = [];
    const { anio, semestre } = ctx.periodo;
    const a = (fila["AÑO"] ?? "").trim();
    if (!h.vacio(a) && a !== String(anio)) {
      errores.push({
        campo: "AÑO",
        mensaje: `El año ${a} no es el del periodo que se reporta. Escriba ${anio}.`,
        seccion,
        arreglo: { etiqueta: `Poner ${anio}`, cambios: { "AÑO": String(anio) } },
      });
    }
    const s = fila.SEMESTRE ?? "";
    const r = h.vacio(s) ? null : h.resolver(SEMESTRE, s, ctx);
    if (r && r.codigo !== String(semestre)) {
      const bueno = h.resolver(SEMESTRE, String(semestre), ctx);
      errores.push({
        campo: "SEMESTRE",
        mensaje: `El semestre no es el del periodo que se reporta (${anio}-${semestre}). Cámbielo a ${bueno?.nombre ?? semestre}.`,
        seccion,
        arreglo: { etiqueta: "Poner el del periodo", cambios: { SEMESTRE: bueno?.nombre ?? String(semestre) } },
      });
    }
    return errores;
  };
}

/** La sede debe ser un municipio donde el programa tiene registro calificado (item.oferta). */
export function reglaOferta(seccion: string, campo = "ID_MUNICIPIO"): ReglaFila {
  return (fila, ctx, h) => {
    if (h.vacio(fila.PRO_CONSECUTIVO) || h.vacio(fila[campo])) return [];
    const prog = h.resolver(PROGRAMA, fila.PRO_CONSECUTIVO, ctx);
    const mun = h.resolver(MUNICIPIO, fila[campo], ctx);
    const oferta = prog?.item?.oferta;
    // Sin oferta cargada en el catálogo no hay con qué comparar: no se marca.
    if (!prog || !mun || !oferta || oferta.length === 0) return [];
    if (oferta.includes(mun.codigo)) return [];
    return [
      {
        campo,
        mensaje: `${prog.nombre} no tiene registro calificado en «${mun.nombre}». Elija una sede donde se ofrece el programa, o corrija el programa.`,
        seccion,
      },
    ];
  };
}

/** «El programa debe estar en estado activo en el periodo a reportar» (§3.4.2, §3.4.3). */
export function reglaProgramaActivo(seccion: string): ReglaFila {
  return (fila, ctx, h) => {
    if (h.vacio(fila.PRO_CONSECUTIVO)) return [];
    const prog = h.resolver(PROGRAMA, fila.PRO_CONSECUTIVO, ctx);
    if (!prog?.item || prog.item.activo) return [];
    return [
      {
        campo: "PRO_CONSECUTIVO",
        mensaje: `${prog.nombre} está inactivo en el catálogo y el programa debe estar activo en el periodo. Revise el programa o actívelo en el catálogo.`,
        seccion,
      },
    ];
  };
}

/* ---------- claves de los cruces ---------- */

/** «documento|codigoPrograma», como las claves de matriculados y graduados. null si falta algo. */
export function clavePrograma(fila: Fila, ctx: Contexto, h: Ayudas): string | null {
  if (h.vacio(fila.NUM_DOCUMENTO) || h.vacio(fila.PRO_CONSECUTIVO)) return null;
  const prog = h.resolver(PROGRAMA, fila.PRO_CONSECUTIVO, ctx);
  if (!prog) return null; // el motor ya marca el programa fuera de catálogo
  return `${h.documento(fila.NUM_DOCUMENTO)}|${prog.codigo}`;
}

/** «documento|codigoPrograma|periodo» del periodo que se reporta (inscritos, admitidos, primer curso). */
export function clavePeriodo(fila: Fila, ctx: Contexto, h: Ayudas): string | null {
  const clave = clavePrograma(fila, ctx, h);
  return clave ? `${clave}|${periodoActual(ctx)}` : null;
}

/* ---------- reglas de plantilla ---------- */

/** El documento tiene que estar en Participante (§3.1.1). */
export function reglaParticipante(seccion: string, quien: string): ReglaPlantilla {
  return (filas, ctx, h) => {
    const errores: ErrorFila[] = [];
    filas.forEach((fila, i) => {
      if (h.vacio(fila.NUM_DOCUMENTO)) return;
      const doc = h.documento(fila.NUM_DOCUMENTO);
      if (ctx.cruces.participantes.has(doc)) return;
      errores.push({
        fila: i,
        campo: "NUM_DOCUMENTO",
        mensaje: `${quien} ${doc} no está en Participante. Repórtelo primero en la plantilla Participante, o revise el número.`,
        seccion,
      });
    });
    return errores;
  };
}

/** Filas repetidas según una clave; se marca la segunda y siguientes. */
export function reglaRepetido(
  seccion: string,
  mensaje: (filaAnterior: number) => string,
  clave: (fila: Fila, ctx: Contexto, h: Ayudas) => string | null,
): ReglaPlantilla {
  return (filas, ctx, h) => {
    const errores: ErrorFila[] = [];
    const vistos = new Map<string, number>();
    filas.forEach((fila, i) => {
      const k = clave(fila, ctx, h);
      if (!k) return;
      const antes = vistos.get(k);
      if (antes === undefined) {
        vistos.set(k, i);
        return;
      }
      errores.push({ fila: i, campo: "NUM_DOCUMENTO", mensaje: mensaje(antes + 1), seccion });
    });
    return errores;
  };
}

/** La misma persona en el mismo programa, dos veces en la hoja. */
export function reglaRepetidoPrograma(seccion: string, quien: string): ReglaPlantilla {
  return reglaRepetido(
    seccion,
    (n) => `${quien} ya aparece en la fila ${n} con el mismo programa. Deje una sola fila.`,
    clavePrograma,
  );
}

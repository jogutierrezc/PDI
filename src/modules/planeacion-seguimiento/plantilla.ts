/* =============================================================================
   Planeación y Seguimiento · la plantilla de Excel para crear la planificación.

   Hojas: «Instrucciones», «Líneas del plan» y, ocultas, «Listas» y «_Control».
   Colores: azul claro = opcional, amarillo = obligatorio, gris = no tocar. Las dos
   primeras filas de «Líneas del plan» son ejemplos (N.º «EJEMPLO») y no se importan.
   Se arma en el navegador con exceljs (carga perezosa) sobre informes/ui/excel.ts.
   El mismo libro, ya lleno con las líneas de un plan, es el que se exporta.
   ========================================================================== */

import { construirLibro, type HojaExcel, type TipoCelda } from "../informes/ui/excel";
import { downloadBlob } from "../admin/traslado/transfer";
import {
  COLUMNAS, FORMATO_PLAN, HOJA_CONTROL, HOJA_INSTRUCCIONES, HOJA_LINEAS, HOJA_LISTAS, MARCA_EJEMPLO, MAX_LINEAS, VERSION_FORMATO, tituloColumna,
} from "./columnas";
import { ANIO_FIN, ANIO_INI, CAMPUS, CAMPUS_TODOS, CLASIFICACIONES, FUENTES, ORIGENES, PILARES_LISTA, PRIORIDADES, RESULTADOS, aniosDe, type Linea } from "./modelo";

type Fila = (string | number | null)[];

const EJEMPLOS: Linea[] = [
  {
    no: "EJ-1", clasif: "PLF", nombre: "Adecuación de aulas del campus principal", descripcion: "Ejemplo: remodelación de 12 aulas con mobiliario y conectividad. Esta fila no se importa.",
    campus: "Bucaramanga", pilar: PILARES_LISTA[2], monto: 1250000000, prioridad: "Alto", resultado: "Aprobado", fuente: "Presupuesto ordinario institucional",
    criterios: { alin: true, deficit: true, norm: true, pdi: true, sost: false }, viabilidad: { tec: true, fin: true, op: true, nor: true, est: true },
    inicio: "2027-02-01", fin: "2029-12-15", pct: { "2027": 0.4, "2028": 0.4, "2029": 0.2 }, origen: "Necesidad Transversal", oficina: null, gestorCorreo: null,
  },
  {
    no: "EJ-2", clasif: "IFT", nombre: "Licencias de software académico", descripcion: "Ejemplo de una línea que aún no se evalúa: se dejan vacías las celdas que no aplican. Esta fila no se importa.",
    campus: "Todos", pilar: PILARES_LISTA[0], monto: 480000000, prioridad: "Largo plazo", resultado: null, fuente: null,
    criterios: { alin: null, deficit: null, norm: null, pdi: null, sost: null }, viabilidad: { tec: null, fin: null, op: null, nor: null, est: null },
    inicio: null, fin: null, pct: {}, origen: "PMC", oficina: null, gestorCorreo: null,
  },
];

const siNo = (v: boolean | null): string | null => (v === true ? "Sí" : v === false ? "No" : null);
const puntos = (f: number): number => Math.round(f * 100 * 1e6) / 1e6;

/** Una línea como fila de la hoja «Líneas del plan» (en el orden de COLUMNAS). */
export function filaDeLinea(l: Linea, ejemplo = false): Fila {
  const hayPct = Object.values(l.pct).some((v) => v > 0);
  return COLUMNAS.map((c): string | number | null => {
    if (c.id === "no") return ejemplo ? MARCA_EJEMPLO : l.no;
    if (c.id === "clasif") return l.clasif;
    if (c.id === "nombre") return l.nombre;
    if (c.id === "descripcion") return l.descripcion;
    if (c.id === "campus") return l.campus;
    if (c.id === "pilar") return l.pilar;
    if (c.id === "monto") return l.monto;
    if (c.id === "prioridad") return l.prioridad;
    if (c.id === "resultado") return l.resultado;
    if (c.id === "fuente") return l.fuente;
    if (c.id === "inicio") return l.inicio;
    if (c.id === "fin") return l.fin;
    if (c.id === "origen") return l.origen;
    if (c.id === "oficina") return l.oficina;
    if (c.id === "gestorCorreo") return l.gestorCorreo;
    if (c.id.startsWith("crit:")) return siNo(l.criterios[c.id.slice(5) as keyof Linea["criterios"]]);
    if (c.id.startsWith("viab:")) return siNo(l.viabilidad[c.id.slice(5) as keyof Linea["viabilidad"]]);
    if (c.id.startsWith("pct:")) return hayPct ? puntos(l.pct[c.id.slice(4)] ?? 0) : null;
    return null;
  });
}

function hojaInstrucciones(plan: string): HojaExcel {
  const secciones: { titulo: string; filas: [string, string][] }[] = [
    {
      titulo: "1. Qué es este libro",
      filas: [
        ["Para qué sirve", `Es la plantilla para crear la planificación de «${plan}»: una fila por línea (proyecto) del plan, con la misma información de la matriz de priorización y evaluación. Cuando termine, la carga en el portal: Planeación y Seguimiento › Cargar la planificación.`],
        ["Qué NO hace", "Este libro no envía nada. El archivo se lee en su navegador; solo cuando usted confirma el último paso se crea el plan y la versión borrador v1.0. Un borrador no es oficial hasta que el administrador lo publica."],
        ["Qué NO se inventa", "Lo que deje vacío queda vacío. El portal no rellena montos, fechas ni porcentajes. Una línea sin evaluar puede ir sin criterios, fuente, fechas ni porcentajes."],
      ],
    },
    {
      titulo: "2. Paso a paso",
      filas: [
        ["Paso 1 · Descargar", "Ya lo hizo: este es el libro. Guárdelo en su computador."],
        ["Paso 2 · Llenar", "En la hoja «Líneas del plan» escriba una fila por línea. Las dos primeras filas (gris, N.º «EJEMPLO») son ejemplos: no se importan; puede dejarlas o borrarlas. Empiece en la tercera."],
        ["Paso 3 · Guardar", "Guarde el archivo como libro de Excel (.xlsx), con el mismo formato en que lo recibió. No lo convierta a CSV, PDF ni .xls. Tamaño máximo: 5 MB."],
        ["Paso 4 · Cargar", "En el portal, en «Cargar la planificación», elija el archivo. Verá primero lo que se leyó (líneas, inversión total, por campus y prioridad), después los problemas por hoja, fila y columna con cómo arreglarlos, y por último crea el plan. Las filas con error no se importan; las buenas sí."],
      ],
    },
    {
      titulo: "3. Qué va en cada columna (hoja «Líneas del plan»)",
      filas: [
        ["N.º", "La clave de la línea (1, 2, 3…). Es estable: identifica la línea entre versiones. No se repite. Obligatoria."],
        ["Clasificación", `Elija de la lista: ${CLASIFICACIONES.join(", ")}. Obligatoria.`],
        ["Nombre", "Cómo se llama la línea o proyecto, hasta 300 caracteres. Obligatoria."],
        ["Descripción", "Qué es y qué incluye, hasta 1.000 caracteres. Opcional."],
        ["Campus", `Elija de la lista (los campus del portal y «Todos»). «Todos» significa que la línea cubre todos los campus de la Universidad. Obligatoria.`],
        ["Pilar", `Elija de la lista: ${PILARES_LISTA.join("; ")}. Obligatoria.`],
        ["Monto", "El valor total de la línea en pesos colombianos, solo el número: 6971769559 o 6.971.769.559. No escriba el símbolo $ ni la palabra «millones». Obligatoria."],
        ["Prioridad", `Elija de la lista: ${PRIORIDADES.join(", ")}. Obligatoria.`],
        ["Resultado de la evaluación", `Escriba «${RESULTADOS[0]}» si la línea ya se evaluó y aprobó. Si aún no se evalúa, déjela vacía: así el portal la cuenta como «sin evaluar».`],
        ["Fuente de financiación", `Elija de la lista (${FUENTES.join("; ")}) o déjela vacía si no está definida. Un texto distinto se importa con un aviso.`],
        ["Criterios y viabilidades (10 columnas)", "Cinco criterios de priorización (Alineación, Déficit, Normativa, PDI, Sostenibilidad) y cinco viabilidades (Técnica, Financiera, Operativa, Normativa, Estratégica). Elija Sí o No, o déjelas vacías si la línea no se evaluó."],
        ["Fecha de inicio y de fin", "En formato AAAA-MM-DD (por ejemplo 2027-01-18). También se acepta una fecha de Excel o DD/MM/AAAA. El fin no puede ser anterior al inicio."],
        ["% de inversión 2027 … 2035", "Qué parte del monto se invierte cada año, de 0 a 100: escriba 12 para 12 %. La suma de los nueve años debería dar 100; si no da, se importa con un aviso. Si la línea no se evaluó, déjelos vacíos."],
        ["Origen", `De dónde viene la línea (por ejemplo ${ORIGENES.join(" o ")}). Opcional.`],
        ["Oficina responsable", "Elija de la lista: son las unidades del portal (Estructura y usuarios). Sirve para repartir el seguimiento por oficina en la fase siguiente. Opcional; si no la sabe, déjela vacía: no se inventa."],
        ["Correo del gestor", "El correo institucional de quien gestiona la línea en su oficina. Opcional."],
      ],
    },
    {
      titulo: "4. Qué significa cada lista (hoja oculta «Listas»)",
      filas: [
        ["Prioridad", "Crítico: sin esto no se opera. Alto: condiciona la calidad. Medio: mejora permanencia, movilidad o imagen. Largo plazo: expansión condicionada a crecimiento de matrícula y viabilidad."],
        ["Clasificación", "PLF: planta física. IFT: infraestructura tecnológica. IFT-LOG: infraestructura tecnológica y logística asociada."],
        ["Campus", "Bucaramanga, Valledupar y Cúcuta son campus de la Universidad; «Todos» es una línea transversal."],
      ],
    },
    {
      titulo: "5. Colores",
      filas: [
        ["Amarillo", "Obligatoria: si falta, esa fila no se importa."],
        ["Azul claro", "Opcional: se puede diligenciar, pero no es necesaria."],
        ["Gris", "No lo toque: son los ejemplos."],
      ],
    },
    {
      titulo: "6. Límites y errores comunes",
      filas: [
        ["Límites", `Hasta ${MAX_LINEAS} líneas por archivo y 5 MB. Si hay más, entran las primeras y se avisa.`],
        ["N.º repetido", "Cada línea lleva su propio N.º. Si repite uno, la segunda fila no se importa."],
        ["Monto con letras", "Escriba 1250000000, no «1.250 millones». Si agrega un $ se acepta, pero lo más claro es solo el número."],
        ["Porcentaje en fracción", "Escriba 12, no 0,12. Si todos los años están entre 0 y 1 se le avisa."],
        ["Fórmulas", "No use fórmulas: escriba los datos directamente. Lo que sea fórmula se ignora y se le avisa."],
        ["Cambiar encabezados u hojas", "No cambie los encabezados, el nombre de las hojas ni borre la hoja oculta _Control: así se reconoce que el libro es de esta plantilla."],
      ],
    },
  ];
  const filas: Fila[] = [];
  const negritas: number[] = [];
  const celdas: { fila: number; columna: number; tipo: TipoCelda }[] = [];
  for (const s of secciones) {
    if (filas.length) filas.push(["", ""]);
    negritas.push(filas.length);
    filas.push([s.titulo, ""]);
    for (const f of s.filas) {
      if (s.titulo.startsWith("5.")) celdas.push({ fila: filas.length, columna: 0, tipo: f[0] === "Amarillo" ? "obligatoria" : f[0] === "Azul claro" ? "diligenciar" : "bloqueada" });
      filas.push(f);
    }
  }
  return {
    nombre: HOJA_INSTRUCCIONES,
    banner: { titulo: "Plantilla de la planificación · Instrucciones", subtitulo: plan, ayuda: "Lea esta hoja una vez; después llene «Líneas del plan». Esta plantilla no envía nada: usted revisa todo en el portal antes de crear el plan." },
    columnas: [{ titulo: "Tema", ancho: 34 }, { titulo: "Qué hacer o qué significa", ancho: 120 }],
    filas,
    envolver: true,
    negritas,
    celdas,
  };
}

export interface OpcionesPlantilla {
  /** Nombre del plan (banda de las hojas). */
  plan?: string;
  /** Nombres de las unidades del portal (lista de «Oficina responsable»). */
  oficinas?: string[];
  /** Nombres de los campus del portal (sin «Todos»). Por omisión, los de la matriz real. */
  campus?: readonly string[];
  /** Líneas con las que se llena el libro (el plan actual o los datos reales). Sin ellas, la plantilla va vacía. */
  lineas?: Linea[];
  ahora?: Date;
  logo?: string;
}

/** Las hojas, listas para `construirLibro`. */
export function hojasPlantilla(op: OpcionesPlantilla = {}): HojaExcel[] {
  const plan = op.plan?.trim() || `PDIFyT ${ANIO_INI}-${ANIO_FIN}`;
  const oficinas = [...new Set(op.oficinas ?? [])].sort((a, b) => a.localeCompare(b, "es"));
  const campusLista = [...(op.campus ?? CAMPUS), CAMPUS_TODOS];
  const hoy = (op.ahora ?? new Date()).toISOString().slice(0, 10);
  const lineas = op.lineas ?? [];
  const filas: Fila[] = [...EJEMPLOS.map((l) => filaDeLinea(l, true)), ...lineas.map((l) => filaDeLinea(l))];
  const libres = lineas.length ? 25 : 80;
  const idx = (id: string) => COLUMNAS.findIndex((c) => c.id === id);
  const ejemplos = Array.from({ length: EJEMPLOS.length }, (_, f) => COLUMNAS.map((_, c) => ({ fila: f, columna: c, tipo: "bloqueada" as const }))).flat();
  const listas: Record<number, string[] | { rango: string }> = {
    [idx("clasif")]: [...CLASIFICACIONES],
    [idx("campus")]: campusLista,
    [idx("pilar")]: PILARES_LISTA,
    [idx("prioridad")]: [...PRIORIDADES],
    [idx("resultado")]: [...RESULTADOS],
    [idx("fuente")]: [...FUENTES],
  };
  for (const c of COLUMNAS) if (c.id.startsWith("crit:") || c.id.startsWith("viab:")) listas[idx(c.id)] = ["Sí", "No"];
  if (oficinas.length) listas[idx("oficina")] = { rango: `'${HOJA_LISTAS}'!$I$2:$I$${oficinas.length + 1}` };

  const nListas = Math.max(PILARES_LISTA.length, FUENTES.length, oficinas.length, campusLista.length, 2);
  const filaLista = (i: number): Fila => [
    CLASIFICACIONES[i] ?? null, campusLista[i] ?? null, PILARES_LISTA[i] ?? null, PRIORIDADES[i] ?? null, RESULTADOS[i] ?? null, FUENTES[i] ?? null,
    i === 0 ? "Sí" : i === 1 ? "No" : null, ORIGENES[i] ?? null, oficinas[i] ?? null,
  ];
  return [
    hojaInstrucciones(plan),
    {
      nombre: HOJA_LINEAS,
      banner: {
        titulo: `Líneas del plan · ${plan}`,
        subtitulo: "Una fila por línea. Amarillo: obligatorio. Azul claro: opcional. Gris: no lo toque.",
        ayuda: `Las dos primeras filas son ejemplos y no se importan. Hasta ${MAX_LINEAS} líneas. Los porcentajes van de 0 a 100 (12 = 12 %). Lo que no sepa, déjelo vacío.`,
      },
      columnas: COLUMNAS.map((c) => ({ titulo: tituloColumna(c), ancho: c.ancho })),
      filas,
      tipos: COLUMNAS.map((c) => c.tipo),
      celdas: ejemplos,
      listas,
      filasLibres: libres,
      largos: {
        [idx("nombre")]: { min: 3, max: 300, titulo: "Nombre", ayuda: "Cómo se llama la línea, hasta 300 caracteres.", error: "El nombre debe tener de 3 a 300 caracteres." },
        [idx("descripcion")]: { min: 0, max: 1000, titulo: "Descripción", ayuda: "Hasta 1.000 caracteres.", error: "La descripción admite hasta 1.000 caracteres." },
      },
    },
    {
      nombre: HOJA_LISTAS,
      oculta: true,
      columnas: ["Clasificación", "Campus", "Pilar", "Prioridad", "Resultado de la evaluación", "Fuente de financiación", "Sí o No", "Origen", "Oficina responsable"].map((t) => ({ titulo: t, ancho: 30 })),
      filas: Array.from({ length: nListas }, (_, i) => filaLista(i)),
    },
    {
      nombre: HOJA_CONTROL,
      oculta: true,
      columnas: [{ titulo: "clave" }, { titulo: "valor" }],
      filas: [
        ["formato", FORMATO_PLAN],
        ["version", VERSION_FORMATO],
        ["origen", lineas.length ? "plan" : "plantilla"],
        ["plan", plan],
        ["generado", hoy],
        ["anios", aniosDe().join("-")],
        ["lineas", lineas.length],
      ],
    },
  ];
}

export const nombreArchivoPlantilla = (lleno = false): string => (lleno ? "planificacion-pdifyt.xlsx" : "plantilla-planificacion.xlsx");

/** Arma el archivo en memoria (para la descarga y las pruebas). */
export const construirPlantilla = (op: OpcionesPlantilla = {}): Promise<ArrayBuffer> => construirLibro(hojasPlantilla(op), { logo: op.logo, filasLibres: 0 });

async function cargarLogo(): Promise<string | undefined> {
  try {
    const base = (import.meta.env.BASE_URL as string | undefined) ?? "/";
    const r = await fetch(`${base}logo-udes-blanco.png`);
    if (!r.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch {
    return undefined;
  }
}

/** Baja la plantilla (vacía, o llena con las líneas que se pasen). */
export async function descargarPlantilla(op: OpcionesPlantilla = {}): Promise<void> {
  const buffer = await construirPlantilla({ ...op, logo: op.logo ?? (await cargarLogo()) });
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreArchivoPlantilla(Boolean(op.lineas?.length)));
}

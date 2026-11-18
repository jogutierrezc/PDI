/* =============================================================================
   Encuestas con Pilo · la plantilla de Excel de logros y retos.

   Quien prefiera llenar sus logros y retos con calma baja este libro, lo
   diligencia en Excel (con instrucciones, ejemplos y listas desplegables) y lo
   importa en la encuesta (importar-logros-retos.ts). El libro NO envía nada:
   al importar, los aportes se cargan en el formulario para revisarlos y enviarlos
   por el camino de siempre.

   Hojas: «Instrucciones», «Logros y retos», «Cifras» y, ocultas, «Listas» y
   «_Control». «Logros y retos» y «Cifras» llevan los mismos encabezados base que
   el libro de «Mis envíos» (excel-envios.ts), así que aquel libro también se puede
   importar. Todo se arma en el navegador; exceljs se carga al descargar.
   ========================================================================== */

import { construirLibro, type HojaExcel } from "../../informes/ui/excel";
import { downloadBlob } from "../../admin/traslado/transfer";
import { TIPOS_CIFRA } from "../tipos";
import { LIMITES } from "../lib/validacion";
import { cargarLogo, FORMATO_ENVIOS, HOJA_CIFRAS, HOJA_CONTROL_ENVIOS, HOJA_ENVIOS, VERSION_ENVIOS } from "./excel-envios";

export const HOJA_INSTRUCCIONES = "Instrucciones";
export const HOJA_LISTAS = "Listas";
/** Lo que lleva la columna N.º de las filas de ejemplo: al importar se ignoran. */
export const MARCA_EJEMPLO = "EJEMPLO";

/** Los encabezados de la plantilla. Quien lee los reconoce por el texto base (lo que va antes del paréntesis). */
export const ENCABEZADOS_APORTES = ["N.º (no lo cambie)", "Tipo (elija de la lista)", `Título (${LIMITES.titulo.min} a ${LIMITES.titulo.max} caracteres)`, `Descripción (${LIMITES.descripcion.min} a ${LIMITES.descripcion.max} caracteres)`, "Cifras (se cuentan solas)"] as const;
export const ENCABEZADOS_CIFRAS = [
  "N.º (el del logro o reto)",
  "Tipo (se muestra solo)",
  "Título (se muestra solo)",
  `Qué mide (${LIMITES.que.min} a ${LIMITES.que.max} caracteres)`,
  "Valor (solo el número)",
  `Unidad (solo si el tipo es Otro)`,
  "Tipo de cifra (elija de la lista)",
] as const;

/** Fila de «Logros y retos» donde empieza lo que se diligencia (tras la banda y el encabezado) y de «Cifras». */
const PRIMERA = 5;
const EJEMPLOS_APORTES = 2;
const EJEMPLOS_CIFRAS = 3;
/** Filas de cifras en blanco: el promedio de cuatro por aporte. */
const FILAS_CIFRAS = 120;

const textoTiposCifra = TIPOS_CIFRA.map((t) => t.texto);

/** Los ejemplos de la plantilla (también sirven a las pruebas: deben ser válidos). */
export const EJEMPLO_LOGRO = {
  tipo: "Logro",
  titulo: "Renovación de la acreditación de alta calidad de tres programas",
  descripcion: "En 2026 el Consejo Nacional de Acreditación renovó la acreditación de tres programas de la facultad, con vigencia de seis años, después de la visita de pares y del plan de mejoramiento.",
  cifras: [
    { que: "Programas con acreditación renovada", valor: 3, tipo: "Programas", unidad: "" },
    { que: "Cumplimiento del plan de mejoramiento", valor: 72, tipo: "Porcentaje", unidad: "" },
  ],
} as const;
export const EJEMPLO_RETO = {
  tipo: "Reto",
  titulo: "Ampliar los escenarios de práctica clínica para los estudiantes",
  descripcion: "Los convenios actuales cubren solo una parte de los estudiantes que deben rotar. Se necesitan nuevos escenarios para atender a todos los grupos del próximo año.",
  cifras: [{ que: "Estudiantes que necesitan cupo de práctica", valor: 1200, tipo: "Estudiantes", unidad: "" }],
} as const;

type Fila = (string | number | null)[];

function hojaInstrucciones(opciones: { titulo: string }): HojaExcel {
  const secciones: { titulo: string; filas: [string, string][] }[] = [
    {
      titulo: "1. Qué es este libro",
      filas: [
        ["Para qué sirve", `Es una plantilla para contar los logros y los retos de su dependencia en Excel, con calma y con ayuda en cada columna. Cuando termine, la importa en la encuesta «${opciones.titulo}»: Mr. Pilo revisa cada fila y le dice qué corregir.`],
        ["Qué NO hace", "Este libro no envía nada. Lo que importe queda cargado en el formulario para que usted lo revise, lo edite y lo envíe cuando quiera. Nada sale hacia la Universidad hasta que oprima «Enviar»."],
      ],
    },
    {
      titulo: "2. Paso a paso",
      filas: [
        ["Paso 1 · Descargar", "Ya lo hizo: este es el libro. Guárdelo en su computador."],
        ["Paso 2 · Llenar", "En la hoja «Logros y retos» escriba una fila por cada logro o reto. En la hoja «Cifras» escriba las cifras que lo respaldan, una por fila, indicando el N.º del logro o reto al que pertenecen."],
        ["Paso 3 · Guardar", "Guarde el archivo como libro de Excel (.xlsx), con el mismo formato en que lo recibió. No lo convierta a CSV ni a PDF."],
        ["Paso 4 · Importar", "En la encuesta, oprima «Importar desde Excel» y elija el archivo. Verá cuántos aportes están listos y cuáles tienen problemas, con la fila exacta y cómo arreglarlos. Agregue los listos y revise todo antes de enviar."],
      ],
    },
    {
      titulo: "3. Qué va en cada columna",
      filas: [
        ["Hoja «Logros y retos»", `Una fila por logro o reto. Puede registrar hasta ${LIMITES.aportes} aportes por envío.`],
        ["N.º", "Ya viene numerado (1, 2, 3...). Sirve para enlazar las cifras con su logro o reto. No lo cambie."],
        ["Tipo", "Elija Logro (algo que su dependencia consiguió y merece destacarse) o Reto (lo que falta por lograr o exige más esfuerzo) en la lista desplegable."],
        ["Título", `Una frase corta, como la que saldría en un video. De ${LIMITES.titulo.min} a ${LIMITES.titulo.max} caracteres.`],
        ["Descripción", `Qué se hizo o qué falta, para quién y qué cambió. De ${LIMITES.descripcion.min} a ${LIMITES.descripcion.max} caracteres. Un texto más largo se rechaza: recórtelo.`],
        ["Cifras (columna gris)", "Se cuenta sola a partir de la hoja «Cifras». Si dice «Falta una cifra», agregue al menos una cifra con el N.º de esa fila."],
        ["Hoja «Cifras»", `Una cifra por fila. Cada logro o reto lleva de 1 a ${LIMITES.cifras} cifras.`],
        ["N.º (en «Cifras»)", "El número del logro o reto al que pertenece la cifra (el de la hoja «Logros y retos»). Las columnas Tipo y Título se llenan solas para que confirme que eligió bien."],
        ["Qué mide", `Qué es la cifra, por ejemplo «Graduados en 2025». De ${LIMITES.que.min} a ${LIMITES.que.max} caracteres.`],
        ["Valor", "Solo el número. Puede escribirlo como en Colombia: 1.250 (mil doscientos cincuenta) o 12,5 (doce y medio). No escriba letras ni unidades: la unidad la define el tipo de cifra. No puede ser negativo."],
        ["Tipo de cifra", "Elija de la lista: Estudiantes, Programas, Porcentaje, Dinero u Otro."],
        ["Unidad", `Regla de unidades: solo se llena cuando el tipo es Otro, con UNA palabra de ${LIMITES.otro.min} a ${LIMITES.otro.max} letras, sin números ni símbolos (por ejemplo, Convenios). Con los demás tipos déjela vacía.`],
        ["Porcentaje y dinero", `Un porcentaje va de 0 a ${LIMITES.porcentajeMax}: escriba 72, no 0,72. En Dinero escriba el valor en pesos colombianos, sin el símbolo.`],
        ["Dependencia", `No va en este libro: se escribe en el formulario de la encuesta (de ${LIMITES.dependencia.min} a ${LIMITES.dependencia.max} caracteres).`],
      ],
    },
    {
      titulo: "4. Ejemplos reales (ya están en el libro, en gris, y no se importan)",
      filas: [
        ["Logro", `«${EJEMPLO_LOGRO.titulo}». Cifras: 3 Programas («Programas con acreditación renovada») y 72 Porcentaje («Cumplimiento del plan de mejoramiento»).`],
        ["Reto", `«${EJEMPLO_RETO.titulo}». Cifra: 1.200 Estudiantes («Estudiantes que necesitan cupo de práctica»).`],
      ],
    },
    {
      titulo: "5. Colores",
      filas: [
        ["Azul claro", "Se puede diligenciar, pero es opcional."],
        ["Amarillo", "Obligatoria: la fila no se importa si falta."],
        ["Gris", "No lo toque: lo pone el libro (números, ejemplos y datos que se muestran solos)."],
      ],
    },
    {
      titulo: "6. Errores comunes",
      filas: [
        ["Título o descripción muy cortos", `El título necesita al menos ${LIMITES.titulo.min} caracteres y la descripción ${LIMITES.descripcion.min}. Cuente lo que ocurrió, no solo el tema.`],
        ["Valor con letras", "Escriba 1.250, no «1.250 estudiantes». Si usted agrega un % o un $, se acepta, pero lo más claro es solo el número."],
        ["Cifra sin su N.º", "Cada fila de «Cifras» debe decir a qué logro o reto pertenece. Si el N.º no existe en la otra hoja, la cifra se descarta y se le avisa."],
        ["Logro sin cifras", "Todo logro o reto lleva al menos una cifra que lo respalde."],
        ["Fórmulas", "No use fórmulas: escriba los datos directamente. Lo que sea fórmula se ignora."],
        ["Cambiar los encabezados o las hojas", "No cambie los encabezados, el nombre de las hojas ni borre la hoja oculta _Control: así se reconoce que el libro es de esta plantilla."],
        ["Filas de más", `Si pone más de ${LIMITES.aportes} aportes, entran los primeros y el resto se avisa. Envíe estos y vuelva a empezar con otro libro.`],
      ],
    },
  ];
  const filas: Fila[] = [];
  const negritas: number[] = [];
  const celdas: { fila: number; columna: number; tipo: "diligenciar" | "obligatoria" | "bloqueada" }[] = [];
  for (const s of secciones) {
    if (filas.length) filas.push(["", ""]);
    negritas.push(filas.length);
    filas.push([s.titulo, ""]);
    for (const f of s.filas) {
      if (s.titulo.startsWith("5.")) celdas.push({ fila: filas.length, columna: 0, tipo: f[0] === "Azul claro" ? "diligenciar" : f[0] === "Amarillo" ? "obligatoria" : "bloqueada" });
      filas.push(f);
    }
  }
  return {
    nombre: HOJA_INSTRUCCIONES,
    banner: { titulo: "Plantilla de logros y retos · Instrucciones", subtitulo: opciones.titulo, ayuda: "Lea esta hoja una vez; después llene «Logros y retos» y «Cifras». Esta plantilla no envía nada: usted lo revisa en la encuesta antes de enviar." },
    columnas: [{ titulo: "Tema", ancho: 32 }, { titulo: "Qué hacer o qué significa", ancho: 110 }],
    filas,
    envolver: true,
    negritas,
    celdas,
  };
}

/** Las hojas de la plantilla, listas para `construirLibro`. */
export function hojasPlantilla(opciones: { slug: string; titulo?: string; ahora?: Date }): HojaExcel[] {
  const titulo = opciones.titulo?.trim() || "Encuestas con Pilo";
  const hoy = (opciones.ahora ?? new Date()).toISOString().slice(0, 10);
  const n = LIMITES.aportes;

  const aportes: Fila[] = [];
  const ejemploAporte = (e: typeof EJEMPLO_LOGRO | typeof EJEMPLO_RETO): Fila => [MARCA_EJEMPLO, e.tipo, e.titulo, e.descripcion, `${e.cifras.length} cifra${e.cifras.length === 1 ? "" : "s"}`];
  aportes.push(ejemploAporte(EJEMPLO_LOGRO), ejemploAporte(EJEMPLO_RETO));
  for (let i = 1; i <= n; i++) aportes.push([i, null, null, null, null]);

  const cifras: Fila[] = [];
  const ejemploCifras = [
    ...EJEMPLO_LOGRO.cifras.map((c): Fila => [MARCA_EJEMPLO, EJEMPLO_LOGRO.tipo, EJEMPLO_LOGRO.titulo, c.que, c.valor, null, c.tipo]),
    ...EJEMPLO_RETO.cifras.map((c): Fila => [MARCA_EJEMPLO, EJEMPLO_RETO.tipo, EJEMPLO_RETO.titulo, c.que, c.valor, null, c.tipo]),
  ];
  cifras.push(...ejemploCifras);
  for (let i = 0; i < FILAS_CIFRAS; i++) cifras.push([null, null, null, null, null, null, null]);

  const ultimaAporte = PRIMERA + EJEMPLOS_APORTES + n - 1;
  const primeraLibreAporte = PRIMERA + EJEMPLOS_APORTES;
  const primeraLibreCifra = PRIMERA + EJEMPLOS_CIFRAS;
  const ultimaCifra = primeraLibreCifra + FILAS_CIFRAS - 1;
  const rangoNum = `'${HOJA_ENVIOS}'!$A$${primeraLibreAporte}:$A$${ultimaAporte}`;
  const rangoTipo = `'${HOJA_ENVIOS}'!$B$${primeraLibreAporte}:$B$${ultimaAporte}`;
  const rangoTit = `'${HOJA_ENVIOS}'!$C$${primeraLibreAporte}:$C$${ultimaAporte}`;
  const rangoCif = `'${HOJA_CIFRAS}'!$A$${primeraLibreCifra}:$A$${ultimaCifra}`;

  const formulasAportes = Array.from({ length: n }, (_, i) => {
    const r = primeraLibreAporte + i;
    return { fila: EJEMPLOS_APORTES + i, columna: 4, formula: `IF(C${r}="","",IF(COUNTIF(${rangoCif},A${r})=0,"Falta una cifra",COUNTIF(${rangoCif},A${r})&" cifra(s)"))` };
  });
  const formulasCifras = Array.from({ length: FILAS_CIFRAS }, (_, i) => {
    const r = primeraLibreCifra + i;
    const buscar = (rango: string) => `IF($A${r}="","",IFERROR(INDEX(${rango},MATCH($A${r},${rangoNum},0)),"No existe ese N.º"))`;
    return [
      { fila: EJEMPLOS_CIFRAS + i, columna: 1, formula: buscar(rangoTipo) },
      { fila: EJEMPLOS_CIFRAS + i, columna: 2, formula: buscar(rangoTit) },
    ];
  }).flat();

  const marcaEjemplos = (hasta: number, columnas: number) => Array.from({ length: hasta }, (_, f) => Array.from({ length: columnas }, (_, c) => ({ fila: f, columna: c, tipo: "bloqueada" as const }))).flat();

  return [
    hojaInstrucciones({ titulo }),
    {
      nombre: HOJA_ENVIOS,
      banner: {
        titulo: "Logros y retos",
        subtitulo: titulo,
        ayuda: `Una fila por logro o reto, hasta ${n}. Amarillo: obligatorio. Gris: no lo toque. Las dos primeras filas son ejemplos y no se importan. Después, llene la hoja «Cifras».`,
      },
      columnas: ENCABEZADOS_APORTES.map((t, i) => ({ titulo: t, ancho: [14, 16, 42, 70, 20][i] })),
      filas: aportes,
      tipos: ["bloqueada", "obligatoria", "obligatoria", "obligatoria", "bloqueada"],
      celdas: marcaEjemplos(EJEMPLOS_APORTES, ENCABEZADOS_APORTES.length),
      listas: { 1: ["Logro", "Reto"] },
      largos: {
        2: { min: LIMITES.titulo.min, max: LIMITES.titulo.max, titulo: "Título", ayuda: `Una frase corta, de ${LIMITES.titulo.min} a ${LIMITES.titulo.max} caracteres.`, error: `El título debe tener de ${LIMITES.titulo.min} a ${LIMITES.titulo.max} caracteres.` },
        3: { min: LIMITES.descripcion.min, max: LIMITES.descripcion.max, titulo: "Descripción", ayuda: `Qué se hizo, para quién y qué cambió: de ${LIMITES.descripcion.min} a ${LIMITES.descripcion.max} caracteres.`, error: `La descripción debe tener de ${LIMITES.descripcion.min} a ${LIMITES.descripcion.max} caracteres.` },
      },
      formulas: formulasAportes,
      filasLibres: 0,
    },
    {
      nombre: HOJA_CIFRAS,
      banner: {
        titulo: "Cifras de los logros y retos",
        subtitulo: titulo,
        ayuda: `Una cifra por fila. En N.º escriba el número del logro o reto (el de la hoja «Logros y retos»). Cada uno lleva de 1 a ${LIMITES.cifras} cifras. Unidad solo si el tipo es Otro. Las filas en gris de arriba son ejemplos.`,
      },
      columnas: ENCABEZADOS_CIFRAS.map((t, i) => ({ titulo: t, ancho: [16, 12, 38, 40, 16, 20, 20][i] })),
      filas: cifras,
      tipos: ["obligatoria", "bloqueada", "bloqueada", "obligatoria", "obligatoria", "diligenciar", "obligatoria"],
      celdas: marcaEjemplos(EJEMPLOS_CIFRAS, ENCABEZADOS_CIFRAS.length),
      listas: { 6: textoTiposCifra },
      largos: { 3: { min: LIMITES.que.min, max: LIMITES.que.max, titulo: "Qué mide", ayuda: `Qué es la cifra: de ${LIMITES.que.min} a ${LIMITES.que.max} caracteres.`, error: `Debe tener de ${LIMITES.que.min} a ${LIMITES.que.max} caracteres.` } },
      formulas: formulasCifras,
      filasLibres: 0,
    },
    {
      nombre: HOJA_LISTAS,
      oculta: true,
      columnas: [{ titulo: "Tipo de aporte" }, { titulo: "Tipo de cifra" }, { titulo: "Se lee como" }],
      filas: [
        ["Logro", "Estudiantes", "Un número de estudiantes, por ejemplo 1.200"],
        ["Reto", "Programas", "Un número de programas, por ejemplo 3"],
        [null, "Porcentaje", "De 0 a 100, se lee como 72 %"],
        [null, "Dinero", "En pesos colombianos, se lee como $ 1.250.000"],
        [null, "Otro", `Una palabra de ${LIMITES.otro.min} a ${LIMITES.otro.max} letras en la columna Unidad`],
      ],
    },
    {
      nombre: HOJA_CONTROL_ENVIOS,
      oculta: true,
      columnas: [{ titulo: "clave" }, { titulo: "valor" }],
      filas: [
        ["formato", FORMATO_ENVIOS],
        ["version", VERSION_ENVIOS],
        ["origen", "plantilla"],
        ["encuesta", opciones.slug],
        ["generado", hoy],
        ["maxAportes", n],
      ],
    },
  ];
}

export const nombreArchivoPlantilla = (slug: string): string => `plantilla-logros-y-retos-${slug.replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "encuesta"}.xlsx`;

/** Arma el archivo en memoria (para la descarga y las pruebas). */
export async function construirPlantilla(opciones: { slug: string; titulo?: string; logo?: string; ahora?: Date }): Promise<ArrayBuffer> {
  return construirLibro(hojasPlantilla(opciones), { logo: opciones.logo, filasLibres: 0 });
}

/** Baja la plantilla. */
export async function descargarPlantillaLogrosRetos(opciones: { slug: string; titulo?: string }): Promise<void> {
  const logo = await cargarLogo();
  const buffer = await construirPlantilla({ ...opciones, logo });
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreArchivoPlantilla(opciones.slug));
}

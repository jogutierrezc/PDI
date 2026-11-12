/* =============================================================================
   Informes Institucionales · las cuatro plantillas (A–D) y el catálogo de
   cifras por dimensión. Salen de la maqueta aprobada
   (docs/informes/maqueta-informes.html, TPL y DIMS): las secciones son fijas
   y numeradas; su clave es «s1», «s2»… en orden.
   ========================================================================== */

import type { CifraDef, DimDef, DimId, EstructuraRow, Plantilla, PlantillaDef, SeccionDef, SeccionEstructuraJson, TipoSeccion } from "./types";

export const CIFRAS: CifraDef[] = [
  { clave: "matric", etiqueta: "Matrícula total", unidad: "", mayorMejor: true, dim: "acad", fuente: "UDES en Cifras · Matrícula" },
  { clave: "deser", etiqueta: "Deserción anual", unidad: " %", mayorMejor: false, dim: "acad", fuente: "UDES en Cifras · SPADIES" },
  { clave: "reten", etiqueta: "Retención de primer semestre", unidad: " %", mayorMejor: true, dim: "acad", fuente: "UDES en Cifras · Permanencia" },
  { clave: "tyt", etiqueta: "Saber PRO · promedio global", unidad: "", mayorMejor: true, dim: "acad", fuente: "UDES en Cifras · Saber PRO" },
  { clave: "doc", etiqueta: "Profesores con doctorado", unidad: " %", mayorMejor: true, dim: "prof", fuente: "UDES en Cifras · Profesorado" },
  { clave: "eval", etiqueta: "Evaluación docente", unidad: "", mayorMejor: true, dim: "prof", fuente: "UDES en Cifras · Evaluación" },
  { clave: "rc", etiqueta: "Registros calificados vigentes", unidad: "", mayorMejor: true, dim: "cal", fuente: "UDES en Cifras · Oferta" },
  { clave: "rct", etiqueta: "Registros en trámite", unidad: "", mayorMejor: false, dim: "cal", fuente: "Oferta de programas · SACES" },
  { clave: "gru", etiqueta: "Grupos categorizados", unidad: "", mayorMejor: true, dim: "inv", fuente: "UDES en Cifras · Minciencias" },
  { clave: "sem", etiqueta: "Semilleros activos", unidad: "", mayorMejor: true, dim: "inv", fuente: "UDES en Cifras · Semilleros" },
  { clave: "nuc", etiqueta: "Productos de nuevo conocimiento", unidad: "", mayorMejor: true, dim: "inv", fuente: "UDES en Cifras · Producción" },
  { clave: "con", etiqueta: "Convenios activos", unidad: "", mayorMejor: true, dim: "ext", fuente: "UDES en Cifras · Convenios" },
  { clave: "pext", etiqueta: "Proyectos de extensión", unidad: "", mayorMejor: true, dim: "ext", fuente: "UDES en Cifras · Extensión" },
  { clave: "ejec", etiqueta: "Ejecución presupuestal", unidad: " %", mayorMejor: true, dim: "fin", fuente: "Vicerrectoría Administrativa y Financiera" },
];

const cifrasDe = (dim: DimId) => CIFRAS.filter((c) => c.dim === dim).map((c) => c.clave);

export const DIMS: Record<DimId, DimDef> = {
  acad: { id: "acad", titulo: "Gestión académica", funcion: "Enseñanza", cifras: cifrasDe("acad") },
  prof: { id: "prof", titulo: "Gestión profesoral", funcion: "Enseñanza", cifras: cifrasDe("prof") },
  cal: { id: "cal", titulo: "Calidad y oferta", funcion: "Enseñanza", cifras: cifrasDe("cal") },
  inv: { id: "inv", titulo: "Investigación", funcion: "Investigación", cifras: cifrasDe("inv") },
  ext: { id: "ext", titulo: "Extensión e internacionalización", funcion: "Extensión", cifras: cifrasDe("ext") },
  fin: { id: "fin", titulo: "Gestión administrativa y financiera", funcion: "Administrativa y financiera", cifras: cifrasDe("fin") },
};

type SinClave = Omit<SeccionDef, "clave">;
const numerar = (secciones: SinClave[]): SeccionDef[] => secciones.map((s, i) => ({ ...s, clave: `s${i + 1}` }));

export const TITULO_EVIDENCIAS = "Evidencias y fuentes de verificación";

/**
 * Evidencias y fuentes de verificación son esenciales y obligatorias en toda estructura: si la lista no trae
 * la sección, se agrega antes de los anexos (o al final) con la clave siguiente, sin mover las claves que ya existen.
 */
export function conEvidencia(secciones: SeccionDef[]): SeccionDef[] {
  if (secciones.some((s) => s.tipo === "evid")) return secciones;
  const siguiente = Math.max(0, ...secciones.map((s) => Number(s.clave.slice(1)) || 0)) + 1;
  const evid: SeccionDef = { clave: `s${siguiente}`, titulo: TITULO_EVIDENCIAS, tipo: "evid" };
  const i = secciones.findIndex((s) => s.tipo === "anexos");
  return i < 0 ? [...secciones, evid] : [...secciones.slice(0, i), evid, ...secciones.slice(i)];
}

const PLANTILLAS_BASE: Record<Plantilla, PlantillaDef> = {
  A: {
    id: "A",
    nombre: "Plantilla A",
    quien: "Decanatura",
    destino: "Rectoría de Campus",
    secciones: numerar([
      { titulo: "Resumen ejecutivo", tipo: "narr", extension: "1 a 3 párrafos", borrador: true, minimo: 25 },
      { titulo: "Alineación estratégica con el PDI", tipo: "pdi" },
      { titulo: "Objetivos y metas 2026", tipo: "metas" },
      { titulo: "Resultados por dimensión estratégica", tipo: "dim", dims: ["acad", "prof", "cal", "inv", "ext", "fin"] },
      { titulo: "Síntesis de resultados institucionales", tipo: "matriz" },
      { titulo: "Puntos críticos y acciones de mejora", tipo: "filas", columnas: ["Dimensión", "Punto crítico", "Acción", "Tiempo", "Recursos"] },
      { titulo: "Logros destacados", tipo: "logros" },
      { titulo: "Evidencias y fuentes de verificación", tipo: "evid" },
      { titulo: "Conclusiones", tipo: "narr", extension: "1 a 3 párrafos", minimo: 25 },
      { titulo: "Anexos", tipo: "anexos" },
    ]),
  },
  B: {
    id: "B",
    nombre: "Plantilla B",
    quien: "Vicerrectoría u oficina",
    destino: "Rectoría General",
    secciones: numerar([
      { titulo: "Resumen ejecutivo", tipo: "narr", extension: "1 a 3 párrafos, máximo dos páginas", borrador: true, minimo: 25 },
      { titulo: "Alineación estratégica", tipo: "pdi" },
      { titulo: "Objetivos y metas anuales de la unidad", tipo: "metas" },
      { titulo: "Resultados y evidencias", tipo: "dim", dims: ["ext", "inv", "fin"] },
      { titulo: "Logros innovadores o excepcionales", tipo: "logros" },
      { titulo: "Análisis de retos y oportunidades", tipo: "filas", columnas: ["Reto", "Aprendizaje", "Oportunidad", "Propuesta"] },
      { titulo: "Evidencia y fuentes de verificación", tipo: "evid" },
      { titulo: "Conclusiones", tipo: "narr", extension: "1 a 3 párrafos, tono claro y propositivo", minimo: 25 },
      { titulo: "Anexos", tipo: "anexos" },
    ]),
  },
  C: {
    id: "C",
    nombre: "Plantilla C",
    quien: "Rectoría de campus",
    destino: "Rectoría General",
    secciones: conEvidencia(numerar([
      { titulo: "Resumen ejecutivo del campus", tipo: "narr", extension: "1 a 3 párrafos del rector", borrador: true, minimo: 25 },
      { titulo: "Alineación estratégica con el PDI", tipo: "pdi" },
      { titulo: "Objetivos y metas del campus", tipo: "metas" },
      { titulo: "Consolidado por función sustantiva", tipo: "dim", dims: ["inv", "ext", "acad", "fin"], consolida: true },
      { titulo: "Resultados y evidencias", tipo: "matriz" },
      { titulo: "Análisis de retos y oportunidades", tipo: "filas", columnas: ["Reto", "Aprendizaje", "Oportunidad", "Propuesta"] },
      { titulo: "Conclusiones", tipo: "narr", extension: "1 a 3 párrafos", minimo: 25 },
      { titulo: "Anexos", tipo: "anexos" },
    ])),
  },
  D: {
    id: "D",
    nombre: "Plantilla D",
    quien: "Rectoría General",
    destino: "Consejo Superior",
    secciones: conEvidencia(numerar([
      { titulo: "Presentación del Rector", tipo: "narr", extension: "una página", borrador: true, minimo: 40 },
      { titulo: "Introducción", tipo: "narr", extension: "2 a 3 párrafos: propósito, periodo y organización", minimo: 30 },
      { titulo: "I. Investigación", tipo: "dim", dims: ["inv"], consolida: true, funcion: "Investigación" },
      { titulo: "II. Extensión", tipo: "dim", dims: ["ext"], consolida: true, funcion: "Extensión" },
      { titulo: "III. Enseñanza", tipo: "dim", dims: ["acad", "prof", "cal"], consolida: true, funcion: "Enseñanza" },
      { titulo: "IV. Gestión administrativa y financiera", tipo: "dim", dims: ["fin"], consolida: true, funcion: "Administrativa y financiera" },
      { titulo: "V. Síntesis y proyecciones 2027", tipo: "matriz" },
      { titulo: "Anexos", tipo: "anexos" },
    ])),
  },
};

/**
 * Las plantillas por id. Una estructura propia (X1…) que aún no se cargó, o que se borró, se lee como la A en
 * vez de romper la pantalla: `registrarEstructuras` la pone en su sitio apenas llegan los datos.
 */
export const PLANTILLAS: Record<Plantilla, PlantillaDef> = new Proxy(PLANTILLAS_BASE, {
  get: (t, k) => (typeof k === "string" && !(k in t) && /^[A-Z][A-Z0-9]{0,2}$/.test(k) ? t.A : t[k as string]),
});

/** Las plantillas conocidas, en orden: A–D y luego las propias (X1…). Es una lista viva: `registrarEstructuras` la actualiza. */
export const LETRAS: Plantilla[] = ["A", "B", "C", "D"];
const DEL_CODIGO = new Set<Plantilla>(["A", "B", "C", "D"]);

const aSeccionDef = (j: SeccionEstructuraJson, i: number): SeccionDef => ({
  clave: `s${i + 1}`,
  titulo: j.titulo,
  tipo: j.tipo,
  ...(j.extension ? { extension: j.extension } : {}),
  ...(j.borrador ? { borrador: true } : {}),
  ...(j.minimo ? { minimo: j.minimo } : {}),
  ...(j.dims?.length ? { dims: j.dims } : {}),
  ...(j.consolida ? { consolida: true } : {}),
  ...(j.funcion ? { funcion: j.funcion } : {}),
  ...(j.columnas?.length ? { columnas: j.columnas } : {}),
});

/**
 * Pone las estructuras propias (informe_estructuras, 0279) junto a las plantillas A–D: desde aquí todo el módulo
 * las trata igual (secciones, avance, vista, impresión). Reemplaza las propias anteriores; las del código no se tocan.
 */
export function registrarEstructuras(filas: EstructuraRow[]): void {
  for (const id of Object.keys(PLANTILLAS)) if (!DEL_CODIGO.has(id)) delete PLANTILLAS[id];
  for (const f of filas) {
    if (DEL_CODIGO.has(f.plantilla)) continue;
    PLANTILLAS[f.plantilla] = {
      id: f.plantilla,
      nombre: f.nombre,
      quien: f.quien,
      destino: f.destino,
      descripcion: f.descripcion,
      propia: true,
      activa: f.activa,
      secciones: conEvidencia((f.secciones ?? []).map(aSeccionDef)),
    };
  }
  const propias = Object.keys(PLANTILLAS).filter((id) => !DEL_CODIGO.has(id)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  LETRAS.splice(0, LETRAS.length, "A", "B", "C", "D", ...propias);
}

/** Las plantillas que se pueden ofrecer para un informe nuevo: las del código y las propias activas. */
export const plantillasAbribles = (): Plantilla[] => LETRAS.filter((id) => PLANTILLAS[id]?.activa !== false);

/** Una plantilla conocida; si no está registrada (estructura borrada o aún sin cargar), la A. */
export const plantillaDe = (id: Plantilla): PlantillaDef => PLANTILLAS[id] ?? PLANTILLAS.A;

/** La plantilla como la guarda una estructura propia: sirve para copiar una A–D como punto de partida. */
export const seccionesComoJson = (id: Plantilla): SeccionEstructuraJson[] =>
  (PLANTILLAS[id]?.secciones ?? []).filter((s) => s.tipo !== "libre").map((s) => ({
    titulo: s.titulo,
    tipo: s.tipo as SeccionEstructuraJson["tipo"],
    ...(s.extension ? { extension: s.extension } : {}),
    ...(s.borrador ? { borrador: true } : {}),
    ...(s.minimo ? { minimo: s.minimo } : {}),
    ...(s.dims?.length ? { dims: s.dims } : {}),
    ...(s.consolida ? { consolida: true } : {}),
    ...(s.funcion ? { funcion: s.funcion } : {}),
    ...(s.columnas?.length ? { columnas: s.columnas } : {}),
  }));

/** Qué se le pide a la unidad en cada tipo de sección (la línea bajo el título). */
export const AYUDA_TIPO: Record<TipoSeccion, string> = {
  narr: "Lo escribe la unidad",
  pdi: "Pilares y avance vienen del Plan de Desarrollo; usted marca con cuáles se articula",
  metas: "En un programa o facultad vienen de los indicadores del programa; el resultado se calcula solo",
  dim: "Las cifras vienen solas; usted explica lo que no se ve en ellas",
  matriz: "La matriz se arma con las cifras de las secciones anteriores",
  filas: "Una fila por punto, con acción y fecha",
  logros: "Máximo tres, cada uno con evidencia",
  evid: "Cargue aquí cada archivo una sola vez",
  anexos: "Se arma sola con los archivos que cargue",
  libre: "Sección propia de este ciclo: texto y tablas o gráficas de UDrive",
};

export const cifraDef = (clave: string): CifraDef | undefined => CIFRAS.find((c) => c.clave === clave);

/** Las dimensiones que usa una plantilla, sin repetir y en orden de aparición. */
export function dimsDe(plantilla: Plantilla): DimId[] {
  const vistas = new Set<DimId>();
  for (const s of PLANTILLAS[plantilla].secciones) for (const d of s.dims ?? []) vistas.add(d);
  return [...vistas];
}

/** Las claves de cifra que trae una plantilla. */
export const clavesDe = (plantilla: Plantilla): string[] => dimsDe(plantilla).flatMap((d) => DIMS[d].cifras);

/** Las unidades que escriben informe: todas menos los programas. */
export const escribeInforme = (kind: string) => kind !== "programa";

/** Plantilla sugerida por el tipo de unidad (units.kind); Planeación decide al abrir. */
export function plantillaSugerida(kind: string, nombre = ""): Plantilla {
  if (/rector[ií]a general/i.test(nombre)) return "D";
  if (/campus|sede|rector[ií]a/i.test(nombre)) return "C";
  return kind === "facultad" ? "A" : "B";
}

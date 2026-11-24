/* =============================================================================
   Recolector de noticias · perfiles de ranking (migración 0242).

   Un perfil es una manera de leer las mismas notas de udes.edu.co:
     ods     los 17 ODS, como funciona desde 0143 (el recolector de siempre)
     impact  THE Impact Rankings: ODS 17 obligatorio, los que UDES reporta
             (4, 5 y 10) y, si se activan, cualquiera de los otros
     world   THE World University Rankings: los cinco pilares
     green   UI GreenMetric: las siete categorías de la guía 2026

   Cada perfil guarda su configuración (umbral, máximo de temas, peso del título,
   constante, capas activas, palabras propias, fuentes, Pilo y modo de
   publicación). Los valores de fábrica del perfil ODS son EXACTAMENTE los de
   hoy: 35, 3 temas, título ×3, constante 14, Pilo apagado con confianza 85 y las
   siete fuentes.

   Los léxicos de THE World y de UI GreenMetric son una PROPUESTA redactada con
   la metodología (THE Impact 2027, THE World) y el catálogo 2026 de GreenMetric
   (migración 0209): no son oficiales y conviene que Planeación los revise. El
   de THE Impact no es nuevo: reutiliza el léxico de cada ODS.

   Este archivo no usa Deno ni el navegador: lo importan las funciones
   `noticias-ods` y `noticias-pilo`, la intranet (vista previa en vivo) y las
   pruebas.
   ========================================================================== */

import { LEXICO, MAX_ODS, PESO_TITULO, SATURACION, TEMA_PROPIO, UMBRAL, lexicoPropio, puntuarTemas } from "./clasificar.ts";
import type { AfinidadTema, Entrada } from "./clasificar.ts";

export type PerfilId = "ods" | "impact" | "world" | "green";
export const PERFIL_IDS: PerfilId[] = ["ods", "impact", "world", "green"];

/** Cómo se publica lo aprobado: una persona aprueba · Pilo aprueba lo claro · solo intranet. */
export type ModoPerfil = "persona" | "pilo" | "cerrado";

export interface Tema {
  /** «ods13», «ens», «SI»… */
  id: string;
  /** Lo que va en la marca: «13», «E», «SI». */
  cod: string;
  corto: string;
  nombre: string;
  /** El grupo del riel y de la hoja de configuración. */
  grupo: string;
}

export interface ConfigPerfil {
  /** ¿Recibe noticias? Si no, la carga no lo evalúa. */
  recibe: boolean;
  umbral: number;
  max_temas: number;
  peso_titulo: number;
  saturacion: number;
  pilo_aprueba: boolean;
  umbral_pilo: number;
  /** Claves de las fuentes de `noticias-ods` de las que lee. */
  fuentes: string[];
  /** Los temas activos. */
  capas: string[];
  palabras: string[];
  modo: ModoPerfil;
}

export const FUENTES_TODAS = ["comunicaciones", "investigacion", "extension", "bucaramanga", "cucuta", "valledupar", "bogota"];

const ODS_CORTOS = ["Pobreza", "Hambre", "Salud", "Educación", "Género", "Agua", "Energía", "Trabajo", "Industria", "Desigualdad", "Ciudades", "Consumo", "Clima", "Vida submarina", "Ecosistemas", "Paz y justicia", "Alianzas"];
const ODS_NOMBRES = [
  "Fin de la pobreza",
  "Hambre cero",
  "Salud y bienestar",
  "Educación de calidad",
  "Igualdad de género",
  "Agua limpia y saneamiento",
  "Energía asequible y no contaminante",
  "Trabajo decente y crecimiento económico",
  "Industria, innovación e infraestructura",
  "Reducción de las desigualdades",
  "Ciudades y comunidades sostenibles",
  "Producción y consumo responsables",
  "Acción por el clima",
  "Vida submarina",
  "Vida de ecosistemas terrestres",
  "Paz, justicia e instituciones sólidas",
  "Alianzas para lograr los objetivos",
];

const odsTema = (n: number, grupo: string): Tema => ({ id: `ods${n}`, cod: String(n), corto: ODS_CORTOS[n - 1], nombre: ODS_NOMBRES[n - 1], grupo });
const todosLosOds = (grupo: (n: number) => string) => Array.from({ length: 17 }, (_, i) => odsTema(i + 1, grupo(i + 1)));

/** Los ODS que UDES reporta a THE Impact además del 17, que es obligatorio. */
export const IMPACT_OBLIGATORIOS = ["ods17"];
export const IMPACT_REPORTADOS = ["ods4", "ods5", "ods10"];

export interface CatalogoPerfil {
  nombre: string;
  /** Etiqueta del riel: «Filtrar por ODS». */
  riel: string;
  /** En la hoja: «ODS», «pilares», «categorías». */
  plural: string;
  descripcion: string;
  temas: Tema[];
  /** Temas que no se pueden apagar. */
  fijos: string[];
}

export const CATALOGO: Record<PerfilId, CatalogoPerfil> = {
  ods: {
    nombre: "ODS",
    riel: "Filtrar por ODS",
    plural: "ODS",
    descripcion: "Los 17 ODS, como funciona hoy",
    temas: todosLosOds(() => "Objetivos de Desarrollo Sostenible"),
    fijos: [],
  },
  impact: {
    nombre: "THE Impact",
    riel: "Filtrar por ODS reportado",
    plural: "ODS",
    descripcion: "ODS 17 y los que UDES reporta",
    temas: todosLosOds((n) => (IMPACT_OBLIGATORIOS.includes(`ods${n}`) ? "Obligatorio" : IMPACT_REPORTADOS.includes(`ods${n}`) ? "Los que reporta UDES" : "Otros ODS")).sort(
      (a, b) => ordenImpact(a.id) - ordenImpact(b.id),
    ),
    fijos: IMPACT_OBLIGATORIOS,
  },
  world: {
    nombre: "THE World",
    riel: "Filtrar por pilar",
    plural: "pilares",
    descripcion: "Los cinco pilares del ranking mundial",
    temas: [
      { id: "ens", cod: "E", corto: "Enseñanza", nombre: "Enseñanza: entorno de aprendizaje", grupo: "Pilares" },
      { id: "ent", cod: "I", corto: "Entorno investigativo", nombre: "Entorno investigativo: volumen, ingresos y reputación", grupo: "Pilares" },
      { id: "cal", cod: "C", corto: "Calidad investigativa", nombre: "Calidad investigativa: citas, solidez e influencia", grupo: "Pilares" },
      { id: "int", cod: "P", corto: "Perspectiva internacional", nombre: "Perspectiva internacional: personal, estudiantes y colaboración", grupo: "Pilares" },
      { id: "ind", cod: "N", corto: "Industria", nombre: "Industria: ingresos e investigación con la industria", grupo: "Pilares" },
    ],
    fijos: [],
  },
  green: {
    nombre: "UI GreenMetric",
    riel: "Filtrar por categoría",
    plural: "categorías",
    descripcion: "Siete categorías de la guía 2026",
    temas: [
      { id: "SI", cod: "SI", corto: "Entorno e infraestructura", nombre: "Entorno e infraestructura", grupo: "Categorías de la guía" },
      { id: "EC", cod: "EC", corto: "Energía y clima", nombre: "Energía y cambio climático", grupo: "Categorías de la guía" },
      { id: "WS", cod: "WS", corto: "Residuos", nombre: "Residuos", grupo: "Categorías de la guía" },
      { id: "WR", cod: "WR", corto: "Agua", nombre: "Agua", grupo: "Categorías de la guía" },
      { id: "TR", cod: "TR", corto: "Transporte", nombre: "Transporte", grupo: "Categorías de la guía" },
      { id: "ED", cod: "ED", corto: "Educación e investigación", nombre: "Educación e investigación", grupo: "Categorías de la guía" },
      { id: "GD", cod: "GD", corto: "Gobernanza y digitalización", nombre: "Gobernanza y digitalización", grupo: "Categorías de la guía" },
    ],
    fijos: [],
  },
};

function ordenImpact(id: string): number {
  if (IMPACT_OBLIGATORIOS.includes(id)) return 0;
  if (IMPACT_REPORTADOS.includes(id)) return 1;
  return 2;
}

const FABRICA_BASE: Omit<ConfigPerfil, "capas" | "recibe" | "modo"> = {
  umbral: UMBRAL,
  max_temas: MAX_ODS,
  peso_titulo: PESO_TITULO,
  saturacion: SATURACION,
  pilo_aprueba: false,
  umbral_pilo: 85,
  fuentes: FUENTES_TODAS,
  palabras: [],
};

/** Los valores de fábrica de cada perfil. El de ODS es exactamente el recolector de hoy. */
export const FABRICA: Record<PerfilId, ConfigPerfil> = {
  ods: { ...FABRICA_BASE, recibe: true, modo: "persona", capas: CATALOGO.ods.temas.map((t) => t.id) },
  impact: { ...FABRICA_BASE, recibe: true, modo: "persona", capas: [...IMPACT_OBLIGATORIOS, ...IMPACT_REPORTADOS] },
  // THE World solo se ve en la intranet hasta que se abra (el panel de posición no es público).
  world: { ...FABRICA_BASE, recibe: false, modo: "cerrado", capas: CATALOGO.world.temas.map((t) => t.id) },
  green: { ...FABRICA_BASE, recibe: false, modo: "persona", capas: CATALOGO.green.temas.map((t) => t.id) },
};

/* ---------- Léxicos propios de THE World y de UI GreenMetric (propuesta) ----- */

const LEXICOS_PROPIOS: Record<string, Entrada> = {
  /* THE World · Enseñanza: reputación docente, razón estudiantes/docentes, doctorados, ingresos. */
  ens: {
    raices: ["docencia", "ensenanza", "pedagog", "didactic", "curricul", "acreditacion", "doctorado", "posgrado", "maestria", "aprendizaje", "simulacion"],
    frases: ["alta calidad", "acreditacion institucional", "registro calificado", "programa de doctorado", "nuevo doctorado", "nueva maestria", "innovacion pedagogica", "innovacion educativa", "aprendizaje activo", "aprendizaje basado en", "aula invertida", "ambiente de aprendizaje", "ambientes de aprendizaje", "excelencia academica", "docentes con doctorado", "profesores con doctorado", "centro de simulacion", "laboratorio de simulacion", "formacion docente", "mejores profesores", "reconocimiento a la docencia"],
  },
  /* THE World · Entorno investigativo: volumen, ingresos y reputación investigativa. */
  ent: {
    raices: ["investigad", "minciencias", "colciencias", "semillero", "financiacion", "cofinanci", "regalias", "posdoctoral"],
    frases: ["grupo de investigacion", "grupos de investigacion", "proyecto de investigacion", "proyectos de investigacion", "convocatoria de investigacion", "financiacion externa", "recursos de investigacion", "centro de investigacion", "semillero de investigacion", "jovenes investigadores", "joven investigador", "categorizacion de grupos", "reconocimiento de grupos", "produccion cientifica", "laboratorio de investigacion", "fondos de investigacion", "ingresos por investigacion", "convocatoria minciencias", "investigador asociado", "investigador senior", "ciencia abierta"],
  },
  /* THE World · Calidad investigativa: citas, solidez, excelencia e influencia. */
  cal: {
    raices: ["citacion", "scopus", "scielo", "indexad", "indexacion", "bibliometr", "cuartil", "altmetric", "orcid", "wos "],
    frases: ["web of science", "revista indexada", "revista de alto impacto", "factor de impacto", "articulo cientifico", "articulos cientificos", "publicacion cientifica", "publicaciones indexadas", "revista q1", "revista q2", "primer cuartil", "indice h", "impacto de la investigacion", "impacto cientifico", "visibilidad cientifica", "acceso abierto", "open access", "capitulo de libro", "libro de investigacion", "premio a la investigacion", "premio de investigacion", "publica en"],
  },
  /* THE World · Perspectiva internacional: personal, estudiantes y coautoría internacional. */
  int: {
    raices: ["internacionaliz", "intercambio", "extranjer", "cotutela", "coautoria", "bilingue", "multicultural"],
    frases: ["movilidad internacional", "movilidad academica", "estudiantes internacionales", "estudiantes extranjeros", "profesores visitantes", "profesor visitante", "docentes extranjeros", "convenio internacional", "convenios internacionales", "doble titulacion", "semestre en el exterior", "pasantia internacional", "pasantia en el exterior", "alianza internacional", "red internacional", "cooperacion internacional", "coautoria internacional", "colaboracion internacional", "investigacion internacional", "internacionalizacion en casa", "segunda lengua", "idioma extranjero", "universidad aliada", "universidades europeas"],
  },
  /* THE World · Industria: ingresos de la industria, transferencia y patentes. */
  ind: {
    raices: ["empresari", "industri", "patente", "licenciamiento", "consultoria", "spin "],
    frases: ["transferencia tecnologica", "transferencia de conocimiento", "sector productivo", "sector empresarial", "alianza con empresas", "alianza con la empresa", "convenio con empresas", "convenio con la empresa", "proyecto con empresas", "proyecto con la industria", "ingresos de la industria", "spin off", "empresa de base tecnologica", "registro de patente", "solicitud de patente", "patente de invencion", "propiedad intelectual", "licencia de tecnologia", "consultoria empresarial", "investigacion aplicada", "innovacion empresarial", "parque tecnologico", "incubadora de empresas", "universidad empresa estado", "camara de comercio"],
  },
  /* UI GreenMetric · SI: entorno e infraestructura (espacio verde, área abierta, sostenibilidad del campus). */
  SI: {
    raices: ["zona verde", "zonas verdes", "biodivers", "jardin", "arborizacion", "reforest", "paisajismo", "vegetacion", "bioclimatic"],
    frases: ["areas verdes", "area verde", "espacios verdes", "espacio verde", "area de bosque", "cobertura vegetal", "area de absorcion", "arboles nativos", "siembra de arboles", "jornada de siembra", "campus sostenible", "campus verde", "edificio verde", "edificio sostenible", "construccion sostenible", "infraestructura sostenible", "accesibilidad en el campus", "personas con discapacidad en el campus", "plan maestro del campus", "udes verde", "jardin vertical", "techo verde", "huerta universitaria", "huerta del campus"],
  },
  /* UI GreenMetric · EC: energía y cambio climático. */
  EC: {
    raices: ["energia", "solar", "fotovolta", "renovable", "carbono", "emision", "climatic", "eficiencia energetica", "led ", "biogas"],
    frases: ["paneles solares", "energia solar", "energia renovable", "energias renovables", "eficiencia energetica", "ahorro de energia", "consumo energetico", "huella de carbono", "carbono neutral", "carbono neutro", "neutralidad de carbono", "cambio climatico", "gases de efecto invernadero", "edificio inteligente", "medidor inteligente", "iluminacion led", "electrodomesticos eficientes", "programa de cambio climatico", "adaptacion climatica", "mitigacion del cambio climatico", "inventario de emisiones", "ahorro de electricidad"],
  },
  /* UI GreenMetric · WS: residuos. */
  WS: {
    raices: ["reciclaj", "residuos", "compost", "reutiliz", "plastico", "posconsumo", "aprovechamiento", "ecoladrillo", "raee "],
    frases: ["gestion de residuos", "manejo de residuos", "residuos solidos", "residuos organicos", "residuos peligrosos", "residuos toxicos", "residuos electronicos", "punto ecologico", "puntos ecologicos", "jornada de reciclaje", "programa de reciclaje", "reduccion de papel", "reduccion de plastico", "plastico de un solo uso", "un solo uso", "tratamiento de aguas residuales", "economia circular", "separacion en la fuente", "desperdicio de alimentos", "campana de reciclaje", "libre de papel", "cero papel"],
  },
  /* UI GreenMetric · WR: agua. */
  WR: {
    raices: ["agua", "acueducto", "hidric", "potabiliz", "alcantarill", "saneamiento", "pluvial", "ptar "],
    frases: ["ahorro de agua", "uso eficiente del agua", "conservacion del agua", "reutilizacion de agua", "agua lluvia", "aguas lluvias", "recoleccion de agua", "agua potable", "calidad del agua", "tratamiento de agua", "tratamiento de aguas", "aguas residuales", "dispositivos ahorradores", "programa de conservacion de agua", "huella hidrica", "dia del agua", "recurso hidrico", "grifos ahorradores", "sanitarios ahorradores"],
  },
  /* UI GreenMetric · TR: transporte. */
  TR: {
    raices: ["bicicleta", "ciclovia", "ciclorruta", "peaton", "transporte", "parqueadero", "vehiculo", "ciclista"],
    frases: ["movilidad sostenible", "transporte sostenible", "transporte publico", "transporte masivo", "metrolinea", "ciclorruta", "bicicletero", "bicicleteria", "parqueadero de bicicletas", "vehiculos electricos", "vehiculo electrico", "movilidad electrica", "movilidad urbana", "bus electrico", "buses electricos", "dia sin carro", "zona peatonal", "zonas peatonales", "ruta de buses", "ruta universitaria", "transporte compartido", "uso compartido de vehiculos", "carros compartidos", "estacion de carga", "limite de velocidad", "politica de transporte"],
  },
  /* UI GreenMetric · ED: educación e investigación en sostenibilidad. */
  ED: {
    raices: ["sostenib", "ambiental", "ecolog", "ecosistem", "catedra"],
    frases: ["educacion ambiental", "educacion para la sostenibilidad", "curso de sostenibilidad", "cursos de sostenibilidad", "asignatura de sostenibilidad", "catedra ambiental", "investigacion en sostenibilidad", "investigacion ambiental", "publicacion de sostenibilidad", "publicaciones de sostenibilidad", "evento de sostenibilidad", "festival ambiental", "semana ambiental", "dia de la tierra", "dia del medio ambiente", "voluntariado ambiental", "organizacion estudiantil ambiental", "grupo ambiental", "semillero ambiental", "semillero de sostenibilidad", "sitio web de sostenibilidad", "informe de sostenibilidad", "ods en el curriculo", "objetivos de desarrollo sostenible", "servicio social ambiental", "proyecto ambiental", "start up verde", "negocios verdes", "emprendimiento verde"],
  },
  /* UI GreenMetric · GD: gobernanza y digitalización. */
  GD: {
    raices: ["gobernanza", "politica ambiental", "digitaliz", "transparencia", "plataforma", "datos abiertos", "sistema de gestion"],
    frases: ["politica de sostenibilidad", "politica ambiental", "gestion ambiental", "sistema de gestion ambiental", "oficina de sostenibilidad", "comite de sostenibilidad", "comite ambiental", "plan de sostenibilidad", "plan ambiental", "informe de sostenibilidad", "reporte de sostenibilidad", "iso 14001", "ranking de sostenibilidad", "greenmetric", "green metric", "transformacion digital", "sistema de informacion", "plataforma digital", "datos abiertos", "tramites en linea", "sin papel", "campus inteligente", "universidad inteligente", "gestion documental", "auditoria ambiental", "rendicion de cuentas"],
  },
};

/** El léxico de un tema: el de un ODS (reutilizado) o el propio de un pilar o una categoría. */
export function lexicoDe(tema: string): Entrada | null {
  const m = /^ods(\d{1,2})$/.exec(tema);
  if (m) return LEXICO[Number(m[1])] ?? null;
  return LEXICOS_PROPIOS[tema] ?? null;
}

/* ---------- Configuración ---------------------------------------------------- */

const entero = (v: unknown, min: number, max: number, por: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : por;
};
const listaDe = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);

/** La configuración de un perfil, leída con cuidado de una fila de la base: sin fila o con algo raro, los valores de fábrica. */
export function leerConfig(id: PerfilId, fila: Record<string, unknown> | null | undefined): ConfigPerfil {
  const f = FABRICA[id];
  const validos = new Set(CATALOGO[id].temas.map((t) => t.id));
  const capas = (listaDe(fila?.capas) ?? f.capas).filter((c) => validos.has(c));
  for (const fijo of CATALOGO[id].fijos) if (!capas.includes(fijo)) capas.push(fijo);
  const fuentes = (listaDe(fila?.fuentes) ?? f.fuentes).filter((x) => FUENTES_TODAS.includes(x));
  const modo = fila?.modo === "persona" || fila?.modo === "pilo" || fila?.modo === "cerrado" ? fila.modo : f.modo;
  return {
    recibe: typeof fila?.recibe === "boolean" ? fila.recibe : f.recibe,
    umbral: entero(fila?.umbral, 10, 90, f.umbral),
    max_temas: entero(fila?.max_temas, 1, 6, f.max_temas),
    peso_titulo: entero(fila?.peso_titulo, 1, 6, f.peso_titulo),
    saturacion: entero(fila?.saturacion, 6, 30, f.saturacion),
    pilo_aprueba: typeof fila?.pilo_aprueba === "boolean" ? fila.pilo_aprueba : f.pilo_aprueba,
    umbral_pilo: entero(fila?.umbral_pilo, 50, 100, f.umbral_pilo),
    fuentes: fuentes.length ? fuentes : f.fuentes,
    capas,
    palabras: (listaDe(fila?.palabras) ?? []).map((p) => p.trim().slice(0, 60)).filter(Boolean).slice(0, 60),
    modo,
  };
}

/** Las opciones del motor para el perfil ODS (clasificar.ts, `leer`). */
export const opcionesOds = (c: ConfigPerfil) => ({
  umbral: c.umbral,
  max: c.max_temas,
  pesoTitulo: c.peso_titulo,
  saturacion: c.saturacion,
  palabras: c.palabras,
  capas: c.capas.map((x) => Number(x.slice(3))).filter((n) => n >= 1 && n <= 17),
});

/* ---------- Lectura de un perfil --------------------------------------------- */

export interface LecturaPerfil {
  /** Lo que el léxico propone: con el umbral y como mucho `max_temas`; incluye «propio». */
  temas: AfinidadTema[];
  /** Todo tema con alguna coincidencia, del más al menos afín (pistas para Pilo). */
  pistas: AfinidadTema[];
  /** ¿Tiene alguna coincidencia? Entonces Pilo la lee. */
  candidata: boolean;
}

/** Una nota leída con el léxico y la configuración de un perfil (cualquiera, incluido ODS con sus temas «odsN»). */
export function leerPerfil(titulo: string, texto: string, cfg: ConfigPerfil): LecturaPerfil {
  const entradas: [string, Entrada][] = [];
  for (const capa of cfg.capas) {
    const lex = lexicoDe(capa);
    if (lex) entradas.push([capa, lex]);
  }
  const propio = lexicoPropio(cfg.palabras);
  if (propio) entradas.push([TEMA_PROPIO, propio]);
  const pistas = puntuarTemas(titulo, texto, entradas, { pesoTitulo: cfg.peso_titulo, saturacion: cfg.saturacion });
  return { temas: pistas.filter((p) => p.score >= cfg.umbral).slice(0, cfg.max_temas), pistas, candidata: pistas.length > 0 };
}

/* ---------- Fuente de una nota ----------------------------------------------- */

/**
 * La fuente de la que salió una nota ya guardada, por su enlace: la sede por el
 * subdominio y, en udes.edu.co, la sección por la primera parte de la ruta.
 * Null si no se reconoce (entonces no se filtra).
 */
export function fuenteDeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const sede = /^([a-z]+)\.udes\.edu\.co$/.exec(u.hostname)?.[1];
    if (sede && FUENTES_TODAS.includes(sede)) return sede;
    const seccion = u.pathname.split("/").filter(Boolean)[0];
    return seccion && FUENTES_TODAS.includes(seccion) ? seccion : null;
  } catch {
    return null;
  }
}

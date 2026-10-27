/* =============================================================================
   CMS Portales · registro de tipos de bloque.

   Cada tipo dice qué campos edita quien escribe, con qué valores de partida y
   qué entrada animada tiene por defecto. La base guarda el tipo como texto;
   quien lo valida es este registro. Para agregar un tipo: una entrada aquí y
   su diseño en render.tsx.

   Dos clases de bloque:
   - De contenido: sus textos y listas se editan en el inspector. Los valores
     de partida son el contenido actual de cada portal (data.ts, content.ts,
     page.ts y las portadas), para que la página se pueda editar sin perder nada.
   - Vivos (`vivo: true`): muestran datos reales o interactivos del portal. Se
     pueden mover, ocultar o quitar, pero su contenido sale de la base. Solo
     tienen campos los que son texto del encabezado (p. ej., indicadores).
   ========================================================================== */

import { AXES, CAMPUSES, LAST, RANKINGS, YEARS, reports } from "../../sostenible/data";
import { contextFacts, leapDimensions } from "../../landing/content";
import { DEFAULT_PAGE } from "../../planeacion/page";
import type { Fondo, PresetMovimiento, Props } from "./tipos";

export type GrupoBloque = "Portada y estructura" | "Contenido básico" | "Diseño y columnas" | "Multimedia" | "Interactivo" | "Personas y contacto" | "Landing" | "Planeación" | "UDES Sostenible" | "Micrositios de ranking" | "Datos en vivo";

/** Los grupos del selector «Agregar bloque». Cada uno reúne tipos del mismo uso. */
export const GRUPOS: readonly GrupoBloque[] = ["Portada y estructura", "Contenido básico", "Diseño y columnas", "Multimedia", "Interactivo", "Personas y contacto", "Landing", "Planeación", "UDES Sostenible", "Micrositios de ranking", "Datos en vivo"];

export interface Opcion {
  valor: string;
  etiqueta: string;
}

export interface Subcampo {
  clave: string;
  etiqueta: string;
  /** «imagen»: una ruta del bucket, una ruta de /public o una URL https; el inspector deja subirla. */
  tipo: "texto" | "area" | "enum" | "imagen";
  opciones?: Opcion[];
  /** Solo se muestra cuando el campo `clave` de la misma fila vale alguno de `valores`. */
  cuando?: { clave: string; valores: string[] };
}

/** «codigo»: texto en letra monoespaciada y sin corrección ortográfica (HTML, CSS o JS). */
export type TipoCampo = "texto" | "area" | "imagen" | "bool" | "enum" | "numero" | "lista" | "codigo" | "referencia";

/** De dónde salen las opciones de un campo «referencia»: se cargan de la base al abrir el inspector. */
export type FuenteReferencia = "indicadores" | "tableros";

export interface CampoBloque {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  /** Solo para «enum». */
  opciones?: Opcion[];
  /** Solo para «numero». */
  min?: number;
  max?: number;
  /** Solo para «lista»: cada elemento tiene estos campos. */
  subcampos?: Subcampo[];
  /** Solo para «codigo»: el lenguaje que se espera, para el rótulo y la ayuda. */
  lenguaje?: "html" | "css" | "js";
  /** Solo para «referencia»: qué se elige (indicadores publicados o tableros publicados). */
  fuente?: FuenteReferencia;
  /** Solo para «referencia»: varias elecciones, ordenables (el valor es una lista de ids); si no, un id de texto. */
  multiple?: boolean;
}

export interface DefinicionBloque {
  tipo: string;
  nombre: string;
  ayuda: string;
  grupo: GrupoBloque;
  movimiento: PresetMovimiento;
  /** El fondo lo decide el contenido (p. ej. el tono del encabezado). */
  sinFondo?: boolean;
  /** Componente vivo: el inspector explica que sus datos salen de la base. */
  vivo?: true;
  /** Solo la administración lo agrega o lo edita (la base lo hace cumplir: migración 0200). */
  soloAdmin?: true;
  campos: CampoBloque[];
  /** Contenido de partida y, si hace falta, claves reservadas de estilo. */
  valores: () => Props;
}

/** Los seis frentes del diseño de UDES Sostenible, en su orden. */
const ICONOS_FRENTES = ["energia", "agua", "hoja", "libro", "gente", "escudo"] as const;

const OPCIONES_ICONO: Opcion[] = [
  { valor: "energia", etiqueta: "Energía" },
  { valor: "agua", etiqueta: "Gota de agua" },
  { valor: "hoja", etiqueta: "Hoja y territorio" },
  { valor: "libro", etiqueta: "Libro y docencia" },
  { valor: "gente", etiqueta: "Personas y comunidad" },
  { valor: "escudo", etiqueta: "Escudo y gobernanza" },
];

const OPCIONES_ICONO_CELDA: Opcion[] = [{ valor: "ninguno", etiqueta: "Sin icono" }, ...OPCIONES_ICONO];

const OPCIONES_ACENTO: Opcion[] = [1, 2, 3, 4, 5, 6].map((n) => ({ valor: String(n), etiqueta: `Color del pilar ${n}` }));

const OPCIONES_PUBLICADOR: Opcion[] = [
  { valor: "THE", etiqueta: "Times Higher Education (THE)" },
  { valor: "UI", etiqueta: "Universitas Indonesia (UI)" },
];

/** El número del pilar de un acento («var(--pillar-2)» → «2»). Si no lo tiene, el 2. */
const numeroPilar = (acento: string): string => acento.match(/pillar-(\d)/)?.[1] ?? "2";

/** Un destino de enlace: solo se acepta con destinoSeguro (rutas internas o https). */
const campoDestino = (clave: string, etiqueta: string): Subcampo => ({ clave, etiqueta, tipo: "texto" });

/** Encabezado de sección: antetítulo, título y texto. */
const CAMPOS_ENCABEZADO: CampoBloque[] = [
  { clave: "antetitulo", etiqueta: "Antetítulo", tipo: "texto" },
  { clave: "titulo", etiqueta: "Título", tipo: "texto", requerido: true },
  { clave: "texto", etiqueta: "Texto", tipo: "area" },
];

/** Un bloque vivo sin campos propios: solo se mueve, se oculta o se quita. */
const sinCampos = (): Props => ({});

/** Selector de ranking para los bloques de micrositio (valor: el id del ranking). */
const CAMPO_RANKING: CampoBloque = {
  clave: "ranking",
  etiqueta: "Ranking",
  tipo: "enum",
  requerido: true,
  opciones: RANKINGS.map((r) => ({ valor: r.id, etiqueta: r.name })),
};

/** Selector de subcategoría: el valor compuesto «ranking/categoria» (p. ej. «impact/o4»). */
const CAMPO_CATEGORIA: CampoBloque = {
  clave: "categoria",
  etiqueta: "Subcategoría",
  tipo: "enum",
  requerido: true,
  opciones: RANKINGS.flatMap((r) => r.categories.map((c) => ({ valor: `${r.id}/${c.id}`, etiqueta: `${r.short} · ${c.name}` }))),
};

/** Un campo de imagen: el inspector deja subir un archivo o pegar una dirección. */
const CAMPO_IMAGEN = (clave: string, etiqueta: string): Subcampo => ({ clave, etiqueta, tipo: "imagen" });

const OPCIONES_PROPORCION: Opcion[] = [
  { valor: "auto", etiqueta: "La de la imagen" },
  { valor: "16/9", etiqueta: "Panorámica 16:9" },
  { valor: "21/9", etiqueta: "Muy ancha 21:9" },
  { valor: "4/3", etiqueta: "Clásica 4:3" },
  { valor: "1/1", etiqueta: "Cuadrada" },
];

/**
 * Proporciones de «columnas-desiguales»: la clave es el valor guardado y los números
 * son las fracciones de cada columna. render.tsx las usa para armar la cuadrícula,
 * así que ningún texto escrito por una persona llega al CSS.
 */
export const PROPORCIONES_COLUMNAS: Record<string, { etiqueta: string; partes: number[] }> = {
  "60-40": { etiqueta: "Dos columnas 60 / 40", partes: [6, 4] },
  "70-30": { etiqueta: "Dos columnas 70 / 30", partes: [7, 3] },
  "30-70": { etiqueta: "Dos columnas 30 / 70", partes: [3, 7] },
  "40-60": { etiqueta: "Dos columnas 40 / 60", partes: [4, 6] },
  "50-25-25": { etiqueta: "Tres columnas 50 / 25 / 25", partes: [2, 1, 1] },
  "25-50-25": { etiqueta: "Tres columnas 25 / 50 / 25", partes: [1, 2, 1] },
  "25-25-50": { etiqueta: "Tres columnas 25 / 25 / 50", partes: [1, 1, 2] },
  "60-20-20": { etiqueta: "Tres columnas 60 / 20 / 20", partes: [3, 1, 1] },
  "20-60-20": { etiqueta: "Tres columnas 20 / 60 / 20", partes: [1, 3, 1] },
};

const OPCIONES_ALTO_BANNER: Opcion[] = [
  { valor: "baja", etiqueta: "Baja" },
  { valor: "media", etiqueta: "Media" },
  { valor: "alta", etiqueta: "Alta" },
];

export const BLOQUES: DefinicionBloque[] = [
  {
    tipo: "hero",
    nombre: "Encabezado",
    ayuda: "Título grande con palabra destacada, texto, botones y rueda de ODS",
    grupo: "Portada y estructura",
    movimiento: "palabras",
    sinFondo: true,
    campos: [
      { clave: "antetitulo", etiqueta: "Antetítulo", tipo: "texto" },
      { clave: "titulo", etiqueta: "Título", tipo: "texto", requerido: true },
      { clave: "enfasis", etiqueta: "Palabra destacada", tipo: "texto" },
      { clave: "texto", etiqueta: "Texto", tipo: "area" },
      { clave: "boton1", etiqueta: "Botón principal", tipo: "texto" },
      { clave: "destino1", etiqueta: "Destino del botón principal (/ruta o https://…)", tipo: "texto" },
      { clave: "boton2", etiqueta: "Botón secundario", tipo: "texto" },
      { clave: "destino2", etiqueta: "Destino del botón secundario (/ruta o https://…)", tipo: "texto" },
      {
        clave: "imagen",
        etiqueta: "Imagen de fondo",
        tipo: "enum",
        opciones: [
          { valor: "ninguna", etiqueta: "Sin imagen" },
          { valor: "ladera", etiqueta: "Ladera UDES Verde" },
        ],
      },
      {
        clave: "tono",
        etiqueta: "Tono",
        tipo: "enum",
        opciones: [
          { valor: "oscuro", etiqueta: "Oscuro (marino)" },
          { valor: "claro", etiqueta: "Claro" },
        ],
      },
      { clave: "rueda", etiqueta: "Mostrar la rueda de los ODS", tipo: "bool" },
      { clave: "buscador", etiqueta: "Mostrar el buscador de portales (Planeación)", tipo: "bool" },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "Título de la página",
      enfasis: "",
      texto: "Una frase que explique la página.",
      boton1: "",
      boton2: "",
      destino1: "",
      destino2: "",
      imagen: "ninguna",
      tono: "oscuro",
      rueda: false,
      buscador: false,
    }),
  },
  {
    tipo: "ods",
    nombre: "Cinta de los ODS",
    ayuda: "Los 17 Objetivos de Desarrollo Sostenible en marquesina",
    grupo: "UDES Sostenible",
    movimiento: "ninguna",
    sinFondo: true,
    campos: [{ clave: "velocidad", etiqueta: "Segundos por vuelta", tipo: "numero", min: 10, max: 80 }],
    valores: () => ({ velocidad: 34 }),
  },
  {
    tipo: "frentes",
    nombre: "Frentes de trabajo",
    ayuda: "Seis ejes con icono, nombre y texto",
    grupo: "UDES Sostenible",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO,
      {
        clave: "items",
        etiqueta: "Frentes",
        tipo: "lista",
        subcampos: [
          { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
          { clave: "texto", etiqueta: "Descripción", tipo: "area" },
          { clave: "icono", etiqueta: "Icono", tipo: "enum", opciones: OPCIONES_ICONO },
        ],
      },
    ],
    valores: () => ({
      antetitulo: "Cómo trabaja la UDES",
      titulo: "La sostenibilidad se vive en seis frentes.",
      texto: "Los frentes son una propuesta de estructura; cada uno enlazará a su oficina responsable y a sus indicadores.",
      items: AXES.map((a, i) => ({ nombre: a.name, texto: a.text, icono: ICONOS_FRENTES[i] ?? "hoja" })),
    }),
  },
  {
    tipo: "rankings",
    nombre: "Rankings",
    ayuda: "Una tarjeta por ranking: nombre, publicador, puesto en Colombia y color",
    grupo: "UDES Sostenible",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO,
      { clave: "nota", etiqueta: "Mostrar la nota «Dato ilustrativo»", tipo: "bool" },
      {
        clave: "items",
        etiqueta: "Rankings",
        tipo: "lista",
        subcampos: [
          { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
          { clave: "subtitulo", etiqueta: "Descripción", tipo: "area" },
          { clave: "publicador", etiqueta: "Publicador", tipo: "enum", opciones: OPCIONES_PUBLICADOR },
          { clave: "puesto", etiqueta: "Puesto en Colombia", tipo: "texto" },
          { clave: "acento", etiqueta: "Color de acento", tipo: "enum", opciones: OPCIONES_ACENTO },
          campoDestino("enlace", "Destino del micrositio (/ruta o https://…)"),
        ],
      },
    ],
    valores: () => ({
      antetitulo: "Rankings",
      titulo: "Un micrositio por cada ranking.",
      texto: "Cada ranking tiene su informe individual, sus ediciones y sus subcategorías, con indicadores propios.",
      nota: true,
      items: RANKINGS.map((r) => ({
        nombre: r.name,
        subtitulo: r.subtitle,
        publicador: r.publisher,
        puesto: String(r.national[LAST]),
        acento: numeroPilar(r.accent),
        enlace: `/sostenible/${r.id}`,
      })),
    }),
  },
  {
    tipo: "informes",
    nombre: "Informes",
    ayuda: "Una fila por informe: año, nombre y detalle. Los botones son visuales",
    grupo: "UDES Sostenible",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO,
      {
        clave: "items",
        etiqueta: "Informes",
        tipo: "lista",
        subcampos: [
          { clave: "anio", etiqueta: "Año", tipo: "texto" },
          { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
          { clave: "detalle", etiqueta: "Detalle", tipo: "area" },
        ],
      },
    ],
    valores: () => ({
      antetitulo: "Informes",
      titulo: "Descarga o consulta cada informe.",
      texto: "Un informe por ranking y edición, en pantalla o en PDF tamaño carta.",
      items: reports().map(({ ranking: r, yearIndex }) => ({
        anio: String(YEARS[yearIndex]),
        nombre: r.name,
        detalle: `${r.publisher} · puesto mundial ${r.world[yearIndex]} · Colombia #${r.national[yearIndex]}`,
      })),
    }),
  },
  {
    tipo: "ticker",
    nombre: "Barra de contexto",
    ayuda: "Cifras del diagnóstico en marquesina; cada cifra va con su frase. Se pausa con el cursor o el foco",
    grupo: "Landing",
    movimiento: "ninguna",
    sinFondo: true,
    campos: [
      { clave: "velocidad", etiqueta: "Segundos por vuelta", tipo: "numero", min: 10, max: 120 },
      {
        clave: "items",
        etiqueta: "Cifras",
        tipo: "lista",
        subcampos: [
          { clave: "figura", etiqueta: "Cifra", tipo: "texto" },
          { clave: "texto", etiqueta: "Qué significa", tipo: "area" },
        ],
      },
    ],
    valores: () => ({
      velocidad: 60,
      items: contextFacts.map((f) => ({ figura: f.figure, texto: f.text })),
    }),
  },
  {
    tipo: "salto",
    nombre: "El gran salto",
    ayuda: "Tabla de tres columnas: dimensión, lo que se supera y lo que se construye",
    grupo: "Landing",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO,
      {
        clave: "items",
        etiqueta: "Dimensiones",
        tipo: "lista",
        subcampos: [
          { clave: "dimension", etiqueta: "Dimensión", tipo: "texto" },
          { clave: "antes", etiqueta: "Se supera", tipo: "area" },
          { clave: "despues", etiqueta: "Se construye", tipo: "area" },
        ],
      },
    ],
    valores: () => ({
      antetitulo: "El gran salto",
      titulo: "Rompemos el molde: una educación pensada para la vida real",
      texto: "Superamos el aula magistral tradicional para abrazar un modelo centrado en retos, tecnología y adaptabilidad.",
      items: leapDimensions.map((d) => ({ dimension: d.dimension, antes: d.before, despues: d.after })),
    }),
  },
  {
    tipo: "mosaico",
    nombre: "Mosaico de portales",
    ayuda: "Las cinco teselas de la portada de Planeación, con sus datos reales. El título y la bajada sí se editan",
    grupo: "Planeación",
    movimiento: "sube",
    vivo: true,
    campos: [
      { clave: "titulo", etiqueta: "Título", tipo: "texto", requerido: true },
      { clave: "texto", etiqueta: "Texto", tipo: "area" },
    ],
    valores: () => ({
      titulo: DEFAULT_PAGE.home.portalsTitle,
      texto: DEFAULT_PAGE.home.portalsLede,
    }),
  },
  {
    tipo: "cierre",
    nombre: "Cierre de la oficina",
    ayuda: "Frase de cierre, enlace y lista de accesos",
    grupo: "Planeación",
    movimiento: "sube",
    campos: [
      { clave: "titulo", etiqueta: "Frase de cierre", tipo: "texto", requerido: true },
      { clave: "texto", etiqueta: "Propósito de la oficina", tipo: "area" },
      { clave: "enlace", etiqueta: "Texto del enlace", tipo: "texto" },
      campoDestino("destinoEnlace", "Destino del enlace (/ruta o https://…)"),
      {
        clave: "accesos",
        etiqueta: "Accesos",
        tipo: "lista",
        subcampos: [
          { clave: "etiqueta", etiqueta: "Nombre", tipo: "texto" },
          { clave: "detalle", etiqueta: "Detalle", tipo: "texto" },
          campoDestino("destino", "Destino (/ruta o https://…)"),
        ],
      },
    ],
    valores: () => ({
      titulo: DEFAULT_PAGE.home.closingTitle,
      texto: DEFAULT_PAGE.office.purpose,
      enlace: "Conocer la oficina",
      destinoEnlace: "/equipo",
      accesos: DEFAULT_PAGE.links.map((l) => ({ etiqueta: l.label, detalle: l.hint, destino: l.to })),
    }),
  },
  {
    tipo: "texto",
    nombre: "Texto",
    ayuda: "Párrafos y una cita destacada. Una línea en blanco separa un párrafo del siguiente",
    grupo: "Portada y estructura",
    movimiento: "sube",
    campos: [
      { clave: "texto", etiqueta: "Texto", tipo: "area", requerido: true },
      { clave: "cita", etiqueta: "Cita destacada", tipo: "texto" },
    ],
    valores: () => ({
      texto: "Escriba aquí el texto de la página. Una línea en blanco abre un párrafo nuevo.",
      cita: "",
    }),
  },
  {
    tipo: "imagen",
    nombre: "Imagen",
    ayuda: "Una imagen con pie opcional, proporción a elección y enlace",
    grupo: "Contenido básico",
    movimiento: "sube",
    campos: [
      CAMPO_IMAGEN("imagen", "Imagen"),
      { clave: "alt", etiqueta: "Descripción para lectores de pantalla (vacía si es decorativa)", tipo: "texto" },
      { clave: "pie", etiqueta: "Pie de la imagen", tipo: "texto" },
      { clave: "destino", etiqueta: "Destino al hacer clic (/ruta o https://…)", tipo: "texto" },
      { clave: "proporcion", etiqueta: "Proporción", tipo: "enum", opciones: OPCIONES_PROPORCION },
      {
        clave: "ajuste",
        etiqueta: "Ajuste",
        tipo: "enum",
        opciones: [
          { valor: "cubrir", etiqueta: "Llenar el marco (recorta)" },
          { valor: "contener", etiqueta: "Mostrar completa" },
        ],
      },
    ],
    valores: () => ({ imagen: "", alt: "", pie: "", destino: "", proporcion: "16/9", ajuste: "cubrir" }),
  },
  {
    tipo: "carrusel",
    nombre: "Carrusel",
    ayuda: "Imágenes que pasan una a una, con flechas, puntos, teclado y deslizamiento. Pasar solo es opcional y se detiene con el cursor o el foco",
    grupo: "Multimedia",
    movimiento: "sube",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      { clave: "proporcion", etiqueta: "Proporción", tipo: "enum", opciones: OPCIONES_PROPORCION.filter((o) => o.valor !== "auto") },
      { clave: "auto", etiqueta: "Pasar solo", tipo: "bool" },
      { clave: "segundos", etiqueta: "Segundos por imagen", tipo: "numero", min: 3, max: 20 },
      {
        clave: "items",
        etiqueta: "Imágenes",
        tipo: "lista",
        subcampos: [
          { clave: "titulo", etiqueta: "Título", tipo: "texto" },
          CAMPO_IMAGEN("imagen", "Imagen"),
          { clave: "alt", etiqueta: "Descripción para lectores de pantalla", tipo: "texto" },
          { clave: "texto", etiqueta: "Texto", tipo: "area" },
          campoDestino("destino", "Destino al hacer clic (/ruta o https://…)"),
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      proporcion: "16/9",
      auto: true,
      segundos: 6,
      items: [
        { titulo: "Primera imagen", imagen: "", alt: "", texto: "", destino: "" },
        { titulo: "Segunda imagen", imagen: "", alt: "", texto: "", destino: "" },
      ],
    }),
  },
  {
    tipo: "columnas",
    nombre: "Columnas",
    ayuda: "Una, dos o tres columnas; cada una lleva los títulos, textos, imágenes, citas y botones que se quiera",
    grupo: "Diseño y columnas",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      {
        clave: "cantidad",
        etiqueta: "Número de columnas",
        tipo: "enum",
        opciones: [
          { valor: "1", etiqueta: "Una columna" },
          { valor: "2", etiqueta: "Dos columnas" },
          { valor: "3", etiqueta: "Tres columnas" },
        ],
      },
      {
        clave: "items",
        etiqueta: "Elementos",
        tipo: "lista",
        subcampos: [
          { clave: "texto", etiqueta: "Texto", tipo: "area" },
          {
            clave: "elemento",
            etiqueta: "Elemento",
            tipo: "enum",
            opciones: [
              { valor: "texto", etiqueta: "Párrafos" },
              { valor: "titulo", etiqueta: "Título" },
              { valor: "imagen", etiqueta: "Imagen (el texto es su pie)" },
              { valor: "cita", etiqueta: "Cita destacada" },
              { valor: "boton", etiqueta: "Botón (el texto es su rótulo)" },
              { valor: "video", etiqueta: "Video de YouTube o Vimeo (el texto es su pie)" },
            ],
          },
          {
            clave: "columna",
            etiqueta: "Columna",
            tipo: "enum",
            opciones: [
              { valor: "1", etiqueta: "Primera" },
              { valor: "2", etiqueta: "Segunda" },
              { valor: "3", etiqueta: "Tercera" },
            ],
          },
          { ...CAMPO_IMAGEN("imagen", "Imagen"), cuando: { clave: "elemento", valores: ["imagen"] } },
          { clave: "alt", etiqueta: "Descripción para lectores de pantalla", tipo: "texto", cuando: { clave: "elemento", valores: ["imagen"] } },
          { clave: "destino", etiqueta: "Destino (/ruta o https://…) o enlace del video", tipo: "texto", cuando: { clave: "elemento", valores: ["imagen", "boton", "video"] } },
          {
            clave: "alinear",
            etiqueta: "Alineación de este elemento",
            tipo: "enum",
            opciones: [
              { valor: "", etiqueta: "La del bloque" },
              { valor: "izquierda", etiqueta: "Izquierda" },
              { valor: "centro", etiqueta: "Centrada" },
              { valor: "derecha", etiqueta: "Derecha" },
              { valor: "justificado", etiqueta: "Justificada" },
            ],
          },
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      cantidad: "2",
      items: [
        { texto: "Primera columna", elemento: "titulo", columna: "1", imagen: "", alt: "", destino: "", alinear: "" },
        { texto: "Escriba aquí el texto de la primera columna.", elemento: "texto", columna: "1", imagen: "", alt: "", destino: "", alinear: "" },
        { texto: "Segunda columna", elemento: "titulo", columna: "2", imagen: "", alt: "", destino: "", alinear: "" },
        { texto: "Escriba aquí el texto de la segunda columna.", elemento: "texto", columna: "2", imagen: "", alt: "", destino: "", alinear: "" },
      ],
    }),
  },
  {
    tipo: "video",
    nombre: "Video",
    ayuda: "Un video de YouTube o Vimeo. Se ve su portada y el video solo se carga al pulsar play, para que la página abra rápido",
    grupo: "Multimedia",
    movimiento: "sube",
    campos: [
      { clave: "url", etiqueta: "Enlace o código del video (YouTube o Vimeo)", tipo: "texto", requerido: true },
      { clave: "titulo", etiqueta: "Título del video (para lectores de pantalla)", tipo: "texto" },
      { clave: "pie", etiqueta: "Pie del video", tipo: "texto" },
      { clave: "inicio", etiqueta: "Empezar en el segundo (0: desde el principio)", tipo: "numero", min: 0, max: 86400 },
      {
        clave: "proporcion",
        etiqueta: "Proporción",
        tipo: "enum",
        opciones: [
          { valor: "16/9", etiqueta: "Panorámica 16:9" },
          { valor: "4/3", etiqueta: "Clásica 4:3" },
          { valor: "1/1", etiqueta: "Cuadrada" },
        ],
      },
    ],
    valores: () => ({ url: "", titulo: "", pie: "", inicio: 0, proporcion: "16/9" }),
  },
  {
    tipo: "acordeon",
    nombre: "Acordeón",
    ayuda: "Secciones que se abren y se cierran; cada una con su título y su texto",
    grupo: "Interactivo",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      { clave: "unico", etiqueta: "Abrir una sección a la vez", tipo: "bool" },
      { clave: "abierto", etiqueta: "Mostrar la primera abierta", tipo: "bool" },
      {
        clave: "items",
        etiqueta: "Secciones",
        tipo: "lista",
        subcampos: [
          { clave: "titulo", etiqueta: "Título", tipo: "texto" },
          { clave: "texto", etiqueta: "Texto (una línea en blanco abre un párrafo)", tipo: "area" },
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      unico: false,
      abierto: false,
      items: [
        { titulo: "Primera sección", texto: "Escriba aquí el contenido." },
        { titulo: "Segunda sección", texto: "Escriba aquí el contenido." },
      ],
    }),
  },
  {
    tipo: "preguntas",
    nombre: "Preguntas frecuentes",
    ayuda: "Preguntas y respuestas desplegables. Los buscadores las reconocen como preguntas frecuentes",
    grupo: "Interactivo",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      { clave: "unico", etiqueta: "Abrir una pregunta a la vez", tipo: "bool" },
      {
        clave: "items",
        etiqueta: "Preguntas",
        tipo: "lista",
        subcampos: [
          { clave: "pregunta", etiqueta: "Pregunta", tipo: "texto" },
          { clave: "respuesta", etiqueta: "Respuesta (una línea en blanco abre un párrafo)", tipo: "area" },
        ],
      },
    ],
    valores: () => ({
      antetitulo: "Preguntas frecuentes",
      titulo: "Lo que más nos preguntan",
      texto: "",
      unico: true,
      items: [
        { pregunta: "¿Primera pregunta?", respuesta: "Escriba aquí la respuesta." },
        { pregunta: "¿Segunda pregunta?", respuesta: "Escriba aquí la respuesta." },
      ],
    }),
  },
  {
    tipo: "cta",
    nombre: "Llamado a la acción",
    ayuda: "Una frase corta sobre banda marina, un botón y, si se quiere, su destino",
    grupo: "Portada y estructura",
    movimiento: "sube",
    campos: [
      { clave: "texto", etiqueta: "Frase", tipo: "texto", requerido: true },
      { clave: "boton", etiqueta: "Texto del botón", tipo: "texto" },
      { clave: "destino", etiqueta: "Destino del botón (/ruta o https://…)", tipo: "texto" },
    ],
    valores: () => ({
      texto: "¿Por qué la UDES es sostenible?",
      boton: "Conocer la respuesta",
      destino: "",
      _estilo: { fondo: "marino" satisfies Fondo, espacio: "normal" },
    }),
  },
  {
    tipo: "cuadricula",
    nombre: "Cuadrícula de tarjetas",
    ayuda: "De 1 a 6 celdas por fila; cada una con icono o imagen, título, texto y botón. Se reacomoda sola en pantallas angostas",
    grupo: "Diseño y columnas",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      {
        clave: "cantidad",
        etiqueta: "Celdas por fila",
        tipo: "enum",
        opciones: [1, 2, 3, 4, 6].map((n) => ({ valor: String(n), etiqueta: n === 1 ? "Una" : String(n) })),
      },
      {
        clave: "separacion",
        etiqueta: "Separación entre celdas",
        tipo: "enum",
        opciones: [
          { valor: "chica", etiqueta: "Chica" },
          { valor: "media", etiqueta: "Media" },
          { valor: "grande", etiqueta: "Grande" },
        ],
      },
      {
        clave: "vertical",
        etiqueta: "Alineación vertical de las celdas",
        tipo: "enum",
        opciones: [
          { valor: "inicio", etiqueta: "Arriba" },
          { valor: "centro", etiqueta: "Al centro" },
          { valor: "fin", etiqueta: "Abajo" },
          { valor: "estirar", etiqueta: "Misma altura" },
        ],
      },
      { clave: "tarjeta", etiqueta: "Dibujar cada celda como tarjeta con borde", tipo: "bool" },
      {
        clave: "items",
        etiqueta: "Celdas",
        tipo: "lista",
        subcampos: [
          { clave: "titulo", etiqueta: "Título", tipo: "texto" },
          { clave: "texto", etiqueta: "Texto", tipo: "area" },
          { clave: "icono", etiqueta: "Icono (si no hay imagen)", tipo: "enum", opciones: OPCIONES_ICONO_CELDA },
          CAMPO_IMAGEN("imagen", "Imagen"),
          { clave: "alt", etiqueta: "Descripción de la imagen para lectores de pantalla", tipo: "texto" },
          { clave: "boton", etiqueta: "Texto del botón (vacío: sin botón)", tipo: "texto" },
          campoDestino("destino", "Destino del botón (/ruta o https://…)"),
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      cantidad: "3",
      separacion: "media",
      vertical: "inicio",
      tarjeta: true,
      items: [
        { titulo: "Primera celda", texto: "Escriba aquí lo que quiera contar en esta celda.", icono: "hoja", imagen: "", alt: "", boton: "", destino: "" },
        { titulo: "Segunda celda", texto: "Escriba aquí lo que quiera contar en esta celda.", icono: "libro", imagen: "", alt: "", boton: "", destino: "" },
        { titulo: "Tercera celda", texto: "Escriba aquí lo que quiera contar en esta celda.", icono: "gente", imagen: "", alt: "", boton: "", destino: "" },
      ],
    }),
  },
  {
    tipo: "cifras",
    nombre: "Cifras",
    ayuda: "Números grandes con su etiqueta, en 2, 3 o 4 columnas. Pueden contar desde cero al llegar a la pantalla",
    grupo: "Diseño y columnas",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      {
        clave: "columnas",
        etiqueta: "Columnas",
        tipo: "enum",
        opciones: [
          { valor: "2", etiqueta: "Dos columnas" },
          { valor: "3", etiqueta: "Tres columnas" },
          { valor: "4", etiqueta: "Cuatro columnas" },
        ],
      },
      { clave: "conteo", etiqueta: "Contar desde cero al aparecer (se omite con movimiento reducido)", tipo: "bool" },
      { clave: "ilustrativo", etiqueta: "Mostrar la nota «Dato ilustrativo»", tipo: "bool" },
      {
        clave: "items",
        etiqueta: "Cifras",
        tipo: "lista",
        subcampos: [
          { clave: "valor", etiqueta: "Valor (solo número: 1.250 o 3,5)", tipo: "texto" },
          { clave: "prefijo", etiqueta: "Antes del valor (p. ej. $ o +)", tipo: "texto" },
          { clave: "sufijo", etiqueta: "Después del valor (p. ej. % o mil)", tipo: "texto" },
          { clave: "etiqueta", etiqueta: "Qué mide", tipo: "texto" },
          { clave: "nota", etiqueta: "Nota o fuente (opcional)", tipo: "texto" },
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      columnas: "3",
      conteo: true,
      ilustrativo: true,
      items: [
        { valor: "1.250", prefijo: "", sufijo: "", etiqueta: "Primera cifra: escriba qué mide", nota: "" },
        { valor: "85", prefijo: "", sufijo: "%", etiqueta: "Segunda cifra: escriba qué mide", nota: "" },
        { valor: "12", prefijo: "", sufijo: "", etiqueta: "Tercera cifra: escriba qué mide", nota: "" },
      ],
    }),
  },
  {
    tipo: "imagen-texto",
    nombre: "Imagen con texto",
    ayuda: "Una imagen junto a un texto con antetítulo, título y hasta dos botones. En pantallas angostas se apilan",
    grupo: "Diseño y columnas",
    movimiento: "cascada",
    campos: [
      CAMPO_IMAGEN("imagen", "Imagen"),
      { clave: "alt", etiqueta: "Descripción para lectores de pantalla (vacía si es decorativa)", tipo: "texto" },
      {
        clave: "disposicion",
        etiqueta: "Disposición",
        tipo: "enum",
        opciones: [
          { valor: "lado", etiqueta: "Imagen al lado del texto" },
          { valor: "centrada", etiqueta: "Imagen arriba y texto centrado debajo" },
        ],
      },
      {
        clave: "lado",
        etiqueta: "Lado de la imagen",
        tipo: "enum",
        opciones: [
          { valor: "izquierda", etiqueta: "Izquierda" },
          { valor: "derecha", etiqueta: "Derecha" },
        ],
      },
      {
        clave: "proporcion",
        etiqueta: "Proporción de la imagen",
        tipo: "enum",
        opciones: [
          { valor: "4/3", etiqueta: "Clásica 4:3" },
          { valor: "16/9", etiqueta: "Panorámica 16:9" },
          { valor: "1/1", etiqueta: "Cuadrada" },
          { valor: "3/4", etiqueta: "Vertical 3:4" },
        ],
      },
      {
        clave: "vertical",
        etiqueta: "Alineación vertical del texto",
        tipo: "enum",
        opciones: [
          { valor: "inicio", etiqueta: "Arriba" },
          { valor: "centro", etiqueta: "Al centro" },
          { valor: "fin", etiqueta: "Abajo" },
        ],
      },
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      { clave: "boton1", etiqueta: "Botón principal", tipo: "texto" },
      campoDestino("destino1", "Destino del botón principal (/ruta o https://…)"),
      { clave: "boton2", etiqueta: "Botón secundario", tipo: "texto" },
      campoDestino("destino2", "Destino del botón secundario (/ruta o https://…)"),
    ],
    valores: () => ({
      imagen: "",
      alt: "",
      disposicion: "lado",
      lado: "izquierda",
      proporcion: "4/3",
      vertical: "centro",
      antetitulo: "",
      titulo: "Título de la sección",
      texto: "Escriba aquí el texto que acompaña a la imagen. Una línea en blanco abre un párrafo nuevo.",
      boton1: "",
      destino1: "",
      boton2: "",
      destino2: "",
    }),
  },
  {
    tipo: "cita",
    nombre: "Cita destacada",
    ayuda: "Una frase grande con su autor, su cargo y, si se quiere, su foto",
    grupo: "Contenido básico",
    movimiento: "sube",
    campos: [
      { clave: "texto", etiqueta: "Cita", tipo: "area", requerido: true },
      { clave: "autor", etiqueta: "Autor", tipo: "texto" },
      { clave: "cargo", etiqueta: "Cargo o dependencia", tipo: "texto" },
      CAMPO_IMAGEN("imagen", "Foto (opcional)"),
      { clave: "alt", etiqueta: "Descripción de la foto para lectores de pantalla (vacía si basta con el nombre)", tipo: "texto" },
    ],
    valores: () => ({ texto: "Escriba aquí la frase que quiere destacar.", autor: "Nombre de la persona", cargo: "Cargo o dependencia", imagen: "", alt: "" }),
  },
  {
    tipo: "html",
    nombre: "HTML personalizado",
    ayuda: "HTML, CSS y JavaScript propios, aislados en un marco. Solo la administración lo agrega y lo edita",
    grupo: "Interactivo",
    movimiento: "sube",
    soloAdmin: true,
    campos: [
      { clave: "titulo", etiqueta: "Título del marco (lo lee el lector de pantalla)", tipo: "texto", requerido: true },
      { clave: "html", etiqueta: "HTML", tipo: "codigo", lenguaje: "html" },
      { clave: "css", etiqueta: "CSS", tipo: "codigo", lenguaje: "css" },
      { clave: "js", etiqueta: "JavaScript", tipo: "codigo", lenguaje: "js" },
      { clave: "alto", etiqueta: "Altura mínima (píxeles)", tipo: "numero", min: 80, max: 2000 },
      { clave: "ajustar", etiqueta: "Ajustar la altura al contenido", tipo: "bool" },
    ],
    valores: () => ({ titulo: "Contenido incrustado", html: "", css: "", js: "", alto: 320, ajustar: true }),
  },
  /* --- Personas, tiempo y contacto: bloques de la tanda F --------------------------------------- */
  {
    tipo: "linea-tiempo",
    nombre: "Línea de tiempo",
    ayuda: "Hitos con fecha, título, texto e imagen opcional. Vertical alternada (una columna en el teléfono) u horizontal desplazable",
    grupo: "Contenido básico",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      {
        clave: "orientacion",
        etiqueta: "Orientación",
        tipo: "enum",
        opciones: [
          { valor: "vertical", etiqueta: "Vertical" },
          { valor: "horizontal", etiqueta: "Horizontal (se desplaza de lado)" },
        ],
      },
      {
        clave: "items",
        etiqueta: "Hitos",
        tipo: "lista",
        subcampos: [
          { clave: "titulo", etiqueta: "Título", tipo: "texto" },
          { clave: "fecha", etiqueta: "Fecha o año", tipo: "texto" },
          { clave: "texto", etiqueta: "Texto", tipo: "area" },
          CAMPO_IMAGEN("imagen", "Imagen (opcional)"),
          { clave: "alt", etiqueta: "Descripción de la imagen para lectores de pantalla", tipo: "texto" },
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      orientacion: "vertical",
      items: [
        { titulo: "Fundación de la institución", fecha: "Año", texto: "Escriba aquí qué ocurrió y por qué marcó el rumbo de la universidad.", imagen: "", alt: "" },
        { titulo: "Apertura de un nuevo campus", fecha: "Año", texto: "Escriba aquí qué ocurrió y por qué marcó el rumbo de la universidad.", imagen: "", alt: "" },
        { titulo: "Acreditación institucional", fecha: "Año", texto: "Escriba aquí qué ocurrió y por qué marcó el rumbo de la universidad.", imagen: "", alt: "" },
      ],
    }),
  },
  {
    tipo: "equipo",
    nombre: "Equipo",
    ayuda: "Personas con foto, nombre, cargo, correo (texto que se copia con un clic) y enlace opcional, en 2, 3 o 4 por fila",
    grupo: "Personas y contacto",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      {
        clave: "columnas",
        etiqueta: "Personas por fila",
        tipo: "enum",
        opciones: [
          { valor: "2", etiqueta: "Dos" },
          { valor: "3", etiqueta: "Tres" },
          { valor: "4", etiqueta: "Cuatro" },
        ],
      },
      {
        clave: "foto",
        etiqueta: "Forma de la foto",
        tipo: "enum",
        opciones: [
          { valor: "redonda", etiqueta: "Redonda" },
          { valor: "cuadrada", etiqueta: "Cuadrada" },
        ],
      },
      {
        clave: "items",
        etiqueta: "Personas",
        tipo: "lista",
        subcampos: [
          { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
          { clave: "cargo", etiqueta: "Cargo o dependencia", tipo: "texto" },
          CAMPO_IMAGEN("imagen", "Foto (sin foto se muestran las iniciales)"),
          { clave: "correo", etiqueta: "Correo (opcional)", tipo: "texto" },
          campoDestino("enlace", "Enlace al perfil (opcional: /ruta o https://…)"),
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      columnas: "3",
      foto: "redonda",
      items: [
        { nombre: "Nombre y apellido", cargo: "Cargo o dependencia", imagen: "", correo: "", enlace: "" },
        { nombre: "Nombre y apellido", cargo: "Cargo o dependencia", imagen: "", correo: "", enlace: "" },
        { nombre: "Nombre y apellido", cargo: "Cargo o dependencia", imagen: "", correo: "", enlace: "" },
      ],
    }),
  },
  {
    tipo: "testimonios",
    nombre: "Testimonios",
    ayuda: "Citas de varias personas con su cargo y foto opcional, en cuadrícula o en un carrusel sencillo con flechas y puntos",
    grupo: "Personas y contacto",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      {
        clave: "modo",
        etiqueta: "Presentación",
        tipo: "enum",
        opciones: [
          { valor: "cuadricula", etiqueta: "Cuadrícula" },
          { valor: "carrusel", etiqueta: "Carrusel (uno a la vez)" },
        ],
      },
      {
        clave: "items",
        etiqueta: "Testimonios",
        tipo: "lista",
        subcampos: [
          { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
          { clave: "cargo", etiqueta: "Cargo, programa o año de egreso", tipo: "texto" },
          { clave: "texto", etiqueta: "Testimonio", tipo: "area" },
          CAMPO_IMAGEN("imagen", "Foto (opcional)"),
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      modo: "cuadricula",
      items: [
        { nombre: "Nombre de la persona", cargo: "Egresada, programa y año", texto: "Escriba aquí lo que esta persona cuenta de su experiencia en la universidad.", imagen: "" },
        { nombre: "Nombre de la persona", cargo: "Estudiante, programa y semestre", texto: "Escriba aquí lo que esta persona cuenta de su experiencia en la universidad.", imagen: "" },
        { nombre: "Nombre de la persona", cargo: "Docente, facultad", texto: "Escriba aquí lo que esta persona cuenta de su experiencia en la universidad.", imagen: "" },
      ],
    }),
  },
  {
    tipo: "pestanas",
    nombre: "Pestañas",
    ayuda: "Contenido en pestañas: cada una con su título, texto, imagen y botón. Se recorren con las flechas, Inicio y Fin",
    grupo: "Interactivo",
    movimiento: "sube",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      { clave: "inicial", etiqueta: "Pestaña que se abre primero (1 es la primera)", tipo: "numero", min: 1, max: 12 },
      {
        clave: "items",
        etiqueta: "Pestañas",
        tipo: "lista",
        subcampos: [
          { clave: "pestana", etiqueta: "Nombre de la pestaña", tipo: "texto" },
          { clave: "titulo", etiqueta: "Título del contenido", tipo: "texto" },
          { clave: "texto", etiqueta: "Texto (una línea en blanco abre un párrafo)", tipo: "area" },
          CAMPO_IMAGEN("imagen", "Imagen (opcional)"),
          { clave: "alt", etiqueta: "Descripción de la imagen para lectores de pantalla", tipo: "texto" },
          { clave: "boton", etiqueta: "Texto del botón (vacío: sin botón)", tipo: "texto" },
          campoDestino("destino", "Destino del botón (/ruta o https://…)"),
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      inicial: 1,
      items: [
        { pestana: "Pregrado", titulo: "Programas de pregrado", texto: "Escriba aquí qué ofrece la universidad en pregrado.", imagen: "", alt: "", boton: "", destino: "" },
        { pestana: "Posgrado", titulo: "Programas de posgrado", texto: "Escriba aquí qué ofrece la universidad en posgrado.", imagen: "", alt: "", boton: "", destino: "" },
        { pestana: "Educación continua", titulo: "Cursos y diplomados", texto: "Escriba aquí qué ofrece la universidad en educación continua.", imagen: "", alt: "", boton: "", destino: "" },
      ],
    }),
  },
  {
    tipo: "banner",
    nombre: "Banner",
    ayuda: "Franja de ancho completo con imagen de fondo, velo oscuro que asegura el contraste del texto, título, texto y hasta dos botones",
    grupo: "Multimedia",
    movimiento: "sube",
    sinFondo: true,
    campos: [
      CAMPO_IMAGEN("imagen", "Imagen de fondo"),
      { clave: "titulo", etiqueta: "Título", tipo: "texto", requerido: true },
      { clave: "texto", etiqueta: "Texto", tipo: "area" },
      { clave: "boton1", etiqueta: "Botón principal", tipo: "texto" },
      campoDestino("destino1", "Destino del botón principal (/ruta o https://…)"),
      { clave: "boton2", etiqueta: "Botón secundario", tipo: "texto" },
      campoDestino("destino2", "Destino del botón secundario (/ruta o https://…)"),
      { clave: "velo", etiqueta: "Opacidad del velo oscuro (65 a 90 %; con menos no se garantiza el contraste)", tipo: "numero", min: 65, max: 90 },
      { clave: "altura", etiqueta: "Altura", tipo: "enum", opciones: OPCIONES_ALTO_BANNER },
      {
        clave: "alineacion",
        etiqueta: "Alineación del texto",
        tipo: "enum",
        opciones: [
          { valor: "izquierda", etiqueta: "Izquierda" },
          { valor: "centro", etiqueta: "Centrada" },
          { valor: "derecha", etiqueta: "Derecha" },
        ],
      },
    ],
    valores: () => ({
      imagen: "",
      titulo: "Título del banner",
      texto: "Una frase que invite a conocer más.",
      boton1: "",
      destino1: "",
      boton2: "",
      destino2: "",
      velo: 72,
      altura: "media",
      alineacion: "izquierda",
    }),
  },
  {
    tipo: "contacto-mapa",
    nombre: "Contacto con mapa",
    ayuda: "Dirección, teléfono, correo y horario junto a un mapa de OpenStreetMap. Teléfono y correo se copian con un clic. Sin claves de API",
    grupo: "Personas y contacto",
    movimiento: "sube",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      { clave: "direccion", etiqueta: "Dirección", tipo: "area" },
      { clave: "telefono", etiqueta: "Teléfono", tipo: "texto" },
      { clave: "correo", etiqueta: "Correo", tipo: "texto" },
      { clave: "horario", etiqueta: "Horario de atención", tipo: "area" },
      { clave: "latitud", etiqueta: "Latitud del mapa (p. ej. 7.1397; vacía: sin mapa)", tipo: "texto" },
      { clave: "longitud", etiqueta: "Longitud del mapa (p. ej. -73.1217)", tipo: "texto" },
      { clave: "zoom", etiqueta: "Acercamiento del mapa (10 lejos, 19 cerca)", tipo: "numero", min: 10, max: 19 },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "Dónde encontrarnos",
      texto: "",
      direccion: "Calle 70 No. 55-210\nBucaramanga, Santander",
      telefono: "(607) 651 6500",
      correo: "info@udes.edu.co",
      horario: "Lunes a viernes, de 7:00 a. m. a 12:00 m. y de 2:00 a 6:00 p. m.",
      latitud: "7.1397",
      longitud: "-73.1217",
      zoom: 16,
    }),
  },
  {
    tipo: "columnas-desiguales",
    nombre: "Columnas desiguales",
    ayuda: "Dos o tres columnas con proporciones a elección (70/30, 60/40, 50/25/25…); cada una con título, texto, imagen y botón. En marcos angostos pasan a una sola columna",
    grupo: "Diseño y columnas",
    movimiento: "cascada",
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: undefined })),
      {
        clave: "proporcion",
        etiqueta: "Proporción (define cuántas columnas hay)",
        tipo: "enum",
        opciones: Object.entries(PROPORCIONES_COLUMNAS).map(([valor, d]) => ({ valor, etiqueta: d.etiqueta })),
      },
      {
        clave: "items",
        etiqueta: "Columnas, en orden (las que sobran no se muestran)",
        tipo: "lista",
        subcampos: [
          { clave: "titulo", etiqueta: "Título", tipo: "texto" },
          { clave: "texto", etiqueta: "Texto (una línea en blanco abre un párrafo)", tipo: "area" },
          CAMPO_IMAGEN("imagen", "Imagen (opcional)"),
          { clave: "alt", etiqueta: "Descripción de la imagen para lectores de pantalla", tipo: "texto" },
          { clave: "boton", etiqueta: "Texto del botón (vacío: sin botón)", tipo: "texto" },
          campoDestino("destino", "Destino del botón (/ruta o https://…)"),
        ],
      },
    ],
    valores: () => ({
      antetitulo: "",
      titulo: "",
      texto: "",
      proporcion: "60-40",
      items: [
        { titulo: "Columna principal", texto: "Escriba aquí el contenido principal de la sección.", imagen: "", alt: "", boton: "", destino: "" },
        { titulo: "Columna de apoyo", texto: "Escriba aquí un dato, un contacto o un enlace complementario.", imagen: "", alt: "", boton: "", destino: "" },
      ],
    }),
  },
  {
    tipo: "contenedor",
    nombre: "Columnas con contenido",
    ayuda: "Columnas donde se sueltan y apilan otros bloques (video, cifras, imagen con texto, botones…). Se arrastran desde la biblioteca o desde la página. En marcos angostos las columnas se apilan",
    grupo: "Diseño y columnas",
    // Cada bloque de adentro trae su propia entrada: el contenedor no anima encima de ellos.
    movimiento: "ninguna",
    // Los bloques anidados (`items`) no son un campo del formulario: se arman en el lienzo y viajan dentro de las props (ver contenedorDe en logica.ts).
    campos: [
      {
        clave: "columnas",
        etiqueta: "Columnas",
        tipo: "enum",
        opciones: [1, 2, 3, 4, 6].map((n) => ({ valor: String(n), etiqueta: n === 1 ? "Una columna" : `${n} columnas` })),
      },
      {
        clave: "proporcion",
        etiqueta: "Proporción (con 2 o 3 columnas)",
        tipo: "enum",
        opciones: [{ valor: "iguales", etiqueta: "Columnas iguales" }, ...Object.entries(PROPORCIONES_COLUMNAS).map(([valor, d]) => ({ valor, etiqueta: d.etiqueta }))],
      },
      {
        clave: "separacion",
        etiqueta: "Separación entre columnas",
        tipo: "enum",
        opciones: [
          { valor: "chica", etiqueta: "Chica" },
          { valor: "media", etiqueta: "Media" },
          { valor: "grande", etiqueta: "Grande" },
        ],
      },
      {
        clave: "vertical",
        etiqueta: "Alineación vertical",
        tipo: "enum",
        opciones: [
          { valor: "inicio", etiqueta: "Arriba" },
          { valor: "centro", etiqueta: "Al centro" },
          { valor: "fin", etiqueta: "Abajo" },
          { valor: "estirar", etiqueta: "Estirar" },
        ],
      },
    ],
    valores: () => ({ columnas: "2", proporcion: "iguales", separacion: "media", vertical: "inicio" }),
  },
  /* --- Vivos: datos reales o interactivos del portal ----------------------------------- */
  {
    tipo: "indicadores",
    nombre: "Indicadores en vivo",
    ayuda: "Tablero de indicadores por campus y año. El encabezado sí se edita",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: CAMPOS_ENCABEZADO,
    valores: () => ({
      antetitulo: "Indicadores de sostenibilidad",
      titulo: "Lo que medimos en los campus, en vivo.",
      texto: "",
    }),
  },
  {
    tipo: "graficas-sostenibles",
    nombre: "Gráficas de sostenibilidad",
    ayuda: "Las gráficas publicadas desde Datos de Sostenibilidad. Elija una sección del Observatorio o deje todas",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: false })),
      {
        clave: "seccion",
        etiqueta: "Sección del Observatorio (opcional)",
        tipo: "enum",
        opciones: [
          { valor: "", etiqueta: "Todas las secciones" },
          { valor: "panorama", etiqueta: "Panorama" },
          { valor: "tendencia", etiqueta: "Tendencia" },
          { valor: "composicion", etiqueta: "Composición" },
          { valor: "territorio", etiqueta: "Territorio" },
          { valor: "detalle", etiqueta: "Detalle" },
        ],
      },
    ],
    valores: () => ({ antetitulo: "Datos abiertos", titulo: "Las gráficas de los campus", texto: "", seccion: "" }),
  },
  {
    tipo: "indicadores-sostenibilidad",
    nombre: "Indicadores elegidos",
    ayuda: "Los indicadores publicados del catálogo de Datos de Sostenibilidad que usted elija, en su orden, con campus fijo o selector",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: false })),
      { clave: "indicadores", etiqueta: "Indicadores publicados", tipo: "referencia", fuente: "indicadores", multiple: true },
      {
        clave: "campus",
        etiqueta: "Campus",
        tipo: "enum",
        opciones: [{ valor: "selector", etiqueta: "Selector de campus visible" }, ...CAMPUSES.map((c) => ({ valor: c, etiqueta: c === "Todos" ? "Fijo: todos los campus" : `Fijo: ${c}` }))],
      },
      {
        clave: "estilo",
        etiqueta: "Estilo de tarjeta",
        tipo: "enum",
        opciones: [
          { valor: "tarjeta", etiqueta: "Tarjeta" },
          { valor: "compacta", etiqueta: "Compacta" },
          { valor: "lista", etiqueta: "Lista" },
        ],
      },
      { clave: "meta", etiqueta: "Mostrar la meta", tipo: "bool" },
      { clave: "tendencia", etiqueta: "Mostrar la tendencia", tipo: "bool" },
      { clave: "fuente", etiqueta: "Mostrar la fuente", tipo: "bool" },
    ],
    valores: () => ({ antetitulo: "Indicadores de sostenibilidad", titulo: "", texto: "", indicadores: [], campus: "selector", estilo: "tarjeta", meta: false, tendencia: true, fuente: true }),
  },
  {
    tipo: "tablero-sostenibilidad",
    nombre: "Tablero de sostenibilidad",
    ayuda: "Un tablero publicado desde Datos de Sostenibilidad, incrustado, con su selector de campus si lo tiene",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: [
      ...CAMPOS_ENCABEZADO.map((c) => ({ ...c, requerido: false })),
      { clave: "tablero", etiqueta: "Tablero publicado", tipo: "referencia", fuente: "tableros" },
    ],
    valores: () => ({ antetitulo: "", titulo: "", texto: "", tablero: "" }),
  },
  {
    tipo: "avance-plan",
    nombre: "Avance del plan",
    ayuda: "Anillo con el avance global del PDI y sus cifras de seguimiento",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  {
    tipo: "pilares-plan",
    nombre: "Pilares del plan",
    ayuda: "Tarjetas de los pilares estratégicos con su avance real",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  {
    tipo: "sdg-band",
    nombre: "El plan y los ODS",
    ayuda: "Los 17 ODS con su aporte, deducido de los proyectos publicados",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  {
    tipo: "campus-explorer",
    nombre: "Regionalización",
    ayuda: "Pestañas por sede con su vocación y la respuesta de la UDES",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  {
    tipo: "route-finder",
    nombre: "Encuentra tu ruta",
    ayuda: "Dos preguntas que arman una respuesta con pilares y ODS",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  {
    tipo: "galeria-oficina",
    nombre: "Galería de la oficina",
    ayuda: "Fotografías que sube Planeación en la intranet, con su título y su pie. Sin fotos no se dibuja",
    grupo: "Planeación",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  {
    tipo: "recientes",
    nombre: "Lo más reciente",
    ayuda: "Últimas cifras, boletines, temas del Observatorio y corte del PDI, con su fecha",
    grupo: "Planeación",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  {
    tipo: "equipo-oficina",
    nombre: "Equipo de la oficina",
    ayuda: "Carril con las personas del equipo; cada una abre su ficha. Se edita en la intranet",
    grupo: "Planeación",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  {
    tipo: "resource-room",
    nombre: "Sala de recursos",
    ayuda: "Los primeros documentos públicos del plan, tomados de la base",
    grupo: "Datos en vivo",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  /* --- Micrositios de ranking: el micrositio de cada ranking y de cada subcategoría --------- */
  {
    tipo: "ranking-resultados",
    nombre: "Resultados del ranking",
    ayuda: "Informe individual de la UDES: medallas, tabla, evolución y PDF por edición",
    grupo: "Micrositios de ranking",
    movimiento: "sube",
    vivo: true,
    campos: [CAMPO_RANKING],
    valores: () => ({ ranking: "impact" }),
  },
  {
    tipo: "ranking-categorias",
    nombre: "Subcategorías del ranking",
    ayuda: "Tarjetas con el puntaje de cada subcategoría; cada una enlaza a su microportal",
    grupo: "Micrositios de ranking",
    movimiento: "sube",
    vivo: true,
    campos: [CAMPO_RANKING],
    valores: () => ({ ranking: "impact" }),
  },
  {
    tipo: "ranking-indicadores",
    nombre: "Indicadores del ranking",
    ayuda: "Tablero de los indicadores que mueven el ranking",
    grupo: "Micrositios de ranking",
    movimiento: "sube",
    vivo: true,
    campos: [CAMPO_RANKING],
    valores: () => ({ ranking: "impact" }),
  },
  {
    tipo: "ranking-ods",
    nombre: "Informes por ODS (THE Impact)",
    ayuda: "Entrada a los 17 informes por ODS y a la presentación rectoral. Solo existe en THE Impact",
    grupo: "Micrositios de ranking",
    movimiento: "sube",
    vivo: true,
    campos: [],
    valores: sinCampos,
  },
  {
    tipo: "categoria-puntaje",
    nombre: "Puntaje de la subcategoría",
    ayuda: "Anillo con el puntaje, evolución por edición y PDF de la subcategoría",
    grupo: "Micrositios de ranking",
    movimiento: "sube",
    vivo: true,
    campos: [CAMPO_CATEGORIA],
    valores: () => ({ categoria: "impact/o4" }),
  },
  {
    tipo: "categoria-indicadores",
    nombre: "Indicadores de la subcategoría",
    ayuda: "Tablero de los indicadores UDES que explican el puntaje",
    grupo: "Micrositios de ranking",
    movimiento: "sube",
    vivo: true,
    campos: [CAMPO_CATEGORIA],
    valores: () => ({ categoria: "impact/o4" }),
  },
  {
    tipo: "categoria-iniciativas",
    nombre: "Iniciativas de la subcategoría",
    ayuda: "Lista de iniciativas ligadas a la subcategoría y enlaces a las vecinas del ranking",
    grupo: "Micrositios de ranking",
    movimiento: "sube",
    vivo: true,
    campos: [CAMPO_CATEGORIA],
    valores: () => ({ categoria: "impact/o4" }),
  },
];

export function definicion(tipo: string): DefinicionBloque | undefined {
  return BLOQUES.find((b) => b.tipo === tipo);
}

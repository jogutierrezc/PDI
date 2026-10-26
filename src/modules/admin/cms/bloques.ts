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

import { AXES, LAST, RANKINGS, YEARS, reports } from "../../sostenible/data";
import { contextFacts, leapDimensions } from "../../landing/content";
import { DEFAULT_PAGE } from "../../planeacion/page";
import type { Fondo, PresetMovimiento, Props } from "./tipos";

export type GrupoBloque = "Portada y estructura" | "Contenido básico" | "Landing" | "Planeación" | "UDES Sostenible" | "Micrositios de ranking" | "Datos en vivo";

/** Los grupos del selector «Agregar bloque». Cada uno reúne tipos del mismo uso. */
export const GRUPOS: readonly GrupoBloque[] = ["Portada y estructura", "Contenido básico", "Landing", "Planeación", "UDES Sostenible", "Micrositios de ranking", "Datos en vivo"];

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

export type TipoCampo = "texto" | "area" | "imagen" | "bool" | "enum" | "numero" | "lista";

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
    ayuda: "Imágenes que pasan una a una, con título, texto y enlace opcionales",
    grupo: "Contenido básico",
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
    grupo: "Contenido básico",
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
    ayuda: "Un video de YouTube o Vimeo incrustado: se pega el enlace tal como sale en el navegador",
    grupo: "Contenido básico",
    movimiento: "sube",
    campos: [
      { clave: "url", etiqueta: "Enlace del video (YouTube o Vimeo)", tipo: "texto", requerido: true },
      { clave: "titulo", etiqueta: "Título del video (para lectores de pantalla)", tipo: "texto" },
      { clave: "pie", etiqueta: "Pie del video", tipo: "texto" },
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
    valores: () => ({ url: "", titulo: "", pie: "", proporcion: "16/9" }),
  },
  {
    tipo: "acordeon",
    nombre: "Acordeón",
    ayuda: "Secciones que se abren y se cierran; cada una con su título y su texto",
    grupo: "Contenido básico",
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
    grupo: "Contenido básico",
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

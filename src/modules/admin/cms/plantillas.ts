/* =============================================================================
   CMS Portales · plantillas de las portadas actuales.

   El contenido de hoy de cada portada, como bloques editables. Los textos son
   los de las páginas reales (SostenibleHome.tsx, PlaneacionHome.tsx y
   routes/Home.tsx), en su mismo orden. Cargar una plantilla solo llena el
   borrador local: nada llega a la base hasta que el usuario guarda.

   Los valores salen de `definicion(tipo).valores()` y aquí se sobrescribe lo
   que cambia. Los ids no se generan aquí: los pone el editor al cargar.

   Lo que la plantilla no puede representar (fotos del héroe de la landing,
   tesela con vídeo, citas sueltas) está en el informe de la entrega, no aquí.
   ========================================================================== */

import { definicion } from "./bloques";
import { DEFAULT_PAGE } from "../../planeacion/page";
import { RANKINGS } from "../../sostenible/data";
import { ODS_CURRENT } from "../../sostenible/ods-data";
import type { Ancho, PortalSlug, Props } from "./tipos";

/** Un bloque de la plantilla, antes de tener id. */
export interface LineaNueva {
  tipo: string;
  ancho: Ancho;
  props: Props;
}

/**
 * Una página de micrositio: `padre` es el slug de otra página de la misma lista
 * (debe ir antes), o null si cuelga de la portada del portal.
 */
export interface NodoMicrositio {
  slug: string;
  titulo: string;
  padre: string | null;
  bloques: LineaNueva[];
}

/** Un bloque a ancho completo con sus valores de partida y las sobrescrituras dadas. */
function bloque(tipo: string, sobre: Props = {}): LineaNueva {
  const def = definicion(tipo);
  if (!def) throw new Error(`La plantilla usa un tipo que no está en el registro: ${tipo}`);
  return { tipo, ancho: 12, props: { ...def.valores(), ...sobre } };
}

/** Apariencia de sección alterna: el fondo de las secciones pares de Sostenible. */
const estiloAlterno = (): Props => ({ _estilo: { fondo: "alterno", espacio: "normal" } });

/** UDES Sostenible: héroe con rueda, cinta de ODS, rankings, indicadores, frentes e informes. */
function sostenible(): LineaNueva[] {
  return [
    bloque("hero", {
      antetitulo: "UDES Sostenible · UDES Verde",
      titulo: "Una universidad que se mide contra el mundo y cuida su territorio.",
      enfasis: "mundo",
      texto: "Los resultados de la UDES en los rankings de sostenibilidad y el trabajo diario por el campus, la comunidad y los Objetivos de Desarrollo Sostenible.",
      boton1: "Ver los rankings",
      destino1: "/sostenible/impact",
      boton2: "Indicadores en vivo",
      destino2: "/sostenible#indicadores",
      imagen: "ladera",
      tono: "oscuro",
      rueda: true,
    }),
    bloque("ods"),
    bloque("rankings"),
    bloque("indicadores", {
      antetitulo: "Indicadores de sostenibilidad",
      titulo: "Lo que medimos en los campus, en vivo.",
      texto: "Elige un campus y un año: las cifras, las barras y las tendencias se recalculan al instante.",
      ...estiloAlterno(),
    }),
    bloque("frentes"),
    bloque("informes", estiloAlterno()),
  ];
}

/** Planeación: héroe con buscador, mosaico de portales, galería, recientes, equipo y cierre. */
function planeacion(): LineaNueva[] {
  return [
    bloque("hero", {
      antetitulo: "",
      titulo: DEFAULT_PAGE.home.title,
      enfasis: "",
      texto: DEFAULT_PAGE.home.lede,
      boton1: "",
      destino1: "",
      boton2: "",
      destino2: "",
      imagen: "ninguna",
      tono: "claro",
      rueda: false,
      buscador: true,
    }),
    bloque("mosaico"),
    bloque("galeria-oficina"),
    bloque("recientes"),
    bloque("equipo-oficina"),
    bloque("cierre"),
  ];
}

/** Landing (/pdi): héroe, avance, barra de contexto, el salto, pilares, ODS, sedes, ruta y recursos. */
function landing(): LineaNueva[] {
  return [
    bloque("hero", {
      antetitulo: "Plan de Desarrollo Institucional",
      titulo: "PDI 2024-2028: Aquí construimos futuro",
      enfasis: "",
      texto: "Nuestra hoja de ruta hacia la excelencia académica y el compromiso social. Un esfuerzo colectivo para transformar nuestra región.",
      boton1: "Explorar el plan",
      destino1: "/implementacion",
      boton2: "Ver el tablero",
      destino2: "/tablero",
      imagen: "ninguna",
      tono: "oscuro",
      rueda: false,
    }),
    bloque("avance-plan"),
    bloque("ticker"),
    bloque("salto"),
    bloque("pilares-plan"),
    bloque("sdg-band"),
    bloque("campus-explorer"),
    bloque("route-finder"),
    bloque("resource-room"),
    bloque("cta", {
      texto: "Consulta cómo avanzamos",
      boton: "Ir al tablero PDI",
      destino: "/tablero",
    }),
    bloque("cierre", {
      titulo: "Profundiza en nuestra visión",
      texto: "Conoce los detalles, indicadores y metas que guían nuestro trabajo diario hacia una universidad de excelencia.",
      enlace: "Ver implementación",
      destinoEnlace: "/implementacion",
      accesos: [],
    }),
  ];
}

/**
 * Los micrositios de UDES Sostenible: uno por ranking (ruta = id, p. ej. «impact»),
 * uno por subcategoría (ruta «ranking/categoria», como la app) y la página de
 * los informes por ODS. Los textos son los de SostenibleRanking.tsx y
 * SostenibleCategory; en la app el padre de cada subcategoría es su ranking.
 * Los otros portales no tienen micrositios.
 */
export function plantillaMicrositios(portal: PortalSlug): NodoMicrositio[] {
  if (portal !== "sostenible") return [];
  const nodos: NodoMicrositio[] = [];
  for (const r of RANKINGS) {
    nodos.push({
      slug: r.id,
      titulo: r.name,
      padre: null,
      bloques: [
        // Mismo texto que el encabezado de SostenibleRanking: «Micrositio · editor», el nombre y «about».
        bloque("hero", { antetitulo: `Micrositio · ${r.publisher}`, titulo: r.name, texto: r.about }),
        bloque("ranking-resultados", { ranking: r.id }),
        bloque("ranking-categorias", { ranking: r.id }),
        bloque("ranking-indicadores", { ranking: r.id }),
        ...(r.id === "impact" ? [bloque("ranking-ods")] : []),
      ],
    });
    for (const c of r.categories) {
      const valor = `${r.id}/${c.id}`;
      nodos.push({
        slug: c.id,
        titulo: c.name,
        padre: r.id,
        bloques: [
          // Igual que SostenibleCategory: «ODS n: nombre», el nombre en inglés y el peso del ranking.
          bloque("hero", {
            antetitulo: `Microportal · ${r.short}`,
            titulo: c.sdg ? `ODS ${c.sdg}: ${c.name}` : c.name,
            texto: `${c.en ? `${c.en} · ` : ""}${c.weight ? `Pesa ${c.weight}% del puntaje de ${r.short}. ` : ""}Así va la UDES en esta subcategoría y qué indicadores propios la explican.`,
          }),
          bloque("categoria-puntaje", { categoria: valor }),
          bloque("categoria-indicadores", { categoria: valor }),
          bloque("categoria-iniciativas", { categoria: valor }),
        ],
      });
    }
  }
  nodos.push({
    slug: "informes",
    titulo: "Informes por ODS",
    padre: "impact",
    bloques: [
      // Título y bajada de OdsPortal (i18n de sostenible, en español y con la edición actual).
      bloque("hero", {
        antetitulo: "Informes por ODS",
        titulo: "17 objetivos, una sola UDES.",
        texto: `Los informes con los que la Universidad de Santander rinde cuentas de su aporte a los Objetivos de Desarrollo Sostenible en THE Impact Rankings ${ODS_CURRENT}: uno por objetivo, cada uno con sus cifras y sus evidencias.`,
      }),
      bloque("texto", {
        texto:
          "Los informes por ODS, la presentación del Rector y las páginas de evidencia siguen abriéndose desde el portal actual de UDES Sostenible.\nEsta página del CMS todavía no reemplaza esa ruta: hasta que se conecte, /sostenible/impact/informes sigue siendo el portal de siempre.",
      }),
      bloque("cta", {
        texto: "Los informes por ODS están en el portal actual.",
        boton: "Abrir el portal de informes por ODS",
        destino: "/sostenible/impact/informes",
      }),
    ],
  });
  return nodos;
}

/** Los bloques de la portada de un portal, en el orden en que hoy se ven. */
export function plantillaPortada(portal: PortalSlug): LineaNueva[] {
  switch (portal) {
    case "sostenible":
      return sostenible();
    case "planeacion":
      return planeacion();
    case "landing":
      return landing();
  }
}

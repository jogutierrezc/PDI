/* =============================================================================
   Portales públicos · el registro de vínculos del menú.

   Cada vínculo público que se puede ocultar, renombrar o redirigir tiene una
   CLAVE estable. El código del sitio la usa al pintar el vínculo (EnlaceMenu o
   useMenuPublico().aplicar) y la pantalla de administración la usa para
   listarlo. Si se cambia una clave aquí, hay que cambiarla donde se pinta.

   Cómo se nombran:
     menu.nav.*       barra superior (y su cajón en el celular)
     menu.movil.*     enlaces que solo existen en el cajón del celular
     menu.pdi.* / menu.cifras.* / menu.obs.*   menú ampliado de cada portal
     pie.*            pie de página, en todos los portales
     portada.*        mosaicos de la portada de Planeación
     pdi.barra.*      barra «Ver el plan en» del PDI
     sostenible.*     barra propia de UDES Sostenible
     impacto.*        barra y pie del Portal de Impacto
   El buscador (Ctrl + K) usa las mismas claves: ocultar un vínculo lo quita de
   los resultados, y cambiar la etiqueta o el destino también cambia su entrada.

   NO están aquí, a propósito: el ingreso a la intranet, «Panel», el menú de la
   sesión y «Reportar en la intranet». Quien administra no debe poder
   cerrarse la puerta.
   ========================================================================== */

import { useMemo } from "react";
import { usePillars } from "../../../data/queries";
import { useOpenDataCatalog } from "../../datos-abiertos/data/open-data";
import { OBS_TOPICS } from "../../datos-abiertos/observatorio/data";
import { RANKINGS } from "../../sostenible/data";

export interface Vinculo {
  clave: string;
  /** El portal al que pertenece (slug de pub_portales). */
  portal: string;
  /** Dónde se ve, dentro del portal. */
  donde: string;
  /** La etiqueta que trae el código. */
  etiqueta: string;
  /** El destino que trae el código; `null` si el vínculo abre un menú en vez de llevar a una página. */
  destino: string | null;
}

const BARRA = "Barra superior (se ve en todos los portales)";
const CAJON = "Cajón del menú en el celular";
const PIE = "Pie de página (se ve en todos los portales)";
const PORTADA = "Mosaicos de la portada";

const v = (clave: string, portal: string, donde: string, etiqueta: string, destino: string | null): Vinculo => ({ clave, portal, donde, etiqueta, destino });

export const VINCULOS_FIJOS: Vinculo[] = [
  v("menu.nav.oficina", "planeacion", BARRA, "La oficina", "/equipo"),
  v("menu.nav.pdi", "planeacion", BARRA, "Plan de Desarrollo", null),
  v("menu.nav.cifras", "planeacion", BARRA, "UDES en Cifras", null),
  v("menu.nav.observatorio", "planeacion", BARRA, "Observatorio", null),
  v("menu.nav.sostenible", "planeacion", BARRA, "UDES Sostenible", "/sostenible"),
  v("menu.nav.boletines", "planeacion", BARRA, "Boletines", "/datos-abiertos/boletines"),
  v("menu.nav.documentos", "planeacion", BARRA, "Documentos", "/documentos"),
  v("menu.nav.oferta", "planeacion", BARRA, "Oferta (solo con sesión)", "/oferta"),
  v("menu.movil.inicio", "planeacion", CAJON, "Inicio · Planeación Institucional", "/"),
  v("menu.movil.oferta", "planeacion", CAJON, "Oferta de programas (solo con sesión)", "/oferta"),

  v("pie.pdi", "planeacion", PIE, "Plan de Desarrollo", "/pdi"),
  v("pie.cifras", "planeacion", PIE, "UDES en Cifras", "/datos-abiertos"),
  v("pie.observatorio", "planeacion", PIE, "Observatorio", "/datos-abiertos/observatorio"),
  v("pie.sostenible", "planeacion", PIE, "UDES Sostenible", "/sostenible"),
  v("pie.boletines", "planeacion", PIE, "Boletines", "/datos-abiertos/boletines"),
  v("pie.rutas", "planeacion", PIE, "Rutas de transporte", "/rutas"),
  v("pie.equipo", "planeacion", PIE, "Nuestro equipo", "/equipo"),
  v("pie.documentos", "planeacion", PIE, "Documentos", "/documentos"),
  v("pie.pilo", "planeacion", PIE, "Pregúntele a Pilo", "/pregunta"),
  v("pie.desarrollo", "planeacion", PIE, "Desarrollo tecnológico", "/desarrollo-tecnologico"),

  v("portada.cifras", "planeacion", PORTADA, "UDES en Cifras", "/datos-abiertos"),
  v("portada.pdi", "planeacion", PORTADA, "Portal PDI", "/pdi"),
  v("portada.boletines", "planeacion", PORTADA, "Boletines", "/datos-abiertos/boletines"),
  v("portada.equipo", "planeacion", PORTADA, "Nuestro equipo", "/equipo"),
  v("portada.observatorio", "planeacion", PORTADA, "Observatorio de Analítica", "/datos-abiertos/observatorio"),
  v("portada.oficina", "planeacion", "Cierre de la portada", "Conocer la oficina", "/equipo"),

  v("menu.pdi.todo", "pdi", "Menú ampliado · Plan de Desarrollo", "Ir al Portal PDI", "/pdi"),
  v("menu.pdi.inicio", "pdi", "Menú ampliado · Plan de Desarrollo", "Inicio del PDI", "/pdi"),
  v("menu.pdi.implementacion", "pdi", "Menú ampliado · Plan de Desarrollo", "Implementación", "/implementacion"),
  v("menu.pdi.tablero", "pdi", "Menú ampliado · Plan de Desarrollo", "Tablero PDI", "/tablero"),
  v("menu.pdi.facultades", "pdi", "Menú ampliado · Plan de Desarrollo", "PDI por facultad", "/facultades"),
  v("menu.pdi.campus", "pdi", "Menú ampliado · Plan de Desarrollo", "PDI por campus", "/campus"),
  v("menu.pdi.ods", "pdi", "Menú ampliado · Plan de Desarrollo", "PDI y los ODS", "/ods"),
  v("menu.pdi.desarrollo", "pdi", "Menú ampliado · Plan de Desarrollo", "Desarrollo tecnológico", "/desarrollo-tecnologico"),
  v("pdi.barra.implementacion", "pdi", "Barra «Ver el plan en»", "Implementación", "/implementacion"),
  v("pdi.barra.tablero", "pdi", "Barra «Ver el plan en»", "Tablero", "/tablero"),
  v("pdi.barra.facultades", "pdi", "Barra «Ver el plan en»", "Por facultad", "/facultades"),
  v("pdi.barra.campus", "pdi", "Barra «Ver el plan en»", "Por campus", "/campus"),

  v("menu.cifras.todo", "cifras", "Menú ampliado · UDES en Cifras", "Ver el tablero de informes", "/datos-abiertos"),
  v("menu.obs.todo", "observatorio", "Menú ampliado · Observatorio", "Ver las 14 páginas", "/datos-abiertos/observatorio"),

  v("sostenible.inicio", "sostenible", "Barra del portal", "Inicio", "/sostenible"),
  v("sostenible.indicadores", "sostenible", "Barra del portal", "Indicadores", "/sostenible#indicadores"),
  v("sostenible.informes", "sostenible", "Barra del portal", "Informes", "/sostenible#informes"),

  v("impacto.vistas.institucional", "impacto", "Barra del portal", "Institucional", "/impacto"),
  v("impacto.vistas.vicerrectorias", "impacto", "Barra del portal", "Vicerrectorías", "/impacto/vicerrectoria/investigacion"),
  v("impacto.vistas.facultades", "impacto", "Barra del portal", "Facultades", "/impacto/facultades"),
  v("impacto.vistas.programas", "impacto", "Barra del portal", "Programas", "/impacto/programas"),
  v("impacto.pie.cifras", "impacto", "Pie del portal", "UDES en Cifras", "/datos-abiertos"),
];

/** Los vínculos que salen de datos y no del código: pilares, informes de cifras. Se listan en cuanto cargan. */
export function useVinculos(): { vinculos: Vinculo[]; cargando: boolean } {
  const pilares = usePillars();
  const catalogo = useOpenDataCatalog();
  const vinculos = useMemo(() => {
    const dinamicos: Vinculo[] = [
      ...(pilares.data ?? []).map((p) => v(`menu.pdi.pilar.${p.slug}`, "pdi", "Menú ampliado · Pilares", p.name, `/implementacion/pilar/${p.slug}`)),
      ...(catalogo.data?.reports ?? []).map((r) => v(`menu.cifras.${r.slug}`, "cifras", "Menú ampliado · Informes", r.name, `/datos-abiertos/${r.slug}`)),
      ...OBS_TOPICS.map((t) => v(`menu.obs.${t.slug}`, "observatorio", "Menú ampliado · Temas", t.name, `/datos-abiertos/observatorio/${t.slug}`)),
      ...RANKINGS.map((r) => v(`sostenible.ranking.${r.id}`, "sostenible", "Barra del portal", r.short, `/sostenible/${r.id}`)),
    ];
    return [...VINCULOS_FIJOS, ...dinamicos];
  }, [pilares.data, catalogo.data]);
  return { vinculos, cargando: pilares.isPending || catalogo.isPending };
}

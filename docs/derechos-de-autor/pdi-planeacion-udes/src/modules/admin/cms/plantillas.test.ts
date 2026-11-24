/* =============================================================================
   CMS Portales · pruebas de las plantillas de portada.

   Cada plantilla usa solo tipos del registro, llena sus campos requeridos, no
   repite un bloque vivo y sus destinos pasan destinoSeguro. El orden de
   UDES Sostenible se fija aquí porque es el que se ve en la página real.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import { definicion } from "./bloques";
import { DEFAULT_PAGE } from "../../planeacion/page";
import { destinoSeguro, rutaHija } from "./logica";
import { plantillaMicrositios, plantillaPortada, type LineaNueva, type NodoMicrositio } from "./plantillas";
import { RANKINGS } from "../../sostenible/data";
import type { PortalSlug, Props } from "./tipos";

const PORTALES: PortalSlug[] = ["sostenible", "planeacion", "landing"];

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Los campos de un bloque que son destinos de enlace (su etiqueta empieza por «Destino»). */
function destinosDe(linea: LineaNueva): { ruta: string; valor: unknown }[] {
  const def = definicion(linea.tipo);
  const out: { ruta: string; valor: unknown }[] = [];
  for (const campo of def?.campos ?? []) {
    if (campo.tipo === "lista") {
      const filas = Array.isArray(linea.props[campo.clave]) ? (linea.props[campo.clave] as Props[]) : [];
      filas.forEach((fila, i) => {
        for (const sub of campo.subcampos ?? []) {
          if (sub.etiqueta.startsWith("Destino")) out.push({ ruta: `${linea.tipo}.${campo.clave}[${i}].${sub.clave}`, valor: fila[sub.clave] });
        }
      });
    } else if (campo.etiqueta.startsWith("Destino")) {
      out.push({ ruta: `${linea.tipo}.${campo.clave}`, valor: linea.props[campo.clave] });
    }
  }
  return out;
}

describe.each(PORTALES)("plantilla de «%s»", (portal) => {
  const lineas = plantillaPortada(portal);

  it("solo usa tipos del registro, a ancho completo", () => {
    for (const l of lineas) {
      expect(definicion(l.tipo), l.tipo).toBeDefined();
      expect(l.ancho).toBe(12);
    }
  });

  it("llena todos los campos requeridos de cada bloque", () => {
    const faltan: string[] = [];
    for (const l of lineas) {
      const def = definicion(l.tipo);
      for (const campo of def?.campos ?? []) {
        if (campo.requerido && vacio(l.props[campo.clave])) faltan.push(`${l.tipo}.${campo.clave}`);
      }
    }
    expect(faltan).toEqual([]);
  });

  it("ningún bloque vivo aparece dos veces (sus ids de DOM son fijos)", () => {
    const vivos = lineas.map((l) => l.tipo).filter((t) => definicion(t)?.vivo);
    expect(new Set(vivos).size).toBe(vivos.length);
  });

  it("todos los destinos pasan destinoSeguro", () => {
    const malos: string[] = [];
    for (const l of lineas) {
      for (const d of destinosDe(l)) {
        if (!vacio(d.valor) && destinoSeguro(d.valor) === null) malos.push(`${d.ruta} = ${String(d.valor)}`);
      }
    }
    expect(malos).toEqual([]);
  });

  it("no lleva ids: los pone el editor al cargar", () => {
    for (const l of lineas) expect(Object.keys(l)).not.toContain("id");
  });
});

describe("orden y contenido", () => {
  it("UDES Sostenible: hero, ods, rankings, indicadores, frentes, informes", () => {
    expect(plantillaPortada("sostenible").map((l) => l.tipo)).toEqual(["hero", "ods", "rankings", "indicadores", "frentes", "informes"]);
  });

  it("Sostenible: el héroe trae su rueda, sus botones reales y la ladera", () => {
    const hero = plantillaPortada("sostenible")[0]!.props;
    expect(hero.rueda).toBe(true);
    expect(hero.imagen).toBe("ladera");
    expect(hero.boton1).toBe("Ver los rankings");
    expect(hero.destino1).toBe("/sostenible/impact");
    expect(hero.boton2).toBe("Indicadores en vivo");
    expect(hero.destino2).toBe("/sostenible#indicadores");
  });

  it("Sostenible: el encabezado de indicadores es el de la página real", () => {
    const ind = plantillaPortada("sostenible")[3]!.props;
    expect(ind.antetitulo).toBe("Indicadores de sostenibilidad");
    expect(ind.titulo).toBe("Lo que medimos en los campus, en vivo.");
  });

  it("Planeación: hero claro con el buscador, mosaico, galería, recientes, equipo y cierre", () => {
    const lineas = plantillaPortada("planeacion");
    expect(lineas.map((l) => l.tipo)).toEqual(["hero", "mosaico", "galeria-oficina", "recientes", "equipo-oficina", "cierre"]);
    expect(lineas[0]!.props.tono).toBe("claro");
    expect(lineas[0]!.props.buscador).toBe(true);
    expect(lineas[0]!.props.titulo).toBe(DEFAULT_PAGE.home.title);
    expect(lineas[0]!.props.texto).toBe(DEFAULT_PAGE.home.lede);
  });

  it("Landing: el orden de Home.tsx de arriba abajo", () => {
    expect(plantillaPortada("landing").map((l) => l.tipo)).toEqual([
      "hero",
      "avance-plan",
      "ticker",
      "salto",
      "pilares-plan",
      "sdg-band",
      "campus-explorer",
      "route-finder",
      "resource-room",
      "cta",
      "cierre",
    ]);
  });

  it("Landing: la banda de cierre enlaza al tablero y el cierre a la implementación", () => {
    const lineas = plantillaPortada("landing");
    expect(lineas.find((l) => l.tipo === "cta")?.props.destino).toBe("/tablero");
    expect(lineas.find((l) => l.tipo === "cierre")?.props.destinoEnlace).toBe("/implementacion");
  });
});

describe("fidelidad con las portadas reales", () => {
  it("Planeación: el mosaico solo lleva título y bajada; las teselas son las reales", () => {
    const mosaico = plantillaPortada("planeacion").find((l) => l.tipo === "mosaico")!;
    expect(Object.keys(mosaico.props).sort()).toEqual(["texto", "titulo"]);
    expect(mosaico.props.titulo).toBe(DEFAULT_PAGE.home.portalsTitle);
    expect(mosaico.props.texto).toBe(DEFAULT_PAGE.home.portalsLede);
  });

  it("Planeación: el cierre usa la frase, el propósito y los accesos publicados de la oficina", () => {
    const cierre = plantillaPortada("planeacion").find((l) => l.tipo === "cierre")!.props;
    expect(cierre.titulo).toBe(DEFAULT_PAGE.home.closingTitle);
    expect(cierre.texto).toBe(DEFAULT_PAGE.office.purpose);
    expect((cierre.accesos as unknown[]).length).toBe(DEFAULT_PAGE.links.length);
  });

  it("Landing: el héroe lleva los textos y botones de Home.tsx", () => {
    const hero = plantillaPortada("landing")[0]!.props;
    expect(hero.titulo).toBe("PDI 2024-2028: Aquí construimos futuro");
    expect([hero.boton1, hero.destino1, hero.boton2, hero.destino2]).toEqual(["Explorar el plan", "/implementacion", "Ver el tablero", "/tablero"]);
  });

  it("cada carga produce objetos nuevos: dos cargas no comparten props", () => {
    const a = plantillaPortada("sostenible");
    const b = plantillaPortada("sostenible");
    expect(a[0]!.props).not.toBe(b[0]!.props);
  });
});

describe("destinos seguros", () => {
  it("acepta rutas internas con ancla y https", () => {
    expect(destinoSeguro("/sostenible#indicadores")).toBe("/sostenible#indicadores");
    expect(destinoSeguro("/implementacion#repositorio")).toBe("/implementacion#repositorio");
    expect(destinoSeguro("https://udes.edu.co")).toBe("https://udes.edu.co");
  });

  it("rechaza esquemas peligrosos, rutas de protocolo y espacios", () => {
    expect(destinoSeguro("javascript:alert(1)")).toBeNull();
    expect(destinoSeguro("//sitio.externo")).toBeNull();
    expect(destinoSeguro("/con espacio")).toBeNull();
    expect(destinoSeguro("http://udes.edu.co")).toBeNull();
  });
});

describe("plantilla de micrositios de UDES Sostenible", () => {
  const nodos: NodoMicrositio[] = plantillaMicrositios("sostenible");

  /** La ruta de cada nodo, igual que la calcula la importación (padre antes que hijo). */
  function rutas(lista: NodoMicrositio[]): Map<string, string> {
    const porSlug = new Map<string, string>();
    for (const n of lista) {
      const padreRuta = n.padre === null ? "" : porSlug.get(n.padre);
      if (padreRuta === undefined) throw new Error(`«${n.slug}» cuelga de «${n.padre}», que no está antes`);
      porSlug.set(n.slug, rutaHija(padreRuta, n.slug));
    }
    return porSlug;
  }

  it("tiene 3 rankings, 19 subcategorías y la página de informes por ODS", () => {
    expect(nodos.filter((n) => n.padre === null).map((n) => n.slug)).toEqual(["impact", "world", "green"]);
    expect(nodos.filter((n) => n.padre !== null && n.slug !== "informes")).toHaveLength(19);
    expect(nodos.filter((n) => n.slug === "informes")).toHaveLength(1);
    expect(nodos).toHaveLength(23);
  });

  it("los slugs son únicos, las rutas también y ningún padre llega después que su hijo", () => {
    expect(new Set(nodos.map((n) => n.slug)).size).toBe(nodos.length);
    const r = rutas(nodos);
    expect(new Set(r.values()).size).toBe(nodos.length);
  });

  it("cada bloque es de un tipo del registro, a ancho completo y con sus campos requeridos", () => {
    for (const n of nodos) {
      expect(n.titulo.trim(), n.slug).not.toBe("");
      for (const l of n.bloques) {
        const def = definicion(l.tipo);
        expect(def, l.tipo).toBeDefined();
        expect(l.ancho).toBe(12);
        for (const campo of def?.campos ?? []) {
          if (campo.requerido) expect(vacio(l.props[campo.clave]), `${n.slug}: ${l.tipo}.${campo.clave}`).toBe(false);
        }
      }
    }
  });

  it("cada ranking tiene su página en su ruta, con sus secciones y la de ODS solo en THE Impact", () => {
    for (const r of RANKINGS) {
      const nodo = nodos.find((n) => n.slug === r.id && n.padre === null)!;
      expect(nodo, r.id).toBeDefined();
      const tipos = nodo.bloques.map((b) => b.tipo);
      expect(tipos.slice(0, 4)).toEqual(["hero", "ranking-resultados", "ranking-categorias", "ranking-indicadores"]);
      expect(tipos.includes("ranking-ods"), r.id).toBe(r.id === "impact");
      expect(nodo.bloques.every((b) => !("ranking" in b.props) || b.props.ranking === r.id), r.id).toBe(true);
      expect(nodo.bloques[0]!.props.titulo).toBe(r.name);
      expect(nodo.bloques[0]!.props.texto).toBe(r.about);
    }
  });

  it("cada subcategoría tiene su página hija con la ruta que construye la app: /sostenible/<ranking>/<categoria>", () => {
    const r = rutas(nodos);
    for (const rk of RANKINGS) {
      for (const c of rk.categories) {
        const nodo = nodos.find((n) => n.slug === c.id && n.padre === rk.id)!;
        expect(nodo, `${rk.id}/${c.id}`).toBeDefined();
        expect(r.get(c.id), `${rk.id}/${c.id}`).toBe(`${rk.id}/${c.id}`);
        expect(nodo.bloques.map((b) => b.tipo)).toEqual(["hero", "categoria-puntaje", "categoria-indicadores", "categoria-iniciativas"]);
        for (const b of nodo.bloques.slice(1)) expect(b.props.categoria).toBe(`${rk.id}/${c.id}`);
      }
    }
  });

  it("la página de informes por ODS cuelga de impact, y su botón va a la ruta real del portal", () => {
    const informes = nodos.find((n) => n.slug === "informes")!;
    expect(informes.padre).toBe("impact");
    expect(informes.titulo).toBe("Informes por ODS");
    expect(rutas(nodos).get("informes")).toBe("impact/informes");
    const cta = informes.bloques.find((b) => b.tipo === "cta")!;
    expect(cta.props.destino).toBe("/sostenible/impact/informes");
    expect(destinoSeguro(cta.props.destino)).toBe("/sostenible/impact/informes");
    expect(cta.props.boton).toBe("Abrir el portal de informes por ODS");
  });

  it("los destinos pasan destinoSeguro", () => {
    for (const n of nodos) for (const l of n.bloques) for (const d of destinosDe(l)) {
      if (!vacio(d.valor)) expect(destinoSeguro(d.valor), d.ruta).not.toBeNull();
    }
  });

  it("los demás portales no tienen micrositios", () => {
    expect(plantillaMicrositios("planeacion")).toEqual([]);
    expect(plantillaMicrositios("landing")).toEqual([]);
  });
});

describe("encabezados de los micrositios frente a la página real", () => {
  it("el antetítulo del ranking es el de SostenibleRanking: «Micrositio · editor»", () => {
    for (const r of RANKINGS) {
      const nodo = plantillaMicrositios("sostenible").find((n) => n.slug === r.id && n.padre === null)!;
      expect(nodo.bloques[0]!.props.antetitulo).toBe(`Micrositio · ${r.publisher}`);
    }
  });
});

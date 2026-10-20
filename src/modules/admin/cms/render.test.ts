/* =============================================================================
   CMS Portales · pruebas de render.

   Dibuja cada tipo del registro con sus valores de partida y comprueba que
   ninguno cae en el aviso de «sin diseño». Sin navegador: se usa el render del
   servidor de React, así que las entradas animadas (GSAP) no se ejecutan aquí.
   Además, un destino no seguro nunca sale como enlace.

   Es un .ts sin JSX porque Vitest solo recoge *.test.ts en este proyecto.
   ========================================================================== */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { BLOQUES } from "./bloques";
import { RenderBloques, evitarNavegacion, type BloqueRender } from "./render";

function dibujar(bloques: BloqueRender[], navegable = false): string {
  const cliente = new QueryClient();
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(QueryClientProvider, { client: cliente }, createElement(RenderBloques, { bloques, navegable })),
    ),
  );
}

describe("render de bloques", () => {
  it("todo tipo del registro tiene diseño (ninguno cae en el aviso de respaldo)", () => {
    for (const def of BLOQUES) {
      const html = dibujar([{ tipo: def.tipo, ancho: 12, props: def.valores() }]);
      expect(html, def.tipo).not.toContain("sin diseño en el portal");
      expect(html.length, def.tipo).toBeGreaterThan(0);
    }
  });

  it("el bloque de indicadores muestra su encabezado editable", () => {
    const html = dibujar([{ tipo: "indicadores", ancho: 12, props: { antetitulo: "Eyebrow", titulo: "Titulo propio", texto: "" } }]);
    expect(html).toContain("Titulo propio");
    expect(html).toContain("cms-vivo");
  });

  it("un destino no seguro no sale como enlace, aunque la página sea pública", () => {
    const html = dibujar(
      [
        {
          tipo: "cierre",
          ancho: 12,
          props: {
            titulo: "Cierre",
            texto: "",
            enlace: "Ir",
            destinoEnlace: "javascript:alert(1)",
            accesos: [{ etiqueta: "Malo", detalle: "", destino: "//sitio.externo" }],
          },
        },
      ],
      true,
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('href="//');
  });

  it("un destino seguro sí se vuelve enlace en la página pública", () => {
    const props = { titulo: "C", texto: "", enlace: "Ver", destinoEnlace: "/pdi", accesos: [] };
    const html = dibujar([{ tipo: "cierre", ancho: 12, props }], true);
    expect(html).toContain('href="/pdi"');
  });

  it("en el editor (no pública) los destinos no se convierten en enlaces", () => {
    const props = { titulo: "C", texto: "", enlace: "Ver", destinoEnlace: "/pdi", accesos: [] };
    const html = dibujar([{ tipo: "cierre", ancho: 12, props }], false);
    expect(html).not.toContain('href="/pdi"');
  });

  it("el mosaico dibuja las cinco teselas reales de la portada, con el título del bloque", () => {
    const html = dibujar([{ tipo: "mosaico", ancho: 12, props: { titulo: "Titulo del mosaico", texto: "Bajada propia" } }]);
    expect(html).toContain("Titulo del mosaico");
    expect(html).toContain("Bajada propia");
    for (const tesela of ["pl-tile--cifras", "pl-tile--pdi", "pl-tile--bulletins", "pl-tile--team", "pl-tile--obs"]) {
      expect(html, tesela).toContain(tesela);
    }
  });

  it("los vivos de Planeación van dentro de .pl-page, de donde salen sus variables", () => {
    for (const tipo of ["mosaico", "galeria-oficina", "equipo-oficina"]) {
      const def = BLOQUES.find((b) => b.tipo === tipo)!;
      expect(dibujar([{ tipo, ancho: 12, props: def.valores() }]), tipo).toContain('class="pl-page cms-pl"');
    }
    const hero = dibujar([{ tipo: "hero", ancho: 12, props: { titulo: "T", tono: "claro", buscador: true } }]);
    expect(hero).toContain('class="pl-page cms-pl"');
  });

  it("la nota de datos de muestra solo aparece cuando está activada", () => {
    const con = dibujar([{ tipo: "rankings", ancho: 12, props: { items: [], nota: true } }]);
    const sin = dibujar([{ tipo: "rankings", ancho: 12, props: { items: [], nota: false } }]);
    expect(con).toContain("Dato ilustrativo: cifras de muestra.");
    expect(sin).not.toContain("Dato ilustrativo");
  });
});

describe("evitarNavegacion", () => {
  const evento = (dentroDeEnlace: boolean) => {
    const preventDefault = vi.fn();
    const e = { target: { closest: (sel: string) => (dentroDeEnlace && sel === "a[href]" ? {} : null) }, preventDefault };
    return { e: e as unknown as Parameters<typeof evitarNavegacion>[0], preventDefault };
  };

  it("detiene el clic que cae sobre un enlace real, para que el editor no navegue", () => {
    const { e, preventDefault } = evento(true);
    evitarNavegacion(e);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("deja pasar el resto de los clics", () => {
    const { e, preventDefault } = evento(false);
    evitarNavegacion(e);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe("bloques de micrositios de UDES Sostenible", () => {
  it("cada bloque de micrositio se dibuja con su valor de partida, sin el aviso de «sin diseño»", () => {
    const micro = BLOQUES.filter((b) => b.grupo === "Micrositios de ranking");
    expect(micro).toHaveLength(7);
    for (const def of micro) {
      const html = dibujar([{ tipo: def.tipo, ancho: 12, props: def.valores() }]);
      expect(html, def.tipo).not.toContain("sin diseño en el portal");
      expect(html, def.tipo).toContain('class="sos cms-vivo"');
    }
  });

  it("la sección de resultados nombra el ranking elegido", () => {
    const html = dibujar([{ tipo: "ranking-resultados", ancho: 12, props: { ranking: "world" } }]);
    expect(html).toContain("Resultados de la UDES en World University.");
  });

  it("la subcategoría dibuja su encabezado real", () => {
    const html = dibujar([{ tipo: "categoria-indicadores", ancho: 12, props: { categoria: "green/ec" } }]);
    expect(html).toContain("Lo que explica este resultado.");
  });

  it("las tarjetas de subcategorías enlazan a las rutas reales de la app", () => {
    const html = dibujar([{ tipo: "ranking-categorias", ancho: 12, props: { ranking: "green" } }], true);
    expect(html).toContain('href="/sostenible/green/ec"');
  });

  it("una subcategoría que no existe muestra el aviso de elegir, sin romper la página", () => {
    const html = dibujar([{ tipo: "categoria-puntaje", ancho: 12, props: { categoria: "nada/x" } }]);
    expect(html).toContain("Elija un ranking o una subcategoría en el inspector.");
  });
});

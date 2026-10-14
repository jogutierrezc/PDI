// @vitest-environment jsdom
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { Asignacion, Indicador } from "./tipos";
import type { RankingCycleRow, RankingResponseRow } from "../../../types/database";
import { FaltaMigracion } from "../noticias";

/* Sin red: las consultas y mutaciones del reporte son falsas; el resto real. */
const datos = vi.hoisted(() => ({
  ciclo: null as unknown,
  error: null as Error | null,
  sinEfecto: () => ({ mutate: () => {}, mutateAsync: async () => ({}), isPending: false, error: null, data: undefined }),
}));
vi.mock("./datos", async (orig) => {
  const real = await orig<typeof import("./datos")>();
  const consulta = (data: unknown) => ({ data, error: null, isPending: false, isError: false, refetch: () => {} });
  return {
    ...real,
    useCicloReporte: () => (datos.error ? { data: undefined, error: datos.error, isPending: false } : consulta(datos.ciclo)),
    useCatalogoReporte: () => consulta([]),
    useAsignacionesReporte: () => consulta([]),
    useRespuestasReporte: () => consulta([]),
    useUnidadesReporte: () => consulta([]),
    useEvidenciasReporte: () => consulta([]),
    useAportesReporte: () => consulta([]),
    useMarcarOficial: datos.sinEfecto,
    useAsegurarRespuesta: datos.sinEfecto,
    useGuardarRespuesta: datos.sinEfecto,
    useEnviarRespuesta: datos.sinEfecto,
    useRevisarRespuesta: datos.sinEfecto,
    useSubirEvidencia: datos.sinEfecto,
    useAgregarEnlace: datos.sinEfecto,
    useQuitarEvidencia: datos.sinEfecto,
    useAsignarIndicador: datos.sinEfecto,
    useImportarCatalogo: datos.sinEfecto,
  };
});

import { ResumenOds } from "./ui/ResumenOds";
import { FormularioOficina } from "./ui/FormularioOficina";
import { MesaCoordinacion } from "./ui/MesaCoordinacion";
import { ReportePlaneacion } from "./ui/ReportePlaneacion";

const ind = (over: Partial<Indicador> & Pick<Indicador, "id" | "ods">): Indicador => ({
  nivel: "indicator",
  padre: null,
  tipo: "ev",
  texto_en: "Ingles",
  texto_es: "Titulo en español",
  peso: 0.1,
  prioridad: "alta",
  tipo_requerimiento: "Una política que apoye la permanencia de las mujeres.",
  orden: 0,
  ...over,
});

const catalogo: Indicador[] = [
  ind({ id: "4", ods: 4, nivel: "metric", tipo: null }),
  ind({ id: "4.2.1", ods: 4, tipo: "dato", texto_es: "Titulados con cualificación" }),
  ind({ id: "4.2.1/1", ods: 4, nivel: "option", padre: "4.2.1", tipo: "dato", texto_es: "Número de titulados", orden: 1 }),
  ind({ id: "4.3.1", ods: 4, texto_es: "Recursos públicos de aprendizaje" }),
  ind({ id: "5.6.3", ods: 5, texto_es: "Política de maternidad" }),
  ind({ id: "17.4.4", ods: 17, texto_es: "Alfabetización en sostenibilidad", prioridad: "baja" }),
];

const asignaciones: Asignacion[] = [
  { indicador: "4.3.1", unidad: "U-EDUCON", rol: "principal" },
  { indicador: "4.2.1", unidad: "U-PLAN", rol: "principal" },
];

const resp = (over: Partial<RankingResponseRow>): RankingResponseRow => ({
  id: "r1",
  ciclo: "c1",
  indicador: "4.3.1",
  unidad: "U-EDUCON",
  valores: {},
  si_no: true,
  estado: "draft",
  comentario_es: "Texto del comentario",
  comentario_en: "",
  nota_revision: "",
  oficial: false,
  updated_by: null,
  updated_at: "2026-10-01T00:00:00Z",
  ...over,
});

const ciclo: RankingCycleRow = {
  id: "c1",
  ranking: "the-impact",
  anio: 2026,
  anio_datos: 2024,
  ods_priorizados: [4, 5, 10, 17],
  fecha_limite: null,
  estado: "abierto",
};

describe("ResumenOds", () => {
  it("pone los priorizados al frente y solo ellos en el modo Priorizados", () => {
    const html = renderToString(
      h(ResumenOds, {
        prioridades: [4, 5, 10, 17],
        indicadores: catalogo,
        respuestas: [resp({ estado: "ok" })],
        onVerOds: () => {},
      }),
    );
    expect(html).toContain("Resumen de los 17 ODS");
    expect(html).toContain("Priorizados");
    expect(html).toContain("Los 17");
    expect(html.match(/>Priorizado</g)?.length).toBe(4);
    expect(html).not.toContain("Catálogo");
    // ODS 4: 2 indicadores de nivel indicador; 1 aprobado por la oficina principal.
    expect(html).toContain("1 de 2 aprobados");
  });
});

describe("FormularioOficina", () => {
  const ciclos = { ...ciclo };

  it("una evidencia sí/no muestra la ficha, la estimación y lo que falta para enviar", () => {
    const html = renderToString(
      h(FormularioOficina, {
        ciclo: ciclos,
        oficina: { id: "U-EDUCON", nombre: "EDUCON" },
        actor: "editor",
        indicadores: catalogo,
        asignaciones,
        respuestas: [resp({ estado: "draft" })],
      }),
    );
    expect(html).toContain("Qué pide THE.");
    expect(html).toContain("Guardar borrador");
    expect(html).toContain("Enviar a Planeación");
    // El Contribuyente no envía; se le dice en español.
    expect(html).toContain("Solo el Gestor de la oficina o Planeación puede enviar.");
    expect(html).toContain("Traduzca el comentario al inglés.");
    expect(html).toContain("Lo que probablemente puntuará");
  });

  it("un dato pide sus cifras con campo por opción", () => {
    const html = renderToString(
      h(FormularioOficina, {
        ciclo: ciclos,
        oficina: { id: "U-PLAN", nombre: "Planeación" },
        actor: "jefe",
        indicadores: catalogo,
        asignaciones,
        respuestas: [resp({ id: "r2", indicador: "4.2.1", unidad: "U-PLAN", estado: "none", si_no: null, comentario_es: "" })],
      }),
    );
    expect(html).toContain("Número de titulados");
    expect(html).toContain("Complete todas las cifras.");
    expect(html).not.toContain("Lo que probablemente puntuará");
  });

  it("una respuesta enviada queda en solo lectura con su aviso", () => {
    const html = renderToString(
      h(FormularioOficina, {
        ciclo: ciclos,
        oficina: { id: "U-EDUCON", nombre: "EDUCON" },
        actor: "jefe",
        indicadores: catalogo,
        asignaciones,
        respuestas: [resp({ estado: "sent" })],
      }),
    );
    expect(html).toContain("Solo Planeación puede cambiarla ahora.");
    expect(html).toContain("Ya se envió: Planeación la revisa y solo ella puede cambiarla.");
  });
});

describe("FormularioOficina con el catálogo abierto", () => {
  it("una oficina sin sugeridos ve todo el catálogo, y sus contadores", () => {
    const html = renderToString(
      h(FormularioOficina, {
        ciclo: { ...ciclo },
        oficina: { id: "U-NUEVA", nombre: "Oficina nueva" },
        actor: "editor",
        indicadores: catalogo,
        asignaciones,
        respuestas: [],
      }),
    );
    expect(html).toContain("Todo el catálogo (4)");
    expect(html).toContain("Sugeridos para su oficina (0)");
    expect(html).toContain("Preparando la ficha");
  });

  it("la ficha dice quién ya aportó al indicador, sin contar a la propia oficina", () => {
    const html = renderToString(
      h(FormularioOficina, {
        ciclo: { ...ciclo },
        oficina: { id: "U-EDUCON", nombre: "EDUCON" },
        actor: "editor",
        indicadores: catalogo,
        asignaciones,
        respuestas: [resp({ estado: "draft" })],
        aportes: [
          { indicador: "4.3.1", unidad: "U-EDUCON", unidad_nombre: "EDUCON", estado: "draft", oficial: false },
          { indicador: "4.3.1", unidad: "U-OTRA", unidad_nombre: "Talento Humano", estado: "sent", oficial: false },
          { indicador: "5.6.3", unidad: "U-OTRA", unidad_nombre: "Talento Humano", estado: "ok", oficial: true },
        ],
      }),
    );
    expect(html).toMatch(/Ya aportaron (<!-- -->)?1 oficina/);
    expect(html).toContain("Talento Humano");
    expect(html).toContain("enviada");
    // El contador de la lista (sugeridos: solo 4.3.1) viene de la RPC, sin contar a la propia oficina.
    expect(html.match(/oficina aportó/g)?.length).toBe(1);
    expect(html).toContain("Responsable sugerido");
  });
});

describe("FormularioOficina · comentario largo", () => {
  it("más de 1000 caracteres muestra su propio aviso y no deja traducir", () => {
    const html = renderToString(
      h(FormularioOficina, {
        ciclo: { ...ciclo },
        oficina: { id: "U-EDUCON", nombre: "EDUCON" },
        actor: "jefe",
        indicadores: catalogo,
        asignaciones,
        respuestas: [resp({ comentario_es: "a".repeat(1034) })],
      }),
    );
    expect(html).toContain("El comentario pasa del máximo que acepta THE");
    expect(html).toMatch(/Quite[^0-9]*34/);
  });
});

describe("MesaCoordinacion", () => {
  it("lista los indicadores con su oficina, el estado y la acción de revisar", () => {
    const html = renderToString(
      h(MesaCoordinacion, {
        ciclo,
        indicadores: catalogo,
        asignaciones,
        respuestas: [resp({ estado: "sent" })],
        unidades: [
          { id: "U-EDUCON", name: "EDUCON", kind: "oficina", code: null },
          { id: "U-PLAN", name: "Planeación Institucional", kind: "oficina", code: null },
        ],
        odsInicial: null,
      }),
    );
    expect(html).toContain("Responsable sugerido");
    expect(html).toContain("EDUCON");
    expect(html).toContain("Aportes");
    expect(html).toContain("Sin sugerir");
    expect(html).toContain("Cualquier estado");
  });

  it("la oficial: la marcada gana a la más reciente, y se dice cuál regla aplica", () => {
    const unidades = [
      { id: "U-EDUCON", name: "EDUCON", kind: "oficina", code: null },
      { id: "U-OTRA", name: "Talento Humano", kind: "oficina", code: null },
    ];
    const conMarca = renderToString(
      h(MesaCoordinacion, {
        ciclo,
        indicadores: catalogo,
        asignaciones,
        respuestas: [resp({ estado: "ok", oficial: true, updated_at: "2026-09-01T00:00:00Z" }), resp({ id: "r9", unidad: "U-OTRA", estado: "ok", updated_at: "2026-10-05T00:00:00Z" })],
        unidades,
        odsInicial: 4,
      }),
    );
    expect(conMarca).toContain(">marcada<");
    const sinMarca = renderToString(
      h(MesaCoordinacion, {
        ciclo,
        indicadores: catalogo,
        asignaciones,
        respuestas: [resp({ estado: "ok", updated_at: "2026-09-01T00:00:00Z" }), resp({ id: "r9", unidad: "U-OTRA", estado: "ok", updated_at: "2026-10-05T00:00:00Z" })],
        unidades,
        odsInicial: 4,
      }),
    );
    expect(sinMarca).toContain(">la más reciente<");
    expect(sinMarca).toContain("Talento Humano");
  });
});

describe("ReportePlaneacion sin la migración", () => {
  it("muestra el aviso de la migración en vez de una pantalla en blanco", () => {
    datos.error = new FaltaMigracion("Falta aplicar la migración 0149 (reporte por oficinas).");
    try {
      const html = renderToString(h(MemoryRouter, null, h(ReportePlaneacion)));
      expect(html).toContain("Falta aplicar la migración 0149");
    } finally {
      datos.error = null;
    }
  });

  it("sin ciclo, invita a importar el Excel", () => {
    datos.ciclo = null;
    const html = renderToString(h(MemoryRouter, null, h(ReportePlaneacion)));
    expect(html).toContain("Aún no hay ciclo de THE Impact");
    expect(html).toContain("Importar Excel");
  });
});

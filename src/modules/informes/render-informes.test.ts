// @vitest-environment jsdom
import { createElement as h } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CicloRow, CifraRow, InstanciaRow } from "./types";

vi.mock("../admin/components/AdminShell", () => ({
  AdminShell: ({ title, description, rail, children }: { title: string; description?: string; rail?: ReactNode; children: ReactNode }) =>
    h("div", null, h("h1", null, title), h("p", null, description), rail, children),
  AdminRail: ({ children }: { children: ReactNode }) => h("nav", null, children),
  AdminRailTab: ({ children, count }: { children: ReactNode; count?: number }) => h("span", { "data-count": count }, children),
}));

const sesion = vi.hoisted(() => ({ planeacion: true }));
vi.mock("../../lib/auth", async (orig) => ({
  ...(await orig<typeof import("../../lib/auth")>()),
  useAuth: () => ({ loading: false, profile: { id: "u1", role: sesion.planeacion ? "planeacion" : "consulta" }, hasRole: () => sesion.planeacion }),
}));

/* Sin red: las consultas y mutaciones son falsas; la lógica, real. */
const d = vi.hoisted(() => ({
  error: null as Error | null,
  ciclos: [] as unknown[],
  instancias: [] as unknown[],
  cifras: [] as unknown[],
  vivas: {} as Record<string, unknown>,
}));
vi.mock("./datos", async (orig) => {
  const real = await orig<typeof import("./datos")>();
  const q = (data: unknown) => ({ data, error: null, isPending: false, refetch: () => {} });
  const m = () => ({ mutate: () => {}, mutateAsync: async () => ({}), isPending: false, error: null });
  return {
    ...real,
    useCiclos: () => (d.error ? { data: undefined, error: d.error, isPending: false } : q(d.ciclos)),
    useRequisitos: () => q([{ ciclo_id: "c1", plantilla: "A", clave: "matric", condicion: "justificar" }]),
    useUnidades: () =>
      q([
        { id: "U1", name: "Facultad de Ciencias de la Salud", kind: "facultad", code: "FCS", parent_id: null },
        { id: "U2", name: "Vicerrectoría de Extensión", kind: "vicerrectoria", code: "VEX", parent_id: null },
        { id: "U3", name: "Programa de Medicina", kind: "programa", code: "MED", parent_id: "U1" },
      ]),
    useInstancias: () => q(d.instancias),
    useListas: () => q(new Map([["i1", 4]])),
    useMembresiasPropias: () => q([{ unidad: "U1", rol: "jefe", nombre: "Facultad de Ciencias de la Salud" }]),
    useSecciones: () => q([{ instancia_id: "i1", clave: "s1", orden: 1, contenido: { texto: "La matrícula llegó a [[matric]] estudiantes en 2026." }, listo: false }]),
    useCifras: () => q(d.cifras),
    useCifrasVivas: () => q(d.vivas),
    useAnexos: () => q([]),
    useFuentes: () => q([]),
    usePilares: () => q([{ id: "p1", numeral: "I", name: "Personalización", progress: 78 }]),
    useCorpus: () => q({ total: 12, por_origen: { informe2025: 12 }, perfiles: [{ tipo: "resumen", textos: 5, mediana_palabras: 180, aperturas: [{ texto: "durante el año", veces: 3 }], conectores: [], frases: [] }] }),
    useGuardarCiclo: m,
    useGuardarRequisito: m,
    useAbrirInforme: m,
    useGuardarSeccion: m,
    useGuardarCifra: m,
    useAsegurarCifras: m,
    useQuitarCifra: m,
    useSincronizarMetas: m,
    useEnviar: m,
    useRevisar: m,
    useSubirAnexo: m,
    useAgregarEnlace: m,
    useQuitarAnexo: m,
  };
});

import { InformesAdmin } from "./InformesAdmin";
import { FaltaMigracion } from "./datos";

const ciclo: CicloRow = { id: "c1", anio: 2026, nombre: "Informe de gestión 2026", fecha_limite: "2026-11-30", corte: "2026-12-31", estado: "abierto", config: { limite_propios: 3 } };
const inst = (over: Partial<InstanciaRow> = {}): InstanciaRow => ({
  id: "i1",
  ciclo_id: "c1",
  unit_id: "U1",
  plantilla: "A",
  destino: null,
  estado: "draft",
  nota_revision: null,
  enviado_en: null,
  enviado_por: null,
  aprobado_en: null,
  aprobado_por: null,
  ...over,
});
const cifra: CifraRow = {
  instancia_id: "i1",
  clave: "matric",
  etiqueta: "Matrícula total",
  seccion_clave: "s4",
  fuente_tipo: "auto",
  fuente_nombre: "",
  valor: null,
  unidad: "",
  meta: 2900,
  anterior: 2765,
  incluida: true,
  justificacion: "",
  propia: false,
  pilar: null,
  visto: 2840,
  foto_valor: null,
  foto_en: null,
  foto_fuente: null,
};

const page = (path: string) =>
  renderToString(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: "/admin/informes-gestion/:seccion?", element: h(InformesAdmin) }))),
    ),
  ).replace(/<!-- -->/g, "");

const preparar = (over: Partial<typeof d> = {}) => {
  d.error = null;
  d.ciclos = [ciclo];
  d.instancias = [inst()];
  d.cifras = [cifra];
  d.vivas = { matric: { valor: 2851, fuente: "UDES en Cifras · matriculados · 2026", corte: "2026-12-31" } };
  Object.assign(d, over);
  sesion.planeacion = true;
};

describe("Informes Institucionales", () => {
  it("el tablero muestra el ciclo, qué se justifica y la entrega por unidad (sin programas)", () => {
    preparar();
    const html = page("/admin/informes-gestion");
    expect(html).toContain("Tablero del ciclo");
    expect(html).toContain("Informe de gestión 2026");
    expect(html).toContain("Qué datos debe justificar cada unidad");
    expect(html).toContain("Matrícula total");
    expect(html).toContain("Facultad de Ciencias de la Salud");
    expect(html).toContain("4 de 10 secciones");
    expect(html).toContain("Vicerrectoría de Extensión");
    expect(html).not.toContain("Programa de Medicina");
    expect(html).toContain("Abrir los 1 que faltan");
    expect(html).toContain("Revisión");
  });

  it("mi informe: secciones, texto con la cifra viva enlazada y envío bloqueado con su motivo", () => {
    preparar();
    const html = page("/admin/informes-gestion/mi-informe");
    expect(html).toContain("Resumen ejecutivo");
    expect(html).toContain("Sección 1 de 10");
    expect(html).toContain("Insertar una cifra viva");
    expect(html).toContain('class="inf-chip" title="UDES en Cifras · matriculados · 2026">2.851<');
    expect(html).toContain("Enviar a Rectoría de Campus");
    expect(html).toMatch(/Se habilita cuando las 10 secciones estén listas/);
    expect(html).toContain("Pilo redacta un borrador");
    expect(html).toContain("Las cifras del texto están enlazadas a su fuente");
  });

  it("la sección de resultados avisa el cambio y pide la justificación", () => {
    preparar();
    const html = page("/admin/informes-gestion/mi-informe?s=4");
    expect(html).toContain("Lo pide Planeación");
    expect(html).toContain("Cambió desde que lo revisó");
    expect(html).toContain("2.840 → 2.851");
    expect(html).toContain("Explique este resultado en una línea");
    expect(html).toContain("0 de 3 datos propios");
  });

  it("enviado: cifras congeladas y sin edición", () => {
    preparar({ instancias: [inst({ estado: "sent", enviado_en: "2026-10-14T10:00:00Z" })], cifras: [{ ...cifra, foto_valor: 2840, foto_en: "2026-10-14T10:00:00Z" }] });
    const html = page("/admin/informes-gestion/mi-informe?s=4");
    expect(html).toContain("Las cifras quedaron congeladas al enviar.");
    expect(html).toContain("Foto del");
    expect(html).not.toContain("Cambió desde que lo revisó");
    expect(html).not.toContain("Añadir un dato propio");
  });

  it("revisión: Planeación lee el informe y decide", () => {
    preparar({ instancias: [inst({ estado: "sent" })] });
    const html = page("/admin/informes-gestion/revision?informe=i1");
    expect(html).toContain("Por revisar");
    expect(html).toContain("Aprobar");
    expect(html).toContain("Devolver con nota");
    expect(html).toContain("Nota para esta sección");
  });

  it("capacitación: subida de informes y lo que Pilo aprendió", () => {
    preparar();
    const html = page("/admin/informes-gestion/capacitacion");
    expect(html).toContain("Suelte los informes o haga clic");
    expect(html).toContain("Lo que Pilo aprendió");
    expect(html).toContain("mediana de 180 palabras");
  });

  it("consolidador y vista A4 quedan para la próxima fase", () => {
    preparar();
    expect(page("/admin/informes-gestion/consolidador")).toContain("Próxima fase");
    expect(page("/admin/informes-gestion/vista")).toContain("Próxima fase");
  });

  it("sin la migración 0153 lo dice", () => {
    preparar({ error: new FaltaMigracion("Falta aplicar la migración 0153 (Informes Institucionales).") });
    expect(page("/admin/informes-gestion")).toContain("Falta aplicar la migración 0153");
  });

  it("una unidad no ve las secciones de Planeación", () => {
    preparar();
    sesion.planeacion = false;
    const html = page("/admin/informes-gestion/mi-informe");
    expect(html).not.toContain("Capacitación de Pilo");
    expect(html).toContain("Gestor");
  });
});

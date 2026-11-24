import { describe, expect, it } from "vitest";
import { aCsv, leerMatriz, parsearCsv, PLANTILLAS, validarFila } from "../../../../supabase/functions/int-contactos/contactos";
import { construirExportacion, entroPor, sinRepetidos } from "./exportar-contactos";
import type { EntradaExportar, FilaFuente } from "./exportar-contactos";

const CAMPUS = [
  { id: "c-buc", name: "Bucaramanga", code: "BUC" },
  { id: "c-cuc", name: "Cúcuta", code: "CUC" },
];

const fila = (id: string, campus: string, correo: string, over: Partial<FilaFuente> = {}, extra: Record<string, string> = {}): FilaFuente => ({
  id,
  hoja_id: "h-ac",
  periodo_id: "p-2",
  campus_id: campus,
  datos: validarFila(PLANTILLAS.academica, { "First Name": id, "Last Name": "Prueba", "Job Title": "Docente", Email: correo, "Country or Territory": "Chile", ...extra }).datos,
  origen: "manual",
  archivo: null,
  aportante_id: "ap-1",
  canal: "enlace",
  created_by: null,
  created_at: "2026-10-10T15:00:00Z",
  ...over,
});

const base = (over: Partial<EntradaExportar> = {}): EntradaExportar => ({
  salida: "academica",
  filas: {
    academica: [fila("Ana", "c-buc", "ana@u.cl"), fila("Beto", "c-cuc", "beto@u.cl"), fila("Ana2", "c-cuc", "ANA@u.cl", { created_at: "2026-10-12T15:00:00Z" })],
    empleadores: [
      {
        ...fila("Eva", "c-cuc", "eva@empresa.co"),
        hoja_id: "h-em",
        datos: validarFila(PLANTILLAS.empleadores, { "First Name": "Eva", "Last Name": "Díaz", Position: "Gerente", "Company Name": "Andina", Email: "eva@empresa.co" }).datos,
      },
    ],
  },
  hojas: { academica: "h-ac", empleadores: "h-em" },
  campus: CAMPUS,
  periodos: new Map([["p-2", "2026-2"]]),
  aportantes: new Map([["ap-1", { nombre: "Laura Mendoza", cargo: "Directora de programa", correo: "lmendoza@udes.edu.co" }]]),
  usuarios: {},
  estadoDe: () => "borrador",
  filtro: { campus: null, periodo: null, soloAprobado: false },
  ...over,
});

describe("exportar contactos", () => {
  it("las plantillas salen con las cabeceras de Rua en su orden y sin repetir correos", () => {
    const x = construirExportacion(base());
    expect(x.encabezados).toEqual(PLANTILLAS.academica.columnas.map((c) => c.encabezado));
    expect(x.encabezados).toHaveLength(11);
    expect(x.filas).toHaveLength(2);
    expect(x.repetidas).toBe(1);
    // De los dos «ana» queda la más reciente.
    expect(x.filas.map((f) => f[2]).sort()).toEqual(["Ana2", "Beto"]);
  });

  it("la de empleadores tiene diez columnas", () => {
    const x = construirExportacion(base({ salida: "empleadores" }));
    expect(x.encabezados).toHaveLength(10);
    expect(x.encabezados).toContain("Company Name");
    expect(x.filas[0][x.encabezados.indexOf("Company Name")]).toBe("Andina");
  });

  it("filtra por campus y periodo, y solo lo aprobado cuando se pide", () => {
    expect(construirExportacion(base({ filtro: { campus: "c-buc", periodo: null, soloAprobado: false } })).filas).toHaveLength(1);
    expect(construirExportacion(base({ filtro: { campus: null, periodo: "p-1", soloAprobado: false } })).filas).toHaveLength(0);
    const aprobado = construirExportacion(base({ filtro: { campus: null, periodo: null, soloAprobado: true }, estadoDe: (_p, _h, campus) => (campus === "c-buc" ? "aprobado" : "enviado") }));
    expect(aprobado.filas.map((f) => f[2])).toEqual(["Ana"]);
  });

  it("el nombre del archivo dice campus y periodo, sin tildes ni espacios", () => {
    expect(construirExportacion(base()).archivo).toBe("academic_template_V3_todos-los-campus_todos-los-periodos");
    expect(construirExportacion(base({ filtro: { campus: "c-cuc", periodo: "p-2", soloAprobado: false } })).archivo).toBe("academic_template_V3_cuc_2026-2");
  });

  it("la libreta junta las dos listas con quién aportó, cuándo y por dónde entró, sin quitar repetidos", () => {
    const x = construirExportacion(
      base({
        salida: "libreta",
        usuarios: { u1: "Jaime Gutiérrez" },
        filas: {
          academica: [fila("Ana", "c-buc", "ana@u.cl", { origen: "excel", archivo: "nominaciones.xlsx" }), fila("Ana2", "c-cuc", "ana@u.cl"), fila("Interna", "c-buc", "int@u.cl", { aportante_id: null, canal: "interno", created_by: "u1" })],
          empleadores: [{ ...fila("Eva", "c-cuc", "eva@empresa.co"), hoja_id: "h-em" }],
        },
      }),
    );
    const col = (n: string) => x.encabezados.indexOf(n);
    expect(x.filas).toHaveLength(4);
    expect(x.repetidas).toBe(0);
    const ana = x.filas.find((f) => f[col("First Name")] === "Ana")!;
    expect(ana[col("Tipo")]).toBe("Académico");
    expect(ana[col("Campus")]).toBe("Bucaramanga");
    expect(ana[col("Periodo")]).toBe("2026-2");
    expect(ana[col("Aportó")]).toBe("Laura Mendoza");
    expect(ana[col("Cargo en la UDES")]).toBe("Directora de programa");
    expect(ana[col("Correo de quien aportó")]).toBe("lmendoza@udes.edu.co");
    expect(ana[col("Entró por")]).toBe("Enlace · Excel (nominaciones.xlsx)");
    const interna = x.filas.find((f) => f[col("First Name")] === "Interna")!;
    expect(interna[col("Aportó")]).toBe("Jaime Gutiérrez");
    expect(interna[col("Entró por")]).toBe("Equipo · a mano");
    expect(x.filas.some((f) => f[col("Tipo")] === "Empleador")).toBe(true);
  });

  it("lo exportado en una plantilla se vuelve a leer y valida igual", () => {
    const x = construirExportacion(base());
    const csv = aCsv(x.encabezados, x.filas);
    const lectura = leerMatriz(parsearCsv(csv), PLANTILLAS.academica);
    expect(lectura.filas).toHaveLength(x.filas.length);
    for (const f of lectura.filas) expect(validarFila(PLANTILLAS.academica, f.cruda).errores).toEqual([]);
  });
});

describe("piezas", () => {
  it("sinRepetidos conserva las filas sin correo", () => {
    const r = sinRepetidos([
      { datos: { propio_email: "a@x.co" }, created_at: "1" },
      { datos: { propio_email: "A@x.co" }, created_at: "2" },
      { datos: {}, created_at: "3" },
    ]);
    expect(r.filas).toHaveLength(2);
    expect(r.repetidas).toBe(1);
  });

  it("entroPor dice canal, origen y archivo", () => {
    expect(entroPor({ canal: "enlace", origen: "manual", archivo: null })).toBe("Enlace · a mano");
    expect(entroPor({ canal: "interno", origen: "excel", archivo: null })).toBe("Equipo · Excel");
  });
});

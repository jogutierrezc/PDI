import { describe, expect, it } from "vitest";
import type { Campo, Contexto, Formato, PlantillaSpec } from "../tipos";
import { ayudas, documento, motor, normalizar } from "./index";
import { leerCsv } from "./archivos";

/* ---------- una plantilla mínima propia (no depende de snies/) ---------- */

const ctx: Contexto = {
  periodo: { anio: 2026, semestre: 2 },
  catalogos: {
    municipio: [
      { catalogo: "municipio", codigo: "68001", nombre: "Bucaramanga", departamento: "Santander", activo: true },
      { catalogo: "municipio", codigo: "68077", nombre: "Barbosa", departamento: "Santander", activo: true },
      { catalogo: "municipio", codigo: "05079", nombre: "Barbosa", departamento: "Antioquia", activo: true },
      { catalogo: "municipio", codigo: "54001", nombre: "Cúcuta", departamento: "Norte de Santander", activo: true },
      { catalogo: "municipio", codigo: "11001", nombre: "Bogotá D.C.", departamento: "Bogotá D.C.", activo: true },
      { catalogo: "municipio", codigo: "99999", nombre: "Pueblo Viejo", departamento: "Boyacá", activo: false },
    ],
    pais: [{ catalogo: "pais", codigo: "170", nombre: "Colombia", activo: true }],
    programa: [{ catalogo: "programa", codigo: "1234", nombre: "Medicina", activo: true }],
  },
  dominios: {
    tipo_documento: {
      id: "tipo_documento",
      etiqueta: "Tipo de documento",
      seccion: "§2.1",
      valores: [
        { codigo: "CC", nombre: "Cédula de ciudadanía" },
        { codigo: "TI", nombre: "Tarjeta de identidad" },
      ],
    },
  },
  cruces: { participantes: new Set(), matriculados: new Set(), graduados: new Map(), inscritos: new Set(), inscritosPrograma: new Set(), admitidos: new Set(), primerCurso: new Set() },
};

const campo = (codigo: string, etiqueta: string, extra: Partial<Campo> = {}): Campo => ({
  codigo,
  etiqueta,
  grupo: "Identificación",
  obligatorio: false,
  seccion: "§3.4.7",
  ...extra,
});

const spec: PlantillaSpec = {
  id: "matriculados",
  nombre: "Matriculados",
  modulo: "Población estudiantil",
  seccion: "§3.4.7",
  orden: 5,
  depende: ["participante"],
  fechas: { 1: { primerCorte: null, definitiva: null }, 2: { primerCorte: null, definitiva: null } },
  disponible: true,
  campos: [
    campo("AÑO", "Año", { obligatorio: true, formato: "anio", alias: ["ANIO"] }),
    campo("ID_TIPO_DOCUMENTO", "Tipo de documento", { obligatorio: true, fuente: { tipo: "dominio", dominio: "tipo_documento" } }),
    campo("NUM_DOCUMENTO", "Número de documento", { obligatorio: true, formato: "documento", alias: ["DOCUMENTO"] }),
    campo("ID_MUNICIPIO", "Municipio donde estudia", { obligatorio: true, fuente: { tipo: "catalogo", catalogo: "municipio" }, alias: ["Código del municipio"] }),
    campo("CORREO", "Correo", { formato: "correo" }),
  ],
  reglas: [],
  reglasPlantilla: [],
};

const buena = () => ({
  AÑO: "2026",
  ID_TIPO_DOCUMENTO: "Cédula de ciudadanía",
  NUM_DOCUMENTO: "1000765432",
  ID_MUNICIPIO: "Bucaramanga (Santander)",
  CORREO: "ana@udes.edu.co",
});

const municipio = { tipo: "catalogo", catalogo: "municipio" } as const;

describe("texto", () => {
  it("normaliza sin tildes, en mayúsculas y con espacios colapsados", () => {
    expect(normalizar("  Cúcuta   norte ")).toBe("CUCUTA NORTE");
  });
  it("fecha: dd/mm/aaaa y dd-mm-aaaa que existan; 31/02 no pasa", () => {
    expect(ayudas.fecha("15/08/2026")?.getDate()).toBe(15);
    expect(ayudas.fecha("29-02-2024")).not.toBeNull();
    expect(ayudas.fecha("31/02/2026")).toBeNull();
    expect(ayudas.fecha("29/02/2025")).toBeNull();
    expect(ayudas.fecha("2026-08-15")).toBeNull();
    expect(ayudas.fecha("15/08-2026")).toBeNull();
  });
});

describe("nombres", () => {
  it("etiqueta con departamento, salvo que sea igual al nombre o no haya", () => {
    expect(motor.etiqueta({ nombre: "Bucaramanga", departamento: "Santander" })).toBe("Bucaramanga (Santander)");
    expect(motor.etiqueta({ nombre: "Bogotá D.C.", departamento: "Bogotá D.C." })).toBe("Bogotá D.C.");
    expect(motor.etiqueta({ nombre: "Medicina" })).toBe("Medicina");
  });

  it("resuelve por etiqueta exacta, código y nombre sin tildes", () => {
    expect(ayudas.resolver(municipio, "Bucaramanga (Santander)", ctx)?.codigo).toBe("68001");
    expect(ayudas.resolver(municipio, "54001", ctx)?.nombre).toBe("Cúcuta (Norte de Santander)");
    expect(ayudas.resolver(municipio, "cucuta", ctx)?.codigo).toBe("54001");
    expect(ayudas.resolver(municipio, "cucuta (norte de santander)", ctx)?.codigo).toBe("54001");
    expect(ayudas.resolver(municipio, "5079", ctx)?.codigo).toBe("05079"); // Excel se comió el cero
    expect(ayudas.resolver({ tipo: "dominio", dominio: "tipo_documento" }, "CC", ctx)?.nombre).toBe("Cédula de ciudadanía");
    expect(ayudas.resolver(municipio, "Neiva", ctx)).toBeNull();
  });

  it("homónimos: «Barbosa» sin departamento no resuelve; con departamento, sí", () => {
    expect(ayudas.resolver(municipio, "Barbosa", ctx)).toBeNull();
    expect(ayudas.resolver(municipio, "barbosa (antioquia)", ctx)?.codigo).toBe("05079");
    expect(ayudas.resolver(municipio, "Barbosa (Santander)", ctx)?.codigo).toBe("68077");
  });

  it("inactivos: solo por código exacto, y no aparecen en las opciones", () => {
    expect(ayudas.resolver(municipio, "Pueblo Viejo (Boyacá)", ctx)).toBeNull();
    expect(ayudas.resolver(municipio, "99999", ctx)?.nombre).toBe("Pueblo Viejo (Boyacá)");
    const ops = motor.opciones(municipio, ctx).map((o) => o.nombre);
    expect(ops).not.toContain("Pueblo Viejo (Boyacá)");
    expect(ops[0]).toBe("Barbosa (Antioquia)");
  });

  it("canoniza códigos y nombres sin tildes; lo que no resuelve queda igual", () => {
    const c = spec.campos[3];
    expect(motor.canonizar(c, "68001", ctx)).toBe("Bucaramanga (Santander)");
    expect(motor.canonizar(c, "Barbosa", ctx)).toBe("Barbosa");
  });
});

describe("validar", () => {
  it("una fila correcta no tiene errores", () => {
    expect(motor.validarPlantilla(spec, [buena()], ctx)).toEqual([]);
  });

  it("obligatorio vacío con etiqueta en minúscula y sección con la plantilla", () => {
    const [e] = motor.validarCeldas(spec, [{ ...buena(), ID_MUNICIPIO: " " }], ctx);
    expect(e).toEqual({ fila: 0, campo: "ID_MUNICIPIO", seccion: "§3.4.7 Matriculados", mensaje: "Falta municipio donde estudia. Es obligatorio en la plantilla." });
  });

  it("valor fuera de catálogo", () => {
    const [e] = motor.validarCeldas(spec, [{ ...buena(), ID_MUNICIPIO: "Barbosa" }], ctx);
    expect(e.mensaje).toBe("“Barbosa” no está en el catálogo de municipios. Elija un valor de la lista.");
    const [d] = motor.validarCeldas(spec, [{ ...buena(), ID_TIPO_DOCUMENTO: "XX" }], ctx);
    expect(d.mensaje).toBe("“XX” no está en el catálogo de tipo de documento. Elija un valor de la lista.");
  });

  it("documento con puntos: error con arreglo «Quitar puntos»", () => {
    const [e] = motor.validarCeldas(spec, [{ ...buena(), NUM_DOCUMENTO: "1.000.765'432" }], ctx);
    expect(e.campo).toBe("NUM_DOCUMENTO");
    expect(e.arreglo).toEqual({ etiqueta: "Quitar puntos", cambios: { NUM_DOCUMENTO: "1000765432" } });
    expect(documento(" 1.000,765 432 ")).toBe("1000765432");
  });

  const casos: [Formato, string[], string[]][] = [
    ["entero", ["0", "42"], ["4.2", "-3", "12a"]],
    ["anio", ["2026"], ["26", "20266", "año"]],
    ["fecha", ["01/02/2026", "1-2-2026", "29/02/2024"], ["31/02/2026", "2026/02/01", "13/13/2026"]],
    ["documento", ["1000765432", "AB123"], ["1.098", "10 98", "10,98"]],
    ["correo", ["ana@udes.edu.co", "a.b@x.co"], ["ana@udes", "ana.udes.co", "a@@x.co", "a b@x.co"]],
    ["telefono", ["6076516500", "3001234567", "6516500", "(607) 651-6500"], ["123456", "30012345678", "tel 123"]],
    ["dinero", ["1500000", "0"], ["1.500.000", "1500000,50", "$1500000"]],
  ];
  for (const [formato, validos, invalidos] of casos) {
    it(`formato ${formato}`, () => {
      const s: PlantillaSpec = { ...spec, campos: [campo("X", "Valor", { formato })] };
      for (const v of validos) expect(motor.validarCeldas(s, [{ X: v }], ctx), `${formato} «${v}» debe pasar`).toEqual([]);
      for (const v of invalidos) expect(motor.validarCeldas(s, [{ X: v }], ctx), `${formato} «${v}» no debe pasar`).toHaveLength(1);
    });
  }

  it("dinero con puntos ofrece arreglo", () => {
    const s: PlantillaSpec = { ...spec, campos: [campo("VALOR", "Valor", { formato: "dinero" })] };
    expect(motor.validarCeldas(s, [{ VALOR: "1.500.000" }], ctx)[0].arreglo?.cambios).toEqual({ VALOR: "1500000" });
  });

  it("corre reglas de fila y de plantilla, ordena por fila y columna y quita duplicados", () => {
    const s: PlantillaSpec = {
      ...spec,
      reglas: [(f) => (f.CORREO === "" ? [{ campo: "AÑO", mensaje: "Regla de fila", seccion: "§x" }] : [])],
      reglasPlantilla: [
        () => [
          { fila: 1, campo: "CORREO", mensaje: "Repetido", seccion: "§y" },
          { fila: 1, campo: "CORREO", mensaje: "Repetido", seccion: "§y" },
          { fila: 0, campo: "NUM_DOCUMENTO", mensaje: "Cruce", seccion: "§y" },
        ],
      ],
    };
    const filas = [buena(), { ...buena(), CORREO: "", ID_MUNICIPIO: "" }];
    const errores = motor.validarPlantilla(s, filas, ctx);
    expect(errores.map((e) => [e.fila, e.campo, e.mensaje.slice(0, 12)])).toEqual([
      [0, "NUM_DOCUMENTO", "Cruce"],
      [1, "AÑO", "Regla de fil"],
      [1, "ID_MUNICIPIO", "Falta munici"],
      [1, "CORREO", "Repetido"],
    ]);
    // validarCeldas no corre las reglas de plantilla.
    expect(motor.validarCeldas(s, filas, ctx).map((e) => e.mensaje)).not.toContain("Cruce");
  });
});

describe("importar y exportar", () => {
  it("reconoce códigos y alias, ignora columnas ajenas, avisa faltantes y convierte códigos", () => {
    const r = motor.importar(
      spec,
      [
        [],
        ["anio", "Documento", "Código del municipio", "Observaciones", ""],
        ["2026", "1.098", "68001", "nota", ""],
        ["", "", "", "", ""],
        ["2026", "22", "cucuta", "", ""],
        ["2026", "33", "Barbosa", "", ""],
      ],
      ctx,
    );
    expect(r.reconocidas).toEqual(["AÑO", "NUM_DOCUMENTO", "ID_MUNICIPIO"]);
    expect(r.ignoradas).toEqual(["Observaciones"]);
    expect(r.faltantes).toEqual(["ID_TIPO_DOCUMENTO"]);
    expect(r.convertidos).toBe(2);
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0]).toEqual({ AÑO: "2026", ID_TIPO_DOCUMENTO: "", NUM_DOCUMENTO: "1.098", ID_MUNICIPIO: "Bucaramanga (Santander)", CORREO: "" });
    expect(r.filas[1].ID_MUNICIPIO).toBe("Cúcuta (Norte de Santander)");
    expect(r.filas[2].ID_MUNICIPIO).toBe("Barbosa");
  });

  it("encabezado con Ñ y tildes: «Año», «ID TIPO DOCUMENTO»", () => {
    const r = motor.importar(spec, [["Año", "ID TIPO DOCUMENTO"], ["2026", "cc"]], ctx);
    expect(r.reconocidas).toEqual(["AÑO", "ID_TIPO_DOCUMENTO"]);
    expect(r.filas[0].ID_TIPO_DOCUMENTO).toBe("Cédula de ciudadanía");
  });

  it("exporta a códigos en el orden de la plantilla", () => {
    const m = motor.exportar(spec, [{ ...buena(), NUM_DOCUMENTO: "1.000.765", ID_MUNICIPIO: "Barbosa (Antioquia)" }, { ...buena(), ID_MUNICIPIO: "Neiva" }], ctx);
    expect(m).toEqual([
      ["AÑO", "ID_TIPO_DOCUMENTO", "NUM_DOCUMENTO", "ID_MUNICIPIO", "CORREO"],
      ["2026", "CC", "1000765", "05079", "ana@udes.edu.co"],
      ["2026", "CC", "1000765432", "Neiva", "ana@udes.edu.co"],
    ]);
  });
});

describe("archivos", () => {
  it("CSV con «;», comillas y saltos dentro de comillas", () => {
    expect(leerCsv('﻿AÑO;NOMBRE;NOTA\r\n2026;"Pérez; Ana";"dice ""hola""\notra"\r\n')).toEqual([
      ["AÑO", "NOMBRE", "NOTA"],
      ["2026", "Pérez; Ana", 'dice "hola"\notra'],
    ]);
  });

  it("CSV con «,» y comas dentro de comillas", () => {
    expect(leerCsv('A,B\n"1,5",2')).toEqual([
      ["A", "B"],
      ["1,5", "2"],
    ]);
  });

  it("lee un .xlsx: fechas a dd/mm/aaaa y enteros sin «.0»", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Datos");
    hoja.addRow(["AÑO", "FECHA", "DOC", "TEXTO"]);
    hoja.addRow([2026, new Date(Date.UTC(2026, 1, 5)), 1000765432, "05001"]);
    hoja.addRow([2025.0, null, 1.5, { formula: "1+1", result: 2 }]);
    const buffer = await libro.xlsx.writeBuffer();
    const archivo = new File([buffer as ArrayBuffer], "matriculados.xlsx");
    expect(await motor.leerArchivo(archivo)).toEqual([
      ["AÑO", "FECHA", "DOC", "TEXTO"],
      ["2026", "05/02/2026", "1000765432", "05001"],
      ["2025", "", "1.5", "2"],
    ]);
  });

  it("lee un CSV desde File", async () => {
    const archivo = new File(["A;B\n1;2\n"], "carga.csv");
    expect(await motor.leerArchivo(archivo)).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });
});

/* =============================================================================
   Reportes Institucionales · pruebas de las PlantillaSpec REALES (snies/) con
   el motor real (motor/). Cada prueba lleva en su nombre la sección del manual.

   Los documentos, nombres y correos son inventados (1000000xxx, «Prueba»):
   ningún dato personal real entra al repositorio.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import type { Contexto, ErrorFila, Fila, ItemCatalogo } from "../tipos";
import { motor } from "../motor";
import { DOMINIOS } from "./dominios";
import { PLANTILLAS, plantilla } from "./plantillas";

const MATRICULADOS = plantilla("matriculados");
const GRADUADOS = plantilla("graduados");
const PARTICIPANTE = plantilla("participante");
const INSCRITOS = plantilla("inscritos");
const INSCRITOS_PROGRAMA = plantilla("inscritos_programa");
const ADMITIDOS = plantilla("admitidos");
const PRIMER_CURSO = plantilla("primer_curso");

const mun = (codigo: string, nombre: string, departamento: string): ItemCatalogo => ({
  catalogo: "municipio",
  codigo,
  nombre,
  departamento,
  activo: true,
});
const pais = (codigo: string, nombre: string): ItemCatalogo => ({ catalogo: "pais", codigo, nombre, activo: true });
const prog = (codigo: string, nombre: string, oferta: string[]): ItemCatalogo => ({
  catalogo: "programa",
  codigo,
  nombre,
  oferta,
  activo: true,
});

function contexto(cruces: Partial<Contexto["cruces"]> = {}): Contexto {
  return {
    periodo: { anio: 2026, semestre: 2 },
    catalogos: {
      municipio: [
        mun("68001", "Bucaramanga", "Santander"),
        mun("54001", "Cúcuta", "Norte de Santander"),
        mun("20001", "Valledupar", "Cesar"),
        mun("68307", "Girón", "Santander"),
        mun("54498", "Ocaña", "Norte de Santander"),
        mun("68081", "Barrancabermeja", "Santander"),
        mun("11001", "Bogotá D.C.", "Bogotá D.C."),
      ],
      pais: [pais("170", "Colombia"), pais("862", "Venezuela"), pais("218", "Ecuador")],
      programa: [
        prog("1001", "Medicina", ["68001", "54001"]),
        prog("1002", "Enfermería", ["68001", "20001", "68081"]),
        prog("1003", "Derecho", ["11001"]),
      ],
    },
    dominios: DOMINIOS,
    cruces: {
      participantes: new Set(["1000000001", "1000000002"]),
      matriculados: new Set(["1000000001|1001"]),
      graduados: new Map(),
      inscritos: new Set(),
      inscritosPrograma: new Set(),
      admitidos: new Set(),
      primerCurso: new Set(),
      ...cruces,
    },
  };
}

const matricula = (extra: Fila = {}): Fila => ({
  "AÑO": "2026",
  SEMESTRE: "Segundo semestre",
  ID_TIPO_DOCUMENTO: "Cédula de ciudadanía",
  NUM_DOCUMENTO: "1000000001",
  CODIGO_ESTUDIANTE: "E0001",
  PRO_CONSECUTIVO: "Medicina",
  ID_MUNICIPIO: "Bucaramanga (Santander)",
  ID_PAIS_NACIMIENTO: "Colombia",
  ID_MUNICIPIO_NACIMIENTO: "Girón (Santander)",
  ID_ZONA_RESIDENCIA: "Urbana",
  ES_REINTEGRO_ESTUDIANTE_ANTES_DE_1998: "No",
  EMAIL_PERSONAL: "estudiante.prueba@ejemplo.com",
  ...extra,
});

const grado = (extra: Fila = {}): Fila => ({
  "AÑO": "2026",
  SEMESTRE: "Segundo semestre",
  ID_TIPO_DOCUMENTO: "Cédula de ciudadanía",
  NUM_DOCUMENTO: "1000000001",
  PRO_CONSECUTIVO: "Medicina",
  ID_MUNICIPIO: "Cúcuta (Norte de Santander)",
  TELEFONO_CONTACTO: "3001234567",
  NUMERO_ACTA_GRADO: "A-100",
  FECHA_GRADO: "15/08/2026",
  NUM_FOLIO: "12",
  ...extra,
});

const participante = (extra: Fila = {}): Fila => ({
  ID_TIPO_DOCUMENTO: "Cédula de ciudadanía",
  NUM_DOCUMENTO: "1000000001",
  PRIMER_NOMBRE: "Prueba",
  PRIMER_APELLIDO: "Ejemplo",
  ID_SEXO_BIOLOGICO: "Mujer",
  ID_ESTADO_CIVIL: "Soltero(a)",
  FECHA_NACIMIENTO: "01/02/2004",
  ID_PAIS: "Colombia",
  ID_MUNICIPIO: "Ocaña (Norte de Santander)",
  ...extra,
});

const en = (errores: ErrorFila[], campo: string) => errores.filter((e) => e.campo === campo);

describe("PlantillaSpec · coherencia con el contrato", () => {
  it("toda fuente de dominio existe en DOMINIOS (§3.1.1, §3.4.7, §3.4.8)", () => {
    for (const p of PLANTILLAS) {
      for (const c of p.campos) {
        if (c.fuente?.tipo === "dominio") expect(DOMINIOS[c.fuente.dominio], `${p.id}.${c.codigo}`).toBeDefined();
      }
    }
  });
  it("las disponibles usan NUM_DOCUMENTO y (salvo Participante §3.1.1 y Relación de inscritos §3.4.1) PRO_CONSECUTIVO, claves de ri_cruces", () => {
    for (const p of PLANTILLAS.filter((x) => x.disponible)) {
      const codigos = p.campos.map((c) => c.codigo);
      expect(codigos).toContain("NUM_DOCUMENTO");
      if (p.id === "participante" || p.id === "inscritos") expect(codigos).not.toContain("PRO_CONSECUTIVO");
      else expect(codigos, p.id).toContain("PRO_CONSECUTIVO");
    }
  });
});

describe("§3.4.7 Matriculados", () => {
  it("§3.4.7 una fila completa y correcta no da errores", () => {
    expect(motor.validarPlantilla(MATRICULADOS, [matricula()], contexto())).toEqual([]);
  });

  it("§3.4.7 documento con puntos: se marca y «Quitar puntos» lo arregla", () => {
    const ctx = contexto();
    const errores = motor.validarPlantilla(MATRICULADOS, [matricula({ NUM_DOCUMENTO: "1.000.000.001" })], ctx);
    const e = en(errores, "NUM_DOCUMENTO");
    expect(e).toHaveLength(1);
    expect(e[0].arreglo?.etiqueta).toBe("Quitar puntos");
    const arreglada = { ...matricula({ NUM_DOCUMENTO: "1.000.000.001" }), ...e[0].arreglo!.cambios } as Fila;
    expect(arreglada.NUM_DOCUMENTO).toBe("1000000001");
    expect(motor.validarPlantilla(MATRICULADOS, [arreglada], ctx)).toEqual([]);
  });

  it("§3.4.7 municipio de nacimiento con país Venezuela: se pide dejarlo vacío", () => {
    const errores = motor.validarPlantilla(MATRICULADOS, [matricula({ ID_PAIS_NACIMIENTO: "Venezuela" })], contexto());
    const e = en(errores, "ID_MUNICIPIO_NACIMIENTO");
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/Venezuela/);
    expect(e[0].arreglo?.cambios).toEqual({ ID_MUNICIPIO_NACIMIENTO: "" });
  });

  it("§3.4.7 reintegro antes de 1998 = Sí sin año de primer curso", () => {
    const errores = motor.validarPlantilla(
      MATRICULADOS,
      [matricula({ ES_REINTEGRO_ESTUDIANTE_ANTES_DE_1998: "Sí" })],
      contexto(),
    );
    expect(en(errores, "AÑO_PRIMER_CURSO")).toHaveLength(1);
    expect(en(errores, "SEMESTRE_PRIMER_CURSO")).toHaveLength(1);
  });

  it("§3.4.7 zona «Urbano» no está en el dominio (es «Urbana»)", () => {
    const errores = motor.validarPlantilla(MATRICULADOS, [matricula({ ID_ZONA_RESIDENCIA: "Urbano" })], contexto());
    const e = en(errores, "ID_ZONA_RESIDENCIA");
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/no está en el catálogo/);
  });

  it("§3.4.7 programa no ofrecido en el municipio (Medicina en Valledupar)", () => {
    const errores = motor.validarPlantilla(
      MATRICULADOS,
      [matricula({ ID_MUNICIPIO: "Valledupar (Cesar)" })],
      contexto(),
    );
    const e = en(errores, "ID_MUNICIPIO");
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/registro calificado/);
  });

  it("§3.4.7 correo sin dominio", () => {
    const errores = motor.validarPlantilla(MATRICULADOS, [matricula({ EMAIL_PERSONAL: "estudiante.prueba@" })], contexto());
    expect(en(errores, "EMAIL_PERSONAL")).toHaveLength(1);
    const sinPunto = motor.validarPlantilla(MATRICULADOS, [matricula({ EMAIL_PERSONAL: "prueba@ejemplo" })], contexto());
    expect(en(sinPunto, "EMAIL_PERSONAL")).toHaveLength(1);
  });

  it("§3.4.7 / §3.1.1 cruce: documento que no está en Participante", () => {
    const errores = motor.validarPlantilla(MATRICULADOS, [matricula({ NUM_DOCUMENTO: "1000000099" })], contexto());
    const e = en(errores, "NUM_DOCUMENTO");
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/no está en Participante/);
    // validarCeldas no corre cruces
    expect(motor.validarCeldas(MATRICULADOS, [matricula({ NUM_DOCUMENTO: "1000000099" })], contexto())).toEqual([]);
  });

  it("§3.4.7 el mismo estudiante dos veces en el mismo programa (aunque uno lleve puntos)", () => {
    const errores = motor.validarPlantilla(
      MATRICULADOS,
      [matricula(), matricula({ NUM_DOCUMENTO: "1.000.000.001", ID_MUNICIPIO: "Cúcuta (Norte de Santander)" })],
      contexto(),
    );
    const repetido = errores.filter((e) => e.fila === 1 && /fila 1/.test(e.mensaje));
    expect(repetido).toHaveLength(1);
    // En otro programa no es repetido
    const otro = motor.validarPlantilla(
      MATRICULADOS,
      [matricula(), matricula({ PRO_CONSECUTIVO: "Enfermería" })],
      contexto(),
    );
    expect(otro).toEqual([]);
  });

  it("§3.4.7 exportar: los nombres salen como códigos (68001, 170, CC, 1)", () => {
    const [cabeza, fila] = motor.exportar(MATRICULADOS, [matricula()], contexto());
    const col = (c: string) => fila[cabeza.indexOf(c)];
    expect(cabeza).toEqual(MATRICULADOS.campos.map((c) => c.codigo));
    expect(col("ID_MUNICIPIO")).toBe("68001");
    expect(col("ID_PAIS_NACIMIENTO")).toBe("170");
    expect(col("ID_MUNICIPIO_NACIMIENTO")).toBe("68307");
    expect(col("ID_TIPO_DOCUMENTO")).toBe("CC");
    expect(col("ID_ZONA_RESIDENCIA")).toBe("1");
    expect(col("SEMESTRE")).toBe("2");
    expect(col("PRO_CONSECUTIVO")).toBe("1001");
    expect(col("ES_REINTEGRO_ESTUDIANTE_ANTES_DE_1998")).toBe("N");
  });
});

describe("§3.4.8 Graduados", () => {
  it("§3.4.8 una fila correcta no da errores", () => {
    expect(motor.validarPlantilla(GRADUADOS, [grado()], contexto())).toEqual([]);
  });

  it("§3.4.8 graduado sin matrícula previa en el programa", () => {
    const errores = motor.validarPlantilla(GRADUADOS, [grado({ NUM_DOCUMENTO: "1000000002" })], contexto());
    const e = en(errores, "NUM_DOCUMENTO");
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/matriculado/);
  });

  it("§3.4.8 ya graduado del mismo programa en otro periodo", () => {
    const ctx = contexto({ graduados: new Map([["1000000001|1001", "2024-1"]]) });
    const errores = motor.validarPlantilla(GRADUADOS, [grado()], ctx);
    const e = en(errores, "NUM_DOCUMENTO");
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/2024-1/);
    // En el mismo periodo que se reporta no es error
    const mismo = contexto({ graduados: new Map([["1000000001|1001", "2026-2"]]) });
    expect(motor.validarPlantilla(GRADUADOS, [grado()], mismo)).toEqual([]);
  });
});

describe("§3.1.1 Participante", () => {
  it("§3.1.1 una fila correcta no da errores", () => {
    expect(motor.validarPlantilla(PARTICIPANTE, [participante()], contexto())).toEqual([]);
  });

  it("§3.1.1 documento repetido en la hoja (con y sin puntos)", () => {
    const errores = motor.validarPlantilla(
      PARTICIPANTE,
      [participante(), participante({ NUM_DOCUMENTO: "1.000.000.001", PRIMER_NOMBRE: "Otra" })],
      contexto(),
    );
    const rep = errores.filter((e) => e.fila === 1 && /ya está en la fila 1/.test(e.mensaje));
    expect(rep).toHaveLength(1);
  });

  it("§3.1.1 nacido en Colombia sin municipio de nacimiento", () => {
    const errores = motor.validarPlantilla(PARTICIPANTE, [participante({ ID_MUNICIPIO: "" })], contexto());
    expect(en(errores, "ID_MUNICIPIO")).toHaveLength(1);
  });

  it("§3.1.1 exportar Participante: país 170, municipio 54498, CC, sexo 2", () => {
    const [cabeza, fila] = motor.exportar(PARTICIPANTE, [participante()], contexto());
    const col = (c: string) => fila[cabeza.indexOf(c)];
    expect(col("ID_PAIS")).toBe("170");
    expect(col("ID_MUNICIPIO")).toBe("54498");
    expect(col("ID_TIPO_DOCUMENTO")).toBe("CC");
    expect(col("ID_SEXO_BIOLOGICO")).toBe("2");
    expect(col("ID_ESTADO_CIVIL")).toBe("1");
  });
});

/* ---------- Población estudiantil: ingreso ---------- */

const base = (extra: Fila = {}): Fila => ({
  "AÑO": "2026",
  SEMESTRE: "Segundo semestre",
  ID_TIPO_DOCUMENTO: "Tarjeta de identidad",
  NUM_DOCUMENTO: "1000000003",
  ...extra,
});

const inscrito = (extra: Fila = {}): Fila =>
  base({ PRIMER_NOMBRE: "Prueba", PRIMER_APELLIDO: "Ejemplo", ID_SEXO_BIOLOGICO: "Hombre", ...extra });

const primerCurso = (extra: Fila = {}): Fila =>
  base({
    PRO_CONSECUTIVO: "Medicina",
    ID_MUNICIPIO_PROGRAMA: "Cúcuta (Norte de Santander)",
    ID_TIPO_VINCULACION: "Nuevo",
    ID_GRUPO_ETNICO: "No pertenece",
    ID_PUEBLO_INDIGENA: "No aplica",
    ID_COMUNIDAD_NEGRA: "No aplica",
    PERSONA_CON_DISCAPACIDAD: "No",
    ID_TIPO_DISCAPACIDAD: "No aplica",
    ID_CAPACIDAD_EXCEPCIONAL: "No aplica",
    ...extra,
  });

/** El 1000000003 siguió todo el camino en 2026-2: participante, inscrito, inscrito a Medicina y admitido. */
const ingreso = (extra: Partial<Contexto["cruces"]> = {}) =>
  contexto({
    participantes: new Set(["1000000001", "1000000002", "1000000003"]),
    inscritos: new Set(["1000000003||2026-2"]),
    inscritosPrograma: new Set(["1000000003|1001|2026-2"]),
    admitidos: new Set(["1000000003|1001|2026-2"]),
    ...extra,
  });

describe("§3.4.1 Relación de inscritos", () => {
  it("§3.4.1 / §3.4.15 no exige Participante: un documento que no está allí es válido", () => {
    const ctx = ingreso({ participantes: new Set() });
    expect(motor.validarPlantilla(INSCRITOS, [inscrito()], ctx)).toEqual([]);
  });
  it("§3.4.1 la misma persona dos veces en la relación", () => {
    const errores = motor.validarPlantilla(INSCRITOS, [inscrito(), inscrito({ NUM_DOCUMENTO: "1.000.000.003" })], ingreso());
    expect(errores.filter((e) => e.fila === 1 && /ya está en la fila 1/.test(e.mensaje))).toHaveLength(1);
  });
});

describe("§3.4.2 Inscritos Programa", () => {
  const fila = (extra: Fila = {}) => base({ PRO_CONSECUTIVO: "Medicina", ID_MUNICIPIO: "Bucaramanga (Santander)", ...extra });
  it("§3.4.2 válido si está en la Relación de inscritos del periodo; «Sede» es el municipio", () => {
    expect(motor.validarPlantilla(INSCRITOS_PROGRAMA, [fila()], ingreso())).toEqual([]);
    expect(INSCRITOS_PROGRAMA.campos.find((c) => c.codigo === "ID_MUNICIPIO")?.etiqueta).toBe("Sede");
  });
  it("§3.4.2 sin estar en la Relación de inscritos del periodo", () => {
    const ctx = ingreso({ inscritos: new Set(["1000000003||2026-1"]) });
    const e = en(motor.validarPlantilla(INSCRITOS_PROGRAMA, [fila()], ctx), "NUM_DOCUMENTO");
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/Relación de inscritos de 2026-2/);
  });
  it("§3.4.2 / §3.4.15 no exige Participante", () => {
    expect(motor.validarPlantilla(INSCRITOS_PROGRAMA, [fila()], ingreso({ participantes: new Set() }))).toEqual([]);
  });
});

describe("§3.4.3 Admitidos", () => {
  const fila = (extra: Fila = {}) =>
    base({
      PRO_CONSECUTIVO: "Medicina",
      ID_MUNICIPIO_PROGRAMA: "Bucaramanga (Santander)",
      ID_BENEFICIARIO_LEY_VETERANOS: "No aplica",
      ...extra,
    });
  it("§3.4.3 válido si está inscrito al programa en el periodo", () => {
    expect(motor.validarPlantilla(ADMITIDOS, [fila()], ingreso())).toEqual([]);
  });
  it("§3.4.3 admitido sin inscripción a ese programa", () => {
    const e = en(motor.validarPlantilla(ADMITIDOS, [fila({ PRO_CONSECUTIVO: "Enfermería" })], ingreso()), "NUM_DOCUMENTO");
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/Inscritos Programa/);
  });
  it("§3.4.3 la sede es ID_MUNICIPIO_PROGRAMA y se cruza con la oferta", () => {
    const sede = ADMITIDOS.campos.find((c) => c.etiqueta === "Sede");
    expect(sede?.codigo).toBe("ID_MUNICIPIO_PROGRAMA");
    const e = en(motor.validarPlantilla(ADMITIDOS, [fila({ ID_MUNICIPIO_PROGRAMA: "Valledupar (Cesar)" })], ingreso()), "ID_MUNICIPIO_PROGRAMA");
    expect(e).toHaveLength(1);
  });
});

describe("§3.4.6 Primer curso", () => {
  it("§3.4.6 vinculación «Nuevo» inscrito y admitido: válido", () => {
    expect(motor.validarPlantilla(PRIMER_CURSO, [primerCurso()], ingreso())).toEqual([]);
  });
  it("§3.4.6 / §3.4.1 vinculación «Nuevo» sin admisión: error", () => {
    const e = en(motor.validarPlantilla(PRIMER_CURSO, [primerCurso()], ingreso({ admitidos: new Set() })), "NUM_DOCUMENTO");
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/Admitidos/);
  });
  it("§3.4.6 transferencia interna sin matrícula previa en otro programa: error", () => {
    const fila = primerCurso({ ID_TIPO_VINCULACION: "Transferencia interna" });
    const e = en(motor.validarPlantilla(PRIMER_CURSO, [fila], ingreso({ matriculados: new Set(["1000000003|1001"]) })), "ID_TIPO_VINCULACION");
    expect(e).toHaveLength(1);
    // Con matrícula previa en Enfermería sí vale
    const ok = ingreso({ matriculados: new Set(["1000000003|1002"]) });
    expect(motor.validarPlantilla(PRIMER_CURSO, [fila], ok)).toEqual([]);
  });
  it("§3.4.6 exige Participante", () => {
    const e = en(motor.validarPlantilla(PRIMER_CURSO, [primerCurso()], ingreso({ participantes: new Set() })), "NUM_DOCUMENTO");
    expect(e.some((x) => /Participante/.test(x.mensaje))).toBe(true);
  });
  it("§3.4.6 la sede es ID_MUNICIPIO_PROGRAMA", () => {
    expect(PRIMER_CURSO.campos.find((c) => c.etiqueta === "Sede")?.codigo).toBe("ID_MUNICIPIO_PROGRAMA");
  });
  it("§3.4.6 exportar Primer curso: los nombres salen como códigos", () => {
    const [cabeza, fila] = motor.exportar(PRIMER_CURSO, [primerCurso()], ingreso());
    const col = (c: string) => fila[cabeza.indexOf(c)];
    expect(cabeza).toEqual(PRIMER_CURSO.campos.map((c) => c.codigo));
    expect(col("SEMESTRE")).toBe("2");
    expect(col("ID_TIPO_DOCUMENTO")).toBe("TI");
    expect(col("PRO_CONSECUTIVO")).toBe("1001");
    expect(col("ID_MUNICIPIO_PROGRAMA")).toBe("54001");
    expect(col("ID_TIPO_VINCULACION")).toBe("1");
    expect(col("ID_GRUPO_ETNICO")).toBe("4");
    expect(col("ID_PUEBLO_INDIGENA")).toBe("0");
    expect(col("PERSONA_CON_DISCAPACIDAD")).toBe("2");
  });
});

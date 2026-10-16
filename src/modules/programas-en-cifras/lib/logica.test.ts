/* Lógica pura de Programas en Cifras: validación (la del prototipo aprobado),
   catálogo de destinos, emparejamiento y cobertura, inferencia desde Excel,
   ruta de periodos, permisos (espejo del SQL) y reglas de «Emitir». */

import { describe, expect, it } from "vitest";
import { PLANTILLAS } from "../../reportes/snies/plantillas";
import type { Columna, EstadoPeriodos, Yo } from "../tipos";
import {
  autoMap,
  avisosDeDominio,
  columnasIniciales,
  cobertura,
  coberturaCuadroMaestro,
  destino,
  DESTINOS,
  DESTINOS_CNA,
  DESTINOS_SNIES,
  DOMINIOS_PC,
  dominio,
  etiquetaSistema,
  nombreCorto,
  opcionEmitida,
  parecido,
  sugerirDestino,
} from "./destinos";
import { cuadrosAutomaticos, cuadrosConArchivo, nombreArchivoEmitido, revisarEmision, valoresDe, type ArchivoParaEmitir, type EntradaEmision } from "./emision-checks";
import { ampliarOpciones, claveDeEncabezado, columnasDesdeMatriz, filaDeEncabezado, inferirTipo } from "./inferencia";
import {
  ANIOS_VENTANA,
  analizarPeriodo,
  codigoPeriodo,
  esCodigoPeriodo,
  estadoPeriodos,
  etiquetaPeriodo,
  periodosDeVentana,
  porAnio,
  puedeCerrar,
  siguientePorCerrar,
  ultimoSemestreTerminado,
  ventanaCompatible,
  ventanaPorDefecto,
} from "./periodos";
import {
  columnaEditable,
  estadoTrasEditar,
  esMiembro,
  motivoNoEdita,
  motivoNoListo,
  puedeCambiarEstructura,
  puedeDesconectar,
  puedeEditar,
  puedeEditarCelda,
  puedeEliminarArchivo,
  puedeNombrar,
  puedeVer,
  puedeVolverABorrador,
  rolEn,
} from "./permisos";
import { contarErrores, errorDeCelda, errorDeValor, fechaIsoValida, leerFila, leerValor, puedeMarcarseListo, validarArchivo, validarFila, validarForma } from "./validacion";

const col = (clave: string, etiqueta: string, tipo: Columna["tipo"], extra: Partial<Columna> = {}): Columna => ({ clave, etiqueta, tipo, obligatorio: false, opciones: [], ...extra });

/* ---------- validación: los casos del prototipo ---------------------------------- */

describe("validación", () => {
  const tipoProy = ["Investigación", "Creación", "Innovación", "Proyección social"];

  it("obligatorio, número, porcentaje, fecha y lista, con los mismos mensajes que la base", () => {
    expect(errorDeValor({ tipo: "texto", opciones: [], obligatorio: true }, "  ")).toBe("Obligatorio");
    expect(errorDeValor({ tipo: "texto", opciones: [], obligatorio: false }, null)).toBe("");
    expect(errorDeValor({ tipo: "numero", opciones: [], obligatorio: false }, "12,5")).toBe("");
    expect(errorDeValor({ tipo: "numero", opciones: [], obligatorio: false }, 12)).toBe("");
    expect(errorDeValor({ tipo: "numero", opciones: [], obligatorio: false }, "doce")).toBe("Escriba un número");
    expect(errorDeValor({ tipo: "numero", opciones: [], obligatorio: false }, "-3")).toBe("Escriba un número");
    expect(errorDeValor({ tipo: "porcentaje", opciones: [], obligatorio: false }, "100")).toBe("");
    expect(errorDeValor({ tipo: "porcentaje", opciones: [], obligatorio: false }, "100,5")).toBe("Entre 0 y 100");
    expect(errorDeValor({ tipo: "porcentaje", opciones: [], obligatorio: false }, 47.5)).toBe("");
    expect(errorDeValor({ tipo: "fecha", opciones: [], obligatorio: false }, "2026-02-30")).toBe("Use AAAA-MM-DD");
    expect(errorDeValor({ tipo: "fecha", opciones: [], obligatorio: false }, "2026-02-28")).toBe("");
    expect(errorDeValor({ tipo: "fecha", opciones: [], obligatorio: false }, "28/02/2026")).toBe("Use AAAA-MM-DD");
    expect(errorDeValor({ tipo: "lista", opciones: tipoProy, obligatorio: false }, "Z")).toBe("Elija de la lista");
    expect(errorDeValor({ tipo: "lista", opciones: tipoProy, obligatorio: false }, "Creación")).toBe("");
    expect(errorDeValor({ tipo: "lista", opciones: [], obligatorio: false }, "lo que sea")).toBe("");
    expect(fechaIsoValida("2024-02-29")).toBe(true);
    expect(fechaIsoValida("2025-02-29")).toBe(false);
  });

  it("fin ≥ inicio (cuadro 08): el fin anterior al inicio es error de la celda del fin", () => {
    const c08 = DESTINOS_CNA.find((d) => d.id === "cna08")!;
    const cols = columnasIniciales(c08);
    const fila = { proyecto: "Laboratorio de IoT", tipo_proyecto: "Innovación", inicio: "2025-06-10", fin: "2025-01-30" };
    const errores = validarFila(cols, fila, 3);
    expect(errores).toEqual([{ fila: 3, columna: "fin", mensaje: "Es anterior a «Inicio»" }]);
    expect(errorDeCelda(cols, { ...fila, fin: "2025-06-10" }, cols.find((c) => c.clave === "fin")!)).toBe("");
    // Sin inicio válido no se compara.
    expect(errorDeCelda(cols, { ...fila, inicio: "mañana" }, cols.find((c) => c.clave === "fin")!)).toBe("");
  });

  it("el prototipo: Z en la categoría de un grupo y un campo obligatorio vacío cuentan como errores", () => {
    const cols = columnasIniciales(DESTINOS_CNA.find((d) => d.id === "cna07")!);
    const filas = [
      { grupo: "Grupo de Software", codigo_grupo: "COL0054321", categoria_957_2024: "B" },
      { grupo: "Grupo de Redes y Seguridad", codigo_grupo: "COL0099002", categoria_957_2024: "Z" },
      { grupo: "Sin código", codigo_grupo: "", categoria_957_2024: "A" },
    ];
    const r = validarArchivo(cols, filas);
    expect(r.errores.map((e) => [e.fila, e.columna, e.mensaje])).toEqual([
      [2, "categoria_957_2024", "Elija de la lista"],
      [3, "codigo_grupo", "Obligatorio"],
    ]);
    expect([r.total, r.filasConError]).toEqual([2, 2]);
    expect(puedeMarcarseListo(cols, filas)).toBe(false);
    expect(contarErrores(cols, [filas[0]])).toBe(0);
    expect(puedeMarcarseListo(cols, [filas[0]])).toBe(true);
  });

  it("las columnas de solo lectura no se validan (la persona no puede corregirlas)", () => {
    const cols = columnasIniciales(DESTINOS_CNA.find((d) => d.id === "cna04")!);
    const fila = { cedula: "", nombres: "", tipo_contratacion: "Indefinido TC", horas_docencia: "x", nivel_formacion: "Doctorado", enlace_cvlac: "https://orcid.org/0000", horas_investigacion: 6 };
    expect(validarFila(cols, fila, 1)).toEqual([]);
  });

  it("la forma que la base exige siempre: objeto, columnas que existen, texto o número", () => {
    const cols = [col("a", "A", "texto"), col("b", "B", "numero")];
    expect(validarForma(cols, { a: "x", b: 2 })).toBeNull();
    expect(validarForma(cols, { a: "x", zz: 1 })).toMatch(/no existe/);
    expect(validarForma(cols, { a: { x: 1 } })).toMatch(/texto o número/);
    expect(validarForma(cols, { a: null, b: "no es número pero se guarda" })).toBeNull();
    expect(validarForma(cols, [])).toMatch(/objeto/);
    expect(validarForma(cols, { a: "x".repeat(4001) })).toMatch(/demasiado largo/);
  });

  it("lleva lo escrito a lo que se guarda: números, fechas, opciones y texto recortado", () => {
    expect(leerValor({ tipo: "numero", opciones: [], etiqueta: "N" }, "2,5")).toEqual({ valor: 2.5 });
    expect(leerValor({ tipo: "numero", opciones: [], etiqueta: "N" }, "dos").error).toMatch(/número válido/);
    expect(leerValor({ tipo: "porcentaje", opciones: [], etiqueta: "P" }, "120").error).toMatch(/entre 0 y 100/);
    expect(leerValor({ tipo: "fecha", opciones: [], etiqueta: "F" }, "5/1/2026")).toEqual({ valor: "2026-01-05" });
    expect(leerValor({ tipo: "fecha", opciones: [], etiqueta: "F" }, new Date(Date.UTC(2026, 0, 5)))).toEqual({ valor: "2026-01-05" });
    expect(leerValor({ tipo: "lista", opciones: ["Hombre", "Mujer"], etiqueta: "S" }, " mujer ")).toEqual({ valor: "Mujer" });
    expect(leerValor({ tipo: "lista", opciones: ["Hombre", "Mujer"], etiqueta: "S" }, "Otro").error).toMatch(/no es una opción/);
    expect(leerValor({ tipo: "texto", opciones: [], etiqueta: "T" }, "  hola ")).toEqual({ valor: "hola" });
    expect(leerValor({ tipo: "texto", opciones: [], etiqueta: "T" }, "")).toEqual({ valor: null });
    const { datos, errores } = leerFila([col("n", "N", "numero"), col("t", "T", "texto")], { n: "3", t: " x ", otra: "y" });
    expect(datos).toEqual({ n: 3, t: "x" });
    expect(errores).toEqual([]);
  });
});

/* ---------- destinos ------------------------------------------------------------------------ */

describe("destinos", () => {
  it("el catálogo trae los cuadros 01–10 del CNA y las plantillas SNIES que ya se capturan", () => {
    expect(DESTINOS_CNA.map((d) => d.cuadro)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
    expect(DESTINOS_SNIES.map((d) => d.plantilla)).toEqual(PLANTILLAS.filter((p) => p.campos.length).map((p) => p.id));
    expect(DESTINOS_SNIES.map((d) => d.id)).toContain("snies_participante");
    expect(DESTINOS_SNIES.map((d) => d.id)).toContain("snies_graduados");
    expect(DESTINOS_SNIES.map((d) => d.id)).not.toContain("snies_docentes");
  });

  it("las claves son válidas para la base, únicas por destino, y los dominios y fechas existen", () => {
    for (const d of DESTINOS) {
      const claves = d.columnas.map((c) => c.clave);
      expect(new Set(claves).size, d.id).toBe(claves.length);
      for (const c of d.columnas) {
        expect(c.clave, `${d.id}.${c.clave}`).toMatch(/^[a-z][a-z0-9_]{0,62}$/);
        if (c.dominio) expect(dominio(c.dominio), `${d.id}.${c.clave}`).not.toBeNull();
        if (c.tipo === "lista") expect(c.dominio, `${d.id}.${c.clave}`).toBeTruthy();
        if (c.posterior_a) expect(claves).toContain(c.posterior_a);
      }
    }
    expect(new Set(DOMINIOS_PC.map((d) => d.id)).size).toBe(DOMINIOS_PC.length);
  });

  it("los cuadros 02, 03, 05 y 06 los llena el sistema; 04, 07, 08, 09 y 10 bloquean su estructura; solo el 10 es de salud", () => {
    expect(cuadrosAutomaticos().map((d) => d.cuadro)).toEqual(["02", "03", "05", "06"]);
    expect(DESTINOS_CNA.filter((d) => d.estructura_bloqueada).length).toBe(10);
    expect(DESTINOS_SNIES.every((d) => !d.estructura_bloqueada)).toBe(true);
    expect(DESTINOS_CNA.filter((d) => d.solo_salud).map((d) => d.cuadro)).toEqual(["10"]);
    expect(cuadrosConArchivo(DESTINOS, false).map((d) => d.cuadro)).toEqual(["01", "04", "07", "08", "09"]);
    expect(cuadrosConArchivo(DESTINOS, true).map((d) => d.cuadro)).toEqual(["01", "04", "07", "08", "09", "10"]);
    const cna04 = destino("cna04")!;
    expect(cna04.columnas.filter((c) => c.solo_lectura).map((c) => c.clave)).toEqual(["cedula", "nombres", "tipo_contratacion", "tipo_dedicacion", "horas_docencia"]);
    expect(destino("cna08")!.columnas.find((c) => c.clave === "fin")?.posterior_a).toBe("inicio");
    expect(nombreCorto(destino("cna07")!)).toBe("Grupos y líneas");
    expect(etiquetaSistema(destino("cna07")!)).toBe("CNA · 07");
    expect(etiquetaSistema(destino("snies_graduados")!)).toBe("SNIES · Graduados");
  });

  it("el CNA numera sus listas al emitir («2. Maestría»); las del SNIES no", () => {
    const nivel = dominio("nivel_formacion")!;
    expect(opcionEmitida(nivel, "Maestría")).toBe("2. Maestría");
    expect(opcionEmitida(dominio("categoria_minciencias")!, "A1")).toBe("A1");
    expect(opcionEmitida(nivel, "Inexistente")).toBe("Inexistente");
  });

  it("autoMap propone el emparejamiento del prototipo: el Excel de grupos y el de participantes", () => {
    const grupos = [
      { clave: "g", etiqueta: "Grupo" },
      { clave: "c", etiqueta: "Código grupo" },
      { clave: "cat", etiqueta: "Categoría 957 de 2024" },
      { clave: "l", etiqueta: "Líneas de investigación" },
    ];
    expect(autoMap(grupos, destino("cna07")!)).toEqual({ grupo: "g", codigo_grupo: "c", categoria_957_2024: "cat", lineas: "l" });

    const personas = [
      { clave: "td", etiqueta: "Tipo de documento" },
      { clave: "nd", etiqueta: "Documento" },
      { clave: "pn", etiqueta: "Nombre" },
      { clave: "pa", etiqueta: "Apellido" },
      { clave: "sx", etiqueta: "Sexo" },
      { clave: "ps", etiqueta: "País de nacimiento" },
    ];
    const m = autoMap(personas, destino("snies_participante")!);
    expect(m.num_documento ?? m.numero_documento).toBe("nd");
    expect(Object.values(m).sort()).toEqual(expect.arrayContaining(["td", "pn", "pa", "ps"]));
    // Una columna del archivo no se usa dos veces.
    expect(new Set(Object.values(m)).size).toBe(Object.values(m).length);
  });

  it("autoMap no confunde el tipo de documento con el número de documento", () => {
    const cols = [
      { clave: "a", etiqueta: "Tipo de documento" },
      { clave: "b", etiqueta: "Número de documento" },
    ];
    const m = autoMap(cols, destino("snies_graduados")!);
    expect(m.id_tipo_documento ?? m.tipo_documento).toBe("a");
    expect(m.num_documento ?? m.numero_documento).toBe("b");
  });

  it("parecido: igual 3, sinónimo 2,5, contiene entre 2 y 2,4, nada 0", () => {
    const c = destino("cna04")!.columnas.find((x) => x.clave === "cedula")!;
    expect(parecido("Cédula / identificación", c)).toBe(3);
    expect(parecido("documento", c)).toBe(2.5);
    expect(parecido("Dirección del domicilio", c)).toBe(0);
    expect(parecido("Número de identificación del profesor", c)).toBeGreaterThanOrEqual(2);
    expect(parecido("", c)).toBe(0);
  });

  it("cobertura = columnas mapeadas / columnas del destino", () => {
    const d = destino("cna07")!;
    expect(cobertura({ grupo: "g", codigo_grupo: "c" }, d)).toEqual({ n: 2, t: 8, pct: 25 });
    expect(cobertura({}, d).pct).toBe(0);
    expect(cobertura(null, d).n).toBe(0);
    // Una columna borrada del archivo ya no cuenta.
    expect(cobertura({ grupo: "g", codigo_grupo: "c" }, d, [{ clave: "g" }]).n).toBe(1);
  });

  it("cobertura del Cuadro Maestro: los cuadros automáticos cuentan completos y de los demás, el mejor archivo", () => {
    const sola = coberturaCuadroMaestro([]);
    const auto = DESTINOS_CNA.filter((d) => d.automatico).reduce((s, d) => s + d.columnas.length, 0);
    const sinSalud = DESTINOS_CNA.filter((d) => !d.solo_salud).reduce((s, d) => s + d.columnas.length, 0);
    expect(sola).toEqual({ n: auto, t: sinSalud, pct: Math.round((auto / sinSalud) * 100) });
    const con = coberturaCuadroMaestro([
      { destino_id: "cna07", mapa: { grupo: "g" } },
      { destino_id: "cna07", mapa: { grupo: "g", codigo_grupo: "c", lineas: "l" } },
    ]);
    expect(con.n).toBe(auto + 3);
    expect(coberturaCuadroMaestro([], { salud: true }).t).toBe(sinSalud + destino("cna10")!.columnas.length);
  });

  it("avisos de dominio: los valores que no están en la lista del CNA", () => {
    const d = destino("cna08")!;
    const avisos = avisosDeDominio(d, { tipo_proyecto: "tip" }, [{ tip: "Investigación" }, { tip: "Extensión" }, { tip: "Extensión" }, { tip: "" }]);
    expect(avisos).toEqual(["2 valores de «Tipo de proyecto o actividad» no están en la lista del CNA (por ejemplo «Extensión»)."]);
    expect(avisosDeDominio(d, { tipo_proyecto: "tip" }, [{ tip: "Creación" }])).toEqual([]);
    expect(avisosDeDominio(d, {}, [{ tip: "x" }])).toEqual([]);
  });

  it("sugerirDestino dice a qué columna del CNA o del SNIES se parece una columna suelta", () => {
    expect(sugerirDestino("Nombre del proyecto")?.destino.id).toBe("cna08");
    expect(sugerirDestino("Fecha de grado")?.destino.id).toBe("snies_graduados");
    expect(sugerirDestino("Color favorito")).toBeNull();
  });

  it("las columnas iniciales de un archivo copian el destino con sus listas", () => {
    const cols = columnasIniciales(destino("cna08")!);
    expect(cols.find((c) => c.clave === "tipo_proyecto")?.opciones).toContain("Proyección social");
    expect(cols.find((c) => c.clave === "fin")).toMatchObject({ posterior_a: "inicio", obligatorio: true });
    expect(cols.map((c) => c.orden)).toEqual(cols.map((_, i) => i + 1));
  });
});

/* ---------- inferencia ---------------------------------------------------------------------- */

describe("inferencia desde Excel", () => {
  it("fechas, números, porcentajes, listas y texto; los códigos y documentos son texto", () => {
    expect(inferirTipo("Inicio", ["2024-02-01", "2025-03-01"])).toEqual({ tipo: "fecha", opciones: [] });
    expect(inferirTipo("Inicio", [new Date(Date.UTC(2024, 1, 1)), "01/03/2025"])).toEqual({ tipo: "fecha", opciones: [] });
    expect(inferirTipo("Estudiantes", ["12", "3,5", 8])).toEqual({ tipo: "numero", opciones: [] });
    expect(inferirTipo("% de deserción", ["12", "40"])).toEqual({ tipo: "porcentaje", opciones: [] });
    expect(inferirTipo("% de deserción", ["12", "140"])).toEqual({ tipo: "numero", opciones: [] });
    expect(inferirTipo("Cédula", ["1098765432", "91234567"])).toEqual({ tipo: "texto", opciones: [] });
    expect(inferirTipo("Código SNIES", ["104523"])).toEqual({ tipo: "texto", opciones: [] });
    const tipos = ["Docencia-servicio", "Cooperación", "Movilidad", "Cooperación", "Movilidad", "Cooperación"];
    expect(inferirTipo("Tipo de convenio", tipos)).toEqual({ tipo: "lista", opciones: ["Docencia-servicio", "Cooperación", "Movilidad"] });
    expect(inferirTipo("Tipo", ["a", "b", "c"])).toEqual({ tipo: "texto", opciones: [] });
    expect(inferirTipo("Notas", [])).toEqual({ tipo: "texto", opciones: [] });
  });

  it("claves de columna válidas y únicas", () => {
    expect(claveDeEncabezado("Nº de créditos")).toBe("n_de_creditos");
    expect(claveDeEncabezado("2025 total")).toBe("c_2025_total");
    expect(claveDeEncabezado("???")).toBe("columna");
    expect(claveDeEncabezado("Fecha", ["fecha", "fecha_2"])).toBe("fecha_3");
  });

  it("de una matriz saca columnas con tipo y filas tipadas, (los repetidos reciben otra clave)", () => {
    const m = [
      [],
      ["Nombre del convenio", "Institución", "Tipo de convenio", "Fecha de inicio", "Estudiantes en práctica", "Estudiantes en práctica"],
      ["Docencia-servicio 2024", "Clínica Foscal", "Docencia-servicio", "2024-03-01", "24", "x"],
      ["Cooperación académica", "U. de Guadalajara", "Cooperación", "2023-12-15", "6", "1"],
      ["Prácticas sociales", "Alcaldía", "Cooperación", "2025-01-20", "12", "2"],
      ["Docencia-servicio 2025", "Hospital", "Docencia-servicio", "2025-02-10", "30", "3"],
      ["Movilidad entrante", "U. de Valencia", "Movilidad", "2025-05-12", "2", "4"],
      ["", "", "", "", "", ""],
    ];
    expect(filaDeEncabezado(m)).toBe(1);
    const r = columnasDesdeMatriz(m);
    expect(r.encabezado).toBe(1);
    expect(r.columnas.map((c) => [c.clave, c.tipo])).toEqual([
      ["nombre_del_convenio", "texto"],
      ["institucion", "texto"],
      ["tipo_de_convenio", "lista"],
      ["fecha_de_inicio", "fecha"],
      ["estudiantes_en_practica", "numero"],
      ["estudiantes_en_practica_2", "texto"],
    ]);
    expect(r.filas).toHaveLength(5);
    expect(r.filas[0]).toMatchObject({ fecha_de_inicio: "2024-03-01", estudiantes_en_practica: 24, estudiantes_en_practica_2: "x" });
    expect(r.errores).toEqual([]);
    expect(ampliarOpciones(["a"], ["a", "b", "", "b"])).toEqual(["a", "b"]);
  });
});

/* ---------- periodos ------------------------------------------------------------------------ */

describe("periodos", () => {
  it("la ventana de 5 años hasta 2025-02 va de 2021-01 a 2025-02, y las de 6, 8 y 10 crecen hacia atrás", () => {
    const p5 = periodosDeVentana({ anios: 5, hasta: "2025-02" });
    expect(p5).toEqual(["2021-01", "2021-02", "2022-01", "2022-02", "2023-01", "2023-02", "2024-01", "2024-02", "2025-01", "2025-02"]);
    expect(periodosDeVentana({ anios: 6, hasta: "2025-02" })[0]).toBe("2020-01");
    expect(periodosDeVentana({ anios: 8, hasta: "2026-01" })).toHaveLength(16);
    expect(periodosDeVentana({ anios: 10, hasta: "2026-01" })[0]).toBe("2016-02");
    expect(periodosDeVentana({ anios: 5, hasta: "2026-1" })).toEqual([]);
    expect(ANIOS_VENTANA).toEqual([5, 6, 8, 10]);
  });

  it("códigos AAAA-01 y AAAA-02", () => {
    expect(esCodigoPeriodo("2025-02")).toBe(true);
    expect(esCodigoPeriodo("2025-03")).toBe(false);
    expect(codigoPeriodo(2024, 1)).toBe("2024-01");
    expect(analizarPeriodo("2024-02")).toEqual({ anio: 2024, semestre: 2 });
    expect(etiquetaPeriodo("2024-02")).toBe("2024 · II");
    expect(porAnio(["2021-01", "2021-02", "2022-01"])).toEqual([
      { anio: 2021, periodos: ["2021-01", "2021-02"] },
      { anio: 2022, periodos: ["2022-01"] },
    ]);
  });

  it("la ventana por defecto termina en el último semestre ya terminado", () => {
    expect(ultimoSemestreTerminado("2026-10-16")).toBe("2026-01");
    expect(ultimoSemestreTerminado("2026-03-01")).toBe("2025-02");
    expect(ventanaPorDefecto("2026-10-16")).toEqual({ anios: 5, hasta: "2026-01" });
  });

  it("el estado: siguiente por cerrar, completa y conteo", () => {
    const v = { anios: 5, hasta: "2025-02" } as const;
    const abierta = estadoPeriodos(v, [{ codigo: "2021-01" }, { codigo: "2021-02" }]);
    expect([abierta.siguiente, abierta.cerrados, abierta.total, abierta.completa]).toEqual(["2022-01", 2, 10, false]);
    const todos = estadoPeriodos(v, periodosDeVentana(v).map((codigo) => ({ codigo })));
    expect([todos.siguiente, todos.completa]).toEqual([null, true]);
    expect(estadoPeriodos(null, [])).toMatchObject({ ventana: null, completa: false, total: 0 });
    expect(siguientePorCerrar(["a", "b"], ["a"])).toBe("b");
  });

  it("nunca se cierra un periodo si el anterior está abierto, ni uno ya cerrado, ni fuera de la ventana, ni con errores", () => {
    const e: EstadoPeriodos = estadoPeriodos({ anios: 5, hasta: "2025-02" }, [{ codigo: "2021-01" }]);
    expect(puedeCerrar("2021-02", e)).toEqual({ ok: true, motivo: null });
    expect(puedeCerrar("2022-01", e).motivo).toMatch(/cerrar primero el periodo 2021-02/);
    expect(puedeCerrar("2021-01", e).motivo).toMatch(/ya está cerrado/);
    expect(puedeCerrar("2030-01", e).motivo).toMatch(/no está en la ventana/);
    expect(puedeCerrar("2021-02", e, 2).motivo).toMatch(/Corrija los 2 errores/);
    expect(puedeCerrar("2021-02", estadoPeriodos(null, [])).motivo).toMatch(/Defina primero/);
  });

  it("cambiar la ventana solo si lo cerrado sigue siendo el comienzo de la ruta", () => {
    expect(ventanaCompatible({ anios: 6, hasta: "2026-02" }, ["2021-01", "2021-02"]).ok).toBe(true);
    expect(ventanaCompatible({ anios: 5, hasta: "2026-01" }, ["2021-01"]).ok).toBe(false);
    expect(ventanaCompatible({ anios: 5, hasta: "2026-01" }, []).ok).toBe(true);
  });
});

/* ---------- permisos ----------------------------------------------------------------------------- */

describe("permisos", () => {
  const yo = (extra: Partial<Yo> = {}): Yo => ({
    planeacion: false,
    programas: [
      { programa_id: "pA", campus_id: "bga", rol: "director", programa: "Sistemas", programa_codigo: "SIS", campus: "Bucaramanga" },
      { programa_id: "pA", campus_id: "cuc", rol: "coordinador", programa: "Sistemas", programa_codigo: "SIS", campus: "Cúcuta" },
    ],
    ...extra,
  });

  it("rolEn: lo propio por programa y campus; Planeación solo lee lo demás; el resto, nada", () => {
    expect(rolEn(yo(), "pA", "bga")).toBe("director");
    expect(rolEn(yo(), "pA", "cuc")).toBe("coordinador");
    expect(rolEn(yo(), "pA", "val")).toBeNull();
    expect(rolEn(yo(), "pB", "bga")).toBeNull();
    expect(rolEn(yo({ planeacion: true }), "pB", "bga")).toBe("planeacion");
    expect(rolEn(null, "pA", "bga")).toBeNull();
    expect(esMiembro(yo())).toBe(true);
    expect(esMiembro({ planeacion: false, programas: [] })).toBe(false);
    expect(esMiembro({ planeacion: true, programas: [] })).toBe(true);
  });

  it("solo el Director y el Coordinador editan; Planeación ve pero no edita", () => {
    expect(puedeEditar("director") && puedeEditar("coordinador")).toBe(true);
    expect(puedeEditar("planeacion")).toBe(false);
    expect(puedeEditar(null)).toBe(false);
    expect(puedeVer("planeacion")).toBe(true);
    expect(puedeVer(null)).toBe(false);
    expect(motivoNoEdita("planeacion")).toMatch(/solo observa/);
    expect(motivoNoEdita(null)).toMatch(/No tiene acceso/);
    expect(motivoNoEdita("director")).toBeNull();
  });

  it("estructura bloqueada de los cuadros del CNA y columnas de solo lectura", () => {
    const cna = { bloqueado: true, destino_origen: "cna07" };
    const libre = { bloqueado: false, destino_origen: null };
    expect(puedeCambiarEstructura("director", cna)).toBe(false);
    expect(puedeCambiarEstructura("director", libre)).toBe(true);
    expect(puedeCambiarEstructura("planeacion", libre)).toBe(false);
    expect(puedeEliminarArchivo("coordinador", cna)).toBe(false);
    expect(puedeEliminarArchivo("coordinador", libre)).toBe(true);
    expect(puedeDesconectar("director", cna, "cna07")).toBe(false);
    expect(puedeDesconectar("director", cna, "snies_graduados")).toBe(true);
    expect(columnaEditable({ solo_lectura: "Warehouse" })).toBe(false);
    expect(puedeEditarCelda("director", { solo_lectura: "Warehouse" })).toBe(false);
    expect(puedeEditarCelda("director", { solo_lectura: null })).toBe(true);
    expect(puedeEditarCelda("planeacion", { solo_lectura: null })).toBe(false);
  });

  it("borrador → listo solo sin errores; editar un archivo listo lo devuelve a borrador", () => {
    expect(motivoNoListo("director", "borrador", 0)).toBeNull();
    expect(motivoNoListo("director", "borrador", 1)).toMatch(/Corrija 1 celda/);
    expect(motivoNoListo("director", "borrador", 3)).toMatch(/Corrija 3 celdas/);
    expect(motivoNoListo("planeacion", "borrador", 0)).toMatch(/solo observa/);
    expect(motivoNoListo("director", "listo", 0)).toMatch(/ya está listo/);
    expect(estadoTrasEditar("listo")).toBe("borrador");
    expect(estadoTrasEditar("borrador")).toBe("borrador");
    expect(puedeVolverABorrador("coordinador", "listo")).toBe(true);
    expect(puedeVolverABorrador("coordinador", "borrador")).toBe(false);
  });

  it("la administración nombra a cualquiera; el Director, Coordinadores de su programa", () => {
    expect(puedeNombrar("director", { admin: true, rolEnElPrograma: null })).toBe(true);
    expect(puedeNombrar("coordinador", { admin: false, rolEnElPrograma: "director" })).toBe(true);
    expect(puedeNombrar("director", { admin: false, rolEnElPrograma: "director" })).toBe(false);
    expect(puedeNombrar("coordinador", { admin: false, rolEnElPrograma: "coordinador" })).toBe(false);
  });
});

/* ---------- emitir ---------------------------------------------------------------------------------- */

describe("emisión", () => {
  const completa = estadoPeriodos({ anios: 5, hasta: "2025-02" }, periodosDeVentana({ anios: 5, hasta: "2025-02" }).map((codigo) => ({ codigo })));
  const mapaIdentidad = (id: string) => Object.fromEntries(destino(id)!.columnas.map((c) => [c.clave, c.clave]));
  const archivo = (id: string, destinoId: string, filas: Record<string, string | number>[], estado: "listo" | "borrador" = "listo"): ArchivoParaEmitir => ({
    id,
    nombre: `Archivo ${destinoId}`,
    estado,
    filas,
    respuestas: [{ destino_id: destinoId, mapa: mapaIdentidad(destinoId) }],
  });
  const buenos = (): ArchivoParaEmitir[] => [
    archivo("a1", "cna01", [{ fecha_diligenciamiento: "2026-02-15", fecha_autoevaluacion: "2026-01-20" }]),
    archivo("a4", "cna04", [{ cedula: "1" }, { cedula: "2" }, { cedula: "3" }]),
    archivo("a7", "cna07", [{ grupo: "G" }]),
    archivo("a8", "cna08", [{ proyecto: "P" }]),
    archivo("a9", "cna09", [{ estrategia: "E" }]),
  ];
  const base = (extra: Partial<EntradaEmision> = {}): EntradaEmision => ({ periodos: completa, archivos: buenos(), profesoresUltimoPeriodo: 3, autorizacionDatos: true, ...extra });

  it("con todo en orden se puede emitir", () => {
    expect(revisarEmision(base())).toEqual({ puede: true, hallazgos: [] });
  });

  it("1 · ventana completa", () => {
    const r = revisarEmision(base({ periodos: estadoPeriodos({ anios: 5, hasta: "2025-02" }, [{ codigo: "2021-01" }]) }));
    expect(r.puede).toBe(false);
    expect(r.hallazgos[0]).toMatchObject({ regla: "ventana", nivel: "bloquea" });
    expect(r.hallazgos[0].mensaje).toMatch(/Faltan 9 periodos por cerrar \(sigue 2021-02\)/);
    expect(revisarEmision(base({ periodos: estadoPeriodos(null, []) })).hallazgos[0].mensaje).toMatch(/Defina la ventana/);
  });

  it("2 · cada cuadro con archivo y todos listos; el 10 solo en salud", () => {
    const sin8 = revisarEmision(base({ archivos: buenos().filter((a) => a.id !== "a8") }));
    expect(sin8.hallazgos.map((h) => h.mensaje)).toEqual(["Falta el archivo del Cuadro 08 · Proyectos y productos."]);
    const borrador = buenos();
    borrador[2] = { ...borrador[2], estado: "borrador" };
    const r = revisarEmision(base({ archivos: borrador }));
    expect(r.hallazgos).toEqual([{ regla: "archivos", nivel: "bloquea", mensaje: "«Archivo cna07» (Cuadro 07 · Grupos y líneas) no está listo.", archivo_id: "a7" }]);
    expect(revisarEmision(base({ salud: true })).hallazgos[0].mensaje).toMatch(/Cuadro 10/);
    expect(revisarEmision(base({ salud: true, archivos: [...buenos(), archivo("a10", "cna10", [{ escenario: "Foscal" }])] })).puede).toBe(true);
  });

  it("3 · una sola fecha de diligenciamiento, y la de autoevaluación", () => {
    const dos = buenos();
    dos[0] = archivo("a1", "cna01", [
      { fecha_diligenciamiento: "2026-02-15", fecha_autoevaluacion: "2026-01-20" },
      { fecha_diligenciamiento: "2026-03-01", fecha_autoevaluacion: "2026-01-20" },
    ]);
    expect(revisarEmision(base({ archivos: dos })).hallazgos[0]).toMatchObject({ regla: "fecha", mensaje: expect.stringMatching(/2 fechas de diligenciamiento \(2026-02-15, 2026-03-01\)/) });
    const ninguna = buenos();
    ninguna[0] = archivo("a1", "cna01", [{ fecha_autoevaluacion: "2026-01-20" }]);
    expect(revisarEmision(base({ archivos: ninguna })).hallazgos[0].mensaje).toMatch(/Falta la fecha de diligenciamiento/);
    const sinAuto = buenos();
    sinAuto[0] = archivo("a1", "cna01", [{ fecha_diligenciamiento: "2026-02-15" }]);
    expect(revisarEmision(base({ archivos: sinAuto })).hallazgos[0].mensaje).toMatch(/Falta la fecha de autoevaluación/);
    const mala = buenos();
    mala[0] = archivo("a1", "cna01", [{ fecha_diligenciamiento: "15/02/2026", fecha_autoevaluacion: "2026-01-20" }]);
    expect(revisarEmision(base({ archivos: mala })).hallazgos[0].mensaje).toMatch(/no es una fecha válida/);
  });

  it("4 · el cuadro 04 trae los profesores del último periodo del cuadro 03", () => {
    const r = revisarEmision(base({ profesoresUltimoPeriodo: 5 }));
    expect(r.hallazgos).toEqual([{ regla: "cuadro04", nivel: "bloquea", mensaje: "El Cuadro 04 lista 3 profesores y el último periodo del Cuadro 03 reporta 5: deben coincidir.", archivo_id: undefined }]);
    // Dos filas con la misma cédula son un solo profesor.
    const repetida = buenos();
    repetida[1] = archivo("a4", "cna04", [{ cedula: "1" }, { cedula: "1" }, { cedula: "2" }]);
    expect(revisarEmision(base({ archivos: repetida, profesoresUltimoPeriodo: 2 })).puede).toBe(true);
    // Sin el total del 03 solo se avisa.
    const sinDato = revisarEmision(base({ profesoresUltimoPeriodo: null }));
    expect(sinDato.puede).toBe(true);
    expect(sinDato.hallazgos[0]).toMatchObject({ regla: "cuadro04", nivel: "aviso" });
  });

  it("5 · autorización de datos personales cuando hay cuadros con personas", () => {
    const r = revisarEmision(base({ autorizacionDatos: false }));
    expect(r.hallazgos).toHaveLength(1);
    expect(r.hallazgos[0]).toMatchObject({ regla: "datos", nivel: "bloquea" });
    expect(r.hallazgos[0].mensaje).toMatch(/Ley 1581 de 2012/);
    const sinPersonas = buenos().filter((a) => a.id !== "a4");
    expect(revisarEmision(base({ archivos: sinPersonas, autorizacionDatos: false })).hallazgos.map((h) => h.regla)).toEqual(["archivos"]);
  });

  it("valoresDe lee la columna del destino a través del mapa; el nombre del Excel es el del prototipo", () => {
    const a: ArchivoParaEmitir = { id: "x", nombre: "x", estado: "listo", filas: [{ f: "2026-02-15" }, { f: "" }], respuestas: [{ destino_id: "cna01", mapa: { fecha_diligenciamiento: "f" } }] };
    expect(valoresDe([a], "cna01", "fecha_diligenciamiento")).toEqual(["2026-02-15"]);
    expect(valoresDe([a], "cna01", "fecha_autoevaluacion")).toEqual([]);
    expect(nombreArchivoEmitido({ programa: "Ingeniería de Sistemas", campus: "Bucaramanga", hasta: "2025-02" })).toBe("Cuadro Maestro Programas - Ingeniería de Sistemas - Bucaramanga - 2025-02.xlsx");
    expect(nombreArchivoEmitido({ programa: "Medicina", campus: "Cúcuta", hasta: "2025-02", salud: true })).toMatch(/^Cuadro Maestro Programas de Salud/);
  });
});

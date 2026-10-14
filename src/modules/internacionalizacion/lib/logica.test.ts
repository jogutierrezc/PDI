/* Lógica pura de Internacionalización: validación, permisos (espejo del SQL),
   cobertura con el catálogo SNIES real, puente SNIES y cifras. */

import { describe, expect, it } from "vitest";
import { screenVisible } from "../../../lib/auth";
import { DOMINIOS } from "../../reportes/snies/dominios";
import { PLANTILLAS, plantilla } from "../../reportes/snies/plantillas";
import { armarContexto } from "../../reportes/util";
import type { Profile } from "../../../types/database";
import type { Columna, FilaConEstado, IntVentanaRow, Yo } from "../tipos";
import { calcularCifras, estadosQueCuentan, totalSentido } from "./cifras";
import { cobertura, disponiblesDe, encabezadosDeCsv, plantillaDesdeFilas, plantillaDesdeSnies, propuestaPlantilla } from "./cobertura";
import { CONCEPTOS_BASE } from "./conceptos";
import {
  accionesPermitidas,
  campusVisibles,
  esMiembro,
  motivoBloqueoFilas,
  pideNota,
  puedeNombrar,
  rolEn,
  transicionPermitida,
  ventanaAbierta,
  ventanaVigente,
} from "./permisos";
import { claveDeFila, construirEnvioSnies, filaSnies, PUENTE_SNIES, puedeAlimentar } from "./puente-snies";
import { aFechaIso, aNumero, calcular, diasEntre, leerValor, validarDatos } from "./validacion";

describe("validación", () => {
  it("lee fechas de Excel, ISO y dd/mm/aaaa; rechaza las que no existen", () => {
    expect(aFechaIso(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05");
    expect(aFechaIso(46027)).toBe("2026-01-05");
    expect(aFechaIso("5/1/2026")).toBe("2026-01-05");
    expect(aFechaIso("2026-02-29")).toBeNull();
    expect(aNumero("2,5")).toBe(2.5);
    expect(aNumero("dos")).toBeNull();
  });

  it("leerValor tipa o explica el error", () => {
    expect(leerValor({ etiqueta: "Sentido", tipo: "lista", opciones: ["Saliente", "Entrante"] }, "  entrante ")).toEqual({ valor: "Entrante" });
    expect(leerValor({ etiqueta: "Valor", tipo: "numero", opciones: [] }, "x").error).toMatch(/no es un número/);
    expect(leerValor({ etiqueta: "Días", tipo: "calculado", opciones: [] }, 5)).toEqual({ valor: null });
    expect(leerValor({ etiqueta: "Nota", tipo: "texto", opciones: [] }, "")).toEqual({ valor: null });
  });

  it("calcula la duración y marca fin antes de inicio y obligatorios", () => {
    const cols: Columna[] = [
      { clave: "fecha_inicio", etiqueta: "Inicio", tipo: "fecha", concepto_id: "fecha_inicio", obligatorio: true, opciones: [] },
      { clave: "fecha_fin", etiqueta: "Fin", tipo: "fecha", concepto_id: "fecha_fin", obligatorio: false, opciones: [] },
      { clave: "duracion_dias", etiqueta: "Días", tipo: "calculado", concepto_id: "duracion_dias", obligatorio: false, opciones: [], calculo: { tipo: "dias_entre", desde: "fecha_inicio", hasta: "fecha_fin" } },
    ];
    expect(calcular(cols, { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-11" }).duracion_dias).toBe(10);
    expect(diasEntre("2026-09-11", null)).toBeNull();
    expect(validarDatos(cols, { fecha_inicio: "2026-09-11", fecha_fin: "2026-09-01" }, 3)).toEqual([
      { fila: 3, columna: "fecha_fin", mensaje: "«Fin» (2026-09-01) es anterior a «Inicio» (2026-09-11)." },
    ]);
    expect(validarDatos(cols, { otra: "x" }, 1).map((e) => e.columna)).toEqual(["otra", "fecha_inicio"]);
  });
});

describe("permisos (espejo de int_transicion_permitida e int_motivo_bloqueo)", () => {
  const yo: Yo = { director: false, coordinador: ["cuc"], gestor: ["cuc", "buc"] };

  it("transiciones", () => {
    expect(transicionPermitida("borrador", "enviado", "gestor")).toBe(true);
    expect(transicionPermitida("enviado", "validado", "gestor")).toBe(false);
    expect(transicionPermitida("enviado", "validado", "coordinador")).toBe(true);
    expect(transicionPermitida("validado", "aprobado", "coordinador")).toBe(false);
    expect(transicionPermitida("aprobado", "borrador", "coordinador")).toBe(false);
    expect(transicionPermitida("aprobado", "borrador", "director")).toBe(true);
    expect(transicionPermitida("borrador", "aprobado", "director")).toBe(false);
    expect(accionesPermitidas("enviado", "coordinador")).toEqual(["borrador", "validado"]);
    expect(pideNota("aprobado", "borrador")).toBe(true);
    expect(pideNota("borrador", "enviado")).toBe(false);
  });

  it("rol por campus y campus visibles", () => {
    expect(rolEn(yo, "cuc")).toBe("coordinador");
    expect(rolEn(yo, "buc")).toBe("gestor");
    expect(rolEn(yo, "val")).toBeNull();
    expect(rolEn({ director: true, coordinador: [], gestor: [] }, "val")).toBe("director");
    expect(campusVisibles(yo, ["buc", "cuc", "val"])).toEqual(["buc", "cuc"]);
    expect(esMiembro({ director: false, coordinador: [], gestor: [] })).toBe(false);
    expect(puedeNombrar("director", { director: true, admin: false })).toBe(false);
    expect(puedeNombrar("gestor", { director: true, admin: false })).toBe(true);
  });

  it("ventanas: la del campus manda sobre la general; periodo cerrado, cerrada", () => {
    const v: IntVentanaRow[] = [
      { id: "1", periodo_id: "p", hoja_id: "h", campus_id: null, abre: "2026-08-01", cierra: "2026-09-30" },
      { id: "2", periodo_id: "p", hoja_id: "h", campus_id: "cuc", abre: "2026-08-01", cierra: "2026-10-30" },
    ];
    expect(ventanaVigente(v, "p", "h", "cuc")?.id).toBe("2");
    expect(ventanaVigente(v, "p", "h", "buc")?.id).toBe("1");
    expect(ventanaAbierta({ id: "p", estado: "abierto" }, v, "h", "cuc", "2026-10-14")).toBe(true);
    expect(ventanaAbierta({ id: "p", estado: "abierto" }, v, "h", "buc", "2026-10-14")).toBe(false);
    expect(ventanaAbierta({ id: "p", estado: "cerrado" }, v, "h", "cuc", "2026-10-14")).toBe(false);
  });

  it("motivo de bloqueo de filas", () => {
    const base = { captura: "campus" as const, ventanaAbierta: true };
    expect(motivoBloqueoFilas({ ...base, rol: "gestor", estado: "borrador" })).toBeNull();
    expect(motivoBloqueoFilas({ ...base, rol: "gestor", estado: "enviado" })).toMatch(/ya se envió/);
    expect(motivoBloqueoFilas({ ...base, rol: "coordinador", estado: "enviado" })).toBeNull();
    expect(motivoBloqueoFilas({ ...base, rol: "coordinador", estado: "validado" })).toMatch(/devuélvala/);
    expect(motivoBloqueoFilas({ ...base, rol: "gestor", estado: "borrador", ventanaAbierta: false })).toMatch(/ventana/);
    expect(motivoBloqueoFilas({ ...base, rol: "director", estado: "borrador", ventanaAbierta: false })).toBeNull();
    expect(motivoBloqueoFilas({ ...base, rol: "director", estado: "aprobado" })).toMatch(/aprobada/);
    expect(motivoBloqueoFilas({ ...base, captura: "oficina", rol: "gestor", estado: "borrador" })).toMatch(/oficina principal/);
    expect(motivoBloqueoFilas({ ...base, rol: null, estado: "borrador" })).toMatch(/No tiene permiso/);
  });

  it("el menú muestra el módulo a sus miembros y a la administración", () => {
    const perfil = (role: Profile["role"]) => ({ id: "x", role, is_active: true }) as Profile;
    const who = { access: null, inAnyUnit: false, impactoSide: null };
    expect(screenVisible("internacionalizacion", { ...who, profile: perfil("consulta"), inInternacionalizacion: true })).toBe(true);
    expect(screenVisible("internacionalizacion", { ...who, profile: perfil("planeacion") })).toBe(false);
    expect(screenVisible("internacionalizacion", { ...who, profile: perfil("admin") })).toBe(true);
  });
});

describe("cobertura", () => {
  const movilidad = [{ nombre: "Saliente", columnas: ["programa", "tipo_documento", "numero_documento", "pais_contraparte", "fecha_inicio"].map((c) => ({ concepto_id: c })) }];

  it("lee el catálogo SNIES real: Participante, columna por columna", () => {
    const p = cobertura(plantillaDesdeSnies(plantilla("participante")), disponiblesDe(movilidad));
    const por = Object.fromEntries(p.columnas.map((c) => [c.codigo, c.resultado]));
    expect(p.total).toBe(plantilla("participante").campos.length);
    expect(por).toMatchObject({ ID_TIPO_DOCUMENTO: "directo", NUM_DOCUMENTO: "directo", PRIMER_NOMBRE: "falta", ID_MUNICIPIO: "falta" });
    expect(p.obligatoriasFaltantes).toEqual(["Primer nombre", "Primer apellido", "Sexo biológico", "Estado civil", "Fecha de nacimiento", "País de nacimiento"]);
    expect(p.porcentaje).toBe(Math.round((2 / p.total) * 100));
  });

  it("deriva año, semestre, programa y sede", () => {
    const m = cobertura(plantillaDesdeSnies(plantilla("matriculados")), disponiblesDe(movilidad));
    const por = Object.fromEntries(m.columnas.map((c) => [c.codigo, c.resultado]));
    expect(por).toMatchObject({ "AÑO": "derivado", SEMESTRE: "derivado", PRO_CONSECUTIVO: "derivado", ID_MUNICIPIO: "derivado", CODIGO_ESTUDIANTE: "falta" });
  });

  it("todas las plantillas del catálogo se pueden medir; solo Participante tiene puente", () => {
    for (const spec of PLANTILLAS) expect(cobertura(plantillaDesdeSnies(spec), disponiblesDe(movilidad)).total).toBe(spec.campos.length);
    expect(PUENTE_SNIES.map((p) => p.plantilla)).toEqual(["participante"]);
    expect(PLANTILLAS.some((p) => /movilidad|convenio/i.test(p.nombre))).toBe(false);
  });

  it("plantillas del Director: propuesta desde CSV, luego corregida", () => {
    const enc = encabezadosDeCsv('﻿"Estudiantes en movilidad saliente";Convenios vigentes;"País de destino";Dobles titulaciones\r\n1;2;3;4');
    expect(enc).toEqual(["Estudiantes en movilidad saliente", "Convenios vigentes", "País de destino", "Dobles titulaciones"]);
    const prop = propuestaPlantilla(enc, CONCEPTOS_BASE);
    expect(prop.map((c) => c.concepto_id)).toEqual([null, null, "pais_contraparte", null]);
    const corregida = plantillaDesdeFilas({ id: "cna", nombre: "CNA", tipo: "cna" }, [
      { etiqueta: enc[0], concepto_id: "sentido_movilidad", modo: "derivado", nota: "Conteo", orden: 1 },
      ...prop.slice(1, 3).map((c, i) => ({ etiqueta: c.etiqueta, concepto_id: c.concepto_id, modo: c.modo, nota: c.nota ?? "", orden: i + 2 })),
      { etiqueta: enc[3], concepto_id: "tipo_movilidad", modo: "derivado", nota: "", orden: 4 },
    ]);
    const cob = cobertura(corregida, disponiblesDe([{ nombre: "Saliente", columnas: [{ concepto_id: "sentido_movilidad" }, { concepto_id: "pais_contraparte" }] }]));
    expect(cob.columnas.map((c) => c.resultado)).toEqual(["derivado", "falta", "directo", "falta"]);
    expect(cob.porcentaje).toBe(50);
    expect(cob.columnas[1].motivo).toMatch(/Sin concepto equivalente/);
    expect(cob.columnas[3].motivo).toBe("Ninguna tabla lleva «tipo_movilidad».");
  });
});

describe("puente SNIES", () => {
  const ctx = {
    contexto: armarContexto(
      "2026-2",
      { programa: [], municipio: [], pais: [{ catalogo: "pais", codigo: "218", nombre: "Ecuador", activo: true }, { catalogo: "pais", codigo: "170", nombre: "Colombia", activo: true }] },
      DOMINIOS,
      undefined,
    ),
    periodo: "2026-2",
  };
  const persona = {
    tipo_documento: "Pasaporte",
    numero_documento: "AB 123",
    primer_nombre: "Ana",
    primer_apellido: "Ruiz",
    sexo_biologico: "mujer",
    estado_civil: "Soltero(a)",
    fecha_nacimiento: "2001-04-09",
    pais_nacimiento: "ecuador",
  };
  const fila = (id: string, datos: Record<string, string>, estado: FilaConEstado["estado"] = "aprobado"): FilaConEstado => ({ id, hoja_id: "h", campus_id: "cuc", datos, estado });

  it("convierte al formato de ri_filas con los nombres del catálogo", () => {
    const f = filaSnies(plantilla("participante"), persona, "cuc", ctx);
    expect(f).toMatchObject({ NUM_DOCUMENTO: "AB123", ID_SEXO_BIOLOGICO: "Mujer", ID_PAIS: "Ecuador", FECHA_NACIMIENTO: "09/04/2001", ID_MUNICIPIO: "" });
    expect(claveDeFila(f, ["NUM_DOCUMENTO"])).toBe("AB123");
  });

  it("solo aprobadas, sin repetir y rechazando lo que el motor de Reportes rechaza", () => {
    const envio = construirEnvioSnies(
      plantilla("participante"),
      [
        fila("1", persona),
        fila("2", { ...persona, numero_documento: "ab123" }),
        fila("3", { ...persona, numero_documento: "77" }, "validado"),
        fila("4", { ...persona, numero_documento: "88", pais_nacimiento: "Colombia" }),
      ],
      ctx,
    );
    expect(envio.filas.map((f) => f.origen)).toEqual(["1"]);
    expect(envio.repetidas).toBe(1);
    expect(envio.noAprobadas).toBe(1);
    expect(envio.rechazadas).toHaveLength(1);
    expect(envio.rechazadas[0].errores[0].mensaje).toMatch(/municipio de nacimiento/);
  });

  it("una hoja alimenta Participante solo si lleva todos sus obligatorios", () => {
    const spec = plantilla("participante");
    const completa = disponiblesDe([{ nombre: "Visitantes", columnas: Object.keys(persona).map((c) => ({ concepto_id: c })) }]);
    expect(puedeAlimentar(spec, completa)).toEqual({ si: true, faltan: [] });
    expect(puedeAlimentar(spec, disponiblesDe([])).si).toBe(false);
    expect(puedeAlimentar(plantilla("matriculados"), completa)).toEqual({ si: false, faltan: [] });
    expect(() => construirEnvioSnies(plantilla("matriculados"), [], ctx)).toThrow(/no alimenta/);
  });
});

describe("cifras (espejo de int_cifras)", () => {
  const hojas = [
    { id: "sal", clase: "movilidad" as const, sentido: "saliente" as const },
    { id: "ent", clase: "movilidad" as const, sentido: "entrante" as const },
    { id: "conv", clase: "convenio" as const, sentido: null },
  ];
  const f = (id: string, hoja: string, campus: string, estado: FilaConEstado["estado"], datos: Record<string, string | number>): FilaConEstado => ({ id, hoja_id: hoja, campus_id: campus, estado, datos });
  const filas = [
    f("1", "sal", "cuc", "aprobado", { numero_documento: "1.1", pais_contraparte: "Chile" }),
    f("2", "sal", "cuc", "aprobado", { numero_documento: "11", pais_contraparte: "Chile" }),
    f("3", "sal", "buc", "validado", { numero_documento: "2", pais_contraparte: "México" }),
    f("4", "ent", "cuc", "aprobado", { numero_documento: "3", nacionalidad: "Ecuador", sentido_movilidad: "Entrante" }),
    f("5", "conv", "cuc", "aprobado", { fecha_inicio: "2023-03-01", vigencia_anios: 5 }),
    f("6", "conv", "cuc", "aprobado", { fecha_inicio: "2020-01-31", vigencia_anios: 2 }),
    f("7", "conv", "buc", "aprobado", { fecha_inicio: "2026-01-01", fecha_fin: "2026-06-30" }),
    f("8", "conv", "bog", "enviado", { fecha_inicio: "2026-01-01" }),
  ];

  it("cuenta solo lo aprobado", () => {
    const c = calcularCifras(filas, hojas, { referencia: "2026-12-15" });
    expect(c.incluye).toEqual(["aprobado"]);
    expect(totalSentido(c, "saliente")).toBe(2);
    expect(totalSentido(c, "entrante")).toBe(1);
    expect(c.por_pais).toEqual([
      { pais: "Chile", sentido: "saliente", total: 2 },
      { pais: "Ecuador", sentido: "entrante", total: 1 },
    ]);
    // «1.1» y «11» son el mismo documento.
    expect(c.personas).toEqual([{ campus_id: "cuc", total: 2 }]);
    expect(c.convenios_vigentes).toEqual([{ campus_id: "cuc", total: 1 }]);
  });

  it("el Director puede incluir validado o enviado; los demás no", () => {
    expect(estadosQueCuentan("enviado", false)).toEqual(["aprobado"]);
    const c = calcularCifras(filas, hojas, { referencia: "2026-12-15", director: true, incluir: "enviado" });
    expect(totalSentido(c, "saliente")).toBe(3);
    expect(c.convenios_vigentes).toContainEqual({ campus_id: "bog", total: 1 });
  });
});

/* La lógica pura de Datos de Sostenibilidad: el mapa de conexión a un
   indicador (autoMap y sus faltantes) y los permisos por oficina. */

import { describe, expect, it } from "vitest";
import { INDICADORES_DS, SLOTS, autoMap, coberturaDelMapa, faltanDelMapa } from "./indicadores";
import { esMiembro, puedeEditar, puedeRepartir, rolEn } from "./permisos";
import type { DsYo } from "../tipos";

const columnas = [
  { clave: "campus", etiqueta: "Campus", tipo: "texto" as const, obligatorio: false, opciones: [] },
  { clave: "periodo", etiqueta: "Periodo", tipo: "texto" as const, obligatorio: false, opciones: [] },
  { clave: "valor", etiqueta: "Consumo de energía limpia", tipo: "porcentaje" as const, obligatorio: true, opciones: [] },
  { clave: "fuente_reporta", etiqueta: "Quién reporta", tipo: "texto" as const, obligatorio: false, opciones: [] },
  { clave: "soporte_url", etiqueta: "Enlace de soporte", tipo: "texto" as const, obligatorio: false, opciones: [] },
];

describe("Datos de Sostenibilidad · catálogo y slots", () => {
  it("la semilla son los cuatro indicadores del ODS 13", () => {
    expect(INDICADORES_DS.map((i) => i.id)).toEqual(["13.1", "13.2", "13.3", "13.4"]);
  });

  it("los slots son cinco y solo valor y periodo son obligatorios", () => {
    expect(SLOTS.map((s) => s.clave)).toEqual(["valor", "periodo", "campus", "fuente", "evidencia"]);
    expect(SLOTS.filter((s) => s.obligatorio).map((s) => s.clave)).toEqual(["valor", "periodo"]);
  });
});

describe("Datos de Sostenibilidad · el mapa de conexión", () => {
  it("autoMap propone cada slot con la columna que le corresponde, sin repetir", () => {
    expect(autoMap(columnas)).toEqual({ valor: "valor", periodo: "periodo", campus: "campus", fuente: "fuente_reporta", evidencia: "soporte_url" });
  });

  it("sin cifras no hay valor; sin columna de periodo no hay periodo", () => {
    const mapa = autoMap(columnas.slice(0, 2));
    expect(mapa).toEqual({ periodo: "periodo", campus: "campus" });
  });

  it("lo que falta es lo obligatorio sin columna; la cobertura cuenta los conectados", () => {
    expect(faltanDelMapa({ valor: "valor", periodo: "periodo" })).toEqual([]);
    expect(faltanDelMapa({ valor: "valor" })).toEqual(["Periodo"]);
    expect(faltanDelMapa(null)).toEqual(["Valor", "Periodo"]);
    expect(coberturaDelMapa({ valor: "valor", periodo: "periodo" })).toEqual({ conectados: 2, total: 5 });
  });
});

describe("Datos de Sostenibilidad · permisos", () => {
  const yo: DsYo = {
    planeacion: false,
    oficinas: [{ oficina_id: "verde", oficina: "UDES Verde", codigo: "VERDE", rol: "gestor" }],
  };

  it("pertenecer es el permiso; el rol manda qué se puede", () => {
    expect(esMiembro(yo)).toBe(true);
    expect(esMiembro(undefined)).toBe(false);
    expect(rolEn(yo, "verde")).toBe("gestor");
    expect(rolEn(yo, "otra")).toBeNull();
    expect(puedeEditar(yo, "verde")).toBe(true);
    expect(puedeEditar(yo, "otra")).toBe(false);
    expect(puedeRepartir(yo, "verde", false)).toBe(true);
  });

  it("Planeación ve todo y no edita nada; el colaborador edita pero no reparte", () => {
    const planeacion: DsYo = { planeacion: true, oficinas: [{ oficina_id: "verde", oficina: "UDES Verde", codigo: "VERDE", rol: "planeacion" }] };
    expect(puedeEditar(planeacion, "verde")).toBe(false);
    expect(puedeRepartir(planeacion, "verde", false)).toBe(false);
    const colabo: DsYo = { planeacion: false, oficinas: [{ oficina_id: "verde", oficina: "UDES Verde", codigo: "VERDE", rol: "colaborador" }] };
    expect(puedeEditar(colabo, "verde")).toBe(true);
    expect(puedeRepartir(colabo, "verde", false)).toBe(false);
  });
});

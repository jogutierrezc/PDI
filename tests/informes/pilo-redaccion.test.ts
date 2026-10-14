/* Pilo redacta y mejora secciones del informe de gestión (pilo-informes/redaccion.ts):
   ninguna cifra fuera de los tokens [[clave]] de la instancia, nada inventado,
   ejemplos solo como guía de tono y la extensión de la plantilla. */

import { describe, expect, it } from "vitest";
import { inferirPlantilla, seccionDe, seccionesDe } from "../../supabase/functions/pilo-informes/plantillas";
import {
  cifrasValidas,
  leerTexto,
  mensajesRedactar,
  ocultarCifras,
  puedeUsar,
  solapeMaximo,
  tendencia,
  textoDeContenido,
  verificarMejora,
  verificarRedaccion,
  type CifraInforme,
  type Reglas,
} from "../../supabase/functions/pilo-informes/redaccion";

const resumenA = seccionDe("A", "s1")!;
const CIFRAS: CifraInforme[] = [
  { clave: "matric", etiqueta: "Matrícula total", fuente_tipo: "auto", visto: 2840, anterior: 2765, meta: 2900, incluida: true },
  { clave: "deser", etiqueta: "Deserción anual", fuente_tipo: "auto", visto: 7.8, anterior: 8.6, incluida: true },
  { clave: "con", etiqueta: "Convenios activos", fuente_tipo: "manual", fuente_nombre: "Oficina de Relaciones", valor: 21, incluida: false },
];
const EJEMPLO =
  "La gestión de la Facultad en [año] se concentró en la permanencia estudiantil y en la calidad de los programas, con un acompañamiento académico que llegó a [cifra] estudiantes y un trabajo articulado con bienestar universitario para atender los casos de riesgo.";

const reglas = (extra: Partial<Reglas> = {}): Reglas => ({
  claves: cifrasValidas(CIFRAS).map((c) => c.clave),
  anio: 2026,
  extension: resumenA.extension!,
  ejemplos: [EJEMPLO],
  contexto: "Matrícula total Deserción anual",
  ...extra,
});

const BUENO =
  "En 2026 la Facultad de Ciencias de la Salud alcanzó una matrícula de [[matric]] estudiantes y redujo la deserción anual a [[deser]], en línea con el pilar de Personalización del PDI.\n\n" +
  "El trabajo del año se apoyó en el acompañamiento académico y en el seguimiento a los estudiantes de primer semestre. [La unidad debe completar: las acciones que explican la reducción de la deserción].";

describe("plantillas", () => {
  it("las claves salen del orden de la plantilla (s1…sN) y las listas no se redactan", () => {
    expect(seccionesDe("A")).toHaveLength(10);
    expect(seccionesDe("D").map((s) => s.clave)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]);
    expect(seccionDe("A", "s8")!.extension).toBeNull();
    expect(seccionDe("B", "s8")!.tipo).toBe("conclusiones");
    expect(seccionDe("D", "s1")!.tipo).toBe("presentacion");
  });

  it("infiere la plantilla de un informe 2025 por su nombre", () => {
    expect(inferirPlantilla("INFORME DE GESTION FCS 2025.pdf")).toBe("A");
    expect(inferirPlantilla("INFO GESTIÓN VALLEDUPAR  2025.pdf")).toBe("C");
    expect(inferirPlantilla("Informe_Gestion_Institucional_Recto General_UDES_2025_V3.docx")).toBe("D");
    expect(inferirPlantilla("Informe_Gestión_Institucional_2025_Vicerrectoría de Posgrados.docx")).toBe("B");
  });
});

describe("(a) Pilo nunca escribe una cifra", () => {
  it("acepta tokens de cifras incluidas y los años del ciclo", () => {
    const v = verificarRedaccion(BUENO, reglas());
    expect(v.ok).toBe(true);
  });

  it("rechaza una clave inventada o de una cifra no incluida", () => {
    const v = verificarRedaccion(BUENO.replace("[[deser]]", "[[retencion]]"), reglas());
    expect(v).toMatchObject({ ok: false });
    expect(!v.ok && v.error).toMatch(/\[\[retencion\]\].*no existe/);
    expect(verificarRedaccion(BUENO.replace("[[deser]]", "[[con]]"), reglas()).ok).toBe(false);
  });

  it("rechaza dígitos escritos a mano (aunque sean el valor real)", () => {
    const v = verificarRedaccion(BUENO.replace("[[matric]]", "2.840"), reglas());
    expect(!v.ok && v.error).toMatch(/cifras a mano \(2\.840\)/);
    expect(verificarRedaccion(BUENO.replace("2026", "2019"), reglas()).ok).toBe(false);
  });

  it("rechaza cifras en palabras", () => {
    const v = verificarRedaccion(BUENO.replace("el seguimiento a los", "el seguimiento a tres grupos de"), reglas());
    expect(!v.ok && v.error).toMatch(/en palabras \(tres\)/);
  });

  it("solo admite corchetes en tokens y en el marcador exacto", () => {
    expect(verificarRedaccion(BUENO.replace("[La unidad debe completar:", "[Completar:"), reglas()).ok).toBe(false);
  });

  it("al contexto que se manda a Pilo se le ocultan las cifras escritas, no los tokens", () => {
    expect(ocultarCifras("Matrícula de 2.840 ([[matric]]) y [[tasa2]] con 7,8 %")).toBe("Matrícula de [cifra] ([[matric]]) y [[tasa2]] con [cifra]");
    expect(tendencia(CIFRAS[0])).toEqual(["frente al año anterior: mayor", "frente a la meta: por debajo"]);
    const m = mensajesRedactar({ unidad: "FCS", plantilla: "A", anio: 2026, seccion: { ...resumenA, extension: resumenA.extension! }, cifras: cifrasValidas(CIFRAS), ejemplos: [], actual: "Tuvimos 2840 matriculados." });
    const todo = m.map((x) => x.content).join("\n");
    expect(todo).not.toMatch(/2840|2765|2900|8[.,]6/);
    expect(todo).toContain("[[matric]] — Matrícula total");
    expect(todo).not.toContain("[[con]]");
  });
});

describe("(b) lo que no sabe queda como marcador", () => {
  it("rechaza premios, convenios o causas que la unidad no dio", () => {
    const premio = BUENO.replace("El trabajo del año", "El programa fue premiado por la Gobernación y el trabajo del año");
    expect(verificarRedaccion(premio, reglas())).toMatchObject({ ok: false });
    const causa = BUENO.replace("en línea con", "debido a la nueva política de becas, en línea con");
    expect(!verificarRedaccion(causa, reglas()).ok).toBe(true);
  });

  it("los admite si vienen de la unidad o dentro de un marcador", () => {
    const premio = BUENO.replace("El trabajo del año", "El programa fue premiado por la Gobernación y el trabajo del año");
    expect(verificarRedaccion(premio, reglas({ contexto: "Nos premiaron como buena práctica regional" })).ok).toBe(true);
    const marcador = BUENO.replace("las acciones que explican", "los convenios y premios que explican");
    expect(verificarRedaccion(marcador, reglas()).ok).toBe(true);
  });

  it("avisa cuántos marcadores dejó", () => {
    const v = verificarRedaccion(BUENO, reglas());
    expect(v.ok && v.avisos.join(" ")).toMatch(/1 marcador/);
  });
});

describe("(c) los ejemplos guían el tono, no se copian", () => {
  it("mide el trozo común más largo en palabras", () => {
    expect(solapeMaximo("uno dos tres cuatro", ["cero dos tres cuatro cinco"])).toBe(3);
  });

  it("rechaza 10 o más palabras seguidas de un ejemplo", () => {
    const copia = BUENO.replace("El trabajo del año se apoyó en el acompañamiento académico", "Se concentró en la permanencia estudiantil y en la calidad de los programas, con un acompañamiento académico");
    const v = verificarRedaccion(copia, reglas());
    expect(!v.ok && v.error).toMatch(/Copiaste \d+ palabras seguidas/);
  });
});

describe("(d) extensión de la plantilla", () => {
  it("rechaza más párrafos de los que pide la sección", () => {
    const largo = [BUENO, "La Facultad seguirá con su plan.", "Otro párrafo más para la unidad."].join("\n\n");
    expect(verificarRedaccion(largo, reglas()).ok).toBe(false);
  });

  it("avisa si queda corto para la extensión recomendada", () => {
    const v = verificarRedaccion("La matrícula llegó a [[matric]].", reglas());
    expect(v.ok && v.avisos.join(" ")).toMatch(/corto/);
  });

  it("la presentación del rector pide una página", () => {
    expect(seccionDe("D", "s1")!.extension!.parrafos[0]).toBeGreaterThanOrEqual(3);
  });
});

describe("mejorar", () => {
  const antes = "La Facultad tuvo una matrícula de [[matric]] y la deserción fue [[deser]]. [La unidad debe completar: causas]. Se hicieron muchas cosas importantes en el año que vale la pena contar con detalle.";

  it("conserva tokens, marcadores y no agrega cifras ni hechos", () => {
    expect(verificarMejora(antes, "La matrícula de la Facultad fue [[matric]] y la deserción, [[deser]]. [La unidad debe completar: causas]. El año dejó avances que conviene detallar.", "claridad").ok).toBe(true);
    expect(verificarMejora(antes, "La matrícula fue [[matric]]. [La unidad debe completar: causas].", "claridad").ok).toBe(false);
    expect(verificarMejora(antes, "La matrícula fue [[matric]] y la deserción [[deser]], con 12 convenios. [La unidad debe completar: causas].", "tono").ok).toBe(false);
    expect(verificarMejora(antes, "La matrícula fue [[matric]] y la deserción [[deser]] gracias a un premio. [La unidad debe completar: causas].", "tono").ok).toBe(false);
    expect(verificarMejora(antes, "La matrícula fue [[matric]] y la deserción [[deser]].", "tono").ok).toBe(false);
  });

  it("la síntesis debe ser más corta y puede dejar tokens por fuera (con aviso)", () => {
    const v = verificarMejora(antes, "Matrícula de [[matric]]. [La unidad debe completar: causas].", "sintesis");
    expect(v.ok && v.avisos[0]).toMatch(/\[\[deser\]\]/);
    expect(verificarMejora(antes, antes, "sintesis").ok).toBe(false);
  });
});

describe("roles y lectura", () => {
  const plan = { role: "planeacion", is_active: true };
  const usuario = { role: "usuario", is_active: true };
  it("aprender e ingerir solo Planeación o administración; redactar, Gestor o Contribuyente de la unidad", () => {
    expect(puedeUsar("ingerir", { perfil: plan, rolesUnidad: [] })).toBe(true);
    expect(puedeUsar("aprender", { perfil: usuario, rolesUnidad: ["jefe"] })).toBe(false);
    expect(puedeUsar("redactar", { perfil: usuario, rolEnUnidad: "editor", rolesUnidad: ["editor"] })).toBe(true);
    expect(puedeUsar("redactar", { perfil: usuario, rolEnUnidad: "visor", rolesUnidad: ["jefe"] })).toBe(false);
    expect(puedeUsar("mejorar", { perfil: usuario, rolesUnidad: ["visor"] })).toBe(false);
    expect(puedeUsar("corpus", { perfil: { ...plan, is_active: false }, rolesUnidad: [] })).toBe(false);
  });

  it("lee el texto de la sección y el JSON del modelo", () => {
    expect(textoDeContenido({ texto: "Hola" })).toBe("Hola");
    expect(textoDeContenido({ html: "<p>Uno</p><p>Dos</p>" })).toBe("Uno\n\nDos");
    expect(textoDeContenido(null)).toBe("");
    const l = leerTexto('<think>…</think>```json\n{"texto": "Uno.\\n\\n\\n\\nDos."}\n```');
    expect(l).toEqual({ ok: true, valor: "Uno.\n\nDos." });
    expect(leerTexto("sin json").ok).toBe(false);
  });
});

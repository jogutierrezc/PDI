import { describe, expect, it } from "vitest";
import { CARACTERES_LINEA, LINEAS_TEXTO, LIM, MAX_ELEMENTOS_LAMINA, leerPresentacion, repartirListas, repartirTextos, validarPresentacion } from "../../supabase/functions/pilo-presentaciones/esquema";
import type { DGrafica, DTexto, Diapositiva } from "../../supabase/functions/pilo-presentaciones/esquema";
import { PRESUPUESTO_INFORME, TEXTO_LARGO, compactarInforme, mensajeSistema, mensajeUsuario } from "../../supabase/functions/pilo-presentaciones/prompt";
import { verificarPresentacion } from "../../supabase/functions/pilo-presentaciones/verificar";
import { informeEjemplo, presentacionEjemplo } from "../../src/modules/informes/presentacion/ejemplo";

const base = () => JSON.parse(JSON.stringify(presentacionEjemplo));
const frase = (i: number) => `La unidad ejecutó la acción número ${i} con el equipo de la facultad y dejó el registro en el anexo correspondiente.`;
const narracion = (frases: number, desde = 1) => Array.from({ length: frases }, (_, i) => frase(desde + i)).join(" ");
const texto = (parrafos: string[], puntos: string[] = []): DTexto => ({ tipo: "texto", titulo: "Narración", parrafos, ...(puntos.length ? { puntos } : {}) });
const lineas = (t: string) => Math.ceil(t.length / CARACTERES_LINEA);

describe("límites relajados: más contenido por campo, sin romper lo antiguo", () => {
  it("una presentación guardada con el esquema viejo (límites cortos, sin «parte», sin gráficas) sigue abriendo igual", () => {
    const vieja = base();
    vieja.diapositivas = vieja.diapositivas.filter((d: Diapositiva) => d.tipo !== "grafica");
    const p = leerPresentacion(vieja, "institucional");
    expect(p).not.toBeNull();
    expect(p!.diapositivas).toHaveLength(vieja.diapositivas.length);
    expect(p!.diapositivas.some((d) => d.parte)).toBe(false);
  });

  it("un texto de 200 caracteres en una introducción o una tarjeta ya no se recorta", () => {
    const p = base();
    p.diapositivas[3].intro = "palabra ".repeat(28).trim(); // ~223 ≤ 240
    p.diapositivas[3].tarjetas[0].texto = "dato ".repeat(39).trim(); // 194 ≤ 200
    const v = validarPresentacion(p, "institucional");
    expect(v.ok && v.ajustes).toEqual([]);
  });

  it("un párrafo de hasta ~2 700 caracteres se acepta entero (no se resume ni se recorta)", () => {
    const largo = narracion(22); // ~2 400
    expect(largo.length).toBeGreaterThan(2000);
    const p = base();
    p.diapositivas.splice(1, 0, texto([largo]));
    const v = validarPresentacion(p, "institucional");
    expect(v.ok).toBe(true);
    if (v.ok) {
      const partes = v.presentacion.diapositivas.filter((d): d is DTexto => d.tipo === "texto" && d.titulo === "Narración");
      expect(partes.map((d) => (d.parrafos ?? []).join(" ")).join(" ")).toBe(largo);
    }
  });
});

describe("repartirTextos: la narración larga sigue en otras láminas, completa y en orden", () => {
  it("un texto corto queda en una sola lámina, sin «parte»", () => {
    const r = repartirTextos([texto([narracion(2)])]);
    expect(r).toHaveLength(1);
    expect(r[0].parte).toBeUndefined();
  });

  it("5 párrafos largos se reparten en varias láminas, cada una cabe y no se pierde ni una frase", () => {
    const parrafos = [narracion(6, 1), narracion(6, 7), narracion(6, 13), narracion(6, 19), narracion(6, 25)];
    const r = repartirTextos([texto(parrafos)]) as DTexto[];
    expect(r.length).toBeGreaterThan(1);
    r.forEach((d, i) => {
      expect(d.parte).toEqual({ n: i + 1, de: r.length });
      expect(d.titulo).toBe("Narración");
      const l = (d.parrafos ?? []).reduce((a, p) => a + lineas(p) + 0.6, 0);
      expect(l).toBeLessThanOrEqual(LINEAS_TEXTO * 1.1);
    });
    const unido = r.flatMap((d) => d.parrafos ?? []).join(" ");
    expect(unido).toBe(parrafos.join(" "));
  });

  it("un solo párrafo gigante se corta entre frases, no a media palabra", () => {
    const largo = narracion(30);
    const r = repartirTextos([texto([largo])]) as DTexto[];
    expect(r.length).toBeGreaterThan(2);
    for (const d of r) for (const p of d.parrafos ?? []) expect(p.endsWith(".")).toBe(true);
    expect(r.flatMap((d) => d.parrafos ?? []).join(" ")).toBe(largo);
  });

  it("párrafos y puntos conservan su tipo; las notas del orador van solo en la primera", () => {
    const d: DTexto = { ...texto([narracion(8)], Array.from({ length: 10 }, (_, i) => `Punto ${i + 1}: ${frase(i)}`)), notas: "Guion" };
    const r = repartirTextos([d]) as DTexto[];
    expect(r.length).toBeGreaterThan(1);
    expect(r[0].notas).toBe("Guion");
    expect(r.slice(1).every((x) => x.notas === undefined)).toBe(true);
    expect(r.flatMap((x) => x.puntos ?? [])).toHaveLength(10);
  });

  it("es idempotente: una lámina ya partida (guardada) no se vuelve a partir", () => {
    const una = repartirTextos([texto([narracion(30)])]);
    expect(repartirTextos(una)).toEqual(una);
  });
});

describe("repartirListas: en vez de recortar, láminas de continuación parejas", () => {
  const tarjeta = (i: number) => ({ titulo: `Pilar ${i}`, cifra: `${i} %`, texto: `Aporte ${i}` });
  it("9 tarjetas son 3 + 3 + 3 (máx. 4 por lámina); el destacado queda en la primera", () => {
    const d: Diapositiva = { tipo: "tarjetas", titulo: "Pilares", intro: "Intro", tarjetas: Array.from({ length: 9 }, (_, i) => tarjeta(i + 1)), destacado: { etiqueta: "Total", valor: "9" } };
    const r = repartirListas([d]);
    expect(r.map((x) => (x.tipo === "tarjetas" ? x.tarjetas.length : 0))).toEqual([3, 3, 3]);
    expect(r.map((x) => x.parte)).toEqual([{ n: 1, de: 3 }, { n: 2, de: 3 }, { n: 3, de: 3 }]);
    expect(r[0].tipo === "tarjetas" && r[0].intro).toBe("Intro");
    expect(r[1].tipo === "tarjetas" && r[1].intro).toBeUndefined();
    expect(r[1].tipo === "tarjetas" && r[1].destacado).toBeUndefined();
  });

  it("logros, cifras, anexos, filas de cumplimiento y series de gráfica también se reparten", () => {
    const M = MAX_ELEMENTOS_LAMINA;
    const ds: Diapositiva[] = [
      { tipo: "logros", titulo: "Logros", logros: Array.from({ length: 7 }, (_, i) => ({ titulo: `L${i}`, resultado: `R${i}` })) },
      { tipo: "cifras", titulo: "Cifras", cifras: Array.from({ length: 5 }, (_, i) => ({ valor: String(i), etiqueta: `E${i}` })) },
      { tipo: "evidencias", titulo: "Anexos", anexos: Array.from({ length: 14 }, (_, i) => ({ n: String(i + 1), documento: `Doc ${i}` })), fuentes: ["Fuente"], enlaces: [{ texto: "T", url: "https://a.org" }] },
      { tipo: "cumplimiento", titulo: "Plan", filas: Array.from({ length: 8 }, (_, i) => ({ dimension: `D${i}`, completadas: 1, en_proceso: 1, pendientes: 1 })), resumen: [{ valor: "8", etiqueta: "dimensiones" }] },
      { tipo: "grafica", forma: "barras", titulo: "Barras", series: Array.from({ length: 13 }, (_, i) => ({ etiqueta: `S${i}`, valor: i })) },
    ];
    const r = repartirListas(ds);
    expect(r.filter((x) => x.tipo === "logros")).toHaveLength(2);
    expect(r.filter((x) => x.tipo === "cifras")).toHaveLength(2);
    const ev = r.filter((x) => x.tipo === "evidencias");
    expect(ev).toHaveLength(3);
    expect(ev.every((x) => x.tipo === "evidencias" && x.anexos.length <= M.anexos)).toBe(true);
    expect(ev[0].tipo === "evidencias" && ev[0].fuentes).toEqual(["Fuente"]);
    expect(ev[1].tipo === "evidencias" && ev[1].fuentes).toEqual([]);
    const cu = r.filter((x) => x.tipo === "cumplimiento");
    expect(cu).toHaveLength(2);
    expect(cu[1].tipo === "cumplimiento" && cu[1].resumen).toBeUndefined();
    const gr = r.filter((x): x is DGrafica => x.tipo === "grafica");
    expect(gr.map((x) => x.series.length)).toEqual([7, 6]);
    expect(gr.flatMap((x) => x.series.map((s) => s.etiqueta))).toEqual(Array.from({ length: 13 }, (_, i) => `S${i}`));
  });

  it("la dona no se parte (sus partes son un todo)", () => {
    const d: Diapositiva = { tipo: "grafica", forma: "dona", titulo: "Dona", series: Array.from({ length: 5 }, (_, i) => ({ etiqueta: `P${i}`, valor: i + 1 })) };
    expect(repartirListas([d])).toEqual([d]);
  });
});

describe("tipo «grafica» en el esquema", () => {
  const conGrafica = (g: Record<string, unknown>) => {
    const p = base();
    p.diapositivas.splice(3, 0, { tipo: "grafica", titulo: "Gráfica", ...g });
    return validarPresentacion(p, "institucional");
  };
  it("acepta barras, columnas, dona y progreso con sus series numéricas", () => {
    for (const forma of ["barras", "columnas", "dona", "progreso"]) {
      const v = conGrafica({ forma, series: [{ etiqueta: "A", valor: 5, meta: 8 }, { etiqueta: "B", valor: "84,2 %" }] });
      expect(v.ok, forma).toBe(true);
      if (v.ok) {
        const g = v.presentacion.diapositivas.find((d): d is DGrafica => d.tipo === "grafica" && d.titulo === "Gráfica")!;
        expect(g.forma).toBe(forma);
        expect(g.series[1].valor).toBe(84.2);
        expect(g.series[0].meta).toBe(8);
      }
    }
  });
  it("una forma desconocida cae en «barras» y se anota; un valor no numérico es error", () => {
    const v = conGrafica({ forma: "pastel", series: [{ etiqueta: "A", valor: 1 }] });
    expect(v.ok && v.ajustes.join(" ")).toMatch(/pastel/);
    const mal = conGrafica({ forma: "barras", series: [{ etiqueta: "A", valor: "muchos" }] });
    expect(mal.ok).toBe(false);
    if (!mal.ok) expect(mal.errores.join(" ")).toMatch(/número no negativo/);
    expect(conGrafica({ forma: "barras", series: [{ etiqueta: "A", valor: -3 }] }).ok).toBe(false);
  });
  it("sin series o con una dona de una sola parte, error; una dona de más de 8 partes se recorta", () => {
    expect(conGrafica({ forma: "barras", series: [] }).ok).toBe(false);
    expect(conGrafica({ forma: "dona", series: [{ etiqueta: "A", valor: 1 }] }).ok).toBe(false);
    const v = conGrafica({ forma: "dona", series: Array.from({ length: 11 }, (_, i) => ({ etiqueta: `P${i}`, valor: i + 1 })) });
    expect(v.ok && (v.presentacion.diapositivas.find((d): d is DGrafica => d.tipo === "grafica" && d.titulo === "Gráfica")!.series.length)).toBe(MAX_ELEMENTOS_LAMINA.dona);
  });
  it("el título va en la banda (≤28 caracteres): uno más largo se recorta y se anota", () => {
    const v = conGrafica({ forma: "barras", titulo: "Un título de gráfica larguísimo", series: [{ etiqueta: "A", valor: 1 }] });
    expect(v.ok && v.ajustes.join(" ")).toMatch(/recortado/);
    expect(v.ok && v.presentacion.diapositivas.some((d) => d.tipo === "grafica" && d.titulo.length <= 28)).toBe(true);
  });
});

describe("verificar: los valores de la gráfica deben estar en el informe", () => {
  const conSeries = (forma: DGrafica["forma"], series: DGrafica["series"]) => {
    const p = JSON.parse(JSON.stringify(presentacionEjemplo));
    p.diapositivas = [p.diapositivas[0], { tipo: "grafica", forma, titulo: "Gráfica", series }, p.diapositivas[p.diapositivas.length - 1]];
    return p;
  };
  it("quita la serie cuyo valor o meta no está en el informe y lo anota", () => {
    const r = verificarPresentacion(conSeries("progreso", [{ etiqueta: "Artículos", valor: 9, meta: 12 }, { etiqueta: "Inventada", valor: 777 }, { etiqueta: "Meta falsa", valor: 5, meta: 99 }]), informeEjemplo);
    const g = r.presentacion.diapositivas[1] as DGrafica;
    expect(g.series.map((s) => s.etiqueta)).toEqual(["Artículos"]);
    expect(r.no_verificado.map((n) => n.campo)).toEqual(["series(Inventada)", "series(Meta falsa)"]);
    expect(r.no_verificado.every((n) => n.motivo === "cifra")).toBe(true);
  });
  it("acepta un decimal escrito como en el informe (84.2 ↔ «84,2 %») y el cero", () => {
    const r = verificarPresentacion(conSeries("barras", [{ etiqueta: "Permanencia", valor: 84.2 }, { etiqueta: "Nada", valor: 0 }]), informeEjemplo);
    expect(r.no_verificado).toEqual([]);
    expect((r.presentacion.diapositivas[1] as DGrafica).series).toHaveLength(2);
  });
  it("sin valores respaldados (o una dona con menos de 2) la diapositiva se quita", () => {
    expect(verificarPresentacion(conSeries("barras", [{ etiqueta: "X", valor: 4321 }]), informeEjemplo).presentacion.diapositivas.map((d) => d.tipo)).toEqual(["portada", "cierre"]);
    expect(verificarPresentacion(conSeries("dona", [{ etiqueta: "A", valor: 5 }, { etiqueta: "B", valor: 4321 }]), informeEjemplo).presentacion.diapositivas.map((d) => d.tipo)).toEqual(["portada", "cierre"]);
  });
});

describe("compactarInforme: el informe completo, sin podar de más", () => {
  const informeGrande = () => ({
    unidad: "Facultad",
    secciones: Array.from({ length: 6 }, (_, s) => ({
      titulo: `Sección ${s}`,
      texto: narracion(40, s * 40),
      metas: Array.from({ length: 15 }, (_, i) => ({ nombre: `Meta ${i}`, meta: "100", alcanzado: String(i), analisis: narracion(3) })),
      logros: Array.from({ length: 8 }, (_, i) => ({ titulo: `Logro ${i}`, resultado: narracion(2) })),
    })),
  });
  it("las narraciones de ~4 000 caracteres y las listas de 15 pasan casi enteras cuando caben", () => {
    expect(TEXTO_LARGO).toBeGreaterThanOrEqual(3000);
    const dato = { texto: narracion(25), filas: Array.from({ length: 70 }, (_, i) => ({ a: `fila ${i}` })) };
    const c = compactarInforme(dato);
    expect(c.recortado).toBe(false);
    expect(JSON.parse(c.texto).texto).toBe(dato.texto);
    expect(JSON.parse(c.texto).filas).toHaveLength(70);
  });
  it("respeta el presupuesto y lo avisa; primero recorta las listas largas y deja los textos", () => {
    const g = informeGrande();
    const c = compactarInforme(g);
    expect(c.texto.length).toBeLessThanOrEqual(PRESUPUESTO_INFORME);
    expect(c.recortado).toBe(true);
  });
  it("quita «—» y lo vacío, pero no corre las celdas de una fila", () => {
    const c = compactarInforme({ valor: "—", vacio: "", filas: [["a", "", "c"]], matriz: [{ x: 1 }], drive: [1] });
    const o = JSON.parse(c.texto);
    expect(o).toEqual({ filas: [["a", "", "c"]] });
  });
  it("conserva todas las secciones del informe de ejemplo (narraciones, plan, indicadores, logros, anexos, síntesis)", () => {
    const t = compactarInforme(informeEjemplo).texto;
    for (const x of ["Alineación estratégica", "Actualizar los currículos de pregrado", "Tasa de permanencia", "Cuatro currículos actualizados", "Acta del consejo de facultad", "Docencia y currículo", "evidencias.example.org"]) expect(t).toContain(x);
  });
});

describe("prompt: cobertura completa y gráficas", () => {
  it("pide narración fiel, todas las filas y explica cuándo usar cada forma de gráfica", () => {
    const s = mensajeSistema("institucional");
    expect(s).toMatch(/COBERTURA COMPLETA/);
    expect(s).toMatch(/casi tal cual/);
    expect(s).toMatch(/grafica: \{tipo, forma:/);
    for (const f of ["barras", "columnas", "dona", "progreso"]) expect(s).toContain(`"${f}"`);
    expect(s).toMatch(/NO INVENTAR/);
    expect(s).toContain(`≤${LIM.parrafo} c/u`);
  });
  it("pide más láminas por defecto y avisa cuando el informe se recortó", () => {
    const m = mensajeUsuario({ informe: informeEjemplo });
    expect(m).toMatch(/entre 1[0-9] y 2[0-9] diapositivas/);
    const grande = { texto: "palabra ".repeat(40_000) };
    expect(mensajeUsuario({ informe: grande })).toMatch(/se recortó/);
  });
});

describe("una narración metida en una tarjeta o un logro no se pierde", () => {
  it("la tarjeta la muestra recortada y el texto completo pasa a una diapositiva «texto» que la sigue", () => {
    const largo = narracion(5);
    const p = base();
    p.diapositivas[3].tarjetas[0].texto = largo;
    const v = validarPresentacion(p, "institucional");
    expect(v.ok).toBe(true);
    if (v.ok) {
      const ds = v.presentacion.diapositivas;
      expect(ds[3].tipo).toBe("tarjetas");
      expect(ds[4].tipo).toBe("texto");
      const t = ds[4] as DTexto;
      expect(t.parrafos!.join(" ")).toBe(largo);
      expect(t.titulo).toBe(p.diapositivas[3].tarjetas[0].titulo);
      expect((ds[3] as { tarjetas: { texto: string }[] }).tarjetas[0].texto.length).toBeLessThanOrEqual(LIM.tarjetaTexto);
    }
  });
  it("un texto algo largo (menos de 1,5 veces el límite) solo se recorta, sin lámina nueva", () => {
    const p = base();
    p.diapositivas[3].tarjetas[0].texto = "dato ".repeat(50).trim(); // 249
    const v = validarPresentacion(p, "institucional");
    expect(v.ok && v.presentacion.diapositivas[4].tipo).not.toBe("texto");
  });
});

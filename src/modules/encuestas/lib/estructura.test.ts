import { describe, expect, it } from "vitest";
import type { Aporte } from "../tipos";
import { agregarPregunta, antesDePublicar, duplicarPregunta, moverPregunta, ponerPreguntaAntesDe, puedePublicar, quitarPregunta, slugDe, slugLibre } from "./editor";
import type { DatosPublicacion } from "./editor";
import { cifraSospechosa, cumple, preguntasDe, preguntasVisibles, validarEstructura, validarRespuestas, valoresVisibles } from "./estructura";
import type { Estructura } from "./estructura";
import { cambiar, deshacer, iniciar, puedeDeshacer, puedeRehacer, rehacer } from "./historia";
import { aportesComoValores, ID_APORTES, ID_DEPENDENCIA, PLANTILLAS_ENCUESTA, plantillaDe } from "./plantillas";
import { conteoPorEstado, resultadoDe, resultadosDe } from "./resultados";

const satisfaccion = (): Estructura => (plantillaDe("satisfaccion") as NonNullable<ReturnType<typeof plantillaDe>>).estructura();

describe("validarEstructura", () => {
  it("todas las plantillas son válidas", () => {
    for (const p of PLANTILLAS_ENCUESTA) expect(validarEstructura(p.estructura()), p.codigo).toEqual([]);
  });

  it("rechaza lo que no es una estructura", () => {
    expect(validarEstructura(null)).not.toEqual([]);
    expect(validarEstructura({ version: 2, secciones: [] }).map((p) => p.ruta)).toContain("version");
    expect(validarEstructura({ version: 1, secciones: [] }).map((p) => p.ruta)).toContain("secciones");
  });

  it("detecta identificadores repetidos, opciones insuficientes y tipos desconocidos", () => {
    const e = satisfaccion();
    e.secciones[0].preguntas[1].id = e.secciones[0].preguntas[0].id;
    (e.secciones[0].preguntas[2] as { opciones?: unknown }).opciones = [{ id: "a", texto: "A" }];
    (e.secciones[0].preguntas[4] as { tipo: string }).tipo = "dibujo";
    const rutas = validarEstructura(e).map((p) => p.ruta);
    expect(rutas.some((r) => r.endsWith("[1].id"))).toBe(true);
    expect(rutas.some((r) => r.endsWith("[2].opciones"))).toBe(true);
    expect(rutas.some((r) => r.endsWith("[4].tipo"))).toBe(true);
  });

  it("«mostrar si» solo puede mirar una pregunta anterior", () => {
    const e = satisfaccion();
    e.secciones[0].preguntas[0].mostrarSi = { pregunta: "comentario", op: "responde" };
    expect(validarEstructura(e).some((p) => /anterior/.test(p.mensaje))).toBe(true);
    const f = satisfaccion();
    f.secciones[0].preguntas[0].mostrarSi = { pregunta: "inexistente", op: "responde" };
    expect(validarEstructura(f).some((p) => /anterior/.test(p.mensaje))).toBe(true);
  });

  it("revisa la escala y los rangos", () => {
    const e = satisfaccion();
    e.secciones[0].preguntas[1].validaciones = { escalaMin: 5, escalaMax: 1 };
    expect(validarEstructura(e).length).toBeGreaterThan(0);
  });
});

describe("lógica «mostrar si»", () => {
  it("evalúa los operadores", () => {
    expect(cumple({ pregunta: "a", op: "igual", valor: "si" }, { a: "si" })).toBe(true);
    expect(cumple({ pregunta: "a", op: "distinto", valor: "si" }, { a: "no" })).toBe(true);
    expect(cumple({ pregunta: "a", op: "distinto", valor: "si" }, {})).toBe(false);
    expect(cumple({ pregunta: "a", op: "igual", valor: "si" }, {})).toBe(false);
    expect(cumple({ pregunta: "a", op: "contiene", valor: "x" }, { a: ["x", "y"] })).toBe(true);
    expect(cumple({ pregunta: "a", op: "mayor", valor: 3 }, { a: 4 })).toBe(true);
    expect(cumple({ pregunta: "a", op: "menor", valor: 3 }, { a: 4 })).toBe(false);
    expect(cumple({ pregunta: "a", op: "responde" }, { a: "" })).toBe(false);
    expect(cumple({ pregunta: "a", op: "vacio" }, { a: [] })).toBe(true);
  });

  it("oculta preguntas y no pide lo oculto", () => {
    const e = satisfaccion();
    expect(preguntasVisibles(e, { volveria: "si" }).map((p) => p.id)).not.toContain("porque_no");
    expect(preguntasVisibles(e, { volveria: "no" }).map((p) => p.id)).toContain("porque_no");
    const errores = validarRespuestas(e, { servicio: "Biblioteca", satisfaccion: 4, volveria: "si" });
    expect(errores).toEqual({});
  });

  it("una pregunta que depende de una oculta se oculta con ella", () => {
    const e = satisfaccion();
    e.secciones[0].preguntas.push({ id: "detalle", tipo: "texto_corto", enunciado: "Detalle", obligatoria: true, mostrarSi: { pregunta: "porque_no", op: "responde" } });
    expect(preguntasVisibles(e, { volveria: "si", porque_no: "algo" }).map((p) => p.id)).not.toContain("detalle");
    expect(valoresVisibles(e, { volveria: "si", porque_no: "algo", servicio: "x" })).toEqual({ volveria: "si", servicio: "x" });
  });

  it("valida las respuestas por tipo", () => {
    const e = satisfaccion();
    const errores = validarRespuestas(e, { servicio: "", satisfaccion: 9, volveria: "quizas" });
    expect(Object.keys(errores).sort()).toEqual(["satisfaccion", "servicio", "volveria"]);
  });

  it("cifras: mínimo, entero y porcentaje", () => {
    const e = plantillaDe("evento")!.estructura();
    const q = e.secciones[1].preguntas[1];
    expect(validarRespuestas(e, { nombre: "Ana", correo: "a@b.co", dia: ["manana"], acompanantes: 9 })[q.id]).toMatch(/máximo/);
    expect(validarRespuestas(e, { nombre: "Ana", correo: "a@b.co", dia: ["manana"], acompanantes: 1.5 })[q.id]).toMatch(/entero/);
    expect(validarRespuestas(e, { nombre: "Ana", correo: "no", dia: ["manana"] }).correo).toMatch(/correo/);
  });
});

describe("cifras que parecen absurdas", () => {
  const q = { id: "n", tipo: "cifra" as const, enunciado: "Estudiantes", obligatoria: true, validaciones: { unidad: "estudiantes" } };
  it("pide confirmar una cifra enorme o fuera de lo que definió el editor", () => {
    expect(cifraSospechosa(q, 412)).toBeNull();
    expect(cifraSospechosa(q, 4_000_000)).toMatch(/Confírmelo/);
    expect(cifraSospechosa({ ...q, pilo: { explicacion: "", confirmarSi: { menorA: 10 } } }, 3)).toMatch(/menos/);
    expect(cifraSospechosa({ ...q, validaciones: { unidad: "porcentaje" } }, 0.4)).toMatch(/fracción/);
  });
});

describe("rendicion-2026 en el modelo nuevo", () => {
  const aporte = (id: string, tipo: "logro" | "reto", t: string): Aporte => ({
    id,
    encuesta_id: "e",
    correo: "a@udes.edu.co",
    correo_verificado: true,
    dependencia: "Biblioteca",
    tipo,
    titulo: t,
    descripcion: "Una descripción suficientemente larga para ser válida.",
    estado: "recibido",
    created_at: id === "1" ? "2026-10-01T10:00:00Z" : "2026-10-02T10:00:00Z",
    cifras: [{ id: `c${id}`, aporte_id: id, orden: 0, que: "Estudiantes", tipo: "estudiantes", otro: null, valor: 412 }],
  });

  it("la plantilla tiene la dependencia y el bloque de aportes", () => {
    const e = plantillaDe("rendicion")!.estructura();
    expect(preguntasDe(e).map((p) => [p.id, p.tipo])).toEqual([[ID_DEPENDENCIA, "texto_corto"], [ID_APORTES, "bloque_logro_reto"]]);
  });

  it("lo recibido se lee como una respuesta del modelo nuevo y pasa la validación", () => {
    const e = plantillaDe("rendicion")!.estructura();
    const valores = aportesComoValores("Biblioteca", [aporte("2", "reto", "Digitalizar el fondo"), aporte("1", "logro", "Acreditación del programa")]);
    expect((valores[ID_APORTES] as { titulo: string }[]).map((i) => i.titulo)).toEqual(["Acreditación del programa", "Digitalizar el fondo"]);
    expect(validarRespuestas(e, valores)).toEqual({});
  });

  it("un aporte con descripción corta no pasa, igual que en la encuesta vieja", () => {
    const e = plantillaDe("rendicion")!.estructura();
    const valores = aportesComoValores("Biblioteca", [{ ...aporte("1", "logro", "Acreditación"), descripcion: "corta" }]);
    expect(validarRespuestas(e, valores)[ID_APORTES]).toMatch(/descripción/);
  });
});

describe("editor: operaciones sobre la estructura", () => {
  it("agrega, duplica y quita preguntas con ids únicos", () => {
    let e = satisfaccion();
    const a = agregarPregunta(e, e.secciones[0].id, "fecha");
    e = a.estructura;
    const d = duplicarPregunta(e, a.id);
    expect(d.id).not.toBe(a.id);
    expect(new Set(preguntasDe(d.estructura).map((p) => p.id)).size).toBe(preguntasDe(d.estructura).length);
    expect(validarEstructura(d.estructura)).toEqual([]);
    expect(preguntasDe(quitarPregunta(d.estructura, a.id)).some((p) => p.id === a.id)).toBe(false);
  });

  it("quitar una pregunta limpia las condiciones que la miraban", () => {
    const e = quitarPregunta(satisfaccion(), "volveria");
    expect(preguntasDe(e).find((p) => p.id === "porque_no")?.mostrarSi).toBeUndefined();
    expect(validarEstructura(e)).toEqual([]);
  });

  it("reordena sin dejar una condición mirando hacia adelante", () => {
    const e = satisfaccion();
    // «porque_no» depende de «volveria»: si «volveria» baja detrás, la condición cae.
    const m = moverPregunta(moverPregunta(e, "volveria", 1), "volveria", 1);
    expect(validarEstructura(m)).toEqual([]);
    expect(preguntasDe(m).find((p) => p.id === "porque_no")?.mostrarSi).toBeUndefined();
    expect(preguntasDe(moverPregunta(e, "servicio", -1)).map((p) => p.id)).toEqual(preguntasDe(e).map((p) => p.id));
  });

  it("arrastrar una pregunta antes de otra", () => {
    const e = satisfaccion();
    const m = ponerPreguntaAntesDe(e, "comentario", "servicio");
    expect(preguntasDe(m)[0].id).toBe("comentario");
    expect(preguntasDe(ponerPreguntaAntesDe(e, "servicio", null, e.secciones[0].id)).at(-1)?.id).toBe("servicio");
  });
});

describe("historia (deshacer y rehacer)", () => {
  it("junta los cambios de la misma clave y permite ir y volver", () => {
    let h = iniciar("a");
    h = cambiar(h, "ab", "titulo");
    h = cambiar(h, "abc", "titulo");
    expect(h.pasado).toEqual(["a"]);
    h = cambiar(h, "otra", "enunciado");
    h = deshacer(h);
    expect(h.presente).toBe("abc");
    h = deshacer(h);
    expect(h.presente).toBe("a");
    expect(puedeDeshacer(h)).toBe(false);
    expect(puedeRehacer(h)).toBe(true);
    h = rehacer(rehacer(h));
    expect(h.presente).toBe("otra");
    expect(cambiar(deshacer(h), "nuevo").futuro).toEqual([]);
  });
});

describe("antes de publicar", () => {
  const datos: DatosPublicacion = { titulo: "Satisfacción 2026", acceso: "microsoft", dominios: ["udes.edu.co"], cierra_el: null, abre_el: null, mensaje_cierre: "Gracias.", intro: "Hola", despedida: "Chao", verificacionRobots: false, pideDatosPersonales: false, consentimiento: "" };
  it("una encuesta completa se puede publicar", () => {
    expect(puedePublicar(antesDePublicar(satisfaccion(), datos))).toBe(true);
  });
  it("señala lo que falta; abierta exige robots y consentimiento si pide datos", () => {
    const l = antesDePublicar(satisfaccion(), { ...datos, acceso: "abierta", pideDatosPersonales: true, intro: "" });
    expect(l.filter((r) => !r.cumple).map((r) => r.id).sort()).toEqual(["consentimiento", "intro", "robots"]);
    expect(puedePublicar(antesDePublicar(satisfaccion(), { ...datos, dominios: [] }))).toBe(false);
    const conArchivo = agregarPregunta(satisfaccion(), "experiencia", "archivo").estructura;
    expect(antesDePublicar(conArchivo, datos).find((r) => !r.cumple)?.id).toBe("archivos");
    expect(puedePublicar(antesDePublicar(satisfaccion(), { ...datos, abre_el: "2026-12-01", cierra_el: "2026-11-01" }))).toBe(false);
  });
});

describe("resultados", () => {
  const e = satisfaccion();
  const r = (id: string, valores: Record<string, unknown>, extra = {}) => ({ id, estado: "recibido" as const, valores: valores as never, ...extra });
  const respuestas = [r("1", { satisfaccion: 5, volveria: "si" }), r("2", { satisfaccion: 5, volveria: "no" }), r("3", { satisfaccion: 3, volveria: "si" }), r("4", { satisfaccion: 1 }, { borrado_en: "2026-10-01" }), r("5", {}, { estado: "revisado" as const })];

  it("cuenta por estado y deja fuera lo borrado", () => {
    const c = Object.fromEntries(conteoPorEstado(respuestas).map((x) => [x.estado, x.n]));
    expect(c).toEqual({ recibido: 3, revisado: 1, para_video: 0, rechazado: 0, descartado: 0 });
  });

  it("reparte una escala y una opción única", () => {
    const esc = resultadoDe(e.secciones[0].preguntas[1], respuestas);
    expect(esc.tipo === "reparto" && esc.respondieron).toBe(3);
    expect(esc.tipo === "reparto" && esc.barras.map((b) => b.n)).toEqual([0, 0, 1, 0, 2]);
    expect(esc.tipo === "reparto" && Math.max(...esc.barras.map((b) => b.parte))).toBe(1);
    const op = resultadoDe(e.secciones[0].preguntas[2], respuestas);
    expect(op.tipo === "reparto" && op.barras.find((b) => b.clave === "si")?.n).toBe(2);
    expect(resultadosDe(e, respuestas)).toHaveLength(5);
  });

  it("resume cifras y bloques", () => {
    const ev = plantillaDe("evento")!.estructura();
    const num = resultadoDe(ev.secciones[1].preguntas[1], [r("1", { acompanantes: 2 }), r("2", { acompanantes: 4 })]);
    expect(num.tipo === "numerico" && [num.promedio, num.minimo, num.maximo, num.suma]).toEqual([3, 2, 4, 6]);
    const ren = plantillaDe("rendicion")!.estructura();
    const bl = resultadoDe(ren.secciones[1].preguntas[0], [r("1", { aportes: [{ tipo: "logro", titulo: "x", descripcion: "y", cifras: [{ que: "a", tipo: "otro", valor: 1 }] }, { tipo: "reto", titulo: "x", descripcion: "y", cifras: [] }] })]);
    expect(bl.tipo === "bloque" && [bl.logros, bl.retos, bl.cifras]).toEqual([1, 1, 1]);
  });
});

describe("enlace de una encuesta nueva", () => {
  it("quita tildes y símbolos y evita repetidos", () => {
    expect(slugDe("Satisfacción 2026 · Biblioteca")).toBe("satisfaccion-2026-biblioteca");
    expect(slugDe("¡¡¡")).toBe("encuesta");
    expect(slugDe("x".repeat(80)).length).toBeLessThanOrEqual(50);
    expect(slugLibre("Evento", ["evento", "evento-2"])).toBe("evento-3");
    expect(slugLibre("Otro", ["evento"])).toBe("otro");
  });
});

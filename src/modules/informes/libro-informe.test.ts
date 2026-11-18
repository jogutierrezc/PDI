import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLUMNAS_LIBRO_RESULTADOS, criteriosDe, leerFilasIndicadores, normalizar, opcionesPilar } from "./indicadores-manual";
import type { IndicadorManual } from "./indicadores-manual";
import { PLANTILLAS } from "./plantillas";
import {
  FILA_ENCABEZADO,
  HOJA_CONTROL,
  HOJA_LISTAS,
  HOJA_PORTADA,
  armarLibro,
  armarLibrosPorEquipo,
  aplicar,
  clasificar,
  destinosDe,
  elegirDestino,
  fusionarFilas,
  huellaDe,
  leerLibro,
  validarControl,
} from "./libro-informe";
import type { EntradaAplicar, EntradaLibro, ModoAplicacion } from "./libro-informe";
import { construirLibro, leerLibroCompleto } from "./ui/excel";
import type { HojaExcel, HojaLeida } from "./ui/excel";
import type { AnexoRow, ContenidoSeccion, PilarRef, Plantilla } from "./types";

const PILARES: PilarRef[] = [
  { id: "p1", numeral: "1", name: "Formación integral", progress: 40 },
  { id: "p2", numeral: "2", name: "Investigación con impacto", progress: null },
];
const ANEXOS: AnexoRow[] = [
  { id: "a1", instancia_id: "i1", n: 1, nombre: "Acta del comité", tipo: "archivo", ruta: "x/y.pdf", descripcion: "Respalda la meta" },
  { id: "a2", instancia_id: "i1", n: 2, nombre: "Convenio", tipo: "url", ruta: "https://udrive.example/c", descripcion: "Convenio firmado" },
];

function entrada(plantilla: Plantilla, contenidos: EntradaLibro["contenidos"] = {}): EntradaLibro {
  return { ciclo: { id: "ciclo-1", anio: 2026 }, instancia: "inst-1", unidad: "Facultad de Ingeniería", plantilla, secciones: PLANTILLAS[plantilla].secciones, contenidos, aprobados: [], pilares: PILARES, anexos: ANEXOS, fecha: "2026-11-01" };
}

const claveDe = (p: Plantilla, tipo: string) => PLANTILLAS[p].secciones.find((s) => s.tipo === tipo)!.clave;

/** Lo que dejaría Excel al guardar el libro: texto por celda, con los números sin formato. */
function comoLeido(hojas: HojaExcel[]): HojaLeida[] {
  return hojas.map((h) => {
    const filas: string[][] = [];
    if (h.banner) {
      filas.push([h.banner.titulo], [h.banner.subtitulo ?? ""], [h.banner.ayuda ?? ""]);
    }
    filas.push(h.columnas.map((c) => c.titulo));
    for (const f of h.filas) filas.push(f.map((v) => (v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : v)));
    return { nombre: h.nombre, oculta: Boolean(h.oculta), filas };
  });
}

/** Un libro tal como lo devuelve una persona de otra oficina: sin _Control y con sus propios nombres. */
const hoja = (nombre: string, filas: string[][]): HojaLeida => ({ nombre, oculta: false, filas });

const contenidoCompleto = (p: Plantilla): EntradaLibro["contenidos"] => {
  const c: EntradaLibro["contenidos"] = {};
  for (const s of PLANTILLAS[p].secciones) {
    if (s.tipo === "narr") c[s.clave] = { texto: `Texto de ${s.titulo}` };
    if (s.tipo === "metas") c[s.clave] = { metas: [{ meta: "Graduar 120 estudiantes", programado: 120, alcanzado: 104 }, { meta: "Abrir convenios", programado: 4, alcanzado: null }] };
    if (s.tipo === "logros") c[s.clave] = { logros: [{ titulo: "Primer ensayo", resultado: "Se firmó con una universidad de México", anexo: 2 }] };
    if (s.tipo === "filas") c[s.clave] = { filas: (s.columnas ?? []).length === 5 ? [["Investigación", "Pocos semilleros", "Convocar grupos", "Segundo semestre", "$ 4.000.000"]] : [["Reto 1", "Aprendizaje 1", "Oportunidad 1", "Propuesta 1"]] };
    if (s.tipo === "pdi") c[s.clave] = { alineacion: [{ pilar: "p1", aporte: "Aportamos formación con docentes", acciones: [] }], pilares: ["p1"] };
    if (s.tipo === "dim") {
      const ind: IndicadorManual[] = [
        { id: "x1", criterio: "inv", criterio_nombre: "Investigación", nombre: "Semilleros activos", unidad: "", mayorMejor: true, anterior: 9, actual: 12.5, meta: 15, fuente: "Registro", nota: "Subió", pilar: "p2", evidencias: [1, 2] },
        { id: "x2", criterio: "ens", criterio_nombre: "Enseñanza", nombre: "Deserción", unidad: " %", mayorMejor: false, anterior: 8, actual: 6, meta: 5, fuente: "SPADIES", nota: "" },
        { id: "x3", criterio: "ext", criterio_nombre: "Extensión", nombre: "Tutorías", unidad: "", mayorMejor: true, anterior: null, actual: null, meta: null, fuente: "Acta", nota: "", tipo: "accion", descripcion: "Acompañamiento", avance_texto: "12 grupos", finalizacion: "2027", proyeccion_texto: "Ampliar", proyeccion_num: 20 },
      ];
      c[s.clave] = { indicadores: ind, criterios_reporta: ["inv", "ens", "ext"] };
    }
  }
  return c;
};

const ctxDe = (e: EntradaLibro, contenidos = e.contenidos): EntradaAplicar["contexto"] => ({ secciones: e.secciones, contenidos, aprobados: [], pilares: opcionesPilar(PILARES), anexos: ANEXOS });

function importar(e: EntradaLibro, leidas: HojaLeida[], modo: ModoAplicacion, contenidos = e.contenidos, extra: Partial<EntradaAplicar> = {}) {
  const libro = leerLibro(leidas);
  const destinos = destinosDe(e.secciones);
  const propuestas = clasificar(libro.bloques, destinos, libro.control);
  return { libro, destinos, propuestas, r: aplicar({ bloques: libro.bloques, propuestas, contexto: ctxDe(e, contenidos), modo, estado: "draft", rol: "jefe", ...extra }) };
}

describe("armado del libro por plantilla", () => {
  for (const p of ["A", "B", "C", "D"] as Plantilla[]) {
    it(`plantilla ${p}: portada, una hoja por sección, Listas y _Control ocultas`, () => {
      const e = entrada(p);
      const hojas = armarLibro(e);
      expect(hojas[0].nombre).toBe(HOJA_PORTADA);
      expect(hojas.at(-2)?.nombre).toBe(HOJA_LISTAS);
      expect(hojas.at(-1)?.nombre).toBe(HOJA_CONTROL);
      expect(hojas.at(-2)?.oculta).toBe(true);
      expect(hojas.at(-1)?.oculta).toBe(true);
      const nombres = hojas.map((h) => h.nombre);
      expect(new Set(nombres).size).toBe(nombres.length);
      expect(nombres.every((n) => n.length <= 31 && !/[\\/?*[\]:]/.test(n))).toBe(true);
      // Una hoja por sección y, en las que eligen criterios, otra de criterios.
      const conCriterios = e.secciones.filter((s) => s.tipo === "dim" && !s.consolida).length;
      expect(hojas.length).toBe(1 + e.secciones.length + conCriterios + 2);
      for (const s of e.secciones) expect(nombres.some((n) => n.startsWith(`${String(e.secciones.indexOf(s) + 1).padStart(2, "0")} `))).toBe(true);
      const control = hojas.at(-1)!;
      const claves = control.filas.map((f) => f[0]);
      expect(claves).toEqual(expect.arrayContaining(["ciclo", "plantilla", "version_libro", "instancia", "huella", ...e.secciones.map((s) => s.clave)]));
      expect(control.filas.find((f) => f[0] === "plantilla")?.[1]).toBe(p);
    });
  }

  it("las hojas con banda tienen el encabezado en la fila 4 y colores por columna", () => {
    const hojas = armarLibro(entrada("B"));
    const metas = hojas.find((h) => h.nombre.includes("Objetivos"))!;
    expect(metas.banner?.titulo).toBeTruthy();
    expect(metas.tipos).toEqual(["obligatoria", "obligatoria", "diligenciar", "bloqueada"]);
    expect(FILA_ENCABEZADO).toBe(4);
  });

  it("la sección que Planeación desactivó no va en el libro", () => {
    const e = entrada("B");
    const sin = { ...e, secciones: e.secciones.filter((s) => s.tipo !== "logros") };
    expect(armarLibro(sin).some((h) => /Logros/.test(h.nombre))).toBe(false);
  });

  it("la hoja de resultados usa las columnas del codec de indicadores y lo lee", () => {
    const e = entrada("A", contenidoCompleto("A"));
    const hojas = armarLibro(e);
    const dim = hojas.find((h) => h.nombre.includes("Resultados"))!;
    expect(dim.columnas.map((c) => c.titulo)).toEqual([...COLUMNAS_LIBRO_RESULTADOS]);
    const k = claveDe("A", "dim");
    const criterios = criteriosDe(e.secciones.find((s) => s.clave === k)!.dims ?? [], [], [], true);
    const textos = dim.filas.map((f) => f.map((v) => (v === null ? "" : String(v))));
    const r = leerFilasIndicadores([dim.columnas.map((c) => c.titulo), ...textos], criterios, "", opcionesPilar(PILARES));
    expect(r.avisos).toEqual([]);
    expect(r.indicadores).toHaveLength(3);
    expect(r.indicadores[0]).toMatchObject({ nombre: "Semilleros activos", pilar: "p2", evidencias: [1, 2], actual: 12.5 });
    expect(r.indicadores[2]).toMatchObject({ tipo: "accion", descripcion: "Acompañamiento", proyeccion_num: 20 });
    // El estado lo calcula el sistema: sale en la última columna y no se lee.
    expect(textos[0].at(-1)).toBe("Parcial");
  });

  it("un libro sin contenido trae filas de ejemplo marcadas para borrar", () => {
    const hojas = armarLibro(entrada("B"));
    const logros = hojas.find((h) => h.nombre.includes("Logros"))!;
    expect(String(logros.filas[0][0])).toMatch(/\(borre esta fila\)/);
  });
});

describe("ida y vuelta (archivo real de exceljs)", () => {
  it("exportar el contenido, leerlo y aplicarlo a un informe vacío da el mismo contenido", async () => {
    const e = entrada("A", contenidoCompleto("A"));
    const logo = readFileSync(new URL("../../../public/logo-udes-blanco.png", import.meta.url)).toString("base64");
    const buffer = await construirLibro(armarLibro(e), { logo });
    const leidas = await leerLibroCompleto(buffer);
    expect(leidas.find((h) => h.nombre === HOJA_CONTROL)?.oculta).toBe(true);
    expect(leidas.find((h) => h.nombre === HOJA_LISTAS)?.oculta).toBe(true);
    const vacio = entrada("A", {});
    const { r, propuestas, libro } = importar(vacio, leidas, "reemplazar", {});
    expect(libro.control?.valores.instancia).toBe("inst-1");
    expect(propuestas.filter((p) => p.destino).every((p) => p.origen === "control" && p.puntaje === 1)).toBe(true);
    for (const s of e.secciones) {
      const orig = e.contenidos[s.clave] ?? {};
      const nuevo = r.contenidos[s.clave];
      if (s.tipo === "narr") expect(nuevo?.texto).toBe(orig.texto);
      if (s.tipo === "metas") expect(nuevo?.metas).toEqual(orig.metas);
      if (s.tipo === "logros") expect(nuevo?.logros).toEqual(orig.logros);
      if (s.tipo === "filas") expect(nuevo?.filas).toEqual(orig.filas);
      if (s.tipo === "pdi") expect(nuevo?.alineacion?.map((a) => [a.pilar, a.aporte])).toEqual(orig.alineacion?.map((a) => [a.pilar, a.aporte]));
      if (s.tipo === "dim") {
        const sinId = (l?: IndicadorManual[]) => normalizar(l).map(({ id: _i, ...x }) => x);
        expect(sinId(nuevo?.indicadores)).toEqual(sinId(orig.indicadores));
        expect([...(nuevo?.criterios_reporta ?? [])].sort()).toEqual([...(orig.criterios_reporta ?? [])].sort());
      }
    }
    // La evidencia que ya estaba cargada no se vuelve a pedir.
    expect(r.evidencias).toEqual([]);
  });
});

describe("clasificar", () => {
  const e = entrada("B");
  const destinos = destinosDe(e.secciones);

  it("el libro del sistema se reconoce al 100 % por _Control, aunque renombren la hoja con su número", () => {
    const hojas = comoLeido(armarLibro(entrada("B", contenidoCompleto("B"))));
    const logros = hojas.find((h) => h.nombre.includes("Logros"))!;
    logros.nombre = "05 Lo mejor del año";
    const libro = leerLibro(hojas);
    const props = clasificar(libro.bloques, destinos, libro.control);
    expect(props.every((p) => p.puntaje === 1 && p.origen === "control")).toBe(true);
    expect(props.find((p) => p.hoja.includes("Anexos"))).toMatchObject({ destino: null, referencia: true });
    expect(props.find((p) => p.hoja === "05 Lo mejor del año")?.destino).toBe(claveDe("B", "logros"));
    // Portada, Listas y _Control no se clasifican.
    expect(libro.bloques.some((b) => [HOJA_PORTADA, HOJA_LISTAS, HOJA_CONTROL].includes(b.hoja))).toBe(false);
  });

  const terceros = [
    hoja("Hoja1 - metas", [["Meta del programa", "Prog.", "Logrado"], ["Graduar 40 estudiantes", "40", "36"], ["Abrir 2 convenios", "2", "3"]]),
    hoja("Lo mejor del año", [["Título", "Qué pasó", "Anexo"], ["Primer ensayo", "Se firmó con México", "2"]]),
    hoja("Indicadores 2026", [["Criterio", "Tipo", "Indicador", "Unidad", "Anterior", "Actual", "Meta", "Fuente"], ["Investigación", "Cifra", "Semilleros activos", "", "9", "12", "15", "Registro"]]),
    hoja("Soportes", [["No.", "Archivo", "Para qué sirve", "Link"], ["1", "Acta", "Respalda", "https://udrive.example/a1"]]),
    hoja("Contactos", [["Nombre", "Correo"], ["Equipo", "x@example.edu"]]),
    hoja("Notas", [["Observaciones"], ["Quedó pendiente cerrar la matrícula."]]),
  ];

  it("un libro de terceros se reconoce por encabezados con su confianza", () => {
    const libro = leerLibro(terceros);
    expect(libro.control).toBeNull();
    const props = clasificar(libro.bloques, destinos, libro.control);
    const de = (h: string) => props.find((p) => p.hoja === h)!;
    expect(de("Hoja1 - metas")).toMatchObject({ destino: claveDe("B", "metas"), nivel: "reconocida", origen: "encabezados" });
    expect(de("Lo mejor del año")).toMatchObject({ destino: claveDe("B", "logros"), nivel: "reconocida" });
    expect(de("Indicadores 2026")).toMatchObject({ destino: claveDe("B", "dim"), nivel: "reconocida" });
    expect(de("Soportes")).toMatchObject({ destino: claveDe("B", "evid"), nivel: "reconocida" });
  });

  it("una hoja de contactos queda sin destino", () => {
    const libro = leerLibro(terceros);
    const p = clasificar(libro.bloques, destinos, null).find((x) => x.hoja === "Contactos")!;
    expect(p).toMatchObject({ destino: null, nivel: "sin" });
    expect(p.puntaje).toBeLessThan(0.4);
  });

  it("una hoja de una sola columna es ambigua: pide revisar y no se reconoce sola", () => {
    const libro = leerLibro(terceros);
    const p = clasificar(libro.bloques, destinos, null).find((x) => x.hoja === "Notas")!;
    expect(p.nivel).toBe("revisar");
    expect(p.puntaje).toBeGreaterThanOrEqual(0.4);
    expect(p.puntaje).toBeLessThan(0.75);
  });

  it("elegir «No importar» deja la hoja fuera y elegir otra sección la puntúa", () => {
    const libro = leerLibro(terceros);
    const b = libro.bloques.find((x) => x.hoja === "Contactos")!;
    expect(elegirDestino(b, null)).toMatchObject({ destino: null, origen: "manual" });
    const d = destinos.find((x) => x.id === claveDe("B", "evid"))!;
    expect(elegirDestino(b, d)).toMatchObject({ destino: d.id, origen: "manual" });
  });

  it("la banda de título de una celda no se confunde con el encabezado", () => {
    const hojas = comoLeido(armarLibro(entrada("B")));
    const libro = leerLibro(hojas);
    const b = libro.bloques.find((x) => x.hoja.includes("Logros"))!;
    expect(b.fila).toBe(4);
    expect(b.encabezados).toEqual(["Logro", "Contexto y resultado", "N.º de anexo"]);
    // Sin _Control, el mismo libro también encuentra el encabezado (la banda tiene una celda).
    const sin = leerLibro(hojas.filter((h) => h.nombre !== HOJA_CONTROL));
    expect(sin.bloques.find((x) => x.hoja.includes("Logros"))?.fila).toBe(4);
  });
});

describe("rechazo de otro informe", () => {
  const e = entrada("B");
  const esperado = { ciclo: "ciclo-1", instancia: "inst-1", plantilla: "B", huella: huellaDe("B", e.secciones) };
  const control = () => leerLibro(comoLeido(armarLibro(e))).control;

  it("acepta su propio libro", () => {
    expect(validarControl(control(), esperado)).toEqual({ avisos: [] });
  });
  it("rechaza el libro de otra unidad o de otro ciclo con un mensaje claro", () => {
    const r = validarControl(control(), { ...esperado, instancia: "otra" });
    expect(r.error).toMatch(/otro|no corresponde/i);
    expect(r.error).toContain("Facultad de Ingeniería");
    expect(validarControl(control(), { ...esperado, ciclo: "ciclo-2" }).error).toMatch(/otro ciclo/);
    expect(validarControl(control(), { ...esperado, plantilla: "A" }).error).toMatch(/plantilla/);
  });
  it("avisa, sin rechazar, si la huella de la estructura cambió", () => {
    const r = validarControl(control(), { ...esperado, huella: "00000000" });
    expect(r.error).toBeUndefined();
    expect(r.avisos[0]).toMatch(/estructura/);
  });
  it("la huella cambia con la estructura y no con el título", () => {
    const base = huellaDe("B", e.secciones);
    expect(huellaDe("B", e.secciones.slice(1))).not.toBe(base);
    expect(huellaDe("B", e.secciones.map((s) => ({ ...s, titulo: s.titulo + " 2" })))).toBe(base);
  });
  it("un libro sin _Control no se valida (es de terceros)", () => {
    expect(validarControl(null, esperado)).toEqual({ avisos: [] });
  });
});

describe("avisos por fila", () => {
  const e = entrada("A");
  const f = "Dimensión";
  it("falta un campo obligatorio, una columna que no está y un número que no lo es", () => {
    const leidas = [
      hoja("Críticos", [[f, "Punto crítico", "Acción", "Tiempo"], ["Investigación", "Pocos semilleros", "", "Marzo"], ["Extensión", "Convenios", "Visitar", "Abril"]]),
      hoja("Metas", [["Objetivo", "Programado", "Alcanzado"], ["Graduar", "mucho", "3"], ["", "5", ""]]),
    ];
    const { r } = importar(e, leidas, "agregar", {});
    const texto = r.avisos.join("\n");
    expect(texto).toMatch(/«Críticos», fila 2: falta «Acción»/);
    expect(texto).toMatch(/no hay columna para|sin columna para «Recursos»/);
    expect(texto).toMatch(/«mucho» no es un número en Programado/);
    expect(texto).toMatch(/«Metas», fila 3: falta «Objetivo o meta anual»/);
    expect(r.totales.conAviso).toBeGreaterThanOrEqual(3);
    expect(r.totales.listas).toBeGreaterThanOrEqual(1);
  });

  it("cifras sin actual o acciones sin descripción se avisan por nombre; nunca se inventa una cifra", () => {
    const leidas = [hoja("Resultados", [["Criterio", "Tipo", "Indicador", "Anterior", "Actual", "Meta"], ["Investigación", "Cifra", "Semilleros", "9", "", "15"], ["Extensión", "Acción", "Tutorías", "", "", ""]])];
    const { r } = importar(e, leidas, "agregar", {});
    const ind = Object.values(r.contenidos).flatMap((c) => c.indicadores ?? []);
    expect(ind[0].actual).toBeNull();
    expect(ind[0].anterior).toBe(9);
    expect(r.avisos.join("\n")).toMatch(/«Semilleros»: falta la cifra actual/);
    expect(r.avisos.join("\n")).toMatch(/«Tutorías»: falta la descripción/);
  });

  it("las filas de ejemplo sin borrar se omiten con aviso", () => {
    const leidas = [hoja("Logros", [["Logro", "Contexto y resultado", "N.º de anexo"], ["Ejemplo: algo (borre esta fila)", "x", "1"], ["Real", "Algo pasó", ""]])];
    const { r } = importar(e, leidas, "agregar", {});
    const k = claveDe("A", "logros");
    expect(r.contenidos[k].logros).toHaveLength(1);
    expect(r.avisos.join("\n")).toMatch(/ejemplo se omitió/);
  });
});

describe("modos de aplicación", () => {
  const e = entrada("B");
  const k = claveDe("B", "logros");
  const km = claveDe("B", "metas");
  const kn = claveDe("B", "narr");
  const previo = { [k]: { logros: [{ titulo: "Primer ensayo", resultado: "", anexo: null }, { titulo: "Otro", resultado: "Ya escrito", anexo: 1, drive: [{ archivoId: "d1", tipo: "tabla" as const, titulo: "T", nota: "" }] }] }, [km]: { metas: [{ meta: "Graduar", programado: 10, alcanzado: null }] }, [kn]: { texto: "Texto previo" } };
  const libro = [
    hoja("Logros", [["Logro", "Contexto y resultado", "N.º de anexo"], ["Primer ensayo", "Se firmó con México", "2"], ["Nuevo logro", "Un resultado", ""], ["Otro", "Otro texto", "5"]]),
    hoja("Metas", [["Objetivo o meta anual", "Programado", "Alcanzado"], ["Graduar", "10", "9"]]),
  ];

  it("agregar suma al final y no repite lo idéntico", () => {
    const { r } = importar(e, libro, "agregar", previo);
    const l = r.contenidos[k].logros!;
    expect(l.map((x) => x.titulo)).toEqual(["Primer ensayo", "Otro", "Primer ensayo", "Nuevo logro", "Otro"]);
    expect(r.secciones.find((s) => s.clave === k)?.agregadas).toBe(3);
  });

  it("llenar solo lo vacío completa celdas vacías por clave, suma lo nuevo y no pisa lo escrito", () => {
    const { r } = importar(e, libro, "vacios", previo);
    const l = r.contenidos[k].logros!;
    expect(l.find((x) => x.titulo === "Primer ensayo")).toMatchObject({ resultado: "Se firmó con México", anexo: 2 });
    expect(l.find((x) => x.titulo === "Otro")).toMatchObject({ resultado: "Ya escrito", anexo: 1 });
    expect(l.find((x) => x.titulo === "Otro")?.drive).toHaveLength(1);
    expect(l.map((x) => x.titulo)).toContain("Nuevo logro");
    expect(l).toHaveLength(3);
    expect(r.contenidos[km].metas).toEqual([{ meta: "Graduar", programado: 10, alcanzado: 9 }]);
  });

  it("reemplazar deja solo lo del libro (y conserva las tablas de UDrive de un logro que sigue)", () => {
    const { r } = importar(e, libro, "reemplazar", previo);
    expect(r.contenidos[k].logros!.map((x) => x.titulo)).toEqual(["Primer ensayo", "Nuevo logro", "Otro"]);
    expect(r.contenidos[k].logros!.find((x) => x.titulo === "Otro")?.drive).toHaveLength(1);
  });

  it("el texto: agregar suma un párrafo, vacíos no pisa y reemplazar sustituye", () => {
    const hojaTexto = [hoja("Resumen", [["Texto de la sección", "Palabras"], ["Texto nuevo", "2"]])];
    expect(importar(e, hojaTexto, "agregar", previo).r.contenidos[kn].texto).toBe("Texto previo\n\nTexto nuevo");
    expect(importar(e, hojaTexto, "vacios", previo).r.contenidos[kn]).toBeUndefined();
    expect(importar(e, hojaTexto, "reemplazar", previo).r.contenidos[kn].texto).toBe("Texto nuevo");
    expect(importar(e, hojaTexto, "vacios", {}).r.contenidos[kn].texto).toBe("Texto nuevo");
  });

  it("fusionarFilas es pura y no toca lo que recibe", () => {
    const antes = [["a", "", "z"]];
    const r = fusionarFilas(antes, [["a", "x", ""]], "vacios", [0]);
    expect(r.filas).toEqual([["a", "x", "z"]]);
    expect(antes).toEqual([["a", "", "z"]]);
  });
});

describe("permisos", () => {
  const e = entrada("B");
  const leidas = [hoja("Logros", [["Logro", "Contexto y resultado"], ["A", "B"]])];
  it("un informe enviado o aprobado no se escribe", () => {
    for (const estado of ["sent", "ok"] as const) {
      const { r } = importar(e, leidas, "agregar", {}, { estado });
      expect(r.bloqueado).toMatch(/envió/);
      expect(r.contenidos).toEqual({});
    }
  });
  it("quien solo consulta no escribe", () => {
    const { r } = importar(e, leidas, "agregar", {}, { rol: "visor" });
    expect(r.bloqueado).toBeTruthy();
    expect(r.contenidos).toEqual({});
  });
  it("una sección de solo lectura no se escribe (salvo Planeación)", () => {
    const k = claveDe("B", "logros");
    const ro = { ...e, secciones: e.secciones.map((s) => (s.clave === k ? { ...s, soloLectura: true } : s)) };
    const a = importar(ro, leidas, "agregar", {}).r;
    expect(a.contenidos[k]).toBeUndefined();
    expect(a.avisos.join(" ")).toMatch(/solo lectura/);
    expect(importar(ro, leidas, "agregar", {}, { rol: "planeacion" }).r.contenidos[k]).toBeDefined();
  });
  it("matriz y anexos no se importan aunque el libro traiga su hoja", () => {
    const d = entrada("A");
    const libro = comoLeido(armarLibro(d));
    const { propuestas, libro: l } = importar(d, libro, "agregar", {});
    const ids = new Set(destinosDe(d.secciones).map((x) => x.clave));
    expect(propuestas.every((p) => !p.destino || ids.has(p.destino.split(":")[0]))).toBe(true);
    expect(l.bloques.length).toBeGreaterThan(0);
  });
});

describe("criterios y resultados", () => {
  const e = entrada("A");
  const k = claveDe("A", "dim");

  it("la hoja de criterios marca a cuáles reporta la unidad y crea los propios nuevos", () => {
    const leidas = [
      hoja("Criterios", [["Criterio", "¿Reporta aquí?", "Origen"], ["Extensión", "Sí", "Base"], ["Investigación", "No", "Base"], ["Sostenibilidad ambiental", "Sí", ""]]),
      hoja("Resultados", [["Criterio", "Tipo", "Indicador", "Actual", "Meta"], ["Sostenibilidad ambiental", "Cifra", "Huella de carbono", "10", "8"], ["Extensión", "Cifra", "Convenios", "5", "5"]]),
    ];
    const { r } = importar(e, leidas, "agregar", {});
    const c = r.contenidos[k];
    expect(c.criterios_propios).toHaveLength(1);
    const propio = c.criterios_propios![0];
    expect(propio.nombre).toBe("Sostenibilidad ambiental");
    expect(c.criterios_reporta).toEqual(expect.arrayContaining(["ext", propio.id]));
    expect(c.criterios_reporta).not.toContain("inv");
    const ind = c.indicadores!;
    expect(ind.find((i) => i.nombre === "Huella de carbono")?.criterio).toBe(propio.id);
    expect(ind.filter((i) => i.criterio.startsWith("l_") && i.criterio !== propio.id)).toEqual([]);
  });

  it("un criterio nuevo solo en la hoja de resultados también se crea una sola vez", () => {
    const leidas = [hoja("Resultados", [["Criterio", "Tipo", "Indicador", "Actual", "Meta"], ["Bienestar", "Cifra", "A", "1", "2"], ["Bienestar", "Cifra", "B", "1", "2"]])];
    const { r } = importar(e, leidas, "agregar", {});
    expect(r.contenidos[k].criterios_propios).toHaveLength(1);
    const ids = new Set((r.contenidos[k].indicadores ?? []).map((i) => i.criterio));
    expect(ids.size).toBe(1);
  });

  it("una hoja de acciones del formato de «Resultados y evidencias» se lee como acciones", () => {
    const leidas = [hoja("Acciones", [["Criterio", "Acción", "Descripción de la acción", "Qué se ha hecho", "Finalización", "Proyección (texto)", "Proyección (número)"], ["Extensión", "Tutorías", "Acompañar", "12 grupos", "2027", "Ampliar", "20"]])];
    const { r, propuestas } = importar(e, leidas, "agregar", {});
    expect(propuestas[0].destino).toBe(k);
    expect(r.contenidos[k].indicadores?.[0]).toMatchObject({ tipo: "accion", descripcion: "Acompañar", avance_texto: "12 grupos", proyeccion_num: 20 });
  });

  it("modos sobre indicadores: agregar suma, vacíos completa y reemplazar conserva lo que Planeación pide", () => {
    const previos: IndicadorManual[] = [
      { id: "a", criterio: "inv", nombre: "Semilleros", unidad: "", mayorMejor: true, anterior: null, actual: 10, meta: null, fuente: "", nota: "" },
      { id: "b", criterio: "ens", nombre: "Pedido", unidad: "", mayorMejor: true, anterior: null, actual: 1, meta: 2, fuente: "", nota: "", requerido: "req1" },
    ];
    const leidas = [hoja("Resultados", [["Criterio", "Tipo", "Indicador", "Anterior", "Actual", "Meta"], ["Investigación", "Cifra", "Semilleros", "9", "99", "15"]])];
    const contenidos = { [k]: { indicadores: previos } };
    const vacios = importar(e, leidas, "vacios", contenidos).r.contenidos[k].indicadores!;
    expect(vacios).toHaveLength(2);
    expect(vacios[0]).toMatchObject({ actual: 10, anterior: 9, meta: 15 });
    expect(importar(e, leidas, "agregar", contenidos).r.contenidos[k].indicadores).toHaveLength(3);
    const reemp = importar(e, leidas, "reemplazar", contenidos).r.contenidos[k].indicadores!;
    expect(reemp.map((i) => i.nombre)).toEqual(["Pedido", "Semilleros"]);
  });
});

describe("evidencias y alineación", () => {
  const e = entrada("A");

  it("de las evidencias solo entran los enlaces https nuevos, con quién aportó", () => {
    const leidas = [
      hoja("Evidencias", [["N.º", "Documento", "Descripción", "Enlace"], ["1", "Acta del comité", "Respalda la meta", ""], ["2", "Convenio", "Convenio firmado", "https://udrive.example/c"], ["", "Informe nuevo", "Auditoría", "https://udrive.example/n"], ["", "Sin enlace", "No sirve", ""]]),
    ];
    const { r } = importar(e, leidas, "agregar", {}, { aporta: "Secretaría académica" });
    expect(r.evidencias).toEqual([{ url: "https://udrive.example/n", nombre: "Informe nuevo", descripcion: "Auditoría (aportó: Secretaría académica)" }]);
    expect(r.avisos.join(" ")).toMatch(/sin enlace/i);
    expect(r.resumen).toMatch(/Aportó: Secretaría académica/);
  });

  it("alineación: Sí con aporte entra, No se omite y el pilar que no existe se avisa", () => {
    const leidas = [hoja("PDI", [["Pilar del PDI", "Avance del plan", "Articula con su unidad", "Aporte de la unidad"], ["1. Formación integral", "40 %", "Sí", "Aportamos"], ["2. Investigación con impacto", "", "No", ""], ["9. Inventado", "", "Sí", "x"]])];
    const { r } = importar(e, leidas, "agregar", {});
    const k = claveDe("A", "pdi");
    expect(r.contenidos[k].alineacion).toEqual([{ pilar: "p1", aporte: "Aportamos", acciones: [] }]);
    expect(r.avisos.join(" ")).toMatch(/Inventado/);
  });
});

describe("por equipo", () => {
  const e = entrada("A", contenidoCompleto("A"));
  const asign: Record<string, string> = {};
  for (const s of e.secciones) asign[s.clave] = ["narr", "metas", "pdi"].includes(s.tipo) ? "Decanatura" : s.tipo === "dim" ? "Secretaría académica" : "";

  it("un libro por equipo, solo con sus hojas; las sin equipo no van", () => {
    const libros = armarLibrosPorEquipo(e, asign);
    expect(libros.map((l) => l.equipo)).toEqual(["Decanatura", "Secretaría académica"]);
    const dec = libros[0];
    expect(dec.archivo).toBe("Informe_Gestion_2026_A_decanatura.xlsx");
    const nombres = dec.hojas.map((h) => h.nombre);
    expect(nombres).toEqual(expect.arrayContaining([HOJA_PORTADA, HOJA_LISTAS, HOJA_CONTROL]));
    expect(nombres.some((n) => /Logros|Puntos|Evidencias/.test(n))).toBe(false);
    expect(nombres.filter((n) => /^\d\d /.test(n))).toHaveLength(dec.claves.length + 1); // + la portada
    const control = dec.hojas.at(-1)!.filas;
    expect(control.find((f) => f[0] === "equipo")?.[1]).toBe("Decanatura");
    expect(control.filter((f) => /^s\d+(:crit)?$/.test(String(f[0])))).toHaveLength(dec.claves.length);
    // La huella es la de la estructura completa: un libro de equipo no dispara el aviso de estructura.
    const huella = control.find((f) => f[0] === "huella")?.[1];
    expect(huella).toBe(huellaDe("A", e.secciones));
    const portada = dec.hojas[0].filas.map((f) => f.join(" "));
    expect(portada.some((t) => /Equipo Decanatura/.test(t))).toBe(true);
  });

  it("los libros de los equipos devueltos se pueden importar juntos al mismo informe", () => {
    const [dec, sec] = armarLibrosPorEquipo(e, asign);
    const vacio = entrada("A", {});
    const a = importar(vacio, comoLeido(dec.hojas), "agregar", {}).r;
    const b = importar(vacio, comoLeido(sec.hojas), "agregar", {}).r;
    expect(Object.keys(a.contenidos).sort()).toEqual(dec.claves.filter((c) => a.contenidos[c]).sort());
    expect(Object.keys(b.contenidos)).toEqual([claveDe("A", "dim")]);
  });
});

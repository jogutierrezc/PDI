import { describe, expect, it } from "vitest";
import { PLANTILLAS } from "../plantillas";
import { COLUMNAS_LIBRO_RESULTADOS } from "../indicadores-manual";
import type { HojaLeida } from "../ui/excel";
import {
  adaptarLibro,
  agruparIndicadores,
  clasificarEntrada,
  claveDeGrupo,
  cobertura,
  compilarAlInforme,
  datosParaPilo,
  detectarPlantilla,
  equipoDe,
  estadoGrupo,
  huellaDatos,
  motivoDeRechazo,
  nombreOficial,
  numeroEnLetras,
  observaciones,
  observacionOficial,
  recibirLibro,
  resumenIndicadores,
  seccionesRedactables,
} from "./logica";
import { leerLibro } from "../libro-informe";
import { claveIndicador } from "../indicadores-manual";

const A = PLANTILLAS.A.secciones;
const resultados = A.find((s) => s.tipo === "dim")!;
const resumen = A.find((s) => s.tipo === "narr")!;

/** Una hoja de resultados con la forma del libro del sistema (banda de tres filas y encabezado en la 4). */
function hojaResultados(nombre: string, filas: Record<string, string>[]): HojaLeida {
  const cab = [...COLUMNAS_LIBRO_RESULTADOS] as string[];
  return {
    nombre,
    oculta: false,
    filas: [[nombre], [""], [""], cab, ...filas.map((f) => cab.map((c) => f[c] ?? ""))],
  };
}
const control = (v: Record<string, string>): HojaLeida => ({ nombre: "_Control", oculta: true, filas: [["clave", "valor"], ...Object.entries(v).map(([k, x]) => [k, x])] });

const libroProgramas = (): HojaLeida[] => [
  hojaResultados(`${resultados.clave.replace("s", "0")} ${resultados.titulo}`.slice(0, 31), [
    { Criterio: "Enseñanza", Indicador: "Estudiantes matriculados 2026-1", "Cifra actual": "3.912", Fuente: "UDES en Cifras" },
    { Criterio: "Enseñanza", Indicador: "Deserción en primer semestre", "Cifra actual": "11,2", Unidad: " %", Meta: "9", Fuente: "SPADIES" },
  ]),
];
const libroSecretaria = (): HojaLeida[] => [
  hojaResultados("Resultados", [
    { Criterio: "Enseñanza", Indicador: "Total matrícula 2026-1", "Cifra actual": "3912", Fuente: "UDES en Cifras" },
    { Criterio: "Internacionalización", Indicador: "Movilidad saliente de estudiantes", "Cifra actual": "47", Fuente: "Secretaría" },
  ]),
];
const libroIntern = (): HojaLeida[] => [
  hojaResultados("Resultados", [{ Criterio: "Internacionalización", Indicador: "Movilidad saliente de estudiantes", "Cifra actual": "42", Fuente: "Registro de la Oficina de Internacionalización" }]),
];

const recibir = (archivo: string, hojas: HojaLeida[]) => recibirLibro({ archivo, origen: "archivo suelto", hojas, plantillaInforme: "A", secciones: A });

describe("entradas de un ZIP", () => {
  it("solo los .xlsx son libros", () => {
    expect(clasificarEntrada("libros/uno.xlsx").resultado).toBe("libro");
    expect(clasificarEntrada("libros/Thumbs.db").resultado).toBe("ignorado");
    expect(clasificarEntrada("__MACOSX/libros/._uno.xlsx").resultado).toBe("ignorado");
    expect(clasificarEntrada("libros/~$uno.xlsx").resultado).toBe("ignorado");
    expect(clasificarEntrada("notas.txt").resultado).toBe("ignorado");
    expect(clasificarEntrada("viejo.xls").resultado).toBe("rechazado");
  });
  it("el equipo sale del _Control o del nombre del archivo", () => {
    expect(equipoDe("Informe_Gestion_2026_B_internacionalizacion.xlsx", { control: null })).toBe("Internacionalizacion");
    expect(equipoDe("x.xlsx", { control: { valores: { equipo: "Extensión" }, hojas: {} } })).toBe("Extensión");
    expect(equipoDe("carpeta/Informe_Gestion_2026_A_direccion-de-programa.xlsx", { control: null })).toBe("Direccion de programa");
  });
});

describe("plantilla: detectar y adaptar", () => {
  it("lee la plantilla del _Control", () => {
    const l = leerLibro([...libroProgramas(), control({ plantilla: "B", instancia: "i9", ciclo: "c1" })]);
    expect(detectarPlantilla(l)).toMatchObject({ letra: "B", origen: "control", confianza: 1 });
  });
  it("sin _Control la deduce de las hojas y columnas", () => {
    const d = detectarPlantilla(leerLibro(libroProgramas()));
    expect(d.origen).toBe("estructura");
    expect(d.letra).not.toBeNull();
    expect(d.confianza).toBeGreaterThan(0.4);
  });
  it("un libro de otra plantilla no se rechaza: se adapta por encabezados e ignora el mapa de su _Control", () => {
    const hojas = [...libroSecretaria(), control({ plantilla: "D", instancia: "i9", ciclo: "c1", s3: "Resultados" })];
    const l = leerLibro(hojas);
    const ad = adaptarLibro(l, "D", "A", A);
    expect(ad.filas[0].destino).toBe(resultados.clave);
    expect(ad.adaptada).toBe(true);
    expect(ad.filas[0].cambio).not.toBe("sin equivalente");
  });
  it("una hoja sin equivalente se anota y no se importa", () => {
    const l = leerLibro([{ nombre: "Notas sueltas", oculta: false, filas: [["Color", "Animal"], ["rojo", "gato"]] }]);
    const ad = adaptarLibro(l, null, "A", A);
    expect(ad.filas[0].destino).toBeNull();
    expect(ad.filas[0].cambio).toBe("sin equivalente");
  });
  it("recibirLibro avisa cuando la plantilla era otra", () => {
    const r = recibir("Informe_Gestion_2026_D_secretaria.xlsx", [...libroSecretaria(), control({ plantilla: "D", instancia: "i9", ciclo: "c1" })]);
    expect(r.plantilla.letra).toBe("D");
    expect(r.avisos.join(" ")).toMatch(/plantilla D/);
  });
});

describe("rechazo: solo si es de otro informe o ciclo, no por plantilla", () => {
  const esperado = { ciclo: "c1", instancia: "i1", anio: 2026 };
  it("otra instancia", () => {
    const l = leerLibro([...libroProgramas(), control({ ciclo: "c1", instancia: "i2", unidad: "Facultad de Ingeniería", anio: "2026", plantilla: "A" })]);
    expect(motivoDeRechazo(l, esperado)).toMatch(/no corresponde a este informe/);
  });
  it("otro ciclo", () => {
    const l = leerLibro([...libroProgramas(), control({ ciclo: "c0", instancia: "i1", anio: "2025" })]);
    expect(motivoDeRechazo(l, esperado)).toMatch(/otro ciclo/);
  });
  it("otra plantilla de la misma instancia pasa", () => {
    const l = leerLibro([...libroProgramas(), control({ ciclo: "c1", instancia: "i1", plantilla: "B" })]);
    expect(motivoDeRechazo(l, esperado)).toBeNull();
  });
  it("un libro de terceros (sin _Control) pasa", () => expect(motivoDeRechazo(leerLibro(libroProgramas()), esperado)).toBeNull());
});

describe("indicadores: agrupar, unificar y resolver", () => {
  const libros = () => [recibir("Informe_Gestion_2026_A_direccion-de-programa.xlsx", libroProgramas()), recibir("Informe_Gestion_2026_A_secretaria.xlsx", libroSecretaria()), recibir("Informe_Gestion_2026_A_internacionalizacion.xlsx", libroIntern())];
  const grupos = () => agruparIndicadores(observaciones(libros(), A));

  it("une los nombres distintos del mismo indicador", () => {
    const g = grupos();
    const mat = g.find((x) => /matricul/i.test(x.nombre))!;
    expect(mat.obs.map((o) => o.equipo).sort()).toHaveLength(2);
    expect(mat.alias.map((a) => a.texto)).toEqual(expect.arrayContaining(["Estudiantes matriculados 2026-1", "Total matrícula 2026-1"]));
    expect(estadoGrupo(mat)).toBe("unificado");
  });
  it("dos valores distintos son un conflicto hasta que se elige", () => {
    const g = grupos().find((x) => /movilidad/i.test(x.nombre))!;
    expect(g.obs.map((o) => o.actual).sort()).toEqual([42, 47]);
    expect(estadoGrupo(g)).toBe("conflicto");
    expect(observacionOficial(g)).toBeNull();
    const d = { [g.id]: { eligio: "fuente" } };
    expect(estadoGrupo(g, d)).toBe("unificado");
    expect(observacionOficial(g, d)?.actual).toBe(42); // el que cita el registro de la oficina
    expect(observacionOficial(g, { [g.id]: { eligio: "Secretaria" } })?.actual).toBe(47);
  });
  it("el nombre oficial se puede cambiar", () => {
    const g = grupos()[0];
    expect(nombreOficial(g, { [g.id]: { nombre: "  Matrícula 2026-1 " } })).toBe("Matrícula 2026-1");
  });
  it("cuenta listos, conflictos y sin dato", () => {
    const r = resumenIndicadores(grupos());
    expect(r.conflictos).toBe(1);
    expect(r.listos).toBeGreaterThanOrEqual(2);
  });
  it("una cifra con letras se lee como número", () => {
    expect(numeroEnLetras("mil ciento veintiséis")).toBe(1126);
    expect(numeroEnLetras("treinta y ocho")).toBe(38);
    expect(numeroEnLetras("hola")).toBeNull();
    const o = observaciones([recibir("x.xlsx", [hojaResultados("Resultados", [{ Criterio: "Docencia servicio", Indicador: "Estudiantes en práctica", "Cifra actual": "mil ciento veintiséis" }])])], A);
    expect(o[0].actual).toBe(1126);
  });
  it("no mezcla indicadores de nombres distintos", () => {
    const g = agruparIndicadores(observaciones([recibir("x.xlsx", [hojaResultados("Resultados", [{ Criterio: "a", Indicador: "Graduados 2025", "Cifra actual": "312" }, { Criterio: "a", Indicador: "Estudiantes matriculados", "Cifra actual": "3912" }])])], A));
    expect(g).toHaveLength(2);
  });
});

describe("cobertura y datos para Pilo", () => {
  it("cuenta filas por sección y equipo", () => {
    const l = [recibir("a.xlsx", libroProgramas()), recibir("b.xlsx", libroSecretaria())];
    const c = cobertura(l, A);
    expect(c.equipos).toHaveLength(2);
    expect(c.secciones.find((s) => s.clave === resultados.clave)?.porEquipo).toBeTruthy();
  });
  it("arma los datos con el valor oficial, el conflicto y quién reportó", () => {
    const libros = [recibir("a.xlsx", libroSecretaria()), recibir("b.xlsx", libroIntern())];
    const grupos = agruparIndicadores(observaciones(libros, A));
    const g = grupos.find((x) => /movilidad/i.test(x.nombre))!;
    const sin = datosParaPilo({ unidad: "Facultad X", anio: 2026, plantilla: "A", seccion: resumen, libros, grupos, decisiones: {}, secciones: A });
    expect(sin.indicadores.find((i) => i.nombre === g.nombre)).toMatchObject({ valor: null, conflicto: true });
    const con = datosParaPilo({ unidad: "Facultad X", anio: 2026, plantilla: "A", seccion: resumen, libros, grupos, decisiones: { [g.id]: { eligio: "fuente" } }, secciones: A });
    const i = con.indicadores.find((x) => x.nombre === g.nombre)!;
    expect(i.valor).toBe(42);
    expect(i.reporto).toHaveLength(2);
    expect(i.clave).toMatch(/^ind_c_/);
  });
  it("solo redacta las secciones de texto", () => {
    const tipos = new Set(seccionesRedactables(A).map((s) => s.tipo));
    expect([...tipos].every((t) => ["narr", "pdi", "dim"].includes(t))).toBe(true);
    expect(tipos.has("metas")).toBe(false);
  });
});

describe("compilar al informe", () => {
  const base = () => {
    const libros = [recibir("a.xlsx", libroProgramas()), recibir("b.xlsx", libroSecretaria()), recibir("c.xlsx", libroIntern())];
    const grupos = agruparIndicadores(observaciones(libros, A));
    return { libros, grupos };
  };
  const comun = { secciones: A, contenidos: {}, aprobados: [], pilares: [], anexos: [], modo: "agregar" as const, estado: "draft" as const, rol: "jefe" as const };

  it("escribe las cifras con el nombre unificado y el valor oficial, sin duplicar el indicador", () => {
    const { libros, grupos } = base();
    const g = grupos.find((x) => /movilidad/i.test(x.nombre))!;
    const r = compilarAlInforme({ ...comun, libros, grupos, decisiones: { [g.id]: { eligio: "fuente" } }, borradores: [] });
    expect(r.bloqueado).toBeUndefined();
    const ind = r.contenidos[resultados.clave].indicadores ?? [];
    const nombres = ind.map((i) => i.nombre);
    expect(nombres.filter((n) => /movilidad/i.test(n))).toHaveLength(1);
    expect(ind.find((i) => /movilidad/i.test(i.nombre))?.actual).toBe(42);
    expect(nombres.filter((n) => /matr[ií]cula/i.test(n))).toHaveLength(1);
    expect(r.filas).toBeGreaterThan(0);
  });
  it("el texto de Pilo queda marcado como borrador hasta que la persona lo toque", () => {
    const { libros, grupos } = base();
    const r = compilarAlInforme({ ...comun, libros, grupos, decisiones: {}, borradores: [{ clave: resumen.clave, texto: "Texto de Pilo.", aprobado: true, editado: false }] });
    expect(r.contenidos[resumen.clave]).toMatchObject({ texto: "Texto de Pilo.", borrador_pilo: "Texto de Pilo." });
    expect(r.textosDePilo).toBe(1);
    const e = compilarAlInforme({ ...comun, libros: [], grupos: [], decisiones: {}, borradores: [{ clave: resumen.clave, texto: "Texto editado.", aprobado: true, editado: true }] });
    expect(e.contenidos[resumen.clave].borrador_pilo).toBeNull();
  });
  it("los tokens de Pilo pasan a la clave que el informe da al indicador", () => {
    const { libros, grupos } = base();
    const g = grupos.find((y) => /matr[ií]cula/i.test(y.nombre))!;
    const r = compilarAlInforme({ ...comun, libros, grupos, decisiones: {}, borradores: [{ clave: resumen.clave, texto: `Hubo [[${claveDeGrupo(g)}]] estudiantes.`, aprobado: true, editado: false }] });
    const ind = r.contenidos[resultados.clave].indicadores!.find((i) => /matr[ií]cula/i.test(i.nombre))!;
    expect(r.contenidos[resumen.clave].texto).toBe(`Hubo [[${claveIndicador(resultados.clave, ind.id)}]] estudiantes.`);
  });
  it("si el indicador no entró a Resultados, el token queda como su valor", () => {
    const { libros, grupos } = base();
    const g = grupos.find((y) => /matr[ií]cula/i.test(y.nombre))!;
    const r = compilarAlInforme({ ...comun, libros, grupos, decisiones: {}, seccionesDatos: new Set(["s99"]), borradores: [{ clave: resumen.clave, texto: `Hubo [[${claveDeGrupo(g)}]].`, aprobado: true, editado: false }] });
    expect(r.contenidos[resumen.clave].texto).toBe("Hubo 3.912.");
    expect(r.avisos.join(" ")).toMatch(/quedó escrita con su valor/);
  });
  it("la huella cambia si cambia un dato", () => {
    const { libros, grupos } = base();
    const g = grupos.find((y) => /movilidad/i.test(y.nombre))!;
    const a = huellaDatos(datosParaPilo({ unidad: "U", anio: 2026, plantilla: "A", seccion: resumen, libros, grupos, decisiones: {}, secciones: A }));
    const b = huellaDatos(datosParaPilo({ unidad: "U", anio: 2026, plantilla: "A", seccion: resumen, libros, grupos, decisiones: { [g.id]: { eligio: "fuente" } }, secciones: A }));
    expect(a).not.toBe(b);
  });
  it("no escribe lo que no se aprobó", () => {
    const { libros, grupos } = base();
    const r = compilarAlInforme({ ...comun, libros, grupos, decisiones: {}, borradores: [{ clave: resumen.clave, texto: "No.", aprobado: false, editado: false }] });
    expect(r.contenidos[resumen.clave]).toBeUndefined();
  });
  it("«agregar» suma al texto que ya había; «reemplazar» lo cambia", () => {
    const previo = { [resumen.clave]: { texto: "Lo que ya estaba." } };
    const b = [{ clave: resumen.clave, texto: "Pilo.", aprobado: true, editado: false }];
    const a = compilarAlInforme({ ...comun, contenidos: previo, libros: [], grupos: [], decisiones: {}, borradores: b });
    expect(a.contenidos[resumen.clave].texto).toBe("Lo que ya estaba.\n\nPilo.");
    expect(a.contenidos[resumen.clave].borrador_pilo).toBeNull();
    const r = compilarAlInforme({ ...comun, modo: "reemplazar", contenidos: previo, libros: [], grupos: [], decisiones: {}, borradores: b });
    expect(r.contenidos[resumen.clave]).toMatchObject({ texto: "Pilo.", borrador_pilo: "Pilo." });
  });
  it("un informe enviado no se escribe", () => {
    const { libros, grupos } = base();
    const r = compilarAlInforme({ ...comun, estado: "sent", libros, grupos, decisiones: {}, borradores: [] });
    expect(r.bloqueado).toBeTruthy();
  });
});

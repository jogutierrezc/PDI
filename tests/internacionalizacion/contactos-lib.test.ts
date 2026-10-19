import { describe, expect, it } from "vitest";
import {
  aCsv,
  combinarResultados,
  correoPermitido,
  crudaDesdeDatos,
  emparejarEncabezados,
  filaParaExportar,
  leerMatriz,
  LISTA_PLANTILLAS,
  normalizar,
  parsearCsv,
  PLANTILLAS,
  prepararEnvio,
  totales,
  resolverPais,
  validarAportante,
  validarFila,
} from "../../supabase/functions/int-contactos/contactos";

const academica = PLANTILLAS.academica;
const empleadores = PLANTILLAS.empleadores;

describe("plantillas de Rua", () => {
  it("las cabeceras son las de los archivos originales, en su orden", () => {
    expect(academica.columnas.map((c) => c.encabezado)).toEqual([
      "Source", "Title", "First Name", "Last Name", "Job Title", "Department", "Institution", "Country or Territory", "Email", "Subject", "Phone (Optional)",
    ]);
    expect(empleadores.columnas.map((c) => c.encabezado)).toEqual([
      "Source", "Title", "First Name", "Last Name", "Position", "Industry", "Company Name", "Country or Territory", "Email", "Phone (Optional)",
    ]);
  });

  it("cada columna tiene una clave propia válida para la tabla y única en su plantilla", () => {
    for (const p of LISTA_PLANTILLAS) {
      const claves = p.columnas.map((c) => c.clave);
      expect(new Set(claves).size).toBe(claves.length);
      for (const k of claves) expect(k).toMatch(/^propio_[a-z0-9_]{1,50}$/);
    }
  });

  it("piden nombre, apellidos, cargo y correo", () => {
    expect(academica.columnas.filter((c) => c.obligatoria).map((c) => c.encabezado)).toEqual(["First Name", "Last Name", "Job Title", "Email"]);
    expect(empleadores.columnas.filter((c) => c.obligatoria).map((c) => c.encabezado)).toEqual(["First Name", "Last Name", "Position", "Email"]);
  });

  it("la fila de ejemplo de cada plantilla es válida", () => {
    for (const p of LISTA_PLANTILLAS) {
      const v = validarFila(p, p.ejemplo as Record<string, string>);
      expect(v.errores, p.codigo).toEqual([]);
    }
  });
});

describe("países", () => {
  it("acepta español, inglés, alias y código ISO", () => {
    for (const t of ["México", "mexico", "MX", "Mexico", "mx"]) expect(resolverPais(t)).toMatchObject({ ok: true, codigo: "MX" });
    expect(resolverPais("United States")).toMatchObject({ ok: true, codigo: "US" });
    expect(resolverPais("EE.UU.")).toMatchObject({ ok: true, codigo: "US" });
  });

  it("si no lo reconoce, ofrece el más parecido", () => {
    expect(resolverPais("Mexco")).toEqual({ ok: false, sugerencia: "México" });
    expect(resolverPais("Narnia")).toEqual({ ok: false, sugerencia: null });
    expect(resolverPais("")).toEqual({ ok: false, sugerencia: null });
  });

  it("normaliza sin tildes ni signos", () => {
    expect(normalizar("  Perú, (PE) ")).toBe("peru pe");
  });
});

describe("quién aporta", () => {
  it("pide nombre, cargo y un correo del dominio permitido", () => {
    expect(validarAportante({ nombre: "Laura Mendoza", cargo: "Directora", correo: " LMendoza@UDES.edu.co " }, ["udes.edu.co"])).toMatchObject({
      errores: [],
      datos: { correo: "lmendoza@udes.edu.co" },
    });
    expect(validarAportante({ nombre: "", cargo: "", correo: "x" }, ["udes.edu.co"]).errores).toHaveLength(3);
    expect(validarAportante({ nombre: "Ana Gómez", cargo: "Docente", correo: "ana@gmail.com" }, ["udes.edu.co"]).errores[0]).toMatch(/correo institucional/);
  });

  it("acepta subdominios y, sin dominios, no restringe", () => {
    expect(correoPermitido("a@mail.udes.edu.co", ["udes.edu.co"])).toBe(true);
    expect(correoPermitido("a@falsoudes.edu.co", ["udes.edu.co"])).toBe(false);
    expect(correoPermitido("a@x.com", [])).toBe(true);
  });
});

describe("validar una fila", () => {
  const buena = { ...academica.ejemplo } as Record<string, string>;

  it("limpia espacios, pone el país en español y el correo en minúscula", () => {
    const v = validarFila(academica, { ...buena, "Country or Territory": "mx", Email: "  MF.Ruiz@Universidad.MX " });
    expect(v.errores).toEqual([]);
    expect(v.datos.propio_country).toBe("México");
    expect(v.datos.propio_email).toBe("mf.ruiz@universidad.mx");
    expect(v.correo).toBe("mf.ruiz@universidad.mx");
  });

  it("marca lo que falta y lo que está mal, en español", () => {
    const v = validarFila(academica, { ...buena, "First Name": "", Email: "paula.diaz@", "Country or Territory": "Mexco" });
    expect(v.errores).toContain("Falta «First Name».");
    expect(v.errores).toContain("El correo no tiene forma de correo.");
    expect(v.errores).toContain("País no reconocido. ¿Quiso decir «México»?");
  });

  it("el país y el teléfono son opcionales", () => {
    const v = validarFila(empleadores, { "First Name": "Laura", "Last Name": "Restrepo", Position: "Gerente", Email: "l@empresa.co" });
    expect(v.errores).toEqual([]);
  });

  it("un sector fuera de la lista se acepta con aviso; uno de la lista se normaliza", () => {
    const base = { "First Name": "Laura", "Last Name": "Restrepo", Position: "Gerente", Email: "l@empresa.co" };
    expect(validarFila(empleadores, { ...base, Industry: "empresa privada" }).datos.propio_industry).toBe("Empresa privada");
    const raro = validarFila(empleadores, { ...base, Industry: "Minería artesanal" });
    expect(raro.errores).toEqual([]);
    expect(raro.avisos).toHaveLength(1);
  });
});

describe("archivos", () => {
  it("empareja cabeceras sin importar mayúsculas, tildes ni «(Optional)»", () => {
    const e = emparejarEncabezados(["source", "TITLE", "first name", "Last Name", "job title", "email", "Phone", "Otra"], academica);
    expect(e.faltantes).toEqual([]);
    expect(e.indice["Phone (Optional)"]).toBe(6);
    expect(e.extras).toEqual(["Otra"]);
  });

  it("encuentra la fila de cabeceras aunque el archivo traiga un título encima, y salta las filas vacías", () => {
    const m = [
      ["Nominaciones Cúcuta"],
      [""],
      ["First Name", "Last Name", "Job Title", "Email"],
      ["Ana", "Gómez", "Profesora", "a@usal.es"],
      ["", "", "", ""],
      ["Jean", "Martin", "Chargé", "j@sorbonne.fr"],
    ];
    const l = leerMatriz(m, academica);
    expect(l.filaEncabezado).toBe(3);
    expect(l.filas.map((f) => f.fila)).toEqual([4, 6]);
    expect(l.filas[0].cruda["First Name"]).toBe("Ana");
  });

  it("un archivo sin cabeceras reconocibles no da filas y dice qué falta", () => {
    const l = leerMatriz([["a", "b"], ["1", "2"]], academica);
    expect(l.filas).toEqual([]);
    expect(l.emparejo.faltantes).toEqual(["First Name", "Last Name", "Job Title", "Email"]);
  });
});

describe("CSV", () => {
  it("lee comas, punto y coma, tabulación, comillas y BOM", () => {
    expect(parsearCsv("﻿a,b\r\n1,\"x,y\"\r\n")).toEqual([["a", "b"], ["1", "x,y"]]);
    expect(parsearCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parsearCsv("a\tb\n1\t\"di \"\"hola\"\"\"")).toEqual([["a", "b"], ["1", 'di "hola"']]);
  });

  it("escribe UTF-8 con BOM, CRLF y comillas solo donde hacen falta", () => {
    const csv = aCsv(["Source", "Email"], [["Feria, 2026", "a@x.co"], ["Dice \"hola\"", ""]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Source,Email\r\n"Feria, 2026",a@x.co\r\n"Dice ""hola""",\r\n');
  });

  it("lo exportado se puede volver a importar", () => {
    const datos = validarFila(academica, academica.ejemplo as Record<string, string>).datos;
    const fila = filaParaExportar(academica, datos);
    const csv = aCsv(academica.columnas.map((c) => c.encabezado), [fila]);
    const l = leerMatriz(parsearCsv(csv), academica);
    expect(l.filas).toHaveLength(1);
    expect(validarFila(academica, l.filas[0].cruda).datos).toEqual(datos);
    expect(crudaDesdeDatos(academica, datos)["Email"]).toBe("mf.ruiz@universidad.mx");
  });
});

describe("un envío completo", () => {
  const buena = (n: string, correo: string) => ({ "First Name": n, "Last Name": "Prueba", "Job Title": "Docente", Email: correo });

  it("separa lo que ya trae errores de lo que va a la base, y lo junta en el orden del archivo", () => {
    const { paraBase, locales, avisos } = prepararEnvio(academica, [
      { fila: 2, cruda: buena("Ana", "ana@u.es") },
      { fila: 3, cruda: { ...buena("", "x@u.es") } },
      { fila: 4, cruda: { ...buena("Luis", "luis@u.mx"), "Country or Territory": "Mexco" } },
      { fila: 5, cruda: buena("Eva", "eva@u.it") },
    ]);
    expect(paraBase.map((f) => f.fila)).toEqual([2, 5]);
    expect(locales.map((f) => [f.fila, f.accion])).toEqual([[3, "error"], [4, "error"]]);
    expect(locales[1].motivo).toMatch(/¿Quiso decir «México»\?/);

    const todo = combinarResultados(locales, [{ fila: 5, accion: "actualizar", motivo: null }, { fila: 2, accion: "crear", motivo: null }], avisos);
    expect(todo.map((r) => r.fila)).toEqual([2, 3, 4, 5]);
    expect(totales(todo)).toEqual({ crear: 1, actualizar: 1, omitir: 0, error: 2 });
  });
});

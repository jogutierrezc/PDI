/* Biblioteca de evidencias: ZIP seguro, lectores de texto, clasificación sin IA y cola de subida. */

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { claveCasiDuplicado, clasificarArchivo, codigosEnRuta, marcarDuplicados, odsEnRuta, anioDe, refinarConPilo } from "./clasificar";
import { ejecutarCola } from "./cola";
import { extraerTexto, extraerTextoSync, htmlATexto } from "./extraer-texto";
import {
  LIMITE_ARCHIVO,
  LIMITE_ARCHIVOS,
  construirArbol,
  decodificarNombre,
  extraerEntrada,
  leerDirectorio,
  normalizarRuta,
  resumirZip,
  revisarEntrada,
  revisarEntradas,
  sha256,
  type EntradaZip,
} from "./zip-seguro";

const entrada = (nombre: string, extra: Partial<EntradaZip> = {}): EntradaZip => ({
  nombreCrudo: nombre,
  esCarpeta: nombre.endsWith("/"),
  cifrado: false,
  metodo: 8,
  comprimido: 10,
  tamano: 100,
  desplazamiento: 0,
  ...extra,
});

const blobDe = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]);

describe("zip seguro · rutas", () => {
  it("normaliza y rechaza rutas peligrosas (zip-slip)", () => {
    expect(normalizarRuta("Informes\\ODS 5/./acta.pdf")).toBe("Informes/ODS 5/acta.pdf");
    expect(normalizarRuta("a//b/")).toBe("a/b");
    expect(normalizarRuta("../fuera.txt")).toBeNull();
    expect(normalizarRuta("a/../../fuera.txt")).toBeNull();
    expect(normalizarRuta("/etc/passwd")).toBeNull();
    expect(normalizarRuta("C:/Windows/x.dll")).toBeNull();
    expect(normalizarRuta("\\\\servidor\\x")).toBeNull();
  });

  it("omite basura, rechaza anidados, cifrados, grandes y lo que pasa del tope", () => {
    expect(revisarEntrada(entrada("__MACOSX/ODS 5/._acta.pdf"), 0).descarte).toBe("oculto");
    expect(revisarEntrada(entrada("ODS 5/.DS_Store"), 0).descarte).toBe("oculto");
    expect(revisarEntrada(entrada("ODS 5/~$borrador.docx"), 0).descarte).toBe("oculto");
    const anidado = revisarEntrada(entrada("ODS 5/mas.zip"), 0);
    expect(anidado.descarte).toBe("anidado");
    expect(anidado.aviso).toMatch(/descomprímalo/);
    expect(revisarEntrada(entrada("a.pdf", { cifrado: true }), 0).aviso).toMatch(/contraseña/);
    expect(revisarEntrada(entrada("a.pdf", { tamano: LIMITE_ARCHIVO + 1 }), 0).descarte).toBe("grande");
    expect(revisarEntrada(entrada("a.pdf", { metodo: 14 }), 0).descarte).toBe("metodo");
    expect(revisarEntrada(entrada("a/../../x.pdf"), 0).descarte).toBe("ruta");
    expect(revisarEntrada(entrada("a.pdf"), LIMITE_ARCHIVOS).descarte).toBe("tope");
    const ok = revisarEntrada(entrada("Informes/ODS 5/Acta 2024.PDF"), 0);
    expect(ok).toMatchObject({ descarte: null, nombre: "Acta 2024.PDF", carpeta: "Informes/ODS 5", ext: "pdf" });
  });

  it("arma el árbol con conteos, tamaños y alertas", () => {
    const lista = revisarEntradas([entrada("A/"), entrada("A/uno.pdf"), entrada("A/B/dos.pdf", { tamano: 50 }), entrada("A/B/tres.zip"), entrada("A/.DS_Store")]);
    const raiz = construirArbol(lista);
    expect(raiz).toMatchObject({ archivos: 2, bytes: 150, alertas: 1 });
    expect(raiz.hijos[0]).toMatchObject({ nombre: "A", archivos: 2 });
    expect(raiz.hijos[0].hijos[0]).toMatchObject({ nombre: "B", archivos: 1, alertas: 1 });
    expect(resumirZip(lista)).toMatchObject({ guardar: 2, omitidos: 1, rechazados: 1 });
  });

  it("decodifica nombres en CP437 cuando el ZIP no marca UTF-8", () => {
    expect(decodificarNombre(new Uint8Array([0x50, 0x6f, 0x6c, 0xa1, 0x74, 0x69, 0x63, 0x61]), false)).toBe("Política");
    expect(decodificarNombre(strToU8("Año"), false)).toBe("Año");
  });
});

describe("zip seguro · lectura", () => {
  const zip = zipSync({
    "ODS 5/politica maternidad 2024.txt": strToU8("Política de maternidad de la UDES ".repeat(200)),
    "ODS 5/guardado.txt": [strToU8("sin comprimir"), { level: 0 }],
    "../malo.txt": strToU8("x"),
    "__MACOSX/._a": strToU8("x"),
  });

  it("lee el índice sin cargar el ZIP entero y extrae cada archivo (deflate y sin comprimir)", async () => {
    const lista = await leerDirectorio(blobDe(zip));
    expect(lista.map((e) => e.nombreCrudo).sort()).toEqual(["../malo.txt", "ODS 5/guardado.txt", "ODS 5/politica maternidad 2024.txt", "__MACOSX/._a"]);
    const revisados = revisarEntradas(lista);
    expect(revisados.filter((a) => !a.descarte).map((a) => a.ruta).sort()).toEqual(["ODS 5/guardado.txt", "ODS 5/politica maternidad 2024.txt"]);
    const pol = lista.find((e) => e.nombreCrudo.includes("politica"))!;
    const bytes = await extraerEntrada(blobDe(zip), pol);
    expect(new TextDecoder().decode(bytes)).toMatch(/^Política de maternidad/);
    const guardado = lista.find((e) => e.nombreCrudo.includes("guardado"))!;
    expect(guardado.metodo).toBe(0);
    expect(new TextDecoder().decode(await extraerEntrada(blobDe(zip), guardado))).toBe("sin comprimir");
  });

  it("detecta una bomba: lo descomprimido no cabe en lo que dice el índice", async () => {
    const lista = await leerDirectorio(blobDe(zip));
    const pol = lista.find((e) => e.nombreCrudo.includes("politica"))!;
    await expect(extraerEntrada(blobDe(zip), { ...pol, tamano: 10 })).rejects.toThrow(/bomba/);
  });

  it("rechaza lo que no es ZIP", async () => {
    await expect(leerDirectorio(blobDe(strToU8("hola, no soy un zip, solo texto plano")))).rejects.toThrow(/no es un ZIP/);
  });

  it("calcula el SHA-256", async () => {
    expect(await sha256(strToU8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("extracción de texto", () => {
  it("Word, PowerPoint, Excel y OpenDocument por sus XML", () => {
    const docx = zipSync({ "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:t>Licencia de maternidad</w:t></w:r></w:p></w:body></w:document>') });
    expect(extraerTextoSync(docx, "docx")).toMatchObject({ estado: "ok", texto: "Licencia de maternidad" });
    const pptx = zipSync({ "ppt/slides/slide1.xml": strToU8("<p:sld><a:p><a:r><a:t>Guardería</a:t></a:r></a:p><a:p><a:t>UDES &amp; ODS</a:t></a:p></p:sld>") });
    expect(extraerTextoSync(pptx, "pptx").texto).toBe("Guardería UDES & ODS");
    const xlsx = zipSync({ "xl/sharedStrings.xml": strToU8("<sst><si><t>Mujeres matriculadas</t></si></sst>"), "xl/worksheets/sheet1.xml": strToU8("<sheetData><row><c><v>1520</v></c></row></sheetData>") });
    expect(extraerTextoSync(xlsx, "xlsx").texto).toBe("Mujeres matriculadas 1520");
    const odt = zipSync({ "content.xml": strToU8("<office:text><text:p>Acta del comité</text:p></office:text>") });
    expect(extraerTextoSync(odt, "odt").texto).toBe("Acta del comité");
  });

  it("html sin scripts, txt en Windows-1252, imágenes sin lector", async () => {
    expect(htmlATexto("<html><script>var x=1</script><p>Política&nbsp;de <b>género</b></p></html>")).toBe("Política de género");
    expect(extraerTextoSync(new Uint8Array([0x50, 0x6f, 0x6c, 0xed, 0x74, 0x69, 0x63, 0x61]), "txt").texto).toBe("Política");
    expect(extraerTextoSync(new Uint8Array([1, 2]), "jpg")).toMatchObject({ estado: "no_aplica" });
    expect(extraerTextoSync(new Uint8Array(0), "txt")).toMatchObject({ estado: "sin_texto" });
  });

  it("un archivo dañado no rompe la lectura: vuelve como error legible", async () => {
    const r = await extraerTexto(strToU8("no es un docx"), "docx");
    expect(r.estado).toBe("error");
    expect(r.nota).toMatch(/nombre/);
  });
});

describe("clasificación sin IA", () => {
  it("señales sueltas: ODS y números en la ruta, año", () => {
    expect(odsEnRuta("Evidencias/ODS_05/x.pdf")).toEqual([5]);
    expect(odsEnRuta("SDG17 alianzas")).toEqual([17]);
    expect(codigosEnRuta("5.6.3 politica/4_3 extra 2024.12.pdf")).toEqual(expect.arrayContaining(["5.6.3", "4.3"]));
    expect(anioDe("informe 2023.pdf", "2019 2025 2025")).toBe(2023);
    expect(anioDe("informe.pdf", "año 2024 y 2025 y 2025")).toBe(2025);
  });

  it("apunta una política de maternidad a 5.6.3 y explica por qué", () => {
    const c = clasificarArchivo({
      ruta: "ODS 5/Politica de maternidad 2024.pdf",
      nombre: "Politica de maternidad 2024.pdf",
      carpeta: "ODS 5",
      ext: "pdf",
      texto: "La Universidad de Santander UDES adopta la política de maternidad: licencia, lactancia y apoyo a la participación de las mujeres. 2024",
    });
    expect(c.estado).toBe("propuesta");
    expect(c.propuestas[0].indicador).toBe("5.6.3");
    expect(c.propuestas[0].puntaje).toBeGreaterThanOrEqual(70);
    const razones = c.propuestas[0].razones.join("; ");
    expect(razones).toMatch(/carpeta ODS 5/);
    expect(razones).toMatch(/«maternidad»/);
    expect(razones).toMatch(/año 2024/);
    expect(razones).toMatch(/una política/);
    expect(c.ods[0]).toBe(5);
    expect(c.propuestas).toHaveLength(3);
  });

  it("el número del indicador en la ruta manda, aunque no haya texto (imagen)", () => {
    const c = clasificarArchivo({ ruta: "17.2.2/foto foro.jpg", nombre: "foto foro.jpg", carpeta: "17.2.2", ext: "jpg", texto: "" });
    expect(c.propuestas[0].indicador).toBe("17.2.2");
    expect(c.propuestas[0].razones[0]).toBe("la ruta dice «17.2.2»");
  });

  it("sin coincidencia y nunca propone investigación (inv)", () => {
    const c = clasificarArchivo({ ruta: "varios/zzz.bin", nombre: "zzz.bin", carpeta: "varios", ext: "bin", texto: "" });
    expect(c.estado).toBe("sin_coincidencia");
    const inv = clasificarArchivo({ ruta: "ODS 4/4.1 investigacion.pdf", nombre: "4.1 investigacion.pdf", carpeta: "ODS 4", ext: "pdf", texto: "" });
    expect(inv.propuestas.every((p) => !/^\d+\.1$/.test(p.indicador))).toBe(true);
  });

  it("marca ambiguo cuando dos indicadores casi empatan", () => {
    const c = clasificarArchivo({ ruta: "ODS 5/guarderia.pdf", nombre: "guarderia.pdf", carpeta: "ODS 5", ext: "pdf", texto: "guardería guardería cuidado infantil" });
    expect(["5.6.4", "5.6.5"]).toContain(c.propuestas[0].indicador);
    expect(c.estado).toBe("ambiguo");
  });

  it("es determinista y el enganche de Pilo no cambia nada", async () => {
    const a = { ruta: "ODS 4/curso abierto.pdf", nombre: "curso abierto.pdf", carpeta: "ODS 4", ext: "pdf", texto: "curso gratuito abierto al público" };
    const c = clasificarArchivo(a);
    expect(clasificarArchivo(a)).toEqual(c);
    expect(await refinarConPilo(a, c)).toBe(c);
  });

  it("duplicados por hash y casi-duplicados por nombre", () => {
    expect(claveCasiDuplicado("Acta comité (1) - copia.pdf")).toBe(claveCasiDuplicado("acta comite.docx"));
    const r = marcarDuplicados(
      [
        { ruta: "a/acta.pdf", nombre: "acta.pdf", sha256: "1" },
        { ruta: "b/acta copia.pdf", nombre: "acta copia.pdf", sha256: "2" },
        { ruta: "c/otro.pdf", nombre: "otro.pdf", sha256: "1" },
        { ruta: "d/nuevo.pdf", nombre: "nuevo.pdf", sha256: "9" },
      ],
      [{ sha256: "9", ruta: "viejo/nuevo.pdf" }],
    );
    expect(r[0].duplicadoDe).toBeNull();
    expect(r[0].parecidos).toEqual(["b/acta copia.pdf"]);
    expect(r[2].duplicadoDe).toBe("a/acta.pdf");
    expect(r[3].duplicadoDe).toBe("viejo/nuevo.pdf");
  });
});

describe("cola de subida", () => {
  it("respeta la concurrencia, reintenta y no reintenta lo que no vale la pena", async () => {
    let activos = 0;
    let maximo = 0;
    const fallos = new Map<number, number>();
    const r = await ejecutarCola(
      [1, 2, 3, 4, 5, 6, 7],
      async (n) => {
        activos++;
        maximo = Math.max(maximo, activos);
        await new Promise((ok) => setTimeout(ok, 5));
        activos--;
        if (n === 3 && (fallos.get(3) ?? 0) < 1) {
          fallos.set(3, 1);
          throw new Error("red");
        }
        if (n === 5) throw new Error("repetido");
        return n * 2;
      },
      { concurrencia: 3, reintentos: 2, espera: () => 1, reintentable: (e) => (e as Error).message !== "repetido" },
    );
    expect(maximo).toBe(3);
    expect(r[2]).toEqual({ ok: true, valor: 6, intentos: 2 });
    expect(r[4]).toMatchObject({ ok: false, error: "repetido", intentos: 1 });
    expect(r.filter((x) => x.ok)).toHaveLength(6);
  });

  it("se cancela sin procesar lo que falta", async () => {
    const ctrl = new AbortController();
    const hechos: number[] = [];
    const r = await ejecutarCola(
      [1, 2, 3, 4],
      async (n) => {
        hechos.push(n);
        if (n === 2) ctrl.abort();
        return n;
      },
      { concurrencia: 1, signal: ctrl.signal },
    );
    expect(hechos).toEqual([1, 2]);
    expect(r.slice(2).every((x) => !x.ok && x.cancelada)).toBe(true);
  });
});

describe("subida del ZIP", () => {
  const zip = zipSync({
    "ODS 5/5.6.3 politica maternidad 2024.txt": strToU8("Política de licencia de maternidad y paternidad de la UDES 2024. ".repeat(30)),
    "ODS 5/copia.txt": strToU8("Política de licencia de maternidad y paternidad de la UDES 2024. ".repeat(30)),
    "ODS 4/acta.txt": strToU8("Acta del curso abierto"),
  });

  it("guarda, omite el contenido repetido, reintenta lo de red y reanuda sin duplicar", async () => {
    const { subirZip } = await import("./subida");
    const archivos = revisarEntradas(await leerDirectorio(blobDe(zip))).filter((a) => !a.descarte);
    const guardados: { ruta: string; indicador: string | undefined }[] = [];
    let fallas = 1;
    const guardar = async (a: { ruta: string; clasificacion: { propuestas: { indicador: string }[] } }) => {
      if (a.ruta.includes("acta") && fallas-- > 0) throw new Error("red caída");
      guardados.push({ ruta: a.ruta, indicador: a.clasificacion.propuestas[0]?.indicador });
    };
    const conocidos = new Map<string, string>();
    const avances: number[] = [];
    const r = await subirZip(blobDe(zip), archivos, {
      ciclo: null,
      zipNombre: "evidencias.zip",
      conocidos,
      concurrencia: 1,
      espera: () => 0,
      guardar,
      leerTexto: async (b) => ({ texto: new TextDecoder().decode(b), estado: "ok", nota: null }),
      alAvanzar: (p) => avances.push(p.hechos),
    });
    expect(r.map((x) => x.estado).sort()).toEqual(["guardado", "guardado", "repetido"]);
    expect(guardados.find((g) => g.ruta.includes("5.6.3"))?.indicador).toBe("5.6.3");
    expect(avances).toEqual([1, 2, 3]);

    // Reanudar: todo lo ya guardado se omite por su hash.
    const otra = await subirZip(blobDe(zip), archivos, { ciclo: null, zipNombre: "evidencias.zip", conocidos, guardar, espera: () => 0, leerTexto: async () => ({ texto: "", estado: "ok", nota: null }) });
    expect(otra.every((x) => x.estado === "repetido")).toBe(true);
    expect(guardados).toHaveLength(2);
  });

  it("cancelar deja lo pendiente como cancelado", async () => {
    const { subirZip } = await import("./subida");
    const archivos = revisarEntradas(await leerDirectorio(blobDe(zip))).filter((a) => !a.descarte);
    const control = new AbortController();
    control.abort();
    const r = await subirZip(blobDe(zip), archivos, { ciclo: null, zipNombre: "z", conocidos: new Map(), signal: control.signal, guardar: async () => undefined });
    expect(r.every((x) => x.estado === "cancelado")).toBe(true);
  });
});

describe("filtros de la biblioteca", () => {
  const fila = (id: string, estado: "propuesta" | "aceptada" | "sin_clasificar", carpeta: string, puntaje: number, ind = "5.6.3") => ({
    id,
    nombre: `${id}.pdf`,
    carpeta,
    ruta_zip: `${carpeta}/${id}.pdf`,
    estado,
    ods_propuestos: [Number(ind.split(".")[0])],
    propuestas: [{ indicador: ind, ods: Number(ind.split(".")[0]), puntaje }],
    indicador_aceptado: estado === "aceptada" ? ind : null,
  });
  const filas = [fila("a", "propuesta", "ODS 5/Licencias", 82), fila("b", "propuesta", "ODS 4", 45, "4.3.1"), fila("c", "aceptada", "ODS 5", 90), fila("d", "sin_clasificar", "Otros", 10)];

  it("filtra por estado, ODS, carpeta (con subcarpetas) y texto sin tildes", async () => {
    const { filtrar, contarEstados, carpetasDe, aceptablesEnLote, esEnlacePublico } = await import("./filtros");
    expect(filtrar(filas, { estado: "propuesta", ods: null, carpeta: "", texto: "" }).map((f) => f.id)).toEqual(["a", "b"]);
    expect(filtrar(filas, { estado: "todos", ods: 5, carpeta: "ODS 5", texto: "" }).map((f) => f.id)).toEqual(["a", "c"]);
    expect(filtrar(filas, { estado: "todos", ods: null, carpeta: "", texto: "licéncias" }).map((f) => f.id)).toEqual(["a"]);
    expect(contarEstados(filas)).toEqual({ sin_clasificar: 1, propuesta: 2, aceptada: 1, descartada: 0 });
    expect(carpetasDe(filas)).toEqual(["ODS 4", "ODS 5", "ODS 5/Licencias", "Otros"]);
    expect(aceptablesEnLote(filas).map((f) => f.id)).toEqual(["a"]);
    expect(esEnlacePublico("https://udes.edu.co/politica.pdf")).toBe(true);
    expect(esEnlacePublico("https://x.supabase.co/storage/v1/object/sign/b/a.pdf?token=1")).toBe(false);
    expect(esEnlacePublico("http://udes.edu.co")).toBe(false);
  });
});

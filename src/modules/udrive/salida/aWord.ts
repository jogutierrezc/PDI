/* =============================================================================
   UDrive · exportar el informe a Word (.docx), fase 3.

   Parte de lo mismo que el PDF (EntradaPdf: cifras ya resueltas, citas APA,
   numeración de figuras, datos de tablas y gráficas) y arma un documento de
   Word con estilos de verdad: títulos 1–3 (el contenido se arma con ellos),
   tablas de Word, listas con numeración, gráficas como imagen y fuentes APA con
   sangría francesa. La librería `docx` se carga solo al exportar.

   Lo que Word no recibe igual que el PDF: los números de página de los índices
   de ilustraciones, tablas y gráficas (van sin número) y el contenido, que Word
   rellena al abrir (pide «actualizar campos»).
   ========================================================================== */

import type { Bloque, BImagen, BMapa, BTabla } from "../lib/documento";
import { referenciaApa } from "../lib/apa";
import { colorDeTramo } from "../lib/calor";
import { TITULO_INDICE, indicesActivos } from "../lib/numeracion";
import type { ClaveIndice } from "../lib/numeracion";
import { enlaceSeguro, tramos } from "../lib/texto";
import { numeroDe, textoNumero } from "../lib/valores";
import type { ColumnaUd } from "../tipos";
import { graficaAImagen } from "./graficaAImagen";
import type { ImagenPng } from "./graficaAImagen";
import { mapaAImagen } from "./mapaAImagen";
import type { EntradaPdf } from "./PaginasPdf";
import { ALTO_GRAFICA, notaGrafica, notaTabla, tituloGrafica, tituloTabla } from "./Piezas";

type Docx = typeof import("docx");

const AZUL = "16406F";
const ANCHO_UTIL_PX = 624; // 6,5 pulgadas a 96 ppp: Carta con márgenes de una pulgada
const ANCHO_UTIL_TWIPS = 9360;
const PX_ANCHO = { completo: ANCHO_UTIL_PX, medio: 450, pequeno: 312 } as const;
const TOPE_IMAGEN_PX = 1600;

export interface ResultadoWord {
  blob: Blob;
  /** Cosas que no se pudieron incluir (una gráfica sin dibujar, una imagen que no cargó). */
  avisos: string[];
}

/** «#rrggbb» o «rgb(r, g, b)» → «RRGGBB» para el relleno de una celda. */
function hexDe(color: string): string | null {
  const c = color.trim();
  const h = /^#([0-9a-f]{6})$/i.exec(c);
  if (h) return h[1].toUpperCase();
  const h3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (h3) return `${h3[1]}${h3[1]}${h3[2]}${h3[2]}${h3[3]}${h3[3]}`.toUpperCase();
  const r = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  if (r) return [r[1], r[2], r[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("").toUpperCase();
  return null;
}

/** Una imagen de UDrive → PNG de tamaño razonable (también convierte webp, que Word no lee). */
async function imagenDeUrl(url: string): Promise<ImagenPng | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mapa = await createImageBitmap(await r.blob());
    const k = Math.min(1, TOPE_IMAGEN_PX / Math.max(mapa.width, mapa.height));
    const w = Math.max(1, Math.round(mapa.width * k));
    const h = Math.max(1, Math.round(mapa.height * k));
    const lienzo = document.createElement("canvas");
    lienzo.width = w;
    lienzo.height = h;
    const c = lienzo.getContext("2d");
    if (!c) return null;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, w, h);
    c.drawImage(mapa, 0, 0, w, h);
    mapa.close();
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/png"));
    return blob ? { datos: new Uint8Array(await blob.arrayBuffer()), ancho: w, alto: h } : null;
  } catch {
    return null;
  }
}

export async function construirWord(entrada: EntradaPdf, alProgreso?: (texto: string) => void): Promise<ResultadoWord> {
  const D: Docx = await import("docx");
  const { doc, recursos, figuras, texto, cifra } = entrada;
  const avisos: string[] = [];

  /* ---------- texto con formato ---------------------------------------------------------- */
  const corridas = (marcado: string, base: { size?: number; bold?: boolean; italics?: boolean; color?: string } = {}) => {
    const salida: (InstanceType<Docx["TextRun"]> | InstanceType<Docx["ExternalHyperlink"]>)[] = [];
    for (const t of tramos(marcado)) {
      let cadena: string;
      let negrita = false;
      let cursiva = false;
      if (t.t === "texto") {
        cadena = t.texto;
        negrita = t.b;
        cursiva = t.i;
      } else if (t.t === "cifra") cadena = cifra(t.clave)?.texto ?? "sin dato";
      else if (t.t === "cita") cadena = texto.cita(t.fuente, t.extra) ?? "(fuente sin definir)";
      else cadena = texto.ref(t.bloque) ?? "(referencia rota)";
      if (!cadena) continue;
      const corrida = new D.TextRun({ text: cadena, bold: base.bold || negrita, italics: base.italics || cursiva, size: base.size, color: base.color });
      if (t.t === "texto" && t.enlace && enlaceSeguro(t.enlace)) {
        salida.push(new D.ExternalHyperlink({ link: t.enlace, children: [new D.TextRun({ text: cadena, bold: base.bold || negrita, italics: base.italics || cursiva, size: base.size, style: "Hyperlink" })] }));
      } else salida.push(corrida);
    }
    return salida;
  };

  const parrafo = (marcado: string, opciones: Omit<ConstructorParameters<Docx["Paragraph"]>[0] & object, "children"> = {}, base = {}) =>
    new D.Paragraph({ ...opciones, children: corridas(marcado, base) });

  const pie = (etiqueta: string, titulo: string) =>
    new D.Paragraph({
      keepNext: true,
      spacing: { before: 200, after: 80 },
      children: [new D.TextRun({ text: `${etiqueta}. `, bold: true, size: 20 }), ...corridas(titulo.trim() || "Sin título", { italics: true, size: 20 })],
    });
  const nota = (marcado: string) =>
    marcado.trim()
      ? [new D.Paragraph({ spacing: { before: 60, after: 200 }, children: [new D.TextRun({ text: "Nota. ", bold: true, size: 18 }), ...corridas(marcado, { size: 18 })] })]
      : [];
  const aviso = (t: string) => new D.Paragraph({ spacing: { after: 160 }, children: [new D.TextRun({ text: t, italics: true, color: "888888", size: 20 })] });

  /* ---------- tabla ------------------------------------------------------------------------------ */
  const celdaTexto = (c: ColumnaUd, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "";
    return typeof v === "number" ? textoNumero(v) : String(v);
  };
  const bordeFino = { style: D.BorderStyle.SINGLE, size: 4, color: "C8CFD8" };
  const bordes = { top: bordeFino, bottom: bordeFino, left: bordeFino, right: bordeFino };

  const tablaWord = (b: BTabla) => {
    const t = recursos.tablas.get(b.archivoId);
    const fig = figuras.get(b.id);
    if (!b.archivoId || !t) {
      avisos.push(`${fig?.etiqueta ?? "Una tabla"}: no se pudo leer la tabla.`);
      return [aviso(b.archivoId ? "[No se pudo leer la tabla: ya no existe o no tiene permiso para verla.]" : "[Falta elegir una tabla de UDrive para este bloque.]")];
    }
    const ancho = Math.floor(ANCHO_UTIL_TWIPS / Math.max(1, t.columnas.length));
    const tamano = t.columnas.length > 8 ? 14 : t.columnas.length > 5 ? 16 : 18;
    const conCalor = b.mapaCalor && t.mapaCalor && t.columnas.some((c) => c.calor && c.calor.length > 1);
    const esNum = (c: ColumnaUd) => c.tipo === "numero" || c.tipo === "porcentaje";
    const filas = [
      new D.TableRow({
        tableHeader: b.repetirEncabezado,
        cantSplit: true,
        children: t.columnas.map(
          (c) =>
            new D.TableCell({
              width: { size: ancho, type: D.WidthType.DXA },
              borders: bordes,
              shading: { type: D.ShadingType.CLEAR, fill: AZUL, color: "auto" },
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [new D.Paragraph({ alignment: esNum(c) ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT, children: [new D.TextRun({ text: c.etiqueta, bold: true, color: "FFFFFF", size: tamano })] })],
            }),
        ),
      }),
      ...t.filas.map(
        (f) =>
          new D.TableRow({
            cantSplit: true,
            children: t.columnas.map((c) => {
              const v = f.datos[c.clave] ?? null;
              const fondo = conCalor && c.calor ? colorDeTramo(numeroDe(v), c.calor) : null;
              const hex = fondo ? hexDe(fondo) : null;
              return new D.TableCell({
                width: { size: ancho, type: D.WidthType.DXA },
                borders: bordes,
                shading: hex ? { type: D.ShadingType.CLEAR, fill: hex, color: "auto" } : undefined,
                margins: { top: 40, bottom: 40, left: 80, right: 80 },
                children: [new D.Paragraph({ alignment: esNum(c) ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT, children: [new D.TextRun({ text: celdaTexto(c, v), size: tamano })] })],
              });
            }),
          }),
      ),
    ];
    return [
      pie(fig?.etiqueta ?? "Tabla", tituloTabla(b, t)),
      new D.Table({ width: { size: ANCHO_UTIL_TWIPS, type: D.WidthType.DXA }, columnWidths: t.columnas.map(() => ancho), rows: filas }),
      ...nota(notaTabla(b, t)),
    ];
  };

  /* ---------- imágenes y gráficas ------------------------------------------------------------------ */
  const figuraImagen = (png: ImagenPng, anchoPx: number, alt: string) => {
    const w = Math.min(anchoPx, png.ancho);
    const h = Math.round((png.alto * w) / png.ancho);
    return new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      keepNext: false,
      spacing: { after: 60 },
      children: [new D.ImageRun({ type: "png", data: png.datos, transformation: { width: w, height: h }, altText: { name: alt.slice(0, 80) || "Imagen", title: alt.slice(0, 80) || "Imagen", description: alt.slice(0, 250) || "Imagen" } })],
    });
  };

  const graficaWord = async (b: Extract<Bloque, { tipo: "grafica" }>) => {
    const g = recursos.graficas.get(b.archivoId);
    const fig = figuras.get(b.id);
    const tabla = g?.tabla_id ? recursos.tablas.get(g.tabla_id) : null;
    if (!b.archivoId || !g || !tabla) {
      avisos.push(`${fig?.etiqueta ?? "Una gráfica"}: no se pudo leer la gráfica o su tabla.`);
      return [aviso("[No se pudo leer la gráfica o la tabla que la alimenta.]")];
    }
    const anchoPx = PX_ANCHO[b.ancho];
    const png = await graficaAImagen({ columnas: tabla.columnas, filas: tabla.filas }, g.config, anchoPx, ALTO_GRAFICA[b.ancho]);
    if (!png) {
      avisos.push(`${fig?.etiqueta ?? "Una gráfica"}: no se pudo dibujar.`);
      return [pie(fig?.etiqueta ?? "Gráfica", tituloGrafica(b, g)), aviso("[No se pudo dibujar la gráfica.]")];
    }
    return [pie(fig?.etiqueta ?? "Gráfica", tituloGrafica(b, g)), figuraImagen(png, anchoPx, tituloGrafica(b, g)), ...nota(notaGrafica(b, g))];
  };

  const imagenWord = async (b: BImagen) => {
    const im = recursos.imagenes.get(b.archivoId);
    const fig = figuras.get(b.id);
    const png = im ? await imagenDeUrl(im.url) : null;
    if (!png) {
      avisos.push(`${fig?.etiqueta ?? "Una imagen"}: no se pudo leer la imagen.`);
      return [aviso("[No se pudo leer la imagen.]")];
    }
    return [pie(fig?.etiqueta ?? "Ilustración", b.titulo), figuraImagen(png, PX_ANCHO[b.ancho], b.alt.trim() || b.titulo.trim() || im?.nombre || "Imagen"), ...nota(b.nota)];
  };

  const mapaWord = async (b: BMapa) => {
    const fig = figuras.get(b.id);
    const anchoPx = PX_ANCHO[b.ancho];
    const png = await mapaAImagen(b.lat, b.lng, b.zoom, b.marcadores, anchoPx);
    if (!png) {
      avisos.push(`${fig?.etiqueta ?? "Un mapa"}: no se pudo dibujar (OpenStreetMap no respondió).`);
      return [pie(fig?.etiqueta ?? "Ilustración", b.titulo), aviso("[No se pudo dibujar el mapa.]"), ...nota(b.nota)];
    }
    return [pie(fig?.etiqueta ?? "Ilustración", b.titulo), figuraImagen(png, anchoPx, b.alt.trim() || b.titulo.trim() || "Mapa"), ...nota(b.nota)];
  };

  /* ---------- listas ------------------------------------------------------------------------------------ */
  let listasOrdenadas = 0;
  const referenciasNumeracion: { reference: string; levels: { level: number; format: (typeof D.LevelFormat)[keyof typeof D.LevelFormat]; text: string; alignment: (typeof D.AlignmentType)[keyof typeof D.AlignmentType]; style: { paragraph: { indent: { left: number; hanging: number } } } }[] }[] = [];
  const nivelLista = (formato: (typeof D.LevelFormat)[keyof typeof D.LevelFormat], texto: string) => ({
    level: 0,
    format: formato,
    text: texto,
    alignment: D.AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720, hanging: 360 } } },
  });
  referenciasNumeracion.push({ reference: "vinetas", levels: [nivelLista(D.LevelFormat.BULLET, "•")] });

  /* ---------- armado de las secciones -------------------------------------------------------------------- */
  const portada = doc.portada;
  const hijosPortada = [
    new D.Paragraph({ spacing: { before: 2600, after: 240 }, alignment: D.AlignmentType.LEFT, children: [new D.TextRun({ text: (portada.titulo.trim() || entrada.titulo || "Informe").toLocaleUpperCase("es"), bold: true, size: 64, color: AZUL })] }),
    ...(portada.subtitulo.trim() ? [new D.Paragraph({ spacing: { after: 240 }, children: [new D.TextRun({ text: portada.subtitulo, size: 36, color: "444444" })] })] : []),
    new D.Paragraph({ spacing: { before: 3200 }, children: [new D.TextRun({ text: portada.entidad.trim() || "Universidad de Santander", bold: true, size: 28 })] }),
    new D.Paragraph({ children: [new D.TextRun({ text: "Acreditada en alta calidad", size: 22, color: "555555" })] }),
    new D.Paragraph({ spacing: { before: 120 }, children: [new D.TextRun({ text: "Planeación Institucional", size: 22 })] }),
    new D.Paragraph({ children: [new D.TextRun({ text: portada.anio, size: 22 })] }),
  ];

  const hijosIndices: (InstanceType<Docx["Paragraph"]> | InstanceType<Docx["TableOfContents"]>)[] = [];
  for (const ind of indicesActivos(doc, figuras, texto)) {
    hijosIndices.push(new D.Paragraph({ pageBreakBefore: hijosIndices.length > 0, spacing: { after: 240 }, children: [new D.TextRun({ text: TITULO_INDICE[ind.clave as ClaveIndice], bold: true, size: 32, color: AZUL })] }));
    if (ind.clave === "contenido") {
      hijosIndices.push(new D.TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-3" }));
    } else {
      for (const e of ind.entradas) hijosIndices.push(new D.Paragraph({ spacing: { after: 80 }, children: [new D.TextRun({ text: `${e.etiqueta} `, bold: true }), new D.TextRun({ text: e.texto })] }));
    }
  }

  const cuerpo: (InstanceType<Docx["Paragraph"]> | InstanceType<Docx["Table"]> | InstanceType<Docx["TableOfContents"]>)[] = [];
  let n = 0;
  for (const b of doc.bloques) {
    n += 1;
    if (n % 5 === 0) alProgreso?.(`Armando el Word… ${n} de ${doc.bloques.length} bloques`);
    switch (b.tipo) {
      case "capitulo":
        if (b.titulo.trim()) {
          cuerpo.push(new D.Paragraph({ heading: b.nivel === 1 ? D.HeadingLevel.HEADING_1 : b.nivel === 2 ? D.HeadingLevel.HEADING_2 : D.HeadingLevel.HEADING_3, keepNext: true, children: [new D.TextRun({ text: b.titulo.trim() })] }));
        }
        break;
      case "parrafo":
        if (b.texto.trim()) cuerpo.push(parrafo(b.texto, { alignment: D.AlignmentType.JUSTIFIED, spacing: { after: 160, line: 300 } }));
        break;
      case "lista": {
        let ref = "vinetas";
        if (b.ordenada) {
          ref = `orden-${++listasOrdenadas}`;
          referenciasNumeracion.push({ reference: ref, levels: [nivelLista(D.LevelFormat.DECIMAL, "%1.")] });
        }
        for (const i of b.items) if (i.trim()) cuerpo.push(parrafo(i, { numbering: { reference: ref, level: 0 }, spacing: { after: 80 } }));
        cuerpo.push(new D.Paragraph({ spacing: { after: 80 }, children: [] }));
        break;
      }
      case "tabla":
        cuerpo.push(...tablaWord(b));
        break;
      case "grafica":
        alProgreso?.("Dibujando las gráficas…");
        cuerpo.push(...(await graficaWord(b)));
        break;
      case "imagen":
        cuerpo.push(...(await imagenWord(b)));
        break;
      case "mapa":
        alProgreso?.("Dibujando los mapas…");
        cuerpo.push(...(await mapaWord(b)));
        break;
      case "destacado":
        if (b.texto.trim())
          cuerpo.push(
            parrafo(b.texto, {
              spacing: { before: 160, after: 240, line: 300 },
              indent: { left: 360, right: 360 },
              border: { left: { style: D.BorderStyle.SINGLE, size: 24, color: AZUL, space: 10 } },
              shading: { type: D.ShadingType.CLEAR, fill: "EEF3F9", color: "auto" },
            }),
          );
        break;
      case "nota":
        cuerpo.push(...nota(b.texto));
        break;
      case "salto":
        cuerpo.push(new D.Paragraph({ children: [new D.PageBreak()] }));
        break;
      case "referencias":
        cuerpo.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, keepNext: true, children: [new D.TextRun({ text: b.titulo.trim() || "Referencias" })] }));
        for (const f of entrada.bibliografia) cuerpo.push(parrafo(referenciaApa(f), { indent: { left: 720, hanging: 720 }, spacing: { after: 120 } }));
        break;
    }
  }

  alProgreso?.("Guardando el archivo…");
  const cabecera = entrada.borrador ? "BORRADOR · " : "";
  const documento = new D.Document({
    creator: "UDrive · Universidad de Santander",
    title: entrada.titulo || portada.titulo || "Informe",
    features: { updateFields: true },
    numbering: { config: referenciasNumeracion },
    styles: {
      default: { document: { run: { font: "Georgia", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 36, bold: true, color: AZUL }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 28, bold: true, color: AZUL }, paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 24, bold: true, color: "2B6CC4" }, paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 } },
      ],
      characterStyles: [{ id: "Hyperlink", name: "Hyperlink", basedOn: "DefaultParagraphFont", run: { color: "1F5FB0", underline: { type: D.UnderlineType.SINGLE } } }],
    },
    sections: [
      { properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: hijosPortada },
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        headers: { default: new D.Header({ children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.TextRun({ text: `${cabecera}${entrada.titulo || portada.titulo}`.slice(0, 120), size: 16, color: "777777" })] })] }) },
        footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ children: [D.PageNumber.CURRENT], size: 18, color: "555555" })] })] }) },
        children: [...hijosIndices, ...(hijosIndices.length ? [new D.Paragraph({ children: [new D.PageBreak()] })] : []), ...cuerpo],
      },
    ],
  });
  return { blob: await D.Packer.toBlob(documento), avisos };
}

/** Arma el Word y lo descarga con `nombreArchivo` (sin extensión). */
export async function exportarWord(entrada: EntradaPdf, nombreArchivo: string, alProgreso?: (texto: string) => void): Promise<string[]> {
  const { blob, avisos } = await construirWord(entrada, alProgreso);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombreArchivo.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.docx$/i, "").slice(0, 120) || "Informe"}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return avisos;
}

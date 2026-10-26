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
import { CIERRE_VACIO } from "../lib/documento";
import { referenciaApa } from "../lib/apa";
import { colorDeTramo } from "../lib/calor";
import { TITULO_INDICE, indicesActivos, numerarCapitulos } from "../lib/numeracion";
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
const TOPE_IMAGEN_PX = 1600;
/** Hoja en twips (1/1440 de pulgada). */
const PAPEL_TWIPS = { carta: { w: 12240, h: 15840 }, a4: { w: 11906, h: 16838 } } as const;
const TWIPS_POR_MM = 56.693;
const sinNumeral = (hex: string): string => hex.replace("#", "").toUpperCase();

/** Lo que el Word recibe además del documento: la portada y la contraportada ya dibujadas como imagen. */
export interface OpcionesWord {
  portadaPng?: ImagenPng | null;
  contraportadaPng?: ImagenPng | null;
}

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

export async function construirWord(entrada: EntradaPdf, alProgreso?: (texto: string) => void, opciones: OpcionesWord = {}): Promise<ResultadoWord> {
  const D: Docx = await import("docx");
  const { doc, recursos, figuras, texto, cifra } = entrada;
  const avisos: string[] = [];

  /* ---------- el estilo en Word ---------------------------------------------------------- */
  // El Clásico reproduce lo de siempre (Georgia y Calibri, azul fijo, una pulgada de margen).
  const e = entrada.estilo;
  const clasico = e.portada.comp === 0;
  const hoja = PAPEL_TWIPS[entrada.papel];
  const margenX = clasico ? 1440 : Math.round(e.texto.mx * TWIPS_POR_MM);
  const acentoHex = sinNumeral(e.portada.acento);
  const colorTitulo = e.texto.tcol === "acento" ? acentoHex : "072B58";
  const fuenteCuerpo = clasico ? "Georgia" : e.texto.fb;
  const fuenteTitulo = clasico ? "Calibri" : e.texto.ft;
  const tamCuerpo = clasico ? 22 : Math.round(e.texto.fs * 2);
  const escala = tamCuerpo / 22;
  const interlineado = clasico ? 300 : Math.round(e.texto.lh * 240);
  const justificado = clasico || e.texto.just;
  let anchoTwips = hoja.w - margenX * 2;
  const anchoPx = (): number => Math.round(anchoTwips / 15);
  const pxAncho = (a: "completo" | "medio" | "pequeno"): number => (clasico && anchoTwips === 9360 ? { completo: 624, medio: 450, pequeno: 312 }[a] : Math.round(anchoPx() * { completo: 1, medio: 0.72, pequeno: 0.5 }[a]));
  const numeros = e.texto.num ? numerarCapitulos(doc.bloques) : new Map<string, string>();
  const calorOk = e.tablas.calor;
  const rellenoEnc = e.tablas.enc === "marino" ? "072B58" : e.tablas.enc === "acento" ? acentoHex : e.tablas.enc === "claro" ? null : AZUL;

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

  const abajo = !clasico && e.tablas.capPos === "abajo";
  const pie = (etiqueta: string, titulo: string) =>
    e.tablas.capEstilo === "apa"
      ? new D.Paragraph({
          keepNext: !abajo,
          spacing: { before: abajo ? 80 : 200, after: abajo ? 200 : 80 },
          children: [new D.TextRun({ text: etiqueta, bold: true, size: 20 }), new D.TextRun({ text: "", break: 1 }), ...corridas(titulo.trim() || "Sin título", { italics: true, size: 20 })],
        })
      : new D.Paragraph({
          keepNext: !abajo,
          spacing: { before: abajo ? 80 : 200, after: abajo ? 200 : 80 },
          children: [new D.TextRun({ text: `${etiqueta}. `, bold: true, size: 20 }), ...corridas(titulo.trim() || "Sin título", { italics: clasico, size: 20 })],
        });
  const nota = (marcado: string) =>
    marcado.trim()
      ? [
          new D.Paragraph({
            spacing: { before: 60, after: 200 },
            shading: !clasico && e.tablas.nota === "caja" ? { type: D.ShadingType.CLEAR, fill: "EEF3F9", color: "auto" } : undefined,
            children: [new D.TextRun({ text: "Nota. ", bold: true, size: 18 }), ...corridas(marcado, { size: 18 })],
          }),
        ]
      : [];
  /** Título arriba o abajo de la figura, según el estilo. */
  const colocar = <T,>(titulo: InstanceType<Docx["Paragraph"]>, cuerpo: T[]): (T | InstanceType<Docx["Paragraph"]>)[] => (abajo ? [...cuerpo, titulo] : [titulo, ...cuerpo]);
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
    const ancho = Math.floor(anchoTwips / Math.max(1, t.columnas.length));
    const tamano = t.columnas.length > 8 ? 14 : t.columnas.length > 5 ? 16 : 18;
    const conCalor = b.mapaCalor && t.mapaCalor && calorOk && t.columnas.some((c) => c.calor && c.calor.length > 1);
    const lineaClara = { style: D.BorderStyle.SINGLE, size: 4, color: "D6DEE8" };
    const lineaFuerte = { style: D.BorderStyle.SINGLE, size: 12, color: "072B58" };
    const sinBorde = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const bordesCelda = (encabezado: boolean, ultima: boolean) => {
      if (clasico || e.tablas.bordes === "clasico") return bordes;
      if (e.tablas.bordes === "rejilla") return { top: lineaClara, bottom: lineaClara, left: lineaClara, right: lineaClara };
      if (e.tablas.bordes === "apa") return { top: encabezado && e.tablas.enc === "claro" ? lineaFuerte : sinBorde, bottom: encabezado || ultima ? lineaFuerte : sinBorde, left: sinBorde, right: sinBorde };
      return { top: sinBorde, bottom: lineaClara, left: sinBorde, right: sinBorde };
    };
    const colorTextoEnc = rellenoEnc ? "FFFFFF" : "072B58";
    const esNum = (c: ColumnaUd) => c.tipo === "numero" || c.tipo === "porcentaje";
    const filas = [
      new D.TableRow({
        tableHeader: b.repetirEncabezado,
        cantSplit: true,
        children: t.columnas.map(
          (c) =>
            new D.TableCell({
              width: { size: ancho, type: D.WidthType.DXA },
              borders: bordesCelda(true, false),
              shading: rellenoEnc ? { type: D.ShadingType.CLEAR, fill: rellenoEnc, color: "auto" } : undefined,
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [new D.Paragraph({ alignment: esNum(c) ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT, children: [new D.TextRun({ text: c.etiqueta, bold: true, color: colorTextoEnc, size: tamano })] })],
            }),
        ),
      }),
      ...t.filas.map(
        (f, fi) =>
          new D.TableRow({
            cantSplit: true,
            children: t.columnas.map((c) => {
              const v = f.datos[c.clave] ?? null;
              const fondo = conCalor && c.calor ? colorDeTramo(numeroDe(v), c.calor) : null;
              const hex = fondo ? hexDe(fondo) : !clasico && e.tablas.cebra && fi % 2 === 1 ? "F1F5FA" : null;
              return new D.TableCell({
                width: { size: ancho, type: D.WidthType.DXA },
                borders: bordesCelda(false, fi === t.filas.length - 1),
                shading: hex ? { type: D.ShadingType.CLEAR, fill: hex, color: "auto" } : undefined,
                margins: { top: 40, bottom: 40, left: 80, right: 80 },
                children: [new D.Paragraph({ alignment: esNum(c) ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT, children: [new D.TextRun({ text: celdaTexto(c, v), size: tamano })] })],
              });
            }),
          }),
      ),
    ];
    return [
      ...colocar(pie(fig?.etiqueta ?? "Tabla", tituloTabla(b, t)), [new D.Table({ width: { size: anchoTwips, type: D.WidthType.DXA }, columnWidths: t.columnas.map(() => ancho), rows: filas })]),
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
    const anchoPx = pxAncho(b.ancho);
    const png = await graficaAImagen({ columnas: tabla.columnas, filas: tabla.filas }, g.config, anchoPx, ALTO_GRAFICA[b.ancho]);
    if (!png) {
      avisos.push(`${fig?.etiqueta ?? "Una gráfica"}: no se pudo dibujar.`);
      return [pie(fig?.etiqueta ?? "Gráfica", tituloGrafica(b, g)), aviso("[No se pudo dibujar la gráfica.]")];
    }
    return [...colocar(pie(fig?.etiqueta ?? "Gráfica", tituloGrafica(b, g)), [figuraImagen(png, anchoPx, tituloGrafica(b, g))]), ...nota(notaGrafica(b, g))];
  };

  const imagenWord = async (b: BImagen) => {
    const im = recursos.imagenes.get(b.archivoId);
    const fig = figuras.get(b.id);
    const png = im ? await imagenDeUrl(im.url) : null;
    if (!png) {
      avisos.push(`${fig?.etiqueta ?? "Una imagen"}: no se pudo leer la imagen.`);
      return [aviso("[No se pudo leer la imagen.]")];
    }
    return [...colocar(pie(fig?.etiqueta ?? "Ilustración", b.titulo), [figuraImagen(png, pxAncho(b.ancho), b.alt.trim() || b.titulo.trim() || im?.nombre || "Imagen")]), ...nota(b.nota)];
  };

  const mapaWord = async (b: BMapa) => {
    const fig = figuras.get(b.id);
    const anchoPx = pxAncho(b.ancho);
    const png = await mapaAImagen(b.lat, b.lng, b.zoom, b.marcadores, anchoPx);
    if (!png) {
      avisos.push(`${fig?.etiqueta ?? "Un mapa"}: no se pudo dibujar (OpenStreetMap no respondió).`);
      return [pie(fig?.etiqueta ?? "Ilustración", b.titulo), aviso("[No se pudo dibujar el mapa.]"), ...nota(b.nota)];
    }
    return [...colocar(pie(fig?.etiqueta ?? "Ilustración", b.titulo), [figuraImagen(png, anchoPx, b.alt.trim() || b.titulo.trim() || "Mapa")]), ...nota(b.nota)];
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
  const cierre = doc.cierre ?? CIERRE_VACIO;
  type Hijo = InstanceType<Docx["Paragraph"]> | InstanceType<Docx["Table"]> | InstanceType<Docx["TableOfContents"]>;
  type Orientacion = "vertical" | "horizontal";
  type Seccion = ConstructorParameters<Docx["Document"]>[0]["sections"][number];

  /** La portada o la contraportada ya dibujadas: una imagen a página completa, detrás del texto. */
  const imagenDePagina = (png: ImagenPng, alt: string) =>
    new D.Paragraph({
      children: [
        new D.ImageRun({
          type: "png",
          data: png.datos,
          transformation: { width: Math.round(hoja.w / 15), height: Math.round(hoja.h / 15) },
          altText: { name: alt, title: alt, description: alt },
          floating: {
            horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: 0 },
            verticalPosition: { relative: D.VerticalPositionRelativeFrom.PAGE, offset: 0 },
            behindDocument: true,
            allowOverlap: true,
            wrap: { type: D.TextWrappingType.NONE },
          },
        }),
      ],
    });

  const lineaPortada = (t: string, tam: number, extra: { bold?: boolean; color?: string; antes?: number } = {}) =>
    new D.Paragraph({ spacing: { before: extra.antes ?? 0, after: 80 }, children: [new D.TextRun({ text: t, size: tam, bold: extra.bold, color: extra.color })] });

  let hijosPortada: Hijo[];
  if (!clasico && opciones.portadaPng) hijosPortada = [imagenDePagina(opciones.portadaPng, `Portada: ${portada.titulo.trim() || "informe"}`.slice(0, 120))];
  else {
    if (!clasico) avisos.push("La portada va como texto: el navegador no pudo dibujarla como imagen.");
    const titulo = (portada.titulo.trim() || entrada.titulo || "Informe").toLocaleUpperCase("es");
    hijosPortada = clasico
      ? [
          new D.Paragraph({ spacing: { before: 2600, after: 240 }, alignment: D.AlignmentType.LEFT, children: [new D.TextRun({ text: titulo, bold: true, size: 64, color: AZUL })] }),
          ...(portada.subtitulo.trim() ? [new D.Paragraph({ spacing: { after: 240 }, children: [new D.TextRun({ text: portada.subtitulo, size: 36, color: "444444" })] })] : []),
          new D.Paragraph({ spacing: { before: 3200 }, children: [new D.TextRun({ text: portada.entidad.trim() || "Universidad de Santander", bold: true, size: 28 })] }),
          new D.Paragraph({ children: [new D.TextRun({ text: "Acreditada en alta calidad", size: 22, color: "555555" })] }),
          new D.Paragraph({ spacing: { before: 120 }, children: [new D.TextRun({ text: "Planeación Institucional", size: 22 })] }),
          new D.Paragraph({ children: [new D.TextRun({ text: portada.anio, size: 22 })] }),
        ]
      : [
          new D.Paragraph({ spacing: { before: 2600, after: 240 }, children: [new D.TextRun({ text: titulo, bold: true, size: 64, color: acentoHex, font: fuenteTitulo })] }),
          ...(portada.subtitulo.trim() ? [lineaPortada(portada.subtitulo, 36, { color: "444444" })] : []),
          ...(portada.autor ? [lineaPortada(portada.autor, 28, { bold: true, antes: 3200 })] : []),
          ...[portada.afiliacion || portada.entidad, portada.fecha || portada.anio].filter(Boolean).map((t) => lineaPortada(t as string, 22, { color: "555555" })),
          ...(portada.nota ? [lineaPortada(portada.nota, 22, { color: "555555" })] : []),
        ];
  }

  /* ---------- las piezas del cuerpo, con su orientación y si van en columna ---------------------------------- */
  interface Pieza {
    orient: Orientacion;
    col: boolean;
    hijo: Hijo;
  }
  const piezas: Pieza[] = [];
  let orient: Orientacion = "vertical";
  const enColumnas = !clasico && e.texto.cols === 2;
  const poner = (col: boolean, ...hijos: Hijo[]) => hijos.forEach((hijo) => piezas.push({ orient, col: col && enColumnas, hijo }));
  const cambiarOrientacion = (a: Orientacion) => {
    orient = a;
    anchoTwips = (a === "horizontal" ? hoja.h : hoja.w) - margenX * 2;
  };

  let hayIndices = false;
  for (const ind of indicesActivos(doc, figuras, texto)) {
    hayIndices = true;
    poner(false, new D.Paragraph({ pageBreakBefore: piezas.length > 0, spacing: { after: 240 }, children: [new D.TextRun({ text: TITULO_INDICE[ind.clave as ClaveIndice], bold: true, size: 32, color: clasico ? AZUL : colorTitulo, font: clasico ? undefined : fuenteTitulo })] }));
    if (ind.clave === "contenido") {
      poner(false, new D.TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-3" }));
    } else {
      for (const en of ind.entradas) poner(false, new D.Paragraph({ spacing: { after: 80 }, children: [new D.TextRun({ text: `${en.etiqueta} `, bold: true }), new D.TextRun({ text: en.texto })] }));
    }
  }
  if (hayIndices) poner(false, new D.Paragraph({ children: [new D.PageBreak()] }));

  const destacado = (marcado: string): Hijo => {
    if (clasico || e.texto.dest === "barra") {
      return parrafo(marcado, {
        spacing: { before: 160, after: 240, line: 300 },
        indent: { left: 360, right: 360 },
        border: { left: { style: D.BorderStyle.SINGLE, size: 24, color: AZUL, space: 10 } },
        shading: { type: D.ShadingType.CLEAR, fill: "EEF3F9", color: "auto" },
      });
    }
    if (e.texto.dest === "caja")
      return parrafo(marcado, { spacing: { before: 160, after: 240, line: interlineado }, indent: { left: 120, right: 120 }, border: { top: { style: D.BorderStyle.SINGLE, size: 24, color: acentoHex, space: 6 } }, shading: { type: D.ShadingType.CLEAR, fill: "EEF3F9", color: "auto" } }, { bold: true });
    if (e.texto.dest === "filetes")
      return parrafo(marcado, { spacing: { before: 160, after: 240, line: interlineado }, border: { top: { style: D.BorderStyle.SINGLE, size: 12, color: "072B58", space: 6 }, bottom: { style: D.BorderStyle.SINGLE, size: 12, color: "072B58", space: 6 } } }, { bold: true, color: "072B58" });
    return parrafo(marcado, { spacing: { before: 160, after: 240, line: interlineado }, indent: { left: 720, right: 720 } }, { italics: true });
  };

  let n = 0;
  let sinSangria = true;
  for (const b of doc.bloques) {
    n += 1;
    if (n % 5 === 0) alProgreso?.(`Armando el Word… ${n} de ${doc.bloques.length} bloques`);
    switch (b.tipo) {
      case "capitulo":
        if (b.titulo.trim()) {
          const num = numeros.get(b.id);
          const conFilete = !clasico && (e.texto.cap === "filete" || e.texto.cap === "sello") && b.nivel === 1;
          poner(b.nivel > 1, new D.Paragraph({
            heading: b.nivel === 1 ? D.HeadingLevel.HEADING_1 : b.nivel === 2 ? D.HeadingLevel.HEADING_2 : D.HeadingLevel.HEADING_3,
            keepNext: true,
            border: conFilete ? { top: { style: D.BorderStyle.SINGLE, size: 24, color: acentoHex, space: 6 } } : undefined,
            children: [new D.TextRun({ text: `${num ? `${num} ` : ""}${b.titulo.trim()}` })],
          }));
          sinSangria = true;
        }
        break;
      case "parrafo":
        if (b.texto.trim()) {
          poner(true, parrafo(b.texto, { alignment: justificado ? D.AlignmentType.JUSTIFIED : D.AlignmentType.LEFT, spacing: { after: 160, line: interlineado }, indent: !clasico && e.texto.sang && !sinSangria ? { firstLine: 360 } : undefined }));
          sinSangria = false;
        }
        break;
      case "lista": {
        let ref = "vinetas";
        if (b.ordenada) {
          ref = `orden-${++listasOrdenadas}`;
          referenciasNumeracion.push({ reference: ref, levels: [nivelLista(D.LevelFormat.DECIMAL, "%1.")] });
        }
        for (const i of b.items) if (i.trim()) poner(true, parrafo(i, { numbering: { reference: ref, level: 0 }, spacing: { after: 80 } }));
        poner(true, new D.Paragraph({ spacing: { after: 80 }, children: [] }));
        break;
      }
      case "tabla":
        poner(false, ...tablaWord(b));
        break;
      case "grafica":
        alProgreso?.("Dibujando las gráficas…");
        poner(false, ...(await graficaWord(b)));
        break;
      case "imagen":
        poner(false, ...(await imagenWord(b)));
        break;
      case "mapa":
        alProgreso?.("Dibujando los mapas…");
        poner(false, ...(await mapaWord(b)));
        break;
      case "destacado":
        if (b.texto.trim()) poner(true, destacado(b.texto));
        break;
      case "nota":
        poner(true, ...nota(b.texto));
        break;
      case "salto":
        // Una sección de otra orientación empieza en hoja nueva por sí sola; si no, es un salto de página común.
        if (b.orientacion && b.orientacion !== orient) cambiarOrientacion(b.orientacion);
        else poner(false, new D.Paragraph({ children: [new D.PageBreak()] }));
        sinSangria = true;
        break;
      case "referencias":
        poner(false, new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, keepNext: true, children: [new D.TextRun({ text: b.titulo.trim() || "Referencias" })] }));
        for (const f of entrada.bibliografia) poner(false, parrafo(referenciaApa(f), { indent: { left: 720, hanging: 720 }, spacing: { after: 120 } }));
        sinSangria = true;
        break;
    }
  }

  if (cierre.conCierre) {
    cambiarOrientacion("vertical");
    const fila = (t: string, tam: number, extra: { bold?: boolean; color?: string } = {}) => new D.Paragraph({ spacing: { after: 100 }, children: [new D.TextRun({ text: t, size: tam, bold: extra.bold, color: extra.color })] });
    poner(false, new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, pageBreakBefore: true, keepNext: true, children: [new D.TextRun({ text: "Cierre" })] }));
    for (const p of cierre.mensaje.split(/\n+/).filter(Boolean)) poner(false, parrafo(p, { alignment: justificado ? D.AlignmentType.JUSTIFIED : D.AlignmentType.LEFT, spacing: { after: 160, line: interlineado } }));
    for (const f of cierre.firmas) {
      poner(false, new D.Paragraph({ spacing: { before: 480, after: 0 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: "072B58", space: 2 } }, children: [] }));
      if (f.nombre) poner(false, fila(f.nombre, 22, { bold: true }));
      if (f.cargo) poner(false, fila(f.cargo, 20, { color: "555555" }));
    }
    if (cierre.creditos) poner(false, new D.Paragraph({ spacing: { before: 360, after: 120 }, children: [new D.TextRun({ text: cierre.creditos, size: 18, color: "555555" })] }));
    for (const [k, v] of [["Dirección", cierre.direccion], ["Correo", cierre.correo], ["Teléfono", cierre.telefono], ["Sitio web", cierre.web]] as [string, string][]) if (v) poner(false, fila(`${k}: ${v}`, 20));
    poner(false, new D.Paragraph({ spacing: { before: 240 }, children: [new D.TextRun({ text: "Fuente de los datos. ", bold: true, size: 18 }), new D.TextRun({ text: "Las cifras vivas vienen de UDES en Cifras y de las tablas de UDrive que cita el informe; cada una indica su fuente y su corte.", size: 18 })] }));
  }

  /* ---------- cabecera, pie y secciones ------------------------------------------------------------------------ */
  alProgreso?.("Guardando el archivo…");
  const cabecera = entrada.borrador ? "BORRADOR · " : "";
  const textoCabecera = `${cabecera}${entrada.titulo || portada.titulo}`.slice(0, 120);
  const conCabecera = clasico || e.cabpie.cab !== "ninguna" || entrada.borrador;
  const crearCabecera = () =>
    new D.Header({
      children: [
        new D.Paragraph({
          alignment: clasico ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT,
          border: !clasico && e.cabpie.cab !== "ninguna" ? { bottom: { style: D.BorderStyle.SINGLE, size: e.cabpie.cab === "dos" ? 12 : 4, color: e.cabpie.cab === "dos" ? acentoHex : "D6DEE8", space: 4 } } : undefined,
          children: [new D.TextRun({ text: textoCabecera, size: 16, color: "777777" })],
        }),
      ],
    });
  const folio = (alineacion: (typeof D.AlignmentType)[keyof typeof D.AlignmentType]) => new D.Footer({ children: [new D.Paragraph({ alignment: alineacion, children: [new D.TextRun({ children: [D.PageNumber.CURRENT], size: 18, color: "555555" })] })] });
  const exterior = !clasico && e.cabpie.folio === "exterior";
  const crearPies = () => (clasico ? { default: folio(D.AlignmentType.CENTER) } : exterior ? { default: folio(D.AlignmentType.RIGHT), even: folio(D.AlignmentType.LEFT) } : { default: folio(e.cabpie.folio === "centro" ? D.AlignmentType.CENTER : D.AlignmentType.RIGHT) });
  const crearCabeceras = () => (conCabecera ? (exterior ? { default: crearCabecera(), even: crearCabecera() } : { default: crearCabecera() }) : undefined);
  const vacia = () => ({ default: new D.Header({ children: [new D.Paragraph({ children: [] })] }) });
  const vaciaPie = () => ({ default: new D.Footer({ children: [new D.Paragraph({ children: [] })] }) });
  const pagina = (o: Orientacion) => ({
    size: { width: hoja.w, height: hoja.h, orientation: o === "horizontal" ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT },
    margin: { top: 1440, right: margenX, bottom: 1440, left: margenX },
  });

  const secciones: Seccion[] = [{ properties: { page: pagina("vertical") }, headers: vacia(), footers: vaciaPie(), children: hijosPortada }];
  // El cuerpo se parte en secciones donde cambia la orientación o el número de columnas.
  let i = 0;
  let primera = true;
  while (i < piezas.length) {
    let j = i;
    while (j < piezas.length && piezas[j].orient === piezas[i].orient && piezas[j].col === piezas[i].col) j++;
    const tramo = piezas.slice(i, j);
    const previa = i > 0 ? piezas[i - 1] : null;
    const tipo = primera || (previa && previa.orient !== tramo[0].orient) ? D.SectionType.NEXT_PAGE : D.SectionType.CONTINUOUS;
    secciones.push({
      properties: { type: tipo, page: pagina(tramo[0].orient), ...(tramo[0].col ? { column: { count: 2, space: 425 } } : {}) },
      headers: crearCabeceras(),
      footers: crearPies(),
      children: tramo.map((p) => p.hijo),
    });
    primera = false;
    i = j;
  }
  if (!piezas.length) secciones.push({ properties: { page: pagina("vertical") }, headers: crearCabeceras(), footers: crearPies(), children: [new D.Paragraph({ children: [] })] });
  if (cierre.conContraportada) {
    if (!clasico && opciones.contraportadaPng) secciones.push({ properties: { type: D.SectionType.NEXT_PAGE, page: pagina("vertical") }, headers: vacia(), footers: vaciaPie(), children: [imagenDePagina(opciones.contraportadaPng, "Contraportada")] });
    else avisos.push("La contraportada no se exporta a Word: solo existe en el PDF.");
  }

  const tamTitulo = [36, 28, 24].map((x) => Math.round(x * escala));
  const documento = new D.Document({
    creator: "UDrive · Universidad de Santander",
    title: entrada.titulo || portada.titulo || "Informe",
    features: { updateFields: true },
    evenAndOddHeaderAndFooters: exterior,
    numbering: { config: referenciasNumeracion },
    styles: {
      default: { document: { run: { font: fuenteCuerpo, size: tamCuerpo } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: fuenteTitulo, size: tamTitulo[0], bold: true, color: clasico ? AZUL : colorTitulo }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: fuenteTitulo, size: tamTitulo[1], bold: true, color: clasico ? AZUL : colorTitulo }, paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: fuenteTitulo, size: tamTitulo[2], bold: true, color: clasico ? "2B6CC4" : colorTitulo }, paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 } },
      ],
      characterStyles: [{ id: "Hyperlink", name: "Hyperlink", basedOn: "DefaultParagraphFont", run: { color: "1F5FB0", underline: { type: D.UnderlineType.SINGLE } } }],
    },
    sections: secciones,
  });
  if (enColumnas) avisos.push("Las dos columnas se exportan por tramos: el texto en dos columnas y las tablas y figuras a todo el ancho.");
  return { blob: await D.Packer.toBlob(documento), avisos };
}

/** Arma el Word y lo descarga con `nombreArchivo` (sin extensión). */
export async function exportarWord(entrada: EntradaPdf, nombreArchivo: string, alProgreso?: (texto: string) => void, opciones: OpcionesWord = {}): Promise<string[]> {
  const { blob, avisos } = await construirWord(entrada, alProgreso, opciones);
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

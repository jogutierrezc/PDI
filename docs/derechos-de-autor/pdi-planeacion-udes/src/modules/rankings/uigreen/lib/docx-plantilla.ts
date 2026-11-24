/* =============================================================================
   UI GreenMetric · plantillas .docx por pregunta: generar con marcadores y llenar.

   Las plantillas oficiales de UI GreenMetric no tienen campos: son documentos de
   EJEMPLO de otra universidad. Aquí se generan una sola vez, desde el catálogo,
   plantillas propias con marcadores {{campo}} (sin la marca «SAMPLE» ni los
   ejemplos), y se llenan con una respuesta. Los dos usan el mismo constructor, así
   que la plantilla y el documento lleno tienen exactamente la misma estructura:

     encabezado  Template for Evidence(s) · UI GreenMetric Questionnaire · University / Country / Web Address
     [n] Categoría (CÓD)
     [q] Título de la pregunta (CÓD.n)
     Description:  texto en inglés
     Etiqueta: valor            (campos numéricos, enlaces, opción)
     tablas                     (encabezado y una fila por registro)
     Calculation: fórmula = resultado
     Figure N. pie              (imágenes y pies; los PDF van como anexo)
     Additional evidence link (…): https://…

   Marcadores: {{universidad}} {{pais}} {{web}} {{q}} {{nombre_en}} {{campo:<k>}}
   {{fila:<tabla>:<columna>}} {{calculo}} {{evidencias}} {{enlace}}.

   Regla: NUNCA se llena una plantilla con una respuesta cuya traducción no esté
   revisada (`traduccionesPendientes` debe venir vacío). Usa la librería `docx`
   (la misma de UDrive, `udrive/salida/aWord.ts`) cargada solo al exportar.
   ========================================================================== */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { codigoConPunto } from "./catalogo";
import { aNumero } from "./calculo";
import type { CampoEsquema, CategoriaCatalogo, FilaTabla, PreguntaCatalogo, RespuestaUgm, ValorCampo } from "./tipos";

type Docx = typeof import("docx");

export class ErrorExportacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorExportacion";
  }
}

export interface EncabezadoUniversidad {
  universidad: string;
  pais: string;
  web: string;
}

export interface FiguraDoc {
  figura: number | null;
  /** Pie en inglés. */
  pie: string;
  /** Imagen PNG o JPG ya optimizada. Sin ella, la figura sale como una línea de anexo. */
  bytes?: Uint8Array;
  tipo?: "png" | "jpg";
  ancho?: number;
  alto?: number;
  /** Para un anexo: nombre del archivo dentro del paquete. */
  anexo?: string;
}

export interface DatosLlenado {
  encabezado: EncabezadoUniversidad;
  categoria: CategoriaCatalogo;
  pregunta: PreguntaCatalogo;
  respuesta: Pick<RespuestaUgm, "tablas" | "tablas_en" | "textos_en" | "valores" | "opcion">;
  /** Los valores con los campos conectados a tablas ya resueltos (ugm_valores_efectivos). Por omisión, `respuesta.valores`. */
  valoresEfectivos?: Record<string, ValorCampo>;
  /** Texto de la razón calculada («26.500 ÷ 100.000 × 100 = 26,5 %»). */
  calculoTexto?: string;
  figuras: FiguraDoc[];
  /** Campos con traducción sin revisar (ugm_traducciones_pendientes). Debe venir vacío. */
  traduccionesPendientes: string[];
}

export interface ResultadoDocx {
  bytes: Uint8Array;
  avisos: string[];
}

const TEXTO_ENLACE = "Additional evidence link (i.e., for videos, more images, or other files that are not included in this file)";
const AZUL = "014898";

type Modo = { tipo: "plantilla" } | { tipo: "llenado"; datos: DatosLlenado };

const numeroEn = (n: number): string => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);

function valorCampo(c: CampoEsquema, v: Record<string, ValorCampo>, textosEn: Record<string, string>, opcion: number | null, p: PreguntaCatalogo): string {
  if (c.tipo === "numero") {
    const n = aNumero(v[c.k]);
    return n === null ? "" : `${numeroEn(n)}${c.unidad ? ` ${c.unidad}` : ""}`;
  }
  if (c.tipo === "url" || c.tipo === "fecha") return typeof v[c.k] === "string" ? (v[c.k] as string) : "";
  if (c.tipo === "opcion") {
    const o = p.opciones?.find((x) => x.valor === opcion);
    return o ? (o.en ?? o.es) : "";
  }
  if (c.tipo === "ods") return Array.isArray(v[c.k]) ? `SDG ${(v[c.k] as number[]).join(", ")}` : "";
  return textosEn[c.k] ?? "";
}

/** Construye el documento. En modo plantilla pone marcadores; en modo llenado, los datos de la respuesta. */
async function construir(modo: Modo, pregunta: PreguntaCatalogo, categoria: CategoriaCatalogo, encabezado: EncabezadoUniversidad | null): Promise<ResultadoDocx> {
  const D: Docx = await import("docx");
  const avisos: string[] = [];
  const llen = modo.tipo === "llenado" ? modo.datos : null;
  const v: Record<string, ValorCampo> = llen ? (llen.valoresEfectivos ?? llen.respuesta.valores) : {};
  const textosEn = llen?.respuesta.textos_en ?? {};
  const T = (marcador: string, valor: string): string => (llen ? valor : `{{${marcador}}}`);

  const p = (texto: string, o: { negrita?: boolean; cursiva?: boolean; tam?: number; color?: string; despues?: number; antes?: number } = {}) =>
    new D.Paragraph({
      spacing: { before: o.antes ?? 0, after: o.despues ?? 120 },
      children: [new D.TextRun({ text: texto, bold: o.negrita, italics: o.cursiva, size: o.tam, color: o.color })],
    });
  const etiquetado = (etiqueta: string, valor: string) =>
    new D.Paragraph({ spacing: { after: 100 }, children: [new D.TextRun({ text: `${etiqueta}: `, bold: true }), new D.TextRun({ text: valor })] });

  const cuerpo: (InstanceType<Docx["Paragraph"]> | InstanceType<Docx["Table"]>)[] = [];
  const codigo = codigoConPunto(pregunta.indicador);
  cuerpo.push(p(`[${categoria.numero}] ${categoria.nombre_en} (${categoria.categoria})`, { negrita: true, tam: 24, color: AZUL, despues: 160 }));
  cuerpo.push(p(`[${pregunta.q}] ${T("nombre_en", pregunta.nombre_en)}${codigo ? ` (${codigo})` : ""}`, { negrita: true, tam: 28, despues: 200 }));

  // Description (primero la descripción, luego los demás campos).
  const descripcion = pregunta.esquema.campos.find((c) => c.k === "descripcion");
  if (descripcion) {
    cuerpo.push(p("Description:", { negrita: true, despues: 60 }));
    cuerpo.push(p(T("campo:descripcion", textosEn.descripcion ?? ""), { despues: 160 }));
  }
  for (const c of pregunta.esquema.campos) {
    if (c.k === "descripcion" || c.k === "enlace") continue;
    if (c.tipo === "opcion" && !llen) {
      cuerpo.push(etiquetado(c.en, T(`campo:${c.k}`, "")));
      continue;
    }
    const texto = llen ? valorCampo(c, v, textosEn, llen.respuesta.opcion, pregunta) : `{{campo:${c.k}}}`;
    if (llen && !texto) continue;
    if (c.tipo === "texto_largo" || c.tipo === "texto") {
      cuerpo.push(p(`${c.en}:`, { negrita: true, despues: 60 }));
      cuerpo.push(p(texto, { despues: 140 }));
    } else cuerpo.push(etiquetado(c.en, texto));
  }

  // Tablas.
  for (const t of pregunta.esquema.tablas) {
    const filasEs = llen?.respuesta.tablas[t.k] ?? [];
    const filasEn = llen?.respuesta.tablas_en[t.k] ?? [];
    if (llen && filasEs.length === 0) continue;
    const celda = (texto: string, enc = false, ancho = 100 / t.columnas.length) =>
      new D.TableCell({
        width: { size: ancho, type: D.WidthType.PERCENTAGE },
        shading: enc ? { type: D.ShadingType.CLEAR, fill: "E8EEF7", color: "auto" } : undefined,
        children: [new D.Paragraph({ children: [new D.TextRun({ text: texto, bold: enc, size: 20 })] })],
      });
    const encabezadoFila = new D.TableRow({ tableHeader: true, children: t.columnas.map((c) => celda(`${c.en}${c.unidad ? ` (${c.unidad})` : ""}`, true)) });
    let filas: InstanceType<Docx["TableRow"]>[];
    if (!llen) {
      filas = [new D.TableRow({ children: t.columnas.map((c) => celda(`{{fila:${t.k}:${c.k}}}`)) })];
    } else {
      filas = filasEs.map((fe, i) => {
        const fi: FilaTabla | undefined = filasEn[i];
        return new D.TableRow({
          children: t.columnas.map((c) => {
            const crudo = c.tipo === "texto" ? (fi?.[c.k] ?? fe[c.k]) : fe[c.k];
            const n = c.tipo === "numero" ? aNumero(crudo) : null;
            return celda(c.tipo === "numero" ? (n === null ? "" : numeroEn(n)) : String(crudo ?? ""));
          }),
        });
      });
      if (t.columnas.some((c) => c.tipo === "texto") && filasEn.length < filasEs.length) avisos.push(`La tabla «${t.en}» tiene filas sin traducción al inglés: salen en español.`);
    }
    cuerpo.push(p(t.en, { negrita: true, antes: 120, despues: 60 }));
    cuerpo.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [encabezadoFila, ...filas] }));
    cuerpo.push(p("", { despues: 120 }));
  }

  // Cálculo.
  if (pregunta.esquema.calculo) {
    if (!llen) cuerpo.push(etiquetado("Calculation", "{{calculo}}"));
    else if (llen.calculoTexto) cuerpo.push(etiquetado("Calculation", llen.calculoTexto));
  }

  // Figuras.
  if (!llen) {
    cuerpo.push(p("{{evidencias}}", { despues: 160 }));
  } else {
    let n = 0;
    for (const f of llen.figuras) {
      n += 1;
      const numero = f.figura ?? n;
      if (f.bytes && f.tipo && f.ancho && f.alto) {
        const max = 520;
        const k = Math.min(1, max / f.ancho);
        cuerpo.push(
          new D.Paragraph({
            alignment: D.AlignmentType.CENTER,
            spacing: { before: 120, after: 60 },
            children: [new D.ImageRun({ type: f.tipo, data: f.bytes, transformation: { width: Math.round(f.ancho * k), height: Math.round(f.alto * k) }, altText: { title: `Figure ${numero}`, description: f.pie || `Figure ${numero}`, name: `figura-${numero}` } })],
          }),
        );
        cuerpo.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 160 }, children: [new D.TextRun({ text: `Figure ${numero}. ${f.pie}`.trim(), italics: true, size: 20 })] }));
      } else {
        cuerpo.push(p(`Figure ${numero}. ${f.pie}${f.anexo ? ` (see attached file: ${f.anexo})` : ""}`.trim(), { cursiva: true, despues: 120 }));
      }
    }
  }

  // Enlace adicional.
  const enlace = typeof v.enlace === "string" ? v.enlace : "";
  cuerpo.push(p(TEXTO_ENLACE + ":", { negrita: true, antes: 160, despues: 60 }));
  cuerpo.push(p(llen ? enlace : "{{enlace}}", { despues: 0 }));

  const enc = encabezado ?? { universidad: "", pais: "", web: "" };
  const E = (marcador: string, valor: string) => (llen ? valor : `{{${marcador}}}`);
  const cabecera = new D.Header({
    children: [
      p("Template for Evidence(s)", { negrita: true, despues: 0 }),
      p("UI GreenMetric Questionnaire", { despues: 60 }),
      p(`University: ${E("universidad", enc.universidad)}`, { despues: 0, tam: 20 }),
      p(`Country: ${E("pais", enc.pais)}`, { despues: 0, tam: 20 }),
      p(`Web Address: ${E("web", enc.web)}`, { despues: 0, tam: 20 }),
    ],
  });
  const doc = new D.Document({
    creator: "Planeación UDES",
    title: `UI GreenMetric ${pregunta.q}`,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1440, bottom: 1200, left: 1300, right: 1300 } } }, headers: { default: cabecera }, children: cuerpo }],
  });
  const buf = await D.Packer.toArrayBuffer(doc);
  return { bytes: new Uint8Array(buf), avisos };
}

/** La plantilla propia de una pregunta, con marcadores {{campo}}. */
export async function generarPlantilla(pregunta: PreguntaCatalogo, categoria: CategoriaCatalogo): Promise<Uint8Array> {
  if (!pregunta.plantilla) throw new ErrorExportacion(`La pregunta ${pregunta.q} no tiene plantilla: va en la hoja de datos para el sistema en línea.`);
  return (await construir({ tipo: "plantilla" }, pregunta, categoria, null)).bytes;
}

/** Los marcadores que lleva la plantilla de una pregunta (para documentarlos o comprobar una plantilla guardada). */
export function marcadoresDe(pregunta: PreguntaCatalogo): string[] {
  const m = ["universidad", "pais", "web", "nombre_en"];
  for (const c of pregunta.esquema.campos) if (c.k !== "enlace") m.push(`campo:${c.k}`);
  for (const t of pregunta.esquema.tablas) for (const c of t.columnas) m.push(`fila:${t.k}:${c.k}`);
  if (pregunta.esquema.calculo) m.push("calculo");
  m.push("evidencias", "enlace");
  return m;
}

/** Llena la plantilla de una pregunta con su respuesta. Lanza ErrorExportacion si la traducción no está revisada. */
export async function llenarPlantilla(datos: DatosLlenado): Promise<ResultadoDocx> {
  if (!datos.pregunta.plantilla) throw new ErrorExportacion(`La pregunta ${datos.pregunta.q} no tiene plantilla.`);
  if (datos.traduccionesPendientes.length) {
    throw new ErrorExportacion(`No se exporta ${datos.pregunta.q}: la traducción al inglés no está revisada (${datos.traduccionesPendientes.join(", ")}).`);
  }
  return construir({ tipo: "llenado", datos }, datos.pregunta, datos.categoria, datos.encabezado);
}

/* --- Rellenar una plantilla guardada (editada a mano) con marcadores --------------------------------------- */

const escXml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface ValoresMarcadores {
  textos: Record<string, string>;
  /** Filas por tabla: [{columna: valor}]. */
  filas: Record<string, Record<string, string>[]>;
}

/**
 * Sustituye los marcadores de una plantilla .docx ya guardada (sin volver a construirla): útil si Planeación ajustó el
 * formato a mano. Cada marcador debe estar en un solo `<w:t>` (así los deja generarPlantilla). Una fila de tabla con
 * marcadores {{fila:tabla:col}} se repite por cada registro. Los valores se escapan.
 */
export function rellenarMarcadores(plantilla: Uint8Array, valores: ValoresMarcadores): Uint8Array {
  const partes = unzipSync(plantilla, { filter: (f) => f.originalSize < 20_000_000 });
  const salida: Record<string, Uint8Array> = {};
  for (const [nombre, datos] of Object.entries(partes)) {
    if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(nombre)) {
      let xml = strFromU8(datos);
      xml = xml.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (fila) => {
        const m = fila.match(/\{\{fila:([a-z0-9_]+):/);
        if (!m) return fila;
        const registros = valores.filas[m[1]] ?? [];
        return registros.map((r) => fila.replace(/\{\{fila:([a-z0-9_]+):([a-z0-9_]+)\}\}/g, (_, t, c) => escXml(r[c] ?? ""))).join("");
      });
      xml = xml.replace(/\{\{([a-z0-9_:]+)\}\}/g, (todo, k) => (k in valores.textos ? escXml(valores.textos[k]) : todo));
      salida[nombre] = strToU8(xml);
    } else salida[nombre] = datos;
  }
  return zipSync(salida);
}

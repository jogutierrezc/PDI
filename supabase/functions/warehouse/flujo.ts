/* =============================================================================
   Warehouse UDES · lectura de un .xlsx por tramos (solo la función, Deno).

   La función tiene 150 MB de memoria y 60 s por llamada. Un reporte grande
   (decenas de miles de filas, 2–3 MB de Excel) descomprimido de una vez son
   40–80 MB de XML, y leído como texto, matriz y filas llegaba a varias veces
   eso. Aquí el libro se recorre en streaming:

     · el zip se descomprime con fflate `Unzip` en tramos de 16 KB de entrada;
       solo se abre la entrada que se necesita (cadenas compartidas, o la hoja),
       las demás ni se descomprimen;
     · el XML de la hoja se corta en `<row>` según llega (FilasXml), sin DOM;
     · cada fila pasa por ConstructorTabla y sale como objeto; en memoria solo
       hay el tramo en curso y las filas que quien lee ha pedido;
     · el .xlsx comprimido (2–3 MB) se conserva para poder recorrerlo otra vez:
       la huella necesita una pasada completa ANTES de abrir la carga y el
       guardado, otra después.

   La lógica de filas y celdas está en motor.ts (pura, la comparte la pantalla).
   ========================================================================== */

import { Unzip, UnzipInflate, UnzipPassThrough, unzipSync } from "https://esm.sh/fflate@0.8.2";
import { CadenasIncremental, ConstructorTabla, FilasXml, leerSegun, nombresDeArchivosDeHoja, nombresDeHojas, periodoDeTitulos, periodoDelArchivo, type Celda, type Fila, type Hoja, type Lector } from "./motor.ts";

/** Bytes comprimidos que se le dan al descompresor cada vez: un tramo suele valer unos cientos de KB de XML. */
const TRAMO_ENTRADA = 16 * 1024;

/** Una entrada del zip leída como texto, tramo a tramo. */
class FlujoEntrada {
  private pos = 0;
  private terminada = false;
  private readonly salida: string[] = [];
  private readonly unzip: Unzip;

  constructor(
    private readonly bytes: Uint8Array,
    nombre: string,
  ) {
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);
    const decodificador = new TextDecoder("utf-8");
    unzip.onfile = (f) => {
      if (f.name !== nombre) return; // lo demás ni se descomprime
      f.ondata = (error, trozo, final) => {
        if (error) throw error;
        this.salida.push(decodificador.decode(trozo, { stream: !final }));
        if (final) this.terminada = true;
      };
      f.start();
    };
    this.unzip = unzip;
  }

  /** El siguiente tramo de texto, o null cuando la entrada se acabó. */
  siguiente(): string | null {
    while (this.salida.length === 0 && !this.terminada && this.pos < this.bytes.length) {
      const hasta = Math.min(this.pos + TRAMO_ENTRADA, this.bytes.length);
      this.unzip.push(this.bytes.subarray(this.pos, hasta), hasta >= this.bytes.length);
      this.pos = hasta;
    }
    if (this.salida.length === 0) return null;
    const texto = this.salida.length === 1 ? this.salida[0] : this.salida.join("");
    this.salida.length = 0;
    return texto;
  }
}

/** Un .xlsx en memoria (comprimido) del que se leen hojas y cadenas por tramos. */
export class Libro {
  /** Los archivos de hoja, en orden numérico. */
  readonly hojas: string[];
  /** Los nombres de las hojas como las ve la persona. */
  readonly nombresHojas: string[];
  private readonly nombresEntradas: string[] = [];
  private compartidasLeidas: string[] | null = null;

  constructor(readonly bytes: Uint8Array) {
    let pequenas: Record<string, Uint8Array>;
    try {
      pequenas = unzipSync(bytes, {
        filter: (f) => {
          this.nombresEntradas.push(f.name);
          return f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels";
        },
      });
    } catch {
      throw new Error("La plataforma devolvió un archivo que no es un Excel.");
    }
    this.hojas = nombresDeArchivosDeHoja(this.nombresEntradas);
    this.nombresHojas = nombresDeHojas(pequenas);
  }

  /** Las cadenas compartidas, leídas una sola vez (por tramos) y compartidas entre todas las lecturas del libro. */
  compartidas(): string[] {
    if (this.compartidasLeidas) return this.compartidasLeidas;
    const cadenas = new CadenasIncremental();
    if (this.nombresEntradas.includes("xl/sharedStrings.xml")) {
      const entrada = new FlujoEntrada(this.bytes, "xl/sharedStrings.xml");
      for (let t = entrada.siguiente(); t !== null; t = entrada.siguiente()) cadenas.push(t);
    }
    this.compartidasLeidas = cadenas.cadenas;
    return this.compartidasLeidas;
  }

  /** Todas las entradas del libro menos las hojas pesadas no se leen: para los lectores de varias hojas, que son pequeños. */
  archivos(): Record<string, Uint8Array> {
    return unzipSync(this.bytes, { filter: (f) => /^xl\//.test(f.name) });
  }

  /** Libera lo leído (cadenas compartidas) cuando ya no se va a recorrer más. */
  soltar(): void {
    this.compartidasLeidas = null;
  }
}

export interface TablaOpciones {
  hoja?: number;
  encabezado?: string;
  minCeldas?: number;
}

/** Una pasada por una hoja: el encabezado primero y luego las filas, las que se pidan cada vez. */
export class TablaFlujo {
  private readonly entrada: FlujoEntrada;
  private readonly construtor: ConstructorTabla;
  private readonly lector: FilasXml;
  private readonly cola: Fila[] = [];
  private terminada = false;

  constructor(libro: Libro, opciones: TablaOpciones = {}) {
    const nombre = libro.hojas[opciones.hoja ?? 0];
    if (!nombre) throw new Error("El archivo no es un Excel válido: no tiene hojas.");
    this.entrada = new FlujoEntrada(libro.bytes, nombre);
    this.construtor = new ConstructorTabla(opciones);
    this.lector = new FilasXml(libro.compartidas(), (celdas) => {
      const fila = this.construtor.recibir(celdas);
      if (fila) this.cola.push(fila);
    });
  }

  get columnas(): string[] {
    return this.construtor.columnas;
  }
  get originales(): string[] {
    return this.construtor.originales;
  }
  get encabezadoHallado(): boolean {
    return this.construtor.encabezadoHallado;
  }
  /** Las seis primeras filas de la hoja (los títulos); completas cuando ya se leyó al menos hasta ahí. */
  get titulos(): Celda[][] {
    return this.construtor.titulos;
  }

  private avanzar(): void {
    const trozo = this.entrada.siguiente();
    if (trozo === null) this.terminada = true;
    else this.lector.push(trozo);
  }

  /** Lee hasta hallar el encabezado. false si la hoja se acabó sin él. */
  abrirEncabezado(): boolean {
    while (!this.construtor.encabezadoHallado && !this.terminada) this.avanzar();
    return this.construtor.encabezadoHallado;
  }

  /** Hasta `max` filas de datos; una lista vacía cuando la hoja se acabó. */
  siguiente(max: number): Fila[] {
    while (this.cola.length < max && !this.terminada) this.avanzar();
    return this.cola.length <= max ? this.cola.splice(0) : this.cola.splice(0, max);
  }
}

/** Lo que el servidor necesita de un reporte, venga de un Excel, de una lista JSON o de varias partes juntas. */
export interface Lectura {
  /** Hasta `max` filas; vacío cuando se acabaron. */
  siguiente(max: number): Fila[];
}

export interface Fuente {
  columnas: string[];
  originales: string[];
  /** Una lectura nueva desde la primera fila (el Excel se vuelve a recorrer; no se guardó nada). */
  abrir(): Lectura;
  /** El periodo que dicen el nombre de las hojas y los títulos; vale después de haber recorrido una lectura. */
  periodoTitulos(): string | null;
}

/** Una tabla que ya está entera en memoria (catálogos JSON, edificios juntados): son listas cortas. */
export function fuenteDeHoja(hoja: Hoja): Fuente {
  return {
    columnas: hoja.columnas,
    originales: hoja.originales,
    abrir: () => {
      let pos = 0;
      return {
        siguiente: (max) => {
          const lote = hoja.filas.slice(pos, pos + max);
          pos += lote.length;
          return lote;
        },
      };
    },
    periodoTitulos: () => null,
  };
}

const OPCIONES_POR_LECTOR = (lector: Lector): TablaOpciones | null => {
  if (lector === "uso-aulas" || lector === "aspirantes" || lector === "json") return null;
  if (lector === "tabla" || lector === "desercion") return { minCeldas: 3 };
  if (lector.startsWith("encabezado:")) return { encabezado: lector.slice("encabezado:".length) };
  return {};
};

/**
 * Un Excel como fuente de filas. Los lectores de una sola tabla (`hoja`, `tabla`, `encabezado:…`, `desercion`) van en
 * streaming; los de varias hojas pequeñas (`uso-aulas`, `aspirantes`) se leen enteros porque no pasan de unos cientos de
 * filas. Lanza el mismo error que el lector anterior si el archivo no tiene la forma esperada.
 */
export function fuenteDeExcel(bytes: Uint8Array, lector: Lector): Fuente {
  const libro = new Libro(bytes);
  let opciones = OPCIONES_POR_LECTOR(lector);

  if (!opciones) {
    const archivos = libro.archivos();
    const hoja = leerSegun(lector, archivos);
    const periodo = periodoDelArchivo(archivos);
    return { ...fuenteDeHoja(hoja), periodoTitulos: () => periodo };
  }

  let tabla = new TablaFlujo(libro, opciones);
  if (!tabla.abrirEncabezado()) {
    if (opciones.encabezado) throw new Error(`No se encontró el encabezado «${opciones.encabezado}» en el archivo: el reporte cambió de forma.`);
    if ((opciones.minCeldas ?? 1) > 1) {
      // Ninguna fila alcanza las celdas pedidas: como antes, el encabezado es la primera fila con contenido.
      opciones = { ...opciones, minCeldas: 1 };
      tabla = new TablaFlujo(libro, opciones);
      tabla.abrirEncabezado();
    }
  }
  const columnas = tabla.columnas;
  const originales = tabla.originales;
  if (lector === "desercion" && (columnas[0] !== "estudiante" || !columnas.some((c) => /^20\d{2}[ab]$/.test(c)))) {
    throw new Error("El histórico de deserciones cambió de forma: se esperaba «Estudiante» y una columna por periodo.");
  }

  let ultima = tabla;
  const efectivas = opciones;
  return {
    columnas,
    originales,
    abrir: () => {
      ultima = new TablaFlujo(libro, efectivas);
      ultima.abrirEncabezado();
      return ultima;
    },
    periodoTitulos: () => periodoDeTitulos(libro.nombresHojas, ultima.titulos),
  };
}

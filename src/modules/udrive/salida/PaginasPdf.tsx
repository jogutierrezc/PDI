/* =============================================================================
   UDrive · las páginas del PDF (Carta 816 × 1056 px o A4 794 × 1123 px).

   Paginado de dos pasadas:
     1. Se dibuja cada unidad (párrafo, figura, fila de tabla, línea de índice)
        fuera de pantalla, al ancho exacto del cuerpo (o de la columna), se
        mide cuando ya están las fuentes y las imágenes, y se reparte en
        páginas (lib/paginado.ts). Eso dice en qué página cae cada título y
        cada figura.
     2. Se imprimen las páginas con los índices ya con esos números.
   Como los índices ocupan lo mismo con el número real que con el provisional,
   la segunda pasada no mueve nada.

   Con los estilos (0190) las medidas ya no son constantes: salen del tema del
   estilo y del papel (lib/estilo.ts): tamaño y alto de línea del texto,
   márgenes, cabecera, una o dos columnas y secciones horizontales. Cada
   sección (la orientación cambia con un «Salto de página» horizontal) se mide y
   se reparte con sus propias medidas. Sin estilo, el Clásico reproduce las
   medidas de siempre y la salida no cambia.

   Es el mismo dibujo que la hoja del editor (salida/Piezas.tsx), a tamaño de
   papel. Imprimir es del navegador (salida/imprimir.ts): texto y gráficas SVG
   salen como vectores y los mapas de calor llevan print-color-adjust: exact.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { EDIFICIOS, LOGO_BLANCO } from "../../informes/vista/Hoja";
import type { Documento, Fuente } from "../lib/documento";
import { CIERRE_VACIO } from "../lib/documento";
import { atributosEstilo, temaDe, variablesCss } from "../lib/estilo";
import type { Estilo, Papel, Tema } from "../lib/estilo";
import { TITULO_INDICE, indicesActivos, numerarCapitulos } from "../lib/numeracion";
import type { Figura } from "../lib/numeracion";
import { paginar, paginarColumnas } from "../lib/paginado";
import type { Banda, ItemColumna, Trozo } from "../lib/paginado";
import { abreHoja, esTitulo, planear } from "../lib/plan";
import type { ItemPlan } from "../lib/plan";
import { aPlano } from "../lib/texto";
import type { ContextoTexto } from "../lib/texto";
import type { CifraResuelta } from "../lib/cifras";
import { cargarFuentesDelEstilo } from "./fuentes";
import { CapituloVista, DestacadoVista, EntradaDeIndice, FiguraGrafica, FiguraImagen, FiguraMapa, FiguraTabla, FuenteVista, ListaVista, NotaSuelta, PortadaPdf, ProveedorRender, TextoVista, TituloIndice, TituloReferencias } from "./Piezas";
import type { CtxRender } from "./Piezas";
import { ContraportadaEstilo, PortadaEstilo } from "./Portadas";
import type { DatosPortada } from "./Portadas";
import type { Recursos } from "./recursos";
import "./salida.css";

export interface EntradaPdf {
  doc: Documento;
  /** Título que corre arriba de cada página; sin él, el de la portada. */
  titulo: string;
  recursos: Recursos;
  figuras: ReadonlyMap<string, Figura>;
  bibliografia: readonly Fuente[];
  texto: ContextoTexto;
  cifra(clave: string): CifraResuelta | null;
  /** Cambia cuando cambia algún valor de cifra: obliga a medir otra vez. */
  firmaCifras: string;
  borrador: boolean;
  /** El estilo con que se imprime (el del informe, o el Clásico). */
  estilo: Estilo;
  /** Carta o A4. */
  papel: Papel;
  /** Enlaces firmados de las imágenes de la portada y del estilo. */
  fotoUrl: string | null;
  logoPropioUrl: string | null;
  marcaUrl: string | null;
}

export interface InfoPaginado {
  paginas: number;
  /** Página de cada título y figura (id de bloque → número). */
  paginaDe: ReadonlyMap<string, number>;
  /** Las fuentes y las imágenes estaban listas al medir: los números son los del PDF. */
  exacto: boolean;
  /** Bloques de tabla cuya anchura natural pasa del ancho de la hoja. */
  tablasAnchas: string[];
  /** Hojas horizontales, si hay secciones horizontales. */
  horizontales: number;
}

type Orientacion = "vertical" | "horizontal";
interface SeccionPlan {
  orient: Orientacion;
  items: ItemPlan[];
}

/** Parte el plan en secciones donde un «Salto de página» cambia la orientación. */
function dividirSecciones(plan: readonly ItemPlan[]): SeccionPlan[] {
  const salida: SeccionPlan[] = [];
  let orient: Orientacion = "vertical";
  let actual: SeccionPlan = { orient, items: [] };
  for (const it of plan) {
    if (it.tipo === "bloque" && it.bloque.tipo === "salto" && it.bloque.orientacion && it.bloque.orientacion !== orient) {
      if (actual.items.length) salida.push(actual);
      orient = it.bloque.orientacion;
      actual = { orient, items: [] };
    }
    actual.items.push(it);
  }
  if (actual.items.length || !salida.length) salida.push(actual);
  return salida;
}

/** Variables de una hoja: su tamaño y su zona de cuerpo. */
const varsHoja = (t: Tema): CSSProperties =>
  ({
    "--ud-pw": `${t.ancho}px`,
    "--ud-ph": `${t.alto}px`,
    "--ud-mx": `${t.mx}px`,
    "--ud-top": `${t.arriba}px`,
    "--ud-bw": `${t.anchoCuerpo}px`,
    "--ud-bh": `${t.altoCuerpo}px`,
    "--ud-col-w": `${t.anchoCol}px`,
  }) as CSSProperties;

/* ---------- una unidad ------------------------------------------------------------------------------------- */

function Unidad({ item, t, paginas, sangria }: { item: ItemPlan; t?: Trozo; paginas: ReadonlyMap<string, number>; sangria?: boolean }) {
  if (item.tipo === "titulo-indice") return <TituloIndice indice={item.indice} />;
  if (item.tipo === "entrada-indice") return <EntradaDeIndice e={item.entrada} pagina={paginas.get(item.entrada.bloqueId)} />;
  if (item.tipo === "fuente") return <FuenteVista f={item.fuente} />;
  const b = item.bloque;
  switch (b.tipo) {
    case "capitulo":
      return <CapituloVista b={b} />;
    case "parrafo":
      return b.texto.trim() ? <p className="ud-pdf-p" data-sangria={sangria ? "true" : undefined}><TextoVista texto={b.texto} /></p> : null;
    case "lista":
      return <ListaVista b={b} desde={t?.desde} hasta={t?.hasta} />;
    case "tabla":
      return <FiguraTabla b={b} desde={t?.desde} hasta={t?.hasta} primero={t?.primero ?? true} ultimo={t?.ultimo ?? true} />;
    case "grafica":
      return <FiguraGrafica b={b} />;
    case "imagen":
      return <FiguraImagen b={b} />;
    case "mapa":
      return <FiguraMapa b={b} />;
    case "destacado":
      return b.texto.trim() ? <DestacadoVista b={b} /> : null;
    case "nota":
      return b.texto.trim() ? <NotaSuelta b={b} /> : null;
    case "referencias":
      return <TituloReferencias titulo={b.titulo} id={b.id} />;
    default:
      return null;
  }
}

/** Un trozo ya repartido: un párrafo partido se muestra recortado por líneas; lo demás sabe pintar su tramo. */
function TrozoPdf({ item, t, paginas, sangria, tema }: { item: ItemPlan; t: Trozo; paginas: ReadonlyMap<string, number>; sangria: boolean; tema: Tema }) {
  const parrafoPartido = item.tipo === "bloque" && item.bloque.tipo === "parrafo" && !(t.primero && t.ultimo);
  if (parrafoPartido) {
    const estilo: CSSProperties = { height: (t.hasta - t.desde) * tema.linea + (t.ultimo ? tema.margenP : 0), overflow: "hidden" };
    return (
      <div style={estilo}>
        <div style={{ marginTop: -t.desde * tema.linea }}>
          <Unidad item={item} paginas={paginas} sangria={sangria} />
        </div>
      </div>
    );
  }
  return <Unidad item={item} t={t} paginas={paginas} sangria={sangria} />;
}

/* ---------- la medición -------------------------------------------------------------------------------------- */

/** Texto corrido que va en columna cuando el estilo pide dos. */
function esColumna(it: ItemPlan, t: Tema): boolean {
  if (t.cols !== 2 || it.tipo !== "bloque") return false;
  const b = it.bloque;
  return b.tipo === "parrafo" || b.tipo === "lista" || b.tipo === "destacado" || b.tipo === "nota" || (b.tipo === "capitulo" && b.nivel > 1);
}

function medirUnidades(raiz: HTMLElement, plan: readonly ItemPlan[], t: Tema, anchas: string[]): ItemColumna[] {
  // Si la vista previa está escalada con transform, las medidas del navegador salen escaladas: se deshace.
  const k = raiz.offsetWidth ? raiz.getBoundingClientRect().width / raiz.offsetWidth : 1;
  const h = (e: Element | null | undefined): number => (e ? e.getBoundingClientRect().height / (k || 1) : 0);
  return plan.map((it, n) => {
    const el = raiz.children[n] as HTMLElement | undefined;
    const alto = h(el);
    const base: ItemColumna = { clave: it.clave, alto, nuevaPagina: abreHoja(it) || undefined, pegar: esTitulo(it) || undefined, col: esColumna(it, t) || undefined };
    if (!el || it.tipo === "titulo-indice" || it.tipo === "entrada-indice" || it.tipo === "fuente") return base;
    const b = it.bloque;
    if (b.tipo === "parrafo") {
      const lineas = Math.max(1, Math.round((alto - t.margenP) / t.linea));
      return lineas >= 4 ? { ...base, partes: Array.from({ length: lineas }, () => t.linea), pie: t.margenP, minPrimero: 2, minUltimo: 2 } : base;
    }
    if (b.tipo === "lista") {
      const lis = Array.from(el.querySelectorAll<HTMLElement>("li")).map((li) => h(li));
      if (lis.length < 4) return base;
      const suma = lis.reduce((tt, x) => tt + x, 0);
      return { ...base, partes: lis, cabeza: 0, cabezaSiguientes: 0, pie: Math.max(0, alto - suma), minPrimero: 2, minUltimo: 2 };
    }
    if (b.tipo === "tabla") {
      // ¿Cabe la tabla en el ancho de la hoja? Se mide su ancho natural sin dejarla encoger.
      const tb = el.querySelector<HTMLElement>("table");
      if (tb) {
        const antes = { w: tb.style.width, m: tb.style.maxWidth };
        tb.style.width = "max-content";
        tb.style.maxWidth = "none";
        const natural = tb.getBoundingClientRect().width / (k || 1);
        tb.style.width = antes.w;
        tb.style.maxWidth = antes.m;
        if (natural > t.anchoCuerpo + 2) anchas.push(b.id);
      }
      const filas = Array.from(el.querySelectorAll<HTMLElement>("tbody tr")).map((tr) => h(tr));
      if (filas.length < 5) return base;
      const cap = h(el.querySelector<HTMLElement>(".ud-pdf-fcap"));
      const enc = h(el.querySelector<HTMLElement>("thead"));
      const suma = filas.reduce((tt, x) => tt + x, 0);
      return { ...base, partes: filas, cabeza: cap + enc, cabezaSiguientes: b.repetirEncabezado ? enc : 0, pie: Math.max(0, alto - cap - enc - suma), minPrimero: 2, minUltimo: 2, pegar: undefined };
    }
    return base;
  });
}

const esperar = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

async function esperarListo(raices: readonly HTMLElement[]): Promise<boolean> {
  let exacto = true;
  try {
    if ("fonts" in document) await Promise.race([document.fonts.ready.then(() => undefined), esperar(4000)]);
  } catch {
    exacto = false;
  }
  const imgs = raices.flatMap((r) => Array.from(r.querySelectorAll("img")));
  const cargadas = await Promise.race([
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve(true) : new Promise<boolean>((r) => { i.onload = () => r(true); i.onerror = () => r(false); })))).then((x) => x.every(Boolean)),
    esperar(6000).then(() => false),
  ]);
  if (!cargadas) exacto = false;
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  return exacto;
}

/* ---------- el resultado de medir -------------------------------------------------------------------------- */

interface PaginaFinal {
  orient: Orientacion;
  tema: Tema;
  bandas: Banda[];
  /** El capítulo de primer nivel en que va la página (para la cabecera). */
  capitulo: string;
  numero: number;
}

interface Resultado {
  paginas: PaginaFinal[];
  paginaDe: Map<string, number>;
  anchas: string[];
}

const sumaAlto = (t: readonly Trozo[]): number => t.reduce((a, x) => a + x.alto, 0);

/* ---------- el componente ------------------------------------------------------------------------------------------ */

export function PaginasPdf({ entrada, onPaginado, modoPantalla = true }: { entrada: EntradaPdf; onPaginado?: (i: InfoPaginado) => void; modoPantalla?: boolean }) {
  const { doc, titulo, recursos, figuras, texto, cifra, firmaCifras, borrador, estilo, papel } = entrada;
  const indices = useMemo(() => indicesActivos(doc, figuras, texto), [doc, figuras, texto]);
  const plan = useMemo(() => planear(doc, indices), [doc, indices]);
  const secciones = useMemo(() => dividirSecciones(plan), [plan]);
  const firmaEstilo = JSON.stringify(estilo) + papel;
  const temas = useMemo(() => ({ vertical: temaDe(estilo, papel, false), horizontal: temaDe(estilo, papel, true) }), [firmaEstilo]); // eslint-disable-line react-hooks/exhaustive-deps -- la firma resume el estilo
  const numeros = useMemo(() => (estilo.texto.num ? numerarCapitulos(doc.bloques) : new Map<string, string>()), [doc.bloques, estilo.texto.num]);
  // Sangría de primera línea en todo párrafo que no abre un apartado (el que sigue a un título no la lleva).
  const conSangria = useMemo(() => {
    const salida = new Set<string>();
    if (!estilo.texto.sang) return salida;
    plan.forEach((it, n) => {
      const previo = plan[n - 1];
      if (n > 0 && previo && !(previo.tipo === "titulo-indice" || previo.tipo === "entrada-indice" || (previo.tipo === "bloque" && (previo.bloque.tipo === "capitulo" || previo.bloque.tipo === "referencias" || previo.bloque.tipo === "salto")))) salida.add(it.clave);
    });
    return salida;
  }, [plan, estilo.texto.sang]);
  const medidas = useRef<(HTMLDivElement | null)[]>([]);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const alPaginar = useRef(onPaginado);
  alPaginar.current = onPaginado;
  const conCierre = Boolean(doc.cierre?.conCierre);
  const conContra = Boolean(doc.cierre?.conContraportada);

  const base = { bibliografia: entrada.bibliografia, texto, cifra, figuras, recursos, estilo, numeros };
  const ctxMedida = useMemo<CtxRender>(() => ({ ...base, modo: "medida", paginas: new Map() }), [doc, texto, figuras, recursos, firmaCifras, firmaEstilo, numeros]); // eslint-disable-line react-hooks/exhaustive-deps -- cifra cambia de identidad; firmaCifras la resume

  // Primera pasada: medir y repartir. Se repite si cambia el documento, los datos, las cifras o el estilo.
  useEffect(() => {
    if (!recursos.listo) return;
    let vigente = true;
    void (async () => {
      await cargarFuentesDelEstilo(estilo);
      if (!vigente) return;
      const raices = medidas.current.slice(0, secciones.length).filter((r): r is HTMLDivElement => Boolean(r));
      if (raices.length !== secciones.length) return;
      const exacto = await esperarListo(raices);
      if (!vigente) return;
      const anchas: string[] = [];
      const paginaDe = new Map<string, number>();
      const paginas: PaginaFinal[] = [];
      let siguiente = 2;
      secciones.forEach((sec, n) => {
        const tema = temas[sec.orient];
        const unidades = medirUnidades(raices[n], sec.items, tema, anchas);
        let bandas: Banda[][];
        if (tema.cols === 2) {
          const r = paginarColumnas(unidades, tema.altoCuerpo, siguiente);
          bandas = r.paginas;
          r.paginaDe.forEach((v, k) => paginaDe.set(k, v));
        } else {
          const r = paginar(unidades, tema.altoCuerpo, siguiente);
          bandas = r.paginas.map((tr) => [{ columnas: [tr], alto: sumaAlto(tr) }]);
          r.paginaDe.forEach((v, k) => paginaDe.set(k, v));
        }
        bandas.forEach((bs) => {
          paginas.push({ orient: sec.orient, tema, bandas: bs, capitulo: "", numero: siguiente });
          siguiente++;
        });
      });
      // El capítulo de primer nivel de cada página, para la cabecera.
      const porClave = new Map(plan.map((it) => [it.clave, it]));
      let capActual = "";
      for (const pg of paginas) {
        for (const banda of pg.bandas) {
          for (const col of banda.columnas) {
            for (const tz of col) {
              const it = porClave.get(tz.clave);
              if (!it) continue;
              if (it.tipo === "titulo-indice") capActual = TITULO_INDICE[it.indice];
              else if (it.tipo === "bloque" && (it.bloque.tipo === "referencias" || (it.bloque.tipo === "capitulo" && it.bloque.nivel === 1))) capActual = aPlano(it.bloque.tipo === "referencias" ? it.bloque.titulo : it.bloque.titulo);
            }
          }
        }
        pg.capitulo = capActual;
      }
      setResultado({ paginas, paginaDe, anchas });
      const total = 1 + paginas.length + (conCierre ? 1 : 0) + (conContra ? 1 : 0);
      alPaginar.current?.({ paginas: total, paginaDe, exacto, tablasAnchas: anchas, horizontales: paginas.filter((p) => p.orient === "horizontal").length });
    })();
    return () => {
      vigente = false;
    };
  }, [plan, secciones, recursos, ctxMedida, temas, estilo, conCierre, conContra]);

  const ctxFinal = useMemo<CtxRender>(() => ({ ...base, modo: "pdf", paginas: resultado?.paginaDe ?? new Map() }), [doc, texto, figuras, recursos, firmaCifras, firmaEstilo, numeros, resultado]); // eslint-disable-line react-hooks/exhaustive-deps
  const porClave = useMemo(() => new Map(plan.map((it) => [it.clave, it])), [plan]);
  const corre = titulo.trim() || doc.portada.titulo.trim();
  const temaV = temas.vertical;
  const imagenPortada = doc.portada.imagenId ? (recursos.imagenes.get(doc.portada.imagenId)?.url ?? null) : null;
  const datosPortada: DatosPortada = { portada: doc.portada, estilo, papel, fotoUrl: entrada.fotoUrl ?? imagenPortada, logoPropioUrl: entrada.logoPropioUrl };
  const raizDoc = { className: "ud-pdf-paginas ud-doc", style: variablesCss(estilo, temaV), ...atributosEstilo(estilo), "data-ud-cols": String(estilo.texto.cols) } as const;
  const ultimaPagina = (resultado?.paginas.length ?? 0) + 1;

  return (
    <>
      <ProveedorRender value={ctxMedida}>
        {secciones.map((sec, n) => {
          const tema = temas[sec.orient];
          return (
            <div
              key={n}
              ref={(el) => {
                medidas.current[n] = el;
              }}
              className="ud-pdf-medida ud-doc"
              style={{ ...variablesCss(estilo, tema), ...varsHoja(tema) }}
              {...atributosEstilo(estilo)}
              data-ud-cols={String(estilo.texto.cols)}
              aria-hidden="true"
              lang="es"
            >
              {sec.items.map((it) => (
                <div key={it.clave} className="ud-pdf-u" data-col={esColumna(it, tema) ? "true" : undefined}>
                  <Unidad item={it} paginas={ctxMedida.paginas} sangria={conSangria.has(it.clave)} />
                </div>
              ))}
            </div>
          );
        })}
      </ProveedorRender>
      <ProveedorRender value={ctxFinal}>
        <div {...raizDoc} data-pantalla={modoPantalla ? "true" : undefined} lang="es">
          <section className="ud-pdf-pag" data-portada="true" style={varsHoja(temaV)} aria-label="Página 1, portada">
            {estilo.portada.comp === 0 ? <PortadaPdf portada={doc.portada} imagenUrl={imagenPortada} /> : <PortadaEstilo d={datosPortada} />}
            {estilo.cabpie.marca.modo === "clasica" && borrador ? <Marca /> : null}
          </section>
          {(resultado?.paginas ?? []).map((pg, n) => (
            <section key={n} className="ud-pdf-pag" data-orient={pg.orient} style={varsHoja(pg.tema)} aria-label={`Página ${pg.numero}`}>
              <Cabecera estilo={estilo} titulo={corre} capitulo={pg.capitulo} />
              <div className="ud-pdf-cuerpo">
                {pg.bandas.map((banda, b) => (
                  <div key={b} className="ud-pdf-banda" data-cols={banda.columnas.length}>
                    {banda.columnas.map((trozos, c) => (
                      <div key={c} className="ud-pdf-col">
                        {trozos.map((t) => {
                          const it = porClave.get(t.clave);
                          return it ? <div key={`${t.clave}:${t.desde}`} className="ud-pdf-u"><TrozoPdf item={it} t={t} paginas={ctxFinal.paginas} sangria={conSangria.has(t.clave)} tema={pg.tema} /></div> : null;
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <Pie estilo={estilo} numero={pg.numero} autor={doc.portada.autor ?? ""} titulo={corre} />
              <Marcas estilo={estilo} borrador={borrador} marcaUrl={entrada.marcaUrl} />
            </section>
          ))}
          {conCierre && resultado ? (
            <section className="ud-pdf-pag" style={varsHoja(temaV)} aria-label={`Página ${ultimaPagina + 1}, cierre`}>
              <Cabecera estilo={estilo} titulo={corre} capitulo="Cierre" />
              <div className="ud-pdf-cuerpo">
                <CuerpoCierre doc={doc} />
              </div>
              <Pie estilo={estilo} numero={ultimaPagina + 1} autor={doc.portada.autor ?? ""} titulo={corre} />
              <Marcas estilo={estilo} borrador={borrador} marcaUrl={entrada.marcaUrl} />
            </section>
          ) : null}
          {conContra && resultado ? (
            <section className="ud-pdf-pag" data-contraportada="true" style={varsHoja(temaV)} aria-label="Contraportada">
              <ContraportadaEstilo d={datosPortada} cierre={doc.cierre ?? CIERRE_VACIO} />
            </section>
          ) : null}
        </div>
      </ProveedorRender>
    </>
  );
}

/* ---------- cabecera, pie y marcas ------------------------------------------------------------------------------- */

function Cabecera({ estilo, titulo, capitulo }: { estilo: Estilo; titulo: string; capitulo: string }) {
  const cab = estilo.cabpie.cab;
  const corto = aPlano(titulo).length > 60 ? `${aPlano(titulo).slice(0, 58)}…` : aPlano(titulo);
  if (cab === "clasica") return <div className="ud-pdf-corre"><span>{aPlano(titulo)}</span></div>;
  if (cab === "dos")
    return (
      <div className="ud-hd2">
        <div className="ud-hd2-bar">
          <img src={LOGO_BLANCO} alt="Universidad de Santander" />
          <span>{corto}</span>
        </div>
        <div className="ud-hd2-band">
          <strong>{capitulo || corto}</strong>
          {estilo.cabpie.edif ? <img src={EDIFICIOS} alt="" /> : null}
        </div>
      </div>
    );
  if (cab === "simple")
    return (
      <div className="ud-hds">
        <span>{corto}</span>
        <span>{capitulo}</span>
      </div>
    );
  return null;
}

function Pie({ estilo, numero, autor, titulo }: { estilo: Estilo; numero: number; autor: string; titulo: string }) {
  if (estilo.cabpie.cab === "clasica") return <div className="ud-pdf-pie"><span>{numero}</span></div>;
  const c = estilo.cabpie;
  const txt = c.pieTexto ? [autor, aPlano(titulo)].filter(Boolean).join(" · ") : "";
  const folio = <b>{numero < 10 ? `0${numero}` : numero}</b>;
  let l: ReactNode = null;
  let m: ReactNode = null;
  let r: ReactNode = null;
  if (c.folio === "centro") {
    l = txt;
    m = folio;
  } else if (c.folio === "derecha") {
    l = txt;
    r = folio;
  } else if (numero % 2 === 0) {
    l = folio;
    r = txt;
  } else {
    l = txt;
    r = folio;
  }
  return (
    <div className="ud-ft2" data-filete={c.filetePie ? "true" : undefined}>
      <span className="l">{l}</span>
      <span className="c">{m}</span>
      <span className="r">{r}</span>
    </div>
  );
}

function Marcas({ estilo, borrador, marcaUrl }: { estilo: Estilo; borrador: boolean; marcaUrl: string | null }) {
  const m = estilo.cabpie.marca;
  if (m.modo === "clasica") return borrador ? <Marca /> : null;
  const vars = { "--ud-marca-op": m.opacidad / 100, "--ud-marca-tam": m.tam === "g" ? "150px" : "96px" } as CSSProperties;
  if (m.modo === "texto" && m.texto) return <div className="ud-pdf-marca2" style={vars} aria-hidden="true"><span>{m.texto.toUpperCase()}</span></div>;
  if (m.modo === "imagen" && marcaUrl) return <div className="ud-pdf-marca2" style={vars} aria-hidden="true"><img src={marcaUrl} alt="" /></div>;
  if (m.modo === "ninguna" && estilo.cabpie.borradorAuto && borrador) return <div className="ud-pdf-marca2" style={vars} aria-hidden="true"><span>BORRADOR</span></div>;
  return null;
}

function Marca() {
  return (
    <div className="ud-pdf-marca" aria-hidden="true">
      <span>DOCUMENTO BORRADOR</span>
    </div>
  );
}

/* ---------- la página de cierre ------------------------------------------------------------------------------------- */

function CuerpoCierre({ doc }: { doc: Documento }) {
  const c = doc.cierre ?? CIERRE_VACIO;
  const contacto: [string, string][] = ([["Dirección", c.direccion], ["Correo", c.correo], ["Teléfono", c.telefono], ["Sitio web", c.web]] as [string, string][]).filter(([, v]) => v);
  return (
    <>
      <h1 className="ud-pdf-cap-t" data-nivel={1}>Cierre</h1>
      {c.mensaje.split(/\n+/).filter(Boolean).map((p, i) => <p key={i} className="ud-pdf-p">{p}</p>)}
      {c.firmas.length ? (
        <div className="ud-pdf-firmas">
          {c.firmas.map((f, i) => (
            <div key={i}>
              {f.nombre ? <b>{f.nombre}</b> : null}
              {f.cargo ? <span>{f.cargo}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {c.creditos ? <p className="ud-pdf-nota" style={{ marginTop: 22 }}>{c.creditos}</p> : null}
      {contacto.length ? (
        <dl className="ud-pdf-contacto">
          {contacto.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="ud-pdf-nota" style={{ marginTop: 22 }}><b>Fuente de los datos.</b> Las cifras vivas vienen de UDES en Cifras y de las tablas de UDrive que cita el informe; cada una indica su fuente y su corte.</p>
    </>
  );
}

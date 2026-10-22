/* =============================================================================
   UDrive · las páginas del PDF (Carta, 816 × 1056 px).

   Paginado de dos pasadas:
     1. Se dibuja cada unidad (párrafo, figura, fila de tabla, línea de índice)
        fuera de pantalla, al ancho exacto del cuerpo, se mide cuando ya están
        las fuentes y las imágenes, y se reparte en páginas (lib/paginado.ts).
        Eso dice en qué página cae cada título y cada figura.
     2. Se imprimen las páginas con los índices ya con esos números.
   Como los índices ocupan lo mismo con el número real que con el provisional,
   la segunda pasada no mueve nada.

   Es el mismo dibujo que la hoja del editor (salida/Piezas.tsx), a tamaño de
   papel. Imprimir es del navegador (salida/imprimir.ts): texto y gráficas SVG
   salen como vectores y los mapas de calor llevan print-color-adjust: exact.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Documento, Fuente } from "../lib/documento";
import { indicesActivos } from "../lib/numeracion";
import type { Figura } from "../lib/numeracion";
import { ALTO_CUERPO, paginar } from "../lib/paginado";
import type { ItemPaginado, ResultadoPaginado, Trozo } from "../lib/paginado";
import { abreHoja, esTitulo, planear } from "../lib/plan";
import type { ItemPlan } from "../lib/plan";
import { aPlano } from "../lib/texto";
import type { ContextoTexto } from "../lib/texto";
import type { CifraResuelta } from "../lib/cifras";
import { CapituloVista, DestacadoVista, EntradaDeIndice, FiguraGrafica, FiguraImagen, FiguraTabla, FuenteVista, ListaVista, NotaSuelta, PortadaPdf, ProveedorRender, TextoVista, TituloIndice, TituloReferencias } from "./Piezas";
import type { CtxRender } from "./Piezas";
import type { Recursos } from "./recursos";
import "./salida.css";

/** Alto de línea y margen inferior del cuerpo (ver salida.css): las partes de un párrafo miden una línea. */
const LINEA = 22.5;
const MARGEN_P = 10;

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
}

export interface InfoPaginado {
  paginas: number;
  /** Página de cada título y figura (id de bloque → número). */
  paginaDe: ReadonlyMap<string, number>;
  /** Las fuentes y las imágenes estaban listas al medir: los números son los del PDF. */
  exacto: boolean;
}

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
function TrozoPdf({ item, t, paginas, sangria }: { item: ItemPlan; t: Trozo; paginas: ReadonlyMap<string, number>; sangria: boolean }) {
  const parrafoPartido = item.tipo === "bloque" && item.bloque.tipo === "parrafo" && !(t.primero && t.ultimo);
  if (parrafoPartido) {
    const estilo: CSSProperties = { height: (t.hasta - t.desde) * LINEA + (t.ultimo ? MARGEN_P : 0), overflow: "hidden" };
    return (
      <div style={estilo}>
        <div style={{ marginTop: -t.desde * LINEA }}>
          <Unidad item={item} paginas={paginas} sangria={sangria} />
        </div>
      </div>
    );
  }
  return <Unidad item={item} t={t} paginas={paginas} sangria={sangria} />;
}

/* ---------- la medición -------------------------------------------------------------------------------------- */

function medirUnidades(raiz: HTMLElement, plan: readonly ItemPlan[]): ItemPaginado[] {
  // Si la vista previa está escalada con transform, las medidas del navegador salen escaladas: se deshace.
  const k = raiz.offsetWidth ? raiz.getBoundingClientRect().width / raiz.offsetWidth : 1;
  const h = (e: Element | null | undefined): number => (e ? e.getBoundingClientRect().height / (k || 1) : 0);
  return plan.map((it, n) => {
    const el = raiz.children[n] as HTMLElement | undefined;
    const alto = h(el);
    const base: ItemPaginado = { clave: it.clave, alto, nuevaPagina: abreHoja(it) || undefined, pegar: esTitulo(it) || undefined };
    if (!el || it.tipo === "titulo-indice" || it.tipo === "entrada-indice" || it.tipo === "fuente") return base;
    const b = it.bloque;
    if (b.tipo === "parrafo") {
      const lineas = Math.max(1, Math.round((alto - MARGEN_P) / LINEA));
      return lineas >= 4 ? { ...base, partes: Array.from({ length: lineas }, () => LINEA), pie: MARGEN_P, minPrimero: 2, minUltimo: 2 } : base;
    }
    if (b.tipo === "lista") {
      const lis = Array.from(el.querySelectorAll<HTMLElement>("li")).map((li) => h(li));
      if (lis.length < 4) return base;
      const suma = lis.reduce((t, h) => t + h, 0);
      return { ...base, partes: lis, cabeza: 0, cabezaSiguientes: 0, pie: Math.max(0, alto - suma), minPrimero: 2, minUltimo: 2 };
    }
    if (b.tipo === "tabla") {
      const filas = Array.from(el.querySelectorAll<HTMLElement>("tbody tr")).map((tr) => h(tr));
      if (filas.length < 5) return base;
      const cap = h(el.querySelector<HTMLElement>(".ud-pdf-fcap"));
      const enc = h(el.querySelector<HTMLElement>("thead"));
      const suma = filas.reduce((t, h) => t + h, 0);
      return { ...base, partes: filas, cabeza: cap + enc, cabezaSiguientes: b.repetirEncabezado ? enc : 0, pie: Math.max(0, alto - cap - enc - suma), minPrimero: 2, minUltimo: 2, pegar: undefined };
    }
    return base;
  });
}

const esperar = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

async function esperarListo(raiz: HTMLElement): Promise<boolean> {
  let exacto = true;
  try {
    if ("fonts" in document) await Promise.race([document.fonts.ready.then(() => undefined), esperar(4000)]);
  } catch {
    exacto = false;
  }
  const imgs = Array.from(raiz.querySelectorAll("img"));
  const cargadas = await Promise.race([
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve(true) : new Promise<boolean>((r) => { i.onload = () => r(true); i.onerror = () => r(false); })))).then((x) => x.every(Boolean)),
    esperar(6000).then(() => false),
  ]);
  if (!cargadas) exacto = false;
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  return exacto;
}

/* ---------- el componente ------------------------------------------------------------------------------------------ */

export function PaginasPdf({ entrada, onPaginado, modoPantalla = true }: { entrada: EntradaPdf; onPaginado?: (i: InfoPaginado) => void; modoPantalla?: boolean }) {
  const { doc, titulo, recursos, figuras, texto, cifra, firmaCifras, borrador } = entrada;
  const indices = useMemo(() => indicesActivos(doc, figuras, texto), [doc, figuras, texto]);
  const plan = useMemo(() => planear(doc, indices), [doc, indices]);
  // Sangría de primera línea en todo párrafo que no abre un apartado (el que sigue a un título no la lleva).
  const conSangria = useMemo(() => {
    const salida = new Set<string>();
    plan.forEach((it, n) => {
      const previo = plan[n - 1];
      if (n > 0 && previo && !(previo.tipo === "titulo-indice" || previo.tipo === "entrada-indice" || (previo.tipo === "bloque" && (previo.bloque.tipo === "capitulo" || previo.bloque.tipo === "referencias" || previo.bloque.tipo === "salto")))) salida.add(it.clave);
    });
    return salida;
  }, [plan]);
  const medida = useRef<HTMLDivElement>(null);
  const [resultado, setResultado] = useState<ResultadoPaginado | null>(null);
  const alPaginar = useRef(onPaginado);
  alPaginar.current = onPaginado;

  const base = { bibliografia: entrada.bibliografia, texto, cifra, figuras, recursos };
  const ctxMedida = useMemo<CtxRender>(() => ({ ...base, modo: "medida", paginas: new Map() }), [doc, texto, figuras, recursos, firmaCifras]); // eslint-disable-line react-hooks/exhaustive-deps -- cifra cambia de identidad; firmaCifras la resume

  // Primera pasada: medir y repartir. Se repite si cambia el documento, los datos o las cifras.
  useEffect(() => {
    if (!recursos.listo || !medida.current) return;
    let vigente = true;
    void (async () => {
      const raiz = medida.current;
      if (!raiz) return;
      const exacto = await esperarListo(raiz);
      if (!vigente) return;
      const r = paginar(medirUnidades(raiz, plan), ALTO_CUERPO, 2);
      setResultado(r);
      alPaginar.current?.({ paginas: 1 + r.paginas.length, paginaDe: r.paginaDe, exacto });
    })();
    return () => {
      vigente = false;
    };
  }, [plan, recursos, ctxMedida]);

  const ctxFinal = useMemo<CtxRender>(() => ({ ...base, modo: "pdf", paginas: resultado?.paginaDe ?? new Map() }), [doc, texto, figuras, recursos, firmaCifras, resultado]); // eslint-disable-line react-hooks/exhaustive-deps
  const porClave = useMemo(() => new Map(plan.map((it) => [it.clave, it])), [plan]);
  const imagenPortada = doc.portada.imagenId ? (recursos.imagenes.get(doc.portada.imagenId)?.url ?? null) : null;
  const corre = titulo.trim() || doc.portada.titulo.trim();

  return (
    <>
      <ProveedorRender value={ctxMedida}>
        <div ref={medida} className="ud-pdf-medida ud-doc" aria-hidden="true" lang="es">
          {plan.map((it) => (
            <div key={it.clave} className="ud-pdf-u">
              <Unidad item={it} paginas={ctxMedida.paginas} sangria={conSangria.has(it.clave)} />
            </div>
          ))}
        </div>
      </ProveedorRender>
      <ProveedorRender value={ctxFinal}>
        <div className="ud-pdf-paginas ud-doc" data-pantalla={modoPantalla ? "true" : undefined} lang="es">
          <section className="ud-pdf-pag" data-portada="true" aria-label="Página 1, portada">
            <PortadaPdf portada={doc.portada} imagenUrl={imagenPortada} />
            {borrador ? <Marca /> : null}
          </section>
          {(resultado?.paginas ?? []).map((trozos, n) => (
            <section key={n} className="ud-pdf-pag" aria-label={`Página ${n + 2}`}>
              <div className="ud-pdf-corre"><span>{aPlano(corre)}</span></div>
              <div className="ud-pdf-cuerpo">
                {trozos.map((t) => {
                  const it = porClave.get(t.clave);
                  return it ? <div key={`${t.clave}:${t.desde}`} className="ud-pdf-u"><TrozoPdf item={it} t={t} paginas={ctxFinal.paginas} sangria={conSangria.has(t.clave)} /></div> : null;
                })}
              </div>
              <div className="ud-pdf-pie"><span>{n + 2}</span></div>
              {borrador ? <Marca /> : null}
            </section>
          ))}
        </div>
      </ProveedorRender>
    </>
  );
}

function Marca() {
  return (
    <div className="ud-pdf-marca" aria-hidden="true">
      <span>DOCUMENTO BORRADOR</span>
    </div>
  );
}

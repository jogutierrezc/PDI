/* =============================================================================
   UDrive · las piezas del documento, las mismas en el editor y en el PDF.

   Un solo dibujo para cada bloque: lo que se ve en la hoja del editor es lo
   que sale impreso. Reciben un contexto (cifras, citas, números de figura,
   datos de las tablas y gráficas) y, para los bloques que se parten entre
   páginas (listas y tablas), el tramo [desde, hasta) que les toca.

   Todo texto de la persona pasa por React (nunca innerHTML) y los enlaces
   solo se pintan si son http(s). Las gráficas son SVG (TanStack Charts), así
   que salen nítidas al imprimir.
   ========================================================================== */

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { referenciaApa } from "../lib/apa";
import { SIN_DATO } from "../lib/cifras";
import type { CifraResuelta } from "../lib/cifras";
import { colorDeTramo, describirTramos } from "../lib/calor";
import type { BCapitulo, BDestacado, BGrafica, BImagen, BLista, BNota, BTabla, Documento, Fuente, Portada } from "../lib/documento";
import type { ContextoTexto } from "../lib/texto";
import { enlaceSeguro, tramos } from "../lib/texto";
import type { EntradaIndice, Figura } from "../lib/numeracion";
import { TITULO_INDICE } from "../lib/numeracion";
import type { ClaveIndice } from "../lib/numeracion";
import { numeroDe, textoNumero } from "../lib/valores";
import type { ColumnaUd, ContenidoTabla } from "../tipos";
import { GraficaVista } from "../ui/GraficaVista";
import type { Recursos } from "./recursos";

export type ModoRender = "editor" | "medida" | "pdf";

export interface CtxRender {
  /** Las fuentes de la bibliografía, ya ordenadas. */
  bibliografia: readonly Fuente[];
  modo: ModoRender;
  texto: ContextoTexto;
  cifra(clave: string): CifraResuelta | null;
  figuras: ReadonlyMap<string, Figura>;
  recursos: Recursos;
  /** Página de cada título y figura (segunda pasada); vacío mientras se mide. */
  paginas: ReadonlyMap<string, number>;
}

const Ctx = createContext<CtxRender | null>(null);
export const ProveedorRender = Ctx.Provider;
export function useRender(): CtxRender {
  const c = useContext(Ctx);
  if (!c) throw new Error("Falta el proveedor de render del documento.");
  return c;
}

export const anclaDe = (bloqueId: string): string => `ud-pdf-${bloqueId}`;

/* ---------- texto con formato ------------------------------------------------------------ */

export function TextoVista({ texto }: { texto: string }) {
  const ctx = useRender();
  const editor = ctx.modo === "editor";
  return (
    <>
      {tramos(texto).map((t, n) => {
        if (t.t === "texto") {
          let nodo: ReactNode = t.texto;
          if (t.i) nodo = <em>{nodo}</em>;
          if (t.b) nodo = <strong>{nodo}</strong>;
          if (t.enlace && enlaceSeguro(t.enlace)) nodo = <a href={t.enlace} target="_blank" rel="noopener noreferrer">{nodo}</a>;
          return <span key={n}>{nodo}</span>;
        }
        if (t.t === "cifra") {
          const c = ctx.cifra(t.clave);
          if (!c) return <span key={n} className="ud-cifra" data-roto={editor ? "true" : undefined}>{editor ? `[[${t.clave}]]` : SIN_DATO}</span>;
          return (
            <span key={n} className="ud-cifra" data-cambio={editor && c.cambio ? "true" : undefined} data-sin={c.conValor ? undefined : "true"} title={editor ? `${c.fuente}${c.cambio ? ` · cambió ${c.cambio}` : ""}` : undefined}>
              {c.texto}
            </span>
          );
        }
        if (t.t === "cita") return <span key={n}>{ctx.texto.cita(t.fuente, t.extra) ?? "(fuente sin definir)"}</span>;
        const et = ctx.texto.ref(t.bloque);
        if (!et) return <span key={n} className="ud-ref" data-roto="true">(referencia rota)</span>;
        return ctx.modo === "pdf" ? <a key={n} className="ud-ref" href={`#${anclaDe(t.bloque)}`}>{et}</a> : <span key={n} className="ud-ref">{et}</span>;
      })}
    </>
  );
}

/* ---------- capítulos, listas, destacados ---------------------------------------------------- */

export function CapituloVista({ b }: { b: BCapitulo }) {
  const ctx = useRender();
  const Etiqueta = (b.nivel === 1 ? "h1" : b.nivel === 2 ? "h2" : "h3") as "h1" | "h2" | "h3";
  return (
    <Etiqueta className="ud-pdf-cap-t" data-nivel={b.nivel} id={ctx.modo === "pdf" ? anclaDe(b.id) : undefined}>
      {b.titulo.trim() || (ctx.modo === "editor" ? <span className="ud-vacio-t">Título del capítulo</span> : null)}
    </Etiqueta>
  );
}

export function ListaVista({ b, desde = 0, hasta = b.items.length }: { b: BLista; desde?: number; hasta?: number }) {
  const Etiqueta = (b.ordenada ? "ol" : "ul") as "ol" | "ul";
  return (
    <Etiqueta className="ud-pdf-lista" start={b.ordenada ? desde + 1 : undefined}>
      {b.items.slice(desde, hasta).map((i, n) => <li key={desde + n}><TextoVista texto={i} /></li>)}
    </Etiqueta>
  );
}

export function DestacadoVista({ b }: { b: BDestacado }) {
  return <blockquote className="ud-pdf-dest"><TextoVista texto={b.texto} /></blockquote>;
}

export function NotaSuelta({ b }: { b: BNota }) {
  return <p className="ud-pdf-nota"><b>Nota.</b> <TextoVista texto={b.texto} /></p>;
}

/* ---------- pies de figura ---------------------------------------------------------------------- */

export function PieDeFigura({ fig, titulo }: { fig: Figura | undefined; titulo: string }) {
  if (!fig) return null;
  return (
    <div className="ud-pdf-fcap" data-clase={fig.clase}>
      <b>{fig.etiqueta}.</b>{" "}
      <i>{titulo.trim() ? <TextoVista texto={titulo} /> : <span className="ud-vacio-t">Sin título</span>}</i>
    </div>
  );
}

function NotaDeFigura({ nota }: { nota: string }) {
  if (!nota.trim()) return null;
  return <p className="ud-pdf-nota"><b>Nota.</b> <TextoVista texto={nota} /></p>;
}

/* ---------- tabla ----------------------------------------------------------------------------------- */

const celda = (c: ColumnaUd, v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return textoNumero(v);
  return String(v);
};

/** El título y la nota de un bloque: los suyos o, vacíos, los de «Cómo se ve en el documento» de la tabla. */
export const tituloTabla = (b: BTabla, t: ContenidoTabla | null | undefined): string => b.titulo.trim() || t?.presentacion.titulo || "";
export const notaTabla = (b: BTabla, t: ContenidoTabla | null | undefined): string => b.nota.trim() || t?.presentacion.nota || "";

export function filasConCalor(b: BTabla, t: ContenidoTabla): boolean {
  return b.mapaCalor && t.mapaCalor && t.columnas.some((c) => c.calor && c.calor.length > 1);
}

export function FiguraTabla({ b, desde = 0, hasta, primero = true, ultimo = true }: { b: BTabla; desde?: number; hasta?: number; primero?: boolean; ultimo?: boolean }) {
  const ctx = useRender();
  const t = ctx.recursos.tablas.get(b.archivoId);
  const fig = ctx.figuras.get(b.id);
  if (!b.archivoId) return <p className="ud-pdf-vacio">Elija una tabla de UDrive para este bloque.</p>;
  if (!t) return <p className="ud-pdf-vacio">{ctx.recursos.listo ? "No se pudo leer la tabla: ya no existe, está en la papelera o no tiene permiso para verla." : "Cargando la tabla…"}</p>;
  const filas = t.filas.slice(desde, hasta ?? t.filas.length);
  const calor = filasConCalor(b, t);
  const leyendas = calor ? leyendasDeCalor(t) : [];
  return (
    <div className="ud-pdf-fig" id={ctx.modo === "pdf" ? anclaDe(b.id) : undefined}>
      {primero ? <PieDeFigura fig={fig} titulo={tituloTabla(b, t)} /> : null}
      <table className="ud-pdf-tb" aria-label={aPlanoCorto(tituloTabla(b, t))}>
        {primero || b.repetirEncabezado ? (
          <thead>
            <tr>
              {t.columnas.map((c) => (
                <th key={c.clave} scope="col" data-num={c.tipo === "numero" || c.tipo === "porcentaje" ? "true" : undefined}>{c.etiqueta}</th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              {t.columnas.map((c) => {
                const v = f.datos[c.clave] ?? null;
                const fondo = calor && c.calor ? colorDeTramo(numeroDe(v), c.calor) : null;
                return <td key={c.clave} data-num={c.tipo === "numero" || c.tipo === "porcentaje" ? "true" : undefined} style={fondo ? { backgroundColor: fondo } : undefined}>{celda(c, v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {ultimo ? (
        <>
          <NotaDeFigura nota={notaTabla(b, t)} />
          {leyendas.map((l) => (
            <div key={l.clave} className="ud-pdf-ley" aria-label={`Mapa de calor de ${l.etiquetas}`}>
              <span>{l.etiquetas}:</span>
              {l.tramos.map((tr, n) => (
                <span key={n} className="ud-pdf-ley-i"><i style={{ backgroundColor: tr.color }} />{tr.texto}</span>
              ))}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

const aPlanoCorto = (t: string): string => tramos(t).map((x) => (x.t === "texto" ? x.texto : "")).join("").slice(0, 160);

/** Una leyenda por cada juego distinto de tramos: «% total, % lun.: menos de 20 · 20–40 · …». */
function leyendasDeCalor(t: ContenidoTabla): { clave: string; etiquetas: string; tramos: { color: string; texto: string }[] }[] {
  const grupos = new Map<string, { etiquetas: string[]; tr: NonNullable<ColumnaUd["calor"]> }>();
  for (const c of t.columnas) {
    if (!c.calor || c.calor.length < 2) continue;
    const k = JSON.stringify(c.calor);
    const g = grupos.get(k) ?? { etiquetas: [], tr: c.calor };
    g.etiquetas.push(c.etiqueta);
    grupos.set(k, g);
  }
  return [...grupos.entries()].map(([clave, g]) => {
    const desc = describirTramos(g.tr).split(/, | y /);
    return { clave, etiquetas: g.etiquetas.length > 3 ? `${g.etiquetas.slice(0, 2).join(", ")} y ${g.etiquetas.length - 2} más` : g.etiquetas.join(", "), tramos: g.tr.map((tr, n) => ({ color: tr.color, texto: desc[n] ?? "" })) };
  });
}

/* ---------- gráfica e imagen ------------------------------------------------------------------------- */

export const ALTO_GRAFICA = { completo: 300, medio: 260, pequeno: 220 } as const;
const PORCENTAJE_ANCHO = { completo: "100%", medio: "72%", pequeno: "50%" } as const;

export function tituloGrafica(b: BGrafica, g: { config: { titulo: string } } | null | undefined): string {
  return b.titulo.trim() || g?.config.titulo || "";
}
export function notaGrafica(b: BGrafica, g: { config: { nota: string } } | null | undefined): string {
  return b.nota.trim() || g?.config.nota || "";
}

export function FiguraGrafica({ b }: { b: BGrafica }) {
  const ctx = useRender();
  const g = ctx.recursos.graficas.get(b.archivoId);
  const fig = ctx.figuras.get(b.id);
  const alto = ALTO_GRAFICA[b.ancho];
  if (!b.archivoId) return <p className="ud-pdf-vacio">Elija una gráfica de UDrive para este bloque.</p>;
  if (!g) return <p className="ud-pdf-vacio">{ctx.recursos.listo ? "No se pudo leer la gráfica: ya no existe, está en la papelera o no tiene permiso para verla." : "Cargando la gráfica…"}</p>;
  const tabla = g.tabla_id ? ctx.recursos.tablas.get(g.tabla_id) : null;
  return (
    <div className="ud-pdf-fig" id={ctx.modo === "pdf" ? anclaDe(b.id) : undefined}>
      <PieDeFigura fig={fig} titulo={tituloGrafica(b, g)} />
      <div className="ud-pdf-graf" style={{ width: PORCENTAJE_ANCHO[b.ancho], height: alto }}>
        {ctx.modo === "medida" ? null : tabla ? <GraficaVista tabla={{ columnas: tabla.columnas, filas: tabla.filas }} config={g.config} altura={alto} /> : <p className="ud-pdf-vacio">La tabla de esta gráfica no está disponible.</p>}
      </div>
      <NotaDeFigura nota={notaGrafica(b, g)} />
    </div>
  );
}

export function FiguraImagen({ b }: { b: BImagen }) {
  const ctx = useRender();
  const im = ctx.recursos.imagenes.get(b.archivoId);
  const fig = ctx.figuras.get(b.id);
  if (!b.archivoId) return <p className="ud-pdf-vacio">Elija una imagen de UDrive para este bloque.</p>;
  return (
    <div className="ud-pdf-fig" id={ctx.modo === "pdf" ? anclaDe(b.id) : undefined}>
      <PieDeFigura fig={fig} titulo={b.titulo} />
      {im ? (
        <img className="ud-pdf-img" src={im.url} alt={b.alt.trim() || b.titulo.trim() || im.nombre} style={{ width: PORCENTAJE_ANCHO[b.ancho] }} />
      ) : (
        <p className="ud-pdf-vacio">{ctx.recursos.listo ? "No se pudo leer la imagen: ya no existe o no tiene permiso para verla." : "Cargando la imagen…"}</p>
      )}
      <NotaDeFigura nota={b.nota} />
    </div>
  );
}

/* ---------- referencias e índices ----------------------------------------------------------------------- */

export function TituloReferencias({ titulo, id }: { titulo: string; id: string }) {
  const ctx = useRender();
  return <h1 className="ud-pdf-cap-t" data-nivel={1} id={ctx.modo === "pdf" ? anclaDe(id) : undefined}>{titulo}</h1>;
}

export function FuenteVista({ f }: { f: Fuente }) {
  return <p className="ud-pdf-fuente"><TextoPlano marcado={referenciaApa(f)} /></p>;
}

/** Texto marcado sin cifras ni referencias (el de las fuentes APA), con cursivas y enlaces. */
function TextoPlano({ marcado }: { marcado: string }) {
  return (
    <>
      {tramos(marcado).map((t, n) => {
        if (t.t !== "texto") return null;
        let nodo: ReactNode = t.texto;
        if (t.i) nodo = <em>{nodo}</em>;
        if (t.b) nodo = <strong>{nodo}</strong>;
        if (t.enlace && enlaceSeguro(t.enlace)) nodo = <a href={t.enlace} target="_blank" rel="noopener noreferrer">{nodo}</a>;
        return <span key={n}>{nodo}</span>;
      })}
    </>
  );
}

export function TituloIndice({ indice }: { indice: ClaveIndice }) {
  return <h1 className="ud-pdf-cap-t ud-pdf-ind-t" data-nivel={1}>{TITULO_INDICE[indice]}</h1>;
}

export function EntradaDeIndice({ e, pagina }: { e: EntradaIndice; pagina: number | undefined }) {
  const ctx = useRender();
  const nivel = e.nivel === 1 ? "a" : e.nivel === 2 ? "b" : "c";
  const contenido = (
    <>
      <span className="ud-pdf-toc-t">{e.etiqueta ? <><b>{e.etiqueta}</b> </> : null}{e.texto}</span>
      <i aria-hidden="true" />
      <span className="ud-pdf-toc-n">{pagina ?? "·"}</span>
    </>
  );
  return ctx.modo === "pdf" && pagina ? <a className="ud-pdf-toc" data-n={nivel} href={`#${anclaDe(e.bloqueId)}`}>{contenido}</a> : <div className="ud-pdf-toc" data-n={nivel}>{contenido}</div>;
}

/* ---------- portada ------------------------------------------------------------------------------------------- */

export function PortadaPdf({ portada, imagenUrl }: { portada: Portada; imagenUrl: string | null }) {
  const titulo = portada.titulo.trim() || "Título del informe";
  const tam = titulo.length <= 40 ? 40 : titulo.length <= 90 ? 32 : 26;
  return (
    <div className="ud-pdf-portada">
      {imagenUrl ? (
        <img className="ud-pdf-portada-img" src={imagenUrl} alt="" />
      ) : (
        <svg className="ud-pdf-portada-arte" viewBox="0 0 816 990" aria-hidden="true" preserveAspectRatio="none">
          <polygon points="0,300 330,250 250,520 0,560" fill="#7fb3e6" />
          <polygon points="336,248 816,180 816,430 262,520" fill="#e3b36a" />
          <polygon points="0,568 262,528 200,780 0,840" fill="#3f8a6a" />
          <polygon points="268,526 816,438 816,700 208,788" fill="#2b6cc4" />
          <polygon points="0,848 206,796 150,990 0,990" fill="#16406f" />
          <polygon points="212,794 816,708 816,990 156,990" fill="#7fb3e6" />
        </svg>
      )}
      <div className="ud-pdf-portada-t" style={{ fontSize: tam }}>
        <div>{titulo.toLocaleUpperCase("es")}</div>
        {portada.subtitulo.trim() ? <div className="ud-pdf-portada-s">{portada.subtitulo}</div> : null}
      </div>
      <div className="ud-pdf-portada-pie">
        <div className="ud-pdf-portada-ent">
          <img src="/logo-udes.svg" alt="" />
          <div>
            <b>{portada.entidad.trim() || "Universidad de Santander"}</b>
            <span>Acreditada en alta calidad</span>
          </div>
        </div>
        <div className="ud-pdf-portada-anio">
          <b>Planeación Institucional</b>
          <span>{portada.anio}</span>
        </div>
      </div>
    </div>
  );
}

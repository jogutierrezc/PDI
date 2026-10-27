/* =============================================================================
   CMS Portales · render de bloques.

   Un solo renderizador para el lienzo del editor y para la página pública. Así
   lo que se ve al editar es lo que ve el público. Cada tipo de bloque de
   bloques.ts tiene aquí su diseño, el del portal de UDES Sostenible.

   Responsive por container queries: el marco es el contenedor, así que el
   modo Tableta o Teléfono del editor cambia la disposición igual que en el
   público. Movimiento (GSAP) según `_mov`; con movimiento reducido, todo
   aparece ya en su lugar.
   ========================================================================== */

import { Fragment, createContext, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Icon } from "../../../components/ui/Icon";
import { odsArt } from "../../sostenible/ods-data";
import { ALL_INDICATORS, LAST, YEARS } from "../../sostenible/data";
import { IndicatorBoard, SdgWheel, reduced } from "../../sostenible/widgets";
import { GraficasSostenibles } from "../../sostenible/GraficasSostenibles";
import type { SeccionSos } from "../../datos-sostenibilidad/tipos";
import { CampusExplorer } from "../../landing/CampusExplorer";
import { ResourceRoom } from "../../landing/ResourceRoom";
import { RouteFinder } from "../../landing/RouteFinder";
import { SdgBand } from "../../landing/SdgBand";
import { SiteSearch } from "../../planeacion/SiteSearch";
import { AvancePlan } from "./vivos/AvancePlan";
import { PilaresPlan } from "./vivos/PilaresPlan";
import { EnvolturaPlaneacion, EquipoOficina, GaleriaOficina, MosaicoPortales, RecientesOficina } from "./vivos/OficinaPlaneacion";
import { MicrositioVivo } from "./vivos/RankingSecciones";
import { ALINEACIONES, ALTO_HTML, ANCHOS, FONDOS, alinearDe, contenedorDe, destinoSeguro, documentoHtml, estiloDe, leerCifra, mapaOsm, medidaDe, hijosPlanos, idHijo, movimientoDe, ocultoDe, videoDatos, videoMiniatura, videoUrl, type HijoContenedor } from "./logica";
import { initialsOf, officePhotoUrl } from "../../planeacion/page";
import { PROPORCIONES_COLUMNAS, definicion } from "./bloques";
import { IconoCms } from "./iconos";
import { SelectorBloque } from "./SelectorBloque";
import { estiloDeBloque, estiloDeMarco, familiasUsadas, useFuentes, type EstiloSitioParcial } from "./estilo";
import type { Ancho, Movimiento, Props } from "./tipos";
// Estilos del tablero de indicadores (IndicatorBoard). Están acotados al contenedor .sos.
import "../../sostenible/sostenible.css";

/** Un bloque tal como se dibuja: sin ids ni fechas. */
export interface BloqueRender {
  /** Solo lo usa el editor (el contenedor identifica a sus hijos con él); la página publicada no lo trae. */
  id?: string;
  tipo: string;
  ancho: Ancho;
  props: Props;
}

/** Los íconos de los frentes, con la misma geometría que el diseño de Sostenible. */
const ICONOS_FRENTES: Record<string, string> = {
  energia: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  agua: "M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11Z",
  hoja: "M12 21V9M12 15c-4 0-6-2-6-6 4 0 6 2 6 6Zm0-3c3 0 5-2 5-5-3 0-5 2-5 5Z",
  libro: "M3 8l9-4 9 4-9 4-9-4Zm4 3v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5",
  gente: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9 1a2.5 2.5 0 1 0 0-5M2 20c0-3 3-5 6-5s6 2 6 5M16 15c3 0 6 1.5 6 4",
  escudo: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4",
};

const ODS_NUMEROS = Array.from({ length: 17 }, (_, i) => i + 1);

/* --- Lectura segura de props ----------------------------------------------------------------- */

const texto = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const lista = (v: unknown): Props[] =>
  Array.isArray(v) ? v.filter((x): x is Props => typeof x === "object" && x !== null && !Array.isArray(x)) : [];

/**
 * Las clases de fondo y espacio del bloque. El encabezado pinta su fondo con
 * su tono (así la celda cubre también el espacio vertical); la cinta de ODS
 * trae su propio fondo y no lleva espacio.
 */
export function clasesEstilo(bloque: BloqueRender, anidado = false): string {
  const def = definicion(bloque.tipo);
  const { fondo, espacio } = estiloDe(bloque.props);
  const partes: string[] = [];
  // Dentro de una columna, el fondo solo se pinta si el bloque lo eligió: si no, deja ver el de la columna.
  const e = bloque.props._estilo;
  const fondoPropio = typeof e === "object" && e !== null && FONDOS.includes((e as Props).fondo as (typeof FONDOS)[number]);
  if (bloque.tipo === "hero") partes.push(texto(bloque.props.tono) === "claro" ? "cms-fondo-claro" : "cms-fondo-marino");
  else if (!def?.sinFondo && (!anidado || fondoPropio)) partes.push(`cms-fondo-${fondo}`);
  if (bloque.tipo !== "ods") partes.push(`cms-espacio-${espacio}`);
  const alinear = alinearDe(bloque.props);
  if (alinear !== "izquierda") partes.push(`cms-alin-${alinear}`);
  const medida = medidaDe(bloque.props);
  if (medida !== "estrecha") partes.push(`cms-medida-${medida}`);
  return partes.join(" ");
}

/* --- Entrada animada ------------------------------------------------------------------------- */

/**
 * Entrada del bloque según su movimiento. `disparo` cambia para volver a
 * reproducirla (botón «Reproducir» o cambio de vista). Con `auto` falso, la
 * primera pasada no se anima: así el lienzo en edición no parpadea al abrirse.
 */
export function useEntrada(ref: RefObject<HTMLElement>, tipo: string, mov: Movimiento, disparo: string, auto: boolean) {
  // Firma de la primera pasada: mientras nada cambie (ni siquiera con el doble
  // montaje de React en desarrollo) el lienzo en edición no se anima.
  const firma = [tipo, mov.preset, mov.dur, mov.stagger, mov.delay, mov.ease, disparo, auto].join("|");
  const primera = useRef(firma);
  useGSAP(
    () => {
      const omitir = !auto && primera.current === firma;
      const el = ref.current;
      if (omitir || !el || reduced() || mov.preset === "ninguna") return;
      const base = { duration: mov.dur, delay: mov.delay, ease: mov.ease };
      const sube = () => gsap.from(el, { y: 24, opacity: 0, ...base, clearProps: "opacity,transform" });

      if (mov.preset === "palabras") {
        const palabras = el.querySelectorAll<HTMLElement>(".cms-w");
        if (palabras.length === 0) return sube();
        gsap.from(palabras, { yPercent: 105, ...base, stagger: mov.stagger, clearProps: "transform" });
        const resto = el.querySelectorAll<HTMLElement>("[data-in]");
        if (resto.length > 0) gsap.from(resto, { y: 16, opacity: 0, duration: 0.6, ease: "power3.out", stagger: 0.1, delay: mov.delay + 0.35, clearProps: "opacity,transform" });
      } else if (mov.preset === "sube") {
        sube();
      } else if (mov.preset === "cascada") {
        const items = el.querySelectorAll<HTMLElement>("[data-in]");
        gsap.from(items.length > 0 ? items : el, { y: 24, opacity: 0, ...base, stagger: mov.stagger, clearProps: "opacity,transform" });
      } else if (mov.preset === "zoom") {
        const arte = el.querySelector<HTMLElement>(".cms-arte");
        gsap.from(arte ?? el, { scale: arte ? 1.16 : 0.96, ...base, clearProps: "transform" });
      }
    },
    // revertOnUpdate: al repetir la entrada se restauran los estilos de la anterior,
    // para que dos animaciones no se pisen ni quede un valor intermedio pegado.
    { scope: ref, dependencies: [firma], revertOnUpdate: true },
  );
}

/* --- Piezas comunes -------------------------------------------------------------------------- */

/** Un título en palabras: cada una sube desde su máscara; la destacada va en color. */
function Palabras({ titulo, enfasis }: { titulo: string; enfasis: string }): ReactNode {
  const e = enfasis.trim();
  const inicioE = e ? titulo.indexOf(e) : -1;
  let pos = 0;
  return titulo.split(/(\s+)/).map((tok, i) => {
    const inicio = pos;
    pos += tok.length;
    if (tok === "") return null;
    if (/^\s+$/.test(tok)) return <Fragment key={i}>{tok}</Fragment>;
    const destacada = inicioE >= 0 && inicio >= inicioE && inicio < inicioE + e.length;
    return (
      <span className="cms-mask" key={i}>
        <span className={destacada ? "cms-w cms-em" : "cms-w"}>{tok}</span>
      </span>
    );
  });
}

function parrafos(valor: string): ReactNode {
  return valor
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => <p key={i}>{l}</p>);
}

function Cabecera({ antetitulo, titulo, texto: cuerpo }: { antetitulo: string; titulo: string; texto: string }) {
  return (
    <div className="cms-head">
      {antetitulo && <p className="cms-eyebrow">{antetitulo}</p>}
      {titulo && <h2 className="cms-h2">{titulo}</h2>}
      {cuerpo && <p className="cms-head__texto">{cuerpo}</p>}
    </div>
  );
}

/**
 * Un elemento que es enlace solo cuando la página es pública y el destino es
 * seguro (ruta interna o https). En el editor y en la vista previa, o con un
 * destino no seguro, es un elemento que no navega.
 */
function Enlazado({ clase, destino, navegable, datoIn = false, children }: { clase: string; destino: unknown; navegable: boolean; datoIn?: boolean; children: ReactNode }) {
  const href = navegable ? destinoSeguro(destino) : null;
  const marca = datoIn ? "" : undefined;
  if (!href) return <span className={clase} data-in={marca}>{children}</span>;
  if (href.startsWith("/")) return <Link className={clase} to={href} data-in={marca}>{children}</Link>;
  return <a className={clase} href={href} rel="noopener noreferrer" data-in={marca}>{children}</a>;
}

/** Un botón del diseño: un rótulo que, si el destino es seguro y la página es pública, enlaza. */
function Boton({ clase, etiqueta, destino, navegable, icono, datoIn }: { clase: string; etiqueta: string; destino: unknown; navegable: boolean; icono?: ReactNode; datoIn?: boolean }) {
  return (
    <Enlazado clase={clase} destino={destino} navegable={navegable} datoIn={datoIn}>
      {etiqueta}
      {icono}
    </Enlazado>
  );
}

/** La cinta de los 17 ODS, en marquesina. Se detiene al pasar el cursor. */
function CintaOds({ velocidad }: { velocidad: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const vuelta = useRef<gsap.core.Tween | null>(null);
  useGSAP(
    () => {
      const pista = ref.current?.querySelector<HTMLElement>(".cms-ods__pista");
      if (!pista || reduced()) return;
      vuelta.current = gsap.to(pista, { xPercent: -50, ease: "none", duration: velocidad, repeat: -1 });
    },
    { scope: ref, dependencies: [velocidad], revertOnUpdate: true },
  );
  const copia = ODS_NUMEROS.map((n) => <img key={n} src={odsArt(n)} alt="" width={64} height={64} loading="lazy" decoding="async" />);
  return (
    <div
      ref={ref}
      className="cms-ods"
      aria-hidden="true"
      onPointerEnter={() => vuelta.current?.pause()}
      onPointerLeave={() => vuelta.current?.play()}
    >
      <div className="cms-ods__pista">
        <div className="cms-ods__grupo">{copia}</div>
        <div className="cms-ods__grupo">{copia}</div>
      </div>
    </div>
  );
}

/* --- Bloques de contenido editable: réplicas del diseño de cada portal ------------------------ */

/** Un acento del pilar como variable del tema (del 1 al 6; si no es válido, el 2). */
const acentoDe = (v: unknown): string => {
  const n = Number(v);
  return `var(--pillar-${Number.isInteger(n) && n >= 1 && n <= 6 ? n : 2})`;
};

/** Tarjetas de los rankings (UDES Sostenible). El puesto es el de Colombia en la última edición. */
function Rankings({ p, navegable }: { p: Props; navegable: boolean }) {
  return (
    <div className="cms-wrap">
      <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />
      <div className="cms-rcards">
        {lista(p.items).map((it, i) => (
          <article className="cms-rcard" data-in key={i} style={{ "--acc": acentoDe(it.acento) } as CSSProperties}>
            <span className="cms-rcard__pub">{texto(it.publicador)}</span>
            <h3>{texto(it.nombre)}</h3>
            <p>{texto(it.subtitulo)}</p>
            <span className="cms-rcard__big">#{texto(it.puesto)}</span>
            <p>Puesto en Colombia · edición {YEARS[LAST]}</p>
            <Boton clase="cms-rcard__go" etiqueta="Entrar al micrositio" destino={it.enlace} navegable={navegable} icono={<Icon name="arrow-right" size={15} />} />
          </article>
        ))}
      </div>
      {p.nota === true && (
        <p className="cms-nota">
          <i aria-hidden="true" />
          Dato ilustrativo: cifras de muestra.
        </p>
      )}
    </div>
  );
}

/** Filas de informes (UDES Sostenible). Los botones «Micrositio» y «PDF» son solo visuales. */
function Informes({ p }: { p: Props }) {
  return (
    <div className="cms-wrap">
      <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />
      <div className="cms-reps">
        {lista(p.items).map((it, i) => (
          <div className="cms-rep" data-in key={i}>
            <span className="cms-rep__anio">{texto(it.anio)}</span>
            <div>
              <h3>{texto(it.nombre)}</h3>
              <p>{texto(it.detalle)}</p>
            </div>
            <div className="cms-rep__acciones" aria-hidden="true">
              <span className="cms-sbtn">Micrositio</span>
              <span className="cms-sbtn cms-sbtn--solido">PDF</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barra de contexto (Landing): cifras en marquesina. Se detiene con el cursor o con el foco. */
function BarraContexto({ p }: { p: Props }) {
  const ref = useRef<HTMLDivElement>(null);
  const vuelta = useRef<gsap.core.Tween | null>(null);
  const velocidad = Math.min(120, Math.max(10, Number(p.velocidad) || 60));
  useGSAP(
    () => {
      const pista = ref.current?.querySelector<HTMLElement>(".cms-ticker__pista");
      if (!pista || reduced()) return;
      vuelta.current = gsap.to(pista, { xPercent: -50, ease: "none", duration: velocidad, repeat: -1 });
    },
    { scope: ref, dependencies: [velocidad], revertOnUpdate: true },
  );
  const hechos = lista(p.items);
  if (hechos.length === 0) return <p className="cms-ayuda cms-r-vacio">La barra de contexto no tiene cifras todavía.</p>;
  const carril = (copia: boolean) => (
    <ul className="cms-ticker__carril" aria-hidden={copia || undefined}>
      {hechos.map((h, i) => (
        <li className="cms-ticker__item" key={i}>
          <b>{texto(h.figura)}</b>
          <span>{texto(h.texto)}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div
      ref={ref}
      className="cms-ticker"
      role="region"
      aria-label="El PDI en contexto"
      tabIndex={0}
      onPointerEnter={() => vuelta.current?.pause()}
      onPointerLeave={() => vuelta.current?.play()}
      onFocus={() => vuelta.current?.pause()}
      onBlur={() => vuelta.current?.play()}
    >
      <div className="cms-ticker__pista">
        {carril(false)}
        {carril(true)}
      </div>
    </div>
  );
}

/** El gran salto (Landing): dimensión, lo que se supera y lo que se construye. */
function Salto({ p }: { p: Props }) {
  return (
    <div className="cms-wrap">
      <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />
      <div className="cms-salto">
        <div className="cms-salto__cabecera">
          <span>Dimensión</span>
          <span>Se supera</span>
          <span>Se construye</span>
        </div>
        {lista(p.items).map((it, i) => (
          <div className="cms-salto__fila" data-in key={i}>
            <b>{texto(it.dimension)}</b>
            <span className="cms-salto__antes">
              <i className="cms-salto__etiqueta">Se supera</i>
              {texto(it.antes)}
            </span>
            <span className="cms-salto__despues">
              <i className="cms-salto__etiqueta">Se construye</i>
              {texto(it.despues)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cierre de la oficina (Planeación): frase, enlace y accesos. */
function Cierre({ p, navegable }: { p: Props; navegable: boolean }) {
  return (
    <div className="cms-wrap cms-cierre">
      <div className="cms-cierre__texto">
        <h2 className="cms-h2">{texto(p.titulo)}</h2>
        {texto(p.texto) && <p className="cms-head__texto">{texto(p.texto)}</p>}
        {texto(p.enlace) && (
          <Boton clase="cms-enlace-tesela" etiqueta={texto(p.enlace)} destino={p.destinoEnlace} navegable={navegable} icono={<Icon name="arrow-right" size={16} />} />
        )}
      </div>
      <ul className="cms-cierre__lista">
        {lista(p.accesos).map((it, i) => (
          <li key={i} data-in>
            <Enlazado clase="cms-acceso" destino={it.destino} navegable={navegable}>
              <b>{texto(it.etiqueta)}</b>
              <span>{texto(it.detalle)}</span>
            </Enlazado>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --- Imagen, carrusel y columnas: los bloques básicos de un CMS ------------------------------- */

/** «16/9» → «16 / 9»; «auto» o un valor raro, sin proporción fija. */
const proporcionDe = (v: unknown): string | undefined => (/^\d{1,2}\/\d{1,2}$/.test(texto(v)) ? texto(v).replace("/", " / ") : undefined);

/** Una imagen del bucket, de /public o de una URL. Sin imagen, un marco vacío que se ve solo al editar. */
function Imagen({ src, alt, proporcion, ajuste = "cubrir" }: { src: unknown; alt: unknown; proporcion?: unknown; ajuste?: unknown }) {
  const url = officePhotoUrl(texto(src));
  const ratio = proporcionDe(proporcion);
  if (!url) {
    return (
      <div className="cms-img cms-img--vacia" style={{ aspectRatio: ratio ?? "16 / 9" }}>
        Sin imagen
      </div>
    );
  }
  return (
    <img
      className={`cms-img${texto(ajuste) === "contener" ? " cms-img--contener" : ""}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
      src={url}
      alt={texto(alt)}
      loading="lazy"
      decoding="async"
    />
  );
}

/** Envuelve el contenido en un enlace solo si la página es pública y el destino es seguro. */
function ConEnlace({ destino, navegable, tabIndex, children }: { destino: unknown; navegable: boolean; tabIndex?: number; children: ReactNode }) {
  const href = navegable ? destinoSeguro(destino) : null;
  if (!href) return <>{children}</>;
  if (href.startsWith("/")) return <Link to={href} tabIndex={tabIndex}>{children}</Link>;
  return <a href={href} rel="noopener noreferrer" tabIndex={tabIndex}>{children}</a>;
}

function BloqueImagen({ p, navegable }: { p: Props; navegable: boolean }) {
  return (
    <figure className="cms-wrap cms-figura" data-in>
      <ConEnlace destino={p.destino} navegable={navegable}>
        <Imagen src={p.imagen} alt={p.alt} proporcion={p.proporcion} ajuste={p.ajuste} />
      </ConEnlace>
      {texto(p.pie) && <figcaption>{texto(p.pie)}</figcaption>}
    </figure>
  );
}

/** Carrusel: una imagen a la vez, con flechas y puntos. Pasa solo, salvo con movimiento reducido o con el cursor o el foco encima. */
function Carrusel({ p, navegable }: { p: Props; navegable: boolean }) {
  const diapositivas = lista(p.items);
  const [actual, setActual] = useState(0);
  const [pausa, setPausa] = useState(false);
  // Quien ve el carrusel puede detenerlo del todo (WCAG 2.2.2); la pausa por cursor o foco es aparte.
  const [detenido, setDetenido] = useState(false);
  const inicioX = useRef<number | null>(null);
  const total = diapositivas.length;
  const segundos = Math.min(20, Math.max(3, Number(p.segundos) || 6));
  const pasaSolo = p.auto === true && total > 1 && !reduced();
  const auto = pasaSolo && !pausa && !detenido;
  const indice = total === 0 ? 0 : Math.min(actual, total - 1);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => setActual((i) => (i + 1) % total), segundos * 1000);
    return () => window.clearInterval(id);
  }, [auto, total, segundos, indice]);

  const ir = (i: number) => setActual(((i % total) + total) % total);
  // Flechas del teclado en cualquier punto del carrusel; un gesto horizontal de más de 40 px en pantallas táctiles.
  const alTeclado = (e: KeyboardEvent<HTMLElement>) => {
    if (total < 2 || (e.target as HTMLElement).closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft") ir(indice - 1);
    else if (e.key === "ArrowRight") ir(indice + 1);
    else return;
    e.preventDefault();
  };
  const alBajar = (e: PointerEvent) => {
    inicioX.current = e.pointerType === "mouse" ? null : e.clientX;
  };
  const alSoltar = (e: PointerEvent) => {
    const x0 = inicioX.current;
    inicioX.current = null;
    if (x0 === null || total < 2) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 40) ir(indice + (dx < 0 ? 1 : -1));
  };
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      {total === 0 ? (
        <p className="cms-ayuda cms-r-vacio">El carrusel no tiene imágenes todavía.</p>
      ) : (
        <section
          className="cms-carr"
          aria-roledescription="carrusel"
          aria-label={texto(p.titulo) || "Carrusel de imágenes"}
          tabIndex={0}
          onKeyDown={alTeclado}
          onPointerEnter={() => setPausa(true)}
          onPointerLeave={() => setPausa(false)}
          onFocus={() => setPausa(true)}
          onBlur={() => setPausa(false)}
        >
          <div className="cms-carr__ventana" onPointerDown={alBajar} onPointerUp={alSoltar} onPointerCancel={() => (inicioX.current = null)}>
            <div className="cms-carr__pista" aria-live={auto ? "off" : "polite"} style={{ transform: `translateX(-${indice * 100}%)` }}>
              {diapositivas.map((d, i) => (
                <div
                  className="cms-carr__lamina"
                  key={i}
                  role="group"
                  aria-roledescription="diapositiva"
                  aria-label={`${i + 1} de ${total}`}
                  aria-hidden={i !== indice || undefined}
                >
                  <ConEnlace destino={d.destino} navegable={navegable} tabIndex={i === indice ? 0 : -1}>
                    <Imagen src={d.imagen} alt={d.alt} proporcion={p.proporcion} />
                    {(texto(d.titulo) || texto(d.texto)) && (
                      <span className="cms-carr__pie">
                        {texto(d.titulo) && <b>{texto(d.titulo)}</b>}
                        {texto(d.texto) && <span>{texto(d.texto)}</span>}
                      </span>
                    )}
                  </ConEnlace>
                </div>
              ))}
            </div>
          </div>
          {total > 1 && (
            <>
              <button type="button" className="cms-carr__flecha cms-carr__flecha--ant" aria-label="Imagen anterior" onClick={() => ir(indice - 1)}>
                <Icon name="chevron-down" size={18} />
              </button>
              <button type="button" className="cms-carr__flecha cms-carr__flecha--sig" aria-label="Imagen siguiente" onClick={() => ir(indice + 1)}>
                <Icon name="chevron-down" size={18} />
              </button>
              <div className="cms-carr__puntos">
                {pasaSolo && (
                  <button
                    type="button"
                    className="cms-carr__pausa"
                    aria-label={detenido ? "Reanudar el paso automático" : "Detener el paso automático"}
                    onClick={() => setDetenido((d) => !d)}
                  >
                    <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
                      {detenido ? <path d="M4 2.5v11l9-5.5-9-5.5Z" fill="currentColor" /> : <path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor" />}
                    </svg>
                  </button>
                )}
                {diapositivas.map((_, i) => (
                  <button key={i} type="button" aria-label={`Ir a la imagen ${i + 1}`} aria-current={i === indice || undefined} onClick={() => ir(i)} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Video de YouTube o Vimeo con fachada: se ve su portada y un botón de play, y el
 * reproductor (iframe de youtube-nocookie.com o player.vimeo.com) solo se carga al
 * pulsar. Así la página no descarga el reproductor de nadie que no lo vea.
 * Si el enlace no es de esos sitios, no se dibuja nada salvo un aviso al editar.
 */
function Video({ url, titulo, proporcion, inicio }: { url: unknown; titulo: unknown; proporcion?: unknown; inicio?: unknown }) {
  const datos = videoDatos(url);
  const clave = datos ? `${datos.proveedor}:${datos.id}` : "";
  const [activo, setActivo] = useState(false);
  const marco = useRef<HTMLIFrameElement>(null);
  useEffect(() => setActivo(false), [clave]);
  useEffect(() => {
    if (activo) marco.current?.focus();
  }, [activo]);
  const ratio = proporcionDe(proporcion) ?? "16 / 9";
  if (!datos) {
    return (
      <div className="cms-img cms-img--vacia" style={{ aspectRatio: ratio }}>
        {texto(url) ? "El enlace no es de YouTube ni de Vimeo" : "Sin video"}
      </div>
    );
  }
  const nombre = texto(titulo) || "Video";
  if (!activo) {
    const miniatura = videoMiniatura(datos);
    return (
      <div className="cms-video" style={{ aspectRatio: ratio }}>
        {miniatura && <img className="cms-video__portada" src={miniatura} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
        <button type="button" className="cms-video__play" aria-label={`Reproducir video: ${nombre}`} onClick={() => setActivo(true)}>
          <Icon name="play" size={30} />
        </button>
      </div>
    );
  }
  return (
    <div className="cms-video" style={{ aspectRatio: ratio }}>
      <iframe
        ref={marco}
        src={videoUrl(datos, { inicio: Number(inicio), autoplay: true })}
        title={nombre}
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}

function BloqueVideo({ p }: { p: Props }) {
  return (
    <figure className="cms-wrap cms-figura" data-in>
      <Video url={p.url} titulo={p.titulo} proporcion={p.proporcion} inicio={p.inicio} />
      {texto(p.pie) && <figcaption>{texto(p.pie)}</figcaption>}
    </figure>
  );
}

/**
 * Secciones desplegables con <details>: se operan con teclado y lectores sin
 * código extra. «Una a la vez» usa el atributo name, que agrupa los details.
 * En preguntas frecuentes, la página pública declara además FAQPage para los buscadores.
 */
function Desplegables({ p, claveTitulo, claveTexto, faq, navegable }: { p: Props; claveTitulo: string; claveTexto: string; faq: boolean; navegable: boolean }) {
  const grupo = useId();
  const filas = lista(p.items).filter((it) => texto(it[claveTitulo]));
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  const unico = p.unico === true ? { name: grupo } : {};
  const ld =
    faq && navegable && filas.length > 0
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: filas.map((it) => ({ "@type": "Question", name: texto(it[claveTitulo]), acceptedAnswer: { "@type": "Answer", text: texto(it[claveTexto]) } })),
        }).replace(/</g, "\\u003c")
      : null;
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      {filas.length === 0 ? (
        <p className="cms-ayuda cms-r-vacio">Todavía no hay secciones.</p>
      ) : (
        <div className="cms-acordeon">
          {filas.map((it, i) => (
            <details className="cms-acordeon__item" data-in key={i} open={p.abierto === true && i === 0 ? true : undefined} {...unico}>
              <summary>
                <span>{texto(it[claveTitulo])}</span>
                <Icon name="chevron-down" size={18} />
              </summary>
              <div className="cms-acordeon__cuerpo">{parrafos(texto(it[claveTexto]))}</div>
            </details>
          ))}
        </div>
      )}
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />}
    </div>
  );
}

/** Un elemento de una columna, según su clase. */
function ElementoColumna({ it, navegable }: { it: Props; navegable: boolean }) {
  const cuerpo = texto(it.texto);
  const alinear = ALINEACIONES.find((a) => a === it.alinear);
  const clase = alinear ? `cms-col__el cms-alin-${alinear}` : "cms-col__el";
  switch (texto(it.elemento)) {
    case "titulo":
      return <h3 className={`${clase} cms-col__titulo`} data-in>{cuerpo}</h3>;
    case "cita":
      return <blockquote className={`${clase} cms-cita`} data-in>{cuerpo}</blockquote>;
    case "imagen":
      return (
        <figure className={`${clase} cms-figura`} data-in>
          <ConEnlace destino={it.destino} navegable={navegable}>
            <Imagen src={it.imagen} alt={it.alt} />
          </ConEnlace>
          {cuerpo && <figcaption>{cuerpo}</figcaption>}
        </figure>
      );
    case "video":
      return (
        <figure className={`${clase} cms-figura`} data-in>
          <Video url={it.destino} titulo={cuerpo} />
          {cuerpo && <figcaption>{cuerpo}</figcaption>}
        </figure>
      );
    case "boton":
      return (
        <div className={clase} data-in>
          <Boton clase="cms-boton cms-boton--solido" etiqueta={cuerpo} destino={it.destino} navegable={navegable} />
        </div>
      );
    default:
      return <div className={`${clase} cms-col__texto`} data-in>{parrafos(cuerpo)}</div>;
  }
}

/** Una, dos o tres columnas. Un elemento cuya columna ya no existe pasa a la última, para que no se pierda. */
function Columnas({ p, navegable }: { p: Props; navegable: boolean }) {
  const cantidad = Math.min(3, Math.max(1, Math.round(Number(p.cantidad)) || 2));
  const elementos = lista(p.items);
  const columnas = Array.from({ length: cantidad }, (_, c) =>
    elementos.filter((it) => Math.min(cantidad, Math.max(1, Math.round(Number(it.columna)) || 1)) === c + 1),
  );
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      <div className="cms-cols" style={{ "--cms-cols": cantidad } as CSSProperties}>
        {columnas.map((items, c) => (
          <div className="cms-col" key={c}>
            {items.map((it, i) => (
              <ElementoColumna it={it} navegable={navegable} key={i} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- Diseño y columnas: cuadrícula, cifras, imagen con texto y cita ---------------------------- */

/** El valor del texto si está entre las opciones; si no, la primera. */
const opcionDe = <T extends string>(v: unknown, opciones: readonly T[]): T => opciones.find((o) => o === v) ?? opciones[0];

/**
 * Cuadrícula de tarjetas. El contenedor propio (.cms-cq) hace que se reacomode
 * por el ancho del bloque y no por el de la página: una cuadrícula en un tercio
 * de la fila colapsa antes que una de ancho completo.
 */
function Cuadricula({ p, navegable }: { p: Props; navegable: boolean }) {
  const cantidad = opcionDe(texto(p.cantidad), ["3", "1", "2", "4", "6"] as const);
  const separacion = opcionDe(texto(p.separacion), ["media", "chica", "grande"] as const);
  const vertical = opcionDe(texto(p.vertical), ["inicio", "centro", "fin", "estirar"] as const);
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  const celdas = lista(p.items);
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      {celdas.length === 0 ? (
        <p className="cms-ayuda cms-r-vacio">La cuadrícula no tiene celdas todavía.</p>
      ) : (
        <div className="cms-cq">
          <div className={`cms-grid cms-grid--n${cantidad} cms-grid--g-${separacion} cms-grid--v-${vertical}${p.tarjeta === false ? "" : " cms-grid--tarjeta"}`}>
            {celdas.map((it, i) => {
              const icono = ICONOS_FRENTES[texto(it.icono)];
              return (
                <article className="cms-gcel" data-in key={i}>
                  {texto(it.imagen) ? (
                    <Imagen src={it.imagen} alt={it.alt} proporcion="16/9" />
                  ) : (
                    icono && (
                      <div className="cms-eje__icono">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d={icono} />
                        </svg>
                      </div>
                    )
                  )}
                  {texto(it.titulo) && <h3 className="cms-gcel__titulo">{texto(it.titulo)}</h3>}
                  {texto(it.texto) && <div className="cms-gcel__texto">{parrafos(texto(it.texto))}</div>}
                  {texto(it.boton) && <Boton clase="cms-boton cms-boton--solido cms-gcel__boton" etiqueta={texto(it.boton)} destino={it.destino} navegable={navegable} />}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Una cifra. Con `animar` (solo en la página pública) cuenta desde cero cuando
 * llega a la pantalla; sin eso, con movimiento reducido o si el valor no es un
 * número, se ve el valor escrito. Al terminar siempre queda el texto exacto.
 */
function Contador({ valor, animar }: { valor: string; animar: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const cifra = leerCifra(valor);
    if (!animar || !el || !cifra || reduced() || typeof IntersectionObserver === "undefined") return;
    const formato = new Intl.NumberFormat("es-CO", { minimumFractionDigits: cifra.decimales, maximumFractionDigits: cifra.decimales });
    let giro: gsap.core.Tween | null = null;
    el.textContent = formato.format(0);
    const mira = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        mira.disconnect();
        const o = { v: 0 };
        giro = gsap.to(o, {
          v: cifra.n,
          duration: 1.6,
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = formato.format(o.v);
          },
          onComplete: () => {
            el.textContent = valor;
          },
        });
      },
      { threshold: 0.4 },
    );
    mira.observe(el);
    return () => {
      mira.disconnect();
      giro?.kill();
      el.textContent = valor;
    };
  }, [valor, animar]);
  return <span ref={ref}>{valor}</span>;
}

/** Cifras grandes con su etiqueta, en 2, 3 o 4 columnas que colapsan por el ancho del bloque. */
function Cifras({ p, navegable }: { p: Props; navegable: boolean }) {
  const columnas = opcionDe(texto(p.columnas), ["3", "2", "4"] as const);
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  const filas = lista(p.items);
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      {filas.length === 0 ? (
        <p className="cms-ayuda cms-r-vacio">Todavía no hay cifras.</p>
      ) : (
        <div className="cms-cq">
          <ul className={`cms-cifras cms-cifras--n${columnas}`}>
            {filas.map((it, i) => (
              <li className="cms-cifra" data-in key={i}>
                <b className="cms-cifra__valor">
                  {texto(it.prefijo) && <span className="cms-cifra__afijo">{texto(it.prefijo)}</span>}
                  <Contador valor={texto(it.valor)} animar={navegable && p.conteo === true} />
                  {texto(it.sufijo) && <span className="cms-cifra__afijo">{texto(it.sufijo)}</span>}
                </b>
                {texto(it.etiqueta) && <span className="cms-cifra__etiqueta">{texto(it.etiqueta)}</span>}
                {texto(it.nota) && <small className="cms-cifra__nota">{texto(it.nota)}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.ilustrativo === true && (
        <p className="cms-nota">
          <i aria-hidden="true" />
          Dato ilustrativo: cifras de muestra.
        </p>
      )}
    </div>
  );
}

/** Imagen junto a texto: a un lado u otro, con hasta dos botones. En un bloque angosto se apilan, con la imagen primero. */
function ImagenTexto({ p, navegable }: { p: Props; navegable: boolean }) {
  const lado = opcionDe(texto(p.lado), ["izquierda", "derecha"] as const);
  const vertical = opcionDe(texto(p.vertical), ["centro", "inicio", "fin"] as const);
  // «lado» es la disposición de siempre; las páginas guardadas antes de existir «centrada» no traen el campo.
  const centrada = texto(p.disposicion) === "centrada";
  return (
    <div className="cms-wrap">
      <div className="cms-cq">
        <div className={`cms-it cms-it--${lado} cms-it--v-${vertical}${centrada ? " cms-it--centrada" : ""}`}>
          <div className="cms-it__arte" data-in>
            <Imagen src={p.imagen} alt={p.alt} proporcion={p.proporcion} />
          </div>
          <div className="cms-it__cuerpo">
            {texto(p.antetitulo) && <p className="cms-eyebrow" data-in>{texto(p.antetitulo)}</p>}
            {texto(p.titulo) && <h2 className="cms-h2" data-in>{texto(p.titulo)}</h2>}
            {texto(p.texto) && <div className="cms-it__texto" data-in>{parrafos(texto(p.texto))}</div>}
            {(texto(p.boton1) || texto(p.boton2)) && (
              <div className="cms-cta" data-in>
                {texto(p.boton1) && <Boton clase="cms-boton cms-boton--solido" etiqueta={texto(p.boton1)} destino={p.destino1} navegable={navegable} />}
                {texto(p.boton2) && <Boton clase="cms-boton cms-boton--contorno" etiqueta={texto(p.boton2)} destino={p.destino2} navegable={navegable} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Cita destacada: la frase, y debajo su autor con cargo y foto opcional. */
function CitaDestacada({ p }: { p: Props }) {
  const foto = texto(p.imagen);
  const autor = texto(p.autor);
  const cargo = texto(p.cargo);
  return (
    <figure className="cms-wrap cms-citad" data-in>
      <blockquote className="cms-citad__texto">
        <p>{texto(p.texto)}</p>
      </blockquote>
      {(autor || cargo || foto) && (
        <figcaption className="cms-citad__autor">
          {foto && (
            <span className="cms-citad__foto">
              <Imagen src={foto} alt={p.alt} proporcion="1/1" />
            </span>
          )}
          <span>
            {autor && <b>{autor}</b>}
            {cargo && <span>{cargo}</span>}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/* --- Personas, tiempo y contacto: línea de tiempo, equipo, testimonios, pestañas, banner, mapa ---- */

/** Un valor que se puede copiar con un clic (teléfono, correo). Sigue siendo texto: se selecciona y se lee como cualquier otro. */
function Copiable({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const id = window.setTimeout(() => setCopiado(false), 1800);
    return () => window.clearTimeout(id);
  }, [copiado]);
  const copiar = () => {
    // Sin permiso del portapapeles (o sin https) simplemente no pasa nada: el texto sigue ahí para copiarlo a mano.
    const r = navigator.clipboard?.writeText(valor);
    r?.then(() => setCopiado(true), () => undefined);
  };
  return (
    <span className="cms-copia">
      <span className="cms-copia__valor">{valor}</span>
      <button type="button" className="cms-copia__boton" onClick={copiar} aria-label={`Copiar ${etiqueta}: ${valor}`}>
        <IconoCms name="copiar" size={14} />
      </button>
      {copiado && (
        <span className="cms-copia__ok" aria-hidden="true">
          Copiado
        </span>
      )}
      <span className="sr-only" role="status">
        {copiado ? `${etiqueta} copiado` : ""}
      </span>
    </span>
  );
}

/** La foto de una persona, redonda o cuadrada. Con `iniciales`, sin foto se dibujan sus iniciales; si no, nada. */
function Avatar({ src, nombre, forma, iniciales = false }: { src: unknown; nombre: string; forma: "redonda" | "cuadrada"; iniciales?: boolean }) {
  const hay = Boolean(texto(src));
  if (!hay && !iniciales) return null;
  return (
    <span className={`cms-avatar cms-avatar--${forma}`}>
      {hay ? (
        <Imagen src={src} alt="" proporcion="1/1" />
      ) : (
        <span className="cms-avatar__ini" aria-hidden="true">
          {initialsOf(nombre)}
        </span>
      )}
    </span>
  );
}

/** Línea de tiempo: hitos con fecha. Vertical (alternada en un marco ancho, una columna en uno angosto) u horizontal desplazable. */
function LineaTiempo({ p }: { p: Props }) {
  const orientacion = opcionDe(texto(p.orientacion), ["vertical", "horizontal"] as const);
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  const hitos = lista(p.items);
  const hito = (it: Props, i: number) => (
    <li className="cms-lt__hito" data-in key={i}>
      {texto(it.fecha) && <span className="cms-lt__fecha">{texto(it.fecha)}</span>}
      {texto(it.titulo) && <h3 className="cms-lt__titulo">{texto(it.titulo)}</h3>}
      {texto(it.texto) && <div className="cms-lt__texto">{parrafos(texto(it.texto))}</div>}
      {texto(it.imagen) && (
        <div className="cms-lt__imagen">
          <Imagen src={it.imagen} alt={it.alt} proporcion="16/9" />
        </div>
      )}
    </li>
  );
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      {hitos.length === 0 ? (
        <p className="cms-ayuda cms-r-vacio">La línea de tiempo no tiene hitos todavía.</p>
      ) : (
        <div className="cms-cq">
          {orientacion === "horizontal" ? (
            // Región con nombre y foco: así quien usa teclado puede desplazarla con las flechas.
            <ol className="cms-lt cms-lt--horizontal" role="region" aria-label={texto(p.titulo) || "Línea de tiempo"} tabIndex={0}>
              {hitos.map(hito)}
            </ol>
          ) : (
            <ol className="cms-lt cms-lt--vertical">{hitos.map(hito)}</ol>
          )}
        </div>
      )}
    </div>
  );
}

/** Equipo: personas en 2, 3 o 4 por fila. El correo es texto copiable, no un enlace mailto. */
function Equipo({ p, navegable }: { p: Props; navegable: boolean }) {
  const columnas = opcionDe(texto(p.columnas), ["3", "2", "4"] as const);
  const forma = opcionDe(texto(p.foto), ["redonda", "cuadrada"] as const);
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  const personas = lista(p.items);
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      {personas.length === 0 ? (
        <p className="cms-ayuda cms-r-vacio">El equipo no tiene personas todavía.</p>
      ) : (
        <div className="cms-cq">
          <ul className={`cms-equipo cms-equipo--n${columnas}`}>
            {personas.map((it, i) => (
              <li className="cms-persona" data-in key={i}>
                <span className={`cms-persona__foto cms-persona__foto--${forma}`}>
                  <Avatar src={it.imagen} nombre={texto(it.nombre)} forma={forma} iniciales />
                </span>
                {texto(it.nombre) && <h3 className="cms-persona__nombre">{texto(it.nombre)}</h3>}
                {texto(it.cargo) && <p className="cms-persona__cargo">{texto(it.cargo)}</p>}
                {texto(it.correo) && <Copiable valor={texto(it.correo)} etiqueta="correo" />}
                {destinoSeguro(it.enlace) && (
                  <Boton clase="cms-persona__enlace" etiqueta="Ver perfil" destino={it.enlace} navegable={navegable} icono={<Icon name="arrow-right" size={15} />} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Una cita con su autor, dentro de la cuadrícula o del carrusel de testimonios. */
function Testimonio({ it }: { it: Props }) {
  const nombre = texto(it.nombre);
  const cargo = texto(it.cargo);
  return (
    <figure className="cms-test">
      <blockquote className="cms-test__texto">
        <p>{texto(it.texto)}</p>
      </blockquote>
      {(nombre || cargo || texto(it.imagen)) && (
        <figcaption className="cms-test__autor">
          <Avatar src={it.imagen} nombre={nombre} forma="redonda" />
          <span>
            {nombre && <b>{nombre}</b>}
            {cargo && <span>{cargo}</span>}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/** Testimonios en cuadrícula o en carrusel sencillo: una cita a la vez, sin pasar sola, con flechas, puntos y teclado. */
function Testimonios({ p }: { p: Props }) {
  const modo = opcionDe(texto(p.modo), ["cuadricula", "carrusel"] as const);
  const citas = lista(p.items).filter((it) => texto(it.texto));
  const total = citas.length;
  const [actual, setActual] = useState(0);
  const indice = total === 0 ? 0 : Math.min(actual, total - 1);
  const ir = (i: number) => setActual(((i % total) + total) % total);
  // Las flechas del teclado funcionan desde cualquier botón del carrusel.
  const alTeclado = (e: KeyboardEvent<HTMLElement>) => {
    if (total < 2) return;
    if (e.key === "ArrowLeft") ir(indice - 1);
    else if (e.key === "ArrowRight") ir(indice + 1);
    else return;
    e.preventDefault();
  };
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      {total === 0 ? (
        <p className="cms-ayuda cms-r-vacio">Todavía no hay testimonios.</p>
      ) : modo === "cuadricula" || total === 1 ? (
        <ul className="cms-tests">
          {citas.map((it, i) => (
            <li data-in key={i}>
              <Testimonio it={it} />
            </li>
          ))}
        </ul>
      ) : (
        <section className="cms-testc" aria-roledescription="carrusel" aria-label={texto(p.titulo) || "Testimonios"} onKeyDown={alTeclado} data-in>
          <div className="cms-testc__ventana">
            <div className="cms-testc__pista" aria-live="polite" style={{ transform: `translateX(-${indice * 100}%)` }}>
              {citas.map((it, i) => (
                <div className="cms-testc__lamina" key={i} role="group" aria-roledescription="diapositiva" aria-label={`${i + 1} de ${total}`} aria-hidden={i !== indice || undefined}>
                  <Testimonio it={it} />
                </div>
              ))}
            </div>
          </div>
          <div className="cms-testc__ctl">
            <button type="button" className="cms-testc__flecha" aria-label="Testimonio anterior" onClick={() => ir(indice - 1)}>
              <Icon name="arrow-left" size={18} />
            </button>
            <div className="cms-testc__puntos">
              {citas.map((_, i) => (
                <button key={i} type="button" aria-label={`Ir al testimonio ${i + 1}`} aria-current={i === indice || undefined} onClick={() => ir(i)} />
              ))}
            </div>
            <button type="button" className="cms-testc__flecha" aria-label="Testimonio siguiente" onClick={() => ir(indice + 1)}>
              <Icon name="arrow-right" size={18} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Pestañas con el patrón ARIA tablist / tab / tabpanel: una sola pestaña en el orden
 * del teclado (tabindex móvil), flechas izquierda y derecha, Inicio y Fin para recorrerlas,
 * y el panel visible es el de la pestaña elegida. La inicial la fija el campo «inicial».
 */
function BloquePestanas({ p, navegable }: { p: Props; navegable: boolean }) {
  const base = useId();
  const paneles = lista(p.items).filter((it) => texto(it.pestana) || texto(it.titulo));
  const total = paneles.length;
  const inicial = Math.min(Math.max(total - 1, 0), Math.max(0, Math.round(Number(p.inicial)) - 1 || 0));
  const [elegida, setElegida] = useState<number | null>(null);
  // Si quien edita cambia la pestaña inicial, se ve de inmediato.
  useEffect(() => setElegida(null), [inicial]);
  const activa = Math.min(Math.max(total - 1, 0), elegida ?? inicial);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const alTeclado = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let j: number;
    if (e.key === "ArrowRight") j = (i + 1) % total;
    else if (e.key === "ArrowLeft") j = (i - 1 + total) % total;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = total - 1;
    else return;
    e.preventDefault();
    setElegida(j);
    botones.current[j]?.focus();
  };
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      {total === 0 ? (
        <p className="cms-ayuda cms-r-vacio">Todavía no hay pestañas.</p>
      ) : (
        <div className="cms-pestanas" data-in>
          <div className="cms-pestanas__lista" role="tablist" aria-label={texto(p.titulo) || "Contenido por pestañas"}>
            {paneles.map((it, i) => (
              <button
                key={i}
                ref={(el) => {
                  botones.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-t${i}`}
                aria-selected={i === activa}
                aria-controls={`${base}-p${i}`}
                tabIndex={i === activa ? 0 : -1}
                className="cms-pestanas__tab"
                onClick={() => setElegida(i)}
                onKeyDown={(e) => alTeclado(e, i)}
              >
                {texto(it.pestana) || texto(it.titulo)}
              </button>
            ))}
          </div>
          {paneles.map((it, i) => {
            const imagen = texto(it.imagen);
            return (
              <div key={i} role="tabpanel" id={`${base}-p${i}`} aria-labelledby={`${base}-t${i}`} tabIndex={0} hidden={i !== activa} className="cms-pestanas__panel">
                <div className="cms-cq">
                  <div className={imagen ? "cms-it cms-it--izquierda cms-it--v-inicio" : undefined}>
                    {imagen && (
                      <div className="cms-it__arte">
                        <Imagen src={imagen} alt={it.alt} proporcion="4/3" />
                      </div>
                    )}
                    <div className="cms-it__cuerpo">
                      {texto(it.titulo) && <h3 className="cms-col__titulo">{texto(it.titulo)}</h3>}
                      {texto(it.texto) && <div className="cms-it__texto">{parrafos(texto(it.texto))}</div>}
                      {texto(it.boton) && <Boton clase="cms-boton cms-boton--solido" etiqueta={texto(it.boton)} destino={it.destino} navegable={navegable} />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Banner de ancho completo. La imagen va debajo de un velo del color marino con opacidad
 * entre 65 y 90 %: con 65 % hasta una foto totalmente blanca deja el texto blanco sobre
 * 4,6:1 de contraste. El texto es siempre claro, nunca depende de la foto, y sin imagen
 * el fondo es el mismo marino.
 */
function Banner({ p, navegable }: { p: Props; navegable: boolean }) {
  const altura = opcionDe(texto(p.altura), ["media", "baja", "alta"] as const);
  const alineacion = opcionDe(texto(p.alineacion), ["izquierda", "centro", "derecha"] as const);
  const velo = Math.min(90, Math.max(65, Number(p.velo) || 72));
  const imagen = officePhotoUrl(texto(p.imagen));
  return (
    <section className={`cms-banner cms-banner--${altura} cms-banner--${alineacion}`}>
      {imagen && <img className="cms-banner__img" src={imagen} alt="" loading="lazy" decoding="async" />}
      <div className="cms-banner__velo" style={{ opacity: velo / 100 }} aria-hidden="true" />
      <div className="cms-wrap cms-banner__cuerpo">
        {texto(p.titulo) && <h2 className="cms-h2" data-in>{texto(p.titulo)}</h2>}
        {texto(p.texto) && <p className="cms-lede" data-in>{texto(p.texto)}</p>}
        {(texto(p.boton1) || texto(p.boton2)) && (
          <div className="cms-cta" data-in>
            {texto(p.boton1) && <Boton clase="cms-boton cms-boton--claro" etiqueta={texto(p.boton1)} destino={p.destino1} navegable={navegable} />}
            {texto(p.boton2) && <Boton clase="cms-boton cms-boton--contorno" etiqueta={texto(p.boton2)} destino={p.destino2} navegable={navegable} />}
          </div>
        )}
      </div>
    </section>
  );
}

/** Contacto junto a un mapa de OpenStreetMap (solo su marco de incrustación, sin claves). Teléfono y correo, copiables. */
function ContactoMapa({ p, navegable }: { p: Props; navegable: boolean }) {
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  const mapa = mapaOsm(p.latitud, p.longitud, p.zoom);
  const direccion = texto(p.direccion);
  const filas: { clave: string; rotulo: string; valor: ReactNode }[] = [];
  if (direccion.trim()) filas.push({ clave: "dir", rotulo: "Dirección", valor: parrafos(direccion) });
  if (texto(p.telefono)) filas.push({ clave: "tel", rotulo: "Teléfono", valor: <Copiable valor={texto(p.telefono)} etiqueta="teléfono" /> });
  if (texto(p.correo)) filas.push({ clave: "cor", rotulo: "Correo", valor: <Copiable valor={texto(p.correo)} etiqueta="correo" /> });
  if (texto(p.horario).trim()) filas.push({ clave: "hor", rotulo: "Horario", valor: parrafos(texto(p.horario)) });
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      <div className="cms-cq">
        <div className={`cms-cm${mapa ? "" : " cms-cm--sin-mapa"}`}>
          <dl className="cms-cm__datos" data-in>
            {filas.map((f) => (
              <div className="cms-cm__fila" key={f.clave}>
                <dt>{f.rotulo}</dt>
                <dd>{f.valor}</dd>
              </div>
            ))}
          </dl>
          {mapa ? (
            <div className="cms-cm__mapa" data-in>
              <iframe
                className={navegable ? undefined : "cms-cm__marco--inerte"}
                src={mapa.incrustado}
                title={`Mapa de ubicación${direccion.trim() ? `: ${direccion.split("\n")[0]?.trim()}` : ""}`}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              />
              {navegable && (
                <a className="cms-cm__grande" href={mapa.enlace} target="_blank" rel="noopener noreferrer">
                  Ver el mapa más grande
                </a>
              )}
            </div>
          ) : (
            !navegable && <p className="cms-ayuda cms-r-vacio">Escriba una latitud entre -90 y 90 y una longitud entre -180 y 180 para mostrar el mapa.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Dos o tres columnas con proporciones elegibles. En un marco angosto pasan a una sola, en el mismo orden. */
function ColumnasDesiguales({ p, navegable }: { p: Props; navegable: boolean }) {
  const clave = PROPORCIONES_COLUMNAS[texto(p.proporcion)] ? texto(p.proporcion) : "60-40";
  const partes = PROPORCIONES_COLUMNAS[clave]!.partes;
  const columnas = lista(p.items).slice(0, partes.length);
  const conCabecera = texto(p.antetitulo) || texto(p.titulo) || texto(p.texto);
  return (
    <div className="cms-wrap">
      {conCabecera && <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />}
      <div className="cms-cq">
        <div className="cms-dc" style={{ "--cms-fr": partes.map((n) => `minmax(0, ${n}fr)`).join(" ") } as CSSProperties}>
          {columnas.map((it, i) => (
            <article className="cms-dc__col" data-in key={i}>
              {texto(it.imagen) && <Imagen src={it.imagen} alt={it.alt} proporcion="16/9" />}
              {texto(it.titulo) && <h3 className="cms-col__titulo">{texto(it.titulo)}</h3>}
              {texto(it.texto) && <div className="cms-col__texto">{parrafos(texto(it.texto))}</div>}
              {texto(it.boton) && <Boton clase="cms-boton cms-boton--solido cms-dc__boton" etiqueta={texto(it.boton)} destino={it.destino} navegable={navegable} />}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --- HTML personalizado: aislado en un marco, nunca dentro de la página ------------------------ */

/**
 * El código va en un iframe con sandbox «allow-scripts allow-popups allow-forms»
 * y SIN allow-same-origin: el marco tiene origen opaco, así que no alcanza las
 * cookies, el localStorage ni la sesión de Supabase de la intranet, ni el DOM de
 * esta página. El script inyectado avisa la altura por postMessage; el mensaje se
 * acepta solo si viene de la ventana de este marco, con origen «null» (el opaco)
 * y con la marca de esta instancia.
 */
function BloqueHtml({ p, navegable }: { p: Props; navegable: boolean }) {
  const marco = useRef<HTMLIFrameElement>(null);
  const token = useId().replace(/\W/g, "");
  const minimo = Math.min(ALTO_HTML.max, Math.max(ALTO_HTML.min, Number(p.alto) || ALTO_HTML.defecto));
  const ajustar = p.ajustar !== false;
  const [alto, setAlto] = useState(0);
  const html = texto(p.html);
  const css = texto(p.css);
  const js = texto(p.js);
  const documento = useMemo(() => documentoHtml({ html, css, js, token, ajustar }), [html, css, js, token, ajustar]);

  useEffect(() => {
    if (!ajustar) return;
    const recibir = (e: MessageEvent) => {
      if (e.source !== marco.current?.contentWindow || e.origin !== "null") return;
      const d: unknown = e.data;
      if (typeof d !== "object" || d === null) return;
      const { cmsHtml, alto: medida } = d as { cmsHtml?: unknown; alto?: unknown };
      if (cmsHtml !== token || typeof medida !== "number" || !Number.isFinite(medida)) return;
      setAlto(Math.min(ALTO_HTML.tope, Math.max(0, Math.ceil(medida))));
    };
    window.addEventListener("message", recibir);
    return () => window.removeEventListener("message", recibir);
  }, [ajustar, token]);

  if (!html.trim() && !css.trim() && !js.trim()) {
    return <p className="cms-ayuda cms-r-vacio">El bloque HTML no tiene código todavía.</p>;
  }
  return (
    <div className="cms-wrap">
      <iframe
        ref={marco}
        className={`cms-htmlframe${navegable ? "" : " cms-htmlframe--inerte"}`}
        title={texto(p.titulo) || "Contenido incrustado"}
        sandbox="allow-scripts allow-popups allow-forms"
        referrerPolicy="no-referrer"
        loading="lazy"
        srcDoc={documento}
        style={{ height: ajustar ? Math.max(minimo, alto) : minimo }}
      />
    </div>
  );
}

/* --- Bloques vivos: componentes reales del portal, sin copiar su contenido --------------------- */

/** Tablero de indicadores de UDES Sostenible. Solo su encabezado es texto editable. */
function IndicadoresVivo({ p }: { p: Props }) {
  return (
    <div className="sos cms-vivo" style={{ "--sos-accent": "var(--pillar-2)" } as CSSProperties}>
      <div className="cms-wrap">
        <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />
        <IndicatorBoard keys={ALL_INDICATORS} nuevos />
      </div>
    </div>
  );
}

/** Las gráficas publicadas desde Datos de Sostenibilidad, por sección del Observatorio (todas si no se elige una). */
function GraficasSostenibilidad({ p }: { p: Props }) {
  const seccion = texto(p.seccion) as SeccionSos | "";
  return (
    <div className="sos cms-vivo" style={{ "--sos-accent": "var(--pillar-2)" } as CSSProperties}>
      <div className="cms-wrap">
        <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />
        <GraficasSostenibles seccion={seccion} />
      </div>
    </div>
  );
}

/* --- Columnas con contenido: un contenedor con otros bloques dentro de sus columnas ------------- */

/** Lo que el lienzo del editor le presta al contenedor para que sus columnas y sus hijos se puedan editar. */
export interface EdicionHijo {
  className: string;
  atributos: HTMLAttributes<HTMLDivElement> & { "data-id"?: string };
  /** Etiqueta y barra de acciones del hijo elegido. */
  barra: ReactNode;
}
export interface EdicionContenedores {
  seleccion: string | null;
  celdaHijo(d: { contenedor: string; columna: number; columnas: number; indice: number; total: number; hijo: HijoContenedor }): EdicionHijo;
  /** Clase y atributos (arrastrar y soltar) de la columna como zona de suelta. */
  zona(contenedor: string, columna: number, columnas: number, total: number): { className: string; atributos: HTMLAttributes<HTMLDivElement> };
  agregar(contenedor: string, columna: number, indice: number, tipo: string): void;
  /** Disparo de la entrada animada de un hijo (por su id compuesto). */
  disparo(id: string): string;
}
/** Solo el lienzo en modo edición lo provee; la vista previa y la página pública dibujan sin él. */
export const EdicionCtx = createContext<EdicionContenedores | null>(null);

function CeldaHijo({
  contenedor,
  columna,
  columnas,
  indice,
  total,
  hijo,
  navegable,
  disparo,
  auto,
  ocultos,
}: {
  contenedor: string | undefined;
  columna: number;
  columnas: number;
  indice: number;
  total: number;
  hijo: HijoContenedor;
  navegable: boolean;
  disparo: string;
  auto: boolean;
  ocultos: boolean;
}) {
  const ed = useContext(EdicionCtx);
  const id = idHijo(contenedor ?? "", hijo.id);
  const bloque: BloqueRender = { id, tipo: hijo.tipo, ancho: 12, props: hijo.props };
  const e = ed && contenedor ? ed.celdaHijo({ contenedor, columna, columnas, indice, total, hijo }) : null;
  return (
    <CeldaBloque bloque={bloque} anidado className={e?.className} {...e?.atributos}>
      {e?.barra}
      <BloqueVista bloque={bloque} disparo={ed && contenedor ? ed.disparo(id) : disparo} auto={auto} navegable={navegable} incluirOcultos={ocultos} />
    </CeldaBloque>
  );
}

function ColumnaContenedor({
  contenedor,
  columna,
  columnas,
  hijos,
  navegable,
  disparo,
  auto,
  ocultos,
}: {
  contenedor: string | undefined;
  columna: number;
  columnas: number;
  hijos: HijoContenedor[];
  navegable: boolean;
  disparo: string;
  auto: boolean;
  ocultos: boolean;
}) {
  const ed = useContext(EdicionCtx);
  const [eligiendo, setEligiendo] = useState(false);
  const edita = Boolean(ed && contenedor);
  // En el editor se ven todos (los ocultos, atenuados); en la página, solo los visibles.
  const visibles = edita || ocultos ? hijos : hijos.filter((h) => !ocultoDe(h.props));
  const zona = edita ? ed!.zona(contenedor!, columna, columnas, visibles.length) : null;
  // «+ Agregar bloque» sale cuando la columna está vacía o cuando el contenedor (o uno de sus hijos) está elegido.
  const elegido = edita && ed!.seleccion !== null && (ed!.seleccion === contenedor || ed!.seleccion.startsWith(`${contenedor}/`));
  return (
    <div
      className={`cms-cont__col${zona?.className ? ` ${zona.className}` : ""}`}
      role={edita ? "group" : undefined}
      aria-label={edita ? `Columna ${columna + 1} de ${columnas}${visibles.length === 0 ? ", vacía" : `, ${visibles.length} ${visibles.length === 1 ? "bloque" : "bloques"}`}` : undefined}
      {...zona?.atributos}
    >
      {visibles.map((h, j) => (
        <CeldaHijo key={h.id} contenedor={contenedor} columna={columna} columnas={columnas} indice={j} total={visibles.length} hijo={h} navegable={navegable} disparo={disparo} auto={auto} ocultos={ocultos} />
      ))}
      {edita && eligiendo && (
        <SelectorBloque
          onElegir={(tipo) => {
            setEligiendo(false);
            ed!.agregar(contenedor!, columna, visibles.length, tipo);
          }}
          onCerrar={() => setEligiendo(false)}
        />
      )}
      {edita && !eligiendo && visibles.length === 0 && (
        <div className="cms-cont__vacia">
          <p>Suelte aquí un bloque</p>
          <button type="button" className="cms-btn cms-btn--chico" onClick={() => setEligiendo(true)}>
            <Icon name="plus" size={14} />
            Agregar bloque
          </button>
        </div>
      )}
      {edita && !eligiendo && visibles.length > 0 && elegido && (
        <button type="button" className="cms-cont__mas" onClick={() => setEligiendo(true)}>
          <Icon name="plus" size={14} />
          Agregar bloque
        </button>
      )}
    </div>
  );
}

/**
 * Columnas con contenido. La cuadrícula responde al ancho del propio bloque (container query
 * «cms-cont», no a la ventana): con 900 px o más, las columnas elegidas; entre 600 y 899, dos
 * (tres si eran seis; con dos columnas se conserva la proporción); por debajo de 600, una sola,
 * en el orden de lectura. Cada columna es además un contenedor, así que lo que va dentro se
 * reacomoda por el ancho de su columna.
 */
function Contenedor({ id, p, navegable, disparo, auto, ocultos }: { id: string | undefined; p: Props; navegable: boolean; disparo: string; auto: boolean; ocultos: boolean }) {
  const c = useMemo(() => contenedorDe(p), [p]);
  const partes = c.proporcion !== "iguales" ? PROPORCIONES_COLUMNAS[c.proporcion]!.partes : null;
  const plantilla = partes ? partes.map((n) => `minmax(0, ${n}fr)`).join(" ") : `repeat(${c.columnas}, minmax(0, 1fr))`;
  return (
    <div className="cms-wrap">
      <div className="cms-cont-cq">
        <div className={`cms-cont cms-cont--n${c.columnas} cms-cont--g-${c.separacion} cms-cont--v-${c.vertical}`} style={{ "--cms-fr": plantilla } as CSSProperties}>
          {c.items.map((col, i) => (
            <ColumnaContenedor key={col.id} contenedor={id} columna={i} columnas={c.columnas} hijos={col.bloques} navegable={navegable} disparo={disparo} auto={auto} ocultos={ocultos} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* --- Un bloque -------------------------------------------------------------------------------- */

function Contenido({ bloque, navegable, disparo = "", auto = true, ocultos = false }: { bloque: BloqueRender; navegable: boolean; disparo?: string; auto?: boolean; ocultos?: boolean }): ReactNode {
  const p = bloque.props;
  switch (bloque.tipo) {
    case "hero": {
      const claro = texto(p.tono) === "claro";
      const foto = !claro && texto(p.imagen) === "ladera";
      const rueda = p.rueda === true;
      const botonPrincipal = claro ? "cms-boton cms-boton--solido" : "cms-boton cms-boton--claro";
      return (
        <section className={`cms-hero ${claro ? "cms-hero--claro" : "cms-hero--oscuro"}`}>
          {foto && <div className="cms-hero__foto cms-arte" role="img" aria-label="Ladera con el letrero UDES Verde" />}
          {foto && <div className="cms-hero__velo" aria-hidden="true" />}
          <div className={`cms-wrap cms-hero__grid${rueda ? " cms-hero__grid--rueda" : ""}`}>
            <div>
              {texto(p.antetitulo) && <p className="cms-eyebrow" data-in>{texto(p.antetitulo)}</p>}
              <h2 className="cms-h1">
                <Palabras titulo={texto(p.titulo)} enfasis={texto(p.enfasis)} />
              </h2>
              {texto(p.texto) && <p className="cms-lede" data-in>{texto(p.texto)}</p>}
              {(texto(p.boton1) || texto(p.boton2)) && (
                <div className="cms-cta" data-in>
                  {texto(p.boton1) && <Boton clase={botonPrincipal} etiqueta={texto(p.boton1)} destino={p.destino1} navegable={navegable} />}
                  {texto(p.boton2) && <Boton clase="cms-boton cms-boton--contorno" etiqueta={texto(p.boton2)} destino={p.destino2} navegable={navegable} />}
                </div>
              )}
              {p.buscador === true && (
                <EnvolturaPlaneacion>
                  <SiteSearch />
                </EnvolturaPlaneacion>
              )}
            </div>
            {rueda && <SdgWheel />}
          </div>
        </section>
      );
    }
    case "ods":
      return <CintaOds velocidad={Math.min(80, Math.max(10, Number(p.velocidad) || 34))} />;
    case "frentes":
      return (
        <div className="cms-wrap">
          <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />
          <div className="cms-ejes">
            {lista(p.items).map((it, i) => (
              <article className="cms-eje" data-in key={i}>
                <div className="cms-eje__icono">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={ICONOS_FRENTES[texto(it.icono)] ?? ICONOS_FRENTES.hoja} />
                  </svg>
                </div>
                <h3>{texto(it.nombre)}</h3>
                <p>{texto(it.texto)}</p>
              </article>
            ))}
          </div>
        </div>
      );
    case "texto":
      return (
        <div className="cms-wrap cms-texto">
          <div className="cms-texto__cuerpo" data-in>{parrafos(texto(p.texto))}</div>
          {texto(p.cita) && <blockquote className="cms-cita" data-in>{texto(p.cita)}</blockquote>}
        </div>
      );
    case "cta":
      return (
        <div className="cms-wrap cms-banda">
          <h2 className="cms-banda__frase" data-in>{texto(p.texto)}</h2>
          {texto(p.boton) && <Boton clase="cms-boton cms-boton--claro" etiqueta={texto(p.boton)} destino={p.destino} navegable={navegable} datoIn />}
        </div>
      );
    case "imagen":
      return <BloqueImagen p={p} navegable={navegable} />;
    case "carrusel":
      return <Carrusel p={p} navegable={navegable} />;
    case "columnas":
      return <Columnas p={p} navegable={navegable} />;
    case "video":
      return <BloqueVideo p={p} />;
    case "cuadricula":
      return <Cuadricula p={p} navegable={navegable} />;
    case "cifras":
      return <Cifras p={p} navegable={navegable} />;
    case "imagen-texto":
      return <ImagenTexto p={p} navegable={navegable} />;
    case "cita":
      return <CitaDestacada p={p} />;
    case "html":
      return <BloqueHtml p={p} navegable={navegable} />;
    case "linea-tiempo":
      return <LineaTiempo p={p} />;
    case "equipo":
      return <Equipo p={p} navegable={navegable} />;
    case "testimonios":
      return <Testimonios p={p} />;
    case "pestanas":
      return <BloquePestanas p={p} navegable={navegable} />;
    case "banner":
      return <Banner p={p} navegable={navegable} />;
    case "contacto-mapa":
      return <ContactoMapa p={p} navegable={navegable} />;
    case "columnas-desiguales":
      return <ColumnasDesiguales p={p} navegable={navegable} />;
    case "contenedor":
      return <Contenedor id={bloque.id} p={p} navegable={navegable} disparo={disparo} auto={auto} ocultos={ocultos} />;
    case "acordeon":
      return <Desplegables p={p} claveTitulo="titulo" claveTexto="texto" faq={false} navegable={navegable} />;
    case "preguntas":
      return <Desplegables p={p} claveTitulo="pregunta" claveTexto="respuesta" faq navegable={navegable} />;
    case "rankings":
      return <Rankings p={p} navegable={navegable} />;
    case "informes":
      return <Informes p={p} />;
    case "ticker":
      return <BarraContexto p={p} />;
    case "salto":
      return <Salto p={p} />;
    case "mosaico":
      return <MosaicoPortales titulo={texto(p.titulo)} texto={texto(p.texto)} />;
    case "cierre":
      return <Cierre p={p} navegable={navegable} />;
    case "indicadores":
      return <IndicadoresVivo p={p} />;
    case "graficas-sostenibles":
      return <GraficasSostenibilidad p={p} />;
    case "avance-plan":
      return <AvancePlan />;
    case "pilares-plan":
      return <PilaresPlan />;
    case "sdg-band":
      return <SdgBand />;
    case "campus-explorer":
      return <CampusExplorer />;
    case "route-finder":
      return <RouteFinder />;
    case "resource-room":
      return <ResourceRoom />;
    case "galeria-oficina":
      return <GaleriaOficina />;
    case "recientes":
      return <RecientesOficina />;
    case "equipo-oficina":
      return <EquipoOficina />;
    case "ranking-resultados":
    case "ranking-categorias":
    case "ranking-indicadores":
    case "ranking-ods":
    case "categoria-puntaje":
    case "categoria-indicadores":
    case "categoria-iniciativas":
      return <MicrositioVivo tipo={bloque.tipo} p={p} navegable={navegable} />;
    default:
      return (
        <div className="cms-wrap cms-r-desconocido">
          Bloque «{bloque.tipo}» sin diseño en el portal. Revise el registro de bloques.
        </div>
      );
  }
}

/** Dibuja un bloque y le aplica su entrada animada. */
export function BloqueVista({
  bloque,
  disparo = "",
  auto = true,
  navegable = false,
  incluirOcultos = false,
}: {
  bloque: BloqueRender;
  disparo?: string;
  auto?: boolean;
  /** Solo la página pública convierte los botones en enlaces. */
  navegable?: boolean;
  /** Los bloques ocultos dentro de unas columnas también se dibujan (el editor los atenúa por su cuenta). */
  incluirOcultos?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEntrada(ref, bloque.tipo, movimientoDe(bloque.tipo, bloque.props), disparo, auto);
  return (
    <div ref={ref} className="cms-bloque-vista">
      <Contenido bloque={bloque} navegable={navegable} disparo={disparo} auto={auto} ocultos={incluirOcultos} />
    </div>
  );
}

/**
 * La celda de un bloque en la cuadrícula de 12 columnas: su ancho y su fondo y
 * espacio. Los hijos (por ejemplo, la barra del editor) van dentro de la celda.
 */
export function CeldaBloque({
  bloque,
  className = "",
  anidado = false,
  children,
  ...resto
}: { bloque: BloqueRender; children?: ReactNode; /** Un hijo de unas columnas: ocupa su columna, no la cuadrícula de 12. */ anidado?: boolean } & HTMLAttributes<HTMLDivElement>) {
  const ancho = ANCHOS.includes(bloque.ancho) ? bloque.ancho : 12;
  // El estilo propio del bloque (clave `_diseno`): variables y clases que cms.css lee.
  const diseno = estiloDeBloque(bloque.props);
  return (
    <div
      className={`cms-celda${anidado ? " cms-celda--hijo" : ""} ${clasesEstilo(bloque, anidado)} ${diseno.clase} ${className}`.replace(/\s+/g, " ").trim()}
      style={anidado ? diseno.style : { gridColumn: `span ${ancho}`, ...diseno.style }}
      {...resto}
    >
      {children}
    </div>
  );
}

/**
 * Fuera de la página pública (lienzo, vista previa) nada navega: los vivos traen
 * enlaces reales del portal y un clic en ellos sacaría al editor de la pantalla.
 * Se atiende en la fase de captura para ganarle al manejador de `Link`.
 */
export function evitarNavegacion(e: MouseEvent<HTMLElement>) {
  if ((e.target as Element).closest("a[href]")) e.preventDefault();
}

/**
 * Los bloques de una página, como los verá el público. Los ocultos no salen
 * salvo que se pida lo contrario (la vista previa del editor lo usa así).
 */
export function RenderBloques({
  bloques,
  incluirOcultos = false,
  disparo,
  auto = true,
  navegable = false,
  estilo,
}: {
  bloques: BloqueRender[];
  incluirOcultos?: boolean;
  disparo?: string;
  auto?: boolean;
  navegable?: boolean;
  /** Estilo del sitio del portal; sin él, el aspecto de siempre. */
  estilo?: EstiloSitioParcial | null;
}) {
  const visibles = incluirOcultos ? bloques : bloques.filter((b) => !ocultoDe(b.props));
  const marco = estiloDeMarco(estilo);
  useFuentes(familiasUsadas(estilo, [...visibles, ...hijosPlanos(visibles)]));
  if (visibles.length === 0) return <p className="cms-r-vacio">Esta página todavía no tiene contenido.</p>;
  return (
    <div className={`cms-marco ${marco.clase}`.trim()} style={marco.style} onClickCapture={navegable ? undefined : evitarNavegacion}>
      <div className="cms-r-grid">
        {visibles.map((b, i) => (
          <CeldaBloque key={i} bloque={b}>
            <BloqueVista bloque={b} disparo={disparo} auto={auto} navegable={navegable} incluirOcultos={incluirOcultos} />
          </CeldaBloque>
        ))}
      </div>
    </div>
  );
}

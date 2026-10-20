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

import { Fragment, useRef, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Icon } from "../../../components/ui/Icon";
import { odsArt } from "../../sostenible/ods-data";
import { ALL_INDICATORS, LAST, YEARS } from "../../sostenible/data";
import { IndicatorBoard, SdgWheel, reduced } from "../../sostenible/widgets";
import { CampusExplorer } from "../../landing/CampusExplorer";
import { ResourceRoom } from "../../landing/ResourceRoom";
import { RouteFinder } from "../../landing/RouteFinder";
import { SdgBand } from "../../landing/SdgBand";
import { SiteSearch } from "../../planeacion/SiteSearch";
import { AvancePlan } from "./vivos/AvancePlan";
import { PilaresPlan } from "./vivos/PilaresPlan";
import { EnvolturaPlaneacion, EquipoOficina, GaleriaOficina, MosaicoPortales, RecientesOficina } from "./vivos/OficinaPlaneacion";
import { MicrositioVivo } from "./vivos/RankingSecciones";
import { ANCHOS, destinoSeguro, estiloDe, movimientoDe, ocultoDe } from "./logica";
import { definicion } from "./bloques";
import type { Ancho, Movimiento, Props } from "./tipos";
// Estilos del tablero de indicadores (IndicatorBoard). Están acotados al contenedor .sos.
import "../../sostenible/sostenible.css";

/** Un bloque tal como se dibuja: sin ids ni fechas. */
export interface BloqueRender {
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
export function clasesEstilo(bloque: BloqueRender): string {
  const def = definicion(bloque.tipo);
  const { fondo, espacio } = estiloDe(bloque.props);
  const partes: string[] = [];
  if (bloque.tipo === "hero") partes.push(texto(bloque.props.tono) === "claro" ? "cms-fondo-claro" : "cms-fondo-marino");
  else if (!def?.sinFondo) partes.push(`cms-fondo-${fondo}`);
  if (bloque.tipo !== "ods") partes.push(`cms-espacio-${espacio}`);
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

/* --- Bloques vivos: componentes reales del portal, sin copiar su contenido --------------------- */

/** Tablero de indicadores de UDES Sostenible. Solo su encabezado es texto editable. */
function IndicadoresVivo({ p }: { p: Props }) {
  return (
    <div className="sos cms-vivo" style={{ "--sos-accent": "var(--pillar-2)" } as CSSProperties}>
      <div className="cms-wrap">
        <Cabecera antetitulo={texto(p.antetitulo)} titulo={texto(p.titulo)} texto={texto(p.texto)} />
        <IndicatorBoard keys={ALL_INDICATORS} />
      </div>
    </div>
  );
}

/* --- Un bloque -------------------------------------------------------------------------------- */

function Contenido({ bloque, navegable }: { bloque: BloqueRender; navegable: boolean }): ReactNode {
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
}: {
  bloque: BloqueRender;
  disparo?: string;
  auto?: boolean;
  /** Solo la página pública convierte los botones en enlaces. */
  navegable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEntrada(ref, bloque.tipo, movimientoDe(bloque.tipo, bloque.props), disparo, auto);
  return (
    <div ref={ref} className="cms-bloque-vista">
      <Contenido bloque={bloque} navegable={navegable} />
    </div>
  );
}

/**
 * La celda de un bloque en la cuadrícula de 12 columnas: su ancho y su fondo y
 * espacio. Los hijos (por ejemplo, la barra del editor) van dentro de la celda.
 */
export function CeldaBloque({ bloque, className = "", children, ...resto }: { bloque: BloqueRender; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const ancho = ANCHOS.includes(bloque.ancho) ? bloque.ancho : 12;
  return (
    <div className={`cms-celda ${clasesEstilo(bloque)} ${className}`.trim()} style={{ gridColumn: `span ${ancho}` }} {...resto}>
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
}: {
  bloques: BloqueRender[];
  incluirOcultos?: boolean;
  disparo?: string;
  auto?: boolean;
  navegable?: boolean;
}) {
  const visibles = incluirOcultos ? bloques : bloques.filter((b) => !ocultoDe(b.props));
  if (visibles.length === 0) return <p className="cms-r-vacio">Esta página todavía no tiene contenido.</p>;
  return (
    <div className="cms-marco" onClickCapture={navegable ? undefined : evitarNavegacion}>
      <div className="cms-r-grid">
        {visibles.map((b, i) => (
          <CeldaBloque key={i} bloque={b}>
            <BloqueVista bloque={b} disparo={disparo} auto={auto} navegable={navegable} />
          </CeldaBloque>
        ))}
      </div>
    </div>
  );
}

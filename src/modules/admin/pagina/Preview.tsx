/* =============================================================================
   Página de la oficina · la vista previa.

   No es un esquema de cajas: es la banda de verdad de la portada, con sus
   mismos componentes y su misma hoja de estilos, dibujada a escala dentro del
   editor. Lo que se ve aquí es lo que verá quien entre al portal.

   La escala se hace con `transform`, que no ocupa sitio, así que el alto del
   marco se calcula y se aplica a mano; con `zoom` sería una línea menos, pero
   todavía no se comporta igual en todos los navegadores.

   La copia es inerte: sus botones y enlaces no reciben el foco ni el tabulador.
   Un carrusel de mentira robando la tecla Tab en mitad de un formulario es
   exactamente la clase de detalle que hace desconfiar de una vista previa.

   Con ancho es una columna fija a la derecha. Sin él —portátiles pequeños,
   tabletas— se convierte en un desplegable justo bajo la barra de estaciones:
   dejarla al final de la página la ponía a tres mil píxeles del campo que se
   está escribiendo, que es tanto como no tenerla.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { OfficeGallery } from "../../planeacion/OfficeGallery";
import { TeamCarousel } from "../../planeacion/TeamCarousel";
import type { OfficePage } from "../../planeacion/page";
import type { OfficeStationId } from "./OfficePageAdmin";
import "../../planeacion/planeacion.css";

/** El ancho real del portal: la vista previa se dibuja a tamaño y se reduce. */
const PORTAL_WIDTH = 1312;

export function Preview({ station, page }: { station: OfficeStationId; page: OfficePage }) {
  const compact = useCompact();
  const band = BANDS[station];
  if (!band) return null;

  const body = (
    <>
      <ScaledFrame key={compact ? "compacta" : "columna"}>
        <div className="pl-page ofa-preview__page">{band.render(page)}</div>
      </ScaledFrame>
      {band.note && <p className="ofa-preview__note">{band.note}</p>}
    </>
  );

  if (compact) {
    return (
      <details className="ofa-preview ofa-preview--compact">
        <summary>
          <Icon name="eye" size={15} />
          <strong>Ver cómo quedará</strong>
          <span>{band.label}</span>
        </summary>
        {body}
      </details>
    );
  }

  return (
    <aside className="ofa-preview" aria-label="Vista previa de la portada">
      <div className="ofa-preview__head">
        <strong>Así se verá</strong>
        <span>{band.label}</span>
      </div>
      {body}
    </aside>
  );
}

/** ¿Cabe la columna de vista previa al lado del trabajo? */
function useCompact() {
  const query = "(max-width: 1279px)";
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

/* --- El marco a escala ---------------------------------------------------------------- */

function ScaledFrame({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const hostNode = host.current;
    const innerNode = inner.current;
    if (!hostNode || !innerNode || typeof ResizeObserver === "undefined") return;

    // La copia no participa en la navegación por teclado ni en el árbol de
    // accesibilidad: es una imagen de la página, no la página.
    innerNode.setAttribute("inert", "");

    const measure = () => {
      const next = hostNode.clientWidth / PORTAL_WIDTH;
      setScale(next);
      setHeight(innerNode.scrollHeight * next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(hostNode);
    observer.observe(innerNode);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ofa-frame" ref={host} style={{ height: height ? `${Math.round(height)}px` : undefined }}>
      <div
        ref={inner}
        aria-hidden="true"
        className="ofa-frame__inner"
        style={{ width: `${PORTAL_WIDTH}px`, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

/* --- Las bandas ----------------------------------------------------------------------- */

interface Band {
  label: string;
  note?: string;
  render: (page: OfficePage) => ReactNode;
}

const BANDS: Partial<Record<OfficeStationId, Band>> = {
  portada: {
    label: "El encabezado de la portada",
    note: "El buscador va debajo de la entradilla y no cambia desde aquí.",
    render: (page) => (
      <section className="pl-hero">
        <div className="pl-container pl-hero__inner">
          <h1>{page.home.title}</h1>
          <p className="pl-hero__lede">{page.home.lede}</p>
        </div>
      </section>
    ),
  },
  galeria: {
    label: "La galería, entre los portales y lo más reciente",
    render: (page) => (
      <OfficeGallery title={page.gallery.title} lede={page.gallery.lede} slides={page.gallery.slides} />
    ),
  },
  equipo: {
    label: "El equipo, antes del bloque de la oficina",
    note: "En la portada se desplaza a lo ancho; en /equipo, las mismas tarjetas van en rejilla.",
    render: (page) => (
      <TeamCarousel
        title={page.team.title}
        lede={page.team.lede}
        people={page.team.people}
        areas={page.areas}
      />
    ),
  },
  oficina: {
    label: "El cierre de la portada",
    render: (page) => (
      <section className="pl-section">
        <div className="pl-container">
          <div className="pl-office">
            <div className="pl-office__text">
              <h2>{page.home.closingTitle}</h2>
              <p>{page.office.purpose}</p>
              <span className="pl-link">
                Conocer la oficina <Icon name="arrow-right" size={16} />
              </span>
            </div>
            <ul className="pl-office__links">
              {page.links.map((item) => (
                <li key={item.id}>
                  <a>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                    <Icon name="arrow-right" size={16} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    ),
  },
};

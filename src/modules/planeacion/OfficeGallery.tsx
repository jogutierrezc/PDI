/* =============================================================================
   Portal de Planeación · la galería de la oficina.

   Una franja propia entre el mosaico de portales y «Lo más reciente»: la
   fotografía a lo ancho, el pie sobre ella y, debajo, una escala graduada que
   dice en qué punto de la serie va —el mismo lenguaje del plano del encabezado,
   no los puntitos de siempre—.

   No avanza sola. Un carrusel que se mueve por su cuenta roba la lectura del
   pie a quien lee despacio y obliga a perseguir el botón a quien navega con el
   teclado; aquí avanza quien mira.

   Sin fotografías la franja no existe: la portada no enseña un hueco con la
   promesa de una foto que nadie subió.
   ========================================================================== */

import { useId } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { officePhotoUrl } from "./page";
import type { GallerySlide } from "./page";
import { useRail } from "./rail";
import { RailArrows, RailPosition } from "./RailControls";

export function OfficeGallery({
  title,
  lede,
  slides,
}: {
  title: string;
  lede: string;
  slides: GallerySlide[];
}) {
  const rail = useRail<HTMLUListElement>(slides.length);
  const headingId = useId();

  if (!slides.length) return null;

  return (
    <section className="pl-gallery" aria-labelledby={headingId}>
      <div className="pl-container pl-gallery__head">
        <h2 id={headingId}>{title}</h2>
        {lede && <p>{lede}</p>}
        <div className="pl-rail-controls">
          <RailPosition
            rail={rail}
            count={slides.length}
            goToLabel={(position) => `Ir a la fotografía ${position + 1}`}
          />
          <RailArrows
            rail={rail}
            count={slides.length}
            previousLabel="Fotografía anterior"
            nextLabel="Fotografía siguiente"
          />
        </div>
      </div>

      <div className="pl-container">
        <ul
          className="pl-gallery__rail"
          ref={rail.ref}
          tabIndex={0}
          aria-label={`${slides.length} fotografías de la oficina`}
        >
          {slides.map((item, position) => {
            const src = officePhotoUrl(item.photo);
            return (
              <li key={item.id} className="pl-slide">
                <figure>
                  {src && (
                    <img
                      src={src}
                      alt={item.alt}
                      loading={position === 0 ? "eager" : "lazy"}
                      decoding="async"
                    />
                  )}
                  {(item.title || item.caption || item.to) && (
                    <figcaption>
                      {item.title && <strong>{item.title}</strong>}
                      {item.caption && <span>{item.caption}</span>}
                      {item.to &&
                        (/^https?:/i.test(item.to) ? (
                          <a href={item.to} target="_blank" rel="noopener noreferrer">
                            {item.toLabel || "Ver más"} <Icon name="external" size={14} />
                          </a>
                        ) : (
                          <Link to={item.to}>
                            {item.toLabel || "Ver más"} <Icon name="arrow-right" size={14} />
                          </Link>
                        ))}
                    </figcaption>
                  )}
                </figure>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* =============================================================================
   UDES Sostenible · página de evidencia de un indicador de THE.

   /sostenible/impact/evidencia/:n/:indicador

   Es lo que abre el evaluador de THE: una sola página por indicador, limpia.
   Sin el marco del portal (ni menú ni pie), sin enlaces de ningún tipo y sin
   adjuntos. Solo el encabezado de la evidencia, el título de la nota, su fecha,
   sección y sede, la fotografía si la base la entrega, las frases literales en
   español, el texto de envío en inglés y, al pie, la fuente original escrita
   como texto. Fondo claro, sin animaciones.

   `EvidenciaHoja` es la misma hoja que se ve en la intranet como vista previa.
   ========================================================================== */

import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useEvidenciaPublica } from "../rankings/informes/datos";
import type { EvidenciaPublica } from "../rankings/informes/datos";
import { direccionTexto, fechaCorta, fechaIngles } from "../rankings/informes/recorte";
import "./ods-evidence.css";

const UNIVERSIDAD = "Universidad de Santander";

const anio = (d: string | null | undefined) => (d && /^\d{4}/.test(d) ? d.slice(0, 4) : "2025");

/** La hoja de evidencia. No lleva ningún enlace: la fuente va escrita como texto. */
export function EvidenciaHoja({ ev }: { ev: EvidenciaPublica }) {
  const meta = [fechaCorta(ev.date), ev.section, ev.campus].filter(Boolean).join(" · ");
  return (
    <article className="oev-sheet" lang="es" aria-labelledby="oev-title">
      <header className="oev-kick" lang="en">
        <span>Evidence · Indicator {ev.indicator}</span>
        <span>
          {UNIVERSIDAD} · {anio(ev.date)}
        </span>
      </header>
      <h1 id="oev-title" className="oev-title">
        {ev.title}
      </h1>
      {meta && <p className="oev-meta">{meta}</p>}
      {ev.image_url && (
        <figure className="oev-photo">
          <img src={ev.image_url} alt={`Fotografía de la actividad: ${ev.title}`} decoding="async" referrerPolicy="no-referrer" />
        </figure>
      )}
      {ev.page_es.length > 0 && (
        <div className="oev-es" lang="es">
          {ev.page_es.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
      {ev.page_en && (
        <section className="oev-en" lang="en" aria-labelledby="oev-en-h">
          <h2 id="oev-en-h">English · submission text</h2>
          {ev.date && <p className="oev-en__date">{fechaIngles(ev.date)}</p>}
          {ev.page_en
            .split(/\n{2,}/)
            .filter(Boolean)
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))}
        </section>
      )}
      <footer className="oev-foot">
        <span lang="es">Fuente original</span> / <span lang="en">Original source</span>: {direccionTexto(ev.url)}
      </footer>
    </article>
  );
}

export function OdsEvidence() {
  const { n, indicador } = useParams();
  const ods = Number(n);
  const ind = indicador ?? "";
  const q = useEvidenciaPublica(ods, ind);
  const ev = q.data ?? null;

  useEffect(() => {
    const t = ev ? `Evidence ${ev.indicator} · ${ev.title} · ${UNIVERSIDAD}` : `Evidence · Indicator ${ind} · SDG ${ods} · ${UNIVERSIDAD}`;
    document.title = t;
  }, [ev, ind, ods]);

  return (
    <main className="oev">
      {ev ? (
        <EvidenciaHoja ev={ev} />
      ) : (
        <div className="oev-sheet oev-sheet--empty" role="status">
          <p className="oev-kick" lang="en">
            <span>Evidence · Indicator {ind}</span>
            <span>{UNIVERSIDAD}</span>
          </p>
          <p className="oev-wait">
            {q.isPending
              ? "Cargando la evidencia…"
              : q.error
                ? "No se pudo cargar la evidencia. Vuelve a intentarlo en un momento."
                : "Esta página de evidencia no existe o todavía no está aprobada."}
          </p>
        </div>
      )}
    </main>
  );
}

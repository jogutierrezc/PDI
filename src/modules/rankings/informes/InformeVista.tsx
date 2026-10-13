/* =============================================================================
   Informes ODS con Pilo · 4. Vista previa.

   El mismo cuerpo que pinta el portal (OdsPilo) y el mismo carrusel final,
   con los datos del borrador: solo los párrafos activos y las fotografías en
   uso que se pueden publicar. Siempre sobre fondo claro y sin movimiento.
   ========================================================================== */

import type { CSSProperties } from "react";
import { useNoticiasDeOds } from "./datos";
import type { InformeCompleto, InformePublico } from "./tipos";
import { fotoPublicable } from "./InformeFotos";
import { OdsPiloCuerpo, recortesDe } from "../../sostenible/OdsPilo";
import { OdsNewsCarousel } from "../../sostenible/OdsNews";
import { odsByNumber } from "../../sostenible/ods-data";
import { odsOn, odsTone } from "../../sostenible/OdsArt";
import "../../sostenible/ods.css";

/** Lo que vería el portal si el borrador se publicara ahora. */
export function aPublico(c: InformeCompleto): InformePublico {
  return {
    informe: { id: c.informe.id, ods: c.informe.ods, edition: c.informe.edition, updated_at: c.informe.updated_at },
    bloques: c.bloques
      .filter((b) => b.enabled && !b.spare && b.text.trim())
      .map((b) => ({ id: b.id, sec: b.sec, pos: b.pos, text: b.text, sources: b.sources, figs: b.figs })),
    fotos: c.fotos
      .filter((f) => f.use && f.kind === "foto" && fotoPublicable(f))
      .map((f) => ({ news_id: f.news_id, slot: f.slot, caption: f.caption, alt: f.alt, credit: f.credit, crop: f.crop })),
  };
}

export function InformeVista({ completo }: { completo: InformeCompleto }) {
  const inf = completo.informe;
  const o = odsByNumber(inf.ods);
  const notasQ = useNoticiasDeOds(inf.ods);
  if (!o) return null;
  const notas = notasQ.data ?? [];
  const pub = aPublico(completo);
  return (
    <div className="ri-preview">
      <p className="ri-mute ri-preview__note">
        Así se verá en el portal. Solo entra lo activo: los párrafos de reserva y las fotografías sin autorización quedan fuera.
      </p>
      <div className="odsx ri-preview__page">
        <div className="ors" lang="es" style={odsTone(o.color)}>
          <header className="ri-poster" style={{ "--c": o.color, "--on": odsOn(o.color) } as CSSProperties}>
            <span className="ri-poster__n" aria-hidden="true">
              {o.n}
            </span>
            <div>
              <small>Informe ODS · Edición {inf.edition}</small>
              <h2>{o.name}</h2>
            </div>
          </header>
          <OdsPiloCuerpo o={o} informe={pub} notas={notas.map((n) => ({ id: n.id, image_url: n.image_url, title: n.title }))} animar={false} />
          {inf.edition === 2025 && <OdsNewsCarousel n={o.n} notas={notas} recortes={recortesDe(pub)} />}
        </div>
      </div>
    </div>
  );
}

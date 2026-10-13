/* =============================================================================
   Informes ODS con Pilo · 5. Vista previa.

   El mismo cuerpo que pinta el portal (OdsPilo), su registro de actividades
   y el carrusel final, con los datos del borrador: solo los párrafos activos
   y las fotografías en uso que se pueden publicar. En español o en inglés
   (como el selector del portal). Siempre sobre fondo claro y sin movimiento.
   ========================================================================== */

import { useState } from "react";
import type { CSSProperties } from "react";
import { registroActividades, useCifrasDeOds, useImagenesDeOds, useNoticiasDeOds } from "./datos";
import type { InformeCompleto, InformePublico } from "./tipos";
import { fotoPublicable } from "./InformeFotos";
import { OdsPiloCuerpo, recortesDe } from "../../sostenible/OdsPilo";
import { OdsNewsCarousel } from "../../sostenible/OdsNews";
import { odsByNumber } from "../../sostenible/ods-data";
import { odsOn, odsTone } from "../../sostenible/OdsArt";
import { nombreOds } from "../../sostenible/i18n";
import type { Lang } from "../../sostenible/i18n";
import { LangSwitch } from "../../sostenible/LangSwitch";
import "../../sostenible/ods.css";

/** Lo que vería el portal si el borrador se publicara ahora. `urls`: la imagen elegida de cada foto. */
export function aPublico(c: InformeCompleto, urls: Map<string, string> = new Map(), registro?: InformePublico["registro"]): InformePublico {
  return {
    informe: { id: c.informe.id, ods: c.informe.ods, edition: c.informe.edition, updated_at: c.informe.updated_at },
    bloques: c.bloques
      .filter((b) => b.enabled && !b.spare && b.text.trim())
      .map((b) => ({ id: b.id, sec: b.sec, pos: b.pos, text: b.text, sources: b.sources, figs: b.figs, text_en: b.text_en ?? "", heading: b.heading ?? "", heading_en: b.heading_en ?? "" })),
    fotos: c.fotos
      .filter((f) => f.use && f.kind === "foto" && fotoPublicable(f))
      .map((f) => ({ news_id: f.news_id, image_id: f.image_id ?? null, url: (f.image_id && urls.get(f.image_id)) || null, slot: f.slot, caption: f.caption, alt: f.alt, credit: f.credit, crop: f.crop })),
    registro,
  };
}

export function InformeVista({ completo }: { completo: InformeCompleto }) {
  const inf = completo.informe;
  const o = odsByNumber(inf.ods);
  const notasQ = useNoticiasDeOds(inf.ods);
  const imgsQ = useImagenesDeOds(inf.ods);
  const cifrasQ = useCifrasDeOds(inf.ods);
  const [lang, setLang] = useState<Lang>("es");
  if (!o) return null;
  const notas = notasQ.data ?? [];
  const urls = new Map((imgsQ.data ?? []).map((i) => [i.id, i.url]));
  const registro = notas.length ? registroActividades(notas, cifrasQ.data ?? [], completo.bloques) : undefined;
  const pub = aPublico(completo, urls, registro);
  return (
    <div className="ri-preview">
      <div className="ri-row ri-preview__bar">
        <p className="ri-mute ri-preview__note">Así se verá en el portal. Solo entra lo activo: los párrafos quitados y las fotografías sin autorización quedan fuera.</p>
        <LangSwitch lang={lang} onChange={setLang} />
      </div>
      <div className="odsx ri-preview__page" lang={lang}>
        <div className="ors" lang={lang} style={odsTone(o.color)}>
          <header className="ri-poster" style={{ "--c": o.color, "--on": odsOn(o.color) } as CSSProperties}>
            <span className="ri-poster__n" aria-hidden="true">
              {o.n}
            </span>
            <div>
              <small>{lang === "en" ? `SDG report · ${inf.edition} edition` : `Informe ODS · Edición ${inf.edition}`}</small>
              <h2>{nombreOds(o, lang)}</h2>
            </div>
          </header>
          <OdsPiloCuerpo o={o} informe={pub} notas={notas.map((n) => ({ id: n.id, image_url: n.image_url, title: n.title }))} animar={false} lang={lang} />
          {inf.edition === 2025 && <OdsNewsCarousel n={o.n} notas={notas} recortes={recortesDe(pub)} lang={lang} />}
        </div>
      </div>
    </div>
  );
}

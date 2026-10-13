/* =============================================================================
   UDES Sostenible · el selector ES | EN y la marca «ES».

   · LangSwitch: dos botones (no enlaces: la página de evidencia no lleva ni
     uno). El idioma se guarda en `?lang=` y en localStorage (useLang).
   · MarcaEs: cuando se pide inglés y un contenido aún no tiene traducción, se
     muestra el español con esta marca discreta, nunca un hueco.
   · Bi: un contenido con su versión en inglés (o sin ella), con su `lang`.
   ========================================================================== */

import type { ReactNode } from "react";
import { tr } from "./i18n";
import type { Lang } from "./i18n";
import "./lang.css";

export function LangSwitch({ lang, onChange, className = "" }: { lang: Lang; onChange: (l: Lang) => void; className?: string }) {
  return (
    <div className={`lng-switch ${className}`} role="group" aria-label={tr(lang, "idioma")}>
      {(["es", "en"] as Lang[]).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} aria-label={l === "es" ? "Español" : "English"} onClick={() => lang !== l && onChange(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** La marca de un texto que se muestra en español porque falta su inglés. */
export function MarcaEs({ lang }: { lang: Lang }) {
  return (
    <abbr className="lng-es" lang="en" title={tr(lang, "texto_en_es")}>
      ES
    </abbr>
  );
}

/** ¿Hay que mostrar el español con la marca? */
export const faltaIngles = (lang: Lang, en: string | null | undefined) => lang === "en" && !String(en ?? "").trim();

/**
 * Un texto con su versión inglesa opcional: en inglés, la inglesa; si falta,
 * el español con la marca «ES». Devuelve el texto con su atributo `lang`.
 */
export function Bi({ lang, es, en, as: Tag = "span", className, marca = true }: { lang: Lang; es: ReactNode; en?: string | null; as?: "span" | "p" | "b" | "h3" | "h4" | "strong"; className?: string; marca?: boolean }) {
  const usaEn = lang === "en" && Boolean(String(en ?? "").trim());
  return (
    <Tag className={className} lang={usaEn ? "en" : "es"}>
      {usaEn ? en : es}
      {lang === "en" && !usaEn && marca && (
        <>
          {" "}
          <MarcaEs lang={lang} />
        </>
      )}
    </Tag>
  );
}

/* =============================================================================
   Pilo Publica · el informe en la ruta de siempre de THE Impact:
   /sostenible/impact/informes/ods/:n?edicion=2026

   Si hay un informe de Pilo Publica PUBLICADO para ese ODS y esa edición, esta
   ruta muestra ese informe (tablero, gráficos, narrativa en español e inglés).
   Si no lo hay, o aún falta aplicar la migración 0262, muestra el informe que ya
   existía (`fallback`): nada se rompe ni se duplica una dirección.

   El idioma es el de todo el portal (?lang= y lo recordado).
   ========================================================================== */

import type { ReactNode } from "react";
import { LangSwitch } from "../../sostenible/LangSwitch";
import { useLang } from "../../sostenible/i18n";
import { useInformePublico } from "./datos";
import { InformeVista } from "./InformeVista";
import { unidadDe } from "./tipos";
import type { Idioma } from "./tipos";
import "./publica.css";

export function InformeEnRuta({ n, edition, fallback }: { n: number; edition: number; fallback: ReactNode }) {
  const { lang, setLang } = useLang();
  const idioma: Idioma = lang === "en" ? "en" : "es";
  const q = useInformePublico("impact", String(n), edition);
  const un = unidadDe("impact", String(n));

  // Mientras se sabe si hay informe nuevo, no se pinta el viejo (evita el parpadeo de dos informes).
  if (q.isPending) return <div className="pp-pub" aria-busy="true" style={{ minHeight: "40vh" }} />;
  if (q.error || !q.data || !un) return <>{fallback}</>;

  const d = q.data;
  return (
    <div className="pp-pub">
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px max(16px, env(safe-area-inset-right, 0px)) 0" }}>
        <LangSwitch lang={lang} onChange={setLang} />
      </div>
      <main id="contenido">
        <InformeVista informe={d.informe} unidad={un} bloques={d.bloques} cifras={d.cifras} medios={d.medios} idioma={idioma} />
      </main>
    </div>
  );
}

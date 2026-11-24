/* =============================================================================
   UI GreenMetric · entrada en la portada de /sostenible.

   Una tarjeta que lleva a la página nueva SOLO cuando hay indicadores publicados
   (y las migraciones aplicadas). Si no, no dibuja nada y la portada queda igual.
   Sin puntos, sin puesto: el inventario «N de M indicadores publicados».
   ========================================================================== */

import { Link } from "react-router-dom";
import { useLang } from "../../../sostenible/i18n";
import { usePublicoResumen } from "../datos";
import { RUTA_GREEN, fecha } from "./logica";
import { Regleta } from "./piezas";
import { tx } from "./textos";
import "./ugmp.css";

export function TarjetaHome() {
  const { lang } = useLang();
  const q = usePublicoResumen(null);
  const r = q.data && q.data.total.publicados > 0 ? q.data : null;
  if (!r) return null;
  return (
    <Link to={`${RUTA_GREEN}${lang === "en" ? "?lang=en" : ""}`} className="ugmp-home">
      <span className="ugmp-home__k">UI GreenMetric {r.ciclo.anio}</span>
      <b>{tx(lang, "n_de_m", { n: r.total.publicados, m: r.total.total })}</b>
      <Regleta n={r.total.publicados} m={r.total.total} lang={lang} clase="wide" clave="home" />
      <span className="ugmp-home__s">
        {tx(lang, "actualizado_en", { f: fecha(r.actualizado, lang) })} · {tx(lang, "tarjeta_ir")}
      </span>
    </Link>
  );
}

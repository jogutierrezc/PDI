/* =============================================================================
   Pilo Publica · la página pública de un informe:
   /sostenible/informes/:ranking/:unidad  (?ed=2025&lang=en)

   Sin sesión. Solo lee informes publicados (RLS) y las cifras que sus bloques
   citan (pp_cifras_publicas). Si no hay informe publicado, un 404 amable.
   ========================================================================== */

import { useEffect } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useInformePublico } from "./datos";
import { InformeVista } from "./InformeVista";
import { nombreUnidad, rankingDe, unidadDe } from "./tipos";
import type { Idioma } from "./tipos";
import "./publica.css";

export function InformePublico() {
  const { ranking, unidad } = useParams();
  const [sp, setSp] = useSearchParams();
  const idioma: Idioma = sp.get("lang") === "en" ? "en" : "es";
  const ed = Number(sp.get("ed")) || null;
  // THE Impact tiene su ruta de siempre por ODS: aquí solo se redirige a ella.
  const aImpact = ranking === "impact" && /^(?:[1-9]|1[0-7])$/.test(unidad ?? "");
  const rk = rankingDe(ranking ?? "");
  const un = unidadDe(ranking ?? "", unidad ?? "");
  const q = useInformePublico(rk && un ? rk.id : undefined, un?.key, ed);

  const titulo = q.data ? (idioma === "en" && q.data.informe.title_en ? q.data.informe.title_en : q.data.informe.title_es || nombreUnidad(q.data.informe.ranking, un!, idioma)) : "";
  useEffect(() => {
    if (titulo) document.title = `${titulo} · UDES`;
  }, [titulo]);

  const cambiar = (l: Idioma) => {
    const n = new URLSearchParams(sp);
    if (l === "en") n.set("lang", "en");
    else n.delete("lang");
    setSp(n, { replace: true });
  };

  if (aImpact) return <Navigate to={`/sostenible/impact/informes/ods/${unidad}?edicion=${ed ?? 2026}${idioma === "en" ? "&lang=en" : ""}`} replace />;

  const encabezado = (
    <div className="pp-pub-top">
      <div className="pp-pub-top__in">
        <Link to="/sostenible" className="pp-pub-top__marca">
          UDES Sostenible
        </Link>
        <div className="pp-seg" role="group" aria-label={idioma === "en" ? "Language" : "Idioma"}>
          <button type="button" aria-pressed={idioma === "es"} lang="es" onClick={() => cambiar("es")}>
            ES
          </button>
          <button type="button" aria-pressed={idioma === "en"} lang="en" onClick={() => cambiar("en")}>
            EN
          </button>
        </div>
      </div>
    </div>
  );

  let cuerpo;
  if (!rk || !un || (!q.isPending && !q.error && !q.data)) {
    cuerpo = (
      <main className="pp-pub-vacio" id="contenido">
        <h1>{idioma === "en" ? "We could not find this report" : "No encontramos este informe"}</h1>
        <p>
          {idioma === "en"
            ? "It may not be published yet, or the address may have changed. You can look for other sustainability reports from the Universidad de Santander."
            : "Puede que todavía no esté publicado o que la dirección haya cambiado. Puedes buscar los demás informes de sostenibilidad de la Universidad de Santander."}
        </p>
        <Link className="button-primary" to="/sostenible">
          {idioma === "en" ? "Go to UDES Sostenible" : "Ir a UDES Sostenible"}
        </Link>
      </main>
    );
  } else if (q.isPending) {
    cuerpo = (
      <main className="pp-pub-vacio" id="contenido" aria-busy="true">
        <p role="status">{idioma === "en" ? "Loading the report…" : "Cargando el informe…"}</p>
      </main>
    );
  } else if (q.error) {
    cuerpo = (
      <main className="pp-pub-vacio" id="contenido">
        <h1>{idioma === "en" ? "Something went wrong" : "Algo salió mal"}</h1>
        <p>{idioma === "en" ? "We could not load the report. Please try again." : "No pudimos cargar el informe. Inténtalo de nuevo."}</p>
        <button type="button" className="button-primary" onClick={() => void q.refetch()}>
          {idioma === "en" ? "Try again" : "Reintentar"}
        </button>
      </main>
    );
  } else {
    const d = q.data!;
    cuerpo = (
      <main id="contenido">
        <InformeVista informe={d.informe} unidad={un} bloques={d.bloques} cifras={d.cifras} medios={d.medios} idioma={idioma} />
      </main>
    );
  }

  return (
    <div className="pp-pub">
      {encabezado}
      {cuerpo}
    </div>
  );
}

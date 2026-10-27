/* =============================================================================
   Observatorio público · portada de UN observatorio publicado (O2).

   Ruta: /datos-abiertos/observatorio/o/:slug. Sirve a cualquier observatorio
   publicado, incluido el principal (cuya portada de siempre sigue en
   /datos-abiertos/observatorio). Las líneas van con su nombre y sus temas
   publicados; cada tema abre /datos-abiertos/observatorio/:tema.
   ========================================================================== */

import { Link, useParams } from "react-router-dom";
import type { CSSProperties } from "react";
import { Icon } from "../../../components/ui/Icon";
import { OpenDataLayout } from "../components/OpenDataLayout";
import { useCatalogo } from "./catalogo";
import { ObsBar, lineStyle, liveText, obsIcono, useLive } from "./Observatory";
import "../datos-abiertos.css";
import "./observatorio.css";

export function ObservatorioPagina() {
  const { slug } = useParams();
  const catalogo = useCatalogo();
  const live = useLive();
  const obs = catalogo.observatorios.find((o) => o.slug === slug);

  if (!obs) {
    return (
      <OpenDataLayout title="Observatorio | UDES en Cifras" className="obs-page">
        <section className="od-missing">
          <div className="u-container">
            {catalogo.cargando ? <h1>Cargando el observatorio…</h1> : <h1>Este observatorio no existe o aún no está publicado</h1>}
            <Link className="od-button od-button--signal" to="/datos-abiertos/observatorio">
              Ver el Observatorio
            </Link>
          </div>
        </section>
      </OpenDataLayout>
    );
  }

  const temas = catalogo.porObs.get(obs.id) ?? [];
  const lineas = catalogo.lineas.filter((l) => l.observatorio_id === obs.id).sort((a, b) => a.orden - b.orden);
  const grupos = [
    ...lineas.map((l) => ({ id: l.id, nombre: l.nombre, temas: temas.filter((t) => t.lineaId === l.id) })),
    { id: "", nombre: lineas.length ? "Otros temas" : "Páginas", temas: temas.filter((t) => !t.lineaId || !lineas.some((l) => l.id === t.lineaId)) },
  ].filter((g) => g.temas.length > 0);

  return (
    <OpenDataLayout title={`${obs.nombre} | UDES en Cifras`} className="obs-page">
      <ObsBar current={null} published={live} temas={temas} />
      <section className="od-report-head obs-head" aria-labelledby="obs-uno" style={{ "--obs-color": obs.color } as CSSProperties}>
        <div className="u-container">
          <Link className="od-back" to="/datos-abiertos/observatorio">
            <Icon name="arrow-left" size={16} /> Observatorio de Analítica
          </Link>
          <h1 id="obs-uno" className="obs-head__title obs-uno__titulo">
            <span className="obs-otros__icono" aria-hidden="true">
              <Icon name={obsIcono(obs.icono)} size={26} />
            </span>
            {obs.nombre}
          </h1>
          {obs.descripcion && <p className="obs-head__lede">{obs.descripcion}</p>}
        </div>
      </section>

      <section className="od-section obs-uno" aria-label={`Temas de ${obs.nombre}`}>
        <div className="u-container">
          {grupos.length === 0 ? (
            <p className="obs-note" role="note">
              <span className="od-stamp">Sin temas</span>
              <span>Este observatorio aún no tiene páginas publicadas.</span>
            </p>
          ) : (
            grupos.map((g) => (
              <div className="obs-uno__linea" key={g.id || "otros"}>
                <h2>{g.nombre}</h2>
                <div className="od-departures">
                  <ol className="od-departures__list">
                    {g.temas.map((t) => {
                      const real = live.get(t.slug);
                      const resumen = real?.summary;
                      return (
                        <li key={t.slug}>
                          <Link className="od-row" to={`/datos-abiertos/observatorio/${t.slug}`}>
                            <span className="od-row__code od-line" style={lineStyle(t.line)}>{t.code}</span>
                            <span className="od-row__name">
                              <strong>{t.name}</strong>
                              <span>{t.summary}</span>
                            </span>
                            <span className="od-row__figure">
                              <span className="od-row__digits">{resumen ? liveText(resumen) : "—"}</span>
                              <span className="od-row__indicator">{resumen ? resumen.label : real ? "Datos publicados" : "Sin datos publicados"}</span>
                            </span>
                            <span className="od-row__previous obs-spark" aria-hidden="true" />
                            <span className="od-row__go" aria-hidden="true">
                              <Icon name="arrow-right" size={20} />
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </OpenDataLayout>
  );
}

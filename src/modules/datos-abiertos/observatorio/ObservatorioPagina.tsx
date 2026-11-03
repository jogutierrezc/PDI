/* =============================================================================
   Observatorio público · portada de UN observatorio publicado (O2).

   Ruta: /datos-abiertos/observatorio/o/:slug. Sirve a cualquier observatorio
   publicado, incluido el principal (cuya portada de siempre sigue en
   /datos-abiertos/observatorio). Las líneas van con su nombre y sus temas
   publicados; cada tema abre /datos-abiertos/observatorio/:tema.
   ========================================================================== */

import { Link, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { OpenDataLayout } from "../components/OpenDataLayout";
import { useCatalogo } from "./catalogo";
import { ObsBar, useLive } from "./Observatory";
import { ObsClaro, Mosaico, PortadaCabecera } from "./rediseno";
import { datosTablero } from "./tablero";
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
  const palabras = obs.nombre.trim().split(/\s+/);
  const corte = palabras.length > 1 ? Math.ceil(palabras.length / 2) : 0;
  const lineas = corte ? [palabras.slice(0, corte).join(" "), palabras.slice(corte).join(" ")] : [obs.nombre];
  const conDatos = temas.filter((t) => live.has(t.slug)).length;

  return (
    <OpenDataLayout title={`${obs.nombre} | UDES en Cifras`} className="obs-page">
      <ObsBar current={null} published={live} temas={temas} />
      <ObsClaro>
        <div className="obsr-wrap">
          <PortadaCabecera
            id="obs-uno"
            lineas={lineas}
            lede={obs.descripcion || `Las páginas de ${obs.nombre}: cada una parte de una pregunta y deja ver, ordenar y descargar el dato.`}
            cifras={[
              { valor: temas.length, texto: "páginas en este observatorio" },
              { valor: conDatos, texto: "páginas con datos publicados" },
            ]}
            atras={
              <>
                <Link to="/datos-abiertos/observatorio">
                  <Icon name="arrow-left" size={16} /> Observatorio de Analítica
                </Link>
                <span>{obs.nombre}</span>
              </>
            }
          />
          <div className="obsr-tools">
            <div>
              <h2>Los tableros</h2>
              <p>Elige un tablero para explorar su serie, su reparto y su tabla.</p>
            </div>
          </div>
          {temas.length === 0 ? (
            <p className="obs-note" role="note">
              <span className="od-stamp">Sin temas</span>
              <span>Este observatorio aún no tiene páginas publicadas.</span>
            </p>
          ) : (
            <Mosaico tableros={temas.map((t) => ({ datos: datosTablero(t), pregunta: t.question }))} etiqueta={`Tableros de ${obs.nombre}`} />
          )}
        </div>
      </ObsClaro>
    </OpenDataLayout>
  );
}

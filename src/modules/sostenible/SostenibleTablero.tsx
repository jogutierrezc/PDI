/* =============================================================================
   UDES Sostenible · /sostenible/tablero/:slug

   Un tablero personalizado de Datos de Sostenibilidad dentro del marco del
   portal. Una sola lectura pública (sos_tablero_publico): lo que no está
   publicado no llega. Si el tablero no existe, no está publicado o falta la
   migración, un aviso amable en vez de una página rota.
   ========================================================================== */

import { Link, useParams } from "react-router-dom";
import { useTableroPublico } from "../datos-sostenibilidad/tableros";
import { SostenibleLayout } from "./SostenibleLayout";
import { TableroPublicado } from "./TableroSos";
import "./tablero-sos.css";

export function SostenibleTablero() {
  const { slug } = useParams();
  const q = useTableroPublico(slug);
  const t = q.data;
  return (
    <SostenibleLayout title={t?.nombre ?? "Tablero"}>
      <section className="sos-section sos-tabpag">
        <div className="sos-wrap">
          {q.isPending ? (
            <p className="sos-tab__vacio" role="status">
              Cargando el tablero…
            </p>
          ) : !t ? (
            <div className="sos-tabpag__vacio">
              <h1>No encontramos este tablero</h1>
              <p>Puede que el enlace esté mal escrito o que el tablero ya no se publique.</p>
              <Link className="sos-btn" to="/sostenible">
                Ir a UDES Sostenible
              </Link>
            </div>
          ) : (
            <>
              <header className="sos-tabpag__cab">
                <p className="sos-eyebrow">Datos de sostenibilidad</p>
                <h1>{t.nombre}</h1>
                {t.descripcion ? <p>{t.descripcion}</p> : null}
              </header>
              <TableroPublicado t={t} />
            </>
          )}
        </div>
      </section>
    </SostenibleLayout>
  );
}

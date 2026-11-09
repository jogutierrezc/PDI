/* =============================================================================
   UDES Sostenible · página pública del boletín de informes ODS.

   El boletín ya no se arma aquí: se arma y se publica desde el administrador
   (Rankings → Boletín PDF) con los informes publicados de Pilo Publica. Esta
   página solo ofrece la descarga de la edición publicada y lleva a Boletines.
   El equipo de Planeación ve, además, el acceso al administrador.
   ========================================================================== */

import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { OdsShell } from "./OdsShell";
import { OdsBulletinDownload } from "./OdsBulletinDownload";
import { canIssueOdsBulletin, useOdsBulletinEditions } from "./ods-bulletin-data";
import { useLang } from "./i18n";
import "./ods-portal.css";

export function OdsBulletin() {
  const auth = useAuth();
  const { lang, t } = useLang();
  const { edition, isLoading } = useOdsBulletinEditions();
  const equipo = Boolean(auth.profile && canIssueOdsBulletin(auth));
  const en = lang === "en";

  return (
    <OdsShell title={t("boletin_title")} active="boletin">
      <div className="odsx-wrap">
        <h1>{t("boletin_title")}</h1>
        {isLoading ? (
          <p className="odsx-note" role="status">
            {t("verificando")}
          </p>
        ) : edition ? (
          <>
            <p className="odsx-note">
              {en
                ? "The report of each Sustainable Development Goal in a single A4 document: key figures, narrative, charts and images. The edition is a PDF issued on its date and does not change."
                : "El informe de cada Objetivo de Desarrollo Sostenible en un solo documento A4: cifras destacadas, narrativa, gráficos e imágenes. La edición es el PDF emitido en su fecha y no cambia."}
            </p>
            <p>
              <OdsBulletinDownload />{" "}
              <Link className="odsx-btn" to="/datos-abiertos/boletines">
                {en ? "All bulletins" : "Todos los boletines"}
              </Link>
            </p>
          </>
        ) : (
          <p className="odsx-note">{en ? "The bulletin has not been published yet." : "El boletín aún no se ha publicado."}</p>
        )}
        {equipo && (
          <p className="odsx-note" lang="es">
            Para armar o publicar una edición, usa el administrador: <Link to="/admin/rankings/boletin">Rankings → Boletín PDF</Link>.
          </p>
        )}
      </div>
    </OdsShell>
  );
}

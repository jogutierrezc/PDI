/* =============================================================================
   UDES Sostenible · «Registro de actividades» al final de un informe ODS.

   TODAS las notas del ODS (ods_registro, 0146), de la más antigua a la más
   reciente: fecha, sede, título en el idioma pedido (o el original con la
   marca «ES») y su cifra principal. Cada fila lleva a su tarjeta del
   carrusel (#osn-<id>). En pantallas anchas es una tabla compacta; en el
   teléfono, una lista. Sin registro (antes de 0146) no se pinta.
   ========================================================================== */

import type { RegistroActividad } from "../rankings/informes/tipos";
import { fechaCorta, tr } from "./i18n";
import type { Lang } from "./i18n";
import { Bi } from "./LangSwitch";

export function OdsRegistro({ registro, lang, edicion }: { registro: RegistroActividad[] | undefined; lang: Lang; edicion: number }) {
  if (!registro?.length) return null;
  return (
    <section className="ors-sec ors-sec--white opi-sec opi-reg" id="ors-registro" aria-labelledby="opi-reg-h" lang={lang}>
      <div className="odsx-wrap">
        <header className="opi-head">
          <h2 id="opi-reg-h" className="opi-h2 opi-h2--plain">
            {tr(lang, "registro_t")}
          </h2>
          <p className="opi-reg__p">
            {tr(lang, "registro_p", { e: edicion })} <b>{registro.length}</b>
          </p>
        </header>
        <table className="opi-reg__t">
          <thead>
            <tr>
              <th scope="col">{tr(lang, "col_fecha")}</th>
              <th scope="col">{tr(lang, "col_sede")}</th>
              <th scope="col">{tr(lang, "col_actividad")}</th>
              <th scope="col" className="opi-reg__num">
                {tr(lang, "col_cifra")}
              </th>
            </tr>
          </thead>
          <tbody>
            {registro.map((r) => (
              <tr key={r.news_id} data-relato={r.en_narrativa ? "" : undefined}>
                <td className="opi-reg__f">{r.published_on ? <time dateTime={r.published_on}>{fechaCorta(r.published_on, lang)}</time> : "—"}</td>
                <td className="opi-reg__s">{r.campus || "—"}</td>
                <td className="opi-reg__a">
                  <a href={`#osn-${r.news_id}`} title={tr(lang, "ver_en_carrusel")}>
                    <Bi lang={lang} es={r.title} en={r.title_en} />
                  </a>
                  {r.en_narrativa && <span className="opi-reg__tag">{tr(lang, "en_relato")}</span>}
                </td>
                <td className="opi-reg__num">
                  {r.figure_value ? (
                    <>
                      <b>{r.figure_value}</b> <span lang="es">{r.figure_label}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

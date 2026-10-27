/* =============================================================================
   UI GreenMetric · página pública · un indicador publicado.

   Pinta solo lo que entrega la lectura pública (0212): narrativa revisada, cifra
   con unidad y año, frase de la opción elegida (nunca el número de nivel),
   campos, tablas, gráficas y tablas de Datos de Sostenibilidad con su pie de
   fuente, y evidencias con etiqueta (nunca el nombre del archivo). Los archivos
   se piden a la función ugm-evidencia; los enlaces solo si son https.
   ========================================================================== */

import { Link } from "react-router-dom";
import { GraficaSos } from "../../../sostenible/GraficasSostenibles";
import type { GraficaPublicaSos } from "../../../datos-sostenibilidad/tipos";
import { OdsPortalArrow } from "../../../sostenible/OdsPortalArrow";
import type { PublicoCicloRef, PublicoEvidencia, PublicoIndicador, PublicoTabla } from "../lib/tipos";
import { aniosDatos, enlaceSeguro, fecha, numero, parrafos, rutaEvidencia, urlEvidencia } from "./logica";
import { tx } from "./textos";
import type { Lang } from "./textos";

/** El año (o años) de los datos de un indicador, como frase. */
export function frasePeriodo(i: PublicoIndicador, ciclo: Pick<PublicoCicloRef, "anio_datos">, lang: Lang): string {
  const y = aniosDatos(i.periodo, ciclo.anio_datos);
  if (y.b) return tx(lang, "datos_rango", { a: y.a, b: y.b });
  return y.anterior ? tx(lang, "datos_ant", { a: y.a }) : tx(lang, "datos_de", { a: y.a });
}

export function Valor({ i, ciclo, lang }: { i: PublicoIndicador; ciclo: Pick<PublicoCicloRef, "anio_datos">; lang: Lang }) {
  const tieneValor = typeof i.valor === "number";
  return (
    <div className="ugmp-ind__val">
      {tieneValor && <b className="num">{numero(i.valor as number, lang)}</b>}
      {tieneValor && i.unidad && <span>{i.unidad}</span>}
      {!tieneValor && i.opcion_frase && <span className="ugmp-frase">{i.opcion_frase}</span>}
      {(tieneValor || i.opcion_frase) && <small>{frasePeriodo(i, ciclo, lang)}</small>}
    </div>
  );
}

function Tabla({ t, lang }: { t: PublicoTabla; lang: Lang }) {
  return (
    <div className="ugmp-tabla" role="region" aria-label={tx(lang, "tabla_aria", { t: t.titulo })} tabIndex={0}>
      <table>
        <caption>{t.titulo}</caption>
        <thead>
          <tr>
            {t.columnas.map((c) => (
              <th key={c.k} scope="col">
                {c.etiqueta}
                {c.unidad ? ` (${c.unidad})` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.filas.map((f, r) => (
            <tr key={r}>
              {t.columnas.map((c) => {
                const v = f[c.k];
                const url = c.tipo === "url" ? enlaceSeguro(String(v ?? "")) : null;
                return <td key={c.k}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https:\/\//, "")}</a> : typeof v === "number" ? numero(v, lang) : String(v ?? "")}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Una tabla conectada de Datos de Sostenibilidad: solo las columnas que el vínculo usa. */
function TablaConectada({ t, lang }: { t: NonNullable<PublicoIndicador["tablas_conectadas"]>[number]; lang: Lang }) {
  if (!t.filas.length || !t.columnas.length) return null;
  return (
    <div className="ugmp-tabla" role="region" aria-label={tx(lang, "tabla_aria", { t: t.columnas.map((c) => c.etiqueta).join(", ") })} tabIndex={0}>
      <table>
        <thead>
          <tr>
            {t.columnas.map((c) => (
              <th key={c.clave} scope="col">{c.etiqueta}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.filas.map((f, r) => (
            <tr key={r}>
              {t.columnas.map((c) => {
                const v = f[c.clave];
                return <td key={c.clave}>{typeof v === "number" ? numero(v, lang) : String(v ?? "")}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ugmp-fuente">{tx(lang, "fuente_ds", { f: fecha(t.actualizado, lang) })}</p>
    </div>
  );
}

export function Evidencias({ lista, lang }: { lista: PublicoEvidencia[]; lang: Lang }) {
  if (!lista.length) return <p className="ugmp-sin-evid">{tx(lang, "sin_evid")}</p>;
  return (
    <ul className="ugmp-evid">
      {lista.map((e) => {
        const href = enlaceSeguro(e.url) ?? (e.url ? null : urlEvidencia(e.id));
        return (
          <li key={e.id}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {e.etiqueta}
              </a>
            ) : (
              <span>{e.etiqueta}</span>
            )}
            <small>{[e.url ? tx(lang, "enlace_tipo") : e.tipo === "pdf" ? "PDF" : e.tipo.toUpperCase(), e.nota, e.pie].filter(Boolean).join(" · ")}</small>
          </li>
        );
      })}
    </ul>
  );
}

/** El cuerpo común (descripción, campos, tablas, gráficas): lo usan la categoría y la hoja de evidencia. */
export function CuerpoIndicador({ i, lang }: { i: PublicoIndicador; lang: Lang }) {
  return (
    <>
      {parrafos(i.descripcion).map((p, k) => (
        <p key={k} lang={lang}>
          {p}
        </p>
      ))}
      {!!i.campos?.length && (
        <dl className="ugmp-campos">
          {i.campos.map((c) => (
            <div key={c.k}>
              <dt>{c.etiqueta}</dt>
              <dd>
                {typeof c.valor === "number" ? numero(c.valor, lang) : /^https:\/\/\S+$/.test(String(c.valor)) ? <a href={String(c.valor)} target="_blank" rel="noopener noreferrer">{String(c.valor).replace(/^https:\/\//, "")}</a> : c.valor}
                {c.unidad ? ` ${c.unidad}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {i.tablas?.map((t) => <Tabla key={t.k} t={t} lang={lang} />)}
      {i.tablas_conectadas?.map((t, k) => <TablaConectada key={`${t.campo}-${k}`} t={t} lang={lang} />)}
      {!!i.graficas?.length && (
        <div className="ugmp-graficas">
          {(i.graficas as unknown as GraficaPublicaSos[]).map((g) => (
            <div key={g.id}>
              <GraficaSos g={g} />
              <p className="ugmp-fuente">{tx(lang, "fuente_ds", { f: fecha(g.actualizado, lang) })}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function FilaIndicador({ i, ciclo, lang, nuevo, edicion }: { i: PublicoIndicador; ciclo: PublicoCicloRef; lang: Lang; nuevo: boolean; edicion: number }) {
  return (
    <li className={`ugmp-ind ugmp-in${nuevo ? " is-new" : ""}`} id={`ind-${i.q}`}>
      <span className="ugmp-ind__code">
        {i.indicador ?? i.q}
        {i.calculado && <small>{tx(lang, "calculado")}</small>}
      </span>
      <div className="ugmp-ind__body">
        <h3>{i.nombre}</h3>
        {i.calculado ? <p>{tx(lang, "calculado_x")}</p> : <CuerpoIndicador i={i} lang={lang} />}
        {!i.calculado && (
          <>
            <h4 className="ugmp-evh">{tx(lang, "evidencias")}</h4>
            <Evidencias lista={i.evidencias ?? []} lang={lang} />
            <Link to={rutaEvidencia(i.q, lang, edicion)} className="opt-link">
              {tx(lang, "abrir_hoja")} <OdsPortalArrow />
            </Link>
          </>
        )}
      </div>
      <Valor i={i} ciclo={ciclo} lang={lang} />
    </li>
  );
}

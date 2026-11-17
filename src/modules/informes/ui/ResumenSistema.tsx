/* =============================================================================
   Informes Institucionales · lo que el sistema ya cargó, dentro del informe.

   Cuatro vistas de lo mismo (informe_resumen_gestion, 0282):
     ConexionesPilar     en «Alineación estratégica»: por pilar, sus indicadores
                         de Impacto (metas y cifras) y las acciones del plan.
     LoCargadoPorDimension  en «Resultados»: avances del plan y cifras de Impacto,
                         como SUGERIDOS que la unidad acepta o no.
     EvidenciasDelSistema   en «Evidencias y fuentes»: los enlaces de actividades,
                         seguimientos e indicadores, para volverlos anexos.
     LogrosDelSistema    en «Logros»: actividades cumplidas, como logros propuestos.

   Todo es de lectura y sugerencia; nada entra al informe sin que la unidad lo
   pida. Sin migración 0282, o sin datos, no se muestra nada.
   ========================================================================== */

import { useState } from "react";
import { conectarPorPilar, estaCumplida, evidenciasHalladas, FN_ETIQUETA, logrosSugeridos, resumenPorDimensionPlan, ultimaCifra } from "../resumen-gestion";
import type { LogroSugerido } from "../resumen-gestion";
import type { ResumenGestion, ResumenIndicador } from "../types";
import { mensajeDe } from "./comunes";

const num = (n: number | null | undefined, unidad = "") => (n === null || n === undefined ? "—" : `${Number.isInteger(n) ? n : n.toLocaleString("es-CO", { maximumFractionDigits: 2 })}${unidad}`);
const cifraTexto = (i: ResumenIndicador) => {
  const c = ultimaCifra(i);
  if (!c) return "Sin reportar";
  return `${c.valor !== null ? num(c.valor, i.unidad.trim() === "%" ? " %" : "") : c.texto} · ${c.anio}`;
};
const metaTexto = (i: ResumenIndicador) => i.meta_2026.texto.trim() || (i.meta_2026.num !== null ? num(i.meta_2026.num) : "—");
const enlace = (url: string, texto: string) => (
  <a className="inf-link" href={url} target="_blank" rel="noopener noreferrer">
    {texto}
  </a>
);

/** Indicadores de Impacto: código, qué es, dónde, meta 2026 y última cifra con su evidencia. */
function TablaIndicadores({ lista }: { lista: ResumenIndicador[] }) {
  if (!lista.length) return null;
  return (
    <div className="inf-tw">
      <table className="inf-tbl inf-tbl--sis">
        <thead>
          <tr>
            <th style={{ width: 70 }}>Código</th>
            <th>Indicador</th>
            <th>Meta 2026</th>
            <th>Última cifra</th>
            <th style={{ width: 90 }}>Evidencia</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((i) => {
            const c = ultimaCifra(i);
            return (
              <tr key={`${i.codigo}-${i.programa}-${i.sede_slug}`}>
                <td className="inf-num" data-lab="Código">{i.codigo}</td>
                <td data-lab="Indicador">
                  {i.nombre}
                  <small className="inf-anx-desc">
                    {FN_ETIQUETA[i.fn]} · {[i.programa, i.sede].filter(Boolean).join(" · ")}
                    {i.origen === "propio" ? " · propio del programa" : ""}
                  </small>
                </td>
                <td data-lab="Meta 2026">{metaTexto(i)}</td>
                <td data-lab="Última cifra">{cifraTexto(i)}</td>
                <td data-lab="Evidencia">{c?.evidencia ? enlace(c.evidencia, "Abrir") : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Alineación estratégica: lo del sistema que cuelga de un pilar. */
export function ConexionesPilar({ resumen, pilarId }: { resumen: ResumenGestion | null; pilarId: string }) {
  if (!resumen) return null;
  const p = conectarPorPilar(resumen).find((x) => x.id === pilarId);
  if (!p) return null;
  return (
    <div className="inf-sis" aria-label="Lo que el sistema conecta con este pilar">
      <p className="inf-sis__t">Conectado a este pilar en el sistema</p>
      {p.indicadores.length > 0 && (
        <>
          <p className="inf-hint">Indicadores de Impacto alineados (confirmados) con este pilar.</p>
          <TablaIndicadores lista={p.indicadores} />
        </>
      )}
      {p.sugeridos.length > 0 && (
        <details className="inf-sug">
          <summary>{p.sugeridos.length} {p.sugeridos.length === 1 ? "indicador sugerido" : "indicadores sugeridos"} por el motor, sin confirmar</summary>
          <TablaIndicadores lista={p.sugeridos} />
        </details>
      )}
      {p.acciones.length > 0 && (
        <>
          <p className="inf-hint">Acciones del Plan de Trabajo de este pilar, con su último avance.</p>
          <ul className="inf-sis__acc">
            {p.acciones.map((a) => {
              const seg = [...a.seguimientos].filter((s) => s.avance !== null).pop();
              const hechas = a.actividades.filter((x) => estaCumplida(x.estado)).length;
              return (
                <li key={a.id}>
                  <b>{a.titulo}</b>
                  <small>
                    {a.dimension_nombre} · {hechas} de {a.actividades.length} {a.actividades.length === 1 ? "actividad cumplida" : "actividades cumplidas"}
                    {seg ? ` · avance ${seg.avance} % (${seg.corte})` : " · sin avance reportado"}
                  </small>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Resultados: los avances del plan por dimensión y las cifras de Impacto, como sugeridos. */
export function LoCargadoPorDimension({ resumen, editable, usarEnTexto }: { resumen: ResumenGestion | null; editable: boolean; usarEnTexto: (parrafo: string) => void }) {
  if (!resumen) return null;
  const dims = resumenPorDimensionPlan(resumen.plan.acciones);
  if (!dims.length && !resumen.indicadores.length) return null;
  return (
    <div className="inf-sis" aria-label="Lo que ya cargó el sistema">
      <p className="inf-sis__t">Lo que ya cargó el sistema · sugerido</p>
      <p className="inf-hint">Son avances y cifras que la unidad ya reportó en el Plan de Trabajo y en Impacto. Revíselos y, si le sirven, llévelos a su análisis.</p>
      {dims.length > 0 && (
        <div className="inf-tw">
          <table className="inf-tbl inf-tbl--sis">
            <thead>
              <tr>
                <th>Dimensión del plan</th>
                <th>Acciones</th>
                <th>Actividades cumplidas</th>
                <th>Avance</th>
                {editable && <th style={{ width: 150 }} aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {dims.map((d) => (
                <tr key={d.dimension}>
                  <td data-lab="Dimensión">{d.nombre}</td>
                  <td data-lab="Acciones">{d.acciones}</td>
                  <td data-lab="Actividades">{d.actividadesCumplidas} de {d.actividades}</td>
                  <td data-lab="Avance">{d.avance === null ? "Sin reportar" : `${d.avance} %`}</td>
                  {editable && (
                    <td>
                      <button
                        type="button"
                        className="inf-btn inf-btn--sm"
                        onClick={() =>
                          usarEnTexto(
                            `En la dimensión ${d.nombre}, el plan de trabajo registra ${d.acciones} ${d.acciones === 1 ? "acción" : "acciones"}, con ${d.actividadesCumplidas} de ${d.actividades} actividades cumplidas${d.avance === null ? "" : ` y un avance promedio de ${d.avance} %`}.`,
                          )
                        }
                      >
                        Añadir al análisis
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resumen.indicadores.length > 0 && (
        <>
          <p className="inf-hint" style={{ marginTop: "var(--space-3)" }}>Indicadores de Impacto que sigue la unidad, con su última cifra.</p>
          <TablaIndicadores lista={resumen.indicadores} />
        </>
      )}
    </div>
  );
}

/** Evidencias: los enlaces que ya existen en el sistema, listos para volverlos anexos numerados. */
export function EvidenciasDelSistema({
  resumen,
  editable,
  enlazarTodas,
}: {
  resumen: ResumenGestion | null;
  editable: boolean;
  enlazarTodas: (e: { url: string; nombre: string; descripcion: string }[]) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  if (!resumen) return null;
  const todas = evidenciasHalladas(resumen);
  if (!todas.length) return null;
  const nuevas = todas.filter((e) => !e.yaAnexo);
  const anexar = async (lista: typeof nuevas) => {
    setOcupado(true);
    setError("");
    try {
      await enlazarTodas(lista.map((e) => ({ url: e.url, nombre: e.origen.slice(0, 120), descripcion: e.origen })));
    } catch (e) {
      setError(mensajeDe(e));
    }
    setOcupado(false);
  };
  return (
    <div className="inf-sis" aria-label="Evidencias que ya están en el sistema">
      <p className="inf-sis__t">Evidencias de actividades e indicadores</p>
      <p className="inf-hint">Enlaces que la unidad ya cargó en el Plan de Trabajo y en Impacto. Al anexarlos, quedan numerados y se pueden citar en los logros.</p>
      <ul className="inf-sis__ev">
        {todas.map((e) => (
          <li key={e.url}>
            <span>
              {e.origen}
              <small>{enlace(e.url, e.url.length > 60 ? `${e.url.slice(0, 57)}…` : e.url)}</small>
            </span>
            {e.yaAnexo ? (
              <span className="inf-pill is-ok">Ya es anexo</span>
            ) : (
              editable && (
                <button type="button" className="inf-btn inf-btn--sm" disabled={ocupado} onClick={() => void anexar([e])}>
                  Añadir como anexo
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      {editable && nuevas.length > 1 && (
        <button type="button" className="inf-btn" disabled={ocupado} onClick={() => void anexar(nuevas)}>
          {ocupado ? "Añadiendo…" : `Añadir las ${nuevas.length} como anexos`}
        </button>
      )}
      {error && (
        <p className="inf-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Logros: las actividades cumplidas del plan, propuestas con su resultado y evidencia. */
export function LogrosDelSistema({ resumen, editable, agregar, yaEstan }: { resumen: ResumenGestion | null; editable: boolean; agregar: (l: LogroSugerido) => void; yaEstan: string[] }) {
  if (!resumen) return null;
  const sugeridos = logrosSugeridos(resumen).filter((l) => !yaEstan.some((t) => t.trim().toLowerCase() === l.titulo.trim().toLowerCase()));
  if (!sugeridos.length) return null;
  return (
    <div className="inf-sis" aria-label="Logros que propone el sistema">
      <p className="inf-sis__t">Logros que propone el sistema</p>
      <p className="inf-hint">Son actividades del Plan de Trabajo ya cumplidas. Añada solo las que merezcan contarse; cada una puede llevar su evidencia.</p>
      <ul className="inf-sis__ev">
        {sugeridos.map((l) => (
          <li key={l.titulo}>
            <span>
              {l.titulo}
              {l.resultado ? <small>{l.resultado}</small> : null}
            </span>
            {editable && (
              <button type="button" className="inf-btn inf-btn--sm" onClick={() => agregar(l)}>
                Añadir como logro
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

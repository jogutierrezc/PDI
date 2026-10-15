/* Warehouse UDES · Pilo analiza: el análisis escrito de las alertas, a partir de un resumen sin códigos de estudiante. */

import { useState } from "react";
import "./pilo.css";
import { analizarConPilo, mensajeDe, useEstadoPilo, type AnalisisPilo } from "./store";
import type { DatosParaPilo } from "./paraPilo";

const SUGERENCIAS = ["¿Dónde conviene concentrar las tutorías?", "¿Qué cursos pedirían apoyo de Gestión Curricular?", "¿Qué dice esto de la permanencia?"];

export function PanelPilo({ datos, etiqueta }: { datos: DatosParaPilo | null; etiqueta: string }) {
  const estado = useEstadoPilo();
  const [pregunta, setPregunta] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ analisis: AnalisisPilo; de: string } | null>(null);

  const pedir = async (q = pregunta) => {
    if (!datos) return;
    setCargando(true);
    setError(null);
    try {
      const r = await analizarConPilo(datos, q);
      setResultado({ analisis: r.analisis, de: etiqueta });
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setCargando(false);
    }
  };

  const sinIa = estado.data && !estado.data.ai;

  return (
    <section className="wh-panel wh-pilo" aria-labelledby="wh-pilo">
      <div className="wh-panel__cabeza">
        <div>
          <h2 id="wh-pilo">Pilo analiza</h2>
          <p className="wh-muted">
            Pilo lee un resumen (cuántos estudiantes hay en NE, ED y RS, por programa y por materia) y lo explica con lo que dice el estudio de la UDES. No recibe códigos de estudiante ni notas individuales.
          </p>
        </div>
        <span className="wh-etiqueta" data-t={estado.isPending ? undefined : sinIa ? "sin_politica" : "ok"}>
          {estado.isPending ? "Revisando" : sinIa ? "IA sin conectar" : "Listo"}
        </span>
      </div>
      <div className="wh-panel__cuerpo" style={{ display: "grid", gap: "var(--space-4)" }}>
        {sinIa && <p className="wh-aviso wh-aviso--ambar">{estado.data?.motivo ?? "La IA de Pilo no está lista."}</p>}
        {estado.error && <p className="wh-aviso wh-aviso--ambar">{mensajeDe(estado.error)}</p>}
        <div className="wh-fila">
          <label className="wh-campo" style={{ flex: "1 1 280px" }}>
            <span className="sr-only">Pregunta para Pilo</span>
            <input value={pregunta} maxLength={400} onChange={(e) => setPregunta(e.target.value)} placeholder="Una pregunta opcional para Pilo…" onKeyDown={(e) => e.key === "Enter" && !cargando && void pedir()} style={{ width: "100%" }} />
          </label>
          <button type="button" className="button-primary" disabled={!datos || cargando || Boolean(sinIa)} onClick={() => void pedir()}>
            {cargando ? "Pilo está leyendo…" : resultado ? "Analizar de nuevo" : "Pedirle a Pilo que analice"}
          </button>
        </div>
        <div className="wh-fila">
          {SUGERENCIAS.map((s) => (
            <button key={s} type="button" className="wh-chip" disabled={!datos || cargando || Boolean(sinIa)} onClick={() => (setPregunta(s), void pedir(s))}>
              {s}
            </button>
          ))}
        </div>
        {!datos && <p className="wh-muted">No hay estudiantes con notas en este alcance.</p>}
        {error && (
          <p className="wh-aviso wh-aviso--rojo" role="alert">
            {error}
          </p>
        )}
        {cargando && <div className="wh-progreso" role="status" aria-label="Pilo está analizando"><i className="wh-progreso__ir" /></div>}

        {resultado && !cargando && (
          <article className="wh-informe" aria-live="polite">
            <p className="wh-nota-chica">
              Análisis de {resultado.de}
            </p>
            <h3>{resultado.analisis.titular}</h3>
            <p>{resultado.analisis.resumen}</p>
            <ol className="wh-hallazgos">
              {resultado.analisis.hallazgos.map((h, i) => (
                <li key={i} style={{ animationDelay: `${i * 70}ms` }}>
                  <b>{h.titulo}</b>
                  <span>{h.evidencia}</span>
                  <em>
                    {h.accion} <small>— {h.responsable}</small>
                  </em>
                </li>
              ))}
            </ol>
            {resultado.analisis.prioridades.length > 0 && (
              <>
                <h4>Por dónde empezar</h4>
                <ol className="wh-prioridades">
                  {resultado.analisis.prioridades.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </>
            )}
            {resultado.analisis.limites.length > 0 && (
              <>
                <h4>Lo que estos datos no permiten afirmar</h4>
                <ul className="wh-limites">
                  {resultado.analisis.limites.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </>
            )}
            {resultado.analisis.avisos.length > 0 && <p className="wh-aviso wh-aviso--ambar">{resultado.analisis.avisos.join(" ")}</p>}
            <p className="wh-nota-chica">Pilo explica y sugiere; no decide ni sanciona. Las cifras salen de este resumen y del estudio de la UDES (Pérez et al., 2023).</p>
          </article>
        )}
      </div>
    </section>
  );
}

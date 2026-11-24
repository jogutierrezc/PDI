/* =============================================================================
   Informes ODS con Pilo · ficha de hechos y «Así lo evaluaría THE».

   · FichaEditor: la ficha de una evidencia (respuesta directa, quién, qué,
     cuándo, dónde, cuántos, beneficiarios, aliados, tipo y periodo), en
     inglés como la lee THE, con la respuesta también en español. Se edita a
     mano; lo que falta y lo que la página no debe tener (reglasPagina) se
     dice antes de aprobar.
   · Evaluador: Pilo hace de evaluador de THE (piloEvaluar) con la misma
     pregunta y el mismo texto de la página: calificación, confianza,
     razones, qué falta y riesgos. «Mejorar la ficha» (piloMejorar) completa
     datos que la nota sí da y vuelve a evaluar: antes y después. Es una
     simulación: nunca aprueba; aprobar es de una persona.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { piloEvaluar, piloMejorar } from "./datos";
import type { RespuestaMejorar } from "./datos";
import { CAMPOS_FICHA, fichaCompleta, leerFicha, reglasPagina } from "./pagina";
import type { FichaEvidencia } from "./pagina";
import type { Evaluacion } from "./tipos";

const errorTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const CALIFICACION: Record<Evaluacion["grade"], { es: string; tono: "ok" | "warn" | "bad" }> = {
  s: { es: "Específica", tono: "ok" },
  g: { es: "Genérica", tono: "warn" },
  n: { es: "Irrelevante", tono: "bad" },
};

export const AVISO_SIMULACION = "Esto es una simulación de Pilo, no la calificación de THE. Pilo nunca aprueba: aprobar es de una persona.";

type Clave = keyof FichaEvidencia;
const TEXTOS: { k: Clave; label: string; largo?: boolean; lang: "es" | "en" }[] = [
  { k: "answer", label: "Respuesta directa (inglés)", largo: true, lang: "en" },
  { k: "answer_es", label: "Respuesta directa (español)", largo: true, lang: "es" },
  ...CAMPOS_FICHA.map((c) => ({ k: c.k, label: `${c.es} · ${c.en}`, lang: "en" as const })),
];

/** Los campos de la ficha que cambiaron entre dos versiones. */
export function cambiosFicha(antes: Partial<FichaEvidencia> | null | undefined, despues: Partial<FichaEvidencia> | null | undefined): { k: Clave; antes: string; despues: string }[] {
  const a = leerFicha(antes);
  const d = leerFicha(despues);
  return (["answer", "answer_es", ...CAMPOS_FICHA.map((c) => c.k)] as Clave[])
    .map((k) => ({ k, antes: String(a[k] ?? ""), despues: String(d[k] ?? "") }))
    .filter((x) => x.antes !== x.despues);
}

export function FichaEditor({
  ficha,
  textoPagina,
  anio,
  guardando,
  onGuardar,
}: {
  ficha: Partial<FichaEvidencia> | undefined;
  textoPagina: string;
  anio: number;
  guardando: boolean;
  onGuardar: (f: FichaEvidencia) => void;
}) {
  const base = leerFicha(ficha);
  const [f, setF] = useState<FichaEvidencia>(base);
  const firma = JSON.stringify(base);
  useEffect(() => setF(leerFicha(JSON.parse(firma))), [firma]);
  const cambiada = JSON.stringify(f) !== firma;
  const { faltan } = fichaCompleta(f);
  const reglas = textoPagina ? reglasPagina(textoPagina, anio) : [];
  const etiqueta = (k: Clave) => TEXTOS.find((t) => t.k === k)?.label ?? k;
  return (
    <section className="ri-card ri-ficha" aria-labelledby="ri-ficha-h">
      <div className="ri-edhead">
        <h3 id="ri-ficha-h" className="ri-h4">
          Ficha de hechos
        </h3>
        <span className="ri-mute">En inglés, como la lee THE. Un dato que la nota no da queda vacío: no se inventa.</span>
      </div>
      {f.question && (
        <p className="ri-rule" lang="en">
          <b>Question:</b> {f.question}
        </p>
      )}
      <div className="ri-ficha__grid">
        {TEXTOS.map((t) => (
          <label key={t.k} className={`ri-field${t.largo ? " ri-field--wide" : ""}`} lang={t.lang}>
            {t.label}
            {t.largo ? (
              <textarea className="ri-ta ri-ta--sm" value={String(f[t.k] ?? "")} onChange={(e) => setF({ ...f, [t.k]: e.target.value })} />
            ) : (
              <input type="text" value={String(f[t.k] ?? "")} onChange={(e) => setF({ ...f, [t.k]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      {faltan.length > 0 && <p className="ri-warn">Le falta a la ficha: {faltan.map((k) => etiqueta(k)).join(", ")}.</p>}
      {reglas.length > 0 && (
        <ul className="ri-reglas">
          {reglas.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="ri-row">
        <button type="button" className="button-primary rk-sm" disabled={!cambiada || guardando} onClick={() => onGuardar(f)}>
          Guardar la ficha
        </button>
        {cambiada && (
          <button type="button" className="button-ghost rk-sm" onClick={() => setF(base)}>
            Deshacer cambios
          </button>
        )}
      </div>
    </section>
  );
}

function Calificacion({ ev }: { ev: Evaluacion }) {
  const c = CALIFICACION[ev.grade];
  return (
    <div className="ri-eval__grade">
      <span className="ri-tag" data-tono={c.tono}>
        {c.es}
      </span>
      <span className="ri-mute">Confianza {Math.round((ev.confidence <= 1 ? ev.confidence * 100 : ev.confidence) || 0)} %</span>
      {ev.at && <span className="ri-mute">· {new Date(ev.at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</span>}
    </div>
  );
}

function Lista({ titulo, xs, k }: { titulo: string; xs: string[]; k: "y" | "w" | "n" }) {
  if (!xs.length) return null;
  return (
    <div className="ri-eval__list">
      <span className="ri-k">{titulo}</span>
      <ul className="ri-checks">
        {xs.map((x) => (
          <li key={x} data-k={k} lang="en">
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Evaluador({ report_id, indicator, ev, listo }: { report_id: string; indicator: string; ev: Evaluacion | null | undefined; listo: boolean }) {
  const cliente = useQueryClient();
  const [corre, setCorre] = useState<"" | "evaluar" | "mejorar">("");
  const [error, setError] = useState("");
  const [mejora, setMejora] = useState<RespuestaMejorar | null>(null);

  const correr = async (paso: "evaluar" | "mejorar") => {
    setCorre(paso);
    setError("");
    try {
      if (paso === "evaluar") await piloEvaluar({ report_id, indicator });
      else setMejora(await piloMejorar({ report_id, indicator }));
      void cliente.invalidateQueries({ queryKey: ["informe"] });
    } catch (e) {
      setError(`Pilo no pudo ${paso === "evaluar" ? "evaluar" : "mejorar la ficha"}: ${errorTexto(e)}`);
    } finally {
      setCorre("");
    }
  };

  const cambios = mejora ? cambiosFicha(mejora.antes.ficha, mejora.despues.ficha) : [];
  return (
    <section className="ri-card ri-eval" aria-labelledby="ri-eval-h">
      <div className="ri-edhead">
        <h3 id="ri-eval-h" className="ri-h4">
          Así lo evaluaría THE
        </h3>
        <div className="ri-row">
          <button type="button" className="button-secondary rk-sm ri-pilo-btn" disabled={!listo || Boolean(corre)} onClick={() => void correr("evaluar")}>
            {corre === "evaluar" ? "Pilo está evaluando…" : ev ? "Evaluar de nuevo" : "Evaluar"}
          </button>
          <button type="button" className="button-ghost rk-sm ri-pilo-btn" disabled={!listo || Boolean(corre)} onClick={() => void correr("mejorar")}>
            {corre === "mejorar" ? "Pilo está mejorando la ficha…" : "Mejorar la ficha"}
          </button>
        </div>
      </div>
      <p className="ri-sim" role="note">
        {AVISO_SIMULACION}
      </p>
      {!listo && <p className="ri-mute">Primero elige la nota de evidencia: Pilo evalúa la página tal como la verá THE.</p>}
      {ev ? (
        <>
          <Calificacion ev={ev} />
          <Lista titulo="Razones" xs={ev.reasons} k="y" />
          <Lista titulo="Qué falta para que sea específica" xs={ev.missing} k="w" />
          <Lista titulo="Riesgos" xs={ev.risks} k="n" />
        </>
      ) : (
        listo && <p className="ri-mute">Sin evaluación todavía.</p>
      )}
      {mejora && (
        <div className="ri-mejora" aria-live="polite">
          <span className="ri-k">Antes y después de mejorar la ficha</span>
          <div className="ri-mejora__grades">
            <div>
              <small>Antes</small>
              {mejora.antes.eval ? <Calificacion ev={mejora.antes.eval} /> : <span className="ri-mute">sin evaluar</span>}
            </div>
            <div>
              <small>Después</small>
              {mejora.despues.eval ? <Calificacion ev={mejora.despues.eval} /> : <span className="ri-mute">sin evaluar</span>}
            </div>
          </div>
          {cambios.length ? (
            <dl className="ri-mejora__diff">
              {cambios.map((c) => (
                <div key={c.k}>
                  <dt>{TEXTOS.find((t) => t.k === c.k)?.label ?? c.k}</dt>
                  <dd>
                    <del lang="en">{c.antes || "—"}</del>
                    <ins lang="en">{c.despues || "—"}</ins>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="ri-mute">Pilo no encontró en la nota datos que faltaran: la ficha quedó igual.</p>
          )}
        </div>
      )}
      {error && (
        <p className="ri-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

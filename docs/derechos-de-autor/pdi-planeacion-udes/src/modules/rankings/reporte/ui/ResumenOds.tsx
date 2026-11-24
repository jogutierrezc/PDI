/* Resumen de los 17 ODS: los priorizados al frente, con el avance apilado por estado. */

import { useRef, useState } from "react";
import { odsNombre, odsVars } from "../../ods";
import type { Indicador, Respuesta } from "../tipos";
import { resumenPorOds } from "../resumen";
import type { ResumenOds as FilaResumen } from "../resumen";
import { useContador, useCrecer, useEntrada, useIndicador } from "../../movimiento";
import { fmtNumero } from "./comunes";

interface Props {
  prioridades: number[];
  indicadores: Indicador[];
  respuestas: Respuesta[];
  onVerOds: (ods: number) => void;
}

/** Tramos de la barra apilada, en el orden del flujo; cada uno con su glifo en la leyenda. */
const TRAMOS = [
  { k: "ok", glifo: "●", texto: "aprobados" },
  { k: "sent", glifo: "◉", texto: "enviados" },
  { k: "draft", glifo: "◐", texto: "en borrador" },
  { k: "back", glifo: "↺", texto: "devueltos" },
] as const;

export function ResumenOds({ prioridades, indicadores, respuestas, onVerOds }: Props) {
  const [modo, setModo] = useState<"pri" | "todos">("pri");
  const rejilla = useRef<HTMLDivElement>(null);
  const seg = useRef<HTMLDivElement>(null);
  const porOds = new Map(resumenPorOds(indicadores, respuestas).map((f) => [f.ods, f]));
  const lista = Array.from({ length: 17 }, (_, i) => i + 1)
    .filter((n) => modo === "todos" || prioridades.includes(n))
    .sort((a, b) => Number(prioridades.includes(b)) - Number(prioridades.includes(a)) || a - b);
  const totalPri = prioridades.reduce((s, n) => s + (porOds.get(n)?.total ?? 0), 0);
  const okPri = prioridades.reduce((s, n) => s + (porOds.get(n)?.ok ?? 0), 0);

  useEntrada(rejilla, ".rk-rep-ods-card", modo);
  useCrecer(rejilla, ".rk-rep-apilada", { clave: modo });
  useIndicador(seg, "[aria-pressed='true']", modo, true);

  return (
    <section className="rk-rep-resumen" aria-labelledby="rk-rep-resumen-h">
      <header className="rk-rep-split">
        <div>
          <h3 id="rk-rep-resumen-h" className="rk-rep-h3">
            Resumen de los 17 ODS
          </h3>
          <p className="rk-rep-muted rk-rep-small">
            Priorizados: <b className="rk-rep-num">{fmtNumero(okPri, 0)}</b> de <b className="rk-rep-num">{fmtNumero(totalPri, 0)}</b> indicadores aprobados.
          </p>
        </div>
        <div className="rk-seg" role="group" aria-label="Qué ODS mostrar" ref={seg}>
          <span data-indicador aria-hidden="true" />
          <button type="button" aria-pressed={modo === "pri"} onClick={() => setModo("pri")}>
            Priorizados
          </button>
          <button type="button" aria-pressed={modo === "todos"} onClick={() => setModo("todos")}>
            Los 17
          </button>
        </div>
      </header>

      <ul className="rk-rep-leyenda" aria-label="Leyenda de la barra">
        {TRAMOS.map((t) => (
          <li key={t.k} data-k={t.k}>
            <i aria-hidden="true" />
            <span aria-hidden="true">{t.glifo}</span> {t.texto}
          </li>
        ))}
      </ul>

      <div className="rk-rep-ods-grid" ref={rejilla}>
        {lista.map((n) => (
          <TarjetaOds key={n} n={n} f={porOds.get(n)} pri={prioridades.includes(n)} onVer={() => onVerOds(n)} />
        ))}
      </div>
    </section>
  );
}

function TarjetaOds({ n, f, pri, onVer }: { n: number; f: FilaResumen | undefined; pri: boolean; onVer: () => void }) {
  const total = f?.total ?? 0;
  const ok = f?.ok ?? 0;
  const pct = useRef<HTMLElement>(null);
  const avance = Math.round((f?.avance ?? 0) * 100);
  useContador(pct, avance, (v) => `${Math.round(v)} %`);

  return (
    <button
      type="button"
      className={`rk-rep-ods-card ${pri ? "is-pri" : "is-off"}`}
      style={odsVars(n)}
      onClick={onVer}
      aria-label={`ODS ${n}, ${odsNombre(n)}: ${ok} de ${total} aprobados. Ver sus indicadores en la mesa`}
    >
      <span className="rk-rep-ods-cap">
        <b className="rk-rep-num">{n}</b>
        <span>{pri ? "Priorizado" : "Catálogo"}</span>
      </span>
      <span className="rk-rep-ods-bd">
        <b className="rk-rep-ods-nombre">{odsNombre(n)}</b>
        {total === 0 ? (
          <span className="rk-rep-muted rk-rep-small">Sin indicadores importados</span>
        ) : (
          <>
            <span className="rk-rep-ods-cifra">
              <b className="rk-rep-num" ref={pct}>
                {avance} %
              </b>
              <span className="rk-rep-num rk-rep-muted">
                {ok} de {total} aprobados
              </span>
            </span>
            <span className="rk-rep-barra" aria-hidden="true">
              <span className="rk-rep-apilada">
                {TRAMOS.map((t) => (f && f[t.k] > 0 ? <i key={t.k} data-k={t.k} style={{ flexGrow: f[t.k] }} /> : null))}
                {f && f.none > 0 && <i data-k="none" style={{ flexGrow: f.none }} />}
              </span>
            </span>
            <span className="rk-rep-ods-pie rk-rep-num">
              {f?.sent ?? 0} enviados · {f?.draft ?? 0} borrador · {f?.back ?? 0} devueltos
            </span>
          </>
        )}
      </span>
    </button>
  );
}

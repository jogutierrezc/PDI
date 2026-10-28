/* Datos en este equipo · el archivo se lee aquí (Web Worker); la IA solo recibe lo que la persona aprueba. */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../../rankings/movimiento";
import { marcarSenal } from "../api";
import { abrirArchivo, alCambiar, calcular, cerrarArchivo, datosAbiertos, esquemaPermitido, permitirColumna } from "../datos";
import type { Agregado } from "../datos";
import { IC, Tg, useEntra, useWork } from "../ui";

const OPS: [string, string][] = [["contar", "Contar filas"], ["promedio", "Promedio"], ["suma", "Suma"], ["maximo", "Máximo"], ["minimo", "Mínimo"]];

export function Datos() {
  const { perfil, toast, setPedido, ir, filas, setEsquema } = useWork();
  const d = useSyncExternalStore(alCambiar, datosAbiertos);
  const [sobre, setSobre] = useState(false);
  const [leyendo, setLeyendo] = useState("");
  const [op, setOp] = useState("contar");
  const [col, setCol] = useState("");
  const [grupo, setGrupo] = useState("");
  const [res, setRes] = useState<Agregado | null>(null);
  const [error, setError] = useState("");
  const barra = useRef<HTMLDivElement>(null);
  const raiz = useEntra(".box", d?.nombre ?? "sin", 12);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => setEsquema(esquemaPermitido()), [d, setEsquema]);

  const cargar = async (f: File) => {
    setError("");
    setLeyendo(f.name);
    if (barra.current && !movimientoReducido()) gsap.fromTo(barra.current, { scaleX: 0 }, { scaleX: 0.9, duration: 4, ease: "power1.out" });
    try {
      const a = await abrirArchivo(f);
      setRes(null);
      setCol(a.columnas.find((c) => c.tipo === "numero" && !c.sensible)?.nombre ?? "");
      setGrupo(a.columnas.find((c) => c.tipo === "texto" && !c.sensible)?.nombre ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el archivo.");
    }
    setLeyendo("");
  };

  const preguntar = async () => {
    setError("");
    try {
      const r = await calcular(op, col, grupo, 12);
      setRes(r);
      void marcarSenal(perfil.userId, "datos:conteo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular.");
    }
  };
  useEffect(() => {
    if (!res || movimientoReducido()) return;
    gsap.fromTo(".pwk .bar .tr i", { scaleX: 0.08 }, { scaleX: 1, duration: 0.5, ease: "expo.out", stagger: 0.04 });
  }, [res]);

  if (!d) {
    return (
      <div className="pad" style={{ display: "grid", gap: 16, maxWidth: 900, margin: "0 auto" }} ref={raiz}>
        <div className="box">
          <h2>Sus datos se leen aquí, no en la nube</h2>
          <p className="muted" style={{ maxWidth: "62ch" }}>
            Suelte un Excel o CSV. El navegador lo abre en este equipo. La IA recibe la pregunta y los nombres de columnas; los cálculos los hace su computador. Usted decide si algún resumen sale.
          </p>
          <div
            className={`drop${sobre ? " over" : ""}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setSobre(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(true);
            }}
            onDragLeave={() => setSobre(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(false);
              const f = e.dataTransfer.files[0];
              if (f) void cargar(f);
            }}
          >
            <div className="ico">{IC.data}</div>
            <b>Arrastre un archivo aquí</b>
            <span className="hint">.xlsx · .csv · se abre en este equipo</span>
            <button type="button" className="btn primary" onClick={() => entrada.current?.click()} disabled={Boolean(leyendo)}>
              Elegir archivo
            </button>
            <input ref={entrada} type="file" hidden accept=".xlsx,.csv,.txt" onChange={(e) => e.target.files?.[0] && void cargar(e.target.files[0])} />
          </div>
          {leyendo && (
            <>
              <div className="scan">
                <b ref={barra} />
              </div>
              <p className="hint">Leyendo {leyendo} en este equipo…</p>
            </>
          )}
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  const numericas = d.columnas.filter((c) => c.tipo === "numero" && c.compartir);
  const agrupables = d.columnas.filter((c) => c.compartir && c.tipo !== "numero");
  const mx = Math.max(1, ...(res?.resultado.map((r) => Math.abs(r.valor)) ?? [1]));
  return (
    <div className="pad" style={{ display: "grid", gap: 16 }} ref={raiz}>
      <div className="box">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h2>{d.nombre}</h2>
          <span className="badge ok">{d.total.toLocaleString("es-CO")} filas · abierto en este equipo</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setRes(null);
              void cerrarArchivo();
            }}
          >
            Cambiar archivo
          </button>
        </div>
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                {d.columnas.map((c) => (
                  <th key={c.nombre}>
                    {c.nombre}
                    {c.sensible && (
                      <span role="img" aria-label="Columna sensible" title="Columna sensible" style={{ display: "inline-block", width: 13, height: 13, marginLeft: 5, verticalAlign: -2 }}>
                        {IC.lock}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.muestra.map((f, i) => (
                <tr key={i}>
                  {f.map((v, j) => (
                    <td key={j} className={d.columnas[j].sensible ? "lock" : v != null && typeof v === "number" ? "num" : ""}>
                      {v == null ? "" : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid2">
        <div className="box">
          <h2>Lo que verá la IA</h2>
          <p className="hint">Marque lo que puede salir de este equipo. Las columnas sensibles se detectaron solas y quedan cerradas.</p>
          <ul className="sees">
            {d.columnas.map((c) => (
              <li key={c.nombre} className={c.sensible ? "no" : ""}>
                <span className="ico" style={{ width: 26, height: 26, ...(c.sensible ? { background: "var(--risk-soft)", color: "var(--risk)" } : {}) }}>
                  {c.sensible ? IC.lock : IC.data}
                </span>
                <div>
                  <b>{c.nombre}</b> · {c.tipo}
                  {c.sensible && <div className="small muted">{c.motivo}</div>}
                </div>
                {c.sensible ? <span className="badge risk">Cerrada</span> : <Tg on={c.compartir} onChange={(v) => permitirColumna(c.nombre, v)} label={`Compartir el esquema de ${c.nombre}`} />}
              </li>
            ))}
          </ul>
          <div className="chip local" style={{ width: "fit-content" }}>
            <i />
            <span>{filas} filas enviadas</span>
          </div>
        </div>
        <div className="box">
          <h2>Pregúntele a sus datos</h2>
          <div className="row2">
            <div className="field">
              <label htmlFor="d-op">Qué calcular</label>
              <select className="inp" id="d-op" value={op} onChange={(e) => setOp(e.target.value)}>
                {OPS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="d-col">De la columna</label>
              <select className="inp" id="d-col" value={col} disabled={op === "contar"} onChange={(e) => setCol(e.target.value)}>
                <option value="">—</option>
                {numericas.map((c) => (
                  <option key={c.nombre}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="d-gr">Agrupado por</label>
            <select className="inp" id="d-gr" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              <option value="">Sin agrupar</option>
              {agrupables.map((c) => (
                <option key={c.nombre}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn primary" onClick={() => void preguntar()}>
              Calcular aquí
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPedido(`Analiza el archivo «${d.nombre}»: dame un resumen con los agregados más útiles por ${grupo || "las columnas permitidas"}.`);
                ir("chat");
                toast("En el chat, Pilo le pedirá permiso antes de que salga cualquier resumen");
              }}
            >
              Pedirle a Pilo que lo analice
            </button>
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          <div className="bars">
            {res?.resultado.map((r) => (
              <div className="bar" key={r.grupo}>
                <span>{r.grupo}</span>
                <div className="tr">
                  <i style={{ width: `${Math.max(2, (Math.abs(r.valor) / mx) * 100)}%` }} />
                </div>
                <b className="num">{r.valor.toLocaleString("es-CO")}</b>
              </div>
            ))}
            {!res && <p className="hint">Elija una pregunta. El cálculo se hace en su computador.</p>}
          </div>
          {res && <p className="hint">Calculado aquí con {res.total.toLocaleString("es-CO")} filas. A la IA no se envió nada.</p>}
        </div>
      </div>
    </div>
  );
}

/* Warehouse UDES · Catálogo: los conjuntos, cómo se piden y qué se guarda de cada uno. */

import { useMemo, useState } from "react";
import { CONJUNTOS, ENTREGAS, ESTADOS, SISTEMAS, TIPOS, VIAS, cargaPorArchivo, pideSolo, type Conjunto, type Sistema, type TipoConjunto } from "./conjuntos";
import { usePoliticas, type Cobertura } from "./store";
import type { Contexto } from "./Warehouse";

export function Catalogo({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const [sistema, setSistema] = useState<Sistema | "todos">("todos");
  const [tipo, setTipo] = useState<TipoConjunto | "todos">("todos");
  const [q, setQ] = useState("");
  const [elegido, setElegido] = useState<string>(ctx.params.get("conjunto") ?? CONJUNTOS[0].id);
  const politicas = usePoliticas();

  const lista = useMemo(
    () =>
      CONJUNTOS.filter(
        (c) =>
          (sistema === "todos" || c.sistema === sistema) &&
          (tipo === "todos" || c.tipo === tipo) &&
          (!q.trim() || `${c.nombre} ${c.ruta} ${c.id}`.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [sistema, tipo, q],
  );
  const c: Conjunto = CONJUNTOS.find((x) => x.id === elegido) ?? CONJUNTOS[0];
  const politica = politicas.data?.find((p) => p.conjunto === c.id);
  const guardados = cobertura.filter((x) => x.conjunto === c.id);

  return (
    <div className="wh-dos">
      <section className="wh-panel">
        <div className="wh-panel__cabeza">
          <h2>{lista.length} conjuntos</h2>
          <div className="wh-fila">
            <label className="wh-campo">
              <span className="sr-only">Buscar</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar un conjunto" />
            </label>
            <select className="wh-select" value={sistema} onChange={(e) => setSistema(e.target.value as Sistema | "todos")} aria-label="Plataforma">
              <option value="todos">Todas las plataformas</option>
              {(Object.keys(SISTEMAS) as Sistema[]).map((s) => (
                <option key={s} value={s}>
                  {SISTEMAS[s].nombre}
                </option>
              ))}
            </select>
            <select className="wh-select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoConjunto | "todos")} aria-label="Tipo">
              <option value="todos">Todos los tipos</option>
              {(Object.keys(TIPOS) as TipoConjunto[]).map((t) => (
                <option key={t} value={t}>
                  {TIPOS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="wh-tabla-envuelta">
          <table className="wh-tabla">
            <thead>
              <tr>
                <th scope="col">Conjunto</th>
                <th scope="col">Plataforma</th>
                <th scope="col">Tipo</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.id} tabIndex={0} data-sel={x.id === c.id} onClick={() => setElegido(x.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setElegido(x.id))}>
                  <td>{x.nombre}</td>
                  <td>{SISTEMAS[x.sistema].nombre}</td>
                  <td>{TIPOS[x.tipo]}</td>
                  <td>
                    <span className="wh-etiqueta" data-t={x.estado}>
                      {ESTADOS[x.estado]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="wh-panel" aria-label={`Detalle de ${c.nombre}`}>
        <div className="wh-panel__cabeza">
          <h2>{c.nombre}</h2>
          <span className="wh-etiqueta" data-t={c.estado}>
            {ESTADOS[c.estado]}
          </span>
        </div>
        <div className="wh-panel__cuerpo" style={{ display: "grid", gap: "var(--space-4)" }}>
          <div>
            <p className="wh-muted">Petición</p>
            <code className="wh-codigo">
              {c.metodo} {c.ruta}
            </code>
          </div>
          <dl style={{ display: "grid", gap: "var(--space-2)", margin: 0 }}>
            <Dato t="Cuerpo" v={c.cuerpo} />
            <Dato t="El periodo viaja por" v={VIAS[c.via]} />
            <Dato t="Entrega" v={ENTREGAS[c.entrega]} />
            <Dato t="Capturado en" v={c.har} />
            {c.porCorte && <Dato t="Cortes" v="1, 2, 3 y definitiva: una carga por corte" />}
          </dl>
          <div>
            <p className="wh-muted">Qué se guarda</p>
            <p>{c.privacidad}</p>
            {politica && politica.seudonimizar.length > 0 && (
              <p className="wh-nota-chica">Seudonimizado en la base: {politica.seudonimizar.join(", ")}.</p>
            )}
            {politica && politica.modo === "permitir" && (
              <p className="wh-nota-chica">
                Columnas que se conservan: <span className="wh-mono">{politica.lista.join(", ")}</span>
              </p>
            )}
          </div>
          {c.nota && <p className="wh-aviso">{c.nota}</p>}
          <p className="wh-muted">{pideSolo(c) ? "El servidor sabe pedirlo solo." : "Aún no se pide solo: se carga con el Excel descargado."}</p>
          <p className="wh-muted">
            {guardados.length ? `${guardados.length} cargas vigentes guardadas.` : "Aún no hay nada guardado de este conjunto."}
          </p>
          {(cargaPorArchivo(c) || pideSolo(c)) && (
            <div>
              <button type="button" className="button-primary" onClick={() => ctx.ir("cargas", { conjunto: c.id })}>
                Cargar {c.nombre.toLowerCase()}
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt className="wh-muted">{t}</dt>
      <dd style={{ margin: 0 }}>{v}</dd>
    </div>
  );
}

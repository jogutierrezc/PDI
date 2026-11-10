/* Warehouse UDES · Catálogo: los conjuntos agrupados por tema, con su cobertura por periodo.
   El detalle abre con lo que importa (qué columnas se guardan y cuáles son datos personales) y deja
   plegado lo técnico (la petición a la plataforma). */

import { Fragment, useMemo, useState } from "react";
import { CONJUNTOS, ENTREGAS, ESTADOS, GRUPOS, SISTEMAS, TIPOS, VIAS, agrupar, cargaPorArchivo, pideSolo, type Conjunto, type Sistema } from "./conjuntos";
import { reportePorId } from "./reportes";
import { usePerfil, usePoliticas, type Cobertura } from "./store";
import type { Contexto } from "./Warehouse";

const etiqueta = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
type FiltroEstado = "todos" | Conjunto["estado"];

export function Catalogo({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const [sistema, setSistema] = useState<Sistema | "todos">("todos");
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [q, setQ] = useState("");
  const [elegido, setElegido] = useState<string>(ctx.params.get("conjunto") ?? CONJUNTOS[0].id);
  const politicas = usePoliticas();

  // Los seis periodos más recientes con algo guardado en esta sede, del más viejo al más nuevo.
  const recientes = useMemo(() => [...new Set(cobertura.filter((c) => c.sede === ctx.sede && c.periodo !== "permanente").map((c) => c.periodo))].sort().slice(-6), [cobertura, ctx.sede]);
  const guardado = (id: string, p: string) => cobertura.some((c) => c.sede === ctx.sede && c.conjunto === id && c.periodo === p);

  const lista = useMemo(
    () =>
      CONJUNTOS.filter(
        (c) =>
          (sistema === "todos" || c.sistema === sistema) &&
          (estado === "todos" || c.estado === estado) &&
          (!q.trim() || `${c.nombre} ${c.ruta} ${c.id}`.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [sistema, estado, q],
  );
  const c: Conjunto = CONJUNTOS.find((x) => x.id === elegido) ?? CONJUNTOS[0];
  const politica = politicas.data?.find((p) => p.conjunto === c.id);
  const guardados = cobertura.filter((x) => x.conjunto === c.id && x.sede === ctx.sede);
  const ultima = [...guardados].sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
  const perfil = usePerfil(ultima?.id ?? null);

  const tratamiento = (col: string, personal: boolean) => (personal ? "Dato personal" : politica?.seudonimizar.includes(col) ? "Seudónimo" : "Se conserva");

  return (
    <div className="wh-dos">
      <section className="wh-panel">
        <div className="wh-panel__cabeza">
          <h2>
            {lista.length} de {CONJUNTOS.length} conjuntos
          </h2>
          <label className="wh-campo">
            <span className="sr-only">Buscar</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar un conjunto…" aria-label="Buscar un conjunto" />
          </label>
        </div>
        <div className="wh-panel__cabeza wh-fila" role="group" aria-label="Filtros">
          {(Object.keys(SISTEMAS) as Sistema[]).map((s) => (
            <button key={s} type="button" className="wh-chip" aria-pressed={sistema === s} onClick={() => setSistema(sistema === s ? "todos" : s)}>
              {SISTEMAS[s].nombre}
            </button>
          ))}
          {(["listo", "sin_politica", "sin_har"] as const).map((e) => (
            <button key={e} type="button" className="wh-chip" aria-pressed={estado === e} onClick={() => setEstado(estado === e ? "todos" : e)}>
              {ESTADOS[e]}
            </button>
          ))}
        </div>
        <div className="wh-catalogo-lista">
          {agrupar(lista).map((g) => (
            <Fragment key={g.grupo}>
              <h3 className="wh-grupo">
                {GRUPOS[g.grupo].nombre}
                <small> · {GRUPOS[g.grupo].detalle}</small>
              </h3>
              {g.conjuntos.map((x) => (
                <button key={x.id} type="button" className="wh-fila-cat" aria-pressed={x.id === c.id} onClick={() => setElegido(x.id)}>
                  <span>
                    <b>{x.nombre}</b>
                    <small className="wh-muted">
                      {SISTEMAS[x.sistema].nombre} · {TIPOS[x.tipo]}
                      {reportePorId(x.id)?.verificado === false ? " · sin verificar" : ""}
                    </small>
                  </span>
                  <span className="wh-tira" aria-label={x.tipo === "hecho" ? "Cobertura de los últimos periodos" : "No depende de un periodo"}>
                    {x.tipo === "hecho" ? recientes.map((p) => <i key={p} data-on={guardado(x.id, p)} title={`${p}: ${guardado(x.id, p) ? "guardado" : "sin cargar"}`} />) : null}
                  </span>
                  <span className="wh-etiqueta" data-t={x.estado}>
                    {ESTADOS[x.estado]}
                  </span>
                </button>
              ))}
            </Fragment>
          ))}
          {lista.length === 0 && <p className="wh-panel__cuerpo wh-muted">Ningún conjunto coincide con el filtro.</p>}
        </div>
      </section>

      <aside className="wh-panel" aria-label={`Detalle de ${c.nombre}`}>
        <div className="wh-panel__cabeza">
          <div>
            <h2>{c.nombre}</h2>
            <p className="wh-muted">
              {SISTEMAS[c.sistema].nombre} · {TIPOS[c.tipo]}
            </p>
          </div>
          <span className="wh-etiqueta" data-t={c.estado}>
            {ESTADOS[c.estado]}
          </span>
        </div>
        <div className="wh-panel__cuerpo wh-pila">
          <div>
            <h3>Qué se guarda</h3>
            <p>{c.privacidad}</p>
          </div>
          {perfil.data ? (
            <div className="wh-tabla-envuelta">
              <table className="wh-tabla">
                <thead>
                  <tr>
                    <th scope="col">Columna</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Tratamiento</th>
                  </tr>
                </thead>
                <tbody>
                  {perfil.data.columnas.map((k) => (
                    <tr key={k.col}>
                      <td>{etiqueta(k.col)}</td>
                      <td>{{ numero: "Número", fecha: "Fecha", categoria: "Categoría", texto: "Texto", vacia: "Vacía" }[k.tipo]}</td>
                      <td data-personal={k.personal}>{tratamiento(k.col, k.personal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="wh-nota-chica">Perfil de la versión de {ultima?.periodo}, leído en la base.</p>
            </div>
          ) : politica && politica.modo === "permitir" ? (
            <p className="wh-nota-chica">
              Columnas que se conservan: <span className="wh-mono">{politica.lista.join(", ")}</span>
            </p>
          ) : (
            <p className="wh-nota-chica">Las columnas aparecen aquí cuando haya una carga guardada.</p>
          )}
          {politica && politica.seudonimizar.length > 0 && <p className="wh-nota-chica">Seudonimizado en la base: {politica.seudonimizar.join(", ")}.</p>}
          {c.nota && <p className="wh-aviso">{c.nota}</p>}
          <div>
            <h3>Cobertura</h3>
            <p className="wh-muted">{guardados.length ? `${guardados.length} cargas vigentes en esta sede.` : "Aún no hay nada guardado de este conjunto en esta sede."}</p>
            {guardados.length > 0 && (
              <p className="wh-fila wh-sep">
                {[...new Set(guardados.map((g) => g.periodo))].sort().map((p) => (
                  <span key={p} className="wh-etiqueta" data-t="ok">
                    {p}
                  </span>
                ))}
              </p>
            )}
          </div>
          <div className="wh-fila">
            {guardados.length > 0 && (
              <button type="button" className="button-primary" onClick={() => ctx.ir("explorar", { conjunto: c.id })}>
                Explorar
              </button>
            )}
            {(cargaPorArchivo(c) || pideSolo(c)) && (
              <button type="button" className={guardados.length ? "button-secondary" : "button-primary"} onClick={() => ctx.ir("cargas", { conjunto: c.id })}>
                Cargar
              </button>
            )}
          </div>
          <details className="wh-tecnico">
            <summary>Cómo se pide (técnico)</summary>
            <code className="wh-codigo">
              {c.metodo} {c.ruta}
            </code>
            <dl className="wh-pila">
              <Dato t="Cuerpo" v={c.cuerpo} />
              <Dato t="El periodo viaja por" v={VIAS[c.via]} />
              <Dato t="Entrega" v={ENTREGAS[c.entrega]} />
              <Dato t="Capturado en" v={c.har} />
              {c.porCorte && <Dato t="Cortes" v="1, 2, 3 y definitiva: una carga por corte" />}
            </dl>
            <p className="wh-muted">
              {pideSolo(c) ? "El servidor sabe pedirlo solo." : "Aún no se pide solo: se carga con el Excel descargado."}
              {cargaPorArchivo(c) ? " También se puede subir a mano el Excel descargado, con el mismo lector." : ""}
            </p>
          </details>
        </div>
      </aside>
    </div>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt className="wh-muted">{t}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/* Resultados por dimensión estratégica, en tres pasos: se eligen las dimensiones,
   en cada una se agregan indicadores de UDES en Cifras con un buscador y se
   obtiene la tabla (o la gráfica) con valor, año anterior, meta y semáforo.
   El detalle de cada cifra (fuente, meta, justificación) queda plegado. */

import { useMemo, useState } from "react";
import { filtrarCatalogo, informesDe, esSugerido } from "../catalogo";
import type { IndicadorOd, SedeRef } from "../catalogo";
import { formatoCifra, semaforo, variacion } from "../cifras-vivas";
import type { CifraVista } from "../cifras-vivas";
import type { DatosCifra } from "../datos";
import { DIMS } from "../plantillas";
import type { CifraRow, DimId, PilarRef } from "../types";
import { dimDeConsulta } from "../catalogo";
import { FormPropio, TileCifra, TilePropia } from "./Cifras";
import type { NuevoPropio } from "./Cifras";
import { SemaforoPill } from "./comunes";

type Destino = { tipo: "agregar" } | { tipo: "conectar"; clave: string };

export interface PropiaVista {
  fila: CifraRow;
  vista: CifraVista;
}

interface Props {
  dims: DimId[];
  vista: (clave: string) => CifraVista;
  agregadas: PropiaVista[];
  propias: PropiaVista[];
  editable: boolean;
  limite: number;
  exigirFuente: boolean;
  exigirPilar: boolean;
  pilares: PilarRef[];
  catalogo: { datos: IndicadorOd[]; cargando: boolean; error: Error | null };
  sedes: SedeRef[];
  guardar: (clave: string, d: DatosCifra) => void;
  /** Agrega un indicador nuevo a una dimensión. */
  agregarIndicador: (dim: DimId, i: IndicadorOd, sede: string) => void;
  /** Conecta una cifra de la plantilla a un indicador. */
  conectarIndicador: (clave: string, dim: DimId, i: IndicadorOd, sede: string) => void;
  agregarPropio: (p: NuevoPropio) => void;
  quitarCifra: (clave: string) => void;
}

/** Buscador de indicadores de UDES en Cifras. */
function Selector({
  dim,
  catalogo,
  sedes,
  cerrar,
  elegir,
}: {
  dim: DimId;
  catalogo: Props["catalogo"];
  sedes: SedeRef[];
  cerrar: () => void;
  elegir: (i: IndicadorOd, sede: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [informe, setInforme] = useState("");
  const [sede, setSede] = useState("");
  const informes = useMemo(() => informesDe(catalogo.datos), [catalogo.datos]);
  const lista = useMemo(() => filtrarCatalogo(catalogo.datos, texto, informe, dim), [catalogo.datos, texto, informe, dim]);
  const mostrados = lista.slice(0, 40);
  return (
    <div className="inf-pick">
      <div className="inf-pick__top">
        <input className="inf-in" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Busque un indicador: matrícula, deserción, grupos…" aria-label="Buscar indicador" />
        <select className="inf-in" value={informe} onChange={(e) => setInforme(e.target.value)} aria-label="Informe de UDES en Cifras">
          <option value="">Todos los informes</option>
          {informes.map((i) => (
            <option key={i.slug} value={i.slug}>
              {esSugerido(dim, i.slug) ? "★ " : ""}
              {i.nombre}
            </option>
          ))}
        </select>
        {sedes.length > 0 && (
          <select className="inf-in" value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
            <option value="">Toda la UDES</option>
            {sedes.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="inf-btn inf-btn--sm" onClick={cerrar}>
          Cerrar
        </button>
      </div>
      {catalogo.cargando && <p className="inf-muted">Leyendo los indicadores de UDES en Cifras…</p>}
      {catalogo.error && <p className="inf-error" role="alert">No se pudo leer el catálogo: {catalogo.error.message}</p>}
      {!catalogo.cargando && !catalogo.error && lista.length === 0 && <p className="inf-muted">No hay indicadores publicados que coincidan.</p>}
      <ul className="inf-pick__lista">
        {mostrados.map((i) => (
          <li key={`${i.informe}|${i.clave}`}>
            <button type="button" onClick={() => elegir(i, sede)}>
              <b>{i.nombre}</b>
              <span>
                {i.informeNombre}
                {i.unidad ? ` · ${i.unidad}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {lista.length > mostrados.length && <p className="inf-hint">Hay {lista.length - mostrados.length} más: escriba para acotar.</p>}
    </div>
  );
}

/** Tres barras (año anterior, actual, meta) de una cifra, a la escala de su propio máximo. */
function MiniGrafica({ c }: { c: CifraVista }) {
  const barras = [
    { n: "Año anterior", v: c.anterior, clase: "ant" },
    { n: "Actual", v: c.valor, clase: "act" },
    { n: "Meta", v: c.meta, clase: "meta" },
  ].filter((b): b is { n: string; v: number; clase: string } => b.v !== null);
  const max = Math.max(...barras.map((b) => Math.abs(b.v)), 1);
  return (
    <figure className="inf-chart">
      <figcaption>{c.etiqueta}</figcaption>
      {barras.map((b) => (
        <div className="inf-chart__fila" key={b.n}>
          <span>{b.n}</span>
          <i className={`inf-chart__barra is-${b.clase}`} style={{ width: `${Math.max(2, (Math.abs(b.v) / max) * 100)}%` }} />
          <b className="inf-num">{formatoCifra(b.v, c.unidad)}</b>
        </div>
      ))}
    </figure>
  );
}

function Dimension({
  dim,
  ultima,
  p,
  abrir,
}: {
  dim: DimId;
  ultima: boolean;
  p: Props;
  abrir: (d: Destino & { dim: DimId }) => void;
}) {
  const [vista, setVista] = useState<"tabla" | "grafica">("tabla");
  const [abierta, setAbierta] = useState<string | null>(null);
  const def = DIMS[dim];
  const delPlan = def.cifras.map(p.vista).filter((c) => c.condicion !== "no");
  const conectadas = delPlan.filter((c) => c.valor !== null || c.propia);
  const sinConectar = delPlan.filter((c) => !conectadas.includes(c));
  const agregadas = p.agregadas.filter((a) => dimDeConsulta(a.fila.consulta) === dim);
  const filas = [...conectadas.map((c) => ({ c, quitable: false })), ...agregadas.map((a) => ({ c: a.vista, quitable: true }))];

  return (
    <section className="inf-dim">
      <div className="inf-dim__top">
        <h4 className="inf-eyebrow">{def.titulo}</h4>
        {filas.length > 0 && (
          <div className="inf-seg" role="group" aria-label={`Vista de ${def.titulo}`}>
            <button type="button" aria-pressed={vista === "tabla"} onClick={() => setVista("tabla")}>
              Tabla
            </button>
            <button type="button" aria-pressed={vista === "grafica"} onClick={() => setVista("grafica")}>
              Gráfica
            </button>
          </div>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="inf-muted">
          {p.editable ? "Todavía no hay indicadores en esta dimensión. Agregue los que respalden su análisis." : "Esta dimensión no trae indicadores."}
        </p>
      ) : vista === "tabla" ? (
        <div className="inf-dimtab-wrap">
          <table className="inf-dimtab">
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                <th scope="col">Actual</th>
                <th scope="col">Anterior</th>
                <th scope="col">Meta</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ c, quitable }) => (
                <FilaCifra key={c.clave} c={c} quitable={quitable && p.editable} abierta={abierta === c.clave} alternar={() => setAbierta(abierta === c.clave ? null : c.clave)} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="inf-charts">
          {filas.map(({ c }) => (
            <MiniGrafica key={c.clave} c={c} />
          ))}
        </div>
      )}

      {p.editable && (
        <div className="inf-row">
          <button type="button" className="inf-btn inf-btn--sm inf-btn--pri" onClick={() => abrir({ tipo: "agregar", dim })}>
            + Agregar indicador
          </button>
        </div>
      )}

      {p.editable && sinConectar.length > 0 && (
        <details className="inf-sug">
          <summary>
            {sinConectar.length} {sinConectar.length === 1 ? "cifra sugerida" : "cifras sugeridas"} sin conectar
          </summary>
          <ul>
            {sinConectar.map((c) => (
              <li key={c.clave}>
                <span>
                  {c.etiqueta}
                  {c.condicion === "justificar" && <em> · la pide Planeación</em>}
                </span>
                <button type="button" className="inf-link" onClick={() => abrir({ tipo: "conectar", clave: c.clave, dim })}>
                  Conectar a un indicador
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {ultima && p.propias.length > 0 && (
        <div className="inf-tiles">
          {p.propias.map((x) => (
            <TilePropia key={x.fila.clave} c={x.vista} fila={x.fila} pilares={p.pilares} editable={p.editable} quitar={() => p.quitarCifra(x.fila.clave)} />
          ))}
        </div>
      )}
    </section>
  );
}

function FilaCifra({ c, quitable, abierta, alternar, p }: { c: CifraVista; quitable: boolean; abierta: boolean; alternar: () => void; p: Props }) {
  const delta = variacion(c.valor, c.anterior, c.unidad);
  const pide = c.condicion === "justificar" && !c.justificacion.trim();
  return (
    <>
      <tr className={c.incluida ? undefined : "is-off"}>
        <th scope="row">
          {c.etiqueta}
          <small>
            {c.congelada ? "Foto al enviar" : c.viva ? "En vivo" : "Fuente propia"}
            {c.cambio ? " · cambió" : ""}
            {pide ? " · falta justificar" : ""}
          </small>
        </th>
        <td className="inf-num">
          <b>{formatoCifra(c.valor, c.unidad)}</b>
        </td>
        <td className="inf-num">
          {formatoCifra(c.anterior, c.unidad)}
          {delta && <small> {delta}</small>}
        </td>
        <td className="inf-num">{formatoCifra(c.meta, c.unidad)}</td>
        <td>
          <SemaforoPill s={semaforo(c.valor, c.meta, c.mayorMejor)} />
        </td>
        <td className="inf-dimtab__acc">
          <button type="button" className="inf-link" onClick={alternar} aria-expanded={abierta}>
            {abierta ? "Cerrar" : "Detalle"}
          </button>
          {quitable && (
            <button type="button" className="inf-link" onClick={() => p.quitarCifra(c.clave)}>
              Quitar
            </button>
          )}
        </td>
      </tr>
      {abierta && (
        <tr className="inf-dimtab__det">
          <td colSpan={6}>
            <TileCifra c={c} editable={p.editable} guardar={(d) => p.guardar(c.clave, d)} />
          </td>
        </tr>
      )}
    </>
  );
}

export function Dimensiones(p: Props) {
  const [destino, setDestino] = useState<(Destino & { dim: DimId }) | null>(null);
  const [form, setForm] = useState(false);
  return (
    <div className="inf-autobox">
      {p.dims.map((d, i) => (
        <div key={d}>
          <Dimension dim={d} ultima={i === p.dims.length - 1} p={p} abrir={setDestino} />
          {destino?.dim === d && (
            <Selector
              dim={d}
              catalogo={p.catalogo}
              sedes={p.sedes}
              cerrar={() => setDestino(null)}
              elegir={(ind, sede) => {
                if (destino.tipo === "agregar") p.agregarIndicador(d, ind, sede);
                else p.conectarIndicador(destino.clave, d, ind, sede);
                setDestino(null);
              }}
            />
          )}
        </div>
      ))}
      {p.editable && (
        <div className="inf-row" style={{ marginTop: "var(--space-4)" }}>
          <button type="button" className="inf-btn inf-btn--sm" onClick={() => setForm(true)} disabled={p.propias.length >= p.limite || form}>
            Añadir un dato propio (sin UDES en Cifras)
          </button>
          <span className="inf-hint inf-num">
            {p.propias.length} de {p.limite} datos propios que permite Planeación
          </span>
        </div>
      )}
      {p.editable && form && (
        <FormPropio
          exigirFuente={p.exigirFuente}
          exigirPilar={p.exigirPilar}
          pilares={p.pilares}
          cancelar={() => setForm(false)}
          agregar={(x) => {
            p.agregarPropio(x);
            setForm(false);
          }}
        />
      )}
    </div>
  );
}

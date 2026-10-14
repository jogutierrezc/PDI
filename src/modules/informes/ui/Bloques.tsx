/* Los bloques del editor que no son texto ni cifras: pilares del PDI, metas,
   filas, logros, evidencias y anexos, y la matriz de indicadores. */

import { useState } from "react";
import type { DragEvent } from "react";
import { formatoCifra, numeroDe, resultadoMeta, semaforo } from "../cifras-vivas";
import type { CifraVista } from "../cifras-vivas";
import { MAX_ANEXO, urlAnexo } from "../datos";
import type { AnexoRow, Logro, Meta, PilarRef } from "../types";
import { SemaforoPill, fmtFecha, mensajeDe } from "./comunes";

const TONO_RESULTADO = { Superada: "is-ok", Cumplida: "is-teal", Parcial: "is-mid" } as const;

export function TablaPilares({ pilares, marcados, editable, cambiar }: { pilares: PilarRef[]; marcados: string[]; editable: boolean; cambiar: (ids: string[]) => void }) {
  if (!pilares.length) return <p className="inf-muted">No se pudieron leer los pilares del Plan de Desarrollo.</p>;
  return (
    <div className="inf-tw">
      <table className="inf-tbl">
        <thead>
          <tr>
            <th style={{ width: 64 }}>Articula</th>
            <th>Pilar</th>
            <th className="r">Avance</th>
          </tr>
        </thead>
        <tbody>
          {pilares.map((p) => {
            const on = marcados.includes(p.id);
            return (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!editable}
                    onChange={() => cambiar(on ? marcados.filter((x) => x !== p.id) : [...marcados, p.id])}
                    aria-label={`Articular con ${p.name}`}
                  />
                </td>
                <td>
                  <b>{p.numeral}.</b> {p.name}
                </td>
                <td className="r inf-num">
                  <b>{p.progress === null ? "—" : `${p.progress} %`}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TablaMetas({ metas, editable, cambiar }: { metas: Meta[]; editable: boolean; cambiar: (m: Meta[]) => void }) {
  const fijar = (i: number, m: Partial<Meta>) => cambiar(metas.map((x, j) => (j === i ? { ...x, ...m } : x)));
  return (
    <>
      <div className="inf-tw">
        <table className="inf-tbl">
          <thead>
            <tr>
              <th>Meta</th>
              <th className="r" style={{ width: 110 }}>
                Programado
              </th>
              <th className="r" style={{ width: 110 }}>
                Alcanzado
              </th>
              <th style={{ width: 120 }}>Resultado</th>
              {editable && <th style={{ width: 44 }} aria-label="Quitar" />}
            </tr>
          </thead>
          <tbody>
            {metas.map((m, i) => {
              const r = resultadoMeta(m.programado, m.alcanzado);
              return (
                <tr key={`${i}/${metas.length}`}>
                  <td>
                    <input value={m.meta} readOnly={!editable} onChange={(e) => fijar(i, { meta: e.target.value })} placeholder="Describa la meta" aria-label="Meta" />
                  </td>
                  <td>
                    <input
                      className="r inf-num"
                      inputMode="decimal"
                      defaultValue={m.programado ?? ""}
                      readOnly={!editable}
                      onBlur={(e) => fijar(i, { programado: numeroDe(e.target.value) })}
                      aria-label="Programado"
                    />
                  </td>
                  <td>
                    <input
                      className="r inf-num"
                      inputMode="decimal"
                      defaultValue={m.alcanzado ?? ""}
                      readOnly={!editable}
                      onBlur={(e) => fijar(i, { alcanzado: numeroDe(e.target.value) })}
                      aria-label="Alcanzado"
                    />
                  </td>
                  <td>{r ? <span className={`inf-pill ${TONO_RESULTADO[r]}`}>{r}</span> : <span className="inf-muted">—</span>}</td>
                  {editable && (
                    <td>
                      <button type="button" className="inf-btn inf-btn--ghost inf-btn--sm" onClick={() => cambiar(metas.filter((_, j) => j !== i))} aria-label="Quitar meta">
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && (
        <button type="button" className="inf-btn inf-btn--sm" style={{ justifySelf: "start" }} onClick={() => cambiar([...metas, { meta: "", programado: null, alcanzado: null }])}>
          Añadir meta
        </button>
      )}
    </>
  );
}

export function TablaFilas({ columnas, filas, editable, cambiar }: { columnas: string[]; filas: string[][]; editable: boolean; cambiar: (f: string[][]) => void }) {
  return (
    <>
      <div className="inf-tw">
        <table className="inf-tbl">
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c}>{c}</th>
              ))}
              {editable && <th style={{ width: 44 }} aria-label="Quitar" />}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                {columnas.map((c, x) => (
                  <td key={c}>
                    <input
                      value={f[x] ?? ""}
                      readOnly={!editable}
                      aria-label={c}
                      onChange={(e) => cambiar(filas.map((r, j) => (j === i ? columnas.map((_, k) => (k === x ? e.target.value : (r[k] ?? ""))) : r)))}
                    />
                  </td>
                ))}
                {editable && (
                  <td>
                    <button type="button" className="inf-btn inf-btn--ghost inf-btn--sm" onClick={() => cambiar(filas.filter((_, j) => j !== i))} aria-label="Quitar fila">
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <button type="button" className="inf-btn inf-btn--sm" style={{ justifySelf: "start" }} onClick={() => cambiar([...filas, columnas.map(() => "")])}>
          Añadir fila
        </button>
      )}
    </>
  );
}

export function Logros({ logros, anexos, editable, cambiar }: { logros: Logro[]; anexos: AnexoRow[]; editable: boolean; cambiar: (l: Logro[]) => void }) {
  const fijar = (i: number, l: Partial<Logro>) => cambiar(logros.map((x, j) => (j === i ? { ...x, ...l } : x)));
  return (
    <>
      <div className="inf-logros">
        {logros.map((l, i) => (
          <div key={i} className="inf-logro">
            <input className="inf-in" value={l.titulo} readOnly={!editable} onChange={(e) => fijar(i, { titulo: e.target.value })} placeholder="Logro" aria-label="Logro" />
            <textarea className="inf-in" value={l.resultado} readOnly={!editable} onChange={(e) => fijar(i, { resultado: e.target.value })} placeholder="Contexto y resultado" aria-label="Contexto y resultado" />
            <select className="inf-in" value={l.anexo ?? ""} disabled={!editable} onChange={(e) => fijar(i, { anexo: e.target.value ? Number(e.target.value) : null })} aria-label="Evidencia">
              <option value="">Evidencia…</option>
              {anexos.map((a) => (
                <option key={a.id} value={a.n}>
                  Anexo {a.n} · {a.nombre}
                </option>
              ))}
            </select>
            {editable && (
              <button type="button" className="inf-link" style={{ justifySelf: "start" }} onClick={() => cambiar(logros.filter((_, j) => j !== i))}>
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>
      {editable && logros.length < 3 && (
        <button type="button" className="inf-btn inf-btn--sm" style={{ justifySelf: "start" }} onClick={() => cambiar([...logros, { titulo: "", resultado: "", anexo: null }])}>
          Añadir logro
        </button>
      )}
      {!anexos.length && <p className="inf-hint">Cargue primero los archivos en «Evidencias» para enlazarlos a cada logro.</p>}
    </>
  );
}

/** Carga de evidencias: arrastrar o elegir archivos, o pegar un enlace. */
export function CargaEvidencias({ subir, enlazar, ocupado }: { subir: (f: File[]) => Promise<void>; enlazar: (url: string, nombre: string) => Promise<void>; ocupado: boolean }) {
  const [encima, setEncima] = useState(false);
  const [url, setUrl] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const tomar = async (lista: FileList | null) => {
    const archivos = [...(lista ?? [])];
    const grandes = archivos.filter((a) => a.size > MAX_ANEXO);
    setError(grandes.length ? `No se suben (pesan más de 15 MB): ${grandes.map((g) => g.name).join(", ")}` : "");
    const ok = archivos.filter((a) => a.size <= MAX_ANEXO);
    if (ok.length) await subir(ok).catch((e) => setError(mensajeDe(e)));
  };
  const soltar = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setEncima(false);
    void tomar(e.dataTransfer.files);
  };
  return (
    <>
      <label
        className={`inf-drop${encima ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 16V4m0 0l-4 4m4-4l4 4M5 20h14" />
        </svg>
        <b>{ocupado ? "Subiendo…" : "Suelte archivos o haga clic"}</b>
        <span>PDF, Word, Excel o imagen · hasta 15 MB</span>
        <input type="file" multiple className="inf-sr" disabled={ocupado} onChange={(e) => void tomar(e.target.files).then(() => (e.target.value = ""))} />
      </label>
      <div className="inf-form">
        <input className="inf-in" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (documento en línea)" aria-label="Enlace" />
        <input className="inf-in" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del documento" aria-label="Nombre del enlace" />
        <button
          type="button"
          className="inf-btn inf-btn--sm"
          disabled={!url.trim() || ocupado}
          onClick={() =>
            void enlazar(url.trim(), nombre)
              .then(() => {
                setUrl("");
                setNombre("");
                setError("");
              })
              .catch((e) => setError(mensajeDe(e)))
          }
        >
          Añadir enlace
        </button>
      </div>
      {error && (
        <p className="inf-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function TablaAnexos({ anexos, quitar }: { anexos: AnexoRow[]; quitar?: (a: AnexoRow) => void }) {
  const [error, setError] = useState("");
  if (!anexos.length) return <p className="inf-muted">Aún no hay archivos ni enlaces.</p>;
  const abrir = async (a: AnexoRow) => {
    try {
      window.open(await urlAnexo(a), "_blank", "noopener");
    } catch (e) {
      setError(mensajeDe(e));
    }
  };
  return (
    <>
      <div className="inf-tw">
        <table className="inf-tbl">
          <thead>
            <tr>
              <th style={{ width: 56 }}>N.º</th>
              <th>Archivo o enlace</th>
              <th style={{ width: 130 }}>Fecha</th>
              <th style={{ width: quitar ? 150 : 90 }} aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {anexos.map((a) => (
              <tr key={a.id}>
                <td className="inf-num">{a.n}</td>
                <td>{a.nombre}</td>
                <td className="inf-num">{fmtFecha(a.created_at)}</td>
                <td>
                  <div className="inf-row">
                    <button type="button" className="inf-link" onClick={() => void abrir(a)}>
                      Abrir
                    </button>
                    {quitar && (
                      <button type="button" className="inf-link" onClick={() => quitar(a)}>
                        Quitar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="inf-error">{error}</p>}
    </>
  );
}

export function Matriz({ cifras }: { cifras: CifraVista[] }) {
  if (!cifras.length) return <p className="inf-muted">No hay cifras incluidas en el informe.</p>;
  return (
    <div className="inf-tw">
      <table className="inf-tbl">
        <thead>
          <tr>
            <th>Indicador</th>
            <th className="r">2025</th>
            <th className="r">Actual</th>
            <th className="r">Meta</th>
            <th>Cumplimiento</th>
            <th>Fuente</th>
          </tr>
        </thead>
        <tbody>
          {cifras.map((c) => (
            <tr key={c.clave}>
              <td>{c.etiqueta}</td>
              <td className="r inf-num">{formatoCifra(c.anterior, c.unidad)}</td>
              <td className="r inf-num">
                <b>{formatoCifra(c.valor, c.unidad)}</b>
              </td>
              <td className="r inf-num">{formatoCifra(c.meta, c.unidad)}</td>
              <td>{semaforo(c.valor, c.meta, c.mayorMejor) ? <SemaforoPill s={semaforo(c.valor, c.meta, c.mayorMejor)} /> : <span className="inf-muted">Sin meta</span>}</td>
              <td className="inf-src">{c.fuente}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

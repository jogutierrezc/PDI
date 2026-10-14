/* Biblioteca · cargar un ZIP: elegir, revisar el árbol antes de subir, subir con avance, cancelar, reintentar y reanudar. */

import { useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Barra, fmtNumero } from "../../reporte/ui/comunes";
import { useEntrada } from "../../movimiento";
import { CLAVES, guardarArchivo, hashesGuardados } from "../datos";
import { progresoInicial, subirZip } from "../subida";
import type { ProgresoSubida, ResultadoSubida } from "../subida";
import { LIMITE_ARCHIVO, LIMITE_ARCHIVOS, LIMITE_ZIP, ZipInvalido, construirArbol, leerDirectorio, mb, resumirZip, revisarEntradas } from "../zip-seguro";
import type { ArchivoZip, NodoArbol } from "../zip-seguro";

type Fase =
  | { tipo: "inicio" }
  | { tipo: "leyendo"; nombre: string }
  | { tipo: "revision" }
  | { tipo: "subiendo" }
  | { tipo: "fin"; cancelado: boolean };

interface Props {
  ciclo: string | null;
}

export function CargaZip({ ciclo }: Props) {
  const cliente = useQueryClient();
  const [fase, setFase] = useState<Fase>({ tipo: "inicio" });
  const [error, setError] = useState<string | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [archivos, setArchivos] = useState<ArchivoZip[]>([]);
  const [progreso, setProgreso] = useState<ProgresoSubida | null>(null);
  const [resultados, setResultados] = useState<Map<string, ResultadoSubida>>(new Map());
  const [arrastrando, setArrastrando] = useState(false);
  const conocidos = useRef<Map<string, string>>(new Map());
  const control = useRef<AbortController | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  useEntrada(caja, ":scope > *", fase.tipo);

  const admitidos = useMemo(() => archivos.filter((a) => !a.descarte), [archivos]);
  const resumen = useMemo(() => resumirZip(archivos), [archivos]);
  const arbol = useMemo(() => construirArbol(archivos), [archivos]);

  async function elegir(f: File) {
    setError(null);
    if (!/\.zip$/i.test(f.name)) return setError(`«${f.name}» no es un .zip. Comprima la carpeta de evidencias y vuelva a intentarlo.`);
    if (f.size > LIMITE_ZIP) return setError(`El ZIP pesa ${mb(f.size)}; el máximo es ${mb(LIMITE_ZIP)}. Divídalo en dos y súbalos por separado.`);
    setFase({ tipo: "leyendo", nombre: f.name });
    try {
      const [lista, hashes] = await Promise.all([leerDirectorio(f), hashesGuardados()]);
      const revisados = revisarEntradas(lista);
      if (!revisados.some((a) => !a.descarte)) throw new ZipInvalido("El ZIP no trae ningún archivo que se pueda guardar.");
      conocidos.current = hashes;
      setZip(f);
      setArchivos(revisados);
      setResultados(new Map());
      setProgreso(null);
      setFase({ tipo: "revision" });
    } catch (e) {
      setFase({ tipo: "inicio" });
      setError(e instanceof ZipInvalido ? e.message : `No se pudo leer el ZIP: ${e instanceof Error ? e.message : "error desconocido"}.`);
    }
  }

  /** Sube `lista` (todo lo admitido, o solo lo que falló o quedó pendiente). */
  async function subir(lista: ArchivoZip[]) {
    if (!zip || lista.length === 0) return;
    const c = new AbortController();
    control.current = c;
    setFase({ tipo: "subiendo" });
    setProgreso(progresoInicial(lista));
    const r = await subirZip(zip, lista, {
      ciclo,
      zipNombre: zip.name,
      conocidos: conocidos.current,
      signal: c.signal,
      guardar: guardarArchivo,
      alAvanzar: (p, res) => {
        setProgreso(p);
        setResultados((prev) => new Map(prev).set(res.ruta, res));
      },
    });
    setResultados((prev) => {
      const m = new Map(prev);
      for (const x of r) m.set(x.ruta, x);
      return m;
    });
    control.current = null;
    setFase({ tipo: "fin", cancelado: c.signal.aborted });
    void cliente.invalidateQueries({ queryKey: CLAVES.lista });
  }

  const pendientes = admitidos.filter((a) => {
    const r = resultados.get(a.ruta);
    return !r || r.estado === "fallido" || r.estado === "cancelado";
  });
  const lista = [...resultados.values()];
  const fallidos = lista.filter((r) => r.estado === "fallido");
  const repetidos = lista.filter((r) => r.estado === "repetido");
  const guardados = lista.filter((r) => r.estado === "guardado");

  function reiniciar() {
    setFase({ tipo: "inicio" });
    setZip(null);
    setArchivos([]);
    setResultados(new Map());
    setProgreso(null);
    setError(null);
  }

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    const f = e.dataTransfer.files[0];
    if (f) void elegir(f);
  }

  return (
    <section className="rk-rep-card rk-bib-carga" aria-labelledby="rk-bib-carga-h">
      <div className="rk-rep-split">
        <div>
          <h3 id="rk-bib-carga-h" className="rk-rep-h3">
            Cargar evidencias en ZIP
          </h3>
          <p className="rk-rep-small rk-rep-muted">
            Hasta {mb(LIMITE_ZIP)} y {fmtNumero(LIMITE_ARCHIVOS, 0)} archivos, con sus carpetas. Se abre aquí, en su navegador: cada archivo se guarda aparte y Pilo lo
            apunta a sus ODS e indicadores, sin IA.
          </p>
        </div>
        {zip && fase.tipo !== "subiendo" && (
          <button type="button" className="rk-rep-btn is-sm is-ghost" onClick={reiniciar}>
            Elegir otro ZIP
          </button>
        )}
      </div>

      {error && (
        <p className="rk-rep-aviso-linea is-risk" role="alert">
          {error}
        </p>
      )}

      <div ref={caja} className="rk-bib-caja">
        {(fase.tipo === "inicio" || fase.tipo === "leyendo") && (
          <div
            className={`rk-rep-drop ${arrastrando ? "is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={alSoltar}
            aria-busy={fase.tipo === "leyendo" || undefined}
          >
            <svg className="rk-rep-drop-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 10v6m0-6-2.5 2.5M12 10l2.5 2.5" />
            </svg>
            <p className="rk-rep-drop-t">
              <b>{fase.tipo === "leyendo" ? `Leyendo el índice de «${fase.nombre}»…` : arrastrando ? "Suelte el ZIP para revisarlo" : "Arrastre aquí el ZIP de evidencias"}</b>
            </p>
            <p className="rk-rep-small rk-rep-muted">
              Nada se sube hasta que revise el árbol. Máximo {mb(LIMITE_ARCHIVO)} por archivo; se omiten __MACOSX, .DS_Store y ocultos.
            </p>
            <button type="button" className="rk-rep-btn is-sm" onClick={() => entrada.current?.click()} disabled={fase.tipo === "leyendo"}>
              Elegir ZIP
            </button>
            <input
              ref={entrada}
              type="file"
              accept=".zip,application/zip"
              hidden
              aria-label="Elija el ZIP de evidencias"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void elegir(f);
              }}
            />
          </div>
        )}

        {fase.tipo === "revision" && zip && (
          <>
            <dl className="rk-rep-vista-cifras">
              <div>
                <dt>Se guardarán</dt>
                <dd className="rk-rep-num">{fmtNumero(resumen.guardar, 0)}</dd>
              </div>
              <div>
                <dt>Peso</dt>
                <dd className="rk-rep-num">{mb(resumen.bytes)}</dd>
              </div>
              <div>
                <dt>Con alerta</dt>
                <dd className="rk-rep-num">{fmtNumero(resumen.rechazados, 0)}</dd>
              </div>
              <div>
                <dt>Omitidos</dt>
                <dd className="rk-rep-num">{fmtNumero(resumen.omitidos, 0)}</dd>
              </div>
            </dl>
            <Arbol raiz={arbol} />
            {resumen.avisos.length > 0 && <Avisos titulo={`${resumen.avisos.length} archivos no se subirán`} items={resumen.avisos} />}
            {!ciclo && <p className="rk-rep-aviso-linea is-warn">Aún no hay ciclo de THE: los archivos quedan sin ciclo y se ligan a uno al aceptarlos.</p>}
            <div className="rk-rep-row">
              <button type="button" className="rk-rep-btn is-primary" onClick={() => void subir(admitidos)}>
                Guardar {fmtNumero(admitidos.length, 0)} {admitidos.length === 1 ? "archivo" : "archivos"} en la biblioteca
              </button>
              <button type="button" className="rk-rep-btn" onClick={reiniciar}>
                Cancelar
              </button>
              <span className="rk-rep-small rk-rep-muted">El contenido que ya esté en la biblioteca se omite y se avisa.</span>
            </div>
          </>
        )}

        {(fase.tipo === "subiendo" || fase.tipo === "fin") && progreso && (
          <div className="rk-bib-avance" aria-live="polite">
            <div className="rk-rep-split">
              <p className="rk-rep-small">
                <b className="rk-rep-num">{fmtNumero(progreso.hechos, 0)}</b> de <span className="rk-rep-num">{fmtNumero(progreso.total, 0)}</span> archivos ·{" "}
                <span className="rk-rep-num">
                  {mb(progreso.bytesHechos)} de {mb(progreso.bytesTotal)}
                </span>
              </p>
              {fase.tipo === "subiendo" ? (
                <button type="button" className="rk-rep-btn is-sm is-danger" onClick={() => control.current?.abort()}>
                  Cancelar la subida
                </button>
              ) : null}
            </div>
            <Barra valor={progreso.bytesTotal ? progreso.bytesHechos / progreso.bytesTotal : 0} etiqueta="Avance de la subida" />
            <ul className="rk-bib-conteo">
              <li>
                <span className="rk-rep-pill is-ok">
                  <span aria-hidden="true">✓</span> {fmtNumero(guardados.length, 0)} guardados
                </span>
              </li>
              <li>
                <span className="rk-rep-pill is-blue">
                  <span aria-hidden="true">=</span> {fmtNumero(repetidos.length, 0)} ya estaban
                </span>
              </li>
              <li>
                <span className={`rk-rep-pill ${fallidos.length ? "is-risk" : ""}`}>
                  <span aria-hidden="true">✕</span> {fmtNumero(fallidos.length, 0)} con error
                </span>
              </li>
            </ul>
            {fase.tipo === "subiendo" && (
              <p className="rk-rep-small rk-rep-muted">
                <span className="rk-rep-spin" aria-hidden="true" /> Pilo descomprime, lee y clasifica de a tres archivos. Puede seguir revisando la biblioteca mientras tanto;
                no cierre esta pestaña.
              </p>
            )}
            {fase.tipo === "fin" && (
              <>
                <p className={`rk-rep-aviso-linea ${fallidos.length || fase.cancelado ? "is-warn" : "is-ok"}`} role="status">
                  {fase.cancelado
                    ? `Subida cancelada. ${fmtNumero(pendientes.length, 0)} archivos quedaron pendientes; al reanudar, lo ya guardado se omite.`
                    : fallidos.length
                      ? `Terminó con ${fmtNumero(fallidos.length, 0)} archivos con error. Puede reintentarlos.`
                      : "Listo. Los archivos están en la biblioteca, abajo, con las propuestas de Pilo."}
                </p>
                {repetidos.length > 0 && <Avisos titulo={`${repetidos.length} ya estaban en la biblioteca`} items={repetidos.map((r) => `${r.ruta}: ${r.mensaje ?? "ya estaba"}`)} />}
                {fallidos.length > 0 && <Avisos titulo={`${fallidos.length} con error`} items={fallidos.map((r) => `${r.ruta}: ${r.mensaje ?? "error"}`)} abierto />}
                <div className="rk-rep-row">
                  {pendientes.length > 0 && (
                    <button type="button" className="rk-rep-btn is-primary" onClick={() => void subir(pendientes)}>
                      {fase.cancelado ? "Reanudar" : "Reintentar"} {fmtNumero(pendientes.length, 0)} {pendientes.length === 1 ? "archivo" : "archivos"}
                    </button>
                  )}
                  <button type="button" className="rk-rep-btn" onClick={reiniciar}>
                    Subir otro ZIP
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Avisos({ titulo, items, abierto = false }: { titulo: string; items: string[]; abierto?: boolean }) {
  const LIMITE = 40;
  return (
    <details className="rk-rep-small rk-bib-avisos" open={abierto || undefined}>
      <summary>{titulo}</summary>
      <ul className="rk-rep-lista">
        {items.slice(0, LIMITE).map((a, i) => (
          <li key={i} className="rk-rep-wrap">
            {a}
          </li>
        ))}
        {items.length > LIMITE && <li>y {fmtNumero(items.length - LIMITE, 0)} más.</li>}
      </ul>
    </details>
  );
}

/** Árbol de carpetas con conteos, peso y alertas. Los dos primeros niveles abiertos. */
export function Arbol({ raiz }: { raiz: NodoArbol }) {
  return (
    <div className="rk-bib-arbol" role="group" aria-label="Carpetas del ZIP">
      <Nodo n={{ ...raiz, nombre: "Raíz del ZIP" }} nivel={0} />
    </div>
  );
}

function Nodo({ n, nivel }: { n: NodoArbol; nivel: number }) {
  const fila = (
    <span className="rk-bib-nodo">
      <svg className="rk-bib-nodo-ic" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M1.5 4.5a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
      </svg>
      <span className="rk-bib-nodo-n rk-rep-corta">{n.nombre}</span>
      <span className="rk-bib-nodo-c rk-rep-num">
        {fmtNumero(n.archivos, 0)} {n.archivos === 1 ? "archivo" : "archivos"} · {mb(n.bytes)}
      </span>
      {n.alertas > 0 && (
        <span className="rk-rep-pill is-warn">
          <span aria-hidden="true">!</span> {n.alertas}
          <span className="rk-rep-sr"> con alerta</span>
        </span>
      )}
    </span>
  );
  if (n.hijos.length === 0) return <div className="rk-bib-hoja">{fila}</div>;
  return (
    <details className="rk-bib-rama" open={nivel < 2 || undefined}>
      <summary>{fila}</summary>
      <div className="rk-bib-hijos">
        {n.hijos.slice(0, 200).map((h) => (
          <Nodo key={h.ruta} n={h} nivel={nivel + 1} />
        ))}
        {n.hijos.length > 200 && <p className="rk-rep-small rk-rep-muted">y {n.hijos.length - 200} carpetas más.</p>}
      </div>
    </details>
  );
}

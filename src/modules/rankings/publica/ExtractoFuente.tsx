/* =============================================================================
   Pilo Publica · el extracto de donde sale una cifra de un documento.

   Muestra, para una cifra cuya fuente es un archivo de la Biblioteca: el nombre,
   su lugar exacto (página, hoja y celda), la frase o la fila de la que se tomó
   con el número resaltado y, a pedido, el fragmento completo (la página o la
   tabla con la celda marcada) y el archivo abierto en esa página.
   Si la cifra se sacó de un archivo leído con la versión vieja, lo dice.
   ========================================================================== */

import { Fragment, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useArchivoDe, useFragmento, useUrlFirmada } from "../biblioteca/datos";
import type { FragmentoGuardado } from "../biblioteca/datos";
import { fuenteDe } from "./explicar";
import type { CifraPP } from "./tipos";

/** El texto con la primera aparición de `literal` resaltada. */
function resaltar(texto: string, literal: string): ReactNode {
  const l = literal.trim();
  const i = l ? texto.toLowerCase().indexOf(l.toLowerCase()) : -1;
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="pp-extracto__marca">{texto.slice(i, i + l.length)}</mark>
      {texto.slice(i + l.length)}
    </>
  );
}

/** «C14» → { col: 3, fila: 14 }. */
function refACelda(ref: string): { col: number; fila: number } | null {
  const m = /^([A-Za-z]{1,3})(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, fila: Number(m[2]) };
}

const VENTANA = 8;

function TablaFragmento({ frag, celda, fila }: { frag: FragmentoGuardado; celda: string; fila: number | null }) {
  const t = frag.tabla;
  if (!t) return null;
  const ref = celda ? refACelda(celda) : null;
  const rMarca = ref ? ref.fila - t.fila0 : fila !== null ? fila - t.fila0 : -1;
  const cMarca = ref ? ref.col - t.col0 : -1;
  const total = t.celdas.length;
  // Las primeras filas (encabezados) y las cercanas a la celda; los saltos se marcan con «…».
  const filas = Array.from({ length: total }, (_, i) => i).filter((i) => i < 3 || Math.abs(i - rMarca) <= VENTANA);
  return (
    <div className="pp-extracto__tabla" role="region" aria-label="Tabla de la que sale la cifra" tabIndex={0}>
      <table>
        <tbody>
          {filas.map((i, k) => (
            <Fragment key={i}>
              {k > 0 && filas[k - 1] !== i - 1 && (
                <tr className="pp-extracto__salto">
                  <td colSpan={Math.max(1, t.celdas[0]?.length ?? 1)}>…</td>
                </tr>
              )}
              <tr className={i === rMarca ? "is-fila" : undefined}>
                {t.celdas[i].map((c, j) => (
                  <td key={j} className={i === rMarca && j === cMarca ? "is-celda" : undefined}>
                    {c === null ? "" : String(c)}
                  </td>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExtractoFuente({ cifra }: { cifra: CifraPP }) {
  const s = (cifra.source && typeof cifra.source === "object" ? cifra.source : {}) as Record<string, unknown>;
  const f = fuenteDe(cifra);
  const bibId = f.kind === "documento" && f.ref.startsWith("bib:") ? f.ref.slice(4) : null;
  const orden = typeof s.fragmento === "number" ? s.fragmento : null;
  const [abierto, setAbierto] = useState(false);
  const frag = useFragmento(abierto ? bibId : null, abierto ? orden : null);
  const archivo = useArchivoDe(abierto ? bibId : null);
  const url = useUrlFirmada(abierto && archivo.data ? archivo.data.storage_path : null);
  const pagina = useMemo(() => /^p\.\s*(\d+)/.exec(f.ubicacion)?.[1] ?? null, [f.ubicacion]);
  if (!bibId) return null;

  const sinLugar = !f.ubicacion || /sin ubicaci[oó]n/i.test(f.ubicacion);
  const enlace = url.data ? `${url.data}${pagina && archivo.data?.ext === "pdf" ? `#page=${pagina}` : ""}` : null;
  const filaN = typeof s.fila === "number" ? s.fila : Number(s.fila) || null;

  return (
    <div className="pp-extracto">
      <h5 className="pp-extracto__t">De dónde sale en el documento</h5>
      {sinLugar ? (
        <p className="pp-extracto__aviso">
          Esta cifra se sacó de un archivo leído con la versión anterior: no sabe su página ni su hoja. En la Biblioteca pulsa «Releer con ubicaciones» y rehaz el libro de cifras.
        </p>
      ) : (
        <dl className="pp-extracto__datos">
          {f.archivo && (
            <>
              <dt>Archivo</dt>
              <dd>{f.archivo}</dd>
            </>
          )}
          <dt>Lugar</dt>
          <dd>{f.ubicacion}</dd>
        </dl>
      )}
      {f.contexto && (
        <blockquote className="pp-extracto__cita">
          {f.contexto.split("\n").map((l, i) => (
            <span key={i}>
              {resaltar(l, f.valor_literal)}
              <br />
            </span>
          ))}
        </blockquote>
      )}
      {!sinLugar && (
        <div className="pp-extracto__acciones">
          <button type="button" className="pp-btn pp-btn--sm" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Ocultar el fragmento" : "Ver el fragmento completo"}
          </button>
          {abierto && enlace && (
            <a className="pp-btn pp-btn--sm" href={enlace} target="_blank" rel="noopener noreferrer">
              Abrir el archivo{pagina && archivo.data?.ext === "pdf" ? ` en la p. ${pagina}` : ""}
            </a>
          )}
        </div>
      )}
      {abierto && (
        <div className="pp-extracto__fragmento">
          {frag.isLoading && <p className="pp-nota">Cargando el fragmento…</p>}
          {frag.error && <p className="pp-extracto__aviso">{frag.error.message}</p>}
          {frag.data === null && !frag.isLoading && !frag.error && <p className="pp-extracto__aviso">El fragmento ya no está en la Biblioteca (se releyó el archivo). Rehaz el libro de cifras.</p>}
          {frag.data && (frag.data.tipo === "tabla" ? <TablaFragmento frag={frag.data} celda={f.celda} fila={filaN} /> : <p className="pp-extracto__texto">{resaltar(frag.data.texto, f.valor_literal)}</p>)}
        </div>
      )}
    </div>
  );
}

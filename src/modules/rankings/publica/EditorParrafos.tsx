/* Editor de un texto largo por párrafos, en español e inglés lado a lado. Se guarda unido con una línea en blanco. */

import { useEffect, useRef, useState } from "react";
import { parrafos } from "./tipos";

const unir = (ps: string[]): string =>
  ps
    .map((x) => x.trim())
    .filter(Boolean)
    .join("\n\n");

/** Parte un texto en la posición dada o, si no hay cursor, en el límite de frase más cercano a la mitad. */
function partir(t: string, pos: number | null): [string, string] {
  let i = pos;
  if (i === null || i <= 0 || i >= t.length) {
    const mitad = Math.floor(t.length / 2);
    let mejor = -1;
    const re = /[.!?…]["»”)]?\s+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const fin = m.index + m[0].length;
      if (mejor < 0 || Math.abs(fin - mitad) < Math.abs(mejor - mitad)) mejor = fin;
    }
    i = mejor > 0 ? mejor : mitad;
  }
  return [t.slice(0, i).trim(), t.slice(i).trim()];
}

export function contarPalabras(t: string): number {
  return t.trim() ? t.trim().split(/\s+/).length : 0;
}

export function EditorParrafos({
  es,
  en,
  onGuardar,
}: {
  es: string;
  en: string;
  onGuardar: (v: { text_es: string; text_en: string }) => void;
}) {
  const [pe, setPe] = useState<string[]>(() => parrafos(es));
  const [pi, setPi] = useState<string[]>(() => parrafos(en));
  const ultimo = useRef({ es: unir(parrafos(es)), en: unir(parrafos(en)) });
  const cursor = useRef<Record<string, number | null>>({});

  // Un cambio de fuera (Pilo, traducción) reemplaza lo local solo si no es lo que acabamos de guardar.
  useEffect(() => {
    const e = unir(parrafos(es));
    const i = unir(parrafos(en));
    if (e !== ultimo.current.es || i !== ultimo.current.en) {
      ultimo.current = { es: e, en: i };
      setPe(parrafos(es));
      setPi(parrafos(en));
    }
  }, [es, en]);

  const n = Math.max(pe.length, pi.length);
  const fila = (a: string[], i: number) => a[i] ?? "";
  const rellena = (a: string[]) => Array.from({ length: n }, (_, i) => a[i] ?? "");

  const guardar = (a: string[], b: string[]) => {
    const te = unir(a);
    const ti = unir(b);
    if (te === ultimo.current.es && ti === ultimo.current.en) return;
    ultimo.current = { es: te, en: ti };
    onGuardar({ text_es: te, text_en: ti });
  };
  const aplicar = (a: string[], b: string[], guardarYa = true) => {
    setPe(a);
    setPi(b);
    if (guardarYa) guardar(a, b);
  };

  const cambiar = (idioma: "es" | "en", i: number, v: string) => {
    const base = rellena(idioma === "es" ? pe : pi);
    base[i] = v;
    if (idioma === "es") setPe(base);
    else setPi(base);
  };
  const alSalir = () => guardar(rellena(pe), rellena(pi));

  const mover = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= n) return;
    const a = rellena(pe);
    const b = rellena(pi);
    [a[i], a[j]] = [a[j], a[i]];
    [b[i], b[j]] = [b[j], b[i]];
    aplicar(a, b);
  };
  const quitar = (i: number) => {
    const a = rellena(pe).filter((_, k) => k !== i);
    const b = rellena(pi).filter((_, k) => k !== i);
    aplicar(a, b);
  };
  const agregar = (despuesDe: number) => {
    const a = rellena(pe);
    const b = rellena(pi);
    a.splice(despuesDe + 1, 0, "");
    b.splice(despuesDe + 1, 0, "");
    aplicar(a, b, false);
  };
  const dividir = (i: number) => {
    const a = rellena(pe);
    const b = rellena(pi);
    const [a1, a2] = partir(a[i], cursor.current[`es${i}`] ?? null);
    const [b1, b2] = partir(b[i], cursor.current[`en${i}`] ?? null);
    a.splice(i, 1, a1, a2);
    b.splice(i, 1, b1, b2);
    cursor.current = {};
    aplicar(a, b);
  };

  const totE = pe.reduce((s, x) => s + x.length, 0);
  const totI = pi.reduce((s, x) => s + x.length, 0);
  const nE = pe.filter((x) => x.trim()).length;
  const nI = pi.filter((x) => x.trim()).length;
  const palE = pe.reduce((s, x) => s + contarPalabras(x), 0);
  const palI = pi.reduce((s, x) => s + contarPalabras(x), 0);

  return (
    <div className="pp-parrs">
      <div className="pp-parrs__res" role="status">
        <span>
          Español: <b>{nE}</b> {nE === 1 ? "párrafo" : "párrafos"} · {palE} palabras · {totE} caracteres
        </span>
        <span>
          Inglés: <b>{nI}</b> {nI === 1 ? "párrafo" : "párrafos"} · {palI} palabras · {totI} caracteres
        </span>
      </div>
      {nE > 0 && nI > 0 && nE !== nI && (
        <p className="pp-warn" role="status">
          El español tiene {nE} párrafos y el inglés {nI}. Conviene que coincidan para que cada párrafo se corresponda con su traducción.
        </p>
      )}
      {n === 0 && <p className="pp-nota">Aún no hay párrafos. Agrega el primero.</p>}
      <ol className="pp-parrs__l">
        {Array.from({ length: n }, (_, i) => (
          <li key={i} className="pp-parr">
            <div className="pp-parr__n">
              <span className="pp-mono">{i + 1}</span>
              <span className="pp-parr__b">
                <button type="button" className="pp-btn pp-btn--sm" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir el párrafo ${i + 1}`}>
                  ↑
                </button>
                <button type="button" className="pp-btn pp-btn--sm" onClick={() => mover(i, 1)} disabled={i === n - 1} aria-label={`Bajar el párrafo ${i + 1}`}>
                  ↓
                </button>
                <button type="button" className="pp-btn pp-btn--sm" onClick={() => dividir(i)} title="Parte este párrafo en el cursor (en cada idioma, donde esté el cursor; si no, en la frase del medio)">
                  Dividir
                </button>
                <button type="button" className="pp-btn pp-btn--sm" onClick={() => agregar(i)}>
                  + Debajo
                </button>
                <button type="button" className="pp-btn pp-btn--sm" onClick={() => quitar(i)} aria-label={`Quitar el párrafo ${i + 1}`}>
                  Quitar
                </button>
              </span>
            </div>
            <div className="pp-dos">
              <div className="pp-fld">
                <label htmlFor={`pp-pe-${i}`}>Español · párrafo {i + 1}</label>
                <textarea
                  id={`pp-pe-${i}`}
                  lang="es"
                  rows={Math.min(14, Math.max(4, Math.ceil(fila(pe, i).length / 70) + 1))}
                  value={fila(pe, i)}
                  onChange={(e) => cambiar("es", i, e.target.value)}
                  onSelect={(e) => (cursor.current[`es${i}`] = e.currentTarget.selectionStart)}
                  onBlur={alSalir}
                />
                <small>{fila(pe, i).length} caracteres</small>
              </div>
              <div className="pp-fld">
                <label htmlFor={`pp-pi-${i}`}>Inglés · paragraph {i + 1}</label>
                <textarea
                  id={`pp-pi-${i}`}
                  lang="en"
                  rows={Math.min(14, Math.max(4, Math.ceil(fila(pi, i).length / 70) + 1))}
                  value={fila(pi, i)}
                  onChange={(e) => cambiar("en", i, e.target.value)}
                  onSelect={(e) => (cursor.current[`en${i}`] = e.currentTarget.selectionStart)}
                  onBlur={alSalir}
                />
                <small>{fila(pi, i).length} caracteres</small>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="pp-btn pp-btn--sm" onClick={() => agregar(n - 1)}>
        + Agregar párrafo
      </button>
    </div>
  );
}

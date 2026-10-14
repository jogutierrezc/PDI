/* Texto con cifras enlazadas: el campo de escritura con «Insertar una cifra
   viva» y la vista previa «Así se leerá». Lo usan el editor y la revisión. */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { formatoCifra } from "../cifras-vivas";
import type { CifraVista } from "../cifras-vivas";
import { insertarToken, palabras, partesTexto } from "../tokens";
import type { Resolver } from "../tokens";

/** Resolver de tokens a partir de las cifras del informe. */
export function resolverDe(cifras: CifraVista[]): Resolver {
  const mapa = new Map(cifras.map((c) => [c.clave, c]));
  return (clave) => {
    const c = mapa.get(clave);
    return c && c.valor !== null ? { texto: formatoCifra(c.valor, c.unidad), fuente: c.fuente } : null;
  };
}

/** El texto leído: cada cifra como chip con su fuente al pasar o enfocar. */
export function LecturaTexto({ texto, resolver, vacio = "Escriba o inserte una cifra." }: { texto: string; resolver: Resolver; vacio?: string }) {
  if (!texto.trim()) return <span className="inf-muted">{vacio}</span>;
  return (
    <>
      {partesTexto(texto, resolver).map((p, i) =>
        p.tipo === "texto" ? (
          <span key={i}>{p.texto}</span>
        ) : p.tipo === "cifra" ? (
          <span key={i} className="inf-chip" title={p.fuente}>
            {p.texto}
          </span>
        ) : (
          <span key={i} className="inf-chip is-roto" title="Esta cifra no tiene valor o no existe en el informe">
            [[{p.clave}]]
          </span>
        ),
      )}
    </>
  );
}

export function CampoTexto({
  etiqueta,
  valor,
  onChange,
  cifras,
  resolver,
  editable,
  minimo,
  placeholder = "Escriba aquí con sus palabras…",
  pie,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  /** Cifras que se pueden insertar (las incluidas del informe). */
  cifras: CifraVista[];
  resolver: Resolver;
  editable: boolean;
  minimo?: number;
  placeholder?: string;
  /** Lo que va a la derecha del pie (p. ej. «Pilo redacta»). */
  pie?: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [clave, setClave] = useState("");
  const n = palabras(valor);

  const insertar = () => {
    if (!clave) return;
    const r = insertarToken(valor, ref.current?.selectionStart ?? null, clave);
    onChange(r.texto);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(r.cursor, r.cursor);
    });
  };

  return (
    <>
      {editable && cifras.length > 0 && (
        <div className="inf-cite">
          <select className="inf-in" value={clave} onChange={(e) => setClave(e.target.value)} aria-label="Cifra a insertar">
            <option value="">Insertar una cifra viva…</option>
            {cifras.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta} ({formatoCifra(c.valor, c.unidad)})
              </option>
            ))}
          </select>
          <button type="button" className="inf-btn inf-btn--sm" onClick={insertar} disabled={!clave}>
            Insertar
          </button>
          <span className="inf-hint">La cifra queda como vínculo: si la fuente cambia, el texto cambia.</span>
        </div>
      )}
      <div className="inf-fld">
        <textarea ref={ref} value={valor} onChange={(e) => onChange(e.target.value)} readOnly={!editable} placeholder={editable ? placeholder : ""} aria-label={etiqueta} />
        <div className="inf-fld__ft">
          <span className="inf-num">
            {n} palabras{minimo ? ` · mínimo ${minimo}` : ""}
          </span>
          {pie}
        </div>
      </div>
      <div className="inf-blk" style={{ marginTop: "var(--space-2)" }}>
        <span className="inf-eyebrow">Así se leerá, con las cifras vivas</span>
        <div className="inf-pv" aria-live="polite">
          <LecturaTexto texto={valor} resolver={resolver} />
        </div>
      </div>
    </>
  );
}

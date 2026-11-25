/* Texto de una sección: el campo de escritura y, si el texto ya trae cifras
   enlazadas ([[clave]] de informes anteriores), la vista «Así se leerá». Insertar
   cifras vivas está desactivado: no estaban funcionando. Lo usan el editor y la revisión. */

import { useRef } from "react";
import type { ReactNode } from "react";
import { formatoCifra } from "../cifras-vivas";
import type { CifraVista } from "../cifras-vivas";
import { palabras, partesTexto } from "../tokens";
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
export function LecturaTexto({ texto, resolver, vacio = "Escriba el texto de la sección." }: { texto: string; resolver: Resolver; vacio?: string }) {
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
  resolver,
  editable,
  minimo,
  placeholder = "Escriba aquí con sus palabras…",
  pie,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  /** Sin uso: la inserción de cifras vivas está desactivada. Se conserva para no tocar a quienes lo pasan. */
  cifras?: CifraVista[];
  resolver: Resolver;
  editable: boolean;
  minimo?: number;
  placeholder?: string;
  /** Lo que va a la derecha del pie (p. ej. «Pilo redacta»). */
  pie?: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const n = palabras(valor);
  const conCifras = /\[\[[^\]]+\]\]/.test(valor);

  return (
    <>
      <div className="inf-fld">
        <textarea ref={ref} value={valor} onChange={(e) => onChange(e.target.value)} readOnly={!editable} placeholder={editable ? placeholder : ""} aria-label={etiqueta} />
        <div className="inf-fld__ft">
          <span className="inf-num">
            {n} palabras{minimo ? ` · mínimo ${minimo}` : ""}
          </span>
          {pie}
        </div>
      </div>
      {conCifras && (
        <div className="inf-blk" style={{ marginTop: "var(--space-2)" }}>
          <span className="inf-eyebrow">Así se leerá</span>
          <div className="inf-pv" aria-live="polite">
            <LecturaTexto texto={valor} resolver={resolver} />
          </div>
        </div>
      )}
    </>
  );
}

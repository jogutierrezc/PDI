/* =============================================================================
   Texto de Pilo editable con cifras que se tocan.

   El texto guarda tokens `[[clave]]`; aquí cada token se ve como una cifra (chip) que no se escribe a mano:
   al tocarla se ve quién la aportó, en qué hoja y fila y su fuente primaria. Los párrafos se editan en el
   lugar (contenteditable) y al escribir se vuelve a serializar a texto con tokens. Sin innerHTML con datos
   ajenos: todo se escapa y las cifras salen del resolvedor.
   ========================================================================== */

import { useEffect, useRef } from "react";
import type { Resuelto } from "../tokens";

const TOKEN = /\[\[([a-z0-9_]+)\]\]/gi;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Resolver = (clave: string) => Resuelto | null;

/** Un párrafo de texto con tokens a HTML: texto escapado y cada token como chip. */
export function htmlDeParrafo(texto: string, resolver: Resolver): string {
  let out = "";
  let desde = 0;
  for (const m of texto.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    out += esc(texto.slice(desde, i));
    const r = resolver(m[1].toLowerCase());
    out += r ? `<button type="button" class="cp-cx" contenteditable="false" data-k="${esc(m[1].toLowerCase())}">${esc(r.texto)}</button>` : `<button type="button" class="cp-cx is-roto" contenteditable="false" data-k="${esc(m[1].toLowerCase())}">sin dato</button>`;
    desde = i + m[0].length;
  }
  return out + esc(texto.slice(desde));
}

/** El contenido de un párrafo editable de vuelta a texto con tokens. */
export function textoDeNodo(el: HTMLElement): string {
  let t = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) t += n.textContent ?? "";
    else if (n instanceof HTMLElement) {
      if (n.dataset.k) t += `[[${n.dataset.k}]]`;
      else if (n.tagName === "BR") t += " ";
      else t += textoDeNodo(n);
    }
  });
  return t.replace(/ /g, " ");
}

/** El texto de la sección en bloques: un párrafo, o un elemento de lista si la línea empieza con «- ». */
export function bloquesDe(texto: string): { lista: boolean; texto: string }[] {
  return texto
    .split(/\n{2,}/)
    .flatMap((p): { lista: boolean; texto: string }[] => {
      const lineas = p.split("\n").map((l) => l.trim()).filter(Boolean);
      return lineas.length && lineas.every((l) => /^[-•]\s+/.test(l)) ? lineas.map((l) => ({ lista: true, texto: l.replace(/^[-•]\s+/, "") })) : lineas.length ? [{ lista: false, texto: lineas.join(" ") }] : [];
    });
}

/** Los bloques de vuelta a texto: párrafos separados por línea en blanco, lista con «- » seguida. */
export function textoDeBloques(b: { lista: boolean; texto: string }[]): string {
  let out = "";
  b.forEach((x, i) => {
    const prev = b[i - 1];
    out += (i === 0 ? "" : prev?.lista && x.lista ? "\n" : "\n\n") + (x.lista ? `- ${x.texto}` : x.texto);
  });
  return out;
}

interface Props {
  texto: string;
  resolver: Resolver;
  /** Muestra las cifras como chips que se tocan (si no, como texto corriente). */
  origen: boolean;
  editable: boolean;
  onChange: (texto: string) => void;
  onCifra: (clave: string, el: HTMLElement) => void;
}

export function EditorConCifras({ texto, resolver, origen, editable, onChange, onCifra }: Props) {
  const bloques = bloquesDe(texto);
  return (
    <div className={`cp-body${origen ? "" : " is-sin-origen"}`}>
      {bloques.map((b, i) => (
        <Parrafo
          key={i}
          texto={b.texto}
          lista={b.lista}
          resolver={resolver}
          editable={editable}
          onChange={(t) => {
            const nuevo = bloques.map((x, k) => (k === i ? { ...x, texto: t } : x));
            onChange(textoDeBloques(nuevo));
          }}
          onCifra={onCifra}
        />
      ))}
    </div>
  );
}

function Parrafo({ texto, lista, resolver, editable, onChange, onCifra }: { texto: string; lista: boolean; resolver: Resolver; editable: boolean; onChange: (t: string) => void; onCifra: Props["onCifra"] }) {
  const ref = useRef<HTMLParagraphElement>(null);
  // Se repinta solo si el texto que llega no es el que ya está en pantalla (una redacción nueva): así no salta el cursor.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el && textoDeNodo(el) === texto) return;
    el.innerHTML = htmlDeParrafo(texto, resolver);
  }, [texto, resolver]);
  return (
    <p
      ref={ref}
      className={lista ? "is-li" : undefined}
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck
      onInput={(e) => onChange(textoDeNodo(e.currentTarget))}
      onClick={(e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-k]");
        if (b) onCifra(b.dataset.k ?? "", b);
      }}
    />
  );
}

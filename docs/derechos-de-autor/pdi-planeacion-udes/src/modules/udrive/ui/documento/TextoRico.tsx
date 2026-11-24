/* =============================================================================
   UDrive · el texto con formato de un párrafo, con contentEditable controlado.

   Se eligió esta solución, y no TipTap o ProseMirror, porque el formato que se
   pide es mínimo (negrita, cursiva, enlace y tres marcas atómicas: cifra
   viva, cita APA y referencia cruzada) y el modelo ya es una cadena con marcas
   (lib/texto.ts). El navegador aplica negrita y cursiva con execCommand; al
   escribir se lee el DOM y se vuelve a la cadena; solo se reescribe el DOM
   cuando el valor cambia desde fuera (deshacer, restaurar), para no mover el
   cursor. Todo lo que se escribe en el DOM sale de `aHtml`, que escapa todo;
   al pegar solo entra texto plano.
   ========================================================================== */

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { Ref } from "react";
import { enlaceSeguro, escapar, marcaCita, marcaCifra, marcaRef, tramos } from "../../lib/texto";
import { useRender } from "../../salida/Piezas";
import type { CtxRender } from "../../salida/Piezas";

export interface ApiTexto {
  negrita(): void;
  cursiva(): void;
  /** Aplica el enlace a la selección (o lo inserta como texto si no hay selección). */
  enlace(url: string): void;
  insertar(marca: { tipo: "cifra"; clave: string } | { tipo: "cita"; fuente: string; extra: string } | { tipo: "ref"; bloque: string }): void;
  /** Guarda y restaura la selección: los menús que mueven el foco la necesitan. */
  guardarSeleccion(): void;
  restaurarSeleccion(): void;
  foco(alFinal?: boolean): void;
  textoSeleccionado(): string;
}

const html = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** La cadena con marcas → HTML escapado para el editor. */
export function aHtml(valor: string, ctx: CtxRender): string {
  return tramos(valor)
    .map((t) => {
      if (t.t === "texto") {
        let s = html(t.texto);
        if (t.i) s = `<i>${s}</i>`;
        if (t.b) s = `<b>${s}</b>`;
        if (t.enlace && enlaceSeguro(t.enlace)) s = `<a href="${html(t.enlace)}">${s}</a>`;
        return s;
      }
      if (t.t === "cifra") {
        const c = ctx.cifra(t.clave);
        return `<span class="ud-cifra" contenteditable="false" data-cifra="${html(t.clave)}"${c?.cambio ? ' data-cambio="true"' : ""}${!c || !c.conValor ? ' data-sin="true"' : ""}>${html(c?.texto ?? `[[${t.clave}]]`)}</span>`;
      }
      if (t.t === "cita") return `<span class="ud-cita" contenteditable="false" data-cita="${html(t.fuente)}" data-extra="${html(t.extra)}">${html(ctx.texto.cita(t.fuente, t.extra) ?? "(fuente sin definir)")}</span>`;
      return `<span class="ud-ref" contenteditable="false" data-ref="${html(t.bloque)}">${html(ctx.texto.ref(t.bloque) ?? "(referencia rota)")}</span>`;
    })
    .join("");
}

/** Lo que dejó el navegador en el editor → la cadena con marcas. */
export function deDom(nodo: Node): string {
  if (nodo.nodeType === 3) return escapar((nodo.textContent ?? "").replace(/[ \n\r]/g, " "));
  if (!(nodo instanceof HTMLElement)) return "";
  const d = nodo.dataset;
  if (d.cifra) return marcaCifra(d.cifra);
  if (d.cita) return marcaCita(d.cita, d.extra ?? "");
  if (d.ref) return marcaRef(d.ref);
  if (nodo.tagName === "BR") return "";
  if (nodo.tagName === "A") {
    const href = nodo.getAttribute("href") ?? "";
    const texto = (nodo.textContent ?? "").replace(/[\][\\*]/g, "").replace(/\s+/g, " ");
    return enlaceSeguro(href) && texto.trim() ? `[${texto}](${href})` : escapar(nodo.textContent ?? "");
  }
  const hijos = Array.from(nodo.childNodes).map(deDom).join("");
  if (nodo.tagName === "B" || nodo.tagName === "STRONG") return hijos ? `**${hijos}**` : "";
  if (nodo.tagName === "I" || nodo.tagName === "EM") return hijos ? `*${hijos}*` : "";
  return hijos;
}

interface Props {
  valor: string;
  onCambio(v: string): void;
  etiqueta: string;
  vacio?: string;
  /** Qué clase de bloque es (para las clases de estilo) */
  className?: string;
  editable?: boolean;
  onEnter?(): void;
  onBorrarVacio?(): void;
  onFoco?(api: ApiTexto): void;
  apiRef?: Ref<ApiTexto | null>;
}

export function TextoRico({ valor, onCambio, etiqueta, vacio = "Escriba aquí…", className = "ud-pdf-p", editable = true, onEnter, onBorrarVacio, onFoco, apiRef }: Props) {
  const ctx = useRender();
  const el = useRef<HTMLDivElement>(null);
  const ultimo = useRef(valor);
  const rango = useRef<Range | null>(null);
  const cambio = useRef(onCambio);
  cambio.current = onCambio;

  const leer = useCallback(() => (el.current ? Array.from(el.current.childNodes).map(deDom).join("") : ""), []);

  // Valor que llega de fuera (deshacer, restaurar…): se reescribe el DOM. Lo que la persona escribe no pasa por aquí.
  useLayoutEffect(() => {
    if (!el.current) return;
    if (valor !== ultimo.current || el.current.innerHTML === "" ) {
      if (valor !== leer() || el.current.innerHTML === "") el.current.innerHTML = aHtml(valor, ctx);
      ultimo.current = valor;
    }
  }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps -- ctx se atiende en el efecto de abajo

  // Si cambian los datos (una cifra, el número de una figura), solo se actualiza el texto de las marcas.
  useEffect(() => {
    const raiz = el.current;
    if (!raiz) return;
    raiz.querySelectorAll<HTMLElement>("[data-cifra]").forEach((s) => {
      const c = ctx.cifra(s.dataset.cifra ?? "");
      s.textContent = c?.texto ?? `[[${s.dataset.cifra}]]`;
      if (c?.cambio) s.dataset.cambio = "true";
      else delete s.dataset.cambio;
    });
    raiz.querySelectorAll<HTMLElement>("[data-cita]").forEach((s) => (s.textContent = ctx.texto.cita(s.dataset.cita ?? "", s.dataset.extra ?? "") ?? "(fuente sin definir)"));
    raiz.querySelectorAll<HTMLElement>("[data-ref]").forEach((s) => (s.textContent = ctx.texto.ref(s.dataset.ref ?? "") ?? "(referencia rota)"));
  }, [ctx]);

  const alEscribir = () => {
    const v = leer();
    if (v === ultimo.current) return;
    ultimo.current = v;
    cambio.current(v);
  };

  const api: ApiTexto = {
    negrita: () => void (document.execCommand("bold"), alEscribir()),
    cursiva: () => void (document.execCommand("italic"), alEscribir()),
    enlace: (url) => {
      if (!enlaceSeguro(url)) return;
      const seleccion = window.getSelection();
      if (seleccion && !seleccion.isCollapsed && el.current?.contains(seleccion.anchorNode)) document.execCommand("createLink", false, url);
      else document.execCommand("insertHTML", false, `<a href="${html(url)}">${html(url)}</a>&nbsp;`);
      el.current?.querySelectorAll("a").forEach((a) => a.removeAttribute("target"));
      alEscribir();
    },
    insertar: (m) => {
      const fila = m.tipo === "cifra" ? marcaCifra(m.clave) : m.tipo === "cita" ? marcaCita(m.fuente, m.extra) : marcaRef(m.bloque);
      document.execCommand("insertHTML", false, `${aHtml(fila, ctx)}&nbsp;`);
      alEscribir();
    },
    guardarSeleccion: () => {
      const s = window.getSelection();
      rango.current = s && s.rangeCount && el.current?.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
    },
    restaurarSeleccion: () => {
      el.current?.focus({ preventScroll: true });
      const s = window.getSelection();
      if (rango.current && s) {
        s.removeAllRanges();
        s.addRange(rango.current);
      }
    },
    foco: (alFinal = true) => {
      const raiz = el.current;
      if (!raiz) return;
      raiz.focus({ preventScroll: false });
      const s = window.getSelection();
      if (!s) return;
      const r = document.createRange();
      r.selectNodeContents(raiz);
      r.collapse(!alFinal);
      s.removeAllRanges();
      s.addRange(r);
    },
    textoSeleccionado: () => (window.getSelection()?.toString() ?? ""),
  };
  const apiViva = useRef(api);
  apiViva.current = api;
  // Una API estable que siempre llama a la versión más reciente.
  const estable = useRef<ApiTexto>({
    negrita: () => apiViva.current.negrita(),
    cursiva: () => apiViva.current.cursiva(),
    enlace: (u) => apiViva.current.enlace(u),
    insertar: (m) => apiViva.current.insertar(m),
    guardarSeleccion: () => apiViva.current.guardarSeleccion(),
    restaurarSeleccion: () => apiViva.current.restaurarSeleccion(),
    foco: (f) => apiViva.current.foco(f),
    textoSeleccionado: () => apiViva.current.textoSeleccionado(),
  });
  useImperativeHandle(apiRef, () => estable.current, []);

  return (
    <div
      ref={el}
      className={`${className} ud-rico`}
      contentEditable={editable}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="false"
      aria-label={etiqueta}
      aria-readonly={!editable}
      data-vacio={vacio}
      spellCheck
      lang="es"
      onFocus={() => onFoco?.(estable.current)}
      onInput={alEscribir}
      onBlur={alEscribir}
      onDrop={(e) => e.preventDefault()}
      onPaste={(e) => {
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain").replace(/\s*[\r\n]+\s*/g, " ");
        if (t) document.execCommand("insertText", false, t);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onEnter?.();
        } else if (e.key === "Enter") {
          e.preventDefault();
        } else if (e.key === "Backspace" && leer() === "" && onBorrarVacio) {
          e.preventDefault();
          onBorrarVacio();
        } else if (e.key === "Escape") {
          (e.currentTarget as HTMLElement).blur();
        }
      }}
    />
  );
}

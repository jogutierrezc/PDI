/* =============================================================================
   Encuestas con Pilo · los campos de la página pública (un tipo, un campo).

   Los once tipos de pregunta de la estructura. El bloque «logro o reto con
   cifras» reutiliza el paso de detalle de siempre (Pasos.tsx): la misma captura
   de título, descripción y cifras que ya usaba la Rendición de Cuentas, con
   Editar y Quitar (con deshacer) en la lista de lo registrado.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { ItemBloque, Pregunta, Valor } from "../lib/estructura";
import { formatearValor, leerNumero } from "../lib/validacion";
import { textoTipoAporte } from "../tipos";
import { Detalle } from "./Pasos";
import type { DecirGuia } from "./tipos-pub";

export interface PropsCampo {
  p: Pregunta;
  valor: Valor;
  error?: string;
  /** Pilo dice (el panel del bloque) algo mientras se llena. */
  decir: DecirGuia;
  onCambio: (v: Valor) => void;
  onFoco: () => void;
  describe?: string;
}

const id = (p: Pregunta) => `q-${p.id}`;

function CampoCifra({ p, valor, error, onCambio, onFoco, describe }: PropsCampo) {
  const [texto, setTexto] = useState(() => (typeof valor === "number" ? String(valor).replace(".", ",") : typeof valor === "string" ? valor : ""));
  const unidad = p.validaciones?.unidad;
  const n = leerNumero(texto);
  const eco = texto && n !== null ? (unidad === "porcentaje" ? formatearValor(n, "porcentaje") : unidad === "dinero" ? formatearValor(n, "dinero") : `${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })}${unidad ? ` ${unidad}` : ""}`) : "";
  return (
    <>
      <div className="ep-valor">
        {unidad === "dinero" && <span className="ep-unidad ep-unidad--i">$</span>}
        <input
          id={id(p)}
          className={`ep-input${unidad === "dinero" ? " ep-input--pi" : ""}${unidad === "porcentaje" ? " ep-input--pd" : ""}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={texto}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe}
          onFocus={onFoco}
          onChange={(e) => {
            setTexto(e.target.value);
            const x = leerNumero(e.target.value);
            onCambio(e.target.value.trim() === "" ? null : (x ?? e.target.value));
          }}
        />
        {unidad === "porcentaje" && <span className="ep-unidad ep-unidad--d">%</span>}
      </div>
      {unidad && unidad !== "porcentaje" && unidad !== "dinero" && <div className="ep-fino">Unidad: {unidad}</div>}
      <div className="ep-eco" aria-live="polite">
        {eco && `Se leerá como ${eco}`}
      </div>
    </>
  );
}

function CampoArchivo({ p }: { p: Pregunta }) {
  return (
    <div className="ep-vacio" role="note">
      Adjuntar archivos todavía no está disponible. {p.obligatoria ? "Avise a Planeación Institucional." : "Puede seguir sin adjuntar nada."}
    </div>
  );
}

const vacioItems: ItemBloque[] = [];

function CampoBloque({ p, valor, decir, onCambio }: PropsCampo) {
  const items = Array.isArray(valor) ? (valor as ItemBloque[]) : vacioItems;
  const max = p.validaciones?.maxItems ?? 30;
  const [modo, setModo] = useState<{ tipo: "logro" | "reto"; editando: number | null } | null>(null);
  const [quitado, setQuitado] = useState<{ item: ItemBloque; i: number } | null>(null);
  const reloj = useRef<number>();
  useEffect(() => () => window.clearTimeout(reloj.current), []);

  const quitar = (i: number) => {
    setQuitado({ item: items[i], i });
    onCambio(items.filter((_, k) => k !== i));
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setQuitado(null), 8000);
  };
  const deshacer = () => {
    if (!quitado) return;
    onCambio([...items.slice(0, quitado.i), quitado.item, ...items.slice(quitado.i)]);
    setQuitado(null);
  };

  if (modo) {
    const actual = modo.editando === null ? undefined : items[modo.editando];
    return (
      <Detalle
        key={`${modo.tipo}:${modo.editando ?? "nuevo"}`}
        tipo={modo.tipo}
        inicial={actual}
        decir={decir}
        onVolver={() => setModo(null)}
        onGuardar={(a) => {
          onCambio(modo.editando === null ? [...items, a] : items.map((x, k) => (k === modo.editando ? a : x)));
          setModo(null);
        }}
      />
    );
  }
  return (
    <div className="ep-cola">
      <div className="ep-fila-botones">
        <button type="button" className="ep-btn" disabled={items.length >= max} onClick={() => setModo({ tipo: "logro", editando: null })}>
          Agregar un logro
        </button>
        <button type="button" className="ep-btn" disabled={items.length >= max} onClick={() => setModo({ tipo: "reto", editando: null })}>
          Agregar un reto
        </button>
      </div>
      <h3 id={`${id(p)}-h`}>Lo que lleva registrado</h3>
      {items.length ? (
        <ul aria-labelledby={`${id(p)}-h`}>
          {items.map((a, i) => (
            <li key={`${i}:${a.titulo}`}>
              <span className={`ep-tag ep-tag--${a.tipo}`}>{textoTipoAporte(a.tipo)}</span>
              <div>
                <div className="ep-cola__t">{a.titulo}</div>
                <div className="ep-cola__m">{a.cifras.length === 1 ? "1 cifra" : `${a.cifras.length} cifras`}</div>
              </div>
              <div className="ep-cola__acc">
                <button type="button" className="ep-accion" aria-label={`Editar: ${a.titulo}`} onClick={() => setModo({ tipo: a.tipo, editando: i })}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 15l1-4L13.5 1.5l3 3L7 14l-4 1zM11.5 3.5l3 3" />
                  </svg>
                  <span>Editar</span>
                </button>
                <button type="button" className="ep-quitar" aria-label={`Quitar: ${a.titulo}`} onClick={() => quitar(i)}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 5h12M7.5 5V3.5h3V5M5 5l.7 9.5h6.6L13 5" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ep-vacio">Aún no hay nada. Lo que guarde aparece aquí.</div>
      )}
      <div className="ep-deshacer ep-deshacer--en-linea" role="status" aria-live="polite" data-on={quitado ? "1" : undefined}>
        {quitado && (
          <>
            <span>Quitó «{quitado.item.titulo}».</span>
            <button type="button" onClick={deshacer}>
              Deshacer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** El campo de una pregunta, sin su rótulo (lo pone quien lo usa). */
export function Entrada(props: PropsCampo) {
  const { p, valor, error, onCambio, onFoco, describe } = props;
  const comun = { id: id(p), "aria-invalid": error ? true : undefined, "aria-describedby": describe, onFocus: onFoco } as const;
  const texto = typeof valor === "string" ? valor : "";
  switch (p.tipo) {
    case "texto_corto":
      return <input {...comun} className="ep-input" type="text" maxLength={p.validaciones?.largoMax ?? 300} autoComplete="off" value={texto} onChange={(e) => onCambio(e.target.value)} />;
    case "parrafo":
      return <textarea {...comun} className="ep-input ep-input--area" maxLength={p.validaciones?.largoMax ?? 3000} value={texto} onChange={(e) => onCambio(e.target.value)} />;
    case "contacto":
      return <input {...comun} className="ep-input" type={p.validaciones?.formato === "telefono" ? "tel" : "email"} autoComplete={p.validaciones?.formato === "telefono" ? "tel" : "email"} maxLength={200} value={texto} onChange={(e) => onCambio(e.target.value)} />;
    case "fecha":
      return <input {...comun} className="ep-input ep-input--corto" type="date" value={texto} onChange={(e) => onCambio(e.target.value)} />;
    case "lista":
      return (
        <select {...comun} className="ep-input" value={texto} onChange={(e) => onCambio(e.target.value)}>
          <option value="">Elegir…</option>
          {p.opciones?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.texto}
            </option>
          ))}
        </select>
      );
    case "opcion_unica":
      return (
        <div role="radiogroup" aria-labelledby={`${id(p)}-l`} aria-describedby={describe} className="ep-opciones">
          {p.opciones?.map((o, i) => (
            <label key={o.id} className="ep-eleccion">
              <input type="radio" name={id(p)} id={i === 0 ? id(p) : undefined} checked={texto === o.id} onFocus={onFoco} onChange={() => onCambio(o.id)} />
              <span>{o.texto}</span>
            </label>
          ))}
        </div>
      );
    case "opcion_multiple": {
      const marcadas = Array.isArray(valor) ? (valor as string[]) : [];
      return (
        <div role="group" aria-labelledby={`${id(p)}-l`} aria-describedby={describe} className="ep-opciones">
          {p.opciones?.map((o, i) => (
            <label key={o.id} className="ep-eleccion">
              <input type="checkbox" id={i === 0 ? id(p) : undefined} checked={marcadas.includes(o.id)} onFocus={onFoco} onChange={(e) => onCambio(e.target.checked ? [...marcadas, o.id] : marcadas.filter((x) => x !== o.id))} />
              <span>{o.texto}</span>
            </label>
          ))}
        </div>
      );
    }
    case "escala": {
      const a = p.validaciones?.escalaMin ?? 1;
      const b = p.validaciones?.escalaMax ?? 5;
      return (
        <div>
          <div role="radiogroup" aria-labelledby={`${id(p)}-l`} aria-describedby={describe} className="ep-escala">
            {Array.from({ length: b - a + 1 }, (_, i) => a + i).map((n) => (
              <label key={n} className="ep-escala__n" data-on={valor === n ? "1" : undefined}>
                <input type="radio" name={id(p)} id={n === a ? id(p) : undefined} checked={valor === n} onFocus={onFoco} onChange={() => onCambio(n)} />
                <span>{n}</span>
              </label>
            ))}
          </div>
          {(p.validaciones?.etiquetaMin || p.validaciones?.etiquetaMax) && (
            <div className="ep-escala__ext">
              <span>{p.validaciones?.etiquetaMin}</span>
              <span>{p.validaciones?.etiquetaMax}</span>
            </div>
          )}
        </div>
      );
    }
    case "cifra":
      return <CampoCifra {...props} />;
    case "archivo":
      return <CampoArchivo p={p} />;
    case "bloque_logro_reto":
      return <CampoBloque {...props} />;
  }
}


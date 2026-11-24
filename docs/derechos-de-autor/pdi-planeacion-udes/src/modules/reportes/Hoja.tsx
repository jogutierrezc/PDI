/* =============================================================================
   Hoja: la rejilla tipo Excel de una plantilla.
   · Una casilla es un input; las columnas con fuente sugieren sus nombres con
     un datalist y, al salir de la casilla, un código o un nombre sin tildes se
     cambia por la etiqueta del catálogo (motor.canonizar).
   · Enter baja, Mayús+Enter sube, las flechas se mueven; Ctrl+V pega un rango
     copiado de Excel desde la casilla enfocada.
   · Obligatoria vacía = rayada. El triángulo rojo y su mensaje solo aparecen
     después de «Validar plantilla».
   · Miles de filas: por encima de 300 la hoja se pagina de 200 en 200. Cada
     fila es un componente memorizado, así que escribir en una casilla solo
     vuelve a pintar su fila.
   ========================================================================== */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, RefObject } from "react";
import { Icon } from "../../components/ui/Icon";
import { motor } from "./motor";
import type { Campo, Contexto, Fila, Fuente, PlantillaSpec } from "./tipos";
import { vacio } from "./util";

export const TAM_PAGINA = 200;
const UMBRAL_PAGINAR = 300;

export type ErroresPorFila = Map<number, Record<string, string[]>>;

export interface IrA {
  fila: number;
  campo: string;
  /** Cambia en cada pedido, para volver a la misma casilla dos veces. */
  n: number;
}

interface HojaProps {
  spec: PlantillaSpec;
  filas: Fila[];
  ctx: Contexto;
  errores: ErroresPorFila;
  /** Casillas cambiadas y aún sin guardar: «fila:campo». */
  sucias: Set<string>;
  soloLectura: boolean;
  onCambiar: (fila: number, campo: string, valor: string) => void;
  onPegar: (fila: number, columna: number, matriz: string[][]) => void;
  onAgregar: () => void;
  onFoco: (fila: number) => void;
  irA: IrA | null;
  marcoRef: RefObject<HTMLDivElement>;
}

const idFuente = (f: Fuente) => (f.tipo === "catalogo" ? `ri-dl-c-${f.catalogo}` : `ri-dl-d-${f.dominio}`);
const idCasilla = (fila: number, col: number) => `ri-c-${fila}-${col}`;

export function Hoja({ spec, filas, ctx, errores, sucias, soloLectura, onCambiar, onPegar, onAgregar, onFoco, irA, marcoRef }: HojaProps) {
  const campos = spec.campos;
  const paginada = filas.length > UMBRAL_PAGINAR;
  const paginas = paginada ? Math.ceil(filas.length / TAM_PAGINA) : 1;
  const [pagina, setPagina] = useState(0);
  const pag = Math.min(pagina, paginas - 1);
  const desde = paginada ? pag * TAM_PAGINA : 0;
  const hasta = paginada ? Math.min(filas.length, desde + TAM_PAGINA) : filas.length;
  const [pendiente, setPendiente] = useState<{ fila: number; col: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null);

  // Una lista por fuente, compartida por todas las casillas de esa fuente.
  const listas = useMemo(() => {
    const vistas = new Map<string, Fuente>();
    for (const c of campos) if (c.fuente) vistas.set(idFuente(c.fuente), c.fuente);
    return Array.from(vistas, ([id, fuente]) => ({ id, opciones: motor.opciones(fuente, ctx) }));
  }, [campos, ctx]);

  // Enfocar una casilla que quizá está en otra página.
  const enfocar = (fila: number, col: number) => {
    if (fila < 0 || fila >= filas.length || col < 0 || col >= campos.length) return;
    const destino = paginada ? Math.floor(fila / TAM_PAGINA) : 0;
    if (destino !== pag) {
      setPagina(destino);
      setPendiente({ fila, col });
      return;
    }
    const input = document.getElementById(idCasilla(fila, col)) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
      input.closest("td")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  useEffect(() => {
    if (!pendiente) return;
    const input = document.getElementById(idCasilla(pendiente.fila, pendiente.col)) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
      input.closest("td")?.scrollIntoView({ block: "center", inline: "center" });
    }
    setPendiente(null);
  }, [pendiente, pag]);

  // Desde el panel de errores.
  useEffect(() => {
    if (!irA) return;
    const col = campos.findIndex((c) => c.codigo === irA.campo);
    enfocar(irA.fila, Math.max(0, col));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irA]);

  const posicion = (el: EventTarget) => {
    const t = el as HTMLElement;
    if (t.tagName !== "INPUT" || t.dataset.r === undefined) return null;
    return { fila: Number(t.dataset.r), col: Number(t.dataset.c), input: t as HTMLInputElement };
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const p = posicion(e.target);
    if (!p) return;
    const { input } = p;
    let { fila, col } = p;
    const alInicio = input.selectionStart === 0 && input.selectionEnd === 0;
    const alFinal = input.selectionStart === input.value.length;
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) fila++;
    else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) fila--;
    else if (e.key === "ArrowLeft" && alInicio) col--;
    else if (e.key === "ArrowRight" && alFinal) col++;
    else return;
    e.preventDefault();
    enfocar(fila, col);
  };

  const onPaste = (e: ClipboardEvent<HTMLTableElement>) => {
    const p = posicion(e.target);
    if (!p || soloLectura) return;
    const texto = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(texto)) return;
    e.preventDefault();
    const matriz = texto
      .replace(/\r/g, "")
      .replace(/\n$/, "")
      .split("\n")
      .map((l) => l.split("\t"));
    onPegar(p.fila, p.col, matriz);
  };

  const mostrarTip = (el: EventTarget | null) => {
    const td = (el as HTMLElement | null)?.closest?.("td[data-msg]") as HTMLElement | null;
    if (!td) return setTip(null);
    const b = td.getBoundingClientRect();
    setTip({ x: Math.max(8, Math.min(b.left, window.innerWidth - 336)), y: b.bottom + 6, texto: td.dataset.msg ?? "" });
  };

  const indices = [];
  for (let i = desde; i < hasta; i++) indices.push(i);

  return (
    <div className="ri-hoja">
      <p className="ri-hint">
        Se escribe como en Excel: <kbd>Enter</kbd> baja, las flechas se mueven entre casillas y <kbd>Ctrl</kbd>+<kbd>V</kbd>{" "}
        pega un rango. Las columnas con <Icon name="layers" size={12} /> se llenan con nombres del catálogo; si alguien escribe
        el código, se cambia por su nombre.
      </p>

      <div className="ri-sheet" ref={marcoRef} onScroll={() => setTip(null)}>
        <div className="ri-scan" aria-hidden="true" />
        <table
          className="ri-grid"
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onMouseOver={(e) => mostrarTip(e.target)}
          onMouseLeave={() => setTip(null)}
          onFocus={(e) => {
            mostrarTip(e.target);
            const p = posicion(e.target);
            if (p) onFoco(p.fila);
          }}
          onBlur={() => setTip(null)}
        >
          <thead>
            <tr>
              <th className="ri-rn" scope="col">
                <span className="sr-only">Fila</span>#
              </th>
              {campos.map((c) => (
                <th
                  key={c.codigo}
                  scope="col"
                  className={`${c.obligatorio ? "is-req" : ""}${c.ancho ? " is-wide" : ""}`}
                  title={[c.etiqueta, c.ayuda, c.seccion].filter(Boolean).join(" · ")}
                >
                  {c.etiqueta}
                  {c.fuente && (
                    <span className="ri-cat-icon" title="Se elige de la lista">
                      <Icon name="layers" size={13} />
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indices.map((i) => {
              const errs = errores.get(i);
              return (
                <FilaHoja
                  key={i}
                  indice={i}
                  fila={filas[i]}
                  campos={campos}
                  ctx={ctx}
                  errores={errs}
                  firma={firmaErrores(errs)}
                  sucias={firmaSucias(sucias, i, campos)}
                  soloLectura={soloLectura}
                  onCambiar={onCambiar}
                />
              );
            })}
          </tbody>
        </table>
        {filas.length === 0 && (
          <p className="ri-sheet-empty">
            La hoja está vacía. {soloLectura ? "" : "Agregue una fila, pegue un rango desde Excel o importe el archivo."}
          </p>
        )}
      </div>

      {listas.map((l) => (
        <datalist key={l.id} id={l.id}>
          {l.opciones.map((o) => (
            <option key={o.codigo} value={o.nombre} />
          ))}
        </datalist>
      ))}

      <div className="ri-sheet-foot">
        {!soloLectura && (
          <button
            type="button"
            className="button-ghost ri-sm"
            onClick={() => {
              onAgregar();
              setPendiente({ fila: filas.length, col: 0 });
              if (paginada || filas.length + 1 > UMBRAL_PAGINAR) setPagina(Math.floor(filas.length / TAM_PAGINA));
            }}
          >
            <Icon name="plus" size={16} />
            Agregar fila
          </button>
        )}
        {paginada && (
          <div className="ri-pager" role="group" aria-label="Páginas de la hoja">
            <button type="button" className="button-ghost ri-sm" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>
              <Icon name="arrow-left" size={14} />
              Anteriores
            </button>
            <span className="ri-num">
              Filas {desde + 1}–{hasta} de {filas.length}
            </span>
            <button type="button" className="button-ghost ri-sm" disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)}>
              Siguientes
              <Icon name="arrow-right" size={14} />
            </button>
          </div>
        )}
      </div>

      <div className={`ri-tip${tip ? " is-on" : ""}`} role="tooltip" style={tip ? { left: tip.x, top: tip.y } : undefined}>
        {tip?.texto}
      </div>
    </div>
  );
}

function firmaErrores(errs: Record<string, string[]> | undefined) {
  if (!errs) return "";
  return Object.entries(errs)
    .map(([k, v]) => `${k}:${v.join("|")}`)
    .join(";");
}

function firmaSucias(sucias: Set<string>, fila: number, campos: Campo[]) {
  if (sucias.size === 0) return "";
  let s = "";
  for (const c of campos) if (sucias.has(`${fila}:${c.codigo}`)) s += `${c.codigo};`;
  return s;
}

interface FilaHojaProps {
  indice: number;
  fila: Fila;
  campos: Campo[];
  ctx: Contexto;
  errores: Record<string, string[]> | undefined;
  firma: string;
  sucias: string;
  soloLectura: boolean;
  onCambiar: (fila: number, campo: string, valor: string) => void;
}

const FilaHoja = memo(
  function FilaHoja({ indice, fila, campos, ctx, errores, sucias, soloLectura, onCambiar }: FilaHojaProps) {
    const conError = Boolean(errores && Object.keys(errores).length);
    return (
      <tr className={conError ? "is-errrow" : undefined}>
        <th className="ri-rn" scope="row">
          {indice + 1}
        </th>
        {campos.map((c, j) => {
          const valor = fila[c.codigo] ?? "";
          const msgs = errores?.[c.codigo];
          return (
            <td
              key={c.codigo}
              data-empty={(c.obligatorio && vacio(valor)) || undefined}
              data-err={msgs ? "" : undefined}
              data-dirty={(!msgs && sucias.includes(`${c.codigo};`)) || undefined}
              data-msg={msgs ? msgs.join("\n") : undefined}
            >
              <input
                id={idCasilla(indice, j)}
                data-r={indice}
                data-c={j}
                value={valor}
                readOnly={soloLectura}
                list={c.fuente && !soloLectura ? idFuente(c.fuente) : undefined}
                placeholder={c.placeholder}
                aria-label={`Fila ${indice + 1}, ${c.etiqueta}`}
                aria-invalid={msgs ? true : undefined}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onCambiar(indice, c.codigo, e.target.value)}
                onBlur={(e) => {
                  if (soloLectura || !c.fuente) return;
                  const canon = motor.canonizar(c, e.target.value, ctx);
                  if (canon !== e.target.value) onCambiar(indice, c.codigo, canon);
                }}
              />
            </td>
          );
        })}
      </tr>
    );
  },
  (a, b) =>
    a.fila === b.fila &&
    a.indice === b.indice &&
    a.firma === b.firma &&
    a.sucias === b.sucias &&
    a.soloLectura === b.soloLectura &&
    a.campos === b.campos &&
    a.ctx === b.ctx &&
    a.onCambiar === b.onCambiar,
);

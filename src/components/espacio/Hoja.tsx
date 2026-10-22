/* =============================================================================
   Espacio de archivos · la hoja del editor (vista Tabla y vista Lista).

   Las filas visibles salen de @tanstack/react-table (orden, búsqueda y
   selección, en Editor.tsx) y aquí se dibujan con @tanstack/react-virtual:
   un archivo de miles de filas pinta solo lo que se ve.

   Escribir
     · Enter, ↓ y ↑ pasan a la misma columna de la fila de abajo o de arriba;
     · lo escrito se valida al instante (rojo con el motivo) y se confirma al
       salir de la celda; las listas se eligen de un desplegable;
     · Ctrl+V pega un bloque de Excel desde la celda activa;
     · las columnas de solo lectura llevan candado y las filas bloqueadas se
       ven como texto, con el motivo al pasar el puntero.
   ========================================================================== */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Icon } from "../ui/Icon";
import { llaveDeCelda, parsearPortapapeles, textoDeValor } from "./logica";
import type { EspColumna, FilaLocal, Reglas } from "./tipos";

export interface HojaProps {
  columnas: EspColumna[];
  filas: FilaLocal[];
  errores: ReadonlyMap<string, string>;
  reglas: Reglas;
  editable: boolean;
  fijarPrimera: boolean;
  ordenes: ReadonlyMap<string, "asc" | "desc">;
  seleccion: ReadonlySet<string>;
  todasSeleccionadas: boolean;
  hayBusqueda: boolean;
  vista: "tabla" | "lista";
  onOrdenar: (clave: string, varias: boolean) => void;
  onCambiar: (k: string, columna: EspColumna, escrito: string) => void;
  onPegar: (desde: { fila: number; columna: number }, matriz: string[][]) => void;
  onSeleccionar: (k: string, marcado: boolean) => void;
  onSeleccionarTodas: (marcado: boolean) => void;
  onQuitar: (k: string) => void;
  onAgregar: () => void;
  /** Por qué una fila no se puede escribir, o nulo si sí. */
  bloqueoFila?: (f: FilaLocal) => string | null;
  /** Columna de solo lectura al comienzo con el grupo de la fila (p. ej. el campus). */
  columnaGrupo?: { etiqueta: string; texto: (grupo: string | undefined) => string };
  /** Más columnas de solo lectura tras el grupo (p. ej. quién registró la fila, cuándo y de dónde). */
  columnasInfo?: { etiqueta: string; ancho?: number; texto: (f: FilaLocal) => string }[];
  /** Última columna con el estado de cada fila (guardado manual). */
  columnaEstado?: { etiqueta: string; celda: (f: FilaLocal) => ReactNode };
  /** Se pueden agregar filas (muestra el botón del estado vacío). */
  puedeAgregar?: boolean;
  /** Color de fondo de una celda (mapa de calor); nulo si no lleva. Siempre un tono claro: el texto sigue oscuro. */
  colorCelda?: (columna: EspColumna, valor: unknown) => string | undefined;
}

export interface HojaApi {
  /** Lleva el foco a la celda de la fila `indice` (en el orden que se ve) y la columna `clave`. */
  enfocar: (indice: number, clave: string) => void;
  activa: () => { k: string; clave: string } | null;
}

const ALTO_FILA = 34;
const ANCHO_N = 44;
const ANCHO_GRUPO = 140;
const ANCHO_ESTADO = 130;
const ANCHO_INFO = 150;

export function anchoDe(c: Pick<EspColumna, "tipo" | "etiqueta">): number {
  if (c.tipo === "numero" || c.tipo === "porcentaje") return 128;
  if (c.tipo === "fecha") return 140;
  if (c.tipo === "lista") return 176;
  return Math.max(150, Math.min(280, c.etiqueta.length * 8 + 40));
}

function Celda({
  k,
  columna,
  valor,
  mensaje,
  deshabilitada,
  fondo,
  onCommit,
  onTecla,
  onPegar,
}: {
  k: string;
  columna: EspColumna;
  valor: unknown;
  mensaje: string;
  deshabilitada: boolean;
  fondo?: string;
  onCommit: (texto: string) => void;
  onTecla: (e: KeyboardEvent<HTMLElement>, destino: "abajo" | "arriba" | null) => void;
  onPegar: (e: ClipboardEvent<HTMLElement>) => void;
}) {
  const texto = textoDeValor(valor);
  const [borrador, setBorrador] = useState(texto);
  const enfocada = useRef(false);
  useEffect(() => {
    if (!enfocada.current) setBorrador(texto);
  }, [texto]);
  const comun = {
    className: "es-cell",
    "data-celda": llaveDeCelda(k, columna.clave),
    "aria-label": columna.etiqueta,
    "aria-invalid": mensaje ? true : undefined,
    disabled: deshabilitada,
    onPaste: onPegar,
    style: fondo ? { background: fondo } : undefined,
  };
  if (columna.tipo === "lista") {
    const opciones = columna.opciones.includes(texto) || !texto ? columna.opciones : [texto, ...columna.opciones];
    return (
      <select
        {...comun}
        value={texto}
        onChange={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !e.altKey) onTecla(e, "abajo");
          else if (e.key === "ArrowUp" && !e.altKey) onTecla(e, "arriba");
        }}
      >
        <option value="" />
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      {...comun}
      value={borrador}
      placeholder={columna.tipo === "fecha" ? "AAAA-MM-DD" : columna.obligatorio ? "obligatorio" : undefined}
      inputMode={columna.tipo === "numero" || columna.tipo === "porcentaje" ? "decimal" : undefined}
      onFocus={(e) => {
        enfocada.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => {
        enfocada.current = false;
        if (borrador !== texto) onCommit(borrador);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (borrador !== texto) onCommit(borrador);
          onTecla(e, e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? "arriba" : "abajo");
        }
      }}
    />
  );
}

export const Hoja = forwardRef<HojaApi, HojaProps>(function Hoja(p, ref) {
  const lienzo = useRef<HTMLDivElement>(null);
  const { columnas, filas, errores, editable, reglas } = p;
  const lista = p.vista === "lista";
  const virtualizador = useVirtualizer({
    count: filas.length,
    getScrollElement: () => lienzo.current,
    estimateSize: () => (lista ? 150 : ALTO_FILA),
    gap: lista ? 10 : 0,
    overscan: 12,
    getItemKey: (i) => filas[i]?.k ?? i,
  });

  const enfocarCelda = useCallback((k: string, clave: string, intentos = 8) => {
    const buscar = () => {
      const nodo = lienzo.current?.querySelector<HTMLElement>(`[data-celda="${CSS.escape(llaveDeCelda(k, clave))}"]`);
      if (nodo && !(nodo as HTMLInputElement).disabled) {
        nodo.focus({ preventScroll: false });
        return true;
      }
      return false;
    };
    if (buscar()) return;
    let n = 0;
    const paso = () => {
      if (buscar() || ++n >= intentos) return;
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }, []);

  const filasRef = useRef(filas);
  filasRef.current = filas;
  const columnasRef = useRef(columnas);
  columnasRef.current = columnas;
  const virtRef = useRef(virtualizador);
  virtRef.current = virtualizador;

  useImperativeHandle(
    ref,
    () => ({
      enfocar: (indice, clave) => {
        const f = filasRef.current[indice];
        if (!f) return;
        virtRef.current.scrollToIndex(indice, { align: "auto" });
        enfocarCelda(f.k, clave);
      },
      activa: () => {
        const el = document.activeElement as HTMLElement | null;
        const llave = el?.getAttribute?.("data-celda");
        if (!llave || !lienzo.current?.contains(el)) return null;
        const [k, clave] = llave.split("\u0001");
        return { k, clave };
      },
    }),
    [enfocarCelda],
  );

  const moverVertical = (k: string, clave: string, destino: "abajo" | "arriba", e: KeyboardEvent<HTMLElement>) => {
    const i = filasRef.current.findIndex((f) => f.k === k);
    const j = destino === "abajo" ? i + 1 : i - 1;
    if (i < 0 || j < 0 || j >= filasRef.current.length) return;
    e.preventDefault();
    virtRef.current.scrollToIndex(j, { align: "auto" });
    enfocarCelda(filasRef.current[j].k, clave);
  };

  const pegar = (e: ClipboardEvent<HTMLElement>, k: string, clave: string) => {
    if (!editable) return;
    const matriz = parsearPortapapeles(e.clipboardData.getData("text"));
    if (!matriz) return;
    e.preventDefault();
    const fila = filasRef.current.findIndex((f) => f.k === k);
    p.onPegar({ fila: Math.max(0, fila), columna: Math.max(0, columnasRef.current.findIndex((c) => c.clave === clave)) }, matriz);
  };

  const g = p.columnaGrupo;
  const est = p.columnaEstado;
  const info = p.columnasInfo ?? [];
  const izquierda = ANCHO_N + (g ? ANCHO_GRUPO : 0) + info.reduce((s, x) => s + (x.ancho ?? ANCHO_INFO), 0);
  const ancho = columnas.reduce((s, c) => s + anchoDe(c), izquierda + (est ? ANCHO_ESTADO : 0));
  const primera = columnas[0]?.clave;
  // Antes de medir la ventana (y sin pantalla, como en el servidor y las pruebas) se pintan las primeras filas.
  const reales = virtualizador.getVirtualItems();
  const items = reales.length || !filas.length ? reales : filas.slice(0, 30).map((_, index) => ({ index, start: index * (lista ? 160 : ALTO_FILA) }));

  /** Una celda de una fila: editable, o texto si la columna o la fila no se escriben. */
  const celda = (f: FilaLocal, c: EspColumna, bloqueo: string | null) => (
    <Celda
      k={f.k}
      columna={c}
      valor={f.datos[c.clave]}
      mensaje={errores.get(llaveDeCelda(f.k, c.clave)) ?? ""}
      deshabilitada={!editable || Boolean(c.solo_lectura) || Boolean(bloqueo)}
      fondo={p.colorCelda?.(c, f.datos[c.clave])}
      onCommit={(t) => p.onCambiar(f.k, c, t)}
      onTecla={(e, d) => d && moverVertical(f.k, c.clave, d, e)}
      onPegar={(e) => pegar(e, f.k, c.clave)}
    />
  );
  const textoFijo = (c: EspColumna, f: FilaLocal) => (reglas.textoBloqueado ? reglas.textoBloqueado(c, f.datos[c.clave] ?? null) : textoDeValor(f.datos[c.clave]));

  if (lista) {
    return (
      <div className="es-canvas" ref={lienzo} data-tour="es-hoja">
        {filas.length ? (
          <div className="es-lview" style={{ height: virtualizador.getTotalSize(), position: "relative", display: "block", maxWidth: 880 }}>
            {items.map((it) => {
              const f = filas[it.index];
              const bloqueo = p.bloqueoFila?.(f) ?? null;
              const titulo = columnas[0];
              return (
                <div key={f.k} ref={virtualizador.measureElement} data-index={it.index} data-fila-entra className="es-li" title={bloqueo ?? undefined} style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${it.start}px)` }}>
                  <div className="es-li__t">
                    {titulo ? celda(f, titulo, bloqueo) : null}
                    {editable && !bloqueo ? (
                      <button type="button" className="es-mini" onClick={() => p.onQuitar(f.k)} aria-label="Quitar elemento">
                        <Icon name="close" size={14} />
                      </button>
                    ) : null}
                  </div>
                  <div className="es-li__fs">
                    {columnas.slice(1).map((c) => {
                      const m = errores.get(llaveDeCelda(f.k, c.clave)) ?? "";
                      return (
                        <label key={c.clave} data-bad={Boolean(m)} title={m || undefined}>
                          <span>
                            {c.etiqueta}
                            {c.obligatorio ? <span className="es-req"> *</span> : null}
                          </span>
                          {celda(f, c, bloqueo)}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="es-empty" style={{ margin: 24 }}>
            <b>{p.hayBusqueda ? "Nada coincide con la búsqueda" : "Todavía no hay elementos"}</b>
            {editable && p.puedeAgregar !== false && !p.hayBusqueda ? (
              <button type="button" className="es-btn es-btn--pri" onClick={p.onAgregar}>
                <Icon name="plus" size={16} />
                Agregar elemento
              </button>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="es-canvas" ref={lienzo} data-tour="es-hoja">
      <div className="es-grid" role="grid" aria-rowcount={filas.length + 1} style={{ width: ancho }}>
        <div className="es-grid__head" role="row">
          <div className="es-gh es-gh--rn" role="columnheader" style={{ width: ANCHO_N }}>
            {editable ? <input type="checkbox" checked={p.todasSeleccionadas} onChange={(e) => p.onSeleccionarTodas(e.target.checked)} aria-label="Seleccionar todas las filas" /> : "#"}
          </div>
          {g ? (
            <div className="es-gh" role="columnheader" style={{ width: ANCHO_GRUPO }}>
              {g.etiqueta}
            </div>
          ) : null}
          {info.map((x) => (
            <div key={x.etiqueta} className="es-gh" role="columnheader" style={{ width: x.ancho ?? ANCHO_INFO }}>
              {x.etiqueta}
            </div>
          ))}
          {columnas.map((c) => {
            const orden = p.ordenes.get(c.clave);
            const pin = p.fijarPrimera && c.clave === primera;
            return (
              <div key={c.clave} className={`es-gh${pin ? " es-gh--pin" : ""}`} role="columnheader" title={c.ayuda} aria-sort={orden ? (orden === "asc" ? "ascending" : "descending") : undefined} style={{ width: anchoDe(c), left: pin ? izquierda : undefined }}>
                <button type="button" onClick={(e) => p.onOrdenar(c.clave, e.shiftKey)} title="Ordenar (Mayús para varias columnas)">
                  <span>
                    {c.etiqueta}
                    {c.obligatorio ? <span className="es-req"> *</span> : null}
                  </span>
                  <svg className="es-sortic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={orden === "desc" ? "M12 19V5m0 14l-5-5m5 5l5-5" : "M12 5v14m0-14l-5 5m5-5l5 5"} />
                  </svg>
                </button>
                {c.solo_lectura ? <Icon name="lock" size={12} title={`Viene de ${c.solo_lectura}`} /> : null}
              </div>
            );
          })}
          {est ? (
            <div className="es-gh" role="columnheader" style={{ width: ANCHO_ESTADO }}>
              {est.etiqueta}
            </div>
          ) : null}
        </div>
        {filas.length ? (
          <div style={{ height: virtualizador.getTotalSize(), position: "relative" }}>
            {items.map((it) => {
              const f = filas[it.index];
              const marcada = p.seleccion.has(f.k);
              const bloqueo = p.bloqueoFila?.(f) ?? null;
              return (
                <div key={f.k} className="es-grid__row" role="row" data-sel={marcada} data-fila-entra title={bloqueo ?? undefined} style={{ transform: `translateY(${it.start}px)`, width: ancho }}>
                  <div className="es-gc es-gc--rn" role="gridcell" style={{ width: ANCHO_N }}>
                    {editable && !bloqueo ? <input type="checkbox" checked={marcada} onChange={(e) => p.onSeleccionar(f.k, e.target.checked)} aria-label={`Seleccionar la fila ${it.index + 1}`} /> : it.index + 1}
                  </div>
                  {g ? (
                    <div className="es-gc es-gc--lk" role="gridcell" style={{ width: ANCHO_GRUPO }}>
                      {g.texto(f.grupo)}
                    </div>
                  ) : null}
                  {info.map((x) => (
                    <div key={x.etiqueta} className="es-gc es-gc--lk" role="gridcell" style={{ width: x.ancho ?? ANCHO_INFO }} title={x.texto(f)}>
                      {x.texto(f)}
                    </div>
                  ))}
                  {columnas.map((c) => {
                    const pin = p.fijarPrimera && c.clave === primera;
                    const estilo = { width: anchoDe(c), left: pin ? izquierda : undefined };
                    if (c.solo_lectura || bloqueo) {
                      return (
                        <div key={c.clave} className={`es-gc es-gc--lk${pin ? " es-gc--pin" : ""}`} role="gridcell" title={c.solo_lectura ? `Viene de ${c.solo_lectura}` : (bloqueo ?? undefined)} style={estilo}>
                          {bloqueo ? textoFijo(c, f) : textoDeValor(f.datos[c.clave])}
                        </div>
                      );
                    }
                    const m = errores.get(llaveDeCelda(f.k, c.clave)) ?? "";
                    return (
                      <div key={c.clave} className={`es-gc${m ? " es-gc--bad" : ""}${pin ? " es-gc--pin" : ""}`} role="gridcell" title={m || undefined} style={estilo}>
                        {celda(f, c, null)}
                      </div>
                    );
                  })}
                  {est ? (
                    <div className="es-gc es-gc--lk" role="gridcell" style={{ width: ANCHO_ESTADO }}>
                      {est.celda(f)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="es-gempty">
            {p.hayBusqueda ? "Nada coincide con la búsqueda." : `Todavía no hay filas. ${editable && p.puedeAgregar !== false ? "Agregue una, pegue desde Excel o cargue un archivo." : ""}`}
            {editable && p.puedeAgregar !== false && !p.hayBusqueda ? (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="es-btn es-btn--pri es-btn--sm" onClick={p.onAgregar}>
                  <Icon name="plus" size={16} />
                  Agregar fila
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});

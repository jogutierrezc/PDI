/* =============================================================================
   Encuestas con Pilo · la tabla de respuestas (tipo hoja de cálculo).

   Una fila por aporte o por cifra. Se navega con las flechas (una sola celda
   entra en el orden del Tab, como en una hoja), el encabezado ordena, el
   estado se cambia en la celda y Enter o un clic abren el detalle de la fila.
   Lo que se ve es lo que se copia a Excel o se baja en CSV.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ESTADOS, textoEstado, textoTipoAporte } from "../tipos";
import type { Aporte, EstadoAporte, TipoAporte } from "../tipos";
import { aCsv, aTsv, COLUMNAS, dependenciasDe, fechaCorta, filasDe, matrizDe, SIN_FILTROS, textoTipoCifra, valorDeCifra } from "../lib/tabla";
import type { ClaveColumna, Fila, Filtros, Orden, Vista } from "../lib/tabla";
import { formatearValor } from "../lib/validacion";

function descargar(contenido: Blob, nombre: string) {
  const url = URL.createObjectURL(contenido);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function Celda({ f, clave, puedeEditar, onEstado }: { f: Fila; clave: ClaveColumna; puedeEditar: boolean; onEstado: (id: string, e: EstadoAporte) => void }) {
  const a = f.aporte;
  switch (clave) {
    case "fecha":
      return <>{fechaCorta(a.created_at)}</>;
    case "dependencia":
      return <>{a.dependencia}</>;
    case "correo":
      return (
        <>
          {a.correo}
          {!a.correo_verificado && <span className="en-sinconf"> (sin confirmar)</span>}
        </>
      );
    case "tipo":
      return <span className={`en-tag en-tag--${a.tipo}`}>{textoTipoAporte(a.tipo)}</span>;
    case "titulo":
      return <span className="en-corto en-fuerte">{a.titulo}</span>;
    case "descripcion":
      return <span className="en-corto">{a.descripcion}</span>;
    case "cifras":
      return <>{a.cifras.length}</>;
    case "que":
      return <>{f.cifra?.que}</>;
    case "tipoCifra":
      return <>{f.cifra ? textoTipoCifra(f.cifra) : ""}</>;
    case "valor":
      return <>{f.cifra ? valorDeCifra(f.cifra) : ""}</>;
    case "estado":
      return puedeEditar ? (
        <select className="en-est" data-v={a.estado} value={a.estado} aria-label={`Estado del aporte «${a.titulo}»`} onChange={(e) => onEstado(a.id, e.target.value as EstadoAporte)}>
          {ESTADOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.texto}
            </option>
          ))}
        </select>
      ) : (
        <span className="en-est en-est--fijo" data-v={a.estado}>
          {textoEstado(a.estado)}
        </span>
      );
    default:
      return null;
  }
}

function Detalle({ a, onCerrar }: { a: Aporte; onCerrar: () => void }) {
  return (
    <section className="en-detalle" aria-label="Detalle del aporte">
      <div>
        <span className={`en-tag en-tag--${a.tipo}`}>{textoTipoAporte(a.tipo)}</span>
        <h3>{a.titulo}</h3>
        <p className="en-detalle__texto">{a.descripcion}</p>
      </div>
      <div>
        <dl className="en-ficha">
          <dt>Dependencia</dt>
          <dd>{a.dependencia}</dd>
          <dt>Enviado por</dt>
          <dd>
            {a.correo}
            {!a.correo_verificado && <span className="en-sinconf"> (sin confirmar)</span>}
          </dd>
          <dt>Recibido</dt>
          <dd>{fechaCorta(a.created_at)}</dd>
          <dt>Estado</dt>
          <dd>{textoEstado(a.estado)}</dd>
        </dl>
        <table className="en-mini">
          <thead>
            <tr>
              <th scope="col">Cifra</th>
              <th scope="col">Tipo</th>
              <th scope="col">Valor</th>
            </tr>
          </thead>
          <tbody>
            {[...a.cifras]
              .sort((x, y) => x.orden - y.orden)
              .map((c) => (
                <tr key={c.id}>
                  <td>{c.que}</td>
                  <td>{textoTipoCifra(c)}</td>
                  <td>{formatearValor(c.valor, c.tipo)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <button type="button" className="en-btn en-btn--cierre" onClick={onCerrar}>
          Cerrar detalle
        </button>
      </div>
    </section>
  );
}

export function TablaRespuestas({
  aportes,
  slug,
  puedeEditar,
  onEstado,
  onAviso,
}: {
  aportes: readonly Aporte[];
  slug: string;
  puedeEditar: boolean;
  onEstado: (id: string, e: EstadoAporte) => void;
  onAviso: (texto: string) => void;
}) {
  const [vista, setVista] = useState<Vista>("aporte");
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [orden, setOrden] = useState<Orden>({ clave: "n", sentido: 1 });
  const [cur, setCur] = useState<[number, number]>([0, 0]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const tabla = useRef<HTMLTableElement>(null);

  const columnas = COLUMNAS[vista];
  const filas = useMemo(() => filasDe(aportes, vista, filtros, orden), [aportes, vista, filtros, orden]);
  const dependencias = useMemo(() => dependenciasDe(aportes), [aportes]);
  const detalle = abierto ? (aportes.find((a) => a.id === abierto) ?? null) : null;

  // Un cambio de filtros o de vista puede dejar el cursor fuera de la tabla.
  useEffect(() => {
    setCur(([r, c]) => [Math.min(r, Math.max(0, filas.length - 1)), Math.min(c, columnas.length - 1)]);
  }, [filas.length, columnas.length]);

  const filtrar = (cambio: Partial<Filtros>) => {
    setFiltros((f) => ({ ...f, ...cambio }));
    setCur([0, 0]);
  };
  const cambiarVista = (v: Vista) => {
    setVista(v);
    setOrden({ clave: "n", sentido: 1 });
    setCur([0, 0]);
  };
  const ordenarPor = (clave: ClaveColumna) => setOrden((o) => ({ clave, sentido: o.clave === clave && o.sentido === 1 ? -1 : 1 }));

  const ir = (r: number, c: number) => {
    const nr = Math.max(0, Math.min(filas.length - 1, r));
    const nc = Math.max(0, Math.min(columnas.length - 1, c));
    setCur([nr, nc]);
    const el = tabla.current?.querySelector<HTMLElement>(`[data-r="${nr}"][data-c="${nc}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const alTeclear = (e: KeyboardEvent<HTMLTableElement>) => {
    const celda = (e.target as HTMLElement).closest<HTMLElement>("[data-r]");
    if (!celda || (e.target as HTMLElement).matches("select")) return;
    const r = Number(celda.dataset.r);
    const c = Number(celda.dataset.c);
    const mov: Record<string, [number, number]> = { ArrowDown: [r + 1, c], ArrowUp: [r - 1, c], ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1], Home: [r, 0], End: [r, columnas.length - 1], PageDown: [r + 10, c], PageUp: [r - 10, c] };
    if (mov[e.key]) {
      e.preventDefault();
      ir(...mov[e.key]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const f = filas[r];
      if (f) setAbierto(abierto === f.aporte.id ? null : f.aporte.id);
    } else if (e.key === "Escape") setAbierto(null);
  };

  const exportable = () => matrizDe(filas, vista);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(aTsv(exportable()));
      onAviso("Copiado: péguelo en Excel.");
    } catch {
      onAviso("No se pudo copiar desde este navegador. Use «Descargar CSV».");
    }
  };
  const bajar = () => {
    descargar(new Blob([aCsv(exportable())], { type: "text/csv;charset=utf-8" }), `encuesta-${slug}${vista === "cifra" ? "-cifras" : ""}.csv`);
    onAviso("Descarga lista.");
  };

  return (
    <div role="tabpanel" id="en-panel-resp" aria-labelledby="en-tab-resp">
      <div className="en-tools">
        <div className="en-busca">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" />
            <path d="M12.5 12.5L16 16" />
          </svg>
          <input type="search" placeholder="Buscar en la tabla" aria-label="Buscar en la tabla" value={filtros.q} onChange={(e) => filtrar({ q: e.target.value })} />
        </div>
        <select className="en-sel" aria-label="Filtrar por tipo" value={filtros.tipo} onChange={(e) => filtrar({ tipo: e.target.value as TipoAporte | "" })}>
          <option value="">Logros y retos</option>
          <option value="logro">Logro</option>
          <option value="reto">Reto</option>
        </select>
        <select className="en-sel" aria-label="Filtrar por dependencia" value={filtros.dependencia} onChange={(e) => filtrar({ dependencia: e.target.value })}>
          <option value="">Todas las dependencias</option>
          {dependencias.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className="en-sel" aria-label="Filtrar por estado" value={filtros.estado} onChange={(e) => filtrar({ estado: e.target.value as EstadoAporte | "" })}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.texto}
            </option>
          ))}
        </select>
        <span className="en-grow" />
        <div className="en-seg" role="group" aria-label="Una fila por">
          <button type="button" aria-pressed={vista === "aporte"} onClick={() => cambiarVista("aporte")}>
            Por aporte
          </button>
          <button type="button" aria-pressed={vista === "cifra"} onClick={() => cambiarVista("cifra")}>
            Por cifra
          </button>
        </div>
        <button type="button" className="en-btn" onClick={() => void copiar()} disabled={!filas.length}>
          Copiar para Excel
        </button>
        <button type="button" className="en-btn en-btn--pri" onClick={bajar} disabled={!filas.length}>
          Descargar CSV
        </button>
      </div>

      <div className="en-malla" tabIndex={-1}>
        <table ref={tabla} className="en-grid" role="grid" aria-label="Respuestas de la encuesta" onKeyDown={alTeclear}>
          <thead>
            <tr>
              {columnas.map((c) => {
                const activa = orden.clave === c.clave;
                return (
                  <th key={c.clave} scope="col" className={c.clave === "n" ? "en-rn" : c.numerica ? "en-num" : undefined} aria-sort={activa ? (orden.sentido === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => ordenarPor(c.clave)}>
                      {c.titulo}
                      <span aria-hidden="true">{activa ? (orden.sentido === 1 ? " ▲" : " ▼") : ""}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={columnas.length} className="en-vacio">
                  {aportes.length ? "Ningún aporte coincide con los filtros." : "Aún no llega ningún aporte. Cuando alguien responda por el enlace público, aparece aquí."}
                </td>
              </tr>
            ) : (
              filas.map((f, ri) => (
                <tr key={f.clave} className={abierto === f.aporte.id ? "is-abierta" : undefined}>
                  {columnas.map((c, ci) => {
                    const props = {
                      "data-r": ri,
                      "data-c": ci,
                      tabIndex: cur[0] === ri && cur[1] === ci ? 0 : -1,
                      onFocus: () => setCur((x) => (x[0] === ri && x[1] === ci ? x : [ri, ci])),
                      onClick: (e: React.MouseEvent) => {
                        if ((e.target as HTMLElement).closest("select")) return;
                        setAbierto(abierto === f.aporte.id && c.clave !== "n" ? abierto : f.aporte.id);
                        if (c.clave === "n") setAbierto(null);
                      },
                      className: [c.clave === "n" ? "en-rn" : "", c.numerica && c.clave !== "n" ? "en-num" : "", cur[0] === ri && cur[1] === ci ? "is-cur" : ""].filter(Boolean).join(" ") || undefined,
                    };
                    return c.clave === "n" ? (
                      <th key={c.clave} scope="row" {...props}>
                        {f.n}
                      </th>
                    ) : (
                      <td key={c.clave} {...props}>
                        <Celda f={f} clave={c.clave} puedeEditar={puedeEditar} onEstado={onEstado} />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detalle && <Detalle a={detalle} onCerrar={() => setAbierto(null)} />}

      <div className="en-pie">
        <span aria-live="polite">
          {filas.length} {vista === "cifra" ? (filas.length === 1 ? "cifra" : "cifras") : filas.length === 1 ? "aporte" : "aportes"} en pantalla
        </span>
        <span>Flechas para moverse por las celdas · Enter abre el detalle · clic en el encabezado para ordenar</span>
      </div>
    </div>
  );
}

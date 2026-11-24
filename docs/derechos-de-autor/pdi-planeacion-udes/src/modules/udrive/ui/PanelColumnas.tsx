/* =============================================================================
   UDrive · el panel de columnas de una tabla.

   Cada columna tiene un tipo (texto, número, porcentaje, fecha, lista) y
   reglas (mínimo, máximo, obligatoria); el tipo revisa lo que se escribe. Las
   numéricas pueden llevar mapa de calor con tramos que la persona configura.
   Todo cambio de estructura guarda primero las filas pendientes (guardarAntes).
   ========================================================================== */

import { useEffect, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { COLORES_CALOR, TRAMOS_PORCENTAJE, describirTramos, erroresDeTramos, tramosAutomaticos } from "../lib/calor";
import { columnaNueva, MAX_COLUMNAS } from "../lib/tabla";
import { ETIQUETA_TIPO, aNumeroEs, esNumerica, numeroDe, textoNumero } from "../lib/valores";
import type { ColumnaUd, FilaUd, TipoColumna, TramoCalor } from "../tipos";

const NOMBRE_COLOR: Record<string, string> = {
  [COLORES_CALOR[0]]: "Rojo claro",
  [COLORES_CALOR[1]]: "Naranja claro",
  [COLORES_CALOR[2]]: "Amarillo claro",
  [COLORES_CALOR[3]]: "Verde claro",
  [COLORES_CALOR[4]]: "Verde",
};

export interface CambioColumnas {
  /** Cambia una columna (y, si cambió el tipo, vuelve a leer sus valores). */
  cambiar: (clave: string, cambios: Partial<ColumnaUd>) => Promise<void>;
  agregar: (columna: ColumnaUd) => Promise<void>;
  quitar: (clave: string) => Promise<void>;
  mover: (clave: string, delta: -1 | 1) => Promise<void>;
}

export function PanelColumnas({ columnas, filas, editable, cambios, guardarAntes }: { columnas: ColumnaUd[]; filas: FilaUd[]; editable: boolean; cambios: CambioColumnas; guardarAntes: () => Promise<boolean> }) {
  const [clave, setClave] = useState<string | null>(columnas[0]?.clave ?? null);
  const actual = columnas.find((c) => c.clave === clave) ?? columnas[0] ?? null;
  const [quitando, setQuitando] = useState(false);
  useEffect(() => setQuitando(false), [clave]);

  const aplicar = async (fn: () => Promise<void>) => {
    if (!(await guardarAntes())) return;
    await fn();
  };

  return (
    <>
      <div>
        <h3>Columnas</h3>
        <p className="es-sub">Cada columna tiene un tipo y reglas; el tipo revisa lo que se escribe.</p>
      </div>
      <div className="ud-columnas" role="list">
        {columnas.map((c, i) => (
          <button key={c.clave} type="button" role="listitem" className="ud-col" aria-current={actual?.clave === c.clave} onClick={() => setClave(c.clave)}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.etiqueta}</span>
            <small>{ETIQUETA_TIPO[c.tipo]}</small>
            {editable ? (
              <span style={{ display: "inline-flex", gap: 2 }}>
                <span
                  role="button"
                  tabIndex={0}
                  className="es-mini"
                  aria-label={`Subir «${c.etiqueta}»`}
                  aria-disabled={i === 0}
                  onClick={(e) => { e.stopPropagation(); if (i > 0) void aplicar(() => cambios.mover(c.clave, -1)); }}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && i > 0) { e.preventDefault(); e.stopPropagation(); void aplicar(() => cambios.mover(c.clave, -1)); } }}
                >
                  <Icon name="chevron-down" size={14} style={{ transform: "rotate(180deg)" }} />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="es-mini"
                  aria-label={`Bajar «${c.etiqueta}»`}
                  aria-disabled={i === columnas.length - 1}
                  onClick={(e) => { e.stopPropagation(); if (i < columnas.length - 1) void aplicar(() => cambios.mover(c.clave, 1)); }}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && i < columnas.length - 1) { e.preventDefault(); e.stopPropagation(); void aplicar(() => cambios.mover(c.clave, 1)); } }}
                >
                  <Icon name="chevron-down" size={14} />
                </span>
              </span>
            ) : <span />}
          </button>
        ))}
      </div>
      {editable ? (
        <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} disabled={columnas.length >= MAX_COLUMNAS} onClick={() => void aplicar(async () => { const c = columnaNueva(`Columna ${columnas.length + 1}`, columnas.map((x) => x.clave)); await cambios.agregar(c); setClave(c.clave); })}>
          <Icon name="plus" size={16} />Agregar columna
        </button>
      ) : null}

      {actual ? <EditarColumna key={actual.clave} columna={actual} filas={filas} editable={editable} onCambiar={(c) => void aplicar(() => cambios.cambiar(actual.clave, c))} /> : null}

      {actual && editable ? (
        quitando ? (
          <div className="es-act">
            <button type="button" className="es-btn es-btn--sm" onClick={() => void aplicar(async () => { await cambios.quitar(actual.clave); setClave(null); })}>Sí, quitar «{actual.etiqueta}» y sus datos</button>
            <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => setQuitando(false)}>No</button>
          </div>
        ) : (
          <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} disabled={columnas.length <= 1} onClick={() => setQuitando(true)}>
            <Icon name="trash" size={16} />Quitar esta columna
          </button>
        )
      ) : null}
    </>
  );
}

function EditarColumna({ columna: c, filas, editable, onCambiar }: { columna: ColumnaUd; filas: FilaUd[]; editable: boolean; onCambiar: (c: Partial<ColumnaUd>) => void }) {
  const [etiqueta, setEtiqueta] = useState(c.etiqueta);
  const [min, setMin] = useState(c.min === null ? "" : textoNumero(c.min));
  const [max, setMax] = useState(c.max === null ? "" : textoNumero(c.max));
  const [opciones, setOpciones] = useState(c.opciones.join("\n"));
  const numerica = esNumerica(c);
  const numeros = () => filas.map((f) => numeroDe(f.datos[c.clave])).filter((n): n is number => n !== null);
  const errorMin = min.trim() && aNumeroEs(min) === null ? "Escriba un número" : "";
  const errorMax = max.trim() && aNumeroEs(max) === null ? "Escriba un número" : "";
  return (
    <div className="es-stage" style={{ borderTop: "1px solid var(--es-line)", paddingTop: 12 }}>
      <h3>{c.etiqueta}</h3>
      <label className="es-fl">
        Nombre
        <input type="text" className="es-inp" value={etiqueta} disabled={!editable} maxLength={120} onChange={(e) => setEtiqueta(e.target.value)} onBlur={() => etiqueta.trim() && etiqueta.trim() !== c.etiqueta ? onCambiar({ etiqueta: etiqueta.trim() }) : setEtiqueta(c.etiqueta)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </label>
      <label className="es-fl">
        Tipo
        <select className="es-inp" value={c.tipo} disabled={!editable} onChange={(e) => onCambiar({ tipo: e.target.value as TipoColumna, ...(e.target.value !== "lista" ? {} : { opciones: c.opciones }) })}>
          {(Object.keys(ETIQUETA_TIPO) as TipoColumna[]).map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
        </select>
      </label>
      {numerica ? (
        <div className="es-fila" style={{ gap: 8 }}>
          <label className="es-fl" style={{ flex: 1 }}>
            Mínimo
            <input type="text" inputMode="decimal" className="es-inp" value={min} disabled={!editable} placeholder={c.tipo === "porcentaje" ? "0" : "sin mínimo"} aria-invalid={Boolean(errorMin)} onChange={(e) => setMin(e.target.value)} onBlur={() => !errorMin && onCambiar({ min: min.trim() ? aNumeroEs(min) : null })} />
          </label>
          <label className="es-fl" style={{ flex: 1 }}>
            Máximo
            <input type="text" inputMode="decimal" className="es-inp" value={max} disabled={!editable} placeholder={c.tipo === "porcentaje" ? "100" : "sin máximo"} aria-invalid={Boolean(errorMax)} onChange={(e) => setMax(e.target.value)} onBlur={() => !errorMax && onCambiar({ max: max.trim() ? aNumeroEs(max) : null })} />
          </label>
        </div>
      ) : null}
      {errorMin || errorMax ? <p className="ud-aviso" data-t="error" role="alert">{errorMin || errorMax}</p> : null}
      {c.tipo === "lista" ? (
        <label className="es-fl">
          Opciones (una por línea)
          <textarea className="es-inp" value={opciones} disabled={!editable} rows={4} onChange={(e) => setOpciones(e.target.value)} onBlur={() => { const o = [...new Set(opciones.split("\n").map((x) => x.trim()).filter(Boolean))]; if (o.join("|") !== c.opciones.join("|")) onCambiar({ opciones: o }); }} />
        </label>
      ) : null}
      <label className="es-ck">
        <input type="checkbox" checked={c.obligatorio} disabled={!editable} onChange={(e) => onCambiar({ obligatorio: e.target.checked })} /> Obligatoria
      </label>

      {numerica ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
          <legend className="es-fl" style={{ marginBottom: 4 }}>Mapa de calor de la columna</legend>
          <label className="es-ck">
            <input type="checkbox" checked={Boolean(c.calor)} disabled={!editable} onChange={(e) => onCambiar({ calor: e.target.checked ? (c.tipo === "porcentaje" ? TRAMOS_PORCENTAJE : tramosAutomaticos(numeros())) : null })} /> Colorear los valores por tramos
          </label>
          {c.calor ? (
            <Tramos tramos={c.calor} editable={editable} onCambiar={(t) => onCambiar({ calor: t })} calcular={() => onCambiar({ calor: tramosAutomaticos(numeros()) })} />
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}

function Tramos({ tramos, editable, onCambiar, calcular }: { tramos: TramoCalor[]; editable: boolean; onCambiar: (t: TramoCalor[]) => void; calcular: () => void }) {
  const [borrador, setBorrador] = useState(tramos.map((t) => (t.hasta === null ? "" : textoNumero(t.hasta))));
  useEffect(() => setBorrador(tramos.map((t) => (t.hasta === null ? "" : textoNumero(t.hasta)))), [tramos]);
  const candidato = tramos.map((t, i) => (t.hasta === null ? t : { ...t, hasta: aNumeroEs(borrador[i]) ?? NaN }));
  const error = candidato.some((t) => t.hasta !== null && Number.isNaN(t.hasta)) ? "Escriba números en los límites." : erroresDeTramos(candidato);
  const confirmar = () => !error && JSON.stringify(candidato) !== JSON.stringify(tramos) && onCambiar(candidato);
  return (
    <>
      <p className="es-note">Los tramos son {describirTramos(tramos)}.</p>
      {tramos.map((t, i) => (
        <div key={i} className="ud-tramo">
          <label className="es-fl">
            {t.hasta === null ? "El resto" : `Tramo ${i + 1}: hasta`}
            <input type="text" inputMode="decimal" className="es-inp" value={t.hasta === null ? "más de lo anterior" : borrador[i]} disabled={!editable || t.hasta === null} aria-invalid={t.hasta !== null && Boolean(error)} onChange={(e) => setBorrador(borrador.map((b, k) => (k === i ? e.target.value : b)))} onBlur={confirmar} />
          </label>
          <label className="es-fl">
            <span><i style={{ background: t.color }} aria-hidden="true" />Color</span>
            <select className="es-inp" value={t.color} disabled={!editable} onChange={(e) => onCambiar(tramos.map((x, k) => (k === i ? { ...x, color: e.target.value } : x)))}>
              {COLORES_CALOR.map((k) => <option key={k} value={k}>{NOMBRE_COLOR[k]}</option>)}
            </select>
          </label>
        </div>
      ))}
      {error ? <p className="ud-aviso" data-t="error" role="alert">{error}</p> : null}
      {editable ? <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} onClick={calcular}>Calcular los tramos con los datos</button> : null}
    </>
  );
}

/** Para el pie del editor: la nota de cómo se lee el mapa de calor. */
export function LeyendaCalor({ columnas }: { columnas: ColumnaUd[] }) {
  const con = columnas.filter((c) => c.calor);
  if (!con.length) return null;
  return (
    <div className="ud-leyenda-calor">
      {con.map((c) => (
        <span key={c.clave}>
          <b>{c.etiqueta}:</b> {c.calor!.map((t, i) => <span key={i} style={{ marginLeft: 6 }}><i style={{ background: t.color }} aria-hidden="true" />{i === 0 ? `<${t.hasta !== null ? textoNumero(t.hasta) : ""}` : t.hasta === null ? "más" : `<${textoNumero(t.hasta)}`}</span>)}
        </span>
      ))}
    </div>
  );
}

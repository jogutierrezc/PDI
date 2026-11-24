/* =============================================================================
   UDrive · las piezas del constructor de gráficas.

   Las usan el editor de gráficas (una tabla) y el de cruce (el resultado de
   unir dos): el selector de tipo, el panel de datos (eje horizontal y series),
   el panel de estilo (título, ejes, rango, tendencia, rótulos, nota) y la caja
   con la figura. Los colores salen de la paleta institucional: no hay selector
   de colores libres.
   ========================================================================== */

import { CATALOGO, PALETA, cambiarTipo, esCombinada, fichaDe } from "../lib/graficas";
import { esNumerica, aNumeroEs, textoNumero } from "../lib/valores";
import type { ConfigGrafica, SerieGrafica, TablaDatos, TipoGrafica } from "../tipos";
import { GraficaVista } from "./GraficaVista";
import { PanelAgrupacion } from "./PanelAgrupacion";
import { Icon } from "../../../components/ui/Icon";
import { useEffect, useState } from "react";

const NOMBRE_COLOR = ["Azul", "Verde azulado", "Azul marino", "Ocre", "Morado", "Verde", "Rojo", "Gris"];

export function SelectorTipo({ config, tabla, editable, onChange }: { config: ConfigGrafica; tabla: TablaDatos; editable: boolean; onChange: (c: ConfigGrafica) => void }) {
  return (
    <div className="es-chips" role="group" aria-label="Tipo de gráfica" style={{ justifyContent: "center", flexWrap: "wrap" }}>
      {CATALOGO.map((f) => (
        <button key={f.id} type="button" className="es-chip" aria-pressed={config.tipo === f.id} disabled={!editable} onClick={() => onChange(cambiarTipo(config, f.id, tabla))}>
          {f.nombre}
        </button>
      ))}
    </div>
  );
}

export function PanelDatos({ tabla, config, editable, onChange }: { tabla: TablaDatos; config: ConfigGrafica; editable: boolean; onChange: (c: ConfigGrafica) => void }) {
  const xy = config.tipo === "dispersion" || config.tipo === "burbujas";
  const ficha = fichaDe(config.tipo);
  const numericas = tabla.columnas.filter(esNumerica);
  const libres = numericas.filter((c) => !config.series.some((s) => s.clave === c.clave) && c.clave !== config.x && c.clave !== config.tamano);
  const etiqueta = (k: string) => tabla.columnas.find((c) => c.clave === k)?.etiqueta ?? k;
  const poner = (c: Partial<ConfigGrafica>) => onChange({ ...config, ...c });
  const cambiarSerie = (i: number, s: Partial<SerieGrafica>) => poner({ series: config.series.map((x, k) => (k === i ? { ...x, ...s } : x)) });
  const usadas = new Set(config.series.map((s) => s.color));
  const siguienteColor = () => PALETA.findIndex((_, i) => !usadas.has(i));
  return (
    <>
      <div>
        <h3>Qué se dibuja</h3>
        <p className="ud-sub">Los valores siempre son los de la tabla.</p>
      </div>
      <label className="es-fl">
        {xy ? "Eje horizontal (números)" : config.tipo === "calor" ? "Columnas del mapa" : config.tipo === "torta" || config.tipo === "dona" ? "Categorías" : "Eje horizontal"}
        <select className="es-inp" value={config.x} disabled={!editable} onChange={(e) => poner({ x: e.target.value, ejeX: etiqueta(e.target.value) })}>
          <option value="">Elija una columna</option>
          {(xy ? numericas : tabla.columnas).map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
        </select>
      </label>
      {config.tipo === "calor" ? (
        <label className="es-fl">
          Filas del mapa
          <select className="es-inp" value={config.filaCalor ?? ""} disabled={!editable} onChange={(e) => poner({ filaCalor: e.target.value || null, ejeY: etiqueta(e.target.value) })}>
            <option value="">Elija una columna</option>
            {tabla.columnas.filter((c) => c.clave !== config.x && !esNumerica(c)).map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
          </select>
        </label>
      ) : null}
      <div className="es-fl" id="ud-lbl-series">{xy ? "Eje vertical (números)" : config.tipo === "calor" ? "Valor de cada celda" : "Series (eje vertical)"}</div>
      <div style={{ display: "grid", gap: 8 }} aria-labelledby="ud-lbl-series">
        {config.series.map((s, i) => (
          <div key={`${s.clave}-${i}`} style={{ display: "grid", gap: 6 }}>
            <div className="ud-serie">
              <i style={{ background: PALETA[s.color % PALETA.length] }} aria-hidden="true" />
              <select className="es-inp" aria-label={`Columna de la serie ${i + 1}`} value={s.clave} disabled={!editable} onChange={(e) => cambiarSerie(i, { clave: e.target.value })}>
                {numericas.filter((c) => c.clave === s.clave || !config.series.some((x) => x.clave === c.clave)).map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
              </select>
              {editable && config.series.length > 1 ? (
                <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => poner({ series: config.series.filter((_, k) => k !== i) })} aria-label={`Quitar la serie ${etiqueta(s.clave)}`}>Quitar</button>
              ) : <span />}
            </div>
            {esCombinada(config.tipo) ? (
              <small className="es-note">{i === 0 ? (config.tipo === "barras-linea" ? "Barras, eje izquierdo" : "Línea, eje izquierdo") : (config.tipo === "barras-linea" ? "Línea, eje derecho" : "Línea, eje derecho")}</small>
            ) : null}
            <div className="ud-paleta" role="group" aria-label={`Color de ${etiqueta(s.clave)}`}>
              {PALETA.map((hex, k) => (
                <button key={hex} type="button" style={{ background: hex }} aria-label={NOMBRE_COLOR[k]} aria-pressed={s.color === k} disabled={!editable} onClick={() => cambiarSerie(i, { color: k })} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {editable && !xy && config.tipo !== "calor" && config.series.length < ficha.maxSeries && libres.length ? (
        <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} onClick={() => poner({ series: [...config.series, { clave: libres[0].clave, color: Math.max(0, siguienteColor()), eje: esCombinada(config.tipo) ? "derecho" : "izquierdo" }] })}>
          <Icon name="plus" size={16} />Agregar una serie
        </button>
      ) : null}
      {config.tipo === "burbujas" ? (
        <label className="es-fl">
          Tamaño de las burbujas
          <select className="es-inp" value={config.tamano ?? ""} disabled={!editable} onChange={(e) => poner({ tamano: e.target.value || null })}>
            <option value="">Elija una columna</option>
            {numericas.filter((c) => c.clave !== config.x && !config.series.some((s) => s.clave === c.clave)).map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
          </select>
        </label>
      ) : null}
      <PanelAgrupacion tabla={tabla} config={config} editable={editable} onChange={onChange} />
    </>
  );
}

function CampoNumero({ etiqueta, valor, deshabilitado, onCambiar }: { etiqueta: string; valor: number | null; deshabilitado: boolean; onCambiar: (n: number | null) => void }) {
  const [t, setT] = useState(valor === null ? "" : textoNumero(valor));
  useEffect(() => setT(valor === null ? "" : textoNumero(valor)), [valor]);
  const malo = t.trim() !== "" && aNumeroEs(t) === null;
  return (
    <label className="es-fl">
      {etiqueta}
      <input type="text" inputMode="decimal" className="es-inp" value={t} disabled={deshabilitado} placeholder="Automático" aria-invalid={malo} onChange={(e) => setT(e.target.value)} onBlur={() => !malo && onCambiar(t.trim() ? aNumeroEs(t) : null)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
    </label>
  );
}

export function PanelEstilo({ config, editable, onChange }: { config: ConfigGrafica; editable: boolean; onChange: (c: ConfigGrafica) => void }) {
  const poner = (c: Partial<ConfigGrafica>) => onChange({ ...config, ...c });
  const cartesiana = !["torta", "dona", "calor"].includes(config.tipo);
  const conRotulos = ["linea", "barras", "barras-linea", "dos-lineas"].includes(config.tipo);
  return (
    <>
      <div>
        <h3>Cómo se ve</h3>
        <p className="ud-sub">Los colores salen de la paleta institucional.</p>
      </div>
      <label className="es-fl">
        Título de la figura
        <input type="text" className="es-inp" value={config.titulo} disabled={!editable} maxLength={300} onChange={(e) => poner({ titulo: e.target.value })} />
      </label>
      {cartesiana ? (
        <div className="es-fila" style={{ gap: 8 }}>
          <label className="es-fl" style={{ flex: 1 }}>Eje vertical<input type="text" className="es-inp" value={config.ejeY} disabled={!editable} maxLength={120} onChange={(e) => poner({ ejeY: e.target.value })} /></label>
          <label className="es-fl" style={{ flex: 1 }}>Eje horizontal<input type="text" className="es-inp" value={config.ejeX} disabled={!editable} maxLength={120} onChange={(e) => poner({ ejeX: e.target.value })} /></label>
        </div>
      ) : null}
      {esCombinada(config.tipo) ? <label className="es-fl">Eje derecho<input type="text" className="es-inp" value={config.ejeY2} disabled={!editable} maxLength={120} onChange={(e) => poner({ ejeY2: e.target.value })} /></label> : null}
      {cartesiana || config.tipo === "calor" ? (
        <div className="es-fila" style={{ gap: 8 }}>
          <CampoNumero etiqueta={config.tipo === "calor" ? "Valor más claro" : "Mínimo"} valor={config.min} deshabilitado={!editable} onCambiar={(n) => poner({ min: n })} />
          <CampoNumero etiqueta={config.tipo === "calor" ? "Valor más oscuro" : "Máximo"} valor={config.max} deshabilitado={!editable} onCambiar={(n) => poner({ max: n })} />
        </div>
      ) : null}
      {config.tipo === "linea" ? (
        <label className="es-ck"><input type="checkbox" checked={config.tendencia} disabled={!editable} onChange={(e) => poner({ tendencia: e.target.checked })} /> Línea de tendencia</label>
      ) : null}
      {conRotulos ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}>
          <legend className="es-fl">Rótulos de valores</legend>
          {([["ninguno", "Sin rótulos"], ["ultimo", "Rotular el último valor"], ["todos", "Rotular todos los valores"]] as const).map(([v, t]) => (
            <label key={v} className="es-ck"><input type="radio" name="ud-rotular" checked={config.rotular === v} disabled={!editable} onChange={() => poner({ rotular: v })} /> {t}</label>
          ))}
        </fieldset>
      ) : null}
      <label className="es-fl">
        Nota o fuente
        <input type="text" className="es-inp" value={config.nota} disabled={!editable} maxLength={500} onChange={(e) => poner({ nota: e.target.value })} />
      </label>
      <p className="es-note">El número («Gráfica 3.») y el pie se numeran solos al insertarla en un informe.</p>
    </>
  );
}

export function CajaGrafica({ tabla, config }: { tabla: TablaDatos | null; config: ConfigGrafica }) {
  return (
    <figure className="ud-cajagrafica" style={{ margin: 0 }}>
      <figcaption className="ud-titulo-fig">{config.titulo.trim() ? <><b>Gráfica.</b> <i>{config.titulo}</i></> : <i>Sin título</i>}</figcaption>
      {tabla ? <GraficaVista tabla={tabla} config={config} /> : <p className="ud-vacio">Elija la tabla de donde salen los datos.</p>}
      {config.nota.trim() ? <p className="ud-pie-fig"><b>Nota.</b> {config.nota}</p> : null}
    </figure>
  );
}

export const TIPOS_DE_CRUCE: TipoGrafica[] = ["barras-linea", "dos-lineas"];

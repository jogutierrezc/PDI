/* =============================================================================
   UDrive · agrupar nombres repetidos y filtrar por fecha en el editor de gráficas.

   Va dentro del panel «Datos» (ConstructorGrafica.tsx). Tres cosas: cómo se
   combinan las filas que repiten el mismo nombre en el eje, qué filas entran
   según su fecha (con atajos, rango o «últimos») y cómo se agrupan las fechas
   del eje. La lógica es la de lib/agrupar.ts: aquí solo se eligen las opciones.
   ========================================================================== */

import { useEffect, useState } from "react";
import { AGRUPACIONES_FECHA, PRESETS_FILTRO, agregacionSugerida, columnasDeFiltro, hayAgrupacion, presetActivo, resumenFiltro, rotulosRepetidos } from "../lib/agrupar";
import type { Agregacion, AgruparFecha, ConfigGrafica, FiltroFecha, TablaDatos } from "../tipos";

const OPCIONES_AGREGACION: { id: Exclude<Agregacion, "ninguno">; nombre: string; ejemplo: string }[] = [
  { id: "suma", nombre: "Sumar los valores", ejemplo: "dos filas «Bogotá» con 10 y 30 dan 40" },
  { id: "promedio", nombre: "Promediar", ejemplo: "dos filas «Bogotá» con 10 y 30 dan 20" },
  { id: "conteo", nombre: "Contar filas", ejemplo: "dos filas «Bogotá» dan 2 (solo cuentan las que tienen dato)" },
  { id: "minimo", nombre: "Quedarse con el menor", ejemplo: "con 10 y 30 queda 10" },
  { id: "maximo", nombre: "Quedarse con el mayor", ejemplo: "con 10 y 30 queda 30" },
  { id: "ultimo", nombre: "Quedarse con el último", ejemplo: "queda el valor de la fecha más reciente (o de la última fila si no hay fecha)" },
];

const NOMBRE_FECHA: Record<AgruparFecha, string> = {
  ninguno: "Sin agrupar (cada fecha por separado)",
  dia: "Por día",
  mes: "Por mes",
  trimestre: "Por trimestre",
  anio: "Por año",
};

const UNIDADES = [
  ["dias", "días"],
  ["meses", "meses"],
  ["anios", "años"],
] as const;

/** Un campo de texto que confirma al salir o con Enter (no filtra mientras se teclea). */
function CampoConfirmado({ etiqueta, valor, deshabilitado, onCambiar, ayuda }: { etiqueta: string; valor: string; deshabilitado: boolean; onCambiar: (v: string) => void; ayuda?: string }) {
  const [t, setT] = useState(valor);
  useEffect(() => setT(valor), [valor]);
  return (
    <label className="es-fl" style={{ flex: 1 }}>
      {etiqueta}
      <input type="text" inputMode="numeric" className="es-inp" value={t} disabled={deshabilitado} placeholder={ayuda} onChange={(e) => setT(e.target.value)} onBlur={() => t !== valor && onCambiar(t.trim())} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
    </label>
  );
}

export function PanelAgrupacion({ tabla, config, editable, onChange }: { tabla: TablaDatos; config: ConfigGrafica; editable: boolean; onChange: (c: ConfigGrafica) => void }) {
  const xy = config.tipo === "dispersion" || config.tipo === "burbujas";
  const poner = (c: Partial<ConfigGrafica>) => onChange({ ...config, ...c });
  const colX = tabla.columnas.find((c) => c.clave === config.x);
  const colSerie = tabla.columnas.find((c) => c.clave === config.series[0]?.clave);
  const sugerida = agregacionSugerida(colSerie);
  const agrupa = hayAgrupacion(tabla, config);
  const repetidos = xy || config.tipo === "calor" ? 0 : rotulosRepetidos(tabla, config);
  const global = config.agrupar ?? "ninguno";
  const ejemplo = OPCIONES_AGREGACION.find((o) => o.id === global)?.ejemplo;

  const f = config.filtroFecha ?? null;
  const columnasFiltro = columnasDeFiltro(tabla.columnas);
  const colFiltro = f ? tabla.columnas.find((c) => c.clave === f.columna) : undefined;
  const esFecha = colFiltro?.tipo === "fecha";
  const resumen = resumenFiltro(tabla, config);
  const ponerFiltro = (cambio: Partial<FiltroFecha>) => f && poner({ filtroFecha: { ...f, ...cambio } });
  const activoPreset = f ? presetActivo(f) : null;

  const elegirAgrupar = (v: Agregacion) =>
    // «No agrupar» también quita lo que se hubiera elegido serie por serie.
    poner(v === "ninguno" ? { agrupar: "ninguno", agruparFecha: "ninguno", series: config.series.map(({ agrupar: _a, ...s }) => s) } : { agrupar: v });

  return (
    <>
      <div style={{ marginTop: 6 }}>
        <h3>Agrupar y filtrar</h3>
        <p className="ud-sub">Qué hacer con los nombres repetidos y con las fechas.</p>
      </div>

      {!xy ? (
        <>
          {repetidos > 0 && !agrupa ? (
            <p className="ud-aviso" data-t="aviso" role="status" style={{ display: "grid", gap: 6 }}>
              <span>Hay {repetidos} {repetidos === 1 ? "rótulo repetido" : "rótulos repetidos"} en el eje: agrúpelos.</span>
              {editable ? (
                <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} onClick={() => poner({ agrupar: sugerida })}>
                  Agrupar ({OPCIONES_AGREGACION.find((o) => o.id === sugerida)?.nombre.toLowerCase() ?? sugerida})
                </button>
              ) : null}
            </p>
          ) : null}
          <label className="es-fl">
            Agrupar nombres repetidos
            <select className="es-inp" value={global} disabled={!editable} onChange={(e) => elegirAgrupar(e.target.value as Agregacion)}>
              {OPCIONES_AGREGACION.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              <option value="ninguno">No agrupar (una barra por fila)</option>
            </select>
          </label>
          <small className="es-note">{global === "ninguno" ? "Cada fila se dibuja aparte; los nombres repetidos se distinguen con (2), (3)…" : `Ejemplo: ${ejemplo}.`}</small>
          {config.series.length > 1 && global !== "ninguno" ? (
            <div style={{ display: "grid", gap: 6 }}>
              {config.series.map((s, i) => {
                const nombre = tabla.columnas.find((c) => c.clave === s.clave)?.etiqueta ?? s.clave;
                return (
                  <label key={`${s.clave}-${i}`} className="es-fl">
                    Para «{nombre}»
                    <select
                      className="es-inp"
                      value={s.agrupar && s.agrupar !== "ninguno" ? s.agrupar : ""}
                      disabled={!editable}
                      onChange={(e) => poner({ series: config.series.map((x, k) => (k === i ? (({ agrupar: _a, ...resto }) => (e.target.value ? { ...resto, agrupar: e.target.value as Agregacion } : resto))(x) : x)) })}
                    >
                      <option value="">Igual que las demás</option>
                      {OPCIONES_AGREGACION.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </label>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}

      <label className="es-fl">
        Filtrar por fecha
        <select
          className="es-inp"
          value={f?.columna ?? ""}
          disabled={!editable || !columnasFiltro.length}
          onChange={(e) => poner(e.target.value ? { filtroFecha: { ...(f ?? PRESETS_FILTRO[0].filtro(e.target.value)), columna: e.target.value, desde: null, hasta: null } } : { filtroFecha: null, filtroInteractivo: false })}
        >
          <option value="">Sin filtro (todas las filas)</option>
          {f && !colFiltro ? <option value={f.columna}>(una columna que ya no existe)</option> : null}
          {columnasFiltro.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}{c.tipo === "numero" ? " (años o periodos)" : ""}</option>)}
        </select>
      </label>
      {!columnasFiltro.length ? <small className="es-note">La tabla no tiene una columna de fecha ni de años para filtrar.</small> : null}

      {f && colFiltro ? (
        <>
          <div className="es-chips" role="group" aria-label="Qué fechas entran">
            {PRESETS_FILTRO.map((p) => (
              <button key={p.id} type="button" className="es-chip" aria-pressed={activoPreset === p.id} disabled={!editable} onClick={() => poner({ filtroFecha: p.filtro(f.columna) })}>
                {p.nombre}
              </button>
            ))}
            <button type="button" className="es-chip" aria-pressed={f.modo === "rango"} disabled={!editable} onClick={() => ponerFiltro({ modo: "rango" })}>
              Rango
            </button>
            <button type="button" className="es-chip" aria-pressed={f.modo === "ultimos" && activoPreset === null} disabled={!editable} onClick={() => ponerFiltro({ modo: "ultimos", n: f.modo === "ultimos" ? f.n : esFecha ? 6 : 3, unidad: esFecha ? "meses" : "anios" })}>
              Últimos…
            </button>
          </div>
          {f.modo === "rango" ? (
            <div className="es-fila" style={{ gap: 8 }}>
              {esFecha ? (
                <>
                  <label className="es-fl" style={{ flex: 1 }}>Desde<input type="date" className="es-inp" value={f.desde ?? ""} max={f.hasta ?? undefined} disabled={!editable} onChange={(e) => ponerFiltro({ desde: e.target.value || null })} /></label>
                  <label className="es-fl" style={{ flex: 1 }}>Hasta<input type="date" className="es-inp" value={f.hasta ?? ""} min={f.desde ?? undefined} disabled={!editable} onChange={(e) => ponerFiltro({ hasta: e.target.value || null })} /></label>
                </>
              ) : (
                <>
                  <CampoConfirmado etiqueta="Desde" valor={f.desde ?? ""} deshabilitado={!editable} ayuda="Primero" onCambiar={(v) => ponerFiltro({ desde: v || null })} />
                  <CampoConfirmado etiqueta="Hasta" valor={f.hasta ?? ""} deshabilitado={!editable} ayuda="Último" onCambiar={(v) => ponerFiltro({ hasta: v || null })} />
                </>
              )}
            </div>
          ) : null}
          {f.modo === "ultimos" ? (
            <div className="es-fila" style={{ gap: 8 }}>
              <label className="es-fl" style={{ flex: 1 }}>
                Cuántos
                <input type="number" min={1} max={9999} className="es-inp" value={f.n} disabled={!editable} onChange={(e) => ponerFiltro({ n: Math.min(9999, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })} />
              </label>
              {esFecha ? (
                <label className="es-fl" style={{ flex: 1 }}>
                  Unidad
                  <select className="es-inp" value={f.unidad} disabled={!editable} onChange={(e) => ponerFiltro({ unidad: e.target.value as FiltroFecha["unidad"] })}>
                    {UNIDADES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </label>
              ) : <span className="es-note" style={{ alignSelf: "end" }}>periodos</span>}
            </div>
          ) : null}
          <p className="es-note" role="status" aria-live="polite">
            Mostrando {resumen.quedan} de {resumen.total} filas
            {resumen.activo && resumen.desde ? ` · del ${resumen.desde} al ${resumen.hasta}` : ""}
            {resumen.referencia ? ` (contado desde el dato más reciente, ${resumen.referencia})` : ""}.
          </p>
          {resumen.activo && resumen.quedan === 0 ? <p className="ud-aviso" data-t="error" role="alert">El filtro no deja ninguna fila: amplíe el rango.</p> : null}
          {f.modo !== "todo" && f.modo !== "rango" ? <small className="es-note">Se mide desde el dato más reciente de la tabla: si la tabla crece, la gráfica se actualiza sola.</small> : null}
          {f.modo === "rango" && !f.desde && !f.hasta ? <small className="es-note">Escriba al menos un extremo para filtrar.</small> : null}
          <label className="es-ck">
            <input type="checkbox" checked={config.filtroInteractivo === true} disabled={!editable} onChange={(e) => poner({ filtroInteractivo: e.target.checked })} />
            En el portal, dejar cambiar los {esFecha ? "años" : "periodos"}
          </label>
        </>
      ) : null}
      {f && !colFiltro ? <p className="ud-aviso" data-t="aviso" role="status">La columna del filtro ya no existe en la tabla: el filtro no se aplica. Elija otra o quite el filtro.</p> : null}

      {!xy && colX?.tipo === "fecha" ? (
        <>
          <label className="es-fl">
            Agrupar fechas por
            <select className="es-inp" value={config.agruparFecha ?? "ninguno"} disabled={!editable} onChange={(e) => poner({ agruparFecha: e.target.value as AgruparFecha, ...(e.target.value !== "ninguno" && global === "ninguno" ? { agrupar: sugerida } : {}) })}>
              {AGRUPACIONES_FECHA.map((v) => <option key={v} value={v}>{NOMBRE_FECHA[v]}</option>)}
            </select>
          </label>
          <small className="es-note">Las fechas salen en orden de calendario. Los valores de cada periodo se combinan como se eligió arriba.</small>
        </>
      ) : null}
    </>
  );
}

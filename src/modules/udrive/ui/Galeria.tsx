/* =============================================================================
   UDrive · catálogo de gráficas y tablas.

   Las tarjetas son exactamente lo que se puede construir en esta fase: nada de
   lo que no existe. Cada una dice cuándo conviene, qué datos pide y una buena
   práctica, deja ver un ejemplo con datos de muestra y se usa con una tabla de
   UDrive. «Si no sabe cuál elegir», el catálogo se organiza por la pregunta que
   quiere responder.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ventana } from "../../../components/espacio/Ventana";
import { Icon } from "../../../components/ui/Icon";
import { useArchivos, useContenido, useCrearItem } from "../datos";
import { CATALOGO, GRUPOS, configInicial, falta } from "../lib/graficas";
import { normalizarContenido, tablaVacia } from "../lib/tabla";
import { cambiarFicha } from "../motion";
import type { ConfigGrafica, ContenidoGrafica, FilaUd, TablaDatos, TipoGrafica } from "../tipos";
import { GraficaVista } from "./GraficaVista";

const fila = (i: number, datos: FilaUd["datos"]): FilaUd => ({ id: `m${i}`, datos });
const col = (clave: string, etiqueta: string, tipo: "texto" | "numero" | "porcentaje") => ({ clave, etiqueta, tipo, obligatorio: false, opciones: [], min: null, max: null, calor: null });

const PERIODOS = ["2021-1", "2021-2", "2022-1", "2022-2", "2023-1", "2023-2", "2024-1", "2024-2"];
const COLUMNAS_MUESTRA = [col("periodo", "Periodo", "texto"), col("programa", "Programa", "texto"), col("matriculados", "Matriculados", "numero"), col("desercion", "% deserción", "porcentaje"), col("costo", "Costo por estudiante", "numero")];
/** Datos de muestra para «Ver un ejemplo»: no son datos de la universidad. */
const MUESTRA_SERIE: TablaDatos = {
  columnas: COLUMNAS_MUESTRA,
  filas: PERIODOS.map((p, i) => fila(i, { periodo: p, programa: ["Ingeniería", "Derecho", "Medicina", "Enfermería"][i % 4], matriculados: [1240, 1310, 1380, 1355, 1470, 1520, 1610, 1690][i], desercion: [11.2, 10.8, 10.1, 10.4, 9.6, 9.1, 8.7, 8.2][i], costo: [3.1, 3.2, 3.2, 3.4, 3.5, 3.5, 3.7, 3.8][i] })),
};
const MUESTRA_CALOR: TablaDatos = {
  columnas: COLUMNAS_MUESTRA,
  filas: ["2022-1", "2023-1", "2024-1"].flatMap((p, i) => ["Ingeniería", "Derecho", "Medicina"].map((g, k) => fila(i * 3 + k, { periodo: p, programa: g, matriculados: 300 + i * 40 + k * 90, desercion: 6 + k * 2 + i, costo: 3 + k * 0.4 }))),
};

function Glifo({ tipo }: { tipo: TipoGrafica | "tabla" | "cruce" | "excel" }) {
  const l = { fill: "none", stroke: "#1f5fbf", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const eje = <path d="M10 62H112M10 8V62" fill="none" stroke="var(--es-line-2)" />;
  switch (tipo) {
    case "linea":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}<path d="M14 50L36 38L58 44L82 22L106 16" {...l} /><path d="M14 52L106 18" stroke="#5f7089" strokeDasharray="5 4" fill="none" /></svg>;
    case "area":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}<path d="M14 62L14 46L40 34L66 40L92 20L106 24L106 62Z" fill="#1f5fbf" opacity=".5" /><path d="M14 54L40 46L66 50L92 38L106 40L106 62L14 62Z" fill="#0b7481" opacity=".6" /></svg>;
    case "barras":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}{[[16, 30], [38, 18], [60, 38], [82, 24]].map(([x, y]) => <rect key={x} x={x} y={y} width="16" height={62 - y} fill="#1f5fbf" rx="1.5" />)}</svg>;
    case "barras-h":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}{[[12, 84], [26, 62], [40, 76], [54, 40]].map(([y, w]) => <rect key={y} x="12" y={y - 6} width={w} height="9" fill="#1f5fbf" rx="1.5" />)}</svg>;
    case "agrupadas":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}{[18, 54, 90].map((x, i) => <g key={x}><rect x={x} y={34 - i * 4} width="9" height={28 + i * 4} fill="#1f5fbf" /><rect x={x + 10} y={22 + i * 6} width="9" height={40 - i * 6} fill="#0b7481" /></g>)}</svg>;
    case "apiladas":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}{[16, 44, 72].map((x, i) => <g key={x}><rect x={x} y={34 - i * 5} width="20" height={28 + i * 5} fill="#1f5fbf" /><rect x={x} y={14 - i * 2} width="20" height={20 - i * 3} fill="#b67a0c" /></g>)}</svg>;
    case "torta":
    case "dona":
      return <svg viewBox="0 0 120 70" aria-hidden="true"><circle cx="60" cy="35" r="26" fill="#1f5fbf" /><path d="M60 35L60 9A26 26 0 0 1 84 46Z" fill="#b67a0c" /><path d="M60 35L84 46A26 26 0 0 1 40 56Z" fill="#0b7481" />{tipo === "dona" ? <circle cx="60" cy="35" r="13" fill="var(--es-panel-2)" /> : null}</svg>;
    case "dispersion":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}{[[20, 52], [34, 44], [48, 40], [60, 30], [72, 32], [88, 20], [100, 14]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.6" fill="#1f5fbf" />)}</svg>;
    case "burbujas":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}{[[28, 46, 6], [50, 34, 11], [76, 40, 8], [96, 18, 13]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill="#1f5fbf" opacity=".6" />)}</svg>;
    case "calor":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => <rect key={`${r}${c}`} x={12 + c * 20} y={8 + r * 14} width="18" height="12" fill="#0a2d63" opacity={0.15 + ((r * 3 + c * 5) % 9) / 11} />))}</svg>;
    case "barras-linea":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}{[16, 38, 60, 82].map((x, i) => <rect key={x} x={x} y={36 - i * 4} width="16" height={26 + i * 4} fill="#7fb3e6" />)}<path d="M20 22L46 30L68 16L92 24" {...l} stroke="#b67a0c" /></svg>;
    case "dos-lineas":
      return <svg viewBox="0 0 120 70" aria-hidden="true">{eje}<path d="M14 46L40 40L66 28L106 14" {...l} /><path d="M14 20L40 28L66 24L106 44" {...l} stroke="#b67a0c" /></svg>;
    case "tabla":
      return <svg viewBox="0 0 120 70" aria-hidden="true"><rect x="8" y="6" width="104" height="58" rx="4" fill="var(--es-panel)" stroke="var(--es-line-2)" /><path d="M8 20H112M8 34H112M8 48H112M44 6V64M80 6V64" stroke="var(--es-line-2)" /></svg>;
    case "cruce":
      return <svg viewBox="0 0 120 70" aria-hidden="true"><rect x="8" y="12" width="40" height="46" rx="4" fill="var(--es-panel)" stroke="var(--es-line-2)" /><rect x="72" y="12" width="40" height="46" rx="4" fill="var(--es-panel)" stroke="var(--es-line-2)" /><path d="M48 35H72" stroke="#1f5fbf" strokeWidth="2.4" /></svg>;
    case "excel":
      return <svg viewBox="0 0 120 70" aria-hidden="true"><rect x="30" y="6" width="60" height="58" rx="4" fill="var(--es-panel)" stroke="var(--es-line-2)" /><path d="M42 24L62 46M62 24L42 46" stroke="#12833a" strokeWidth="3" strokeLinecap="round" /><path d="M72 22H82M72 34H82M72 46H82" stroke="var(--es-line-2)" /></svg>;
  }
}

export function Galeria({ carpeta, decir, onImportar }: { carpeta: string | null; decir: (m: string) => void; onImportar: () => void }) {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"graficas" | "tablas">("graficas");
  const [tipo, setTipo] = useState<TipoGrafica>("linea");
  const [ejemplo, setEjemplo] = useState(false);
  const [usar, setUsar] = useState<TipoGrafica | null>(null);
  const crear = useCrearItem();
  const archivos = useArchivos();
  const ficha = useRef<HTMLDivElement>(null);
  const elegida = CATALOGO.find((f) => f.id === tipo) ?? CATALOGO[0];
  const nombresLibres = useMemo(() => new Set((archivos.data ?? []).filter((a) => a.carpeta_id === carpeta && !a.borrado_en).map((a) => a.nombre.toLowerCase())), [archivos.data, carpeta]);
  const nombreLibre = (base: string) => {
    if (!nombresLibres.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) if (!nombresLibres.has(`${base} (${n})`.toLowerCase())) return `${base} (${n})`;
  };
  useEffect(() => {
    cambiarFicha(ficha.current);
  }, [tipo, modo]);

  const nuevaTabla = () =>
    crear.mutate({ tipo: "tabla", nombre: nombreLibre("Tabla sin título"), carpeta, contenido: tablaVacia(() => crypto.randomUUID()) }, { onSuccess: (id) => navigate(`/admin/udrive/tabla/${id}`), onError: (e) => decir(e.message) });
  const nuevoCruce = () =>
    crear.mutate({ tipo: "cruce", nombre: nombreLibre("Cruce de tablas"), carpeta, contenido: { version: 1, modo: "dos", tabla_a: null, tabla_b: null, columna_a: null, columna_b: null, conservar: "coinciden", resultado_id: null, grafica: null } }, { onSuccess: (id) => navigate(`/admin/udrive/cruce/${id}`), onError: (e) => decir(e.message) });

  const datosEjemplo = tipo === "calor" ? MUESTRA_CALOR : MUESTRA_SERIE;
  const configEjemplo: ConfigGrafica = { ...configInicial(tipo, datosEjemplo), titulo: "Ejemplo con datos de muestra" };

  return (
    <div className="ud-galeria">
      <div className="ud-galeria__lista">
        <div className="es-seg" role="group" aria-label="Qué buscar" style={{ justifySelf: "start", marginBottom: 8 }}>
          <button type="button" aria-pressed={modo === "graficas"} onClick={() => setModo("graficas")}>Gráficas</button>
          <button type="button" aria-pressed={modo === "tablas"} onClick={() => setModo("tablas")}>Tablas</button>
        </div>
        {modo === "graficas" ? (
          GRUPOS.map((g) => {
            const fichas = CATALOGO.filter((f) => f.grupo === g.id);
            return fichas.length ? (
              <section key={g.id} aria-label={g.nombre}>
                <h2 className="ud-seccion">{g.nombre}</h2>
                <div className="ud-tarjetas">
                  {fichas.map((f) => (
                    <button key={f.id} type="button" className="ud-tarjeta" aria-pressed={tipo === f.id} onClick={() => { setTipo(f.id); setEjemplo(false); }}>
                      <span className="ud-tarjeta__vista"><Glifo tipo={f.id} /></span>
                      <span className="ud-tarjeta__texto"><b>{f.nombre}</b><small>{f.maxSeries === 1 ? "Una serie" : "Una o más series"}</small></span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null;
          })
        ) : (
          <section aria-label="Tablas">
            <h2 className="ud-seccion">Tablas</h2>
            <div className="ud-tarjetas">
              <button type="button" className="ud-tarjeta" onClick={nuevaTabla} disabled={crear.isPending}>
                <span className="ud-tarjeta__vista"><Glifo tipo="tabla" /></span>
                <span className="ud-tarjeta__texto"><b>Tabla en blanco</b><small>Columnas con tipo y reglas; pegue desde Excel</small></span>
              </button>
              <button type="button" className="ud-tarjeta" onClick={onImportar}>
                <span className="ud-tarjeta__vista"><Glifo tipo="excel" /></span>
                <span className="ud-tarjeta__texto"><b>Desde Excel o CSV</b><small>Detecta encabezados y tipos</small></span>
              </button>
            </div>
            <h2 className="ud-seccion">Combinar</h2>
            <div className="ud-tarjetas">
              <button type="button" className="ud-tarjeta" onClick={nuevoCruce} disabled={crear.isPending}>
                <span className="ud-tarjeta__vista"><Glifo tipo="cruce" /></span>
                <span className="ud-tarjeta__texto"><b>Cruce de dos tablas</b><small>Unir por una columna y graficar</small></span>
              </button>
            </div>
          </section>
        )}
      </div>

      <aside className="ud-galeria__ficha" aria-label="Ficha" ref={ficha}>
        {modo === "graficas" ? (
          <>
            <h2>{elegida.nombre}</h2>
            <div><h3>Cuándo usarla</h3><p>{elegida.cuando}</p></div>
            <div><h3>Datos que necesita</h3><p>{elegida.necesita}</p></div>
            <div><h3>Buenas prácticas</h3><p>{elegida.buenas}</p></div>
            <div className="es-act">
              <button type="button" className="es-btn es-btn--pri" onClick={() => setUsar(tipo)}><Icon name="chart" size={16} />Usar con una tabla</button>
              <button type="button" className="es-btn" aria-pressed={ejemplo} onClick={() => setEjemplo(!ejemplo)}>{ejemplo ? "Ocultar el ejemplo" : "Ver un ejemplo"}</button>
            </div>
            {ejemplo ? (
              <div style={{ minWidth: 0 }}>
                <GraficaVista tabla={datosEjemplo} config={configEjemplo} altura={250} />
                <p className="es-note">Datos de muestra, no son de la universidad.</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <h2>Tablas y cruces</h2>
            <p>Una tabla de UDrive guarda columnas con tipo (texto, número, porcentaje, fecha, lista), reglas de mínimo, máximo y obligatoria, y valida cada celda mientras se escribe. De ella salen las gráficas.</p>
            <p>Un cruce une dos tablas por una columna que las dos tengan y le dice cuáles filas no coinciden.</p>
          </>
        )}
      </aside>
      {usar ? <UsarConTabla tipo={usar} carpeta={carpeta} nombre={nombreLibre(`${CATALOGO.find((f) => f.id === usar)?.nombre ?? "Gráfica"} sin título`)} decir={decir} onCerrar={() => setUsar(null)} /> : null}
    </div>
  );
}

function UsarConTabla({ tipo, carpeta, nombre, decir, onCerrar }: { tipo: TipoGrafica; carpeta: string | null; nombre: string; decir: (m: string) => void; onCerrar: () => void }) {
  const navigate = useNavigate();
  const archivos = useArchivos();
  const crear = useCrearItem();
  const tablas = (archivos.data ?? []).filter((a) => a.tipo === "tabla" && !a.borrado_en);
  const [id, setId] = useState("");
  const leida = useContenido(id || undefined);
  const tabla: TablaDatos | null = useMemo(() => (leida.data ? normalizarContenido(leida.data.contenido) : null), [leida.data]);
  const problema = tabla ? falta(tabla, configInicial(tipo, tabla)) : "";
  return (
    <Ventana
      titulo="Usar con una tabla"
      ancho="chica"
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="es-btn" onClick={onCerrar}>Cancelar</button>
          <button
            type="button"
            className="es-btn es-btn--pri"
            disabled={!tabla || crear.isPending}
            onClick={() => {
              if (!tabla) return;
              const contenido: ContenidoGrafica = { version: 1, tabla_id: id, config: configInicial(tipo, tabla) };
              crear.mutate({ tipo: "grafica", nombre, carpeta, contenido }, { onSuccess: (nuevo) => navigate(`/admin/udrive/grafica/${nuevo}`), onError: (e) => decir(e.message) });
            }}
          >
            Crear la gráfica
          </button>
        </>
      }
    >
      <div className="es-dbody es-dbody--solo">
        {archivos.isPending ? <p className="es-note">Buscando sus tablas…</p> : !tablas.length ? (
          <p>Todavía no tiene tablas. Cree una tabla (o impórtela desde Excel) y vuelva aquí.</p>
        ) : (
          <label className="es-fl">
            Tabla de donde salen los datos
            <select className="es-inp" data-foco value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Elija una tabla</option>
              {tablas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </label>
        )}
        {id && leida.isPending ? <p className="es-note">Leyendo la tabla…</p> : null}
        {problema ? <p className="ud-aviso" data-t="aviso">{problema} Podrá elegir las columnas en el constructor.</p> : null}
      </div>
    </Ventana>
  );
}

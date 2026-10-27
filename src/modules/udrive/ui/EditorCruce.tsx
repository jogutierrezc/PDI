/* =============================================================================
   UDrive · cruce de tablas (/admin/udrive/cruce/:id).

   Dos tablas se unen por una columna que las dos tengan (A = B); se elige si
   quedan solo las filas que coinciden o todas las de A, y se avisa de las que no
   coinciden. El resultado se puede guardar como una tabla nueva y siempre se
   puede graficar (la gráfica combinada de barras y línea, o cualquier otra).
   «Una tabla» cruza columnas de la misma tabla. Se guarda solo.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useContextoDrive } from "./contexto";
import { Aviso, useAviso } from "../../../components/espacio/piezas";
import { Icon } from "../../../components/ui/Icon";
import { useArchivos, useContenido, useCrearItem, useDuenos, useGuardarContenido, useRenombrar } from "../datos";
import { avisoDeCruce, unirTablas } from "../lib/cruce";
import type { ResultadoCruce } from "../lib/cruce";
import { configInicial, falta, normalizarConfig } from "../lib/graficas";
import { nombreUnico } from "../lib/nombres";
import { puedeEditar } from "../lib/permisos";
import { normalizarContenido, PRESENTACION_VACIA } from "../lib/tabla";
import { textoNumero } from "../lib/valores";
import type { ConfigGrafica, ContenidoCruce, ContenidoTabla, ConservarFilas, TablaDatos } from "../tipos";
import { CajaGrafica, PanelDatos, PanelEstilo, SelectorTipo } from "./ConstructorGrafica";
import { MarcoEditor, useAutoguardado } from "./MarcoEditor";
import { Estado } from "./piezas";
import "../../../components/espacio/espacio.css";
import "./udrive.css";

function leerCruce(crudo: unknown): ContenidoCruce {
  const o = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Partial<ContenidoCruce>;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    version: 1,
    modo: o.modo === "una" ? "una" : "dos",
    tabla_a: s(o.tabla_a),
    tabla_b: s(o.tabla_b),
    columna_a: s(o.columna_a),
    columna_b: s(o.columna_b),
    conservar: o.conservar === "todas_a" ? "todas_a" : "coinciden",
    grafica: normalizarConfig(o.grafica ?? { tipo: "barras-linea" }, null),
    resultado_id: s(o.resultado_id),
  };
}

const aTabla = (c: ContenidoTabla | null): TablaDatos | null => (c ? { columnas: c.columnas, filas: c.filas } : null);

export function EditorCruce({ id }: { id: string }) {
  const navigate = useNavigate();
  const { base: ruta, volver: volverA } = useContextoDrive();
  const leido = useContenido(id);
  const duenos = useDuenos([id]);
  const archivos = useArchivos();
  const guardar = useGuardarContenido();
  const renombrar = useRenombrar();
  const crear = useCrearItem();
  const { aviso, decir } = useAviso();
  const [datos, setDatos] = useState<ContenidoCruce | null>(null);
  const [estado, setEstado] = useState<"borrador" | "listo">("borrador");
  const [nombre, setNombre] = useState("");
  const cargado = useRef(false);

  useEffect(() => {
    if (!leido.data || cargado.current) return;
    cargado.current = true;
    setDatos(leerCruce(leido.data.contenido));
    setEstado(leido.data.estado);
    setNombre(leido.data.nombre);
  }, [leido.data]);

  const rol = duenos.data?.get(id)?.mi_rol;
  const editable = puedeEditar(rol);
  const { estado: guardado, vaciar } = useAutoguardado(datos, editable, (v) => guardar.mutateAsync({ id, contenido: v }));

  const lecA = useContenido(datos?.tabla_a ?? undefined);
  const lecB = useContenido(datos?.modo === "dos" ? (datos?.tabla_b ?? undefined) : undefined);
  const tablaA = useMemo(() => (lecA.data?.tipo === "tabla" ? aTabla(normalizarContenido(lecA.data.contenido)) : null), [lecA.data]);
  const tablaB = useMemo(() => (lecB.data?.tipo === "tabla" ? aTabla(normalizarContenido(lecB.data.contenido)) : null), [lecB.data]);

  const resultado = useMemo<{ cruce: ResultadoCruce | null; tabla: TablaDatos | null; error: string }>(() => {
    if (!datos || !tablaA) return { cruce: null, tabla: null, error: "" };
    if (datos.modo === "una") return { cruce: null, tabla: tablaA, error: "" };
    if (!tablaB || !datos.columna_a || !datos.columna_b) return { cruce: null, tabla: null, error: "" };
    try {
      const r = unirTablas(tablaA, tablaB, datos.columna_a, datos.columna_b, datos.conservar);
      return { cruce: r, tabla: r.tabla, error: "" };
    } catch (e) {
      return { cruce: null, tabla: null, error: e instanceof Error ? e.message : "No se pudo unir." };
    }
  }, [datos, tablaA, tablaB]);

  // Si el resultado cambia de columnas, la gráfica se rehace con la primera propuesta (combinada).
  const claves = resultado.tabla?.columnas.map((c) => c.clave).join("|");
  useEffect(() => {
    if (!resultado.tabla || !datos || !editable) return;
    const t = resultado.tabla;
    const hay = (k: string | null) => !k || t.columnas.some((c) => c.clave === k);
    const g = datos.grafica;
    if (g.x && hay(g.x) && g.series.length && g.series.every((s) => hay(s.clave)) && hay(g.tamano) && hay(g.filaCalor)) return;
    const nueva = configInicial("barras-linea", t);
    setDatos({ ...datos, grafica: { ...nueva, titulo: g.titulo, nota: g.nota } });
  }, [claves]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando cambian las columnas del resultado

  const poner = useCallback((parte: Partial<ContenidoCruce>) => setDatos((d) => (d ? { ...d, ...parte } : d)), []);
  const ponerGrafica = useCallback((grafica: ConfigGrafica) => setDatos((d) => (d ? { ...d, grafica } : d)), []);
  const volver = async () => {
    await vaciar();
    navigate(leido.data?.carpeta_id ? `${ruta}?c=${leido.data.carpeta_id}` : ruta);
  };

  const alternarEstado = async () => {
    if (!datos || !(await vaciar())) return;
    const siguiente = estado === "listo" ? "borrador" : "listo";
    try {
      await guardar.mutateAsync({ id, contenido: datos, estado: siguiente });
      setEstado(siguiente);
      decir(siguiente === "listo" ? "Marcado como listo." : "Vuelve a borrador.");
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    }
  };

  if (leido.isPending || duenos.isPending) return <div className="es ud"><p className="es-note" style={{ padding: 24 }}>Abriendo el cruce…</p></div>;
  if (leido.error || !leido.data || leido.data.tipo !== "cruce" || !datos) {
    return (
      <div className="es ud">
        <div className="es-empty" style={{ margin: 24 }}>
          <b>No se pudo abrir el cruce</b>
          <span>{leido.error?.message ?? "No existe, no es un cruce o no tiene permiso para verlo."}</span>
          <button type="button" className="es-btn" onClick={() => navigate(ruta)}>Volver a {volverA}</button>
        </div>
      </div>
    );
  }

  const tablas = (archivos.data ?? []).filter((a) => a.tipo === "tabla" && !a.borrado_en);
  const opcionesTabla = (actual: string | null) => (
    <>
      <option value="">Elija una tabla</option>
      {actual && !tablas.some((t) => t.id === actual) ? <option value={actual}>(una tabla que no veo)</option> : null}
      {tablas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
    </>
  );
  const problema = resultado.tabla ? falta(resultado.tabla, datos.grafica) : "Elija las tablas y la columna por la que se unen.";
  const aviso2 = resultado.cruce ? avisoDeCruce(resultado.cruce, datos.conservar) : "";
  const hermanos = (archivos.data ?? []).filter((a) => a.carpeta_id === leido.data!.carpeta_id && !a.borrado_en).map((a) => a.nombre);

  const guardarComoTabla = () => {
    if (!resultado.cruce) return;
    const t = resultado.cruce.tabla;
    const contenido: ContenidoTabla = { version: 1, columnas: t.columnas, filas: t.filas.map((f) => ({ id: crypto.randomUUID(), datos: f.datos })), presentacion: { ...PRESENTACION_VACIA, titulo: datos.grafica.titulo }, mapaCalor: false };
    crear.mutate(
      { tipo: "tabla", nombre: nombreUnico(`${nombre} (resultado)`, hermanos), carpeta: leido.data!.carpeta_id, contenido },
      {
        onSuccess: (nuevo) => {
          poner({ resultado_id: nuevo });
          decir("Guardada como tabla nueva.");
        },
        onError: (e) => decir(e.message),
      },
    );
  };

  return (
    <div className="es ud">
      <MarcoEditor
        tipo="cruce"
        etiqueta={`Cruce de tablas ${nombre}`}
        nombre={{ valor: nombre, editable, renombrar: (n) => renombrar.mutate({ tipo: "archivo", id, nombre: n }, { onSuccess: () => { setNombre(n); decir("Nombre cambiado."); }, onError: (e) => decir(e.message) }) }}
        chip={<Estado estado={estado} />}
        guardado={guardado}
        soloLectura={rol === "lector" ? "Solo puede ver este cruce" : !editable ? "Solo lectura" : undefined}
        onVolver={() => void volver()}
        acciones={
          <>
            {datos.resultado_id ? <button type="button" className="es-btn" onClick={() => void vaciar().then(() => navigate(`${ruta}/tabla/${datos.resultado_id}`))}><Icon name="table" size={16} />Abrir la tabla guardada</button> : null}
            {editable && datos.modo === "dos" ? <button type="button" className="es-btn" disabled={!resultado.cruce || crear.isPending} onClick={guardarComoTabla}>Guardar como tabla nueva</button> : null}
            {editable ? (
              <button type="button" className="es-btn es-btn--pri" disabled={estado === "borrador" && Boolean(problema)} title={estado === "borrador" && problema ? problema : undefined} onClick={() => void alternarEstado()}>
                {estado === "listo" ? "Volver a borrador" : "Marcar como listo"}
              </button>
            ) : null}
          </>
        }
      >
        <div className="ud-trabajo">
          <aside className="ud-panel ud-panel--l" aria-label="Tablas del cruce">
            <div className="es-seg" role="group" aria-label="Qué cruzar" style={{ justifySelf: "start" }}>
              <button type="button" aria-pressed={datos.modo === "dos"} disabled={!editable} onClick={() => poner({ modo: "dos" })}>Dos tablas</button>
              <button type="button" aria-pressed={datos.modo === "una"} disabled={!editable} onClick={() => poner({ modo: "una" })}>Una tabla</button>
            </div>
            <label className="es-fl">
              {datos.modo === "dos" ? "Tabla A" : "Tabla"}
              <select className="es-inp" value={datos.tabla_a ?? ""} disabled={!editable} onChange={(e) => poner({ tabla_a: e.target.value || null, columna_a: null })}>{opcionesTabla(datos.tabla_a)}</select>
            </label>
            {datos.modo === "dos" ? (
              <>
                <label className="es-fl">
                  Tabla B
                  <select className="es-inp" value={datos.tabla_b ?? ""} disabled={!editable} onChange={(e) => poner({ tabla_b: e.target.value || null, columna_b: null })}>{opcionesTabla(datos.tabla_b)}</select>
                </label>
                <div>
                  <h3>Cómo se unen</h3>
                  <p className="ud-sub">Se cruzan por una columna que las dos tengan.</p>
                </div>
                <div className="ud-union">
                  <label className="es-fl">En A
                    <select className="es-inp" value={datos.columna_a ?? ""} disabled={!editable || !tablaA} onChange={(e) => poner({ columna_a: e.target.value || null })}>
                      <option value="">Columna</option>
                      {tablaA?.columnas.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
                    </select>
                  </label>
                  <div className="ud-union__enlace" aria-hidden="true" />
                  <label className="es-fl">En B
                    <select className="es-inp" value={datos.columna_b ?? ""} disabled={!editable || !tablaB} onChange={(e) => poner({ columna_b: e.target.value || null })}>
                      <option value="">Columna</option>
                      {tablaB?.columnas.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
                    </select>
                  </label>
                </div>
                <div className="es-fl" id="ud-lbl-conservar">Qué filas conservar</div>
                <div className="es-seg" role="group" aria-labelledby="ud-lbl-conservar">
                  {([["coinciden", "Solo las que coinciden"], ["todas_a", "Todas las de A"]] as [ConservarFilas, string][]).map(([v, t]) => (
                    <button key={v} type="button" aria-pressed={datos.conservar === v} disabled={!editable} onClick={() => poner({ conservar: v })}>{t}</button>
                  ))}
                </div>
                {resultado.error ? <p className="ud-aviso" data-t="error" role="alert">{resultado.error}</p> : null}
                {aviso2 ? <p className="ud-aviso" data-t={resultado.cruce && (resultado.cruce.sinParejaA.length || resultado.cruce.sinParejaB.length) ? "aviso" : "ok"} role="status">{aviso2}</p> : null}
              </>
            ) : (
              <p className="es-note">Con una sola tabla se grafican columnas de la misma tabla: elija el eje horizontal y las series a la derecha.</p>
            )}
          </aside>

          <div className="ud-escenario">
            {resultado.tabla ? <SelectorTipo config={datos.grafica} tabla={resultado.tabla} editable={editable} onChange={ponerGrafica} /> : null}
            <CajaGrafica tabla={resultado.tabla} config={datos.grafica} />
            {resultado.cruce ? <TablaResultado r={resultado.cruce} /> : null}
            <p className="es-note" style={{ textAlign: "center" }}>{problema}</p>
          </div>

          <aside className="ud-panel ud-panel--r" aria-label="Gráfica del cruce">
            {resultado.tabla ? <PanelDatos tabla={resultado.tabla} config={datos.grafica} editable={editable} onChange={ponerGrafica} /> : <p className="es-note">Cuando elija las tablas y la columna de unión podrá armar la gráfica.</p>}
            <PanelEstilo config={datos.grafica} editable={editable} onChange={ponerGrafica} />
          </aside>
        </div>
      </MarcoEditor>
      <Aviso texto={aviso} />
    </div>
  );
}

/** Las primeras filas del resultado, con una marca de color según venga de A o de B. */
function TablaResultado({ r }: { r: ResultadoCruce }) {
  const filas = r.tabla.filas.slice(0, 8);
  return (
    <div className="ud-resultado" tabIndex={0} role="region" aria-label="Vista previa del resultado del cruce">
      <table>
        <thead>
          <tr>{r.tabla.columnas.map((c) => <th key={c.clave} className={r.origen[c.clave]?.tabla === "b" ? "ud-b" : "ud-a"} scope="col">{c.etiqueta}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              {r.tabla.columnas.map((c) => {
                const v = f.datos[c.clave];
                return <td key={c.clave} className={typeof v === "number" ? "ud-num" : undefined}>{v === null || v === undefined ? "" : typeof v === "number" ? textoNumero(v) : v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="es-note" style={{ padding: "6px 10px" }}>{r.tabla.filas.length > 8 ? `Primeras 8 de ${r.tabla.filas.length} filas. ` : `${r.tabla.filas.length} ${r.tabla.filas.length === 1 ? "fila" : "filas"}. `}Azul: columnas de A. Ocre: columnas de B.</p>
    </div>
  );
}

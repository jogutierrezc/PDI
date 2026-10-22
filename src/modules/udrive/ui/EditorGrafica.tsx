/* =============================================================================
   UDrive · el constructor de gráficas (/admin/udrive/grafica/:id).

   Tres pasos, como en el diseño aprobado: 1 · de dónde salen los datos (una
   tabla de UDrive), 2 · qué se dibuja (tipo, eje horizontal y series) y
   3 · cómo se ve (título, ejes, rango, tendencia, rótulos y nota). La gráfica
   guarda la definición, no los datos: si cambia la tabla, la gráfica cambia en
   todos los informes donde esté. Se guarda sola.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Aviso, useAviso } from "../../../components/espacio/piezas";
import { Icon } from "../../../components/ui/Icon";
import { useArchivos, useContenido, useDuenos, useGuardarContenido, useRenombrar } from "../datos";
import { configInicial, falta, normalizarConfig } from "../lib/graficas";
import { puedeEditar } from "../lib/permisos";
import { normalizarContenido } from "../lib/tabla";
import type { ConfigGrafica, ContenidoGrafica, TablaDatos } from "../tipos";
import { CajaGrafica, PanelDatos, PanelEstilo, SelectorTipo } from "./ConstructorGrafica";
import { MarcoEditor, useAutoguardado } from "./MarcoEditor";
import { Estado } from "./piezas";
import "../../../components/espacio/espacio.css";
import "./udrive.css";

export function EditorGrafica({ id }: { id: string }) {
  const navigate = useNavigate();
  const leido = useContenido(id);
  const duenos = useDuenos([id]);
  const archivos = useArchivos();
  const guardar = useGuardarContenido();
  const renombrar = useRenombrar();
  const { aviso, decir } = useAviso();
  const [datos, setDatos] = useState<ContenidoGrafica | null>(null);
  const [estado, setEstado] = useState<"borrador" | "listo">("borrador");
  const [nombre, setNombre] = useState("");
  const cargado = useRef(false);

  const tablaLeida = useContenido(datos?.tabla_id ?? undefined);
  const tabla: TablaDatos | null = useMemo(() => {
    if (!tablaLeida.data || tablaLeida.data.tipo !== "tabla") return null;
    const c = normalizarContenido(tablaLeida.data.contenido);
    return { columnas: c.columnas, filas: c.filas };
  }, [tablaLeida.data]);

  useEffect(() => {
    if (!leido.data || cargado.current) return;
    cargado.current = true;
    const crudo = (leido.data.contenido ?? {}) as { tabla_id?: unknown; config?: unknown };
    setDatos({ version: 1, tabla_id: typeof crudo.tabla_id === "string" ? crudo.tabla_id : null, config: normalizarConfig(crudo.config, null) });
    setEstado(leido.data.estado);
    setNombre(leido.data.nombre);
  }, [leido.data]);

  const rol = duenos.data?.get(id)?.mi_rol;
  const editable = puedeEditar(rol);

  const { estado: guardado, vaciar } = useAutoguardado(datos, editable, (v) => guardar.mutateAsync({ id, contenido: v }));

  // Si la tabla cambió y la configuración apunta a columnas que ya no están, se rehace con la primera propuesta.
  useEffect(() => {
    if (!tabla || !datos || !editable) return;
    const hay = (k: string | null) => !k || tabla.columnas.some((c) => c.clave === k);
    const ok = hay(datos.config.x) && datos.config.series.every((s) => hay(s.clave)) && hay(datos.config.tamano) && hay(datos.config.filaCalor);
    if (ok && datos.config.x) return;
    const nueva = configInicial(datos.config.tipo, tabla);
    setDatos({ ...datos, config: { ...nueva, titulo: datos.config.titulo, nota: datos.config.nota } });
  }, [tabla]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando llega otra tabla

  const poner = useCallback((config: ConfigGrafica) => setDatos((d) => (d ? { ...d, config } : d)), []);
  const volver = async () => {
    await vaciar();
    navigate(leido.data?.carpeta_id ? `/admin/udrive?c=${leido.data.carpeta_id}` : "/admin/udrive");
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

  if (leido.isPending || duenos.isPending) return <div className="es ud"><p className="es-note" style={{ padding: 24 }}>Abriendo la gráfica…</p></div>;
  if (leido.error || !leido.data || leido.data.tipo !== "grafica" || !datos) {
    return (
      <div className="es ud">
        <div className="es-empty" style={{ margin: 24 }}>
          <b>No se pudo abrir la gráfica</b>
          <span>{leido.error?.message ?? "No existe, no es una gráfica o no tiene permiso para verla."}</span>
          <button type="button" className="es-btn" onClick={() => navigate("/admin/udrive")}>Volver a UDrive</button>
        </div>
      </div>
    );
  }
  const tablas = (archivos.data ?? []).filter((a) => a.tipo === "tabla" && !a.borrado_en);
  const problema = falta(tabla, datos.config);
  const sinTabla = datos.tabla_id && !tablaLeida.isPending && !tabla;

  return (
    <div className="es ud">
      <MarcoEditor
        tipo="grafica"
        etiqueta={`Constructor de la gráfica ${nombre}`}
        nombre={{ valor: nombre, editable, renombrar: (n) => renombrar.mutate({ tipo: "archivo", id, nombre: n }, { onSuccess: () => { setNombre(n); decir("Nombre cambiado."); }, onError: (e) => decir(e.message) }) }}
        chip={<Estado estado={estado} />}
        guardado={guardado}
        soloLectura={rol === "lector" ? "Solo puede ver esta gráfica" : !editable ? "Solo lectura" : undefined}
        onVolver={() => void volver()}
        acciones={
          <>
            {datos.tabla_id && tabla ? <button type="button" className="es-btn" onClick={() => void vaciar().then(() => navigate(`/admin/udrive/tabla/${datos.tabla_id}`))}><Icon name="table" size={16} />Abrir la tabla</button> : null}
            {editable ? (
              <button type="button" className="es-btn es-btn--pri" disabled={estado === "borrador" && Boolean(problema)} title={estado === "borrador" && problema ? problema : undefined} onClick={() => void alternarEstado()}>
                {estado === "listo" ? "Volver a borrador" : "Marcar como lista"}
              </button>
            ) : null}
          </>
        }
      >
        <div className="ud-trabajo">
          <aside className="ud-panel ud-panel--l" aria-label="Datos de la gráfica">
            <div>
              <h3>De dónde salen los datos</h3>
              <p className="ud-sub">Una tabla de UDrive.</p>
            </div>
            <label className="es-fl">
              Tabla
              <select className="es-inp" value={datos.tabla_id ?? ""} disabled={!editable} onChange={(e) => setDatos({ ...datos, tabla_id: e.target.value || null })}>
                <option value="">Elija una tabla</option>
                {datos.tabla_id && !tablas.some((t) => t.id === datos.tabla_id) ? <option value={datos.tabla_id}>(una tabla que no veo)</option> : null}
                {tablas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
            {sinTabla ? <p className="ud-aviso" data-t="error" role="alert">No se pudo leer la tabla: ya no existe, está en la papelera o no tiene permiso para verla.</p> : null}
            {tabla ? <PanelDatos tabla={tabla} config={datos.config} editable={editable} onChange={poner} /> : null}
            <p className="es-note">Cambie un valor en la tabla y la gráfica se actualiza en todos los informes donde esté.</p>
          </aside>

          <div className="ud-escenario">
            {tabla ? <SelectorTipo config={datos.config} tabla={tabla} editable={editable} onChange={poner} /> : null}
            <CajaGrafica tabla={tabla} config={datos.config} />
            <p className="es-note" style={{ textAlign: "center" }}>{problema || "La figura se guarda sola. Con la tabla cambian también el título y las notas de los informes que la usen."}</p>
          </div>

          <aside className="ud-panel ud-panel--r" aria-label="Estilo de la gráfica">
            <PanelEstilo config={datos.config} editable={editable} onChange={poner} />
          </aside>
        </div>
      </MarcoEditor>
      <Aviso texto={aviso} />
    </div>
  );
}

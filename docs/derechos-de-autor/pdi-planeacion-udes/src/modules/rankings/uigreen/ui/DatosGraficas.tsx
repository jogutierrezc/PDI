/* =============================================================================
   UI GreenMetric · «Datos y gráficas»: conecta campos numéricos a tablas de
   Datos de Sostenibilidad (con vista previa) y enlaza gráficas. Crear una tabla
   o una gráfica nueva se hace en Datos de Sostenibilidad (su propio editor);
   al volver aquí aparece en la lista.
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { useGraficasDisponibles, useQuitarGrafica, useQuitarVinculo, useTablasDisponibles, useVincularDato, useVincularGrafica, useVinculos } from "../datos";
import { formatearNumero } from "../lib/calculo";
import type { PreguntaCiclo, RespuestaUgm, TablaDisponible } from "../lib/tipos";
import { Alerta, Campo, Cargando, Dialogo, ErrorConsulta, fechaCorta } from "./comunes";
import { useUgm } from "./contexto";
import { enlaceCarpeta } from "./Evidencias";
import { useGraficasVinculadas } from "./lectura";

const AGREGACION = { suma: "Suma de las filas", promedio: "Promedio", ultimo: "Último valor" } as const;
const ANIO = { ultimo: "El último año", anterior: "El año anterior", dos_atras: "Dos años atrás", fijo: "Un año fijo" } as const;

export function DatosGraficas({ r, p, editable }: { r: RespuestaUgm; p: PreguntaCiclo; editable: boolean }) {
  const u = useUgm();
  const vinc = useVinculos(r.id);
  const tablas = useTablasDisponibles(true);
  const graficas = useGraficasDisponibles(true);
  const vinculadas = useGraficasVinculadas(r.id);
  const quitarV = useQuitarVinculo();
  const vincularG = useVincularGrafica();
  const quitarG = useQuitarGrafica();
  const [dlg, setDlg] = useState(false);
  const [grafica, setGrafica] = useState("");
  const numeros = p.esquema.campos.filter((c) => c.tipo === "numero");
  const categoria = u.categorias.find((c) => c.categoria === p.categoria);
  const carpeta = p.carpeta_id ?? categoria?.carpeta_id ?? null;

  if (vinc.isLoading || tablas.isLoading) return <Cargando />;
  if (vinc.error) return <ErrorConsulta error={vinc.error} />;
  const nombreTabla = (id: string) => tablas.data?.find((t) => t.id === id)?.nombre ?? "Tabla";

  return (
    <div className="ugm-form">
      <p className="ugm-muted">
        Las cifras de este indicador pueden salir de una tabla de Datos de Sostenibilidad. Si el campo está conectado, manda la tabla y se recalcula cuando cambia.
      </p>
      <section className="ugm-sec">
        <h3>Campos conectados</h3>
        {(vinc.data ?? []).length === 0 ? (
          <p className="ugm-muted">Ningún campo está conectado a una tabla.</p>
        ) : (
          <ul className="ugm-lista">
            {vinc.data!.map((v) => (
              <li key={v.id} className="ugm-fila-simple">
                <span>
                  <b>{p.esquema.campos.find((c) => c.k === v.campo)?.es ?? v.campo}</b> ← {v.tabla ?? nombreTabla(v.archivo_id)} · {v.columna}
                  <small>
                    {AGREGACION[v.agregacion]} · {ANIO[v.anio_modo]}
                    {v.anio ? ` ${v.anio}` : ""} · {v.modo === "conectado" ? "manda la tabla" : "manda lo escrito a mano"} ·{" "}
                    {v.dato ? `hoy da ${formatearNumero(v.dato.valor, 4)} (${v.dato.anio ?? "sin año"}, ${v.dato.filas} filas)` : "sin dato"}
                  </small>
                </span>
                <span className="ugm-fila-acc">
                  <span className={`ugm-etq ${v.publicada ? "ugm-etq--ok" : "ugm-etq--aviso"}`}>{v.publicada ? "Tabla publicada" : "Tabla sin publicar"}</span>
                  {editable && (
                    <button type="button" className="ugm-btn ugm-btn--sm ugm-btn--peligro" onClick={() => void u.hacer(() => quitarV.mutateAsync({ respuesta: r.id, campo: v.campo }), "Conexión quitada.")}>
                      Quitar
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {editable && numeros.length > 0 && (
          <div className="ugm-acciones">
            <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => setDlg(true)}>
              <Icon name="table" size={16} /> Conectar un campo a una tabla
            </button>
          </div>
        )}
      </section>

      <section className="ugm-sec">
        <h3>Gráficas del indicador</h3>
        {(vinculadas.data ?? []).length === 0 ? (
          <p className="ugm-muted">Ninguna gráfica enlazada.</p>
        ) : (
          <ul className="ugm-lista">
            {vinculadas.data!.map((id) => {
              const g = graficas.data?.find((x) => x.id === id);
              return (
                <li key={id} className="ugm-fila-simple">
                  <span>
                    <b>{g?.nombre ?? "Gráfica"}</b>
                    <small>{g?.publicada ? "Publicada en Datos de Sostenibilidad" : "Sin publicar: el indicador saldrá sin esta gráfica"}</small>
                  </span>
                  {editable && (
                    <button type="button" className="ugm-btn ugm-btn--sm ugm-btn--peligro" onClick={() => void u.hacer(() => quitarG.mutateAsync({ respuesta: r.id, archivo: id }), "Gráfica desvinculada.")}>
                      Quitar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {editable && (
          <div className="ugm-fila-form">
            <Campo id="gr-sel" etiqueta="Enlazar una gráfica existente">
              <select id="gr-sel" className="ugm-input ugm-input--sel" value={grafica} onChange={(e) => setGrafica(e.target.value)}>
                <option value="">Elegir gráfica</option>
                {(graficas.data ?? []).filter((g) => !vinculadas.data?.includes(g.id)).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                    {g.publicada ? "" : " (sin publicar)"}
                  </option>
                ))}
              </select>
            </Campo>
            <button type="button" className="ugm-btn" disabled={!grafica || vincularG.isPending} onClick={() => void u.hacer(() => vincularG.mutateAsync({ respuesta: r.id, archivo: grafica }), "Gráfica enlazada.").then(() => setGrafica(""))}>
              Enlazar
            </button>
          </div>
        )}
        <a className="ugm-btn ugm-btn--sm" href={enlaceCarpeta(carpeta)} target="_blank" rel="noreferrer">
          <Icon name="external" size={16} /> Crear una tabla o una gráfica en Datos de Sostenibilidad
        </a>
        <p className="ugm-muted ugm-peq">Se abre en otra pestaña, en la carpeta de este indicador. Al volver, la lista se actualiza sola.</p>
      </section>
      {dlg && <Conectar r={r} p={p} tablas={tablas.data ?? []} onCerrar={() => setDlg(false)} />}
    </div>
  );
}

function Conectar({ r, p, tablas, onCerrar }: { r: RespuestaUgm; p: PreguntaCiclo; tablas: TablaDisponible[]; onCerrar: () => void }) {
  const u = useUgm();
  const vincular = useVincularDato();
  const campos = p.esquema.campos.filter((c) => c.tipo === "numero");
  const [campo, setCampo] = useState(campos[0]?.k ?? "");
  const [tabla, setTabla] = useState(tablas[0]?.id ?? "");
  const t = tablas.find((x) => x.id === tabla);
  const numericas = (t?.columnas ?? []).filter((c) => c.tipo === "numero" || c.tipo === "porcentaje");
  const [columna, setColumna] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [agregacion, setAgregacion] = useState<keyof typeof AGREGACION>("suma");
  const [anioModo, setAnioModo] = useState<keyof typeof ANIO>("ultimo");
  const [anio, setAnio] = useState(String(u.ciclo.anio_datos));
  const [modo, setModo] = useState<"conectado" | "manual">("conectado");
  const [resultado, setResultado] = useState<string | null>(null);
  const col = columna || numericas[0]?.clave || "";

  return (
    <Dialogo titulo="Conectar un campo a una tabla" descripcion="Las columnas marcadas como sensibles no aparecen ni se pueden usar." onCerrar={onCerrar} ancho={640}>
      {tablas.length === 0 ? (
        <Alerta tipo="aviso">No hay tablas en Datos de Sostenibilidad a las que tenga acceso. Cree una en esa pantalla y vuelva.</Alerta>
      ) : (
        <form
          className="ugm-form"
          onSubmit={async (e) => {
            e.preventDefault();
            let dato: { valor: number; anio: number | null; filas: number } | null = null;
            const ok = await u.hacer(async () => {
              dato = await vincular.mutateAsync({ respuesta: r.id, campo, archivo: tabla, columna: col, colPeriodo: periodo || null, agregacion, anioModo, anio: anioModo === "fijo" ? Number(anio) : null, modo });
            });
            if (ok) {
              const d = dato as { valor: number; anio: number | null; filas: number } | null;
              setResultado(d ? `Conectado. Hoy daría ${formatearNumero(d.valor, 4)} (${d.anio ?? "sin año"}, ${d.filas} filas).` : "Conectado, pero la tabla todavía no da dato con esa configuración.");
            }
          }}
        >
          <Campo id="cn-campo" etiqueta="Campo del indicador">
            <select id="cn-campo" className="ugm-input ugm-input--sel" value={campo} onChange={(e) => setCampo(e.target.value)}>
              {campos.map((c) => (
                <option key={c.k} value={c.k}>
                  {c.es}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="cn-tabla" etiqueta="Tabla de Datos de Sostenibilidad">
            <select id="cn-tabla" className="ugm-input ugm-input--sel" value={tabla} onChange={(e) => { setTabla(e.target.value); setColumna(""); setPeriodo(""); }}>
              {tablas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </Campo>
          {t && (
            <div className="ugm-vista-previa" aria-label="Vista previa de la tabla">
              <p>
                <b>{t.nombre}</b> · <span className="ugm-num">{t.filas}</span> filas · actualizada {fechaCorta(t.actualizado)} ·{" "}
                <span className={`ugm-etq ${t.publicada ? "ugm-etq--ok" : "ugm-etq--aviso"}`}>{t.publicada ? "Publicada" : "Sin publicar"}</span>
              </p>
              <p className="ugm-muted ugm-peq">Columnas: {t.columnas.map((c) => c.etiqueta).join(" · ") || "sin columnas"}</p>
              {!t.publicada && <p className="ugm-falta">Si el campo manda desde esta tabla, el indicador no podrá salir en la web hasta que se publique.</p>}
            </div>
          )}
          <div className="ugm-grid2">
            <Campo id="cn-col" etiqueta="Columna con el valor" ayuda={numericas.length ? undefined : "Esta tabla no tiene columnas numéricas."}>
              <select id="cn-col" className="ugm-input ugm-input--sel" value={col} onChange={(e) => setColumna(e.target.value)}>
                {numericas.map((c) => (
                  <option key={c.clave} value={c.clave}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="cn-per" etiqueta="Columna del periodo" ayuda="Opcional.">
              <select id="cn-per" className="ugm-input ugm-input--sel" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                <option value="">Sin columna de periodo</option>
                {(t?.columnas ?? []).map((c) => (
                  <option key={c.clave} value={c.clave}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="ugm-grid2">
            <Campo id="cn-agr" etiqueta="Cómo se juntan las filas">
              <select id="cn-agr" className="ugm-input ugm-input--sel" value={agregacion} onChange={(e) => setAgregacion(e.target.value as keyof typeof AGREGACION)}>
                {Object.entries(AGREGACION).map(([k, et]) => (
                  <option key={k} value={k}>
                    {et}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="cn-anio" etiqueta="Año">
              <select id="cn-anio" className="ugm-input ugm-input--sel" value={anioModo} onChange={(e) => setAnioModo(e.target.value as keyof typeof ANIO)}>
                {Object.entries(ANIO).map(([k, et]) => (
                  <option key={k} value={k}>
                    {et}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          {anioModo === "fijo" && (
            <Campo id="cn-anio-fijo" etiqueta="Año fijo">
              <input id="cn-anio-fijo" className="ugm-input ugm-num" inputMode="numeric" value={anio} onChange={(e) => setAnio(e.target.value.replace(/\D/g, ""))} />
            </Campo>
          )}
          <fieldset className="ugm-fs">
            <legend>Cuál manda</legend>
            <label className="ugm-check">
              <input type="radio" name="cn-modo" checked={modo === "conectado"} onChange={() => setModo("conectado")} />
              <span>La tabla: el campo queda de solo lectura y se recalcula si la tabla cambia.</span>
            </label>
            <label className="ugm-check">
              <input type="radio" name="cn-modo" checked={modo === "manual"} onChange={() => setModo("manual")} />
              <span>Lo escrito a mano: se muestra lo que daría la tabla y se ofrece usarlo.</span>
            </label>
          </fieldset>
          {resultado && <Alerta tipo="ok">{resultado}</Alerta>}
          <footer className="ugm-dlg__pie">
            <button type="button" className="ugm-btn" onClick={onCerrar}>
              {resultado ? "Cerrar" : "Cancelar"}
            </button>
            <button type="submit" className="ugm-btn ugm-btn--pri" disabled={!campo || !tabla || !col || vincular.isPending}>
              {vincular.isPending ? "Conectando…" : "Conectar"}
            </button>
          </footer>
        </form>
      )}
    </Dialogo>
  );
}

/* =============================================================================
   Datos de Sostenibilidad · Portal de sostenibilidad.

   Cómo llega el dato de la tabla a la página pública: el recorrido tabla →
   gráfica → indicador → portal, un campus a elegir y una vista previa de
   /sostenible que se calcula aquí, en el navegador, con las mismas tarjetas y
   gráficas del portal (nada se copia: son sus componentes). A la derecha, qué
   se publica (interruptores) y la revisión antes de publicar.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useDuenos } from "../../udrive/datos";
import { normalizarConfig } from "../../udrive/lib/graficas";
import { rangoDe } from "../../udrive/lib/permisos";
import type { ConfigGrafica, TablaDatos } from "../../udrive/tipos";
import { CAMPUSES } from "../../sostenible/data";
import type { Campus } from "../../sostenible/data";
import { GraficasPublicadas } from "../../sostenible/GraficasSostenibles";
import { TileCuerpo } from "../../sostenible/widgets";
import type { TileDatos } from "../../sostenible/widgets";
import "../../sostenible/sostenible.css";
import { calcularIndicador, columnaSensible, usePublicacionesGraficas, usePublicarGrafica, usePublicarIndicador, useIndicadoresSos, useVinculos } from "../sos";
import type { GraficaPublicaSos, IndicadorSos } from "../tipos";
import { dibujarGrafica, encenderRecorrido } from "./movimiento";
import { AvisoSos, ErrorSos, Interruptor } from "./piezas";
import { useAccesoSos, useArchivosSos, useTablaDeGraficas, useTablasDe } from "./usos";

type Revision = { tipo: "ok" | "aviso"; texto: string };

/** Dispersión y burbujas son un punto por registro: la base no las publica. */
const NO_PUBLICABLES = new Set(["dispersion", "burbujas"]);

/** Las columnas que usa una gráfica (las que la base entrega y revisa). */
function columnasUsadas(c: ConfigGrafica): string[] {
  return [...new Set([c.x, ...c.series.map((s) => s.clave), c.tamano, c.filaCalor].filter((k): k is string => Boolean(k)))];
}

export function Portal({ acceso }: { acceso: ReturnType<typeof useAccesoSos> }) {
  const inds = useIndicadoresSos();
  const vins = useVinculos();
  const pubs = usePublicacionesGraficas();
  const publicarInd = usePublicarIndicador();
  const publicarGraf = usePublicarGrafica();
  const { tablas: tablasUnidad, graficas, cargando: cargandoArchivos } = useArchivosSos(acceso.unidad?.carpeta_raiz);
  const origen = useTablaDeGraficas(graficas);
  const duenos = useDuenos(graficas.map((g) => g.id));
  const [campus, setCampus] = useState<Campus>("Todos");
  const [error, setError] = useState<string | null>(null);
  const recorrido = useRef<HTMLOListElement>(null);
  const previa = useRef<HTMLDivElement>(null);

  const lista = inds.data ?? [];
  const publicadasGraf = useMemo(() => new Map((pubs.data ?? []).map((p) => [p.archivo_id, p])), [pubs.data]);
  const grafPublicadas = graficas.filter((g) => publicadasGraf.get(g.id)?.publicado);
  const indsPublicados = lista.filter((i) => i.publicado);

  // Las tablas que hacen falta para calcular la vista previa: las de los indicadores publicados y las de las gráficas publicadas.
  const idsTablas = useMemo(
    () => [...new Set([...indsPublicados.flatMap((i) => (vins.data ?? []).filter((v) => v.indicador_id === i.id).map((v) => v.archivo_id)), ...grafPublicadas.map((g) => origen.get(g.id)?.tabla).filter((t): t is string => Boolean(t))])],
    [indsPublicados, vins.data, grafPublicadas, origen],
  );
  const { tablas, cargando: cargandoTablas } = useTablasDe(idsTablas);
  const nombreTabla = (id: string) => tablasUnidad.find((t) => t.id === id)?.nombre ?? "la tabla";

  /* --- La vista previa: tarjetas de los indicadores y gráficas como las dibuja el portal --- */
  const { tarjetas, revision } = useMemo(() => {
    const tarjetas: { ind: IndicadorSos; d: TileDatos }[] = [];
    const revision: Revision[] = [];
    for (const ind of indsPublicados) {
      const v = vins.data?.find((x) => x.indicador_id === ind.id);
      const t = v ? tablas.get(v.archivo_id) : undefined;
      if (!v) {
        revision.push({ tipo: "aviso", texto: `«${ind.nombre}» no tiene tabla y saldría como dato ilustrativo.` });
        continue;
      }
      if (!t) {
        revision.push({ tipo: "aviso", texto: t === null ? `No pude leer la tabla de «${ind.nombre}».` : `Leyendo la tabla de «${ind.nombre}»…` });
        continue;
      }
      const calc = calcularIndicador(ind, v, t, campus === "Todos" ? null : campus);
      const sinFilas = calcularIndicador(ind, v, t, null);
      if (calc.avisos.length) revision.push(...calc.avisos.map((a): Revision => ({ tipo: "aviso", texto: `«${ind.nombre}»: ${a}` })));
      else if (!sinFilas.serie.length) revision.push({ tipo: "aviso", texto: `«${ind.nombre}» no tiene filas con valor y año: no saldría.` });
      else revision.push({ tipo: "ok", texto: `«${ind.nombre}» tiene fuente (${nombreTabla(v.archivo_id)}), periodo (${sinFilas.actual?.anio}) y valor.` });
      if (!calc.actual || !calc.serie.length) continue;
      const primero = calc.serie[0].valor;
      const pct = primero ? ((calc.actual.valor - primero) / primero) * 100 : 0;
      tarjetas.push({
        ind,
        d: {
          name: ind.nombre,
          unit: ind.unidad,
          decimals: ind.decimales,
          value: calc.actual.valor,
          series: calc.serie.map((p) => p.valor),
          pct,
          good: ind.mejor === "sube" ? pct >= 0 : pct <= 0,
          desde: calc.serie[0].anio,
          bar: ind.unidad.includes("%") ? Math.min(100, calc.actual.valor) : null,
          real: { valor: calc.actual.valor, fuente: nombreTabla(v.archivo_id), evidencia: null },
          sinCambio: calc.serie.length < 2,
        },
      });
    }
    return { tarjetas, revision };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nombreTabla depende de tablasUnidad, que ya cuenta como dato de la vista
  }, [indsPublicados, vins.data, tablas, campus, tablasUnidad]);

  const graficasPrevia = useMemo(() => {
    const salida: GraficaPublicaSos[] = [];
    const avisos: Revision[] = [];
    for (const g of grafPublicadas) {
      const fuente = origen.get(g.id);
      const tabla: TablaDatos | null | undefined = fuente?.tabla ? tablas.get(fuente.tabla) : undefined;
      if (!tabla) {
        avisos.push({ tipo: "aviso", texto: fuente?.tabla ? `Leyendo la tabla de «${g.nombre}»…` : `«${g.nombre}» no tiene tabla.` });
        continue;
      }
      const config = normalizarConfig(fuente?.config, tabla);
      if (NO_PUBLICABLES.has(config.tipo)) {
        avisos.push({ tipo: "aviso", texto: `«${g.nombre}» es una gráfica de dispersión o burbujas: la base no la publica.` });
        continue;
      }
      const sensibles = columnasUsadas(config).filter((k) => {
        const c = tabla.columnas.find((x) => x.clave === k);
        return c ? columnaSensible(c) : false;
      });
      if (sensibles.length) avisos.push({ tipo: "aviso", texto: `«${g.nombre}» usa columnas que parecen traer datos personales (${sensibles.join(", ")}): la base no la publica.` });
      else avisos.push({ tipo: "ok", texto: `«${g.nombre}» solo usa las columnas del dibujo, de «${nombreTabla(fuente!.tabla!)}».` });
      if (sensibles.length) continue;
      salida.push({
        id: g.id,
        nombre: g.nombre,
        seccion: publicadasGraf.get(g.id)?.seccion ?? "detalle",
        orden: publicadasGraf.get(g.id)?.orden ?? 0,
        fuente: nombreTabla(fuente!.tabla!),
        actualizado: g.updated_at,
        config,
        columnas: tabla.columnas.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo })),
        filas: tabla.filas.map((f) => f.datos),
      });
    }
    return { salida, avisos };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ídem
  }, [grafPublicadas, origen, tablas, publicadasGraf, tablasUnidad]);

  // Al entrar a la sección: se enciende el recorrido y se dibujan las gráficas. Una sola vez, cuando hay datos.
  const listo = inds.isSuccess && vins.isSuccess && pubs.isSuccess && !cargandoArchivos && !cargandoTablas;
  const yaEntro = useRef(false);
  useEffect(() => {
    if (!listo || yaEntro.current) return;
    yaEntro.current = true;
    encenderRecorrido(recorrido.current);
    dibujarGrafica(previa.current);
  }, [listo]);

  const errorCarga = inds.error ?? vins.error ?? pubs.error;
  const paso = (icono: "table" | "chart" | "spark-chart" | "pin", titulo: string, detalle: string) => ({ icono, titulo, detalle });
  const pasos = [
    paso("table", `${tablasUnidad.length} ${tablasUnidad.length === 1 ? "tabla" : "tablas"}`, "con datos de los campus"),
    paso("chart", `${graficas.length} ${graficas.length === 1 ? "gráfica" : "gráficas"}`, `${grafPublicadas.length} publicada${grafPublicadas.length === 1 ? "" : "s"}`),
    paso("spark-chart", `${lista.length} ${lista.length === 1 ? "indicador" : "indicadores"}`, `${lista.filter((i) => vins.data?.some((v) => v.indicador_id === i.id)).length} con datos`),
    paso("pin", `${indsPublicados.length + grafPublicadas.length} en el portal`, "elementos visibles"),
  ];

  const pubInd = (i: IndicadorSos, publicado: boolean) => {
    setError(null);
    publicarInd.mutate({ id: i.id, publicado }, { onError: (e) => setError(e.message) });
  };
  const pubGraf = (id: string, publicado: boolean) => {
    setError(null);
    const p = publicadasGraf.get(id);
    publicarGraf.mutate({ archivo_id: id, publicado, seccion: p?.seccion, orden: p?.orden }, { onError: (e) => setError(e.message) });
  };

  const todasLasRevisiones = [...revision, ...graficasPrevia.avisos];

  return (
    <div className="dsx-pagina">
      <div className="dsx-cab">
        <div>
          <h2>Portal de sostenibilidad</h2>
          <p className="dsx-sub">Así llega el dato desde la tabla hasta la página pública.</p>
        </div>
      </div>

      {errorCarga ? <ErrorSos error={errorCarga} /> : null}

      <ol className="dsx-recorrido" ref={recorrido} aria-label="Del dato al portal">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="dsx-recorrido__item">
            <span className="dsx-paso" data-paso="">
              <span className="dsx-paso__ico">
                <Icon name={p.icono} size={18} />
              </span>
              <b>{p.titulo}</b>
              <small>{p.detalle}</small>
            </span>
            {i < pasos.length - 1 ? <span className="dsx-conector" data-conector="" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>

      <div className="dsx-dividido">
        <div>
          <div className="dsx-barra">
            <label className="dsx-campus">
              <span className="dsx-sr">Campus de la vista previa</span>
              <select className="es-inp" value={campus} onChange={(e) => setCampus(e.target.value as Campus)}>
                {CAMPUSES.map((c) => (
                  <option key={c} value={c}>
                    {c === "Todos" ? "Todos los campus" : c}
                  </option>
                ))}
              </select>
            </label>
            <span className="dsx-chip" data-t="acento">
              Vista previa en vivo
            </span>
          </div>
          <div className="dsx-navegador">
            <div className="dsx-navegador__url">
              <Icon name="pin" size={14} />
              <span>planeacion.udes.edu.co/sostenible</span>
            </div>
            <div className="sos dsx-previa" ref={previa}>
              <div className="dsx-previa__cab">
                <p className="sos-eyebrow sos-eyebrow--on-dark">Indicadores de sostenibilidad</p>
                <h3>Lo que medimos en los campus, en vivo.</h3>
              </div>
              {!listo && !errorCarga ? <p className="dsx-previa__nota">Calculando la vista previa…</p> : null}
              {listo && !tarjetas.length && !graficasPrevia.salida.length ? (
                <p className="dsx-previa__nota">
                  Nada publicado con cifras para {campus === "Todos" ? "los campus" : campus}. Marque indicadores o gráficas a la derecha; el portal sigue mostrando sus cifras de muestra.
                </p>
              ) : null}
              {tarjetas.length ? (
                <div className="dsx-previa__cuerpo">
                  <div className="sos-ind">
                    {tarjetas.map(({ ind, d }) => (
                      <TileCuerpo key={ind.id} d={d} />
                    ))}
                  </div>
                </div>
              ) : null}
              {graficasPrevia.salida.length ? (
                <div className="dsx-previa__cuerpo">
                  <GraficasPublicadas graficas={graficasPrevia.salida} />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <div className="dsx-tarjeta">
            <b>Qué se publica</b>
            <p className="dsx-tenue">Lo marcado aparece en la página.</p>
            {!acceso.administra ? <p className="dsx-tenue">Publicar indicadores es de quien Administra la unidad; las gráficas, de quien puede crear sobre ellas.</p> : null}
            <div className="dsx-publica">
              {lista.map((i) => (
                <Interruptor
                  key={i.id}
                  marcado={i.publicado}
                  disabled={!acceso.administra || publicarInd.isPending || (!i.publicado && !vins.data?.some((v) => v.indicador_id === i.id))}
                  titulo={!vins.data?.some((v) => v.indicador_id === i.id) && !i.publicado ? "Conecte primero una tabla" : undefined}
                  onChange={(p) => pubInd(i, p)}
                >
                  {i.nombre}
                </Interruptor>
              ))}
              {graficas.map((g) => (
                <Interruptor
                  key={g.id}
                  marcado={Boolean(publicadasGraf.get(g.id)?.publicado)}
                  disabled={rangoDe(duenos.data?.get(g.id)?.mi_rol) < 3 || publicarGraf.isPending}
                  onChange={(p) => pubGraf(g.id, p)}
                >
                  <Icon name="chart" size={13} /> {g.nombre}
                </Interruptor>
              ))}
              {listo && !lista.length && !graficas.length ? <p className="dsx-tenue">Todavía no hay indicadores ni gráficas.</p> : null}
            </div>
            {error ? <AvisoSos tipo="error">{error}</AvisoSos> : null}
          </div>
          <div className="dsx-tarjeta">
            <b>Revisión antes de publicar</b>
            <ul className="dsx-revision">
              {todasLasRevisiones.map((r) => (
                <li key={r.texto} data-t={r.tipo}>
                  <Icon name={r.tipo === "ok" ? "check" : "alert"} size={15} />
                  <span>{r.texto}</span>
                </li>
              ))}
              {listo && !todasLasRevisiones.length ? <li className="dsx-tenue">No hay nada publicado que revisar.</li> : null}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

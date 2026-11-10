/* Warehouse UDES · Tableros propios: la lista de los tableros guardados en UDrive y el visor de uno.

   El tablero guarda su definición, no los datos: cada visual se calcula al abrirlo con las funciones de la base (0269).
   El periodo y la sede son los de arriba; el corte se elige aquí porque solo importa a las fuentes por corte. */

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useContenido } from "../udrive/datos";
import { CORTES } from "./conjuntos";
import { Barras, Lineas, MapaCalor } from "./graficos";
import { medidaPorId, PLANTILLAS, type Formato, type ModeloBI, type VisualBI } from "./modelo";
import { mensajeDe, type Cobertura } from "./store";
import { cifrasDeVisual, consultaVisual, leerModelo, mejores, narrarTablero, nombreDimension, useTablerosGuardados, useVisual, type ContextoVisual, type DatosVisual, type NarracionPilo } from "./tablerosDatos";
import type { Contexto } from "./Warehouse";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

export function formatear(valor: number | null, formato: Formato | string): string {
  if (valor === null || valor === undefined) return "—";
  const n = (d: number) => valor.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (formato === "entero") return n(0);
  if (formato === "porcentaje") return `${n(1)} %`;
  if (formato === "puntos") return `${valor > 0 ? "+" : ""}${n(1)} pts`;
  return n(2);
}
const sufijoDe = (formato: string) => (formato === "porcentaje" ? " %" : formato === "puntos" ? " pts" : "");
const decimalesDe = (formato: string) => (formato === "entero" ? 0 : formato === "decimal" ? 2 : 1);

export function Tableros({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const id = ctx.params.get("tablero");
  return id ? <Visor ctx={ctx} cobertura={cobertura} id={id} /> : <Lista ctx={ctx} />;
}

/* --- La lista --------------------------------------------------------------------------------- */

function Lista({ ctx }: { ctx: Contexto }) {
  const { tableros, cargando, error } = useTablerosGuardados();
  const crear = (
    <button type="button" className="button-primary" onClick={() => ctx.ir("crear")}>
      <Icon name="plus" size={15} /> Crear tablero
    </button>
  );
  if (cargando) return <LoadingBlock rows={4} label="Buscando sus tableros" />;
  if (error) {
    const falta = /tablero|check constraint|drive_archivos/i.test(String(error));
    return <ErrorBlock error={falta ? new Error("Falta aplicar la migración 0270 (tipo «tablero» de UDrive).") : error} title="No se pudieron abrir los tableros" />;
  }
  if (!tableros.length)
    return <EmptyBlock title="Todavía no tiene tableros propios" hint="Un tablero responde una pregunta con cifras del Warehouse. Pilo Tableros puede proponerle el diseño." action={crear} />;
  return (
    <section className="wh-panel" aria-labelledby="wh-tab-h">
      <div className="wh-panel__cabeza">
        <h2 id="wh-tab-h">{tableros.length} {tableros.length === 1 ? "tablero" : "tableros"}</h2>
        {crear}
      </div>
      <div className="wh-panel__cuerpo wh-pila">
        {tableros.map((t) => (
          <button key={t.id} type="button" className="wh-fila-cat" onClick={() => ctx.ir("tableros", { tablero: t.id })}>
            <span>
              <b>{t.nombre}</b>
              <small className="wh-muted">Modificado {fecha(t.updated_at)}</small>
            </span>
            <Icon name="chevron-right" size={16} />
          </button>
        ))}
        <p className="wh-nota-chica wh-muted">Los tableros viven en UDrive: allí se comparten, se mueven y se mandan a la papelera.</p>
      </div>
    </section>
  );
}

/* --- El visor --------------------------------------------------------------------------------- */

function Visor({ ctx, cobertura, id }: { ctx: Contexto; cobertura: Cobertura[]; id: string }) {
  const q = useContenido(id);
  const modelo = useMemo(() => (q.data ? leerModelo(q.data.contenido) : null), [q.data]);
  if (q.isPending) return <LoadingBlock rows={5} label="Abriendo el tablero" />;
  if (q.error) return <ErrorBlock error={q.error} title="No se pudo abrir el tablero" onRetry={() => void q.refetch()} />;
  if (!q.data || !modelo) return <EmptyBlock title="Ese tablero no existe o no se puede ver" hint="Pudo haberse movido a la papelera o no estar compartido con usted." action={<button type="button" className="button-primary" onClick={() => ctx.ir("tableros")}>Volver a mis tableros</button>} />;
  return <TableroAbierto ctx={ctx} cobertura={cobertura} id={id} modelo={modelo} />;
}

function TableroAbierto({ ctx, cobertura, id, modelo }: { ctx: Contexto; cobertura: Cobertura[]; id: string; modelo: ModeloBI }) {
  const [pagina, setPagina] = useState(0);
  const [corte, setCorte] = useState<string | null>(null);
  const [narracion, setNarracion] = useState<NarracionPilo | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [falla, setFalla] = useState("");
  const cliente = useQueryClient();
  const actual = modelo.paginas[Math.min(pagina, modelo.paginas.length - 1)];
  const vis: ContextoVisual = { periodo: ctx.periodo, sede: ctx.sede, corte, cobertura };
  const hayCortes = modelo.fuentes.some((f) => cobertura.some((c) => c.conjunto === f && c.corte !== ""));

  const leer = async () => {
    setLeyendo(true);
    setFalla("");
    try {
      const todos = modelo.paginas.flatMap((p) => p.visuales.map((v) => ({ p: p.id, v })));
      const datos = await Promise.all(todos.filter(({ v }) => v.tipo !== "narrativa").map(async ({ p, v }) => ({ v, d: await cliente.ensureQueryData(consultaVisual(`${id}:${p}:${v.id}`, v, vis)) })));
      const visuales = datos.map(({ v, d }) => cifrasDeVisual(v, d)).filter((x): x is NonNullable<typeof x> => x !== null);
      if (!visuales.length) throw new Error("Ningún visual tiene cifras en este periodo: no hay nada que leer.");
      const r = await narrarTablero({ nombre: modelo.nombre, pregunta: modelo.pregunta, periodo: ctx.periodo, sede: ctx.sede, visuales });
      setNarracion(r.narracion);
    } catch (e) {
      setFalla(mensajeDe(e));
    } finally {
      setLeyendo(false);
    }
  };

  return (
    <div className="wh-pila">
      <section className="wh-panel">
        <div className="wh-panel__cabeza">
          <div>
            <h2>{modelo.nombre || "Tablero sin nombre"}</h2>
            {modelo.pregunta && <p className="wh-muted">{modelo.pregunta}</p>}
          </div>
          <div className="wh-fila">
            {hayCortes && (
              <label className="wh-campo">
                <span className="sr-only">Corte</span>
                <select value={corte ?? ""} onChange={(e) => setCorte(e.target.value || null)}>
                  <option value="">Corte más reciente</option>
                  {CORTES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="button-secondary" disabled={leyendo} onClick={() => void leer()}>
              {leyendo ? "Pilo está leyendo…" : "Lectura de Pilo"}
            </button>
            <button type="button" className="button-secondary" onClick={() => ctx.ir("crear", { tablero: id })}>
              Editar
            </button>
            <button type="button" className="button-secondary" onClick={() => ctx.ir("tableros")}>
              Mis tableros
            </button>
          </div>
        </div>
        {modelo.paginas.length > 1 && (
          <div className="wh-panel__cabeza wh-fila" role="tablist" aria-label="Páginas del tablero">
            {modelo.paginas.map((p, i) => (
              <button key={p.id} type="button" role="tab" className="wh-chip" aria-selected={i === pagina} aria-pressed={i === pagina} onClick={() => setPagina(i)}>
                {p.nombre}
              </button>
            ))}
          </div>
        )}
      </section>

      {falla && (
        <p className="wh-aviso wh-aviso--rojo" role="alert">
          {falla}
        </p>
      )}
      {narracion && <Narracion n={narracion} />}

      {!actual ? (
        <EmptyBlock title="Este tablero no tiene páginas" hint="Edítelo para agregarle visuales." />
      ) : (
        <>
          <p className="wh-nota-chica wh-muted">
            {PLANTILLAS[actual.plantilla]?.nombre ?? "Página"} · {ctx.periodo} · el tablero se calcula en vivo con lo guardado en el Warehouse.
          </p>
          <div className="wh-dos">
            {actual.visuales.map((v) => (
              <TarjetaVisual key={v.id} clave={`${id}:${actual.id}:${v.id}`} v={v} vis={vis} narracion={narracion} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Narracion({ n }: { n: NarracionPilo }) {
  return (
    <section className="wh-panel" aria-label="Lectura de Pilo">
      <div className="wh-panel__cabeza">
        <h2>{n.titular}</h2>
        <span className="wh-etiqueta">Lectura de Pilo</span>
      </div>
      <div className="wh-panel__cuerpo wh-pila">
        {n.parrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {n.limites.length > 0 && (
          <div>
            <h3>Lo que estos datos no permiten afirmar</h3>
            <ul>
              {n.limites.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
        {n.avisos.map((a, i) => (
          <p key={i} className="wh-aviso wh-aviso--ambar">
            {a}
          </p>
        ))}
        <p className="wh-nota-chica wh-muted">Pilo escribe sobre las cifras de arriba y no calcula nada nuevo. Compruebe lo que vaya a citar.</p>
      </div>
    </section>
  );
}

/* --- Un visual ------------------------------------------------------------------------------- */

function TarjetaVisual({ clave, v, vis, narracion }: { clave: string; v: VisualBI; vis: ContextoVisual; narracion: NarracionPilo | null }) {
  const q = useVisual(clave, v, vis);
  const ancho = v.tipo === "tabla" || v.tipo === "calor" || v.tipo === "narrativa";
  let cuerpo;
  if (v.tipo === "narrativa") {
    cuerpo = narracion ? <p>{narracion.titular}</p> : <p className="wh-muted">Pulse «Lectura de Pilo» arriba para que Pilo escriba aquí lo que muestran las cifras.</p>;
  } else if (q.isPending) cuerpo = <LoadingBlock rows={2} label="Calculando" />;
  else if (q.error) cuerpo = <ErrorBlock error={new Error(mensajeDe(q.error))} title="No se pudo calcular" onRetry={() => void q.refetch()} />;
  else cuerpo = <Dibujo v={v} d={q.data} />;
  return (
    <section className="wh-panel" style={ancho ? { gridColumn: "1 / -1" } : undefined} aria-label={v.titulo}>
      <div className="wh-panel__cabeza">
        <h3>{v.titulo}</h3>
      </div>
      <div className="wh-panel__cuerpo wh-pila">{cuerpo}</div>
    </section>
  );
}

function Dibujo({ v, d }: { v: VisualBI; d: DatosVisual }) {
  const medida0 = medidaPorId(v.medidas[0] ?? "");
  const pie = (
    <>
      {d.avisos.map((a, i) => (
        <p key={i} className="wh-aviso wh-aviso--ambar">
          {a}
        </p>
      ))}
      {d.descartados > 0 && <p className="wh-nota-chica wh-muted">{d.descartados} grupos con menos de 5 personas no se muestran.</p>}
      {medida0 && <p className="wh-nota-chica wh-muted" title={medida0.descripcion}>{medida0.receta}</p>}
    </>
  );
  const sinDatos = d.filas.length === 0 && !(d.series && d.series.some((s) => s.valores.some((x) => x !== null)));
  if (sinDatos)
    return (
      <>
        <p className="wh-muted">Sin datos para mostrar en este periodo.</p>
        {pie}
      </>
    );

  if (v.tipo === "kpi")
    return (
      <>
        <div className="wh-cifras">
          {d.encabezados.map((nombre, i) => (
            <div className="wh-cifra" key={nombre}>
              <b>{formatear(d.filas[0]?.valores[i] ?? null, d.formatos[i])}</b>
              <span>{nombre}</span>
            </div>
          ))}
        </div>
        {pie}
      </>
    );

  if (v.tipo === "lineas" && d.periodos && d.series)
    return (
      <>
        <Lineas categorias={d.periodos} series={d.series} titulo={v.titulo} sufijo={sufijoDe(d.formatos[0])} decimales={decimalesDe(d.formatos[0])} />
        {pie}
      </>
    );

  if (v.tipo === "barras") {
    const { visibles, ocultas } = mejores(d.filas, 14);
    return (
      <>
        <Barras datos={visibles.filter((f) => f.valores[0] !== null).map((f) => ({ etiqueta: f.clave.join(" · "), valor: f.valores[0] as number }))} titulo={v.titulo} sufijo={sufijoDe(d.formatos[0])} decimales={decimalesDe(d.formatos[0])} />
        {ocultas > 0 && <p className="wh-nota-chica wh-muted">Se muestran las 14 mayores; hay {ocultas} más.</p>}
        {pie}
      </>
    );
  }

  if (v.tipo === "calor") {
    const peso = (clave: string, i: number) => d.filas.filter((f) => f.clave[i] === clave).reduce((s, f) => s + Math.abs(f.valores[0] ?? 0), 0);
    const filas = [...new Set(d.filas.map((f) => f.clave[0]))].sort((a, b) => peso(b, 0) - peso(a, 0)).slice(0, 12);
    const columnas = [...new Set(d.filas.map((f) => f.clave[1]))].sort((a, b) => peso(b, 1) - peso(a, 1)).slice(0, 10);
    const valores = filas.map((fila) => columnas.map((col) => d.filas.find((f) => f.clave[0] === fila && f.clave[1] === col)?.valores[0] ?? null));
    return (
      <>
        <MapaCalor filas={filas} columnas={columnas} valores={valores} titulo={v.titulo} sufijo={sufijoDe(d.formatos[0])} decimales={decimalesDe(d.formatos[0])} />
        {pie}
      </>
    );
  }

  const { visibles, ocultas } = mejores(d.filas, 50);
  return (
    <>
      <div className="wh-tabla-envuelta">
        <table className="wh-tabla">
          <thead>
            <tr>
              {v.dimensiones.map((x) => (
                <th key={x} scope="col">
                  {nombreDimension(x)}
                </th>
              ))}
              {d.encabezados.map((h) => (
                <th key={h} scope="col" className="wh-num">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => (
              <tr key={i}>
                {f.clave.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
                {f.valores.map((x, j) => (
                  <td key={j} className="wh-num">
                    {formatear(x, d.formatos[j])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ocultas > 0 && <p className="wh-nota-chica wh-muted">Se muestran las 50 mayores; hay {ocultas} más.</p>}
      {pie}
    </>
  );
}

/* Planeación y Seguimiento · detalle de una línea, a pantalla completa (nada de cajones). Pestañas: Resumen y Evaluación y viabilidad. Las de actividades, avances y riesgos llegan en las fases 2 y 3 y no aparecen vacías. */

import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { usePs } from "./contexto";
import { PanelPresupuestoLinea } from "./vaf/PanelPresupuestoLinea";
import { DESDE_MODULO, PaginaCompleta } from "./marco/PaginaCompleta";
import { EstadoEvaluacion, InversionPorAnio, Nota, Prioridad } from "./partes";
import { CRITERIOS, VIABILIDADES, fecha, millones1, pesos, pilarCodigo, pilarNombre, porcentaje, rotuloCampus, type Linea } from "./modelo";
import { EmptyBlock } from "../../components/ui/QueryState";

const PESTANAS = [
  { id: "resumen", texto: "Resumen" },
  { id: "evaluacion", texto: "Evaluación y viabilidad" },
] as const;

const SiNo = ({ v }: { v: boolean | null }) =>
  v === null ? (
    <span className="ps-sino" data-v="vacio"><b aria-hidden="true">○</b> Sin evaluar</span>
  ) : v ? (
    <span className="ps-sino" data-v="si"><b aria-hidden="true">●</b> Sí</span>
  ) : (
    <span className="ps-sino" data-v="no"><b aria-hidden="true">—</b> No</span>
  );

function Ficha({ l }: { l: Linea }) {
  const filas: [string, ReactNode][] = [
    ["Oficina responsable", l.oficina ?? <em>Sin oficina asignada</em>],
    ["Campus", rotuloCampus(l.campus)],
    ["Pilar", `${pilarCodigo(l.pilar)} · ${pilarNombre(l.pilar)}`],
    ["Monto", l.monto === null ? "Sin monto" : `${pesos(l.monto)} (${millones1(l.monto)})`],
    ["Fuente de financiación", l.fuente ?? <em>Sin definir</em>],
    ["Inicio y fin", l.inicio && l.fin ? `${fecha(l.inicio)} a ${fecha(l.fin)}` : <em>Sin fechas</em>],
    ["Origen", l.origen ?? <em>Sin dato</em>],
    ["Clasificación", l.clasif],
  ];
  return (
    <dl className="ps-ficha">
      {filas.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

export function DetalleLinea({ id }: { id: string }) {
  const { lineas, plan, ruta } = usePs();
  const [params, setParams] = useSearchParams();
  const pestana = PESTANAS.find((p) => p.id === params.get("pestana"))?.id ?? "resumen";
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const l = lineas.find((x) => x.no === id);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Proyectos", a: ruta("proyectos") }];
  if (!l || !plan) {
    return (
      <PaginaCompleta titulo="No encuentro esa línea" migas={[...migas, { texto: "Línea" }]} regresarA={ruta("proyectos")} regresarTexto="Regresar a proyectos">
        <EmptyBlock title={`La línea «${id}» no está en la versión que se muestra`} hint="Puede ser de otra versión o la dirección está mal escrita. Vuelva a la lista de proyectos." />
      </PaginaCompleta>
    );
  }
  const anios = Array.from({ length: plan.anioFin - plan.anioIni + 1 }, (_, i) => plan.anioIni + i).map((anio) => {
    const parte = l.pct[String(anio)] ?? 0;
    return { anio, monto: (l.monto ?? 0) * parte, parte };
  });
  const hayDistribucion = anios.some((a) => a.monto > 0);
  const cambiar = (p: string) => {
    const s = new URLSearchParams(params);
    if (p === "resumen") s.delete("pestana");
    else s.set("pestana", p);
    setParams(s, { replace: true, state: DESDE_MODULO });
  };
  const alTeclear = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const sig = PESTANAS[(i + d + PESTANAS.length) % PESTANAS.length].id;
    cambiar(sig);
    refs.current[sig]?.focus();
  };
  return (
    <PaginaCompleta
      titulo={l.nombre.replace(/\.$/, "")}
      subtitulo={<>#{l.no} · {l.clasif} · versión {plan.version?.etiqueta}{plan.version?.estado === "borrador" ? " (borrador)" : ""}</>}
      migas={[...migas, { texto: `#${l.no}` }]}
      regresarA={ruta("proyectos")}
      regresarTexto="Regresar a proyectos"
      claveFoco={l.no}
      acciones={<><Prioridad valor={l.prioridad} /><EstadoEvaluacion evaluada={Boolean(l.resultado)} /></>}
    >
      <div className="ps-pestanas" role="tablist" aria-label="Secciones de la línea">
        {PESTANAS.map((p, i) => (
          <button key={p.id} ref={(el) => void (refs.current[p.id] = el)} type="button" role="tab" id={`pest-${p.id}`} aria-selected={pestana === p.id} aria-controls="pest-panel" tabIndex={pestana === p.id ? 0 : -1} onClick={() => cambiar(p.id)} onKeyDown={(e) => alTeclear(e, i)}>
            {p.texto}
          </button>
        ))}
      </div>
      <div id="pest-panel" role="tabpanel" aria-labelledby={`pest-${pestana}`} className="ps-pestana-panel">
        {pestana === "resumen" ? (
          <>
            {l.descripcion ? <p className="ps-descripcion">{l.descripcion}</p> : <Nota>Esta línea no trae descripción.</Nota>}
            <Ficha l={l} />
            <PanelPresupuestoLinea no={l.no} />
            <section className="ps-bloque">
              <h2>Inversión programada por año</h2>
              {hayDistribucion ? (
                <>
                  <InversionPorAnio datos={anios} />
                  <Nota>Millones de pesos (M): monto de la línea × su porcentaje de cada año.</Nota>
                </>
              ) : (
                <Nota>Esta línea aún no tiene distribución anual{l.resultado ? "" : " porque no se ha evaluado"}. No se calcula ni se rellena.</Nota>
              )}
            </section>
          </>
        ) : (
          <>
            <p className="ps-descripcion">
              Resultado de la evaluación: <strong>{l.resultado ?? "Sin evaluar"}</strong>.
              {l.resultado ? "" : " Los criterios y viabilidades se diligencian cuando la línea se evalúe."}
            </p>
            <div className="ps-dos">
              <section className="ps-bloque">
                <h2>Criterios de priorización</h2>
                <ul className="ps-sinos">{Object.entries(CRITERIOS).map(([k, v]) => <li key={k}>{v}<SiNo v={l.criterios[k as keyof Linea["criterios"]]} /></li>)}</ul>
              </section>
              <section className="ps-bloque">
                <h2>Viabilidad</h2>
                <ul className="ps-sinos">{Object.entries(VIABILIDADES).map(([k, v]) => <li key={k}>{v}<SiNo v={l.viabilidad[k as keyof Linea["viabilidad"]]} /></li>)}</ul>
              </section>
            </div>
            {hayDistribucion ? <Nota>Distribución anual: {anios.filter((a) => a.parte > 0).map((a) => `${a.anio} ${porcentaje(a.parte)}`).join(" · ")}.</Nota> : null}
          </>
        )}
      </div>
    </PaginaCompleta>
  );
}

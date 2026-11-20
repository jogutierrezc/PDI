/* =============================================================================
   Planeación y Seguimiento · proyectos · ALTA Y EDICIÓN DE UN PROYECTO del plan en borrador, a pantalla completa
   (`proyecto-nuevo`, `proyecto-editar/<N.º>`). Los campos y las listas salen de la plantilla del plan (columnas obligatorias,
   prioridades, fuentes, clasificaciones y pilares): las mismas reglas de la carga Excel.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { useCampus, useConfigPlan, useLineas, useOficinas, useVersiones } from "../api";
import { usePs } from "../contexto";
import { Campo, EstadoGuardado, useBorradorLocal } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { CAMPUS_TODOS, PILARES_LISTA, pesos, rotuloCampus } from "../modelo";
import { listaDeConfig, pilaresDeConfig, type ConfigPlan } from "../modeloPlanes";
import { useProyectosOps } from "./hooksProy";
import { DATOS_PROYECTO_VACIOS, camposDelPlan, datosDeLinea, esObligatorio, numeroDeTexto, puedeEditarProyectos, validarProyecto, type DatosProyecto } from "./modeloProy";

interface V extends Omit<DatosProyecto, "monto"> {
  monto: string;
}

export function FormularioProyecto({ no }: { no?: string }) {
  const { plan, planId, planes, nivel, ruta, ir } = usePs();
  const versiones = useVersiones(planId);
  const cfgQ = useConfigPlan(planId);
  const borrador = versiones.data?.find((v) => v.estado === "borrador") ?? null;
  const lineasQ = useLineas(borrador?.id ?? null);
  const campusQ = useCampus();
  const oficinasQ = useOficinas();
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Proyectos del plan", a: ruta("proyectos-plan") }, { texto: no ? "Editar proyecto" : "Agregar proyecto" }];
  const volver = ruta("proyectos-plan");
  const titulo = no ? "Editar proyecto" : "Agregar proyecto";
  if (!plan || versiones.isPending || cfgQ.isPending || (borrador && lineasQ.isPending)) return <PaginaCompleta titulo={titulo} migas={migas} regresarA={volver}><LoadingBlock rows={4} label="Preparando el formulario" /></PaginaCompleta>;
  const publicada = versiones.data?.some((v) => v.vigente) ?? false;
  const poder = planes.find((p) => p.id === planId)?.poder ?? null;
  if (!puedeEditarProyectos(nivel, poder, borrador ? "borrador" : publicada ? "publicada" : null)) {
    return <PaginaCompleta titulo={titulo} migas={migas} regresarA={volver} regresarTexto="Regresar a los proyectos del plan"><p className="ps-aviso"><Icon name="lock" size={16} /> {publicada && !borrador ? "La versión publicada no se edita." : "Crean y editan proyectos el administrador de planeación y el gestor de la oficina dueña del plan."}</p></PaginaCompleta>;
  }
  const previa = no ? lineasQ.data?.find((l) => l.no === no) : undefined;
  if (no && !previa) return <PaginaCompleta titulo={titulo} migas={migas} regresarA={volver}><p className="ps-aviso"><Icon name="alert" size={16} /> El proyecto «{no}» no está en el borrador.</p></PaginaCompleta>;
  const inicial: DatosProyecto = previa ? datosDeLinea(previa) : { ...DATOS_PROYECTO_VACIOS, oficina: plan.oficina?.nombre ?? "" };
  return <Interior key={no ?? "nuevo"} no={no} planId={plan.id} inicial={inicial} config={cfgQ.data!} campus={campusQ.data ?? ["Bucaramanga", "Valledupar", "Cúcuta"]} oficinas={(oficinasQ.data ?? []).map((o) => o.nombre)} migas={migas} volver={volver} titulo={titulo} ir={ir} ruta={ruta} />;
}

function Interior({ no, planId, inicial, config, campus, oficinas, migas, volver, titulo, ir, ruta }: { no?: string; planId: string; inicial: DatosProyecto; config: ConfigPlan; campus: string[]; oficinas: string[]; migas: { texto: string; a?: string }[]; volver: string; titulo: string; ir: (r: string, o?: { reemplazar?: boolean }) => void; ruta: ReturnType<typeof usePs>["ruta"] }) {
  const ops = useProyectosOps();
  const [v, setV] = useState<V>({ ...inicial, monto: inicial.monto === null ? "" : String(Math.round(inicial.monto)) });
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [errores, setErrores] = useState<{ campo: string; mensaje: string }[]>([]);
  const [hecho, setHecho] = useState<{ no: string; nuevo: boolean } | null>(null);
  const { guardado, descartar } = useBorradorLocal<V>(`proyecto-${planId}-${no ?? "nuevo"}`, v, (b) => setV((x) => ({ ...x, ...b })));
  const campos = camposDelPlan(config);
  const montoNum = numeroDeTexto(v.monto);
  const datos: DatosProyecto = { ...v, monto: v.monto.trim() === "" ? null : montoNum };
  const errs = useMemo(() => (v.monto.trim() !== "" && montoNum === null ? [{ campo: "pr-monto", mensaje: "El monto no es un número. Escriba solo el valor en pesos, por ejemplo 6971769559 o 6.971.769.559." }] : validarProyecto({ ...v, monto: v.monto.trim() === "" ? null : montoNum }, { config, campus, oficinas })), [v, montoNum, config, campus, oficinas]);
  const porCampo = new Map(errs.map((e) => [e.campo, e.mensaje]));
  const mostrar = (c: string) => (tocados[c] ? (porCampo.get(c) ?? null) : null);
  const salir = (c: string) => () => setTocados((t) => ({ ...t, [c]: true }));
  const poner = <K extends keyof V>(k: K, x: V[K]) => setV((s) => ({ ...s, [k]: x }));
  const pilares = pilaresDeConfig(config) ?? PILARES_LISTA;
  const lista = (k: "prioridad" | "clasif" | "fuente") => listaDeConfig(config, k);
  const obl = (c: string) => esObligatorio(config, c);

  const guardar = async () => {
    setTocados(Object.fromEntries(errs.map((e) => [e.campo, true])));
    setErrores(errs);
    if (errs.length) {
      const el = document.getElementById(errs[0].campo) as HTMLElement | null;
      el?.scrollIntoView({ block: "center" });
      el?.focus();
      return;
    }
    try {
      const l = await ops.guardar.mutateAsync({ planId, datos, no });
      descartar();
      setHecho({ no: l.no, nuevo: !no });
    } catch { /* el error se muestra arriba */ }
  };
  if (hecho) {
    return (
      <PaginaCompleta titulo={hecho.nuevo ? "Proyecto agregado" : "Cambios guardados"} migas={migas} regresarA={volver} regresarTexto="Regresar a los proyectos del plan" claveFoco="hecho">
        <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> {hecho.nuevo ? `El proyecto quedó en el borrador con el N.º ${hecho.no}.` : `El proyecto #${hecho.no} quedó actualizado.`}</p>
        <div className="ps-botones">
          <button type="button" className="button-primary" onClick={() => ir(volver)}>Ver los proyectos del plan</button>
          {hecho.nuevo ? <button type="button" className="button-secondary" onClick={() => ir(ruta("proyecto-nuevo"), { reemplazar: true })}>Agregar otro</button> : null}
        </div>
      </PaginaCompleta>
    );
  }
  return (
    <PaginaCompleta
      titulo={titulo}
      subtitulo={no ? `Proyecto #${no} del borrador` : "Se agrega al borrador del plan; se enumera solo."}
      migas={migas}
      regresarA={volver}
      regresarTexto="Regresar a los proyectos del plan"
      claveFoco={no ?? "nuevo"}
      ancho="angosto"
      pie={
        <>
          <div className="ps-pie__izq"><EstadoGuardado guardado={guardado} /></div>
          <div className="ps-pie__der">
            <button type="button" className="button-secondary" onClick={() => ir(volver)} disabled={ops.guardar.isPending}>Cancelar</button>
            <button type="button" className="button-primary" onClick={() => void guardar()} disabled={ops.guardar.isPending} aria-busy={ops.guardar.isPending || undefined}>{ops.guardar.isPending ? "Guardando…" : no ? "Guardar los cambios" : "Agregar el proyecto"}</button>
          </div>
        </>
      }
    >
      {ops.guardar.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(ops.guardar.error as Error).message}</p> : null}
      {errores.length ? (
        <div className="ps-resumen-errores" role="alert" aria-labelledby="pr-err-t">
          <strong id="pr-err-t">{errores.length === 1 ? "Hay 1 cosa por corregir" : `Hay ${errores.length} cosas por corregir`}</strong>
          <ul>{errores.map((e) => <li key={e.campo}><a href={`#${e.campo}`} onClick={(ev) => { ev.preventDefault(); (document.getElementById(e.campo) as HTMLElement | null)?.focus(); }}>{e.mensaje}</a></li>)}</ul>
        </div>
      ) : null}
      <div className="ps-campos">
        <Campo id="pr-nombre" etiqueta="Nombre del proyecto" ayuda="Qué se quiere hacer, en una frase." error={mostrar("pr-nombre")} obligatorio>
          {(p) => <input {...p} type="text" maxLength={320} value={v.nombre} onChange={(e) => poner("nombre", e.target.value)} onBlur={salir("pr-nombre")} autoComplete="off" />}
        </Campo>
        {campos.descripcion ? (
          <Campo id="pr-descripcion" etiqueta="Descripción" ayuda={`${obl("descripcion") ? "" : "Opcional. "}Qué incluye y para qué. ${v.descripcion.length}/1000`} error={mostrar("pr-descripcion")} obligatorio={obl("descripcion")}>
            {(p) => <textarea {...p} rows={4} value={v.descripcion} onChange={(e) => poner("descripcion", e.target.value)} onBlur={salir("pr-descripcion")} />}
          </Campo>
        ) : null}
        <div className="ps-campos__par">
          {campos.campus ? (
            <Campo id="pr-campus" etiqueta="Campus" error={mostrar("pr-campus")} obligatorio={obl("campus")}>
              {(p) => <select {...p} value={v.campus} onChange={(e) => poner("campus", e.target.value)} onBlur={salir("pr-campus")}><option value="">Elija uno…</option>{[...campus, CAMPUS_TODOS].map((c) => <option key={c} value={c}>{rotuloCampus(c)}</option>)}</select>}
            </Campo>
          ) : null}
          {campos.pilar ? (
            <Campo id="pr-pilar" etiqueta="Pilar" ayuda="Los pilares de este plan." error={mostrar("pr-pilar")} obligatorio={obl("pilar")}>
              {(p) => <select {...p} value={v.pilar} onChange={(e) => poner("pilar", e.target.value)} onBlur={salir("pr-pilar")}><option value="">Elija uno…</option>{pilares.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
            </Campo>
          ) : null}
        </div>
        <div className="ps-campos__par">
          {campos.monto ? (
            <Campo id="pr-monto" etiqueta="Monto solicitado (pesos)" ayuda={`Solo el número. Equivale a ${montoNum !== null ? pesos(montoNum) : "—"}.`} error={mostrar("pr-monto")} obligatorio={obl("monto")}>
              {(p) => <input {...p} type="text" inputMode="numeric" autoComplete="off" value={v.monto} onChange={(e) => poner("monto", e.target.value)} onBlur={salir("pr-monto")} />}
            </Campo>
          ) : null}
          {campos.prioridad ? (
            <Campo id="pr-prioridad" etiqueta="Prioridad" error={mostrar("pr-prioridad")} obligatorio={obl("prioridad")}>
              {(p) => <select {...p} value={v.prioridad} onChange={(e) => poner("prioridad", e.target.value)} onBlur={salir("pr-prioridad")}><option value="">Elija una…</option>{lista("prioridad").map((x) => <option key={x} value={x}>{x}</option>)}</select>}
            </Campo>
          ) : null}
        </div>
        {campos.oficina ? (
          <Campo id="pr-oficina" etiqueta="Oficina responsable" ayuda="La que lo ejecuta y reporta su avance." error={mostrar("pr-oficina")} obligatorio={obl("oficina")}>
            {(p) => <select {...p} value={v.oficina} onChange={(e) => poner("oficina", e.target.value)} onBlur={salir("pr-oficina")}><option value="">Sin asignar</option>{oficinas.map((o) => <option key={o} value={o}>{o}</option>)}</select>}
          </Campo>
        ) : null}
        <div className="ps-campos__par">
          {campos.fuente ? (
            <Campo id="pr-fuente" etiqueta="Fuente de financiación" error={mostrar("pr-fuente")} obligatorio={obl("fuente")}>
              {(p) => <select {...p} value={v.fuente} onChange={(e) => poner("fuente", e.target.value)} onBlur={salir("pr-fuente")}><option value="">{obl("fuente") ? "Elija una…" : "Sin definir"}</option>{lista("fuente").map((x) => <option key={x} value={x}>{x}</option>)}</select>}
            </Campo>
          ) : null}
          {campos.clasif ? (
            <Campo id="pr-clasif" etiqueta="Clasificación" error={mostrar("pr-clasif")} obligatorio={obl("clasif")}>
              {(p) => <select {...p} value={v.clasif} onChange={(e) => poner("clasif", e.target.value)} onBlur={salir("pr-clasif")}><option value="">{obl("clasif") ? "Elija una…" : "Sin clasificar"}</option>{lista("clasif").map((x) => <option key={x} value={x}>{x}</option>)}</select>}
            </Campo>
          ) : null}
        </div>
      </div>
      <p className="ps-nota">La evaluación (criterios, viabilidades, fechas y distribución anual) la hace la VAF cuando el plan se envía; aquí solo se registra lo que la oficina solicita.</p>
    </PaginaCompleta>
  );
}

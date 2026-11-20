/* =============================================================================
   Planeación y Seguimiento · proyectos · «ASIGNAR OFICINAS A LOS PROYECTOS» (`asignar-oficinas`, solo administrador).
   Tabla de los proyectos del plan activo con filtros (pilar, campus, solo los sin oficina), un selector de oficina por fila y la
   asignación en lote (seleccionar varios y elegir una oficina). Dice cuántos proyectos quedan sin oficina. (`ps_asignar_oficinas_lineas`)
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useOficinas } from "../api";
import { usePs } from "../contexto";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { entero, llano, millones1, pilarCodigo, pilarNombre, rotuloCampus } from "../modelo";
import { useProyectosOps } from "./hooksProy";

export function AsignarOficinas() {
  const { plan, planId, lineas, nivel, ruta } = usePs();
  const oficinasQ = useOficinas();
  const ops = useProyectosOps();
  const [pilar, setPilar] = useState("");
  const [campus, setCampus] = useState("");
  const [soloSin, setSoloSin] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loteOficina, setLoteOficina] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const oficinas = useMemo(() => oficinasQ.data ?? [], [oficinasQ.data]);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Asignar oficinas" }];
  const sin = lineas.filter((l) => !l.oficina).length;
  const filas = useMemo(() => {
    const t = llano(q);
    return lineas.filter((l) => (!pilar || l.pilar === pilar) && (!campus || l.campus === campus) && (!soloSin || !l.oficina) && (!t || llano(`${l.no} ${l.nombre}`).includes(t)));
  }, [lineas, pilar, campus, soloSin, q]);
  if (!plan) return null;
  if (nivel !== "admin") {
    return <PaginaCompleta titulo="Asignar oficinas a los proyectos" migas={migas} regresarA={ruta("proyectos")}><p className="ps-aviso"><Icon name="lock" size={16} /> Asigna las oficinas el administrador de planeación.</p></PaginaCompleta>;
  }
  const pilares = [...new Set(lineas.map((l) => l.pilar).filter(Boolean))].sort();
  const campuses = [...new Set(lineas.map((l) => l.campus).filter(Boolean))].sort();
  const idDe = (nombre: string | null) => oficinas.find((o) => llano(o.nombre) === llano(nombre ?? ""))?.id ?? "";
  const todasMarcadas = filas.length > 0 && filas.every((l) => sel.has(l.no));
  const alternar = (no: string) => setSel((s) => { const n = new Set(s); if (n.has(no)) n.delete(no); else n.add(no); return n; });
  const asignar = async (claves: string[], oficinaId: string | null) => {
    setMensaje(null);
    try {
      const r = await ops.asignar.mutateAsync({ planId: planId!, claves, oficinaId });
      const nombre = oficinas.find((o) => o.id === oficinaId)?.nombre;
      setMensaje(oficinaId ? `Se asignó ${nombre} a ${r.asignadas} ${r.asignadas === 1 ? "proyecto" : "proyectos"}.` : `Se quitó la oficina a ${r.asignadas} ${r.asignadas === 1 ? "proyecto" : "proyectos"}.`);
      setSel(new Set());
    } catch { /* el error se muestra abajo */ }
  };
  return (
    <PaginaCompleta titulo="Asignar oficinas a los proyectos" subtitulo={<>«{plan.nombre}»: la oficina responsable decide quién planifica y reporta cada proyecto.</>} migas={migas} regresarA={ruta("proyectos")} regresarTexto="Regresar a proyectos">
      <p className="ps-aviso" data-ok={sin === 0 || undefined} role="status" aria-live="polite"><Icon name={sin === 0 ? "check" : "info"} size={16} /> {sin === 0 ? "Todos los proyectos tienen oficina responsable." : <span><strong>{entero(sin)}</strong> de {entero(lineas.length)} proyectos siguen sin oficina responsable. Sin ella, nadie les planifica actividades.</span>}</p>
      {mensaje ? <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> {mensaje}</p> : null}
      {ops.asignar.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(ops.asignar.error as Error).message}</p> : null}
      <div className="ps-herramientas">
        <label className="ps-buscar"><Icon name="search" size={15} /><span className="sr-only">Buscar por nombre o número</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o N.º" /></label>
        <label className="ps-orden"><span>Pilar</span><select value={pilar} onChange={(e) => setPilar(e.target.value)}><option value="">Todos</option>{pilares.map((p) => <option key={p} value={p}>{pilarCodigo(p)} · {pilarNombre(p)}</option>)}</select></label>
        <label className="ps-orden"><span>Campus</span><select value={campus} onChange={(e) => setCampus(e.target.value)}><option value="">Todos</option>{campuses.map((c) => <option key={c} value={c}>{rotuloCampus(c)}</option>)}</select></label>
        <label className="ps-opcion"><input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} /><span>Solo sin oficina</span></label>
        <p className="ps-herramientas__n" aria-live="polite">{entero(filas.length)} {filas.length === 1 ? "proyecto" : "proyectos"}</p>
      </div>
      <div className="ps-lote" role="group" aria-label="Asignación en lote">
        <span><strong>{sel.size}</strong> {sel.size === 1 ? "seleccionado" : "seleccionados"}</span>
        <label className="ps-orden"><span>Asignar a</span><select value={loteOficina} onChange={(e) => setLoteOficina(e.target.value)}><option value="">Elija una oficina…</option>{oficinas.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>
        <button type="button" className="button-primary ps-btn-peq" disabled={sel.size === 0 || !loteOficina || ops.asignar.isPending} onClick={() => void asignar([...sel], loteOficina)}>Asignar a {sel.size || "los"} {sel.size === 1 ? "proyecto" : "proyectos"}</button>
        <button type="button" className="button-secondary ps-btn-peq" disabled={sel.size === 0 || ops.asignar.isPending} onClick={() => void asignar([...sel], null)}>Quitar la oficina</button>
      </div>
      {filas.length === 0 ? <p className="ps-vacio-linea">Ningún proyecto coincide con los filtros.</p> : (
        <div className="ps-tabla ps-tabla--asignar" role="table" aria-label="Proyectos y su oficina responsable">
          <div className="ps-tabla__fila ps-tabla__cab" role="row"><span role="columnheader"><label className="ps-opcion"><input type="checkbox" checked={todasMarcadas} onChange={() => setSel(todasMarcadas ? new Set() : new Set(filas.map((l) => l.no)))} /><span className="sr-only">Seleccionar todos los proyectos que se ven</span></label></span><span role="columnheader">Proyecto</span><span role="columnheader">Campus</span><span role="columnheader" className="ps-der">Monto</span><span role="columnheader">Oficina responsable</span></div>
          {filas.map((l) => (
            <div className="ps-tabla__fila" role="row" key={l.no} data-sel={sel.has(l.no) || undefined}>
              <span role="cell"><label className="ps-opcion"><input type="checkbox" checked={sel.has(l.no)} onChange={() => alternar(l.no)} /><span className="sr-only">Seleccionar el proyecto {l.no}</span></label></span>
              <span role="cell" className="ps-tabla__t">{l.nombre.replace(/\.$/, "")}<em>#{l.no} · {l.clasif} · {l.pilar ? pilarCodigo(l.pilar) : "sin pilar"}</em></span>
              <span role="cell" data-l="Campus">{rotuloCampus(l.campus)}</span>
              <span role="cell" className="ps-der" data-l="Monto">{l.monto === null ? "Sin monto" : millones1(l.monto)}</span>
              <span role="cell" data-l="Oficina">
                <select aria-label={`Oficina responsable del proyecto ${l.no}`} value={idDe(l.oficina)} disabled={ops.asignar.isPending} onChange={(e) => void asignar([l.no], e.target.value || null)}>
                  <option value="">{l.oficina && !idDe(l.oficina) ? `${l.oficina} (no está en el portal)` : "Sin oficina"}</option>
                  {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </span>
            </div>
          ))}
        </div>
      )}
    </PaginaCompleta>
  );
}

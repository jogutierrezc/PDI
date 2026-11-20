/* Planeación y Seguimiento · VAF · REGISTRAR UN MOVIMIENTO del libro de presupuesto, a pantalla completa (`vaf-mov/<línea>`).
   Solo la VAF (financiero) y el administrador. El libro no se edita: un error se corrige anulando el movimiento. */

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { aniosDe } from "../modelo";
import { useVafOps, usePresupuestoLinea } from "./hooksVaf";
import { AYUDA_MOV, ROTULO_MOV, TIPOS_MOV, esFinanciero, validarMovimiento, type DatosMov, type TipoMov } from "./modeloVaf";
import { Pesos } from "./partesVaf";

export function RegistrarMov({ id }: { id: string }) {
  const { ruta, ir, plan, nivel } = usePs();
  const q = usePresupuestoLinea(id);
  const ops = useVafOps();
  const hoy = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState<{ anio: string; tipo: TipoMov | ""; monto: string; fecha: string; fuente: string; referencia: string; nota: string }>({ anio: String(plan?.anioIni ?? new Date().getFullYear()), tipo: "", monto: "", fecha: hoy, fuente: "", referencia: "", nota: "" });
  const [intento, setIntento] = useState(false);
  const volver = ruta("vaf-linea", encodeURIComponent(id));
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Financiación y presupuesto", a: ruta("financiacion") }, { texto: "Línea", a: volver }, { texto: "Registrar un movimiento" }];
  if (!esFinanciero(nivel)) return <PaginaCompleta titulo="Registrar un movimiento" migas={migas} regresarA={volver}><p className="ps-aviso"><Icon name="lock" size={16} /> Registrar presupuesto es de la VAF y del administrador.</p></PaginaCompleta>;
  if (q.isPending) return <PaginaCompleta titulo="Registrar un movimiento" migas={migas} regresarA={volver}><LoadingBlock rows={3} label="Cargando" /></PaginaCompleta>;
  if (q.error || !q.data) return <PaginaCompleta titulo="Registrar un movimiento" migas={migas} regresarA={volver}><p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(q.error as Error | null)?.message ?? "Esa línea no existe."}</p></PaginaCompleta>;
  const l = q.data;
  const ini = plan?.anioIni ?? 2000;
  const fin = plan?.anioFin ?? 2100;
  const monto = v.monto.trim() === "" ? null : Number(v.monto.replace(/[.\s]/g, "").replace(",", "."));
  const datos: DatosMov = { anio: Number(v.anio), tipo: v.tipo, monto, fecha: v.fecha, fuente: v.fuente, referencia: v.referencia, nota: v.nota };
  const errs = new Map(validarMovimiento(datos, { hoy, ini, fin }).map((e) => [e.campo, e.mensaje]));
  const mostrar = (c: string) => (intento ? (errs.get(c) ?? null) : null);
  const enviar = () => { setIntento(true); const p = [...errs.keys()][0]; if (p) return void document.getElementById(p)?.focus(); ops.registrar.mutate({ lineaId: id, datos }, { onSuccess: () => ir(volver, { reemplazar: true }) }); };
  return (
    <PaginaCompleta
      titulo="Registrar un movimiento"
      subtitulo={<>Línea #{l.clave} · vigente <Pesos n={l.vigente} /> · ejecutado <Pesos n={l.ejecutado} /></>}
      migas={migas}
      regresarA={volver}
      ancho="angosto"
      pie={<><div className="ps-pie__izq"><span className="ps-guardado">El libro solo se agrega: no se edita ni se borra.</span></div><div className="ps-pie__der"><button type="button" className="button-primary" onClick={enviar} disabled={ops.registrar.isPending} aria-busy={ops.registrar.isPending || undefined}>{ops.registrar.isPending ? "Un momento…" : "Registrar el movimiento"}</button></div></>}
    >
      <div className="ps-campos">
        {ops.registrar.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(ops.registrar.error as Error).message}</p> : null}
        <Campo id="mv-tipo" etiqueta="Tipo de movimiento" ayuda={v.tipo ? AYUDA_MOV[v.tipo] : "Elija qué se registra."} error={mostrar("mv-tipo")} obligatorio>
          {(p) => <select {...p} value={v.tipo} onChange={(e) => setV((x) => ({ ...x, tipo: e.target.value as TipoMov | "" }))}><option value="">Elija una opción…</option>{TIPOS_MOV.map((t) => <option key={t} value={t}>{ROTULO_MOV[t]}</option>)}</select>}
        </Campo>
        <div className="ps-campos__par">
          <Campo id="mv-anio" etiqueta="Año" error={mostrar("mv-anio")} obligatorio>
            {(p) => <select {...p} value={v.anio} onChange={(e) => setV((x) => ({ ...x, anio: e.target.value }))}>{aniosDe(ini, Math.min(fin, ini + 30)).map((a) => <option key={a}>{a}</option>)}</select>}
          </Campo>
          <Campo id="mv-fecha" etiqueta="Fecha del movimiento" ayuda="No puede ser futura." error={mostrar("mv-fecha")} obligatorio>
            {(p) => <input {...p} type="date" max={hoy} value={v.fecha} onChange={(e) => setV((x) => ({ ...x, fecha: e.target.value }))} />}
          </Campo>
        </div>
        <Campo id="mv-monto" etiqueta="Monto (pesos)" ayuda={`Solo el número. Equivale a ${monto !== null && Number.isFinite(monto) ? `$ ${new Intl.NumberFormat("es-CO").format(monto)}` : "—"}.${v.tipo === "modificacion" ? " Una reducción va en negativo." : ""}`} error={mostrar("mv-monto")} obligatorio>
          {(p) => <input {...p} type="text" inputMode="numeric" value={v.monto} onChange={(e) => setV((x) => ({ ...x, monto: e.target.value }))} autoComplete="off" />}
        </Campo>
        <div className="ps-campos__par">
          <Campo id="mv-referencia" etiqueta="Referencia" ayuda="Opcional: RP, contrato u orden." error={mostrar("mv-referencia")}>{(p) => <input {...p} type="text" maxLength={100} value={v.referencia} onChange={(e) => setV((x) => ({ ...x, referencia: e.target.value }))} autoComplete="off" />}</Campo>
          <Campo id="mv-fuente" etiqueta="Fuente" error={mostrar("mv-fuente")}>{(p) => <input {...p} type="text" maxLength={200} value={v.fuente} onChange={(e) => setV((x) => ({ ...x, fuente: e.target.value }))} autoComplete="off" />}</Campo>
        </div>
        <Campo id="mv-nota" etiqueta="Nota" error={mostrar("mv-nota")}>{(p) => <textarea {...p} rows={3} value={v.nota} onChange={(e) => setV((x) => ({ ...x, nota: e.target.value }))} />}</Campo>
      </div>
    </PaginaCompleta>
  );
}

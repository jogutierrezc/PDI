/* =============================================================================
   Planeación y Seguimiento · Fase 3 · REVISIÓN DEL GESTOR, a pantalla completa.
     · `ColaPorValidar`: la cola «Por validar» (se incrusta en Mis tareas y en la Planificación) con
       indicador de plazo vencido y validación en lote (hasta 50, todo o nada, confirmada en línea);
     · `RevisarCola`: la misma cola como página (`revisar`);
     · `RevisarAvance`: un avance con su detalle y evidencias, para validarlo o devolverlo (`revisar/<id>`).
   Nadie valida su propio avance; si lo reportó un gestor, lo valida un administrador del módulo.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { EmptyBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO, PaginaCompleta } from "../marco/PaginaCompleta";
import { fecha } from "../modelo";
import { useAct, useActividad, useAvancesPorValidar, useValidarAvance, useValidarLote } from "./hooks";
import type { PorValidar } from "./modeloF3";
import { Banner } from "./partes";
import { BarraAvance, ChipAvance, TarjetaAvance } from "./partesF3";
import { MAX_LOTE, textoEspera, validarLote } from "./reglasF3";

/* ---------- La cola ---------- */

export function ColaPorValidar({ oficinaId, actividadId = null, titulo = "Por validar", nivel = 2 }: { oficinaId: string | null; actividadId?: string | null; titulo?: string; nivel?: 2 | 3 }) {
  const { ruta } = usePs();
  const a = useAct();
  const gestor = a.oficinas.some((o) => (oficinaId ? o.id === oficinaId : true) && o.poder === "gestor");
  const q = useAvancesPorValidar(oficinaId, gestor);
  const lote = useValidarLote();
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const filas = useMemo(() => (q.data ?? []).filter((f) => !actividadId || f.actividad.id === actividadId), [q.data, actividadId]);
  // Lo elegido que ya no está en la cola (porque otra persona lo revisó) se quita solo.
  useEffect(() => setElegidos((e) => e.filter((id) => filas.some((f) => f.avance.id === id && f.puedeValidar))), [filas]);
  const H = nivel === 3 ? "h3" : "h2";
  if (!gestor) return null;
  const validables = filas.filter((f) => f.puedeValidar);
  const vencidos = filas.filter((f) => f.vencido).length;
  const errorLote = elegidos.length ? validarLote(elegidos) : null;
  const alternar = (id: string, on: boolean) => { setConfirmando(false); setResultado(null); setElegidos((e) => (on ? [...e, id] : e.filter((x) => x !== id))); };
  const todos = (on: boolean) => { setConfirmando(false); setResultado(null); setElegidos(on ? validables.slice(0, MAX_LOTE).map((f) => f.avance.id) : []); };
  const confirmar = () => {
    lote.mutate(elegidos, {
      onSuccess: (r) => { setResultado(`Se ${r.validados === 1 ? "validó 1 avance" : `validaron ${r.validados} avances`}.${r.completadas ? ` ${r.completadas === 1 ? "1 actividad quedó «Hecha»" : `${r.completadas} actividades quedaron «Hechas»`} por llegar al 100 %.` : ""}`); setElegidos([]); setConfirmando(false); },
      onError: () => setConfirmando(false),
    });
  };

  return (
    <section className="ps-cola" aria-labelledby="ps-cola-h" data-vacia={filas.length === 0 || undefined}>
      <div className="ps-seccion__cab">
        <H id="ps-cola-h">{titulo} <b className="ps-cubo__n" aria-label={`${filas.length} avances`}>{filas.length}</b></H>
        <p className="ps-sub">
          {q.isPending ? "Buscando avances esperando revisión…" : filas.length === 0 ? "No hay avances esperando su revisión." : <>Avances que reportó su equipo y esperan su revisión, el más antiguo primero.{vencidos ? <> <strong className="ps-venc"><Icon name="alert" size={13} /> {vencidos} con el plazo de validación vencido.</strong></> : null}</>}
        </p>
      </div>
      {q.error ? <Banner tipo="error" rol="alert">No se pudo leer la cola: {(q.error as Error).message}</Banner> : null}
      {resultado ? <Banner tipo="ok" rol="status">{resultado}</Banner> : null}
      {lote.error ? <Banner tipo="error" rol="alert"><strong>No se validó ninguno.</strong> {(lote.error as Error).message}</Banner> : null}
      {q.isPending ? <LoadingBlock rows={2} label="Cargando la cola" /> : filas.length ? (
        <>
          <div className="ps-cola__barra">
            <label className="ps-opcion"><input type="checkbox" checked={validables.length > 0 && elegidos.length >= Math.min(validables.length, MAX_LOTE)} disabled={!validables.length} onChange={(e) => todos(e.target.checked)} /><span>Elegir todos los que puedo validar{validables.length > MAX_LOTE ? ` (los primeros ${MAX_LOTE})` : ""}</span></label>
            <span className="ps-nota" aria-live="polite">{elegidos.length ? `${elegidos.length} elegido${elegidos.length === 1 ? "" : "s"}` : "Ninguno elegido"}</span>
            <button type="button" className="button-primary" disabled={!elegidos.length || Boolean(errorLote) || lote.isPending} onClick={() => setConfirmando(true)}>Validar los elegidos…</button>
          </div>
          {confirmando ? (
            <div className="ps-aviso ps-aviso--info" role="alert">
              <Icon name="info" size={16} />
              <div>
                <strong>¿Validar {elegidos.length} {elegidos.length === 1 ? "avance" : "avances"}?</strong> Es todo o nada: si uno no se puede validar, no se valida ninguno. Los que están al 100 % dejan la actividad «Hecha».
                <div className="ps-botones">
                  <button type="button" className="button-primary" onClick={confirmar} disabled={lote.isPending} aria-busy={lote.isPending || undefined}>{lote.isPending ? "Validando…" : "Sí, validarlos"}</button>
                  <button type="button" className="button-secondary" onClick={() => setConfirmando(false)} disabled={lote.isPending}>Cancelar</button>
                </div>
              </div>
            </div>
          ) : null}
          <ul className="ps-cola__lista">
            {filas.map((f) => <FilaCola key={f.avance.id} f={f} elegido={elegidos.includes(f.avance.id)} onElegir={(on) => alternar(f.avance.id, on)} revisar={ruta("revisar", f.avance.id)} />)}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function FilaCola({ f, elegido, onElegir, revisar }: { f: PorValidar; elegido: boolean; onElegir: (on: boolean) => void; revisar: string }) {
  const { ruta } = usePs();
  const { avance: v, actividad: x } = f;
  return (
    <li className="ps-cola__fila" data-vencido={f.vencido || undefined}>
      <label className="ps-cola__marca">
        <input type="checkbox" checked={elegido} disabled={!f.puedeValidar} onChange={(e) => onElegir(e.target.checked)} />
        <span className="sr-only">Elegir el avance de {v.reportadoPor.nombre} en «{x.titulo}»</span>
      </label>
      <div className="ps-cola__t">
        <Link to={ruta("actividad", x.id)} state={DESDE_MODULO}>{x.titulo}</Link>
        <em>{x.oficina ? `${x.oficina} · ` : ""}reportó {v.reportadoPor.nombre}{x.fin ? ` · fecha límite ${fecha(x.fin)}` : ""}</em>
        <p className="ps-cola__nota">{v.nota}</p>
        {!f.puedeValidar ? <p className="ps-nota"><Icon name="lock" size={13} /> Lo valida otra persona: no puede validar el propio avance, y el de un gestor lo valida un administrador.</p> : null}
      </div>
      <div className="ps-cola__d">
        <BarraAvance avance={{ fisico: v.fisico, financiero: v.financiero, validadoEn: null, pendientes: 0 }} compacta etiqueta="Avance reportado" />
        <span className="ps-cola__espera" data-vencido={f.vencido || undefined}><Icon name={f.vencido ? "alert" : "clock"} size={13} /> Espera {textoEspera(f.horasEsperando)}{f.vencido ? " · plazo vencido" : ""}</span>
        {v.evidencias.length ? <span className="ps-cola__ev"><Icon name="document" size={13} /> {v.evidencias.length} {v.evidencias.length === 1 ? "evidencia" : "evidencias"}</span> : <span className="ps-cola__ev">Sin evidencias</span>}
      </div>
      <Link className="button-primary ps-btn-peq" to={revisar} state={DESDE_MODULO}>Revisar<span className="sr-only"> el avance de «{x.titulo}»</span></Link>
    </li>
  );
}

/* ---------- Página de la cola ---------- */

export function RevisarCola() {
  const { ruta } = usePs();
  const a = useAct();
  const [params] = useSearchParams();
  const actividad = params.get("actividad");
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Por validar" }];
  if (a.cargando) return <PaginaCompleta titulo="Avances por validar" migas={migas} regresarA={ruta("mis-tareas")}><LoadingBlock rows={3} label="Cargando" /></PaginaCompleta>;
  if (!a.oficinas.some((o) => o.poder === "gestor")) return <PaginaCompleta titulo="Avances por validar" migas={migas} regresarA={ruta("mis-tareas")}><Banner><Icon name="lock" size={14} /> Validar avances es del gestor de la oficina.</Banner></PaginaCompleta>;
  return (
    <PaginaCompleta titulo="Avances por validar" subtitulo={actividad ? "De una actividad." : "De todas las oficinas en las que usted es gestor."} migas={migas} regresarA={ruta("mis-tareas")}>
      <ColaPorValidar oficinaId={null} actividadId={actividad} titulo="Esperando su revisión" nivel={2} />
    </PaginaCompleta>
  );
}

/* ---------- Un avance ---------- */

export function RevisarAvance({ id }: { id: string }) {
  const { ruta, ir } = usePs();
  const a = useAct();
  const q = useAvancesPorValidar(null, a.oficinas.some((o) => o.poder === "gestor"));
  const validar = useValidarAvance();
  const f = (q.data ?? []).find((x) => x.avance.id === id) ?? null;
  const det = useActividad(f?.actividad.id ?? null);
  const [nota, setNota] = useState("");
  const [hecho, setHecho] = useState<"validado" | null>(null);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Por validar", a: ruta("revisar") }, { texto: "Revisar avance" }];
  const volver = ruta("revisar");
  if (a.cargando || q.isPending || (f && det.isPending)) return <PaginaCompleta titulo="Revisar avance" migas={migas} regresarA={volver}><LoadingBlock rows={4} label="Cargando el avance" /></PaginaCompleta>;
  if (!f) {
    return (
      <PaginaCompleta titulo="Revisar avance" migas={migas} regresarA={volver} regresarTexto="Regresar a la cola">
        <EmptyBlock title="Este avance ya no espera revisión" hint="Puede que otra persona lo haya validado o devuelto, o que no sea de una oficina en la que usted es gestor." />
      </PaginaCompleta>
    );
  }
  const { avance: v, actividad: x } = f;
  const ultimo = det.data?.actividad.avance.fisico ?? 0;
  const baja = v.fisico < ultimo;
  const otros = (det.data?.avances ?? []).filter((z) => z.id !== v.id);

  if (hecho) {
    return (
      <PaginaCompleta titulo="Se validó el avance" migas={migas} regresarA={volver} regresarTexto="Regresar a la cola" claveFoco="hecho">
        <Banner tipo="ok" rol="status">El avance de {v.fisico} % de {v.reportadoPor.nombre} quedó <strong>validado</strong>.{v.fisico >= 100 ? " La actividad quedó «Hecha»." : " La actividad vuelve a «En curso»."} Se le avisa a quien lo reportó.</Banner>
        <div className="ps-botones">
          <button type="button" className="button-primary" onClick={() => ir(volver, { reemplazar: true })}>Seguir con la cola</button>
          <button type="button" className="button-secondary" onClick={() => ir(ruta("actividad", x.id))}>Ver la actividad</button>
        </div>
      </PaginaCompleta>
    );
  }
  return (
    <PaginaCompleta
      titulo="Revisar avance"
      subtitulo={<>«{x.titulo}»{x.oficina ? ` · ${x.oficina}` : ""}</>}
      migas={migas}
      regresarA={volver}
      claveFoco={v.id}
      ancho="angosto"
      acciones={<Link className="button-secondary" to={ruta("actividad", x.id)} state={DESDE_MODULO}>Abrir la actividad</Link>}
    >
      <div className="ps-bloques">
        <div className="ps-fila-act ps-fila-act--ficha">
          <ChipAvance estado="pendiente" vencido={f.vencido} />
          <span className="ps-plazo" data-p={f.vencido ? "vencida" : undefined}><Icon name={f.vencido ? "alert" : "clock"} size={13} /> Espera {textoEspera(f.horasEsperando)}{f.vencido ? " · plazo de validación vencido" : ""}</span>
        </div>
        <section aria-labelledby="rv-avance"><h2 id="rv-avance">Lo que reportó {v.reportadoPor.nombre}</h2><TarjetaAvance a={v} /></section>
        <dl className="ps-ficha">
          <div><dt>Avance validado hasta ahora</dt><dd><BarraAvance avance={{ fisico: ultimo, financiero: det.data?.actividad.avance.financiero ?? null, validadoEn: null, pendientes: 0 }} compacta /></dd></div>
          <div><dt>Si lo valida</dt><dd>{v.fisico >= 100 ? "La actividad pasa a «Hecha»." : "La actividad vuelve a «En curso» (o sigue «En riesgo» si tiene un riesgo Crítico o Alto abierto)."}</dd></div>
        </dl>
        {otros.length ? (
          <details className="ps-plegable">
            <summary>Avances anteriores de esta actividad ({otros.length})</summary>
            <div className="ps-avances">{otros.map((z) => <TarjetaAvance key={z.id} a={z} />)}</div>
          </details>
        ) : null}
        {baja ? <Banner tipo="error" rol="alert">El avance reportado ({v.fisico} %) es menor al último validado ({ultimo} %): no se puede validar. Devuélvalo con una nota para que se corrija.</Banner> : null}
        {!f.puedeValidar ? <Banner><Icon name="lock" size={14} /> No puede validar este avance: nadie valida el propio, y el de un gestor lo valida un administrador del módulo.</Banner> : null}
        {validar.error ? <Banner tipo="error" rol="alert">{(validar.error as Error).message}</Banner> : null}
        {f.puedeValidar ? (
          <section className="ps-bloque" aria-labelledby="rv-decidir">
            <h2 id="rv-decidir">Su decisión</h2>
            <div className="ps-campo">
              <label htmlFor="rv-nota">Nota para quien lo reportó <span className="ps-opcional">(opcional al validar)</span></label>
              <textarea id="rv-nota" rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />
            </div>
            <div className="ps-botones">
              <button type="button" className="button-primary" disabled={validar.isPending || baja} aria-busy={validar.isPending || undefined} onClick={() => validar.mutate({ id: v.id, nota }, { onSuccess: () => setHecho("validado") })}><Icon name="check" size={15} /> {validar.isPending ? "Un momento…" : "Validar este avance"}</button>
              <Link className="button-secondary" to={`${ruta("devolver", x.id)}?avance=${encodeURIComponent(v.id)}`} state={DESDE_MODULO}>Devolver con una nota…</Link>
            </div>
          </section>
        ) : (
          <div className="ps-botones"><Link className="button-secondary" to={volver} state={DESDE_MODULO}>Regresar a la cola</Link></div>
        )}
        <ListaEvidenciasNota n={v.evidencias.length} />
      </div>
    </PaginaCompleta>
  );
}

function ListaEvidenciasNota({ n }: { n: number }) {
  return n === 0 ? <p className="ps-nota">Este avance no trae evidencias. Si le hacen falta para validarlo, devuélvalo pidiéndolas.</p> : null;
}


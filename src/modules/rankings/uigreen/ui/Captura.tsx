/* =============================================================================
   UI GreenMetric · la ficha de un indicador: captura, traducción, datos y
   gráficas, evidencias, comentarios, historial y revisión. El borrador vive aquí
   y se guarda con «Guardar avance»; nada se anima al teclear.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { useGuardarCaptura, useGuardarTraducciones, useVinculos } from "../datos";
import { aNumero, calcularPregunta, formatearNumero, puntosEstimados, textoDelCalculo } from "../lib/calculo";
import { codigoConPunto, nombreArchivoPlantilla } from "../lib/catalogo";
import { CAMINO, ETIQUETA_ESTADO, indiceEnCamino, puedeEditar } from "../lib/estados";
import type { CapturaUgm, FilaTabla, RespuestaUgm } from "../lib/tipos";
import { Alerta, Estado, Vacio, entrar, fechaCorta, hace, textoVence } from "./comunes";
import { useUgm } from "./contexto";
import { DatosGraficas } from "./DatosGraficas";
import { Evidencias } from "./Evidencias";
import { Comentarios, Historial, PanelFlujo, ParaEnviar } from "./Flujo";
import { Formulario, TextosEs } from "./Formulario";
import type { Borrador, Cambiar } from "./Formulario";
import { PublicarIndicador } from "./Publicacion";
import { Traduccion } from "./Traduccion";

const baseDe = (r: RespuestaUgm): Borrador => ({ valores: r.valores ?? {}, textos_es: r.textos_es ?? {}, textos_en: r.textos_en ?? {}, tablas: r.tablas ?? {}, tablas_en: r.tablas_en ?? {}, opcion: r.opcion });

export function Captura({ q }: { q: string }) {
  const u = useUgm();
  const r = u.porQ.get(q);
  const p = u.pregQ.get(q);
  if (!r || !p) {
    return (
      <div className="ugm-pila">
        <Vacio>El indicador {q} no existe en este ciclo o no tiene acceso a él.</Vacio>
        <button type="button" className="ugm-btn" onClick={() => u.abrir(null)}>
          Volver
        </button>
      </div>
    );
  }
  return <Ficha r={r} q={q} />;
}

function Ficha({ r, q }: { r: RespuestaUgm; q: string }) {
  const u = useUgm();
  const p = u.pregQ.get(q)!;
  const actor = u.actorEn(q);
  const editable = puedeEditar(r.estado, actor);
  const vinculos = useVinculos(r.id);
  const guardarCaptura = useGuardarCaptura();
  const guardarTrad = useGuardarTraducciones();
  const [b, setB] = useState<Borrador>(() => baseDe(r));
  const [sucio, setSucio] = useState(false);
  const [idioma, setIdioma] = useState<"es" | "en">("es");
  const sucioRef = useRef(false);
  const raiz = useRef<HTMLDivElement>(null);
  sucioRef.current = sucio;

  const cambiar: Cambiar = useCallback((f) => {
    setB(f);
    setSucio(true);
  }, []);
  useEffect(() => {
    if (!sucioRef.current) setB(baseDe(r));
  }, [r]);
  useEffect(() => entrar(raiz.current, ":scope > header, :scope > div > section, :scope > div > aside > section"), [q]);
  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sucio]);

  const calculo = useMemo(() => {
    if (!p.esquema.calculo) return null;
    const todas = Object.fromEntries(u.respuestas.map((x) => [x.q, x.q === q ? { ...x, valores: b.valores, tablas: b.tablas, opcion: b.opcion } : x]));
    return calcularPregunta(p, todas[q], todas);
  }, [p, u.respuestas, q, b.valores, b.tablas, b.opcion]);

  const guardar = useCallback(async (): Promise<boolean> => {
    if (!editable) return true;
    const valores = { ...b.valores };
    for (const c of p.esquema.campos) if (c.tipo === "numero") valores[c.k] = aNumero(valores[c.k]);
    const tablas: Record<string, FilaTabla[]> = {};
    for (const t of p.esquema.tablas) {
      tablas[t.k] = (b.tablas[t.k] ?? []).map((f) => Object.fromEntries(t.columnas.map((c) => [c.k, c.tipo === "numero" ? aNumero(f[c.k]) : (f[c.k] ?? "")])));
    }
    const derivada = !!calculo && calculo.opcion !== null;
    const captura: CapturaUgm = {
      valores,
      tablas,
      textos_es: b.textos_es,
      textos_en: b.textos_en,
      tablas_en: b.tablas_en,
      opcion: derivada ? calculo!.opcion : b.opcion,
      opcion_calculada: derivada,
      calculo: calculo ? { valor: calculo.valor, unidad: calculo.unidad, texto: textoDelCalculo(calculo), entradas: calculo.entradas, faltan: calculo.faltan } : {},
    };
    // El inglés que la persona cambió a mano queda como borrador «humano» hasta que lo revise.
    const items: { campo: string; en?: string; filas?: FilaTabla[]; origen: "humano" }[] = [];
    for (const c of p.esquema.campos) {
      const nuevo = (b.textos_en[c.k] ?? "").trim();
      if (c.traducible && nuevo && nuevo !== (r.textos_en[c.k] ?? "").trim()) items.push({ campo: c.k, en: nuevo, origen: "humano" });
    }
    for (const t of p.esquema.tablas) {
      if (b.tablas_en[t.k] && JSON.stringify(b.tablas_en[t.k]) !== JSON.stringify(r.tablas_en[t.k] ?? null)) items.push({ campo: `tabla:${t.k}`, filas: b.tablas_en[t.k], origen: "humano" });
    }
    const ok = await u.hacer(async () => {
      await guardarCaptura.mutateAsync({ ciclo: u.ciclo.id, id: r.id, captura });
      if (items.length) await guardarTrad.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, items });
    }, "Avance guardado.");
    if (ok) setSucio(false);
    return ok;
  }, [editable, b, p, calculo, r, u, guardarCaptura, guardarTrad]);

  const volver = () => {
    if (sucio && !window.confirm("Hay cambios sin guardar. ¿Salir sin guardarlos?")) return;
    u.abrir(null);
  };

  const cat = u.categorias.find((c) => c.categoria === p.categoria);
  const resp = u.responsableDe(q);
  const rev = u.revisorDe(p.categoria);
  const paso = indiceEnCamino(r.estado);
  const pts = u.esAdmin ? puntosEstimados(p, calculo?.opcion ?? b.opcion) : null;

  return (
    <div ref={raiz} className="ugm-ficha">
      <header className="ugm-ficha__cab">
        <button type="button" className="ugm-btn ugm-btn--sm" onClick={volver}>
          <Icon name="arrow-left" size={16} /> Volver
        </button>
        <div>
          <h2>
            <span className="ugm-num ugm-cod">{p.q}</span> {p.nombre_es}
          </h2>
          <p className="ugm-muted" lang="en">
            {p.nombre_en}
          </p>
          <p className="ugm-meta">
            <Estado estado={r.estado} />
            <span>
              {cat?.categoria} · {cat?.nombre_es}
              {p.indicador ? ` · ${codigoConPunto(p.indicador)}` : ""}
            </span>
            <span>Responsable: {resp ? `${u.nombre(resp.usuario_id)}${resp.unidad_id ? ` (${u.oficina(resp.unidad_id)})` : ""}` : "sin asignar"}</span>
            <span>Revisor: {rev ? u.nombre(rev.usuario_id) : "sin asignar"}</span>
            <span>{u.vence(q) ? `Entrega ${fechaCorta(u.vence(q))} · ${textoVence(u.vence(q))}` : "Sin fecha de entrega"}</span>
            <span className="ugm-num">Versión {r.version}</span>
          </p>
          <ol className="ugm-camino" aria-label="Avance del flujo">
            {CAMINO.map((e, i) => (
              <li key={e} aria-current={i === paso ? "step" : undefined} className={i < paso ? "ugm-camino--hecho" : i === paso ? "ugm-camino--ahora" : ""}>
                {ETIQUETA_ESTADO[e]}
              </li>
            ))}
          </ol>
        </div>
      </header>

      {r.estado === "devuelto" && r.nota_revision && <Alerta tipo="aviso"><strong>Devuelto con comentarios:</strong> {r.nota_revision}</Alerta>}
      {r.para_actualizar && <Alerta tipo="info">Esta respuesta viene del ciclo anterior. Revise los datos y actualícelos.</Alerta>}
      {!editable && <Alerta tipo="info">Solo lectura: {r.estado === "aprobado" ? "ya está aprobado." : r.estado === "enviado" || r.estado === "en_revision" ? "está en revisión." : "su papel aquí no permite editar."}</Alerta>}

      <div className="ugm-cols ugm-cols--ficha">
        <div className="ugm-capcol">
          <section className="ugm-sec">
            <h3>Dato</h3>
            <p className="ugm-muted ugm-peq">La plantilla pide: {p.nombre_en}.</p>
            <Formulario p={p} b={b} cambiar={cambiar} editable={editable} vinculos={vinculos.data ?? []} calculo={calculo} esAdmin={u.esAdmin} anioDatos={u.ciclo.anio_datos} />
          </section>

          <section className="ugm-sec">
            <h3>Descripción</h3>
            <div className="ugm-tabs ugm-tabs--idioma" role="tablist" aria-label="Idioma de la descripción">
              {(["es", "en"] as const).map((k) => (
                <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={idioma === k} aria-controls="panel-idioma" className="ugm-tab" onClick={() => setIdioma(k)}>
                  {k === "es" ? "Español" : "English"}
                </button>
              ))}
            </div>
            <div id="panel-idioma" role="tabpanel" aria-labelledby={`tab-${idioma}`} className="ugm-form">
              {idioma === "es" ? <TextosEs p={p} b={b} cambiar={cambiar} editable={editable} /> : <Traduccion p={p} r={r} b={b} cambiar={cambiar} editable={editable} sucio={sucio} guardar={guardar} />}
            </div>
          </section>

          <section className="ugm-sec">
            <h3>Datos y gráficas</h3>
            <DatosGraficas r={r} p={p} editable={editable} />
          </section>

          <section className="ugm-sec">
            <h3>Evidencias {p.requiere_evidencia ? <span className="ugm-etq ugm-etq--aviso">Obligatoria</span> : null}</h3>
            <Evidencias r={r} p={p} editable={editable} />
          </section>

          <section className="ugm-sec">
            <h3>Comentarios</h3>
            <Comentarios r={r} puede={actor !== null} />
          </section>
        </div>

        <aside className="ugm-lateral">
          <section className="ugm-sec">
            <h3>Para poder enviar</h3>
            <ParaEnviar r={r} sucio={sucio} />
          </section>
          <section className="ugm-sec">
            <h3>Acciones</h3>
            <PanelFlujo r={r} p={p} actor={actor} guardar={guardar} sucio={sucio} publicada={r.publicar_web} />
          </section>
          {u.esAdmin && p.puntos ? (
            <section className="ugm-sec">
              <h3>Puntaje estimado</h3>
              {pts !== null ? (
                <p className="ugm-num ugm-grande">
                  {formatearNumero(pts, 0)} <span>de {p.puntos}</span>
                </p>
              ) : (
                <p className="ugm-muted">Se calcula cuando haya una opción elegida. Vale {p.puntos} puntos.</p>
              )}
              <p className="ugm-muted ugm-peq">Es interno y no es el puntaje oficial: lo asigna UI GreenMetric al revisar el envío (guía, p. 53).</p>
            </section>
          ) : null}
          {u.esAdmin && (
            <section className="ugm-sec">
              <h3>Publicar en la web</h3>
              <PublicarIndicador r={r} />
            </section>
          )}
          <section className="ugm-sec">
            <h3>Plantilla oficial</h3>
            <p className="ugm-peq ugm-romper">{nombreArchivoPlantilla(p) ?? "Esta pregunta no tiene plantilla: va en la hoja de datos para el sistema en línea."}</p>
            <p className="ugm-muted ugm-peq">Se llena al exportar. Mientras tanto el trabajo se hace en este formulario.</p>
          </section>
          <section className="ugm-sec">
            <h3>Historial</h3>
            <Historial r={r} p={p} />
            <p className="ugm-muted ugm-peq">Última edición {hace(r.updated_at)}.</p>
          </section>
        </aside>
      </div>

      {editable && (
        <div className="ugm-guardar" role="region" aria-label="Guardar el avance">
          <span className={sucio ? "ugm-falta" : "ugm-muted"} aria-live="polite">
            {sucio ? "Hay cambios sin guardar" : "Todo guardado"}
          </span>
          <button type="button" className="ugm-btn ugm-btn--pri" disabled={!sucio || guardarCaptura.isPending} onClick={() => void guardar()}>
            <Icon name="check" size={16} /> {guardarCaptura.isPending ? "Guardando…" : "Guardar avance"}
          </button>
        </div>
      )}
    </div>
  );
}

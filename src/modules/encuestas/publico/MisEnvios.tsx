/* =============================================================================
   Encuestas con Pilo · «Mis envíos».

   El historial de quien ya envió algo con su correo confirmado por Microsoft:
   cada envío con su fecha, su tipo y cómo va (recibido → revisado → en el
   video), con el detalle al abrirlo. Mientras siga «recibido» se puede quitar;
   los aportes con cifras se pueden copiar para enviar uno parecido. Todo lo lee
   la función `encuestas` con el pase firmado, así que cada quien ve solo lo suyo.

   Aquí no hay modelo de IA ni voz: Pilo resume en su globo lo que se ve.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { misEnvios, quitarEnvio, sesionVencida } from "../api";
import type { AporteEnvio, CifraHist, EnvioHist, TipoEnvio } from "../tipos";
import { sinMovimiento } from "./habla";
import type { DecirGuia } from "./tipos-pub";

const EASE = "power3.out";
const ETAPAS = ["Recibido", "Revisado", "En el video"] as const;

const mesDe = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", month: "long", year: "numeric" }).format(new Date(iso));
const cuando = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const textoTipo = (t: TipoEnvio) => (t === "logro" ? "Logro" : t === "reto" ? "Reto" : "Respuesta");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const numero = (c: CifraHist) => `${c.unidad === "$" ? "$" : ""}${new Intl.NumberFormat("es-CO").format(c.valor)}${c.unidad === "%" ? "%" : ""}`;

const claveMis = (slug: string, pase: string, alcance: "esta" | "todas") => ["encuestas", "mis", slug, pase, alcance] as const;

/** Cuántos envíos lleva esta persona en esta encuesta (para el número del acceso). Undefined mientras carga o si falla. */
export function useConteoEnvios(slug: string, pase: string | null): number | undefined {
  const q = useQuery({ queryKey: claveMis(slug, pase ?? "", "esta"), queryFn: () => misEnvios(slug, pase ?? "", "esta"), enabled: pase !== null, retry: false, staleTime: 30_000 });
  return q.data?.length;
}

/** El acceso al historial: se pone junto a la cuenta confirmada. */
export function AccesoMisEnvios({ slug, pase, onAbrir }: { slug: string; pase: string | null; onAbrir: () => void }) {
  const n = useConteoEnvios(slug, pase);
  if (n === undefined || n === 0) return null;
  return (
    <button type="button" className="ep-mis-acceso" onClick={onAbrir}>
      <span>
        <b>Mis envíos</b>
        <small>Lo que ya envió y cómo va cada uno.</small>
      </span>
      <span className="ep-mis-num">{n}</span>
    </button>
  );
}

function Traza({ etapa }: { etapa: 1 | 2 | 3 }) {
  return (
    <div className="ep-mis-estado" role="img" aria-label={`Estado: ${ETAPAS[etapa - 1]}`}>
      <div className="ep-mis-traza" aria-hidden="true">
        <span className="p on" />
        <span className="t" style={{ ["--w" as string]: etapa >= 2 ? 1 : 0 }} />
        <span className={etapa >= 2 ? "p on" : "p"} />
        <span className="t" style={{ ["--w" as string]: etapa >= 3 ? 1 : 0 }} />
        <span className={etapa >= 3 ? "p on" : "p"} />
      </div>
      <div className="ep-mis-nom" aria-hidden="true">
        {ETAPAS.map((n, i) => (
          <span key={n} className={i < etapa ? "on" : undefined}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function Fila({ envio, abierto, onAlternar, onQuitar, quitando, onCopiar, mostrarEncuesta }: { envio: EnvioHist; abierto: boolean; onAlternar: () => void; onQuitar: () => void; quitando: boolean; onCopiar?: (a: AporteEnvio) => void; mostrarEncuesta: boolean }) {
  const cuerpo = useRef<HTMLDivElement>(null);
  const primera = useRef(true);
  const [confirmar, setConfirmar] = useState(false);

  useLayoutEffect(() => {
    const el = cuerpo.current;
    if (!el) return;
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (!abierto) setConfirmar(false);
    if (sinMovimiento()) {
      el.style.height = abierto ? "auto" : "0px";
      return;
    }
    gsap.killTweensOf(el);
    gsap.to(el, { height: abierto ? "auto" : 0, duration: abierto ? 0.28 : 0.2, ease: abierto ? EASE : "power2.in" });
    if (abierto && el.firstElementChild) gsap.from(el.firstElementChild.children, { autoAlpha: 0, y: 6, duration: 0.25, ease: EASE, stagger: 0.05, delay: 0.05, clearProps: "opacity,visibility,transform" });
  }, [abierto]);

  const idCuerpo = `ep-mis-${envio.id}`;
  return (
    <li className="ep-mis-rec">
      <button type="button" aria-expanded={abierto} aria-controls={idCuerpo} onClick={onAlternar}>
        <span>
          <span className="ep-mis-tit">{envio.titulo}</span>
          <span className="ep-mis-meta">
            {envio.tipos.map((t) => (
              <span key={t} className={`ep-tag ${t === "respuesta" ? "" : `ep-tag--${t}`}`.trim()} data-t={t}>
                {textoTipo(t)}
              </span>
            ))}
            <span className="ep-mis-cuando">{cuando(envio.creado)}</span>
            {mostrarEncuesta && envio.encuesta.titulo && <span>{envio.encuesta.titulo}</span>}
          </span>
        </span>
        <Traza etapa={envio.etapa} />
      </button>
      <div className="ep-mis-cuerpo" id={idCuerpo} ref={cuerpo} role="region" aria-label={`Detalle de ${envio.titulo}`} style={{ height: 0 }} inert={!abierto}>
        <div>
          {envio.items.map((it, i) => (
            <div key={i} className="ep-mis-item">
              {(envio.items.length > 1 || envio.origen === "respuesta") && (
                <p className="ep-mis-item__t">
                  <span className={`ep-tag ep-tag--${it.tipo}`}>{textoTipo(it.tipo)}</span> {it.titulo}
                </p>
              )}
              {it.descripcion && <p>{it.descripcion}</p>}
              {it.cifras.length > 0 ? (
                <div className="ep-mis-cifras">
                  {it.cifras.map((c, k) => (
                    <div key={k} className="ep-mis-cifra">
                      <b>{numero(c)}</b>
                      {c.que}
                      {c.unidad && c.unidad !== "%" && c.unidad !== "$" ? ` (${c.unidad})` : ""}
                    </div>
                  ))}
                </div>
              ) : (
                envio.origen === "aporte" && <p className="ep-fino">Este envío no lleva cifras.</p>
              )}
            </div>
          ))}
          {envio.lineas.length > 0 && (
            <dl className="ep-mis-lineas">
              {envio.lineas.map((l, i) => (
                <div key={i}>
                  <dt>{l.etiqueta}</dt>
                  <dd>{l.texto}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="ep-acciones">
            {envio.copiable && onCopiar && (
              <button type="button" className="ep-btn" onClick={() => onCopiar(envio.copiable as AporteEnvio)}>
                Enviar uno parecido
              </button>
            )}
            {envio.quitable ? (
              confirmar ? (
                <>
                  <span className="ep-fino">¿Quitarlo? No se puede deshacer.</span>
                  <button type="button" className="ep-btn ep-btn--suave" onClick={() => setConfirmar(false)}>
                    No
                  </button>
                  <button type="button" className="ep-btn ep-mis-peligro" disabled={quitando} onClick={onQuitar}>
                    {quitando ? "Quitando…" : "Sí, quitar"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="ep-btn ep-mis-peligro" onClick={() => setConfirmar(true)}>
                    Quitar
                  </button>
                  <span className="ep-fino">Se puede quitar hasta que lo revisen.</span>
                </>
              )
            ) : (
              <span className="ep-fino">Ya lo revisaron, ya no se puede quitar.</span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function MisEnvios({ slug, pase, correo, onVolver, onSesionVencida, onCopiar, decir }: { slug: string; pase: string; correo: string; onVolver: () => void; onSesionVencida: () => void; onCopiar?: (a: AporteEnvio) => void; decir: DecirGuia }) {
  const cliente = useQueryClient();
  const [tipo, setTipo] = useState<TipoEnvio | "todos">("todos");
  const [alcance, setAlcance] = useState<"esta" | "todas">("esta");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const q = useQuery({ queryKey: claveMis(slug, pase, alcance), queryFn: () => misEnvios(slug, pase, alcance), retry: false });
  const todos = useMemo(() => q.data ?? [], [q.data]);

  useEffect(() => {
    if (q.error && sesionVencida(q.error)) onSesionVencida();
  }, [q.error]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando llega el error

  const quitar = useMutation({
    mutationFn: (e: EnvioHist) => quitarEnvio(slug, pase, e.origen, e.id),
    onMutate: (e) => setQuitandoId(e.id),
    onSuccess: () => {
      setAviso("Lo quité de su historial.");
      setAbierto(null);
      void cliente.invalidateQueries({ queryKey: ["encuestas", "mis", slug] });
    },
    onError: (e) => {
      if (sesionVencida(e)) return onSesionVencida();
      setAviso(e instanceof Error ? e.message : "No se pudo quitar.");
      void cliente.invalidateQueries({ queryKey: ["encuestas", "mis", slug] });
    },
    onSettled: () => setQuitandoId(null),
  });

  // Los tipos que de verdad hay, para no ofrecer filtros vacíos.
  const tiposPresentes = useMemo(() => (["logro", "reto", "respuesta"] as const).filter((t) => todos.some((e) => e.tipos.includes(t))), [todos]);
  const lista = useMemo(() => (tipo === "todos" ? todos : todos.filter((e) => e.tipos.includes(tipo))), [todos, tipo]);
  useEffect(() => {
    if (tipo !== "todos" && !tiposPresentes.includes(tipo)) setTipo("todos");
  }, [tipo, tiposPresentes]);

  const revisados = todos.filter((e) => e.etapa >= 2).length;
  const alVideo = todos.filter((e) => e.etapa >= 3).length;
  useEffect(() => {
    if (!q.data) return;
    decir(
      q.data.length === 0
        ? "Todavía no ha enviado nada. Cuando lo haga, lo verá aquí."
        : `Tiene ${plural(q.data.length, "envío", "envíos")}. ${revisados === 0 ? "Aún ninguno lo han revisado." : `${plural(revisados, "ya lo revisaron", "ya los revisaron")}${alVideo ? ` y ${alVideo === 1 ? "1 va" : `${alVideo} van`} al video` : ""}.`}`,
      "feliz",
    );
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps -- el mensaje depende de lo que llegó

  // Entrada: la cabecera y las filas; el trazo de estado se dibuja de izquierda a derecha (una sola puesta en escena).
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || !q.data || sinMovimiento()) return;
    const ctx = gsap.context(() => {
      gsap.from(".ep-mis-rec", { autoAlpha: 0, y: 10, duration: 0.3, ease: EASE, stagger: 0.04, clearProps: "opacity,visibility,transform" });
      gsap.utils.toArray<HTMLElement>(".ep-mis-traza").forEach((tr, i) => {
        gsap.from(tr.querySelectorAll(".t"), { "--w": 0, duration: 0.5, ease: "power2.inOut", delay: 0.15 + i * 0.04, stagger: 0.2 });
        gsap.from(tr.querySelectorAll(".p.on"), { scale: 0.4, duration: 0.3, ease: "back.out(2)", delay: 0.15 + i * 0.04, stagger: 0.2 });
      });
    }, el);
    return () => ctx.revert();
  }, [q.data, alcance]);

  const grupos = useMemo(() => {
    const m = new Map<string, EnvioHist[]>();
    for (const e of lista) {
      const k = mesDe(e.creado);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [lista]);

  return (
    <div className="ep-panel ep-mis" ref={raiz}>
      <div className="ep-mis-barra">
        <div>
          <h2>Mis envíos</h2>
          <p className="ep-lede">
            Lo que envió con <b>{correo}</b>. Solo usted lo ve.
          </p>
        </div>
        <button type="button" className="ep-btn ep-btn--suave" onClick={onVolver}>
          Volver
        </button>
      </div>

      {aviso && (
        <p className="ep-mis-aviso" role="status">
          {aviso}
        </p>
      )}

      {q.isPending ? (
        <div className="ep-mis-cargando" aria-busy="true" aria-label="Cargando su historial">
          <span />
          <span />
          <span />
        </div>
      ) : q.error ? (
        <div className="ep-error ep-error--bloque" role="alert">
          {q.error instanceof Error ? q.error.message : "No se pudo leer su historial."}
          <div className="ep-acciones ep-acciones--sep">
            <button type="button" className="ep-btn" onClick={() => void q.refetch()}>
              Intentar de nuevo
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="ep-mis-barra">
            <div className="ep-mis-seg" role="group" aria-label="Tipo de envío">
              {(["todos", ...tiposPresentes] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
                  {t === "todos" ? "Todos" : t === "logro" ? "Logros" : t === "reto" ? "Retos" : "Respuestas"}
                </button>
              ))}
            </div>
            <div className="ep-mis-seg" role="group" aria-label="Alcance">
              <button type="button" aria-pressed={alcance === "esta"} onClick={() => setAlcance("esta")}>
                Esta encuesta
              </button>
              <button type="button" aria-pressed={alcance === "todas"} onClick={() => setAlcance("todas")}>
                Todas mis encuestas
              </button>
            </div>
          </div>

          {lista.length === 0 ? (
            <div className="ep-mis-vacio">
              <h3>{todos.length === 0 ? "Aquí quedará su historial" : "Nada con este filtro"}</h3>
              <p className="ep-fino">{todos.length === 0 ? "Cada envío que haga se guarda con su fecha y su estado." : "Pruebe con otro tipo o con todas sus encuestas."}</p>
              {todos.length === 0 && (
                <button type="button" className="ep-btn ep-btn--pri" onClick={onVolver}>
                  Enviar el primero
                </button>
              )}
            </div>
          ) : (
            grupos.map(([mes, filas]) => (
              <section key={mes} aria-label={mes}>
                <div className="ep-mis-mes">{mes}</div>
                <ul className="ep-mis-lista">
                  {filas.map((e) => (
                    <Fila
                      key={`${e.origen}:${e.id}`}
                      envio={e}
                      abierto={abierto === e.id}
                      onAlternar={() => setAbierto((a) => (a === e.id ? null : e.id))}
                      onQuitar={() => quitar.mutate(e)}
                      quitando={quitandoId === e.id}
                      onCopiar={onCopiar}
                      mostrarEncuesta={alcance === "todas"}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

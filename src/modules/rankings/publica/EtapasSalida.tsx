/* Etapas 5 y 6 de Pilo Publica: Diagramación y Publicar. */

import { useMemo, useState } from "react";
import type { EtapaProps } from "./contexto";
import { useActualizarInforme, useBloques, useCifras, useCorridas, useMedios, useOrdenarBloques, useGuardarBloque } from "./datos";
import { InformeVista } from "./InformeVista";
import { problemasDe } from "./EtapaNarrativa";
import { AJUSTES_BASE, ajustesDe, citasDe, ordenDe, resolverSerie, urlPublica } from "./tipos";
import type { AjustesPP, BloquePP, EstadoInforme, Idioma, SeccionVista } from "./tipos";
import { ErrorAviso, Interruptor, Tarjeta } from "./ui";

const SECCIONES: Record<SeccionVista, { t: string; d: string }> = {
  kpis: { t: "Cifras clave", d: "Hasta 4 cifras del libro, con conteo animado" },
  graficos: { t: "Gráficos dinámicos", d: "Barras, línea o anillo con las cifras del libro" },
  ejes: { t: "Narrativa por eje", d: "Texto de Pilo y de la persona, con imágenes de las noticias" },
  noticias: { t: "Noticias relacionadas", d: "Carrusel final con las noticias de las imágenes" },
};

function Segmento<T extends string | number>({ etiqueta, valor, opciones, onCambio }: { etiqueta: string; valor: T; opciones: { v: T; t: string }[]; onCambio: (v: T) => void }) {
  return (
    <div>
      <div className="pp-opt-t">{etiqueta}</div>
      <div className="pp-seg" role="group" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button key={String(o.v)} type="button" aria-pressed={valor === o.v} onClick={() => onCambio(o.v)}>
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EtapaDiagramacion(p: EtapaProps) {
  const bloques = useBloques(p.informe.id);
  const cifras = useCifras(p.informe.id);
  const informeUp = useActualizarInforme();
  const guardar = useGuardarBloque();
  const ordenar = useOrdenarBloques();
  const [idioma, setIdioma] = useState<Idioma>("es");
  const [ver, setVer] = useState(false);

  const aj = ajustesDe(p.informe);
  const orden = ordenDe(aj);
  const setAj = (n: Partial<AjustesPP>) => informeUp.mutate({ id: p.informe.id, patch: { settings: { ...AJUSTES_BASE, ...p.informe.settings, ...n } } });

  const todos = bloques.data ?? [];
  const grupos: Record<SeccionVista, BloquePP[]> = {
    kpis: todos.filter((b) => b.kind === "kpi"),
    graficos: todos.filter((b) => b.kind === "grafico"),
    ejes: todos.filter((b) => b.kind === "texto" && b.sec !== "portada"),
    noticias: [],
  };

  const imagenesIds = todos.filter((b) => b.kind === "imagen" && b.enabled).map((b) => b.spec.news_id ?? "");
  const medios = useMedios(ver ? imagenesIds : []);

  const mover = (s: SeccionVista, i: number, d: number) => {
    const o = [...orden];
    [o[i], o[i + d]] = [o[i + d], o[i]];
    void s;
    setAj({ order: o });
  };
  const moverBloque = (g: BloquePP[], i: number, d: number) => {
    const ids = g.map((b) => b.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    ordenar.mutate(ids);
  };
  const apagada = (s: SeccionVista) => (aj.off ?? []).includes(s);

  if (bloques.isPending || cifras.isPending) return <p role="status">Cargando la diagramación…</p>;
  if (bloques.error || cifras.error) return <ErrorAviso error={bloques.error ?? cifras.error} onReintentar={() => { void bloques.refetch(); void cifras.refetch(); }} />;

  const libro = new Map((cifras.data ?? []).map((c) => [c.key, c]));
  const nombre = (b: BloquePP) => (b.kind === "kpi" ? (libro.get(b.spec.cifra ?? "")?.label ?? `Cifra ${b.spec.cifra ?? ""}`) : b.kind === "grafico" ? b.spec.title_es || "Gráfico sin título" : b.heading_es || b.text_es.slice(0, 50) || "Eje sin título");

  return (
    <div className="pp-stack">
      <Tarjeta titulo="Orden de las secciones" cuenta="La portada va siempre primero">
        <ul className="pp-lista">
          {orden.map((s, i) => (
            <li key={s} className="pp-fila">
              <span className="pp-g">{i + 1}</span>
              <div className="pp-fila__t">
                <span>{SECCIONES[s].t}</span>
                <small>{SECCIONES[s].d}</small>
              </div>
              <span className="pp-mv">
                <button type="button" disabled={i === 0} onClick={() => mover(s, i, -1)} aria-label={`Subir ${SECCIONES[s].t}`}>
                  ↑
                </button>
                <button type="button" disabled={i === orden.length - 1} onClick={() => mover(s, i, 1)} aria-label={`Bajar ${SECCIONES[s].t}`}>
                  ↓
                </button>
              </span>
              <Interruptor marcado={!apagada(s)} etiqueta={`Mostrar la sección ${SECCIONES[s].t}`} onCambio={(v) => setAj({ off: v ? (aj.off ?? []).filter((x) => x !== s) : [...(aj.off ?? []), s] })} />
            </li>
          ))}
        </ul>
      </Tarjeta>

      {(["kpis", "graficos", "ejes"] as const).map((s) =>
        grupos[s].length ? (
          <Tarjeta key={s} titulo={SECCIONES[s].t} cuenta={`${grupos[s].filter((b) => b.enabled).length}/${grupos[s].length} visibles`}>
            <ul className="pp-lista">
              {grupos[s].map((b, i) => (
                <li key={b.id} className="pp-fila">
                  <span className="pp-g">{i + 1}</span>
                  <div className="pp-fila__t">
                    <span>{nombre(b)}</span>
                  </div>
                  <span className="pp-mv">
                    <button type="button" disabled={i === 0 || ordenar.isPending} onClick={() => moverBloque(grupos[s], i, -1)} aria-label={`Subir: ${nombre(b)}`}>
                      ↑
                    </button>
                    <button type="button" disabled={i === grupos[s].length - 1 || ordenar.isPending} onClick={() => moverBloque(grupos[s], i, 1)} aria-label={`Bajar: ${nombre(b)}`}>
                      ↓
                    </button>
                  </span>
                  <Interruptor marcado={b.enabled} etiqueta={`Mostrar: ${nombre(b)}`} onCambio={(v) => guardar.mutate({ informe_id: p.informe.id, id: b.id, patch: { enabled: v } })} />
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null,
      )}

      <Tarjeta titulo="Ajustes de página y de voz">
        <div className="pp-opts">
          <Segmento etiqueta="Portada" valor={aj.cover} opciones={[{ v: "right", t: "Motivo a la derecha" }, { v: "left", t: "A la izquierda" }]} onCambio={(v) => setAj({ cover: v })} />
          <Segmento etiqueta="Texto" valor={aj.cols} opciones={[{ v: 1, t: "Una columna" }, { v: 2, t: "Dos columnas" }]} onCambio={(v) => setAj({ cols: v })} />
          <Segmento etiqueta="Movimiento" valor={aj.motion} opciones={[{ v: "editorial", t: "Editorial" }, { v: "subtle", t: "Sutil" }, { v: "none", t: "Sin movimiento" }]} onCambio={(v) => setAj({ motion: v })} />
          <Segmento etiqueta="Tono de Pilo" valor={aj.tone} opciones={[{ v: "cercano", t: "Cercano" }, { v: "formal", t: "Formal" }, { v: "tecnico", t: "Técnico" }]} onCambio={(v) => setAj({ tone: v })} />
          <Segmento etiqueta="Persona gramatical" valor={aj.person} opciones={[{ v: "nosotros", t: "Nosotros" }, { v: "impersonal", t: "Impersonal" }]} onCambio={(v) => setAj({ person: v })} />
        </div>
        <p className="pp-nota pp-pad">El movimiento «Sin movimiento» se aplica también a quien tiene activada la opción de reducir animaciones en su dispositivo. El tono y la persona orientan la próxima redacción de Pilo.</p>
      </Tarjeta>
      {(informeUp.error || guardar.error || ordenar.error) && <ErrorAviso error={informeUp.error ?? guardar.error ?? ordenar.error} />}

      <Tarjeta
        titulo="Vista previa del informe"
        acciones={
          <>
            <div className="pp-seg" role="group" aria-label="Idioma de la vista previa">
              <button type="button" aria-pressed={idioma === "es"} onClick={() => setIdioma("es")}>
                ES
              </button>
              <button type="button" aria-pressed={idioma === "en"} onClick={() => setIdioma("en")}>
                EN
              </button>
            </div>
            <button type="button" className="pp-btn pp-btn--sm" aria-expanded={ver} onClick={() => setVer((v) => !v)}>
              {ver ? "Ocultar" : "Ver el informe"}
            </button>
          </>
        }
      >
        {ver ? (
          <div className="pp-prev">
            <InformeVista informe={p.informe} unidad={p.unidad} bloques={todos} cifras={libro} medios={medios.data ?? { noticias: new Map(), imagenes: new Map(), deNoticia: new Map() }} idioma={idioma} compacto />
          </div>
        ) : (
          <p className="pp-nota pp-pad">Ábrela para ver cómo quedará con el color y el orden elegidos. Las cifras que falten se avisan aquí y se omiten en la página pública.</p>
        )}
      </Tarjeta>

      <div className="pp-acciones">
        <button type="button" className="button-secondary" onClick={() => p.ir(3)}>
          ← Narrativa
        </button>
        <button type="button" className="button-primary" onClick={() => p.ir(5)}>
          Continuar a publicar →
        </button>
      </div>
    </div>
  );
}

/* ---------- Publicar ------------------------------------------------------ */

const FLUJO: { id: EstadoInforme; t: string }[] = [
  { id: "borrador", t: "Borrador" },
  { id: "revision", t: "En revisión de Planeación" },
  { id: "publicado", t: "Publicado" },
];
const NOMBRE_ESTADO: Record<EstadoInforme, string> = { borrador: "borrador", revision: "revisión", publicado: "publicado" };

const fechaHora = (s: string) => new Date(s).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function textoCorrida(accion: string, d: Record<string, unknown>): string {
  if (accion === "estado") return `Pasó de ${NOMBRE_ESTADO[d.de as EstadoInforme] ?? d.de} a ${NOMBRE_ESTADO[d.a as EstadoInforme] ?? d.a}`;
  const resto = Object.entries(d)
    .filter(([, v]) => typeof v === "number" || (typeof v === "string" && v.length < 40))
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  return `Pilo · ${accion}${resto ? ` (${resto})` : ""}`;
}

export function EtapaPublicar(p: EtapaProps) {
  const bloques = useBloques(p.informe.id);
  const cifras = useCifras(p.informe.id);
  const corridas = useCorridas(p.informe.id);
  const informeUp = useActualizarInforme();
  const [confirma, setConfirma] = useState<EstadoInforme | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const todos = useMemo(() => bloques.data ?? [], [bloques.data]);
  const libro = useMemo(() => new Map((cifras.data ?? []).map((c) => [c.key, c])), [cifras.data]);
  const nombres = useMemo(() => new Set(libro.keys()), [libro]);

  if (bloques.isPending || cifras.isPending) return <p role="status">Cargando la lista de verificación…</p>;
  if (bloques.error || cifras.error) return <ErrorAviso error={bloques.error ?? cifras.error} />;

  const kpis = todos.filter((b) => b.kind === "kpi" && b.enabled);
  const kpisSin = kpis.filter((b) => libro.get(b.spec.cifra ?? "")?.value == null);
  const graficos = todos.filter((b) => b.kind === "grafico" && b.enabled);
  const graficosMal = graficos.filter((b) => !resolverSerie(b.spec, libro).puntos.some((x) => x.v !== null));
  const ejes = todos.filter((b) => b.kind === "texto" && b.sec !== "portada" && b.enabled);
  const sinCita = ejes.filter((b) => citasDe(b).length === 0 || !b.text_es.trim());
  const cifrasMal = ejes.filter((b) => (b.figs ?? []).some((k) => !nombres.has(k)));
  const sinIngles = ejes.filter((b) => !b.text_en.trim()).length + (p.informe.title_en.trim() ? 0 : 1) + (p.informe.lead_en.trim() ? 0 : 1);
  const alertas = ejes.flatMap((b) => problemasDe(b, nombres)).filter((x) => x.startsWith("Tiene números")).length;

  const checks: { ok: boolean; t: string; bloquea: boolean }[] = [
    { ok: Boolean(p.informe.title_es.trim() && p.informe.lead_es.trim()), t: "Título e introducción en español", bloquea: true },
    { ok: kpis.length > 0 && kpisSin.length === 0, t: kpis.length ? `${kpis.length} cifras clave${kpisSin.length ? ` (${kpisSin.length} sin valor en el libro)` : ""}` : "Al menos una cifra clave", bloquea: true },
    { ok: graficos.length > 0 && graficosMal.length === 0, t: graficos.length ? `${graficos.length} gráficos${graficosMal.length ? ` (${graficosMal.length} sin datos)` : ""}` : "Al menos un gráfico con datos", bloquea: true },
    { ok: ejes.length > 0, t: `${ejes.length} ejes narrativos visibles`, bloquea: true },
    { ok: sinCita.length === 0, t: sinCita.length ? `${sinCita.length} ejes sin cita o sin texto` : "Todos los ejes tienen cita", bloquea: true },
    { ok: cifrasMal.length === 0, t: cifrasMal.length ? `${cifrasMal.length} ejes citan cifras que no están en el libro` : "Las cifras del texto están en el libro", bloquea: true },
    { ok: alertas === 0, t: alertas ? `${alertas} ejes tienen números sin enlazar a cifras del libro: revísalos` : "Los números del texto están enlazados al libro", bloquea: false },
    { ok: sinIngles === 0, t: sinIngles ? `Falta inglés en ${sinIngles} partes: el informe en inglés mostrará el español en ellas` : "Todo está traducido al inglés", bloquea: false },
    { ok: !todos.some((b) => b.kind === "imagen" && b.enabled && b.warn), t: "Imágenes sin avisos de autorización (si aparecen menores, confirma el permiso)", bloquea: false },
  ];
  const listo = checks.every((c) => c.ok || !c.bloquea);
  const estado = p.informe.state;
  const idx = FLUJO.findIndex((f) => f.id === estado);
  const url = urlPublica(p.informe);

  const cambiar = (a: EstadoInforme) => {
    informeUp.mutate({ id: p.informe.id, patch: { state: a }, bitacora: { accion: "estado", detalle: { de: estado, a } } }, { onSettled: () => setConfirma(null) });
  };
  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(texto);
      window.setTimeout(() => setCopiado(null), 1800);
    } catch {
      setCopiado(null);
    }
  };

  return (
    <div className="pp-stack">
      <Tarjeta titulo="Estado de publicación">
        <ol className="pp-flujo" aria-label="Pasos de publicación">
          {FLUJO.map((f, i) => (
            <li key={f.id} className={i < idx ? "pp-fs pp-fs--ok" : i === idx ? "pp-fs pp-fs--on" : "pp-fs"} aria-current={i === idx ? "step" : undefined}>
              <span className="pp-d" aria-hidden="true">
                {i < idx ? "✓" : i + 1}
              </span>
              {f.t}
            </li>
          ))}
        </ol>
        <ul className="pp-chk" aria-label="Lista de verificación">
          {checks.map((c, i) => (
            <li key={i} className={c.ok ? "pp-chk--si" : c.bloquea ? "pp-chk--no" : "pp-chk--aviso"}>
              <i aria-hidden="true">{c.ok ? "✓" : "!"}</i>
              <span>
                {c.t}
                {!c.ok && <small> {c.bloquea ? "· impide publicar" : "· aviso, no impide publicar"}</small>}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Dirección pública">
        <div className="pp-pad pp-stack">
          {[{ l: "Español", u: url }, { l: "English", u: urlPublica(p.informe, "en") }].map((x) => (
            <div key={x.l} className="pp-url-fila">
              <span className="pp-url" tabIndex={0} aria-label={`Dirección en ${x.l}`}>
                {x.u}
              </span>
              <button type="button" className="pp-btn pp-btn--sm" onClick={() => void copiar(x.u)}>
                {copiado === x.u ? "Copiada" : "Copiar"}
              </button>
              {estado === "publicado" && (
                <a className="pp-btn pp-btn--sm" href={x.u} target="_blank" rel="noopener noreferrer">
                  Abrir
                </a>
              )}
            </div>
          ))}
          <p className="pp-nota">{estado === "publicado" ? "El informe está publicado: cualquier cambio que guardes se ve de inmediato." : "Mientras no esté publicado, esta dirección responde «no encontrado» al público. Al publicar se ve de inmediato."}</p>
        </div>
      </Tarjeta>

      <div className="pp-acciones">
        {estado === "borrador" && (
          <button type="button" className="button-primary" disabled={informeUp.isPending} onClick={() => cambiar("revision")}>
            Enviar a revisión
          </button>
        )}
        {estado === "revision" && (
          <>
            <button type="button" className="button-secondary" disabled={informeUp.isPending} onClick={() => cambiar("borrador")}>
              Devolver a borrador
            </button>
            {confirma === "publicado" ? (
              <>
                <span className="pp-warn">Se verá de inmediato en la dirección pública. ¿Publicar?</span>
                <button type="button" className="button-primary" disabled={informeUp.isPending} onClick={() => cambiar("publicado")}>
                  Sí, publicar
                </button>
                <button type="button" className="button-ghost" onClick={() => setConfirma(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" className="button-primary" disabled={!listo || informeUp.isPending} title={listo ? undefined : "Resuelve los pendientes que impiden publicar"} onClick={() => setConfirma("publicado")}>
                Aprobar y publicar
              </button>
            )}
          </>
        )}
        {estado === "publicado" &&
          (confirma === "borrador" ? (
            <>
              <span className="pp-warn">El informe dejará de verse en público. ¿Retirarlo?</span>
              <button type="button" className="button-primary" disabled={informeUp.isPending} onClick={() => cambiar("borrador")}>
                Sí, retirar
              </button>
              <button type="button" className="button-ghost" onClick={() => setConfirma(null)}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="button-secondary" onClick={() => setConfirma("borrador")}>
              Retirar publicación
            </button>
          ))}
        <button type="button" className="button-ghost" onClick={() => p.ir(4)}>
          ← Diagramación
        </button>
      </div>
      {estado === "borrador" && !listo && <p className="pp-nota">Puedes enviar a revisión con pendientes; para publicar hay que resolver los que dicen «impide publicar».</p>}
      {informeUp.error && <ErrorAviso error={informeUp.error} />}

      <Tarjeta titulo="Historial">
        {corridas.isPending ? (
          <p className="pp-nota pp-pad" role="status">
            Cargando el historial…
          </p>
        ) : corridas.error ? (
          <div className="pp-pad">
            <ErrorAviso error={corridas.error} />
          </div>
        ) : corridas.data.length === 0 ? (
          <p className="pp-nota pp-pad">Todavía no hay movimientos.</p>
        ) : (
          <ul className="pp-hist">
            {corridas.data.map((c) => (
              <li key={c.id}>
                <time dateTime={c.created_at} className="pp-mono">
                  {fechaHora(c.created_at)}
                </time>
                <span>{textoCorrida(c.accion, c.detalle)}</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

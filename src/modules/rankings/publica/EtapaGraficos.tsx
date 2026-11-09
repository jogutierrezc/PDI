/* Etapa 3 de Pilo Publica: gráficos dinámicos. Cada gráfico cita cifras del libro; nunca lleva números propios. */

import { useEffect, useMemo, useRef, useState } from "react";
import type { RespuestaAnalizar } from "./api";
import type { EtapaProps } from "./contexto";
import { siguientePos, useBloques, useBorrarBloque, useCifras, useGuardarBloque } from "./datos";
import { ConstructorGrafico, NOMBRE_TIPO, Sugerencias, VistaPrevia } from "./ConstructorGrafico";
import { GraficoPropio } from "./GraficoPropio";
import { diagnosticar, explicacionDe, sugerirGraficos } from "./explicar";
import type { Sugerencia } from "./explicar";
import type { BloquePP, CifraPP, CifraPub, SpecBloque, SpecGrafico, TipoGrafico } from "./tipos";
import { BotonPilo, Campo, ErrorAviso, Interruptor, Tarjeta, Vacio } from "./ui";

const TIPOS: TipoGrafico[] = ["bar", "line", "donut", "compare", "stack", "heat"];

export function EtapaGraficos(p: EtapaProps) {
  const bloques = useBloques(p.informe.id);
  const cifras = useCifras(p.informe.id);
  const guardar = useGuardarBloque();
  const borrar = useBorrarBloque();
  const [sel, setSel] = useState<string | null>(null);
  const [rehacer, setRehacer] = useState(false);
  const [resumen, setResumen] = useState<string | null>(null);
  const [panel, setPanel] = useState<"" | "crear" | "propio" | "sugerencias">("");

  const graficos = useMemo(() => (bloques.data ?? []).filter((b) => b.kind === "grafico"), [bloques.data]);
  const libroPP = useMemo(() => cifras.data ?? [], [cifras.data]);
  const libro = useMemo(() => new Map<string, CifraPub>(libroPP.map((c) => [c.key, c])), [libroPP]);
  const sugerencias = useMemo(() => sugerirGraficos(libroPP, graficos.map((g) => g.spec)), [libroPP, graficos]);

  useEffect(() => {
    if (graficos.length && !graficos.some((g) => g.id === sel)) setSel(graficos[0].id);
    if (!graficos.length) setSel(null);
  }, [graficos, sel]);

  const analizar = async () => {
    setResumen(null);
    const r = await p.corrida.correr<RespuestaAnalizar>("Pilo propone el tablero y los gráficos", "analizar", rehacer ? { rehacer: true } : {});
    if (r?.aviso) setResumen(r.aviso);
    else if (r) setResumen(`Pilo propuso ${r.kpis} cifras clave y ${r.graficos} gráficos.${(Array.isArray(r.descartados) ? r.descartados.length : r.descartados) ? ` Descartó ${Array.isArray(r.descartados) ? r.descartados.length : r.descartados} (${Array.isArray(r.descartados) ? r.descartados.slice(0, 2).map((d) => d.motivo).join(" ") : "sin cifras verificables"}).` : ""}`);
  };

  /** Inserta un gráfico nuevo (origen persona). Lanza el error para que quien llama lo muestre sin perder lo elegido. */
  const crear = async (spec: SpecGrafico): Promise<string> => {
    const id = await guardar.mutateAsync({ informe_id: p.informe.id, patch: { kind: "grafico", sec: "graficos", pos: siguientePos(bloques.data), enabled: true, spec } });
    setSel(id);
    return id;
  };

  if (bloques.isPending || cifras.isPending) return <p role="status">Cargando los gráficos…</p>;
  if (bloques.error || cifras.error) return <ErrorAviso error={bloques.error ?? cifras.error} onReintentar={() => { void bloques.refetch(); void cifras.refetch(); }} />;

  const g = graficos.find((x) => x.id === sel);

  return (
    <div className="pp-stack">
      <div className="pp-acciones">
        <BotonPilo pilo={p.pilo} corrida={p.corrida} onClick={() => void analizar()}>
          Pilo propone el tablero y los gráficos
        </BotonPilo>
        <label className="pp-check">
          <input type="checkbox" checked={rehacer} onChange={(e) => setRehacer(e.target.checked)} /> Rehacer lo que Pilo propuso antes
        </label>
        {resumen && <small className="pp-nota" role="status">{resumen}</small>}
      </div>

      <Tarjeta
        titulo="Armar un gráfico"
        cuenta={sugerencias.length ? `${sugerencias.length} sugerencias` : undefined}
        acciones={
          <>
            <button type="button" className="pp-btn pp-btn--sm" aria-expanded={panel === "propio"} onClick={() => setPanel(panel === "propio" ? "" : "propio")}>
              {panel === "propio" ? "Cerrar" : "+ Con datos propios"}
            </button>
            <button type="button" className="pp-btn pp-btn--sm" aria-expanded={panel === "crear"} onClick={() => setPanel(panel === "crear" ? "" : "crear")} disabled={libroPP.length === 0} title={libroPP.length === 0 ? "Usa las cifras del libro: primero arma el libro, o crea el gráfico con datos propios" : undefined}>
              {panel === "crear" ? "Cerrar" : "+ Con cifras del libro"}
            </button>
            <button type="button" className="pp-btn pp-btn--sm" aria-expanded={panel === "sugerencias"} onClick={() => setPanel(panel === "sugerencias" ? "" : "sugerencias")} disabled={libroPP.length === 0}>
              {panel === "sugerencias" ? "Ocultar sugerencias" : "Ver sugerencias"}
            </button>
          </>
        }
      >
        {panel === "" && (
          <p className="pp-nota pp-pad">
            Un gráfico es independiente del tablero: crea uno con datos propios (escribes los datos y dices de dónde salen) o con cifras del libro (solo se ofrecen combinaciones que sí se pueden dibujar){libroPP.length ? ", o mira las sugerencias que la pantalla arma sola" : ""}. Si no hay datos, el informe se publica sin gráficos.
          </p>
        )}
        {panel === "propio" && <GraficoPropio informeId={p.informe.id} unidad={p.unidad} onCrear={async (s) => void (await crear(s))} onCerrar={() => setPanel("")} />}
        {panel === "crear" && <ConstructorGrafico cifras={libroPP} libro={libro} unidad={p.unidad} onCrear={async (s) => void (await crear(s))} onCerrar={() => setPanel("")} />}
        {panel === "sugerencias" && <Sugerencias sugerencias={sugerencias} libro={libro} unidad={p.unidad} onAgregar={async (s: Sugerencia) => void (await crear(s.spec))} />}
      </Tarjeta>

      <Tarjeta titulo="Gráficos del informe" cuenta={`${graficos.filter((x) => x.enabled).length} visibles`}>
        {graficos.length === 0 ? (
          <Vacio titulo="Todavía no hay gráficos">
            Pilo puede proponerlos con las cifras del libro, o puedes crear uno tú con datos propios. Sin datos, el informe sale sin esta sección.
          </Vacio>
        ) : (
          <div className="pp-ed">
            <div className="pp-ed__l" role="tablist" aria-label="Gráficos" aria-orientation="vertical">
              {graficos.map((x, i) => (
                <button key={x.id} type="button" role="tab" id={`pp-gt-${x.id}`} aria-selected={x.id === sel} aria-controls="pp-gp" tabIndex={x.id === sel ? 0 : -1} onClick={() => setSel(x.id)}
                  onKeyDown={(e) => {
                    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
                    if (!d) return;
                    e.preventDefault();
                    const n = graficos[(i + d + graficos.length) % graficos.length];
                    setSel(n.id);
                    document.getElementById(`pp-gt-${n.id}`)?.focus();
                  }}>
                  <span className="pp-mono">{i + 1}</span>
                  <span>
                    {x.spec.title_es || "Sin título"}
                    {!x.enabled && <small className="pp-nota"> (oculto)</small>}
                  </span>
                </button>
              ))}
            </div>
            <div className="pp-ed__r" role="tabpanel" id="pp-gp" aria-labelledby={g ? `pp-gt-${g.id}` : undefined}>
              {g && <Editor key={g.id} g={g} libro={libro} cifras={libroPP} p={p} guardar={(patch) => guardar.mutateAsync({ informe_id: p.informe.id, id: g.id, patch }).then(() => undefined)} borrar={() => borrar.mutate(g.id)} />}
            </div>
          </div>
        )}
      </Tarjeta>
      {borrar.error && <ErrorAviso error={borrar.error} />}
      <div className="pp-acciones">
        <button type="button" className="button-secondary" onClick={() => p.ir(1)}>
          ← Tablero
        </button>
        <button type="button" className="button-primary" onClick={() => p.ir(3)}>
          Continuar a la narrativa →
        </button>
      </div>
    </div>
  );
}

type Estado = { k: "ok" | "guardando" | "mal"; msg?: string };

function Editor({ g, libro, cifras, p, guardar, borrar }: { g: BloquePP; libro: Map<string, CifraPub>; cifras: CifraPP[]; p: EtapaProps; guardar: (patch: Partial<BloquePP>) => Promise<void>; borrar: () => void }) {
  // Copia local: lo que la persona hace nunca se pierde por un guardado que falle o llegue tarde.
  const [spec, setSpecLocal] = useState<SpecBloque>(g.spec);
  const [visible, setVisible] = useState(g.enabled);
  const [estado, setEstado] = useState<Estado>({ k: "ok" });
  const [confirma, setConfirma] = useState(false);
  const specRef = useRef<SpecBloque>(g.spec);
  const pendientes = useRef(0);
  const cola = useRef<Promise<void>>(Promise.resolve());

  // Si el bloque cambia desde fuera (Pilo, otra pestaña) y no hay guardados en curso, se toma lo nuevo.
  useEffect(() => {
    if (pendientes.current === 0 && estado.k !== "mal") {
      specRef.current = g.spec;
      setSpecLocal(g.spec);
      setVisible(g.enabled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega una versión nueva del bloque
  }, [g.updated_at]);

  const persistir = (patch: Partial<BloquePP>) => {
    pendientes.current += 1;
    setEstado({ k: "guardando" });
    cola.current = cola.current
      .then(() => guardar(patch))
      .then(() => {
        pendientes.current -= 1;
        if (pendientes.current === 0) setEstado({ k: "ok" });
      })
      .catch((e: unknown) => {
        pendientes.current -= 1;
        setEstado({ k: "mal", msg: e instanceof Error ? e.message : String(e) });
      });
  };
  const setSpec = (n: Partial<SpecBloque>) => {
    const next = { ...specRef.current, ...n };
    specRef.current = next;
    setSpecLocal(next);
    persistir({ spec: next });
  };

  const tipo = spec.chart ?? "bar";
  const series = spec.series ?? [];
  const porClave = new Map(cifras.map((c) => [c.key, c]));
  const actuales = series.map((x) => porClave.get(x.cifra)).filter((c): c is CifraPP => Boolean(c));
  const faltan = series.filter((x) => !porClave.has(x.cifra));
  const dx = series.length ? diagnosticar(tipo, actuales) : { ok: false, errores: [], avisos: [] as string[] };
  const setSerie = (i: number, n: Partial<{ x: string; cifra: string }>) => setSpec({ series: series.map((x, k) => (k === i ? { ...x, ...n } : x)) });
  const ordenadas = useMemo(() => [...cifras].sort((a, b) => a.label.localeCompare(b.label, "es") || (a.year ?? 0) - (b.year ?? 0)), [cifras]);

  const motivoTipo = (t: TipoGrafico): string | null => {
    if (t === tipo || !actuales.length) return null;
    const d = diagnosticar(t, actuales);
    return d.ok ? null : d.errores[0];
  };

  return (
    <>
      <div className="pp-row">
        <div>
          <div className="pp-opt-t" id={`pp-tipo-${g.id}`}>
            Tipo de gráfico
          </div>
          <div className="pp-seg" role="group" aria-labelledby={`pp-tipo-${g.id}`}>
            {TIPOS.map((t) => {
              const m = motivoTipo(t);
              return (
                <button key={t} type="button" aria-pressed={tipo === t} disabled={Boolean(m)} title={m ?? undefined} onClick={() => setSpec({ chart: t })}>
                  {NOMBRE_TIPO[t]}
                </button>
              );
            })}
          </div>
        </div>
        <label className="pp-check pp-check--abajo">
          <Interruptor
            marcado={visible}
            etiqueta="Mostrar este gráfico en el informe"
            onCambio={(v) => {
              setVisible(v);
              persistir({ enabled: v });
            }}
          />{" "}
          Mostrar en el informe
        </label>
        <span className={`pp-guardado pp-guardado--${estado.k}`} role="status" aria-live="polite">
          {estado.k === "guardando" ? "Guardando…" : estado.k === "ok" ? "Guardado" : "No se guardó"}
        </span>
      </div>
      {estado.k === "mal" && (
        <div className="pp-aviso-caja pp-aviso-caja--mal" role="alert">
          <strong>No se pudo guardar el cambio</strong>
          <p>{estado.msg} Lo que ves en pantalla sigue ahí; no se perdió.</p>
          <button type="button" className="pp-btn pp-btn--sm" onClick={() => persistir({ spec: specRef.current, enabled: visible })}>
            Reintentar guardar
          </button>
        </div>
      )}
      <div className="pp-dos">
        <Campo etiqueta="Título en español" valor={spec.title_es ?? ""} onGuardar={(v) => setSpec({ title_es: v })} lang="es" ayuda="Sin cifras en el título, solo años." />
        <Campo etiqueta="Título en inglés" valor={spec.title_en ?? ""} onGuardar={(v) => setSpec({ title_en: v })} lang="en" />
      </div>

      <fieldset className="pp-series">
        <legend>Cifras del gráfico</legend>
        {series.length === 0 && <p className="pp-nota">Este gráfico no tiene cifras. Agrega al menos una del libro (o elimínalo y créalo paso a paso).</p>}
        {series.map((x, i) => {
          const c = porClave.get(x.cifra);
          return (
            <div className="pp-serie" key={i}>
              <Campo etiqueta="Etiqueta (por ejemplo, el año)" valor={x.x} onGuardar={(v) => setSerie(i, { x: v })} />
              <div className="pp-fld">
                <label htmlFor={`pp-c-${g.id}-${i}`}>Cifra del libro</label>
                <select id={`pp-c-${g.id}-${i}`} value={x.cifra} onChange={(e) => setSerie(i, { cifra: e.target.value })}>
                  {!c && <option value={x.cifra}>{x.cifra ? `Falta: ${x.cifra}` : "Elegir…"}</option>}
                  {ordenadas.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                      {k.year ? ` (${k.year})` : " (sin año)"} · {k.unit.trim() || "sin unidad"}
                    </option>
                  ))}
                </select>
                {c && <small>{explicacionDe(c).texto ? `${explicacionDe(c).texto.slice(0, 140)}${explicacionDe(c).texto.length > 140 ? "…" : ""}` : "Esta cifra aún no tiene explicación."}</small>}
              </div>
              <button type="button" className="pp-btn pp-btn--sm" onClick={() => setSpec({ series: series.filter((_, k) => k !== i) })} aria-label={`Quitar la cifra ${i + 1}`}>
                Quitar
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="pp-btn pp-btn--sm"
          disabled={cifras.length === 0}
          onClick={() => {
            const c = cifras.find((k) => k.value !== null && !series.some((x) => x.cifra === k.key)) ?? cifras[0];
            setSpec({ series: [...series, { x: c?.year ? String(c.year) : "", cifra: c?.key ?? "" }] });
          }}
        >
          + Agregar cifra
        </button>
      </fieldset>

      {faltan.length > 0 && (
        <p className="pp-aviso" role="status">
          Faltan cifras en el libro: <code>{faltan.map((x) => x.cifra).join(", ")}</code>. El gráfico no las dibuja; cámbialas o quítalas.
        </p>
      )}
      {series.length > 0 && dx.errores.length > 0 && (
        <ul className="pp-warn-lista" role="status">
          {dx.errores.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {dx.avisos.length > 0 && (
        <ul className="pp-warn-lista" role="status">
          {dx.avisos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      <VistaPrevia spec={spec} libro={libro} unidad={p.unidad} uid={`prev-${g.id}`} />
      <div className="pp-src">Vista previa en vivo, con los mismos componentes del informe.</div>

      <div className="pp-acciones">
        {confirma ? (
          <>
            <span className="pp-warn">¿Quitar este gráfico del informe?</span>
            <button type="button" className="pp-btn pp-btn--mal" onClick={borrar}>
              Sí, quitar
            </button>
            <button type="button" className="pp-btn" onClick={() => setConfirma(false)}>
              No
            </button>
          </>
        ) : (
          <button type="button" className="pp-btn" onClick={() => setConfirma(true)}>
            Eliminar gráfico
          </button>
        )}
        <small className="pp-nota">Origen: {g.origin === "pilo" ? "Pilo" : g.origin === "editado" ? "Pilo, editado" : "Persona"}</small>
      </div>
    </>
  );
}

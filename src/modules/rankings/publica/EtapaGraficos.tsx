/* Etapa 3 de Pilo Publica: gráficos dinámicos. Cada gráfico cita cifras del libro; nunca lleva números propios. */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { RespuestaAnalizar } from "./api";
import type { EtapaProps } from "./contexto";
import { useBloques, useBorrarBloque, useCifras, useGuardarBloque } from "./datos";
import { Grafica } from "./graficas";
import { resolverSerie, varsAcento } from "./tipos";
import type { BloquePP, CifraPub, SpecBloque, TipoGrafico } from "./tipos";
import { BotonPilo, Campo, ErrorAviso, Interruptor, Tarjeta, Vacio } from "./ui";

const TIPOS: { id: TipoGrafico; nombre: string }[] = [
  { id: "bar", nombre: "Barras" },
  { id: "line", nombre: "Línea" },
  { id: "donut", nombre: "Anillo" },
];

export function EtapaGraficos(p: EtapaProps) {
  const bloques = useBloques(p.informe.id);
  const cifras = useCifras(p.informe.id);
  const guardar = useGuardarBloque();
  const borrar = useBorrarBloque();
  const [sel, setSel] = useState<string | null>(null);
  const [rehacer, setRehacer] = useState(false);
  const [resumen, setResumen] = useState<string | null>(null);

  const graficos = useMemo(() => (bloques.data ?? []).filter((b) => b.kind === "grafico"), [bloques.data]);
  const libro = useMemo(() => new Map<string, CifraPub>((cifras.data ?? []).map((c) => [c.key, c])), [cifras.data]);

  useEffect(() => {
    if (graficos.length && !graficos.some((g) => g.id === sel)) setSel(graficos[0].id);
    if (!graficos.length) setSel(null);
  }, [graficos, sel]);

  const analizar = async () => {
    setResumen(null);
    const r = await p.corrida.correr<RespuestaAnalizar>("Pilo propone el tablero y los gráficos", "analizar", rehacer ? { rehacer: true } : {});
    if (r) setResumen(`Pilo propuso ${r.kpis} cifras clave y ${r.graficos} gráficos.${r.descartados ? ` Descartó ${r.descartados} por no tener cifras verificables.` : ""}`);
  };

  const nuevo = async () => {
    const id = await guardar.mutateAsync({
      informe_id: p.informe.id,
      patch: { kind: "grafico", sec: "graficos", pos: (bloques.data?.length ?? 0) + 1, spec: { chart: "bar", series: [], title_es: "Nuevo gráfico", title_en: "New chart" } },
    });
    setSel(id);
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
        titulo="Gráficos del informe"
        cuenta={`${graficos.filter((x) => x.enabled).length} visibles`}
        acciones={
          <button type="button" className="pp-btn pp-btn--sm" onClick={() => void nuevo()} disabled={guardar.isPending}>
            + Nuevo gráfico
          </button>
        }
      >
        {graficos.length === 0 ? (
          <Vacio titulo="Todavía no hay gráficos">
            {libro.size === 0 ? "Primero arma el libro de cifras en el tablero: los gráficos se dibujan con esas cifras." : "Pilo puede proponerlos con las cifras del libro, o puedes crear uno a mano."}
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
              {g && <Editor key={g.id} g={g} libro={libro} cifras={cifras.data ?? []} p={p} guardar={(patch) => guardar.mutate({ informe_id: p.informe.id, id: g.id, patch })} borrar={() => borrar.mutate(g.id)} />}
            </div>
          </div>
        )}
      </Tarjeta>
      {(guardar.error || borrar.error) && <ErrorAviso error={guardar.error ?? borrar.error} />}
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

function Editor({ g, libro, cifras, p, guardar, borrar }: { g: BloquePP; libro: Map<string, CifraPub>; cifras: CifraPub[]; p: EtapaProps; guardar: (patch: Partial<BloquePP>) => void; borrar: () => void }) {
  const spec = g.spec;
  const tipo = spec.chart ?? "bar";
  const series = spec.series ?? [];
  const s = resolverSerie(spec, libro);
  const setSpec = (n: Partial<SpecBloque>) => guardar({ spec: { ...spec, ...n } });
  const setSerie = (i: number, n: Partial<{ x: string; cifra: string }>) => setSpec({ series: series.map((x, k) => (k === i ? { ...x, ...n } : x)) });
  const esPct = s.unidad.trim() === "%";
  const [confirma, setConfirma] = useState(false);

  return (
    <>
      <div className="pp-row">
        <div>
          <div className="pp-opt-t" id={`pp-tipo-${g.id}`}>
            Tipo de gráfico
          </div>
          <div className="pp-seg" role="group" aria-labelledby={`pp-tipo-${g.id}`}>
            {TIPOS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tipo === t.id} disabled={t.id === "donut" && series.length > 0 && !esPct} title={t.id === "donut" && !esPct ? "El anillo es solo para porcentajes" : undefined} onClick={() => setSpec({ chart: t.id })}>
                {t.nombre}
              </button>
            ))}
          </div>
        </div>
        <label className="pp-check pp-check--abajo">
          <Interruptor marcado={g.enabled} etiqueta="Mostrar este gráfico en el informe" onCambio={(v) => guardar({ enabled: v })} /> Mostrar en el informe
        </label>
      </div>
      <div className="pp-dos">
        <Campo etiqueta="Título en español" valor={spec.title_es ?? ""} onGuardar={(v) => setSpec({ title_es: v })} lang="es" />
        <Campo etiqueta="Título en inglés" valor={spec.title_en ?? ""} onGuardar={(v) => setSpec({ title_en: v })} lang="en" />
      </div>

      <fieldset className="pp-series">
        <legend>Cifras del gráfico</legend>
        {series.length === 0 && <p className="pp-nota">Agrega al menos una cifra del libro.</p>}
        {series.map((x, i) => (
          <div className="pp-serie" key={i}>
            <Campo etiqueta="Etiqueta (por ejemplo, el año)" valor={x.x} onGuardar={(v) => setSerie(i, { x: v })} />
            <div className="pp-fld">
              <label htmlFor={`pp-c-${g.id}-${i}`}>Cifra del libro</label>
              <select id={`pp-c-${g.id}-${i}`} value={x.cifra} onChange={(e) => setSerie(i, { cifra: e.target.value })}>
                {!libro.has(x.cifra) && <option value={x.cifra}>{x.cifra ? `Falta: ${x.cifra}` : "Elegir…"}</option>}
                {cifras.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                    {c.year ? ` (${c.year})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="pp-btn pp-btn--sm" onClick={() => setSpec({ series: series.filter((_, k) => k !== i) })} aria-label={`Quitar la cifra ${i + 1}`}>
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          className="pp-btn pp-btn--sm"
          disabled={cifras.length === 0}
          onClick={() => {
            const c = cifras.find((k) => !series.some((x) => x.cifra === k.key)) ?? cifras[0];
            setSpec({ series: [...series, { x: c?.year ? String(c.year) : "", cifra: c?.key ?? "" }] });
          }}
        >
          + Agregar cifra
        </button>
      </fieldset>

      {s.faltan.length > 0 && (
        <p className="pp-aviso" role="status">
          Faltan cifras en el libro o no tienen valor: <code>{s.faltan.join(", ")}</code>. El gráfico no las dibuja.
        </p>
      )}

      <div className="pp-cc pp-cc--prev" style={varsAcento(p.unidad) as CSSProperties}>
        <h3>{spec.title_es || "Sin título"}</h3>
        {s.puntos.some((x) => x.v !== null) ? <Grafica tipo={tipo} puntos={s.puntos} unidad={s.unidad} titulo={spec.title_es ?? ""} idioma="es" uid={`prev-${g.id}`} /> : <p className="pp-nota">La vista previa aparece cuando haya al menos una cifra con valor.</p>}
        <div className="pp-src">Vista previa en vivo, con los mismos componentes del informe.</div>
      </div>

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

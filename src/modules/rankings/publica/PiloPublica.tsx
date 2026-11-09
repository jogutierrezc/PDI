/* =============================================================================
   Pilo Publica · el taller de informes de cada ranking (/admin/rankings/publica).

   Un informe por ranking, unidad y edición, en seis etapas: Fuentes, Tablero,
   Gráficos, Narrativa, Diagramación y Publicar. Pilo (función pilo-publica)
   hace de periodista y estadístico; la persona revisa, edita, ordena y publica.
   La selección vive en la dirección (?r=impact&u=4&ed=2027&paso=2).
   ========================================================================== */

import { useMemo } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { FuncionNoDesplegada, useCorrida, useEstadoFuncion } from "./api";
import type { EstadoPilo, EtapaProps } from "./contexto";
import { useBloques, useCifras, useCrearInforme, useFuentes, useInformes } from "./datos";
import { citasDe, CATALOGO, EDICIONES, EDICION_BASE, ETAPAS, nombreUnidad, rankingDe, tituloPorDefecto, unidadDe, varsAcento } from "./tipos";
import type { InformePP, RankingPP } from "./tipos";
import { EtapaFuentes, EtapaTablero } from "./EtapasDatos";
import { EtapaGraficos } from "./EtapaGraficos";
import { EtapaNarrativa } from "./EtapaNarrativa";
import { EtapaDiagramacion, EtapaPublicar } from "./EtapasSalida";
import { BarraPilo, ErrorAviso } from "./ui";
import "./publica.css";

const CABEZAS = [
  "Elige qué lee Pilo: noticias aprobadas, indicadores de las oficinas, tablas de Datos de Sostenibilidad y documentos.",
  "Revisa el libro de cifras y destaca hasta cuatro que abren el informe. Toda cifra sale de aquí.",
  "Cada gráfico cita cifras del libro. Escoge el tipo y mira cómo queda en vivo.",
  "Pilo redacta cada eje con citas; tú reescribes, traduces y eliges la imagen.",
  "Ordena las secciones, ajusta la página y mira el informe antes de publicar.",
  "Revisión de Planeación y publicación. Al publicar, el informe se ve de inmediato.",
];

function useEstadoPilo(informeId: string | undefined): EstadoPilo {
  const q = useEstadoFuncion(informeId);
  if (!informeId) return { cargando: false, lista: false, desplegada: true };
  if (q.isPending) return { cargando: true, lista: false, desplegada: true };
  if (q.error) {
    const no = q.error instanceof FuncionNoDesplegada;
    return { cargando: false, lista: false, desplegada: !no, motivo: no ? undefined : q.error.message };
  }
  return { cargando: false, lista: q.data.ai === true, desplegada: true, motivo: q.data.motivo, proveedor: q.data.proveedor, modelo: q.data.modelo };
}

export function PiloPublica() {
  const [sp, setSp] = useSearchParams();
  const rk = (rankingDe(sp.get("r") ?? "")?.id ?? "impact") as RankingPP;
  const cat = rankingDe(rk) ?? CATALOGO[0];
  const unidad = unidadDe(rk, sp.get("u") ?? "") ?? cat.units.find((u) => u.pri) ?? cat.units[0];
  const edNum = Number(sp.get("ed"));
  const edicion = EDICIONES.includes(edNum) ? edNum : EDICION_BASE;
  const paso = Math.max(0, Math.min(5, Number(sp.get("paso")) || 0));

  const set = (n: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(n)) next.set(k, v);
    setSp(next, { replace: true });
  };
  const ir = (n: number) => {
    set({ paso: String(n) });
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const informes = useInformes();
  const crear = useCrearInforme();
  const informe = informes.data?.find((i) => i.ranking === rk && i.unit_key === unidad.key && i.edition === edicion);
  const pilo = useEstadoPilo(informe?.id);
  const corrida = useCorrida(informe?.id);

  const estados = useMemo(() => new Map((informes.data ?? []).filter((i) => i.edition === edicion && i.ranking === rk).map((i) => [i.unit_key, i.state])), [informes.data, edicion, rk]);

  const cabeza = (
    <div className="pp-head">
      <div className="pp-chip" style={varsAcento(unidad) as CSSProperties}>
        <i>{unidad.short}</i>
        {cat.name} · {nombreUnidad(rk, unidad)}
      </div>
      <h2 className="pp-h1">Informe de {rk === "impact" ? `ODS ${unidad.key}` : unidad.name}</h2>
      <p>{informe ? CABEZAS[paso] : "Un informe por ranking, unidad y edición, armado con Pilo y publicado con tu revisión."}</p>
    </div>
  );

  const rail = (
    <aside className="pp-rail" aria-label="Elegir ranking y unidad">
      <div>
        <p className="pp-lbl">Ranking</p>
        <div className="pp-rk" role="group" aria-label="Ranking">
          {CATALOGO.map((r) => (
            <button key={r.id} type="button" aria-pressed={r.id === rk} onClick={() => set({ r: r.id, u: (r.units.find((u) => u.pri) ?? r.units[0]).key, paso: "0" })}>
              <strong>{r.name}</strong>
              <small>{r.sub}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="pp-fld">
        <label htmlFor="pp-ed">Edición</label>
        <select id="pp-ed" value={edicion} onChange={(e) => set({ ed: e.target.value })}>
          {EDICIONES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className="pp-lbl">{cat.unitLabel}</p>
        <div className={`pp-units${rk === "impact" ? "" : " pp-units--lista"}`} role="group" aria-label={cat.unitLabel}>
          {cat.units.map((u) => {
            const est = estados.get(u.key);
            return (
              <button
                key={u.key}
                type="button"
                className="pp-u"
                style={{ background: u.color, color: u.on }}
                aria-pressed={u.key === unidad.key}
                aria-label={`${nombreUnidad(rk, u)}${u.pri ? ", priorizado" : ""}${est ? `, informe ${est}` : ", sin informe"}`}
                title={u.name}
                onClick={() => set({ u: u.key, paso: "0" })}
              >
                {rk === "impact" ? u.short : <span>{u.short} · {u.name}</span>}
                {u.pri && rk === "impact" && <i className="pp-u__pri" aria-hidden="true" />}
                {est === "publicado" && <i className="pp-u__pub" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="pp-leyenda">
          {rk === "impact" && <span>Punto oscuro: ODS priorizados (4, 5, 10 y 17).</span>}
          <span>Punto blanco: informe publicado.</span>
        </div>
      </div>
    </aside>
  );

  let cuerpo: ReactNode;
  if (informes.isPending) cuerpo = <p role="status">Cargando los informes…</p>;
  else if (informes.error) cuerpo = <ErrorAviso error={informes.error} onReintentar={() => void informes.refetch()} />;
  else if (!informe) {
    cuerpo = (
      <div className="pp-crear">
        <h3>Todavía no hay informe de {nombreUnidad(rk, unidad)} para {edicion}</h3>
        <p>
          Al crearlo empiezas por las fuentes. Pilo lee solo lo que dejes marcado, arma el libro de cifras y escribe el borrador; nada se publica hasta que lo apruebes.
        </p>
        <button
          type="button"
          className="button-primary"
          disabled={crear.isPending}
          onClick={() => crear.mutate({ ranking: rk, unit_key: unidad.key, edition: edicion, title_es: tituloPorDefecto(rk, unidad), title_en: nombreUnidad(rk, unidad, "en") })}
        >
          {crear.isPending ? "Creando…" : `Crear el informe de ${edicion}`}
        </button>
        {crear.error && <ErrorAviso error={crear.error} />}
      </div>
    );
  } else {
    const props: EtapaProps = { informe, ranking: rk, unidad, pilo, corrida, ir };
    const Etapa = [EtapaFuentes, EtapaTablero, EtapaGraficos, EtapaNarrativa, EtapaDiagramacion, EtapaPublicar][paso];
    const teclas = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = (i + d + ETAPAS.length) % ETAPAS.length;
      set({ paso: String(n) });
      document.getElementById(`pp-etapa-${n}`)?.focus();
    };
    cuerpo = (
      <>
        <div className="pp-stepper" role="tablist" aria-label="Etapas del informe">
          {ETAPAS.map((t, i) => (
            <button key={t} type="button" role="tab" id={`pp-etapa-${i}`} aria-selected={i === paso} aria-controls="pp-panel" tabIndex={i === paso ? 0 : -1} className={i < paso ? "pp-done" : ""} onClick={() => ir(i)} onKeyDown={(e) => teclas(e, i)}>
              <span className="pp-n" aria-hidden="true">
                {i < paso ? "✓" : i + 1}
              </span>
              {t}
            </button>
          ))}
        </div>
        <BarraPilo corrida={corrida} />
        <div id="pp-panel" role="tabpanel" aria-labelledby={`pp-etapa-${paso}`} key={`${informe.id}-${paso}`} className="pp-panel">
          <Etapa {...props} />
        </div>
      </>
    );
  }

  return (
    <div className="pp" style={varsAcento(unidad) as CSSProperties}>
      {rail}
      <div className="pp-main">
        {cabeza}
        {cuerpo}
      </div>
      <aside className="pp-aside" aria-label="Estado del informe">
        {informe ? <Lateral informe={informe} pilo={pilo} /> : <Reglas />}
      </aside>
    </div>
  );
}

function Reglas() {
  return (
    <div className="pp-card pp-card--pad">
      <h4>Reglas de evidencia</h4>
      <ul className="pp-reglas">
        <li>Cada afirmación lleva cita literal de la nota o del documento.</li>
        <li>Las cifras salen del libro verificado, nunca del modelo.</li>
        <li>Lo que escribe una persona no lo pisa Pilo.</li>
        <li>Fotos de menores solo con autorización de imagen.</li>
        <li>THE Impact: solo evidencia pública, sin enlaces ni menús.</li>
      </ul>
    </div>
  );
}

function Lateral({ informe, pilo }: { informe: InformePP; pilo: EstadoPilo }) {
  const fuentes = useFuentes(informe.id);
  const cifras = useCifras(informe.id);
  const bloques = useBloques(informe.id);
  const f = fuentes.data ?? [];
  const inc = f.filter((x) => x.include);
  const cuenta = (k: string) => inc.filter((x) => x.kind === k).length;
  const bl = bloques.data ?? [];
  const ejes = bl.filter((b) => b.kind === "texto" && b.sec !== "portada" && b.enabled);
  const conCita = ejes.filter((b) => citasDe(b).length > 0).length;
  const conValor = (cifras.data ?? []).filter((c) => c.value !== null).length;
  const ESTADO = { borrador: "Borrador", revision: "En revisión", publicado: "Publicado" } as const;

  return (
    <>
      <div className="pp-card pp-card--pad">
        <div className="pp-pilo">
          <div className="pp-pilo__av" aria-hidden="true">
            P
          </div>
          <div>
            <strong>Pilo leerá {inc.length} fuentes</strong>
            <br />
            <span>
              {cuenta("noticia")} noticias · {cuenta("indicador")} indicadores · {cuenta("libro")} libros · {cuenta("documento")} documentos · {cuenta("cifras")} cifras
            </span>
          </div>
        </div>
        <p className={`pp-estado-pilo${pilo.lista ? " pp-estado-pilo--ok" : ""}`} role="status">
          {pilo.cargando ? "Comprobando a Pilo…" : !pilo.desplegada ? "La función pilo-publica aún no está desplegada." : pilo.lista ? `Pilo está listo${pilo.proveedor ? ` · ${pilo.proveedor}` : ""}${pilo.modelo ? ` · ${pilo.modelo}` : ""}` : `Pilo no está disponible${pilo.motivo ? `: ${pilo.motivo}` : "."}`}
        </p>
      </div>
      <div className="pp-card pp-card--pad">
        <h4>Estado del informe</h4>
        <dl className="pp-meter-l">
          <div>
            <dt>Estado</dt>
            <dd>
              <span className={`pp-pill pp-pill--${informe.state === "publicado" ? "ok" : informe.state === "revision" ? "info" : "warn"}`}>{ESTADO[informe.state]}</span>
            </dd>
          </div>
          <div>
            <dt>Cifras con valor</dt>
            <dd>
              {conValor}/{cifras.data?.length ?? 0}
            </dd>
          </div>
          <div>
            <dt>Gráficos visibles</dt>
            <dd>{bl.filter((b) => b.kind === "grafico" && b.enabled).length}</dd>
          </div>
          <div>
            <dt>Ejes con cita</dt>
            <dd>
              {conCita}/{ejes.length}
            </dd>
          </div>
        </dl>
      </div>
      <Reglas />
    </>
  );
}

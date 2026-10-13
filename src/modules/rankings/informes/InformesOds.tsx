/* =============================================================================
   Informes ODS con Pilo · la pantalla de la intranet.

   /admin/rankings/informes?ods=4&tab=redactar|indicadores|fotos|vista&edicion=2025

   Una mesa de redacción: Pilo, como comunicador social de la UDES, redacta con
   las noticias aprobadas, propone la evidencia de cada indicador de THE y trae
   las fotografías; una persona revisa, corrige y publica.

     franjas      los 17 ODS con su número, el estado de su informe y la marca
                  «2025 importado» (0147); una sola consulta por edición
     cabecera     ODS, edición, estado, cobertura de las notas y «Pasar a
                  revisión» / «Publicar»; las notas de revisión del informe
                  2025 original, plegadas
     barra Pilo   «Que Pilo redacte este ODS» con el avance por tema, las notas
                  fallidas («Reintentar fallidas») y el proveedor de IA
     vistas       Redactar · Libro de cifras · Evidencia por indicador ·
                  Fotografías · Vista previa

   Todo se lee y se guarda en la base (datos.ts); nada vive solo en pantalla.
   Sin animación en lo de todos los días: los cambios son secos.
   ========================================================================== */

import { useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { ODS_NUMEROS, odsCorto, odsNombre, odsVars } from "../ods";
import {
  piloInformeEstado,
  puedePublicar,
  resumenCobertura,
  useNoticiasDeOds,
  useCambiarEstadoInforme,
  useCrearInforme,
  useInforme,
  usePiloInforme,
} from "./datos";
import type { NoticiaOds, ProgresoInforme } from "./datos";
import { indicadoresDe } from "./the-indicadores";
import { useResumenInformes } from "./ajustes-informe";
import type { ResumenInforme } from "./ajustes-informe";
import { InformeCifras } from "./InformeCifras";
import { ProveedorIA } from "./ProveedorIA";
import type { EstadoInforme, InformeCompleto } from "./tipos";
import { InformeRedactar } from "./InformeRedactar";
import { InformeIndicadores } from "./InformeIndicadores";
import { InformeFotos } from "./InformeFotos";
import { InformeVista } from "./InformeVista";
import "./informes.css";

export type VistaInforme = "redactar" | "cifras" | "indicadores" | "fotos" | "vista";

export const VISTAS: { id: VistaInforme; label: string }[] = [
  { id: "redactar", label: "Redactar con Pilo" },
  { id: "cifras", label: "Libro de cifras" },
  { id: "indicadores", label: "Evidencia por indicador" },
  { id: "fotos", label: "Fotografías" },
  { id: "vista", label: "Vista previa" },
];

export const EDICIONES = [2025, 2026];

export const ESTADO_LABEL: Record<EstadoInforme | "sin", string> = {
  sin: "Sin informe",
  borrador: "Borrador",
  revision: "En revisión",
  publicado: "Publicado",
};

/** Lee los parámetros de la dirección con valores seguros. */
export function leerParametros(p: URLSearchParams): { ods: number; tab: VistaInforme; edicion: number } {
  const n = Number(p.get("ods"));
  const ods = Number.isInteger(n) && n >= 1 && n <= 17 ? n : 4;
  const t = p.get("tab");
  const tab = VISTAS.some((v) => v.id === t) ? (t as VistaInforme) : "redactar";
  const e = Number(p.get("edicion"));
  const edicion = EDICIONES.includes(e) ? e : 2025;
  return { ods, tab, edicion };
}

const errorTexto = (e: unknown) => (e instanceof Error ? e.message : e ? String(e) : "");

export function InformesOds() {
  const [params, setParams] = useSearchParams();
  const { ods, tab, edicion } = leerParametros(params);
  const q = useInforme(ods, edicion);
  const resumen = useResumenInformes(edicion);
  const propio = resumen.data?.find((r) => r.ods === ods);

  const cambiar = (cambios: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <div className="ri" style={odsVars(ods)}>
      <SelectorOds actual={ods} resumen={resumen.data} cargando={resumen.isPending} onElegir={(n) => cambiar({ ods: String(n) })} />

      {q.isPending ? (
        <LoadingBlock rows={4} label="Cargando el informe" />
      ) : q.error ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} title="No se pudo cargar el informe" />
      ) : !q.data ? (
        <SinInforme ods={ods} edicion={edicion} onEdicion={(e) => cambiar({ edicion: String(e) })} />
      ) : (
        <ConInforme completo={q.data} resumen={propio} tab={tab} edicion={edicion} onTab={(t) => cambiar({ tab: t })} onEdicion={(e) => cambiar({ edicion: String(e) })} />
      )}
    </div>
  );
}

/* ---------- Los 17 ODS ------------------------------------------------------ */

function SelectorOds({ actual, resumen, cargando, onElegir }: { actual: number; resumen?: ResumenInforme[]; cargando: boolean; onElegir: (n: number) => void }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, n: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const m = ((n - 1 + d + 17) % 17) + 1;
    onElegir(m);
    (e.currentTarget.parentElement?.parentElement?.querySelector(`[data-ods="${m}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <nav className="ri-ods" aria-label="Los 17 ODS">
      <ol>
        {ODS_NUMEROS.map((n) => (
          <li key={n}>
            <FranjaOds n={n} r={resumen?.find((x) => x.ods === n)} cargando={cargando} actual={n === actual} onClick={() => onElegir(n)} onKey={(e) => onKey(e, n)} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function FranjaOds({ n, r, cargando, actual, onClick, onKey }: { n: number; r?: ResumenInforme; cargando: boolean; actual: boolean; onClick: () => void; onKey: (e: KeyboardEvent<HTMLButtonElement>) => void }) {
  const estado: EstadoInforme | "sin" = r ? r.state : "sin";
  const importado = Boolean(r?.legado.importado);
  return (
    <button
      type="button"
      data-ods={n}
      className="ri-franja"
      data-estado={estado}
      aria-current={actual ? "true" : undefined}
      tabIndex={actual ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKey}
      style={odsVars(n) as CSSProperties}
      data-importado={importado ? "" : undefined}
      title={`ODS ${n} · ${odsNombre(n)} · ${ESTADO_LABEL[estado]}${importado ? " · 2025 importado" : ""}`}
    >
      <b className="ri-franja__n">{n}</b>
      <span className="ri-franja__name">{odsCorto(n)}</span>
      <span className="ri-franja__st">{cargando ? "…" : ESTADO_LABEL[estado]}</span>
      {importado && <span className="ri-franja__imp">2025 importado</span>}
    </button>
  );
}

/* ---------- Sin informe ---------------------------------------------------------- */

function Encabezado({ ods, edicion, onEdicion, children }: { ods: number; edicion: number; onEdicion: (e: number) => void; children?: ReactNode }) {
  return (
    <header className="ri-head">
      <span className="ri-head__n" aria-hidden="true">
        {ods}
      </span>
      <div className="ri-head__t">
        <h2>
          ODS {ods} · {odsNombre(ods)}
        </h2>
        <label className="ri-ed">
          Edición
          <select value={edicion} onChange={(e) => onEdicion(Number(e.target.value))}>
            {EDICIONES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
      </div>
      {children}
    </header>
  );
}

function SinInforme({ ods, edicion, onEdicion }: { ods: number; edicion: number; onEdicion: (e: number) => void }) {
  const crear = useCrearInforme();
  return (
    <>
      <Encabezado ods={ods} edicion={edicion} onEdicion={onEdicion} />
      <section className="ri-empty" aria-labelledby="ri-empty-h">
        <h3 id="ri-empty-h">El ODS {ods} todavía no tiene informe de la edición {edicion}.</h3>
        <p>
          Al crearlo, Pilo puede redactar cada sección con las noticias aprobadas en el{" "}
          <Link to={`/admin/rankings/noticias`}>recolector</Link>, proponer la evidencia de cada indicador de THE y traer las fotografías. Nada se
          publica hasta que lo decidas.
        </p>
        <div className="ri-row">
          <button type="button" className="button-primary" disabled={crear.isPending} onClick={() => crear.mutate({ ods, edition: edicion })}>
            {crear.isPending ? "Creando…" : "Crear informe"}
          </button>
        </div>
        {crear.error && (
          <p className="ri-error" role="alert">
            No se pudo crear el informe: {errorTexto(crear.error)}
          </p>
        )}
      </section>
    </>
  );
}

/* ---------- Con informe ----------------------------------------------------------------- */

function ConInforme({
  completo,
  resumen,
  tab,
  edicion,
  onTab,
  onEdicion,
}: {
  completo: InformeCompleto;
  resumen?: ResumenInforme;
  tab: VistaInforme;
  edicion: number;
  onTab: (t: VistaInforme) => void;
  onEdicion: (e: number) => void;
}) {
  const inf = completo.informe;
  const onKeyTabs = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = VISTAS.findIndex((v) => v.id === tab);
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const sig = VISTAS[(i + d + VISTAS.length) % VISTAS.length].id;
    onTab(sig);
    (e.currentTarget.parentElement?.querySelector(`#ri-tab-${sig}`) as HTMLElement | null)?.focus();
  };
  return (
    <>
      <Encabezado ods={inf.ods} edicion={edicion} onEdicion={onEdicion}>
        <EstadoInformeBox completo={completo} />
      </Encabezado>

      <Cobertura completo={completo} resumen={resumen} />

      <BarraPilo completo={completo} resumen={resumen} />

      <div className="ri-tabs" role="tablist" aria-label="Partes del informe">
        {VISTAS.map((v, i) => (
          <button
            key={v.id}
            id={`ri-tab-${v.id}`}
            type="button"
            role="tab"
            className="ri-tab"
            aria-selected={tab === v.id}
            aria-controls="ri-panel"
            tabIndex={tab === v.id ? 0 : -1}
            onClick={() => onTab(v.id)}
            onKeyDown={onKeyTabs}
          >
            <span className="ri-tab__i" aria-hidden="true">
              {i + 1}
            </span>
            {v.label}
          </button>
        ))}
      </div>

      <div id="ri-panel" role="tabpanel" aria-labelledby={`ri-tab-${tab}`} className="ri-panel">
        {tab === "redactar" && <InformeRedactar completo={completo} importado={Boolean(resumen?.legado.importado)} />}
        {tab === "cifras" && <InformeCifras completo={completo} />}
        {tab === "indicadores" && <InformeIndicadores completo={completo} />}
        {tab === "fotos" && <InformeFotos completo={completo} />}
        {tab === "vista" && <InformeVista completo={completo} />}
      </div>
    </>
  );
}

/* ---------- Estado y publicación ------------------------------------------------------------- */

function EstadoInformeBox({ completo }: { completo: InformeCompleto }) {
  const inf = completo.informe;
  const cambiar = useCambiarEstadoInforme();
  const [confirmar, setConfirmar] = useState(false);
  /* La base vuelve a verificar al publicar: si encuentra motivos, no cambia nada y los devuelve. */
  const [motivosBase, setMotivosBase] = useState<string[]>([]);
  const local = puedePublicar(completo);
  const pub = { ok: local.ok && !motivosBase.length, motivos: [...new Set([...local.motivos, ...motivosBase])] };
  const ir = (state: EstadoInforme) => {
    setConfirmar(false);
    setMotivosBase([]);
    cambiar.mutate({ id: inf.id, state }, { onSuccess: (r) => setMotivosBase(r && !r.ok ? r.motivos : []) });
  };
  return (
    <div className="ri-state">
      <p className="ri-state__now">
        <span className="ri-tag" data-estado={inf.state}>
          {ESTADO_LABEL[inf.state]}
        </span>
        {cambiar.isPending && <span className="ri-mute"> Guardando…</span>}
      </p>
      <div className="ri-row">
        {inf.state === "borrador" && (
          <button type="button" className="button-secondary rk-sm" disabled={cambiar.isPending} onClick={() => ir("revision")}>
            Pasar a revisión
          </button>
        )}
        {inf.state !== "publicado" && (
          <button type="button" className="button-primary rk-sm" disabled={cambiar.isPending || !pub.ok} aria-describedby={!pub.ok ? "ri-motivos" : undefined} onClick={() => setConfirmar(true)}>
            Publicar
          </button>
        )}
        {inf.state !== "borrador" && (
          <button type="button" className="button-ghost rk-sm" disabled={cambiar.isPending} onClick={() => ir("borrador")}>
            {inf.state === "publicado" ? "Retirar del portal" : "Volver a borrador"}
          </button>
        )}
      </div>
      {!pub.ok && inf.state !== "publicado" && pub.motivos.length > 0 && (
        <div id="ri-motivos" className="ri-motivos">
          <b>Antes de publicar:</b>
          <ul>
            {pub.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {confirmar && (
        <div className="ri-confirm" role="alertdialog" aria-labelledby="ri-confirm-t">
          <p id="ri-confirm-t">
            El informe del ODS {inf.ods} ({inf.edition}) se verá en el portal público de inmediato, con sus fotografías y el carrusel de noticias.
          </p>
          <div className="ri-row">
            <button type="button" className="button-primary rk-sm" autoFocus onClick={() => ir("publicado")}>
              Sí, publicar
            </button>
            <button type="button" className="button-ghost rk-sm" onClick={() => setConfirmar(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {cambiar.error && (
        <p className="ri-error" role="alert">
          No se cambió el estado: {errorTexto(cambiar.error)}
        </p>
      )}
    </div>
  );
}

/* ---------- Que Pilo redacte este ODS ------------------------------------------------------------- */

/** El avance de Pilo en una frase: qué hace y cuánto lleva. */
export function textoProgreso(p: ProgresoInforme): string {
  const tema = p.tema ? `Tema ${p.tema.indice} de ${p.tema.total}${p.tema.heading ? ` («${p.tema.heading}»)` : ""}` : "";
  const notas = typeof p.cubiertas === "number" && typeof p.totalNotas === "number" ? `${p.cubiertas} de ${p.totalNotas} notas cubiertas` : "";
  const cuenta = (p.paso === "indicadores" || p.paso === "evaluar") && p.total ? `${p.hechos} de ${p.total} indicadores` : "";
  const hechos = [p.escritos && `${p.escritos} párrafos`, p.indicadores && `${p.indicadores} evidencias`, p.fotos && `${p.fotos} fotos`].filter(Boolean).join(", ");
  /* El mensaje ya trae «Tema 3 de 11 · …» mientras redacta: no se repite. */
  const conTema = [tema, notas].filter((x) => x && !p.mensaje.includes(x));
  return [p.mensaje, ...conTema, cuenta, hechos && `Lleva ${hechos}.`].filter(Boolean).join(" · ");
}

/* ---------- Cobertura y notas fallidas ------------------------------------------------------------- */

/** Cuántas notas del ODS cita el relato y cuántas quedan solo en el registro; y, si viene de 2025, sus notas de revisión. */
function Cobertura({ completo, resumen }: { completo: InformeCompleto; resumen?: ResumenInforme }) {
  const notasQ = useNoticiasDeOds(completo.informe.ods);
  const inds = useMemo(() => indicadoresDe(completo.informe.ods), [completo.informe.ods]);
  const cov = resumenCobertura(completo, inds, notasQ.data ?? undefined);
  const legado = resumen?.legado;
  return (
    <div className="ri-cov-bar">
      <dl className="ri-cov-nums">
        <div>
          <dt>Notas del ODS</dt>
          <dd>{notasQ.isPending ? "…" : (cov.notasTotal ?? 0)}</dd>
        </div>
        <div>
          <dt>En el relato</dt>
          <dd>{notasQ.isPending ? "…" : (cov.notasEnNarrativa ?? 0)}</dd>
        </div>
        <div>
          <dt>Solo en el registro</dt>
          <dd>{notasQ.isPending ? "…" : (cov.notasSoloRegistro ?? 0)}</dd>
        </div>
        <div>
          <dt>Evidencias de THE</dt>
          <dd>
            {cov.aprobadas} aprobadas · {cov.propuestas} de {cov.conNoticias} con nota
          </dd>
        </div>
      </dl>
      {legado?.importado && (
        <details className="ri-legado">
          <summary>
            <span className="ri-tag" data-tono="mute">
              Informe 2025 original
            </span>{" "}
            Importado de {legado.fuente || "el informe 2025 publicado"}
            {legado.notas.length ? ` · ${legado.notas.length} notas de revisión` : ""}
          </summary>
          {legado.notas.length ? (
            <ul>
              {legado.notas.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="ri-mute">La importación no dejó notas de revisión para este ODS.</p>
          )}
        </details>
      )}
    </div>
  );
}

/** Las notas que no lograron un párrafo verificable, con su motivo, y «Reintentar fallidas». */
function Fallidas({ resumen, corriendo, puede, onReintentar }: { resumen?: ResumenInforme; corriendo: boolean; puede: boolean; onReintentar: () => void }) {
  const notasQ = useNoticiasDeOds(resumen?.ods ?? 0);
  const notas = new Map<string, NoticiaOds>((notasQ.data ?? []).map((n) => [n.id, n]));
  const fallidas = resumen?.fallidas ?? [];
  if (!fallidas.length) return null;
  return (
    <details className="ri-fallidas">
      <summary>
        {fallidas.length === 1 ? "1 nota" : `${fallidas.length} notas`} sin párrafo verificable{resumen?.temas ? ` · plan de ${resumen.temas} temas` : ""}
      </summary>
      <ul>
        {fallidas.map((f) => (
          <li key={f.news_id}>
            <b>{notas.get(f.news_id)?.title ?? "Nota"}</b> — {f.motivo || "sin motivo"}
          </li>
        ))}
      </ul>
      <p className="ri-mute">Siguen en el registro de actividades del portal.</p>
      <button type="button" className="button-secondary rk-sm ri-pilo-btn" disabled={corriendo || !puede} onClick={onReintentar}>
        Reintentar fallidas
      </button>
    </details>
  );
}

function BarraPilo({ completo, resumen }: { completo: InformeCompleto; resumen?: ResumenInforme }) {
  const inf = completo.informe;
  const estado = useQuery({ queryKey: ["pilo-rankingsod", "estado", inf.ods], queryFn: () => piloInformeEstado(inf.ods), staleTime: 60_000, retry: false });
  const pilo = usePiloInforme(inf.id);
  const lista = estado.data?.lista === true;
  const progreso = textoProgreso(pilo.progreso);
  const avisos = pilo.progreso.avisos;
  const publicado = inf.state === "publicado";
  let texto: string;
  if (pilo.corriendo) texto = progreso || "Pilo está leyendo las notas aprobadas…";
  else if (pilo.error) texto = pilo.faltaMigracion ? "Falta aplicar la migración 0145: Pilo todavía no tiene dónde escribir." : `Pilo se detuvo: ${pilo.error}`;
  else if (publicado) texto = "El informe está publicado: Pilo no lo cambia. Vuelve a borrador para que siga redactando.";
  else if (estado.isPending) texto = "Comprobando que la IA de Pilo esté lista…";
  else if (estado.error) texto = `No se pudo hablar con Pilo: ${errorTexto(estado.error)}. Puedes redactar tú mientras tanto.`;
  else if (!lista) texto = `La IA de Pilo no está lista${estado.data?.motivo ? `: ${estado.data.motivo}` : ""}. Puedes redactar tú mientras tanto.`;
  else if (pilo.progreso.paso === "listo") texto = progreso;
  else texto = "Lee las notas aprobadas, redacta cada sección, propone la evidencia por indicador y prepara las fotografías. No toca lo que escribió una persona.";
  return (
    <section className="ri-pilo" aria-label="Que Pilo redacte este ODS" data-run={pilo.corriendo ? "" : undefined}>
      <div className="ri-pilo__t">
        <b>Que Pilo redacte este ODS</b>
        <span className={pilo.error && !pilo.corriendo ? "ri-error" : "ri-mute"} role="status" aria-live="polite">
          {texto}
        </span>
        {avisos.length > 0 && (
          <details className="ri-avisos">
            <summary>
              {avisos.length === 1 ? "1 aviso" : `${avisos.length} avisos`} de Pilo
            </summary>
            <ul>
              {avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className="ri-row">
        {pilo.corriendo ? (
          <button type="button" className="button-secondary rk-sm" onClick={() => pilo.detener()}>
            Detener
          </button>
        ) : (
          <button type="button" className="button-primary rk-sm" disabled={!lista || publicado} onClick={() => pilo.iniciar()}>
            {pilo.progreso.paso && pilo.progreso.paso !== "listo" ? "Seguir donde iba" : "Que Pilo redacte este ODS"}
          </button>
        )}
      </div>
      <Fallidas resumen={resumen} corriendo={pilo.corriendo} onReintentar={() => pilo.iniciar({ reintentarFallidas: true, sinImagenes: true })} puede={lista && !publicado} />
      <ProveedorIA estado={estado.data} />
      {pilo.corriendo && <span className="ri-pilo__bar" aria-hidden="true" />}
    </section>
  );
}

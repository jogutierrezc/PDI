/* =============================================================================
   Los cuatro pasos del compilador, solo presentación: todo el estado vive en Compilador.tsx.
   Entrada escalonada con GSAP (≤ 500 ms, curva fuerte de salida); con «reducir movimiento» no se anima.
   ========================================================================== */

import { useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MODOS } from "../libro-informe";
import type { ModoAplicacion } from "../libro-informe";
import type { SeccionDef } from "../types";
import { EditorConCifras } from "./Editor";
import type { Resolver } from "./Editor";
import { estadoGrupo, formatoValor, nombreOficial, observacionOficial } from "./logica";
import type { Cobertura, Decisiones, EstadoGrupo, Grupo, LibroRecibido } from "./logica";
import type { BorradorSeccion } from "./logica";
import type { EntradaRegistro } from "./Compilador";

gsap.registerPlugin(useGSAP);
const reducir = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Entrada escalonada de los bloques `[data-in]` de un paso. */
export function useEntrada(ref: RefObject<HTMLElement | null>, dep: unknown = null) {
  useGSAP(
    () => {
      if (reducir() || !ref.current) return;
      gsap.from(ref.current.querySelectorAll("[data-in]"), { autoAlpha: 0, y: 14, duration: 0.5, ease: "expo.out", stagger: 0.06, clearProps: "opacity,visibility,transform" });
    },
    { scope: ref, dependencies: [dep] },
  );
}

const Cab = ({ titulo, texto, kpis, children }: { titulo: string; texto: string; kpis?: ReactNode; children?: ReactNode }) => (
  <div className="cp-head" data-in>
    <div>
      <h2>{titulo}</h2>
      <p>{texto}</p>
    </div>
    <span className="cp-gap" />
    {children}
    {kpis && <div className="cp-kpis">{kpis}</div>}
  </div>
);
const Kpi = ({ n, t, tono }: { n: number | string; t: string; tono?: "ok" | "warn" | "bad" }) => (
  <div className={`cp-kpi${tono ? ` is-${tono}` : ""}`}>
    <b>{n}</b>
    <span>{t}</span>
  </div>
);
const Pill = ({ tono, children, corriendo }: { tono: "ok" | "warn" | "bad" | "idle"; children: ReactNode; corriendo?: boolean }) => <span className={`cp-st is-${tono}${corriendo ? " is-run" : ""}`}>{children}</span>;

const iniciales = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "?";
const PLANTILLA_QUIEN: Record<string, string> = { A: "Decanatura", B: "Vicerrectoría u oficina", C: "Rectoría de campus", D: "Rectoría General" };

/* ---------- 1 · Recibir ------------------------------------------------------------------------ */

export interface PropsRecibir {
  libros: LibroRecibido[];
  plantillaInforme: string;
  adaptar: boolean;
  setAdaptar: (v: boolean) => void;
  editable: boolean;
  ocupado: boolean;
  registro: { origen: string; entradas: EntradaRegistro[] } | null;
  abrirSelector: () => void;
  soltar: (files: File[]) => void;
  quitar: (id: string) => void;
  sinAdaptar: number;
}

export function PasoRecibir(p: PropsRecibir) {
  const raiz = useRef<HTMLElement>(null);
  const abiertos = useRef(new Set<string>());
  useEntrada(raiz);
  const avisos = p.libros.reduce((n, l) => n + l.avisos.length, 0);
  const adaptadas = p.adaptar ? p.libros.filter((l) => l.plantilla.letra && l.plantilla.letra !== p.plantillaInforme).length : 0;
  const filas = p.libros.reduce((n, l) => n + l.libro.bloques.reduce((m, b) => m + b.filas.length, 0), 0);
  return (
    <section ref={raiz} aria-labelledby="cp-h1">
      <div className="cp-head" data-in>
        <div>
          <h2 id="cp-h1">Libros recibidos de los equipos</h2>
          <p>Suba los libros de Excel que devuelven las unidades de apoyo, uno por uno o todos juntos en un ZIP. Pilo comprueba que sean de este informe y reconoce su plantilla (A, B, C o D). Si no es la del informe, la adapta.</p>
        </div>
        <span className="cp-gap" />
        <div className="cp-kpis">
          <Kpi n={p.libros.length} t="libros recibidos" tono={p.libros.length ? "ok" : undefined} />
          <Kpi n={filas} t="filas leídas" />
          <Kpi n={adaptadas} t="plantillas adaptadas" />
          <Kpi n={avisos} t="avisos" tono={avisos ? "warn" : undefined} />
        </div>
      </div>

      <button
        type="button"
        className="cp-drop"
        data-in
        disabled={!p.editable || p.ocupado}
        onClick={p.abrirSelector}
        onDragOver={(e) => (e.preventDefault(), e.currentTarget.classList.add("is-over"))}
        onDragLeave={(e) => e.currentTarget.classList.remove("is-over")}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("is-over");
          p.soltar([...e.dataTransfer.files]);
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
        <div>
          <b>{p.ocupado ? "Leyendo los archivos…" : "Arrastre libros .xlsx o un archivo .zip con todos los libros"}</b>
          <span>El ZIP puede traer carpetas. Pilo ignora lo que no es un libro (archivos temporales, Thumbs.db) y rechaza lo que es de otro informe.</span>
        </div>
      </button>

      {p.registro && (
        <div className="cp-zip" data-in role="status" aria-live="polite">
          <div className="cp-zh">
            <span>{p.registro.origen}</span>
            <span style={{ fontWeight: 500, color: "var(--cp-ink-3)" }}>· {p.registro.entradas.length} archivos</span>
            <span style={{ marginLeft: "auto" }}>
              <Pill tono={p.ocupado ? "idle" : p.registro.entradas.some((e) => e.estado === "rej") ? "warn" : "ok"} corriendo={p.ocupado}>
                {p.ocupado ? "Leyendo" : `${p.registro.entradas.filter((e) => e.estado === "ok").length} recibidos · ${p.registro.entradas.filter((e) => e.estado === "skip").length} ignorados${p.registro.entradas.some((e) => e.estado === "rej") ? ` · ${p.registro.entradas.filter((e) => e.estado === "rej").length} rechazados` : ""}`}
              </Pill>
            </span>
          </div>
          {p.registro.entradas.map((e, i) => (
            <div key={i} className="cp-zrow">
              <i className={e.estado === "ok" ? "ok" : e.estado === "rej" ? "no" : e.estado === "skip" ? "sk" : ""}>{e.estado === "ok" ? "✓" : e.estado === "rej" ? "✕" : e.estado === "skip" ? "–" : ""}</i>
              <span className="cp-mono nm" title={e.nombre}>{e.nombre}</span>
              <span className="zt" style={{ color: e.estado === "ok" ? "var(--cp-ok)" : e.estado === "rej" ? "var(--cp-bad)" : "var(--cp-ink-3)" }}>{e.texto}</span>
            </div>
          ))}
        </div>
      )}

      <div className="cp-tools" data-in>
        <label className="cp-tgl">
          <input type="checkbox" checked={p.adaptar} onChange={(e) => p.setAdaptar(e.target.checked)} /> Adaptar los libros de otra plantilla a la {p.plantillaInforme}
        </label>
        <span className="hx">A es Decanatura, B Vicerrectoría u oficina, C Rectoría de campus y D Rectoría General. Son parecidas: una oficina puede haber usado otra sin querer. Pilo mueve las hojas y columnas, no borra nada y le muestra qué cambió.</span>
      </div>

      {p.sinAdaptar > 0 && (
        <p className="cp-aviso is-bad" role="alert" data-in>
          {p.sinAdaptar} {p.sinAdaptar === 1 ? "libro viene" : "libros vienen"} en otra plantilla y no se adaptan: no entran a la compilación. Active la adaptación para usarlos.
        </p>
      )}

      {!p.libros.length ? (
        <div className="cp-vacio" data-in>
          <b>Todavía no hay libros</b>
          <span style={{ maxWidth: "52ch" }}>Pida a cada unidad de apoyo su libro desde «Libro de Excel» y súbalos aquí. Con un ZIP basta un solo archivo.</span>
        </div>
      ) : (
        <div className="cp-cards">
          {p.libros.map((l) => {
            const letra = l.plantilla.letra;
            const otra = letra !== null && letra !== p.plantillaInforme;
            return (
              <div key={l.id} className="cp-col" data-in>
                <div className="cp-av">{iniciales(l.equipo)}</div>
                <div>
                  <h3>{l.equipo}</h3>
                  <div className="cp-meta">
                    <span className="cp-mono">{l.archivo.split("/").pop()}</span>
                    <span>{l.libro.bloques.reduce((n, b) => n + b.filas.length, 0)} filas</span>
                    <span>{l.origen}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Pill tono={l.avisos.length ? "warn" : "ok"}>{l.avisos.length ? "Con aviso" : "Recibido"}</Pill>
                  {p.editable && (
                    <button type="button" className="cp-btn is-gho is-sm" onClick={() => p.quitar(l.id)} aria-label={`Quitar el libro de ${l.equipo}`}>
                      Quitar
                    </button>
                  )}
                </div>
                <div className="cp-sub cp-tplrow">
                  <span className="cp-pl">{letra ? `Plantilla ${letra}` : "Plantilla sin reconocer"}</span>
                  {letra && <span>{PLANTILLA_QUIEN[letra] ?? "Estructura propia"}.</span>}
                  {otra ? <Pill tono={p.adaptar ? "ok" : "bad"}>{p.adaptar ? `Adaptada a la ${p.plantillaInforme}` : "Sin adaptar"}</Pill> : letra ? <span>Es la del informe: no se cambia nada.</span> : <Pill tono="warn">Clasificada por encabezados</Pill>}
                  {l.plantilla.origen === "estructura" && letra && <span style={{ color: "var(--cp-ink-3)" }}>Deducida de las hojas ({Math.round(l.plantilla.confianza * 100)} %).</span>}
                  <Detalle id={l.id} abiertos={abiertos.current} etiqueta="adaptación">
                    <div className="cp-adp">
                      <b>Qué hizo Pilo con este libro</b>
                      <table>
                        <thead>
                          <tr>
                            <th>Hoja del libro</th>
                            <th>Queda en</th>
                            <th>Cambio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {l.adaptacion.filas.map((f) => (
                            <tr key={f.hoja}>
                              <td>{f.hoja}</td>
                              <td>{f.tituloDestino}</td>
                              <td>
                                {f.cambio === "sin equivalente" ? "Sin equivalente: no se importa" : f.cambio === "igual" ? "Igual" : f.cambio === "hoja renombrada" ? "Hoja renombrada" : `Columnas: ${f.columnas.map((c) => `${c.de} → ${c.a}`).join("; ")}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p style={{ color: "var(--cp-ink-3)" }}>No se borra nada del libro original.</p>
                    </div>
                  </Detalle>
                </div>
                <div className="cp-sub cp-sheets">
                  {l.libro.bloques.map((b) => (
                    <span key={b.hoja} className="cp-sh">
                      {b.hoja}
                    </span>
                  ))}
                </div>
                {l.avisos.length > 0 && (
                  <div className="cp-sub cp-avisos">
                    {l.avisos.map((a) => (
                      <span key={a}>{a}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** «Ver adaptación» / «Ocultar»: un detalle que se abre dentro de la tarjeta. */
function Detalle({ id, abiertos, etiqueta, children }: { id: string; abiertos: Set<string>; etiqueta: string; children: ReactNode }) {
  return (
    <details
      style={{ flexBasis: "100%" }}
      open={abiertos.has(id)}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) abiertos.add(id);
        else abiertos.delete(id);
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, color: "var(--cp-blue)" }}>Ver {etiqueta}</summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  );
}

/* ---------- 2 · Organizar ---------------------------------------------------------------------- */

const ETIQUETA_ESTADO: Record<EstadoGrupo, ["ok" | "warn" | "bad", string]> = { unico: ["ok", "Listo"], unificado: ["ok", "Unificado"], conflicto: ["bad", "Conflicto"], sin_dato: ["warn", "Sin dato"] };

export interface PropsOrganizar {
  grupos: Grupo[];
  decisiones: Decisiones;
  cobertura: Cobertura;
  filtro: "todos" | EstadoGrupo | "unificado";
  setFiltro: (f: PropsOrganizar["filtro"]) => void;
  abierto: Record<string, boolean>;
  alternar: (id: string) => void;
  elegir: (id: string, equipo: string) => void;
  renombrar: (id: string, nombre: string) => void;
  resumen: { listos: number; conflictos: number; sinDato: number; unificados: number };
  editable: boolean;
}

export function PasoOrganizar(p: PropsOrganizar) {
  const raiz = useRef<HTMLElement>(null);
  useEntrada(raiz);
  const lista = p.grupos.filter((g) => p.filtro === "todos" || (p.filtro === "unificado" ? g.obs.length > 1 : estadoGrupo(g, p.decisiones) === p.filtro));
  return (
    <section ref={raiz} aria-labelledby="cp-h2">
      <div className="cp-head" data-in>
        <div>
          <h2 id="cp-h2">Datos organizados por criterio</h2>
          <p>Pilo reúne lo que aportó cada equipo, unifica el nombre de cada indicador y deja como valor oficial el de su fuente primaria.</p>
        </div>
        <span className="cp-gap" />
        <div className="cp-kpis">
          <Kpi n={p.resumen.listos} t="indicadores listos" tono="ok" />
          <Kpi n={p.resumen.conflictos} t="conflictos" tono={p.resumen.conflictos ? "bad" : undefined} />
          <Kpi n={p.resumen.sinDato} t="sin dato" tono={p.resumen.sinDato ? "warn" : undefined} />
          <Kpi n={p.resumen.unificados} t="nombres unificados" />
        </div>
      </div>

      {p.cobertura.secciones.length > 0 && (
        <table className="cp-matrix" data-in>
          <thead>
            <tr>
              <th scope="col">Sección del informe</th>
              {p.cobertura.equipos.map((e) => (
                <th key={e} scope="col">
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.cobertura.secciones.map((s) => (
              <tr key={s.clave}>
                <td>{s.titulo}</td>
                {p.cobertura.equipos.map((e) => (
                  <td key={e}>{s.porEquipo[e] ? <span className="cp-dot">{s.porEquipo[e]}</span> : <span className="cp-dot is-z">·</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="cp-chips" data-in>
        {(
          [
            ["todos", "Todos"],
            ["conflicto", "Conflictos"],
            ["sin_dato", "Sin dato"],
            ["unificado", "Nombre unificado"],
          ] as const
        ).map(([id, t]) => (
          <button key={id} type="button" className="cp-chip" aria-pressed={p.filtro === id} onClick={() => p.setFiltro(id)}>
            {t}
          </button>
        ))}
      </div>

      {!p.grupos.length && (
        <div className="cp-vacio" data-in>
          <b>No hay indicadores para organizar</b>
          <span style={{ maxWidth: "52ch" }}>Los libros recibidos no traen cifras en «Resultados». Las demás hojas (metas, puntos críticos, logros) se importan tal cual y Pilo las usa para redactar.</span>
        </div>
      )}
      {p.grupos.length > 0 && !lista.length && (
        <div className="cp-vacio" data-in>
          <b>Nada en este filtro</b>
        </div>
      )}

      <div>
        {lista.map((g) => {
          const e = estadoGrupo(g, p.decisiones);
          const of = observacionOficial(g, p.decisiones);
          const [tono, etiqueta] = ETIQUETA_ESTADO[e];
          const abierto = !!p.abierto[g.id];
          const distintos = new Set(g.obs.map((o) => o.actual).filter((v) => v !== null)).size > 1;
          const sinNumero = g.obs.filter((o) => o.actual === null && o.actualCrudo);
          return (
            <div key={g.id} className={`cp-item${e === "conflicto" ? " is-bad" : ""}`} data-in>
              <div className="cp-irow">
                <span className="cp-cr">{g.criterio || "Sin criterio"}</span>
                <div className="cp-nm">
                  {nombreOficial(g, p.decisiones)}
                  <small>{g.obs.length === 1 ? "1 equipo lo reportó" : `${g.obs.length} equipos lo reportaron`}</small>
                </div>
                <div className="cp-vl">{of?.actual != null ? <>{formatoValor(of.actual, g.unidad).replace(/ %$/, "")}{/%/.test(g.unidad) && <small>%</small>}</> : <span style={{ fontSize: 15, fontWeight: 600, color: e === "conflicto" ? "var(--cp-bad)" : "var(--cp-warn)" }}>{e === "conflicto" ? "elegir valor" : "sin dato"}</span>}</div>
                <div className="cp-src">
                  <b>{g.fuentePrimaria || "Sin fuente indicada"}</b>fuente primaria <Pill tono={tono}>{etiqueta}</Pill>
                </div>
                <button type="button" className="cp-exp" aria-expanded={abierto} aria-label={`Ver cómo lo escribió cada equipo: ${g.nombre}`} onClick={() => p.alternar(g.id)} />
              </div>
              {abierto && (
                <div className="cp-alias">
                  <h4>Cómo lo escribió cada equipo</h4>
                  {g.obs.map((o) => (
                    <div key={`${o.libroId}-${o.bloque}-${o.indice}`} className="cp-arow">
                      {distintos && o.actual !== null ? <input type="radio" name={`r-${g.id}`} disabled={!p.editable} checked={p.decisiones[g.id]?.eligio === o.equipo} onChange={() => p.elegir(g.id, o.equipo)} aria-label={`Usar el valor de ${o.equipo}`} /> : <span />}
                      <span>
                        <b>{o.equipo}</b>
                      </span>
                      <span className="t">
                        escribió <q>{o.texto}</q> en {o.hoja}, fila {o.fila}
                        {o.fuente ? ` · fuente: ${o.fuente}` : ""}
                      </span>
                      <span className="v">{o.actual !== null ? formatoValor(o.actual, o.unidad) : <Pill tono="warn">sin número</Pill>}</span>
                    </div>
                  ))}
                  {sinNumero.map((o) => (
                    <p key={`n-${o.libroId}-${o.indice}`} className="cp-bad" style={{ margin: "4px 0 0" }}>
                      {o.equipo}: «{o.actualCrudo}» no es un número en Cifra actual. Corríjalo en el libro y vuelva a subirlo.
                    </p>
                  ))}
                  {distintos && (
                    <div className="cp-to">
                      {e === "conflicto" && <span className="cp-bad">Los equipos no coinciden.</span>}
                      <button type="button" className="cp-btn is-sig is-sm" disabled={!p.editable} onClick={() => p.elegir(g.id, "fuente")}>
                        Usar el valor de la fuente primaria
                      </button>
                      <span style={{ fontSize: 12.5, color: "var(--cp-ink-3)" }}>{g.fuentePrimaria || "Sin fuente indicada: se usa el primero con dato"}</span>
                    </div>
                  )}
                  <div className="cp-to">
                    <label htmlFor={`nm-${g.id}`} style={{ color: "var(--cp-ink-2)" }}>
                      Se llamará en el informe:
                    </label>
                    <input id={`nm-${g.id}`} className="cp-in" disabled={!p.editable} defaultValue={nombreOficial(g, p.decisiones)} maxLength={200} onBlur={(ev) => ev.currentTarget.value.trim() !== nombreOficial(g, p.decisiones) && p.renombrar(g.id, ev.currentTarget.value)} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- 3 · Redactar ----------------------------------------------------------------------- */

export interface PropsRedactar {
  secciones: SeccionDef[];
  actual: number;
  elegirSeccion: (i: number) => void;
  borradores: BorradorSeccion[];
  desactualizados: Set<string>;
  trabajo: { clave: string; pasos: string[]; partes: number; palabras: number } | null;
  ocupado: boolean;
  origen: boolean;
  setOrigen: (v: boolean) => void;
  resolver: Resolver;
  editable: boolean;
  redactar: (def: SeccionDef) => void;
  redactarTodas: () => void;
  cancelar: () => void;
  cambiarTexto: (clave: string, texto: string) => void;
  onCifra: (clave: string, el: HTMLElement) => void;
  imagen: (mood: string) => string;
  filasTotal: number;
}

export function PasoRedactar(p: PropsRedactar) {
  const raiz = useRef<HTMLElement>(null);
  useEntrada(raiz);
  const def = p.secciones[p.actual];
  const b = def ? p.borradores.find((x) => x.clave === def.clave) : undefined;
  const trabajando = !!def && p.trabajo?.clave === def.clave;
  const nivelTxt = { rapida: "rápida", compleja: "compleja", investigacion: "investigación" } as Record<string, string>;
  return (
    <section ref={raiz} aria-labelledby="cp-h3">
      <div className="cp-head" data-in>
        <div>
          <h2 id="cp-h3">Borrador del informe</h2>
          <p>Pilo Astra redacta cada sección de texto con los datos ya organizados. Cada cifra se puede tocar para ver quién la aportó. Todo el texto se puede editar.</p>
        </div>
        <span className="cp-gap" />
        <label className="cp-tgl">
          <input type="checkbox" checked={p.origen} onChange={(e) => p.setOrigen(e.target.checked)} /> Marcar el origen de cada dato
        </label>
        {p.ocupado ? (
          <button type="button" className="cp-btn is-gho" onClick={p.cancelar}>
            Cancelar
          </button>
        ) : (
          <button type="button" className="cp-btn is-sig" disabled={!p.editable || !p.secciones.length} onClick={p.redactarTodas}>
            Redactar todas las secciones
          </button>
        )}
      </div>

      {!p.secciones.length ? (
        <div className="cp-vacio" data-in>
          <b>Este informe no tiene secciones de texto que Pilo pueda redactar</b>
        </div>
      ) : (
        <div className="cp-draft" data-in>
          <div className="cp-slist" role="list">
            {p.secciones.map((s, i) => {
              const d = p.borradores.find((x) => x.clave === s.clave);
              const viejo = p.desactualizados.has(s.clave);
              const run = p.trabajo?.clave === s.clave;
              return (
                <button key={s.clave} type="button" role="listitem" className="cp-sbtn" aria-current={i === p.actual} onClick={() => p.elegirSeccion(i)}>
                  <b>{s.titulo}</b>
                  <Pill tono={run ? "idle" : !d ? "idle" : viejo ? "warn" : d.editado ? "warn" : "ok"} corriendo={run}>
                    {run ? "Redactando" : !d ? "Sin redactar" : viejo ? "Datos cambiaron" : d.editado ? "Editado" : "Redactado"}
                  </Pill>
                  <small>{run ? `${p.trabajo!.palabras} palabras · parte ${p.trabajo!.partes || 1}` : d ? `${d.palabras ?? 0} palabras${d.pensamientoS ? ` · ${String(d.pensamientoS).replace(".", ",")} s` : ""}` : "Toque para ver"}</small>
                </button>
              );
            })}
          </div>
          <article className="cp-doc" aria-live="polite">
            {def && (
              <>
                <div className="cp-dh">
                  <h3>{def.titulo}</h3>
                  {b && !trabajando && <Pill tono="idle">{b.palabras ?? 0} palabras</Pill>}
                  {b && !trabajando && <span className="cp-mark">Borrador de Pilo</span>}
                  {trabajando && <Pill tono="idle" corriendo>Redactando</Pill>}
                </div>
                {trabajando ? (
                  <div className="cp-vacio">
                    <img src={p.imagen("piensa")} alt="" />
                    <b>Pilo está razonando…</b>
                    <span>{p.trabajo!.pasos[p.trabajo!.pasos.length - 1] ?? "Leyendo los datos organizados"}</span>
                  </div>
                ) : !b ? (
                  <div className="cp-vacio">
                    <img src={p.imagen("idea")} alt="" />
                    <b>Esta sección aún no tiene borrador</b>
                    <span style={{ maxWidth: "44ch" }}>Pilo la escribirá con los {p.filasTotal} datos ya organizados. Verá su razonamiento a la derecha.</span>
                    <button type="button" className="cp-btn is-sig" disabled={!p.editable || p.ocupado} onClick={() => p.redactar(def)}>
                      Redactar «{def.titulo}»
                    </button>
                  </div>
                ) : (
                  <>
                    {p.desactualizados.has(def.clave) && (
                      <p className="cp-aviso">
                        Cambió un dato después de redactar esta sección.{" "}
                        <button type="button" className="cp-btn is-sig is-sm" disabled={!p.editable || p.ocupado} onClick={() => p.redactar(def)}>
                          Volver a redactar
                        </button>
                      </p>
                    )}
                    <EditorConCifras texto={b.texto} resolver={p.resolver} origen={p.origen} editable={p.editable} onChange={(t) => p.cambiarTexto(def.clave, t)} onCifra={p.onCifra} />
                    <p className="cp-dnote">
                      Pilo Astra 1.0 · nivel {nivelTxt[b.nivel ?? "compleja"] ?? b.nivel}. Escrita en {b.partes ?? 1} {b.partes === 1 ? "parte" : "partes"}, sin tope fijo de longitud. Cuando importe, esta sección queda editable en Mi informe.{" "}
                      <button type="button" className="cp-btn is-gho is-sm" disabled={!p.editable || p.ocupado} onClick={() => p.redactar(def)}>
                        Redactar de nuevo
                      </button>
                    </p>
                  </>
                )}
              </>
            )}
          </article>
        </div>
      )}
    </section>
  );
}

/* ---------- 4 · Aprobar ------------------------------------------------------------------------ */

export interface FilaAprobar {
  clave: string;
  titulo: string;
  filas: number;
  tieneTexto: boolean;
  editado: boolean;
  viejo: boolean;
}
export interface PropsAprobar {
  filas: FilaAprobar[];
  aprobadas: Record<string, boolean>;
  alternar: (clave: string, v: boolean) => void;
  modo: ModoAplicacion;
  setModo: (m: ModoAplicacion) => void;
  resumen: { filas: number; secciones: number; textos: number; avisos: string[]; bloqueado?: string };
  importar: () => void;
  importando: boolean;
  editable: boolean;
}

export function PasoAprobar(p: PropsAprobar) {
  const raiz = useRef<HTMLElement>(null);
  useEntrada(raiz);
  return (
    <section ref={raiz} aria-labelledby="cp-h4">
      <div className="cp-head" data-in>
        <div>
          <h2 id="cp-h4">Aprobar e importar al informe</h2>
          <p>Elija qué pasa al informe principal. Después usted sigue escribiendo y corrigiendo ahí, como en cualquier sección.</p>
        </div>
      </div>
      {p.resumen.bloqueado && (
        <p className="cp-aviso is-bad" role="alert" data-in>
          {p.resumen.bloqueado}
        </p>
      )}
      <div className="cp-appr" data-in>
        {p.filas.map((f) => (
          <div key={f.clave} className="cp-arw">
            <input type="checkbox" id={`ap-${f.clave}`} checked={p.aprobadas[f.clave] !== false} disabled={!p.editable} onChange={(e) => p.alternar(f.clave, e.target.checked)} />
            <label htmlFor={`ap-${f.clave}`}>
              <b>{f.titulo}</b>
              <small>
                {f.filas ? `${f.filas} filas de datos` : "Solo texto"}
                {f.tieneTexto ? ` · texto de Pilo ${f.editado ? "editado por usted" : "sin cambios"}` : ""}
                {f.viejo ? " · los datos cambiaron después de redactar" : ""}
              </small>
            </label>
            {f.tieneTexto ? <Pill tono={f.viejo ? "warn" : "ok"}>{f.viejo ? "Texto desactualizado" : "Con borrador"}</Pill> : <Pill tono="idle">Sin texto</Pill>}
            {f.filas ? <Pill tono="ok">Datos listos</Pill> : <span />}
          </div>
        ))}
        {!p.filas.length && (
          <div className="cp-vacio">
            <b>No hay nada para importar todavía</b>
            <span>Reciba libros o redacte secciones con Pilo.</span>
          </div>
        )}
      </div>
      <h3 style={{ fontSize: 18, margin: "0 0 10px" }} data-in>
        Cómo aplicar lo aprobado
      </h3>
      <div className="cp-modes" data-in>
        {MODOS.map((m) => (
          <label key={m.id} className="cp-mode">
            <input type="radio" name="cp-modo" checked={p.modo === m.id} onChange={() => p.setModo(m.id)} />
            <b>{m.titulo}</b>
            <p>{m.ayuda}</p>
          </label>
        ))}
      </div>
      {p.resumen.avisos.length > 0 && (
        <details className="cp-aviso" data-in open={p.resumen.avisos.length <= 4}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            {p.resumen.avisos.length} {p.resumen.avisos.length === 1 ? "aviso" : "avisos"} antes de importar
          </summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {p.resumen.avisos.slice(0, 40).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
            {p.resumen.avisos.length > 40 && <li>y {p.resumen.avisos.length - 40} avisos más.</li>}
          </ul>
        </details>
      )}
      <div className="cp-sumbar" data-in>
        <div>
          <b>{p.resumen.filas}</b> <span>filas de datos</span>
        </div>
        <div>
          <b>{p.resumen.secciones}</b> <span>{p.resumen.secciones === 1 ? "sección" : "secciones"}</span>
        </div>
        <div>
          <b>{p.resumen.textos}</b> <span>textos de Pilo en borrador</span>
        </div>
        <span className="cp-gap" />
        <button type="button" className="cp-btn is-sig" disabled={!p.editable || p.importando || Boolean(p.resumen.bloqueado) || (p.resumen.filas === 0 && p.resumen.textos === 0)} onClick={p.importar}>
          {p.importando ? "Importando…" : "Aprobar e importar al informe"}
        </button>
      </div>
    </section>
  );
}

/* =============================================================================
   Gestión Master · la bandeja de solicitudes (la pantalla central).

   Lista con filtros (estado, unidad, solicitante y texto; el periodo y la sede
   van arriba), selección múltiple con aprobación o devolución por lote, y el
   detalle al lado: en pantallas anchas una columna, en las demás una hoja que
   llega por la derecha. Contadores que se cuentan al cambiar.

   Teclado: flechas arriba y abajo mueven entre solicitudes, Enter abre el
   detalle, Espacio marca la casilla, Esc cierra el detalle. Lo que se repite a
   diario con el teclado no se anima.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useDecidirLote, useLista } from "./api";
import type { Contexto } from "./contexto";
import { Detalle } from "./Detalle";
import { MIN_NOTA, TIPOS, mensajeDe, nombreSede, resumenLinea, type Estado, type FilaLista } from "./modelo";
import { aparecer, deslizar, salirFilas, useEntrada } from "./movimiento";
import { Cargando, Contador, ErrorCaja, PastillaEstado, Plazo, SinMigracion, Vacio } from "./partes";

type FiltroEstado = "todas" | "decidir" | "mias" | "devuelta" | "aprobada" | "rechazada" | "borrador";

const FILTROS: [FiltroEstado, string][] = [
  ["todas", "Todas"],
  ["decidir", "Esperan decisión"],
  ["mias", "Te corresponden"],
  ["devuelta", "Devueltas"],
  ["aprobada", "Aprobadas"],
  ["rechazada", "Rechazadas"],
  ["borrador", "Mis borradores"],
];

const esperan = (e: Estado) => e === "pendiente" || e === "revision";

export function Bandeja({ ctx, id }: { ctx: Contexto; id?: string }) {
  const lista = useLista(ctx.periodo, ctx.sede);
  const lote = useDecidirLote();
  const [estado, setEstado] = useState<FiltroEstado>("todas");
  const [unidad, setUnidad] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modoLote, setModoLote] = useState<"aprobar" | "devolver" | null>(null);
  const [notaLote, setNotaLote] = useState("");
  const [aviso, setAviso] = useState("");
  const [anuncio, setAnuncio] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLUListElement>(null);
  const panel = useRef<HTMLElement>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const loteRef = useRef<HTMLDivElement>(null);
  const teclado = useRef(false);

  useEffect(() => {
    const marca = () => { teclado.current = true; };
    const suelta = () => { teclado.current = false; };
    window.addEventListener("keydown", marca, true);
    window.addEventListener("pointerdown", suelta, true);
    return () => {
      window.removeEventListener("keydown", marca, true);
      window.removeEventListener("pointerdown", suelta, true);
    };
  }, []);

  const todas = lista.data ?? [];
  const unidades = useMemo(() => Array.from(new Set(todas.map((s) => s.unidad).filter((x): x is string => Boolean(x)))).sort(), [todas]);
  const solicitantes = useMemo(() => Array.from(new Set(todas.map((s) => s.solicitante).filter((x): x is string => Boolean(x)))).sort(), [todas]);

  const visibles = useMemo(
    () =>
      todas.filter((s) => {
        if (estado === "decidir" && !esperan(s.estado)) return false;
        if (estado === "mias" && !s.puedo_decidir) return false;
        if (estado === "devuelta" && s.estado !== "devuelta") return false;
        if (estado === "aprobada" && s.estado !== "aprobada") return false;
        if (estado === "rechazada" && s.estado !== "rechazada") return false;
        if (estado === "borrador" && s.estado !== "borrador") return false;
        if (unidad && s.unidad !== unidad) return false;
        if (solicitante && s.solicitante !== solicitante) return false;
        if (texto) {
          const t = texto.toLowerCase();
          const alcance = `${s.folio} ${s.lineas.map((l) => `${l.codigo ?? ""} ${l.nombre ?? ""}`).join(" ")} ${s.unidad ?? ""} ${s.solicitante ?? ""}`.toLowerCase();
          if (!alcance.includes(t)) return false;
        }
        return true;
      }),
    [todas, estado, unidad, solicitante, texto],
  );

  const cuentas = useMemo(
    () => ({
      esperan: todas.filter((s) => esperan(s.estado)).length,
      mias: todas.filter((s) => s.puedo_decidir).length,
      devueltas: todas.filter((s) => s.estado === "devuelta").length,
      urgentes: todas.filter((s) => esperan(s.estado) && s.dias_restantes !== null && s.dias_restantes <= 1).length,
      aprobadas: todas.filter((s) => s.estado === "aprobada").length,
    }),
    [todas],
  );

  // Entrada escalonada al llegar a la pantalla y al cambiar de periodo o sede; no al teclear en la búsqueda.
  useEntrada(filas, ".gm-fila", `${ctx.periodo}|${ctx.sede}|${lista.isPending}`, !lista.isPending && visibles.length > 0);

  // El detalle llega por el lado; con teclado no se anima.
  useEffect(() => {
    if (id) deslizar(panel.current, fondo.current, teclado.current);
  }, [id]);

  // Esc cierra el detalle.
  useEffect(() => {
    if (!id) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.ir("bandeja");
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [id, ctx]);

  useEffect(() => {
    if (modoLote) aparecer(loteRef.current);
  }, [modoLote]);

  const marcadas = Array.from(sel).filter((i) => todas.some((s) => s.id === i));
  const mias = marcadas.filter((i) => todas.find((s) => s.id === i)?.puedo_decidir);
  const omitidas = marcadas.length - mias.length;
  const todasMarcadas = visibles.length > 0 && visibles.every((s) => sel.has(s.id));

  const alternar = (i: string) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  function teclas(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const botones = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(".gm-fila__abrir"));
    const i = botones.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    botones[Math.max(0, Math.min(botones.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  }

  async function enLote() {
    if (!modoLote || mias.length === 0) return;
    setAviso("");
    try {
      const r = await lote.mutateAsync({ ids: mias, decision: modoLote, nota: notaLote.trim() });
      const bien = r.filter((x) => x.ok).map((x) => x.id);
      const mal = r.filter((x) => !x.ok);
      setAnuncio(`${bien.length} ${bien.length === 1 ? "solicitud" : "solicitudes"} ${modoLote === "aprobar" ? "aprobadas" : "devueltas"}${omitidas ? `, ${omitidas} omitidas porque no te corresponden` : ""}${mal.length ? `, ${mal.length} con error` : ""}.`);
      if (mal.length) setAviso(`No se pudieron decidir ${mal.length}: ${mal.map((m) => m.mensaje).filter((v, i, a) => a.indexOf(v) === i).join(" / ")}`);
      if (estado === "mias" && filas.current) {
        const els = bien.map((i) => filas.current?.querySelector(`[data-id="${i}"]`)).filter((x): x is Element => Boolean(x));
        salirFilas(els, () => undefined);
      }
      setSel(new Set(mal.map((m) => m.id)));
      setModoLote(null);
      setNotaLote("");
    } catch (e) {
      setAviso(mensajeDe(e));
    }
  }

  const sinMigracion = lista.error && /migraci/i.test(lista.error.message);

  return (
    <div className="gm-bandeja" ref={raiz}>
      <div className="gm-contadores" role="group" aria-label="Resumen de la bandeja">
        <Contador valor={cuentas.esperan} etiqueta="Esperan decisión" />
        <Contador valor={cuentas.mias} etiqueta="Te corresponden" />
        <Contador valor={cuentas.devueltas} etiqueta="Devueltas" />
        <Contador valor={cuentas.urgentes} etiqueta="Vencen en 1 día o ya vencidas" />
        <Contador valor={cuentas.aprobadas} etiqueta="Aprobadas" />
      </div>

      <div className="gm-filtros">
        <label className="admin-field">
          <span>Estado</span>
          <select value={estado} onChange={(e) => { setEstado(e.target.value as FiltroEstado); setSel(new Set()); }}>
            {FILTROS.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Unidad</span>
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            <option value="">Todas</option>
            {unidades.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Solicitante</span>
          <select value={solicitante} onChange={(e) => setSolicitante(e.target.value)}>
            <option value="">Todos</option>
            {solicitantes.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Buscar</span>
          <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Folio, código o actividad" autoComplete="off" />
        </label>
      </div>

      <div className="gm-bandeja__cuerpo" data-detalle={Boolean(id)}>
        <div className="gm-bandeja__lista">
          {marcadas.length > 0 && (
            <div className="gm-lote" role="region" aria-label="Acciones en bloque">
              <span>
                <b>
                  {marcadas.length} {marcadas.length === 1 ? "seleccionada" : "seleccionadas"}
                </b>
                {omitidas > 0 && ` · ${omitidas} ${omitidas === 1 ? "no te corresponde y se omitirá" : "no te corresponden y se omitirán"}`}
              </span>
              <button type="button" className="button-primary" disabled={mias.length === 0} onClick={() => setModoLote("aprobar")}>
                Aprobar {mias.length}
              </button>
              <button type="button" className="button-secondary" disabled={mias.length === 0} onClick={() => setModoLote("devolver")}>
                Devolver con nota
              </button>
              <button type="button" className="button-ghost" onClick={() => { setSel(new Set()); setModoLote(null); }}>
                Quitar selección
              </button>
            </div>
          )}
          {modoLote && mias.length > 0 && (
            <div className="gm-confirma gm-confirma--lote" ref={loteRef}>
              <label className="admin-field">
                <span>
                  Nota común para {mias.length} {mias.length === 1 ? "solicitud" : "solicitudes"} (obligatoria, mínimo {MIN_NOTA} caracteres)
                </span>
                <textarea rows={3} value={notaLote} onChange={(e) => setNotaLote(e.target.value)} autoFocus />
              </label>
              <div className="gm-contador-texto">
                <span>
                  {notaLote.trim().length} / {MIN_NOTA} · rechazar se hace una por una
                </span>
              </div>
              <div className="gm-botones">
                <button type="button" className="button-primary" disabled={notaLote.trim().length < MIN_NOTA || lote.isPending} onClick={() => void enLote()}>
                  {lote.isPending ? "Decidiendo…" : modoLote === "aprobar" ? "Confirmar: aprobar en bloque" : "Confirmar: devolver en bloque"}
                </button>
                <button type="button" className="button-ghost" onClick={() => { setModoLote(null); setNotaLote(""); }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {aviso && (
            <p className="gm-aviso" role="alert">
              {aviso}
            </p>
          )}

          {lista.isPending ? (
            <Cargando filas={6} />
          ) : sinMigracion ? (
            <SinMigracion error={lista.error} />
          ) : lista.error ? (
            <ErrorCaja error={lista.error} onReintentar={() => void lista.refetch()} titulo="No se pudo leer la bandeja" />
          ) : todas.length === 0 ? (
            <Vacio
              titulo="Aún no hay solicitudes en este periodo y sede"
              texto={`Cuando alguien envíe una solicitud para ${ctx.sede === "todas" ? "las sedes" : nombreSede(ctx.sede)} aparecerá aquí.`}
              accion={
                ctx.nivel !== "none" && (
                  <button type="button" className="button-primary" onClick={() => ctx.ir("nueva")}>
                    Nueva solicitud
                  </button>
                )
              }
            />
          ) : visibles.length === 0 ? (
            <Vacio
              titulo="Ninguna solicitud con estos filtros"
              texto="Pruebe con otro estado o unidad, o quite la búsqueda."
              accion={
                <button type="button" className="button-secondary" onClick={() => { setEstado("todas"); setUnidad(""); setSolicitante(""); setTexto(""); }}>
                  Quitar filtros
                </button>
              }
            />
          ) : (
            <>
              <div className="gm-lista-cabeza">
                <label className="gm-marcar">
                  <input
                    type="checkbox"
                    checked={todasMarcadas}
                    onChange={(e) =>
                      setSel((p) => {
                        const n = new Set(p);
                        visibles.forEach((s) => (e.target.checked ? n.add(s.id) : n.delete(s.id)));
                        return n;
                      })
                    }
                  />
                  Seleccionar las visibles
                </label>
                <span>
                  {visibles.length} de {todas.length} solicitudes
                </span>
              </div>
              <ul className="gm-filas" ref={filas} onKeyDown={teclas}>
                {visibles.map((s) => (
                  <Fila key={s.id} s={s} abierta={s.id === id} marcada={sel.has(s.id)} onMarcar={() => alternar(s.id)} onAbrir={() => ctx.ir("bandeja", s.id)} />
                ))}
              </ul>
            </>
          )}
        </div>

        {id && <div className="gm-detalle__fondo" ref={fondo} onClick={() => ctx.ir("bandeja")} aria-hidden="true" />}
        {id && (
          <aside className="gm-detalle" ref={panel} aria-label="Detalle de la solicitud">
            <Detalle id={id} ctx={ctx} onCerrar={() => ctx.ir("bandeja")} />
          </aside>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {anuncio}
      </p>
    </div>
  );
}

function Fila({ s, abierta, marcada, onMarcar, onAbrir }: { s: FilaLista; abierta: boolean; marcada: boolean; onMarcar: () => void; onAbrir: () => void }) {
  const resumen = s.lineas.slice(0, 2).map(resumenLinea).join(" · ") + (s.lineas.length > 2 ? ` y ${s.lineas.length - 2} más` : "");
  return (
    <li className="gm-fila" data-id={s.id} data-marcada={marcada} data-abierta={abierta}>
      <label className="gm-fila__casilla">
        <span className="sr-only">Seleccionar {s.folio}</span>
        <input type="checkbox" checked={marcada} onChange={onMarcar} />
      </label>
      <button type="button" className="gm-fila__abrir" onClick={onAbrir} aria-label={`Abrir ${s.folio}, ${resumen}`}>
        <span className="gm-fila__titulo">
          <span className="gm-mono">{s.folio}</span> {resumen || "Sin actividades"}
        </span>
        <span className="gm-fila__sub">
          {TIPOS[s.tipo].nombre} · {s.unidad ?? "Sin unidad"} · {nombreSede(s.sede)} · {s.solicitante ?? "—"}
          {s.prioridad !== "normal" ? ` · prioridad ${s.prioridad}` : ""}
        </span>
      </button>
      <span className="gm-fila__lado">
        <PastillaEstado estado={s.estado} />
        {esperan(s.estado) && s.paso_nombre && (
          <small>
            Paso {s.paso_orden} de {s.total_pasos} · {s.paso_nombre}
          </small>
        )}
        {s.puedo_decidir && <small className="gm-mia">Te corresponde</small>}
        {esperan(s.estado) && <Plazo dias={s.dias_restantes} />}
      </span>
    </li>
  );
}

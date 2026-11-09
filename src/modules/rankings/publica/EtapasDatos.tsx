/* Etapas 1 y 2 de Pilo Publica: Fuentes y Tablero de indicadores.
   Fuentes es UN solo panel: filtros por tipo con su conteo, buscador, «incluidas / sin incluir» y una lista
   densa de una línea por fuente. Antes eran cinco tarjetas separadas y obligaba a bajar y subir sin parar. */

import { useMemo, useState } from "react";
import type { RespuestaFuentes } from "./api";
import { motivoSinPilo } from "./contexto";
import type { EtapaProps } from "./contexto";
import { useFuentes, useIncluirFuentes } from "./datos";
import type { FuentePP, KindFuente } from "./tipos";
import { BotonPilo, ErrorAviso, Interruptor, Vacio } from "./ui";

const KINDS: { kind: KindFuente; plural: string; etiqueta: string }[] = [
  { kind: "noticia", plural: "Noticias", etiqueta: "nota" },
  { kind: "indicador", plural: "Indicadores", etiqueta: "indic." },
  { kind: "libro", plural: "Libros", etiqueta: "libro" },
  { kind: "cifras", plural: "Otras cifras", etiqueta: "cifras" },
  { kind: "documento", plural: "Documentos", etiqueta: "doc." },
];
const ETIQUETA = Object.fromEntries(KINDS.map((k) => [k.kind, k.etiqueta])) as Record<KindFuente, string>;
const ORDEN = Object.fromEntries(KINDS.map((k, i) => [k.kind, i])) as Record<KindFuente, number>;

type Estado = "todas" | "incluidas" | "excluidas";

const fechaDe = (f: FuentePP) => {
  const m = f.meta as Record<string, unknown>;
  return typeof m.date === "string" ? m.date : typeof m.published_on === "string" ? m.published_on : "";
};

/** Lo que se ve a la derecha de cada fuente, en una línea: fecha · oficina, y si es pública o interna. */
function Detalle({ f }: { f: FuentePP }) {
  const m = f.meta as Record<string, unknown>;
  const partes = [fechaDe(f), typeof m.office === "string" ? m.office : ""].filter(Boolean);
  const publica = m.public === true || m.publica === true ? true : m.public === false || m.publica === false ? false : null;
  return (
    <span className="pp-fte__meta">
      {partes.length > 0 && <span>{partes.join(" · ")}</span>}
      {m.minors === true && (
        <span className="pp-warn" title="Aparecen menores: pide autorización de imagen.">
          menores
        </span>
      )}
      {f.kind === "documento" && <span title="Los documentos alimentan las cifras; los ejes se escriben con noticias e indicadores.">solo cifras</span>}
      {publica !== null && <span className={`pp-pub ${publica ? "pp-pub--si" : "pp-pub--no"}`}>{publica ? "Pública" : "Interna"}</span>}
    </span>
  );
}

export function EtapaFuentes(p: EtapaProps) {
  const q = useFuentes(p.informe.id);
  const incluir = useIncluirFuentes();
  const [avisos, setAvisos] = useState<string[]>([]);
  const [resumen, setResumen] = useState<string | null>(null);
  const [tipo, setTipo] = useState<KindFuente | "todas">("todas");
  const [estado, setEstado] = useState<Estado>("todas");
  const [texto, setTexto] = useState("");

  const buscar = async () => {
    const r = await p.corrida.correr<RespuestaFuentes>("Pilo busca fuentes", "fuentes");
    if (r) {
      setAvisos(r.avisos ?? []);
      const n = Object.values(r.fuentes ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      setResumen(`Pilo encontró ${n} fuentes.`);
    }
  };

  const todas = useMemo(() => q.data ?? [], [q.data]);
  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return todas
      .filter((f) => (tipo === "todas" || f.kind === tipo) && (estado === "todas" || (estado === "incluidas" ? f.include : !f.include)) && (!t || `${f.label} ${f.ref}`.toLowerCase().includes(t)))
      .sort((a, b) => ORDEN[a.kind] - ORDEN[b.kind] || fechaDe(b).localeCompare(fechaDe(a)) || (a.label || a.ref).localeCompare(b.label || b.ref, "es"));
  }, [todas, tipo, estado, texto]);

  if (q.isPending) return <p role="status">Cargando las fuentes…</p>;
  if (q.error) return <ErrorAviso error={q.error} onReintentar={() => void q.refetch()} />;

  const marcadas = todas.filter((f) => f.include).length;
  const porTipo = (k: KindFuente) => {
    const f = todas.filter((x) => x.kind === k);
    return { total: f.length, inc: f.filter((x) => x.include).length };
  };
  const faltanVisibles = visibles.filter((f) => !f.include);
  const sobranVisibles = visibles.filter((f) => f.include);

  return (
    <div className="pp-stack">
      <div className="pp-acciones">
        <BotonPilo pilo={p.pilo} corrida={p.corrida} onClick={() => void buscar()}>
          Que Pilo busque fuentes
        </BotonPilo>
        {motivoSinPilo(p.pilo, p.corrida) && !p.corrida.progreso.corriendo && <small className="pp-nota">{motivoSinPilo(p.pilo, p.corrida)}</small>}
        {resumen && (
          <small className="pp-nota" role="status">
            {resumen}
          </small>
        )}
      </div>
      {avisos.length > 0 && (
        <div className="pp-aviso-caja pp-aviso-caja--warn" role="status">
          <strong>Avisos de la búsqueda</strong>
          <ul>
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {todas.length === 0 ? (
        <Vacio titulo="Todavía no hay fuentes">
          Pulsa «Que Pilo busque fuentes»: reúne las noticias aprobadas, los indicadores de las oficinas y las tablas de Datos de Sostenibilidad que corresponden a esta unidad. Después eliges cuáles lee.
        </Vacio>
      ) : (
        <section className="pp-fte" aria-label="Fuentes del informe">
          <div className="pp-fte__barra">
            <div className="pp-fte__tipos" role="group" aria-label="Tipo de fuente">
              <button type="button" className="pp-fte__tipo" aria-pressed={tipo === "todas"} onClick={() => setTipo("todas")}>
                Todas{" "}
                <b>
                  {marcadas}/{todas.length}
                </b>
              </button>
              {KINDS.map((k) => {
                const c = porTipo(k.kind);
                if (!c.total) return null;
                return (
                  <button key={k.kind} type="button" className="pp-fte__tipo" aria-pressed={tipo === k.kind} onClick={() => setTipo(k.kind)}>
                    {k.plural}{" "}
                    <b>
                      {c.inc}/{c.total}
                    </b>
                  </button>
                );
              })}
            </div>
            <div className="pp-fte__herr">
              <input type="search" className="pp-fte__buscar" placeholder="Buscar en las fuentes…" aria-label="Buscar en las fuentes" value={texto} onChange={(e) => setTexto(e.target.value)} />
              <select className="pp-fte__estado" aria-label="Mostrar" value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
                <option value="todas">Todas</option>
                <option value="incluidas">Solo incluidas</option>
                <option value="excluidas">Solo sin incluir</option>
              </select>
              <button type="button" className="pp-btn pp-btn--sm" disabled={faltanVisibles.length === 0 || incluir.isPending} onClick={() => incluir.mutate({ ids: faltanVisibles.map((f) => f.id), include: true })}>
                Incluir las {faltanVisibles.length} visibles
              </button>
              <button type="button" className="pp-btn pp-btn--sm" disabled={sobranVisibles.length === 0 || incluir.isPending} onClick={() => incluir.mutate({ ids: sobranVisibles.map((f) => f.id), include: false })}>
                Quitar las {sobranVisibles.length} visibles
              </button>
            </div>
          </div>
          {visibles.length === 0 ? (
            <p className="pp-fte__vacio">Ninguna fuente coincide con ese filtro.</p>
          ) : (
            <ul className="pp-fte__lista">
              {visibles.map((f) => (
                <li key={f.id} className={`pp-fte__fila${f.include ? "" : " is-off"}`}>
                  <Interruptor marcado={f.include} etiqueta={`Incluir: ${f.label || f.ref}`} deshabilitado={incluir.isPending} onCambio={(v) => incluir.mutate({ ids: [f.id], include: v })} />
                  <span className="pp-kind">{ETIQUETA[f.kind]}</span>
                  <span className="pp-fte__t" title={f.label || f.ref}>
                    {f.label || f.ref}
                  </span>
                  <Detalle f={f} />
                </li>
              ))}
            </ul>
          )}
          <p className="pp-fte__pie">
            {visibles.length} de {todas.length} fuentes a la vista · {marcadas} incluidas en total
          </p>
        </section>
      )}
      {incluir.error && <ErrorAviso error={incluir.error} />}
      <div className="pp-acciones">
        <button type="button" className="button-primary" onClick={() => p.ir(1)}>
          Continuar al tablero →
        </button>
      </div>
    </div>
  );
}

export { EtapaTablero } from "./EtapaTablero";

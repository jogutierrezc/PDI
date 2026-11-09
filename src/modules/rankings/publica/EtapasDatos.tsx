/* Etapas 1 y 2 de Pilo Publica: Fuentes y Tablero de indicadores. */

import { useMemo, useState } from "react";
import type { RespuestaFuentes, RespuestaLibro } from "./api";
import { motivoSinPilo } from "./contexto";
import type { EtapaProps } from "./contexto";
import { useBloques, useBorrarBloque, useCifras, useFuentes, useGuardarBloque, useIncluirFuentes } from "./datos";
import { formato } from "./tipos";
import type { FuentePP, KindFuente } from "./tipos";
import { BotonPilo, ErrorAviso, Interruptor, Tarjeta, Vacio } from "./ui";

const GRUPOS: { kind: KindFuente; titulo: string; vacio: string }[] = [
  { kind: "noticia", titulo: "Noticias aprobadas en el Recolector", vacio: "Aún no hay noticias de esta unidad." },
  { kind: "indicador", titulo: "Indicadores reportados por las oficinas", vacio: "Aún no hay indicadores." },
  { kind: "libro", titulo: "Libros de Datos de Sostenibilidad", vacio: "Sin libros." },
  { kind: "documento", titulo: "Documentos y carpetas", vacio: "Sin documentos." },
  { kind: "cifras", titulo: "Otras cifras (UDES en Cifras, proyectos, Warehouse)", vacio: "Sin otras cifras." },
];

const KIND_ETIQUETA: Record<KindFuente, string> = { noticia: "nota", indicador: "indic.", libro: "libro", documento: "doc.", cifras: "cifras" };

function Detalle({ f }: { f: FuentePP }) {
  const m = f.meta as Record<string, unknown>;
  const partes = [typeof m.date === "string" ? m.date : typeof m.published_on === "string" ? m.published_on : "", typeof m.office === "string" ? m.office : "", typeof m.state === "string" ? m.state : ""].filter(Boolean);
  const publica = m.public === true || m.publica === true ? true : m.public === false || m.publica === false ? false : null;
  return (
    <>
      <small>{partes.join(" · ") || f.ref}</small>
      {m.minors === true && <small className="pp-warn">Aparecen menores: pide autorización de imagen.</small>}
      {publica !== null && <span className={`pp-pub ${publica ? "pp-pub--si" : "pp-pub--no"}`}>{publica ? "Pública" : "Interna"}</span>}
    </>
  );
}

export function EtapaFuentes(p: EtapaProps) {
  const q = useFuentes(p.informe.id);
  const incluir = useIncluirFuentes();
  const [avisos, setAvisos] = useState<string[]>([]);
  const [resumen, setResumen] = useState<string | null>(null);

  const buscar = async () => {
    const r = await p.corrida.correr<RespuestaFuentes>("Pilo busca fuentes", "fuentes");
    if (r) {
      setAvisos(r.avisos ?? []);
      const n = Object.values(r.fuentes ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      setResumen(`Pilo encontró ${n} fuentes.`);
    }
  };

  if (q.isPending) return <p role="status">Cargando las fuentes…</p>;
  if (q.error) return <ErrorAviso error={q.error} onReintentar={() => void q.refetch()} />;
  const todas = q.data;

  return (
    <div className="pp-stack">
      <div className="pp-acciones">
        <BotonPilo pilo={p.pilo} corrida={p.corrida} onClick={() => void buscar()}>
          Que Pilo busque fuentes
        </BotonPilo>
        {motivoSinPilo(p.pilo, p.corrida) && !p.corrida.progreso.corriendo && <small className="pp-nota">{motivoSinPilo(p.pilo, p.corrida)}</small>}
        {resumen && <small className="pp-nota" role="status">{resumen}</small>}
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
      {todas.length === 0 && (
        <Vacio titulo="Todavía no hay fuentes">
          Pulsa «Que Pilo busque fuentes»: reúne las noticias aprobadas, los indicadores de las oficinas y las tablas de Datos de Sostenibilidad que corresponden a esta unidad. Después eliges cuáles lee.
        </Vacio>
      )}
      {GRUPOS.map((g) => {
        const filas = todas.filter((f) => f.kind === g.kind);
        if (todas.length > 0 && filas.length === 0) return null;
        if (todas.length === 0) return null;
        const marcadas = filas.filter((f) => f.include).length;
        return (
          <Tarjeta
            key={g.kind}
            titulo={g.titulo}
            cuenta={`${marcadas}/${filas.length}`}
            acciones={
              <>
                <button type="button" className="pp-btn pp-btn--sm" disabled={marcadas === filas.length || incluir.isPending} onClick={() => incluir.mutate({ ids: filas.filter((f) => !f.include).map((f) => f.id), include: true })}>
                  Todas
                </button>
                <button type="button" className="pp-btn pp-btn--sm" disabled={marcadas === 0 || incluir.isPending} onClick={() => incluir.mutate({ ids: filas.filter((f) => f.include).map((f) => f.id), include: false })}>
                  Ninguna
                </button>
              </>
            }
          >
            <ul className="pp-lista">
              {filas.map((f) => (
                <li key={f.id} className="pp-fila">
                  <span className="pp-kind">{KIND_ETIQUETA[f.kind]}</span>
                  <div className="pp-fila__t">
                    <span>{f.label || f.ref}</span>
                    <Detalle f={f} />
                  </div>
                  <Interruptor marcado={f.include} etiqueta={`Incluir: ${f.label || f.ref}`} deshabilitado={incluir.isPending} onCambio={(v) => incluir.mutate({ ids: [f.id], include: v })} />
                </li>
              ))}
            </ul>
          </Tarjeta>
        );
      })}
      {incluir.error && <ErrorAviso error={incluir.error} />}
      <div className="pp-acciones">
        <button type="button" className="button-primary" onClick={() => p.ir(1)}>
          Continuar al tablero →
        </button>
      </div>
    </div>
  );
}

/* ---------- Tablero ------------------------------------------------------- */

export function EtapaTablero(p: EtapaProps) {
  const cifras = useCifras(p.informe.id);
  const bloques = useBloques(p.informe.id);
  const guardar = useGuardarBloque();
  const borrar = useBorrarBloque();
  const [avisos, setAvisos] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const kpis = useMemo(() => (bloques.data ?? []).filter((b) => b.kind === "kpi"), [bloques.data]);
  const activos = kpis.filter((b) => b.enabled);

  const construir = async () => {
    const r = await p.corrida.correr<RespuestaLibro>("Pilo construye el libro de cifras", "libro");
    if (r) {
      setAvisos(r.avisos ?? []);
      setInfo(`El libro tiene ${r.cifras} cifras (${r.derivadas} calculadas por el sistema).`);
    }
  };

  if (cifras.isPending || bloques.isPending) return <p role="status">Cargando el tablero…</p>;
  if (cifras.error || bloques.error) return <ErrorAviso error={cifras.error ?? bloques.error} onReintentar={() => { void cifras.refetch(); void bloques.refetch(); }} />;

  const libro = cifras.data;
  const bloqueDe = (key: string) => kpis.find((b) => b.spec.cifra === key);

  const destacar = (key: string) => {
    setAviso(null);
    const b = bloqueDe(key);
    if (b?.enabled) return guardar.mutate({ informe_id: p.informe.id, id: b.id, patch: { enabled: false } });
    if (activos.length >= 4) return setAviso("Máximo 4 cifras clave. Quita una para destacar otra.");
    if (b) return guardar.mutate({ informe_id: p.informe.id, id: b.id, patch: { enabled: true } });
    guardar.mutate({ informe_id: p.informe.id, patch: { kind: "kpi", sec: "kpis", pos: kpis.length + 1, spec: { cifra: key } } });
  };

  return (
    <div className="pp-stack">
      <Tarjeta titulo="Cifras clave del informe" cuenta={`${activos.length}/4`}>
        <div className="pp-kpis-adm">
          {activos.length === 0 && <p className="pp-nota">Aún no hay cifras destacadas. Marca hasta 4 con la estrella en la tabla.</p>}
          {activos.map((b) => {
            const c = libro.find((x) => x.key === b.spec.cifra);
            return (
              <div className="pp-kt" key={b.id}>
                <b>{c && c.value !== null ? `${formato(c.value, "es")}${c.unit === "%" ? " %" : ""}` : "—"}</b>
                <span>{c?.label ?? `Falta la cifra ${b.spec.cifra}`}</span>
                {!c || c.value === null ? <small className="pp-warn">La cifra no está en el libro o no tiene valor.</small> : null}
                <button type="button" className="pp-btn pp-btn--sm" onClick={() => borrar.mutate(b.id)} aria-label={`Quitar la cifra clave ${c?.label ?? b.spec.cifra}`}>
                  Quitar
                </button>
              </div>
            );
          })}
        </div>
        {aviso && (
          <p className="pp-warn pp-pad" role="status">
            {aviso}
          </p>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Libro de cifras"
        cuenta={`${libro.length}`}
        acciones={
          <BotonPilo pilo={p.pilo} corrida={p.corrida} chico onClick={() => void construir()}>
            Construir libro de cifras
          </BotonPilo>
        }
      >
        {(info || avisos.length > 0) && (
          <div className="pp-pad" role="status">
            {info && <p className="pp-nota">{info}</p>}
            {avisos.length > 0 && (
              <ul className="pp-warn-lista">
                {avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {libro.length === 0 ? (
          <Vacio titulo="El libro de cifras está vacío">Toda cifra del informe sale de este libro; Pilo nunca teclea una. Pulsa «Construir libro de cifras» para que se arme desde las fuentes marcadas.</Vacio>
        ) : (
          <div className="pp-tabla-x">
            <table className="pp-tabla">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="pp-sr">Destacar</span>
                  </th>
                  <th scope="col">Cifra</th>
                  <th scope="col">Año</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="pp-num">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {libro.map((c) => {
                  const sin = c.value === null;
                  const on = Boolean(bloqueDe(c.key)?.enabled);
                  return (
                    <tr key={c.id}>
                      <td>
                        <button type="button" className="pp-star" aria-pressed={on} disabled={sin && !on} onClick={() => destacar(c.key)} aria-label={`${on ? "Quitar de" : "Destacar en"} las cifras clave: ${c.label}`}>
                          ★
                        </button>
                      </td>
                      <td>
                        <b>{c.label}</b>
                        <div className="pp-mono">
                          {c.key}
                          {c.unit ? ` · ${c.unit}` : ""}
                        </div>
                        {c.derived && c.formula && <div className="pp-mono">= {c.formula}</div>}
                      </td>
                      <td>{c.year ?? "—"}</td>
                      <td>
                        <span className={`pp-pill ${sin ? "pp-pill--mal" : c.derived ? "pp-pill--info" : "pp-pill--ok"}`}>{sin ? "Sin valor" : c.derived ? "Calculada" : "Verificada"}</span>
                      </td>
                      <td className="pp-num">{sin ? "—" : `${formato(c.value as number, "es")}${c.unit === "%" ? " %" : ""}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      {(guardar.error || borrar.error) && <ErrorAviso error={guardar.error ?? borrar.error} />}
      <div className="pp-acciones">
        <button type="button" className="button-secondary" onClick={() => p.ir(0)}>
          ← Fuentes
        </button>
        <button type="button" className="button-primary" onClick={() => p.ir(2)}>
          Continuar a gráficos →
        </button>
      </div>
    </div>
  );
}

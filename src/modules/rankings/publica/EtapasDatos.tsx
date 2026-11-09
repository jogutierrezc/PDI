/* Etapas 1 y 2 de Pilo Publica: Fuentes y Tablero de indicadores. */

import { useState } from "react";
import type { RespuestaFuentes } from "./api";
import { motivoSinPilo } from "./contexto";
import type { EtapaProps } from "./contexto";
import { useFuentes, useIncluirFuentes } from "./datos";
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

export { EtapaTablero } from "./EtapaTablero";

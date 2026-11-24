/* =============================================================================
   Informes ODS con Pilo · Libro de cifras.

   Todas las cifras que Pilo sacó de las notas del ODS (news_figures, 0146),
   cada una con su cita LITERAL y su nota de origen. Paso 1 sin IA (extraer
   con la frase exacta); paso 2 con IA (¿es un logro de la UDES?). La persona
   filtra por tipo y estado y pasa una cifra al bloque «Cifras» del informe
   con su fuente: «Usar en el informe».
   ========================================================================== */

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { piloCifras, useAgregarBloque, useCifrasDeOds, useGuardarBloque, useNoticiasDeOds } from "./datos";
import type { NoticiaOds } from "./datos";
import { FaltaMigracion } from "../noticias";
import type { Bloque, CifraNota, InformeCompleto } from "./tipos";
import { fechaCorta } from "./recorte";

export const TIPOS_CIFRA: { id: CifraNota["kind"]; label: string }[] = [
  { id: "personas", label: "Personas" },
  { id: "instituciones", label: "Instituciones" },
  { id: "horas", label: "Horas" },
  { id: "dinero", label: "Dinero" },
  { id: "porcentaje", label: "%" },
  { id: "eventos", label: "Eventos" },
  { id: "otro", label: "Otras" },
];

export type EstadoCifra = "todas" | "confirmadas" | "revisar" | "descartadas";
const ESTADOS: { id: EstadoCifra; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "confirmadas", label: "Confirmadas por Pilo" },
  { id: "revisar", label: "Sin revisar" },
  { id: "descartadas", label: "No son de la UDES" },
];

/** El estado de una cifra: confirmada (Pilo dijo que es logro de la UDES), sin revisar o descartada (score 0). */
export function estadoCifra(c: Pick<CifraNota, "checked" | "score">): Exclude<EstadoCifra, "todas"> {
  if (!c.checked) return "revisar";
  return c.score > 0 ? "confirmadas" : "descartadas";
}

/** ¿La cifra ya está en el bloque de cifras? Por valor y por nota de origen. */
export function cifraEnInforme(c: Pick<CifraNota, "value" | "news_id">, bloques: Pick<Bloque, "sec" | "figs" | "sources" | "enabled">[]): boolean {
  const v = c.value.replace(/\s/g, "");
  return bloques.some((b) => b.sec === "cifras" && b.enabled && b.figs.some((f) => f.v.replace(/\s/g, "") === v) && b.sources.some((s) => s.news_id === c.news_id));
}

/** Filtra el libro por tipo y estado. */
export function filtrarCifras(cifras: CifraNota[], tipo: CifraNota["kind"] | "todas", estado: EstadoCifra): CifraNota[] {
  return cifras.filter((c) => (tipo === "todas" || c.kind === tipo) && (estado === "todas" || estadoCifra(c) === estado));
}

const errorTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** La cita con la cifra resaltada. */
function Cita({ quote, value }: { quote: string; value: string }) {
  const i = quote.indexOf(value);
  if (!value || i < 0) return <>{quote}</>;
  return (
    <>
      {quote.slice(0, i)}
      <mark>{value}</mark>
      {quote.slice(i + value.length)}
    </>
  );
}

export function InformeCifras({ completo }: { completo: InformeCompleto }) {
  const inf = completo.informe;
  const q = useCifrasDeOds(inf.ods, inf.edition);
  const notasQ = useNoticiasDeOds(inf.ods, inf.edition);
  const notas = useMemo(() => new Map((notasQ.data ?? []).map((n) => [n.id, n])), [notasQ.data]);
  const guardar = useGuardarBloque();
  const agregar = useAgregarBloque();
  const cliente = useQueryClient();
  const [tipo, setTipo] = useState<CifraNota["kind"] | "todas">("todas");
  const [estado, setEstado] = useState<EstadoCifra>("confirmadas");
  const [pilo, setPilo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const cifras = q.data ?? [];
  const lista = filtrarCifras(cifras, tipo, estado);
  const porNota = new Map<string, CifraNota[]>();
  for (const c of lista) porNota.set(c.news_id, [...(porNota.get(c.news_id) ?? []), c]);
  const cuenta = (t: CifraNota["kind"] | "todas") => filtrarCifras(cifras, t, estado).length;
  const bloqueCifras = completo.bloques.find((b) => b.sec === "cifras" && b.enabled && !b.spare);

  const armar = async () => {
    setPilo(true);
    setError("");
    try {
      const r = await piloCifras({ report_id: inf.id });
      setAviso(r.motivo || `Pilo extrajo ${r.extraidas} cifras y confirmó ${r.confirmadas}.${r.quedan ? ` Quedan ${r.quedan} por revisar: vuelve a pedírselo.` : ""}`);
      void cliente.invalidateQueries({ queryKey: ["informe"] });
    } catch (e) {
      setError(`Pilo no pudo armar el libro: ${errorTexto(e)}`);
    } finally {
      setPilo(false);
    }
  };

  const usar = (c: CifraNota, n?: NoticiaOds) => {
    setError("");
    const fig = { v: c.value, label: c.label, src: n?.title ?? "Noticia UDES" };
    const fuente = { news_id: c.news_id, quote: c.quote, kind: "noticia" as const };
    const ok = { onSuccess: () => setAviso(`«${c.value} ${c.label}» quedó en el bloque de cifras, con su fuente.`), onError: (e: unknown) => setError(`No se añadió: ${errorTexto(e)}`) };
    if (bloqueCifras) guardar.mutate({ ...bloqueCifras, figs: [...bloqueCifras.figs, fig], sources: [...bloqueCifras.sources, fuente] }, ok);
    else agregar.mutate({ report_id: inf.id, sec: "cifras", text: `${c.value} ${c.label}.`, figs: [fig], sources: [fuente] }, ok);
  };

  return (
    <div className="ri-libro">
      <div className="ri-edhead">
        <p className="ri-lead">
          Cada cifra lleva la frase exacta de la nota de donde sale. Pilo primero las extrae (sin IA) y después revisa cuáles son logros de la UDES. Elige las que van al
          informe: entran al bloque «Cifras» con su fuente.
        </p>
        <button type="button" className="button-secondary rk-sm ri-pilo-btn" disabled={pilo} onClick={() => void armar()}>
          {pilo ? "Pilo está leyendo las cifras…" : cifras.length ? "Que Pilo revise las cifras" : "Que Pilo arme el libro de cifras"}
        </button>
      </div>

      <div className="ri-row ri-filtros">
        <div className="ri-seg" role="group" aria-label="Tipo de cifra">
          <button type="button" aria-pressed={tipo === "todas"} onClick={() => setTipo("todas")}>
            Todas <small>{cuenta("todas")}</small>
          </button>
          {TIPOS_CIFRA.map((t) => (
            <button key={t.id} type="button" aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
              {t.label} <small>{cuenta(t.id)}</small>
            </button>
          ))}
        </div>
        <label className="ri-field ri-field--row">
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoCifra)}>
            {ESTADOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {aviso && (
        <p className="ri-msg" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="ri-error" role="alert">
          {error}
        </p>
      )}
      {q.error instanceof FaltaMigracion ? (
        <p className="ri-gap">{q.error.message}</p>
      ) : q.error ? (
        <p className="ri-error">No se pudo leer el libro de cifras: {errorTexto(q.error)}</p>
      ) : q.isPending ? (
        <p className="ri-mute">Cargando el libro de cifras…</p>
      ) : !cifras.length ? (
        <p className="ri-gap">El libro de cifras está vacío. Pídele a Pilo que lo arme con las notas aprobadas del ODS.</p>
      ) : !lista.length ? (
        <p className="ri-mute">Ninguna cifra con ese filtro.</p>
      ) : (
        <div className="ri-libro__notas">
          {[...porNota.entries()].map(([id, cs]) => {
            const n = notas.get(id);
            return (
              <section key={id} className="ri-libro__nota" aria-label={n?.title ?? "Nota"}>
                <header>
                  <b>{n?.title ?? "Nota"}</b>
                  <small>{[fechaCorta(n?.published_on), n?.section, n?.campus].filter(Boolean).join(" · ")}</small>
                </header>
                <ul>
                  {cs.map((c) => {
                    const st = estadoCifra(c);
                    const usada = cifraEnInforme(c, completo.bloques);
                    return (
                      <li key={c.id} className="ri-cifra" data-estado={st}>
                        <span className="ri-cifra__v">{c.value}</span>
                        <span className="ri-cifra__b">
                          <span className="ri-cifra__l">
                            {c.label}
                            {c.unit && c.unit !== c.label && <small> · {c.unit}</small>}
                          </span>
                          <q className="ri-cifra__q">
                            <Cita quote={c.quote} value={c.value} />
                          </q>
                          <span className="ri-row">
                            <span className="ri-tag" data-tono="mute">
                              {TIPOS_CIFRA.find((t) => t.id === c.kind)?.label ?? c.kind}
                            </span>
                            <span className="ri-tag" data-tono={st === "confirmadas" ? "ok" : st === "descartadas" ? "bad" : "warn"}>
                              {st === "confirmadas" ? "Confirmada por Pilo" : st === "descartadas" ? "No es logro de la UDES" : "Sin revisar"}
                            </span>
                          </span>
                        </span>
                        <span className="ri-cifra__act">
                          {usada ? (
                            <span className="ri-tag" data-tono="ok">
                              En el informe
                            </span>
                          ) : (
                            <button type="button" className="button-ghost rk-sm" disabled={guardar.isPending || agregar.isPending} onClick={() => usar(c, n)}>
                              Usar en el informe
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

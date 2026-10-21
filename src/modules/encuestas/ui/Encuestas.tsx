/* =============================================================================
   Encuestas con Pilo · el panel (/admin/encuestas).

   Cabecera de la encuesta (título editable, enlace público, abrir o cerrar) y
   dos pestañas: «Respuestas», una tabla tipo hoja de cálculo, y «Título y
   mensajes», lo que Pilo dice. «Nueva encuesta» espera al editor de preguntas.
   Ve quien tiene la pantalla y capacidad de Responsable; edita Planeación o más.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminShell, ReadOnlyNotice } from "../../admin/components/AdminShell";
import { ErrorBlock } from "../../../components/ui/QueryState";
import { useAuth } from "../../../lib/auth";
import { FaltaMigracionEncuestas, useAportes, useCambiarEstado, useEncuestas, useGuardarEncuesta } from "../datos";
import { puedeEditarEncuestas } from "../lib/permisos";
import { resumir } from "../lib/tabla";
import { ConfigEncuesta } from "./ConfigEncuesta";
import { TablaRespuestas } from "./TablaRespuestas";
import "./encuestas.css";

type Pestana = "resp" | "cfg";

export function Encuestas() {
  const { profile } = useAuth();
  const editor = puedeEditarEncuestas(profile?.role);
  const lista = useEncuestas();
  const [params, setParams] = useSearchParams();
  const encuesta = useMemo(() => lista.data?.find((e) => e.slug === params.get("encuesta")) ?? lista.data?.[0] ?? null, [lista.data, params]);
  const aportes = useAportes(encuesta?.id);
  const estado = useCambiarEstado(encuesta?.id ?? "");
  const guardar = useGuardarEncuesta(encuesta?.id ?? "");
  const [pestana, setPestana] = useState<Pestana>("resp");
  const [aviso, setAviso] = useState("");
  const temporizador = useRef<number>();

  const decir = (texto: string) => {
    setAviso(texto);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setAviso(""), 3500);
  };
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const resumen = useMemo(() => resumir(aportes.data ?? []), [aportes.data]);
  const enlace = encuesta ? `${window.location.origin}/encuesta/${encuesta.slug}` : "";

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      decir("Enlace copiado.");
    } catch {
      decir("No se pudo copiar. Selecciónelo y use Ctrl+C.");
    }
  };

  const alTeclearPestanas = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const siguiente: Pestana = pestana === "resp" ? "cfg" : "resp";
    setPestana(siguiente);
    document.getElementById(`en-tab-${siguiente}`)?.focus();
  };

  const cuerpo = () => {
    if (lista.isPending) return <p className="admin-loading">Buscando las encuestas…</p>;
    if (lista.error) {
      return lista.error instanceof FaltaMigracionEncuestas ? (
        <p className="en-nota" role="alert">
          {lista.error.message} Aplíquela en Supabase y vuelva a esta pantalla.
        </p>
      ) : (
        <ErrorBlock error={lista.error} />
      );
    }
    if (!encuesta) return <p className="en-nota">Todavía no hay encuestas creadas.</p>;
    return (
      <div className="en-shell">
        <aside className="en-lateral">
          <h2 className="en-lateral__t">Encuestas</h2>
          <ul className="en-lista">
            {lista.data.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="en-item"
                  aria-current={e.id === encuesta.id ? "true" : undefined}
                  onClick={() => {
                    const n = new URLSearchParams(params);
                    n.set("encuesta", e.slug);
                    setParams(n, { replace: true });
                  }}
                >
                  <b>{e.titulo}</b>
                  <small>{e.abierta ? "Abierta" : "Cerrada"}</small>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="en-item en-item--nueva" aria-disabled="true" aria-describedby="en-nueva-h" onClick={() => decir("Nueva encuesta llega con el editor de preguntas.")}>
                <b>Nueva encuesta</b>
                <small id="en-nueva-h">Llega con el editor de preguntas</small>
              </button>
            </li>
          </ul>
          <p className="en-hint">Cada encuesta tiene su propio título, su enlace público y su tabla de respuestas.</p>
        </aside>

        <section className="en-principal">
          <div className="en-tarjeta">
            <div className="en-cabeza">
              <div className="en-cabeza__izq">
                <div className="en-titulo">
                  <h2>{encuesta.titulo}</h2>
                  {editor && (
                    <button
                      type="button"
                      className="en-icono"
                      aria-label="Cambiar el título de la encuesta"
                      title="Cambiar el título"
                      onClick={() => {
                        setPestana("cfg");
                        window.setTimeout(() => {
                          document.getElementById("en-c-titulo")?.focus();
                        }, 0);
                      }}
                    >
                      <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 15l1-4L13.5 1.5l3 3L7 14l-4 1zM11.5 3.5l3 3" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="en-meta">
                  <span className="en-pill" data-s={encuesta.abierta ? "abierta" : "cerrada"}>
                    <i aria-hidden="true" />
                    {encuesta.abierta ? "Abierta" : "Cerrada"}
                  </span>
                  <span>
                    Recibidas <b>{resumen.recibidas}</b>
                  </span>
                  <span>
                    <b>{resumen.logros}</b> logros
                  </span>
                  <span>
                    <b>{resumen.retos}</b> retos
                  </span>
                  <span>
                    <b>{resumen.dependencias}</b> dependencias
                  </span>
                  <span>
                    <b>{resumen.cifras}</b> cifras
                  </span>
                </div>
              </div>
              <div className="en-enlace">
                <label htmlFor="en-url">Enlace público</label>
                <div className="en-fila">
                  <input id="en-url" className="en-url" readOnly value={enlace} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="en-btn" onClick={() => void copiarEnlace()}>
                    Copiar
                  </button>
                </div>
                <div className="en-fila">
                  <Link className="en-btn" to={`/encuesta/${encuesta.slug}`} target="_blank" rel="noopener">
                    Ver como lo ve el público
                  </Link>
                  {editor && (
                    <button
                      type="button"
                      className="en-btn"
                      disabled={guardar.isPending}
                      onClick={() =>
                        guardar.mutate(
                          { abierta: !encuesta.abierta },
                          { onSuccess: () => decir(encuesta.abierta ? "Encuesta cerrada: el enlace ya no recibe respuestas." : "Encuesta abierta: el enlace recibe respuestas."), onError: (e) => decir(e.message) },
                        )
                      }
                    >
                      {encuesta.abierta ? "Cerrar encuesta" : "Reabrir encuesta"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="en-pestanas" role="tablist" aria-label="Vistas de la encuesta" onKeyDown={alTeclearPestanas}>
              <button type="button" role="tab" id="en-tab-resp" aria-selected={pestana === "resp"} aria-controls="en-panel-resp" tabIndex={pestana === "resp" ? 0 : -1} onClick={() => setPestana("resp")}>
                Respuestas
              </button>
              <button type="button" role="tab" id="en-tab-cfg" aria-selected={pestana === "cfg"} aria-controls="en-panel-cfg" tabIndex={pestana === "cfg" ? 0 : -1} onClick={() => setPestana("cfg")}>
                Título y mensajes
              </button>
            </div>

            {pestana === "resp" ? (
              aportes.isPending ? (
                <p className="admin-loading">Leyendo las respuestas…</p>
              ) : aportes.error ? (
                <ErrorBlock error={aportes.error} />
              ) : (
                <TablaRespuestas
                  aportes={aportes.data}
                  slug={encuesta.slug}
                  puedeEditar={editor}
                  onEstado={(id, e) => estado.mutate({ id, estado: e }, { onSuccess: () => decir("Estado actualizado."), onError: (err) => decir(`No se pudo cambiar el estado: ${err.message}`) })}
                  onAviso={decir}
                />
              )
            ) : (
              <ConfigEncuesta
                key={`${encuesta.id}:${encuesta.updated_at}`}
                encuesta={encuesta}
                puedeEditar={editor}
                guardando={guardar.isPending}
                onGuardar={(c) => guardar.mutate(c, { onSuccess: () => decir("Cambios guardados."), onError: (e) => decir(`No se pudo guardar: ${e.message}`) })}
              />
            )}
          </div>
        </section>
        <p className="en-aviso" role="status" data-on={aviso ? "1" : undefined}>
          {aviso}
        </p>
      </div>
    );
  };

  return (
    <AdminShell section="encuestas" kicker="Encuestas con Pilo" title="Encuestas con Pilo" description="Encuestas públicas que Mr. Pilo conduce, con la tabla de lo que responde cada dependencia.">
      {!editor && <ReadOnlyNotice />}
      {cuerpo()}
    </AdminShell>
  );
}

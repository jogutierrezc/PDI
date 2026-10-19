/* =============================================================================
   Contactos · público · lo que esta persona ya envió. Puede quitar lo suyo mientras
   su campus no haya enviado la hoja a revisión (la base lo comprueba).
   ========================================================================== */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { misContactos, quitarContactos, sesionVencida } from "../api";
import type { Sesion } from "../api";

const cuando = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export function MisAportes({ token, sesion, onVolver, onSesionVencida }: { token: string; sesion: Sesion; onVolver: () => void; onSesionVencida: () => void }) {
  const cliente = useQueryClient();
  const clave = ["int-contactos", "mis", token, sesion.aportante_id];
  const mis = useQuery({ queryKey: clave, queryFn: () => misContactos(token, sesion), retry: false });
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const quitar = useMutation({
    mutationFn: () => quitarContactos(token, sesion, [...marcados]),
    onSuccess: (r) => {
      setMensaje(r.quitadas === 1 ? "Se quitó 1 contacto." : `Se quitaron ${r.quitadas} contactos.`);
      setMarcados(new Set());
      setConfirmar(false);
      void cliente.invalidateQueries({ queryKey: ["int-contactos", "mis", token] });
    },
    onError: (e) => {
      if (sesionVencida(e)) return onSesionVencida();
      setMensaje(e instanceof Error ? e.message : "No se pudo quitar.");
      setConfirmar(false);
    },
  });

  const filas = mis.data?.filas ?? [];
  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  useEffect(() => {
    if (mis.error && sesionVencida(mis.error)) onSesionVencida();
  }, [mis.error]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando llega el error

  return (
    <div className="cp-card" data-entra>
      <div className="cp-acciones">
        <h1>
          Lo que ya envió <span className="cp-ayuda">· {filas.length}</span>
        </h1>
        <button type="button" className="cp-btn" onClick={onVolver}>
          Volver
        </button>
      </div>
      {mensaje && (
        <p className="cp-aviso" role="status">
          {mensaje}
        </p>
      )}
      {mis.isPending ? (
        <p className="cp-ayuda">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="cp-ayuda">Todavía no ha enviado contactos.</p>
      ) : (
        <ul className="cp-mis">
          {filas.map((f) => (
            <li key={f.id}>
              <label style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", flex: 1, cursor: "pointer" }}>
                <input type="checkbox" checked={marcados.has(f.id)} onChange={() => alternar(f.id)} style={{ marginTop: 4 }} aria-label={`Elegir a ${f.datos.propio_first_name ?? ""} ${f.datos.propio_last_name ?? ""}`} />
                <span>
                  <b>{[f.datos.propio_first_name, f.datos.propio_last_name].filter(Boolean).join(" ")}</b>
                  <small>
                    {[f.datos.propio_email, f.datos.propio_institution ?? f.datos.propio_company_name, f.datos.propio_country].filter(Boolean).join(" · ")}
                  </small>
                  <small>
                    {f.tipo === "academico" ? "Académico" : "Empleador"} · {f.origen === "excel" ? `Excel${f.archivo ? ` (${f.archivo})` : ""}` : "A mano"} · {cuando(f.creado)}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {marcados.size > 0 &&
        (confirmar ? (
          <div className="cp-acciones">
            <span>
              ¿Quitar {marcados.size} {marcados.size === 1 ? "contacto" : "contactos"}? No se puede deshacer.
            </span>
            <span style={{ display: "flex", gap: "var(--space-3)" }}>
              <button type="button" className="cp-btn" onClick={() => setConfirmar(false)}>
                No
              </button>
              <button type="button" className="cp-btn cp-btn--pri" disabled={quitar.isPending} onClick={() => quitar.mutate()}>
                {quitar.isPending ? "Quitando…" : "Sí, quitar"}
              </button>
            </span>
          </div>
        ) : (
          <div className="cp-acciones">
            <span className="cp-ayuda">{marcados.size} elegidos</span>
            <button type="button" className="cp-btn" onClick={() => setConfirmar(true)}>
              Quitar los elegidos
            </button>
          </div>
        ))}
    </div>
  );
}

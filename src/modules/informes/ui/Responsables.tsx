/* =============================================================================
   Responsables de una unidad · cajón abierto desde el Tablero del ciclo.
   Quién puede escribir el informe de la unidad con su usuario: lista de integrantes con su
   papel (Gestor, Contribuyente, Consulta), marca de los asignados desde Informes, búsqueda
   de personas, cambio de papel, quitar y «Restablecer». La base repite el permiso (solo
   Planeación): ocultar un botón nunca es la única defensa.
   ========================================================================== */

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAsignarResponsable, useBuscarPersonas, useQuitarResponsable, useResponsables, useRestablecerResponsables } from "../mejoras-datos";
import { AYUDA_PAPEL, ETIQUETA_PAPEL, hayAsignados } from "../mejoras-logica";
import { iniciales } from "../tablero-logica";
import type { PapelResponsable, ResponsableRow } from "../types";
import { Cargando, mensajeDe } from "./comunes";

const PAPELES: PapelResponsable[] = ["jefe", "editor", "visor"];
const FOCALIZABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Cajón lateral accesible: rol de diálogo, foco atrapado, Escape y regreso del foco a quien lo abrió. */
export function Cajon({ titulo, subtitulo, onCerrar, children }: { titulo: string; subtitulo?: string; onCerrar: () => void; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const cierre = useRef(onCerrar);
  cierre.current = onCerrar;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const sobre = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    caja.current?.querySelector<HTMLElement>("[data-cajon-foco]")?.focus();
    return () => {
      document.body.style.overflow = sobre;
      previo?.focus?.();
    };
  }, []);

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      cierre.current();
      return;
    }
    if (e.key !== "Tab" || !caja.current) return;
    const lista = [...caja.current.querySelectorAll<HTMLElement>(FOCALIZABLES)].filter((x) => x.offsetParent !== null);
    if (!lista.length) return;
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };

  return (
    <div className="inf-resp-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div ref={caja} className="inf-resp" role="dialog" aria-modal="true" aria-labelledby={idTitulo} onKeyDown={teclado}>
        <header className="inf-resp__cab">
          <div>
            <span className="inf-eyebrow">{subtitulo}</span>
            <h3 id={idTitulo}>{titulo}</h3>
          </div>
          <button type="button" className="inf-btn inf-btn--ghost inf-resp__x" onClick={onCerrar} data-cajon-foco aria-label="Cerrar">
            Cerrar
          </button>
        </header>
        <div className="inf-resp__cuerpo">{children}</div>
      </div>
    </div>
  );
}

export function Responsables({ unidad, onCerrar }: { unidad: { id: string; nombre: string }; onCerrar: () => void }) {
  const lectura = useResponsables(unidad.id);
  const asignar = useAsignarResponsable();
  const quitar = useQuitarResponsable();
  const restablecer = useRestablecerResponsables();
  const [aviso, setAviso] = useState("");
  const [confirmando, setConfirmando] = useState<"restablecer" | string | null>(null);

  const filas = lectura.data?.filas ?? [];
  const falta = Boolean(lectura.data?.falta);
  const error = [lectura.error, asignar.error, quitar.error, restablecer.error].find((e): e is Error => e instanceof Error);

  const cambiar = (r: ResponsableRow, rol: PapelResponsable) => {
    setAviso("");
    asignar.mutate({ unit: unidad.id, profile: r.profile_id, rol }, { onSuccess: () => setAviso(`${r.nombre || r.correo} ahora es ${ETIQUETA_PAPEL[rol]}.`) });
  };

  return (
    <Cajon titulo={unidad.nombre} subtitulo="Responsables del informe" onCerrar={onCerrar}>
      <p className="inf-sub">Quién puede escribir el informe de esta unidad con su usuario. Los papeles son los de la unidad: cambiarlos aquí los cambia en toda la plataforma.</p>

      <ul className="inf-resp__leyenda" aria-label="Qué hace cada papel">
        {PAPELES.map((p) => (
          <li key={p}>
            <b>{ETIQUETA_PAPEL[p]}</b>
            <span>{AYUDA_PAPEL[p]}</span>
          </li>
        ))}
      </ul>

      {falta && (
        <p className="inf-error" role="alert">
          Falta aplicar la migración 0279 (Informes · mejoras). Mientras tanto no se pueden ver ni asignar responsables desde aquí.
        </p>
      )}
      {error && !falta && (
        <p className="inf-error" role="alert">
          {mensajeDe(error)}
        </p>
      )}
      <p className="inf-sr" role="status" aria-live="polite">
        {aviso}
      </p>

      <section aria-labelledby="inf-resp-int">
        <h4 id="inf-resp-int" className="inf-resp__sub">
          Integrantes de la unidad
        </h4>
        {lectura.isPending ? (
          <Cargando texto="Cargando los integrantes…" />
        ) : filas.length === 0 ? (
          <p className="inf-vacio">{falta ? "No disponible hasta aplicar la migración." : "Esta unidad todavía no tiene integrantes. Busque a una persona para asignarla."}</p>
        ) : (
          <ul className="inf-resp__lista">
            {filas.map((r) => {
              const nombre = r.nombre || r.correo || "Sin nombre";
              const ocupado = asignar.isPending || quitar.isPending || restablecer.isPending;
              return (
                <li key={r.profile_id} className="inf-resp__fila">
                  <span className="inf-resp__avatar" aria-hidden="true">
                    {iniciales(r.nombre, r.correo)}
                  </span>
                  <div className="inf-resp__quien">
                    <b>{nombre}</b>
                    <small>{r.correo}</small>
                    {r.asignado && <span className="inf-pill is-blue">Asignado desde Informes</span>}
                  </div>
                  <select className="inf-in inf-resp__papel" value={r.rol} disabled={ocupado || falta} aria-label={`Papel de ${nombre}`} onChange={(e) => cambiar(r, e.target.value as PapelResponsable)}>
                    {PAPELES.map((p) => (
                      <option key={p} value={p}>
                        {ETIQUETA_PAPEL[p]}
                      </option>
                    ))}
                  </select>
                  {confirmando === r.profile_id ? (
                    <div className="inf-resp__confirma" role="group" aria-label={`Confirmar quitar a ${nombre}`}>
                      <p>{r.asignado ? "Se deshace esta asignación: vuelve a su papel anterior en la unidad, o sale si no era integrante." : "Esta persona deja de ser integrante de la unidad."}</p>
                      <div className="inf-row">
                        <button
                          type="button"
                          className="inf-btn inf-btn--sm inf-btn--riesgo"
                          disabled={ocupado}
                          onClick={() => quitar.mutate({ unit: unidad.id, profile: r.profile_id }, { onSuccess: () => { setConfirmando(null); setAviso(`${nombre} ya no figura como responsable.`); } })}
                        >
                          {quitar.isPending ? "Quitando…" : "Sí, quitar"}
                        </button>
                        <button type="button" className="inf-btn inf-btn--sm" onClick={() => setConfirmando(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="inf-btn inf-btn--sm" disabled={ocupado || falta} onClick={() => setConfirmando(r.profile_id)}>
                      Quitar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Buscar unidadId={unidad.id} integrantes={filas} deshabilitado={falta} asignar={asignar} onListo={(m) => setAviso(m)} />

      <section className="inf-resp__restablecer" aria-labelledby="inf-resp-res">
        <h4 id="inf-resp-res" className="inf-resp__sub">
          Restablecer responsables
        </h4>
        {confirmando === "restablecer" ? (
          <div className="inf-resp__confirma" role="group" aria-label="Confirmar el restablecimiento">
            <p>
              Las personas asignadas desde Informes vuelven al estado anterior: recuperan el papel que tenían en la unidad o salen si no eran integrantes. Quienes ya estaban en la unidad no se tocan.
            </p>
            <div className="inf-row">
              <button
                type="button"
                className="inf-btn inf-btn--sm inf-btn--riesgo"
                disabled={restablecer.isPending}
                onClick={() =>
                  restablecer.mutate(
                    { unit: unidad.id },
                    { onSuccess: (n) => { setConfirmando(null); setAviso(n ? `Se restablecieron ${n} ${n === 1 ? "persona" : "personas"}.` : "No había nada que restablecer."); } },
                  )
                }
              >
                {restablecer.isPending ? "Restableciendo…" : "Sí, restablecer"}
              </button>
              <button type="button" className="inf-btn inf-btn--sm" onClick={() => setConfirmando(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="inf-hint">Deshace solo lo asignado desde Informes. No toca a los demás integrantes.</p>
            <button type="button" className="inf-btn inf-btn--sm" disabled={falta || !hayAsignados(filas) || restablecer.isPending} onClick={() => setConfirmando("restablecer")}>
              Restablecer responsables
            </button>
            {!falta && !lectura.isPending && !hayAsignados(filas) && <span className="inf-hint"> No hay asignaciones hechas desde Informes.</span>}
          </>
        )}
        {aviso && (
          <p className="inf-resp__ok" aria-hidden="true">
            {aviso}
          </p>
        )}
      </section>
    </Cajon>
  );
}

function Buscar({
  unidadId,
  integrantes,
  deshabilitado,
  asignar,
  onListo,
}: {
  unidadId: string;
  integrantes: ResponsableRow[];
  deshabilitado: boolean;
  asignar: ReturnType<typeof useAsignarResponsable>;
  onListo: (mensaje: string) => void;
}) {
  const [q, setQ] = useState("");
  const [diferido, setDiferido] = useState("");
  const [roles, setRoles] = useState<Record<string, PapelResponsable>>({});
  useEffect(() => {
    const t = setTimeout(() => setDiferido(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const busqueda = useBuscarPersonas(diferido);
  const ya = new Map(integrantes.map((i) => [i.profile_id, i.rol] as const));
  const corto = q.trim().length < 2;

  return (
    <section aria-labelledby="inf-resp-bus">
      <h4 id="inf-resp-bus" className="inf-resp__sub">
        Agregar a una persona
      </h4>
      <label className="inf-lab">
        Buscar por nombre o correo
        <input className="inf-in" type="search" value={q} onChange={(e) => setQ(e.target.value)} disabled={deshabilitado} placeholder="Al menos 2 letras" autoComplete="off" />
      </label>
      <div aria-live="polite">
        {corto ? null : busqueda.isFetching ? (
          <Cargando texto="Buscando…" />
        ) : busqueda.error ? (
          <p className="inf-error" role="alert">
            {mensajeDe(busqueda.error)}
          </p>
        ) : (busqueda.data ?? []).length === 0 ? (
          <p className="inf-vacio">Nadie coincide con «{q.trim()}».</p>
        ) : (
          <ul className="inf-resp__lista">
            {(busqueda.data ?? []).map((p) => {
              const rolActual = ya.get(p.id);
              const nombre = p.nombre || p.correo;
              return (
                <li key={p.id} className="inf-resp__fila">
                  <span className="inf-resp__avatar" aria-hidden="true">
                    {iniciales(p.nombre, p.correo)}
                  </span>
                  <div className="inf-resp__quien">
                    <b>{nombre}</b>
                    <small>{p.correo}</small>
                    {rolActual && <span className="inf-pill">Ya es {ETIQUETA_PAPEL[rolActual]}</span>}
                  </div>
                  <select
                    className="inf-in inf-resp__papel"
                    value={roles[p.id] ?? rolActual ?? "editor"}
                    onChange={(e) => setRoles({ ...roles, [p.id]: e.target.value as PapelResponsable })}
                    aria-label={`Papel que tendrá ${nombre}`}
                  >
                    {PAPELES.map((r) => (
                      <option key={r} value={r}>
                        {ETIQUETA_PAPEL[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="inf-btn inf-btn--sm inf-btn--pri"
                    disabled={asignar.isPending}
                    onClick={() => {
                      const rol = roles[p.id] ?? rolActual ?? "editor";
                      asignar.mutate({ unit: unidadId, profile: p.id, rol }, { onSuccess: () => onListo(`${nombre} quedó como ${ETIQUETA_PAPEL[rol]}.`) });
                    }}
                  >
                    {rolActual ? "Cambiar papel" : "Asignar"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

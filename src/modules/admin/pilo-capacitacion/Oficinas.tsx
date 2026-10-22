/* =============================================================================
   Capacitación de Pilo · Oficinas y permisos.

   Planeación decide qué capas puede enseñar cada oficina y si lo que propone
   un contribuyente exige aprobación del Gestor. Cada cambio se guarda al
   momento en pilo_capacitacion_oficinas (0180). Sin 0180, los interruptores
   quedan apagados y se muestran los valores de partida: la página lo dice arriba.

   Esta entrega guarda los permisos; la función de Pilo todavía no los aplica.
   ========================================================================== */

import { useState } from "react";
import { ErrorBlock } from "../../../components/ui/QueryState";
import { Switch, StatusMark } from "../pilo/ui";
import { Skeleton } from "../pilo-ensenanza/ui";
import { OFICINAS_PARTIDA, useOficinas, useSaveOficina } from "./store";
import type { OficinaPermiso } from "./store";

type Campo = "ensena_institucional" | "ensena_academica" | "exige_aprobacion";

const ROLES = [
  { name: "Gestor", can: "Aprueba y publica en la memoria, retira respuestas y administra a su equipo." },
  { name: "Contribuyente", can: "Propone respuestas, carga documentos y responde la bandeja de su oficina." },
  { name: "Consulta", can: "Ve el estado de la memoria y lo que se ha enseñado, sin cambiar nada." },
];

export function Oficinas({ missing }: { missing: boolean }) {
  const q = useOficinas();
  const save = useSaveOficina();
  const [sel, setSel] = useState(0);

  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending || !q.data) return <Skeleton rows={4} label="Leyendo los permisos" />;

  const rows = q.data.rows;
  const cur = rows[sel];
  const off = missing || save.isPending;
  const patch = (campo: Campo, valor: boolean) => {
    const next: OficinaPermiso = { ...cur, [campo]: valor };
    save.mutate(next);
  };

  return (
    <div className="pis-sheet">
      <div className="pis-group">
        <div className="pis-group__head">
          <h3>Del borrador a la memoria</h3>
        </div>
        <ol className="pcap-flujo">
          <li>
            <strong>Contribuyente</strong>
            <span>Propone: escribe la respuesta o carga el documento desde la bandeja.</span>
          </li>
          <li>
            <strong>Gestor de la oficina</strong>
            <span>Aprueba: revisa el contenido y confirma capa y público.</span>
          </li>
          <li>
            <strong>Pilo</strong>
            <span>Aprende: entra a la memoria unificada y se indexa por significado.</span>
          </li>
          <li>
            <strong>graphify</strong>
            <span>Se anota: queda el qué, el porqué y quién lo enseñó.</span>
          </li>
        </ol>
      </div>

      <div className="pis-group">
        <div className="pis-group__head">
          <h3>Oficinas con acceso</h3>
          <small>{rows.length} oficinas</small>
        </div>
        {save.isError && (
          <p className="pis-error" role="alert">
            No se guardó el permiso: {(save.error as Error).message}
          </p>
        )}
        <div className="pcap-of">
          <ul className="pcap-of__list">
            {rows.map((r, i) => (
              <li key={r.oficina}>
                <button type="button" className="pcap-of__btn press" aria-pressed={i === sel} onClick={() => setSel(i)}>
                  <span>{r.oficina}</span>
                  <span className="pcap-of__capas">
                    {r.ensena_institucional && <span className="pcap-tag" data-capa="institucional"><i aria-hidden="true" />Institucional</span>}
                    {r.ensena_academica && <span className="pcap-tag" data-capa="academica"><i aria-hidden="true" />Académica</span>}
                    {!r.ensena_institucional && !r.ensena_academica && <span className="pcap-tag" data-capa="ninguna"><i aria-hidden="true" />Solo consulta</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="pcap-of__detail">
            <div className="pcap-of__head">
              <h4>{cur.oficina}</h4>
              <p>{OFICINAS_PARTIDA[sel].topics}</p>
            </div>

            <div className="pcap-permisos">
              <span className="pen-field__label">Qué puede enseñar</span>
              <PermisoRow
                titulo="Pilo Institucional"
                nota="Administrativos, colaboradores, Consejo Directivo"
                on={cur.ensena_institucional}
                off={off}
                label={`${cur.oficina} puede enseñar a Pilo Institucional`}
                onChange={(v) => patch("ensena_institucional", v)}
              />
              <PermisoRow
                titulo="Pilo Académico"
                nota="Profesores y estudiantes"
                on={cur.ensena_academica}
                off={off}
                label={`${cur.oficina} puede enseñar a Pilo Académico`}
                onChange={(v) => patch("ensena_academica", v)}
              />
              <PermisoRow
                titulo="Exige aprobación del Gestor"
                nota="Apagado, lo que propongan los contribuyentes entra directo"
                on={cur.exige_aprobacion}
                off={off}
                label={`${cur.oficina} exige aprobación del Gestor`}
                onChange={(v) => patch("exige_aprobacion", v)}
              />
            </div>

            <div className="pcap-roles">
              <span className="pen-field__label">Quiénes pueden hacer qué</span>
              {ROLES.map((r) => (
                <div key={r.name} className="pcap-rol">
                  <strong>{r.name}</strong>
                  <span>{r.can}</span>
                </div>
              ))}
            </div>

            <p className="pis-small">Sin capa activa, la oficina solo consulta. Lo que enseñó antes de un cambio de permiso se conserva.</p>
            {!missing && (
              <p className="pis-small">
                <StatusMark tone="warn">Esta entrega guarda los permisos; la función de Pilo todavía no los aplica.</StatusMark>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PermisoRow({ titulo, nota, on, off, label, onChange }: { titulo: string; nota: string; on: boolean; off: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <div className="pcap-srow">
      <span>
        <strong>{titulo}</strong>
        <small>{nota}</small>
      </span>
      <Switch on={on} disabled={off} onChange={onChange} label={label} />
    </div>
  );
}

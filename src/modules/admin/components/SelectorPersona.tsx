/* =============================================================================
   Selector de personas del directorio de la intranet (el mismo que usa Mis
   Tableros para invitar). Lo comparten el equipo de una oficina de Datos de
   Sostenibilidad y los editores del CMS.
   ========================================================================== */

import { useMemo } from "react";
import { useProfiles } from "../../tableros/store";

export function SelectorPersona({
  value,
  onChange,
  excluir,
  etiqueta = "Quién",
}: {
  value: string;
  onChange: (id: string) => void;
  /** Personas que ya están y no deben ofrecerse. */
  excluir: Set<string>;
  etiqueta?: string;
}) {
  const perfiles = useProfiles();
  const candidatos = useMemo(() => (perfiles.data ?? []).filter((p) => !excluir.has(p.id)).slice(0, 200), [perfiles.data, excluir]);
  return (
    <label className="admin-field">
      <span>{etiqueta}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Elija a alguien…</option>
        {candidatos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.email}
            {p.unit ? ` · ${p.unit}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

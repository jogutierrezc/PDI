/* =============================================================================
   «Pilo redacta» para cualquier espacio de análisis. Pilo escribe un borrador y
   quien elabora el informe lo edita: el texto cae en el mismo campo de siempre,
   con su marca de borrador, y se puede deshacer. Si el campo ya tiene texto,
   Pilo parte de él y lo mejora, no lo borra sin preguntar.
   ========================================================================== */

import { useState } from "react";
import { mensajeDe } from "./comunes";

interface Props {
  /** Pide el borrador a Pilo con lo que ya hay escrito. */
  pedir: (actual: string) => Promise<{ texto: string; avisos?: string[] }>;
  texto: string;
  onTexto: (t: string) => void;
  /** Etiqueta del botón. */
  etiqueta?: string;
  /** Tamaño pequeño para campos dentro de una lista. */
  pequeno?: boolean;
}

export function PiloAyuda({ pedir, texto, onTexto, etiqueta = "Pilo redacta un borrador", pequeno = true }: Props) {
  const [estado, setEstado] = useState<{ cargando: boolean; error: string; avisos: string[]; previo: string | null }>({ cargando: false, error: "", avisos: [], previo: null });

  const lanzar = async () => {
    const hay = texto.trim().length > 0;
    if (hay && !window.confirm("Pilo parte de lo que ya escribió y lo reemplaza por su versión; podrá deshacerlo. ¿Continuar?")) return;
    setEstado({ cargando: true, error: "", avisos: [], previo: null });
    try {
      const r = await pedir(texto);
      onTexto(r.texto);
      setEstado({ cargando: false, error: "", avisos: r.avisos ?? [], previo: hay ? texto : "" });
    } catch (e) {
      setEstado({ cargando: false, error: mensajeDe(e), avisos: [], previo: null });
    }
  };

  return (
    <span className="inf-row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
      {estado.previo !== null && <span className="inf-pill is-teal">Borrador de Pilo · edítelo a su gusto</span>}
      <button type="button" className={`inf-btn${pequeno ? " inf-btn--sm" : ""}`} onClick={() => void lanzar()} disabled={estado.cargando}>
        {estado.cargando ? "Pilo está escribiendo…" : texto.trim() ? "Pilo mejora el texto" : etiqueta}
      </button>
      {estado.previo !== null && (
        <button
          type="button"
          className="inf-btn inf-btn--sm inf-btn--ghost"
          onClick={() => {
            onTexto(estado.previo ?? "");
            setEstado({ cargando: false, error: "", avisos: [], previo: null });
          }}
        >
          Deshacer
        </button>
      )}
      {estado.error && (
        <span className="inf-error" role="alert">
          {estado.error}
        </span>
      )}
      {estado.avisos.length > 0 && <span className="inf-hint">{estado.avisos.join(" · ")}</span>}
    </span>
  );
}

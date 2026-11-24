/* =============================================================================
   Correos · el HTML de una plantilla.

   El alcance (solo el cuerpo, o el correo entero), el texto y la lista de
   comprobaciones. La lista la arma `revisarHtml`, la misma lógica que usa el
   envío: lo que aquí dice que se quitaría, es lo que se quitaría.
   ========================================================================== */

import { useMemo } from "react";
import { Icon } from "../../../components/ui/Icon";
import { revisarHtml, TOPE_HTML, type Alcance, type TipoPlantilla } from "./servidor-logica";

const ICONO = { ok: "check", aviso: "alert", mal: "close" } as const;

export function PlantillaHtml({
  html,
  alcance,
  tipo,
  onHtml,
  onAlcance,
  onFocus,
  textarea,
}: {
  html: string;
  alcance: Alcance;
  tipo: TipoPlantilla;
  onHtml: (valor: string) => void;
  onAlcance: (valor: Alcance) => void;
  onFocus: () => void;
  textarea: (el: HTMLTextAreaElement | null) => void;
}) {
  const revision = useMemo(() => revisarHtml(html, tipo), [html, tipo]);

  return (
    <>
      <div className="cor-dos">
        <label className="admin-field">
          <span>Alcance del HTML</span>
          <select value={alcance} onChange={(e) => onAlcance(e.target.value === "completo" ? "completo" : "cuerpo")}>
            <option value="cuerpo">Solo el cuerpo: la cabecera y el pie de la marca se mantienen</option>
            <option value="completo">El correo completo: sin la marca alrededor</option>
          </select>
        </label>
        <p className="cor-chica cor-alinear">Al enviar, el sistema quita scripts, formularios y eventos. Los estilos van en línea, como en cualquier correo.</p>
      </div>

      <label className="admin-field">
        <span>
          HTML
          <small>Pueden usarse los datos de abajo.</small>
        </span>
        <textarea
          ref={textarea}
          className="cor-html"
          rows={14}
          spellCheck={false}
          value={html}
          maxLength={TOPE_HTML}
          onFocus={onFocus}
          onChange={(e) => onHtml(e.target.value)}
        />
      </label>

      <ul className="cor-revision" aria-label="Lista de comprobaciones">
        {revision.map((r) => (
          <li key={r.texto} data-tono={r.tono}>
            <Icon name={ICONO[r.tono]} size={15} />
            <span>{r.texto}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

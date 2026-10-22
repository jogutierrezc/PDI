/* =============================================================================
   Encuestas con Pilo · textos del logro y del reto.

   Para el bloque de logros y retos: lo que dice Pilo y lo que se lee en cada
   subpaso (título, descripción, cifras), por separado para el logro y el reto.
   Un campo vacío usa el texto por defecto, que se ve como sugerencia dentro.
   ========================================================================== */

import { useState } from "react";
import type { Pregunta } from "../lib/estructura";
import { GRUPOS_TEXTO, hayTextosPropios, ponerTextoAporte, TEXTOS_POR_DEFECTO } from "../lib/textosAporte";
import type { TipoAporteTexto } from "../lib/textosAporte";
import type { CambioPregunta } from "./Lienzo";

export function TextosAporteSeccion({ p, puedeEditar, onCambiar }: { p: Pregunta; puedeEditar: boolean; onCambiar: CambioPregunta }) {
  const [tipo, setTipo] = useState<TipoAporteTexto>("logro");
  const propios = p.textos?.[tipo] ?? {};

  return (
    <section className="ed-card ed-pad" aria-labelledby={`ed-tx-h-${p.id}`}>
      <h3 id={`ed-tx-h-${p.id}`} className="ed-h3">
        Textos del logro y del reto
      </h3>
      <p className="ed-fino">Cambie lo que dice Pilo y lo que se lee en cada paso. Si deja un campo vacío se usa el texto por defecto, que verá en gris. Puede escribir {"{max}"} para el largo de la descripción y {"{cifras}"} para las cifras permitidas.</p>
      <div className="ed-seg" role="group" aria-label="Textos de qué tipo de aporte">
        {(["logro", "reto"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
            {t === "logro" ? "Logro" : "Reto"}
            {p.textos?.[t] && Object.keys(p.textos[t] ?? {}).length > 0 ? " ·" : ""}
          </button>
        ))}
      </div>

      {GRUPOS_TEXTO.map((g) => (
        <fieldset key={g.id} className="ed-fs">
          <legend className="ed-h">{g.nombre}</legend>
          {g.campos.map((c) => {
            const idc = `ed-tx-${p.id}-${tipo}-${c.clave}`;
            const valor = propios[c.clave] ?? "";
            return (
              <div className="ed-field" key={c.clave}>
                <label htmlFor={idc}>
                  {c.etiqueta}
                  <span className="ed-fino"> · {c.donde === "pilo" ? "lo dice Pilo" : "se lee en pantalla"}</span>
                </label>
                <textarea
                  id={idc}
                  className="ed-in"
                  rows={c.largo === "corto" ? 2 : 4}
                  maxLength={700}
                  disabled={!puedeEditar}
                  placeholder={TEXTOS_POR_DEFECTO[tipo][c.clave]}
                  value={valor}
                  onChange={(e) => onCambiar({ textos: ponerTextoAporte(p, tipo, c.clave, e.target.value) }, `textos:${p.id}:${tipo}:${c.clave}`)}
                />
              </div>
            );
          })}
        </fieldset>
      ))}

      {hayTextosPropios(p) && (
        <button type="button" className="ed-btn ed-btn--sm" disabled={!puedeEditar} onClick={() => onCambiar({ textos: undefined }, `textos:${p.id}:todo`)}>
          Volver a los textos por defecto
        </button>
      )}
    </section>
  );
}

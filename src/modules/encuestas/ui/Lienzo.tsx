/* =============================================================================
   Encuestas con Pilo · el lienzo del editor (la pregunta seleccionada).

   Tipo, enunciado, texto de apoyo, la vista de «así se responde», las opciones
   (si las hay) y las acciones de la pregunta. Cada tecla en un texto se junta en
   un solo paso de «deshacer» (clave por campo).
   ========================================================================== */

import { TIPOS_PREGUNTA } from "../lib/estructura";
import type { Pregunta, TipoPregunta } from "../lib/estructura";
import { GLIFO } from "./Estructura";

export type CambioPregunta = (cambios: Partial<Pregunta>, clave?: string) => void;

const Equis = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export function Lienzo({
  pregunta: p,
  puedeEditar,
  onCambiar,
  onTipo,
  onDuplicar,
  onQuitar,
}: {
  pregunta: Pregunta | null;
  puedeEditar: boolean;
  onCambiar: CambioPregunta;
  onTipo: (t: TipoPregunta) => void;
  onDuplicar: () => void;
  onQuitar: () => void;
}) {
  if (!p) {
    return (
      <main className="ed-col ed-lienzo">
        <div className="ed-vacio">
          <h3>Elija una pregunta</h3>
          <p>Seleccione una pregunta de la estructura, o agregue una nueva, para editarla aquí.</p>
        </div>
      </main>
    );
  }
  const opciones = p.opciones ?? [];
  const ponerOpcion = (i: number, texto: string) => onCambiar({ opciones: opciones.map((o, k) => (k === i ? { ...o, texto } : o)) }, `opcion:${p.id}:${i}`);
  const agregarOpcion = () => {
    const usados = new Set(opciones.map((o) => o.id));
    let n = opciones.length + 1;
    while (usados.has(`opcion_${n}`)) n++;
    onCambiar({ opciones: [...opciones, { id: `opcion_${n}`, texto: `Opción ${n}` }] });
  };
  const quitarOpcion = (i: number) => onCambiar({ opciones: opciones.filter((_, k) => k !== i) });
  const v = p.validaciones ?? {};
  const esOpcion = p.tipo === "opcion_unica" || p.tipo === "opcion_multiple" || p.tipo === "lista";

  return (
    <main className="ed-col ed-lienzo">
      <article className="ed-card ed-cv" id="ed-lienzo" aria-label="Pregunta seleccionada">
        <fieldset className="ed-cerrado" disabled={!puedeEditar}>
          <div className="ed-cv__cab">
            <span className="ed-gl ed-gl--g" aria-hidden="true">
              {GLIFO[p.tipo]}
            </span>
            <div className="ed-field ed-field--tipo">
              <label htmlFor="ed-tipo">Tipo de pregunta</label>
              <select id="ed-tipo" className="ed-in" value={p.tipo} onChange={(e) => onTipo(e.target.value as TipoPregunta)}>
                {TIPOS_PREGUNTA.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.texto}
                  </option>
                ))}
              </select>
            </div>
            <span className="ed-esp" />
            {p.obligatoria && <span className="ed-chip ed-chip--err">Obligatoria</span>}
            {p.mostrarSi && <span className="ed-chip">Se muestra solo si…</span>}
          </div>

          <div>
            <label className="ed-sr" htmlFor="ed-enunciado">
              Enunciado de la pregunta
            </label>
            <textarea id="ed-enunciado" className="ed-enunciado" rows={2} maxLength={300} placeholder="Escriba la pregunta" value={p.enunciado} onChange={(e) => onCambiar({ enunciado: e.target.value }, `enunciado:${p.id}`)} />
            <label className="ed-sr" htmlFor="ed-apoyo">
              Texto de apoyo
            </label>
            <input id="ed-apoyo" className="ed-in ed-in--apoyo" maxLength={300} placeholder="Texto de apoyo (opcional), por ejemplo: «Elija la unidad que representa»" value={p.apoyo ?? ""} onChange={(e) => onCambiar({ apoyo: e.target.value || undefined }, `apoyo:${p.id}`)} />
          </div>

          <div className="ed-resp" aria-label="Así se responde">
            <span className="ed-h">Así se responde</span>
            {(p.tipo === "texto_corto" || p.tipo === "contacto") && <input className="ed-in" tabIndex={-1} readOnly placeholder={p.tipo === "contacto" ? (v.formato === "telefono" ? "300 123 4567" : "nombre@dominio.co") : "Respuesta corta"} />}
            {p.tipo === "parrafo" && <textarea className="ed-in" tabIndex={-1} readOnly placeholder="Respuesta larga" />}
            {esOpcion && (
              <div className="ed-opciones">
                {opciones.map((o, i) => (
                  <div key={o.id} className="ed-opcion">
                    {p.tipo !== "lista" && <span className="ed-marca" data-k={p.tipo} aria-hidden="true" />}
                    <label className="ed-sr" htmlFor={`op-${o.id}`}>
                      Opción {i + 1}
                    </label>
                    <input id={`op-${o.id}`} className="ed-in" maxLength={120} value={o.texto} onChange={(e) => ponerOpcion(i, e.target.value)} />
                    <button type="button" className="ed-ibtn" aria-label={`Quitar la opción ${i + 1}`} disabled={opciones.length <= 2} onClick={() => quitarOpcion(i)}>
                      <Equis />
                    </button>
                  </div>
                ))}
                <button type="button" className="ed-btn ed-btn--sm ed-btn--izq" onClick={agregarOpcion} disabled={opciones.length >= 60}>
                  Agregar opción
                </button>
              </div>
            )}
            {p.tipo === "escala" && (
              <>
                <div className="ed-escala">
                  {Array.from({ length: (v.escalaMax ?? 5) - (v.escalaMin ?? 1) + 1 }, (_, i) => (v.escalaMin ?? 1) + i).map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
                <div className="ed-escala__ext">
                  <span>{v.etiquetaMin}</span>
                  <span>{v.etiquetaMax}</span>
                </div>
              </>
            )}
            {p.tipo === "cifra" && (
              <div className="ed-cifra">
                <input className="ed-in" tabIndex={-1} readOnly placeholder="0" />
                <b>{v.unidad === "porcentaje" ? "%" : v.unidad === "dinero" ? "$ (pesos)" : v.unidad || ""}</b>
              </div>
            )}
            {p.tipo === "fecha" && <input className="ed-in ed-in--corto" tabIndex={-1} readOnly placeholder="dd/mm/aaaa" />}
            {p.tipo === "archivo" && <div className="ed-in ed-archivo">Suelte un archivo aquí o elíjalo · {(v.extensiones ?? []).join(", ")} · hasta {v.tamanoMaxMb ?? 10} MB</div>}
            {p.tipo === "bloque_logro_reto" && (
              <div className="ed-bloque">
                <div className="ed-fila">
                  <span className="ed-chip ed-chip--logro">Logro</span>
                  <span className="ed-chip ed-chip--reto">Reto</span>
                  <span className="ed-fino">Quien responde puede registrar hasta {v.maxItems ?? 30} aportes.</span>
                </div>
                <div className="ed-bloque__g">
                  <div className="ed-in">Título del aporte</div>
                  <div className="ed-in">Descripción</div>
                  <div className="ed-in">Cifra: qué, tipo y valor</div>
                </div>
                <p className="ed-fino">Tipos de cifra: estudiantes, programas, porcentaje, dinero y otro, igual que en la encuesta de Rendición de Cuentas.</p>
              </div>
            )}
          </div>

          <div className="ed-cv__pie" role="toolbar" aria-label="Acciones de la pregunta">
            <button type="button" className="ed-sw" role="switch" aria-checked={p.obligatoria} onClick={() => onCambiar({ obligatoria: !p.obligatoria })}>
              <span className="ed-sw__tr" />
              Obligatoria
            </button>
            <span className="ed-esp" />
            <button type="button" className="ed-btn ed-btn--sm" onClick={onDuplicar}>
              Duplicar
            </button>
            <button type="button" className="ed-btn ed-btn--sm ed-btn--peligro" onClick={onQuitar}>
              Eliminar
            </button>
          </div>
        </fieldset>
      </article>
    </main>
  );
}

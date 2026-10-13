/* =============================================================================
   Recolector de noticias · panel lateral «Buscar noticias».
   No bloquea: al empezar se cierra y la carga sigue en la barra de progreso,
   mientras la persona revisa. Las últimas cargas y la bitácora van plegadas.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../components/ui/Icon";
import { fmt } from "../sostenible/data";
import { NEWS_SOURCES, useNewsRuns } from "./noticias";
import { etiquetaFuente, useCarga } from "./carga";
import { fechaCorta, pendientesDe } from "./recolector-logica";

const ANIO_ACTUAL = new Date().getFullYear();

export function CargaPanel({ onClose }: { onClose: () => void }) {
  const { estado, progreso, iniciar, continuar } = useCarga();
  const [anio, setAnio] = useState(estado.year || 2025);
  const [fuentes, setFuentes] = useState<string[]>(() => NEWS_SOURCES.map((f) => f.key));
  const [inicio, setInicio] = useState(0);
  const primero = useRef<HTMLInputElement>(null);
  const corriendo = estado.fase === "corriendo" || estado.fase === "deteniendo";

  useEffect(() => {
    primero.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const elegidas = NEWS_SOURCES.map((f) => f.key).filter((k) => fuentes.includes(k));
  const anioValido = Number.isInteger(anio) && anio >= 2015 && anio <= ANIO_ACTUAL;
  const aMedias = anioValido ? pendientesDe(progreso, elegidas, anio) : {};
  const hayQueContinuar = Object.keys(aMedias).length > 0;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (corriendo || !elegidas.length || !anioValido) return;
    iniciar(anio, elegidas, inicio);
    onClose();
  };

  return (
    <aside className="rk-drawer" role="dialog" aria-modal="false" aria-labelledby="rk-drawer-title">
      <header className="rk-drawer__head">
        <h2 id="rk-drawer-title" className="rk-h2">
          Buscar noticias en udes.edu.co
        </h2>
        <button type="button" className="rk-icon-btn" onClick={onClose} aria-label="Cerrar el panel">
          <Icon name="close" size={18} />
        </button>
      </header>

      <form className="rk-drawer__form" onSubmit={enviar}>
        <p className="rk-hint">
          Recorre el listado de cada fuente, abre las notas del año y les propone los ODS. Llegan a la lista como «Por revisar» mientras
          sigues trabajando.
        </p>
        <div className="rk-drawer__row">
          <label className="rk-field">
            <span>Año</span>
            <input
              ref={primero}
              type="number"
              min={2015}
              max={ANIO_ACTUAL}
              value={Number.isNaN(anio) ? "" : anio}
              onChange={(e) => setAnio(e.target.valueAsNumber)}
              aria-invalid={!anioValido || undefined}
            />
          </label>
          <label className="rk-field">
            <span>Empezar en el listado</span>
            <input
              type="number"
              min={0}
              step={10}
              value={Number.isNaN(inicio) ? "" : inicio}
              onChange={(e) => setInicio(e.target.valueAsNumber)}
              aria-describedby="rk-start-hint"
            />
          </label>
        </div>
        <p id="rk-start-hint" className="rk-hint">
          Posición en la primera fuente (0, 10, 20…). Para reanudar es más fácil «Continuar donde quedó».
        </p>

        <fieldset className="rk-sources">
          <legend>Fuentes</legend>
          {NEWS_SOURCES.map((f) => (
            <label key={f.key}>
              <input
                type="checkbox"
                checked={fuentes.includes(f.key)}
                onChange={(e) => setFuentes((s) => (e.target.checked ? [...s, f.key] : s.filter((k) => k !== f.key)))}
              />
              {f.label}
              {aMedias[f.key] !== undefined && <span className="rk-hint rk-num"> · quedó en {aMedias[f.key]}</span>}
            </label>
          ))}
        </fieldset>

        {corriendo && <p className="rk-hint">Ya hay una búsqueda en curso; mira la barra de progreso.</p>}
        {!elegidas.length && <p className="rk-hint">Elige al menos una fuente.</p>}
        {!anioValido && <p className="rk-hint">El año va de 2015 a {ANIO_ACTUAL}.</p>}

        <div className="rk-drawer__acts">
          <button type="submit" className="button-primary" disabled={corriendo || !elegidas.length || !anioValido}>
            Buscar
          </button>
          {hayQueContinuar && (
            <button
              type="button"
              className="button-secondary"
              disabled={corriendo}
              onClick={() => {
                continuar(anio, elegidas);
                onClose();
              }}
            >
              Continuar donde quedó
            </button>
          )}
        </div>
      </form>

      <details className="rk-fold">
        <summary>Últimas cargas</summary>
        <UltimasCargas />
      </details>
      {estado.bitacora.length > 0 && (
        <details className="rk-fold">
          <summary>Bitácora de esta sesión</summary>
          <div className="rk-log" role="log" aria-label="Bitácora de la búsqueda" tabIndex={0}>
            {estado.bitacora.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </details>
      )}
    </aside>
  );
}

function UltimasCargas() {
  const corridas = useNewsRuns();
  if (corridas.isPending) return <p className="rk-hint">Cargando…</p>;
  if (corridas.error) return <p className="rk-hint">{corridas.error.message}</p>;
  if (!corridas.data.length) return <p className="rk-hint">Todavía no hay cargas registradas.</p>;
  return (
    <div className="rk-table-wrap">
      <table className="rk-table">
        <thead>
          <tr>
            <th scope="col">Cuándo</th>
            <th scope="col">Fuente</th>
            <th scope="col" className="rk-r">
              Vistas
            </th>
            <th scope="col" className="rk-r">
              Guard.
            </th>
            <th scope="col" className="rk-r">
              Desc.
            </th>
          </tr>
        </thead>
        <tbody>
          {corridas.data.map((c) => (
            <tr key={c.id} title={c.error ?? undefined}>
              <td className="rk-num">
                {fechaCorta(c.started_at)} {new Date(c.started_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
              </td>
              <td>
                {etiquetaFuente(c.source.split(" ")[0])}
                {c.error && <span className="rk-bad"> · error</span>}
              </td>
              <td className="rk-r rk-num">{fmt(c.seen)}</td>
              <td className="rk-r rk-num">{fmt(c.saved)}</td>
              <td className="rk-r rk-num">{fmt(c.skipped)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

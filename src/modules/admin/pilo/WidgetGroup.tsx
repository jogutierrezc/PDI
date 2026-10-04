/* =============================================================================
   Intranet · Mr. Pilo con IA · Dónde aparece › Pilo en otros portales (0111).

   El chat emergente de Pilo se puede poner en otra página pegando una línea
   (public/pilo.js). Aquí se decide si otros portales pueden mostrarlo y
   cuáles, y se arma esa línea lista para copiar, con el tema y la esquina.
   El interruptor y la lista se guardan con «Guardar cambios»; el tema y la
   esquina no se guardan: van escritos en la línea que se copia. Igual «Leer la
   página» (0127): es un atributo de la línea, así quien administra el otro
   portal lo ve y lo decide.
   ========================================================================== */

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { normalizeOrigin, widgetSnippet } from "../../pilo-embed/embed";
import type { Lado } from "../../pilo-embed/embed";
import { TEMAS } from "../../pregunta/store";
import type { Tema } from "../../pregunta/store";
import type { EditorApi } from "./sections";
import { Group, StatusMark, Switch, plural } from "./ui";

const MAX_ORIGINS = 50;

const LADOS: { id: Lado; label: string }[] = [
  { id: "izq", label: "Izquierda" },
  { id: "der", label: "Derecha" },
];

export function WidgetGroup({ ed }: { ed: EditorApi }) {
  const { s, set } = ed;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [tema, setTema] = useState<Tema>("blanco");
  const [lado, setLado] = useState<Lado>("der");
  const [leer, setLeer] = useState(false);
  const [copied, setCopied] = useState<"si" | "no" | null>(null);
  const code = useRef<HTMLElement>(null);

  const origins = s.widget_origins;
  const snippet = widgetSnippet(window.location.origin, tema, lado, "planeacion", leer);
  const askPublic = Boolean(s.portals.pregunta?.on) && s.portals.pregunta?.aud === "publico";

  const add = (e: FormEvent) => {
    e.preventDefault();
    const origin = normalizeOrigin(draft);
    if (!origin) return setError("Escriba la dirección del portal, por ejemplo https://www.udes.edu.co.");
    if (origin === window.location.origin) return setError("Este portal ya puede mostrar a Pilo: no hace falta agregarlo.");
    if (origins.includes(origin)) return setError("Ese portal ya está en la lista.");
    if (origins.length >= MAX_ORIGINS) return setError(`La lista admite hasta ${MAX_ORIGINS} portales.`);
    set("widget_origins", [...origins, origin]);
    setDraft("");
    setError("");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied("si");
    } catch {
      // Sin portapapeles: el texto queda seleccionado para copiarlo a mano.
      const el = code.current;
      if (el) window.getSelection()?.selectAllChildren(el);
      setCopied("no");
    }
    window.setTimeout(() => setCopied(null), 2500);
  };

  const aside = s.needs0111 ? null : !s.widget_on ? (
    <StatusMark tone="off">Solo en este portal</StatusMark>
  ) : origins.length ? (
    <StatusMark tone="ok">Abierto a {plural(origins.length, "portal", "portales")}</StatusMark>
  ) : (
    <StatusMark tone="warn">Encendido, sin portales en la lista</StatusMark>
  );

  return (
    <Group title="Pilo en otros portales" aside={aside} id="pis-widget">
      <p className="pis-small">
        Un botón con la cara de Pilo en la esquina de otra página abre un chat pequeño, conectado a Pregúntele a Pilo. Quien administra ese portal solo pega una
        línea. Cada pregunta gasta del mismo cupo, así que conviene autorizar portal por portal.
      </p>

      <div className="pis-row">
        <span className="pis-fn__text">
          <strong>Permitir que otros portales lo muestren</strong>
          <small>Apagado, el chat emergente solo se ve dentro de este portal.</small>
        </span>
        <Switch on={s.widget_on} disabled={s.needs0111} onChange={(v) => set("widget_on", v)} label="Permitir que otros portales muestren a Pilo" />
      </div>

      <div className="pis-origins">
        <strong>Portales autorizados</strong>
        {origins.length ? (
          <ul>
            {origins.map((o) => (
              <li key={o}>
                <span>{o}</span>
                <button type="button" className="pis-link" aria-label={`Quitar ${o}`} onClick={() => set("widget_origins", origins.filter((x) => x !== o))}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pis-small">Aún no hay ninguno. Agregue la dirección de cada portal que va a mostrar a Pilo.</p>
        )}
        <form className="pis-grid pis-origins__add" onSubmit={add}>
          <label>
            Dirección del portal
            <input
              id="pis-widget-origin"
              value={draft}
              spellCheck={false}
              autoComplete="off"
              inputMode="url"
              placeholder="https://www.udes.edu.co"
              disabled={s.needs0111}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "pis-widget-origin-error" : undefined}
              onChange={(e) => {
                setDraft(e.target.value);
                setError("");
              }}
            />
          </label>
          <button type="submit" className="button-secondary" disabled={s.needs0111 || !draft.trim()}>
            Agregar
          </button>
        </form>
        {error && (
          <p className="pis-error" id="pis-widget-origin-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="pis-snippet">
        <strong>La línea para pegar en el otro portal</strong>
        <p className="pis-small">Va antes de cerrar &lt;/body&gt;. Elija el tema y la esquina, y copie la línea.</p>
        <div className="pis-actions">
          <span className="pis-seg pis-seg--sm" role="radiogroup" aria-label="Tema del chat">
            {TEMAS.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={tema === t.id} onClick={() => setTema(t.id)}>
                {t.label}
              </button>
            ))}
          </span>
          <span className="pis-seg pis-seg--sm" role="radiogroup" aria-label="Esquina del botón">
            {LADOS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={lado === l.id} onClick={() => setLado(l.id)}>
                {l.label}
              </button>
            ))}
          </span>
        </div>
        <div className="pis-row">
          <span className="pis-fn__text">
            <strong>Que Pilo lea la página donde está</strong>
            <small>
              Agrega <code>data-leer="si"</code> a la línea. Al preguntar, Pilo lee el texto visible de esa página para responder sobre lo que la persona ve, y la
              manda a «Lo que leyó en otros portales», en la memoria, para que usted decida si la guarda. No lee formularios ni lo que lleve{" "}
              <code>data-pilo-ignorar</code>.
            </small>
          </span>
          <Switch on={leer} onChange={setLeer} label="Que Pilo lea la página donde está" />
        </div>
        <pre tabIndex={0}>
          <code ref={code}>{snippet}</code>
        </pre>
        <div className="pis-actions">
          <button type="button" className="button-primary" onClick={copy}>
            <Icon name="check" size={16} />
            Copiar la línea
          </button>
          <a className="pis-link" href="/pilo-widget-demo.html" target="_blank" rel="noopener">
            Abrir la página de prueba
          </a>
          <span role="status">
            {copied === "si" && <StatusMark tone="ok">Copiada</StatusMark>}
            {copied === "no" && <StatusMark tone="warn">No se pudo copiar: quedó seleccionada para copiarla a mano</StatusMark>}
          </span>
        </div>
      </div>

      {s.needs0111 && <p className="pis-warn">Falta aplicar la migración 0111 en la base para abrir a Pilo a otros portales.</p>}
      {!s.needs0111 && s.widget_on && !askPublic && (
        <p className="pis-warn">
          Pregúntele a Pilo no está abierta al público, y en otro portal nadie tiene sesión: el botón no aparecerá hasta abrirla en la sección «Pregúntele a
          Pilo».
        </p>
      )}
    </Group>
  );
}

/* =============================================================================
   Encuestas con Pilo · la pantalla de salida (después de enviar) y el tema.

   Pilo se despide con el mensaje de la encuesta, dice cuál es el siguiente paso, deja
   un enlace, resume lo enviado y ofrece una copia descargable. El tema (acento,
   fondo, cabecera, logo) viene de la configuración de la encuesta.
   ========================================================================== */

import { useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { PiloFace } from "../../../components/pilo/PiloFace";
import { FONDOS, copiaDeRespuesta } from "../lib/config";
import type { ConfigPilo } from "../lib/config";
import { kill, piloIn } from "../motion";

export interface LineaResumen {
  pregunta: string;
  respuesta: string;
}

/** Las variables de color de la página pública según el tema. El acento ya viene validado (4,5:1 con blanco). */
export function estiloTema(c: ConfigPilo): CSSProperties {
  const fondo = FONDOS.find((f) => f.id === c.tema.fondo)?.color ?? "#f4f8fc";
  return { "--ep-blue": c.tema.acento, "--ep-bg": fondo } as CSSProperties;
}

export function Salida({ titulo, despedida, config, lineas, onOtra }: { titulo: string; despedida: string; config: ConfigPilo; lineas: readonly LineaResumen[]; onOtra?: () => void }) {
  const raiz = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = raiz.current;
    if (el) piloIn(Array.from(el.querySelectorAll("[data-entra]")));
    return () => kill(el ? Array.from(el.querySelectorAll("[data-entra]")) : []);
  }, []);

  const bajar = () => {
    const url = URL.createObjectURL(new Blob([copiaDeRespuesta(titulo, lineas)], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mi-respuesta.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const s = config.salida;

  return (
    <div ref={raiz} className="ep-salida" role="status">
      <div data-entra>
        <PiloFace size={120} expression="emocionado" label="Mr. Pilo" />
      </div>
      <h2 data-entra>¡Gracias, ya recibí su respuesta!</h2>
      {despedida && (
        <p data-entra className="ep-lede">
          {despedida}
        </p>
      )}
      {s.siguientePaso && (
        <div data-entra className="ep-salida__paso">
          <b>Qué sigue</b>
          <p>{s.siguientePaso}</p>
        </div>
      )}
      {s.mostrarResumen && lineas.length > 0 && (
        <dl data-entra className="ep-salida__resumen">
          {lineas.map((l) => (
            <div key={l.pregunta}>
              <dt>{l.pregunta}</dt>
              <dd>{l.respuesta || "(sin respuesta)"}</dd>
            </div>
          ))}
        </dl>
      )}
      <div data-entra className="ep-acciones">
        {s.enlace && (
          <a className="ep-btn ep-btn--pri" href={s.enlace} target="_blank" rel="noopener noreferrer">
            {s.textoEnlace || "Seguir"}
          </a>
        )}
        {s.copia && (
          <button type="button" className="ep-btn" onClick={bajar}>
            Descargar copia
          </button>
        )}
        {onOtra && (
          <button type="button" className="ep-btn ep-btn--suave" onClick={onOtra}>
            Enviar otra respuesta
          </button>
        )}
      </div>
    </div>
  );
}

/** El resumen de lo respondido en texto, pregunta por pregunta (solo lo visible). */
export function resumenDe(preguntas: readonly { id: string; enunciado: string; tipo: string; opciones?: { id: string; texto: string }[] }[], valores: Record<string, unknown>): LineaResumen[] {
  const texto = (p: (typeof preguntas)[number], v: unknown): string => {
    if (v === null || v === undefined || v === "") return "";
    if (Array.isArray(v)) {
      if (p.tipo === "bloque_logro_reto") return `${v.length} ${v.length === 1 ? "aporte" : "aportes"}: ${(v as { titulo: string }[]).map((x) => x.titulo).join("; ")}`;
      return v.map((x) => p.opciones?.find((o) => o.id === x)?.texto ?? String(x)).join(", ");
    }
    if (typeof v === "object") return (v as { nombre?: string }).nombre ?? "";
    return p.opciones?.find((o) => o.id === v)?.texto ?? String(v);
  };
  return preguntas.map((p) => ({ pregunta: p.enunciado, respuesta: texto(p, valores[p.id]) }));
}

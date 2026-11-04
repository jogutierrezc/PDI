/* =============================================================================
   Gestión de convenios · Plantillas de correo (0256). Una plantilla por clave y por
   idioma (Español / English): asunto y cuerpo en HTML con una lista corta de etiquetas,
   variables que se insertan con un clic, vista previa con un convenio real (ventana
   aislada, sandbox) y «Enviar prueba» a la dirección que se escriba. Las dos plantillas
   de la firma electrónica (firma_solicitud y firma_certificado) se editan aquí también.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { asuntoDe, htmlDe, sanearCorreo, VARIABLES_AVISO, VARIABLES_FIRMA } from "../../../../supabase/functions/conv-avisos/plantilla";
import type { Idioma } from "../../../../supabase/functions/conv-avisos/plantilla";
import { Icon } from "../../../components/ui/Icon";
import { hoyBogota } from "../lib/permisos";
import { useAviso } from "../ui/comunes";
import type { Convenio } from "../convenios/logica";
import { enviarPruebaAviso, useConfigAvisos, useGuardarPlantillaCorreo } from "./datos";
import type { PlantillaCorreo } from "./datos";
import { variablesAviso } from "./logica";

const EJEMPLO = { id: "ejemplo", codigo: "ci-01-000", institucion: "Universidad de Ejemplo", pais: "España", tipo: "Marco", fecha_terminacion: "2027-03-31" };

export function PlantillasCorreo({ plantillas, convenios, crea, onVolver }: { plantillas: PlantillaCorreo[]; convenios: Convenio[]; crea: boolean; onVolver: () => void }) {
  const claves = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plantillas) if (p.idioma === "es" || !m.has(p.clave)) m.set(p.clave, p.nombre);
    return [...m.entries()].map(([clave, nombre]) => ({ clave, nombre, firma: clave.startsWith("firma_"), audiencia: plantillas.find((p) => p.clave === clave)?.audiencia ?? "interna" }));
  }, [plantillas]);
  const [clave, setClave] = useState(claves[0]?.clave ?? "");
  const [idioma, setIdioma] = useState<Idioma>("es");
  const actual = plantillas.find((p) => p.clave === clave && p.idioma === idioma) ?? null;
  const avisos = claves.filter((c) => !c.firma);
  const firma = claves.filter((c) => c.firma);

  return (
    <section className="conv-panel gest-plantillas">
      <div className="conv-bar">
        <button type="button" className="conv-btn conv-btn--sm" onClick={onVolver}>
          <Icon name="undo" size={14} />
          Volver a los avisos
        </button>
        <h2>Plantillas de correo</h2>
        <span className="conv-grow" />
        <div className="gest-seg" role="tablist" aria-label="Idioma de la plantilla">
          {(["es", "en"] as const).map((i) => (
            <button key={i} type="button" role="tab" aria-selected={idioma === i} onClick={() => setIdioma(i)}>
              {i === "es" ? "Español" : "English"}
            </button>
          ))}
        </div>
      </div>
      <div className="gest-dos">
        <nav className="gest-lista" aria-label="Plantillas">
          <h3>Avisos de vencimiento</h3>
          {avisos.map((c) => (
            <button key={c.clave} type="button" className="gest-item" aria-current={c.clave === clave} onClick={() => setClave(c.clave)}>
              <span>{c.nombre}</span>
              <small>{c.audiencia === "externa" ? "Para la contraparte" : c.audiencia === "interna" ? "Para el equipo" : "Para ambos"}</small>
            </button>
          ))}
          <h3>Firma electrónica</h3>
          {firma.map((c) => (
            <button key={c.clave} type="button" className="gest-item" aria-current={c.clave === clave} onClick={() => setClave(c.clave)}>
              <span>{c.nombre}</span>
              <small>Se usará en la segunda parte</small>
            </button>
          ))}
        </nav>
        {actual ? <Editor key={`${actual.clave}:${actual.idioma}`} plantilla={actual} convenios={convenios} crea={crea} /> : <p className="conv-vacio">No hay una plantilla en este idioma.</p>}
      </div>
    </section>
  );
}

function Editor({ plantilla, convenios, crea }: { plantilla: PlantillaCorreo; convenios: Convenio[]; crea: boolean }) {
  const guardar = useGuardarPlantillaCorreo();
  const config = useConfigAvisos();
  const aviso = useAviso();
  const area = useRef<HTMLTextAreaElement>(null);
  const [asunto, setAsunto] = useState(plantilla.asunto);
  const [cuerpo, setCuerpo] = useState(plantilla.cuerpo);
  const [convenioId, setConvenioId] = useState("");
  const [para, setPara] = useState("");
  const [destino, setDestino] = useState<"mailpit" | "smtp">("mailpit");
  const [enviando, setEnviando] = useState(false);

  const firma = plantilla.clave.startsWith("firma_");
  const variables = firma ? VARIABLES_FIRMA : VARIABLES_AVISO;
  const sucia = asunto !== plantilla.asunto || cuerpo !== plantilla.cuerpo;
  const conv = convenios.find((c) => c.id === convenioId);
  const vars = useMemo(() => variablesAviso(conv ?? EJEMPLO, hoyBogota(), plantilla.idioma, window.location.origin), [conv, plantilla.idioma]);
  const logo = `${window.location.origin}/logo-udes-blanco.png`;
  const html = useMemo(() => htmlDe(cuerpo, vars, { idioma: plantilla.idioma, logo }), [cuerpo, vars, plantilla.idioma, logo]);

  const insertar = (texto: string, seleccion?: [number, number]) => {
    const ta = area.current;
    if (!ta) return setCuerpo((c) => c + texto);
    const { selectionStart: i, selectionEnd: f } = ta;
    setCuerpo(cuerpo.slice(0, i) + texto + cuerpo.slice(f));
    window.requestAnimationFrame(() => {
      ta.focus();
      const a = i + (seleccion?.[0] ?? texto.length);
      ta.setSelectionRange(a, i + (seleccion?.[1] ?? texto.length));
    });
  };
  const envolver = (abre: string, cierra: string) => {
    const ta = area.current;
    const sel = ta ? cuerpo.slice(ta.selectionStart, ta.selectionEnd) : "";
    const t = `${abre}${sel || "texto"}${cierra}`;
    insertar(t, [abre.length, abre.length + (sel || "texto").length]);
  };

  const limpio = /<(?!\/?(?:p|br|b|strong|i|em|u|ul|ol|li|h3|a)\b)\/?[a-z]/i.test(cuerpo);
  const guardarCambios = () => guardar.mutate({ clave: plantilla.clave, idioma: plantilla.idioma, asunto: asunto.trim(), cuerpo: sanearCorreo(cuerpo) }, { onSuccess: () => aviso.ok("Plantilla guardada."), onError: aviso.mal });
  const probar = async () => {
    setEnviando(true);
    try {
      await enviarPruebaAviso({ asunto, cuerpo, idioma: plantilla.idioma, para: para.trim(), destino, ...(conv ? { convenio_id: conv.id } : {}) });
      aviso.ok(destino === "mailpit" ? `Prueba enviada a Mailpit (${para.trim()}).` : `Prueba enviada a ${para.trim()}.`);
    } catch (e) {
      aviso.mal(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="gest-editor">
      <div className="gest-col">
        <h3>{plantilla.nombre}</h3>
        <label className="it-campo" htmlFor="gp-asunto">
          <span>Asunto</span>
          <input id="gp-asunto" type="text" value={asunto} maxLength={200} disabled={!crea} onChange={(e) => setAsunto(e.target.value)} />
        </label>
        <div className="gest-barra" role="toolbar" aria-label="Formato del mensaje">
          <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} onClick={() => envolver("<b>", "</b>")}>
            <b>N</b>
            <span className="sr-only">Negrita</span>
          </button>
          <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} onClick={() => envolver("<p>", "</p>")}>
            Párrafo
          </button>
          <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} onClick={() => envolver('<a href="https://">', "</a>")}>
            <Icon name="link" size={14} />
            Enlace
          </button>
          <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} onClick={() => envolver('<a class="boton" href="https://">', "</a>")}>
            Botón
          </button>
        </div>
        <label className="it-campo" htmlFor="gp-cuerpo">
          <span>Mensaje (HTML sencillo)</span>
          <textarea id="gp-cuerpo" ref={area} className="gest-codigo" value={cuerpo} rows={12} disabled={!crea} spellCheck={false} onChange={(e) => setCuerpo(e.target.value)} />
        </label>
        <div className="gest-vars">
          <span className="conv-sub">Insertar:</span>
          {variables.map((v) => (
            <button key={v} type="button" disabled={!crea} onClick={() => insertar(`{{${v}}}`)}>
              {`{{${v}}}`}
            </button>
          ))}
        </div>
        <p className="conv-sub">Etiquetas permitidas: p, br, b, i, u, ul, ol, li, h3 y a (con class=&quot;boton&quot; para el botón). Lo demás se quita al guardar.</p>
        {limpio ? (
          <p className="conv-error" role="status">
            Hay etiquetas que no se permiten; se quitarán al guardar.
          </p>
        ) : null}
        <div className="gest-acciones">
          <button type="button" className="conv-btn conv-btn--pri" disabled={!crea || !sucia || guardar.isPending || !asunto.trim() || !cuerpo.trim()} onClick={guardarCambios}>
            {guardar.isPending ? "Guardando…" : "Guardar plantilla"}
          </button>
          {sucia ? (
            <button
              type="button"
              className="conv-btn"
              onClick={() => {
                setAsunto(plantilla.asunto);
                setCuerpo(plantilla.cuerpo);
              }}
            >
              Descartar cambios
            </button>
          ) : null}
        </div>
        {aviso.nodo}
      </div>

      <div className="gest-col">
        <div className="gest-fila">
          <h3>Vista previa</h3>
          <label className="gest-inline">
            <span className="conv-sub">Con el convenio</span>
            <select value={convenioId} onChange={(e) => setConvenioId(e.target.value)} aria-label="Convenio para la vista previa">
              <option value="">Ejemplo</option>
              {convenios.slice(0, 400).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo.toUpperCase()} · {c.institucion}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="gest-asunto">
          <span className="conv-sub">Asunto</span> <b>{asuntoDe(asunto, vars)}</b>
        </p>
        <iframe className="gest-correo" title="Vista previa del correo" sandbox="" srcDoc={html} />
        <div className="gest-prueba">
          <label className="it-campo" htmlFor="gp-para">
            <span>Enviar prueba a</span>
            <input id="gp-para" type="text" inputMode="email" autoComplete="email" value={para} placeholder="nombre@udes.edu.co" onChange={(e) => setPara(e.target.value)} />
          </label>
          <label className="it-campo" htmlFor="gp-dest">
            <span>Servidor</span>
            <select id="gp-dest" value={destino} onChange={(e) => setDestino(e.target.value as "mailpit" | "smtp")}>
              <option value="mailpit">Mailpit (prueba, no sale)</option>
              <option value="smtp">SMTP institucional (sale de verdad)</option>
            </select>
          </label>
          <button type="button" className="conv-btn" disabled={!crea || enviando || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para.trim())} onClick={() => void probar()}>
            <Icon name="mail" size={14} />
            {enviando ? "Enviando…" : "Enviar prueba"}
          </button>
        </div>
        {config.data?.modo === "prueba" && destino === "smtp" ? <p className="conv-sub">Los avisos automáticos están en modo de prueba, pero esta prueba sí saldrá por el SMTP institucional.</p> : null}
      </div>
    </div>
  );
}

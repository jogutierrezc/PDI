/* =============================================================================
   Relaciones · plantillas de correo. Se redacta en texto plano (con {{variables}} y,
   si se quiere, una tarjeta de actividad con botón); el HTML con estilos en línea y la
   versión en texto plano se arman solos (supabase/functions/rel-correos/plantilla.ts,
   el mismo código que usa el servidor). La vista previa es una ventana aislada
   (iframe sandbox) y no anima: se reescribe con cada tecla.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { ACTIVIDAD_VACIA, asuntoDe, htmlDe, textoDe, VARIABLES } from "../../../../supabase/functions/rel-correos/plantilla";
import type { Actividad, Destinatario } from "../../../../supabase/functions/rel-correos/plantilla";
import { Confirmar, useAviso } from "../ui/comunes";
import { useBorrarPlantillaRel, useGuardarPlantillaRel } from "./datos";
import type { ContactoRel, PlantillaRel } from "./datos";

const EJEMPLO: Destinatario = { nombre: "Persona de ejemplo", cargo: "Cargo de ejemplo", institucion: "Institución de ejemplo", pais: "País" };
type Modo = "vis" | "htm" | "txt";

export function destinatarioDe(c: ContactoRel | null): Destinatario {
  return c ? { nombre: c.nombre, cargo: c.cargo, institucion: c.institucion, pais: c.pais } : EJEMPLO;
}

export function PlantillasCorreo({ plantillas, muestra, activa, onActiva, onUsar }: { plantillas: PlantillaRel[]; muestra: ContactoRel | null; activa: string | null; onActiva: (id: string | null) => void; onUsar: (id: string) => void }) {
  const actual = plantillas.find((p) => p.id === activa) ?? plantillas[0] ?? null;
  return (
    <div className="rel-dos">
      <div className="rel-lista">
        <h3>Plantillas</h3>
        {plantillas.map((p) => (
          <button key={p.id} type="button" className="rel-item" aria-current={p.id === actual?.id} onClick={() => onActiva(p.id)}>
            <span>{p.nombre}</span>
            <small>{p.usa_actividad ? "Con tarjeta de actividad" : "Solo texto"}</small>
          </button>
        ))}
        <div className="rel-lista__pie">
          <NuevaPlantilla onCreada={onActiva} />
        </div>
      </div>
      {actual ? (
        <Editor key={actual.id} plantilla={actual} muestra={muestra} onUsar={onUsar} onBorrada={() => onActiva(null)} />
      ) : (
        <div className="rel-vacio">
          <b>No hay plantillas.</b>
          <p>Cree la primera con «Nueva plantilla».</p>
        </div>
      )}
    </div>
  );
}

function NuevaPlantilla({ onCreada }: { onCreada: (id: string) => void }) {
  const guardar = useGuardarPlantillaRel();
  return (
    <button
      type="button"
      className="es-btn"
      disabled={guardar.isPending}
      onClick={() => guardar.mutate({ nombre: "Plantilla nueva", asunto: "", cuerpo: "Estimado(a) {{nombre}}:\n\n", usa_actividad: false, actividad: {} }, { onSuccess: onCreada })}
    >
      {guardar.isPending ? "Creando…" : "Nueva plantilla"}
    </button>
  );
}

function Editor({ plantilla, muestra, onUsar, onBorrada }: { plantilla: PlantillaRel; muestra: ContactoRel | null; onUsar: (id: string) => void; onBorrada: () => void }) {
  const guardar = useGuardarPlantillaRel();
  const borrar = useBorrarPlantillaRel();
  const aviso = useAviso();
  const area = useRef<HTMLTextAreaElement>(null);
  const [nombre, setNombre] = useState(plantilla.nombre);
  const [asunto, setAsunto] = useState(plantilla.asunto);
  const [cuerpo, setCuerpo] = useState(plantilla.cuerpo);
  const [usa, setUsa] = useState(plantilla.usa_actividad);
  const [act, setAct] = useState<Actividad>({ ...ACTIVIDAD_VACIA, ...plantilla.actividad });
  const [modo, setModo] = useState<Modo>("vis");
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const sucia = nombre !== plantilla.nombre || asunto !== plantilla.asunto || cuerpo !== plantilla.cuerpo || usa !== plantilla.usa_actividad || JSON.stringify(act) !== JSON.stringify({ ...ACTIVIDAD_VACIA, ...plantilla.actividad });
  const dest = destinatarioDe(muestra);
  const borradorCorreo = { asunto, cuerpo, usa_actividad: usa, actividad: act };
  const op = { urlBaja: "#", responderA: "relaciones.internacionales@udes.edu.co" };
  const html = useMemo(() => htmlDe(borradorCorreo, dest, op), [asunto, cuerpo, usa, act, muestra?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- depende del contenido de la plantilla
  const texto = textoDe(borradorCorreo, dest, op);

  const poner = (k: keyof Actividad) => (e: { target: { value: string } }) => setAct((a) => ({ ...a, [k]: e.target.value }));
  const insertar = (v: string) => {
    const ta = area.current;
    const t = `{{${v}}}`;
    if (!ta) return setCuerpo((c) => c + t);
    const { selectionStart: i, selectionEnd: f } = ta;
    setCuerpo(cuerpo.slice(0, i) + t + cuerpo.slice(f));
    window.requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(i + t.length, i + t.length);
    });
  };
  const guardarCambios = () => guardar.mutate({ id: plantilla.id, nombre, asunto, cuerpo, usa_actividad: usa, actividad: act }, { onSuccess: () => aviso.ok("Plantilla guardada."), onError: (e) => aviso.mal(e) });
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      aviso.mal(new Error("No se pudo copiar. Use la pestaña HTML y copie desde ahí."));
    }
  };

  return (
    <div className="rel-editor">
      <div className="rel-col">
        <h3>Redacción en texto plano</h3>
        <label className="it-campo" htmlFor="rel-p-nombre">
          <span>Nombre de la plantilla</span>
          <input id="rel-p-nombre" type="text" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="it-campo" htmlFor="rel-p-asunto">
          <span>Asunto</span>
          <input id="rel-p-asunto" type="text" value={asunto} maxLength={200} onChange={(e) => setAsunto(e.target.value)} />
        </label>
        <label className="it-campo" htmlFor="rel-p-cuerpo">
          <span>Mensaje</span>
          <textarea id="rel-p-cuerpo" ref={area} value={cuerpo} rows={9} onChange={(e) => setCuerpo(e.target.value)} />
        </label>
        <div className="rel-vars">
          <span className="rel-sub">Insertar:</span>
          {VARIABLES.map((v) => (
            <button key={v} type="button" onClick={() => insertar(v)}>
              {`{{${v}}}`}
            </button>
          ))}
        </div>
        <h3>Invitación a una actividad</h3>
        <label className="rel-check">
          <input type="checkbox" checked={usa} onChange={(e) => setUsa(e.target.checked)} />
          Incluir tarjeta de actividad y botón
        </label>
        {usa ? (
          <div className="rel-act">
            <label className="it-campo" htmlFor="rel-a-nom">
              <span>Actividad</span>
              <input id="rel-a-nom" type="text" value={act.nom} onChange={poner("nom")} />
            </label>
            <div className="rel-g2">
              <label className="it-campo" htmlFor="rel-a-fec">
                <span>Fecha</span>
                <input id="rel-a-fec" type="date" value={act.fec} onChange={poner("fec")} />
              </label>
              <label className="it-campo" htmlFor="rel-a-hor">
                <span>Hora</span>
                <input id="rel-a-hor" type="time" value={act.hor} onChange={poner("hor")} />
              </label>
            </div>
            <label className="it-campo" htmlFor="rel-a-lug">
              <span>Lugar o enlace</span>
              <input id="rel-a-lug" type="text" value={act.lug} onChange={poner("lug")} />
            </label>
            <div className="rel-g2">
              <label className="it-campo" htmlFor="rel-a-btn">
                <span>Texto del botón</span>
                <input id="rel-a-btn" type="text" value={act.btn} onChange={poner("btn")} />
              </label>
              <label className="it-campo" htmlFor="rel-a-lim">
                <span>Responder antes de</span>
                <input id="rel-a-lim" type="date" value={act.lim} onChange={poner("lim")} />
              </label>
            </div>
          </div>
        ) : null}
        <div className="rel-acciones">
          <button type="button" className="es-btn es-btn--pri" disabled={!sucia || guardar.isPending} onClick={guardarCambios}>
            {guardar.isPending ? "Guardando…" : "Guardar plantilla"}
          </button>
          <button type="button" className="es-btn" onClick={() => setConfirmando(true)}>
            Eliminar
          </button>
        </div>
        {confirmando ? (
          <Confirmar
            pregunta="¿Eliminar esta plantilla?"
            detalle="Los envíos ya hechos conservan su propia copia."
            si="Eliminar"
            ocupado={borrar.isPending}
            onNo={() => setConfirmando(false)}
            onSi={() => borrar.mutate(plantilla.id, { onSuccess: onBorrada, onError: (e) => { setConfirmando(false); aviso.mal(e); } })}
          />
        ) : null}
        {aviso.nodo}
      </div>

      <div className="rel-col rel-col--vista">
        <h3>Resultado</h3>
        <div className="rel-modo" role="group" aria-label="Modo de vista">
          {([["vis", "Vista previa"], ["htm", "HTML"], ["txt", "Texto plano"]] as [Modo, string][]).map(([k, r]) => (
            <button key={k} type="button" aria-pressed={modo === k} onClick={() => setModo(k)}>
              {r}
            </button>
          ))}
        </div>
        <p className="rel-sub">Asunto: {asuntoDe(borradorCorreo, dest)}</p>
        <div className="rel-vista">
          {modo === "vis" ? <iframe title="Vista previa del correo" sandbox="" srcDoc={html} /> : <pre>{modo === "htm" ? html : texto}</pre>}
        </div>
        <p className="rel-nota">La vista usa al primer contacto seleccionado, o a una persona de ejemplo. El HTML lleva estilos en línea para que lo lean Outlook y Gmail, y se envía también la versión en texto plano.</p>
        <div className="rel-acciones">
          <button type="button" className="es-btn" onClick={() => void copiar()}>
            {copiado ? "Copiado" : "Copiar HTML"}
          </button>
          <button type="button" className="es-btn es-btn--pri" disabled={sucia} title={sucia ? "Guarde los cambios primero" : undefined} onClick={() => onUsar(plantilla.id)}>
            Usar en envío masivo
          </button>
        </div>
      </div>
    </div>
  );
}

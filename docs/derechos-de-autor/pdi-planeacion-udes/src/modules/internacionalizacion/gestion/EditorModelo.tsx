/* =============================================================================
   Gestión de convenios · Editor propio de modelos (0257). El convenio se escribe sobre
   una hoja (contenteditable, sin dependencias): títulos, cláusulas numeradas, negrita,
   cursiva, listas y alineación, con la biblioteca de campos (chips) y cajas de firma.
   Lo que se guarda es HTML SANEADO (sanearHoja: lista blanca de etiquetas), y se vuelve a
   sanear al abrirlo. Al pegar, entra solo el texto plano.

   Usa document.execCommand: está marcado como obsoleto pero lo implementan todos los
   navegadores y evita añadir una librería de edición solo para esto.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAviso } from "../ui/comunes";
import { useActualizarModelo } from "./datos";
import type { Modelo } from "./datos";
import { camposDeHoja, CAMPOS, CLAVES_CONOCIDAS, claveDe, esc, firmasDeHoja, sanearHoja } from "./logica";

const chip = (k: string) => `<span class="gest-var" data-campo="${k}" contenteditable="false">{{${k}}}</span>`;

/** El texto con que arranca un modelo nuevo del editor. */
export function hojaInicial(): string {
  return (
    `<h1 style="text-align:center">Convenio marco de cooperación académica</h1>` +
    `<p>Entre la <b>UNIVERSIDAD DE SANTANDER – UDES</b>, institución de educación superior con sede en Bucaramanga, Colombia, representada por su Rector, y ${chip("institucion")} (${chip("pais")}), representada por ${chip("representante")}, ${chip("cargo")}, en adelante las partes, acuerdan celebrar el presente convenio, que se rige por las siguientes cláusulas:</p>` +
    `<h3 class="gest-clausula">Objeto</h3><p>Establecer las bases de cooperación entre las partes para desarrollar ${chip("objeto")}, incluido el campus ${chip("campus")}.</p>` +
    `<h3 class="gest-clausula">Alcance</h3><p>Las actividades se concretarán en convenios específicos o anexos que precisen programas, cupos, costos y responsables.</p>` +
    `<h3 class="gest-clausula">Compromisos de las partes</h3><p>Cada parte designará un coordinador, facilitará la información necesaria y respetará las normas académicas de la institución anfitriona.</p>` +
    `<h3 class="gest-clausula">Vigencia</h3><p>El convenio tendrá una vigencia de ${chip("vigencia")} contados desde el ${chip("fecha_firma")}, prorrogable por acuerdo escrito.</p>` +
    `<h3 class="gest-clausula">Solución de controversias</h3><p>Las diferencias se resolverán de forma directa entre los coordinadores y, de no lograrse, mediante conciliación.</p>` +
    `<p>Para constancia se firma el ${chip("fecha_documento")}.</p>` +
    `<div class="gest-firma" data-firma="1" contenteditable="false">Firma · Rector de la UDES</div>` +
    `<div class="gest-firma" data-firma="2" contenteditable="false">Firma · Representante de la contraparte</div><p><br></p>`
  );
}

interface Esquema {
  texto: string;
  nivel: number;
}

export function EditorModelo({ m, crea, logoUdes }: { m: Modelo; crea: boolean; logoUdes: string }) {
  const actualizar = useActualizarModelo();
  const aviso = useAviso();
  const hoja = useRef<HTMLDivElement>(null);
  const rango = useRef<Range | null>(null);
  const [sucio, setSucio] = useState(false);
  const [esquema, setEsquema] = useState<Esquema[]>([]);
  const [propios, setPropios] = useState(m.campos_personalizados);
  const [etiqueta, setEtiqueta] = useState("");

  const leerEsquema = useCallback(() => {
    const el = hoja.current;
    if (!el) return;
    setEsquema([...el.querySelectorAll("h1, h2, h3")].map((h) => ({ texto: (h.textContent ?? "").trim() || "(sin título)", nivel: h.tagName === "H3" ? 3 : 1 })));
  }, []);

  useEffect(() => {
    if (hoja.current) hoja.current.innerHTML = sanearHoja(m.contenido_html);
    leerEsquema();
    // Solo al abrir otro modelo: volver a pintar tras guardar movería el cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  useEffect(() => {
    const guardarRango = () => {
      const s = window.getSelection();
      if (s && s.rangeCount && hoja.current?.contains(s.anchorNode)) rango.current = s.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", guardarRango);
    return () => document.removeEventListener("selectionchange", guardarRango);
  }, []);

  const restaurar = () => {
    const el = hoja.current;
    if (!el) return;
    el.focus();
    const s = window.getSelection();
    if (!s) return;
    s.removeAllRanges();
    if (rango.current) s.addRange(rango.current);
    else {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      s.addRange(r);
    }
  };
  const cambio = () => {
    setSucio(true);
    leerEsquema();
  };
  const cmd = (nombre: string, valor?: string) => {
    restaurar();
    document.execCommand(nombre, false, valor);
    cambio();
  };
  const clausula = () => {
    cmd("formatBlock", "h3");
    const s = window.getSelection();
    const nodo = s?.anchorNode instanceof Element ? s.anchorNode : s?.anchorNode?.parentElement;
    nodo?.closest("h3")?.classList.add("gest-clausula");
    cambio();
  };
  const insertarCampo = (k: string) => cmd("insertHTML", `${chip(k)}&nbsp;`);
  const insertarFirma = (orden: number, rol: string) => cmd("insertHTML", `<div class="gest-firma" data-firma="${orden}" contenteditable="false">Firma · ${esc(rol)}</div><p><br></p>`);

  const agregarCampo = () => {
    const k = claveDe(etiqueta);
    if (!k || CLAVES_CONOCIDAS.has(k) || propios.some((p) => p.k === k)) return aviso.mal(new Error(k && (CLAVES_CONOCIDAS.has(k) || propios.some((p) => p.k === k)) ? "Ya existe un campo con ese nombre." : "Escriba un nombre corto, con letras y números."));
    setPropios([...propios, { k, etiqueta: etiqueta.trim() }]);
    setEtiqueta("");
    setSucio(true);
  };

  const guardar = () => {
    const html = sanearHoja(hoja.current?.innerHTML ?? "");
    const usados = camposDeHoja(html);
    actualizar.mutate(
      { id: m.id, cambios: { contenido_html: html, marcadores: usados, campos_personalizados: propios, cajas_firma: firmasDeHoja(html) } },
      { onSuccess: () => { setSucio(false); aviso.ok("Modelo guardado."); }, onError: aviso.mal },
    );
  };

  const delOficina = CAMPOS.filter((c) => c.origen === "ficha" || c.origen === "sistema");
  const alGenerar = [...CAMPOS.filter((c) => c.origen === "manual"), ...propios.map((p) => ({ k: p.k, etiqueta: p.etiqueta, ayuda: "Campo propio", ejemplo: "", origen: "manual" as const }))];

  const Boton = ({ children, onClick, etiqueta: tit }: { children: ReactNode; onClick: () => void; etiqueta: string }) => (
    <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} aria-label={tit} title={tit} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );

  return (
    <section className="conv-panel gest-editor-modelo">
      <div className="conv-bar" role="toolbar" aria-label="Formato del texto">
        <Boton etiqueta="Título" onClick={() => cmd("formatBlock", "h1")}>Título</Boton>
        <Boton etiqueta="Cláusula numerada" onClick={clausula}>Cláusula</Boton>
        <Boton etiqueta="Párrafo normal" onClick={() => cmd("formatBlock", "p")}>Párrafo</Boton>
        <span className="conv-sep" />
        <Boton etiqueta="Negrita" onClick={() => cmd("bold")}><b>N</b></Boton>
        <Boton etiqueta="Cursiva" onClick={() => cmd("italic")}><i>C</i></Boton>
        <Boton etiqueta="Subrayado" onClick={() => cmd("underline")}><u>S</u></Boton>
        <span className="conv-sep" />
        <Boton etiqueta="Lista con viñetas" onClick={() => cmd("insertUnorderedList")}>• Lista</Boton>
        <Boton etiqueta="Lista numerada" onClick={() => cmd("insertOrderedList")}>1. Lista</Boton>
        <span className="conv-sep" />
        <Boton etiqueta="Alinear a la izquierda" onClick={() => cmd("justifyLeft")}>Izq.</Boton>
        <Boton etiqueta="Centrar" onClick={() => cmd("justifyCenter")}>Centro</Boton>
        <Boton etiqueta="Alinear a la derecha" onClick={() => cmd("justifyRight")}>Der.</Boton>
        <Boton etiqueta="Justificar" onClick={() => cmd("justifyFull")}>Justif.</Boton>
        <span className="conv-grow" />
        {sucio ? <span className="conv-sub">Cambios sin guardar</span> : null}
        <button type="button" className="conv-btn conv-btn--pri" disabled={!crea || !sucio || actualizar.isPending} onClick={guardar}>
          {actualizar.isPending ? "Guardando…" : "Guardar contenido"}
        </button>
      </div>
      {aviso.nodo}
      <div className="gest-edi">
        <nav className="gest-esq" aria-label="Cláusulas del modelo">
          <h3>Cláusulas</h3>
          {esquema.length ? (
            <ul>
              {esquema.map((e, i) => (
                <li key={i}>
                  <button type="button" className={e.nivel === 1 ? "is-titulo" : undefined} onClick={() => hoja.current?.querySelectorAll("h1, h2, h3")[i]?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>
                    {e.texto}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="conv-sub">Marque un texto como «Cláusula» y aparece aquí.</p>
          )}
        </nav>

        <div className="gest-hoja-marco">
          <div className="gest-hoja-cab" aria-hidden="true">
            <img src={logoUdes} alt="" />
            <span className="gest-logo-inst">Logo de la institución</span>
          </div>
          <div
            ref={hoja}
            className="gest-hoja"
            contentEditable={crea}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Texto del convenio"
            spellCheck
            lang={m.idioma === "en" ? "en" : "es"}
            onInput={cambio}
            onPaste={(e) => {
              e.preventDefault();
              document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            }}
          />
        </div>

        <aside className="gest-campos" aria-label="Campos y firmas">
          <h3>Campos</h3>
          <p className="conv-sub">Haga clic en un campo para ponerlo donde está el cursor. Al generar el convenio se llenan con la ficha.</p>
          <div className="gest-vars gest-vars--col">
            {delOficina.map((c) => (
              <button key={c.k} type="button" disabled={!crea} onMouseDown={(e) => e.preventDefault()} onClick={() => insertarCampo(c.k)} title={c.ayuda}>
                {c.etiqueta}
              </button>
            ))}
          </div>
          <h3>Se piden al generar</h3>
          <div className="gest-vars gest-vars--col">
            {alGenerar.map((c) => (
              <button key={c.k} type="button" disabled={!crea} onMouseDown={(e) => e.preventDefault()} onClick={() => insertarCampo(c.k)} title={c.ayuda}>
                {c.etiqueta}
              </button>
            ))}
          </div>
          {crea ? (
            <div className="gest-nuevo-campo">
              <label className="it-campo" htmlFor="gm-campo">
                <span>Campo propio</span>
                <input id="gm-campo" type="text" value={etiqueta} maxLength={40} placeholder="Ej. Número de cupos" onChange={(e) => setEtiqueta(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregarCampo()} />
              </label>
              <button type="button" className="conv-btn conv-btn--sm" onClick={agregarCampo}>
                Agregar
              </button>
            </div>
          ) : null}
          <h3>Firmantes</h3>
          <ol className="gest-firmantes">
            {m.firmantes.map((f) => (
              <li key={f.orden}>
                <span>{f.rol}</span>
                {crea ? (
                  <button type="button" className="conv-btn conv-btn--sm" onMouseDown={(e) => e.preventDefault()} onClick={() => insertarFirma(f.orden, f.rol)}>
                    Poner caja de firma
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="conv-sub">Las cajas punteadas marcan dónde se estampará cada firma en la segunda parte.</p>
        </aside>
      </div>
    </section>
  );
}

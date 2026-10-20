/* =============================================================================
   Correos · Plantillas.

   Tres columnas: las plantillas de la identidad, el texto y el correo. Lo que
   se escribe se ve al momento a la derecha, armado con la MISMA función que usa
   el servidor (`armarCorreo`): lo que se ve es lo que llega.

   Cada plantilla se escribe por campos (como siempre) o en HTML, con el alcance
   que se elija. Las de fábrica no se borran; las propias («Personalizadas») sí,
   con confirmación.

   Nada se guarda hasta pulsar «Guardar». Cambiar de plantilla o de identidad
   no pierde lo escrito: cada borrador se queda en su plantilla, marcado como
   «sin guardar». «Enviar una prueba» envía el borrador tal como está.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  armarCorreo,
  CAMPOS,
  correoValido,
  ETIQUETA_VARIABLE,
  enlaceDeVerificacion,
  htmlDeCampos,
  IDENTIDADES,
  marcadoresDesconocidos,
  MARCAS,
  PERSONAS_DE_EJEMPLO,
  plantillaOriginal,
  ROLES,
  ROL_NOMBRE,
  TIPO_NOMBRE,
  TOPE_HTML,
  VALORES_DE_EJEMPLO,
  VARIABLES_POR_TIPO,
  type Alcance,
  type Campo,
  type Identidad,
  type Plantilla,
  type Rol,
} from "./servidor-logica";
import { borrarPlantilla, claves, crearPlantilla, enviarPrueba, guardarPlantilla, type Configuracion, type Leido } from "./datos";
import { Estado, Seg, type Aviso } from "./partes";
import { NuevaPlantilla } from "./NuevaPlantilla";
import { PlantillaHtml } from "./PlantillaHtml";

/** Un campo de texto, o el HTML. */
type Ref = Campo | "html";
type Modo = "campos" | "html";

const igual = (a: Plantilla, b: Plantilla) =>
  CAMPOS.every((c) => a[c] === b[c]) && JSON.stringify(a.roles) === JSON.stringify(b.roles) && a.html === b.html && a.alcance === b.alcance;

/** Como queda guardada: sin espacios sobrantes en las líneas cortas. */
const limpia = (p: Plantilla): Plantilla => ({ ...p, asunto: p.asunto.trim(), previa: p.previa.trim(), titulo: p.titulo.trim(), saludo: p.saludo.trim(), boton: p.boton.trim() });

/** Una plantilla propia tiene clave «c-…» y no tiene texto original: es la que puede borrarse. */
const esPropia = (clave: string) => clave.startsWith("c-") && !plantillaOriginal(clave);

const IDENTIDAD_OPCIONES = IDENTIDADES.map((i) => [i, MARCAS[i].nombre] as const);
const ROL_OPCIONES = ROLES.map((r) => [r, ROL_NOMBRE[r]] as const);
const MODO_OPCIONES = [
  ["campos", "Campos"],
  ["html", "HTML"],
] as const;
const DISPOSITIVOS = [
  ["pc", "Computador"],
  ["cel", "Celular"],
] as const;
type Dispositivo = (typeof DISPOSITIVOS)[number][0];

const LINEAS: { campo: Exclude<Campo, "mensaje">; rotulo: string; ayuda?: string }[] = [
  { campo: "asunto", rotulo: "Asunto" },
  { campo: "previa", rotulo: "Línea previa", ayuda: "La que algunos programas muestran junto al asunto." },
  { campo: "titulo", rotulo: "Título" },
  { campo: "saludo", rotulo: "Saludo" },
];

export function Plantillas({ config }: { config: Configuracion }) {
  const queryClient = useQueryClient();
  const [identidad, setIdentidad] = useState<Identidad>("plan");
  const [clave, setClave] = useState(config.plantillas.find((p) => p.identidad === "plan")?.clave ?? config.plantillas[0]?.clave ?? "");
  const [borradores, setBorradores] = useState<Record<string, Plantilla>>({});
  const [rol, setRol] = useState<Rol>("estudiante");
  const [dispositivo, setDispositivo] = useState<Dispositivo>("pc");
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [prueba, setPrueba] = useState<Aviso | null>(null);
  const [para, setPara] = useState("");
  const [ocupado, setOcupado] = useState<"guardar" | "prueba" | "borrar" | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const ultimo = useRef<Ref>("mensaje");
  const campos = useRef<Partial<Record<Ref, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const cursor = useRef<{ campo: Ref; pos: number } | null>(null);

  const guardada = config.plantillas.find((p) => p.clave === clave) ?? config.plantillas[0];
  const actual = borradores[clave] ?? guardada;
  const original = plantillaOriginal(clave);
  const modo: Modo = actual.html != null ? "html" : "campos";
  const sinGuardar = !igual(limpia(actual), guardada);
  const persona = PERSONAS_DE_EJEMPLO[rol];
  const mensaje = actual.roles ? actual.roles[rol] : actual.mensaje;
  const desconocidos = useMemo(() => marcadoresDesconocidos(actual), [actual]);
  const remitente = config.remitentes[actual.identidad];
  const demasiado = (actual.html ?? "").length > TOPE_HTML;

  const correo = useMemo(() => {
    const sitio = window.location.origin;
    const codigo = actual.tipo === "codigo";
    return armarCorreo({
      plantilla: actual,
      persona,
      rol,
      enlace: codigo ? "" : enlaceDeVerificacion(sitio, "enlace-personal-de-ejemplo", "invite", sitio),
      codigo: codigo ? VALORES_DE_EJEMPLO.codigo : undefined,
      valores: VALORES_DE_EJEMPLO,
      sitio,
      respondible: remitente.responder !== "",
      resaltar: true,
    });
  }, [actual, persona, rol, remitente.responder]);

  // Tras insertar un dato, el cursor queda justo después de él.
  useLayoutEffect(() => {
    const c = cursor.current;
    if (!c) return;
    cursor.current = null;
    const el = campos.current[c.campo];
    el?.focus();
    el?.setSelectionRange(c.pos, c.pos);
  });

  /** Cambia la plantilla en edición: el borrador de la plantilla actual, o la guardada si aún no hay borrador. */
  const edita = (cambio: (base: Plantilla) => Plantilla) => setBorradores((b) => ({ ...b, [clave]: cambio(b[clave] ?? guardada) }));

  const cambiar = (campo: Campo, valor: string) => {
    setAviso(null);
    edita((base) => (campo === "mensaje" && base.roles ? { ...base, roles: { ...base.roles, [rol]: valor } } : { ...base, [campo]: valor }));
  };

  const cambiarHtml = (valor: string) => {
    setAviso(null);
    edita((base) => ({ ...base, html: valor }));
  };

  const cambiarAlcance = (valor: Alcance) => {
    setAviso(null);
    edita((base) => ({ ...base, alcance: valor }));
  };

  /** De campos a HTML, el HTML parte de lo escrito en los campos. De HTML a campos, el HTML se descarta al guardar. */
  const cambiarModo = (m: Modo) => {
    setAviso(null);
    ultimo.current = "mensaje";
    edita((base) => (m === "html" ? { ...base, html: base.html ?? htmlDeCampos(base, rol) } : { ...base, html: null }));
  };

  const elegir = (k: string) => {
    setClave(k);
    setAviso(null);
    setPrueba(null);
    setConfirmarBorrado(false);
  };

  const insertar = (dato: string) => {
    const destino: Ref = actual.html != null ? "html" : ultimo.current === "html" ? "mensaje" : ultimo.current;
    const el = campos.current[destino];
    const valor = destino === "html" ? (actual.html ?? "") : destino === "mensaje" ? mensaje : actual[destino];
    const inicio = el?.selectionStart ?? valor.length;
    const fin = el?.selectionEnd ?? inicio;
    const marcador = `{{${dato}}}`;
    cursor.current = { campo: destino, pos: inicio + marcador.length };
    const nuevo = valor.slice(0, inicio) + marcador + valor.slice(fin);
    if (destino === "html") cambiarHtml(nuevo);
    else cambiar(destino, nuevo);
  };

  const guardar = async () => {
    setOcupado("guardar");
    setAviso(null);
    try {
      const lista = limpia(actual);
      await guardarPlantilla(lista);
      queryClient.setQueryData<Leido<Configuracion>>(claves.configuracion, (viejo) =>
        viejo && !viejo.falta ? { falta: false, datos: { ...viejo.datos, plantillas: viejo.datos.plantillas.map((p) => (p.clave === lista.clave ? lista : p)) } } : viejo,
      );
      setBorradores(({ [clave]: _, ...resto }) => resto);
      setAviso(desconocidos.length ? { tono: "aviso", texto: "Guardada, con un aviso por revisar." } : { tono: "ok", texto: "Guardada. Vale desde el próximo correo." });
    } catch (error) {
      setAviso({ tono: "mal", texto: error instanceof Error ? error.message : "No se guardó la plantilla." });
    } finally {
      setOcupado(null);
    }
  };

  const volver = () => {
    if (!original) return;
    setBorradores((b) => ({ ...b, [clave]: original }));
    setAviso({ tono: "aviso", texto: igual(original, guardada) ? "Volvió al texto original." : "Volvió al texto original. Pulse «Guardar» para que valga." });
  };

  const crear = async (nueva: Plantilla) => {
    await crearPlantilla(nueva);
    queryClient.setQueryData<Leido<Configuracion>>(claves.configuracion, (viejo) =>
      viejo && !viejo.falta ? { falta: false, datos: { ...viejo.datos, plantillas: [...viejo.datos.plantillas, nueva] } } : viejo,
    );
    setIdentidad(nueva.identidad);
    elegir(nueva.clave);
    setAviso({ tono: "ok", texto: "Plantilla creada. Sin evento conectado, no sale sola: pruébela con «Enviar una prueba»." });
  };

  const borrar = async () => {
    setOcupado("borrar");
    setAviso(null);
    try {
      await borrarPlantilla(clave);
      queryClient.setQueryData<Leido<Configuracion>>(claves.configuracion, (viejo) =>
        viejo && !viejo.falta ? { falta: false, datos: { ...viejo.datos, plantillas: viejo.datos.plantillas.filter((p) => p.clave !== clave) } } : viejo,
      );
      setBorradores(({ [clave]: _, ...resto }) => resto);
      const fabrica = config.plantillas.find((p) => p.identidad === identidad && plantillaOriginal(p.clave));
      if (fabrica) elegir(fabrica.clave);
      setAviso({ tono: "ok", texto: "Plantilla borrada." });
    } catch (error) {
      setAviso({ tono: "mal", texto: error instanceof Error ? error.message : "No se borró la plantilla." });
    } finally {
      setOcupado(null);
      setConfirmarBorrado(false);
    }
  };

  const probar = async () => {
    const destino = para.trim();
    if (!correoValido(destino)) {
      setPrueba({ tono: "mal", texto: "Escriba un correo completo para la prueba." });
      return;
    }
    setOcupado("prueba");
    setPrueba({ tono: "espera", texto: "Enviando la prueba…" });
    const r = await enviarPrueba(destino, limpia(actual), rol);
    setPrueba({ tono: r.ok ? "ok" : "mal", texto: r.mensaje });
    setOcupado(null);
  };

  const deLaIdentidad = config.plantillas.filter((p) => p.identidad === identidad);
  const grupos = [...new Set(deLaIdentidad.map((p) => p.grupo))];
  const enfocar = (campo: Ref) => () => {
    ultimo.current = campo;
  };
  const variables = VARIABLES_POR_TIPO[actual.tipo];

  return (
    <div className="cor-taller">
      <div className="cor-taller__barra">
        <Seg
          label="Identidad"
          value={identidad}
          options={IDENTIDAD_OPCIONES}
          onChange={(v) => {
            setIdentidad(v);
            elegir(config.plantillas.find((p) => p.identidad === v)?.clave ?? clave);
          }}
        />
        <p className="cor-chica">El diseño del correo es fijo y está probado en Outlook y Gmail: aquí se escriben las frases, o el HTML de cada plantilla.</p>
      </div>

      <div className="cor-taller__cuerpo">
        <nav className="cor-lista" aria-label={`Plantillas de ${MARCAS[identidad].nombre}`}>
          <NuevaPlantilla plantillas={config.plantillas} identidadInicial={identidad} onCrear={crear} />
          {grupos.map((grupo) => (
            <div key={grupo} className="cor-lista__grupo">
              <h3>{grupo}</h3>
              {deLaIdentidad
                .filter((p) => p.grupo === grupo)
                .map((p) => {
                  const b = borradores[p.clave];
                  const o = plantillaOriginal(p.clave);
                  const marcas = [p.cuando, o && !igual(p, o) ? "cambiada" : "", b && !igual(limpia(b), p) ? "sin guardar" : ""].filter(Boolean);
                  return (
                    <button key={p.clave} type="button" aria-current={p.clave === clave ? "true" : undefined} onClick={() => elegir(p.clave)}>
                      {p.nombre}
                      <small>{marcas.join(" · ")}</small>
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>

        <form
          className="cor-editor"
          onSubmit={(e) => {
            e.preventDefault();
            if (sinGuardar && !ocupado && !demasiado) void guardar();
          }}
        >
          <header className="cor-editor__cabeza">
            <div>
              <h2>{actual.nombre}</h2>
              <p className="cor-chica">
                {TIPO_NOMBRE[actual.tipo]} · {actual.cuando} · identidad: {MARCAS[actual.identidad].nombre}
              </p>
            </div>
            {esPropia(clave) &&
              (confirmarBorrado ? (
                <div className="cor-borrar" role="group" aria-label="Confirmar el borrado">
                  <span>¿Borrar «{actual.nombre}»? No se puede deshacer.</span>
                  <button type="button" className="button-secondary" disabled={ocupado !== null} onClick={() => void borrar()}>
                    {ocupado === "borrar" ? "Borrando…" : "Sí, borrar"}
                  </button>
                  <button type="button" className="button-ghost" disabled={ocupado !== null} onClick={() => setConfirmarBorrado(false)}>
                    No
                  </button>
                </div>
              ) : (
                <button type="button" className="button-ghost cor-borrar__abrir" disabled={ocupado !== null} onClick={() => setConfirmarBorrado(true)}>
                  Borrar plantilla
                </button>
              ))}
          </header>

          <div className="cor-modo">
            <Seg label="Cómo se escribe el correo" value={modo} options={MODO_OPCIONES} onChange={cambiarModo} />
            {modo === "html" && (
              <p className="cor-chica">
                El HTML reemplaza a los campos. Para volver a los campos, pulse «Campos» y guarde: el HTML se descarta.
              </p>
            )}
          </div>

          {modo === "campos" ? (
            <>
              {LINEAS.map(({ campo, rotulo, ayuda }) => (
                <label key={campo} className="admin-field">
                  <span>
                    {rotulo}
                    {ayuda && <small>{ayuda}</small>}
                  </span>
                  <input
                    ref={(el) => {
                      campos.current[campo] = el;
                    }}
                    value={actual[campo]}
                    maxLength={200}
                    onFocus={enfocar(campo)}
                    onChange={(e) => cambiar(campo, e.target.value)}
                  />
                </label>
              ))}

              {actual.roles && (
                <div className="admin-field">
                  <span>Este mensaje cambia según quién crea la cuenta</span>
                  <Seg label="Rol del mensaje" value={rol} options={ROL_OPCIONES} onChange={setRol} />
                </div>
              )}
              <label className="admin-field">
                <span>{actual.roles ? `Mensaje para ${ROL_NOMBRE[rol].toLowerCase()}` : "Mensaje"}</span>
                <textarea
                  ref={(el) => {
                    campos.current.mensaje = el;
                  }}
                  rows={5}
                  value={mensaje}
                  maxLength={4000}
                  onFocus={enfocar("mensaje")}
                  onChange={(e) => cambiar("mensaje", e.target.value)}
                />
              </label>
            </>
          ) : (
            <PlantillaHtml
              html={actual.html ?? ""}
              alcance={actual.alcance}
              tipo={actual.tipo}
              onHtml={cambiarHtml}
              onAlcance={cambiarAlcance}
              onFocus={enfocar("html")}
              textarea={(el) => {
                campos.current.html = el;
              }}
            />
          )}

          <div className="cor-datos">
            <span className="cor-chica">Insertar un dato:</span>
            {variables.map((d) => (
              // No roba el foco del campo donde se está escribiendo.
              <button key={d} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertar(d)}>
                {ETIQUETA_VARIABLE[d] ?? d}
              </button>
            ))}
          </div>

          {modo === "campos" && actual.tipo !== "codigo" && (
            <label className="admin-field">
              <span>
                Texto del botón
                <small>El enlace personal lo pone el sistema: no se escribe.</small>
              </span>
              <input
                ref={(el) => {
                  campos.current.boton = el;
                }}
                value={actual.boton}
                maxLength={80}
                onFocus={enfocar("boton")}
                onChange={(e) => cambiar("boton", e.target.value)}
              />
            </label>
          )}
          {modo === "campos" && (
            <label className="admin-field">
              <span>Nota final</span>
              <input
                ref={(el) => {
                  campos.current.nota = el;
                }}
                value={actual.nota}
                maxLength={600}
                onFocus={enfocar("nota")}
                onChange={(e) => cambiar("nota", e.target.value)}
              />
            </label>
          )}

          {desconocidos.length > 0 && (
            <p className="cor-aviso" role="alert">
              {desconocidos.join(", ")} {desconocidos.length === 1 ? "no es un dato" : "no son datos"} que el sistema conozca para este tipo de correo:{" "}
              {desconocidos.length === 1 ? "llegaría" : "llegarían"} tal cual. Use los botones de «Insertar un dato».
            </p>
          )}
          {demasiado && (
            <p className="cor-aviso" role="alert">
              El HTML pasa de 100 000 caracteres. Acórtelo antes de guardar.
            </p>
          )}

          <div className="cor-acciones">
            <button type="submit" className="button-primary" disabled={!sinGuardar || ocupado !== null || demasiado}>
              {ocupado === "guardar" ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="button-ghost" disabled={!original || igual(actual, original) || ocupado !== null} onClick={volver}>
              Volver al texto original
            </button>
            <Estado aviso={aviso ?? (sinGuardar ? { tono: "aviso", texto: "Hay cambios sin guardar." } : null)} />
          </div>

          <div className="cor-prueba">
            <label className="admin-field">
              <span>
                Enviar una prueba a
                <small>Sale lo que está escrito ahora, guardado o no.</small>
              </span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="su.correo@udes.edu.co"
                value={para}
                onChange={(e) => setPara(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!ocupado) void probar();
                  }
                }}
              />
            </label>
            <button type="button" className="button-secondary" disabled={ocupado !== null} onClick={() => void probar()}>
              Enviar una prueba
            </button>
            <Estado aviso={prueba} />
          </div>
        </form>

        <aside className="cor-vista" aria-label="Vista previa">
          <div className="cor-vista__barra">
            <label className="cor-como">
              Verlo como
              <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {PERSONAS_DE_EJEMPLO[r].rotulo}
                  </option>
                ))}
              </select>
            </label>
            <Seg label="Tamaño de la vista previa" value={dispositivo} options={DISPOSITIVOS} onChange={setDispositivo} />
          </div>
          <div className="cor-bandeja">
            <b>{correo.asunto || "(sin asunto)"}</b>
            <span>
              De: {remitente.nombre || MARCAS[actual.identidad].nombre} &lt;{remitente.direccion || config.ajustes.usuario || "el usuario de la conexión"}&gt;
              {remitente.responder ? ` · responder a ${remitente.responder}` : ""}
            </span>
            {correo.previa && <span>{correo.previa}</span>}
          </div>
          <Marco html={correo.html} dispositivo={dispositivo} cambio={`${clave}|${rol}`} />
          <p className="cor-chica">Los datos resaltados son de una persona de ejemplo. En el correo de verdad no llevan resalte, y el enlace es el personal de cada quien.</p>
        </aside>
      </div>
    </div>
  );
}

/**
 * El correo, dentro de un marco. Es el HTML que arma el servidor, en un
 * documento aparte: sus colores son los del correo, no los de la intranet, y
 * por eso no cambian con el tema. Es una imagen de lo que llega, no una
 * página: va inerte, sin foco ni tabulador (DESIGN.md, «Inert Preview Rule»).
 */
function Marco({ html, dispositivo, cambio }: { html: string; dispositivo: Dispositivo; cambio: string }) {
  const marco = useRef<HTMLIFrameElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(560);

  useEffect(() => {
    caja.current?.setAttribute("inert", "");
  }, []);

  useEffect(() => {
    const doc = marco.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const medir = () => setAlto(Math.max(240, doc.documentElement.scrollHeight));
    medir();
    // La cara de Pilo llega después y no cambia el alto (tiene tamaño fijo), pero por si el portal tarda.
    const imagenes = [...doc.images];
    imagenes.forEach((img) => img.addEventListener("load", medir));
    // El ancho cambia al pasar a celular, al estrechar la ventana o al volver de otra vista: el alto se mide otra vez.
    const observador = new ResizeObserver(medir);
    if (caja.current) observador.observe(caja.current);
    return () => {
      observador.disconnect();
      imagenes.forEach((img) => img.removeEventListener("load", medir));
    };
  }, [html, dispositivo]);

  // Al cambiar de plantilla o de persona, el correo se asienta: un solo gesto, corto.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    marco.current?.animate([{ opacity: 0.35, filter: "blur(3px)" }, { opacity: 1, filter: "blur(0px)" }], { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
  }, [cambio]);

  return (
    <div ref={caja} className="cor-marco" data-dispositivo={dispositivo} aria-hidden="true">
      <iframe ref={marco} title="Vista previa del correo" sandbox="allow-same-origin" tabIndex={-1} style={{ height: alto }} />
    </div>
  );
}

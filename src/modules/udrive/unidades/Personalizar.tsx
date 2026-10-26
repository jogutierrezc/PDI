/* =============================================================================
   UDrive · Unidades de trabajo · «Personalizar esta unidad».

   Cuatro decisiones y nada más: color, composición de la cabecera (con su
   imagen y encuadre), orden de las secciones del inicio y carpetas ancladas.
   Se ven al instante a la derecha; nada se guarda hasta «Guardar». Solo quien
   administra la unidad (o la administración general).
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Encuadre } from "../../informes/vista/EditorPortada";
import { useCarpetas } from "../datos";
import { subarbol } from "../lib/arbol";
import { errorDe, subirImagenCabecera, useActualizarUnidad, useUrlCabecera } from "./datos";
import type { CambiosUnidad } from "./datos";
import { aparienciaDe, contrasteConBlanco, cumpleContraste, monogramaValido, normalizarHex, normalizarMonograma, oscurecerHastaCumplir, textoContraste } from "./lib";
import { entrarNota, fundir } from "./movimiento";
import { Glifo, Portada, PortadaDeUnidad } from "./Portada";
import type { Composicion, IconoUnidad, Portada as TipoPortada, Seccion, UnidadFila } from "./tipos";
import { ACENTOS, COMPOSICIONES, ICONOS, MAX_IMAGEN_CABECERA, PORTADAS, SECCIONES, TIPOS_IMAGEN } from "./tipos";

export function PersonalizarUnidad({ u }: { u: UnidadFila }) {
  const navigate = useNavigate();
  const guardar = useActualizarUnidad();
  const carpetasQ = useCarpetas();
  const urlActual = useUrlCabecera(u.imagen?.ruta);
  const [nombre, setNombre] = useState(u.nombre);
  const [descripcion, setDescripcion] = useState(u.descripcion);
  const [monograma, setMonograma] = useState(u.monograma);
  const [acento, setAcento] = useState(u.acento);
  const [icono, setIcono] = useState<IconoUnidad>(u.icono);
  const [composicion, setComposicion] = useState<Composicion>(u.composicion);
  const [portada, setPortada] = useState<TipoPortada>(u.portada);
  const [orden, setOrden] = useState<Seccion[]>(u.orden_secciones);
  const [ancladas, setAncladas] = useState<string[]>(u.ancladas);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [quitar, setQuitar] = useState(false);
  const [enc, setEnc] = useState({ x: u.imagen?.x ?? 50, y: u.imagen?.y ?? 50, zoom: u.imagen?.zoom ?? 1 });
  const [previaLocal, setPreviaLocal] = useState<string | null>(null);
  const [errorImagen, setErrorImagen] = useState("");
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!archivo) return setPreviaLocal(null);
    const url = URL.createObjectURL(archivo);
    setPreviaLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const carpetas = useMemo(() => carpetasQ.data ?? [], [carpetasQ.data]);
  const opciones = useMemo(() => {
    const dentro = subarbol(carpetas, u.carpeta_raiz);
    return carpetas.filter((c) => dentro.has(c.id) && c.id !== u.carpeta_raiz && !c.borrado_en).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).slice(0, 60);
  }, [carpetas, u.carpeta_raiz]);

  const hex = normalizarHex(acento);
  const colorOk = Boolean(hex) && cumpleContraste(hex!);
  const ratio = hex ? contrasteConBlanco(hex) : 0;
  const nombreOk = nombre.trim().length >= 3;
  const monoOk = monogramaValido(monograma);
  const imagenUrl = quitar ? null : (previaLocal ?? urlActual.data ?? null);
  const hayImagen = Boolean(imagenUrl);

  const apariencia = useMemo(
    () => ({ ...aparienciaDe({ ...u, nombre: nombre.trim() || u.nombre, descripcion, monograma: monogramaValido(monograma) ? monograma : u.monograma, acento: colorOk ? hex! : u.acento, icono, composicion, portada, imagen: null }, imagenUrl), imagen: imagenUrl ? enc : null }),
    [u, nombre, descripcion, monograma, colorOk, hex, icono, composicion, portada, imagenUrl, enc],
  );

  const cambia =
    nombre.trim() !== u.nombre || descripcion.trim() !== u.descripcion || monograma !== u.monograma || (hex ?? acento) !== u.acento || icono !== u.icono || composicion !== u.composicion || portada !== u.portada ||
    orden.join() !== u.orden_secciones.join() || ancladas.join() !== u.ancladas.join() || Boolean(archivo) || (quitar && Boolean(u.imagen)) || (Boolean(u.imagen) && !quitar && (enc.x !== u.imagen!.x || enc.y !== u.imagen!.y || enc.zoom !== u.imagen!.zoom));

  const mover = (k: Seccion, d: -1 | 1) => {
    const i = orden.indexOf(k);
    const j = i + d;
    if (j < 0 || j >= orden.length) return;
    const n = orden.slice();
    n.splice(i, 1);
    n.splice(j, 0, k);
    setOrden(n);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-orden="${k}"] button:not([disabled])[data-d="${d}"]`)?.focus());
  };

  const elegirImagen = (f: File | null) => {
    setErrorImagen("");
    if (!f) return;
    if (!TIPOS_IMAGEN.includes(f.type)) return setErrorImagen("Ese archivo no es JPG, PNG ni WebP.");
    if (f.size > 25 * 1024 * 1024) return setErrorImagen("La imagen pesa más de 25 MB. Reduzca su tamaño.");
    setArchivo(f);
    setQuitar(false);
    setEnc({ x: 50, y: 50, zoom: 1 });
  };

  const guardarTodo = async () => {
    setError("");
    setGuardado(false);
    try {
      const cambios: CambiosUnidad = {};
      if (nombre.trim() !== u.nombre) cambios.nombre = nombre.trim();
      if (descripcion.trim() !== u.descripcion) cambios.descripcion = descripcion.trim();
      if (monograma !== u.monograma) cambios.monograma = monograma;
      if (hex && hex !== u.acento) cambios.acento = hex;
      if (icono !== u.icono) cambios.icono = icono;
      if (composicion !== u.composicion) cambios.composicion = composicion;
      if (portada !== u.portada) cambios.portada = portada;
      if (orden.join() !== u.orden_secciones.join()) cambios.orden_secciones = orden;
      if (ancladas.join() !== u.ancladas.join()) cambios.ancladas = ancladas;
      if (quitar && u.imagen) cambios.imagen = null;
      else if (archivo) cambios.imagen = { ruta: await subirImagenCabecera(u.id, archivo), ...enc };
      else if (u.imagen && (enc.x !== u.imagen.x || enc.y !== u.imagen.y || enc.zoom !== u.imagen.zoom)) cambios.imagen = { ruta: u.imagen.ruta, ...enc };
      await guardar.mutateAsync({ unidad: u.id, cambios });
      setGuardado(true);
      setArchivo(null);
      setQuitar(false);
    } catch (e) {
      setError(errorDe(e as Error).message);
      requestAnimationFrame(() => entrarNota(document.getElementById("un-pz-error")));
    }
  };

  const descartar = () => navigate(`/admin/udrive/unidad/${u.id}`);
  useEffect(() => {
    if (guardado) fundir(document.getElementById("un-pz-ok"));
  }, [guardado]);

  return (
    <div className="un-pagina">
      <header className="un-cab">
        <div>
          <p className="un-kicker">{u.nombre}</p>
          <h1>Personalizar esta unidad</h1>
          <p className="un-ayuda un-cab__d">Los cambios se ven al instante a la derecha y se aplican para todo el equipo cuando guarda.</p>
        </div>
      </header>
      {u.archivada_en ? <p className="un-nota un-nota--aviso">La unidad está archivada: restáurela para cambiarla.</p> : null}
      <div className="un-custom">
        <form className="un-ctl" onSubmit={(e) => e.preventDefault()} noValidate>
          <fieldset className="un-fld">
            <legend>Nombre y descripción</legend>
            <label htmlFor="un-pz-n" className="un-sr">Nombre de la unidad</label>
            <input id="un-pz-n" type="text" value={nombre} maxLength={120} aria-invalid={!nombreOk} onChange={(e) => setNombre(e.target.value)} />
            <span className="un-error" aria-live="polite">{nombreOk ? "" : "Use al menos 3 caracteres."}</span>
            <label htmlFor="un-pz-d" className="un-sr">Descripción corta</label>
            <textarea id="un-pz-d" rows={2} maxLength={140} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </fieldset>
          <div className="un-dos">
            <div className="un-fld">
              <label htmlFor="un-pz-m">Monograma</label>
              <input id="un-pz-m" type="text" maxLength={4} className="un-mono-in" value={monograma} aria-invalid={!monoOk} onChange={(e) => setMonograma(normalizarMonograma(e.target.value))} />
              <span className="un-error" aria-live="polite">{monoOk ? "" : "De 2 a 4 letras o números."}</span>
            </div>
            <div className="un-fld">
              <label htmlFor="un-pz-h">Color de acento</label>
              <input id="un-pz-h" type="text" maxLength={7} spellCheck={false} value={acento} aria-invalid={!colorOk} aria-describedby="un-pz-ct" onChange={(e) => setAcento(normalizarHex(e.target.value) ?? e.target.value)} />
            </div>
          </div>
          <div className="un-sw" role="group" aria-label="Colores sugeridos">
            {ACENTOS.map((c) => <button key={c} type="button" style={{ background: c }} aria-pressed={acento === c} aria-label={`Color ${c}`} onClick={() => setAcento(c)} />)}
          </div>
          <div id="un-pz-ct" className={`un-contraste${colorOk ? " un-contraste--ok" : " un-contraste--mal"}`} aria-live="polite">
            {!hex ? "Escriba un color de seis cifras, como #0b3a78." : colorOk ? <><b>Cumple.</b> {textoContraste(ratio)}:1 contra blanco.</> : <>{textoContraste(ratio)}:1. Es muy claro. <button type="button" className="un-btn un-btn--sec un-btn--chico" onClick={() => setAcento(oscurecerHastaCumplir(hex))}>Oscurecer hasta cumplir</button></>}
          </div>

          <fieldset className="un-fld">
            <legend>Icono</legend>
            <div className="un-iconos" role="radiogroup" aria-label="Icono">
              {(Object.keys(ICONOS) as IconoUnidad[]).map((k) => <button key={k} type="button" role="radio" aria-checked={icono === k} aria-label={ICONOS[k].nombre} title={ICONOS[k].nombre} onClick={() => setIcono(k)}><Glifo icono={k} tam={22} /></button>)}
            </div>
          </fieldset>

          <fieldset className="un-fld">
            <legend>Composición de la cabecera</legend>
            <div className="un-opts" role="radiogroup" aria-label="Composición">
              {(Object.keys(COMPOSICIONES) as Composicion[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={composicion === k} onClick={() => setComposicion(k)}>
                  <span className="un-opts__mini"><Portada a={{ ...apariencia, composicion: k, nombre: "", descripcion: "" }} tam="tarjeta" /></span>{COMPOSICIONES[k].nombre}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="un-fld">
            <legend>Imagen de cabecera</legend>
            <div className="un-opts" role="radiogroup" aria-label="Patrón de la casa">
              {(Object.keys(PORTADAS) as TipoPortada[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={portada === k && !hayImagen} onClick={() => { setPortada(k); setArchivo(null); setQuitar(true); }}>
                  <span className="un-opts__mini"><Portada a={{ ...apariencia, portada: k, imagenUrl: null, imagen: null, composicion: "D", nombre: "", descripcion: "", monograma: "" }} tam="tarjeta" /></span>{PORTADAS[k]}
                </button>
              ))}
            </div>
            <div className="un-fld">
              <label htmlFor="un-pz-f">Subir una imagen propia (JPG, PNG o WebP, hasta 5 MB ya comprimida)</label>
              <input id="un-pz-f" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { elegirImagen(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              <span className="un-error" aria-live="polite">{errorImagen}</span>
            </div>
            {hayImagen && imagenUrl ? (
              <div className="un-enc">
                <Encuadre url={imagenUrl} foto={{ ruta: "", ...enc }} aspecto="5 / 2" onChange={(f) => setEnc({ x: f.x, y: f.y, zoom: f.zoom })} />
                <div className="un-rango">
                  <label htmlFor="un-pz-z">Ampliación</label>
                  <input id="un-pz-z" type="range" min={1} max={3} step={0.05} value={enc.zoom} onChange={(e) => setEnc({ ...enc, zoom: Number(e.target.value) })} />
                  <span>{enc.zoom.toFixed(2).replace(".", ",")}×</span>
                </div>
                <div className="un-fila" role="group" aria-label="Alinear el recorte">
                  <span className="un-ayuda">Alinear:</span>
                  {([["Arriba", 0], ["Centro", 50], ["Abajo", 100]] as const).map(([t, y]) => <button key={t} type="button" className="un-btn un-btn--sec un-btn--chico" aria-pressed={enc.y === y} onClick={() => setEnc({ ...enc, y })}>{t}</button>)}
                </div>
                <p className="un-ayuda">Arrastre la imagen para moverla. Con el teclado: flechas para moverla y más y menos para el zoom.</p>
                <button type="button" className="un-btn un-btn--texto" onClick={() => { setArchivo(null); setQuitar(true); }}>Quitar la imagen y usar un patrón</button>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="un-fld">
            <legend>Orden de las secciones del inicio</legend>
            <ol className="un-ord">
              {orden.map((k, i) => (
                <li key={k} data-orden={k}>
                  <span>{SECCIONES[k]}</span>
                  <span className="un-fila un-fila--junta">
                    <button type="button" data-d="-1" disabled={i === 0} aria-label={`Subir ${SECCIONES[k]}`} onClick={() => mover(k, -1)}>↑</button>
                    <button type="button" data-d="1" disabled={i === orden.length - 1} aria-label={`Bajar ${SECCIONES[k]}`} onClick={() => mover(k, 1)}>↓</button>
                  </span>
                </li>
              ))}
            </ol>
          </fieldset>

          <fieldset className="un-fld">
            <legend>Carpetas ancladas <span className="un-ayuda">(hasta 4)</span></legend>
            {opciones.length ? (
              <div className="un-chk">
                {opciones.map((c) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={ancladas.includes(c.id)} onChange={(e) => {
                      if (e.target.checked && ancladas.length >= 4) return setError("Se pueden anclar hasta 4 carpetas. Quite una para anclar otra.");
                      setError("");
                      setAncladas(e.target.checked ? [...ancladas, c.id] : ancladas.filter((x) => x !== c.id));
                    }} />
                    {c.nombre}
                  </label>
                ))}
              </div>
            ) : <p className="un-ayuda">Aún no hay carpetas en la unidad. Créelas desde Archivos y vuelva para anclarlas.</p>}
          </fieldset>

          {error ? <p className="un-nota un-nota--error" role="alert" id="un-pz-error">{error}</p> : null}
          {guardado ? <p className="un-nota un-nota--ok" role="status" id="un-pz-ok">Cambios guardados. Así se ve ahora la unidad para todo el equipo.</p> : null}
          <div className="un-fila">
            <button type="button" className="un-btn" disabled={!cambia || !nombreOk || !monoOk || !colorOk || guardar.isPending || Boolean(u.archivada_en)} onClick={() => void guardarTodo()}>{guardar.isPending ? "Guardando…" : "Guardar"}</button>
            <button type="button" className="un-btn un-btn--sec" onClick={descartar}>{cambia ? "Descartar" : "Volver al inicio"}</button>
          </div>
        </form>

        <div className="un-previa" aria-label="Vista previa de la unidad">
          <p className="un-kicker">Vista previa</p>
          <div className="un-unidad un-unidad--previa" style={{ "--ac": colorOk ? hex : u.acento } as CSSProperties}>
            <Portada a={apariencia} tam="pagina" como="div" />
            <ol className="un-previa__orden">
              {orden.map((k) => (
                <li key={k}><b>{SECCIONES[k]}</b>{k === "carpetas" ? <span>{ancladas.length ? ancladas.map((id) => carpetas.find((c) => c.id === id)?.nombre).filter(Boolean).join(" · ") : "Sin carpetas ancladas"}</span> : null}</li>
              ))}
            </ol>
          </div>
          <p className="un-ayuda">La unidad guardada tiene este aspecto: <PortadaDeUnidadMini u={u} /></p>
        </div>
      </div>
    </div>
  );
}

/** Una miniatura de cómo está guardada hoy. */
function PortadaDeUnidadMini({ u }: { u: UnidadFila }) {
  return <span className="un-mini"><PortadaDeUnidad u={u} tam="tarjeta" /></span>;
}

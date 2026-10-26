/* =============================================================================
   UDrive · Unidades de trabajo · formulario de creación.

   Cuatro pasos cortos (Datos, Identidad, Personas, Revisar) con la tarjeta de
   la unidad armándose a la vista. Se eligió pasos y no una sola página porque
   el de personas es el más largo y el que más errores trae: merece pantalla
   propia. Todo tiene un valor por defecto sacado del nombre (monograma, color,
   composición, icono), así que basta con un nombre y las personas.

   La unidad se crea de una vez en la base (drive_unidad_crear): unidad, carpeta
   raíz, carpetas de la plantilla y personas. La imagen de cabecera se sube
   después, porque solo quien administra una unidad que ya existe puede escribir
   en su carpeta del bucket.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { Encuadre } from "../../informes/vista/EditorPortada";
import { errorDe, useCrearUnidad, useEstructura, useUnidades } from "./datos";
import { cumpleContraste, contrasteConBlanco, fechaDeCampo, monogramaPorDefecto, monogramaValido, nombreUnidadError, normalizarHex, normalizarMonograma, oscurecerHastaCumplir, propuestaDeNombre, textoContraste } from "./lib";
import { confirmar, entrarNota, pasoFormulario } from "./movimiento";
import { Glifo, Portada, CuerpoTarjeta } from "./Portada";
import { MatrizPapeles, PersonasEditor } from "./Personas";
import type { NuevaPersona } from "./Personas";
import type { Apariencia, Composicion, IconoUnidad, MiembroBorrador, Plantilla, Portada as TipoPortada } from "./tipos";
import { ACENTOS, COMPOSICIONES, DOMINIO_INSTITUCIONAL, ICONOS, NOMBRE_ROL, PLANTILLAS, PORTADAS, ROLES_UNIDAD, TIPOS_IMAGEN } from "./tipos";

const PASOS = [
  { t: "Datos", s: "Nombre y plantilla" },
  { t: "Identidad", s: "Cómo se ve" },
  { t: "Personas", s: "Quién y con qué papel" },
  { t: "Revisar", s: "Y crear" },
] as const;

interface Borrador {
  nombre: string;
  descripcion: string;
  plantilla: Plantilla;
  unitId: string;
  monograma: string;
  monogramaTocado: boolean;
  acento: string;
  acentoTocado: boolean;
  icono: IconoUnidad;
  portada: TipoPortada;
  composicion: Composicion;
  composicionTocada: boolean;
  archivo: File | null;
  x: number;
  y: number;
  zoom: number;
  miembros: MiembroBorrador[];
}

const MAX_ORIGINAL = 25 * 1024 * 1024;

export function FormularioUnidad({ onTerminar }: { onTerminar: () => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const unidades = useUnidades();
  const estructura = useEstructura();
  const crear = useCrearUnidad();
  const nombresUsados = useMemo(() => (unidades.data ?? []).map((u) => u.nombre), [unidades.data]);

  const yo = useMemo<MiembroBorrador | null>(() => (profile ? { usuario_id: profile.id, correo: profile.email, nombre: profile.full_name, rol: "admin", externo: false, vence_en: null } : null), [profile]);
  const nuevo = (): Borrador => ({
    nombre: "", descripcion: "", plantilla: "informes", unitId: "", monograma: "", monogramaTocado: false, acento: ACENTOS[0], acentoTocado: false, icono: "chart", portada: "curvas", composicion: "A", composicionTocada: false,
    archivo: null, x: 50, y: 50, zoom: 1, miembros: yo ? [yo] : [],
  });
  const [b, setB] = useState<Borrador>(nuevo);
  const [paso, setPaso] = useState(0);
  const [tocado, setTocado] = useState({ nombre: false });
  const [errorImagen, setErrorImagen] = useState("");
  const [confirmaExternas, setConfirmaExternas] = useState(false);
  const [fallaDeRed, setFallaDeRed] = useState(false);
  const [errorCrear, setErrorCrear] = useState("");
  const [hecha, setHecha] = useState<{ id: string; aviso: string | null; a: Apariencia; personas: number; carpetas: number } | null>(null);
  const [previaUrl, setPreviaUrl] = useState<string | null>(null);
  const paneles = useRef<(HTMLDivElement | null)[]>([]);
  const titulos = useRef<(HTMLHeadingElement | null)[]>([]);
  const notaError = useRef<HTMLParagraphElement>(null);
  const cajaHecha = useRef<HTMLDivElement>(null);

  // El miembro «yo» llega cuando carga la sesión.
  useEffect(() => {
    if (yo) setB((x) => (x.miembros.length ? x : { ...x, miembros: [yo] }));
  }, [yo]);

  useEffect(() => {
    if (!b.archivo) return setPreviaUrl(null);
    const url = URL.createObjectURL(b.archivo);
    setPreviaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [b.archivo]);

  const set = (cambios: Partial<Borrador>) => setB((x) => ({ ...x, ...cambios }));
  const monograma = b.monogramaTocado ? b.monograma : monogramaPorDefecto(b.nombre);

  const alEscribirNombre = (nombre: string) => {
    const p = propuestaDeNombre(nombre);
    setB((x) => ({
      ...x,
      nombre,
      ...(nombre.trim() && !x.acentoTocado ? { acento: p.acento } : {}),
      ...(nombre.trim() && !x.composicionTocada ? { composicion: p.composicion } : {}),
      ...(nombre.trim() && !x.acentoTocado && !x.composicionTocada ? { icono: p.icono } : {}),
    }));
  };

  const apariencia: Apariencia = useMemo(
    () => ({ nombre: b.nombre.trim() || "Nombre de la unidad", descripcion: b.descripcion.trim() || "Aquí va la descripción corta de la unidad.", monograma: monograma || "UT", acento: cumpleContraste(b.acento) ? b.acento : ACENTOS[0], icono: b.icono, composicion: b.composicion, portada: b.portada, imagenUrl: previaUrl, imagen: previaUrl ? { x: b.x, y: b.y, zoom: b.zoom } : null }),
    [b, monograma, previaUrl],
  );

  const errNombre = nombreUnidadError(b.nombre, nombresUsados);
  const errMono = monogramaValido(monograma) ? "" : "Use de 2 a 4 letras o números, sin espacios.";
  const errColor = normalizarHex(b.acento) ? "" : "Escriba un color de seis cifras, como #0b3a78.";
  const ratio = normalizarHex(b.acento) ? contrasteConBlanco(b.acento) : 0;
  const colorOk = Boolean(normalizarHex(b.acento)) && cumpleContraste(b.acento);
  const hayAdmin = b.miembros.some((m) => m.rol === "admin");
  const externas = b.miembros.filter((m) => m.externo);
  const bloqueoCrear = !hayAdmin || (externas.length > 0 && !confirmaExternas);

  const validar = (n: number): boolean => {
    if (n === 0) {
      setTocado({ nombre: true });
      return !errNombre;
    }
    if (n === 1) return !errMono && colorOk;
    return true;
  };

  const ir = (n: number) => {
    if (n === paso) return;
    if (n > paso && !validar(paso)) return;
    const dir = n > paso ? 1 : -1;
    pasoFormulario(paneles.current[paso], paneles.current[n], dir, () => setPaso(n));
  };
  // Tras cambiar de paso, el foco va al título del paso.
  const pasoAnterior = useRef(0);
  useEffect(() => {
    if (pasoAnterior.current !== paso) titulos.current[paso]?.focus({ preventScroll: true });
    pasoAnterior.current = paso;
  }, [paso]);

  const elegirImagen = (f: File | null) => {
    setErrorImagen("");
    if (!f) return;
    if (!TIPOS_IMAGEN.includes(f.type)) return setErrorImagen("Ese archivo no es JPG, PNG ni WebP.");
    if (f.size > MAX_ORIGINAL) return setErrorImagen("La imagen pesa más de 25 MB. Reduzca su tamaño y vuelva a subirla.");
    set({ archivo: f, x: 50, y: 50, zoom: 1 });
  };

  const anadir = (nuevas: NuevaPersona[]) =>
    setB((x) => ({
      ...x,
      miembros: [...x.miembros, ...nuevas.filter((n) => !x.miembros.some((m) => m.usuario_id === n.persona.id)).map((n): MiembroBorrador => ({ usuario_id: n.persona.id, correo: n.persona.correo, nombre: n.persona.nombre, rol: n.rol, externo: n.persona.externo, vence_en: n.vence ? fechaDeCampo(n.vence) : null }))],
    }));

  const enviar = () => {
    setErrorCrear("");
    if (fallaDeRed) {
      const m = "No se pudo crear la unidad: se cortó la conexión. Nada de lo que escribió se perdió. Reintente o desmarque la prueba de error.";
      setErrorCrear(m);
      requestAnimationFrame(() => entrarNota(notaError.current));
      return;
    }
    crear.mutate(
      {
        datos: { nombre: b.nombre.trim(), descripcion: b.descripcion.trim(), monograma, acento: b.acento, icono: b.icono, composicion: b.composicion, portada: b.portada, plantilla: b.plantilla, unit_id: b.unitId || null, miembros: b.miembros.filter((m) => m.usuario_id !== yo?.usuario_id) },
        imagen: b.archivo,
        encuadre: { x: b.x, y: b.y, zoom: b.zoom },
      },
      {
        onSuccess: ({ id, avisoImagen }) => {
          setHecha({ id, aviso: avisoImagen, a: apariencia, personas: b.miembros.length, carpetas: PLANTILLAS[b.plantilla].carpetas.length });
          requestAnimationFrame(() => confirmar(cajaHecha.current?.querySelectorAll(":scope > *")));
        },
        onError: (e) => {
          setErrorCrear(errorDe(e as Error).message);
          requestAnimationFrame(() => entrarNota(notaError.current));
        },
      },
    );
  };

  if (hecha) {
    return (
      <div className="un-hecho" ref={cajaHecha}>
        <div className="un-hecho__tarjeta"><Portada a={hecha.a} tam="tarjeta" /></div>
        <h2 tabIndex={-1} ref={(el) => el?.focus({ preventScroll: true })}>La unidad «{hecha.a.nombre}» está lista</h2>
        <ul className="un-hecho__lista">
          <li>{hecha.carpetas ? `${hecha.carpetas} carpetas iniciales creadas` : "Unidad en blanco, sin carpetas"}</li>
          <li>{hecha.personas} {hecha.personas === 1 ? "persona con acceso" : "personas con acceso"}</li>
          <li>Cuota de almacenamiento asignada y registro de la unidad abierto</li>
        </ul>
        {hecha.aviso ? <p className="un-nota un-nota--aviso">{hecha.aviso}</p> : null}
        <div className="un-fila">
          <button type="button" className="un-btn" onClick={() => navigate(`/admin/udrive/unidad/${hecha.id}`)}>Abrir la unidad</button>
          <button type="button" className="un-btn un-btn--sec" onClick={onTerminar}>Verla en Unidades de trabajo</button>
          <button type="button" className="un-btn un-btn--texto" onClick={() => { setHecha(null); setB(nuevo()); setPaso(0); setConfirmaExternas(false); crear.reset(); }}>Crear otra</button>
        </div>
      </div>
    );
  }

  const panel = (n: number, titulo: string, children: ReactNode) => (
    <div className="un-paso" ref={(el) => { paneles.current[n] = el; }} hidden={paso !== n} data-paso={n}>
      <h3 className="un-paso__t" tabIndex={-1} ref={(el) => { titulos.current[n] = el; }}>{titulo}</h3>
      {children}
    </div>
  );

  const resumenRoles = ROLES_UNIDAD.slice().reverse().map((r) => [r, b.miembros.filter((m) => m.rol === r.k).length] as const).filter(([, n]) => n > 0);
  const vinculo = (estructura.data ?? []).find((s) => s.id === b.unitId);

  return (
    <div className="un-form">
      <div className="un-form__cuerpo">
        <ol className="un-pasos" aria-label="Pasos">
          {PASOS.map((p, i) => (
            <li key={p.t} data-estado={i < paso ? "hecho" : i === paso ? "actual" : "pendiente"} aria-current={i === paso ? "step" : undefined}>
              <span>{p.t}</span><small>{p.s}</small>
            </li>
          ))}
        </ol>

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {panel(0, "Datos de la unidad", (
            <>
              <div className="un-fld">
                <label htmlFor="un-nombre">Nombre de la unidad</label>
                <input id="un-nombre" type="text" maxLength={60} autoComplete="off" placeholder="Por ejemplo, Planeación Institucional" value={b.nombre} aria-invalid={tocado.nombre && Boolean(errNombre)} aria-describedby="un-nombre-a un-nombre-e"
                  onChange={(e) => alEscribirNombre(e.target.value)} onBlur={() => b.nombre && setTocado({ nombre: true })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ir(1); } }} />
                <span className="un-ayuda" id="un-nombre-a">Es el que verá todo el equipo. Entre 3 y 60 caracteres.</span>
                <span className="un-error" id="un-nombre-e" aria-live="polite">{tocado.nombre ? errNombre : ""}</span>
              </div>
              <div className="un-fld">
                <label htmlFor="un-desc">Descripción corta <span className="un-ayuda">(opcional)</span></label>
                <textarea id="un-desc" rows={2} maxLength={140} placeholder="Para qué sirve esta unidad" value={b.descripcion} aria-describedby="un-desc-c" onChange={(e) => set({ descripcion: e.target.value })} />
                <span className="un-ayuda" id="un-desc-c">{b.descripcion.length} de 140</span>
              </div>
              <fieldset className="un-fld un-tpl">
                <legend>Carpetas con las que empieza</legend>
                {(Object.keys(PLANTILLAS) as Plantilla[]).map((k) => (
                  <label key={k}>
                    <input type="radio" name="un-tpl" value={k} checked={b.plantilla === k} onChange={() => set({ plantilla: k })} />
                    <span>{PLANTILLAS[k].nombre}</span>
                    <small>{PLANTILLAS[k].nota}</small>
                  </label>
                ))}
              </fieldset>
              <div className="un-fld">
                <label htmlFor="un-vinculo">Partir de una unidad de la estructura <span className="un-ayuda">(opcional)</span></label>
                <select id="un-vinculo" value={b.unitId} onChange={(e) => set({ unitId: e.target.value })} disabled={estructura.isPending}>
                  <option value="">Ninguna, partir de cero</option>
                  {(estructura.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <span className="un-ayuda">Solo sirve para recordar de dónde viene y traer a su gente en el paso 3. No se sincroniza después.</span>
              </div>
            </>
          ))}

          {panel(1, "Identidad de la unidad", (
            <>
              <p className="un-ayuda">Todo tiene un valor por defecto elegido a partir del nombre. Cámbielo si quiere que la unidad se reconozca de un vistazo.</p>
              <div className="un-dos">
                <div className="un-fld">
                  <label htmlFor="un-mono">Monograma</label>
                  <input id="un-mono" type="text" maxLength={4} autoComplete="off" className="un-mono-in" value={monograma} aria-invalid={Boolean(errMono)} aria-describedby="un-mono-a un-mono-e"
                    onChange={(e) => set({ monograma: normalizarMonograma(e.target.value), monogramaTocado: true })} />
                  <span className="un-ayuda" id="un-mono-a">De 2 a 4 letras o números.</span>
                  <span className="un-error" id="un-mono-e" aria-live="polite">{errMono}</span>
                </div>
                <div className="un-fld">
                  <label htmlFor="un-hex">Color de acento</label>
                  <input id="un-hex" type="text" maxLength={7} spellCheck={false} autoComplete="off" value={b.acento} aria-describedby="un-ct" aria-invalid={!colorOk}
                    onChange={(e) => { const h = normalizarHex(e.target.value); set({ acento: h ?? e.target.value, acentoTocado: true }); }} />
                  <div className="un-sw" role="group" aria-label="Colores sugeridos">
                    {ACENTOS.map((c) => <button key={c} type="button" style={{ background: c }} aria-pressed={b.acento === c} aria-label={`Color ${c}`} onClick={() => set({ acento: c, acentoTocado: true })} />)}
                  </div>
                </div>
              </div>
              <div id="un-ct" className={`un-contraste${colorOk ? " un-contraste--ok" : " un-contraste--mal"}`} aria-live="polite">
                {errColor ? errColor : colorOk ? <><b>Cumple.</b> Contraste con blanco {textoContraste(ratio)}:1 (el mínimo es 4,5:1).</> : (
                  <>Contraste con blanco {textoContraste(ratio)}:1. Es muy claro: el texto blanco no se lee sobre este color. <button type="button" className="un-btn un-btn--sec un-btn--chico" onClick={() => set({ acento: oscurecerHastaCumplir(normalizarHex(b.acento) ?? ACENTOS[0]), acentoTocado: true })}>Oscurecer hasta cumplir</button></>
                )}
              </div>
              <fieldset className="un-fld">
                <legend>Icono</legend>
                <div className="un-iconos" role="radiogroup" aria-label="Icono de la unidad">
                  {(Object.keys(ICONOS) as IconoUnidad[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={b.icono === k} aria-label={ICONOS[k].nombre} title={ICONOS[k].nombre} onClick={() => set({ icono: k, acentoTocado: true })}><Glifo icono={k} tam={22} /></button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="un-fld">
                <legend>Imagen de cabecera <span className="un-ayuda">(opcional)</span></legend>
                <div className="un-opts" role="radiogroup" aria-label="Imagen de cabecera">
                  {(Object.keys(PORTADAS) as TipoPortada[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={b.portada === k && !b.archivo} onClick={() => set({ portada: k, archivo: null })}>
                      <span className="un-opts__mini"><Portada a={{ ...apariencia, portada: k, imagenUrl: null, imagen: null, composicion: "D", descripcion: "", nombre: "", monograma: "" }} tam="tarjeta" /></span>
                      {PORTADAS[k]}
                    </button>
                  ))}
                </div>
                <div className="un-fld">
                  <label htmlFor="un-file">O suba una imagen propia (JPG, PNG o WebP)</label>
                  <input id="un-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { elegirImagen(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                  <span className="un-error" aria-live="polite">{errorImagen}</span>
                  <span className="un-ayuda">Se comprime al subirla y no pasa de 5 MB. La imagen nunca lleva texto encima.</span>
                </div>
                {previaUrl ? (
                  <div className="un-enc">
                    <Encuadre url={previaUrl} foto={{ ruta: "", x: b.x, y: b.y, zoom: b.zoom }} aspecto="5 / 2" onChange={(f) => set({ x: f.x, y: f.y, zoom: f.zoom })} />
                    <div className="un-rango">
                      <label htmlFor="un-zoom">Ampliación</label>
                      <input id="un-zoom" type="range" min={1} max={3} step={0.05} value={b.zoom} onChange={(e) => set({ zoom: Number(e.target.value) })} />
                      <span>{b.zoom.toFixed(2).replace(".", ",")}×</span>
                    </div>
                    <div className="un-fila" role="group" aria-label="Alinear el recorte">
                      <span className="un-ayuda">Alinear:</span>
                      {([["Arriba", 0], ["Centro", 50], ["Abajo", 100]] as const).map(([t, y]) => <button key={t} type="button" className="un-btn un-btn--sec un-btn--chico" aria-pressed={b.y === y} onClick={() => set({ y })}>{t}</button>)}
                    </div>
                    <p className="un-ayuda">Arrastre la imagen para moverla. Con el teclado: flechas para moverla y más y menos para el zoom.</p>
                    <button type="button" className="un-btn un-btn--texto" onClick={() => set({ archivo: null })}>Quitar la imagen</button>
                  </div>
                ) : null}
              </fieldset>
              <fieldset className="un-fld">
                <legend>Composición de la portada</legend>
                <div className="un-opts" role="radiogroup" aria-label="Composición de la portada">
                  {(Object.keys(COMPOSICIONES) as Composicion[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={b.composicion === k} onClick={() => set({ composicion: k, composicionTocada: true })}>
                      <span className="un-opts__mini"><Portada a={{ ...apariencia, composicion: k, descripcion: "", nombre: "" }} tam="tarjeta" /></span>
                      {COMPOSICIONES[k].nombre}
                    </button>
                  ))}
                </div>
                <span className="un-ayuda">{COMPOSICIONES[b.composicion].nota}</span>
              </fieldset>
            </>
          ))}

          {panel(2, "Personas y papeles", (
            <>
              <p className="un-nota un-nota--info">Usted entra como quien administra. Quien se añade empieza con el papel que elija; lo más seguro es Solo ver, y subir el papel a quien lo necesite. Debe quedar al menos una persona con papel Administra.</p>
              <PersonasEditor
                idBase="un-f"
                filas={b.miembros}
                puedeEditar
                protegerUnicoAdmin={false}
                onAnadir={anadir}
                onRol={(u, rol) => setB((x) => ({ ...x, miembros: x.miembros.map((m) => (m.usuario_id === u ? { ...m, rol } : m)) }))}
                onVence={(u, v) => setB((x) => ({ ...x, miembros: x.miembros.map((m) => (m.usuario_id === u ? { ...m, vence_en: fechaDeCampo(v) } : m)) }))}
                onQuitar={(us) => setB((x) => ({ ...x, miembros: x.miembros.filter((m) => !us.includes(m.usuario_id)) }))}
              />
              <details className="un-mas">
                <summary>Qué puede hacer cada papel</summary>
                <div className="un-mas__c"><MatrizPapeles /></div>
              </details>
            </>
          ))}

          {panel(3, "Revisar y crear", (
            <>
              <dl className="un-resumen">
                <div><dt>Nombre</dt><dd>{b.nombre.trim()}</dd></div>
                <div><dt>Descripción</dt><dd>{b.descripcion.trim() || "Sin descripción"}</dd></div>
                <div><dt>Identidad</dt><dd>{monograma} · {b.acento} · {ICONOS[b.icono].nombre} · composición {COMPOSICIONES[b.composicion].nombre} · {b.archivo ? "imagen propia" : PORTADAS[b.portada]}</dd></div>
                <div><dt>Carpetas iniciales</dt><dd>{PLANTILLAS[b.plantilla].carpetas.length ? PLANTILLAS[b.plantilla].carpetas.join(", ") : "Ninguna (en blanco)"}</dd></div>
                <div><dt>Vínculo</dt><dd>{vinculo ? vinculo.nombre : "Sin vínculo con la estructura"}</dd></div>
                <div><dt>Personas</dt><dd>{b.miembros.length} · {resumenRoles.map(([r, n]) => `${n} ${NOMBRE_ROL[r.k].toLowerCase()}`).join(", ")}</dd></div>
                <div><dt>Espacio</dt><dd>Cuota inicial por defecto; quien administra puede pedir más.</dd></div>
              </dl>
              <div className="un-avisos" aria-live="polite">
                {!hayAdmin ? <p className="un-nota un-nota--error">Nadie tiene el papel Administra. Vuelva al paso 3 y asigne al menos a una persona.</p> : null}
                {externas.length ? <p className="un-nota un-nota--aviso">{externas.length === 1 ? "1 persona es externa" : `${externas.length} personas son externas`} al dominio {DOMINIO_INSTITUCIONAL}: {externas.map((m) => m.correo).join(", ")}. Su acceso vence en la fecha indicada.</p> : null}
                {b.miembros.length === 1 ? <p className="un-nota un-nota--info">Usted es la única persona de la unidad. Puede añadir a las demás después.</p> : null}
              </div>
              {externas.length ? <label className="un-check"><input type="checkbox" checked={confirmaExternas} onChange={(e) => setConfirmaExternas(e.target.checked)} /> Confirmo que las personas externas deben tener acceso.</label> : null}
              <label className="un-check un-prueba"><input type="checkbox" checked={fallaDeRed} onChange={(e) => setFallaDeRed(e.target.checked)} /> Probar el aviso de error de red al crear (solo para revisar el diseño)</label>
              {errorCrear ? (
                <p className="un-nota un-nota--error" role="alert" ref={notaError}>
                  {errorCrear}{" "}
                  {/nombre/i.test(errorCrear) ? <button type="button" className="un-btn un-btn--texto" onClick={() => ir(0)}>Cambiar el nombre</button> : null}
                </p>
              ) : null}
            </>
          ))}

          <div className="un-form__pie">
            <button type="button" className="un-btn un-btn--sec" onClick={() => ir(paso - 1)} hidden={paso === 0}>Atrás</button>
            <span className="un-ayuda">Paso {paso + 1} de 4 · {PASOS[paso].t}</span>
            {paso < 3 ? (
              <button type="button" className="un-btn" onClick={() => ir(paso + 1)}>Siguiente</button>
            ) : (
              <button type="button" className="un-btn" disabled={bloqueoCrear || crear.isPending} onClick={enviar}>{crear.isPending ? "Creando…" : "Crear unidad de trabajo"}</button>
            )}
          </div>
        </form>
      </div>

      <aside className="un-form__prev" aria-label="Vista previa de la tarjeta">
        <p className="un-kicker">Así se verá en Unidades de trabajo</p>
        <div className="un-prev"><CuerpoTarjeta a={apariencia} personas={b.miembros.length} detalle={`${PLANTILLAS[b.plantilla].carpetas.length} ${PLANTILLAS[b.plantilla].carpetas.length === 1 ? "carpeta" : "carpetas"}`} etiqueta="Tú · Administra" /></div>
        <p className="un-ayuda">La tarjeta cambia con cada letra. La portada de dentro usa la misma composición.</p>
      </aside>
    </div>
  );
}


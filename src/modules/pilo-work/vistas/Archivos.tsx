/* =============================================================================
   Archivos · OneDrive y SharePoint (módulo «Archivos» de «Mis fuentes»).

   Sin borrar ni mover: se explora, se lee, se crea una carpeta, se sube un archivo y se
   guarda desde Cowork. El token de Microsoft vive solo en pw-microsoft; el contenido de
   los archivos es un dato no confiable para Pilo. Los permisos se piden aparte
   («Conectar archivos») y se suman a los de correo y agenda.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { callFn } from "../api";
import { leerTexto, MAX_SUBIDA_MB, nombreInvalido, subirArchivo, tamanoLegible } from "../archivos";
import type { ItemArchivo } from "../archivos";
import { conectarMs, useMs } from "../ms";
import { Dialogo, IC, MOOD, Seg, useEntra, useWork } from "../ui";

export interface Destino {
  drive: string;
  carpeta: string;
  ruta: string[];
  etiqueta: string;
}

interface Sitio {
  id: string;
  nombre: string;
  url: string;
}
interface Biblioteca {
  id: string;
  nombre: string;
}
type Orden = "nombre" | "modificado" | "tamano";

const fechaCorta = (f: string) => (f ? new Date(f).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "");
const tipoDe = (i: ItemArchivo) => (i.carpeta ? "Carpeta" : (i.nombre.split(".").pop() ?? "").toUpperCase().slice(0, 5) || "Archivo");

/** Explorador de carpetas: Mi OneDrive o una biblioteca de un sitio de SharePoint. */
export function Explorador({ modo = "ver", acciones, onCambio, onSeleccion, clave = 0 }: { modo?: "ver" | "carpeta"; acciones?: (i: ItemArchivo, drive: string) => ReactNode; onCambio?: (d: Destino | null) => void; onSeleccion?: (i: ItemArchivo | null, drive: string) => void; clave?: number }) {
  const [origen, setOrigen] = useState<"me" | "sp">("me");
  const [sitio, setSitio] = useState<Sitio | null>(null);
  const [biblio, setBiblio] = useState<Biblioteca | null>(null);
  const [sitios, setSitios] = useState<Sitio[]>([]);
  const [bibliotecas, setBibliotecas] = useState<Biblioteca[]>([]);
  const [qSitio, setQSitio] = useState("");
  const [pila, setPila] = useState<{ id: string; nombre: string }[]>([]);
  const [items, setItems] = useState<ItemArchivo[]>([]);
  const [sig, setSig] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState("");
  const [orden, setOrden] = useState<Orden>("nombre");
  const [sel, setSel] = useState<string | null>(null);
  const seq = useRef(0);

  const drive = origen === "me" ? "me" : (biblio?.id ?? "");
  const etiqueta = origen === "me" ? "Mi OneDrive" : biblio ? `${sitio?.nombre ?? "SharePoint"} · ${biblio.nombre}` : "SharePoint";

  const pedir = useCallback(async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setError("");
    try {
      return await callFn<T>("pw-microsoft", body, { timeoutMs: 40_000 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer.");
      return null;
    }
  }, []);

  /* Lista de la carpeta actual (o los resultados de la búsqueda). */
  const cargar = useCallback(
    async (mas?: string) => {
      if (!drive) return;
      const mi = ++seq.current;
      setCargando(true);
      const r = await pedir<{ items: ItemArchivo[]; siguiente: string | null }>({ action: "archivos_listar", drive, item: pila[pila.length - 1]?.id, q: buscando || undefined, siguiente: mas });
      if (mi !== seq.current) return;
      setCargando(false);
      if (!r) return;
      setItems((l) => (mas ? [...l, ...r.items] : r.items));
      setSig(r.siguiente);
    },
    [drive, pila, buscando, pedir],
  );
  useEffect(() => {
    if (drive) void cargar();
    else setItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarga al cambiar de lugar, de búsqueda o por clave externa
  }, [drive, pila, buscando, clave]);

  /* Sitios de SharePoint: los que sigue la persona y la búsqueda por nombre. */
  const cargarSitios = useCallback(
    async (texto: string) => {
      setCargando(true);
      const r = await pedir<{ sitios: Sitio[] }>({ action: "archivos_sitios", q: texto || undefined });
      setCargando(false);
      if (r) setSitios(r.sitios);
    },
    [pedir],
  );
  useEffect(() => {
    if (origen === "sp" && !sitio) void cargarSitios("");
  }, [origen, sitio, cargarSitios]);
  useEffect(() => {
    if (!sitio) return;
    setCargando(true);
    void pedir<{ bibliotecas: Biblioteca[] }>({ action: "archivos_bibliotecas", sitio: sitio.id }).then((r) => {
      setCargando(false);
      if (r) setBibliotecas(r.bibliotecas);
    });
  }, [sitio, pedir]);

  useEffect(() => {
    onCambio?.(drive ? { drive, carpeta: pila[pila.length - 1]?.id ?? "root", ruta: pila.map((p) => p.nombre), etiqueta } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avisa solo cuando cambia el lugar
  }, [drive, pila, etiqueta]);

  const reiniciar = () => {
    setPila([]);
    setBuscando("");
    setQ("");
    setSel(null);
    onSeleccion?.(null, drive);
  };

  const visibles = useMemo(() => {
    const l = items.filter((i) => modo === "ver" || i.carpeta);
    const dir = orden === "nombre" ? 1 : -1;
    return [...l].sort((a, b) => Number(b.carpeta) - Number(a.carpeta) || (orden === "nombre" ? a.nombre.localeCompare(b.nombre, "es") * dir : orden === "modificado" ? b.modificado.localeCompare(a.modificado) : b.tamano - a.tamano));
  }, [items, orden, modo]);

  const lista = useEntra(".fx__row", `${drive}|${pila.length}|${buscando}|${items.length}`, 6);

  return (
    <div className="fx">
      <div className="fx__bar">
        <Seg
          etiqueta="Origen"
          valor={origen}
          onChange={(v) => {
            setOrigen(v);
            setSitio(null);
            setBiblio(null);
            reiniciar();
          }}
          opciones={[["me", "Mi OneDrive"], ["sp", "Sitios de SharePoint"]]}
        />
        {drive && (
          <form
            className="fx__q"
            onSubmit={(e) => {
              e.preventDefault();
              setBuscando(q.trim());
              setPila([]);
            }}
            role="search"
          >
            <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar archivos por nombre" />
            {buscando && (
              <button type="button" className="btn sm" onClick={() => { setQ(""); setBuscando(""); }}>
                Quitar búsqueda
              </button>
            )}
          </form>
        )}
        {drive && modo === "ver" && (
          <label className="fx__ord small">
            Ordenar
            <select className="inp" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              <option value="nombre">Nombre</option>
              <option value="modificado">Modificado</option>
              <option value="tamano">Tamaño</option>
            </select>
          </label>
        )}
      </div>

      {origen === "sp" && !drive && (
        <div className="fx__sp">
          {!sitio ? (
            <>
              <form
                className="fx__q"
                onSubmit={(e) => {
                  e.preventDefault();
                  void cargarSitios(qSitio.trim());
                }}
                role="search"
              >
                <input className="inp" value={qSitio} onChange={(e) => setQSitio(e.target.value)} placeholder="Buscar un sitio por nombre" aria-label="Buscar un sitio de SharePoint" />
                <button type="submit" className="btn sm">Buscar</button>
              </form>
              <p className="hint">{qSitio ? "Resultados de la búsqueda" : "Sitios que usted sigue en SharePoint"}</p>
              <ul className="fx__lst">
                {sitios.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="fx__row" onClick={() => setSitio(s)}>
                      <span className="ico">{IC.cloud}</span>
                      <span className="fx__n">{s.nombre}</span>
                      <span className="small muted">Sitio</span>
                    </button>
                  </li>
                ))}
              </ul>
              {!cargando && !sitios.length && !error && <p className="muted small">No hay sitios para mostrar. Pruebe buscando por nombre.</p>}
            </>
          ) : (
            <>
              <nav className="fx__ruta" aria-label="Ruta">
                <button type="button" className="btn sm ghost" onClick={() => setSitio(null)}>Sitios</button>
                <span aria-hidden="true">/</span>
                <b>{sitio.nombre}</b>
              </nav>
              <p className="hint">Bibliotecas de documentos</p>
              <ul className="fx__lst">
                {bibliotecas.map((b) => (
                  <li key={b.id}>
                    <button type="button" className="fx__row" onClick={() => { setBiblio(b); reiniciar(); }}>
                      <span className="ico">{IC.folder}</span>
                      <span className="fx__n">{b.nombre}</span>
                      <span className="small muted">Biblioteca</span>
                    </button>
                  </li>
                ))}
              </ul>
              {!cargando && !bibliotecas.length && !error && <p className="muted small">Este sitio no muestra bibliotecas con su permiso.</p>}
            </>
          )}
        </div>
      )}

      {drive && (
        <>
          <nav className="fx__ruta" aria-label="Ruta de carpetas">
            {origen === "sp" && (
              <>
                <button type="button" className="btn sm ghost" onClick={() => { setBiblio(null); reiniciar(); }}>
                  {sitio?.nombre}
                </button>
                <span aria-hidden="true">/</span>
              </>
            )}
            <button type="button" className="btn sm ghost" onClick={reiniciar} disabled={!pila.length && !buscando}>
              {origen === "me" ? "Mi OneDrive" : (biblio?.nombre ?? "")}
            </button>
            {buscando && <><span aria-hidden="true">/</span><b>Resultados de «{buscando}»</b></>}
            {pila.map((p, k) => (
              <span key={p.id} style={{ display: "contents" }}>
                <span aria-hidden="true">/</span>
                {k === pila.length - 1 ? <b>{p.nombre}</b> : <button type="button" className="btn sm ghost" onClick={() => setPila(pila.slice(0, k + 1))}>{p.nombre}</button>}
              </span>
            ))}
          </nav>
          {error && (
            <p className="err" role="alert">
              {error}{" "}
              <button type="button" className="btn sm" onClick={() => void cargar()}>Reintentar</button>
            </p>
          )}
          <ul className="fx__lst" ref={lista as never}>
            {visibles.map((i) => (
              <li key={i.id} className="fx__li">
                <button
                  type="button"
                  className="fx__row"
                  aria-current={sel === i.id ? "true" : undefined}
                  onClick={() => {
                    if (i.carpeta) {
                      setBuscando("");
                      setQ("");
                      setSel(null);
                      onSeleccion?.(null, drive);
                      setPila([...pila, { id: i.id, nombre: i.nombre }]);
                    } else {
                      setSel(i.id);
                      onSeleccion?.(i, i.drive || drive);
                    }
                  }}
                >
                  <span className="ico">{i.carpeta ? IC.folder : IC.file}</span>
                  <span className="fx__n">{i.nombre}</span>
                  <span className="small muted fx__t">{tipoDe(i)}</span>
                  <span className="small muted fx__s num">{i.carpeta ? `${i.hijos} elem.` : tamanoLegible(i.tamano)}</span>
                  <span className="small muted fx__m">{fechaCorta(i.modificado)}</span>
                </button>
                {acciones?.(i, i.drive || drive)}
              </li>
            ))}
          </ul>
          {cargando && <p className="muted small" role="status">Cargando…</p>}
          {!cargando && !error && !visibles.length && <p className="muted small">{buscando ? "No hay coincidencias." : modo === "carpeta" ? "No hay subcarpetas aquí." : "Esta carpeta está vacía."}</p>}
          {sig && !cargando && (
            <button type="button" className="btn sm" onClick={() => void cargar(sig)}>
              Mostrar más
            </button>
          )}
        </>
      )}
      {!drive && origen === "me" && null}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */

export function Archivos() {
  const ms = useMs();
  const { toast, setPedido, ir, subidaMaxMb } = useWork();
  const [destino, setDestino] = useState<Destino | null>(null);
  const [clave, setClave] = useState(0);
  const [elegido, setElegido] = useState<{ i: ItemArchivo; drive: string } | null>(null);
  const [vista, setVista] = useState<{ texto: string; truncado: boolean } | null>(null);
  const [vistaError, setVistaError] = useState("");
  const [cargandoVista, setCargandoVista] = useState(false);
  const [nuevaCarpeta, setNuevaCarpeta] = useState<{ x: number; y: number } | null | false>(false);
  const [nombreCarpeta, setNombreCarpeta] = useState("");
  const [errCarpeta, setErrCarpeta] = useState("");
  const [subida, setSubida] = useState<{ nombre: string; f: number } | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const raiz = useEntra(".box", ms.cargando, 8);

  useEffect(() => {
    setVista(null);
    setVistaError("");
    if (!elegido) return;
    if (!/\.(txt|md|csv|tsv|json|docx|html?|xml|log)$/i.test(elegido.i.nombre)) return;
    let vivo = true;
    setCargandoVista(true);
    leerTexto(elegido.drive, elegido.i.id)
      .then((r) => vivo && setVista({ texto: r.texto.slice(0, 4000), truncado: r.truncado || r.texto.length > 4000 }))
      .catch((e) => vivo && setVistaError(e instanceof Error ? e.message : "No se pudo leer."))
      .finally(() => vivo && setCargandoVista(false));
    return () => {
      vivo = false;
    };
  }, [elegido]);

  if (!ms.archivosListo)
    return (
      <div className="pad" ref={raiz}>
        <div className="box" style={{ maxWidth: 660, margin: "0 auto" }}>
          <div className="pilo-big" style={{ width: 96, height: 96 }}>
            <img src={MOOD.idea} alt="" />
          </div>
          <h2>Conecte sus archivos de OneDrive y SharePoint</h2>
          <p className="muted">Podrá explorar sus carpetas, abrir un documento en Cowork, pedir un resumen y guardar lo que redacte. No se borra ni se mueve nada.</p>
          <ul className="flat">
            <li className="item"><span className="ico">{IC.cloud}</span><div><b>Leer y escribir sus archivos</b><p>Files.ReadWrite · su OneDrive</p></div><span className="badge ok">Incluido</span></li>
            <li className="item"><span className="ico">{IC.folder}</span><div><b>Contenido de los sitios de SharePoint</b><p>Sites.ReadWrite.All · solo el contenido; no toca permisos de sitios</p></div><span className="badge ok">Incluido</span></li>
          </ul>
          {!ms.configurado && <p className="err">Microsoft 365 aún no está configurado por TIC.</p>}
          {ms.error && ms.configurado && <p className="err">{ms.error}</p>}
          <p className="hint">Sus permisos de correo y agenda se conservan: este permiso se suma a los que ya tiene.</p>
          <button
            type="button"
            className="btn navy"
            disabled={ocupado || !ms.configurado}
            onClick={async () => {
              setOcupado(true);
              try {
                await conectarMs(["archivos"]);
              } catch (e) {
                toast(e instanceof Error ? e.message : "No se pudo abrir Microsoft.");
                setOcupado(false);
              }
            }}
          >
            {ocupado ? "Abriendo Microsoft…" : "Conectar archivos"}
          </button>
        </div>
      </div>
    );

  const subir = async (f: File) => {
    if (!destino) return toast("Elija primero una carpeta.");
    const c = new AbortController();
    ctl.current = c;
    setSubida({ nombre: f.name, f: 0 });
    try {
      const it = await subirArchivo(f, { drive: destino.drive, padre: destino.carpeta, nombre: f.name, conflicto: "rename", maxMb: subidaMaxMb, signal: c.signal, onProgreso: (x) => setSubida({ nombre: f.name, f: x }) });
      toast(`Subido como «${it.nombre}»`);
      setClave((k) => k + 1);
    } catch (e) {
      toast(c.signal.aborted ? "Subida cancelada" : e instanceof Error ? e.message : "No se pudo subir.");
    }
    setSubida(null);
    ctl.current = null;
  };
  const crearCarpeta = async () => {
    const mal = nombreInvalido(nombreCarpeta, (destino?.ruta ?? []).join("/"));
    if (mal) return setErrCarpeta(mal);
    if (!destino) return;
    try {
      await callFn("pw-microsoft", { action: "archivos_crear_carpeta", drive: destino.drive, padre: destino.carpeta, nombre: nombreCarpeta.trim() });
      toast("Carpeta creada");
      setNuevaCarpeta(false);
      setNombreCarpeta("");
      setClave((k) => k + 1);
    } catch (e) {
      setErrCarpeta(e instanceof Error ? e.message : "No se pudo crear la carpeta.");
    }
  };

  const e = elegido?.i;
  return (
    <div className="pad" ref={raiz} style={{ display: "grid", gap: 14 }}>
      <div className="box">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h2>OneDrive y SharePoint</h2>
          <span className="badge ok">Conectado · sin borrar ni mover</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn sm"
            disabled={!destino || Boolean(subida)}
            onClick={(ev) => {
              const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
              setErrCarpeta("");
              setNuevaCarpeta({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }}
          >
            Nueva carpeta
          </button>
          <button type="button" className="btn sm primary" disabled={!destino || Boolean(subida)} onClick={() => entrada.current?.click()}>
            {IC.up} Subir archivo
          </button>
          <input
            ref={entrada}
            type="file"
            hidden
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              ev.target.value = "";
              if (f) void subir(f);
            }}
          />
        </div>
        <p className="hint">Subida hasta {Math.min(subidaMaxMb, MAX_SUBIDA_MB)} MB. Si ya existe un archivo con el mismo nombre, se guarda con otro nombre; nunca se reemplaza sin avisar.</p>
        {subida && (
          <div className="fx__up" role="status">
            <span className="small">Subiendo «{subida.nombre}»</span>
            <progress value={subida.f} max={1} aria-label="Avance de la subida" />
            <span className="small num">{Math.round(subida.f * 100)} %</span>
            <button type="button" className="btn sm" onClick={() => ctl.current?.abort()}>
              Cancelar
            </button>
          </div>
        )}
        <div className={`fx__grid${e ? " con-vista" : ""}`}>
          <Explorador
            clave={clave}
            onCambio={setDestino}
            onSeleccion={(i, drive) => setElegido(i ? { i, drive } : null)}
          />
          {e && elegido && (
            <aside className="fx__vista" aria-label={`Archivo ${e.nombre}`}>
              <h3>{e.nombre}</h3>
              <p className="small muted">
                {tamanoLegible(e.tamano)} · modificado {fechaCorta(e.modificado)}
              </p>
              <div className="fx__acts">
                <button
                  type="button"
                  className="btn sm primary"
                  onClick={() => {
                    try {
                      sessionStorage.setItem("pw-cowork-importar", JSON.stringify({ drive: elegido.drive, id: e.id, nombre: e.nombre }));
                    } catch {
                      /* sin almacenamiento */
                    }
                    ir("cowork");
                  }}
                >
                  Abrir en Cowork
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setPedido(`Resuma el archivo «${e.nombre}» de ${elegido.drive === "me" ? "mi OneDrive" : "SharePoint"}: lo central, los acuerdos y lo pendiente. Léalo con leer_archivo (origen ${elegido.drive}, archivo_id ${e.id}).`);
                    ir("chat");
                  }}
                >
                  Pedir a Pilo que lo resuma
                </button>
                {e.url && (
                  <a className="btn sm" href={e.url} target="_blank" rel="noopener noreferrer">
                    Abrir en {elegido.drive === "me" ? "OneDrive" : "SharePoint"}
                  </a>
                )}
                {e.url && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(e.url);
                      toast("Enlace copiado");
                    }}
                  >
                    {IC.link} Copiar enlace
                  </button>
                )}
              </div>
              {cargandoVista && <p className="muted small">Leyendo el comienzo…</p>}
              {vistaError && <p className="err">{vistaError}</p>}
              {vista && (
                <pre className="fx__pre" tabIndex={0}>
                  {vista.texto}
                  {vista.truncado ? "\n…" : ""}
                </pre>
              )}
              {!vista && !cargandoVista && !vistaError && <p className="muted small">La vista previa está disponible para .txt, .md, .csv, .json y .docx. Para Excel o PDF, ábralo en {elegido.drive === "me" ? "OneDrive" : "SharePoint"}.</p>}
            </aside>
          )}
        </div>
      </div>
      {nuevaCarpeta !== false && (
        <Dialogo
          titulo="Nueva carpeta"
          ancho={440}
          origen={nuevaCarpeta}
          onCerrar={() => setNuevaCarpeta(false)}
          descripcion={`Se crea dentro de: ${[destino?.etiqueta, ...(destino?.ruta ?? [])].filter(Boolean).join(" / ")}`}
          pie={
            <>
              <button type="button" className="btn sm" onClick={() => setNuevaCarpeta(false)}>
                Cancelar
              </button>
              <button type="button" className="btn sm primary" onClick={() => void crearCarpeta()}>
                Crear carpeta
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="fx-nc">Nombre</label>
            <input
              className="inp"
              id="fx-nc"
              value={nombreCarpeta}
              maxLength={200}
              onChange={(ev) => {
                setNombreCarpeta(ev.target.value);
                setErrCarpeta("");
              }}
              onKeyDown={(ev) => ev.key === "Enter" && void crearCarpeta()}
              autoFocus
            />
            {errCarpeta && <span className="err" role="alert">{errCarpeta}</span>}
          </div>
        </Dialogo>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Diálogos para Cowork: abrir un documento desde OneDrive/SharePoint y guardar en OneDrive.       */

/** Elegir un archivo y devolverlo a quien llama (Cowork lo importa como texto). */
export function AbrirDesdeNube({ onElegir, onCerrar, origen }: { onElegir: (i: ItemArchivo, drive: string) => void; onCerrar: () => void; origen?: { x: number; y: number } | null }) {
  const [sel, setSel] = useState<{ i: ItemArchivo; drive: string } | null>(null);
  return (
    <Dialogo
      titulo="Abrir desde OneDrive o SharePoint"
      ancho={760}
      origen={origen}
      onCerrar={onCerrar}
      descripcion="Se importa el texto del documento (.txt, .md, .csv, .json o .docx) al editor como un documento nuevo. El original no se modifica."
      pie={
        <>
          <span className="small muted" style={{ marginRight: "auto" }}>{sel ? `Elegido: ${sel.i.nombre} (${tamanoLegible(sel.i.tamano)})` : "Elija un archivo"}</span>
          <button type="button" className="btn sm" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn sm primary" disabled={!sel} onClick={() => sel && onElegir(sel.i, sel.drive)}>
            Importar a Cowork
          </button>
        </>
      }
    >
      <Explorador onSeleccion={(i, drive) => setSel(i ? { i, drive } : null)} />
    </Dialogo>
  );
}

/** Elegir carpeta, ver la tarjeta de aprobación (ruta, nombre, tamaño) y subir. Nunca sobrescribe sin confirmación explícita. */
export function GuardarEnNube({ nombreInicial, blob, onGuardado, onCerrar, origen }: { nombreInicial: string; blob: Blob; onGuardado: (i: ItemArchivo) => void; onCerrar: () => void; origen?: { x: number; y: number } | null }) {
  const { subidaMaxMb } = useWork();
  const [dest, setDest] = useState<Destino | null>(null);
  const [nombre, setNombre] = useState(nombreInicial);
  const [reemplazar, setReemplazar] = useState(false);
  const [paso, setPaso] = useState<"elegir" | "aprobar">("elegir");
  const [f, setF] = useState<number | null>(null);
  const [error, setError] = useState("");
  const ctl = useRef<AbortController | null>(null);
  const ruta = [dest?.etiqueta, ...(dest?.ruta ?? [])].filter(Boolean).join(" / ");
  const mal = nombreInvalido(nombre, (dest?.ruta ?? []).join("/"));

  const subir = async () => {
    if (!dest || mal) return;
    const c = new AbortController();
    ctl.current = c;
    setError("");
    setF(0);
    try {
      const it = await subirArchivo(blob, { drive: dest.drive, padre: dest.carpeta, nombre: nombre.trim(), conflicto: reemplazar ? "replace" : "rename", maxMb: subidaMaxMb, signal: c.signal, onProgreso: setF });
      onGuardado(it);
    } catch (e) {
      setF(null);
      setError(c.signal.aborted ? "Subida cancelada." : e instanceof Error ? e.message : "No se pudo guardar.");
    }
  };

  return (
    <Dialogo
      titulo="Guardar en OneDrive o SharePoint"
      ancho={760}
      origen={origen}
      onCerrar={() => {
        ctl.current?.abort();
        onCerrar();
      }}
      pie={
        paso === "elegir" ? (
          <>
            <span className="small muted" style={{ marginRight: "auto" }}>{dest ? `Carpeta: ${ruta}` : "Elija una carpeta"}</span>
            <button type="button" className="btn sm" onClick={onCerrar}>Cancelar</button>
            <button type="button" className="btn sm primary" disabled={!dest} onClick={() => setPaso("aprobar")}>
              Continuar
            </button>
          </>
        ) : (
          <>
            {f === null ? (
              <>
                <button type="button" className="btn sm" onClick={() => setPaso("elegir")}>Cambiar carpeta</button>
                <button type="button" className="btn sm" onClick={onCerrar} autoFocus>Cancelar</button>
                <button type="button" className="btn sm primary" disabled={Boolean(mal)} onClick={() => void subir()}>
                  {reemplazar ? "Reemplazar el archivo" : "Guardar"}
                </button>
              </>
            ) : (
              <button type="button" className="btn sm" onClick={() => ctl.current?.abort()}>Cancelar subida</button>
            )}
          </>
        )
      }
    >
      {paso === "elegir" ? <Explorador modo="carpeta" onCambio={setDest} /> : (
        <div className="apr" role="group" aria-label="Aprobación para guardar">
          <b>Se guardará este archivo</b>
          <ul className="flat" style={{ gap: 4 }}>
            <li className="small" style={{ listStyle: "disc", marginLeft: 16 }}>Ruta: {ruta}</li>
            <li className="small" style={{ listStyle: "disc", marginLeft: 16 }}>Tamaño: {tamanoLegible(blob.size)}</li>
            <li className="small" style={{ listStyle: "disc", marginLeft: 16 }}>{reemplazar ? "Si ya existe uno con ese nombre, se reemplazará." : "Si ya existe uno con ese nombre, se guardará con otro nombre."}</li>
          </ul>
          <div className="field">
            <label htmlFor="gn-n">Nombre del archivo</label>
            <input className="inp" id="gn-n" value={nombre} maxLength={200} onChange={(e) => setNombre(e.target.value)} disabled={f !== null} />
            {nombre && mal && <span className="err" role="alert">{mal}</span>}
          </div>
          <label className="chk">
            <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} disabled={f !== null} />
            <span>Reemplazar si ya existe uno con ese nombre (la versión anterior se pierde en esa carpeta)</span>
          </label>
          {f !== null && (
            <div className="fx__up" role="status">
              <progress value={f} max={1} aria-label="Avance de la subida" />
              <span className="small num">{Math.round(f * 100)} %</span>
            </div>
          )}
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      )}
    </Dialogo>
  );
}

/* =============================================================================
   CMS Portales · espacio de trabajo de una página.

   Tres columnas, como el prototipo aprobado: panel izquierdo (Páginas, Bloques,
   Capas), escenario con el lienzo y su barra, e inspector. Aquí vive el estado
   del lienzo (la lista de bloques con su historial). El borrador local solo
   llega a Supabase con «Guardar borrador»; «Publicar» exige que no quede nada
   sin guardar.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { definicion } from "./bloques";
import { IconoCms, type NombreIconoCms } from "./iconos";
import { Inspector } from "./Inspector";
import { Lienzo, type Accion } from "./Lienzo";
import { PanelIzquierdo } from "./PanelIzquierdo";
import { cambiar as cambiarHistorial, cortarFusion, deshacer, nuevoHistorial, rehacer } from "./historial";
import { fijarOculto, ocultoDe, type BloqueExistente, type LineaBloque } from "./logica";
import { RenderBloques, evitarNavegacion } from "./render";
import { plantillaPortada } from "./plantillas";
import { aLineas, sincronizarBloques, useInvalidarCms, usePublicar } from "./store";
import type { CmsBloque, CmsPagina, Props } from "./tipos";

type Dispositivo = "escritorio" | "tableta" | "telefono";
const DISPOSITIVOS: { id: Dispositivo; etiqueta: string; ancho: number; icono: NombreIconoCms }[] = [
  { id: "escritorio", etiqueta: "Escritorio", ancho: 1180, icono: "escritorio" },
  { id: "tableta", etiqueta: "Tableta", ancho: 768, icono: "tableta" },
  { id: "telefono", etiqueta: "Teléfono", ancho: 390, icono: "telefono" },
];

interface EditorBloquesProps {
  pagina: CmsPagina;
  /** Bloques tal como están en la base. Se usan para el primer estado y para saber qué borrar. */
  bloques: CmsBloque[];
  puedeEditar: boolean;
  /** El árbol de páginas del portal: es la pestaña «Páginas» del panel izquierdo. */
  panelPaginas: ReactNode;
  onAviso: (mensaje: string | null) => void;
  /** Avisa si hay cambios sin guardar, para que quien lo contiene no los descarte en silencio. */
  onSucio?: (sucio: boolean) => void;
}

export function EditorBloques({ pagina, bloques, puedeEditar, panelPaginas, onAviso, onSucio }: EditorBloquesProps) {
  const invalidar = useInvalidarCms();
  const publicar = usePublicar();
  const [hist, setHist] = useState(() => nuevoHistorial(aLineas(bloques)));
  const [guardado, setGuardado] = useState(() => JSON.stringify(aLineas(bloques)));
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [dispositivo, setDispositivo] = useState<Dispositivo>("escritorio");
  const [modo, setModo] = useState<"editar" | "vista">("editar");
  // La entrada se reproduce para toda la página o solo para un bloque.
  const [reproPagina, setReproPagina] = useState(0);
  const [reproBloque, setReproBloque] = useState<{ id: string; n: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Cargar el diseño actual reemplaza el borrador: si ya hay bloques, se pide confirmación aquí mismo.
  const [confirmarCarga, setConfirmarCarga] = useState(false);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  // Lo que está en la base ahora. Se actualiza al guardar sin esperar la relectura:
  // así quitar un bloque recién guardado también lo borra de la base.
  const enBase = useRef<BloqueExistente[]>(bloques);

  const actual = hist.actual;
  const actualJson = useMemo(() => JSON.stringify(actual), [actual]);
  const sucio = actualJson !== guardado;
  const idx = actual.findIndex((b) => b.id === seleccion);
  const elegido = idx >= 0 ? actual[idx] : null;
  const editando = puedeEditar && modo === "editar";
  const anchoMarco = DISPOSITIVOS.find((d) => d.id === dispositivo)?.ancho ?? 1180;
  const disparoDe = (id: string) => `${reproPagina}-${modo}-${reproBloque?.id === id ? reproBloque.n : 0}`;
  const rutaPublica = `/portales/${pagina.portal}${pagina.ruta ? `/${pagina.ruta}` : ""}`;

  /* --- Cambios: todo pasa por el historial ---------------------------------------------- */

  const aplicar = (fn: (lista: LineaBloque[]) => LineaBloque[], clave?: string) =>
    setHist((h) => cambiarHistorial(h, fn(h.actual), clave));

  const actualizar = (id: string, cambio: (b: LineaBloque) => LineaBloque, clave?: string) =>
    aplicar((lista) => lista.map((b) => (b.id === id ? cambio(b) : b)), clave);

  /** Mueve el bloque para que quede antes del índice `destino` (de la lista actual). */
  const moverA = (id: string, destino: number) =>
    aplicar((lista) => {
      const desde = lista.findIndex((b) => b.id === id);
      if (desde < 0) return lista;
      const pos = destino > desde ? destino - 1 : destino;
      if (pos === desde) return lista;
      const copia = [...lista];
      const [mover] = copia.splice(desde, 1);
      copia.splice(pos, 0, mover);
      return copia;
    });

  /** Lleva el bloque a la vista cuando se elige desde un panel (no al hacer clic en el lienzo, donde ya se ve). */
  function mostrar(id: string) {
    window.requestAnimationFrame(() => {
      const calma = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.querySelector(`.cms-celda[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: calma ? "auto" : "smooth" });
    });
  }

  function accion(a: Accion, id: string) {
    const i = actual.findIndex((b) => b.id === id);
    if (i < 0) return;
    if (a === "subir") return i > 0 ? moverA(id, i - 1) : undefined;
    if (a === "bajar") return i < actual.length - 1 ? moverA(id, i + 2) : undefined;
    if (a === "ocultar") return actualizar(id, (b) => ({ ...b, props: fijarOculto(b.props, !ocultoDe(b.props)) }));
    if (a === "duplicar") {
      const copia: LineaBloque = { ...actual[i], id: crypto.randomUUID(), props: JSON.parse(JSON.stringify(actual[i].props)) as Props };
      aplicar((lista) => [...lista.slice(0, i + 1), copia, ...lista.slice(i + 1)]);
      setSeleccion(copia.id);
      mostrar(copia.id);
      return;
    }
    // eliminar: la selección pasa al vecino de la misma posición.
    const resto = actual.filter((b) => b.id !== id);
    aplicar((lista) => lista.filter((b) => b.id !== id));
    setSeleccion(resto[Math.min(i, resto.length - 1)]?.id ?? null);
  }

  /** Inserta un bloque nuevo del tipo dado antes del índice (o después del elegido, o al final). */
  function insertar(tipo: string, destino?: number) {
    const def = definicion(tipo);
    if (!def) return;
    const nuevo: LineaBloque = { id: crypto.randomUUID(), tipo: def.tipo, ancho: 12, props: def.valores() };
    const en = Math.max(0, Math.min(actual.length, destino ?? (elegido ? idx + 1 : actual.length)));
    aplicar((lista) => [...lista.slice(0, en), nuevo, ...lista.slice(en)]);
    setSeleccion(nuevo.id);
    mostrar(nuevo.id);
  }

  /* --- Cargar el diseño actual (solo portadas) ------------------------------------------- */

  const esPortada = pagina.ruta === "";

  /** Reemplaza el borrador por la plantilla. Pasa por el historial: Deshacer lo recupera. Nada se escribe en la base. */
  function cargarDisenoActual() {
    const nuevos: LineaBloque[] = plantillaPortada(pagina.portal).map((l) => ({ id: crypto.randomUUID(), tipo: l.tipo, ancho: l.ancho, props: l.props }));
    setHist((h) => cambiarHistorial(h, nuevos));
    setSeleccion(null);
    setConfirmarCarga(false);
    onAviso(`Diseño actual cargado: ${nuevos.length} bloques en el borrador. Revíselos y guarde cuando estén listos.`);
  }

  function pedirCarga() {
    if (actual.length === 0) cargarDisenoActual();
    else setConfirmarCarga(true);
  }

  useEffect(() => {
    if (confirmarCarga) confirmarRef.current?.focus();
  }, [confirmarCarga]);

  const deshacerCambio = () => setHist((h) => deshacer(h));
  const rehacerCambio = () => setHist((h) => rehacer(h));
  const terminarFusion = () => setHist((h) => cortarFusion(h));

  /* --- Atajos: no actúan mientras se escribe en un campo --------------------------------- */

  useEffect(() => {
    if (!editando) return;
    function alTeclear(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const enCampo = Boolean(t && (t.matches("input, textarea, select") || t.isContentEditable));
      const mod = e.ctrlKey || e.metaKey;
      const tecla = e.key.toLowerCase();
      if (mod && tecla === "z") {
        if (enCampo) return;
        e.preventDefault();
        if (e.shiftKey) rehacerCambio();
        else deshacerCambio();
        return;
      }
      if (mod && tecla === "y") {
        if (enCampo) return;
        e.preventDefault();
        rehacerCambio();
        return;
      }
      // Dentro de los paneles (pestañas, botones de listas) Supr y Alt+flechas no tocan el bloque.
      if (enCampo || t?.closest(".cms-insp, .cms-izq")) return;
      if (e.key === "Escape" && seleccion) {
        setSeleccion(null);
        return;
      }
      if (!seleccion) return;
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        accion(e.key === "ArrowUp" ? "subir" : "bajar", seleccion);
      } else if (e.key === "Delete") {
        e.preventDefault();
        accion("eliminar", seleccion);
      }
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
    // La función usa la lista actual: se vuelve a registrar cuando ella cambia.
  }, [editando, seleccion, actual]);

  /* --- Cambios sin guardar: se avisa al contenedor y al cerrar la pestaña ---------------- */

  useEffect(() => {
    onSucio?.(sucio);
  }, [sucio, onSucio]);
  useEffect(() => () => onSucio?.(false), [onSucio]);
  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sucio]);

  /* --- Guardar y publicar ---------------------------------------------------------------- */

  async function guardar(): Promise<boolean> {
    setGuardando(true);
    const lista = actual;
    try {
      await sincronizarBloques(pagina.id, lista, enBase.current);
      enBase.current = lista.map((b, orden) => ({ ...b, orden }));
      setGuardado(JSON.stringify(lista));
      invalidar(pagina.portal, pagina.id);
      onAviso("Borrador guardado.");
      return true;
    } catch (e) {
      onAviso(e instanceof Error ? e.message : "No se pudo guardar el borrador.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function publicarAhora() {
    if (sucio) return;
    try {
      const version = await publicar.mutateAsync(pagina.id);
      invalidar(pagina.portal, pagina.id);
      onAviso(`Publicada. Versión ${version} en línea.`);
    } catch (e) {
      onAviso(e instanceof Error ? e.message : "No se pudo publicar.");
    }
  }

  /* --- Piezas de la barra del escenario -------------------------------------------------- */

  const chipRuta = (
    <span className="cms-ruta" title="Dirección pública">
      {rutaPublica}
    </span>
  );

  const selectorDispositivo = (
    <div className="cms-seg" role="group" aria-label="Ancho de pantalla">
      {DISPOSITIVOS.map((d) => (
        <button key={d.id} type="button" aria-pressed={dispositivo === d.id} onClick={() => setDispositivo(d.id)}>
          <IconoCms name={d.icono} size={15} />
          {d.etiqueta}
        </button>
      ))}
    </div>
  );

  /* --- Solo lectura: quien no edita ve el borrador, sin herramientas ---------------------- */

  if (!puedeEditar) {
    return (
      <div className="cms-ws cms-ws--lectura">
        <PanelIzquierdo paginas={panelPaginas} />
        <section className="cms-escenario" aria-label="Lienzo">
          <div className="cms-barra" role="toolbar" aria-label="Vista de la página">
            <div className="cms-barra__grupo">{chipRuta}</div>
            <div className="cms-barra__grupo">{selectorDispositivo}</div>
          </div>
          <div className="cms-escena">
            <div className="cms-marco-escena" style={{ maxWidth: anchoMarco }} onClickCapture={evitarNavegacion}>
              <RenderBloques bloques={actual} disparo={`${reproPagina}-${modo}`} />
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`cms-ws${editando ? "" : " cms-ws--vista"}`}>
      <PanelIzquierdo
        paginas={panelPaginas}
        editor={{
          bloques: actual,
          seleccion,
          puedeAgregar: modo === "editar",
          onAgregar: (tipo) => insertar(tipo),
          onElegir: (id) => {
            setSeleccion(id);
            mostrar(id);
          },
          onOcultar: (id) => accion("ocultar", id),
        }}
      />

      <section className="cms-escenario" aria-label="Lienzo">
        <div className="cms-barra" role="toolbar" aria-label="Herramientas del lienzo">
          <div className="cms-barra__grupo">
            {chipRuta}
            <button type="button" className="cms-ib" onClick={deshacerCambio} disabled={hist.pasado.length === 0} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">
              <IconoCms name="undo" />
            </button>
            <button type="button" className="cms-ib" onClick={rehacerCambio} disabled={hist.futuro.length === 0} aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)">
              <IconoCms name="redo" />
            </button>
          </div>

          <div className="cms-barra__grupo">
            {selectorDispositivo}
            <div className="cms-seg" role="group" aria-label="Modo del lienzo">
              <button type="button" aria-pressed={modo === "editar"} onClick={() => setModo("editar")}>
                Editar
              </button>
              <button type="button" aria-pressed={modo === "vista"} onClick={() => setModo("vista")}>
                Vista previa
              </button>
            </div>
            <button type="button" className="cms-btn" onClick={() => setReproPagina((n) => n + 1)} disabled={actual.length === 0}>
              <Icon name="play" size={14} />
              Reproducir página
            </button>
          </div>

          <div className="cms-barra__grupo cms-barra__guardar">
            <span className={`cms-estado${sucio ? " cms-estado--sucio" : ""}`} role="status">
              {sucio ? "Cambios sin guardar" : "Sin cambios pendientes"}
            </span>
            {esPortada && (
              <button type="button" className="cms-btn" onClick={pedirCarga} disabled={modo === "vista" || confirmarCarga}>
                <Icon name="layers" size={14} />
                Cargar el diseño actual
              </button>
            )}
            <button type="button" className="cms-btn" onClick={() => void guardar()} disabled={!sucio || guardando}>
              {guardando ? "Guardando…" : "Guardar borrador"}
            </button>
            <button
              type="button"
              className="cms-btn cms-btn--primario"
              onClick={() => void publicarAhora()}
              disabled={sucio || publicar.isPending}
              aria-describedby={sucio ? "cms-aviso-publicar" : undefined}
            >
              {publicar.isPending ? "Publicando…" : "Publicar"}
            </button>
            {sucio && (
              <span id="cms-aviso-publicar" className="cms-sr">
                Guarde el borrador antes de publicar.
              </span>
            )}
          </div>
        </div>

        {confirmarCarga && (
          <div className="cms-confirmar" role="group" aria-labelledby="cms-confirmar-texto">
            <p id="cms-confirmar-texto" className="cms-confirmar__texto">
              Cargar el diseño actual reemplaza los {actual.length} bloques del borrador. Deshacer lo recupera.
            </p>
            <div className="cms-acciones">
              <button ref={confirmarRef} type="button" className="cms-btn cms-btn--primario" onClick={cargarDisenoActual}>
                Reemplazar y cargar
              </button>
              <button type="button" className="cms-btn" onClick={() => setConfirmarCarga(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="cms-escena">
          <div className="cms-marco-escena" style={{ maxWidth: anchoMarco }}>
            {esPortada && actual.length === 0 && modo === "editar" ? (
              <section className="cms-invitacion" aria-label="Portada sin contenido">
                <p className="cms-invitacion__texto">Esta portada todavía no está en el CMS. Cargue el diseño actual y edítelo bloque por bloque.</p>
                <button type="button" className="cms-btn cms-btn--primario" onClick={pedirCarga}>
                  <Icon name="layers" size={14} />
                  Cargar el diseño actual
                </button>
              </section>
            ) : (
              <Lienzo
                bloques={actual}
                seleccion={editando ? seleccion : null}
                modo={modo}
                disparo={disparoDe}
                onSeleccionar={setSeleccion}
                onAccion={accion}
                onMoverA={moverA}
                onInsertar={insertar}
              />
            )}
          </div>
        </div>

        <div className="cms-pista">
          <p>Alt + flechas mueve el bloque elegido, Supr lo elimina, Esc suelta la selección, Ctrl+Z deshace y Ctrl+Shift+Z rehace.</p>
          {esPortada && actual.length > 0 && <p>Lo que se publica aquí todavía no reemplaza la página real del portal: se ve en {rutaPublica}.</p>}
        </div>
      </section>

      {editando && (
        <Inspector
          bloque={elegido}
          orden={Math.max(idx, 0)}
          pagina={pagina}
          puedeEditar={puedeEditar}
          onActualizar={actualizar}
          onFusionFin={terminarFusion}
          onReproducir={(id) => setReproBloque((r) => ({ id, n: (r?.id === id ? r.n : 0) + 1 }))}
          onAviso={onAviso}
        />
      )}
    </div>
  );
}

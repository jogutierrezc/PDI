/* =============================================================================
   UDrive · el editor de documento (/admin/udrive/documento/:id).

   Estructura a la izquierda con los índices automáticos, la hoja Carta al
   centro con sus bloques y el «+» entre cada par, y las propiedades del
   bloque (o los comentarios) a la derecha. Se guarda solo, con deshacer y
   rehacer, y por turnos: al abrir se toma un bloqueo suave que se renueva
   cada minuto y caduca solo; si otra persona lo tiene, se ve en solo lectura
   y se puede pedir el turno. Un documento aprobado no se edita sin volver a
   borrador. El detalle de cada pieza está en su archivo (Hoja, Bloques,
   TextoRico, Propiedades, Versiones, Comentarios, VistaPrevia).
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Aviso, useAviso } from "../../../../components/espacio/piezas";
import { Ventana } from "../../../../components/espacio/Ventana";
import { Icon } from "../../../../components/ui/Icon";
import { useAuth } from "../../../../lib/auth";
import { useContenido, useDuenos, useGuardarContenido, useRenombrar } from "../../datos";
import {
  cederTurno,
  leerContenidos,
  pedirTurno,
  soltarTurno,
  tomarTurno,
  useAprobarDocumento,
  useCambiarEstadoDocumento,
  useCatalogoCifras,
  useComentarios,
  useEstadoDocumento,
} from "../../datosDocumento";
import type { EstadoDeDocumento, Turno } from "../../datosDocumento";
import { SIN_DATO, cifrasCambiadas, congelar } from "../../lib/cifras";
import { ETIQUETA_ESTADO, archivosUsados, bajarBloque, bloqueNuevo, duplicarBloque, indiceDe, insertarBloque, moverBloque, normalizarDocumento, quitarBloque, reemplazarBloque, subirBloque, validarDocumento } from "../../lib/documento";
import type { Bloque, Documento, ResultadoDocumento, TipoBloque } from "../../lib/documento";
import { TITULO_INDICE, indicesActivos, referenciasRotas } from "../../lib/numeracion";
import { ALTO_CUERPO } from "../../lib/paginado";
import { puedeEditar } from "../../lib/permisos";
import { aPlano, escapar, refsDe } from "../../lib/texto";
import { ProveedorRender } from "../../salida/Piezas";
import type { CtxRender } from "../../salida/Piezas";
import { useEntrada } from "../../salida/useEntrada";
import { MarcoEditor, useAutoguardado } from "../MarcoEditor";
import { fechaLarga } from "../piezas";
import type { AccionesBloque } from "./Bloques";
import { Comentarios } from "./Comentarios";
import { Escalado } from "./Escalado";
import { contextoParaPilo } from "../../datosPilo";
import { Herramientas } from "./Herramientas";
import { ImportarInforme } from "./ImportarInforme";
import type { Estilo } from "./Herramientas";
import { Hoja } from "./Hoja";
import type { Estimado } from "./Hoja";
import { Propiedades } from "./Propiedades";
import { SelectorArchivo } from "./Selectores";
import type { ClaseSelector } from "./Selectores";
import type { ApiTexto } from "./TextoRico";
import { VistaPrevia } from "./VistaPrevia";
import { Versiones } from "./Versiones";
import { Estructura } from "./Estructura";
import "../../../../components/espacio/espacio.css";
import "../udrive.css";
import "../../salida/salida.css";
import "./documento.css";

/* ---------- historial: deshacer y rehacer ------------------------------------------------------------ */

interface Historia {
  pasado: Documento[];
  actual: Documento;
  futuro: Documento[];
  clave: string;
  hora: number;
}

function useHistorial(inicial: Documento) {
  const [h, setH] = useState<Historia>({ pasado: [], actual: inicial, futuro: [], clave: "", hora: 0 });
  /** Aplica un cambio. Los cambios seguidos con la misma clave (escribir en un párrafo) se agrupan en un solo paso. */
  const poner = useCallback((fn: (d: Documento) => Documento, clave = "") => {
    setH((s) => {
      const nuevo = fn(s.actual);
      if (nuevo === s.actual) return s;
      const ahora = Date.now();
      const agrupa = clave !== "" && clave === s.clave && ahora - s.hora < 1500;
      return { pasado: agrupa ? s.pasado : [...s.pasado, s.actual].slice(-100), actual: nuevo, futuro: [], clave, hora: ahora };
    });
  }, []);
  const deshacer = useCallback(() => setH((s) => (s.pasado.length ? { pasado: s.pasado.slice(0, -1), actual: s.pasado[s.pasado.length - 1], futuro: [s.actual, ...s.futuro], clave: "", hora: 0 } : s)), []);
  const rehacer = useCallback(() => setH((s) => (s.futuro.length ? { pasado: [...s.pasado, s.actual], actual: s.futuro[0], futuro: s.futuro.slice(1), clave: "", hora: 0 } : s)), []);
  return { doc: h.actual, poner, deshacer, rehacer, puedeDeshacer: h.pasado.length > 0, puedeRehacer: h.futuro.length > 0 };
}

/* ---------- el turno de edición --------------------------------------------------------------------------- */

function useTurnoEdicion(id: string, activo: boolean) {
  const [turno, setTurno] = useState<Turno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ultimo = useRef(0);
  const tengo = useRef(false);
  const tick = useCallback(
    async (forzar = false) => {
      if (!forzar && tengo.current && Date.now() - ultimo.current < 55_000) return;
      try {
        const t = await tomarTurno(id);
        tengo.current = t.tengo;
        ultimo.current = Date.now();
        setTurno(t);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo reservar el turno de edición.");
      }
    },
    [id],
  );
  useEffect(() => {
    if (!activo) {
      setTurno(null);
      tengo.current = false;
      return;
    }
    void tick(true);
    // Cada 10 s se mira; con el turno en la mano solo se renueva cada minuto, y sin él se vuelve a intentar.
    const reloj = window.setInterval(() => void tick(), 10_000);
    return () => {
      window.clearInterval(reloj);
      if (tengo.current) void soltarTurno(id).catch(() => undefined);
      tengo.current = false;
    };
  }, [activo, id, tick]);
  return { turno, error, resuelto: !activo || turno !== null || error !== null, reintentar: () => tick(true) };
}

/* ---------- la pantalla ------------------------------------------------------------------------------------ */

export function EditorDocumento({ id }: { id: string }) {
  const navigate = useNavigate();
  const leido = useContenido(id);
  const duenos = useDuenos([id]);
  const estadoQ = useEstadoDocumento(id);
  const rol = duenos.data?.get(id)?.mi_rol;
  const puedeEd = puedeEditar(rol);
  const estado: EstadoDeDocumento = estadoQ.data ?? { estado_doc: "borrador", aprobado_por_nombre: null, aprobado_en: null };
  const aprobado = estado.estado_doc === "aprobado";
  const turnoEd = useTurnoEdicion(id, puedeEd && !aprobado && !estadoQ.isPending);
  const modoEdicion = puedeEd && !aprobado && Boolean(turnoEd.turno?.tengo);
  const [recarga, setRecarga] = useState(0);
  const eraMio = useRef<boolean | null>(null);
  const cambiarEstado = useCambiarEstadoDocumento();
  const { aviso, decir } = useAviso();

  const docInicial = useMemo<ResultadoDocumento | null>(() => (leido.data && leido.data.tipo === "documento" ? normalizarDocumento(leido.data.contenido) : null), [leido.data]);

  // Si el turno llega después de esperar, el contenido pudo cambiar: se lee de nuevo antes de editar.
  useEffect(() => {
    if (turnoEd.turno === null) return;
    if (eraMio.current === false && turnoEd.turno.tengo) void leido.refetch().then(() => setRecarga((r) => r + 1));
    eraMio.current = turnoEd.turno.tengo;
  }, [turnoEd.turno?.tengo]); // eslint-disable-line react-hooks/exhaustive-deps -- solo el paso de «no lo tengo» a «lo tengo»

  const recargar = useCallback(async () => {
    await leido.refetch();
    setRecarga((r) => r + 1);
  }, [leido]);

  if (leido.isPending || duenos.isPending || estadoQ.isPending) return <div className="es ud"><p className="es-note" style={{ padding: 24 }}>Abriendo el informe…</p></div>;
  const falla = leido.error ?? estadoQ.error;
  if (falla || !leido.data || leido.data.tipo !== "documento" || !docInicial) {
    return (
      <div className="es ud">
        <div className="es-empty" style={{ margin: 24 }}>
          <b>No se pudo abrir el informe</b>
          <span>{falla?.message ?? "No existe, no es un informe o no tiene permiso para verlo."}</span>
          <button type="button" className="es-btn" onClick={() => navigate("/admin/udrive")}>Volver a UDrive</button>
        </div>
      </div>
    );
  }
  if (puedeEd && !aprobado && !turnoEd.resuelto) return <div className="es ud"><p className="es-note" style={{ padding: 24 }}>Reservando el turno de edición…</p></div>;

  return (
    <div className="es ud">
      <Lienzo
        key={`${modoEdicion ? "e" : "l"}:${aprobado ? "a" : "b"}:${recarga}`}
        id={id}
        nombreInicial={leido.data.nombre}
        carpetaId={leido.data.carpeta_id}
        inicial={docInicial}
        soloLectura={!modoEdicion}
        rolPuedeEditar={puedeEd}
        estado={estado}
        turno={turnoEd.turno}
        errorTurno={turnoEd.error}
        decir={decir}
        onPedirTurno={() => void pedirTurno(id).then(() => decir("Se avisó a quien tiene el turno.")).catch((e: Error) => decir(e.message))}
        onCeder={async () => {
          await cederTurno(id);
          await turnoEd.reintentar();
        }}
        onVolverBorrador={() => cambiarEstado.mutate({ id, a: "borrador" }, { onSuccess: () => void recargar(), onError: (e) => decir(e.message) })}
        onRecargar={recargar}
        onReintentarTurno={() => void turnoEd.reintentar()}
      />
      <Aviso texto={aviso} />
    </div>
  );
}

/* ---------- el lienzo ------------------------------------------------------------------------------------------ */

interface LienzoProps {
  id: string;
  nombreInicial: string;
  carpetaId: string | null;
  inicial: ResultadoDocumento;
  soloLectura: boolean;
  rolPuedeEditar: boolean;
  estado: EstadoDeDocumento;
  turno: Turno | null;
  errorTurno: string | null;
  decir(m: string): void;
  onPedirTurno(): void;
  onCeder(): Promise<void>;
  onVolverBorrador(): void;
  onRecargar(): Promise<void>;
  onReintentarTurno(): void;
}

type DialogoSelector = { modo: "insertar"; tipo: "tabla" | "grafica" | "imagen"; despuesDe: string | null } | { modo: "cambiar"; bloque: string; tipo: "tabla" | "grafica" | "imagen" } | { modo: "portada" };

function Lienzo(p: LienzoProps) {
  const { id, soloLectura, decir, estado } = p;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const aprobado = estado.estado_doc === "aprobado";
  const hist = useHistorial(p.inicial.documento);
  const doc = soloLectura ? p.inicial.documento : hist.doc;
  const poner = hist.poner;
  const guardar = useGuardarContenido();
  const renombrar = useRenombrar();
  const aprobar = useAprobarDocumento();
  const cambiarEstado = useCambiarEstadoDocumento();
  const catalogo = useCatalogoCifras();
  const comentariosQ = useComentarios(id);

  const [nombre, setNombre] = useState(p.nombreInicial);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [pestana, setPestana] = useState<"bloque" | "documento">("bloque");
  const [panel, setPanel] = useState<"props" | "comentarios">("props");
  const [zoom, setZoom] = useState(0.8);
  const [estimado, setEstimado] = useState<Estimado>({ total: 1, porBloque: new Map() });
  const [selector, setSelector] = useState<DialogoSelector | null>(null);
  const [dialogo, setDialogo] = useState<null | "versiones" | "aprobar" | "turno" | "importar">(p.rolPuedeEditar && !aprobado && soloLectura && p.turno && !p.turno.tengo ? "turno" : null);
  const [previa, setPrevia] = useState<null | { imprimir: boolean; word?: boolean; doc?: Documento; datos?: Record<string, unknown>; rotulo?: string }>(null);
  const [menuEstado, setMenuEstado] = useState<{ x: number; y: number } | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [hayTexto, setHayTexto] = useState(false);
  const escena = useRef<HTMLDivElement>(null);
  const api = useRef<ApiTexto | null>(null);
  const foco = useRef<string | null>(null);
  const reloj = useRef<number | undefined>();

  /* ---- datos de dibujo ---- */
  const entrada = useEntrada(doc, { aprobado, titulo: nombre });
  const activos = useMemo(() => indicesActivos(doc, entrada.figuras, entrada.texto), [doc, entrada.figuras, entrada.texto]);
  const paginasAntes = 1 + activos.reduce((t, i) => t + Math.max(1, Math.ceil((i.entradas.length * 25 + 70) / ALTO_CUERPO)), 0);
  const resumenIndices = activos.length
    ? activos.map((i) => `${TITULO_INDICE[i.clave]} (${i.entradas.length})`).join(" · ")
    : Object.values(doc.indices).some(Boolean)
      ? "Los índices aparecerán cuando haya capítulos o figuras con título."
      : "";
  const ctx = useMemo<CtxRender>(
    () => ({ bibliografia: entrada.bibliografia, modo: "editor", texto: entrada.texto, cifra: entrada.cifra, figuras: entrada.figuras, recursos: entrada.recursos, paginas: new Map() }),
    [entrada.bibliografia, entrada.texto, entrada.cifra, entrada.figuras, entrada.recursos],
  );
  const cambiosCifras = useMemo(() => (aprobado ? [] : cifrasCambiadas(doc, entrada.lecturas)), [aprobado, doc, entrada.lecturas]);
  const rotas = useMemo(() => referenciasRotas(doc, entrada.figuras, refsDe), [doc, entrada.figuras]);

  const sinResolver = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comentariosQ.data ?? []) if (!c.resuelto) m.set(c.bloque_id, (m.get(c.bloque_id) ?? 0) + 1);
    return m;
  }, [comentariosQ.data]);
  const totalSinResolver = [...sinResolver.values()].reduce((t, n) => t + n, 0);

  /* ---- guardado ---- */
  const { estado: guardado, vaciar } = useAutoguardado(soloLectura ? null : doc, !soloLectura, async (d) => {
    const problema = validarDocumento(d);
    if (problema) {
      decir(problema);
      throw new Error(problema);
    }
    await guardar.mutateAsync({ id, contenido: d });
  });

  useEffect(() => {
    if (guardado === "guardado") return;
    const avisar = (e: BeforeUnloadEvent) => (e.preventDefault(), (e.returnValue = ""));
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [guardado]);

  // Un zoom inicial que quepa en la pantalla.
  useEffect(() => {
    const w = escena.current?.clientWidth ?? 0;
    if (w) setZoom(Math.max(0.4, Math.min(1, Math.floor(((w - 32) / 816) * 100) / 100)));
  }, []);

  const bloqueSel = doc.bloques.find((b) => b.id === seleccion) ?? null;
  const pagina = seleccion && estimado.porBloque.get(seleccion) ? `${estimado.porBloque.get(seleccion)} de ${estimado.total}` : `1 de ${estimado.total}`;

  /* ---- acciones sobre los bloques (identidad estable para que los bloques no se redibujen por cada letra) ---- */
  const hacer = useRef<AccionesBloque>(null as unknown as AccionesBloque);
  hacer.current = {
    seleccionar: (bid) => {
      setSeleccion(bid);
      if (bid === "portada") setPestana("documento");
      else if (bid) setPestana("bloque");
      if (bid && bid !== "portada") {
        const b = doc.bloques.find((x) => x.id === bid);
        if (b && !["parrafo", "lista", "destacado", "nota"].includes(b.tipo)) setHayTexto(false);
      }
    },
    cambiar: (b, clave) => poner((d) => ({ ...d, bloques: reemplazarBloque(d.bloques, b) }), clave),
    subir: (bid) => poner((d) => ({ ...d, bloques: subirBloque(d.bloques, bid) })),
    bajar: (bid) => poner((d) => ({ ...d, bloques: bajarBloque(d.bloques, bid) })),
    duplicar: (bid) => {
      const r = duplicarBloque(doc.bloques, bid);
      if (!r.copiaId) return;
      poner((d) => ({ ...d, bloques: duplicarBloque(d.bloques, bid).bloques }));
      setSeleccion(r.copiaId);
    },
    borrar: (bid) => {
      const i = indiceDe(doc.bloques, bid);
      poner((d) => ({ ...d, bloques: quitarBloque(d.bloques, bid) }));
      const vecino = doc.bloques[i + 1] ?? doc.bloques[i - 1];
      setSeleccion(vecino?.id ?? null);
      avisarBorrado();
    },
    insertar: (tipo, despuesDe) => insertar(tipo, despuesDe),
    insertarConContenido: (nuevo, despuesDe) => {
      poner((d) => ({ ...d, bloques: insertarBloque(d.bloques, nuevo, despuesDe) }));
      setSeleccion(nuevo.id);
    },
    mover: (bid, despuesDe) =>
      poner((d) => {
        const sin = d.bloques.filter((b) => b.id !== bid);
        const destino = despuesDe === null ? 0 : sin.findIndex((b) => b.id === despuesDe) + 1;
        return { ...d, bloques: moverBloque(d.bloques, bid, destino) };
      }),
    comentarios: (bid) => {
      setSeleccion(bid);
      setPanel("comentarios");
    },
    activarTexto: (a) => {
      api.current = a;
      setHayTexto(Boolean(a));
    },
    parrafoDespuesDe: (bid) => insertar("parrafo", bid),
  };
  const acc = useMemo<AccionesBloque>(
    () => ({
      seleccionar: (b) => hacer.current.seleccionar(b),
      cambiar: (b, c) => hacer.current.cambiar(b, c),
      subir: (b) => hacer.current.subir(b),
      bajar: (b) => hacer.current.bajar(b),
      duplicar: (b) => hacer.current.duplicar(b),
      borrar: (b) => hacer.current.borrar(b),
      insertar: (t, d) => hacer.current.insertar(t, d),
      insertarConContenido: (b, d) => hacer.current.insertarConContenido(b, d),
      mover: (b, d) => hacer.current.mover(b, d),
      comentarios: (b) => hacer.current.comentarios(b),
      activarTexto: (a) => hacer.current.activarTexto(a),
      parrafoDespuesDe: (b) => hacer.current.parrafoDespuesDe(b),
    }),
    [],
  );

  function avisarBorrado() {
    setSnack("Bloque borrado.");
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setSnack(null), 7000);
  }
  useEffect(() => () => window.clearTimeout(reloj.current), []);

  function insertar(tipo: TipoBloque, despuesDe: string | null) {
    if (tipo === "tabla" || tipo === "grafica" || tipo === "imagen") return setSelector({ modo: "insertar", tipo, despuesDe });
    const nuevo = bloqueNuevo(tipo);
    poner((d) => ({ ...d, bloques: insertarBloque(d.bloques, nuevo, despuesDe) }));
    setSeleccion(nuevo.id);
    foco.current = nuevo.id;
  }

  // El foco al bloque recién creado.
  useEffect(() => {
    if (!foco.current) return;
    const el = escena.current?.querySelector<HTMLElement>(`[data-bloque="${foco.current}"] [contenteditable="true"], [data-bloque="${foco.current}"] input`);
    if (el) {
      el.focus();
      foco.current = null;
    }
  }, [doc.bloques]);

  /* ---- archivos de UDrive en los bloques ---- */
  const alElegirArchivo = (a: { id: string }) => {
    const s = selector;
    setSelector(null);
    if (!s) return;
    if (s.modo === "portada") return poner((d) => ({ ...d, portada: { ...d.portada, imagenId: a.id } }));
    if (s.modo === "cambiar") return poner((d) => ({ ...d, bloques: d.bloques.map((b) => (b.id === s.bloque && "archivoId" in b ? ({ ...b, archivoId: a.id } as Bloque) : b)) }));
    const nuevo = { ...bloqueNuevo(s.tipo), archivoId: a.id } as Bloque;
    poner((d) => ({ ...d, bloques: insertarBloque(d.bloques, nuevo, s.despuesDe) }));
    setSeleccion(nuevo.id);
  };
  const insertarRapido = (t: TipoBloque) => insertar(t, seleccion && seleccion !== "portada" ? seleccion : (doc.bloques[doc.bloques.length - 1]?.id ?? null));

  /* ---- formato ---- */
  const estiloActual = ((): Estilo | "" => {
    if (!bloqueSel) return "";
    if (bloqueSel.tipo === "capitulo") return `capitulo-${bloqueSel.nivel}` as Estilo;
    if (bloqueSel.tipo === "parrafo" || bloqueSel.tipo === "lista" || bloqueSel.tipo === "destacado") return bloqueSel.tipo;
    return "";
  })();
  const cambiarEstilo = (e: Estilo) => {
    if (!bloqueSel) return;
    const b = bloqueSel;
    const marcado = b.tipo === "capitulo" ? escapar(b.titulo) : b.tipo === "parrafo" || b.tipo === "destacado" || b.tipo === "nota" ? b.texto : b.tipo === "lista" ? b.items.join(" ") : "";
    const plano = aPlano(marcado);
    const nuevo: Bloque =
      e === "parrafo" ? { id: b.id, tipo: "parrafo", texto: marcado }
      : e === "destacado" ? { id: b.id, tipo: "destacado", texto: marcado }
      : e === "lista" ? { id: b.id, tipo: "lista", ordenada: false, items: [marcado] }
      : { id: b.id, tipo: "capitulo", nivel: Number(e.slice(-1)) as 1 | 2 | 3, titulo: plano };
    poner((d) => ({ ...d, bloques: reemplazarBloque(d.bloques, nuevo) }));
  };
  const insertarCifra = (clave: string) => {
    api.current?.insertar({ tipo: "cifra", clave });
    const c = entrada.cifra(clave);
    if (c && c.conValor) poner((d) => ({ ...d, vistas: { ...d.vistas, [clave]: c.texto } }));
  };
  const aceptarCifras = () => poner((d) => ({ ...d, vistas: { ...d.vistas, ...Object.fromEntries(cambiosCifras.map((c) => [c.clave, c.a])) } }));
  const agregarCapitulo = () => {
    const nuevo = { ...bloqueNuevo("capitulo"), nivel: 1 as const } as Bloque;
    poner((d) => ({ ...d, bloques: [...d.bloques, nuevo] }));
    setSeleccion(nuevo.id);
    foco.current = nuevo.id;
  };
  const irA = (bid: string) => {
    setSeleccion(bid);
    window.setTimeout(() => escena.current?.querySelector(`[data-bloque="${bid}"]`)?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 30);
  };

  /* ---- instantánea para versiones y aprobación ---- */
  const recolectar = useCallback(async (): Promise<Record<string, unknown>> => {
    const u = archivosUsados(doc);
    const ids = new Set([...u.tablas, ...u.graficas]);
    for (const g of u.graficas) {
      const t = entrada.recursos.graficas.get(g)?.tabla_id;
      if (t) ids.add(t);
    }
    return leerContenidos([...ids]);
  }, [doc, entrada.recursos.graficas]);

  /* ---- teclado ---- */
  const teclado = useRef<(e: KeyboardEvent) => void>(() => undefined);
  teclado.current = (e) => {
    if (document.querySelector(".es-scrim") || previa) return;
    const mod = e.ctrlKey || e.metaKey;
    const destino = e.target as HTMLElement;
    const escribiendo = destino.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(destino.tagName);
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!soloLectura) void vaciar().then((ok) => decir(ok ? "Guardado." : "No se pudo guardar."));
      return;
    }
    if (soloLectura) return;
    if (mod && e.key.toLowerCase() === "z") {
      if (destino.tagName === "INPUT" && !destino.classList.contains("ud-cap-input")) return;
      e.preventDefault();
      if (e.shiftKey) hist.rehacer();
      else hist.deshacer();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      hist.rehacer();
    } else if (mod && e.key.toLowerCase() === "d" && seleccion && seleccion !== "portada") {
      e.preventDefault();
      acc.duplicar(seleccion);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && seleccion && seleccion !== "portada") {
      e.preventDefault();
      if (e.key === "ArrowUp") acc.subir(seleccion);
      else acc.bajar(seleccion);
    } else if (e.key === "Delete" && !escribiendo && seleccion && seleccion !== "portada") {
      e.preventDefault();
      acc.borrar(seleccion);
    } else if (e.key === "Escape" && !escribiendo) {
      setSeleccion(null);
    }
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => teclado.current(e);
    document.addEventListener("keydown", f, true);
    return () => document.removeEventListener("keydown", f, true);
  }, []);

  /* ---- salir, nombre, estado ---- */
  const volver = async () => {
    if (!soloLectura) await vaciar();
    navigate(p.carpetaId ? `/admin/udrive?c=${p.carpetaId}` : "/admin/udrive");
  };
  const pasarA = (a: "borrador" | "revision") => {
    setMenuEstado(null);
    void (async () => {
      if (!soloLectura && !(await vaciar())) return decir("No se pudo guardar antes de cambiar el estado.");
      cambiarEstado.mutate({ id, a }, { onSuccess: () => decir(a === "revision" ? "Pasó a revisión." : "Vuelve a borrador."), onError: (e) => decir(e.message) });
    })();
  };

  const chip = (
    <>
      <button
        type="button"
        className="es-est"
        data-e={estado.estado_doc === "aprobado" ? "listo" : "borrador"}
        aria-haspopup="menu"
        aria-expanded={Boolean(menuEstado)}
        disabled={!p.rolPuedeEditar}
        title={estado.estado_doc === "aprobado" && estado.aprobado_en ? `Aprobado por ${estado.aprobado_por_nombre ?? "—"} el ${fechaLarga(estado.aprobado_en)}` : "Cambiar el estado del informe"}
        style={{ border: 0, minHeight: 24 }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenuEstado(menuEstado ? null : { x: r.left, y: r.bottom + 4 });
        }}
      >
        <Icon name={estado.estado_doc === "aprobado" ? "check" : "pen"} size={12} />
        {ETIQUETA_ESTADO[estado.estado_doc]}
      </button>
      {menuEstado ? (
        <MenuEstado
          x={menuEstado.x}
          y={menuEstado.y}
          estado={estado.estado_doc}
          onCerrar={() => setMenuEstado(null)}
          onBorrador={() => pasarA("borrador")}
          onRevision={() => pasarA("revision")}
          onAprobar={() => (setMenuEstado(null), setDialogo("aprobar"))}
        />
      ) : null}
    </>
  );

  const nombreArchivo = nombre || "Informe";
  return (
    <ProveedorRender value={ctx}>
      <MarcoEditor
        tipo="documento"
        etiqueta={`Editor del informe ${nombreArchivo}`}
        nombre={{ valor: nombre, editable: !soloLectura, renombrar: (n) => renombrar.mutate({ tipo: "archivo", id, nombre: n }, { onSuccess: () => (setNombre(n), decir("Nombre cambiado.")), onError: (e) => decir(e.message) }) }}
        chip={chip}
        guardado={guardado}
        soloLectura={aprobado ? "Aprobado: solo lectura" : !p.rolPuedeEditar ? "Solo puede ver este informe" : soloLectura ? "Solo lectura" : undefined}
        onVolver={() => void volver()}
        acciones={
          <>
            <button type="button" className="es-btn" aria-pressed={panel === "comentarios"} onClick={() => setPanel(panel === "comentarios" ? "props" : "comentarios")}>
              Comentarios{totalSinResolver ? <span className="es-est" data-e="borrador" style={{ marginLeft: 2 }}>{totalSinResolver}</span> : null}
            </button>
            <button type="button" className="es-btn" onClick={() => setPrevia({ imprimir: false })}>Vista previa del PDF</button>
            {!soloLectura && !aprobado ? <button type="button" className="es-btn" onClick={() => setDialogo("importar")}>Importar Word o PDF</button> : null}
            <button type="button" className="es-btn" onClick={() => setDialogo("versiones")}>Versiones</button>
            <button type="button" className="es-btn" onClick={() => setPrevia({ imprimir: false, word: true })}>Exportar Word</button>
            <button type="button" className="es-btn es-btn--pri" onClick={() => setPrevia({ imprimir: true })}>Exportar PDF</button>
          </>
        }
      >
        <Bandas
          p={p}
          aprobado={aprobado}
          cambiosCifras={cambiosCifras.length}
          rotas={rotas.length}
          sinCifras={entrada.claves.some((k) => !entrada.lecturas.has(k) && !entrada.cifra(k)) && !entrada.cargandoCifras}
          onVerCifras={() => (setSeleccion("portada"), setPestana("documento"))}
          onTurno={() => setDialogo("turno")}
        />
        <div className="ud-docx">
          <Herramientas
            editable={!soloLectura}
            hayTexto={hayTexto}
            estilo={estiloActual}
            onEstilo={cambiarEstilo}
            onNegrita={() => api.current?.negrita()}
            onCursiva={() => api.current?.cursiva()}
            onEnlace={(u) => api.current?.enlace(u)}
            onCifra={insertarCifra}
            onCita={(f, x) => api.current?.insertar({ tipo: "cita", fuente: f, extra: x })}
            onRef={(b) => api.current?.insertar({ tipo: "ref", bloque: b })}
            onNuevaFuente={() => (setSeleccion("portada"), setPestana("documento"), decir("Agregue la fuente en «Fuentes de las citas»."))}
            guardarSeleccion={() => api.current?.guardarSeleccion()}
            restaurarSeleccion={() => api.current?.restaurarSeleccion()}
            catalogo={catalogo.data ?? []}
            catalogoError={catalogo.error ? "No se pudo leer el catálogo de cifras. Puede escribir la clave." : null}
            fuentes={doc.fuentes}
            figuras={[...entrada.figuras.values()]}
            onInsertar={insertarRapido}
            pagina={pagina}
            zoom={zoom}
            onZoom={setZoom}
            onAjustar={() => setZoom(Math.max(0.4, Math.min(1, Math.floor((((escena.current?.clientWidth ?? 880) - 32) / 816) * 100) / 100)))}
            puedeDeshacer={hist.puedeDeshacer}
            puedeRehacer={hist.puedeRehacer}
            onDeshacer={hist.deshacer}
            onRehacer={hist.rehacer}
          />
          <div className="ud-doc-trabajo">
            <Estructura
              doc={doc}
              seleccion={seleccion}
              paginas={estimado.porBloque}
              editable={!soloLectura}
              onIr={irA}
              onAgregarCapitulo={agregarCapitulo}
              onIndices={(i) => poner((d) => ({ ...d, indices: { ...d.indices, ...i } }))}
            />
            <div className="ud-doc-escena" ref={escena} onClick={() => setSeleccion(null)}>
              <Escalado escala={zoom}>
                <Hoja doc={doc} seleccion={seleccion} editable={!soloLectura} comentarios={sinResolver} resumenIndices={resumenIndices} paginasAntes={paginasAntes} acc={acc} onEstimado={setEstimado} />
              </Escalado>
            </div>
            {panel === "comentarios" ? (
              <Comentarios
                documento={id}
                bloques={doc.bloques}
                bloqueId={seleccion && seleccion !== "portada" ? seleccion : null}
                comentarios={comentariosQ.data ?? []}
                yo={profile?.id}
                puedeEditar={p.rolPuedeEditar}
                decir={decir}
                onIr={irA}
                onCerrar={() => setPanel("props")}
              />
            ) : (
              <Propiedades
                doc={doc}
                bloque={bloqueSel}
                recursos={entrada.recursos}
                figura={bloqueSel ? entrada.figuras.get(bloqueSel.id) : undefined}
                editable={!soloLectura}
                cambiosDeCifras={cambiosCifras}
                pestana={pestana}
                onPestana={setPestana}
                acc={acc}
                cambiarDoc={poner}
                contextoPilo={(bid) => contextoParaPilo(doc, bid, { informe: nombre, claves: entrada.claves, cifra: entrada.cifra, figuras: entrada.figuras, texto: entrada.texto })}
                elegirArchivo={(b) => (b.tipo === "tabla" || b.tipo === "grafica" || b.tipo === "imagen") && setSelector({ modo: "cambiar", bloque: b.id, tipo: b.tipo })}
                elegirPortada={() => setSelector({ modo: "portada" })}
                abrirArchivo={(tipo, archivo) => void (soloLectura ? Promise.resolve(true) : vaciar()).then(() => navigate(`/admin/udrive/${tipo}/${archivo}`))}
                aceptarCifras={aceptarCifras}
              />
            )}
          </div>
        </div>
      </MarcoEditor>

      {snack ? (
        <div className="ud-snack" role="status">
          <span>{snack}</span>
          <button type="button" className="es-btn es-btn--sm" onClick={() => (hist.deshacer(), setSnack(null))}>Deshacer</button>
        </div>
      ) : null}

      {selector ? (
        <SelectorArchivo
          clase={(selector.modo === "portada" ? "imagen" : selector.tipo) as ClaseSelector}
          actual={selector.modo === "cambiar" ? ((doc.bloques.find((b) => b.id === selector.bloque) as { archivoId?: string } | undefined)?.archivoId ?? "") : selector.modo === "portada" ? doc.portada.imagenId : undefined}
          onElegir={alElegirArchivo}
          onCerrar={() => setSelector(null)}
        />
      ) : null}

      {dialogo === "versiones" ? (
        <Versiones
          documentoId={id}
          actual={doc}
          editable={!soloLectura}
          antesDeGuardar={() => (soloLectura ? Promise.resolve(true) : vaciar())}
          recolectar={recolectar}
          onVer={(d, datos, rotulo) => (setDialogo(null), setPrevia({ imprimir: false, doc: d, datos, rotulo }))}
          onRestaurado={() => (setDialogo(null), void p.onRecargar())}
          onCerrar={() => setDialogo(null)}
          decir={decir}
        />
      ) : null}

      {dialogo === "aprobar" ? (
        <Aprobar
          sinResolver={totalSinResolver}
          rotas={rotas.length}
          sinDato={[...entrada.claves].filter((k) => !entrada.cifra(k)?.conValor)}
          ocupado={aprobar.isPending}
          onCerrar={() => setDialogo(null)}
          onAprobar={async (nota) => {
            try {
              if (!(await vaciar())) return decir("No se pudo guardar el informe antes de aprobarlo.");
              const datos = await recolectar();
              await aprobar.mutateAsync({ id, congeladas: congelar(doc, entrada.lecturas), datos, nota });
              setDialogo(null);
              decir("Informe aprobado. Las cifras quedaron congeladas.");
              await p.onRecargar();
            } catch (e) {
              decir(e instanceof Error ? e.message : "No se pudo aprobar el informe.");
            }
          }}
        />
      ) : null}

      {dialogo === "turno" && p.turno && !p.turno.tengo ? (
        <Ventana
          titulo={`Está editando ${p.turno.por_nombre ?? "otra persona"}`}
          ancho="chica"
          onCerrar={() => setDialogo(null)}
          pie={
            <>
              <button type="button" className="es-btn" onClick={() => setDialogo(null)}>Abrir en solo lectura</button>
              <button type="button" className="es-btn es-btn--pri" onClick={() => (p.onPedirTurno(), setDialogo(null))}>Pedir el turno</button>
            </>
          }
        >
          <div className="es-dbody es-dbody--solo">
            <p>Para que nadie pise el trabajo de otra persona, el informe se edita por turnos. Puede mirarlo en solo lectura o pedir el turno: quien lo tiene recibirá el aviso. Si deja de editar, el turno se libera solo en unos minutos.</p>
          </div>
        </Ventana>
      ) : null}

      {dialogo === "importar" ? (
        <ImportarInforme
          modo="agregar"
          carpeta={p.carpetaId}
          nombreInforme={nombre}
          plantillaDoc={doc}
          decir={decir}
          onCerrar={() => setDialogo(null)}
          onAgregar={(bloques) => {
            poner((d) => ({ ...d, bloques: [...d.bloques, ...bloques] }));
            setSeleccion(bloques[0]?.id ?? null);
          }}
        />
      ) : null}

      {previa ? (
        <VistaPrevia
          doc={previa.doc ?? doc}
          titulo={nombre}
          nombreArchivo={nombreArchivo}
          aprobado={aprobado}
          instantanea={previa.datos}
          rotulo={previa.rotulo}
          autoImprimir={previa.imprimir}
          autoWord={previa.word}
          onCerrar={() => setPrevia(null)}
        />
      ) : null}
    </ProveedorRender>
  );
}

/* ---------- las bandas de aviso ------------------------------------------------------------------------------------ */

function Bandas({
  p,
  aprobado,
  cambiosCifras,
  rotas,
  sinCifras,
  onVerCifras,
  onTurno,
}: {
  p: LienzoProps;
  aprobado: boolean;
  cambiosCifras: number;
  rotas: number;
  sinCifras: boolean;
  onVerCifras(): void;
  onTurno(): void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const otro = p.rolPuedeEditar && !aprobado && p.soloLectura && p.turno && !p.turno.tengo;
  return (
    <>
      {aprobado ? (
        <div className="ud-banda" data-t="ok" role="status">
          <b>Aprobado</b>
          <span>por {p.estado.aprobado_por_nombre ?? "—"}{p.estado.aprobado_en ? ` el ${fechaLarga(p.estado.aprobado_en)}` : ""}. Las cifras están congeladas.</span>
          {p.rolPuedeEditar ? <button type="button" className="es-btn es-btn--sm" onClick={p.onVolverBorrador}>Volver a borrador para editar</button> : null}
        </div>
      ) : null}
      {otro ? (
        <div className="ud-banda" role="status">
          <b>Está editando {p.turno?.por_nombre ?? "otra persona"}.</b>
          <span>Usted lo ve en solo lectura; se actualiza solo.</span>
          <button type="button" className="es-btn es-btn--sm" onClick={p.onPedirTurno}>Pedir el turno</button>
          <button type="button" className="es-btn es-btn--sm" onClick={onTurno}>Más información</button>
        </div>
      ) : null}
      {p.errorTurno && !aprobado && p.rolPuedeEditar && p.soloLectura && !otro ? (
        <div className="ud-banda" role="alert">
          <b>No se pudo reservar el turno de edición.</b>
          <span>{p.errorTurno}</span>
          <button type="button" className="es-btn es-btn--sm" onClick={p.onReintentarTurno}>Reintentar</button>
        </div>
      ) : null}
      {!p.soloLectura && p.turno?.pedido_por_nombre ? (
        <div className="ud-banda" role="status">
          <b>{p.turno.pedido_por_nombre} pidió el turno.</b>
          <span>Cuando termine, ceda el turno para que pueda editar.</span>
          <button type="button" className="es-btn es-btn--sm" disabled={ocupado} onClick={() => (setOcupado(true), void p.onCeder().catch((e: Error) => p.decir(e.message)).finally(() => setOcupado(false)))}>Ceder el turno</button>
        </div>
      ) : null}
      {p.estado.estado_doc === "revision" ? <div className="ud-banda" role="status"><b>En revisión.</b><span>Quien tenga permiso de editar puede aprobarlo desde el estado, arriba.</span></div> : null}
      {cambiosCifras > 0 && !aprobado ? (
        <div className="ud-banda" role="status">
          <b>{cambiosCifras === 1 ? "Una cifra viva cambió" : `${cambiosCifras} cifras vivas cambiaron`} desde que las revisó.</b>
          <button type="button" className="es-btn es-btn--sm" onClick={onVerCifras}>Ver cuáles</button>
        </div>
      ) : null}
      {rotas > 0 ? <div className="ud-banda" role="alert"><b>{rotas === 1 ? "Una referencia cruzada apunta" : `${rotas} referencias cruzadas apuntan`} a una figura que ya no está.</b><span>Aparecen en rojo en el texto.</span></div> : null}
      {sinCifras && !aprobado ? <div className="ud-banda" role="alert"><b>Hay cifras vivas sin valor ({SIN_DATO}).</b><span>Revise su clave o espere a que UDES en Cifras publique el dato antes de aprobar.</span></div> : null}
    </>
  );
}

/* ---------- el menú de estado y la aprobación ---------------------------------------------------------------------------- */

function MenuEstado({ x, y, estado, onCerrar, onBorrador, onRevision, onAprobar }: { x: number; y: number; estado: string; onCerrar(): void; onBorrador(): void; onRevision(): void; onAprobar(): void }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    raiz.current?.querySelector<HTMLElement>("button")?.focus();
    const fuera = (e: PointerEvent) => !raiz.current?.contains(e.target as Node) && onCerrar();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onCerrar());
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc, true);
    return () => (document.removeEventListener("pointerdown", fuera), document.removeEventListener("keydown", esc, true));
  }, [onCerrar]);
  return (
    <div ref={raiz} className="es-menu" role="menu" style={{ left: x, top: y, width: 240 }}>
      <div className="es-h">Estado del informe</div>
      <button type="button" role="menuitem" className="es-btn es-btn--ghost" disabled={estado === "borrador"} onClick={onBorrador}>Borrador</button>
      <button type="button" role="menuitem" className="es-btn es-btn--ghost" disabled={estado === "revision"} onClick={onRevision}>En revisión</button>
      <button type="button" role="menuitem" className="es-btn es-btn--ghost" disabled={estado === "aprobado"} onClick={onAprobar}>Aprobar…</button>
    </div>
  );
}

function Aprobar({ sinResolver, rotas, sinDato, ocupado, onAprobar, onCerrar }: { sinResolver: number; rotas: number; sinDato: string[]; ocupado: boolean; onAprobar(nota: string): void; onCerrar(): void }) {
  const [nota, setNota] = useState("");
  return (
    <Ventana
      titulo="Aprobar el informe"
      ancho="chica"
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="es-btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="es-btn es-btn--pri" disabled={ocupado} onClick={() => onAprobar(nota.trim())}>Aprobar y congelar las cifras</button>
        </>
      }
    >
      <div className="es-dbody es-dbody--solo">
        <p>Al aprobar, el informe deja de editarse (hasta volver a borrador), las cifras vivas quedan con el valor de hoy, se guarda una versión con los datos de las tablas y gráficas, y la marca de «borrador» sale del PDF.</p>
        {sinResolver ? <p className="ud-aviso" data-t="aviso" role="status">Hay {sinResolver} {sinResolver === 1 ? "comentario sin resolver" : "comentarios sin resolver"}.</p> : null}
        {rotas ? <p className="ud-aviso" data-t="error" role="alert">Hay {rotas} {rotas === 1 ? "referencia cruzada rota" : "referencias cruzadas rotas"}.</p> : null}
        {sinDato.length ? <p className="ud-aviso" data-t="error" role="alert">Estas cifras no tienen valor y saldrían como «{SIN_DATO}»: {sinDato.map((k) => `[[${k}]]`).join(", ")}.</p> : null}
        <label className="es-fl">
          Nota de la aprobación (opcional)
          <input type="text" className="es-inp" data-foco maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Aprobado por el Comité de Planeación" />
        </label>
      </div>
    </Ventana>
  );
}

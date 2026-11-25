/* =============================================================================
   Compilar informe de colaboradores con Pilo · el puesto de trabajo a pantalla completa.

   Vicerrectorías, decanaturas y rectorías reciben los libros de las unidades de apoyo (sueltos o en un ZIP),
   los organizan (plantilla adaptada, indicadores unificados, conflictos resueltos), Pilo Astra redacta cada
   sección de texto y, si el Gestor aprueba, todo se escribe en el informe con las mismas reglas del Libro de
   Excel. La lógica está en logica.ts (pura, con pruebas); aquí el estado, los archivos y la conexión con Astra.
   Lo que se recibe y se decide se guarda por informe (migración 0293) para seguir en otro momento.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { puedeEditar } from "../estados";
import { aprobadosParaSeguro } from "./auxiliares";
import { leerLibro } from "../libro-informe";
import type { ModoAplicacion } from "../libro-informe";
import { partesTexto, type Resuelto } from "../tokens";
import type { AnexoRow, CicloRow, ContenidoSeccion, InstanciaRow, PilarRef, RolInforme, SeccionDef } from "../types";
import { opcionesPilar } from "../indicadores-manual";
import { descargarLibro, leerLibroCompleto } from "../ui/excel";
import type { HojaExcel } from "../ui/excel";
import { mensajeDe } from "../ui/comunes";
import { ESTADO_VACIO, ErrorRedaccion, redactarSeccion, useEstadoCompilacion, useGuardarEstado, useGuardarLibro, useLibrosGuardados, useQuitarLibro } from "./datos";
import type { EstadoCompilacion, NivelAstra } from "./datos";
import {
  agruparIndicadores,
  claveDeGrupo,
  clasificarEntrada,
  cobertura,
  compilarAlInforme,
  datosParaPilo,
  equipoDe,
  estadoGrupo,
  formatoValor,
  huellaDatos,
  motivoDeRechazo,
  nombreOficial,
  observacionOficial,
  observaciones,
  recibirLibro,
  resumenIndicadores,
  seccionesRedactables,
} from "./logica";
import type { Grupo, LibroRecibido } from "./logica";
import { PasoAprobar, PasoOrganizar, PasoRecibir, PasoRedactar } from "./Pasos";
import type { PropsOrganizar } from "./Pasos";
import "./compilador.css";

export interface EntradaRegistro {
  nombre: string;
  estado: "leyendo" | "ok" | "skip" | "rej";
  texto: string;
}

interface Props {
  inst: InstanciaRow;
  ciclo: CicloRow;
  unidad: string;
  secciones: SeccionDef[];
  contenido: (clave: string) => ContenidoSeccion;
  aprobados: { id: string; nombre: string }[];
  pilares: PilarRef[];
  anexos: AnexoRow[];
  actor: RolInforme | null;
  escribir: (def: SeccionDef, c: ContenidoSeccion) => void;
  agregarEvidencias: (enlaces: { url: string; nombre: string; descripcion: string }[]) => Promise<void>;
  onCerrar: () => void;
}

const PASOS: [string, string][] = [
  ["Recibir", "Libros de los equipos"],
  ["Organizar", "Criterios y fuentes"],
  ["Redactar", "Borrador con Pilo"],
  ["Aprobar", "Importar al informe"],
];
const TOPE_ARCHIVO = 25 * 1024 * 1024;
const TOPE_ENTRADAS = 200;
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const imagen = (m: string) => `${BASE}pilo-moods/${m}-160.webp`;
const reducir = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const NIVELES: { id: NivelAstra; t: string; ayuda: string }[] = [
  { id: "rapida", t: "Rápida", ayuda: "Para un primer vistazo. Poco razonamiento." },
  { id: "compleja", t: "Compleja", ayuda: "Equilibrio entre calidad y tiempo. Recomendado." },
  { id: "investigacion", t: "Investigación", ayuda: "Contrasta fuentes y secciones. Tarda más." },
];

export function Compilador(p: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const selector = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState(1);
  const [maxPaso, setMaxPaso] = useState(1);
  const guardados = useLibrosGuardados(p.inst.id);
  const estadoSrv = useEstadoCompilacion(p.inst.id);
  const guardarLibro = useGuardarLibro(p.inst.id);
  const quitarLibro = useQuitarLibro(p.inst.id);
  const guardarEstado = useGuardarEstado(p.inst.id);
  const editable = puedeEditar(p.inst.estado, p.actor);

  const [estado, setEstado] = useState<EstadoCompilacion>(ESTADO_VACIO);
  const hidratado = useRef(false);
  const [registro, setRegistro] = useState<{ origen: string; entradas: EntradaRegistro[] } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [filtro, setFiltro] = useState<PropsOrganizar["filtro"]>("todos");
  const [abierto, setAbierto] = useState<Record<string, boolean>>({});
  const [actual, setActual] = useState(0);
  const [origen, setOrigen] = useState(true);
  const [pensar, setPensar] = useState<{ fase: "espera" | "pensando" | "listo" | "error"; pasos: string[]; pensamiento: string; resumen: string }>({ fase: "espera", pasos: [], pensamiento: "", resumen: "" });
  const [pensarAbierto, setPensarAbierto] = useState(false);
  const [trabajo, setTrabajo] = useState<{ clave: string; pasos: string[]; partes: number; palabras: number } | null>(null);
  const [errorRed, setErrorRed] = useState("");
  const control = useRef<AbortController | null>(null);
  const [aprobadas, setAprobadas] = useState<Record<string, boolean>>({});
  const [modo, setModo] = useState<ModoAplicacion>("agregar");
  const [importando, setImportando] = useState(false);
  const [hecho, setHecho] = useState<{ filas: number; secciones: number; textos: number } | null>(null);
  const [aviso, setAviso] = useState("");
  const [pop, setPop] = useState<{ k: string; x: number; y: number } | null>(null);
  const [mood, setMood] = useState("feliz");

  /* ---------- lo guardado: libros y decisiones ---------- */
  useEffect(() => {
    if (hidratado.current || !estadoSrv.data) return;
    hidratado.current = true;
    setEstado(estadoSrv.data);
  }, [estadoSrv.data]);

  // Guardado automático de lo decidido (800 ms, como el informe).
  const ultimo = useRef<string>("");
  useEffect(() => {
    if (!hidratado.current || !editable) return;
    const s = JSON.stringify(estado);
    if (!ultimo.current) {
      ultimo.current = s;
      return;
    }
    if (s === ultimo.current) return;
    const t = setTimeout(() => {
      ultimo.current = s;
      guardarEstado.mutate(estado, { onError: (e) => setAviso(`No se pudo guardar: ${mensajeDe(e)}`) });
    }, 800);
    return () => clearTimeout(t);
  }, [estado, editable, guardarEstado]);

  const libros = useMemo<LibroRecibido[]>(
    () => (guardados.data ?? []).map((g) => ({ ...recibirLibro({ id: g.id, archivo: g.archivo, origen: g.origen, hojas: g.hojas, plantillaInforme: p.inst.plantilla, secciones: p.secciones }), equipo: g.equipo })),
    [guardados.data, p.inst.plantilla, p.secciones],
  );
  const usables = useMemo(() => (estado.adaptar ? libros : libros.filter((l) => !l.plantilla.letra || l.plantilla.letra === p.inst.plantilla)), [libros, estado.adaptar, p.inst.plantilla]);
  const sinAdaptar = estado.adaptar ? 0 : libros.length - usables.length;
  const grupos = useMemo(() => agruparIndicadores(observaciones(usables, p.secciones)), [usables, p.secciones]);
  const cob = useMemo(() => cobertura(usables, p.secciones), [usables, p.secciones]);
  const resumen = useMemo(() => resumenIndicadores(grupos, estado.decisiones), [grupos, estado.decisiones]);
  const redactables = useMemo(() => seccionesRedactables(p.secciones), [p.secciones]);
  const filasTotal = useMemo(() => usables.reduce((n, l) => n + l.libro.bloques.reduce((m, b) => m + b.filas.length, 0), 0), [usables]);

  const datosDe = useCallback(
    (def: SeccionDef) =>
      datosParaPilo({
        unidad: p.unidad,
        anio: p.ciclo.anio,
        plantilla: p.inst.plantilla,
        seccion: def,
        libros: usables,
        grupos,
        decisiones: estado.decisiones,
        secciones: p.secciones,
        textosPrevios: Object.fromEntries(redactables.map((s) => [s.clave, p.contenido(s.clave).texto ?? ""]).filter(([, t]) => t)),
      }),
    [p, usables, grupos, estado.decisiones, redactables],
  );
  const huellas = useMemo(() => Object.fromEntries(redactables.map((s) => [s.clave, huellaDatos(datosDe(s))])), [redactables, datosDe]);
  const desactualizados = useMemo(() => new Set(estado.borradores.filter((b) => b.huella && huellas[b.clave] && b.huella !== huellas[b.clave]).map((b) => b.clave)), [estado.borradores, huellas]);

  /* ---------- paso 1: recibir archivos (sueltos o ZIP) ---------- */
  const recibirArchivos = useCallback(
    async (files: File[]) => {
      if (!files.length || leyendo || !editable) return;
      setLeyendo(true);
      setAviso("");
      type Entrada = { nombre: string; origen: string; leer: () => Promise<ArrayBuffer>; tam?: number };
      const entradas: Entrada[] = [];
      const reg: EntradaRegistro[] = [];
      const nombreRegistro = files.length === 1 ? files[0].name : `${files.length} archivos`;
      try {
        for (const f of files) {
          if (/\.zip$/i.test(f.name)) {
            const { default: JSZip } = await import("jszip");
            const z = await JSZip.loadAsync(f);
            const nombres = Object.keys(z.files).filter((k) => !z.files[k].dir);
            if (nombres.length > TOPE_ENTRADAS) throw new Error(`El ZIP trae ${nombres.length} archivos y el tope es ${TOPE_ENTRADAS}.`);
            for (const n of nombres) entradas.push({ nombre: n, origen: `ZIP: ${f.name}`, leer: () => z.files[n].async("arraybuffer") });
          } else entradas.push({ nombre: f.name, origen: "archivo suelto", leer: () => f.arrayBuffer(), tam: f.size });
        }
        reg.push(...entradas.map((e) => ({ nombre: e.nombre, estado: "leyendo" as const, texto: "Leyendo…" })));
        setRegistro({ origen: files.length === 1 && /\.zip$/i.test(files[0].name) ? files[0].name : nombreRegistro, entradas: [...reg] });
        const marcar = (i: number, x: Partial<EntradaRegistro>) => {
          reg[i] = { ...reg[i], ...x };
          setRegistro((r) => (r ? { ...r, entradas: [...reg] } : r));
        };
        const equiposVistos = new Map(libros.map((l) => [l.equipo.toLowerCase(), l]));
        for (let i = 0; i < entradas.length; i++) {
          const e = entradas[i];
          const c = clasificarEntrada(e.nombre);
          if (c.resultado !== "libro") {
            marcar(i, { estado: c.resultado === "rechazado" ? "rej" : "skip", texto: c.motivo });
            continue;
          }
          try {
            if (e.tam && e.tam > TOPE_ARCHIVO) throw new Error("El archivo pesa más de 25 MB.");
            const buf = await e.leer();
            if (buf.byteLength > TOPE_ARCHIVO) throw new Error("El libro pesa más de 25 MB.");
            const hojas = await leerLibroCompleto(buf);
            const libro = leerLibro(hojas);
            const motivo = motivoDeRechazo(libro, { ciclo: p.ciclo.id, instancia: p.inst.id, anio: p.ciclo.anio });
            if (motivo) {
              marcar(i, { estado: "rej", texto: `Rechazado: ${motivo}` });
              continue;
            }
            const equipo = equipoDe(e.nombre, libro);
            const previo = equiposVistos.get(equipo.toLowerCase());
            if (previo) await quitarLibro.mutateAsync(previo.id);
            await guardarLibro.mutateAsync({ archivo: e.nombre, origen: e.origen, equipo, hojas });
            equiposVistos.set(equipo.toLowerCase(), { ...({} as LibroRecibido), id: "", equipo });
            marcar(i, { estado: "ok", texto: previo ? `Libro de ${equipo}: reemplaza el anterior` : `Libro de ${equipo}` });
          } catch (err) {
            marcar(i, { estado: "rej", texto: `No se pudo leer: ${mensajeDe(err)}` });
          }
        }
        const ok = reg.filter((x) => x.estado === "ok").length;
        setAviso(ok ? `${ok} ${ok === 1 ? "libro recibido" : "libros recibidos"}.` : "No entró ningún libro. Revise los motivos.");
        setMood(ok ? "excelente" : "cuidado");
      } catch (err) {
        setAviso(`No se pudo abrir el archivo: ${mensajeDe(err)}`);
        setMood("cuidado");
      }
      setLeyendo(false);
    },
    [leyendo, editable, libros, p.ciclo.id, p.ciclo.anio, p.inst.id, guardarLibro, quitarLibro],
  );

  /* ---------- paso 2: decisiones ---------- */
  const elegir = (id: string, equipo: string) => setEstado((e) => ({ ...e, decisiones: { ...e.decisiones, [id]: { ...e.decisiones[id], eligio: equipo } } }));
  const renombrar = (id: string, nombre: string) => setEstado((e) => ({ ...e, decisiones: { ...e.decisiones, [id]: { ...e.decisiones[id], nombre: nombre.trim().slice(0, 200) || undefined } } }));

  /* ---------- paso 3: redactar con Astra ---------- */
  const resolver = useCallback(
    (clave: string): Resuelto | null => {
      const g = grupos.find((x) => claveDeGrupo(x) === clave);
      const o = g ? observacionOficial(g, estado.decisiones) : null;
      return g && o && o.actual !== null ? { texto: formatoValor(o.actual, g.unidad), fuente: g.fuentePrimaria } : null;
    },
    [grupos, estado.decisiones],
  );

  const redactarUna = useCallback(
    async (def: SeccionDef): Promise<boolean> => {
      const c = new AbortController();
      control.current = c;
      setErrorRed("");
      setTrabajo({ clave: def.clave, pasos: [], partes: 0, palabras: 0 });
      setPensar({ fase: "pensando", pasos: [], pensamiento: "", resumen: `Redactando «${def.titulo}»` });
      setPensarAbierto(true);
      setMood("piensa");
      try {
        const datos = datosDe(def);
        const r = await redactarSeccion(
          { instancia_id: p.inst.id, nivel: estado.nivel, datos },
          {
            signal: c.signal,
            onStep: (s) => {
              setTrabajo((t) => (t ? { ...t, pasos: [...t.pasos, s.label] } : t));
              setPensar((x) => ({ ...x, pasos: [...x.pasos, s.label] }));
            },
            onThinking: (t) => setPensar((x) => ({ ...x, pensamiento: (x.pensamiento + t).slice(-8000) })),
            onPart: (s) => setTrabajo((t) => (t ? { ...t, partes: s.n, palabras: s.palabras } : t)),
          },
        );
        setEstado((e) => ({
          ...e,
          borradores: [...e.borradores.filter((b) => b.clave !== def.clave), { clave: def.clave, texto: r.texto, aprobado: true, editado: false, huella: huellaDatos(datos), palabras: r.palabras, partes: r.partes, nivel: estado.nivel, pensamientoS: r.pensamiento_s }],
        }));
        setPensar((x) => ({ ...x, fase: "listo", resumen: `Pensó ${String(r.pensamiento_s).replace(".", ",")} s · ${r.palabras} palabras en ${r.partes} ${r.partes === 1 ? "parte" : "partes"}`, pasos: [...x.pasos, ...(r.no_verificado.length ? [`Revise a mano: hay ${r.no_verificado.length} cifras escritas con dígitos fuera de las cifras enlazadas.`] : [])] }));
        setMood("feliz");
        return true;
      } catch (e) {
        const msg = e instanceof ErrorRedaccion ? e.message : "No se pudo redactar la sección.";
        if (!(e instanceof ErrorRedaccion && e.code === "cancelado")) setErrorRed(msg);
        setPensar((x) => ({ ...x, fase: "error", resumen: msg }));
        setMood("cuidado");
        return false;
      } finally {
        setTrabajo(null);
      }
    },
    [datosDe, p.inst.id, estado.nivel],
  );

  const [ocupado, setOcupado] = useState(false);
  const redactar = async (def: SeccionDef) => {
    if (ocupado) return;
    setOcupado(true);
    setActual(Math.max(0, redactables.findIndex((s) => s.clave === def.clave)));
    await redactarUna(def);
    setOcupado(false);
  };
  const redactarTodas = async () => {
    if (ocupado) return;
    setOcupado(true);
    let hechas = 0;
    for (let i = 0; i < redactables.length; i++) {
      const def = redactables[i];
      const b = estado.borradores.find((x) => x.clave === def.clave);
      if (b && !desactualizados.has(def.clave)) continue;
      setActual(i);
      if (!(await redactarUna(def))) break;
      hechas++;
    }
    setOcupado(false);
    if (hechas) setAviso(`Borrador listo: ${hechas} ${hechas === 1 ? "sección" : "secciones"}.`);
  };
  const cancelar = () => control.current?.abort();
  useEffect(() => () => control.current?.abort(), []);

  const cambiarTexto = (clave: string, texto: string) =>
    setEstado((e) => ({ ...e, borradores: e.borradores.map((b) => (b.clave === clave ? { ...b, texto, editado: true, palabras: texto.trim() ? texto.trim().split(/\s+/).length : 0 } : b)) }));

  /* ---------- paso 4: aprobar e importar ---------- */
  const borradoresAprobados = useMemo(() => estado.borradores.map((b) => ({ ...b, aprobado: aprobadas[b.clave] !== false })), [estado.borradores, aprobadas]);
  const seccionesDatos = useMemo(() => new Set(p.secciones.map((s) => s.clave).filter((k) => aprobadas[k] !== false)), [p.secciones, aprobadas]);
  const aprobadosCriterios = useMemo(() => aprobadosParaSeguro(p.aprobados), [p.aprobados]);
  const pilaresOp = useMemo(() => opcionesPilar(p.pilares), [p.pilares]);
  const contenidos = useMemo(() => Object.fromEntries(p.secciones.map((s) => [s.clave, p.contenido(s.clave)])), [p.secciones, p.contenido]);
  const simulacion = useMemo(
    () => (paso === 4 ? compilarAlInforme({ libros: usables, grupos, decisiones: estado.decisiones, secciones: p.secciones, contenidos, aprobados: aprobadosCriterios, pilares: pilaresOp, anexos: p.anexos, modo, estado: p.inst.estado, rol: p.actor, seccionesDatos, borradores: borradoresAprobados }) : null),
    [paso, usables, grupos, estado.decisiones, p.secciones, contenidos, aprobadosCriterios, pilaresOp, p.anexos, modo, p.inst.estado, p.actor, seccionesDatos, borradoresAprobados],
  );
  const filasAprobar = useMemo(
    () =>
      p.secciones
        .map((s) => {
          const c = cob.secciones.find((x) => x.clave === s.clave);
          const b = estado.borradores.find((x) => x.clave === s.clave);
          return { clave: s.clave, titulo: s.titulo, filas: c ? Object.values(c.porEquipo).reduce((a, n) => a + n, 0) : 0, tieneTexto: !!b, editado: !!b?.editado, viejo: desactualizados.has(s.clave) };
        })
        .filter((f) => f.filas || f.tieneTexto),
    [p.secciones, cob, estado.borradores, desactualizados],
  );

  const importar = async () => {
    if (!simulacion || simulacion.bloqueado || importando) return;
    if (modo === "reemplazar") {
      const nombres = Object.keys(simulacion.contenidos).map((c) => p.secciones.find((s) => s.clave === c)?.titulo).filter(Boolean).join(", ");
      if (!window.confirm(`Reemplaza lo escrito en: ${nombres || "las secciones importadas"}. Las evidencias no se reemplazan. ¿Continuar?`)) return;
    }
    setImportando(true);
    setAviso("");
    try {
      for (const [clave, c] of Object.entries(simulacion.contenidos)) {
        const def = p.secciones.find((s) => s.clave === clave);
        if (def) p.escribir(def, c);
      }
      if (simulacion.evidencias.length) await p.agregarEvidencias(simulacion.evidencias);
      setHecho({ filas: simulacion.filas, secciones: Object.keys(simulacion.contenidos).length, textos: simulacion.textosDePilo });
      setMood("excelente");
    } catch (e) {
      setAviso(`No se pudo importar: ${mensajeDe(e)}`);
    }
    setImportando(false);
  };

  /* ---------- exportar lo organizado a Excel ---------- */
  const exportarExcel = async () => {
    const col = (titulo: string, ancho = 28) => ({ titulo, ancho });
    const hojas: HojaExcel[] = [
      {
        nombre: "Indicadores",
        columnas: [col("Criterio"), col("Nombre unificado", 44), col("Valor oficial", 16), col("Unidad", 10), col("Fuente primaria", 34), col("Quién lo reportó y cómo lo escribió", 70), col("Estado", 14)],
        filas: grupos.map((g) => {
          const o = observacionOficial(g, estado.decisiones);
          return [g.criterio, nombreOficial(g, estado.decisiones), o?.actual ?? "sin dato", g.unidad, g.fuentePrimaria, g.obs.map((x) => `${x.equipo}: «${x.texto}» = ${x.actualCrudo || "—"}`).join(" | "), { unico: "Listo", unificado: "Unificado", conflicto: "Conflicto", sin_dato: "Sin dato" }[estadoGrupo(g, estado.decisiones)]];
        }),
      },
      { nombre: "Cobertura", columnas: [col("Sección", 40), ...cob.equipos.map((e) => col(e, 18))], filas: cob.secciones.map((s) => [s.titulo, ...cob.equipos.map((e) => s.porEquipo[e] ?? "")]) },
      { nombre: "Plantillas", columnas: [col("Equipo"), col("Libro", 50), col("Plantilla detectada", 18), col("Plantilla del informe", 18), col("Adaptada", 14)], filas: libros.map((l) => [l.equipo, l.archivo, l.plantilla.letra ?? "sin reconocer", p.inst.plantilla, l.plantilla.letra && l.plantilla.letra !== p.inst.plantilla ? (estado.adaptar ? "Sí" : "No") : "No hace falta"]) },
      { nombre: "Borradores", columnas: [col("Sección", 36), col("Palabras", 10), col("Texto", 120)], filas: redactables.map((s) => { const b = estado.borradores.find((x) => x.clave === s.clave); return [s.titulo, b?.palabras ?? 0, b ? partesTexto(b.texto, resolver).map((x) => (x.tipo === "texto" ? x.texto : x.tipo === "cifra" ? x.texto : "sin dato")).join("") : "Sin redactar"]; }) },
    ];
    try {
      await descargarLibro(`Compilado_${p.unidad.replace(/[^\p{L}\p{N}]+/gu, "_")}_${p.ciclo.anio}.xlsx`, hojas);
      setAviso("Se descargó lo organizado en un libro de Excel.");
    } catch (e) {
      setAviso(`No se pudo exportar: ${mensajeDe(e)}`);
    }
  };

  /* ---------- navegación ---------- */
  const puedeSeguir = paso === 1 ? usables.length >= 1 && sinAdaptar === 0 : paso === 2 ? true : paso === 3 ? estado.borradores.length > 0 : false;
  const ir = (n: number) => {
    if (n < 1 || n > 4 || (n > maxPaso && n !== paso + 1)) return;
    setMaxPaso((m) => Math.max(m, n));
    setPaso(n);
    setPop(null);
    setMood(n === 1 ? "feliz" : n === 2 ? (resumen.conflictos ? "cuidado" : "excelente") : n === 3 ? "feliz" : "feliz");
  };
  const irImportar = () => {
    if (paso === 4) return void importar();
    if (estado.borradores.length || usables.length) {
      setMaxPaso(4);
      setPaso(4);
      return;
    }
    setAviso("Primero reciba los libros, organice los datos y redacte con Pilo.");
  };

  useEffect(() => {
    const el = raiz.current;
    el?.focus();
    const sobre = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sobre;
      if (document.fullscreenElement) void document.exitFullscreen?.();
    };
  }, []);

  const pantallaCompleta = () => {
    const el = raiz.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen?.().catch(() => setAviso("Su navegador no permite la pantalla completa aquí."));
    } catch {
      setAviso("Su navegador no permite la pantalla completa aquí.");
    }
  };

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (pop) return setPop(null);
      if (document.fullscreenElement) return;
      e.stopPropagation();
      p.onCerrar();
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest("[contenteditable='true'],input,textarea,select")) return;
    if (e.key === "ArrowRight" && puedeSeguir && paso < 4) ir(paso + 1);
    if (e.key === "ArrowLeft" && paso > 1) ir(paso - 1);
  };

  // El aviso se va solo; la entrada de los pasos la anima cada paso.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 4200);
    return () => clearTimeout(t);
  }, [aviso]);
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (barra.current) gsap.to(barra.current, { scaleX: reducir() ? (paso - 1) / 3 + 0.04 : (paso - 1) / 3 + 0.04, duration: reducir() ? 0 : 0.5, ease: "expo.out" });
  }, [paso]);

  /* ---------- Pilo, a la derecha ---------- */
  const dice = (() => {
    if (paso === 1) return libros.length ? <>Recibí <b>{libros.length}</b> {libros.length === 1 ? "libro" : "libros"}{usables.length !== libros.length ? `, de los cuales ${usables.length} entran` : ""}. {libros.some((l) => l.plantilla.letra && l.plantilla.letra !== p.inst.plantilla) && estado.adaptar ? <>Reconocí la plantilla de cada uno y adapté los que venían en otra. </> : null}Siga a organizar cuando estén todos; lo que no llegue lo marcaré como «sin dato».</> : <>Suba los libros de sus equipos, o un ZIP con todos. Reconozco la plantilla de cada uno y la adapto si hace falta.</>;
    if (paso === 2) return <>Reuní <b>{grupos.length}</b> indicadores. {resumen.conflictos ? <><b>{resumen.conflictos}</b> {resumen.conflictos === 1 ? "tiene valores distintos entre equipos" : "tienen valores distintos entre equipos"}: abra el indicador y elija el valor, o use el de la fuente primaria.</> : grupos.length ? "No quedan conflictos." : "Los libros no traen cifras en Resultados."}{resumen.sinDato ? ` ${resumen.sinDato} sin dato.` : ""}</>;
    if (paso === 3) { const n = estado.borradores.filter((b) => redactables.some((s) => s.clave === b.clave)).length; return n ? <>Llevo <b>{n} de {redactables.length}</b> secciones. Toque cualquier cifra para ver quién la aportó. Puede escribir encima del texto.</> : <>Elija el nivel de razonamiento y pulse <b>Redactar</b>. Escribo con lo que organizamos, sin inventar cifras y sin tope de longitud.</>; }
    return <>Revise qué pasa al informe. Después de importar usted sigue editando todo en <b>Mi informe</b>: mis textos quedan marcados como borrador hasta que los toque.</>;
  })();

  const abrirPop = (k: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    let y = r.bottom + 8;
    if (y + 240 > innerHeight) y = r.top - 248;
    setPop({ k, x: Math.max(8, Math.min(r.left, innerWidth - 320)), y: Math.max(8, y) });
  };
  const popGrupo: Grupo | undefined = pop ? grupos.find((g) => claveDeGrupo(g) === pop.k) : undefined;
  const popObs = popGrupo ? observacionOficial(popGrupo, estado.decisiones) : null;

  return (
    <div ref={raiz} className="cp" role="dialog" aria-modal="true" aria-label="Compilar informe de colaboradores con Pilo" tabIndex={-1} onKeyDown={teclado} onClick={() => pop && setPop(null)}>
      <header className="cp-top">
        <img className="cp-logo" src={`${BASE}logo-udes-blanco.png`} alt="Universidad de Santander" />
        <i className="cp-sep" />
        <div className="cp-tt">
          <b>Compilar informe de colaboradores con Pilo</b>
          <span>
            {p.unidad} · Informe de gestión {p.ciclo.anio} · Plantilla {p.inst.plantilla}
          </span>
        </div>
        <div className="cp-acts">
          <button type="button" className="cp-ibtn" onClick={() => void exportarExcel()} disabled={!libros.length && !estado.borradores.length} title="Descargar lo organizado como libro de Excel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></svg>
            <span className="l">Exportar Excel</span>
          </button>
          <button type="button" className="cp-ibtn is-pri" onClick={irImportar} disabled={!editable} title="Aprobar lo compilado y llevarlo al informe">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20V9m0 0-4 4m4-4 4 4" /><path d="M4 5h16" /></svg>
            <span className="l">Importar al informe</span>
          </button>
          <button type="button" className="cp-ibtn is-fs" onClick={pantallaCompleta} aria-label="Pantalla completa">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            <span className="l">Pantalla completa</span>
          </button>
          <button type="button" className="cp-ibtn" onClick={p.onCerrar} aria-label="Cerrar el compilador">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            <span className="l">Cerrar</span>
          </button>
        </div>
      </header>

      <nav className="cp-steps" aria-label="Pasos de la compilación">
        {PASOS.map(([t, s], i) => {
          const n = i + 1;
          const hecho = n < maxPaso && n !== paso || n < paso;
          return (
            <button key={t} type="button" className={`cp-stp${n === paso ? " is-on" : ""}${hecho && n !== paso ? " is-done" : ""}`} disabled={n > maxPaso && n !== paso + 1 || (n === paso + 1 && !puedeSeguir)} aria-current={n === paso ? "step" : undefined} onClick={() => ir(n)}>
              <span className="n">{hecho && n !== paso ? "✓" : n}</span>
              <span className="tx"><b>{t}</b><small>{s}</small></span>
            </button>
          );
        })}
        <div ref={barra} className="cp-bar" style={{ transform: "scaleX(.04)" }} />
      </nav>

      <div className="cp-work">
        <main className="cp-stage">
          {!editable && <p className="cp-aviso">Este informe no se puede editar ahora ({p.inst.estado === "sent" ? "ya se envió" : p.inst.estado === "ok" ? "ya está aprobado" : "su papel solo permite leer"}). Puede mirar lo compilado, pero no cargar ni importar.</p>}
          {(guardados.error || estadoSrv.error) && <p className="cp-aviso is-bad" role="alert">{mensajeDe(guardados.error ?? estadoSrv.error)}</p>}
          {errorRed && <p className="cp-aviso is-bad" role="alert">{errorRed}</p>}
          {paso === 1 && <PasoRecibir libros={libros} plantillaInforme={p.inst.plantilla} adaptar={estado.adaptar} setAdaptar={(v) => setEstado((e) => ({ ...e, adaptar: v }))} editable={editable} ocupado={leyendo} registro={registro} abrirSelector={() => selector.current?.click()} soltar={(f) => void recibirArchivos(f)} quitar={(id) => quitarLibro.mutate(id)} sinAdaptar={sinAdaptar} />}
          {paso === 2 && <PasoOrganizar grupos={grupos} decisiones={estado.decisiones} cobertura={cob} filtro={filtro} setFiltro={setFiltro} abierto={abierto} alternar={(id) => setAbierto((a) => ({ ...a, [id]: !a[id] }))} elegir={elegir} renombrar={renombrar} resumen={resumen} editable={editable} />}
          {paso === 3 && <PasoRedactar secciones={redactables} actual={Math.min(actual, Math.max(0, redactables.length - 1))} elegirSeccion={setActual} borradores={estado.borradores} desactualizados={desactualizados} trabajo={trabajo} ocupado={ocupado} origen={origen} setOrigen={setOrigen} resolver={resolver} editable={editable} redactar={(d) => void redactar(d)} redactarTodas={() => void redactarTodas()} cancelar={cancelar} cambiarTexto={cambiarTexto} onCifra={abrirPop} imagen={imagen} filasTotal={filasTotal} />}
          {paso === 4 && <PasoAprobar filas={filasAprobar} aprobadas={aprobadas} alternar={(k, v) => setAprobadas((a) => ({ ...a, [k]: v }))} modo={modo} setModo={setModo} resumen={{ filas: simulacion?.filas ?? 0, secciones: (simulacion?.seccionesConDatos ?? 0) + (simulacion?.textosDePilo ? 0 : 0) || Object.keys(simulacion?.contenidos ?? {}).length, textos: simulacion?.textosDePilo ?? 0, avisos: simulacion?.avisos ?? [], bloqueado: simulacion?.bloqueado }} importar={() => void importar()} importando={importando} editable={editable} />}
          <input ref={selector} type="file" multiple hidden accept=".xlsx,.xls,.csv,.zip" onChange={(e) => { void recibirArchivos([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </main>

        <aside className="cp-side" aria-label="Pilo Astra">
          <div className="cp-pilo">
            <img src={imagen(mood)} alt="Pilo" />
            <div>
              <b>Pilo Astra 1.0</b>
              <span className="cp-badge"><i />Razona antes de escribir</span>
            </div>
          </div>
          <div className="cp-say" aria-live="polite">{dice}</div>
          <div className="cp-lvl">
            <span className="cp-lab">Nivel de razonamiento</span>
            <div className="cp-seg" role="radiogroup" aria-label="Nivel de razonamiento">
              {NIVELES.map((n) => (
                <button key={n.id} type="button" role="radio" aria-checked={estado.nivel === n.id} disabled={!editable || ocupado} onClick={() => setEstado((e) => ({ ...e, nivel: n.id }))}>
                  {n.t}
                </button>
              ))}
            </div>
            <small>{NIVELES.find((n) => n.id === estado.nivel)?.ayuda}</small>
          </div>
          <div className="cp-think" data-fase={pensar.fase} data-open={pensarAbierto ? "1" : "0"}>
            <button type="button" aria-expanded={pensarAbierto} onClick={() => setPensarAbierto((v) => !v)}>
              <span className="d" />
              <span>{pensar.fase === "pensando" ? "Pilo está pensando…" : pensar.fase === "espera" ? "Cómo pensó Pilo" : pensar.resumen}</span>
              <span className="ch" />
            </button>
            {pensarAbierto && (
              <div className="tb">
                <ol>
                  {pensar.pasos.length ? pensar.pasos.map((s, i) => <li key={i}>{s}</li>) : <li>Aún no he redactado nada. Cuando lo haga, aquí queda cada paso.</li>}
                </ol>
                {pensar.pensamiento && <pre aria-label="Razonamiento de Astra, tal cual">{pensar.pensamiento}</pre>}
              </div>
            )}
          </div>
          <div className="cp-legend">
            <p><b>Regla de Pilo:</b> no inventa cifras. Todo número del texto es una cifra enlazada a su fuente; lo que ningún equipo entregó queda como «sin dato».</p>
            <p><b>Sin tope fijo de longitud:</b> Pilo escribe cada sección por partes, tan largas como lo pidan los datos, y las une.</p>
          </div>
        </aside>
      </div>

      <footer className="cp-foot">
        <button type="button" className="cp-btn is-gho" onClick={() => ir(paso - 1)} style={{ visibility: paso === 1 ? "hidden" : "visible" }}>Atrás</button>
        <span className="cp-gap" />
        <span className="hint">
          {paso === 1 ? (sinAdaptar ? `${sinAdaptar} libro(s) de otra plantilla sin adaptar. Active la adaptación para seguir.` : !libros.length ? "Suba al menos un libro para seguir." : "") : paso === 2 ? (resumen.conflictos ? `${resumen.conflictos} conflicto sin resolver. Puede seguir, pero Pilo no usará ese dato.` : "Todo organizado y sin conflictos.") : paso === 3 ? `${estado.borradores.filter((b) => redactables.some((s) => s.clave === b.clave)).length} de ${redactables.length} secciones redactadas.` : ""}
        </span>
        {paso < 4 && <button type="button" className="cp-btn is-pri" disabled={!puedeSeguir} onClick={() => ir(paso + 1)}>{["Organizar los datos", "Redactar con Pilo", "Revisar y aprobar"][paso - 1]}</button>}
      </footer>

      {pop && (
        <div className="cp-pop" style={{ left: pop.x, top: pop.y }} role="dialog" aria-label="De dónde sale este dato" onClick={(e) => e.stopPropagation()}>
          <h5>De dónde sale este dato</h5>
          {popGrupo ? (
            <dl>
              <dt>Dato</dt><dd>{nombreOficial(popGrupo, estado.decisiones)}</dd>
              <dt>Valor</dt><dd>{popObs?.actual != null ? formatoValor(popObs.actual, popGrupo.unidad) : "sin dato"}</dd>
              <dt>Aportó</dt><dd>{popObs?.equipo ?? "Nadie todavía"}</dd>
              <dt>Escribió</dt><dd>{popObs ? `«${popObs.texto}»` : "—"}</dd>
              <dt>Hoja y fila</dt><dd>{popObs ? `${popObs.hoja}, fila ${popObs.fila}` : "—"}</dd>
              <dt>Fuente primaria</dt><dd>{popGrupo.fuentePrimaria || "—"}</dd>
              {popGrupo.obs.length > 1 && popObs && <><dt>Otro equipo</dt><dd>{popGrupo.obs.filter((o) => o !== popObs).map((o) => `${o.equipo}: ${o.actual !== null ? formatoValor(o.actual, o.unidad) : "sin número"}`).join(", ")}</dd></>}
            </dl>
          ) : <p>Este dato ya no está entre los indicadores organizados.</p>}
        </div>
      )}

      {hecho && (
        <div className="cp-ov" role="dialog" aria-modal="true" aria-labelledby="cp-ok-t">
          <div className="cp-modal">
            <img src={imagen("excelente")} alt="" width={72} height={72} />
            <h3 id="cp-ok-t">Listo: el informe ya tiene los datos</h3>
            <p style={{ color: "var(--cp-ink-2)" }}>Modo aplicado: «{modo === "agregar" ? "Agregar al final" : modo === "vacios" ? "Llenar solo lo vacío" : "Reemplazar la sección"}». Los datos aprobados ya están en el informe de {p.unidad}.</p>
            <div className="cp-res">
              <div><b>{hecho.filas}</b><span>filas agregadas</span></div>
              <div><b>{hecho.secciones}</b><span>secciones con cambios</span></div>
              <div><b>{hecho.textos}</b><span>textos «Borrador de Pilo»</span></div>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--cp-ink-2)" }}>En Mi informe cada texto lleva la marca <span className="cp-mark">Borrador de Pilo</span> hasta que usted lo edite. Cada cifra sigue enlazada a su fuente.</p>
            <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              <button type="button" className="cp-btn is-pri" onClick={p.onCerrar} autoFocus>Ir a Mi informe</button>
              <button type="button" className="cp-btn is-gho" onClick={() => setHecho(null)}>Seguir en el compilador</button>
            </div>
          </div>
        </div>
      )}
      {aviso && <div className="cp-toast" role="status">{aviso}</div>}
    </div>
  );
}

export default Compilador;

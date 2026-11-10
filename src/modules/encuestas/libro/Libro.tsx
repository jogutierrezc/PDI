/* =============================================================================
   Libro de la Rendición de Cuentas · la vista (pestaña «Libro» de la encuesta).

   A la izquierda se configura (formato, páginas, portada, datos, narrativa); a la
   derecha se ve el libro abierto, con paso de página y texto editable sobre la
   hoja. La configuración se guarda sola (enc_libros, 0274). Los datos salen de los
   aportes de la encuesta: solo totales y cifras por dependencia.
   Imprimir: una hoja por página en el tamaño elegido, con sangrado opcional de 3 mm.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import gsap from "gsap";
import { ErrorBlock } from "../../../components/ui/QueryState";
import { EASE_OUT, reducedMotion } from "../../impacto/pilo/motion";
import { useAportes } from "../datos";
import type { Encuesta } from "../tipos";
import { FaltaMigracionLibro, clasificarOds, estadoPilo, guardarLibro, leerLibro, narrarConPilo, quitarImagen, subirImagen, urlImagen, validarImagen } from "./api";
import { CtxLibro, Hoja, HojaVacia } from "./Hoja";
import type { CtxHoja } from "./Hoja";
import { CLAVES_TEXTO, FORMATOS, MAX_MODULOS, MIN_PAGINAS, MAX_PAGINAS, MODULOS, PALETAS, calcular, datosDePagina, dependenciasDe, filasDe, nombrePagina, paginasDe, pliegos, sinTextosViejos } from "./modelo";
import type { ConfigLibro, FiltroEstado, IdModulo } from "./modelo";
import "./libro.css";

interface Props {
  encuesta: Encuesta;
  puedeEditar: boolean;
  decir: (texto: string) => void;
}

type Giro = { a: number; b: number };

const MIN_MODULOS_ACTIVOS = MIN_PAGINAS - 2;

export function Libro({ encuesta, puedeEditar, decir }: Props) {
  const libro = useQuery({ queryKey: ["encuestas", "libro", encuesta.id], queryFn: () => leerLibro(encuesta.id), retry: false, staleTime: Infinity, refetchOnWindowFocus: false });
  const aportes = useAportes(encuesta.id);
  const piloEstado = useQuery({ queryKey: ["encuestas", "libro-pilo", encuesta.id], queryFn: () => estadoPilo(encuesta.id), retry: false, staleTime: 60_000, enabled: puedeEditar });

  if (libro.isPending || aportes.isPending) return <p className="admin-loading">Abriendo el libro…</p>;
  if (libro.error) return libro.error instanceof FaltaMigracionLibro ? <p className="en-nota" role="alert">{libro.error.message} Aplíquela en Supabase y vuelva a esta pestaña.</p> : <ErrorBlock error={libro.error} />;
  if (aportes.error) return <ErrorBlock error={aportes.error} />;
  return <Editor encuesta={encuesta} puedeEditar={puedeEditar} decir={decir} inicial={libro.data.config} aportes={aportes.data} pilo={piloEstado.data ?? null} />;
}

function Editor({ encuesta, puedeEditar, decir, inicial, aportes, pilo }: Props & { inicial: ConfigLibro; aportes: NonNullable<ReturnType<typeof useAportes>["data"]>; pilo: { ai: boolean; motivo?: string } | null }) {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<ConfigLibro>(inicial);
  const [cur, setCur] = useState(0);
  const [giro, setGiro] = useState<Giro | null>(null);
  const [guias, setGuias] = useState(false);
  const [guardado, setGuardado] = useState<"ok" | "guardando" | "pendiente" | "error">("ok");
  const [urls, setUrls] = useState<{ portada: string | null; contra: string | null }>({ portada: null, contra: null });
  const [trabajando, setTrabajando] = useState<null | "texto" | "ods" | "imagen">(null);
  const [avisoPilo, setAvisoPilo] = useState<{ texto: string; error?: boolean } | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [ancho, setAncho] = useState(900);
  const desk = useRef<HTMLDivElement>(null);
  const spread = useRef<HTMLDivElement>(null);
  const ultimo = useRef(JSON.stringify(inicial));
  const archivoPortada = useRef<HTMLInputElement>(null);
  const archivoContra = useRef<HTMLInputElement>(null);

  /* ---- derivados ---- */
  const filas = useMemo(() => filasDe(aportes, cfg), [aportes, cfg.estado, cfg.excluidas, cfg.ods]); // eslint-disable-line react-hooks/exhaustive-deps
  const calc = useMemo(() => calcular(filas), [filas]);
  const paginas = useMemo(() => paginasDe(cfg), [cfg.orden, cfg.activas]); // eslint-disable-line react-hooks/exhaustive-deps
  const vista = ancho < 560 ? "hoja" : cfg.vista;
  const lista = useMemo(() => pliegos(paginas.length, vista), [paginas.length, vista]);
  const actual = Math.min(cur, lista.length - 1);
  const dependencias = useMemo(() => dependenciasDe(aportes), [aportes]);
  const resumen = { total: paginas.length, notas: paginas.includes("notas") };

  const cambiar = useCallback((f: (c: ConfigLibro) => ConfigLibro) => setCfg((c) => f(c)), []);
  /** Cambios que dejan viejos los textos de Pilo (filtros, tono, extensión). */
  const cambiarDatos = useCallback((f: (c: ConfigLibro) => ConfigLibro) => setCfg((c) => {
    const n = f(c);
    return { ...n, textos: sinTextosViejos(n.textos) };
  }), []);

  /* ---- guardado automático ---- */
  useEffect(() => {
    if (!puedeEditar) return;
    const s = JSON.stringify(cfg);
    if (s === ultimo.current) return;
    setGuardado("pendiente");
    const t = window.setTimeout(() => {
      setGuardado("guardando");
      guardarLibro(encuesta.id, cfg).then(
        () => {
          ultimo.current = s;
          setGuardado("ok");
          qc.setQueryData(["encuestas", "libro", encuesta.id], { config: cfg, guardado: true });
        },
        (e: Error) => {
          setGuardado("error");
          decir(`No se pudo guardar el libro: ${e.message}`);
        },
      );
    }, 1200);
    return () => window.clearTimeout(t);
  }, [cfg, puedeEditar, encuesta.id, qc, decir]);

  /* ---- imágenes (el bucket es privado: URL firmada) ---- */
  useEffect(() => {
    let vivo = true;
    void Promise.all([cfg.portada.imagen ? urlImagen(cfg.portada.imagen) : null, cfg.portada.contraImagen ? urlImagen(cfg.portada.contraImagen) : null]).then(([portada, contra]) => vivo && setUrls({ portada, contra }));
    return () => {
      vivo = false;
    };
  }, [cfg.portada.imagen, cfg.portada.contraImagen]);

  /* ---- medida del escritorio ---- */
  useLayoutEffect(() => {
    const el = desk.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ar = FORMATOS[cfg.formato].ancho / FORMATOS[cfg.formato].alto;
  const alto = Math.max(480, Math.min(window.innerHeight - 230, 880));
  const pw = Math.floor(Math.min(vista === "hoja" ? ancho - 24 : (ancho - 24) / 2, alto * ar));

  /* ---- navegación y paso de página ---- */
  const ir = useCallback(
    (b: number) => {
      if (giro || b === actual || b < 0 || b >= lista.length) return;
      if (vista === "hoja" || reducedMotion()) {
        setCur(b);
        return;
      }
      setGiro({ a: actual, b });
    },
    [giro, actual, lista.length, vista],
  );

  useLayoutEffect(() => {
    if (!giro || !spread.current) return;
    const dir = giro.b > giro.a ? 1 : -1;
    const raiz = spread.current;
    const sale = raiz.querySelector<HTMLElement>('[data-rol="sale"]');
    const entra = raiz.querySelector<HTMLElement>('[data-rol="entra"]');
    if (!sale || !entra) {
      setCur(giro.b);
      setGiro(null);
      return;
    }
    const sombra = (el: HTMLElement) => el.querySelector<HTMLElement>(".lb-sombra");
    gsap.set(sale, { transformOrigin: dir > 0 ? "left center" : "right center" });
    gsap.set(entra, { transformOrigin: dir > 0 ? "right center" : "left center", scaleX: 0 });
    const tl = gsap.timeline({ onComplete: () => { setCur(giro.b); setGiro(null); } });
    tl.to(sale, { scaleX: 0, duration: 0.3, ease: "power2.in" }, 0)
      .to(sombra(sale), { opacity: 0.4, duration: 0.3, ease: "power2.in" }, 0)
      .to(entra, { scaleX: 1, duration: 0.34, ease: "power2.out" }, 0.3)
      .fromTo(sombra(entra), { opacity: 0.35 }, { opacity: 0, duration: 0.34 }, 0.3);
    return () => {
      tl.kill();
    };
  }, [giro]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|SELECT|TEXTAREA/.test(t.tagName) || t.isContentEditable) return;
      if (e.key === "ArrowRight") ir(actual + 1);
      if (e.key === "ArrowLeft") ir(actual - 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ir, actual]);

  /* ---- entrada de la hoja: cascada corta y cifras que suben ---- */
  useEffect(() => {
    if (giro || reducedMotion() || !spread.current) return;
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(spread.current);
      const t = gsap.timeline({ defaults: { ease: EASE_OUT } });
      t.from(q(".lb-ttl, .lb-hd, .lb-marca, .lb-bk h2"), { y: 10, opacity: 0, duration: 0.45, stagger: 0.05 }, 0);
      t.from(q(".lb-nar, .lb-s1, .lb-s2, .lb-pilo, .lb-lg"), { y: 8, opacity: 0, duration: 0.45, stagger: 0.04 }, 0.1);
      t.from(q(".lb-col"), { opacity: 0, duration: 0.25, stagger: 0.025 }, 0.1);
      t.from(q(".lb-sq.l, .lb-sq.r"), { scale: 0.6, opacity: 0, duration: 0.3, stagger: { amount: 0.6, from: "random" } }, 0.2);
      t.from(q(".lb-anillo"), { rotation: -50, opacity: 0, transformOrigin: "50% 50%", duration: 0.7 }, 0.12);
      t.from(q(".lb-tr b, .lb-hbar b, .lb-stack b, .lb-dv .lb-r b, .lb-z b"), { scaleX: 0, duration: 0.6, stagger: 0.04 }, 0.22);
      t.from(q(".lb-dv .lb-l b"), { scaleX: 0, duration: 0.6, stagger: 0.04 }, 0.22);
      t.from(q(".lb-feat, .lb-rc, .lb-fi, .lb-ot, .lb-cel, .lb-kpis li, .lb-puntos, .lb-idx li, .lb-rest li"), { y: 8, opacity: 0, duration: 0.4, stagger: 0.025 }, 0.18);
      for (const el of q("[data-n]") as HTMLElement[]) {
        const n = Number(el.dataset.n);
        const fin = el.textContent ?? "";
        if (!Number.isFinite(n) || n <= 0) continue;
        const f = el.dataset.fmt;
        const o = { v: 0 };
        gsap.to(o, {
          v: n,
          duration: 0.8,
          delay: 0.15,
          ease: EASE_OUT,
          onUpdate: () => {
            const x = Math.round(o.v);
            const t = new Intl.NumberFormat("es-CO").format(x);
            el.textContent = f === "pct" ? `${t} %` : f === "din" ? (n >= 1_000_000 ? `$ ${new Intl.NumberFormat("es-CO").format(Math.round(o.v / 1_000_000))} M` : `$ ${t}`) : t;
          },
          onComplete: () => {
            el.textContent = fin;
          },
        });
      }
    }, spread);
    return () => ctx.revert();
  }, [actual, giro, vista, cfg.formato, calc, paginas.length]);

  /* ---- texto ---- */
  const onTexto = useCallback((clave: string, t: string) => cambiar((c) => ({ ...c, textos: { ...c.textos, [clave]: { t: t.slice(0, 900), editado: true } } })), [cambiar]);

  const ctx: CtxHoja = useMemo(() => ({ calc, cfg, paginas, urls, onTexto, editable: puedeEditar, guias }), [calc, cfg, paginas, urls, onTexto, puedeEditar, guias]);

  /* ---- Pilo ---- */
  const redactar = async () => {
    const claves = paginas.filter((p) => (CLAVES_TEXTO as readonly string[]).includes(p) && !cfg.textos[p]?.editado);
    const pedido = claves.map((p) => ({ clave: p, pagina: nombrePagina(p), datos: datosDePagina(p, calc, cfg) })).filter((p) => p.datos.length > 0);
    if (!pedido.length) {
      setAvisoPilo({ texto: "No hay datos para redactar con los filtros actuales." });
      return;
    }
    setTrabajando("texto");
    setAvisoPilo(null);
    try {
      const textos = await narrarConPilo(encuesta.id, pedido, cfg.tono, cfg.largo);
      cambiar((c) => {
        const n = { ...c.textos };
        for (const [k, t] of Object.entries(textos)) if (!n[k]?.editado) n[k] = { t, editado: false };
        return { ...c, textos: n };
      });
      setAvisoPilo({ texto: `Pilo redactó ${Object.keys(textos).length} textos con las cifras de cada página. Revíselos antes de imprimir.` });
    } catch (e) {
      setAvisoPilo({ texto: `${(e as Error).message} Mientras tanto el libro usa los textos de plantilla.`, error: true });
    } finally {
      setTrabajando(null);
    }
  };
  const clasificar = async () => {
    const lote = filas.map((a) => ({ id: a.id, tipo: a.t === "L" ? ("logro" as const) : ("reto" as const), titulo: a.ti, descripcion: a.de, dependencia: a.dep }));
    if (!lote.length) {
      setAvisoPilo({ texto: "No hay aportes para clasificar con los filtros actuales." });
      return;
    }
    setTrabajando("ods");
    setAvisoPilo(null);
    try {
      const ods = await clasificarOds(encuesta.id, lote);
      cambiarDatos((c) => ({ ...c, ods: { ...c.ods, ...ods } }));
      setAvisoPilo({ texto: `Pilo clasificó ${Object.keys(ods).length} aportes. Una persona debe confirmar la clasificación antes de publicar.` });
    } catch (e) {
      setAvisoPilo({ texto: (e as Error).message, error: true });
    } finally {
      setTrabajando(null);
    }
  };

  /* ---- imágenes ---- */
  const subir = async (cara: "portada" | "contra", f: File | undefined) => {
    if (!f) return;
    const mal = validarImagen(f);
    if (mal) {
      setAvisoPilo({ texto: mal, error: true });
      return;
    }
    setTrabajando("imagen");
    setAvisoPilo(null);
    try {
      const ruta = await subirImagen(encuesta.id, cara, f);
      const antes = cara === "portada" ? cfg.portada.imagen : cfg.portada.contraImagen;
      cambiar((c) => ({ ...c, portada: { ...c.portada, [cara === "portada" ? "imagen" : "contraImagen"]: ruta } }));
      if (antes) void quitarImagen(antes);
      setAvisoPilo({ texto: cara === "portada" ? "Portada cargada. Cubre la hoja completa." : "Contraportada cargada. Cubre la hoja completa." });
    } catch (e) {
      setAvisoPilo({ texto: (e as Error).message, error: true });
    } finally {
      setTrabajando(null);
    }
  };
  const quitar = async (cara: "portada" | "contra") => {
    const ruta = cara === "portada" ? cfg.portada.imagen : cfg.portada.contraImagen;
    cambiar((c) => ({ ...c, portada: { ...c.portada, [cara === "portada" ? "imagen" : "contraImagen"]: null } }));
    if (ruta) await quitarImagen(ruta);
  };

  /* ---- impresión ---- */
  useEffect(() => {
    if (!imprimiendo) return;
    const f = FORMATOS[cfg.formato];
    const sg = cfg.sangrado ? 3 : 0;
    const estilo = document.createElement("style");
    estilo.setAttribute("data-libro", "1");
    estilo.textContent = `@page { size: ${f.ancho + sg * 2}mm ${f.alto + sg * 2}mm; margin: 0; }`;
    document.head.appendChild(estilo);
    let ok = true;
    const limpiar = () => {
      document.body.classList.remove("lb-imprimiendo");
      estilo.remove();
      window.removeEventListener("afterprint", limpiar);
      if (ok) setImprimiendo(false);
    };
    (async () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(".lb-print-root img"));
      await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!ok) return;
      document.body.classList.add("lb-imprimiendo");
      window.addEventListener("afterprint", limpiar);
      window.print();
    })();
    return () => {
      ok = false;
      document.body.classList.remove("lb-imprimiendo");
      estilo.remove();
      window.removeEventListener("afterprint", limpiar);
    };
  }, [imprimiendo, cfg.formato, cfg.sangrado]);

  /* ---- lo que se pinta ---- */
  const capa = (i: number, rol: "base" | "sale" | "entra") => (
    <div className="lb-capa" data-rol={rol} key={`${rol}-${i}`} style={{ zIndex: rol === "base" ? 0 : rol === "sale" ? 3 : 4 }}>
      {i < 0 ? <HojaVacia /> : <Hoja id={paginas[i]} indice={i} />}
      {rol !== "base" && <div className="lb-sombra" style={{ position: "absolute", inset: 0, background: "#0a1e3c", opacity: 0, pointerEvents: "none", zIndex: 8 }} />}
    </div>
  );
  const par = lista[actual];
  const capas = (lado: 0 | 1): React.ReactNode => {
    if (!giro) return capa(par[lado], "base");
    const dir = giro.b > giro.a ? 1 : -1;
    const v = lista[giro.a][lado];
    const n = lista[giro.b][lado];
    if (lado === 0) return dir > 0 ? [capa(v, "base"), capa(n, "entra")] : [capa(n, "base"), capa(v, "sale")];
    return dir > 0 ? [capa(n, "base"), capa(v, "sale")] : [capa(v, "base"), capa(n, "entra")];
  };

  const una = vista === "hoja";
  const edicionPropia = par.filter((i) => i >= 0).some((i) => cfg.textos[paginas[i]]?.editado);
  const sinDatos = filas.length === 0;
  const f = FORMATOS[cfg.formato];
  const conteo = (e: FiltroEstado) => aportes.filter((a) => (e === "video" ? a.estado === "para_video" : e === "rev" ? a.estado === "revisado" || a.estado === "para_video" : a.estado !== "rechazado" && a.estado !== "descartado")).length;
  const textoGuardado = !puedeEditar ? "Solo lectura: los cambios no se guardan." : guardado === "guardando" ? "Guardando…" : guardado === "pendiente" ? "Cambios sin guardar" : guardado === "error" ? "No se pudo guardar" : "Todo guardado";

  const alternar = (id: IdModulo, on: boolean) =>
    cambiar((c) => {
      const activas = on ? [...c.activas, id] : c.activas.filter((x) => x !== id);
      return { ...c, activas };
    });
  const mover = (i: number, d: -1 | 1) =>
    cambiar((c) => {
      const o = [...c.orden];
      [o[i], o[i + d]] = [o[i + d], o[i]];
      return { ...c, orden: o };
    });
  const nActivas = cfg.activas.length;

  return (
    <CtxLibro.Provider value={ctx}>
      <div className="lb-app">
        <aside className="lb-panel" aria-label="Configurar el libro">
          <details className="lb-sec" open>
            <summary>Formato</summary>
            <div className="lb-in">
              <div>
                <span className="lb-lbl">Tamaño de hoja</span>
                <div className="ed-seg lb-seg" role="group" aria-label="Tamaño de hoja">
                  {(["carta", "a4"] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={cfg.formato === k} onClick={() => cambiar((c) => ({ ...c, formato: k }))}>
                      {FORMATOS[k].nombre}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="lb-lbl">Vista</span>
                <div className="ed-seg lb-seg" role="group" aria-label="Vista">
                  {([["doble", "Libro abierto"], ["hoja", "Una hoja"]] as const).map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={cfg.vista === k} onClick={() => { setCur(0); cambiar((c) => ({ ...c, vista: k })); }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <label className="lb-chk">
                <input type="checkbox" checked={cfg.folios} onChange={(e) => cambiar((c) => ({ ...c, folios: e.target.checked }))} /> Folios y encabezado
              </label>
              <label className="lb-chk">
                <input type="checkbox" checked={guias} onChange={(e) => setGuias(e.target.checked)} /> Ver margen seguro
              </label>
              <label className="lb-chk">
                <input type="checkbox" checked={cfg.sangrado} onChange={(e) => cambiar((c) => ({ ...c, sangrado: e.target.checked }))} /> Imprimir con sangrado de 3 mm
              </label>
              <button type="button" className="ed-btn ed-btn--pri" onClick={() => setImprimiendo(true)} disabled={imprimiendo}>
                {imprimiendo ? "Preparando las hojas…" : "Imprimir o guardar PDF"}
              </button>
              <p className="lb-nota">Sale una hoja por página, en orden de lectura, en {f.nombre} ({f.ancho} × {f.alto} mm). En el cuadro de impresión elija «Guardar como PDF», sin márgenes ni encabezados.</p>
              <p className="lb-nota" data-estado={guardado}>{textoGuardado}</p>
            </div>
          </details>

          <details className="lb-sec" open>
            <summary>Páginas del libro</summary>
            <div className="lb-in">
              <p className="lb-nota">
                {nActivas} páginas de contenido, {resumen.total} con portada y contraportada{resumen.notas ? " (incluye 1 de notas para cerrar el pliego)" : ""}. Rango permitido: {MIN_PAGINAS} a {MAX_PAGINAS}.
              </p>
              <ul className="lb-mods">
                {cfg.orden.map((id, i) => {
                  const m = MODULOS.find((x) => x.id === id)!;
                  const on = cfg.activas.includes(id);
                  const bloqueado = (!on && nActivas >= MAX_MODULOS) || (on && nActivas <= MIN_MODULOS_ACTIVOS);
                  return (
                    <li key={id} className={on ? "on" : ""}>
                      <label>
                        <input type="checkbox" checked={on} disabled={bloqueado} onChange={(e) => alternar(id, e.target.checked)} /> {m.nombre}
                      </label>
                      <button type="button" className="lb-mv" aria-label={`Subir ${m.nombre}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="lb-mv" aria-label={`Bajar ${m.nombre}`} disabled={i === cfg.orden.length - 1} onClick={() => mover(i, 1)}>
                        ↓
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="lb-nota">La portada y la contraportada siempre van.</p>
            </div>
          </details>

          <details className="lb-sec">
            <summary>Portada y contraportada</summary>
            <div className="lb-in">
              <div>
                <span className="lb-lbl">Composición generada</span>
                <div className="ed-seg lb-seg" role="group" aria-label="Composición de la portada">
                  {([[1, "Mosaico"], [2, "Anillo"], [3, "Retícula"]] as const).map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={cfg.portada.composicion === k} onClick={() => cambiar((c) => ({ ...c, portada: { ...c.portada, composicion: k } }))}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="lb-lbl">Paleta</span>
                <div className="lb-pal" role="group" aria-label="Paleta">
                  {PALETAS.map((p) => (
                    <button key={p.id} type="button" aria-pressed={cfg.portada.paleta === p.id} aria-label={p.nombre} title={p.nombre} style={{ background: p.muestra }} onClick={() => cambiar((c) => ({ ...c, portada: { ...c.portada, paleta: p.id } }))} />
                  ))}
                </div>
              </div>
              {(
                [
                  ["lb-t", "Título", "titulo", 60],
                  ["lb-s", "Subtítulo", "subtitulo", 90],
                  ["lb-d", "Fecha o corte", "fecha", 80],
                ] as const
              ).map(([id, t, k, max]) => (
                <div className="ed-field" key={id}>
                  <label htmlFor={id}>{t}</label>
                  <input id={id} className="ed-in" maxLength={max} value={cfg.portada[k]} onChange={(e) => cambiar((c) => ({ ...c, portada: { ...c.portada, [k]: e.target.value } }))} />
                </div>
              ))}
              {(
                [
                  ["portada", "Imagen de portada", cfg.portada.imagen, urls.portada, archivoPortada],
                  ["contra", "Imagen de contraportada", cfg.portada.contraImagen, urls.contra, archivoContra],
                ] as const
              ).map(([cara, t, ruta, url, ref]) => (
                <div className="lb-img-panel" key={cara}>
                  <span className="lb-lbl">{t}</span>
                  {ruta && url && <img src={url} alt={`Vista previa: ${t.toLowerCase()}`} />}
                  <div className="lb-fila">
                    <input ref={ref} type="file" id={`lb-f-${cara}`} accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void subir(cara, e.target.files?.[0]); e.target.value = ""; }} />
                    <button type="button" className="ed-btn ed-btn--sm" disabled={!puedeEditar || trabajando === "imagen"} onClick={() => ref.current?.click()}>
                      {trabajando === "imagen" ? "Subiendo…" : ruta ? "Cambiar imagen" : "Cargar imagen"}
                    </button>
                    {ruta && (
                      <button type="button" className="ed-btn ed-btn--sm" disabled={!puedeEditar} onClick={() => void quitar(cara)}>
                        Volver a la generada
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <p className="lb-nota">La imagen cubre la hoja entera y reemplaza la composición generada, así que debe traer su propio título y logo. JPG, PNG o WebP de hasta 8 MB. Para {f.nombre} use una proporción de {f.ancho} × {f.alto} mm{cfg.sangrado ? ", más 3 mm de sangrado por lado" : ""}.</p>
            </div>
          </details>

          <details className="lb-sec">
            <summary>Datos que entran</summary>
            <div className="lb-in">
              <div>
                <span className="lb-lbl">Aportes de la encuesta</span>
                <div className="ed-seg lb-seg" role="group" aria-label="Qué aportes entran">
                  {([["video", "Para video"], ["rev", "Revisados"], ["todo", "Todos"]] as const).map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={cfg.estado === k} onClick={() => cambiarDatos((c) => ({ ...c, estado: k }))}>
                      {t} ({conteo(k)})
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="lb-fila" style={{ justifyContent: "space-between" }}>
                  <span className="lb-lbl" style={{ margin: 0 }}>Dependencias</span>
                  <span className="lb-fila">
                    <button type="button" className="ed-btn ed-btn--sm" onClick={() => cambiarDatos((c) => ({ ...c, excluidas: [] }))}>Todas</button>
                    <button type="button" className="ed-btn ed-btn--sm" onClick={() => cambiarDatos((c) => ({ ...c, excluidas: dependencias }))}>Ninguna</button>
                  </span>
                </div>
                <div className="lb-checks">
                  {dependencias.map((d) => (
                    <label key={d} className="lb-chk">
                      <input type="checkbox" checked={!cfg.excluidas.some((x) => x.toLowerCase() === d.toLowerCase())} onChange={(e) => cambiarDatos((c) => ({ ...c, excluidas: e.target.checked ? c.excluidas.filter((x) => x.toLowerCase() !== d.toLowerCase()) : [...c.excluidas, d] }))} /> {d}
                    </label>
                  ))}
                  {!dependencias.length && <p className="lb-nota">La encuesta todavía no tiene aportes.</p>}
                </div>
              </div>
              <div className="ed-field">
                <label htmlFor="lb-foco">Dependencia en foco</label>
                <select id="lb-foco" className="ed-in" value={cfg.foco ?? ""} onChange={(e) => cambiar((c) => ({ ...c, foco: e.target.value || null }))}>
                  <option value="">La primera con aportes</option>
                  {calc.deps.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          </details>

          <details className="lb-sec" open>
            <summary>Narrativa con Pilo</summary>
            <div className="lb-in">
              <div>
                <span className="lb-lbl">Extensión</span>
                <div className="ed-seg lb-seg" role="group" aria-label="Extensión">
                  {([[1, "Corta"], [2, "Media"]] as const).map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={cfg.largo === k} onClick={() => cambiarDatos((c) => ({ ...c, largo: k }))}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="lb-lbl">Tono</span>
                <div className="ed-seg lb-seg" role="group" aria-label="Tono">
                  {([["i", "Institucional"], ["c", "Cercano"]] as const).map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={cfg.tono === k} onClick={() => cambiarDatos((c) => ({ ...c, tono: k }))}>{t}</button>
                  ))}
                </div>
              </div>
              <button type="button" className="ed-btn ed-btn--pri" onClick={() => void redactar()} disabled={!puedeEditar || trabajando !== null || pilo?.ai === false}>
                {trabajando === "texto" ? "Pilo está redactando…" : "Redactar con Pilo"}
              </button>
              <button type="button" className="ed-btn" onClick={() => void clasificar()} disabled={!puedeEditar || trabajando !== null || pilo?.ai === false}>
                {trabajando === "ods" ? "Pilo está clasificando…" : `Clasificar ODS con Pilo${calc.clasificados ? ` (${calc.clasificados} de ${calc.r.length})` : ""}`}
              </button>
              {pilo?.ai === false && <p className="lb-aviso">{pilo.motivo ?? "La IA de Pilo no está disponible."} El libro usa los textos de plantilla.</p>}
              {avisoPilo && <p className="lb-aviso" role="status" data-error={avisoPilo.error ? "1" : undefined}>{avisoPilo.texto}</p>}
              <p className="lb-nota">Pilo redacta solo con las cifras de cada página y no inventa datos. Lo que usted edita sobre la hoja no se reescribe. Al cambiar filtros, tono o extensión, los textos de Pilo se vuelven a redactar.</p>
            </div>
          </details>
        </aside>

        <section className="lb-stage" aria-label="Vista del libro">
          <div className="lb-barra">
            <div className="lb-nav">
              <button type="button" aria-label="Página anterior" disabled={actual === 0 || giro !== null} onClick={() => ir(actual - 1)}>←</button>
              <span className="lb-donde" aria-live="polite">
                {par[0] >= 0 && par[1] >= 0 ? `Páginas ${par[0] + 1} y ${par[1] + 1}` : `Página ${Math.max(par[0], par[1]) + 1}`} de {paginas.length}
              </span>
              <button type="button" aria-label="Página siguiente" disabled={actual === lista.length - 1 || giro !== null} onClick={() => ir(actual + 1)}>→</button>
            </div>
            <span className="lb-nota">{f.nombre} · {paginas.length} páginas</span>
          </div>
          {sinDatos && (
            <p className="lb-aviso" style={{ marginBottom: 12 }}>
              Con estos filtros no hay aportes. {aportes.length ? "Cambie «Aportes de la encuesta» o las dependencias." : "El libro se llena con lo que reciba la encuesta."}
            </p>
          )}
          <div className="lb-escritorio" ref={desk}>
            <div className="lb-spread" ref={spread} style={{ ["--pw" as string]: `${pw}px`, ["--ar" as string]: ar } as React.CSSProperties}>
              <div className={`lb-slot ${una ? "una" : "L"}${par[0] < 0 && !giro ? " vacio" : ""}`}>{capas(0)}</div>
              {!una && <div className={`lb-slot R${par[1] < 0 && !giro ? " vacio" : ""}`}>{capas(1)}</div>}
            </div>
          </div>
          <div className="lb-chips" role="group" aria-label="Ir a una página">
            {lista.map((p, i) => (
              <button key={i} type="button" aria-current={i === actual ? "true" : undefined} onClick={() => ir(i)}>
                {p.filter((x) => x >= 0).map((x) => nombrePagina(paginas[x])).join(" y ")}
              </button>
            ))}
          </div>
          <p className="lb-estado">{edicionPropia ? "Estas páginas tienen texto editado por una persona. Pilo no lo reescribe." : puedeEditar ? "Haga clic sobre un texto de la hoja para editarlo." : "Está en modo lectura."}</p>
        </section>
      </div>

      {imprimiendo &&
        createPortal(
          <CtxLibro.Provider value={{ ...ctx, editable: false, guias: false }}>
            <div className="lb-print-root" style={{ ["--lb-w" as string]: `${f.ancho + (cfg.sangrado ? 6 : 0)}mm`, ["--lb-h" as string]: `${f.alto + (cfg.sangrado ? 6 : 0)}mm`, ["--sg" as string]: cfg.sangrado ? "3mm" : "0mm" } as React.CSSProperties}>
              {paginas.map((id, i) => (
                <div className="lb-hoja" key={`${id}-${i}`}>
                  <Hoja id={id} indice={i} />
                </div>
              ))}
            </div>
          </CtxLibro.Provider>,
          document.body,
        )}
    </CtxLibro.Provider>
  );
}

/* =============================================================================
   Monitor de alertas tempranas · piezas visuales con GSAP.

   · Aletas: la cifra como tablero de llegadas; al cambiar, giran los dígitos.
   · BarraNiveles: la barra NE · ED · RS que crece y morfa al cambiar de corte o de umbral.
   · Evolucion: la línea de los cortes como estaciones; se dibuja al entrar.
   · Escala: 0 a 5 con la marca de aprobar siempre visible.
   · Semaforo: sigla, palabra y forma (círculo, triángulo, cuadrado): nunca solo color.
   Todo respeta «reducir movimiento»: mismo contenido, sin animación.
   ========================================================================== */

import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { NOMBRE_NIVEL, type Nivel, type PuntoCorte } from "./logica";

export const sinMovimiento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Curva de salida fuerte (la del sistema: --ease-out) en su equivalente de GSAP. */
const SALE = "power4.out";
const MUEVE = "power3.inOut";

export type Sentido = "abajo" | "arriba" | "lado";

/* --- El elemento elegido viaja hasta el título del siguiente nivel -------------------------------- */

interface Vuelo {
  rect: DOMRect;
  texto: string;
  tam: number;
  estilo: Partial<CSSStyleDeclaration>;
}
let vuelo: Vuelo | null = null;

/** Se llama justo antes de navegar: recuerda dónde estaba el nombre elegido y cómo se veía. */
export function prepararVuelo(origen: Element | null | undefined) {
  vuelo = null;
  if (!origen || sinMovimiento()) return;
  const cs = getComputedStyle(origen);
  vuelo = {
    rect: origen.getBoundingClientRect(),
    texto: (origen.textContent ?? "").trim(),
    tam: parseFloat(cs.fontSize) || 16,
    estilo: { fontFamily: cs.fontFamily, fontWeight: cs.fontWeight, color: cs.color, letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight },
  };
}

function volar(raiz: HTMLElement) {
  const v = vuelo;
  vuelo = null;
  const destino = raiz.querySelector<HTMLElement>("[data-destino]");
  if (!v || !destino || !v.texto) return;
  const d = destino.getBoundingClientRect();
  const tamDestino = parseFloat(getComputedStyle(destino).fontSize) || v.tam;
  const escala = Math.min(2.2, tamDestino / v.tam);
  const g = document.createElement("div");
  g.textContent = v.texto;
  g.setAttribute("aria-hidden", "true");
  Object.assign(g.style, v.estilo, { position: "fixed", left: `${v.rect.left}px`, top: `${v.rect.top}px`, margin: "0", whiteSpace: "nowrap", fontSize: `${v.tam}px`, pointerEvents: "none", zIndex: "60", transformOrigin: "0 0", willChange: "transform, opacity" });
  document.body.appendChild(g);
  gsap.set(destino, { opacity: 0 });
  gsap
    .timeline({ onComplete: () => g.remove() })
    .to(g, { x: d.left - v.rect.left, y: d.top - v.rect.top, scale: escala, duration: 0.28, ease: MUEVE })
    .to(destino, { opacity: 1, duration: 0.14, ease: "power2.out", clearProps: "opacity" }, 0.16)
    .to(g, { opacity: 0, duration: 0.14, ease: "power2.out" }, 0.18);
}

/**
 * Entrada escalonada de lo marcado con data-in dentro del contenedor; se repite cuando cambia `clave`.
 * Al bajar de nivel entra desde abajo y el nombre elegido viaja hasta el título; al subir, desde arriba.
 */
export function useEntrada<T extends HTMLElement>(clave: string, sentido: Sentido = "abajo") {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sinMovimiento()) {
      vuelo = null;
      return;
    }
    const hijos = el.querySelectorAll("[data-in]");
    const ctx = gsap.context(() => {
      gsap.from(hijos, { opacity: 0, y: sentido === "arriba" ? -8 : sentido === "lado" ? 0 : 12, duration: 0.3, ease: SALE, stagger: 0.045, clearProps: "opacity,transform" });
      volar(el);
    }, el);
    return () => ctx.revert();
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/**
 * FLIP de una lista: cada hijo marcado con data-k que cambia de lugar (otro orden, otro corte) viaja desde donde
 * estaba, en lugar de saltar; los nuevos aparecen. Solo transform y opacity.
 */
export function useFlip<T extends HTMLElement>(clave: string) {
  const ref = useRef<T>(null);
  const antes = useRef<Map<string, number> | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-k]"));
    const ahora = new Map(items.map((i) => [i.dataset.k as string, i.offsetTop]));
    const previo = antes.current;
    antes.current = ahora;
    if (!previo || sinMovimiento()) return;
    const ctx = gsap.context(() => {
      items.forEach((i, n) => {
        const k = i.dataset.k as string;
        const era = previo.get(k);
        if (era === undefined) gsap.from(i, { opacity: 0, y: 8, duration: 0.26, ease: SALE, delay: Math.min(n, 6) * 0.025, clearProps: "opacity,transform" });
        else if (Math.abs(era - (ahora.get(k) as number)) > 1) gsap.from(i, { y: era - (ahora.get(k) as number), duration: 0.3, ease: MUEVE, clearProps: "transform" });
      });
    }, el);
    return () => ctx.revert();
  }, [clave]);
  return ref;
}

/** Una cifra que cuenta hasta su valor (y vuelve a contar al cambiar de corte o de alcance). */
export function Cuenta({ valor, decimales = 0, sufijo = "" }: { valor: number | null; decimales?: number; sufijo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previo = useRef<number | null>(null);
  const fmt = (n: number) => n.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) + sufijo;
  useLayoutEffect(() => {
    const el = ref.current;
    const hasta = valor;
    const desde = previo.current ?? 0;
    previo.current = hasta;
    if (!el || hasta === null) return;
    if (sinMovimiento() || desde === hasta) {
      el.textContent = fmt(hasta);
      return;
    }
    const o = { v: desde };
    el.textContent = fmt(desde);
    const t = gsap.to(o, { v: hasta, duration: 0.6, ease: SALE, onUpdate: () => (el.textContent = fmt(o.v)), onComplete: () => (el.textContent = fmt(hasta)) });
    return () => {
      t.kill();
      el.textContent = fmt(hasta);
    };
  }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={ref} className="mo-cuenta" role="img" aria-label={valor === null ? "sin dato" : fmt(valor)}>
      {valor === null ? "—" : fmt(valor)}
    </span>
  );
}

/* --- Semáforo ------------------------------------------------------------------------------- */

const FORMA: Record<Nivel, string> = { NE: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z", ED: "M8 2 14.5 13.5h-13Z", RS: "M3 3h10v10H3Z" };

export function Forma({ nivel, size = 14 }: { nivel: Nivel; size?: number }) {
  return (
    <svg className="mo-forma" data-n={nivel} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d={FORMA[nivel]} />
    </svg>
  );
}

export function Semaforo({ nivel, palabra = true }: { nivel: Nivel; palabra?: boolean }) {
  return (
    <span className="mo-nivel" data-n={nivel} title={NOMBRE_NIVEL[nivel]}>
      <Forma nivel={nivel} />
      <b>{nivel}</b>
      {palabra && <span>{NOMBRE_NIVEL[nivel]}</span>}
    </span>
  );
}

/* --- Aletas (tablero de llegadas) ----------------------------------------------------------- */

export function Aletas({ valor, sufijo = "", etiqueta }: { valor: number | string; sufijo?: string; etiqueta: string }) {
  const texto = typeof valor === "number" ? valor.toLocaleString("es-CO") : valor;
  const raiz = useRef<HTMLSpanElement>(null);
  const anterior = useRef<string>("");
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const celdas = Array.from(el.querySelectorAll<HTMLElement>("[data-c] i"));
    if (!sinMovimiento() && anterior.current !== texto) {
      const antes = anterior.current.padStart(texto.length, " ");
      celdas.forEach((c, i) => {
        // Gira solo lo que cambió; en la primera vez, todo (entrada del tablero).
        if (anterior.current === "" || antes[i] !== texto[i]) gsap.fromTo(c, { rotateX: -90, opacity: 0 }, { rotateX: 0, opacity: 1, duration: 0.34, ease: "power3.out", delay: i * 0.035 });
      });
    }
    anterior.current = texto;
  }, [texto]);
  return (
    <span className="mo-aletas" ref={raiz} role="img" aria-label={`${etiqueta}: ${texto}${sufijo}`}>
      {texto.split("").map((ch, i) => (
        <span key={i} className={ch === "." || ch === "," ? "mo-aleta mo-aleta--sep" : "mo-aleta"} data-c aria-hidden="true">
          <i>{ch}</i>
        </span>
      ))}
      {sufijo && <span className="mo-aletas__sufijo">{sufijo}</span>}
    </span>
  );
}

/* --- Barra de niveles ----------------------------------------------------------------------- */

export function BarraNiveles({ NE, ED, RS, alto = 14, mostrarCifras = false }: { NE: number; ED: number; RS: number; alto?: number; mostrarCifras?: boolean }) {
  const raiz = useRef<HTMLDivElement>(null);
  const total = NE + ED + RS;
  const previo = useRef<{ x: number; w: number }[] | null>(null);
  // Los anchos son los reales (CSS). Al cambiar, cada tramo viaja desde donde estaba (FLIP): solo transform.
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const partes = Array.from(el.querySelectorAll<HTMLElement>("[data-parte]"));
    const base = el.getBoundingClientRect().left;
    const ahora = partes.map((p) => {
      const r = p.getBoundingClientRect();
      return { x: r.left - base, w: r.width };
    });
    const antes = previo.current;
    previo.current = ahora;
    if (sinMovimiento()) return;
    partes.forEach((p, i) => {
      const a = antes?.[i];
      const n = ahora[i];
      if (!a) gsap.fromTo(p, { scaleX: 0 }, { scaleX: 1, transformOrigin: "0 50%", duration: 0.5, ease: SALE, delay: 0.06 * i, clearProps: "transform" });
      else if (n.w > 0.5 && (Math.abs(a.x - n.x) > 0.5 || Math.abs(a.w - n.w) > 0.5)) gsap.fromTo(p, { x: a.x - n.x, scaleX: Math.max(0.001, a.w / n.w) }, { x: 0, scaleX: 1, transformOrigin: "0 50%", duration: 0.4, ease: MUEVE, clearProps: "transform" });
    });
  }, [NE, ED, RS]);
  const valores: [Nivel, number][] = [["NE", NE], ["ED", ED], ["RS", RS]];
  return (
    <span className="mo-barra" ref={raiz} style={{ height: alto }} role="img" aria-label={`Nivel Esperado ${NE}, En Desarrollo ${ED}, Requiere Seguimiento ${RS}`}>
      {valores.map(([n, v]) => (
        <i key={n} data-parte data-n={n} style={{ width: total ? `${(100 * v) / total}%` : 0 }} title={`${NOMBRE_NIVEL[n]}: ${v.toLocaleString("es-CO")}${total ? ` (${((100 * v) / total).toFixed(1).replace(".", ",")} %)` : ""}`}>
          {mostrarCifras && v > 0 && total && v / total > 0.09 ? v.toLocaleString("es-CO") : ""}
        </i>
      ))}
    </span>
  );
}

/* --- Evolución por cortes ------------------------------------------------------------------- */

const coma1 = (n: number) => n.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * El semestre como una línea de estaciones: una columna por corte con la composición NE · ED · RS (siempre
 * 100 %), y cintas que unen cada nivel con el del corte siguiente. Con dos o tres cortes, una línea no dice
 * nada; la composición sí. Sin ejes: cada tramo lleva su cifra, y al lado va la lectura con el cambio.
 */
export function Evolucion({ serie, titulo }: { serie: PuntoCorte[]; titulo: string }) {
  const [foco, setFoco] = useState<Nivel | null>(null);
  const raiz = useRef<SVGSVGElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  // El dibujo se arma con el ancho real de su espacio (1 unidad = 1 píxel), para que el texto nunca se encoja.
  const [ancho, setAncho] = useState(640);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(260, Math.min(700, Math.round(el.getBoundingClientRect().width))));
    medir();
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const W = ancho;
  const angosto = W < 460;
  const cw = Math.min(86, Math.round(W * (angosto ? 0.17 : 0.135)));
  const arriba = 12;
  const alto = angosto ? 150 : 176;
  const H = arriba + alto + (angosto ? 40 : 66);
  const lado = angosto ? 10 : 22;
  const k = serie.length;
  const x = (i: number) => (k === 1 ? (W - cw) / 2 : lado + (i * (W - 2 * lado - cw)) / (k - 1));
  // De abajo hacia arriba: NE, ED, RS. El seguimiento queda arriba, donde el ojo lo busca.
  const partes = serie.map((p) => {
    const ne = p.pctNE;
    const rs = p.pctRS;
    const ed = Math.max(0, 100 - ne - rs);
    const y = (v: number) => arriba + alto - (v / 100) * alto;
    return { p, ne, ed, rs, tramo: { NE: [y(ne), y(0)], ED: [y(ne + ed), y(ne)], RS: [y(100), y(ne + ed)] } as Record<Nivel, [number, number]> };
  });
  const clave = serie.map((s) => `${s.pctNE}/${s.pctRS}`).join("|");

  // Al cambiar de alcance o de corte las columnas se transforman (no se recargan): cada tramo viaja de su
  // altura anterior a la nueva; las cintas y las cifras se reencienden detrás.
  const previo = useRef<Map<string, { y: number; h: number }> | null>(null);
  useLayoutEffect(() => {
    const svg = raiz.current;
    if (!svg) return;
    const rects = Array.from(svg.querySelectorAll<SVGRectElement>("[data-tramo]"));
    const ahora = new Map(rects.map((r) => [r.dataset.id as string, { y: Number(r.getAttribute("y")), h: Number(r.getAttribute("height")) }]));
    const antes = previo.current;
    previo.current = ahora;
    if (sinMovimiento()) return;
    const ctx = gsap.context(() => {
      rects.forEach((r, i) => {
        const id = r.dataset.id as string;
        const a = antes?.get(id);
        const n = ahora.get(id) as { y: number; h: number };
        if (!antes) gsap.from(r, { scaleY: 0, transformBox: "fill-box", transformOrigin: "50% 100%", duration: 0.5, ease: SALE, delay: i * 0.035, clearProps: "transform" });
        else if (a) gsap.fromTo(r, { attr: { y: a.y, height: a.h } }, { attr: { y: n.y, height: n.h }, duration: 0.4, ease: MUEVE });
        else gsap.from(r, { opacity: 0, duration: 0.3, ease: SALE, clearProps: "opacity" });
      });
      const retraso = antes ? 0.18 : 0.35;
      gsap.from(svg.querySelectorAll("[data-cinta]"), { opacity: 0, duration: 0.4, ease: SALE, delay: retraso, stagger: 0.05, clearProps: "opacity" });
      gsap.from(svg.querySelectorAll("[data-cifra]"), { opacity: 0, y: 4, duration: 0.28, ease: SALE, delay: retraso + 0.1, stagger: 0.03, clearProps: "opacity,transform" });
    }, svg);
    return () => ctx.revert();
  }, [clave]);

  if (k === 0) return null;
  const NIV: Nivel[] = ["NE", "ED", "RS"];
  const primero = serie[0];
  const ultimo = serie[k - 1];
  const delta = (n: Nivel) => {
    const f = (p: PuntoCorte) => (n === "NE" ? p.pctNE : n === "RS" ? p.pctRS : Math.max(0, 100 - p.pctNE - p.pctRS));
    return Math.round((f(ultimo) - f(primero)) * 10) / 10;
  };
  const valor = (n: Nivel, p: PuntoCorte) => (n === "NE" ? p.pctNE : n === "RS" ? p.pctRS : Math.max(0, 100 - p.pctNE - p.pctRS));
  const bien: Record<Nivel, boolean> = { NE: true, ED: true, RS: false };

  return (
    <div className="mo-evo" data-foco={foco ?? undefined}>
      <div ref={caja} className="mo-evo__caja">
      <svg ref={raiz} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="mo-evo__svg" role="img" aria-label={titulo}>
        <title>{titulo}</title>
        <defs>
          <pattern id="mo-evo-raya" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="var(--mo-ed-fill)" />
            <rect width="2.2" height="7" fill="rgb(0 0 0 / 16%)" />
          </pattern>
        </defs>

        {/* cintas: cada nivel con el del corte siguiente */}
        {partes.slice(0, -1).map((a, i) => {
          const b = partes[i + 1];
          return NIV.map((n) => {
            const [a0, a1] = a.tramo[n];
            const [b0, b1] = b.tramo[n];
            const xa = x(i) + cw;
            const xb = x(i + 1);
            const m = (xa + xb) / 2;
            return (
              <path
                key={`${i}${n}`}
                data-cinta
                data-n={n}
                className="mo-evo__cinta"
                d={`M${xa} ${a0}C${m} ${a0} ${m} ${b0} ${xb} ${b0}L${xb} ${b1}C${m} ${b1} ${m} ${a1} ${xa} ${a1}Z`}
              />
            );
          });
        })}

        {/* columnas */}
        {partes.map((c, i) =>
          NIV.map((n) => {
            const [y0, y1] = c.tramo[n];
            const h = y1 - y0;
            const v = valor(n, c.p);
            return (
              <g key={`${c.p.corte}${n}`} className="mo-evo__tramo" data-n={n} onMouseEnter={() => setFoco(n)} onMouseLeave={() => setFoco(null)}>
                <rect data-tramo data-id={`${c.p.corte}${n}`} x={x(i)} y={y0} width={cw} height={Math.max(0, h - 1.5)} rx="2" fill={n === "ED" ? "url(#mo-evo-raya)" : undefined} className="mo-evo__rect" data-nivel={n}>
                  <title>{`P${c.p.corte} · ${NOMBRE_NIVEL[n]}: ${coma1(v)} %`}</title>
                </rect>
                {h >= 17 && cw >= 44 && (
                  <text data-cifra x={x(i) + cw / 2} y={y0 + h / 2 + 4.5} textAnchor="middle" className="mo-evo__cifra" data-n={n}>
                    {coma1(v)} %
                  </text>
                )}
              </g>
            );
          }),
        )}

        {/* estaciones */}
        {partes.map((c, i) => (
          <g key={`e${c.p.corte}`}>
            <text x={x(i) + cw / 2} y={arriba + alto + 26} textAnchor="middle" className="mo-evo__corte">
              P{c.p.corte}
            </text>
            {!angosto && (
              <>
                <text x={x(i) + cw / 2} y={arriba + alto + 43} textAnchor="middle" className="mo-evo__dato">
                  {c.p.estudiantes.toLocaleString("es-CO")} estudiantes
                </text>
                <text x={x(i) + cw / 2} y={arriba + alto + 59} textAnchor="middle" className="mo-evo__dato">
                  promedio {c.p.promedio === null ? "—" : c.p.promedio.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
      </div>

      <dl className="mo-evo__lectura" aria-label="Lectura de la evolución">
        {([...NIV].reverse() as Nivel[]).map((n) => {
          const d = k > 1 ? delta(n) : 0;
          const mejora = bien[n] ? d > 0 : d < 0;
          return (
            <div key={n} className="mo-evo__fila" onMouseEnter={() => setFoco(n)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(n)} onBlur={() => setFoco(null)} tabIndex={0}>
              <dt>
                <Semaforo nivel={n} />
              </dt>
              <dd>
                <b>{coma1(valor(n, ultimo))} %</b>
                {k > 1 && (
                  <small data-sentido={d === 0 || n === "ED" ? "igual" : mejora ? "bien" : "mal"}>
                    {d === 0 ? "sin cambio desde P" + primero.corte : `${d > 0 ? "sube" : "baja"} ${coma1(Math.abs(d))} puntos desde P${primero.corte}`}
                  </small>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/* --- Escala 0–5 ----------------------------------------------------------------------------- */

export function Escala({ nota }: { nota?: number | null }) {
  const pos = (v: number) => `${(100 * v) / 5}%`;
  const marcas: [number, string][] = [[3.0, "3,0 aprobar"], [3.2, "3,2 prueba"], [3.8, "3,8 éxito"]];
  return (
    <div className="mo-escala" role="img" aria-label={`Escala de 0 a 5: aprobar 3,0; periodo de prueba bajo 3,2; éxito sobre 3,8${nota != null ? `; esta nota: ${nota.toString().replace(".", ",")}` : ""}`}>
      <div className="mo-escala__riel" />
      {[0, 1, 2, 3, 4, 5].map((v) => (
        <span key={v} className="mo-escala__n" style={{ left: pos(v) }}>
          {v}
        </span>
      ))}
      {marcas.map(([v, t], i) => (
        <span key={v} className="mo-escala__marca" data-k={i} style={{ left: pos(v) }} title={t}>
          <i />
          <small>{t}</small>
        </span>
      ))}
      {nota != null && <span className="mo-escala__nota" style={{ left: pos(Math.max(0, Math.min(5, nota))) }} />}
    </div>
  );
}

/* --- Miniatura de tendencia ----------------------------------------------------------------- */

export function Tendencia({ valores }: { valores: (number | null)[] }) {
  const puntos = valores.map((v, i) => (v === null ? null : { i, v }));
  const ok = puntos.filter((p): p is { i: number; v: number } => p !== null);
  if (ok.length < 2) return <span className="mo-muted">—</span>;
  const x = (i: number) => 4 + i * 26;
  const y = (v: number) => 4 + (1 - v / 5) * 20;
  const d = ok.map((p, k) => `${k ? "L" : "M"}${x(p.i)} ${y(p.v).toFixed(1)}`).join("");
  const baja = ok[ok.length - 1].v < ok[0].v;
  return (
    <svg className="mo-tendencia" viewBox="0 0 60 28" width="60" height="28" role="img" aria-label={baja ? "El promedio baja entre cortes" : "El promedio se mantiene o sube"}>
      <path d={d} fill="none" data-baja={baja} />
      <circle cx={x(ok[ok.length - 1].i)} cy={y(ok[ok.length - 1].v)} r="2.6" data-baja={baja} />
    </svg>
  );
}

/* =============================================================================
   Páginas de error · la escena.

   Un componente para todos los códigos: 404, 402, 500, mantenimiento (503),
   401, 403, 408, 429 y 502. Pinta el campus en pixel art, el panel naranja con
   el mensaje, y a Pilo, que entra corriendo con su estela, habla y reacciona.
   Además trae el minijuego: «Jugar con Pilo», o la barra espaciadora, convierte
   la escena en una carrera con obstáculos y monedas (ver juego.ts).

   Qué es de React y qué no: el texto, los enlaces y los botones los pinta React.
   Las animaciones, las partículas y el juego mueven elementos con GSAP, dentro
   de un `gsap.context` que se deshace al cambiar de código o salir de la página.
   Con «reducir movimiento» activado todo queda quieto; el juego solo arranca si
   la persona lo pide.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ERRORES, rutaPose } from "./datos";
import type { CodigoError, Pose } from "./datos";
import { EDIFICIO_SVG } from "./edificio";
import { Corredor } from "./juego";
import type { Movimiento, ResultadoJuego } from "./juego";
import { imagenSprite, sprite } from "./sprites";
import type { SpriteNombre } from "./sprites";
import "./errores.css";

export interface AccionError {
  texto: string;
  /** Ruta interna o https://… Sin ella, la acción es un botón con `alPulsar`. */
  a?: string;
  alPulsar?: () => void;
  tipo?: "pri" | "sec";
  deshabilitada?: boolean;
}

export interface EscenaErrorProps {
  codigo: CodigoError;
  titulo?: string;
  mensaje?: string;
  acciones?: AccionError[];
  /** 404: la ruta que no se encontró. Sin ella, se usa la de la barra de direcciones. */
  ruta?: string;
  /** 500: un código de seguimiento que la persona pueda citar. Solo se muestra si existe de verdad. */
  traza?: string;
  /** 503: cuándo vuelve el sitio. Con fecha futura, se muestra la cuenta regresiva. */
  regreso?: Date | null;
  /** 429: segundos hasta que se pueda reintentar. */
  espera?: number;
  /** En la pantalla de administración: título de nivel 3 y sin atajos de teclado globales. */
  vistaPrevia?: boolean;
  /** Contenido propio bajo la ficha técnica. */
  extra?: ReactNode;
}

const FECHA = new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeStyle: "short", timeZone: "America/Bogota" });
const CLAVE_MUDO = "pilo-mudo";

/* --- Fuentes pixel: se piden solo cuando se pinta una escena ------------------------------- */
function asegurarFuentes() {
  if (document.getElementById("err-fuentes")) return;
  const link = document.createElement("link");
  link.id = "err-fuentes";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=Silkscreen:wght@400;700&display=swap";
  document.head.appendChild(link);
}

function leerMudo(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_MUDO) === "1";
  } catch {
    return false;
  }
}

/* --- Ayudas de dibujo ------------------------------------------------------------------------ */
interface Lanzamiento {
  x: number;
  y: number;
  w?: number;
  dx?: number;
  dy?: number;
  rot?: number;
  dur?: number;
  ease?: string;
}

/** Un sprite que sale, se mueve y se apaga solo. */
function lanzar(capa: HTMLElement, nombre: SpriteNombre, o: Lanzamiento) {
  const w = o.w ?? 28;
  const dur = o.dur ?? 1.5;
  const el = imagenSprite(nombre, w);
  el.style.left = `${o.x - w / 2}px`;
  el.style.top = `${o.y}px`;
  capa.appendChild(el);
  gsap.fromTo(el, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(3)" });
  gsap.to(el, { x: o.dx ?? 0, y: o.dy ?? -110, rotation: o.rot ?? 0, duration: dur, ease: o.ease ?? "power1.out" });
  gsap.to(el, { opacity: 0, duration: 0.35, delay: dur - 0.35, onComplete: () => el.remove() });
  return el;
}

function posCabeza(stage: HTMLElement, pilo: HTMLElement) {
  const r = pilo.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  return { x: r.left - s.left + r.width / 2, y: r.top - s.top + 20 };
}

/** Los códigos de la forma `00:20` o `1 d 03:12:09`. */
function dosDigitos(n: number) {
  return String(n).padStart(2, "0");
}

function formatoCuenta(segundos: number): string {
  const d = Math.floor(segundos / 86400);
  const h = Math.floor((segundos % 86400) / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return `${d > 0 ? `${d} d ` : ""}${dosDigitos(h)}:${dosDigitos(m)}:${dosDigitos(s)}`;
}

/* --- Piezas de la ficha técnica ---------------------------------------------------------------- */

function CuentaRegresiva({ hasta }: { hasta: Date }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const faltan = Math.max(0, Math.floor((hasta.getTime() - ahora) / 1000));
  return (
    <>
      <div className="err-meta">
        <span>{faltan > 0 ? "Regresamos en" : "Estamos terminando"}</span>
        <b>{faltan > 0 ? formatoCuenta(faltan) : "00:00:00"}</b>
      </div>
      <div className="err-meta">
        <span>Volvemos el {FECHA.format(hasta)}</span>
      </div>
    </>
  );
}

function Ficha({ def, ruta, traza, regreso, espera }: { def: (typeof ERRORES)[CodigoError]; ruta?: string; traza?: string; regreso?: Date | null; espera: number }) {
  const [copiado, setCopiado] = useState(false);
  const codigo = def.codigo;

  if (codigo === "404") {
    const camino = (ruta ?? (typeof window !== "undefined" ? window.location.pathname : "/")).slice(0, 120);
    return (
      <>
        <div className="err-chip">
          <b>GET</b>
          <span>{camino}</span>
          <em>404</em>
        </div>
        <div className="err-rapido">
          <span>Quizá buscabas:</span>
          <Link to="/">Inicio</Link>
          <Link to="/pdi">Plan de desarrollo</Link>
          <Link to="/pregunta">Pregúntele a Pilo</Link>
        </div>
      </>
    );
  }
  if (codigo === "503") {
    if (regreso && regreso.getTime() > Date.now()) return <CuentaRegresiva hasta={regreso} />;
    return <div className="err-barra" aria-hidden="true"><i /></div>;
  }
  if (codigo === "500" && traza) {
    return (
      <div className="err-chip">
        <b>SEGUIMIENTO</b>
        <span>{traza}</span>
        <button
          type="button"
          onClick={() => {
            const listo = () => {
              setCopiado(true);
              window.setTimeout(() => setCopiado(false), 1600);
            };
            try {
              void navigator.clipboard.writeText(traza).then(listo, listo);
            } catch {
              listo();
            }
          }}
        >
          {copiado ? "COPIADO" : "COPIAR"}
        </button>
      </div>
    );
  }
  if (codigo === "429" && espera > 0) {
    return (
      <div className="err-chip">
        <b>ESPERA</b>
        <span>Puedes reintentar en {dosDigitos(Math.floor(espera / 60))}:{dosDigitos(espera % 60)}</span>
        <em>429</em>
      </div>
    );
  }
  return (
    <div className="err-chip">
      <b>HTTP</b>
      <span>{def.estado}</span>
      <em>{codigo}</em>
    </div>
  );
}

function accionesPorDefecto(codigo: CodigoError): AccionError[] {
  const reintentar: AccionError = { texto: "Reintentar", tipo: "pri", alPulsar: () => window.location.reload() };
  const inicio: AccionError = { texto: "Volver al inicio", a: "/", tipo: "sec" };
  switch (codigo) {
    case "404":
      return [{ texto: "Volver al inicio", a: "/", tipo: "pri" }, { texto: "Preguntarle a Pilo", a: "/pregunta", tipo: "sec" }];
    case "402":
      return [{ texto: "Volver al inicio", a: "/", tipo: "pri" }, { texto: "Acceso de la intranet", a: "/acceso-intranet", tipo: "sec" }];
    case "401":
      return [{ texto: "Iniciar sesión", a: "/acceso-intranet", tipo: "pri" }, inicio];
    case "403":
      return [{ texto: "Volver al inicio", a: "/", tipo: "pri" }, { texto: "Acceso de la intranet", a: "/acceso-intranet", tipo: "sec" }];
    case "503":
      return [{ texto: "Acceso de la intranet", a: "/acceso-intranet", tipo: "sec" }];
    default:
      return [reintentar, inicio];
  }
}

/* --- La escena ---------------------------------------------------------------------------------- */

export function EscenaError({ codigo, titulo, mensaje, acciones, ruta, traza, regreso, espera = 0, vistaPrevia = false, extra }: EscenaErrorProps) {
  const def = ERRORES[codigo];
  const textoTitulo = titulo ?? def.titulo;
  const textoMensaje = mensaje ?? def.mensaje;
  const lista = acciones ?? accionesPorDefecto(codigo);

  const [jugando, setJugando] = useState(false);
  const [fin, setFin] = useState<ResultadoJuego | null>(null);
  const [mudo, setMudo] = useState(leerMudo);
  const [enfriando, setEnfriando] = useState(espera);
  const pose: Pose = jugando ? "side" : def.pose;

  const refs = {
    marco: useRef<HTMLDivElement>(null),
    stage: useRef<HTMLDivElement>(null),
    cielo: useRef<HTMLDivElement>(null),
    edificio: useRef<HTMLDivElement>(null),
    suelo: useRef<HTMLDivElement>(null),
    fx: useRef<HTMLDivElement>(null),
    actor: useRef<HTMLDivElement>(null),
    pilo: useRef<HTMLImageElement>(null),
    g1: useRef<HTMLImageElement>(null),
    g2: useRef<HTMLImageElement>(null),
    hit: useRef<HTMLButtonElement>(null),
    globo: useRef<HTMLDivElement>(null),
    dicho: useRef<HTMLSpanElement>(null),
    flash: useRef<HTMLDivElement>(null),
    panel: useRef<HTMLElement>(null),
    pin: useRef<HTMLDivElement>(null),
    codigo: useRef<HTMLDivElement>(null),
    burst: useRef<HTMLDivElement>(null),
    juego: useRef<HTMLDivElement>(null),
    marcador: useRef<HTMLDivElement>(null),
    listo: useRef<HTMLDivElement>(null),
    fin: useRef<HTMLDivElement>(null),
  };
  const mov = useRef<Movimiento>({ x: 0, g1: 0, g2: 0, y: 0, hop: 0, rot: 0 });
  const corredor = useRef<Corredor | null>(null);
  const jugandoRef = useRef(false);
  const mudoRef = useRef(mudo);
  jugandoRef.current = jugando;
  mudoRef.current = mudo;

  const estrellas = useMemo(
    () => Array.from({ length: 34 }, (_, i) => ({ left: Math.random() * 100, top: Math.random() * 46, delay: Math.random() * 2.4, grande: i % 5 === 0 })),
    [],
  );
  const nubes = useMemo(
    () => [[12, 12, 7, 70], [34, 26, 5, 95], [6, 40, 6, 120], [52, 8, 4, 150]].map(([top, retraso, escala, dur], i) => ({ top, ancho: 20 * escala, dur, retraso: -retraso * 3 - i * 17 })),
    [],
  );

  useEffect(() => {
    asegurarFuentes();
    // Las poses se piden por adelantado para que el cambio al correr no parpadee.
    (["side", "back", "front", "wave", "crouch"] as Pose[]).forEach((p) => {
      const img = new Image();
      img.src = rutaPose(p);
    });
  }, []);

  /* 429: la espera baja segundo a segundo y libera el primer botón al llegar a cero. */
  useEffect(() => {
    setEnfriando(espera);
    if (espera <= 0) return;
    const id = window.setInterval(() => setEnfriando((s) => (s <= 1 ? (window.clearInterval(id), 0) : s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [espera]);

  /* El reloj de la escena: la estela de Pilo persigue a Pilo, cuadro a cuadro. */
  useEffect(() => {
    const m = mov.current;
    const tick = () => {
      const { pilo, g1, g2, globo, hit } = refs;
      if (!pilo.current || !g1.current || !g2.current) return;
      m.g1 += (m.x - m.g1) * 0.17;
      m.g2 += (m.g1 - m.g2) * 0.17;
      const y = m.y + m.hop;
      pilo.current.style.transform = `translate(${m.x}px,${y}px) rotate(${m.rot}deg)`;
      g1.current.style.transform = `translate(${m.g1}px,${y}px) rotate(${m.rot}deg)`;
      g2.current.style.transform = `translate(${m.g2}px,${y}px) rotate(${m.rot}deg)`;
      if (globo.current) globo.current.style.translate = `${m.x}px ${y}px`;
      if (hit.current) hit.current.style.transform = `translate(${m.x}px,${y}px)`;
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
    // Los refs no cambian; el reloj se instala una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* La escena en reposo: entrada, movimiento propio, frases y efectos de cada código. */
  useLayoutEffect(() => {
    if (jugando) return;
    const { stage, panel, pin, fx, pilo, globo, dicho, flash, codigo: codigoEl, burst, actor } = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, v.current])) as Record<keyof typeof refs, HTMLElement | null>;
    if (!stage || !panel || !pin || !fx || !pilo || !globo || !dicho || !flash || !codigoEl || !burst || !actor) return;
    const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = mov.current;
    let c!: gsap.Context;

    const decir = (texto: string) => {
      gsap.killTweensOf(dicho);
      if (RM) {
        dicho.textContent = texto;
        return;
      }
      const o = { n: 0 };
      gsap.to(o, { n: texto.length, duration: Math.min(1.3, texto.length * 0.035), ease: "none", onUpdate: () => { dicho.textContent = texto.slice(0, Math.round(o.n)); } });
    };

    const cada = (seg: number, fn: () => void) => gsap.to({}, { duration: seg, repeat: -1, delay: 1.1, onRepeat: () => c.add(fn) });

    c = gsap.context(() => {
      Object.assign(S, { x: 0, g1: 0, g2: 0, y: 0, hop: 0, rot: 0 });

      // El código se baraja un instante antes de quedar fijo.
      if (RM) codigoEl.textContent = codigo;
      else {
        const o = { p: 0 };
        gsap.to(o, { p: 1, duration: 0.55, ease: "none", onUpdate: () => { codigoEl.textContent = [...codigo].map((ch, i) => (o.p > (i + 1) / (codigo.length + 1) ? ch : Math.floor(Math.random() * 10))).join(""); }, onComplete: () => { codigoEl.textContent = codigo; } });
      }

      // Panel y Pilo entran.
      if (RM) gsap.set(panel, { autoAlpha: 1, x: 0 });
      else {
        gsap.fromTo(panel, { x: -28, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: "expo.out" });
        gsap.from(pin.children, { y: 14, autoAlpha: 0, duration: 0.4, stagger: 0.06, ease: "power3.out", delay: 0.06 });
        S.x = -360;
        gsap.to(S, { x: 0, duration: 0.95, ease: "expo.out" });
      }

      // Las tres estrellas (o monedas, rayos…) de la esquina del panel.
      burst.innerHTML = "";
      const u = window.innerWidth < 560 ? 0.8 : 1;
      [[34, 22, 70], [66, 6, 24], [96, 48, -4]].forEach(([ancho, arriba, derecha], i) => {
        const im = imagenSprite(def.deco, Math.round(ancho * u * (def.deco === "star" ? 1 : 0.9)));
        im.style.right = `${derecha}px`;
        im.style.top = `${arriba}px`;
        burst.appendChild(im);
        if (!RM) {
          gsap.from(im, { scale: 0, rotation: -40, duration: 0.5, delay: 0.25 + i * 0.09, ease: "back.out(2.4)" });
          gsap.to(im, { rotation: (i % 2 ? -1 : 1) * 12, duration: 1.1 + i * 0.2, ease: "steps(3)", yoyo: true, repeat: -1, delay: 1 });
        }
      });

      // Movimiento propio de cada escena.
      if (!RM) {
        gsap.to(S, { y: -5, duration: codigo === "404" ? 0.3 : 0.55, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.9 });
        if (codigo === "404") gsap.to(S, { x: 110, duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1 });
        else if (codigo === "500") {
          panel.classList.add("err-glitch");
          gsap.timeline({ repeat: -1, repeatDelay: 1.7, delay: 1.5 }).to(S, { x: 12, duration: 0.04, repeat: 9, yoyo: true, ease: "none" }).to(S, { x: 0, duration: 0.05 });
          gsap.timeline({ repeat: -1, repeatDelay: 2.4, delay: 1.6 })
            .to(flash, { opacity: 0.8, duration: 0.05 }).to(flash, { opacity: 0, duration: 0.07 })
            .to(flash, { opacity: 0.55, duration: 0.05 }).to(flash, { opacity: 0, duration: 0.45 });
          gsap.timeline({ repeat: -1, repeatDelay: 2.4, delay: 1.6 }).to(panel, { x: 3, duration: 0.04, repeat: 7, yoyo: true, ease: "none" }).to(panel, { x: 0, duration: 0.05 });
        } else if (codigo === "503") gsap.to(S, { rot: 3, duration: 0.34, ease: "steps(1)", yoyo: true, repeat: -1, delay: 1 });
        else gsap.to(S, { x: 7, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.1 });
      }

      // La burbuja de Pilo.
      let si = 0;
      const siguiente = () => c.add(() => decir(def.frases[si++ % def.frases.length]));
      gsap.fromTo(globo, { opacity: 0, scale: 0.6, transformOrigin: "20px 100%" }, { opacity: 1, scale: 1, duration: RM ? 0 : 0.25, delay: RM ? 0 : 0.9, ease: "back.out(2.2)", onStart: siguiente });
      if (!RM) gsap.to({}, { duration: 5.2, repeat: -1, delay: 5.2, onRepeat: siguiente });

      // Efectos alrededor de Pilo.
      if (!RM) {
        const W = () => stage.clientWidth;
        const H = () => stage.clientHeight;
        if (def.efecto === "q") {
          cada(0.9, () => {
            const h = posCabeza(stage, pilo);
            lanzar(fx, "q", { x: h.x + (Math.random() * 60 - 30), y: h.y - 4, w: 21 + Math.random() * 14, dx: Math.random() * 70 - 35, dy: -120, dur: 1.5 });
          });
        } else if (def.efecto === "coin") {
          cada(0.42, () => {
            const suelo = stage.querySelector<HTMLElement>(".err-suelo")?.offsetHeight ?? 76;
            const el = lanzar(fx, "coin", { x: 20 + Math.random() * (W() - 40), y: -30, w: 32, dy: 0, dur: 2.2 });
            gsap.killTweensOf(el, "x,y,rotation");
            gsap.to(el, { y: H() - suelo - 40, duration: 1.1, ease: "bounce.out" });
            gsap.to(el, { rotation: Math.random() * 40 - 20, duration: 1.1, ease: "none" });
          });
        } else if (def.efecto === "bolt") {
          cada(1.3, () => {
            const h = posCabeza(stage, pilo);
            for (let i = 0; i < 3; i++) lanzar(fx, "bolt", { x: h.x + (Math.random() * 120 - 60), y: h.y + 40 + Math.random() * 120, w: 14 + Math.random() * 10, dx: Math.random() * 40 - 20, dy: Math.random() * 40 - 20, dur: 0.5 + Math.random() * 0.3, rot: Math.random() * 30 - 15 });
          });
          if (codigo === "500") gsap.to({}, { duration: 2.6, repeat: -1, delay: 1.6, onRepeat: () => c.add(() => { lanzar(fx, "bolt", { x: W() * (0.45 + Math.random() * 0.5), y: 10, w: 76, dy: 20, dur: 0.38, ease: "none" }); }) });
        } else if (def.efecto === "gear") {
          [[0.86, 0.09, 62], [0.93, 0.21, 38], [0.77, 0.2, 28]].forEach(([fxX, fyY, w], i) => {
            const el = imagenSprite("gear", w);
            el.style.left = `${fxX * W() - w / 2}px`;
            el.style.top = `${fyY * H()}px`;
            el.style.opacity = "0.9";
            fx.appendChild(el);
            gsap.to(el, { rotation: i % 2 ? -360 : 360, duration: 7 + i * 2, ease: "steps(9)", repeat: -1, transformOrigin: "50% 50%" });
          });
          if (codigo === "503") {
            // Chispas donde Pilo golpea con la llave.
            gsap.to({}, { duration: 0.7, repeat: -1, delay: 1.2, onRepeat: () => c.add(() => {
              const h = posCabeza(stage, pilo);
              lanzar(fx, "bolt", { x: h.x - 34 + Math.random() * 20, y: h.y + 150 + Math.random() * 30, w: 12, dx: Math.random() * 50 - 25, dy: -30 - Math.random() * 30, dur: 0.5, rot: Math.random() * 60 - 30 });
            }) });
          }
        } else if (def.efecto === "lock") {
          const h = posCabeza(stage, pilo);
          const el = imagenSprite("lock", 56);
          el.style.left = `${h.x + 70}px`;
          el.style.top = `${h.y - 40}px`;
          fx.appendChild(el);
          gsap.from(el, { scale: 0, duration: 0.4, delay: 0.8, ease: "back.out(3)" });
          gsap.to(el, { y: -10, rotation: 7, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.2 });
        }
      }
    }, stage);

    // Paralaje suave con el puntero, solo con ratón.
    const fino = !RM && window.matchMedia("(pointer: fine)").matches;
    const { cielo, edificio } = refs;
    const capas: Array<[HTMLElement | null, number]> = [[cielo.current, 10], [edificio.current, 16], [actor, -12]];
    const mover = (ev: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const nx = (ev.clientX - r.left) / r.width - 0.5;
      capas.forEach(([el, a]) => el && gsap.to(el, { x: nx * a, duration: 0.7, ease: "power3.out", overwrite: "auto" }));
    };
    if (fino) {
      gsap.set(cielo.current, { scale: 1.02 });
      gsap.set(edificio.current, { scale: 1.04, transformOrigin: "50% 100%" });
      stage.addEventListener("pointermove", mover);
    }

    return () => {
      stage.removeEventListener("pointermove", mover);
      c.revert();
      gsap.killTweensOf([panel, globo, dicho, flash, S]);
      if (fino) gsap.set([cielo.current, edificio.current, actor], { clearProps: "transform" });
      panel.classList.remove("err-glitch");
      fx.innerHTML = "";
      burst.innerHTML = "";
      dicho.textContent = "";
    };
    // `refs` son objetos estables; la escena solo se rehace al cambiar de código o de modo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, jugando]);

  /* El minijuego: nace al pulsar «Jugar» y muere al salir. */
  useEffect(() => {
    if (!jugando) return;
    const stage = refs.stage.current;
    const capa = refs.juego.current;
    const suelo = refs.suelo.current;
    const pilo = refs.pilo.current;
    const marcador = refs.marcador.current;
    const panel = refs.panel.current;
    const listo = refs.listo.current;
    const finEl = refs.fin.current;
    const flash = refs.flash.current;
    const fx = refs.fx.current;
    if (!stage || !capa || !suelo || !pilo || !marcador || !panel || !listo || !finEl || !flash || !fx) return;

    gsap.killTweensOf(panel);
    gsap.set(refs.globo.current, { opacity: 0 });
    gsap.to(panel, { autoAlpha: 0, x: -24, duration: 0.2, ease: "power2.in" });
    gsap.fromTo(listo, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.3, delay: 0.35, ease: "power3.out" });
    setFin(null);

    const juego = new Corredor({
      stage,
      capa,
      suelo,
      pilo,
      marcador,
      mov: mov.current,
      obstaculos: def.obstaculos,
      climaInicial: def.clima,
      sonido: () => !mudoRef.current,
      alEmpezar: () => {
        gsap.to(listo, { autoAlpha: 0, duration: 0.15 });
        gsap.to(finEl, { autoAlpha: 0, duration: 0.15 });
        setFin(null);
      },
      alChocar: () => {
        gsap.fromTo(mov.current, { rot: 0 }, { rot: -14, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" });
        gsap.fromTo(flash, { opacity: 0.55 }, { opacity: 0, duration: 0.35 });
        const h = posCabeza(stage, pilo);
        for (let i = 0; i < 4; i++) lanzar(fx, "star", { x: h.x + (i - 1.5) * 34, y: h.y - 6, w: 26, dx: (i - 1.5) * 46, dy: -80 - (i % 2) * 30, rot: 120, dur: 1 });
      },
      alTerminar: (r) => {
        setFin(r);
        gsap.fromTo(finEl, { autoAlpha: 0, y: 14, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, delay: 0.25, ease: "back.out(1.8)" });
      },
      alCambiarClima: (cl) => { stage.dataset.clima = cl; },
    });
    corredor.current = juego;
    const alAjustar = () => juego.medir();
    window.addEventListener("resize", alAjustar);

    return () => {
      window.removeEventListener("resize", alAjustar);
      juego.destruir();
      corredor.current = null;
      gsap.set([listo, finEl], { autoAlpha: 0 });
      stage.dataset.clima = def.clima;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jugando, codigo]);

  /* Teclado y toque: espacio empieza o salta, ↓ cae rápido, Esc sale. */
  useEffect(() => {
    const stage = refs.stage.current;
    if (!stage) return;
    const visible = () => {
      const r = stage.getBoundingClientRect();
      const solape = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      return solape > Math.min(r.height, window.innerHeight) * 0.6;
    };
    const alTecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input,textarea,select,[contenteditable='true']")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (jugandoRef.current) {
        if (e.key === "Escape") setJugando(false);
        else if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w") {
          e.preventDefault();
          if (!e.repeat) corredor.current?.saltar();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          corredor.current?.bajar(true);
        }
        return;
      }
      // Fuera del juego, el espacio solo lo inicia si la escena está a la vista; si no, la página se desplaza como siempre.
      if (!vistaPrevia && e.code === "Space" && !t?.closest?.("button,a,summary") && visible()) {
        e.preventDefault();
        empezar();
      }
    };
    const alSoltar = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") corredor.current?.bajar(false);
    };
    const alToque = (e: PointerEvent) => {
      if (!jugandoRef.current) return;
      if ((e.target as HTMLElement).closest("button,a,.err-fin")) return;
      corredor.current?.saltar();
    };
    window.addEventListener("keydown", alTecla);
    window.addEventListener("keyup", alSoltar);
    stage.addEventListener("pointerdown", alToque);
    return () => {
      window.removeEventListener("keydown", alTecla);
      window.removeEventListener("keyup", alSoltar);
      stage.removeEventListener("pointerdown", alToque);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaPrevia]);

  function empezar() {
    if (jugandoRef.current) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setJugando(true);
    refs.stage.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function alternarSonido() {
    const nuevo = !mudo;
    setMudo(nuevo);
    try {
      window.localStorage.setItem(CLAVE_MUDO, nuevo ? "1" : "0");
    } catch {
      /* Sin almacenamiento, el ajuste dura mientras la página esté abierta. */
    }
  }

  const Titulo = vistaPrevia ? "h3" : "h1";
  const bloqueada = (i: number) => lista[i]?.deshabilitada || (codigo === "429" && i === 0 && enfriando > 0);
  const inerte = jugando ? ({ inert: "" } as Record<string, string>) : {};

  return (
    <div className="err-marco" ref={refs.marco} data-compacto={vistaPrevia || undefined}>
      <div ref={refs.stage} className={`err-escena${jugando ? " is-playing" : ""}`} data-clima={def.clima} data-codigo={codigo}>
        <div className="err-capa err-cielo" ref={refs.cielo} aria-hidden="true">
          <div className="err-estrellas">
            {estrellas.map((s, i) => (
              <i key={i} style={{ left: `${s.left}%`, top: `${s.top}%`, animationDelay: `${s.delay}s`, ...(s.grande ? { width: 6, height: 6 } : {}) }} />
            ))}
          </div>
          <div className="err-orbe" />
          {nubes.map((n, i) => (
            <img key={i} className="err-nube" src={sprite("cloud").src} alt="" width={n.ancho} style={{ top: `${n.top}%`, width: n.ancho, animationDuration: `${n.dur}s`, animationDelay: `${n.retraso}s` }} />
          ))}
        </div>
        <div className="err-capa err-edificio" ref={refs.edificio} aria-hidden="true" dangerouslySetInnerHTML={{ __html: EDIFICIO_SVG }} />
        <div className="err-capa err-suelo" ref={refs.suelo} aria-hidden="true" />
        {codigo === "503" && !jugando && <Conos />}
        <div className="err-capa err-fx" ref={refs.fx} aria-hidden="true" />

        <div className="err-actor" ref={refs.actor}>
          <div className="err-sombra" />
          <img className="err-p err-g err-g2" ref={refs.g2} src={rutaPose(pose)} alt="" aria-hidden="true" />
          <img className="err-p err-g err-g1" ref={refs.g1} src={rutaPose(pose)} alt="" aria-hidden="true" />
          <div style={{ position: "absolute", left: 0, bottom: 0, width: 0, height: 0 }}>
            <img className="err-p" ref={refs.pilo} src={rutaPose(pose)} alt="Pilo, el cóndor mascota de la UDES" />
            <button className="err-hit" ref={refs.hit} type="button" aria-label="Saludar a Pilo" onClick={() => {
              const stage = refs.stage.current, fx = refs.fx.current, pilo = refs.pilo.current;
              if (!stage || !fx || !pilo) return;
              if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                gsap.fromTo(mov.current, { hop: 0 }, { hop: -70, duration: 0.22, ease: "power2.out", yoyo: true, repeat: 1, overwrite: "auto" });
                const h = posCabeza(stage, pilo);
                for (let i = 0; i < 3; i++) lanzar(fx, def.deco, { x: h.x + (i - 1) * 40, y: h.y - 10, w: 26, dx: (i - 1) * 50, dy: -90 - i * 20, rot: (i - 1) * 40, dur: 1 });
              }
              const dicho = refs.dicho.current;
              if (dicho) dicho.textContent = def.frases[Math.floor(Math.random() * def.frases.length)];
              gsap.to(refs.globo.current, { opacity: 1, duration: 0.1 });
            }} />
            <div className="err-globo" ref={refs.globo} aria-hidden="true">
              <span ref={refs.dicho} />
              <i />
            </div>
          </div>
        </div>

        <div className="err-capa err-juego" ref={refs.juego} aria-hidden="true" />
        <div className="err-capa err-tinte" aria-hidden="true" />
        <div className="err-capa err-flash" ref={refs.flash} aria-hidden="true" />

        <section className="err-panel" ref={refs.panel} aria-hidden={jugando || undefined} {...inerte}>
          <svg className="err-deco err-deco--zig" viewBox="0 0 70 14" shapeRendering="crispEdges" aria-hidden="true">
            <path d="M0 10h6v-6h6v6h6v-6h6v6h6v-6h6v6h6v-6h6v6h6" fill="none" stroke="#1F3FA8" strokeWidth="3" />
          </svg>
          <span className="err-deco err-deco--dot" aria-hidden="true" />
          <span className="err-deco err-deco--rect" aria-hidden="true" />
          <div className="err-burst" ref={refs.burst} aria-hidden="true" />
          <div className="err-pin" ref={refs.pin}>
            <span className="err-tag">
              <span className="sr-only">Error {codigo}. </span>
              {def.etiqueta}
            </span>
            <div className="err-code" ref={refs.codigo} aria-hidden="true">{codigo}</div>
            <Titulo className="err-ttl">{textoTitulo}</Titulo>
            <p className="err-txt">{textoMensaje}</p>
            <div className="err-slot">
              <Ficha def={def} ruta={ruta} traza={traza} regreso={regreso} espera={enfriando} />
              {extra}
            </div>
            <div className="err-acts">
              {lista.map((a, i) => {
                const clase = `err-btn err-btn--${a.tipo ?? (i === 0 ? "pri" : "sec")}`;
                if (a.a && !bloqueada(i)) {
                  return /^https?:/i.test(a.a) ? (
                    <a key={a.texto} className={clase} href={a.a} target="_blank" rel="noopener noreferrer">{a.texto}</a>
                  ) : (
                    <Link key={a.texto} className={clase} to={a.a}>{a.texto}</Link>
                  );
                }
                return (
                  <button key={a.texto} type="button" className={clase} disabled={bloqueada(i)} onClick={a.alPulsar}>
                    {a.texto}
                  </button>
                );
              })}
              <button type="button" className="err-btn err-btn--play" onClick={empezar}>Jugar con Pilo</button>
            </div>
          </div>
        </section>

        <div className="err-hud">
          <div className="err-hud__izq">
            <button className="err-gbtn" type="button" onClick={() => setJugando(false)}>ESC · SALIR</button>
            <button className="err-gbtn" type="button" onClick={alternarSonido} aria-pressed={!mudo}>SONIDO: {mudo ? "NO" : "SI"}</button>
          </div>
          <div className="err-puntos" ref={refs.marcador} aria-hidden="true" />
        </div>
        <div className="err-listo" ref={refs.listo} role="status">Toca la pantalla o presiona ESPACIO para correr y saltar</div>
        <div className="err-fin" ref={refs.fin} role="status">
          <h2>GAME OVER</h2>
          <p>{fin ? `¡Ouch! Pilo tropezó con ${fin.obstaculo}. Puntaje ${String(fin.puntos).padStart(5, "0")}.` : ""}</p>
          <div className="err-acts">
            <button className="err-btn err-btn--pri" type="button" onClick={() => corredor.current && (corredor.current.saltar())}>Jugar otra vez</button>
            <button className="err-btn err-btn--sec" type="button" onClick={() => setJugando(false)}>Volver</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Los conos de obra del 503, pegados al suelo. */
function Conos() {
  const s = sprite("cone");
  return (
    <div className="err-conos" aria-hidden="true">
      {[[6, 38], [33, 30], [90, 36]].map(([izq, ancho]) => (
        <img key={izq} src={s.src} alt="" width={ancho} height={Math.round((ancho * s.h) / s.w)} style={{ left: `${izq}%`, width: ancho }} />
      ))}
    </div>
  );
}

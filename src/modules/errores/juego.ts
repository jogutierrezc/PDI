/* =============================================================================
   Páginas de error · el corredor de Pilo.

   Un minijuego al estilo del dinosaurio de Chrome sin conexión: Pilo corre,
   salta obstáculos y recoge monedas. Este archivo es el motor; no sabe de React.
   Recibe los elementos donde dibujar y los mueve cuadro a cuadro desde el
   ticker de GSAP (el mismo reloj de la escena).

   Las unidades son píxeles de pantalla multiplicados por `k`, la escala de
   Pilo respecto de su tamaño base de 276 px, para que el juego se sienta igual
   en el teléfono y en un monitor grande.
   ========================================================================== */

import gsap from "gsap";
import { imagenSprite, sprite } from "./sprites";
import type { SpriteNombre } from "./sprites";
import { NOMBRE_OBSTACULO } from "./datos";
import type { Clima } from "./datos";

/** El movimiento de Pilo que comparte con la escena (ella lo dibuja). */
export interface Movimiento {
  x: number;
  g1: number;
  g2: number;
  y: number;
  hop: number;
  rot: number;
}

export type EstadoJuego = "listo" | "corriendo" | "fin";

export interface ResultadoJuego {
  puntos: number;
  record: number;
  obstaculo: string;
}

export interface OpcionesCorredor {
  stage: HTMLElement;
  capa: HTMLElement;
  suelo: HTMLElement;
  pilo: HTMLImageElement;
  marcador: HTMLElement;
  mov: Movimiento;
  obstaculos: SpriteNombre[];
  climaInicial: Clima;
  /** ¿Suenan los pitidos? Se consulta en cada sonido, para que el botón de silencio surta efecto al instante. */
  sonido: () => boolean;
  alTerminar: (r: ResultadoJuego) => void;
  alEmpezar: () => void;
  /** Se llama en cada choque para que la escena eche chispas. */
  alChocar: () => void;
  alCambiarClima: (c: Clima) => void;
}

interface Pieza {
  tipo: "obstaculo" | "moneda";
  el: HTMLImageElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

const CLIMAS: Clima[] = ["day", "dusk", "night", "storm"];
const CLAVE_RECORD = "pilo-hi";
const rellenar = (n: number) => String(Math.max(0, Math.floor(n))).padStart(5, "0");

function leerRecord(): number {
  try {
    return Number(window.localStorage.getItem(CLAVE_RECORD)) || 0;
  } catch {
    return 0;
  }
}

function guardarRecord(valor: number) {
  try {
    window.localStorage.setItem(CLAVE_RECORD, String(valor));
  } catch {
    /* Sin almacenamiento, el récord dura lo que dure la pestaña. */
  }
}

export class Corredor {
  estado: EstadoJuego = "listo";
  private o: OpcionesCorredor;
  private piezas: Pieza[] = [];
  private t = 0;
  private distancia = 0;
  private bonus = 0;
  private velocidad = 0;
  private salto = 0; // altura sobre el suelo
  private vSalto = 0;
  private cae = false;
  private siguiente = 1.3;
  private ultimo = 0;
  private hito = 0;
  private mostrado = -1;
  private fin = 0;
  private record = leerRecord();
  private climaBase = 0;
  private ultimoObstaculo: SpriteNombre = "cone";
  // geometría
  private W = 0;
  private suelo = 0;
  private ph = 276;
  private k = 1;
  private px = 0;
  private pw = 0;
  private audio: AudioContext | null = null;
  private tick = () => this.cuadro();

  constructor(opciones: OpcionesCorredor) {
    this.o = opciones;
    this.medir();
    this.reiniciar();
    gsap.ticker.add(this.tick);
  }

  /** Las medidas dependen del tamaño de la escena: se rehacen al empezar y al cambiar la ventana. */
  medir() {
    const { stage, suelo, pilo } = this.o;
    this.W = stage.clientWidth;
    this.suelo = stage.clientHeight - suelo.offsetHeight + 14;
    this.ph = pilo.offsetHeight || 276;
    this.k = this.ph / 276;
    // Mismo corte que el CSS de la escena: se decide por el ancho de la escena, no de la ventana.
    this.px = this.W * (this.W >= 960 ? 0.17 : 0.15);
    this.pw = pilo.getBoundingClientRect().width || this.ph * 0.49;
  }

  reiniciar() {
    this.limpiarPiezas();
    this.t = this.distancia = this.bonus = 0;
    this.salto = this.vSalto = 0;
    this.cae = false;
    this.siguiente = 1.3;
    this.ultimo = 0;
    this.hito = 0;
    this.mostrado = -1;
    this.velocidad = 380 * this.k;
    this.climaBase = Math.max(0, CLIMAS.indexOf(this.o.climaInicial));
    this.o.alCambiarClima(this.o.climaInicial);
    Object.assign(this.o.mov, { x: 0, g1: 0, g2: 0, y: 0, hop: 0, rot: 0 });
    this.estado = "listo";
    this.pintar(0, true);
  }

  /** Salto, y también el primer toque que echa a correr o el que reinicia tras un choque. */
  saltar() {
    if (this.estado === "fin") {
      if (performance.now() - this.fin < 600) return;
      this.reiniciar();
      this.estado = "corriendo";
      this.o.alEmpezar();
    } else if (this.estado === "listo") {
      this.estado = "corriendo";
      this.o.alEmpezar();
    }
    if (this.salto === 0 && this.vSalto === 0) {
      this.vSalto = 880 * this.k;
      this.pitido(520, 0.13, "square", 0.035, 320);
    }
  }

  bajar(valor: boolean) {
    this.cae = valor;
  }

  destruir() {
    gsap.ticker.remove(this.tick);
    this.limpiarPiezas();
    this.o.suelo.style.backgroundPosition = "";
    Object.assign(this.o.mov, { x: 0, g1: 0, g2: 0, y: 0, hop: 0, rot: 0 });
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
  }

  /* --- Sonido: pitidos de 8 bits, solo después de un gesto del usuario ------------------------- */

  pitido(frecuencia: number, duracion = 0.08, tipo: OscillatorType = "square", volumen = 0.035, desliza = 0) {
    if (!this.o.sonido()) return;
    try {
      const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Contexto) return;
      this.audio = this.audio ?? new Contexto();
      const osc = this.audio.createOscillator();
      const ganancia = this.audio.createGain();
      const t = this.audio.currentTime;
      osc.type = tipo;
      osc.frequency.setValueAtTime(frecuencia, t);
      if (desliza) osc.frequency.linearRampToValueAtTime(frecuencia + desliza, t + duracion);
      ganancia.gain.setValueAtTime(volumen, t);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
      osc.connect(ganancia);
      ganancia.connect(this.audio.destination);
      osc.start(t);
      osc.stop(t + duracion);
    } catch {
      /* Sin audio, el juego sigue en silencio. */
    }
  }

  /* --- Interior ----------------------------------------------------------------------------- */

  private limpiarPiezas() {
    this.piezas.forEach((p) => p.el.remove());
    this.piezas = [];
    this.o.capa.innerHTML = "";
  }

  private puntos() {
    return Math.floor(this.distancia / (40 * this.k)) + this.bonus;
  }

  private pintar(puntos: number, forzar = false) {
    if (puntos === this.mostrado && !forzar) return;
    this.mostrado = puntos;
    this.o.marcador.innerHTML = `<small>HI ${rellenar(Math.max(this.record, puntos))}</small>${rellenar(puntos)}`;
  }

  private aparecer() {
    const { k } = this;
    const tipos = this.o.obstaculos;
    const tipo = tipos[Math.floor(Math.random() * tipos.length)] ?? "cone";
    const s = sprite(tipo);
    const w = s.w * Math.max(4, Math.round((5 + Math.random() * 2) * k));
    const n = Math.random() < 0.3 ? 2 : 1;
    const x0 = this.W + 50;
    for (let i = 0; i < n; i++) {
      const el = imagenSprite(tipo, w);
      const h = parseFloat(el.style.height);
      this.o.capa.appendChild(el);
      this.piezas.push({ tipo: "obstaculo", el, x: x0 + i * (w + 4), y: this.suelo - h, w, h });
    }
    if (Math.random() < 0.6) {
      // Un arco de tres monedas sobre el obstáculo: obliga a saltar y paga por hacerlo.
      const cw = 8 * Math.max(4, Math.round(5 * k));
      const medio = x0 + (n * w) / 2;
      for (const [d, altura] of [[-1, 0.98], [0, 1.14], [1, 0.98]] as const) {
        const el = imagenSprite("coin", cw);
        this.o.capa.appendChild(el);
        this.piezas.push({ tipo: "moneda", el, x: medio + d * cw * 1.7 - cw / 2, y: this.suelo - this.ph * altura - cw / 2, w: cw, h: cw });
      }
    }
    this.ultimoObstaculo = tipo;
    this.siguiente = 1.05 + Math.random() * 0.9 + (n * w + 120 * k) / this.velocidad;
  }

  private choque() {
    this.estado = "fin";
    this.fin = performance.now();
    const puntos = this.puntos();
    if (puntos > this.record) {
      this.record = puntos;
      guardarRecord(puntos);
    }
    this.pintar(puntos, true);
    this.pitido(200, 0.45, "sawtooth", 0.05, -140);
    this.o.alChocar();
    this.o.alTerminar({ puntos, record: this.record, obstaculo: NOMBRE_OBSTACULO[this.ultimoObstaculo] ?? "un obstáculo" });
  }

  private cuadro() {
    const { mov, suelo } = this.o;
    const ahora = performance.now();
    const dt = Math.min(0.05, (ahora - (this.ultimo || ahora)) / 1000);
    this.ultimo = ahora;
    if (this.estado === "listo") {
      mov.y = -Math.abs(Math.sin(ahora / 240)) * 4;
      mov.rot = 0;
      return;
    }
    if (this.estado === "fin") {
      mov.y = 0;
      return;
    }
    const { k } = this;
    this.t += dt;
    this.velocidad = k * Math.min(900, 380 + this.t * 9);
    this.distancia += this.velocidad * dt;

    if (this.salto > 0 || this.vSalto !== 0) {
      this.vSalto -= (this.cae ? 5600 : 2600) * k * dt;
      this.salto += this.vSalto * dt;
      if (this.salto <= 0) this.salto = this.vSalto = 0;
    }
    mov.hop = -this.salto;
    if (this.salto === 0) {
      const p = Math.sin(this.t * (12 + this.velocidad / (70 * k)));
      mov.y = -Math.abs(p) * 6 * k;
      mov.rot = p * 2.5;
    } else {
      mov.y = 0;
      mov.rot = this.vSalto > 0 ? -6 : 4;
    }
    suelo.style.backgroundPosition = `0 0, ${-(this.distancia % 48)}px 0, 0 0`;

    this.siguiente -= dt;
    if (this.siguiente <= 0) this.aparecer();

    // La caja de Pilo es más pequeña que su dibujo: así el choque se siente justo.
    const hw = this.pw * 0.28;
    const L = this.px - hw;
    const R = this.px + hw;
    const T = this.suelo - this.salto - this.ph * 0.88;
    const B = this.suelo - this.salto - this.ph * 0.06;
    for (let i = this.piezas.length - 1; i >= 0; i--) {
      const p = this.piezas[i];
      p.x -= this.velocidad * dt;
      p.el.style.transform = `translate(${p.x}px,${p.y}px)`;
      if (p.x + p.w < -20) {
        p.el.remove();
        this.piezas.splice(i, 1);
        continue;
      }
      const ix = p.tipo === "obstaculo" ? p.w * 0.16 : 0;
      const iy = p.tipo === "obstaculo" ? p.h * 0.12 : 0;
      if (R > p.x + ix && L < p.x + p.w - ix && B > p.y + iy && T < p.y + p.h) {
        if (p.tipo === "moneda") {
          this.bonus += 10;
          p.el.remove();
          this.piezas.splice(i, 1);
          this.pitido(988, 0.09, "square", 0.03, 440);
        } else {
          this.choque();
          return;
        }
      }
    }

    const puntos = this.puntos();
    this.pintar(puntos);
    const hito = Math.floor(puntos / 100);
    if (hito > this.hito) {
      this.hito = hito;
      this.pitido(880, 0.12, "square", 0.03, 440);
      gsap.fromTo(this.o.marcador, { scale: 1.18 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
      // Cada 250 puntos cambia el cielo: día, atardecer, noche, tormenta.
      this.o.alCambiarClima(CLIMAS[(this.climaBase + Math.floor(puntos / 250)) % CLIMAS.length]);
    }
  }
}

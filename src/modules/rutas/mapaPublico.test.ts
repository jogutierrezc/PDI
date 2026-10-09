// @vitest-environment jsdom
/* El mapa público en jsdom, con el lienzo y los observadores simulados.
   No prueba el dibujo (eso se ve en pantalla): prueba el panel, la selección, la
   composición por tamaño y que plegar y desplegar no pierde el estado. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { montarPublico } from "./mapaPublico";
import type { ApiPublico, DatosPublicos, GsapLike } from "./tiposPublico";

const win = document.defaultView as unknown as Record<string, unknown> & Window;

// Una ruta de juguete: 6 paradas en línea, la última es el regreso a la UDES.
const coords: [number, number][] = [];
for (let i = 0; i <= 50; i++) coords.push([-73.095 - i * 0.0002, 7.105 + (i < 25 ? i : 50 - i) * 0.0001]);
const DATOS: DatosPublicos = {
  ruta: {
    id: "r1",
    codigo: "R1",
    nombre: "Ruta del bus UDES",
    coords,
    legs: [500, 500, 500, 500, 500],
    duracionS: 900,
    stops: [
      { name: "Parqueadero UDES", lon: coords[0][0], lat: coords[0][1] },
      { name: "Cra 45 · Calle 65", lon: coords[10][0], lat: coords[10][1] },
      { name: "Cra 45 · Calle 62", lon: coords[20][0], lat: coords[20][1] },
      { name: "Calle 56 · Cra 37", lon: coords[30][0], lat: coords[30][1] },
      { name: "Torres de Monterrey", lon: coords[40][0], lat: coords[40][1] },
      { name: "Parqueadero UDES", lon: coords[50][0], lat: coords[50][1] },
    ],
    horario: { primeraMin: 330, ultimaMin: 1260, intervaloMin: 15, paradaCampusMin: 5 },
    actualizado: "2026-10-09T12:00:00Z",
  },
  vias: [],
};

/** GSAP de mentira: aplica el valor final al instante. */
const gsapInstantaneo: GsapLike = {
  to(t, v) {
    for (const [k, val] of Object.entries(v)) if (typeof val === "number" && !["duration", "delay"].includes(k)) (t as Record<string, number>)[k] = val;
    return {};
  },
  timeline() {
    const tl = {
      to: (t: object, v: Record<string, unknown>) => (gsapInstantaneo.to(t, v), tl),
      fromTo: (t: object, _a: Record<string, unknown>, b: Record<string, unknown>) => (gsapInstantaneo.to(t, b), tl),
      progress: () => tl,
      kill: () => tl,
    };
    return tl;
  },
  killTweensOf() {},
};

let dims = { w: 390, h: 844 };
let avisoResize: (() => void) | null = null;
let raiz: HTMLElement;
let api: ApiPublico;

beforeEach(() => {
  dims = { w: 390, h: 844 };
  const proxyCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => proxyCtx) as never);
  for (const [k, f] of [
    ["offsetWidth", () => dims.w],
    ["offsetHeight", () => dims.h],
    ["clientWidth", () => dims.w],
    ["clientHeight", () => dims.h],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: f });
  }
  Object.defineProperty(Element.prototype, "setPointerCapture", { configurable: true, value() {} });
  win.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  win.ResizeObserver = class {
    constructor(cb: () => void) {
      avisoResize = cb;
    }
    observe() {}
    disconnect() {}
  } as never;
  win.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  } as never;
  win.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0)) as never;
  win.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as never;
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  api = montarPublico(raiz, DATOS, { teselas: false, logoSrc: "/logo-udes.svg", logoOscuroSrc: "/boletin/logo-udes-blanco.png", inicioHref: "/", gsap: gsapInstantaneo });
});

afterEach(() => {
  api.destruir();
  raiz.remove();
  vi.restoreAllMocks();
});

const q = <T extends Element = HTMLElement>(s: string) => raiz.querySelector(s) as T;
const redimensionar = (w: number, h: number) => {
  dims = { w, h };
  avisoResize?.();
};

describe("lo que se ve", () => {
  it("lleva la marca, el nombre de la página y la atribución de OpenStreetMap", () => {
    expect(q(".rpub-titulo").textContent).toBe("Ruta del bus UDES");
    expect(q(".rpub-marca").getAttribute("href")).toBe("/");
    expect(q(".rpub-atrib").textContent).toContain("© colaboradores de OpenStreetMap");
    expect(q<HTMLImageElement>(".rpub-logo--claro").getAttribute("src")).toBe("/logo-udes.svg");
    expect(q<HTMLImageElement>(".rpub-logo--oscuro").getAttribute("src")).toContain("logo-udes-blanco");
  });

  it("dice con claridad que es una simulación y no la posición real", () => {
    expect(q(".rpub-aviso").textContent).toContain("Simulación según el horario");
    expect(q(".rpub-aviso").textContent).toContain("No es la posición real");
    expect(q(".rpub-pie").textContent).toContain("no hay GPS");
    expect(raiz.textContent?.toLowerCase()).not.toContain("tiempo real");
  });

  it("lista las paradas: la UDES y las intermedias, sin repetir el regreso", () => {
    const items = raiz.querySelectorAll(".rpub-parada");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain("Parqueadero UDES");
    expect(items[1].textContent).toContain("Cra 45 · Calle 65");
    expect(items[1].textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it("el mapa tiene alternativa en lista y controles con nombre", () => {
    expect(q(".rpub-lienzo").getAttribute("aria-label")).toContain("lista de paradas");
    for (const b of raiz.querySelectorAll(".rpub-btn")) expect(b.getAttribute("aria-label")).toBeTruthy();
  });

  it("muestra el próximo bus con la hora de la salida", () => {
    expect(q(".rpub-prox-rotulo").textContent).toBe("Próximo bus desde la UDES");
    expect(q(".rpub-prox-hora").textContent).toMatch(/\d{1,2}:\d{2} (a\. m\.|p\. m\.|m\.)/);
  });

  it("el horario muestra la primera salida, la última y el intervalo", () => {
    q<HTMLButtonElement>('[data-pest="horario"]').click();
    expect(q("#rpub-p-horario").hidden).toBe(false);
    expect(q("#rpub-p-paradas").hidden).toBe(true);
    expect(q(".rpub-datos").textContent).toContain("5:30");
    expect(q(".rpub-datos").textContent).toContain("9:00");
    expect(q(".rpub-datos").textContent).toContain("15");
    expect(raiz.querySelectorAll(".rpub-salidas li")).toHaveLength(63);
  });
});

describe("selección de parada", () => {
  it("al elegir una parada el panel habla de esa parada", () => {
    raiz.querySelectorAll<HTMLButtonElement>(".rpub-parada")[2].click();
    expect(api.estado().parada).toBe(2);
    expect(q(".rpub-prox-rotulo").textContent).toContain("Cra 45 · Calle 62");
    expect(raiz.querySelectorAll('.rpub-parada[aria-pressed="true"]')).toHaveLength(1);
    expect(q(".rpub-quitar").hidden).toBe(false);
  });

  it("volver a tocarla, o «Ver desde la UDES», la quita", () => {
    api.elegirParada(3);
    q<HTMLButtonElement>('[data-ac="quitar"]').click();
    expect(api.estado().parada).toBeNull();
    api.elegirParada(3);
    raiz.querySelectorAll<HTMLButtonElement>(".rpub-parada")[3].click();
    expect(api.estado().parada).toBeNull();
  });

  it("elegir una parada acerca el mapa", () => {
    const antes = api.estado().camara.z;
    api.elegirParada(2);
    expect(api.estado().camara.z).toBeGreaterThanOrEqual(Math.min(16.2, antes));
  });
});

describe("composición por tamaño, no por modelo", () => {
  const casos: [string, number, number, string][] = [
    ["celular", 390, 844, "hoja"],
    ["Fold cerrado (angosto, 23:9)", 344, 882, "hoja"],
    ["Flip, pantalla interior alta", 412, 960, "hoja"],
    ["Fold desplegado (casi cuadrado)", 880, 1100, "panel"],
    ["tableta vertical", 768, 1024, "panel"],
    ["celular horizontal", 844, 390, "panel"],
  ];
  it.each(casos)("%s", (_n, w, h, modo) => {
    redimensionar(w, h);
    expect(raiz.getAttribute("data-modo")).toBe(modo);
  });

  it("a medio plegar se fuerza mapa arriba y panel abajo", () => {
    api.forzarModo("partido");
    expect(raiz.getAttribute("data-modo")).toBe("partido");
    api.forzarModo(null);
    expect(raiz.getAttribute("data-modo")).toBe("hoja");
  });
});

describe("plegar y desplegar no pierde el estado", () => {
  it("conserva la parada, la pestaña, la hoja, la cámara y la hora", () => {
    q<HTMLButtonElement>('[data-ac="jugar"]').click(); // pausa: la hora queda fija
    api.elegirParada(3);
    q<HTMLButtonElement>('[data-pest="horario"]').click();
    q<HTMLButtonElement>(".rpub-asa").click();
    const antes = api.estado();
    expect(antes.jugando).toBe(false);

    for (const [w, h] of [
      [880, 1100],
      [344, 882],
      [412, 960],
      [880, 1100],
    ]) {
      redimensionar(w, h);
      const ahora = api.estado();
      expect(ahora.parada).toBe(antes.parada);
      expect(ahora.pestana).toBe("horario");
      expect(ahora.hoja).toBe(antes.hoja);
      expect(ahora.hora).toBe(antes.hora);
      expect(ahora.camara.z).toBeCloseTo(antes.camara.z, 6);
      expect(ahora.camara.cx).toBeCloseTo(antes.camara.cx, 9);
      expect(ahora.camara.cy).toBeCloseTo(antes.camara.cy, 9);
    }
    expect(raiz.querySelector('.rpub-parada[aria-pressed="true"]')).not.toBeNull();
  });

  it("no vuelve a armar el panel: los mismos nodos siguen en pantalla", () => {
    const lista = q(".rpub-lista");
    const primero = lista.firstElementChild;
    redimensionar(880, 1100);
    redimensionar(390, 844);
    expect(q(".rpub-lista")).toBe(lista);
    expect(lista.firstElementChild).toBe(primero);
  });
});

describe("la hoja", () => {
  it("el asa la sube de punto en punto y avisa a los lectores de pantalla", () => {
    const asa = q<HTMLButtonElement>(".rpub-asa");
    expect(api.estado().hoja).toBe("asomada");
    expect(asa.getAttribute("aria-expanded")).toBe("false");
    asa.click();
    expect(api.estado().hoja).toBe("media");
    expect(asa.getAttribute("aria-expanded")).toBe("true");
    asa.click();
    expect(api.estado().hoja).toBe("abierta");
    asa.click();
    expect(api.estado().hoja).toBe("asomada");
  });

  it("asomada, el contenido de abajo no recibe el foco", () => {
    expect((q(".rpub-resto") as HTMLElement & { inert: boolean }).inert).toBe(true);
    q<HTMLButtonElement>(".rpub-asa").click();
    expect((q(".rpub-resto") as HTMLElement & { inert: boolean }).inert).toBe(false);
  });

  it("en pantallas amplias el panel no se arrastra ni se oculta", () => {
    redimensionar(880, 1100);
    expect((q(".rpub-resto") as HTMLElement & { inert: boolean }).inert).toBe(false);
    expect(q(".rpub-hoja").style.transform).toBe("");
  });
});

describe("la simulación", () => {
  it("la hora que se elige se respeta y mueve el próximo bus", () => {
    q<HTMLButtonElement>('[data-pest="horario"]').click();
    const campo = q<HTMLInputElement>(".rpub-hora");
    campo.value = "07:20";
    campo.dispatchEvent(new Event("change"));
    expect(api.estado().jugando).toBe(true);
    expect(Math.round(api.estado().hora / 60)).toBeGreaterThanOrEqual(7 * 60 + 20);
    expect(q(".rpub-prox-hora").textContent).toContain("7:30");
  });

  it("pausar congela la hora y se puede reproducir de nuevo", () => {
    const boton = q<HTMLButtonElement>('[data-ac="jugar"]');
    boton.click();
    const h1 = api.estado().hora;
    expect(boton.getAttribute("aria-label")).toBe("Reproducir la simulación");
    expect(api.estado().hora).toBe(h1);
    boton.click();
    expect(api.estado().jugando).toBe(true);
  });

  it("destruir deja la página limpia", () => {
    api.destruir();
    expect(raiz.innerHTML).toBe("");
    expect(raiz.classList.contains("rpub")).toBe(false);
  });
});

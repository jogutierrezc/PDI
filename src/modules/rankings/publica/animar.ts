/* =============================================================================
   Pilo Publica · movimiento del informe, con GSAP (useGSAP).

   · El contenido está completo en reposo. Lo que está en el primer pantallazo
     se anima en el acto (from); solo lo que queda por debajo espera su
     disparador de scroll, y antes de imprimir todo se revela.
   · Cifras que cuentan, gráficos que se trazan, subrayados, ejes con imagen
     que se revela, carrusel que entra y barra de progreso de lectura.
   · prefers-reduced-motion y settings.motion = «none»: no se anima nada.
   · compacto (vista previa dentro de la intranet): sin disparadores de scroll;
     todo corre una vez al montar.
   ========================================================================== */

import { useEffect } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Idioma, Movimiento } from "./tipos";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export const reducido = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

interface Opciones {
  movimiento: Movimiento;
  compacto: boolean;
  /** Cambia cuando cambia la estructura del informe (bloques, edición…). */
  clave: string;
  idioma: Idioma;
}

export function useAnimarInforme(ref: RefObject<HTMLElement>, o: Opciones) {
  const { movimiento, compacto, clave } = o;

  useGSAP(
    () => {
      const R = ref.current;
      if (!R || reducido() || movimiento === "none") return;
      const q = <E extends Element = HTMLElement>(s: string) => Array.from(R.querySelectorAll<E>(s));
      const ed = movimiento === "editorial";
      const dur = ed ? 0.9 : 0.5;
      const dist = ed ? 34 : 14;
      const debajo = (el: Element) => !compacto && el.getBoundingClientRect().top > window.innerHeight * 0.92;
      const al = (el: Element, vars: ScrollTrigger.Vars) => ScrollTrigger.create({ trigger: el, once: true, ...vars });

      // portada
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      const lineas = q(".pp-cover h1 .pp-ln > span");
      if (lineas.length) tl.from(lineas, { yPercent: 105, duration: dur, stagger: 0.1, clearProps: "transform" }, 0);
      const apoyo = q(".pp-cover .pp-eyebrow, .pp-cover .pp-lead, .pp-cover .pp-meta");
      if (apoyo.length) tl.from(apoyo, { y: dist / 2, opacity: 0, duration: dur * 0.8, stagger: 0.1, clearProps: "opacity,transform" }, 0.15);
      const ficha = q(".pp-tile");
      if (ed && ficha.length) tl.from(ficha, { scale: 0.7, rotate: -8, transformOrigin: "50% 50%", duration: 1.1, ease: "back.out(1.5)", clearProps: "transform" }, 0.1);
      if (ed) {
        const a = q(".pp-rings");
        const b = q(".pp-rings2");
        if (a.length) gsap.to(a, { rotation: 360, duration: 90, repeat: -1, ease: "none", transformOrigin: "200px 200px" });
        if (b.length) gsap.to(b, { rotation: -360, duration: 60, repeat: -1, ease: "none", transformOrigin: "200px 200px" });
      }

      // barra de progreso de lectura
      const prog = q(".pp-prog b");
      if (prog.length && !compacto) gsap.fromTo(prog, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: R, start: "top top", end: "bottom bottom", scrub: 0.3 } });

      // subrayados de título
      q(".pp-sec h2 + .pp-ul").forEach((u) => {
        if (debajo(u)) gsap.from(u, { scaleX: 0, duration: 0.7, ease: "power2.out", transformOrigin: "left", scrollTrigger: { trigger: u, start: "top 90%", once: true } });
        else if (compacto) gsap.from(u, { scaleX: 0, duration: 0.7, ease: "power2.out", transformOrigin: "left" });
      });

      // cifras que cuentan
      q(".pp-kc b[data-n]").forEach((b) => {
        const n = Number(b.dataset.n);
        if (!Number.isFinite(n)) return;
        const dec = Number(b.dataset.dec ?? 0);
        const sfx = b.dataset.sfx ?? "";
        const loc = b.dataset.lang === "en" ? "en-US" : "es-CO";
        const f = (v: number) => v.toLocaleString(loc, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + sfx;
        const o2 = { v: 0 };
        const correr = () =>
          gsap.to(o2, { v: n, duration: ed ? 1.6 : 0.9, ease: "power2.out", onUpdate: () => (b.textContent = f(o2.v)), onComplete: () => (b.textContent = f(n)) });
        if (debajo(b)) {
          b.textContent = f(0);
          al(b, { start: "top 92%", onEnter: correr });
        } else correr();
      });
      q(".pp-kc").forEach((c) => {
        if (debajo(c)) {
          gsap.set(c, { y: dist, opacity: 0 });
          al(c, { start: "top 92%", onEnter: () => gsap.to(c, { y: 0, opacity: 1, duration: dur * 0.8, ease: "power2.out", clearProps: "opacity,transform" }) });
        }
      });

      // gráficos
      q(".pp-cc").forEach((c) => {
        const trazar = () => {
          const t = gsap.timeline({ defaults: { ease: "power2.out" } });
          const br = Array.from(c.querySelectorAll(".pp-br"));
          const ln = Array.from(c.querySelectorAll(".pp-ln"));
          const ar = Array.from(c.querySelectorAll(".pp-ar"));
          const dt = Array.from(c.querySelectorAll(".pp-dt"));
          const dn = Array.from(c.querySelectorAll(".pp-dn"));
          const lv = Array.from(c.querySelectorAll(".pp-lv"));
          if (br.length) t.from(br, { scaleY: 0, duration: 0.8, stagger: 0.08, ease: "power3.out", clearProps: "transform" }, 0);
          if (ln.length) t.from(ln, { strokeDashoffset: 1, duration: 1.3, ease: "power2.inOut", clearProps: "strokeDashoffset" }, 0);
          if (ar.length) t.from(ar, { opacity: 0, duration: 1, clearProps: "opacity" }, 0.4);
          if (dt.length) t.from(dt, { scale: 0, transformOrigin: "center", transformBox: "fill-box", duration: 0.4, stagger: 0.15, ease: "back.out(2)", clearProps: "transform" }, 0.5);
          if (dn.length) t.from(dn, { attr: { "stroke-dasharray": "0 100" }, duration: 1.2, ease: "power3.out" }, 0);
          if (lv.length) t.from(lv, { opacity: 0, y: 6, duration: 0.5, clearProps: "opacity,transform" }, 0.9);
        };
        if (debajo(c)) {
          gsap.set(c, { opacity: 0, y: dist });
          al(c, {
            start: "top 88%",
            onEnter: () => {
              gsap.to(c, { opacity: 1, y: 0, duration: 0.6, clearProps: "opacity,transform" });
              trazar();
            },
          });
        } else trazar();
      });

      // ejes narrativos con imagen
      q(".pp-axis").forEach((a) => {
        const txt = Array.from(a.querySelectorAll(".pp-tag, h3, .pp-body p"));
        const clip = a.querySelector<HTMLElement>(".pp-clip");
        const img = a.querySelector<HTMLElement>(".pp-clip img");
        if (!debajo(a)) return;
        gsap.set(txt, { y: dist, opacity: 0 });
        al(a, { start: "top 85%", onEnter: () => gsap.to(txt, { y: 0, opacity: 1, duration: dur * 0.8, stagger: 0.1, ease: "power2.out", clearProps: "opacity,transform" }) });
        if (clip && img && ed) {
          gsap.set(clip, { clipPath: "inset(0 100% 0 0)" });
          gsap.set(img, { scale: 1.25 });
          al(a, {
            start: "top 80%",
            onEnter: () => {
              gsap.to(clip, { clipPath: "inset(0 0% 0 0)", duration: 1.1, ease: "power3.inOut", clearProps: "clipPath" });
              gsap.to(img, { scale: 1, duration: 1.6, ease: "power2.out", clearProps: "transform" });
            },
          });
        }
      });

      // noticias
      const nw = q(".pp-news");
      if (nw.length && debajo(nw[0])) {
        gsap.set(nw, { x: 60, opacity: 0 });
        al(nw[0], { start: "top 90%", onEnter: () => gsap.to(nw, { x: 0, opacity: 1, duration: 0.7, stagger: 0.09, ease: "power2.out", clearProps: "opacity,transform" }) });
      }

      // antes de imprimir se muestra todo
      const revelar = () => {
        ScrollTrigger.getAll().forEach((t) => t.kill());
        gsap.set(q(".pp-cc, .pp-kc, .pp-axis .pp-tag, .pp-axis h3, .pp-axis .pp-body p, .pp-news, .pp-clip, .pp-clip img"), { clearProps: "opacity,transform,clipPath" });
      };
      window.addEventListener("beforeprint", revelar);
      return () => window.removeEventListener("beforeprint", revelar);
    },
    { scope: ref, dependencies: [movimiento, compacto, clave], revertOnUpdate: true },
  );

  // los textos cambian de largo con el idioma: se recalculan los disparadores
  useEffect(() => {
    if (compacto) return;
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 60);
    return () => window.clearTimeout(id);
  }, [o.idioma, compacto]);
}

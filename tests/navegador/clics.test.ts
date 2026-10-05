/* =============================================================================
   Navegador de Mr. Pilo · qué se puede pulsar (navegador/src/clics.js).

   Lo más delicado del servicio: con la página armada, qué controles se pulsan
   para desplegar contenido y cuáles NUNCA. Es una función pura sobre la
   descripción de un control; aquí se prueba sin navegador.
   ========================================================================== */

import { describe, expect, it } from "vitest";
// @ts-expect-error El servicio es JavaScript: no trae tipos.
import { TOPES, clasificar, destino, parar, plano, rotulo, techoDeTexto, vecesDe } from "../../navegador/src/clics.js";

const URL_PAGINA = "https://www.udes.edu.co/admisiones?sede=cucuta";
const ctx = { url: URL_PAGINA };

interface Control {
  tag?: string;
  role?: string;
  type?: string;
  text?: string;
  href?: string | null;
  attrs?: Record<string, string>;
  insideForm?: boolean;
  ancestors?: string;
  context?: string;
  navLabel?: string;
  detailsOpen?: boolean;
}

const ver = (d: Control) => clasificar({ tag: "button", attrs: {}, insideForm: false, ancestors: "main div", context: "", ...d }, ctx) as { ok: boolean; kind: string | null; why: string };
const tab = (d: Control = {}) => ver({ role: "tab", text: "Posgrado", ...d, attrs: { "aria-selected": "false", "aria-controls": "p2", ...(d.attrs ?? {}) } });
const acordeon = (d: Control = {}) => ver({ text: "Requisitos de inscripción", ...d, attrs: { "aria-expanded": "false", "aria-controls": "a1", ...(d.attrs ?? {}) } });
const boton = (text: string, d: Control = {}) => ver({ text, ...d });

describe("lo que SÍ se pulsa", () => {
  it("una pestaña sin elegir", () => {
    expect(tab()).toMatchObject({ ok: true, kind: "pestaña" });
    expect(tab({ tag: "a", href: "#posgrado" })).toMatchObject({ ok: true, kind: "pestaña" });
    expect(tab({ tag: "li", attrs: { "aria-selected": "false" } })).toMatchObject({ ok: true, kind: "pestaña" });
    // La que ya está elegida no hace falta.
    expect(tab({ attrs: { "aria-selected": "true" } })).toMatchObject({ ok: false });
  });

  it("un disparador de acordeón plegado, con aria-controls", () => {
    expect(acordeon()).toMatchObject({ ok: true, kind: "acordeón" });
    expect(acordeon({ tag: "div", role: "button" })).toMatchObject({ ok: true, kind: "acordeón" });
    expect(acordeon({ tag: "a", href: "#a1" })).toMatchObject({ ok: true, kind: "acordeón" });
    expect(acordeon({ attrs: { "aria-expanded": "true" } })).toMatchObject({ ok: false });
    // Sin aria-controls no se sabe qué despliega: no se pulsa.
    expect(ver({ text: "Requisitos", attrs: { "aria-expanded": "false" } })).toMatchObject({ ok: false });
  });

  it("el <summary> de un <details> cerrado", () => {
    expect(ver({ tag: "summary", text: "¿Cómo se pide un libro?" })).toMatchObject({ ok: true, kind: "detalle" });
    expect(ver({ tag: "summary", text: "Requisitos", detailsOpen: true })).toMatchObject({ ok: false });
  });

  it("botones de «ver más» y su familia, con o sin tildes y mayúsculas", () => {
    for (const text of [
      "Ver más", "VER MÁS", "ver mas", "Mostrar más", "Leer más", "Mostrar todo", "Ver todos", "Ver todas las noticias", "Cargar más", "Cargar más resultados", "Ver más programas",
      "Seguir leyendo", "Continuar leyendo", "Más información", "Más", "+ info", "Ver detalles", "Mostrar respuesta", "Desplegar todo", "Expandir todo", "Leer el resto",
      "Show more", "Read more", "Load more", "View all", "See more results",
    ]) {
      expect(boton(text), text).toMatchObject({ ok: true, kind: "ver más" });
    }
    // También un enlace que no navega, o algo con role=button.
    expect(boton("Ver más", { tag: "a", href: "#" })).toMatchObject({ ok: true });
    expect(boton("Ver más", { tag: "a", href: "javascript:void(0)" })).toMatchObject({ ok: true });
    expect(boton("Ver más", { tag: "a", href: "javascript:;" })).toMatchObject({ ok: true });
    expect(boton("Ver más", { tag: "a", href: `${URL_PAGINA}#mas` })).toMatchObject({ ok: true });
    expect(boton("Ver más", { tag: "span", role: "button" })).toMatchObject({ ok: true });
    expect(boton("", { attrs: { "aria-label": "Mostrar más" } })).toMatchObject({ ok: true });
  });

  it("«siguiente» de una paginación que no cambia de dirección", () => {
    const pag = { context: "pagination justify-content-center", ancestors: "main nav ul li" };
    for (const text of ["Siguiente", "siguiente", "Next", "›", "»", "Página siguiente"]) expect(boton(text, pag), text).toMatchObject({ ok: true, kind: "siguiente" });
    expect(boton("", { ...pag, attrs: { "aria-label": "Siguiente" } })).toMatchObject({ ok: true, kind: "siguiente" });
    expect(boton("Siguiente", { ancestors: "main nav ul li", context: "", navLabel: "Paginación" })).toMatchObject({ ok: true, kind: "siguiente" });
    expect(boton("Siguiente", { ...pag, tag: "a", href: "#" })).toMatchObject({ ok: true, kind: "siguiente" });
    // Fuera de una paginación (un carrusel, un asistente), no.
    expect(boton("Siguiente")).toMatchObject({ ok: false });
    expect(boton("Siguiente", { context: "carousel-control swiper" })).toMatchObject({ ok: false });
    // Y si lleva a otra página, es navegar: no.
    expect(boton("Siguiente", { ...pag, tag: "a", href: "?page=2" })).toMatchObject({ ok: false, why: "lleva a otra dirección" });
    expect(boton("Siguiente", { ...pag, tag: "a", href: "/admisiones/pagina/2" })).toMatchObject({ ok: false });
  });

  it("el título de una respuesta puede nombrar una acción sin ser una orden", () => {
    expect(acordeon({ text: "¿Cómo pagar la matrícula?" })).toMatchObject({ ok: true, kind: "acordeón" });
    expect(acordeon({ text: "¿Dónde puedo descargar mi recibo de pago?" })).toMatchObject({ ok: true });
    expect(ver({ tag: "summary", text: "¿Cómo ingresar a la plataforma virtual?" })).toMatchObject({ ok: true });
    expect(acordeon({ text: "Requisitos para solicitar una beca" })).toMatchObject({ ok: true });
    expect(tab({ text: "Pagos" })).toMatchObject({ ok: true });
    expect(tab({ text: "Descargas" })).toMatchObject({ ok: true });
  });
});

describe("lo que NUNCA se pulsa", () => {
  it("nada dentro de un formulario, ni campos, ni submit", () => {
    expect(tab({ insideForm: true })).toMatchObject({ ok: false, why: "está dentro de un formulario" });
    expect(acordeon({ insideForm: true })).toMatchObject({ ok: false });
    expect(boton("Ver más", { insideForm: true })).toMatchObject({ ok: false });
    expect(ver({ tag: "summary", text: "Opciones", insideForm: true })).toMatchObject({ ok: false });
    for (const type of ["submit", "reset", "image", "file"]) expect(boton("Ver más", { type }), type).toMatchObject({ ok: false });
    expect(boton("Ver más", { attrs: { type: "submit" } })).toMatchObject({ ok: false });
    for (const tag of ["input", "select", "textarea", "option", "label"]) expect(boton("Ver más", { tag }), tag).toMatchObject({ ok: false });
    expect(boton("Ver más", { attrs: { form: "buscar" } })).toMatchObject({ ok: false });
    expect(boton("Ver más", { attrs: { formaction: "/enviar" } })).toMatchObject({ ok: false });
  });

  it("lo desactivado", () => {
    expect(boton("Ver más", { attrs: { disabled: "" } })).toMatchObject({ ok: false, why: "está desactivado" });
    expect(tab({ attrs: { "aria-disabled": "true" } })).toMatchObject({ ok: false });
  });

  it("enlaces que llevan a otra dirección o a otro origen", () => {
    for (const href of ["https://otro.sitio.com/", "//otro.sitio.com/x", "/programas", "programas.html", "?sede=bucaramanga", "https://www.udes.edu.co/admisiones", "http://www.udes.edu.co/admisiones?sede=cucuta", "mailto:a@udes.edu.co", "tel:+576076516500", "javascript:abrir()", "ftp://x.co/a", "data:text/html,hola"]) {
      expect(boton("Ver más", { tag: "a", href }), href).toMatchObject({ ok: false });
      expect(tab({ tag: "a", href }), href).toMatchObject({ ok: false });
      expect(acordeon({ tag: "a", href }), href).toMatchObject({ ok: false });
    }
    // Sin saber cuál es la página, cualquier enlace con destino es «otra dirección».
    expect(clasificar({ tag: "a", text: "Ver más", href: "/x", attrs: {}, insideForm: false }, {})).toMatchObject({ ok: false });
    // Un enlace sin destino ni papel no es un control.
    expect(boton("Ver más", { tag: "a", href: null })).toMatchObject({ ok: false });
  });

  it("lo que descarga o abre otra ventana", () => {
    expect(boton("Ver más", { tag: "a", href: "#", attrs: { download: "" } })).toMatchObject({ ok: false, why: "descarga un archivo" });
    expect(boton("Ver más", { tag: "a", href: "#", attrs: { download: "guia.pdf" } })).toMatchObject({ ok: false });
    for (const target of ["_blank", "_BLANK", "_new", "_top", "_parent", "otra"]) expect(boton("Ver más", { tag: "a", href: "#", attrs: { target } }), target).toMatchObject({ ok: false, why: "abre otra ventana" });
    expect(boton("Ver más", { tag: "a", href: "#", attrs: { target: "_self" } })).toMatchObject({ ok: true });
  });

  it("lo que dice una orden: ingresar, registrarse, comprar, pagar, eliminar, descargar, enviar, aceptar, cerrar sesión…", () => {
    const orders = [
      "Ingresar", "Ingrese aquí", "Iniciar sesión", "Inicia sesión", "Login", "Sign in", "Acceder", "Entrar", "Registrarse", "Regístrate", "Crear cuenta", "Inscríbete", "Inscribirse ahora",
      "Comprar", "Pagar", "Pagar matrícula", "Pago en línea", "Añadir al carrito", "Eliminar", "Borrar", "Quitar", "Descargar", "Descargar más", "Download", "Enviar", "Send", "Aceptar", "Acepto", "Accept all",
      "Cerrar sesión", "Salir", "Logout", "Guardar", "Confirmar", "Cancelar", "Suscribirse", "Suscríbete", "Subscribe", "Donar", "Reservar", "Solicitar", "Compartir", "Imprimir", "Contáctenos", "WhatsApp",
    ];
    for (const text of orders) {
      expect(boton(text), `botón ${text}`).toMatchObject({ ok: false });
      // Tampoco si viene vestida de pestaña, de acordeón o de <summary>.
      expect(tab({ text }), `pestaña ${text}`).toMatchObject({ ok: false, why: "dice una orden" });
      expect(acordeon({ text }), `acordeón ${text}`).toMatchObject({ ok: false, why: "dice una orden" });
      expect(ver({ tag: "summary", text }), `summary ${text}`).toMatchObject({ ok: false, why: "dice una orden" });
    }
    // En un botón, una orden lo es aunque el rótulo sea largo o parezca «ver más».
    expect(boton("Ver más y descargar el folleto")).toMatchObject({ ok: false, why: "dice una orden" });
    expect(boton("Mostrar más opciones para pagar")).toMatchObject({ ok: false });
    expect(boton("", { attrs: { "aria-label": "Eliminar" } })).toMatchObject({ ok: false });
  });

  it("controles de cookies, publicidad, ventanas emergentes, chat y redes", () => {
    for (const cls of ["cookie-banner__more", "onetrust-pc-btn", "cmp-button", "gdpr-toggle", "ad-slot", "ads", "adsbygoogle", "publicidad-lateral", "popup-close", "modal-toggle", "newsletter-more", "chat-launcher", "whatsapp-float", "share-button", "social-links"]) {
      expect(boton("Ver más", { attrs: { class: cls } }), cls).toMatchObject({ ok: false, why: "es un control de cookies, publicidad o ventana emergente" });
      expect(acordeon({ attrs: { id: cls } }), cls).toMatchObject({ ok: false });
    }
    for (const context of ["cookie-consent container", "CookieBanner", "modal-dialog modal-content", "sidebar publicidad", "onetrust-banner-sdk"]) {
      expect(boton("Mostrar más", { context }), context).toMatchObject({ ok: false });
      expect(tab({ context }), context).toMatchObject({ ok: false });
      expect(acordeon({ context }), context).toMatchObject({ ok: false });
    }
    expect(boton("Ver más sobre las cookies")).toMatchObject({ ok: false });
    expect(acordeon({ text: "Cookies de rendimiento" })).toMatchObject({ ok: false, why: "habla de cookies" });
    // Una clase que solo se parece no cuenta.
    expect(boton("Ver más", { attrs: { class: "read-more headline" } })).toMatchObject({ ok: true });
  });

  it("lo que abre un menú o un diálogo, y lo que está en la navegación, el pie, un diálogo o un menú", () => {
    expect(acordeon({ attrs: { "aria-haspopup": "true" } })).toMatchObject({ ok: false, why: "abre un menú o un diálogo" });
    expect(acordeon({ attrs: { "aria-haspopup": "menu" } })).toMatchObject({ ok: false });
    expect(boton("Ver más", { attrs: { "aria-haspopup": "dialog" } })).toMatchObject({ ok: false });
    expect(acordeon({ attrs: { "aria-haspopup": "false" } })).toMatchObject({ ok: true });
    for (const ancestors of ["header nav ul li", "div role:navigation ul", "footer div", "main dialog div", "main div role:dialog", "div role:menu li", "div role:menubar", "header div"]) {
      expect(acordeon({ ancestors }), ancestors).toMatchObject({ ok: false });
      expect(tab({ ancestors }), ancestors).toMatchObject({ ok: false });
      expect(boton("Ver más", { ancestors }), ancestors).toMatchObject({ ok: false });
      expect(ver({ tag: "summary", text: "Programas", ancestors }), ancestors).toMatchObject({ ok: false });
    }
    for (const role of ["menuitem", "combobox", "switch", "checkbox", "option", "link"]) expect(boton("Ver más", { role }), role).toMatchObject({ ok: false });
    // En una paginación solo vale «siguiente»: lo demás sigue siendo navegación.
    expect(boton("Ver más", { ancestors: "main nav ul li", context: "pagination" })).toMatchObject({ ok: false });
    expect(tab({ ancestors: "main nav ul li", context: "pagination" })).toMatchObject({ ok: false });
  });

  it("lo que no es un control de desplegar", () => {
    for (const text of ["Buscar", "Menú", "Cerrar", "Anterior", "Inicio", "Programas", "2", "Ver", "Más tarde hablamos de esto con calma", "Conoce nuestra oferta", "Play", "Abrir mapa"]) expect(boton(text), text).toMatchObject({ ok: false });
    expect(boton("")).toMatchObject({ ok: false, why: "no dice qué hace" });
    expect(ver({ tag: "div", text: "Ver más" })).toMatchObject({ ok: false, why: "no es un botón" });
    expect(boton(`Ver más ${"palabra ".repeat(12)}`)).toMatchObject({ ok: false });
    // Lo que no se entiende, no se pulsa.
    expect(clasificar(null, ctx)).toMatchObject({ ok: false });
    expect(clasificar({}, ctx)).toMatchObject({ ok: false });
    expect(clasificar({ tag: "button" }, ctx)).toMatchObject({ ok: false });
  });

  it("lo prohibido gana aunque el control también sea de los que se pulsan", () => {
    // Una pestaña que es un enlace a otra página, dentro de un formulario, que descarga…
    expect(tab({ tag: "a", href: "/otra", insideForm: true, attrs: { download: "" } })).toMatchObject({ ok: false });
    expect(acordeon({ type: "submit" })).toMatchObject({ ok: false });
    expect(boton("Ver más", { tag: "a", href: "#", attrs: { target: "_blank", class: "read-more" } })).toMatchObject({ ok: false });
    expect(ver({ tag: "summary", text: "Eliminar" })).toMatchObject({ ok: false });
  });
});

describe("a dónde lleva un enlace", () => {
  it("no sale de la página: sin href, un ancla, javascript vacío o la misma dirección", () => {
    for (const href of [null, undefined, "", "#", "#panel-2", "javascript:void(0)", "javascript:void(0);", "JavaScript:;", "javascript:", URL_PAGINA, `${URL_PAGINA}#x`, "https://www.udes.edu.co/admisiones/?sede=cucuta"]) expect(destino(href, URL_PAGINA), String(href)).toBe("ninguna");
  });

  it("sale de la página, o ejecuta código", () => {
    for (const href of ["/x", "x", "?a=1", "https://udes.edu.co/admisiones?sede=cucuta", "mailto:a@b.co", "blob:https://x/1"]) expect(destino(href, URL_PAGINA), href).toBe("otra");
    for (const href of ["javascript:alert(1)", "javascript:void(document.forms[0].submit())", "javascript:location='/x'"]) expect(destino(href, URL_PAGINA), href).toBe("codigo");
    expect(destino("/x", "")).toBe("otra");
  });
});

describe("los topes", () => {
  it("se para al llegar al máximo de clics, de tiempo o de texto, o cuando ya no aparece nada", () => {
    const base = { clics: 0, ms: 0, inicio: 10_000, chars: 10_000, secos: 0 };
    expect(parar(base)).toBe("");
    expect(parar({ ...base, clics: TOPES.clics - 1 })).toBe("");
    expect(parar({ ...base, clics: TOPES.clics })).toBe("tope de clics");
    expect(parar({ ...base, ms: TOPES.ms })).toBe("tope de tiempo");
    expect(parar({ ...base, chars: techoDeTexto(10_000) })).toBe("tope de texto");
    expect(parar({ ...base, secos: TOPES.secos })).toBe("ya no aparece nada nuevo");
    expect(parar(undefined)).toBe("");
  });

  it("el texto puede crecer unas veces lo que había, con piso y techo", () => {
    expect(techoDeTexto(10_000)).toBe(10_000 * TOPES.crece);
    expect(techoDeTexto(0)).toBe(TOPES.piso);
    expect(techoDeTexto(100)).toBe(TOPES.piso);
    expect(techoDeTexto(10_000_000)).toBe(TOPES.techo);
  });

  it("cada control se pulsa una vez; solo «cargar más» y «siguiente» se repiten, hasta un tope", () => {
    expect(vecesDe("pestaña", "Posgrado")).toBe(1);
    expect(vecesDe("acordeón", "Requisitos")).toBe(1);
    expect(vecesDe("detalle", "Cargar")).toBe(1);
    expect(vecesDe("ver más", "Ver más")).toBe(1);
    expect(vecesDe("ver más", "Cargar más")).toBe(TOPES.repite);
    expect(vecesDe("ver más", "Load more")).toBe(TOPES.repite);
    expect(vecesDe("ver más", "Ver más noticias")).toBe(TOPES.repite);
    expect(vecesDe("siguiente", "›")).toBe(TOPES.repite);
  });

  it("el clic se anota con lo que era y su rótulo, corto", () => {
    expect(rotulo("pestaña", "  Posgrado \n")).toBe("pestaña · Posgrado");
    expect(rotulo("ver más", "")).toBe("ver más");
    expect(rotulo("acordeón", "x".repeat(300)).length).toBeLessThanOrEqual("acordeón · ".length + 80);
    expect(plano("  Ver   MÁS  ")).toBe("ver mas");
  });
});

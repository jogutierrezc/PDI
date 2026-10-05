/* =============================================================================
   Navegador de Mr. Pilo · qué se puede pulsar.

   Con la página ya armada, el servicio pulsa algunos controles para desplegar
   contenido que no se ve de entrada. Este módulo decide cuáles, y es lo más
   delicado del servicio: un clic de más puede enviar un formulario, borrar
   algo o salir de la página. Por eso es una función pura, sin dependencias,
   sobre la DESCRIPCIÓN de un control (no sobre el control):

     { tag, role, type, text, href, attrs, insideForm,
       ancestors?, context?, detailsOpen? }

     tag         la etiqueta, en minúscula
     role        su atributo role
     type        su atributo type
     text        su texto visible (o su aria-label / title si no tiene)
     href        su atributo href, tal como está escrito
     attrs       sus demás atributos (aria-*, target, download, class, id…)
     insideForm  está dentro de un <form>
     ancestors   etiquetas y roles de sus ancestros («main div nav role:dialog»)
     context     clases e ids de sus ancestros cercanos
     detailsOpen para un <summary>: su <details> ya está abierto

   La regla general: solo se pulsa lo que DESPLIEGA contenido dentro de la
   misma página. Ante la duda, no se pulsa.

   NUNCA se pulsa (y gana sobre todo lo demás):
     1. nada dentro de un <form>, ni un campo, ni un type=submit/reset/image/
        file, ni lo que lleve form= o formaction=;
     2. lo desactivado (disabled, aria-disabled);
     3. lo que descarga o abre otra ventana: [download], cualquier target que
        no sea la misma ventana;
     4. un enlace que lleva a otra dirección: otro origen, otra ruta u otra
        consulta de este sitio, o un protocolo que no es de página (mailto:,
        tel:, javascript: con código). Solo valen «sin href», «#algo» y
        «javascript:void(0)»;
     5. lo que abre un menú, un diálogo o una lista (aria-haspopup);
     6. lo que está en un menú de navegación, un pie, un diálogo o un menú
        (salvo «siguiente» en una paginación);
     7. los controles de cookies, publicidad, ventanas emergentes, chat y
        redes: por su clase, su id o los de sus ancestros, o por su texto;
     8. lo que dice una ORDEN: ingresar, iniciar sesión, registrarse, comprar,
        pagar, eliminar, borrar, descargar, enviar, aceptar, cerrar sesión,
        guardar, confirmar, suscribirse y parecidas. En un botón, siempre. En
        una pestaña, un acordeón o un <summary>, solo si el rótulo es corto
        (hasta tres palabras) y no es una pregunta: «Iniciar sesión» no se
        pulsa; «¿Cómo pagar la matrícula?» es el título de una respuesta, y sí.

   SÍ se pulsa, si pasó todo lo anterior:
     a. una pestaña sin elegir: [role=tab] con aria-selected distinto de true;
     b. un disparador de acordeón: [aria-expanded="false"] con aria-controls;
     c. el <summary> de un <details> cerrado;
     d. un botón (o un enlace que no navega) que dice «ver más», «mostrar
        más», «leer más», «mostrar todo», «cargar más», «seguir leyendo»…;
     e. «siguiente» de una paginación que no cambia de dirección.
   ========================================================================== */

/** Sin tildes, en minúscula y con los espacios en uno: para comparar rótulos. */
export function plano(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Órdenes: lo que hace algo en vez de mostrar algo. Sobre el rótulo ya «plano».
const ORDEN =
  /\b(ingresar|ingrese|ingresa|iniciar sesion|inicia sesion|inicie sesion|login|log in|sign in|sign up|acceder|entrar|registrarse|registrate|registrese|registrar|crear cuenta|crea tu cuenta|inscribirse|inscribete|inscribase|inscribirme|matricularse|matriculate|comprar|compra ya|compre|pagar|pague|paga aqui|pago en linea|anadir al carrito|agregar al carrito|carrito|checkout|eliminar|borrar|suprimir|quitar|delete|remove|descargar|descarga|descargue|download|enviar|envia|envie|send|submit|aceptar|acepto|accept|agree|rechazar|reject|cerrar sesion|salir|logout|log out|sign out|guardar|save|confirmar|confirm|cancelar|suscribirse|suscribete|suscribirme|subscribe|donar|postularse|postulate|aplicar ahora|aplica ahora|reservar|agendar|solicitar|compartir|share|imprimir|print|publicar|votar|contactar|contactenos|llamar|whatsapp|chatear)\b/;

// Controles que no son de la página: cookies, publicidad, emergentes, chat, redes.
const AJENO =
  /cookie|consent|gdpr|onetrust|cookiebot|didomi|truste|usercentrics|osano|cmp-|banner|advert|publicidad|sponsor|patrocin|(^|[^a-z])ads?([^a-z]|$)|adsbygoogle|doubleclick|promo|popup|pop-up|modal|lightbox|newsletter|suscri|subscri|chat|whatsapp|intercom|zendesk|tawk|crisp|hubspot|share|social|login|signin|sign-in|carrito|checkout/;

const COOKIES = /\b(cookies?|galletas)\b/;

// «Ver más» y su familia. El rótulo entero, corto.
const VER_MAS = [
  /^(ver|mostrar|leer|cargar|ampliar|desplegar|expandir|abrir|consultar)( \S+){0,2} mas( \S+){0,3}$/,
  /^(ver|mostrar|leer|desplegar|expandir) (todo|todos|todas|completo|completa|el resto|la lista completa)( \S+){0,3}$/,
  /^(ver|mostrar) (detalle|detalles|descripcion|contenido|respuesta|informacion)( \S+){0,2}$/,
  /^(seguir|continuar) leyendo$/,
  /^mas( (informacion|info|detalles|resultados|noticias|eventos|programas|contenido))?$/,
  /^\+ ?(info|informacion|mas)$/,
  /^(show|read|load|view|see|display) (more|all|full)( \S+){0,2}$/,
  /^(more|expand|expand all)$/,
];

const SIGUIENTE = /^(siguiente|sig\.?|pagina siguiente|siguiente pagina|next|next page|>|>>|›|»|→)$/;
const PAGINACION = /paginat|paginac|paginad|pagina-|pager|page-numbers|page-nav|pagenav|wp-pagenavi/;
const TOPE_ROTULO = 60;

const no = (why) => ({ ok: false, kind: null, why });
const si = (kind, why) => ({ ok: true, kind, why });

/** A dónde lleva un href desde `url`: "ninguna" (no sale de la página), "codigo" (javascript: con código) o "otra". */
export function destino(href, url) {
  const raw = String(href ?? "").trim();
  if (!raw || raw.startsWith("#")) return "ninguna";
  if (/^javascript:/i.test(raw)) return /^javascript:\s*(void\s*\(?\s*0?\s*\)?|;|undefined|false|\/\/.*)?\s*;?\s*$/i.test(raw) ? "ninguna" : "codigo";
  let here;
  let there;
  try {
    here = new URL(url);
    there = new URL(raw, here);
  } catch {
    return "otra";
  }
  if (there.protocol !== "http:" && there.protocol !== "https:") return "otra";
  if (there.origin !== here.origin) return "otra";
  const same = (u) => `${u.pathname.replace(/\/+$/, "")}?${u.searchParams.toString()}`;
  return same(there) === same(here) ? "ninguna" : "otra";
}

/**
 * ¿Se puede pulsar este control para desplegar contenido? `ctx.url` es la
 * dirección de la página, para saber si un enlace sale de ella.
 * Devuelve { ok, kind, why }: kind es "pestaña", "acordeón", "detalle",
 * "ver más" o "siguiente" cuando ok; why dice la regla que decidió.
 */
export function clasificar(d, ctx = {}) {
  const el = d && typeof d === "object" ? d : {};
  const attrs = el.attrs && typeof el.attrs === "object" ? el.attrs : {};
  const attr = (name) => (attrs[name] === undefined || attrs[name] === null ? null : String(attrs[name]));
  const has = (name) => attr(name) !== null && attr(name) !== "false";
  const tag = String(el.tag ?? "").toLowerCase();
  const role = String(el.role ?? attr("role") ?? "").toLowerCase();
  const type = String(el.type ?? attr("type") ?? "").toLowerCase();
  const label = plano(el.text || attr("aria-label") || attr("title") || "");
  const marks = plano(`${attr("class") ?? ""} ${attr("id") ?? ""} ${attr("name") ?? ""} ${attr("data-testid") ?? ""}`);
  const context = plano(el.context ?? "");
  const ancestors = ` ${plano(el.ancestors ?? "")} `;

  // 1. Formularios y campos.
  if (el.insideForm === true) return no("está dentro de un formulario");
  if (["input", "select", "textarea", "option", "label", "form", "fieldset"].includes(tag)) return no("es un campo de formulario");
  if (["submit", "reset", "image", "file"].includes(type)) return no(`es de tipo ${type}`);
  if (attr("form") !== null || attr("formaction") !== null) return no("pertenece a un formulario");
  // 2. Desactivado.
  if (has("disabled") || attr("aria-disabled") === "true") return no("está desactivado");
  // 3. Descargas y otras ventanas.
  if (attr("download") !== null) return no("descarga un archivo");
  const target = (attr("target") ?? "").toLowerCase();
  if (target && target !== "_self") return no("abre otra ventana");
  // 4. Navegación.
  const href = el.href ?? attr("href");
  const goes = destino(href, ctx.url ?? "");
  if (goes === "otra") return no("lleva a otra dirección");
  if (goes === "codigo") return no("ejecuta código desde el enlace");
  if (["a", "area"].includes(tag) && (href === null || href === undefined || String(href).trim() === "") && role !== "tab" && role !== "button" && attr("aria-controls") === null) return no("es un enlace sin destino");
  // 5. Menús, diálogos y listas.
  if (has("aria-haspopup")) return no("abre un menú o un diálogo");
  if (["menuitem", "menuitemcheckbox", "menuitemradio", "option", "combobox", "switch", "checkbox", "radio", "slider", "link"].includes(role)) return no(`es un control de tipo ${role}`);
  // 7. Cookies, publicidad, emergentes, chat y redes.
  if (AJENO.test(marks) || AJENO.test(context)) return no("es un control de cookies, publicidad o ventana emergente");
  if (COOKIES.test(label)) return no("habla de cookies");

  const paginated = PAGINACION.test(marks) || PAGINACION.test(context) || /\b(paginacion|pagination)\b/.test(plano(el.navLabel ?? ""));
  // 6. Navegación del sitio, pies, diálogos y menús.
  if (/ (footer|dialog|menu|role:dialog|role:alertdialog|role:menu|role:menubar|role:listbox|role:toolbar) /.test(ancestors)) return no("está en un pie, un diálogo o un menú");
  const inNav = / (nav|header|role:navigation|role:banner) /.test(ancestors);
  if (inNav && !paginated) return no("está en la navegación del sitio");

  if (!label) return no("no dice qué hace");

  const structural = role === "tab" || tag === "summary" || (attr("aria-expanded") !== null && attr("aria-controls"));
  // 8. Órdenes.
  if (ORDEN.test(label)) {
    const words = label.split(" ").filter(Boolean).length;
    const question = /[?¿]/.test(String(el.text ?? ""));
    if (!structural || (words <= 3 && !question)) return no("dice una orden");
  }

  // a. Pestañas.
  if (role === "tab") {
    if (inNav) return no("está en la navegación del sitio");
    return attr("aria-selected") === "true" ? no("la pestaña ya está elegida") : si("pestaña", "pestaña sin elegir");
  }
  // b. Acordeones.
  if (attr("aria-expanded") !== null) {
    if (inNav) return no("está en la navegación del sitio");
    if (attr("aria-expanded") === "true") return no("ya está desplegado");
    if (attr("aria-expanded") === "false" && attr("aria-controls")) return si("acordeón", "disparador de acordeón plegado");
    return no("no dice qué despliega (sin aria-controls)");
  }
  // c. <details>.
  if (tag === "summary") {
    if (inNav) return no("está en la navegación del sitio");
    return el.detailsOpen === true ? no("ya está abierto") : si("detalle", "<details> cerrado");
  }
  // d y e. Botones (y enlaces que no navegan) por su rótulo.
  const button = tag === "button" || role === "button" || tag === "a";
  if (!button) return no("no es un botón");
  if (label.length > TOPE_ROTULO) return no("el rótulo es demasiado largo para ser un botón de desplegar");
  if (SIGUIENTE.test(label)) return paginated ? si("siguiente", "siguiente de una paginación en la misma página") : no("«siguiente» fuera de una paginación");
  if (inNav) return no("está en la navegación del sitio");
  if (VER_MAS.some((re) => re.test(label))) return si("ver más", "botón de ver más");
  return no("no es un control de desplegar");
}

/* --- Los topes ----------------------------------------------------------------------------- */

/** Hasta dónde se pulsa en una página. */
export const TOPES = {
  /** Clics por página. */
  clics: 40,
  /** Tiempo total pulsando, en milisegundos. */
  ms: 20_000,
  /** Cuánto puede crecer el texto: tantas veces lo que había al abrir… */
  crece: 12,
  /** …con este piso (una página que nace casi vacía) y este techo, en caracteres. */
  piso: 60_000,
  techo: 600_000,
  /** Veces que se pulsa el MISMO «cargar más» o «siguiente». Lo demás, una. */
  repite: 8,
  /** Clics seguidos que no agregan nada antes de parar. */
  secos: 12,
};

/** Cuánto texto se admite en una página que abrió con `inicio` caracteres. */
export function techoDeTexto(inicio, topes = TOPES) {
  return Math.min(topes.techo, Math.max(topes.piso, Math.floor(Number(inicio) || 0) * topes.crece));
}

/**
 * ¿Se sigue pulsando? `estado`: { clics, ms, inicio, chars, secos }. Devuelve
 * "" si se sigue, o por qué se para.
 */
export function parar(estado, topes = TOPES) {
  const e = estado ?? {};
  if ((e.clics ?? 0) >= topes.clics) return "tope de clics";
  if ((e.ms ?? 0) >= topes.ms) return "tope de tiempo";
  if ((e.chars ?? 0) >= techoDeTexto(e.inicio, topes)) return "tope de texto";
  if ((e.secos ?? 0) >= topes.secos) return "ya no aparece nada nuevo";
  return "";
}

/** Cuántas veces se puede pulsar un mismo control, según lo que es. */
export function vecesDe(kind, label = "", topes = TOPES) {
  if (kind === "siguiente") return topes.repite;
  if (kind === "ver más" && /^(cargar|load)\b|\bmas (resultados|noticias|eventos|programas)\b/.test(plano(label))) return topes.repite;
  return 1;
}

/** Cómo se anota un clic: «pestaña · Posgrado». El rótulo, corto. */
export function rotulo(kind, text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return t ? `${kind} · ${t}` : kind;
}

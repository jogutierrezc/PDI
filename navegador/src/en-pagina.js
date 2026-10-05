/* =============================================================================
   Navegador de Mr. Pilo · lo que corre DENTRO de la página.

   Dos funciones que el servicio le pasa al navegador (page.evaluate). Cada una
   se basta sola: no usa nada de fuera de su cuerpo, porque viaja como texto.
   Por eso van en el estilo de public/pilo.js (ES5, sin módulos por dentro).

     leerBloques()  el texto de la página, en orden: títulos, párrafos y
                    elementos de lista. Lee también lo plegado que es
                    contenido, con las MISMAS reglas del chat incrustado
                    (public/pilo.js): el bloque «Las reglas de lectura» va
                    copiado tal cual, y tests/navegador/en-pagina.test.ts
                    falla si se separan.
     controles()    la descripción de cada control que podría desplegar algo.
                    No decide nada: eso lo hace clics.js, fuera de la página.

   Ninguna de las dos pulsa nada ni escribe en formularios. `controles` marca
   cada control con data-pilo-nav para poder hallarlo después.
   ========================================================================== */

export function leerBloques() {
  var CHARS = 800000;
  var MAX_NODES = 40000;
  var BLOCK_CHARS = 8000;
  var NEVER =
    "script,style,noscript,template,svg,canvas,iframe,object,embed,video,audio,nav,footer,aside,form,input,textarea,select,option,datalist,button:not([aria-controls]),[role='tab'],[contenteditable],[data-pilo-ignorar]," +
    "dialog,[role='dialog'],[role='alertdialog'],[aria-modal='true'],menu,[role='menu'],[role='menubar'],[role='listbox'],[role='tooltip'],[role='navigation'],[role='contentinfo'],.slick-cloned,.swiper-slide-duplicate,.owl-item.cloned," +
    "[role='button']:not([aria-controls]),a[href='#'],a[href^='javascript:']";
  // Lo que no es de la página aunque se vea: avisos de cookies, boletines y publicidad, por su clase o su id.
  var FOREIGN = /cookie|consent|gdpr|onetrust|cookiebot|didomi|usercentrics|newsletter|publicidad|advert|adsbygoogle/;

  /* --- Las reglas de lectura (sin DOM; se prueban en src/modules/pilo-embed/pilo-leer.test.ts) --- */

  /** Qué pide la línea: "no", "si" (lo visible) o "todo" (también lo plegado). */
  function leerModo(raw) {
    var v = String(raw || "").replace(/^\s+|\s+$/g, "").toLowerCase();
    if (/^todo/.test(v)) return "todo";
    return /^s[ií]/.test(v) ? "si" : "no";
  }

  var FOLD_CHARS = 80;
  // Nombres (clase o id) de lo que se oculta y NO es contenido de la página.
  var NOT_CONTENT =
    /cookie|consent|gdpr|banner|modal|popup|pop-up|overlay|lightbox|offcanvas|drawer|dropdown|menu|navbar|tooltip|popover|toast|snackbar|login|signin|sign-in|newsletter|suscri|subscri|captcha|honeypot|sr-only|visually-hidden|screen-reader|skip-|clone|clonad|duplicate|template|plantilla|preload|loader|loading|spinner|skeleton|publicidad|advert|(^|[^a-z])ads?([^a-z]|$)|buscador|carrito/;
  // Nombres de lo que se pliega y SÍ es contenido: pestañas, acordeones, «ver más».
  var FOLD = /tab-?pane|tab-?panel|tab-?content|tabs?__|pesta|accordion|acorde|collaps|colaps|panel|toggle|expand|desplegable|faq|answer|respuesta|read-?more|ver-?mas|more/;

  /**
   * ¿Este elemento OCULTO es contenido plegado? Se le pregunta al primero que
   * está oculto en cada rama (por `hidden`, `aria-hidden`, display:none o
   * visibility:hidden), con su descripción:
   *   { role, marks: su clase y su id, fixed: va fijo a la ventana,
   *     controlled: algún control de la página lo abre (aria-controls),
   *     chars: cuánto texto lleva }
   *
   * NO es contenido (no se lee):
   *   - lo que va fijo a la ventana: capas, modales, avisos, cajones;
   *   - lo que por su nombre es aviso de cookies, modal, menú, ingreso,
   *     publicidad, copia de un carrusel, plantilla o texto solo para
   *     lectores de pantalla.
   * SÍ es contenido plegado (se lee):
   *   - un panel de pestaña (role=tabpanel);
   *   - lo que un control de la página abre (aria-controls);
   *   - lo que por su nombre es pestaña, acordeón, panel o «ver más»;
   *   - cualquier otro bloque oculto con texto de verdad (80 caracteres o
   *     más): un ícono o una etiqueta suelta no lo son.
   * Los diálogos, los menús, los formularios y lo demás de NEVER ni siquiera
   * llegan aquí: leyendo todo no se leen nunca, se vean o no.
   */
  function plegado(d) {
    var marks = String(d.marks || "").toLowerCase();
    if (d.fixed) return false;
    if (NOT_CONTENT.test(marks)) return false;
    if (d.role === "tabpanel" || d.controlled) return true;
    if (FOLD.test(marks)) return true;
    return Number(d.chars) >= FOLD_CHARS;
  }

  /* --- fin de las reglas --- */

  var root = document.querySelector("[data-pilo-leer]") || document.querySelector("main") || document.querySelector("article") || document.querySelector("[role='main']") || document.body;
  if (!root) return { title: "", blocks: [], chars: 0 };
  // Leyendo el cuerpo entero, la cabecera del sitio no es contenido; dentro de un artículo suele llevar su título.
  var whole = root === document.body;

  var controlled = {};
  var list = document.querySelectorAll("[aria-controls]");
  for (var i = 0; i < list.length; i++) {
    var names = (list[i].getAttribute("aria-controls") || "").split(/\s+/);
    for (var j = 0; j < names.length; j++) if (names[j]) controlled["#" + names[j]] = true;
  }

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }

  function panelLabel(panel) {
    var by = panel.getAttribute("aria-labelledby");
    var tab = by ? document.getElementById(by.split(/\s+/)[0]) : null;
    return clean(tab ? tab.textContent : panel.getAttribute("aria-label")).slice(0, 200);
  }

  function blockOf(node) {
    var el = node.parentElement;
    while (el && el !== root) {
      var d = window.getComputedStyle(el).display;
      if (d.indexOf("inline") !== 0 && d !== "contents") return el;
      el = el.parentElement;
    }
    return root;
  }

  var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      if (node.nodeType === 1) {
        if (node.matches(NEVER)) return NodeFilter.FILTER_REJECT;
        if (whole && (node.matches("[role='banner']") || (node.tagName === "HEADER" && node.parentNode === root))) return NodeFilter.FILTER_REJECT;
        if (FOREIGN.test(((typeof node.className === "string" ? node.className : "") + " " + (node.id || "")).toLowerCase())) return NodeFilter.FILTER_REJECT;
        var cs = window.getComputedStyle(node);
        if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" || cs.display === "none" || cs.visibility === "hidden") {
          var d = {
            role: (node.getAttribute("role") || "").toLowerCase(),
            marks: (typeof node.className === "string" ? node.className : "") + " " + (node.id || ""),
            fixed: cs.position === "fixed" || cs.position === "sticky",
            controlled: !!(node.id && controlled["#" + node.id]),
            chars: (node.textContent || "").replace(/\s+/g, " ").length,
          };
          if (!plegado(d)) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP;
      }
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  var blocks = [];
  var last = null;
  var lastCell = null;
  var lastPanel = null;
  var current = null;
  var level = 2;
  var total = 0;
  var seen = 0;
  var node;
  while ((node = walker.nextNode()) && seen < MAX_NODES && total < CHARS) {
    // El espacio entre dos elementos en línea separa sus palabras («Uno» «Dos», no «UnoDos»).
    if (!/\S/.test(node.nodeValue)) {
      if (current && current.t) current.t += " ";
      continue;
    }
    seen += 1;
    var parent = node.parentElement;
    var owner = blockOf(node);
    // Una fila de tabla es un solo bloque, con sus celdas separadas.
    var cell = parent && parent.closest ? parent.closest("td,th") : null;
    if (cell && root.contains(cell)) owner = cell.closest("tr") || owner;
    else cell = null;
    var text = (node.nodeValue || "").replace(/\s+/g, " ");
    if (owner !== last) {
      last = owner;
      lastCell = cell;
      // Cada panel de pestaña entra con el nombre de su pestaña por título.
      var panel = owner.closest ? owner.closest("[role='tabpanel']") : null;
      if (panel && panel !== lastPanel && root.contains(panel)) {
        lastPanel = panel;
        var label = panelLabel(panel);
        if (label.length > 1) blocks.push({ tag: "h" + Math.min(6, level + 1), t: label });
      }
      var tag = "p";
      var heading = owner.closest ? owner.closest("h1,h2,h3,h4,h5,h6,[role='heading']") : null;
      if (heading && root.contains(heading)) {
        var n = /^H[1-6]$/.test(heading.tagName) ? Number(heading.tagName.charAt(1)) : Number(heading.getAttribute("aria-level")) || 2;
        level = Math.min(6, Math.max(1, n));
        tag = "h" + level;
      } else {
        // El <summary> y el botón que abre un acordeón son el título de lo que despliegan.
        var opener = owner.closest ? owner.closest("summary,button[aria-controls]") : null;
        if (!opener && parent && parent.closest) opener = parent.closest("button[aria-controls]");
        if (opener && root.contains(opener)) tag = "h" + Math.min(6, level + 1);
        else if (owner.tagName === "LI" || owner.tagName === "DT") tag = "li";
      }
      current = { tag: tag, t: "" };
      blocks.push(current);
    } else if (cell !== lastCell) {
      lastCell = cell;
      current.t += " · ";
    }
    if (current.t.length < BLOCK_CHARS) {
      current.t += text;
      total += text.length;
    }
  }

  var out = [];
  var chars = 0;
  for (var k = 0; k < blocks.length; k++) {
    var t = clean(blocks[k].t).slice(0, BLOCK_CHARS);
    if (t.length <= 1) continue;
    chars += t.length;
    out.push({ tag: blocks[k].tag, t: t });
  }
  return { title: clean(document.title).slice(0, 300), blocks: out, chars: chars };
}

export function controles() {
  var MAX = 300;
  var SELECTOR = "[role='tab'],[aria-expanded='false'][aria-controls],summary,button,[role='button'],a[href^='#'],a[href^='javascript:'],a:not([href])";
  var ATTRS = ["aria-selected", "aria-expanded", "aria-controls", "aria-haspopup", "aria-disabled", "aria-label", "disabled", "target", "download", "class", "id", "name", "form", "formaction", "title", "data-testid", "role", "type"];

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }

  function visible(el) {
    if (!el.getClientRects || !el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  if (typeof window.__piloNav !== "number") window.__piloNav = 0;
  var out = [];
  var list = document.body ? document.body.querySelectorAll(SELECTOR) : [];
  for (var i = 0; i < list.length && out.length < MAX; i++) {
    var el = list[i];
    if (!visible(el)) continue;
    var key = el.getAttribute("data-pilo-nav");
    if (!key) {
      window.__piloNav += 1;
      key = String(window.__piloNav);
      el.setAttribute("data-pilo-nav", key);
    }
    var attrs = {};
    for (var a = 0; a < ATTRS.length; a++) {
      var value = el.getAttribute(ATTRS[a]);
      if (value !== null) attrs[ATTRS[a]] = String(value).slice(0, 300);
    }
    var ancestors = [];
    var context = [];
    var navLabel = "";
    var depth = 0;
    for (var up = el.parentElement; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
      ancestors.push(up.tagName.toLowerCase());
      var role = up.getAttribute("role");
      if (role) ancestors.push("role:" + role.toLowerCase());
      if (depth < 6) context.push((typeof up.className === "string" ? up.className : "") + " " + (up.id || ""));
      if (!navLabel && (up.tagName === "NAV" || role === "navigation")) navLabel = up.getAttribute("aria-label") || "";
      depth += 1;
    }
    out.push({
      key: key,
      tag: el.tagName.toLowerCase(),
      role: (el.getAttribute("role") || "").toLowerCase(),
      type: (el.getAttribute("type") || "").toLowerCase(),
      text: clean(el.innerText !== undefined ? el.innerText : el.textContent).slice(0, 160),
      href: el.getAttribute("href"),
      attrs: attrs,
      insideForm: !!(el.closest && el.closest("form")) || !!el.form,
      ancestors: ancestors.join(" "),
      context: clean(context.join(" ")).slice(0, 600),
      navLabel: clean(navLabel).slice(0, 80),
      detailsOpen: el.tagName === "SUMMARY" ? !!(el.parentElement && el.parentElement.open) : undefined,
    });
  }
  return out;
}

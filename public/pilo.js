/* =============================================================================
   Pilo en otros portales · el cargador.

   Se pega una línea en la página anfitriona:

     <script src="https://<portal de Planeación>/pilo.js"
             data-tema="blanco" data-esquina="derecha" defer></script>

   Crea un marco (iframe) hacia /pilo-embed de este mismo portal: ahí viven el
   botón, el saludo y el chat. Aquí solo se le da al marco el tamaño que pide.
   Los estilos de la página anfitriona no entran al marco, ni los suyos salen.

   Mr. Pilo en Enseñanza, la Inteligencia Artificial de la Universidad de
   Santander, se pide con data-pilo="ensenanza": su marco va a
   /pilo-ensenanza-embed. Los dos Pilos pueden vivir en la misma página, una
   línea por cada uno; conviene ponerlos en esquinas distintas.

   Leer la página (0127): con data-leer="si", Pilo lee el texto visible de la
   página que lo aloja cuando alguien le pregunta, para responder sobre lo que
   esa persona está viendo. El marco no puede leer la página (es de otro sitio):
   la lee este cargador y se la pasa. Nunca lee campos de formulario, ni lo
   oculto, ni lo que lleve data-pilo-ignorar. Para decirle qué parte leer,
   márquela con data-pilo-leer; sin eso lee <main>, <article> o el cuerpo.
   ========================================================================== */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || !script.src) return;

  // Qué Pilo: el de siempre, o el de otro espacio. Lo que no se conoce cae en el de siempre.
  var SPACES = {
    planeacion: { route: "/pilo-embed", title: "Chat con Pilo, de Planeación UDES", guard: "__piloEmbed" },
    ensenanza: {
      route: "/pilo-ensenanza-embed",
      title: "Chat con Pilo, la Inteligencia Artificial de la Universidad de Santander",
      guard: "__piloEmbed_ensenanza",
    },
  };
  var asked = (script.getAttribute("data-pilo") || "").toLowerCase();
  var space = Object.prototype.hasOwnProperty.call(SPACES, asked) ? SPACES[asked] : SPACES.planeacion;

  // Un marco por espacio: la misma línea pegada dos veces no duplica a Pilo.
  if (window[space.guard]) return;
  window[space.guard] = true;

  var origin = new URL(script.src).origin;
  var tema = (script.getAttribute("data-tema") || "blanco").toLowerCase();
  var left = /^izq/i.test(script.getAttribute("data-esquina") || script.getAttribute("data-lado") || "");
  // Solo si la línea lo pide: quien administra la página decide si Pilo la lee.
  var canRead = /^s[ií]/i.test(script.getAttribute("data-leer") || "");

  var SIZE = { cerrado: [96, 104], saludo: [336, 120], abierto: [412, 680] };
  var state = "cerrado";
  var frame = null;

  function isSmall() {
    return window.innerWidth <= 520;
  }

  function apply() {
    if (!frame) return;
    var s = frame.style;
    if (state === "oculto") {
      s.display = "none";
      return;
    }
    s.display = "block";
    s.visibility = "visible";
    var full = state === "abierto" && isSmall();
    var size = SIZE[state] || SIZE.cerrado;
    s.width = full ? "100%" : size[0] + "px";
    s.height = full ? "100%" : size[1] + "px";
    // Abierto queda por encima del otro Pilo, si lo hay en la página.
    s.zIndex = state === "abierto" ? "2147483001" : "2147483000";
  }

  function tellFrame() {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ source: "pilo-host", full: isSmall(), read: canRead }, origin);
  }

  /* --- Leer la página ------------------------------------------------------------ */

  var PAGE_CHARS = 60000;
  var BLOCK_CHARS = 4000;
  var MAX_NODES = 6000;
  // Lo que no es contenido, lo que la persona escribe y lo que la página pide no leer.
  var SKIP = "script,style,noscript,template,svg,canvas,iframe,object,embed,video,audio,nav,footer,form,input,textarea,select,option,button,[contenteditable],[aria-hidden='true'],[hidden],[data-pilo-ignorar]";

  function hiddenByStyle(el) {
    var cs = window.getComputedStyle(el);
    return cs.display === "none" || cs.visibility === "hidden";
  }

  /** El bloque al que pertenece un texto: el ancestro más cercano que no va en línea. */
  function blockOf(node, root) {
    var el = node.parentElement;
    while (el && el !== root) {
      var d = window.getComputedStyle(el).display;
      if (d.indexOf("inline") !== 0 && d !== "contents") return el;
      el = el.parentElement;
    }
    return root;
  }

  /**
   * El texto visible de la página, en orden: una lista de bloques, cada uno un
   * título (h) o un párrafo. La dirección va sin fragmento; el marco y el
   * servidor le quitan además los parámetros que puedan llevar datos de la persona.
   */
  function readPage() {
    var root = document.querySelector("[data-pilo-leer]") || document.querySelector("main") || document.querySelector("article") || document.querySelector("[role='main']") || document.body;
    var blocks = [];
    if (!root) return null;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (node.nodeType === 1) {
          if (node === frame || node.matches(SKIP) || hiddenByStyle(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        return /\S/.test(node.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    var last = null;
    var current = null;
    var total = 0;
    var seen = 0;
    var node;
    while ((node = walker.nextNode()) && seen < MAX_NODES && total < PAGE_CHARS) {
      seen += 1;
      var owner = blockOf(node, root);
      var text = (node.nodeValue || "").replace(/\s+/g, " ");
      if (owner !== last) {
        last = owner;
        var heading = owner.closest ? owner.closest("h1,h2,h3,h4,h5,h6,[role='heading']") : null;
        current = { h: heading && root.contains(heading) ? 1 : 0, t: "" };
        blocks.push(current);
      }
      if (current.t.length < BLOCK_CHARS) {
        current.t += text;
        total += text.length;
      }
    }
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var t = blocks[i].t.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").slice(0, BLOCK_CHARS);
      if (t.length > 1) out.push({ h: blocks[i].h, t: t });
    }
    if (!out.length) return null;
    return { url: location.origin + location.pathname + location.search, title: (document.title || "").slice(0, 200), blocks: out };
  }

  /** El marco pide la página: se lee en ese momento, así vale también para páginas que cambian sin recargar. */
  function sendPage(id) {
    if (!frame || !frame.contentWindow) return;
    var page = null;
    if (canRead) {
      try {
        page = readPage();
      } catch (e) {
        page = null;
      }
    }
    frame.contentWindow.postMessage({ source: "pilo-host", type: "pagina", id: id, page: page }, origin);
  }

  function mount() {
    frame = document.createElement("iframe");
    frame.src = origin + space.route + "?tema=" + encodeURIComponent(tema) + "&lado=" + (left ? "izq" : "der");
    frame.title = space.title;
    frame.setAttribute("allow", "autoplay");
    frame.setAttribute("allowtransparency", "true");
    // color-scheme igual al del marco: si difieren, el navegador le pinta un fondo opaco.
    frame.style.cssText =
      "position:fixed;bottom:0;" +
      (left ? "left:0;" : "right:0;") +
      "width:96px;height:104px;max-width:100%;max-height:100%;border:0;margin:0;padding:0;" +
      "background:transparent;color-scheme:light;z-index:2147483000;visibility:hidden;display:block;";
    document.body.appendChild(frame);
  }

  // Cada cargador solo atiende a su propio marco: los mensajes del otro Pilo no lo mueven.
  window.addEventListener("message", function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== origin) return;
    var m = e.data;
    if (!m || m.source !== "pilo-embed") return;
    if (m.type === "leer") return sendPage(m.id);
    if (m.type !== "estado") return;
    if (m.state !== "oculto" && !SIZE[m.state]) return;
    state = m.state;
    apply();
    tellFrame();
  });

  window.addEventListener("resize", function () {
    apply();
    tellFrame();
  });

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();

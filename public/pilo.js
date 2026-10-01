/* =============================================================================
   Pilo en otros portales · el cargador.

   Se pega una línea en la página anfitriona:

     <script src="https://<portal de Planeación>/pilo.js"
             data-tema="blanco" data-esquina="derecha" defer></script>

   Crea un marco (iframe) hacia /pilo-embed de este mismo portal: ahí viven el
   botón, el saludo y el chat. Aquí solo se le da al marco el tamaño que pide.
   Los estilos de la página anfitriona no entran al marco, ni los suyos salen.
   ========================================================================== */
(function () {
  "use strict";
  if (window.__piloEmbed) return;
  window.__piloEmbed = true;

  var script = document.currentScript;
  if (!script || !script.src) return;
  var origin = new URL(script.src).origin;
  var tema = (script.getAttribute("data-tema") || "blanco").toLowerCase();
  var left = /^izq/i.test(script.getAttribute("data-esquina") || script.getAttribute("data-lado") || "");

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
  }

  function tellFrame() {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ source: "pilo-host", full: isSmall() }, origin);
  }

  function mount() {
    frame = document.createElement("iframe");
    frame.src = origin + "/pilo-embed?tema=" + encodeURIComponent(tema) + "&lado=" + (left ? "izq" : "der");
    frame.title = "Chat con Pilo, de Planeación UDES";
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

  window.addEventListener("message", function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== origin) return;
    var m = e.data;
    if (!m || m.source !== "pilo-embed" || m.type !== "estado") return;
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

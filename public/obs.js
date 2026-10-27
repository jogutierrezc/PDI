/* =============================================================================
   Observatorio de Analítica en otros portales · el cargador.

   Se pega en la página anfitriona, donde se quiere ver el contenido:

     <script src="https://<portal de Planeación>/obs.js"
             data-obs="x7k2m9q4ab" data-aspecto="claro" data-idioma="es"
             data-filtros="anio=2025;campus=Bucaramanga" data-altura="auto" defer></script>

   Atributos: data-obs (obligatorio: el código del insertado), data-aspecto
   (claro · oscuro · auto), data-idioma (es · en · pt), data-filtros
   («anio=2025;campus=Bucaramanga»), data-altura («auto» o píxeles) y data-clave
   (si el insertado la pide; NO es un secreto: viaja en la página). data-tema,
   data-seccion y data-visor solo documentan lo que se inserta: el contenido lo
   fija el insertado en el portal, no esta página.

   Crea un marco (iframe) hacia /obs-embed de este mismo portal, justo donde
   está la etiqueta. No lee la página anfitriona ni toca sus estilos o su texto;
   solo escucha a su propio marco y solo acepta de él el alto que pide.
   ========================================================================== */
(function () {
  "use strict";
  var script = document.currentScript;
  // Optimizadores de CMS (Rocket Loader, LiteSpeed, WP Rocket) vuelven a insertar el script y currentScript llega
  // vacío: se busca la etiqueta por su dirección (la última que apunta a /obs.js y aún no se usó).
  if (!script || !script.src) {
    var tags = document.querySelectorAll("script[src*='/obs.js']");
    script = null;
    for (var t = tags.length - 1; t >= 0; t--) {
      if (!tags[t].__obsUsed && tags[t].getAttribute("data-obs")) {
        script = tags[t];
        break;
      }
    }
  }
  if (!script || !script.src || script.__obsUsed) return;
  script.__obsUsed = true;

  var id = (script.getAttribute("data-obs") || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32);
  if (!id) return;
  var origin = new URL(script.src).origin;

  function attr(name) {
    return script.getAttribute("data-" + name) || "";
  }

  var q = ["id=" + encodeURIComponent(id)];
  var aspecto = attr("aspecto").toLowerCase();
  if (aspecto === "claro" || aspecto === "oscuro" || aspecto === "auto") q.push("aspecto=" + aspecto);
  var idioma = attr("idioma").toLowerCase().slice(0, 2);
  if (idioma === "es" || idioma === "en" || idioma === "pt") q.push("idioma=" + idioma);
  if (attr("filtros")) q.push("filtros=" + encodeURIComponent(attr("filtros").slice(0, 400)));
  if (attr("clave")) q.push("clave=" + encodeURIComponent(attr("clave").slice(0, 64)));
  var fixed = parseInt(attr("altura"), 10);
  var hasFixed = fixed >= 120 && fixed <= 2000;
  if (hasFixed) q.push("altura=" + fixed);
  // El origen de esta página, como respaldo: el marco prefiere lo que el navegador le dice (ancestorOrigins, referrer).
  q.push("origen=" + encodeURIComponent(location.origin));

  var frame = null;

  function mount() {
    frame = document.createElement("iframe");
    frame.src = origin + "/obs-embed?" + q.join("&");
    frame.title = "Observatorio de Analítica UDES";
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    // Sin allow-top-navigation: el marco no puede mover la página anfitriona. Los enlaces abren en pestaña nueva.
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads");
    frame.style.cssText = "display:block;width:100%;max-width:100%;border:0;margin:0;padding:0;background:transparent;color-scheme:normal;height:" + (hasFixed ? fixed : 480) + "px;";
    script.parentNode.insertBefore(frame, script.nextSibling);
  }

  // Solo se atiende al propio marco, y solo si el mensaje viene del origen de este portal.
  window.addEventListener("message", function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== origin) return;
    var m = e.data;
    if (!m || m.fuente !== "obs-embed" || m.tipo !== "alto" || m.id !== id) return;
    var h = Number(m.alto);
    if (!isFinite(h) || h < 40 || h > 20000) return;
    frame.style.height = Math.ceil(h) + "px";
  });

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();

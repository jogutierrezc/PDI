// Genera manual-aluna-planeacion.html a partir del contenido de este archivo.
// Uso: node docs/manual-iso/build.mjs   (y luego node docs/manual-iso/pdf.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- Datos del documento (ajustar aquí) -----------------------------------
const DOC = {
  sgc: "Sistema de Gestión de la Calidad · Planeación Institucional",
  titulo: "Manual de uso Aluna Planeación",
  codigo: "[CÓDIGO SGC]", // lo asigna Calidad
  version: "01",
  edicion: "Noviembre de 2026",
};
const PORTAL = "planeacion.udes.edu.co";

const CHAPTERS = {
  0: { name: "Antes de empezar", route: "aluna" },
  1: { name: "Indicadores de Impacto", route: "/admin/impacto" },
  2: { name: "Informes Institucionales", route: "/admin/informes-gestion" },
  3: { name: "Monitor de alertas", route: "/admin/monitor-alertas" },
  4: { name: "Portal de Alertas Tempranas", route: "/alertas" },
  5: { name: "UDRIVE", route: "/admin/udrive" },
  6: { name: "Registros y mejora", route: "iso 9001" },
};

// ---- Piezas ---------------------------------------------------------------
const esc = (s) => s;
const fls = (txt, cls = "d", size = 16) =>
  `<span class="fls" style="font-size:${size}px">${[...txt]
    .map((c) => `<span class="fl ${cls}${/[\/.\-· ]/.test(c) ? " s" : ""}">${c === " " ? "&nbsp;" : c}</span>`)
    .join("")}</span>`;

const SVG = {
  ok: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.2l2 2 3.6-4"/></svg>`,
  pe: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.2 1.4"/></svg>`,
  ri: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2l6 10.8H2z"/><path d="M8 6.6v3M8 11.4v.1"/></svg>`,
  ne: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M5.5 8h5"/></svg>`,
};
const st = (k, t) => `<span class="st ${k}">${SVG[k]}${t}</span>`;
const q = (t) => `<span class="q">«${t}»</span>`;
const rt = (t) => `<span class="rt">${t}</span>`;

function step(n, titulo, texto) {
  return `<div class="step"><span class="dot">${n}</span><div><div class="h3">${titulo}</div>${texto ? `<p>${texto}</p>` : ""}</div></div>`;
}
const steps = (arr, start = 1) => `<div class="steps">${arr.map((s, i) => step(i + start, s[0], s[1])).join("")}</div>`;
const ticket = (b, t) => `<div class="ticket"><b>${b}</b><p>${t}</p></div>`;
const pilo = (t, titulo = "Consejo de Mr. Pilo") =>
  `<div class="pilo"><img src="../manual/assets/idea-320.webp" alt="Mr. Pilo con un birrete"><div><div class="h3">${titulo}</div><p>${t}</p></div></div>`;
const list = (arr, cls = "") => `<ul class="lst ${cls}">${arr.map((x) => `<li>${x}</li>`).join("")}</ul>`;
const tbl = (head, rows, cls = "") =>
  `<table class="tbl ${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
const ficha = (rows) => `<dl class="ficha" style="margin:0">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

const missing = [];
function shot({ f, url, marks = [], alt, w, miss, cap }) {
  const file = path.join(here, "assets/shots", f + ".jpg");
  const ok = fs.existsSync(file);
  const style = w ? `width:${w};margin-left:auto;margin-right:auto;` : "";
  let inner;
  if (ok) {
    inner = `<div class="shot-img"><img src="assets/shots/${f}.jpg" alt="${alt}">${marks
      .map(([n, x, y]) => `<span class="dot" style="left:${x}%;top:${y}%">${n}</span>`)
      .join("")}</div>`;
  } else {
    missing.push(`${f}: ${miss?.t || alt}`);
    inner = `<div class="shot-miss" style="min-height:${miss?.h || 130}px">[CAPTURA DE PANTALLA · ${miss?.t || alt}]</div>`;
  }
  return `<figure style="margin:0;${style}"><div class="shot"><div class="shot-bar"><span class="shot-url">${PORTAL}${url}</span></div>${inner}</div>${cap ? `<figcaption class="cap shot-cap">${cap}</figcaption>` : ""}</figure>`;
}

// ---- Páginas --------------------------------------------------------------
const pages = [];
const START = {};
const addPage = (o) => pages.push(o);

function renderPage(o, idx, total) {
  const n = idx + 1;
  const ch = CHAPTERS[o.ch];
  const left = n % 2 === 0;
  const iso = `<header class="iso">
    <div class="iso-logos"><img src="assets/iso-logos.png" alt="Universidad de Santander, certificación Icontec ISO 9001 e IQNet"></div>
    <div class="iso-r">
      <div class="iso-sgc">${DOC.sgc}</div>
      <div class="iso-row">
        <div class="iso-doc">${DOC.titulo}<br>${DOC.codigo}</div>
        <div class="iso-ver"><div>Versión: ${DOC.version}</div><div>Página ${n} de ${total}</div></div>
      </div>
    </div>
  </header>`;
  if (o.cover) return o.html(iso);
  const tabTop = 178 + Math.max(0, o.ch - 1) * 68;
  const tab = o.ch ? `<div class="tab${left ? " l" : ""}" style="top:${tabTop}px">${o.ch}</div>` : "";
  const run = `<div class="run"><span>${ch.route.startsWith("/") ? fls(ch.route, "d", 15) : fls(ch.route, "d", 15)}</span><span>${o.ch ? `Capítulo ${o.ch} · ` : ""}<b>${ch.name}</b></span></div>`;
  const foot = `<div class="foot"><span>Aluna Planeación · Planeación Institucional · UDES</span><span>Documento controlado · la copia impresa no es controlada</span></div>`;
  if (o.open) {
    return `<section class="pg">${iso}${run}${tab}
      <div style="position:absolute;left:0;right:0;top:176px">
        <div class="open-band">
          <div><h1 class="h1">${o.title}</h1><div class="route">${fls(ch.route, "", 14)}<span>${o.routeNote || ""}</span></div></div>
          <div class="num">${fls(String(o.ch).padStart(2, "0"), "", 84)}</div>
        </div>
      </div>
      <div class="body" style="top:358px">${o.body}</div>${foot}</section>`;
  }
  return `<section class="pg">${iso}${run}${tab}<div class="body">${o.title ? `<h1 class="h1">${o.title}</h1>` : ""}${o.body}</div>${foot}</section>`;
}

// =============== PORTADA ====================================================
const boardRows = [
  [1, "Indicadores de Impacto", "/admin/impacto"],
  [2, "Informes Institucionales", "/admin/informes-gestion"],
  [3, "Monitor de alertas", "/admin/monitor-alertas"],
  [4, "Portal de Alertas Tempranas", "/alertas"],
  [5, "UDRIVE", "/admin/udrive"],
  [6, "Registros y mejora", "iso 9001"],
];
addPage({
  cover: true,
  ch: 0,
  html: (iso) => `<section class="pg" style="background:var(--navy-deep)">
    ${iso.replace('class="iso"', 'class="iso" style="top:24px"')}
    <div style="position:absolute;left:0;right:0;top:124px;height:458px;background:var(--paper)"></div>
    <div style="position:absolute;left:56px;top:190px;width:600px">
      <div style="font-family:var(--f-display);font-weight:700;font-size:84px;line-height:0.98;letter-spacing:-0.035em;color:var(--navy)">Manual<br>de uso</div>
      <div style="margin-top:20px">${fls("aluna planeación", "d", 30)}</div>
      <p style="margin-top:26px;font-size:17px;line-height:1.5;color:var(--ink-2);font-weight:500;max-width:520px">Cómo crear, subir y editar datos en las herramientas que sostienen el sistema de gestión de la calidad. Guía para vicerrectores, decanos y directores de programa.</p>
    </div>
    <img src="../manual/assets/feliz-320.webp" alt="Mr. Pilo, la mascota de Planeación, sonriendo" style="position:absolute;right:62px;top:170px;width:196px;height:auto;object-fit:contain">
    <div style="position:absolute;left:56px;right:56px;top:600px">
      ${boardRows
        .map(
          ([n, name, route]) => `<div style="display:grid;grid-template-columns:62px 1fr auto 52px;gap:14px;align-items:center;height:58px;border-top:1px solid rgba(195,213,242,0.22)">
            <span>${fls(String(n).padStart(2, "0"), "", 26)}</span>
            <span style="color:#fff;font-weight:800;font-size:19px;letter-spacing:-0.005em">${name}</span>
            <span>${fls(route, "", 15)}</span>
            <span style="text-align:right;color:var(--on-navy);font-weight:700;font-size:13px">pág. ${START[n]}</span>
          </div>`
        )
        .join("")}
      <div style="border-top:1px solid rgba(195,213,242,0.22)"></div>
    </div>
    <div style="position:absolute;left:56px;right:56px;bottom:40px;display:flex;align-items:center;justify-content:space-between;color:var(--on-navy);font-size:12.5px;font-weight:600">
      <span style="display:flex;align-items:center;gap:12px">${fls("edición 01", "sg", 18)}<span>${DOC.edicion}</span></span>
      <span>Guiado por la norma ISO 9001:2015 · Universidad de Santander</span>
    </div>
  </section>`,
});

// =============== CONTROL DEL DOCUMENTO ======================================
addPage({
  ch: 0,
  title: "Control del documento",
  body: `
  <p class="lead">Este manual es información documentada del Sistema de Gestión de la Calidad. Dice cómo se opera Aluna Planeación para que los datos de gestión queden completos, trazables y verificables.</p>
  <div style="margin-top:14px">${ficha([
    ["Objetivo", "Orientar a vicerrectores, decanos y directores de programa en el uso de los módulos de Aluna Planeación que producen registros de calidad: crear, subir y editar datos, y leer lo que el sistema muestra."],
    ["Alcance", "Indicadores de Impacto, Informes Institucionales, Monitor de alertas, Portal de Alertas Tempranas y UDRIVE, en todas las sedes de la Universidad de Santander."],
    ["Responsable", "Oficina de Planeación Institucional. Revisión técnica con la unidad de Calidad."],
    ["Norma de referencia", "NTC-ISO 9001:2015, numerales 5.3, 6.2, 7.5, 9.1, 9.3, 10.2 y 10.3."],
    ["Edición vigente", `Versión ${DOC.version} · ${DOC.edicion}`],
  ])}</div>
  <h2 class="h2">Historial de versiones</h2>
  ${tbl(
    ["Versión", "Fecha", "Descripción del cambio", "Elaboró"],
    [["01", DOC.edicion, "Emisión inicial del manual.", "Planeación Institucional"]]
  )}
  <h2 class="h2">Elaboración, revisión y aprobación</h2>
  ${tbl(
    ["Acción", "Cargo", "Nombre", "Fecha y firma"],
    [
      ["Elaboró", "Oficina de Planeación Institucional", "[NOMBRE]", "[FIRMA]"],
      ["Revisó", "Líder del Sistema de Gestión de la Calidad", "[NOMBRE]", "[FIRMA]"],
      ["Aprobó", "[CARGO QUE APRUEBA]", "[NOMBRE]", "[FIRMA]"],
    ]
  )}
  <div style="margin-top:10px">${ticket("Tenga en cuenta", "Lo que aún no tiene dato va entre corchetes: el código del documento y las firmas los asigna la unidad de Calidad al aprobar la versión. Ninguna cifra de este manual es real: las capturas muestran un usuario de prueba.")}</div>
  <p class="cap" style="margin-top:10px">Cada capítulo abre con una ficha de control (objetivo, responsable, numeral ISO 9001 y registro). Los números sobre las capturas son los de los pasos. Los botones van como en pantalla: ${q("Guardar cambios")}.</p>`,
});

// =============== CONTENIDO ==================================================
const toc = [
  [0, "Antes de empezar", "Qué es Aluna Planeación, quién la usa y cómo entrar", "aluna"],
  [1, "Indicadores de Impacto", "Elegir, crear, reportar y editar indicadores", "/admin/impacto"],
  [2, "Informes Institucionales", "Abrir, diligenciar, enviar y revisar el informe de gestión", "/admin/informes-gestion"],
  [3, "Monitor de alertas", "Semáforo de notas por facultad, programa, grupo y estudiante", "/admin/monitor-alertas"],
  [4, "Portal de Alertas Tempranas", "Panorama, estimaciones y seguimiento de cohortes", "/alertas"],
  [5, "UDRIVE", "Carpetas, tablas, informes, unidades de trabajo", "/admin/udrive"],
  [6, "Registros y mejora", "Evidencia, no conformidades y lista de verificación", "iso 9001"],
];
addPage({
  ch: 0,
  title: "Contenido",
  body: () => `<p class="lead">Seis capítulos. Los cinco primeros son las herramientas; el último junta lo que cada herramienta aporta al sistema de gestión de la calidad.</p>
  <div style="margin-top:16px">${toc
    .map(
      ([n, t, d, r]) => { const pg = START[n]; return `<div style="display:grid;grid-template-columns:46px 1fr auto 40px;gap:14px;align-items:center;padding:13px 0;border-top:1px solid var(--line)">
      <span>${n ? fls(String(n).padStart(2, "0"), "d", 22) : fls("a", "sg", 22)}</span>
      <div><div style="font-family:var(--f-display);font-weight:700;font-size:19px;color:var(--navy);letter-spacing:-0.01em">${t}</div><div style="font-size:12.5px;color:var(--ink-2);margin-top:1px">${d}</div></div>
      <span>${fls(r, "d", 13)}</span>
      <span style="text-align:right;font-weight:800;color:var(--navy)">${pg}</span></div>`; }
    )
    .join("")}<div style="border-top:1px solid var(--line)"></div></div>
  <div style="margin-top:22px">${ticket("Antes de empezar", "Todas las pantallas de este manual requieren sesión iniciada en la intranet. El menú que usted ve depende del rol y de la unidad que Planeación le asignó.")}</div>`,
});

// =============== ANTES DE EMPEZAR ===========================================
addPage({
  ch: 0,
  tocStart: true,
  title: "Entrar a Aluna Planeación y ubicarse",
  body: `<p class="lead">Aluna Planeación es la intranet de la Oficina de Planeación Institucional. Reúne los módulos donde las unidades reportan, revisan y consultan su gestión. Entre desde ${rt(PORTAL + "/acceso-intranet")} con su correo institucional.</p>
  <div class="cols n" style="margin-top:12px">
    <div>${steps([
      ["Use el buscador", `Escriba lo que quiere hacer, por ejemplo ${q("cargar cifras")}. También sirve la tecla <b>/</b>.`],
      ["Elija un módulo", `Cada mosaico trae botones directos: ${q("Registrar cifras")}, ${q("Mi informe")}.`],
      ["Mire sus pendientes", `El panel <b>Pendientes</b> avisa lo que falta, con un botón ${q("Ir")}.`],
      ["Pida el recorrido", `${q("Recorrido guiado")} explica cada pantalla con Mr. Pilo.`],
    ])}</div>
    ${shot({
      f: "admin",
      url: "/admin",
      alt: "Pantalla de inicio de Aluna Planeación con mosaicos por módulo",
      marks: [[1, 78, 19.6], [2, 7.5, 59.8], [3, 85.8, 68], [4, 74, 3.3]],
      cap: "Inicio de la intranet con un usuario de prueba. Verá solo los módulos de su rol.",
    })}
  </div>
  <h2 class="h2">Quién ve qué</h2>
  ${tbl(
    ["Perfil", "Qué ve", "Qué puede hacer"],
    [
      ["Director de programa", "Su programa y su sede", "Elegir indicadores, reportar cifras y evidencia, abrir su monitor de alertas."],
      ["Decano", "Su facultad y los programas que cuelgan de ella", "Leer el avance por programa, redactar el informe de la decanatura, revisar alertas."],
      ["Vicerrector u oficina", "Las funciones sustantivas a su cargo", "Crear fichas de indicadores, cargar cifras institucionales, importar desde Excel, llevar su informe."],
      ["Planeación", "Todo", "Abre el ciclo de informes, aprueba o devuelve, asigna programas a unidades."],
    ],
    "fix"
  )}
  <div style="margin-top:12px">${pilo(`Si no ve un módulo, no es un fallo: el menú se arma con su pertenencia a una unidad. Pida a Planeación que lo ubique en la estructura institucional.`)}</div>`,
});

addPage({
  ch: 0,
  title: "Cómo se conecta con el sistema de calidad",
  body: `<p class="lead">Cada módulo produce un registro que la norma ISO 9001:2015 pide tener: metas medibles, seguimiento, evidencia y acciones de mejora. Esta tabla dice cuál.</p>
  <div style="margin-top:12px">${tbl(
    ["Módulo", "Para qué sirve", "Numeral ISO 9001", "Registro que deja"],
    [
      ["Indicadores de Impacto", "Línea base, metas y cifras anuales por función sustantiva, de insumos a impacto real.", "6.2 · 9.1", "Cifra por indicador, año y programa, con enlace de evidencia."],
      ["Informes Institucionales", "Informe de gestión anual con foto de cifras al enviar y aprobación de Planeación.", "9.1.3 · 9.3 · 10.3", "Informe enviado y aprobado, con anexos y notas de revisión."],
      ["Monitor de alertas", "Semáforo NE · ED · RS de las notas por periodo y corte.", "9.1.1 · 8.5.1", "Lectura del corte y decisión de acompañamiento."],
      ["Portal de Alertas Tempranas", "Cohortes, estimaciones y cursos con alta reprobación.", "9.1.3 · 10.3", "Priorización de cursos y grupos."],
      ["UDRIVE", "Archivos, tablas, gráficas e informes con versiones y estados.", "7.5.2 · 7.5.3", "Versión aprobada y congelada de cada informe."],
    ],
    "fix"
  )}</div>
  <h2 class="h2">Tres ideas que sostienen todo el sistema</h2>
  ${steps([
    ["Una cifra dice de dónde sale", "Cada dato lleva su fuente, su corte y su evidencia. Sin evidencia, el informe no se envía."],
    ["Un vacío no es un cero", "Lo que nadie ha reportado se ve como «sin reportar». Así no se confunde falta de dato con mal resultado."],
    ["Lo aprobado se congela", "Al enviar o aprobar, las cifras quedan como estaban. Para cambiarlas, Planeación devuelve el informe con una nota."],
  ])}
  <div style="margin-top:14px">${ticket("Fuente y corte", "La correspondencia entre módulos y numerales es una guía de lectura de Planeación, no un texto de la norma. La unidad de Calidad confirma el numeral exacto de cada registro al aprobar este manual.")}</div>`,
});

// =============== CAP 1 · INDICADORES DE IMPACTO =============================
addPage({
  ch: 1,
  open: true,
  title: "Indicadores de Impacto",
  routeNote: "Intranet · Indicadores de Impacto",
  body: `<p class="lead">Aquí se define qué mide la universidad y cuánto avanza. Cada indicador pertenece a una función sustantiva (Investigación, Enseñanza o Extensión) y a un eslabón de la cadena de valor.</p>
  <div class="cols" style="margin-top:12px">
    <div class="stack">
      <p><b>Cómo funciona.</b> Las vicerrectorías y oficinas crean las <b>fichas</b> institucionales y reportan las cifras globales. Los programas eligen a cuáles aportan y reportan su línea base, sus metas, su cifra de cada año y un enlace de evidencia. Cada programa también puede crear indicadores propios.</p>
      <p>El resultado se consulta en el <b>Portal de Impacto</b> y en el Boletín de Seguimiento en PDF.</p>
    </div>
    <div>${ficha([
      ["Objetivo", "Medir el avance de metas por función, programa y sede."],
      ["Responsable", "Director de programa (cifras del programa); vicerrector u oficina (fichas y cifras institucionales)."],
      ["Numeral ISO", "6.2 Objetivos de calidad · 9.1 Seguimiento y medición."],
      ["Registro", "Cifra por indicador, año y alcance, con evidencia."],
    ])}</div>
  </div>
  <h2 class="h2">La cadena de valor, en cuatro eslabones</h2>
  <div class="flow" style="margin:6px 0 4px">${fls("insumos", "d", 16)}<span class="arr">→</span>${fls("procesos", "d", 16)}<span class="arr">→</span>${fls("productos", "d", 16)}<span class="arr">→</span>${fls("impacto real", "d", 16)}</div>
  <p>Una cadena completa significa que cada impacto tiene su antecedente. Si falta un eslabón, el panel de ${q("Elegir indicadores")} lo avisa.</p>
  <h2 class="h2">Las tres funciones y su código</h2>
  ${tbl(
    ["Función", "Código", "Quién define las fichas"],
    [
      ["Investigación", "I01, I02…", "Vicerrectoría de Investigación"],
      ["Enseñanza", "E01, E02…", "Vicerrectoría de Enseñanza"],
      ["Extensión", "X01, X02…", "Vicerrectoría de Extensión"],
    ],
    "fix"
  )}
  <p class="cap" style="margin-top:6px">Los códigos con P- son indicadores propios de un programa.</p>`,
});

addPage({
  ch: 1,
  title: "Qué verá según su perfil",
  body: `<p class="lead">Las pestañas dependen de su pertenencia a una unidad, no de su cargo. Si no ve la que busca, pida a Planeación que lo ubique en la estructura institucional.</p>
  <div style="margin-top:12px">${shot({
    f: "impacto-admin",
    url: "/admin/impacto/mi-catalogo",
    alt: "Mi catálogo de un programa, con las cuatro fichas institucionales que sigue",
    marks: [[1, 22, 8.4], [2, 55, 41], [3, 88.5, 16.8]],
    w: "68%",
    cap: "Mi catálogo (usuario de prueba de un programa): 1 pestañas del módulo · 2 fichas institucionales que sigue · 3 crear un indicador propio.",
  })}</div>
  <h2 class="h2">Pestañas por perfil</h2>
  ${tbl(
    ["Perfil", "Pestañas"],
    [
      ["Programa o facultad", `${q("Mi catálogo")}, ${q("Elegir indicadores")} y ${q("Captura")}. La captura se habilita cuando ya sigue algún indicador.`],
      ["Vicerrectoría u oficina", `${q("Mi vicerrectoría")} (o ${q("Mi oficina")}), ${q("Captura")}, ${q("Pilares y ODS")}, ${q("De los programas")} e ${q("Importar")}.`],
      ["Planeación y administración", "Todo lo anterior, más el diccionario del motor y los ajustes de Mr. Pilo."],
    ],
    "fix"
  )}
  <div style="margin-top:12px">${ticket("Tenga en cuenta", "Dentro de una vicerrectoría o un programa, el papel de cada miembro es visor, editor o jefe. El visor solo mira; el editor y el jefe pueden editar. Un programa hereda el papel de su facultad.")}</div>`,
});

addPage({
  ch: 1,
  title: "Elegir los indicadores a los que aporta su programa",
  body: `<p class="lead">Antes de reportar, el programa dice a qué indicadores institucionales aporta. Marcar guarda al instante, y quitar uno no borra lo ya reportado.</p>
  <div style="margin-top:10px">${shot({
    f: "elegir",
    url: "/admin/impacto/elegir",
    alt: "Tabla de 105 indicadores con casillas para seguir y un panel que resume lo elegido",
    marks: [[1, 22.8, 16], [2, 21.4, 31], [3, 86.5, 22.6], [4, 86.7, 61.2]],
    w: "70%",
    cap: "Elegir indicadores, con un usuario de prueba del programa de Bacteriología y Laboratorio Clínico.",
  })}</div>
  <div class="cols" style="margin-top:12px">
    <div>${steps([
      ["Abra la pestaña", `Pulse ${q("Elegir indicadores")}. Los chips filtran por función: ${q("Investigación")}, ${q("Enseñanza")} y ${q("Extensión")}.`],
      ["Marque lo que aporta", `Active la casilla de cada fila. ${q("Solo los que aún no sigo")} muestra lo pendiente.`],
    ])}</div>
    <div>${steps([
      ["Revise el resumen", `El panel de la derecha cuenta los indicadores por función y avisa si la cadena está completa.`],
      ["Vaya a reportar", `Pulse ${q("Ir a reportar")}. Queda bloqueado mientras no marque ninguno.`],
    ])}</div>
  </div>
  <h2 class="h2">Qué muestra cada columna</h2>
  <p><b>Cód.</b> código de la ficha (I Investigación, E Enseñanza, X Extensión) · <b>Dimensión</b> tema dentro de la función · <b>Meta VR 2026</b> meta institucional; un guion significa que aún no se define · <b>Cifra UDES</b> última cifra institucional, o «Sin reportar».</p>
  <p class="cap" style="margin-top:8px">Si una ficha es solo de consulta, el programa la ve pero no reporta cifra: la reporta la vicerrectoría.</p>`,
});

addPage({
  ch: 1,
  title: "Crear un indicador propio del programa",
  body: `<p class="lead">Si ninguna ficha institucional mide lo que su programa necesita, cree un indicador propio. El asistente tiene cinco pasos y guarda en el catálogo del programa.</p>
  <div class="cols" style="margin-top:10px">
    <div>
      ${shot({
        f: "im-wizard1c",
        url: "/admin/impacto/mi-catalogo",
        alt: "Asistente Nuevo indicador del programa en el paso 1, Qué mide, con los campos de función, nombre y eslabón",
        marks: [[2, 4.5, 22], [2, 4.5, 34.9], [2, 4.5, 80.8]],
        cap: "Paso 1 del asistente. El código lo asigna el sistema.",
      })}
    </div>
    <div>${steps([
      ["Abra el asistente", `En ${q("Mi catálogo")} pulse ${q("Nuevo indicador del programa")}.`],
      ["Diga qué mide", `Elija la función, escriba el nombre y el eslabón. El nombre dice qué se cuenta y de quién: «Estudiantes vinculados a semilleros».`],
      ["Diga cómo se mide", `Forma de medir (número, porcentaje, proporción, pesos o categoría), numerador, denominador, unidad, ${q("Mejor si")} sube o baja, fuente y responsable.`],
      ["Ponga línea base y metas", `Línea base 2023, meta 2026 y meta 2028. Escriba «≥ 80%» o «85%» tal como los fijó el programa.`],
      ["Marque pilares y ODS", `Acepte las sugerencias con ${q("Tomar las sugerencias del motor")} o elija a mano.`],
      ["Revise y guarde", `El paso 5 lista lo que falta. Pulse ${q("Guardar en el catálogo del programa")}; puede completar después.`],
    ])}
    <div style="margin-top:12px">${ticket("Tenga en cuenta", "Puede relacionar el indicador con una ficha institucional (campo Relacionado con) para que sume a su cadena. Si queda solo del programa, la vicerrectoría de esa función igual lo ve.")}</div></div>
  </div>`,
});

addPage({
  ch: 1,
  title: "Crear una ficha institucional (vicerrectoría u oficina)",
  body: `<p class="lead">Las fichas las crean las vicerrectorías y oficinas. Una ficha en borrador la ve solo su vicerrectoría; al publicarla, los programas pueden elegirla.</p>
  <div class="cols n" style="margin-top:10px">
    ${shot({
      f: "im-catalogo-vr",
      url: "/admin/impacto/catalogo",
      alt: "Catálogo de fichas de la vicerrectoría con el botón Nuevo indicador",
      miss: { t: "Impacto · Mi vicerrectoría · catálogo de fichas (perfil vicerrectoría)", h: 190 },
      marks: [[1, 88, 14]],
    })}
    <div>${steps([
      ["Entre al catálogo", `Abra ${rt("/admin/impacto/catalogo")}. La tabla lista código, indicador, dimensión, unidad, metas y estado de la ficha.`],
      ["Pulse el botón", `${q("Nuevo indicador")} abre el asistente de cinco pasos.`],
      ["Complete los pasos", `Qué mide, cómo se mide, línea base y metas, pilares y ODS.`],
      ["Decida quién reporta", `Desmarque ${q("Los programas reportan su propia cifra")} si solo la vicerrectoría tiene el dato.`],
      ["Guarde o publique", `${q("Guardar como borrador")} o ${q("Publicar")}. Una vez publicada, los programas pueden elegirla.`],
    ])}</div>
  </div>
  <h2 class="h2">Reglas del código y del estado</h2>
  ${tbl(
    ["Regla", "Detalle"],
    [
      ["Código", "De 1 a 4 letras y de 1 a 3 cifras, por ejemplo E30. Si ya existe, el botón Siguiente se bloquea."],
      ["Nombre", "Más de 3 caracteres; diga qué se cuenta y de quién."],
      ["Estado de la ficha", `${st("ne", "Borrador")} solo la ve su vicerrectoría · ${st("ok", "Publicada")} los programas pueden elegirla · ${st("ri", "Retirada")} deja de ofrecerse.`],
      ["Editar", "Pulse el código o el nombre: se abre un panel con las secciones de la ficha y el botón Guardar."],
    ],
    "fix"
  )}
  <div style="margin-top:12px">${pilo("Las fichas con la marca «Sugerido CESU» vienen recomendadas para los programas. Considere publicarlas primero.")}</div>`,
});

addPage({
  ch: 1,
  title: "Reportar y editar las cifras del programa",
  body: `<p class="lead">La pestaña ${q("Captura")} muestra un indicador a la vez. A la izquierda está la cola; en el centro, el año y la cifra; a la derecha, la meta de la vicerrectoría y las suyas.</p>
  <div style="margin-top:10px">${shot({
    f: "im-programa",
    url: "/admin/impacto/programa",
    alt: "Captura del programa: cola de indicadores, años, cifra, evidencia y metas",
    marks: [[1, 31.5, 16.4], [2, 29, 34.4], [3, 57.5, 41.2], [4, 51.3, 57], [5, 49.3, 75], [6, 87.4, 58.4], [7, 62.7, 87.6]],
    w: "68%",
    cap: "Captura con un usuario de prueba. Los campos están vacíos: aún no hay cifras reportadas.",
  })}</div>
  <div class="cols" style="margin-top:12px">
    <div>${steps([
      ["Elija el modo", `${q("Un indicador a la vez")} o ${q("Frente a la UDES")} para comparar con la cifra institucional.`],
      ["Elija el indicador", "Escoja una fila de la cola, agrupada por eslabón."],
      ["Elija el año", `Use los botones ${q("LB 2023")}, 2024… 2028.`],
      ["Escriba la cifra", `Si es porcentaje, ponga numerador y denominador: la cifra se calcula sola. Puede escribirla directo.`],
    ])}</div>
    <div>${steps([
      ["Pegue la evidencia", `Un enlace que empiece por http:// o https://. Sin enlace válido, ${q("Guardar")} se bloquea.`],
      ["Fije sus metas", `Línea base 2023, meta 2026 y meta 2028 del programa.`],
      ["Guarde", `${q("Guardar")} o ${q("Guardar y seguir")}. Para editar una cifra ya guardada, vuelva a abrirla y cámbiela.`],
    ], 5)}
    <div style="margin-top:10px">${ticket("Fuente y corte", "«No aplica» es distinto de dejar vacío: use la casilla «En este año el indicador no aplica a mi programa».")}</div></div>
  </div>`,
});

addPage({
  ch: 1,
  title: "Cargar cifras institucionales desde Excel",
  body: `<p class="lead">Las vicerrectorías pueden escribir en la hoja de ${q("Captura")} o cargar muchas cifras de una vez desde Excel. La carga valida todo antes de guardar: si hay un error, no se guarda nada.</p>
  <div class="cols w" style="margin-top:10px">
    ${shot({
      f: "im-importar",
      url: "/admin/impacto/importar",
      alt: "Pantalla Importar con los tres pasos: descargar plantilla, llenarla y cargarla",
      miss: { t: "Impacto · Importar · los tres pasos (perfil vicerrectoría)", h: 200 },
    })}
    <div>${steps([
      ["Descargue la plantilla", `${q("Descargar plantilla")} trae sus fichas, el año de corte y las listas de sedes y programas.`],
      ["Llénela en Excel", `Una fila por cifra: código, año, alcance (Global, Sede o Programa), valor, numerador, denominador y nota.`],
      ["Cárguela y revise", `${q("Cargar archivo")}. La vista previa marca cada fila: ${st("ok", "Nueva")} ${st("pe", "Cambia")} ${st("ne", "Igual")}.`],
      ["Confirme", `${q("Cargar N cifras")}. Las iguales no se tocan.`],
    ])}</div>
  </div>
  <h2 class="h2">Errores frecuentes y cómo corregirlos</h2>
  ${tbl(
    ["Mensaje", "Qué hacer"],
    [
      ["No se pudo leer el archivo", "Guárdelo como .xlsx. Los .xls antiguos y los CSV no se leen."],
      ["La ficha X no está entre las suyas", "Solo carga cifras de las fichas que su unidad edita. Pida acceso al jefe de la unidad dueña."],
      ["Con alcance Sede hay que elegir la sede", "Escoja la sede de la lista desplegable; no la escriba a mano."],
      ["El denominador no puede ser cero", "Corrija el denominador o deje numerador y denominador vacíos."],
      ["Repite la fila N", "Hay dos filas con la misma ficha, año y alcance. Deje una."],
      ["La evidencia tiene que ser un enlace que empiece por http", "Pegue la dirección completa del documento."],
    ],
    "fix"
  )}
  <div style="margin-top:12px">${ticket("Tenga en cuenta", "El avance de un indicador es la cifra más reciente dividida entre la meta 2026. En lo que debe bajar, como la deserción, el cociente se invierte.")}</div>`,
});

addPage({
  ch: 1,
  title: "Consultar el Portal de Impacto y el boletín",
  body: `<p class="lead">El portal muestra el estado de los indicadores sin editar nada. Sirve para preparar reuniones, decidir dónde reforzar y descargar el boletín en PDF.</p>
  <div class="cols" style="margin-top:10px">
    ${shot({
      f: "im-portal-limpio",
      url: "/impacto",
      alt: "Portal de Impacto, vista institucional, con la cadena de valor y las tres funciones",
      marks: [[1, 38, 11.4], [2, 69, 47], [3, 12.9, 76.4]],
      cap: "1 vistas · 2 cadena de valor, el ancho es cuántos indicadores hay · 3 matriz completa.",
    })}
    ${shot({
      f: "im-programa-pagina",
      url: "/impacto/programa/…",
      alt: "Página de un programa en el Portal de Impacto con el botón Boletín PDF",
      marks: [[4, 88, 51]],
      cap: "4 botón Boletín PDF. Un programa sin fichas elegidas lo dice con un aviso.",
    })}
  </div>
  <h2 class="h2">Cuatro vistas, una pregunta cada una</h2>
  ${tbl(
    ["Vista", "Ruta", "Responde"],
    [
      ["Institucional", rt("/impacto"), "¿Cómo va la universidad en cada eslabón y función?"],
      ["Vicerrectorías", rt("/impacto/vicerrectoria/:función"), "¿Cómo cumple cada facultad en esta función?"],
      ["Facultades", rt("/impacto/facultad/:facultad"), "¿Qué tan parejos van sus programas?"],
      ["Programas", rt("/impacto/programa/:programa"), "¿Cómo van los indicadores de cada programa frente a su meta 2026?"],
    ],
    "fix"
  )}
  <h2 class="h2">Estados que verá</h2>
  <div class="flow">${st("ok", "Cumplida")}<span class="cap">avance de 100 % o más</span>${st("pe", "En camino")}${st("ri", "Rezagada")}${st("ne", "Sin cifra")}<span class="cap">«Sin cifra» no es cero</span></div>
  <div style="margin-top:12px">${ticket("Boletín PDF", `Pulse ${q("Boletín PDF")} y luego ${q("Descargar PDF")}. En el diálogo de impresión elija «Guardar como PDF» y active «Gráficos de fondo».`)}</div>`,
});

// =============== CAP 2 · INFORMES ===========================================
addPage({
  ch: 2,
  open: true,
  title: "Informes Institucionales",
  routeNote: "Intranet · Informes de gestión",
  body: `<p class="lead">Es el informe de gestión anual de decanaturas, vicerrectorías, oficinas, rectorías de campus y Rectoría General. Se escribe sobre plantillas estándar, con las cifras ya cargadas desde UDES en Cifras y el Plan de Desarrollo.</p>
  <div class="cols" style="margin-top:12px">
    <div class="stack">
      <p><b>Cómo funciona.</b> Hay un ciclo por año. Planeación lo abre; cada unidad diligencia su informe; el gestor lo envía; Planeación lo aprueba o lo devuelve con notas por sección.</p>
      <p>Las cifras siguen <b>en vivo</b> mientras es borrador. Al enviar, el sistema toma una <b>foto</b> y se bloquea. Al aprobar, queda congelado.</p>
    </div>
    <div>${ficha([
      ["Objetivo", "Dejar un informe anual completo, con evidencia, aprobado por Planeación."],
      ["Responsable", "Gestor de la unidad (decano, vicerrector, jefe) y Planeación."],
      ["Numeral ISO", "9.1.3 Análisis y evaluación · 9.3 Revisión por la dirección · 10.3 Mejora."],
      ["Registro", "Informe enviado y aprobado, con anexos y notas."],
    ])}</div>
  </div>
  <h2 class="h2">Los cuatro estados del informe</h2>
  <div class="flow">${st("ne", "Borrador")}<span class="arr">→</span>${st("pe", "Enviado")}<span class="arr">→</span>${st("ok", "Aprobado")}<span class="arr">o</span>${st("ri", "Devuelto")}<span class="cap">y vuelve a edición</span></div>
  ${tbl(
    ["Paso", "Quién lo hace"],
    [
      ["Borrador → Enviado", "Gestor de la unidad o Planeación"],
      ["Devuelto → Borrador", "Gestor, contribuyente o Planeación"],
      ["Enviado → Aprobado o Devuelto", "Solo Planeación"],
      ["Aprobado → Devuelto («Reabrir y devolver con nota»)", "Solo Planeación"],
    ],
    "fix"
  )}
  <p class="cap" style="margin-top:8px"><b>Plantillas:</b> A decanatura, a Rectoría de Campus · B vicerrectoría u oficina, a Rectoría General · C rectoría de campus, a Rectoría General · D Rectoría General, al Consejo Superior.</p>`,
});

addPage({
  ch: 2,
  title: "Abrir el ciclo y el informe de cada unidad",
  body: `<p class="lead">Planeación abre el ciclo del año y el informe de cada unidad. Si usted ve que Planeación todavía no lo abrió, no es un error: no hay nada que diligenciar aún.</p>
  <div class="cols w" style="margin-top:10px">
    ${shot({
      f: "informes",
      url: "/admin/informes-gestion/mi-informe",
      alt: "Mi informe con el aviso de que Planeación todavía no abre el informe 2027, y el banner de primera vez con Pilo",
      marks: [[1, 30, 8.4], [2, 50, 17.8], [3, 38, 30]],
      cap: "Con un usuario de prueba: 1 pestañas · 2 guía de Pilo · 3 aviso de informe sin abrir.",
    })}
    <div>${steps([
      ["Entre a Mi informe", `Abra ${rt("/admin/informes-gestion/mi-informe")}. El año va en la cabecera.`],
      ["Mire su papel", `La cabecera dice «su papel»: Gestor, Contribuyente, Consulta o Planeación.`],
      ["Pida que lo abran", `Si falta el informe, pida a Planeación que lo abra con la plantilla que corresponde a su unidad.`],
    ])}</div>
  </div>
  <h2 class="h2">Para Planeación: abrir el ciclo</h2>
  ${steps([
    ["Entre al tablero", `${rt("/admin/informes-gestion")} → ${q("Tablero del ciclo")}.`],
    ["Cree el ciclo", `Complete año, nombre, ${q("Fecha límite")}, ${q("Corte de las cifras")} y estado (En preparación, Abierto o Cerrado).`],
    ["Defina qué datos se justifican", `Por plantilla: marque cada dato como ${q("Justificar")}, sugerido o no. Un dato a justificar queda bloqueado hasta que la unidad escribe una línea.`],
    ["Abra las unidades", `En ${q("Entrega por unidad")} abra los informes con su plantilla y siga el avance general.`],
  ])}
  <div style="margin-top:12px">${ticket("Tenga en cuenta", "Una unidad sin unidad asignada ve: «Su usuario no tiene ninguna unidad asignada». Pida a Planeación que se la asigne en «Dónde trabaja».")}</div>`,
});

addPage({
  ch: 2,
  title: "Diligenciar y editar el informe",
  body: `<p class="lead">El informe se escribe por secciones. Cada una tiene un punto de color: sin empezar, en curso o lista. Los cambios se guardan solos y el mensaje dice ${q("Cambios guardados")}.</p>
  <div class="cols n" style="margin-top:10px">
    ${shot({
      f: "inf-mi-informe",
      url: "/admin/informes-gestion/mi-informe",
      alt: "Mi informe con la tira de secciones, los controles laterales y un texto en edición",
      miss: { t: "Informes · Mi informe · secciones y controles (informe abierto)", h: 230 },
    })}
    <div>${steps([
      ["Salte entre secciones", "La tira «Secciones del informe» lista todas con su avance."],
      ["Escriba los textos", `Use claves como <b>[[matric]]</b> para insertar una cifra viva. Un número escrito a mano genera advertencia.`],
      ["Pida un borrador a Pilo", `${q("Pilo redacta un borrador")} reemplaza el texto; confirme cada cifra antes de aceptarlo.`],
      ["Lea los controles", "A la derecha, en ámbar, lo que falta: cifras sin justificar, logros sin evidencia, metas."],
    ])}</div>
  </div>
  <h2 class="h2">Qué se llena en cada tipo de sección</h2>
  ${tbl(
    ["Sección", "Qué hace usted"],
    [
      ["Resumen y conclusiones", "Texto propio; mínimo 25 palabras."],
      ["Alineación con el PDI", "Marque los pilares con los que se articula la unidad y escriba su aporte."],
      ["Objetivos y metas", "En facultades y programas llegan de Impacto. Para metas propias: «Añadir meta» con programado y alcanzado."],
      ["Resultados por dimensión", "Cifra actual, anterior y meta; el estado se calcula solo. «Añadir cifra» o «Añadir acción»."],
      ["Puntos críticos y retos", "Una fila por punto, con acción y fecha. Se puede importar desde Excel."],
      ["Logros destacados", "Máximo tres, cada uno con evidencia."],
    ],
    "fix"
  )}
  <div style="margin-top:10px">${ticket("Fuente y corte", "Cuando una cifra de UDES en Cifras cambia, el informe avisa «cambió de X a Y» y la unidad la acepta. Un dato marcado «Justificar» pide una línea de explicación.")}</div>`,
});

addPage({
  ch: 2,
  title: "Subir la evidencia obligatoria y enlazar Drive",
  body: `<p class="lead">Todo informe lleva la sección ${q("Evidencias y fuentes de verificación")}. No se puede desactivar y es obligatoria: sin al menos un archivo o enlace, el informe no se envía.</p>
  <div class="cols n" style="margin-top:10px">
    ${shot({
      f: "inf-evidencias",
      url: "/admin/informes-gestion/mi-informe",
      alt: "Sección de evidencias con la zona de arrastre y el campo para añadir un enlace",
      miss: { t: "Informes · sección Evidencias y fuentes de verificación", h: 230 },
    })}
    <div>
      <div class="h3" style="margin-bottom:6px">Opción A: subir un archivo</div>
      ${steps([
        ["Suelte o elija", `Arrastre el archivo a ${q("Suelte archivos o haga clic")}. Acepta PDF, Word, Excel o imagen, hasta 15 MB.`],
        ["Espere", `Mientras sube dice «Subiendo…». Aparece en la tabla «Archivo o enlace».`],
      ])}
      <div class="h3" style="margin:12px 0 6px">Opción B: enlazar un documento en línea</div>
      ${steps([
        ["Pegue la dirección", `En «https://… (documento en línea)» pegue el enlace de Drive.`],
        ["Dele nombre", `Escriba el nombre en «Nombre del documento» y pulse ${q("Añadir enlace")}.`],
      ])}
    </div>
  </div>
  <h2 class="h2">Editar o quitar un anexo</h2>
  ${list([
    `Use las acciones de la fila: abrir, editar o quitar. Al editar puede cambiar ${q("Nombre en el informe")}, la dirección o el archivo.`,
    `El campo ${q("Qué demuestra este anexo")} (hasta 300 caracteres) explica para qué sirve. Escríbalo siempre: el revisor lo lee primero.`,
    `Los anexos se numeran solos y la sección ${q("Anexos")} los lista.`,
    `Para enlazar un logro a su evidencia, cargue primero el archivo aquí y luego elíjalo en el logro.`,
  ])}
  <h2 class="h2">Tablas y gráficas desde UDRIVE</h2>
  <p>En cualquier sección puede pulsar ${q("+ Agregar una tabla o gráfica de UDrive")}, buscar en su UDrive y elegir. Si la tabla ya no existe o está en la papelera, el informe avisa «No se pudo leer la tabla de UDrive».</p>
  <div style="margin-top:12px">${pilo("Un enlace de Drive debe tener permiso de lectura para quien revisa. Ábralo en una ventana privada antes de enviarlo.")}</div>`,
});

addPage({
  ch: 2,
  title: "Enviar, revisar y aprobar",
  body: `<p class="lead">Cuando todas las secciones están listas y hay evidencia, el gestor envía el informe. Planeación lo lee y decide.</p>
  <div class="cols" style="margin-top:10px">
    <div>
      <div class="h3" style="margin-bottom:6px">Para el gestor de la unidad</div>
      ${steps([
        ["Complete las secciones", "Todas en «Lista» y con evidencia cargada."],
        ["Pulse enviar", `El botón dice ${q("Enviar a Rectoría de Campus")} (o su destino). Si está bloqueado, el motivo aparece debajo.`],
        ["Espere la revisión", `Queda «Enviado el [fecha]. Esperando la revisión de Planeación». Las cifras quedan congeladas.`],
        ["Si lo devuelven", `Verá «Planeación lo devolvió» y una nota por sección. Corrija y reenvíe.`],
      ])}
    </div>
    <div>
      <div class="h3" style="margin-bottom:6px">Para Planeación</div>
      ${steps([
        ["Abra la cola", `${rt("/admin/informes-gestion/revision")}. Filtre: Por revisar, Devueltos, Aprobados o Todos.`],
        ["Lea el informe", `Se lee tal como quedará, con la foto de cifras tomada al enviar.`],
        ["Escriba notas", `Una por sección y una general. Para devolver se necesita al menos una.`],
        ["Decida", `${q("Aprobar")} congela el informe. ${q("Devolver con nota")} lo vuelve a la unidad.`],
      ])}
    </div>
  </div>
  <h2 class="h2">Si el botón de enviar está bloqueado</h2>
  ${tbl(
    ["Mensaje bajo el botón", "Qué falta"],
    [
      ["Se habilita cuando las N secciones estén listas (van M)", "Marque como lista cada sección pendiente."],
      ["Faltan las evidencias y fuentes de verificación", "Cargue al menos un archivo o enlace."],
      ["Solo el Gestor de la unidad o Planeación envían el informe", "Pida al gestor que lo envíe."],
      ["Ya se envió: Planeación lo revisa", "No hace falta nada. Espere la decisión."],
    ],
    "fix"
  )}
  <div style="margin-top:12px">${shot({
    f: "inf-revision",
    url: "/admin/informes-gestion/revision",
    alt: "Cola de revisión de Planeación con filtros por estado y el informe abierto",
    miss: { t: "Informes · Revisión · cola y decisión (perfil Planeación)", h: 120 },
  })}</div>`,
});

addPage({
  ch: 2,
  title: "Vista previa, PDF y guía con Pilo",
  body: `<p class="lead">La pestaña ${q("Vista del informe")} muestra el informe como saldrá en papel. Desde ahí se descarga el PDF oficial en Carta o A4.</p>
  <div class="cols" style="margin-top:10px">
    ${shot({
      f: "inf-vista",
      url: "/admin/informes-gestion/vista",
      alt: "Vista del informe, con el aviso de informe sin abrir",
      cap: "Vista del informe de un usuario de prueba, sin informe abierto aún.",
    })}
    ${shot({
      f: "inf-guia",
      url: "/admin/informes-gestion/mi-informe",
      alt: "Guía con Pilo, paso 1 de 20, Dónde está todo",
      cap: "Guía con Pilo: 20 pasos en seis capítulos, con texto y voz.",
    })}
  </div>
  ${steps([
    ["Abra la vista", `Pulse ${q("Vista del informe")}.`],
    ["Elija el papel", `${q("Carta")} o ${q("A4")}. Personalice la portada y el cierre si lo necesita.`],
    ["Descargue", `${q("Descargar PDF")}. Abre una previa y genera el PDF oficial.`],
    ["Lea la marca", "Un borrador lleva la marca «Cifras en vivo». Uno enviado o aprobado dice «Foto del [fecha]»."],
  ])}
  <h2 class="h2">Cuando necesite ayuda</h2>
  ${list([
    `${q("Empezar la guía")} abre un recorrido de 20 pasos con Mr. Pilo: primer vistazo, escribir cada sección, controles y datos de apoyo, reportar con Pilo, enviar y revisión.`,
    `El botón <b>?</b> de cada zona explica solo esa parte.`,
    `Los atajos llevan a UDES en Cifras, al Plan de Desarrollo y a Pilo para consultar datos.`,
  ])}
  <div style="margin-top:12px">${ticket("Tenga en cuenta", "El informe completo no se exporta a Excel. Solo las plantillas de filas y metas, y la configuración de datos requeridos, tienen «Descargar plantilla» e «Importar Excel».")}</div>`,
});

// =============== CAP 3 · MONITOR DE ALERTAS =================================
addPage({
  ch: 3,
  open: true,
  title: "Monitor de alertas",
  routeNote: "Intranet · Alertas tempranas de notas",
  body: `<p class="lead">El monitor muestra cómo van las notas de los estudiantes en el periodo. Recorre Institución, Facultad, Programa, Grupo y Estudiante con un semáforo de tres niveles.</p>
  <div class="cols" style="margin-top:12px">
    <div class="stack">
      <p><b>Cómo funciona.</b> Planeación carga el «Reporte global de notas» de Davinci en el Warehouse. El monitor lo lee por periodo, sede y corte (P1, P2, P3) y muestra el código real del estudiante, sin nombre.</p>
      <p><b>Una alerta no se cierra en el sistema.</b> Es una señal para acompañar, no una calificación ni una sanción. Usted actúa fuera de la herramienta: habla con el estudiante o con el docente del curso.</p>
    </div>
    <div>${ficha([
      ["Objetivo", "Detectar a tiempo dónde acompañar a estudiantes y grupos."],
      ["Responsable", "Decano y director de programa; Planeación asigna los programas a cada unidad."],
      ["Numeral ISO", "9.1.1 Seguimiento y medición · 8.5.1 Control de la prestación del servicio."],
      ["Registro", "Lectura del corte y decisión de acompañamiento."],
    ])}</div>
  </div>
  <h2 class="h2">El semáforo</h2>
  ${tbl(
    ["Nivel", "Nombre", "Cuándo se asigna"],
    [
      [st("ok", "NE"), "Nivel Esperado", "Promedio de 3,5 o más y ninguna materia perdida."],
      [st("pe", "ED"), "En Desarrollo", "Promedio de 3,0 a 3,49, o una materia perdida."],
      [st("ri", "RS"), "Requiere Seguimiento", "Promedio menor de 3,0, dos o más materias perdidas, o una caída de 0,5 o más frente al corte anterior."],
    ]
  )}
  <p class="cap" style="margin-top:6px">Aprobar es 3,0 (en Medicina, 3,5). Un estudiante se clasifica en un corte solo si ya tiene nota en la mitad o más de sus materias.</p>
  <div style="margin-top:12px">${ticket("Fuente y corte", "Las notas salen del «Reporte global de notas» de Davinci, cargado en el UDES Warehouse. Cada periodo y sede es una carga distinta. El código del estudiante es un dato personal: úselo solo para su seguimiento académico.")}</div>`,
});

addPage({
  ch: 3,
  title: "Revisar su facultad o programa, de arriba hacia abajo",
  body: `<p class="lead">El recorrido va de lo general a lo particular: elija periodo y sede, abra la unidad con más estudiantes en seguimiento y baje hasta el estudiante.</p>
  <div class="cols n" style="margin-top:10px">
    ${shot({
      f: "mon-institucion",
      url: "/admin/monitor-alertas",
      alt: "Monitor de alertas con selectores de periodo y sede, y la lista Dónde hay que actuar",
      miss: { t: "Monitor de alertas · Institución · Dónde hay que actuar (usuario con programas asignados)", h: 250 },
    })}
    <div>${steps([
      ["Elija periodo y sede", `Arriba a la derecha: por ejemplo 2026b y Bucaramanga. Al cambiarlos, el recorrido se reinicia.`],
      ["Elija el corte", `P1, P2 o P3. Se abre el último corte con notas; los que aún no tienen notas aparecen deshabilitados.`],
      ["Empiece por aquí", `La primera fila de ${q("Dónde hay que actuar")} lleva esa marca: es donde más estudiantes están en seguimiento.`],
      ["Baje un nivel", `Abra la facultad, luego el programa y su lista de grupos.`],
      ["Abra el grupo", `Verá los estudiantes por código, con su nivel. Busque los RS.`],
      ["Abra un código", `${q("Sus materias")} muestra la nota de cada corte y la tendencia.`],
    ])}</div>
  </div>
  <h2 class="h2">Qué mirar en el análisis de cada pantalla</h2>
  ${tbl(
    ["Pestaña", "Qué responde"],
    [
      ["Cómo evoluciona", "Cuánto pesan NE, ED y RS en cada corte. Cada columna suma 100 %."],
      ["Cursos con alta reprobación", "Materias con 30 % o más bajo la nota de aprobar y al menos 15 estudiantes con nota."],
      ["Análisis de Pilo", "Resumen en palabras, hecho solo con conteos. Pilo nunca recibe códigos de estudiantes."],
    ],
    "fix"
  )}
  <p class="cap" style="margin-top:8px">Un grupo requiere seguimiento cuando 30 % o más de quienes ya tienen nota va por debajo de la de aprobar; en desarrollo, desde 15 %.</p>`,
});

addPage({
  ch: 3,
  title: "Mapa de riesgo, umbrales y búsqueda",
  body: `<p class="lead">Además del semáforo por estudiante, el monitor tiene una segunda mirada: dónde se reprueba. Úsela para decidir qué cursos reforzar.</p>
  <div class="cols" style="margin-top:6px">
    <div>${steps([
      ["Abra el mapa", `Pulse ${q("Mapa de riesgo")} («dónde se reprueba»).`],
      ["Elija qué cuenta", `${q("Tres cortes")} o ${q("Nota final: todos los planes")}. P1, P2 y P3 usan solo los grupos de plan «Tres cortes».`],
      ["Baje de nivel", "Facultad → programa → curso → grupo. En un curso, abra un grupo para ver los códigos."],
    ])}</div>
    <div>${tbl(
      ["Tasa de reprobación", "Lectura"],
      [
        [st("pe", "30 % o más"), "Alta"],
        [st("ri", "50 % o más"), "Crítica"],
        [st("ne", "Menos de 5"), "Sin detalle: pocas matrículas"],
      ]
    )}</div>
  </div>
  <h2 class="h2">Buscar a un estudiante</h2>
  <p>Escriba al menos 2 caracteres del código en ${q("Buscar código de estudiante")} y elija el resultado: lo lleva directo a su vista. Solo busca entre lo que usted ya puede ver.</p>
  <h2 class="h2">Probar otros umbrales</h2>
  <p>El desplegable ${q("Cómo se clasifica")}, al pie, deja cambiar cuatro valores: promedio para NE (3,5), promedio para RS (3,0), materias perdidas para RS (2) y caída entre cortes (0,5). Los gráficos se recalculan en pantalla. <b>No se guardan</b>: al recargar vuelven los valores oficiales.</p>
  <h2 class="h2">Si el monitor no abre</h2>
  <div class="cols n">
    ${shot({
      f: "monitor",
      url: "/admin/monitor-alertas",
      alt: "Aviso rojo: No se pudo abrir el Monitor, su usuario no tiene programas asignados todavía",
      marks: [[1, 79, 3.3], [2, 45, 15]],
      cap: "1 periodo y sede · 2 aviso de programas sin asignar.",
    })}
    <div class="stack"><p>El aviso <b>«Su usuario no tiene programas asignados todavía»</b> significa que Planeación debe asociar su unidad con los programas. Pida la asignación y pulse ${q("Reintentar")}.</p>
    ${ticket("Tenga en cuenta", "Solo Planeación ve el panel que asigna programas a unidades. El filtro lo aplica la base de datos, no el navegador.")}</div>
  </div>`,
});

// =============== CAP 4 · PORTAL DE ALERTAS TEMPRANAS ========================
addPage({
  ch: 4,
  open: true,
  title: "Portal de Alertas Tempranas",
  routeNote: "Portal con sesión · Monitor de alertas",
  body: `<p class="lead">Es el monitor presentado como portal propio, con sesión. Se organiza por Facultad, Programa y Semestre y permite seguir una cohorte a lo largo de los periodos.</p>
  <div class="cols" style="margin-top:12px">
    <div class="stack">
      <p><b>Qué añade al monitor.</b> Estimaciones: las notas de cortes que aún no existen, el promedio esperado el próximo periodo y la probabilidad de deserción del modelo del estudio UDES.</p>
      <p><b>Para qué sirve.</b> Dimensionar el acompañamiento de un grupo. <b>No sirve</b> para decidir sobre una persona: es una estimación de grupo, no predice a nadie.</p>
    </div>
    <div>${ficha([
      ["Objetivo", "Anticipar cuántos estudiantes necesitarán acompañamiento y en qué cursos."],
      ["Responsable", "Decano y director de programa."],
      ["Numeral ISO", "9.1.3 Análisis y evaluación · 10.3 Mejora continua."],
      ["Registro", "Priorización de cursos y cohortes."],
    ])}</div>
  </div>
  <h2 class="h2">Las seis secciones de la barra superior</h2>
  ${tbl(
    ["Sección", "Ruta", "Responde"],
    [
      ["Inicio", rt("/alertas"), "Elegir facultad, programa y semestre."],
      ["Panorama", rt("/alertas/panorama"), "¿Cómo está la cohorte hoy y qué se espera?"],
      ["Mapa de riesgo", rt("/alertas/riesgo"), "¿Dónde se reprueba, por campus, facultad, programa y curso?"],
      ["Estudiantes", rt("/alertas/estudiantes"), "¿Quién necesita seguimiento? Lista por código."],
      ["Cursos críticos", rt("/alertas/cursos"), "¿Qué materias reprueban mucho y cómo evolucionan?"],
      ["Cómo se calcula", rt("/alertas/metodo"), "Reglas y límites, escritos para leer."],
    ],
    "fix"
  )}
  <div style="margin-top:12px">${ticket("Fuente y corte", "Los mismos datos del monitor (UDES Warehouse), más el historial por estudiante y periodo. Lo agregado con menos de 5 matrículas no se muestra. No se guardan nombres, documento ni contacto.")}</div>`,
});

addPage({
  ch: 4,
  title: "Leer el panorama de una cohorte",
  body: `<p class="lead">Elija facultad, programa y semestre una sola vez; el alcance viaja en la dirección y se conserva al cambiar de sección.</p>
  <div class="cols n" style="margin-top:10px">
    ${shot({
      f: "al-panorama-real",
      url: "/alertas/panorama",
      alt: "Panorama del portal con el titular de estudiantes que requieren seguimiento",
      miss: { t: "Portal de Alertas · Panorama · titular y cohorte por periodo (usuario con programas asignados)", h: 240 },
    })}
    <div>${steps([
      ["Entre a Inicio", `Elija ${q("Facultad")}, ${q("Programa")} y ${q("Semestre")} (1 a 10 o «Todos los semestres»). Verifique sede y periodo.`],
      ["Pulse Ver panorama", "Abre el titular: «N de M estudiantes requieren seguimiento»."],
      ["Lea el rango esperado", "Estima cuántos cerrarían con promedio menor de 3,2 y entrarían en prueba académica."],
      ["Pruebe un escenario", `Mueva ${q("Cambio del promedio")} de -0,5 a +0,5 para ver qué pasaría con un grupo.`],
    ])}</div>
  </div>
  <h2 class="h2">Cómo leer lo estimado</h2>
  ${list([
    `Lo estimado se pinta con <b>trama</b> y la palabra «estimado»; se reemplaza solo cuando llegan las notas reales.`,
    `Si el periodo aún no tiene P3 ni nota final, el nivel de cada estudiante es el del último corte con notas.`,
    `Con un solo periodo de historia, la proyección se apoya en una sola nota y su banda es amplia.`,
    `Con promedio menor de 3,3 el modelo del estudio UDES encuentra una probabilidad de desertar 16,7 veces mayor; úselo para dimensionar, no para decidir sobre una persona.`,
  ])}
  <div style="margin-top:12px">${pilo("Las palabras subrayadas (NE, ED, RS, prueba académica, banda del 80 %) abren un recuadro explicativo al pulsarlas. Se cierra con Esc.")}</div>
  <p class="cap" style="margin-top:10px">Para ver solo lo real, en ${q("Mapa de riesgo")} apague el interruptor ${q("Estimar cortes sin notas")}.</p>`,
});

addPage({
  ch: 4,
  title: "Estudiantes, cursos críticos y método",
  body: `<p class="lead">Tres pantallas para pasar del panorama a la acción: a quién acompañar, qué cursos reforzar y cómo se calcula cada número.</p>
  <h2 class="h2" style="margin-top:12px">Estudiantes</h2>
  <div class="cols n">
    ${shot({
      f: "al-estudiantes-real",
      url: "/alertas/estudiantes",
      alt: "Lista de estudiantes por código con filtros por nivel",
      miss: { t: "Portal de Alertas · Estudiantes · lista por código y filtros", h: 170 },
    })}
    <div>${steps([
      ["Filtre", `${q("Requieren seguimiento")}, ${q("En desarrollo")} o ${q("Nivel esperado")}.`],
      ["Abra la fila", "Muestra trayectoria por periodos y lo que se espera."],
      ["Anote el código", "El contacto se hace fuera del portal."],
    ])}</div>
  </div>
  <h2 class="h2">Cursos críticos</h2>
  <p>Un curso requiere seguimiento cuando reprueba 30 % o más. Elija el corte y revise ${q("Reprobación por curso")}, el mapa de calor por periodo y ${q("Evolución de los cursos críticos")}. Los cursos del semestre siguiente muestran qué se avecina: conviene reforzar antes de que lleguen.</p>
  <h2 class="h2">Cómo se calcula</h2>
  ${tbl(
    ["Concepto", "Regla"],
    [
      ["Nivel NE · ED · RS", "El mismo del Monitor de alertas."],
      ["Nota que falta", "Se estima con las notas previas del periodo y el promedio del periodo anterior; la banda del 80 % se abre con cada corte estimado."],
      ["Deserción", "Regresión logística del estudio UDES (Pérez et al., 2023): facultad, promedio, edad y origen."],
      ["Reprobar", "Menos de 3,0 (Medicina, menos de 3,5). Alta desde 30 %; crítica desde 50 %."],
    ],
    "fix"
  )}
  <div style="margin-top:12px">${ticket("Tenga en cuenta", "«Es una estimación de grupo. No identifica causas, no predice a una persona y no reemplaza la conversación con el estudiante.» Texto de la sección Cómo se calcula.")}</div>`,
});

// =============== CAP 5 · UDRIVE =============================================
addPage({
  ch: 5,
  open: true,
  title: "UDRIVE",
  routeNote: "Intranet · Gestor de archivos y editor",
  body: `<p class="lead">UDRIVE guarda carpetas, archivos subidos, tablas editables, gráficas e informes por bloques. Los equipos trabajan en <b>unidades de trabajo</b>: espacios con nombre, personas con papel y cuota de almacenamiento.</p>
  <div class="cols" style="margin-top:12px">
    <div class="stack">
      <p><b>Cómo funciona.</b> Cada persona tiene «Mis archivos». Fuera de las unidades, quien crea una carpeta es su dueño y la comparte por correo. Dentro de una unidad manda el papel de cada persona.</p>
      <p>Los informes llevan versiones, estados (Borrador, En revisión, Aprobado) y turnos de edición para que nadie pise el trabajo de otro.</p>
    </div>
    <div>${ficha([
      ["Objetivo", "Conservar y controlar la información que alimenta los informes."],
      ["Responsable", "Quien administra la unidad de trabajo; cada persona, sus archivos."],
      ["Numeral ISO", "7.5.2 Creación y actualización · 7.5.3 Control de la información documentada."],
      ["Registro", "Versión aprobada y congelada de cada informe."],
    ])}</div>
  </div>
  <h2 class="h2">Qué puede hacer cada papel en una unidad</h2>
  ${tbl(
    ["Papel", "Puede"],
    [
      ["Solo ver", "Abrir, descargar y comentar."],
      ["Editar", "Lo anterior y cambiar archivos que ya existen."],
      ["Crear", "Lo anterior, subir archivos, crear carpetas y mandar a la papelera lo que creó."],
      ["Administra", "Lo anterior, borrar para siempre, vaciar la papelera, gestionar personas y archivar."],
    ],
    "fix"
  )}
  <div style="margin-top:10px">${ticket("Antes de empezar", "Si al abrir UDRIVE ve «sin permiso», su rol no tiene la pantalla habilitada. Pida a Planeación o a la administración que se la active.")}</div>`,
});

addPage({
  ch: 5,
  title: "Crear carpetas, subir archivos y editar tablas",
  body: `<p class="lead">Todo se crea desde el botón ${q("Nuevo")}. El guardado de tablas e informes es automático.</p>
  <div class="cols" style="margin-top:6px">
    <div>
      <div class="h3" style="margin-bottom:6px">Crear una carpeta</div>
      ${steps([
        ["Pulse Nuevo", `${q("Nuevo")} → ${q("Nueva carpeta")}, en «Mis archivos» o en «Archivos de la unidad».`],
        ["Escriba el nombre", "Si ya existe: «Ya hay una carpeta con ese nombre aquí»."],
        ["Confirme", "Aparece «Carpeta creada»."],
      ])}
      <div class="h3" style="margin:14px 0 6px">Subir un archivo</div>
      ${steps([
        ["Abra la carpeta destino", "O arrastre archivos a la zona «Suelte aquí archivos de cualquier tipo»."],
        ["Pulse Subir archivos", `Hasta 100 MB cada uno. Las imágenes se reducen a 2000 px.`],
        ["Mire la ventana Subidas", "Dice «Preparando…», «Subiendo» y «Listo»."],
      ])}
    </div>
    <div>
      <div class="h3" style="margin-bottom:6px">Crear y editar una tabla</div>
      ${steps([
        ["Cree la tabla", `${q("Nuevo")} → ${q("Nueva tabla")}, o ${q("Tabla desde Excel o CSV")}.`],
        ["Cargue los datos", `${q("Pegar desde Excel")} o ${q("Importar Excel o CSV")} (agregar o reemplazar).`],
        ["Defina las columnas", `Los paneles ${q("Columnas")} y ${q("Cómo se ve en el documento")} controlan el formato.`],
        ["Corrija los rojos", "Las celdas en rojo son valores por revisar."],
        ["Márquela lista", `${q("Marcar como lista")}. Pide corregir primero los rojos.`],
      ])}
    </div>
  </div>
  <h2 class="h2">Si algo falla al subir</h2>
  ${tbl(
    ["Mensaje", "Qué hacer"],
    [
      ["«x» pesa y; el máximo es 100 MB", "Comprima el archivo o divídalo."],
      ["«x» está vacío", "Revise el archivo original."],
      ["Su sesión no está lista", "Recargue la página e intente de nuevo."],
      ["La unidad llegó a su cuota", "Quien administra puede pedir más espacio."],
    ],
    "fix"
  )}
  <div style="margin-top:10px">${ticket("Tenga en cuenta", `El botón ${q("A la papelera")} guarda 30 días. Solo quien administra o es propietario puede usar ${q("Borrar para siempre")}, y no se puede deshacer.`)}</div>`,
});

addPage({
  ch: 5,
  title: "Armar un informe y llevarlo a aprobado",
  body: `<p class="lead">El informe se edita por bloques, con cifras vivas, gráficas y citas. Al aprobarlo, las cifras se congelan y queda una versión que sirve de registro.</p>
  <div class="cols n" style="margin-top:6px">
    ${shot({
      f: "ud-informe",
      url: "/admin/udrive/documento/…",
      alt: "Editor de informes por bloques con barra de formato, panel de documento y estado",
      miss: { t: "UDRIVE · editor de informe por bloques", h: 260 },
    })}
    <div>${steps([
      ["Cree el informe", `${q("Nuevo")} → ${q("Nuevo informe")}. Elija plantilla, nombre, estilo y carpeta.`],
      ["Escriba por bloques", `Use ${q("Estilo del bloque")} para títulos y listas, y ${q("Insertar cifra viva")} para datos.`],
      ["Inserte tablas y gráficas", `Desde el bloque o con ${q("Usar en un informe")} en la tabla.`],
      ["Pida revisión", `Cambie el estado a ${q("En revisión")}.`],
      ["Apruebe", `${q("Aprobar…")} → ${q("Aprobar y congelar las cifras")}, con una nota opcional.`],
    ])}</div>
  </div>
  <h2 class="h2">El turno de edición</h2>
  <p>Un informe se edita por turnos de 3 minutos que se renuevan solos. Si otra persona lo tiene, el documento se abre en solo lectura. Pulse ${q("Pedir el turno")} y avise a quien lo tiene; quien lo tiene puede ${q("Ceder el turno")}. Si deja de editar, el turno se libera en unos minutos.</p>
  <h2 class="h2">Versiones y aprobación</h2>
  ${tbl(
    ["Acción", "Qué pasa"],
    [
      ["Guardar versión", "Guarda una copia con nota, por ejemplo «Antes de enviar a revisión». También se guarda al aprobar o restaurar."],
      ["Ver con los datos de entonces", "Abre la versión con las tablas y gráficas de ese momento."],
      ["Restaurar", "Vuelve a esa versión y guarda una nueva."],
      ["Aprobar y congelar", "El informe queda en solo lectura, las cifras vivas toman el valor de hoy y sale la marca de borrador del PDF."],
    ],
    "fix"
  )}
  <p class="cap" style="margin-top:8px">El PDF sale del diálogo «Guardar como PDF» del navegador. Antes, una revisión previa avisa figuras sin título, citas sin definir o cifras vivas que cambiaron.</p>`,
});

addPage({
  ch: 5,
  title: "Unidades de trabajo, personas y compartir",
  body: `<p class="lead">Una unidad de trabajo es el espacio de un equipo. Quien la crea queda con papel ${q("Administra")}. No necesita aprobación.</p>
  <div class="cols" style="margin-top:6px">
    <div>
      <div class="h3" style="margin-bottom:6px">Crear una unidad</div>
      ${steps([
        ["Abra Unidades", `${rt("/admin/udrive/unidades")} → ${q("Nueva unidad")}.`],
        ["Datos", "Nombre (3 a 120 caracteres), descripción corta y carpetas iniciales."],
        ["Identidad", "Monograma, color y icono. El color debe contrastar 4,5:1 con blanco."],
        ["Personas", "Quién entra y con qué papel."],
        ["Revise y cree", "Aparece «Abrir la unidad»."],
      ])}
    </div>
    <div>
      <div class="h3" style="margin-bottom:6px">Gestionar personas (solo Administra)</div>
      ${steps([
        ["Entre a Personas", `Dentro de la unidad, sección ${q("Personas")}.`],
        ["Busque", `${q("Buscar a una persona")} por nombre o correo institucional.`],
        ["Elija el papel", `${q("Papel al añadir")}: Solo ver, Editar, Crear o Administra.`],
        ["Añada en bloque", `${q("Añadir varias personas a la vez")}: una unidad de la estructura o pegar correos.`],
      ])}
    </div>
  </div>
  <h2 class="h2">Compartir fuera de una unidad</h2>
  ${steps([
    ["Seleccione y pulse Compartir", "Solo el propietario ve el botón. Dentro de unidades no existe."],
    ["Escriba el correo", "La persona debe tener cuenta en la intranet."],
    ["Elija el permiso", `${q("Solo puede ver")} o ${q("Puede editar")}, y pulse ${q("Compartir")}.`],
  ])}
  <div class="cols" style="margin-top:12px">
    <div>${ticket("Personas externas", "Un correo fuera de udes.edu.co exige fecha de vencimiento (máximo 730 días) y no puede administrar.")}</div>
    <div>${ticket("Espacio", "Cada unidad tiene 5 GB. Avisa al 80 % y al 100 % no deja subir. Quien administra usa «Pedir más espacio».")}</div>
  </div>
  <div style="margin-top:12px">${pilo("La unidad necesita al menos una persona con papel Administra. Antes de cambiar el papel de la única que administra, nombre a otra.")}</div>`,
});

// =============== CAP 6 · REGISTROS Y MEJORA =================================
addPage({
  ch: 6,
  title: "Registros que debe dejar, por rol",
  body: `<p class="lead">Un sistema de gestión de la calidad se audita con registros. Esta lista dice qué debe quedar hecho en Aluna Planeación y quién responde por cada cosa.</p>
  <div style="margin-top:10px">${tbl(
    ["Quién", "Qué debe dejar", "Dónde", "Cuándo"],
    [
      ["Director de programa", "Indicadores elegidos; línea base, metas y cifra por año con enlace de evidencia.", "Indicadores de Impacto · Captura", "Cada corte anual"],
      ["Decano", "Informe de la decanatura enviado, con evidencia; seguimiento de alertas de su facultad.", "Informes · Monitor de alertas", "Fecha límite del ciclo; cada corte"],
      ["Vicerrector", "Fichas publicadas, cifras institucionales cargadas, informe de la vicerrectoría.", "Impacto · Informes", "Cada año"],
      ["Planeación", "Ciclo abierto, informes aprobados o devueltos con nota, programas asignados a unidades.", "Informes · Monitor", "Todo el ciclo"],
    ],
    "fix"
  )}</div>
  <h2 class="h2">Lista de verificación antes de dar un registro por bueno</h2>
  <div class="cols">
    <div>${list(
      [
        "Cada cifra tiene fuente, corte y enlace de evidencia.",
        "Lo no reportado dice «sin reportar», no cero.",
        "Las metas están escritas como las fijó el programa.",
        "Todas las secciones del informe están en «Lista».",
      ],
      "chk"
    )}</div>
    <div>${list(
      [
        "Los enlaces de Drive abren en una ventana privada.",
        "La evidencia explica qué demuestra cada anexo.",
        "El informe aprobado quedó en UDRIVE con versión.",
        "Los códigos de estudiantes no salen del seguimiento académico.",
      ],
      "chk"
    )}</div>
  </div>
  <h2 class="h2">Si algo no cumple: no conformidad y mejora</h2>
  <p>Cuando una cifra no llega a su meta, un curso reprueba por encima del 30 % o una evidencia no sirve, lo que corresponde es dejarlo escrito y actuar. Aluna Planeación ya tiene dónde: <b>Puntos críticos y acciones de mejora</b> en el informe (acción y fecha), la columna de <b>observación</b> en la captura de Impacto y las <b>notas de revisión</b> de Planeación.</p>
  <div style="margin-top:12px">${ticket("Tenga en cuenta", "La unidad de Calidad define cómo se abre y se cierra una acción correctiva formal (numeral 10.2). Este manual solo señala dónde queda el registro dentro de la herramienta.")}</div>`,
});

addPage({
  ch: 6,
  title: "Preguntas frecuentes y glosario",
  body: `<h2 class="h2" style="margin-top:0">Preguntas frecuentes</h2>
  ${tbl(
    ["Pregunta", "Respuesta"],
    [
      ["No veo un módulo en el menú.", "El menú se arma con su unidad y su rol. Pida a Planeación que lo ubique en la estructura institucional."],
      ["El monitor dice que no tengo programas asignados.", "Planeación debe asociar su unidad con los programas. Luego pulse «Reintentar»."],
      ["¿Puedo corregir un informe ya enviado?", "No. Planeación lo devuelve con una nota; usted corrige y reenvía."],
      ["¿Qué pasa si una cifra de UDES en Cifras cambia?", "Mientras el informe es borrador, el informe avisa «cambió de X a Y» y usted la acepta. Enviado, ya no cambia."],
      ["¿Puedo borrar una cifra de Impacto?", "Quitar un indicador de su lista no borra lo reportado. Para cambiar una cifra, ábrala y edítela."],
      ["¿Una alerta se cierra?", "No. El monitor es de lectura. Se atiende hablando con el estudiante o el docente."],
    ],
    "fix"
  )}
  <h2 class="h2">Glosario</h2>
  ${tbl(
    ["Término", "Significado"],
    [
      ["Ficha", "Definición de un indicador institucional: qué mide, cómo, metas y pilares."],
      ["Eslabón", "Insumos, procesos, productos o impacto real: el lugar del indicador en la cadena de valor."],
      ["Corte", "Momento del periodo con notas: P1, P2, P3 o nota final."],
      ["NE · ED · RS", "Nivel Esperado, En Desarrollo y Requiere Seguimiento."],
      ["Foto de cifras", "Copia de las cifras al enviar un informe; ya no cambia."],
      ["Unidad de trabajo", "Espacio de UDRIVE con personas, papeles y cuota."],
      ["Gestor", "Jefe de la unidad: diligencia y envía el informe."],
    ],
    "fix"
  )}
  <div style="margin-top:12px">${ticket("Contacto", "Soporte de Aluna Planeación: [CORREO DE CONTACTO]. Mesa de ayuda: [EXTENSIÓN]. Los datos de contacto los confirma Planeación antes de publicar.")}</div>`,
});

// =============== CONTRAPORTADA ==============================================
addPage({
  cover: true,
  ch: 0,
  html: (iso) => `<section class="pg" style="background:var(--navy-deep)">
    ${iso}
    <div style="position:absolute;left:0;right:0;top:124px;bottom:0;background:var(--navy-deep)"></div>
    <div style="position:absolute;left:56px;right:56px;top:200px;color:#fff">
      <div style="font-family:var(--f-display);font-weight:700;font-size:56px;line-height:1.02;letter-spacing:-0.03em;max-width:520px">¿Le queda una duda?</div>
      <p style="margin-top:20px;font-size:17px;line-height:1.55;color:var(--on-navy);max-width:440px">Pregúntele a Mr. Pilo en cualquier pantalla con el botón <b style="color:#fff">?</b>, o escriba a la Oficina de Planeación Institucional.</p>
      <div style="margin-top:30px;display:grid;gap:10px;max-width:460px">
        <div style="border-top:1px solid rgba(195,213,242,0.25);padding-top:10px;display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--on-navy)">Portal</span><b>${PORTAL}</b></div>
        <div style="border-top:1px solid rgba(195,213,242,0.25);padding-top:10px;display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--on-navy)">Correo</span><b>[CORREO DE CONTACTO]</b></div>
        <div style="border-top:1px solid rgba(195,213,242,0.25);padding-top:10px;display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--on-navy)">Ruta del portal</span><span>${fls("/pregunta", "", 15)}</span></div>
      </div>
    </div>
    <img src="../manual/assets/feliz-320.webp" alt="Mr. Pilo sonriendo" style="position:absolute;right:70px;top:230px;width:230px;height:auto">
    <div style="position:absolute;left:56px;right:56px;bottom:40px;display:flex;justify-content:space-between;align-items:center;color:var(--on-navy);font-size:12.5px;font-weight:600">
      <span style="display:flex;align-items:center;gap:12px">${fls("edición 01", "sg", 18)}<span>${DOC.edicion}</span></span>
      <span>Oficina de Planeación Institucional · Universidad de Santander</span>
    </div>
  </section>`,
});

// ---- Ensamblado -----------------------------------------------------------
const total = pages.length;
pages.forEach((p, i) => { if (p.tocStart) START[0] = i + 1; if (p.ch > 0 && !(p.ch in START)) START[p.ch] = i + 1; });
pages.forEach((p) => { if (typeof p.body === "function") p.body = p.body(); });
const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${DOC.titulo}</title>
<meta name="viewport" content="width=816">
<link rel="stylesheet" href="../manual/fonts/local.css">
<link rel="stylesheet" href="manual-iso.css">
</head><body>
${pages.map((p, i) => renderPage(p, i, total)).join("\n")}
</body></html>`;
fs.writeFileSync(path.join(here, "manual-aluna-planeacion.html"), html);
console.log(`páginas: ${total}`);
if (missing.length) {
  console.log("Capturas pendientes:");
  missing.forEach((m) => console.log(" -", m));
}

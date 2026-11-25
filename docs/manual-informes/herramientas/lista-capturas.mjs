// Lista de capturas del manual de Informes Institucionales.
// Cada entrada: n (nombre), r (ruta), papel (admin | gestor | contribuyente | consulta; «papel:unidad» cambia de unidad),
// w/h (ancho y alto de la ventana), desde (texto de un título donde empieza el recorte), alto/maxH (alto del recorte),
// raiz (selector CSS del recorte), fijo (no estira la ventana: cajones laterales), fn (acciones previas), marks ([n, locator, dx, dy]).
import fs from "node:fs";
const TAB = "/admin/informes-gestion";
const ESPERA = (p, ms = 1200) => p.waitForTimeout(ms);
const CARD = (t) => `.inf-card:has-text("${t}")`;
const abrirUnidadAdmin = async (p, valor = "u-ing|") => { await p.locator("select.inf-in").first().selectOption(valor); await ESPERA(p, 2500); };
const vistaDesdeTablero = async (p) => { await p.locator(`a:has-text("Vista del informe")`).nth(1).click(); await ESPERA(p, 3000); };

/** Baja el libro de Excel desde el cajón y lo vuelve a cargar en «Importar». */
const libroImportar = async (p) => {
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }), p.getByRole("button", { name: /^Descargar/ }).first().click()]);
  const ruta = "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/libro-demo.xlsx";
  await dl.saveAs(ruta);
  await p.getByRole("tab", { name: /Importar/ }).click(); await ESPERA(p, 600);
  await p.locator('input[type=file][accept=".xlsx"]').setInputFiles(ruta); await ESPERA(p, 3000);
};
const abrirLibro = (extra, admin = false) => async (p) => { if (admin) await abrirUnidadAdmin(p); await p.getByRole("button", { name: "Libro de Excel" }).first().click(); await ESPERA(p); if (extra) await extra(p); };
const irSeccion = (n) => async (p) => { await p.locator(".inf-secs button, nav button", { hasText: n }).first().click(); await ESPERA(p); };


/* ---------- Compilador de informes con Pilo (ZIP ficticio de libros de los equipos: excel/09-libros-compilador) ---------- */
const ZIP_COM = new URL("../excel/09-libros-compilador/libros-de-los-equipos.zip", import.meta.url).pathname;
const abrirCompilador = async (p) => { await p.getByRole("button", { name: /Compilar informe de colaboradores/ }).click(); await ESPERA(p, 1500); };
const comRecibir = async (p) => { await abrirCompilador(p); await p.setInputFiles("input[type=file]", [ZIP_COM]); await ESPERA(p, 5500); };
const comSiguiente = async (p) => { await p.locator(".cp-foot .is-pri").click(); await ESPERA(p, 1300); };
const comOrganizar = async (p) => { await comRecibir(p); await comSiguiente(p); };
/** Abre el indicador en conflicto («Retención de primer semestre»: tres equipos, dos valores) para ver cómo lo escribió cada equipo. */
const comAbrirConflicto = async (p) => { await p.locator(".cp-item.is-bad .cp-exp").first().click(); await ESPERA(p, 600); };
const comResolver = async (p) => { await comOrganizar(p); await comAbrirConflicto(p); await p.getByRole("button", { name: "Usar el valor de la fuente primaria" }).first().click(); await ESPERA(p, 600); };
const comRedactar = async (p) => { await comResolver(p); await comSiguiente(p); await p.getByRole("button", { name: "Redactar todas las secciones" }).click(); await ESPERA(p, 6000); };
const comAprobar = async (p) => { await comRedactar(p); await comSiguiente(p); };

export const LISTA = [
  /* ================= ADMINISTRADOR ================= */
  { n: "adm-tablero", r: TAB, desde: "Entrega por unidad", maxH: 900, marks: [[1, "text=avance general", 6, -6], [2, "label:has-text('Buscar unidad')", -10, 0], [3, "button:has-text('Abrir los')", -10, -6], [4, "a:has-text('Responsables'), button:has-text('Responsables') >> nth=0", -12, 0], [5, "text=Revisar >> nth=0", -12, 0]] },
  { n: "adm-ciclo", r: TAB, alto: 480, marks: [[1, "select >> nth=0", -12, -4], [2, "label:has-text('Fecha límite')", -12, 0], [3, "label:has-text('Estado') >> nth=0", -12, 0], [4, "button:has-text('Guardar el ciclo')", -12, -4], [5, "button:has-text('Preparar el ciclo siguiente')", -12, -4]] },
  { n: "adm-ciclo-limites", r: TAB, desde: "Los datos libres", maxH: 330, marks: [[1, "text=Datos propios por sección", -12, 0], [2, "text=Exigir fuente en cada dato propio", -12, 0], [3, "text=Exigir un pilar del PDI vinculado", -12, 0]] },
  { n: "adm-requisitos", r: TAB, w: 1500, desde: "Qué datos debe justificar", maxH: 800, marks: [[1, CARD("Qué datos debe justificar") + " button:has-text('A · Decanatura')", -6, -6], [2, CARD("Qué datos debe justificar") + " >> text=sugeridos", -12, 0], [3, CARD("Qué datos debe justificar") + " button:has-text('Justificar') >> nth=0", -12, -6], [4, CARD("Qué datos debe justificar") + " button:has-text('No pedir') >> nth=0", -12, -6]] },
  { n: "adm-requeridos", r: TAB, w: 1500, desde: "Los datos que pide", maxH: 1250, marks: [[1, "button:has-text('+ Añadir dato')", -12, -6], [2, "button:has-text('Guardar los datos')", -12, -6], [3, "button:has-text('Copiar de la plantilla B')", -12, -6], [4, "button:has-text('Bajar Excel')", -12, -6]] },
  { n: "adm-estructura-ciclo", r: TAB, w: 1500, desde: "La estructura de cada informe", maxH: 1450, marks: [[1, "text=Activa >> nth=0", -12, 0], [2, "text=La unidad edita >> nth=0", -12, 0], [3, "button:has-text('Agregar una sección libre')", -12, -6], [4, "button:has-text('Restablecer a la plantilla')", -12, -6]] },
  { n: "adm-criterios", r: TAB, w: 1500, desde: "Criterios de Resultados", maxH: 800, marks: [[1, "text=Sugeridos por las unidades", -12, 0], [2, "button:has-text('Aprobar') >> nth=0", -12, -6], [3, "text=Aprobados (2)", -12, 0], [4, "button:has-text('Crear criterio')", -12, -6]] },
  { n: "adm-responsables", r: TAB, fijo: true, h: 1000, raiz: ".inf-resp", fn: async (p) => { await p.getByRole("button", { name: "Responsables" }).first().click(); await ESPERA(p); }, marks: [[1, ".inf-resp select >> nth=0", -12, -4], [2, ".inf-resp button:has-text('Quitar') >> nth=0", -12, -4], [3, ".inf-resp input[type=search], .inf-resp input[placeholder*='letras']", -12, -4], [4, "button:has-text('Restablecer responsables')", -12, -4]] },
  { n: "adm-estructuras", r: TAB + "/estructuras", marks: [[1, "text=Plantilla A >> nth=0", -12, 0], [2, "text=Informe de oficina de apoyo >> nth=0", -12, 0], [3, "button:has-text('Nueva estructura')", -12, -4], [4, "button:has-text('Copiar como estructura nueva')", -12, -4], [5, "text=¿Quién puede usarla?", -12, 0]] },
  { n: "adm-estructura-edit", r: TAB + "/estructuras", maxH: 1400, fn: async (p) => { await p.getByText("Informe de centro de investigación").first().click(); await ESPERA(p); }, marks: [[1, "label:has-text('Nombre') input", -12, -4], [2, "text=Secciones del informe", -12, 0], [3, "button:has-text('Guardar')", -12, -4]] },
  { n: "adm-revision", r: TAB + "/revision", maxH: 700, marks: [[1, ".rk-seg button >> nth=0", -6, -6], [2, ".inf-lista li >> nth=0", -12, 0], [3, "text=Elija un informe de la lista", -12, 0]] },
  { n: "adm-revision-uno", r: TAB + "/revision", maxH: 1000, fn: async (p) => { await p.locator(".inf-lista button", { hasText: "Ciencias de la Salud" }).click(); await ESPERA(p, 1500); }, marks: [[1, ".inf-lista button[aria-current=true]", -8, -4], [2, "text=Ver el informe como saldrá en papel", -12, 0], [3, "input[placeholder^='Nota para esta sección'] >> nth=0", -12, -4]] },
  { n: "adm-revision-decidir", r: TAB + "/revision", desde: "Nota general para la unidad", arriba: 90, maxH: 330, fn: async (p) => { await p.locator(".inf-lista button", { hasText: "Ciencias de la Salud" }).click(); await ESPERA(p, 1500); await p.locator("textarea[placeholder^='Qué debe corregir']").fill("Falta explicar por qué bajó la retención de primer semestre y qué se hará."); await ESPERA(p, 400); }, marks: [[1, "text=Nota general para la unidad", -12, 0], [2, "button:has-text('Aprobar')", -12, -6], [3, "button:has-text('Devolver con nota')", -12, -6]] },
  { n: "adm-capacitacion", r: TAB + "/capacitacion", maxH: 1100, marks: [[1, "text=Suelte los informes o haga clic", -12, 0], [2, "text=Lo que Pilo aprendió", -12, 0]] },
  { n: "adm-criterios-pantalla", r: TAB, w: 1500, desde: "Criterios de Resultados", maxH: 800, omitir: true },
  { n: "adm-libro-exportar", r: TAB + "/mi-informe", fijo: true, h: 1300, raiz: ".inf-resp", fn: abrirLibro(null, true), marks: [[1, ".inf-resp [role=tab] >> nth=0", -4, -4], [2, "text=Un libro por equipo", -12, 0], [3, "text=Bloquear las celdas grises", -12, 0], [4, ".inf-resp button.inf-btn--pri", -12, -4]] },
  { n: "adm-libro-importar", r: TAB + "/mi-informe", fijo: true, h: 1300, raiz: ".inf-resp", fn: abrirLibro(libroImportar, true), marks: [[1, ".inf-resp [role=tab] >> nth=1", -4, -4], [2, ".inf-lx-cab", -4, -4], [3, "text=Qué hoja va a qué sección", -12, 0], [4, "button:has-text('Cargar otro')", -12, -4]] },
  { n: "adm-vista", r: TAB, maxH: 1100, fn: vistaDesdeTablero, marks: [[1, ".vi-seg label:has-text('Carta')", -6, -6], [2, ".vi-seg label:has-text('A4')", -6, -6], [3, "button:has-text('Personalizar portada')", -6, -6], [4, "button:has-text('Descargar PDF')", -6, -6]] },
  { papel: "gestor", n: "adm-portada", r: TAB + "/vista", maxH: 1900, fn: async (p) => { await p.getByRole("button", { name: "Personalizar portada" }).click(); await ESPERA(p, 1800); }, marks: [[1, "text=Composición", -12, 0], [2, "text=Título >> nth=0", -12, 0], [3, "text=Color de acento", -12, 0], [4, "text=Así saldrá la portada", -12, 0]] },

  /* ================= GESTOR ================= */
  { papel: "gestor", n: "ges-mi-informe", r: TAB + "/mi-informe", maxH: 1000, marks: [[1, "text=7 de 10 listas", -12, 0], [2, "text=Libro de Excel >> nth=0", -12, 0], [3, "text=Resumen ejecutivo >> nth=0", -12, 0], [4, "button:has-text('Enviar')", -12, -4]] },
  { papel: "gestor", n: "ges-seccion-narrativa", r: TAB + "/mi-informe", desde: "Sección 1 de 10", maxH: 900, marks: [[1, "select >> nth=0", -12, -4], [2, "textarea", -12, -4], [3, "button:has-text('Pilo redacta un borrador')", -12, -4], [4, "text=Así se leerá", -12, 0]] },
  { papel: "gestor", n: "ges-cifras", r: TAB + "/mi-informe?s=4", fn: async (p) => { await p.locator("summary", { hasText: "Conectar indicadores" }).click(); await ESPERA(p, 1200); await p.locator("details.inf-sug").getByText("Detalle", { exact: true }).first().click(); await ESPERA(p, 1200); }, desde: "Conectar indicadores", arriba: 20, maxH: 1100, marks: [[1, "summary:has-text('Conectar indicadores')", -14, 0], [2, "text=Matrícula total >> nth=0", -14, 0], [3, "text=/Cambió desde que lo revisó/", -14, 0], [4, "text=Cambiar fuente >> nth=0", -14, 0], [5, "input[value^='Subió']", -14, -4]] },
  { papel: "gestor", n: "ges-dimensiones", r: TAB + "/mi-informe?s=4", maxH: 1900, marks: [[1, "text=¿A qué criterios reporta su oficina?", -14, 0], [2, "text=Lo que pide Planeación >> nth=0", -14, 0], [3, "text=Fuente propia de la unidad >> nth=0", -14, 0], [4, "text=Justificación (obligatoria) >> nth=0", -14, 0], [5, "button:has-text('Importar Excel')", -14, 0]] },
  { papel: "gestor", n: "ges-metas", r: TAB + "/mi-informe?s=3", maxH: 1500, marks: [[1, "button:has-text('Importar JSON o PDF')", -14, 0], [2, "button:has-text('Escribir el plan a mano')", -14, 0], [3, "button:has-text('Añadir meta')", -14, 0], [4, "button:has-text('Importar Excel')", -14, 0]] },
  { papel: "gestor", n: "ges-alineacion", r: TAB + "/mi-informe?s=2", maxH: 1500, marks: [[1, "text=2 de 4 pilares con aporte", -14, 0], [2, "text=Quitar este aporte", -14, 0], [3, "text=Resultados y acciones conectados con este pilar", -14, 0], [4, "button:has-text('Pilo: reescribir')", -14, 0]] },
  { papel: "gestor", n: "ges-anexos", r: TAB + "/mi-informe?s=7", maxH: 1500, marks: [[1, "text=Suelte archivos o haga clic", -14, 0], [2, "button:has-text('Añadir enlace')", -14, 0], [3, "button:has-text('Editar') >> nth=0", -14, 0], [4, "button:has-text('Quitar') >> nth=0", -14, 0]] },
  { papel: "gestor", n: "ges-enviar", r: TAB + "/mi-informe?s=8", maxH: 1500, marks: [[1, "button:has-text('Enviar')", -14, 0], [2, "text=/Se habilita cuando las 10/", -14, 0], [3, "text=/Faltan 25 palabras/", -14, 0], [4, "text=7 de 10 listas", -14, 0]] },
  { papel: "gestor-listo", n: "ges-enviar-listo", r: TAB + "/mi-informe?s=8", maxH: 1000, marks: [[1, "button:has-text('Enviar')", -14, 0], [2, "text=/10 de 10 listas/", -14, 0]] },
  { papel: "gestor:u-sal", n: "ges-enviado", r: TAB + "/mi-informe?s=4", maxH: 1400, marks: [[1, "text=Enviado >> nth=0", -14, 0], [2, "text=/quedaron congeladas al enviar/", -14, 0], [3, "text=Vista del informe en papel", -14, 0]] },
  { papel: "gestor:u-eco", n: "ges-devuelto", r: TAB + "/mi-informe", maxH: 1300, marks: [[1, "text=Planeación lo devolvió", -14, 0], [2, "text=/§s4/", -14, 0], [3, "text=Resumen ejecutivo >> nth=0", -14, 0], [4, "button:has-text('Enviar')", -14, 0]] },
  { papel: "gestor", n: "ges-libro", r: TAB + "/mi-informe", fijo: true, h: 1300, raiz: ".inf-resp", fn: abrirLibro(), marks: [[1, ".inf-resp [role=tab] >> nth=0", -4, -4], [2, "text=Un libro por equipo", -12, 0], [3, "text=Bloquear las celdas grises", -12, 0], [4, ".inf-resp [role=tab] >> nth=1", -4, -4]] },
  { papel: "gestor", n: "ges-guia-pilo", r: TAB + "/mi-informe", fijo: true, h: 900, fn: async (p) => { await p.getByRole("button", { name: /Guía con Pilo/ }).first().click(); await ESPERA(p, 1500); }, marks: [[1, "button:has-text('Siguiente')", -6, -6], [2, "button:has-text('Escuchar')", -6, -6], [3, "text=Leer cada paso", -6, -6], [4, "button:has-text('Reportar con Pilo')", -6, -6]] },
  { papel: "gestor", n: "ges-movil", w: 390, h: 900, r: TAB + "/mi-informe", maxH: 1400, marks: [[1, "text=Libro de Excel >> nth=0", -4, 0], [2, "button:has-text('Enviar')", -4, 0]] },

  /* ================= COMPILADOR CON PILO (Gestor) ================= */
  { papel: "gestor", n: "com-boton", r: TAB + "/mi-informe", fijo: true, h: 360, w: 1180, raiz: ".inf-rail", marks: [[1, "button:has-text('Libro de Excel') >> nth=0", -12, 0], [2, "button:has-text('Compilar informe de colaboradores')", -12, 0]] },
  { papel: "gestor", n: "com-recibir", r: TAB + "/mi-informe", fijo: true, w: 1200, h: 1180, raiz: ".cp", fn: comRecibir, marks: [[1, ".cp-drop", -4, -4], [2, ".cp-zh", -4, -4], [3, ".cp-zrow >> nth=4", -4, -4], [4, ".cp-kpis", -4, -4], [5, ".cp-foot .is-pri", -8, -8]] },
  { papel: "gestor", n: "com-equipos", r: TAB + "/mi-informe", fijo: true, w: 1200, h: 1000, raiz: ".cp", fn: async (p) => { await comRecibir(p); await p.locator(".cp-col").nth(2).locator("summary").click(); await ESPERA(p, 500); await p.locator(".cp-cards").evaluate((e) => e.scrollIntoView({ block: "start" })); await ESPERA(p, 600); }, marks: [[1, ".cp-col >> nth=2 >> .cp-pl", -6, -6], [2, ".cp-col >> nth=2 >> .cp-st", -6, -6], [3, ".cp-col >> nth=2 >> .cp-adp", -6, -6], [4, ".cp-col >> nth=2 >> .cp-avisos", -6, -6], [5, ".cp-col >> nth=2 >> button:has-text('Quitar')", -8, -8]] },
  { papel: "gestor", n: "com-organizar", r: TAB + "/mi-informe", fijo: true, w: 1200, h: 1180, raiz: ".cp", fn: async (p) => { await comOrganizar(p); await comAbrirConflicto(p); }, marks: [[1, ".cp-kpis", -4, -4], [2, ".cp-matrix", -4, -4], [3, ".cp-item.is-bad", -4, -4], [4, "button:has-text('Usar el valor de la fuente primaria')", -8, -8], [5, ".cp-chips", -4, -4]] },
  { papel: "gestor", n: "com-redactar", r: TAB + "/mi-informe", fijo: true, w: 1200, h: 1100, raiz: ".cp", fn: async (p) => { await comRedactar(p); await p.locator(".cp-sbtn").first().click(); await ESPERA(p, 600); await p.locator(".cp-doc .cp-cx").first().click(); await ESPERA(p, 600); }, marks: [[1, ".cp-seg", -4, -4], [2, "button:has-text('Redactar todas las secciones')", -8, -8], [3, ".cp-sbtn >> nth=0", -4, -4], [4, ".cp-doc .cp-mark", -6, -6], [5, ".cp-doc .cp-cx >> nth=0", -8, -8], [6, ".cp-pop", -8, -8], [7, ".cp-think", -4, -4]] },
  { papel: "gestor", n: "com-aprobar", r: TAB + "/mi-informe", fijo: true, w: 1200, h: 1100, raiz: ".cp", fn: comAprobar, marks: [[1, ".cp-appr", -4, -4], [2, ".cp-modes", -4, -4], [3, ".cp-sumbar", -4, -4], [4, ".cp-sumbar .is-sig", -8, -8]] },
  { papel: "gestor", n: "com-aplicado", r: TAB + "/mi-informe", fijo: true, w: 1200, h: 800, raiz: ".cp", fn: async (p) => { await comAprobar(p); await p.getByRole("button", { name: "Aprobar e importar al informe" }).click(); await ESPERA(p, 1500); }, marks: [[1, ".cp-res", -4, -4], [2, ".cp-modal .cp-mark", -6, -6], [3, "button:has-text('Ir a Mi informe')", -8, -8]] },

  /* ================= CONTRIBUYENTE / CONSULTA ================= */
  { papel: "contribuyente", n: "con-mi-informe", r: TAB + "/mi-informe", maxH: 1000, marks: [[1, "text=su papel: Contribuyente", -14, 0], [2, "text=/Solo el Gestor de la unidad/", -14, 0], [3, "textarea", -14, -4]] },
  { papel: "consulta", n: "con-solo-lectura", r: TAB + "/mi-informe", maxH: 1000, marks: [[1, "text=su papel: Consulta", -14, 0], [2, "textarea", -14, -4], [3, "text=Libro de Excel >> nth=0", -14, 0]] },
  { papel: "contribuyente", n: "con-sin-acceso", r: TAB + "/revision", alto: 140, marks: [[1, "a:has-text('Mi informe') >> nth=0", -4, -6], [2, "a:has-text('Vista del informe') >> nth=0", -4, -6]] },

  /* ================= VISTA / EXPORTABLES ================= */
  { papel: "gestor", n: "vista-carta", r: TAB + "/vista", maxH: 1500, marks: [[1, ".vi-seg label:has-text('Carta')", -6, -6], [2, ".vi-seg label:has-text('A4')", -6, -6], [3, "button:has-text('Personalizar cierre')", -6, -6], [4, "button:has-text('Descargar PDF')", -6, -6], [5, "button:has-text('Crear presentación con Pilo')", -6, -6]] },
  { papel: "gestor", n: "vista-a4", r: TAB + "/vista", maxH: 1500, fn: async (p) => { await p.locator('.vi-seg label:has-text("A4")').first().click(); await ESPERA(p, 1500); }, marks: [[1, ".vi-seg label:has-text('A4')", -6, -6]] },
  { papel: "gestor", n: "vista-portada", r: TAB + "/vista", raiz: "section.vi-pg", marks: [[1, ".vi-eyebrow", -6, -6], [2, ".vi-un", -6, -6]] },
  { papel: "gestor", n: "vista-cierre", r: TAB + "/vista", raiz: 'section.vi-pg[aria-label*="ierre"]', marks: [[1, ".vi-pg[aria-label*=ierre] h2, .vi-pg[aria-label*=ierre] h3", -6, -6]] },
  { papel: "gestor", n: "presentacion", r: TAB + "/vista", fijo: true, h: 900, raiz: "body", fn: async (p) => { await p.getByRole("button", { name: "Presentaciones de este informe" }).click(); await ESPERA(p, 1200); await p.getByRole("button", { name: "Abrir", exact: true }).first().click(); await ESPERA(p, 3000); }, marks: [[1, "button:has-text('Editar textos')", -6, -6], [2, "button:has-text('Presentar')", -6, -6], [3, "button:has-text('PDF / Imprimir')", -6, -6], [4, "button:has-text('Regenerar con otro tono')", -6, -6], [5, "text=Notas:", -6, -6]] },
].filter((x) => !x.omitir);

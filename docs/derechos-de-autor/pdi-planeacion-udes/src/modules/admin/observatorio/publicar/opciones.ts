/* =============================================================================
   Observatorio · opciones de un insertado y el código que se pega (lógica pura).

   Las opciones viajan versionadas (v: 1) y la base las valida otra vez
   (obs_validar_opciones, 0233): esta validación es para avisar antes de guardar.
   El código se genera aquí; el cargador es public/obs.js.
   ========================================================================== */

export type Aspecto = "claro" | "oscuro" | "auto";
export type Idioma = "es" | "en" | "pt";
export type TipoInsertado = "portada" | "tema" | "seccion" | "visor";
export type EstadoInsertado = "activo" | "pausado" | "revocado";

export interface OpcionesInsertado {
  v: 1;
  aspecto: Aspecto;
  lang: Idioma;
  titulo: boolean;
  fuente: boolean;
  barra: boolean;
  csv: boolean;
  enlace: boolean;
  /** "auto" (el marco avisa su alto) o píxeles fijos entre 120 y 2000. */
  altura: "auto" | number;
  /** Filtros por URL (fase 1): anio=2025;campus=Bucaramanga. */
  f: Record<string, string>;
  /** Huecos para la fase de tableros y filtro cruzado: hoy no cambian nada. */
  filtrable?: boolean;
  resaltar?: boolean;
  cruzado?: boolean;
  tips?: boolean;
}

export const OPCIONES_DEFECTO: OpcionesInsertado = {
  v: 1, aspecto: "claro", lang: "es", titulo: true, fuente: true, barra: true, csv: true, enlace: true, altura: "auto", f: {},
};

const FILTRO_CLAVE = /^[a-z][a-z0-9_]{0,23}$/;

/** "anio=2025;campus=Bucaramanga" ⇄ { anio, campus }. Lo inválido se descarta (hasta 8, valores de hasta 80). */
export function leerFiltros(texto: string | null | undefined): Record<string, string> {
  const f: Record<string, string> = {};
  for (const par of (texto ?? "").split(";")) {
    const i = par.indexOf("=");
    if (i < 1) continue;
    const k = par.slice(0, i).trim().toLowerCase();
    const v = par.slice(i + 1).trim();
    if (FILTRO_CLAVE.test(k) && v && v.length <= 80 && Object.keys(f).length < 8) f[k] = v;
  }
  return f;
}

export const escribirFiltros = (f: Record<string, string>) => Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(";");

/** Mismas reglas que obs_validar_opciones. Devuelve las normalizadas y los problemas, en español. */
export function validarOpciones(entrada: Partial<OpcionesInsertado>): { opciones: OpcionesInsertado; problemas: string[] } {
  const o = { ...OPCIONES_DEFECTO, ...entrada, v: 1 as const };
  const problemas: string[] = [];
  if (!["claro", "oscuro", "auto"].includes(o.aspecto)) problemas.push("El aspecto debe ser claro, oscuro o auto.");
  if (!["es", "en", "pt"].includes(o.lang)) problemas.push("El idioma debe ser es, en o pt.");
  if (o.altura !== "auto" && !(Number.isInteger(o.altura) && o.altura >= 120 && o.altura <= 2000)) problemas.push("La altura es «auto» o un número entero entre 120 y 2000.");
  const filtros = Object.entries(o.f ?? {});
  if (filtros.length > 8 || filtros.some(([k, v]) => !FILTRO_CLAVE.test(k) || v.length > 80)) problemas.push("Filtros no válidos (hasta 8, nombre en minúsculas y valor de hasta 80 caracteres).");
  return { opciones: o, problemas };
}

/** Lo mínimo que hace falta saber de un insertado para generar su código. */
export interface DatosCodigo {
  codigo: string;
  tipo: TipoInsertado;
  temaSlug?: string | null;
  seccion?: string | null;
  visorId?: string | null;
  opciones: OpcionesInsertado;
  /** Solo si el insertado tiene clave y quien genera el código la conoce (no es un secreto). */
  clave?: string;
}

export type FormatoCodigo = "script" | "iframe" | "enlace";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Los parámetros comunes del marco: los mismos que lee /obs-embed y que public/obs.js reenvía. */
export function parametrosEmbed(d: DatosCodigo): URLSearchParams {
  const q = new URLSearchParams({ id: d.codigo });
  if (d.clave) q.set("clave", d.clave);
  q.set("aspecto", d.opciones.aspecto);
  q.set("idioma", d.opciones.lang);
  const f = escribirFiltros(d.opciones.f);
  if (f) q.set("filtros", f);
  if (d.opciones.altura !== "auto") q.set("altura", String(d.opciones.altura));
  return q;
}

/** El código a pegar. `portal` es el origen del portal (https://planeacion.udes.edu.co), sin barra final. */
export function generarCodigo(portal: string, d: DatosCodigo, formato: FormatoCodigo): string {
  const base = portal.replace(/\/+$/, "");
  if (formato === "enlace") return `${base}/obs-embed?${parametrosEmbed(d).toString()}`;
  if (formato === "iframe") {
    const alto = d.opciones.altura === "auto" ? 480 : d.opciones.altura;
    return `<iframe src="${esc(`${base}/obs-embed?${parametrosEmbed(d).toString()}`)}" title="Observatorio de Analítica UDES" width="100%" height="${alto}" style="border:0" loading="lazy"></iframe>`;
  }
  // El script: el objetivo (tema, sección, visor) ya lo fija el insertado; esos atributos son solo para quien lea el código.
  const attrs: [string, string | undefined][] = [
    ["data-obs", d.codigo],
    ["data-tema", d.temaSlug ?? undefined],
    ["data-seccion", d.tipo === "seccion" ? (d.seccion ?? undefined) : undefined],
    ["data-visor", d.tipo === "visor" ? (d.visorId ?? undefined) : undefined],
    ["data-aspecto", d.opciones.aspecto],
    ["data-idioma", d.opciones.lang],
    ["data-filtros", escribirFiltros(d.opciones.f) || undefined],
    ["data-altura", d.opciones.altura === "auto" ? undefined : String(d.opciones.altura)],
    ["data-clave", d.clave],
  ];
  const lista = attrs.filter(([, v]) => v).map(([k, v]) => `${k}="${esc(v!)}"`).join("\n        ");
  return `<script src="${esc(base)}/obs.js"\n        ${lista}\n        defer></script>`;
}

export const PLATAFORMAS: { id: string; nombre: string; pasos: string }[] = [
  { id: "wordpress", nombre: "WordPress", pasos: "En el editor, agregue un bloque «HTML personalizado» y pegue el código. Con el editor clásico, use la pestaña «Texto». Los plugins de optimización pueden retrasar el script: el cargador lo tolera." },
  { id: "joomla", nombre: "Joomla", pasos: "Use un módulo «Personalizado» o un artículo con el editor en modo código (sin filtro de texto) y pegue el código. Si el editor lo borra, cambie el filtro de texto del grupo de usuarios." },
  { id: "html", nombre: "HTML propio", pasos: "Pegue el código donde quiera que aparezca, dentro de <body>. El script crea el marco en ese lugar." },
  { id: "iframe", nombre: "Solo iframe", pasos: "Si la plataforma no deja pegar scripts, use la opción «iframe»: no se ajusta solo de alto, así que indique la altura." },
  { id: "enlace", nombre: "Enlace", pasos: "Para correos, redes o documentos: use el enlace. Se abre solo el contenido, sin menú del portal." },
];

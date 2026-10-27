/* =============================================================================
   Edge Function · correos

   Envía los correos de cuenta del Portal de Planeación y de Mr. Pilo con lo que
   la administración escribió en la intranet (pantalla «Correos», migración
   0137), por el servidor SMTP de la universidad.

   Atiende dos clases de pedido, las dos por POST:

   1. EL GANCHO del servidor de cuentas (Supabase Auth, «Send Email Hook»).
      Cuando alguien crea una cuenta o pide cambiar su contraseña, el servidor
      de cuentas ya no envía su correo: le pasa el pedido a esta función,
      firmado (Standard Webhooks: cabeceras webhook-id, webhook-timestamp y
      webhook-signature; el secreto es SEND_EMAIL_HOOK_SECRET). Sin firma
      válida la función responde 401 y no hace nada más.
        { user, email_data: { token, token_hash, redirect_to, email_action_type, site_url, token_new, token_hash_new } }
      Responde `{}` con 200 cuando el correo salió. Si no salió, responde
      `{ error: { http_code, message } }`: la persona ve el mensaje y puede
      volver a intentarlo.

   2. LA INTRANET, con la sesión de alguien de la administración:
        { action: "probar", host?, port?, security?, user? }  → { ok, message | error, code? }
            abre la conexión SMTP y se identifica, sin enviar nada.
        { action: "prueba", to, clave, rol?, borrador? }       → { ok, message | error, code? }
            envía una plantilla (la guardada, o el borrador que llega, sin
            guardarlo) a un correo, con una persona de ejemplo de ese rol.
        { action: "ugm_cola", limite? }                         → { ok, enviados, fallidos, pendientes } | { ok:false, error, code }
            UI GreenMetric (0213): vacía un lote de la cola `ugm_notificaciones`
            con las plantillas editables `c-ugm-*`. La puede llamar el rol de
            servicio (tarea programada) o una persona activa de la intranet (el
            botón «Enviar avisos pendientes»): no elige a quién ni qué se envía,
            solo hace avanzar la cola. Mismas protecciones: interruptor general,
            dominios permitidos, tope por hora y bitácora enmascarada.

   Decisiones que conviene conocer:
     · La identidad sale de la cuenta: con `user_metadata.pilo` es Mr. Pilo; si
       no, Planeación. En Pilo, el rol sale de `pilo_users`; si la cuenta aún
       no está ahí (la bienvenida se envía un instante antes de guardarla), de
       los datos con que se creó; si no se sabe, vale el mensaje de estudiante.
     · Los correos de cuenta no esperan por el tope por hora: se quedaría
       alguien sin poder entrar. Sí los cortan el interruptor general, los
       dominios permitidos y el tope por persona y día, con un error legible.
     · La conexión sale de la base; si ahí no hay servidor, de las variables
       SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_SECURE. Sin la
       migración 0137, la función envía igual con esas variables y con los
       textos originales (y sin bitácora).
     · Nada del correo va a los registros: ni el enlace, ni el código, ni la
       contraseña SMTP. Esta función no usa `console`. A la bitácora solo va el
       destinatario enmascarado, una huella, el resultado y el motivo.
     · El servidor de cuentas espera cinco segundos y puede repetir el pedido:
       un pedido repetido que ya salió no se envía dos veces.

   El envío usa nodemailer (npm:nodemailer). Es la librería SMTP más probada
   que hay, entiende STARTTLS, SSL y la identificación de Microsoft 365, y en
   Deno corre sobre node:net y node:tls, que el Edge Runtime trae. La primera
   vez, el contenedor de funciones la descarga de npm: necesita salida a
   internet en ese momento.

   Variables de entorno:
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   (las pone la plataforma)
     SEND_EMAIL_HOOK_SECRET   el secreto del gancho: v1,whsec_<base64>. El mismo del servidor de cuentas.
     CORREOS_URL_PUBLICA      opcional: la dirección pública del servidor (https://…) para el enlace
                              personal. Sin ella se usa el dominio del portal.
     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_FROM   opcionales: la conexión de respaldo.

   Un solo archivo: la lógica pura va pegada aquí dentro (ver «lógica», más
   abajo), para copiar esta carpeta tal cual al servidor.

   Despliegue en Supabase autoalojado: ver docs/correos-en-coolify.md.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import nodemailer from "npm:nodemailer@6.9.16";

// >>> lógica: copia exacta de src/modules/admin/correos/servidor-logica.ts (la prueba servidor-sync lo vigila)
/* --- Identidades, roles y datos -------------------------------------------------------------- */

export type Identidad = "plan" | "pilo";
export type Rol = "estudiante" | "profesor" | "administrativo";

export const IDENTIDADES: readonly Identidad[] = ["plan", "pilo"];
export const ROLES: readonly Rol[] = ["estudiante", "profesor", "administrativo"];
export const ROL_NOMBRE: Record<Rol, string> = { estudiante: "Estudiante", profesor: "Profesor", administrativo: "Administrativo" };

/** Los datos de la persona que una plantilla puede insertar: `{{nombre}}`, `{{correo}}`… */
export const DATOS = ["nombre", "correo", "sede", "rol"] as const;
export type Dato = (typeof DATOS)[number];
export const DATO_NOMBRE: Record<Dato, string> = { nombre: "Nombre", correo: "Correo", sede: "Sede", rol: "Rol" };

export interface Persona {
  nombre: string;
  correo: string;
  sede: string;
  rol: string;
}

/** El aspecto fijo de cada identidad. No se edita: es el diseño probado del correo. */
export interface Marca {
  nombre: string;
  cabecera: string;
  cabeceraTinta: string;
  cabeceraTenue: string;
  boton: string;
  botonTinta: string;
  titulo: string;
  linea1: string;
  linea2: string;
  pie: string;
  /** La cara de Pilo en la cabecera, como imagen publicada por el portal. */
  cara: boolean;
}

export const MARCAS: Record<Identidad, Marca> = {
  plan: {
    nombre: "Portal de Planeación",
    cabecera: "#0a2d63",
    cabeceraTinta: "#ffffff",
    cabeceraTenue: "#b9cdf0",
    boton: "#2166d6",
    botonTinta: "#ffffff",
    titulo: "#0a2d63",
    linea1: "Universidad de Santander",
    linea2: "Dirección de Planeación Institucional",
    pie: "Este correo lo envía un sistema de la Dirección de Planeación Institucional de la Universidad de Santander.",
    cara: false,
  },
  pilo: {
    nombre: "Mr. Pilo",
    cabecera: "#06142b",
    cabeceraTinta: "#ffffff",
    cabeceraTenue: "#a9c0e2",
    boton: "#4fd3e0",
    botonTinta: "#04222a",
    titulo: "#06142b",
    linea1: "Mr. Pilo",
    linea2: "La inteligencia artificial de la Universidad de Santander",
    pie: "Mr. Pilo es la inteligencia artificial de la Universidad de Santander. Este correo se envió porque alguien creó una cuenta con esta dirección.",
    cara: true,
  },
};

/** Dónde publica el portal la cara de Pilo (public/pilo-face/closed.png). */
export const CARA_DE_PILO = "/pilo-face/closed.png";

/* --- Plantillas ------------------------------------------------------------------------------ */

export interface Plantilla {
  /** Estable: es la llave en la base y en la bitácora. */
  clave: string;
  identidad: Identidad;
  grupo: string;
  nombre: string;
  /** Cuándo se envía, en palabras. */
  cuando: string;
  asunto: string;
  /** La línea que algunos programas muestran junto al asunto. */
  previa: string;
  titulo: string;
  saludo: string;
  mensaje: string;
  boton: string;
  nota: string;
  /** Un mensaje por rol, cuando la plantilla cambia según quién crea la cuenta. */
  roles: Record<Rol, string> | null;
  /** Qué lleva el correo: un enlace personal, un código para escribir o un aviso. Las de fábrica son de enlace. */
  tipo: TipoPlantilla;
  /** El HTML que escribió la administración (modo HTML), o null si el correo se escribe por campos. */
  html: string | null;
  /** Dónde va el HTML: el cuerpo, dentro de la marca, o el correo entero. */
  alcance: Alcance;
}

/** Los campos que la administración escribe. */
export const CAMPOS = ["asunto", "previa", "titulo", "saludo", "mensaje", "boton", "nota"] as const;
export type Campo = (typeof CAMPOS)[number];

/* --- Plantillas propias y HTML --------------------------------------------------------------- */

/** Lo que lleva el correo: un enlace personal, un código para escribir o un aviso. */
export type TipoPlantilla = "enlace" | "codigo" | "aviso";
export const TIPOS_PLANTILLA: readonly TipoPlantilla[] = ["enlace", "codigo", "aviso"];
export const TIPO_NOMBRE: Record<TipoPlantilla, string> = { enlace: "Enlace", codigo: "Código", aviso: "Aviso" };

/** Dónde se escribe el HTML: solo el cuerpo (la cabecera y el pie de la marca se mantienen) o el correo entero. */
export type Alcance = "cuerpo" | "completo";

/** Los datos que una plantilla puede insertar, según lo que lleve. Los de la persona valen para todas. */
export const VARIABLES_POR_TIPO: Record<TipoPlantilla, readonly string[]> = {
  enlace: [...DATOS, "enlace"],
  codigo: [...DATOS, "codigo", "vigencia"],
  // UI GreenMetric (0213) usa los datos de la segunda línea: indicador, pregunta, categoría, vencimiento, etc.
  aviso: [...DATOS, "enlace", "modulo", "titulo_aviso", "detalle", "indicador", "pregunta", "categoria", "fecha_limite", "dias", "comentario", "autor", "revisor", "cantidad", "lista"],
};

/** Cómo se llama cada dato en los botones de «Insertar un dato». */
export const ETIQUETA_VARIABLE: Record<string, string> = {
  nombre: "Nombre",
  correo: "Correo",
  sede: "Sede",
  rol: "Rol",
  enlace: "Enlace",
  codigo: "Código",
  vigencia: "Vigencia",
  modulo: "Módulo",
  titulo_aviso: "Título del aviso",
  detalle: "Detalle",
  indicador: "Indicador",
  pregunta: "Pregunta",
  categoria: "Categoría",
  fecha_limite: "Fecha límite",
  dias: "Días que faltan",
  comentario: "Comentario",
  autor: "Quién lo envió",
  revisor: "Quién revisa",
  cantidad: "Cantidad",
  lista: "Lista",
};

/** Valores de ejemplo para la vista previa y para «Enviar una prueba». Los datos de la persona vienen de PERSONAS_DE_EJEMPLO. */
export const VALORES_DE_EJEMPLO: Record<string, string> = {
  enlace: "https://planeacion.udes.edu.co",
  codigo: "482913",
  vigencia: "10 minutos",
  modulo: "UDES en Cifras",
  titulo_aviso: "Matrícula 2026-1",
  detalle: "El corte de matrícula 2026-1 quedó validado y publicado.",
  indicador: "1.10 · SI3",
  pregunta: "Área total cubierta por vegetación plantada",
  categoria: "Entorno e infraestructura",
  fecha_limite: "15 de noviembre de 2026",
  dias: "3",
  comentario: "El mapa no muestra los nombres de los edificios.",
  autor: "Marcela Quintero",
  revisor: "Sergio Beltrán",
  cantidad: "3",
  lista: "1.10 · SI3, vence el 15 de noviembre; 2.6, vence mañana",
};

/** El tope del HTML de una plantilla, en caracteres (la base lo rechaza más allá). */
export const TOPE_HTML = 100_000;
/** El mismo tope, en bytes, para la lista de comprobaciones de la intranet. */
export const TOPE_HTML_BYTES = 100 * 1024;

const P_CUENTA = "Cuentas de la intranet";
const K_CUENTA = "Cuenta de Pilo";

/** El texto original de cada plantilla. La migración 0137 siembra estos mismos textos. */
export const PLANTILLAS: readonly Plantilla[] = [
  {
    clave: "plan-invite",
    identidad: "plan",
    tipo: "enlace",
    html: null,
    alcance: "cuerpo",
    grupo: P_CUENTA,
    nombre: "Activar la cuenta",
    cuando: "Al crear un usuario",
    asunto: "Active su cuenta de Planeación UDES",
    previa: "Su cuenta está lista: elija su contraseña.",
    titulo: "Active su cuenta",
    saludo: "Hola, {{nombre}}.",
    mensaje: "La Dirección de Planeación le creó una cuenta en la intranet, con el correo {{correo}}.\nPara activarla y elegir su contraseña, abra este enlace.",
    boton: "Activar mi cuenta",
    nota: "El enlace sirve una sola vez. Si no esperaba este mensaje, puede ignorarlo.",
    roles: null,
  },
  {
    clave: "plan-recovery",
    identidad: "plan",
    tipo: "enlace",
    html: null,
    alcance: "cuerpo",
    grupo: P_CUENTA,
    nombre: "Cambiar la contraseña",
    cuando: "«Olvidé mi contraseña»",
    asunto: "Cambie su contraseña",
    previa: "Abra el enlace y escriba la nueva.",
    titulo: "Cambie su contraseña",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Recibimos una solicitud para cambiar la contraseña de la cuenta {{correo}}.\nAbra este enlace y escriba la contraseña nueva.",
    boton: "Cambiar mi contraseña",
    nota: "Si usted no lo pidió, ignore este mensaje: su contraseña sigue siendo la misma.",
    roles: null,
  },
  {
    clave: "plan-email_change",
    identidad: "plan",
    tipo: "enlace",
    html: null,
    alcance: "cuerpo",
    grupo: P_CUENTA,
    nombre: "Confirmar el correo nuevo",
    cuando: "Al cambiar el correo",
    asunto: "Confirme su correo nuevo",
    previa: "",
    titulo: "Confirme su correo nuevo",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Pidió cambiar el correo de su cuenta. Para que el cambio quede hecho, confírmelo desde este enlace.",
    boton: "Confirmar el cambio",
    nota: "Si usted no lo pidió, ignore este mensaje.",
    roles: null,
  },
  {
    clave: "plan-signup",
    identidad: "plan",
    tipo: "enlace",
    html: null,
    alcance: "cuerpo",
    grupo: P_CUENTA,
    nombre: "Confirmar el correo",
    cuando: "Si alguien se registra por su cuenta",
    asunto: "Confirme su correo",
    previa: "Un paso más para terminar el registro.",
    titulo: "Confirme su correo",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Alguien creó una cuenta con el correo {{correo}} en los portales de Planeación UDES.\nPara terminar el registro, confirme que este correo es suyo.",
    boton: "Confirmar mi correo",
    nota: "Si usted no creó esta cuenta, ignore este mensaje: sin confirmar, la cuenta no se activa.",
    roles: null,
  },
  {
    clave: "plan-magiclink",
    identidad: "plan",
    tipo: "enlace",
    html: null,
    alcance: "cuerpo",
    grupo: P_CUENTA,
    nombre: "Enlace de acceso",
    cuando: "Al pedir entrar con un enlace",
    asunto: "Su enlace para entrar",
    previa: "Entre sin escribir la contraseña.",
    titulo: "Su enlace para entrar",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Pidió entrar a los portales de Planeación UDES con el correo {{correo}}.\nAbra este enlace para entrar sin escribir la contraseña.",
    boton: "Entrar",
    nota: "El enlace sirve una sola vez y vence pronto. Si usted no lo pidió, ignore este mensaje.",
    roles: null,
  },
  {
    clave: "pilo-invite",
    identidad: "pilo",
    tipo: "enlace",
    html: null,
    alcance: "cuerpo",
    grupo: K_CUENTA,
    nombre: "Bienvenida y confirmación",
    cuando: "Al crear la cuenta de Pilo",
    asunto: "{{nombre}}, confirme su cuenta de Mr. Pilo",
    previa: "Un paso más y empezamos.",
    titulo: "¡Qué bueno tenerlo por aquí!",
    saludo: "Hola, {{nombre}}.",
    mensaje: "",
    boton: "Confirmar mi cuenta",
    nota: "Si usted no creó esta cuenta, ignore este mensaje: sin confirmar, no se activa.",
    roles: {
      estudiante:
        "Soy Mr. Pilo. Con su cuenta de {{sede}} puedo ayudarle a estudiar: explicarle un tema, recordarle sus entregas de Moodle y mostrarle sus notas.\nPara empezar, confirme que este correo es suyo.",
      profesor:
        "Soy Mr. Pilo. Con su cuenta de {{sede}} puedo apoyarle en su labor docente: políticas institucionales, innovación educativa y sus cursos de Moodle.\nPara empezar, confirme que este correo es suyo.",
      administrativo:
        "Soy Mr. Pilo. Con su cuenta de {{sede}} puedo responderle sobre las cifras, los planes y las políticas de la universidad.\nPara empezar, confirme que este correo es suyo.",
    },
  },
  {
    clave: "pilo-recovery",
    identidad: "pilo",
    tipo: "enlace",
    html: null,
    alcance: "cuerpo",
    grupo: K_CUENTA,
    nombre: "Cambiar la contraseña",
    cuando: "«Olvidé mi contraseña» en Pilo",
    asunto: "Cambie su contraseña de Mr. Pilo",
    previa: "",
    titulo: "Cambiemos su contraseña",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Me pidieron cambiar la contraseña de su cuenta. Abra este enlace y escriba la nueva.",
    boton: "Cambiar mi contraseña",
    nota: "Si usted no lo pidió, ignore este mensaje: su contraseña sigue siendo la misma.",
    roles: null,
  },
];

/** El texto original de una plantilla, o null si esa clave no es de las de fábrica. */
export function plantillaOriginal(clave: string): Plantilla | null {
  return PLANTILLAS.find((p) => p.clave === clave) ?? null;
}

/**
 * El correo con código, sin enlace: lo pide el servidor de cuentas cuando alguien
 * debe confirmar que es quien dice antes de un cambio delicado. No se edita.
 */
export const PLANTILLA_CODIGO: Plantilla = {
  clave: "codigo",
  identidad: "plan",
  tipo: "codigo",
  html: null,
  alcance: "cuerpo",
  grupo: P_CUENTA,
  nombre: "Código de verificación",
  cuando: "Al confirmar un cambio delicado",
  asunto: "Su código de verificación",
  previa: "Escríbalo en la página que se lo pidió.",
  titulo: "Su código de verificación",
  saludo: "Hola, {{nombre}}.",
  mensaje: "Escriba este código en la página que se lo pidió.",
  boton: "",
  nota: "Si usted no lo pidió, ignore este mensaje y cambie su contraseña.",
  roles: null,
};

/**
 * El código que Pilo envía al crear una cuenta (0175), antes de pedir el resto de los datos.
 * Vale 10 minutos. Si en la intranet hay una fila con esta clave, manda la fila.
 */
export const PLANTILLA_PILO_CODIGO: Plantilla = {
  clave: "pilo-codigo",
  identidad: "pilo",
  tipo: "codigo",
  html: null,
  alcance: "cuerpo",
  grupo: K_CUENTA,
  nombre: "Código para crear la cuenta",
  cuando: "Al crear la cuenta de Pilo",
  asunto: "Su código de Mr. Pilo",
  previa: "Escríbalo en la pantalla donde se lo pidieron.",
  titulo: "Confirmemos su correo",
  saludo: "Hola, {{nombre}}.",
  mensaje: "Para crear su cuenta de Mr. Pilo, escriba este código en la pantalla donde se lo pidieron.\nVale por 10 minutos y sirve una sola vez.",
  boton: "",
  nota: "Nadie de la universidad le pedirá este código por teléfono ni por mensaje. Si usted no creó una cuenta, ignore este correo.",
  roles: null,
};

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

const esTipo = (v: unknown): v is TipoPlantilla => typeof v === "string" && (TIPOS_PLANTILLA as readonly string[]).includes(v);
const alcanceDe = (v: unknown, def: Alcance): Alcance => (v === "completo" || v === "cuerpo" ? v : def);

/**
 * Una fila de `correo_templates` como plantilla. Lo que falte o venga mal se
 * completa con el texto original, para que un correo de cuenta nunca salga
 * vacío. Una plantilla propia (`c-…`) no tiene original: sin su fila no existe,
 * y el resultado es null. Lo mismo si no hay ni fila útil ni original.
 */
export function plantillaDeFila(fila: unknown, clave: string): Plantilla | null {
  const base = plantillaOriginal(clave);
  const f = fila && typeof fila === "object" ? (fila as Record<string, unknown>) : null;
  // Sin fila, o apagada: vale el texto original.
  if (!f || f.active === false) return base;
  const identidad: Identidad = f.identity === "pilo" || f.identity === "plan" ? f.identity : (base?.identidad ?? "plan");
  const rb = f.role_bodies && typeof f.role_bodies === "object" ? (f.role_bodies as Record<string, unknown>) : null;
  const roles = rb
    ? ({ estudiante: texto(rb.estudiante, 4000), profesor: texto(rb.profesor, 4000), administrativo: texto(rb.administrativo, 4000) } as Record<Rol, string>)
    : (base?.roles ?? null);
  return {
    clave,
    identidad,
    grupo: texto(f.grp, 80) || base?.grupo || "",
    nombre: texto(f.name, 80) || base?.nombre || clave,
    cuando: texto(f.sent_when, 120) || base?.cuando || "",
    asunto: texto(f.subject, 200) || base?.asunto || "",
    previa: texto(f.preheader, 200),
    titulo: texto(f.title, 200) || base?.titulo || "",
    saludo: texto(f.greeting, 200),
    mensaje: texto(f.body, 4000),
    boton: texto(f.button, 80) || base?.boton || "Abrir",
    nota: texto(f.note, 600),
    roles,
    tipo: esTipo(f.tipo) ? f.tipo : (base?.tipo ?? "enlace"),
    html: typeof f.html === "string" ? f.html.slice(0, TOPE_HTML) : null,
    alcance: alcanceDe(f.html_scope, "cuerpo"),
  };
}

/**
 * Un borrador que llega de la pantalla («Enviar una prueba», guardado o no),
 * recortado a lo que una plantilla admite. La identidad, la clave y el tipo son
 * los de la plantilla (la de fábrica, o la fila de la base si es propia): un
 * borrador no puede hacerse pasar por otra ni cambiar lo que lleva el correo.
 */
export function plantillaDeBorrador(borrador: unknown, clave: string, fila?: unknown): Plantilla | null {
  const base = plantillaOriginal(clave) ?? plantillaDeFila(fila, clave);
  if (!base) return null;
  const b = borrador && typeof borrador === "object" ? (borrador as Record<string, unknown>) : null;
  if (!b) return base;
  const rb = b.roles && typeof b.roles === "object" ? (b.roles as Record<string, unknown>) : null;
  return {
    ...base,
    asunto: texto(b.asunto, 200) || base.asunto,
    previa: texto(b.previa, 200),
    titulo: texto(b.titulo, 200) || base.titulo,
    saludo: texto(b.saludo, 200),
    mensaje: texto(b.mensaje, 4000),
    boton: texto(b.boton, 80) || base.boton,
    nota: texto(b.nota, 600),
    roles: base.roles && rb ? { estudiante: texto(rb.estudiante, 4000), profesor: texto(rb.profesor, 4000), administrativo: texto(rb.administrativo, 4000) } : base.roles,
    html: b.html === undefined ? base.html : typeof b.html === "string" ? b.html.slice(0, TOPE_HTML) : null,
    alcance: alcanceDe(b.alcance, base.alcance),
  };
}

/* --- Qué pide el servidor de cuentas --------------------------------------------------------- */

/** Los correos de cuenta que llevan un enlace personal. */
export const ACCIONES_CON_ENLACE = ["signup", "invite", "magiclink", "recovery", "email_change"] as const;

/** ¿La cuenta es de Mr. Pilo? La función pilo-cuentas la marca al crearla (0120). */
export function identidadDe(user: unknown): Identidad {
  const meta = user && typeof user === "object" ? (user as { user_metadata?: unknown }).user_metadata : null;
  const pilo = meta && typeof meta === "object" ? (meta as Record<string, unknown>).pilo : null;
  return pilo === true || pilo === "true" ? "pilo" : "plan";
}

/**
 * Qué plantilla le toca a un pedido. Pilo tiene las suyas para la bienvenida
 * (invitación o registro) y para la contraseña; lo demás —poco frecuente en una
 * cuenta de Pilo— sale con la de Planeación. `reauthentication` es un código
 * sin enlace. Los avisos «ya se cambió…» no se envían: devuelve null.
 */
export function clavePlantilla(identidad: Identidad, accion: string): string | null {
  const a = accion === "email" ? "magiclink" : accion;
  if (a === "reauthentication") return PLANTILLA_CODIGO.clave;
  if (!(ACCIONES_CON_ENLACE as readonly string[]).includes(a)) return null;
  if (identidad === "pilo") {
    if (a === "invite" || a === "signup") return "pilo-invite";
    if (a === "recovery") return "pilo-recovery";
  }
  return `plan-${a}`;
}

export const esRol = (v: unknown): v is Rol => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** El primer rol conocido entre los candidatos; si ninguno lo es, estudiante. */
export function rolDe(...candidatos: unknown[]): Rol {
  for (const c of candidatos) {
    const v = typeof c === "string" ? c.trim().toLowerCase() : c;
    if (esRol(v)) return v;
  }
  return "estudiante";
}

/** El mensaje que le toca a ese rol. Si el suyo está vacío, el de estudiante; si tampoco, el común. */
export function mensajeDe(plantilla: Plantilla, rol: Rol): string {
  if (!plantilla.roles) return plantilla.mensaje;
  const propio = plantilla.roles[rol] ?? "";
  if (propio.trim()) return propio;
  const respaldo = plantilla.roles.estudiante ?? "";
  return respaldo.trim() ? respaldo : plantilla.mensaje;
}

const SEDES: Record<string, string> = { bucaramanga: "Bucaramanga", cucuta: "Cúcuta", valledupar: "Valledupar", bogota: "Bogotá" };

/** La persona como la nombra el correo. Sin sede conocida, «la UDES»; sin rol, «usuario». */
export function personaDe(datos: { correo?: unknown; nombre?: unknown; sede?: unknown; rol?: unknown }): Persona {
  const limpio = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const sede = limpio(datos.sede, 40);
  const rol = limpio(datos.rol, 40).toLowerCase();
  return {
    nombre: limpio(datos.nombre, 120),
    correo: limpio(datos.correo, 200),
    sede: SEDES[sede.toLowerCase()] ?? (sede || "la UDES"),
    rol: rol || "usuario",
  };
}

/** Las personas de ejemplo de la vista previa y de «Enviar una prueba». */
export const PERSONAS_DE_EJEMPLO: Record<Rol, Persona & { rotulo: string }> = {
  estudiante: { rotulo: "Laura, estudiante", nombre: "Laura Gómez", correo: "laura.gomez@mail.udes.edu.co", sede: "Bucaramanga", rol: "estudiante" },
  profesor: { rotulo: "Carlos, profesor", nombre: "Carlos Rueda", correo: "carlos.rueda@udes.edu.co", sede: "Cúcuta", rol: "profesor" },
  administrativo: { rotulo: "Marta, administrativa", nombre: "Marta Peña", correo: "marta.pena@valledupar.udes.edu.co", sede: "Valledupar", rol: "administrativo" },
};

/**
 * Los correos que hay que enviar por un pedido, cada uno con su enlace. Casi
 * siempre es uno. El cambio de correo puede traer dos: con el «cambio seguro»
 * encendido, el servidor de cuentas pide confirmar desde la dirección de antes
 * y desde la nueva. Los nombres van cruzados (así lo documenta Supabase):
 * `token_hash` es de la dirección NUEVA y `token_hash_new`, de la ACTUAL.
 */
export function enviosDe(user: unknown, data: unknown): { para: string; hash: string; codigo: string }[] {
  const u = (user && typeof user === "object" ? user : {}) as Record<string, unknown>;
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const actual = s(u.email);
  if (s(d.email_action_type) === "email_change") {
    const nuevo = s(u.new_email) || actual;
    const dos = s(d.token_hash_new) !== "";
    const lista = [{ para: nuevo, hash: s(d.token_hash), codigo: dos ? s(d.token_new) : s(d.token) || s(d.token_new) }];
    if (dos) lista.push({ para: actual, hash: s(d.token_hash_new), codigo: s(d.token) });
    return lista.filter((e) => e.para !== "" && e.hash !== "");
  }
  return actual ? [{ para: actual, hash: s(d.token_hash), codigo: s(d.token) }] : [];
}

/* --- El enlace personal ---------------------------------------------------------------------- */

const origen = (v: unknown): string => {
  const m = /^(https?:\/\/[^/?#\s]+)/i.exec(typeof v === "string" ? v.trim() : "");
  return m ? m[1] : "";
};

/**
 * La dirección pública del servidor de cuentas. Dentro de Docker, SUPABASE_URL
 * suele ser interna (http://kong:8000) y no sirve para un enlace que abre una
 * persona. Por eso: primero la que diga la variable de la función; si no, el
 * dominio del portal (aquí portal y servidor comparten dominio); y solo al
 * final SUPABASE_URL.
 */
export function basePublica(explicita: unknown, sitio: unknown, supabaseUrl: unknown): string {
  return origen(explicita) || origen(sitio) || origen(supabaseUrl);
}

/** El enlace que la persona abre: el servidor de cuentas lo comprueba y la lleva a `redirect`. */
export function enlaceDeVerificacion(base: string, hash: string, tipo: string, redirect: string): string {
  return `${base.replace(/\/+$/, "")}/auth/v1/verify?token=${encodeURIComponent(hash)}&type=${encodeURIComponent(tipo)}&redirect_to=${encodeURIComponent(redirect)}`;
}

/* --- Los datos de la persona ----------------------------------------------------------------- */

/** Escapa lo que se inserta en el HTML del correo (texto o atributo). */
export function escapar(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const MARCADOR = /\{\{\s*([^{}]*?)\s*\}\}/g;
const RESALTE = "background:#fff3c4;border-radius:3px;padding:0 2px;";

/** Sin nombre, «Hola, {{nombre}}.» queda «Hola.» y «{{nombre}}, confirme…» queda «Confirme…». */
function sinNombre(crudo: string): string {
  const alInicio = crudo.replace(/^\s*\{\{\s*nombre\s*\}\}\s*[,:;]?\s*/, "");
  const t = alInicio !== crudo ? alInicio.charAt(0).toUpperCase() + alInicio.slice(1) : crudo;
  return t.replace(/,?[ \t]*\{\{\s*nombre\s*\}\}/g, "");
}

export type Modo = "texto" | "html" | "resaltado";

/** El valor de un marcador: primero los datos de la persona, luego los demás valores del correo. */
function valorDe(k: string, persona: Persona, valores: Record<string, string>): string | undefined {
  if ((DATOS as readonly string[]).includes(k)) return persona[k as Dato] ?? "";
  return Object.prototype.hasOwnProperty.call(valores, k) ? (valores[k] ?? "") : undefined;
}

/**
 * Pone los datos de la persona, y los demás valores del correo, en un texto.
 * Cada valor se escapa al insertarse (en HTML); un marcador que no es un dato
 * conocido se deja tal cual y se devuelve en `desconocidos`, para avisarlo antes de guardar.
 */
export function rellenar(crudo: string, persona: Persona, modo: Modo = "texto", valores: Record<string, string> = {}): { salida: string; desconocidos: string[] } {
  const desconocidos: string[] = [];
  const fuente = persona.nombre.trim() ? String(crudo ?? "") : sinNombre(String(crudo ?? ""));
  const literal = (t: string) => (modo === "texto" ? t : escapar(t));
  let salida = "";
  let desde = 0;
  for (const m of fuente.matchAll(MARCADOR)) {
    const i = m.index ?? 0;
    salida += literal(fuente.slice(desde, i));
    desde = i + m[0].length;
    const v = valorDe(m[1], persona, valores);
    if (v === undefined) {
      desconocidos.push(m[0]);
      salida += literal(m[0]);
    } else {
      const dato = literal(v);
      salida += modo === "resaltado" ? `<span style="${RESALTE}">${dato}</span>` : dato;
    }
  }
  salida += literal(fuente.slice(desde));
  return { salida, desconocidos };
}

/**
 * Lo mismo que `rellenar`, para el HTML que escribe la administración: sustituye
 * los marcadores (escapados) y deja el resto del HTML tal cual; después lo limpia
 * `sanearHtml`. En la vista previa, el dato resaltado no se pone dentro de una
 * etiqueta, porque rompería un enlace.
 */
export function rellenarHtml(html: string, persona: Persona, valores: Record<string, string>, resaltar = false): { salida: string; desconocidos: string[] } {
  const desconocidos: string[] = [];
  const salida = String(html ?? "").replace(MARCADOR, (marca: string, k: string, i: number, todo: string) => {
    const v = valorDe(k, persona, valores);
    if (v === undefined) {
      desconocidos.push(marca);
      return marca;
    }
    const dato = escapar(v);
    const dentroDeEtiqueta = todo.lastIndexOf("<", i) > todo.lastIndexOf(">", i);
    return resaltar && !dentroDeEtiqueta ? `<span style="${RESALTE}">${dato}</span>` : dato;
  });
  return { salida, desconocidos };
}

/** Los marcadores de un texto que no están entre los permitidos, sin repetir. */
function fueraDeLos(texto: string, permitidos: readonly string[]): string[] {
  const malos = [...String(texto ?? "").matchAll(MARCADOR)].filter((m) => !permitidos.includes(m[1])).map((m) => m[0]);
  return [...new Set(malos)];
}

/** Los marcadores de una plantilla que el sistema no conoce para su tipo, sin repetir. */
export function marcadoresDesconocidos(plantilla: Plantilla): string[] {
  const permitidos: readonly string[] = VARIABLES_POR_TIPO[plantilla.tipo] ?? DATOS;
  const textos = [...CAMPOS.map((c) => plantilla[c]), ...(plantilla.roles ? ROLES.map((r) => plantilla.roles?.[r] ?? "") : []), ...(plantilla.html != null ? [plantilla.html] : [])];
  return [...new Set(textos.flatMap((t) => fueraDeLos(t, permitidos)))];
}

/* --- El correo ------------------------------------------------------------------------------- */

export interface Correo {
  asunto: string;
  previa: string;
  html: string;
  texto: string;
  desconocidos: string[];
}

export interface PedidoDeCorreo {
  plantilla: Plantilla;
  persona: Persona;
  /** El rol que decide el mensaje, si la plantilla lo cambia por rol. */
  rol?: Rol;
  /** El enlace personal. Vacío cuando el correo lleva un código. */
  enlace: string;
  /** La dirección del portal: para el pie y para la cara de Pilo. */
  sitio: string;
  /** Un código para escribir, en vez del botón. */
  codigo?: string;
  /** Otros valores para los marcadores (vigencia, módulo, aviso…). Lo que no está aquí queda tal cual. */
  valores?: Record<string, string>;
  /** Si el remitente tiene «responder a», el pie no dice «No responda». */
  respondible?: boolean;
  /** Solo para la vista previa: marca en amarillo los datos insertados. */
  resaltar?: boolean;
}

const FUENTE = "Arial,Helvetica,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

/**
 * Arma el correo: el diseño fijo y probado (tablas, estilos en línea, 560 px,
 * el mismo de public/correos/*.html) con la cabecera y el color de la
 * identidad, más su versión en texto plano. No usa hojas de estilo, ni
 * JavaScript, ni SVG. La cara de Pilo es una imagen del portal con `alt` y
 * tamaño fijo: si el programa de correo la oculta, el correo se entiende igual.
 *
 * Con HTML propio (la plantilla lo lleva), ese HTML sustituye a los campos: con
 * alcance «cuerpo» va dentro de la misma marca; con «completo», es el correo entero.
 */
export function armarCorreo(pedido: PedidoDeCorreo): Correo {
  const { plantilla: p, persona } = pedido;
  const marca = MARCAS[p.identidad] ?? MARCAS.plan;
  const sitio = origen(pedido.sitio);
  const desconocidos: string[] = [];
  const modo: Modo = pedido.resaltar ? "resaltado" : "html";
  const enlace = pedido.codigo ? "" : pedido.enlace;
  // Los valores del correo: el enlace y el código según el caso, y los demás que llegaron.
  const valores: Record<string, string> = { ...(pedido.valores ?? {}) };
  if (enlace) valores.enlace = enlace;
  if (pedido.codigo) valores.codigo = pedido.codigo;
  const H = (t: string) => {
    const r = rellenar(t, persona, modo, valores);
    desconocidos.push(...r.desconocidos);
    return r.salida;
  };
  const T = (t: string) => rellenar(t, persona, "texto", valores).salida.trim();
  const unaLinea = (t: string) => T(t).replace(/\s+/g, " ").trim();
  const parrafos = (t: string) => String(t ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const mensaje = mensajeDe(p, pedido.rol ?? "estudiante");
  const asunto = unaLinea(p.asunto).slice(0, 200);
  const previa = unaLinea(p.previa).slice(0, 200);
  // Los marcadores del asunto y de la línea previa también se avisan.
  desconocidos.push(...rellenar(p.asunto, persona, "texto", valores).desconocidos, ...rellenar(p.previa, persona, "texto", valores).desconocidos);

  // El HTML propio: sus marcadores se sustituyen y el resultado se sanea antes de usarse.
  const propio = p.html != null ? rellenarHtml(p.html, persona, valores, Boolean(pedido.resaltar)) : null;
  if (propio) desconocidos.push(...propio.desconocidos);
  const cuerpoPropio = propio ? sanearHtml(propio.salida).html : null;

  const pie = `${marca.pie}${pedido.respondible ? "" : " No responda a esta dirección."}`;
  const pieSitio = sitio ? `<br>\n            <a href="${escapar(sitio)}" style="color:#1b52ad;">${escapar(sitio)}</a>` : "";
  const previaHtml = previa ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapar(previa)}</div>\n` : "";

  // Con alcance «completo», el HTML propio es el correo entero: sin la marca alrededor.
  if (cuerpoPropio != null && p.alcance === "completo") {
    return {
      asunto,
      previa,
      html: `<!doctype html>\n<meta charset="utf-8">\n${previaHtml}${cuerpoPropio}\n`,
      texto: `${aTexto(cuerpoPropio)}\n`,
      desconocidos: [...new Set(desconocidos)],
    };
  }

  const cabecera = marca.cara && sitio
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td width="46" valign="middle" style="padding-right:14px;"><img src="${escapar(sitio + CARA_DE_PILO)}" width="46" height="64" alt="${escapar(marca.nombre)}" style="display:block;width:46px;height:64px;border:0;outline:none;font-family:${FUENTE};font-size:11px;color:${marca.cabeceraTenue};"></td>
              <td valign="middle"><div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${marca.cabeceraTinta};">${escapar(marca.linea1)}</div>
              <div style="font-family:${FUENTE};font-size:13px;color:${marca.cabeceraTenue};padding-top:4px;">${escapar(marca.linea2)}</div></td>
            </tr></table>`
    : `<div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${marca.cabeceraTinta};">${escapar(marca.linea1)}</div>
            <div style="font-family:${FUENTE};font-size:13px;color:${marca.cabeceraTenue};padding-top:4px;">${escapar(marca.linea2)}</div>`;

  const cuerpo = [p.saludo, ...parrafos(mensaje)].filter((l) => l.trim()).map((l, i, all) => `<p style="margin:0 0 ${i === all.length - 1 ? 24 : 16}px;">${H(l)}</p>`).join("\n            ");

  const accion = pedido.codigo
    ? `<p style="margin:0 0 24px;font-family:${SERIF};font-size:30px;font-weight:bold;letter-spacing:6px;color:${marca.titulo};">${escapar(pedido.codigo)}</p>`
    : `<table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:${marca.boton};border-radius:999px;">
                  <a href="${escapar(enlace)}" style="display:inline-block;padding:14px 28px;font-family:${FUENTE};font-size:16px;font-weight:bold;color:${marca.botonTinta};text-decoration:none;">${H(p.boton)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 8px;font-size:14px;color:#45566d;">Si el botón no abre, copie esta dirección y péguela en su navegador:</p>
            <p style="margin:0 0 24px;font-size:13px;line-height:1.45;color:#1b52ad;word-break:break-all;">${escapar(enlace)}</p>`;

  const nota = p.nota.trim() ? `<p style="margin:0;font-size:14px;color:#45566d;">${H(p.nota)}</p>` : "";
  const contenido = cuerpoPropio != null
    ? cuerpoPropio
    : `<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;line-height:1.2;color:${marca.titulo};">${H(p.titulo)}</h1>
            ${cuerpo}
            ${accion}
            ${nota}`;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;">
${previaHtml}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe6f0;border-radius:16px;">
        <tr>
          <td style="padding:24px 32px;background:${marca.cabecera};border-radius:16px 16px 0 0;">
            ${cabecera}
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-family:${FUENTE};font-size:16px;line-height:1.55;color:#0d1c31;">
            ${contenido}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #dfe6f0;font-family:${FUENTE};font-size:12px;line-height:1.5;color:#6b7c93;">
            ${escapar(pie)}${pieSitio}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;

  const lineas = cuerpoPropio != null
    ? [aTexto(cuerpoPropio), `--\n${pie}${sitio ? `\n${sitio}` : ""}`]
    : [
        T(p.titulo),
        T(p.saludo),
        ...parrafos(mensaje).map(T),
        pedido.codigo ? `Código: ${pedido.codigo}` : `${T(p.boton)}:\n${enlace}`,
        T(p.nota),
        `--\n${pie}${sitio ? `\n${sitio}` : ""}`,
      ];

  return { asunto, previa, html, texto: `${lineas.filter((l) => l.trim()).join("\n\n")}\n`, desconocidos: [...new Set(desconocidos)] };
}

/* --- El HTML propio de una plantilla --------------------------------------------------------- */

/** Lo que no puede llevar un correo escrito a mano: el elemento entero, con lo que tiene dentro. */
const ELEMENTOS_QUITADOS = ["script", "iframe", "object", "form"] as const;
/** Lo que se quita solo por la etiqueta: el texto que lleve dentro se queda. */
const ETIQUETAS_QUITADAS = ["embed", "input", "button", "meta", "link", "base", "frame", "frameset", "applet"] as const;
const PROHIBIDAS: ReadonlySet<string> = new Set<string>([...ELEMENTOS_QUITADOS, ...ETIQUETAS_QUITADAS]);
/** Atributos que llevan una dirección: si la dirección es de script o de datos ejecutables, el atributo se quita. */
const ATRIBUTOS_DIRECCION: ReadonlySet<string> = new Set(["href", "src", "xlink:href", "background", "action", "formaction"]);
const DIRECCION_PELIGROSA = /^(javascript|vbscript|data:text)/;
const ENTIDADES_DIRECCION: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", lpar: "(", rpar: ")", sol: "/" };
/** Una etiqueta: `<nombre atributos>` o `</nombre>`. Un valor entre comillas puede llevar `<` y `>`. */
const ETIQUETA = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;
const ATRIBUTO = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?/g;

/** Lo que el navegador entiende como dirección: entidades decodificadas, sin espacios ni controles, en minúsculas. */
function direccionReal(valor: string): string {
  const punto = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");
  return valor
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => punto(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => punto(parseInt(d, 10)))
    .replace(/&(colon|tab|newline|lpar|rpar|sol);?/gi, (_, n: string) => ENTIDADES_DIRECCION[n.toLowerCase()] ?? "")
    .replace(/[\u0000- \u007f-\u009f]/g, "")
    .toLowerCase();
}

/**
 * Quita de un HTML lo que un correo no puede llevar: scripts, iframes, objetos,
 * formularios, controles, metadatos, eventos (on…) y direcciones de script. Sin
 * DOM, para que corra igual en el navegador, en Node y en Deno. Devuelve lo que
 * quitó, para avisarlo antes de guardar.
 */
export function sanearHtml(html: string): { html: string; quitado: string[] } {
  const quitado: string[] = [];
  let t = String(html ?? "").replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/<![^>]*>?/g, "");

  // Los elementos de script y de formulario van con su contenido: el código de un script no debe quedar como texto.
  // Se repite hasta que no quede ninguno («<scr<script>…</script>ipt>» no debe sobrevivir).
  for (let vuelta = 0; vuelta < 5; vuelta += 1) {
    const antes = t;
    for (const nombre of ELEMENTOS_QUITADOS) {
      t = t.replace(new RegExp(`<\\s*${nombre}\\b[\\s\\S]*?<\\s*\\/\\s*${nombre}\\s*>`, "gi"), () => {
        quitado.push(nombre);
        return "";
      });
    }
    if (t === antes) break;
  }

  // Cada etiqueta se rehace sin lo que sobra, con sus valores entre comillas dobles. Lo que no es etiqueta se escapa,
  // así que el navegador no puede encontrar ninguna etiqueta que no haya pasado por aquí.
  let salida = "";
  let desde = 0;
  for (const m of t.matchAll(ETIQUETA)) {
    const i = m.index ?? 0;
    salida += t.slice(desde, i).replace(/</g, "&lt;");
    desde = i + m[0].length;
    const cierre = m[1] === "/";
    const nombre = m[2].toLowerCase();
    if (PROHIBIDAS.has(nombre)) {
      if (!cierre) quitado.push(nombre);
      continue;
    }
    if (cierre) {
      salida += `</${nombre}>`;
      continue;
    }
    let atributos = "";
    for (const a of m[3].matchAll(ATRIBUTO)) {
      const nombreA = a[1];
      const valor = a[2] ?? a[3] ?? a[4] ?? "";
      const n = nombreA.toLowerCase();
      if (n.startsWith("on")) {
        quitado.push(n);
        continue;
      }
      if (ATRIBUTOS_DIRECCION.has(n) && DIRECCION_PELIGROSA.test(direccionReal(valor))) {
        quitado.push(`${n} peligroso`);
        continue;
      }
      atributos += ` ${nombreA}="${valor.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"`;
    }
    salida += `<${nombre}${atributos}>`;
  }
  salida += t.slice(desde).replace(/</g, "&lt;");
  return { html: salida, quitado };
}

/** La versión de texto de un HTML ya saneado: párrafos y saltos de línea, y los enlaces con su dirección entre paréntesis. */
function aTexto(html: string): string {
  return html
    .replace(/<a\s[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, dentro: string) => {
      const txto = dentro.replace(/<[^>]+>/g, "").trim();
      if (!href) return txto;
      return !txto || txto === href ? href : `${txto} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** El HTML equivalente a los campos de una plantilla: para pasar de «Campos» a «HTML» sin empezar de cero. */
export function htmlDeCampos(p: Plantilla, rol: Rol = "estudiante"): string {
  const marca = MARCAS[p.identidad] ?? MARCAS.plan;
  const partes = [`<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;line-height:1.2;color:${marca.titulo};">${escapar(p.titulo)}</h1>`];
  if (p.saludo.trim()) partes.push(`<p style="margin:0 0 16px;">${escapar(p.saludo)}</p>`);
  for (const linea of mensajeDe(p, rol).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) partes.push(`<p style="margin:0 0 16px;">${escapar(linea)}</p>`);
  if (p.tipo === "codigo") {
    partes.push(`<p style="margin:0 0 24px;font-family:${SERIF};font-size:30px;font-weight:bold;letter-spacing:6px;color:${marca.titulo};">{{codigo}}</p>`);
  } else if (p.boton.trim()) {
    partes.push(
      `<p style="margin:24px 0;"><a href="{{enlace}}" style="display:inline-block;padding:14px 28px;font-family:${FUENTE};font-size:16px;font-weight:bold;color:${marca.botonTinta};background:${marca.boton};border-radius:999px;text-decoration:none;">${escapar(p.boton)}</a></p>`,
    );
  }
  if (p.nota.trim()) partes.push(`<p style="margin:0;font-size:14px;color:#45566d;">${escapar(p.nota)}</p>`);
  return partes.join("\n");
}

export interface Revision {
  tono: "ok" | "aviso" | "mal";
  texto: string;
}

/** La lista de comprobaciones de un HTML propio: qué le faltaría, qué quitaría el envío y cuánto pesa. */
export function revisarHtml(html: string, tipo: TipoPlantilla): Revision[] {
  const revision: Revision[] = [];
  if (tipo === "aviso") {
    revision.push({ tono: "ok", texto: "Un aviso no necesita enlace ni código." });
  } else {
    const dato = tipo === "codigo" ? "codigo" : "enlace";
    const lleva = new RegExp(`\\{\\{\\s*${dato}\\s*\\}\\}`).test(html);
    revision.push(lleva ? { tono: "ok", texto: `Lleva el dato {{${dato}}}.` } : { tono: "mal", texto: `Falta {{${dato}}}: sin él, el correo no sirve para lo que se envía.` });
  }
  const { quitado } = sanearHtml(html);
  revision.push(
    quitado.length
      ? { tono: "aviso", texto: `Se quitarían ${quitado.length} elemento(s) no permitidos: ${[...new Set(quitado)].join(", ")}.` }
      : { tono: "ok", texto: "Sin scripts, formularios ni eventos." },
  );
  const noHttps = (html.match(/<img\b[^>]*>/gi) ?? []).filter((img) => !/\bsrc\s*=\s*["']?https:\/\//i.test(img));
  revision.push(noHttps.length ? { tono: "aviso", texto: "Hay imágenes que no son https: muchos programas de correo las bloquean." } : { tono: "ok", texto: "Las imágenes, si las hay, son https." });
  const malos = fueraDeLos(html, VARIABLES_POR_TIPO[tipo]);
  revision.push(malos.length ? { tono: "mal", texto: `Dato desconocido: ${malos.join(", ")}.` } : { tono: "ok", texto: "Todos los datos existen para este tipo de correo." });
  const bytes = new TextEncoder().encode(html).length;
  const kb = Math.round(bytes / 102.4) / 10;
  revision.push(bytes > TOPE_HTML_BYTES ? { tono: "mal", texto: `Pesa ${kb} KB: el tope es 100 KB.` } : { tono: "ok", texto: `Pesa ${kb} KB (tope 100 KB).` });
  return revision;
}

/** Una clave nueva para una plantilla propia: «c-» y el nombre sin acentos ni espacios, sin repetir ninguna que ya exista. */
export function claveNueva(nombre: string, usadas: readonly string[]): string {
  const raiz = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
    .replace(/-+$/, "");
  const base = `c-${raiz || "plantilla"}`;
  let clave = base;
  for (let n = 2; usadas.includes(clave); n += 1) clave = `${base}-${n}`;
  return clave;
}

/* --- La firma del pedido (Standard Webhooks) ------------------------------------------------- */

function deBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Los secretos del gancho, listos para firmar. Admite `v1,whsec_<base64>` (como
 * lo pide el servidor de cuentas), `whsec_<base64>` o el base64 solo, y varios
 * separados por `|` (para cambiar de secreto sin cortar el servicio).
 */
export function secretosDelGancho(crudo: unknown): Uint8Array[] {
  if (typeof crudo !== "string") return [];
  return crudo
    .split("|")
    .map((s) => s.trim().replace(/^v1,/, "").replace(/^whsec_/, ""))
    .filter(Boolean)
    .map(deBase64)
    .filter((b): b is Uint8Array => b !== null && b.length > 0);
}

/** Compara sin revelar por el tiempo en qué posición difieren. */
export function igualesEnTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  let diferencia = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) diferencia |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferencia === 0;
}

/** Cuánto puede adelantarse o atrasarse la hora del pedido, en segundos. */
export const TOLERANCIA_FIRMA = 300;

export type Firma = { ok: true } | { ok: false; motivo: "secreto" | "cabeceras" | "vencida" | "firma" };

/**
 * ¿El pedido lo firmó el servidor de cuentas? Se firma `id.hora.cuerpo` con
 * HMAC-SHA256; la cabecera `webhook-signature` trae una o varias firmas
 * (`v1,<base64>`, separadas por espacios). La hora no puede alejarse más de
 * cinco minutos, para que un pedido copiado no sirva después.
 */
export async function firmaValida(pedido: { secreto: unknown; id: unknown; hora: unknown; cuerpo: string; firmas: unknown; ahora: number; tolerancia?: number }): Promise<Firma> {
  const secretos = secretosDelGancho(pedido.secreto);
  if (secretos.length === 0) return { ok: false, motivo: "secreto" };
  const id = typeof pedido.id === "string" ? pedido.id : "";
  const hora = typeof pedido.hora === "string" ? pedido.hora.trim() : "";
  const firmas = typeof pedido.firmas === "string" ? pedido.firmas : "";
  if (!id || !/^\d{1,12}$/.test(hora) || !firmas) return { ok: false, motivo: "cabeceras" };
  if (Math.abs(pedido.ahora - Number(hora)) > (pedido.tolerancia ?? TOLERANCIA_FIRMA)) return { ok: false, motivo: "vencida" };

  const recibidas = firmas
    .split(/\s+/)
    .filter((f) => f.startsWith("v1,"))
    .map((f) => deBase64(f.slice(3)))
    .filter((b): b is Uint8Array => b !== null);
  if (recibidas.length === 0) return { ok: false, motivo: "firma" };

  const contenido = new TextEncoder().encode(`${id}.${hora}.${pedido.cuerpo}`);
  let ok = false;
  for (const secreto of secretos) {
    const llave = await crypto.subtle.importKey("raw", secreto as unknown as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const esperada = new Uint8Array(await crypto.subtle.sign("HMAC", llave, contenido as unknown as ArrayBuffer));
    // Sin salir antes: se comparan todas.
    for (const r of recibidas) if (igualesEnTiempoConstante(esperada, r)) ok = true;
  }
  return ok ? { ok: true } : { ok: false, motivo: "firma" };
}

/** Firma un pedido como lo hace el servidor de cuentas. Sirve a las pruebas y a nada más. */
export async function firmar(secreto: string, id: string, hora: string, cuerpo: string): Promise<string> {
  const [llaveCruda] = secretosDelGancho(secreto);
  const llave = await crypto.subtle.importKey("raw", llaveCruda as unknown as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(`${id}.${hora}.${cuerpo}`) as unknown as ArrayBuffer));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `v1,${btoa(bin)}`;
}

/* --- La bitácora: a quién, sin decir quién --------------------------------------------------- */

export const CORREO_VALIDO = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;.]+$/;
export const correoValido = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && CORREO_VALIDO.test(v.trim());

/**
 * El destinatario como queda en la bitácora: `laura.gomez@mail.udes.edu.co`
 * pasa a `l•••a.gomez@mail.udes.edu.co`. Se tapa la primera parte del nombre
 * (hasta el primer punto), que es la que más identifica.
 */
export function enmascarar(correo: unknown): string {
  const limpio = typeof correo === "string" ? correo.trim().toLowerCase() : "";
  const arroba = limpio.lastIndexOf("@");
  if (arroba < 1) return "•••";
  const local = limpio.slice(0, arroba);
  const punto = local.indexOf(".");
  const primera = punto > 0 ? local.slice(0, punto) : local;
  const resto = punto > 0 ? local.slice(punto) : "";
  const tapada = primera.length > 2 ? `${primera[0]}•••${primera[primera.length - 1]}` : `${primera[0]}•••`;
  return `${tapada}${resto}${limpio.slice(arroba)}`;
}

/** La huella de un destinatario: sirve para contar su tope sin guardar su correo. */
export async function huella(correo: string, sal: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${sal}|correos|${correo.trim().toLowerCase()}`) as unknown as ArrayBuffer));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/* --- Dominios y topes ------------------------------------------------------------------------ */

/** «udes.edu.co, @mail.udes.edu.co» → ["udes.edu.co", "mail.udes.edu.co"]. Lo que no parece un dominio se descarta. */
export function dominiosDe(crudo: unknown): string[] {
  const partes = Array.isArray(crudo) ? crudo.map(String) : typeof crudo === "string" ? crudo.split(/[\s,;]+/) : [];
  const limpios = partes.map((d) => d.trim().toLowerCase().replace(/^@/, "").replace(/^\*\./, "").replace(/\.$/, "")).filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));
  return [...new Set(limpios)].slice(0, 40);
}

/** Lista vacía: a cualquiera. Un dominio de la lista incluye sus subdominios. */
export function dominioPermitido(correo: string, dominios: readonly string[]): boolean {
  if (dominios.length === 0) return true;
  const d = correo.trim().toLowerCase().split("@").pop() ?? "";
  return dominios.some((p) => d === p || d.endsWith(`.${p}`));
}

export type Tipo = "cuenta" | "prueba" | "aviso" | "codigo";
export type Resultado = "aceptado" | "rechazado" | "en_espera";
export type Decision = { sale: true } | { sale: false; resultado: Resultado; motivo: string; http: number };

/**
 * ¿Sale este correo?
 *
 * Los correos de CUENTA (activar, cambiar contraseña…) no esperan: si se
 * retuvieran por el tope por hora, alguien se quedaría sin poder entrar y sin
 * saber por qué. Por eso el tope por hora no los frena; sí los cortan el
 * interruptor general, los dominios permitidos y el tope por persona y día,
 * que es el que impide usar «olvidé mi contraseña» para molestar a otro.
 *
 * Un CÓDIGO (crear la cuenta de Pilo) sigue la regla de la cuenta: nadie se
 * queda sin poder registrarse por el tope por hora; la base ya limita cuántos
 * códigos recibe un correo y cada cuánto.
 *
 * Una PRUEBA no cuenta para el tope por persona, pero sí respeta el tope por
 * hora y los dominios. Un AVISO (para después) espera su turno si se pasa el
 * tope por hora. Un tope en 0 es «sin tope».
 */
export function decidirEnvio(caso: { tipo: Tipo; encendido: boolean; permitido: boolean; enHora: number; topeHora: number; dePersonaHoy: number; topePersona: number }): Decision {
  const no = (resultado: Resultado, motivo: string, http: number): Decision => ({ sale: false, resultado, motivo, http });
  if (caso.tipo !== "prueba" && !caso.encendido) return no("rechazado", "El envío de correos está apagado en la intranet.", 503);
  if (!caso.permitido) return no("rechazado", "Esa dirección no es de un dominio permitido.", 403);
  if (caso.tipo === "cuenta" || caso.tipo === "codigo") {
    if (caso.topePersona > 0 && caso.dePersonaHoy >= caso.topePersona) {
      return no("rechazado", `Ya se enviaron ${caso.topePersona} correos de cuenta a esta dirección hoy. Revise su bandeja (y el correo no deseado) o intente mañana.`, 429);
    }
    return { sale: true };
  }
  if (caso.topeHora > 0 && caso.enHora >= caso.topeHora) {
    return caso.tipo === "aviso" ? no("en_espera", "Se alcanzó el tope por hora: espera su turno.", 429) : no("rechazado", "Se alcanzó el tope de correos por hora. Intente más tarde.", 429);
  }
  return { sale: true };
}

/* --- El servidor de correo ------------------------------------------------------------------- */

/** «none»: sin cifrado ni contraseña, para un servidor de pruebas como Mailpit (puerto 1025). */
export type Seguridad = "starttls" | "ssl" | "none";

export const seguridadDe = (v: unknown): Seguridad => (v === "ssl" ? "ssl" : v === "none" ? "none" : "starttls");

export interface Conexion {
  host: string;
  port: number;
  seguridad: Seguridad;
  user: string;
  pass: string;
  /** De dónde salió: de la intranet, de las variables de la función o de ninguna parte. */
  origen: "base" | "entorno" | "ninguno";
}

/**
 * La conexión SMTP. Manda lo guardado en la intranet; si ahí no hay servidor,
 * valen las variables de la función (SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASS, SMTP_SECURE), para poder arrancar solo con Coolify. Si en la
 * intranet hay servidor pero aún no contraseña, se usa la de las variables.
 */
export function conexionDe(ajustes: unknown, clave: unknown, env: Record<string, string | undefined>): Conexion {
  const a = (ajustes && typeof ajustes === "object" ? ajustes : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const puerto = (v: unknown, def: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : def;
  };
  if (s(a.smtp_host)) {
    const port = puerto(a.smtp_port, 587);
    return { host: s(a.smtp_host), port, seguridad: seguridadDe(a.smtp_security), user: s(a.smtp_user), pass: (typeof clave === "string" && clave) || env.SMTP_PASS || "", origen: "base" };
  }
  const host = s(env.SMTP_HOST);
  if (!host) return { host: "", port: 587, seguridad: "starttls", user: "", pass: "", origen: "ninguno" };
  const port = puerto(env.SMTP_PORT, 587);
  const seguro = s(env.SMTP_SECURE).toLowerCase();
  const ssl = seguro ? ["ssl", "tls", "ssl/tls", "true", "1", "si", "sí"].includes(seguro) : port === 465;
  const sinCifrado = ["none", "ninguna", "no", "false", "0", "plain"].includes(seguro);
  return { host, port, seguridad: sinCifrado ? "none" : ssl ? "ssl" : "starttls", user: s(env.SMTP_USER), pass: env.SMTP_PASS ?? "", origen: "entorno" };
}

/** Tiempos límite del servidor de correo, en milisegundos. Cortos: el servidor de cuentas espera pocos segundos. */
export const SMTP_CONEXION_MS = 4_000;
export const SMTP_SALUDO_MS = 4_000;
export const SMTP_SILENCIO_MS = 8_000;
/** Lo más que puede tardar un envío pedido por el servidor de cuentas, que solo espera cinco segundos. */
export const SMTP_TOTAL_GANCHO_MS = 4_500;
/** Lo más que puede tardar una prueba pedida desde la intranet. */
export const SMTP_TOTAL_PANEL_MS = 15_000;

export type FalloSmtp = { codigo: "dns" | "puerto" | "tiempo" | "tls" | "credenciales" | "remitente" | "buzon" | "config" | "otro"; mensaje: string };

/**
 * Qué pasó con el servidor de correo, dicho para quien no programa. De la
 * respuesta del servidor solo se usa su número: el texto puede traer la
 * dirección de la persona y no debe llegar a la bitácora.
 */
export function falloSmtp(error: unknown): FalloSmtp {
  const e = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const code = typeof e.code === "string" ? e.code.toUpperCase() : "";
  const n = Number(e.responseCode) || 0;
  const m = `${typeof e.message === "string" ? e.message : String(error ?? "")} ${typeof e.response === "string" ? e.response : ""}`.toLowerCase();
  const con = (codigo: FalloSmtp["codigo"], mensaje: string): FalloSmtp => ({ codigo, mensaje });

  if (code === "EAUTH" || [530, 534, 535].includes(n) || /authentication (failed|unsuccessful)|invalid login|username and password not accepted/.test(m)) {
    return con("credenciales", "El servidor rechazó el usuario o la contraseña. Revise los dos; en Microsoft 365, el buzón debe tener permitido «SMTP autenticado».");
  }
  if (code === "EDNS" || code === "ENOTFOUND" || code === "EAI_AGAIN" || /getaddrinfo|enotfound|dns|name or service not known|failed to lookup/.test(m)) {
    return con("dns", "No encontré ese servidor: revise que el nombre esté bien escrito.");
  }
  if (code === "ECONNREFUSED" || /econnrefused|connection refused/.test(m)) {
    return con("puerto", "El servidor no acepta conexiones en ese puerto. Lo habitual es 587 (STARTTLS) o 465 (SSL/TLS).");
  }
  if (code === "ETLS" || /wrong version number|ssl routines|certificate|tls|handshake|starttls/.test(m)) {
    return con("tls", "Falló el cifrado de la conexión. Con el puerto 587 elija STARTTLS; con el 465, SSL/TLS.");
  }
  if (code === "ETIMEDOUT" || code === "ETIME" || /timed? ?out|timeout|greeting never received/.test(m)) {
    return con("tiempo", "El servidor no respondió a tiempo: lo más probable es que la salida por ese puerto esté cerrada desde este servidor. Pida que la abran (puerto 587).");
  }
  if (/sendasdenied|send as|not authorized to send|5\.7\.60|sender address rejected|5\.7\.1 .*sender/.test(m) || n === 553) {
    return con("remitente", `Rechazado${n ? ` (${n})` : ""}: el servidor no deja enviar con esa dirección de remitente. Debe ser el buzón de la conexión o uno con permiso «Enviar como».`);
  }
  if (code === "EENVELOPE" || [550, 551, 552, 554].includes(n)) {
    return con("buzon", `Rechazado${n ? ` (${n})` : ""}: el buzón no existe o el servidor no aceptó el destinatario.`);
  }
  if (code === "ECONNECTION" || code === "ESOCKET" || /econnreset|socket|connection closed/.test(m)) {
    return con("puerto", "La conexión con el servidor se cortó. Revise el puerto y la seguridad, y que la salida no esté bloqueada.");
  }
  return con("otro", `El servidor de correo no aceptó el pedido${n ? ` (${n})` : ""}.`);
}
// <<< fin de la lógica

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** El error como lo espera el servidor de cuentas de un gancho: la persona ve `message`. */
const errorDeGancho = (http: number, message: string) => json({ error: { http_code: http, message } }, http);

const ENV = (name: string) => Deno.env.get(name) ?? "";
const cliente = (url: string, key: string, authorization?: string) =>
  createClient(url, key, { ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}), auth: { persistSession: false, autoRefreshToken: false } });
type Admin = ReturnType<typeof cliente>;

interface Contexto {
  settings?: Record<string, unknown> | null;
  password?: string;
  identities?: Record<string, { from_name?: string; address?: string; reply_to?: string } | undefined>;
  templates?: Record<string, unknown>;
  in_hour?: number;
  person_day?: number;
  repeated?: boolean;
}

/** Lo que la base sabe para este envío. Sin la migración 0137 devuelve null: se envía con las variables y los textos originales. */
async function contextoDe(admin: Admin, hash: string, hook: string): Promise<Contexto | null> {
  const { data, error } = await admin.rpc("correo_context", { p_hash: hash, p_hook: hook });
  return error || !data || typeof data !== "object" ? null : (data as Contexto);
}

/** Anota en la bitácora. Si no se puede (sin migración), el correo no deja de salir por eso. */
async function anotar(admin: Admin, fila: { kind: Tipo; identity: Identidad; template: string; rol: string; action: string; para: string; hash: string; result: Resultado; reason: string; hook: string }) {
  await admin
    .from("correo_log")
    .insert({
      kind: fila.kind,
      identity: fila.identity,
      template: fila.template.slice(0, 40),
      rol: esRol(fila.rol) ? fila.rol : "",
      action: fila.action.slice(0, 40),
      recipient: enmascarar(fila.para),
      recipient_hash: fila.hash,
      result: fila.result,
      reason: fila.reason.slice(0, 300),
      hook_id: fila.hook.slice(0, 120),
    })
    .then(() => undefined, () => undefined);
}

const variablesSmtp = () => ({ SMTP_HOST: ENV("SMTP_HOST"), SMTP_PORT: ENV("SMTP_PORT"), SMTP_USER: ENV("SMTP_USER"), SMTP_PASS: ENV("SMTP_PASS"), SMTP_SECURE: ENV("SMTP_SECURE") });

function transporteDe(c: Conexion) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.seguridad === "ssl",
    requireTLS: c.seguridad === "starttls",
    // Sin cifrado (Mailpit): ni siquiera se ofrece STARTTLS.
    ...(c.seguridad === "none" ? { ignoreTLS: true } : {}),
    ...(c.user ? { auth: { user: c.user, pass: c.pass } } : {}),
    connectionTimeout: SMTP_CONEXION_MS,
    greetingTimeout: SMTP_SALUDO_MS,
    socketTimeout: SMTP_SILENCIO_MS,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
  });
}

/** Corre una tarea del servidor de correo con un tope total; al vencerse, cierra la conexión. */
async function conTope<T>(ms: number, transporte: { close: () => void }, tarea: Promise<T>): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, reject) => {
    reloj = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), ms);
  });
  try {
    return await Promise.race([tarea, tope]);
  } finally {
    clearTimeout(reloj);
    try {
      transporte.close();
    } catch {
      // Ya estaba cerrada.
    }
  }
}

/** El remitente de una identidad: su dirección; si no tiene, el usuario de la conexión. */
function remitenteDe(ctx: Contexto | null, identidad: Identidad, conexion: Conexion): { nombre: string; direccion: string; responder: string } {
  const fila = ctx?.identities?.[identidad];
  const candidatos = [fila?.address, conexion.user, ENV("SMTP_FROM"), ENV("SMTP_ADMIN_EMAIL")];
  return {
    nombre: (fila?.from_name ?? "").trim() || MARCAS[identidad].nombre,
    direccion: candidatos.map((c) => (c ?? "").trim()).find(correoValido) ?? "",
    responder: correoValido(fila?.reply_to) ? (fila?.reply_to ?? "").trim() : "",
  };
}

type Salida = { ok: true } | { ok: false; http: number; code: string; message: string };

/** Un correo, de principio a fin: decide si sale, lo arma, lo envía y lo anota. */
async function enviar(
  admin: Admin,
  ctx: Contexto | null,
  pedido: { tipo: Tipo; plantilla: Plantilla; persona: Persona; rol: Rol; para: string; hash: string; enlace: string; codigo?: string; valores?: Record<string, string>; sitio: string; accion: string; hook: string; asunto?: (a: string) => string; topeMs: number },
): Promise<Salida> {
  const { plantilla, para } = pedido;
  const identidad = plantilla.identidad;
  const ajustes = ctx?.settings ?? null;
  const base = { kind: pedido.tipo, identity: identidad, template: plantilla.clave, rol: plantilla.roles ? pedido.rol : "", action: pedido.accion, para, hash: pedido.hash, hook: pedido.hook };

  const decision = decidirEnvio({
    tipo: pedido.tipo,
    encendido: ajustes ? ajustes.enabled !== false : true,
    permitido: dominioPermitido(para, dominiosDe(ajustes?.allowed_domains ?? [])),
    enHora: Number(ctx?.in_hour ?? 0),
    topeHora: Number(ajustes?.hourly_limit ?? 0),
    dePersonaHoy: Number(ctx?.person_day ?? 0),
    topePersona: Number(ajustes?.person_daily_limit ?? 0),
  });
  if (!decision.sale) {
    await anotar(admin, { ...base, result: decision.resultado, reason: decision.motivo });
    return { ok: false, http: decision.http, code: "tope", message: decision.motivo };
  }

  const conexion = conexionDe(ajustes, ctx?.password ?? "", variablesSmtp());
  if (conexion.origen === "ninguno") {
    const motivo = "Falta configurar el servidor de correo en la intranet (Correos › Remitentes y conexión).";
    await anotar(admin, { ...base, result: "rechazado", reason: motivo });
    return { ok: false, http: 503, code: "config", message: motivo };
  }
  const remitente = remitenteDe(ctx, identidad, conexion);
  if (!remitente.direccion) {
    const motivo = "Falta la dirección del remitente: escríbala en la intranet (Correos › Remitentes y conexión).";
    await anotar(admin, { ...base, result: "rechazado", reason: motivo });
    return { ok: false, http: 503, code: "config", message: motivo };
  }

  const correo = armarCorreo({ plantilla, persona: pedido.persona, rol: pedido.rol, enlace: pedido.enlace, codigo: pedido.codigo, valores: pedido.valores, sitio: pedido.sitio, respondible: remitente.responder !== "" });
  const transporte = transporteDe(conexion);
  try {
    await conTope(
      pedido.topeMs,
      transporte,
      transporte.sendMail({
        from: { name: remitente.nombre, address: remitente.direccion },
        to: para,
        ...(remitente.responder ? { replyTo: remitente.responder } : {}),
        subject: pedido.asunto ? pedido.asunto(correo.asunto) : correo.asunto,
        text: correo.texto,
        html: correo.html,
        // Que una respuesta automática («fuera de la oficina») no vuelva a este buzón.
        headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
      }),
    );
  } catch (error) {
    const fallo = falloSmtp(error);
    await anotar(admin, { ...base, result: "rechazado", reason: fallo.mensaje });
    return { ok: false, http: 502, code: fallo.codigo, message: fallo.mensaje };
  }
  await anotar(admin, { ...base, result: "aceptado", reason: "Aceptado por el servidor" });
  return { ok: true };
}

/* --- El gancho del servidor de cuentas --------------------------------------------------------- */

async function gancho(request: Request, crudo: string, url: string, serviceKey: string): Promise<Response> {
  const secreto = ENV("SEND_EMAIL_HOOK_SECRET");
  const firma = await firmaValida({
    secreto,
    id: request.headers.get("webhook-id"),
    hora: request.headers.get("webhook-timestamp"),
    cuerpo: crudo,
    firmas: request.headers.get("webhook-signature"),
    ahora: Math.floor(Date.now() / 1000),
  });
  if (!firma.ok) return errorDeGancho(401, firma.motivo === "secreto" ? "La función de correos no tiene su secreto (SEND_EMAIL_HOOK_SECRET)." : "El pedido no viene firmado por el servidor de cuentas.");

  let cuerpo: { user?: Record<string, unknown>; email_data?: Record<string, unknown> };
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return errorDeGancho(400, "El pedido no es JSON.");
  }
  const user = cuerpo?.user && typeof cuerpo.user === "object" ? cuerpo.user : null;
  const data = cuerpo?.email_data && typeof cuerpo.email_data === "object" ? cuerpo.email_data : null;
  if (!user || !data) return errorDeGancho(400, "Al pedido le faltan los datos de la cuenta.");

  const accion = String(data.email_action_type ?? "");
  const identidadCuenta = identidadDe(user);
  const clave = clavePlantilla(identidadCuenta, accion);
  // Los avisos «ya se cambió su contraseña» y parecidos no se envían por ahora: se responde bien para no frenar la cuenta.
  if (!clave) return json({});
  const envios = enviosDe(user, data);
  if (envios.length === 0 || !envios.every((e) => correoValido(e.para))) return errorDeGancho(400, "La cuenta no tiene un correo al que escribirle.");

  const admin = cliente(url, serviceKey);
  const hook = request.headers.get("webhook-id") ?? "";
  const meta = (user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {}) as Record<string, unknown>;
  const id = typeof user.id === "string" ? user.id : "";

  // Quién es: en Pilo, su cuenta (rol, sede, nombre); en la intranet, su perfil. Si no se puede leer, valen los datos con que se creó.
  let cuenta: Record<string, unknown> | null = null;
  if (id) {
    const leida = identidadCuenta === "pilo"
      ? await admin.from("pilo_users").select("full_name, rol, campus").eq("id", id).maybeSingle()
      : await admin.from("profiles").select("full_name").eq("id", id).maybeSingle();
    cuenta = leida.error ? null : (leida.data as Record<string, unknown> | null);
  }
  const rol = rolDe(cuenta?.rol, meta.rol);
  const sitio = String(data.site_url ?? "");
  const base = basePublica(ENV("CORREOS_URL_PUBLICA"), sitio, url);
  const redirect = String(data.redirect_to ?? "") || sitio;

  let fallo: Extract<Salida, { ok: false }> | null = null;
  for (const envio of envios) {
    const hash = await huella(envio.para, secreto);
    const ctx = await contextoDe(admin, hash, hook);
    if (ctx?.repeated) continue;
    const plantilla = clave === PLANTILLA_CODIGO.clave ? PLANTILLA_CODIGO : plantillaDeFila(ctx?.templates?.[clave], clave);
    if (!plantilla) {
      fallo = { ok: false, http: 500, code: "plantilla", message: "No hay plantilla para este correo." };
      continue;
    }
    const persona = personaDe({ correo: envio.para, nombre: cuenta?.full_name ?? meta.full_name, sede: cuenta?.campus ?? meta.campus, rol: identidadCuenta === "pilo" ? rol : "" });
    const conCodigo = clave === PLANTILLA_CODIGO.clave;
    if (!conCodigo && !envio.hash) {
      fallo = { ok: false, http: 400, code: "datos", message: "Al pedido le falta el enlace personal." };
      continue;
    }
    const salida = await enviar(admin, ctx, {
      tipo: "cuenta",
      plantilla,
      persona,
      rol,
      para: envio.para,
      hash,
      enlace: conCodigo ? "" : enlaceDeVerificacion(base, envio.hash, accion, redirect),
      codigo: conCodigo ? envio.codigo : undefined,
      sitio,
      accion,
      hook,
      topeMs: SMTP_TOTAL_GANCHO_MS,
    });
    if (!salida.ok) fallo = salida;
  }
  // A la persona, solo lo que le sirve: el detalle técnico queda en la bitácora.
  if (fallo) return errorDeGancho(fallo.http, fallo.code === "tope" ? fallo.message : "No pudimos enviarle el correo. Intente de nuevo en un momento; si sigue igual, escriba a la Dirección de Planeación.");
  return json({});
}

/* --- Un código para crear la cuenta de Pilo (0175): lo pide la función pilo-cuentas -------------- */

async function codigoDePilo(request: Request, body: Record<string, unknown>, url: string, serviceKey: string): Promise<Response> {
  // Solo la función de cuentas, con la clave de servicio: nadie más puede mandar un código a una dirección.
  if ((request.headers.get("Authorization") ?? "") !== `Bearer ${serviceKey}`) return json({ error: "Falta la sesión.", code: "sesion" }, 401);
  const para = typeof body.to === "string" ? body.to.trim().toLowerCase().slice(0, 254) : "";
  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  if (!correoValido(para) || !/^[0-9A-Z]{4,8}$/.test(codigo)) return json({ ok: false, code: "datos", error: "Faltan el correo o el código." }, 400);
  const admin = cliente(url, serviceKey);
  const hash = await huella(para, ENV("SEND_EMAIL_HOOK_SECRET") || serviceKey);
  const ctx = await contextoDe(admin, hash, "");
  const plantilla = plantillaDeFila(ctx?.templates?.[PLANTILLA_PILO_CODIGO.clave], PLANTILLA_PILO_CODIGO.clave) ?? PLANTILLA_PILO_CODIGO;
  const sitio = basePublica(typeof body.sitio === "string" ? body.sitio : "", ENV("CORREOS_URL_PUBLICA"), "");
  const salida = await enviar(admin, ctx, {
    tipo: "codigo",
    plantilla,
    persona: personaDe({ correo: para, nombre: "", sede: "", rol: "" }),
    rol: "estudiante",
    para,
    hash,
    enlace: "",
    codigo,
    sitio,
    accion: "otp",
    hook: "",
    topeMs: SMTP_TOTAL_GANCHO_MS,
  });
  if (!salida.ok) return json({ ok: false, code: salida.code, error: salida.message }, salida.http);
  return json({ ok: true });
}

/* --- Un aviso del Portal de agentes (0181): invitación, transcripción, «ya lo atiende un agente» ------ */

async function avisoDeSoporte(request: Request, body: Record<string, unknown>, url: string, serviceKey: string): Promise<Response> {
  // Solo la función `soporte`, con la clave de servicio: el texto lo arma ella, nunca la persona.
  if ((request.headers.get("Authorization") ?? "") !== `Bearer ${serviceKey}`) return json({ error: "Falta la sesión.", code: "sesion" }, 401);
  const para = typeof body.to === "string" ? body.to.trim().toLowerCase().slice(0, 254) : "";
  if (!correoValido(para)) return json({ ok: false, code: "datos", error: "Falta el correo." }, 400);
  // Un texto de la persona no puede traer marcadores {{…}}: se quitan antes de armar la plantilla.
  const limpio = (v: unknown, max: number): string => texto(v, max).replace(/\{\{|\}\}/g, "");
  const enlace = typeof body.enlace === "string" && /^https:\/\//.test(body.enlace) ? body.enlace.slice(0, 500) : "";
  const boton = enlace ? limpio(body.boton, 60) : "";
  const asunto = limpio(body.asunto, 150).trim();
  const mensaje = limpio(body.mensaje, 12000).trim();
  if (!asunto || !mensaje) return json({ ok: false, code: "datos", error: "Faltan el asunto o el mensaje." }, 400);
  const plantilla: Plantilla = {
    clave: "soporte-aviso",
    identidad: "pilo",
    tipo: boton ? "enlace" : "aviso",
    html: null,
    alcance: "cuerpo",
    grupo: "Portal de agentes",
    nombre: "Aviso del Portal de agentes",
    cuando: "Invitaciones, transcripciones y avisos de atención",
    asunto,
    previa: limpio(body.previa, 120),
    titulo: limpio(body.titulo, 120) || asunto,
    saludo: "Hola, {{nombre}}.",
    mensaje,
    boton,
    nota: limpio(body.nota, 300),
    roles: null,
  };
  const admin = cliente(url, serviceKey);
  const hash = await huella(para, ENV("SEND_EMAIL_HOOK_SECRET") || serviceKey);
  const ctx = await contextoDe(admin, hash, "");
  const sitio = basePublica(typeof body.sitio === "string" ? body.sitio : "", ENV("CORREOS_URL_PUBLICA"), "");
  const salida = await enviar(admin, ctx, {
    tipo: "aviso",
    plantilla,
    persona: personaDe({ correo: para, nombre: limpio(body.nombre, 120), sede: "", rol: "" }),
    rol: "estudiante",
    para,
    hash,
    enlace,
    sitio,
    accion: "soporte",
    hook: "",
    topeMs: SMTP_TOTAL_GANCHO_MS,
  });
  if (!salida.ok) return json({ ok: false, code: salida.code, error: salida.message }, salida.http);
  return json({ ok: true });
}

/* --- Un aviso de Gestión Master (0194): solicitud nueva, turno, devolución, decisión final -------- */

/** El texto de respaldo si la plantilla c-gm-* no está en la base (sin la migración 0194, o borrada). */
const PLANTILLA_GM_RESPALDO: Plantilla = {
  clave: "c-gm-respaldo",
  identidad: "plan",
  tipo: "aviso",
  html: null,
  alcance: "cuerpo",
  grupo: "Gestión Master",
  nombre: "Aviso de Gestión Master",
  cuando: "Solicitudes de actividades del Master",
  asunto: "Gestión Master: {{titulo_aviso}}",
  previa: "",
  titulo: "{{titulo_aviso}}",
  saludo: "Hola, {{nombre}}:",
  mensaje: "{{detalle}}",
  boton: "Abrir en el portal",
  nota: "Este aviso lo envía el portal de Planeación.",
  roles: null,
};

async function avisoDeGestionMaster(request: Request, body: Record<string, unknown>, url: string, serviceKey: string): Promise<Response> {
  // Solo la función `gestion-master`, con la clave de servicio: ella arma los valores desde la base, nunca la persona.
  if ((request.headers.get("Authorization") ?? "") !== `Bearer ${serviceKey}`) return json({ error: "Falta la sesión.", code: "sesion" }, 401);
  const para = typeof body.to === "string" ? body.to.trim().toLowerCase().slice(0, 254) : "";
  if (!correoValido(para)) return json({ ok: false, code: "datos", error: "Falta el correo." }, 400);
  const clave = typeof body.clave === "string" && /^c-gm-[a-z0-9-]{1,30}$/.test(body.clave) ? body.clave : "";
  if (!clave) return json({ ok: false, code: "datos", error: "Falta la plantilla." }, 400);
  // Un texto de la persona (la nota de una decisión, el nombre de una actividad) no puede traer marcadores {{…}}.
  const limpio = (v: unknown, max: number): string => texto(v, max).replace(/\{\{|\}\}/g, "");
  const v = (body.valores && typeof body.valores === "object" ? body.valores : {}) as Record<string, unknown>;
  const valores: Record<string, string> = {
    folio: limpio(v.folio, 40),
    titulo_aviso: limpio(v.titulo_aviso, 160),
    detalle: limpio(v.detalle, 1200).replace(/\s+/g, " ").trim(),
    modulo: "Gestión Master",
  };
  const enlace = typeof body.enlace === "string" && /^https:\/\//.test(body.enlace) ? body.enlace.slice(0, 500) : "";
  const admin = cliente(url, serviceKey);
  const hash = await huella(para, ENV("SEND_EMAIL_HOOK_SECRET") || serviceKey);
  const ctx = await contextoDe(admin, hash, "");
  const plantilla = plantillaDeFila(ctx?.templates?.[clave], clave) ?? PLANTILLA_GM_RESPALDO;
  const sitio = basePublica(typeof body.sitio === "string" ? body.sitio : "", ENV("CORREOS_URL_PUBLICA"), "");
  const salida = await enviar(admin, ctx, {
    tipo: "aviso",
    plantilla,
    persona: personaDe({ correo: para, nombre: limpio(body.nombre, 120), sede: "", rol: "" }),
    rol: "administrativo",
    para,
    hash,
    enlace: enlace || sitio || "https://planeacion.udes.edu.co",
    valores,
    sitio,
    accion: "gm",
    hook: "",
    topeMs: SMTP_TOTAL_GANCHO_MS,
  });
  if (!salida.ok) return json({ ok: false, code: salida.code, error: salida.message }, salida.http);
  return json({ ok: true });
}

/* --- La cola de UI GreenMetric (0213): asignación, envío, devolución, aprobación, recordatorio y resumen ------ */

/** El texto de respaldo si la plantilla c-ugm-* no está en la base (sin la migración 0213, o borrada). */
const PLANTILLA_UGM_RESPALDO: Plantilla = {
  clave: "c-ugm-respaldo",
  identidad: "plan",
  tipo: "aviso",
  html: null,
  alcance: "cuerpo",
  grupo: "UI GreenMetric",
  nombre: "Aviso de UI GreenMetric",
  cuando: "Reporte de UI GreenMetric",
  asunto: "UI GreenMetric: {{titulo_aviso}}",
  previa: "",
  titulo: "{{titulo_aviso}}",
  saludo: "Hola, {{nombre}}.",
  mensaje: "{{detalle}}",
  boton: "Abrir en el portal",
  nota: "Este aviso lo envía el portal de Planeación.",
  roles: null,
};

/** Los datos que una fila de la cola puede traer, con su largo máximo. Lo demás se descarta. */
const VALORES_UGM: Record<string, number> = {
  indicador: 60, pregunta: 300, categoria: 120, fecha_limite: 60, dias: 60, comentario: 600, autor: 120, revisor: 120, cantidad: 60, lista: 1500,
};

async function colaDeUgm(request: Request, body: Record<string, unknown>, url: string, anonKey: string, serviceKey: string): Promise<Response> {
  const inicio = Date.now();
  const authorization = request.headers.get("Authorization") ?? "";
  // Solo el rol de servicio (tarea programada) o una persona activa con sesión: la función no recibe a quién ni qué enviar.
  if (authorization !== `Bearer ${serviceKey}`) {
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ ok: false, error: "Falta la sesión.", code: "sesion" }, 401);
    const caller = cliente(url, anonKey, authorization);
    const who = await caller.auth.getUser();
    if (who.error || !who.data.user) return json({ ok: false, error: "Sesión inválida.", code: "sesion" }, 401);
    const { data: perfil } = await caller.from("profiles").select("is_active").eq("id", who.data.user.id).maybeSingle();
    if (!perfil?.is_active) return json({ ok: false, error: "Solo las personas activas de la intranet envían los avisos pendientes.", code: "permiso" }, 403);
  }
  const limite = Math.max(1, Math.min(Math.floor(Number(body.limite)) || 10, 20));
  const admin = cliente(url, serviceKey);
  await admin.rpc("ugm_cola_limpiar").then(() => undefined, () => undefined);
  const tomada = await admin.rpc("ugm_cola_tomar", { p_limite: limite });
  if (tomada.error) {
    const falta = ["42883", "PGRST202", "42P01", "PGRST205"].includes(String(tomada.error.code ?? ""));
    return json({ ok: false, code: falta ? "migracion" : "interno", error: falta ? "Falta aplicar la migración 0213 (correos de UI GreenMetric)." : "No se pudo leer la cola." });
  }
  const lote = (Array.isArray(tomada.data) ? tomada.data : []) as { id?: unknown; plantilla?: unknown; valores?: unknown; correo?: unknown; nombre?: unknown }[];
  const sitio = basePublica(request.headers.get("Origin") ?? (typeof body.sitio === "string" ? body.sitio : ""), ENV("CORREOS_URL_PUBLICA"), "");
  const limpio = (v: unknown, max: number): string => texto(v, max).replace(/\{\{|\}\}/g, "").replace(/\s+/g, " ").trim();
  let enviados = 0;
  let fallidos = 0;
  for (const n of lote) {
    const id = typeof n.id === "string" ? n.id : "";
    if (!id) continue;
    // Se corta antes de que la plataforma mate la función: lo que falte vuelve a la cola sin gastar un intento.
    if (Date.now() - inicio > 90_000) {
      await admin.rpc("ugm_cola_resultado", { p_id: id, p_estado: "liberar", p_error: null }).then(() => undefined, () => undefined);
      continue;
    }
    const resultado = (estado: string, error: string | null) => admin.rpc("ugm_cola_resultado", { p_id: id, p_estado: estado, p_error: error }).then(() => undefined, () => undefined);
    const para = typeof n.correo === "string" ? n.correo.trim().toLowerCase().slice(0, 254) : "";
    const clave = typeof n.plantilla === "string" && /^c-ugm-[a-z0-9-]{1,30}$/.test(n.plantilla) ? n.plantilla : "";
    if (!clave || !correoValido(para)) {
      fallidos++;
      await resultado("error", "La fila no tiene destinatario o plantilla válidos.");
      continue;
    }
    const crudo = (n.valores && typeof n.valores === "object" ? n.valores : {}) as Record<string, unknown>;
    const valores: Record<string, string> = { modulo: "UI GreenMetric" };
    for (const [k, max] of Object.entries(VALORES_UGM)) valores[k] = limpio(crudo[k], max);
    valores.titulo_aviso = valores.indicador || "Reporte de UI GreenMetric";
    valores.detalle = [valores.indicador, valores.pregunta, valores.comentario, valores.lista].filter(Boolean).join(". ");
    // La ruta abierta al rol «consulta» es /admin/reporte-rankings (0215); la antigua de 0213 se reescribe aquí también.
    const rutaCruda = typeof crudo.ruta === "string" ? crudo.ruta.replace(/^\/admin\/rankings\//, "/admin/reporte-rankings/") : "";
    const ruta = /^\/admin\/reporte-rankings\/[a-z0-9/?=&._-]{0,80}$/i.test(rutaCruda) ? rutaCruda : "/admin/reporte-rankings/green";
    const base = sitio || "https://planeacion.udes.edu.co";
    const hash = await huella(para, ENV("SEND_EMAIL_HOOK_SECRET") || serviceKey);
    const ctx = await contextoDe(admin, hash, "");
    const plantilla = plantillaDeFila(ctx?.templates?.[clave], clave) ?? PLANTILLA_UGM_RESPALDO;
    const salida = await enviar(admin, ctx, {
      tipo: "aviso",
      plantilla,
      persona: personaDe({ correo: para, nombre: limpio(n.nombre, 120), sede: "", rol: "" }),
      rol: "administrativo",
      para,
      hash,
      enlace: `${base}${ruta}`,
      valores,
      sitio,
      accion: "ugm",
      hook: "",
      topeMs: SMTP_TOTAL_GANCHO_MS,
    });
    if (salida.ok) {
      enviados++;
      await resultado("enviado", null);
    } else if (salida.code === "tope" || salida.code === "config" || salida.http >= 500) {
      // Tope por hora, servidor sin configurar o servidor caído: se vuelve a intentar más tarde.
      fallidos++;
      await resultado("reintentar", salida.message);
    } else {
      fallidos++;
      await resultado("error", salida.message);
    }
  }
  return json({ ok: true, enviados, fallidos, pendientes: Math.max(0, lote.length - enviados - fallidos) });
}

/* --- La intranet: probar la conexión y enviar una prueba --------------------------------------- */

async function panel(request: Request, crudo: string, url: string, anonKey: string, serviceKey: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(crudo);
  } catch {
    return json({ error: "El pedido no es JSON.", code: "datos" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "El pedido no es JSON.", code: "datos" }, 400);
  const action = String(body.action ?? "");
  if (action === "codigo") return await codigoDePilo(request, body, url, serviceKey);
  if (action === "soporte") return await avisoDeSoporte(request, body, url, serviceKey);
  if (action === "gm") return await avisoDeGestionMaster(request, body, url, serviceKey);
  if (action === "ugm_cola") return await colaDeUgm(request, body, url, anonKey, serviceKey);
  if (action !== "probar" && action !== "prueba") return json({ error: "Acción desconocida.", code: "datos" }, 400);

  // Solo la administración, con su sesión.
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión.", code: "sesion" }, 401);
  const caller = cliente(url, anonKey, authorization);
  const who = await caller.auth.getUser();
  if (who.error || !who.data.user) return json({ error: "Sesión inválida.", code: "sesion" }, 401);
  const { data: profile } = await caller.from("profiles").select("role, is_active").eq("id", who.data.user.id).maybeSingle();
  if (!profile?.is_active || profile.role !== "admin") return json({ error: "Solo la administración prueba y envía correos desde aquí.", code: "permiso" }, 403);

  const admin = cliente(url, serviceKey);
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  if (action === "probar") {
    const ctx = await contextoDe(admin, "", "");
    // Se prueba lo que está escrito en la pantalla, aunque aún no se haya guardado; la contraseña es la guardada.
    const escrito = s(body.host, 200)
      ? { smtp_host: s(body.host, 200).toLowerCase(), smtp_port: Number(body.port), smtp_security: seguridadDe(body.security), smtp_user: s(body.user, 254) }
      : (ctx?.settings ?? null);
    const conexion = conexionDe(escrito, ctx?.password ?? "", variablesSmtp());
    if (conexion.origen === "ninguno") return json({ ok: false, code: "config", error: "Escriba el servidor antes de probar." });
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(conexion.host)) return json({ ok: false, code: "dns", error: "El servidor no parece una dirección válida." });
    const transporte = transporteDe(conexion);
    try {
      await conTope(SMTP_TOTAL_PANEL_MS, transporte, transporte.verify());
    } catch (error) {
      const fallo = falloSmtp(error);
      return json({ ok: false, code: fallo.codigo, error: fallo.mensaje });
    }
    const deDonde = conexion.origen === "entorno" ? " (con la conexión de respaldo de las variables de la función)" : "";
    if (!conexion.user) return json({ ok: true, message: `El servidor respondió${deDonde}. No hay usuario: no se probó ninguna contraseña.` });
    if (!conexion.pass) return json({ ok: false, code: "credenciales", error: "El servidor respondió, pero falta guardar la contraseña." });
    return json({ ok: true, message: `El servidor aceptó el usuario y la contraseña${deDonde}.` });
  }

  /* --- Enviar una prueba ------------------------------------------------------------------- */
  const para = s(body.to, 254).toLowerCase();
  if (!correoValido(para)) return json({ ok: false, code: "datos", error: "Escriba un correo completo para la prueba." });
  const clave = s(body.clave, 40);
  const hash = await huella(para, ENV("SEND_EMAIL_HOOK_SECRET") || serviceKey);
  const ctx = await contextoDe(admin, hash, "");
  // Una plantilla propia («c-…») no tiene texto original: su fila de la base es la que se prueba.
  const fila = ctx?.templates?.[clave];
  const plantilla = body.borrador ? plantillaDeBorrador(body.borrador, clave, fila) : plantillaDeFila(fila, clave);
  if (!plantilla) return json({ ok: false, code: "datos", error: "Esa plantilla no existe." });
  const rol = rolDe(body.rol);
  const ejemplo = PERSONAS_DE_EJEMPLO[rol];
  // El portal desde el que se pide: de ahí salen la cara de Pilo y el pie.
  const sitio = basePublica(request.headers.get("Origin"), ENV("CORREOS_URL_PUBLICA"), "");
  const salida = await enviar(admin, ctx, {
    tipo: "prueba",
    plantilla,
    persona: { nombre: ejemplo.nombre, correo: ejemplo.correo, sede: ejemplo.sede, rol: ejemplo.rol },
    rol,
    para,
    hash,
    // Una prueba no lleva enlace personal: el botón abre el portal. Si la plantilla es de código, lleva un código de ejemplo.
    enlace: plantilla.tipo === "codigo" ? "" : sitio || "https://planeacion.udes.edu.co",
    codigo: plantilla.tipo === "codigo" ? VALORES_DE_EJEMPLO.codigo : undefined,
    valores: VALORES_DE_EJEMPLO,
    sitio,
    accion: "prueba",
    hook: "",
    asunto: (a) => `[Prueba] ${a}`,
    topeMs: SMTP_TOTAL_PANEL_MS,
  });
  if (!salida.ok) return json({ ok: false, code: salida.code, error: salida.message });
  return json({ ok: true, message: `Prueba enviada a ${para}, como la vería ${ejemplo.nombre}.` });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  const crudo = await request.text().catch(() => "");
  // El servidor de cuentas se reconoce por sus cabeceras de firma; lo demás es la intranet.
  const esGancho = request.headers.has("webhook-signature") || request.headers.has("webhook-id") || /"email_data"\s*:/.test(crudo.slice(0, 20_000));
  if (!url || !anonKey || !serviceKey) {
    return esGancho ? errorDeGancho(500, "La función de correos no está configurada correctamente.") : json({ error: "La función no está configurada correctamente.", code: "interno" }, 500);
  }
  try {
    return esGancho ? await gancho(request, crudo, url, serviceKey) : await panel(request, crudo, url, anonKey, serviceKey);
  } catch {
    // Sin detalle: el error podría traer una dirección o un enlace.
    return esGancho ? errorDeGancho(500, "No pudimos enviarle el correo. Intente de nuevo en un momento.") : json({ error: "Algo falló al atender el pedido.", code: "interno" }, 500);
  }
});

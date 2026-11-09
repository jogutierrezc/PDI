/* =============================================================================
   Páginas de error · qué dice y cómo se ve cada código.

   Una escena por situación: día para errores de ruta y sesión, atardecer para
   accesos y pagos, tormenta para fallas del servidor y noche para el
   mantenimiento. Los textos son los de la página; la escena solo los acompaña.
   ========================================================================== */

import type { SpriteNombre } from "./sprites";

export type CodigoError = "401" | "402" | "403" | "404" | "408" | "429" | "500" | "502" | "503";
export type Clima = "day" | "dusk" | "storm" | "night";
export type Pose = "back" | "wave" | "front" | "side" | "crouch";

export interface DefinicionError {
  codigo: CodigoError;
  /** Frase corta de la franja azul sobre el código. */
  etiqueta: string;
  /** El nombre HTTP, para la ficha técnica. */
  estado: string;
  titulo: string;
  mensaje: string;
  clima: Clima;
  pose: Pose;
  /** Lo que se dibuja como estrellas en la esquina del panel. */
  deco: SpriteNombre;
  /** Lo que flota o cae alrededor de Pilo. */
  efecto: "q" | "coin" | "bolt" | "gear" | "lock";
  /** Lo que hay que saltar en el minijuego. */
  obstaculos: SpriteNombre[];
  /** Lo que dice Pilo en la burbuja. */
  frases: string[];
}

export const ERRORES: Record<CodigoError, DefinicionError> = {
  "404": {
    codigo: "404",
    etiqueta: "Página no encontrada",
    estado: "Not Found",
    titulo: "Pilo se perdió en el campus",
    mensaje:
      "No encontramos la página que buscas. Pudo cambiar de lugar o la dirección tiene un error. Vuelve al inicio o pregúntale a Pilo.",
    clima: "day",
    pose: "back",
    deco: "star",
    efecto: "q",
    obstaculos: ["cone"],
    frases: ["¿Seguro que era por aquí?", "Juraría que esta puerta estaba abierta", "Voy a preguntar en recepción"],
  },
  "402": {
    codigo: "402",
    etiqueta: "Pago requerido",
    estado: "Payment Required",
    titulo: "Esta puerta necesita una llave",
    mensaje:
      "Para ver este contenido se necesita una licencia o un pago activo. Si crees que es un error, escribe al área responsable de tu cuenta.",
    clima: "dusk",
    pose: "front",
    deco: "coin",
    efecto: "coin",
    obstaculos: ["lock"],
    frases: ["Se me cayeron las monedas…", "Revisa tu plan y vuelve", "Sin llave no abro, lo siento"],
  },
  "500": {
    codigo: "500",
    etiqueta: "Error del servidor",
    estado: "Internal Server Error",
    titulo: "Se nos cruzaron los cables",
    mensaje: "Algo falló de nuestro lado, no del tuyo. Intenta de nuevo en unos segundos; si sigue igual, avísanos.",
    clima: "storm",
    pose: "side",
    deco: "bolt",
    efecto: "bolt",
    obstaculos: ["bolt"],
    frases: ["¡Yo no fui!", "Reiniciando neuronas…", "Esto olía a chamusquina"],
  },
  "503": {
    codigo: "503",
    etiqueta: "Mantenimiento programado",
    estado: "Service Unavailable",
    titulo: "Estamos afinando el campus digital",
    mensaje: "Estamos haciendo ajustes y este portal no está disponible por ahora. Gracias por su paciencia.",
    clima: "night",
    pose: "crouch",
    deco: "gear",
    efecto: "gear",
    obstaculos: ["cone", "gear"],
    frases: ["Ajustando tuercas…", "Casi listo, lo prometo", "No toques el cable azul"],
  },
  "401": {
    codigo: "401",
    etiqueta: "Sesión requerida",
    estado: "Unauthorized",
    titulo: "Primero, identifícate",
    mensaje: "Inicia sesión con tu correo institucional para entrar a esta página.",
    clima: "day",
    pose: "wave",
    deco: "lock",
    efecto: "lock",
    obstaculos: ["lock"],
    frases: ["¡Hola! ¿Traes tu carné?", "Con tu correo UDES entras rápido"],
  },
  "403": {
    codigo: "403",
    etiqueta: "Acceso restringido",
    estado: "Forbidden",
    titulo: "Esta zona es solo para personal autorizado",
    mensaje:
      "Tu cuenta no tiene permiso para ver esta página. Si lo necesitas, pide acceso al administrador de tu unidad.",
    clima: "dusk",
    pose: "front",
    deco: "lock",
    efecto: "lock",
    obstaculos: ["lock"],
    frases: ["Aquí solo pasa personal autorizado", "Pide acceso y te abro"],
  },
  "408": {
    codigo: "408",
    etiqueta: "Tiempo agotado",
    estado: "Request Timeout",
    titulo: "La conexión tardó demasiado",
    mensaje: "No recibimos respuesta a tiempo. Revisa tu conexión a internet e intenta otra vez.",
    clima: "day",
    pose: "side",
    deco: "gear",
    efecto: "gear",
    obstaculos: ["gear"],
    frases: ["¿Hay alguien ahí?", "Tocando a la puerta…"],
  },
  "429": {
    codigo: "429",
    etiqueta: "Demasiadas solicitudes",
    estado: "Too Many Requests",
    titulo: "Vamos un poco más despacio",
    mensaje: "Hiciste muchas solicitudes en poco tiempo. Espera un momento y vuelve a intentar.",
    clima: "day",
    pose: "front",
    deco: "bolt",
    efecto: "bolt",
    obstaculos: ["bolt"],
    frases: ["Respira, que no hay afán", "Un cafecito y seguimos"],
  },
  "502": {
    codigo: "502",
    etiqueta: "Servicio sin respuesta",
    estado: "Bad Gateway",
    titulo: "Un servicio no contestó bien",
    mensaje: "Dependemos de otro sistema y hoy no respondió como esperábamos. Ya estamos en ello.",
    clima: "storm",
    pose: "side",
    deco: "gear",
    efecto: "gear",
    obstaculos: ["gear"],
    frases: ["Llamando al otro servidor…", "Nadie contesta"],
  },
};

export const CODIGOS = Object.keys(ERRORES) as CodigoError[];

export const esCodigo = (valor: string | undefined): valor is CodigoError => Boolean(valor && valor in ERRORES);

/** Con qué se tropieza Pilo, dicho para la pantalla de «fin del juego». */
export const NOMBRE_OBSTACULO: Partial<Record<SpriteNombre, string>> = {
  cone: "un cono",
  lock: "un candado",
  bolt: "un rayo",
  gear: "un engranaje",
};

/** La carpeta pública de Pilo en pixel art (public/errores). */
export const rutaPose = (pose: Pose) => `${import.meta.env.BASE_URL}errores/pilo-${pose}.png`;

/* =============================================================================
   Correos de los rankings · el diseño base (HTML en tablas con estilos en línea).

   Es el diseño del ejemplo «Observaciones en Indicador – THE Impact Rankings UDES»:
   logos arriba, un rótulo en mayúsculas, un título serif, una ficha de datos, una
   caja de observaciones, un botón y el pie institucional. Se escribe SOLO con tablas
   y estilos en línea porque así lo exigen los programas de correo (Outlook y Gmail no
   leen hojas de estilo ni flexbox), y sin scripts, formularios ni eventos: la función
   `correos` (alcance «completo», migración 0177) saneará el HTML antes de enviarlo.

   Lo usan dos cosas, con el mismo texto:
     · las plantillas c-thi-* que siembra la migración 0241 (se generan con este archivo);
     · la vista previa de la sección «Plantillas» de THE Impact.
   UI GreenMetric puede usar el mismo diseño: basta llamar a `htmlCorreoRanking` con su
   propia `marca` (sus logos y su pie). Las plantillas c-ugm-* de 0213 no cambian hasta
   que alguien las pase a este diseño desde la pantalla Correos.

   Los marcadores {{nombre}}, {{indicador}}… los sustituye la función de correos.
   ========================================================================== */

export type TonoCaja = "rojo" | "verde" | "azul" | "ambar";

export interface FilaFicha {
  /** Rótulo de la columna izquierda. */
  et: string;
  /** Valor (puede llevar marcadores {{x}} y <strong>). */
  v: string;
  /** Color del valor, si se quiere destacar (p. ej. el estado). */
  color?: string;
  /** Valor en negrita. */
  fuerte?: boolean;
}

export interface MarcaCorreo {
  /** Nombre del programa en el rótulo del pie. */
  pie1: string;
  pie2: string;
  logoUdes: string;
  logoUdesAlt: string;
  logoPrograma: string;
  logoProgramaAlt: string;
}

/** La marca de THE Impact: los logos del ejemplo aprobado (no se inventan direcciones nuevas). */
export const MARCA_THE: MarcaCorreo = {
  pie1: "Universidad de Santander — UDES Sostenible",
  pie2: "Gestión de Rankings y Métricas Institucionales &bull; Notificación Oficial del Sistema",
  logoUdes: "https://udes.edu.co/images/logo/udes-logo-principal.svg",
  logoUdesAlt: "Universidad de Santander",
  logoPrograma: "https://qiu.edu.my/cri/wp-content/uploads/2023/02/theimpactranking.png",
  logoProgramaAlt: "THE Impact Rankings",
};

export interface CorreoRanking {
  /** Rótulo en mayúsculas sobre el título, p. ej. «UDES Sostenible • Solicitud de Ajustes». */
  kicker: string;
  /** Color del rótulo, de la caja destacada y de la barra del botón (hex). */
  acento: string;
  titulo: string;
  /** Primer párrafo tras el saludo (admite <strong>). */
  intro: string;
  filas: FilaFicha[];
  caja?: { rotulo: string; texto: string; tono: TonoCaja; cursiva?: boolean };
  boton: string;
  /** Línea pequeña bajo el botón. */
  cierre?: string;
  marca?: MarcaCorreo;
}

const TONOS: Record<TonoCaja, { fondo: string; borde: string; barra: string; rotulo: string; texto: string }> = {
  rojo: { fondo: "#fef2f2", borde: "#fecaca", barra: "#dc2626", rotulo: "#991b1b", texto: "#7f1d1d" },
  verde: { fondo: "#f0fdf4", borde: "#bbf7d0", barra: "#16a34a", rotulo: "#166534", texto: "#14532d" },
  azul: { fondo: "#eff6ff", borde: "#bfdbfe", barra: "#1b52ad", rotulo: "#1e3a8a", texto: "#1e3a8a" },
  ambar: { fondo: "#fffbeb", borde: "#fde68a", barra: "#d97706", rotulo: "#92400e", texto: "#78350f" },
};

const FUENTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const AZUL_UDES = "#0a2d63";

/** El HTML completo del correo (alcance «completo» de la plantilla). */
export function htmlCorreoRanking(c: CorreoRanking): string {
  const m = c.marca ?? MARCA_THE;
  const filas = c.filas
    .map((f, i) => {
      const ultima = i === c.filas.length - 1;
      const borde = ultima ? "" : " border-bottom: 1px solid #edf2f7;";
      return `                <tr>
                  <td style="padding: 16px 20px;${borde} width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">${f.et}</td>
                  <td style="padding: 16px 20px;${borde} font-size: 14px; font-weight: ${f.fuerte ? 700 : 500}; color: ${f.color ?? "#0f172a"};">${f.v}</td>
                </tr>`;
    })
    .join("\n");
  const ficha = c.filas.length
    ? `              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
${filas}
              </table>`
    : "";
  const t = c.caja ? TONOS[c.caja.tono] : null;
  const caja = c.caja && t
    ? `              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${t.fondo}; border: 1px solid ${t.borde}; border-left: 4px solid ${t.barra}; border-radius: 6px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${t.rotulo};">${c.caja.rotulo}</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6;${c.caja.cursiva ? " font-style: italic;" : ""} color: ${t.texto};">${c.caja.texto}</p>
                  </td>
                </tr>
              </table>`
    : "";
  const cierre = c.cierre
    ? `              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">${c.cierre}</p>`
    : "";
  return `<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: ${FUENTE}; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f6f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #edf2f7;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle" style="width: 50%;">
                    <img src="${m.logoUdes}" alt="${m.logoUdesAlt}" height="42" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                  <td align="right" valign="middle" style="width: 50%;">
                    <img src="${m.logoPrograma}" alt="${m.logoProgramaAlt}" height="38" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${c.acento};">${c.kicker}</p>
              <h1 style="margin: 0 0 20px 0; font-family: ${SERIF}; font-size: 24px; line-height: 1.3; font-weight: 700; color: ${AZUL_UDES};">${c.titulo}</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Estimado(a) <strong>{{nombre}}</strong>,</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">${c.intro}</p>
${ficha}
${caja}
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: ${AZUL_UDES};">
                    <a href="{{enlace}}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: ${FUENTE}; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.02em;">${c.boton}</a>
                  </td>
                </tr>
              </table>
${cierre}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #edf2f7; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #334155;">${m.pie1}</p>
              <p style="margin: 0; font-size: 11px; line-height: 1.4; color: #94a3b8;">${m.pie2}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>`;
}

/* --- Las seis plantillas de THE Impact (una por evento del flujo) -------------------------------- */

export interface PlantillaCorreo {
  clave: string;
  nombre: string;
  /** Cuándo sale (texto de la pantalla Correos, máx. 120 caracteres). */
  cuando: string;
  asunto: string;
  previa: string;
  titulo: string;
  saludo: string;
  /** Texto de respaldo por campos (el HTML manda; sirve si se vuelve al modo sin HTML). */
  mensaje: string;
  boton: string;
  nota: string;
  orden: number;
  /** Para quién es: quien responde o la administración. */
  destino: "oficina" | "administracion";
  correo: CorreoRanking;
}

const ROJO = "#dc2626";
const VERDE = "#16a34a";
const AZUL = "#1b52ad";
const AMBAR = "#b45309";

const F_ODS: FilaFicha = { et: "ODS", v: "{{categoria}}" };
const F_IND: FilaFicha = { et: "Indicador", v: "{{indicador}}", fuerte: true, color: AZUL_UDES };
const F_PREG: FilaFicha = { et: "Pregunta de THE", v: "{{pregunta}}" };
const F_OFI: FilaFicha = { et: "Oficina", v: "{{oficina}}" };
const F_VENCE: FilaFicha = { et: "Fecha límite", v: "{{fecha_limite}}" };

export const PLANTILLAS_THI: PlantillaCorreo[] = [
  {
    clave: "c-thi-asignacion",
    nombre: "Le asignaron un indicador",
    cuando: "Al asignar un indicador a una oficina (con el ciclo abierto)",
    asunto: "Le asignaron {{indicador}} del reporte de THE Impact",
    previa: "Fecha límite: {{fecha_limite}}",
    titulo: "Le asignaron {{indicador}}",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Planeación asignó a su oficina ({{oficina}}) el indicador {{indicador}} del reporte de THE Impact, {{categoria}}.\nPregunta de THE: {{pregunta}}.\nFecha límite: {{fecha_limite}}.",
    boton: "Abrir el indicador",
    nota: "Si no le corresponde, avise a Planeación para reasignarlo.",
    orden: 410,
    destino: "oficina",
    correo: {
      kicker: "UDES Sostenible &bull; Nueva asignación",
      acento: AZUL,
      titulo: "Indicador asignado a su oficina",
      intro: "Planeación Institucional asignó a su oficina un indicador del reporte de <strong>THE Impact Rankings</strong>. Estos son sus datos:",
      filas: [F_ODS, F_IND, F_PREG, F_OFI, F_VENCE],
      caja: { rotulo: "Qué se espera de la oficina", texto: "Responda con el dato o el sí/no que pide THE, agregue una evidencia (mejor un enlace público) y envíe el indicador a revisión antes de la fecha límite.", tono: "azul" },
      boton: "Abrir el indicador &rarr;",
      cierre: "Si el indicador no le corresponde, avise a Planeación para reasignarlo.",
    },
  },
  {
    clave: "c-thi-recordatorio",
    nombre: "Indicadores por entregar",
    cuando: "Recordatorio por persona: 7, 3 y 1 día antes y el día del vencimiento",
    asunto: "THE Impact: {{cantidad}} por entregar, el primero {{dias}}",
    previa: "El primero vence el {{fecha_limite}}",
    titulo: "Tiene {{cantidad}} por entregar",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Estos indicadores del reporte de THE Impact siguen abiertos: {{lista}}.\nEl primero en vencer es el del {{fecha_limite}} ({{dias}}).",
    boton: "Abrir mis indicadores",
    nota: "Un indicador enviado a revisión deja de aparecer aquí.",
    orden: 411,
    destino: "oficina",
    correo: {
      kicker: "UDES Sostenible &bull; Recordatorio",
      acento: AMBAR,
      titulo: "Indicadores por entregar",
      intro: "Su oficina tiene <strong>{{cantidad}}</strong> del reporte de <strong>THE Impact Rankings</strong> sin enviar a revisión.",
      filas: [{ et: "Primer vencimiento", v: "{{fecha_limite}}", fuerte: true, color: AMBAR }, { et: "Plazo", v: "{{dias}}" }],
      caja: { rotulo: "Pendientes", texto: "{{lista}}", tono: "ambar" },
      boton: "Abrir mis indicadores &rarr;",
      cierre: "Un indicador enviado a revisión deja de aparecer en este recordatorio.",
    },
  },
  {
    clave: "c-thi-enviado",
    nombre: "Se presentó un indicador",
    cuando: "Cuando una oficina envía un indicador a revisión",
    asunto: "Se presentó {{indicador}}: pendiente de revisión",
    previa: "{{oficina}} espera su revisión",
    titulo: "{{indicador}} espera revisión",
    saludo: "Hola, {{nombre}}.",
    mensaje: "{{autor}} ({{oficina}}) envió {{pregunta}} ({{indicador}}) para revisión, con {{cantidad}}.\n{{categoria}}.",
    boton: "Revisar ahora",
    nota: "",
    orden: 412,
    destino: "administracion",
    correo: {
      kicker: "UDES Sostenible &bull; Pendiente de revisión",
      acento: AZUL,
      titulo: "Un indicador espera su revisión",
      intro: "<strong>{{autor}}</strong> envió un indicador del reporte de <strong>THE Impact Rankings</strong> para su revisión técnica:",
      filas: [F_ODS, F_IND, F_PREG, F_OFI, { et: "Evidencias", v: "{{cantidad}}" }, { et: "Estado del registro", v: "En revisión", fuerte: true, color: AZUL }],
      boton: "Revisar ahora &rarr;",
      cierre: "Puede aprobarlo o devolverlo con observaciones desde la misma pantalla.",
    },
  },
  {
    clave: "c-thi-devuelto",
    nombre: "Un indicador volvió con observaciones",
    cuando: "Cuando Planeación devuelve una respuesta con observaciones",
    asunto: "{{indicador}} volvió con observaciones",
    previa: "Hay que corregirlo antes del {{fecha_limite}}",
    titulo: "{{indicador}} volvió con observaciones",
    saludo: "Hola, {{nombre}}.",
    mensaje: "{{revisor}} devolvió {{pregunta}} ({{indicador}}).\nObservaciones: «{{comentario}}»\nCorríjalo y envíelo de nuevo.",
    boton: "Atender observaciones y reenviar",
    nota: "",
    orden: 413,
    destino: "oficina",
    correo: {
      kicker: "UDES Sostenible &bull; Solicitud de Ajustes",
      acento: ROJO,
      titulo: "Indicador devuelto con observaciones",
      intro: "Tras la revisión técnica del indicador <strong>{{indicador}}</strong> para el reporte <strong>THE Impact Rankings</strong>, se han formulado observaciones que requieren su intervención antes de proceder con la aprobación definitiva:",
      filas: [
        { et: "Pregunta / Código", v: "{{pregunta}}", fuerte: true, color: AZUL_UDES },
        { et: "Indicador", v: "{{indicador}}" },
        { et: "Revisado por", v: "{{revisor}}" },
        { et: "Estado del registro", v: "Requiere corrección", fuerte: true, color: ROJO },
      ],
      caja: { rotulo: "Observaciones del evaluador:", texto: "«{{comentario}}»", tono: "rojo", cursiva: true },
      boton: "Atender observaciones y reenviar &rarr;",
      cierre: "Una vez aplicados los ajustes en la plataforma, remita nuevamente el indicador para dar continuidad al flujo de validación.",
    },
  },
  {
    clave: "c-thi-aprobado",
    nombre: "Aprobaron un indicador",
    cuando: "Cuando Planeación aprueba una respuesta",
    asunto: "Aprobaron {{indicador}}",
    previa: "{{indicador}} quedó aprobado",
    titulo: "{{indicador}} quedó aprobado",
    saludo: "Hola, {{nombre}}.",
    mensaje: "{{revisor}} aprobó {{pregunta}} ({{indicador}}).\nYa no se puede editar. Si hace falta un cambio, pida a Planeación que lo reabra.",
    boton: "Ver el indicador",
    nota: "",
    orden: 414,
    destino: "oficina",
    correo: {
      kicker: "UDES Sostenible &bull; Indicador aprobado",
      acento: VERDE,
      titulo: "Indicador aprobado",
      intro: "El indicador <strong>{{indicador}}</strong> del reporte de <strong>THE Impact Rankings</strong> superó la revisión técnica. Gracias por el trabajo de su oficina.",
      filas: [F_ODS, F_IND, F_PREG, { et: "Aprobado por", v: "{{revisor}}" }, { et: "Estado del registro", v: "Aprobado", fuerte: true, color: "#15803d" }],
      caja: { rotulo: "Siguiente paso", texto: "Planeación lo incluye en la lista de entrega a THE cuando la evidencia esté completa.", tono: "verde" },
      boton: "Ver el indicador &rarr;",
      cierre: "El indicador ya no se puede editar. Si hace falta un cambio, pida a Planeación que lo reabra.",
    },
  },
  {
    clave: "c-thi-resumen",
    nombre: "Resumen semanal del reporte",
    cuando: "Una vez por semana, a quien administra el ranking",
    asunto: "THE Impact: resumen semanal",
    previa: "Estado del reporte esta semana",
    titulo: "Resumen semanal",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Estado del reporte de THE Impact: {{lista}}.",
    boton: "Abrir el tablero",
    nota: "",
    orden: 415,
    destino: "administracion",
    correo: {
      kicker: "UDES Sostenible &bull; Resumen semanal",
      acento: AZUL,
      titulo: "Así va el reporte de THE Impact",
      intro: "Este es el estado del reporte de <strong>THE Impact Rankings</strong> al comenzar la semana:",
      filas: [],
      caja: { rotulo: "Estado del ciclo", texto: "{{lista}}", tono: "azul" },
      boton: "Abrir el tablero &rarr;",
      cierre: "Se envía una vez por semana mientras el ciclo esté abierto.",
    },
  },
];

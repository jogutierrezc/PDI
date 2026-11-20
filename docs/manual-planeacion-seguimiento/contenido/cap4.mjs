import { h2, lead, p, ticket, pilo, shot, steps, tbl, list, q, rt, st } from "../lib.mjs";
export default {
  n: 4, nombre: "Colaborador", ruta: "/mis-tareas", portada: "Colaborador",
  desc: "Qué hacer cuando le asignan una actividad: abrirla, reportar el avance con evidencias y esperar la revisión.",
  blocks: [
    lead("Su trabajo en el módulo es corto: mirar lo que tiene asignado, reportar cuánto lleva y avisar si hay un riesgo. El gestor de su oficina valida el avance. Nadie da por bueno su propio reporte."),
    h2("Mis tareas", "mis-tareas"),
    p(`Cuando le asignan una actividad llega un correo con un botón que abre la actividad. También puede entrar por ${q("Mis tareas")}. La pantalla agrupa lo suyo según el tiempo que queda.`),
    shot({ f: "mis-tareas", url: "/admin/planeacion-seguimiento/mis-tareas", alt: "Mis tareas con avances devueltos, vencidas y próximas", maxh: 520 }),
    steps([
      ["Avances devueltos", "Arriba aparece lo que el gestor le pidió corregir, con su nota. Léala y reporte el avance de nuevo."],
      ["Vencidas", "Las actividades que pasaron su fecha límite y no están hechas. Dicen cuántos días llevan vencidas."],
      ["Próximas (14 días)", "Lo que vence en las dos próximas semanas. Más abajo siguen «Más adelante» y «Hechas»."],
    ], { c: true }),
    p(`En cada actividad vea el estado, la prioridad, la lista de chequeo y el avance validado. Puede marcar los pasos de la lista de chequeo de lo que tiene asignado. ${q("Mover a…")} le deja pasar la actividad entre «Por iniciar», «En curso», «En riesgo» y «En revisión». No puede pasarla a «Hecho»: eso lo decide el gestor al validar.`),
    pilo("feliz", "Si una actividad ya tiene un avance esperando revisión, espere a que el gestor lo valide o lo devuelva antes de moverla."),
    h2("Reportar un avance", "reportar"),
    p(`Para reportar, abra la actividad y pulse ${q("Reportar avance")}, o mueva la tarjeta a ${q("En revisión")}. Se abre una página de cuatro pasos. Lo que escribe se guarda en su equipo mientras avanza.`),
    shot({ f: "rep-que", url: "/admin/planeacion-seguimiento/reportar/…", alt: "Primer paso del reporte de avance: porcentaje físico, fecha y nota", maxh: 520 }),
    steps([
      ["Qué avanzó", "Marque el avance físico de 0 a 100 %: cuánto del trabajo está hecho. Use la barra o los botones −5, +5, 25, 50, 75 y 100. Si la actividad tiene ejecución de dinero, marque la casilla del avance financiero y escríbalo. Elija la fecha del avance (no puede ser futura) y cuente qué se hizo desde el último reporte, con al menos 10 caracteres."],
      ["Evidencias", "Adjunte lo que respalda el avance: archivos (PDF, Word, Excel, PowerPoint, PNG, JPG, CSV, TXT o ZIP, de hasta 20 MB) o enlaces que empiecen por http:// o https://. Son opcionales, pero el gestor valida con más confianza si las ve. Hasta 10."],
    ]),
    shot({ f: "rep-evid", url: "/admin/planeacion-seguimiento/reportar/…", alt: "Segundo paso: evidencias como archivos o enlaces", maxh: 440 }),
    steps([
      ["Riesgos", "Si algo puede retrasar o impedir la actividad, descríbalo y elija su nivel. El riesgo se registra junto con el avance."],
      ["Revisar y enviar", `Lea el resumen de lo que verá el gestor y quién lo revisa. Pulse ${q("Enviar el avance al gestor")}. Aún no se ha enviado nada hasta ese botón.`],
    ], { start: 3 }),
    shot({ f: "rep-revisar", url: "/admin/planeacion-seguimiento/reportar/…", alt: "Último paso: resumen del avance y quién lo revisa", maxh: 500 }),
    ticket("Reglas del porcentaje", "El avance físico no puede ser menor que el del último avance validado de la actividad. Solo puede haber un avance pendiente por actividad a la vez. Si la actividad ya está «Hecha», no se reporta."),
    h2("Qué pasa después de enviar", "despues"),
    tbl(["Momento", "Qué ocurre", "Qué ve usted"], [
      ["Al enviar", "El avance queda «Por validar». La actividad pasa a «En revisión». El gestor recibe un correo.", st("pe", "Por validar")],
      ["Si el gestor valida", "El avance pasa a ser el vigente. Si llegó a 100 %, la actividad queda «Hecha»; si no, vuelve a «En curso» (o sigue «En riesgo» con un riesgo Crítico o Alto abierto). Usted recibe un correo.", st("ok", "Validado")],
      ["Si el gestor devuelve", "El avance queda «Devuelto» con una nota de al menos 20 caracteres. La actividad vuelve a «En curso». Usted recibe un correo con la nota.", st("ri", "Devuelto")],
      ["Si pasan 72 horas", "El avance se marca con plazo vencido y el gestor recibe un recordatorio. Usted no tiene que hacer nada.", st("ne", "Plazo vencido")],
    ], "fix", ["22%", "58%", "20%"]),
    pilo("excelente", "Cuando un avance se valida al 100 %, la actividad queda «Hecha» y avisamos al gestor y a las personas asignadas."),
    h2("En el teléfono", "movil"),
    p("Las pantallas se adaptan al celular: las listas se vuelven tarjetas, el pie con los botones queda fijo y «Mover a…» reemplaza al arrastre. El reporte de avance funciona igual que en el computador."),
    shot({ f: "movil-tareas", url: "/admin/planeacion-seguimiento/mis-tareas", alt: "Mis tareas en un teléfono de 390 píxeles de ancho", w: 250, maxh: 640 }),
  ],
};

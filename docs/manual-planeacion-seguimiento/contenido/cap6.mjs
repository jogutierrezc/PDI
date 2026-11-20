import { h2, lead, p, ticket, pilo, tbl, list, q, rt, st } from "../lib.mjs";
export default {
  n: 6, nombre: "Correos", ruta: "/avisos",
  desc: "El módulo avisa por correo institucional. Esta tabla dice quién recibe cada aviso y en qué momento.",
  blocks: [
    lead("Los correos los envía el servidor, no la pantalla, y salen al correo institucional de cada persona. La pantalla «Cómo te avisamos» explica los mismos avisos, con los plazos de su oficina."),
    p("Cuando usted asigna, transfiere, devuelve o cierra, la pantalla le dice antes a quién se le va a avisar. Si lo hace desde una pantalla que no avisa, no sale ningún correo."),
    h2("Avisos de las actividades", "avisos-actividades"),
    tbl(["Aviso", "A quién llega", "Cuándo sale"], [
      ["Le asignaron una actividad", "A la persona que la recibe. No a quien asigna.", "Al asignar, al crear con responsable, en la asignación masiva y al importar por Excel."],
      ["Una actividad está por vencer", "A las personas asignadas; si no hay, a los gestores.", "7 días antes, 3 días antes y el mismo día de la fecha límite (los plazos de la oficina). Solo si no está hecha, y sin repetirse el mismo día."],
      ["Una actividad venció", "A las personas asignadas; copia al gestor.", "Cada día después de la fecha límite, hasta 3 avisos. El gestor recibe copia una vez, pasado el plazo de su oficina (la base parte de 24 horas; «Cómo te avisamos» muestra el vigente)."],
      ["Le pasaron o le quitaron una actividad", "A quien recibe, a quien cede y, en copia, a los gestores.", "Al transferir. Incluye el motivo, de al menos 20 caracteres."],
      ["Reportaron un avance", "A los gestores de la oficina, menos al autor.", "Cuando un colaborador (o un gestor) reporta. Dice quién, de qué actividad y cuánto avanzó."],
      ["Hay avances esperando su revisión", "Al gestor, un aviso por oficina.", "Cuando un avance pasa 72 horas sin revisar (plazo de la oficina), una sola vez por conjunto de avances."],
      ["Validaron su avance", "A quien lo reportó.", "Cuando el gestor lo valida. Dice cuánto quedó validado."],
      ["Le devolvieron un avance o una actividad", "A quien lo reportó o a los responsables.", "Cuando se devuelve. Incluye la nota, de al menos 20 caracteres."],
      ["Una actividad se cumplió", "A los gestores y a las personas asignadas, menos a quien la cerró.", "Cuando pasa a «Hecho», por un avance validado al 100 % o por cierre administrativo."],
    ], "fix", ["27%", "27%", "46%"]),
    h2("Avisos de la VAF", "avisos-vaf"),
    tbl(["Aviso", "A quién llega", "Cuándo sale"], [
      ["Un plan espera evaluación financiera", "A los miembros de la unidad VAF con nivel Financiero o Administrador.", "Al publicarse una versión: la primera, o una con montos distintos de la anterior."],
      ["La VAF evaluó el plan", "A los gestores de la oficina dueña y a quien creó el plan.", "Cuando la VAF registra el resultado de la evaluación."],
      ["Alerta de ejecución", "Al equipo de la VAF.", "Alertas urgentes y de atención: una vez por semana por plan y destinatario."],
    ], "fix", ["27%", "27%", "46%"]),
    ticket("Si un aviso no llega", `Revise la carpeta de correo no deseado y que su correo en Usuarios sea el institucional. Quien no tiene correo, o tiene la cuenta inactiva, no recibe avisos. Un aviso que falla se reintenta hasta 3 veces.`),
    pilo("idea", "Los plazos de cada oficina se cambian en «Cómo te avisamos». Un aviso de vencimiento nunca se repite el mismo día."),
    h2("Qué dice el correo", "contenido-correo"),
    p("Cada correo trae el título del aviso y el detalle de la actividad: la actividad, la línea del plan, la oficina, la fecha límite, el estado y quién hizo el cambio. Un botón lleva a la actividad dentro de la intranet, en Mis tareas. Los textos de las plantillas se editan en la pantalla Correos de la intranet, en el grupo «Planeación y Seguimiento»."),
  ],
};

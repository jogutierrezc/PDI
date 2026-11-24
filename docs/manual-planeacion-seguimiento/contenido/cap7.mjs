import { h2, lead, p, ticket, pilo, tbl, list, q, rt, st, flujo, raw } from "../lib.mjs";
const estados = [["Por iniciar", "az", "Aún no se empieza."], ["En curso", "az", "Se está trabajando en ella."], ["En riesgo", "ri", "Puede no cumplirse a tiempo."], ["En revisión", "pe", "El colaborador terminó y espera al gestor."], ["Hecho", "ok", "El gestor la dio por cumplida."]];
export default {
  n: 7, nombre: "Flujos completos", ruta: "/flujos",
  desc: "Un plan recorre todo el módulo, desde su creación hasta que se mide cuánto se avanzó y cuánto se ejecutó.",
  blocks: [
    lead("Este ejemplo sigue un plan de una oficina durante varios meses. Los nombres y las fechas son inventados; los pasos son los reales."),
    h2("De un plan a la ejecución", "plan-a-ejecucion"),
    flujo([
      [1, "Administrador", `Crea el plan «Plan de Tecnología 2027-2029» con ${q("Crear un plan")}: nombre, años, oficina dueña (Tecnología e Infraestructura TI), alcance «De una oficina», plantilla y pilares. (Capítulo 2)`],
      [2, "Administrador", `Arma los proyectos en ${q("Proyectos del plan")} con ${q("Agregar proyecto")}, o descarga la plantilla de Excel y los carga de una vez. Ambos caminos validan igual.`],
      [3, "Administrador", `Pulsa ${q("Enviar a evaluación VAF / Publicar versión")}. La versión ${q("v1.0")} queda publicada y vigente, y se abre la evaluación de la VAF.`],
      [4, "Administrador", `En ${q("Asignar oficinas")} reparte los proyectos entre las oficinas, en lote o uno por uno. Un proyecto sin oficina no recibe actividades. (Capítulo 2)`],
      [5, "VAF", `Recibe un correo. En ${q("Por evaluar")} decide la evaluación del plan y, en cada proyecto, ${q("Evaluar proyecto")}: aprueba con criterios, fechas, distribución y monto, o rechaza con una nota. Las oficinas no esperan. (Capítulo 5)`],
      [6, "Gestor", `Crea las actividades de cada proyecto de su oficina (o aporta a uno de otra, y ese gestor recibe un aviso), conectadas con el PDI o «sin conexión». Las asigna al equipo. (Capítulo 3)`],
      [7, "Colaborador", `Recibe un correo, mueve la actividad a ${q("En curso")} y reporta un avance: 60 % físico, una nota y un acta como evidencia. La actividad pasa a ${q("En revisión")}. (Capítulo 4)`],
      [8, "Gestor", `Recibe el correo. Abre ${q("Por validar")}, revisa la evidencia y valida el avance. La actividad vuelve a «En curso» con 60 % validado.`],
      [9, "Colaborador", "Reporta el avance final, 100 %. El gestor lo valida y la actividad queda «Hecha». Ambos reciben un correo."],
      [10, "VAF", `Registra en el libro de la línea lo comprometido y lo ejecutado del mes. En ${q("Solicitado vs aprobado")} y en ${q("Presupuesto")} ve lo pedido, lo aprobado y la desviación frente al avance físico.`],
      [11, "Administrador", `Revisa ${q("Todos los planes")}: avance validado, oficinas con vencidas y alertas. Sigue con el plan siguiente.`],
    ]),
    h2("Qué pasa cuando algo se tuerce", "desvios"),
    flujo([
      [1, "Gestor", `Un avance llega con poca evidencia. Pulsa ${q("Devolver con una nota…")} y escribe qué falta (mínimo 20 caracteres).`],
      [2, "Colaborador", `Recibe el correo. En ${q("Mis tareas")} lee la nota arriba, en «Avances devueltos», y reporta de nuevo.`],
      [3, "Gestor", `Una actividad vence. La persona asignada recibe avisos diarios, hasta tres; el gestor recibe copia. Se mueve la fecha con ${q("Editar")} o se cierra a mano con ${q("Cerrar la actividad")}.`],
      [4, "VAF", `La línea 2 ejecutó más de lo aprobado. La alerta urgente «Sobreejecución» llega a la VAF y queda en la pestaña ${q("Alertas")}.`],
    ]),
    h2("Los cinco estados de una actividad", "estados-actividad"),
    raw(`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;text-align:center">${estados.map(([n, k, d]) => `<div style="border:1px solid var(--line);border-radius:6px;padding:10px 6px;background:var(--page)"><div>${st(k, n)}</div><div class="cap" style="margin-top:6px">${d}</div></div>`).join("")}</div>`),
    tbl(["Movimiento", "Quién lo hace", "Qué ocurre"], [
      ["A «En revisión»", "Colaborador asignado y gestor", "Abre el reporte de avance. El gestor recibe un correo."],
      ["De «En revisión» a otro estado", "Gestor", "Es devolver. Pide nota de al menos 20 caracteres y avisa."],
      ["A «Hecho»", "Solo el gestor", "Valida el avance pendiente de otra persona, o abre el cierre administrativo."],
    ], "fix", ["32%", "26%", "42%"]),
  ],
};

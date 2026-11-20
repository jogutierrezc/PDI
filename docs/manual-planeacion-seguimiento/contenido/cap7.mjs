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
      [2, "Administrador", `Descarga la plantilla, la llena con las líneas, corrige los errores por fila y crea la versión borrador ${q("v1.0")}. (Capítulo 2)`],
      [3, "Administrador", `Revisa el borrador en ${q("Versiones")} y pulsa ${q("Publicar v1.0")}. La versión queda congelada y vigente.`],
      [4, "VAF", `Recibe un correo: hay un plan por evaluar. En ${q("Por evaluar")} abre la ficha y decide: aprobada, con ajustes o no viable. Las oficinas no esperan. (Capítulo 5)`],
      [5, "Gestor", `Crea las actividades de cada línea, conectadas con el PDI o «sin conexión», o las importa por Excel. Las asigna al equipo. (Capítulo 3)`],
      [6, "Colaborador", `Recibe un correo, abre la actividad y la mueve a ${q("En curso")}. Marca los pasos de su checklist.`],
      [7, "Colaborador", `Reporta un avance: 60 % físico, una nota y un acta como evidencia. La actividad pasa a ${q("En revisión")}. (Capítulo 4)`],
      [8, "Gestor", `Recibe el correo. Abre ${q("Por validar")}, revisa la evidencia y valida el avance. La actividad vuelve a «En curso» con 60 % validado.`],
      [9, "Colaborador", "Reporta el avance final, 100 %. El gestor lo valida y la actividad queda «Hecha». Ambos reciben un correo."],
      [10, "VAF", `Registra en el libro de la línea lo aprobado, lo comprometido y lo ejecutado del mes. La pestaña ${q("Presupuesto")} calcula la ejecución y la desviación frente al avance físico.`],
      [11, "Administrador", `Revisa ${q("Todos los planes")}: avance validado, oficinas con vencidas y alertas. Sigue con el plan siguiente.`],
    ]),
    h2("Qué pasa cuando algo se tuerce", "desvios"),
    flujo([
      [1, "Gestor", `Un avance llega con poca evidencia. Pulsa ${q("Devolver con una nota…")} y escribe qué falta (mínimo 20 caracteres).`],
      [2, "Colaborador", `Recibe el correo. En ${q("Mis tareas")} lee la nota arriba, en «Avances devueltos», y reporta de nuevo.`],
      [3, "Gestor", `Una persona del equipo sale de vacaciones. Con ${q("Transferir…")} pasa su actividad a otra, con el motivo. Las dos reciben un correo.`],
      [4, "Gestor", `Una actividad vence. La persona asignada recibe avisos diarios, hasta tres; el gestor recibe copia. Se mueve la fecha con ${q("Editar")} o se cierra a mano con ${q("Cerrar la actividad")}.`],
      [5, "VAF", `La línea 2 ejecutó más de lo aprobado. La alerta urgente «Sobreejecución» llega a la VAF y queda en la pestaña ${q("Alertas")}.`],
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

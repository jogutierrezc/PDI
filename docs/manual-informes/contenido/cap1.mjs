import { h2, lead, p, ticket, pilo, shot, steps, tbl, q, rt, st, rolcard, cols, flujo } from "../lib.mjs";
export default {
  n: 1, nombre: "Papeles y estados", ruta: "/admin/informes-gestion", portada: "Papeles y estados",
  desc: "Quién puede hacer qué en cada informe, cómo se obtiene cada papel y por qué estados pasa un informe.",
  blocks: [
    lead("Cada persona tiene un papel por unidad. El papel decide qué botones ve y qué puede guardar. La base de datos vuelve a comprobarlo, de modo que una pantalla abierta de más no abre permisos."),
    h2("Los cuatro papeles", "papeles"),
    tbl(["Papel", "Diligencia", "Envía", "Ve las demás unidades", "Cambia la estructura"], [
      ["Administrador (Planeación)", "Solo lee, salvo en su propia unidad", st("ok", "Sí") + " si es de la unidad", st("ok", "Sí") + ", en lectura", st("ok", "Sí")],
      ["Gestor (jefe de unidad)", st("ok", "Sí"), st("ok", "Sí"), st("ne", "No"), st("ne", "No")],
      ["Contribuyente (editor)", st("ok", "Sí"), st("ne", "No"), st("ne", "No"), st("ne", "No")],
      ["Consulta (visor)", st("ne", "No"), st("ne", "No"), st("ne", "No"), st("ne", "No")],
    ], "fix", ["27%", "21%", "18%", "20%", "14%"]),
    p(`Hay una diferencia más entre Gestor y Contribuyente: el color de acento, el monograma, el escudo, el contacto y la línea del pie de la oficina solo los cambia el Gestor. El Contribuyente puede cambiar la composición de la portada, los textos, la imagen, las firmas y los créditos.`),
    h2("Cómo se obtiene un papel", "obtener"),
    cols(
      `<div class="h3">Por la unidad</div><p>Planeación asigna a la persona como Gestor, Contribuyente o Consulta desde ${q("Responsables")} en el Tablero. Es la forma habitual y se ve en la fila de la unidad.</p>`,
      `<div class="h3">Por un rol de acceso</div><p>En <b>Usuarios y roles</b>, el módulo «Informes de gestión» en «Ver» permite elegir «Quién hace el informe»: «Solo el de su unidad», «Diligencia» o «Diligencia y envía». Se elige el alcance: toda la estructura o unidades concretas.</p>`,
    ),
    ticket("Dos reglas que sorprenden", `Un rol que no marca la pantalla ${q("informes")} cierra el módulo aunque la persona pertenezca a una unidad. Y quien tiene «Editar» en «Informes de gestión» gestiona los informes de todas las unidades, así que ese nivel se reserva para Planeación.`),
    h2("Los estados de un informe", "estados"),
    p("Un informe pasa por cuatro estados. Cada uno lleva símbolo y palabra, nunca solo color."),
    tbl(["Estado", "Qué significa", "Quién puede editar"], [
      [st("pe", "Borrador"), "Se está escribiendo. Las cifras se leen en vivo.", "Gestor y Contribuyente"],
      [st("az", "Enviado"), "Solo se ve en informes anteriores a la regla actual: hoy el envío aprueba en el mismo paso.", "Nadie"],
      [st("ok", "Aprobado"), "El Gestor lo envió. Las cifras quedaron congeladas con su foto.", "Nadie"],
      [st("ri", "Devuelto"), "Planeación o la unidad destino lo devolvieron con una nota. Las cifras vuelven a ser vivas.", "Gestor y Contribuyente"],
    ], "fix", ["18%", "54%", "28%"]),
    flujo([
      ["1", "Gestor", `Pulsa ${q("Enviar")}. El informe pasa de borrador a aprobado en una sola operación y se toma la foto de las cifras.`],
      ["2", "Planeación o unidad destino", `Puede devolverlo con ${q("Devolver con nota")}. La nota es obligatoria.`],
      ["3", "Gestor o Contribuyente", "Corrige. Al guardar cualquier cambio, el informe vuelve a ser borrador."],
      ["4", "Gestor", "Envía de nuevo. Se toma una foto nueva."],
    ]),
    pilo("idea", "Enviar y aprobar es el mismo paso. Si usted es Gestor, revise bien antes de pulsar el botón: después solo Planeación o la unidad destino pueden reabrirlo."),
    h2("Qué ve cada papel en cada estado", "ve"),
    tbl(["Estado", "Gestor", "Contribuyente", "Consulta"], [
      ["Sin abrir", "«Planeación todavía no abre el informe de su unidad»", "Lo mismo", "Lo mismo"],
      ["Borrador", "Edita y envía cuando todo está listo", "Edita; «Enviar» deshabilitado", "Lee"],
      ["Devuelto", "Ve la nota, edita y reenvía", "Ve la nota y edita", "Lee y ve la nota"],
      ["Aprobado", "Lee; botón «Enviado» deshabilitado", "Lee", "Lee"],
    ], "fix", ["16%", "34%", "28%", "22%"]),
    p(`Para que una unidad pueda abrir, guardar o enviar, el ciclo debe estar ${q("Abierto")}. Con el ciclo en preparación o cerrado, la base rechaza el guardado y la pantalla muestra un mensaje que habla de «enviado», aunque la causa sea el estado del ciclo. Si le pasa, pida a Planeación que revise el ciclo.`),
  ],
};

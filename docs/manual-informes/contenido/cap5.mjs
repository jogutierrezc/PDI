import { h2, lead, p, ticket, pilo, shot, steps, tbl, list, q, st, faq, cols } from "../lib.mjs";
export default {
  n: 5, nombre: "Contribuyente y Consulta", ruta: "/admin/informes-gestion/mi-informe", portada: "Contribuyente y Consulta",
  desc: "Qué hace quien ayuda a diligenciar el informe sin enviarlo, y qué ve quien solo consulta.",
  blocks: [
    lead("El Contribuyente usa las mismas pantallas que el Gestor y escribe las mismas secciones. La diferencia es corta: no envía el informe y no cambia el perfil de la oficina. Su trabajo termina cuando deja todo listo para que el Gestor envíe."),
    h2("Qué puede y qué no puede", "alcance"),
    cols(
      `<div class="h3">Puede</div><ul class="lst"><li>Abrir Mi informe y escribir todas las secciones.</li><li>Subir, enlazar, editar y quitar evidencias.</li><li>Usar a Pilo para redactar o mejorar texto.</li><li>Exportar e importar el libro de Excel.</li><li>Cambiar la composición, los textos, la imagen, las firmas y los créditos de la portada y el cierre.</li><li>Reabrir un informe devuelto: al guardar, vuelve a borrador.</li></ul>`,
      `<div class="h3">No puede</div><ul class="lst"><li>Enviar. El botón queda deshabilitado.</li><li>Cambiar el acento, el monograma, el escudo, el contacto ni el pie de la oficina.</li><li>Devolver un informe.</li><li>Ver el Tablero, la Revisión, el Consolidador, la Capacitación ni las Estructuras.</li><li>Escribir tras el envío ni en secciones «Solo lectura».</li></ul>`,
    ),
    h2("Su recorrido", "recorrido"),
    shot({ f: "con-mi-informe", marks: [], url: "/admin/informes-gestion/mi-informe", alt: "Mi informe de un Contribuyente: el botón Enviar deshabilitado con el aviso de que lo envía el Gestor", maxh: 540 }),
    steps([
      ["Entre a Mi informe", "Abra «Informes de gestión». Las pestañas que ve son «Mi informe», «Vista del informe» y «Guía con Pilo». Cualquier otra lo devuelve a Mi informe."],
      ["Mire su papel", `En el riel dice «su papel: Contribuyente». Abajo, el botón «Enviar» muestra: «Solo el Gestor de la unidad o Planeación envían el informe.» Es normal.`],
      ["Escriba las secciones que le tocan", "Siga el capítulo 4: texto con cifras vivas, alineación, metas, resultados, síntesis, puntos críticos, logros y evidencias."],
      ["Resuelva los controles", `Cada sección tiene su lista de «Controles». Deje todos los puntos en verde y al menos una evidencia cargada.`],
      ["Avise al Gestor", "Cuando todas las secciones estén «Lista», el Gestor puede enviar. El módulo no avisa por correo: avíselo usted."],
    ]),
    pilo("cuidado", "Si el Gestor no puede enviar, léale la razón que aparece debajo del botón «Enviar»: dice exactamente qué falta."),
    h2("Qué ve tras el envío", "tras"),
    tbl(["Estado", "Qué ve y qué puede hacer"], [
      [st("pe", "Borrador"), "Escribe y guarda. El botón «Enviar» sigue deshabilitado."],
      [st("ok", "Aprobado"), "Solo lee. El riel dice «Enviado y aprobado el…» y el libro de Excel no deja importar: «El informe ya se envió: no admite cambios. Pida que lo devuelvan para modificaciones.»"],
      [st("ri", "Devuelto"), "Ve la nota general y la de cada sección. Al guardar, el informe vuelve a borrador. El Gestor lo reenvía."],
    ], "fix", ["20%", "80%"]),
    h2("Portada y cierre", "portada"),
    p(`En ${q("Vista del informe")} puede ${q("Personalizar portada")} y ${q("Personalizar cierre")}. Los campos del perfil de la oficina, acento, monograma, escudo, contacto y pie, aparecen bloqueados con el aviso «Solo el Gestor de la unidad o Planeación cambian…».`),
    shot({ f: "con-solo-lectura", marks: [], url: "/admin/informes-gestion/mi-informe", alt: "Mi informe con el papel Consulta: campos de solo lectura y sin botones de Excel por sección", maxh: 480 }),
    h2("El papel de Consulta", "consulta"),
    p(`Quien tiene el papel de Consulta ve el informe completo en lectura. Los campos están bloqueados, no aparecen los botones de Excel por sección ni los de Pilo, y el libro de Excel responde «Su papel no permite escribir en este informe.» al intentar importar. Puede descargar el PDF y crear una presentación con Pilo.`),
    p(`Planeación también ve el informe de otra unidad con este papel, bajo el aviso «Administración: solo lectura».`),
    h2("Si no ve nada", "sinacceso"),
    shot({ f: "con-sin-acceso", marks: [], url: "/admin/informes-gestion/tablero", alt: "Pantalla de una persona sin permiso para el Tablero: vuelve a Mi informe", maxh: 360 }),
    tbl(["Lo que ve", "Qué significa", "Qué hacer"], [
      ["«Su usuario no tiene ninguna unidad asignada en «Dónde trabaja»…»", "No tiene papel en ninguna unidad.", "Pida a Planeación que la asigne en «Responsables»."],
      ["«Planeación todavía no abre el informe… de su unidad»", "El informe aún no existe.", "Espere a que Planeación lo abra."],
      ["«No se guardó: El informe ya se envió (o no es suyo)…»", "El informe está aprobado, el ciclo no está abierto o su papel no escribe.", "Pida la devolución o revise el estado del ciclo con Planeación."],
      ["«Esa unidad no está entre las suyas…»", "La dirección tiene la unidad de otro.", "Vuelva a Mi informe."],
    ], "fix", ["38%", "32%", "30%"]),
  ],
};

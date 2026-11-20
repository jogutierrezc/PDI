import { h2, lead, p, ticket, pilo, shot, steps, tbl, list, q, rt, cols, rolcard, st } from "../lib.mjs";
const S = { c: "s", t: "Sí" }, N = { c: "n", t: "—" };
const L = (t) => ({ c: "l", t });
export default {
  n: 1, nombre: "Quién es quién", ruta: "/admin/usuarios", portada: "Quién es quién",
  desc: "El módulo tiene seis niveles de acceso y tres papeles dentro de una oficina. Aquí se ve qué puede hacer cada uno y cómo se asigna.",
  blocks: [
    lead("Su acceso depende de dos cosas que no son lo mismo: el nivel que le da su rol de acceso en todo el módulo, y el papel que tiene en cada oficina. El poder que usted tiene en una oficina es el menor de los dos."),
    h2("Los seis niveles del módulo", "niveles"),
    cols(
      rolcard("Administrador de planeación", "Crea planes, carga la planificación por Excel, publica versiones y ve todo. También puede operar lo financiero para revisar y probar.", "Normalmente: Planeación Institucional.") +
      rolcard("Gestor de oficina", "Jefe de la oficina en el módulo. Crea y asigna actividades, revisa los avances, cierra y fija los plazos de aviso de su oficina. Puede crear planes de su oficina.", "Papel en la oficina: Gestor.") +
      rolcard("Colaborador", "Recibe actividades. Las mueve hasta «En revisión», reporta avances con evidencias y registra riesgos de lo que tiene asignado.", "Papel en la oficina: Contribuyente."),
      rolcard("Financiero (VAF)", "Ve todos los planes en lectura. Evalúa la financiación de cada plan y línea, registra la ejecución del presupuesto y vigila las alertas. No crea actividades ni valida avances.", "Normalmente: Director VAF.") +
      rolcard("Aprobador", "Ve todos los planes y la bitácora, y puede comentar. Decidirá los cambios al plan cuando existan las solicitudes de cambio; hoy consulta.", "Nunca decide sobre lo propio.") +
      rolcard("Lector o directivo", "Ve el resumen, los proyectos, el cronograma, las versiones y el presupuesto, solo para leer. No comenta ni modifica nada.", "Papel en la oficina: Consulta.")
    ),
    pilo("idea", "Un mismo rol de acceso puede dar el nivel «Gestor de oficina». Pero para operar en una oficina, además hay que pertenecer a ella con la función «Gestor»."),
    h2("Qué puede hacer cada nivel", "matriz"),
    tbl(
      ["Capacidad", "Admin.", "Aprob.", "Financ.", "Gestor", "Colab.", "Lector"],
      [
        ["Ver resumen, proyectos y seguimiento", S, S, S, S, S, S],
        ["Ver «Todos los planes»", S, S, S, N, N, S],
        ["Crear planes, cargar y publicar versiones", S, N, N, L("Planes de su oficina"), N, N],
        ["Asignar, transferir y cargar actividades por Excel", S, N, N, L("Su oficina"), N, N],
        ["Crear, editar y eliminar actividades", S, N, N, L("Su oficina"), N, N],
        ["Mover actividades entre cubos", S, N, N, L("Su oficina"), L("Las suyas, hasta «En revisión»"), N],
        ["Reportar avance con evidencia", S, N, N, L("Su oficina"), L("Las asignadas"), N],
        ["Validar o devolver un avance", L("Respaldo del gestor"), N, N, L("Nunca el propio"), N, N],
        ["Cerrar una actividad (cierre administrativo)", S, N, N, S, N, N],
        ["Registrar riesgos y acciones", S, N, N, L("Su oficina"), L("Crea riesgos; marca sus acciones"), N],
        ["Comentar", S, S, N, S, S, N],
        ["Plazos de aviso de una oficina", S, N, N, L("Su oficina"), N, N],
        ["Evaluar la financiación y registrar la ejecución", L("Para probar"), N, S, N, N, N],
        ["Ver el presupuesto y sus alertas", S, S, S, L("Su oficina"), L("Su oficina"), S],
      ],
      "mx fix", ["32%", "11%", "11%", "11%", "11%", "13%", "11%"]
    ),
    p(`${st("ok", "Sí")} es un permiso completo. Las celdas en ámbar tienen un límite que se dice en la celda. La misma matriz está en la pantalla ${q("Roles y permisos")} del módulo.`),
    h2("Reglas que la base de datos hace cumplir", "reglas"),
    list([
      "<b>Nadie valida lo propio.</b> Si el gestor reportó un avance, lo valida un administrador del módulo.",
      "<b>Un gestor solo asigna a personas de su oficina.</b> La base lo rechaza aunque la pantalla lo permitiera.",
      "<b>Lo publicado no se edita.</b> Una versión publicada queda congelada.",
      "<b>Cada avance guarda la versión del plan vigente</b> cuando se reportó.",
      "<b>El registro de eventos solo se añade.</b> Cada acción deja una fila que no se edita ni se borra. La pestaña «Historial» de la actividad muestra la parte que le toca.",
      "<b>El presupuesto lo registra solo la VAF.</b> Lo registrado no se edita: se anula con otro movimiento.",
    ]),
    h2("Cómo se asigna el nivel y la oficina", "asignar-rol"),
    p("Hacen falta dos cosas, y las dos se hacen en <b>Usuarios y roles</b> de la intranet. Las hace el administrador general de la plataforma."),
    steps([
      ["Dé el nivel con el rol de acceso", `Entre a ${rt("/admin/usuarios/roles")}, elija el rol y marque el módulo «Planeación y Seguimiento» con su pantalla del mismo nombre. Aparece el grupo «Nivel en Planeación y Seguimiento»: elija Lector, Colaborador, Gestor, Aprobador, Financiero o Administrador.`],
      ["Asigne el rol a la persona", `En ${rt("/admin/usuarios")} abra a la persona y póngale ese rol de acceso. Sin el nivel, o sin la pantalla marcada, el módulo le muestra «Sin acceso».`],
      ["Ubique a la persona en su oficina", `En la ficha de la persona agregue su unidad (la oficina) y elija la <b>Función</b>: Gestor, Contribuyente o Consulta. Es lo que el módulo llama gestor, colaborador y lector.`],
      ["Indique el campus, si aplica", "Cada pertenencia puede tener un campus. Sin campus, la persona cuenta para todos."],
    ]),
    h2("La regla del mínimo", "minimo"),
    p("El poder en una oficina es el menor entre el nivel del rol de acceso y la función en la oficina. Estos ejemplos lo aclaran:"),
    tbl(["Nivel del rol", "Función en la oficina", "Poder en esa oficina"], [
      ["Gestor", "Consulta", "Lector: ve, no opera"],
      ["Colaborador", "Gestor", "Colaborador: el nivel del rol limita"],
      ["Gestor", "Gestor en la unidad madre y Contribuyente en la hija", "Colaborador en la hija: manda la pertenencia más cercana"],
      ["Gestor", "Gestor de la unidad madre", "Gestor en toda la rama de unidades que cuelgan de ella"],
      ["Sin nivel, o sin la pantalla marcada", "Cualquiera", "Ninguno: no ve nada, aunque sea miembro"],
    ], "fix", ["26%", "37%", "37%"]),
    p("Lector y aprobador ven todas las oficinas en modo lectura. Gestor y colaborador solo ven las oficinas donde tienen pertenencia, propia o heredada de una unidad superior."),
    h2("Quién puede recibir una actividad", "asignable"),
    p("Una persona puede recibir actividades de una oficina si pertenece a ella (o a una unidad superior) con función Gestor o Contribuyente, está activa y su nivel del módulo es Colaborador o más. Quien tiene la función Consulta, el aprobador y el financiero no reciben actividades."),
    ticket("Campus", "Si una persona tiene campus y la actividad es de otro campus distinto, la pantalla pide confirmación antes de asignar. Una actividad sin campus vale para todos. Al confirmar queda anotado en la bitácora."),
    pilo("cuidado", "¿Ve el módulo pero no ve sus actividades? Casi siempre falta la pertenencia a la oficina. Pida al administrador de usuarios que le agregue su unidad."),
  ],
};

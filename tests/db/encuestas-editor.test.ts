/* =============================================================================
   Editor de encuestas con Pilo (0183 + 0184).

   Lo que se comprueba: los estados nuevos y la papelera de 30 días (borrar, restaurar,
   purgar, bitácora, solo quien edita); la encuesta rendicion-2026 intacta y expresada
   en el modelo nuevo (su versión 1 es la plantilla); que `abierta` y `estado` van
   juntos; que una versión publicada no cambia; los envíos del modelo nuevo (sin
   sesión, una por persona, límite, freno por IP); y los editores compartidos, que
   dan acceso a una encuesta y no a las demás.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";
import { plantillaDe } from "../../src/modules/encuestas/lib/plantillas";

let t: TestDb;
let rendicion: string;
let propia: string;
let aporte: string;

const comoGestor = <T>(work: (q: Query) => Promise<T>, commit = false) => t.asUser(PEOPLE.director, work, { commit });
const comoConsulta = <T>(work: (q: Query) => Promise<T>) => t.asUser(PEOPLE.vx, work);
const comoResponsable = <T>(work: (q: Query) => Promise<T>) => t.asUser(PEOPLE.ve, work);

/** Como la función del servidor: rol de servicio, sin persona. */
async function comoServicio<T>(work: (q: Query) => Promise<T>): Promise<T> {
  await t.db.exec("begin");
  try {
    await t.db.exec("set local role service_role");
    await t.db.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await t.db.query("select set_config('request.jwt.claim.sub', '', true)");
    return await work(t.q);
  } finally {
    await t.db.exec("rollback");
  }
}

const estructura = JSON.stringify(plantillaDe("satisfaccion")!.estructura());

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set role = 'planeacion' where id = $1", [PEOPLE.director]);
  await t.q("update profiles set role = 'responsable' where id = $1", [PEOPLE.ve]);
  await t.q("update profiles set role = 'consulta' where id = $1", [PEOPLE.vx]);
  rendicion = (await t.q<{ id: string }>("select id from enc_encuestas where slug = 'rendicion-2026'"))[0].id;
  // Un aporte de la encuesta vieja, como lo deja enc_enviar.
  aporte = (
    await t.q<{ id: string }>(
      "insert into enc_aportes (encuesta_id, correo, correo_verificado, dependencia, tipo, titulo, descripcion) values ($1, 'ana@udes.edu.co', true, 'Biblioteca', 'logro', 'Acreditación del programa', 'Una descripción suficientemente larga para pasar.') returning id",
      [rendicion],
    )
  )[0].id;
  await t.q("insert into enc_cifras (aporte_id, orden, que, tipo, valor) values ($1, 0, 'Estudiantes', 'estudiantes', 412)", [aporte]);
  propia = await comoGestor((q) => q<{ id: string }>("select enc_crear_encuesta('satisfaccion-prueba', 'Satisfacción de prueba', $1::jsonb, 'satisfaccion') as id", [estructura]).then((r) => r[0].id), true);
}, 180_000);

afterAll(() => t?.close());

describe("rendicion-2026 sigue igual y vive en el modelo nuevo", () => {
  it("queda publicada, abierta, con acceso Microsoft y su versión 1 fijada igual a la plantilla", async () => {
    const [e] = await t.q<{ estado: string; abierta: boolean; acceso: string; una_por_persona: boolean; version_publicada_id: string; plantilla_origen: string }>(
      "select estado, abierta, acceso, una_por_persona, version_publicada_id, plantilla_origen from enc_encuestas where id = $1",
      [rendicion],
    );
    expect(e).toMatchObject({ estado: "publicada", abierta: true, acceso: "microsoft", una_por_persona: false, plantilla_origen: "rendicion" });
    const [v] = await t.q<{ estructura: unknown; fijada: boolean; numero: number }>("select estructura, fijada, numero from enc_versiones where id = $1", [e.version_publicada_id]);
    expect(v.fijada).toBe(true);
    expect(v.numero).toBe(1);
    expect(v.estructura).toEqual(plantillaDe("rendicion")!.estructura());
    expect((await t.q<{ f: string | null }>("select config_pilo ->> 'flujo' as f from enc_encuestas where id = $1", [rendicion]))[0].f).toBe("aportes");
  });

  it("enc_enviar (el flujo de aportes) sigue guardando", async () => {
    const r = await comoServicio((q) => q<{ r: { recibidos: number } }>("select enc_enviar('rendicion-2026', 'luis@udes.edu.co', true, 'Egresados', $1::jsonb) as r", [JSON.stringify([{ tipo: "reto", titulo: "Más encuentros", descripcion: "Encuentros de egresados durante todo el año.", cifras: [{ que: "Egresados", tipo: "estudiantes", valor: 30 }] }])]));
    expect(r[0].r.recibidos).toBe(1);
  });

  it("abierta y estado van juntos en los dos sentidos", async () => {
    await comoGestor(async (q) => {
      await q("update enc_encuestas set abierta = false where id = $1", [rendicion]);
      expect((await q<{ estado: string }>("select estado from enc_encuestas where id = $1", [rendicion]))[0].estado).toBe("cerrada");
      await q("update enc_encuestas set estado = 'pausada' where id = $1", [rendicion]);
      expect((await q<{ abierta: boolean }>("select abierta from enc_encuestas where id = $1", [rendicion]))[0].abierta).toBe(false);
      await q("update enc_encuestas set estado = 'publicada' where id = $1", [rendicion]);
      expect((await q<{ abierta: boolean }>("select abierta from enc_encuestas where id = $1", [rendicion]))[0].abierta).toBe(true);
    });
  });

  it("pausada, deja de recibir aportes por enc_enviar", async () => {
    const m = await errorOf(
      comoServicio(async (q) => {
        await q("update enc_encuestas set estado = 'pausada' where slug = 'rendicion-2026'");
        await q("select enc_enviar('rendicion-2026', 'luis@udes.edu.co', true, 'Egresados', $1::jsonb)", [JSON.stringify([{ tipo: "reto", titulo: "Más encuentros", descripcion: "Encuentros de egresados durante todo el año.", cifras: [] }])]);
      }),
    );
    expect(m).toContain("cerrada");
  });
});

describe("estados de las respuestas", () => {
  it("acepta rechazado y descartado y rechaza lo demás", async () => {
    await comoGestor(async (q) => {
      for (const s of ["rechazado", "descartado", "para_video", "revisado", "recibido"]) {
        await q("update enc_aportes set estado = $2 where id = $1", [aporte, s]);
        expect((await q<{ estado: string }>("select estado from enc_aportes where id = $1", [aporte]))[0].estado).toBe(s);
      }
    });
    expect(await errorOf(comoGestor((q) => q("update enc_aportes set estado = 'borrado' where id = $1", [aporte])))).toContain("enc_aportes_estado");
  });

  it("Consulta no cambia estados (la base lo impide)", async () => {
    await comoConsulta(async (q) => {
      const r = await q("update enc_aportes set estado = 'rechazado' where id = $1 returning id", [aporte]);
      expect(r).toEqual([]);
    });
  });
});

describe("papelera de 30 días", () => {
  it("borrar deja rastro, no destruye y se puede restaurar", async () => {
    await comoGestor(async (q) => {
      await q("select enc_borrar_aporte($1, 'duplicada')", [aporte]);
      const [a] = await q<{ borrado_en: string | null; borrado_por: string; borrado_motivo: string }>("select borrado_en, borrado_por, borrado_motivo from enc_aportes where id = $1", [aporte]);
      expect(a.borrado_en).not.toBeNull();
      expect(a.borrado_por).toBe(PEOPLE.director);
      expect(a.borrado_motivo).toBe("duplicada");
      expect((await q<{ n: number }>("select count(*)::int n from enc_cifras where aporte_id = $1", [aporte]))[0].n).toBe(1);
      await q("select enc_restaurar_aporte($1)", [aporte]);
      expect((await q<{ borrado_en: string | null }>("select borrado_en from enc_aportes where id = $1", [aporte]))[0].borrado_en).toBeNull();
      const acciones = (await q<{ accion: string; actor: string }>("select accion, actor from enc_bitacora where aporte_id = $1 order by id", [aporte]));
      expect(acciones.map((x) => x.accion)).toEqual(["respuesta_borrada", "respuesta_restaurada"]);
      expect(acciones[0].actor).toBe(PEOPLE.director);
    });
  });

  it("solo quien edita borra o restaura; las columnas de borrado no se escriben a mano", async () => {
    expect(await errorOf(comoConsulta((q) => q("select enc_borrar_aporte($1)", [aporte])))).toMatch(/permiso/);
    expect(await errorOf(comoResponsable((q) => q("select enc_borrar_aporte($1)", [aporte])))).toMatch(/permiso/);
    expect(await errorOf(comoGestor((q) => q("update enc_aportes set borrado_en = now() where id = $1", [aporte])))).toMatch(/permission denied/);
    expect(await errorOf(comoGestor((q) => q("delete from enc_aportes where id = $1", [aporte])))).toMatch(/permission denied/);
  });

  it("la purga borra lo que lleva más de 30 días y deja lo reciente", async () => {
    const viejo = (await t.q<{ id: string }>("insert into enc_aportes (encuesta_id, correo, dependencia, tipo, titulo, descripcion, borrado_en) values ($1, 'a@udes.edu.co', 'Viejo', 'logro', 'Un aporte viejo', 'Una descripción suficientemente larga para pasar.', now() - interval '31 days') returning id", [rendicion]))[0].id;
    const reciente = (await t.q<{ id: string }>("insert into enc_aportes (encuesta_id, correo, dependencia, tipo, titulo, descripcion, borrado_en) values ($1, 'a@udes.edu.co', 'Reciente', 'logro', 'Un aporte reciente', 'Una descripción suficientemente larga para pasar.', now() - interval '29 days') returning id", [rendicion]))[0].id;
    expect(await errorOf(comoConsulta((q) => q("select enc_purgar_borrados()")))).toMatch(/permiso/);
    const n = await comoGestor(async (q) => (await q<{ n: number }>("select enc_purgar_borrados() as n"))[0].n, true);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await t.q("select 1 from enc_aportes where id = $1", [viejo])).toEqual([]);
    expect(await t.q("select 1 from enc_aportes where id = $1", [reciente])).toHaveLength(1);
    expect((await t.q<{ accion: string }>("select accion from enc_bitacora where accion = 'papelera_purgada'")).length).toBeGreaterThan(0);
  });
});

describe("versiones", () => {
  it("la encuesta nueva nace en borrador con su primer borrador y su propietario", async () => {
    const [e] = await t.q<{ estado: string; abierta: boolean; plantilla_origen: string }>("select estado, abierta, plantilla_origen from enc_encuestas where id = $1", [propia]);
    expect(e).toMatchObject({ estado: "borrador", abierta: false, plantilla_origen: "satisfaccion" });
    expect((await t.q<{ rol: string }>("select rol from enc_editores where encuesta_id = $1", [propia]))[0].rol).toBe("propietario");
    expect((await t.q<{ n: number }>("select count(*)::int n from enc_versiones where encuesta_id = $1 and not fijada", [propia]))[0].n).toBe(1);
  });

  it("publicar fija la versión, la hace viva y abre otro borrador; la fijada no cambia", async () => {
    const id = await comoGestor(async (q) => (await q<{ id: string }>("select enc_publicar($1, 'Primera versión') as id", [propia]))[0].id, true);
    const [e] = await t.q<{ version_publicada_id: string; estado: string }>("select version_publicada_id, estado from enc_encuestas where id = $1", [propia]);
    expect(e).toMatchObject({ version_publicada_id: id, estado: "publicada" });
    const vs = await t.q<{ numero: number; fijada: boolean }>("select numero, fijada from enc_versiones where encuesta_id = $1 order by numero", [propia]);
    expect(vs).toEqual([{ numero: 1, fijada: true }, { numero: 2, fijada: false }]);
    expect(await errorOf(t.q("update enc_versiones set estructura = '{\"version\":1,\"secciones\":[]}' where id = $1", [id]))).toMatch(/no se puede cambiar/);
    expect(await errorOf(t.q("delete from enc_versiones where id = $1", [id]))).toMatch(/no se puede borrar/);
    // Guardar el borrador toca solo el borrador.
    await comoGestor((q) => q("select enc_guardar_borrador($1, $2::jsonb, 'Cambio')", [propia, JSON.stringify({ version: 1, secciones: [{ id: "s", titulo: "Solo", preguntas: [] }] })]), true);
    expect((await t.q<{ estructura: unknown }>("select estructura from enc_versiones where id = $1", [id]))[0].estructura).toEqual(plantillaDe("satisfaccion")!.estructura());
  });

  it("una estructura que no es del modelo se rechaza", async () => {
    expect(await errorOf(comoGestor((q) => q("select enc_guardar_borrador($1, '{\"version\":9}'::jsonb)", [propia])))).toContain("enc_versiones_estructura");
  });

  it("quien solo mira no crea, guarda ni publica", async () => {
    expect(await errorOf(comoConsulta((q) => q("select enc_crear_encuesta('x-y', 'Titulo', $1::jsonb)", [estructura])))).toMatch(/permiso/);
    expect(await errorOf(comoResponsable((q) => q("select enc_guardar_borrador($1, $2::jsonb)", [propia, estructura])))).toMatch(/permiso/);
    expect(await errorOf(comoResponsable((q) => q("select enc_publicar($1)", [propia])))).toMatch(/permiso/);
  });

  it("duplicar copia la estructura, no las respuestas, y empieza en borrador", async () => {
    const copia = await comoGestor(async (q) => (await q<{ id: string }>("select enc_duplicar_encuesta($1, 'rendicion-copia', 'Rendición copia') as id", [rendicion]))[0].id, true);
    expect((await t.q<{ estado: string; plantilla_origen: string }>("select estado, plantilla_origen from enc_encuestas where id = $1", [copia]))[0]).toMatchObject({ estado: "borrador", plantilla_origen: "rendicion" });
    expect((await t.q<{ estructura: unknown }>("select estructura from enc_versiones where encuesta_id = $1", [copia]))[0].estructura).toEqual(plantillaDe("rendicion")!.estructura());
    expect((await t.q<{ n: number }>("select count(*)::int n from enc_aportes where encuesta_id = $1", [copia]))[0].n).toBe(0);
    expect((await t.q<{ f: string | null }>("select config_pilo ->> 'flujo' as f from enc_encuestas where id = $1", [copia]))[0].f).toBeNull();
  });
});

describe("envíos del modelo nuevo", () => {
  const enviar = (q: Query, slug: string, correo: string | null, verificado: boolean, huella = "huella-uno-aaaa") =>
    q("select enc_enviar_respuesta($1, $2, $3, null, false, $4::jsonb, $5)", [slug, correo, verificado, JSON.stringify({ servicio: "Biblioteca", satisfaccion: 5 }), huella]);

  it("con acceso Microsoft pide el correo confirmado", async () => {
    await comoGestor((q) => q("update enc_encuestas set estado = 'publicada', acceso = 'microsoft' where id = $1", [propia]), true);
    expect(await errorOf(comoServicio((q) => enviar(q, "satisfaccion-prueba", null, false)))).toMatch(/correo/);
    const r = await comoServicio(async (q) => {
      await enviar(q, "satisfaccion-prueba", "Ana@udes.edu.co", true);
      return q<{ correo: string; version_id: string; n: number }>("select correo, version_id, (select count(*)::int from enc_valores) as n from enc_respuestas where encuesta_id = $1", [propia]);
    });
    expect(r[0].correo).toBe("ana@udes.edu.co");
    expect(r[0].n).toBe(2);
  });

  it("una por persona y límite de respuestas", async () => {
    await comoGestor((q) => q("update enc_encuestas set una_por_persona = true where id = $1", [propia]), true);
    const m = await errorOf(
      comoServicio(async (q) => {
        await enviar(q, "satisfaccion-prueba", "ana@udes.edu.co", true);
        await enviar(q, "satisfaccion-prueba", "ANA@udes.edu.co", true);
      }),
    );
    expect(m).toContain("Ya hay una respuesta");
    const l = await errorOf(
      comoServicio(async (q) => {
        await q("update enc_encuestas set una_por_persona = false, limite_respuestas = 1 where id = $1", [propia]);
        await enviar(q, "satisfaccion-prueba", "uno@udes.edu.co", true);
        await enviar(q, "satisfaccion-prueba", "dos@udes.edu.co", true);
      }),
    );
    expect(l).toContain("límite");
  });

  it("abierta: sin correo ni sesión, con freno por huella (5 en 10 minutos)", async () => {
    const m = await errorOf(
      comoServicio(async (q) => {
        await q("update enc_encuestas set acceso = 'abierta', una_por_persona = false, limite_respuestas = null where id = $1", [propia]);
        for (let i = 0; i < 6; i++) await enviar(q, "satisfaccion-prueba", null, false, "huella-robot-bbbb");
      }),
    );
    expect(m).toContain("Demasiados envíos");
    // Otra huella no se ve afectada, y se guarda anónima.
    const ok = await comoServicio(async (q) => {
      await q("update enc_encuestas set acceso = 'abierta' where id = $1", [propia]);
      await enviar(q, "satisfaccion-prueba", null, false, "huella-otra-cccc");
      return q<{ correo: string | null }>("select correo from enc_respuestas where encuesta_id = $1 and correo is null", [propia]);
    });
    expect(ok).toHaveLength(1);
  });

  it("borrador, pausada o fuera de fechas no reciben", async () => {
    for (const cambio of ["estado = 'pausada'", "estado = 'borrador'", "estado = 'publicada', cierra_el = current_date - 2", "estado = 'publicada', abre_el = current_date + 3"]) {
      const m = await errorOf(
        comoServicio(async (q) => {
          await q(`update enc_encuestas set acceso = 'abierta', ${cambio} where id = $1`, [propia]);
          await enviar(q, "satisfaccion-prueba", null, false);
        }),
      );
      expect(m, cambio).toContain("no está recibiendo");
    }
  });

  it("nadie de la intranet inserta respuestas ni llama enc_enviar_respuesta; el público no lee nada", async () => {
    expect(await errorOf(comoGestor((q) => enviar(q, "satisfaccion-prueba", null, false)))).toMatch(/permission denied/);
    expect(await errorOf(comoGestor((q) => q("insert into enc_respuestas (encuesta_id) values ($1)", [propia])))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select * from enc_respuestas")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select * from enc_versiones")))).toMatch(/permission denied/);
  });

  it("borrar y restaurar una respuesta del modelo nuevo; la lectura de valores", async () => {
    const id = (await t.q<{ id: string }>("insert into enc_respuestas (encuesta_id, correo) values ($1, 'ana@udes.edu.co') returning id", [propia]))[0].id;
    await t.q("insert into enc_valores (respuesta_id, pregunta_id, valor) values ($1, 'servicio', '\"Biblioteca\"'), ($1, 'satisfaccion', '5')", [id]);
    await comoGestor(async (q) => {
      await q("select enc_borrar_respuesta($1, 'prueba')", [id]);
      expect((await q<{ borrado_en: string | null }>("select borrado_en from enc_respuestas where id = $1", [id]))[0].borrado_en).not.toBeNull();
      expect((await q<{ n: number }>("select count(*)::int n from enc_valores where respuesta_id = $1", [id]))[0].n).toBe(2);
      await q("select enc_restaurar_respuesta($1)", [id]);
    });
    expect(await errorOf(comoConsulta((q) => q("select enc_borrar_respuesta($1)", [id])))).toMatch(/permiso/);
  });
});

describe("editores compartidos", () => {
  it("un editor compartido edita esa encuesta y no las demás; un lector solo la ve", async () => {
    await comoGestor((q) => q("select enc_compartir($1, 'vx@prueba.udes.edu.co', 'editor')", [propia]), true);
    // Consulta sin compartir no veía nada (necesita al menos Responsable); con la encuesta compartida, la ve.
    await t.asUser(PEOPLE.vx, async (q) => {
      expect((await q("select id from enc_encuestas")).map((f) => (f as { id: string }).id)).toEqual([propia]);
      expect(await q("select enc_guardar_borrador($1, $2::jsonb)", [propia, estructura])).toHaveLength(1);
      expect((await q<{ correo: string }>("select correo from enc_editores_de($1)", [propia])).length).toBe(2);
    });
    expect(await errorOf(comoConsulta((q) => q("select enc_guardar_borrador($1, $2::jsonb)", [rendicion, estructura])))).toMatch(/permiso/);
    await comoGestor((q) => q("select enc_compartir($1, 'vx@prueba.udes.edu.co', 'lector')", [propia]), true);
    expect(await errorOf(comoConsulta((q) => q("select enc_guardar_borrador($1, $2::jsonb)", [propia, estructura])))).toMatch(/permiso/);
    await comoGestor((q) => q("select enc_quitar_editor($1, $2)", [propia, PEOPLE.vx]), true);
    expect(await comoConsulta((q) => q("select id from enc_encuestas"))).toEqual([]);
  });

  it("no se compartirá con alguien sin cuenta, y el propietario no se quita", async () => {
    expect(await errorOf(comoGestor((q) => q("select enc_compartir($1, 'nadie@udes.edu.co', 'editor')", [propia])))).toMatch(/cuenta/);
    await comoGestor((q) => q("select enc_quitar_editor($1, $2)", [propia, PEOPLE.director]));
    expect((await t.q("select 1 from enc_editores where encuesta_id = $1 and rol = 'propietario'", [propia])).length).toBe(1);
  });

  it("la bitácora recuerda quién cambió qué", async () => {
    const acciones = (await t.q<{ accion: string }>("select distinct accion from enc_bitacora where encuesta_id = $1", [propia])).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(["encuesta_creada", "version_publicada", "estado_cambiado", "editor_agregado"]));
  });
});

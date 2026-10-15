/* Cómo se pide cada reporte (supabase/functions/warehouse/reportes.ts) contra lo que
   muestran los HAR de «har warehouse», más los lectores nuevos del motor: tabla con
   título antes, una hoja por semana (uso de aulas), listas JSON y el estado de una tarea. */

import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { aplanarJson, leerSegun, leerUsoAulas } from "../../supabase/functions/warehouse/motor";
import { consultaDe, edificiosDe, estadoTarea, lectorDe, REPORTES, reportePorId, type Contexto } from "../../supabase/functions/warehouse/reportes";

const ctx: Contexto = { sede: "buc", periodo: "2026b", corte: "2", usuario: "cuenta-servicio" };
const pedir = (id: string, c: Partial<Contexto> = {}) => reportePorId(id)!.armar({ ...ctx, ...c });

describe("las peticiones son las de los HAR", () => {
  it("rendimiento: el corte va en el cuerpo y el periodo lo fija la sesión", () => {
    const p = pedir("ma_rendimiento", { corte: "1" });
    expect(p).toMatchObject({ metodo: "POST", ruta: "/master/mod_reports/reports/matriculated_mortality/download/" });
    expect(p.cuerpo).toMatchObject({ period: "1" });
    expect(reportePorId("ma_rendimiento")).toMatchObject({ periodoVia: "sesion", corte: true });
  });

  it("Davinci: el periodo va en la ruta, cualquier periodo", () => {
    expect(pedir("dv_matric").ruta).toBe("/davinci/mod_reports/reports/students_matriculated/2026b/download/");
    expect(pedir("dv_matric", { periodo: "2024a" }).ruta).toContain("/2024a/");
    expect(pedir("dv_global").ruta).toBe("/davinci/mod_reports/reports/global_enrollments/2026b/download/");
    expect(pedir("dv_grad").ruta).toBe("/davinci/mod_reports/reports/graduates/2026b/all/download/");
    expect(pedir("dv_homol").ruta).toBe("/davinci/mod_reports/reports/homologations_report/2026b/download/");
    expect(pedir("dv_fin").ruta).toBe("/davinci/mod_reports/reports/general_enrollment_and_financial_report/2026b/task/");
    expect(pedir("dv_matric").cuerpo).toMatchObject({ report: "estudiantes_matriculados", title_doc: "estudiantes_matriculados" });
    expect(pedir("dv_grad").cuerpo).toMatchObject({ type: "xls", name_doc: "reporte_graduados.xls" });
    expect(pedir("dv_homol").cuerpo).toMatchObject({ report: "reporte_homologaciones" });
  });

  it("el financiero lleva sus cinco condiciones y es una tarea sin verificar", () => {
    const c = pedir("dv_fin").cuerpo as { conditions: { name: string; selected: boolean }[] };
    expect(c.conditions.map((x) => x.name)).toEqual(["financially_active", "financially_inactive", "enrolled", "not_enrolled", "only_new"]);
    expect(c.conditions.find((x) => x.name === "only_new")!.selected).toBe(false);
    expect(reportePorId("dv_fin")).toMatchObject({ entrega: "tarea", verificado: false });
  });

  it("Davinci: el reporte global de notas pide cualquier periodo por la ruta", () => {
    const p = pedir("dv_notas", { periodo: "2025a" });
    expect(p).toMatchObject({ metodo: "POST", ruta: "/davinci/mod_reports/reports/global_scores/2025a/download/" });
    expect(p.cuerpo).toMatchObject({ type: "pdf" });
    expect(JSON.stringify(p.cuerpo)).toContain("BUC 2025a");
    expect(reportePorId("dv_notas")).toMatchObject({ periodoVia: "ruta", verificado: true });
  });

  it("Galileo: uso de aulas pide todas las semanas (week 0) y se lee hoja por hoja", () => {
    expect(pedir("gl_uso")).toMatchObject({ metodo: "POST", ruta: "/galileo/mod_reports/reports/croom_usage_rate/download/" });
    expect(pedir("gl_uso").cuerpo).toMatchObject({ week: 0, report: "usage_rates" });
    expect(lectorDe("gl_uso")).toBe("uso-aulas");
  });

  it("Master: la evaluación docente pide el periodo en la URL y el usuario en el cuerpo", () => {
    const e = pedir("ms_eval");
    expect(e.consulta).toEqual({ selected_period: "2026b" });
    expect(e.cuerpo).toMatchObject({ username: "cuenta-servicio", title_doc: "consolidado.xlsx" });
    expect(pedir("ms_comp").cuerpo).toMatchObject({ period: "2026b" });
    expect(pedir("ms_comp").consulta).toEqual({ selected_period: "2026b" });
  });

  it("Master: la auditoría va por edificio y la nómina es una tarea con título antes de la tabla", () => {
    const a = pedir("ms_audit", { edificio: { code: "01", name: "BLOQUE GUANE" } });
    expect(a.ruta).toBe("/master/mod_reports/reports/schedules/audit/01/1/download/");
    expect(a.cuerpo).toMatchObject({ building_name: "BLOQUE GUANE", format: 1 });
    expect(reportePorId("ms_audit")!.porEdificio).toBe(true);
    expect(reportePorId("ms_nom")).toMatchObject({ entrega: "tarea", lector: "encabezado:cedula" });
    expect(pedir("ms_nom").cuerpo).toMatchObject({ selected_period: null, status: [true, false, false, false] });
  });

  it("los catálogos son GET sin cuerpo y los departamentos juntan pregrado y posgrado", () => {
    for (const id of ["dm_prog", "dm_aula", "dm_edi", "dm_cur", "dm_act", "dm_con", "dm_grp", "dm_per", "ms_doc", "gl_eq"]) {
      const p = pedir(id);
      expect(p.metodo, id).toBe("GET");
      expect(p.cuerpo, id).toBeUndefined();
    }
    const dep = reportePorId("dm_dep")!;
    expect(dep.armar(ctx).ruta).toContain("pregraduate_departments");
    expect(dep.extra![0](ctx).ruta).toContain("posgraduate_departments");
  });

  it("todas las rutas son de una de las tres plataformas y el sistema coincide", () => {
    for (const r of REPORTES) {
      expect(pedir(r.id).ruta.startsWith(`/${r.sistema}/`), r.id).toBe(true);
    }
  });

  it("las sedes cambian el rótulo del título pero no la ruta", () => {
    expect(JSON.stringify(pedir("dv_matric", { sede: "val" }).cuerpo)).toContain("VAL");
    expect(pedir("dv_matric", { sede: "val" }).ruta).toBe(pedir("dv_matric").ruta);
  });
});

describe("token, llave y tareas", () => {
  it("la URL lleva token, llave, los parámetros propios y un número que evita la caché", () => {
    const q = new URLSearchParams(consultaDe("tok", "llave", { selected_period: "2026a" }));
    expect(q.get("token")).toBe("tok");
    expect(q.get("api_key")).toBe("llave");
    expect(q.get("selected_period")).toBe("2026a");
    expect(q.get("_")).toMatch(/^0\./);
  });

  it("una tarea termina cuando trae el Excel; falla si lo dice la plataforma", () => {
    expect(estadoTarea({ msg: { state: "PROGRESS", progress: 40 } })).toMatchObject({ listo: false, fallo: false, progreso: 40 });
    expect(estadoTarea({ msg: { state: "SUCCESS", progress: 100, data: "UEsDBBQAAAAI" } })).toMatchObject({ listo: true, base64: "UEsDBBQAAAAI" });
    expect(estadoTarea({ msg: { state: "FAILURE" } }).fallo).toBe(true);
    expect(estadoTarea(null)).toEqual({ listo: false, fallo: false });
  });

  it("lista de edificios", () => {
    expect(edificiosDe([{ code: "00", name: "BLOQUE VIRTUAL" }, { code: 1 }, null])).toEqual([{ code: "00", name: "BLOQUE VIRTUAL" }]);
    expect(edificiosDe("x")).toEqual([]);
  });
});

async function libro(hojas: unknown[][][]): Promise<Record<string, Uint8Array>> {
  const wb = new ExcelJS.Workbook();
  hojas.forEach((filas, i) => {
    const h = wb.addWorksheet(`S${i + 1}`);
    filas.forEach((f) => h.addRow(f));
  });
  return unzipSync(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer));
}

describe("lectores", () => {
  it("nómina: salta el título y toma como encabezado la fila que empieza en «Cédula»", async () => {
    const a = await libro([[["UNIVERSIDAD DE SANTANDER"], [], ["Reporte consolidado"], [], ["Generado: hoy"], ["CÉDULA", "NOMBRE", "Programa/Departamento"], ["100", "ANA", "IDIOMAS"], ["200", "LUIS", "DERECHO"]]]);
    const h = leerSegun(lectorDe("ms_nom"), a);
    expect(h.columnas).toEqual(["cedula", "nombre", "programa_departamento"]);
    expect(h.filas).toEqual([
      { cedula: "100", nombre: "ANA", programa_departamento: "IDIOMAS" },
      { cedula: "200", nombre: "LUIS", programa_departamento: "DERECHO" },
    ]);
  });

  it("si el reporte cambia y no aparece el encabezado, lo dice en vez de guardar basura", async () => {
    const a = await libro([[["algo"], ["otra cosa"]]]);
    expect(() => leerSegun("encabezado:cedula", a)).toThrow(/No se encontró el encabezado/);
  });

  it("uso de aulas: una hoja por semana, aplanada con la semana y sus fechas", async () => {
    const hoja = (n: number, ini: string) => [
      ["UNIVERSIDAD DE SANTANDER - PORCENTAJE DE USO DE AULA"],
      [],
      ["Semana", n, "Horas Máximas de Lunes a Sabado", "", 20],
      ["Inicio", ini, "Total Horas máximas semanales", "", 120],
      ["Fin", "2026-08-16"],
      ["Nombre Aula", "Nombre Corto", "% Total de uso", "% de uso Lunes"],
      ["1-204", "1-204", "5", "0"],
      ["AULA B", "B", "30", "60"],
    ];
    const h = leerUsoAulas(await libro([hoja(1, "2026-08-03"), hoja(2, "2026-08-10")]));
    expect(h.columnas).toEqual(["semana", "inicio", "fin", "nombre_aula", "nombre_corto", "pct_total_de_uso", "pct_de_uso_lunes"]);
    expect(h.filas).toHaveLength(4);
    expect(h.filas[0]).toMatchObject({ semana: 1, inicio: "2026-08-03", nombre_aula: "1-204", pct_total_de_uso: "5" });
    expect(h.filas[3]).toMatchObject({ semana: 2, inicio: "2026-08-10", nombre_aula: "AULA B" });
  });

  it("un libro que no es de uso de aulas falla claro", async () => {
    await expect(Promise.resolve().then(async () => leerUsoAulas(await libro([[["x"], ["y"]]])))).rejects.toThrow(/uso de aulas/);
  });

  it("listas JSON: objetos, textos, objeto con lista adentro y diccionarios", () => {
    expect(aplanarJson([{ code: "1", name: "A", _id: { $oid: "x" } }, { code: "2", name: "B" }])).toMatchObject({
      columnas: ["code", "name", "id"],
      filas: [
        { code: "1", name: "A", id: '{"$oid":"x"}' },
        { code: "2", name: "B", id: null },
      ],
    });
    expect(aplanarJson(["2014a", "2014b"]).filas).toEqual([{ valor: "2014a" }, { valor: "2014b" }]);
    expect(aplanarJson({ contracts: [{ n: 1 }, { n: 2 }], contract_periods: [] }).filas).toHaveLength(2);
    expect(aplanarJson({ "2018a": "2018A", "2018b": "2018B" }).filas[0]).toEqual({ clave: "2018a", valor: "2018A" });
    expect(() => aplanarJson([])).toThrow(/vacía/);
    expect(() => aplanarJson(null)).toThrow(/no trae una lista/);
  });

  it("los periodos de Davinci: una fila por periodo y su marca de abierto", () => {
    const h = aplanarJson([{ current: false, period: "2026a" }, { current: true, period: "2026b" }]);
    expect(h.columnas).toEqual(["current", "period"]);
    expect(h.filas[1]).toEqual({ current: true, period: "2026b" });
  });
});

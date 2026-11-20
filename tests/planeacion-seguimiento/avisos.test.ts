/* Función de borde planeacion-seguimiento (0287): lógica pura de redacción, estado y enlace
   (supabase/functions/planeacion-seguimiento/avisos.ts), y que `correos` conserve la acción «ps». */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enlaceDe, esPlantillaPs, estadoTrasIntento, etiquetaDias, iguales, INTENTOS, pesos, redactar, textoAvance } from "../../supabase/functions/planeacion-seguimiento/avisos";

const base = { actividad: "Migrar el correo", oficina: "Dirección TIC", linea: "1 · Proyecto uno", campus: "Cúcuta", prioridad: "Alto", fin: "30/06/2027", actor: "Gabriela" };

describe("redacción de los avisos", () => {
  it("asignación: título y detalle con actividad, línea, campus, prioridad y fecha", () => {
    const r = redactar({ plantilla: "c-ps-asignacion", datos: { ...base, nota: "Vea los planos" } });
    expect(r.titulo).toBe("Le asignaron una actividad");
    expect(r.detalle).toContain("«Migrar el correo»");
    expect(r.detalle).toContain("Fecha de fin: 30/06/2027.");
    expect(r.detalle).toContain("Nota: Vea los planos");
    expect(r).toMatchObject({ oficina: "Dirección TIC", fecha_limite: "30/06/2027", autor: "Gabriela" });
  });

  it("transferencia: un título distinto para quien recibe, quien cede y el gestor", () => {
    const d = { ...base, de: "Carlos", a: "Camila", nota: "Carlos sale de vacaciones" };
    expect(redactar({ plantilla: "c-ps-transferencia", datos: { ...d, rol: "recibe" } }).titulo).toBe("Le transfirieron una actividad");
    expect(redactar({ plantilla: "c-ps-transferencia", datos: { ...d, rol: "cede" } }).titulo).toBe("Su actividad pasó a otra persona");
    const g = redactar({ plantilla: "c-ps-transferencia", datos: { ...d, rol: "gestor" } });
    expect(g.titulo).toBe("Una actividad de su oficina cambió de responsable");
    expect(g.detalle).toContain("pasó de Carlos a Camila");
    expect(g.detalle).toContain("Motivo: Carlos sale de vacaciones");
  });

  it("por vencer: hoy, mañana y N días; vencida: días de retraso y copia al gestor", () => {
    expect(etiquetaDias(0)).toBe("hoy");
    expect(etiquetaDias(1)).toBe("mañana");
    expect(etiquetaDias(7)).toBe("7 días");
    expect(etiquetaDias("x")).toBe("");
    expect(redactar({ plantilla: "c-ps-por-vencer", datos: { ...base, dias: 0 } }).titulo).toBe("Una actividad vence hoy");
    expect(redactar({ plantilla: "c-ps-por-vencer", datos: { ...base, dias: 3 } })).toMatchObject({ titulo: "Una actividad vence en 3 días", dias: "3 días" });
    const v = redactar({ plantilla: "c-ps-vencida", datos: { ...base, dias: 1, rol: "responsable" } });
    expect(v.detalle).toContain("Lleva 1 día de retraso.");
    const g = redactar({ plantilla: "c-ps-vencida", datos: { ...base, dias: 2, rol: "gestor", responsables: "Carlos Uno" } });
    expect(g.titulo).toBe("Una actividad de su oficina está vencida");
    expect(g.detalle).toContain("Responsable: Carlos Uno.");
    expect(g.detalle).toContain("2 días de retraso");
  });

  it("devuelta, cumplida y las de la fase 3 tienen redacción; lo desconocido no rompe", () => {
    expect(redactar({ plantilla: "c-ps-devuelto", datos: { ...base, nota: "Falta el acta" } }).detalle).toContain("Nota del gestor: Falta el acta");
    expect(redactar({ plantilla: "c-ps-cumplida", datos: base }).titulo).toBe("Una actividad quedó hecha");
    expect(redactar({ plantilla: "c-ps-avance", datos: base }).titulo).toBe("Hay un avance por revisar");
    expect(redactar({ plantilla: "c-ps-validado", datos: base }).titulo).toBe("Su avance quedó validado");
    expect(redactar({ plantilla: "c-ps-nueva", datos: {} }).titulo).toBe("Novedad en Planeación y Seguimiento");
    expect(redactar({ plantilla: "c-ps-asignacion", datos: {} }).detalle).toContain("Sin fecha de fin.");
  });

  it("fase 3: avance y validado llevan el porcentaje; la validación pendiente cuenta los avances", () => {
    const a = redactar({ plantilla: "c-ps-avance", datos: { ...base, fisico: 40, financiero: 10, nota: "Fase uno lista" } });
    expect(a.titulo).toBe("Hay un avance por revisar");
    expect(a.detalle).toContain("Avance físico: 40 %. Avance financiero: 10 %.");
    expect(a.detalle).toContain("Nota: Fase uno lista");
    const v = redactar({ plantilla: "c-ps-validado", datos: { ...base, fisico: 100, financiero: null, nota: "Verificado" } });
    expect(v.detalle).toContain("Avance físico: 100 %.");
    expect(v.detalle).not.toContain("financiero");
    expect(v.detalle).toContain("Nota del gestor: Verificado");
    expect(textoAvance({})).toBe("");
    const uno = redactar({ plantilla: "c-ps-validacion-pendiente", datos: { oficina: "Dirección TIC", n: 1, actividades: "Migrar el correo" } });
    expect(uno.titulo).toBe("Hay 1 avance esperando su revisión");
    expect(uno.detalle).toContain("Oficina: Dirección TIC.");
    expect(uno.detalle).toContain("Actividades: Migrar el correo.");
    const varios = redactar({ plantilla: "c-ps-validacion-pendiente", datos: { oficina: "Dirección TIC", n: 3, actividades: "A; B; C" } });
    expect(varios.titulo).toBe("Hay 3 avances esperando su revisión");
    expect(esPlantillaPs("c-ps-validacion-pendiente")).toBe(true);
  });

  it("fase 3B: avisos de la VAF (evaluar, resultado, alerta) sin actividad", () => {
    const d = { plan: "Plan de TIC", oficina: "Dirección TIC", version: "v1.0", monto: 3500000 };
    const e = redactar({ plantilla: "c-ps-vaf-evaluar", datos: d });
    expect(e.titulo).toBe("Un plan espera evaluación financiera");
    expect(e.detalle).toContain("Plan: «Plan de TIC».");
    expect(e.detalle).toContain("Oficina dueña: Dirección TIC.");
    expect(e.detalle).toMatch(/Monto solicitado: \$ 3[.,]500[.,]000\./);
    const r = redactar({ plantilla: "c-ps-vaf-resultado", datos: { ...d, resultado: "aprobada_con_ajustes", monto_aprobado: 3000000, monto_solicitado: 3500000, nota: "Se recorta equipos" } });
    expect(r.titulo).toBe("La VAF evaluó el plan: aprobada con ajustes");
    expect(r.detalle).toContain("Observaciones: Se recorta equipos");
    const a = redactar({ plantilla: "c-ps-vaf-alerta", datos: { ...d, n: 2, detalle: "La línea 3 supera su presupuesto." } });
    expect(a.titulo).toBe("Alerta de ejecución en «Plan de TIC»");
    expect(a.detalle).toContain("2 alertas");
    expect(pesos("x")).toBe("");
    expect(esPlantillaPs("c-ps-vaf-alerta")).toBe(true);
  });

  it("recorta textos largos y colapsa saltos de línea", () => {
    const r = redactar({ plantilla: "c-ps-devuelto", datos: { ...base, nota: `uno\n\ndos ${"x".repeat(2000)}` } });
    expect(r.detalle).not.toMatch(/\n/);
    expect(r.comentario.length).toBeLessThanOrEqual(600);
  });
});

describe("estado, plantillas, enlace y secreto", () => {
  it("un aviso se intenta tres veces y luego queda en error", () => {
    expect(INTENTOS).toBe(3);
    expect(estadoTrasIntento(1, true)).toBe("enviado");
    expect(estadoTrasIntento(1, false)).toBe("pendiente");
    expect(estadoTrasIntento(2, false)).toBe("pendiente");
    expect(estadoTrasIntento(3, false)).toBe("error");
  });

  it("solo plantillas c-ps-*", () => {
    expect(esPlantillaPs("c-ps-asignacion")).toBe(true);
    expect(esPlantillaPs("c-gm-final")).toBe(false);
    expect(esPlantillaPs("c-ps-")).toBe(false);
    expect(esPlantillaPs(undefined)).toBe(false);
  });

  it("el enlace exige https y suma la actividad", () => {
    const id = "00000000-0000-4000-a000-00000000f001";
    expect(enlaceDe("https://planeacion.udes.edu.co/", "/admin/planeacion-seguimiento/mis-tareas", id)).toBe(`https://planeacion.udes.edu.co/admin/planeacion-seguimiento/mis-tareas/${id}`);
    expect(enlaceDe("https://planeacion.udes.edu.co", "admin/x/", null)).toBe("https://planeacion.udes.edu.co/admin/x");
    expect(enlaceDe("http://inseguro.test", "/x", id)).toBe("");
    expect(enlaceDe("", "/x", id)).toBe("");
  });

  it("el secreto del cron se compara completo", () => {
    expect(iguales("abc", "abc")).toBe(true);
    expect(iguales("abc", "abd")).toBe(false);
    expect(iguales("abc", "abcd")).toBe(false);
    expect(iguales("", "")).toBe(true);
  });
});

describe("correos conserva la acción «ps» solo para la clave de servicio", () => {
  const fuente = readFileSync(new URL("../../supabase/functions/correos/index.ts", import.meta.url), "utf8");
  it("está registrada, limita la plantilla a c-ps-* y exige la clave de servicio", () => {
    expect(fuente).toContain('if (action === "ps") return await avisoDePlaneacionSeguimiento(request, body, url, serviceKey);');
    expect(fuente).toMatch(/\/\^c-ps-\[a-z0-9-\]\{1,30\}\$\/\.test\(body\.clave\)/);
    const f = fuente.slice(fuente.indexOf("async function avisoDePlaneacionSeguimiento"));
    expect(f.slice(0, 600)).toContain("!== `Bearer ${serviceKey}`");
    expect(f.slice(0, 4000)).toContain('accion: "ps"');
  });
  it("la acción «gm» sigue intacta", () => {
    expect(fuente).toContain('if (action === "gm") return await avisoDeGestionMaster(request, body, url, serviceKey);');
  });
});

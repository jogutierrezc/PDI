import { describe, expect, it } from "vitest";
import { enVista, fichaDe, relacion, reloj, tamano } from "./vistas";

const YO = "yo";
const base = { assignee_id: null, offered_to: null };

describe("las vistas de la bandeja", () => {
  it("«Mías» incluye lo que atiendo y lo que se me ofrece", () => {
    expect(enVista({ status: "open", assignee_id: YO, offered_to: null }, "mias", YO)).toBe(true);
    expect(enVista({ status: "offered", assignee_id: null, offered_to: YO }, "mias", YO)).toBe(true);
    expect(enVista({ status: "open", assignee_id: "otro", offered_to: null }, "mias", YO)).toBe(false);
    expect(enVista({ status: "resolved", assignee_id: YO, offered_to: null }, "mias", YO)).toBe(false);
  });
  it("«Sin asignar» es la cola, ofrecida o no", () => {
    expect(enVista({ status: "queued", ...base }, "sin", YO)).toBe(true);
    expect(enVista({ status: "offered", assignee_id: null, offered_to: "otro" }, "sin", YO)).toBe(true);
    expect(enVista({ status: "open", assignee_id: YO, offered_to: null }, "sin", YO)).toBe(false);
  });
  it("«Todas» deja fuera lo resuelto y lo que aún es de Pilo", () => {
    expect(enVista({ status: "open", assignee_id: "otro", offered_to: null }, "todas", YO)).toBe(true);
    expect(enVista({ status: "resolved", ...base }, "todas", YO)).toBe(false);
    expect(enVista({ status: "pending", ...base }, "todas", YO)).toBe(false);
    expect(enVista({ status: "resolved", ...base }, "resueltas", YO)).toBe(true);
  });
  it("dice qué relación tiene la conversación con quien la mira", () => {
    expect(relacion({ status: "offered", assignee_id: null, offered_to: YO }, YO)).toBe("oferta");
    expect(relacion({ status: "open", assignee_id: YO, offered_to: null }, YO)).toBe("mia");
    expect(relacion({ status: "open", assignee_id: "otro", offered_to: null }, YO)).toBe("otro");
    expect(relacion({ status: "queued", ...base }, YO)).toBe("sin");
    expect(relacion({ status: "resolved", ...base }, YO)).toBe("resuelta");
  });
});

describe("los formatos", () => {
  it("pone el reloj como minutos y segundos", () => {
    expect(reloj(65)).toBe("1:05");
    expect(reloj(-3)).toBe("0:00");
  });
  it("dice el tamaño", () => {
    expect(tamano(900)).toBe("900 B");
    expect(tamano(184 * 1024)).toBe("184 KB");
    expect(tamano(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
  it("da una ficha por tipo de archivo", () => {
    expect(fichaDe("application/pdf").lab).toBe("PDF");
    expect(fichaDe("image/png").lab).toBe("IMG");
    expect(fichaDe("application/vnd.openxmlformats-officedocument.wordprocessingml.document").lab).toBe("DOC");
    expect(fichaDe("application/vnd.ms-excel").lab).toBe("XLS");
  });
});

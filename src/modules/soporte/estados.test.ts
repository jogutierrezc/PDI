import { describe, expect, it } from "vitest";
import { ago, canMove, initials, isLongWait, offerSecondsLeft, STATUSES, TRANSITIONS } from "./estados";
import { attachmentProblem, mimeFor, safeFileName } from "./adjuntos";

describe("el ciclo de la conversación", () => {
  it("sigue el orden pendiente, en cola, ofrecida, en chat, cerrada", () => {
    expect(canMove("pending", "queued")).toBe(true);
    expect(canMove("queued", "offered")).toBe(true);
    expect(canMove("offered", "open")).toBe(true);
    expect(canMove("open", "resolved")).toBe(true);
  });
  it("no se salta pasos", () => {
    expect(canMove("pending", "open")).toBe(false);
    expect(canMove("queued", "open")).toBe(false);
    expect(canMove("resolved", "queued")).toBe(false);
    expect(canMove("snoozed", "queued")).toBe(false);
  });
  it("una oferta vencida vuelve a la cola y una cerrada se puede reabrir", () => {
    expect(canMove("offered", "queued")).toBe(true);
    expect(canMove("resolved", "open")).toBe(true);
  });
  it("ningún estado pasa a sí mismo", () => {
    for (const s of STATUSES) expect(TRANSITIONS[s]).not.toContain(s);
  });
});

describe("la oferta y la espera", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  it("cuenta los segundos que quedan y no baja de cero", () => {
    expect(offerSecondsLeft("2026-10-22T12:00:30Z", now)).toBe(30);
    expect(offerSecondsLeft("2026-10-22T11:59:00Z", now)).toBe(0);
    expect(offerSecondsLeft(null, now)).toBe(0);
    expect(offerSecondsLeft("no es fecha", now)).toBe(0);
  });
  it("avisa de la espera larga pasado el umbral", () => {
    expect(isLongWait("2026-10-22T11:45:00Z", 10, now)).toBe(true);
    expect(isLongWait("2026-10-22T11:55:00Z", 10, now)).toBe(false);
    expect(isLongWait(null, 10, now)).toBe(false);
  });
  it("dice hace cuánto fue", () => {
    expect(ago("2026-10-22T11:59:50Z", now)).toBe("ahora");
    expect(ago("2026-10-22T11:57:00Z", now)).toBe("hace 3 min");
    expect(ago("2026-10-22T09:00:00Z", now)).toBe("hace 3 h");
    expect(ago("2026-10-21T10:00:00Z", now)).toBe("ayer");
  });
  it("saca las iniciales", () => {
    expect(initials("Camila Rojas Pérez")).toBe("CP");
    expect(initials("Ana")).toBe("A");
    expect(initials("")).toBe("?");
  });
});

describe("los adjuntos", () => {
  const MB = 1024 * 1024;
  it("admite imágenes, PDF, Word y Excel hasta 10 MB", () => {
    for (const name of ["a.png", "a.JPG", "a.pdf", "a.docx", "a.xlsx", "a.doc", "a.xls", "a.webp", "a.gif"]) {
      expect(attachmentProblem({ name, type: "", size: MB })).toBe("");
    }
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf", size: 10 * MB })).toBe("");
  });
  it("rechaza lo grande, lo vacío y lo que no es de esos tipos", () => {
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf", size: 10 * MB + 1 })).toMatch(/10 MB/);
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf", size: 0 })).toMatch(/vacío/);
    expect(attachmentProblem({ name: "a.exe", type: "application/x-msdownload", size: 10 })).toMatch(/Solo se admiten/);
    expect(attachmentProblem({ name: "a.svg", type: "image/svg+xml", size: 10 })).toMatch(/Solo se admiten/);
  });
  it("deduce el tipo por la extensión cuando el navegador no lo da", () => {
    expect(mimeFor({ name: "informe.DOCX", type: "" })).toContain("wordprocessingml");
    expect(mimeFor({ name: "x.zip", type: "application/zip" })).toBe("");
  });
  it("deja un nombre seguro", () => {
    expect(safeFileName("Cédula frente (1).pdf")).toBe("Cedula-frente-1.pdf");
    expect(safeFileName("../../etc/pass wd")).toBe("etc-pass-wd");
  });
});

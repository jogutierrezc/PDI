import { describe, expect, it } from "vitest";
import { createOutbox } from "./outbox";

describe("la cola de mensajes sin conexión", () => {
  it("sin red los mensajes esperan y salen en orden al reconectar", async () => {
    let online = false;
    const sent: string[] = [];
    const box = createOutbox<string>(async (p) => void sent.push(p), () => online);
    box.push("uno");
    box.push("dos");
    await Promise.resolve();
    expect(sent).toEqual([]);
    expect(box.items()).toHaveLength(2);
    online = true;
    expect(await box.flush()).toBe(2);
    expect(sent).toEqual(["uno", "dos"]);
    expect(box.items()).toHaveLength(0);
  });

  it("un fallo detiene la cola en ese mensaje y se reintenta después", async () => {
    let fail = true;
    const sent: string[] = [];
    const box = createOutbox<string>(async (p) => {
      if (fail && p === "uno") throw new Error("red");
      sent.push(p);
    });
    box.push("uno");
    box.push("dos");
    await box.flush();
    expect(sent).toEqual([]); // "dos" no se adelanta a "uno"
    expect(box.items()[0].tries).toBeGreaterThan(0);
    fail = false;
    expect(await box.flush()).toBe(2);
    expect(sent).toEqual(["uno", "dos"]);
  });

  it("avisa a quien escucha cada vez que cambia y dice cuál salió", async () => {
    const sentIds: string[] = [];
    const box = createOutbox<string>(async () => {}, () => true, (id) => void sentIds.push(id));
    let changes = 0;
    const off = box.subscribe(() => (changes += 1));
    const id = box.push("hola");
    await box.flush();
    expect(changes).toBeGreaterThan(0);
    expect(sentIds).toContain(id);
    off();
  });
});

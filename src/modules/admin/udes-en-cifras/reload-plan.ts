/* =============================================================================
   UDES en Cifras · qué releer después de guardar.

   Cada escritura de la intranet invalidaba todo el periodo: treinta y tantas
   consultas —Saber PRO, mapas y desgloses incluidos— para volver a ver una
   rejilla de cifras recién guardada, y el botón seguía en «Guardando…» hasta
   que llegaba la última. Aquí cada escritura apunta las familias de tablas que
   tocó y la relectura pide solo esas (ver `reuse` en repository.ts).

   Reglas, pensadas para no enseñar nunca un dato viejo como fresco:
   · Una escritura que no declara familias obliga a releerlo todo.
   · Solo se relee por partes una lectura que estaba vigente al apuntar. Si ya
     estaba invalidada (por otra escritura o por un error), sus partes
     pendientes se acumulan; si no había nada apuntado, va entera.
   · Pasado `maxAge` desde la última lectura completa, la siguiente va entera:
     así lo que otra persona cambió en otras tablas llega igual.
   · Lo apuntado se borra solo cuando la relectura que lo cubría termina bien y
     nadie apuntó nada más mientras tanto.

   Módulo puro: no conoce React ni la caché; od-data.ts lo conecta.
   ========================================================================== */

import type { RowFamily } from "../../datos-abiertos/data/repository";

export type ReloadScope = "all" | readonly RowFamily[];

interface Pending {
  families: Set<RowFamily> | "all";
  version: number;
}

export interface ReloadTake {
  /** Familias a releer; null = la lectura completa. */
  only: ReadonlySet<RowFamily> | null;
  version: number;
}

export class ReloadPlan {
  private pending = new Map<string, Pending>();
  private fullAt = new Map<string, number>();
  private counter = 0;

  constructor(private maxAge = 5 * 60 * 1000) {}

  /**
   * Apunta lo que tocó una escritura para la lectura `hash`.
   * `fresh`: la lectura tenía datos y no estaba invalidada.
   */
  mark(hash: string, scope: ReloadScope, fresh: boolean): void {
    this.counter += 1;
    const entry = this.pending.get(hash);
    if (scope === "all" || entry?.families === "all" || (!entry && !fresh)) {
      this.pending.set(hash, { families: "all", version: this.counter });
      return;
    }
    const families = new Set<RowFamily>(entry ? (entry.families as Set<RowFamily>) : []);
    for (const family of scope) families.add(family);
    this.pending.set(hash, { families, version: this.counter });
  }

  /** Qué pedir en la relectura que empieza ahora. */
  take(hash: string, now: number): ReloadTake {
    const entry = this.pending.get(hash);
    const version = entry?.version ?? 0;
    const fullAt = this.fullAt.get(hash);
    if (!entry || entry.families === "all" || fullAt === undefined || now - fullAt > this.maxAge) return { only: null, version };
    return { only: new Set(entry.families), version };
  }

  /** La relectura terminó bien: borra lo que cubría, salvo que se apuntara algo más mientras tanto. */
  settle(hash: string, take: ReloadTake, now: number): void {
    if (take.only === null) this.fullAt.set(hash, now);
    const entry = this.pending.get(hash);
    if (entry && entry.version === take.version) this.pending.delete(hash);
  }
}

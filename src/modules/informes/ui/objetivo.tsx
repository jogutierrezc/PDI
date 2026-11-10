/* =============================================================================
   Informes de gestión · de qué unidad y de qué sede es el informe que se abre (0272).

   Nadie elige la unidad a mano: sale de «Dónde trabaja» (unit_members: unidad y sede). Quien
   trabaja en una unidad que se ofrece en varias sedes y no tiene una asignada elige la SEDE.
   Quien gestiona llega con ?unidad=<id>&sede=<slug> desde el Tablero del ciclo. Los enlaces
   viejos, con solo ?unidad=, siguen funcionando.
   ========================================================================== */

import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { actorDe } from "../../rankings/reporte/envio";
import { useInstancias, useMembresiasInforme, useOfertaSedes, useUnidades } from "../datos";
import { buscarInstancia, nombreConSede, SIN_OFERTA, sedesPorUnidad } from "../sedes";
import type { InstanciaRow, SedeInforme, UnidadRef } from "../types";

const FUERZA = { visor: 1, editor: 2, jefe: 3 } as const;

export interface Destino {
  unidad: UnidadRef;
  /** Nula: sin sede, o la persona elige la sede. */
  sede: SedeInforme | null;
}

export type Objetivo =
  | { tipo: "cargando" }
  | { tipo: "error"; error: Error }
  | { tipo: "ajena" }
  | { tipo: "sin"; gestiona: boolean }
  | {
      tipo: "ok";
      unidad: UnidadRef;
      sede: SedeInforme | null;
      ofrecidas: SedeInforme[];
      /** ¿Se ofrece el selector de sede? Solo si la unidad tiene varias y la persona no tiene una asignada. */
      elegirSede: boolean;
      otras: Destino[];
      instancia: InstanciaRow | null;
      actor: ReturnType<typeof actorDe>;
      planeacion: boolean;
      /** La unidad y, si tiene, la sede: lo que se muestra. */
      nombre: string;
    };

interface Candidato {
  unidad: UnidadRef;
  fija: SedeInforme | null;
  elegir: boolean;
}

export function useObjetivoInforme(ciclo: string | undefined): Objetivo {
  const { profile, puedeGestionarInformes: planeacion } = useAuth();
  const membresias = useMembresiasInforme(profile?.id);
  const unidades = useUnidades();
  const instancias = useInstancias(ciclo);
  const oferta = useOfertaSedes();
  const [params] = useSearchParams();

  const error = [membresias.error, unidades.error, instancias.error].find((e): e is Error => e instanceof Error);
  if (error) return { tipo: "error", error };
  if (!profile || membresias.isPending || unidades.isPending || instancias.isPending || oferta.isPending) return { tipo: "cargando" };

  const lista = unidades.data ?? [];
  const porId = new Map(lista.map((u) => [u.id, u]));
  const orden = new Map(lista.map((u, i) => [u.id, i]));
  const sedesDe = sedesPorUnidad(lista, oferta.data ?? SIN_OFERTA);
  const sedePorId = new Map((oferta.data?.sedes ?? []).map((s) => [s.id, s]));
  const sedePorSlug = new Map((oferta.data?.sedes ?? []).map((s) => [s.slug, s]));

  // Dónde trabaja: primero la función más fuerte, luego el orden del organigrama.
  const mias = [...(membresias.data ?? [])].sort((a, b) => FUERZA[b.rol] - FUERZA[a.rol] || (orden.get(a.unidad) ?? 0) - (orden.get(b.unidad) ?? 0));
  const candidatos: Candidato[] = [];
  const vistos = new Set<string>();
  for (const m of mias) {
    const unidad = porId.get(m.unidad) ?? { id: m.unidad, name: m.nombre, kind: "", code: null, parent_id: null };
    const ofrecidas = sedesDe.get(m.unidad) ?? [];
    const propia = m.sede ? (sedePorId.get(m.sede) ?? null) : null;
    const c: Candidato = propia ? { unidad, fija: propia, elegir: false } : ofrecidas.length === 1 ? { unidad, fija: ofrecidas[0], elegir: false } : ofrecidas.length > 1 ? { unidad, fija: null, elegir: true } : { unidad, fija: null, elegir: false };
    const clave = `${unidad.id}|${c.elegir ? "*" : (c.fija?.id ?? "")}`;
    if (!vistos.has(clave)) {
      vistos.add(clave);
      candidatos.push(c);
    }
  }

  const pidUnidad = params.get("unidad");
  const pedida = params.get("sede") ? (sedePorSlug.get(params.get("sede") ?? "") ?? null) : null;
  let elegido: Candidato | null = null;
  if (pidUnidad) {
    if (planeacion) {
      const u = porId.get(pidUnidad);
      if (!u) return { tipo: "ajena" };
      const ofr = sedesDe.get(u.id) ?? [];
      elegido = { unidad: u, fija: pedida ?? (ofr.length === 1 ? ofr[0] : null), elegir: !pedida && ofr.length > 1 };
    } else {
      // Una unidad o sede ajena en la dirección se rechaza: no se carga nada de ella (la base también lo niega).
      elegido = candidatos.find((c) => c.unidad.id === pidUnidad && (c.elegir || !pedida || c.fija?.id === pedida.id)) ?? null;
      if (!elegido) return { tipo: "ajena" };
    }
  } else {
    elegido = candidatos[0] ?? null;
  }
  if (!elegido) return { tipo: "sin", gestiona: planeacion };

  const ofrecidas = sedesDe.get(elegido.unidad.id) ?? [];
  const sede = elegido.elegir ? (pedida && ofrecidas.some((o) => o.id === pedida.id) ? pedida : (ofrecidas[0] ?? null)) : elegido.fija;
  const elegirSede = ofrecidas.length > 1 && (planeacion || elegido.elegir);
  const otras: Destino[] = candidatos.filter((c) => c.unidad.id !== elegido.unidad.id || (!c.elegir && c.fija?.id !== sede?.id)).map((c) => ({ unidad: c.unidad, sede: c.fija }));
  return {
    tipo: "ok",
    unidad: elegido.unidad,
    sede,
    ofrecidas,
    elegirSede,
    otras,
    instancia: buscarInstancia(instancias.data ?? [], elegido.unidad.id, sede?.id ?? null, ofrecidas),
    actor: actorDe(planeacion, membresias.data ?? [], elegido.unidad.id),
    planeacion,
    nombre: nombreConSede(elegido.unidad.name, sede),
  };
}

/** El enlace a una unidad y sede, para Mi informe, la Vista y el Tablero. */
export const enlaceInforme = (base: string, unidad: string, sede: SedeInforme | null | undefined) => `${base}?unidad=${unidad}${sede ? `&sede=${sede.slug}` : ""}`;

/** Selector de sede (solo si hace falta) y enlaces a las otras unidades de la persona (solo si tiene más de una). No hay selector de unidad. */
export function EncabezadoObjetivo({ o, base }: { o: Extract<Objetivo, { tipo: "ok" }>; base: string }) {
  const [params, setParams] = useSearchParams();
  if (!o.elegirSede && o.otras.length === 0) return null;
  return (
    <div className="inf-row" style={{ alignItems: "end" }}>
      {o.elegirSede && (
        <label className="inf-lab" style={{ maxWidth: 280 }}>
          Sede
          <select
            className="inf-in"
            value={o.sede?.slug ?? ""}
            onChange={(e) => {
              const p = new URLSearchParams(params);
              p.set("unidad", o.unidad.id);
              p.set("sede", e.target.value);
              p.delete("s");
              setParams(p, { replace: true });
            }}
          >
            {o.ofrecidas.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {o.otras.length > 0 && (
        <span className="inf-hint">
          Sus otras unidades:{" "}
          {o.otras.map((d, i) => (
            <span key={`${d.unidad.id}|${d.sede?.id ?? ""}`}>
              {i > 0 ? ", " : ""}
              <Link className="inf-link" to={enlaceInforme(base, d.unidad.id, d.sede)}>
                {nombreConSede(d.unidad.name, d.sede)}
              </Link>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/* =============================================================================
   Cumplimiento de Tipología · la pantalla de la intranet (carpeta «Gestión
   Master»). Una sola ruta: /admin/cumplimiento-tipologia (periodo, sede, programa
   y vista en la dirección: ?periodo=2026b&sede=buc&programa=…&vista=sedes).

     programa    el estado del programa, sus causas, los cambios de perfil
                 recomendados y la lista de profesores con su ficha
     sedes       «Programas por sede» (vicerrectoría y administrador)
     corte       insumos del Warehouse, calcular el corte y bitácora (administrador)
     programas   a qué unidad corresponde cada programa (administrador)

   El acceso lo da el rol de acceso (ct_nivel), nunca la capacidad global; la base
   lo hace cumplir en cada tabla y función (migración 0260). Solo tema claro.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "../admin/components/AdminShell";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import "../datos-abiertos/observatorio/obs-claro.css";
import { leerNombres, useCorteActual, useMatriz, useMiNivel, useResumenes } from "./api";
import { Corte } from "./Corte";
import { EstadoPrograma } from "./EstadoPrograma";
import { Ficha } from "./Ficha";
import { ListaProfesores } from "./ListaProfesores";
import { mensajeDe, nombrePeriodo, nombreSede, periodosLista, type CeldaMatriz, type NivelCt, type Vista } from "./modelo";
import { ProgramasPorSede } from "./ProgramasPorSede";
import { Unidades } from "./Unidades";
import "./cumplimiento.css";

const SEDES_ORDEN = ["buc", "val", "cuc", "bog"] as const;
const SEDES_VALIDAS: string[] = [...SEDES_ORDEN];

const ACCESO: Record<Exclude<NivelCt, "none">, string> = {
  programa: "Ve los profesores de los programas de su unidad: preventivas, recomendaciones, contrato, estado en Master, distribución semanal y desglose. No ve las observaciones escritas para Master.",
  vicerrectoria: "Compara los programas y sedes de su vicerrectoría y entra al detalle de cada uno. No ve las observaciones escritas para Master.",
  admin: "Ve todo lo anterior y además la observación para Master (255 caracteres) y la observación ampliada. Calcula el corte y asigna los programas a las unidades.",
};

const fechaCorte = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export function CumplimientoTipologia() {
  const [params, setParams] = useSearchParams();
  const nivelQ = useMiNivel();
  const nivel: NivelCt = nivelQ.data ?? "none";
  const puedeComparar = nivel === "vicerrectoria" || nivel === "admin";
  const esAdmin = nivel === "admin";

  const periodos = useMemo(() => periodosLista(), []);
  const periodo = periodos.includes(params.get("periodo") ?? "") ? (params.get("periodo") as string) : periodos[0];
  const sede = SEDES_VALIDAS.includes(params.get("sede") ?? "") ? (params.get("sede") as string) : "buc";
  const vistaParam = params.get("vista");
  const vista: Vista = vistaParam === "sedes" && puedeComparar ? "sedes" : vistaParam === "corte" && esAdmin ? "corte" : vistaParam === "programas" && esAdmin ? "programas" : "programa";

  const cambiar = useCallback(
    (cambios: Record<string, string | null>) => {
      const siguiente = new URLSearchParams(params);
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null || v === "") siguiente.delete(k);
        else siguiente.set(k, v);
      }
      setParams(siguiente, { replace: true });
    },
    [params, setParams],
  );

  const matriz = useMatriz(periodo, nivel !== "none");
  const celdas: CeldaMatriz[] = useMemo(() => matriz.data ?? [], [matriz.data]);

  const programas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of celdas) if (!mapa.has(c.programa_norm)) mapa.set(c.programa_norm, c.programa);
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [celdas]);
  const sedesDe = useCallback((norm: string) => new Set(celdas.filter((c) => c.programa_norm === norm).map((c) => c.sede)), [celdas]);

  // El programa de la dirección si existe; si no, el primero que tenga corte en esta sede, o el primero.
  const programaParam = params.get("programa") ?? "";
  const programaNorm = programas.some(([n]) => n === programaParam)
    ? programaParam
    : (programas.find(([n]) => sedesDe(n).has(sede))?.[0] ?? programas[0]?.[0] ?? "");
  const programaNombre = programas.find(([n]) => n === programaNorm)?.[1] ?? "";

  const corte = useCorteActual(periodo, sede, nivel !== "none");
  const hayCorte = Boolean(corte.data);
  const resumenes = useResumenes(periodo, sede, programaNorm, hayCorte && vista === "programa");
  const filas = useMemo(() => resumenes.data ?? [], [resumenes.data]);

  // Los nombres: se leen en vivo del Master, viven solo en esta pantalla y se descartan al cambiar de programa, sede o periodo.
  const claveNombres = `${periodo}|${sede}|${programaNorm}`;
  const [leidos, setLeidos] = useState<{ clave: string; nombres: Record<string, string> }>({ clave: "", nombres: {} });
  const nombres = leidos.clave === claveNombres ? leidos.nombres : {};
  const [leyendo, setLeyendo] = useState(false);
  const [errorNombres, setErrorNombres] = useState("");
  const verNombres = async () => {
    setLeyendo(true);
    setErrorNombres("");
    try {
      const r = await leerNombres({ periodo, sede, programa: programaNombre, seudonimos: filas.map((f) => f.seudonimo) });
      setLeidos({ clave: claveNombres, nombres: r.nombres });
      if (r.encontrados === 0) setErrorNombres("El Master no devolvió los nombres de estos profesores. Se siguen identificando por su seudónimo.");
    } catch (e) {
      setErrorNombres(mensajeDe(e));
    } finally {
      setLeyendo(false);
    }
  };
  const yaLeidos = Object.keys(nombres).length > 0;

  // La ficha abierta.
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const abierta = filas.find((f) => f.id === abiertoId) ?? null;
  useEffect(() => setAbiertoId(null), [claveNombres, vista]);
  const cerrarFicha = useCallback(() => {
    const id = abiertoId;
    setAbiertoId(null);
    if (id) window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`tr[data-fid="${id}"]`)?.focus());
  }, [abiertoId]);

  const botonNombres = (
    <button type="button" className="ct-ghost" onClick={() => void verNombres()} disabled={leyendo || filas.length === 0} title="Se leen en vivo del Master y no se guardan. La consulta queda registrada.">
      <Icon name="user" size={15} />
      {leyendo ? "Leyendo del Master…" : yaLeidos ? "Volver a leer los nombres" : "Ver los nombres"}
    </button>
  );

  const vistas: { id: Vista; texto: string }[] = [{ id: "programa", texto: "Mi programa" }];
  if (puedeComparar) vistas.push({ id: "sedes", texto: "Programas por sede" });
  if (esAdmin) vistas.push({ id: "corte", texto: "Corte y datos" }, { id: "programas", texto: "Programas y unidades" });

  const elegirPrograma = (norm: string, s?: string) => {
    const sedeNueva = s ?? (sedesDe(norm).has(sede) ? sede : (SEDES_ORDEN.find((x) => sedesDe(norm).has(x)) ?? sede));
    cambiar({ programa: norm, sede: sedeNueva === "buc" ? null : sedeNueva, vista: null });
  };

  /* --- Qué se muestra --------------------------------------------------------------------------------------- */

  let cuerpo: ReactNode;
  if (nivelQ.isPending) {
    cuerpo = <LoadingBlock rows={4} label="Comprobando su acceso" />;
  } else if (nivelQ.error) {
    cuerpo = <EmptyBlock title="Cumplimiento de Tipología no está listo" hint="Falta aplicar la migración 0260 en la base de datos, o no se pudo comprobar su acceso." />;
  } else if (nivel === "none") {
    cuerpo = <EmptyBlock title="Sin acceso a Cumplimiento de Tipología" hint="El acceso lo da el rol de acceso (Usuarios y roles › Gestión Master › Cumplimiento de Tipología). Pídaselo a la administración." />;
  } else if (vista === "programas") {
    cuerpo = <Unidades />;
  } else if (vista === "corte") {
    cuerpo = <Corte periodo={periodo} sede={sede} />;
  } else if (matriz.isPending || (vista === "programa" && corte.isPending)) {
    cuerpo = <LoadingBlock rows={5} label="Leyendo el corte" />;
  } else if (matriz.error) {
    cuerpo = <ErrorBlock error={matriz.error} onRetry={() => void matriz.refetch()} />;
  } else if (vista === "sedes") {
    cuerpo = celdas.length === 0 ? <SinCorte periodo={periodo} sede={null} esAdmin={esAdmin} sedesConCorte={[]} onCalcular={() => cambiar({ vista: "corte" })} sinAlcance={false} /> : <ProgramasPorSede celdas={celdas} onElegir={(n, s) => elegirPrograma(n, s)} />;
  } else if (corte.error) {
    cuerpo = <ErrorBlock error={corte.error} onRetry={() => void corte.refetch()} />;
  } else if (!hayCorte) {
    cuerpo = (
      <SinCorte periodo={periodo} sede={sede} esAdmin={esAdmin} sedesConCorte={[...new Set(celdas.map((c) => c.sede))]} onCalcular={() => cambiar({ vista: "corte" })} onSede={(s) => cambiar({ sede: s === "buc" ? null : s })} sinAlcance={false} />
    );
  } else if (programas.length === 0) {
    cuerpo = <SinCorte periodo={periodo} sede={sede} esAdmin={esAdmin} sedesConCorte={[]} onCalcular={() => cambiar({ vista: "corte" })} sinAlcance />;
  } else if (resumenes.isPending) {
    cuerpo = <LoadingBlock rows={5} label="Leyendo los profesores" />;
  } else if (resumenes.error) {
    cuerpo = <ErrorBlock error={resumenes.error} onRetry={() => void resumenes.refetch()} />;
  } else if (filas.length === 0) {
    cuerpo = <EmptyBlock title={`${programaNombre || "Este programa"} no tiene profesores en ${nombreSede(sede)}`} hint="El programa no se ofrece en esta sede o no tiene carga en este corte. Elija otra sede arriba." />;
  } else {
    cuerpo = (
      <>
        <EstadoPrograma filas={filas} programa={programaNombre} sede={nombreSede(sede)} />
        <ListaProfesores filas={filas} nombres={nombres} abierto={abiertoId} onAbrir={setAbiertoId} accionNombres={botonNombres} />
        {errorNombres && (
          <p className="ct-error" role="alert">
            {errorNombres}
          </p>
        )}
      </>
    );
  }

  const enBarra = nivel !== "none" && (vista === "programa" || vista === "corte" || vista === "sedes");

  return (
    <AdminShell section="cumplimiento_tipologia" kicker="Gestión Master" title="Cumplimiento de Tipología" description="Cómo está compuesta la carga de cada profesor, si cumple la tipología de su contrato y qué perfil conviene planear.">
      <div className="ct obsr-claro">
        {nivel !== "none" && (
          <p className="ct-acceso">
            <Icon name="lock" size={14} />
            <span>{ACCESO[nivel]}</span>
          </p>
        )}

        {enBarra && (
          <section className="ct-ctx" aria-label="Contexto">
            <div className="ct-ctx__izq">
              <label className="ct-field">
                Periodo
                <select className="ct-select" value={periodo} onChange={(e) => cambiar({ periodo: e.target.value === periodos[0] ? null : e.target.value })}>
                  {periodos.map((p) => (
                    <option key={p} value={p}>
                      {nombrePeriodo(p)}
                    </option>
                  ))}
                </select>
              </label>
              {vista === "programa" && programas.length > 0 && (
                <label className="ct-field">
                  Programa
                  <select className="ct-select" value={programaNorm} onChange={(e) => elegirPrograma(e.target.value)}>
                    {programas.map(([n, nombre]) => (
                      <option key={n} value={n}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {vista !== "sedes" && (
                <div className="ct-field" role="group" aria-label="Sede">
                  Sede
                  <div className="ct-seg">
                    {SEDES_ORDEN.map((s) => {
                      const ofrece = vista !== "programa" || programaNorm === "" || sedesDe(programaNorm).has(s) || celdas.length === 0;
                      return (
                        <button key={s} type="button" aria-pressed={sede === s} disabled={!ofrece} title={ofrece ? undefined : "El programa no tiene corte en esta sede"} onClick={() => cambiar({ sede: s === "buc" ? null : s })}>
                          {nombreSede(s)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {vistas.length > 1 && (
              <div className="ct-seg" role="group" aria-label="Vista">
                {vistas.map((v) => (
                  <button key={v.id} type="button" aria-pressed={vista === v.id} onClick={() => cambiar({ vista: v.id === "programa" ? null : v.id })}>
                    {v.texto}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        {nivel !== "none" && !enBarra && vistas.length > 1 && (
          <div className="ct-ctx">
            <div className="ct-seg" role="group" aria-label="Vista">
              {vistas.map((v) => (
                <button key={v.id} type="button" aria-pressed={vista === v.id} onClick={() => cambiar({ vista: v.id === "programa" ? null : v.id })}>
                  {v.texto}
                </button>
              ))}
            </div>
          </div>
        )}

        {vista === "programa" && corte.data && (
          <p className="ct-corte-nota">
            Corte del {fechaCorte(corte.data.terminado_en)} · {corte.data.profesores.toLocaleString("es-CO")} profesores en {nombreSede(sede)}. Se lee de lo ya calculado; no se recalcula aquí.
          </p>
        )}

        <main className="ct-main">{cuerpo}</main>

        <Ficha fila={abierta} nivel={nivel} nombre={abierta ? nombres[abierta.seudonimo] : undefined} programa={programaNombre} sede={nombreSede(sede)} periodo={nombrePeriodo(periodo)} onCerrar={cerrarFicha} accionNombre={botonNombres} />
      </div>
    </AdminShell>
  );
}

/** Sin datos aún: dice qué falta y cómo generarlo. */
function SinCorte({
  periodo,
  sede,
  esAdmin,
  sedesConCorte,
  onCalcular,
  onSede,
  sinAlcance,
}: {
  periodo: string;
  sede: string | null;
  esAdmin: boolean;
  sedesConCorte: string[];
  onCalcular: () => void;
  onSede?: (s: string) => void;
  sinAlcance: boolean;
}) {
  if (sinAlcance) {
    return (
      <EmptyBlock
        title={`Hay corte para ${nombrePeriodo(periodo)}, pero ninguno de sus programas`}
        hint="Su usuario no está asignado a una unidad con profesores en este corte. Quién ve cada programa sale de la unidad a la que pertenece (Estructura y usuarios); pídaselo a la administración."
      />
    );
  }
  const donde = sede ? ` en ${nombreSede(sede)}` : "";
  return (
    <EmptyBlock
      title={`No hay corte para ${nombrePeriodo(periodo)}${donde}`}
      hint={
        esAdmin
          ? "El corte lo calcula el administrador del módulo: lee la nómina docente (ms_nom) y los demás insumos que el Warehouse ya tenga cargados, corre el motor de tipología y deja el resultado aquí. Si el Warehouse todavía no tiene la nómina de este periodo y sede, cárguela primero."
          : "El corte lo calcula el administrador del módulo a partir de la nómina docente que está en el Warehouse. Pídale que lo calcule para este periodo y sede."
      }
      action={
        <div className="ct-vacio__acc">
          {esAdmin && (
            <button type="button" className="button-primary" onClick={onCalcular}>
              Calcular el corte
            </button>
          )}
          {onSede && sedesConCorte.length > 0 && (
            <p>
              Sí hay corte de este periodo en:{" "}
              {sedesConCorte.map((s) => (
                <button key={s} type="button" className="ct-link" onClick={() => onSede(s)}>
                  {nombreSede(s)}
                </button>
              ))}
            </p>
          )}
        </div>
      }
    />
  );
}

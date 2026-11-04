/* =============================================================================
   Internacionalización · Convenios (0255): el registro de convenios con su
   tablero, vencimientos, importación del Excel institucional y el detalle a
   pantalla completa (?convenio=<id>, para que «atrás» vuelva al registro).

   La vigencia se calcula con las fechas; la ruta de firma y el cierre se guardan
   a mano. Ver convenios/logica.ts. Las cuatro pestañas se desmontan al salir.
   ========================================================================== */

import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FaltaMigracion } from "../datos";
import { puedeCrear, hoyBogota } from "../lib/permisos";
import { AvisoMigracion, Cargando, ErrorCaja } from "../ui/comunes";
import type { Ctx } from "../ui/comunes";
import { useConvenios } from "./datos";
import { Detalle } from "./Detalle";
import { ImportarExcel } from "./ImportarExcel";
import { NuevoConvenio } from "./NuevoConvenio";
import { Registro } from "./Registro";
import { Tablero } from "./Tablero";
import { Vencimientos } from "./Vencimientos";
import { contar, PLANTILLA_RENOVACION, SIN_FILTROS } from "./logica";
import type { Convenio, Filtros } from "./logica";
import "./convenios.css";

type Pestana = "tablero" | "registro" | "venc" | "importar";

export function Convenios({ ctx }: { ctx: Ctx }) {
  const q = useConvenios();
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const lugar = useLocation();
  const [pestana, setPestana] = useState<Pestana>("tablero");
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [nuevo, setNuevo] = useState(false);
  const animado = useRef(false);

  const crea = ctx.director || ctx.planeacion || puedeCrear(ctx.yo);
  const hoy = hoyBogota();
  const convenios = useMemo<Convenio[]>(() => q.data ?? [], [q.data]);
  const conteos = useMemo(() => contar(convenios, hoy), [convenios, hoy]);

  const PESTANAS: { id: Pestana; rotulo: string; n?: number }[] = [
    { id: "tablero", rotulo: "Tablero" },
    { id: "registro", rotulo: "Registro", n: convenios.length },
    { id: "venc", rotulo: "Vencimientos", n: conteos.porVencer },
    ...(crea ? [{ id: "importar" as const, rotulo: "Depurar e importar Excel" }] : []),
  ];

  const idAbierto = params.get("convenio");
  const abierto = idAbierto ? convenios.find((c) => c.id === idAbierto) : undefined;
  const estadoNav = lugar.state as { desde?: boolean; renovar?: boolean } | null;

  const abrir = useCallback(
    (id: string, renovar = false) => {
      const p = new URLSearchParams(params);
      p.set("convenio", id);
      navegar({ search: `?${p.toString()}` }, { state: { desde: true, renovar } });
    },
    [params, navegar],
  );

  const volver = useCallback(() => {
    if ((lugar.state as { desde?: boolean } | null)?.desde) {
      navegar(-1);
      return;
    }
    const p = new URLSearchParams(params);
    p.delete("convenio");
    setParams(p, { replace: true });
  }, [lugar.state, navegar, params, setParams]);

  const avisar = useCallback(
    (c: Convenio) => {
      navegar(ctx.enlace("relaciones", { plantilla: PLANTILLA_RENOVACION, institucion: c.institucion }));
    },
    [navegar, ctx],
  );

  const alRegistro = (f: { estado?: Filtros["estado"]; pais?: string }) => {
    setFiltros({ ...SIN_FILTROS, estado: f.estado ?? "", pais: f.pais ?? "" });
    setPestana("registro");
  };

  const alTeclear = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = PESTANAS.findIndex((p) => p.id === pestana);
    const sig = PESTANAS[(i + (e.key === "ArrowRight" ? 1 : PESTANAS.length - 1)) % PESTANAS.length].id;
    setPestana(sig);
    window.setTimeout(() => document.getElementById(`conv-t-${sig}`)?.focus(), 0);
  };

  const error = q.error;
  if (error instanceof FaltaMigracion) return <AvisoMigracion error={error} />;
  if (error) return <ErrorCaja error={error} />;
  if (!q.data) return <Cargando texto="Abriendo Convenios…" />;

  return (
    <div className="conv">
      <div className="conv-tabs" role="tablist" aria-label="Convenios" onKeyDown={alTeclear}>
        {PESTANAS.map((p) => (
          <button key={p.id} id={`conv-t-${p.id}`} type="button" role="tab" aria-selected={pestana === p.id} aria-controls="conv-panel" tabIndex={pestana === p.id ? 0 : -1} onClick={() => setPestana(p.id)}>
            {p.rotulo}
            {p.n != null ? <span className="conv-n">{p.n}</span> : null}
          </button>
        ))}
      </div>

      <div id="conv-panel" role="tabpanel" aria-labelledby={`conv-t-${pestana}`} className="conv-vista">
        {pestana === "tablero" ? (
          <Tablero
            convenios={convenios}
            hoy={hoy}
            animar={!animado.current}
            onAnimado={() => {
              animado.current = true;
            }}
            onRegistro={alRegistro}
            onAbrir={(id) => abrir(id)}
          />
        ) : pestana === "registro" ? (
          <Registro convenios={convenios} hoy={hoy} filtros={filtros} onFiltros={setFiltros} crea={crea} onAbrir={(id) => abrir(id)} onImportar={() => setPestana("importar")} onNuevo={() => setNuevo(true)} />
        ) : pestana === "venc" ? (
          <Vencimientos convenios={convenios} hoy={hoy} crea={crea} vencidos={conteos.vencidos} onRenovar={(id) => abrir(id, true)} onAvisar={avisar} onVencidos={() => alRegistro({ estado: "Vencido" })} />
        ) : (
          <ImportarExcel convenios={convenios} onVerRevision={() => alRegistro({ estado: "desajuste" })} onHecho={() => undefined} />
        )}
      </div>

      {nuevo ? (
        <NuevoConvenio
          ctx={ctx}
          convenios={convenios}
          onCerrar={() => setNuevo(false)}
          onCreado={(id) => {
            setNuevo(false);
            setFiltros(SIN_FILTROS);
            abrir(id);
          }}
        />
      ) : null}

      {abierto ? <Detalle key={abierto.id} c={abierto} hoy={hoy} crea={crea} abrirRenovacion={Boolean(estadoNav?.renovar)} onVolver={volver} onAvisar={avisar} /> : null}
    </div>
  );
}

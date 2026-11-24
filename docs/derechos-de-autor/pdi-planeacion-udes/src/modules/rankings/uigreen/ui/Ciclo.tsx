/* =============================================================================
   UI GreenMetric · cabecera del ciclo y sus ventanas: elegir, crear, fechas y
   recordatorios, estado y carpetas. Solo la administración las ve.
   ========================================================================== */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";
import { Icon } from "../../../../components/ui/Icon";
import { useCambiarEstadoCiclo, useCrearCarpetas, useCrearCiclo, useGuardarConfig } from "../datos";
import type { CicloUgm, EstadoCiclo } from "../lib/tipos";
import { Alerta, Campo, Dialogo, Interruptor, fechaCorta } from "./comunes";
import { useUgm } from "./contexto";

const ESTADOS_CICLO: Record<EstadoCiclo, string> = { preparacion: "En preparación", abierto: "Abierto", cerrado: "Cerrado" };

export function CabeceraCiclo({ ciclos, elegido, onElegir }: { ciclos: CicloUgm[]; elegido: CicloUgm; onElegir: (id: string) => void }) {
  const u = useUgm();
  const cambiar = useCambiarEstadoCiclo();
  const carpetas = useCrearCarpetas();
  const [dlg, setDlg] = useState<"nuevo" | "config" | null>(null);

  return (
    <div className="ugm-cab">
      <div className="ugm-cab__ciclo">
        <label htmlFor="ugm-ciclo" className="ugm-sr">
          Ciclo
        </label>
        <select id="ugm-ciclo" className="ugm-input ugm-input--sel" value={elegido.id} onChange={(e) => onElegir(e.target.value)}>
          {ciclos.map((c) => (
            <option key={c.id} value={c.id}>
              Edición {c.anio} · datos {c.anio_datos}
            </option>
          ))}
        </select>
        <span className={`ugm-pill ugm-ciclo-${elegido.estado}`}>{ESTADOS_CICLO[elegido.estado]}</span>
        <span className="ugm-cab__fecha">
          <Icon name="clock" size={16} /> {elegido.fecha_limite ? `Entrega ${fechaCorta(elegido.fecha_limite)}` : "Sin fecha límite"}
        </span>
      </div>
      {u.esAdmin && !u.soloMios && (
        <div className="ugm-cab__acciones">
          {u.cfg && !u.cfg.carpeta_raiz && (
            <button type="button" className="ugm-btn ugm-btn--sm" disabled={carpetas.isPending} onClick={() => void u.hacer(() => carpetas.mutateAsync(elegido.id), "Carpetas creadas en Datos de Sostenibilidad.")}>
              <Icon name="folder" size={16} /> Preparar carpetas
            </button>
          )}
          <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => setDlg("config")}>
            <Icon name="settings" size={16} /> Fechas y avisos
          </button>
          <label className="ugm-sr" htmlFor="ugm-estado-ciclo">
            Estado del ciclo
          </label>
          <select
            id="ugm-estado-ciclo"
            className="ugm-input ugm-input--sel ugm-input--sm"
            value={elegido.estado}
            onChange={(e) => void u.hacer(() => cambiar.mutateAsync({ ciclo: elegido.id, estado: e.target.value as EstadoCiclo }), "Estado del ciclo actualizado.")}
          >
            {(Object.keys(ESTADOS_CICLO) as EstadoCiclo[]).map((k) => (
              <option key={k} value={k}>
                {ESTADOS_CICLO[k]}
              </option>
            ))}
          </select>
          <button type="button" className="ugm-btn ugm-btn--pri ugm-btn--sm" onClick={() => setDlg("nuevo")}>
            <Icon name="plus" size={16} /> Nuevo ciclo
          </button>
        </div>
      )}
      {dlg === "nuevo" && <NuevoCiclo ciclos={ciclos} onCerrar={() => setDlg(null)} onCreado={onElegir} />}
      {dlg === "config" && <ConfigCiclo ciclo={elegido} onCerrar={() => setDlg(null)} />}
    </div>
  );
}

export function NuevoCiclo({ ciclos, onCerrar, onCreado }: { ciclos: CicloUgm[]; onCerrar: () => void; onCreado: (id: string) => void }) {
  const u = useUgm();
  const crear = useCrearCiclo();
  const anioSig = (ciclos[0]?.anio ?? new Date().getFullYear()) + 1;
  const [anio, setAnio] = useState(anioSig);
  const [anioDatos, setAnioDatos] = useState(anioSig - 1);
  const [limite, setLimite] = useState("");
  const [copiar, setCopiar] = useState(ciclos[0]?.id ?? "");
  const valido = anio >= 2020 && anio <= 2100 && anioDatos >= 2015 && anioDatos < anio;

  return (
    <Dialogo titulo="Nuevo ciclo" descripcion="Cada edición de UI GreenMetric reporta los datos del año anterior." onCerrar={onCerrar}>
      <form
        className="ugm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          let id = "";
          const ok = await u.hacer(async () => {
            id = await crear.mutateAsync({ anio, anioDatos, fechaLimite: limite || null, copiarDe: copiar || null });
          }, `Ciclo ${anio} creado.`);
          if (ok) {
            onCreado(id);
            onCerrar();
          }
        }}
      >
        <div className="ugm-grid2">
          <Campo id="nc-anio" etiqueta="Edición (año del ranking)">
            <input id="nc-anio" className="ugm-input ugm-num" type="number" value={anio} min={2020} max={2100} onChange={(e) => setAnio(Number(e.target.value))} autoFocus />
          </Campo>
          <Campo id="nc-datos" etiqueta="Año de los datos" ayuda="Debe ser anterior a la edición.">
            <input id="nc-datos" className="ugm-input ugm-num" type="number" value={anioDatos} min={2015} max={2100} onChange={(e) => setAnioDatos(Number(e.target.value))} />
          </Campo>
        </div>
        <Campo id="nc-limite" etiqueta="Fecha límite de entrega" ayuda="Es la fecha por omisión de todos los indicadores; se cambia por indicador al asignar.">
          <input id="nc-limite" className="ugm-input" type="date" value={limite} onChange={(e) => setLimite(e.target.value)} />
        </Campo>
        {ciclos.length > 0 && (
          <Campo id="nc-copiar" etiqueta="Arrastrar respuestas de" ayuda="Las respuestas del ciclo elegido entran como punto de partida, marcadas «para actualizar».">
            <select id="nc-copiar" className="ugm-input ugm-input--sel" value={copiar} onChange={(e) => setCopiar(e.target.value)}>
              <option value="">No arrastrar nada</option>
              {ciclos.map((c) => (
                <option key={c.id} value={c.id}>
                  Edición {c.anio} · datos {c.anio_datos}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={!valido || crear.isPending}>
            {crear.isPending ? "Creando…" : "Crear ciclo"}
          </button>
        </footer>
      </form>
    </Dialogo>
  );
}

const DIAS_RECORDATORIO = [7, 3, 1, 0];
const SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function ConfigCiclo({ ciclo, onCerrar }: { ciclo: CicloUgm; onCerrar: () => void }) {
  const u = useUgm();
  const guardar = useGuardarConfig();
  const qc = useQueryClient();
  const c = u.cfg;
  const [limite, setLimite] = useState(ciclo.fecha_limite ?? "");
  const [perDesde, setPerDesde] = useState(c?.periodo_ref_desde ?? "");
  const [perHasta, setPerHasta] = useState(c?.periodo_ref_hasta ?? "");
  const [envDesde, setEnvDesde] = useState(c?.envio_desde ?? "");
  const [envHasta, setEnvHasta] = useState(c?.envio_hasta ?? "");
  const [dias, setDias] = useState<number[]>(c?.recordatorio_dias ?? DIAS_RECORDATORIO);
  const [resumen, setResumen] = useState(c?.resumen_semanal ?? true);
  const [diaResumen, setDiaResumen] = useState(c?.resumen_dia ?? 1);
  const [universidad, setUniversidad] = useState(c?.universidad ?? "");
  const [pais, setPais] = useState(c?.pais ?? "");
  const [web, setWeb] = useState(c?.web ?? "");

  if (!c) {
    return (
      <Dialogo titulo="Fechas y avisos" onCerrar={onCerrar}>
        <Alerta tipo="aviso">Este ciclo todavía no tiene configuración. Vuelva a abrirlo en unos segundos.</Alerta>
      </Dialogo>
    );
  }
  const n = (v: string) => v || null;
  return (
    <Dialogo titulo="Fechas y avisos" descripcion="Se aplican a todo el ciclo. Los avisos salen por correo desde la cola." onCerrar={onCerrar} ancho={640}>
      <form
        className="ugm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await u.hacer(async () => {
            await guardar.mutateAsync({
              ciclo: ciclo.id,
              cambios: { periodo_ref_desde: n(perDesde), periodo_ref_hasta: n(perHasta), envio_desde: n(envDesde), envio_hasta: n(envHasta), recordatorio_dias: dias, resumen_semanal: resumen, resumen_dia: diaResumen, universidad, pais, web },
            });
            if (limite !== (ciclo.fecha_limite ?? "")) {
              const r = await supabase.from("ranking_cycles").update({ fecha_limite: n(limite) }).eq("id", ciclo.id);
              if (r.error) throw new Error("No se pudo cambiar la fecha límite del ciclo. " + r.error.message);
              await qc.invalidateQueries({ queryKey: ["ugm", "ciclos"] });
            }
          }, "Configuración guardada.");
          if (ok) onCerrar();
        }}
      >
        <Campo id="cf-limite" etiqueta="Fecha límite de entrega del ciclo">
          <input id="cf-limite" className="ugm-input" type="date" value={limite} onChange={(e) => setLimite(e.target.value)} autoFocus />
        </Campo>
        <fieldset className="ugm-fs">
          <legend>Periodo de los datos</legend>
          <div className="ugm-grid2">
            <Campo id="cf-pd" etiqueta="Desde">
              <input id="cf-pd" className="ugm-input" type="date" value={perDesde} onChange={(e) => setPerDesde(e.target.value)} />
            </Campo>
            <Campo id="cf-ph" etiqueta="Hasta">
              <input id="cf-ph" className="ugm-input" type="date" value={perHasta} onChange={(e) => setPerHasta(e.target.value)} />
            </Campo>
          </div>
        </fieldset>
        <fieldset className="ugm-fs">
          <legend>Ventana de envío a UI GreenMetric</legend>
          <div className="ugm-grid2">
            <Campo id="cf-ed" etiqueta="Abre">
              <input id="cf-ed" className="ugm-input" type="date" value={envDesde} onChange={(e) => setEnvDesde(e.target.value)} />
            </Campo>
            <Campo id="cf-eh" etiqueta="Cierra">
              <input id="cf-eh" className="ugm-input" type="date" value={envHasta} onChange={(e) => setEnvHasta(e.target.value)} />
            </Campo>
          </div>
        </fieldset>
        <fieldset className="ugm-fs">
          <legend>Recordatorios (días antes del vencimiento)</legend>
          <div className="ugm-chips">
            {DIAS_RECORDATORIO.map((d) => (
              <button key={d} type="button" className="ugm-chip" aria-pressed={dias.includes(d)} onClick={() => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d].sort((a, b) => b - a))}>
                {d === 0 ? "El día" : `${d} ${d === 1 ? "día" : "días"}`}
              </button>
            ))}
          </div>
          <Interruptor activo={resumen} onChange={setResumen} etiqueta="Resumen semanal para la administración" detalle={`Se prepara el ${SEMANA[diaResumen]}.`} />
          {resumen && (
            <Campo id="cf-dia" etiqueta="Día del resumen">
              <select id="cf-dia" className="ugm-input ugm-input--sel" value={diaResumen} onChange={(e) => setDiaResumen(Number(e.target.value))}>
                {SEMANA.map((s, i) => (
                  <option key={s} value={i}>
                    {s}
                  </option>
                ))}
              </select>
            </Campo>
          )}
        </fieldset>
        <fieldset className="ugm-fs">
          <legend>Encabezado de las plantillas</legend>
          <Campo id="cf-uni" etiqueta="Universidad">
            <input id="cf-uni" className="ugm-input" value={universidad} onChange={(e) => setUniversidad(e.target.value)} />
          </Campo>
          <div className="ugm-grid2">
            <Campo id="cf-pais" etiqueta="País">
              <input id="cf-pais" className="ugm-input" value={pais} onChange={(e) => setPais(e.target.value)} />
            </Campo>
            <Campo id="cf-web" etiqueta="Sitio web">
              <input id="cf-web" className="ugm-input" value={web} onChange={(e) => setWeb(e.target.value)} />
            </Campo>
          </div>
        </fieldset>
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar"}
          </button>
        </footer>
      </form>
    </Dialogo>
  );
}

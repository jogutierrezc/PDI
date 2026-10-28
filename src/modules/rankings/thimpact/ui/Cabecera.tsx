/* =============================================================================
   THE Impact · cabecera del ciclo y sus ventanas: elegir el ciclo, crear uno nuevo,
   fechas y avisos, estado y carpetas. Solo la administración ve las acciones.
   Mismo patrón y mismas piezas que UI GreenMetric (Ciclo.tsx).
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { RankingCycleRow } from "../../../../types/database";
import { Alerta, Campo, Dialogo, Interruptor, fechaCorta } from "../../uigreen/ui/comunes";
import { useCambiarEstadoCicloThi, useCrearCarpetasThi, useCrearCicloThi, useGuardarConfigThi } from "../datos";
import { METODOLOGIA } from "../lib/metodologia";
import { useThi, useThiOpcional } from "./contexto";

type EstadoCiclo = RankingCycleRow["estado"];
export const ESTADOS_CICLO: Record<EstadoCiclo, string> = { preparacion: "En preparación", abierto: "Abierto", cerrado: "Cerrado" };

export function CabeceraCiclo() {
  const t = useThi();
  const cambiar = useCambiarEstadoCicloThi();
  const carpetas = useCrearCarpetasThi();
  const [dlg, setDlg] = useState<"nuevo" | "config" | null>(null);
  const { ciclo } = t;

  return (
    <div className="ugm-cab thi-cab">
      <div className="ugm-cab__ciclo">
        <label htmlFor="thi-ciclo" className="ugm-sr">
          Ciclo
        </label>
        <select id="thi-ciclo" className="ugm-input ugm-input--sel" value={ciclo.id} onChange={(e) => t.elegirCiclo(e.target.value)}>
          {t.ciclos.map((c) => (
            <option key={c.id} value={c.id}>
              Edición {c.anio} · datos {c.anio_datos}
            </option>
          ))}
        </select>
        <span className={`ugm-pill ugm-ciclo-${ciclo.estado}`}>{ESTADOS_CICLO[ciclo.estado]}</span>
        <span className="ugm-cab__fecha">
          <Icon name="clock" size={16} /> {ciclo.fecha_limite ? `Entrega ${fechaCorta(ciclo.fecha_limite)}` : "Sin fecha límite"}
        </span>
      </div>
      {t.esAdmin && (
        <div className="ugm-cab__acciones">
          {t.cfg && !t.cfg.carpeta_raiz && (
            <button
              type="button"
              className="ugm-btn ugm-btn--sm"
              disabled={carpetas.isPending}
              onClick={() => void t.hacer(() => carpetas.mutateAsync(ciclo.id), "Carpetas creadas en Datos de Sostenibilidad.")}
            >
              <Icon name="folder" size={16} /> Preparar carpetas
            </button>
          )}
          <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => setDlg("config")}>
            <Icon name="settings" size={16} /> Fechas y avisos
          </button>
          <label className="ugm-sr" htmlFor="thi-estado-ciclo">
            Estado del ciclo
          </label>
          <select
            id="thi-estado-ciclo"
            className="ugm-input ugm-input--sel ugm-input--sm"
            value={ciclo.estado}
            onChange={(e) => void t.hacer(() => cambiar.mutateAsync({ ciclo: ciclo.id, estado: e.target.value as EstadoCiclo }), "Estado del ciclo actualizado.")}
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
      {dlg === "nuevo" && <NuevoCiclo onCerrar={() => setDlg(null)} />}
      {dlg === "config" && <ConfigCiclo onCerrar={() => setDlg(null)} />}
    </div>
  );
}

/** Crear un ciclo. Se abre desde la cabecera o, si aún no hay ninguno, desde la pantalla vacía (sin contexto de ciclo). */
export function NuevoCiclo({ ciclos, onCerrar, onCreado }: { ciclos?: RankingCycleRow[]; onCerrar: () => void; onCreado?: (id: string) => void }) {
  const ctx = useThiOpcional();
  const lista = ciclos ?? ctx?.ciclos ?? [];
  const crear = useCrearCicloThi();
  // Por omisión, la edición de la metodología vigente (2027, datos del año académico 2025) o la siguiente a la última creada.
  const siguiente = lista.length ? Math.max(...lista.map((c) => c.anio)) + 1 : METODOLOGIA.edicion;
  const [anio, setAnio] = useState(siguiente);
  const [anioDatos, setAnioDatos] = useState(anio === METODOLOGIA.edicion ? METODOLOGIA.anioDatos : anio - 2);
  const [limite, setLimite] = useState("");
  const [copiar, setCopiar] = useState(lista[0]?.id ?? "");
  const [error, setError] = useState("");
  const valido = anio >= 2020 && anio <= 2100 && anioDatos >= 2015 && anioDatos < anio && !lista.some((c) => c.anio === anio);

  const cambiarAnio = (v: number) => {
    setAnio(v);
    setAnioDatos(v === METODOLOGIA.edicion ? METODOLOGIA.anioDatos : v - 2);
  };

  return (
    <Dialogo titulo="Nuevo ciclo" descripcion="Cada edición de THE Impact reporta el año académico que termina dos años antes: la edición 2027 pide el 2025." onCerrar={onCerrar}>
      <form
        className="ugm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const id = await crear.mutateAsync({ anio, anioDatos, fechaLimite: limite || null, copiarDe: copiar || null });
            ctx?.avisar(`Ciclo ${anio} creado en preparación.`);
            onCreado?.(id);
            onCerrar();
          } catch (x) {
            setError(x instanceof Error ? x.message : "No se pudo crear el ciclo.");
          }
        }}
      >
        <div className="ugm-grid2">
          <Campo id="thi-nc-anio" etiqueta="Edición (año del ranking)">
            <input id="thi-nc-anio" className="ugm-input ugm-num" type="number" value={anio} min={2020} max={2100} onChange={(e) => cambiarAnio(Number(e.target.value))} autoFocus />
          </Campo>
          <Campo id="thi-nc-datos" etiqueta="Año de los datos" ayuda="Debe ser anterior a la edición.">
            <input id="thi-nc-datos" className="ugm-input ugm-num" type="number" value={anioDatos} min={2015} max={2100} onChange={(e) => setAnioDatos(Number(e.target.value))} />
          </Campo>
        </div>
        <Campo id="thi-nc-limite" etiqueta="Fecha límite de entrega" ayuda="Se puede cambiar después en «Fechas y avisos».">
          <input id="thi-nc-limite" className="ugm-input" type="date" value={limite} onChange={(e) => setLimite(e.target.value)} />
        </Campo>
        {lista.length > 0 && (
          <Campo id="thi-nc-copiar" etiqueta="Traer el catálogo y las asignaciones de" ayuda="Se copian los indicadores, las oficinas asignadas y los ODS priorizados. Las respuestas no: son del año de los datos.">
            <select id="thi-nc-copiar" className="ugm-input ugm-input--sel" value={copiar} onChange={(e) => setCopiar(e.target.value)}>
              <option value="">No traer nada (importaré el Excel de THE)</option>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>
                  Edición {c.anio} · datos {c.anio_datos}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {lista.some((c) => c.anio === anio) && <p className="ugm-error" role="alert">Ya existe el ciclo de la edición {anio}.</p>}
        {error && <p className="ugm-error" role="alert">{error}</p>}
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
const SEMANA = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function ConfigCiclo({ onCerrar }: { onCerrar: () => void }) {
  const t = useThi();
  const guardar = useGuardarConfigThi();
  const c = t.cfg;
  const { ciclo } = t;
  const [limite, setLimite] = useState(ciclo.fecha_limite ?? "");
  const [perDesde, setPerDesde] = useState(c?.periodo_ref_desde ?? "");
  const [perHasta, setPerHasta] = useState(c?.periodo_ref_hasta ?? "");
  const [envDesde, setEnvDesde] = useState(c?.envio_desde ?? "");
  const [envHasta, setEnvHasta] = useState(c?.envio_hasta ?? "");
  const [anioAcad, setAnioAcad] = useState(c?.anio_academico ?? ciclo.anio_datos);
  const [ods, setOds] = useState<number[]>(ciclo.ods_priorizados);
  const [dias, setDias] = useState<number[]>(c?.recordatorio_dias ?? DIAS_RECORDATORIO);
  const [avisos, setAvisos] = useState(c?.avisos_activos ?? true);
  const [resumen, setResumen] = useState(c?.resumen_semanal ?? true);
  const [diaResumen, setDiaResumen] = useState(c?.resumen_dia ?? 1);
  const [universidad, setUniversidad] = useState(c?.universidad ?? "");
  const [pais, setPais] = useState(c?.pais ?? "");
  const [web, setWeb] = useState(c?.web ?? "");

  if (!c) {
    return (
      <Dialogo titulo="Fechas y avisos" onCerrar={onCerrar}>
        <Alerta tipo="aviso">Este ciclo todavía no tiene configuración. Aplique la migración 0237 o vuelva a abrirlo en unos segundos.</Alerta>
      </Dialogo>
    );
  }
  const n = (v: string) => v || null;
  const sinSeventeen = !ods.includes(METODOLOGIA.odsObligatorio);
  return (
    <Dialogo titulo="Fechas y avisos" descripcion="Se aplican a todo el ciclo. Los avisos salen por correo desde la cola." onCerrar={onCerrar} ancho={640}>
      <form
        className="ugm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await t.hacer(
            () =>
              guardar.mutateAsync({
                ciclo: ciclo.id,
                fechaLimite: n(limite),
                ods,
                cambios: {
                  fecha_limite: true,
                  anio_academico: anioAcad,
                  periodo_ref_desde: n(perDesde),
                  periodo_ref_hasta: n(perHasta),
                  envio_desde: n(envDesde),
                  envio_hasta: n(envHasta),
                  recordatorio_dias: dias,
                  resumen_semanal: resumen,
                  resumen_dia: diaResumen,
                  avisos_activos: avisos,
                  universidad,
                  pais,
                  web,
                },
              }),
            "Configuración guardada.",
          );
          if (ok) onCerrar();
        }}
      >
        <Campo id="thi-cf-limite" etiqueta="Fecha límite de entrega del ciclo" ayuda="Es la fecha de los recordatorios y del resumen semanal.">
          <input id="thi-cf-limite" className="ugm-input" type="date" value={limite} onChange={(e) => setLimite(e.target.value)} autoFocus />
        </Campo>
        <fieldset className="ugm-fs">
          <legend>ODS que responde la universidad</legend>
          <div className="ugm-chips">
            {Array.from({ length: 17 }, (_, i) => i + 1).map((o) => (
              <button
                key={o}
                type="button"
                className="ugm-chip ugm-chip--num"
                aria-pressed={ods.includes(o)}
                aria-label={`ODS ${o}`}
                onClick={() => setOds(ods.includes(o) ? ods.filter((x) => x !== o) : [...ods, o].sort((a, b) => a - b))}
              >
                {o}
              </button>
            ))}
          </div>
          <p className="ugm-peq ugm-muted">THE pide al menos {METODOLOGIA.minimoOds} ODS para la clasificación general y el ODS {METODOLOGIA.odsObligatorio} es obligatorio.</p>
          {(ods.length < METODOLOGIA.minimoOds || sinSeventeen) && (
            <Alerta tipo="aviso">
              {sinSeventeen ? `Falta el ODS ${METODOLOGIA.odsObligatorio}, que THE exige para entrar en la clasificación general. ` : ""}
              {ods.length < METODOLOGIA.minimoOds ? `Hay ${ods.length} ODS; THE pide al menos ${METODOLOGIA.minimoOds}.` : ""}
            </Alerta>
          )}
        </fieldset>
        <fieldset className="ugm-fs">
          <legend>Periodo de los datos</legend>
          <div className="ugm-grid2">
            <Campo id="thi-cf-aa" etiqueta="Año académico que termina en" ayuda="THE 2027 pide el año que termina en 2025.">
              <input id="thi-cf-aa" className="ugm-input ugm-num" type="number" value={anioAcad} min={2015} max={2100} onChange={(e) => setAnioAcad(Number(e.target.value))} />
            </Campo>
            <span />
            <Campo id="thi-cf-pd" etiqueta="Desde">
              <input id="thi-cf-pd" className="ugm-input" type="date" value={perDesde} onChange={(e) => setPerDesde(e.target.value)} />
            </Campo>
            <Campo id="thi-cf-ph" etiqueta="Hasta">
              <input id="thi-cf-ph" className="ugm-input" type="date" value={perHasta} onChange={(e) => setPerHasta(e.target.value)} />
            </Campo>
          </div>
        </fieldset>
        <fieldset className="ugm-fs">
          <legend>Ventana de envío a THE</legend>
          <div className="ugm-grid2">
            <Campo id="thi-cf-ed" etiqueta="Abre">
              <input id="thi-cf-ed" className="ugm-input" type="date" value={envDesde} onChange={(e) => setEnvDesde(e.target.value)} />
            </Campo>
            <Campo id="thi-cf-eh" etiqueta="Cierra">
              <input id="thi-cf-eh" className="ugm-input" type="date" value={envHasta} onChange={(e) => setEnvHasta(e.target.value)} />
            </Campo>
          </div>
        </fieldset>
        <fieldset className="ugm-fs">
          <legend>Avisos por correo</legend>
          <Interruptor activo={avisos} onChange={setAvisos} etiqueta="Enviar avisos de este ciclo" detalle="Solo salen con el ciclo abierto: asignación, envío, devolución, aprobación y recordatorios." />
          <p className="ugm-peq ugm-muted">Recordatorios, en días antes del vencimiento:</p>
          <div className="ugm-chips">
            {DIAS_RECORDATORIO.map((d) => (
              <button key={d} type="button" className="ugm-chip" aria-pressed={dias.includes(d)} onClick={() => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d].sort((a, b) => b - a))}>
                {d === 0 ? "El día" : `${d} ${d === 1 ? "día" : "días"}`}
              </button>
            ))}
          </div>
          <Interruptor activo={resumen} onChange={setResumen} etiqueta="Resumen semanal para la administración" detalle={`Se prepara el ${SEMANA[diaResumen]}.`} />
          {resumen && (
            <Campo id="thi-cf-dia" etiqueta="Día del resumen">
              <select id="thi-cf-dia" className="ugm-input ugm-input--sel" value={diaResumen} onChange={(e) => setDiaResumen(Number(e.target.value))}>
                {SEMANA.slice(1).map((s, i) => (
                  <option key={s} value={i + 1}>
                    {s}
                  </option>
                ))}
              </select>
            </Campo>
          )}
        </fieldset>
        <fieldset className="ugm-fs">
          <legend>Encabezado de los correos</legend>
          <Campo id="thi-cf-uni" etiqueta="Universidad">
            <input id="thi-cf-uni" className="ugm-input" value={universidad} onChange={(e) => setUniversidad(e.target.value)} />
          </Campo>
          <div className="ugm-grid2">
            <Campo id="thi-cf-pais" etiqueta="País">
              <input id="thi-cf-pais" className="ugm-input" value={pais} onChange={(e) => setPais(e.target.value)} />
            </Campo>
            <Campo id="thi-cf-web" etiqueta="Sitio web">
              <input id="thi-cf-web" className="ugm-input" value={web} onChange={(e) => setWeb(e.target.value)} />
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

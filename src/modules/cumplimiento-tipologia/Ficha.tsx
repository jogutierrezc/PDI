/* =============================================================================
   Cumplimiento de Tipología · la ficha del profesor: una ventana amplia a la
   derecha con pestañas (Resumen, Desglose, Semana, Preventivas y recomendaciones,
   Contrato y, solo para el administrador del módulo, Observaciones para Master).

   REGLA CRÍTICA. La pestaña «Observaciones para Master» solo se monta si la
   persona es administradora del módulo, y aun así los textos solo llegan si la
   política de ct_observacion_master los deja pasar: la pantalla no es la barrera,
   la base lo es.
   ========================================================================== */

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useDetalle, useObservacionMaster } from "./api";
import { copiarAlPortapapeles, MAX_MASTER } from "./motor/observacion255";
import { REGLAS_BASE, TIPO } from "./motor/tipologia";
import { DIAS, FRANJAS } from "./motor/lectores";
import { CANASTAS_UI, FUENTE_TEXTO, abreviado, conNombre, horas, iniciales, nombreLegible, type NivelCt, type Observacion, type Resumen } from "./modelo";
import { ChipMaster, PerfilTag } from "./partes";

type Pestana = "resumen" | "desglose" | "semana" | "prev" | "contrato" | "master";

/** Más de estas horas de clase en un día se marcan en la semana (criterio de la maqueta aprobada). */
const HORAS_DIA_ALTO = 10;

const ORDEN_TIPOS = [TIPO.INCUMPLIMIENTO, TIPO.CONSIDERACION, TIPO.PREVENTIVA, TIPO.CODIFICACION, TIPO.RECOMENDACION, TIPO.FUENTE];
const TONO_TIPO: Record<string, string> = {
  [TIPO.INCUMPLIMIENTO]: "risk",
  [TIPO.PREVENTIVA]: "wait",
  [TIPO.CODIFICACION]: "accent",
  [TIPO.RECOMENDACION]: "accent",
  [TIPO.FUENTE]: "wait",
  [TIPO.CONSIDERACION]: "ok",
};

function Recomendacion({ fila }: { fila: Resumen }) {
  const s = fila.sugerencia;
  const cercano = fila.comparacion.find((c) => c.perfil === fila.perfil_sugerido);
  if (s === "mantener")
    return (
      <div className="ct-rec">
        <h4>Mantener {fila.perfil}</h4>
        <p>La carga total y las reglas del perfil actual están dentro de lo permitido.</p>
      </div>
    );
  if (s === "cambiar")
    return (
      <div className="ct-rec">
        <h4>
          Planear como <PerfilTag perfil={fila.perfil_sugerido ?? ""} sugerido /> en lugar de {fila.perfil}
        </h4>
        <p>
          Con las horas que el profesor ya tiene, {fila.perfil_sugerido} ({REGLAS_BASE[fila.perfil_sugerido ?? ""]?.nombre?.toLowerCase() ?? "otro perfil"}) cumple todas las reglas y la carga total. No hace falta mover horas.
        </p>
      </div>
    );
  if (s === "ajustar")
    return (
      <div className="ct-rec">
        <h4>Ajustar la carga{fila.perfil_sugerido ? ` hacia ${fila.perfil_sugerido}` : ""}</h4>
        <p>
          {fila.perfil_sugerido && cercano
            ? `${fila.perfil_sugerido} es el perfil más cercano, pero aún deja ${cercano.incumplimientos} regla${cercano.incumplimientos > 1 ? "s" : ""} sin cumplir. `
            : `Ningún perfil de ${fila.horas_esperadas ?? fila.horas_total} h cumple con estas horas. `}
          Siga las recomendaciones de la pestaña Preventivas y recomendaciones para mover horas.
        </p>
      </div>
    );
  return (
    <div className="ct-rec">
      <h4>Sin recomendación de perfil</h4>
      <p>{fila.lectura_operativa || "El modelo no evalúa este perfil automáticamente."}</p>
    </div>
  );
}

function PestanaResumen({ fila, observaciones }: { fila: Resumen; observaciones: Observacion[] | undefined }) {
  const maxInc = Math.max(1, ...fila.comparacion.map((c) => c.incumplimientos));
  const miradas = (observaciones ?? []).filter((o) => o.tipo === TIPO.INCUMPLIMIENTO || o.tipo === TIPO.PREVENTIVA).slice(0, 3);
  return (
    <>
      <Recomendacion fila={fila} />
      <div className="ct-cols">
        <div className="ct-panel">
          <h2 className="ct-h2">Comparación de perfiles</h2>
          <p className="ct-sub">Cuántas reglas incumpliría con las horas actuales cada perfil de {fila.horas_esperadas ?? "las mismas"} h</p>
          {fila.comparacion.length === 0 ? (
            <p className="ct-vacio">Este perfil no se compara con los de la tipología profesoral.</p>
          ) : (
            [...fila.comparacion]
              .sort((a, b) => a.incumplimientos - b.incumplimientos)
              .map((c) => (
                <div className="ct-fit" key={c.perfil}>
                  <span>
                    <PerfilTag perfil={c.perfil} sugerido={c.perfil === fila.perfil_sugerido && fila.sugerencia === "cambiar"} />
                  </span>
                  <span className="ct-bar" aria-hidden="true">
                    <i style={{ width: `${c.incumplimientos === 0 ? 100 : Math.max(6, ((maxInc - c.incumplimientos) / maxInc) * 100)}%` }} />
                  </span>
                  <span className="ct-num">
                    <b>{c.incumplimientos === 0 ? "Cumple" : `${c.incumplimientos} sin cumplir`}</b>
                    {c.actual ? " · actual" : c.perfil === fila.perfil_sugerido && fila.sugerencia === "cambiar" ? " · sugerido" : ""}
                  </span>
                </div>
              ))
          )}
        </div>
        <div className="ct-panel">
          <h2 className="ct-h2">Lo que hay que mirar</h2>
          <p className="ct-sub">Primeras preventivas del periodo</p>
          {observaciones === undefined ? (
            <p className="ct-vacio">Cargando…</p>
          ) : miradas.length > 0 ? (
            miradas.map((o) => (
              <div className="ct-pv" key={o.id}>
                <span className="ct-pv__t">{o.texto}</span>
              </div>
            ))
          ) : (
            <p className="ct-vacio">Sin preventivas. La carga cuadra con el contrato.</p>
          )}
        </div>
      </div>
    </>
  );
}

function PestanaDesglose({ fila }: { fila: Resumen }) {
  const rangos = fila.desglose ?? [];
  const escala = Math.max(1, ...rangos.map((r) => Math.max(r.horas, r.max ?? 0, r.min ?? 0))) + 2;
  return (
    <>
      <div className="ct-panel">
        <h2 className="ct-h2">Desglose de la tipología frente a {fila.perfil}</h2>
        <p className="ct-sub">La banda es lo permitido para el perfil. La barra son las horas del profesor.</p>
        {rangos.length === 0 ? (
          <p className="ct-vacio">Este perfil no se evalúa por rubros: su regla es el total de horas del contrato.</p>
        ) : (
          rangos.map((r) => {
            const sinTope = r.min == null && r.max == null;
            const malo = (r.max != null && r.horas > r.max) || (r.min != null && r.horas < r.min);
            const desde = r.min ?? 0;
            const hasta = r.max ?? escala;
            return (
              <div className="ct-bul" key={r.campo}>
                <span>{r.nombre}</span>
                <div className="ct-trk" role="img" aria-label={`${r.nombre} ${horas(r.horas)} horas${sinTope ? ", sin tope en este perfil" : `, permitido ${r.min != null ? `desde ${horas(r.min)}` : ""}${r.min != null && r.max != null ? " " : ""}${r.max != null ? `hasta ${horas(r.max)}` : ""} horas`}`}>
                  {!sinTope && <div className="ct-allow" style={{ left: `${(desde / escala) * 100}%`, width: `${((hasta - desde) / escala) * 100}%` }} />}
                  <div className="ct-val" data-t={sinTope ? "neutral" : malo ? "risk" : "ok"} style={{ width: `${(Math.max(r.horas, 0.3) / escala) * 100}%` }} />
                </div>
                <span className="ct-txt ct-num">
                  <b data-t={sinTope ? "neutral" : malo ? "risk" : "ok"}>
                    {!sinTope && <Icon name={malo ? "alert" : "check"} size={14} />}
                    {horas(r.horas)} h
                  </b>
                  <small>
                    {sinTope ? "sin tope en este perfil" : r.min != null && r.max != null ? `permitido ${horas(r.min)} a ${horas(r.max)} h` : r.max != null ? `hasta ${horas(r.max)} h` : `desde ${horas(r.min)} h`}
                  </small>
                </span>
              </div>
            );
          })
        )}
        <div className="ct-legendnote">
          <span>
            Carga total <b className="ct-num">{horas(fila.horas_total)} h</b>
            {fila.horas_esperadas != null ? ` de ${horas(fila.horas_esperadas)} h del contrato` : ""}
          </span>
        </div>
      </div>
      <div className="ct-panel">
        <h2 className="ct-h2">Horas por canasta de Master</h2>
        <p className="ct-sub">Cómo las agrupa Master: la tipología razona con el desglose de arriba.</p>
        <ul className="ct-hrs">
          {CANASTAS_UI.map((c) => (
            <li key={c.campo}>
              <span className="ct-dot" style={{ background: c.color }} />
              <span>{c.nombre}</span>
              <b className="ct-num">{horas(fila[c.campo])} h</b>
              <span className="ct-pct ct-num">{fila.horas_total > 0 ? Math.round((Number(fila[c.campo]) / fila.horas_total) * 100) : 0} %</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function PestanaSemana({ fila }: { fila: Resumen }) {
  const semana = fila.semana;
  if (!semana)
    return (
      <div className="ct-panel">
        <h2 className="ct-h2">Distribución semanal</h2>
        <p className="ct-vacio">
          Este profesor no aparece en el horario del corte. Puede ser que todavía no tenga clases programadas, o que el Warehouse no tuviera cargados los horarios por departamento (ms_hordep) cuando se calculó.
        </p>
      </div>
    );
  const totales = semana.map((d) => d.reduce((a, x) => a + x, 0));
  const enHorario = totales.reduce((a, x) => a + x, 0);
  return (
    <div className="ct-panel">
      <h2 className="ct-h2">Distribución semanal</h2>
      <p className="ct-sub">Horas de clase por día y franja. Más de {HORAS_DIA_ALTO} h en un día se marca.</p>
      <div className="ct-week">
        <span />
        {DIAS.map((d) => (
          <div className="ct-dh2" key={d}>
            {d}
          </div>
        ))}
        {FRANJAS.map((franja, j) => (
          <FranjaFila key={franja} nombre={franja} celdas={semana.map((d) => d[j] ?? 0)} />
        ))}
        <div className="ct-lab">Total día</div>
        {totales.map((t, i) => (
          <div className="ct-dtot ct-num" data-over={t > HORAS_DIA_ALTO || undefined} key={DIAS[i]}>
            {t > HORAS_DIA_ALTO && <Icon name="alert" size={13} />}
            {horas(t)} h
          </div>
        ))}
      </div>
      <p className="ct-nota">
        Son las <b className="ct-num">{horas(enHorario)} h</b> de clase que están en el horario de Master (de {horas(fila.horas_total)} h de la carga). Las demás actividades no tienen día ni hora.
      </p>
    </div>
  );
}

function FranjaFila({ nombre, celdas }: { nombre: string; celdas: number[] }) {
  return (
    <>
      <div className="ct-lab">{nombre}</div>
      {celdas.map((v, i) => (
        <div key={DIAS[i]} className="ct-cell ct-num" data-hi={v >= 3 || undefined} data-z={v === 0 || undefined} style={{ "--p": Math.min((v / 4) * 85, 85) } as CSSProperties}>
          {v > 0 ? horas(v) : "·"}
        </div>
      ))}
    </>
  );
}

function PestanaPreventivas({ fila, observaciones }: { fila: Resumen; observaciones: Observacion[] }) {
  const grupos = ORDEN_TIPOS.map((tipo) => ({ tipo, items: observaciones.filter((o) => o.tipo === tipo) })).filter((g) => g.items.length > 0);
  return (
    <>
      <div className="ct-panel">
        <h2 className="ct-h2">Preventivas y recomendaciones</h2>
        <p className="ct-sub">Lo que el motor encontró en la carga de este profesor, con la regla que la origina</p>
        {grupos.length === 0 ? (
          <p className="ct-vacio">Sin preventivas en este periodo.</p>
        ) : (
          grupos.map((g) => (
            <div className="ct-grupo" key={g.tipo}>
              <h3 className="ct-h3">
                <span className="ct-chip" data-t={TONO_TIPO[g.tipo] ?? "neutral"}>
                  {g.tipo}
                </span>
                <span className="ct-num">{g.items.length}</span>
              </h3>
              {g.items.map((o) => (
                <div className="ct-pv" key={o.id}>
                  <span className="ct-pv__t">
                    <span className="ct-chip" data-t="neutral">
                      {o.categoria}
                    </span>{" "}
                    {o.texto}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <Recomendacion fila={fila} />
    </>
  );
}

function PestanaContrato({ fila, grupos, sede, periodo }: { fila: Resumen; grupos: { id: number; codigo: string; nombre: string; grupo: string; afectacion: string }[]; sede: string; periodo: string }) {
  const perfil = REGLAS_BASE[fila.perfil];
  const carga = [...fila.carga].sort((a, b) => b.h - a.h);
  return (
    <>
      <div className="ct-panel">
        <h2 className="ct-h2">Contrato</h2>
        <dl className="ct-dl">
          <dt>Perfil</dt>
          <dd>
            {fila.perfil}
            {perfil ? ` · ${perfil.nombre}` : ""}
          </dd>
          <dt>Contrato en Master</dt>
          <dd>{fila.contrato || "Sin dato"}</dd>
          <dt>Duración</dt>
          <dd>{fila.duracion || "Sin dato"}</dd>
          <dt>Escalafón</dt>
          <dd>{fila.escalafon || "Sin dato"}</dd>
          <dt>Horas del contrato</dt>
          <dd className="ct-num">{fila.horas_esperadas != null ? `${horas(fila.horas_esperadas)} h por semana` : "No aplica"}</dd>
          <dt>Horas asignadas</dt>
          <dd className="ct-num">{horas(fila.horas_total)} h</dd>
          <dt>Estado en Master</dt>
          <dd>
            <ChipMaster estado={fila.estado_master} />
            {fila.estado_master === "PREAPROBADA" && <span className="ct-muted"> · preaprobación {fila.preaprobacion === "MANUAL" ? "manual" : "automática"}</span>}
          </dd>
          <dt>Lectura operativa</dt>
          <dd>{fila.lectura_operativa}</dd>
          <dt>Nómina</dt>
          <dd>{FUENTE_TEXTO[fila.fuente_nomina] ?? "Sin dato"}</dd>
          <dt>Programa y sede</dt>
          <dd>
            {fila.programa || "Sin programa"}, {sede} · {periodo}
          </dd>
        </dl>
      </div>
      {grupos.length > 0 && (
        <div className="ct-panel">
          <h2 className="ct-h2">Grupos sin matrícula</h2>
          <p className="ct-sub">Grupos de este profesor con cero matriculados</p>
          {grupos.map((g) => (
            <div className="ct-pv" key={g.id}>
              <span className="ct-pv__t">
                {g.codigo} · {g.nombre || "Sin nombre"} · grupo {g.grupo}
              </span>
              <span className="ct-muted">{g.afectacion}</span>
            </div>
          ))}
        </div>
      )}
      <div className="ct-panel">
        <h2 className="ct-h2">Actividades de la nómina</h2>
        <p className="ct-sub">{carga.length} actividades, de mayor a menor número de horas</p>
        <div className="ct-tbl-scroll">
          <table className="ct-tbl ct-tbl--chica">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Tipo en Master</th>
                <th scope="col">Horas</th>
              </tr>
            </thead>
            <tbody>
              {carga.slice(0, 60).map((a, i) => (
                <tr key={`${a.c}-${i}`}>
                  <td>{a.c}</td>
                  <td>{a.t || "Sin tipo"}</td>
                  <td className="ct-num">{horas(a.h)} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {carga.length > 60 && <p className="ct-nota">Se muestran las 60 de mayor carga.</p>}
      </div>
    </>
  );
}

function PestanaMaster({ fila, nombre }: { fila: Resumen; nombre: string | undefined }) {
  const q = useObservacionMaster(fila.id, true);
  const [aviso, setAviso] = useState("");
  if (q.isPending) return <LoadingBlock rows={3} label="Leyendo las observaciones para Master" />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <EmptyBlock title="Sin observaciones para Master" hint="Este corte no guardó la observación de este profesor. Calcule el corte de nuevo." />;
  const corta = q.data.observacion_255;
  const copiar = async () => setAviso((await copiarAlPortapapeles(corta)) ? "Copiado" : "Seleccione el texto y cópielo");
  return (
    <>
      <div className="ct-panel">
        <div className="ct-obsh">
          <h4>Observación para Master</h4>
          <span className="ct-cnt ct-num" data-warn={corta.length > MAX_MASTER || undefined}>
            {corta.length} / {MAX_MASTER} caracteres
          </span>
        </div>
        <div className="ct-obs">{corta}</div>
        <div className="ct-obs__acc">
          <button className="ct-ghost" type="button" onClick={() => void copiar()}>
            <Icon name="clipboard" size={15} />
            Copiar para Master
          </button>
          <span className="ct-cnt" role="status">
            {aviso}
          </span>
        </div>
      </div>
      <div className="ct-panel">
        <div className="ct-obsh">
          <h4>Observación ampliada</h4>
        </div>
        <div className="ct-obs">{conNombre(q.data.observacion_ampliada, nombre ? nombreLegible(nombre) : undefined)}</div>
      </div>
      <p className="ct-lockn">
        <Icon name="lock" size={15} />
        Solo el administrador del módulo ve esta pestaña. Programas, decanos y vicerrectorías no la reciben: la base no se las entrega.
      </p>
    </>
  );
}

export function Ficha({
  fila,
  nivel,
  nombre,
  programa,
  sede,
  periodo,
  onCerrar,
  accionNombre,
}: {
  fila: Resumen | null;
  nivel: NivelCt;
  nombre: string | undefined;
  programa: string;
  sede: string;
  periodo: string;
  onCerrar: () => void;
  /** Si los nombres no se han leído, el botón que los pide. */
  accionNombre: ReactNode;
}) {
  const abierto = fila !== null;
  const [tab, setTab] = useState<Pestana>("resumen");
  const raiz = useRef<HTMLElement>(null);
  const titulo = useId();
  // Se conserva la última ficha para que el cajón no se vacíe mientras se desliza al cerrarse.
  const [ultima, setUltima] = useState<Resumen | null>(null);
  const detalle = useDetalle(fila?.id ?? null);

  useEffect(() => {
    if (fila) {
      setUltima(fila);
      setTab("resumen");
    }
  }, [fila?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    el.inert = !abierto;
    if (abierto) {
      const t = window.setTimeout(() => el.querySelector<HTMLElement>("[data-cerrar]")?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [abierto]);

  const f = fila ?? ultima;
  const esAdmin = nivel === "admin";
  const pestanas: { id: Pestana; texto: string }[] = [
    { id: "resumen", texto: "Resumen" },
    { id: "desglose", texto: "Desglose" },
    { id: "semana", texto: "Semana" },
    { id: "prev", texto: "Preventivas y recomendaciones" },
    { id: "contrato", texto: "Contrato" },
  ];
  if (esAdmin) pestanas.push({ id: "master", texto: "Observaciones para Master" });

  const teclado = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCerrar();
      return;
    }
    if (e.key !== "Tab") return;
    const foco = [...(raiz.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, textarea, [tabindex='0']") ?? [])];
    if (foco.length === 0) return;
    const i = foco.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      foco[foco.length - 1].focus();
    } else if (!e.shiftKey && i === foco.length - 1) {
      e.preventDefault();
      foco[0].focus();
    }
  };

  const moverPestana = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const siguiente = pestanas[(i + (e.key === "ArrowRight" ? 1 : -1) + pestanas.length) % pestanas.length];
    setTab(siguiente.id);
    window.requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>(`[data-tab="${siguiente.id}"]`)?.focus());
  };

  return (
    <>
      <div className="ct-veil" data-on={abierto || undefined} onClick={onCerrar} aria-hidden="true" />
      <aside ref={raiz} className="ct-drawer" data-on={abierto || undefined} role="dialog" aria-modal="true" aria-labelledby={titulo} onKeyDown={teclado}>
        {f && (
          <>
            <div className="ct-dh">
              <div className="ct-dtop">
                <div className="ct-avatar" aria-hidden="true">
                  {nombre ? iniciales(nombre) : "··"}
                </div>
                <div className="ct-dtop__txt">
                  <h3 id={titulo}>{nombre ? nombreLegible(nombre) : `Profesor ${abreviado(f.seudonimo)}`}</h3>
                  <p>
                    {f.perfil} · {programa} · {sede} · {periodo}
                  </p>
                  {!nombre && <div className="ct-dtop__acc">{accionNombre}</div>}
                </div>
                <button className="ct-x" type="button" data-cerrar onClick={onCerrar} aria-label="Cerrar la ficha">
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div className="ct-vstrip">
                <span className="ct-big" data-t={f.veredicto === "Cumple" ? "ok" : f.veredicto === "No cumple" ? "risk" : "neutral"}>
                  {f.veredicto === "Cumple" ? (
                    <>
                      <Icon name="check" size={17} />
                      Cumple la tipología
                    </>
                  ) : f.veredicto === "No cumple" ? (
                    <>
                      <Icon name="alert" size={17} />
                      No cumple la tipología
                    </>
                  ) : (
                    "Sin veredicto automático"
                  )}
                </span>
                <ChipMaster estado={f.estado_master} />
                <span className="ct-num ct-vstrip__h">
                  <b>{horas(f.horas_total)}</b>
                  {f.horas_esperadas != null ? ` de ${horas(f.horas_esperadas)} h asignadas` : " h asignadas"}
                </span>
              </div>
              <div className="ct-tabs" role="tablist" aria-label="Secciones de la ficha">
                {pestanas.map((t, i) => (
                  <button key={t.id} type="button" role="tab" id={`${titulo}-t-${t.id}`} data-tab={t.id} aria-selected={tab === t.id} aria-controls={`${titulo}-p`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => moverPestana(e, i)}>
                    {t.texto}
                    {t.id === "prev" && f.incumplimientos + f.preventivas > 0 && <span className="ct-num"> ({f.incumplimientos + f.preventivas})</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="ct-dbody" id={`${titulo}-p`} role="tabpanel" aria-labelledby={`${titulo}-t-${tab}`} key={`${f.id}-${tab}`}>
              {tab === "resumen" && <PestanaResumen fila={f} observaciones={detalle.data?.observaciones} />}
              {tab === "desglose" && <PestanaDesglose fila={f} />}
              {tab === "semana" && <PestanaSemana fila={f} />}
              {tab === "prev" &&
                (detalle.isPending ? (
                  <LoadingBlock rows={3} label="Leyendo las preventivas" />
                ) : detalle.error ? (
                  <ErrorBlock error={detalle.error} onRetry={() => void detalle.refetch()} />
                ) : (
                  <PestanaPreventivas fila={f} observaciones={detalle.data?.observaciones ?? []} />
                ))}
              {tab === "contrato" && <PestanaContrato fila={f} grupos={detalle.data?.grupos ?? []} sede={sede} periodo={periodo} />}
              {tab === "master" && esAdmin && <PestanaMaster fila={f} nombre={nombre} />}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

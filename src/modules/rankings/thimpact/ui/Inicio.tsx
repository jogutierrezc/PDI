/* =============================================================================
   THE Impact · inicio del ciclo: el avance de los ODS que responde la universidad,
   los pasos para dejar el ciclo listo (catálogo, fechas, carpetas, asignación, avisos,
   apertura), los vencimientos y qué oficinas tienen pendientes.
   ========================================================================== */

import { useEffect, useMemo, useRef } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { avanceDeUnidad, resumenPorOds } from "../../reporte/resumen";
import { ETIQUETA_ESTADO } from "../../reporte/estados";
import { odsNombre, odsVars } from "../../ods";
import { Anillo, Barra, Vacio, crecerMedidores, fechaCorta, llenarAnillos, textoVence } from "../../uigreen/ui/comunes";
import { METODOLOGIA } from "../lib/metodologia";
import { useThi } from "./contexto";

interface Paso {
  clave: string;
  titulo: string;
  detalle: string;
  hecho: boolean;
  vista?: string;
  accion?: string;
}

export function Inicio() {
  const t = useThi();
  const raiz = useRef<HTMLDivElement>(null);
  const { ciclo, cfg } = t;
  const priorizados = ciclo.ods_priorizados;

  const porOds = useMemo(() => resumenPorOds(t.indicadores, t.respuestas), [t.indicadores, t.respuestas]);
  const enPri = porOds.filter((f) => priorizados.includes(f.ods));
  const total = enPri.reduce((s, f) => s + f.total, 0);
  const ok = enPri.reduce((s, f) => s + f.ok, 0);
  const enRevision = enPri.reduce((s, f) => s + f.sent, 0);
  const devueltos = enPri.reduce((s, f) => s + f.back, 0);
  const pct = total ? (ok / total) * 100 : 0;

  const indicadores = useMemo(() => t.indicadores.filter((i) => i.nivel === "indicator"), [t.indicadores]);
  const principales = useMemo(() => new Set(t.asignaciones.filter((a) => a.rol === "principal").map((a) => a.indicador)), [t.asignaciones]);
  const enPriInd = indicadores.filter((i) => priorizados.includes(i.ods));
  const sinOficina = enPriInd.filter((i) => !principales.has(i.id)).length;

  // Pendientes por oficina: indicadores de los ODS priorizados con oficina principal y sin enviar.
  const pendientes = useMemo(() => {
    const m = new Map<string, number>();
    const priInd = new Set(enPriInd.map((i) => i.id));
    for (const a of t.asignaciones) {
      if (a.rol !== "principal" || !priInd.has(a.indicador)) continue;
      const r = t.respuestas.find((x) => x.indicador === a.indicador && x.unidad === a.unidad);
      if (!r || r.estado === "none" || r.estado === "draft" || r.estado === "back") m.set(a.unidad, (m.get(a.unidad) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [t.asignaciones, t.respuestas, enPriInd]);
  const maxPend = pendientes[0]?.[1] ?? 1;

  const planeacion = useMemo(() => {
    const u = t.unidades.find((x) => /planeaci[oó]n/i.test(x.name));
    return u ? avanceDeUnidad(u.id, t.indicadores, t.respuestas) : null;
  }, [t.unidades, t.indicadores, t.respuestas]);

  const pasos: Paso[] = [
    {
      clave: "catalogo",
      titulo: "Catálogo de indicadores",
      detalle: indicadores.length ? `${indicadores.length} indicadores cargados, ${enPriInd.length} en los ODS que responde la universidad.` : "Todavía no hay catálogo: importe el Excel de THE o cree el ciclo copiando el anterior.",
      hecho: indicadores.length > 0,
      vista: "indicadores",
      accion: "Ver el catálogo",
    },
    {
      clave: "fechas",
      titulo: "Fechas y avisos",
      detalle: ciclo.fecha_limite ? `Entrega el ${fechaCorta(ciclo.fecha_limite)}. Avisos ${cfg?.avisos_activos === false ? "apagados" : "encendidos"}.` : "Falta la fecha límite: sin ella no salen recordatorios.",
      hecho: Boolean(ciclo.fecha_limite),
    },
    {
      clave: "carpetas",
      titulo: "Carpetas en Datos de Sostenibilidad",
      detalle: cfg?.carpeta_raiz ? "La carpeta de la edición existe; las de cada indicador se crean al subir su primera evidencia." : "Aún no se prepararon. Se pueden adelantar con «Preparar carpetas»; si no, se crean solas al subir cada evidencia.",
      hecho: Boolean(cfg?.carpeta_raiz),
    },
    {
      clave: "asignacion",
      titulo: "Oficinas asignadas",
      detalle: enPriInd.length ? (sinOficina ? `${sinOficina} de ${enPriInd.length} indicadores sin oficina sugerida.` : "Todos los indicadores tienen oficina sugerida.") : "Sin indicadores que asignar.",
      hecho: enPriInd.length > 0 && sinOficina === 0,
      vista: "asignar",
      accion: "Asignar",
    },
    {
      clave: "abrir",
      titulo: "Ciclo abierto",
      detalle: ciclo.estado === "abierto" ? "Las oficinas ya pueden responder y reciben avisos." : ciclo.estado === "cerrado" ? "El ciclo está cerrado: solo Planeación puede reabrir respuestas." : "En preparación: no salen avisos hasta abrirlo.",
      hecho: ciclo.estado === "abierto",
    },
  ];
  const siguiente = pasos.find((p) => !p.hecho)?.clave;

  useEffect(() => {
    const a = crecerMedidores(raiz.current, 0.05);
    const b = llenarAnillos(raiz.current);
    return () => {
      a();
      b();
    };
  }, [ciclo.id, total, ok]);

  const avisosMetodo: string[] = [];
  if (!priorizados.includes(METODOLOGIA.odsObligatorio)) avisosMetodo.push(`El ODS ${METODOLOGIA.odsObligatorio} no está entre los que responde la universidad y THE lo exige para la clasificación general.`);
  if (priorizados.length < METODOLOGIA.minimoOds) avisosMetodo.push(`THE pide al menos ${METODOLOGIA.minimoOds} ODS; hay ${priorizados.length}.`);

  return (
    <div ref={raiz} className="ugm-pila">
      <section className="ugm-sec ugm-global">
        <Anillo pct={pct} etiqueta="Indicadores aprobados" />
        <div>
          <h2>
            <span className="ugm-num">{ok}</span> de <span className="ugm-num">{total}</span> indicadores aprobados
          </h2>
          <p className="ugm-muted">
            ODS {priorizados.join(" · ") || "—"} · {enRevision} esperan revisión · {devueltos} devueltos · edición {ciclo.anio}, año académico {cfg?.anio_academico ?? ciclo.anio_datos}
            {ciclo.fecha_limite ? ` · ${textoVence(ciclo.fecha_limite).toLowerCase()}` : ""}
          </p>
          {planeacion && (
            <p className="ugm-muted ugm-peq">
              Planeación reporta {planeacion.reportados} · {planeacion.aprobados} aprobados · {planeacion.oficiales} oficiales
            </p>
          )}
          {avisosMetodo.map((x) => (
            <p key={x} className="ugm-aparte">
              {x}
            </p>
          ))}
        </div>
      </section>

      <section className="ugm-sec" aria-labelledby="thi-pasos">
        <h2 id="thi-pasos">Para dejar el ciclo listo</h2>
        <ol className="thi-pasos">
          {pasos.map((p, i) => (
            <li key={p.clave} className={`thi-paso${p.hecho ? " thi-paso--hecho" : ""}${p.clave === siguiente ? " thi-paso--ahora" : ""}`}>
              <span className="thi-paso__marca" aria-hidden="true">
                {p.hecho ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <span className="thi-paso__texto">
                <b>{p.titulo}</b>
                <small>{p.detalle}</small>
              </span>
              <span className="ugm-sr">{p.hecho ? "Hecho" : p.clave === siguiente ? "Siguiente paso" : "Pendiente"}</span>
              {p.vista && t.esAdmin && (
                <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => t.ir(p.vista as string)}>
                  {p.accion}
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>

      {porOds.length === 0 ? (
        <Vacio>El catálogo del ciclo está vacío, así que no hay avance que mostrar.</Vacio>
      ) : (
        <div className="ugm-cols">
          <section className="ugm-sec">
            <h2>Avance por ODS</h2>
            <ul className="ugm-lista">
              {porOds
                .slice()
                .sort((a, b) => Number(priorizados.includes(b.ods)) - Number(priorizados.includes(a.ods)) || a.ods - b.ods)
                .map((f) => {
                  const n = f.total || 1;
                  const pri = priorizados.includes(f.ods);
                  return (
                    <li key={f.ods} className="ugm-fila-barra">
                      <span>
                        <b className="rk-odsmark thi-ods" style={odsVars(f.ods)}>
                          {f.ods}
                        </b>{" "}
                        {odsNombre(f.ods)}
                        {!pri && <small>No se responde en este ciclo</small>}
                      </span>
                      <Barra aprobado={(f.ok / n) * 100} curso={((f.sent + f.draft + f.back) / n) * 100} etiqueta={`ODS ${f.ods}: ${f.ok} de ${f.total} aprobados`} />
                      <span className="ugm-num ugm-muted">
                        {f.ok}/{f.total}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>

          <section className="ugm-sec">
            <h2>Oficinas con pendientes</h2>
            {pendientes.length === 0 ? (
              <p className="ugm-muted">{enPriInd.length ? "Ninguna oficina tiene indicadores asignados sin enviar." : "Aún no hay indicadores en los ODS del ciclo."}</p>
            ) : (
              <ul className="ugm-lista">
                {pendientes.map(([unidad, n]) => (
                  <li key={unidad} className="ugm-fila-barra">
                    <span>{t.oficina(unidad)}</span>
                    <Barra aprobado={0} curso={(n / maxPend) * 100} etiqueta={`${t.oficina(unidad)}: ${n} pendientes`} />
                    <span className="ugm-num ugm-muted">{n}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="ugm-peq ugm-muted">
              Cuentan los indicadores con oficina sugerida cuya respuesta está {ETIQUETA_ESTADO.none.toLowerCase()}, {ETIQUETA_ESTADO.draft.toLowerCase()} o {ETIQUETA_ESTADO.back.toLowerCase()}.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

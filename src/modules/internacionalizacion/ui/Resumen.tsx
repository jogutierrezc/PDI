/* Internacionalización · Resumen: qué falta para cerrar el periodo. */

import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useEntrada, useCrecer, useContador } from "./movimiento";
import { useCifras, useConceptos, useEstructura, usePlantillas, useVentanas } from "../datos";
import { cobertura, disponiblesDe } from "../lib/cobertura";
import { ETIQUETA_ESTADO } from "../lib/permisos";
import { AvisoMigracion, BarraEstados, Cargando, EstadoPill, ErrorCaja, fmt, LeyendaEstados, nombreCampus, Vacio } from "./comunes";
import type { Ctx } from "./comunes";
import { avancePorCampus, contarEstados, diasHasta, faltantes, fechaCorta } from "./logica";
import { listaPlantillas } from "./plantillas-lista";
import { FaltaMigracion } from "../datos";

export function Cifra({ valor, rotulo, detalle, tono }: { valor: number; rotulo: string; detalle?: string; tono?: string }) {
  const ref = useRef<HTMLElement>(null);
  useContador(ref, valor, fmt);
  return (
    <div className={`it-kpi${tono ? ` is-${tono}` : ""}`} data-entra>
      <b ref={ref} className="it-num">
        {fmt(valor)}
      </b>
      <span>{rotulo}</span>
      {detalle && <small>{detalle}</small>}
    </div>
  );
}

export function Resumen({ ctx }: { ctx: Ctx }) {
  const { periodo } = ctx;
  const raiz = useRef<HTMLDivElement>(null);
  const cifras = useCifras(periodo?.id);
  const estructura = useEstructura();
  const plantillas = usePlantillas();
  const conceptos = useConceptos();
  const ventanas = useVentanas(periodo?.id);
  useEntrada(raiz, "[data-entra]", `${periodo?.id}-${Boolean(cifras.data)}`);
  useCrecer(raiz, "[data-crece]", { clave: `${periodo?.id}-${Boolean(cifras.data)}` });

  const hojas = useMemo(() => (estructura.data ?? []).flatMap((l) => l.hojas.map((h) => ({ ...h, libro: l }))), [estructura.data]);
  const coberturas = useMemo(() => {
    const disp = disponiblesDe(hojas);
    const nombre = (id: string) => conceptos.data?.find((c) => c.id === id)?.nombre ?? id;
    return listaPlantillas(plantillas.data ?? []).map((p) => ({ p, c: cobertura(p, disp, nombre) }));
  }, [hojas, plantillas.data, conceptos.data]);

  if (!periodo) {
    return (
      <Vacio
        titulo="Aún no hay periodos."
        accion={
          ctx.director ? (
            <Link className="button-primary it-btn" to={ctx.enlace("periodos")}>
              Abrir el primer periodo
            </Link>
          ) : undefined
        }
      >
        {ctx.director
          ? "Abra un periodo (por ejemplo 2026-2) y defina la ventana de captura de cada hoja: sin ventana, los campus no capturan."
          : "El Director de Internacionalización abre los periodos y las ventanas de captura. Cuando lo haga, aquí verá lo que falta."}
      </Vacio>
    );
  }

  const error = cifras.error ?? estructura.error;
  if (error instanceof FaltaMigracion) return <AvisoMigracion error={error} />;
  if (error) return <ErrorCaja error={error} />;
  if (!cifras.data || !estructura.data) return <Cargando texto="Calculando el avance del periodo…" />;

  if (hojas.length === 0) {
    return (
      <Vacio
        titulo="El repositorio todavía no tiene tablas."
        accion={
          ctx.director ? (
            <Link className="button-primary it-btn" to={ctx.enlace("tablas")}>
              Crear la primera tabla
            </Link>
          ) : undefined
        }
      >
        {ctx.director
          ? "Cree una tabla en blanco o cárguela desde un Excel ya diseñado: las columnas se emparejan solas con el catálogo de conceptos."
          : "El Director crea las tablas; después cada campus captura sus filas."}
      </Vacio>
    );
  }

  const ids = new Set(ctx.visibles.map((c) => c.id));
  const avance = cifras.data.avance.filter((a) => ids.has(a.campus_id));
  const total = contarEstados(avance);
  const porCampus = avancePorCampus(avance, ctx.visibles);
  const falta = faltantes(avance);
  const dias = diasHasta(periodo.cierra);
  const hojaDe = (id: string) => hojas.find((h) => h.id === id);
  const sinVentana = ventanas.data ? hojas.filter((h) => !ventanas.data!.some((v) => v.hoja_id === h.id)) : [];

  return (
    <div ref={raiz} className="it-resumen">
      <header className="it-cabeza" data-entra>
        <div>
          <h2 className="it-h2">
            {total.total === total.aprobado ? `El periodo ${periodo.codigo} está completo` : `Qué falta para cerrar ${periodo.codigo}`}
          </h2>
          <p className="it-sub">
            Periodo {periodo.estado === "abierto" ? "abierto" : "cerrado"}
            {periodo.cierra && ` · cierra el ${fechaCorta(periodo.cierra)}`} · {ctx.director ? "todos los campus" : ctx.visibles.map((c) => c.name).join(", ")}
          </p>
        </div>
      </header>

      <div className="it-kpis">
        <Cifra valor={total.aprobado} rotulo="Hojas aprobadas" detalle={`de ${fmt(total.total)} (hoja × campus)`} tono="aprobado" />
        <Cifra valor={total.validado} rotulo="Por aprobar" detalle="validadas, esperan al Director" tono="validado" />
        <Cifra valor={total.enviado} rotulo="Por validar" detalle="enviadas, esperan al coordinador" tono="enviado" />
        <Cifra valor={total.borrador} rotulo="Sin enviar" detalle="en borrador en su campus" tono="borrador" />
        {dias !== null && (
          <Cifra
            valor={Math.max(0, dias)}
            rotulo={dias < 0 ? "Días desde el cierre" : dias === 1 ? "Día para el cierre" : "Días para el cierre"}
            detalle={dias < 0 ? `cerró el ${fechaCorta(periodo.cierra)}` : `cierra el ${fechaCorta(periodo.cierra)}`}
          />
        )}
      </div>

      <div className="it-resumen__rejilla">
        <section className="it-panel it-resumen__campus" aria-labelledby="it-av-campus" data-entra>
          <header className="it-panel__cabeza">
            <h3 id="it-av-campus">Avance por campus</h3>
            <LeyendaEstados />
          </header>
          <ul className="it-campus">
            {porCampus.map((c) => (
              <li key={c.campus.id}>
                <b>{c.campus.name}</b>
                <BarraEstados c={c} etiqueta={c.campus.name} />
                <span className="it-num it-tenue">
                  {c.total === 0 ? "sin hojas" : `${fmt(c.aprobado)} de ${fmt(c.total)} aprobadas · ${fmt(c.filas)} filas`}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="it-panel it-resumen__cob" aria-labelledby="it-cob" data-entra>
          <header className="it-panel__cabeza">
            <h3 id="it-cob">Plantillas que el repositorio ya responde</h3>
            <Link className="it-enlace" to={ctx.enlace("plantillas")}>
              Ver el hilo
            </Link>
          </header>
          <ul className="it-cob">
            {coberturas.map(({ p, c }) => (
              <li key={p.id}>
                <Link to={ctx.enlace("plantillas", { plantilla: p.id })}>
                  <span>{p.nombre}</span>
                  <span className="it-num">{c.total ? `${c.porcentaje} %` : "sin campos"}</span>
                  <span className="it-medidor" aria-hidden="true">
                    <i data-crece style={{ width: `${c.porcentaje}%` }} />
                  </span>
                  <small>
                    {c.total ? `${c.respondidas} de ${c.total} columnas` : "El catálogo de Reportes aún no la define"}
                    {c.obligatoriasFaltantes.length > 0 && ` · faltan ${c.obligatoriasFaltantes.length} obligatorias`}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="it-panel it-resumen__falta" aria-labelledby="it-falta" data-entra>
          <header className="it-panel__cabeza">
            <h3 id="it-falta">{falta.length ? `Pendiente (${fmt(falta.length)})` : "Nada pendiente"}</h3>
            {ctx.director && sinVentana.length > 0 && (
              <Link className="it-enlace is-aviso" to={ctx.enlace("periodos")}>
                {sinVentana.length === 1 ? "1 hoja sin ventana de captura" : `${sinVentana.length} hojas sin ventana de captura`}
              </Link>
            )}
          </header>
          {falta.length === 0 ? (
            <p className="it-tenue it-panel__cuerpo">Todas las hojas de los campus que usted ve están aprobadas: ya cuentan en Cifras y en las plantillas.</p>
          ) : (
            <table className="it-tabla it-tabla--tarjetas">
              <thead>
                <tr>
                  <th scope="col">Hoja</th>
                  <th scope="col">Campus</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="it-der">
                    Filas
                  </th>
                  <th scope="col">Siguiente paso</th>
                  <th scope="col">
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {falta.slice(0, 40).map((f) => {
                  const h = hojaDe(f.hoja_id);
                  return (
                    <tr key={`${f.hoja_id}-${f.campus_id}`}>
                      <td data-rotulo="Hoja">
                        <b>{h?.nombre ?? "Hoja"}</b>
                        <small className="it-tenue"> · {h?.libro.nombre}</small>
                      </td>
                      <td data-rotulo="Campus">{nombreCampus(ctx.campus, f.campus_id)}</td>
                      <td data-rotulo="Estado">
                        <EstadoPill estado={f.estado} />
                      </td>
                      <td data-rotulo="Filas" className="it-der it-num">
                        {fmt(f.filas)}
                      </td>
                      <td data-rotulo="Siguiente paso" className="it-tenue">
                        {f.quien}
                      </td>
                      <td>
                        <Link className="it-enlace" to={ctx.enlace("tablas", { libro: h?.libro.id, hoja: f.hoja_id, campus: f.campus_id })}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {falta.length > 40 && <p className="it-tenue it-panel__cuerpo">Y {fmt(falta.length - 40)} más. Filtre por campus en Tablas.</p>}
          <p className="sr-only">Estados posibles: {Object.values(ETIQUETA_ESTADO).join(", ")}.</p>
        </section>
      </div>
    </div>
  );
}

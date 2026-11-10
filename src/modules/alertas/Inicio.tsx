/* Portal de alertas · inicio: la ruta de tres paradas (facultad, programa y semestre), la cohorte por periodos y las secciones. */

import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { LoadingBlock } from "../../components/ui/QueryState";
import { useEntrada } from "../monitor/piezas";
import { composicion, resumenDe } from "./cohorte";
import { useAlertas } from "./contexto";
import { mensajeAlertas } from "./datos";
import { Apilada, Leyenda } from "./graficos";
import { Paradas } from "./Marco";
import { useCohorte } from "./usoCohorte";

export function Inicio() {
  const ctx = useAlertas();
  const { q, cohorte } = useCohorte(ctx);
  const ref = useEntrada<HTMLDivElement>(`inicio|${ctx.p}|${ctx.s}|${ctx.periodo}`);
  const r = resumenDe(cohorte.t);
  const secciones = [
    { a: "panorama", t: "Panorama", d: "Cómo está la cohorte hoy, qué se espera el próximo periodo y qué pasaría con distintos escenarios.", f: cohorte.t.length ? `${r.RS} en seguimiento` : "Por programa y semestre" },
    { a: "riesgo", t: "Mapa de riesgo", d: "Reprobación por campus, facultad, programa y curso, con tamaño del grupo y distribución.", f: "Por campus" },
    { a: "estudiantes", t: "Estudiantes", d: "La trayectoria de cada persona, con notas estimadas y escenarios.", f: cohorte.t.length ? `${r.n} estudiantes` : "Trayectoria por periodo" },
    { a: "cursos", t: "Cursos críticos", d: "Materias con reprobación alta y su evolución por periodo.", f: "Evolución por periodo" },
    { a: "metodo", t: "Cómo se calcula", d: "Las reglas de cada nivel, las notas estimadas, el modelo de probabilidad y sus límites.", f: "Paso a paso" },
  ];
  return (
    <div ref={ref} className="al-inicio">
      <section className="al-hero">
        <div className="al-hero__texto">
          <h1 data-in>Elija su facultad, programa y semestre</h1>
          <p className="al-lead" data-in>
            Vea quién necesita seguimiento, cómo evolucionó frente a periodos anteriores y qué se espera el próximo semestre.
          </p>
          <div data-in>
            <Paradas ctx={ctx} vertical />
          </div>
          <Link data-in className="al-cta" to={ctx.enlace("panorama")}>
            Ver panorama <Icon name="arrow-right" size={18} />
          </Link>
        </div>
        <div className="al-hero__viz" data-in>
          <h2>
            {ctx.programa.nombre}
            {ctx.s !== null ? `, semestre ${ctx.s}` : ""}
          </h2>
          <p className="al-nota">Cómo ha estado esta misma cohorte en cada periodo que lleva.</p>
          {q.isPending ? (
            <LoadingBlock rows={4} label="Leyendo la cohorte" />
          ) : q.error ? (
            <p className="al-nota">{mensajeAlertas(q.error)}</p>
          ) : cohorte.t.length === 0 ? (
            <p className="al-nota">{cohorte.semestreVacio ? "Nadie está en ese semestre en este periodo. Pruebe con otro semestre o con todos." : `Aún no hay notas de ${ctx.periodo} para este programa.`}</p>
          ) : (
            <>
              <Apilada columnas={composicion(cohorte.t)} />
              <Leyenda />
            </>
          )}
        </div>
      </section>
      <section className="al-secciones">
        <aside data-in>
          <h2>Qué puede hacer aquí</h2>
          <p className="al-nota">Cada sección responde una pregunta distinta sobre el mismo programa y semestre.</p>
        </aside>
        <div className="al-secciones__lista">
          {secciones.map((s) => (
            <Link key={s.a} data-in className="al-sec" to={ctx.enlace(s.a)}>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
              <span className="al-sec__fig">
                {s.f}
                <Icon name="arrow-right" size={18} />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/* Portal de alertas · estudiantes: cómo se reparte el promedio, quién subió y quién bajó, y la lista priorizada. Abrir una fila lleva a su propia página. */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import type { Nivel } from "../monitor/logica";
import { useEntrada } from "../monitor/piezas";
import { factoresDe, porPrioridad, resumenDe } from "./cohorte";
import { useAlertas } from "./contexto";
import { proyectarPromedio, riesgoDesercion } from "./estimacion";
import { AvisoEstimado, DispersionCambio, HistogramaPromedio, Leyenda, Semaforo, coma } from "./graficos";
import { Termino } from "./termino";
import { Estado, useCohorte } from "./usoCohorte";

const PAGINA = 25;

export function Estudiantes() {
  const ctx = useAlertas();
  const { q, cohorte } = useCohorte(ctx);
  return (
    <Estado q={q} cohorte={cohorte} ctx={ctx}>
      <Cuerpo />
    </Estado>
  );
}

function Cuerpo() {
  const ctx = useAlertas();
  const { cohorte } = useCohorte(ctx);
  const navigate = useNavigate();
  const t = cohorte.t;
  const r = useMemo(() => resumenDe(t), [t]);
  const [nivel, setNivel] = useState<Nivel | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [visibles, setVisibles] = useState(PAGINA);
  const ref = useEntrada<HTMLDivElement>(`estudiantes|${ctx.p}|${ctx.s}|${ctx.periodo}`);
  const filas = useMemo(
    () =>
      t
        .filter((x) => (nivel === "todos" || x.actual.nivel === nivel) && (!busca.trim() || x.codigo.includes(busca.trim())))
        .sort(porPrioridad)
        .map((x) => ({ x, proy: proyectarPromedio(x.puntos.map((p) => p.promedio)), riesgo: riesgoDesercion(factoresDe(x, ctx.facultad.nombre)) })),
    [t, nivel, busca, ctx.facultad.nombre],
  );
  const parcial = t.some((x) => x.actual.parcial);
  const abrir = (codigo: string) => navigate(ctx.enlace(`estudiantes/${encodeURIComponent(codigo)}`));
  const filtros: [Nivel | "todos", string][] = [
    ["todos", `Todos (${r.n})`],
    ["RS", `Requieren seguimiento (${r.RS})`],
    ["ED", `En desarrollo (${r.ED})`],
    ["NE", `Nivel esperado (${r.NE})`],
  ];
  return (
    <div ref={ref} className="al-pagina">
      <section className="al-seccion">
        <h1 className="al-titulo" data-in>
          Estudiantes
        </h1>
        <p className="al-lead" data-in>
          {ctx.programa.nombre}
          {ctx.s !== null ? `, semestre ${ctx.s}` : ""}, periodo {ctx.periodo}. Abra una fila para ver su trayectoria y lo que se espera.
        </p>
        {parcial && (
          <div data-in>
            <AvisoEstimado>El periodo todavía no tiene todos los cortes. El promedio es el del último corte con notas.</AvisoEstimado>
          </div>
        )}
      </section>

      <section className="al-seccion al-dos al-dos--iguales">
        <div className="al-panel" data-in>
          <h2>Cómo se reparte el promedio</h2>
          <p className="al-nota">Los colores marcan los umbrales de 3,0 y 3,5.</p>
          <HistogramaPromedio promedios={t.map((x) => x.actual.promedio)} />
          <Leyenda />
        </div>
        <div className="al-panel" data-in>
          <h2>Quién subió y quién bajó</h2>
          <p className="al-nota">Promedio anterior contra promedio actual.</p>
          <DispersionCambio t={t} />
        </div>
      </section>

      <section className="al-seccion" data-in>
        <div className="al-fila-ctrl">
          <div role="group" aria-label="Filtrar por nivel" className="al-chips">
            {filtros.map(([k, texto]) => (
              <button key={k} type="button" className="al-chip" aria-pressed={nivel === k} onClick={() => (setNivel(k), setVisibles(PAGINA))}>
                {texto}
              </button>
            ))}
          </div>
          <label className="al-busca">
            <span className="sr-only">Buscar por código</span>
            <Icon name="search" size={16} />
            <input value={busca} inputMode="numeric" placeholder="Buscar por código" onChange={(e) => (setBusca(e.target.value), setVisibles(PAGINA))} />
          </label>
        </div>
        <div className="al-tabla-envuelta">
          <table className="al-tabla al-tabla--filas">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nivel</th>
                <th scope="col" className="num">
                  Promedio{parcial ? " (parcial)" : ""}
                </th>
                <th scope="col" className="num">
                  Cambio
                </th>
                <th scope="col" className="num">
                  Materias perdidas
                </th>
                <th scope="col" className="num">
                  Próximo periodo
                </th>
                <th scope="col" className="num">
                  Riesgo de deserción <Termino k="modelo">(modelo)</Termino>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, visibles).map(({ x, proy, riesgo }) => {
                const cambio = x.anterior ? x.actual.promedio - x.anterior.promedio : null;
                return (
                  <tr key={x.codigo} onClick={() => abrir(x.codigo)}>
                    <td>
                      <Link className="al-codigo" to={ctx.enlace(`estudiantes/${encodeURIComponent(x.codigo)}`)} onClick={(e) => e.stopPropagation()}>
                        {x.codigo}
                      </Link>
                    </td>
                    <td>
                      <Semaforo nivel={x.actual.nivel} palabra={false} />
                    </td>
                    <td className="num">{coma(x.actual.promedio, 2)}</td>
                    <td className="num">
                      {cambio === null ? (
                        <span className="al-muted">sin dato</span>
                      ) : (
                        <span className="al-cambio" data-sube={cambio > 0.02 ? true : cambio < -0.02 ? false : undefined}>
                          <Icon name="arrow-right" size={14} />
                          {cambio > 0 ? "+" : cambio < 0 ? "-" : ""}
                          {coma(Math.abs(cambio), 2)}
                        </span>
                      )}
                    </td>
                    <td className="num">{x.actual.perdidas}</td>
                    <td className="num">{proy ? coma(proy.mu, 2) : "sin dato"}</td>
                    <td className="num">{coma(riesgo * 100, 0)} %</td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="al-muted">
                    Ningún estudiante coincide con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="al-fila-ctrl">
          <p className="al-nota">
            Se muestran {Math.min(visibles, filas.length)} de {filas.length}, de mayor a menor prioridad.
          </p>
          {visibles < filas.length && (
            <button type="button" className="al-boton" onClick={() => setVisibles(visibles + PAGINA)}>
              Mostrar {PAGINA} más
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

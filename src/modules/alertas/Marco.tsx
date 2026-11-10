/* =============================================================================
   Portal de alertas · el marco.

   Un portal propio (como el de Impacto), fuera de la intranet: barra de secciones, la barra de
   alcance (facultad, programa, semestre, periodo y sede) y el pie. Solo con sesión; quién ve qué
   lo decide la base (pantalla `monitor`, wh_monitor_puede y las unidades), no esta pantalla.

   El alcance viaja en la dirección: ?periodo=&sede=&f=facultad&p=programa&s=semestre. Los nombres
   coinciden con los del Monitor de la intranet (?periodo=, ?sede=, ?f=, ?p=) para poder redirigir
   los enlaces viejos.
   ========================================================================== */

import { useEffect, useMemo } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SiteHeader } from "../../components/layout/SiteHeader";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { periodosDisponibles, SEDES } from "../warehouse/conjuntos";
import { useMapaMonitor, usePermisosMonitor } from "./datos";
import { periodosHasta } from "./cohorte";
import { BASE, facultadesDe, programasDe, type CtxAlertas } from "./contexto";
import "./alertas.css";

const SECCIONES = [
  { a: "", etiqueta: "Inicio", fin: true },
  { a: "panorama", etiqueta: "Panorama" },
  { a: "riesgo", etiqueta: "Mapa de riesgo" },
  { a: "estudiantes", etiqueta: "Estudiantes" },
  { a: "cursos", etiqueta: "Cursos críticos" },
  { a: "metodo", etiqueta: "Cómo se calcula" },
];
const SIN_ALCANCE = ["", "riesgo", "metodo"];

const SEMESTRES = Array.from({ length: 10 }, (_, i) => i + 1);

function Select({ id, etiqueta, valor, opciones, onCambia }: { id: string; etiqueta: string; valor: string; opciones: { v: string; t: string }[]; onCambia: (v: string) => void }) {
  return (
    <label className="al-sel" htmlFor={id}>
      <span className="sr-only">{etiqueta}</span>
      <select id={id} value={valor} onChange={(e) => onCambia(e.target.value)} aria-label={etiqueta}>
        {opciones.map((o) => (
          <option key={o.v} value={o.v}>
            {o.t}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={16} />
    </label>
  );
}

/** Facultad, programa y semestre: las tres paradas de la ruta. */
export function Paradas({ ctx, vertical = false }: { ctx: CtxAlertas; vertical?: boolean }) {
  const progs = programasDe(ctx.programas, ctx.f);
  const campos = [
    { clave: "f", t: "Facultad", el: <Select id="al-f" etiqueta="Facultad" valor={ctx.f} opciones={ctx.facultades.map((f) => ({ v: f.id, t: f.nombre }))} onCambia={(v) => ctx.fijar({ f: v, p: null, s: null })} /> },
    { clave: "p", t: "Programa", el: <Select id="al-p" etiqueta="Programa" valor={ctx.p} opciones={progs.map((p) => ({ v: p.codigo_programa, t: p.nombre }))} onCambia={(v) => ctx.fijar({ p: v, s: null })} /> },
    { clave: "s", t: "Semestre", el: <Select id="al-s" etiqueta="Semestre" valor={ctx.s === null ? "todos" : String(ctx.s)} opciones={[{ v: "todos", t: "Todos los semestres" }, ...SEMESTRES.map((n) => ({ v: String(n), t: `Semestre ${n}` }))]} onCambia={(v) => ctx.fijar({ s: v === "todos" ? null : v })} /> },
  ];
  if (vertical)
    return (
      <ol className="al-ruta">
        {campos.map((c) => (
          <li key={c.clave}>
            <span className="al-ruta__parada" aria-hidden="true">
              <i />
            </span>
            <span className="al-ruta__campo">
              <small>{c.t}</small>
              {c.el}
            </span>
          </li>
        ))}
      </ol>
    );
  return (
    <>
      {campos.map((c, i) => (
        <span key={c.clave} className="al-paradas__par">
          {i > 0 && <Icon name="arrow-right" size={16} />}
          {c.el}
        </span>
      ))}
    </>
  );
}

/** Periodo y sede: se ven siempre, aun mientras carga. */
export function PeriodoSede({ periodo, sede, periodos, fijar }: { periodo: string; sede: string; periodos: string[]; fijar: (c: Record<string, string | null>) => void }) {
  return (
    <>
      <Select id="al-sede" etiqueta="Sede" valor={sede} opciones={SEDES.map((s) => ({ v: s.id, t: s.nombre }))} onCambia={(v) => fijar({ sede: v === SEDES[0].id ? null : v })} />
      <Select id="al-periodo" etiqueta="Periodo" valor={periodo} opciones={periodos.map((p) => ({ v: p, t: p }))} onCambia={(v) => fijar({ periodo: v === periodos[0] ? null : v })} />
    </>
  );
}

export function Marco() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const permisos = usePermisosMonitor();
  const periodos = useMemo(() => periodosDisponibles(), []);
  const periodo = periodos.includes(params.get("periodo") ?? "") ? (params.get("periodo") as string) : periodos[0];
  const sede = SEDES.some((s) => s.id === params.get("sede")) ? (params.get("sede") as string) : SEDES[0].id;
  const mapa = useMapaMonitor(periodo, sede);
  const seccion = pathname.replace(BASE, "").replace(/^\//, "").split("/")[0];

  useEffect(() => {
    const previo = document.title;
    document.title = "Monitor de alertas tempranas | UDES";
    return () => {
      document.title = previo;
    };
  }, []);

  const fijar = (cambios: Record<string, string | null>) => {
    const siguiente = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") siguiente.delete(k);
      else siguiente.set(k, v);
    }
    navigate({ pathname, search: siguiente.toString() });
  };
  const enlace = (ruta: string, extra: Record<string, string | null> = {}) => {
    const siguiente = new URLSearchParams(params);
    for (const [k, v] of Object.entries(extra)) {
      if (v === null || v === "") siguiente.delete(k);
      else siguiente.set(k, v);
    }
    return { pathname: `${BASE}${ruta ? `/${ruta}` : ""}`, search: siguiente.toString() };
  };

  const programas = useMemo(() => mapa.data ?? [], [mapa.data]);
  const facultades = useMemo(() => facultadesDe(programas), [programas]);
  const f = facultades.some((x) => x.id === params.get("f")) ? (params.get("f") as string) : (facultades[0]?.id ?? "");
  const progs = programasDe(programas, f);
  const p = progs.some((x) => x.codigo_programa === params.get("p")) ? (params.get("p") as string) : (progs[0]?.codigo_programa ?? "");
  const programa = progs.find((x) => x.codigo_programa === p);
  const facultad = facultades.find((x) => x.id === f);
  const s = SEMESTRES.includes(Number(params.get("s"))) ? Number(params.get("s")) : null;
  const ctx: CtxAlertas | null =
    programa && facultad ? { periodo, sede, nombreSede: SEDES.find((x) => x.id === sede)?.nombre ?? sede, periodos, historial: periodosHasta(periodos, periodo, 6), programas, facultades, f, p, programa, facultad, s, fijar, enlace } : null;

  let cuerpo;
  if (!permisos.ver) {
    cuerpo = <EmptyBlock title="Sin acceso al Monitor" hint="El Monitor es para quien pertenece a una facultad o a un programa, y para Planeación. Pida a la administración que lo agregue a su unidad." />;
  } else if (mapa.isPending) {
    cuerpo = <LoadingBlock rows={6} label="Leyendo las notas" />;
  } else if (mapa.error) {
    const e = mapa.error as Error;
    const falta = /wh_monitor|does not exist|schema cache/i.test(e.message);
    const sinPermiso = /sin permiso/i.test(e.message);
    cuerpo = <ErrorBlock error={falta ? new Error("Falta aplicar la migración 0160 (Monitor de alertas tempranas).") : sinPermiso ? new Error("Su usuario no tiene programas asignados todavía: Planeación debe asociar su unidad con los programas.") : e} title="No se pudo abrir el Monitor" onRetry={() => void mapa.refetch()} />;
  } else if (!ctx) {
    cuerpo = <EmptyBlock title={`Aún no hay notas de ${periodo} para ver`} hint="Las notas salen del «Reporte global de notas» de Davinci, que Planeación carga en el Warehouse. Pruebe con otro periodo o sede; si ya se cargó, quizá sus programas aún no están asignados a su unidad." />;
  } else {
    cuerpo = <Outlet context={ctx} />;
  }

  const barraAlcance = permisos.ver && ctx && !SIN_ALCANCE.includes(seccion);
  return (
    <div className="al">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <SiteHeader />
      <div className="al-barra">
        <div className="u-container al-barra__in">
          <Link to={{ pathname: BASE, search }} className="al-marca">
            <strong>Monitor de alertas</strong>
            <span>
              <Icon name="lock" size={12} /> Solo con sesión
            </span>
          </Link>
          <nav aria-label="Secciones del portal" className="al-nav">
            {SECCIONES.map((x) => (
              <NavLink key={x.a} to={{ pathname: x.a ? `${BASE}/${x.a}` : BASE, search }} end={x.fin || x.a !== "estudiantes"} className={({ isActive }) => (isActive || (x.a === "estudiantes" && seccion === "estudiantes") ? "al-nav__a al-nav__a--on" : "al-nav__a")} aria-current={seccion === x.a ? "page" : undefined}>
                {x.etiqueta}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      {permisos.ver && seccion !== "riesgo" && seccion !== "metodo" && (
        <div className="al-alcance">
          <div className="u-container al-alcance__in">
            {barraAlcance && ctx && <Paradas ctx={ctx} />}
            <span className="al-alcance__espacio" />
            <PeriodoSede periodo={periodo} sede={sede} periodos={periodos} fijar={fijar} />
          </div>
        </div>
      )}
      <main id="contenido">
        <div className="u-container al-contenido">{cuerpo}</div>
      </main>
      <footer className="al-pie">
        <div className="u-container al-pie__in">
          <span>Universidad de Santander. Cifras del UDES Warehouse, por periodo. El código del estudiante es un dato personal: úselo solo para su seguimiento académico.</span>
          <Link to="/admin/monitor-alertas">Monitor en la intranet</Link>
        </div>
      </footer>
    </div>
  );
}

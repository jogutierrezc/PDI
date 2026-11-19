/* Planeación y Seguimiento · estado vacío guiado: aún no hay plan (o no tiene versión). Lleva paso a paso: Crear plan › Cargar la planificación › Revisar y publicar. */

import { usePs } from "./contexto";
import { puedeAdministrar } from "./modelo";
import { Icon } from "../../components/ui/Icon";

export function Vacio({ sinVersion = false }: { sinVersion?: boolean }) {
  const { nivel, plan, ruta, ir } = usePs();
  const admin = puedeAdministrar(nivel);
  const hecho1 = Boolean(plan);
  const pasos = [
    { n: 1, t: "Crear el plan", d: "Su nombre y los años que cubre, por ejemplo «PDIFyT 2027-2035», 2027 a 2035.", hecho: hecho1, ir: ruta("crear"), boton: "Crear plan" },
    { n: 2, t: "Cargar la planificación", d: "Descargue la plantilla de Excel, llénela con las líneas del plan, revise lo que lee el portal y cree la versión borrador v1.0.", hecho: false, ir: ruta("cargar"), boton: "Cargar la planificación", deshabilitado: !hecho1 },
    { n: 3, t: "Revisar y publicar", d: "Con el resumen, los proyectos y la calidad de datos a la vista, se publica la versión: queda congelada como línea base.", hecho: false },
  ];
  return (
    <div className="ps-vacio">
      <h2>{sinVersion ? `El plan «${plan?.nombre}» aún no tiene líneas` : "Aún no hay un plan cargado"}</h2>
      <p className="ps-sub">
        {admin
          ? "Siga estos pasos. El archivo de Excel se lee en su navegador y no sale a ningún servidor hasta el último paso."
          : "Cuando la administración de planeación cargue el plan, aquí verá su resumen, los proyectos y el cronograma. No hace falta que haga nada."}
      </p>
      <ol className="ps-guia">
        {pasos.map((p) => (
          <li key={p.n} data-hecho={p.hecho || undefined}>
            <span className="ps-guia__n" aria-hidden="true">{p.hecho ? <Icon name="check" size={14} /> : p.n}</span>
            <div>
              <strong>{p.t}{p.hecho ? <span className="sr-only"> (hecho)</span> : null}</strong>
              <p>{p.d}</p>
              {admin && p.ir && !p.hecho ? <button type="button" className="button-primary" disabled={p.deshabilitado} onClick={() => ir(p.ir!)}>{p.boton}</button> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

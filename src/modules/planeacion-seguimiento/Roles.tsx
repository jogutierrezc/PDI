/* Planeación y Seguimiento · roles y permisos (la matriz del diseño aprobado). En esta fase solo están activos el lector, el administrador (crear plan, cargar, publicar) y la lectura de los demás; lo operativo llega en las fases 2 a 4. */

import { usePs } from "./contexto";
import { rotuloNivel } from "./modelo";

type Celda = "s" | "n" | [string];
const NIVELES = ["Administrador de planeación", "Aprobador", "Financiero (VAF)", "Gestor de oficina", "Colaborador", "Lector o directivo"] as const;
const MATRIZ: [string, ...Celda[]][] = [
  ["Ver resumen y seguimiento", "s", "s", "s", "s", "s", "s"],
  ["Ver todos los planes y la pantalla «Todos los planes»", "s", "s", "s", "n", "n", "s"],
  ["Crear planes y cargar o publicar sus versiones", "s", "n", "n", ["Planes de su oficina"], "n", "n"],
  ["Solicitar cambios al plan", "s", "n", "n", ["Solo proyectos de su oficina"], "n", "n"],
  ["Aprobar, devolver o rechazar solicitudes", "n", ["Nunca la propia"], "n", "n", "n", "n"],
  ["Asignar actividades", ["A personas de la oficina de la actividad"], "n", "n", ["Solo a su oficina"], "n", "n"],
  ["Crear actividades, riesgos y acciones", "s", "n", "n", ["Su oficina"], "n", "n"],
  ["Mover actividades entre cubos", "s", "n", "n", ["Las de su oficina"], ["Las suyas, hasta «En revisión»"], "n"],
  ["Reportar avance con evidencia", "s", "n", "n", ["Su oficina"], ["Las asignadas"], "n"],
  ["Validar un avance y pasar a Hecho", ["Respaldo del gestor; nunca el propio"], "n", "n", ["Nunca el propio"], "n", "n"],
  ["Evaluar la financiación de planes y líneas", ["Para revisar y probar"], "n", "s", "n", "n", "n"],
  ["Registrar, anular o cargar la ejecución del presupuesto", ["Para revisar y probar"], "n", "s", "n", "n", "n"],
  ["Ver el presupuesto y sus alertas", "s", "s", "s", ["Solo las líneas de su oficina"], ["Solo las líneas de su oficina"], "s"],
  ["Comentar", "s", "s", "n", "s", "s", "n"],
  ["Ver y copiar la bitácora completa", "s", "s", "s", ["Su oficina"], "n", "n"],
];
const REGLAS: [string, string][] = [
  ["Nadie aprueba lo propio", "Ni una solicitud de cambio ni un avance reportado por uno mismo."],
  ["La ejecución del presupuesto la registra solo la VAF", "Las oficinas ven el presupuesto de sus líneas, en lectura. Lo registrado no se edita: se anula con otro movimiento."],
  ["La evaluación financiera no bloquea", "Las oficinas operan mientras la VAF evalúa; el estado financiero queda a la vista en cada plan y línea."],
  ["Un gestor solo asigna a su oficina", "La base rechaza una asignación a alguien de otra oficina, aunque el navegador la permita."],
  ["Lo publicado no se edita", "Una versión publicada y un corte cerrado quedan congelados. Para cambiar se abre un borrador."],
  ["Cada reporte guarda su versión", "El seguimiento apunta a la versión vigente y conserva a cuál pertenecía cada avance."],
  ["La bitácora solo se añade", "Sin editar ni borrar: es el registro para auditoría."],
];

const Valor = ({ c }: { c: Celda }) =>
  c === "s" ? <><b aria-hidden="true">●</b> Sí</> : c === "n" ? <><b aria-hidden="true">—</b> No</> : <><b aria-hidden="true">◐</b> Con límite<span>{c[0]}</span></>;

export function Roles() {
  const { nivel } = usePs();
  return (
    <div className="ps-seccion">
      <p className="ps-sub">Quién ve y quién puede hacer qué. El nivel sale del rol de acceso de la persona (Usuarios y roles › Planeación y Seguimiento), no de la capacidad general. Su nivel: <strong>{rotuloNivel[nivel]}</strong>.</p>
      <p className="ps-aviso ps-aviso--info">El nivel «Financiero (VAF)» se asigna por persona mediante un rol de acceso (por ejemplo «Director VAF»); el administrador también opera todo lo financiero para revisar y probar.</p>
      <div className="ps-tabla-matriz" role="region" aria-label="Matriz de permisos" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Capacidad</th>{NIVELES.map((n) => <th scope="col" key={n}>{n}</th>)}</tr></thead>
          <tbody>
            {MATRIZ.map(([cap, ...celdas]) => (
              <tr key={cap}><th scope="row">{cap}</th>{celdas.map((c, i) => <td key={i} data-v={typeof c === "string" ? c : "l"} data-l={NIVELES[i]}><Valor c={c} /></td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="ps-bloque">
        <h2>Reglas que no se negocian</h2>
        <p className="ps-sub">Las hace cumplir la base de datos, no la pantalla.</p>
        <ul className="ps-reglas">{REGLAS.map(([t, d]) => <li key={t}><strong>{t}</strong><span>{d}</span></li>)}</ul>
      </section>
    </div>
  );
}

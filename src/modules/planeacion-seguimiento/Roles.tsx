/* Planeación y Seguimiento · roles y permisos (la matriz del diseño aprobado). En esta fase solo están activos el lector, el administrador (crear plan, cargar, publicar) y la lectura de los demás; lo operativo llega en las fases 2 a 4. */

import { usePs } from "./contexto";
import { rotuloNivel } from "./modelo";

type Celda = "s" | "n" | [string];
const NIVELES = ["Administrador de planeación", "Aprobador", "Gestor de oficina", "Colaborador", "Lector o directivo"] as const;
const MATRIZ: [string, ...Celda[]][] = [
  ["Ver resumen y seguimiento", "s", "s", "s", "s", "s"],
  ["Cargar Excel, crear y publicar versiones, abrir y cerrar cortes", "s", "n", "n", "n", "n"],
  ["Solicitar cambios al plan", "s", "n", ["Solo proyectos de su oficina"], "n", "n"],
  ["Aprobar, devolver o rechazar solicitudes", "n", ["Nunca la propia"], "n", "n", "n"],
  ["Asignar actividades", ["A personas de la oficina de la actividad"], "n", ["Solo a su oficina"], "n", "n"],
  ["Crear actividades, riesgos y acciones", "s", "n", ["Su oficina"], "n", "n"],
  ["Mover actividades entre cubos", "s", "n", ["Las de su oficina"], ["Las suyas, hasta «En revisión»"], "n"],
  ["Reportar avance con evidencia", "s", "n", ["Su oficina"], ["Las asignadas"], "n"],
  ["Validar un avance y pasar a Hecho", ["Respaldo del gestor; nunca el propio"], "n", ["Nunca el propio"], "n", "n"],
  ["Comentar", "s", "s", "s", "s", "n"],
  ["Ver y copiar la bitácora completa", "s", "s", ["Su oficina"], "n", "n"],
];
const REGLAS: [string, string][] = [
  ["Nadie aprueba lo propio", "Ni una solicitud de cambio ni un avance reportado por uno mismo."],
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
      <p className="ps-aviso ps-aviso--info">En esta primera fase solo se leen el plan y sus versiones; el administrador además crea el plan, carga la planificación y publica. El resto de capacidades se activa en las fases siguientes.</p>
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

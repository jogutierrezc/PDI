/* =============================================================================
   THE Impact · plantillas: los seis correos del flujo (asignación, recordatorio,
   enviado a revisión, devuelto con observaciones, aprobado y resumen), con su vista
   previa. El texto vive en la pantalla Correos (claves c-thi-*, migración 0241), donde
   la administración lo edita; aquí se ve cómo quedó, cuándo sale cada uno y si la
   migración ya las sembró. La vista previa usa el diseño de lib/correo-html.ts con
   datos de ejemplo y se muestra aislada (iframe sin scripts).
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { Alerta, Cargando, Vacio, hace } from "../../uigreen/ui/comunes";
import { usePlantillasCorreoThi } from "../datos";
import { PLANTILLAS_THI, htmlCorreoRanking } from "../lib/correo-html";
import { useThi } from "./contexto";

const EJEMPLO: Record<string, string> = {
  nombre: "Marcela Quintero",
  indicador: "4.3.1 · Admisión de estudiantes con bajos recursos",
  pregunta: "¿Tiene la universidad políticas de admisión para estudiantes del quintil inferior?",
  categoria: "ODS 4 · Educación de calidad",
  oficina: "Admisiones y Registro",
  fecha_limite: "15 de noviembre de 2026",
  dias: "vence en 3 días",
  comentario: "El documento no muestra el año de aprobación de la política. Agregue la resolución con su fecha.",
  autor: "Marcela Quintero",
  revisor: "Sergio Beltrán",
  cantidad: "3 indicadores",
  lista: "4.3.1 · Admisión de estudiantes con bajos recursos (vence en 3 días); 4.5.1 · Becas para estudiantes refugiados (vence en 3 días)",
  enlace: "https://planeacion.udes.edu.co/admin/reporte-rankings",
};

const rellenar = (html: string) => html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => EJEMPLO[k] ?? "");

export function Plantillas() {
  const t = useThi();
  const guardadas = usePlantillasCorreoThi();
  const [clave, setClave] = useState(PLANTILLAS_THI[0].clave);
  const plantilla = PLANTILLAS_THI.find((p) => p.clave === clave) ?? PLANTILLAS_THI[0];
  const html = useMemo(() => rellenar(htmlCorreoRanking(plantilla.correo)), [plantilla]);
  const asunto = rellenar(plantilla.asunto);
  const legible = guardadas.data !== null && guardadas.data !== undefined;
  const enBase = new Map((guardadas.data ?? []).map((g) => [g.key, g]));

  if (!t.esAdmin) return <Vacio>Las plantillas de los correos las gestiona la administración del ranking.</Vacio>;

  return (
    <div className="ugm-pila">
      <section className="ugm-sec">
        <h2>Plantillas de correo</h2>
        <p className="ugm-lead">
          Un correo por cada evento del flujo. Se editan en la pantalla Correos como las demás (claves <span className="ugm-cod">c-thi-*</span>); lo que sigue es la vista previa con datos de ejemplo.
        </p>
        {guardadas.isLoading ? (
          <Cargando />
        ) : legible && enBase.size === 0 ? (
          <Alerta tipo="aviso">Las plantillas todavía no están en la base: falta aplicar la migración 0241. Mientras tanto, los avisos usan un texto de respaldo.</Alerta>
        ) : null}
        <div className="ugm-acciones">
          <Link className="ugm-btn ugm-btn--sm" to="/admin/correos">
            <Icon name="mail" size={16} /> Editar en Correos
          </Link>
        </div>
      </section>

      <div className="ugm-cols ugm-cols--ficha">
        <section className="ugm-sec" aria-label="Vista previa">
          <h3>{plantilla.nombre}</h3>
          <p className="ugm-muted ugm-peq">
            Asunto: <b>{asunto}</b>
          </p>
          <iframe className="thi-previa" title={`Vista previa: ${plantilla.nombre}`} sandbox="" srcDoc={`<!doctype html><meta charset="utf-8">${html}`} />
        </section>
        <aside className="ugm-sec" aria-label="Plantillas del flujo">
          <h3>Eventos del flujo</h3>
          <ul className="ugm-lista">
            {PLANTILLAS_THI.map((p) => {
              const g = enBase.get(p.clave);
              return (
                <li key={p.clave}>
                  <button type="button" className="ugm-fila-btn" aria-pressed={clave === p.clave} onClick={() => setClave(p.clave)}>
                    <span>
                      <Icon name="mail" size={16} />
                    </span>
                    <span>
                      {p.nombre}
                      <small>
                        {p.destino === "oficina" ? "A la oficina" : "A la administración"} · {p.cuando}
                      </small>
                      {legible && <small>{g ? `${g.active ? "Activa" : "Apagada"}${g.updated_at ? ` · editada ${hace(g.updated_at)}` : ""}` : "Sin sembrar"}</small>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="ugm-muted ugm-peq">
            Variables disponibles: nombre, indicador, pregunta, categoría (aquí, el ODS), oficina, fecha límite, días, comentario, autor, revisor, cantidad, lista y enlace. Los logos del encabezado son los del ejemplo aprobado.
          </p>
        </aside>
      </div>
    </div>
  );
}

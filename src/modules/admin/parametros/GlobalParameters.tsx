import { useState, type FormEvent } from "react";
import { AdminSidebar } from "../components/AdminSidebar";
import "./global-parameters.css";

type ParameterKey = "states" | "levels" | "units" | "periods";
type Parameter = { key: ParameterKey; title: string; description: string; icon: string; values: string[]; hint: string };

const initialParameters: Parameter[] = [
  { key: "states", title: "Estados", description: "Define los estados disponibles para proyectos, metas e indicadores.", icon: "●", values: ["Activo", "En pausa", "Finalizado", "No iniciado"], hint: "Se utilizan para identificar el estado de avance." },
  { key: "levels", title: "Niveles de gestión", description: "Clasifica el nivel de gestión de cada indicador del PDI.", icon: "◆", values: ["Estratégico", "Táctico", "Operativo"], hint: "Se muestran en las fichas de indicadores." },
  { key: "units", title: "Unidades de medida", description: "Administra las unidades para metas, resultados y porcentajes.", icon: "%", values: ["Porcentaje", "Número", "Pesos", "Índice"], hint: "Permite interpretar correctamente cada meta." },
  { key: "periods", title: "Periodicidad", description: "Configura la frecuencia con la que se reportan los resultados.", icon: "◷", values: ["Mensual", "Trimestral", "Semestral", "Anual"], hint: "Se asigna desde la planeación de resultados." },
];

export function GlobalParameters() {
  const [parameters, setParameters] = useState(initialParameters);
  const [active, setActive] = useState<ParameterKey | null>(null);
  const [newValue, setNewValue] = useState("");
  const [saved, setSaved] = useState(false);
  const activeParameter = parameters.find((parameter) => parameter.key === active);

  function addValue(event: FormEvent) {
    event.preventDefault();
    if (!active || !newValue.trim()) return;
    setParameters((current) => current.map((parameter) => parameter.key === active ? { ...parameter, values: [...parameter.values, newValue.trim()] } : parameter));
    setNewValue("");
    setActive(null);
  }

  return <div className="global-parameters"><AdminSidebar activeSection="parameters" showNewInitiative /><main className="global-parameters__main"><header className="global-parameters__topbar"><div><span className="global-parameters__kicker">Avant PDI / Configuración</span><h1>Parámetros globales</h1><p>Catálogos que estructuran la medición y el seguimiento de todos los pilares.</p></div><div className="global-parameters__profile"><span>Administrador</span><button type="button" aria-label="Opciones de usuario">◌</button></div></header><section className="parameters-intro"><div><span className="parameters-intro__number">01</span><h2>Una base común para medir el avance</h2><p>Configura los valores disponibles al crear áreas estratégicas, líneas de acción, proyectos e indicadores. Los cambios aquí se reflejan en los formularios de cada pilar.</p></div><div className="parameters-intro__badge"><strong>{parameters.reduce((total, parameter) => total + parameter.values.length, 0)}</strong><span>valores configurados</span></div></section><section className="parameter-grid">{parameters.map((parameter) => <article className="parameter-card" key={parameter.key}><div className="parameter-card__top"><span className="parameter-card__icon">{parameter.icon}</span><span className="parameter-card__count">{parameter.values.length} valores</span></div><h2>{parameter.title}</h2><p>{parameter.description}</p><div className="parameter-values">{parameter.values.map((value) => <span key={value}>{value}</span>)}</div><div className="parameter-card__footer"><small>{parameter.hint}</small><button type="button" onClick={() => setActive(parameter.key)}>＋ Añadir valor</button></div></article>)}</section><footer className="global-parameters__save"><span>{saved ? "Configuración guardada correctamente" : "Los valores se aplican a todos los pilares"}</span><button type="button" onClick={() => setSaved(true)}>Guardar configuración</button></footer></main>{activeParameter && <div className="parameters-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setActive(null)}><section className="parameters-modal" role="dialog" aria-modal="true" aria-label={`Añadir valor a ${activeParameter.title}`}><button type="button" className="parameters-modal__close" onClick={() => setActive(null)} aria-label="Cerrar">×</button><span className="parameters-modal__eyebrow">Catálogo global</span><h2>Añadir valor a {activeParameter.title}</h2><p>Este valor podrá seleccionarse en la configuración de cualquier pilar.</p><form onSubmit={addValue}><label>Nombre del valor<input autoFocus required value={newValue} onChange={(event) => setNewValue(event.target.value)} placeholder={`Ej. Nuevo ${activeParameter.title.toLowerCase()}`} /></label><div className="parameters-modal__actions"><button type="button" onClick={() => setActive(null)}>Cancelar</button><button type="submit">Añadir valor</button></div></form></section></div>}</div>;
}

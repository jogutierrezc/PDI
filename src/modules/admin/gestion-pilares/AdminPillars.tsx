import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import "./gestion-pilares.css";

interface Pillar {
  id: string;
  name: string;
  summary: string;
  objective: string;
  impulsor: string;
  contributes: string;
  managementOwner: string;
  calculationOwner: string;
  considerations: string;
  status: string;
  level: string;
  unit: string;
  periodicity: string;
  support: string;
  planning: string;
}

const initialPillars: Pillar[] = [
  { id: "personalizacion", name: "Personalización", summary: "Enfoque humano y adaptación a las necesidades de la comunidad.", objective: "Potenciar el talento de cada estudiante mediante una experiencia institucional cercana y pertinente.", impulsor: "Desarrollo integral de la comunidad universitaria", contributes: "Experiencia educativa y permanencia estudiantil", managementOwner: "Vicerrectoría Académica", calculationOwner: "Oficina de Planeación", considerations: "Registrar avances con evidencias académicas y de acompañamiento institucional.", status: "Activo", level: "Estratégico", unit: "Porcentaje", periodicity: "Anual", support: "Mesa de acompañamiento académico y evidencias del pilar.", planning: "Definir metas de acompañamiento y validar resultados por periodo." },
  { id: "ambiente-tecnologico", name: "Ambiente tecnológico", summary: "Infraestructura y digitalización de procesos institucionales.", objective: "Modernizar la infraestructura digital y fortalecer la innovación tecnológica institucional.", impulsor: "Transformación digital y eficiencia institucional", contributes: "Modernización, innovación y continuidad operativa", managementOwner: "Dirección de Tecnología", calculationOwner: "Oficina de Planeación", considerations: "El avance considera proyectos activos, hitos aprobados y evidencias reportadas.", status: "Activo", level: "Estratégico", unit: "Porcentaje", periodicity: "Anual", support: "Soporte técnico, mesa de ayuda y repositorio de evidencias.", planning: "Priorizar cultura digital y actualizar metas del siguiente trimestre." },
];

const emptyPillar = (): Pillar => ({ id: `pilar-${Date.now()}`, name: "", summary: "", objective: "", impulsor: "", contributes: "", managementOwner: "", calculationOwner: "", considerations: "", status: "Borrador", level: "Estratégico", unit: "Porcentaje", periodicity: "Anual", support: "", planning: "" });

export function AdminPillars() {
  const [pillars, setPillars] = useState<Pillar[]>(() => loadPillars());
  const [selectedId, setSelectedId] = useState(pillars[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState("contenido");
  const [saved, setSaved] = useState(false);
  const selected = pillars.find((pillar) => pillar.id === selectedId) ?? pillars[0];

  function updatePillar(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    if (!selected) return;
    const { name, value } = event.target;
    setPillars((current) => current.map((pillar) => pillar.id === selected.id ? { ...pillar, [name]: value } : pillar));
    setSaved(false);
  }

  function createPillar() {
    const next = emptyPillar();
    setPillars((current) => [...current, next]);
    setSelectedId(next.id);
    setActiveTab("contenido");
    setSaved(false);
  }

  function savePillars(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localStorage.setItem("pdi-admin-pillars", JSON.stringify(pillars));
    setSaved(true);
  }

  function deletePillar() {
    if (!selected || pillars.length === 1) return;
    const remaining = pillars.filter((pillar) => pillar.id !== selected.id);
    setPillars(remaining);
    setSelectedId(remaining[0].id);
    setSaved(false);
  }

  return <div className="admin-portal"><div className="admin-shell"><aside className="admin-sidebar"><a className="admin-brand" href="/admin/pilares"><img src="/logo-udes.svg" alt="Universidad de Santander" /><strong>Avant PDI</strong><span>Administración institucional</span></a><nav className="admin-nav" aria-label="Navegación administrativa"><a className="is-active" href="/admin/pilares"><span>▦</span> Panel de control</a><a href="/admin/pilares"><span>♙</span> Usuarios</a><a className="is-active" href="/admin/pilares"><span>◇</span> Gestión de pilares</a><a href="/implementacion"><span>▤</span> Repositorio</a></nav><div className="admin-sidebar__bottom"><a href="mailto:planeacion@udes.edu.co"><span>?</span> Ayuda</a><a href="/acceso-intranet"><span>↪</span> Cerrar sesión</a></div></aside><div className="admin-body"><main className="admin-main"><header className="admin-heading"><div><span className="admin-kicker">Administración · Gestión de Pilares</span><h1>Construye el contenido del PDI</h1><p>Crea, organiza y administra la información que verá la comunidad en cada pilar estratégico.</p></div><div className="admin-heading__actions"><a href="/implementacion">Ver portal</a><button type="button" onClick={createPillar}>+ Nuevo pilar</button></div></header>
    <div className="admin-workspace"><aside className="pillar-list"><div className="pillar-list__header"><div><span>Pilares estratégicos</span><strong>{pillars.length} configurados</strong></div><button type="button" onClick={createPillar} aria-label="Crear pilar">+</button></div><div className="pillar-list__items">{pillars.map((pillar, index) => <button className={`pillar-list__item${selected?.id === pillar.id ? " is-selected" : ""}`} type="button" key={pillar.id} onClick={() => { setSelectedId(pillar.id); setSaved(false); }}><span className="pillar-list__number">0{index + 1}</span><span><strong>{pillar.name || "Nuevo pilar"}</strong><small>{pillar.status}</small></span><span className="pillar-list__arrow">→</span></button>)}</div></aside>
      {selected && <form className="pillar-editor" onSubmit={savePillars}><div className="pillar-editor__top"><div><span className="admin-kicker">Editando pilar</span><h2>{selected.name || "Nuevo pilar"}</h2></div><div className="editor-actions"><button className="delete-button" type="button" onClick={deletePillar} disabled={pillars.length === 1}>Eliminar</button><button className="save-button" type="submit">{saved ? "Guardado" : "Guardar cambios"}</button></div></div><nav className="editor-tabs" aria-label="Secciones de edición">{[{ id: "contenido", label: "Contenido general" }, { id: "indicador", label: "Indicador" }, { id: "operacion", label: "Operación" }].map((tab) => <button className={activeTab === tab.id ? "is-active" : ""} type="button" key={tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>
        {activeTab === "contenido" && <section className="editor-section"><Field label="Nombre del pilar" name="name" value={selected.name} onChange={updatePillar} placeholder="Ej. Ambiente tecnológico" /><Field label="Resumen público" name="summary" value={selected.summary} onChange={updatePillar} placeholder="Descripción breve que aparecerá en las tarjetas" /><Field label="Objetivo del pilar" name="objective" value={selected.objective} onChange={updatePillar} multiline placeholder="Escribe la visión y el objetivo estratégico del pilar" /></section>}
        {activeTab === "indicador" && <section className="editor-section"><div className="form-grid"><Field label="Impulsador" name="impulsor" value={selected.impulsor} onChange={updatePillar} /><Field label="Aporta" name="contributes" value={selected.contributes} onChange={updatePillar} /><Field label="Responsable de la gestión" name="managementOwner" value={selected.managementOwner} onChange={updatePillar} /><Field label="Responsable del cálculo" name="calculationOwner" value={selected.calculationOwner} onChange={updatePillar} /></div><Field label="Consideraciones del indicador" name="considerations" value={selected.considerations} onChange={updatePillar} multiline /><div className="form-grid form-grid--three"><Select label="Estado" name="status" value={selected.status} onChange={updatePillar} options={["Borrador", "Activo", "En revisión", "Inactivo"]} /><Select label="Nivel de gestión" name="level" value={selected.level} onChange={updatePillar} options={["Estratégico", "Táctico", "Operativo"]} /><Select label="Unidad" name="unit" value={selected.unit} onChange={updatePillar} options={["Porcentaje", "Número", "Índice"]} /><Select label="Periodicidad" name="periodicity" value={selected.periodicity} onChange={updatePillar} options={["Mensual", "Trimestral", "Semestral", "Anual"]} /></div></section>}
        {activeTab === "operacion" && <section className="editor-section"><div className="content-callout"><span>Contenido operativo</span><p>Estos textos alimentan las secciones de soporte y planeación dentro del visualizador del pilar.</p></div><Field label="Soporte y evidencias" name="support" value={selected.support} onChange={updatePillar} multiline placeholder="Describe qué información de soporte estará disponible" /><Field label="Planeación de resultados" name="planning" value={selected.planning} onChange={updatePillar} multiline placeholder="Define el siguiente ciclo y los resultados esperados" /></section>}
      </form>}
    </div></main></div></div></div>;
}

function Field({ label, name, value, onChange, placeholder, multiline = false }: { label: string; name: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void; placeholder?: string; multiline?: boolean }) { return <label className="admin-field"><span>{label}</span>{multiline ? <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} rows={4} /> : <input name={name} value={value} onChange={onChange} placeholder={placeholder} />}</label>; }
function Select({ label, name, value, onChange, options }: { label: string; name: string; value: string; onChange: (event: ChangeEvent<HTMLSelectElement>) => void; options: string[] }) { return <label className="admin-field"><span>{label}</span><select name={name} value={value} onChange={onChange}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function loadPillars(): Pillar[] { try { const saved = localStorage.getItem("pdi-admin-pillars"); return saved ? JSON.parse(saved) as Pillar[] : initialPillars; } catch { return initialPillars; } }

// Vista previa temporal de la hoja del boletín. Se borra al terminar.
import ReactDOM from "react-dom/client";
import type { CSSProperties, ReactNode } from "react";
import "../src/modules/boletin/boletin.css";
import { tytUnits } from "../src/modules/boletin/tyt";
import data from "./data.json";
import type { SaberTytData } from "../src/modules/datos-abiertos/data/saber-tyt";

function Sheet({ title, description, source, notes, children }: { title: string; description?: string; source: string; notes?: [string, ReactNode][]; wide?: boolean; children: ReactNode }) {
  const items = ([["Qué muestra", description], ["Reporta", source], ...(notes ?? [])] as [string, ReactNode][]).filter(([, v]) => v);
  return (
    <article className="bol-sheet" data-wide>
      <dl className="bol-notes">{items.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}</dl>
      <div className="bol-sheet__body"><header className="bol-sheet__head"><h3>{title}</h3></header>{children}</div>
    </article>
  );
}
const comp = (new URLSearchParams(location.search).get("c") ?? "rc") as "rc";
const units = tytUnits(data as SaberTytData, comp, 0, Sheet);
const vars = { "--bol-navy": "#072b58", "--bol-band": "#4078b9", "--bol-accent": "#e8892b", "--bol-font": "Montserrat, sans-serif" } as CSSProperties;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <div className="bol-doc" style={vars}>
    {units.map((u, i) => (
      <div key={i} style={{ width: "210mm", minHeight: "297mm", margin: "0 auto 6mm", background: "#fff", padding: "16mm", boxSizing: "border-box" }}>{u.node}</div>
    ))}
  </div>,
);

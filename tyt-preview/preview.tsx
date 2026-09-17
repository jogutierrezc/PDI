// Vista previa temporal del bloque Saber TyT. Se borra al terminar.
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../src/styles/tokens.css";
import "../src/styles/base.css";
import "../src/styles/app.css";
import "../src/modules/datos-abiertos/datos-abiertos.css";
import { SaberTytBlock } from "../src/modules/datos-abiertos/components/SaberTytBlock";
import data from "./data.json";
import type { SaberTytData } from "../src/modules/datos-abiertos/data/saber-tyt";

const theme = new URLSearchParams(location.search).get("tema");
if (theme) document.documentElement.setAttribute("data-theme", theme);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <main className="od-report-page" style={{ background: "var(--od-page)", minHeight: "100vh" }}>
      <SaberTytBlock data={data as unknown as SaberTytData} anchor="od-saber-tyt" />
    </main>
  </BrowserRouter>,
);

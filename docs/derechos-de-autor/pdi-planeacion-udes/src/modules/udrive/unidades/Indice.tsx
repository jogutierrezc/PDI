/* =============================================================================
   UDrive · Unidades de trabajo · el índice (/admin/udrive/unidades).

   Las unidades como portadas con identidad propia (cada una con su monograma,
   color y composición), con búsqueda, filtros (todas, mías, compartidas
   conmigo, archivadas y, para la administración general, sin ser miembro y sin
   quien las administre) y una vista de lista. Abrir una unidad lleva la portada
   de la tarjeta a la página (movimiento.ts, desdeTarjeta).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { useUnidades, useUrlCabecera } from "./datos";
import { FormularioUnidad } from "./FormularioUnidad";
import { aparienciaDe, nivelCuota, quitarTildes, textoBytes } from "./lib";
import { EstadoUnidades, MarcoUnidades } from "./Marco";
import { entrarTarjetas, fundir } from "./movimiento";
import { CuerpoTarjeta, etiquetaDeRol } from "./Portada";
import type { UnidadFila } from "./tipos";
import { Icon } from "../../../components/ui/Icon";

type Filtro = "todas" | "mias" | "compartidas" | "archivadas" | "sinmiembro" | "sinadmin";

function Tarjeta({ u, onAbrir }: { u: UnidadFila; onAbrir: (u: UnidadFila, el: HTMLElement) => void }) {
  const url = useUrlCabecera(u.imagen?.ruta);
  const nivel = nivelCuota(u.uso_bytes, u.cuota_bytes);
  const aviso = u.mi_rol === "admin" && !u.archivada_en && (nivel !== "bien" || u.vencen_pronto > 0);
  const etiqueta = u.archivada_en ? "Archivada" : u.sin_admin ? "Sin quien la administre" : aviso ? (nivel === "lleno" ? "Espacio lleno" : nivel === "aviso" ? "Espacio al 80 %" : "Accesos por vencer") : etiquetaDeRol(u);
  return (
    <button
      type="button"
      className={`un-card un-card--${u.composicion}`}
      data-archivada={Boolean(u.archivada_en)}
      data-id={u.id}
      aria-label={`Abrir ${u.nombre}. ${u.es_miembro ? `Su papel: ${etiquetaDeRol(u)}.` : "Entra como administración general, sin ser miembro."}${u.archivada_en ? " Archivada." : ""}`}
      onClick={(e) => onAbrir(u, e.currentTarget)}
    >
      <CuerpoTarjeta a={aparienciaDe(u, url.data ?? null)} personas={u.n_miembros} detalle={textoBytes(u.uso_bytes)} etiqueta={etiqueta} tono={u.archivada_en || u.sin_admin || aviso ? "aviso" : u.es_miembro ? "normal" : "admin"} />
    </button>
  );
}

export function UnidadesIndice() {
  const { hasRole } = useAuth();
  const admin = hasRole("admin");
  const navigate = useNavigate();
  const q = useUnidades();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [buscar, setBuscar] = useState("");
  const [modo, setModo] = useState<"portadas" | "lista">("portadas");
  const zona = useRef<HTMLDivElement>(null);
  const primera = useRef(true);

  const todas = useMemo(() => q.data ?? [], [q.data]);
  const cuenta = (f: Filtro) => todas.filter((u) => pasa(u, f)).length;

  const lista = useMemo(() => {
    const t = quitarTildes(buscar.trim());
    return todas.filter((u) => pasa(u, filtro) && (!t || quitarTildes(`${u.nombre} ${u.descripcion} ${u.monograma}`).includes(t)));
  }, [todas, filtro, buscar]);

  // Entrada en cascada solo cuando se llega al índice; al filtrar o buscar basta un fundido.
  useEffect(() => {
    if (!q.isSuccess || !zona.current) return;
    const els = zona.current.querySelectorAll(".un-card, .un-ulist li");
    if (primera.current) {
      primera.current = false;
      entrarTarjetas(els);
    }
  }, [q.isSuccess]);
  useEffect(() => {
    if (!primera.current && zona.current) fundir(zona.current.querySelectorAll(".un-card, .un-ulist li"));
  }, [filtro, buscar, modo]);

  const abrir = (u: UnidadFila, el: HTMLElement) => {
    const r = el.querySelector(".un-hero")?.getBoundingClientRect();
    navigate(`/admin/udrive/unidad/${u.id}`, { state: r ? { origen: { left: r.left, top: r.top, width: r.width, height: r.height } } : undefined });
  };

  if (q.isPending || q.error) return <EstadoUnidades cargando={q.isPending} error={q.error} reintentar={() => void q.refetch()} />;

  const filtros: [Filtro, string][] = [["todas", "Todas"], ["mias", "Mías"], ["compartidas", "Compartidas conmigo"], ...(admin ? ([["sinmiembro", "Sin ser miembro"], ["sinadmin", "Sin quien las administre"]] as [Filtro, string][]) : []), ["archivadas", "Archivadas"]];
  const sinAdmin = admin ? todas.filter((u) => u.sin_admin && !u.archivada_en) : [];

  return (
    <MarcoUnidades actual="lista">
      <div className="un-pagina">
        <header className="un-cab">
          <div>
            <p className="un-kicker">UDrive</p>
            <h1>Unidades de trabajo</h1>
            <p className="un-ayuda un-cab__d">Espacios con nombre propio para una oficina o un proyecto: personas con papel, carpetas y archivos del grupo.</p>
          </div>
          <button type="button" className="un-btn" onClick={() => navigate("/admin/udrive/unidades/nueva")}><Icon name="plus" size={16} />Nueva unidad</button>
        </header>

        {admin ? <p className="un-banda" role="note">Sesión de administración general: ve todas las unidades, puede entrar a cualquiera y editarla. Su ingreso a las unidades en las que no es miembro queda en el registro.</p> : null}
        {sinAdmin.length ? <p className="un-nota un-nota--aviso" role="status">{sinAdmin.length === 1 ? "Una unidad está sin quien la administre" : `${sinAdmin.length} unidades están sin quien las administre`} y la atiende usted como administración general: {sinAdmin.map((u) => u.nombre).join(", ")}.</p> : null}

        <div className="un-herr">
          <div className="un-fld un-herr__b">
            <label htmlFor="un-buscar">Buscar una unidad</label>
            <input id="un-buscar" type="search" value={buscar} placeholder="Nombre, descripción o monograma" autoComplete="off" onChange={(e) => setBuscar(e.target.value)} />
          </div>
          <fieldset className="un-fld">
            <legend>Mostrar</legend>
            <div className="un-seg">
              {filtros.map(([k, t]) => (
                <label key={k}><input type="radio" name="un-filtro" checked={filtro === k} onChange={() => setFiltro(k)} /><span>{t} <span className="un-num">{cuenta(k)}</span></span></label>
              ))}
            </div>
          </fieldset>
          <fieldset className="un-fld">
            <legend>Vista</legend>
            <div className="un-seg">
              <label><input type="radio" name="un-modo" checked={modo === "portadas"} onChange={() => setModo("portadas")} /><span>Portadas</span></label>
              <label><input type="radio" name="un-modo" checked={modo === "lista"} onChange={() => setModo("lista")} /><span>Lista</span></label>
            </div>
          </fieldset>
        </div>
        <p className="un-ayuda" role="status" aria-live="polite">{lista.length} {lista.length === 1 ? "unidad" : "unidades"}</p>

        <div ref={zona}>
          {!lista.length ? (
            <div className="un-vacio">
              <strong>{buscar ? `Ninguna unidad coincide con «${buscar}»` : filtro === "archivadas" ? "No hay unidades archivadas" : filtro === "mias" ? "Todavía no administra ninguna unidad" : todas.length ? "No hay unidades en esta vista" : "Aún no hay unidades de trabajo"}</strong>
              <span>{buscar ? "Pruebe con otra palabra o quite el filtro." : todas.length ? "Cambie el filtro para ver las demás." : "Cree la primera para su oficina o pida que lo añadan a la de su equipo."}</span>
              {!todas.length ? <button type="button" className="un-btn" onClick={() => navigate("/admin/udrive/unidades/nueva")}>Crear una unidad</button> : null}
            </div>
          ) : modo === "portadas" ? (
            <div className="un-grid">{lista.map((u) => <Tarjeta key={u.id} u={u} onAbrir={abrir} />)}</div>
          ) : (
            <ul className="un-ulist">
              {lista.map((u) => (
                <li key={u.id}>
                  <button type="button" onClick={(e) => abrir(u, e.currentTarget)} aria-label={`Abrir ${u.nombre}`}>
                    <span className="un-mono un-mono--chico" style={{ ["--ac" as string]: u.acento }} aria-hidden="true">{u.monograma}</span>
                    <span className="un-ulist__n"><strong>{u.nombre}</strong><small>{u.descripcion || "Sin descripción"}</small></span>
                    <span className="un-ulist__r">{u.archivada_en ? "Archivada" : etiquetaDeRol(u)}<small>{u.n_miembros} {u.n_miembros === 1 ? "persona" : "personas"}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </MarcoUnidades>
  );
}

function pasa(u: UnidadFila, f: Filtro): boolean {
  if (f === "archivadas") return Boolean(u.archivada_en);
  if (u.archivada_en) return false;
  const mia = u.es_miembro && u.mi_rol === "admin";
  if (f === "mias") return mia;
  if (f === "compartidas") return u.es_miembro && !mia;
  if (f === "sinmiembro") return !u.es_miembro;
  if (f === "sinadmin") return u.sin_admin;
  return true;
}

/** /admin/udrive/unidades/nueva */
export function NuevaUnidad() {
  const navigate = useNavigate();
  return (
    <MarcoUnidades actual="nueva">
      <div className="un-pagina">
        <header className="un-cab">
          <div>
            <p className="un-kicker">Unidades de trabajo</p>
            <h1>Nueva unidad</h1>
            <p className="un-ayuda un-cab__d">Un nombre, su identidad y las personas con su papel. Lo demás se puede cambiar después.</p>
          </div>
        </header>
        <FormularioUnidad onTerminar={() => navigate("/admin/udrive/unidades")} />
      </div>
    </MarcoUnidades>
  );
}

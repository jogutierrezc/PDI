/* =============================================================================
   UDrive · Unidades de trabajo · la página de una unidad (/admin/udrive/unidad/:id).

   Inicio al estilo de un sitio de equipo, pero más sobrio: portada con su
   identidad, carpetas ancladas, recientes, informes en construcción, personas y
   actividad (en el orden que quien administra haya elegido). Las secciones del
   riel: Inicio, Archivos (el explorador de UDrive dentro de la unidad), Personas,
   Personalizar y Espacio.

   La administración general entra a cualquier unidad. Si no es miembro, la
   página lo dice y la base registra el ingreso (drive_unidad_entrar).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { haceCuanto } from "../../../components/espacio/logica";
import { useAuth } from "../../../lib/auth";
import { useArchivos, useCarpetas } from "../datos";
import { subarbol } from "../lib/arbol";
import { Explorador } from "../ui/Explorador";
import { useEventos, useMiembros, useRegistrarIngreso, useUnidades, useUrlCabecera } from "./datos";
import { aparienciaDe, fraccionCuota, nivelCuota, textoAccion, textoBytes } from "./lib";
import { EstadoUnidades, MarcoUnidades } from "./Marco";
import type { SeccionUnidad } from "./Marco";
import { desdeTarjeta, entrarBloques, llenarBarra } from "./movimiento";
import { PersonalizarUnidad } from "./Personalizar";
import { PersonasUnidad } from "./PersonasUnidad";
import { Avatar } from "./Personas";
import { Portada } from "./Portada";
import { EspacioUnidad } from "./Espacio";
import type { Seccion, UnidadFila } from "./tipos";
import { NOMBRE_ROL, SECCIONES } from "./tipos";

const SECCIONES_URL: SeccionUnidad[] = ["inicio", "archivos", "personas", "personalizar", "espacio"];

export function PaginaUnidad({ id }: { id: string }) {
  const q = useUnidades();
  const [params] = useSearchParams();
  const pedida = (params.get("s") ?? "inicio") as SeccionUnidad;
  const u = q.data?.find((x) => x.id === id);
  const ingreso = useRegistrarIngreso();
  const registrado = useRef<string | null>(null);

  // La administración general entra a una unidad ajena: queda en el registro.
  useEffect(() => {
    if (u && !u.es_miembro && registrado.current !== u.id) {
      registrado.current = u.id;
      ingreso.mutate(u.id);
    }
  }, [u, ingreso]);

  if (q.isPending || q.error) return <EstadoUnidades cargando={q.isPending} error={q.error} reintentar={() => void q.refetch()} />;
  if (!u) {
    return (
      <MarcoUnidades actual="lista">
        <div className="un-pagina">
          <div className="un-vacio">
            <strong>No encuentro esa unidad</strong>
            <span>Puede que no tenga acceso, que su acceso haya vencido o que ya no exista.</span>
            <Link className="un-btn" to="/admin/udrive/unidades">Volver a las unidades</Link>
          </div>
        </div>
      </MarcoUnidades>
    );
  }
  const admin = u.mi_rol === "admin";
  const seccion: SeccionUnidad = SECCIONES_URL.includes(pedida) && !(pedida === "personalizar" && !admin) ? pedida : "inicio";

  if (seccion === "archivos") {
    return (
      <Explorador
        key={u.id}
        unidad={{ id: u.id, nombre: u.nombre, raiz: u.carpeta_raiz, rango: ({ lector: 1, editor: 2, creador: 3, admin: 4 } as const)[u.mi_rol], uso: u.uso_bytes, cuota: u.cuota_bytes, archivada: Boolean(u.archivada_en) }}
      />
    );
  }

  return (
    <MarcoUnidades actual={seccion} unidad={{ id: u.id, nombre: u.nombre, puedeAdministrar: admin }}>
      {seccion === "inicio" ? <InicioUnidad u={u} /> : null}
      {seccion === "personas" ? <PersonasUnidad u={u} /> : null}
      {seccion === "personalizar" ? <PersonalizarUnidad key={u.id} u={u} /> : null}
      {seccion === "espacio" ? <EspacioUnidad u={u} /> : null}
    </MarcoUnidades>
  );
}

/* ---------- Inicio ---------------------------------------------------------------- */

function rutaDeItem(tipo: string, id: string): string | null {
  return tipo === "tabla" || tipo === "grafica" || tipo === "cruce" || tipo === "documento" || tipo === "estilo" ? `/admin/udrive/${tipo}/${id}` : null;
}

function InicioUnidad({ u }: { u: UnidadFila }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const carpetasQ = useCarpetas();
  const archivosQ = useArchivos();
  const miembrosQ = useMiembros(u.id);
  const eventosQ = useEventos(u.id, 8);
  const url = useUrlCabecera(u.imagen?.ruta);
  const portada = useRef<HTMLDivElement>(null);
  const bloques = useRef<HTMLDivElement>(null);
  const hecho = useRef(false);
  const admin = u.mi_rol === "admin";

  const carpetas = useMemo(() => carpetasQ.data ?? [], [carpetasQ.data]);
  const archivos = useMemo(() => archivosQ.data ?? [], [archivosQ.data]);
  const dentro = useMemo(() => subarbol(carpetas, u.carpeta_raiz), [carpetas, u.carpeta_raiz]);
  const carpetasU = useMemo(() => carpetas.filter((c) => dentro.has(c.id) && !c.borrado_en && c.id !== u.carpeta_raiz), [carpetas, dentro, u.carpeta_raiz]);
  const archivosU = useMemo(() => archivos.filter((a) => a.carpeta_id && dentro.has(a.carpeta_id) && !a.borrado_en), [archivos, dentro]);
  const ancladas = useMemo(() => u.ancladas.map((id) => carpetasU.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c)).slice(0, 4), [u.ancladas, carpetasU]);
  const recientes = useMemo(() => [...archivosU].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5), [archivosU]);
  const informes = useMemo(() => archivosU.filter((a) => a.tipo === "documento" && a.estado === "borrador").slice(0, 5), [archivosU]);

  // De la tarjeta a la página: la portada sale del rectángulo de la tarjeta (solo si se llegó desde el índice).
  useEffect(() => {
    if (hecho.current || !portada.current) return;
    hecho.current = true;
    const o = (location.state as { origen?: { left: number; top: number; width: number; height: number } } | null)?.origen;
    desdeTarjeta(portada.current, o ? new DOMRect(o.left, o.top, o.width, o.height) : null);
    entrarBloques(bloques.current?.querySelectorAll(".un-blk"), 0.12);
  }, [location.state]);

  const ir = (s: string, extra = "") => navigate(`/admin/udrive/unidad/${u.id}?s=${s}${extra}`);
  const nivel = nivelCuota(u.uso_bytes, u.cuota_bytes);
  const miembros = miembrosQ.data ?? [];
  const porRol = (["admin", "creador", "editor", "lector"] as const).map((r) => [r, miembros.filter((m) => m.rol === r && m.vigente).length] as const).filter(([, n]) => n > 0);

  const B: Record<Seccion, () => JSX.Element> = {
    carpetas: () => (
      <section className="un-blk un-blk--ancho" aria-labelledby="un-b-carpetas">
        <h2 id="un-b-carpetas">{SECCIONES.carpetas}<button type="button" className="un-btn un-btn--texto" onClick={() => ir("archivos")}>Ver las {carpetasU.length}</button></h2>
        {ancladas.length ? (
          <div className="un-folders">
            {ancladas.map((c) => {
              const n = carpetas.filter((x) => x.padre_id === c.id && !x.borrado_en).length + archivos.filter((a) => a.carpeta_id === c.id && !a.borrado_en).length;
              return (
                <button key={c.id} type="button" className="un-fold" onClick={() => ir("archivos", `&c=${c.id}`)}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                  <b>{c.nombre}</b><span>{n} {n === 1 ? "elemento" : "elementos"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="un-vacio un-vacio--chico"><strong>Sin carpetas ancladas</strong><span>{u.mi_rol === "admin" ? "Ancle hasta cuatro carpetas desde Personalizar." : "Quien administra la unidad puede anclar las carpetas más usadas."}</span></div>
        )}
      </section>
    ),
    recientes: () => (
      <section className="un-blk" aria-labelledby="un-b-recientes">
        <h2 id="un-b-recientes">{SECCIONES.recientes}</h2>
        {recientes.length ? (
          <ul className="un-lst">
            {recientes.map((a) => {
              const ruta = rutaDeItem(a.tipo, a.id);
              const cuerpo = <><span>{a.nombre}</span><small>{a.tipo === "archivo" ? "Archivo" : a.tipo[0].toUpperCase() + a.tipo.slice(1)} · {haceCuanto(a.updated_at)}</small></>;
              return <li key={a.id}>{ruta ? <Link to={ruta}>{cuerpo}</Link> : <button type="button" onClick={() => ir("archivos", a.carpeta_id ? `&c=${a.carpeta_id}` : "")}>{cuerpo}</button>}</li>;
            })}
          </ul>
        ) : <div className="un-vacio un-vacio--chico"><strong>Aún no hay archivos</strong><span>{u.mi_rol === "lector" || u.mi_rol === "editor" ? "Cuando alguien suba algo, aparecerá aquí." : "Suba el primero desde Archivos."}</span></div>}
      </section>
    ),
    informes: () => (
      <section className="un-blk un-blk--ancho" aria-labelledby="un-b-informes">
        <h2 id="un-b-informes">{SECCIONES.informes}</h2>
        {informes.length ? (
          <ul className="un-lst">
            {informes.map((a) => (
              <li key={a.id}><Link to={`/admin/udrive/documento/${a.id}`}><span>{a.nombre} <span className="un-chip">Borrador</span></span><small>Cambió {haceCuanto(a.updated_at)}</small></Link></li>
            ))}
          </ul>
        ) : <div className="un-vacio un-vacio--chico"><strong>Sin informes en construcción</strong><span>Los informes en borrador que se armen en esta unidad se listan aquí.</span></div>}
      </section>
    ),
    miembros: () => (
      <section className="un-blk" aria-labelledby="un-b-miembros">
        <h2 id="un-b-miembros">{SECCIONES.miembros}<button type="button" className="un-btn un-btn--texto" onClick={() => ir("personas")}>{admin ? "Gestionar" : "Ver todas"}</button></h2>
        <div className="un-avs" aria-hidden="true">
          {miembros.slice(0, 7).map((m) => <Avatar key={m.usuario_id} nombre={m.nombre} correo={m.correo} clave={m.usuario_id} />)}
          {miembros.length > 7 ? <span className="un-av" style={{ background: "#4a5a70" }}>+{miembros.length - 7}</span> : null}
        </div>
        <p className="un-roles">{porRol.length ? porRol.map(([r, n]) => <span key={r}><b>{n}</b> {NOMBRE_ROL[r].toLowerCase()}</span>) : `${u.n_miembros} personas`}</p>
      </section>
    ),
    actividad: () => (
      <section className="un-blk" aria-labelledby="un-b-actividad">
        <h2 id="un-b-actividad">{SECCIONES.actividad}</h2>
        {(eventosQ.data ?? []).length ? (
          <ul className="un-lst">
            {(eventosQ.data ?? []).map((e) => <li key={e.id}><span>{e.actor_nombre ?? "Alguien"}: {textoAccion(e.accion).toLowerCase()}</span><small>{haceCuanto(e.cuando)}{e.como === "admin_general" ? " · administración general" : ""}</small></li>)}
          </ul>
        ) : <div className="un-vacio un-vacio--chico"><strong>Sin movimiento todavía</strong><span>Aquí verá quién cambia personas, papeles y la presentación de la unidad.</span></div>}
      </section>
    ),
  };

  return (
    <div className="un-unidad">
      <Portada a={aparienciaDe(u, url.data ?? null)} tam="pagina" como="h1" portadaRef={portada} />
      <div className="un-avisos un-avisos--pagina">
        <p className="un-chip-fila">
          <span className={`un-chip${u.es_miembro ? "" : " un-chip--nav"}`}>{u.es_miembro ? `Su papel: ${NOMBRE_ROL[u.mi_rol]}` : "Administración general, sin ser miembro"}</span>
          {u.archivada_en ? <span className="un-chip un-chip--aviso">Archivada</span> : null}
        </p>
        {!u.es_miembro ? <p className="un-nota un-nota--info">Entró sin ser miembro. Su ingreso quedó en el registro de la unidad y todo lo que cambie también quedará.</p> : null}
        {u.sin_admin && !u.archivada_en ? <p className="un-nota un-nota--aviso">Esta unidad no tiene quien la administre ahora. {u.es_miembro ? "" : "La atiende la administración general: "}<button type="button" className="un-btn un-btn--texto" onClick={() => ir("personas")}>Asignar a alguien</button></p> : null}
        {u.archivada_en ? <p className="un-nota un-nota--aviso">La unidad está archivada: se puede abrir y descargar, pero nadie la cambia hasta que se restaure.{admin ? " Se restaura en Personas." : ""}</p> : null}
        {admin && nivel !== "bien" && !u.archivada_en ? <p className={`un-nota un-nota--${nivel === "lleno" ? "error" : "aviso"}`}>{nivel === "lleno" ? "La unidad llegó al 100 % de su espacio: no se pueden subir más archivos." : "La unidad pasó el 80 % de su espacio."} <button type="button" className="un-btn un-btn--texto" onClick={() => ir("espacio")}>Ver el espacio</button></p> : null}
        {admin && u.vencen_pronto > 0 ? <p className="un-nota un-nota--aviso">{u.vencen_pronto === 1 ? "Un acceso vence" : `${u.vencen_pronto} accesos vencen`} en los próximos 14 días. <button type="button" className="un-btn un-btn--texto" onClick={() => ir("personas")}>Revisar o renovar</button></p> : null}
        {nivel !== "bien" && !admin ? <p className={`un-nota un-nota--${nivel === "lleno" ? "error" : "aviso"}`}>{nivel === "lleno" ? "La unidad llegó al límite de su espacio. Avise a quien la administra." : "La unidad está cerca del límite de su espacio."}</p> : null}
      </div>
      <div className="un-bloques" ref={bloques} style={{ "--ac": u.acento } as CSSProperties}>
        {u.orden_secciones.map((k) => <div key={k} className={`un-blkc${k === "carpetas" || k === "informes" ? " un-blkc--ancho" : ""}`}>{B[k]()}</div>)}
      </div>
      <p className="un-ayuda un-pie">Espacio usado: {textoBytes(u.uso_bytes)} de {textoBytes(u.cuota_bytes)} · {profile?.full_name ? `Sesión de ${profile.full_name}` : ""}</p>
      <div className="un-uso" aria-hidden="true"><i style={{ width: `${fraccionCuota(u.uso_bytes, u.cuota_bytes) * 100}%` }} ref={(el) => { if (el && !el.dataset.v) { el.dataset.v = "1"; llenarBarra(el); } }} /></div>
    </div>
  );
}


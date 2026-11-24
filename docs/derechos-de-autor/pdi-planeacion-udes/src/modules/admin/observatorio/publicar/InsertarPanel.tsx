/* =============================================================================
   Observatorio · panel «Insertar y publicar» (O2).

   Registro de todo lo que otras páginas muestran desde el Observatorio
   (búsqueda, estados, vistas de 30 días, dominios, alertas cuando el contenido
   se despublica), administración de dominios autorizados y el editor «Insertar
   en otra página». La base hace cumplir permisos y reglas (0231–0234).

   Ruta: /admin/observatorio/insertar[/<enlace del observatorio>]?nuevo=portada|tema&tema=<slug>
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { Icon } from "../../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../../components/ui/QueryState";
import { useAuth } from "../../../../lib/auth";
import { useProfiles } from "../../../tableros/store";
import { useObsState } from "../store";
import { FaltaMigracion, useDecidirDominio, useDominios, useDuplicarInsertado, useEstadoInsertado, useInsertados, useMetricas, useObservatorios, useProponerDominio, useRetirarDominio, useTemas } from "./api";
import type { Dominio, Insertado, Observatorio } from "./api";
import { EditorInsertado } from "./EditorInsertado";
import { generarCodigo } from "./opciones";
import type { TipoInsertado } from "./opciones";
import { usePermisosObservatorio } from "./permisos";
import { ETIQUETA_FILA, ETIQUETA_TIPO, contenidoPublicado, estadoFila, hostPermitido, resumenMetricas } from "./registro";
import type { EstadoFila } from "./registro";
import { BotonCopiar, Chip, Confirmar, EstadoMigracion, Ico, MenuAcciones, Vacio, fechaCorta, reducido, useAvisos, useCascada } from "./ui";
import "./obsx.css";

const TONO: Record<EstadoFila, "ok" | "warn" | "bad" | undefined> = { activo: "ok", pausado: undefined, revocado: "bad", vencido: "warn", sindatos: "warn" };

function Mini({ serie }: { serie: number[] }) {
  const max = Math.max(...serie, 1);
  const pts = serie.map((v, i) => `${((i / (serie.length - 1)) * 70 + 1).toFixed(1)},${(24 - (v / max) * 22).toFixed(1)}`).join(" ");
  return (
    <svg className="obsx-mini" viewBox="0 0 72 26" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <polyline points={pts} />
    </svg>
  );
}

export function InsertarPanel() {
  const { topic: enlace } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const permisos = usePermisosObservatorio();
  const lista = useObservatorios();
  const { decir, nodo } = useAvisos();
  const visibles = useMemo(() => (lista.data ?? []).filter((o) => permisos.tiene("obs_insertar", o.id)), [lista.data, permisos]);
  const obs = visibles.find((o) => o.slug === enlace) ?? visibles.find((o) => o.principal) ?? visibles[0];

  if (lista.isPending) return <LoadingBlock rows={4} label="Cargando los observatorios" />;
  if (lista.isError) return lista.error instanceof FaltaMigracion ? <EstadoMigracion error={lista.error} /> : <ErrorBlock error={lista.error} onRetry={() => void lista.refetch()} />;
  if (!obs) return <Vacio titulo="No hay observatorios a tu alcance">Tu rol llega a los observatorios donde figures como persona responsable. Pide a quien administra que te asigne.</Vacio>;

  return (
    <div className="obsx">
      <div className="obsx-cabeza">
        <label className="admin-field obsx-selector">
          <span>Observatorio</span>
          <select value={obs.slug} onChange={(e) => navigate(`/admin/observatorio/insertar/${e.target.value}`)}>
            {visibles.map((o) => <option key={o.id} value={o.slug}>{o.nombre}{o.estado !== "publicado" ? ` (${o.estado})` : ""}</option>)}
          </select>
        </label>
        <p className="obsx-regla-corta"><Icon name="shield" size={16} /> Solo se sirven datos publicados y agregados; los grupos de menos de 5 salen como «&lt; 5».</p>
      </div>
      <Contenido key={obs.id} obs={obs} decir={decir} nuevo={params.get("nuevo") as TipoInsertado | null} temaInicial={params.get("tema") ?? undefined} limpiar={() => setParams({}, { replace: true })} />
      {nodo}
    </div>
  );
}

function Contenido({ obs, decir, nuevo, temaInicial, limpiar }: { obs: Observatorio; decir: (t: string, mala?: boolean) => void; nuevo: TipoInsertado | null; temaInicial?: string; limpiar: () => void }) {
  const permisos = usePermisosObservatorio();
  const { profile } = useAuth();
  const insertados = useInsertados(obs.id);
  const metricas = useMetricas(obs.id, 30);
  const dominios = useDominios(obs.id);
  const temas = useTemas(obs.id);
  const estado = useObsState();
  const perfiles = useProfiles();
  const [vista, setVista] = useState<"registro" | "dominios">("registro");
  const [editor, setEditor] = useState<{ ins: Insertado | null; tipo?: TipoInsertado; tema?: string } | null>(nuevo === "portada" || nuevo === "tema" ? { ins: null, tipo: nuevo, tema: temaInicial } : null);
  const [resaltado, setResaltado] = useState<string | null>(null);
  const editar = permisos.puede("obs_insertar", obs.id, "editar");
  const admin = permisos.puede("obs_insertar", obs.id, "administrar");

  useEffect(() => { if (nuevo) limpiar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al llegar

  const vistas = estado.data?.mode === "base" ? estado.data.views : undefined;
  const filas = useMemo(
    () =>
      (insertados.data ?? []).map((ins) => {
        const pub = contenidoPublicado(ins, obs, temas.data ?? [], vistas);
        const m = resumenMetricas(metricas.data ?? [], ins.id);
        return { ins, pub, estado: estadoFila(ins, pub), ...m };
      }),
    [insertados.data, obs, temas.data, vistas, metricas.data],
  );
  const alertas = filas.filter((f) => f.estado === "sindatos");

  if (insertados.isPending || temas.isPending) return <LoadingBlock rows={4} label="Cargando los insertados" />;
  if (insertados.isError) return <EstadoMigracion error={insertados.error} />;
  if (temas.isError) return <EstadoMigracion error={temas.error} />;

  const abrirEditor = (ins: Insertado | null) => setEditor({ ins });
  const aprobados = (dominios.data ?? []).filter((d) => d.estado === "propuesto").length;

  return (
    <>
      <div className="obsx-cabeza">
        <div className="obsx-pestanas" role="tablist" aria-label="Insertar y publicar">
          <button type="button" role="tab" aria-selected={vista === "registro"} onClick={() => setVista("registro")}>Registro ({filas.length})</button>
          <button type="button" role="tab" aria-selected={vista === "dominios"} onClick={() => setVista("dominios")}>Dominios{aprobados > 0 && admin ? ` · ${aprobados} por decidir` : ""}</button>
        </div>
        {editar && (
          <button type="button" className="button-primary" onClick={() => abrirEditor(null)}>
            <Icon name="code" size={16} /> Insertar en otra página
          </button>
        )}
      </div>

      {alertas.length > 0 && (
        <div className="obsx-alertas" role="region" aria-label="Alertas">
          <h3><Icon name="alert" size={18} /> {alertas.length} insertado{alertas.length > 1 ? "s apuntan" : " apunta"} a contenido que ya no está publicado</h3>
          <ul>
            {alertas.map((f) => (
              <li key={f.ins.id}>
                <span><b>{f.ins.nombre}</b> · {f.pub.why}. Quien lo ve hoy encuentra un aviso.</span>
                <Link className="button-secondary obsx-pequeno" to={`/admin/observatorio/observatorios/${obs.slug}`}>Ir al contenido</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {vista === "registro" ? (
        <Registro obs={obs} filas={filas} dominios={dominios.data ?? []} temas={temas.data ?? []} editar={editar} admin={admin} yo={profile?.id} resaltado={resaltado} decir={decir} abrir={abrirEditor} cargandoMetricas={metricas.isPending} />
      ) : (
        <PanelDominios obs={obs} dominios={dominios} editar={editar} admin={admin} decir={decir} nombres={new Map((perfiles.data ?? []).map((p) => [p.id, p.name]))} />
      )}

      <ComoFunciona />

      {editor && (
        <EditorInsertado
          obs={obs} temas={temas.data ?? []} vistas={estado.data?.mode === "base" ? estado.data.views : []} dominios={dominios.data ?? []} editar={editor.ins} inicial={{ tipo: editor.tipo, tema: editor.tema }} puedeAprobar={admin} decir={decir}
          onCerrar={() => setEditor(null)} onGuardado={(i) => { setResaltado(i.id); window.setTimeout(() => setResaltado(null), 3200); }}
          irADominios={() => { setEditor(null); setVista("dominios"); }}
        />
      )}
    </>
  );
}

/* --- Registro ------------------------------------------------------------------------- */

interface Fila { ins: Insertado; pub: { ok: boolean; why: string }; estado: EstadoFila; serie: number[]; total: number; dominios: string[] }

function Registro({ obs, filas, dominios, temas, editar, admin, yo, resaltado, decir, abrir, cargandoMetricas }: { obs: Observatorio; filas: Fila[]; dominios: Dominio[]; temas: { slug: string; nombre: string | null }[]; editar: boolean; admin: boolean; yo?: string; resaltado: string | null; decir: (t: string, mala?: boolean) => void; abrir: (i: Insertado) => void; cargandoMetricas: boolean }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<EstadoFila | "todos">("todos");
  const [revocando, setRevocando] = useState<string | null>(null);
  const [confirmarPausa, setConfirmarPausa] = useState<Fila | null>(null);
  const estadoMut = useEstadoInsertado();
  const duplicar = useDuplicarInsertado();
  const tabla = useRef<HTMLDivElement>(null);
  const titulo = (i: Insertado) => {
    const t = temas.find((x) => x.slug === i.tema_slug)?.nombre ?? i.tema_slug;
    return `${ETIQUETA_TIPO[i.tipo]}${t && i.tipo !== "portada" ? ` · ${t}` : ""}${i.tipo === "seccion" && i.seccion ? ` · ${i.seccion}` : ""}`;
  };
  const lista = filas.filter((f) => {
    if (filtro !== "todos" && f.estado !== filtro) return false;
    if (!q.trim()) return true;
    return `${f.ins.nombre} ${titulo(f.ins)} ${f.dominios.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase());
  });
  useCascada(tabla, "[data-in]", `${filtro}:${filas.length}`);
  useEffect(() => {
    if (resaltado) tabla.current?.querySelector(`[data-id="${resaltado}"]`)?.scrollIntoView({ block: "center", behavior: reducido() ? "auto" : "smooth" });
  }, [resaltado]);

  const cambiar = async (f: Fila, e: "activo" | "pausado" | "revocado") => {
    try {
      await estadoMut.mutateAsync({ p_id: f.ins.id, p_estado: e });
      decir(e === "pausado" ? "Pausado: quien lo vea encontrará un aviso" : e === "activo" ? "Insertado reanudado" : "Revocado: el código dejó de mostrar datos");
    } catch (err) {
      decir(err instanceof Error ? err.message : "No se pudo cambiar el estado", true);
    }
    setRevocando(null);
  };
  const copiarCodigo = (i: Insertado) =>
    generarCodigo(window.location.origin, { codigo: i.codigo, tipo: i.tipo, temaSlug: i.tema_slug, seccion: i.seccion, visorId: i.visor_id, opciones: i.opciones }, "script");

  return (
    <>
      <div className="obsx-filtros-barra">
        <label className="obsx-busca">
          <Icon name="search" size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, contenido o dominio" aria-label="Buscar insertados" />
        </label>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as EstadoFila | "todos")} aria-label="Filtrar por estado">
          <option value="todos">Todos los estados</option>
          {(Object.keys(ETIQUETA_FILA) as EstadoFila[]).map((k) => <option key={k} value={k}>{ETIQUETA_FILA[k]}</option>)}
        </select>
      </div>
      <div className="obsx-registro" ref={tabla}>
        <div className="obsx-registro__cab" aria-hidden="true"><span>Contenido</span><span>Dominios donde se ha visto</span><span>Vistas, 30 días</span><span>Estado</span><span /></div>
        {lista.length === 0 && (
          <Vacio titulo={filas.length === 0 ? "Aún no hay insertados" : "Nada coincide"}>
            {filas.length === 0 ? "Crea el primero con «Insertar en otra página», o desde un tema en Observatorios." : "Cambia la búsqueda o el estado."}
          </Vacio>
        )}
        {lista.map((f) => {
          const i = f.ins;
          const vence = i.vence_en ? fechaCorta(i.vence_en) : "";
          const puedeRevocar = admin || (i.creado_por === yo && editar);
          return (
            <div key={i.id} className="obsx-fila" data-id={i.id} data-in data-resaltado={resaltado === i.id || undefined}>
              <div className="obsx-fila__nombre" data-etiqueta="Contenido">
                <b>{i.nombre}</b>
                <span>{titulo(i)} · {obs.nombre}</span>
                <span>v{i.version} · {i.con_clave ? "con clave · " : ""}{vence ? `vence ${vence} · ` : ""}creado {fechaCorta(i.created_at)}</span>
              </div>
              <div className="obsx-fila__dominios" data-etiqueta="Dominios">
                {f.dominios.length === 0 ? <span className="obsx-ayuda">{cargandoMetricas ? "Cargando…" : "Aún sin vistas"}</span> : f.dominios.map((d) => {
                  const ok = hostPermitido(d, dominios);
                  return <span key={d} data-bloqueado={!ok || undefined}>{!ok && <Icon name="lock" size={12} />}{d}{!ok && " · bloqueado"}</span>;
                })}
              </div>
              <div className="obsx-fila__vistas" data-etiqueta="Vistas, 30 días"><Mini serie={f.serie} /><b>{f.total.toLocaleString("es-CO")}</b></div>
              <div data-etiqueta="Estado">
                <Chip tono={TONO[f.estado]} icono={<Icon name={f.estado === "activo" ? "check" : f.estado === "revocado" ? "close" : f.estado === "pausado" ? "clock" : "alert"} size={13} />}>{ETIQUETA_FILA[f.estado]}</Chip>
                <span className="obsx-ayuda">{f.estado === "sindatos" ? f.pub.why : `Actualizado ${fechaCorta(i.updated_at)}`}</span>
              </div>
              <div className="obsx-fila__acc">
                <BotonCopiar soloIcono texto={() => copiarCodigo(i)} onResultado={(ok) => decir(ok ? (i.con_clave ? "Código copiado. Tiene clave: añade data-clave con la que definiste." : "Código copiado") : "No se pudo copiar: selecciónalo en el editor", !ok)} />
                {editar && f.estado !== "revocado" && <button type="button" className="icon-button" onClick={() => abrir(i)} aria-label={`Editar las opciones de «${i.nombre}»`} title="Editar opciones"><Ico name="edit" /></button>}
                {editar && (
                  <MenuAcciones etiqueta={`Más acciones de «${i.nombre}»`} items={[
                    f.estado !== "revocado" && (i.estado === "pausado" ? { texto: "Reanudar", hecho: () => void cambiar(f, "activo") } : { texto: "Pausar", icono: "pause", hecho: () => setConfirmarPausa(f) }),
                    { texto: "Duplicar", icono: "duplicate", hecho: () => void duplicar.mutateAsync({ p_id: i.id }).then(() => decir("Duplicado (sin la clave: define otra)"), (e) => decir(e instanceof Error ? e.message : "No se pudo duplicar", true)) },
                    f.estado !== "revocado" && puedeRevocar && "-",
                    f.estado !== "revocado" && puedeRevocar && { texto: "Revocar", icono: "x", peligro: true, hecho: () => setRevocando(i.id) },
                  ]} />
                )}
              </div>
              {revocando === i.id && <ConfirmaFila nombre={i.nombre} ocupado={estadoMut.isPending} onSi={() => void cambiar(f, "revocado")} onNo={() => setRevocando(null)} />}
            </div>
          );
        })}
      </div>
      {confirmarPausa && <Confirmar titulo="Pausar insertado" texto={`«${confirmarPausa.ins.nombre}» dejará de mostrar datos y quien lo vea encontrará un aviso, hasta que lo reanudes.`} accion="Pausar" onSi={() => void cambiar(confirmarPausa, "pausado")} onNo={() => setConfirmarPausa(null)} />}
    </>
  );
}

/** Confirmación dentro de la fila: nace desde arriba, 180 ms, y toma el foco en «Cancelar». */
function ConfirmaFila({ nombre, ocupado, onSi, onNo }: { nombre: string; ocupado: boolean; onSi: () => void; onNo: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const no = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const ctx = gsap.context(() => { gsap.from(ref.current, reducido() ? { opacity: 0, duration: 0.1 } : { opacity: 0, y: -4, duration: 0.18, ease: "power3.out" }); }, ref);
    no.current?.focus();
    return () => ctx.revert();
  }, []);
  return (
    <div ref={ref} className="obsx-confirma" role="alertdialog" aria-label={`Revocar ${nombre}`} onKeyDown={(e) => { if (e.key === "Escape") onNo(); }}>
      <span>¿Revocar «{nombre}»? Las páginas que lo usan mostrarán un aviso y no se puede deshacer; para volver, se duplica.</span>
      <button type="button" className="button-primary obsx-peligro obsx-pequeno" disabled={ocupado} onClick={onSi}>Revocar</button>
      <button type="button" ref={no} className="button-secondary obsx-pequeno" onClick={onNo}>Cancelar</button>
    </div>
  );
}

/* --- Dominios ------------------------------------------------------------------------- */

function PanelDominios({ obs, dominios, editar, admin, decir, nombres }: { obs: Observatorio; dominios: ReturnType<typeof useDominios>; editar: boolean; admin: boolean; decir: (t: string, mala?: boolean) => void; nombres: Map<string, string> }) {
  const proponer = useProponerDominio();
  const decidir = useDecidirDominio();
  const retirar = useRetirarDominio();
  const [nuevo, setNuevo] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const lista = dominios.data ?? [];
  const ref = useRef<HTMLDivElement>(null);
  useCascada(ref, "[data-in]", lista.length);
  if (dominios.isPending) return <LoadingBlock rows={3} label="Cargando dominios" />;
  if (dominios.isError) return <EstadoMigracion error={dominios.error} />;
  const intenta = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); decir(ok); } catch (e) { decir(e instanceof Error ? e.message : "No se pudo completar", true); }
  };
  const orden = { propuesto: 0, aprobado: 1, rechazado: 2 } as const;
  return (
    <div className="obsx-panel" ref={ref}>
      <p className="obsx-ayuda" data-in>Un insertado solo se muestra en páginas de {obs.nombre} cuyo dominio esté autorizado. Los dominios <b>*.udes.edu.co</b> lo están siempre. {admin ? "Tú apruebas o rechazas los externos." : editar ? "Puedes proponer dominios; los aprueba quien administra." : "Solo lectura."}</p>
      {editar && (
        <form className="obsx-agregar" data-in onSubmit={(e) => { e.preventDefault(); setError(""); void proponer.mutateAsync({ p_obs: obs.id, p_host: nuevo, p_nota: nota }).then((r) => { setNuevo(""); setNota(""); decir(r.estado === "aprobado" ? `«${r.host}» ya está autorizado` : `«${r.host}» quedó propuesto`); }, (err) => setError(err instanceof Error ? err.message : "No se pudo proponer")); }}>
          <label className="admin-field"><span>Dominio</span><input type="text" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="www.ejemplo.edu.co o *.ejemplo.edu.co" required /></label>
          <label className="admin-field"><span>Nota (para quien decide)</span><input type="text" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} placeholder="Para qué página" /></label>
          <button type="submit" className="button-primary" disabled={proponer.isPending}>Proponer</button>
        </form>
      )}
      {error && <p className="obsx-error" role="alert">{error}</p>}
      {lista.length === 0 ? <Vacio titulo="Aún no hay dominios externos">Los de udes.edu.co funcionan sin pedir nada.</Vacio> : (
        <table className="obsx-tabla" data-in>
          <thead><tr><th>Dominio</th><th>Estado</th><th>Propuesto</th><th>Nota</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {[...lista].sort((a, b) => orden[a.estado] - orden[b.estado] || a.host.localeCompare(b.host)).map((d) => (
              <tr key={d.id}>
                <td data-etiqueta="Dominio"><code>{d.host}</code></td>
                <td data-etiqueta="Estado"><Chip tono={d.estado === "aprobado" ? "ok" : d.estado === "rechazado" ? "bad" : "warn"}>{d.automatico ? "Automático" : d.estado === "propuesto" ? "Por decidir" : d.estado === "aprobado" ? "Aprobado" : "Rechazado"}</Chip></td>
                <td data-etiqueta="Propuesto">{d.propuesto_por ? nombres.get(d.propuesto_por) ?? "—" : "—"} · {fechaCorta(d.propuesto_en)}</td>
                <td data-etiqueta="Nota">{d.nota || "—"}</td>
                <td className="obsx-fila__acc">
                  {admin && d.estado === "propuesto" && <><button type="button" className="button-primary obsx-pequeno" onClick={() => void intenta(() => decidir.mutateAsync({ p_id: d.id, p_aprobar: true }), `«${d.host}» aprobado`)}>Aprobar</button><button type="button" className="button-secondary obsx-pequeno" onClick={() => void intenta(() => decidir.mutateAsync({ p_id: d.id, p_aprobar: false }), `«${d.host}» rechazado`)}>Rechazar</button></>}
                  {admin && d.estado !== "propuesto" && !d.automatico && <button type="button" className="button-secondary obsx-pequeno" onClick={() => void intenta(() => retirar.mutateAsync({ p_id: d.id }), `«${d.host}» retirado`)}>Retirar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* --- Cómo funciona (con sus límites) ---------------------------------------------------- */

function ComoFunciona() {
  return (
    <details className="obsx-como">
      <summary>Cómo funciona y qué no puede garantizar</summary>
      <ul>
        <li><b>Solo lo publicado y agregado.</b> El insertado muestra temas, tablas y visores ya públicos, con la reserva «&lt; 5» aplicada en la base y sin columnas de datos personales. No hay camino a borradores ni a filas individuales: es la protección que cuenta.</li>
        <li><b>Dominios.</b> El marco averigua qué página lo aloja y la base lo compara con la lista autorizada. Un sitio mal intencionado puede fabricar la petición declarando un dominio permitido: es una barrera contra el uso casual y la base de las métricas, no un control de acceso.</li>
        <li><b>La clave no es un secreto.</b> Viaja dentro del código pegado; quien lo copie la tiene.</li>
        <li><b>Un sitio puede ignorar la política de marcos</b> o copiar lo que el marco muestra. Por eso solo se insertan datos que ya son públicos.</li>
        <li><b>Caché de una hora</b> en la sesión del visitante: lo que despublicas deja de verse al recargar, y quien ya lo tiene abierto lo ve hasta una hora. Revocar o pausar avisa de inmediato al siguiente intento.</li>
        <li><b>Límite de 600 lecturas por minuto</b> por insertado; si se agota, muestra «demasiadas consultas» un minuto. Las métricas cuentan vistas por insertado, dominio y día, sin cookies ni direcciones IP.</li>
      </ul>
    </details>
  );
}

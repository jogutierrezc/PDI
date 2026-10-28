/* =============================================================================
   Intranet · Pilo At Work (solo administración).

   La configuración del espacio de trabajo /work vive aquí, junto a Mr. Pilo, y no dentro de
   /work. Una fila de pw_config (migración 0247) con valores por defecto: si la fila o la
   tabla no existen, esta pantalla lo dice y las funciones usan esos mismos valores.

     1. Modelos de IA   Mistral primero, NVIDIA por capacidad o si Mistral no responde a tiempo.
                        Las claves son las de Mr. Pilo (aquí solo se ve si existen).
     2. Límites de uso  mensajes por hora y persona, tope de subida de archivos, retención de la bitácora.
     3. Funciones       interruptores globales; apagada = /work la oculta y el servidor la rechaza.
     4. Microsoft 365   qué variables están definidas (solo sí/no), alcances por módulo, personas conectadas.
     5. Uso             solo conteos, sin contenidos (pw_bitacora).

   Cada cambio se guarda solo, con pausa, y queda en la bitácora (quién y qué campos; nunca valores).
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { supabase } from "../../../lib/supabase";
import { callFn } from "../../pilo-work/api";
import { Group, NumField, StatusMark, Switch } from "../pilo/ui";
import "../pilo/pilo-settings.css";
import "./pilo-work-admin.css";

const SHELL = {
  section: "pilo_work" as const,
  kicker: "Sistema",
  title: "Pilo At Work",
  description: "El espacio de trabajo de las oficinas (/work): modelos de IA, límites, funciones habilitadas, Microsoft 365 y uso. Las claves son las de Mr. Pilo.",
};

interface Cfg {
  rapido_proveedor: string;
  rapido_modelo: string;
  capacidad_proveedor: string;
  capacidad_modelo: string;
  primer_fragmento_s: number;
  umbral_capacidad: number;
  max_tokens: number;
  max_pasos: number;
  limite_hora: number;
  subida_max_mb: number;
  retencion_dias: number;
  funciones: Record<string, boolean>;
}
const PARTIDA: Cfg = {
  rapido_proveedor: "",
  rapido_modelo: "",
  capacidad_proveedor: "",
  capacidad_modelo: "",
  primer_fragmento_s: 7,
  umbral_capacidad: 12000,
  max_tokens: 1500,
  max_pasos: 5,
  limite_hora: 60,
  subida_max_mb: 100,
  retencion_dias: 180,
  funciones: { chat: true, cowork: true, datos: true, correo: true, agenda: true, archivos: true, equipos: true, perfil: true },
};
const FUNCIONES: [string, string, string][] = [
  ["chat", "Chat", "La conversación con Pilo."],
  ["cowork", "Cowork", "Documentos, código y revisión."],
  ["datos", "Datos en este equipo", "Excel y CSV que se leen en el navegador."],
  ["correo", "Correo", "Lector de Outlook y resúmenes."],
  ["agenda", "Agenda", "Calendario, Teams y avisos."],
  ["archivos", "Archivos (OneDrive y SharePoint)", "Explorar, abrir en Cowork y guardar."],
  ["equipos", "Pilo for Teams", "Equipos con memoria compartida."],
  ["perfil", "Perfil", "«Mi perfil» y su uso en las respuestas."],
];
const PROVEEDORES = [
  ["", "Automático (el de Mr. Pilo)"],
  ["mistral", "Mistral"],
  ["nvidia", "NVIDIA"],
] as const;

interface Ruteo {
  rapido: { proveedor: string; modelo: string }[];
  capacidad: { proveedor: string; modelo: string }[];
  clave_mistral: boolean;
  clave_nvidia: boolean;
}
interface Prueba {
  nivel: string;
  proveedor: string;
  modelo: string;
  ok: boolean;
  ms: number;
  error: string;
}
interface MsConf {
  variables: Record<string, boolean>;
  configurado: boolean;
  modulos: { id: string; nombre: string; alcances: string }[];
  conectados: number;
}
interface Uso {
  personas_por_rol: Record<string, number>;
  mensajes_hoy: number;
  mensajes_7d: number;
  por_modelo_7d: { proveedor: string; modelo: string; nivel: string; n: number }[];
  conmutaciones_7d: number;
  errores_7d: number;
  errores_recientes: { cuando: string; accion: string; error: string }[];
  ms_conectados: number;
  ms_correo: number;
  ms_agenda: number;
  ms_archivos: number;
}
const ROLES: Record<string, string> = { colaborador: "Colaborador", colaborador_correo: "Colaborador con correo", coordinacion: "Coordinación", admin: "Administración" };
const nombreProv = (p: string) => (p === "nvidia" ? "NVIDIA" : p === "mistral" ? "Mistral" : p);

export function PiloWorkSettings() {
  const [cfg, setCfg] = useState<Cfg>(PARTIDA);
  const [falta, setFalta] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState<"" | "guardando" | "guardado" | "error">("");
  const [ruteo, setRuteo] = useState<Ruteo | null>(null);
  const [errRuteo, setErrRuteo] = useState("");
  const [pruebas, setPruebas] = useState<Prueba[] | null>(null);
  const [probando, setProbando] = useState(false);
  const [ms, setMs] = useState<MsConf | null>(null);
  const [errMs, setErrMs] = useState("");
  const [uso, setUso] = useState<Uso | null>(null);
  const pend = useRef<Partial<Cfg>>({});
  const timer = useRef<number>();

  useEffect(() => {
    void supabase
      .from("pw_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) setFalta(true);
        else setCfg({ ...PARTIDA, ...(data as Partial<Cfg>), funciones: { ...PARTIDA.funciones, ...((data as Cfg).funciones ?? {}) } });
        setCargando(false);
      });
    void supabase.rpc("pw_uso_ia_admin").then(({ data }) => setUso((data as Uso | null) ?? null));
    callFn<MsConf>("pw-microsoft", { action: "configuracion" }).then(setMs).catch((e) => setErrMs(e instanceof Error ? e.message : "No se pudo consultar."));
  }, []);

  const verRuteo = useCallback(() => {
    callFn<Ruteo>("pilo-work", { action: "ruteo" }).then((r) => { setRuteo(r); setErrRuteo(""); }).catch((e) => setErrRuteo(e instanceof Error ? e.message : "No se pudo consultar."));
  }, []);
  useEffect(() => {
    verRuteo();
  }, [verRuteo, estado === "guardado"]);

  /** Guarda con pausa (varias teclas = una sola escritura). */
  const guardar = (patch: Partial<Cfg>) => {
    if (falta) return;
    setCfg((c) => ({ ...c, ...patch }));
    pend.current = { ...pend.current, ...patch };
    setEstado("guardando");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const p = pend.current;
      pend.current = {};
      const { error } = await supabase.from("pw_config").update(p).eq("id", 1);
      setEstado(error ? "error" : "guardado");
    }, 600);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const probar = async () => {
    setProbando(true);
    setPruebas(null);
    try {
      setPruebas((await callFn<{ resultados: Prueba[] }>("pilo-work", { action: "probar_modelos" }, { timeoutMs: 90_000 })).resultados);
    } catch (e) {
      setErrRuteo(e instanceof Error ? e.message : "No se pudo probar.");
    }
    setProbando(false);
  };

  const off = falta || cargando;
  const selector = (nivel: "rapido" | "capacidad") => {
    const prov = cfg[`${nivel}_proveedor` as const];
    const mod = cfg[`${nivel}_modelo` as const];
    return (
      <div className="pis-grid pwa-2">
        <label>
          Proveedor del nivel {nivel === "rapido" ? "rápido" : "de capacidad"}
          <select value={prov} disabled={off} onChange={(e) => guardar({ [`${nivel}_proveedor`]: e.target.value } as Partial<Cfg>)}>
            {PROVEEDORES.map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Modelo
          <input value={mod} disabled={off} maxLength={120} placeholder="Automático" onChange={(e) => guardar({ [`${nivel}_modelo`]: e.target.value } as Partial<Cfg>)} />
          <small>Vacío = el modelo configurado en Mr. Pilo (o el preajuste del proveedor). Escriba el id exacto del catálogo vigente.</small>
        </label>
      </div>
    );
  };

  return (
    <AdminShell {...SHELL}>
      <div className="pis pwa">
        {falta && !cargando && (
          <p className="pis-warn" role="status">
            <strong>Falta aplicar la migración 0247</strong> en la base. Hasta entonces esta pantalla muestra los valores de partida y no guarda; /work y sus funciones usan esos mismos valores.
          </p>
        )}
        <div className="pis-sheet">
          <Group title="Modelos de IA" aside={<small>Mistral primero · NVIDIA por capacidad · prioridad a la velocidad</small>}>
            <p className="pwa-nota">
              El chat y las tareas cortas usan el nivel <b>rápido</b> (Mistral, siempre en streaming). Pasan al nivel de <b>capacidad</b> (NVIDIA) los documentos muy largos, el código, el análisis de varios documentos, la revisión normativa
              profunda y lo que Mistral no logró resolver. Si Mistral no empieza a responder a tiempo, se reintenta con NVIDIA. Las claves se comparten con Mr. Pilo y se gestionan allí.
            </p>
            <div className="pwa-claves">
              <span>Clave de Mistral: {ruteo ? <StatusMark tone={ruteo.clave_mistral ? "ok" : "warn"}>{ruteo.clave_mistral ? "sí" : "no"}</StatusMark> : <StatusMark tone="off">sin consultar</StatusMark>}</span>
              <span>Clave de NVIDIA: {ruteo ? <StatusMark tone={ruteo.clave_nvidia ? "ok" : "warn"}>{ruteo.clave_nvidia ? "sí" : "no"}</StatusMark> : <StatusMark tone="off">sin consultar</StatusMark>}</span>
              <Link className="button-secondary" to="/admin/mr-pilo?seccion=conexion">Cambiar claves en Mr. Pilo</Link>
            </div>
            {errRuteo && <p className="pis-error" role="alert">{errRuteo}</p>}
            {selector("rapido")}
            {selector("capacidad")}
            {ruteo && (
              <p className="pwa-efectivo">
                <b>Orden efectivo.</b> Rápido: {ruteo.rapido.map((d) => `${nombreProv(d.proveedor)} · ${d.modelo}`).join(" → ") || "sin proveedor"}. Capacidad: {ruteo.capacidad.map((d) => `${nombreProv(d.proveedor)} · ${d.modelo}`).join(" → ") || "sin proveedor"}.
              </p>
            )}
            <div className="pis-grid pis-grid--3 pwa-4">
              <NumField label="Espera al primer fragmento (s)" hint="Si el modelo rápido no empieza en este tiempo, se usa el de apoyo" value={cfg.primer_fragmento_s} min={2} max={30} whole def={7} disabled={off} onCommit={(v) => guardar({ primer_fragmento_s: v })} />
              <NumField label="Pasa a capacidad desde (caracteres)" hint="Contenido a resumir o revisar" value={cfg.umbral_capacidad} min={2000} max={60000} whole def={12000} disabled={off} onCommit={(v) => guardar({ umbral_capacidad: v })} />
              <NumField label="Tope de tokens por respuesta" value={cfg.max_tokens} min={300} max={4000} whole def={1500} disabled={off} onCommit={(v) => guardar({ max_tokens: v })} />
              <NumField label="Pasos de herramientas por turno" value={cfg.max_pasos} min={1} max={8} whole def={5} disabled={off} onCommit={(v) => guardar({ max_pasos: v })} />
            </div>
            <div className="pis-actions">
              <button type="button" className="button-secondary" onClick={() => void probar()} disabled={probando}>
                {probando ? "Probando…" : "Probar conexión"}
              </button>
              <small className="pwa-nota">Una llamada corta a cada nivel; mide la latencia y no guarda ningún contenido.</small>
            </div>
            {pruebas && (
              <table className="pwa-tabla">
                <thead>
                  <tr><th>Nivel</th><th>Modelo</th><th>Resultado</th><th>Latencia</th></tr>
                </thead>
                <tbody>
                  {pruebas.map((p, i) => (
                    <tr key={i}>
                      <td>{p.nivel === "rapido" ? "Rápido" : "Capacidad"}</td>
                      <td>{nombreProv(p.proveedor)} · {p.modelo}</td>
                      <td>{p.ok ? <StatusMark tone="ok">Responde</StatusMark> : <StatusMark tone="fail">{p.error || "Falló"}</StatusMark>}</td>
                      <td>{p.ms.toLocaleString("es-CO")} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Group>

          <Group title="Límites de uso">
            <div className="pis-grid pis-grid--3">
              <NumField label="Mensajes por hora y persona" value={cfg.limite_hora} min={5} max={500} whole def={60} disabled={off} onCommit={(v) => guardar({ limite_hora: v })} />
              <NumField label="Tamaño máximo de subida (MB)" hint="El tope duro del servidor es 100 MB" value={cfg.subida_max_mb} min={1} max={100} whole def={100} disabled={off} onCommit={(v) => guardar({ subida_max_mb: v })} />
              <NumField label="Retención de la bitácora (días)" hint="Se aplica con pw_purgar_bitacora() programada" value={cfg.retencion_dias} min={7} max={1095} whole def={180} disabled={off} onCommit={(v) => guardar({ retencion_dias: v })} />
            </div>
          </Group>

          <Group title="Funciones habilitadas" aside={<small>Apagada: /work la oculta y el servidor la rechaza con un mensaje claro</small>}>
            <ul className="pwa-funcs">
              {FUNCIONES.map(([id, nombre, desc]) => (
                <li key={id}>
                  <span>
                    <b>{nombre}</b>
                    <small>{desc}</small>
                  </span>
                  <Switch on={cfg.funciones[id] !== false} label={nombre} disabled={off} onChange={(v) => guardar({ funciones: { ...cfg.funciones, [id]: v } })} />
                </li>
              ))}
            </ul>
          </Group>

          <Group title="Microsoft 365" aside={<small>Solo lectura · lo responde la función pw-microsoft</small>}>
            {errMs && <p className="pis-error" role="alert">{errMs}</p>}
            {ms && (
              <>
                <p>
                  Configuración: <StatusMark tone={ms.configurado ? "ok" : "warn"}>{ms.configurado ? "completa" : "incompleta"}</StatusMark>
                </p>
                <ul className="pwa-vars">
                  {Object.entries(ms.variables).map(([k, v]) => (
                    <li key={k}>
                      <code>{k}</code> <StatusMark tone={v ? "ok" : "fail"}>{v ? "definida" : "falta"}</StatusMark>
                    </li>
                  ))}
                </ul>
                <table className="pwa-tabla">
                  <thead>
                    <tr><th>Módulo</th><th>Alcances que pide</th><th>Personas</th></tr>
                  </thead>
                  <tbody>
                    {ms.modulos.map((m) => (
                      <tr key={m.id}>
                        <td>{m.nombre}</td>
                        <td><code>{m.alcances}</code></td>
                        <td>{uso ? (m.id === "archivos" ? uso.ms_archivos : uso.ms_correo).toLocaleString("es-CO") : "—"}{m.id === "correo_agenda" && uso ? ` correo · ${uso.ms_agenda.toLocaleString("es-CO")} agenda` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="pwa-nota">
                  {ms.conectados.toLocaleString("es-CO")} persona{ms.conectados === 1 ? "" : "s"} con Microsoft conectado. Cada persona pulsa «Conectar» por módulo; los permisos se suman. La guía de TIC está en <code>docs/pilo-work/README.md</code> del repositorio.
                </p>
              </>
            )}
          </Group>

          <Group title="Uso" aside={<small>Solo conteos, sin contenidos</small>}>
            {!uso ? (
              <p className="pwa-nota">{falta ? "Disponible al aplicar la migración 0247." : "Leyendo el uso…"}</p>
            ) : (
              <>
                <dl className="pwa-cifras">
                  <div><dt>Mensajes hoy</dt><dd>{uso.mensajes_hoy.toLocaleString("es-CO")}</dd></div>
                  <div><dt>Mensajes en 7 días</dt><dd>{uso.mensajes_7d.toLocaleString("es-CO")}</dd></div>
                  <div><dt>Cambios a NVIDIA (7 días)</dt><dd>{uso.conmutaciones_7d.toLocaleString("es-CO")}</dd></div>
                  <div><dt>Errores (7 días)</dt><dd>{uso.errores_7d.toLocaleString("es-CO")}</dd></div>
                </dl>
                <h4 className="pwa-h">Personas con rol</h4>
                <ul className="pwa-vars">
                  {Object.entries(uso.personas_por_rol).map(([r, n]) => (
                    <li key={r}>{ROLES[r] ?? r}: <b>{n}</b></li>
                  ))}
                  {!Object.keys(uso.personas_por_rol).length && <li>Nadie tiene rol todavía.</li>}
                </ul>
                <h4 className="pwa-h">Respuestas por modelo (7 días)</h4>
                <table className="pwa-tabla">
                  <thead>
                    <tr><th>Modelo</th><th>Nivel</th><th>Respuestas</th></tr>
                  </thead>
                  <tbody>
                    {uso.por_modelo_7d.map((m, i) => (
                      <tr key={i}>
                        <td>{nombreProv(m.proveedor)} · {m.modelo}</td>
                        <td>{m.nivel === "capacidad" ? "Capacidad" : "Rápido"}</td>
                        <td>{m.n.toLocaleString("es-CO")}</td>
                      </tr>
                    ))}
                    {!uso.por_modelo_7d.length && (
                      <tr><td colSpan={3}>Aún no hay respuestas registradas con modelo.</td></tr>
                    )}
                  </tbody>
                </table>
                {uso.errores_recientes.length > 0 && (
                  <>
                    <h4 className="pwa-h">Errores recientes</h4>
                    <ul className="pwa-vars">
                      {uso.errores_recientes.map((e, i) => (
                        <li key={i}>
                          <time>{new Date(e.cuando).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time> · {e.accion} · {e.error}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </Group>
        </div>
        <p className="pwa-estado" role="status" aria-live="polite">
          {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : estado === "error" ? "No se pudo guardar. Revise su conexión e intente de nuevo." : ""}
        </p>
      </div>
    </AdminShell>
  );
}

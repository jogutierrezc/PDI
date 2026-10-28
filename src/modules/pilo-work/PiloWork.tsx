/* =============================================================================
   Pilo at Work · la PWA de escritorio (/work).

   Puerta (sesión + ROL) y espacio de trabajo. Sin rol no se entra: la puerta pregunta
   a pw_mi_rol() y las políticas RLS de las tablas pw_* repiten la regla en el servidor,
   así que ocultar un botón nunca es la única defensa. «Administración» (roles, memoria
   colectiva y arquitectura) se muestra solo a rol admin y sus rutas no abren para los demás.

   Movimiento (skills impeccable / emil / animate): entradas ≤ 300 ms con expo.out, la
   salida más corta que la entrada, solo transform y opacidad (más clip-path en la cortina
   de entrada, que nace de Pilo); prefers-reduced-motion deja el cambio sin animación; la
   paleta Ctrl K y lo que dispara el teclado no animan.
   ========================================================================== */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { supabase } from "../../lib/supabase";
import { movimientoReducido } from "../rankings/movimiento";
import { Acceso } from "./Acceso";
import { leerPerfil, miRol, ROL_ETIQUETA, SUPABASE_URL } from "./api";
import type { Perfil, Rol } from "./api";
import { registrarWorker } from "./push";
import { Cara, IC, iniciales, Logo, MOOD, useToastState, WorkProvider } from "./ui";
import type { Avisar, WorkCtx } from "./ui";
import "./work.css";

const Inicio = lazy(() => import("./vistas/Inicio").then((m) => ({ default: m.Inicio })));
const Chat = lazy(() => import("./vistas/Chat").then((m) => ({ default: m.Chat })));
const Cowork = lazy(() => import("./vistas/Cowork").then((m) => ({ default: m.Cowork })));
const Datos = lazy(() => import("./vistas/Datos").then((m) => ({ default: m.Datos })));
const Correo = lazy(() => import("./vistas/Correo").then((m) => ({ default: m.Correo })));
const Agenda = lazy(() => import("./vistas/Agenda").then((m) => ({ default: m.Agenda })));
const Skills = lazy(() => import("./vistas/Skills").then((m) => ({ default: m.Skills })));
const Memoria = lazy(() => import("./vistas/Memoria").then((m) => ({ default: m.Memoria })));
const Equipos = lazy(() => import("./vistas/Equipos").then((m) => ({ default: m.Equipos })));
const Conectores = lazy(() => import("./vistas/Conectores").then((m) => ({ default: m.Conectores })));
const AdmRoles = lazy(() => import("./vistas/AdmRoles").then((m) => ({ default: m.AdmRoles })));
const AdmMemoria = lazy(() => import("./vistas/AdmMemoria").then((m) => ({ default: m.AdmMemoria })));
const Arquitectura = lazy(() => import("./vistas/Arquitectura").then((m) => ({ default: m.Arquitectura })));
const MicrosoftRetorno = lazy(() => import("./vistas/Conectores").then((m) => ({ default: m.MicrosoftRetorno })));

interface Item {
  ruta: string;
  titulo: string;
  icono: ReactNode;
  solo?: "admin" | "correo";
}
const GRUPOS: { nombre: string; items: Item[] }[] = [
  { nombre: "Panel", items: [{ ruta: "", titulo: "Inicio", icono: IC.home }] },
  {
    nombre: "Trabajo",
    items: [
      { ruta: "chat", titulo: "Chat", icono: IC.chat },
      { ruta: "cowork", titulo: "Cowork", icono: IC.cow },
      { ruta: "agenda", titulo: "Mi agenda", icono: IC.cal },
      { ruta: "equipos", titulo: "Pilo for Teams", icono: IC.team },
    ],
  },
  {
    nombre: "Mis fuentes",
    items: [
      { ruta: "correo", titulo: "Correo", icono: IC.mail },
      { ruta: "datos", titulo: "Datos en este equipo", icono: IC.data },
    ],
  },
  {
    nombre: "Aprendizaje",
    items: [
      { ruta: "skills", titulo: "Mis skills", icono: IC.spark },
      { ruta: "memoria", titulo: "Memoria", icono: IC.mem },
    ],
  },
  { nombre: "Sistema", items: [{ ruta: "conectores", titulo: "Conectores", icono: IC.plug }] },
  {
    nombre: "Administración",
    items: [
      { ruta: "admin/memoria", titulo: "Memoria colectiva", icono: IC.mem, solo: "admin" },
      { ruta: "admin/roles", titulo: "Acceso y roles", icono: IC.key, solo: "admin" },
      { ruta: "admin/arquitectura", titulo: "Cómo está construido", icono: IC.arch, solo: "admin" },
    ],
  },
];

const temaInicial = (): "light" | "dark" => {
  try {
    const g = localStorage.getItem("pilo-work-tema");
    if (g === "light" || g === "dark") return g;
  } catch {
    /* sin almacenamiento */
  }
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

type Estado = { fase: "cargando" } | { fase: "acceso"; inicial?: "verif" | "ms" } | { fase: "dentro"; perfil: Perfil };

export function PiloWork() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [tema, setTema] = useState<"light" | "dark">(temaInicial);
  const [curtain, setCurtain] = useState(false);
  const { msg, on, toast } = useToastState();
  const cortina = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    try {
      localStorage.setItem("pilo-work-tema", tema);
    } catch {
      /* sin almacenamiento */
    }
    return () => document.documentElement.removeAttribute("data-theme");
  }, [tema]);

  useEffect(() => {
    registrarWorker();
    document.title = "Pilo at Work";
  }, []);

  /* Al abrir: si ya hay sesión y rol, directo adentro; si vuelve de Microsoft, se sigue su camino. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      const volviendo = new URLSearchParams(window.location.search).get("ms") === "1";
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      if (!data.session) return setEstado({ fase: "acceso" });
      if (volviendo) {
        window.history.replaceState(null, "", "/work");
        return setEstado({ fase: "acceso", inicial: "ms" });
      }
      const rol = await miRol();
      if (!vivo) return;
      if (!rol) return setEstado({ fase: "acceso", inicial: "verif" });
      const perfil = await leerPerfil(rol);
      if (vivo) setEstado(perfil ? { fase: "dentro", perfil } : { fase: "acceso" });
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") setEstado({ fase: "acceso" });
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const alternarTema = () => setTema((t) => (t === "dark" ? "light" : "dark"));

  /* La cortina que se abre desde Pilo al entrar al espacio. */
  const entrar = async (rol: Rol) => {
    const perfil = await leerPerfil(rol);
    if (!perfil) return toast("No se pudo abrir su perfil. Intente de nuevo.");
    if (movimientoReducido()) return setEstado({ fase: "dentro", perfil });
    setCurtain(true);
    requestAnimationFrame(() => {
      const c = cortina.current;
      if (!c) return setEstado({ fase: "dentro", perfil });
      gsap.set(c, { clipPath: "circle(0% at 50% 50%)" });
      gsap.to(c, {
        clipPath: "circle(150% at 50% 50%)",
        duration: 0.5,
        ease: "power3.in",
        onComplete: () => {
          setEstado({ fase: "dentro", perfil });
          gsap.to(c, { clipPath: "circle(0% at 50% 50%)", duration: 0.7, ease: "power3.inOut", onComplete: () => setCurtain(false) });
        },
      });
      // Pase lo que pase, la cortina nunca deja la pantalla tapada.
      setTimeout(() => setCurtain(false), 2600);
    });
  };

  return (
    <div className="pw">
      <div className="frame">
        {estado.fase === "cargando" && (
          <div className="screen" style={{ display: "grid", placeItems: "center" }}>
            <img src={MOOD.piensa} alt="Cargando Pilo at Work" width={96} height={96} />
          </div>
        )}
        {estado.fase === "acceso" && <Acceso onListo={entrar} aviso={toast} tema={tema} onTema={alternarTema} inicial={estado.inicial} />}
        {estado.fase === "dentro" && <Espacio perfil={estado.perfil} tema={tema} onTema={alternarTema} toast={toast} />}
        {curtain && (
          <div className="curtain" ref={cortina}>
            <img src={MOOD.feliz} alt="" />
          </div>
        )}
        <div className={`toast${on ? " on" : ""}`} role="status">
          {msg}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */

function Espacio({ perfil, tema, onTema, toast }: { perfil: Perfil; tema: string; onTema: () => void; toast: (m: string) => void }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const esAdmin = perfil.rol === "admin";
  const conCorreo = perfil.rol !== "colaborador";
  const [filas, setFilas] = useState(0);
  const [pedido, setPedido] = useState("");
  const [esquema, setEsquema] = useState<unknown>(null);
  const [avisosApp, setAvisosApp] = useState(true);
  const [notifs, setNotifs] = useState<(Avisar & { id: number })[]>([]);
  const [pal, setPal] = useState(false);
  const [versionNav, setVersionNav] = useState(0);
  const [pendientes, setPendientes] = useState(0);
  const idN = useRef(0);

  const ir = useCallback((ruta: string) => navigate(`/work${ruta ? `/${ruta.replace(/^\/+/, "")}` : ""}`), [navigate]);
  const aviso = useCallback((a: Avisar) => {
    const id = ++idN.current;
    setNotifs((n) => [...n, { ...a, id }]);
    setTimeout(() => setNotifs((n) => n.filter((x) => x.id !== id)), 9000);
  }, []);

  /* Propuestas por revisar (solo administración). */
  useEffect(() => {
    if (!esAdmin) return;
    void supabase
      .from("pw_propuestas")
      .select("id", { count: "exact", head: true })
      .eq("estado", "pendiente")
      .then(({ count }) => setPendientes(count ?? 0));
  }, [esAdmin, versionNav, loc.pathname]);

  /* Aviso dentro de la app: reuniones que empiezan pronto, mientras la app está abierta. */
  useEffect(() => {
    if (!avisosApp) return;
    const avisadas = new Set<string>();
    const revisar = async () => {
      const { data } = await supabase
        .from("pw_recordatorios")
        .select("id, titulo, inicia_en, avisar_min, url")
        .gt("inicia_en", new Date(Date.now() - 60_000).toISOString())
        .lt("inicia_en", new Date(Date.now() + 61 * 60_000).toISOString())
        .limit(20);
      for (const r of data ?? []) {
        const falta = (new Date(r.inicia_en as string).getTime() - Date.now()) / 60000;
        if (falta <= (r.avisar_min as number) && !avisadas.has(r.id as string)) {
          avisadas.add(r.id as string);
          aviso({ t: `Empieza en ${Math.max(1, Math.round(falta))} minutos`, b: r.titulo as string, ir: String(r.url ?? "/work/agenda").replace(/^\/work\/?/, "") });
        }
      }
    };
    void revisar();
    const iv = setInterval(() => void revisar(), 60_000);
    return () => clearInterval(iv);
  }, [avisosApp, aviso]);

  /* Paleta Ctrl K. */
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPal((p) => !p);
      } else if (e.key === "Escape") setPal(false);
    };
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, []);

  const ctx: WorkCtx = useMemo(
    () => ({ perfil, esAdmin, conCorreo, toast, aviso, ir, filas, setFilas, pedido, setPedido, esquema, setEsquema, avisosApp, setAvisosApp, refrescarNav: () => setVersionNav((v) => v + 1) }),
    [perfil, esAdmin, conCorreo, toast, aviso, ir, filas, pedido, esquema, avisosApp],
  );

  const grupos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => (i.solo === "admin" ? esAdmin : true)) })).filter((g) => g.items.length);
  const actual = loc.pathname.replace(/^\/work\/?/, "").replace(/\/+$/, "");
  const titulo = grupos.flatMap((g) => g.items).find((i) => i.ruta === actual)?.titulo ?? (actual.startsWith("microsoft") ? "Microsoft 365" : "Pilo at Work");

  /* El indicador que se desliza entre secciones (no se anima si lo pidió el teclado). */
  const nav = useRef<HTMLElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const primera = useRef(true);
  useEffect(() => {
    const b = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const i = ind.current;
    if (!b || !i) return;
    if (primera.current || movimientoReducido()) {
      gsap.set(i, { y: b.offsetTop, height: b.offsetHeight, opacity: 1 });
      primera.current = false;
    } else gsap.to(i, { y: b.offsetTop, height: b.offsetHeight, duration: 0.26, ease: "expo.out", overwrite: true });
  }, [actual, versionNav, esAdmin]);

  /* La vista entra con un fundido corto. */
  const vista = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const v = vista.current;
    if (v && !movimientoReducido()) gsap.fromTo(v, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.26, ease: "expo.out", clearProps: "opacity,transform" });
  }, [actual]);

  return (
    <WorkProvider value={ctx}>
      <section className="screen" id="app" aria-label="Espacio de trabajo">
        <aside className="rail">
          <div className="rail__brand">
            <Logo />
            <div>
              <b>Pilo at Work</b>
              <small>{perfil.dependencia || "Universidad de Santander"}</small>
            </div>
          </div>
          <nav className="rail__nav" ref={nav} aria-label="Secciones">
            <span data-ind ref={ind} aria-hidden="true" />
            {grupos.map((g) => (
              <div key={g.nombre} style={{ display: "contents" }}>
                <h3>{g.nombre}</h3>
                {g.items.map((i) => (
                  <button key={i.ruta} type="button" className="nav" aria-current={actual === i.ruta ? "page" : undefined} onClick={() => ir(i.ruta)}>
                    {i.icono}
                    <span>{i.titulo}</span>
                    {i.ruta === "admin/memoria" && pendientes > 0 && <em>{pendientes}</em>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="rail__me">
            <span className="avatar">{iniciales(perfil.nombre) || "?"}</span>
            <div style={{ minWidth: 0 }}>
              <b>{perfil.nombre}</b>
              <small>{ROL_ETIQUETA[perfil.rol]}</small>
            </div>
            <button
              type="button"
              className="tbtn"
              style={{ marginLeft: "auto" }}
              onClick={async () => {
                await supabase.auth.signOut();
              }}
            >
              Salir
            </button>
          </div>
        </aside>
        <div className="main">
          <header className="top">
            <h1>{titulo}</h1>
            <span className="sp" />
            <span className="chip local" title="Los archivos de este equipo se revisan aquí; la IA solo recibe lo que usted aprueba">
              <i />
              <span>Datos locales · {filas} filas enviadas</span>
            </span>
            <span className="chip" title="El modelo de texto es el de Pilo; NVIDIA de apoyo">
              <i style={{ background: "var(--blue)" }} />
              Mistral · NVIDIA de apoyo
            </span>
            <button type="button" className="tbtn" onClick={onTema} aria-label="Cambiar entre tema claro y oscuro">
              Tema {tema === "dark" ? "oscuro" : "claro"}
            </button>
            <button type="button" className="tbtn" onClick={() => setPal(true)}>
              Buscar o ir a… <span className="kbd">Ctrl K</span>
            </button>
          </header>
          <div className="view" ref={vista}>
            <Suspense fallback={<div className="pad muted">Cargando…</div>}>
              <Routes>
                <Route index element={<Inicio />} />
                <Route path="chat" element={<Chat />} />
                <Route path="cowork" element={<Cowork />} />
                <Route path="datos" element={<Datos />} />
                <Route path="correo" element={<Correo />} />
                <Route path="agenda" element={<Agenda />} />
                <Route path="skills" element={<Skills />} />
                <Route path="memoria" element={<Memoria />} />
                <Route path="equipos" element={<Equipos />} />
                <Route path="conectores" element={<Conectores />} />
                <Route path="microsoft" element={<MicrosoftRetorno />} />
                {/* Solo administración: la ruta no abre para los demás (y la base tampoco entrega los datos). */}
                <Route path="admin/memoria" element={esAdmin ? <AdmMemoria /> : <Navigate to="/work" replace />} />
                <Route path="admin/roles" element={esAdmin ? <AdmRoles /> : <Navigate to="/work" replace />} />
                <Route path="admin/arquitectura" element={esAdmin ? <Arquitectura /> : <Navigate to="/work" replace />} />
                <Route path="*" element={<Navigate to="/work" replace />} />
              </Routes>
            </Suspense>
          </div>
        </div>
        <div className="notifs" aria-live="polite">
          {notifs.map((n) => (
            <div className="nt" key={n.id}>
              <Cara mood="feliz" />
              <div>
                <b>{n.t}</b>
                <p>{n.b}</p>
                <div className="nt__a">
                  <button
                    type="button"
                    className="btn sm primary"
                    onClick={() => {
                      setNotifs((x) => x.filter((y) => y.id !== n.id));
                      if (n.ir != null) ir(n.ir);
                    }}
                  >
                    {n.ir != null ? "Abrir" : "Entendido"}
                  </button>
                  <button type="button" className="btn sm" onClick={() => setNotifs((x) => x.filter((y) => y.id !== n.id))}>
                    Cerrar
                  </button>
                </div>
              </div>
              <span className="nt__app">Pilo at Work · ahora</span>
            </div>
          ))}
        </div>
        {pal && <Paleta grupos={grupos} cerrar={() => setPal(false)} ir={ir} setPedido={setPedido} />}
      </section>
    </WorkProvider>
  );
}

function Paleta({ grupos, cerrar, ir, setPedido }: { grupos: { items: Item[] }[]; cerrar: () => void; ir: (r: string) => void; setPedido: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const opciones = useMemo(() => {
    const o: [string, () => void][] = grupos.flatMap((g) => g.items).map((i) => [`Ir a ${i.titulo}`, () => ir(i.ruta)] as [string, () => void]);
    if (q.trim().length > 2) o.push([`Pedir a Pilo: ${q.trim()}`, () => { setPedido(q.trim()); ir("chat"); }]);
    return o.filter((x) => x[0].toLowerCase().includes(q.toLowerCase()) || x[0].startsWith("Pedir"));
  }, [grupos, q, ir, setPedido]);
  const usar = (i: number) => {
    const o = opciones[i];
    if (!o) return;
    cerrar();
    o[1]();
  };
  return (
    <div className="pal" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="pal__box" role="dialog" aria-label="Buscar o ir a">
        <input
          autoFocus
          value={q}
          placeholder="Ir a una sección o pedir algo a Pilo"
          aria-label="Buscar"
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              setSel((s) => Math.min(opciones.length - 1, s + 1));
              e.preventDefault();
            } else if (e.key === "ArrowUp") {
              setSel((s) => Math.max(0, s - 1));
              e.preventDefault();
            } else if (e.key === "Enter") usar(sel);
          }}
        />
        <div>
          {opciones.map((o, i) => (
            <button key={o[0]} type="button" className={i === sel ? "on" : ""} onClick={() => usar(i)}>
              {o[0]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export { SUPABASE_URL };

/* =============================================================================
   Mi agenda · semana de Microsoft 365 (lunes a domingo, hora de Bogotá), reuniones de Teams
   y avisos (dentro de la app y Web Push).

   Qué hace bien (y por qué fallaba antes):
     · calendarView de la semana mostrada completa (lunes 00:00 a domingo 23:59), paginado,
       con la zona «SA Pacific Standard Time»; las reuniones periódicas ya vienen expandidas.
     · eventos de todo el día en su propia franja; eventos que cruzan la medianoche se parten
       por día; los que se solapan van lado a lado.
     · navegación semana anterior / siguiente / hoy; línea de «ahora» en hora de Bogotá aunque
       el equipo esté en otra zona; carga, vacío y error con reintento.
     · clic en un evento: detalle (descripción saneada), Teams, editar, cancelar con confirmación.
       clic en un espacio vacío (o botón «Nueva reunión» / tecla N): crear con día y hora prellenados.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { callFn } from "../api";
import { conectarMs, useMs } from "../ms";
import { guardarPrefs, leerPrefs, pushDisponible } from "../push";
import { sanearHtml } from "../sanear";
import { movimientoReducido } from "../../rankings/movimiento";
import { Dialogo, IC, MOOD, Tg, useWork } from "../ui";

interface Ev {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  todoElDia: boolean;
  teams: boolean;
  joinUrl: string | null;
  lugar: string;
  organizador: string;
  mia: boolean;
  estado: string;
  respuesta: string;
  recurrente: boolean;
}
interface Detalle extends Ev {
  enlace: string | null;
  cuerpoHtml: string;
  cuerpoTexto: string;
  recordatorio: number | null;
  periodica: boolean;
  asistentes: { nombre: string; correo: string; tipo: string; respuesta: string }[];
}

const HORA_H = 48;
const p2 = (n: number) => String(n).padStart(2, "0");
/** Los días del calendario se manejan como «AAAA-MM-DD» y se suman en UTC: sin saltos por zona ni por horario de verano. */
const ymd = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const aDia = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const sumar = (s: string, n: number) => ymd(new Date(aDia(s).getTime() + n * 86400000));
const ahoraBogota = () => new Date(Date.now() - 5 * 3600_000);
const hoyB = () => ymd(ahoraBogota());
const lunesDe = (s: string) => {
  const dow = aDia(s).getUTCDay();
  return sumar(s, -(dow === 0 ? 6 : dow - 1));
};
const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hm = (m: number) => `${p2(Math.floor(m / 60) % 24)}:${p2(m % 60)}`;
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const largo = (s: string) => `${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][aDia(s).getUTCDay()]} ${aDia(s).getUTCDate()} de ${MESES[aDia(s).getUTCMonth()]}`;
const duracion = (a: string, b: string) => {
  const m = Math.round((new Date(`${b}Z`).getTime() - new Date(`${a}Z`).getTime()) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
};
const RESPUESTA: Record<string, string> = { accepted: "Aceptó", declined: "Rechazó", tentativelyAccepted: "Tal vez", notResponded: "Sin responder", none: "Sin responder", organizer: "Organiza" };

interface Seg {
  ev: Ev;
  a: number;
  b: number;
}
/** Reparte los eventos solapados lado a lado: cada grupo de eventos que se tocan comparte columnas. */
function disponer(segs: Seg[]): (Seg & { col: number; cols: number })[] {
  const orden = [...segs].sort((x, y) => x.a - y.a || y.b - x.b);
  const out: (Seg & { col: number; cols: number })[] = [];
  let grupo: (Seg & { col: number })[] = [];
  let finGrupo = -1;
  const cerrar = () => {
    const n = Math.max(...grupo.map((g) => g.col)) + 1;
    grupo.forEach((g) => out.push({ ...g, cols: n }));
    grupo = [];
  };
  for (const s of orden) {
    if (grupo.length && s.a >= finGrupo) {
      cerrar();
      finGrupo = -1;
    }
    const usados = grupo.filter((g) => g.b > s.a).map((g) => g.col);
    let col = 0;
    while (usados.includes(col)) col++;
    grupo.push({ ...s, col });
    finGrupo = Math.max(finGrupo, s.b);
  }
  if (grupo.length) cerrar();
  return out;
}

type Origen = { x: number; y: number } | null;
interface Borrador {
  dia: string;
  hora: string;
  min: number;
  titulo?: string;
}

export function Agenda() {
  const { perfil, toast, avisosApp, setAvisosApp, aviso, setPedido, ir } = useWork();
  const ms = useMs();
  const [lunes, setLunes] = useState(() => lunesDe(hoyB()));
  const [evs, setEvs] = useState<Ev[]>([]);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState("");
  const [libres, setLibres] = useState<string[]>([]);
  const [segundoPlano, setSegundoPlano] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(() => ahoraBogota());
  const [detalle, setDetalle] = useState<{ ev: Ev; origen: Origen } | null>(null);
  const [nueva, setNueva] = useState<{ b: Borrador; origen: Origen } | null>(null);
  const [nuevoId, setNuevoId] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumar(lunes, i)), [lunes]);
  const hoy = hoyB();

  const cargar = useCallback(async () => {
    const mi = ++seq.current;
    setEstado("cargando");
    setError("");
    try {
      const r = await callFn<{ eventos: Ev[] }>("pw-microsoft", { action: "agenda_semana", desde: `${lunes}T00:00:00`, hasta: `${sumar(lunes, 6)}T23:59:59` });
      if (mi !== seq.current) return;
      setEvs(r.eventos);
      setEstado("listo");
    } catch (e) {
      if (mi !== seq.current) return;
      setError(e instanceof Error ? e.message : "No se pudo leer la agenda.");
      setEstado("error");
    }
  }, [lunes]);
  useEffect(() => {
    if (ms.agendaListo) void cargar();
  }, [ms.agendaListo, cargar]);
  useEffect(() => {
    void leerPrefs().then((p) => setSegundoPlano(p.segundoPlano));
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => setAhora(ahoraBogota()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  // Al abrir (y al cambiar de semana) la vista empieza cerca de las 7:00.
  useEffect(() => {
    if (estado === "listo" && scroll.current) scroll.current.scrollTop = 6.5 * HORA_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando la semana termina de cargar
  }, [lunes, estado === "listo"]);

  // Atajo de teclado N: nueva reunión (la alternativa al clic en la cuadrícula).
  const dialogoAbierto = Boolean(detalle || nueva);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey || dialogoAbierto) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      setNueva({ b: borradorAhora(), origen: null });
    };
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, [dialogoAbierto]);

  const borradorAhora = (): Borrador => {
    const b = ahoraBogota();
    const m = Math.min(23 * 60, Math.ceil((b.getUTCHours() * 60 + b.getUTCMinutes() + 1) / 15) * 15);
    return { dia: dias.includes(hoy) ? hoy : lunes, hora: hm(Math.max(m, 7 * 60)), min: 45 };
  };

  /* Cada evento nuevo entra con una animación corta. */
  useEffect(() => {
    if (!nuevoId || movimientoReducido()) return;
    const el = document.querySelector<HTMLElement>(`.pwk .ag-ev[data-id="${CSS.escape(nuevoId)}"]`);
    if (el) gsap.fromTo(el, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.3, ease: "expo.out", clearProps: "opacity,transform" });
    setNuevoId("");
  }, [evs, nuevoId]);

  const proponer = async () => {
    try {
      const r = await callFn<{ horarios: string[] }>("pw-microsoft", { action: "agenda_libres", desde: `${hoy}T00:00:00`, hasta: `${sumar(lunes, 6)}T23:59:59`, minutos: 45 });
      setLibres(r.horarios);
      if (!r.horarios.length) toast("No hay horarios libres en esta semana");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo calcular.");
    }
  };
  const alternarApp = async (v: boolean) => {
    setAvisosApp(v);
    try {
      await guardarPrefs({ avisarEquipo: v, segundoPlano: v && segundoPlano }, perfil.userId);
      if (!v) setSegundoPlano(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  };
  const alternarFondo = async (v: boolean) => {
    if (!avisosApp) return toast("Primero permita los avisos en este equipo");
    try {
      await guardarPrefs({ avisarEquipo: true, segundoPlano: v }, perfil.userId);
      setSegundoPlano(v);
      toast(v ? "Pilo avisará con la app en segundo plano" : "Solo mientras la app esté abierta");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  };
  const probar = async () => {
    aviso({ t: "Así se le avisará", b: "Revisión de cifras · empieza en 10 minutos", ir: "agenda" });
    if (segundoPlano) {
      try {
        const r = await callFn<{ enviados: number }>("pw-avisos", { action: "probar" });
        if (!r.enviados) toast("No hay un dispositivo suscrito todavía.");
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo enviar la prueba.");
      }
    }
  };

  if (!ms.agendaListo)
    return (
      <div className="pad">
        <div className="box" style={{ maxWidth: 660, margin: "0 auto" }}>
          <div className="pilo-big" style={{ width: 96, height: 96 }}>
            <img src={MOOD.idea} alt="" />
          </div>
          <h2>Sincronice su agenda con Microsoft 365</h2>
          <p className="muted">Verá sus reuniones, podrá crear reuniones de Teams y recibirá un aviso antes de cada una. Nada se borra sin su permiso.</p>
          <ul className="flat">
            <li className="item"><span className="ico">{IC.cal}</span><div><b>Leer y escribir su calendario</b><p>Calendars.ReadWrite · propone horarios libres</p></div><span className="badge ok">Incluido</span></li>
            <li className="item"><span className="ico">{IC.team}</span><div><b>Crear reuniones de Teams</b><p>OnlineMeetings.ReadWrite · genera el enlace de la reunión</p></div><span className="badge ok">Incluido</span></li>
            <li className="item"><span className="ico">{IC.mail}</span><div><b>Invitaciones</b><p>Se envían desde su calendario, a las personas que usted escriba</p></div><span className="badge">Con su confirmación</span></li>
          </ul>
          {!ms.configurado && <p className="err">Microsoft 365 aún no está configurado por TIC.</p>}
          <button
            type="button"
            className="btn navy"
            disabled={ocupado || !ms.configurado}
            onClick={async () => {
              setOcupado(true);
              try {
                await conectarMs(ms.correoPermitido ? ["correo", "agenda"] : ["agenda"]);
              } catch (e) {
                toast(e instanceof Error ? e.message : "No se pudo abrir Microsoft.");
                setOcupado(false);
              }
            }}
          >
            {ocupado ? "Abriendo Microsoft…" : "Conectar con Microsoft"}
          </button>
        </div>
      </div>
    );

  const d0 = aDia(lunes);
  const d6 = aDia(sumar(lunes, 6));
  const titulo = d0.getUTCMonth() === d6.getUTCMonth() ? `Semana del ${d0.getUTCDate()} al ${d6.getUTCDate()} de ${MESES[d6.getUTCMonth()]}` : `Semana del ${d0.getUTCDate()} de ${MESES[d0.getUTCMonth()]} al ${d6.getUTCDate()} de ${MESES[d6.getUTCMonth()]}`;
  const ahoraMin = ahoraBogota().getUTCHours() * 60 + ahoraBogota().getUTCMinutes();
  void ahora;

  const porDia = dias.map((d) => {
    const ini = `${d}T00:00:00`;
    const sig = `${sumar(d, 1)}T00:00:00`;
    const todo = evs.filter((e) => e.todoElDia && e.inicio <= ini && e.fin > ini);
    const segs: Seg[] = evs
      .filter((e) => !e.todoElDia && e.inicio < sig && e.fin > ini)
      .map((e) => {
        const a = e.inicio < ini ? 0 : mins(e.inicio.slice(11, 16));
        const b = e.fin >= sig ? 1440 : mins(e.fin.slice(11, 16));
        return { ev: e, a, b: Math.max(b, a + 15) };
      });
    return { d, todo, cols: disponer(segs) };
  });
  const hayTodo = porDia.some((x) => x.todo.length);
  const choque = (b: Borrador) => {
    const a = `${b.dia}T${b.hora}:00`;
    const f = new Date(new Date(`${a}Z`).getTime() + b.min * 60000).toISOString().slice(0, 19);
    return evs.filter((e) => !e.todoElDia && e.estado !== "free" && e.inicio < f && e.fin > a);
  };

  return (
    <div className="agd">
      <div className="agd__m">
        <div className="ag-bar">
          <h2 className="h2" style={{ fontSize: 17 }}>{titulo}</h2>
          <div className="ag-nav" role="group" aria-label="Cambiar de semana">
            <button type="button" className="btn sm" onClick={() => setLunes(sumar(lunes, -7))} aria-label="Semana anterior">{IC.chevL}</button>
            <button type="button" className="btn sm" onClick={() => setLunes(lunesDe(hoy))} disabled={lunes === lunesDe(hoy)}>Hoy</button>
            <button type="button" className="btn sm" onClick={() => setLunes(sumar(lunes, 7))} aria-label="Semana siguiente">{IC.chevR}</button>
          </div>
          <span className="badge ok">Sincronizada con Outlook</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={() => void cargar()} disabled={estado === "cargando"}>
            {estado === "cargando" ? "Leyendo…" : "Actualizar"}
          </button>
          <button type="button" className="btn sm primary" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setNueva({ b: borradorAhora(), origen: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }); }} aria-keyshortcuts="N">
            {IC.plus} Nueva reunión <span className="kbd" aria-hidden="true">N</span>
          </button>
        </div>
        {estado === "error" && (
          <p className="err" role="alert">
            {error}{" "}
            <button type="button" className="btn sm" onClick={() => void cargar()}>Reintentar</button>
          </p>
        )}
        <div className="agw" aria-busy={estado === "cargando"}>
          <div className="agw__h" style={{ ["--cols" as string]: 7 }}>
            <div />
            {dias.map((d, i) => (
              <div key={d} className={`agw__d${d === hoy ? " today" : ""}`} aria-current={d === hoy ? "date" : undefined}>
                {DIAS[i]} {aDia(d).getUTCDate()}
              </div>
            ))}
          </div>
          {hayTodo && (
            <div className="agw__todo" style={{ ["--cols" as string]: 7 }}>
              <div className="small muted">Todo el día</div>
              {porDia.map((x) => (
                <div key={x.d} className="agw__tc">
                  {x.todo.map((e) => (
                    <button key={e.id} type="button" className="ag-ev ag-ev--todo" data-id={e.id} onClick={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setDetalle({ ev: e, origen: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }); }} title={e.titulo}>
                      {e.titulo}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="agw__sc" ref={scroll}>
            <div className="agw__g" style={{ ["--cols" as string]: 7 }}>
              <div className="agw__hrs" aria-hidden="true">
                {Array.from({ length: 24 }, (_, i) => (
                  <span key={i} style={{ top: i * HORA_H }}>{i === 0 ? "" : hm(i * 60)}</span>
                ))}
              </div>
              {porDia.map((x) => (
                <div
                  key={x.d}
                  className={`agc${x.d === hoy ? " today" : ""}`}
                  style={{ height: 24 * HORA_H }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    const m = Math.min(23 * 60 + 45, Math.max(0, Math.round((((e.clientY - r.top) / HORA_H) * 60) / 15) * 15));
                    setNueva({ b: { dia: x.d, hora: hm(m), min: 45 }, origen: { x: e.clientX, y: e.clientY } });
                  }}
                >
                  {x.d === hoy && <div className="now" style={{ top: (ahoraMin / 60) * HORA_H }} aria-hidden="true" />}
                  {x.cols.map(({ ev, a, b, col, cols }) => (
                    <button
                      key={`${ev.id}-${x.d}`}
                      type="button"
                      className={`ag-ev${ev.teams ? " teams" : ""}${ev.estado === "free" ? " libre" : ""}`}
                      data-id={ev.id}
                      style={{ top: (a / 60) * HORA_H, height: Math.max(22, ((b - a) / 60) * HORA_H - 2), left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                      title={`${ev.titulo} · ${ev.inicio.slice(11, 16)} a ${ev.fin.slice(11, 16)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setDetalle({ ev, origen: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
                      }}
                    >
                      <span className="ag-ev__t">{ev.titulo}</span>
                      <small>
                        {hm(a)}–{hm(b)}
                        {ev.teams ? " · Teams" : ""}
                      </small>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {estado === "listo" && !evs.length && <p className="agw__vacio muted">No hay reuniones esta semana. Haga clic en un espacio del calendario o pulse N para crear una.</p>}
            {estado === "cargando" && !evs.length && <p className="agw__vacio muted" role="status">Leyendo su calendario…</p>}
          </div>
        </div>
        <p className="hint">Hora de Bogotá. Haga clic en un espacio vacío para crear una reunión, o en una reunión para ver su detalle.</p>
      </div>
      <aside className="agd__r" aria-label="Acciones de la agenda">
        <section>
          <h3>Horarios libres</h3>
          <button type="button" className="btn sm" onClick={() => void proponer()}>
            Proponer horarios libres de 45 min
          </button>
          {libres.length > 0 && (
            <div className="propose" style={{ marginTop: 10 }}>
              <b>Libres hasta el domingo</b>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {libres.map((h) => (
                  <button key={h} type="button" className="tag" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setNueva({ b: { dia: h.slice(0, 10), hora: h.slice(11, 16), min: 45 }, origen: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }); }}>
                    {aDia(h.slice(0, 10)).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", timeZone: "UTC" })} {h.slice(11, 16)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        <section>
          <h3>Avisos</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <div className="setrow">
              <span>
                Avisar en este equipo
                <small>Una notificación 10 minutos antes de cada reunión</small>
              </span>
              <Tg on={avisosApp} onChange={(v) => void alternarApp(v)} label="Avisar en este equipo" />
            </div>
            <div className="setrow">
              <span>
                También con la app en segundo plano
                <small>{pushDisponible() ? "PWA instalada · notificaciones push" : "Este navegador no lo permite"}</small>
              </span>
              <Tg on={segundoPlano} onChange={(v) => void alternarFondo(v)} label="Avisar con la app en segundo plano" />
            </div>
            <button type="button" className="btn sm" onClick={() => void probar()}>
              Probar un aviso
            </button>
          </div>
        </section>
      </aside>
      {detalle && (
        <DetalleReunion
          ev={detalle.ev}
          origen={detalle.origen}
          onCerrar={() => setDetalle(null)}
          onCambio={() => {
            setDetalle(null);
            void cargar();
          }}
          onPilo={(q) => {
            setDetalle(null);
            setPedido(q);
            ir("chat");
          }}
        />
      )}
      {nueva && (
        <NuevaReunion
          inicial={nueva.b}
          origen={nueva.origen}
          choque={choque}
          onCerrar={() => setNueva(null)}
          onCreada={(id) => {
            setNuevoId(id);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */

function DetalleReunion({ ev, origen, onCerrar, onCambio, onPilo }: { ev: Ev; origen: Origen; onCerrar: () => void; onCambio: () => void; onPilo: (q: string) => void }) {
  const { toast } = useWork();
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState("");
  const [modo, setModo] = useState<"ver" | "editar" | "borrar">("ver");
  const [f, setF] = useState({ titulo: ev.titulo, dia: ev.inicio.slice(0, 10), ini: ev.inicio.slice(11, 16), fin: ev.fin.slice(11, 16), cuerpo: "" });
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    callFn<{ evento: Detalle }>("pw-microsoft", { action: "agenda_detalle", id: ev.id })
      .then((r) => {
        if (!vivo) return;
        setD(r.evento);
        setF((x) => ({ ...x, cuerpo: r.evento.cuerpoTexto }));
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer la reunión."));
    return () => {
      vivo = false;
    };
  }, [ev.id]);

  const base = d ?? { ...ev, enlace: null, cuerpoHtml: "", cuerpoTexto: "", recordatorio: null, periodica: ev.recurrente, asistentes: [] };
  const seguro = useMemo(() => (base.cuerpoHtml ? sanearHtml(base.cuerpoHtml, { imagenes: false }).html : ""), [base.cuerpoHtml]);
  const fecha1 = base.inicio.slice(0, 10);
  const fecha2 = base.fin.slice(0, 10);
  const conInvitados = base.mia && base.asistentes.length > 0;

  const guardar = async () => {
    if (!f.titulo.trim()) return setError("Escriba el título.");
    if (f.fin <= f.ini) return setError("La reunión debe terminar después de empezar.");
    setOcupado(true);
    setError("");
    try {
      await callFn("pw-microsoft", { action: "agenda_editar", id: ev.id, titulo: f.titulo.trim(), inicio: `${f.dia}T${f.ini}:00`, fin: `${f.dia}T${f.fin}:00`, cuerpo: f.cuerpo });
      toast("Reunión actualizada");
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setOcupado(false);
    }
  };
  const borrar = async () => {
    setOcupado(true);
    setError("");
    try {
      const r = await callFn<{ cancelada: boolean }>("pw-microsoft", { action: "agenda_eliminar", id: ev.id });
      toast(r.cancelada ? "Reunión cancelada y avisada a los invitados" : "Reunión eliminada de su calendario");
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
      setOcupado(false);
    }
  };

  return (
    <Dialogo
      titulo={modo === "borrar" ? "¿Cancelar esta reunión?" : modo === "editar" ? "Editar reunión" : base.titulo}
      ancho={620}
      origen={origen}
      onCerrar={onCerrar}
      pie={
        modo === "ver" ? (
          <>
            <button type="button" className="btn sm" onClick={() => onPilo(`Prepare la reunión «${base.titulo}» del ${largo(fecha1)} a las ${base.inicio.slice(11, 16)}: un resumen del asunto y una propuesta de agenda. No cree ni cambie nada en mi calendario. Asistentes: ${base.asistentes.slice(0, 8).map((a) => a.nombre || a.correo).join(", ") || "sin invitados"}.`)}>
              Pedir a Pilo que prepare la reunión
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn sm" onClick={() => setModo("editar")} disabled={!d}>Editar</button>
            <button type="button" className="btn sm" onClick={() => setModo("borrar")} disabled={!d}>{conInvitados ? "Cancelar reunión" : "Eliminar"}</button>
          </>
        ) : modo === "editar" ? (
          <>
            <button type="button" className="btn sm" onClick={() => setModo("ver")} disabled={ocupado}>Volver</button>
            <button type="button" className="btn sm primary" onClick={() => void guardar()} disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar cambios"}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn sm" onClick={() => setModo("ver")} disabled={ocupado} autoFocus>No cancelar</button>
            <button type="button" className="btn sm danger" onClick={() => void borrar()} disabled={ocupado}>
              {ocupado ? "Un momento…" : conInvitados ? "Sí, cancelar y avisar a los invitados" : "Sí, eliminar de mi calendario"}
            </button>
          </>
        )
      }
    >
      {modo === "borrar" ? (
        <div className="ag-det">
          <p>
            <b>{base.titulo}</b>
            <br />
            {largo(fecha1)}, {base.inicio.slice(11, 16)} a {base.fin.slice(11, 16)}
          </p>
          <p className="small">{conInvitados ? `Es la persona que la organiza: se enviará un aviso de cancelación a ${base.asistentes.length} invitado${base.asistentes.length === 1 ? "" : "s"}.` : "Se quitará de su calendario."} Esta acción no se puede deshacer desde aquí.</p>
          {base.periodica && <p className="small muted">Es una reunión periódica: esto afecta solo a esta fecha.</p>}
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      ) : modo === "editar" ? (
        <div className="ag-det" style={{ display: "grid", gap: 10 }}>
          <div className="field">
            <label htmlFor="ed-t">Título</label>
            <input className="inp" id="ed-t" value={f.titulo} maxLength={200} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="ed-d">Día</label>
              <input className="inp" id="ed-d" type="date" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} />
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="ed-i">Inicio</label>
                <input className="inp" id="ed-i" type="time" value={f.ini} onChange={(e) => setF({ ...f, ini: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ed-f">Fin</label>
                <input className="inp" id="ed-f" type="time" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ed-c">Descripción</label>
            <textarea className="inp" id="ed-c" rows={5} value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} style={{ padding: 10 }} />
            <span className="hint">Al guardar, la descripción se reemplaza por este texto (se pierde el formato original).</span>
          </div>
          {base.periodica && <p className="small muted">Es una reunión periódica: el cambio afecta solo a esta fecha.</p>}
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="ag-det">
          <dl className="ag-dl">
            <dt>{IC.clock}<span className="sr">Cuándo</span></dt>
            <dd>
              {base.todoElDia ? "Todo el día" : `${largo(fecha1)}, ${base.inicio.slice(11, 16)} a ${base.fin.slice(11, 16)}${fecha2 !== fecha1 ? ` (${largo(fecha2)})` : ""}`}
              {!base.todoElDia && <span className="muted"> · {duracion(base.inicio, base.fin)} · hora de Bogotá</span>}
              {base.periodica && <span className="badge" style={{ marginLeft: 6 }}>Periódica</span>}
            </dd>
            {base.organizador && (
              <>
                <dt>{IC.user}<span className="sr">Organiza</span></dt>
                <dd>{base.mia ? "Usted organiza" : base.organizador}</dd>
              </>
            )}
            {base.lugar && (
              <>
                <dt>{IC.folder}<span className="sr">Lugar</span></dt>
                <dd>{base.lugar}</dd>
              </>
            )}
          </dl>
          <div className="ag-links">
            {(base.joinUrl ?? ev.joinUrl) && (
              <a className="btn sm primary" href={base.joinUrl ?? ev.joinUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                {IC.video} Unirse a Teams
              </a>
            )}
            {base.enlace && (
              <a className="btn sm" href={base.enlace} target="_blank" rel="noopener noreferrer">
                Abrir en Outlook
              </a>
            )}
          </div>
          {!d && !error && <p className="muted small" role="status">Leyendo el detalle…</p>}
          {error && (
            <p className="err" role="alert">{error}</p>
          )}
          {base.asistentes.length > 0 && (
            <section>
              <h3 className="ag-h">Asistentes ({base.asistentes.length})</h3>
              <ul className="ag-as">
                {base.asistentes.map((a, i) => (
                  <li key={i}>
                    <span>{a.nombre || a.correo}</span>
                    <span className="small muted">{RESPUESTA[a.respuesta] ?? a.respuesta}{a.tipo === "optional" ? " · opcional" : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(seguro || base.cuerpoTexto) && (
            <section>
              <h3 className="ag-h">Descripción</h3>
              {seguro ? <div className="ag-cuerpo" dangerouslySetInnerHTML={{ __html: seguro }} /> : <p className="ag-cuerpo" style={{ whiteSpace: "pre-wrap" }}>{base.cuerpoTexto}</p>}
            </section>
          )}
        </div>
      )}
    </Dialogo>
  );
}

/* ----------------------------------------------------------------------------------------------- */

function NuevaReunion({ inicial, origen, choque, onCerrar, onCreada }: { inicial: Borrador; origen: Origen; choque: (b: Borrador) => Ev[]; onCerrar: () => void; onCreada: (id: string) => void }) {
  const { toast } = useWork();
  const [f, setF] = useState({ titulo: inicial.titulo ?? "", dia: inicial.dia, hora: inicial.hora, min: inicial.min, para: "", lugar: "", cuerpo: "", teams: true, recordatorio: "15" });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [creada, setCreada] = useState<{ link: string | null; titulo: string } | null>(null);
  const correos = f.para.split(/[,;\s]+/).filter(Boolean);
  const malos = correos.filter((c) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
  const choca = choque({ dia: f.dia, hora: f.hora, min: f.min });

  const crear = async () => {
    if (!f.titulo.trim()) return setError("Escriba el título de la reunión.");
    if (!f.dia || !/^\d{2}:\d{2}$/.test(f.hora)) return setError("Elija el día y la hora.");
    if (malos.length) return setError(`Revise estos correos: ${malos.join(", ")}`);
    const ini = `${f.dia}T${f.hora}:00`;
    const fin = new Date(new Date(`${ini}Z`).getTime() + f.min * 60000).toISOString().slice(0, 19);
    setOcupado(true);
    setError("");
    try {
      const r = await callFn<{ id: string; joinUrl: string | null }>("pw-microsoft", { action: "agenda_crear", titulo: f.titulo.trim(), inicio: ini, fin, asistentes: correos, teams: f.teams, cuerpo: f.cuerpo, lugar: f.lugar.trim() || undefined, recordatorio: f.recordatorio === "" ? undefined : Number(f.recordatorio) });
      onCreada(r.id);
      toast(f.teams ? "Reunión de Teams creada" : "Evento creado en su calendario");
      setCreada({ link: r.joinUrl, titulo: f.titulo.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la reunión.");
    }
    setOcupado(false);
  };

  return (
    <Dialogo
      titulo={creada ? "Reunión creada" : "Nueva reunión"}
      ancho={600}
      origen={origen}
      onCerrar={onCerrar}
      pie={
        creada ? (
          <button type="button" className="btn sm primary" onClick={onCerrar} autoFocus>Listo</button>
        ) : (
          <>
            <button type="button" className="btn sm" onClick={onCerrar}>Cancelar</button>
            <button type="button" className="btn sm primary" onClick={() => void crear()} disabled={ocupado}>
              {ocupado ? "Creando…" : correos.length ? "Crear y enviar invitaciones" : "Crear reunión"}
            </button>
          </>
        )
      }
    >
      {creada ? (
        <div className="ag-det">
          <p><b>{creada.titulo}</b> quedó en su calendario{correos.length ? " y se enviaron las invitaciones" : ""}.</p>
          {creada.link ? (
            <div className="joined">
              <b>Enlace de Teams</b>
              <span className="mono">{creada.link}</span>
              <button type="button" className="btn sm" style={{ width: "fit-content" }} onClick={() => { void navigator.clipboard?.writeText(creada.link ?? ""); toast("Enlace copiado"); }}>
                {IC.link} Copiar enlace
              </button>
            </div>
          ) : f.teams ? (
            <p className="small muted">Microsoft aún no generó el enlace de Teams. Ábralo desde la reunión en unos segundos.</p>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="field">
            <label htmlFor="nr-t">Título</label>
            <input className="inp" id="nr-t" value={f.titulo} maxLength={200} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Reunión con Coordinación Académica" autoFocus />
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="nr-d">Día</label>
              <input className="inp" id="nr-d" type="date" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} />
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="nr-h">Hora</label>
                <input className="inp" id="nr-h" type="time" step={900} value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="nr-m">Duración</label>
                <select className="inp" id="nr-m" value={f.min} onChange={(e) => setF({ ...f, min: Number(e.target.value) })}>
                  {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h 30` : `${m / 60} h`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {choca.length > 0 && (
            <p className="ag-aviso" role="status">
              Ya tiene {choca.length === 1 ? "una reunión" : `${choca.length} reuniones`} a esa hora: {choca.slice(0, 2).map((e) => `«${e.titulo}»`).join(", ")}. Puede crearla de todos modos.
            </p>
          )}
          <div className="field">
            <label htmlFor="nr-p">Participantes</label>
            <input className="inp" id="nr-p" value={f.para} onChange={(e) => setF({ ...f, para: e.target.value })} placeholder="correo@udes.edu.co, otro@udes.edu.co" />
            {malos.length > 0 && <span className="err">Correo no válido: {malos[0]}</span>}
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="nr-l">Lugar</label>
              <input className="inp" id="nr-l" value={f.lugar} maxLength={200} onChange={(e) => setF({ ...f, lugar: e.target.value })} placeholder="Sala de juntas, bloque A" />
            </div>
            <div className="field">
              <label htmlFor="nr-r">Recordatorio</label>
              <select className="inp" id="nr-r" value={f.recordatorio} onChange={(e) => setF({ ...f, recordatorio: e.target.value })}>
                <option value="">Sin recordatorio</option>
                <option value="5">5 minutos antes</option>
                <option value="15">15 minutos antes</option>
                <option value="30">30 minutos antes</option>
                <option value="60">1 hora antes</option>
                <option value="1440">1 día antes</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="nr-c">Descripción</label>
            <textarea className="inp" id="nr-c" rows={3} value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} style={{ padding: 10 }} />
          </div>
          <div className="setrow">
            <span>
              Crear reunión de Teams
              <small>Se genera el enlace para unirse</small>
            </span>
            <Tg on={f.teams} onChange={(v) => setF({ ...f, teams: v })} label="Crear reunión de Teams" />
          </div>
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      )}
    </Dialogo>
  );
}

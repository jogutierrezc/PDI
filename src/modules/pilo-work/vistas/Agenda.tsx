/* Mi agenda · semana de Microsoft 365, reuniones de Teams y avisos (dentro de la app y Web Push). */

import { useCallback, useEffect, useMemo, useState } from "react";
import { callFn } from "../api";
import { conectarMs, useMs } from "../ms";
import { guardarPrefs, leerPrefs, pushDisponible } from "../push";
import { IC, MOOD, Tg, useEntra, useWork } from "../ui";

interface Ev {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  teams: boolean;
  joinUrl: string | null;
}
const p2 = (n: number) => String(n).padStart(2, "0");
const fecha = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie"];

export function Agenda() {
  const { perfil, toast, avisosApp, setAvisosApp, aviso } = useWork();
  const ms = useMs();
  const lunes = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + (dow === 0 || dow === 6 ? 7 : 0));
    return d;
  }, []);
  const dias = DIAS.map((n, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return { n, d, s: fecha(d), rotulo: `${n} ${d.getDate()}` };
  });
  const [evs, setEvs] = useState<Ev[]>([]);
  const [error, setError] = useState("");
  const [f, setF] = useState({ titulo: "", dia: dias[Math.min(4, Math.max(0, (new Date().getDay() || 7) - 1))].s, hora: "09:00", min: 45, para: "", teams: true });
  const [libres, setLibres] = useState<string[]>([]);
  const [creada, setCreada] = useState<{ link: string | null } | null>(null);
  const [segundoPlano, setSegundoPlano] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const raiz = useEntra(".wk,.ev", evs.length, 8);

  const cargar = useCallback(async () => {
    try {
      const r = await callFn<{ eventos: Ev[] }>("pw-microsoft", { action: "agenda_semana", desde: `${dias[0].s}T00:00:00`, hasta: `${dias[4].s}T23:59:59` });
      setEvs(r.eventos);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la agenda.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la semana no cambia mientras la vista está abierta
  }, []);
  useEffect(() => {
    if (ms.agendaListo) void cargar();
  }, [ms.agendaListo, cargar]);
  useEffect(() => {
    void leerPrefs().then((p) => setSegundoPlano(p.segundoPlano));
  }, []);

  const crear = async () => {
    if (!f.titulo.trim()) return toast("Escriba el título de la reunión");
    const ini = new Date(`${f.dia}T${f.hora}:00`);
    const fin = new Date(ini.getTime() + f.min * 60000);
    const local = (d: Date) => `${fecha(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`;
    setOcupado(true);
    try {
      const r = await callFn<{ joinUrl: string | null }>("pw-microsoft", { action: "agenda_crear", titulo: f.titulo, inicio: local(ini), fin: local(fin), asistentes: f.para.split(/[,;\s]+/).filter((x) => x.includes("@")), teams: f.teams });
      setCreada({ link: r.joinUrl });
      toast(f.teams ? "Reunión de Teams creada" : "Evento creado en su calendario");
      setF({ ...f, titulo: "" });
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo crear.");
    }
    setOcupado(false);
  };
  const proponer = async () => {
    try {
      const r = await callFn<{ horarios: string[] }>("pw-microsoft", { action: "agenda_libres", desde: `${fecha(new Date())}T00:00:00`, hasta: `${dias[4].s}T23:59:59`, minutos: f.min });
      setLibres(r.horarios);
      if (!r.horarios.length) toast("No hay horarios libres esta semana");
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
    aviso({ t: "Así le avisará Pilo", b: "Revisión de cifras · empieza en 10 minutos", ir: "agenda" });
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
          <p className="muted">Pilo verá sus reuniones, creará reuniones de Teams y le avisará antes de cada una. Nada se borra sin su permiso.</p>
          <ul className="flat">
            <li className="item"><span className="ico">{IC.cal}</span><div><b>Leer y escribir su calendario</b><p>Calendars.ReadWrite · propone horarios libres</p></div><span className="badge ok">Incluido</span></li>
            <li className="item"><span className="ico">{IC.team}</span><div><b>Crear reuniones de Teams</b><p>OnlineMeetings.ReadWrite · genera el enlace de la reunión</p></div><span className="badge ok">Incluido</span></li>
            <li className="item"><span className="ico">{IC.mail}</span><div><b>Invitaciones</b><p>Se envían desde su calendario, a las personas que usted escriba</p></div><span className="badge">Con su aprobación</span></li>
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

  const hoy = fecha(new Date());
  return (
    <div className="agd" ref={raiz}>
      <div className="agd__m">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h2 className="h2" style={{ fontSize: 17 }}>
            Semana del {dias[0].d.getDate()} al {dias[4].d.getDate()} de {dias[4].d.toLocaleDateString("es-CO", { month: "long" })}
          </h2>
          <span className="badge ok">Sincronizada con Outlook</span>
          <span className="badge blue">Teams</span>
          <button type="button" className="btn sm" onClick={() => void cargar()}>
            Actualizar
          </button>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="wk" role="grid" aria-label="Agenda de la semana">
          <div className="wk__h" />
          {dias.map((d) => (
            <div key={d.s} className={`wk__h${d.s === hoy ? " today" : ""}`}>
              {d.rotulo}
            </div>
          ))}
          <div className="hrs">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i}>{p2(8 + i)}:00</span>
            ))}
          </div>
          {dias.map((d) => (
            <div key={d.s} className={`dcol${d.s === hoy ? " today" : ""}`}>
              {d.s === hoy && <div className="now" style={{ top: Math.max(0, (new Date().getHours() + new Date().getMinutes() / 60 - 8) * 48) }} />}
              {evs
                .filter((e) => e.inicio.slice(0, 10) === d.s)
                .map((e) => {
                  const h = (s: string) => Number(s.slice(11, 13)) + Number(s.slice(14, 16)) / 60;
                  const top = (h(e.inicio) - 8) * 48;
                  const alto = Math.max(24, (h(e.fin) - h(e.inicio)) * 48 - 2);
                  return (
                    <div key={e.id} className={`ev${e.teams ? " teams" : ""}`} style={{ top, height: alto }} title={e.titulo}>
                      {e.titulo}
                      <small>
                        {e.inicio.slice(11, 16)}
                        {e.teams ? " · Teams" : ""}
                      </small>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
      <aside className="agd__r" aria-label="Acciones de la agenda">
        <section>
          <h3>Nueva reunión</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <div className="field">
              <label htmlFor="ag-t">Título</label>
              <input className="inp" id="ag-t" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Reunión con Coordinación Académica" />
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="ag-d">Día</label>
                <select className="inp" id="ag-d" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })}>
                  {dias.map((d) => (
                    <option key={d.s} value={d.s}>
                      {d.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ag-h">Hora</label>
                <input className="inp" id="ag-h" type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="ag-dur">Duración</label>
                <select className="inp" id="ag-dur" value={f.min} onChange={(e) => setF({ ...f, min: Number(e.target.value) })}>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 hora</option>
                  <option value={90}>1 h 30</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="ag-p">Participantes</label>
                <input className="inp" id="ag-p" value={f.para} onChange={(e) => setF({ ...f, para: e.target.value })} placeholder="correo@udes.edu.co" />
              </div>
            </div>
            <label className="chk">
              <input type="checkbox" checked={f.teams} onChange={(e) => setF({ ...f, teams: e.target.checked })} />
              <span>Crear reunión virtual de Teams</span>
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn primary" disabled={ocupado} onClick={() => void crear()}>
                Crear y enviar invitaciones
              </button>
              <button type="button" className="btn" onClick={() => void proponer()}>
                Proponer horarios libres
              </button>
            </div>
          </div>
          {libres.length > 0 && (
            <div className="propose" style={{ marginTop: 10 }}>
              <b>Horarios libres esta semana</b>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {libres.map((h) => (
                  <button key={h} type="button" className="tag" onClick={() => setF({ ...f, dia: h.slice(0, 10), hora: h.slice(11, 16) })}>
                    {new Date(`${h}`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric" })} {h.slice(11, 16)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {creada?.link && (
            <div className="joined" style={{ marginTop: 10 }}>
              <b>Reunión de Teams creada</b>
              <span className="mono">{creada.link}</span>
              <button
                type="button"
                className="btn sm"
                style={{ width: "fit-content" }}
                onClick={() => {
                  void navigator.clipboard?.writeText(creada.link ?? "");
                  toast("Enlace copiado");
                }}
              >
                Copiar enlace
              </button>
              <p className="hint">Invitaciones enviadas desde su calendario.</p>
            </div>
          )}
        </section>
        <section>
          <h3>Avisos de Pilo</h3>
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
    </div>
  );
}

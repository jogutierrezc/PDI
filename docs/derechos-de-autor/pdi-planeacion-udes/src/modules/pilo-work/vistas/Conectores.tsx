/* Conectores · Microsoft 365 (correo y agenda) y lo demás, cada uno con su propio permiso. */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { callFn } from "../api";
import { conectarMs, useMs } from "../ms";
import type { Servicio } from "../ms";
import { IC, MOOD, useEntra, useWork } from "../ui";

export function Conectores() {
  const { ir, toast } = useWork();
  const ms = useMs();
  const raiz = useEntra(".item", ms.cargando, 8);
  const [ocupado, setOcupado] = useState(false);
  const conectar = async (s: Servicio[]) => {
    setOcupado(true);
    try {
      await conectarMs(s);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo abrir Microsoft.");
      setOcupado(false);
    }
  };
  const desconectar = async () => {
    await callFn("pw-microsoft", { action: "desconectar" });
    toast("Microsoft 365 desconectado");
    await ms.recargar();
  };
  const L: { t: string; d: string; ic: React.ReactNode; estado: string; ir?: string }[] = [
    { t: "Microsoft 365 · Correo", d: "Leer, organizar y dejar borradores. Nunca envía ni borra.", ic: IC.mail, estado: ms.correoListo ? "Conectado" : ms.correoPermitido ? "Sin conectar" : "Su rol no lo incluye", ir: "correo" },
    { t: "Microsoft 365 · Calendario", d: "Ver su semana, proponer horarios y crear reuniones de Teams.", ic: IC.cal, estado: ms.agendaListo ? "Conectado" : "Sin conectar", ir: "agenda" },
    { t: "Datos en este equipo", d: "Excel y CSV que se leen en este equipo, nunca en la nube.", ic: IC.data, estado: "Siempre disponible", ir: "datos" },
    { t: "Microsoft 365 · Archivos", d: "OneDrive y SharePoint: explorar, abrir en Cowork y guardar. Sin borrar ni mover.", ic: IC.cloud, estado: ms.archivosListo ? "Conectado" : "Sin conectar", ir: "archivos" },
    { t: "Génesis · cifras", d: "Datos académicos, solo agregados.", ic: IC.data, estado: "En estudio" },
    { t: "Moodle", d: "Pertenece a Pilo Enseñanza; no se usa aquí.", ic: IC.plug, estado: "No aplica" },
  ];
  return (
    <div className="pad" style={{ maxWidth: 860, margin: "0 auto" }} ref={raiz}>
      <div className="box">
        <h2>Conectores</h2>
        <p className="muted">Cada conector pide su propio permiso. Los datos locales nunca pasan por un conector.</p>
        {!ms.configurado && <p className="err">Microsoft 365 aún no está configurado por TIC (registro de la app en Entra). Los demás conectores funcionan.</p>}
        {ms.error && ms.configurado && <p className="err">{ms.error}</p>}
        {ms.conectado && (
          <div className="joined">
            <b>Conectado como {ms.cuenta}</b>
            <p className="hint">Permisos: {ms.scopes.split(" ").filter((s) => !/openid|profile|email/.test(s)).join(" · ")}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!ms.correoListo && ms.correoPermitido && (
                <button type="button" className="btn sm" disabled={ocupado} onClick={() => void conectar(["correo", "agenda"])}>
                  Añadir correo
                </button>
              )}
              {!ms.archivosListo && (
                <button type="button" className="btn sm primary" disabled={ocupado} onClick={() => void conectar(["archivos"])}>
                  Conectar archivos
                </button>
              )}
              {!ms.agendaListo && (
                <button type="button" className="btn sm" disabled={ocupado} onClick={() => void conectar(ms.correoPermitido ? ["correo", "agenda"] : ["agenda"])}>
                  Añadir calendario
                </button>
              )}
              <button type="button" className="btn sm ghost" onClick={() => void desconectar()}>
                Desconectar
              </button>
            </div>
          </div>
        )}
        <div className="flat">
          {L.map((x) => (
            <div className="item" key={x.t}>
              <span className="ico">{x.ic}</span>
              <div>
                <b>{x.t}</b>
                <p>{x.d}</p>
              </div>
              <span>
                {x.ir ? (
                  <button type="button" className="btn sm" onClick={() => ir(x.ir!)}>
                    {x.estado}
                  </button>
                ) : (
                  <span className="badge">{x.estado}</span>
                )}
              </span>
            </div>
          ))}
        </div>
        {!ms.conectado && ms.configurado && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn navy" disabled={ocupado} onClick={() => void conectar(ms.correoPermitido ? ["correo", "agenda"] : ["agenda"])}>
              {ocupado ? "Abriendo Microsoft…" : "Conectar correo y agenda"}
            </button>
            <button type="button" className="btn" disabled={ocupado} onClick={() => void conectar(["archivos"])}>
              Conectar archivos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A donde vuelve Microsoft (MS_REDIRECT_URI = https://…/work/microsoft): canjea el código y vuelve a Conectores. */
export function MicrosoftRetorno() {
  const [p] = useSearchParams();
  const nav = useNavigate();
  const { toast } = useWork();
  const [msg, setMsg] = useState("Terminando la conexión con Microsoft…");
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    const code = p.get("code");
    const state = p.get("state");
    if (!code || !state) {
      setMsg(p.get("error_description") ?? "Microsoft no devolvió el permiso. Intente de nuevo desde Conectores.");
      return;
    }
    callFn<{ cuenta: string }>("pw-microsoft", { action: "canjear", code, state })
      .then((r) => {
        toast(`Microsoft 365 conectado: ${r.cuenta}`);
        nav("/work/conectores", { replace: true });
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : "No se pudo completar la conexión."));
  }, [p, nav, toast]);
  return (
    <div className="pad">
      <div className="box" style={{ maxWidth: 520, margin: "0 auto" }}>
        <div className="pilo-big" style={{ width: 96, height: 96 }}>
          <img src={MOOD.piensa} alt="" />
        </div>
        <h2>Microsoft 365</h2>
        <p className="muted" role="status">
          {msg}
        </p>
        <button type="button" className="btn" onClick={() => nav("/work/conectores")}>
          Volver a Conectores
        </button>
      </div>
    </div>
  );
}

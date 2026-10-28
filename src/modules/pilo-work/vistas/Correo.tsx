/* Correo · bandeja en solo lectura; organizar y borradores con aprobación; jamás enviar ni borrar. */

import { useCallback, useEffect, useState } from "react";
import { callFn, hace } from "../api";
import { conectarMs, useMs } from "../ms";
import { IC, MOOD, Tg, useEntra, useWork } from "../ui";

interface Msg {
  id: string;
  asunto: string;
  de: string;
  correo: string;
  fecha: string;
  vista: string;
  leido: boolean;
  categorias: string[];
}

export function Correo() {
  const { conCorreo, toast, setPedido, ir } = useWork();
  const ms = useMs();
  const [lista, setLista] = useState<Msg[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState("");
  const [deshacer, setDeshacer] = useState<unknown[] | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("pw-deshacer-correo") ?? "null");
    } catch {
      return null;
    }
  });
  const [organizar, setOrganizar] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const raiz = useEntra(".mail,.box > *", lista.length + Number(ms.cargando), 8);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setLista((await callFn<{ mensajes: Msg[] }>("pw-microsoft", { action: "correo_listar", top: 20 })).mensajes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la bandeja.");
    }
    setCargando(false);
  }, []);
  useEffect(() => {
    if (ms.correoListo) void cargar();
  }, [ms.correoListo, cargar]);

  if (!conCorreo)
    return (
      <div className="pad">
        <div className="box" style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2>Su rol no incluye el correo</h2>
          <p className="muted">El correo de Microsoft 365 lo activa la administración con el rol «Colaborador con correo». Pídalo si lo necesita.</p>
        </div>
      </div>
    );

  if (!ms.correoListo)
    return (
      <div className="pad">
        <div className="box" style={{ maxWidth: 640, margin: "0 auto" }}>
          <div className="pilo-big" style={{ width: 96, height: 96 }}>
            <img src={MOOD.idea} alt="" />
          </div>
          <h2>Conecte su correo de Microsoft 365</h2>
          <p className="muted">
            Pilo puede leer su bandeja, proponer etiquetas y carpetas, y dejar borradores. <b>Nunca envía ni borra</b> mensajes por usted.
          </p>
          <ul className="flat">
            <li className="item"><span className="ico">{IC.mail}</span><div><b>Leer su correo</b><p>Mail.Read · para entender y resumir</p></div><span className="badge ok">Incluido</span></li>
            <li className="item"><span className="ico">{IC.plug}</span><div><b>Organizar y dejar borradores</b><p>Mail.ReadWrite · usted aprueba cada cambio</p></div><Tg on={organizar} onChange={setOrganizar} label="Permitir organizar y borradores" /></li>
            <li className="item"><span className="ico" style={{ background: "var(--risk-soft)", color: "var(--risk)" }}>{IC.lock}</span><div><b>Enviar o borrar</b><p>Mail.Send no se solicita. No es posible.</p></div><span className="badge">Nunca</span></li>
          </ul>
          {!ms.configurado && <p className="err">Microsoft 365 aún no está configurado por TIC.</p>}
          {ms.error && ms.configurado && <p className="err">{ms.error}</p>}
          <button
            type="button"
            className="btn navy"
            disabled={ocupado || !ms.configurado}
            onClick={async () => {
              setOcupado(true);
              try {
                await conectarMs(["correo", "agenda"], organizar);
              } catch (e) {
                toast(e instanceof Error ? e.message : "No se pudo abrir Microsoft.");
                setOcupado(false);
              }
            }}
          >
            {ocupado ? "Esperando a Microsoft…" : "Conectar con Microsoft"}
          </button>
        </div>
      </div>
    );

  const aplicar = async () => {
    const c = cat.trim();
    if (!c || !sel.size) return toast("Elija mensajes y escriba la etiqueta.");
    try {
      const cambios = lista.filter((m) => sel.has(m.id)).map((m) => ({ id: m.id, categorias: [...new Set([...m.categorias, c])] }));
      const r = await callFn<{ deshacer: unknown[] }>("pw-microsoft", { action: "correo_organizar", cambios });
      setDeshacer(r.deshacer);
      try {
        sessionStorage.setItem("pw-deshacer-correo", JSON.stringify(r.deshacer));
      } catch {
        /* sin almacenamiento */
      }
      toast(`${r.deshacer.length} mensajes organizados`);
      setSel(new Set());
      setCat("");
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo organizar.");
    }
  };
  const deshacerTodo = async () => {
    if (!deshacer) return;
    try {
      await callFn("pw-microsoft", { action: "correo_deshacer", deshacer });
      setDeshacer(null);
      sessionStorage.removeItem("pw-deshacer-correo");
      toast("Se deshizo la organización");
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo deshacer.");
    }
  };

  return (
    <div className="pad" style={{ display: "grid", gap: 16 }} ref={raiz}>
      <div className="box">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2>Bandeja de entrada</h2>
          <span className="badge ok">Conectado · {ms.puedeOrganizar ? "lectura y organizar" : "solo lectura"}</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn sm primary"
            onClick={() => {
              setPedido("Revisa mi bandeja de entrada de hoy: resume lo que pide acción mía, y propón etiquetas para ordenarla (sin enviar nada).");
              ir("chat");
            }}
          >
            Pedirle a Pilo que la resuma y ordene
          </button>
          <button type="button" className="btn sm" onClick={() => void cargar()} disabled={cargando}>
            {cargando ? "Leyendo…" : "Actualizar"}
          </button>
          {deshacer && (
            <button type="button" className="btn sm" onClick={() => void deshacerTodo()}>
              Deshacer
            </button>
          )}
        </div>
        {ms.puedeOrganizar && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input className="inp" style={{ maxWidth: 260 }} value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Etiqueta (p. ej. Consejos)" aria-label="Etiqueta a aplicar" />
            <button type="button" className="btn sm" disabled={!sel.size} onClick={() => void aplicar()}>
              Etiquetar {sel.size || ""} seleccionado{sel.size === 1 ? "" : "s"}
            </button>
            <span className="hint">Cada cambio se puede deshacer.</span>
          </div>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <div>
          {lista.map((m) => (
            <div className="mail" key={m.id}>
              {ms.puedeOrganizar ? (
                <input
                  type="checkbox"
                  aria-label={`Seleccionar «${m.asunto}»`}
                  checked={sel.has(m.id)}
                  onChange={(e) =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(m.id);
                      else n.delete(m.id);
                      return n;
                    })
                  }
                />
              ) : (
                <span className="avatar" style={{ background: "var(--blue-soft)", color: "var(--blue-strong)" }}>
                  {m.de.charAt(0)}
                </span>
              )}
              <div>
                <b style={{ fontWeight: m.leido ? 600 : 800 }}>{m.asunto}</b>
                <p>
                  {m.de} · {hace(m.fecha)} · {m.vista}
                </p>
              </div>
              <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {m.categorias.map((c) => (
                  <span className="badge blue" key={c}>
                    {c}
                  </span>
                ))}
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setPedido(`Prepara un borrador de respuesta al mensaje «${m.asunto}» (de ${m.de}, id ${m.id}). Guárdalo con crear_borrador usando responder_a; no lo envíes.`);
                    ir("chat");
                  }}
                >
                  Borrador con Pilo
                </button>
              </span>
            </div>
          ))}
          {!lista.length && !cargando && !error && <p className="muted" style={{ padding: 12 }}>No hay mensajes para mostrar.</p>}
        </div>
      </div>
    </div>
  );
}

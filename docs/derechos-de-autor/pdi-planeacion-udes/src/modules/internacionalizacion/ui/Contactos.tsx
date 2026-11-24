/* =============================================================================
   Internacionalización · Contactos (0167): las invitaciones para que personas sin
   cuenta compartan contactos académicos o de empleadores.

   Aquí se prepara la carpeta «Contactos» (dos tablas Multicampus con las columnas de
   Rua), se crean y pausan los enlaces, se ve quién aportó cuánto y se exporta. Los
   contactos mismos se revisan y corrigen en Tablas, como cualquier otra tabla.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { FaltaMigracion, useActualizarInvitacion, useAportantes, useCrearInvitacion, useEstructura, useFilasContactos, useInvitaciones, usePrepararContactos } from "../datos";
import { controlaMulticampus } from "../lib/permisos";
import type { IntInvitacionRow } from "../tipos";
import { AvisoMigracion, Cargando, ErrorCaja, fmt, nombreCampus, useAviso } from "./comunes";
import type { Ctx } from "./comunes";
import { ExportarContactos } from "./ExportarContactos";
import { fechaCorta } from "./logica";
import "./carpetas.css";
import "./contactos-admin.css";

type Tipos = "ambos" | "academico" | "empleador";

const TIPOS: Record<Tipos, IntInvitacionRow["tipos"]> = { ambos: ["academico", "empleador"], academico: ["academico"], empleador: ["empleador"] };
const tiposDe = (t: IntInvitacionRow["tipos"]): Tipos => (t.length === 2 ? "ambos" : t[0] === "academico" ? "academico" : "empleador");

const enlaceDe = (token: string) => `${window.location.origin}/contactos/i/${token}`;
const hoy = () => new Date().toISOString().slice(0, 10);
const en30 = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

/** Cómo está una invitación hoy, para la lista. */
function estadoDe(i: IntInvitacionRow, periodoAbierto: boolean): { clave: "activa" | "pausada" | "vencida" | "periodo"; texto: string } {
  if (i.estado === "pausada") return { clave: "pausada", texto: "En pausa" };
  if (i.vence < hoy()) return { clave: "vencida", texto: "Vencida" };
  if (!periodoAbierto) return { clave: "periodo", texto: "Periodo cerrado" };
  const dias = Math.round((new Date(`${i.vence}T12:00:00`).getTime() - Date.now()) / 86_400_000);
  return { clave: "activa", texto: dias <= 7 ? `Vence en ${Math.max(dias, 0)} ${dias === 1 ? "día" : "días"}` : "Activa" };
}

export function Contactos({ ctx }: { ctx: Ctx }) {
  const estructura = useEstructura();
  const invitaciones = useInvitaciones();
  const aportantes = useAportantes();
  const preparar = usePrepararContactos();
  const aviso = useAviso();
  const [elegida, setElegida] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [exportar, setExportar] = useState(false);

  const libros = useMemo(() => (estructura.data ?? []).filter((l) => l.plantilla_contactos), [estructura.data]);
  const listas = libros.length === 2;
  const hojaAc = libros.find((l) => l.plantilla_contactos === "academica")?.hojas[0]?.id;
  const hojaEm = libros.find((l) => l.plantilla_contactos === "empleadores")?.hojas[0]?.id;
  const filasAc = useFilasContactos(hojaAc, null, listas);
  const filasEm = useFilasContactos(hojaEm, null, listas);
  const controla = controlaMulticampus(ctx.yo);

  const lista = invitaciones.data ?? [];
  const actual = lista.find((i) => i.id === elegida) ?? lista[0] ?? null;
  const periodoAbierto = (id: string) => ctx.periodos.find((p) => p.id === id)?.estado === "abierto";

  /** Contactos por persona que aportó. */
  const porPersona = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of [...(filasAc.data ?? []), ...(filasEm.data ?? [])]) if (f.aportante_id) m.set(f.aportante_id, (m.get(f.aportante_id) ?? 0) + 1);
    return m;
  }, [filasAc.data, filasEm.data]);
  const resumen = (i: IntInvitacionRow) => {
    const gente = (aportantes.data ?? []).filter((a) => a.invitacion_id === i.id);
    return { personas: gente.length, contactos: gente.reduce((n, a) => n + (porPersona.get(a.id) ?? 0), 0), gente };
  };

  const error = estructura.error ?? invitaciones.error;
  if (error instanceof FaltaMigracion) return <AvisoMigracion error={error} />;
  if (error) return <ErrorCaja error={error} />;
  if (!estructura.data || !invitaciones.data) return <Cargando texto="Abriendo Contactos…" />;

  const carpeta = libros[0]?.carpeta_id;

  return (
    <div className="it-ct">
      {!listas ? (
        <section className="it-ct-banner" aria-label="Preparar la carpeta">
          <div>
            <b>Todavía no está lista la carpeta «Contactos»</b>
            <p>Se crean dos tablas Multicampus —académicos y empleadores— con las columnas de las plantillas de Rua. Es un paso de una sola vez.</p>
            {!controla && <p className="it-ayuda">La preparan el Director, Planeación o el Coordinador de Bucaramanga.</p>}
          </div>
          {controla && (
            <button
              type="button"
              className="es-btn es-btn--pri"
              disabled={preparar.isPending}
              onClick={() => preparar.mutate(undefined, { onSuccess: () => aviso.ok("Carpeta «Contactos» lista."), onError: (e) => aviso.mal(e) })}
            >
              {preparar.isPending ? "Preparando…" : "Preparar la carpeta"}
            </button>
          )}
        </section>
      ) : (
        <div className="it-ct-atajos">
          <Link className="es-btn" to={ctx.enlace("tablas", { carpeta: carpeta ?? undefined })}>
            <Icon name="folder" size={16} />
            Abrir la carpeta Contactos
          </Link>
          <button type="button" className="es-btn" onClick={() => setExportar(true)}>
            <Icon name="download" size={16} />
            Exportar
          </button>
          <button type="button" className="es-btn es-btn--pri" onClick={() => setNueva(true)}>
            <Icon name="plus" size={16} />
            Nueva invitación
          </button>
        </div>
      )}

      {listas && (
        <div className="it-ct-cols">
          <section className="it-ct-lista" aria-label="Invitaciones">
            {lista.length === 0 && <p className="it-ayuda">Todavía no hay invitaciones. Cree la primera con «Nueva invitación».</p>}
            {lista.map((i) => {
              const e = estadoDe(i, periodoAbierto(i.periodo_id));
              const r = resumen(i);
              return (
                <button key={i.id} type="button" className="it-ct-inv" aria-pressed={actual?.id === i.id && !nueva} onClick={() => { setElegida(i.id); setNueva(false); }}>
                  <span className="it-ct-inv__cab">
                    <b>{i.nombre}</b>
                    <span className={`it-ct-chip is-${e.clave}`}>{e.texto}</span>
                  </span>
                  <span className="it-ct-inv__pie">
                    <b>{fmt(r.personas)}</b> {r.personas === 1 ? "persona aportó" : "personas aportaron"} · <b>{fmt(r.contactos)}</b> contactos · {i.campus_id ? nombreCampus(ctx.campus, i.campus_id) : "campus a elegir"} · vence el {fechaCorta(i.vence)}
                  </span>
                </button>
              );
            })}
          </section>

          {nueva ? (
            <NuevaInvitacion ctx={ctx} onCerrar={() => setNueva(false)} onCreada={(id) => { setElegida(id); setNueva(false); aviso.ok("Invitación creada. Copie el enlace y compártalo."); }} aviso={aviso} />
          ) : actual ? (
            <Detalle ctx={ctx} inv={actual} gente={resumen(actual).gente} porPersona={porPersona} aviso={aviso} />
          ) : null}
        </div>
      )}

      {exportar && <ExportarContactos ctx={ctx} libros={libros} onCerrar={() => setExportar(false)} />}
      {aviso.nodo}
    </div>
  );
}

/* ---------- El detalle de una invitación ------------------------------------------------- */

function Detalle({ ctx, inv, gente, porPersona, aviso }: { ctx: Ctx; inv: IntInvitacionRow; gente: ReturnType<typeof useAportantes>["data"] & object; porPersona: Map<string, number>; aviso: ReturnType<typeof useAviso> }) {
  const actualizar = useActualizarInvitacion();
  const [vence, setVence] = useState(inv.vence);
  const [limite, setLimite] = useState(String(inv.limite_por_persona));
  const [dominios, setDominios] = useState(inv.dominios.join(", "));
  const [tipos, setTipos] = useState<Tipos>(tiposDe(inv.tipos));
  useEffect(() => {
    setVence(inv.vence);
    setLimite(String(inv.limite_por_persona));
    setDominios(inv.dominios.join(", "));
    setTipos(tiposDe(inv.tipos));
  }, [inv.id, inv.vence, inv.limite_por_persona, inv.dominios, inv.tipos]);

  const enlace = enlaceDe(inv.token);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      aviso.ok("Enlace copiado.");
    } catch {
      aviso.ok(`Copie el enlace: ${enlace}`);
    }
  };
  const cambios = vence !== inv.vence || Number(limite) !== inv.limite_por_persona || tipos !== tiposDe(inv.tipos) || dominios !== inv.dominios.join(", ");
  const guardar = () => {
    const doms = dominios.split(/[,\s;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
    actualizar.mutate(
      { id: inv.id, vence, limite_por_persona: Math.max(1, Math.min(2000, Number(limite) || 200)), tipos: TIPOS[tipos], dominios: doms },
      { onSuccess: () => aviso.ok("Invitación actualizada."), onError: (e) => aviso.mal(e) },
    );
  };

  return (
    <section className="it-ct-detalle" aria-label={inv.nombre}>
      <h2>{inv.nombre}</h2>
      <div>
        <span className="it-ct-lab">Enlace para compartir</span>
        <div className="it-ct-enlace">
          <input readOnly value={enlace} aria-label="Enlace de la invitación" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="es-btn es-btn--pri" onClick={() => void copiar()}>
            <Icon name="link" size={16} />
            Copiar
          </button>
        </div>
        <p className="it-ayuda">Quien lo abra queda asociado {inv.campus_id ? `al campus ${nombreCampus(ctx.campus, inv.campus_id)}` : "al campus que elija"} y al periodo {ctx.periodos.find((p) => p.id === inv.periodo_id)?.codigo ?? ""}.</p>
      </div>
      <div className="it-nuevo__fila">
        <label className="it-campo">
          <span>Vence</span>
          <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </label>
        <label className="it-campo">
          <span>Máximo por persona</span>
          <input type="number" min={1} max={2000} value={limite} onChange={(e) => setLimite(e.target.value)} />
        </label>
        <label className="it-campo">
          <span>Correos permitidos</span>
          <input type="text" value={dominios} onChange={(e) => setDominios(e.target.value)} placeholder="udes.edu.co" />
        </label>
        <label className="it-campo">
          <span>Pueden aportar</span>
          <select value={tipos} onChange={(e) => setTipos(e.target.value as Tipos)}>
            <option value="ambos">Académicos y empleadores</option>
            <option value="academico">Solo académicos</option>
            <option value="empleador">Solo empleadores</option>
          </select>
        </label>
      </div>
      <div className="it-ct-quien">
        <span className="it-ct-lab">Quién ha aportado</span>
        {gente.length === 0 ? (
          <p className="it-ayuda">Nadie ha usado el enlace todavía.</p>
        ) : (
          <ul>
            {gente.map((a) => (
              <li key={a.id}>
                <span>
                  <b>{a.nombre}</b> · {a.cargo}
                  <small>
                    {a.correo} · {nombreCampus(ctx.campus, a.campus_id)}
                    {a.correo_verificado ? "" : " · correo sin verificar"}
                  </small>
                </span>
                <span className="it-num">
                  {fmt(porPersona.get(a.id) ?? 0)}
                  {a.ultimo_envio ? ` · ${fechaCorta(a.ultimo_envio.slice(0, 10))}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="it-ct-pie">
        <button
          type="button"
          className="es-btn"
          disabled={actualizar.isPending}
          onClick={() => actualizar.mutate({ id: inv.id, estado: inv.estado === "activa" ? "pausada" : "activa" }, { onSuccess: () => aviso.ok(inv.estado === "activa" ? "Enlace en pausa." : "Enlace reactivado."), onError: (e) => aviso.mal(e) })}
        >
          {inv.estado === "activa" ? "Pausar enlace" : "Reactivar enlace"}
        </button>
        <button type="button" className="es-btn es-btn--pri" disabled={!cambios || actualizar.isPending} onClick={guardar}>
          Guardar cambios
        </button>
      </div>
    </section>
  );
}

/* ---------- Una invitación nueva ----------------------------------------------------------- */

function NuevaInvitacion({ ctx, onCerrar, onCreada, aviso }: { ctx: Ctx; onCerrar: () => void; onCreada: (id: string) => void; aviso: ReturnType<typeof useAviso> }) {
  const crear = useCrearInvitacion();
  const invitaciones = useInvitaciones();
  const abiertos = ctx.periodos.filter((p) => p.estado === "abierto");
  const [periodo, setPeriodo] = useState(ctx.periodo?.id ?? abiertos[0]?.id ?? "");
  const [campus, setCampus] = useState("");
  const [nombre, setNombre] = useState("");
  const [vence, setVence] = useState(en30());
  const [tipos, setTipos] = useState<Tipos>("ambos");
  const [limite, setLimite] = useState("200");
  const [dominios, setDominios] = useState("udes.edu.co");
  const [error, setError] = useState<string | null>(null);
  const codigo = ctx.periodos.find((p) => p.id === periodo)?.codigo ?? "";
  const nombreSugerido = `Contactos ${codigo}${campus ? ` · ${nombreCampus(ctx.campus, campus)}` : ""}`;

  const enviar = () => {
    setError(null);
    if (!periodo) return setError("Elija el periodo.");
    if (vence < hoy()) return setError("El vencimiento no puede ser una fecha pasada.");
    const doms = dominios.split(/[,\s;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
    crear.mutate(
      { nombre: (nombre.trim() || nombreSugerido).slice(0, 120), periodo_id: periodo, campus_id: campus || null, vence, tipos: TIPOS[tipos], limite_por_persona: Math.max(1, Math.min(2000, Number(limite) || 200)), dominios: doms },
      {
        onSuccess: async (token) => {
          const r = await invitaciones.refetch();
          const id = r.data?.find((i) => i.token === token)?.id;
          if (id) onCreada(id);
          else onCerrar();
        },
        onError: (e) => {
          setError(e.message);
          aviso.mal(e);
        },
      },
    );
  };

  return (
    <section className="it-ct-detalle" aria-label="Nueva invitación">
      <h2>Nueva invitación</h2>
      <div className="it-nuevo__fila">
        <label className="it-campo">
          <span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={nombreSugerido} maxLength={120} />
        </label>
        <label className="it-campo">
          <span>Periodo</span>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {abiertos.length === 0 && <option value="">No hay periodos abiertos</option>}
            {abiertos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo}
              </option>
            ))}
          </select>
        </label>
        <label className="it-campo">
          <span>Campus</span>
          <select value={campus} onChange={(e) => setCampus(e.target.value)}>
            <option value="">Que cada persona elija su campus</option>
            {ctx.campus.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="it-campo">
          <span>Vence</span>
          <input type="date" value={vence} min={hoy()} onChange={(e) => setVence(e.target.value)} />
        </label>
        <label className="it-campo">
          <span>Pueden aportar</span>
          <select value={tipos} onChange={(e) => setTipos(e.target.value as Tipos)}>
            <option value="ambos">Académicos y empleadores</option>
            <option value="academico">Solo académicos</option>
            <option value="empleador">Solo empleadores</option>
          </select>
        </label>
        <label className="it-campo">
          <span>Máximo por persona</span>
          <input type="number" min={1} max={2000} value={limite} onChange={(e) => setLimite(e.target.value)} />
        </label>
        <label className="it-campo it-ct-ancho">
          <span>Correos permitidos</span>
          <input value={dominios} onChange={(e) => setDominios(e.target.value)} placeholder="udes.edu.co" />
        </label>
      </div>
      <p className="it-ayuda">La persona se identifica con nombre, cargo y correo institucional. El correo no se confirma por mensaje: se comprueba que sea de alguno de los dominios permitidos.</p>
      {error && (
        <p className="it-error" role="alert">
          {error}
        </p>
      )}
      <div className="it-ct-pie">
        <button type="button" className="es-btn" onClick={onCerrar}>
          Cancelar
        </button>
        <button type="button" className="es-btn es-btn--pri" disabled={crear.isPending || !periodo} onClick={enviar}>
          {crear.isPending ? "Creando…" : "Crear invitación"}
        </button>
      </div>
    </section>
  );
}

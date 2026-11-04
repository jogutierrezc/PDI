/* =============================================================================
   Relaciones · envío masivo. El envío se guarda en la base (rel_envios y su
   lista de destinatarios) y la función rel-correos lo despacha en lotes de 20 por
   minuto. Esta pantalla solo pide el siguiente lote y espera lo que la función
   diga: si se cierra la pestaña no se pierde nada, y se reanuda desde la lista
   «Envíos recientes». Sin animaciones aquí: es una pantalla de trabajo.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../lib/auth";
import { asuntoDe } from "../../../../supabase/functions/rel-correos/plantilla";
import { Confirmar } from "../ui/comunes";
import { destinatarioDe } from "./PlantillasCorreo";
import { enviarLote, enviarPrueba, useCancelarEnvio, useCrearEnvio, useEnviosRel } from "./datos";
import type { ContactoRel, EnvioRel, PlantillaRel } from "./datos";

const REMITENTE = "Relaciones Internacionales UDES <relaciones.internacionales@udes.edu.co>";
const POR_MINUTO = 20;
const dormir = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export function EnvioMasivo({ contactos, elegidos, plantillas, plantillaId, onPlantilla }: { contactos: ContactoRel[]; elegidos: ContactoRel[]; plantillas: PlantillaRel[]; plantillaId: string | null; onPlantilla: (id: string) => void }) {
  const { profile } = useAuth();
  const envios = useEnviosRel();
  const crear = useCrearEnvio();
  const cancelar = useCancelarEnvio();
  const [omitir, setOmitir] = useState(true);
  const [remitente, setRemitente] = useState(REMITENTE);
  const [destino, setDestino] = useState<"mailpit" | "smtp">("mailpit");
  const [confirmando, setConfirmando] = useState(false);
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ total: number; enviados: number; fallidos: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const parar = useRef(false);
  const lineas = useRef<HTMLDivElement>(null);

  const plantilla = plantillas.find((p) => p.id === plantillaId) ?? plantillas[0] ?? null;
  const dest = destinatarioDe(elegidos[0] ?? contactos[0] ?? null);

  useEffect(() => () => void (parar.current = true), []);
  useEffect(() => {
    lineas.current?.scrollTo({ top: lineas.current.scrollHeight });
  }, [log]);

  const plan = useMemo(() => {
    const vistos = new Set<string>();
    const enviar: ContactoRel[] = [];
    let omitidos = 0;
    let repetidos = 0;
    let baja = 0;
    for (const c of elegidos) {
      if (c.baja) {
        baja++;
        continue;
      }
      if (!c.correo || vistos.has(c.correo)) {
        repetidos++;
        continue;
      }
      vistos.add(c.correo);
      // «No verificable» sí sale: el servidor no contesta, pero el buzón puede existir.
      if (omitir && !(c.correo_estado === "ok" || c.correo_estado === "nv")) {
        omitidos++;
        continue;
      }
      enviar.push(c);
    }
    return { enviar, omitidos, repetidos, baja };
  }, [elegidos, omitir]);

  const real = destino === "smtp";
  const minutos = real ? Math.max(1, Math.ceil(plan.enviar.length / POR_MINUTO)) : 1;
  const anotar = (t: string) => setLog((l) => [...l.slice(-199), t]);

  /** Pide un lote tras otro hasta que no queden pendientes. Se detiene al salir de la pantalla. */
  const correr = async (id: string, inicial: { total: number; enviados: number; fallidos: number }) => {
    parar.current = false;
    setCorriendo(id);
    let p = inicial;
    setProgreso(p);
    try {
      for (;;) {
        const r = await enviarLote(id);
        if (parar.current) return;
        if (r.enviados || r.fallidos) {
          p = { total: p.total, enviados: p.enviados + r.enviados, fallidos: p.fallidos + r.fallidos };
          setProgreso(p);
          anotar(`${p.enviados + p.fallidos}/${p.total}  ${r.enviados} enviados${r.fallidos ? `, ${r.fallidos} fallaron` : ""}`);
        }
        if (r.error) return anotar(`Se detuvo: ${r.error} Puede reanudar el envío cuando se corrija.`);
        if (r.estado !== "activo" || r.pendientes === 0) return anotar(r.estado === "cancelado" ? "El envío se canceló." : `Listo: ${p.enviados} enviados${p.fallidos ? `, ${p.fallidos} con fallo` : ""}.`);
        if (r.espera > 0) {
          anotar(`Pausa de ${r.espera} s para respetar el ritmo de ${POR_MINUTO} por minuto…`);
          for (let s = 0; s < r.espera && !parar.current; s++) await dormir(1000);
        }
        if (parar.current) return;
      }
    } catch (e) {
      anotar(`Se detuvo: ${e instanceof Error ? e.message : "error desconocido"}`);
    } finally {
      setCorriendo(null);
      void envios.refetch();
    }
  };

  const arrancar = () => {
    if (!plantilla || !plan.enviar.length) return;
    setConfirmando(false);
    setLog([]);
    crear.mutate(
      { plantilla: { nombre: plantilla.nombre, asunto: plantilla.asunto, cuerpo: plantilla.cuerpo, usa_actividad: plantilla.usa_actividad, actividad: plantilla.actividad }, remitente: remitente.trim(), destino, destinos: plan.enviar.map((c) => ({ fila_id: c.id, correo: c.correo, nombre: c.nombre })) },
      {
        onSuccess: (id) => {
          anotar(`Envío creado: ${plan.enviar.length} destinatarios a ${real ? "SMTP institucional" : "Mailpit"}.`);
          void correr(id, { total: plan.enviar.length, enviados: 0, fallidos: 0 });
        },
        onError: (e) => anotar(`No se pudo crear el envío: ${e.message}`),
      },
    );
  };

  const prueba = async () => {
    if (!plantilla || !profile?.email) return;
    anotar("Enviando prueba…");
    try {
      await enviarPrueba({ plantilla, destino, para: profile.email, remitente: remitente.trim(), fila_id: elegidos[0]?.id });
      anotar(real ? `[prueba] Mensaje enviado a ${profile.email}.` : `[prueba] Mensaje «${asuntoDe(plantilla, dest)}» entregado a Mailpit.`);
    } catch (e) {
      anotar(`[prueba] ${e instanceof Error ? e.message : "No salió."}`);
    }
  };

  const remitenteOk = /^[^<>]*<?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(remitente.trim());
  const puede = Boolean(plantilla) && plan.enviar.length > 0 && remitenteOk && !corriendo && !crear.isPending;
  const pct = progreso && progreso.total ? Math.round(((progreso.enviados + progreso.fallidos) / progreso.total) * 100) : 0;
  const pendientes = (envios.data ?? []).filter((e) => e.estado === "activo" && e.id !== corriendo);

  return (
    <div className="rel-envio">
      <div className="rel-pasos">
        <div className={`rel-paso${plan.enviar.length ? " is-hecho" : ""}`}>
          <span className="rel-num">1</span>
          <div>
            <h4>Destinatarios</h4>
            <p className="rel-sub">{elegidos.length ? `${elegidos.length} contactos seleccionados, ${plan.enviar.length} recibirán el correo.` : "Seleccione contactos en el Directorio."}</p>
            <label className="rel-check">
              <input type="checkbox" checked={omitir} onChange={(e) => setOmitir(e.target.checked)} />
              Omitir correos sin validar, con dominio sin servidor o rechazados
            </label>
          </div>
        </div>
        <div className={`rel-paso${plantilla ? " is-hecho" : ""}`}>
          <span className="rel-num">2</span>
          <div>
            <h4>Plantilla</h4>
            <select value={plantilla?.id ?? ""} onChange={(e) => onPlantilla(e.target.value)} aria-label="Plantilla">
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {plantilla ? <p className="rel-sub">Asunto: {asuntoDe(plantilla, dest)}</p> : null}
          </div>
        </div>
        <div className={`rel-paso${remitenteOk ? " is-hecho" : ""}`}>
          <span className="rel-num">3</span>
          <div>
            <h4>Remitente y destino</h4>
            <label className="it-campo" htmlFor="rel-e-rem">
              <span>Remitente</span>
              <input id="rel-e-rem" type="text" value={remitente} onChange={(e) => setRemitente(e.target.value)} aria-invalid={!remitenteOk} />
            </label>
            <label className="it-campo" htmlFor="rel-e-dest">
              <span>Servidor de salida</span>
              <select id="rel-e-dest" value={destino} onChange={(e) => setDestino(e.target.value as "mailpit" | "smtp")}>
                <option value="mailpit">Mailpit (pruebas, no sale a nadie)</option>
                <option value="smtp">SMTP institucional (envío real)</option>
              </select>
            </label>
            <p className="rel-sub">{real ? "Envío real con el servidor guardado en Sistema › Correos. Revise antes en Mailpit." : "Todo queda en la bandeja de Mailpit. Nadie recibe nada."}</p>
          </div>
        </div>
        <div className="rel-paso">
          <span className="rel-num">4</span>
          <div>
            <h4>Enviar</h4>
            {confirmando ? (
              <Confirmar
                pregunta={`¿Enviar ${plan.enviar.length} correos reales?`}
                detalle={`Saldrán por el SMTP institucional, ${POR_MINUTO} por minuto (unos ${minutos} min), a personas de afuera. No se puede deshacer lo que ya salió.`}
                si="Sí, enviar"
                onNo={() => setConfirmando(false)}
                onSi={arrancar}
              />
            ) : (
              <div className="rel-acciones">
                <button type="button" className="es-btn es-btn--pri" disabled={!puede} onClick={() => (real ? setConfirmando(true) : arrancar())}>
                  {crear.isPending ? "Preparando…" : real ? `Enviar a ${plan.enviar.length} contactos` : "Enviar a Mailpit"}
                </button>
                <button type="button" className="es-btn" disabled={!plantilla || !profile?.email || !remitenteOk || Boolean(corriendo)} onClick={() => void prueba()}>
                  Enviarme una prueba
                </button>
                {corriendo ? (
                  <button type="button" className="es-btn" onClick={() => { parar.current = true; cancelar.mutate(corriendo); }}>
                    Cancelar envío
                  </button>
                ) : null}
              </div>
            )}
            <div className="rel-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Avance del envío">
              <i style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
            <div className="rel-log" ref={lineas} aria-live="polite">
              {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : "Sin envíos todavía."}
            </div>
          </div>
        </div>
      </div>

      <aside className="rel-resumen">
        <h3>Resumen del envío</h3>
        <dl>
          <dt>Seleccionados</dt>
          <dd>{elegidos.length}</dd>
          <dt>Se enviarán</dt>
          <dd>{plan.enviar.length}</dd>
          <dt>Omitidos por su correo</dt>
          <dd>{plan.omitidos}</dd>
          <dt>Dados de baja</dt>
          <dd>{plan.baja}</dd>
          <dt>Correos repetidos</dt>
          <dd>{plan.repetidos}</dd>
          <dt>Ritmo</dt>
          <dd>{real ? `${POR_MINUTO} por minuto` : "sin pausa"}</dd>
          <dt>Duración estimada</dt>
          <dd>{minutos} min</dd>
        </dl>
        <p className="rel-nota">El ritmo evita que Microsoft 365 limite la cuenta. Cada correo lleva un enlace para dejar de recibir mensajes, y lo enviado queda en la ficha de cada contacto.</p>
        <h3>Envíos recientes</h3>
        {!envios.data?.length ? (
          <p className="rel-sub">Aún no hay envíos.</p>
        ) : (
          <ul className="rel-envios">
            {envios.data.map((e) => (
              <li key={e.id}>
                <span>
                  <b>{e.plantilla_nombre}</b>
                  <small>
                    {e.destino === "mailpit" ? "Mailpit" : "SMTP"} · {e.enviados}/{e.total} enviados{e.fallidos ? ` · ${e.fallidos} con fallo` : ""} · {e.estado === "activo" ? "en curso" : e.estado}
                  </small>
                </span>
                {pendientes.some((x) => x.id === e.id) ? (
                  <button type="button" className="es-btn" disabled={Boolean(corriendo)} onClick={() => reanudar(e)}>
                    Reanudar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );

  function reanudar(e: EnvioRel) {
    setLog([`Reanudando «${e.plantilla_nombre}»…`]);
    void correr(e.id, { total: e.total, enviados: e.enviados, fallidos: e.fallidos });
  }
}

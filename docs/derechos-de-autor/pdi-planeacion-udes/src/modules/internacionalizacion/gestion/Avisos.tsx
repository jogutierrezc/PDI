/* =============================================================================
   Gestión de convenios · Avisos de vencimiento (0256). Cuatro cifras, las reglas de
   aviso (editables), la cola calculada con los convenios reales, la vista previa del
   correo de la fila elegida y la bitácora de envíos. «Enviar ahora» llama a la función
   conv-avisos (acción «enviar»): el envío automático lo hace el cron una vez al día.

   El único movimiento es el conteo de las cifras la primera vez que se abre.
   ========================================================================== */

import gsap from "gsap";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { asuntoDe, htmlDe } from "../../../../supabase/functions/conv-avisos/plantilla";
import type { Idioma } from "../../../../supabase/functions/conv-avisos/plantilla";
import { Icon } from "../../../components/ui/Icon";
import { FaltaMigracion } from "../../rankings/noticias";
import { AvisoMigracion, Confirmar, ErrorCaja, useAviso } from "../ui/comunes";
import { movimientoReducido } from "../ui/movimiento";
import { fechaLarga, vigenciaDe } from "../convenios/logica";
import type { Convenio } from "../convenios/logica";
import { DESTINOS, useBitacoraAvisos, useConfigAvisos, useEnviarAviso, useGuardarConfig, useGuardarRegla, useBorrarRegla, useNuevaRegla, usePlantillasCorreo, useReglas } from "./datos";
import type { ConfigAvisos, DestinoAviso, ReglaAviso } from "./datos";
import { colaDe, corto, ROTULO_ESTADO_ENVIO, textoRegla, variablesAviso } from "./logica";
import type { FilaCola } from "./logica";
import { PlantillasCorreo } from "./PlantillasCorreo";

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(".", "");

export function Avisos({ convenios, hoy, crea, animar, onAnimado }: { convenios: Convenio[]; hoy: string; crea: boolean; animar: boolean; onAnimado: () => void }) {
  const reglas = useReglas();
  const config = useConfigAvisos();
  const plantillas = usePlantillasCorreo();
  const bitacora = useBitacoraAvisos();
  const [vista, setVista] = useState<"avisos" | "plantillas">("avisos");
  const [elegido, setElegido] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  const cola = useMemo(() => colaDe(convenios, reglas.data ?? [], bitacora.data ?? [], hoy), [convenios, reglas.data, bitacora.data, hoy]);
  const raiz = useRef<HTMLDivElement>(null);

  const error = reglas.error ?? config.error ?? plantillas.error ?? bitacora.error;

  useLayoutEffect(() => {
    const nodo = raiz.current;
    if (!nodo || !animar || !reglas.data || vista !== "avisos") return;
    onAnimado();
    const ctx = gsap.context(() => {
      if (movimientoReducido()) return;
      gsap.from(nodo.querySelectorAll(".conv-cifra-fig"), { textContent: 0, duration: 0.3, ease: "expo.out", snap: { textContent: 1 }, stagger: 0.04 });
    }, nodo);
    return () => ctx.revert();
    // Solo la primera vez que hay datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(reglas.data)]);

  if (error) return error instanceof FaltaMigracion ? <AvisoMigracion error={error} /> : <ErrorCaja error={error as Error} />;
  if (vista === "plantillas") return <PlantillasCorreo plantillas={plantillas.data ?? []} convenios={convenios} crea={crea} onVolver={() => setVista("avisos")} />;

  const activas = (reglas.data ?? []).filter((r) => r.activa).length;
  const proximos = cola.filter((f) => f.proxima && f.proxima.fecha <= new Date(Date.parse(hoy) + 30 * 86_400_000).toISOString().slice(0, 10)).length;
  const vencidos = convenios.filter((c) => vigenciaDe(c, hoy) === "Vencido").length;
  const fila = cola.find((f) => f.convenio.id === elegido) ?? cola[0] ?? null;

  return (
    <div ref={raiz} className="gest-avisos">
      <section className="conv-panel conv-cifras gest-cifras" aria-label="Resumen de avisos">
        <div className="conv-cifra gest-cifra">
          <span className="conv-cifra-fig is-warn">{cola.length}</span>
          <span className="conv-cifra-et">Terminan en 200 días</span>
          <span className="conv-cifra-nota">convenios firmados con fecha</span>
        </div>
        <div className="conv-cifra gest-cifra">
          <span className="conv-cifra-fig">{proximos}</span>
          <span className="conv-cifra-et">Avisos en los próximos 30 días</span>
          <span className="conv-cifra-nota">según las reglas activas</span>
        </div>
        <div className="conv-cifra gest-cifra">
          <span className="conv-cifra-fig is-bad">{vencidos}</span>
          <span className="conv-cifra-et">Ya vencidos</span>
          <span className="conv-cifra-nota">solo reciben seguimiento si hay una regla de días después</span>
        </div>
        <div className="conv-cifra gest-cifra">
          <span className="conv-cifra-fig">{activas}</span>
          <span className="conv-cifra-et">Reglas activas</span>
          <span className="conv-cifra-nota">de {(reglas.data ?? []).length}</span>
        </div>
      </section>

      <div className="gest-dos gest-dos--aviso">
        <Reglas reglas={reglas.data ?? []} config={config.data} plantillas={(plantillas.data ?? []).filter((p) => p.idioma === "es")} crea={crea} onPlantillas={() => setVista("plantillas")} />
        <Cola cola={cola} elegida={fila?.convenio.id ?? null} onElegir={setElegido} crea={crea} modo={config.data?.modo ?? "prueba"} hoy={hoy} />
      </div>

      <div className="gest-dos gest-dos--aviso">
        <Previa fila={fila} reglas={reglas.data ?? []} plantillas={plantillas.data ?? []} hoy={hoy} />
        <section className="conv-panel">
          <div className="conv-bar">
            <h2>Bitácora de envíos</h2>
            <span className="conv-grow" />
            <span className="conv-sub">{config.data?.modo === "real" ? "Salen a los destinatarios reales, por Sistema › Correos" : "Modo de prueba: los correos llegan a la dirección de prueba, no a la contraparte"}</span>
          </div>
          {!(bitacora.data ?? []).length ? (
            <p className="conv-vacio">
              <b>Todavía no ha salido ningún aviso.</b>
              <br />
              Cuando el cron corra, o cuando use «Enviar ahora», cada envío queda aquí.
            </p>
          ) : (
            <div className="conv-tabla conv-tabla--chica">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Convenio</th>
                    <th>Regla</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {(bitacora.data ?? []).slice(0, verTodo ? 300 : 12).map((e) => {
                    const c = convenios.find((x) => x.id === e.convenio_id);
                    const r = ROTULO_ESTADO_ENVIO[e.estado] ?? { texto: e.estado, clase: "idle" as const };
                    const ok = e.destinatarios.filter((d) => d.ok).length;
                    return (
                      <tr key={e.id}>
                        <td className="conv-mono">{fechaHora(e.created_at)}</td>
                        <td>
                          <span className="conv-nm" title={c?.institucion}>
                            {c?.institucion ?? "Convenio"}
                          </span>
                          <span className="conv-sub">
                            {c?.codigo.toUpperCase()} · {e.origen === "manual" ? "manual" : "automático"}
                            {e.modo === "prueba" ? " · prueba" : ""}
                          </span>
                        </td>
                        <td>{corto(e.regla_dias)}</td>
                        <td title={e.error ?? undefined}>
                          <span className={`conv-pill conv-pill--${r.clase}`}>{r.texto}</span>
                          <span className="conv-sub"> {ok}/{e.destinatarios.length}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {(bitacora.data ?? []).length > 12 ? (
            <div className="gest-pie">
              <button type="button" className="conv-btn conv-btn--sm" onClick={() => setVerTodo(!verTodo)}>
                {verTodo ? "Ver menos" : "Ver más"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/* ---------- Reglas y ajustes ------------------------------------------------------------ */

function Reglas({ reglas, config, plantillas, crea, onPlantillas }: { reglas: ReglaAviso[]; config: ConfigAvisos | undefined; plantillas: { clave: string; nombre: string }[]; crea: boolean; onPlantillas: () => void }) {
  const guardar = useGuardarRegla();
  const nueva = useNuevaRegla();
  const borrar = useBorrarRegla();
  const aviso = useAviso();
  const [borrando, setBorrando] = useState<string | null>(null);
  const opcionesPlantilla = plantillas.filter((p) => !p.clave.startsWith("firma_"));

  const cambiar = (id: string, cambios: Parameters<typeof guardar.mutate>[0]["cambios"]) => guardar.mutate({ id, cambios }, { onError: aviso.mal });
  const alternar = (r: ReglaAviso, d: DestinoAviso) => {
    const lista = r.destinatarios.includes(d) ? r.destinatarios.filter((x) => x !== d) : [...r.destinatarios, d];
    if (!lista.length) return aviso.mal(new Error("Debe quedar al menos un destinatario."));
    cambiar(r.id, { destinatarios: lista });
  };

  return (
    <section className="conv-panel conv-bloque gest-reglas">
      <div className="gest-fila">
        <h2>Reglas de aviso</h2>
        <span className="conv-grow" />
        <button type="button" className="conv-btn conv-btn--sm" onClick={onPlantillas}>
          <Icon name="mail" size={14} />
          Plantillas de correo
        </button>
      </div>
      <p className="conv-sub">Cambie los días o apague una regla y la cola se recalcula. Los cambios se guardan al momento.</p>
      <div className="gest-reglas-lista">
        {reglas.map((r) => (
          <ReglaFila key={r.id} r={r} crea={crea} plantillas={opcionesPlantilla} onCambio={(c) => cambiar(r.id, c)} onAlternar={(d) => alternar(r, d)} onBorrar={() => setBorrando(r.id)} />
        ))}
      </div>
      {crea ? (
        <button type="button" className="conv-btn conv-btn--sm" disabled={nueva.isPending} onClick={() => nueva.mutate(reglas.length + 1, { onError: aviso.mal })}>
          <Icon name="plus" size={14} />
          Agregar regla
        </button>
      ) : null}
      {borrando ? (
        <Confirmar
          pregunta="¿Quitar esta regla?"
          detalle="Los envíos ya hechos se conservan en la bitácora."
          si="Quitar la regla"
          ocupado={borrar.isPending}
          onNo={() => setBorrando(null)}
          onSi={() => borrar.mutate(borrando, { onSettled: () => setBorrando(null), onError: aviso.mal })}
        />
      ) : null}
      {aviso.nodo}
      {config ? <Ajustes config={config} crea={crea} /> : null}
    </section>
  );
}

function ReglaFila({ r, crea, plantillas, onCambio, onAlternar, onBorrar }: { r: ReglaAviso; crea: boolean; plantillas: { clave: string; nombre: string }[]; onCambio: (c: Partial<ReglaAviso>) => void; onAlternar: (d: DestinoAviso) => void; onBorrar: () => void }) {
  const tipo = r.dias > 0 ? "antes" : r.dias === 0 ? "dia" : "despues";
  const [n, setN] = useState(String(Math.abs(r.dias) || 30));
  const poner = (t: string, valor: string) => {
    const v = Math.max(1, Math.min(365, Math.round(Number(valor)) || 1));
    onCambio({ dias: t === "antes" ? v : t === "despues" ? -v : 0 });
  };
  return (
    <div className={`gest-regla${r.activa ? "" : " is-off"}`}>
      <label className="gest-tog">
        <input type="checkbox" checked={r.activa} disabled={!crea} onChange={(e) => onCambio({ activa: e.target.checked })} aria-label={`Regla ${textoRegla(r.dias)} activa`} />
        <i aria-hidden="true" />
      </label>
      <div className="gest-regla-cuerpo">
        <div className="gest-regla-dias">
          <select value={tipo} disabled={!crea} aria-label="Cuándo" onChange={(e) => poner(e.target.value, n)}>
            <option value="antes">Faltando</option>
            <option value="dia">El día del vencimiento</option>
            <option value="despues">Ya vencido hace</option>
          </select>
          {tipo !== "dia" ? (
            <>
              <input type="number" min={1} max={365} value={n} disabled={!crea} aria-label="Días" onChange={(e) => setN(e.target.value)} onBlur={() => poner(tipo, n)} />
              <span>días</span>
            </>
          ) : null}
          {crea ? (
            <button type="button" className="gest-quitar" onClick={onBorrar} aria-label={`Quitar la regla ${textoRegla(r.dias)}`}>
              <Icon name="trash" size={14} />
            </button>
          ) : null}
        </div>
        <div className="gest-chips" role="group" aria-label="Destinatarios">
          {DESTINOS.map((d) => (
            <button key={d.id} type="button" className="gest-chip" aria-pressed={r.destinatarios.includes(d.id)} disabled={!crea} onClick={() => onAlternar(d.id)}>
              {d.rotulo}
            </button>
          ))}
        </div>
        <label className="it-campo">
          <span>Plantilla</span>
          <select value={r.plantilla_clave} disabled={!crea} onChange={(e) => onCambio({ plantilla_clave: e.target.value })}>
            {plantillas.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function Ajustes({ config, crea }: { config: ConfigAvisos; crea: boolean }) {
  const guardar = useGuardarConfig();
  const aviso = useAviso();
  const [hora, setHora] = useState(config.hora);
  const [remitente, setRemitente] = useState(config.remitente);
  const [direccion, setDireccion] = useState(config.correo_direccion);
  const [confirmarReal, setConfirmarReal] = useState(false);
  const poner = (c: Partial<ConfigAvisos>) => guardar.mutate(c, { onSuccess: () => aviso.ok("Ajuste guardado."), onError: aviso.mal });

  return (
    <div className="gest-ajustes">
      <h3>Envío automático</h3>
      <div className="conv-g2">
        <label className="it-campo" htmlFor="ga-hora">
          <span>Hora de envío (Bogotá)</span>
          <input id="ga-hora" type="time" value={hora} disabled={!crea} onChange={(e) => setHora(e.target.value)} onBlur={() => hora && hora !== config.hora && poner({ hora })} />
        </label>
        <label className="it-campo" htmlFor="ga-modo">
          <span>Modo</span>
          <select id="ga-modo" value={config.modo} disabled={!crea} onChange={(e) => (e.target.value === "real" ? setConfirmarReal(true) : poner({ modo: "prueba" }))}>
            <option value="prueba">Prueba (todo a una dirección propia, con «[PRUEBA]»)</option>
            <option value="real">Real (a los destinatarios, por Sistema › Correos)</option>
          </select>
        </label>
      </div>
      <div className="gest-toggles">
        <label className="conv-radio">
          <input type="checkbox" checked={config.activo} disabled={!crea} onChange={(e) => poner({ activo: e.target.checked })} />
          Envío automático encendido
        </label>
        <label className="conv-radio">
          <input type="checkbox" checked={config.solo_habiles} disabled={!crea} onChange={(e) => poner({ solo_habiles: e.target.checked })} />
          Solo días hábiles
        </label>
        <label className="conv-radio">
          <input type="checkbox" checked={config.detener_renovacion} disabled={!crea} onChange={(e) => poner({ detener_renovacion: e.target.checked })} />
          Detener al registrar una renovación
        </label>
      </div>
      <div className="conv-g2">
        <label className="it-campo" htmlFor="ga-rem">
          <span>Remitente</span>
          <input id="ga-rem" type="text" value={remitente} maxLength={254} disabled={!crea} onChange={(e) => setRemitente(e.target.value)} onBlur={() => remitente !== config.remitente && poner({ remitente })} />
        </label>
        <label className="it-campo" htmlFor="ga-dir">
          <span>Correo de la Dirección</span>
          <input id="ga-dir" type="text" inputMode="email" value={direccion} disabled={!crea} onChange={(e) => setDireccion(e.target.value)} onBlur={() => direccion !== config.correo_direccion && poner({ correo_direccion: direccion })} />
        </label>
      </div>
      {config.modo === "prueba" ? <p className="conv-nota">Está en modo de prueba: ningún aviso sale a personas de afuera. Cuando todo esté revisado, cámbielo a «Real».</p> : null}
      {aviso.nodo}
      {confirmarReal ? (
        <Confirmar
          pregunta="¿Pasar los avisos al modo real?"
          detalle="Desde ahora los avisos saldrán por el SMTP institucional a los contactos de las instituciones. No se puede deshacer lo que ya salió."
          si="Sí, modo real"
          ocupado={guardar.isPending}
          onNo={() => setConfirmarReal(false)}
          onSi={() => {
            setConfirmarReal(false);
            poner({ modo: "real" });
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- Cola ---------------------------------------------------------------------------- */

function Cola({ cola, elegida, onElegir, crea, modo, hoy }: { cola: FilaCola[]; elegida: string | null; onElegir: (id: string) => void; crea: boolean; modo: "prueba" | "real"; hoy: string }) {
  const enviar = useEnviarAviso();
  const aviso = useAviso();
  const [pendiente, setPendiente] = useState<FilaCola | null>(null);

  return (
    <section className="conv-panel">
      <div className="conv-bar">
        <h2>Cola de envíos</h2>
        <span className="conv-grow" />
        <span className="conv-sub">Elija una fila para ver el correo</span>
      </div>
      {!cola.length ? (
        <p className="conv-vacio">
          <b>No hay convenios firmados que terminen en los próximos 200 días.</b>
        </p>
      ) : (
        <div className="conv-tabla conv-tabla--chica gest-cola">
          <table>
            <thead>
              <tr>
                <th>Convenio</th>
                <th>Termina</th>
                <th>Último aviso</th>
                <th>Próximo</th>
                {crea ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {cola.map((f) => (
                <tr key={f.convenio.id} className={f.convenio.id === elegida ? "is-sel" : undefined} onClick={() => onElegir(f.convenio.id)}>
                  <td>
                    <span className="conv-nm" title={f.convenio.institucion}>
                      {f.convenio.institucion}
                    </span>
                    <span className="conv-sub">
                      {f.convenio.pais} · {f.convenio.codigo.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {fechaLarga(f.convenio.fecha_terminacion)}
                    <span className="conv-sub"> {f.faltan} días</span>
                  </td>
                  <td>{f.ultimo ? <span className="conv-pill conv-pill--ok">{corto(f.ultimo.dias)}</span> : <span className="conv-sub">Ninguno</span>}</td>
                  <td>
                    {f.proxima ? (
                      <>
                        <span className="conv-mono">{f.proxima.hoyToca ? "Toca hoy" : fechaLarga(f.proxima.fecha)}</span>
                        <span className="conv-sub">regla de {corto(f.proxima.regla.dias)}</span>
                      </>
                    ) : (
                      <span className="conv-sub">Sin reglas pendientes</span>
                    )}
                  </td>
                  {crea ? (
                    <td>
                      <button
                        type="button"
                        className="conv-btn conv-btn--sm"
                        disabled={!f.proxima || enviar.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          onElegir(f.convenio.id);
                          setPendiente(f);
                        }}
                      >
                        Enviar ahora
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="gest-pie">{aviso.nodo}</div>
      {pendiente?.proxima ? (
        <Confirmar
          pregunta={`¿Enviar ahora el aviso de ${textoRegla(pendiente.proxima.regla.dias)}?`}
          detalle={`Convenio con ${pendiente.convenio.institucion} (${pendiente.convenio.codigo.toUpperCase()}), que termina el ${fechaLarga(pendiente.convenio.fecha_terminacion)} (hoy: ${fechaLarga(hoy)}). ${modo === "prueba" ? "Está en modo de prueba: el correo llega a su propia dirección con el asunto [PRUEBA]." : "Está en modo real: el correo sale a los destinatarios reales por Sistema › Correos."}`}
          si="Enviar el aviso"
          ocupado={enviar.isPending}
          onNo={() => setPendiente(null)}
          onSi={() => {
            const f = pendiente;
            enviar.mutate(
              { convenio_id: f.convenio.id, regla_id: f.proxima?.regla.id },
              {
                onSuccess: (r) => aviso.ok(`Aviso enviado a ${r.resultado.enviados} ${r.resultado.enviados === 1 ? "destinatario" : "destinatarios"} de ${f.convenio.institucion}${r.modo === "prueba" ? " (modo de prueba)" : ""}. Quedó en la bitácora.`),
                onError: aviso.mal,
                onSettled: () => setPendiente(null),
              },
            );
          }}
        />
      ) : null}
    </section>
  );
}

/* ---------- Vista previa ------------------------------------------------------------------------ */

function Previa({ fila, reglas, plantillas, hoy }: { fila: FilaCola | null; reglas: ReglaAviso[]; plantillas: { clave: string; idioma: Idioma; asunto: string; cuerpo: string; audiencia: string }[]; hoy: string }) {
  const c = fila?.convenio;
  const regla = fila?.proxima?.regla ?? reglas.find((r) => r.activa) ?? reglas[0];
  const conContacto = regla?.destinatarios.includes("contacto");
  const idioma: Idioma = conContacto && c?.idioma === "en" ? "en" : "es";
  const p = regla ? (plantillas.find((x) => x.clave === regla.plantilla_clave && x.idioma === idioma) ?? plantillas.find((x) => x.clave === regla.plantilla_clave && x.idioma === "es")) : undefined;
  const vars = c ? variablesAviso(c, hoy, p?.idioma ?? idioma, window.location.origin) : null;
  const html = p && vars ? htmlDe(p.cuerpo, vars, { idioma: p.idioma, logo: `${window.location.origin}/logo-udes-blanco.png` }) : "";

  return (
    <section className="conv-panel conv-bloque">
      <div className="gest-fila">
        <h2>Vista previa del aviso</h2>
        <span className="conv-grow" />
        {regla ? <span className="conv-sub">Regla de {corto(regla.dias)}</span> : null}
      </div>
      {!c || !p || !vars ? (
        <p className="conv-vacio">Elija un convenio de la cola para ver el correo.</p>
      ) : (
        <>
          <dl className="gest-cab">
            <dt>De</dt>
            <dd>Relaciones Internacionales UDES</dd>
            <dt>Para</dt>
            <dd>{regla?.destinatarios.map((d) => DESTINOS.find((x) => x.id === d)?.rotulo).join(", ")}</dd>
            <dt>Asunto</dt>
            <dd>
              <b>{asuntoDe(p.asunto, vars)}</b>
            </dd>
            <dt>Idioma</dt>
            <dd>{p.idioma === "es" ? "Español" : "English"}{conContacto ? ` (la contraparte lo recibe en ${c.idioma === "en" ? "inglés" : "español"})` : ""}</dd>
          </dl>
          <iframe className="gest-correo" title="Vista previa del correo del aviso" sandbox="" srcDoc={html} />
        </>
      )}
    </section>
  );
}

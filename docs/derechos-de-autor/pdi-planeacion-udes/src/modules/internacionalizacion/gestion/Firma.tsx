/* =============================================================================
   Gestión de convenios · pestaña «Firma» (0258, función conv-firma).

   · Lista de solicitudes: convenio, contraparte, estado, quién falta, fechas y acciones
     (Recordar, Reenviar enlace, Cancelar, Descargar) con confirmación dentro de la página.
   · «Enviar a firma» desde un documento generado (conv_generados en «listo para firma»):
     firmantes con orden, rol, nombre, correo e idioma; crea la solicitud y la envía.
   · Detalle: estado por firmante, línea de eventos y estado del certificado de sello de la UDES.

   Todo pasa por conv-firma con la sesión del usuario; leer exige int_ve_modulo() y escribir
   int_puede_crear() (la función lo comprueba). Los enlaces y códigos solo existen como hash en
   el servidor: «Recordar» y «Reenviar enlace» crean enlace y código nuevos, y el anterior deja de servir.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import type { Convenio } from "../convenios/logica";
import { fechaHora, Ventana } from "../firma/comunes";
import { ErrorFirma, interna } from "../firma/api";
import type { EstadoCertUdes, EstadoFirma, EventoFirma, FirmaConFirmantes, FirmanteFila, FirmanteNuevo, Idioma, Rol } from "../firma/api";
import { Cargando, ErrorCaja, useAviso } from "../ui/comunes";
import "../firma/firma.css";
import "./firma-panel.css";

/* ---------- datos ---------- */

const CLAVES = { lista: ["conv-firma", "lista"], generados: ["conv-firma", "generados"] } as const;

function usarSolicitudes() {
  return useQuery({
    queryKey: CLAVES.lista,
    retry: false,
    queryFn: async () => (await interna<{ firmas: FirmaConFirmantes[] }>("listar", { limite: 200 })).firmas,
  });
}

interface GeneradoFila {
  id: string;
  convenio_id: string;
  nombre: string;
  idioma: Idioma;
  formato: "docx" | "html";
  modelo_nombre: string;
  created_at: string;
}

function usarGenerados() {
  return useQuery({
    queryKey: CLAVES.generados,
    retry: false,
    queryFn: async (): Promise<GeneradoFila[]> => {
      const r = await supabase
        .from("conv_generados")
        .select("id, convenio_id, nombre, idioma, formato, modelo_nombre, created_at")
        .eq("estado", "listo_firma")
        .order("created_at", { ascending: false })
        .limit(100);
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as GeneradoFila[];
    },
  });
}

/* ---------- textos del panel ---------- */

const ESTADOS: Record<EstadoFirma, [string, string]> = {
  borrador: ["Borrador", "conv-pill--idle"],
  enviada: ["Enviada", "conv-pill--warn"],
  en_firma: ["En firma", "conv-pill--warn"],
  firmada: ["Firmada", "conv-pill--ok"],
  vencida: ["Vencida", "conv-pill--bad"],
  cancelada: ["Cancelada", "conv-pill--idle"],
};

const ESTADO_FIRMANTE: Record<FirmanteFila["estado"], string> = { pendiente: "Sin abrir", abierto: "Abrió el enlace", verificado: "Verificó el código", firmado: "Firmó" };
const METODOS: Record<string, string> = { dibujo: "Trazo en pantalla", movil: "Trazo desde el móvil", certificado: "Certificado digital" };

const EVENTOS: Record<string, string> = {
  creado: "Solicitud creada",
  enviado: "Enlace enviado",
  entregado: "Correo aceptado por el servidor de correo",
  abierto: "Abrió el enlace",
  codigo_enviado: "Código de verificación enviado",
  codigo_reenviado: "Código de verificación reenviado",
  codigo_verificado: "Código verificado",
  codigo_fallido: "Código incorrecto",
  documento_visto: "Vio el documento",
  documento_leido: "Leyó el documento hasta el final",
  firma_adoptada: "Adoptó su firma",
  firma_aplicada: "Firma aplicada",
  movil_iniciado: "Inició la firma desde el móvil",
  movil_recibido: "Se recibió el trazo del móvil",
  pdf_generado: "PDF generado",
  pdf_sellado: "PDF sellado con el certificado de la UDES",
  certificado_emitido: "Certificado de trazabilidad emitido",
  correos_enviados: "Copias enviadas a las partes",
  cancelado: "Solicitud cancelada",
  vencido: "Solicitud vencida",
  recordatorio: "Recordatorio enviado",
  enlace_reenviado: "Enlace nuevo enviado",
  bloqueado: "Acceso bloqueado por intentos fallidos",
  udrive_archivado: "Archivado en UDrive",
  udrive_fallo: "No se pudo archivar en UDrive",
  finalizacion_error: "El cierre falló y se reintentará",
};

const nombreDe = (e: unknown) => (e instanceof ErrorFirma ? e.message : e instanceof Error ? e.message : "Algo falló.");

const bogota = (iso: string | null | undefined) => (iso ? fechaHora(iso, "es") : "—");
const corta = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" }) : "—");

/* ---------- pestaña ---------- */

export function Firma({ convenios, crea }: { convenios: Convenio[]; crea: boolean }) {
  const lista = usarSolicitudes();
  const generados = usarGenerados();
  const aviso = useAviso();
  const cliente = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filtro, setFiltro] = useState<"todas" | "activas" | "firmadas" | "cerradas">("todas");
  const [enviar, setEnviar] = useState<GeneradoFila | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [accion, setAccion] = useState<{ tipo: "recordar" | "reenviar" | "cancelar" | "reintentar" | "descargar"; firma: FirmaConFirmantes } | null>(null);

  const porConvenio = useMemo(() => new Map(convenios.map((c) => [c.id, c])), [convenios]);
  const refrescar = () => {
    void cliente.invalidateQueries({ queryKey: CLAVES.lista });
    void cliente.invalidateQueries({ queryKey: CLAVES.generados });
  };

  // ?generado=<id> abre «Enviar a firma» para ese documento (enlace desde otras pantallas).
  const pedido = params.get("generado");
  useEffect(() => {
    if (!pedido || !generados.data) return;
    const g = generados.data.find((x) => x.id === pedido);
    if (g && crea) setEnviar(g);
    const p = new URLSearchParams(params);
    p.delete("generado");
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega el dato
  }, [pedido, generados.data]);

  if (lista.error) {
    const e = lista.error as Error;
    return <ErrorCaja error={e} accion={<button type="button" className="conv-btn" onClick={() => void lista.refetch()}>Reintentar</button>} />;
  }
  if (!lista.data) return <Cargando texto="Cargando solicitudes de firma…" />;

  const filas = lista.data.filter((f) => {
    if (filtro === "activas") return ["enviada", "en_firma", "borrador"].includes(f.estado);
    if (filtro === "firmadas") return f.estado === "firmada";
    if (filtro === "cerradas") return ["cancelada", "vencida"].includes(f.estado);
    return true;
  });
  const enCurso = new Set(lista.data.filter((f) => ["borrador", "enviada", "en_firma"].includes(f.estado)).map((f) => f.generado_id));
  const pendientesDeEnviar = (generados.data ?? []).filter((g) => !enCurso.has(g.id));

  return (
    <div className="fp">
      <section className="conv-panel">
        <div className="conv-bar">
          <h2>Documentos listos para firma</h2>
          <span className="conv-grow" />
          <span className="conv-sub">Convenios generados que todavía no están en una solicitud activa</span>
        </div>
        {generados.error ? (
          <p className="conv-error">{nombreDe(generados.error)}</p>
        ) : !pendientesDeEnviar.length ? (
          <p className="conv-vacio"><b>No hay documentos esperando firma.</b> Genere uno en la pestaña Modelos y vuelva aquí.</p>
        ) : (
          <ul className="fp-lista">
            {pendientesDeEnviar.map((g) => {
              const c = porConvenio.get(g.convenio_id);
              return (
                <li key={g.id}>
                  <span className="fp-quien">
                    <b>{c?.institucion ?? "Convenio"}</b>
                    <span className="conv-sub">{g.nombre} · {g.modelo_nombre} · {g.idioma === "es" ? "español" : "inglés"} · {corta(g.created_at)}</span>
                  </span>
                  <button type="button" className="conv-btn conv-btn--pri conv-btn--sm" disabled={!crea} title={crea ? undefined : "Solo quienes pueden crear en Internacionalización"} onClick={() => setEnviar(g)}>
                    Enviar a firma
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="conv-panel">
        <div className="conv-bar">
          <h2>Solicitudes de firma</h2>
          <span className="conv-grow" />
          <div className="gest-seg" role="group" aria-label="Filtrar solicitudes">
            {([["todas", "Todas"], ["activas", "Activas"], ["firmadas", "Firmadas"], ["cerradas", "Vencidas y canceladas"]] as const).map(([k, n]) => (
              <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{n}</button>
            ))}
          </div>
          <button type="button" className="conv-btn conv-btn--sm" onClick={() => void lista.refetch()}>Actualizar</button>
        </div>
        {!filas.length ? (
          <p className="conv-vacio"><b>No hay solicitudes en esta vista.</b></p>
        ) : (
          <div className="conv-tabla">
            <table>
              <thead>
                <tr>
                  <th>Convenio</th>
                  <th>Estado</th>
                  <th>Firmantes</th>
                  <th>Fechas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const c = porConvenio.get(f.convenio_id);
                  const [rotulo, clase] = ESTADOS[f.estado];
                  const faltan = f.firmantes.filter((x) => x.estado !== "firmado");
                  const abierta = ["enviada", "en_firma", "vencida"].includes(f.estado);
                  return (
                    <tr key={f.id}>
                      <td>
                        <span className="conv-nm">{c?.institucion ?? f.nombre_documento}</span>
                        <span className="conv-sub">{f.nombre_documento}</span>
                        <span className="conv-mono fp-bloque">{f.codigo_verificacion}</span>
                      </td>
                      <td>
                        <span className={`conv-pill ${clase}`}>{rotulo}</span>
                        {f.finalizacion === "error" ? <span className="conv-pill conv-pill--bad fp-bloque" title={f.finalizacion_error ?? undefined}>Cierre con error</span> : null}
                        {f.estado === "firmada" && f.finalizacion && f.finalizacion !== "lista" && f.finalizacion !== "error" ? <span className="conv-pill conv-pill--warn fp-bloque">Sellando</span> : null}
                      </td>
                      <td>
                        <ul className="fp-firmantes">
                          {f.firmantes.map((x) => (
                            <li key={x.id}>
                              <span className={`fp-punto${x.estado === "firmado" ? " fp-punto--ok" : ""}`} aria-hidden="true" />
                              <span>
                                {x.nombre} <span className="conv-sub">· {x.rol_texto || x.rol} · {ESTADO_FIRMANTE[x.estado]}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        {abierta && faltan.length ? <span className="conv-sub">Falta: {faltan.map((x) => x.nombre).join(", ")}</span> : null}
                      </td>
                      <td className="fp-fechas">
                        <span className="conv-sub">Enviada: {corta(f.enviada_en)}</span>
                        <span className="conv-sub">{f.estado === "firmada" ? `Firmada: ${corta(f.firmada_en)}` : f.estado === "cancelada" ? `Cancelada: ${corta(f.cancelada_en)}` : `Vence: ${corta(f.vence_en)}`}</span>
                      </td>
                      <td>
                        <div className="fp-acciones">
                          <button type="button" className="conv-btn conv-btn--sm" onClick={() => setDetalle(f.id)}>Detalle</button>
                          {f.estado === "borrador" ? (
                            <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} onClick={() => setAccion({ tipo: "recordar", firma: f })}>Enviar</button>
                          ) : null}
                          {["enviada", "en_firma"].includes(f.estado) ? (
                            <>
                              <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} onClick={() => setAccion({ tipo: "recordar", firma: f })}>Recordar</button>
                              <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} onClick={() => setAccion({ tipo: "reenviar", firma: f })}>Reenviar enlace</button>
                            </>
                          ) : null}
                          {f.estado === "vencida" ? <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} onClick={() => setAccion({ tipo: "reenviar", firma: f })}>Reenviar enlace</button> : null}
                          {["borrador", "enviada", "en_firma"].includes(f.estado) ? <button type="button" className="conv-btn conv-btn--sm conv-btn--peligro" disabled={!crea} onClick={() => setAccion({ tipo: "cancelar", firma: f })}>Cancelar</button> : null}
                          {f.finalizacion === "error" ? <button type="button" className="conv-btn conv-btn--sm" disabled={!crea} onClick={() => setAccion({ tipo: "reintentar", firma: f })}>Reintentar cierre</button> : null}
                          <button type="button" className="conv-btn conv-btn--sm" onClick={() => setAccion({ tipo: "descargar", firma: f })}>Descargar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="gest-pie">{aviso.nodo}</div>
      </section>

      {enviar ? (
        <EnviarAFirma
          generado={enviar}
          convenio={porConvenio.get(enviar.convenio_id)}
          onCerrar={() => setEnviar(null)}
          onListo={(m) => {
            setEnviar(null);
            aviso.ok(m);
            refrescar();
          }}
        />
      ) : null}
      {detalle ? <DetalleSolicitud firmaId={detalle} convenio={(() => { const f = lista.data.find((x) => x.id === detalle); return f ? porConvenio.get(f.convenio_id) : undefined; })()} crea={crea} onCerrar={() => setDetalle(null)} onCambio={refrescar} /> : null}
      {accion ? (
        <AccionConfirmada
          accion={accion}
          onCerrar={() => setAccion(null)}
          onListo={(m) => {
            setAccion(null);
            if (m) aviso.ok(m);
            refrescar();
          }}
          onError={(e) => aviso.mal(e)}
        />
      ) : null}
    </div>
  );
}

/* ---------- confirmaciones ---------- */

function AccionConfirmada({ accion, onCerrar, onListo, onError }: { accion: { tipo: "recordar" | "reenviar" | "cancelar" | "reintentar" | "descargar"; firma: FirmaConFirmantes }; onCerrar: () => void; onListo: (m: string) => void; onError: (e: unknown) => void }) {
  const { tipo, firma } = accion;
  const pendientes = firma.firmantes.filter((x) => x.estado !== "firmado");
  const [firmante, setFirmante] = useState(tipo === "reenviar" ? (pendientes[0]?.id ?? "") : "");
  const [extender, setExtender] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (tipo === "recordar") {
        if (firma.estado === "borrador") return interna("enviar", { firma_id: firma.id });
        return interna("recordar", { firma_id: firma.id, ...(firmante ? { firmante_id: firmante } : {}), extender });
      }
      if (tipo === "reenviar") return interna("reenviar_enlace", { firma_id: firma.id, firmante_id: firmante, extender });
      if (tipo === "cancelar") return interna("cancelar", { firma_id: firma.id, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) });
      return interna<{ ok: boolean; error?: string }>("reintentar", { firma_id: firma.id });
    },
    onSuccess: (r) => {
      const res = r as { ok?: boolean; error?: string; fallidos?: unknown[] } | undefined;
      if (tipo === "reintentar" && res && res.ok === false) {
        setError(res.error ?? "El cierre volvió a fallar.");
        return;
      }
      onListo(
        { recordar: firma.estado === "borrador" ? "Solicitud enviada." : "Recordatorio enviado con un enlace y un código nuevos.", reenviar: "Enlace nuevo enviado. El anterior ya no sirve.", cancelar: "Solicitud cancelada.", reintentar: "Cierre completado.", descargar: "" }[tipo],
      );
    },
    onError: (e) => {
      setError(nombreDe(e));
      onError(e);
    },
  });

  const bajar = async (archivo: "base" | "firmado" | "certificado") => {
    setError("");
    try {
      const r = await interna<{ url: string; nombre: string }>("descargar", { firma_id: firma.id, archivo });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      setError(nombreDe(e));
    }
  };

  if (tipo === "descargar") {
    const hayFirmado = Boolean(firma.pdf_firmado_hash);
    return (
      <Ventana titulo="Descargar archivos" onCerrar={onCerrar} etiquetaCerrar="Cerrar" pie={<><span className="fm-grow" /><button type="button" className="conv-btn" onClick={onCerrar}>Cerrar</button></>}>
        <p className="conv-sub">El enlace de descarga dura dos minutos.</p>
        <div className="fp-col">
          <button type="button" className="conv-btn" onClick={() => void bajar("base")}>PDF a firmar (sin firmas)</button>
          <button type="button" className="conv-btn" disabled={!hayFirmado} onClick={() => void bajar("firmado")}>PDF firmado y sellado{hayFirmado ? "" : " (aún no existe)"}</button>
          <button type="button" className="conv-btn" disabled={!hayFirmado} onClick={() => void bajar("certificado")}>Certificado de trazabilidad{hayFirmado ? "" : " (aún no existe)"}</button>
        </div>
        {error ? <p className="conv-error" role="alert">{error}</p> : null}
      </Ventana>
    );
  }

  const titulos = { recordar: firma.estado === "borrador" ? "Enviar la solicitud" : "Enviar recordatorio", reenviar: "Reenviar el enlace", cancelar: "Cancelar la solicitud", reintentar: "Reintentar el cierre" };
  const textos = {
    recordar: firma.estado === "borrador" ? "Se enviará el enlace y el código de verificación a los firmantes." : "Cada firmante pendiente recibirá un recordatorio. El enlace y el código se renuevan: los anteriores dejan de servir.",
    reenviar: "Se crea un enlace y un código nuevos para la persona elegida y se le envían por correo. El enlace anterior deja de servir.",
    cancelar: "Los enlaces dejan de funcionar y el documento vuelve a quedar listo para firma. Esta acción no se deshace.",
    reintentar: "Se vuelve a generar el PDF final, el certificado de trazabilidad y los correos de cierre.",
  };
  return (
    <Ventana
      titulo={titulos[tipo]}
      onCerrar={onCerrar}
      etiquetaCerrar="Cerrar"
      pie={
        <>
          <span className="fm-grow" />
          <button type="button" className="conv-btn" onClick={onCerrar}>Volver</button>
          <button type="button" className={`conv-btn ${tipo === "cancelar" ? "conv-btn--peligro" : "conv-btn--pri"}`} disabled={m.isPending || (tipo === "reenviar" && !firmante)} onClick={() => { setError(""); m.mutate(); }}>
            {m.isPending ? "Un momento…" : tipo === "cancelar" ? "Cancelar solicitud" : "Confirmar"}
          </button>
        </>
      }
    >
      <p style={{ margin: "0 0 10px" }}><b>{firma.nombre_documento}</b></p>
      <p className="conv-sub" style={{ margin: "0 0 12px" }}>{textos[tipo]}</p>
      {tipo === "reenviar" || (tipo === "recordar" && firma.estado !== "borrador") ? (
        <div className="fp-col">
          <label className="fp-campo">
            <span>{tipo === "reenviar" ? "Firmante" : "Firmante (opcional)"}</span>
            <select value={firmante} onChange={(e) => setFirmante(e.target.value)}>
              {tipo === "recordar" ? <option value="">Todos los pendientes</option> : null}
              {(tipo === "reenviar" ? firma.firmantes : pendientes).map((x) => <option key={x.id} value={x.id}>{x.nombre} · {x.correo}</option>)}
            </select>
          </label>
          <label className="fp-check"><input type="checkbox" checked={extender} onChange={(e) => setExtender(e.target.checked)} /> Extender el plazo 15 días desde hoy</label>
        </div>
      ) : null}
      {tipo === "cancelar" ? (
        <label className="fp-campo">
          <span>Motivo (opcional)</span>
          <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
      ) : null}
      <p className="conv-error" role="alert" aria-live="assertive">{error}</p>
    </Ventana>
  );
}

/* ---------- Enviar a firma ---------- */

interface FilaFirmante extends FirmanteNuevo {
  clave: number;
}

function EnviarAFirma({ generado, convenio, onCerrar, onListo }: { generado: GeneradoFila; convenio: Convenio | undefined; onCerrar: () => void; onListo: (m: string) => void }) {
  const idioma = convenio?.idioma ?? generado.idioma;
  const [filas, setFilas] = useState<FilaFirmante[]>([
    { clave: 1, orden: 1, rol: "UDES", rol_texto: "Rector", nombre: "", correo: "", idioma: "es" },
    { clave: 2, orden: 2, rol: "contraparte", rol_texto: "Representante legal", nombre: "", correo: "", idioma },
  ]);
  const [secuencial, setSecuencial] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<Idioma>(idioma);

  const cambiar = (clave: number, parche: Partial<FilaFirmante>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...parche } : f)));
  const agregar = () => setFilas((fs) => [...fs, { clave: Math.max(0, ...fs.map((f) => f.clave)) + 1, orden: fs.length + 1, rol: "testigo", rol_texto: "Testigo", nombre: "", correo: "", idioma }]);
  const quitar = (clave: number) => setFilas((fs) => fs.filter((f) => f.clave !== clave).map((f, i) => ({ ...f, orden: i + 1 })));

  const valido = filas.length >= 2 && filas.every((f) => f.nombre.trim().length > 1 && /^\S+@\S+\.\S+$/.test(f.correo.trim()));
  const correosRepetidos = new Set(filas.map((f) => f.correo.trim().toLowerCase())).size !== filas.length;

  const enviar = async (soloBorrador: boolean) => {
    setError("");
    setOcupado(true);
    try {
      const cuerpo = {
        generado_id: generado.id,
        idioma: generado.idioma,
        secuencial,
        firmantes: filas.map((f) => ({ orden: f.orden, rol: f.rol, rol_texto: f.rol_texto?.trim() || undefined, nombre: f.nombre.trim(), correo: f.correo.trim(), idioma: f.idioma })),
      };
      const r = await interna<{ firma: { id: string } }>("crear", cuerpo);
      if (soloBorrador) {
        onListo("Solicitud guardada como borrador.");
        return;
      }
      const e = await interna<{ enviados: string[]; fallidos: { firmante_id: string; error: string }[] }>("enviar", { firma_id: r.firma.id });
      onListo(e.fallidos?.length ? `Solicitud enviada, pero ${e.fallidos.length} correo(s) no salieron. Use «Reenviar enlace».` : "Solicitud enviada a los firmantes.");
    } catch (e) {
      if (e instanceof ErrorFirma && e.code === "ya_existe") setError("Este documento ya tiene una solicitud de firma. Búsquela en la lista.");
      else setError(nombreDe(e));
    } finally {
      setOcupado(false);
    }
  };

  const inst = convenio?.institucion ?? "la institución";
  const asunto = vista === "es" ? "Convenio con la Universidad de Santander listo para su firma" : "Agreement with Universidad de Santander ready for your signature";
  const primero = filas.find((f) => f.nombre.trim()) ?? filas[0];

  return (
    <Ventana
      titulo="Enviar a firma"
      ancho
      onCerrar={onCerrar}
      etiquetaCerrar="Cerrar"
      pie={
        <>
          <span className="fm-legal">Cada firmante, incluido el Rector, recibe su propio enlace y su propio código por correo.</span>
          <button type="button" className="conv-btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="conv-btn" disabled={!valido || correosRepetidos || ocupado} onClick={() => void enviar(true)}>Guardar borrador</button>
          <button type="button" className="conv-btn conv-btn--pri" disabled={!valido || correosRepetidos || ocupado} onClick={() => void enviar(false)}>{ocupado ? "Enviando…" : "Crear y enviar"}</button>
        </>
      }
    >
      <p style={{ margin: "0 0 4px" }}><b>{inst}</b></p>
      <p className="conv-sub" style={{ margin: "0 0 12px" }}>{generado.nombre} · {generado.idioma === "es" ? "español" : "inglés"}. El logo de la institución es el que ya lleva el documento generado.</p>

      <div className="fp-firmantes-form">
        <div className="fp-fila fp-fila--cab" aria-hidden="true">
          <span>Orden</span><span>Rol</span><span>Cargo en el documento</span><span>Nombre</span><span>Correo</span><span>Idioma</span><span />
        </div>
        {filas.map((f, i) => (
          <div className="fp-fila" key={f.clave}>
            <span className="fp-orden">{f.orden}</span>
            <select aria-label={`Rol del firmante ${i + 1}`} value={f.rol} onChange={(e) => cambiar(f.clave, { rol: e.target.value as Rol })}>
              <option value="UDES">UDES</option>
              <option value="contraparte">Contraparte</option>
              <option value="testigo">Testigo</option>
            </select>
            <input aria-label={`Cargo del firmante ${i + 1}`} value={f.rol_texto ?? ""} onChange={(e) => cambiar(f.clave, { rol_texto: e.target.value })} />
            <input aria-label={`Nombre del firmante ${i + 1}`} value={f.nombre} onChange={(e) => cambiar(f.clave, { nombre: e.target.value })} autoComplete="off" />
            <input aria-label={`Correo del firmante ${i + 1}`} type="email" value={f.correo} onChange={(e) => cambiar(f.clave, { correo: e.target.value })} autoComplete="off" />
            <select aria-label={`Idioma del firmante ${i + 1}`} value={f.idioma} onChange={(e) => cambiar(f.clave, { idioma: e.target.value as Idioma })}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
            <button type="button" className="conv-btn conv-btn--sm" disabled={filas.length <= 2} aria-label={`Quitar al firmante ${i + 1}`} onClick={() => quitar(f.clave)}>Quitar</button>
          </div>
        ))}
      </div>
      <div className="fp-fila-pie">
        <button type="button" className="conv-btn conv-btn--sm" disabled={filas.length >= 8} onClick={agregar}>Agregar firmante</button>
        <label className="fp-check"><input type="checkbox" checked={secuencial} onChange={(e) => setSecuencial(e.target.checked)} /> Firman en orden (cada persona recibe el enlace cuando firma la anterior)</label>
      </div>
      {correosRepetidos ? <p className="conv-error" role="alert">Dos firmantes tienen el mismo correo. Cada persona necesita el suyo.</p> : null}

      <div className="fp-correo">
        <div className="conv-bar" style={{ padding: 0, border: 0 }}>
          <h3 style={{ fontSize: "0.9rem" }}>Vista previa del correo</h3>
          <span className="conv-grow" />
          <div className="gest-seg" role="group" aria-label="Idioma de la vista previa">
            <button type="button" aria-pressed={vista === "es"} onClick={() => setVista("es")}>ES</button>
            <button type="button" aria-pressed={vista === "en"} onClick={() => setVista("en")}>EN</button>
          </div>
        </div>
        <div className="fp-correo__caja">
          <div className="conv-sub">Asunto: <b>{asunto}</b></div>
          {vista === "es" ? (
            <>
              <p>Estimado(a) {primero?.nombre.trim() || "—"}:</p>
              <p>La Universidad de Santander le envía para firma electrónica el convenio con <b>{inst}</b>.</p>
              <p>Con el botón siguiente puede leer el documento completo y firmarlo. El enlace es personal y vence en 15 días. El código de verificación de 6 dígitos va en el mismo correo.</p>
              <p><span className="fp-boton">Leer y firmar el convenio</span></p>
            </>
          ) : (
            <>
              <p>Dear {primero?.nombre.trim() || "—"},</p>
              <p>Universidad de Santander is sending you the agreement with <b>{inst}</b> for electronic signature.</p>
              <p>Use the button below to read the full document and sign it. The link is personal and expires in 15 days. The 6-digit verification code is in the same email.</p>
              <p><span className="fp-boton">Read and sign the agreement</span></p>
            </>
          )}
          <p className="conv-sub">Vista aproximada: el texto final sale de la plantilla «firma_solicitud» (pestaña Avisos), que cada firmante recibe en su idioma.</p>
        </div>
      </div>
      <p className="conv-error" role="alert" aria-live="assertive">{error}</p>
    </Ventana>
  );
}

/* ---------- Detalle ---------- */

function DetalleSolicitud({ firmaId, convenio, crea, onCerrar, onCambio }: { firmaId: string; convenio: Convenio | undefined; crea: boolean; onCerrar: () => void; onCambio: () => void }) {
  void crea;
  void onCambio;
  const q = useQuery({
    queryKey: ["conv-firma", "detalle", firmaId],
    retry: false,
    queryFn: () => interna<{ firma: FirmaConFirmantes; firmantes: FirmanteFila[]; eventos: EventoFirma[] }>("detalle", { firma_id: firmaId }),
  });
  const cert = useQuery({ queryKey: ["conv-firma", "certificado-udes"], retry: false, staleTime: 60_000, queryFn: () => interna<EstadoCertUdes>("estado_certificado_udes") });

  const nombres = new Map((q.data?.firmantes ?? []).map((f) => [f.id, f.nombre]));
  return (
    <Ventana titulo="Detalle de la solicitud" ancho onCerrar={onCerrar} etiquetaCerrar="Cerrar" pie={<><span className="fm-grow" /><button type="button" className="conv-btn" onClick={onCerrar}>Cerrar</button></>}>
      {q.error ? <p className="conv-error" role="alert">{nombreDe(q.error)}</p> : null}
      {!q.data && !q.error ? <Cargando texto="Cargando el detalle…" /> : null}
      {q.data ? (
        <div className="fp-detalle">
          <div>
            <p style={{ margin: 0 }}><b>{convenio?.institucion ?? q.data.firma.nombre_documento}</b></p>
            <p className="conv-sub" style={{ margin: "2px 0 0" }}>{q.data.firma.nombre_documento}</p>
            <p className="conv-mono" style={{ margin: "4px 0 0" }}>{q.data.firma.codigo_verificacion}</p>
            <div className="fp-fila-pie" style={{ marginTop: 8 }}>
              <span className={`conv-pill ${ESTADOS[q.data.firma.estado][1]}`}>{ESTADOS[q.data.firma.estado][0]}</span>
              {q.data.firma.estado === "firmada" || q.data.firma.firmada_en ? (
                <a className="conv-btn conv-btn--sm" href={`/verificar/${encodeURIComponent(q.data.firma.codigo_verificacion)}`} target="_blank" rel="noreferrer">Abrir verificación pública</a>
              ) : null}
            </div>
            {q.data.firma.cancelada_motivo ? <p className="conv-sub">Motivo de cancelación: {q.data.firma.cancelada_motivo}</p> : null}
            {q.data.firma.finalizacion_error ? <p className="conv-error">Cierre: {q.data.firma.finalizacion_error}</p> : null}
          </div>

          <div>
            <h3 className="fp-h3">Firmantes</h3>
            <div className="conv-tabla conv-tabla--chica">
              <table>
                <thead><tr><th>Orden</th><th>Firmante</th><th>Estado</th><th>Método</th><th>Fechas</th></tr></thead>
                <tbody>
                  {q.data.firmantes.map((f) => (
                    <tr key={f.id}>
                      <td>{f.orden}</td>
                      <td>
                        <span className="conv-nm">{f.nombre}</span>
                        <span className="conv-sub">{f.rol_texto || f.rol} · {f.correo}</span>
                        {f.codigo_identidad ? <span className="conv-mono fp-bloque">{f.codigo_identidad}</span> : null}
                      </td>
                      <td>
                        <span className={`conv-pill ${f.estado === "firmado" ? "conv-pill--ok" : "conv-pill--idle"}`}>{ESTADO_FIRMANTE[f.estado]}</span>
                        {f.recordatorios ? <span className="conv-sub fp-bloque">{f.recordatorios} recordatorio(s)</span> : null}
                      </td>
                      <td>
                        {f.metodo ? METODOS[f.metodo] : "—"}
                        {f.cert_sujeto ? <span className="conv-sub fp-bloque">{f.cert_sujeto}{f.cert_cadena ? ` · ${f.cert_cadena === "lista_confianza" ? "raíz de confianza" : "cadena no validada contra entidad acreditada"}` : ""}</span> : null}
                      </td>
                      <td className="fp-fechas">
                        <span className="conv-sub">Enlace: {bogota(f.enlace_enviado_en)}</span>
                        <span className="conv-sub">Abierto: {bogota(f.abierto_en)}</span>
                        <span className="conv-sub">Leído: {bogota(f.leido_en)}</span>
                        <span className="conv-sub">Firmado: {bogota(f.firmado_en)}</span>
                        {f.pais ? <span className="conv-sub">País: {f.pais}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="fp-h3">Línea de eventos</h3>
            <ol className="fp-eventos">
              {q.data.eventos.map((e) => (
                <li key={e.id}>
                  <time className="conv-mono">{bogota(e.ocurrio_en)}</time>
                  <span>
                    {EVENTOS[e.tipo] ?? e.tipo}
                    {e.firmante_id && nombres.get(e.firmante_id) ? <span className="conv-sub"> · {nombres.get(e.firmante_id)}</span> : null}
                    {e.ip ? <span className="conv-sub conv-mono"> · {e.ip}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="fp-h3">Certificado de sello de la UDES</h3>
            {cert.isLoading ? <p className="conv-sub">Consultando…</p> : null}
            {cert.error ? <p className="conv-error">{nombreDe(cert.error)}</p> : null}
            {cert.data ? <EstadoCertificado c={cert.data} /> : null}
          </div>
        </div>
      ) : null}
    </Ventana>
  );
}

function EstadoCertificado({ c }: { c: EstadoCertUdes }) {
  if (!c.configurado) return <p className="conv-nota">{c.mensaje ?? "Todavía no hay un certificado de sello cargado."}</p>;
  return (
    <div className="fp-cert">
      <dl>
        <dt>Sujeto</dt><dd>{c.sujeto}</dd>
        <dt>Emisor</dt><dd>{c.emisor}</dd>
        <dt>Serie</dt><dd className="conv-mono">{c.serie}</dd>
        <dt>Vigencia</dt><dd>{corta(c.desde)} – {corta(c.hasta)} <span className={`conv-pill ${c.vigente ? "conv-pill--ok" : "conv-pill--bad"}`}>{c.vigente ? "Vigente" : "No vigente"}</span></dd>
        <dt>Sello de tiempo</dt><dd>{c.sello_de_tiempo?.configurado ? `Activo (${c.sello_de_tiempo.servidor ?? "servidor externo"})` : "No configurado: se usa la hora del servidor de la UDES"}</dd>
        <dt>Conversión a PDF</dt><dd>{c.gotenberg?.configurado ? (c.gotenberg.disponible ? "Disponible" : "Configurada, pero no responde") : "No configurada"}</dd>
        <dt>Correo</dt><dd>{c.correo?.disponible ? `Disponible (${c.correo.modo ?? "—"})` : `No disponible${c.correo?.error ? `: ${c.correo.error}` : ""}`}</dd>
      </dl>
      {c.autofirmado ? <p className="conv-sub fp-interno">Uso interno: el certificado actual es autofirmado, por lo que los lectores de PDF no lo reconocerán como emitido por una entidad acreditada. {c.nota ?? ""}</p> : null}
    </div>
  );
}

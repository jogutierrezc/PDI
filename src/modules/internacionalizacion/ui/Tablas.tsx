/* =============================================================================
   Internacionalización · Tablas: estantería de libros y hojas tipo Excel.

   A la izquierda, los libros (tablas). A la derecha, el libro abierto: su
   cabecera, la barra de envío del campus elegido (estado, ventana, acciones
   según el papel, historial), la grilla y, abajo, las pestañas de hojas como
   en Excel. Libro, hoja y campus viajan en la dirección (?libro=&hoja=&campus=).
     · Gestor: captura y carga Excel en su campus y lo envía.
     · Coordinador: corrige mientras está enviado; valida o devuelve con nota.
     · Director: crea tablas y hojas, aprueba, devuelve y reabre con motivo.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useEntrada, useFundido, usePresion } from "./movimiento";
import {
  FaltaMigracion,
  useBorrarFilas,
  useBorrarLibro,
  useCambiarEstado,
  useConceptos,
  useEnvios,
  useEstructura,
  useFilas,
  useGuardarFilas,
  useHistorial,
  useNombres,
  useVentanas,
} from "../datos";
import { ETIQUETA_ROL, ventanaVigente } from "../lib/permisos";
import type { IntEstado, LibroCompleto } from "../tipos";
import { AvisoMigracion, Cargando, Confirmar, ErrorCaja, EstadoPill, fmt, nombreCampus, useAviso, Vacio } from "./comunes";
import type { Ctx } from "./comunes";
import { CargaExcel } from "./CargaExcel";
import { Hoja } from "./Hoja";
import { accionesEnvio, diasHasta, escrituraPorCampus, fechaCorta, momento, PARTIDAS, transicion } from "./logica";
import type { AccionEnvio } from "./logica";
import { NuevaTabla } from "./NuevaTabla";

const CLASE: Record<string, string> = { movilidad: "Movilidad", convenio: "Convenio", general: "General" };

export function Tablas({ ctx }: { ctx: Ctx }) {
  const [params, setParams] = useSearchParams();
  const estructura = useEstructura();
  const conceptos = useConceptos();
  const ventanas = useVentanas(ctx.periodo?.id);
  const envios = useEnvios(ctx.periodo?.id);
  const [panel, setPanel] = useState<null | "tabla" | "hoja" | "excel">(null);
  const [nuevaFila, setNuevaFila] = useState(0);
  const aviso = useAviso();
  const raiz = useRef<HTMLDivElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);

  const libros = estructura.data ?? [];
  const libro = libros.find((l) => l.id === params.get("libro")) ?? libros[0] ?? null;
  const hoja = libro?.hojas.find((h) => h.id === params.get("hoja")) ?? libro?.hojas[0] ?? null;
  const unico = ctx.visibles.length === 1 ? ctx.visibles[0].id : "";
  const campusSel = ctx.visibles.some((c) => c.id === params.get("campus")) ? params.get("campus")! : unico;
  const filas = useFilas(hoja?.id, ctx.periodo?.id);

  useEntrada(raiz, "[data-entra]", Boolean(estructura.data));
  useFundido(hojaRef, `${libro?.id}-${hoja?.id}`);
  usePresion(raiz, ".it-libros button, .it-pestanas-hoja button, .it-campus-sel button");

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const escritura = useMemo(
    () =>
      hoja && libro
        ? escrituraPorCampus({ yo: ctx.yo, campus: ctx.visibles.map((c) => c.id), hoja, libro, periodo: ctx.periodo, ventanas: ventanas.data ?? [], envios: envios.data ?? [] })
        : [],
    [hoja, libro, ctx, ventanas.data, envios.data],
  );

  const error = estructura.error ?? conceptos.error;
  if (error instanceof FaltaMigracion) return <AvisoMigracion error={error} />;
  if (error) return <ErrorCaja error={error} />;
  if (!estructura.data || !conceptos.data) return <Cargando texto="Abriendo las tablas…" />;

  const personales = new Set(conceptos.data.filter((c) => c.personal).map((c) => c.id));
  const filasVisibles = (filas.data ?? []).filter((f) => (campusSel ? f.campus_id === campusSel : ctx.visibles.some((c) => c.id === f.campus_id)));
  const escribibles = escritura.filter((e) => !e.bloqueo).map((e) => e.campus_id);
  const campusNuevo = campusSel ? (escribibles.includes(campusSel) ? campusSel : null) : escribibles.length === 1 ? escribibles[0] : (escribibles[0] ?? null);

  const cerrarPanel = () => setPanel(null);

  return (
    <div ref={raiz} className="it-tablas">
      <aside className="it-libros" aria-label="Tablas del repositorio" data-entra>
        <h2 className="it-libros__titulo">Tablas</h2>
        {libros.length === 0 && <p className="it-tenue">{ctx.director ? "Aún no hay tablas. Cree la primera o cárguela desde Excel." : "El Director todavía no ha creado tablas."}</p>}
        <ul>
          {libros.map((l) => (
            <li key={l.id}>
              <button type="button" aria-current={l.id === libro?.id ? "true" : undefined} onClick={() => ir({ libro: l.id, hoja: null })}>
                <b>{l.nombre}</b>
                <small>
                  {l.hojas.length === 1 ? "1 hoja" : `${l.hojas.length} hojas`} · {l.captura === "oficina" ? "solo la oficina" : "cada campus"}
                </small>
                <ResumenLibro libro={l} ctx={ctx} envios={envios.data ?? []} />
              </button>
            </li>
          ))}
        </ul>
        {ctx.director && (
          <div className="it-libros__acciones">
            <button type="button" className="button-primary it-btn" onClick={() => setPanel("tabla")}>
              <Icon name="plus" size={16} aria-hidden="true" /> Nueva tabla
            </button>
            <button type="button" className="button-secondary it-btn" onClick={() => setPanel("excel")}>
              <Icon name="upload" size={16} aria-hidden="true" /> Desde Excel
            </button>
          </div>
        )}
      </aside>

      <div ref={hojaRef} className="it-libro">
        {!libro ? (
          <Vacio titulo="Ninguna tabla abierta.">
            {ctx.director
              ? "Cree una tabla con «Nueva tabla» (eligiendo los conceptos del catálogo) o súbala con «Desde Excel»: el importador empareja cada encabezado con su concepto."
              : "Cuando el Director cree las tablas, aquí capturará las filas de su campus."}
          </Vacio>
        ) : (
          <>
            <CabezaLibro libro={libro} hoja={hoja} ctx={ctx} aviso={aviso} onNuevaHoja={() => setPanel("hoja")} />
            {hoja && ctx.periodo ? (
              <>
                <BarraEnvio
                  ctx={ctx}
                  hojaId={hoja.id}
                  escritura={escritura}
                  campusSel={campusSel}
                  ventanas={ventanas.data ?? []}
                  onCampus={(id) => ir({ campus: id || null })}
                  aviso={aviso}
                />
                <div className="it-herramientas">
                  <button type="button" className="button-secondary it-btn" disabled={!escribibles.length} onClick={() => setPanel("excel")}>
                    <Icon name="upload" size={16} aria-hidden="true" /> Cargar Excel
                  </button>
                  <button type="button" className="button-secondary it-btn" disabled={!campusNuevo} onClick={() => setNuevaFila((n) => n + 1)}>
                    <Icon name="plus" size={16} aria-hidden="true" /> Fila{campusNuevo && ctx.visibles.length > 1 ? ` en ${nombreCampus(ctx.campus, campusNuevo)}` : ""}
                  </button>
                  <span className="it-espacio" />
                  {aviso.nodo}
                </div>
                {filas.error ? (
                  <ErrorCaja error={filas.error} />
                ) : !filas.data ? (
                  <Cargando texto="Trayendo las filas…" />
                ) : (
                  <HojaConGuardado key={`${hoja.id}-${ctx.periodo.id}-${campusSel}`} hoja={hoja} ctx={ctx} filas={filasVisibles} escritura={escritura} campusNuevo={campusNuevo} personales={personales} nuevaFila={nuevaFila} aviso={aviso} />
                )}
              </>
            ) : hoja ? (
              <Vacio titulo="No hay periodo.">Las filas se capturan por periodo. El Director abre el periodo en «Periodos».</Vacio>
            ) : (
              <Vacio titulo="Esta tabla no tiene hojas.">{ctx.director ? "Agregue una hoja con «Nueva hoja»." : "El Director debe agregarle una hoja."}</Vacio>
            )}
            <nav className="it-pestanas-hoja" aria-label="Hojas de la tabla">
              {libro.hojas.map((h) => (
                <button key={h.id} type="button" aria-current={h.id === hoja?.id ? "true" : undefined} onClick={() => ir({ hoja: h.id })}>
                  {h.nombre}
                  <small>{h.clase === "movilidad" ? `movilidad ${h.sentido ?? ""}`.trim() : CLASE[h.clase].toLowerCase()}</small>
                </button>
              ))}
              {ctx.director && (
                <button type="button" className="it-pestanas-hoja__nueva" onClick={() => setPanel("hoja")}>
                  <Icon name="plus" size={14} aria-hidden="true" /> Nueva hoja
                </button>
              )}
            </nav>
          </>
        )}
      </div>

      {panel === "tabla" && (
        <NuevaTabla
          conceptos={conceptos.data}
          onCerrar={cerrarPanel}
          onCreada={(id) => {
            cerrarPanel();
            ir({ libro: id, hoja: null });
            aviso.ok("Tabla creada. Defina su ventana de captura en «Periodos».");
          }}
        />
      )}
      {panel === "hoja" && libro && (
        <NuevaTabla
          libro={libro}
          conceptos={conceptos.data}
          onCerrar={cerrarPanel}
          onCreada={(_l, h) => {
            cerrarPanel();
            ir({ hoja: h ?? null });
            aviso.ok("Hoja creada.");
          }}
        />
      )}
      {panel === "excel" && (
        <CargaExcel
          ctx={ctx}
          estructura={libros}
          libro={libro}
          hojaActual={hoja?.id ?? null}
          ventanas={ventanas.data ?? []}
          envios={envios.data ?? []}
          conceptos={conceptos.data}
          onCerrar={cerrarPanel}
          onListo={(libroId, hojaId, mensaje) => {
            cerrarPanel();
            ir({ libro: libroId, hoja: hojaId });
            aviso.ok(mensaje);
          }}
        />
      )}
    </div>
  );
}

/** Estado de las hojas del libro en los campus que se ven: «3 de 8 aprobadas». */
function ResumenLibro({ libro, ctx, envios }: { libro: LibroCompleto; ctx: Ctx; envios: { hoja_id: string; campus_id: string; estado: IntEstado }[] }) {
  const total = libro.hojas.length * ctx.visibles.length;
  if (!total) return null;
  const aprobadas = envios.filter((e) => e.estado === "aprobado" && libro.hojas.some((h) => h.id === e.hoja_id) && ctx.visibles.some((c) => c.id === e.campus_id)).length;
  return (
    <span className="it-libros__medidor" aria-label={`${aprobadas} de ${total} aprobadas`}>
      <i style={{ width: `${(aprobadas / total) * 100}%` }} />
    </span>
  );
}

function CabezaLibro({
  libro,
  hoja,
  ctx,
  aviso,
  onNuevaHoja,
}: {
  libro: LibroCompleto;
  hoja: LibroCompleto["hojas"][number] | null;
  ctx: Ctx;
  aviso: ReturnType<typeof useAviso>;
  onNuevaHoja: () => void;
}) {
  const [borrar, setBorrar] = useState(false);
  const borrarLibro = useBorrarLibro();
  const partida = hoja ? Object.values(PARTIDAS).find((p) => p.clase === hoja.clase && p.sentido === hoja.sentido) : null;
  return (
    <header className="it-libro__cabeza">
      <div>
        <h2 className="it-h2">{libro.nombre}</h2>
        <p className="it-sub">
          {libro.captura === "oficina" ? "Captura solo la oficina principal" : "Cada campus captura sus filas"}
          {hoja && ` · hoja «${hoja.nombre}»: ${partida?.rotulo ?? CLASE[hoja.clase]} — ${partida?.ayuda ?? ""}`}
        </p>
      </div>
      {ctx.director && (
        <div className="it-fila">
          <button type="button" className="button-secondary it-btn" onClick={onNuevaHoja}>
            <Icon name="plus" size={16} aria-hidden="true" /> Nueva hoja
          </button>
          <button type="button" className="button-ghost it-btn it-btn--quitar" onClick={() => setBorrar(true)}>
            Borrar tabla
          </button>
        </div>
      )}
      {borrar && (
        <Confirmar
          pregunta={`¿Borrar la tabla «${libro.nombre}»?`}
          detalle="Se borran sus hojas y todas sus filas, de todos los periodos y campus. Si alguna hoja está aprobada, la base no lo deja: reábrala primero."
          si="Sí, borrar la tabla"
          ocupado={borrarLibro.isPending}
          onNo={() => setBorrar(false)}
          onSi={() =>
            borrarLibro.mutate(libro.id, {
              onSuccess: () => aviso.ok(`Se borró «${libro.nombre}».`),
              onError: (e) => aviso.mal(e),
              onSettled: () => setBorrar(false),
            })
          }
        />
      )}
    </header>
  );
}

/**
 * La barra de envío: un chip por campus visible (estado y ventana), y para el
 * campus elegido las acciones que su papel permite. Devolver y reabrir piden
 * nota. Debajo, el historial de estados de la hoja.
 */
function BarraEnvio({
  ctx,
  hojaId,
  escritura,
  campusSel,
  ventanas,
  onCampus,
  aviso,
}: {
  ctx: Ctx;
  hojaId: string;
  escritura: ReturnType<typeof escrituraPorCampus>;
  campusSel: string;
  ventanas: Parameters<typeof ventanaVigente>[0];
  onCampus: (id: string) => void;
  aviso: ReturnType<typeof useAviso>;
}) {
  const [nota, setNota] = useState<{ accion: AccionEnvio; texto: string } | null>(null);
  const cambiar = useCambiarEstado();
  const historial = useHistorial(ctx.periodo?.id);
  const deHoja = (historial.data ?? []).filter((x) => x.hoja_id === hojaId && (!campusSel || x.campus_id === campusSel));
  const nombres = useNombres(deHoja.map((x) => x.actor));
  const sel = escritura.find((e) => e.campus_id === campusSel);
  const acciones = sel ? accionesEnvio(sel.estado, sel.rol) : [];
  const ventana = sel && ctx.periodo ? ventanaVigente(ventanas, ctx.periodo.id, hojaId, sel.campus_id) : null;
  const dias = diasHasta(ventana?.cierra);

  const ejecutar = (a: AccionEnvio, texto?: string) => {
    if (!ctx.periodo || !sel) return;
    cambiar.mutate(
      { periodo: ctx.periodo.id, hoja: hojaId, campus: sel.campus_id, estado: a.a, nota: texto },
      {
        onSuccess: () => {
          aviso.ok(`${nombreCampus(ctx.campus, sel.campus_id)}: ${transicion(sel.estado, a.a)}.`);
          setNota(null);
        },
        onError: (e) => aviso.mal(e),
      },
    );
  };

  return (
    <section className="it-envio" aria-label="Envío y validación">
      <div className="it-campus-sel" role="group" aria-label="Campus">
        {ctx.visibles.length > 1 && (
          <button type="button" aria-pressed={!campusSel} onClick={() => onCampus("")}>
            <b>Todos</b>
            <small>ver todas las filas</small>
          </button>
        )}
        {escritura.map((e) => {
          const v = ctx.periodo ? ventanaVigente(ventanas, ctx.periodo.id, hojaId, e.campus_id) : null;
          return (
            <button key={e.campus_id} type="button" aria-pressed={campusSel === e.campus_id} onClick={() => onCampus(e.campus_id)}>
              <b>{nombreCampus(ctx.campus, e.campus_id)}</b>
              <EstadoPill estado={e.estado} />
              <small className={e.abierta ? "is-abierta" : undefined}>{v ? (e.abierta ? `abierta hasta ${fechaCorta(v.cierra)}` : `cerrada · ${fechaCorta(v.abre)}–${fechaCorta(v.cierra)}`) : "sin ventana"}</small>
            </button>
          );
        })}
      </div>

      {!sel ? (
        <p className="it-envio__ayuda">Elija un campus para enviar, validar o aprobar su hoja.</p>
      ) : (
        <div className="it-envio__barra">
          <div className="it-envio__dice">
            <EstadoPill estado={sel.estado} />
            <span>
              {sel.rol ? `Usted: ${ETIQUETA_ROL[sel.rol]}` : "Solo lectura"} ·{" "}
              {ventana
                ? sel.abierta
                  ? `ventana abierta hasta el ${fechaCorta(ventana.cierra)}${dias !== null && dias <= 7 ? ` (${dias === 0 ? "cierra hoy" : dias === 1 ? "queda 1 día" : `quedan ${dias} días`})` : ""}`
                  : `ventana cerrada (${fechaCorta(ventana.abre)} a ${fechaCorta(ventana.cierra)})`
                : "sin ventana de captura: el Director la define en Periodos"}
            </span>
            {sel.bloqueo && <small className="it-tenue">{sel.bloqueo}</small>}
          </div>
          <div className="it-fila">
            {acciones.map((a) => (
              <button
                key={a.a}
                type="button"
                className={a.principal ? "button-primary it-btn" : "button-secondary it-btn"}
                disabled={cambiar.isPending}
                onClick={() => (a.nota ? setNota({ accion: a, texto: "" }) : ejecutar(a))}
              >
                {a.rotulo}
              </button>
            ))}
            {acciones.length === 0 && <span className="it-tenue">{sel.estado === "aprobado" ? "Aprobada: ya cuenta en Cifras." : "Ninguna acción para su papel en este estado."}</span>}
          </div>
        </div>
      )}

      {nota && sel && (
        <form
          className="it-nota-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (nota.texto.trim().length >= 3) ejecutar(nota.accion, nota.texto.trim());
          }}
        >
          <label className="it-campo">
            <span>{nota.accion.rotulo === "Reabrir" ? "Motivo de la reapertura (queda en el historial)" : "Nota para el campus: qué debe corregir"}</span>
            <textarea autoFocus rows={2} value={nota.texto} onChange={(e) => setNota({ ...nota, texto: e.target.value })} />
          </label>
          <div className="it-fila">
            <button type="button" className="button-secondary it-btn" onClick={() => setNota(null)}>
              Cancelar
            </button>
            <button type="submit" className="button-primary it-btn" disabled={nota.texto.trim().length < 3 || cambiar.isPending}>
              {nota.accion.rotulo}
            </button>
          </div>
        </form>
      )}

      <details className="it-historial">
        <summary>
          Historial de estados {deHoja.length > 0 && <span className="it-num">({fmt(deHoja.length)})</span>}
        </summary>
        {deHoja.length === 0 ? (
          <p className="it-tenue">Sin movimientos todavía en este periodo.</p>
        ) : (
          <ol>
            {deHoja.map((x) => (
              <li key={x.id}>
                <span className="it-num it-tenue">{momento(x.en)}</span>
                <b>{transicion(x.de, x.a)}</b>
                <span>{nombreCampus(ctx.campus, x.campus_id)}</span>
                <span className="it-tenue">
                  {x.actor ? (nombres.data?.[x.actor] ?? "Persona") : "Sistema"}
                  {x.actor_rol && ` · ${ETIQUETA_ROL[x.actor_rol]}`}
                </span>
                {x.nota && <q>{x.nota}</q>}
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}

function HojaConGuardado({
  hoja,
  ctx,
  filas,
  escritura,
  campusNuevo,
  personales,
  nuevaFila,
  aviso,
}: {
  hoja: LibroCompleto["hojas"][number];
  ctx: Ctx;
  filas: NonNullable<ReturnType<typeof useFilas>["data"]>;
  escritura: ReturnType<typeof escrituraPorCampus>;
  campusNuevo: string | null;
  personales: Set<string>;
  nuevaFila: number;
  aviso: ReturnType<typeof useAviso>;
}) {
  const guardar = useGuardarFilas();
  const borrar = useBorrarFilas();
  const periodo = ctx.periodo!;
  return (
    <Hoja
      columnas={hoja.columnas}
      filas={filas}
      campus={ctx.campus}
      escritura={escritura}
      campusNuevo={campusNuevo}
      personales={personales}
      guardando={guardar.isPending || borrar.isPending}
      agregarFila={nuevaFila}
      onGuardar={async (lista) => {
        try {
          const r = await guardar.mutateAsync({ hoja: hoja.id, periodo: periodo.id, filas: lista, origen: "manual" });
          aviso.ok(`Guardado: ${fmt(r.insertadas)} nuevas, ${fmt(r.actualizadas)} cambiadas.`);
        } catch (e) {
          aviso.mal(e);
          throw e;
        }
      }}
      onBorrar={async (ids) => {
        try {
          await borrar.mutateAsync({ ids, hoja: hoja.id, periodo: periodo.id });
          aviso.ok(ids.length === 1 ? "Se quitó 1 fila." : `Se quitaron ${fmt(ids.length)} filas.`);
        } catch (e) {
          aviso.mal(e);
          throw e;
        }
      }}
    />
  );
}

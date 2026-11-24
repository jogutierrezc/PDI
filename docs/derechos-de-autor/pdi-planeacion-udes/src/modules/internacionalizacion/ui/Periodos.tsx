/* =============================================================================
   Internacionalización · Periodos: cuándo captura cada campus.

   Arriba, la cinta de periodos sucesivos (2026-1, 2026-2…), cada uno con su
   estado; el Director abre uno nuevo, cierra el elegido o lo reabre con
   motivo. Debajo, la línea de tiempo del periodo: una fila por hoja con su
   ventana general, las ventanas propias de un campus (mandan sobre la
   general), la marca de «hoy» y el estado de cada campus. El Director define
   o corrige la ventana de cada hoja (para todos o para un campus); alargar
   una vencida pasa por int_reabrir y pide motivo. Al final, las reaperturas
   del periodo: qué se reabrió, quién y por qué.
   ========================================================================== */

import { Fragment, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import {
  FaltaMigracion,
  useBorrarVentana,
  useEnvios,
  useEstructura,
  useGuardarPeriodo,
  useGuardarVentana,
  useNombres,
  useReabrir,
  useReaperturas,
  useVentanas,
} from "../datos";
import { hoyBogota } from "../lib/permisos";
import type { IntPeriodoRow, IntVentanaRow, LibroCompleto } from "../tipos";
import { AvisoMigracion, Cargando, Confirmar, ErrorCaja, EstadoPill, nombreCampus, useAviso, Vacio } from "./comunes";
import type { Ctx } from "./comunes";
import { diasHasta, escalaTiempo, fechaCorta, momento } from "./logica";
import { useCrecer, useEntrada } from "./movimiento";

type Hoja = LibroCompleto["hojas"][number] & { libro: string };

const TIPO_REAPERTURA: Record<string, string> = { periodo: "Periodo", ventana: "Ventana", envio: "Hoja aprobada" };

/** El siguiente código de periodo: 2026-1 → 2026-2 → 2027-1. */
export function siguienteCodigo(periodos: readonly Pick<IntPeriodoRow, "codigo">[], hoy = hoyBogota()): string {
  const ultimo = [...periodos].map((p) => p.codigo).filter((c) => /^\d{4}-[12]$/.test(c)).sort().pop();
  if (!ultimo) return `${hoy.slice(0, 4)}-${Number(hoy.slice(5, 7)) <= 6 ? 1 : 2}`;
  const [a, s] = ultimo.split("-").map(Number);
  return s === 1 ? `${a}-2` : `${a + 1}-1`;
}

export function Periodos({ ctx }: { ctx: Ctx }) {
  const { periodo } = ctx;
  const estructura = useEstructura();
  const ventanas = useVentanas(periodo?.id);
  const envios = useEnvios(periodo?.id);
  const reaperturas = useReaperturas(periodo?.id);
  const nombres = useNombres((reaperturas.data ?? []).map((r) => r.actor));
  const aviso = useAviso();
  const raiz = useRef<HTMLDivElement>(null);
  const [nuevo, setNuevo] = useState(false);
  useEntrada(raiz, "[data-entra]", `${periodo?.id}-${Boolean(estructura.data && ventanas.data)}`);
  useCrecer(raiz, "[data-crece]", { clave: `${periodo?.id}-${Boolean(ventanas.data)}` });

  const hojas: Hoja[] = useMemo(() => (estructura.data ?? []).flatMap((l) => l.hojas.map((h) => ({ ...h, libro: l.nombre }))), [estructura.data]);
  const escala = useMemo(
    () => escalaTiempo([periodo?.abre, periodo?.cierra, ...(ventanas.data ?? []).flatMap((v) => [v.abre, v.cierra])]),
    [periodo?.abre, periodo?.cierra, ventanas.data],
  );

  const error = estructura.error ?? ventanas.error ?? envios.error;
  if (error instanceof FaltaMigracion) return <AvisoMigracion error={error} />;
  if (error) return <ErrorCaja error={error} />;

  const hoy = hoyBogota();
  const sinVentana = hojas.filter((h) => !(ventanas.data ?? []).some((v) => v.hoja_id === h.id));

  return (
    <div ref={raiz} className="it-periodos">
      <Cinta ctx={ctx} onNuevo={() => setNuevo(true)} aviso={aviso} />
      {nuevo && ctx.director && <NuevoPeriodo ctx={ctx} onCerrar={() => setNuevo(false)} aviso={aviso} />}
      {aviso.nodo}

      {!periodo ? (
        <Vacio titulo="Aún no hay periodos.">
          {ctx.director
            ? "Abra el primero con «Abrir periodo». Después defina la ventana de captura de cada hoja: sin ventana, los campus no capturan."
            : "El Director de Internacionalización abre los periodos y define cuándo captura cada campus."}
        </Vacio>
      ) : !estructura.data || !ventanas.data || !envios.data ? (
        <Cargando texto="Leyendo las ventanas del periodo…" />
      ) : hojas.length === 0 ? (
        <Vacio titulo="El repositorio no tiene hojas todavía.">Las ventanas se definen por hoja. Cree las tablas en «Tablas».</Vacio>
      ) : (
        <>
          <section className="it-panel it-linea" aria-labelledby="it-linea-titulo" data-entra>
            <header className="it-panel__cabeza">
              <div>
                <h3 id="it-linea-titulo">Ventanas de captura de {periodo.codigo}</h3>
                <p className="it-sub">
                  {periodo.abre || periodo.cierra ? `Periodo del ${fechaCorta(periodo.abre)} al ${fechaCorta(periodo.cierra)} · ` : ""}
                  Una ventana propia de un campus manda sobre la general de la hoja.
                </p>
              </div>
              {ctx.director && sinVentana.length > 0 && periodo.estado === "abierto" && (
                <VentanaParaTodas ctx={ctx} periodo={periodo} hojas={sinVentana} aviso={aviso} />
              )}
            </header>
            <div className="it-linea__marco">
              <div className="it-linea__rejilla" role="table" aria-label={`Ventanas de captura de ${periodo.codigo}`}>
                <div className="it-linea__fila it-linea__meses" role="row">
                  <span role="columnheader">Hoja</span>
                  <span role="columnheader" className="it-linea__pista">
                    {escala.meses.map((m) => (
                      <span key={`${m.rotulo}-${m.pos}`} className="it-linea__mes" style={{ left: `${m.pos}%`, width: `${m.ancho}%` }}>
                        {m.rotulo}
                      </span>
                    ))}
                    <span className="it-linea__hoy" style={{ left: `${escala.pos(hoy)}%` }}>
                      <b>Hoy</b>
                    </span>
                  </span>
                </div>
                {hojas.map((h) => (
                  <FilaHoja key={h.id} hoja={h} ctx={ctx} periodo={periodo} ventanas={ventanas.data!} envios={envios.data!} escala={escala} aviso={aviso} />
                ))}
              </div>
            </div>
            <ul className="it-leyenda it-panel__cuerpo">
              <li>
                <i className="is-abierta" aria-hidden="true" /> Ventana abierta hoy
              </li>
              <li>
                <i className="is-proxima" aria-hidden="true" /> Por abrir
              </li>
              <li>
                <i className="is-cerrada" aria-hidden="true" /> Cerrada
              </li>
              <li>
                <i className="is-hoy" aria-hidden="true" /> Hoy, {fechaCorta(hoy)}
              </li>
            </ul>
          </section>

          <section className="it-panel" aria-labelledby="it-reab-titulo" data-entra>
            <header className="it-panel__cabeza">
              <h3 id="it-reab-titulo">Reaperturas de {periodo.codigo}</h3>
            </header>
            <div className="it-panel__cuerpo">
              {reaperturas.error ? (
                <ErrorCaja error={reaperturas.error} />
              ) : !reaperturas.data ? (
                <Cargando />
              ) : reaperturas.data.length === 0 ? (
                <p className="it-tenue">Nada se ha reabierto en este periodo. Cada reapertura (periodo, ventana vencida u hoja aprobada) queda aquí con su motivo.</p>
              ) : (
                <ol className="it-registro">
                  {reaperturas.data.map((r) => (
                    <li key={r.id}>
                      <span className="it-num it-tenue">{momento(r.en)}</span>
                      <b>{TIPO_REAPERTURA[r.tipo] ?? r.tipo}</b>
                      <span>
                        {r.hoja_id ? (hojas.find((h) => h.id === r.hoja_id)?.nombre ?? "Hoja") : "Todo el periodo"}
                        {r.hoja_id && ` · ${r.campus_id ? nombreCampus(ctx.campus, r.campus_id) : "todos los campus"}`}
                      </span>
                      <span className="it-tenue">{r.actor ? (nombres.data?.[r.actor] ?? "Persona") : "Sistema"}</span>
                      <q>{r.motivo}</q>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ---------- Cinta de periodos --------------------------------------------- */

function Cinta({ ctx, onNuevo, aviso }: { ctx: Ctx; onNuevo: () => void; aviso: ReturnType<typeof useAviso> }) {
  const { periodo } = ctx;
  const guardar = useGuardarPeriodo();
  const reabrir = useReabrir();
  const [cerrar, setCerrar] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const orden = [...ctx.periodos].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const dias = diasHasta(periodo?.cierra);

  return (
    <section className="it-cinta" aria-label="Periodos" data-entra>
      <ol className="it-cinta__lista">
        {orden.map((p) => (
          <li key={p.id} aria-current={p.id === periodo?.id ? "true" : undefined}>
            <Link to={`/admin/internacionalizacion/periodos?periodo=${encodeURIComponent(p.codigo)}`}>
              <b className="it-num">{p.codigo}</b>
              <small className={p.estado === "abierto" ? "is-abierta" : undefined}>
                <span aria-hidden="true">{p.estado === "abierto" ? "●" : "○"}</span> {p.estado === "abierto" ? "Abierto" : "Cerrado"}
              </small>
            </Link>
          </li>
        ))}
      </ol>
      {periodo && (
        <p className="it-cinta__dice">
          <b>{periodo.nombre || periodo.codigo}</b>
          {periodo.estado === "abierto"
            ? dias === null
              ? " · abierto, sin fecha de cierre"
              : dias < 0
                ? ` · abierto; su fecha de cierre (${fechaCorta(periodo.cierra)}) ya pasó`
                : ` · abierto, cierra el ${fechaCorta(periodo.cierra)}${dias <= 14 ? ` (${dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`})` : ""}`
            : " · cerrado: solo el Director escribe; reabrirlo pide motivo"}
        </p>
      )}
      {ctx.director && (
        <div className="it-fila">
          {periodo?.estado === "abierto" && (
            <button type="button" className="button-secondary it-btn" onClick={() => setCerrar(true)}>
              <Icon name="lock" size={16} aria-hidden="true" /> Cerrar {periodo.codigo}
            </button>
          )}
          {periodo?.estado === "cerrado" && (
            <button type="button" className="button-secondary it-btn" onClick={() => setMotivo("")}>
              Reabrir {periodo.codigo}
            </button>
          )}
          <button type="button" className="button-primary it-btn" onClick={onNuevo}>
            <Icon name="plus" size={16} aria-hidden="true" /> Abrir periodo
          </button>
        </div>
      )}
      {cerrar && periodo && (
        <Confirmar
          pregunta={`¿Cerrar el periodo ${periodo.codigo}?`}
          detalle="Los campus dejan de capturar y de enviar en todas las hojas. Lo aprobado sigue contando en Cifras. Reabrirlo después pide un motivo y queda en el historial."
          si={`Sí, cerrar ${periodo.codigo}`}
          ocupado={guardar.isPending}
          onNo={() => setCerrar(false)}
          onSi={() =>
            guardar.mutate(
              { id: periodo.id, codigo: periodo.codigo, estado: "cerrado" },
              { onSuccess: () => aviso.ok(`Periodo ${periodo.codigo} cerrado.`), onError: (e) => aviso.mal(e), onSettled: () => setCerrar(false) },
            )
          }
        />
      )}
      {motivo !== null && periodo && (
        <form
          className="it-nota-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (motivo.trim().length < 3) return;
            reabrir.mutate(
              { periodo: periodo.id, motivo: motivo.trim() },
              { onSuccess: () => (aviso.ok(`Periodo ${periodo.codigo} reabierto.`), setMotivo(null)), onError: (er) => aviso.mal(er) },
            );
          }}
        >
          <label className="it-campo">
            <span>Motivo de la reapertura de {periodo.codigo} (queda en el historial)</span>
            <textarea autoFocus rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <div className="it-fila">
            <button type="button" className="button-secondary it-btn" onClick={() => setMotivo(null)}>
              Cancelar
            </button>
            <button type="submit" className="button-primary it-btn" disabled={motivo.trim().length < 3 || reabrir.isPending}>
              Reabrir
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function NuevoPeriodo({ ctx, onCerrar, aviso }: { ctx: Ctx; onCerrar: () => void; aviso: ReturnType<typeof useAviso> }) {
  const guardar = useGuardarPeriodo();
  const [codigo, setCodigo] = useState(() => siguienteCodigo(ctx.periodos));
  const [abre, setAbre] = useState(hoyBogota());
  const [cierra, setCierra] = useState("");
  const repetido = ctx.periodos.some((p) => p.codigo === codigo.trim());
  const formato = /^\d{4}-[12]$/.test(codigo.trim());
  const fechasMal = Boolean(abre && cierra && cierra < abre);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (repetido || !formato || fechasMal) return;
    guardar.mutate(
      { codigo: codigo.trim(), nombre: `Periodo ${codigo.trim()}`, abre: abre || null, cierra: cierra || null, estado: "abierto" },
      {
        onSuccess: () => {
          aviso.ok(`Periodo ${codigo.trim()} abierto. Defina ahora las ventanas de captura de cada hoja.`);
          onCerrar();
        },
        onError: (er) => aviso.mal(er),
      },
    );
  };

  return (
    <form className="it-panel it-form-periodo" onSubmit={enviar} aria-label="Abrir periodo">
      <div className="it-fila it-fila--campos">
        <label className="it-campo">
          <span>Código</span>
          <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="2026-2" aria-invalid={repetido || !formato || undefined} autoFocus />
        </label>
        <label className="it-campo">
          <span>Abre</span>
          <input type="date" value={abre} onChange={(e) => setAbre(e.target.value)} />
        </label>
        <label className="it-campo">
          <span>Cierra</span>
          <input type="date" value={cierra} min={abre || undefined} onChange={(e) => setCierra(e.target.value)} aria-invalid={fechasMal || undefined} />
        </label>
      </div>
      {repetido && <p className="it-error">Ya existe el periodo {codigo.trim()}.</p>}
      {!formato && codigo.trim() && <p className="it-error">Escriba el código como año, guion y semestre: 2026-2. Así lo reconoce SNIES.</p>}
      {fechasMal && <p className="it-error">La fecha de cierre no puede ser anterior a la de apertura.</p>}
      <p className="it-ayuda">Se pueden tener varios periodos abiertos; cada hoja captura dentro de su propia ventana.</p>
      <div className="it-fila">
        <span className="it-espacio" />
        <button type="button" className="button-secondary it-btn" onClick={onCerrar}>
          Cancelar
        </button>
        <button type="submit" className="button-primary it-btn" disabled={guardar.isPending || repetido || !formato || fechasMal}>
          {guardar.isPending ? "Abriendo…" : `Abrir ${codigo.trim() || "periodo"}`}
        </button>
      </div>
    </form>
  );
}

/* ---------- Una hoja en la línea de tiempo -------------------------------- */

const diaSiguiente = (f: string) => new Date(Date.parse(`${f.slice(0, 10)}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

function estadoVentana(v: Pick<IntVentanaRow, "abre" | "cierra">, hoy: string): "abierta" | "proxima" | "cerrada" {
  return v.cierra < hoy ? "cerrada" : v.abre > hoy ? "proxima" : "abierta";
}

function FilaHoja({
  hoja,
  ctx,
  periodo,
  ventanas,
  envios,
  escala,
  aviso,
}: {
  hoja: Hoja;
  ctx: Ctx;
  periodo: IntPeriodoRow;
  ventanas: IntVentanaRow[];
  envios: ReturnType<typeof useEnvios>["data"] & object;
  escala: ReturnType<typeof escalaTiempo>;
  aviso: ReturnType<typeof useAviso>;
}) {
  const [editar, setEditar] = useState(false);
  const hoy = hoyBogota();
  const propias = ventanas.filter((v) => v.hoja_id === hoja.id).sort((a, b) => (a.campus_id ? 1 : 0) - (b.campus_id ? 1 : 0));
  const general = propias.find((v) => !v.campus_id) ?? null;

  return (
    <Fragment>
      <div className="it-linea__fila" role="row" data-entra>
        <span role="rowheader" className="it-linea__hoja">
          <b>{hoja.nombre}</b>
          <small className="it-tenue">{hoja.libro}</small>
          {general ? (
            <small className="it-num">
              {fechaCorta(general.abre)} → {fechaCorta(general.cierra)}
            </small>
          ) : (
            <small className="is-aviso">Sin ventana: nadie captura</small>
          )}
          {ctx.director && (
            <button type="button" className="it-enlace" aria-expanded={editar} onClick={() => setEditar((x) => !x)}>
              {editar ? "Cerrar" : general ? "Cambiar ventana" : "Definir ventana"}
            </button>
          )}
        </span>
        <span role="cell" className="it-linea__pista">
          {propias.map((v) => {
            const est = estadoVentana(v, hoy);
            const quien = v.campus_id ? nombreCampus(ctx.campus, v.campus_id) : "Todos";
            const izq = escala.pos(v.abre);
            // Hasta el final del día de cierre; nunca más angosta que una marca legible.
            const ancho = Math.max(1.5, escala.pos(diaSiguiente(v.cierra)) - izq);
            return (
              <span
                key={v.id}
                className={`it-linea__ventana is-${est}${v.campus_id ? " is-campus" : ""}`}
                style={{ left: `${izq}%`, width: `${Math.min(100 - izq, ancho)}%` }}
                title={`${quien}: ${fechaCorta(v.abre)} a ${fechaCorta(v.cierra)}`}
                data-crece
              >
                <span>
                  {quien} · {est === "abierta" ? "abierta" : est === "proxima" ? "por abrir" : "cerrada"}
                </span>
              </span>
            );
          })}
          <span className="it-linea__hoy" style={{ left: `${escala.pos(hoy)}%` }} aria-hidden="true" />
          <span className="it-linea__estados">
            {ctx.visibles.map((c) => {
              const e = envios.find((x) => x.hoja_id === hoja.id && x.campus_id === c.id)?.estado ?? "borrador";
              return (
                <span key={c.id} className="it-linea__estado">
                  <EstadoPill estado={e} corto /> {c.name}
                </span>
              );
            })}
          </span>
        </span>
      </div>
      {editar && ctx.director && (
        <div className="it-linea__editor" role="row">
          <span role="cell">
            <EditorVentana hoja={hoja} ctx={ctx} periodo={periodo} propias={propias} aviso={aviso} />
          </span>
        </div>
      )}
    </Fragment>
  );
}

/* ---------- Editor de ventanas de una hoja (Director) --------------------- */

function EditorVentana({
  hoja,
  ctx,
  periodo,
  propias,
  aviso,
}: {
  hoja: Hoja;
  ctx: Ctx;
  periodo: IntPeriodoRow;
  propias: IntVentanaRow[];
  aviso: ReturnType<typeof useAviso>;
}) {
  const guardar = useGuardarVentana();
  const borrar = useBorrarVentana();
  const reabrir = useReabrir();
  const hoy = hoyBogota();
  const [campus, setCampus] = useState<string>("");
  const actual = propias.find((v) => (v.campus_id ?? "") === campus) ?? null;
  const [abre, setAbre] = useState(actual?.abre ?? periodo.abre ?? hoy);
  const [cierra, setCierra] = useState(actual?.cierra ?? periodo.cierra ?? "");
  const [motivo, setMotivo] = useState("");

  // Alargar una ventana ya vencida es una reapertura: la base pide motivo (int_reabrir).
  const esReapertura = Boolean(actual && actual.cierra < hoy && cierra >= hoy);
  const mal = !abre || !cierra ? "Elija las dos fechas." : cierra < abre ? "El cierre no puede ser anterior a la apertura." : null;

  const elegirCampus = (id: string) => {
    setCampus(id);
    const v = propias.find((x) => (x.campus_id ?? "") === id);
    setAbre(v?.abre ?? propias.find((x) => !x.campus_id)?.abre ?? periodo.abre ?? hoy);
    setCierra(v?.cierra ?? propias.find((x) => !x.campus_id)?.cierra ?? periodo.cierra ?? "");
    setMotivo("");
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (mal) return;
    const quien = campus ? nombreCampus(ctx.campus, campus) : "todos los campus";
    if (esReapertura) {
      if (motivo.trim().length < 3) return;
      reabrir.mutate(
        { periodo: periodo.id, motivo: motivo.trim(), hoja: hoja.id, campus: campus || null, cierra },
        { onSuccess: () => aviso.ok(`«${hoja.nombre}» reabierta para ${quien} hasta el ${fechaCorta(cierra)}.`), onError: (er) => aviso.mal(er) },
      );
      return;
    }
    guardar.mutate(
      { id: actual?.id, periodo_id: periodo.id, hoja_id: hoja.id, campus_id: campus || null, abre, cierra },
      { onSuccess: () => aviso.ok(`Ventana de «${hoja.nombre}» para ${quien}: ${fechaCorta(abre)} a ${fechaCorta(cierra)}.`), onError: (er) => aviso.mal(er) },
    );
  };

  return (
    <form className="it-ventana-form" onSubmit={enviar} aria-label={`Ventana de ${hoja.nombre}`}>
      <div className="it-fila it-fila--campos">
        <label className="it-campo">
          <span>Para</span>
          <select value={campus} onChange={(e) => elegirCampus(e.target.value)}>
            <option value="">Todos los campus (general)</option>
            {ctx.campus.map((c) => (
              <option key={c.id} value={c.id}>
                Solo {c.name}
                {propias.some((v) => v.campus_id === c.id) ? " · tiene ventana propia" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="it-campo">
          <span>Abre</span>
          <input type="date" value={abre} onChange={(e) => setAbre(e.target.value)} disabled={esReapertura} />
        </label>
        <label className="it-campo">
          <span>Cierra</span>
          <input type="date" value={cierra} min={abre || undefined} onChange={(e) => setCierra(e.target.value)} aria-invalid={Boolean(mal && cierra) || undefined} />
        </label>
      </div>
      {esReapertura && (
        <label className="it-campo">
          <span>Motivo: la ventana venció el {fechaCorta(actual!.cierra)} y alargarla es una reapertura (queda en el historial)</span>
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Cúcuta pidió una semana más por el cierre del semestre" />
        </label>
      )}
      {mal && cierra && <p className="it-error">{mal}</p>}
      <div className="it-fila">
        {actual && (
          <button
            type="button"
            className="button-ghost it-btn it-btn--quitar"
            disabled={borrar.isPending}
            onClick={() =>
              borrar.mutate(
                { id: actual.id, periodo: periodo.id },
                {
                  onSuccess: () => aviso.ok(campus ? `${nombreCampus(ctx.campus, campus)} vuelve a la ventana general.` : `«${hoja.nombre}» queda sin ventana general.`),
                  onError: (er) => aviso.mal(er),
                },
              )
            }
          >
            {campus ? "Quitar la ventana propia" : "Quitar la ventana"}
          </button>
        )}
        <span className="it-espacio" />
        <button type="submit" className="button-primary it-btn" disabled={Boolean(mal) || guardar.isPending || reabrir.isPending || (esReapertura && motivo.trim().length < 3)}>
          {esReapertura ? "Reabrir con motivo" : actual ? "Guardar ventana" : "Definir ventana"}
        </button>
      </div>
    </form>
  );
}

/** Una sola ventana general para todas las hojas que no tienen (las fechas del periodo). */
function VentanaParaTodas({ ctx, periodo, hojas, aviso }: { ctx: Ctx; periodo: IntPeriodoRow; hojas: Hoja[]; aviso: ReturnType<typeof useAviso> }) {
  const guardar = useGuardarVentana();
  const [abierto, setAbierto] = useState(false);
  const [abre, setAbre] = useState(periodo.abre ?? hoyBogota());
  const [cierra, setCierra] = useState(periodo.cierra ?? "");
  const [ocupado, setOcupado] = useState(false);
  void ctx;
  if (!abierto) {
    return (
      <button type="button" className="button-secondary it-btn" onClick={() => setAbierto(true)}>
        {hojas.length === 1 ? "Ventana para la hoja sin fechas" : `Ventana para las ${hojas.length} hojas sin fechas`}
      </button>
    );
  }
  return (
    <form
      className="it-fila it-fila--campos"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!abre || !cierra || cierra < abre) return;
        setOcupado(true);
        try {
          for (const h of hojas) await guardar.mutateAsync({ periodo_id: periodo.id, hoja_id: h.id, campus_id: null, abre, cierra });
          aviso.ok(`${hojas.length === 1 ? "1 hoja" : `${hojas.length} hojas`} con ventana del ${fechaCorta(abre)} al ${fechaCorta(cierra)}.`);
          setAbierto(false);
        } catch (er) {
          aviso.mal(er);
        } finally {
          setOcupado(false);
        }
      }}
    >
      <label className="it-campo">
        <span>Abre</span>
        <input type="date" value={abre} onChange={(e) => setAbre(e.target.value)} />
      </label>
      <label className="it-campo">
        <span>Cierra</span>
        <input type="date" value={cierra} min={abre} onChange={(e) => setCierra(e.target.value)} />
      </label>
      <button type="button" className="button-ghost it-btn" onClick={() => setAbierto(false)}>
        Cancelar
      </button>
      <button type="submit" className="button-primary it-btn" disabled={ocupado || !abre || !cierra || cierra < abre}>
        {ocupado ? "Guardando…" : "Aplicar a todas"}
      </button>
    </form>
  );
}

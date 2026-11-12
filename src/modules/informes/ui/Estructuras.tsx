/* =============================================================================
   Estructuras de informe · Planeación crea y ajusta las estructuras propias (X1…) y decide
   qué oficinas usan cada plantilla, también las A–D (migración 0279). Las A–D son del código:
   se leen, se copian y se limitan a oficinas; no se editan. La base repite todas las reglas
   (informe_secciones_validas, informe_plantilla_permitida): la validación de aquí solo guía.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { useUnidades } from "../datos";
import { useEliminarEstructura, useEstructuras, useGuardarEstructura, useGuardarUnidadesDePlantilla, usePlantillaUnidades } from "../mejoras-datos";
import { DIMENSIONES_ESTRUCTURA, TIPOS_ESTRUCTURA, moverSeccion, nombreDeTipo, normalizarSecciones, seccionesIniciales, unidadesDePlantilla, validarEstructura } from "../mejoras-logica";
import { PLANTILLAS, TITULO_EVIDENCIAS, escribeInforme, seccionesComoJson } from "../plantillas";
import { normalizar } from "../tablero-logica";
import type { DimId, EstructuraRow, Plantilla, SeccionEstructuraJson, UnidadRef } from "../types";
import { Aviso, Cargando, Vacio, mensajeDe } from "./comunes";

const PLANTILLAS_CODIGO: Plantilla[] = ["A", "B", "C", "D"];

/** Cuántos informes (de cualquier ciclo) usan cada plantilla: con informes, las secciones de una estructura propia no cambian ni se elimina. */
function useConteoPlantillas() {
  return useQuery({
    queryKey: ["informes", "conteo-por-plantilla"],
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const r = await supabase.from("informe_instancias").select("plantilla");
      if (r.error) throw new Error(r.error.message);
      const m = new Map<string, number>();
      for (const f of (r.data as { plantilla: string }[] | null) ?? []) m.set(f.plantilla, (m.get(f.plantilla) ?? 0) + 1);
      return m;
    },
  });
}

type Vista = { tipo: "ver"; id: Plantilla } | { tipo: "nueva"; nonce: number; semilla: Semilla };
interface Semilla {
  nombre: string;
  quien: string;
  destino: string;
  descripcion: string;
  base: Plantilla | null;
  secciones: SeccionEstructuraJson[];
}

const informes = (n: number) => `${n} ${n === 1 ? "informe" : "informes"}`;

export function Estructuras() {
  const { puedeGestionarInformes } = useAuth();
  if (!puedeGestionarInformes) return <Vacio>Las estructuras de informe son de quien gestiona los informes.</Vacio>;
  return <Gestor />;
}

function Gestor() {
  const lectura = useEstructuras();
  const conteo = useConteoPlantillas();
  const unidades = useUnidades();
  const filasPU = usePlantillaUnidades();
  const [vista, setVista] = useState<Vista>({ tipo: "ver", id: "A" });
  const [baseNueva, setBaseNueva] = useState<Plantilla | "">("");

  if (lectura.isPending || unidades.isPending) return <Cargando texto="Cargando las estructuras…" />;
  const fallo = [lectura.error, unidades.error].find((e): e is Error => e instanceof Error);
  if (fallo) return <Aviso error={fallo} />;

  const propias = lectura.data?.filas ?? [];
  const falta = Boolean(lectura.data?.falta);
  const usos = conteo.data ?? new Map<string, number>();

  const nueva = (semilla: Semilla) => setVista({ tipo: "nueva", nonce: Date.now(), semilla });
  const desdeBase = (base: Plantilla | "") =>
    nueva({
      nombre: base ? `Informe de ${PLANTILLAS[base].quien}` : "",
      quien: base ? PLANTILLAS[base].quien : "",
      destino: base ? PLANTILLAS[base].destino : "",
      descripcion: base ? PLANTILLAS[base].descripcion ?? "" : "",
      base: base || null,
      secciones: seccionesIniciales(base),
    });
  const duplicar = (id: Plantilla) => {
    const propia = propias.find((p) => p.plantilla === id);
    if (propia) nueva({ nombre: `${propia.nombre} (copia)`.slice(0, 80), quien: propia.quien, destino: propia.destino, descripcion: propia.descripcion, base: propia.base, secciones: propia.secciones.map((s) => ({ ...s })) });
    else desdeBase(id);
  };

  const seleccionada = vista.tipo === "ver" ? vista.id : null;

  return (
    <div className="inf-est">
      {falta && (
        <p className="inf-error inf-est__falta" role="alert">
          Falta aplicar la migración 0279 (Informes · mejoras). Mientras tanto solo se ven las plantillas A–D y no se puede crear ni limitar nada.
        </p>
      )}
      <aside className="inf-card inf-pad inf-est__lista" aria-label="Estructuras">
        <h3 className="inf-t">Estructuras</h3>
        <p className="inf-sub">Las plantillas A–D vienen de Planeación y no se editan. Las propias las arma usted.</p>
        <div className="inf-est__grupo">
          <span className="inf-eyebrow">Plantillas A–D</span>
          <ul>
            {PLANTILLAS_CODIGO.map((id) => (
              <li key={id}>
                <button type="button" className="inf-est__item" aria-current={seleccionada === id} onClick={() => setVista({ tipo: "ver", id })}>
                  <b>{PLANTILLAS[id].nombre}</b>
                  <small>{PLANTILLAS[id].quien}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="inf-est__grupo">
          <span className="inf-eyebrow">Estructuras propias</span>
          {propias.length === 0 ? (
            <p className="inf-hint">Aún no hay estructuras propias.</p>
          ) : (
            <ul>
              {propias.map((p) => (
                <li key={p.plantilla}>
                  <button type="button" className="inf-est__item" aria-current={seleccionada === p.plantilla} onClick={() => setVista({ tipo: "ver", id: p.plantilla })}>
                    <b>{p.nombre}</b>
                    <small>
                      {p.plantilla} · {p.quien}
                      {!p.activa && " · inactiva"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="inf-est__nueva">
          <label className="inf-lab">
            Partir de
            <select className="inf-in" value={baseNueva} onChange={(e) => setBaseNueva(e.target.value)} disabled={falta}>
              <option value="">En blanco (estructura mínima)</option>
              {PLANTILLAS_CODIGO.map((id) => (
                <option key={id} value={id}>
                  {PLANTILLAS[id].nombre} · {PLANTILLAS[id].quien}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="inf-btn inf-btn--pri" onClick={() => desdeBase(baseNueva)} disabled={falta}>
            Nueva estructura
          </button>
        </div>
      </aside>

      <div className="inf-est__detalle">
        {vista.tipo === "nueva" ? (
          <EditorEstructura key={`nueva-${vista.nonce}`} fila={null} semilla={vista.semilla} usos={0} unidades={unidades.data ?? []} onGuardada={(id) => setVista({ tipo: "ver", id })} onDuplicar={duplicar} onEliminada={() => setVista({ tipo: "ver", id: "A" })} />
        ) : PLANTILLAS_CODIGO.includes(vista.id) ? (
          <LecturaCodigo key={vista.id} id={vista.id} unidades={unidades.data ?? []} faltaMigracion={filasPU.data?.falta ?? false} onCopiar={() => desdeBase(vista.id)} />
        ) : propias.find((p) => p.plantilla === vista.id) ? (
          <EditorEstructura
            key={vista.id}
            fila={propias.find((p) => p.plantilla === vista.id) as EstructuraRow}
            semilla={null}
            usos={usos.get(vista.id) ?? 0}
            unidades={unidades.data ?? []}
            onGuardada={(id) => setVista({ tipo: "ver", id })}
            onDuplicar={duplicar}
            onEliminada={() => setVista({ tipo: "ver", id: "A" })}
          />
        ) : (
          <Vacio>Esa estructura ya no existe.</Vacio>
        )}
      </div>
    </div>
  );
}

/* ---------- Plantillas A–D: solo lectura ------------------------------------------------------- */

function LecturaCodigo({ id, unidades, faltaMigracion, onCopiar }: { id: Plantilla; unidades: UnidadRef[]; faltaMigracion: boolean; onCopiar: () => void }) {
  const def = PLANTILLAS[id];
  const secciones = seccionesComoJson(id);
  return (
    <div className="inf-stack">
      <section className="inf-card inf-pad" aria-labelledby="inf-est-t">
        <span className="inf-eyebrow">Plantilla del código · solo lectura</span>
        <h3 id="inf-est-t" className="inf-t">
          {def.nombre} · {def.quien}
        </h3>
        <p className="inf-sub">
          Se envía a {def.destino}. {def.descripcion ?? ""} No se edita: si necesita otra distribución, cópiela como estructura nueva.
        </p>
        <ol className="inf-est__secs">
          {secciones.map((s, i) => (
            <li key={i}>
              <span className="inf-num">{i + 1}</span>
              <b>{s.titulo}</b>
              <small>{nombreDeTipo(s.tipo)}</small>
            </li>
          ))}
        </ol>
        <div className="inf-row" style={{ marginTop: "var(--space-4)" }}>
          <button type="button" className="inf-btn" onClick={onCopiar}>
            Copiar como estructura nueva
          </button>
        </div>
      </section>
      <QuienUsa plantilla={id} unidades={unidades} faltaMigracion={faltaMigracion} />
    </div>
  );
}

/* ---------- Editor de una estructura propia ---------------------------------------------------- */

function EditorEstructura({
  fila,
  semilla,
  usos,
  unidades,
  onGuardada,
  onDuplicar,
  onEliminada,
}: {
  fila: EstructuraRow | null;
  semilla: Semilla | null;
  usos: number;
  unidades: UnidadRef[];
  onGuardada: (id: Plantilla) => void;
  onDuplicar: (id: Plantilla) => void;
  onEliminada: () => void;
}) {
  const origen = fila ?? semilla;
  const guardar = useGuardarEstructura();
  const eliminar = useEliminarEstructura();
  const [nombre, setNombre] = useState(origen?.nombre ?? "");
  const [quien, setQuien] = useState(origen?.quien ?? "");
  const [destino, setDestino] = useState(origen?.destino ?? "");
  const [descripcion, setDescripcion] = useState(origen?.descripcion ?? "");
  const [activa, setActiva] = useState(fila?.activa ?? true);
  const [secciones, setSecciones] = useState<SeccionEstructuraJson[]>(() => (origen?.secciones ?? []).map((s) => ({ ...s })));
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);
  const [guardado, setGuardado] = useState("");
  const bloqueadas = Boolean(fila) && usos > 0;

  const problemas = useMemo(() => validarEstructura(nombre, secciones), [nombre, secciones]);
  const sinCambios = Boolean(fila) && nombre === fila?.nombre && quien === fila.quien && destino === fila.destino && descripcion === fila.descripcion && activa === fila.activa && JSON.stringify(secciones) === JSON.stringify(fila.secciones);
  const hayPuntos = quien.trim().length === 0 || destino.trim().length === 0;

  const enviar = () => {
    setGuardado("");
    const limpias = normalizarSecciones(secciones).map((s) => (s.columnas ? { ...s, columnas: s.columnas.map((c) => c.trim()).filter(Boolean) } : s));
    const datos = { nombre: nombre.trim(), quien: quien.trim(), destino: destino.trim(), descripcion: descripcion.trim(), activa, ...(bloqueadas ? {} : { secciones: limpias, ...(origen?.base ? { base: origen.base } : {}) }) };
    guardar.mutate(
      { plantilla: fila?.plantilla ?? null, datos },
      {
        onSuccess: (r) => {
          setGuardado("Guardado.");
          if (!fila) onGuardada(r.plantilla);
        },
      },
    );
  };

  const cambiar = (i: number, cambios: Partial<SeccionEstructuraJson>) => setSecciones((l) => l.map((s, n) => (n === i ? { ...s, ...cambios } : s)));
  const agregar = (tipo: SeccionEstructuraJson["tipo"]) =>
    setSecciones((l) => {
      const nueva = seccionNueva(tipo);
      const i = l.findIndex((s) => s.tipo === "anexos");
      return i < 0 ? [...l, nueva] : [...l.slice(0, i), nueva, ...l.slice(i)];
    });

  const motivoNoEliminar = !fila ? "" : usos > 0 ? `Ya tiene ${informes(usos)}: no se puede eliminar. Desactívela para que no se ofrezca, o duplíquela.` : "";

  return (
    <div className="inf-stack">
      <section className="inf-card inf-pad" aria-labelledby="inf-est-ed">
        <span className="inf-eyebrow">{fila ? `Estructura propia · ${fila.plantilla}` : "Estructura nueva"}</span>
        <h3 id="inf-est-ed" className="inf-t">
          {fila ? fila.nombre : "Nueva estructura de informe"}
        </h3>
        {bloqueadas && (
          <p className="inf-aviso inf-est__aviso" role="note">
            <b>Ya hay {informes(usos)} con esta estructura.</b> Sus secciones no se pueden cambiar. Puede ajustar el nombre, quién la diligencia, a quién se envía, la descripción y si está activa; para otra distribución, use «Duplicar».
          </p>
        )}
        <div className="inf-form">
          <label className="inf-lab">
            Nombre
            <input className="inf-in" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
          </label>
          <label className="inf-lab">
            Quién la diligencia
            <input className="inf-in" value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="Ej.: Planeación Institucional" />
          </label>
          <label className="inf-lab">
            A quién se envía
            <input className="inf-in" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Ej.: Vicerrectoría Académica" />
          </label>
        </div>
        <label className="inf-lab" style={{ marginTop: "var(--space-3)" }}>
          Descripción
          <textarea className="inf-in" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
        </label>
        <label className="inf-chk" style={{ marginTop: "var(--space-3)" }}>
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Activa: se ofrece al abrir informes
        </label>
      </section>

      <section className="inf-card inf-pad" aria-labelledby="inf-est-sec">
        <h3 id="inf-est-sec" className="inf-t">
          Secciones del informe
        </h3>
        <p className="inf-sub">En el orden en que aparecen. «Evidencias y fuentes de verificación» es obligatoria y los anexos van siempre al final.</p>
        <ol className="inf-est__editor">
          {secciones.map((s, i) => (
            <FilaSeccion
              key={i}
              n={i}
              s={s}
              total={secciones.length}
              bloqueada={bloqueadas}
              cambiar={(c) => cambiar(i, c)}
              mover={(p) => setSecciones((l) => moverSeccion(l, i, p))}
              quitar={() => setSecciones((l) => l.filter((_, n) => n !== i))}
            />
          ))}
        </ol>
        {!bloqueadas && <AgregarSeccion existentes={secciones} onAgregar={agregar} />}
      </section>

      <section className="inf-card inf-pad inf-est__acciones" aria-label="Guardar">
        {problemas.length > 0 && !bloqueadas && (
          <div className="inf-aviso" role="alert" aria-live="polite">
            <b>Antes de guardar:</b>
            <ul className="inf-est__problemas">
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {hayPuntos && <p className="inf-hint">Indique quién la diligencia y a quién se envía.</p>}
        <div className="inf-row">
          <button type="button" className="inf-btn inf-btn--pri" onClick={enviar} disabled={guardar.isPending || (!bloqueadas && problemas.length > 0) || (bloqueadas && nombre.trim().length < 3) || hayPuntos || sinCambios}>
            {guardar.isPending ? "Guardando…" : fila ? "Guardar cambios" : "Crear la estructura"}
          </button>
          {fila && (
            <button type="button" className="inf-btn" onClick={() => onDuplicar(fila.plantilla)}>
              Duplicar
            </button>
          )}
          {fila && (
            <button type="button" className="inf-btn inf-btn--riesgo" disabled={usos > 0 || eliminar.isPending} onClick={() => setConfirmaBorrar(true)} aria-describedby={motivoNoEliminar ? "inf-est-motivo" : undefined}>
              Eliminar
            </button>
          )}
          {sinCambios && fila && !guardar.isPending && <span className="inf-hint">Sin cambios por guardar.</span>}
          {guardado && !guardar.isPending && !guardar.error && (
            <span className="inf-hint" role="status">
              {guardado}
            </span>
          )}
        </div>
        {motivoNoEliminar && (
          <p id="inf-est-motivo" className="inf-hint">
            {motivoNoEliminar}
          </p>
        )}
        {confirmaBorrar && fila && (
          <div className="inf-est-confirma" role="group" aria-label="Confirmar eliminar la estructura">
            <p>Se elimina «{fila.nombre}» y también la lista de oficinas que la usan. No se puede deshacer.</p>
            <div className="inf-row">
              <button type="button" className="inf-btn inf-btn--sm inf-btn--riesgo" disabled={eliminar.isPending} onClick={() => eliminar.mutate(fila.plantilla, { onSuccess: onEliminada })}>
                {eliminar.isPending ? "Eliminando…" : "Sí, eliminar"}
              </button>
              <button type="button" className="inf-btn inf-btn--sm" onClick={() => setConfirmaBorrar(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {(guardar.error || eliminar.error) && (
          <p className="inf-error" role="alert">
            {mensajeDe(guardar.error ?? eliminar.error)}
          </p>
        )}
      </section>

      {fila ? <QuienUsa plantilla={fila.plantilla} unidades={unidades} faltaMigracion={false} /> : <p className="inf-hint">Cuando guarde la estructura podrá elegir qué oficinas la usan.</p>}
    </div>
  );
}

/** Una sección nueva con lo mínimo que su tipo necesita para pasar la validación. */
function seccionNueva(tipo: SeccionEstructuraJson["tipo"]): SeccionEstructuraJson {
  const titulo = tipo === "evid" ? TITULO_EVIDENCIAS : nombreDeTipo(tipo);
  if (tipo === "narr") return { titulo: "Nueva sección de texto", tipo, extension: "1 a 3 párrafos", minimo: 25 };
  if (tipo === "dim") return { titulo, tipo, dims: ["inv"] };
  if (tipo === "filas") return { titulo: "Tabla de filas", tipo, columnas: ["Punto", "Acción", "Fecha"] };
  return { titulo, tipo };
}

function AgregarSeccion({ existentes, onAgregar }: { existentes: SeccionEstructuraJson[]; onAgregar: (t: SeccionEstructuraJson["tipo"]) => void }) {
  const hay = (t: string) => existentes.some((s) => s.tipo === t);
  const opciones = TIPOS_ESTRUCTURA.filter((t) => !(t.tipo === "evid" && hay("evid")) && !(t.tipo === "anexos" && hay("anexos")));
  const [tipo, setTipo] = useState<SeccionEstructuraJson["tipo"]>("narr");
  const valido = opciones.some((o) => o.tipo === tipo) ? tipo : (opciones[0]?.tipo ?? "narr");
  return (
    <div className="inf-row inf-est__agregar">
      <label className="inf-lab">
        Tipo de la sección nueva
        <select className="inf-in" value={valido} onChange={(e) => setTipo(e.target.value as SeccionEstructuraJson["tipo"])}>
          {opciones.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.nombre}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="inf-btn" onClick={() => onAgregar(valido)}>
        Agregar sección
      </button>
      <p className="inf-hint">{TIPOS_ESTRUCTURA.find((t) => t.tipo === valido)?.ayuda}</p>
    </div>
  );
}

function FilaSeccion({
  n,
  s,
  total,
  bloqueada,
  cambiar,
  mover,
  quitar,
}: {
  n: number;
  s: SeccionEstructuraJson;
  total: number;
  bloqueada: boolean;
  cambiar: (c: Partial<SeccionEstructuraJson>) => void;
  mover: (p: -1 | 1) => void;
  quitar: () => void;
}) {
  const esEvid = s.tipo === "evid";
  const esAnexos = s.tipo === "anexos";
  const ayuda = TIPOS_ESTRUCTURA.find((t) => t.tipo === s.tipo)?.ayuda;
  const cambiarTipo = (tipo: SeccionEstructuraJson["tipo"]) => {
    const base = seccionNueva(tipo);
    cambiar({ tipo, extension: base.extension, minimo: base.minimo, dims: base.dims, columnas: base.columnas, borrador: undefined, consolida: undefined, funcion: undefined });
  };
  const alternarDim = (d: DimId) => {
    const dims = s.dims ?? [];
    cambiar({ dims: dims.includes(d) ? dims.filter((x) => x !== d) : [...dims, d] });
  };
  return (
    <li className="inf-est__sec">
      <div className="inf-est__sec-cab">
        <span className="inf-num inf-est__n">{n + 1}</span>
        <input className="inf-in" value={s.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} disabled={bloqueada} maxLength={120} aria-label={`Título de la sección ${n + 1}`} />
        <select
          className="inf-in inf-est__tipo"
          value={s.tipo}
          disabled={bloqueada || esEvid || esAnexos}
          onChange={(e) => cambiarTipo(e.target.value as SeccionEstructuraJson["tipo"])}
          aria-label={`Tipo de la sección ${n + 1}`}
        >
          {TIPOS_ESTRUCTURA.filter((t) => t.tipo === s.tipo || (t.tipo !== "evid" && t.tipo !== "anexos")).map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.nombre}
            </option>
          ))}
        </select>
        {!bloqueada && (
          <div className="inf-est__mover" role="group" aria-label={`Mover la sección ${n + 1}`}>
            <button type="button" className="inf-btn inf-btn--sm" onClick={() => mover(-1)} disabled={n === 0 || esAnexos} aria-label="Subir">
              Subir
            </button>
            <button type="button" className="inf-btn inf-btn--sm" onClick={() => mover(1)} disabled={n === total - 1 || esAnexos} aria-label="Bajar">
              Bajar
            </button>
            <button type="button" className="inf-btn inf-btn--sm" onClick={quitar} disabled={esEvid} title={esEvid ? "Obligatoria en todo informe" : undefined}>
              Quitar
            </button>
          </div>
        )}
      </div>
      {ayuda && <small className="inf-hint">{esEvid ? "Obligatoria en todo informe: no se puede quitar. " : ""}{ayuda}</small>}
      {s.tipo === "narr" && (
        <div className="inf-est__extra">
          <label className="inf-lab">
            Extensión esperada
            <input className="inf-in" value={s.extension ?? ""} disabled={bloqueada} onChange={(e) => cambiar({ extension: e.target.value || undefined })} placeholder="Ej.: 1 a 3 párrafos" />
          </label>
          <label className="inf-lab">
            Mínimo de palabras
            <input
              className="inf-in inf-num"
              type="number"
              min={0}
              max={2000}
              value={s.minimo ?? ""}
              disabled={bloqueada}
              onChange={(e) => cambiar({ minimo: e.target.value ? Math.max(0, Math.min(2000, Math.round(Number(e.target.value)))) : undefined })}
            />
          </label>
        </div>
      )}
      {s.tipo === "dim" && (
        <fieldset className="inf-est__dims" disabled={bloqueada}>
          <legend className="inf-lab">Dimensiones a las que puede reportar</legend>
          {DIMENSIONES_ESTRUCTURA.map((d) => (
            <label key={d.id} className="inf-chk">
              <input type="checkbox" checked={(s.dims ?? []).includes(d.id)} onChange={() => alternarDim(d.id)} /> {d.nombre}
            </label>
          ))}
        </fieldset>
      )}
      {s.tipo === "filas" && <ColumnasInput valor={s.columnas ?? []} disabled={bloqueada} onChange={(columnas) => cambiar({ columnas })} />}
    </li>
  );
}

/** Las columnas se escriben separadas por coma; el texto se conserva tal cual mientras se escribe. */
function ColumnasInput({ valor, disabled, onChange }: { valor: string[]; disabled: boolean; onChange: (c: string[]) => void }) {
  const [texto, setTexto] = useState(valor.join(", "));
  return (
    <label className="inf-lab inf-est__extra">
      Columnas (separadas por coma)
      <input
        className="inf-in"
        value={texto}
        disabled={disabled}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(e.target.value.split(",").map((c) => c.trim()).filter(Boolean));
        }}
        placeholder="Ej.: Reto, Aprendizaje, Oportunidad"
      />
    </label>
  );
}

/* ---------- ¿Quién puede usarla? ----------------------------------------------------------------- */

function QuienUsa({ plantilla, unidades, faltaMigracion }: { plantilla: Plantilla; unidades: UnidadRef[]; faltaMigracion: boolean }) {
  const lectura = usePlantillaUnidades();
  const guardar = useGuardarUnidadesDePlantilla();
  const actuales = useMemo(() => unidadesDePlantilla(lectura.data?.filas ?? [], plantilla), [lectura.data, plantilla]);
  const [modo, setModo] = useState<"todas" | "solo">(actuales.length ? "solo" : "todas");
  const [elegidas, setElegidas] = useState<string[]>(actuales);
  const [q, setQ] = useState("");
  const [guardado, setGuardado] = useState("");
  // Cuando llegan o cambian los datos guardados, el formulario parte de ellos.
  const firma = actuales.slice().sort().join(",");
  useEffect(() => {
    setModo(actuales.length ? "solo" : "todas");
    setElegidas(actuales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, plantilla]);

  const candidatas = useMemo(() => unidades.filter((u) => escribeInforme(u.kind)), [unidades]);
  const porId = useMemo(() => new Map(candidatas.map((u) => [u.id, u] as const)), [candidatas]);
  const visibles = useMemo(() => {
    const t = normalizar(q);
    return candidatas.filter((u) => !t || normalizar(u.name).includes(t)).slice(0, 60);
  }, [candidatas, q]);
  const falta = faltaMigracion || Boolean(lectura.data?.falta);
  const nuevoConjunto = modo === "todas" ? [] : elegidas;
  const cambio = nuevoConjunto.slice().sort().join(",") !== firma;
  const vacioSolo = modo === "solo" && elegidas.length === 0;

  const alternar = (id: string) => setElegidas((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <section className="inf-card inf-pad" aria-labelledby={`inf-est-q-${plantilla}`}>
      <h3 id={`inf-est-q-${plantilla}`} className="inf-t">
        ¿Quién puede usarla?
      </h3>
      <p className="inf-sub">Sirve para una plantilla pensada para una oficina concreta (por ejemplo, Planeación Institucional) o para una general. Aplica a los informes que se abran desde ahora.</p>
      {falta && (
        <p className="inf-error" role="alert">
          Falta aplicar la migración 0279 (Informes · mejoras): por ahora todas las oficinas pueden usar todas las plantillas.
        </p>
      )}
      <div className="rk-seg" role="group" aria-label="Quién puede usarla">
        <button type="button" aria-pressed={modo === "todas"} onClick={() => setModo("todas")} disabled={falta}>
          Todas las oficinas
        </button>
        <button type="button" aria-pressed={modo === "solo"} onClick={() => setModo("solo")} disabled={falta}>
          Solo estas oficinas
        </button>
      </div>
      {modo === "solo" && (
        <div className="inf-est__unidades">
          {elegidas.length > 0 && (
            <ul className="inf-est__chips" aria-label="Oficinas elegidas">
              {elegidas.map((id) => (
                <li key={id}>
                  <span>{porId.get(id)?.name ?? "Unidad que ya no existe"}</span>
                  <button type="button" onClick={() => alternar(id)} aria-label={`Quitar ${porId.get(id)?.name ?? "unidad"}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="inf-lab">
            Buscar una oficina
            <input className="inf-in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre de la unidad" autoComplete="off" />
          </label>
          <ul className="inf-est__opciones" aria-label="Oficinas">
            {visibles.length === 0 ? (
              <li className="inf-hint">Ninguna unidad coincide.</li>
            ) : (
              visibles.map((u) => (
                <li key={u.id}>
                  <label className="inf-chk">
                    <input type="checkbox" checked={elegidas.includes(u.id)} onChange={() => alternar(u.id)} /> {u.name}
                  </label>
                </li>
              ))
            )}
          </ul>
          {candidatas.filter((u) => !q || normalizar(u.name).includes(normalizar(q))).length > visibles.length && <p className="inf-hint">Se muestran las primeras 60: escriba para acotar.</p>}
        </div>
      )}
      <div className="inf-row" style={{ marginTop: "var(--space-4)" }}>
        <button
          type="button"
          className="inf-btn inf-btn--pri"
          disabled={falta || !cambio || vacioSolo || guardar.isPending}
          onClick={() => {
            setGuardado("");
            guardar.mutate({ plantilla, unidades: nuevoConjunto }, { onSuccess: () => setGuardado("Guardado.") });
          }}
        >
          {guardar.isPending ? "Guardando…" : "Guardar quién la usa"}
        </button>
        {vacioSolo && <span className="inf-hint">Elija al menos una oficina o deje «Todas las oficinas».</span>}
        {guardado && !cambio && (
          <span className="inf-hint" role="status">
            {guardado}
          </span>
        )}
        {guardar.error && (
          <span className="inf-error" role="alert">
            {mensajeDe(guardar.error)}
          </span>
        )}
      </div>
    </section>
  );
}

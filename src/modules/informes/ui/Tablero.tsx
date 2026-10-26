/* =============================================================================
   Tablero del ciclo (Planeación): el ciclo del año (fechas, estado, datos
   libres), qué cifras se justifican por plantilla, y la entrega por unidad
   con su estado y avance. Desde aquí se abren los informes.
   ========================================================================== */

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCrecer, useEntrada } from "../../rankings/movimiento";
import { condicionDe, useAbrirInforme, useGuardarCiclo, useGuardarRequisito, useInstancias, useListas, useUnidades } from "../datos";
import { DIMS, LETRAS, PLANTILLAS, cifraDef, dimsDe, plantillaSugerida } from "../plantillas";
import type { CicloRow, Condicion, ConfigCiclo, EstadoCiclo, Plantilla, RequisitoRow } from "../types";
import { Aviso, Barra, Cargando, EstadoPill, fmtFecha, mensajeDe } from "./comunes";
import { configDe } from "./modelo";

const BASE = "/admin/informes-gestion";
const CONDICIONES: { id: Condicion; texto: string }[] = [
  { id: "justificar", texto: "Justificar" },
  { id: "sugerido", texto: "Sugerido" },
  { id: "no", texto: "No pedir" },
];
const ESTADOS_CICLO: { id: EstadoCiclo; texto: string }[] = [
  { id: "preparacion", texto: "En preparación" },
  { id: "abierto", texto: "Abierto" },
  { id: "cerrado", texto: "Cerrado" },
];

export function Tablero({ ciclo, ciclos, requisitos, elegirAnio }: { ciclo: CicloRow | null; ciclos: CicloRow[]; requisitos: RequisitoRow[]; elegirAnio: (a: number) => void }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEntrada(raiz, ".inf-card", ciclo?.id ?? "nuevo");
  return (
    <div className="inf-stack" ref={raiz}>
      <FichaCiclo key={ciclo?.id ?? "nuevo"} ciclo={ciclo} ciclos={ciclos} elegirAnio={elegirAnio} />
      {ciclo && (
        <div className="inf-two">
          <Requisitos ciclo={ciclo} requisitos={requisitos} />
          <div className="inf-stack">
            <DatosLibres ciclo={ciclo} />
            <Entrega ciclo={ciclo} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- El ciclo ----------------------------------------------------------- */

function FichaCiclo({ ciclo, ciclos, elegirAnio }: { ciclo: CicloRow | null; ciclos: CicloRow[]; elegirAnio: (a: number) => void }) {
  const guardar = useGuardarCiclo();
  const anioBase = ciclo?.anio ?? new Date().getFullYear();
  const [f, setF] = useState({
    anio: anioBase,
    nombre: ciclo?.nombre ?? `Informe de gestión ${anioBase}`,
    fecha_limite: ciclo?.fecha_limite ?? "",
    corte: ciclo?.corte ?? "",
    estado: ciclo?.estado ?? ("preparacion" as EstadoCiclo),
  });
  const enviar = () =>
    guardar.mutate(
      {
        ...(ciclo ? { id: ciclo.id } : {}),
        anio: f.anio,
        nombre: f.nombre.trim() || `Informe de gestión ${f.anio}`,
        fecha_limite: f.fecha_limite || null,
        corte: f.corte || null,
        estado: f.estado,
        config: configDe(ciclo),
      },
      { onSuccess: (c) => elegirAnio(c.anio) },
    );

  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-ciclo">
      <div className="inf-row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="inf-eyebrow">{ciclo ? `Ciclo ${ciclo.anio}` : "Sin ciclo"}</span>
          <h3 id="inf-ciclo" className="inf-t">
            {ciclo ? ciclo.nombre : "Abrir el ciclo del informe de gestión"}
          </h3>
        </div>
        {ciclos.length > 1 && (
          <label className="inf-lab">
            Año
            <select className="inf-in" value={ciclo?.anio ?? ""} onChange={(e) => elegirAnio(Number(e.target.value))}>
              {ciclos.map((c) => (
                <option key={c.id} value={c.anio}>
                  {c.anio}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="inf-sub">
        {ciclo
          ? `Fecha límite ${fmtFecha(ciclo.fecha_limite)} · corte de las cifras ${fmtFecha(ciclo.corte)}. Las unidades escriben mientras el ciclo esté abierto.`
          : "Un ciclo por año. Mientras esté en preparación, Planeación fija plantillas y requisitos; al abrirlo, las unidades empiezan a escribir."}
      </p>
      <div className="inf-form">
        <label className="inf-lab">
          Año
          <input className="inf-in inf-num" type="number" value={f.anio} onChange={(e) => setF({ ...f, anio: Number(e.target.value) })} disabled={Boolean(ciclo)} />
        </label>
        <label className="inf-lab">
          Nombre
          <input className="inf-in" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </label>
        <label className="inf-lab">
          Fecha límite
          <input className="inf-in" type="date" value={f.fecha_limite} onChange={(e) => setF({ ...f, fecha_limite: e.target.value })} />
        </label>
        <label className="inf-lab">
          Corte de las cifras
          <input className="inf-in" type="date" value={f.corte} onChange={(e) => setF({ ...f, corte: e.target.value })} />
        </label>
        <label className="inf-lab">
          Estado
          <select className="inf-in" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as EstadoCiclo })}>
            {ESTADOS_CICLO.map((x) => (
              <option key={x.id} value={x.id}>
                {x.texto}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="inf-row" style={{ marginTop: "var(--space-4)" }}>
        <button type="button" className="inf-btn inf-btn--pri" onClick={enviar} disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : ciclo ? "Guardar el ciclo" : "Crear el ciclo"}
        </button>
        {ciclo && (
          <button
            type="button"
            className="inf-btn inf-btn--ghost"
            onClick={() => {
              const anio = (ciclos[0]?.anio ?? anioBase) + 1;
              setF({ anio, nombre: `Informe de gestión ${anio}`, fecha_limite: "", corte: "", estado: "preparacion" });
              guardar.mutate(
                { anio, nombre: `Informe de gestión ${anio}`, fecha_limite: null, corte: null, estado: "preparacion", config: configDe(ciclo) },
                { onSuccess: (c) => elegirAnio(c.anio) },
              );
            }}
            disabled={guardar.isPending}
          >
            Preparar el ciclo siguiente
          </button>
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

/* ---------- Qué cifras se justifican ------------------------------------------- */

function Requisitos({ ciclo, requisitos }: { ciclo: CicloRow; requisitos: RequisitoRow[] }) {
  const [plantilla, setPlantilla] = useState<Plantilla>("A");
  const guardar = useGuardarRequisito();
  const dims = dimsDe(plantilla);
  const claves = dims.flatMap((d) => DIMS[d].cifras);
  const cuenta = (c: Condicion) => claves.filter((k) => condicionDe(requisitos, plantilla, k) === c).length;

  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-req">
      <h3 id="inf-req" className="inf-t">
        Qué datos debe justificar cada unidad
      </h3>
      <p className="inf-sub">
        Para la {PLANTILLAS[plantilla].nombre.toLowerCase()} ({PLANTILLAS[plantilla].quien.toLowerCase()}). Lo que marque como «Justificar» aparece bloqueado en el
        informe de cada unidad, con una línea de explicación obligatoria.
      </p>
      <div className="rk-seg" role="group" aria-label="Plantilla" style={{ marginBottom: "var(--space-4)" }}>
        {LETRAS.map((l) => (
          <button key={l} type="button" aria-pressed={l === plantilla} onClick={() => setPlantilla(l)} title={PLANTILLAS[l].quien}>
            {l} · {PLANTILLAS[l].quien}
          </button>
        ))}
      </div>
      <div className="inf-cnt">
        <div>
          <b className="inf-num">{cuenta("justificar")}</b>
          <span>deben justificarse</span>
        </div>
        <div>
          <b className="inf-num">{cuenta("sugerido")}</b>
          <span>sugeridos</span>
        </div>
        <div>
          <b className="inf-num">{cuenta("no")}</b>
          <span>no se piden</span>
        </div>
      </div>
      <div className="inf-tw">
        <table className="inf-ask">
          <thead>
            <tr>
              <th>Dato</th>
              <th>Fuente</th>
              <th>Condición</th>
            </tr>
          </thead>
          <tbody>
            {dims.map((d) => [
              <tr key={d} className="grp">
                <td colSpan={3}>{DIMS[d].titulo}</td>
              </tr>,
              ...DIMS[d].cifras.map((k) => {
                const actual = condicionDe(requisitos, plantilla, k);
                const def = cifraDef(k);
                return (
                  <tr key={`${d}-${k}`}>
                    <td>{def?.etiqueta ?? k}</td>
                    <td className="inf-src">{def?.fuente}</td>
                    <td>
                      <div className="rk-seg" role="group" aria-label={`Condición de ${def?.etiqueta ?? k}`}>
                        {CONDICIONES.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            aria-pressed={actual === x.id}
                            onClick={() => actual !== x.id && guardar.mutate({ ciclo_id: ciclo.id, plantilla, clave: k, condicion: x.id })}
                          >
                            {x.texto}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      {guardar.error && (
        <p className="inf-error" role="alert">
          {mensajeDe(guardar.error)}
        </p>
      )}
    </section>
  );
}

/* ---------- Datos libres --------------------------------------------------------- */

function DatosLibres({ ciclo }: { ciclo: CicloRow }) {
  const guardar = useGuardarCiclo();
  const cfg = configDe(ciclo);
  const fijar = (x: Partial<ConfigCiclo>) => guardar.mutate({ ...ciclo, config: { ...cfg, ...x } });
  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-libres">
      <h3 id="inf-libres" className="inf-t">
        Los datos libres
      </h3>
      <p className="inf-sub">Cada unidad puede sumar sus propios datos sin salirse del plan de diseño.</p>
      <div className="inf-stack" style={{ gap: "var(--space-3)" }}>
        <div className="inf-row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700 }}>Datos propios por sección</span>
          <span className="inf-step">
            <button type="button" aria-label="Menos" onClick={() => fijar({ limite_propios: Math.max(0, cfg.limite_propios - 1) })}>
              −
            </button>
            <b className="inf-num" aria-live="polite">
              {cfg.limite_propios}
            </b>
            <button type="button" aria-label="Más" onClick={() => fijar({ limite_propios: Math.min(10, cfg.limite_propios + 1) })}>
              +
            </button>
          </span>
        </div>
        <label className="inf-chk">
          <input type="checkbox" checked={cfg.exigir_fuente} onChange={(e) => fijar({ exigir_fuente: e.target.checked })} /> Exigir fuente en cada dato propio
        </label>
        <label className="inf-chk">
          <input type="checkbox" checked={cfg.exigir_pilar} onChange={(e) => fijar({ exigir_pilar: e.target.checked })} /> Exigir un pilar del PDI vinculado
        </label>
        {guardar.error && (
          <span className="inf-error" role="alert">
            {mensajeDe(guardar.error)}
          </span>
        )}
      </div>
    </section>
  );
}

/* ---------- Entrega por unidad ----------------------------------------------------- */

/** Las unidades que escriben informe: todas menos los programas. */
const escribeInforme = (kind: string) => kind !== "programa";

function Entrega({ ciclo }: { ciclo: CicloRow }) {
  const unidades = useUnidades();
  const instancias = useInstancias(ciclo.id);
  const ids = (instancias.data ?? []).map((i) => i.id);
  const listas = useListas(ciclo.id, ids);
  const abrir = useAbrirInforme();
  const [elegidas, setElegidas] = useState<Record<string, Plantilla>>({});
  const [error, setError] = useState("");
  const barras = useRef<HTMLDivElement>(null);
  useCrecer(barras, ".inf-bar > i", { clave: listas.data ? "listo" : "cargando" });

  const fallo = [unidades.error, instancias.error].find((e): e is Error => e instanceof Error);
  if (fallo) return <Aviso error={fallo} />;
  if (unidades.isPending || instancias.isPending) return <Cargando texto="Cargando las unidades…" />;

  const porUnidad = new Map((instancias.data ?? []).map((i) => [i.unit_id, i]));
  const lista = (unidades.data ?? []).filter((u) => escribeInforme(u.kind));
  const plantillaDe = (u: { id: string; kind: string; name: string }) => elegidas[u.id] ?? plantillaSugerida(u.kind, u.name);
  const sinAbrir = lista.filter((u) => !porUnidad.has(u.id));

  const abrirTodas = async () => {
    setError("");
    for (const u of sinAbrir) {
      try {
        await abrir.mutateAsync({ ciclo: ciclo.id, unidad: u.id, plantilla: plantillaDe(u) });
      } catch (e) {
        setError(`${u.name}: ${mensajeDe(e)}`);
        return;
      }
    }
  };

  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-entrega">
      <h3 id="inf-entrega" className="inf-t">
        Entrega por unidad
      </h3>
      <p className="inf-sub">
        Fecha límite {fmtFecha(ciclo.fecha_limite)}. {porUnidad.size} de {lista.length} informes abiertos.
      </p>
      {sinAbrir.length > 0 && (
        <div className="inf-row" style={{ marginBottom: "var(--space-3)" }}>
          <button type="button" className="inf-btn inf-btn--sm" onClick={() => void abrirTodas()} disabled={abrir.isPending}>
            {abrir.isPending ? "Abriendo…" : `Abrir los ${sinAbrir.length} que faltan`}
          </button>
          <span className="inf-hint">Con la plantilla que muestra cada fila.</span>
        </div>
      )}
      {(error || abrir.error) && (
        <p className="inf-error" role="alert">
          {error || mensajeDe(abrir.error)}
        </p>
      )}
      <div className="inf-units" ref={barras}>
        {lista.map((u) => {
          const inst = porUnidad.get(u.id);
          const total = PLANTILLAS[inst?.plantilla ?? plantillaDe(u)].secciones.length;
          const hechas = inst ? (listas.data?.get(inst.id) ?? 0) : 0;
          return (
            <div key={u.id} className="inf-u">
              <div>
                <b>{u.name}</b>
                <small>{inst ? `${PLANTILLAS[inst.plantilla].nombre} · ${hechas} de ${total} secciones` : "Sin abrir"}</small>
              </div>
              <Barra valor={hechas / total} etiqueta={`Avance de ${u.name}`} />
              <div className="inf-u__acts">
                {inst ? (
                  <>
                    <EstadoPill estado={inst.estado} />
                    <Link className="inf-link" to={inst.estado === "sent" ? `${BASE}/revision?informe=${inst.id}` : `${BASE}/mi-informe?unidad=${u.id}`}>
                      {inst.estado === "sent" ? "Revisar" : "Ver"}
                    </Link>
                    <Link className="inf-link" to={`${BASE}/vista?unidad=${u.id}`}>
                      Vista del informe
                    </Link>
                  </>
                ) : (
                  <>
                    <select
                      className="inf-in"
                      style={{ width: "auto", minHeight: 32 }}
                      value={plantillaDe(u)}
                      onChange={(e) => setElegidas({ ...elegidas, [u.id]: e.target.value as Plantilla })}
                      aria-label={`Plantilla de ${u.name}`}
                    >
                      {LETRAS.map((l) => (
                        <option key={l} value={l}>
                          {l} · {PLANTILLAS[l].quien}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="inf-btn inf-btn--sm" disabled={abrir.isPending} onClick={() => abrir.mutate({ ciclo: ciclo.id, unidad: u.id, plantilla: plantillaDe(u) })}>
                      Abrir
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

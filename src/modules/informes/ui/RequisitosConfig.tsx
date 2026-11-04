/* =============================================================================
   Tablero del ciclo · los datos que Planeación pide a cada tipo de unidad
   (migración 0253). Por plantilla (A Decanatura, B Vicerrectoría u oficina,
   C Rectoría de campus, D Rectoría General): Dato · Fuente · Condición.
   Planeación añade, edita, ordena y quita datos; las unidades los ven ya
   listados en Resultados por dimensión. Se edita en borrador y se guarda junto.
   ========================================================================== */

import { useRef, useState } from "react";
import { useCriterios, aprobadosPara } from "../criterios";
import { condicionDe, useGuardarRequisito } from "../datos";
import { DIMS, LETRAS, PLANTILLAS, dimsDe } from "../plantillas";
import { useBorrarRequerido, useGuardarRequeridos, useRequeridos } from "../requeridos";
import { COLUMNAS_REQ, FUENTES_REQ, filasDeRequeridos, leerFilasRequeridos, requeridoNuevo } from "../requeridos-logica";
import type { DatoRequerido, FuenteTipoReq } from "../requeridos-logica";
import type { CicloRow, Condicion, Plantilla, RequisitoRow } from "../types";
import { Cargando, mensajeDe } from "./comunes";
import { descargarLibro, leerHoja } from "./excel";

const CONDICIONES: { id: Condicion; texto: string }[] = [
  { id: "justificar", texto: "Justificar" },
  { id: "sugerido", texto: "Sugerido" },
  { id: "no", texto: "No pedir" },
];

export function RequisitosConfig({ ciclo, requisitos }: { ciclo: CicloRow; requisitos: RequisitoRow[] }) {
  const [plantilla, setPlantilla] = useState<Plantilla>("A");
  const lectura = useRequeridos(ciclo.id);
  const criterios = useCriterios();

  if (lectura.isPending) return <Cargando texto="Cargando los datos requeridos…" />;
  const filas = lectura.data?.filas ?? [];
  const falta = Boolean(lectura.data?.falta);
  const base = Object.keys(DIMS).map((id) => ({ id, nombre: DIMS[id as keyof typeof DIMS].titulo }));
  const opcionesCriterio = [...base, ...aprobadosPara(criterios.data?.filas ?? [], plantilla, ciclo.anio)];
  const nombreCriterio = (id: string) => opcionesCriterio.find((o) => o.id === id)?.nombre ?? "";
  const delaPlantilla = filas.filter((f) => f.plantilla === plantilla).sort((a, b) => a.orden - b.orden);
  const firma = JSON.stringify(delaPlantilla.map((f) => [f.id, f.dato, f.fuente_tipo, f.fuente_nombre, f.criterio, f.unidad, f.mayor_mejor, f.condicion, f.orden]));

  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-reqcfg">
      <h3 id="inf-reqcfg" className="inf-t">
        Los datos que pide cada tipo de unidad
      </h3>
      <p className="inf-sub">
        Defina, por plantilla, el dato, su fuente y la condición. Las unidades los ven ya listados en «Resultados por dimensión» y escriben su cifra actual, meta y justificación. «Justificar» es obligatorio para enviar; «Sugerido» aparece pero no bloquea; «No pedir» no se muestra.
      </p>
      {falta && (
        <p className="inf-error" role="alert">
          Falta aplicar la migración 0253. Mientras tanto no se puede guardar esta configuración.
        </p>
      )}
      <div className="rk-seg" role="group" aria-label="Plantilla de los datos requeridos" style={{ marginBottom: "var(--space-4)" }}>
        {LETRAS.map((l) => (
          <button key={l} type="button" aria-pressed={l === plantilla} onClick={() => setPlantilla(l)} title={PLANTILLAS[l].quien}>
            {l} · {PLANTILLAS[l].quien}
          </button>
        ))}
      </div>
      <Plantillas
        key={`${plantilla}-${firma}`}
        ciclo={ciclo}
        plantilla={plantilla}
        inicial={delaPlantilla}
        todas={filas}
        opcionesCriterio={opcionesCriterio}
        nombreCriterio={nombreCriterio}
        requisitos={requisitos}
        falta={falta}
      />
    </section>
  );
}

function Plantillas({
  ciclo,
  plantilla,
  inicial,
  todas,
  opcionesCriterio,
  nombreCriterio,
  requisitos,
  falta,
}: {
  ciclo: CicloRow;
  plantilla: Plantilla;
  inicial: DatoRequerido[];
  todas: DatoRequerido[];
  opcionesCriterio: { id: string; nombre: string }[];
  nombreCriterio: (id: string) => string;
  requisitos: RequisitoRow[];
  falta: boolean;
}) {
  const guardar = useGuardarRequeridos();
  const borrar = useBorrarRequerido();
  const guardarReq = useGuardarRequisito();
  const [lista, setLista] = useState<DatoRequerido[]>(inicial);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const entrada = useRef<HTMLInputElement>(null);

  const sucio = JSON.stringify(lista) !== JSON.stringify(inicial);
  const invalidas = lista.filter((r) => r.dato.trim().length < 3 || r.dato.trim().length > 120).length;
  const poner = (id: string, x: Partial<DatoRequerido>) => setLista(lista.map((r) => (r.id === id ? { ...r, ...x } : r)));
  const mover = (n: number, d: -1 | 1) => {
    const m = n + d;
    if (m < 0 || m >= lista.length) return;
    const copia = [...lista];
    [copia[n], copia[m]] = [copia[m], copia[n]];
    setLista(copia);
  };

  const guardarTodo = async () => {
    setError("");
    setAviso("");
    try {
      const vivos = new Set(lista.map((r) => r.id));
      for (const q of inicial.filter((r) => !vivos.has(r.id))) await borrar.mutateAsync({ id: q.id, ciclo_id: q.ciclo_id });
      await guardar.mutateAsync(lista.map((r, n) => ({ ...r, orden: n })));
      setAviso("Configuración guardada.");
    } catch (e) {
      setError(mensajeDe(e));
    }
  };

  const copiarDe = (otra: Plantilla) => {
    const origen = todas.filter((f) => f.plantilla === otra).sort((a, b) => a.orden - b.orden);
    if (!origen.length) return setAviso(`La plantilla ${otra} no tiene datos configurados.`);
    if (lista.length && !window.confirm(`Reemplaza los ${lista.length} datos de la plantilla ${plantilla} (se aplica al guardar). ¿Continuar?`)) return;
    const nuevos = origen.map((o, n) => ({ ...requeridoNuevo(ciclo.id, plantilla, n), dato: o.dato, fuente_tipo: o.fuente_tipo, fuente_nombre: o.fuente_nombre, criterio: o.criterio, unidad: o.unidad, mayor_mejor: o.mayor_mejor, condicion: o.condicion }));
    setLista(nuevos);
    setAviso(`Copiados ${nuevos.length} datos de la plantilla ${otra}. Revise y guarde.`);
  };

  const sinPedir = () => {
    const claves = dimsDe(plantilla).flatMap((d) => DIMS[d].cifras);
    const pendientes = claves.filter((k) => condicionDe(requisitos, plantilla, k) !== "no");
    pendientes.forEach((k) => guardarReq.mutate({ ciclo_id: ciclo.id, plantilla, clave: k, condicion: "no" }));
    setAviso(pendientes.length ? `${pendientes.length} cifras automáticas pasaron a «No pedir».` : "Las cifras automáticas ya estaban en «No pedir».");
  };

  const bajar = async () => {
    const todasOrdenadas = LETRAS.flatMap((l) => todas.filter((f) => f.plantilla === l).sort((a, b) => a.orden - b.orden));
    await descargarLibro("datos-requeridos.xlsx", [
      {
        nombre: "Datos requeridos",
        columnas: COLUMNAS_REQ.map((t, n) => ({ titulo: t, ancho: n === 1 || n === 3 ? 40 : 18 })),
        filas: filasDeRequeridos(todasOrdenadas, nombreCriterio),
        listas: { 0: [...LETRAS], 2: FUENTES_REQ.map((f) => f.texto), 4: opcionesCriterio.map((o) => o.nombre.replace(/,/g, " ")), 6: ["Más es mejor", "Menos es mejor"], 7: CONDICIONES.map((c) => c.texto) },
        ayuda: "Una fila por dato. Plantilla: A, B, C o D. Al subirlo, las filas se añaden a la configuración de cada plantilla.",
      },
    ]);
  };

  const subir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setError("");
    try {
      const hoja = await leerHoja(archivo, "Datos requeridos");
      const inicio = { A: 0, B: 0, C: 0, D: 0 } as Record<Plantilla, number>;
      for (const f of todas) inicio[f.plantilla] = Math.max(inicio[f.plantilla], f.orden + 1);
      const r = leerFilasRequeridos(hoja, ciclo.id, opcionesCriterio, inicio);
      if (r.datos.length) await guardar.mutateAsync(r.datos);
      setAviso(`${r.datos.length} datos añadidos desde ${archivo.name}.${r.avisos.length ? ` ${r.avisos.slice(0, 3).join(" ")}` : ""}`);
    } catch (e) {
      setError(`No se pudo leer el Excel: ${mensajeDe(e)}`);
    }
    if (entrada.current) entrada.current.value = "";
  };

  const ocupado = guardar.isPending || borrar.isPending;
  return (
    <>
      <div className="inf-cnt">
        {CONDICIONES.map((c) => (
          <div key={c.id}>
            <b className="inf-num">{lista.filter((r) => r.condicion === c.id).length}</b>
            <span>{c.id === "justificar" ? "deben justificarse" : c.id === "sugerido" ? "sugeridos" : "no se piden"}</span>
          </div>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="inf-hint">La plantilla {plantilla} aún no tiene datos propios. Añada el primero o copie los de otra plantilla.</p>
      ) : (
        <div className="inf-tw">
          <table className="inf-ask">
            <thead>
              <tr>
                <th scope="col">Dato</th>
                <th scope="col">Fuente</th>
                <th scope="col">Criterio y unidad</th>
                <th scope="col">Condición</th>
                <th scope="col">
                  <span className="sr-only">Orden y quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r, n) => (
                <tr key={r.id}>
                  <td>
                    <input className="inf-in" aria-label={`Dato ${n + 1}`} maxLength={120} placeholder="Nombre del indicador" value={r.dato} onChange={(e) => poner(r.id, { dato: e.target.value })} />
                  </td>
                  <td>
                    <select className="inf-in" aria-label={`Tipo de fuente de ${r.dato || `dato ${n + 1}`}`} value={r.fuente_tipo} onChange={(e) => poner(r.id, { fuente_tipo: e.target.value as FuenteTipoReq })}>
                      {FUENTES_REQ.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.texto}
                        </option>
                      ))}
                    </select>
                    <input className="inf-in" aria-label={`Nombre de la fuente de ${r.dato || `dato ${n + 1}`}`} maxLength={200} placeholder="Dónde se consigue" value={r.fuente_nombre} onChange={(e) => poner(r.id, { fuente_nombre: e.target.value })} />
                  </td>
                  <td>
                    <select className="inf-in" aria-label={`Criterio de ${r.dato || `dato ${n + 1}`}`} value={r.criterio} onChange={(e) => poner(r.id, { criterio: e.target.value })}>
                      <option value="">Sin criterio</option>
                      {opcionesCriterio.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nombre}
                        </option>
                      ))}
                    </select>
                    <span className="inf-row">
                      <select className="inf-in" aria-label={`Unidad de ${r.dato || `dato ${n + 1}`}`} value={r.unidad} onChange={(e) => poner(r.id, { unidad: e.target.value })}>
                        <option value="">Conteo</option>
                        <option value=" %">%</option>
                        <option value=" pp">pp</option>
                        <option value=" $">$</option>
                      </select>
                      <select className="inf-in" aria-label={`Qué es mejor en ${r.dato || `dato ${n + 1}`}`} value={r.mayor_mejor ? "mas" : "menos"} onChange={(e) => poner(r.id, { mayor_mejor: e.target.value === "mas" })}>
                        <option value="mas">Más es mejor</option>
                        <option value="menos">Menos es mejor</option>
                      </select>
                    </span>
                  </td>
                  <td>
                    <div className="rk-seg" role="group" aria-label={`Condición de ${r.dato || `dato ${n + 1}`}`}>
                      {CONDICIONES.map((x) => (
                        <button key={x.id} type="button" aria-pressed={r.condicion === x.id} onClick={() => poner(r.id, { condicion: x.id })}>
                          {x.texto}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="inf-dimtab__acc">
                    <button type="button" className="inf-link" disabled={n === 0} onClick={() => mover(n, -1)} aria-label={`Subir ${r.dato || `dato ${n + 1}`}`}>
                      Subir
                    </button>
                    <button type="button" className="inf-link" disabled={n === lista.length - 1} onClick={() => mover(n, 1)} aria-label={`Bajar ${r.dato || `dato ${n + 1}`}`}>
                      Bajar
                    </button>
                    <button type="button" className="inf-link" onClick={() => setLista(lista.filter((x) => x.id !== r.id))} aria-label={`Quitar ${r.dato || `dato ${n + 1}`}`}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="inf-row" style={{ marginTop: "var(--space-3)" }}>
        <button type="button" className="inf-btn inf-btn--sm" onClick={() => setLista([...lista, requeridoNuevo(ciclo.id, plantilla, lista.length)])}>
          + Añadir dato
        </button>
        <button type="button" className="inf-btn inf-btn--sm inf-btn--pri" disabled={!sucio || ocupado || falta || invalidas > 0} onClick={() => void guardarTodo()}>
          {ocupado ? "Guardando…" : "Guardar los datos"}
        </button>
        {sucio && <span className="inf-hint">Hay cambios sin guardar.</span>}
        {invalidas > 0 && <span className="inf-hint">Cada dato necesita un nombre de 3 a 120 caracteres.</span>}
      </div>

      <div className="inf-row" style={{ marginTop: "var(--space-3)" }}>
        {LETRAS.filter((l) => l !== plantilla).map((l) => (
          <button key={l} type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => copiarDe(l)}>
            Copiar de la plantilla {l}
          </button>
        ))}
      </div>

      <div className="inf-nota" style={{ marginTop: "var(--space-4)" }}>
        <b>Las 14 cifras automáticas</b>
        UDES en Cifras y PDI no están alimentando datos, y el envío exige justificar las cifras marcadas «Justificar». Si la plantilla {plantilla} va a reportar todo a mano, pase esas cifras a «No pedir».
        <span className="inf-row">
          <button type="button" className="inf-btn inf-btn--sm" disabled={guardarReq.isPending} onClick={sinPedir}>
            Pasar las 14 cifras automáticas a «No pedir»
          </button>
        </span>
      </div>

      <div className="inf-row" style={{ marginTop: "var(--space-3)" }}>
        <input ref={entrada} type="file" hidden accept=".xlsx" onChange={(e) => void subir(e.target.files?.[0])} />
        <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => void bajar()}>
          Bajar Excel (las cuatro plantillas)
        </button>
        <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" disabled={falta || ocupado} onClick={() => entrada.current?.click()}>
          Subir Excel
        </button>
      </div>

      {aviso && (
        <p className="inf-hint" role="status">
          {aviso}
        </p>
      )}
      {(error || guardar.error || borrar.error) && (
        <p className="inf-error" role="alert">
          {error || mensajeDe(guardar.error ?? borrar.error)}
        </p>
      )}
    </>
  );
}

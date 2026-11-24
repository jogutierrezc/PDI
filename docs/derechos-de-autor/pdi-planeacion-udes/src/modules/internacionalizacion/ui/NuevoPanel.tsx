/* =============================================================================
   Internacionalización · «Nueva tabla» en un solo panel (0166).

   Reemplaza al asistente de cuatro pasos: nombre, carpeta, quién escribe y
   cómo empieza (plantilla, Excel o en blanco), todo en una pantalla. Campus,
   persona que registra, fecha y origen no son columnas: la base los guarda en
   cada fila. «Quién escribe»:
     · Por campus      cada campus ve y edita solo sus filas;
     · Solo la oficina las escribe el Director o Planeación;
     · Multicampus     un archivo al que aportan todos los campus (0166); lo crea
                       solo quien lo controla.
   Agregar una hoja a una tabla que ya existe sigue en NuevaTabla.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { Ventana } from "../../../components/espacio/Ventana";
import { useCrearTabla } from "../datos";
import { aplanar, armarArbol, rutaDe } from "../lib/carpetas";
import { claveDePropio } from "../lib/conceptos";
import { puedeCrearLibro } from "../lib/permisos";
import type { Columna, IntCarpetaRow, IntConceptoRow, IntLibroRow, IntTipo, Yo } from "../tipos";
import { columnasDesdeConceptos, PARTIDAS } from "./logica";
import type { Partida } from "./logica";

type Captura = IntLibroRow["captura"];
type Inicio = "plantilla" | "excel" | "blanco";
type TipoPropio = Exclude<IntTipo, "calculado">;

const TIPOS: { id: TipoPropio; rotulo: string }[] = [
  { id: "texto", rotulo: "Texto" },
  { id: "numero", rotulo: "Número" },
  { id: "fecha", rotulo: "Fecha" },
  { id: "lista", rotulo: "Lista" },
];

const QUIEN: { id: Captura; titulo: string; ayuda: string }[] = [
  { id: "campus", titulo: "Por campus", ayuda: "Cada campus ve y edita solo sus filas." },
  { id: "oficina", titulo: "Solo la oficina", ayuda: "Las escribe el Director o Planeación." },
  {
    id: "multicampus",
    titulo: "Multicampus",
    ayuda: "Todos los campus aportan al mismo archivo. Cada fila guarda campus, persona, fecha y origen. Bucaramanga edita las filas de todos; los demás, solo las suyas.",
  },
];

const PLANTILLAS: Partida[] = ["saliente", "entrante", "convenio"];
const OBLIGATORIOS_BASE = ["numero_documento", "fecha_inicio"];

export function NuevoPanel({
  yo,
  conceptos,
  carpetas,
  carpetaInicial,
  capturaInicial = "campus",
  onCerrar,
  onCreada,
  onExcel,
}: {
  yo: Yo;
  conceptos: IntConceptoRow[];
  carpetas: IntCarpetaRow[];
  carpetaInicial: string | null;
  capturaInicial?: Captura;
  onCerrar: () => void;
  onCreada: (libroId: string) => void;
  /** «Desde un Excel»: el panel se cierra y se abre la carga con estos datos ya puestos. */
  onExcel: (previo: { nombre: string; captura: Captura; carpeta: string | null }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [carpeta, setCarpeta] = useState<string | null>(carpetaInicial);
  const [captura, setCaptura] = useState<Captura>(puedeCrearLibro(yo, capturaInicial) ? capturaInicial : "campus");
  const [inicio, setInicio] = useState<Inicio>("plantilla");
  const [partida, setPartida] = useState<Partida>("saliente");
  const [elegidos, setElegidos] = useState<string[]>(PARTIDAS.saliente.conceptos);
  const [obligatorios, setObligatorios] = useState<Set<string>>(new Set(OBLIGATORIOS_BASE));
  const [propios, setPropios] = useState<Columna[]>([]);
  const [propio, setPropio] = useState({ etiqueta: "", tipo: "texto" as TipoPropio, opciones: "" });
  const [error, setError] = useState<string | null>(null);
  const crear = useCrearTabla();

  const elegibles = conceptos.filter((c) => !c.implicito);
  const columnas = useMemo(() => columnasDesdeConceptos(elegidos, conceptos, obligatorios, propios), [elegidos, conceptos, obligatorios, propios]);
  const destinos = useMemo(() => aplanar(armarArbol(carpetas)), [carpetas]);
  const etiquetaCarpeta = (id: string) => rutaDe(carpetas, id).map((c) => c.nombre).join(" / ");

  const cambiarPartida = (p: Partida) => {
    setPartida(p);
    setElegidos(PARTIDAS[p].conceptos.filter((id) => conceptos.some((c) => c.id === id)));
  };

  const cambiarInicio = (i: Inicio) => {
    setInicio(i);
    if (i === "blanco") {
      setPartida("general");
      setElegidos([]);
    } else if (i === "plantilla" && partida === "general") cambiarPartida("saliente");
  };

  const agregarPropio = () => {
    const etiqueta = propio.etiqueta.trim();
    if (!etiqueta) return;
    const clave = claveDePropio(etiqueta, columnas.map((c) => c.clave));
    const opciones = propio.tipo === "lista" ? propio.opciones.split(/[;,\n]/).map((o) => o.trim()).filter(Boolean) : [];
    setPropios((p) => [...p, { clave, etiqueta, tipo: propio.tipo, concepto_id: null, obligatorio: false, opciones, calculo: null }]);
    setPropio({ etiqueta: "", tipo: "texto", opciones: "" });
  };

  const alternar = (id: string) => setElegidos((x) => (x.includes(id) ? x.filter((k) => k !== id) : [...x, id]));
  const alternarObligatorio = (id: string) =>
    setObligatorios((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const enviar = async () => {
    setError(null);
    const titulo = nombre.trim();
    if (!titulo) return setError("Escriba el nombre de la tabla.");
    if (inicio === "excel") {
      onExcel({ nombre: titulo, captura, carpeta });
      return;
    }
    if (columnas.length === 0) return setError("Elija al menos un campo.");
    const def = PARTIDAS[partida];
    try {
      const id = await crear.mutateAsync({
        nombre: titulo,
        captura,
        carpeta_id: carpeta,
        hojas: [{ nombre: inicio === "blanco" ? "Hoja 1" : def.rotulo, clase: def.clase, sentido: def.sentido, columnas }],
      });
      onCreada(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const camposAbiertos = inicio === "blanco";

  return (
    <Ventana
      titulo="Nueva tabla"
      etiqueta="Nueva tabla"
      onCerrar={onCerrar}
      pie={
        <>
          {error && (
            <p className="it-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="es-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="es-btn es-btn--pri" disabled={crear.isPending} onClick={() => void enviar()}>
            {crear.isPending ? "Creando…" : inicio === "excel" ? "Elegir el Excel" : "Crear tabla"}
          </button>
        </>
      }
    >
      <div className="it-nuevo">
        <div className="it-nuevo__fila">
          <label className="it-campo it-nuevo__nombre">
            <span>Nombre</span>
            <input data-foco type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Visitantes extranjeros" maxLength={120} />
          </label>
          <label className="it-campo">
            <span>Carpeta</span>
            <select value={carpeta ?? ""} onChange={(e) => setCarpeta(e.target.value || null)}>
              <option value="">Sin carpeta</option>
              {destinos.map(({ carpeta: c }) => (
                <option key={c.id} value={c.id}>
                  {etiquetaCarpeta(c.id)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="it-campo">
          <legend>¿Quién escribe en esta tabla?</legend>
          <div className="it-opciones">
            {QUIEN.map((q) => {
              const permitida = puedeCrearLibro(yo, q.id);
              return (
                <label key={q.id} className="it-opcion" data-multi={q.id === "multicampus" ? "" : undefined} aria-disabled={!permitida}>
                  <input type="radio" name="it-quien" disabled={!permitida} checked={captura === q.id} onChange={() => setCaptura(q.id)} />
                  <span>
                    <b>{q.titulo}</b>
                    <small>{permitida ? q.ayuda : `${q.ayuda} No tiene permiso para crearla.`}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="it-campo">
          <legend>¿Cómo empieza?</legend>
          <div className="it-seg" role="radiogroup" aria-label="Cómo empieza la tabla">
            {(
              [
                ["plantilla", "Desde una plantilla"],
                ["excel", "Desde un Excel"],
                ["blanco", "En blanco"],
              ] as const
            ).map(([id, rotulo]) => (
              <button key={id} type="button" role="radio" aria-checked={inicio === id} onClick={() => cambiarInicio(id)}>
                {rotulo}
              </button>
            ))}
          </div>

          {inicio === "plantilla" && (
            <div className="it-nuevo__plantillas" role="radiogroup" aria-label="Plantilla">
              {PLANTILLAS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={partida === p} className="it-chip it-chip--elegible" onClick={() => cambiarPartida(p)} title={PARTIDAS[p].ayuda}>
                  {PARTIDAS[p].rotulo}
                </button>
              ))}
            </div>
          )}

          {inicio === "excel" ? (
            <p className="it-ayuda">Elegirá el archivo en el siguiente paso: cada hoja del Excel pasa a ser una hoja de la tabla y cada encabezado se empareja con su concepto.</p>
          ) : (
            <>
              <ul className="it-nuevo__campos" aria-label="Campos de la tabla">
                {columnas.map((c) => (
                  <li key={c.clave} className={c.concepto_id ? undefined : "is-propio"}>
                    {c.etiqueta}
                    {c.obligatorio && <abbr title="Obligatorio">*</abbr>}
                  </li>
                ))}
                {columnas.length === 0 && <li className="is-vacio">Todavía sin campos: agréguelos abajo.</li>}
              </ul>
              <details className="it-nuevo__mas" open={camposAbiertos}>
                <summary>
                  <Icon name="plus" size={14} />
                  Agregar o quitar campos
                </summary>
                <ul className="it-conceptos">
                  {elegibles.map((c) => {
                    const si = elegidos.includes(c.id);
                    return (
                      <li key={c.id}>
                        <label>
                          <input type="checkbox" checked={si} onChange={() => alternar(c.id)} />
                          <span>{c.nombre}</span>
                        </label>
                        {si && c.id !== "duracion_dias" && (
                          <label className="it-mini">
                            <input type="checkbox" checked={obligatorios.has(c.id)} onChange={() => alternarObligatorio(c.id)} />
                            obligatorio
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="it-fila it-fila--campos">
                  <input type="text" aria-label="Nombre del campo propio" placeholder="Campo propio. Ej. Nº de créditos" value={propio.etiqueta} onChange={(e) => setPropio({ ...propio, etiqueta: e.target.value })} />
                  <select aria-label="Tipo del campo propio" value={propio.tipo} onChange={(e) => setPropio({ ...propio, tipo: e.target.value as TipoPropio })}>
                    {TIPOS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.rotulo}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="es-btn es-btn--sm" onClick={agregarPropio} disabled={!propio.etiqueta.trim()}>
                    Agregar
                  </button>
                </div>
                {propio.tipo === "lista" && (
                  <input type="text" aria-label="Opciones de la lista" placeholder="Opciones separadas por punto y coma" value={propio.opciones} onChange={(e) => setPropio({ ...propio, opciones: e.target.value })} />
                )}
                {propios.length > 0 && (
                  <ul className="it-nuevo__propios" aria-label="Campos propios">
                    {propios.map((c) => (
                      <li key={c.clave}>
                        {c.etiqueta}
                        <button type="button" aria-label={`Quitar ${c.etiqueta}`} onClick={() => setPropios((p) => p.filter((x) => x.clave !== c.clave))}>
                          <Icon name="close" size={12} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </>
          )}
          <p className="it-ayuda">Campus, persona que registra, fecha y origen (Excel o a mano) se agregan solos a cada fila. No hace falta crearlos.</p>
        </fieldset>
      </div>
    </Ventana>
  );
}

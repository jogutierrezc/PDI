/* =============================================================================
   Internacionalización · «Nueva tabla» y «Nueva hoja» (solo el Director).

   El asistente de cuatro pasos, con Pilo al costado: 1 nombre y quién captura,
   2 la clase de la hoja (movilidad saliente, movilidad entrante, convenio o general: decide qué cuenta
   en Cifras), 3 los conceptos del catálogo que lleva (un concepto que ya existe se reutiliza y
   así todas las plantillas lo reconocen), campos propios si hacen falta, cuáles
   son obligatorios, y 4 la vista previa de las columnas.
   Periodo y campus no son columnas: van en cada fila.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { PiloMood } from "../../../components/pilo/PiloAvatar";
import { Icon } from "../../../components/ui/Icon";
import { useCrearTabla, useGuardarColumnas, useGuardarHoja } from "../datos";
import { claveDePropio } from "../lib/conceptos";
import type { Columna, IntConceptoRow, IntLibroRow, IntTipo, LibroCompleto } from "../tipos";
import { MarcoAsistente } from "../../../components/espacio/MarcoAsistente";
import { columnasDesdeConceptos, PARTIDAS } from "./logica";
import type { Partida } from "./logica";

const TIPOS: { id: Exclude<IntTipo, "calculado">; rotulo: string }[] = [
  { id: "texto", rotulo: "Texto" },
  { id: "numero", rotulo: "Número" },
  { id: "fecha", rotulo: "Fecha" },
  { id: "lista", rotulo: "Lista" },
];

const ETIQUETA_TIPO: Record<IntTipo, string> = { texto: "texto", numero: "número", fecha: "fecha", lista: "lista", calculado: "calculado" };

const PASOS: { titulo: string; texto: string; animo: PiloMood }[] = [
  { titulo: "Empecemos por el nombre", texto: "Póngale un nombre claro. Si es una tabla nueva, diga también quién captura: cada campus sus filas o solo la oficina principal.", animo: "feliz" },
  { titulo: "¿Qué clase de hoja es?", texto: "La clase decide qué cuenta en Cifras: la movilidad saliente y la entrante se suman aparte, y los convenios van por su lado.", animo: "idea" },
  { titulo: "Elija los campos", texto: "Reutilice los del catálogo: así todas las plantillas los reconocen. Si falta uno, créelo como campo propio.", animo: "piensa" },
  { titulo: "Revise y cree", texto: "Periodo y campus no son columnas: van en cada fila. Si todo está bien, la creo ahora y usted define la ventana en «Periodos».", animo: "excelente" },
];

export function NuevaTabla({
  libro,
  conceptos,
  onCerrar,
  onCreada,
}: {
  /** Con libro: agrega una hoja a ese libro; sin libro: crea la tabla. */
  libro?: LibroCompleto;
  conceptos: IntConceptoRow[];
  onCerrar: () => void;
  onCreada: (libroId: string, hojaId?: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [hojaNombre, setHojaNombre] = useState("");
  const [partida, setPartida] = useState<Partida>("saliente");
  const [elegidos, setElegidos] = useState<string[]>(PARTIDAS.saliente.conceptos);
  const [obligatorios, setObligatorios] = useState<Set<string>>(new Set(["numero_documento", "fecha_inicio"]));
  const [propios, setPropios] = useState<Columna[]>([]);
  const [propio, setPropio] = useState({ etiqueta: "", tipo: "texto" as Exclude<IntTipo, "calculado">, opciones: "" });
  const [captura, setCaptura] = useState<IntLibroRow["captura"]>("campus");
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState(0);
  const crear = useCrearTabla();
  const guardarHoja = useGuardarHoja();
  const guardarColumnas = useGuardarColumnas();
  const ocupado = crear.isPending || guardarHoja.isPending || guardarColumnas.isPending;

  const elegibles = conceptos.filter((c) => !c.implicito);
  const columnas = useMemo(() => columnasDesdeConceptos(elegidos, conceptos, obligatorios, propios), [elegidos, conceptos, obligatorios, propios]);

  const cambiarPartida = (p: Partida) => {
    setPartida(p);
    setElegidos(PARTIDAS[p].conceptos.filter((id) => conceptos.some((c) => c.id === id)));
  };

  const agregarPropio = () => {
    const etiqueta = propio.etiqueta.trim();
    if (!etiqueta) return;
    const clave = claveDePropio(etiqueta, [...columnas.map((c) => c.clave)]);
    const opciones = propio.tipo === "lista" ? propio.opciones.split(/[;,\n]/).map((o) => o.trim()).filter(Boolean) : [];
    setPropios((p) => [...p, { clave, etiqueta, tipo: propio.tipo, concepto_id: null, obligatorio: false, opciones, calculo: null }]);
    setPropio({ etiqueta: "", tipo: "texto", opciones: "" });
  };

  const enviar = async () => {
    setError(null);
    const titulo = (libro ? hojaNombre : nombre).trim();
    if (!titulo) return setError(libro ? "Escriba el nombre de la hoja." : "Escriba el nombre de la tabla.");
    if (columnas.length === 0) return setError("Elija al menos un campo.");
    const def = PARTIDAS[partida];
    try {
      if (libro) {
        const hoja = await guardarHoja.mutateAsync({ libro_id: libro.id, nombre: titulo, clase: def.clase, sentido: def.sentido, orden: libro.hojas.length + 1 });
        await guardarColumnas.mutateAsync({ hoja, columnas });
        onCreada(libro.id, hoja);
      } else {
        const id = await crear.mutateAsync({
          nombre: titulo,
          captura,
          hojas: [{ nombre: hojaNombre.trim() || def.rotulo, clase: def.clase, sentido: def.sentido, columnas }],
        });
        onCreada(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const puede = [Boolean((libro ? hojaNombre : nombre).trim()), true, columnas.length > 0, true][paso];
  const pie = (
    <>
      {error && (
        <p className="it-error" role="alert">
          {error}
        </p>
      )}
      {paso > 0 ? (
        <button type="button" className="es-btn" onClick={() => setPaso(paso - 1)}>
          Atrás
        </button>
      ) : (
        <button type="button" className="es-btn" onClick={onCerrar}>
          Cancelar
        </button>
      )}
      {paso < 3 ? (
        <button type="button" className="es-btn es-btn--pri" disabled={!puede} onClick={() => setPaso(paso + 1)}>
          Siguiente
        </button>
      ) : (
        <button type="button" className="es-btn es-btn--pri" disabled={ocupado} onClick={() => void enviar()}>
          {ocupado ? "Creando…" : libro ? "Crear hoja" : "Crear tabla"}
        </button>
      )}
    </>
  );

  return (
    <MarcoAsistente titulo={libro ? `Nueva hoja en «${libro.nombre}»` : "Nueva tabla"} paso={paso} pasos={4} pilo={{ animo: error ? "cuidado" : ocupado ? "piensa2" : PASOS[paso].animo, titulo: PASOS[paso].titulo, texto: PASOS[paso].texto }} onCerrar={onCerrar} pie={pie}>
      {paso === 0 && (
        <>
      {!libro && (
          <label className="it-campo">
            <span>Nombre de la tabla</span>
            <input data-autofocus type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Movilidad estudiantil" />
          </label>
        )}
        <label className="it-campo">
          <span>{libro ? "Nombre de la hoja" : "Nombre de la primera hoja"}</span>
          <input data-autofocus={libro ? true : undefined} type="text" value={hojaNombre} onChange={(e) => setHojaNombre(e.target.value)} placeholder={PARTIDAS[partida].rotulo} />
        </label>

      {!libro && (
          <label className="it-campo">
            <span>Quién captura</span>
            <select value={captura} onChange={(e) => setCaptura(e.target.value as IntLibroRow["captura"])}>
              <option value="campus">Cada campus sus filas</option>
              <option value="oficina">Solo la oficina principal (el Director)</option>
            </select>
          </label>
        )}
        </>
      )}
      {paso === 1 && (
        <>
      <fieldset className="it-campo">
          <legend>Clase de la hoja</legend>
          <div className="it-opciones">
            {(Object.keys(PARTIDAS) as Partida[]).map((p) => (
              <label key={p} className="it-opcion">
                <input type="radio" name="it-partida" checked={partida === p} onChange={() => cambiarPartida(p)} />
                <span>
                  <b>{PARTIDAS[p].rotulo}</b>
                  <small>{PARTIDAS[p].ayuda}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        </>
      )}
      {paso === 2 && (
        <>
      <fieldset className="it-campo">
          <legend>Campos del catálogo de conceptos</legend>
          <p className="it-ayuda">Un campo que ya existe se reutiliza: así todas las plantillas lo reconocen. Periodo y campus van en cada fila.</p>
          <ul className="it-conceptos">
            {elegibles.map((c) => {
              const si = elegidos.includes(c.id);
              return (
                <li key={c.id}>
                  <label>
                    <input type="checkbox" checked={si} onChange={() => setElegidos((x) => (si ? x.filter((k) => k !== c.id) : [...x, c.id]))} />
                    <span>{c.nombre}</span>
                  </label>
                  <span className="it-chip">{ETIQUETA_TIPO[c.tipo]}</span>
                  {si && c.id !== "duracion_dias" && (
                    <label className="it-mini">
                      <input
                        type="checkbox"
                        checked={obligatorios.has(c.id)}
                        onChange={() => {
                          const s = new Set(obligatorios);
                          if (s.has(c.id)) s.delete(c.id);
                          else s.add(c.id);
                          setObligatorios(s);
                        }}
                      />
                      obligatorio
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

      <fieldset className="it-campo">
          <legend>Campo propio (si el catálogo no lo tiene)</legend>
          <div className="it-fila it-fila--campos">
            <input type="text" aria-label="Nombre del campo propio" placeholder="Ej. Nº de créditos" value={propio.etiqueta} onChange={(e) => setPropio({ ...propio, etiqueta: e.target.value })} />
            <select aria-label="Tipo del campo propio" value={propio.tipo} onChange={(e) => setPropio({ ...propio, tipo: e.target.value as Exclude<IntTipo, "calculado"> })}>
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.rotulo}
                </option>
              ))}
            </select>
            <button type="button" className="button-secondary it-btn" onClick={agregarPropio} disabled={!propio.etiqueta.trim()}>
              Agregar
            </button>
          </div>
          {propio.tipo === "lista" && (
            <input type="text" aria-label="Opciones de la lista" placeholder="Opciones separadas por punto y coma" value={propio.opciones} onChange={(e) => setPropio({ ...propio, opciones: e.target.value })} />
          )}
          <p className="it-ayuda">Un campo propio no lo reconocen las plantillas hasta que se empareje con un concepto.</p>
        </fieldset>

        </>
      )}
      {paso === 3 && (
        <>
      <div className="it-campo">
          <span>Vista previa de columnas ({columnas.length})</span>
          <ol className="it-previa">
            <li className="is-implicito">Periodo</li>
            <li className="is-implicito">Campus</li>
            {columnas.map((c) => (
              <li key={c.clave} className={c.concepto_id ? undefined : "is-propio"}>
                {c.etiqueta}
                {c.obligatorio && " *"}
                {!c.concepto_id && (
                  <button type="button" aria-label={`Quitar ${c.etiqueta}`} onClick={() => setPropios((p) => p.filter((x) => x.clave !== c.clave))}>
                    <Icon name="close" size={12} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>

        </>
      )}
    </MarcoAsistente>
  );
}

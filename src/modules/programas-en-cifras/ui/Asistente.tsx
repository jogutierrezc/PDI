/* =============================================================================
   Programas en Cifras · el asistente «Nuevo archivo» (4 pasos, con Pilo al lado).

   1 Qué crear: tabla, lista, desde un Excel propio o desde un cuadro del CNA / plantilla del SNIES.
   2 La estructura: partida, Excel (se lee en el navegador) o destino.
   3 Los campos: nombre, tipo y obligatorio, con avisos «Coincide con … del CNA».
   4 Nombre, carpeta, formato y destinos a conectar. Crea y abre el editor creciendo desde el botón.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import type { PiloMood } from "../../../components/pilo/PiloAvatar";
import { useCrearArchivo } from "../datos";
import type { ColumnaNueva } from "../datos";
import { autoMap, cobertura, columnasIniciales, DESTINOS, destino as destinoDe, etiquetaSistema, nombreCorto, sugerirDestino } from "../lib/destinos";
import { claveDeEncabezado, columnasDesdeMatriz } from "../lib/inferencia";
import { ETIQUETA_TIPO, leerFila } from "../lib/validacion";
import type { Columna, PcMapa, PcTipo } from "../tipos";
import { Anillo } from "../../../components/espacio/piezas";
import { MarcoAsistente } from "../../../components/espacio/MarcoAsistente";
import { textoDeValor } from "../../../components/espacio/logica";
import { carpetaDe, useEspacio } from "./contexto";
import type { OpcionesAsistente } from "./contexto";
import { leerArchivoEnNavegador } from "./leer-excel";
import type { Matriz } from "./leer-excel";
import { resumenColumnas } from "./logica";

type Origen = "blanco" | "excel" | "destino";
interface Campo {
  clave: string;
  etiqueta: string;
  tipo: PcTipo;
  obligatorio: boolean;
  opciones: string[];
}

const PARTIDAS: Record<string, [string, [string, PcTipo, boolean, string[]?][]]> = {
  grupos: ["Grupos y líneas", [["Nombre del grupo", "texto", true], ["Código en MinCiencias", "texto", true], ["Categoría", "lista", false, ["A1", "A", "B", "C", "Reconocido"]], ["Líneas de investigación", "texto", false]]],
  proyectos: ["Proyectos", [["Nombre del proyecto", "texto", true], ["Tipo", "lista", true, ["Investigación", "Creación", "Innovación", "Extensión"]], ["Financiador", "texto", false], ["Inicio", "fecha", false], ["Fin", "fecha", false]]],
  actividades: ["Actividades con participantes", [["Actividad", "texto", true], ["Año", "numero", true], ["Estudiantes participantes", "numero", false], ["Profesores participantes", "numero", false]]],
  personas: ["Personas", [["Tipo de documento", "lista", true, ["Cédula de ciudadanía", "Tarjeta de identidad", "Cédula de extranjería", "Pasaporte"]], ["Número de documento", "texto", true], ["Primer nombre", "texto", true], ["Primer apellido", "texto", true]]],
};

const EJEMPLO: Matriz = [
  ["Nombre del convenio", "Institución", "Tipo de convenio", "Fecha de inicio", "Fecha de vencimiento", "Estudiantes en práctica", "Responsable"],
  ["Docencia-servicio 2024", "Clínica Foscal", "Docencia-servicio", "2024-03-01", "2027-03-31", "24", "Dirección"],
  ["Cooperación académica", "Universidad de Guadalajara", "Cooperación", "2023-12-15", "2026-12-15", "6", "Coordinación"],
  ["Prácticas sociales", "Alcaldía de Bucaramanga", "Cooperación", "2025-01-20", "2028-01-20", "12", "Dirección"],
  ["Docencia-servicio 2025", "Hospital Universitario", "Docencia-servicio", "2025-02-10", "2028-02-10", "30", "Dirección"],
  ["Movilidad entrante", "Universidad de Valencia", "Movilidad", "2025-05-12", "2026-05-12", "2", "Coordinación"],
  ["Cooperación tecnológica", "Clínica del Norte", "Cooperación", "2025-07-01", "2027-07-01", "8", "Coordinación"],
];

const PASOS: { titulo: string; texto: string; animo: PiloMood }[] = [
  { titulo: "Empiece por lo que quiere guardar", texto: "Una tabla sirve para filas con las mismas columnas. Una lista es más liviana, para tareas o elementos sueltos. Si ya tiene un Excel, súbalo y yo armo las columnas.", animo: "feliz" },
  { titulo: "Aquí armamos la estructura", texto: "Elija una partida, suba su archivo o escoja el cuadro del CNA o la plantilla del SNIES. Después puede cambiar cualquier columna.", animo: "idea" },
  { titulo: "Revise los campos", texto: "Marque como obligatorio lo que no puede faltar. Si una columna se parece a una del CNA o del SNIES, se lo aviso debajo para que el archivo responda solo.", animo: "piensa" },
  { titulo: "Último paso", texto: "Póngale un nombre claro y elija la carpeta. Marque con una casilla los cuadros a los que ya puede responder; los conecta ahora o después.", animo: "excelente" },
];

const ELECCIONES: { id: string; icono: IconName; titulo: string; texto: string }[] = [
  { id: "tabla", icono: "table", titulo: "Tabla en blanco", texto: "Filas y columnas con tipos, como una hoja de cálculo." },
  { id: "lista", icono: "list", titulo: "Lista", texto: "Elementos sueltos: tareas, convenios, pendientes." },
  { id: "excel", icono: "upload", titulo: "Desde mi plantilla de Excel", texto: "Suba su archivo y armo las columnas por usted." },
  { id: "destino", icono: "link", titulo: "Para un cuadro del CNA o del SNIES", texto: "Parta de la estructura que pide el Ministerio o el CNA." },
];

const comoColumna = (c: Campo): Columna => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, obligatorio: c.obligatorio, opciones: c.opciones });

export function Asistente({ opciones, onCerrar, onCreado }: { opciones: OpcionesAsistente; onCerrar: () => void; onCreado: (id: string) => void }) {
  const { archivos, carpetas, pareja, salud, decir } = useEspacio();
  const crear = useCrearArchivo();
  const preset = opciones.destino ? destinoDe(opciones.destino) : null;
  const [paso, setPaso] = useState(preset || opciones.excel ? 1 : 0);
  const [origen, setOrigen] = useState<Origen | null>(preset ? "destino" : opciones.excel ? "excel" : null);
  const [formato, setFormato] = useState<"tabla" | "lista">("tabla");
  const [partida, setPartida] = useState<string | null>(null);
  const [destinoId, setDestinoId] = useState<string | null>(preset?.id ?? null);
  const [campos, setCampos] = useState<Campo[]>(() => (preset ? camposDe(preset.id) : []));
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [archivoLeido, setArchivoLeido] = useState("");
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState(preset ? nombreCorto(preset) : "");
  const [carpeta, setCarpeta] = useState(opciones.carpeta ?? (preset ? carpetaDe(carpetas, preset.carpeta)?.id : carpetaDe(carpetas, "trabajo")?.id) ?? "");
  const [marcados, setMarcados] = useState<Record<string, boolean> | null>(null);
  const [encima, setEncima] = useState(false);
  const destino = destinoDe(destinoId);
  const fija = Boolean(destino?.estructura_bloqueada);

  function camposDe(id: string): Campo[] {
    const d = destinoDe(id);
    return d ? columnasIniciales(d).map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, obligatorio: c.obligatorio, opciones: c.opciones })) : [];
  }

  const elegir = (id: string) => {
    setOrigen(id === "tabla" || id === "lista" ? "blanco" : (id as Origen));
    setFormato(id === "lista" ? "lista" : "tabla");
    setCampos([]);
    setFilas([]);
    setPartida(null);
    setDestinoId(null);
    setArchivoLeido("");
    setError("");
  };

  const aplicarMatriz = (archivo: string, matriz: Matriz) => {
    const r = columnasDesdeMatriz(matriz);
    setCampos(r.columnas.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, obligatorio: false, opciones: c.opciones })));
    setFilas(r.filas);
    setArchivoLeido(archivo);
    setError(r.columnas.length ? "" : "No encontré encabezados en la primera hoja.");
    if (!nombre) setNombre(archivo.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "));
  };

  const leer = (f: File | undefined) => {
    if (f) leerArchivoEnNavegador(f).then((l) => aplicarMatriz(l.nombre, l.matriz), (e: Error) => setError(e.message));
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    leer(e.dataTransfer.files[0]);
  };

  const cambiar = (i: number, parcial: Partial<Campo>) => setCampos((cs) => cs.map((c, j) => (j === i ? { ...c, ...parcial } : c)));
  const cambiarTipo = (i: number, tipo: PcTipo) => {
    const c = campos[i];
    const vistos = [...new Set(filas.map((f) => textoDeValor(f[c.clave])).filter(Boolean))].slice(0, 30);
    cambiar(i, { tipo, opciones: tipo === "lista" ? (c.opciones.length ? c.opciones : vistos.length ? vistos : ["Sí", "No"]) : [] });
  };

  const candidatos = useMemo(() => {
    if (paso < 3) return [];
    const cols = campos.map(comoColumna);
    return DESTINOS.filter((d) => !d.automatico && d.id !== destinoId && (salud || !d.solo_salud))
      .map((d) => ({ d, cv: cobertura(autoMap(cols, d), d) }))
      .filter((x) => x.cv.pct >= 40)
      .sort((a, b) => b.cv.pct - a.cv.pct);
  }, [paso, campos, destinoId, salud]);
  const elegidos = marcados ?? Object.fromEntries(candidatos.map((x) => [x.d.id, x.cv.pct >= 60]));

  const puede = [Boolean(origen), campos.length > 0, campos.length > 0 && campos.every((c) => c.etiqueta.trim()), Boolean(nombre.trim() && carpeta)][paso];

  const ir = (dir: 1 | -1) => {
    const siguiente = paso + dir;
    setPaso(siguiente);
  };

  const guardar = () => {
    const usadas: string[] = [];
    const finales = campos.map((c) => {
      const clave = fija || (destinoId && c.clave) ? c.clave : claveDeEncabezado(c.etiqueta, usadas);
      usadas.push(clave);
      return { ...c, clave, etiqueta: c.etiqueta.trim() };
    });
    const cols: Columna[] = finales.map(comoColumna);
    const datos = filas.map((f) => leerFila(cols, Object.fromEntries(finales.map((c, i) => [c.clave, textoDeValor(f[campos[i].clave])]))).datos);
    const mapas: Record<string, PcMapa> = {};
    for (const [id, on] of Object.entries(elegidos)) {
      const d = destinoDe(id);
      if (on && d) mapas[id] = autoMap(cols, d);
    }
    if (destino && !fija) mapas[destino.id] = autoMap(cols, destino);
    const columnas: ColumnaNueva[] = fija ? [] : finales.map(({ clave, etiqueta, tipo, obligatorio, opciones: o }) => ({ clave, etiqueta, tipo, obligatorio, opciones: o }));
    crear.mutate(
      { programa: pareja.programa_id, campus: pareja.campus_id, carpeta, nombre: nombre.trim(), tipo: destino ? destino.tipo_archivo : formato, destino: fija ? destino!.id : null, columnas, filas: datos.map((d) => ({ datos: d })), mapas },
      {
        onSuccess: (a) => {
          decir(`«${a.nombre}» creado.`);
          onCreado(a.id);
        },
        onError: (e) => decir(e.message),
      },
    );
  };

  const animo: PiloMood = error ? "cuidado" : crear.isPending ? "piensa2" : PASOS[paso].animo;
  const pie = (
    <>
      {paso > 0 ? <button type="button" className="es-btn" onClick={() => ir(-1)}>Atrás</button> : <span />}
      {paso < 3 ? (
        <button type="button" className="es-btn es-btn--pri" disabled={!puede} onClick={() => ir(1)}>Siguiente</button>
      ) : (
        <button type="button" className="es-btn es-btn--pri" disabled={!puede || crear.isPending} onClick={guardar}>Crear y abrir</button>
      )}
    </>
  );

  return (
    <MarcoAsistente titulo="Nuevo archivo" paso={paso} pasos={4} pilo={{ animo, titulo: PASOS[paso].titulo, texto: PASOS[paso].texto }} onCerrar={onCerrar} pie={pie}>
          {paso === 0 && (
            <div className="es-choices" role="group" aria-label="Qué quiere crear">
              {ELECCIONES.map((c) => (
                <button key={c.id} type="button" className="es-choice" aria-pressed={c.id === "tabla" ? origen === "blanco" && formato === "tabla" : c.id === "lista" ? origen === "blanco" && formato === "lista" : origen === c.id} onClick={() => elegir(c.id)}>
                  <Icon name={c.icono} size={26} />
                  <b>{c.titulo}</b>
                  <span>{c.texto}</span>
                </button>
              ))}
            </div>
          )}
          {paso === 1 && origen === "blanco" && (
            <>
              <div><b>Elija una partida</b><p className="es-note">Son estructuras comunes. Podrá cambiarlas en el siguiente paso.</p></div>
              <div className="es-chips" role="group" aria-label="Partidas">
                {[...Object.entries(PARTIDAS).map(([k, v]) => [k, v[0]] as const), ["vacia", "Empezar vacía"] as const].map(([k, t]) => (
                  <button key={k} type="button" className="es-chip" aria-pressed={partida === k} onClick={() => { setPartida(k); setCampos(k === "vacia" ? [{ clave: "nombre", etiqueta: "Nombre", tipo: "texto", obligatorio: true, opciones: [] }] : PARTIDAS[k][1].map(([e, t2, o, ops]) => ({ clave: claveDeEncabezado(e), etiqueta: e, tipo: t2, obligatorio: o, opciones: ops ?? [] }))); if (!nombre && k !== "vacia") setNombre(PARTIDAS[k][0]); }}>{t}</button>
                ))}
              </div>
              {campos.length > 0 && <p className="es-note">{campos.length} columnas: {campos.map((c) => c.etiqueta).join(", ")}.</p>}
            </>
          )}
          {paso === 1 && origen === "excel" && (
            <>
              <div className="pc-drop" data-over={encima} onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)} onDrop={soltar}>
                <Icon name="upload" size={28} />
                <b>Arrastre su Excel aquí</b>
                <span className="es-note">Se lee en su navegador. Acepta .xlsx y .csv.</span>
                <div className="es-act">
                  <label className="es-btn es-btn--pri es-btn--sm" style={{ cursor: "pointer" }}>
                    Elegir archivo
                    <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => leer(e.target.files?.[0])} />
                  </label>
                  <button type="button" className="es-btn es-btn--sm" onClick={() => aplicarMatriz("Convenios-de-práctica.xlsx", EJEMPLO)}>Usar una plantilla de ejemplo</button>
                </div>
              </div>
              {error && <p className="es-note" role="alert" style={{ color: "var(--status-risk)" }}>{error}</p>}
              {archivoLeido && !error && (
                <div className="pc-prev">
                  <b>{archivoLeido}</b>
                  <p className="es-note es-num" style={{ marginTop: 4 }}>{resumenColumnas(campos.length, filas.length)}. Tipos: {campos.map((c) => `${c.etiqueta} (${ETIQUETA_TIPO[c.tipo].toLowerCase()})`).join(", ")}.</p>
                  {(() => {
                    const mejor = DESTINOS.filter((d) => !d.automatico).map((d) => ({ d, cv: cobertura(autoMap(campos.map(comoColumna), d), d) })).sort((a, b) => b.cv.pct - a.cv.pct)[0];
                    return mejor && mejor.cv.pct >= 40 ? <p className="es-note">Se parece a {etiquetaSistema(mejor.d)} · {nombreCorto(mejor.d)} ({mejor.cv.pct} %).</p> : null;
                  })()}
                </div>
              )}
            </>
          )}
          {paso === 1 && origen === "destino" && (
            <>
              <div><b>Elija el cuadro o la plantilla</b><p className="es-note">Las columnas arrancan como las pide el destino.</p></div>
              <div className="pc-tpl" role="group" aria-label="Destinos">
                {DESTINOS.filter((d) => !d.automatico && (salud || !d.solo_salud)).map((d) => {
                  const existe = d.estructura_bloqueada && archivos.some((a) => a.destino_origen === d.id);
                  return (
                    <button key={d.id} type="button" className="pc-tplb" aria-pressed={destinoId === d.id} disabled={existe} onClick={() => { setDestinoId(d.id); setCampos(camposDe(d.id)); setNombre(nombreCorto(d)); setCarpeta(carpetaDe(carpetas, d.carpeta)?.id ?? carpeta); }}>
                      <span className="es-tag" data-s={d.sistema}>{d.sistema}</span>
                      <span><b>{d.sistema === "CNA" ? d.nombre : nombreCorto(d)}</b><span>{existe ? "Ya existe este archivo" : `${d.columnas.length} columnas`}</span></span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {paso === 2 && (
            <>
              <div><b>Revise los campos</b><p className="es-note">{fija ? "El CNA fija estos campos; no se pueden cambiar." : "Nombre, tipo y si es obligatorio. Debajo verá si una columna ya coincide con el CNA o el SNIES."}</p></div>
              <div className="pc-colrows">
                {campos.map((c, i) => {
                  const s = !destino ? sugerirDestino(c.etiqueta) : null;
                  return (
                    <div className="pc-colrow" key={c.clave + i}>
                      <input className="es-inp" value={c.etiqueta} disabled={fija} aria-label={`Nombre del campo ${i + 1}`} onChange={(e) => cambiar(i, { etiqueta: e.target.value })} />
                      <select className="es-inp" value={c.tipo} disabled={fija} aria-label={`Tipo del campo ${i + 1}`} onChange={(e) => cambiarTipo(i, e.target.value as PcTipo)}>
                        {(Object.keys(ETIQUETA_TIPO) as PcTipo[]).map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
                      </select>
                      <label className="es-ck"><input type="checkbox" checked={c.obligatorio} disabled={fija} onChange={(e) => cambiar(i, { obligatorio: e.target.checked })} /> Obligatorio</label>
                      {!fija && <button type="button" className="es-mini" aria-label="Quitar el campo" onClick={() => setCampos((cs) => cs.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>}
                      {s && <div className="es-hint"><span className="es-tag" data-s={s.destino.sistema}>{s.destino.sistema}</span>Coincide con «{s.columna.etiqueta}» de {nombreCorto(s.destino)}</div>}
                    </div>
                  );
                })}
              </div>
              {!fija && <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} onClick={() => setCampos((cs) => [...cs, { clave: claveDeEncabezado("Nuevo campo", cs.map((c) => c.clave)), etiqueta: "Nuevo campo", tipo: "texto", obligatorio: false, opciones: [] }])}><Icon name="plus" size={16} />Agregar campo</button>}
            </>
          )}
          {paso === 3 && (
            <>
              <label className="es-fl">Nombre del archivo<input type="text" className="es-inp" data-foco value={nombre} placeholder="Ej. Convenios de práctica" onChange={(e) => setNombre(e.target.value)} /></label>
              <div className="es-fila">
                <label className="es-fl">Carpeta
                  <select className="es-inp" value={carpeta} onChange={(e) => setCarpeta(e.target.value)}>{carpetas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
                </label>
                {!destino && (
                  <div>
                    <div className="es-fl" style={{ marginBottom: 4 }}>Formato</div>
                    <div className="es-seg" role="group" aria-label="Formato">
                      {(["tabla", "lista"] as const).map((f) => <button key={f} type="button" style={{ width: "auto", padding: "0 12px" }} aria-pressed={formato === f} onClick={() => setFormato(f)}>{f === "tabla" ? "Tabla" : "Lista"}</button>)}
                    </div>
                  </div>
                )}
              </div>
              <div><b>Puede responder a</b><p className="es-note">Sus columnas ya coinciden con estos destinos. Marque los que quiera conectar.</p></div>
              {candidatos.length ? candidatos.map(({ d, cv }) => (
                <label key={d.id} className="pc-tplb pc-tplb--check">
                  <input type="checkbox" checked={Boolean(elegidos[d.id])} onChange={(e) => setMarcados({ ...elegidos, [d.id]: e.target.checked })} />
                  <span className="es-tag" data-s={d.sistema}>{d.sistema}</span>
                  <span><b>{nombreCorto(d)}</b><span className="es-num">{cv.n} de {cv.t} columnas</span></span>
                  <Anillo pct={cv.pct} size={34} etiqueta={`Cobertura de ${d.nombre}`} />
                </label>
              )) : <p className="es-note">Todavía ninguna columna coincide con un cuadro. Podrá conectarlo después desde «Responde a».</p>}
            </>
          )}
    </MarcoAsistente>
  );
}

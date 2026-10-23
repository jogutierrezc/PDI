/* =============================================================================
   UDrive · «Importar Word o PDF» (fase 3).

   Elegir el archivo → leerlo en el navegador (nada se sube todavía) →
   «Revisar antes de crear»: la lista en orden de lectura, con miniaturas de
   las figuras y la vista de las tablas, donde cada elemento se puede quitar,
   cambiar de tipo, unir con el anterior, partir, subir o bajar → crear.

   Pilo, si la persona lo deja activo, ordena solo lo ambiguo al leer (el nivel
   de los títulos, las palabras partidas por saltos de línea y el nombre de las
   tablas) y, con «Reordenar con Pilo», propone mejoras que se aplican o no.
   Nunca cambia letras ni números. Si Pilo no responde, se sigue con la lectura
   directa.

   Al crear: las tablas pasan a ser tablas de UDrive, las figuras se suben como
   imágenes a una carpeta «Imágenes de <informe>» (con reintentos; una que no
   suba queda como imagen pendiente) y el informe las usa por su id. Dos modos:
   «nuevo» crea un informe en una carpeta y lo abre; «agregar» deja los bloques
   al final del informe abierto.
   ========================================================================== */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Ventana } from "../../../../components/espacio/Ventana";
import { supabase } from "../../../../lib/supabase";
import { useArchivos, useCarpetas, useCrearCarpeta, useCrearItem, useSubirArchivo } from "../../datos";
import { pedirLimpieza, pedirNiveles, pedirNombres } from "../../datosPilo";
import { rutaDeCarpeta } from "../../lib/arbol";
import { LIMITES, documentoVacio, normalizarDocumento, validarDocumento } from "../../lib/documento";
import type { Bloque, Documento, Fuente } from "../../lib/documento";
import {
  LIMITE_FIGURAS,
  LIMITE_TABLAS,
  aBloques,
  aplicarLimpieza,
  aplicarNiveles,
  aplicarNombres,
  candidatosALimpiar,
  etiquetaDeElemento,
  hayTitulosDudosos,
  indicesDeTablas,
  indicesDeTitulos,
  leerArchivo,
  muestraDeTabla,
  resumenDeElemento,
  sinMarcas,
  tablaDeElemento,
  tipoDeArchivo,
} from "../../lib/importar";
import type { Elemento, Lectura } from "../../lib/importar";
import { TIPOS_TEXTO, cambiarTipo, esTexto, mover, partir, resumenDeConteo, sePuedenUnir, tablaATexto, tipoDe, unir } from "../../lib/importarEditar";
import type { Fila, TipoTexto } from "../../lib/importarEditar";
import { limpiarNombre, nombreUnico } from "../../lib/nombres";
import { escapar } from "../../lib/texto";
import { subirFiguras } from "./subirFiguras";

type Props = { decir(m: string): void; onCerrar(): void } & (
  | { modo: "nuevo"; carpetaInicial: string | null }
  | { modo: "agregar"; carpeta: string | null; nombreInforme: string; plantillaDoc: Documento; onAgregar(bloques: Bloque[], fuentes: Fuente[]): void }
);

type Fase = "elegir" | "leyendo" | "revisar" | "creando";

const sinEscape = (t: string) => t.replace(/\\(.)/g, "$1");
const idFila = () => `f${Math.random().toString(36).slice(2, 10)}`;
const baseDeNombre = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

/* ---------- las piezas de la lista ---------------------------------------------------------------------- */

function Miniatura({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img className="ud-rev-mini" src={url} alt={alt} /> : <span className="ud-rev-mini" />;
}

interface Acciones {
  alternar(k: number): void;
  tipo(k: number, t: TipoTexto): void;
  subir(k: number): void;
  bajar(k: number): void;
  unirAnterior(k: number): void;
  guardarTexto(k: number, borrador: string): void;
  partirTexto(k: number, borrador: string, pos: number): void;
  tablaATexto(k: number): void;
  pie(k: number, campo: "titulo" | "nota", valor: string): void;
  editar(k: number | null): void;
}

const aBorrador = (x: Elemento): string => (x.t === "lista" ? x.items.join("\n") : x.t === "titulo" || x.t === "parrafo" || x.t === "destacado" || x.t === "nota" ? x.texto : "");

function Edicion({ fila, a }: { fila: Fila; a: Acciones }) {
  const [borrador, setBorrador] = useState(() => aBorrador(fila.x));
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);
  const partible = fila.x.t === "parrafo" || fila.x.t === "destacado" || fila.x.t === "nota";
  return (
    <div className="ud-rev-edit">
      <textarea ref={area} className="es-inp" rows={Math.min(10, Math.max(3, Math.ceil(borrador.length / 90)))} value={borrador} onChange={(e) => setBorrador(e.target.value)} aria-label="Texto del bloque" />
      <div className="ud-rev-acc">
        <button type="button" className="es-btn es-btn--sm es-btn--pri" onClick={() => a.guardarTexto(fila.k, borrador)}>Aplicar</button>
        {partible ? (
          <button type="button" className="es-btn es-btn--sm" title="Parte el texto en dos donde está el cursor" onClick={() => a.partirTexto(fila.k, borrador, area.current?.selectionStart ?? 0)}>
            Partir en el cursor
          </button>
        ) : null}
        <button type="button" className="es-btn es-btn--sm" onClick={() => a.editar(null)}>Cancelar</button>
        {fila.x.t === "lista" ? <span className="es-note">Un elemento por línea.</span> : null}
      </div>
    </div>
  );
}

function VistaTabla({ filas }: { filas: string[][] }) {
  const cols = Math.min(8, Math.max(0, ...filas.map((f) => f.length)));
  return (
    <div className="ud-rev-tabla" role="img" aria-label={`Vista previa de la tabla: ${filas.length} filas`}>
      <table>
        <tbody>
          {filas.slice(0, 6).map((f, i) => (
            <tr key={i}>
              {Array.from({ length: cols }, (_, c) => (i === 0 ? <th key={c}>{f[c] ?? ""}</th> : <td key={c}>{f[c] ?? ""}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length > 6 || Math.max(...filas.map((f) => f.length)) > 8 ? <span className="es-note">Muestra de {Math.min(6, filas.length)} de {filas.length} filas.</span> : null}
    </div>
  );
}

const FilaRevision = memo(function FilaRevision({ fila, previo, primera, ultima, editando, ocupado, a }: { fila: Fila; previo: Elemento | undefined; primera: boolean; ultima: boolean; editando: boolean; ocupado: boolean; a: Acciones }) {
  const x = fila.x;
  const tipo = tipoDe(x);
  return (
    <div className="ud-rev-fila" data-off={!fila.on} data-t={x.t}>
      <div className="ud-rev-cab">
        <label className="ud-imp-ck">
          <input type="checkbox" checked={fila.on} disabled={ocupado} onChange={() => a.alternar(fila.k)} aria-label={`Incluir: ${resumenDeElemento(x).slice(0, 60)}`} />
        </label>
        <span className="ud-imp-tipo">{etiquetaDeElemento(x)}</span>
        {tipo ? (
          <select className="es-inp ud-imp-nivel" value={tipo} disabled={ocupado} aria-label="Tipo de bloque" data-dudoso={x.t === "titulo" && x.dudoso} onChange={(e) => a.tipo(fila.k, e.target.value as TipoTexto)}>
            {TIPOS_TEXTO.map((t) => <option key={t.id} value={t.id}>{t.texto}</option>)}
          </select>
        ) : null}
        {x.t === "titulo" && x.dudoso ? <span className="ud-imp-dudoso" title="El nivel se dedujo solo por el tamaño o la negrita">revisar nivel</span> : null}
        {"pagina" in x && x.pagina ? <span className="es-note">pág. {x.pagina}</span> : null}
        <span className="es-grow" />
        {esTexto(x) && !editando ? <button type="button" className="es-btn es-btn--sm" disabled={ocupado} onClick={() => a.editar(fila.k)}>Editar</button> : null}
        {sePuedenUnir(previo, x) ? <button type="button" className="es-btn es-btn--sm" disabled={ocupado} onClick={() => a.unirAnterior(fila.k)} title="Pega este bloque al final del anterior">Unir con el anterior</button> : null}
        {x.t === "tabla" ? <button type="button" className="es-btn es-btn--sm" disabled={ocupado} onClick={() => a.tablaATexto(fila.k)} title="Si no es una tabla, la deja como texto">Pasar a texto</button> : null}
        <button type="button" className="es-btn es-btn--sm es-btn--ghost" disabled={ocupado || primera} aria-label="Subir" title="Subir" onClick={() => a.subir(fila.k)}>↑</button>
        <button type="button" className="es-btn es-btn--sm es-btn--ghost" disabled={ocupado || ultima} aria-label="Bajar" title="Bajar" onClick={() => a.bajar(fila.k)}>↓</button>
      </div>
      {editando && esTexto(x) ? (
        <Edicion fila={fila} a={a} />
      ) : x.t === "imagen" ? (
        <div className="ud-rev-fig">
          {x.imagen ? <Miniatura blob={x.imagen.blob} alt={x.descripcion || x.titulo || "Figura detectada"} /> : <span className="ud-rev-mini ud-rev-mini--vacia">Sin imagen</span>}
          <div className="ud-rev-campos">
            <label className="es-fl">
              Título de la figura
              <input type="text" className="es-inp" value={sinMarcas(x.titulo)} maxLength={LIMITES.titulo} disabled={ocupado} onChange={(e) => a.pie(fila.k, "titulo", e.target.value)} />
            </label>
            <label className="es-fl">
              Nota o fuente
              <input type="text" className="es-inp" value={sinMarcas(x.nota)} maxLength={LIMITES.nota} disabled={ocupado} onChange={(e) => a.pie(fila.k, "nota", e.target.value)} />
            </label>
            <span className="es-note">
              {x.imagen ? `${x.imagen.ancho}×${x.imagen.alto} px · ${x.origen === "pdf-dibujo" ? "gráfica o dibujo recortado del PDF" : x.origen === "pdf-imagen" ? "imagen del PDF" : "imagen del Word"}` : "No se pudo extraer: quedará como imagen pendiente."}
            </span>
          </div>
        </div>
      ) : x.t === "tabla" ? (
        <div className="ud-rev-fig ud-rev-fig--tabla">
          <div className="ud-rev-campos">
            <label className="es-fl">
              Título de la tabla
              <input type="text" className="es-inp" value={sinMarcas(x.titulo)} maxLength={LIMITES.titulo} disabled={ocupado} onChange={(e) => a.pie(fila.k, "titulo", e.target.value)} />
            </label>
            <label className="es-fl">
              Nota o fuente
              <input type="text" className="es-inp" value={sinMarcas(x.nota)} maxLength={LIMITES.nota} disabled={ocupado} onChange={(e) => a.pie(fila.k, "nota", e.target.value)} />
            </label>
          </div>
          <VistaTabla filas={x.filas} />
        </div>
      ) : x.t === "referencias" ? (
        <ol className="ud-rev-refs">
          {x.items.slice(0, 4).map((t, i) => <li key={i}>{sinMarcas(t).slice(0, 200)}</li>)}
          {x.items.length > 4 ? <li className="es-note">… y {x.items.length - 4} más</li> : null}
        </ol>
      ) : (
        <p className="ud-rev-txt" data-t={x.t}>{resumenDeElemento(x)}</p>
      )}
    </div>
  );
});

const estimar = (x: Elemento): number => (x.t === "imagen" ? 150 : x.t === "tabla" ? 230 : x.t === "referencias" ? 150 : 74);

/** Lo que propone Pilo para mejorar la estructura; cada propuesta se aplica o no. */
interface Propuesta {
  id: string;
  texto: string;
  on: boolean;
  aplicar(f: Fila[]): Fila[];
}

/* ---------- el diálogo ------------------------------------------------------------------------------------ */

export function ImportarInforme(p: Props) {
  const navigate = useNavigate();
  const crear = useCrearItem();
  const crearCarpeta = useCrearCarpeta();
  const subirArchivo = useSubirArchivo();
  const carpetas = useCarpetas();
  const archivos = useArchivos();
  const entrada = useRef<HTMLInputElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const llave = useRef(0);
  const filasRef = useRef<Fila[]>([]);

  const [fase, setFase] = useState<Fase>("elegir");
  const [usarPilo, setUsarPilo] = useState(true);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [editando, setEditando] = useState<number | null>(null);
  const [notas, setNotas] = useState<string[]>([]);
  const [nombre, setNombre] = useState("");
  const [tituloPortada, setTituloPortada] = useState("");
  const [carpeta, setCarpeta] = useState<string | null>(p.modo === "nuevo" ? p.carpetaInicial : p.carpeta);
  const [pensando, setPensando] = useState(false);
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null);

  const opciones = useMemo(() => {
    const vivas = (carpetas.data ?? []).filter((c) => !c.borrado_en);
    return vivas
      .map((c) => ({ id: c.id, texto: rutaDeCarpeta(vivas, c.id).map((n) => n.nombre).join(" / ") }))
      .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  }, [carpetas.data]);

  filasRef.current = filas;
  const seleccion = useMemo(() => filas.flatMap((f) => (f.on ? [f.x] : [])), [filas]);
  const nTablas = seleccion.filter((x) => x.t === "tabla").length;
  const nTitulos = seleccion.filter((x) => x.t === "titulo").length;
  const nFiguras = seleccion.filter((x) => x.t === "imagen").length;
  const nSubibles = seleccion.filter((x) => x.t === "imagen" && x.imagen).length;

  /** Lo que impide crear, en español; vacío si se puede. Se revisa con ids de mentira. */
  const problema = useMemo(() => {
    if (!seleccion.length) return "Deje al menos un bloque marcado.";
    if (nTablas > LIMITE_TABLAS) return `Son ${nTablas} tablas; se importan hasta ${LIMITE_TABLAS} de una vez. Quite algunas.`;
    if (nSubibles > LIMITE_FIGURAS) return `Son ${nSubibles} figuras con imagen; se importan hasta ${LIMITE_FIGURAS} de una vez. Quite algunas.`;
    const falsas = new Map(seleccion.flatMap((x, i) => (x.t === "tabla" ? [[i, "tablafalsa00001"] as [number, string]] : [])));
    const { bloques } = aBloques(seleccion, { tablas: falsas, imagenes: new Map() });
    const doc = p.modo === "agregar" ? { ...p.plantillaDoc, bloques: [...p.plantillaDoc.bloques, ...bloques] } : { ...documentoVacio("blanco"), bloques };
    if (bloques.length + (p.modo === "agregar" ? p.plantillaDoc.bloques.length : 0) > LIMITES.bloques) return `El informe pasaría de ${LIMITES.bloques} bloques. Quite algunos.`;
    return validarDocumento(doc);
  }, [seleccion, nTablas, nSubibles, p]);

  const nombreLimpio = limpiarNombre(nombre, 160);
  const existentes = useMemo(() => (archivos.data ?? []).filter((a) => !a.borrado_en && a.carpeta_id === carpeta).map((a) => a.nombre), [archivos.data, carpeta]);
  const nombreRepetido = p.modo === "nuevo" && Boolean(nombreLimpio) && existentes.some((e) => e.trim().toLowerCase() === nombreLimpio.toLowerCase());
  const ocupado = fase === "creando";

  /* ---- leer ---- */
  async function leer(f: File) {
    setError("");
    if (!tipoDeArchivo(f)) {
      setError("Use un Word (.docx) o un PDF. Un .doc antiguo se guarda primero como .docx desde Word.");
      return;
    }
    setArchivo(f);
    setFase("leyendo");
    setEstado("Leyendo el archivo…");
    try {
      const l = await leerArchivo(f, setEstado);
      let el = l.elementos;
      const avisos = [...l.avisos];
      const base = baseDeNombre(f.name);
      let titulo = l.portada?.titulo?.trim() || base;

      if (!el.length) throw new Error("No se encontró texto que importar en ese archivo.");

      if (usarPilo) {
        // Cada ayuda de Pilo es opcional: si falla, queda la lectura directa y se avisa.
        if (l.tipo === "pdf" && hayTitulosDudosos(el)) {
          const idx = indicesDeTitulos(el);
          if (idx.length <= 150) {
            setEstado("Pilo está revisando el nivel de los títulos…");
            try {
              const n = await pedirNiveles(idx.map((i) => ({ i, texto: (el[i] as Extract<Elemento, { t: "titulo" }>).texto, nivel: (el[i] as Extract<Elemento, { t: "titulo" }>).nivel })), f.name);
              el = aplicarNiveles(el, n);
              avisos.push("Pilo revisó el nivel de los títulos.");
            } catch (e) {
              avisos.push(`Pilo no pudo revisar los títulos (${e instanceof Error ? e.message : "error"}). Quedaron como los dedujo la lectura directa.`);
            }
          } else avisos.push("Hay más de 150 títulos: Pilo no los revisó; ajuste los niveles a mano.");
        }
        if (l.tipo === "pdf") {
          const cand = candidatosALimpiar(el);
          if (cand.length) {
            setEstado("Pilo está arreglando el texto partido…");
            try {
              const r = await pedirLimpieza(cand.map((i) => ({ i, texto: sinEscape((el[i] as Extract<Elemento, { t: "parrafo" }>).texto) })), f.name);
              el = aplicarLimpieza(el, r.textos);
              avisos.push(`Pilo arregló ${r.textos.length} ${r.textos.length === 1 ? "párrafo" : "párrafos"} con palabras partidas${r.descartados ? ` (descartó ${r.descartados} cambios que alteraban el texto)` : ""}.`);
            } catch (e) {
              avisos.push(`Pilo no pudo arreglar el texto partido (${e instanceof Error ? e.message : "error"}).`);
            }
          }
        }
        const tablas = indicesDeTablas(el);
        setEstado("Pilo está proponiendo nombres…");
        try {
          const r = await pedirNombres(tablas.length ? tablas.map((i) => ({ i, texto: muestraDeTabla((el[i] as Extract<Elemento, { t: "tabla" }>).filas) })) : [{ i: 0, texto: el.slice(0, 6).map(resumenDeElemento).join("\n") }], f.name);
          if (tablas.length) el = aplicarNombres(el, r.tablas);
          if (r.titulo && !l.portada?.titulo) titulo = r.titulo;
          if (r.tablas.length || r.titulo) avisos.push("Pilo propuso nombres para el informe y sus tablas sin título: revíselos.");
        } catch (e) {
          avisos.push(`Pilo no pudo proponer nombres (${e instanceof Error ? e.message : "error"}).`);
        }
      }

      llave.current = el.length;
      setLectura(l);
      setFilas(el.map((x, k) => ({ k, x, on: true })));
      setEditando(null);
      setPropuestas(null);
      setNotas(avisos);
      setNombre((n) => n || limpiarNombre(titulo || base, 160));
      setTituloPortada(titulo || base);
      setFase("revisar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
      setFase("elegir");
    }
  }

  /* ---- editar la revisión ---- */
  const cambiar = useCallback((k: number, f: (x: Elemento) => Elemento) => setFilas((fs) => fs.map((r) => (r.k === k ? { ...r, x: f(r.x) } : r))), []);
  const acciones = useMemo<Acciones>(
    () => ({
      alternar: (k) => setFilas((fs) => fs.map((r) => (r.k === k ? { ...r, on: !r.on } : r))),
      tipo: (k, t) => cambiar(k, (x) => cambiarTipo(x, t)),
      subir: (k) => setFilas((fs) => mover(fs, fs.findIndex((r) => r.k === k), -1)),
      bajar: (k) => setFilas((fs) => mover(fs, fs.findIndex((r) => r.k === k), 1)),
      unirAnterior: (k) =>
        setFilas((fs) => {
          const i = fs.findIndex((r) => r.k === k);
          const u = i > 0 ? unir(fs[i - 1].x, fs[i].x) : null;
          return u ? [...fs.slice(0, i - 1), { ...fs[i - 1], x: u, on: fs[i - 1].on || fs[i].on }, ...fs.slice(i + 1)] : fs;
        }),
      guardarTexto: (k, borrador) => {
        cambiar(k, (x) => {
          if (x.t === "titulo") return { ...x, texto: borrador.replace(/\s+/g, " ").trim().slice(0, LIMITES.titulo), dudoso: false };
          if (x.t === "lista") return { ...x, items: borrador.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, LIMITES.items) };
          if (x.t === "parrafo" || x.t === "destacado" || x.t === "nota") return { ...x, texto: borrador.slice(0, LIMITES.texto) };
          return x;
        });
        setEditando(null);
      },
      partirTexto: (k, borrador, pos) => {
        const fs = filasRef.current;
        const i = fs.findIndex((r) => r.k === k);
        const x = fs[i]?.x;
        if (!x || (x.t !== "parrafo" && x.t !== "destacado" && x.t !== "nota")) return;
        const dos = partir({ ...x, texto: borrador }, pos);
        if (!dos) return;
        const nueva = llave.current++;
        setEditando(null);
        setFilas([...fs.slice(0, i), { ...fs[i], x: dos[0] }, { k: nueva, x: dos[1], on: fs[i].on }, ...fs.slice(i + 1)]);
      },
      tablaATexto: (k) => {
        const fs = filasRef.current;
        const i = fs.findIndex((r) => r.k === k);
        const x = fs[i]?.x;
        if (!x || x.t !== "tabla") return;
        const textos = tablaATexto(x);
        setFilas([...fs.slice(0, i), ...textos.map((t) => ({ k: llave.current++, x: t, on: fs[i].on })), ...fs.slice(i + 1)]);
      },
      pie: (k, campo, valor) =>
        cambiar(k, (x) => {
          if (x.t !== "imagen" && x.t !== "tabla") return x;
          const v = escapar(valor.replace(/\s+/g, " ")).slice(0, campo === "titulo" ? LIMITES.titulo : LIMITES.nota);
          return { ...x, [campo]: v };
        }),
      editar: setEditando,
    }),
    [cambiar],
  );

  const virtual = useVirtualizer({ count: filas.length, getScrollElement: () => contenedor.current, estimateSize: (i) => estimar(filas[i].x), overscan: 6, getItemKey: (i) => filas[i].k });

  /* ---- Pilo propone ---- */
  async function reordenarConPilo() {
    setPensando(true);
    setError("");
    const nuevas: Propuesta[] = [];
    const nombreArchivo = archivo?.name ?? "";
    try {
      const titulos = filas.filter((f) => f.x.t === "titulo").slice(0, 150);
      if (titulos.length >= 2) {
        try {
          const n = await pedirNiveles(titulos.map((f) => ({ i: f.k, texto: (f.x as Extract<Elemento, { t: "titulo" }>).texto, nivel: (f.x as Extract<Elemento, { t: "titulo" }>).nivel })), nombreArchivo);
          const cambios = n.filter((c) => {
            const f = titulos.find((t) => t.k === c.i)?.x as Extract<Elemento, { t: "titulo" }> | undefined;
            return f && c.nivel !== f.nivel;
          });
          for (const c of cambios) {
            const f = titulos.find((t) => t.k === c.i)!.x as Extract<Elemento, { t: "titulo" }>;
            nuevas.push({
              id: `n${c.i}`,
              on: true,
              texto: c.nivel === 0 ? `«${f.texto.slice(0, 80)}» no es un título: pasa a párrafo.` : `«${f.texto.slice(0, 80)}»: de título ${f.nivel} a título ${c.nivel}.`,
              aplicar: (fs) => fs.map((r) => (r.k === c.i && r.x.t === "titulo" ? { ...r, x: aplicarNiveles([r.x], [{ i: 0, nivel: c.nivel }])[0] } : r)),
            });
          }
        } catch (e) {
          setError(`Pilo no pudo revisar los niveles de los títulos (${e instanceof Error ? e.message : "error"}).`);
        }
      }
      const cand = filas.filter((f) => f.x.t === "parrafo" && candidatosALimpiar([f.x]).length).slice(0, 40);
      if (cand.length) {
        try {
          const r = await pedirLimpieza(cand.map((f) => ({ i: f.k, texto: sinEscape((f.x as Extract<Elemento, { t: "parrafo" }>).texto) })), nombreArchivo);
          for (const t of r.textos) {
            const antes = cand.find((c) => c.k === t.i);
            if (!antes) continue;
            nuevas.push({
              id: `l${t.i}`,
              on: true,
              texto: `Arreglar palabras partidas en «${sinMarcas((antes.x as Extract<Elemento, { t: "parrafo" }>).texto).slice(0, 70)}…»`,
              aplicar: (fs) => fs.map((rr) => (rr.k === t.i && rr.x.t === "parrafo" ? { ...rr, x: aplicarLimpieza([rr.x], [{ i: 0, texto: t.texto }])[0] } : rr)),
            });
          }
        } catch (e) {
          setError((m) => m || `Pilo no pudo arreglar el texto partido (${e instanceof Error ? e.message : "error"}).`);
        }
      }
      // Pies que quedaron sueltos: un párrafo «Tabla N. …» o «Gráfica N. …» que no se pegó a nada.
      const sueltos = filas.filter((f) => f.x.t === "parrafo" && /^(tabla|cuadro|gr[aá]fica|gr[aá]fico|figura|ilustraci[oó]n|mapa)\s+\d{1,3}\b/i.test(sinMarcas(f.x.texto)));
      for (const f of sueltos.slice(0, 10)) {
        const i = filas.findIndex((r) => r.k === f.k);
        const vecino = [filas[i + 1], filas[i - 1]].find((r) => r && (r.x.t === "tabla" || r.x.t === "imagen") && !r.x.titulo);
        if (!vecino) continue;
        nuevas.push({
          id: `p${f.k}`,
          on: true,
          texto: `Usar «${sinMarcas((f.x as Extract<Elemento, { t: "parrafo" }>).texto).slice(0, 80)}» como título de la ${vecino.x.t === "tabla" ? "tabla" : "figura"} contigua.`,
          aplicar: (fs) => {
            const origen = fs.find((r) => r.k === f.k);
            if (!origen || origen.x.t !== "parrafo") return fs;
            const resto = escapar(sinMarcas(origen.x.texto).replace(/^[^\d]*\d{1,3}\s*[.:\-–—]?\s*/, "").replace(/[.\s]+$/, "")).slice(0, LIMITES.titulo);
            return fs.filter((r) => r.k !== f.k).map((r) => (r.k === vecino.k && (r.x.t === "tabla" || r.x.t === "imagen") ? { ...r, x: { ...r.x, titulo: resto } } : r));
          },
        });
      }
      setPropuestas(nuevas);
      if (!nuevas.length) setNotas((n) => [...n, "Pilo no encontró nada que mejorar en la estructura."]);
    } finally {
      setPensando(false);
    }
  }

  function aplicarPropuestas() {
    if (!propuestas) return;
    setFilas((fs) => propuestas.filter((q) => q.on).reduce((acc, q) => q.aplicar(acc), fs));
    setPropuestas(null);
  }

  /* ---- crear ---- */
  async function crearTodo() {
    if (problema || (p.modo === "nuevo" && (!nombreLimpio || nombreRepetido))) return;
    setFase("creando");
    setError("");
    try {
      const idsTabla = new Map<number, string>();
      const usados = [...existentes];
      const base = p.modo === "nuevo" ? nombreLimpio : p.nombreInforme;
      let k = 0;
      for (const [pos, x] of seleccion.entries()) {
        if (x.t !== "tabla") continue;
        const t = tablaDeElemento(x, pos, idFila);
        if (!t) continue;
        k++;
        setEstado(`Creando las tablas de UDrive… ${k} de ${nTablas}`);
        const nombreTabla = nombreUnico(limpiarNombre(`${base} · ${sinMarcas(x.titulo) || `Tabla ${k}`}`, 160), usados);
        usados.push(nombreTabla);
        idsTabla.set(pos, await crear.mutateAsync({ tipo: "tabla", nombre: nombreTabla, carpeta, contenido: t.contenido }));
      }

      // Las figuras: carpeta propia y subida con reintentos.
      const idsImagen = new Map<number, string>();
      const avisosFiguras: string[] = [];
      const porSubir = seleccion.flatMap((x, pos) => (x.t === "imagen" && x.imagen ? [{ pos, imagen: x.imagen, titulo: x.titulo }] : []));
      if (porSubir.length) {
        setEstado("Preparando la carpeta de imágenes…");
        const persona = (await supabase.auth.getSession()).data.session?.user.id;
        if (!persona) throw new Error("Su sesión venció. Inicie sesión de nuevo.");
        const hermanas = (carpetas.data ?? []).filter((c) => !c.borrado_en && c.padre_id === carpeta).map((c) => c.nombre);
        let carpetaImagenes: string | null = null;
        try {
          carpetaImagenes = await crearCarpeta.mutateAsync({ nombre: nombreUnico(limpiarNombre(`Imágenes de ${base}`, 160), hermanas), padre: carpeta });
        } catch (e) {
          avisosFiguras.push(`No se pudo crear la carpeta de imágenes (${e instanceof Error ? e.message : "error"}): las figuras quedaron pendientes.`);
        }
        if (carpetaImagenes) {
          const destino = carpetaImagenes;
          const r = await subirFiguras({
            figuras: porSubir,
            subir: (archivoImg, nombreImg) => subirArchivo.mutateAsync({ archivo: archivoImg, persona, carpeta: destino, nombre: nombreImg, onProgreso: () => undefined }),
            alAvanzar: (hechas, total, falladas) => setEstado(`Subiendo las figuras… ${hechas} de ${total}${falladas ? ` · ${falladas} con error` : ""}`),
          });
          r.ids.forEach((id, pos) => idsImagen.set(pos, id));
          if (r.falladas.length) {
            avisosFiguras.push(
              r.rendida
                ? `Storage no respondió: ${r.falladas.length} ${r.falladas.length === 1 ? "figura quedó pendiente" : "figuras quedaron pendientes"}. Cuando el servicio se normalice, súbalas a la carpeta «Imágenes de ${base}» y elíjalas en cada bloque.`
                : `${r.falladas.length} ${r.falladas.length === 1 ? "figura no se pudo subir y quedó pendiente" : "figuras no se pudieron subir y quedaron pendientes"}.`,
            );
          }
        }
      }

      const { bloques, fuentes, avisos } = aBloques(seleccion, { tablas: idsTabla, imagenes: idsImagen });
      const aviso = [...avisos, ...avisosFiguras].join(" ");
      if (p.modo === "agregar") {
        p.onAgregar(bloques, fuentes);
        p.decir(`Se agregaron ${bloques.length} bloques al final del informe.${aviso ? ` ${aviso}` : ""}`);
        p.onCerrar();
        return;
      }
      setEstado("Creando el informe…");
      const vacio = documentoVacio("blanco");
      const bruto: Documento = {
        ...vacio,
        portada: { ...vacio.portada, titulo: tituloPortada.trim().slice(0, LIMITES.portada) || nombreLimpio, subtitulo: lectura?.portada?.subtitulo?.slice(0, LIMITES.portada) ?? "" },
        indices: { contenido: nTitulos >= 3, ilustraciones: idsImagen.size > 0, tablas: idsTabla.size > 0, graficas: false },
        fuentes,
        bloques,
      };
      const { documento } = normalizarDocumento(bruto);
      const id = await crear.mutateAsync({ tipo: "documento", nombre: nombreLimpio, carpeta, contenido: documento });
      const partes = [`${bloques.length} bloques`, ...(idsTabla.size ? [`${idsTabla.size} ${idsTabla.size === 1 ? "tabla" : "tablas"} de UDrive`] : []), ...(idsImagen.size ? [`${idsImagen.size} ${idsImagen.size === 1 ? "imagen" : "imágenes"}`] : [])];
      p.decir(`Informe creado con ${partes.join(", ")}.${aviso ? ` ${aviso}` : ""}`);
      navigate(`/admin/udrive/documento/${id}`);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "No se pudo crear."} Si ya se crearon tablas o imágenes, las verá en la carpeta.`);
      setFase("revisar");
    }
  }

  const revisando = fase === "revisar" || fase === "creando";
  const marcadas = filas.filter((f) => f.on).length;

  return (
    <Ventana
      titulo={p.modo === "nuevo" ? "Informe desde Word o PDF" : "Importar al final del informe"}
      onCerrar={ocupado ? () => undefined : p.onCerrar}
      pie={
        revisando ? (
          <>
            <span className="es-note" role="status">
              {ocupado ? estado : `${marcadas} de ${filas.length} bloques marcados${nTablas ? ` · ${nTablas} ${nTablas === 1 ? "tabla" : "tablas"}` : ""}${nFiguras ? ` · ${nFiguras} ${nFiguras === 1 ? "figura" : "figuras"}` : ""}`}
            </span>
            <button type="button" className="es-btn" disabled={ocupado} onClick={() => (setFase("elegir"), setLectura(null), setFilas([]), setPropuestas(null))}>
              Elegir otro archivo
            </button>
            <button type="button" className="es-btn es-btn--pri" disabled={ocupado || Boolean(problema) || (p.modo === "nuevo" && (!nombreLimpio || nombreRepetido))} onClick={() => void crearTodo()}>
              {p.modo === "nuevo" ? "Crear informe" : "Agregar al informe"}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="es-dbody">
        {fase === "elegir" || fase === "leyendo" ? (
          <>
            <p>Elija un Word (.docx) o un PDF. Se lee en su navegador: el archivo no se sube a ninguna parte. Después revisa lo que se detectó (texto, tablas, gráficas e imágenes) antes de crear nada.</p>
            <label className="es-ck">
              <input type="checkbox" checked={usarPilo} disabled={fase === "leyendo"} onChange={(e) => setUsarPilo(e.target.checked)} /> Que Pilo ordene lo dudoso
            </label>
            <p className="es-note">Pilo revisa el nivel de los títulos de un PDF, arregla palabras partidas y propone nombres para las tablas. Solo ordena lo que ya está en el archivo: no agrega palabras.</p>
            <input
              ref={entrada}
              type="file"
              hidden
              accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void leer(f);
              }}
            />
            <div>
              <button type="button" className="es-btn es-btn--pri" disabled={fase === "leyendo"} onClick={() => entrada.current?.click()}>
                {fase === "leyendo" ? "Leyendo…" : "Elegir archivo"}
              </button>
            </div>
            {fase === "leyendo" ? <p className="es-note" role="status">{estado}{archivo ? ` (${archivo.name})` : ""}</p> : null}
          </>
        ) : (
          <>
            {p.modo === "nuevo" ? (
              <>
                <label className="es-fl">
                  Nombre del informe
                  <input type="text" className="es-inp" value={nombre} maxLength={160} aria-invalid={nombreRepetido} onChange={(e) => setNombre(e.target.value)} />
                </label>
                {nombreRepetido ? <p className="ud-aviso" data-t="error" role="alert">Ya hay algo con ese nombre en esa carpeta.</p> : null}
                <label className="es-fl">
                  Título de la portada
                  <input type="text" className="es-inp" value={tituloPortada} maxLength={LIMITES.portada} onChange={(e) => setTituloPortada(e.target.value)} />
                </label>
                <label className="es-fl">
                  Carpeta (también para sus tablas y su carpeta de imágenes)
                  <select className="es-inp" value={carpeta ?? ""} onChange={(e) => setCarpeta(e.target.value || null)}>
                    <option value="">Mi espacio</option>
                    {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
                  </select>
                </label>
              </>
            ) : null}
            <div className="ud-rev-resumen" role="status">
              <b>{lectura?.tipo === "pdf" ? `PDF de ${lectura.paginas} ${lectura.paginas === 1 ? "página" : "páginas"}` : "Word"}:</b> {resumenDeConteo(filas) || "nada marcado"}
              {lectura?.descartes.length ? <> · <span>Se dejó fuera: {lectura.descartes.join(", ")}.</span></> : null}
            </div>
            {notas.map((n) => <p key={n} className="es-note">{n}</p>)}
            {problema ? <p className="ud-aviso" data-t="aviso" role="alert">{problema}</p> : null}
            {error ? <p className="ud-aviso" data-t="error" role="alert">{error}</p> : null}
            {propuestas ? (
              <div className="ud-rev-prop" role="region" aria-label="Propuestas de Pilo">
                <b>Pilo propone {propuestas.length} {propuestas.length === 1 ? "cambio" : "cambios"} (no cambia letras ni números)</b>
                {propuestas.length ? (
                  <ul>
                    {propuestas.map((q) => (
                      <li key={q.id}>
                        <label className="es-ck">
                          <input type="checkbox" checked={q.on} onChange={() => setPropuestas((ps) => ps?.map((r) => (r.id === q.id ? { ...r, on: !r.on } : r)) ?? null)} /> {q.texto}
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="ud-rev-acc">
                  <button type="button" className="es-btn es-btn--sm es-btn--pri" disabled={!propuestas.some((q) => q.on)} onClick={aplicarPropuestas}>Aplicar lo marcado</button>
                  <button type="button" className="es-btn es-btn--sm" onClick={() => setPropuestas(null)}>Descartar</button>
                </div>
              </div>
            ) : null}
            <div className="ud-imp-barra">
              <b>Revisar antes de crear</b>
              <span className="es-grow" />
              <button type="button" className="es-btn es-btn--sm" disabled={ocupado || pensando} title="Pilo revisa los niveles de los títulos, el texto partido y los pies sueltos, y propone cambios" onClick={() => void reordenarConPilo()}>
                {pensando ? "Pilo está revisando…" : "Reordenar con Pilo"}
              </button>
              <button type="button" className="es-btn es-btn--sm" disabled={ocupado} onClick={() => setFilas((fs) => fs.map((r) => ({ ...r, on: true })))}>Marcar todo</button>
              <button type="button" className="es-btn es-btn--sm" disabled={ocupado} onClick={() => setFilas((fs) => fs.map((r) => ({ ...r, on: false })))}>Quitar todo</button>
            </div>
            <div ref={contenedor} className="ud-rev" aria-label="Bloques detectados">
              <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
                {virtual.getVirtualItems().map((it) => {
                  const f = filas[it.index];
                  return (
                    <div key={f.k} data-index={it.index} ref={virtual.measureElement} className="ud-rev-celda" style={{ transform: `translateY(${it.start}px)` }}>
                      <FilaRevision fila={f} previo={filas[it.index - 1]?.x} primera={it.index === 0} ultima={it.index === filas.length - 1} editando={editando === f.k} ocupado={ocupado} a={acciones} />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {fase === "elegir" && error ? <p className="ud-aviso" data-t="error" role="alert">{error}</p> : null}
      </div>
    </Ventana>
  );
}

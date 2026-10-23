/* =============================================================================
   UDrive · «Importar Word o PDF» (fase 3).

   Elegir el archivo → leerlo en el navegador (nada se sube) → revisar los
   bloques detectados y quitar los que no sirvan → crear. Pilo, si la persona
   lo deja activo, ordena solo lo ambiguo: el nivel de los títulos de un PDF,
   las palabras partidas por saltos de línea y el nombre de las tablas. Si Pilo
   no responde, se sigue con la lectura directa.

   Dos modos: «nuevo» crea un informe en una carpeta y lo abre; «agregar» deja
   los bloques al final del informe abierto. Las tablas se crean como tablas
   de UDrive en la misma carpeta, y el informe las usa por su id.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ventana } from "../../../../components/espacio/Ventana";
import { useArchivos, useCarpetas, useCrearItem } from "../../datos";
import { pedirLimpieza, pedirNiveles, pedirNombres } from "../../datosPilo";
import { rutaDeCarpeta } from "../../lib/arbol";
import { LIMITES, documentoVacio, normalizarDocumento, validarDocumento } from "../../lib/documento";
import type { Bloque, Documento } from "../../lib/documento";
import {
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
  tablaDeElemento,
  tipoDeArchivo,
} from "../../lib/importar";
import type { Elemento, Lectura } from "../../lib/importar";
import { limpiarNombre, nombreUnico } from "../../lib/nombres";

type Props = { decir(m: string): void; onCerrar(): void } & (
  | { modo: "nuevo"; carpetaInicial: string | null }
  | { modo: "agregar"; carpeta: string | null; nombreInforme: string; plantillaDoc: Documento; onAgregar(bloques: Bloque[]): void }
);

type Fase = "elegir" | "leyendo" | "revisar" | "creando";

const sinEscape = (t: string) => t.replace(/\\(.)/g, "$1");
const idFila = () => `f${Math.random().toString(36).slice(2, 10)}`;
const baseDeNombre = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

export function ImportarInforme(p: Props) {
  const navigate = useNavigate();
  const crear = useCrearItem();
  const carpetas = useCarpetas();
  const archivos = useArchivos();
  const entrada = useRef<HTMLInputElement>(null);

  const [fase, setFase] = useState<Fase>("elegir");
  const [usarPilo, setUsarPilo] = useState(true);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [notas, setNotas] = useState<string[]>([]);
  const [nombre, setNombre] = useState("");
  const [tituloPortada, setTituloPortada] = useState("");
  const [carpeta, setCarpeta] = useState<string | null>(p.modo === "nuevo" ? p.carpetaInicial : p.carpeta);

  const opciones = useMemo(() => {
    const vivas = (carpetas.data ?? []).filter((c) => !c.borrado_en);
    return vivas
      .map((c) => ({ id: c.id, texto: rutaDeCarpeta(vivas, c.id).map((n) => n.nombre).join(" / ") }))
      .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  }, [carpetas.data]);

  const seleccion = useMemo(() => elementos.flatMap((x, i) => (marcados.has(i) ? [x] : [])), [elementos, marcados]);
  const nTablas = seleccion.filter((x) => x.t === "tabla").length;
  const nTitulos = seleccion.filter((x) => x.t === "titulo").length;

  /** Lo que impide crear, en español; vacío si se puede. Se revisa con ids de tabla de mentira. */
  const problema = useMemo(() => {
    if (!seleccion.length) return "Deje al menos un bloque marcado.";
    if (nTablas > LIMITE_TABLAS) return `Son ${nTablas} tablas; se importan hasta ${LIMITE_TABLAS} de una vez. Quite algunas.`;
    const falsas = new Map(seleccion.flatMap((x, i) => (x.t === "tabla" ? [[i, "tablafalsa00001"] as [number, string]] : [])));
    const { bloques } = aBloques(seleccion, falsas);
    const doc = p.modo === "agregar" ? { ...p.plantillaDoc, bloques: [...p.plantillaDoc.bloques, ...bloques] } : { ...documentoVacio("blanco"), bloques };
    if (bloques.length + (p.modo === "agregar" ? p.plantillaDoc.bloques.length : 0) > LIMITES.bloques) return `El informe pasaría de ${LIMITES.bloques} bloques. Quite algunos.`;
    return validarDocumento(doc);
  }, [seleccion, nTablas, p]);

  const nombreLimpio = limpiarNombre(nombre, 160);
  const existentes = useMemo(() => (archivos.data ?? []).filter((a) => !a.borrado_en && a.carpeta_id === carpeta).map((a) => a.nombre), [archivos.data, carpeta]);
  const nombreRepetido = p.modo === "nuevo" && Boolean(nombreLimpio) && existentes.some((e) => e.trim().toLowerCase() === nombreLimpio.toLowerCase());

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
      const l = await leerArchivo(f);
      let el = l.elementos;
      const avisos = [...l.avisos];
      const base = baseDeNombre(f.name);
      let titulo = base;

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
        if (tablas.length || el.length) {
          setEstado("Pilo está proponiendo nombres…");
          try {
            const r = await pedirNombres(tablas.length ? tablas.map((i) => ({ i, texto: muestraDeTabla((el[i] as Extract<Elemento, { t: "tabla" }>).filas) })) : [{ i: 0, texto: el.slice(0, 6).map(resumenDeElemento).join("\n") }], f.name);
            if (tablas.length) el = aplicarNombres(el, r.tablas);
            if (r.titulo) titulo = r.titulo;
            if (r.tablas.length || r.titulo) avisos.push("Pilo propuso nombres para el informe y sus tablas: revíselos.");
          } catch (e) {
            avisos.push(`Pilo no pudo proponer nombres (${e instanceof Error ? e.message : "error"}).`);
          }
        }
      }

      setLectura(l);
      setElementos(el);
      setMarcados(new Set(el.map((_, i) => i)));
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
  const poner = (i: number, x: Elemento) => setElementos((e) => e.map((y, k) => (k === i ? x : y)));
  const alternar = (i: number) => setMarcados((m) => (m.has(i) ? new Set([...m].filter((k) => k !== i)) : new Set([...m, i])));
  const cambiarNivel = (i: number, v: string) => {
    const x = elementos[i];
    if (x?.t !== "titulo") return;
    poner(i, v === "p" ? { t: "parrafo", texto: x.texto.replace(/[\\*[{]/g, (c) => `\\${c}`) } : { ...x, nivel: Number(v) as 1 | 2 | 3, dudoso: false });
  };

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
        const nombreTabla = nombreUnico(limpiarNombre(`${base} · ${x.titulo || `Tabla ${k}`}`, 160), usados);
        usados.push(nombreTabla);
        idsTabla.set(pos, await crear.mutateAsync({ tipo: "tabla", nombre: nombreTabla, carpeta, contenido: t.contenido }));
      }
      const { bloques, avisos } = aBloques(seleccion, idsTabla);
      if (p.modo === "agregar") {
        p.onAgregar(bloques);
        p.decir(`Se agregaron ${bloques.length} bloques al final del informe.${avisos.length ? ` ${avisos.join(" ")}` : ""}`);
        p.onCerrar();
        return;
      }
      setEstado("Creando el informe…");
      const vacio = documentoVacio("blanco");
      const bruto: Documento = {
        ...vacio,
        portada: { ...vacio.portada, titulo: tituloPortada.trim().slice(0, LIMITES.portada) || nombreLimpio },
        indices: { contenido: nTitulos >= 3, ilustraciones: false, tablas: idsTabla.size > 0, graficas: false },
        bloques,
      };
      const { documento } = normalizarDocumento(bruto);
      const id = await crear.mutateAsync({ tipo: "documento", nombre: nombreLimpio, carpeta, contenido: documento });
      p.decir(`Informe creado con ${bloques.length} bloques${idsTabla.size ? ` y ${idsTabla.size} ${idsTabla.size === 1 ? "tabla" : "tablas"} de UDrive` : ""}.${avisos.length ? ` ${avisos.join(" ")}` : ""}`);
      navigate(`/admin/udrive/documento/${id}`);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "No se pudo crear."} Si ya se crearon tablas, las verá en la carpeta.`);
      setFase("revisar");
    }
  }

  const revisando = fase === "revisar" || fase === "creando";

  return (
    <Ventana
      titulo={p.modo === "nuevo" ? "Informe desde Word o PDF" : "Importar al final del informe"}
      onCerrar={fase === "creando" ? () => undefined : p.onCerrar}
      pie={
        revisando ? (
          <>
            <span className="es-note" role="status">
              {fase === "creando" ? estado : `${seleccion.length} de ${elementos.length} bloques marcados${nTablas ? ` · ${nTablas} ${nTablas === 1 ? "tabla" : "tablas"}` : ""}`}
            </span>
            <button type="button" className="es-btn" disabled={fase === "creando"} onClick={() => (setFase("elegir"), setLectura(null), setElementos([]))}>
              Elegir otro archivo
            </button>
            <button type="button" className="es-btn es-btn--pri" disabled={fase === "creando" || Boolean(problema) || (p.modo === "nuevo" && (!nombreLimpio || nombreRepetido))} onClick={() => void crearTodo()}>
              {p.modo === "nuevo" ? "Crear informe" : "Agregar al informe"}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="es-dbody">
        {fase === "elegir" || fase === "leyendo" ? (
          <>
            <p>Elija un Word (.docx) o un PDF. Se lee en su navegador: el archivo no se sube a ninguna parte. Después revisa lo que se detectó antes de crear nada.</p>
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
                  Carpeta (también para sus tablas)
                  <select className="es-inp" value={carpeta ?? ""} onChange={(e) => setCarpeta(e.target.value || null)}>
                    <option value="">Mi espacio</option>
                    {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
                  </select>
                </label>
              </>
            ) : null}
            {notas.map((n) => <p key={n} className="es-note">{n}</p>)}
            {problema ? <p className="ud-aviso" data-t="aviso" role="alert">{problema}</p> : null}
            {error ? <p className="ud-aviso" data-t="error" role="alert">{error}</p> : null}
            <div className="ud-imp-barra">
              <b>{lectura?.tipo === "pdf" ? "PDF" : "Word"}: {elementos.length} bloques detectados</b>
              <span className="es-grow" />
              <button type="button" className="es-btn es-btn--sm" disabled={fase === "creando"} onClick={() => setMarcados(new Set(elementos.map((_, i) => i)))}>Marcar todo</button>
              <button type="button" className="es-btn es-btn--sm" disabled={fase === "creando"} onClick={() => setMarcados(new Set())}>Quitar todo</button>
            </div>
            <ul className="ud-imp-lista" aria-label="Bloques detectados">
              {elementos.map((x, i) => (
                <li key={i} data-off={!marcados.has(i)} data-t={x.t}>
                  <label className="ud-imp-ck">
                    <input type="checkbox" checked={marcados.has(i)} disabled={fase === "creando"} onChange={() => alternar(i)} aria-label={`Incluir: ${resumenDeElemento(x).slice(0, 60)}`} />
                  </label>
                  <span className="ud-imp-tipo">{etiquetaDeElemento(x)}</span>
                  {x.t === "titulo" ? (
                    <select className="es-inp ud-imp-nivel" value={String(x.nivel)} disabled={fase === "creando"} aria-label="Nivel del título" data-dudoso={x.dudoso} onChange={(e) => cambiarNivel(i, e.target.value)}>
                      <option value="1">1 · Capítulo</option>
                      <option value="2">2 · Sección</option>
                      <option value="3">3 · Apartado</option>
                      <option value="p">Párrafo</option>
                    </select>
                  ) : null}
                  <span className="ud-imp-txt">{resumenDeElemento(x)}</span>
                  {x.t === "titulo" && x.dudoso ? <span className="ud-imp-dudoso" title="El nivel se dedujo solo por el tamaño de letra">revisar nivel</span> : null}
                </li>
              ))}
            </ul>
          </>
        )}
        {fase === "elegir" && error ? <p className="ud-aviso" data-t="error" role="alert">{error}</p> : null}
      </div>
    </Ventana>
  );
}

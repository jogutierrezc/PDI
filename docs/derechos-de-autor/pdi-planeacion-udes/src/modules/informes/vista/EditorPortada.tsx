/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · editor de portada.

   Pocos controles y buenos valores por defecto: composición (cinco, iguales
   para todas las oficinas), textos con su límite, fondo, color de acento
   (tres de la paleta o uno libre con la prueba de contraste), alineación,
   tamaño del título, monograma y escudo. En la composición con foto, la
   oficina sube su imagen y la encuadra: arrastrarla, zoom y alinear el
   recorte arriba, al centro o abajo. A la derecha, la portada tal como saldrá.

   Teclado: el encuadre se enfoca con Tab; flechas mueven la imagen y «+» y «−»
   cambian el zoom. Los cambios se ven al instante; nada se guarda hasta
   «Guardar». El movimiento respeta prefers-reduced-motion (vista.css).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { MAX_PORTADA, useSubirImagenPortada, useUrlImagen } from "../datos";
import { Escalado } from "./Escalado";
import { PaginaPortada, estiloFoto } from "./Hoja";
import type { ContextoHoja } from "./Hoja";
import { CampoTexto, Segmentado } from "./controles";
import {
  ACENTOS_SUGERIDOS,
  COMPOSICIONES,
  LIMITES,
  PAPELES,
  evaluarAcento,
  monogramaPorDefecto,
  normalizarHex,
  normalizarMonograma,
} from "./perfil";
import type { AlineacionFoto, FotoPortada, PerfilOficina, PortadaDiseno } from "./perfil";

export interface Aviso {
  tono: "ok" | "error";
  texto: string;
}

const YDE: Record<AlineacionFoto, number> = { arriba: 0, centro: 50, abajo: 100 };
const FOTO_NUEVA = (ruta: string): FotoPortada => ({ ruta, x: 50, y: 50, zoom: 1 });

/* ---------- Encuadre de la imagen ---------- */

export function Encuadre({ url, foto, aspecto, onChange }: { url: string; foto: FotoPortada; aspecto: string; onChange: (f: FotoPortada) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const natural = useRef<{ w: number; h: number } | null>(null);
  const arrastre = useRef<{ x: number; y: number; p: FotoPortada } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  /** Cuánto se mueve la imagen por cada punto de x o y: (caja − imagen · zoom). Cero: no hay por dónde moverla. */
  const factor = (eje: "x" | "y", f: FotoPortada): number => {
    const c = caja.current;
    const n = natural.current;
    if (!c || !n) return 0;
    const bw = c.clientWidth;
    const bh = c.clientHeight;
    const s = Math.max(bw / n.w, bh / n.h);
    const imagen = eje === "x" ? n.w * s : n.h * s;
    const caja_ = eje === "x" ? bw : bh;
    return (caja_ - imagen * f.zoom) / 100;
  };
  const acotar = (v: number) => Math.min(100, Math.max(0, Math.round(v * 10) / 10));

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const fx = factor("x", a.p);
    const fy = factor("y", a.p);
    onChange({ ...a.p, x: fx ? acotar(a.p.x + (e.clientX - a.x) / fx) : a.p.x, y: fy ? acotar(a.p.y + (e.clientY - a.y) / fy) : a.p.y });
  };

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.shiftKey ? 8 : 2;
    const cambios: Partial<Record<string, Partial<FotoPortada>>> = {
      ArrowLeft: { x: acotar(foto.x + paso) },
      ArrowRight: { x: acotar(foto.x - paso) },
      ArrowUp: { y: acotar(foto.y + paso) },
      ArrowDown: { y: acotar(foto.y - paso) },
      "+": { zoom: Math.min(3, Math.round((foto.zoom + 0.1) * 100) / 100) },
      "=": { zoom: Math.min(3, Math.round((foto.zoom + 0.1) * 100) / 100) },
      "-": { zoom: Math.max(1, Math.round((foto.zoom - 0.1) * 100) / 100) },
    };
    const c = cambios[e.key];
    if (!c) return;
    e.preventDefault();
    onChange({ ...foto, ...c });
  };

  return (
    <div
      ref={caja}
      className="vi-encuadre"
      style={{ aspectRatio: aspecto }}
      tabIndex={0}
      role="group"
      aria-label="Encuadre de la imagen. Arrástrela para moverla. Con el teclado: flechas para moverla, más y menos para el zoom."
      data-arrastrando={arrastrando}
      onKeyDown={teclas}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        arrastre.current = { x: e.clientX, y: e.clientY, p: foto };
        setArrastrando(true);
      }}
      onPointerMove={mover}
      onPointerUp={() => {
        arrastre.current = null;
        setArrastrando(false);
      }}
      onPointerCancel={() => {
        arrastre.current = null;
        setArrastrando(false);
      }}
    >
      <img
        src={url}
        alt=""
        draggable={false}
        style={estiloFoto(foto.x, foto.y, foto.zoom)}
        onLoad={(e) => {
          natural.current = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
        }}
      />
    </div>
  );
}

/* ---------- El editor ---------- */

export interface PropsEditorPortada {
  ctx: ContextoHoja;
  portada: PortadaDiseno;
  perfil: PerfilOficina;
  unidadId: string;
  puedeDiseno: boolean;
  puedePerfil: boolean;
  guardando: boolean;
  aviso: Aviso | null;
  onGuardar: (portada: PortadaDiseno, perfil: PerfilOficina) => void;
  onCerrar: () => void;
}

export function EditorPortada({ ctx, portada: inicial, perfil: perfilInicial, unidadId, puedeDiseno, puedePerfil, guardando, aviso, onGuardar, onCerrar }: PropsEditorPortada) {
  const [p, setP] = useState(inicial);
  const [perfil, setPerfil] = useState(perfilInicial);
  const [error, setError] = useState("");
  const [locales, setLocales] = useState<Record<string, string>>({});
  const subir = useSubirImagenPortada();
  const inputFoto = useRef<HTMLInputElement>(null);
  const inputEscudo = useRef<HTMLInputElement>(null);

  const comp = COMPOSICIONES.find((c) => c.id === p.composicion) ?? COMPOSICIONES[0];
  const acento = useMemo(() => evaluarAcento(perfil.acento), [perfil.acento]);
  const remotaFoto = useUrlImagen(p.foto?.ruta);
  const remotaEscudo = useUrlImagen(perfil.logoRuta);
  const fotoUrl = p.foto ? (locales[p.foto.ruta] ?? remotaFoto.data ?? null) : null;
  const escudoUrl = perfil.logoRuta ? (locales[perfil.logoRuta] ?? remotaEscudo.data ?? null) : null;
  const medidas = PAPELES[ctx.papel];
  const aspecto = `${medidas.ancho} / ${Math.round(medidas.alto * 0.42 * 10) / 10}`;

  // Si el diseño guardado llega después de abrir el editor, se parte de él.
  useEffect(() => setP(inicial), [inicial]);
  useEffect(() => setPerfil(perfilInicial), [perfilInicial]);

  const vista = useMemo<ContextoHoja>(() => ({ ...ctx, perfil: { ...perfil, monograma: normalizarMonograma(perfil.monograma) || monogramaPorDefecto(perfil.nombre) }, acento, escudoUrl }), [ctx, perfil, acento, escudoUrl]);
  const cambiar = (c: Partial<PortadaDiseno>) => setP((x) => ({ ...x, ...c }));
  const cambiarPerfil = (c: Partial<PerfilOficina>) => setPerfil((x) => ({ ...x, ...c }));

  const subirImagen = async (archivo: File | undefined, destino: "foto" | "escudo") => {
    if (!archivo) return;
    setError("");
    try {
      const ruta = await subir.mutateAsync({ unidad: unidadId, archivo });
      setLocales((l) => ({ ...l, [ruta]: URL.createObjectURL(archivo) }));
      if (destino === "foto") cambiar({ foto: FOTO_NUEVA(ruta), fondo: "propia" });
      else cambiarPerfil({ logoRuta: ruta });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    }
  };

  const guardar = () => {
    const mono = normalizarMonograma(perfil.monograma);
    if (puedePerfil && !mono) {
      setError("El monograma lleva de 3 a 4 letras o números.");
      return;
    }
    setError("");
    onGuardar(p, { ...perfil, monograma: mono || monogramaPorDefecto(perfil.nombre) });
  };

  const alineacionFoto: AlineacionFoto = p.foto && p.fondo === "propia" ? (p.foto.y <= 25 ? "arriba" : p.foto.y >= 75 ? "abajo" : "centro") : p.alineacionFoto;
  const fijarAlineacion = (a: AlineacionFoto) => cambiar({ alineacionFoto: a, foto: p.foto ? { ...p.foto, y: YDE[a] } : p.foto });
  const sugerido = monogramaPorDefecto(perfil.nombre);
  const bloqueado = !puedeDiseno && !puedePerfil;

  return (
    <div className="vi-ed">
      <form className="vi-ed-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        {bloqueado && <p className="vi-bloq">Usted puede ver la portada, pero no cambiarla: el informe está enviado o su papel solo permite consultar.</p>}

        <fieldset disabled={!puedeDiseno}>
          <legend id="vi-comp">Composición</legend>
          <div className="vi-comps" role="radiogroup" aria-labelledby="vi-comp">
            {COMPOSICIONES.map((c) => (
              <label key={c.id}>
                <input type="radio" name="vi-composicion" checked={p.composicion === c.id} onChange={() => cambiar({ composicion: c.id })} />
                <div className="vi-mini">
                  <Escalado anchoMm={medidas.ancho}>
                    <PaginaPortada ctx={vista} portada={{ ...p, composicion: c.id }} fotoUrl={fotoUrl} />
                  </Escalado>
                </div>
                <span>{c.nombre}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={!puedeDiseno}>
          <legend>Textos</legend>
          <CampoTexto etiqueta="Título" valor={p.titulo} max={LIMITES.titulo} filas={2} onChange={(v) => cambiar({ titulo: v })} ayuda="Si es largo, el tamaño baja solo para que no se corte." />
          <CampoTexto etiqueta="Subtítulo" valor={p.subtitulo} max={LIMITES.subtitulo} filas={2} onChange={(v) => cambiar({ subtitulo: v })} />
          <CampoTexto etiqueta="Unidad" valor={p.unidad} max={LIMITES.unidad} onChange={(v) => cambiar({ unidad: v })} />
          <div className="vi-fila">
            <CampoTexto etiqueta="Año de gestión" valor={p.anio} max={LIMITES.anio} onChange={(v) => cambiar({ anio: v.replace(/\D/g, "") })} />
            <CampoTexto etiqueta="Ciclo" valor={p.ciclo} max={LIMITES.ciclo} onChange={(v) => cambiar({ ciclo: v })} />
          </div>
        </fieldset>

        <Segmentado
          etiqueta="Fondo"
          valor={comp.conFoto ? p.fondo : "color"}
          deshabilitado={!puedeDiseno || !comp.conFoto}
          opciones={[
            { id: "foto", texto: "Foto institucional" },
            { id: "color", texto: "Color" },
            { id: "propia", texto: "Imagen propia" },
          ]}
          onChange={(v) => {
            if (v === "propia" && !p.foto) inputFoto.current?.click();
            else cambiar({ fondo: v });
          }}
        />
        {!comp.conFoto && <p className="vi-hint">El fondo con foto es de la composición «Foto superior».</p>}

        {comp.conFoto && puedeDiseno && (
          <fieldset>
            <legend>Imagen de la portada</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button type="button" className="inf-btn inf-btn--sm" disabled={subir.isPending} onClick={() => inputFoto.current?.click()}>
                {subir.isPending ? "Subiendo…" : p.foto ? "Cambiar la imagen" : "Subir una imagen"}
              </button>
              {p.foto && (
                <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => cambiar({ foto: null, fondo: "foto" })}>
                  Quitar y usar la foto institucional
                </button>
              )}
              <input ref={inputFoto} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Subir imagen de portada" onChange={(e) => { void subirImagen(e.target.files?.[0], "foto"); e.target.value = ""; }} />
            </div>
            <span className="vi-hint">JPG, PNG o WebP, hasta {MAX_PORTADA / 1024 / 1024} MB. Se comprime sola si es muy grande. No lleve texto en la imagen: el título va sobre fondo blanco.</span>
            {p.foto && p.fondo === "propia" && fotoUrl && (
              <>
                <Encuadre url={fotoUrl} foto={p.foto} aspecto={aspecto} onChange={(foto) => cambiar({ foto })} />
                <div className="vi-rango">
                  <label htmlFor="vi-zoom">Zoom</label>
                  <input id="vi-zoom" type="range" min={1} max={3} step={0.05} value={p.foto.zoom} onChange={(e) => cambiar({ foto: { ...p.foto!, zoom: Number(e.target.value) } })} aria-valuetext={`${Math.round(p.foto.zoom * 100)} %`} />
                  <span>{Math.round(p.foto.zoom * 100)} %</span>
                </div>
              </>
            )}
            {p.fondo !== "color" && (
              <Segmentado
                etiqueta="Alinear el recorte"
                valor={alineacionFoto}
                opciones={[
                  { id: "arriba", texto: "Arriba" },
                  { id: "centro", texto: "Centro" },
                  { id: "abajo", texto: "Abajo" },
                ]}
                onChange={fijarAlineacion}
              />
            )}
          </fieldset>
        )}

        <fieldset disabled={!puedePerfil}>
          <legend id="vi-acento">Color de acento</legend>
          <div className="vi-sw" role="radiogroup" aria-labelledby="vi-acento">
            {ACENTOS_SUGERIDOS.map((a) => (
              <label key={a.hex} title={a.nombre}>
                <input type="radio" name="vi-acento" checked={acento.hex === a.hex} onChange={() => cambiarPerfil({ acento: a.hex })} aria-label={a.nombre} />
                <i style={{ background: a.hex }} />
              </label>
            ))}
            <span className="vi-libre">
              <input
                type="color"
                value={acento.hex}
                aria-label="Elegir otro color de acento"
                onChange={(e) => cambiarPerfil({ acento: normalizarHex(e.target.value) ?? acento.hex })}
              />
              <input
                type="text"
                className="inf-in"
                aria-label="Código del color, por ejemplo #1f5fbf"
                defaultValue={acento.hex}
                key={acento.hex}
                maxLength={7}
                onBlur={(e) => {
                  const h = normalizarHex(e.target.value);
                  if (h) cambiarPerfil({ acento: h });
                  else e.target.value = acento.hex;
                }}
              />
            </span>
          </div>
          <p className="vi-contraste" data-ok={acento.ok} role="status">
            {acento.aviso || `El texto ${acento.textoMarino ? "azul marino" : "blanco"} se lee bien sobre este color (${acento.razon}:1).`}
          </p>
          <p className="vi-hint">El acento pinta solo marcos: la franja del título, la portada y el monograma. Las gráficas y los estados llevan siempre la paleta de datos.</p>
        </fieldset>

        <div className="vi-fila">
          <Segmentado
            etiqueta="Alineación"
            valor={p.alineacion}
            deshabilitado={!puedeDiseno || !comp.conAlineacion}
            opciones={[
              { id: "izq", texto: "Izquierda" },
              { id: "centro", texto: "Centro" },
            ]}
            onChange={(v) => cambiar({ alineacion: v })}
          />
          <Segmentado
            etiqueta="Tamaño del título"
            valor={p.tamano}
            deshabilitado={!puedeDiseno}
            opciones={[
              { id: 0, texto: "S" },
              { id: 1, texto: "M" },
              { id: 2, texto: "L" },
            ]}
            onChange={(v) => cambiar({ tamano: v })}
          />
        </div>

        <fieldset disabled={!puedePerfil}>
          <legend>Monograma y escudo de la oficina</legend>
          <div className="vi-fila">
            <div style={{ display: "grid", gap: 4 }}>
              <label className="vi-lab" htmlFor="vi-mono">
                Monograma (3 a 4 letras)
              </label>
              <input
                id="vi-mono"
                className="inf-in"
                value={perfil.monograma}
                maxLength={4}
                onChange={(e) => cambiarPerfil({ monograma: e.target.value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "") })}
              />
              {perfil.monograma !== sugerido && (
                <button type="button" className="inf-link" style={{ justifySelf: "start" }} onClick={() => cambiarPerfil({ monograma: sugerido })}>
                  Usar el sugerido: {sugerido}
                </button>
              )}
            </div>
            <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
              <span className="vi-lab">Escudo propio (opcional)</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="inf-btn inf-btn--sm" disabled={subir.isPending} onClick={() => inputEscudo.current?.click()}>
                  {perfil.logoRuta ? "Cambiar" : "Subir"}
                </button>
                {perfil.logoRuta && (
                  <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => cambiarPerfil({ logoRuta: "" })}>
                    Usar monograma
                  </button>
                )}
              </div>
              <input ref={inputEscudo} type="file" accept="image/png,image/webp" hidden aria-label="Subir escudo" onChange={(e) => { void subirImagen(e.target.files?.[0], "escudo"); e.target.value = ""; }} />
            </div>
          </div>
          <span className="vi-hint">PNG con fondo transparente. Sin escudo se imprime el monograma. Estos datos son de la unidad y valen para todos sus informes.</span>
          {!puedePerfil && <span className="vi-hint">Solo el Gestor de la unidad o Planeación cambian el acento, el monograma y el escudo.</span>}
        </fieldset>

        <p className="vi-hint">El logo de la UDES y su lugar los fija Planeación: no se puede quitar.</p>

        <p className="vi-msg" role={error || aviso?.tono === "error" ? "alert" : "status"} data-error={Boolean(error) || aviso?.tono === "error"}>
          {error || aviso?.texto || ""}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="inf-btn inf-btn--pri" onClick={guardar} disabled={guardando || bloqueado}>
            {guardando ? "Guardando…" : "Guardar la portada"}
          </button>
          <button type="button" className="inf-btn" onClick={onCerrar}>
            Volver al informe
          </button>
        </div>
      </form>

      <div className="vi-ed-stage" aria-label="Vista previa de la portada">
        <Escalado anchoMm={medidas.ancho} maxPx={440}>
          <PaginaPortada ctx={vista} portada={p} fotoUrl={fotoUrl} />
        </Escalado>
        <p className="vi-cap2">Así saldrá la portada en {medidas.nombre}.</p>
      </div>
    </div>
  );
}

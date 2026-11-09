/* Imágenes por enlace: por si Pilo falla con las noticias. Bloque kind 'imagen', sec 'imagenes', spec.externa. */

import { useId, useState } from "react";
import type { SpecBloque, BloquePP } from "./tipos";
import { errorEnlaceHttps } from "./tipos";
import { ErrorAviso, Tarjeta } from "./ui";

/** Campo que actualiza en cada tecla (el botón de guardar depende de lo escrito). */
function Campo({ etiqueta, valor, onGuardar, lang, ayuda, placeholder }: { etiqueta: string; valor: string; onGuardar: (v: string) => void; lang?: string; ayuda?: string; placeholder?: string }) {
  const id = useId();
  return (
    <div className="pp-fld">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} value={valor} lang={lang} placeholder={placeholder} onChange={(e) => onGuardar(e.target.value)} />
      {ayuda && <small>{ayuda}</small>}
    </div>
  );
}

interface Borrador {
  url: string;
  eje: string;
  caption_es: string;
  caption_en: string;
  credit: string;
  credit_url: string;
  alt_es: string;
  alt_en: string;
  derecho: boolean;
}
const VACIO: Borrador = { url: "", eje: "", caption_es: "", caption_en: "", credit: "", credit_url: "", alt_es: "", alt_en: "", derecho: false };

const deSpec = (s: SpecBloque): Borrador => ({
  url: s.url ?? "",
  eje: s.eje ?? "",
  caption_es: s.caption_es ?? "",
  caption_en: s.caption_en ?? "",
  credit: s.credit ?? "",
  credit_url: s.credit_url ?? "",
  alt_es: s.alt_es ?? "",
  alt_en: s.alt_en ?? "",
  derecho: true, // ya se confirmó al crearla
});

/** Todo lo que impide guardar, dicho en claro. Vacío = se puede guardar. */
export function problemasImagen(b: Borrador, cargada: boolean | null): string[] {
  const out: string[] = [];
  const u = errorEnlaceHttps(b.url, "El enlace de la imagen");
  if (u) out.push(u);
  else if (cargada === false) out.push("La imagen no cargó desde ese enlace. Abre el enlace en otra pestaña: debe mostrar la imagen directamente (termina en .jpg, .png o .webp) y no pedir iniciar sesión.");
  else if (cargada === null) out.push("Espera a ver la vista previa para confirmar que la imagen carga.");
  if (b.credit_url.trim()) {
    const c = errorEnlaceHttps(b.credit_url, "El enlace del crédito");
    if (c) out.push(c);
  }
  if (!b.alt_es.trim()) out.push("Falta el texto alternativo en español (describe qué se ve; lo leen los lectores de pantalla).");
  if (!b.alt_en.trim()) out.push("Falta el texto alternativo en inglés.");
  if (!b.derecho) out.push("Confirma que tienes derecho a usar la imagen.");
  return out;
}

function Formulario({
  inicial,
  ejes,
  onGuardar,
  onCancelar,
  etiquetaGuardar,
}: {
  inicial: Borrador;
  ejes: { id: string; t: string }[];
  onGuardar: (spec: SpecBloque) => Promise<void>;
  onCancelar: () => void;
  etiquetaGuardar: string;
}) {
  const [b, setB] = useState<Borrador>(inicial);
  const [cargada, setCargada] = useState<boolean | null>(null);
  const [probando, setProbando] = useState(inicial.url.trim());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof Borrador) => (v: string) => setB((a) => ({ ...a, [k]: v }));
  const urlOk = !errorEnlaceHttps(b.url, "x");
  const problemas = problemasImagen(b, urlOk && b.url.trim() === probando ? cargada : null);

  const probar = () => {
    const v = b.url.trim();
    if (errorEnlaceHttps(v, "x")) return;
    setCargada(null);
    setProbando(v);
  };
  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      await onGuardar({
        url: b.url.trim(),
        externa: true,
        eje: b.eje,
        caption_es: b.caption_es.trim(),
        caption_en: b.caption_en.trim(),
        credit: b.credit.trim(),
        credit_url: b.credit_url.trim(),
        alt_es: b.alt_es.trim(),
        alt_en: b.alt_en.trim(),
      });
    } catch (e) {
      setError(e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="pp-imgform pp-stack">
      <div className="pp-fld">
        <label htmlFor="pp-iu">Enlace de la imagen (https://)</label>
        <div className="pp-inline">
          <input id="pp-iu" type="url" inputMode="url" value={b.url} placeholder="https://…/foto.jpg" onChange={(e) => set("url")(e.target.value)} onBlur={probar} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), probar())} />
          <button type="button" className="pp-btn pp-btn--sm" onClick={probar}>
            Ver vista previa
          </button>
        </div>
        {b.url.trim() && errorEnlaceHttps(b.url, "El enlace") && <small className="pp-warn">{errorEnlaceHttps(b.url, "El enlace")}</small>}
      </div>

      {probando && urlOk && b.url.trim() === probando && (
        <div className="pp-imgprev">
          {cargada === false ? (
            <p className="pp-aviso" role="alert">
              No se pudo cargar la imagen desde ese enlace.
            </p>
          ) : (
            <>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- la vista previa; el alt real lo escribe la persona abajo */}
              <img src={probando} alt={b.alt_es || "Vista previa de la imagen"} referrerPolicy="no-referrer" loading="lazy" onLoad={() => setCargada(true)} onError={() => setCargada(false)} />
              {cargada === null && <small className="pp-nota">Cargando la vista previa…</small>}
            </>
          )}
        </div>
      )}

      <div className="pp-dos">
        <Campo etiqueta="Texto alternativo en español (obligatorio)" valor={b.alt_es} lang="es" onGuardar={set("alt_es")} ayuda="Describe lo que se ve, para quien no puede verla." />
        <Campo etiqueta="Texto alternativo en inglés (obligatorio)" valor={b.alt_en} lang="en" onGuardar={set("alt_en")} />
      </div>
      <div className="pp-dos">
        <Campo etiqueta="Pie de foto en español" valor={b.caption_es} lang="es" onGuardar={set("caption_es")} />
        <Campo etiqueta="Pie de foto en inglés" valor={b.caption_en} lang="en" onGuardar={set("caption_en")} />
      </div>
      <div className="pp-dos">
        <Campo etiqueta="Crédito (opcional)" valor={b.credit} onGuardar={set("credit")} placeholder="Foto: nombre o institución" />
        <Campo etiqueta="Enlace de la fuente del crédito (opcional, https://)" valor={b.credit_url} onGuardar={set("credit_url")} />
      </div>
      <div className="pp-fld pp-fld--chico">
        <label htmlFor="pp-ie">Eje al que acompaña</label>
        <select id="pp-ie" value={b.eje} onChange={(e) => set("eje")(e.target.value)}>
          <option value="">General (en el primer eje sin imagen)</option>
          {ejes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.t}
            </option>
          ))}
        </select>
      </div>
      <label className="pp-check pp-check--bloque">
        <input type="checkbox" checked={b.derecho} onChange={(e) => setB((a) => ({ ...a, derecho: e.target.checked }))} /> Tengo derecho a usar la imagen y, si aparecen menores, la autorización de imagen.
      </label>

      {problemas.length > 0 && (
        <ul className="pp-warn-lista" role="status">
          {problemas.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {error != null && <ErrorAviso error={error} titulo="No se pudo guardar la imagen" />}
      <div className="pp-acciones">
        <button type="button" className="pp-btn pp-btn--pilo" disabled={problemas.length > 0 || guardando} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : etiquetaGuardar}
        </button>
        <button type="button" className="pp-btn" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function ImagenesPorEnlace({
  manuales,
  ejes,
  onCrear,
  onEditar,
  onQuitar,
  onVisible,
}: {
  manuales: BloquePP[];
  ejes: BloquePP[];
  onCrear: (spec: SpecBloque) => Promise<void>;
  onEditar: (id: string, spec: SpecBloque) => Promise<void>;
  onQuitar: (id: string) => void;
  onVisible: (id: string, v: boolean) => void;
}) {
  const [modo, setModo] = useState<"" | "nueva" | string>("");
  const [confirma, setConfirma] = useState<string | null>(null);
  const opcionesEje = ejes.map((e, i) => ({ id: e.id, t: `Eje ${i + 1}${e.heading_es ? ` · ${e.heading_es}` : ""}` }));
  const nombreEje = (id: string | undefined) => (id ? (opcionesEje.find((e) => e.id === id)?.t ?? "Eje que ya no existe") : "General");

  return (
    <Tarjeta
      titulo="Imágenes por enlace"
      cuenta={`${manuales.length}`}
      acciones={
        <button type="button" className="pp-btn pp-btn--sm" aria-expanded={modo === "nueva"} onClick={() => setModo(modo === "nueva" ? "" : "nueva")}>
          {modo === "nueva" ? "Cerrar" : "+ Agregar imagen por enlace"}
        </button>
      }
    >
      <div className="pp-pad pp-stack">
        <p className="pp-nota">Úsalas si Pilo no encuentra imágenes en las noticias. Pilo no las toca: tú las editas y las quitas. Solo enlaces https://.</p>
        {modo === "nueva" && <Formulario inicial={VACIO} ejes={opcionesEje} etiquetaGuardar="Agregar imagen" onCancelar={() => setModo("")} onGuardar={async (s) => { await onCrear(s); setModo(""); }} />}
        {manuales.length === 0 && modo !== "nueva" && <p className="pp-nota">Todavía no hay imágenes por enlace.</p>}
        <ul className="pp-lista">
          {manuales.map((m) => (
            <li key={m.id} className="pp-fila pp-fila--img">
              {modo === m.id ? (
                <div className="pp-fila__t">
                  <Formulario inicial={deSpec(m.spec)} ejes={opcionesEje} etiquetaGuardar="Guardar cambios" onCancelar={() => setModo("")} onGuardar={async (s) => { await onEditar(m.id, { ...m.spec, ...s }); setModo(""); }} />
                </div>
              ) : (
                <>
                  <img className="pp-mini" src={m.spec.url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget.style.visibility = "hidden"))} />
                  <div className="pp-fila__t">
                    <span>{m.spec.caption_es || m.spec.alt_es || m.spec.url}</span>
                    <small>
                      {nombreEje(m.spec.eje)}
                      {m.spec.credit ? ` · ${m.spec.credit}` : ""}
                      {!m.enabled ? " · oculta" : ""}
                    </small>
                  </div>
                  <button type="button" className="pp-btn pp-btn--sm" onClick={() => onVisible(m.id, !m.enabled)}>
                    {m.enabled ? "Ocultar" : "Mostrar"}
                  </button>
                  <button type="button" className="pp-btn pp-btn--sm" onClick={() => setModo(m.id)}>
                    Editar
                  </button>
                  {confirma === m.id ? (
                    <>
                      <button type="button" className="pp-btn pp-btn--sm pp-btn--mal" onClick={() => { onQuitar(m.id); setConfirma(null); }}>
                        Sí, quitar
                      </button>
                      <button type="button" className="pp-btn pp-btn--sm" onClick={() => setConfirma(null)}>
                        No
                      </button>
                    </>
                  ) : (
                    <button type="button" className="pp-btn pp-btn--sm" onClick={() => setConfirma(m.id)}>
                      Quitar
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Tarjeta>
  );
}

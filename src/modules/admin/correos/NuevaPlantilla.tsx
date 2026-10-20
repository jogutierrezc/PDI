/* =============================================================================
   Correos · Nueva plantilla.

   Una ventana anclada al botón, no un cuadro modal: nombre, quién firma, qué
   lleva y de dónde parte (en blanco o copia de otra). La plantilla nace en el
   grupo «Personalizadas», sin evento conectado: no se envía sola hasta que
   alguien la conecte; mientras tanto, «Enviar una prueba» sí la usa.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../../rankings/movimiento";
import { claveNueva, IDENTIDADES, MARCAS, TIPO_NOMBRE, TIPOS_PLANTILLA, type Identidad, type Plantilla, type TipoPlantilla } from "./servidor-logica";
import { GRUPO_PROPIAS } from "./datos";
import { Seg } from "./partes";

const SIN_EVENTO = "Sin evento conectado";
const IDENTIDAD_OPCIONES = IDENTIDADES.map((i) => [i, i === "plan" ? "Planeación" : "Mr. Pilo"] as const);
const TIPO_OPCIONES = TIPOS_PLANTILLA.map((t) => [t, TIPO_NOMBRE[t]] as const);

/** El texto con que nace una plantilla en blanco, según lo que lleve. */
const EN_BLANCO: Record<TipoPlantilla, Pick<Plantilla, "asunto" | "previa" | "titulo" | "saludo" | "mensaje" | "boton" | "nota">> = {
  enlace: {
    asunto: "Asunto del correo",
    previa: "",
    titulo: "Título del correo",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Abra este enlace para continuar.",
    boton: "Abrir",
    nota: "",
  },
  codigo: {
    asunto: "Su código de verificación",
    previa: "",
    titulo: "Su código",
    saludo: "Hola, {{nombre}}.",
    mensaje: "Escriba este código en la pantalla donde lo pidió.",
    boton: "Abrir",
    nota: "Si usted no lo pidió, ignore este mensaje.",
  },
  aviso: {
    asunto: "{{titulo_aviso}}",
    previa: "",
    titulo: "{{titulo_aviso}}",
    saludo: "Hola, {{nombre}}.",
    mensaje: "{{detalle}}",
    boton: "Abrir en la intranet",
    nota: "Usted recibe este aviso por su función en {{modulo}}.",
  },
};

/** La plantilla nueva: copia de otra (con su tipo y su HTML) o en blanco. */
function construir(nombre: string, identidad: Identidad, tipo: TipoPlantilla, base: Plantilla | null, usadas: string[]): Plantilla {
  const clave = claveNueva(nombre, usadas);
  if (base) {
    return { ...base, clave, identidad, grupo: GRUPO_PROPIAS, nombre, cuando: SIN_EVENTO, roles: base.roles ? { ...base.roles } : null };
  }
  return { ...EN_BLANCO[tipo], clave, identidad, grupo: GRUPO_PROPIAS, nombre, cuando: SIN_EVENTO, tipo, html: null, alcance: "cuerpo", roles: null };
}

export function NuevaPlantilla({
  plantillas,
  identidadInicial,
  onCrear,
}: {
  plantillas: Plantilla[];
  identidadInicial: Identidad;
  onCrear: (nueva: Plantilla) => Promise<void>;
}) {
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [identidad, setIdentidad] = useState<Identidad>(identidadInicial);
  const [tipo, setTipo] = useState<TipoPlantilla>("enlace");
  const [desde, setDesde] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const ventana = useRef<HTMLDivElement>(null);
  const campoNombre = useRef<HTMLInputElement>(null);

  const base = plantillas.find((p) => p.clave === desde) ?? null;

  const abrir = () => {
    setNombre("");
    setIdentidad(identidadInicial);
    setTipo("enlace");
    setDesde("");
    setError(null);
    setAbierta(true);
  };

  // Al abrir: el foco va al nombre, y la ventana aparece con un movimiento corto.
  useEffect(() => {
    if (!abierta) return;
    campoNombre.current?.focus();
    if (ventana.current && !movimientoReducido()) {
      gsap.fromTo(ventana.current, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.2, ease: "expo.out", clearProps: "transform,opacity" });
    }
  }, [abierta]);

  // Escape y un clic fuera la cierran; el foco vuelve al botón.
  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: MouseEvent) => {
      const dentro = e.target instanceof Node && (ventana.current?.contains(e.target) || boton.current?.contains(e.target));
      if (!dentro) setAbierta(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierta(false);
      boton.current?.focus();
    };
    document.addEventListener("mousedown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierta]);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) {
      setError("Póngale un nombre para reconocerla en la lista.");
      campoNombre.current?.focus();
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      await onCrear(construir(n, identidad, base ? base.tipo : tipo, base, plantillas.map((p) => p.clave)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se creó la plantilla.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="cor-nueva">
      <button ref={boton} type="button" className="button-primary cor-nueva__abrir" aria-expanded={abierta} aria-haspopup="dialog" onClick={() => (abierta ? setAbierta(false) : abrir())}>
        Nueva plantilla
      </button>

      {abierta && (
        <div ref={ventana} className="cor-nueva__ventana" role="dialog" aria-label="Nueva plantilla">
          <form className="cor-nueva__form" onSubmit={(e) => void crear(e)} noValidate>
            <h3>Nueva plantilla</h3>

            <label className="admin-field">
              <span>Nombre</span>
              <input
                ref={campoNombre}
                value={nombre}
                maxLength={80}
                placeholder="Bienvenida a nuevos contribuyentes"
                autoComplete="off"
                onChange={(e) => setNombre(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </label>

            <div className="admin-field">
              <span>Quién la firma</span>
              <Seg label="Quién la firma" value={identidad} options={IDENTIDAD_OPCIONES} onChange={setIdentidad} />
            </div>

            <label className="admin-field">
              <span>Partir de</span>
              <select value={desde} onChange={(e) => setDesde(e.target.value)}>
                <option value="">Una en blanco</option>
                {plantillas.map((p) => (
                  <option key={p.clave} value={p.clave}>
                    Copia de «{p.nombre}» · {MARCAS[p.identidad].nombre}
                  </option>
                ))}
              </select>
            </label>

            {base ? (
              <p className="cor-chica">Al copiar, el tipo es el de la plantilla copiada: {TIPO_NOMBRE[base.tipo].toLowerCase()}.</p>
            ) : (
              <div className="admin-field">
                <span>Qué lleva</span>
                <Seg label="Qué lleva" value={tipo} options={TIPO_OPCIONES} onChange={setTipo} />
              </div>
            )}

            {error && (
              <p className="cor-aviso" role="alert">
                {error}
              </p>
            )}

            <div className="cor-nueva__acciones">
              <button type="button" className="button-ghost" onClick={() => setAbierta(false)}>
                Cancelar
              </button>
              <button type="submit" className="button-primary" disabled={ocupado}>
                {ocupado ? "Creando…" : "Crear plantilla"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

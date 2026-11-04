/* =============================================================================
   Convenios · ventana «Nuevo convenio» (780 px). El código se escribe a mano
   (ci-01-### o cn-01-###, único); se sugiere el siguiente libre. La carpeta
   digital es obligatoria: un enlace https o la solicitud de crearla en UDrive
   (todavía sin conexión: se guarda la solicitud). Sin fecha de firma entra «En
   proceso» y sigue la ruta de firma.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Ventana } from "../../../components/espacio/Ventana";
import { hoyBogota } from "../lib/permisos";
import type { Ctx } from "../ui/comunes";
import { useCrearConvenio } from "./datos";
import { CODIGO_VALIDO, DOCUMENTOS, ENLACE_VALIDO, leerPais, MODALIDADES, NOMBRES_PAISES, RENOVACIONES, sugerirCodigo, TIPOS } from "./logica";
import type { Convenio, ConvenioNuevo, Naturaleza } from "./logica";

export function NuevoConvenio({ ctx, convenios, onCerrar, onCreado }: { ctx: Ctx; convenios: Convenio[]; onCerrar: () => void; onCreado: (id: string, codigo: string, errorCarpeta: string | null) => void }) {
  const crear = useCrearConvenio();
  const [codigo, setCodigo] = useState("");
  const [documento, setDocumento] = useState<string>("Convenio");
  const [naturaleza, setNaturaleza] = useState<Naturaleza>("Internacional");
  const [institucion, setInstitucion] = useState("");
  const [pais, setPais] = useState("");
  const [tipo, setTipo] = useState<string>("Marco");
  const [modalidad, setModalidad] = useState<string>(MODALIDADES[0]);
  const [renovacion, setRenovacion] = useState<string>(RENOVACIONES[0]);
  const [campus, setCampus] = useState("Todos");
  const [firma, setFirma] = useState("");
  const [termina, setTermina] = useState("");
  const [indefinido, setIndefinido] = useState(false);
  const [objeto, setObjeto] = useState("");
  const [via, setVia] = useState<"enlace" | "udrive">("udrive");
  const [enlace, setEnlace] = useState("");
  const [error, setError] = useState("");

  const prefijo = naturaleza === "Nacional" ? "cn-01-" : "ci-01-";
  const sugerido = useMemo(() => sugerirCodigo(convenios, prefijo), [convenios, prefijo]);
  const codigos = useMemo(() => new Set(convenios.map((c) => c.codigo)), [convenios]);

  const cambiarNaturaleza = (n: Naturaleza) => {
    setNaturaleza(n);
    if (n === "Nacional" && !pais) setPais("Colombia");
  };

  const guardar = () => {
    const cod = codigo.trim().toLowerCase();
    const inst = institucion.trim().replace(/\s+/g, " ");
    const falla = (t: string) => setError(t);
    if (!CODIGO_VALIDO.test(cod)) return falla("El código debe verse así: ci-01-602 (internacional) o cn-01-075 (nacional).");
    if (codigos.has(cod)) return falla("Ese código ya existe.");
    if (!inst || !pais) return falla("Falta la institución o el país.");
    if (via === "enlace" && !ENLACE_VALIDO.test(enlace.trim())) return falla("Pegue el enlace de la carpeta (https://…) o pida crearla en UDrive.");
    if (firma && !indefinido && termina && termina <= firma) return falla("La terminación debe ser posterior a la firma.");
    setError("");

    const firmado = Boolean(firma && (termina || indefinido));
    const p = leerPais(pais);
    const hoy = hoyBogota();
    const convenio: ConvenioNuevo = {
      codigo: cod,
      documento,
      naturaleza,
      institucion: inst,
      pais: p.pais,
      pais_cod: p.cod,
      objeto: objeto.trim(),
      tipo: tipo as ConvenioNuevo["tipo"],
      tipo_excel: "",
      modalidad,
      fecha_firma: firma || null,
      fecha_terminacion: indefinido ? null : termina || null,
      indefinido,
      renovacion,
      campus,
      facultad: "",
      programas: "",
      observaciones: "",
      // «udrive» se marca al crear la carpeta (conv_asegurar_carpeta), justo después de guardar el convenio.
      carpeta_estado: via === "enlace" ? "enlace" : "sin",
      carpeta_url: via === "enlace" ? enlace.trim() : null,
      pasos: firmado ? 5 : 1,
      pasos_fechas: firmado ? [null, null, null, null, null] : [hoy, null, null, null, null],
      estado_excel: null,
      origen: "manual",
    };
    crear.mutate(
      { convenio, nota: "Creado en la plataforma.", carpetaUdrive: via === "udrive" },
      { onSuccess: (r) => onCreado(r.id, cod, r.errorCarpeta), onError: (e) => setError(e.message) },
    );
  };

  return (
    <Ventana
      titulo="Nuevo convenio"
      clase="conv-dlg"
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="es-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="es-btn es-btn--pri" disabled={crear.isPending} onClick={guardar}>
            {crear.isPending ? (via === "udrive" ? "Creando convenio y carpeta…" : "Creando…") : "Crear convenio"}
          </button>
        </>
      }
    >
      <div className="conv-form">
        <p className="conv-sub">Sin fecha de firma entra «En proceso» y sigue la ruta de firma.</p>
        <div className="conv-g3">
          <label className="it-campo" htmlFor="cn-cod">
            <span>Código *</span>
            <input id="cn-cod" type="text" value={codigo} placeholder={sugerido} autoComplete="off" maxLength={9} onChange={(e) => setCodigo(e.target.value)} />
            <small className="conv-sub">
              Se escribe a mano. Sugerido: {sugerido}.{" "}
              <button type="button" className="conv-enlace" onClick={() => setCodigo(sugerido)}>
                Usar este
              </button>
            </small>
          </label>
          <label className="it-campo" htmlFor="cn-doc">
            <span>Documento</span>
            <select id="cn-doc" value={documento} onChange={(e) => setDocumento(e.target.value)}>
              {DOCUMENTOS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="it-campo" htmlFor="cn-nat">
            <span>Naturaleza</span>
            <select id="cn-nat" value={naturaleza} onChange={(e) => cambiarNaturaleza(e.target.value as Naturaleza)}>
              <option>Internacional</option>
              <option>Nacional</option>
            </select>
          </label>
        </div>
        <div className="conv-g2">
          <label className="it-campo" htmlFor="cn-ins">
            <span>Institución *</span>
            <input id="cn-ins" type="text" value={institucion} maxLength={300} onChange={(e) => setInstitucion(e.target.value)} />
          </label>
          <label className="it-campo" htmlFor="cn-pais">
            <span>País *</span>
            <select id="cn-pais" value={pais} onChange={(e) => setPais(e.target.value)}>
              <option value="">Elegir</option>
              {NOMBRES_PAISES.map((p) => (
                <option key={p}>{p}</option>
              ))}
              <option>Varios países</option>
            </select>
          </label>
        </div>
        <div className="conv-g3">
          <label className="it-campo" htmlFor="cn-tipo">
            <span>Tipo</span>
            <select id="cn-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.filter((t) => t !== "Sin tipo").map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="it-campo" htmlFor="cn-mod">
            <span>Modalidad</span>
            <select id="cn-mod" value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
              {MODALIDADES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="it-campo" htmlFor="cn-ren">
            <span>Renovación</span>
            <select id="cn-ren" value={renovacion} onChange={(e) => setRenovacion(e.target.value)}>
              {RENOVACIONES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="conv-g3">
          <label className="it-campo" htmlFor="cn-fir">
            <span>Firma (si ya se firmó)</span>
            <input id="cn-fir" type="date" value={firma} onChange={(e) => setFirma(e.target.value)} />
          </label>
          <label className="it-campo" htmlFor="cn-ter">
            <span>Terminación</span>
            <input id="cn-ter" type="date" value={termina} disabled={indefinido} onChange={(e) => setTermina(e.target.value)} />
          </label>
          <div className="it-campo">
            <span>Duración</span>
            <label className="conv-radio" htmlFor="cn-ind">
              <input id="cn-ind" type="checkbox" checked={indefinido} onChange={(e) => setIndefinido(e.target.checked)} />
              Indefinido
            </label>
          </div>
        </div>
        <div className="conv-g2">
          <label className="it-campo" htmlFor="cn-cam">
            <span>Campus</span>
            <select id="cn-cam" value={campus} onChange={(e) => setCampus(e.target.value)}>
              <option>Todos</option>
              {ctx.campus.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="it-campo" htmlFor="cn-obj">
          <span>Objeto</span>
          <textarea id="cn-obj" rows={3} value={objeto} onChange={(e) => setObjeto(e.target.value)} />
        </label>

        <fieldset className="conv-carpeta">
          <legend>Carpeta digital *</legend>
          <label className="conv-radio">
            <input type="radio" name="cn-via" checked={via === "udrive"} onChange={() => setVia("udrive")} />
            Crear la carpeta en UDrive
          </label>
          {via === "udrive" ? <p className="conv-sub">Se crea ahora en Internacionalización › Convenios › {pais || "país"} › {codigo.trim().toLowerCase() || sugerido} · {institucion.trim() || "institución"}.</p> : null}
          <label className="conv-radio">
            <input type="radio" name="cn-via" checked={via === "enlace"} onChange={() => setVia("enlace")} />
            Ya tengo el enlace (convenios con carpeta en SharePoint)
          </label>
          <input type="text" value={enlace} placeholder="https://…" aria-label="Enlace de la carpeta" disabled={via !== "enlace"} onChange={(e) => setEnlace(e.target.value)} />
        </fieldset>
        {error ? (
          <p className="conv-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Ventana>
  );
}

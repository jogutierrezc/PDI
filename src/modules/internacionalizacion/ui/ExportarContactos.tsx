/* =============================================================================
   Contactos · exportar (0167). Dos plantillas de Rua tal cual (11 y 10 columnas, con
   sus cabeceras originales, para volver a importarlas) y la libreta completa (las dos
   listas con quién aportó, cuándo y por dónde entró). Lo que se exporta es lo que se
   filtra aquí: campus, periodo, todo lo recibido o solo lo aprobado.

   El armado es puro (lib/exportar-contactos); escribir el .xlsx o el .csv es de
   contactos/archivos. Excel carga cuando se descarga, no con la pantalla.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Ventana } from "../../../components/espacio/Ventana";
import { PLANTILLAS } from "../../../../supabase/functions/int-contactos/contactos";
import { descargarExportacion } from "../contactos/archivos";
import { useAportantes, useEnvios, useFilasContactos, useNombres } from "../datos";
import { construirExportacion } from "../lib/exportar-contactos";
import type { Salida } from "../lib/exportar-contactos";
import type { LibroCompleto } from "../tipos";
import { fmt } from "./comunes";
import type { Ctx } from "./comunes";

const OPCIONES: { id: Salida; titulo: string; ayuda: string }[] = [
  { id: "academica", titulo: "Plantilla académica", ayuda: "Las 11 columnas de la plantilla de nominación, en su orden original." },
  { id: "empleadores", titulo: "Plantilla de empleadores", ayuda: "Las 10 columnas de la plantilla de empleadores." },
  { id: "libreta", titulo: "Libreta completa", ayuda: "Las dos listas con quién aportó, cuándo y por dónde entró. Para revisar y archivar." },
];

export function ExportarContactos({ ctx, libros, inicial = "academica", onCerrar }: { ctx: Ctx; libros: LibroCompleto[]; inicial?: Salida; onCerrar: () => void }) {
  const [salida, setSalida] = useState<Salida>(inicial);
  const [campus, setCampus] = useState("");
  const [periodo, setPeriodo] = useState(ctx.periodo?.id ?? "");
  const [soloAprobado, setSoloAprobado] = useState(false);
  const [formato, setFormato] = useState<"xlsx" | "csv">("xlsx");
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoja = (codigo: "academica" | "empleadores") => libros.find((l) => l.plantilla_contactos === codigo)?.hojas[0]?.id;
  const hAc = hoja("academica");
  const hEm = hoja("empleadores");
  const ac = useFilasContactos(hAc, null, true);
  const em = useFilasContactos(hEm, null, true);
  const aportantes = useAportantes();
  const envios = useEnvios(periodo || undefined);
  const todasFilas = useMemo(() => [...(ac.data ?? []), ...(em.data ?? [])], [ac.data, em.data]);
  const usuarios = useNombres(todasFilas.map((f) => f.created_by));

  const aporte = useMemo(() => new Map((aportantes.data ?? []).map((a) => [a.id, { nombre: a.nombre, cargo: a.cargo, correo: a.correo }])), [aportantes.data]);
  const periodos = useMemo(() => new Map(ctx.periodos.map((p) => [p.id, p.codigo])), [ctx.periodos]);

  const cargando = ac.isPending || em.isPending || aportantes.isPending;
  const falla = ac.error ?? em.error ?? aportantes.error;

  const x = useMemo(() => {
    if (!hAc || !hEm) return null;
    return construirExportacion({
      salida,
      filas: { academica: ac.data ?? [], empleadores: em.data ?? [] },
      hojas: { academica: hAc, empleadores: hEm },
      campus: ctx.campus,
      periodos,
      aportantes: aporte,
      usuarios: usuarios.data ?? {},
      estadoDe: (p, h, c) => envios.data?.find((e) => e.periodo_id === p && e.hoja_id === h && e.campus_id === c)?.estado ?? "borrador",
      filtro: { campus: campus || null, periodo: periodo || null, soloAprobado: soloAprobado && Boolean(periodo) },
    });
  }, [salida, ac.data, em.data, hAc, hEm, ctx.campus, periodos, aporte, usuarios.data, envios.data, campus, periodo, soloAprobado]);

  const personas = useMemo(() => {
    if (!x) return 0;
    const ids = new Set<string>();
    const filtradas = todasFilas.filter((f) => (!campus || f.campus_id === campus) && (!periodo || f.periodo_id === periodo));
    for (const f of filtradas) if (f.aportante_id) ids.add(f.aportante_id);
    return ids.size;
  }, [x, todasFilas, campus, periodo]);

  const bajar = async () => {
    if (!x) return;
    setBajando(true);
    setError(null);
    try {
      await descargarExportacion(x, formato);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el archivo.");
    } finally {
      setBajando(false);
    }
  };

  const faltaPreparar = !hAc || !hEm;
  const primera = x?.filas[0];

  return (
    <Ventana
      titulo="Exportar contactos"
      etiqueta="Exportar contactos"
      onCerrar={onCerrar}
      pie={
        <>
          {error && (
            <p className="it-error" role="alert">
              {error}
            </p>
          )}
          <span className="it-tenue" style={{ marginRight: "auto" }}>
            {x ? `${fmt(x.filas.length)} contactos${personas ? ` · ${fmt(personas)} ${personas === 1 ? "persona aportó" : "personas aportaron"}` : ""}` : ""}
          </span>
          <button type="button" className="es-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="es-btn es-btn--pri" disabled={!x || x.filas.length === 0 || bajando} onClick={() => void bajar()}>
            {bajando ? "Preparando…" : formato === "xlsx" ? "Exportar Excel" : "Exportar CSV"}
          </button>
        </>
      }
    >
      <div className="it-nuevo">
        {faltaPreparar ? (
          <p className="it-ayuda">Todavía no está lista la carpeta Contactos. Prepárela desde la sección Contactos.</p>
        ) : falla ? (
          <p className="it-error" role="alert">
            {falla instanceof Error ? falla.message : "No se pudieron leer los contactos."}
          </p>
        ) : (
          <>
            <fieldset className="it-campo">
              <legend>Qué archivo</legend>
              <div className="it-opciones">
                {OPCIONES.map((o) => (
                  <label key={o.id} className="it-opcion">
                    <input type="radio" name="it-salida" checked={salida === o.id} onChange={() => setSalida(o.id)} />
                    <span>
                      <b>{o.titulo}</b>
                      <small>{o.ayuda}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="it-nuevo__fila">
              <label className="it-campo">
                <span>Campus</span>
                <select value={campus} onChange={(e) => setCampus(e.target.value)}>
                  <option value="">Todos los campus</option>
                  {ctx.campus.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="it-campo">
                <span>Periodo</span>
                <select
                  value={periodo}
                  onChange={(e) => {
                    setPeriodo(e.target.value);
                    if (!e.target.value) setSoloAprobado(false);
                  }}
                >
                  <option value="">Todos los periodos</option>
                  {[...ctx.periodos]
                    .sort((a, b) => b.codigo.localeCompare(a.codigo))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="it-nuevo__fila">
              <fieldset className="it-campo">
                <legend>Filas</legend>
                <div className="it-seg" role="radiogroup" aria-label="Qué filas">
                  <button type="button" role="radio" aria-checked={!soloAprobado} onClick={() => setSoloAprobado(false)}>
                    Todo lo recibido
                  </button>
                  <button type="button" role="radio" aria-checked={soloAprobado} disabled={!periodo} title={periodo ? undefined : "Elija un periodo para filtrar por aprobado"} onClick={() => setSoloAprobado(true)}>
                    Solo aprobado
                  </button>
                </div>
              </fieldset>
              <fieldset className="it-campo">
                <legend>Formato</legend>
                <div className="it-seg" role="radiogroup" aria-label="Formato">
                  <button type="button" role="radio" aria-checked={formato === "xlsx"} onClick={() => setFormato("xlsx")}>
                    Excel
                  </button>
                  <button type="button" role="radio" aria-checked={formato === "csv"} onClick={() => setFormato("csv")}>
                    CSV
                  </button>
                </div>
              </fieldset>
            </div>

            <div className="it-campo">
              <span>Así queda la primera fila del archivo</span>
              {cargando ? (
                <p className="it-ayuda">Leyendo los contactos…</p>
              ) : x ? (
                <div className="it-ct-vista">
                  <div className="it-ct-cabeceras">
                    {x.encabezados.map((h) => (
                      <code key={h}>{h}</code>
                    ))}
                  </div>
                  {primera ? <p className="it-ayuda">{primera.filter(Boolean).join(" · ")}</p> : <p className="it-ayuda">Con estos filtros no hay contactos.</p>}
                </div>
              ) : null}
            </div>

            <p className="it-ayuda">
              Las cabeceras de las plantillas se escriben tal como vienen en el archivo original, con sus mayúsculas y el «(Optional)».
              {salida !== "libreta" && x && x.repetidas > 0 ? ` Se quitaron ${fmt(x.repetidas)} filas por correo repetido (queda la más reciente).` : ""}
              {salida === "libreta" ? " La libreta conserva todo lo recibido, incluso los correos que se repiten entre periodos." : ""}
              {" "}
              {salida !== "libreta" ? `Archivo: ${PLANTILLAS[salida].archivo}.` : ""}
            </p>
          </>
        )}
      </div>
    </Ventana>
  );
}

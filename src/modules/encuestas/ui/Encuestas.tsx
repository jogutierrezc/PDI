/* =============================================================================
   Encuestas con Pilo · el panel (/admin/encuestas).

   «Mis encuestas y plantillas» (lista) y, al abrir una encuesta, su espacio con
   seis vistas: Editor, Presentación, Acceso y publicación, Respuestas,
   Resultados e Historial. La encuesta de aportes con cifras (rendicion-2026)
   conserva su tabla de siempre en «Respuestas».
   Ve quien tiene la pantalla y capacidad de Responsable; edita Planeación o más,
   o quien la encuesta tenga como editor.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell, ReadOnlyNotice } from "../../admin/components/AdminShell";
import { ErrorBlock } from "../../../components/ui/QueryState";
import { useAuth } from "../../../lib/auth";
import { FaltaMigracionEncuestas, useAccionesRespuesta, useAportes, useBitacora, useBorrado, useCambiarEstado, useCrearEncuesta, useDuplicarEncuesta, useEditores, useEncuestas, useGuardarEncuesta, usePapelera, usePublicar, useRespuestas, useRespuestasPapelera, useVersiones } from "../datos";
import { leerConfig } from "../lib/config";
import { aportesComoValores } from "../lib/plantillas";
import type { Estructura } from "../lib/estructura";
import { puedeEditarEncuestas } from "../lib/permisos";
import type { RespuestaLeida } from "../lib/resultados";
import { resumir } from "../lib/tabla";
import { textoEstadoEncuesta } from "../tipos";
import type { Aporte, Encuesta } from "../tipos";
import { Acceso } from "./Acceso";
import { Editor } from "./Editor";
import { ListaEncuestas } from "./ListaEncuestas";
import { Papelera } from "./Papelera";
import { Presentacion } from "./Presentacion";
import { RespuestasModelo } from "./RespuestasModelo";
import { Resultados } from "./Resultados";
import { TablaRespuestas } from "./TablaRespuestas";
import "./encuestas.css";
import "./editor.css";

type Vista = "editor" | "presentacion" | "acceso" | "respuestas" | "resultados" | "historial";
const VISTAS: readonly { id: Vista; texto: string; pestana: string }[] = [
  { id: "editor", texto: "Editor", pestana: "ed" },
  { id: "presentacion", texto: "Presentación y salida", pestana: "pres" },
  { id: "acceso", texto: "Acceso y publicación", pestana: "acceso" },
  { id: "respuestas", texto: "Respuestas", pestana: "resp" },
  { id: "resultados", texto: "Resultados", pestana: "res" },
  { id: "historial", texto: "Historial", pestana: "hist" },
];

interface Aviso {
  texto: string;
  accion?: { texto: string; hacer: () => void };
}

const ACCIONES_BITACORA: Record<string, string> = {
  encuesta_creada: "creó la encuesta",
  encuesta_duplicada: "duplicó la encuesta",
  estado_cambiado: "cambió el estado",
  acceso_cambiado: "cambió el acceso",
  titulo_cambiado: "cambió el título",
  reglas_cambiadas: "cambió las reglas de acceso o fechas",
  version_publicada: "publicó una versión",
  editor_agregado: "agregó a un editor",
  editor_quitado: "quitó a un editor",
  respuesta_borrada: "borró una respuesta",
  respuesta_restaurada: "restauró una respuesta",
  papelera_purgada: "purgó la papelera",
};
const FECHA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

export function Encuestas() {
  const { profile } = useAuth();
  const globalEditor = puedeEditarEncuestas(profile?.role);
  const lista = useEncuestas();
  const [params, setParams] = useSearchParams();
  const crear = useCrearEncuesta();
  const duplicar = useDuplicarEncuesta();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef<number>();

  const decir = (texto: string, accion?: Aviso["accion"]) => {
    setAviso({ texto, accion });
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setAviso(null), accion ? 8000 : 3500);
  };
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const encuesta = useMemo(() => lista.data?.find((e) => e.slug === params.get("encuesta")) ?? null, [lista.data, params]);
  const abrir = (slug: string | null, vista?: string) => {
    const n = new URLSearchParams(params);
    if (slug) n.set("encuesta", slug);
    else n.delete("encuesta");
    if (vista) n.set("vista", vista);
    else n.delete("vista");
    setParams(n);
  };

  const cuerpo = () => {
    if (lista.isPending) return <p className="admin-loading">Buscando las encuestas…</p>;
    if (lista.error) {
      return lista.error instanceof FaltaMigracionEncuestas ? (
        <p className="en-nota" role="alert">
          {lista.error.message} Aplíquela en Supabase y vuelva a esta pantalla.
        </p>
      ) : (
        <ErrorBlock error={lista.error} />
      );
    }
    if (encuesta) return <Espacio key={encuesta.id} encuesta={encuesta} globalEditor={globalEditor} vista={(params.get("vista") as Vista) || "editor"} onVista={(v) => abrir(encuesta.slug, v)} onVolver={() => abrir(null)} decir={decir} />;
    return (
      <ListaEncuestas
        encuestas={lista.data}
        puedeEditar={globalEditor}
        trabajando={crear.isPending || duplicar.isPending}
        onAbrir={abrir}
        onCrear={({ slug, titulo, plantilla }) =>
          crear.mutate(
            { slug, titulo, estructura: plantilla.estructura(), plantilla: plantilla.codigo },
            { onSuccess: () => { decir("Encuesta creada. Ya puede editarla."); abrir(slug, "editor"); }, onError: (e) => decir(`No se pudo crear: ${e.message}`) },
          )
        }
        onDuplicar={({ origen, slug, titulo }) =>
          duplicar.mutate({ id: origen.id, slug, titulo }, { onSuccess: () => { decir("Encuesta duplicada: copió la estructura y los ajustes, no las respuestas."); abrir(slug, "editor"); }, onError: (e) => decir(`No se pudo duplicar: ${e.message}`) })
        }
      />
    );
  };

  return (
    <AdminShell section="encuestas" kicker="Encuestas con Pilo" title="Encuestas con Pilo" description="Cree encuestas que Mr. Pilo conduce, publíquelas con su enlace y revise lo que responde la gente.">
      {!globalEditor && <ReadOnlyNotice />}
      <div className="en-root">{cuerpo()}</div>
      <p className="en-aviso" role="status" aria-live="polite" data-on={aviso ? "1" : undefined}>
        {aviso?.texto}
        {aviso?.accion && (
          <button
            type="button"
            className="en-aviso__btn"
            onClick={() => {
              aviso.accion?.hacer();
              setAviso(null);
            }}
          >
            {aviso.accion.texto}
          </button>
        )}
      </p>
    </AdminShell>
  );
}

function Espacio({ encuesta, globalEditor, vista, onVista, onVolver, decir }: { encuesta: Encuesta; globalEditor: boolean; vista: Vista; onVista: (v: Vista) => void; onVolver: () => void; decir: (t: string, a?: Aviso["accion"]) => void }) {
  const { profile } = useAuth();
  const editores = useEditores(encuesta.id);
  const miRol = editores.data?.find((x) => x.usuario_id === profile?.id)?.rol;
  const puedeEditar = globalEditor || miRol === "propietario" || miRol === "editor";
  const guardar = useGuardarEncuesta(encuesta.id);
  const publicar = usePublicar(encuesta.id);
  const versiones = useVersiones(encuesta.id);
  const legado = leerConfig(encuesta.config_pilo).flujo === "aportes";
  const borrador: Estructura | undefined = (versiones.data?.find((v) => !v.fijada) ?? versiones.data?.[0])?.estructura;

  const alTeclear = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = VISTAS.findIndex((v) => v.id === vista);
    const sig = VISTAS[(i + (e.key === "ArrowRight" ? 1 : VISTAS.length - 1)) % VISTAS.length];
    onVista(sig.id);
    window.setTimeout(() => document.getElementById(`en-tab-${sig.pestana}`)?.focus(), 0);
  };

  const guardarAjustes = (c: Parameters<typeof guardar.mutate>[0], mensaje: string) => guardar.mutate(c, { onSuccess: () => decir(mensaje), onError: (e) => decir(`No se pudo guardar: ${e.message}`) });
  const publicarVersion = (nota: string) =>
    publicar.mutate(nota, {
      onSuccess: () => {
        decir("Versión publicada. Las respuestas nuevas apuntan a ella.");
        onVista("acceso");
      },
      onError: (e) => decir(`No se pudo publicar: ${e.message}`),
    });

  return (
    <div>
      <div className="ed-cab-enc">
        <button type="button" className="ed-btn ed-btn--sm" onClick={onVolver}>
          ← Mis encuestas
        </button>
        <h2>{encuesta.titulo}</h2>
        <span className="ed-estado" data-s={encuesta.estado}>
          <i aria-hidden="true" />
          {textoEstadoEncuesta(encuesta.estado)}
        </span>
      </div>
      <div className="ed-pestanas" role="tablist" aria-label="Vistas de la encuesta" onKeyDown={alTeclear}>
        {VISTAS.map((v) => (
          <button key={v.id} type="button" role="tab" id={`en-tab-${v.pestana}`} aria-selected={vista === v.id} aria-controls={`en-panel-${v.pestana}`} tabIndex={vista === v.id ? 0 : -1} onClick={() => onVista(v.id)}>
            {v.texto}
          </button>
        ))}
      </div>

      {vista === "editor" && (
        <div role="tabpanel" id="en-panel-ed" aria-labelledby="en-tab-ed">
          <Editor encuesta={encuesta} puedeEditar={puedeEditar} onPublicar={() => onVista("acceso")} onAviso={decir} />
        </div>
      )}
      {vista === "presentacion" &&
        (borrador ? (
          <Presentacion key={encuesta.updated_at} encuesta={encuesta} estructura={borrador} puedeEditar={puedeEditar} guardando={guardar.isPending} onGuardar={guardarAjustes} />
        ) : (
          <p className="admin-loading">Abriendo la presentación…</p>
        ))}
      {vista === "acceso" &&
        (borrador ? (
          <Acceso key={encuesta.updated_at} encuesta={encuesta} estructura={borrador} puedeEditar={puedeEditar} guardando={guardar.isPending} publicando={publicar.isPending} onGuardar={guardarAjustes} onPublicar={publicarVersion} onAviso={decir} />
        ) : (
          <p className="admin-loading">Abriendo el acceso…</p>
        ))}
      {vista === "respuestas" && (legado ? <RespuestasAportes encuesta={encuesta} puedeEditar={puedeEditar} decir={decir} /> : <RespuestasNuevas encuesta={encuesta} estructura={borrador} puedeEditar={puedeEditar} decir={decir} />)}
      {vista === "resultados" && borrador && <ResultadosDe encuesta={encuesta} estructura={borrador} legado={legado} />}
      {vista === "historial" && <Historial encuestaId={encuesta.id} />}
    </div>
  );
}

/** Respuestas de la encuesta de aportes con cifras: la tabla de siempre, la papelera y el resumen. */
function RespuestasAportes({ encuesta, puedeEditar, decir }: { encuesta: Encuesta; puedeEditar: boolean; decir: (t: string, a?: Aviso["accion"]) => void }) {
  const aportes = useAportes(encuesta.id);
  const estado = useCambiarEstado(encuesta.id);
  const borrado = useBorrado(encuesta.id);
  const [pap, setPap] = useState(false);
  const papelera = usePapelera(encuesta.id, pap);
  const resumen = useMemo(() => resumir(aportes.data ?? []), [aportes.data]);

  const restaurar = (id: string) => borrado.restaurar.mutate(id, { onSuccess: () => decir("Respuesta restaurada."), onError: (e) => decir(`No se pudo restaurar: ${e.message}`) });
  const borrar = (id: string, motivo: string) =>
    borrado.borrar.mutate(
      { id, motivo },
      { onSuccess: () => decir("Respuesta enviada a la papelera.", { texto: "Deshacer", hacer: () => restaurar(id) }), onError: (e) => decir(`No se pudo borrar: ${e.message}`) },
    );

  return (
    <div className="en-tarjeta">
      <div className="en-meta ed-meta">
        <span>
          Recibidas <b>{resumen.recibidas}</b>
        </span>
        <span>
          <b>{resumen.logros}</b> logros
        </span>
        <span>
          <b>{resumen.retos}</b> retos
        </span>
        <span>
          <b>{resumen.dependencias}</b> dependencias
        </span>
        <span>
          <b>{resumen.cifras}</b> cifras
        </span>
        <span className="en-grow" />
        <div className="ed-seg" role="group" aria-label="Qué ver">
          <button type="button" aria-pressed={!pap} onClick={() => setPap(false)}>
            Respuestas
          </button>
          <button type="button" aria-pressed={pap} onClick={() => setPap(true)}>
            Papelera
          </button>
        </div>
      </div>
      {pap ? (
        papelera.isPending ? (
          <p className="admin-loading">Abriendo la papelera…</p>
        ) : papelera.error ? (
          <ErrorBlock error={papelera.error} />
        ) : (
          <Papelera aportes={papelera.data} puedeEditar={puedeEditar} onRestaurar={restaurar} />
        )
      ) : aportes.isPending ? (
        <p className="admin-loading">Leyendo las respuestas…</p>
      ) : aportes.error ? (
        <ErrorBlock error={aportes.error} />
      ) : (
        <TablaRespuestas
          aportes={aportes.data}
          slug={encuesta.slug}
          puedeEditar={puedeEditar}
          onEstado={(id, e) => estado.mutate({ id, estado: e }, { onSuccess: () => decir("Estado actualizado."), onError: (err) => decir(`No se pudo cambiar el estado: ${err.message}`) })}
          onBorrar={borrar}
          onAviso={decir}
        />
      )}
    </div>
  );
}

function RespuestasNuevas({ encuesta, estructura, puedeEditar, decir }: { encuesta: Encuesta; estructura: Estructura | undefined; puedeEditar: boolean; decir: (t: string, a?: Aviso["accion"]) => void }) {
  const respuestas = useRespuestas(encuesta.id);
  const [verPap, setVerPap] = useState(false);
  const papelera = useRespuestasPapelera(encuesta.id, verPap);
  const acciones = useAccionesRespuesta(encuesta.id);
  if (!estructura || respuestas.isPending) return <p className="admin-loading">Leyendo las respuestas…</p>;
  if (respuestas.error) return <ErrorBlock error={respuestas.error} />;
  const restaurar = (id: string) => acciones.restaurar.mutate(id, { onSuccess: () => decir("Respuesta restaurada."), onError: (e) => decir(`No se pudo restaurar: ${e.message}`) });
  return (
    <div className="en-tarjeta" role="tabpanel" id="en-panel-resp" aria-labelledby="en-tab-resp">
      <RespuestasModelo
        onPapelera={setVerPap}
        slug={encuesta.slug}
        estructura={estructura}
        respuestas={respuestas.data}
        papelera={papelera.data}
        puedeEditar={puedeEditar}
        onEstado={(id, estado) => acciones.estado.mutate({ id, estado }, { onSuccess: () => decir("Estado actualizado."), onError: (e) => decir(`No se pudo cambiar el estado: ${e.message}`) })}
        onBorrar={(id, motivo) => acciones.borrar.mutate({ id, motivo }, { onSuccess: () => decir("Respuesta enviada a la papelera.", { texto: "Deshacer", hacer: () => restaurar(id) }), onError: (e) => decir(`No se pudo borrar: ${e.message}`) })}
        onRestaurar={restaurar}
        onAviso={decir}
      />
    </div>
  );
}

function ResultadosDe({ encuesta, estructura, legado }: { encuesta: Encuesta; estructura: Estructura; legado: boolean }) {
  const aportes = useAportes(legado ? encuesta.id : undefined);
  const respuestas = useRespuestas(legado ? undefined : encuesta.id);
  const datos: RespuestaLeida[] | null = useMemo(() => {
    if (legado) return aportes.data ? aportes.data.map((a: Aporte) => ({ id: a.id, estado: a.estado, valores: aportesComoValores(a.dependencia, [a]) })) : null;
    return respuestas.data ? respuestas.data.map((r) => ({ id: r.id, estado: r.estado, valores: r.valores, borrado_en: r.borrado_en })) : null;
  }, [legado, aportes.data, respuestas.data]);
  const error = legado ? aportes.error : respuestas.error;
  if (error) return <ErrorBlock error={error} />;
  if (!datos) return <p className="admin-loading">Calculando los resultados…</p>;
  return <Resultados estructura={estructura} respuestas={datos} />;
}

function Historial({ encuestaId }: { encuestaId: string }) {
  const h = useBitacora(encuestaId, true);
  if (h.isPending) return <p className="admin-loading">Leyendo el historial…</p>;
  if (h.error) return <ErrorBlock error={h.error} />;
  return (
    <section className="ed-card ed-pad" role="tabpanel" id="en-panel-hist" aria-labelledby="en-tab-hist">
      <h3 className="ed-h3">Historial de cambios</h3>
      {h.data.length === 0 ? (
        <p className="ed-fino">Todavía no hay movimientos registrados.</p>
      ) : (
        <ol className="ed-historial">
          {h.data.map((x) => (
            <li key={x.id}>
              <b>{ACCIONES_BITACORA[x.accion] ?? x.accion}</b>
              <span className="ed-fino">
                {FECHA.format(new Date(x.en))}
                {x.actor ? "" : " · sistema"}
                {typeof x.detalle.motivo === "string" && x.detalle.motivo ? ` · «${x.detalle.motivo}»` : ""}
                {typeof x.detalle.a === "string" ? ` · ${String(x.detalle.de ?? "")} → ${x.detalle.a}` : ""}
                {typeof x.detalle.version === "number" ? ` · versión ${x.detalle.version}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

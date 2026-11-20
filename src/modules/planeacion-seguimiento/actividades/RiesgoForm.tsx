/* Planeación y Seguimiento · Fase 3 · registrar o editar un RIESGO de una actividad, a pantalla completa (`riesgo/<actividad>`, `?r=<riesgo>` para editar).
   Crea el gestor o el colaborador asignado; edita (incluido el estado) solo el gestor. Las acciones con responsable y fecha se agregan en la actividad. */

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { useSearchParams } from "react-router-dom";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { useAct, useActividad, useRiesgos } from "./hooks";
import { NIVELES_RIESGO, ROTULO_RIESGO, type EstadoRiesgo, type NivelRiesgo } from "./modeloF3";
import { Banner } from "./partes";
import { validarRiesgo } from "./reglasF3";

export function RiesgoForm({ id }: { id: string }) {
  const { ruta, ir } = usePs();
  const a = useAct();
  const det = useActividad(id);
  const [params] = useSearchParams();
  const editar = params.get("r");
  const ops = useRiesgos();
  const x = det.data?.actividad;
  const r = det.data?.riesgos.find((q) => q.id === editar) ?? null;
  const [v, setV] = useState<{ titulo: string; nivel: NivelRiesgo; descripcion: string; mitigacion: string; estado: EstadoRiesgo } | null>(null);
  const [intento, setIntento] = useState(false);
  const volver = `${ruta("actividad", id)}?pestana=riesgos`;
  const titulo = editar ? "Editar el riesgo" : "Registrar un riesgo";
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Actividad", a: ruta("actividad", id) }, { texto: titulo }];
  if (a.cargando || det.isPending) return <PaginaCompleta titulo={titulo} migas={migas} regresarA={volver}><LoadingBlock rows={3} label="Cargando" /></PaginaCompleta>;
  if (!x) return <PaginaCompleta titulo={titulo} migas={migas} regresarA={ruta("tablero")}><Banner tipo="error" rol="alert">{(det.error as Error | null)?.message ?? "Esa actividad no existe o no puede verla."}</Banner></PaginaCompleta>;
  const poder = a.poderDe(x.oficinaId);
  const crea = poder === "gestor" || (poder === "colaborador" && a.yo !== null && x.asignados.includes(a.yo));
  if (editar ? poder !== "gestor" : !crea) return <PaginaCompleta titulo={titulo} migas={migas} regresarA={volver}><Banner><Icon name="lock" size={14} /> {editar ? "Edita los riesgos el gestor de la oficina." : "Registra riesgos el gestor o el colaborador que tiene asignada la actividad."}</Banner></PaginaCompleta>;
  if (editar && !r) return <PaginaCompleta titulo={titulo} migas={migas} regresarA={volver}><Banner tipo="error" rol="alert">Ese riesgo no existe.</Banner></PaginaCompleta>;
  const val = v ?? { titulo: r?.titulo ?? "", nivel: r?.nivel ?? "Medio", descripcion: r?.descripcion ?? "", mitigacion: r?.mitigacion ?? "", estado: r?.estado ?? "abierto" };
  const poner = <K extends keyof typeof val>(k: K, x2: (typeof val)[K]) => setV({ ...val, [k]: x2 });
  const errs = new Map(validarRiesgo(val).map((e) => [e.campo, e.mensaje]));
  const mostrar = (c: string) => (intento ? (errs.get(c) ?? null) : null);
  const pendiente = ops.crear.isPending || ops.editar.isPending;
  const error = (ops.crear.error ?? ops.editar.error) as Error | null;
  const enviar = () => {
    setIntento(true);
    const primero = [...errs.keys()][0];
    if (primero) return void document.getElementById(primero)?.focus();
    const datos = { titulo: val.titulo.trim(), descripcion: val.descripcion.trim(), nivel: val.nivel, mitigacion: val.mitigacion.trim() };
    if (editar) ops.editar.mutate({ id: editar, cambios: { ...datos, estado: val.estado } }, { onSuccess: () => ir(volver, { reemplazar: true }) });
    else ops.crear.mutate({ actividadId: id, datos }, { onSuccess: () => ir(volver, { reemplazar: true }) });
  };
  return (
    <PaginaCompleta
      titulo={titulo}
      subtitulo={<>«{x.titulo}»</>}
      migas={migas}
      regresarA={volver}
      ancho="angosto"
      pie={<><div className="ps-pie__izq"><span className="ps-guardado">Nada se guarda hasta que confirme.</span></div><div className="ps-pie__der"><button type="button" className="button-primary" onClick={enviar} disabled={pendiente} aria-busy={pendiente || undefined}>{pendiente ? "Un momento…" : editar ? "Guardar los cambios" : "Registrar el riesgo"}</button></div></>}
    >
      <div className="ps-campos">
        {error ? <Banner tipo="error" rol="alert">{error.message}</Banner> : null}
        <Campo id="rg-titulo" etiqueta="El riesgo, en pocas palabras" ayuda="Por ejemplo: «El proveedor puede entregar tarde»." error={mostrar("rg-titulo")} obligatorio>
          {(p) => <input {...p} type="text" maxLength={200} value={val.titulo} onChange={(e) => poner("titulo", e.target.value)} autoComplete="off" />}
        </Campo>
        <Campo id="rg-nivel" etiqueta="Nivel" ayuda="Crítico o Alto: mantiene la actividad «En riesgo» al validar un avance parcial." error={mostrar("rg-nivel")} obligatorio>
          {(p) => <select {...p} value={val.nivel} onChange={(e) => poner("nivel", e.target.value as NivelRiesgo)}>{NIVELES_RIESGO.map((n) => <option key={n}>{n}</option>)}</select>}
        </Campo>
        {editar ? (
          <Campo id="rg-estado" etiqueta="Estado" ayuda="«Mitigando»: ya se está actuando. Para cerrarlo con una nota use «Cerrar el riesgo» en la actividad.">
            {(p) => <select {...p} value={val.estado} onChange={(e) => poner("estado", e.target.value as EstadoRiesgo)}>{(["abierto", "mitigando", "cerrado"] as const).map((s) => <option key={s} value={s}>{ROTULO_RIESGO[s]}</option>)}</select>}
          </Campo>
        ) : null}
        <Campo id="rg-descripcion" etiqueta="Qué puede pasar y por qué" ayuda="Opcional." error={mostrar("rg-descripcion")}>
          {(p) => <textarea {...p} rows={4} value={val.descripcion} onChange={(e) => poner("descripcion", e.target.value)} />}
        </Campo>
        <Campo id="rg-mitigacion" etiqueta="Qué se hará para evitarlo" ayuda="Opcional. Las acciones concretas, con responsable y fecha, se agregan después en «Riesgos y acciones»." error={mostrar("rg-mitigacion")}>
          {(p) => <textarea {...p} rows={4} value={val.mitigacion} onChange={(e) => poner("mitigacion", e.target.value)} />}
        </Campo>
      </div>
    </PaginaCompleta>
  );
}

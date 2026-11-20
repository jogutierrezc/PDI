/* =============================================================================
   Planeación y Seguimiento · Fase 3B · CREAR o EDITAR un plan, a pantalla completa y por pasos:
     1 Datos (nombre, años, descripción)  ·  2 Oficina dueña y alcance (obligatoria)
     3 Plantilla (columnas obligatorias y opcionales, listas)  ·  4 Pilares (del PDI y/o propios)  ·  5 Revisar
   Cada plan apunta a una oficina. El administrador elige cualquiera y puede crear planes institucionales; el gestor
   solo planes de su oficina. La configuración manda sobre la plantilla de Excel y el importador del plan.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { LoadingBlock } from "../../components/ui/QueryState";
import { useConfigPlan, useCrearPlan, useOficinas, usePlanes, usePlanOps } from "./api";
import { useAct, useCatalogoPdi } from "./actividades/hooks";
import { filtrarCatalogo } from "./actividades/pdi";
import { usePs } from "./contexto";
import { Campo, FormularioPasos, useBorradorLocal, type ErrorCampo } from "./marco/FormularioPasos";
import { PaginaCompleta } from "./marco/PaginaCompleta";
import { ANIO_FIN, ANIO_INI, aniosDe } from "./modelo";
import {
  CLAVES_LISTA, CLAVES_SIEMPRE, LISTAS_PDIFYT, ROTULO_ALCANCE, ROTULO_LISTA, catalogoColumnas, configPorOmision, puedeCrearPlanes, validarDatosPlan,
  type AlcancePlan, type ClaveLista, type ConfigPlan, type DatosPlan, type PilarPlan,
} from "./modeloPlanes";

interface Valores {
  nombre: string;
  anioIni: string;
  anioFin: string;
  descripcion: string;
  oficinaId: string;
  alcance: AlcancePlan;
  /** clave → {incluida, obligatoria} (las de criterios, viabilidades y porcentajes se mueven en bloque). */
  columnas: Record<string, { incluida: boolean; obligatoria: boolean }>;
  listas: Record<ClaveLista, string>;
  pilares: PilarPlan[];
}

const SUELTAS = ["no", "clasif", "nombre", "descripcion", "campus", "pilar", "monto", "prioridad", "resultado", "fuente", "inicio", "fin", "origen", "oficina"];

const aColumnas = (cfg: ConfigPlan): Valores["columnas"] => {
  const out: Valores["columnas"] = {};
  for (const c of catalogoColumnas()) out[c.clave] = { incluida: false, obligatoria: false };
  for (const c of cfg.columnas) out[c.clave] = { incluida: true, obligatoria: c.obligatoria };
  return out;
};

function valoresDe(cfg: ConfigPlan, p?: { nombre: string; anioIni: number; anioFin: number; descripcion: string; oficinaId: string; alcance: AlcancePlan }): Valores {
  return {
    nombre: p?.nombre ?? `Plan ${ANIO_INI}-${ANIO_FIN}`, anioIni: String(p?.anioIni ?? ANIO_INI), anioFin: String(p?.anioFin ?? ANIO_FIN), descripcion: p?.descripcion ?? "", oficinaId: p?.oficinaId ?? "", alcance: p?.alcance ?? "oficina",
    columnas: aColumnas(cfg),
    listas: Object.fromEntries(CLAVES_LISTA.map((k) => [k, (cfg.listas[k] ?? LISTAS_PDIFYT[k]).join("\n")])) as Record<ClaveLista, string>,
    pilares: cfg.pilares.map((x) => ({ ...x })),
  };
}

/** De lo que se ve en pantalla a lo que se envía. */
export function datosDeValores(v: Valores, id?: string): DatosPlan {
  const ini = Number(v.anioIni);
  const fin = Number(v.anioFin);
  const anios = Number.isInteger(ini) && Number.isInteger(fin) && fin >= ini && fin - ini <= 30 ? aniosDe(ini, fin) : aniosDe();
  const cat = catalogoColumnas(anios);
  const columnas = cat.filter((c) => v.columnas[c.clave]?.incluida).map((c) => ({ ...c, obligatoria: (CLAVES_SIEMPRE as readonly string[]).includes(c.clave) || Boolean(v.columnas[c.clave]?.obligatoria) }));
  const listas = Object.fromEntries(CLAVES_LISTA.map((k) => [k, v.listas[k].split("\n").map((x) => x.trim()).filter(Boolean)]));
  return { id, nombre: v.nombre.trim(), anioIni: ini, anioFin: fin, descripcion: v.descripcion, oficinaId: v.oficinaId || null, alcance: v.alcance, config: { columnas, listas, pilares: v.pilares } };
}

export function CrearPlan({ id }: { id?: string }) {
  const { ruta } = usePs();
  const planes = usePlanes();
  const cfgQ = useConfigPlan(id ?? null);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: id ? "Editar plan" : "Crear plan" }];
  const plan = id ? (planes.data ?? []).find((p) => p.id === id) : undefined;
  if (id && (planes.isPending || cfgQ.isPending)) return <PaginaCompleta titulo="Editar plan" migas={migas} regresarA={ruta("resumen")}><LoadingBlock rows={3} label="Cargando el plan" /></PaginaCompleta>;
  if (id && (!plan || !cfgQ.data)) return <PaginaCompleta titulo="Editar plan" migas={migas} regresarA={ruta("resumen")}><p className="ps-aviso"><Icon name="alert" size={16} /> Ese plan no existe o no puede verlo.</p></PaginaCompleta>;
  return <Interior id={id} inicial={id && plan && cfgQ.data ? valoresDe(cfgQ.data, { nombre: plan.nombre, anioIni: plan.anioIni, anioFin: plan.anioFin, descripcion: plan.descripcion, oficinaId: plan.oficina?.id ?? "", alcance: plan.alcance }) : valoresDe(configPorOmision(), undefined)} migas={migas} />;
}

function Interior({ id, inicial, migas }: { id?: string; inicial: Valores; migas: { texto: string; a?: string }[] }) {
  const { nivel, ruta, ir, elegirPlan } = usePs();
  const act = useAct();
  const crear = useCrearPlan();
  const ops = usePlanOps();
  const todas = useOficinas();
  const pdiQ = useCatalogoPdi();
  const mias = act.oficinas.filter((o) => o.poder === "gestor");
  const permitidas = nivel === "admin" ? (todas.data ?? []) : mias.map((o) => ({ id: o.id, nombre: o.nombre }));
  const [v, setV] = useState<Valores>(() => (inicial.oficinaId || nivel === "admin" ? inicial : { ...inicial, oficinaId: mias[0]?.id ?? "" }));
  const [paso, setPaso] = useState("datos");
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [buscar, setBuscar] = useState("");
  const [nuevoPilar, setNuevoPilar] = useState({ codigo: "", nombre: "" });
  const [errPilar, setErrPilar] = useState<string | null>(null);
  const { guardado, descartar } = useBorradorLocal<Valores>(id ? `plan-${id}` : "crear-plan", v, setV);
  const datos = datosDeValores(v, id);
  const errores = validarDatosPlan(datos, { nivel, oficinasPermitidas: permitidas.map((o) => o.id), editando: Boolean(id) });
  const porCampo = new Map<string, string>();
  for (const e of errores) if (!porCampo.has(e.campo)) porCampo.set(e.campo, e.mensaje);
  const mostrar = (c: string) => (tocados[c] ? (porCampo.get(c) ?? null) : null);
  const salir = (c: string) => () => setTocados((t) => ({ ...t, [c]: true }));
  const poner = <K extends keyof Valores>(k: K, x: Valores[K]) => setV((a) => ({ ...a, [k]: x }));
  const validarPaso = (p: "datos" | "oficina" | "plantilla" | "pilares") => (): ErrorCampo[] => {
    const e = errores.filter((x) => x.paso === p);
    setTocados((t) => ({ ...t, ...Object.fromEntries(e.map((x) => [x.campo, true])) }));
    return e.map((x) => ({ campo: x.campo, mensaje: x.mensaje }));
  };
  const puede = id ? nivel === "admin" || mias.some((o) => o.id === inicial.oficinaId) : puedeCrearPlanes(nivel, mias.length > 0);
  const anios = datosAnios(v);
  const catPdi = useMemo(() => filtrarCatalogo(pdiQ.data ?? [], buscar), [pdiQ.data, buscar]);
  const volver = id ? ruta("planes") : ruta("resumen");

  if (!puede) return <PaginaCompleta titulo={id ? "Editar plan" : "Crear plan"} migas={migas} regresarA={ruta("resumen")}><p className="ps-aviso"><Icon name="lock" size={16} /> {id ? "Edita el plan el administrador o el gestor de su oficina." : "Crean planes el administrador de planeación y el gestor de una oficina."}</p></PaginaCompleta>;

  const col = (clave: string) => v.columnas[clave] ?? { incluida: false, obligatoria: false };
  const ponerCol = (claves: string[], cambio: Partial<{ incluida: boolean; obligatoria: boolean }>) => setV((a) => ({ ...a, columnas: { ...a.columnas, ...Object.fromEntries(claves.map((c) => [c, { ...(a.columnas[c] ?? { incluida: false, obligatoria: false }), ...cambio }])) } }));
  const etiqueta = (clave: string) => catalogoColumnas().find((c) => c.clave === clave);
  const pilarDePdi = (pid: string) => v.pilares.find((p) => p.pillarId === pid);
  const alternarPdi = (pid: string, codigo: string, nombre: string) => setV((a) => ({ ...a, pilares: a.pilares.some((p) => p.pillarId === pid) ? a.pilares.filter((p) => p.pillarId !== pid) : [...a.pilares, { codigo, nombre, pillarId: pid, activo: true }] }));
  const agregarPropio = () => {
    const nombre = nuevoPilar.nombre.trim();
    if (nombre.length < 3) return setErrPilar("Escriba el nombre del pilar (al menos 3 letras).");
    if (v.pilares.some((p) => p.nombre.toLowerCase() === nombre.toLowerCase() || (nuevoPilar.codigo.trim() && p.codigo.toLowerCase() === nuevoPilar.codigo.trim().toLowerCase()))) return setErrPilar("Ya hay un pilar con ese nombre o código.");
    setErrPilar(null);
    poner("pilares", [...v.pilares, { codigo: nuevoPilar.codigo.trim(), nombre, pillarId: null, activo: true }]);
    setNuevoPilar({ codigo: "", nombre: "" });
  };
  const oficinaNombre = permitidas.find((o) => o.id === v.oficinaId)?.nombre ?? "—";
  const incluidas = datos.config.columnas;

  return (
    <FormularioPasos
      titulo={id ? "Editar plan" : "Crear plan"}
      subtitulo={id ? "Los cambios en la plantilla valen para la próxima carga; lo ya publicado no cambia." : "Cada plan tiene su oficina dueña, su plantilla y sus pilares. Después se agregan los proyectos uno a uno o se cargan desde Excel."}
      migas={migas}
      regresarA={volver}
      paso={paso}
      onPaso={setPaso}
      etiquetaEnviar={id ? "Guardar los cambios" : "Crear el plan"}
      enviando={crear.isPending || ops.editar.isPending}
      errorEnvio={((crear.error ?? ops.editar.error) as Error | null)?.message ?? null}
      guardado={guardado}
      onEnviar={async () => {
        if (errores.length) { setTocados((t) => ({ ...t, ...Object.fromEntries(errores.map((e) => [e.campo, true])) })); return setPaso(errores[0].paso); }
        if (id) {
          await ops.editar.mutateAsync({ planId: id, datos });
          descartar();
          ir(ruta("planes"), { reemplazar: true });
        } else {
          const nuevo = await crear.mutateAsync(datos);
          elegirPlan(nuevo);
          descartar();
          ir(ruta("proyectos-plan"), { reemplazar: true });
        }
      }}
      pasos={[
        {
          id: "datos",
          titulo: "Datos del plan",
          descripcion: "Cómo se llama, qué años cubre y para qué sirve.",
          validar: validarPaso("datos"),
          contenido: (
            <div className="ps-campos">
              <Campo id="plan-nombre" etiqueta="Nombre del plan" ayuda="Por ejemplo: PDIFyT 2027-2035 o Plan de Tecnología 2027-2029." error={mostrar("plan-nombre")} obligatorio>
                {(p) => <input {...p} type="text" value={v.nombre} onChange={(e) => poner("nombre", e.target.value)} onBlur={salir("plan-nombre")} maxLength={120} autoComplete="off" />}
              </Campo>
              <div className="ps-campos__par">
                <Campo id="plan-anioIni" etiqueta="Año inicial" error={mostrar("plan-anioIni")} obligatorio>
                  {(p) => <input {...p} type="text" inputMode="numeric" value={v.anioIni} onChange={(e) => poner("anioIni", e.target.value)} onBlur={salir("plan-anioIni")} maxLength={4} />}
                </Campo>
                <Campo id="plan-anioFin" etiqueta="Año final" error={mostrar("plan-anioFin")} obligatorio>
                  {(p) => <input {...p} type="text" inputMode="numeric" value={v.anioFin} onChange={(e) => poner("anioFin", e.target.value)} onBlur={salir("plan-anioFin")} maxLength={4} />}
                </Campo>
              </div>
              <Campo id="plan-descripcion" etiqueta="Descripción" ayuda={`Opcional. ${v.descripcion.length}/2000`} error={mostrar("plan-descripcion")}>
                {(p) => <textarea {...p} rows={3} value={v.descripcion} onChange={(e) => poner("descripcion", e.target.value)} onBlur={salir("plan-descripcion")} />}
              </Campo>
            </div>
          ),
        },
        {
          id: "oficina",
          titulo: "Oficina dueña y alcance",
          descripcion: "Todo plan apunta a una oficina: la que responde por él. Las líneas sin oficina propia heredan esta.",
          validar: validarPaso("oficina"),
          contenido: (
            <div className="ps-campos">
              <Campo id="plan-oficina" etiqueta="Oficina dueña del plan" ayuda={nivel === "admin" ? "Elija la oficina responsable. Es obligatoria." : "Solo ve las oficinas en las que usted es gestor."} error={mostrar("plan-oficina")} obligatorio>
                {(p) => (
                  <select {...p} value={v.oficinaId} onChange={(e) => poner("oficinaId", e.target.value)} onBlur={salir("plan-oficina")}>
                    <option value="">Elija una oficina…</option>
                    {[...permitidas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>
                )}
              </Campo>
              <fieldset className="ps-radios" id="plan-alcance">
                <legend>Alcance del plan</legend>
                <label className="ps-opcion ps-opcion--grande ps-opcion--tarjeta"><input type="radio" name="plan-alcance" checked={v.alcance === "oficina"} onChange={() => poner("alcance", "oficina")} /><span><strong>{ROTULO_ALCANCE.oficina}</strong><small>Lo opera la oficina dueña. No necesita aprobación de Planeación; queda en borrador hasta publicar su primera versión.</small></span></label>
                <label className="ps-opcion ps-opcion--grande ps-opcion--tarjeta"><input type="radio" name="plan-alcance" checked={v.alcance === "institucional"} disabled={nivel !== "admin"} onChange={() => poner("alcance", "institucional")} /><span><strong>{ROTULO_ALCANCE.institucional}</strong><small>Reparte líneas entre varias oficinas, como el PDIFyT. {nivel === "admin" ? "" : "Lo crea solo el administrador."}</small></span></label>
              </fieldset>
              {mostrar("plan-alcance") ? <p className="ps-campo__error"><Icon name="alert" size={14} /> {mostrar("plan-alcance")}</p> : null}
            </div>
          ),
        },
        {
          id: "plantilla",
          titulo: "Plantilla de carga",
          descripcion: "Qué columnas lleva el Excel de este plan y cuáles son obligatorias. «N.º» y «Nombre» siempre lo son.",
          validar: validarPaso("plantilla"),
          contenido: (
            <div className="ps-campos" id="plan-columnas" tabIndex={-1}>
              <ul className="ps-cols">
                {SUELTAS.map((k) => {
                  const m = etiqueta(k)!;
                  const fija = (CLAVES_SIEMPRE as readonly string[]).includes(k);
                  const c = col(k);
                  return (
                    <li key={k} data-fuera={!c.incluida || undefined}>
                      <label className="ps-opcion"><input type="checkbox" checked={fija || c.incluida} disabled={fija} onChange={(e) => ponerCol([k], { incluida: e.target.checked, ...(e.target.checked ? {} : { obligatoria: false }) })} /><span><strong>{m.etiqueta}</strong><small>{m.ayuda}</small></span></label>
                      <label className="ps-opcion ps-cols__obl"><input type="checkbox" checked={fija || (c.incluida && c.obligatoria)} disabled={fija || !c.incluida} onChange={(e) => ponerCol([k], { obligatoria: e.target.checked })} /><span>{fija ? "Siempre obligatoria" : "Obligatoria"}</span></label>
                    </li>
                  );
                })}
              </ul>
              <p className="ps-nota"><Icon name="info" size={13} /> Siempre se ofrecen, como opcionales, los criterios de priorización, las viabilidades, el «% de inversión» de cada año y el correo del gestor: no se configuran.</p>
              {mostrar("plan-columnas") ? <p className="ps-campo__error"><Icon name="alert" size={14} /> {mostrar("plan-columnas")}</p> : null}
              <h3>Listas del plan</h3>
              <p className="ps-sub">Una opción por línea. Son las que se ofrecen como lista desplegable en el Excel y las que valida el importador.</p>
              <div className="ps-campos__par">
                {CLAVES_LISTA.map((k) => (
                  <Campo key={k} id={`plan-lista-${k}`} etiqueta={ROTULO_LISTA[k]} ayuda={v.columnas[k]?.incluida ? undefined : "La columna no está en la plantilla: la lista no se usa."} error={mostrar(`plan-lista-${k}`)}>
                    {(p) => <textarea {...p} rows={5} value={v.listas[k]} onChange={(e) => poner("listas", { ...v.listas, [k]: e.target.value })} onBlur={salir(`plan-lista-${k}`)} />}
                  </Campo>
                ))}
              </div>
            </div>
          ),
        },
        {
          id: "pilares",
          titulo: "Pilares del plan",
          descripcion: "Los pilares entre los que se reparte el plan: del PDI institucional y/o propios. Las líneas del Excel se validan contra esta lista.",
          validar: validarPaso("pilares"),
          contenido: (
            <div className="ps-campos" id="plan-pilares" tabIndex={-1}>
              {mostrar("plan-pilares") ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {mostrar("plan-pilares")}</p> : null}
              <section aria-labelledby="pl-pdi-h">
                <h3 id="pl-pdi-h">Del PDI institucional</h3>
                <div className="ps-campo"><label htmlFor="pl-buscar">Buscar un pilar o una línea de acción</label><div className="ps-buscar"><Icon name="search" size={15} /><input id="pl-buscar" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} autoComplete="off" /></div></div>
                {pdiQ.isPending ? <p className="ps-nota">Cargando el catálogo del PDI…</p> : catPdi.length === 0 ? <p className="ps-nota">{buscar ? `Nada coincide con «${buscar}».` : "El catálogo del PDI no está disponible."}</p> : (
                  <ul className="ps-pdi-catalogo">
                    {catPdi.map((p) => (
                      <li key={p.pillarId} className="ps-pdi-pilar ps-pdi-pilar--fila">
                        <label className="ps-opcion ps-pdi-opcion"><input type="checkbox" checked={Boolean(pilarDePdi(p.pillarId))} onChange={() => alternarPdi(p.pillarId, p.codigo, p.nombre)} /><span><strong>{p.codigo}</strong> {p.nombre}<small>{p.areas.length} {p.areas.length === 1 ? "área" : "áreas"} · {p.areas.reduce((s, a) => s + a.lineas.length, 0)} líneas de acción. Las actividades del plan pueden conectarse con ellas.</small></span></label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-labelledby="pl-propio-h" className="ps-enlace-nuevo">
                <h3 id="pl-propio-h">Un pilar propio del plan</h3>
                <div className="ps-campos__par">
                  <div className="ps-campo"><label htmlFor="pl-codigo">Código <span className="ps-opcional">(opcional)</span></label><input id="pl-codigo" type="text" maxLength={10} value={nuevoPilar.codigo} onChange={(e) => setNuevoPilar((s) => ({ ...s, codigo: e.target.value }))} autoComplete="off" /></div>
                  <div className="ps-campo"><label htmlFor="pl-nombre">Nombre</label><input id="pl-nombre" type="text" maxLength={120} value={nuevoPilar.nombre} onChange={(e) => setNuevoPilar((s) => ({ ...s, nombre: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarPropio(); } }} autoComplete="off" aria-invalid={Boolean(errPilar)} aria-describedby={errPilar ? "pl-err" : undefined} /></div>
                </div>
                <div className="ps-botones"><button type="button" className="button-secondary" onClick={agregarPropio}><Icon name="plus" size={14} /> Agregar el pilar</button></div>
                {errPilar ? <p className="ps-campo__error" id="pl-err" role="alert"><Icon name="alert" size={14} /> {errPilar}</p> : null}
              </section>
              <section aria-labelledby="pl-lista-h">
                <h3 id="pl-lista-h">Pilares de este plan ({v.pilares.filter((p) => p.activo).length})</h3>
                {v.pilares.length === 0 ? <p className="ps-nota">Aún no hay pilares. Sin pilares definidos, la columna «Pilar» del Excel queda como texto libre (si es obligatoria, defina al menos uno).</p> : (
                  <ul className="ps-evids">
                    {v.pilares.map((p, i) => (
                      <li key={`${p.pillarId ?? "propio"}-${i}`}>
                        <Icon name={p.pillarId ? "link" : "pen"} size={16} />
                        <span className="ps-evids__n"><strong>{p.codigo ? `${p.codigo}. ` : ""}{p.nombre}</strong><em>{p.pillarId ? "Del PDI institucional" : "Propio del plan"}</em></span>
                        <button type="button" className="button-secondary ps-btn-peq" onClick={() => poner("pilares", v.pilares.filter((_, j) => j !== i))} aria-label={`Quitar ${p.nombre}`}><Icon name="trash" size={13} /> Quitar</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ),
        },
        {
          id: "revisar",
          titulo: id ? "Revisar y guardar" : "Revisar y crear",
          descripcion: "Confirme el plan. Aún no se ha guardado nada.",
          contenido: (
            <>
              {errores.length ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> <span>Hay {errores.length} {errores.length === 1 ? "cosa" : "cosas"} por corregir: {errores.map((e) => <span key={e.campo + e.mensaje}><a href={`#${e.campo}`} onClick={(ev) => { ev.preventDefault(); setPaso(e.paso); setTocados((t) => ({ ...t, [e.campo]: true })); }}>{e.mensaje}</a>{" "}</span>)}</span></p> : null}
              <dl className="ps-ficha">
                <div><dt>Nombre</dt><dd>{v.nombre.trim() || "—"}</dd></div>
                <div><dt>Años</dt><dd>{v.anioIni} a {v.anioFin}</dd></div>
                <div><dt>Oficina dueña</dt><dd>{oficinaNombre} · {ROTULO_ALCANCE[v.alcance].toLowerCase()}</dd></div>
                {v.descripcion.trim() ? <div><dt>Descripción</dt><dd>{v.descripcion.trim()}</dd></div> : null}
                <div><dt>Columnas obligatorias</dt><dd>{incluidas.filter((c) => c.obligatoria).map((c) => c.etiqueta).join(", ") || "—"}</dd></div>
                <div><dt>Columnas opcionales</dt><dd>{incluidas.filter((c) => !c.obligatoria).map((c) => c.etiqueta).join(", ") || "Ninguna"}</dd></div>
                <div><dt>Pilares</dt><dd>{v.pilares.length ? v.pilares.map((p) => `${p.codigo ? `${p.codigo}. ` : ""}${p.nombre}`).join("; ") : "Sin pilares definidos (texto libre)"}</dd></div>
              </dl>
              {!id ? <p className="ps-aviso"><Icon name="info" size={16} /> Al crear el plan pasará a «Proyectos del plan», donde agrega los proyectos uno a uno; si prefiere, también puede cargarlos con la plantilla de Excel.</p> : null}
            </>
          ),
        },
      ]}
    />
  );
}

function datosAnios(v: Valores): number[] {
  const ini = Number(v.anioIni);
  const fin = Number(v.anioFin);
  return Number.isInteger(ini) && Number.isInteger(fin) && fin >= ini && fin - ini <= 30 ? aniosDe(ini, fin) : aniosDe();
}

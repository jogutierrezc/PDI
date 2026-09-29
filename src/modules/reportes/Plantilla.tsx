/* =============================================================================
   Una plantilla SNIES en un periodo: cabecera de estado, contadores, las tres
   formas de captura (Hoja, Formulario, Importar Excel), «Validar plantilla» y
   el envío a HECAA.

   Guardado. El borrador vive en el estado de React y se guarda solo, 1,5 s
   después de la última edición (useGuardarFilas reemplaza todas las filas).
   Se eligió el guardado automático porque la hoja se usa como Excel: nadie
   recuerda pulsar «Guardar» después de pegar un rango. El indicador dice
   «Guardado · hace un momento» o «Cambios sin guardar», y «Validar plantilla»
   guarda antes de validar. Al salir de la pantalla se guarda lo pendiente.

   Errores. Mientras se captura solo se rayan los obligatorios vacíos. Al
   validar corre motor.validarPlantilla (celdas + cruces), se abre el panel y
   desde ahí cada edición se revisa en vivo con motor.validarCeldas; los
   errores de cruce de la última validación se conservan hasta que se edita
   su fila.
   ========================================================================== */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { motor } from "./motor";
import { DOMINIOS } from "./snies/dominios";
import { useCruces, useFilas, useGuardarFilas, useMarcarValidacion, useReabrir, useRegistrarEnvio } from "./store";
import type { CatalogoId, ErrorFila, Estado, Fila, ItemCatalogo, PeriodoCodigo, PlantillaSpec } from "./tipos";
import { Formulario } from "./Formulario";
import { Hoja } from "./Hoja";
import type { ErroresPorFila, IrA } from "./Hoja";
import { Importar } from "./Importar";
import { Marca } from "./Marca";
import { PanelErrores } from "./PanelErrores";
import { barrer } from "./movimiento";
import { ETIQUETA_ESTADO, ORDEN_ESTADOS, armarContexto, claveError, filaVacia, formatoFecha, proximaFecha } from "./util";

type Vista = "hoja" | "formulario" | "importar";
type EstadoGuardado = "limpio" | "sucio" | "guardando" | "error";

export interface PermisosReportes {
  ver: boolean;
  capturar: boolean;
  catalogos: boolean;
  cna: boolean;
}

interface PlantillaProps {
  spec: PlantillaSpec;
  periodo: PeriodoCodigo;
  permisos: PermisosReportes;
  catalogos: Record<CatalogoId, ItemCatalogo[]> | undefined;
}

const RETARDO_GUARDADO = 1500;

export function Plantilla({ spec, periodo, permisos, catalogos }: PlantillaProps) {
  const consulta = useFilas(spec.id, periodo);
  const cruces = useCruces(periodo, catalogos);
  const guardar = useGuardarFilas();
  const marcar = useMarcarValidacion();
  const registrar = useRegistrarEnvio();
  const reabrir = useReabrir();

  const entrega = consulta.data?.entrega ?? null;
  const estadoBase: Estado = entrega?.estado ?? "pendiente";

  const ctx = useMemo(() => armarContexto(periodo, catalogos, DOMINIOS, cruces.data), [periodo, catalogos, cruces.data]);
  const canonizar = useCallback((c: Parameters<typeof motor.canonizar>[0], v: string) => motor.canonizar(c, v, ctx), [ctx]);

  /* ---------- el borrador ---------- */
  const [filas, setFilas] = useState<Fila[] | null>(null);
  useEffect(() => {
    if (filas === null && consulta.data) setFilas(consulta.data.filas);
  }, [consulta.data, filas]);

  const [vista, setVista] = useState<Vista>("hoja");
  const [indiceForm, setIndiceForm] = useState(0);
  const focoHoja = useRef(0);
  const [irA, setIrA] = useState<IrA | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const marcoRef = useRef<HTMLDivElement>(null);

  /* ---------- validación ---------- */
  // Revisado: ya se validó alguna vez (en esta sesión o antes), así que se marcan errores.
  const [revisado, setRevisado] = useState(false);
  const [validadoSesion, setValidadoSesion] = useState(false);
  const [editado, setEditado] = useState(false);
  const [erroresCruce, setErroresCruce] = useState<ErrorFila[]>([]);
  const [panel, setPanel] = useState(false);
  const [animarPanel, setAnimarPanel] = useState(0);
  const [validando, setValidando] = useState(false);

  useEffect(() => {
    if (entrega && (entrega.estado === "errores" || entrega.estado === "validada")) setRevisado(true);
    // Solo al llegar la entrega por primera vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrega?.id]);

  const filasDiferidas = useDeferredValue(filas);
  const erroresVivos = useMemo(
    () => (revisado && filasDiferidas ? motor.validarCeldas(spec, filasDiferidas, ctx) : []),
    [revisado, filasDiferidas, spec, ctx],
  );
  const errores = useMemo(() => {
    const orden = new Map(spec.campos.map((c, k) => [c.codigo, k]));
    return [...erroresVivos, ...erroresCruce].sort((a, b) => a.fila - b.fila || (orden.get(a.campo) ?? 0) - (orden.get(b.campo) ?? 0));
  }, [erroresVivos, erroresCruce, spec]);
  const porFila = useMemo<ErroresPorFila>(() => {
    const m: ErroresPorFila = new Map();
    for (const e of errores) {
      const r = m.get(e.fila) ?? {};
      (r[e.campo] ??= []).push(e.mensaje);
      m.set(e.fila, r);
    }
    return m;
  }, [errores]);

  /* ---------- guardado automático ---------- */
  const [guardado, setGuardado] = useState<EstadoGuardado>("limpio");
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [sucias, setSucias] = useState<Set<string>>(() => new Set());
  const filasRef = useRef(filas);
  filasRef.current = filas;
  const sucioRef = useRef(false);
  const temporizador = useRef<number | undefined>(undefined);
  const enVuelo = useRef<Promise<unknown> | null>(null);
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;

  const guardarAhora = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(temporizador.current);
    if (enVuelo.current) await enVuelo.current;
    if (!sucioRef.current || !filasRef.current) return true;
    const copia = filasRef.current;
    sucioRef.current = false;
    setGuardado("guardando");
    const promesa = guardarRef.current.mutateAsync({ plantilla: spec.id, periodo, filas: copia });
    enVuelo.current = promesa.catch(() => undefined);
    try {
      await promesa;
      setGuardadoEn(new Date());
      setErrorGuardado(null);
      if (!sucioRef.current) {
        setGuardado("limpio");
        setSucias(new Set());
      } else setGuardado("sucio");
      return true;
    } catch (e) {
      sucioRef.current = true;
      setGuardado("error");
      setErrorGuardado(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      enVuelo.current = null;
    }
  }, [spec.id, periodo]);

  const programarGuardado = useCallback(() => {
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => void guardarAhora(), RETARDO_GUARDADO);
  }, [guardarAhora]);

  // Al salir de la pantalla (otra plantilla, otro periodo) se guarda lo pendiente.
  useEffect(() => {
    const antesDeSalir = (e: BeforeUnloadEvent) => {
      if (sucioRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", antesDeSalir);
    return () => {
      window.removeEventListener("beforeunload", antesDeSalir);
      window.clearTimeout(temporizador.current);
      if (sucioRef.current && filasRef.current)
        guardarRef.current.mutate({ plantilla: spec.id, periodo, filas: filasRef.current });
    };
  }, [spec.id, periodo]);

  // «hace un momento» envejece.
  const [, setReloj] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setReloj((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  /* ---------- estado de la plantilla ---------- */
  const hayFilas = Boolean(filas && filas.length);
  const estado: Estado = !hayFilas
    ? estadoBase === "enviada"
      ? "enviada"
      : "pendiente"
    : estadoBase === "enviada" && !editado
      ? "enviada"
      : editado
        ? revisado && errores.length
          ? "errores"
          : "cargada"
        : validadoSesion
          ? errores.length
            ? "errores"
            : "validada"
          : estadoBase === "errores" || estadoBase === "validada"
            ? estadoBase
            : "cargada";
  const soloLectura = !permisos.capturar || estado === "enviada";
  // Errores que la entrega recuerda pero esta sesión no ha visto (cruces de una validación anterior).
  const pendientesDeValidar = !validadoSesion && !editado && estadoBase === "errores" && errores.length === 0;
  const conteoErrores = pendientesDeValidar ? entrega?.errores ?? 0 : errores.length;

  /* ---------- edición ---------- */
  const mutar = useCallback(
    (cambio: (prev: Fila[]) => Fila[], tocadas: { filas?: number[]; celdas?: string[]; estructural?: boolean }) => {
      setFilas((prev) => cambio(prev ?? []));
      sucioRef.current = true;
      setGuardado("sucio");
      setEditado(true);
      if (tocadas.celdas?.length) setSucias((s) => new Set([...s, ...tocadas.celdas!]));
      if (tocadas.estructural) {
        setErroresCruce([]);
        setSucias(new Set());
      } else if (tocadas.filas?.length) {
        const f = new Set(tocadas.filas);
        setErroresCruce((prev) => (prev.some((e) => f.has(e.fila)) ? prev.filter((e) => !f.has(e.fila)) : prev));
      }
      programarGuardado();
    },
    [programarGuardado],
  );

  const onCambiar = useCallback(
    (i: number, campo: string, valor: string) => {
      mutar(
        (prev) => {
          if ((prev[i]?.[campo] ?? "") === valor) return prev;
          const next = prev.slice();
          next[i] = { ...prev[i], [campo]: valor };
          return next;
        },
        { filas: [i], celdas: [`${i}:${campo}`] },
      );
    },
    [mutar],
  );

  const nueva = useCallback(() => filaVacia(spec, periodo, canonizar), [spec, periodo, canonizar]);

  const onPegar = useCallback(
    (r0: number, c0: number, matriz: string[][]) => {
      // Las casillas tocadas se saben desde la matriz, antes de cambiar nada.
      const celdas: string[] = [];
      const tocadas: number[] = [];
      matriz.forEach((valores, a) => {
        tocadas.push(r0 + a);
        valores.forEach((_, b) => {
          const campo = spec.campos[c0 + b];
          if (campo) celdas.push(`${r0 + a}:${campo.codigo}`);
        });
      });
      mutar(
        (prev) => {
          const next = prev.slice();
          matriz.forEach((valores, a) => {
            const i = r0 + a;
            while (next.length <= i) next.push(nueva());
            const fila = { ...next[i] };
            valores.forEach((v, b) => {
              const campo = spec.campos[c0 + b];
              if (!campo) return;
              fila[campo.codigo] = campo.fuente ? canonizar(campo, v.trim()) : v.trim();
            });
            next[i] = fila;
          });
          return next;
        },
        { filas: tocadas, celdas },
      );
      setAviso(`Se pegaron ${matriz.length} ${matriz.length === 1 ? "fila" : "filas"}. Los códigos que traían se cambiaron por nombres.`);
    },
    [mutar, nueva, spec.campos, canonizar],
  );

  const onAgregar = useCallback(() => mutar((prev) => [...prev, nueva()], {}), [mutar, nueva]);

  const onQuitar = useCallback(
    (i: number) => {
      mutar((prev) => prev.filter((_, k) => k !== i), { estructural: true });
      setIndiceForm((n) => Math.max(0, Math.min(n, (filas?.length ?? 1) - 2)));
      setAviso(`Fila ${i + 1} quitada.`);
    },
    [mutar, filas?.length],
  );

  const onImportar = (nuevas: Fila[], reemplazar: boolean) => {
    mutar((prev) => (reemplazar ? nuevas : [...prev, ...nuevas]), { estructural: true });
    setVista("hoja");
    setPanel(false);
    setAviso(`${nuevas.length} ${nuevas.length === 1 ? "fila llevada" : "filas llevadas"} a la hoja. Valide la plantilla cuando esté lista.`);
  };

  const onArreglar = (e: ErrorFila) => {
    if (!e.arreglo) return;
    const cambios = e.arreglo.cambios;
    mutar(
      (prev) => {
        const next = prev.slice();
        const fila: Fila = { ...prev[e.fila] };
        for (const [k, v] of Object.entries(cambios)) if (v !== undefined) fila[k] = v;
        next[e.fila] = fila;
        return next;
      },
      { filas: [e.fila], celdas: Object.keys(cambios).map((k) => `${e.fila}:${k}`) },
    );
  };

  const onIr = (e: ErrorFila) => {
    setVista("hoja");
    setIrA({ fila: e.fila, campo: e.campo, n: Date.now() });
  };

  /* ---------- validar ---------- */
  async function validar() {
    if (!filas || validando) return;
    setValidando(true);
    setVista("hoja");
    setAviso(null);
    try {
      if (permisos.capturar && !(await guardarAhora())) return;
      const barrido = barrer(marcoRef.current);
      const todos = motor.validarPlantilla(spec, filas, ctx);
      const deCeldas = new Set(motor.validarCeldas(spec, filas, ctx).map(claveError));
      await barrido;
      setErroresCruce(todos.filter((e) => !deCeldas.has(claveError(e))));
      setRevisado(true);
      setValidadoSesion(true);
      setEditado(false);
      setPanel(true);
      setAnimarPanel((n) => n + 1);
      if (permisos.capturar) await marcar.mutateAsync({ plantilla: spec.id, periodo, errores: todos.length });
    } catch (e) {
      setAviso(e instanceof Error ? `No se pudo registrar la validación: ${e.message}` : "No se pudo registrar la validación.");
    } finally {
      setValidando(false);
    }
  }

  /* ---------- enviar ---------- */
  const [certificado, setCertificado] = useState<File | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [confirmarReabrir, setConfirmarReabrir] = useState(false);

  async function preparar() {
    if (!filas) return;
    setPreparando(true);
    try {
      await motor.descargarXlsx(spec, periodo, filas, ctx);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo preparar el archivo.");
    } finally {
      setPreparando(false);
    }
  }

  async function registrarEnvio() {
    try {
      await registrar.mutateAsync({ plantilla: spec.id, periodo, certificado });
      setCertificado(null);
      setEditado(false);
      setAviso(`Envío registrado. ${spec.nombre} queda como Enviada a HECAA.`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo registrar el envío.");
    }
  }

  async function reabrirPlantilla() {
    try {
      await reabrir.mutateAsync({ plantilla: spec.id, periodo });
      setConfirmarReabrir(false);
      setValidadoSesion(false);
      setAviso("Plantilla reabierta. Se puede editar y hay que volver a validarla.");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo reabrir.");
    }
  }

  /* ---------- pintura ---------- */
  if (consulta.isPending || (filas === null && !consulta.error)) return <LoadingBlock rows={6} label="Cargando la plantilla" />;
  if (consulta.error) return <ErrorBlock error={consulta.error} onRetry={() => void consulta.refetch()} />;
  if (!filas) return null;

  const hoy = new Date();
  const pf = proximaFecha(spec, periodo, hoy);
  const indicador =
    guardado === "guardando"
      ? "Guardando…"
      : guardado === "sucio"
        ? "Cambios sin guardar"
        : guardado === "error"
          ? "No se pudo guardar"
          : guardadoEn
            ? `Guardado · ${haceCuanto(guardadoEn, hoy)}`
            : entrega
              ? `Guardado · ${haceCuanto(new Date(entrega.updated_at), hoy)}`
              : "Sin cambios";
  const puedePreparar = estado === "validada" || estado === "enviada";
  const idx = ORDEN_ESTADOS.indexOf(estado);

  return (
    <div className="ri-plantilla">
      <div className="ri-state">
        <ol className="ri-steps" aria-label="Estado de la plantilla">
          {ORDEN_ESTADOS.map((k, n) => {
            if (k === "errores" && estado !== "errores") return null;
            const ahora = k === estado;
            const pasado = n < idx && k !== "errores";
            return (
              <li key={k} className={ahora ? "is-now" : pasado ? "is-past" : undefined} data-s={k} aria-current={ahora ? "step" : undefined}>
                <Marca estado={ahora || pasado ? k : "pendiente"} />
                {ETIQUETA_ESTADO[k]}
              </li>
            );
          })}
        </ol>
        <div className="ri-counts" aria-live="polite">
          <div>
            <b className="ri-num">{filas.length}</b>
            {filas.length === 1 ? "fila" : "filas"}
          </div>
          {revisado && (
            <button
              type="button"
              className={`ri-count-btn${conteoErrores ? " is-bad" : ""}`}
              aria-expanded={panel}
              onClick={() => {
                setPanel(true);
                setAnimarPanel((n) => n + 1);
              }}
            >
              <b className="ri-num">{conteoErrores}</b>
              <span>{conteoErrores === 1 ? "error" : "errores"}</span>
            </button>
          )}
          {pf && (
            <div>
              <b className="ri-num">{formatoFecha(pf.fecha, hoy)}</b>
              {pf.tipo === "Definitiva" ? "definitiva" : "primer corte"}
            </div>
          )}
        </div>
        <button
          type="button"
          className="button-primary"
          disabled={validando || filas.length === 0 || estado === "enviada" || cruces.isPending}
          title={cruces.isPending ? "Cargando los datos de las otras plantillas para los cruces" : undefined}
          onClick={() => void validar()}
        >
          <Icon name="check" size={17} />
          {validando ? "Validando…" : "Validar plantilla"}
        </button>
      </div>

      <div className="ri-views-bar">
        <div className="ri-views" role="tablist" aria-label="Forma de captura">
          {(
            [
              ["hoja", "Hoja", "table"],
              ["formulario", "Formulario", "document"],
              ["importar", "Importar Excel", "upload"],
            ] as const
          ).map(([id, rotulo, icono]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`ri-tab-${id}`}
              aria-selected={vista === id}
              aria-controls={`ri-panel-${id}`}
              onClick={() => {
                if (id === "formulario" && vista === "hoja") setIndiceForm(focoHoja.current);
                setVista(id);
              }}
            >
              <Icon name={icono} size={16} />
              {rotulo}
            </button>
          ))}
        </div>
        {permisos.capturar && (
          <span className={`ri-saved${guardado === "sucio" || guardado === "error" ? " is-dirty" : ""}`} role="status">
            {guardado === "error" ? (
              <>
                <Icon name="alert" size={14} />
                <span title={errorGuardado ?? undefined}>{indicador}</span>
                <button type="button" className="ri-link" onClick={() => void guardarAhora()}>
                  Reintentar
                </button>
              </>
            ) : (
              <>
                {guardado === "limpio" && <Icon name="check" size={14} />}
                {indicador}
              </>
            )}
          </span>
        )}
      </div>

      {!permisos.capturar && (
        <p className="admin-readonly ri-inset" role="note">
          <Icon name="lock" size={15} />
          Su rol permite consultar esta plantilla, no modificarla.
        </p>
      )}
      {permisos.capturar && estado === "enviada" && (
        <p className="admin-readonly ri-inset" role="note">
          <Icon name="lock" size={15} />
          Enviada a HECAA: queda en solo lectura hasta que administración la reabra.
        </p>
      )}
      {aviso && (
        <p className="ri-aviso ri-inset" role="status">
          <span>{aviso}</span>
          <button type="button" className="ri-icon-btn" aria-label="Cerrar el aviso" onClick={() => setAviso(null)}>
            <Icon name="close" size={15} />
          </button>
        </p>
      )}

      <div className={`ri-work${panel ? " has-errs" : ""}`}>
        <div className="ri-pane" role="tabpanel" id={`ri-panel-${vista}`} aria-labelledby={`ri-tab-${vista}`}>
          {vista === "hoja" && (
            <Hoja
              spec={spec}
              filas={filas}
              ctx={ctx}
              errores={porFila}
              sucias={sucias}
              soloLectura={soloLectura}
              onCambiar={onCambiar}
              onPegar={onPegar}
              onAgregar={onAgregar}
              onFoco={(i) => (focoHoja.current = i)}
              irA={irA}
              marcoRef={marcoRef}
            />
          )}
          {vista === "formulario" && (
            <Formulario
              spec={spec}
              filas={filas}
              indice={indiceForm}
              setIndice={setIndiceForm}
              ctx={ctx}
              errores={porFila}
              soloLectura={soloLectura}
              onCambiar={onCambiar}
              onNuevo={() => {
                onAgregar();
                setIndiceForm(filas.length);
              }}
              onQuitar={onQuitar}
            />
          )}
          {vista === "importar" && (
            <Importar spec={spec} ctx={ctx} soloLectura={soloLectura} filasActuales={filas.length} onAplicar={onImportar} />
          )}

          {filas.length > 0 && (
            <section className="ri-out" aria-label="Envío a HECAA">
              {estado === "enviada" ? (
                <>
                  <p className="ri-sent">
                    <Marca estado="enviada" />
                    <span>
                      Enviada a HECAA
                      {entrega?.enviada_en ? ` el ${formatoFecha(new Date(entrega.enviada_en), hoy)}` : ""}.
                      {entrega?.certificado_path ? " El certificado quedó guardado." : " Sin certificado adjunto."}
                    </span>
                  </p>
                  <div className="ri-row">
                    <button type="button" className="button-secondary ri-sm" disabled={preparando} onClick={() => void preparar()}>
                      <Icon name="download" size={16} />
                      Descargar otra vez el archivo
                    </button>
                    {permisos.catalogos && !confirmarReabrir && (
                      <button type="button" className="ri-link" onClick={() => setConfirmarReabrir(true)}>
                        Reabrir
                      </button>
                    )}
                  </div>
                  {confirmarReabrir && (
                    <div className="ri-confirm" role="alert">
                      <span>{spec.nombre} vuelve a editarse y deja de figurar como enviada a HECAA.</span>
                      <button type="button" className="button-secondary ri-sm" disabled={reabrir.isPending} onClick={() => void reabrirPlantilla()}>
                        Reabrir plantilla
                      </button>
                      <button type="button" className="ri-link" onClick={() => setConfirmarReabrir(false)}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="ri-row">
                    <button type="button" className="button-secondary ri-sm" disabled={!puedePreparar || preparando} onClick={() => void preparar()}>
                      <Icon name="download" size={16} />
                      {preparando ? "Preparando…" : "Preparar archivo para HECAA"}
                    </button>
                    {!puedePreparar && (
                      <span className="ri-hint">
                        {estado === "cargada" && editado && revisado
                          ? "Sin errores a la vista. Vuelva a validar para confirmar los cruces."
                          : "Se habilita cuando la plantilla queda validada."}
                      </span>
                    )}
                  </div>
                  {puedePreparar && permisos.capturar && (
                    <div className="ri-row">
                      <label className="ri-file">
                        Certificado de envío y validación (PDF)
                        <input type="file" accept=".pdf,application/pdf" onChange={(e) => setCertificado(e.target.files?.[0] ?? null)} />
                      </label>
                      <button type="button" className="button-secondary ri-sm" disabled={registrar.isPending} onClick={() => void registrarEnvio()}>
                        <Icon name="check" size={16} />
                        Registrar envío a HECAA
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        {panel && (
          <PanelErrores
            spec={spec}
            errores={errores}
            animar={animarPanel}
            pendientesDeValidar={pendientesDeValidar}
            soloLectura={soloLectura}
            onCerrar={() => setPanel(false)}
            onIr={onIr}
            onArreglar={onArreglar}
          />
        )}
      </div>
    </div>
  );
}

function haceCuanto(d: Date, hoy: Date) {
  const s = Math.max(0, (hoy.getTime() - d.getTime()) / 1000);
  if (s < 60) return "hace un momento";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `el ${formatoFecha(d, hoy)}`;
}

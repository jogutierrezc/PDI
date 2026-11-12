/* El informe armado para la pantalla: secciones, cifras (guardadas + vivas),
   anexos y el avance de cada sección. Lo usan el editor y la revisión. */

import { useMemo } from "react";
import { congelado, esViva, vistaCifra } from "../cifras-vivas";
import type { CifraVista } from "../cifras-vivas";
import { condicionDe, useAnexos, useCifras, useCifrasVivas, useSecciones } from "../datos";
import { useRequeridos } from "../requeridos";
import { estadoRequeridos, requeridosDePlantilla, requeridosDeSeccion } from "../requeridos-logica";
import type { DatoRequerido } from "../requeridos-logica";
import { aCifraVista, esAccion, esCifra, esCompleto, normalizar } from "../indicadores-manual";
import type { IndicadorManual } from "../indicadores-manual";
import { dimDeConsulta } from "../catalogo";
import { esMetaDelPrograma, filasMetaPrograma } from "../metas-programa";
import { armarSintesis, cifrasDeSintesis } from "../sintesis";
import { estadoMeta } from "../vista/estados";
import type { PlanAccion } from "../plan-decanatura";
import { PLANTILLAS, cifraDef, clavesDe, DIMS } from "../plantillas";
import { clavesInactivas, resolverSecciones } from "../secciones-config";
import { useConfigSecciones } from "../secciones-datos";
import { avanceSeccion } from "../validacion";
import type { Avance, ContextoSeccion } from "../validacion";
import type { CicloRow, ConfigCiclo, ContenidoSeccion, InstanciaRow, RequisitoRow, SeccionDef } from "../types";

export const CONFIG_BASE: ConfigCiclo = { limite_propios: 3, exigir_fuente: true, exigir_pilar: false };
export const configDe = (ciclo: CicloRow | null | undefined): ConfigCiclo => ({ ...CONFIG_BASE, ...(ciclo?.config ?? {}) });

/** `acciones`: las del Plan de Trabajo de la facultad (vacío si la unidad no tiene plan). */
export function useModeloInforme(inst: InstanciaRow, ciclo: CicloRow, requisitos: RequisitoRow[], acciones: PlanAccion[] = []) {
  const secciones = useSecciones(inst.id);
  const lecturaRequeridos = useRequeridos(ciclo.id);
  const requeridos = requeridosDePlantilla(lecturaRequeridos.data?.filas ?? [], inst.plantilla);
  const filas = useCifras(inst.id);
  const frio = congelado(inst.estado);
  const vivas = useCifrasVivas(inst.id, !frio);
  const anexos = useAnexos(inst.id);
  const lecturaEstructura = useConfigSecciones(ciclo.id);
  const filasEstructura = lecturaEstructura.data?.filas;
  /** La plantilla del código con la estructura que Planeación fijó en el ciclo (0276). */
  const plantilla = useMemo(() => ({ ...PLANTILLAS[inst.plantilla], secciones: resolverSecciones(inst.plantilla, filasEstructura ?? []) }), [inst.plantilla, filasEstructura]);
  const inactivas = useMemo(() => clavesInactivas(inst.plantilla, filasEstructura ?? []), [inst.plantilla, filasEstructura]);
  const config = configDe(ciclo);

  const porClave = new Map((filas.data ?? []).map((f) => [f.clave, f]));
  const vista = (clave: string): CifraVista =>
    vistaCifra(clave, { fila: porClave.get(clave), viva: vivas.data?.[clave], estado: inst.estado, condicion: condicionDe(requisitos, inst.plantilla, clave) });

  const dePlantilla = new Set(clavesDe(inst.plantilla));
  /** Las cifras de la plantilla que siguen en el informe: las de las dimensiones de secciones activas. */
  const activasDePlantilla = new Set(plantilla.secciones.flatMap((s) => s.dims ?? []).flatMap((d) => DIMS[d].cifras));
  const extras = (filas.data ?? []).filter((f) => !dePlantilla.has(f.clave) && !esMetaDelPrograma(f.clave) && !inactivas.has(f.seccion_clave ?? ""));
  /** Datos propios: la unidad los escribe (Excel, manual, URL). */
  const propias = extras.filter((f) => !esViva(f.fuente_tipo)).map((f) => ({ fila: f, vista: vista(f.clave) }));
  /** Indicadores que la unidad conectó a UDES en Cifras o al PDI además de los de la plantilla. */
  const agregadas = extras.filter((f) => esViva(f.fuente_tipo)).map((f) => ({ fila: f, vista: vista(f.clave) }));
  const delInforme = [...dePlantilla].filter((k) => activasDePlantilla.has(k)).map(vista);
  /** Una cifra de la plantilla sin indicador conectado no tiene qué mostrar: no entra a la matriz ni al texto. */
  const conectada = (c: CifraVista) => c.valor !== null || c.propia;
  /** Indicadores que la unidad escribió a mano en Resultados por dimensión, por sección. */
  const manualesDe = (clave: string): IndicadorManual[] => normalizar(secciones.data?.find((s) => s.clave === clave)?.contenido?.indicadores);
  const manuales = plantilla.secciones
    .filter((s) => s.tipo === "dim")
    .flatMap((s) => manualesDe(s.clave).filter((i) => esCifra(i) && esCompleto(i)).map((i) => ({ seccion: s.clave, ind: i, vista: aCifraVista(i, s.clave, inst.estado) })));
  /** Acciones (texto) de Resultados y evidencias: fuera de la aritmética; se cuentan y se imprimen aparte. */
  const accionesManuales = plantilla.secciones.filter((s) => s.tipo === "dim").flatMap((s) => manualesDe(s.clave).filter((i) => esAccion(i) && i.nombre.trim()).map((i) => ({ seccion: s.clave, ind: i, completa: esCompleto(i) })));
  /** Las que entran al informe: se pueden citar en el texto y van a la matriz. */
  const incluidas = [...delInforme.filter((c) => c.incluida && conectada(c)), ...agregadas.filter((a) => a.vista.incluida).map((a) => a.vista), ...propias.map((p) => p.vista), ...manuales.map((x) => x.vista)];

  /** Las metas que vienen de los indicadores del programa. */
  const metasPrograma = filasMetaPrograma(filas.data ?? [], vista);

  /** La síntesis: lo reportado en Objetivos y metas y en Resultados por dimensión, junto. */
  const claveMetas = plantilla.secciones.find((s) => s.tipo === "metas")?.clave ?? "";
  const metasAdicionales = secciones.data?.find((s) => s.clave === claveMetas)?.contenido?.metas ?? [];
  const nombreCriterio = (id: string, propio?: string) => (id in DIMS ? DIMS[id as keyof typeof DIMS].titulo : propio || "Otros datos de la unidad");
  const entradasSintesis = [
    ...delInforme.filter((c) => c.incluida && conectada(c)).map((v) => ({ v, id: cifraDef(v.clave)?.dim ?? "otros", propio: "" })),
    ...agregadas.filter((a) => a.vista.incluida).map((a) => ({ v: a.vista, id: dimDeConsulta(a.fila.consulta) ?? "otros", propio: "" })),
    ...propias.map((p) => ({ v: p.vista, id: "otros", propio: "" })),
    ...manuales.map((x) => ({ v: x.vista, id: x.ind.criterio || "otros", propio: x.ind.criterio_nombre ?? "" })),
  ];
  const sintesis = armarSintesis({
    acciones,
    metas: [
      ...metasPrograma.map((f) => estadoMeta(f.alcanzado, f.meta, !f.baja)),
      ...metasAdicionales.filter((x) => x.meta.trim()).map((x) => estadoMeta(x.alcanzado, x.programado, true)),
    ],
    indicadores: entradasSintesis.map((e) => ({ criterio: e.id, criterioNombre: nombreCriterio(e.id, e.propio), vista: e.v })),
    accionesManuales: accionesManuales.map((a) => ({ criterio: a.ind.criterio || "otros", criterioNombre: nombreCriterio(a.ind.criterio || "otros", a.ind.criterio_nombre), completa: a.completa })),
  });
  /** Todo lo que el texto puede citar con [[clave]]: las cifras incluidas y las de la síntesis. */
  const citables = [...incluidas, ...cifrasDeSintesis(sintesis)];

  const contenidoGuardado = (clave: string): ContenidoSeccion => secciones.data?.find((s) => s.clave === clave)?.contenido ?? {};

  /** Los datos que Planeación pide y caen en esta sección dim. */
  const dimsDeSecciones = plantilla.secciones.filter((s) => s.tipo === "dim").map((s) => ({ clave: s.clave, dims: (s.dims ?? []) as string[] }));
  const requeridosDe = (def: SeccionDef): DatoRequerido[] => (def.tipo === "dim" ? requeridosDeSeccion(requeridos, dimsDeSecciones, def.clave) : []);

  const contexto = (def: SeccionDef, contenido?: ContenidoSeccion): ContextoSeccion => ({
    cifras: [
      ...(def.dims ?? []).flatMap((d) => DIMS[d].cifras).map(vista).filter((c) => c.condicion !== "no"),
      ...agregadas.filter((a) => a.fila.seccion_clave === def.clave && a.vista.incluida).map((a) => a.vista),
    ],
    propias: [...propias.filter((p) => p.fila.seccion_clave === def.clave).map((p) => p.vista), ...manuales.filter((x) => x.seccion === def.clave).map((x) => x.vista)],
    // Los indicadores que responden a un dato requerido se cuentan aparte (requeridos), no como «sin cifra».
    manuales:
      def.tipo === "dim"
        ? (() => {
            const pedidas = new Set(requeridosDe(def).map((r) => r.clave));
            const t = (contenido ? normalizar(contenido.indicadores) : manualesDe(def.clave)).filter((i) => esCifra(i) && !(i.requerido && pedidas.has(i.requerido)));
            return { total: t.length, completos: t.filter(esCompleto).length };
          })()
        : undefined,
    acciones:
      def.tipo === "dim"
        ? (() => {
            const t = (contenido ? normalizar(contenido.indicadores) : manualesDe(def.clave)).filter(esAccion);
            return { total: t.length, completas: t.filter(esCompleto).length };
          })()
        : undefined,
    requeridos:
      def.tipo === "dim"
        ? (() => {
            const e = estadoRequeridos((contenido ?? contenidoGuardado(def.clave)).indicadores, requeridosDe(def));
            return { total: e.total, faltan: e.faltan.length };
          })()
        : undefined,
    anexos: anexos.data?.length ?? 0,
    exigirFuente: config.exigir_fuente,
    metasPrograma: metasPrograma.length,
    metasPlan: acciones.length,
  });

  const avance = (def: SeccionDef, contenido?: ContenidoSeccion): Avance => avanceSeccion(def, contenido ?? contenidoGuardado(def.clave), contexto(def, contenido));

  const cargando = secciones.isPending || filas.isPending || anexos.isPending || lecturaEstructura.isPending;
  const error = [secciones.error, filas.error, anexos.error, vivas.error].find((e): e is Error => e instanceof Error) ?? null;

  return { plantilla, inactivas, config, secciones, filas, vivas, anexos, frio, vista, propias, agregadas, conectada, delInforme, incluidas, metasPrograma, manuales, accionesManuales, manualesDe, sintesis, citables, contenidoGuardado, contexto, avance, requeridos, requeridosDe, cargando, error };
}

export type ModeloInforme = ReturnType<typeof useModeloInforme>;

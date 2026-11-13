/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · la pantalla.

   El informe armado como saldrá en papel: portada, contenido, una hoja o más
   por sección, cierre y contraportada, en Carta (por defecto) o A4. Lo que se
   ve sale del mismo modelo que el editor y la revisión (cifras en vivo si el
   informe es borrador, foto si ya se envió).

   Acceso igual al de leer el informe: Planeación ve cualquiera; el resto, el de
   la unidad y la sede donde trabaja (?unidad=<id>&sede=<slug>). Cambiar el diseño exige poder editar el
   informe (puedeEditar, o Planeación); el monograma, el acento, el escudo y el
   contacto son de la unidad y los cambia el Gestor o Planeación. Sin la
   migración 0189 todo se ve y se imprime con valores por defecto; solo
   guardar la personalización exige aplicarla.
   ========================================================================== */

import { AyudaPilo } from "../guia/AyudaPilo";
import { useCallback, useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { actorDe, nombreRol } from "../../rankings/reporte/envio";
import { congelado } from "../cifras-vivas";
import { useDisenoInforme, useGuardarDiseno, useGuardarPerfil, usePerfilUnidad, usePilares, usePlanUnidad, useUrlImagen } from "../datos";
import { puedeEditar } from "../estados";
import type { CicloRow, InstanciaRow, RequisitoRow, UnidadRef } from "../types";
import { Aviso as AvisoError, Cargando, Vacio, fmtFecha, mensajeDe } from "../ui/comunes";
import { EncabezadoObjetivo, useObjetivoInforme } from "../ui/objetivo";
import { useModeloInforme } from "../ui/modelo";
import { unidadesDelLibro, useRecursosDrive } from "./armado";
import { EditorCierre } from "./EditorCierre";
import { EditorPortada } from "./EditorPortada";
import type { Aviso } from "./EditorPortada";
import { Escalado } from "./Escalado";
import type { ContextoHoja } from "./Hoja";
import { Libro, useLibro } from "./Libro";
import { VistaPrevia } from "./VistaPrevia";
import { entradaLibro } from "./entrada";
import type { EntradaLibro } from "./entrada";
import { PAPELES, disenoParaGuardar, evaluarAcento, nombreArchivo, normalizarDiseno, normalizarPerfil, perfilParaGuardar } from "./perfil";
import type { DisenoInforme, Papel, PerfilOficina } from "./perfil";
import { Segmentado } from "./controles";
import "./vista.css";

/* ---------- La unidad y la sede (igual que Mi informe) ---------- */

export function VistaInforme({ ciclo, requisitos }: { ciclo: CicloRow; requisitos: RequisitoRow[] }) {
  const o = useObjetivoInforme(ciclo.id);
  if (o.tipo === "error") return <AvisoError error={o.error} />;
  if (o.tipo === "cargando") return <Cargando texto="Cargando el informe…" />;
  if (o.tipo === "ajena") return <Vacio>Esa unidad no está entre las suyas. Abra el informe de la unidad donde trabaja.</Vacio>;
  if (o.tipo === "sin") {
    return <Vacio>{o.gestiona ? "Elija el informe desde el Tablero del ciclo: ahí están todas las unidades y sedes." : "Su usuario no tiene ninguna unidad asignada en «Dónde trabaja». Pida a Planeación que se la asigne, con su sede, o que su rol le dé el informe de una."}</Vacio>;
  }
  // La unidad con su sede: así sale en la portada y en el PDF.
  const unidad: UnidadRef = { ...o.unidad, name: o.nombre };

  return (
    <div className="vi" style={{ display: "grid", gap: 16 }}>
      <EncabezadoObjetivo o={o} base="/admin/informes-gestion/vista" />
      {o.instancia ? <Visor key={o.instancia.id} inst={o.instancia} ciclo={ciclo} requisitos={requisitos} unidad={unidad} actor={o.actor} /> : <Vacio>Planeación todavía no abre el informe {ciclo.anio} de {unidad.name}.</Vacio>}
    </div>
  );
}

/* ---------- El visor ---------- */

type Modo = "libro" | "portada" | "cierre";

function Visor({ inst, ciclo, requisitos, unidad, actor }: { inst: InstanciaRow; ciclo: CicloRow; requisitos: RequisitoRow[]; unidad: UnidadRef; actor: ReturnType<typeof actorDe> }) {
  const plan = usePlanUnidad(unidad.id, unidad.kind === "facultad");
  const m = useModeloInforme(inst, ciclo, requisitos, plan.data?.acciones ?? []);
  const pilares = usePilares();
  const perfilQ = usePerfilUnidad(unidad.id);
  const disenoQ = useDisenoInforme(inst.id);
  const guardarDiseno = useGuardarDiseno();
  const guardarPerfil = useGuardarPerfil();

  const [modo, setModo] = useState<Modo>("libro");
  const [previa, setPrevia] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Lo que la persona aplicó en esta pantalla y todavía no volvió de la base (o no se pudo guardar).
  const [perfilLocal, setPerfilLocal] = useState<PerfilOficina | null>(null);
  const [disenoLocal, setDisenoLocal] = useState<DisenoInforme | null>(null);

  const puedeDiseno = actor === "planeacion" || puedeEditar(inst.estado, actor);
  const puedePerfil = actor === "planeacion" || actor === "jefe";
  const falta = Boolean(perfilQ.data?.falta || disenoQ.data?.falta);

  const perfilBD = useMemo(() => normalizarPerfil(perfilQ.data?.fila, unidad.name), [perfilQ.data, unidad.name]);
  const disenoBD = useMemo(() => normalizarDiseno(disenoQ.data?.fila, { unidad: unidad.name, anio: ciclo.anio, nombreCiclo: ciclo.nombre }), [disenoQ.data, unidad.name, ciclo.anio, ciclo.nombre]);
  const perfil = perfilLocal ?? perfilBD;
  const diseno = disenoLocal ?? disenoBD;

  /* El contenido, como datos planos: solo cambia cuando cambia de verdad. */
  const firma = JSON.stringify(entradaLibro(m, pilares.data ?? [], String(diseno.portada.anio || ciclo.anio)));
  const entrada = useMemo(() => JSON.parse(firma) as EntradaLibro, [firma]);
  const elementos = useMemo(() => entrada.secciones.flatMap((s) => [...s.drive, ...s.driveLogros, ...s.driveIndicadores]), [entrada]);
  const recursos = useRecursosDrive(elementos);
  const unidades = useMemo(() => unidadesDelLibro(entrada, recursos), [entrada, recursos]);
  const listo = !m.cargando && !m.error && !pilares.isPending && recursos.listo;
  const { medida, resultado, midiendo } = useLibro(unidades, diseno.papel, listo);

  const escudo = useUrlImagen(perfil.logoRuta);
  const foto = useUrlImagen(diseno.portada.fondo === "propia" ? diseno.portada.foto?.ruta : null);
  const ctx = useMemo<ContextoHoja>(
    () => ({
      papel: diseno.papel,
      perfil,
      acento: evaluarAcento(perfil.acento),
      anio: diseno.portada.anio || String(ciclo.anio),
      escudoUrl: perfil.logoRuta ? (escudo.data ?? null) : null,
      marca: congelado(inst.estado) ? { e: "foto", texto: `Foto del ${inst.enviado_en ? fmtFecha(inst.enviado_en) : "envío"}` } : { e: "vivo", texto: "Cifras en vivo" },
    }),
    [diseno.papel, diseno.portada.anio, perfil, ciclo.anio, escudo.data, inst.estado, inst.enviado_en],
  );

  const guardar = useCallback(
    async (nuevoDiseno: DisenoInforme | null, nuevoPerfil: PerfilOficina | null, hecho: string) => {
      setGuardando(true);
      setAviso(null);
      if (nuevoDiseno) setDisenoLocal(nuevoDiseno);
      if (nuevoPerfil) setPerfilLocal(nuevoPerfil);
      try {
        if (nuevoDiseno && puedeDiseno) await guardarDiseno.mutateAsync({ instancia: inst.id, diseno: disenoParaGuardar(nuevoDiseno) });
        if (nuevoPerfil && puedePerfil) await guardarPerfil.mutateAsync({ unidad: unidad.id, perfil: perfilParaGuardar(nuevoPerfil) });
        setAviso({ tono: "ok", texto: hecho });
      } catch (e) {
        setAviso({ tono: "error", texto: `Se aplicó a esta vista, pero no se pudo guardar. ${mensajeDe(e)}` });
      } finally {
        setGuardando(false);
      }
    },
    [guardarDiseno, guardarPerfil, inst.id, puedeDiseno, puedePerfil, unidad.id],
  );

  if (m.error) return <AvisoError error={m.error} />;
  if (m.cargando) return <Cargando texto="Cargando el informe…" />;

  const medidas = PAPELES[diseno.papel];
  const hojas = resultado ? 2 + resultado.paginas.length + 2 : 0;
  const props = { ctx, diseno, fotoUrl: foto.data ?? null, entrada, unidades, resultado };
  const cambiarPapel = (papel: Papel) => {
    const nuevo = { ...diseno, papel };
    setDisenoLocal(nuevo);
    setAviso(null);
    // El papel se guarda por informe, si quien lo cambia puede editarlo; si no, vale solo para esta sesión.
    if (puedeDiseno) void guardar(nuevo, null, "Papel guardado.");
  };

  const folioCierre = 3 + (resultado?.paginas.length ?? 0);
  const vivo = !congelado(inst.estado);

  return (
    <>
      {modo === "libro" && (
        <>
          <div className="vi-bar" data-guia="v-papel">
            <AyudaPilo zona="v-papel" borde />
            <Segmentado
              etiqueta="Papel"
              valor={diseno.papel}
              opciones={[
                { id: "carta", texto: "Carta" },
                { id: "a4", texto: "A4" },
              ]}
              onChange={cambiarPapel}
            />
            <span className="vi-grow" />
            <button type="button" className="inf-btn" onClick={() => { setAviso(null); setModo("portada"); }}>
              Personalizar portada
            </button>
            <button type="button" className="inf-btn" onClick={() => { setAviso(null); setModo("cierre"); }}>
              Personalizar cierre
            </button>
            <button type="button" className="inf-btn inf-btn--pri" disabled={!resultado || midiendo} onClick={() => setPrevia(true)}>
              <Icon name="download" size={16} /> Descargar PDF
            </button>
          </div>

          <p className="vi-aviso" data-tono={vivo ? "vivo" : undefined} role="note">
            {vivo ? (
              <>
                <b>Las cifras están en vivo.</b> Este informe es un borrador: las hojas llevan la marca «Cifras en vivo» y los valores cambian hasta que se envíe.
              </>
            ) : (
              <>
                <b>Foto del {inst.enviado_en ? fmtFecha(inst.enviado_en) : "envío"}.</b> El informe está {inst.estado === "ok" ? "aprobado" : "enviado"}: las cifras son las que se guardaron al enviarlo y ya no cambian.
              </>
            )}{" "}
            Su papel: {nombreRol(actor)}.
          </p>
          {falta && (
            <p className="vi-aviso" data-tono="falta" role="note">
              <b>Falta aplicar la migración 0189.</b> Puede cambiar el papel, personalizar y descargar el PDF, pero esos cambios no se guardan hasta que se aplique.
            </p>
          )}
          {aviso && (
            <p className="vi-aviso" role={aviso.tono === "error" ? "alert" : "status"} data-tono={aviso.tono === "error" ? "falta" : undefined}>
              {aviso.texto}
            </p>
          )}

          <div className="vi-mesa">
            {midiendo && (
              <p className="vi-midiendo" role="status">
                {recursos.listo ? "Armando las páginas…" : "Leyendo las tablas y gráficas de UDrive…"}
              </p>
            )}
            <Escalado anchoMm={medidas.ancho}>
              <Libro {...props} />
            </Escalado>
          </div>
          <p className="inf-muted" style={{ margin: 0 }}>
            {resultado ? `${hojas} hojas ${medidas.nombre}.` : ""} Las páginas se miden con las fuentes y las imágenes cargadas; si cambia el contenido, se vuelven a repartir solas.
          </p>
        </>
      )}

      {modo === "portada" && (
        <EditorPortada
          ctx={ctx}
          portada={diseno.portada}
          perfil={perfil}
          unidadId={unidad.id}
          puedeDiseno={puedeDiseno}
          puedePerfil={puedePerfil}
          guardando={guardando}
          aviso={aviso}
          onCerrar={() => { setAviso(null); setModo("libro"); }}
          onGuardar={(portada, p) => void guardar(puedeDiseno ? { ...diseno, portada } : null, puedePerfil ? p : null, "Portada guardada.")}
        />
      )}

      {modo === "cierre" && (
        <EditorCierre
          ctx={ctx}
          cierre={diseno.cierre}
          contraportada={diseno.contraportada}
          perfil={perfil}
          anio={diseno.portada.anio || String(ciclo.anio)}
          folioCierre={folioCierre}
          puedeDiseno={puedeDiseno}
          puedePerfil={puedePerfil}
          guardando={guardando}
          aviso={aviso}
          onCerrar={() => { setAviso(null); setModo("libro"); }}
          onGuardar={(cierre, contraportada, p) => void guardar(puedeDiseno ? { ...diseno, cierre, contraportada } : null, puedePerfil ? p : null, "Cierre y contraportada guardados.")}
        />
      )}

      {medida}

      {previa && resultado && <VistaPrevia libro={props} nombreArchivo={nombreArchivo(unidad.name, ciclo.anio)} paginas={hojas} exacto={resultado.exacto} onCerrar={() => setPrevia(false)} />}
    </>
  );
}

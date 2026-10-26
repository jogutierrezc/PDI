/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · la pantalla.

   El informe armado como saldrá en papel: portada, contenido, una hoja o más
   por sección, cierre y contraportada, en Carta (por defecto) o A4. Lo que se
   ve sale del mismo modelo que el editor y la revisión (cifras en vivo si el
   informe es borrador, foto si ya se envió).

   Acceso igual al de leer el informe: Planeación ve cualquiera; el resto, los
   de sus unidades (?unidad=<id>). Cambiar el diseño exige poder editar el
   informe (puedeEditar, o Planeación); el monograma, el acento, el escudo y el
   contacto son de la unidad y los cambia el Gestor o Planeación. Sin la
   migración 0189 todo se ve y se imprime con valores por defecto; solo
   guardar la personalización exige aplicarla.
   ========================================================================== */

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { Icon } from "../../../components/ui/Icon";
import { actorDe, nombreRol } from "../../rankings/reporte/envio";
import { congelado } from "../cifras-vivas";
import { useDisenoInforme, useGuardarDiseno, useGuardarPerfil, useInstancias, useMembresiasInforme, usePerfilUnidad, usePilares, usePlanUnidad, useUnidades, useUrlImagen } from "../datos";
import { puedeEditar } from "../estados";
import type { CicloRow, InstanciaRow, RequisitoRow, UnidadRef } from "../types";
import { Aviso as AvisoError, Cargando, Vacio, fmtFecha, mensajeDe } from "../ui/comunes";
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

/* ---------- Elegir la unidad (igual que Mi informe) ---------- */

export function VistaInforme({ ciclo, requisitos }: { ciclo: CicloRow; requisitos: RequisitoRow[] }) {
  const { profile, hasRole } = useAuth();
  const planeacion = hasRole("planeacion");
  const membresias = useMembresiasInforme(profile?.id);
  const unidades = useUnidades();
  const instancias = useInstancias(ciclo.id);
  const [params, setParams] = useSearchParams();

  const error = [membresias.error, unidades.error, instancias.error].find((e): e is Error => e instanceof Error);
  if (error) return <AvisoError error={error} />;
  if (!profile || membresias.isPending || unidades.isPending || instancias.isPending) return <Cargando texto="Cargando el informe…" />;

  const nombres = new Map((unidades.data ?? []).map((u) => [u.id, u]));
  const opciones: UnidadRef[] = planeacion
    ? (instancias.data ?? []).map((i) => nombres.get(i.unit_id)).filter((u): u is UnidadRef => Boolean(u))
    : (membresias.data ?? []).map((m) => nombres.get(m.unidad) ?? { id: m.unidad, name: m.nombre, kind: "", code: null, parent_id: null });
  const unidad = opciones.find((o) => o.id === params.get("unidad")) ?? opciones[0] ?? null;

  if (!unidad) {
    return <Vacio>{planeacion ? "Todavía no se ha abierto ningún informe en este ciclo." : "Su usuario no pertenece a ninguna unidad. Pida a Planeación que lo agregue como Gestor, Contribuyente o Consulta."}</Vacio>;
  }
  const inst = (instancias.data ?? []).find((i) => i.unit_id === unidad.id) ?? null;
  const actor = actorDe(planeacion, membresias.data ?? [], unidad.id);

  return (
    <div className="vi" style={{ display: "grid", gap: 16 }}>
      {opciones.length > 1 && (
        <label className="inf-lab" style={{ maxWidth: 420 }}>
          Unidad
          <select
            className="inf-in"
            value={unidad.id}
            onChange={(e) => {
              const p = new URLSearchParams(params);
              p.set("unidad", e.target.value);
              setParams(p, { replace: true });
            }}
          >
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {inst ? <Visor key={inst.id} inst={inst} ciclo={ciclo} requisitos={requisitos} unidad={unidad} actor={actor} /> : <Vacio>Planeación todavía no abre el informe {ciclo.anio} de {unidad.name}.</Vacio>}
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
  const elementos = useMemo(() => entrada.secciones.flatMap((s) => s.drive), [entrada]);
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
          <div className="vi-bar">
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

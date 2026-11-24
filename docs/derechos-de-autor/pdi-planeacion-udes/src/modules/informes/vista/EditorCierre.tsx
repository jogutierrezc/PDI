/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · editor del cierre y de la
   contraportada.

   El cierre es la última hoja de contenido: mensaje, hasta tres firmas,
   créditos, contacto y el aviso de la fuente de los datos (ese lo fija
   Planeación y siempre se imprime). La contraportada es la hoja de afuera:
   identidad de la oficina, una frase y los datos de contacto. El contacto es
   opcional: lo que se deja vacío no se imprime ni deja huecos.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Escalado } from "./Escalado";
import { PaginaCierre, PaginaContraportada } from "./Hoja";
import type { ContextoHoja } from "./Hoja";
import { CampoTexto, Segmentado } from "./controles";
import type { Aviso } from "./EditorPortada";
import { LIMITES, MAX_FIRMAS, PAPELES } from "./perfil";
import type { CierreDiseno, Contacto, ContraportadaDiseno, Firma, PerfilOficina } from "./perfil";

export interface PropsEditorCierre {
  ctx: ContextoHoja;
  cierre: CierreDiseno;
  contraportada: ContraportadaDiseno;
  perfil: PerfilOficina;
  anio: string;
  /** Número de hoja del cierre en el libro, solo para el pie de la vista previa. */
  folioCierre: number;
  puedeDiseno: boolean;
  puedePerfil: boolean;
  guardando: boolean;
  aviso: Aviso | null;
  onGuardar: (cierre: CierreDiseno, contraportada: ContraportadaDiseno, perfil: PerfilOficina) => void;
  onCerrar: () => void;
}

export function EditorCierre({ ctx, cierre: inicial, contraportada: contraInicial, perfil: perfilInicial, anio, folioCierre, puedeDiseno, puedePerfil, guardando, aviso, onGuardar, onCerrar }: PropsEditorCierre) {
  const [c, setC] = useState(inicial);
  const [b, setB] = useState(contraInicial);
  const [perfil, setPerfil] = useState(perfilInicial);
  useEffect(() => setC(inicial), [inicial]);
  useEffect(() => setB(contraInicial), [contraInicial]);
  useEffect(() => setPerfil(perfilInicial), [perfilInicial]);

  const medidas = PAPELES[ctx.papel];
  const vista = useMemo<ContextoHoja>(() => ({ ...ctx, perfil }), [ctx, perfil]);
  const firma = (i: number): Firma => c.firmas[i] ?? { nombre: "", cargo: "" };
  const fijarFirma = (i: number, f: Partial<Firma>) => {
    const filas = Array.from({ length: MAX_FIRMAS }, (_, k) => (k === i ? { ...firma(k), ...f } : firma(k)));
    setC({ ...c, firmas: filas.filter((x) => x.nombre || x.cargo) });
  };
  const contacto = (k: keyof Contacto, v: string) => setPerfil({ ...perfil, contacto: { ...perfil.contacto, [k]: v } });
  const bloqueado = !puedeDiseno && !puedePerfil;

  return (
    <div className="vi-ed">
      <form className="vi-ed-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        {bloqueado && <p className="vi-bloq">Usted puede ver el cierre, pero no cambiarlo: el informe está enviado o su papel solo permite consultar.</p>}

        <fieldset disabled={!puedeDiseno}>
          <legend>Página de cierre</legend>
          <CampoTexto etiqueta="Mensaje de cierre" valor={c.mensaje} max={LIMITES.mensaje} filas={5} onChange={(v) => setC({ ...c, mensaje: v })} ayuda="Un salto de línea abre un párrafo nuevo." />
        </fieldset>

        <fieldset disabled={!puedeDiseno}>
          <legend>Responsables (hasta tres)</legend>
          {Array.from({ length: MAX_FIRMAS }, (_, i) => (
            <div className="vi-fila" key={i}>
              <input className="inf-in" aria-label={`Nombre, responsable ${i + 1}`} placeholder="Nombre" maxLength={LIMITES.firmaNombre} value={firma(i).nombre} onChange={(e) => fijarFirma(i, { nombre: e.target.value })} />
              <input className="inf-in" aria-label={`Cargo, responsable ${i + 1}`} placeholder="Cargo" maxLength={LIMITES.firmaCargo} value={firma(i).cargo} onChange={(e) => fijarFirma(i, { cargo: e.target.value })} />
            </div>
          ))}
          <span className="vi-hint">Un espacio vacío no se imprime.</span>
        </fieldset>

        <fieldset disabled={!puedeDiseno}>
          <legend>Créditos</legend>
          <CampoTexto etiqueta="Elaboración y revisión" valor={c.creditos} max={LIMITES.creditos} filas={3} onChange={(v) => setC({ ...c, creditos: v })} />
        </fieldset>

        <fieldset disabled={!puedePerfil}>
          <legend>Contacto (opcional)</legend>
          <span className="vi-hint">Sale en el cierre, la contraportada y el pie. Escriba solo lo que la oficina quiere publicar; lo que deje vacío no se imprime.</span>
          <div className="vi-fila">
            <CampoTexto etiqueta="Correo" valor={perfil.contacto.correo} max={LIMITES.correo} onChange={(v) => contacto("correo", v)} />
            <CampoTexto etiqueta="Teléfono" valor={perfil.contacto.telefono} max={LIMITES.telefono} onChange={(v) => contacto("telefono", v)} />
          </div>
          <CampoTexto etiqueta="Dirección" valor={perfil.contacto.direccion} max={LIMITES.direccion} onChange={(v) => contacto("direccion", v)} />
          <CampoTexto etiqueta="Sitio web" valor={perfil.contacto.web} max={LIMITES.web} onChange={(v) => contacto("web", v)} />
          <CampoTexto etiqueta="Línea del pie de página" valor={perfil.pie} max={LIMITES.pie} onChange={(v) => setPerfil({ ...perfil, pie: v })} ayuda="Vacío: el pie lleva el nombre de la unidad." />
          {!puedePerfil && <span className="vi-hint">Solo el Gestor de la unidad o Planeación cambian el contacto y el pie.</span>}
        </fieldset>

        <p className="vi-bloq">El aviso de la fuente de los datos lo redacta Planeación y se imprime siempre.</p>

        <fieldset disabled={!puedeDiseno}>
          <legend>Contraportada</legend>
          <Segmentado
            etiqueta="Tono"
            valor={b.tono}
            deshabilitado={!puedeDiseno}
            opciones={[
              { id: "marino", texto: "Azul marino" },
              { id: "acento", texto: "Color de la oficina" },
              { id: "foto", texto: "Blanco con foto" },
            ]}
            onChange={(v) => setB({ ...b, tono: v })}
          />
          <CampoTexto etiqueta="Frase" valor={b.frase} max={LIMITES.frase} onChange={(v) => setB({ ...b, frase: v })} ayuda="Opcional." />
          <label className="inf-chk" style={{ whiteSpace: "normal" }}>
            <input type="checkbox" checked={b.sedes} onChange={(e) => setB({ ...b, sedes: e.target.checked })} /> Mostrar las sedes de la Universidad
          </label>
        </fieldset>

        <p className="vi-msg" role={aviso?.tono === "error" ? "alert" : "status"} data-error={aviso?.tono === "error"}>
          {aviso?.texto ?? ""}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="inf-btn inf-btn--pri" onClick={() => onGuardar(c, b, perfil)} disabled={guardando || bloqueado}>
            {guardando ? "Guardando…" : "Guardar el cierre"}
          </button>
          <button type="button" className="inf-btn" onClick={onCerrar}>
            Volver al informe
          </button>
        </div>
      </form>

      <div className="vi-ed-stage vi-par" aria-label="Vista previa del cierre y la contraportada">
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <Escalado anchoMm={medidas.ancho} maxPx={300}>
            <PaginaCierre ctx={vista} cierre={c} folio={folioCierre} anioTexto={`Año de gestión ${anio}`} />
          </Escalado>
          <p className="vi-cap2">Página de cierre</p>
        </div>
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <Escalado anchoMm={medidas.ancho} maxPx={300}>
            <PaginaContraportada ctx={vista} contra={b} anio={anio} />
          </Escalado>
          <p className="vi-cap2">Contraportada</p>
        </div>
      </div>
    </div>
  );
}

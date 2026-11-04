/* =============================================================================
   Relaciones · Directorio: todos los contactos en una tabla, con filtros,
   selección, exportación y el formulario de alta y edición. Solo la carga
   inicial anima la tabla (14 filas, escalonadas); filtrar, seleccionar y
   exportar son acciones de uso continuo y no se animan.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { filaParaExportar, PLANTILLAS } from "../../../../supabase/functions/int-contactos/contactos";
import { descargarExportacion } from "../contactos/archivos";
import { useEstructura } from "../datos";
import { entroPor, sinRepetidos } from "../lib/exportar-contactos";
import type { Exportacion } from "../lib/exportar-contactos";
import { nombreCampus } from "../ui/comunes";
import type { Ctx } from "../ui/comunes";
import { useEntrada } from "../ui/movimiento";
import { MenuNuevo } from "../ui/MenuNuevo";
import { FormularioContacto } from "./FormularioContacto";
import { ESTADO_CORREO } from "./datos";
import type { ContactoRel, EstadoCorreo } from "./datos";

const MAX_FILAS = 500;

export function Directorio({
  ctx,
  contactos,
  seleccion,
  onSeleccion,
  onIr,
}: {
  ctx: Ctx;
  contactos: ContactoRel[];
  seleccion: ReadonlySet<string>;
  onSeleccion: (s: ReadonlySet<string>) => void;
  onIr: (p: "envio" | "validar") => void;
}) {
  const navegar = useNavigate();
  const estructura = useEstructura();
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [campus, setCampus] = useState("");
  const [estado, setEstado] = useState("");
  const [formulario, setFormulario] = useState<{ tipo: "academico" | "empleador"; contacto: ContactoRel | null } | null>(null);
  const [aviso, setAviso] = useState("");
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const avisoTimer = useRef<number>();

  const decir = (t: string) => {
    setAviso(t);
    window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(""), 4000);
  };

  const libros = (estructura.data ?? []).filter((l) => l.plantilla_contactos);
  const preparado = libros.length === 2;
  const carpeta = libros[0]?.carpeta_id ?? undefined;

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return contactos.filter(
      (c) =>
        (!tipo || c.tipo === tipo) &&
        (!campus || c.campus_id === campus) &&
        (!estado || (estado === "baja" ? c.baja : c.correo_estado === estado)) &&
        (!t || `${c.nombre} ${c.institucion} ${c.correo} ${c.cargo}`.toLowerCase().includes(t)),
    );
  }, [contactos, q, tipo, campus, estado]);
  const mostradas = visibles.slice(0, MAX_FILAS);
  const verificados = contactos.filter((c) => c.correo_estado === "ok").length;
  const repetidos = contactos.filter((c) => c.duplicado).length;

  // La entrada escalonada es solo de la carga: la clave no cambia al filtrar.
  useEntrada(cuerpo, "tr:nth-child(-n+14)", contactos.length > 0, contactos.length > 0);

  const alternar = (id: string) => {
    const s = new Set(seleccion);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onSeleccion(s);
  };
  const todos = mostradas.length > 0 && mostradas.every((c) => seleccion.has(c.id));
  const alternarTodos = () => {
    const s = new Set(seleccion);
    for (const c of mostradas) {
      if (todos) s.delete(c.id);
      else s.add(c.id);
    }
    onSeleccion(s);
  };

  const exportar = async (formato: "csv" | "xlsx") => {
    const base = seleccion.size ? contactos.filter((c) => seleccion.has(c.id)) : visibles;
    if (!base.length) return decir("No hay contactos para exportar.");
    const dia = new Date().toISOString().slice(0, 10);
    let repetidas = 0;
    for (const p of [PLANTILLAS.academica, PLANTILLAS.empleadores]) {
      const filas = base.filter((c) => c.tipo === p.tipo);
      if (!filas.length) continue;
      const u = sinRepetidos(filas);
      repetidas += u.repetidas;
      const x: Exportacion = { encabezados: p.columnas.map((c) => c.encabezado), filas: u.filas.map((f) => filaParaExportar(p, f.datos)), archivo: `relaciones_${p.archivo}_${dia}`, hoja: p.hoja, anchos: p.columnas.map((c) => c.ancho), repetidas: u.repetidas };
      await descargarExportacion(x, formato);
    }
    decir(`${base.length - repetidas} contactos exportados${repetidas ? ` (${repetidas} con correo repetido quedaron una sola vez)` : ""}.`);
  };

  const opciones = [
    { id: "academico", icono: "user" as const, titulo: "Contacto académico", ayuda: "Docente o investigador de una institución socia" },
    { id: "empleador", icono: "users" as const, titulo: "Contacto de empleador", ayuda: "Persona de una empresa u organización" },
    { id: "excel", icono: "upload" as const, titulo: "Importar desde Excel", ayuda: "Con las plantillas de Rua, en la tabla Contactos", separar: true },
    { id: "enlace", icono: "link" as const, titulo: "Crear enlace público de invitación", ayuda: "Para que otras personas aporten sus contactos" },
  ];
  const elegirNuevo = (id: string) => {
    if (id === "academico" || id === "empleador") setFormulario({ tipo: id, contacto: null });
    else if (id === "excel") navegar(ctx.enlace("tablas", { carpeta }));
    else navegar(ctx.enlace("contactos"));
  };

  const sinContactos = contactos.length === 0;

  return (
    <>
      <div className="rel-bar">
        {preparado ? <MenuNuevo opciones={opciones} onElegir={elegirNuevo} /> : null}
        <button type="button" className="es-btn" disabled={!seleccion.size} onClick={() => onIr("envio")}>
          <Icon name="mail" size={16} />
          Enviar correo
        </button>
        <button type="button" className="es-btn" disabled={!seleccion.size} onClick={() => onIr("validar")}>
          <Icon name="check" size={16} />
          Validar correos
        </button>
        <button
          type="button"
          className="es-btn"
          disabled={!repetidos}
          onClick={() => {
            onSeleccion(new Set(contactos.filter((c) => c.duplicado).map((c) => c.id)));
            decir(`${repetidos} filas seleccionadas con correo repetido. Revíselas y borre o corrija las que sobren en Tablas.`);
          }}
        >
          Marcar duplicados
        </button>
        <span className="rel-sep" aria-hidden="true" />
        <button type="button" className="es-btn" onClick={() => void exportar("csv")}>
          <Icon name="download" size={16} />
          Exportar CSV
        </button>
        <button type="button" className="es-btn" onClick={() => void exportar("xlsx")}>
          <Icon name="download" size={16} />
          Exportar Excel
        </button>
        <span className="rel-grow" />
        <span className="rel-aviso" role="status" aria-live="polite">
          {aviso || (repetidos ? `${repetidos} filas con correo repetido` : "")}
        </span>
      </div>

      <div className="rel-filtros">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, institución o correo" aria-label="Buscar" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          <option value="academico">Académico</option>
          <option value="empleador">Empleador</option>
        </select>
        <select value={campus} onChange={(e) => setCampus(e.target.value)} aria-label="Campus">
          <option value="">Todos los campus</option>
          {ctx.campus.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado del correo">
          <option value="">Cualquier estado de correo</option>
          {(Object.keys(ESTADO_CORREO) as EstadoCorreo[]).map((k) => (
            <option key={k} value={k}>
              {ESTADO_CORREO[k].texto}
            </option>
          ))}
          <option value="baja">Dados de baja</option>
        </select>
      </div>

      <div className="rel-tabla">
        <table>
          <thead>
            <tr>
              <th className="rel-chk">
                <input type="checkbox" checked={todos} onChange={alternarTodos} aria-label="Seleccionar todos los visibles" />
              </th>
              <th>Contacto</th>
              <th>Institución</th>
              <th>País</th>
              <th>Tipo</th>
              <th>Campus</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Origen</th>
              <th>
                <span className="sr-only">Editar</span>
              </th>
            </tr>
          </thead>
          <tbody ref={cuerpo}>
            {mostradas.map((c) => {
              const e = ESTADO_CORREO[c.correo_estado];
              return (
                <tr key={c.id} className={seleccion.has(c.id) ? "is-sel" : undefined} onClick={() => alternar(c.id)}>
                  <td className="rel-chk">
                    <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => alternar(c.id)} onClick={(ev) => ev.stopPropagation()} aria-label={`Seleccionar a ${c.nombre}`} />
                  </td>
                  <td>
                    <b>{c.nombre || "Sin nombre"}</b>
                    <div className="rel-sub">{c.cargo}</div>
                  </td>
                  <td>{c.institucion}</td>
                  <td>{c.pais}</td>
                  <td>{c.tipo === "academico" ? "Académico" : "Empleador"}</td>
                  <td>{nombreCampus(ctx.campus, c.campus_id)}</td>
                  <td className="rel-mono">
                    {c.correo}
                    {c.duplicado ? <span className="rel-pill rel-pill--warn rel-pill--chica">Repetido</span> : null}
                  </td>
                  <td>
                    {c.baja ? <span className="rel-pill rel-pill--bad">Dado de baja</span> : <span className={`rel-pill rel-pill--${e.clase}`}>{e.texto}</span>}
                  </td>
                  <td className="rel-sub">{entroPor({ canal: c.canal, origen: c.origen, archivo: null })}</td>
                  <td>
                    <button type="button" className="rel-icono" aria-label={`Editar a ${c.nombre}`} onClick={(ev) => { ev.stopPropagation(); setFormulario({ tipo: c.tipo, contacto: c }); }}>
                      <Icon name="pen" size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sinContactos ? (
          <div className="rel-vacio">
            <b>Todavía no hay contactos.</b>
            <p>{preparado ? "Cree el primero con «Nuevo», impórtelos desde Excel o comparta el enlace público de invitación." : "Primero se prepara la carpeta «Contactos» en la sección Contactos (un paso de una sola vez)."}</p>
          </div>
        ) : !visibles.length ? (
          <div className="rel-vacio">
            <b>Ningún contacto coincide con los filtros.</b>
            <p>Pruebe con otra búsqueda o quite algún filtro.</p>
          </div>
        ) : null}
      </div>

      <div className="rel-pie">
        <span>
          <b>{visibles.length}</b> de <b>{contactos.length}</b> contactos
          {visibles.length > MAX_FILAS ? ` · se muestran los primeros ${MAX_FILAS}; use los filtros` : ""}
        </span>
        <span>
          <b>{seleccion.size}</b> seleccionados
        </span>
        <span>
          <b>{verificados}</b> con correo verificado
        </span>
      </div>

      {formulario ? <FormularioContacto ctx={ctx} tipo={formulario.tipo} contacto={formulario.contacto} contactos={contactos} onCerrar={(msg) => { setFormulario(null); if (msg) decir(msg); }} /> : null}
    </>
  );
}

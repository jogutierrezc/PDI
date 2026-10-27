/* =============================================================================
   UI GreenMetric · asignación: un indicador, una categoría o varios marcados;
   la persona con su oficina visible, el revisor por categoría y el vencimiento.
   Antes de asignar se ve el correo que recibirá la persona; el correo no sale
   desde aquí: queda en la cola (ugm_notificaciones) y lo envía la función correos.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { useAsignar, useAsignarCategoria, useAsignarMasivo, useAsignarRevisor, useFijarVencimiento, usePersonasBuscar, useRetirarAsignacion } from "../datos";
import { compararQ, etiquetaPregunta } from "../lib/catalogo";
import type { CategoriaId, PersonaBuscada } from "../lib/tipos";
import { Alerta, Campo, Dialogo, Vacio, fechaCorta } from "./comunes";
import { useUgm } from "./contexto";
import { usePlantillaCorreo } from "./lectura";

type Modo = "uno" | "categoria" | "marcados";
interface Elegida { persona: PersonaBuscada; unidad: string | null }

/** Buscar una persona por nombre o correo y, si tiene varias oficinas, elegir en cuál responde. */
function ElegirPersona({ valor, onChange, conOficina = true, id }: { valor: Elegida | null; onChange: (v: Elegida | null) => void; conOficina?: boolean; id: string }) {
  const [texto, setTexto] = useState("");
  const buscar = usePersonasBuscar(texto);
  return (
    <div className="ugm-persona">
      <Campo id={`${id}-buscar`} etiqueta="Persona" ayuda="Escriba al menos dos letras del nombre o del correo.">
        <input id={`${id}-buscar`} className="ugm-input" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre o correo UDES" autoComplete="off" />
      </Campo>
      {texto.trim().length >= 2 && (
        <ul className="ugm-resultados" aria-label="Resultados">
          {buscar.isLoading && <li className="ugm-muted">Buscando…</li>}
          {buscar.data?.length === 0 && <li className="ugm-muted">Nadie coincide con «{texto}».</li>}
          {buscar.data?.map((p) => (
            <li key={p.id}>
              <button type="button" className="ugm-fila-btn" aria-pressed={valor?.persona.id === p.id} onClick={() => onChange({ persona: p, unidad: p.unidades[0]?.id ?? null })}>
                <span className="ugm-avatar" aria-hidden="true">{p.nombre.slice(0, 1)}</span>
                <span>
                  {p.nombre}
                  <small>{p.correo}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {valor && (
        <div className="ugm-elegida">
          <span>
            <b>{valor.persona.nombre}</b>
            <small>{valor.persona.correo}</small>
          </span>
          <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => onChange(null)}>
            Quitar
          </button>
          {conOficina && (
            <Campo id={`${id}-oficina`} etiqueta="Oficina con la que responde" ayuda={valor.persona.unidades.length ? undefined : "Esta persona no está en ninguna oficina; se asigna sin oficina."}>
              <select id={`${id}-oficina`} className="ugm-input ugm-input--sel" value={valor.unidad ?? ""} onChange={(e) => onChange({ ...valor, unidad: e.target.value || null })}>
                {valor.persona.unidades.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre} · {x.rol}
                  </option>
                ))}
                <option value="">Sin oficina</option>
              </select>
            </Campo>
          )}
        </div>
      )}
    </div>
  );
}

export function Asignar() {
  const u = useUgm();
  const asignar = useAsignar();
  const porCat = useAsignarCategoria();
  const masivo = useAsignarMasivo();
  const [modo, setModo] = useState<Modo>(u.seleccion.size ? "marcados" : "uno");
  const [q, setQ] = useState(u.preguntas[0]?.q ?? "");
  const [cat, setCat] = useState<CategoriaId>(u.categorias[0]?.categoria ?? "SI");
  const [quien, setQuien] = useState<Elegida | null>(null);
  const [rol, setRol] = useState<"responsable" | "apoyo">("responsable");
  const [fecha, setFecha] = useState("");
  const [vista, setVista] = useState(false);

  const objetivos = useMemo(() => {
    const ordenadas = [...u.preguntas].sort((a, b) => compararQ(a.q, b.q));
    if (modo === "uno") return ordenadas.filter((p) => p.q === q);
    if (modo === "categoria") return ordenadas.filter((p) => p.categoria === cat);
    return ordenadas.filter((p) => u.seleccion.has(p.q));
  }, [u.preguntas, u.seleccion, modo, q, cat]);

  const puede = !!quien && objetivos.length > 0;

  const confirmar = async () => {
    if (!quien) return;
    const ok = await u.hacer(async () => {
      const f = fecha || null;
      if (modo === "uno") await asignar.mutateAsync({ ciclo: u.ciclo.id, q, usuario: quien.persona.id, unidad: quien.unidad, rol, fechaLimite: f });
      else if (modo === "categoria") await porCat.mutateAsync({ ciclo: u.ciclo.id, categoria: cat, usuario: quien.persona.id, unidad: quien.unidad, fechaLimite: f });
      else await masivo.mutateAsync({ ciclo: u.ciclo.id, items: objetivos.map((p) => ({ q: p.q, usuario_id: quien.persona.id, unidad_id: quien.unidad, rol, fecha_limite: f })) });
    }, `${objetivos.length === 1 ? "Indicador asignado" : `${objetivos.length} indicadores asignados`} a ${quien.persona.nombre}. El aviso queda en la cola de correos.`);
    if (ok) {
      setVista(false);
      setQuien(null);
      if (modo === "marcados") u.setSeleccion(new Set());
    }
  };

  return (
    <div className="ugm-pila">
      <div className="ugm-cols">
        <section className="ugm-sec">
          <h2>1. Qué se asigna</h2>
          <div className="ugm-chips" role="group" aria-label="Alcance">
            {([["uno", "Un indicador"], ["categoria", "Una categoría"], ["marcados", `Los marcados (${u.seleccion.size})`]] as const).map(([k, et]) => (
              <button key={k} type="button" className="ugm-chip" aria-pressed={modo === k} onClick={() => setModo(k)}>
                {et}
              </button>
            ))}
          </div>
          {modo === "uno" && (
            <Campo id="as-q" etiqueta="Indicador">
              <select id="as-q" className="ugm-input ugm-input--sel" value={q} onChange={(e) => setQ(e.target.value)}>
                {[...u.preguntas].sort((a, b) => compararQ(a.q, b.q)).map((p) => (
                  <option key={p.q} value={p.q}>
                    {etiquetaPregunta(p)} · {p.nombre_es.slice(0, 70)}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {modo === "categoria" && (
            <Campo id="as-cat" etiqueta="Categoría" ayuda="Quien responde recibe todas las preguntas de la categoría.">
              <select id="as-cat" className="ugm-input ugm-input--sel" value={cat} onChange={(e) => setCat(e.target.value as CategoriaId)}>
                {u.categorias.map((c) => (
                  <option key={c.categoria} value={c.categoria}>
                    {c.categoria} · {c.nombre_es}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {modo === "marcados" && (u.seleccion.size === 0 ? <Vacio>Marque indicadores en la lista de Indicadores y vuelva aquí.</Vacio> : null)}
          <p className="ugm-muted">
            {objetivos.length === 0 ? "Nada elegido todavía." : objetivos.length === 1 ? `${etiquetaPregunta(objetivos[0])}: ${objetivos[0].nombre_es}` : `${objetivos.length} indicadores`}
          </p>
          <div className="ugm-grid2">
            <Campo id="as-rol" etiqueta="Papel">
              <select id="as-rol" className="ugm-input ugm-input--sel" value={rol} onChange={(e) => setRol(e.target.value as "responsable" | "apoyo")} disabled={modo === "categoria"}>
                <option value="responsable">Responsable</option>
                <option value="apoyo">Apoyo</option>
              </select>
            </Campo>
            <Campo id="as-fecha" etiqueta="Vence" ayuda={u.ciclo.fecha_limite ? `Si se deja vacío, vale la del ciclo: ${fechaCorta(u.ciclo.fecha_limite)}.` : undefined}>
              <input id="as-fecha" className="ugm-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Campo>
          </div>
        </section>

        <section className="ugm-sec">
          <h2>2. A quién</h2>
          <ElegirPersona id="as" valor={quien} onChange={setQuien} />
          <button type="button" className="ugm-btn ugm-btn--pri" disabled={!puede} onClick={() => setVista(true)}>
            <Icon name="mail" size={16} /> Ver el aviso y asignar
          </button>
        </section>
      </div>

      <Revisores />
      <Vigentes />
      {vista && quien && <VistaPrevia quien={quien} objetivos={objetivos} fecha={fecha || u.ciclo.fecha_limite} rol={rol} ocupado={asignar.isPending || porCat.isPending || masivo.isPending} onCerrar={() => setVista(false)} onConfirmar={() => void confirmar()} />}
    </div>
  );
}

const llenar = (t: string, v: Record<string, string>) => t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? "");

function VistaPrevia({ quien, objetivos, fecha, rol, ocupado, onCerrar, onConfirmar }: { quien: Elegida; objetivos: { q: string; indicador: string | null; nombre_es: string; categoria: CategoriaId }[]; fecha: string | null; rol: string; ocupado: boolean; onCerrar: () => void; onConfirmar: () => void }) {
  const u = useUgm();
  const plantilla = usePlantillaCorreo("c-ugm-asignacion");
  const p = objetivos[0];
  const cat = u.categorias.find((c) => c.categoria === p.categoria);
  const vars: Record<string, string> = {
    nombre: quien.persona.nombre.split(" ")[0],
    indicador: objetivos.length > 1 ? `${objetivos.length} indicadores` : etiquetaPregunta(p),
    pregunta: objetivos.length > 1 ? "varias preguntas" : p.nombre_es,
    categoria: cat?.nombre_es ?? p.categoria,
    fecha_limite: fecha ? fechaCorta(fecha) : "sin fecha",
  };
  const t = plantilla.data;
  const asunto = llenar(t?.subject ?? "Le asignaron {{indicador}} del reporte de UI GreenMetric", vars);
  const cuerpo = llenar(
    t?.body ??
      "Planeación le asignó la pregunta {{pregunta}} ({{indicador}}) del reporte de UI GreenMetric, categoría {{categoria}}.\nPuede escribir en español: Pilo propone la traducción al inglés y usted la revisa antes de enviar.\nFecha límite: {{fecha_limite}}.",
    vars,
  );
  return (
    <Dialogo titulo="Aviso de asignación" descripcion="Así lo recibirá la persona. Se encola al asignar; no sale desde esta pantalla." onCerrar={onCerrar} ancho={620}>
      <div className="ugm-correo">
        <dl>
          <dt>Para</dt>
          <dd>
            {quien.persona.nombre} &lt;{quien.persona.correo}&gt;
          </dd>
          <dt>Asunto</dt>
          <dd>{asunto}</dd>
        </dl>
        <div className="ugm-correo__cuerpo">
          <p>{llenar(t?.greeting ?? "Hola, {{nombre}}.", vars)}</p>
          {cuerpo.split("\n").map((l, i) => (
            <p key={i}>{l}</p>
          ))}
          <p>
            <span className="ugm-correo__boton">{t?.button ?? "Abrir el indicador"}</span>
          </p>
        </div>
      </div>
      {objetivos.length > 1 && (
        <p className="ugm-muted ugm-peq">Se manda un aviso por indicador: {objetivos.map((o) => o.q).join(", ")}.</p>
      )}
      <p className="ugm-muted ugm-peq">
        Papel: {rol === "apoyo" ? "apoyo" : "responsable"}. {quien.unidad ? `Oficina: ${u.oficina(quien.unidad) || "elegida"}.` : "Sin oficina."}
      </p>
      <footer className="ugm-dlg__pie">
        <button type="button" className="ugm-btn" onClick={onCerrar}>
          Volver
        </button>
        <button type="button" className="ugm-btn ugm-btn--pri" onClick={onConfirmar} disabled={ocupado}>
          {ocupado ? "Asignando…" : "Confirmar y asignar"}
        </button>
      </footer>
    </Dialogo>
  );
}

function Revisores() {
  const u = useUgm();
  const revisor = useAsignarRevisor();
  const [cat, setCat] = useState<CategoriaId | null>(null);
  const [quien, setQuien] = useState<Elegida | null>(null);
  return (
    <section className="ugm-sec">
      <h2>Revisor por categoría</h2>
      <p className="ugm-muted">Quien revisa aprueba o devuelve todos los indicadores de su categoría.</p>
      <ul className="ugm-lista">
        {u.categorias.map((c) => {
          const r = u.revisorDe(c.categoria);
          return (
            <li key={c.categoria} className="ugm-fila-simple">
              <span>
                <b className="ugm-cod">{c.categoria}</b> {c.nombre_es}
                <small>{r ? u.nombre(r.usuario_id) : "Sin revisor"}</small>
              </span>
              <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => { setCat(c.categoria); setQuien(null); }}>
                {r ? "Cambiar" : "Asignar"}
              </button>
            </li>
          );
        })}
      </ul>
      {cat && (
        <Dialogo titulo={`Revisor de ${cat}`} onCerrar={() => setCat(null)}>
          <ElegirPersona id="rv" valor={quien} onChange={setQuien} conOficina={false} />
          <footer className="ugm-dlg__pie">
            <button type="button" className="ugm-btn" onClick={() => setCat(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="ugm-btn ugm-btn--pri"
              disabled={!quien || revisor.isPending}
              onClick={async () => quien && (await u.hacer(() => revisor.mutateAsync({ ciclo: u.ciclo.id, categoria: cat, usuario: quien.persona.id }), `${quien.persona.nombre} revisa ${cat}.`)) && setCat(null)}
            >
              Asignar revisor
            </button>
          </footer>
        </Dialogo>
      )}
    </section>
  );
}

function Vigentes() {
  const u = useUgm();
  const retirar = useRetirarAsignacion();
  const fijar = useFijarVencimiento();
  const [catV, setCatV] = useState<CategoriaId | "">("");
  const [fechaCat, setFechaCat] = useState("");
  const lista = useMemo(() => u.asignaciones.filter((a) => a.rol !== "revisor" && a.q).sort((a, b) => compararQ(a.q as string, b.q as string)), [u.asignaciones]);
  const [mostrar, setMostrar] = useState(20);
  return (
    <section className="ugm-sec">
      <h2>Asignaciones vigentes</h2>
      <div className="ugm-fila-form">
        <Campo id="vg-cat" etiqueta="Fijar vencimiento a una categoría">
          <select id="vg-cat" className="ugm-input ugm-input--sel" value={catV} onChange={(e) => setCatV(e.target.value as CategoriaId | "")}>
            <option value="">Elegir categoría</option>
            {u.categorias.map((c) => (
              <option key={c.categoria} value={c.categoria}>
                {c.categoria} · {c.nombre_es}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="vg-fecha" etiqueta="Nueva fecha">
          <input id="vg-fecha" className="ugm-input" type="date" value={fechaCat} onChange={(e) => setFechaCat(e.target.value)} />
        </Campo>
        <button type="button" className="ugm-btn" disabled={!catV || !fechaCat || fijar.isPending} onClick={() => void u.hacer(() => fijar.mutateAsync({ ciclo: u.ciclo.id, fecha: fechaCat, categoria: catV }), "Vencimiento actualizado.")}>
          Aplicar
        </button>
      </div>
      {lista.length === 0 ? (
        <Vacio>Todavía no hay asignaciones.</Vacio>
      ) : (
        <>
          <div className="ugm-tabla-marco">
            <table className="ugm-tabla ugm-tabla--lista">
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">Persona</th>
                  <th scope="col">Papel</th>
                  <th scope="col">Vence</th>
                  <th scope="col">
                    <span className="ugm-sr">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, mostrar).map((a) => (
                  <tr key={a.id}>
                    <td data-et="Indicador">
                      {a.q} · {u.pregQ.get(a.q as string)?.nombre_es.slice(0, 60)}
                    </td>
                    <td data-et="Persona">
                      {u.nombre(a.usuario_id)}
                      <small>{u.oficina(a.unidad_id)}</small>
                    </td>
                    <td data-et="Papel">{a.rol === "apoyo" ? "Apoyo" : "Responsable"}</td>
                    <td data-et="Vence">
                      <label className="ugm-sr" htmlFor={`vg-${a.id}`}>
                        Vencimiento de {a.q}
                      </label>
                      <input
                        id={`vg-${a.id}`}
                        className="ugm-input ugm-input--sm"
                        type="date"
                        defaultValue={a.fecha_limite ?? ""}
                        onBlur={(e) => {
                          if (e.target.value && e.target.value !== (a.fecha_limite ?? "")) void u.hacer(() => fijar.mutateAsync({ ciclo: u.ciclo.id, fecha: e.target.value, q: a.q as string }), "Vencimiento actualizado.");
                        }}
                      />
                    </td>
                    <td>
                      <button type="button" className="ugm-btn ugm-btn--sm ugm-btn--peligro" onClick={() => window.confirm(`¿Retirar a ${u.nombre(a.usuario_id)} de ${a.q}?`) && void u.hacer(() => retirar.mutateAsync({ ciclo: u.ciclo.id, asignacion: a.id }), "Asignación retirada.")}>
                        Retirar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mostrar < lista.length && (
            <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => setMostrar(mostrar + 40)}>
              Ver más ({lista.length - mostrar})
            </button>
          )}
        </>
      )}
      <Alerta>Cambiar de responsable es asignar a otra persona: la anterior queda retirada y la nueva recibe el aviso.</Alerta>
    </section>
  );
}

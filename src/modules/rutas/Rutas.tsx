/* =============================================================================
   Intranet · Rutas del bus UDES.

   El mapa de la ruta con las calles de OpenStreetMap, los buses que salen cada
   cierto tiempo desde la UDES, el flujo de estudiantes hacia cada parada, la
   probabilidad de uso y las paradas nuevas que ganarían más cobertura.
   Privado: Planeación y administración (políticas de la migración 0139).

   Esta pantalla elige la ruta, la carga y le entrega el esqueleto al motor
   (motor.ts), que dibuja en un lienzo y maneja su propio panel. También carga
   rutas nuevas: se pegan sus paradas y el trazado por carretera se calcula.
   ========================================================================== */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import { FaltaMigracion, cargarRutas, crearRuta, guardarFlota, guardarPropuesta, leerParadas, listarRutas } from "./datos";
import { ESQUELETO } from "./esqueleto";
import { montarRutas } from "./motor";
import type { DatosRutas, RegresoRuta } from "./tipos";
import "./rutas.css";

const EJEMPLO = "Parqueadero UDES; 7,10524; -73,09510\nCementerio La Colina; 7,10860; -73,09823\nCra 45 con Calle 65; 7,1070; -73,1010";

export function Rutas() {
  const { profile } = useAuth();
  const cliente = useQueryClient();
  const [rutaId, setRutaId] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const lista = useQuery({ queryKey: ["rutas", "lista"], queryFn: listarRutas, staleTime: 60_000, retry: false });
  const datos = useQuery({ queryKey: ["rutas", "datos", rutaId], queryFn: () => cargarRutas(rutaId), staleTime: 5 * 60_000, retry: false });
  const host = useRef<HTMLDivElement>(null);
  const autor = profile?.id ?? null;

  useEffect(() => {
    const el = host.current;
    const d = datos.data;
    if (!el || !d) return;
    el.innerHTML = ESQUELETO;
    const desmontar = montarRutas(el, d, {
      guardarPropuesta: (p) => guardarPropuesta(d.ruta.id, autor, p),
      guardarFlota: async (f) => {
        await guardarFlota(d.ruta.id, f);
        // La copia guardada se actualiza sin recargar: así el mapa no se reinicia.
        cliente.setQueryData<DatosRutas>(["rutas", "datos", rutaId], (antes) =>
          antes ? { ...antes, ruta: { ...antes.ruta, vehiculos: f.vehiculos, intervaloMin: f.intervaloMin, paradaCampusMin: f.paradaCampusMin } } : antes,
        );
      },
    });
    return () => {
      desmontar();
      el.innerHTML = "";
    };
    // El mapa se monta una vez por ruta: los cambios de flota no lo reinician.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.data?.ruta.id, autor]);

  const activa = rutaId ?? datos.data?.ruta.id ?? "";

  return (
    <div className="rutas">
      <div className="rutas-top">
        <Link to="/admin">← Intranet</Link>
        <label className="rutas-sel">
          <span className="sr">Ruta</span>
          <select value={activa} onChange={(e) => setRutaId(e.target.value)} disabled={!lista.data?.length}>
            {(lista.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => setNueva((v) => !v)} aria-expanded={nueva}>
          Cargar ruta nueva
        </button>
      </div>
      {nueva && (
        <FormularioRuta
          onCerrar={() => setNueva(false)}
          onCreada={async (id) => {
            await cliente.invalidateQueries({ queryKey: ["rutas", "lista"] });
            setRutaId(id);
            setNueva(false);
          }}
        />
      )}
      {datos.isLoading && (
        <p className="rutas-estado" role="status">
          Cargando la ruta…
        </p>
      )}
      {datos.isError && (
        <p className="rutas-estado" role="alert">
          {datos.error instanceof FaltaMigracion ? datos.error.message : `No se pudo cargar la ruta: ${datos.error instanceof Error ? datos.error.message : "error desconocido"}`}
        </p>
      )}
      <div className="rutas-root" ref={host} hidden={!datos.data} />
    </div>
  );
}

function FormularioRuta({ onCerrar, onCreada }: { onCerrar: () => void; onCreada: (id: string) => Promise<void> }) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [buses, setBuses] = useState(3);
  const [puestos, setPuestos] = useState(40);
  const [cada, setCada] = useState(15);
  const [parada, setParada] = useState(5);
  const [regreso, setRegreso] = useState<RegresoRuta>("directo");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const leidas = leerParadas(texto);
    if (leidas.error) return setError(leidas.error);
    if (!codigo.trim() || !nombre.trim()) return setError("Falta el código y el nombre de la ruta.");
    setTrabajando(true);
    try {
      const id = await crearRuta({ code: codigo.trim(), name: nombre.trim(), vehiculos: buses, capacidad: puestos, intervaloMin: cada, paradaCampusMin: parada, paradas: leidas.paradas, regreso });
      await onCreada(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la ruta.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <form className="rutas-nueva" onSubmit={enviar} aria-label="Cargar una ruta nueva">
      <h2>Cargar una ruta nueva</h2>
      <div className="rutas-grid">
        <label>
          Código
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={12} placeholder="R2" required />
        </label>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Campus · Piedecuesta" required />
        </label>
        <label>
          Buses
          <input type="number" min={1} max={50} value={buses} onChange={(e) => setBuses(Number(e.target.value))} />
        </label>
        <label>
          Puestos por bus
          <input type="number" min={5} max={200} value={puestos} onChange={(e) => setPuestos(Number(e.target.value))} />
        </label>
        <label>
          Sale uno cada (min)
          <input type="number" min={3} max={120} value={cada} onChange={(e) => setCada(Number(e.target.value))} />
        </label>
        <label>
          Parada en la UDES (min)
          <input type="number" min={0} max={30} value={parada} onChange={(e) => setParada(Number(e.target.value))} />
        </label>
      </div>
      <label>
        Paradas en orden, una por línea. La primera es la UDES.
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} placeholder={EJEMPLO} spellCheck={false} required />
        <small>Formato: nombre; latitud; longitud</small>
      </label>
      <label>
        Cómo regresa el bus a la UDES
        <select value={regreso} onChange={(e) => setRegreso(e.target.value as RegresoRuta)}>
          <option value="directo">Directo, por el camino más corto</option>
          <option value="mismas">Pasando por las mismas paradas, al revés</option>
        </select>
      </label>
      {error && (
        <p className="rutas-error" role="alert">
          {error}
        </p>
      )}
      <div className="rutas-acciones">
        <button type="submit" className="btn btn--pri" disabled={trabajando}>
          {trabajando ? "Calculando el trazado…" : "Crear la ruta"}
        </button>
        <button type="button" className="btn" onClick={onCerrar} disabled={trabajando}>
          Cancelar
        </button>
      </div>
      <p className="rutas-nota">El trazado por carretera lo calcula el motor de rutas con las calles de OpenStreetMap.</p>
    </form>
  );
}

/* Planeación y Seguimiento · Crear plan: asistente de pantalla completa (nombre y años). Sirve de ejemplo de FormularioPasos. */

import { useState } from "react";
import { useCrearPlan } from "./api";
import { usePs } from "./contexto";
import { Campo, FormularioPasos, useBorradorLocal, type ErrorCampo } from "./marco/FormularioPasos";
import { PaginaCompleta } from "./marco/PaginaCompleta";
import { ANIO_FIN, ANIO_INI, puedeAdministrar } from "./modelo";
import { Icon } from "../../components/ui/Icon";

interface Valores {
  nombre: string;
  anioIni: string;
  anioFin: string;
}

export function validarPlan(v: Valores): Record<keyof Valores, string | null> {
  const nombre = v.nombre.trim();
  const ini = Number(v.anioIni);
  const fin = Number(v.anioFin);
  return {
    nombre: nombre.length < 3 ? "Escriba el nombre del plan (al menos 3 letras)." : nombre.length > 120 ? "El nombre admite hasta 120 caracteres." : null,
    anioIni: !Number.isInteger(ini) || ini < 2000 || ini > 2100 ? "Escriba un año entre 2000 y 2100." : null,
    anioFin: !Number.isInteger(fin) || fin < 2000 || fin > 2100 ? "Escriba un año entre 2000 y 2100." : Number.isInteger(ini) && fin < ini ? "El año final no puede ser anterior al inicial." : null,
  };
}

export function CrearPlan() {
  const { nivel, ruta, ir } = usePs();
  const crear = useCrearPlan();
  const [valores, setValores] = useState<Valores>({ nombre: `PDIFyT ${ANIO_INI}-${ANIO_FIN}`, anioIni: String(ANIO_INI), anioFin: String(ANIO_FIN) });
  const [paso, setPaso] = useState("datos");
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const { guardado, descartar } = useBorradorLocal("crear-plan", valores, setValores);
  const errs = validarPlan(valores);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Crear plan" }];
  if (!puedeAdministrar(nivel)) {
    return <PaginaCompleta titulo="Crear plan" migas={migas} regresarA={ruta("resumen")}><p className="ps-aviso"><Icon name="lock" size={16} /> Solo el administrador de planeación crea planes.</p></PaginaCompleta>;
  }
  const poner = (k: keyof Valores) => (e: React.ChangeEvent<HTMLInputElement>) => setValores((v) => ({ ...v, [k]: e.target.value }));
  const salir = (k: string) => () => setTocados((t) => ({ ...t, [k]: true }));
  const mostrar = (k: keyof Valores) => (tocados[k] ? errs[k] : null);
  const validar = (): ErrorCampo[] => {
    setTocados({ nombre: true, anioIni: true, anioFin: true });
    return (Object.keys(errs) as (keyof Valores)[]).flatMap((k) => (errs[k] ? [{ campo: `plan-${k}`, mensaje: errs[k]! }] : []));
  };
  return (
    <FormularioPasos
      titulo="Crear plan"
      subtitulo="Un plan es el contenedor de sus versiones y líneas. Después se carga la planificación desde Excel."
      migas={migas}
      regresarA={ruta("resumen")}
      paso={paso}
      onPaso={setPaso}
      etiquetaEnviar="Crear plan"
      enviando={crear.isPending}
      errorEnvio={crear.error ? (crear.error as Error).message : null}
      guardado={guardado}
      onEnviar={async () => {
        await crear.mutateAsync({ nombre: valores.nombre.trim(), anioIni: Number(valores.anioIni), anioFin: Number(valores.anioFin) });
        descartar();
        ir(ruta("cargar"), { reemplazar: true });
      }}
      pasos={[
        {
          id: "datos",
          titulo: "Datos del plan",
          descripcion: "Cómo se llama y qué años cubre.",
          validar,
          contenido: (
            <div className="ps-campos">
              <Campo id="plan-nombre" etiqueta="Nombre del plan" ayuda="Por ejemplo: PDIFyT 2027-2035." error={mostrar("nombre")} obligatorio>
                {(p) => <input {...p} type="text" value={valores.nombre} onChange={poner("nombre")} onBlur={salir("nombre")} maxLength={120} autoComplete="off" />}
              </Campo>
              <div className="ps-campos__par">
                <Campo id="plan-anioIni" etiqueta="Año inicial" error={mostrar("anioIni")} obligatorio>
                  {(p) => <input {...p} type="text" inputMode="numeric" value={valores.anioIni} onChange={poner("anioIni")} onBlur={salir("anioIni")} maxLength={4} />}
                </Campo>
                <Campo id="plan-anioFin" etiqueta="Año final" error={mostrar("anioFin")} obligatorio>
                  {(p) => <input {...p} type="text" inputMode="numeric" value={valores.anioFin} onChange={poner("anioFin")} onBlur={salir("anioFin")} maxLength={4} />}
                </Campo>
              </div>
            </div>
          ),
        },
        {
          id: "revisar",
          titulo: "Revisar y crear",
          descripcion: "Confirme los datos. Al crear el plan pasará a cargar la planificación.",
          contenido: (
            <dl className="ps-ficha">
              <div><dt>Nombre</dt><dd>{valores.nombre.trim()}</dd></div>
              <div><dt>Años</dt><dd>{valores.anioIni} a {valores.anioFin}</dd></div>
            </dl>
          ),
        },
      ]}
    />
  );
}

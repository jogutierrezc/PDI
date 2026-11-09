/* =============================================================================
   Páginas de error · el límite de errores de React.

   Si una pantalla falla al pintarse, React la desmonta entera y la persona se
   queda con una página en blanco. Este límite la sustituye por la escena 500,
   con un botón para reintentar. No promete que el fallo quedó registrado: solo
   dice lo que pasó y deja a la persona seguir.
   ========================================================================== */

import { Component, Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import type { ErrorInfo, ReactNode } from "react";
import "./errores.css";

// La escena lleva GSAP y el minijuego: solo se descarga si algo falla.
const EscenaError = lazy(() => import("./EscenaError").then((m) => ({ default: m.EscenaError })));

interface Estado {
  fallo: Error | null;
  /** Cambia con cada fallo, para que la escena se pinte de nuevo. */
  clave: number;
}

export class LimiteDeErrores extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { fallo: null, clave: 0 };

  static getDerivedStateFromError(fallo: Error): Partial<Estado> {
    return { fallo };
  }

  componentDidCatch(fallo: Error, info: ErrorInfo) {
    console.error("Una pantalla falló al pintarse:", fallo, info.componentStack);
    this.setState((s) => ({ clave: s.clave + 1 }));
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <main className="err-fondo" id="contenido">
        <Suspense fallback={null}>
        <EscenaError
          key={this.state.clave}
          codigo="500"
          mensaje="Esta pantalla falló al cargarse. Intenta de nuevo; si sigue igual, vuelve al inicio y avísanos."
          acciones={[
            { texto: "Reintentar", tipo: "pri", alPulsar: () => window.location.reload() },
            { texto: "Volver al inicio", a: "/", tipo: "sec" },
          ]}
        />
        </Suspense>
      </main>
    );
  }
}

/** El límite, que se reinicia al cambiar de ruta: un fallo en una pantalla no deja atascado al resto del sitio. */
export function LimitePorRuta({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <LimiteDeErrores key={pathname}>{children}</LimiteDeErrores>;
}

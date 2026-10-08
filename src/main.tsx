import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { AuthProvider } from "./lib/auth";
import { isRetryable } from "./data/errors";
import { reloadOnceOnStalePreload } from "./lib/stale-chunk";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
// La portada no se carga bajo demanda, así que su hoja viaja en el bundle
// principal de todas formas. Se importa aquí, y no desde el componente, porque
// los import de un módulo se evalúan antes que los de esta lista: desde Home
// entraría antes que base.css y `.card` pisaría el relleno de sus bloques.
import "./modules/landing/landing.css";

// Una pestaña que quedó abierta antes de publicar pide archivos que ya no existen: se recarga una vez.
reloadOnceOnStalePreload();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // El PDI se actualiza por cortes, no por segundos: revalidar en cada
      // vuelta a la pestaña solo gastaría peticiones.
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Falta de esquema, permisos o sesión no mejoran reintentando: se
      // muestra el error de inmediato en vez de hacer esperar tres segundos.
      retry: (failureCount, error) => isRetryable(error) && failureCount < 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

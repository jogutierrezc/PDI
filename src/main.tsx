import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { AuthProvider } from "./lib/auth";
import { isRetryable } from "./data/errors";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

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

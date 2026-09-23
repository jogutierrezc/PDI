import { defineConfig } from "vitest/config";

// Pruebas del proyecto. Las de base de datos levantan un Postgres en memoria
// (PGlite) con todas las migraciones: tardan unos segundos por archivo.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});

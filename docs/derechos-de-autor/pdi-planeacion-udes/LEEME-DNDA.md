# Plataforma de Planeación Institucional UDES (PDI)

Aplicación web de la Oficina de Planeación de la Universidad de Santander (UDES).
Reúne planeación, seguimiento y analítica institucional, datos abiertos,
reportes SNIES/CNA, rankings y sostenibilidad, internacionalización y el
asistente de inteligencia artificial «Pilo».

Este paquete contiene el código fuente de la plataforma web. No incluye datos
institucionales, credenciales, dependencias de terceros ni archivos compilados.

## Estructura

| Carpeta / archivo | Contenido |
|---|---|
| `src/` | Código de la aplicación web (React + TypeScript), organizado por módulos en `src/modules/` |
| `api/` | Función de servidor para la voz de Pilo (Vercel) |
| `supabase/migrations/` | Esquema de base de datos PostgreSQL, políticas de seguridad (RLS) y funciones SQL |
| `supabase/functions/` | Funciones de servidor (Edge Functions, Deno) |
| `scripts/` | Utilidades de compilación, verificación y agregación de datos |
| `tests/` | Pruebas automatizadas |
| `pilobot/`, `joomla/` | Integración de Pilo con otros portales |
| `package.json`, `vite.config.ts`, `tsconfig*.json`, `Dockerfile`, `nginx.conf`, `vercel.json` | Configuración y despliegue |
| `DESIGN.md`, `PRODUCT.md`, `README.md` | Documentación de diseño y producto |

## Tecnología

TypeScript, React, Vite, PostgreSQL (Supabase), Deno, Vercel y Coolify.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Público general, aspirantes, estudiantes, familias, egresados, empresas, pares académicos y entes de acreditación que consultan cómo va la Universidad de Santander (UDES) sin iniciar sesión.
- Personal administrativo, directivos y responsables de pilar que capturan, validan y publican información desde la intranet.
- Oficina de Planeación Institucional, dueña del portal: publica cortes, valida cifras y responde por lo que se muestra.

## Product Purpose

Un solo código con dos portales públicos de la Oficina de Planeación Institucional:

1. **Portal PDI** (`/`): seguimiento del Plan de Desarrollo Institucional 2024-2028 — pilares, áreas, líneas, proyectos, indicadores, ODS, facultades y campus.
2. **Datos Abiertos · UDES en Cifras** (`/datos-abiertos`): vista estadística de la universidad con las principales cifras de las actividades académicas y administrativas, organizada en once informes: Poblacional, Permanencia, Visibilidad, Enseñanza, Extensión y Proyección Social, Investigación, Infraestructura Física y Tecnológica, UDES Sostenible, Plan de Desarrollo Institucional, Diversidad, Equidad e Inclusión y Bienestar Institucional. Cada informe reúne cifras que reportan distintas oficinas de la universidad.

El éxito es que cualquier persona encuentre la cifra oficial que busca en segundos, entienda de dónde sale y a qué corte corresponde, y pueda compartir el enlace de ese informe.

## Positioning

Es la fuente institucional: las cifras las publica Planeación a partir de lo que reporta cada oficina, con corte y procedencia, no una recopilación de terceros. El informe PDI de Datos Abiertos se engancha al mismo modelo de avance en cascada que ya calcula el Portal PDI.

## Operating Context

- Consulta pública desde escritorio y móvil; se enlaza desde la web institucional, presentaciones, informes de gestión y procesos de acreditación.
- Datos Abiertos se presenta como portal aparte dentro del mismo código: cabecera y marca propias ("UDES en Cifras"), sin la navegación del PDI.
- Selector de informes: galería en la portada del portal; cada informe tiene su propia ficha enlazable (`/datos-abiertos/<informe>`).
- Las cifras llegan por cortes (año / periodo académico) y pueden desglosarse por sede o campus.

## Capabilities and Constraints

- React 18 + TypeScript + Vite, React Router, TanStack Query, Supabase (Postgres, Auth, Storage, Edge Functions). Autorización en RLS, no en React.
- Tema claro y oscuro con tokens en `src/styles/tokens.css`; ninguna hoja declara color, radio o duración a mano.
- Presupuesto y cifras de dinero están cerrados a `anon`: ninguna página pública puede publicarlos por texto editorial.
- `prefers-reduced-motion` se respeta en todo el portal (el vídeo no se descarga con movimiento reducido).
- **Abierto:** la alimentación de Datos Abiertos (tablas en Supabase, carga por Excel desde la intranet u origen por oficina) se define después del diseño. Mientras tanto las cifras son de ejemplo, viven en un único archivo y se marcan como "Dato ilustrativo".

## Brand Commitments

- Nombre: Universidad de Santander (UDES). Portal estadístico: "UDES en Cifras".
- Activos: `public/logo-udes.svg`, `public/slogan-udes.svg`, vídeo institucional `public/Multimedia1.mp4`, fotografía `assets-source/udesback.png`.
- Voz en español, clara y sobria; explica de dónde sale cada número.

## Evidence on Hand

- Vídeo institucional de la universidad (15 MB, sin recodificar).
- Libros de indicadores por campus y pilar: `Indicadores_Campus_Pilares_UDES_2024.xlsx`, `Indicadores_Campus_Pilares_UDES_2025.xlsx`.
- No hay aún cifras oficiales de población, permanencia, visibilidad, enseñanza, extensión, investigación, infraestructura ni sostenibilidad en el repositorio: no se deben presentar cifras inventadas como reales. Tampoco hay fotografías oficiales por informe; las imágenes provisionales se marcan para reemplazo.

## Product Principles

1. Cada cifra dice su corte y su procedencia; un dato sin fuente no se publica.
2. Un vacío no es un cero: lo no reportado se muestra como no reportado.
3. Ningún dato se comunica solo con color.
4. Todo informe es enlazable y se entiende sin haber visto la portada.
5. Lo editorial y lo que es dato viven separados; el dato sale de una sola fuente.

## Accessibility & Inclusion

Contraste validado en ambos temas, paletas categóricas verificadas para daltonismo, glifo y etiqueta junto a cada color de estado, navegación por teclado, textos alternativos y respeto de `prefers-reduced-motion`.

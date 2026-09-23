---
version: 1
slug: "src-modules-impacto-portal-impacthome-tsx"
primary_target: "src/modules/impacto/portal/ImpactHome.tsx"
related_targets: ["src/modules/impacto/portal/ImpactUnit.tsx","src/modules/impacto/admin/ImpactAdmin.tsx"]
---

# Impacto Institucional

Scope: `/impacto` (portal con sesión: portada, `/impacto/:lente/:slug` por vicerrectoría, facultad, programa o campus, `/impacto/indicador/:codigo`) y la intranet `/admin/impacto` (catálogo, periodo, captura del director, revisión de decanatura y vicerrectoría). Prototipo: datos de la matriz vr7 reales; cifras de programas ILUSTRATIVAS y rotuladas así.
Visitor mode: Read en el portal (entender cómo impacta la universidad y bajar a una unidad en segundos); Operate en la intranet.

Audience and job: directivos, decanos, directores de programa y vicerrectorías con sesión. Portal: elegir una lente (vicerrectoría, facultad, programa, campus), ver su cadena de valor y abrir un indicador con su numerador y denominador. Intranet: capturar, enviar, aprobar, validar.
Proof/content: 106 indicadores de la vr7 (37 · 27 · 42; 93 oficiales, 13 sugeridos), 13 del piloto con ficha técnica; facultades reales de la base; programas y cifras de ejemplo.
Constraints: tokens del proyecto y DESIGN.md sin cambios; ambos temas; reduced-motion; un vacío no es un cero; ningún porcentaje sin numerador y denominador; ningún estado solo con color.

Memorable moment: la cadena de valor dibujada como tres cauces que bajan de Insumos a Impacto; elegir una lente engrosa o adelgaza cada cauce según lo reportado.

Unresolved: modelo de datos en Supabase (fase 1), importador real (fase 2), plantilla Excel (fase 6).

## Direction contract

THESIS: El impacto es una corriente: cada función sustantiva nace en sus insumos y desemboca en su impacto real. Rechaza el tablero de tarjetas KPI con semáforo y el árbol de carpetas por unidad.

OWN-WORLD: El mundo PDI/UDES en Cifras tal cual: papel `--page`, tinta `--brand-navy`, Fraunces para titulares y Manrope para todo lo demás, ambos temas. Lo orgánico entra por la forma, no por color nuevo: cauces SVG de curvas suaves, piedras de indicador con radios asimétricos, bordes de sección ondulados. Tres tintas de función ya existentes: Investigación `--od-series-1`, Enseñanza `--od-series-3`, Extensión `--od-series-2`. Dato ilustrativo siempre rotulado.

STORY: Quien entra ve los tres cauces y su conteo de indicadores, elige una lente (vicerrectoría, facultad, programa o campus), baja a la cadena de valor de esa unidad, abre un indicador y lee su valor como razón de sumas, con numerador, denominador, meta y reparto.

FIRST VIEWPORT: Titular «Impacto Institucional» a la izquierda; a la derecha, el río: cuatro estaciones (Insumos, Procesos, Productos, Impacto real) atravesadas por tres cauces con su número de indicadores; debajo, las cuatro lentes como piedras grandes.

FORM: code-led dentro del mundo establecido; sin ronda de conceptos por decisión expresa del usuario («una sola propuesta, automática, mantener el diseño»). Seed: none (extension of established world).

FINISH: revisión en escritorio y móvil, detector de impeccable sobre los archivos nuevos.

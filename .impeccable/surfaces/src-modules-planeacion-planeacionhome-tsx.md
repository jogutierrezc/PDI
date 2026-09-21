---
version: 1
slug: "src-modules-planeacion-planeacionhome-tsx"
primary_target: "src/modules/planeacion/PlaneacionHome.tsx"
related_targets: ["src/modules/planeacion/SiteSearch.tsx","src/modules/planeacion/PlanLayout.tsx","src/modules/planeacion/TeamPage.tsx","src/modules/planeacion/OfficeGallery.tsx","src/modules/planeacion/TeamCarousel.tsx"]
---

# Portal de Planeación Institucional (portada `/`)

Visitor mode: Persuade/Operate híbrido: una puerta de entrada cuyo éxito es encontrar algo en segundos (buscar o elegir portal).

THESIS: El plano y el buscador. La oficina de Planeación se dibuja como un plano (cuadrícula y trazos finos sobre marino) con los portales como hitos; el buscador transversal es la acción principal y devuelve cifras simplificadas (valor, unidad, año, alcance) agrupadas por portal. Inspirado en planeacion.uniandes.edu.co (portada de portales), sin tarjetas iguales: cada bloque del mosaico lleva la materia de su portal (video y tablero de UDES en Cifras, pilares con avance real, portadas de boletines, áreas de la oficina, temas del Observatorio).

OWN-WORLD: escala azul UDES (marino, azul institucional, azules suaves); el ámbar de UDES en Cifras solo en su bloque; Fraunces en títulos, Manrope en el resto, rotulación condensada en códigos. Marino de marca en claro y noche en oscuro.

Bandas, en orden: encabezado con el plano y el buscador · «Nuestros portales» (mosaico) · la galería de la oficina · «Lo más reciente» · el equipo · el cierre con el propósito y los accesos. Las dos bandas nuevas desaparecen enteras cuando no tienen materia: sin fotografías no hay galería, sin personas no hay equipo. La portada nunca enseña el hueco de algo que nadie cargó.

Carriles: la galería y el equipo se desplazan de verdad (`scroll-snap` sobre `overflow-x`), sin avance automático, y comparten sus mandos —la escala graduada, el contador de posición y las flechas— en `RailControls.tsx`. La ficha de una persona se abre en la página, bajo el carril, no en una ventana emergente.

Constraints: solo lo publicado entra al índice; ninguna cifra de dinero; video solo a la vista, pausable, sin descarga con movimiento reducido; una persona sin nombre no se publica.

Fuente del contenido: desde la migración 0050 lo editorial de esta portada y de `/equipo` —titular, entradilla, encabezado del mosaico, galería, equipo, áreas, accesos, contacto y el titular del cierre— se escribe en la intranet («Página de la oficina», `/admin/pagina`) y llega publicado desde `office_page`. `content.ts` dejó de ser la fuente y quedó como respaldo: es lo que se ve mientras la oficina no haya publicado nada, o si la base no responde. Cambiar un texto aquí ya no exige un despliegue; cambiarlo en el archivo, sí.

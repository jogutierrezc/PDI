# Planeación y Seguimiento (Fase 1)

Módulo de la intranet: planes institucionales (hoy PDIFyT 2027-2035), sus versiones y líneas. Ruta `/admin/planeacion-seguimiento/:seccion?/:id?`; acceso por `ps_nivel` del rol de acceso y la pantalla `planeacion_seguimiento` (contrato de la base: `docs/planeacion-seguimiento/CONTRATO-BD.md`). Se habla de **campus**, nunca de sede.

## Reglas
- **Sin ventanas emergentes.** Detalles, formularios, confirmaciones importantes y asistentes son páginas con ruta propia, botón «Regresar», foco al título y retorno a la posición y los filtros previos. Confirmaciones breves, en línea dentro de la página.
- Lo vacío queda vacío: nada de montos, fechas ni porcentajes inventados. Las cifras de seguimiento (avances) no existen en esta fase.

## Archivos
- Lógica pura (sin DOM, con pruebas): `modelo.ts`, `calculos.ts`, `columnas.ts`, `plantilla.ts` (arma el libro con `informes/ui/excel.ts`), `importar.ts` (`analizarLibro` puro; `leerLibro` con exceljs).
- Datos: `api.ts` (`PsApi`, implementación Supabase e implementación en memoria con los 75 proyectos reales en `datos/`).
- Pantallas: `PlaneacionSeguimiento.tsx` (ruta y secciones), `Resumen`, `Proyectos`, `Cronograma`, `Calidad`, `Versiones` (+ publicar, comparar), `DetalleLinea`, `Roles`, `Vacio`, `CrearPlan`, `Cargar`.
- Demostración **solo en desarrollo**: `/__ps-demo/resumen?estado=ninguno|borrador|publicado&nivel=admin|lector|…` (`Demo.tsx`; la ruta solo existe con `import.meta.env.DEV`).

## Marco reutilizable (`marco/`)
### `PaginaCompleta`
Barra superior fija (Regresar + migas), título (h1, o h2 dentro de la cabecera de la intranet), acciones, contenido y pie fijo en móvil. Navegue entre pantallas del módulo con `ir(ruta)` de `usePs()` (pasa `state.desdeModulo`): así «Regresar» usa el historial y, si se llegó por enlace directo, va a `regresarA`. `useScrollPorRuta()` (ya montado en el cuerpo del módulo) guarda y restaura el desplazamiento.

### `FormularioPasos`
Asistente de pantalla completa. Uso (ver `CrearPlan.tsx`, el ejemplo corto, y `Cargar.tsx`, el largo):
```tsx
<FormularioPasos titulo migas regresarA
  paso={paso} onPaso={setPaso}               // el paso puede vivir en la dirección (?paso=)
  pasos={[{ id, titulo, descripcion, contenido, validar: () => ErrorCampo[], bloqueado, etiquetaSiguiente }]}
  etiquetaEnviar="Crear…" onEnviar={async () => …} enviando errorEnvio guardado />
```
- `validar()` devuelve `{ campo, mensaje }[]`; el `campo` es el `id` del `<Campo id>`. Con errores se muestra el **resumen** (foco ahí) con un enlace por campo que lleva el foco al control.
- `<Campo id etiqueta ayuda error obligatorio>{(props) => <input {...props} />}</Campo>` enlaza etiqueta, ayuda y error con ARIA. Muestre el error en línea al salir del campo (`onBlur`).
- `useBorradorLocal(clave, valor, setValor)` guarda lo escrito en `localStorage` (600 ms) y lo restaura al abrir; devuelve `{ guardado, descartar }` (llame a `descartar()` al enviar). El pie muestra «Guardado hace un momento en este equipo». No guarda archivos.
- El último paso es la revisión: su botón es el envío. La confirmación es la propia página, nunca un diálogo.
- Fases 2 a 4 (actividades, reporte de avance, solicitudes de cambio) reutilizan este marco.

## Pruebas
`npx vitest run src/modules/planeacion-seguimiento`: ida y vuelta plantilla ↔ importador con los 75 reales, casos de error, cálculos, capa en memoria, forma de los datos del contrato y el nivel/rol.

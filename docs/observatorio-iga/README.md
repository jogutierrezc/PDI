# Observatorio de Indicadores de Gestión Académica

Observatorio `gestion-academica` dentro del taller del Observatorio (`src/modules/admin/observatorio/`). Cada vicerrectoría es una línea y cada dimensión, un tema (`iga-estudiantes`, `iga-financiero`…).

## Qué se aplica y se despliega

1. Aplicar `supabase/migrations/0277_obs_guia_datos.sql` (requiere 0049, 0230 y 0231). Crea la guía de datos, el historial, los ajustes del tablero y el observatorio con sus 4 líneas, 8 temas y 46 indicadores, en borrador. No hay funciones de borde nuevas.
2. Desplegar el front.

## Permisos

El rol ya trae el nivel del Observatorio (Ver · Editar · Administrar) y los paneles Captura, Diseño, Tableros y Boletín.

| Nivel | Qué puede |
|---|---|
| Ver | Abrir `/admin/observatorio-ver/gestion-academica`, usar los filtros, abrir las tablas y leer la guía de datos y su historial. No escribe: la pantalla no tiene escrituras y las políticas de la base lo impiden. |
| Editar | Además conecta orígenes (panel Captura) y guarda los filtros del observatorio (panel Tableros). Pide capacidad de Planeación. |
| Administrar | Además publica, archiva y asigna responsables (panel Observatorios). |

## Cargar los datos

Los libros semilla están en `docs/observatorio-iga/libros/` (CSV con `programa, sede, facultad, nivel, periodo` y los valores). Salen de los archivos de `Indicadores VAF 2024`; los programas se unen por nombre y sede, sin código SNIES.

| Archivo | Tema | Indicador (clave) |
|---|---|---|
| `estudiantes-0-desercion.csv` | iga-estudiantes | estudiantes.0 |
| `estudiantes-1-saber-pro.csv` | iga-estudiantes | estudiantes.1 |
| `estudiantes-3-graduados.csv` | iga-estudiantes | estudiantes.3 |
| `profesores-1-tipologia.csv` | iga-profesores | profesores.1 |
| `gestion-0-registro-de-notas.csv` | iga-gestion | gestion.0 |
| `financiero-0-punto-de-equilibrio.csv` | iga-financiero | financiero.0 |
| `financiero-1-viabilidad-porcentajes.csv` | iga-financiero | financiero.1 |
| `financiero-2-ingresos-costos-excedentes.csv` | iga-financiero | financiero.2 |

1. Taller → **Captura de datos** → el tema → **Importar datos** → elegir el CSV. Guardar la tabla como viene (cada fila ya es un programa, no una persona).
2. En la **Guía de datos** del mismo tema, abrir el indicador → **Conectar** → *Tabla del taller* → elegir la tabla.
3. En **Diseño visual**, armar los visores: líneas por periodo, barras por programa o sede, mapa de calor facultad × periodo, cascada de resultados, dispersión (ingresos frente a excedente neto) y tabla.
4. En **Tableros**, ordenar secciones, elegir los filtros que se ofrecen y revisar los pendientes. Publicar la tabla y el tema, y luego el observatorio.

## Filtros por la estructura

El visor filtra cada tabla por sus columnas `programa`, `sede`, `facultad` y `nivel` (Posgrado = especialización, maestría y doctorado). Una tabla sin la columna de un filtro no la cambia y la pantalla lo avisa. Los filtros viven en la dirección (`?vr=pos&fac=…&sede=…&prog=…`), así que se pueden compartir.

## Pendiente o por decidir

- Movilidad internacional y nacional, ingresos por origen y rendimientos financieros no tienen archivo: quedan «Sin archivo» o «Por adaptar» en la guía.
- El clic en una cifra para abrir un panel de detalle (como en el prototipo) no está: hoy se lee en la tabla de datos de cada página.
- Los libros de UDrive se pueden elegir como origen, pero el visor lee las tablas del taller; la lectura directa de libros de UDrive queda para una fase siguiente.
- El periodo no es un filtro global: cada gráfica trae sus periodos.

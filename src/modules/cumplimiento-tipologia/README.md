# Cumplimiento de Tipología

Opción de la carpeta «Gestión Master» del lanzador. Es el módulo de Inteligencia de Negocios de Roomy (tipología profesoral) llevado a PDI y alimentado **solo por el Warehouse UDES**: por programa y sede (Bucaramanga, Valledupar, Cúcuta, Bogotá), las horas de cada profesor, si cumple la tipología de su contrato, sus preventivas y recomendaciones, el contrato, el estado en Master, la distribución semanal, el desglose de la tipología y qué perfil conviene planear. Ruta: `/admin/cumplimiento-tipologia` (`?periodo=2026b&sede=buc&programa=…&vista=sedes|corte|programas`). La maqueta aprobada es `cumplimiento-tipologia-udes.html` (artefacto publicado); el diseño, la jerarquía y los textos son los de la maqueta, no sus datos ni sus umbrales.

## Qué hace y qué no
- **Lee** del Warehouse, por las funciones `ct_insumos`: la nómina docente (`ms_nom`), el estado de aprobación en Master (`ms_aprob`, nuevo), los horarios por departamento (`ms_hordep`) y los matriculados de posgrado por grupo (`ms_posg`).
- **Escribe** en el portal las tablas `ct_*` del corte: resumen por profesor, observaciones, grupos sin matrícula, observaciones para Master y bitácora. Se lee desde ellas; **el navegador no recalcula**.
- **No llama a Master.** Si falta un insumo se carga en el Warehouse. La única lectura en vivo es la de los nombres (ver «Datos personales»), que reutiliza la acción `docentes` de la función `warehouse`.
- **No escribe en Master.** La observación de 255 caracteres se copia a mano.

## Cobertura de datos (qué insumo del motor de Roomy cubre qué conjunto)
| Insumo de Roomy | Conjunto del Warehouse | Columnas que conserva su política | Estado |
| --- | --- | --- | --- |
| Nómina de pregrado y de posgrado (`nomina`, `nomina-postgrado`) | `ms_nom` (nómina consolidada nueva, `paysheet/consolidated`, una sola para las dos) | `cedula` (seudónimo), `contrato`, `duracion`, `categoria`, `codigo`, `asignatura_actividad`, `tipo_de_actividad`, `grp`, `dpto_carrera`, `horas`, `horas_semestre`, `semanas`, `fecha_inicio`, `fecha_fin`, `mat`, `ult_modificacion` | Cubierto. Se descartan nombre y observaciones. Ver nota de la nómina |
| Catálogo de actividades (`actividades`) | `ms_actdir` | código, nombre, tipo, instrucciones, vinculación | Cubierto, pero **el motor no lo usa** (Roomy solo lo usaba para vigilar prefijos desconocidos; el motor clasifica por prefijo) |
| Estado de aprobación (`profesor_detalle`, banderas aprobado / preaprobado / por confirmar) | **`ms_aprob` (nuevo, 0259)** | `identification` (seudónimo), `status`, `approved`, `pre_approved`, `to_confirm`, `manual_preapproval`, `is_active`, `origen` | **Añadido, sin verificar** (`verificado: false`): no hay HAR de esa petición |
| Distribución semanal (la maqueta la pide; Roomy no la tenía) | `ms_hordep` | `grupos`, `dia_sem`, `hora_inic`, `hora_fin`, `programa`, `id_docente` (seudónimo); se descarta `nombre_docente` | Cubierto (HAR de «Reporte General de Horarios») |
| Nivel de cada actividad (pregrado/posgrado) | `ms_posg` (apoyo) | todas las columnas con `docente` como seudónimo (`codigo`, `grupo`…) | Cubierto; ver nota de la nómina |
| Matrícula académica de pregrado (`estudiantes`) | `dv_matric`, `ms_activos` | `codigo` y ficha sin datos personales | Cubierto, **el módulo no lo usa**: en Roomy solo alimenta `bi_estudiante_programa` (primíparos por programa), fuera de este módulo |
| Matrícula académica de posgrado (`estudiantes-postgrado`) | `ms_posgmat` | `codigo`, `cod_programa`, `programa`, `cod_materia`, `grupo`, `materia` | Cubierto, **no usado** (igual que arriba) |
| Matrícula financiera (`estudiantes-financieros`) | `dv_fin` (sin política: el HAR se cortó) | — | Falta, **no se necesita** para la tipología; no se añadió |

### Notas sobre la nómina del Warehouse (leídas del HAR «Reporte de nomina consolidado»)
- La cabecera es `APELLIDOS Y NOMBRES, CÉDULA, CONTRATO, DURACIÓN, CATEGORIA, CÓDIGO, ASIGNATURA/ACTIVIDAD, TIPO DE ACTIVIDAD, GRP, DPTO/CARRERA, HORAS, HORAS SEMESTRE, SEMANAS, FECHA INICIO, FECHA FIN, MAT, OBSERVACIONES, ULT. MODIFICACIÓN`. **Todas las columnas que el motor necesita sobreviven a la política** (código de actividad, departamento, tipo de actividad, horas, grupo, matriculados, contrato, programa, identificador del profesor). `0259` lo comprueba y avisa si alguna falta.
- La identidad (cédula, contrato, categoría, duración) solo viene en la **primera fila de cada profesor**, y entre profesores hay filas de subtotal («Total horas directas…»). `ct_insumos('nomina')` completa la identidad hacia abajo y deja solo las filas con código de actividad. (Gestión Master cuenta «profesores distintos» con la cédula de cada fila; con esta forma de la nómina las filas siguientes quedan sin seudónimo. No se tocó porque es de otro módulo.)
- **No trae `ESTADO`** (la nómina antigua sí): de ahí `ms_aprob`.
- **No trae `COD. PROGRAMA`**: el programa es el departamento o carrera con más horas del profesor (como en Roomy, que usaba `programaPrincipal`). Quien ve cada programa lo decide `ct_programa_unidad`.
- **No separa pregrado de posgrado**: una actividad es de posgrado si su (código, grupo) está en `ms_posg` o, sin él, si el departamento o carrera dice especialización, maestría o doctorado. Esto cambia una cosa respecto a Roomy, y está dicho en el código: cuando la nómina ya trae posgrado, un profesor PLI-TC sin horas de posgrado se evalúa (queda por debajo del mínimo) en vez de quedar «pendiente de fuente».

## Quién ve qué
El acceso sale solo del permiso explícito del rol de acceso: `access_roles.ct_nivel` más la pantalla `cumplimiento_tipologia`, con el patrón de `gm_nivel`/`gm_puede` de Gestión Master. La base lo hace cumplir (`ct_nivel_actual()`, `ct_puede()`, `ct_ve_programa()`); ninguna función ni política usa `has_role_at_least('planeacion')` ni la capacidad del rol (la lección de Informes, 0192). Solo la administración general (`profiles.role = admin`) entra sin rol, como administrador del módulo.

| Nivel (`ct_nivel`) | Qué ve | Cómo se asigna |
| --- | --- | --- |
| `programa` · programa o decano | Los profesores de los programas de **su unidad** | La unidad la da «Estructura y usuarios» (`unit_members`); la pertenencia baja por el árbol, así que una decanatura ve los programas de su facultad |
| `vicerrectoria` | Lo anterior, y además «Programas por sede» (la matriz programa × sede) de los programas de su vicerrectoría | Igual: pertenencia a la unidad de la vicerrectoría |
| `admin` · administrador del módulo | Todos los programas; calcula el corte; asigna programas a unidades; **y es el único que ve las observaciones para Master** | El nivel del rol, o la administración general |

`ct_nivel` nace en `none`: **ningún rol existente entra al aplicar 0260**. Se asigna en Usuarios y roles › (módulo «Gestión Master», pantalla «Cumplimiento de Tipología», que muestra el selector de nivel). La capacidad global no basta.

**Regla crítica.** La observación para Master (255 caracteres, 20 a 255) y la observación ampliada viven en `ct_observacion_master`, una tabla aparte con política de lectura solo para el administrador del módulo (`ct_obs_master_lectura`). Nunca van en `ct_resumen` ni en `ct_observacion`, que son lo que leen programas y decanos. La pestaña «Observaciones para Master» solo se monta para el administrador, pero la barrera es la base, no la pantalla. Programas y decanos ven preventivas, recomendaciones, contrato, estado en Master, distribución semanal y desglose.

Qué programa ve cada quien: el Warehouse conoce el programa por el nombre del departamento o carrera de la nómina. `ct_programa_unidad` lo une a una unidad del organigrama (al cerrar un corte se propone la unidad cuando el nombre coincide con una sola; el administrador la corrige en «Programas y unidades»). **Un programa sin unidad solo lo ve el administrador** (como en el Monitor, 0160).

## Datos personales
El Warehouse guarda la cédula como seudónimo y no guarda nombres; esa política **no se relaja**. La llave de cada profesor es el seudónimo (`x-` + 10 hex). Los nombres se ven con el mecanismo de Gestión Master: botón «Ver los nombres» → función `warehouse`, acción `docentes` (`modulo: "cumplimiento"`) → lee `ms_doc` del Master en ese momento, calcula el seudónimo con la misma sal y fórmula (`gm_seudonimos_de`) y devuelve los nombres. No se escriben en ninguna tabla ni en la caché; viven en el estado de la pantalla y se descartan al cambiar de programa, sede o periodo. Lo único distinto es quién puede: `ct_permitir_nombres()` comprueba el nivel del módulo, deja pasar **solo a los profesores del programa y sede que la persona ve** y anota la consulta en `gm_consultas_nombres` (el mismo registro; Planeación la ve en Gestión Master › Conexión). Los riesgos son los de Gestión Master: los campos de nombre de `prepare_professors` no se conocen por HAR, y leer `ms_doc` tarda.

## El motor (`motor/`)
Portado de Roomy a TypeScript con el **mismo comportamiento**: `tipologia.ts` (perfiles, seis canastas, reglas, veredicto, perfil sugerido, consideración de aprobación, lectura operativa), `observacion255.ts` (la de 255 caracteres), `observacionAmpliada.ts`, `filtros.ts` y `formato.ts`. Cambios mínimos y dichos: tipos; `calcularMedidas` acepta `posgradoCargado` (ver nota de la nómina); la observación ampliada identifica al profesor por su seudónimo (el portal no guarda el nombre; la pantalla del administrador lo completa con el nombre leído en vivo). Se **adaptaron los lectores** (`lectores.ts`) a las columnas normalizadas de `wh_filas`; no se importa nada de Roomy. Las reglas de coordinación de enseñanza que usan `programasCoordinacion` y `estudiantesCoordinacion` están inactivas, igual que en Roomy (nadie las calcula).

**Una sola copia, en el navegador.** El corte lo corre el navegador del administrador, como el corte de Gestión Master y como Roomy corría su sincronización. Se descartó una función de servidor porque obligaría a una segunda copia del motor (una función Deno no importa `src/`) o a desplegar código fuera de su carpeta; el navegador ya lee del Warehouse por funciones de la base y escribe por funciones de la base. El costo: quien calcula necesita el nivel de administrador (la base lo exige en cada función) y el resultado lo calcula esa sesión, no el servidor. Los umbrales por perfil son las constantes `REGLAS_BASE`; Roomy tenía una tabla editable por periodo (`bi_perfil_regla`) que no se portó: el corte guarda las reglas usadas en `ct_cortes.reglas`.

## Cómo calcular el corte
1. Cargar en el Warehouse, para el periodo y la sede, al menos `ms_nom` (obligatoria). Conviene `ms_aprob` (estado en Master), `ms_hordep` (semana) y `ms_posg` (nivel de posgrado). `ms_aprob` solo vale para el periodo abierto en Master.
2. Entrar como administrador del módulo › «Corte y datos», elegir periodo y sede, **Calcular el corte**. Lee `ct_insumos` por páginas de 4000 filas, corre el motor y escribe por `ct_abrir_corte` → `ct_agregar_resumen` / `ct_agregar_detalle` → `ct_cerrar_corte`.
3. El corte anterior sigue vigente hasta que el nuevo se cierra bien (atómico); si algo falla a medias se descarta. Quedan en la bitácora las versiones de cada conjunto, lo que faltó y quién lo calculó.
4. Revisar «Programas y unidades»: los programas nuevos se asignan a una unidad (o se corrigen) para que sus directivos los vean.

Sin datos aún, la pantalla dice qué falta (por ejemplo «No hay corte para 2026 B en Bucaramanga») y cómo generarlo.

## Warehouse: lo añadido
- `ms_aprob` en `supabase/functions/warehouse/reportes.ts`: `POST /master/mod_approve_payroll/approve_payroll/filter/` con `professor_type` `pre` y `post`, paginado (`page` es un desplazamiento de 50 en 50), copiado de `master-sync` de Roomy. Soporte de listas paginadas en `index.ts` (`obtenerFuente`) y entrada en `src/modules/warehouse/conjuntos.ts`. Política en `0259`.
- Acción `docentes` de `index.ts` ampliada con `modulo: "cumplimiento"` (ver «Datos personales»).

## Archivos
| Archivo | Qué es |
| --- | --- |
| `supabase/migrations/0259_warehouse_aprobacion_nomina.sql` | política de `ms_aprob` y comprobación de las columnas de `ms_nom`/`ms_hordep` |
| `supabase/migrations/0260_cumplimiento_tipologia.sql` | `access_roles.ct_nivel`, tablas `ct_*`, RLS, `ct_insumos`, escritura del corte, lecturas y nombres |
| `supabase/functions/warehouse/{reportes,index}.ts` | `ms_aprob`, listas paginadas y la acción `docentes` para el módulo |
| `motor/tipologia.ts`, `observacion255.ts`, `observacionAmpliada.ts`, `filtros.ts`, `formato.ts` | el motor de Roomy en TypeScript |
| `motor/lectores.ts`, `motor/corte.ts` | lectores de `wh_filas` (nómina, aprobación, horario, posgrado) y el cálculo del corte |
| `modelo.ts`, `api.ts` | tipos y reglas de lectura; lectura, escritura y el corte contra Supabase |
| `CumplimientoTipologia.tsx` | la pantalla y su ruta |
| `EstadoPrograma.tsx`, `ListaProfesores.tsx`, `Ficha.tsx`, `ProgramasPorSede.tsx` | la maqueta: estado, lista, ficha con pestañas y la matriz de la vicerrectoría |
| `Corte.tsx`, `Unidades.tsx` | administración: insumos, calcular el corte, bitácora, programas y unidades |
| `cumplimiento.css` | estilos con tokens, solo tema claro (ámbito `.obsr-claro`) |
| `src/lib/auth.tsx`, `types/database.ts`, `AdminShell.tsx`, `launcher/portales.ts`, `intranet-links.ts`, `App.tsx` | pantalla `cumplimiento_tipologia`, ruta y registro en el lanzador |
| `src/modules/admin/usuarios/{role-matrix.ts,RolesView.tsx}` | el nivel (`ct_nivel`) en la matriz de roles |

## Riesgos, supuestos y lo que quedó sin verificar
- **`ms_aprob` sin HAR.** La ruta, el cuerpo y los campos son los de `master-sync` de Roomy. Hay que «Sondear» una sede y comparar el número de filas con «Aprobar nómina». Si Master llama distinto a un campo, la política lo descarta y todos quedan «sin dato en Master». Solo vale para el periodo abierto en Master.
- **Otras sedes.** Todos los HAR son de Bucaramanga; Cúcuta, Valledupar y Bogotá usan la misma ruta, sin verificar.
- **Nivel de posgrado** deducido por `ms_posg` o por el nombre del departamento: comprobar con una carga real que el código de `ms_posg` coincide con el de la nómina.
- **Programa = departamento o carrera** de la nómina: incluye departamentos de servicio (Ciencias Básicas, Éxito Estudiantil), no solo programas académicos. Un profesor se asigna al de más horas.
- **Semana**: son las horas de clase del horario (bloques de 50 minutos, por hora de inicio); las demás actividades no tienen día ni hora. El cruce con la nómina es el seudónimo de `id_docente` = el de `cedula` (misma sal y fórmula).
- **Umbrales de lectura** de la maqueta (titular verde desde 70 %, matriz 75/55 %) son criterios de color en `modelo.ts › LECTURA`, no reglas de la universidad.
- Sin pruebas escritas ni corridas (el usuario prueba); solo `tsc`. Nada se aplicó ni se desplegó.

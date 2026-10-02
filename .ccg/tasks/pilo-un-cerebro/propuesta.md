# Mr. Pilo: un solo cerebro, varios portales

Propuesta para decidir. Nada de esto está construido.

## 1. Lo que hay hoy

- **Dos memorias separadas.** `0113` puso una columna `space` (`planeacion` | `ensenanza`) en `pilo_memory`, `pilo_answers`, `pilo_catalog`, `pilo_inbox`, `pilo_nodes`, `pilo_edges` y `pilo_ai_log`, y un `CHECK` ata cada fuente a su espacio: `cifras`, `boletines`, `pdi`, `observatorio`, `impacto` son de Planeación; `innovacion`, `politicas`, `global`, `moodle`, de Enseñanza. Toda búsqueda filtra por `space`.
- **La identidad de cada Pilo está repartida en cuatro sitios:** `SPACES` en la función (qué fuentes), `pilo_spaces` en la base (persona, tono por rol, cupos; solo existe fila para Enseñanza), `src/modules/pregunta/space.ts` (textos, sugerencias, colores de la página) y `ASK_PERSONA` / `spacePersona` (la voz en el pedido).
- **Dos mallas que no se tocan.** Planeación tiene estructura (`pilar › área › línea › proyecto`, `informe › indicador`). Enseñanza tiene, además, temas y referencias que pone la IA (`trata`, `cita`) y `pilo_graph_neighbors` los usa para traer pasajes vecinos. Planeación no tiene temas ni vecinos.
- **Los puentes solo se dibujan.** `mapa-global/global.ts` une puntos de los dos espacios por etiqueta igual (un ODS, una ley, un pilar) al pintar; no se guardan y la búsqueda no los usa.
- **Los documentos** (`0114`, `pilo_docs`) solo se suben a Enseñanza. Las **cifras en vivo** (`pilo_facts`) solo son de Planeación.
- **Quién pregunta:** visitante, cuenta de Pilo (`0120`: estudiante, profesor, administrativo) o sesión de la intranet. A un administrativo, en Enseñanza, ya se le dice que lo que lee fue escrito para profesores y estudiantes (`memberInstruction`).

El límite real: un administrativo que pregunta en `/pregunta` por la política de evaluación no recibe nada, aunque Pilo la tenga; y un profesor que pregunta en Enseñanza cuántos estudiantes hay, tampoco.

## 2. El modelo: una memoria, portales como vistas

**Una sola memoria y una sola malla.** Lo que hoy es `space` deja de ser una pared y pasa a ser una etiqueta de procedencia: el **ámbito** de cada pasaje (`planeacion`, `ensenanza`, y los que vengan). Nada se copia ni se duplica.

**Un portal es una vista**, guardada en una sola fila (`pilo_portals`, que absorbe `pilo_spaces` y lo que hoy está fijo en `SPACES`):

| Qué define el portal | Hoy está en |
|---|---|
| Qué fuentes lee, y cuáles son «de casa» y cuáles «de visita» | `SPACES.sources` + `memory_sources` |
| Con qué voz habla (persona, campo, tono por rol) | `ASK_PERSONA`, `pilo_spaces.intro/focus/roles` |
| Reglas de diálogo (qué dice sin IA, qué sugiere, cómo cita lo ajeno) | `SPACE_RULE_TEXT`, `space.ts` |
| Cupos, audiencia, funciones ampliadas | `pilo_spaces`, `pilo_extras` |

La función deja de preguntar «¿en qué espacio estoy?» y pregunta «¿qué puede leer este portal para esta persona?». El camino es el mismo de hoy (entender → cifras → memoria → mapa → redactar → verificar); solo cambia el filtro.

**Qué se gana**

- Pilo responde con todo lo que la universidad sabe, desde cualquier portal.
- Los documentos se pueden cargar para el Pilo general con lo que ya existe (`pilo_docs`), sin otra tubería.
- El mapa de temas y vecinos, que hoy solo tiene Enseñanza, sirve a todos.
- Un portal nuevo (Bienestar, Investigación) es una fila, no una migración ni otra copia de la función.
- La identidad de cada Pilo queda en un solo sitio que la administración ve y edita.

**Qué riesgo trae** frente a la regla de hoy («los dos Pilos no mezclan memoria»)

- Hoy la separación es estructural: un error de código no puede cruzar, porque la base no deja. Con vistas, la separación pasa a ser **una regla de filtro**: si el filtro falla, hay fuga. Por eso el filtro debe vivir en la base (una sola función SQL que toda búsqueda use) y no en cada consulta de la función, y hacen falta las pruebas de fuga del punto 6.
- Mezcla de registro: un estudiante puede recibir un dato de planeación redactado para directivos. Se atiende con la regla «de visita» (punto 5).
- Las respuestas guardadas y el catálogo dependen de quién preguntó y dónde: siguen siendo **por portal y por rol**; no se comparten.
- Las cifras en vivo siguen saliendo solo de `pilo_facts`, con su corte y su fuente, en cualquier portal que las lea. El veto de dinero y de datos personales es del cerebro, no del portal: ningún portal puede apagarlo.

## 3. Las conexiones reales

Hoy un puente es un dibujo. La propuesta es guardarlo como relación en `pilo_edges`, con tres datos nuevos: de qué ámbito a qué ámbito va, **quién la puso** (`origin`: `reglas`, `ia`, `admin`) y **en qué estado está** (`propuesta`, `aprobada`, `rechazada`).

**Cómo se crean**

1. **Por reglas (sin IA, se aprueban solas):** misma referencia normalizada en los dos ámbitos (ODS 4, Ley 30, Decreto 1330, un pilar o un proyecto del Plan nombrado en un documento). Es lo que `global.ts` ya calcula al dibujar; se pasa a guardar.
2. **Por temas compartidos:** los temas (`tema:<slug>`) dejan de ser de un ámbito y pasan a ser comunes. Para eso el paso «comprender» (`0115`) se corre también sobre los pasajes de Planeación, reutilizando los temas que ya existen.
3. **Por IA, con revisión:** la IA propone «este indicador mide lo que esta política pide» (indicador ↔ política, proyecto ↔ documento). Entra como `propuesta`; la administración la aprueba o la rechaza en el mapa global. Solo lo aprobado se usa.

**Cómo las usa la búsqueda**

- `pilo_graph_neighbors` ya trae pasajes vecinos por tema o referencia. Se le permite cruzar de ámbito **solo** por relaciones aprobadas y **solo** hacia fuentes que el portal puede leer.
- Los vecinos de otro ámbito entran después de los propios, con tope (2), y marcados `via: "puente"` con su procedencia. Si no cabe todo en el contexto, son lo primero que se queda fuera (ya es así con `via: "mapa"`).
- Con cifras: si la pregunta toca un indicador que tiene una relación aprobada con una política o un proyecto, el pasaje relacionado acompaña a la cifra. La cifra sigue saliendo de `pilo_facts`.

## 4. La selección: quién decide qué lee cada portal

**Una matriz portal × fuente en la administración**, con tres valores por celda:

- **De casa:** se busca siempre y se cita sin aclaración.
- **De visita:** se busca, pero solo entra si lo propio no alcanza o si un puente aprobado lo trae; se cita con su procedencia.
- **No:** el portal no la lee.

Así la memoria es **única pero selectiva**: un solo almacén, y cada portal con su lista. De partida la matriz reproduce lo de hoy (cada portal solo lee lo suyo): nada cambia hasta que la administración marque una celda.

**Qué se respeta siempre, en este orden**

1. **Vetos** (dinero, datos personales): antes de buscar. No dependen del portal.
2. **Visibilidad del pasaje** (`publico` / `sesion` / `oculto`): viaja con el pasaje a cualquier portal. Lo `oculto` no sale nunca; lo de `sesion` solo con sesión. Leer de visita no eleva permisos.
3. **Matriz del portal:** qué fuentes entran.
4. **Quién pregunta:** el rol (visitante, estudiante, profesor, administrativo, intranet) puede **restringir** la matriz, nunca ampliarla. Ejemplo: Impacto sigue pidiendo sesión en cualquier portal.
5. **Reglas de cada fuente:** una fuente puede declararse «no sale de su casa» (por ejemplo, los cursos de Moodle).

## 5. Los diálogos por portal

Un cerebro, varias voces. Cada portal conserva:

- **Persona y campo** («Eres Mr. Pilo, la IA de la UDES para…»): la primera línea del pedido.
- **Tono por rol** y cara de partida: como hoy en `pilo_spaces.roles`.
- **Sugerencias y bienvenida:** las de `space.ts`, pasadas a la fila del portal para que la administración las edite.
- **Lo que dice sin IA** (saludo, quién soy, «no encontré»): por portal.

**Cuando responde con conocimiento de otro ámbito**, Pilo lo dice, y lo dice el servidor, no el modelo:

- La fuente lleva una etiqueta de procedencia que la página muestra junto a la cita («De Pilo en Enseñanza · Políticas institucionales»).
- El pedido lleva una regla fija: «lo marcado como de otro ámbito se presenta en una frase como “esto viene de…”, y se dice para quién fue escrito».
- La aclaración que hoy recibe el administrativo en Enseñanza se generaliza: **cada ámbito declara para quién fue escrito** («preparado para profesores y estudiantes», «preparado para la dirección y Planeación»), y se dice cuando quien pregunta no es ese público.
- Si lo propio y lo ajeno se contradicen, manda lo de casa, y Pilo dice que hay otra fuente que dice algo distinto.

## 6. La migración, por pasos

Cada paso se puede desplegar solo y deja a Pilo respondiendo exactamente como antes hasta que la administración cambie algo.

1. **Portales como dato.** `pilo_portals` (una fila por portal, incluida la de Planeación, que hoy no existe) con la matriz en su valor de hoy. La función lee de ahí en vez de `SPACES`. Comportamiento idéntico; prueba: los pedidos de hoy salen byte a byte iguales.
2. **Un solo filtro en la base.** Una función SQL (`pilo_scope(portal, sesión, rol)`) que devuelve las fuentes y la visibilidad permitidas; todas las búsquedas (`pilo_memory_search`, `_semantic`, `pilo_graph_neighbors`, `pilo_answer_candidates`) la usan. Se quitan los `CHECK` fuente ↔ espacio; `space` queda como procedencia.
3. **Documentos para el Pilo general.** `pilo_docs` acepta el ámbito `planeacion` con sus colecciones. Sin lectura cruzada todavía.
4. **Temas comunes y puentes por reglas.** «Comprender» sobre Planeación; los puentes por referencia se guardan. El mapa global pasa de calcularlos a leerlos. La búsqueda aún no los usa.
5. **Lectura de visita.** La matriz se abre en la administración. La búsqueda cruza por puentes aprobados; la respuesta lleva procedencia y «para quién fue escrito». Se enciende portal por portal.
6. **Puentes por IA con revisión.** Bandeja de propuestas en el mapa global.

**Pruebas de fuga** (las que no existen hoy y harían falta desde el paso 2)

- Matriz: por cada portal × fuente × visibilidad × rol, una pregunta que solo se puede responder con ese pasaje; se comprueba que entra o no entra según la matriz. Generada desde la matriz, no escrita a mano.
- Un pasaje `oculto` o de `sesion` nunca llega a un visitante, ni directo, ni como vecino, ni por puente, ni dentro de una respuesta guardada.
- Una respuesta guardada o una entrada del catálogo de un portal nunca se sirve en otro.
- Con una celda en «No», ningún camino trae esa fuente: búsqueda por palabras, por significado, vecinos, malla, guardadas.
- Vetos: la misma batería de dinero y datos personales, corrida en cada portal.
- Cifras: en cualquier portal, toda cifra de la respuesta está en `pilo_facts` con su corte (el verificador de hoy).
- Regresión: con la matriz en su valor de partida, los dos portales responden igual que antes de la migración.

## 7. Decisiones del dueño

1. **¿Una memoria con portales como vistas (esta propuesta), o se mantienen dos memorias y solo se agregan puentes de lectura entre ellas?** La primera es más limpia y sirve para portales futuros; la segunda conserva la pared de hoy.
2. **¿La lectura entre ámbitos arranca apagada** (la administración abre celda por celda) **o encendida** para lo público?
3. **¿Lo de otro ámbito entra siempre que sea pertinente, o solo cuando lo propio no alcanza?** (La propuesta: solo cuando no alcanza o cuando un puente aprobado lo trae.)
4. **¿Las cifras de UDES en Cifras se pueden citar desde el portal de Enseñanza?** Sí / no / solo con sesión.
5. **¿Los estudiantes y profesores pueden recibir contenido de Planeación (Plan de Desarrollo, Observatorio)?** Sí, todo lo público / solo lo que la administración marque / no.
6. **¿Los cursos de Moodle salen de su portal?** (La propuesta: no.)
7. **¿Los puentes que propone la IA necesitan aprobación uno por uno, o se aprueban solos por encima de un nivel de confianza?** (La propuesta: uno por uno.)
8. **¿Los documentos del Pilo general los sube solo Planeación, o cada oficina los suyos?**
9. **¿El aviso «esto viene de… y fue escrito para…» sale siempre que hay contenido de otro ámbito, o solo cuando quien pregunta no es su público?**
10. **¿Las cuentas de Pilo (`0120`) son un solo perfil para todos los portales, con el mismo nombre y tono, o un perfil por portal?**

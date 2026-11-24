# Mr. Pilo en el portal · plugin de Joomla 3

Incrusta el asistente **Mr. Pilo** del portal de Planeación Institucional
(`planeacion.udes.edu.co`) como botón flotante en las páginas públicas de un
sitio Joomla 3. Probado contra la pila del sitio de la universidad
(`udes.edu.co`: Joomla 3, K2, SP Page Builder, JCH Optimize).

El plugin solo pega una línea en cada página:

```html
<script src="https://planeacion.udes.edu.co/pilo.js"
        data-tema="blanco" data-esquina="izquierda" data-leer="si" defer></script>
```

Todo lo demás (botón, saludo, chat, la conversación con la IA) vive en un marco
aislado del portal de Planeación. El sitio Joomla no guarda claves ni habla con
ninguna API.

## Dónde aparece Mr. Pilo

- **En todas las páginas públicas del sitio**, como botón flotante en la
  **esquina inferior izquierda**. El sitio de la universidad ya tiene el chat
  de atención (Zendesk) en la esquina inferior derecha; Mr. Pilo va en la
  izquierda para no taparlo ni ser tapado.
- En todas, a propósito: la gente llega de los buscadores a páginas internas
  (programas, admisiones, noticias), no solo al inicio. Con la lectura de
  página activada, Mr. Pilo responde sobre lo que la persona está viendo en
  ese momento.
- **Nunca** en la administración de Joomla ni en peticiones crudas
  (`format=raw`, `tmpl=component`, feeds). Y si la plantilla ya trae un
  `pilo.js` en alguna página, el plugin no lo duplica.
- Si una página concreta no debe tenerlo (formularios delicados, por ejemplo),
  se lista en «No aparecer en estas páginas».

## Instalación

1. En Joomla: **Extensiones → Instalar** → subir `plg_system_pilo.zip`.
2. **Extensiones → Plugins** → buscar «Mr. Pilo en el portal» → **activar**.
3. Revisar los parámetros (los valores por defecto ya sirven para el sitio de
   la universidad) y guardar.
4. Abrir cualquier página pública del sitio, de incógnito, y comprobar que el
   botón aparece en la esquina inferior izquierda.

## Parámetros

| Parámetro | Valores | Por defecto |
|---|---|---|
| Cargador de Mr. Pilo | dirección del `pilo.js` | `https://planeacion.udes.edu.co/pilo.js` |
| Qué Pilo aparece | El Pilo de Planeación · Mr. Pilo en Enseñanza | El Pilo de Planeación |
| Esquina del botón | inferior izquierda · inferior derecha | inferior izquierda |
| Apariencia | blanco · soleado · negro | blanco |
| Leer la página | solo lo visible · todo (incluye lo plegado) · no | solo lo visible |
| No aparecer en estas páginas | direcciones (o pedazos) una por línea | vacío |

## Requisitos del lado del portal de Planeación

El dominio del sitio anfitrión debe estar en la lista blanca del widget
(`widget_origins` del espacio en `pilo_ai_settings` / `pilo_spaces`), que se
administra desde la intranet de Planeación. Para `https://udes.edu.co` ya está
registrado. Un dominio no autorizado no muestra nada y no da error visible.

El dominio del sitio debe servirse por **https** (el cargador y el portal lo
exigen) y, si el sitio tiene una política CSP estricta, debe permitir
`script-src` y `frame-src` desde `https://planeacion.udes.edu.co`.

## Notas

- «Leer la página» envía el texto visible de la página al portal al preguntar;
  Pilo nunca lee formularios, menús, diálogos ni lo marcado con
  `data-pilo-ignorar`. Para marcar la zona de contenido de una plantilla,
  envuélvala en un elemento con `data-pilo-leer`.
- Los créditos de uso por día se administran en la intranet de Planeación; si
  el sitio gasta la cuota, el botón avisa que Pilo está descansando.
- JCH Optimize no interfiere: la línea lleva `defer` y atributos `data-`, que
  JCH no combina ni quita.

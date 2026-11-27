# Pilo en el Aula · plugin `local_pilo` para Moodle

Pone el chat de Mr. Pilo en Enseñanza dentro de las páginas de Moodle y le dice a
Pilo, con una credencial firmada en el servidor de Moodle, quién pregunta, desde
qué curso y con qué rol (estudiante, profesor o dirección).

Fase 1: Pilo conoce a la persona, su rol y sus cursos, y responde con los
documentos cargados en su memoria. Todavía no lee notas, entregas ni listas de
estudiantes.

Requiere Moodle 4.1 o posterior.

## Qué viaja a Pilo

La credencial (JWT HS256) dura 5 minutos y lleva solo:

| Dato | Para qué |
| --- | --- |
| Id de la persona en este Moodle | Saber que es la misma persona entre preguntas y limitar cuántas hace por hora |
| Nombre de pila | Llamarla por su nombre |
| Rol: `estudiante`, `profesor` o `direccion` | Las reglas de Pilo para ese rol |
| Curso de la página y hasta 25 cursos, con el rol en cada uno | Responder sobre sus cursos |

No viajan el correo, el documento, el usuario ni las notas. El navegador lleva la
credencial pero no puede cambiarla: si cambia una letra, la firma deja de servir.

### Cómo se decide el rol

- **Profesor** en un curso: puede ver todas las calificaciones (`moodle/grade:viewall`).
- **Estudiante** en un curso: está matriculado y activo.
- Fuera de un curso: **dirección** si tiene `local/pilo:direccion` (por defecto, el rol
  Gestor); si no, profesor si enseña algún curso; si no, estudiante.

## Instalación

1. **En Pilo:** en Mr. Pilo en Enseñanza › Memoria › Moodle, el sitio de este Moodle
   (si no existe, agréguelo con su dirección) › **Crear clave del plugin**. Copie la
   clave: no se vuelve a mostrar. Anote también el id del sitio.
2. **En Pilo:** en el chat emergente de Enseñanza, agregue la dirección de este Moodle
   a los portales permitidos.
3. **Empaquete el plugin** desde la carpeta `moodle-plugin`:

   ```bash
   cd moodle-plugin && zip -r local_pilo.zip local_pilo
   ```

4. **En Moodle:** Administración del sitio › Extensiones › Instalar complementos ›
   suba `local_pilo.zip` (o copie la carpeta en `moodle/local/pilo`) y complete la
   actualización.
5. **En Moodle:** Administración del sitio › Extensiones › Locales › **Pilo en el Aula**:
   - Dirección de Pilo: `https://planeacion.udes.edu.co`
   - Id del sitio: el de Pilo (por ejemplo `aula-bga`)
   - Clave de firma: la del paso 1
   - Dónde aparece Pilo: solo dentro de los cursos (recomendado para empezar)
   - Mostrar a Pilo: encendido
6. Purgue las cachés de Moodle y abra un curso: Pilo aparece en la esquina.

## Cambiar o quitar la clave

Si la clave se filtra, cree otra en Pilo y péguela en Moodle: la anterior deja de
servir de inmediato (en menos de un minuto, por la caché de la función). Quitarla
en Pilo apaga el chat de ese Moodle.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `classes/firma.php` | Calcula el rol y los cursos y firma la credencial |
| `classes/hook_callbacks.php`, `db/hooks.php` | Pone la línea de Pilo antes del pie de página (Moodle 4.4+) |
| `lib.php` | Lo mismo para Moodle 4.1 a 4.3 |
| `classes/external/firma.php`, `db/services.php` | `local_pilo_firma`: credencial nueva por AJAX cuando la anterior vence |
| `db/access.php` | Capacidades `local/pilo:usar` y `local/pilo:direccion` |
| `classes/privacy/provider.php` | Declara los datos que salen hacia Pilo |

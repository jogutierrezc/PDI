# Estructura institucional, roles y usuarios · propuesta

Acordada con el usuario el 2026-09-23. **Se construye después de la Fase 8.**

## Por qué

Para operar Impacto con personas reales hace falta crear vicerrectorías, facultades y programas, y asignar a cada persona lo que puede hacer y dónde. Hoy:

- Las unidades (`units`, 0057) solo se crean en **Mis Tableros → Unidades y tableros**, y el formulario no pide lo que Impacto necesita (0063): SNIES, nivel de formación, modalidad, sedes (`imp_program_campuses`) ni la función que valida cada vicerrectoría.
- Los roles de acceso (`access_roles`, 0024) tienen una capacidad fija (consulta · responsable · planeación · administrador), pantallas e informes. Las capacidades de Impacto (`capabilities`, 0063) no se ven en la pantalla de roles.
- Cada persona tiene un solo rol global (`profiles.access_role_id`); el rol por unidad (`unit_members.access_role_id`, 0063) no tiene pantalla.

## 1. Sistema → Estructura institucional

- Árbol Vicerrectorías → Facultades → Programas (+ oficinas), sobre `units`.
- **Programa**: nombre, código, SNIES, nivel, modalidad, sedes (casillas, activa o no).
- **Vicerrectoría**: función sustantiva que valida.
- **Facultad**: vicerrectoría de la que depende en el organigrama.
- Personas de la unidad y su rol, asignables desde la ficha.
- **Carga masiva de programas** desde Excel (lista SNIES) con vista previa y errores por fila.
- Mis Tableros sigue usando las mismas unidades.

## 2. Roles

| Campo | |
|---|---|
| Nombre | «Dirección de programa» |
| Para qué es | Texto que ve quien asigna |
| Plantilla de capacidad | **Consulta · Editor · Revisor · Administrador** · Personalizada |
| Alcance | Global o por unidad |

Matriz por módulo (Plan de Desarrollo, UDES en Cifras, Observatorio, Impacto, Mis Tableros, Sistema) con niveles **Sin acceso · Ver · Editar · Administrar**, y en cada módulo pantallas **todas o parciales** (en UDES en Cifras, también informes). En Impacto, acciones concretas: capturar, enviar, aprobar, validar, catálogo, periodos. Tocar la matriz de una plantilla la vuelve «Personalizada».

La matriz se traduce a lo que la base ya usa (`screens`, `all_screens`, informes, `base_role`, `capabilities`): las políticas RLS no cambian.

Roles de partida: Consulta, Editor de UDES en Cifras, Planeación, Administrador, Dirección de programa, Reportante, Decanatura, Vicerrectoría.

## 3. Crear un usuario

1. Quién es: nombre y correo (invitación por correo, Edge Function `admin-users`).
2. Qué hace en toda la universidad: rol global.
3. Dónde trabaja: una o varias parejas unidad + rol.

Resumen en palabras de lo que podrá hacer. **Carga masiva de usuarios y asignaciones** desde Excel.

## Mientras tanto

Unidades desde Mis Tableros; los campos de Impacto y los roles por unidad, con SQL en el editor (ver el ejemplo del mensaje del 2026-09-23 o `supabase/seed/impacto_prueba.sql`).

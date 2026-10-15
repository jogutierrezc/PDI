# Usuarios, roles y acceso con Microsoft

Pantalla `/admin/usuarios` (Personas · Roles · Carga masiva · Acceso Microsoft).

## Cómo entra una persona

1. Pulsa «Continuar con Microsoft» en `/acceso-intranet` (o usa correo y contraseña, que sigue funcionando).
2. Supabase Auth crea o enlaza su cuenta. El disparador `handle_new_user()` (migración 0162) mira la **lista de acceso** (`access_allowlist`):
   - **Está en la lista** (correo exacto, o su dominio `@udes.edu.co`; el correo exacto manda): perfil activo con el rol de acceso de la lista.
   - **No está**: perfil **inactivo** con el rol de fábrica «Invitado». La base no le da lectura de la intranet (`current_role()` es nulo); ve lo mismo que un visitante y el login le muestra «Tu cuenta aún no está habilitada».
3. Quien administra lo ve en **Acceso Microsoft → Esperando habilitación** y lo habilita con un clic (agrega su correo con un rol; un disparador activa su perfil).

Quitar o desactivar un correo exacto de la lista **cierra su cuenta** (el último administrador no se puede cerrar). Quitar un dominio solo deja de admitir ingresos nuevos. El rol de la lista se asigna al primer ingreso: para cambiar a quien ya entró, se usa su ficha en Personas.

Crear un usuario (botón «Crear usuario» o carga masiva) agrega su correo a la lista, crea la cuenta sin contraseña ni correo de invitación y su perfil. La contraseña es opcional.

## Qué hace cumplir la base y qué la interfaz

- La base (RLS, funciones, disparadores): quién es administrador, la lista de acceso, el rol de cada perfil, que nadie se asigne un rol, que no se quede el portal sin administradores.
- `base_role` de un rol de acceso = la **mayor** capacidad que pida alguno de sus módulos. La base no distingue módulos: por eso la matriz de Roles avisa cuando un módulo marcado «Ver» acabará editando.
- Las pantallas marcadas en un rol son el menú. Correos, Rutas y Rankings, además, abren datos solo con capacidad de Planeación; Pilo e Internacionalización, solo a administración (director, coordinador y gestor de Internacionalización entran por pertenencia).
- Impacto, Mis Tableros y el Monitor se deciden por la unidad a la que pertenece cada persona.

## Pasos externos para activar Microsoft (no están en el repo)

1. **Microsoft Entra ID** (portal.azure.com → Microsoft Entra ID → Registros de aplicaciones → Nuevo registro).
   - Nombre libre; tipos de cuenta: «Solo esta organización» (un inquilino, el de UDES) para que solo entren cuentas de la universidad.
   - URI de redirección (tipo Web): `https://<REFERENCIA-DEL-PROYECTO>.supabase.co/auth/v1/callback`.
2. En el registro: anote el **Id. de aplicación (cliente)** y el **Id. de directorio (inquilino)**. En «Certificados y secretos» cree un **secreto de cliente** y copie su *valor* (solo se ve una vez).
3. En «Configuración del token → Agregar notificación opcional» (token de ID): agregue `email`. Sin él, Microsoft puede no devolver el correo.
4. **Supabase** → Authentication → Providers → **Azure**: actívelo y pegue el Id. de cliente, el secreto y la URL del inquilino `https://login.microsoftonline.com/<ID-DEL-INQUILINO>/v2.0`.
5. Supabase → Authentication → URL Configuration: en «Redirect URLs» agregue `https://<su-dominio>/acceso-intranet` (y `http://localhost:5173/acceso-intranet` para desarrollo).
6. Supabase → Authentication → Sign In / Providers: **desactive «Allow new users to sign up» por correo** si no se usa, para que nadie se registre por su cuenta. Con Microsoft los perfiles nuevos quedan inactivos hasta que se habiliten; el registro por correo no pasa por ese filtro.
7. Desplegar la función `admin-users` (`supabase functions deploy admin-users`) y aplicar la migración `0162`.

No guarde el secreto ni los identificadores en el repositorio ni en `.env`: viven solo en Supabase.

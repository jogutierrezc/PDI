/* =============================================================================
   Edge Function · admin-users
   Crear, eliminar y reenviar acceso a usuarios del portal.
   Crear = agregar el correo a la lista de acceso (access_allowlist) + cuenta +
   perfil. Sin contraseña no se manda correo: la persona entra con Microsoft.

   Existe porque estas operaciones exigen la clave de servicio (service role),
   que no puede viajar al navegador: cualquiera podría leerla del bundle y
   tendría control total del proyecto. La función corre en el servidor de
   Supabase, comprueba que quien llama es administrador y solo entonces usa esa
   clave.

   Asignar un rol a un usuario que ya existe NO pasa por aquí: eso lo hace el
   portal con un UPDATE normal sobre public.profiles, que las políticas de RLS
   ya restringen a los administradores.

   Despliegue:
     supabase functions deploy admin-users
   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma.)
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

type Role = "consulta" | "responsable" | "planeacion" | "admin";

interface CreatePayload {
  action: "create";
  email: string;
  full_name: string;
  /** Solo si no llega access_role_id; con él, la capacidad sale del rol. */
  role: Role;
  /** Rol de acceso (access_roles.id): decide pantallas e informes y entra en la lista de acceso. */
  access_role_id?: string | null;
  unit?: string;
  /** Contraseña inicial (acceso por correo). Sin ella, la persona entra con Microsoft. */
  password?: string;
  /** Mandar además una invitación por correo (pide correo saliente configurado). */
  invite?: boolean;
}

interface DeletePayload {
  action: "delete";
  user_id: string;
}

interface ResetPayload {
  action: "reset";
  email: string;
  redirect_to?: string;
}

type Payload = CreatePayload | DeletePayload | ResetPayload;

const ROLES: Role[] = ["consulta", "responsable", "planeacion", "admin"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  // supabase-js manda dos cabeceras propias en cada petición, además de las que
  // se declaran aquí: `x-client-info` (la pone auth-js por defecto) y `apikey`
  // (la añade el cliente de funciones). Si no están en esta lista, el navegador
  // rechaza el preflight aunque la función responda 200: el log dice
  // "OPTIONS | 200" y la consola dice "Request header field x-client-info is
  // not allowed by Access-Control-Allow-Headers". Cuesta de ver porque las dos
  // cosas parecen contradecirse, y no se contradicen.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return json({ error: "La función no está configurada correctamente." }, 500);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ error: "Falta la sesión." }, 401);
  }

  // --- 1. ¿Quién llama? ------------------------------------------------------
  // Cliente con el JWT de la persona: sus propias políticas deciden qué lee.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json({ error: "Sesión inválida." }, 401);

  const { data: profile, error: profileError } = await caller
    .from("profiles")
    .select("role, is_active")
    .eq("id", auth.user.id)
    .single();

  if (profileError || !profile?.is_active || profile.role !== "admin") {
    return json({ error: "Solo un administrador puede gestionar usuarios." }, 403);
  }

  // --- 2. Operación ----------------------------------------------------------
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Cuerpo de la petición ilegible." }, 400);
  }

  switch (payload.action) {
    case "create": {
      const email = payload.email?.trim().toLowerCase();
      const fullName = payload.full_name?.trim();

      if (!email || !EMAIL.test(email)) return json({ error: "Escriba un correo completo, como nombre@udes.edu.co." }, 400);
      if (!fullName) return json({ error: "El nombre es obligatorio." }, 400);
      if (payload.password && payload.password.length < 8) {
        return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
      }

      // La capacidad sale del rol de acceso, no de lo que mande el navegador: así
      // el perfil nunca queda con una capacidad que su rol no tiene.
      let role: Role = payload.role;
      if (payload.access_role_id) {
        const { data: accessRole } = await admin
          .from("access_roles")
          .select("base_role, key")
          .eq("id", payload.access_role_id)
          .maybeSingle();
        if (!accessRole) return json({ error: "Ese rol de acceso ya no existe." }, 400);
        if (accessRole.key === "invitado") return json({ error: "«Invitado» es para quien aún no está habilitado: elija otro rol." }, 400);
        role = accessRole.base_role as Role;
      }
      if (!ROLES.includes(role)) return json({ error: "Falta el rol de acceso." }, 400);

      const { data: existing } = await admin.from("profiles").select("id").ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
      if (existing) return json({ error: "Ya existe un usuario con ese correo. Cambie su rol desde su ficha." }, 409);

      // 1. La lista de acceso: es lo que admite a la persona cuando entre con Microsoft.
      if (payload.access_role_id) {
        const { error: listError } = await admin.from("access_allowlist").upsert(
          {
            email,
            full_name: fullName,
            access_role_id: payload.access_role_id,
            active: true,
            created_by: auth.user.id,
          },
          { onConflict: "email" },
        );
        if (listError) return json({ error: `No se pudo agregar el correo a la lista de acceso: ${listError.message}` }, 500);
      }

      // 2. La cuenta. Sin contraseña no se manda nada por correo: entra con Microsoft
      // (la misma dirección se enlaza sola) y solo se invita si se pidió expresamente.
      const metadata = { full_name: fullName, unit: payload.unit ?? null };
      const result = payload.password
        ? await admin.auth.admin.createUser({ email, password: payload.password, email_confirm: true, user_metadata: metadata })
        : payload.invite
          ? await admin.auth.admin.inviteUserByEmail(email, { data: metadata })
          : await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: metadata });

      if (result.error) {
        const message = result.error.message;
        if (/already|registered|exists/i.test(message)) return json({ error: "Ya existe un usuario con ese correo." }, 409);
        if (/sending|smtp|mail/i.test(message)) {
          return json(
            {
              error: "No se pudo enviar el correo de invitación.",
              advice: "Revise el correo saliente de Supabase, o cree la cuenta sin invitación: la persona entra con Microsoft.",
            },
            502,
          );
        }
        return json({ error: message }, 400);
      }

      const created = result.data.user;
      if (!created) return json({ error: "No se pudo crear el usuario." }, 500);

      // 3. El perfil. El disparador de auth.users ya lo creó; si no existe (algunos
      // proyectos no pueden crearlo) se crea aquí, que es lo que antes se perdía en silencio.
      const { error: profileWrite } = await admin.from("profiles").upsert(
        {
          id: created.id,
          email,
          full_name: fullName,
          role,
          unit: payload.unit ?? null,
          is_active: true,
          ...(payload.access_role_id ? { access_role_id: payload.access_role_id } : {}),
        },
        { onConflict: "id" },
      );
      if (profileWrite) return json({ error: `La cuenta se creó, pero no su perfil: ${profileWrite.message}` }, 500);

      return json({
        user: { id: created.id, email, full_name: fullName, role },
        invited: Boolean(payload.invite) && !payload.password,
        method: payload.password ? "password" : "microsoft",
      });
    }

    case "delete": {
      if (!payload.user_id) return json({ error: "Falta el usuario." }, 400);
      if (payload.user_id === auth.user.id) {
        return json({ error: "No puedes eliminar tu propia cuenta." }, 400);
      }

      // El disparador guard_last_admin() impide quedarse sin administradores;
      // aquí se comprueba antes para devolver un mensaje claro en vez de un
      // error de base de datos.
      const { data: target } = await admin
        .from("profiles")
        .select("role")
        .eq("id", payload.user_id)
        .single();

      if (target?.role === "admin") {
        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("is_active", true);

        if ((count ?? 0) <= 1) {
          return json({ error: "No se puede eliminar al último administrador activo." }, 409);
        }
      }

      const { error } = await admin.auth.admin.deleteUser(payload.user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    case "reset": {
      const email = payload.email?.trim().toLowerCase();
      if (!email) return json({ error: "Falta el correo." }, 400);

      const { error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: payload.redirect_to ? { redirectTo: payload.redirect_to } : undefined,
      });

      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    default:
      return json({ error: "Acción desconocida." }, 400);
  }
});

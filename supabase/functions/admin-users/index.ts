/* =============================================================================
   Edge Function · admin-users
   Crear, invitar, eliminar y reenviar acceso a usuarios del portal.

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
  role: Role;
  unit?: string;
  /** Sin contraseña se envía una invitación por correo. */
  password?: string;
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

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

      if (!email || !email.includes("@")) return json({ error: "Correo no válido." }, 400);
      if (!fullName) return json({ error: "El nombre es obligatorio." }, 400);
      if (!ROLES.includes(payload.role)) return json({ error: "Rol no válido." }, 400);
      if (payload.password && payload.password.length < 8) {
        return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
      }

      // El rol y el nombre viajan en user_metadata: el disparador
      // handle_new_user() los copia al perfil en el mismo momento del alta.
      const metadata = { full_name: fullName, role: payload.role, unit: payload.unit ?? null };

      const result = payload.password
        ? await admin.auth.admin.createUser({
            email,
            password: payload.password,
            email_confirm: true,
            user_metadata: metadata,
          })
        : await admin.auth.admin.inviteUserByEmail(email, { data: metadata });

      if (result.error) {
        const already = /already|registered|exists/i.test(result.error.message);
        return json(
          { error: already ? "Ya existe un usuario con ese correo." : result.error.message },
          already ? 409 : 400,
        );
      }

      const created = result.data.user;
      if (!created) return json({ error: "No se pudo crear el usuario." }, 500);

      // El disparador ya insertó el perfil; aquí se completan los campos que
      // no viajan en los metadatos y se garantiza el rol pedido.
      const { error: updateError } = await admin
        .from("profiles")
        .update({ full_name: fullName, role: payload.role, unit: payload.unit ?? null })
        .eq("id", created.id);

      if (updateError) return json({ error: updateError.message }, 500);

      return json({
        user: { id: created.id, email, full_name: fullName, role: payload.role },
        invited: !payload.password,
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

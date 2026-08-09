import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: caller, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !caller?.user) return json({ ok: false, error: "unauthorized" }, 401);

    const { data: callerProfile } = await admin
      .from("profiles").select("role").eq("id", caller.user.id).single();
    const callerRole = callerProfile?.role;
    if (callerRole !== "admin" && callerRole !== "super_admin") {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "create_admin") {
      if (callerRole !== "super_admin") return json({ ok: false, error: "forbidden" }, 403);
      const { email, password, name, org } = body;
      if (!email || !password || String(password).length < 8) {
        return json({ ok: false, error: "weak_password" }, 400);
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: String(email).trim().toLowerCase(),
        password: String(password),
        email_confirm: true,
        user_metadata: { name: String(name ?? "").trim(), org: String(org ?? "").trim() },
      });
      if (error) return json({ ok: false, error: /already|exist/i.test(error.message) ? "email_exists" : error.message }, 400);
      // role 부여 실패를 조용히 넘기지 않는다 — 실패 시 계정을 되돌리고 에러 반환
      const { error: roleErr } = await admin.from("profiles")
        .update({ role: "admin" }).eq("id", data.user!.id);
      if (roleErr) {
        await admin.auth.admin.deleteUser(data.user!.id);
        return json({ ok: false, error: `role_update_failed: ${roleErr.message}` }, 500);
      }
      return json({ ok: true, user_id: data.user!.id });
    }

    if (action === "delete_user") {
      if (callerRole !== "super_admin") return json({ ok: false, error: "forbidden" }, 403);
      const targetId = String(body.user_id ?? "");
      if (!targetId || targetId === caller.user.id) return json({ ok: false, error: "invalid_target" }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", targetId).single();
      if (!target) return json({ ok: false, error: "not_found" }, 404);
      if (target.role === "super_admin") return json({ ok: false, error: "cannot_delete_super_admin" }, 400);
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const targetId = String(body.user_id ?? "");
      const newPassword = String(body.new_password ?? "");
      if (!targetId || newPassword.length < 8) return json({ ok: false, error: "weak_password" }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", targetId).single();
      if (!target) return json({ ok: false, error: "not_found" }, 404);
      if (target.role !== "student" && callerRole !== "super_admin") {
        return json({ ok: false, error: "forbidden" }, 403);
      }
      const { error } = await admin.auth.admin.updateUserById(targetId, { password: newPassword });
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

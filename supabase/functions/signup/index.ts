import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function err(code: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: code }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return err("method_not_allowed", 405);
  try {
    const { email, password, name, org, cohort_code } = await req.json();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return err("invalid_email");
      if (!password || String(password).length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return err("weak_password");
      }
      if (!name || !String(name).trim()) return err("name_required");

    const hashKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", hashKey, new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, "0")).join("");
    const { data: reserved, error: rateError } = await admin.rpc("reserve_signup", {
      p_email: await hash("email:" + String(email).trim().toLowerCase()),
      p_network: await hash("network:" + (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown")),
    });
    if (rateError) return err("signup_unavailable", 503);
    if (!reserved) return err("rate_limited", 429);

    // Resolve the invitation before creating an account. An explicit code always
    // takes precedence over the super-admin's default signup cohort.
    const code = String(cohort_code ?? "").trim().toUpperCase();
    let cohortQuery = admin.from("cohorts").select("id").is("deleted_at", null);
    cohortQuery = code ? cohortQuery.eq("code", code) : cohortQuery.eq("signup_forced", true);
    const { data: signupCohort, error: cohortError } = await cohortQuery.maybeSingle();
    if (cohortError || (code && !signupCohort)) return err("invalid_cohort_code");

    const { data, error } = await admin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
      email_confirm: true,
      user_metadata: { name: String(name ?? "").trim(), org: String(org ?? "").trim() },
    });
    if (error) {
      const msg = /already|exist/i.test(error.message) ? "email_exists" : error.message;
      return err(msg, 400);
    }

    if (signupCohort && data.user) {
      const { error: assignError } = await admin.from("cohort_members").insert({
        cohort_id: signupCohort.id,
        user_id: data.user.id,
      });
      if (assignError) {
        await admin.auth.admin.deleteUser(data.user.id);
        return err("forced_cohort_assignment_failed", 500);
      }
    }
    return new Response(JSON.stringify({ ok: true, user_id: data.user?.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("signup_failed");
    return err("signup_unavailable", 500);
  }
});

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
    const { email, password, name, org } = await req.json();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // bootstrap: 사용자가 한 명도 없을 때(최초 Seed)만 비밀번호 규칙 검증을 건너뜀
    const { data: firstPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const isBootstrap = (firstPage?.users?.length ?? 0) === 0;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return err("invalid_email");
    if (!isBootstrap) {
      if (!password || String(password).length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return err("weak_password");
      }
      if (!name || !String(name).trim()) return err("name_required");
    }

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

    // 강제 가입 기수는 클라이언트 입력을 신뢰하지 않고 서버에서 즉시 배정한다.
    const { data: forcedCohort, error: forcedError } = await admin
      .from("cohorts")
      .select("id")
      .eq("signup_forced", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (forcedError) {
      await admin.auth.admin.deleteUser(data.user!.id);
      return err("forced_cohort_lookup_failed", 500);
    }
    if (forcedCohort && data.user) {
      const { error: assignError } = await admin.from("cohort_members").insert({
        cohort_id: forcedCohort.id,
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
    return err(String(e), 500);
  }
});

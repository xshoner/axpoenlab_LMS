import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-view",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function createDistributionFilesHandler(db: ReturnType<typeof createClient>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "unauthorized" }, 401);
      const { data: auth, error: authError } = await db.auth.getUser(jwt);
      if (authError || !auth?.user) return json({ error: "unauthorized" }, 401);
      const { data: profile, error: profileError } = await db.from("profiles").select("role,status").eq("id", auth.user.id).single();
      if (profileError || profile?.role !== "super_admin" || profile?.status !== "active" || req.headers.get("x-admin-view")) return json({ error: "forbidden" }, 403);
      const body = await req.json();
      const id = body?.file_id;
      if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: "invalid_file" }, 400);
      const { data: file, error: fileError } = await db.from("file_batch_files").select("id,batch_id,file_path,deleted_at").eq("id", id).maybeSingle();
      if (fileError) return json({ error: "file_lookup_failed" }, 503);
      if (!file) return json({ error: "file_not_found" }, 404);
      if (file.deleted_at) return json({ ok: true });
      const { data: batch, error: batchError } = await db.from("file_batches").select("sender_id,status").eq("id", file.batch_id).single();
      if (batchError) return json({ error: "batch_lookup_failed" }, 503);
      if (batch?.status !== "sent" || !file.file_path.startsWith(`${batch.sender_id}/${file.batch_id}/`)) return json({ error: "invalid_file_path" }, 409);
      const { error: storageError } = await db.storage.from("student-deliveries").remove([file.file_path]);
      if (storageError) return json({ error: "storage_delete_failed" }, 503);
      const { error: finishError } = await db.rpc("complete_distribution_file_delete", { p_file: file.id, p_actor: auth.user.id });
      if (finishError) return json({ error: "delete_confirmation_failed" }, 503);
      return json({ ok: true });
    } catch { return json({ error: "delete_failed" }, 503); }
  };
}

Deno.serve(async req => {
  // One deadline covers authorization, physical removal and database confirmation.
  const deadline = AbortSignal.timeout(30000);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline }) },
  });
  return createDistributionFilesHandler(db)(req);
});

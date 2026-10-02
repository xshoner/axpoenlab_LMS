import { createClient } from "npm:@supabase/supabase-js@2";

const ROOM = "axopenlab20261001";
const ROOM_URL = `https://axopenlab.daily.co/${ROOM}`;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-admin-view", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const publicSession = (s: any) => ({ id: s.id, cohort_id: s.cohort_id, teacher_id: s.teacher_id, state: s.state, lease_until: s.lease_until, started_at: s.started_at });

export function createScreenShareHandler(db: any, key: () => string | undefined, request = fetch) {
  async function daily(path: string, body?: unknown, missingOkay = false): Promise<any> {
    const response = await request(`https://api.daily.co/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000),
    });
    if (missingOkay && response.status === 404) return null;
    if (!response.ok) throw new Error(`daily_unavailable:${response.status}:${path}`);
    return response.json();
  }
  async function configureRoom() {
    const properties = { exp: Math.floor(Date.now() / 1000) + 120, eject_at_room_exp: true,
      start_audio_off: true, start_video_off: true, enable_screenshare: true, enable_prejoin_ui: false,
      enable_chat: false, enable_knocking: false,
      permissions: { canSend: false, canAdmin: false, canReceive: { base: true } } };
    const updated = await daily(`/rooms/${ROOM}`, { privacy: "private", properties }, true);
    if (!updated) await daily("/rooms", { name: ROOM, privacy: "private", properties });
  }
  async function closeRoom() {
    // Close admissions and bound the lifetime even for suspended/disconnected clients.
    await daily(`/rooms/${ROOM}`, { privacy: "private", properties: { exp: Math.floor(Date.now() / 1000) + 1, eject_at_room_exp: true } }, true);
    const presence = await daily(`/rooms/${ROOM}/presence`, undefined, true);
    const ids = (presence?.presence || []).map((p: any) => p.id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 100) await daily(`/rooms/${ROOM}/eject`, { ids: ids.slice(i, i + 100), ban: true }, true);
  }
  async function session(id: string) {
    const { data, error } = await db.from("screen_share_sessions").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error("database_unavailable");
    return data;
  }
  async function mutate(id: string, patch: unknown, states?: string[]) {
    let q = db.from("screen_share_sessions").update(patch).eq("id", id);
    if (states) q = q.in("state", states);
    const { error } = await q;
    if (error) throw new Error("database_unavailable");
  }
  async function issue(s: any, profile: any, teacher: boolean) {
    const { data: reserved, error } = await db.rpc("screen_share_reserve_token", { p_session: s.id });
    if (error || !reserved) throw new Error("share_ended");
    const result = await daily("/meeting-tokens", { properties: {
      room_name: ROOM, user_id: profile.id, user_name: (profile.nickname || profile.name || "참가자").slice(0, 40),
      exp: Math.floor(Date.now() / 1000) + 30, is_owner: false,
      enable_screenshare: teacher, start_audio_off: true, start_video_off: true,
      permissions: { canSend: teacher ? ["screenVideo"] : false, canAdmin: false, canReceive: { base: true } },
    } });
    const current = await session(s.id);
    if (!current || !["starting", "live"].includes(current.state) || Date.parse(current.lease_until) <= Date.now()) throw new Error("share_ended");
    return { session: publicSession(current), room: ROOM_URL, token: result.token };
  }
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let startingId: string | null = null;
    try {
      if (req.headers.has("x-admin-view")) return json({ error: "read_only_view" }, 403);
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: auth, error: authError } = await db.auth.getUser(jwt);
      if (authError || !auth?.user) return json({ error: "unauthorized" }, 401);
      const { data: profile } = await db.from("profiles").select("id,role,status,name,nickname").eq("id", auth.user.id).single();
      if (profile?.status !== "active") return json({ error: "forbidden" }, 403);
      const body = await req.json();
      const superAdmin = profile.role === "super_admin";
      if (!superAdmin && (body.action !== "token" || profile.role !== "student")) return json({ error: "forbidden" }, 403);
      if (!key()) return json({ error: "daily_not_configured" }, 503);
      if (body.action === "start") {
        if (!/^[0-9a-f-]{36}$/i.test(body.cohort_id || "") || !/^[0-9a-f-]{36}$/i.test(body.client_id || "")) return json({ error: "select_cohort" }, 400);
        const { data: cohort } = await db.from("cohorts").select("id").eq("id", body.cohort_id).is("deleted_at", null).maybeSingle();
        if (!cohort) return json({ error: "select_cohort" }, 400);
        const { data: claimed, error } = await db.rpc("screen_share_claim", { p_teacher: profile.id, p_cohort: cohort.id, p_client: body.client_id });
        if (error) return json({ error: error.message?.includes("cooling_down") ? "cooling_down" : "share_busy" }, 409);
        const s = Array.isArray(claimed) ? claimed[0] : claimed;
        startingId = s.id;
        await closeRoom();
        await configureRoom();
        const credentials = await issue(s, profile, true);
        startingId = null;
        return json(credentials);
      }
      if (!/^[0-9a-f-]{36}$/i.test(body.session_id || "")) return json({ error: "invalid_session" }, 400);
      const s = await session(body.session_id);
      if (!s) return json({ error: "share_ended" }, 409);
      if (body.action === "token") {
        if (profile.role !== "student" || s.state !== "live" || Date.parse(s.lease_until) <= Date.now()) return json({ error: "share_ended" }, 409);
        const { data: membership } = await db.from("cohort_members").select("user_id").eq("user_id", profile.id).eq("cohort_id", s.cohort_id).maybeSingle();
        if (!membership) return json({ error: "forbidden" }, 403);
        return json(await issue(s, profile, false));
      }
      if (!superAdmin) return json({ error: "forbidden" }, 403);
      if (body.action === "stop") {
        if (s.state === "ended") return json({ stopped: true });
        await mutate(s.id, { state: "stopping" }, ["starting", "live", "stopping"]);
        await closeRoom();
        await db.rpc("screen_share_sample", { p_session: s.id, p_count: 0 });
        await mutate(s.id, { state: "ended", ended_at: new Date().toISOString(), lease_until: new Date().toISOString() });
        return json({ stopped: true });
      }
      if (!["activate", "heartbeat"].includes(body.action)) return json({ error: "invalid_action" }, 400);
      if (s.teacher_id !== profile.id || s.client_id !== body.client_id || !["starting", "live"].includes(s.state) || Date.parse(s.lease_until) <= Date.now()) return json({ error: "share_ended" }, 409);
      await configureRoom();
      const current = await session(s.id);
      if (!current || !["starting", "live"].includes(current.state)) {
        await closeRoom();
        return json({ error: "share_ended" }, 409);
      }
      const presence = await daily(`/rooms/${ROOM}/presence`);
      await db.rpc("screen_share_sample", { p_session: s.id, p_count: presence?.presence?.length || 0 });
      await mutate(s.id, { state: "live", started_at: s.started_at || new Date().toISOString(), lease_until: new Date(Date.now() + 45000).toISOString() }, ["starting", "live"]);
      return json({ session: publicSession(await session(s.id)) });
    } catch (error) {
      if (startingId) {
        try {
          await closeRoom();
          await mutate(startingId, { state: "ended", ended_at: new Date().toISOString() });
        } catch { /* The room expires server-side even if the network is unavailable. */ }
      }
      const message = error instanceof Error ? error.message : "unavailable";
      // Status/path only: never log tokens, credentials or provider response bodies.
      if (message.startsWith("daily_unavailable:")) console.error(message);
      return json({ error: ["share_ended", "database_unavailable"].includes(message) ? message : "daily_unavailable" }, 503);
    }
  };
}

Deno.serve(createScreenShareHandler(createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!), () => Deno.env.get("DAILY_API_KEY")));

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Пускаем только залогиненного админа (см. комментарий в r2-upload-url).
async function requireAdmin(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return json({ error: "Unauthorized" }, 401);

  const { data: profile } = await sb
    .from("user_profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return json({ error: "Forbidden: admin only" }, 403);

  return null;
}

// Остаток бесплатного лимита символов ElevenLabs за текущий период — чисто
// информационный запрос для UI кнопки «Озвучить» (NodeAudioTts.jsx).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET")     return new Response("Method not allowed", { status: 405, headers: CORS });

  const denied = await requireAdmin(req);
  if (denied) return denied;

  if (!ELEVENLABS_API_KEY) {
    return json({ error: "ELEVENLABS_API_KEY secret не настроен" }, 500);
  }

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (!res.ok) {
      const text = await res.text();
      return json({ error: `ElevenLabs error ${res.status}: ${text}` }, 502);
    }
    const data = await res.json();
    return json({ used: data.character_count, limit: data.character_limit });
  } catch (e) {
    console.error("[elevenlabs-quota] unexpected error:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

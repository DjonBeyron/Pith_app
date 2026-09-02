import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const ELEVENLABS_VOICE_ID = Deno.env.get("ELEVENLABS_VOICE_ID")!;
const ELEVENLABS_MODEL_ID = Deno.env.get("ELEVENLABS_MODEL_ID") || "eleven_multilingual_v2";
const ELEVENLABS_URL = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Пускаем только залогиненного админа (см. комментарий в r2-upload-url) —
// озвучка тратит ограниченную квоту символов ElevenLabs (фри-план), доступ
// по анонимному ключу открыл бы её любому посетителю приложения.
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

type Alignment = { characters: string[]; character_start_times_seconds: number[] };

// Символьные тайминги ElevenLabs → тайминги слов в формате, который уже
// понимает AudioModule.jsx (charTimings сопоставляет их с введённым текстом
// по ИНДЕКСУ слова, не по строке — важны только порядок и количество).
function wordTimingsFromAlignment(alignment: Alignment) {
  const { characters, character_start_times_seconds: starts } = alignment;
  const out: { w: string; t: number }[] = [];
  let word = "";
  let wordStart = 0;
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (/\s/.test(ch)) {
      if (word) { out.push({ w: word, t: Math.round(wordStart * 10) / 10 }); word = ""; }
      continue;
    }
    if (!word) wordStart = starts[i];
    word += ch;
  }
  if (word) out.push({ w: word, t: Math.round(wordStart * 10) / 10 });
  return out;
}

Deno.serve(async (req) => {
  console.log("[tts-elevenlabs] incoming", { method: req.method });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: CORS });

  const denied = await requireAdmin(req);
  if (denied) return denied;

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    console.error("[tts-elevenlabs] secrets not set");
    return json({ error: "ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID secret не настроен" }, 500);
  }

  let text: string;
  try {
    const body = await req.json();
    text = (body.text ?? "").trim();
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!text) return json({ error: '"text" is required' }, 400);
  if (text.length > 2000) return json({ error: "Текст слишком длинный (лимит 2000 символов за раз)" }, 400);

  try {
    console.log("[tts-elevenlabs] calling ElevenLabs...", { chars: text.length });
    const elRes = await fetch(ELEVENLABS_URL(ELEVENLABS_VOICE_ID), {
      method:  "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body:    JSON.stringify({ text, model_id: ELEVENLABS_MODEL_ID }),
    });

    if (!elRes.ok) {
      const errText = await elRes.text();
      console.error("[tts-elevenlabs] ElevenLabs error:", elRes.status, errText);
      return json({ error: `ElevenLabs error ${elRes.status}: ${errText}` }, 502);
    }

    const result = await elRes.json();
    const wordTimings = wordTimingsFromAlignment(result.alignment);
    console.log("[tts-elevenlabs] OK, words:", wordTimings.length);

    return json({ audioBase64: result.audio_base64, contentType: "audio/mpeg", wordTimings });
  } catch (e) {
    console.error("[tts-elevenlabs] unexpected error:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

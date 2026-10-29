import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const ELEVENLABS_VOICE_ID = Deno.env.get("ELEVENLABS_VOICE_ID")!;
const ELEVENLABS_MODEL_ID = Deno.env.get("ELEVENLABS_MODEL_ID") || "eleven_multilingual_v2";
const ELEVENLABS_URL = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;

// Режим kind:"sfx" — генерация короткого звука по описанию (ElevenLabs sound-generation), тот же ключ ELEVENLABS_API_KEY.
const ELEVENLABS_SFX_URL = "https://api.elevenlabs.io/v1/sound-generation";

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

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds?: number[];
};

// Символьные тайминги ElevenLabs → тайминги слов в формате {w, t, e}, который
// понимает charTimings.js (сопоставляет их с текстом ПО САМОМУ СЛОВУ, поэтому
// нормализация произносимого на стороне ElevenLabs печать не ломает).
// Округляем до сотых: до десятых давало дрожание ±50мс на каждом слове —
// на глаз печать то опережала звук, то отставала. e — конец слова (для сцен
// «два кота»: wordTimings { word, start, end } и длительность реплики).
function wordTimingsFromAlignment(alignment: Alignment) {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const r = (v: number) => Math.round(v * 100) / 100;
  const out: { w: string; t: number; e: number }[] = [];
  let word = "";
  let wordStart = 0;
  let wordEnd = 0;
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (/\s/.test(ch)) {
      if (word) { out.push({ w: word, t: r(wordStart), e: r(wordEnd) }); word = ""; }
      continue;
    }
    if (!word) wordStart = starts[i];
    wordEnd = ends?.[i] ?? starts[i];
    word += ch;
  }
  if (word) out.push({ w: word, t: r(wordStart), e: r(wordEnd) });
  return out;
}

// Необязательные параметры голоса от клиента (сцены «два кота»: у каждого
// персонажа свой голос и настройки; аудио-ноды уроков их не шлют — остаётся
// голос из секрета ELEVENLABS_VOICE_ID). Всё, что не прошло проверку, отбрасывается.
const MODELS = ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v3"];
const clamp = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;

function voiceParams(body: Record<string, unknown>) {
  const voiceId = typeof body.voiceId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.voiceId)
    ? body.voiceId : ELEVENLABS_VOICE_ID;
  const modelId = typeof body.modelId === "string" && MODELS.includes(body.modelId) ? body.modelId : ELEVENLABS_MODEL_ID;
  const vs = (body.voiceSettings ?? {}) as Record<string, unknown>;
  const settings: Record<string, number> = {};
  const stability = clamp(vs.stability, 0, 1);
  const similarity = clamp(vs.similarity_boost ?? vs.similarity, 0, 1);
  const speed = clamp(vs.speed, 0.7, 1.2);
  if (stability !== undefined) settings.stability = stability;
  if (similarity !== undefined) settings.similarity_boost = similarity;
  if (speed !== undefined) settings.speed = speed;
  return { voiceId, modelId, settings: Object.keys(settings).length ? settings : null };
}

// Параметры звукового эффекта от клиента: описание (≤ 450 символов), длительность 0.5…5 с, «послушность» описанию 0…1.
// Всё, что не прошло проверку, заменяется значениями по умолчанию (мяу: 0.6 с, 0.5) или отклоняется (пустое описание).
function sfxParams(body: Record<string, unknown>) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const duration = clamp(body.duration_seconds, 0.5, 5) ?? 0.6;
  const influence = clamp(body.prompt_influence, 0, 1) ?? 0.5;
  return { text, duration, influence };
}

// Звуковой эффект: POST /v1/sound-generation → mp3. Отдаём так же, как озвучку, — audioBase64; в R2 файл кладёт браузер
// (после нормализации громкости) тем же путём, что и озвучку (r2-upload-url). Ошибки ElevenLabs (нет ключа, лимит) — текстом в error.
async function handleSfx(body: Record<string, unknown>) {
  if (!ELEVENLABS_API_KEY) return json({ error: "ELEVENLABS_API_KEY secret не настроен" }, 500);
  const { text, duration, influence } = sfxParams(body);
  if (!text) return json({ error: '"text" is required' }, 400);
  if (text.length > 450) return json({ error: "Описание слишком длинное (лимит 450 символов)" }, 400);
  try {
    console.log("[tts-elevenlabs] sfx: calling ElevenLabs...", { chars: text.length, duration, influence });
    const elRes = await fetch(ELEVENLABS_SFX_URL, {
      method:  "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body:    JSON.stringify({ text, duration_seconds: duration, prompt_influence: influence }),
    });
    if (!elRes.ok) {
      const errText = await elRes.text();
      console.error("[tts-elevenlabs] sfx ElevenLabs error:", elRes.status, errText);
      return json({ error: `ElevenLabs error ${elRes.status}: ${errText}` }, 502);
    }
    const bytes = new Uint8Array(await elRes.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    console.log("[tts-elevenlabs] sfx OK, bytes:", bytes.length);
    return json({ kind: "sfx", audioBase64: btoa(bin), contentType: elRes.headers.get("content-type") || "audio/mpeg", duration, influence });
  } catch (e) {
    console.error("[tts-elevenlabs] sfx unexpected error:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
}

Deno.serve(async (req) => {
  console.log("[tts-elevenlabs] incoming", { method: req.method });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: CORS });

  const denied = await requireAdmin(req);
  if (denied) return denied;

  // kind:"sfx" — звуковой эффект (нужен только ключ, голос не нужен); остальное — озвучка как раньше
  const raw = await req.clone().json().catch(() => null);
  if (raw && typeof raw === "object" && (raw as Record<string, unknown>).kind === "sfx") return handleSfx(raw as Record<string, unknown>);

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    console.error("[tts-elevenlabs] secrets not set");
    return json({ error: "ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID secret не настроен" }, 500);
  }

  let text: string;
  let voice: ReturnType<typeof voiceParams>;
  try {
    const body = await req.json();
    text = (body.text ?? "").trim();
    voice = voiceParams(body);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!text) return json({ error: '"text" is required' }, 400);
  if (text.length > 2000) return json({ error: "Текст слишком длинный (лимит 2000 символов за раз)" }, 400);

  try {
    console.log("[tts-elevenlabs] calling ElevenLabs...", { chars: text.length, voiceId: voice.voiceId, modelId: voice.modelId });
    const elRes = await fetch(ELEVENLABS_URL(voice.voiceId), {
      method:  "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body:    JSON.stringify({
        text,
        model_id: voice.modelId,
        ...(voice.settings ? { voice_settings: voice.settings } : {}),
      }),
    });

    if (!elRes.ok) {
      const errText = await elRes.text();
      console.error("[tts-elevenlabs] ElevenLabs error:", elRes.status, errText);
      return json({ error: `ElevenLabs error ${elRes.status}: ${errText}` }, 502);
    }

    const result = await elRes.json();
    const wordTimings = wordTimingsFromAlignment(result.alignment);
    console.log("[tts-elevenlabs] OK, words:", wordTimings.length);

    return json({ audioBase64: result.audio_base64, contentType: "audio/mpeg", wordTimings, voiceId: voice.voiceId, modelId: voice.modelId });
  } catch (e) {
    console.error("[tts-elevenlabs] unexpected error:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

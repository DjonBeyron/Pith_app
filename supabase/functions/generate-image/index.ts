import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Выбор провайдера — код на клиенте не знает и не должен знать, кто именно
// рисует картинку (тот же File на выходе). Реальный источник — строка
// app_settings.image_provider (переключается из UI, ⚙ в шапке канваса →
// Настройки → ImageProviderSettings.jsx, без правки секретов и передеплоя);
// секрет ниже — аварийный дефолт, если строки в базе ещё нет (до миграции
// или если её кто-то удалил).
const IMAGE_PROVIDER_ENV_DEFAULT = Deno.env.get("IMAGE_PROVIDER") || "cloudflare";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Тот же аккаунт, что уже используется для R2 (R2_ACCOUNT_ID) — Cloudflare
// account id общий для всех продуктов аккаунта, отдельный секрет не нужен.
const CLOUDFLARE_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const CLOUDFLARE_AI_TOKEN = Deno.env.get("CLOUDFLARE_AI_TOKEN") ?? "";
const CLOUDFLARE_IMAGE_MODEL = Deno.env.get("CLOUDFLARE_IMAGE_MODEL") ||
  "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const CLOUDFLARE_URL = (accountId: string, model: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
const CLOUDFLARE_TRANSLATE_MODEL = "@cf/meta/m2m100-1.2b";
const HAS_CYRILLIC = /[а-яё]/i;

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
// генерация тратит ограниченную квоту выбранного провайдера, доступ по
// анонимному ключу открыл бы её любому посетителю приложения. Возвращает сам
// клиент (не только вердикт) — он же используется дальше для чтения/записи
// app_settings (провайдер, счётчик) под тем же RLS-контекстом залогиненного
// админа, второй клиент заводить не нужно.
async function requireAdmin(req: Request): Promise<{ denied: Response } | { sb: ReturnType<typeof createClient> }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { denied: json({ error: "Unauthorized" }, 401) };

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return { denied: json({ error: "Unauthorized" }, 401) };

  const { data: profile } = await sb
    .from("user_profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { denied: json({ error: "Forbidden: admin only" }, 403) };

  return { sb };
}

// deno-lint-ignore no-explicit-any
async function getProvider(sb: any): Promise<string> {
  const { data } = await sb.from("app_settings").select("value").eq("key", "image_provider").maybeSingle();
  return data?.value?.provider || IMAGE_PROVIDER_ENV_DEFAULT;
}

// Свой счётчик генераций через Cloudflare за сутки (UTC) — не официальная
// квота (Cloudflare не отдаёт точный остаток бесплатного бюджета через API),
// просто ориентир для админа в ImageProviderSettings.jsx. Не роняем
// генерацию, если апдейт счётчика не удался — картинка уже готова к этому
// моменту, отдать ошибку было бы хуже, чем недосчитать одну генерацию.
// deno-lint-ignore no-explicit-any
async function bumpUsage(sb: any) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await sb.from("app_settings").select("value").eq("key", "image_gen_usage").maybeSingle();
    const prev = data?.value ?? {};
    const count = prev.date === today ? (prev.count ?? 0) + 1 : 1;
    await sb.from("app_settings").upsert(
      { key: "image_gen_usage", value: { date: today, count }, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  } catch (e) {
    console.error("[generate-image] bumpUsage failed:", (e as Error).message);
  }
}

// Двоичные данные → base64 чанками (btoa на всём буфере разом падает на
// больших картинках — стек вызовов String.fromCharCode(...bytes) не резиновый).
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function generateWithGemini(prompt: string) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY secret не настроен");

  const res = await fetch(GEMINI_URL(GEMINI_IMAGE_MODEL), {
    method:  "POST",
    headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
    body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText}`);
  }

  const result = await res.json();
  const parts = result?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: { inline_data?: { data?: string } }) => p.inline_data?.data);

  if (!imagePart) {
    // Модель иногда отказывается генерировать (например, из-за политики
    // безопасности) и отвечает только текстом — показываем его как причину.
    const textPart = parts.find((p: { text?: string }) => p.text)?.text;
    throw new Error(textPart || "Gemini не вернул изображение");
  }

  return { imageBase64: imagePart.inline_data.data, contentType: imagePart.inline_data.mime_type || "image/png" };
}

// SDXL обучена в основном на английских подписях — промпт на русском (или
// любом другом не-английском) даёт случайный, не соответствующий запросу
// результат. Переводим тем же Cloudflare-аккаунтом, той же бесплатной квотой,
// прежде чем звать модель генерации. Если перевод не удался — не роняем всю
// генерацию, просто идём с исходным текстом (тексту в промпте уж точно не
// хуже, чем совсем без него).
async function translateToEnglish(text: string): Promise<string> {
  try {
    const res = await fetch(CLOUDFLARE_URL(CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_TRANSLATE_MODEL), {
      method:  "POST",
      headers: { "Authorization": `Bearer ${CLOUDFLARE_AI_TOKEN}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ text, source_lang: "ru", target_lang: "en" }),
    });
    if (!res.ok) return text;
    const data = await res.json();
    return data?.result?.translated_text || text;
  } catch {
    return text;
  }
}

async function generateWithCloudflare(prompt: string) {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_AI_TOKEN) {
    throw new Error("R2_ACCOUNT_ID / CLOUDFLARE_AI_TOKEN secret не настроен");
  }

  const imagePrompt = HAS_CYRILLIC.test(prompt) ? await translateToEnglish(prompt) : prompt;
  console.log("[generate-image] cloudflare prompt", { translated: imagePrompt !== prompt });

  const res = await fetch(CLOUDFLARE_URL(CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_IMAGE_MODEL), {
    method:  "POST",
    headers: { "Authorization": `Bearer ${CLOUDFLARE_AI_TOKEN}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ prompt: imagePrompt }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || contentType.includes("application/json")) {
    // Успех у SDXL — «сырой» PNG; JSON в ответе бывает только при ошибке
    // (даже иногда со статусом 200 — проверяем content-type, не только res.ok).
    const errText = await res.text();
    throw new Error(`Cloudflare error ${res.status}: ${errText}`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  return { imageBase64: bytesToBase64(buf), contentType: contentType || "image/png" };
}

Deno.serve(async (req) => {
  console.log("[generate-image] incoming", { method: req.method });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: CORS });

  const auth = await requireAdmin(req);
  if ("denied" in auth) return auth.denied;
  const { sb } = auth;

  let prompt: string;
  try {
    const body = await req.json();
    prompt = (body.prompt ?? "").trim();
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!prompt) return json({ error: '"prompt" is required' }, 400);
  if (prompt.length > 2000) return json({ error: "Промпт слишком длинный (лимит 2000 символов)" }, 400);

  const provider = await getProvider(sb);

  try {
    console.log("[generate-image] calling", provider, "...", { chars: prompt.length });
    const out = provider === "gemini"
      ? await generateWithGemini(prompt)
      : await generateWithCloudflare(prompt);
    if (provider !== "gemini") await bumpUsage(sb);
    console.log("[generate-image] OK");
    return json(out);
  } catch (e) {
    console.error("[generate-image] error:", (e as Error).message);
    return json({ error: (e as Error).message }, 502);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Рассылка Web Push по подпискам из push_subscriptions. Только для админа.
// POST { title, body, url?, onlyMine? } — onlyMine=true шлёт только на
// подписки самого админа (тестовый режим). Протухшие подписки (404/410 от
// шлюза браузера) удаляются. Секреты: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto:...).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:pithyproduction@gmail.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

// Пускаем только залогиненного админа (тот же паттерн, что в r2-delete)
async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Unauthorized" });

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return json(401, { error: "Unauthorized" });

  const { data: profile } = await sb
    .from("user_profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return json(403, { error: "Forbidden: admin only" });

  return { userId: user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const { title, body, url, onlyMine } = await req.json();
  if (!title || !body) return json(400, { error: "title и body обязательны" });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // Подписки читаем сервисным ключом (RLS не даёт SELECT клиентам)
  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let q = service.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (onlyMine) q = q.eq("user_id", admin.userId);
  const { data: subs, error } = await q;
  if (error) return json(500, { error: error.message });

  const payload = JSON.stringify({ title, body, url: url || "/" });
  let sent = 0, failed = 0, removed = 0;

  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Подписка мертва (иконку удалили / браузер отозвал) — чистим
        await service.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        removed++;
      } else {
        failed++;
      }
    }
  }));

  return json(200, { total: subs?.length ?? 0, sent, failed, removed });
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Автоматические пуши по триггерам. Два режима:
// 1) Cron (pg_cron → net.http_post, заголовок x-cron-secret):
//    POST { kind: "evening" } — вызывается КАЖДЫЙ ЧАС (schedule '0 * * * *'):
//    SQL-функция push_audience_evening() сама фильтрует «у кого сейчас 19:xx
//    по его локальному часовому поясу» и отдаёт три группы (kind):
//      - inactive_today       — не заходил сегодня, общий текст
//      - streak_risk          — серия под угрозой, {streak}
//      - streak_milestone_eve — сегодня уже заходил, завтра день-веха серии;
//        плейсхолдеры {streak} {day} {xp} {tickets} (m_day/m_xp/m_tickets)
//    POST { kind: "energy_full" } — энергия восстановилась (раз в час)
// 2) Self (Authorization: JWT пользователя):
//    POST { kind: "level_up", level } — пуш САМОМУ СЕБЕ о новом уровне
//    (не админский, поэтому чужим слать физически нечем).
// Деплой с --no-verify-jwt: cron не имеет JWT, авторизация проверяется здесь.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:pithyproduction@gmail.com";
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-cron-secret",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string | null };
type Tpl = { title: string; body: string; url: string };

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function loadTemplate(kind: string): Promise<Tpl | null> {
  const { data } = await service.from("push_templates")
    .select("title, body, url").eq("trigger_kind", kind).eq("enabled", true).limit(1);
  return (data?.[0] as Tpl) ?? null;
}

// Рассылка по подпискам; мёртвые (404/410) удаляются. Возвращает sent/failed.
async function sendAll(subs: Sub[], tpl: Tpl, vars: Record<string, string>) {
  let sent = 0, failed = 0;
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  const payload = JSON.stringify({ title: fill(tpl.title), body: fill(tpl.body), url: tpl.url || "/" });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await service.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      } else failed++;
    }
  }));
  return { sent, failed };
}

async function subsForUsers(uids: string[]): Promise<Sub[]> {
  if (!uids.length) return [];
  const { data } = await service.from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id").in("user_id", uids);
  return (data as Sub[]) ?? [];
}

async function logSent(uids: string[], kind: string) {
  if (!uids.length) return;
  await service.from("push_trigger_log")
    .insert(uids.map(u => ({ user_id: u, trigger_kind: kind })));
}

// Персонализированная рассылка: каждому uid — свой набор плейсхолдеров (varsFor).
// Общий код для streak_risk и streak_milestone_eve (раньше дублировался).
async function sendPersonalized<T extends { uid: string }>(
  rows: T[], tpl: Tpl, varsFor: (r: T) => Record<string, string>,
) {
  const subs = await subsForUsers(rows.map(r => r.uid));
  const subsByUser = new Map<string, Sub[]>();
  for (const s of subs) {
    if (!s.user_id) continue;
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id)!.push(s);
  }
  let sent = 0, failed = 0;
  await Promise.all(rows.map(async (r) => {
    const mySubs = subsByUser.get(r.uid) ?? [];
    if (!mySubs.length) return;
    const res = await sendAll(mySubs, tpl, varsFor(r));
    sent += res.sent; failed += res.failed;
  }));
  return { sent, failed };
}

type EveningRow = {
  uid: string; kind: string; streak: number;
  m_day: number | null; m_xp: number | null; m_tickets: number | null;
};

// Вечер: аудитория из SQL (push_audience_evening) делится на три шаблона.
// streak_risk несёт число дней серии (streak) — плейсхолдер {streak}.
// streak_milestone_eve — уже заходил сегодня, завтра день-веха серии:
// плейсхолдеры {streak} {day} {xp} {tickets} (m_day/m_xp/m_tickets).
async function runEvening() {
  const { data, error } = await service.rpc("push_audience_evening");
  if (error) return json(500, { error: error.message });
  const rows = (data ?? []) as EveningRow[];
  const out: Record<string, unknown> = {};

  const inactiveUids = rows.filter(r => r.kind === "inactive_today").map(r => r.uid);
  const inactiveTpl = inactiveUids.length ? await loadTemplate("inactive_today") : null;
  if (inactiveTpl) {
    const res = await sendAll(await subsForUsers(inactiveUids), inactiveTpl, {});
    await logSent(inactiveUids, "inactive_today");
    out.inactive_today = { audience: inactiveUids.length, ...res };
  } else out.inactive_today = { audience: inactiveUids.length, skipped: true };

  const streakRows = rows.filter(r => r.kind === "streak_risk");
  const streakTpl = streakRows.length ? await loadTemplate("streak_risk") : null;
  if (streakTpl) {
    const res = await sendPersonalized(streakRows, streakTpl, r => ({ streak: String(r.streak ?? 0) }));
    await logSent(streakRows.map(r => r.uid), "streak_risk");
    out.streak_risk = { audience: streakRows.length, ...res };
  } else out.streak_risk = { audience: streakRows.length, skipped: true };

  const milestoneRows = rows.filter(r => r.kind === "streak_milestone_eve");
  const milestoneTpl = milestoneRows.length ? await loadTemplate("streak_milestone_eve") : null;
  if (milestoneTpl) {
    const res = await sendPersonalized(milestoneRows, milestoneTpl, r => ({
      streak: String(r.streak ?? 0),
      day: String(r.m_day ?? 0),
      xp: String(r.m_xp ?? 0),
      tickets: String(r.m_tickets ?? 0),
    }));
    await logSent(milestoneRows.map(r => r.uid), "streak_milestone_eve");
    out.streak_milestone_eve = { audience: milestoneRows.length, ...res };
  } else out.streak_milestone_eve = { audience: milestoneRows.length, skipped: true };

  return json(200, out);
}

async function runEnergyFull() {
  const { data, error } = await service.rpc("push_audience_energy_full");
  if (error) return json(500, { error: error.message });
  const uids = ((data ?? []) as string[]);
  const tpl = uids.length ? await loadTemplate("energy_full") : null;
  if (!tpl) return json(200, { audience: uids.length, skipped: true });
  const res = await sendAll(await subsForUsers(uids), tpl, {});
  await logSent(uids, "energy_full");
  return json(200, { audience: uids.length, ...res });
}

// Пуш самому себе (level_up): личность берём из JWT, шлём только на свои подписки
async function runSelf(req: Request, kind: string, level: number) {
  if (kind !== "level_up") return json(400, { error: "bad kind" });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Unauthorized" });
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return json(401, { error: "Unauthorized" });

  const tpl = await loadTemplate("level_up");
  if (!tpl) return json(200, { skipped: true });
  const res = await sendAll(await subsForUsers([user.id]), tpl, { level: String(Math.floor(level) || 0) });
  await logSent([user.id], "level_up");
  return json(200, res);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const { kind, level } = await req.json().catch(() => ({}));

  if (req.headers.get("x-cron-secret") === CRON_SECRET) {
    if (kind === "evening") return runEvening();
    if (kind === "energy_full") return runEnergyFull();
    return json(400, { error: "bad kind" });
  }
  return runSelf(req, kind, Number(level));
});

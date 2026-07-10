import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вебхук ЮKassa: уведомление payment.succeeded → активация подписки.
// Настройка в личном кабинете ЮKassa: HTTP-уведомления → URL этой функции,
// событие payment.succeeded. Деплой БЕЗ проверки JWT (у кассы его нет):
//   supabase functions deploy payment-webhook --no-verify-jwt
//
// Безопасность: ЮKassa не подписывает вебхуки, поэтому телу запроса не верим —
// перезапрашиваем платёж по id напрямую у API кассы с ключами магазина и
// действуем только по этому ответу. Подделать его снаружи нельзя.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const YK_SHOP_ID = Deno.env.get("YOOKASSA_SHOP_ID") ?? "";
const YK_SECRET = Deno.env.get("YOOKASSA_SECRET_KEY") ?? "";

const SUB_DAYS = 30;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!YK_SHOP_ID || !YK_SECRET) return json(503, { error: "provider not configured" });

  let notif: { event?: string; object?: { id?: string } };
  try { notif = await req.json(); } catch { return json(400, { error: "bad json" }); }

  const paymentId = notif?.object?.id;
  if (!paymentId) return json(400, { error: "no payment id" });
  // Интересует только успешная оплата; остальные события подтверждаем молча,
  // чтобы касса не ретраила их бесконечно
  if (notif.event !== "payment.succeeded") return json(200, { ok: true, skipped: notif.event });

  // Не верим телу — источник правды только прямой ответ API ЮKassa
  const ykRes = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { "Authorization": "Basic " + btoa(`${YK_SHOP_ID}:${YK_SECRET}`) },
  });
  if (!ykRes.ok) {
    console.error("[PAY] verify fetch failed:", ykRes.status);
    return json(502, { error: "verify failed" });
  }
  const yk = await ykRes.json();
  if (yk.status !== "succeeded") return json(200, { ok: true, skipped: yk.status });

  const userId = yk.metadata?.user_id;
  const ourPaymentId = yk.metadata?.payment_id;
  if (!userId || !ourPaymentId) {
    console.error("[PAY] payment without metadata:", paymentId);
    return json(200, { ok: true, skipped: "no metadata" });
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Идемпотентность: платёж уже проведён — второй раз подписку не продлеваем
  const { data: existing } = await service
    .from("payments").select("status").eq("id", ourPaymentId).single();
  if (!existing) return json(200, { ok: true, skipped: "unknown payment" });
  if (existing.status === "succeeded") return json(200, { ok: true, skipped: "already done" });

  await service.from("payments")
    .update({
      status: "succeeded",
      raw: yk,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ourPaymentId);

  const { error: actErr } = await service.rpc("activate_subscription", {
    p_user: userId, p_days: SUB_DAYS,
  });
  if (actErr) {
    console.error("[PAY] activate_subscription:", actErr.message);
    return json(500, { error: "activation failed" });
  }

  console.log("[PAY] подписка активирована:", userId, "платёж", ourPaymentId);
  return json(200, { ok: true });
});

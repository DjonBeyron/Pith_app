import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Создание платежа за подписку Pithy Pro (399 ₽ / 30 дней) через ЮKassa.
// Вызов: supabase.functions.invoke('create-payment') с JWT пользователя.
// Возвращает { url } — страница оплаты ЮKassa, куда клиент делает redirect.
//
// СТАБ-РЕЖИМ: пока секреты ЮKassa не заданы (YOOKASSA_SHOP_ID /
// YOOKASSA_SECRET_KEY в Supabase → Edge Functions → Secrets), возвращает
// { stub: true } — клиент показывает «оплата скоро». Подключение кассы =
// просто добавить два секрета, код менять не нужно.
//
// Автопродление: save_payment_method=true — ЮKassa сохраняет способ оплаты,
// последующие списания можно делать серверно по payment_method_id (этап 2).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const YK_SHOP_ID = Deno.env.get("YOOKASSA_SHOP_ID") ?? "";
const YK_SECRET = Deno.env.get("YOOKASSA_SECRET_KEY") ?? "";
// Куда ЮKassa вернёт пользователя после оплаты (страница приложения)
const RETURN_URL = Deno.env.get("PAYMENT_RETURN_URL") ?? "https://pithy.app/";

const PRICE_RUB = "399.00";
const SUB_DAYS = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  // Кто платит — по JWT из заголовка
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json(401, { error: "not logged in" });

  // Касса ещё не подключена — честный стаб, клиент покажет «скоро»
  if (!YK_SHOP_ID || !YK_SECRET) {
    return json(200, { stub: true });
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Своя запись платежа ДО похода в кассу — её id служит ключом идемпотентности
  const { data: payment, error: insErr } = await service
    .from("payments")
    .insert({ user_id: user.id, amount: PRICE_RUB, currency: "RUB" })
    .select("id")
    .single();
  if (insErr) return json(500, { error: "payment insert failed" });

  const ykRes = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": payment.id,
      "Authorization": "Basic " + btoa(`${YK_SHOP_ID}:${YK_SECRET}`),
    },
    body: JSON.stringify({
      amount: { value: PRICE_RUB, currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: RETURN_URL },
      description: `Pithy Pro — подписка на ${SUB_DAYS} дней`,
      save_payment_method: true,
      metadata: { user_id: user.id, payment_id: payment.id },
    }),
  });
  if (!ykRes.ok) {
    const detail = await ykRes.text();
    console.error("[PAY] yookassa create failed:", ykRes.status, detail);
    await service.from("payments")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", payment.id);
    return json(502, { error: "provider error" });
  }

  const yk = await ykRes.json();
  await service.from("payments")
    .update({ provider_payment_id: yk.id, updated_at: new Date().toISOString() })
    .eq("id", payment.id);

  return json(200, { url: yk.confirmation?.confirmation_url ?? null });
});

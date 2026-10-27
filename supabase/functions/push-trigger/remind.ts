// Режим push-trigger «remind»: напоминание в местное время, которое выбрал человек
// (миграция 20261027120000_remind_time.sql, PLAN_NEW_USER.md → A3). Cron зовёт его
// раз в 10 минут. Выбор аудитории и пересчёт следующего момента — в SQL
// (push_audience_remind / advance_remind), здесь только отправка.
// Вынесено из index.ts, чтобы тот не рос: всё нужное приходит через RemindDeps.

type Tpl = { title: string; body: string; url: string };
type RemindRow = { user_id: string; tz: string; remind_at: string; overdue_min: number };

export type RemindDeps = {
  rpc: (fn: string, args?: Record<string, unknown>) =>
    PromiseLike<{ data: unknown; error: { message: string } | null }>;
  loadTemplate: (kind: string) => Promise<Tpl | null>;
  // Один и тот же текст на все подписки перечисленных пользователей
  sendToUsers: (uids: string[], tpl: Tpl, vars: Record<string, string>) =>
    Promise<{ sent: number; failed: number }>;
  logSent: (uids: string[], kind: string) => Promise<void>;
};

// Опоздали больше чем на это (простой cron, сбой функции) — не шлём: «в 7:40»,
// пришедшее в полдень, хуже, чем пропущенное; момент всё равно сдвигаем на завтра
const MAX_OVERDUE_MIN = 120;

export async function runRemind(d: RemindDeps): Promise<Record<string, unknown>> {
  const { data, error } = await d.rpc("push_audience_remind");
  if (error) return { error: error.message };
  const rows = (data ?? []) as RemindRow[];
  if (!rows.length) return { audience: 0 };

  // Сначала сдвигаем момент, потом шлём: если сдвиг не удался, повторная
  // отправка каждые 10 минут хуже одного пропущенного напоминания
  const advanced = await Promise.all(rows.map(async (r) => {
    const res = await d.rpc("advance_remind", { p_user_id: r.user_id });
    return res.error ? null : r;
  }));
  const ready = advanced.filter((r): r is RemindRow => r !== null);
  const advanceErrors = rows.length - ready.length;

  const fresh = ready.filter(r => r.overdue_min <= MAX_OVERDUE_MIN);
  const tpl = fresh.length ? await d.loadTemplate("remind_word") : null;
  if (!tpl) {
    return { audience: rows.length, skipped: true, late: ready.length - fresh.length, advanceErrors };
  }
  // {word}: слова пока нет — подставляем общее «слово», чтобы в тексте не торчали скобки
  const uids = fresh.map(r => r.user_id);
  const res = await d.sendToUsers(uids, tpl, { word: "слово" });
  await d.logSent(uids, "remind_word");
  return { audience: rows.length, late: ready.length - fresh.length, advanceErrors, ...res };
}

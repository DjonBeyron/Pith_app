// Обратный отсчёт на ответ (лимит времени ноды, timeLimitSec). Чистая логика без React и таймеров: время подставляет вызывающий код.
// Время считается только пока вкладка видна: ушёл в другое приложение — отсчёт стоит, вернулся — продолжается с того же места.
// Остановка (панель не активна: ответ уже дан, играет сигнал) тоже не сжигает время: вызывающий просто не зовёт tick.
export function createCountdown(totalMs) {
  let elapsed = 0
  let last = null
  return {
    /** Начать/продолжить отсчёт с момента now (после паузы, возврата во вкладку, снятия заморозки) */
    resume(now) { last = now },
    /** Прошло времени с прошлого вызова; visible=false — вкладка скрыта, время не идёт. @returns {{leftMs: number, fraction: number, expired: boolean}} */
    tick(now, visible = true) {
      if (last != null && visible) elapsed += Math.max(0, now - last)
      last = now
      const leftMs = Math.max(0, totalMs - elapsed)
      return { leftMs, fraction: totalMs > 0 ? leftMs / totalMs : 0, expired: leftMs <= 0 }
    },
  }
}

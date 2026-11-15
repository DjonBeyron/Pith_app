// Чистая часть кнопки «Отправить в GitHub» (shared/ui/SendLogButton.jsx): что считать успехом и как выполнить отправку без залипания.
export const isSent = msg => typeof msg === 'string' && msg.startsWith('Отправлено')
/** Выполнить отправку: → { msg, ok } (сбой send — строка «Не отправилось: …», кнопка не залипает в «Отправляю…») */
export async function runSend(send) {
  let msg
  try { msg = await send() } catch (err) { msg = `Не отправилось: ${err?.message ?? 'ошибка'}` }
  return { msg, ok: isSent(msg) }
}
export const SHOW_OK_MS = 5000
export const SHOW_FAIL_MS = 6000


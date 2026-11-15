// Чистая часть кнопки «Отправить в GitHub» (shared/ui/SendLogButton.jsx): что считать успехом и как выполнить отправку без залипания.
export const isSent = msg => typeof msg === 'string' && msg.startsWith('Отправлено')
export const COMMENT_MAX = 2000 // символов комментария к логам (попап перед отправкой)
/** Выполнить отправку: → { msg, ok } (сбой send — строка «Не отправилось: …», кнопка не залипает в «Отправляю…»). comment — текст из попапа, opts — { withLogs, append } из галочек: уходит в send(comment, opts) */
export async function runSend(send, comment = '', opts = {}) {
  let msg
  try { msg = await send(comment, opts) } catch (err) { msg = `Не отправилось: ${err?.message ?? 'ошибка'}` }
  return { msg, ok: isSent(msg) }
}
export const SHOW_OK_MS = 5000
export const SHOW_FAIL_MS = 6000


// Галочки попапа «Комментарий к логам» запоминаются между открытиями (владелец 2026-11-15): «Отправить логи» (по умолчанию включена) и «Дополнить» (по умолчанию выключена)
export const LOG_OPTS_KEY = 'pithy_send_log_opts_v1'
export function readLogOpts(store = globalThis.localStorage) {
  try { const o = JSON.parse(store?.getItem(LOG_OPTS_KEY) ?? 'null'); return { withLogs: o?.withLogs !== false, append: o?.append === true } } catch { return { withLogs: true, append: false } }
}
export function writeLogOpts(opts, store = globalThis.localStorage) {
  try { store?.setItem(LOG_OPTS_KEY, JSON.stringify({ withLogs: opts.withLogs !== false, append: opts.append === true })) } catch { /* без хранилища галочки просто не запомнятся */ }
}

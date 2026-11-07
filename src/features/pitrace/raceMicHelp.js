// Тексты про микрофон в попапе «Голосом / Пальцами» (RaceAskPlate.jsx), чистые, без React. iPhone спрашивает доступ при первом getUserMedia за запуск (поток потом живёт весь сеанс страницы, gameMic.js):
//  • до тапа — подсказка «iPhone спросит…», если поток в этом сеансе ещё не открывали и микрофон не разрешали последний час (отметка micGrantFlag.js; navigator.permissions на iOS не работает);
//  • отказ или ошибка — плашка с двумя абзацами: Safari (настройки сайта) и приложение с «Домой» (там настроек сайта нет — открыть заново и нажать «Разрешить»); абзац текущего режима — первым.
export const MIC_NOTE_TEXT = 'iPhone спросит разрешение на микрофон один раз за запуск, нажми «Разрешить»'
export const MIC_NOTE_MAX_AGE_MS = 60 * 60 * 1000 // разрешали меньше часа назад — подсказку не показываем
export const RETRY_LABEL = 'Попробовать снова'
export const MIC_HELP_TITLES = { denied: 'Микрофон не разрешён', unavailable: 'Микрофон не открылся' }
export const MIC_HELP_TEXTS = {
  safari: 'В Safari: «⋯» → Настройки веб-сайта → Микрофон → Разрешить. Или: Настройки → Приложения → Safari → Настройки для веб-сайтов → Микрофон.',
  home: 'Приложение с «Домой»: открой его заново и в диалоге нажми «Разрешить». Настройки сайта там недоступны.',
}

/** Показать ли подсказку до тапа: поток сеанса не жив и (не разрешали никогда или больше maxAge назад) */
export function needsMicNote({ alive = false, grantedAt = null, now = Date.now(), maxAgeMs = MIC_NOTE_MAX_AGE_MS } = {}) {
  if (alive) return false
  return grantedAt == null || now - grantedAt > maxAgeMs
}

/** Приложение открыто с экрана «Домой» (standalone) */
export function isStandalone(win = globalThis.window) {
  try { return !!(win?.matchMedia?.('(display-mode: standalone)')?.matches || win?.navigator?.standalone === true) } catch { return false }
}

/** Плашка отказа: { mic, mode, title, paras: [{ id, text, current }] } — абзац текущего режима первым. mic — ответ startGameAudio ('denied' | иное → 'unavailable') */
export function micHelp(mic, standalone = false) {
  const kind = mic === 'denied' ? 'denied' : 'unavailable'
  const mode = standalone ? 'home' : 'safari'
  const order = standalone ? ['home', 'safari'] : ['safari', 'home']
  return { mic: kind, mode, title: MIC_HELP_TITLES[kind], paras: order.map(id => ({ id, text: MIC_HELP_TEXTS[id], current: id === mode })) }
}

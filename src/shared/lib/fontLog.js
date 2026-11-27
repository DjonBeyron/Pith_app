// Журнал загрузки веб-шрифтов (Montserrat / Comfortaa с Google Fonts, index.html) — только при отладочном интерфейсе (его включает useLagTrace игры). Зачем: в журнале слабого Android v3.3.390
// три всплеска «вынужденный пересчёт стилей» (экзамен — смена слуха на русский, итог, комментарий) пришлись на первые показы русского текста; если шрифт догружается в этот миг, браузер заново
// раскладывает весь текст страницы. Строка «[fonts] загружено …» рядом с [jank] скажет, так ли это (мс — метка строки журнала).
const names = list => [...(list ?? [])].map(f => `${f.family} ${f.weight}${f.unicodeRange && f.unicodeRange !== 'U+0-10FFFF' ? ` ${String(f.unicodeRange).slice(0, 24)}` : ''}`).join(', ') || '—'

/** Подписка на загрузку шрифтов: log(строка) на начале / конце / ошибке. → отписка. Нет FontFaceSet — пустая отписка */
export function watchFonts(log, fonts = globalThis.document?.fonts) {
  if (!fonts?.addEventListener) return () => {}
  const on = (type, text) => { const h = e => { try { log(`[fonts] ${text}: ${names(e.fontfaces)}`) } catch { /* журнал не мешает */ } }; fonts.addEventListener(type, h); return () => fonts.removeEventListener(type, h) }
  const offs = [on('loading', 'начали грузить'), on('loadingdone', 'загружено'), on('loadingerror', 'не загрузилось')]
  return () => offs.forEach(f => f())
}

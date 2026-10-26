// Данные ноды «Переверни телефон» для вертикальной игры: что за слово, как его перевести. Пока слово одно (проверка концепции) — несколько слов позже, цикл по списку.
// Поля typeData.rotate_phone: content (текст карточки), word (слово, латиница), translation (перевод — ученик получает его в финале), lang (язык распознавания, по умолчанию en-US).
// Пустая нода (автор ещё ничего не настроил) играет встроенным словом — игра есть всегда, как и раньше.

export const DEMO_WORD = { word: 'try', translation: 'пытаться, пробовать' }

export function readWordLane(tData) {
  const td = tData ?? {}
  const word = String(td.word ?? '').trim()
  return {
    title: String(td.content ?? '').trim() || 'Повтори за диктором',
    word: word || DEMO_WORD.word,
    translation: word ? String(td.translation ?? '').trim() : (String(td.translation ?? '').trim() || DEMO_WORD.translation),
    lang: String(td.lang ?? '').trim() || 'en-US',
    isDemo: !word,
  }
}

/** Отладочные опорные точки геометрии (WordLaneDebug.jsx): localStorage pithy_wl_debug=1 или ?wldebug в адресе */
export function isWordLaneDebug() {
  try { return globalThis.localStorage?.getItem('pithy_wl_debug') === '1' || /[?&]wldebug\b/.test(globalThis.location?.search ?? '') } catch { return false }
}

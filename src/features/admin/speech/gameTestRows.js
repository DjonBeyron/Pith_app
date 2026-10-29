// «Тест игры» в админке (GameTestBlock.jsx): чистая часть — куски фразы с ключами библиотеки озвучки слов и сохранение формы в браузере админа.
import { parsePhrase } from '../../player/modules/rotate-phone/wordLaneRecipe.js'
import { wordKey, cleanWordText } from '../../../shared/lib/wordAudio/wordKey.js'

export const TEST_KEY = 'pithy_wl_test_v1'
export const TEST_DEFAULTS = { phrase: "I'm | trying | to learn", translation: 'Я пытаюсь научиться' }

/** Форма из хранилища браузера (фраза и перевод); нет хранилища / мусор — значения по умолчанию */
export function loadTestForm(store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store?.getItem(TEST_KEY) ?? 'null')
    return { phrase: String(v?.phrase ?? TEST_DEFAULTS.phrase), translation: String(v?.translation ?? TEST_DEFAULTS.translation) }
  } catch { return { ...TEST_DEFAULTS } }
}
export function saveTestForm(form, store = globalThis.localStorage) {
  try { store?.setItem(TEST_KEY, JSON.stringify(form)) } catch { /* приватный режим — живёт до перезагрузки */ }
}

/** Куски фразы для списка «есть / нет озвучки»: { text (как показывать и озвучивать), key (wordKey или null — не для озвучки), has (есть ли в библиотеке lib: Map key → строка) } */
export function chunkRows(phrase, lib) {
  return parsePhrase(phrase).map(raw => { const key = wordKey(raw); return { text: cleanWordText(raw), key, has: !!(key && lib?.get(key)) } })
}

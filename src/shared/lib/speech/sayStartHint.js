// Подсказка «начать можно так…» для «Сказать фразу»: если ученик ничего не говорит ~10 секунд, в чат (пузырь слева) приходит ТОЛЬКО НАЧАЛО фразы — по слову на строке, с переводом.
// Чистые функции, без React. Откуда строки: поле ноды startHint (по строке «I — я», автор пишет сам: словаря слов в приложении нет); нет поля у СВОБОДНОЙ фразы (pattern) — берём первые слова
// шаблона до первой группы/звёздочки (без перевода); у обычной фразы-эталона без startHint подсказки нет (там ученик повторяет за голосом, начало выдавать незачем).
// Всё отключается hintsOn=false. Подсказка не тратит попытку и приходит один раз за модуль (таймер — useSayStartHint.js).
import { START_HINT_TITLE } from './sayTexts.js'

export const START_HINT_DELAY_MS = 10000
const MAX_AUTO_WORDS = 2

// Первые слова шаблона ДО первой группы или звёздочки, с авторским написанием («I'm», «I»): «I (try|am trying) to **» → [I], «I'm trying to **» → [I'm, trying]
function patternStart(pattern) {
  const out = []
  for (const w of String(pattern ?? '').trim().split(/\s+/)) {
    if (!w || /[()*?|]/.test(w)) break
    const clean = w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '')
    if (clean) out.push(clean)
    if (out.length >= MAX_AUTO_WORDS) break
  }
  return out
}

/** Строки подсказки (по одной на слово): из startHint ноды, иначе начало шаблона свободной фразы, иначе []. data — readSayData */
export function startHintLines(data) {
  if (!data || data.hintsOn === false) return []
  const own = String(data.startHint ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  if (own.length) return own
  return data.pattern ? patternStart(data.pattern) : []
}

/** Текст пузыря «Начать можно так…» с переносами строк или null, если подсказки нет */
export function startHintText(data) {
  const lines = startHintLines(data)
  return lines.length ? `${START_HINT_TITLE}\n${lines.join('\n')}` : null
}

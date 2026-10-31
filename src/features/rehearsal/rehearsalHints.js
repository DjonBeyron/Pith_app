// Подсказки «застрял» в акте «без текста» (CONCEPT_REHEARSAL.md §3 акт 4 и §8): слушатель молчит STUCK_MS — Пит подсказывает. Подсказок на ступень две, и какая первая, выбрано по семени (rehearsalVariety.blindVariety):
//  word — «Начни с слово»: Пит говорит «Начни с», затем первое слово, над дорожкой на 2 с подпись куска;
//  tr   — перевод куска: над дорожкой на 2 с подпись-перевод (Пит молчит: перевод по-русски озвучки в библиотеке слов не имеет).
// Нет перевода или подсказок в ступени нет — всегда word. Чистые функции.
//  Голос подсказки «слово» (sayWordHint): сначала озвученная реплика rh_blind_hint_pre «Начни с» (подпись на экране целиком — «Начни с слово»), потом слово из библиотеки слов; нет озвучки «Начни с» — только слово, как раньше.
import { lineMs } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { fillLine } from './rehearsalLines.js'

export const HINT_WORD_GAP_MS = 120 // пауза между голосом «Начни с» и самим словом

/** Подсказка номер n (0, 1…) ступени stage: { kind: 'word' | 'tr', lane, word?, text } */
export function stuckHint(stage, n = 0) {
  const kinds = stage?.hintKinds?.length ? stage.hintKinds : ['word']
  let kind = kinds[n % kinds.length]
  if (kind === 'tr' && !stage?.hintTr) kind = 'word'
  const lane = stage?.hintLane ?? 0
  return kind === 'tr' ? { kind, lane, text: stage.hintTr } : { kind, lane, word: stage?.hintWord, text: stage?.hintWord }
}

/** Что в s.hint для подсказки: номер дорожки (покажется подпись куска) или { lane, text } (покажется этот текст) */
export const hintEntry = h => (h.kind === 'tr' ? { lane: h.lane, text: h.text } : h.lane)

/** Запись подсказки на дорожке lane в списке hint (число или { lane, text }); нет — undefined */
export const hintAt = (hint, lane) => hint.find(h => (h?.lane ?? h) === lane)

/** Подсказка «слово» голосом: lines — реплики (url озвучки), sayLine(id, vars) → принята ли, sayText(слово) — слово из библиотеки слов. → id таймера слова (0 — слово сказано сразу, таймера нет) */
export function sayWordHint({ word, lines, rate = 1, sayLine, sayText, setTimer = setTimeout }) {
  const pre = lines?.rh_blind_hint_pre
  const caption = fillLine(lines?.rh_blind_hint, { word })?.text ?? `Начни с ${word}`
  if (pre?.url && sayLine('rh_blind_hint_pre', { caption })) return setTimer(() => sayText(word), lineMs(pre, rate) + HINT_WORD_GAP_MS)
  sayLine('rh_blind_hint', { word }); sayText(word) // нет озвучки «Начни с» (или Пит занят): подпись и только слово
  return 0
}

// «Неточное слово» в фразе «Скажи» (владелец, v3.3.275): фраза принята (ratio ≥ PHRASE_OK), но слова не хватает — засчитываем ВИЗУАЛЬНО (пилюля заливается до 80 %, взлетает), а дальше правила:
//  • первая неточность в фразе: Пит — «слово [X] сказано чуть не точно, попробуй ещё раз»; XP даётся; если это ПОСЛЕДНЯЯ пилюля фразы (проход 2) — ОДИН раз запускается ещё одна пилюля этой фразы;
//  • вторая (на том же или другом слове, в любом проходе/доп. пилюле): Пит — «слово [X] сказано не точно, в следующий раз у тебя получится»; пилюля засчитана визуально, но XP нет, доп. пилюли нет.
// X — первое слово фразы, которого не услышали. Счёт неточностей — по фразе (ключ цели), на круг «Скажи». Чистые функции, без DOM.
import { phraseWords } from './racePhraseData.js'

export const PARTIAL_PATH = 0.7 // неполная фраза засчитывается, когда пилюля прошла ≥ 70 % пути (осталось ≤ 30 %); раньше — ждём, ученик может поправиться
export const SLIP_WORD_LINE = 'race_slip_word'   // «слово»
export const SLIP_RETRY_LINE = 'race_slip_retry' // «сказано чуть не точно, попробуй ещё раз»
export const SLIP_NEXT_LINE = 'race_slip_next'   // «сказано не точно, в следующий раз у тебя получится»

/** Первое слово фразы, которого нет среди услышанных (heard — Map номер слова → …); все сказаны — null */
export function missedWord(text, heard) {
  const ws = phraseWords(text)
  for (let i = 0; i < ws.length; i++) if (!heard?.has?.(i)) return ws[i]
  return null
}

/** Счётчик неточностей по фразам: note(key) → какая это по счёту у этой фразы (1, 2, …) */
export function createSlips() {
  const n = new Map()
  return { note: key => { const c = (n.get(key) ?? 0) + 1; n.set(key, c); return c }, count: key => n.get(key) ?? 0 }
}

/** Решение по неточной фразе: { word, nth, noXp, extra } — extra: запустить ещё одну пилюлю (первая неточность на проходе 2, и это не сама доп. пилюля) */
export const slipRule = ({ word, nth, pass, isExtra = false }) => ({ word, nth, noXp: nth >= 2, extra: nth === 1 && pass === 2 && !isExtra })

/**
 * Итог хода «Скажи» принят неполно: дописать res (slip, noXp) и при необходимости вставить в turns после текущего ход-копию (доп. пилюля, один раз).
 * turns — массив ходов сцены (меняется на месте, номера idx пересчитываются), ti — номер текущего хода, heard — Map сказанных слов
 */
export function applySlip({ res, turns, ti, slips, heard }) {
  const t = turns[ti]
  if (!res?.ok || !(res.ratio < 1 - 1e-9) || !t) return null
  const word = missedWord(t.target.text, heard)
  if (!word) return null
  const s = slipRule({ word, nth: slips.note(t.target.key), pass: t.pass, isExtra: !!t.extra })
  res.slip = s; if (s.noXp) res.noXp = true
  if (s.extra) { turns.splice(ti + 1, 0, { ...t, extra: true }); turns.forEach((x, i) => { x.idx = i }) }
  return s
}

/** Реплики Пита: «слово» → слово по-английски → «сказано не точно, …» (цепочка racePhraseVoice) */
export const SLIP_PAUSE_MS = 80 // пауза после реплики цепочки (было LINE_PAUSE_MS 600 — «Пит говорит с тормозами»): микрофон между ходами не слушает, эхо не страшно
export const slipItems = s => (s?.word ? [{ line: SLIP_WORD_LINE, pause: SLIP_PAUSE_MS, join: true }, { word: s.word }, { line: s.nth > 1 ? SLIP_NEXT_LINE : SLIP_RETRY_LINE, pause: SLIP_PAUSE_MS, join: true }] : [])

/** Хвост строки журнала: слово, номер неточности, XP и доп. пилюля */
export const slipNote = s => (s ? `; неточно слово «${s.word}» (${s.nth}-й раз${s.noXp ? ', XP нет' : ''}${s.extra ? ', ещё одна пилюля' : ''})` : '')

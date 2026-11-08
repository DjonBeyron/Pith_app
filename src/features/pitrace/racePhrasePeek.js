// Подсказка следующего слова в проходе 1 «Скажи» (замечание владельца 2026-11-08: «пока говорю слово k, слово k+1 начинает проявляться по буквам, не ярче 30 %; сказал — оно целиком,
// и проявляется k+2»). Какое слово — racePhraseMask.nextPeek (первое спрятанное после самого дальнего услышанного); вид — data-w='peek' (race-phrase-rounds.css: opacity 0,3 и маска-градиент
// по --peek). Проявление ведёт этот модуль: --peek растёт 0 → 100 % за PEEK_MS от момента, когда слово стало подсказкой, — каждый кадр, только у одной ячейки (maskView.peek пишет при смене).
// Начинается с первого голоса (onLevel) или первого услышанного слова — до речи кирпичики остаются кирпичиками. В проходе 2 подсказки нет (текст открыт). Время — аргументом.
import { nextPeek } from './racePhraseMask.js'

export const PEEK_MS = 1200

/** → { start(heard, t), frame(t), index() }. mask — маска пилюли (racePhraseMaskView: set(heard, all, peek), peek(pct)); text — фраза */
export function createPeek({ mask, text }) {
  let idx = -1, at = 0, on = false
  return {
    /** Голос пошёл или услышано слово: подсказка — следующее спрятанное слово; маска перерисована с ней (heard — Map номер слова → подтверждено ли) */
    start(heard, t) {
      const i = nextPeek(text, heard)
      if (i !== idx) { idx = i; at = t }
      on = true
      mask?.set(heard, false, idx)
      return idx
    },
    /** Кадр: проявление подсказки по буквам */
    frame(t) { if (on && idx >= 0) mask?.peek(((t - at) / PEEK_MS) * 100) },
    /** Какое слово сейчас подсказано (-1 — никакое / ещё не начато) */
    index: () => (on ? idx : -1),
    started: () => on,
  }
}

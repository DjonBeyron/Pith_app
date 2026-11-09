// «Неверное слово» в проходе 1 «Скажи» (решение владельца 2026-11-09: сказал неверное слово — линия заливки «дёрнулась красным и вернулась», заливка не меняется; рывок — racePhraseNudge.js).
// Vosk отдаёт черновики часто и шумно, поэтому правило строгое: берём сырой текст слуха (onEar слушателя: черновик / итог захода) и смотрим только ЗАВЕРШЁННЫЕ слова — в черновике за словом
// уже есть следующее, в итоге захода — все. Каждое завершённое слово (позиция в заходе) — один раз. Решение — на кадре сцены (check), когда onWord того же черновика уже отметил сказанные
// слова цели: слово НЕВЕРНОЕ, если оно не совпадает ни с ожидаемым (слово сразу за самым дальним сказанным), ни с уже сказанными словами цели (то же сравнение форм, что решает зачёт
// слова: racePhraseScore.wordHits — сокращения, «am» за «I'm»), и не является ни префиксом ожидаемого слова, ни его частью («i» из «I'm» → «i am»). Рывок — не чаще WRONG_GAP_MS;
// неверное слово внутри паузы пропускается (лучше пропустить рывок, чем дёргать на каждый черновик). Шум без слов (пустой текст, «[unk]») слов не даёт. Все слова сказаны — не проверяем.
import { tokenize } from '../../shared/lib/speech/speechMatch.js'
import { wordHits } from './racePhraseScore.js'
import { normForms } from './racePhraseForms.js'

export const WRONG_GAP_MS = 700

const low = w => normForms(String(w ?? '')).toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
/** Одно услышанное слово heard — это слово цели word? (то же сравнение, что у зачёта слова) */
export const sameWord = (heard, word) => !!wordHits([word], heard)[0]
/** Услышанное слово «подходит» к ожидаемому: оно само, его префикс («wan» — «want») или его часть («i» — «I'm» = «i am») */
export const fitsWord = (heard, word) => { const h = low(heard), w = low(word); return !!h && (sameWord(h, w) || w.startsWith(h) || tokenize(w).includes(h)) }

/** → { ear(e), check(said, t) }. words — слова фразы-цели (phraseWords). ear — событие слуха { kind: 'partial' | 'final', text }; check — на кадре: said — Map сказанных номеров слов, → { word, expect } или null */
export function createWrongWord({ words, gap = WRONG_GAP_MS }) {
  let seen = 0, first = null, queue = [], lastAt = -Infinity
  return {
    ear(e) {
      if (e?.kind !== 'partial' && e?.kind !== 'final') return
      const ws = String(e.text ?? '').toLowerCase().split(/\s+/).filter(w => w && w !== '[unk]')
      if (ws[0] !== first) { seen = 0; first = ws[0] ?? null } // новый заход (или Vosk переписал начало)
      const done = e.kind === 'final' ? ws.length : ws.length - 1
      for (let i = seen; i < done; i++) queue.push(ws[i])
      seen = Math.max(0, done)
      if (e.kind === 'final') { seen = 0; first = null }
    },
    check(said, t) {
      if (!queue.length) return null
      const q = queue; queue = []
      const k = said.size ? Math.max(...said.keys()) + 1 : 0, expect = words[k]
      if (expect == null) return null
      const bad = q.find(w => !fitsWord(w, expect) && ![...said.keys()].some(i => words[i] != null && sameWord(w, words[i])))
      if (bad == null || t - lastAt < gap) return null
      lastAt = t
      return { word: bad, expect }
    },
  }
}

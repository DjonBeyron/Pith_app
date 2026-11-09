// «Неверное слово» в проходе 1 «Скажи» (решение владельца 2026-11-09: сказал неверное слово — линия заливки «дёрнулась красным и вернулась», заливка не меняется; рывок — racePhraseNudge.js).
// Vosk отдаёт черновики часто и шумно, поэтому правило строгое: берём сырой текст слуха (onEar слушателя: черновик / итог захода) и смотрим только ЗАВЕРШЁННЫЕ слова — в черновике за словом
// уже есть следующее, в итоге захода — все. Каждое завершённое слово (позиция в заходе) — один раз. Решение — на кадре сцены (check), когда onWord того же черновика уже отметил сказанные
// слова цели: слово НЕВЕРНОЕ, если оно не совпадает ни с ожидаемым (первое не сказанное по порядку — там стоит линия и подсказка; и слово за самым дальним сказанным), ни с каким словом цели
// (сказанным или ещё нет — слово не по порядку не ошибка; то же сравнение форм, что решает зачёт слова: racePhraseScore.wordHits — сокращения, «am» за «I'm»), и не является ни префиксом
// ожидаемого слова, ни его частью. Рывок — не чаще WRONG_GAP_MS; неверное слово внутри паузы пропускается (лучше пропустить рывок, чем дёргать на каждый черновик). Шум без слов (пустой текст, «[unk]») слов не даёт. Все слова сказаны — не проверяем.
// ЧАСТИ СОКРАЩЕНИЙ (2026-11-09, журнал владельца v3.3.174, «I'm trying to learn»: черновики «i'm», «i», «i am» → «[fill] неверное слово «i», ждём «trying»» — ложный красный рывок): Vosk режет
// «I'm» до «i» и пишет его как «i am». Не неверно слово, которое вместе с соседним в том же заходе даёт слово цели («i» + «am» = «I'm», «you» + «are» = «you're» — racePhraseForms / tokenize),
// и одиночная часть слова-сокращения цели («i», когда в цели есть «I'm»).
import { tokenize } from '../../shared/lib/speech/speechMatch.js'
import { wordHits } from './racePhraseScore.js'
import { normForms } from './racePhraseForms.js'

export const WRONG_GAP_MS = 700

const low = w => normForms(String(w ?? '')).toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
/** Одно услышанное слово heard — это слово цели word? (то же сравнение, что у зачёта слова) */
export const sameWord = (heard, word) => !!wordHits([word], heard)[0]
/** Услышанное слово «подходит» к ожидаемому: оно само, его префикс («wan» — «want») или его часть («i» — «I'm» = «i am») */
export const fitsWord = (heard, word) => { const h = low(heard), w = low(word); return !!h && (sameWord(h, w) || w.startsWith(h) || tokenize(w).includes(h)) }
/** Слово — часть сокращения из слов цели: одно («i» при «I'm» в цели) или вместе с соседним в заходе («i» + «am»). prev / next — соседние слова захода */
export const formPart = (heard, words, prev = null, next = null) => {
  const h = low(heard)
  const pair = (a, ts) => tokenize(low(a)).join(' ') === ts.join(' ') // пара слов — ровно токены сокращения («cat am» — нет, хотя «am» одно и засчитывает «I'm»)
  return !!h && words.some(word => { const ts = tokenize(low(word)); return ts.length > 1 && (ts.includes(h) || (prev != null && pair(`${prev} ${h}`, ts)) || (next != null && pair(`${h} ${next}`, ts))) })
}

/** → { ear(e), check(said, t) }. words — слова фразы-цели (phraseWords). ear — событие слуха { kind: 'partial' | 'final', text }; check — на кадре: said — Map сказанных номеров слов, → { word, expect } или null */
export function createWrongWord({ words, gap = WRONG_GAP_MS }) {
  let seen = 0, first = null, queue = [], lastAt = -Infinity
  return {
    ear(e) {
      if (e?.kind !== 'partial' && e?.kind !== 'final') return
      const ws = String(e.text ?? '').toLowerCase().split(/\s+/).filter(w => w && w !== '[unk]')
      if (ws[0] !== first) { seen = 0; first = ws[0] ?? null } // новый заход (или Vosk переписал начало)
      const done = e.kind === 'final' ? ws.length : ws.length - 1
      for (let i = seen; i < done; i++) queue.push({ w: ws[i], prev: ws[i - 1] ?? null, next: ws[i + 1] ?? null })
      seen = Math.max(0, done)
      if (e.kind === 'final') { seen = 0; first = null }
    },
    check(said, t) {
      if (!queue.length) return null
      const q = queue; queue = []
      let k = 0
      while (said.has(k)) k++
      const expect = words[k], far = said.size ? words[Math.max(...said.keys()) + 1] : null
      if (expect == null) return null
      const bad = q.find(({ w, prev, next }) => !fitsWord(w, expect) && !(far != null && fitsWord(w, far)) && !words.some(x => sameWord(w, x)) && !formPart(w, words, prev, next))
      if (bad == null || t - lastAt < gap) return null
      lastAt = t
      return { word: bad.w, expect }
    },
  }
}

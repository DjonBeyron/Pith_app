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
const VOICE = '[voice]'
export const VOICE_SOFT = '[voice?]' // громкий голос, а Vosk не вернул НИ ОДНОГО слова цели на первом слове (v3.3.401, racePhraseVoiceWrong.js): красное слово без рывка, не «неверное слово»
export const SHOWN_GAP_MS = 350 // подпись неверного слова — не чаще
export const TAIL_FAST_MS = 200 // проход 2 «Скажи» (v3.3.402, журнал v3.3.401: красное первого слова шло 260–360 мс после черновика и на движущейся пилюле терялось): слово ЦЕЛИ не на своём месте («you» вместо «Nice») Vosk не переписывает в другое — хвост стоит столько
export const TAIL_STABLE_MS = 350 // последнее (ещё говорящееся) слово черновика, не меняясь столько, годится для подписи — не ждём следующего слова (v3.3.285; v3.3.314: было 200 — журнал владельца: первый черновик Vosk «is» / «in» / «a» переписывался на верное слово через 260–270 мс, а красное и рывок уже срабатывали)

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
export function createWrongWord({ words, gap = WRONG_GAP_MS, fast = false }) { // fast — проход 2: хвост-слово цели годится для подписи за TAIL_FAST_MS
  let seen = 0, first = null, tail = null, queue = [], lastAt = -Infinity, lastShownAt = -Infinity, shownWord = null, lastShown = null, retract = false
  let prior = 0, closing = false // prior — сколько слов по порядку было сказано к концу ПРОШЛОГО захода: их повтор в новом заходе — неверное слово (v3.3.314, владелец: «не засчитывает неверное, иногда вообще игнор» — журнал: «to» вместо «tomorrow» молчало 3,3 с до итога)
  return {
    ear(e) {
      if (e?.kind === 'wrong') { queue.push({ w: e.soft ? VOICE_SOFT : VOICE, prev: null, next: null, soft: !!e.soft }); return } // голос без нового слова цели (слушатель, итог захода): неверное слово без текста
      if (e?.kind !== 'partial' && e?.kind !== 'final') return
      let real = false
      const ws = String(e.raw ?? e.text ?? '').toLowerCase().split(/\s+/).filter(w => { if (!w) return false; if (w !== '[unk]') { real = true; return true } return real }) // «[unk]» — слово вне словаря (громкое «is» вместо «are» → «where [unk]») — неверное слово, но только ПОСЛЕ настоящего слова захода: одинокий «[unk]» — шум (журнал v3.3.307: «[unk]» из тишины дал красное и рывок без единого слова)
      if (ws[0] !== first) { seen = 0; first = ws[0] ?? null } // новый заход (или Vosk переписал начало)
      const done = e.kind === 'final' ? ws.length : ws.length - 1
      for (let i = seen; i < done; i++) queue.push({ w: ws[i], prev: ws[i - 1] ?? null, next: ws[i + 1] ?? null })
      seen = Math.max(0, done)
      // последнее слово черновика ещё может меняться — для подписи (не рывка) берём его, когда оно не меняется TAIL_STABLE_MS (v3.3.285: красное сразу по первому неверному слову)
      const last = e.kind === 'partial' && ws.length ? ws[ws.length - 1] : null
      if (!last) tail = null; else if (!tail || tail.w !== last || tail.i !== ws.length - 1) tail = { w: last, prev: ws[ws.length - 2] ?? null, next: null, i: ws.length - 1, at: null, used: false, ms: fast && words.some(x => sameWord(last, x)) ? TAIL_FAST_MS : TAIL_STABLE_MS }
      if (e.kind === 'final') { if (lastShown && !ws.includes(lastShown)) retract = true; lastShown = null; seen = 0; first = null; tail = null; closing = true } // v3.3.302 (журнал владельца: «я сказал where is, сверху зачёркнуто you»): подпись взята из черновика, а итог захода этого слова не содержит — это был шум черновика, подпись снимается
    },
    /** Слово для подписи над ожидаемым (мягкое правило, раз на кадр после check): строка или null */
    shown() { const w = shownWord; shownWord = null; return w },
    /** Итог захода не содержит слово, показанное по черновику: подпись надо снять (один раз) */
    retracted() { const r = retract; retract = false; return r },
    check(said, t) {
      shownWord = null
      if (tail && tail.at == null) tail.at = t
      const stable = tail && !tail.used && t - tail.at >= tail.ms ? tail : null
      let k = 0
      while (said.has(k)) k++
      const was = prior
      if (closing) { closing = false; prior = k } // заход закрыт: всё сказанное к этому кадру — «прошлое»
      if (!queue.length && !stable) return null
      const q = queue; queue = []
      const expect = words[k], far = said.size ? words[Math.max(...said.keys()) + 1] : null
      if (expect == null) return null
      const bad = q.find(({ w, prev, next, soft }) => !soft && !fitsWord(w, expect) && !(far != null && fitsWord(w, far)) && !words.some(x => sameWord(w, x)) && !formPart(w, words, prev, next))
      // v3.3.282 (владелец, «where you from» вместо «where are you from»): исключаем только слова, УЖЕ стоящие в порядке (до ожидаемого k); слово «вперёд» («you», услышанное вместо «are») само в said, но подпись над «are» ему нужна
      const again = w => !sameWord(w, expect) && words.slice(0, was).some(x => sameWord(w, x)) // повтор слова из прошлых заходов: «to» при ожидаемом «tomorrow» — не «начало слова», а неверное
      const shown = (stable ? [...q, stable] : q).find(({ w, prev, next }) => (!fitsWord(w, expect) || again(w)) && !words.slice(was, k).some(x => sameWord(w, x)) && !formPart(w, words, prev, next)) // v3.3.314: исключаем слова, сказанные В ЭТОМ заходе (was…k); повтор слова из прошлых заходов — неверное. Для подписи над словом правило мягче (v3.3.272): любое слово, не подходящее ожидаемому, — и слово цели не на своём месте («where you from» — «you» вместо «are»)
      if (shown && t - lastShownAt >= SHOWN_GAP_MS) { lastShownAt = t; shownWord = shown.w; lastShown = shown.w === VOICE || shown.w === VOICE_SOFT ? null : shown.w; if (shown === stable) stable.used = true }
      if (bad == null || t - lastAt < gap) return null
      lastAt = t
      return { word: bad.w, expect }
    },
  }
}

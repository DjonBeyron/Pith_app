// Слушатель фраз этапа 2 «Фразы» (CONCEPT_RACE.md, «Этап 2» → «Слух фраз»): ученик говорит одну из фраз-кандидатов, слушатель отдаёт слова по мере речи (onWord — сегменты пилюли
// заполняются) и зачёт фразы (onPhrase). Только Vosk: поверх createGame2Listener (тот же путь, что «Мини-игра 2.0»: словарь grammarMax ≤ 4 слова за заход, потолок 1600 фраз, микрофон игры,
// isHeld = речь Пита) — его словарь собран из слов ВСЕХ кандидатов без повторов. Разбор услышанного — racePhraseScore.js (matchPhrase по каждому кандидату).
// Заходы короткие (словарь растёт степенью), поэтому услышанное копится между заходами в пределах JOIN_MS: фраза, сказанная в два захода, собирается целиком.
// Зачёт: полное однозначное совпадение — сразу по черновику; неполное (≥ PHRASE_OK, разрыв со вторым ≥ PHRASE_GAP) — только после конца захода и паузы SETTLE_MS (ученик мог не договорить).
// ПОСЛЕДНЕЕ СЛОВО (2026-11-07, замечание владельца C: «говорю быстро всю фразу — линия стоит на предпоследнем слове около секунды»): Vosk отдаёт слово в черновике с задержкой ≈ 0,25–0,45 с
// после звука (замер реальным Vosk EN в Chromium), а затвор тишины (voskGate.js) не даёт эндпойнтеру закрыть заход — без последнего слова в черновике заход ждал авто-стопа (3,5 с без новых слов)
// и ещё SETTLE_MS. Теперь: черновик покрывает все слова кандидата, КРОМЕ ПОСЛЕДНЕГО (однозначно), не меньше LAST_HOLD_MS, и звука нет QUIET_LAST_MS (уровень ниже GATE_RMS — порог затвора тишины: тихое слово ещё звук) — просим итог захода сразу (ear.stop:
// Vosk досылает хвост тишины и отдаёт итог за ≈ 0,1–0,2 с; последнее слово, если оно было сказано, приходит в нём — зачёт сразу, «чисто»). Итога с последним словом нет — неполное совпадение ждёт
// SETTLE_LAST_MS (а не SETTLE_MS); пока ждём, голос в микрофоне (следующий заход) отодвигает решение — медленный ученик успевает договорить.
// ПАУЗА ПЕРЕД ПОСЛЕДНИМ СЛОВОМ (2026-11-08, замечание владельца 7: «сказал фразу целиком — заливка стоит, потом дозаполняется»; замер реальным Vosk EN, фраза по словам с паузами 0,45 с):
// при QUIET_LAST_MS = 350 обычная пауза перед последним словом (0,4–0,6 с) уже считалась «договорил»: итог захода просили посреди паузы, заход закрывался, а последнее слово попадало
// в промежуток до следующего захода и терялось — заливка стояла на 75 %, через ≈ 1,1 с зачёт «нечисто» 0,75 доливал её. Теперь тишина — не меньше QUIET_LAST_MS = 650 мс и не меньше
// QUIET_PAUSE_K × самая длинная пауза между словами этой попытки (медленный ученик — дольше, до QUIET_MAX_MS), а следующий заход начинается сразу (restartMs 0).
// Выдержку затвора тишины (voskGate, 300 мс) НЕ удлиняем: при 600 мс эндпойнтер Vosk (0,5 с тишины) сам закрывал заход посреди фразы — слова терялись совсем (тот же замер).
// Журнал (таймлайн на телефоне, N — мс от первого звука попытки, до него — от сброса слушателя): «[phrase-ear] черновик «…» +N мс» — каждый новый черновик, «итог «…» +N мс» — КАЖДЫЙ итог захода
// (и с тем же текстом), «partial без изменений «…» +N мс» — черновик Vosk пришёл, а текст тот же (не чаще SAME_LOG_MS: видно, что черновики идут, а не застряли), «прошу итог захода» (lastOnly),
// «[gate] открыт|закрыт +N мс (rms …)» — затвор тишины voskGate (закрыт — тишина не идёт в Vosk). Каждое такое событие уходит и в onEar (отладочная полоска сцены).
// После зачёта заход закрывается, накопленное сбрасывается и слушание начинается заново. Пока isHeld() (говорит Пит) услышанное не учитывается. reset() (каждый новый ход сцены) забывает ВСЁ
// накопленное, в том числе прошлые заходы в окне JOIN_MS: фраза, которую Пит прочитал между ходами, в новый ход не попадает.
import { createGame2Listener } from '../game2/game2Listen.js'
import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'
import { pLog } from '../../shared/lib/debug.js'
import { scorePhrases, pickPhrase, unionWords, earLine, PHRASE_OK } from './racePhraseScore.js'
import { GATE_RMS } from '../../shared/lib/vosk/voskGate.js'

export { PHRASE_OK }
export const JOIN_MS = 6000   // услышанное прошлых заходов учитывается столько мс (фраза в два-три захода)
export const SETTLE_MS = 1200 // неполное совпадение засчитывается, если после конца захода новых слов нет столько мс
export const SETTLE_LAST_MS = 400 // то же, когда не хватает только ПОСЛЕДНЕГО слова (быстрая речь: итог захода уже спрошен)
export const QUIET_LAST_MS = 650 // черновик без последнего слова и тишина в микрофоне хотя бы столько мс — просим итог захода (было 350: см. «ПАУЗА ПЕРЕД ПОСЛЕДНИМ СЛОВОМ» выше)
export const QUIET_PAUSE_K = 1.5 // …и не меньше самой длинной паузы между словами попытки × столько
export const QUIET_MAX_MS = 1500 // потолок этой тишины
export const LAST_HOLD_MS = 150  // …и черновик продержался хотя бы столько
export const SAME_LOG_MS = 500   // «partial без изменений» в журнале — не чаще

/** Кандидат, у которого услышаны все слова, кроме последнего (и он однозначно лучший): ключ или null */
export function lastOnly(scores) {
  const p = pickPhrase(scores, true)
  return p && p.hits.length > 1 && !p.hits.at(-1) && p.hits.slice(0, -1).every(Boolean) ? p.key : null
}

const clean = raw => String(raw ?? '').toLowerCase().split(/\s+/).filter(w => w && w !== '[unk]').join(' ')
const norm = list => (list ?? []).map(p => ({ key: p.key, words: (p.words ?? []).map(w => String(typeof w === 'string' ? w : w?.text ?? '')).filter(Boolean) })).filter(p => p.key && p.words.length)

/**
 * phrases — [{ key, words: ['nice', 'to', 'meet', 'you'] }]; onWord({ phraseKey, index, text, draft }) — новое услышанное слово кандидата: draft — пока только в черновике (partial), потом то же слово
 * ещё раз с draft: false, когда его подтвердил итог захода (каждое — не больше двух раз до зачёта/сброса); onEar({ kind: 'partial' | 'final', text } | { kind: 'gate', open, rms }) — что слышит Vosk (отладочная полоска);
 * onLevel(rms, held) — уровень каждого куска звука микрофона (held — говорит Пит): проход 2 «Скажи» заливает пилюлю «под звук» (racePhraseVoiceFill.js), проход 1 начинает подсказку слова (peek);
 * onPhrase({ phraseKey, ratio, heard }) — кандидат сказан (ratio — доля слов: 1 — чисто, 0.75 — одно пропущено); onError(status) — 'unavailable' (нет модели) или 'error' (микрофон / Vosk).
 * Слушать начинает сразу. Зависимости (create, log, now, setTimer, clearTimer, listen, runtime) подставляются в тестах.
 */
export function createPhraseListener({ phrases: phrasesIn, lang = 'en', getStream, isHeld = () => false, onWord, onEar, onLevel, onPhrase, onError, create = createWordListener, game2 = createGame2Listener, log = pLog, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let phrases = norm(phrasesIn)
  let past = []   // услышанное закрытых заходов: [{ text, at }]
  let current = '' // текущий заход (последний черновик / итог)
  let sent = new Map() // ключ кандидата → Map(индекс слова → true, если уже подтверждён итогом; false — пока черновик)
  let settleTimer = 0
  let settleLast = false // ждём SETTLE_LAST_MS (не хватает только последнего слова): голос отодвигает решение
  let quietTimer = 0     // черновик без последнего слова: ждём тишину QUIET_LAST_MS, потом просим итог
  let pauseMax = 0 // самая длинная пауза между словами этой попытки (тишина между громкими кусками после первого слова)
  let voiceAt = -Infinity, firstAt = null, zero = now(), sameAt = -Infinity // последний громкий кусок звука; первый звук попытки (журнал +N мс); сброс слушателя; последняя строка «без изменений»
  let ear = null
  let gen = 0
  let disposed = false

  const heardNow = () => { const t = now(); past = past.filter(p => t - p.at <= JOIN_MS); return [...past.map(p => p.text), current].filter(Boolean).join(' ') }
  const clearState = () => { past = []; current = ''; sent = new Map(); clearTimer(settleTimer); settleTimer = 0; clearTimer(quietTimer); quietTimer = 0; firstAt = null; zero = now(); sameAt = -Infinity; pauseMax = 0 }
  const quietMs = () => Math.min(QUIET_MAX_MS, Math.max(QUIET_LAST_MS, pauseMax * QUIET_PAUSE_K))
  const rel = () => `+${Math.round(now() - (firstAt ?? zero))} мс`
  const settle = (ms, mine) => { clearTimer(settleTimer); settleTimer = setTimer(() => { settleTimer = 0; if (mine === gen) decide(true) }, ms) }
  /** Черновик без последнего слова: тишина quietMs() — итог захода сейчас (голос ещё идёт — ждём дальше) */
  const quiet = (mine, hold = LAST_HOLD_MS) => { clearTimer(quietTimer); quietTimer = setTimer(() => { quietTimer = 0; if (mine !== gen || disposed) return; if (now() - voiceAt < quietMs()) return quiet(mine, 1); log(`[phrase-ear] черновик «${current}» без последнего слова, тишина ${Math.round(now() - voiceAt)} мс (порог ${Math.round(quietMs())}) — прошу итог захода ${rel()}`); ear?.stop?.() }, Math.max(hold, quietMs() - (now() - voiceAt))) }

  function words(scores, draft) {
    for (const s of scores) {
      const got = sent.get(s.key) ?? new Map()
      sent.set(s.key, got)
      const p = phrases.find(x => x.key === s.key)
      s.hits.forEach((ok, index) => { if (ok && (!got.has(index) || (!draft && !got.get(index)))) { got.set(index, !draft); onWord?.({ phraseKey: s.key, index, text: p.words[index], draft }) } })
    }
  }

  function decide(settled, draft = false) {
    if (disposed || !phrases.length) return false
    const heard = heardNow()
    if (!heard) return false
    const scores = scorePhrases(phrases, heard)
    words(scores, draft)
    const picked = pickPhrase(scores, settled)
    if (picked) {
      log(earLine(phrases, heard, scores, picked))
      clearState()
      onPhrase?.({ phraseKey: picked.key, ratio: picked.ratio, heard })
      if (!disposed) restart() // заход закрывается, слушаем заново
      return true
    }
    if (settled) log(earLine(phrases, heard, scores, null))
    return lastOnly(scores) ? 'last' : false
  }

  function onDebug(kind, data, mine) {
    if (disposed || mine !== gen) return
    if (kind === 'level') { onLevel?.(data, !!isHeld()); if (data >= GATE_RMS && !isHeld()) { if (firstAt != null && voiceAt > -Infinity) pauseMax = Math.max(pauseMax, now() - voiceAt); voiceAt = now(); if (settleTimer && settleLast) settle(SETTLE_LAST_MS, mine) } return } // голос: недосказанное последнее слово ещё может прийти
    if (kind === 'gate') { log(`[gate] ${data?.open ? 'открыт' : 'закрыт'} ${rel()} (rms ${(Number(data?.rms) || 0).toFixed(3).replace('.', ',')})`); onEar?.({ kind, open: !!data?.open, rms: data?.rms }); return }
    if (kind === 'partial-same') { const text = clean(data?.raw); if (text && !isHeld() && now() - sameAt >= SAME_LOG_MS) { sameAt = now(); log(`[phrase-ear] partial без изменений «${text}» ${rel()}`) } return }
    if (kind === 'partial' || kind === 'final') {
      if (isHeld()) return // говорит Пит: его голос из динамика — не ученик
      const text = clean(data?.raw)
      if (kind === 'partial' && !text) return
      onEar?.({ kind, text })
      if (text) firstAt ??= now()
      if (kind === 'final' || current !== text) { sameAt = now(); log(`[phrase-ear] ${kind === 'partial' ? 'черновик' : 'итог'} «${text}» ${rel()}`) }
      current = text
      clearTimer(settleTimer); settleTimer = 0; clearTimer(quietTimer); quietTimer = 0
      if (decide(false, kind === 'partial') === 'last' && kind === 'partial') quiet(mine)
    } else if (kind === 'session-end') {
      if (current) past.push({ text: current, at: now() })
      current = ''
      const heard = heardNow()
      if (!heard) return
      const scores = scorePhrases(phrases, heard)
      clearTimer(quietTimer); quietTimer = 0
      settleLast = !!lastOnly(scores)
      if (scores.some(s => s.ratio >= PHRASE_OK - 1e-9)) settle(settleLast ? SETTLE_LAST_MS : SETTLE_MS, mine)
      else log(earLine(phrases, heard, scores, null)) // заход закрылся без совпадения (накопленное остаётся на JOIN_MS)
    }
  }

  function build() {
    const mine = ++gen
    const all = unionWords(phrases)
    if (!all.length) { ear = null; return }
    ear = game2({
      words: all, expected: Math.max(...phrases.map(p => p.words.length)), onHeard: () => {},
      onStatus: st => { if (mine === gen && (st === 'unavailable' || st === 'error')) onError?.(st) },
      onDebug: (kind, data) => onDebug(kind, data, mine),
      create: o => create({ ...o, lang, trace: true, restartMs: 0 }), ...(getStream ? { getStream } : {}), isHeld, now, setTimer, clearTimer,
    })
    ear.start()
  }
  function close() { gen++; const e = ear; ear = null; try { e?.dispose() } catch { /* уже свободен */ } }
  function restart() { close(); build() }

  build()
  return {
    /** Перестать слушать (микрофон закрывается) */
    stop() { disposed = true; clearState(); close() },
    /** Забыть услышанное и слушать заново (новый круг) */
    reset() { if (disposed) return; clearState(); restart() },
    /** Новые кандидаты: словарь пересобирается, услышанное забывается */
    setPhrases(next) { if (disposed) return; phrases = norm(next); clearState(); restart() },
  }
}

// Слушатель фраз этапа 2 «Фразы» (CONCEPT_RACE.md, «Этап 2» → «Слух фраз»): ученик говорит одну из фраз-кандидатов, слушатель отдаёт слова по мере речи (onWord — сегменты пилюли
// заполняются) и зачёт фразы (onPhrase). Только Vosk: поверх createGame2Listener (тот же путь, что «Мини-игра 2.0»: словарь grammarMax ≤ 4 слова за заход, потолок 1600 фраз, микрофон игры,
// isHeld = речь Пита) — его словарь собран из слов ВСЕХ кандидатов без повторов. Разбор услышанного — racePhraseScore.js (matchPhrase по каждому кандидату).
// Заходы короткие (словарь растёт степенью), поэтому услышанное копится между заходами в пределах JOIN_MS: фраза, сказанная в два захода, собирается целиком.
// Зачёт: полное однозначное совпадение — сразу по черновику; неполное (≥ PHRASE_OK, разрыв со вторым ≥ PHRASE_GAP) — только после конца захода и паузы SETTLE_MS (ученик мог не договорить).
// После зачёта заход закрывается, накопленное сбрасывается и слушание начинается заново. Пока isHeld() (говорит Пит) услышанное не учитывается.
import { createGame2Listener } from '../game2/game2Listen.js'
import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'
import { pLog } from '../../shared/lib/debug.js'
import { scorePhrases, pickPhrase, unionWords, earLine, PHRASE_OK } from './racePhraseScore.js'

export { PHRASE_OK }
export const JOIN_MS = 6000   // услышанное прошлых заходов учитывается столько мс (фраза в два-три захода)
export const SETTLE_MS = 1200 // неполное совпадение засчитывается, если после конца захода новых слов нет столько мс

const clean = raw => String(raw ?? '').toLowerCase().split(/\s+/).filter(w => w && w !== '[unk]').join(' ')
const norm = list => (list ?? []).map(p => ({ key: p.key, words: (p.words ?? []).map(w => String(typeof w === 'string' ? w : w?.text ?? '')).filter(Boolean) })).filter(p => p.key && p.words.length)

/**
 * phrases — [{ key, words: ['nice', 'to', 'meet', 'you'] }]; onWord({ phraseKey, index, text, draft }) — новое услышанное слово кандидата: draft — пока только в черновике (partial), потом то же слово
 * ещё раз с draft: false, когда его подтвердил итог захода (каждое — не больше двух раз до зачёта/сброса); onHear() — пришёл непустой черновик или итог (речь распознаётся: сцена двигает заливку «авансом»);
 * onPhrase({ phraseKey, ratio, heard }) — кандидат сказан (ratio — доля слов: 1 — чисто, 0.75 — одно пропущено); onError(status) — 'unavailable' (нет модели) или 'error' (микрофон / Vosk).
 * Слушать начинает сразу. Зависимости (create, log, now, setTimer, clearTimer, listen, runtime) подставляются в тестах.
 */
export function createPhraseListener({ phrases: phrasesIn, lang = 'en', getStream, isHeld = () => false, onWord, onHear, onPhrase, onError, create = createWordListener, game2 = createGame2Listener, log = pLog, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let phrases = norm(phrasesIn)
  let past = []   // услышанное закрытых заходов: [{ text, at }]
  let current = '' // текущий заход (последний черновик / итог)
  let sent = new Map() // ключ кандидата → Map(индекс слова → true, если уже подтверждён итогом; false — пока черновик)
  let settleTimer = 0
  let ear = null
  let gen = 0
  let disposed = false

  const heardNow = () => { const t = now(); past = past.filter(p => t - p.at <= JOIN_MS); return [...past.map(p => p.text), current].filter(Boolean).join(' ') }
  const clearState = () => { past = []; current = ''; sent = new Map(); clearTimer(settleTimer); settleTimer = 0 }

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
    return false
  }

  function onDebug(kind, data, mine) {
    if (disposed || mine !== gen) return
    if (kind === 'partial' || kind === 'final') {
      if (isHeld()) return // говорит Пит: его голос из динамика — не ученик
      const text = clean(data?.raw)
      if (kind === 'partial' && !text) return
      if (text) onHear?.()
      current = text
      clearTimer(settleTimer); settleTimer = 0
      decide(false, kind === 'partial')
    } else if (kind === 'session-end') {
      if (current) past.push({ text: current, at: now() })
      current = ''
      const heard = heardNow()
      if (!heard) return
      const scores = scorePhrases(phrases, heard)
      if (scores.some(s => s.ratio >= PHRASE_OK - 1e-9)) { clearTimer(settleTimer); settleTimer = setTimer(() => { settleTimer = 0; if (mine === gen) decide(true) }, SETTLE_MS) }
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
      create: o => create({ ...o, lang }), ...(getStream ? { getStream } : {}), isHeld, now, setTimer, clearTimer,
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

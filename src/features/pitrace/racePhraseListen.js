// Слушатель фраз этапа 2 «Фразы» (CONCEPT_RACE.md, «Этап 2» → «Слух фраз»): ученик говорит одну из фраз-кандидатов, слушатель отдаёт слова по мере речи (onWord — сегменты пилюли
// заполняются) и зачёт фразы (onPhrase). Только Vosk: поверх createGame2Listener (тот же путь, что «Мини-игра 2.0»: словарь grammarMax ≤ 4 слова за заход, потолок 1600 фраз, микрофон игры,
// isHeld = речь Пита) — его словарь собран из слов ВСЕХ кандидатов без повторов. Разбор услышанного — racePhraseScore.js (matchPhrase по каждому кандидату).
// Заходы короткие (словарь растёт степенью), поэтому услышанное копится между заходами в пределах JOIN_MS: фраза, сказанная в два захода, собирается целиком.
// Зачёт: полное однозначное совпадение — сразу по черновику; неполное (≥ PHRASE_OK, разрыв со вторым ≥ PHRASE_GAP) — только после конца захода и паузы SETTLE_MS (ученик мог не договорить).
// РАННИЙ ИТОГ ЗАХОДА (последнее слово, пауза перед ним, итог по затвору, фраза договорена, середины нет, проход 1 «по слову», пустой черновик, «Vosk молчит») — racePhraseEarlyFinal.js.
// Журнал (таймлайн на телефоне, N — мс от первого звука попытки, до него — от сброса слушателя): «[phrase-ear] черновик «…» +N мс» — каждый новый черновик, «итог «…» (кто закрыл: движок сам / кнопка «Стоп» / авто-стоп) +N мс» — КАЖДЫЙ итог захода
// (и с тем же текстом), «partial без изменений «…» +N мс» — черновик Vosk пришёл, а текст тот же (не чаще SAME_LOG_MS: видно, что черновики идут, а не застряли), «прошу итог захода» (lastOnly),
// «итог запрошен: затвор закрыт +N мс, черновик «…»» (итог по затвору), «Vosk молчит N мс после голоса (черновик «…»)» (затвор закрыт, событий Vosk нет VOSK_QUIET_MS), «[gate] открыт|закрыт +N мс (rms …)» — затвор тишины voskGate (закрыт — тишина не идёт в Vosk). Каждое такое событие уходит и в onEar (отладочная полоска сцены).
// После зачёта заход закрывается, накопленное сбрасывается и слушание начинается заново. Пока isHeld() (говорит Пит) услышанное не учитывается. reset() (каждый новый ход сцены) забывает ВСЁ
// накопленное, в том числе прошлые заходы в окне JOIN_MS: фраза, которую Пит прочитал между ходами, в новый ход не попадает.
import { createGame2Listener } from '../game2/game2Listen.js'
import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'
import { pLog } from '../../shared/lib/debug.js'
import { scorePhrases, pickPhrase, unionWords, earLine, PHRASE_OK, PHRASE_GAP } from './racePhraseScore.js'
import { GATE_RMS } from '../../shared/lib/vosk/voskGate.js'
import { STOP_BY } from '../../shared/lib/vosk/voskTiming.js'
import { lastOnly, saidThrough, halfWay, quietLimit, quietWanted, gateReason, voskQuietStop, LAST_HOLD_MS, GATE_CLOSE_FINAL_MS, FINAL_WAIT_MS, VOSK_QUIET_MS } from './racePhraseEarlyFinal.js'

export { PHRASE_OK }
export { lastOnly, saidThrough, halfWay, QUIET_LAST_MS, QUIET_PAUSE_K, QUIET_MAX_MS, QUIET_MAX_WBW_MS, LAST_HOLD_MS, GATE_CLOSE_FINAL_MS, TAIL_VOICE_MS, FINAL_WAIT_MS, HALF_MIN, HALF_RATIO, VOSK_QUIET_MS } from './racePhraseEarlyFinal.js'
export const JOIN_MS = 6000   // услышанное прошлых заходов учитывается столько мс (фраза в два-три захода)
export const JOIN_WBW_MS = 15000 // …в проходе 1 «по слову» (4 слова с паузами 2,5 с — 9 с; замер реальным Vosk: при 6 с первое слово забывалось к последнему)
export const SETTLE_MS = 1200 // неполное совпадение засчитывается, если после конца захода новых слов нет столько мс
export const SETTLE_LAST_MS = 400 // то же, когда не хватает только ПОСЛЕДНЕГО слова (быстрая речь: итог захода уже спрошен)
export const SETTLE_WBW_MS = 3000 // проход 1 «по слову»: неполное совпадение — только после стольких мс без голоса (ученик ждёт подсказку следующего слова; голос отодвигает)
export const SAME_LOG_MS = 500   // «partial без изменений» в журнале — не чаще
export const NEVER_COMPLETE = 1000 // «сколько слов ждём» для слушателя слов: заход никогда не «полный» — иначе его счёт по словам («where are are you» = 4, а после прошлых заходов — любое одно слово)
// держал затвор тишины открытым, и эндпойнтер Vosk сам рвал заход в паузе перед последним словом (замер CPU 4×: «from» терялось); полную фразу решает decide() по черновику

const clean = raw => String(raw ?? '').toLowerCase().split(/\s+/).filter(w => w && w !== '[unk]').join(' ')
const norm = list => (list ?? []).map(p => ({ key: p.key, words: (p.words ?? []).map(w => String(typeof w === 'string' ? w : w?.text ?? '')).filter(Boolean) })).filter(p => p.key && p.words.length)

/**
 * phrases — [{ key, words: ['nice', 'to', 'meet', 'you'] }]; onWord({ phraseKey, index, text, draft, gone? }) — новое услышанное слово кандидата: draft — пока только в черновике (partial), потом то же слово
 * ещё раз с draft: false, когда его подтвердил итог захода; проход 1 — слова по порядку (orderedHits), черновое слово, выпавшее из услышанного, — onWord с gone: true (откат); onEar({ kind: 'partial' | 'final', text } | { kind: 'gate', open, rms }) — что слышит Vosk (отладочная полоска);
 * onLevel(rms, held) — уровень каждого куска звука микрофона (held — говорит Пит): только журнал / отладка — сцена «Скажи» заливает пилюлю только по распознанным словам;
 * onPhrase({ phraseKey, ratio, heard }) — кандидат сказан (ratio — доля слов: 1 — чисто, 0.75 — одно пропущено); onError(status) — 'unavailable' (нет модели) или 'error' (микрофон / Vosk).
 * wordByWord — проход 1 «по слову» (паузы между словами — норма: ранние итоги только по lastOnly, racePhraseEarlyFinal.js; неполное совпадение — не раньше SETTLE_WBW_MS без голоса,
 * и договорённая фраза тоже: пропущенное слово ученик ещё скажет по подсказке); меняется setPhrases(next, { wordByWord }).
 * Слушать начинает сразу. Зависимости (create, log, now, setTimer, clearTimer, listen, runtime) подставляются в тестах.
 */
export function createPhraseListener({ phrases: phrasesIn, lang = 'en', getStream, isHeld = () => false, wordByWord: wbwIn = false, onWord, onEar, onLevel, onPhrase, onError, create = createWordListener, game2 = createGame2Listener, log = pLog, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let phrases = norm(phrasesIn)
  let wordByWord = !!wbwIn
  let past = []   // услышанное закрытых заходов: [{ text, at }]
  let current = '' // текущий заход (последний черновик / итог)
  let sent = new Map() // ключ кандидата → Map(индекс слова → true, если уже подтверждён итогом; false — пока черновик)
  let settleTimer = 0
  let settleLast = false // ждём SETTLE_LAST_MS (не хватает только последнего слова или фраза договорена): голос отодвигает решение
  let throughBy = ''     // ожидание SETTLE_LAST_MS по договорённой фразе: 'по черновику' | 'по концу захода' ('' — нет)
  let throughAt = null   // когда в этой попытке фраза впервые оказалась договорена (журнал «через N мс»)
  let quietTimer = 0     // черновик без последнего слова: ждём тишину QUIET_LAST_MS, потом просим итог
  let gateTimer = 0      // затвор закрылся при черновике со словом кандидата: через GATE_CLOSE_FINAL_MS просим итог
  let muteTimer = 0      // затвор закрыт, черновик не пуст: событий Vosk нет VOSK_QUIET_MS — «Vosk молчит»
  let textAt = -Infinity // когда текст захода (черновик / итог) последний раз изменился или начался заход: голос позже — речь, которой в черновике ещё нет
  let pauseMax = 0 // самая длинная пауза между словами этой попытки (тишина между громкими кусками после первого слова)
  let gateOpen = true // затвор тишины открыт (звук идёт в Vosk)
  let voiceAt = -Infinity, firstAt = null, zero = now(), sameAt = -Infinity // последний громкий кусок звука; первый звук попытки (журнал +N мс); сброс слушателя; последняя строка «без изменений»
  let ear = null
  let gen = 0
  let disposed = false

  const score = heard => scorePhrases(phrases, heard, wordByWord) // проход 1 — слова только по порядку (racePhraseScore.orderedHits)
  const heardNow = () => { const t = now(); past = past.filter(p => t - p.at <= (wordByWord ? JOIN_WBW_MS : JOIN_MS)); return [...past.map(p => p.text), current].filter(Boolean).join(' ') }
  const clearState = () => { past = []; current = ''; sent = new Map(); clearTimer(settleTimer); settleTimer = 0; clearTimer(quietTimer); quietTimer = 0; clearTimer(gateTimer); gateTimer = 0; clearTimer(muteTimer); muteTimer = 0; throughBy = ''; throughAt = null; firstAt = null; zero = now(); sameAt = -Infinity; pauseMax = 0 }
  const quietMs = () => quietLimit(pauseMax, wordByWord)
  const rel = () => `+${Math.round(now() - (firstAt ?? zero))} мс`
  const settle = (ms, mine) => { if (wordByWord) { ms = Math.max(ms, SETTLE_WBW_MS); settleLast = true } clearTimer(settleTimer); settleTimer = setTimer(() => { settleTimer = 0; if (mine !== gen) return; if (throughBy) through(throughBy); decide(true) }, ms) }
  /** Строка журнала «договорена» (если по услышанному фраза всё ещё договорена) */
  function through(by) {
    const heard = heardNow(), scores = heard ? score(heard) : [], key = saidThrough(scores)
    if (!key) return
    const r = scores.find(s => s.key === key).ratio.toFixed(2).replace('.', ',')
    log(`[phrase-ear] договорена: последнее слово есть, ratio ${r} — зачёт ${by} через ${Math.round(now() - (throughAt ?? now()))} мс`)
  }
  /** Черновик без последнего слова: тишина quietMs() — итог захода сейчас (голос ещё идёт — ждём дальше) */
  const quiet = (mine, hold = LAST_HOLD_MS) => { clearTimer(quietTimer); quietTimer = setTimer(() => { quietTimer = 0; if (mine !== gen || disposed || !current) return; if (now() - voiceAt < quietMs()) return quiet(mine, 1); log(`[phrase-ear] черновик «${current}» без последнего слова, тишина ${Math.round(now() - voiceAt)} мс (порог ${Math.round(quietMs())}) — прошу итог захода ${rel()}`); ear?.stop?.() }, Math.max(hold, quietMs() - (now() - voiceAt))) }

  const hasWord = text => !!text && score(text).some(s => s.hits.some(Boolean))
  /** Затвор закрылся: просить ли итог через GATE_CLOSE_FINAL_MS (racePhraseEarlyFinal.gateReason; открылся — отмена) */
  function gateFinal(open, mine) {
    clearTimer(gateTimer); gateTimer = 0
    const tail = voiceAt - textAt, heard = heardNow(), scores = heard ? score(heard) : []
    const why = open || isHeld() ? null : gateReason({ scores, current, curHit: hasWord(current), tail, wordByWord })
    if (!why) return
    const closedAt = now()
    if (settleTimer && !throughBy) settle(GATE_CLOSE_FINAL_MS + FINAL_WAIT_MS, mine) // решение по прошлым заходам ждёт этот итог (иначе «нечисто» раньше последнего слова)
    gateTimer = setTimer(() => { gateTimer = 0; if (mine !== gen || disposed || !current) return; clearTimer(quietTimer); quietTimer = 0; log(`[phrase-ear] итог запрошен: затвор закрыт +${Math.round(now() - closedAt)} мс, черновик «${current}», ${why === 'ends' ? 'последнее слово есть' : `голос после черновика ${Math.round(tail)} мс${why === 'half' ? ' (середины нет)' : ''}`} ${rel()}`); ear?.stop?.() }, GATE_CLOSE_FINAL_MS)
  }
  /** «Vosk молчит» (racePhraseEarlyFinal.js): затвор закрыт, черновик не пуст, событий Vosk нет VOSK_QUIET_MS — журнал; черновик без слов цели — ещё и итог захода. Событие Vosk / голос — отсчёт заново */
  function mute(mine, closed) {
    clearTimer(muteTimer); muteTimer = 0
    if (!closed || !current || isHeld()) return
    muteTimer = setTimer(() => {
      muteTimer = 0; if (mine !== gen || disposed || !current || isHeld()) return
      const stop = voskQuietStop(hasWord(current))
      log(`[phrase-ear] Vosk молчит ${Math.round(now() - voiceAt)} мс после голоса (черновик «${current}»)${stop ? ' — в черновике нет слов цели, прошу итог захода' : ''} ${rel()}`)
      if (stop) { clearTimer(quietTimer); quietTimer = 0; ear?.stop?.() }
    }, VOSK_QUIET_MS)
  }

  /** onWord по разбору: проход 2 — каждое слово, хоть раз услышанное (без отката); проход 1 — по выровненному порядку: черновое слово, которого в услышанном больше нет, откатывается
   * (onWord с gone: true), подтверждённое итогом в непрерывном префиксе (слова 0…k подряд) — нет; итог со словом «вперёд» его не подтверждает (оно может оказаться не на своём месте) */
  function words(scores, draft) {
    for (const s of scores) {
      const got = sent.get(s.key) ?? new Map()
      sent.set(s.key, got)
      const p = phrases.find(x => x.key === s.key), say = (index, d, gone = false) => onWord?.({ phraseKey: s.key, index, text: p.words[index], draft: d, ...(gone ? { gone } : {}) })
      if (!wordByWord) { s.hits.forEach((ok, index) => { if (ok && (!got.has(index) || (!draft && !got.get(index)))) { got.set(index, !draft); say(index, draft) } }); continue }
      for (const [index, kept] of got) if (!kept && !s.hits[index]) { got.delete(index); log(`[phrase-ear] слово ${index + 1} «${p.words[index]}» откат (${s.key}): в услышанном по порядку его нет ${rel()}`); say(index, true, true) }
      let k = 0
      while (s.hits[k] || got.get(k) === true) k++
      s.hits.forEach((ok, index) => { const keep = ok && !draft && index < k; if (ok && (!got.has(index) || (keep && !got.get(index)))) { got.set(index, keep); say(index, !keep) } })
    }
  }

  function decide(settled, draft = false) {
    if (disposed || !phrases.length) return false
    const heard = heardNow()
    if (!heard) return false
    const scores = score(heard)
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
    if (saidThrough(scores)) { throughAt ??= now(); return 'through' }
    return lastOnly(scores) ? 'last' : halfWay(scores) ? 'half' : false
  }

  function onDebug(kind, data, mine) {
    if (disposed || mine !== gen) return
    if (kind === 'level') { onLevel?.(data, !!isHeld()); if (data >= GATE_RMS && !isHeld()) { if (firstAt != null && voiceAt > -Infinity) pauseMax = Math.max(pauseMax, now() - voiceAt); voiceAt = now(); if (settleTimer && settleLast) settle(SETTLE_LAST_MS, mine) } return } // голос: недосказанное последнее слово ещё может прийти
    if (kind === 'gate') { log(`[gate] ${data?.open ? 'открыт' : 'закрыт'} ${rel()} (rms ${(Number(data?.rms) || 0).toFixed(3).replace('.', ',')})`); onEar?.({ kind, open: !!data?.open, rms: data?.rms }); gateOpen = !!data?.open; gateFinal(gateOpen, mine); mute(mine, !gateOpen); return }
    if (kind === 'partial-same') { const text = clean(data?.raw); if (text && !isHeld() && now() - sameAt >= SAME_LOG_MS) { sameAt = now(); log(`[phrase-ear] partial без изменений «${text}» ${rel()}`) } if (muteTimer) mute(mine, !gateOpen); return }
    if (kind === 'partial' || kind === 'final') {
      if (isHeld()) return // говорит Пит: его голос из динамика — не ученик
      const text = clean(data?.raw)
      if (kind === 'partial' && !text) return
      onEar?.({ kind, text })
      if (text) firstAt ??= now()
      if (kind === 'final' || current !== text) { sameAt = now(); log(`[phrase-ear] ${kind === 'partial' ? 'черновик' : 'итог'} «${text}» ${kind === 'final' && data?.stopBy ? `(${STOP_BY[data.stopBy] ?? data.stopBy}) ` : ''}${rel()}`) } // кто закрыл заход: «движок сам» — эндпойнтер Vosk, «кнопка «Стоп»» — наш ear.stop, «авто-стоп» — 3,5 с без новых слов
      if (current !== text) textAt = now()
      current = text
      clearTimer(settleTimer); settleTimer = 0; throughBy = ''; clearTimer(quietTimer); quietTimer = 0
      if (kind === 'final') { clearTimer(gateTimer); gateTimer = 0 }
      mute(mine, !gateOpen && kind === 'partial')
      const got = decide(false, kind === 'partial')
      if (quietWanted(got, wordByWord) && kind === 'partial') quiet(mine) // середины нет — тоже: «from» только итогом, а «you» пришло вместе с ним (голоса после черновика нет)
      else if (got === 'through' && kind === 'final' && !wordByWord) { through('по итогу'); decide(true) } // ученик договорил до последнего слова, а середину уже не скажет — ждать нечего
      else if (got === 'through') { throughBy = kind === 'final' ? 'по итогу' : 'по черновику'; settleLast = true; settle(SETTLE_LAST_MS, mine) } // черновик ещё может достроиться до полного
    } else if (kind === 'session-end') {
      if (current) past.push({ text: current, at: now() })
      current = ''; textAt = now(); gateOpen = true; clearTimer(muteTimer); muteTimer = 0 // следующий заход Vosk (wordLaneListen перезапускает сам): голос в нём — ещё не в черновике
      const heard = heardNow()
      if (!heard) return
      const scores = score(heard)
      clearTimer(quietTimer); quietTimer = 0
      const done = !!saidThrough(scores)
      settleLast = done || !!lastOnly(scores); throughBy = done ? 'по концу захода' : ''
      if (scores.some(s => s.ratio >= PHRASE_OK - 1e-9)) settle(settleLast ? SETTLE_LAST_MS : SETTLE_MS, mine)
      else log(earLine(phrases, heard, scores, null)) // заход закрылся без совпадения (накопленное остаётся на JOIN_MS)
    }
  }

  function build() {
    const mine = ++gen
    textAt = now()
    const all = unionWords(phrases)
    if (!all.length) { ear = null; return }
    ear = game2({
      words: all, expected: NEVER_COMPLETE, onHeard: () => {},
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
    /** Новые кандидаты: словарь пересобирается, услышанное забывается; opts.wordByWord — проход 1 «по слову» (ход сцены с pass ≠ 2) */
    setPhrases(next, opts = null) { if (disposed) return; phrases = norm(next); if (opts && 'wordByWord' in opts) wordByWord = !!opts.wordByWord; clearState(); restart() },
  }
}

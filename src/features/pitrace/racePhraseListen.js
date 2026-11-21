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
import { createDraftHold, PEAK_MIN, DRAFT_KEEP_MS } from './racePhraseDraftHold.js'
import { createTailHold, cutTail, holdLast, TAIL_HOLD_MS } from './racePhraseTailHold.js'
import { pLog } from '../../shared/lib/debug.js'
import { scorePhrases, pickPhrase, unionWords, earLine, PHRASE_OK, PHRASE_GAP } from './racePhraseScore.js'
import { GATE_RMS } from '../../shared/lib/vosk/voskGate.js'
import { createEarVoice } from '../../shared/lib/vosk/voskVoice.js'
import { STOP_BY } from '../../shared/lib/vosk/voskTiming.js'
import { lastOnly, saidThrough, halfWay, quietLimit, quietWanted, gateReason, voskQuietStop, LAST_HOLD_MS, GATE_CLOSE_FINAL_MS, FINAL_WAIT_MS, VOSK_QUIET_MS, UNK_FINAL_MS, LONG_VOICE_MS } from './racePhraseEarlyFinal.js'

export { PHRASE_OK }
export { lastOnly, saidThrough, halfWay, QUIET_LAST_MS, QUIET_PAUSE_K, QUIET_MAX_MS, QUIET_MAX_WBW_MS, LAST_HOLD_MS, GATE_CLOSE_FINAL_MS, TAIL_VOICE_MS, FINAL_WAIT_MS, HALF_MIN, HALF_RATIO, VOSK_QUIET_MS, UNK_FINAL_MS, LONG_VOICE_MS } from './racePhraseEarlyFinal.js'
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
export function createPhraseListener({ phrases: phrasesIn, lang = 'en', getStream, isHeld = () => false, wordByWord: wbwIn = false, holdFirst = true, onWord, onEar, onLevel, onPhrase, onError, allowPartial = () => true, create = createWordListener, game2 = createGame2Listener, log = pLog, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let phrases = norm(phrasesIn)
  let wordByWord = !!wbwIn
  let past = []   // услышанное закрытых заходов: [{ text, at }]
  let cutVisit = false, cutAt = -Infinity // cutVisit — в этом заходе подтверждено слово: его текст в «прошлые заходы» не идёт (v3.3.320: «from you» с подтверждённым «you» оставлял в услышанном старое «from» — последнее слово потом 5 раз не засчитывалось); cutAt — проход 1: когда последний раз подтверждено итогом новое слово — заходы ДО этого момента больше не читаются (v3.3.307: слова «вперёд» из старых заходов не должны засчитываться задним числом, когда ожидаемое слово наконец сказано)
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
  const voice = createEarVoice({ now })
  const hold = createDraftHold({ now }) // громкость захода и возраст чернового слова (racePhraseDraftHold.js)
  const tail = createTailHold({ now }) // последнее слово фразы хвостом черновика — только устоявшееся (racePhraseTailHold.js)
  let loneTimer = 0 // черновик из одного «[unk]» при голосе: через UNK_FINAL_MS просим итог (неверное слово не должно молчать до конца захода)
  let unkTimer = 0 // слово за «[unk]» ждёт итог: через UNK_FINAL_MS просим итог захода сами
  let tailTimer = 0, tailLogged = false, curDraft = false // curDraft — текущий текст захода ещё черновик
  let noiseLogged = false, blockedLogged = false
  let progressed = false // в этом заходе принято хоть одно новое слово (для «голос без нового слова» → неверное слово)
  let curRaw = ''        // сырой текст захода с «[unk]»
  let disposed = false

  const baseOf = key => { const g = sent.get(key); let k = 0; while (g?.get(k) === true) k++; return k } // сколько слов с начала подтверждено итогом (непрерывно)
  const score = (heard, open = false) => scorePhrases(phrases, heard, wordByWord ? { strict: true, base: baseOf, open } : true) // проход 1 — строгая цепочка (strictHits, v3.3.306): неверное слово линию не двигает, слова за ним не запоминаются; проход 2 — по порядку (orderedHits). Прежний комментарий: слова только по порядку (racePhraseScore.orderedHits) в ОБОИХ проходах (v3.3.302, журнал владельца: «nice you meet to» засчитало фразу на 100 %, заливка дошла до конца); раньше проход 2 считал набором слов, порядок не важен
  const heardNow = (cur = current) => { const t = now(); past = past.filter(p => t - p.at <= (wordByWord ? JOIN_WBW_MS : JOIN_MS)); return [...past.filter(p => !wordByWord || p.at >= cutAt).map(p => p.text), cur].filter(Boolean).join(' ') }
  const clearState = () => { hold.clear(); tail.clear(); clearTimer(tailTimer); tailTimer = 0; clearTimer(unkTimer); unkTimer = 0; clearTimer(loneTimer); loneTimer = 0; tailLogged = false; curDraft = false; noiseLogged = false; progressed = false; curRaw = ''; past = []; cutAt = -Infinity; cutVisit = false; current = ''; sent = new Map(); clearTimer(settleTimer); settleTimer = 0; clearTimer(quietTimer); quietTimer = 0; clearTimer(gateTimer); gateTimer = 0; clearTimer(muteTimer); muteTimer = 0; throughBy = ''; throughAt = null; firstAt = null; zero = now(); sameAt = -Infinity; pauseMax = 0 }
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
      const base = baseOf(s.key)
      const emptyFinal = !draft && !s.hits.some((h, i) => h && i >= base) && !curRaw.includes('[unk]') // v3.3.318: итог «[unk]» — не пустой: Vosk услышал ЧУЖОЕ слово, черновое слово этого захода было догадкой — откатываем // итог без единого слова цели («итог «»»: короткое «to» Vosk не подтвердил) — ничего не говорит о черновых словах: не откатываем (владелец v3.3.283: «откинуло прогресс пилюли назад»)
      if (!emptyFinal) for (const [index, kept] of got) if (!kept && !s.hits[index]) { got.delete(index); hold.forget(s.key, index); progressed = false; log(`[phrase-ear] слово ${index + 1} «${p.words[index]}» откат (${s.key}): в услышанном по порядку его нет ${rel()}`); say(index, true, true) }
      let k = 0
      while (s.hits[k] || got.get(k) === true) k++
      const blocked = draft && /\[unk\]\s+[^\s[]/.test(curRaw) // v3.3.311: перед словом в заходе «[unk]» («[unk] from») — это, скорее всего, чужое слово, которое Vosk сопоставил со словом цели: черновиком не принимаем, ждём итог захода
      s.hits.forEach((ok, index) => { if (blocked && ok && !got.has(index)) { if (!blockedLogged) { blockedLogged = true; log(`[phrase-ear] слово ${index + 1} «${p.words[index]}» в заходе с «[unk]» перед ним — черновиком не принимаю, жду итог ${rel()}`) } return } const keep = ok && !draft && index < k; if (ok && (!got.has(index) || (keep && !got.get(index)))) { progressed = true; if (keep) { cutAt = now(); cutVisit = true; hold.forget(s.key, index) } else hold.drafted(s.key, index); got.set(index, keep); say(index, !keep) } })
    }
  }

  /** Проход 1: снять все черновые (не подтверждённые) слова — onWord с gone: true */
  function dropDrafts(why) { for (const [key, got] of sent) { const p = phrases.find(x => x.key === key); for (const [index, kept] of [...got]) if (!kept) { got.delete(index); hold.forget(key, index); progressed = false; log(`[phrase-ear] слово ${index + 1} «${p?.words[index] ?? ''}» откат: ${why} ${rel()}`); onWord?.({ phraseKey: key, index, text: p?.words[index], draft: true, gone: true }) } } }
  let partialHeld = false // журнал «жду исправления» — один раз на заход
  /** Проход 1: черновые слова, продержавшиеся DRAFT_KEEP_MS без отката, подтверждаются (сказали, помолчали): переписанный заход их уже не откатит (racePhraseDraftHold.js) */
  function promoteHeld() {
    for (const [key, got] of sent) for (const index of hold.due(key, got)) {
      const p = phrases.find(x => x.key === key); got.set(index, true); hold.forget(key, index); cutAt = now(); cutVisit = true
      log(`[phrase-ear] слово ${index + 1} «${p?.words[index] ?? ''}» продержалось ${DRAFT_KEEP_MS} мс — подтверждено (откат переписанным черновиком не нужен) ${rel()}`)
      onWord?.({ phraseKey: key, index, text: p?.words[index], draft: false })
    }
  }
  function decide(settled, draft = false) {
    if (disposed || !phrases.length) return false
    if (wordByWord && (current || !curRaw.includes('[unk]'))) promoteHeld() // v3.3.321: заход переписан в одно «[unk]» — Vosk исправил догадку: не подтверждаем «продержавшееся» слово, оно откатится ниже (журнал 12:41: «where» с щелчка подтвердилось за миг до отката)
    const heard = heardNow()
    if (!heard && !(wordByWord && (curRaw.includes('[unk]') || [...sent.values()].some(g => g.size)))) return false // проход 1 идёт дальше и с пустым услышанным: v3.3.318 — заход из одного «[unk]» откатывает черновые слова (журнал 10:23: «you» → «[unk]», а «you» осталось); v3.3.320 — подтверждённые слова живут в sent, а не в тексте прошлых заходов (неполная фраза закрывается по паузе)
    let scores = score(heard, draft && curDraft)
    if (wordByWord && draft && /\[unk\]\s+[^\s[]/.test(curRaw)) { // v3.3.311: перед словом в заходе «[unk]» («[unk] from») — чужое слово, сопоставленное со словом цели: новые слова черновиком не принимаем (и фразу не засчитываем), ждём итог захода
      scores = scores.map(s => { const b = baseOf(s.key), hits = s.hits.map((h, i) => h && i < b), ok = hits.filter(Boolean).length; if (ok < s.ok && !blockedLogged) { blockedLogged = true; log(`[phrase-ear] новые слова в заходе с «[unk]» перед ними — черновиком не принимаю, жду итог ${rel()}`) } if (ok < s.ok && !unkTimer) { const mine = gen; unkTimer = setTimer(() => { unkTimer = 0; if (mine !== gen || disposed || !curDraft || !current) return; log(`[phrase-ear] слово за «[unk]» ждёт итог ${UNK_FINAL_MS} мс (черновик «${current}») — прошу итог захода ${rel()}`); ear?.stop?.() }, UNK_FINAL_MS) } return { ...s, hits, ok, ratio: hits.length ? ok / hits.length : 0 } })
    }
    if (wordByWord && draft) { // v3.3.314: последнее слово фразы хвостом черновика Vosk угадывает по первому звуку. v3.3.317 (журнал владельца 23:26: сказал «фриз» — черновик «you from», фраза засчитана): черновиком его не принимаем ВОВСЕ — хвост устоялся TAIL_HOLD_MS, просим итог захода (≈ 100 мс), решает он (чужое слово итог отдаёт как «[unk]»)
      const r = holdLast(scores, score(heardNow(cutTail(current))), holdFirst), mine = gen
      if (r.held.length) {
        scores = r.scores
        if (!tailLogged) { tailLogged = true; log(`[phrase-ear] первое / последнее слово фразы в черновике «${current}» — черновиком не принимаю, через ${TAIL_HOLD_MS} мс устойчивости прошу итог ${rel()}`) }
        const ask = () => { tailTimer = 0; if (mine !== gen || disposed || !curDraft || !current) return; if (r.first && now() - voiceAt < TAIL_HOLD_MS) { tailTimer = setTimer(ask, 100); return } log(`[phrase-ear] первое / последнее слово устоялось (черновик «${current}») — прошу итог захода ${rel()}`); ear?.stop?.() } // первое слово: итог — только после паузы голоса TAIL_HOLD_MS (слитную речь не рвём: второе слово в черновике принимает первое и без итога)
        if (!tailTimer) tailTimer = setTimer(ask, Math.max(1, tail.left()))
      }
    }
    words(scores, draft)
    let picked = pickPhrase(scores, settled)
    if (picked && picked.ratio < 1 - 1e-9 && !allowPartial()) { if (!partialHeld) { partialHeld = true; log(`[phrase-ear] фраза неполная (${Math.round(picked.ratio * 100)} %), пилюля ещё далеко от края — не засчитываю, жду исправления ${rel()}`) } picked = null } // v3.3.284: неполную фразу (слово пропущено / неверное) засчитывают, только когда у пилюли осталось ≤ 30 % пути
    if (picked) {
      partialHeld = false
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
    if (kind === 'level') { onLevel?.(data, !!isHeld()); const spoke = voice.push(data).voice; if (!isHeld()) hold.level(data, spoke); if ((spoke || data >= GATE_RMS) && !isHeld()) { // голос — как у затвора тишины (voskVoice.js: порог от шума микрофона; тихая речь iPhone 0,003–0,005 — тоже голос)
      if (firstAt != null && voiceAt > -Infinity) pauseMax = Math.max(pauseMax, now() - voiceAt); voiceAt = now(); if (settleTimer && settleLast) settle(SETTLE_LAST_MS, mine) } return } // голос: недосказанное последнее слово ещё может прийти
    if (kind === 'gate') { log(`[gate] ${data?.open ? 'открыт' : 'закрыт'} ${rel()} (rms ${(Number(data?.rms) || 0).toFixed(3).replace('.', ',')})`); onEar?.({ kind, open: !!data?.open, rms: data?.rms }); gateOpen = !!data?.open; gateFinal(gateOpen, mine); mute(mine, !gateOpen); return }
    if (kind === 'partial-same') { const text = clean(data?.raw); if (text && !isHeld() && now() - sameAt >= SAME_LOG_MS) { sameAt = now(); log(`[phrase-ear] partial без изменений «${text}» ${rel()}`) } if (muteTimer) mute(mine, !gateOpen); return }
    if (kind === 'partial' || kind === 'final') {
      if (isHeld()) return // говорит Пит: его голос из динамика — не ученик
      const text = clean(data?.raw)
      if (kind === 'partial' && !text && wordByWord && !loneTimer && String(data?.raw ?? '').includes('[unk]') && !hold.noise()) loneTimer = setTimer(() => { loneTimer = 0; if (mine !== gen || disposed || current) return; log(`[phrase-ear] в черновике только «[unk]» при голосе ${UNK_FINAL_MS} мс — прошу итог захода ${rel()}`); ear?.stop?.() }, UNK_FINAL_MS) // v3.3.319 (владелец: «громко и чётко говорю неправильные слова — красным не светится»; журнал: «[unk]» в 47543, красное только по итогу через 3,8 с)
      if (kind === 'partial' && !text && !(wordByWord && String(data?.raw ?? '').includes('[unk]') && [...sent.values()].some(g => [...g.values()].includes(false)))) return // пустой черновик не интересен — кроме «[unk]» поверх чернового слова (проход 1): это Vosk исправил свою догадку
      if (wordByWord && text && hold.noise()) { if (!noiseLogged) { noiseLogged = true; log(`[phrase-ear] «${text}» проигнорировано: громкость захода ${hold.peak().toFixed(4).replace('.', ',')} ${hold.peak() < PEAK_MIN ? `ниже ${String(PEAK_MIN).replace('.', ',')}` : 'не громче фона микрофона (голоса в заходе не было)'} — это шум, не речь ${rel()}`) } return } // v3.3.310: шум громкостью 0,003 Vosk читал как «where» и линия прыгала
      onEar?.({ kind, text, raw: String(data?.raw ?? '').toLowerCase().trim() }) // raw — с «[unk]»: Vosk отдаёт сказанное вне словаря (громкое «is» вместо «are») как «[unk]» — это неверное слово (racePhraseWrongWord)
      if (text) firstAt ??= now()
      if (kind === 'final' || current !== text) { sameAt = now(); log(`[phrase-ear] ${kind === 'partial' ? 'черновик' : 'итог'} «${text}» ${kind === 'final' && data?.stopBy ? `(${STOP_BY[data.stopBy] ?? data.stopBy}) ` : ''}${rel()}`) } // кто закрыл заход: «движок сам» — эндпойнтер Vosk, «кнопка «Стоп»» — наш ear.stop, «авто-стоп» — 3,5 с без новых слов
      if (current !== text) textAt = now()
      current = text; curRaw = String(data?.raw ?? '').toLowerCase().trim(); curDraft = kind === 'partial'; clearTimer(tailTimer); tailTimer = 0
      if (curDraft) tail.partial(text); else tail.clear()
      clearTimer(settleTimer); settleTimer = 0; throughBy = ''; clearTimer(quietTimer); quietTimer = 0
      if (kind === 'final') { clearTimer(gateTimer); gateTimer = 0; clearTimer(unkTimer); unkTimer = 0; clearTimer(loneTimer); loneTimer = 0 }
      mute(mine, !gateOpen && kind === 'partial')
      const breath = kind === 'final' && wordByWord && !text && !curRaw.includes('[unk]') && Number(data?.voiceMs) >= LONG_VOICE_MS // пустой итог после сплошного долгого звука — выдох, не слово
      if (breath) dropDrafts(`пустой итог после ${Math.round(Number(data.voiceMs))} мс сплошного звука — выдох / шум, не слово`)
      const got = decide(false, kind === 'partial')
      if (kind === 'final' && wordByWord && !breath && !progressed && !hold.noise() && hold.peak() >= PEAK_MIN) { log(`[phrase-ear] голос (пик ${hold.peak().toFixed(3).replace('.', ',')}) без нового слова цели — неверное слово ${rel()}`); onEar?.({ kind: 'wrong', why: 'voice', peak: hold.peak() }) } // v3.3.311 (владелец: «осталось последнее слово, я говорил любое другое — пилюля стояла и молчала»): речь была, нового слова нет — красное ожидаемое слово и рывок
      if (quietWanted(got, wordByWord) && kind === 'partial') quiet(mine) // середины нет — тоже: «from» только итогом, а «you» пришло вместе с ним (голоса после черновика нет)
      else if (got === 'through' && kind === 'final' && !wordByWord) { through('по итогу'); decide(true) } // ученик договорил до последнего слова, а середину уже не скажет — ждать нечего
      else if (got === 'through') { throughBy = kind === 'final' ? 'по итогу' : 'по черновику'; settleLast = true; settle(SETTLE_LAST_MS, mine) } // черновик ещё может достроиться до полного
      if (kind === 'final' && !wordByWord && !settleTimer && score(heardNow()).some(s => s.ratio >= PHRASE_OK - 1e-9)) settle(SETTLE_MS, mine) // итог захода с неполным совпадением (3 из 4: «nice to meet to» вместо «you») решается через SETTLE_MS и без события конца захода — заливка не застревает на 97 % (журнал 2026-11-15)
    } else if (kind === 'session-end') {
      if (wordByWord) log(`[phrase-ear] заход закрыт: raw «${curRaw}», пик ${hold.peak().toFixed(4).replace('.', ',')}, новых слов ${progressed ? 'принято' : 'нет'}${hold.noise() ? ', шум' : ''}, подтверждено слов ${[...sent.values()].reduce((m, g) => Math.max(m, [...g.values()].filter(Boolean).length), 0)} ${rel()}`) // сводка захода для разбора «что пошло не так»
      if (current && !(wordByWord && cutVisit)) past.push({ text: current, at: now() }); cutVisit = false
      current = ''; curDraft = false; clearTimer(unkTimer); unkTimer = 0; clearTimer(loneTimer); loneTimer = 0; tail.clear(); tailLogged = false; clearTimer(tailTimer); tailTimer = 0; textAt = now(); gateOpen = true; hold.capture(); noiseLogged = false; blockedLogged = false; progressed = false; curRaw = ''; clearTimer(muteTimer); muteTimer = 0 // следующий заход Vosk (wordLaneListen перезапускает сам): голос в нём — ещё не в черновике
      const heard = heardNow()
      if (!heard && !(wordByWord && [...sent.values()].some(g => g.size))) return
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

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
// ИТОГ ПО ЗАТВОРУ (2026-11-08, замечание владельца 1: «последнее слово застревает»; журнал: «from» в черновике не появилось вовсе — Vosk отдал его только итогом через 1,2 с после
// последнего черновика; у vosk-browser 0.0.8 нет setPartialWords / setMaxAlternatives — черновик раньше не получить): затвор тишины закрылся (≈ 300 мс после конца голоса), услышано всё,
// кроме последнего слова (lastOnly; посреди фразы заход не рвём — короткое слово в отдельном заходе Vosk не узнаёт), а голос шёл ещё ≥ TAIL_VOICE_MS ПОСЛЕ последней смены черновика (сказанное есть, а в черновике его нет) — через GATE_CLOSE_FINAL_MS просим итог захода (ear.stop); голос
// вернулся раньше (затвор открылся) — отмена. То же, если последнее слово кандидата уже услышано, а не хватает середины («where you from»: ждать нечего, иначе — авто-стоп 3,5 с); решение по прошлым заходам ждёт этот итог. Черновик пришёл уже после голоса (обычная пауза перед последним словом) — итог по затвору НЕ просим:
// замер реальным Vosk показал, что итог «по любому закрытию затвора» рвёт заход посреди паузы 0,55–0,6 с, и начало последнего слова попадает в промежуток между заходами (≈ 0,2 с) — «нечисто».
// По той же причине QUIET_LAST_MS поднят 650 → 1100 мс: при 650 пауза 0,7 с перед последним словом теряла слово (замер: «where are you … from», «nice to meet … you» — нечисто 0,75),
// а быстрый случай (слово сказано, но не в черновике) теперь закрывает итог по затвору.
// Выдержку затвора тишины (voskGate, 300 мс) НЕ удлиняем: при 600 мс эндпойнтер Vosk (0,5 с тишины) сам закрывал заход посреди фразы — слова терялись совсем (тот же замер).
// ФРАЗА ДОГОВОРЕНА (2026-11-09, журнал владельца: «where you from» — «are» пропущено, пилюля полная, а взлёт через 1,2 с): у однозначно лучшего кандидата (≥ PHRASE_OK, разрыв по pickPhrase)
// услышано ПОСЛЕДНЕЕ слово, но не все (saidThrough) — середину ученик уже не доскажет, ждать нечего. Итог захода с этим — зачёт сразу (раньше SETTLE_MS после конца захода); черновик —
// через SETTLE_LAST_MS (голос в микрофоне отодвигает: вдруг черновик достроится до полного), итог по затвору при этом по-прежнему просим — пришёл раньше, решает сразу; конец захода — тоже SETTLE_LAST_MS.
// Журнал: «[phrase-ear] договорена: последнее слово есть, ratio 0,75 — зачёт по итогу|по черновику|по концу захода через N мс» (N — от первого черновика/итога, где последнее слово появилось).
// СЕРЕДИНЫ НЕТ (2026-11-09, замер реальным Vosk: «where … you from», «from» только итогом — в черновике «where you», зачёт через 3,6 с по авто-стопу): итог по затвору просим и тогда, когда у
// однозначного лучшего услышано ≥ HALF_MIN слов (или ratio ≥ HALF_RATIO), последнего нет, а голос шёл ≥ TAIL_VOICE_MS после последней смены черновика (halfWay). Итог с последним словом — «договорена», зачёт сразу; ничего не добавил — ждём дальше (окно JOIN_MS).
// Слитно («you» и «from» Vosk показал разом, «from» вырезано — голоса после черновика нет) затвор не поможет: такой черновик просит итог, как lastOnly, по тишине quietMs() (≥ QUIET_LAST_MS).
// Журнал (таймлайн на телефоне, N — мс от первого звука попытки, до него — от сброса слушателя): «[phrase-ear] черновик «…» +N мс» — каждый новый черновик, «итог «…» +N мс» — КАЖДЫЙ итог захода
// (и с тем же текстом), «partial без изменений «…» +N мс» — черновик Vosk пришёл, а текст тот же (не чаще SAME_LOG_MS: видно, что черновики идут, а не застряли), «прошу итог захода» (lastOnly),
// «итог запрошен: затвор закрыт +N мс, черновик «…»» (итог по затвору), «[gate] открыт|закрыт +N мс (rms …)» — затвор тишины voskGate (закрыт — тишина не идёт в Vosk). Каждое такое событие уходит и в onEar (отладочная полоска сцены).
// После зачёта заход закрывается, накопленное сбрасывается и слушание начинается заново. Пока isHeld() (говорит Пит) услышанное не учитывается. reset() (каждый новый ход сцены) забывает ВСЁ
// накопленное, в том числе прошлые заходы в окне JOIN_MS: фраза, которую Пит прочитал между ходами, в новый ход не попадает.
import { createGame2Listener } from '../game2/game2Listen.js'
import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'
import { pLog } from '../../shared/lib/debug.js'
import { scorePhrases, pickPhrase, unionWords, earLine, PHRASE_OK, PHRASE_GAP } from './racePhraseScore.js'
import { GATE_RMS } from '../../shared/lib/vosk/voskGate.js'

export { PHRASE_OK }
export const JOIN_MS = 6000   // услышанное прошлых заходов учитывается столько мс (фраза в два-три захода)
export const SETTLE_MS = 1200 // неполное совпадение засчитывается, если после конца захода новых слов нет столько мс
export const SETTLE_LAST_MS = 400 // то же, когда не хватает только ПОСЛЕДНЕГО слова (быстрая речь: итог захода уже спрошен)
export const QUIET_LAST_MS = 1100 // черновик без последнего слова и тишина в микрофоне хотя бы столько мс — просим итог захода (было 350, потом 650: см. «ПАУЗА ПЕРЕД ПОСЛЕДНИМ СЛОВОМ» и «ИТОГ ПО ЗАТВОРУ» выше)
export const QUIET_PAUSE_K = 1.5 // …и не меньше самой длинной паузы между словами попытки × столько
export const QUIET_MAX_MS = 1500 // потолок этой тишины
export const LAST_HOLD_MS = 150  // …и черновик продержался хотя бы столько
export const SAME_LOG_MS = 500   // «partial без изменений» в журнале — не чаще
export const GATE_CLOSE_FINAL_MS = 150 // затвор тишины закрылся, сказанное не всё в черновике — итог захода через столько мс (см. «ИТОГ ПО ЗАТВОРУ»)
export const TAIL_VOICE_MS = 80 // …если голос шёл хотя бы столько после последней смены черновика (обычная пауза перед последним словом: от −150 до +30 мс)
export const FINAL_WAIT_MS = 600 // пока ждём этот итог, решение по прошлым заходам откладывается не дольше чем на столько
export const HALF_MIN = 2 // «середины нет»: столько слов цели уже услышано (итог по затвору при голосе после черновика)…
export const HALF_RATIO = 0.5 // …или такая доля слов
export const NEVER_COMPLETE = 1000 // «сколько слов ждём» для слушателя слов: заход никогда не «полный» — иначе его счёт по словам («where are are you» = 4, а после прошлых заходов — любое одно слово)
// держал затвор тишины открытым, и эндпойнтер Vosk сам рвал заход в паузе перед последним словом (замер CPU 4×: «from» терялось); полную фразу решает decide() по черновику

/** Кандидат, у которого услышаны все слова, кроме последнего (и он однозначно лучший): ключ или null */
export function lastOnly(scores) {
  const p = pickPhrase(scores, true)
  return p && p.hits.length > 1 && !p.hits.at(-1) && p.hits.slice(0, -1).every(Boolean) ? p.key : null
}

/** Фраза договорена: у однозначно лучшего кандидата (≥ PHRASE_OK, разрыв со вторым по pickPhrase) услышано ПОСЛЕДНЕЕ слово, а не хватает середины: ключ или null */
export function saidThrough(scores) {
  const p = pickPhrase(scores, true)
  return p && p.hits.length > 1 && !!p.hits.at(-1) && p.ratio < 1 - 1e-9 ? p.key : null
}

/** Фраза на полпути: у однозначно лучшего кандидата (разрыв со вторым ≥ PHRASE_GAP) услышано ≥ HALF_MIN слов цели (или ratio ≥ HALF_RATIO), а последнего слова нет: ключ или null (итог по затвору, см. «СЕРЕДИНЫ НЕТ») */
export function halfWay(scores) {
  const [best, second] = [...scores].sort((a, b) => b.ratio - a.ratio || b.ok - a.ok)
  if (!best || best.hits.length < 2 || best.hits.at(-1) || (best.ok < HALF_MIN && best.ratio < HALF_RATIO - 1e-9)) return null
  return best.ratio - (second?.ratio ?? 0) >= PHRASE_GAP - 1e-9 ? best.key : null
}

const clean = raw => String(raw ?? '').toLowerCase().split(/\s+/).filter(w => w && w !== '[unk]').join(' ')
const norm = list => (list ?? []).map(p => ({ key: p.key, words: (p.words ?? []).map(w => String(typeof w === 'string' ? w : w?.text ?? '')).filter(Boolean) })).filter(p => p.key && p.words.length)

/**
 * phrases — [{ key, words: ['nice', 'to', 'meet', 'you'] }]; onWord({ phraseKey, index, text, draft }) — новое услышанное слово кандидата: draft — пока только в черновике (partial), потом то же слово
 * ещё раз с draft: false, когда его подтвердил итог захода (каждое — не больше двух раз до зачёта/сброса); onEar({ kind: 'partial' | 'final', text } | { kind: 'gate', open, rms }) — что слышит Vosk (отладочная полоска);
 * onLevel(rms, held) — уровень каждого куска звука микрофона (held — говорит Пит): только журнал / отладка — сцена «Скажи» заливает пилюлю только по распознанным словам;
 * onPhrase({ phraseKey, ratio, heard }) — кандидат сказан (ratio — доля слов: 1 — чисто, 0.75 — одно пропущено); onError(status) — 'unavailable' (нет модели) или 'error' (микрофон / Vosk).
 * Слушать начинает сразу. Зависимости (create, log, now, setTimer, clearTimer, listen, runtime) подставляются в тестах.
 */
export function createPhraseListener({ phrases: phrasesIn, lang = 'en', getStream, isHeld = () => false, onWord, onEar, onLevel, onPhrase, onError, create = createWordListener, game2 = createGame2Listener, log = pLog, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let phrases = norm(phrasesIn)
  let past = []   // услышанное закрытых заходов: [{ text, at }]
  let current = '' // текущий заход (последний черновик / итог)
  let sent = new Map() // ключ кандидата → Map(индекс слова → true, если уже подтверждён итогом; false — пока черновик)
  let settleTimer = 0
  let settleLast = false // ждём SETTLE_LAST_MS (не хватает только последнего слова или фраза договорена): голос отодвигает решение
  let throughBy = ''     // ожидание SETTLE_LAST_MS по договорённой фразе: 'по черновику' | 'по концу захода' ('' — нет)
  let throughAt = null   // когда в этой попытке фраза впервые оказалась договорена (журнал «через N мс»)
  let quietTimer = 0     // черновик без последнего слова: ждём тишину QUIET_LAST_MS, потом просим итог
  let gateTimer = 0      // затвор закрылся при черновике со словом кандидата: через GATE_CLOSE_FINAL_MS просим итог
  let textAt = -Infinity // когда текст захода (черновик / итог) последний раз изменился или начался заход: голос позже — речь, которой в черновике ещё нет
  let pauseMax = 0 // самая длинная пауза между словами этой попытки (тишина между громкими кусками после первого слова)
  let voiceAt = -Infinity, firstAt = null, zero = now(), sameAt = -Infinity // последний громкий кусок звука; первый звук попытки (журнал +N мс); сброс слушателя; последняя строка «без изменений»
  let ear = null
  let gen = 0
  let disposed = false

  const heardNow = () => { const t = now(); past = past.filter(p => t - p.at <= JOIN_MS); return [...past.map(p => p.text), current].filter(Boolean).join(' ') }
  const clearState = () => { past = []; current = ''; sent = new Map(); clearTimer(settleTimer); settleTimer = 0; clearTimer(quietTimer); quietTimer = 0; clearTimer(gateTimer); gateTimer = 0; throughBy = ''; throughAt = null; firstAt = null; zero = now(); sameAt = -Infinity; pauseMax = 0 }
  const quietMs = () => Math.min(QUIET_MAX_MS, Math.max(QUIET_LAST_MS, pauseMax * QUIET_PAUSE_K))
  const rel = () => `+${Math.round(now() - (firstAt ?? zero))} мс`
  const settle = (ms, mine) => { clearTimer(settleTimer); settleTimer = setTimer(() => { settleTimer = 0; if (mine !== gen) return; if (throughBy) through(throughBy); decide(true) }, ms) }
  /** Строка журнала «договорена» (если по услышанному фраза всё ещё договорена) */
  function through(by) {
    const heard = heardNow(), scores = heard ? scorePhrases(phrases, heard) : [], key = saidThrough(scores)
    if (!key) return
    const r = scores.find(s => s.key === key).ratio.toFixed(2).replace('.', ',')
    log(`[phrase-ear] договорена: последнее слово есть, ratio ${r} — зачёт ${by} через ${Math.round(now() - (throughAt ?? now()))} мс`)
  }
  /** Черновик без последнего слова: тишина quietMs() — итог захода сейчас (голос ещё идёт — ждём дальше) */
  const quiet = (mine, hold = LAST_HOLD_MS) => { clearTimer(quietTimer); quietTimer = setTimer(() => { quietTimer = 0; if (mine !== gen || disposed) return; if (now() - voiceAt < quietMs()) return quiet(mine, 1); log(`[phrase-ear] черновик «${current}» без последнего слова, тишина ${Math.round(now() - voiceAt)} мс (порог ${Math.round(quietMs())}) — прошу итог захода ${rel()}`); ear?.stop?.() }, Math.max(hold, quietMs() - (now() - voiceAt))) }

  const hasWord = text => !!text && scorePhrases(phrases, text).some(s => s.hits.some(Boolean))
  /** Затвор закрылся: в услышанном есть слово кандидата, а голос шёл ещё TAIL_VOICE_MS после последней смены черновика (сказанное не всё в черновике) — итог через GATE_CLOSE_FINAL_MS (открылся — отмена) */
  function gateFinal(open, mine) {
    clearTimer(gateTimer); gateTimer = 0
    const tail = voiceAt - textAt, heard = heardNow()
    const scores = heard ? scorePhrases(phrases, heard) : [], best = scores.reduce((a, b) => (b.ratio > a.ratio ? b : a), { ratio: -1, hits: [] })
    const ends = hasWord(current) && best.hits.length > 1 && !!best.hits.at(-1) // в этом заходе слова, у лучшего кандидата уже есть последнее слово (не хватает середины): ждать нечего
    const half = !lastOnly(scores) && !!halfWay(scores) // середины нет, последнего слова тоже — а голос после черновика был: может, это последнее слово, которое Vosk покажет только итогом
    if (open || isHeld() || !((tail >= TAIL_VOICE_MS && (lastOnly(scores) || half)) || ends)) return
    const closedAt = now()
    if (settleTimer && !throughBy) settle(GATE_CLOSE_FINAL_MS + FINAL_WAIT_MS, mine) // решение по прошлым заходам ждёт этот итог (иначе «нечисто» раньше последнего слова)
    gateTimer = setTimer(() => { gateTimer = 0; if (mine !== gen || disposed) return; clearTimer(quietTimer); quietTimer = 0; log(`[phrase-ear] итог запрошен: затвор закрыт +${Math.round(now() - closedAt)} мс, черновик «${current}», ${ends ? 'последнее слово есть' : `голос после черновика ${Math.round(tail)} мс${half ? ' (середины нет)' : ''}`} ${rel()}`); ear?.stop?.() }, GATE_CLOSE_FINAL_MS)
  }

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
    if (saidThrough(scores)) { throughAt ??= now(); return 'through' }
    return lastOnly(scores) ? 'last' : halfWay(scores) ? 'half' : false
  }

  function onDebug(kind, data, mine) {
    if (disposed || mine !== gen) return
    if (kind === 'level') { onLevel?.(data, !!isHeld()); if (data >= GATE_RMS && !isHeld()) { if (firstAt != null && voiceAt > -Infinity) pauseMax = Math.max(pauseMax, now() - voiceAt); voiceAt = now(); if (settleTimer && settleLast) settle(SETTLE_LAST_MS, mine) } return } // голос: недосказанное последнее слово ещё может прийти
    if (kind === 'gate') { log(`[gate] ${data?.open ? 'открыт' : 'закрыт'} ${rel()} (rms ${(Number(data?.rms) || 0).toFixed(3).replace('.', ',')})`); onEar?.({ kind, open: !!data?.open, rms: data?.rms }); gateFinal(!!data?.open, mine); return }
    if (kind === 'partial-same') { const text = clean(data?.raw); if (text && !isHeld() && now() - sameAt >= SAME_LOG_MS) { sameAt = now(); log(`[phrase-ear] partial без изменений «${text}» ${rel()}`) } return }
    if (kind === 'partial' || kind === 'final') {
      if (isHeld()) return // говорит Пит: его голос из динамика — не ученик
      const text = clean(data?.raw)
      if (kind === 'partial' && !text) return
      onEar?.({ kind, text })
      if (text) firstAt ??= now()
      if (kind === 'final' || current !== text) { sameAt = now(); log(`[phrase-ear] ${kind === 'partial' ? 'черновик' : 'итог'} «${text}» ${rel()}`) }
      if (current !== text) textAt = now()
      current = text
      clearTimer(settleTimer); settleTimer = 0; throughBy = ''; clearTimer(quietTimer); quietTimer = 0
      if (kind === 'final') { clearTimer(gateTimer); gateTimer = 0 }
      const got = decide(false, kind === 'partial')
      if ((got === 'last' || got === 'half') && kind === 'partial') quiet(mine) // середины нет — тоже: «from» только итогом, а «you» пришло вместе с ним (голоса после черновика нет)
      else if (got === 'through' && kind === 'final') { through('по итогу'); decide(true) } // ученик договорил до последнего слова, а середину уже не скажет — ждать нечего
      else if (got === 'through') { throughBy = 'по черновику'; settleLast = true; settle(SETTLE_LAST_MS, mine) } // черновик ещё может достроиться до полного
    } else if (kind === 'session-end') {
      if (current) past.push({ text: current, at: now() })
      current = ''; textAt = now() // следующий заход Vosk (wordLaneListen перезапускает сам): голос в нём — ещё не в черновике
      const heard = heardNow()
      if (!heard) return
      const scores = scorePhrases(phrases, heard)
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
    /** Новые кандидаты: словарь пересобирается, услышанное забывается */
    setPhrases(next) { if (disposed) return; phrases = norm(next); clearState(); restart() },
  }
}

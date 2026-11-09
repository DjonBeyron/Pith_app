// Сцена этапа 2 «Фразы» игры «Встряхни память» для движка пилюль (useWordLanePills: ступень со step.phrases — raceStagesPhrases.js). DOM без React, как wordLaneOrderScene.js: пилюли из пула (wide — широкие,
// по центру одной ленты), часы — из анимаций полёта (pool.y), речь Пита — у директора гонки (fx.pre → useRaceActs → racePhraseVoice.js), ход ждёт, пока Пит договорит (fx.pitLeft) —
// кроме «Скажи»: там пилюля выезжает ВМЕСТЕ с репликой (racePhraseEarly.js — к концу реплики она у верха зоны чтения), слушатель включён сразу, речь Пита он не берёт (isHeld — окно речи).
// Ход: pre (Пит говорит смысл / фразу; без озвучки смысла — подпись над лентой, e.show) → ride (пилюли хода едут одна за другой через cfg.gap) → итог → after (Пит реагирует) → следующий ход.
// ЕДИНЫЙ КОНВЕЙЕР: после итога хода остальные его пилюли не гаснут — они «отыграны» (data-spent, бледнее) и едут вниз, пока не уйдут за край (без взлёта, промаха и fail); следующий ход начинается, не дожидаясь их,
// и его пилюли выезжают ЗА ними тем же потоком: новая пилюля — не раньше cfg.gap после предыдущей на ленте (скорость у всех одна — не наезжают, порядок сохраняется). Тап по отыгранной — ничего.
// Вид пилюли — data-mode = режим круга (pick / say / hear, race-phrase-rounds.css): у круга 2 своя рамка и цвет, чтобы смена задания читалась сразу.
//  • pick (круг 1 «Пойми») и hear (круг 2 «Узнай»): ТОЛЬКО тап по ленте — по пилюле, В ЧЬЮ РАМКУ ПОПАЛ ПАЛЕЦ (raceTapHit.js: прямоугольники живых пилюль в момент pointerdown, допуск 12 px, зазор ≤ 24 px; мимо — подсветка точки,
//    raceTapMiss.js; раньше брали «ближайшую к центру экрана» по прошлому кадру — тап по верхней пилюле засчитывался нижней: ложное «неверно»); журнал «[tap] y=… x=… попал: …»; слушатель фраз здесь не создаётся. Верная — зачёт и взлёт целиком (fx.win);
//    чужая — дрожь (missPill), верная подсвечивается (data-hot) и взлетает сама через HOT_MS (fx.miss, confusedWith); верная ушла за край — «не успел» (fx.fail);
//  • say (круг 2 «Скажи» голосом, слушатель фраз): одна пилюля, слова спрятаны маской-кирпичиками (проход 1; сказано слово k — слово k+1 проявляется целым словом до 20 %, racePhrasePeek.js; неверное слово — рывок кромки красным, racePhraseNudge.js) («Nice ▭▭ ▭▭▭▭ ▭▭▭», racePhraseMask.js / racePhraseMaskView.js) и проявляются по onWord (и черновиком — целиком),
//    на итоге хода видна вся фраза; ОДНА заливка на всю фразу, слева направо (pool.paintFill широкой пилюли — translateX): цель — доля слов, каждое сказанное слово — своя полная доля (racePhraseFill.js),
//    экран догоняет цель каждый кадр (wordLaneFillView.js). onPhrase с ratio ≥ PHRASE_OK — зачёт («чисто» — все слова): заливка доезжает до 100 %, потом взлёт (finishDue); у края без итога и ≥ 75 % слов в черновике — продление на 1,5 с (pool.hold, racePhraseFill.edgeVerdict), иначе fail; едет с ПОСТОЯННОЙ скоростью, как все пилюли (раньше после 3 с тишины ускорялась вдвое, услышанное слово снова замедляло — владелец: «странно ускоряются»).
// МЕЖДУ КРУГАМИ лента та же: круг кончился (fx.finished) — сцену сменяет плашка, а едущие пилюли не исчезают, а доезжают до края (stop → pool.coast, wordLaneCoast.js), Пита это не держит; первая пилюля следующего круга выезжает не ближе cfg.gap за последней доезжающей (pool.tail).
// ДЕМО и ДВА ПРОХОДА «Скажи»: у step.phrases.demo перед первым ходом — демо-ход на живой пилюле (racePhraseDemoTurn.js; голос и ворота директора — fx.pre с rep.demo → e.demo(kit)); ход с pass 2 — та же фраза открытым текстом (data-pass='2', маска целиком и не закрывается; заливка по словам одним движением — racePhraseGlide.js через racePhraseSayView.js; уровень микрофона заливку не двигает ни в одном проходе), зачёт «без остановок» по моментам первых услышанных слов (wordAt, racePhrasePasses.passTwoRes).
// Итог хода уходит директору в rep.res: { ok, late, confusedWith, ratio, clean, smooth?, maxPause? }; журнал «[phrases] круг 1 «Пойми» (тап фразы), ход N/M: цель … кандидаты … итог …; остальные едут: N». Все ходы — fx.finished.
import { ENTER_Y, EXIT_Y, SPEED, LISTEN_Y_MIN, LISTEN_Y_MAX } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { missPill, snapPill } from '../player/modules/rotate-phone/wordLaneSnap.js'
import { createFillView, approachFillFast } from '../player/modules/rotate-phone/wordLaneFillView.js'
import { markWord, finishDue, edgeVerdict, LAST_WORD_GRACE_MS } from './racePhraseFill.js'
import { createSayView } from './racePhraseSayView.js'
import { createSayTrace } from './racePhraseSayTrace.js'
import { earlyAtMs } from './racePhraseEarly.js'
import { RISE_DELAY_MS, RISE_MS } from '../player/modules/rotate-phone/wordLaneRise.js'
import { mountMask } from './racePhraseMaskView.js'
import { pLog } from '../../shared/lib/debug.js'
import { isLate } from './raceExtraRound.js'
import { phraseTokens, phraseWords, phraseWordKeys } from './racePhraseData.js'
import { phraseListen, PHRASE_OK } from './racePhraseListener.js'
import { LANE } from './raceStagesPhrases.js'
import { hitPill, tapLine } from './raceTapHit.js'
import { tapMissMark } from './raceTapMiss.js'
import { createDemoTurn } from './racePhraseDemoTurn.js'
import { passTwoRes, passNote } from './racePhrasePasses.js'
import { caption } from './racePhraseCaption.js'

export const CENTER_Y = 50      // тап БЕЗ точки (стенд, тесты, клавиатура): берёт пилюлю, чей центр ближе всего к середине экрана; настоящий тап — по точке (raceTapHit.js)
export const PRE_MIN_MS = 250   // после 'pre' — хотя бы столько, чтобы речь Пита успела начаться (pitLeft > 0)
export const AFTER_MS = 600     // после итога хода — пауза до следующего (и пока Пит говорит)
export const HOT_MS = 650       // после ошибки верная пилюля подсвечена столько, потом взлетает сама

const q = t => `«${t}»`
export const ROUND_LOG = { pick: '«Пойми» (тап фразы)', say: '«Скажи» (голос)', hear: '«Узнай» (тап смысла)' } // круг и режим в журнале хода

export function runPhraseScene({ pool, root, scene, fxRef, listen = phraseListen, now = () => performance.now(), raf = f => requestAnimationFrame(f), caf = id => cancelAnimationFrame(id), log = pLog, snap = snapPill, shake = missPill, debugBar }) { // snap / shake — щелчок и дрожь пилюли (wordLaneSnap.js; тесты подставляют свои); debugBar — полоска отладки «Скажи» (racePhraseDebugBar.js)
  const cfg = scene.step.phrases
  const turns = cfg.turns ?? []
  const fx = () => fxRef?.current ?? {}
  const cap = caption(root)
  const missMark = tapMissMark(root) // подсветка «мимо»
  const view = createFillView(approachFillFast) // заливка «Скажи» на экране: адаптивный догон (быстрая речь — одним движением)
  const trace = createSayTrace({ log, ...(debugBar !== undefined ? { bar: debugBar } : {}) }) // журнал «[fill]» и полоска отладки «Скажи»
  let ti = (scene.from ?? 0) - 1, phase = 'next', at = now(), pills = [], res = null, lit = new Set(), frame = 0, stopped = false, timers = []
  let rolling = [], lastSpawn = -Infinity, heardW = new Map(), shown = 0, lastT = now(), fillW = new Map(), fin = null // rolling — отыгранные пилюли прошлых ходов (едут вниз); heardW — слово → подтверждено ли; fillW — слова для заливки, fin — итог, заливка доезжает
  let demo = null, demoKit = null, demoTried = false, wordAt = new Map(), sv = null, grace = null // демо-ход и его голос; wordAt — номер слова → когда впервые услышано (проход 2: паузы); sv — вид хода «Скажи» (racePhraseSayView.js); grace — продление хода у края
  const tail = pool.tail?.() // доезжающие пилюли прошлого круга (wordLaneCoast.js): наша первая — не ближе cfg.gap за последней из них
  if (tail != null) lastSpawn = now() - ((tail - ENTER_Y) / (SPEED * cfg.speed)) * 1000
  const masks = new Set() // маски слов пилюль «Скажи» (racePhraseMaskView.js): снимаются, когда пилюля ушла или взлетела, и на стопе сцены
  const dropMask = (m, ms = 0) => { if (!m) return; const go = () => { m.remove(); masks.delete(m) }; if (ms) timers.push(setTimeout(go, ms)); else go() }
  const gone = p => { pool.give(p.k); p.gone = true; dropMask(p.mask) }
  const turn = () => turns[ti]
  const live = () => pills.filter(p => !p.gone && !p.spent)
  const riding = () => [...rolling, ...pills].filter(p => !p.gone)
  const yOf = p => pool.y(p.k) ?? ENTER_Y
  const onScreen = p => !p.gone && p.y >= LISTEN_Y_MIN && p.y < LISTEN_Y_MAX
  const target = () => pills.find(p => p.cand.right)
  const rep = () => { const t = turn(); return { idx: t.idx, parts: [], round: cfg.round, mode: cfg.mode, phraseKey: t.target.key, text: t.target.text, ru: t.target.ru, words: phraseWordKeys(t.target), target: t.target, cands: t.cands, res, pass: t.pass } }

  let listener = null
  if (cfg.voice && cfg.mode === 'say' && listen) { // слушатель фраз — только у «Скажи»: круг 1 и «Узнай» отвечают тапом в любом режиме
    try { listener = listen({ phrases: [], onWord: e => heardWord(e), onEar: e => { trace.ear(e); sv?.ear(e) }, onPhrase: e => heardPhrase(e), onError: e => log(`[phrases] слушатель фраз: ошибка ${e?.message ?? e}; дальше тапом`) }) } catch (e) { log(`[phrases] слушатель фраз не запустился: ${e?.message ?? e}`) }
  }

  const spawn = (cand, j, atMs = 0) => {
    const k = pool.take(LANE, { atMs, speed: cfg.speed, cap: cand.cap, quiet: true, wide: true })
    if (k == null) return null
    pool.attr(k, 'data-mode', cfg.mode)
    if (cfg.mode === 'say' && turn()?.pass !== 2) pool.attr(k, 'data-faded')
    if (!atMs) lastSpawn = now()
    const p = { k, cand, j, y: ENTER_Y, gone: false, spent: false, mask: cfg.mode === 'say' ? mountMask(pool.el(k), cand.text ?? cand.cap) : null }
    if (p.mask) masks.add(p.mask)
    if (p.mask && turn()?.pass === 2) { pool.attr(k, 'data-pass', '2'); p.mask.set(new Map(), true) } // проход 2: вся фраза открыта (и остаётся открытой), своя рамка
    if (p.mask) { trace.spawn(now(), pool.el(k)); if (cand.right) sv = createSayView({ pass: turn()?.pass ?? 1, text: cand.text ?? cand.cap, n: phraseWords(turn().target.text).length, mask: p.mask, log, nudge: on => pool.attr(p.k, 'data-nudge', on), el: pool.el(p.k), onWrong: trace.wrong }) }
    pills.push(p)
    return p
  }

  /** Демо-ход «Скажи» перед первым ходом круга: директор отдаёт голос и ворота (kit.claim — раз за игру); нет — сразу первый ход. Почему демо нет — в журнал «[demo] демо пропущено: …» */
  function startDemo(t) {
    demoTried = true
    const skip = why => { log(`[demo] демо пропущено: ${why}`); return false }
    if (!cfg.demo) return skip('нет фразы для демо')
    if (ti >= 0) return skip(`продолжение с хода ${ti + 2}`)
    fx().pre?.({ rep: { demo: true, round: cfg.round, mode: cfg.mode, target: cfg.demo, text: cfg.demo.text }, show: text => cap.show(text), demo: k => { demoKit = k } })
    if (!demoKit) return skip('директор не дал голос Пита (не гонка)')
    if (!demoKit.claim?.(cfg.demo)) return false // причину пишут ворота (racePhraseDemo.createDemoGate)
    demo = createDemoTurn({ pool, lane: LANE, speed: cfg.speed, phrase: cfg.demo, kit: demoKit, show: text => cap.show(text), snap, now, log, onDone: () => { demoKit.end?.(''); if (!stopped) phase = 'next' } })
    phase = 'demo'; at = t
    return true
  }

  function startTurn(t) {
    if (!demoTried && cfg.mode === 'say' && startDemo(t)) return
    ti++
    if (ti >= turns.length) { phase = 'done'; listener?.stop(); fx().finished?.(true); return }
    rolling = riding(); pills = []; res = null; lit = new Set(); heardW = new Map(); shown = 0; trace.drop(); fillW = new Map(); fin = null; view.forget('say'); cap.show('')
    wordAt = new Map(); sv?.stop(); sv = null; grace = null
    const cur = turn()
    listener?.setPhrases(cur.cands.map(c => ({ key: c.key, words: phraseTokens(c.text) })))
    listener?.reset()
    fx().pre?.({ rep: rep(), show: text => cap.show(text) })
    phase = 'pre'; at = t
    if (cfg.mode === 'say') sayEarly(t)
  }

  /** «Скажи»: пилюля выезжает вместе с репликой Пита, не дожидаясь pitLeft (racePhraseEarly.js); места за едущими нет — выедет обычным потоком через cfg.gap */
  function sayEarly(t) {
    const pit = fx().pitLeft?.() ?? 0, atMs = earlyAtMs({ pitMs: pit, speed: cfg.speed, gap: cfg.gap, ys: riding().map(yOf) })
    phase = 'ride'; const p = atMs == null ? null : spawn(turn().cands[0], 0, atMs)
    if (p) { lastSpawn = t - atMs; p.y = yOf(p) }
    log(`[phrases] круг ${cfg.round} ${ROUND_LOG[cfg.mode]}, ход ${turn().idx + 1}/${turns.length}${passTag()}: ${p ? `пилюля выезжает вместе с репликой Пита (${Math.round(pit)} мс) с ${Math.round(p.y)} % высоты` : 'пилюля ждёт места за едущими'}, speed ${String(cfg.speed).replace('.', ',')}, gap ${cfg.gap} мс`)
  }

  const lineOf = r => (cfg.mode === 'say' ? passNote(r, turn().pass) : r.ok ? 'верно' : r.confusedWith ? `спутал с ${q(turn().cands.find(c => c.key === r.confusedWith)?.text ?? r.confusedWith)}` : 'не успел') + (r.late ? ', в последний момент' : '')
  const passTag = () => (turn()?.pass ? `, проход ${turn().pass}/2` : '')

  /** Пилюля отыграна: едет вниз до края, на тап и голос больше не отвечает */
  const spend = p => { p.spent = true; pool.attr(p.k, 'data-spent') }

  function resolve(kind, extra = {}) {
    const tg = target()
    res = { ok: kind === 'win', late: kind === 'win' && isLate(tg?.y), confusedWith: null, ratio: cfg.mode === 'say' ? 0 : kind === 'win' ? 1 : 0, clean: kind === 'win', ...extra }
    const t = turn()
    const rest = live().filter(p => p !== tg)
    rest.forEach(spend)
    if (kind === 'fail' && tg && !tg.gone) spend(tg) // упущенная верная тоже доезжает сама
    tg?.mask?.set(heardW, true) // итог «Скажи»: видна вся фраза (взлетает или доезжает вниз с ней)
    if (cfg.mode === 'say') { if (kind === 'win') trace.rise(now()); trace.end(); trace.drop() }
    log(`[phrases] круг ${cfg.round} ${ROUND_LOG[cfg.mode] ?? cfg.mode}, ход ${t.idx + 1}/${turns.length}${passTag()}: цель ${q(t.target.text)}${cfg.mode === 'say' ? '' : ` кандидаты ${t.cands.map(c => q(c.cap)).join(' | ')}`} итог ${lineOf(res)}${cfg.mode === 'say' ? '' : `; остальные едут: ${rest.length}`}`)
    const r = rep()
    if (kind === 'win') {
      pool.attr(tg.k, 'data-lock'); pool.flashLane(LANE); snap(pool.el(tg.k), LANE, { full: true })
      const rect = pool.el(tg.k)?.getBoundingClientRect?.() ?? null
      if (pool.rise(tg.k)) { tg.gone = true; dropMask(tg.mask, RISE_DELAY_MS + RISE_MS + 100) }
      fx().win?.(0, rect, { last: true, count: 1, ...r })
    } else if (kind === 'miss') fx().miss?.({ rep: r })
    else fx().fail?.({ rep: r })
    phase = 'after'; at = now()
  }

  /** Ошибка: чужая пилюля дрожит и едет дальше отыгранной, верная подсвечивается и сама взлетает */
  function wrong(p) {
    shake(pool.el(p.k))
    let tg = target()
    if (!tg) { tg = spawn(turn().cands.find(c => c.right), -1, ((CENTER_Y - 15 - ENTER_Y) / (SPEED * cfg.speed)) * 1000); if (tg) tg.y = yOf(tg) } // верная ещё не выехала — появляется в зоне чтения
    if (tg) pool.attr(tg.k, 'data-hot')
    resolve('miss', { confusedWith: p.cand.key })
    if (tg && !tg.gone) timers.push(setTimeout(() => { if (!stopped && pool.rise(tg.k)) tg.gone = true }, HOT_MS))
  }

  const pick = p => { if (p.cand.right) resolve('win'); else wrong(p) }

  /** «Скажи»: слово фразы услышано — проход 1: маска снимает слово и подсказывает следующее, заливке — доля слова (racePhraseFill.markWord); проход 2: заливка по словам (racePhraseGlide.js), маску не трогаем */
  function heardWord(e) {
    if (stopped || phase !== 'ride' || res || fin || cfg.mode !== 'say' || e?.phraseKey !== turn()?.target.key || !target()) return
    lit.add(e.index); markWord(fillW, e.index, e.draft, now()); trace.word(e, now()); if (!wordAt.has(e.index)) wordAt.set(e.index, now())
    if (!e.draft || !heardW.has(e.index)) heardW.set(e.index, !e.draft)
    for (const [i, full] of heardW) if (!full && i < e.index) heardW.set(i, true)
    sv?.word(e.index, heardW, now()) // racePhraseSayView.js: проход 1 — маска слово за словом + подсказка, проход 2 — граница заливки
  }

  const goal = t => sv?.goal({ t, words: fillW, done: !!fin }) ?? 0 // цель заливки «Скажи»: по словам до границ, в проходе 2 — одним движением (racePhraseSayView.js)

  /** «Скажи»: пилюля у нижней границы без итога — продление на LAST_WORD_GRACE_MS (≥ 75 % слов в черновике, пилюля замирает: pool.hold), итог по черновику «нечисто» или «не успел» (racePhraseFill.edgeVerdict) */
  function atEdge(tg, t) {
    const n = phraseWords(turn().target.text).length || 1, ratio = Math.min(1, lit.size / n), v = edgeVerdict({ grace, t, lit: lit.size, n, canHold: !!pool.hold })
    const head = `[phrases] круг ${cfg.round} ${ROUND_LOG[cfg.mode]}, ход ${turn().idx + 1}/${turns.length}${passTag()}: пилюля у края без итога —`
    if (v === 'hold') { grace = t; pool.hold(tg.k, true); log(`${head} ход продлён на ${LAST_WORD_GRACE_MS} мс (черновик ${Math.round(ratio * 100)} %)`) }
    else if (v === 'draft') { log(`${head} итог по черновику ${Math.round(ratio * 100)} %, нечисто`); fin = { at: t, extra: { ...(turn().pass === 2 ? passTwoRes(ratio, [...wordAt.values()]) : { ratio }), clean: false, late: true }, word: wordAt.size ? Math.max(...wordAt.values()) : null } }
    else if (v === 'fail') resolve('fail', { ratio })
  }

  /** «Скажи»: фраза сказана (ratio ≥ PHRASE_OK) — зачёт: видна вся фраза, заливка доезжает до 100 %, взлёт — в tick (finishDue); слушатель есть только у этого круга */
  function heardPhrase(e) {
    if (stopped || phase !== 'ride' || res || fin || cfg.mode !== 'say' || !target()) return // пилюля хода ещё не выехала (проход 2 ждёт gap) — хвост прошлой речи не в счёт
    if (e?.phraseKey !== turn().target.key || !(e.ratio >= PHRASE_OK)) return
    const n = phraseWords(turn().target.text).length || 1
    const ratio = Math.min(1, Math.max(e.ratio, lit.size / n))
    fin = { at: now(), extra: { ...(turn().pass === 2 ? passTwoRes(ratio, [...wordAt.values()]) : { ratio, clean: ratio >= 1 }), late: isLate(target()?.y) }, word: wordAt.size ? Math.max(...wordAt.values()) : null } // word — последнее услышанное слово (журнал «→ 100 %»); проход 2: ещё и без остановок; взлёт — когда заливка доехала (tick)
    target()?.mask?.set(heardW, true); trace.phrase(ratio)
  }

  function tick(t) {
    const dt = t - lastT; lastT = t
    for (const p of rolling) if (!p.gone) { p.y = yOf(p); if (p.y >= EXIT_Y) gone(p) } // отыгранные прошлых ходов едут до края
    if (phase === 'next') startTurn(t)
    else if (phase === 'demo') demo?.tick(t)
    else if (phase === 'pre' && t - at >= PRE_MIN_MS && !(fx().pitLeft?.() > 0)) { phase = 'ride'; at = t; log(`[phrases] круг ${cfg.round} ${ROUND_LOG[cfg.mode] ?? cfg.mode}, ход ${turn().idx + 1}/${turns.length}${passTag()}: пилюли едут, speed ${String(cfg.speed).replace('.', ',')}, gap ${cfg.gap} мс`) }
    else if (phase === 'ride' || phase === 'after') {
      if (phase === 'ride') { const c = turn().cands; for (let j = pills.length; j < c.length && t - at >= j * cfg.gap && t - lastSpawn >= cfg.gap; j++) spawn(c[j], j) } // за едущими — не ближе cfg.gap
      for (const p of pills) if (!p.gone) { p.y = yOf(p); if (p.y >= EXIT_Y) gone(p) }
      const tg = target()
      if (phase === 'ride' && cfg.mode === 'say' && tg && !tg.gone && !res) { const g = goal(t); shown = view.step('say', g, dt); pool.paintFill(tg.k, shown); sv?.frame(t, !!fin); trace.frame(t, g, shown); if (fin && finishDue(fin, shown, t, () => trace.full(t, fin.word))) resolve('win', fin.extra) }
      if (phase === 'ride' && tg && !res && !fin && tg.y >= LISTEN_Y_MAX) { if (cfg.mode === 'say') atEdge(tg, t); else resolve('fail') }
      if (phase === 'after' && t - at >= AFTER_MS && !live().length && !(fx().pitLeft?.() > 0)) phase = 'next'
    }
  }

  /** Тап с точкой: прямоугольники всех едущих пилюль — в этот же момент (до следующего кадра они уедут); выбор — hitPill, журнал — каждый тап */
  function tapAt(pt) {
    const ride = riding().map(p => ({ p, id: p.k, cap: p.cand.cap, spent: p.spent || !pills.includes(p), rect: pool.el(p.k)?.getBoundingClientRect?.() ?? null }))
    const r = hitPill(pt, ride)
    log(tapLine(pt, ride, r) + (phase !== 'ride' || res ? ` — ход ${res ? 'решён' : 'не начат'}, тап не в счёт` : ''))
    if (phase !== 'ride' || res) return
    if (r.hit) pick(r.hit.p)
    else if (r.why === 'мимо') missMark.show(pt)
  }

  const loop = () => { if (stopped) return; tick(now()); frame = raf(loop) }
  frame = raf(loop)

  return {
    api: {
      /** Тап по ленте (любая дорожка — вся лента): pt = { x, y } точки касания — пилюля, в чью рамку попали (raceTapHit.js); без pt — ближе всего к центру; отыгранная — ничего; «Скажи» тапом не отвечает */
      tap(_lane, pt) {
        if (stopped || cfg.mode === 'say') return
        if (pt) return tapAt(pt)
        if (phase !== 'ride' || res) return
        const p = riding().filter(onScreen).sort((a, b) => Math.abs(a.y - CENTER_Y) - Math.abs(b.y - CENTER_Y))[0]
        if (p && !p.spent && pills.includes(p)) pick(p)
      },
      /** Пауза: с какого хода «Продолжить» — текущий, пока итога нет (он сыграется заново: маска и заливка с нуля), иначе следующий (scene.from, useWordLaneControls) */
      resumeAt: () => Math.min(turns.length, Math.max(0, phase === 'next' || res ? ti + 1 : ti)),
      /** Для тестов и стенда: что сейчас на ленте (spent — отыгранные, едут вниз), fill — заливка «Скажи» на экране, mask — слова под маской «Скажи», listening — есть ли слушатель фраз */
      state: () => ({ phase, turn: ti, mode: cfg.mode, pass: turn()?.pass ?? null, demo: phase === 'demo' ? demo?.state() ?? null : null, listening: !!listener && phase !== 'demo', pills: live().map(p => ({ key: p.cand.key, y: p.y, right: p.cand.right })), spent: riding().filter(p => p.spent).map(p => ({ key: p.cand.key, y: p.y })), res, fill: shown, mask: target()?.mask?.words() ?? null }),
    },
    tick,
    /** Сцена снята. Круг кончился (phase 'done') — едущие пилюли доезжают до края (pool.coast), их маски уходят с ними; иначе (пауза, перезапуск) всё убирает пул (giveAll) */
    stop() {
      stopped = true; caf(frame); timers.forEach(clearTimeout); listener?.stop(); cap.remove(); missMark.remove(); trace.drop(); sv?.stop()
      if (demo && !demo.done()) demoKit?.end?.('сцена снята (пауза, сворачивание или смена стадии)'); demo?.stop()
      const ride = phase === 'done' ? riding() : []
      const ks = ride.length ? (pool.coast?.(k => { const p = ride.find(x => x.k === k); log(`[phrases] доехала ${q(p?.cand.cap ?? '?')}`); dropMask(p?.mask) }) ?? []) : []
      const went = ride.filter(p => ks.includes(p.k))
      if (phase === 'done') log(`[phrases] круг ${cfg.round} кончился: доезжают ${went.length} пилюль`)
      masks.forEach(m => { if (!went.some(p => p.mask === m)) m.remove() }); masks.clear()
    },
  }
}

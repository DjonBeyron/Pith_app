// Сцена этапа 2 «Фразы» игры «Встряхни память» для движка пилюль (useWordLanePills: ступень со step.phrases — raceStagesPhrases.js). DOM без React, как wordLaneOrderScene.js: пилюли из пула (wide — широкие,
// по центру одной ленты), часы — из анимаций полёта (pool.y), речь Пита — у директора гонки (fx.pre → useRaceActs → racePhraseVoice.js), ход ждёт, пока Пит договорит (fx.pitLeft).
// Ход: pre (Пит говорит смысл / фразу; без озвучки смысла — подпись над лентой, e.show) → ride (пилюли хода едут одна за другой через cfg.gap) → итог → after (Пит реагирует) → следующий ход.
// ЕДИНЫЙ КОНВЕЙЕР: после итога хода остальные его пилюли не гаснут — они «отыграны» (data-spent, бледнее) и едут вниз, пока не уйдут за край (без взлёта, промаха и fail); следующий ход начинается, не дожидаясь их,
// и его пилюли выезжают ЗА ними тем же потоком: новая пилюля — не раньше cfg.gap после предыдущей на ленте (скорость у всех одна — не наезжают, порядок сохраняется). Тап по отыгранной — ничего.
// Вид пилюли — data-mode = режим круга (pick / say / hear, race-phrase-rounds.css): у круга 2 своя рамка и цвет, чтобы смена задания читалась сразу.
//  • pick (круг 1 «Пойми») и hear (круг 2 «Узнай»): ТОЛЬКО тап по ленте — по пилюле, В ЧЬЮ РАМКУ ПОПАЛ ПАЛЕЦ (raceTapHit.js: прямоугольники живых пилюль в момент pointerdown, допуск 12 px, зазор ≤ 24 px; мимо — подсветка точки,
//    raceTapMiss.js; раньше брали «ближайшую к центру экрана» по прошлому кадру — тап по верхней пилюле засчитывался нижней: ложное «неверно»); журнал «[tap] y=… x=… попал: …»; слушатель фраз здесь не создаётся. Верная — зачёт и взлёт целиком (fx.win);
//    чужая — дрожь (missPill), верная подсвечивается (data-hot) и взлетает сама через HOT_MS (fx.miss, confusedWith); верная ушла за край — «не успел» (fx.fail);
//  • say (круг 2 «Скажи» голосом, слушатель фраз): одна пилюля, слова спрятаны маской («N… to m… y…», racePhraseMask.js / racePhraseMaskView.js) и проявляются по onWord (черновик — бледно, подтверждение — целиком),
//    на итоге хода видна вся фраза; ОДНА заливка на всю фразу, слева направо (pool.paintFill широкой пилюли — translateX): цель — доля слов (слово в черновике — половина своего вклада,
//    подтверждённое — целиком; первый черновик — сразу «аванс» FILL_ADVANCE слова), экран догоняет цель каждый кадр (wordLaneFillView.js). onPhrase с ratio ≥ PHRASE_OK — зачёт («чисто» — все слова), ушла — fail;
//    едет медленно, после SILENCE_MS тишины (Пит не говорит, слов нет) — быстрее в SAY_BOOST раз, услышано слово — снова медленно.
// Итог хода уходит директору в rep.res: { ok, late, confusedWith, ratio, clean }; журнал «[phrases] круг 1 «Пойми» (тап фразы), ход N/M: цель … кандидаты … итог …; остальные едут: N». Все ходы — fx.finished.
import { ENTER_Y, EXIT_Y, SPEED, LISTEN_Y_MIN, LISTEN_Y_MAX } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { missPill, snapPill } from '../player/modules/rotate-phone/wordLaneSnap.js'
import { createFillView, FILL_ADVANCE } from '../player/modules/rotate-phone/wordLaneFillView.js'
import { RISE_DELAY_MS, RISE_MS } from '../player/modules/rotate-phone/wordLaneRise.js'
import { mountMask } from './racePhraseMaskView.js'
import { pLog } from '../../shared/lib/debug.js'
import { isLate } from './raceExtraRound.js'
import { phraseTokens, phraseWords, phraseWordKeys } from './racePhraseData.js'
import { phraseListen, pitTalking, PHRASE_OK } from './racePhraseListener.js'
import { LANE } from './raceStagesPhrases.js'
import { hitPill, tapLine } from './raceTapHit.js'
import { tapMissMark } from './raceTapMiss.js'

export const CENTER_Y = 50      // тап БЕЗ точки (стенд, тесты, клавиатура): берёт пилюлю, чей центр ближе всего к середине экрана; настоящий тап — по точке (raceTapHit.js)
export const PRE_MIN_MS = 250   // после 'pre' — хотя бы столько, чтобы речь Пита успела начаться (pitLeft > 0)
export const AFTER_MS = 600     // после итога хода — пауза до следующего (и пока Пит говорит)
export const HOT_MS = 650       // после ошибки верная пилюля подсвечена столько, потом взлетает сама
export const ADVANCE_MS = 1500  // «аванс» заливки держится столько после последнего черновика (дальше — только услышанные слова)
export const SILENCE_MS = 3000  // «Скажи»: столько тишины — пилюля ускоряется
export const SAY_BOOST = 2

const q = t => `«${t}»`
export const ROUND_LOG = { pick: '«Пойми» (тап фразы)', say: '«Скажи» (голос)', hear: '«Узнай» (тап смысла)' } // круг и режим в журнале хода

/** Подпись смысла над лентой (один узел на сцену, только opacity) */
function caption(root) {
  const doc = root?.ownerDocument
  const el = doc?.createElement?.('div')
  if (el) { el.className = 'racePhraseRu'; el.setAttribute('data-testid', 'race-phrase-ru'); root.appendChild(el) }
  return { show: text => { if (!el) return; el.textContent = text ?? ''; if (text) el.setAttribute('data-on', ''); else el.removeAttribute('data-on') }, remove: () => el?.remove() }
}

export function runPhraseScene({ pool, root, scene, fxRef, listen = phraseListen, held = pitTalking, now = () => performance.now(), raf = f => requestAnimationFrame(f), caf = id => cancelAnimationFrame(id), log = pLog, snap = snapPill, shake = missPill }) { // snap / shake — щелчок и дрожь пилюли (wordLaneSnap.js; тесты подставляют свои)
  const cfg = scene.step.phrases
  const turns = cfg.turns ?? []
  const fx = () => fxRef?.current ?? {}
  const cap = caption(root)
  const missMark = tapMissMark(root) // подсветка «мимо»
  const view = createFillView() // заливка «Скажи» на экране
  let ti = -1, phase = 'next', at = now(), pills = [], res = null, lit = new Set(), quietAt = 0, boost = false, frame = 0, stopped = false, timers = []
  let rolling = [], lastSpawn = -Infinity, heardW = new Map(), heardAt = -Infinity, shown = 0, lastT = now() // rolling — отыгранные пилюли прошлых ходов (едут вниз); heardW — слово → подтверждено ли
  const masks = new Set() // маски слов пилюль «Скажи» (racePhraseMaskView.js): снимаются, когда пилюля ушла или взлетела, и на стопе сцены
  const dropMask = (m, ms = 0) => { if (!m) return; const go = () => { m.remove(); masks.delete(m) }; if (ms) timers.push(setTimeout(go, ms)); else go() }
  const gone = p => { pool.give(p.k); p.gone = true; dropMask(p.mask) }
  const turn = () => turns[ti]
  const live = () => pills.filter(p => !p.gone && !p.spent)
  const riding = () => [...rolling, ...pills].filter(p => !p.gone)
  const yOf = p => pool.y(p.k) ?? ENTER_Y
  const onScreen = p => !p.gone && p.y >= LISTEN_Y_MIN && p.y < LISTEN_Y_MAX
  const target = () => pills.find(p => p.cand.right)
  const rep = () => { const t = turn(); return { idx: t.idx, parts: [], round: cfg.round, mode: cfg.mode, phraseKey: t.target.key, text: t.target.text, ru: t.target.ru, words: phraseWordKeys(t.target), target: t.target, cands: t.cands, res } }

  let listener = null
  if (cfg.voice && cfg.mode === 'say' && listen) { // слушатель фраз — только у «Скажи»: круг 1 и «Узнай» отвечают тапом в любом режиме
    try { listener = listen({ phrases: [], onWord: e => heardWord(e), onHear: () => { heardAt = now() }, onPhrase: e => heardPhrase(e), onError: e => log(`[phrases] слушатель фраз: ошибка ${e?.message ?? e}; дальше тапом`) }) } catch (e) { log(`[phrases] слушатель фраз не запустился: ${e?.message ?? e}`) }
  }

  const spawn = (cand, j, atMs = 0) => {
    const k = pool.take(LANE, { atMs, speed: cfg.speed, cap: cand.cap, quiet: true, wide: true })
    if (k == null) return null
    pool.attr(k, 'data-mode', cfg.mode)
    if (cfg.mode === 'say') pool.attr(k, 'data-faded')
    if (!atMs) lastSpawn = now()
    const p = { k, cand, j, y: ENTER_Y, gone: false, spent: false, mask: cfg.mode === 'say' ? mountMask(pool.el(k), cand.text ?? cand.cap) : null }
    if (p.mask) masks.add(p.mask)
    pills.push(p)
    return p
  }

  function startTurn(t) {
    ti++
    if (ti >= turns.length) { phase = 'done'; listener?.stop(); fx().finished?.(true); return }
    rolling = riding(); pills = []; res = null; lit = new Set(); heardW = new Map(); heardAt = -Infinity; shown = 0; view.forget('say'); boost = false; cap.show('')
    const cur = turn()
    listener?.setPhrases(cur.cands.map(c => ({ key: c.key, words: phraseTokens(c.text) })))
    listener?.reset()
    fx().pre?.({ rep: rep(), show: text => cap.show(text) })
    phase = 'pre'; at = t
  }

  const lineOf = r => (r.ok ? (cfg.mode === 'say' ? `верно, слова ${Math.round(r.ratio * 100)} %${r.clean ? ', чисто' : ', нечисто'}` : 'верно') : r.confusedWith ? `спутал с ${q(turn().cands.find(c => c.key === r.confusedWith)?.text ?? r.confusedWith)}` : `не успел${cfg.mode === 'say' ? `, слова ${Math.round(r.ratio * 100)} %` : ''}`) + (r.late ? ', в последний момент' : '')

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
    log(`[phrases] круг ${cfg.round} ${ROUND_LOG[cfg.mode] ?? cfg.mode}, ход ${t.idx + 1}/${turns.length}: цель ${q(t.target.text)}${cfg.mode === 'say' ? '' : ` кандидаты ${t.cands.map(c => q(c.cap)).join(' | ')}`} итог ${lineOf(res)}${cfg.mode === 'say' ? '' : `; остальные едут: ${rest.length}`}`)
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

  /** «Скажи»: слово фразы услышано — черновик (draft) даёт половину вклада, пока его не подтвердит итог или следующее слово; цель заливки пересчитывается, экран догонит её в tick */
  function heardWord(e) {
    if (stopped || phase !== 'ride' || res || cfg.mode !== 'say' || e?.phraseKey !== turn()?.target.key) return
    lit.add(e.index); quietAt = now()
    if (!e.draft) heardW.set(e.index, true)
    else if (!heardW.has(e.index)) heardW.set(e.index, false)
    for (const [i, full] of heardW) if (!full && i < e.index) heardW.set(i, true)
    const tg = target()
    tg?.mask?.set(heardW) // маска снимается слово за словом: черновик — бледно, подтверждение — целиком
    if (tg && boost) { pool.rate(tg.k, 1); boost = false }
  }

  /** Цель заливки «Скажи»: доля слов фразы (черновое слово — половина), пока недавно был черновик — не меньше подтверждённых слов + FILL_ADVANCE */
  function goal() {
    const n = phraseWords(turn().target.text).length || 1
    let sum = 0, full = 0
    for (const f of heardW.values()) { sum += f ? 1 : 0.5; full += f ? 1 : 0 }
    return Math.min(1, Math.max(sum, now() - heardAt < ADVANCE_MS ? full + FILL_ADVANCE : 0) / n)
  }

  /** «Скажи»: фраза сказана (ratio ≥ PHRASE_OK) — зачёт; слушатель есть только у этого круга */
  function heardPhrase(e) {
    if (stopped || phase !== 'ride' || res || cfg.mode !== 'say') return
    if (e?.phraseKey !== turn().target.key || !(e.ratio >= PHRASE_OK)) return
    const n = phraseWords(turn().target.text).length || 1
    const ratio = Math.min(1, Math.max(e.ratio, lit.size / n))
    resolve('win', { ratio, clean: ratio >= 1 })
  }

  function tick(t) {
    const dt = t - lastT; lastT = t
    for (const p of rolling) if (!p.gone) { p.y = yOf(p); if (p.y >= EXIT_Y) gone(p) } // отыгранные прошлых ходов едут до края
    if (phase === 'next') startTurn(t)
    else if (phase === 'pre' && t - at >= PRE_MIN_MS && !(fx().pitLeft?.() > 0)) { phase = 'ride'; at = t; quietAt = t }
    else if (phase === 'ride' || phase === 'after') {
      if (phase === 'ride') { const c = turn().cands; for (let j = pills.length; j < c.length && t - at >= j * cfg.gap && t - lastSpawn >= cfg.gap; j++) spawn(c[j], j) } // за едущими — не ближе cfg.gap
      for (const p of pills) if (!p.gone) { p.y = yOf(p); if (p.y >= EXIT_Y) gone(p) }
      const tg = target()
      if (phase === 'ride' && cfg.mode === 'say' && tg && !tg.gone && !res) { shown = view.step('say', goal(), dt); pool.paintFill(tg.k, shown) }
      if (phase === 'ride' && cfg.mode === 'say' && tg && !tg.gone) {
        if (held()) quietAt = t
        else if (!boost && t - quietAt > SILENCE_MS) { pool.rate(tg.k, SAY_BOOST); boost = true }
      }
      if (phase === 'ride' && tg && !res && tg.y >= LISTEN_Y_MAX) resolve('fail', cfg.mode === 'say' ? { ratio: lit.size / (phraseWords(turn().target.text).length || 1) } : {})
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
      /** Для тестов и стенда: что сейчас на ленте (spent — отыгранные, едут вниз), fill — заливка «Скажи» на экране, mask — слова под маской «Скажи», listening — есть ли слушатель фраз */
      state: () => ({ phase, turn: ti, mode: cfg.mode, listening: !!listener, pills: live().map(p => ({ key: p.cand.key, y: p.y, right: p.cand.right })), spent: riding().filter(p => p.spent).map(p => ({ key: p.cand.key, y: p.y })), res, fill: shown, mask: target()?.mask?.words() ?? null }),
    },
    tick,
    stop() { stopped = true; caf(frame); timers.forEach(clearTimeout); listener?.stop(); cap.remove(); missMark.remove(); masks.forEach(m => m.remove()); masks.clear() },
  }
}

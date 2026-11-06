// Сцена этапа 2 «Фразы» игры «Встряхни память» для движка пилюль (useWordLanePills: ступень со step.phrases — raceStagesPhrases.js). DOM без React, как wordLaneOrderScene.js: пилюли из пула (wide — широкие,
// по центру одной ленты), часы — из анимаций полёта (pool.y), речь Пита — у директора гонки (fx.pre → useRaceActs → racePhraseVoice.js), ход ждёт, пока Пит договорит (fx.pitLeft).
// Ход: pre (Пит говорит смысл / фразу; без озвучки смысла — подпись над лентой, e.show) → ride (пилюли хода едут одна за другой через cfg.gap) → итог → after (Пит реагирует, хвосты гаснут) → следующий ход.
//  • pick (круг 1 «Пойми» и круг 2 «Узнай»): тап по ленте — по пилюле, которая ближе всего к центру экрана (CENTER_Y); голосом (cfg.voice) — onPhrase слушателя с key кандидата. Верная — зачёт и взлёт целиком (fx.win);
//    чужая — дрожь (missPill), верная подсвечивается (data-hot) и взлетает сама через HOT_MS (fx.miss, confusedWith); верная ушла за край — «не успел» (fx.fail);
//  • say (круг 2 «Скажи» голосом): одна бледная пилюля (data-faded), сегменты по словам (onWord → paintRow), onPhrase с ratio ≥ PHRASE_OK — зачёт («чисто» — все слова), ушла — fail;
//    едет медленно, после SILENCE_MS тишины (Пит не говорит, слов нет) — быстрее в SAY_BOOST раз, услышано слово — снова медленно.
// Итог хода уходит директору в rep.res: { ok, late, confusedWith, ratio, clean }; журнал «[phrases] ход N: цель … кандидаты … итог …». Все ходы — fx.finished.
import { ENTER_Y, EXIT_Y, SPEED, LISTEN_Y_MIN, LISTEN_Y_MAX } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { missPill, snapPill } from '../player/modules/rotate-phone/wordLaneSnap.js'
import { pLog } from '../../shared/lib/debug.js'
import { isLate } from './raceExtraRound.js'
import { phraseTokens, phraseWords, phraseWordKeys } from './racePhraseData.js'
import { phraseListen, pitTalking, PHRASE_OK } from './racePhraseListener.js'
import { LANE } from './raceStagesPhrases.js'

export const CENTER_Y = 50      // тап по ленте берёт пилюлю, чей центр ближе всего к середине экрана
export const PRE_MIN_MS = 250   // после 'pre' — хотя бы столько, чтобы речь Пита успела начаться (pitLeft > 0)
export const AFTER_MS = 600     // после итога хода — пауза до следующего (и пока Пит говорит)
export const HOT_MS = 650       // после ошибки верная пилюля подсвечена столько, потом взлетает сама
export const SHAKE_MS = 420     // чужая пилюля после тапа сначала дрожит, потом гаснет
export const SILENCE_MS = 3000  // «Скажи»: столько тишины — пилюля ускоряется
export const SAY_BOOST = 2

const q = t => `«${t}»`

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
  let ti = -1, phase = 'next', at = now(), pills = [], res = null, lit = new Set(), quietAt = 0, boost = false, frame = 0, stopped = false, timers = []
  const turn = () => turns[ti]
  const live = () => pills.filter(p => !p.gone)
  const yOf = p => pool.y(p.k) ?? ENTER_Y
  const onScreen = p => !p.gone && p.y >= LISTEN_Y_MIN && p.y < LISTEN_Y_MAX
  const target = () => pills.find(p => p.cand.right)
  const rep = () => { const t = turn(); return { idx: t.idx, parts: [], round: cfg.round, mode: cfg.mode, phraseKey: t.target.key, text: t.target.text, ru: t.target.ru, words: phraseWordKeys(t.target), target: t.target, cands: t.cands, res } }

  let listener = null
  if (cfg.voice && listen) {
    try { listener = listen({ phrases: [], onWord: e => heardWord(e), onPhrase: e => heardPhrase(e), onError: e => log(`[phrases] слушатель фраз: ошибка ${e?.message ?? e}; дальше тапом`) }) } catch (e) { log(`[phrases] слушатель фраз не запустился: ${e?.message ?? e}`) }
  }

  const spawn = (cand, j, atMs = 0) => {
    const words = phraseWords(cand.text).length
    const k = pool.take(LANE, { atMs, speed: cfg.speed, cap: cand.cap, quiet: true, wide: true, segs: cfg.mode === 'say' ? words : 0 })
    if (k == null) return null
    if (cfg.mode === 'say') { pool.attr(k, 'data-faded'); pool.paintRow(k, 0) }
    const p = { k, cand, j, y: ENTER_Y, gone: false }
    pills.push(p)
    return p
  }

  function startTurn(t) {
    ti++
    if (ti >= turns.length) { phase = 'done'; listener?.stop(); fx().finished?.(true); return }
    pills = []; res = null; lit = new Set(); boost = false; cap.show('')
    const cur = turn()
    listener?.setPhrases(cur.cands.map(c => ({ key: c.key, words: phraseTokens(c.text) })))
    listener?.reset()
    fx().pre?.({ rep: rep(), show: text => cap.show(text) })
    phase = 'pre'; at = t
  }

  const lineOf = r => (r.ok ? (cfg.mode === 'say' ? `верно, слова ${Math.round(r.ratio * 100)} %${r.clean ? ', чисто' : ', нечисто'}` : 'верно') : r.confusedWith ? `спутал с ${q(turn().cands.find(c => c.key === r.confusedWith)?.text ?? r.confusedWith)}` : `не успел${cfg.mode === 'say' ? `, слова ${Math.round(r.ratio * 100)} %` : ''}`) + (r.late ? ', в последний момент' : '')

  function resolve(kind, extra = {}, keep = null) { // keep — пилюля, которая гаснет позже (чужая дрожит)
    const tg = target()
    res = { ok: kind === 'win', late: kind === 'win' && isLate(tg?.y), confusedWith: null, ratio: cfg.mode === 'say' ? 0 : kind === 'win' ? 1 : 0, clean: kind === 'win', ...extra }
    const t = turn()
    log(`[phrases] ${cfg.round === 2 ? 'круг 2, ' : ''}ход ${t.idx + 1}/${turns.length}: цель ${q(t.target.text)}${cfg.mode === 'say' ? '' : ` кандидаты ${t.cands.map(c => q(c.cap)).join(' | ')}`} итог ${lineOf(res)}`)
    for (const p of live()) if (p !== tg && p !== keep) { pool.fade(p.k); p.gone = true }
    const r = rep()
    if (kind === 'win') {
      pool.attr(tg.k, 'data-lock'); pool.flashLane(LANE); snap(pool.el(tg.k), LANE, { full: true })
      const rect = pool.el(tg.k)?.getBoundingClientRect?.() ?? null
      if (pool.rise(tg.k)) tg.gone = true
      fx().win?.(0, rect, { last: true, count: 1, ...r })
    } else if (kind === 'miss') fx().miss?.({ rep: r })
    else fx().fail?.({ rep: r })
    phase = 'after'; at = now()
  }

  /** Ошибка: чужая пилюля дрожит, верная подсвечивается и сама взлетает */
  function wrong(p) {
    shake(pool.el(p.k))
    let tg = target()
    if (!tg) { tg = spawn(turn().cands.find(c => c.right), -1, ((CENTER_Y - 15 - ENTER_Y) / (SPEED * cfg.speed)) * 1000); if (tg) tg.y = yOf(tg) } // верная ещё не выехала — появляется в зоне чтения
    if (tg) pool.attr(tg.k, 'data-hot')
    resolve('miss', { confusedWith: p.cand.key }, p)
    timers.push(setTimeout(() => { if (!stopped && !p.gone) { pool.fade(p.k); p.gone = true } }, SHAKE_MS))
    if (tg && !tg.gone) timers.push(setTimeout(() => { if (!stopped && pool.rise(tg.k)) tg.gone = true }, HOT_MS))
  }

  const pick = p => { if (p.cand.right) resolve('win'); else wrong(p) }

  function heardWord(e) {
    if (stopped || phase !== 'ride' || res || cfg.mode !== 'say' || e?.phraseKey !== turn()?.target.key) return
    lit.add(e.index); quietAt = now()
    const tg = target(), n = phraseWords(turn().target.text).length || 1
    if (tg) { pool.paintRow(tg.k, lit.size / n); if (boost) { pool.rate(tg.k, 1); boost = false } }
  }

  function heardPhrase(e) {
    if (stopped || phase !== 'ride' || res) return
    if (cfg.mode === 'say') {
      if (e?.phraseKey !== turn().target.key || !(e.ratio >= PHRASE_OK)) return
      const n = phraseWords(turn().target.text).length || 1
      const ratio = Math.min(1, Math.max(e.ratio, lit.size / n))
      const tg = target(); if (tg) pool.paintRow(tg.k, 1)
      resolve('win', { ratio, clean: ratio >= 1 })
      return
    }
    const p = pills.find(x => x.cand.key === e?.phraseKey && !x.gone)
    if (p && (p.cand.right ? p.y < LISTEN_Y_MAX : onScreen(p))) pick(p) // верную можно назвать и пока она въезжает; чужую — только когда её видно
  }

  function tick(t) {
    if (phase === 'next') startTurn(t)
    else if (phase === 'pre' && t - at >= PRE_MIN_MS && !(fx().pitLeft?.() > 0)) { phase = 'ride'; at = t; quietAt = t }
    else if (phase === 'ride' || phase === 'after') {
      if (phase === 'ride') { const c = turn().cands; for (let j = pills.length; j < c.length && t - at >= j * cfg.gap; j++) spawn(c[j], j) }
      for (const p of live()) { p.y = yOf(p); if (p.y >= EXIT_Y) { pool.give(p.k); p.gone = true } }
      const tg = target()
      if (phase === 'ride' && cfg.mode === 'say' && tg && !tg.gone) {
        if (held()) quietAt = t
        else if (!boost && t - quietAt > SILENCE_MS) { pool.rate(tg.k, SAY_BOOST); boost = true }
      }
      if (phase === 'ride' && tg && !res && tg.y >= LISTEN_Y_MAX) resolve('fail', cfg.mode === 'say' ? { ratio: lit.size / (phraseWords(turn().target.text).length || 1) } : {})
      if (phase === 'after' && t - at >= AFTER_MS && !live().length && !(fx().pitLeft?.() > 0)) phase = 'next'
    }
  }

  const loop = () => { if (stopped) return; tick(now()); frame = raf(loop) }
  frame = raf(loop)

  return {
    api: {
      /** Тап по ленте (любая дорожка — вся лента): пилюля ближе всего к центру; «Скажи» тапом не отвечает */
      tap() {
        if (stopped || phase !== 'ride' || res || cfg.mode === 'say') return
        const p = live().filter(onScreen).sort((a, b) => Math.abs(a.y - CENTER_Y) - Math.abs(b.y - CENTER_Y))[0]
        if (p) pick(p)
      },
      /** Для тестов и стенда: что сейчас на ленте */
      state: () => ({ phase, turn: ti, pills: live().map(p => ({ key: p.cand.key, y: p.y, right: p.cand.right })), res }),
    },
    tick,
    stop() { stopped = true; caf(frame); timers.forEach(clearTimeout); listener?.stop(); cap.remove() },
  }
}

import { ENTER_Y, EXIT_Y, SPEED } from './wordLaneTimeline.js'
import { createOrderGame, stepOrder, tapLane, failPrompt, laneDelayOf, maxDelayOf } from './wordLaneOrder.js'
import { snapPill, missPill } from './wordLaneSnap.js'

// Сцена раунда «Порядок» для движка пилюль (useWordLanePills): на каждую подсказку из wordLaneOrder выкатывается по пилюле в каждой дорожке, они едут как весь конвейер (композитор), а тапы по
// дорожкам (api.tap) отвечают заливкой и щелчком верной пилюле, дрожью неверной и кольцом-подсказкой на верной после нескольких ошибок. Не успел — пилюли серые и уходят вниз.
// fx: sayText(текст) — звучит слово пилюли («Различи»), say(parts) — диктор называет подсказку, win(order, rect) — верный тап, miss() — неверный, fail({ order, lost }) — не успел, finished() — раунд закончен.
const HINT_RING_MS = 1600
const VOICE_GLOW_MS = 700 // пилюля светится, пока звучит её слово («Различи»)
const PIT_WAIT_MS = 8000  // «Слушай и лови»: дольше этого заход не ждёт, пока Пит договорит (страховка от зависшей реплики; как MAX_HOLD_MS у ученика)

// «Гонка с Питом», раунд «Слушай и лови» (scene.speak): верное слово отвечают голосом — слушатель (liveRef.seq / misses) сам «тапает» верную дорожку, чужое слово провал подсказки (failPrompt, заход повторяется);
// подписи внутри пилюль — prompt.caps (перевод), при провале на пилюлях проявляются слова prompt.texts; scene.maxTries — сколько раз заход повторится. Слово звучит ДО пилюль: заход не начинается, пока Пит договаривает
// предыдущую реплику (fx.pitLeft, как у пилюль «Разгона»), пилюли выезжают через prompt.lead после начала слова, а голос ученика раньше prompt.voiceFrom (мс от начала захода) не считается.
export function runOrderScene({ pool, scene, fxRef, liveRef = null }) {
  const { prompts, lanes, count } = scene
  const g = createOrderGame({ prompts, lanes, maxTries: scene.maxTries })
  let seenSeq = liveRef?.current?.seq?.length ?? 0, seenMiss = liveRef?.current?.misses ?? 0 // слова до начала раунда не считаем
  const t0 = performance.now()
  const sets = [] // подсказка → { spawnAt, pills: Map(дорожка → номер в пуле), taken: Set(дорожек) }
  const timers = []
  let raf = 0
  const cur = () => sets.at(-1)
  let waited = 0, lastTick = t0

  const handle = events => {
    for (const e of events) {
      if (e.type === 'spawn') {
        const set = { spawnAt: g.spawnAt + maxDelayOf(e.prompt), pills: new Map(), taken: new Set() } // spawnAt — когда выкатилась последняя пилюля
        for (const lane of e.prompt.slots ?? Array.from({ length: count }, (_, k) => k)) { // «Различи»: пилюли только в дорожках со словами
          const k = pool.take(lane, { atMs: performance.now() - t0 - g.spawnAt - laneDelayOf(e.prompt, lane), cap: e.prompt.caps?.[lane] }) // «Различи»: пилюли выкатываются по очереди (пока не выкатилась — ждёт за краем)
          if (k == null) continue
          set.pills.set(lane, k)
        }
        sets.push(set)
      } else if (e.type === 'say') fxRef.current?.say?.(e.parts)
      else if (e.type === 'word') { const k = cur().pills.get(e.lane); if (k != null) { pool.attr(k, 'data-voice'); timers.push(setTimeout(() => pool.attr(k, 'data-voice', false), VOICE_GLOW_MS)) }; fxRef.current?.sayText?.(e.text) } // «Различи»: слово пилюли звучит (она светится)
      else if (e.type === 'fail') {
        for (const [lane, k] of cur().pills) if (!cur().taken.has(lane)) { pool.attr(k, 'data-fail'); pool.hint(k, '0', null); if (e.prompt.caps) { pool.cap(k, e.prompt.texts[lane]); pool.attr(k, 'data-reveal'); pool.linger(k); cur().pills.delete(lane) } }
        fxRef.current?.fail?.({ order: true, lost: e.lost })
      } else if (e.type === 'done') fxRef.current?.finished?.()
    }
  }

  const heard = t => { // голос ученика (раунд «Слушай и лови»): слово сказано — тап по верной дорожке; чужое слово — провал подсказки. Пока Пит не назвал слово, голос не считается
    const live = liveRef?.current
    if (!scene.speak || !live) return
    if (live.seq.length < seenSeq) seenSeq = live.seq.length
    if (live.misses < seenMiss) seenMiss = live.misses
    const fresh = live.seq.slice(seenSeq) // услышанные цели слушателя: 0 — верное слово; дальше идут слова словаря (чужие слова, двойники) — они не ответ
    const word = fresh.includes(0), wrong = !word && (fresh.length > 0 || live.misses > seenMiss)
    seenSeq = live.seq.length; seenMiss = live.misses
    if (!g.said || g.state !== 'fly' || g.finished) return
    if (t < g.spawnAt + (g.prompts[g.i].voiceFrom ?? 0)) return // слово Пита ещё звучит, пилюль нет: речь (эхо, торопливый ответ) не считается — слова выше уже стёрты из очереди
    if (word) api.tap(g.prompts[g.i].answer[0])
    else if (wrong) handle(failPrompt(g, t))
  }
  const tick = now => {
    const t = now - t0
    if (scene.speak && g.state === 'gap' && waited < PIT_WAIT_MS && (fxRef.current?.pitLeft?.() ?? 0) > 0) { waited += now - lastTick; g.nextAt = Math.max(g.nextAt, t + 50) } // Пит ещё говорит — заход ждёт
    lastTick = now
    handle(stepOrder(g, t))
    heard(t)
    for (const set of [...sets]) { // ушла за нижний край — пилюли в пул
      if (ENTER_Y + (SPEED * (t - set.spawnAt)) / 1000 < EXIT_Y) continue
      set.pills.forEach(k => { pool.give(k) })
      sets.splice(sets.indexOf(set), 1)
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const api = {
    tap(lane) {
      const set = cur()
      for (const e of tapLane(g, lane, performance.now() - t0)) {
        const k = set?.pills.get(e.lane)
        if (e.type === 'ok') {
          set.taken.add(e.lane)
          if (k != null) { pool.attr(k, 'data-lock'); pool.paintFill(k, 1); snapPill(pool.el(k), e.lane) }
          pool.flashLane?.(e.lane)
          fxRef.current?.win?.(e.step - 1, k != null ? pool.el(k).getBoundingClientRect() : null)
        } else if (e.type === 'wrong') {
          if (k != null) missPill(pool.el(k))
          if (scene.speak) { handle(failPrompt(g, performance.now() - t0)); continue } // «Слушай и лови»: не та дорожка — провал, заход повторится
          const want = set?.pills.get(e.expected)
          if (e.hint && want != null) { pool.attr(want, 'data-hint'); timers.push(setTimeout(() => pool.attr(want, 'data-hint', false), HINT_RING_MS)) }
          fxRef.current?.miss?.()
        } else if (e.type === 'next') {
          set.pills.forEach((kk, ln) => { if (!set.taken.has(ln)) { pool.give(kk); set.pills.delete(ln) } }) // раунд пошёл дальше — лишние пилюли подсказки убираем
        } else if (e.type === 'done') fxRef.current?.finished?.()
      }
    },
  }
  return { api, stop() { cancelAnimationFrame(raf); timers.forEach(clearTimeout) } }
}

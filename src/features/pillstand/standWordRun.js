// Вертикальная пилюля слова на стенде пилюль (CONCEPT_PILLSTAND.md): НАСТОЯЩАЯ логика ученика игры — createStudentGame / stepStudent (wordLaneStudent.js: заливка голосом до FILL_CAP, «аванс» по черновику,
// зачёт по seq слушателя, промах по misses), ворота голоса (wordLaneVoiceGate.js), плавный экран (wordLaneFillView.js), щелчок и дрожь (wordLaneSnap.js), слушатель слов игры (wordLaneListen.js) с
// английской или русской моделью — как проходы A / B «Пинг-понга». Отличие одно: повтор стоит на месте (rep.y0 и почти нулевая скорость — тот же приём, что у «Вершины», raceStagesClimb.js) и пилюля
// не взлетает (standPool.js). Каждое событие движка, слушателя и кадр заливки — в трассу стенда. → { stop(), api: { state() } }.
import { createStudentGame, stepStudent, finOf } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { createVoiceGate } from '../player/modules/rotate-phone/wordLaneVoiceGate.js'
import { createFillView } from '../player/modules/rotate-phone/wordLaneFillView.js'
import { snapPill, missPill } from '../player/modules/rotate-phone/wordLaneSnap.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'
import { sensitiveLevel } from '../player/modules/rotate-phone/wordLaneConfig.js'
import { createRmsLevel } from '../../shared/lib/vosk/sayVoskLevel.js'
import { getGameMic } from '../../shared/lib/gameMic.js'
import { guardStream } from '../../shared/lib/gameMicGesture.js'
import { tapListen } from './standVoiceTap.js'

export const STILL_SPEED = 1e-6 // пилюля «стоит»: за 10 минут сдвиг ≈ 0,016 % экрана
export const LANE = 1
export const CONFIRM_MS = 1500   // как у движка игры (useWordLanePills.CONFIRM_MS): речь подтверждена, пока распознаватель что-то слышал не дольше столько мс назад

/** Ступень ученика из одной цели стенда: говорят target.say, на пилюле target.shown (как rep.cap «Пинг-понга») */
export const standStep = (target, y) => ({
  id: `stand-${target.n}`, kind: 'student', labels: [], active: [LANE], parts: [0], text: target.say, chunks: [target.say], chunkMs: [estChunkMs(target.say)],
  reps: [{ parts: [0], lane: LANE, speed: STILL_SPEED, y0: y, cap: target.shown }], extra: [], maxWords: 2, maxTries: 1, quiet: true, ...(target.lang === 'ru' ? { lang: 'ru' } : {}),
})

export function runStandWord({ pool, target, y, trace, probe = {}, onResult = () => {}, listen = createWordListener, getStream = guardStream(getGameMic), now = () => performance.now(), raf = f => requestAnimationFrame(f), caf = id => cancelAnimationFrame(id) }) {
  const step = standStep(target, y)
  const { texts } = stepTargets(step, step.chunks)
  const g = createStudentGame({ step, chunks: step.chunks, estMs: () => step.chunkMs[0], maxTries: 1 })
  const gate = createVoiceGate(), view = createFillView(), rms = createRmsLevel({ fromRms: sensitiveLevel })
  const held = new Map()
  let st = { status: 'idle', seq: [], misses: 0, tail: null, heardAt: 0, heard: '' }, sig = '', stopped = false, frame = 0, lastNow = now(), done = false, lastFill = ''
  const t0 = now()
  const listener = listen({
    targets: texts, expected: 1, maxWords: step.maxWords, lang: target.lang, earRule: true, getStream, isHeld: () => false, level: rms, listen: tapListen(trace), // earRule — честный зачёт слова, как в «Пинг-понге» (wordEarRule.js)
    onDebug: (kind, data) => { if (kind !== 'level' && kind !== 'partial-same') trace.push('wl', { kind, ...(data && typeof data === 'object' ? data : { v: data }) }) },
    onChange: s => {
      st = s
      const key = `${s.status}|${s.seq.join(',')}|${s.misses}|${s.heard}|${s.tail?.tokens ?? ''}`
      if (key !== sig) { sig = key; trace.push('listen', { status: s.status, seq: s.seq, misses: s.misses, heard: s.heard, tail: s.tail ?? null }) }
    },
  })
  trace.push('target-run', { mode: 'word', targets: texts, lang: target.lang })
  listener.start()

  const handle = (e, t) => {
    trace.push('pill', { type: e.type, rep: e.rep?.idx ?? null, ...(e.type === 'claim' || e.type === 'win' ? { text: target.say } : {}), ...(e.type === 'claim' ? { ms: e.ms } : {}), ...(e.type === 'miss' ? { wrong: !!e.wrong } : {}) })
    if (e.type === 'spawn') for (const p of e.pills) { const k = pool.take(p.lane, { cap: e.rep.cap, quiet: true }); if (k != null) held.set(p.id, k) }
    else if (e.type === 'piece-ok' || e.type === 'claim') (e.type === 'claim' ? e.rep.pills : [e.pill]).forEach(p => { const k = held.get(p.id); if (k != null) pool.attr(k, 'data-lock') })
    else if (e.type === 'snap') { const k = held.get(e.pill.id); if (k != null) { pool.paintFill(k, 1); snapPill(pool.el(k), e.pill.lane, { full: e.full }) } }
    else if (e.type === 'win') { gate.mute(now()); if (!done) { done = true; onResult({ ok: true, ratio: 1, clean: (st.misses ?? 0) === 0, at: t, heard: st.heard }) } }
    else if (e.type === 'miss') { const k = e.rep ? held.get(e.rep.pills.find(p => p.state === 'fly')?.id) : null; if (k != null) missPill(pool.el(k)) }
    else if (e.type === 'fail' && !done) { done = true; onResult({ ok: false, ratio: 0, clean: false, at: t }) }
  }
  const tick = () => {
    if (stopped) return
    const n = now(), t = n - t0, dt = n - lastNow
    lastNow = n
    const level = gate.step(rms.read(n), n, dt).level
    const heardAt = Math.max(st.heardAt ?? 0, listener.heardAt?.() ?? 0)
    const confirmed = Date.now() - heardAt < CONFIRM_MS
    const heardT = heardAt ? t - (Date.now() - heardAt) : -Infinity
    for (const e of stepStudent(g, t, { level, seq: st.seq, misses: st.misses, confirmed, tail: st.tail ?? null, heardT })) handle(e, t)
    for (const p of g.pills) {
      const k = held.get(p.id)
      if (k == null) continue
      const shown = view.step(p.id, p.p, dt, finOf(p))
      pool.paintFill(k, shown, p.state === 'lock')
      Object.assign(probe, { k, el: pool.el(k), goal: p.p, shown, level })
      const key = `${p.p.toFixed(4)}|${shown.toFixed(4)}`
      if (key !== lastFill) { lastFill = key; trace.push('fill', { goal: +p.p.toFixed(4), shown: +shown.toFixed(4), level: +level.toFixed(3), confirmed }) }
    }
    frame = raf(tick)
  }
  frame = raf(tick)
  return {
    stop() { stopped = true; caf(frame); try { listener.dispose() } catch { /* уже свободен */ } pool.giveAll() },
    api: { state: () => ({ phase: done ? 'done' : 'ride', seq: st.seq, misses: st.misses, status: st.status, heard: st.heard, fill: probe.shown ?? 0 }) },
  }
}

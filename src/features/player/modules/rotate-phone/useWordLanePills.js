import { useEffect, useRef } from 'react'
import { TRAVEL_MS, pillFill } from './wordLaneTimeline.js'
import { createPool } from './wordLanePool.js'
import { createStudentGame, stepStudent, isClaimable } from './wordLaneStudent.js'
import { createVoiceGate } from './wordLaneVoiceGate.js'
import { snapPill, missPill, SNAP_LEAD_MS } from './wordLaneSnap.js'
import { runOrderScene } from './wordLaneOrderScene.js'

// Движок пилюль игры «Повтори за диктором». ДВИЖЕНИЕ пилюль ведёт композитор (wordLaneMotion.js: одна линейная WAAPI-анимация на пилюлю — скорость конвейера постоянна), поэтому лаги основного
// потока на смартфонах (Vosk, React, щелчок с искрами) на ход не влияют. JS каждый кадр считает только логику и заливку. Пилюли — из пула (wordLanePool.js): повторов и кусков в ступени до девяти.
// Что делает движок, определяет сцена (scene), которую меняет сценарий игры (useWordLaneFlow) на каждой ступени:
//  idle    — ничего не показано, пилюли в пуле;
//  dictor  — { plan (wordLaneDictor.planDictor) }: каждой пилюле плана — полёт, чтобы к началу её слова она была полностью открыта; заливка в такт речи (pillFill по кривой громкости клипа);
//            слово кончилось — щелчок и «огонёк» повтора; рот кота — по plan.mouth. Звук включает сценарий (по тем же временам);
//  student — { step, chunks, estMs, curves }: конвейер ученика (wordLaneStudent.js) — повторы выкатываются сами, события (spawn / claim / snap / win / fail / miss / done) → пилюли и реакции fx.
//            заливка идёт по очереди кусков и только на речь, подтверждённую распознаванием; «тень» слова внутри пилюли — лишь после неверно сказанного;
//  order   — { prompts, lanes, count }: раунд «Порядок» на время (wordLaneOrderScene.js) — на подсказку диктора выкатываются пилюли во всех дорожках, sceneApi.current.tap(lane) — тап ученика (у сцены student — nextTarget() для ручного режима).
// fx — реакции игры: win(order, rect) — пилюля ученика принята (XP, нота, кот), miss() — чужое слово, fail(info) — не успел, mouth(level, code) — рот кота (code — форма по букве, у диктора), say(parts) — диктор называет подсказку (раунд «Порядок»), finished(locked) — ступень закончена.
const setApi = (ref, value) => { if (ref) ref.current = value } // ref приходит пропсом — меняем его вне компонента

export const GHOST_MS = 3000    // сколько «тень» слова держится после неверно сказанного
export const CONFIRM_MS = 1500  // речь считается подтверждённой, пока распознаватель что-то слышал не дольше столько мс назад
export const CAT_LEAD_MS = 700  // кот выскакивает за столько до начала голоса диктора (пружина 0,55 с)
export const CAT_TAIL_MS = 500  // и торчит ещё столько после его конца

export function useWordLanePills(rootRef, { scene, levels, fx, live, sceneApi }) {
  const fxRef = useRef(fx)
  const liveRef = useRef(live)
  useEffect(() => { fxRef.current = fx; liveRef.current = live })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const pool = createPool(root)
    const dots = [...root.querySelectorAll('[data-dot]')]
    const setDots = n => dots.forEach((d, i) => { d.classList.remove('wlDot--on'); d.style.display = i < n ? '' : 'none' })
    const light = i => dots[i]?.classList.add('wlDot--on')
    const kind = scene?.kind ?? 'idle'
    if (kind === 'idle') { setDots(3); return () => pool.giveAll() }

    // ---------- диктор ----------
    if (kind === 'dictor') {
      const { plan } = scene
      setDots(plan.reps.length)
      const t0 = scene.at
      const held = plan.pills.map(p => ({ p, k: pool.take(p.lane, { atMs: performance.now() - t0 - (p.at - TRAVEL_MS), curve: p.curve }), snapped: false }))
      held.forEach(h => { if (h.k != null) pool.attr(h.k, 'data-lock') }) // у диктора заливка всегда «настоящая»
      let raf = 0
      const peeked = new Set()
      const tick = () => {
        const t = performance.now() - t0
        for (const r of plan.reps) { // кот выскакивает ЗАРАНЕЕ — к началу голоса пружина уже отыграла и видно, как открывается рот
          if (!peeked.has(r.idx) && t >= r.at - CAT_LEAD_MS) { peeked.add(r.idx); fxRef.current?.peek?.(Math.max(0, r.at - t) + r.ms + CAT_TAIL_MS) }
        }
        for (const h of held) {
          if (h.k == null) continue
          pool.paintFill(h.k, pillFill(t, h.p.at, h.p.ms, h.p.curve))
          if (!h.snapped && t >= h.p.at + h.p.ms - SNAP_LEAD_MS) {
            h.snapped = true; snapPill(pool.el(h.k), h.p.lane)
            if (h.p.chunk === plan.reps[h.p.rep].parts.at(-1)) light(h.p.rep) // повтор договорён — «огонёк»
          }
        }
        fxRef.current?.mouth?.(plan.mouth(t), plan.mouthCode(t)) // рот: громкость решает, звучит ли слово, буквы — какой формы рот (на «о» круглый)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => { cancelAnimationFrame(raf); pool.giveAll() }
    }

    // ---------- ученик ----------
    if (kind === 'student') {
      const { step, chunks, estMs, curves } = scene
      setDots(step.reps.length)
      const g = createStudentGame({ step, chunks, estMs })
      const held = new Map() // id пилюли → номер в пуле
      g.seenSeq = liveRef.current.seq.length; g.seenMisses = liveRef.current.misses // слушатель стартует ещё в «твоей очереди» — слова до начала конвейера не считаем
      let raw = 0
      let level = 0                      // громкость ПОСЛЕ ворот: 0, пока голоса ученика нет (шум и эхо ноты не в счёт)
      let raf = 0
      let lastNow = performance.now()
      let claimedReps = 0
      const ghostUntil = new Map() // номер повтора → до какого момента показывать «тень» слова (только после неверно сказанного)
      const gate = createVoiceGate()
      const t0 = performance.now()
      const off = levels?.subscribe(l => { raw = l })
      const blind = !step.labels.length
      setApi(sceneApi, { nextTarget: () => (g.reps.filter(isClaimable)[0] ?? g.reps.find(r => r.state === 'fly') ?? null)?.target ?? null }) // ручной режим: тап по микрофону = «сказал» ближайший повтор
      const handle = e => {
        if (e.type === 'spawn') {
          fxRef.current?.peek?.(2600) // повтор выкатился — сейчас будет говорить ученик: кот уже на месте
          for (const p of e.pills) {
            const k = pool.take(p.lane, { atMs: performance.now() - t0 - p.spawnAt, curve: blind ? null : curves?.[p.chunk] ?? null })
            if (k != null) held.set(p.id, k)
          }
        } else if (e.type === 'claim') {
          e.rep.pills.forEach(p => { const k = held.get(p.id); if (k != null) pool.attr(k, 'data-lock') })
          light(claimedReps++)
        } else if (e.type === 'snap') { const k = held.get(e.pill.id); if (k != null) snapPill(pool.el(k), e.pill.lane) } // отклик — в момент, когда слово принято
        else if (e.type === 'win') { gate.mute(performance.now()); const k = held.get(e.pill.id); fxRef.current?.win?.(e.order, k != null ? pool.el(k).getBoundingClientRect() : null) } // нота-награда: микрофон слышит динамик — голосом это не считаем
        else if (e.type === 'fail') { e.pills.forEach(p => { const k = held.get(p.id); if (k != null) { pool.attr(k, 'data-fail'); pool.hint(k, '0', null) } }); fxRef.current?.fail?.(e) }
        else if (e.type === 'miss') {
          const k = e.rep ? held.get(e.rep.pills[0]?.id) : null
          if (k != null) missPill(pool.el(k))
          if (e.rep) ghostUntil.set(e.rep.idx, performance.now() + GHOST_MS) // сказано не то — показываем «тень» слова: как оно звучит и сколько длится
          fxRef.current?.miss?.(e)
        }
        else if (e.type === 'done') fxRef.current?.finished?.(e.locked)
      }
      const tick = now => {
        const t = now - t0
        level = gate.step(raw, now, now - lastNow).level; lastNow = now
        const seq = liveRef.current.seq
        const sig = liveRef.current.signal?.() ?? {}
        const confirmed = Date.now() - (sig.heardAt ?? 0) < CONFIRM_MS // распознаватель недавно что-то услышал: речь настоящая, а не шум или эхо
        for (const e of stepStudent(g, t, { level, seq, misses: liveRef.current.misses, confirmed, tail: sig.tail ?? null })) handle(e)
        const now2 = performance.now()
        for (const [id, k] of held) {
          const p = g.pills.find(x => x.id === id)
          if (!p) { pool.give(k); held.delete(id); continue }   // ушла за нижний край
          pool.paintFill(k, p.p)
          // «Тень» слова — только после неверно сказанного (и ненадолго): пока ученик говорит верно или молчит, внутри пилюли ничего лишнего
          pool.hint(k, now2 < (ghostUntil.get(p.rep) ?? 0) && g.reps[p.rep].state === 'fly' ? '0.6' : '0', null)
        }
        fxRef.current?.mouth?.(level)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => { cancelAnimationFrame(raf); off?.(); pool.giveAll(); setApi(sceneApi, null) }
    }

    // ---------- порядок ----------
    if (kind === 'order') {
      setDots(0)
      const run = runOrderScene({ pool, scene, fxRef })
      setApi(sceneApi, run.api)
      return () => { run.stop(); setApi(sceneApi, null); pool.giveAll() }
    }
    return undefined
  }, [scene, levels, rootRef, sceneApi])
}

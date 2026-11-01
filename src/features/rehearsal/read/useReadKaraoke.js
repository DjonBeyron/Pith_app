import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { karaokePlan, karaokeFrame, chase, heardWords, startTime, SHRINK_MS, SPEAKING_MS } from './readKaraoke.js'

// Движение читки-караоке (CONCEPT_REHEARSAL.md §3, акт «Читка»): один цикл на стадию читки пишет кадр (readKaraoke.karaokeFrame) прямо в DOM, минуя React: заливка слов — clip-path у слоя .rkFill, курсор — transform
// одного узла .rkCursor (двигается translate3d, «|» и кружок меняют scale), без filter и без перерисовок. Режимы (mode):
//  • 'pit'     — читает Пит: время кадра = performance.now() − at (старт стадии), тайминги — stage.metro;
//  • 'turn'    — «Теперь твоя очередь»: слова остаются залитыми, плавно становятся белыми (CSS-переход на классе .rkHead--off), курсора нет;
//  • 'student' — читает игрок: время — «догоняющий» счётчик (readKaraoke.chase): сколько слов сказано, берётся из слушателя (signal().tail.tokens — недосказанная цель, live.seq — готовая), а идёт ли речь — по heardAt;
//  • иначе     — подписи белые, курсора нет.
// lite (слабое устройство, reduced-motion): курсора нет, цикл — 8 раз в секунду, слово заливается целиком, когда началось. Цикл не живёт после конца читки Пита (последний кадр записан) и не создаёт ни слушателей, ни таймеров снаружи.
export const LITE_TICK_MS = 120

const reducedMotion = () => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false } }

/** Узлы и размеры слов внутри контейнера подписей (.wlHeads): в порядке фразы */
export function measure(box) {
  const els = Array.from(box.querySelectorAll('.rkWord'))
  return { fills: els.map(e => e.querySelector('.rkFill')), geo: els.map(e => ({ l: e.offsetLeft, t: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight })) }
}

/** Кадр → DOM: заливка слов и курсор */
export function paint(frame, m, cursor, lite, last) {
  frame.fills.forEach((p, i) => {
    const v = lite ? (p > 0 ? 1 : 0) : Math.round(p * 1000) / 1000
    if (last.fills[i] === v || !m.fills[i]) return
    last.fills[i] = v
    m.fills[i].style.clipPath = `inset(0 ${Math.round((1 - v) * 1000) / 10}% 0 0)`
  })
  const c = lite ? null : frame.cursor
  if (!cursor) return
  const bar = cursor.firstChild, dot = cursor.lastChild
  if (!c || !m.geo[c.word]) { if (last.cur) { last.cur = false; bar.style.transform = 'scaleY(0)'; dot.style.transform = 'scale(0)' } return }
  const a = m.geo[c.word], b = c.next != null ? m.geo[c.next] : null
  const x = a.l + c.f * a.w + (b ? (b.l + c.nf * b.w - (a.l + c.f * a.w)) * c.q : 0)
  const y = a.t + (b ? (b.t - a.t) * c.q : 0)
  last.cur = true
  cursor.style.setProperty('--rk-h', `${a.h}px`)
  cursor.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
  bar.style.transform = `scaleY(${c.bar.toFixed(3)})`
  dot.style.transform = `scale(${c.dot.toFixed(3)})`
}

/**
 * cursor — ref на узел .rkCursor (он же даёт контейнер подписей — parentElement); mode — см. выше; metro — stage.metro; chunks — тексты кусков; at — старт стадии (performance.now());
 * live — f.live ({ seq, signal() }), ready — слушатель этой ступени уже отдал данные (f.lid === id ступени); textKey — меняется, когда сменились подписи (нужно перемерить слова)
 */
export function useReadKaraoke({ cursor, mode, metro, chunks, at, live, ready, textKey, lite }) {
  const plan = useMemo(() => karaokePlan(metro, chunks), [metro, chunks])
  const src = useRef({ live, ready })
  useEffect(() => { src.current = { live, ready } }) // свежие данные слушателя для цикла (читаются в кадре, не при отрисовке)
  const small = lite || reducedMotion()
  useLayoutEffect(() => {
    const box = cursor.current?.parentElement
    if (!box) return undefined
    let m = measure(box)
    const last = { fills: [], cur: false }
    const onResize = () => { m = measure(box) } // повернули экран / сменился размер шрифта: замеры слов заново
    window.addEventListener('resize', onResize)
    const off = () => window.removeEventListener('resize', onResize)
    if (mode === 'turn') { paint({ fills: m.fills.map(() => 1), cursor: null }, m, cursor.current, small, last); return off } // на стадии «твоя очередь» тайминга нет: слова остаются залитыми и белеют
    if (!plan.words.length || !['pit', 'student'].includes(mode)) { paint({ fills: m.fills.map(() => 0), cursor: null }, m, cursor.current, small, last); return off }
    let raf = 0, timer = 0, tv = startTime(plan), prev = performance.now(), dead = false
    const tick = () => {
      const now = performance.now()
      let t
      if (mode === 'pit') t = now - at
      else {
        const { live: lv, ready: ok } = src.current
        const sg = ok ? lv?.signal?.() : null
        const heard = heardWords(plan, { tokens: sg?.tail?.tokens ?? 0, done: ok && (lv?.seq?.length ?? 0) > 0 })
        tv = chase(plan, tv, now - prev, { heard, speaking: !!sg && Date.now() - (sg.heardAt ?? 0) < SPEAKING_MS })
        t = tv
      }
      prev = now
      paint(karaokeFrame(plan, t), m, cursor.current, small, last)
      if (dead || (mode === 'pit' && t > plan.end + SHRINK_MS + 40)) return // читка Пита закончилась: последний кадр записан
      if (small) timer = setTimeout(tick, LITE_TICK_MS)
      else raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { dead = true; cancelAnimationFrame(raf); clearTimeout(timer); off() }
    // textKey: сменились подписи — слова другие, замеры заново
  }, [cursor, mode, plan, at, small, textKey])
}

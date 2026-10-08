import { useLayoutEffect, useRef } from 'react'
import { EXPLODE_MARGIN, drawFloat, drawExplode, launchBubbles, shiftBubbles } from './phraseBubbleDraw.js'
import { MARGIN_X, MARGIN_Y } from './phraseBubbleConsts.js'
import { explodedRegions } from './phraseBubbleRegions.js'
import { EXPLODE_MS } from './phraseBubbleConsts.js'
import { thinForLaunch } from './phraseBubbleFlight.js'
import { noteParticles } from './spoilerStats.js'

const EXPLODE_SAFETY_MS = EXPLODE_MS * 2 // один взрыв длится EXPLODE_MS — с двойным запасом
const SAFETY_PER_REGION_MS = EXPLODE_MS  // облачка взрываются по очереди (CatchStripPhrase; шаг меньше EXPLODE_MS) — запас на каждое

// Взрыв шариков на том же холсте (вынесено из PhraseBubbleAnimated.jsx). Запускается, когда exploding стало true:
// первый кадр — до показа, в том же тике открываем текст (setUnlocked + onUnlock).
// explode — команда на взрыв, её можно менять по ходу (читается на каждом кадре): true — взрывается всё сразу
// (тап, прежнее поведение); число n — взорваны первые n облачков (regions); массив — индексы взорванных облачков.
// Облачка, до которых очередь не дошла, продолжают плавать на этом же холсте; каждое взрывается от своего центра.
// Без regions (сплошная масса) всё взрывается сразу, от центра холста. Закончили — setRevealed(true) (холст убирается)
export function usePhraseBubbleExplode({
  exploding, explode, wrapRef, canvasRef, bubblesRef, sizeRef, setUnlocked, setRevealed, onUnlock,
}) {
  const explodeRef = useRef(explode)
  const unlockRef = useRef(onUnlock)
  const rafRef = useRef(0)
  // Layout-эффект, объявленный раньше эффекта взрыва: к его первому кадру команда уже свежая (passive-эффект опоздал бы)
  useLayoutEffect(() => { explodeRef.current = explode; unlockRef.current = onUnlock })

  useLayoutEffect(() => {
    if (!exploding) return
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const rect = wrap.getBoundingClientRect()
    const dpr = sizeRef.current.dpr || 1
    // Запас пошире (EXPLODE_MARGIN вместо MARGIN_X/Y), иначе шарикам некуда лететь
    const w = rect.width + EXPLODE_MARGIN * 2
    const h = rect.height + EXPLODE_MARGIN * 2
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    canvas.style.left = -EXPLODE_MARGIN + 'px'
    canvas.style.top = -EXPLODE_MARGIN + 'px'
    const bubbles = bubblesRef.current
    shiftBubbles(bubbles, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)

    // Группы запуска: облачко = группа; сплошная масса = одна группа на весь холст
    const byRegion = bubbles.length > 0 && bubbles[0].region != null
    const groups = []
    for (const b of bubbles) (groups[byRegion ? b.region : 0] ??= []).push(b)
    const pending = new Set(groups.keys())
    for (let g = 0; g < groups.length; g++) if (!groups[g]) pending.delete(g)
    const flying = []
    let floating = bubbles
    const launch = set => {
      let any = false
      for (const g of [...pending]) {
        if (!set.has(g) && byRegion) continue
        const list = groups[g]
        // Частиц в воздухе сразу не больше MAX_PARTICLES на весь холст: лишние из облачка пропадают в момент взрыва
        // (flying = true — из плавающих выбыли, но в список полёта не попали); считаем только живых
        const alive = flying.reduce((n, b) => (b.t < EXPLODE_MS ? n + 1 : n), 0)
        const fly = byRegion ? thinForLaunch(list, alive) : list // сплошная масса ленты (тап) — как раньше, без прореживания
        for (const b of list) b.flying = true
        if (byRegion) {
          const xs = list.map(b => b.ax), ys = list.map(b => b.ay)
          launchBubbles(fly, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2)
        } else {
          launchBubbles(fly, w / 2, h / 2)
        }
        noteParticles(alive + fly.length)
        flying.push(...fly)
        pending.delete(g)
        any = true
      }
      if (any) floating = bubbles.filter(b => !b.flying)
    }

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const count = groups.length
    launch(explodedRegions(explodeRef.current, count))
    drawFloat(ctx, floating, 0)
    drawExplode(ctx, flying, 0, w, h)
    setUnlocked(true)
    unlockRef.current?.()

    let last = performance.now()
    function frame(now) {
      // Время кадра rAF бывает чуть раньше performance.now() из эффекта — dt < 0 давал NaN в альфе
      // шарика и «Cannot read properties of undefined (reading 'push')» в drawExplode
      const dt = Math.max(0, Math.min(32, now - last))
      last = now
      if (pending.size) launch(explodedRegions(explodeRef.current, count))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (floating.length && pending.size) drawFloat(ctx, floating, dt)
      if (drawExplode(ctx, flying, dt, w, h) && !pending.size) { setRevealed(true); return }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    // Страховка: взрыв длится ~0.75с (+ очередь облачков); если кадры встали (фон, троттлинг),
    // холст всё равно убираем — иначе он висел бы поверх строки перевода
    const safety = setTimeout(() => setRevealed(true), EXPLODE_SAFETY_MS + SAFETY_PER_REGION_MS * count)
    return () => { cancelAnimationFrame(rafRef.current); clearTimeout(safety) }
    // setUnlocked/setRevealed/refs — стабильны; эффект запускается один раз на взрыв
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploding])
}

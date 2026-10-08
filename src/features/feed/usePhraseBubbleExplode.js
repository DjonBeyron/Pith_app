import { useLayoutEffect, useRef } from 'react'
import { EXPLODE_MARGIN, drawExplode, launchBubbles, startBubbles, shiftBubbles } from './phraseBubbleDraw.js'
import { MARGIN_X, MARGIN_Y, EXPLODE_MS } from './phraseBubbleConsts.js'
import { explodedRegions } from './phraseBubbleRegions.js'
import { thinForLaunch } from './phraseBubbleFlight.js'
import { groupByRegion, prepareExplosion, buildSprites, drawSprites } from './phraseBubbleWarm.js'
import { noteParticles } from './spoilerStats.js'

const EXPLODE_SAFETY_MS = EXPLODE_MS * 2 // один взрыв длится EXPLODE_MS — с двойным запасом
const SAFETY_PER_REGION_MS = EXPLODE_MS  // облачка взрываются по очереди (CatchStripPhrase; шаг меньше EXPLODE_MS) — запас на каждое

// Размер холста под взрыв. Размер/позицию трогаем, только если они отличаются: присваивание canvas.width (даже тем же
// числом) очищает и переразмещает backing store — это и был рывок первого кадра взрыва
function fitExplodeCanvas(canvas, w, h, dpr) {
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
  if (canvas.width !== pw) canvas.width = pw
  if (canvas.height !== ph) canvas.height = ph
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'
  canvas.style.left = -EXPLODE_MARGIN + 'px'
  canvas.style.top = -EXPLODE_MARGIN + 'px'
}

// Убрать из списка полёта догоревшие частицы (на месте): кадр не ходит по мёртвым, а «сколько в воздухе» — это длина списка
function dropDead(list) {
  let n = 0
  for (let i = 0; i < list.length; i++) if (list[i].t < EXPLODE_MS) list[n++] = list[i]
  list.length = n
}

// Взрыв шариков на том же холсте (вынесено из PhraseBubbleAnimated.jsx). Запускается, когда exploding стало true:
// первый кадр — до показа, в том же тике открываем текст (setUnlocked + onUnlock).
// explode — команда на взрыв, её можно менять по ходу (читается на каждом кадре): true — взрывается всё сразу
// (тап, прежнее поведение); число n — взорваны первые n облачков (regions); массив — индексы взорванных облачков.
// Облачка, до которых очередь не дошла, висят на этом же холсте статичными спрайтами (phraseBubbleWarm.js; дрейф на время
// взрыва замирает — перерисовывать ~1400 дуг на 60 к/с ради него не нужно); каждое взрывается от своего центра.
// Облачка по словам: холст уже с запасом EXPLODE_MARGIN (PhraseBubbleAnimated), скорости частиц подготовлены в простое —
// на старте облачка остаётся startBubbles. Без regions (сплошная масса) холст на взрыве расширяется до EXPLODE_MARGIN, всё
// взрывается сразу от центра. Закончили — setRevealed(true) (холст убирается)
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
    const bubbles = bubblesRef.current
    const byRegion = bubbles.length > 0 && bubbles[0].region != null
    const size = sizeRef.current
    const dpr = size.dpr || 1
    let w = size.w, h = size.h
    if (!(byRegion && size.px === EXPLODE_MARGIN)) {
      // Запас пошире (EXPLODE_MARGIN вместо MARGIN_X/Y), иначе шарикам некуда лететь
      const rect = wrap.getBoundingClientRect()
      w = rect.width + EXPLODE_MARGIN * 2
      h = rect.height + EXPLODE_MARGIN * 2
      shiftBubbles(bubbles, EXPLODE_MARGIN - (size.px ?? MARGIN_X), EXPLODE_MARGIN - (size.py ?? MARGIN_Y))
    }
    fitExplodeCanvas(canvas, w, h, dpr)

    // Группы запуска: облачко = группа; сплошная масса = одна группа на весь холст
    const groups = byRegion ? groupByRegion(bubbles) : [bubbles]
    if (byRegion) prepareExplosion(bubbles) // обычно уже готово в простое (warmUp) — тогда ничего не делает
    const pending = new Set()
    groups.forEach((list, g) => { if (list) pending.add(g) })
    const flying = []
    const launch = set => {
      for (const g of [...pending]) {
        if (byRegion && !set.has(g)) continue
        const list = groups[g]
        // Частиц в воздухе сразу не больше MAX_PARTICLES на весь холст: лишние из облачка пропадают в момент взрыва
        // (flying = true — из плавающих выбыли, но в список полёта не попали); flying содержит только живых
        const fly = byRegion ? thinForLaunch(list, flying.length) : list // сплошная масса ленты (тап) — без прореживания
        for (const b of list) b.flying = true
        if (byRegion) startBubbles(fly)
        else launchBubbles(fly, w / 2, h / 2)
        for (const b of fly) flying.push(b)
        noteParticles(flying.length)
        pending.delete(g)
      }
    }

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const count = groups.length
    let command = explodeRef.current
    launch(explodedRegions(command, count))
    // Оставшиеся облачка — статичные спрайты с текущих фаз (одно построение на весь взрыв)
    const sprites = byRegion && pending.size ? buildSprites(groups, dpr, g => pending.has(g)) : null
    const paint = dt => {
      ctx.clearRect(0, 0, w, h)
      if (sprites && pending.size) drawSprites(ctx, sprites, pending)
      const done = drawExplode(ctx, flying, dt, w, h)
      dropDead(flying)
      return done
    }
    paint(0)
    setUnlocked(true)
    unlockRef.current?.()

    let last = performance.now()
    function frame(now) {
      // Время кадра rAF бывает чуть раньше performance.now() из эффекта — dt < 0 давал NaN в альфе
      // шарика и «Cannot read properties of undefined (reading 'push')» в drawExplode
      const dt = Math.max(0, Math.min(32, now - last))
      last = now
      // Команда меняется редко (раз на облачко) — Set регионов строим только тогда
      if (pending.size && explodeRef.current !== command) {
        command = explodeRef.current
        launch(explodedRegions(command, count))
      }
      if (paint(dt) && !pending.size) { setRevealed(true); return }
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

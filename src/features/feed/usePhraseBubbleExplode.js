import { useLayoutEffect, useRef } from 'react'
import { EXPLODE_MARGIN, launchBubbles, startBubbles, shiftBubbles, clearExplodePools } from './phraseBubbleDraw.js'
import { MARGIN_X, MARGIN_Y, EXPLODE_MS } from './phraseBubbleConsts.js'
import { explodedRegions } from './phraseBubbleRegions.js'
import { thinForLaunch, thinForFeed } from './phraseBubbleFlight.js'
import { groupByRegion, prepareExplosion, buildSprites, freeSprites, spriteBytes, paintExplosion } from './phraseBubbleWarm.js'
import { noteParticles, noteGpu, canvasBytes } from './spoilerStats.js'
import { watchAppLifecycle, isAppAway } from './bubbleLifecycle.js'

const EXPLODE_SAFETY_MS = EXPLODE_MS * 2 // один взрыв длится EXPLODE_MS — с двойным запасом
const SAFETY_PER_REGION_MS = EXPLODE_MS  // облачка взрываются по очереди (CatchStripPhrase; шаг меньше EXPLODE_MS) — запас на каждое

// Освободить холст сразу: нулевой размер не держит backing store, пока элемент ждёт удаления из DOM
function dropCanvas(canvas) {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

// Взрыв шариков на ОТДЕЛЬНОМ холсте (вынесено из PhraseBubbleAnimated.jsx). Запускается, когда exploding стало true:
// первый кадр — до показа, в том же тике открываем текст (setUnlocked + onUnlock).
// Два слоя. Холст плавания (floatRef; маленький, запас MARGIN_X/Y, dpr ≤ 1.5) на старте взрыва освобождается (width = 0, он
// скрыт классом). Холст взрыва (blastRef; запас EXPLODE_MARGIN = 120px вокруг фразы, dpr 1 — частицы мелкие и быстрые,
// чёткость не нужна) монтируется компонентом ТОЛЬКО на время взрыва и после него уничтожается: release() обнуляет размер холста,
// спрайты, списки частиц и пулы бакетов, затем setRevealed(true) — React снимает элемент. Шарики сдвигаются в его координаты
// один раз на старте (shiftBubbles).
// explode — команда на взрыв, её можно менять по ходу (читается на каждом кадре): true — взрывается всё сразу
// (тап, прежнее поведение); число n — взорваны первые n облачков (regions); массив — индексы взорванных облачков.
// Облачка, до которых очередь не дошла, висят на этом же холсте статичными спрайтами (phraseBubbleWarm.js: по рамке облачка,
// dpr 1; дрейф на время взрыва замирает — перерисовывать ~1400 дуг на 60 к/с ради него не нужно); каждое взрывается от
// своего центра. Порядок слоёв кадра (paintExplosion): сначала живые облачки, поверх них частицы — облачка справа налево,
// самое левое сверху; разлёт ничем не ограничен, частицы летят поверх живых соседей. Частиц в воздухе ≤ MAX_PARTICLES.
// Без regions (сплошная масса ленты) всё взрывается сразу от центра одной группой, частиц ≤ FEED_MAX_PARTICLES (thinForFeed).
// Приложение ушло в фон / под системную шторку (bubbleLifecycle.js): rAF и страховочный таймер останавливаются, холст и
// спрайты освобождаются сразу; при возврате облачка просто снимаются (взрыв за это время всё равно бы доиграл).
export function usePhraseBubbleExplode({
  exploding, explode, floatRef, blastRef, bubblesRef, sizeRef, idRef, setUnlocked, setRevealed, onUnlock,
}) {
  const explodeRef = useRef(explode)
  const unlockRef = useRef(onUnlock)
  // Layout-эффект, объявленный раньше эффекта взрыва: к его первому кадру команда уже свежая (passive-эффект опоздал бы)
  useLayoutEffect(() => { explodeRef.current = explode; unlockRef.current = onUnlock })

  useLayoutEffect(() => {
    if (!exploding) return
    const blast = blastRef.current
    if (!blast) return
    const id = idRef.current
    dropCanvas(floatRef.current) // холст плавания не нужен: освободить backing store
    noteGpu(`${id}:f`, 0)
    const bubbles = bubblesRef.current
    if (isAppAway()) {
      // Команда пришла, когда приложение в фоне / под шторкой: не анимируем вовсе — открываем текст и снимаем облачка
      dropCanvas(blast)
      setUnlocked(true)
      unlockRef.current?.()
      const t = setTimeout(() => setRevealed(true), 0)
      return () => clearTimeout(t)
    }
    const byRegion = bubbles.length > 0 && bubbles[0].region != null
    const size = sizeRef.current
    const w = Math.round(size.w - MARGIN_X * 2 + EXPLODE_MARGIN * 2)
    const h = Math.round(size.h - MARGIN_Y * 2 + EXPLODE_MARGIN * 2)
    if (!bubbles.blastShifted) {
      // Запас холста взрыва шире постоянного — шарики переезжают в его координаты (один раз)
      shiftBubbles(bubbles, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)
      bubbles.blastShifted = true
    }
    // Холст взрыва: dpr 1, свежий (размер задаём один раз)
    blast.width = w
    blast.height = h
    blast.style.width = w + 'px'
    blast.style.height = h + 'px'
    blast.style.left = -EXPLODE_MARGIN + 'px'
    blast.style.top = -EXPLODE_MARGIN + 'px'
    noteGpu(`${id}:b`, canvasBytes(w, h, 1))

    // Группы запуска: облачко = группа; сплошная масса = одна группа на весь холст
    const groups = byRegion ? groupByRegion(bubbles) : [bubbles]
    if (byRegion) prepareExplosion(bubbles) // обычно уже готово в простое (warmUp) — тогда ничего не делает
    const pending = new Set()
    groups.forEach((list, g) => { if (list) pending.add(g) })
    const lists = [] // частицы в воздухе по облачкам (drawExplode рисует справа налево и выбрасывает догоревших)
    let sprites = null
    const alive = () => lists.reduce((n, l) => n + l.length, 0)
    const launch = set => {
      for (const g of [...pending]) {
        if (byRegion && !set.has(g)) continue
        const list = groups[g]
        // Частиц в воздухе сразу не больше MAX_PARTICLES на весь холст: лишние из облачка пропадают в момент взрыва
        // (flying = true — из плавающих выбыли, но в полёт не попали). Сплошная масса ленты (тап) — свой потолок
        // FEED_MAX_PARTICLES, оставшиеся частицы крупнее (thinForFeed)
        const fly = byRegion ? thinForLaunch(list, alive()) : thinForFeed(list)
        for (const b of list) b.flying = true
        if (byRegion) startBubbles(fly)
        else launchBubbles(fly, w / 2, h / 2)
        lists[g] = fly === list ? list.slice() : fly // drawExplode правит список на месте — копия, не сам массив шариков
        noteParticles(alive())
        pending.delete(g)
        freeSprites(sprites, g) // спрайт запущенного облачка больше не нужен
      }
      noteGpu(`${id}:s`, spriteBytes(sprites))
    }

    const ctx = blast.getContext('2d')
    const count = groups.length
    let command = explodeRef.current
    launch(explodedRegions(command, count))
    // Оставшиеся облачка — маленькие спрайты dpr 1 с текущих фаз (одно построение на весь взрыв)
    sprites = byRegion && pending.size ? buildSprites(groups, 1, g => pending.has(g)) : null
    noteGpu(`${id}:s`, spriteBytes(sprites))
    const paint = dt => {
      ctx.clearRect(0, 0, w, h)
      return paintExplosion(ctx, sprites, pending, lists, dt, w, h)
    }

    let raf = 0
    let safety = 0
    let unwatch = null
    let released = false
    const stopLoop = () => { cancelAnimationFrame(raf); raf = 0; clearTimeout(safety); safety = 0 }
    // Уничтожить всё тяжёлое: холст взрыва (width = 0), спрайты, списки частиц, пул бакетов
    const release = () => {
      if (released) return
      released = true
      freeSprites(sprites)
      sprites = null
      lists.length = 0
      clearExplodePools()
      dropCanvas(blast)
      noteGpu(`${id}:b`, 0)
      noteGpu(`${id}:s`, 0)
    }
    const stopAll = () => { stopLoop(); unwatch?.(); unwatch = null }
    const finish = () => {
      stopAll()
      release()
      bubblesRef.current = [] // облачка больше не нужны
      setRevealed(true)
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
      if (paint(dt) && !pending.size) { finish(); return }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    // Страховка: взрыв длится ~1с (+ очередь облачков); если кадры встали (фон, троттлинг),
    // холст всё равно убираем — иначе он висел бы поверх строки перевода
    safety = setTimeout(finish, EXPLODE_SAFETY_MS + SAFETY_PER_REGION_MS * count)
    unwatch = watchAppLifecycle(
      () => { stopLoop(); release(); bubblesRef.current = [] }, // в фон: ни rAF, ни таймеров, холсты и спрайты освобождены
      () => { stopAll(); setRevealed(true) },                    // вернулись: облачка снимаются
    )
    return () => { stopAll(); release() }
    // setUnlocked/setRevealed/refs — стабильны; эффект запускается один раз на взрыв
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploding])
}

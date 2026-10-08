import { useLayoutEffect } from 'react'
import { drawFloat } from './phraseBubbleDraw.js'
import { noteGpu } from './spoilerStats.js'
import { watchAppLifecycle, isAppAway } from './bubbleLifecycle.js'

const REGION_FRAME_MS = 1000 / 20 // облачка по словам рисуем ~20 кадров/с (лента — 30, см. frame ниже)

// Плавание на живом холсте (вынесено из PhraseBubbleAnimated.jsx). При уходе (слайд не активен / лента скрыта / взрыв) цикл
// гасится, а холст-владелец переснимает картинку покоя с текущих позиций (onSleep). Зависимость — ready (есть ли картинка), а не
// сам still: onSleep сам обновляет still, и зависимость от объекта зациклила бы эффект.
// Лента — через кадр (30/с при 60Гц); облачка по словам (regionsRef.current — массив) — по таймеру ~20/с (на 60Гц кадры через
// 3 тика). Размер читаем из sizeRef на каждом кадре: ресайз меняет его (и холст) на лету.
// Приложение ушло в фон / под шторку iOS (bubbleLifecycle.js): rAF останавливается немедленно (холст маленький и остаётся
// застывшим кадром, снимать картинку в момент сворачивания — лишняя работа), при возврате цикл продолжается с тех же фаз без
// скачка (отсчёт dt начинается заново). Подписка живёт ровно пока живёт цикл.
export function usePhraseBubbleFloat({
  live, unlocked, exploding, ready, canvasRef, bubblesRef, sizeRef, regionsRef, isMounted, idRef, fit, onSleep,
}) {
  useLayoutEffect(() => {
    if (!live || unlocked || exploding || !ready) return
    const canvas = canvasRef.current
    if (!canvas) return
    const id = idRef.current
    const ctx = canvas.getContext('2d')
    const draw = dt => {
      const { w, h, dpr } = sizeRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      drawFloat(ctx, bubblesRef.current, dt)
    }
    fit(canvas)
    draw(0)

    const paced = Array.isArray(regionsRef.current)
    let raf = 0
    let last = 0
    let due = 0
    let skip = 0
    function frame(now) {
      raf = requestAnimationFrame(frame)
      if (paced) {
        if (now < due - 2) return
        due = Math.max(due + REGION_FRAME_MS, now)
      } else {
        skip ^= 1
        if (skip) return
      }
      const dt = Math.max(0, Math.min(paced ? 64 : 48, now - last))
      last = now
      draw(dt)
    }
    const start = () => { last = performance.now(); due = last; raf = requestAnimationFrame(frame) }
    const stop = () => { cancelAnimationFrame(raf); raf = 0 }
    const unwatch = watchAppLifecycle(stop, start)
    if (!isAppAway()) start()
    return () => {
      unwatch()
      stop()
      noteGpu(`${id}:f`, 0)
      if (!isMounted()) return
      // Холст не уснул, а перешёл во взрыв (тот же элемент, класс уже новый): картинка покоя не понадобится
      if (canvas.classList.contains('phraseBubbleCanvasExploding')) return
      canvas.width = 0 // холст уходит — backing store не ждёт сборщика
      canvas.height = 0
      // Слайд ушёл с экрана: картинка покоя — с тех позиций, где шарики остановились, чтобы возврат canvas продолжил
      // движение без скачка
      onSleep()
    }
  }, [live, unlocked, exploding, ready]) // eslint-disable-line react-hooks/exhaustive-deps
}

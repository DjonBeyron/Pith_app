import { useLayoutEffect } from 'react'
import { drawFloat } from './phraseBubbleDraw.js'
import { noteGpu } from './spoilerStats.js'
import { watchAppLifecycle, isAppAway } from './bubbleLifecycle.js'

const FRAME_MS = 1000 / 20 // плавание рисуем ~20 кадров/с и в ленте, и в облачках (было 30 в ленте): дрейф медленный, ≤ ~0.5px за кадр

// Плавание на живом холсте (вынесено из PhraseBubbleAnimated.jsx). При уходе (слайд не активен / лента скрыта / взрыв) цикл
// гасится, а холст-владелец переснимает картинку покоя с текущих позиций (onSleep). Зависимость — ready (есть ли картинка), а не
// сам still: onSleep сам обновляет still, и зависимость от объекта зациклила бы эффект.
// Кадры — по таймеру ~20/с (на 60Гц каждый 3-й тик rAF; на 120Гц ProMotion — каждый 6-й) и в ленте, и в облачках. Пока лента
// листается (жест пальца и анимация Swiper: data-scrolling="1" на .feedSwiper, см. useSwipeGesture) — не рисуем вовсе:
// движение слайда идёт на композиторе, главному потоку незачем перерисовывать холст под ним. Размер читаем из sizeRef на каждом
// кадре: ресайз меняет его (и холст) на лету.
// Приложение ушло в фон / под шторку iOS (bubbleLifecycle.js): rAF останавливается немедленно (холст маленький и остаётся
// застывшим кадром, снимать картинку в момент сворачивания — лишняя работа), при возврате цикл продолжается с тех же фаз без
// скачка (отсчёт dt начинается заново). Подписка живёт ровно пока живёт цикл.
export function usePhraseBubbleFloat({
  live, unlocked, exploding, ready, canvasRef, bubblesRef, sizeRef, isMounted, idRef, fit, onSleep,
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

    // Контейнер ленты (null вне ленты — «Ловля», «Мои уроки»: там пауза по жесту не нужна)
    const scroller = canvas.closest?.('.feedSwiper') ?? null
    let raf = 0
    let last = 0
    let due = 0
    function frame(now) {
      raf = requestAnimationFrame(frame)
      if (now < due - 2) return
      due = Math.max(due + FRAME_MS, now)
      const dt = Math.max(0, Math.min(64, now - last))
      last = now
      if (scroller?.dataset.scrolling === '1') return // листаем: кадр пропущен, last обновлён — после жеста дрейф продолжается без скачка
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

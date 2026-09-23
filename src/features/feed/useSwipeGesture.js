import { useRef } from 'react'
import { swipeEvent } from './feedSwipeTrace.js'
import { FEEL, ratioFor, releaseVelocity, swipeVerdict, targetSlide } from './feedSwipeFeel.js'

// Жест пальца по ленте (вынесено из FeedSwiper.jsx): обработчики касания
// Swiper, которые решают «листать или нет» сами (feedSwipeFeel.js) — как в
// TikTok: по скорости пальца в момент отпускания, иначе по пройденному пути.
// Swiper сам не может: он меряет жест часами своих обработчиков, и при
// занятом главном потоке быстрый флик по ним «длился» дольше порога.

// Вертикаль касания из любого события. На телефоне Swiper идёт по сенсорному
// пути (touchstart/touchmove/touchend), а у TouchEvent нет clientY — он в
// touches/changedTouches. До 3.2.1713 здесь читался только e.clientY: на
// настоящем телефоне флик по скорости и сверка решения НЕ работали вовсе
// (в DBG ни одной строки «решение»), решал один Swiper по пути. В браузерных
// тестах это пряталось: синтетические PointerEvent clientY имеют
function pointY(e) {
  if (!e) return null
  if (e.clientY != null) return e.clientY
  const t = e.changedTouches?.[0] ?? e.touches?.[0]
  return t ? t.clientY : null
}

export function useSwipeGesture() {
  // Жест: точка старта, последние точки движения (по меткам событий) и слайд
  // в момент касания
  const gestureRef = useRef({ y: 0, moves: [], start: 0 })

  // Флаг data-scrolling — для сторожа стоп-кадра (SlideVideo): во время жеста
  // и анимации кадры законно могут молчать, видео не пинать
  function onTouchStart(s, e) {
    s.el.dataset.scrolling = '1'
    s.params.longSwipesRatio = FEEL.DRAG_RATIO
    gestureRef.current = { y: pointY(e) ?? 0, moves: [], start: s.activeIndex }
  }

  function onTouchMove(s, e) {
    const y = pointY(e)
    if (y == null) return
    const moves = gestureRef.current.moves
    moves.push({ t: e.timeStamp, y })
    if (moves.length > 12) moves.shift()
  }

  // Swiper отдаёт touchEnd ДО своего решения — успеваем подсказать ему вердикт:
  // флик — листать при любом пути, рывок обратно — вернуть, иначе решит путь
  function onTouchEnd(s, e) {
    const y = pointY(e)
    if (y != null) {
      const g = gestureRef.current
      const dy = y - g.y
      const v = releaseVelocity(g.moves, { t: e.timeStamp, y })
      const verdict = swipeVerdict(dy, v)
      s.params.longSwipesRatio = ratioFor(verdict)
      if (Math.abs(dy) >= FEEL.THRESHOLD_PX) {
        const want = targetSlide(g.start, dy, verdict, s.size)
        swipeEvent('решение', `путь ${dy.toFixed(0)}px, скорость отпускания ${v.toFixed(2)}px/мс → ${verdict === 'flip' ? 'флик' : verdict === 'stay' ? 'рывок назад' : 'по пути'}, слайд ${want}`)
        // Сверка после Swiper. Первое движение за порог он «съедает» целиком
        // (переносит туда точку старта): при редких событиях (медленный
        // телефон, нагрузка) первый же рывок на 60px пропадал, слайд не
        // двигался, и Swiper выходил, ничего не решив. Решение — по полному
        // пути пальца, Swiper только анимирует; разошлись — ставим нужный слайд
        setTimeout(() => {
          if (s.destroyed || !s.allowTouchMove || s.activeIndex === want) return
          swipeEvent('поправка решения', `Swiper: ${s.activeIndex}, нужно ${want}`)
          s.slideTo(want)
        }, 0)
      }
    }
    setTimeout(() => { if (!s.destroyed && !s.animating) s.el.dataset.scrolling = '' }, 0)
  }

  return { onTouchStart, onTouchMove, onTouchEnd }
}

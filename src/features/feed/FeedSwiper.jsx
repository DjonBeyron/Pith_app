import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Virtual, Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/virtual'
import { circleCycles, midSlide, moduleOf, pickSlideAfterRebuild, recentreTarget } from './feedCircle.js'
import { swipeEvent, swipeProgrammatic, swipeTraceAttach, swipeTraceDetach, swipeTraceVisible } from './feedSwipeTrace.js'
import { FEEL, ratioFor, releaseVelocity, swipeVerdict, targetSlide } from './feedSwipeFeel.js'

// Вертикальная лента на Swiper (замена нативного скролла со scroll-snap).
//
// Почему не нативный скролл: на нём одна за другой вылезали болячки браузеров —
// iOS доснэпливал слайды во время инерции и лента «летела» до края круга,
// Chrome на Android подправлял scrollTop (scroll anchoring) и свайп
// возвращался, скрытая вкладка продолжала прокручиваться вслепую, программный
// scrollTop не будил виртуализатор. Swiper двигает слайды transform'ом и сам
// ведёт жест: нет браузерной инерции, snap, anchoring — нечему и ломаться.
//
// Круг прежний (feedCircle.js): len * cycles виртуальных слайдов, модуль =
// индекс % len, старт с середины, у края — перенос в середину без анимации.
// Virtual держит в DOM только активный слайд и по два соседа.

// «Листать или нет» решаем сами (feedSwipeFeel.js) — как в TikTok: по скорости
// пальца в момент отпускания, иначе по пройденному пути. Swiper сам не может:
// он меряет жест часами своих обработчиков, и при занятом главном потоке
// быстрый флик по ним «длился» дольше порога — лента возвращалась
const SPEED = 300 // мс анимации перехода между слайдами

export default function FeedSwiper({ feedModules, pinnedId, active, activeIdx, onActiveIdx, renderSlide }) {
  const len = feedModules.length
  const cycles = circleCycles(len)
  const total = len * cycles
  const swiperRef = useRef(null)
  const ids = useMemo(() => feedModules.map(m => m.id), [feedModules])
  const sig = ids.join('|')
  // Обработчики Swiper живут дольше одного рендера — свежие ids и колбэк они
  // берут из ссылок, которые обновляем после каждого рендера
  const idsRef = useRef(ids)
  const onActiveRef = useRef(onActiveIdx)
  useLayoutEffect(() => {
    idsRef.current = ids
    onActiveRef.current = onActiveIdx
  })
  // Модуль, который сейчас на экране: после пересборки круга встаём на него
  const activeModuleRef = useRef(null)
  // Старт: туда, где лента была (возврат с экрана модуля — он её размонтирует),
  // иначе середина круга. Swiper читает его один раз — при создании
  const [initialSlide] = useState(() => (activeIdx >= 0 && activeIdx < total ? activeIdx : midSlide(len, cycles)))

  function jump(s, target, why) {
    swipeProgrammatic(why, () => s.slideTo(target, 0, false))
    onActiveRef.current(target)
  }

  function handleSlideChange(s) {
    const ids = idsRef.current
    activeModuleRef.current = ids[moduleOf(s.activeIndex, ids.length)] ?? activeModuleRef.current
    onActiveRef.current(s.activeIndex)
  }

  // Страховка анимации. CSS-переход обёртки может так и не закончиться:
  // свайпнул и тут же свернул приложение/заблокировал экран — браузер не рисует
  // кадры, transitionend не приходит, и Swiper навсегда остаётся «в анимации».
  // Следующий жест он тогда начинает с того, что насильно доигрывает старый
  // переход, и индекс съезжает посреди нового свайпа (в тесте: «один свайп —
  // два слайда», «флик вперёд — лента назад»). Добиваем сами и заранее — тем
  // же синтетическим событием, каким это делает сам Swiper
  const endTimerRef = useRef(0)
  function finishStuck(s, why) {
    if (!s || s.destroyed || !s.animating) return
    swipeEvent('добиваю анимацию', `${why}, слайд ${s.activeIndex}`)
    s.wrapperEl.dispatchEvent(new CustomEvent('transitionend', {
      bubbles: true, cancelable: true, detail: { bySwiperTouchMove: true },
    }))
  }
  function handleTransitionStart(s) {
    clearTimeout(endTimerRef.current)
    endTimerRef.current = setTimeout(() => finishStuck(s, 'transitionend не пришёл'), SPEED + 250)
  }
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) finishStuck(swiperRef.current, 'возврат из фона') }
    document.addEventListener('visibilitychange', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); clearTimeout(endTimerRef.current) }
  }, [])

  function handleTransitionEnd(s) {
    clearTimeout(endTimerRef.current)
    s.el.dataset.scrolling = '' // анимация закончилась — сторож стоп-кадра видео снова работает
    const L = idsRef.current.length
    const target = recentreTarget(s.activeIndex, L, circleCycles(L))
    if (target !== null) jump(s, target, 'перенос круга')
  }

  // Флаг для сторожа стоп-кадра (SlideVideo): во время жеста и анимации кадры
  // законно могут молчать — не пинать видео
  // Жест пальца: старт и последние точки движения (по меткам событий)
  const gestureRef = useRef({ y: 0, moves: [], start: 0 })
  function handleTouchStart(s, e) {
    s.el.dataset.scrolling = '1'
    s.params.longSwipesRatio = FEEL.DRAG_RATIO
    gestureRef.current = { y: e?.clientY ?? 0, moves: [], start: s.activeIndex }
  }
  function handleTouchMove(s, e) {
    if (e?.clientY == null) return
    const moves = gestureRef.current.moves
    moves.push({ t: e.timeStamp, y: e.clientY })
    if (moves.length > 12) moves.shift()
  }
  // Swiper отдаёт touchEnd ДО своего решения — успеваем подсказать ему вердикт:
  // флик — листать при любом пути, рывок обратно — вернуть, иначе решит путь
  function handleTouchEnd(s, e) {
    if (e?.clientY != null) {
      const g = gestureRef.current
      const dy = e.clientY - g.y
      const v = releaseVelocity(g.moves, { t: e.timeStamp, y: e.clientY })
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

  // Пересборка круга: изменился состав ленты (фильтр, начатые модули приехали
  // с сервера) или поворот из поиска. Swiper уже получил новые слайды (его
  // эффекты отрабатывают раньше наших) — ставим нужный слайд
  const shapeRef = useRef({ sig, pinnedId })
  useEffect(() => {
    const s = swiperRef.current
    const prev = shapeRef.current
    shapeRef.current = { sig, pinnedId }
    if (!s || s.destroyed || (prev.sig === sig && prev.pinnedId === pinnedId)) return
    const keepId = pinnedId && pinnedId !== prev.pinnedId ? null : activeModuleRef.current
    const target = pickSlideAfterRebuild(ids, keepId, len, cycles)
    jump(s, target, keepId && ids.includes(keepId) ? 'пересборка круга (держу модуль)' : 'пересборка круга')
  }, [sig, pinnedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Лента не на экране (другая вкладка, «Мои уроки», слой урока): жесты,
  // колесо и клавиатура выключены — клавиатура Swiper слушает весь документ,
  // стрелки на другой вкладке листали бы скрытую ленту
  useEffect(() => {
    swipeTraceVisible(active)
    const s = swiperRef.current
    if (!s || s.destroyed) return
    s.allowTouchMove = active
    if (active) { s.mousewheel.enable(); s.keyboard.enable() } else { s.mousewheel.disable(); s.keyboard.disable() }
    // Палец ещё на ленте, а она уходит с экрана (вторым пальцем нажали
    // вкладку): жест отменяем и возвращаем слайд на место. allowTouchMove
    // Swiper проверяет только на движении — отпускание он бы доиграл уже на
    // скрытой ленте (поймано трассировщиком в прогоне обезьяны)
    const d = s.touchEventsData
    if (!active && d?.isTouched) {
      d.isTouched = false
      d.isMoved = false
      d.startMoving = false
      swipeProgrammatic('жест отменён: лента ушла с экрана', () => s.slideTo(s.activeIndex, 0, false))
    }
    swipeEvent(active ? 'вернулась на экран' : 'ушла с экрана', `слайд ${s.activeIndex}`)
  }, [active])

  useEffect(() => () => swipeTraceDetach(), [])

  // Элементы слайдов создаются на весь круг (так устроен Virtual в React), но
  // содержимое — только рядом с активным: остальные Virtual всё равно не
  // смонтирует, а FeedSlide с полным набором пропсов на 200 индексов — лишняя работа
  const slides = []
  for (let i = 0; i < total; i++) {
    const rel = i - activeIdx
    slides.push(
      <SwiperSlide key={i} virtualIndex={i} className={rel === 0 ? 'feedSlideWrap feedSlideWrapActive' : 'feedSlideWrap'}>
        {Math.abs(rel) <= 3 ? renderSlide(feedModules[moduleOf(i, len)], i, rel) : null}
      </SwiperSlide>,
    )
  }

  return (
    <Swiper
      className="feedSwiper"
      modules={[Virtual, Mousewheel, Keyboard]}
      direction="vertical"
      slidesPerView={1}
      initialSlide={initialSlide}
      virtual={{ addSlidesBefore: 1, addSlidesAfter: 1 }}
      speed={SPEED}
      // Чувствительность — feedSwipeFeel.js. longSwipesMs=0: все жесты решаются
      // по пути (его подменяет наш вердикт), «короткую» ветку Swiper (листает
      // при любом сдвиге, если жест короче 300мс по его часам) не используем
      threshold={FEEL.THRESHOLD_PX}
      longSwipesMs={0}
      longSwipesRatio={FEEL.DRAG_RATIO}
      resistanceRatio={0.5}
      mousewheel={{ forceToAxis: true, thresholdDelta: 12 }}
      keyboard={{ enabled: true }}
      onSwiper={s => { swiperRef.current = s; swipeTraceAttach(s); handleSlideChange(s) }}
      onSlideChange={handleSlideChange}
      onTransitionStart={handleTransitionStart}
      onTransitionEnd={handleTransitionEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {slides}
    </Swiper>
  )
}

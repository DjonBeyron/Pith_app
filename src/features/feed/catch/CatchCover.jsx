import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import CatchStrip from './CatchStrip.jsx'
import CatchSheet from './CatchSheet.jsx'

// «Накрытие» слайда в режиме «Ловли слов»: полоска фразы (CatchStrip) над шторкой набора (CatchSheet), одним блоком
// у нижней навигации (feed-catch.css: .catchCover). Панель НЕ ДВИЖЕТСЯ (раньше выезжала transform'ом 260мс — тяжело для iOS):
// она стоит на месте, а поверх всего накрытия лежит слой-заливка .catchCoverVeil цвета панели (#1a1d22), и анимируется
// только opacity. ОТКРЫТИЕ: монтируется с opacity 0 и заливкой 1; за 120мс блок проявляется, затем заливка гаснет (220мс) —
// содержимое (облачка, клавиатура) проступает «из заливки». УХОД (open=false, «Готово»): заливка за 180мс (ease-in)
// закрывает всю панель, затем всё накрытие гаснет (140мс) и открывает готовую фразу (она подготовлена под ним,
// useCatchPrepare). По окончании перехода opacity самого блока (transitionend) вызывается onClosed — родитель размонтирует
// блок (useSlideCatch.coverGone; таймер CATCH_COVER_OUT_MS там — страховка; при prefers-reduced-motion переходов нет,
// onClosed зовётся сразу). will-change нет. Высота блока (шторка + полоска) уходит в onHeight(px) из
// ResizeObserver — FeedSlide кладёт её в --catch-cover-h, чтобы сдвинуть иконку паузы и чипы звука (0, когда закрыто); высота
// теперь появляется сразу, а не вместе с выездом, поэтому иконки едут собственным переходом (260мс) параллельно проявлению;
// одинаковая высота подряд наружу не уходит (ResizeObserver шлёт и субпиксельный шум), любая другая — уходит сразу.
// Второй аргумент onHeight(h, follow): follow=true, когда высота меняется кадр за кадром (сворачивание клавиатуры на
// «Проверить») — тогда иконки следуют за ней без собственного перехода (иначе каждый кадр
// перезапускал бы их 260мс-переход — дрожание); одиночный скачок (follow=false) едет плавным переходом 260мс.
// live — лента видна и слайд активен: canvas массы шариков в полоске живёт; false (ушли на другую вкладку) — спит.
// Canvas живёт и пока накрытие гаснет (live не зависит от open): иначе в первом кадре ухода он снимал бы картинку покоя
// (toDataURL) на главном потоке; при размонтировании картинка не снимается.
// Остальные пропсы — для CatchStrip (title, words, cur, typedBy, phase, results, onPick) и CatchSheet
// (hasPrev/onPrev — «Предыдущее слово»).
const FOLLOW_GAP_MS = 120

export default function CatchCover({
  open, onHeight, onClosed, live = true,
  title, words, cur, typedBy, phase, results, onPick,
  helped, model, isLast, hasPrev, shift, onKey, onBackspace, onNext, onPrev, onCheck, onHelp, onReveal, onFinish,
}) {
  const ref = useRef(null)
  // Первый кадр — в начальном состоянии (блок прозрачен, заливка полная), иначе переходу opacity нечего играть; закрытие —
  // сразу (сброс при рендере)
  const [ticked, setTicked] = useState(false)
  if (!open && ticked) setTicked(false)
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => setTicked(true))
    return () => cancelAnimationFrame(id)
  }, [open])
  const shown = open && ticked
  // Размонтирование — по концу перехода opacity самого блока (последний при уходе: заливка 180мс → гашение 140мс); переходы
  // детей (заливка, иконки) всплывают сюда же, их отсекаем по target
  function onTransitionEnd(e) {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return
    if (!open) onClosed?.()
  }
  // prefers-reduced-motion: переходов нет, transitionend не придёт — размонтируем сразу после ухода
  const closedRef = useRef(onClosed)
  useEffect(() => { closedRef.current = onClosed })
  useEffect(() => {
    if (open || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setTimeout(() => closedRef.current?.(), 0)
    return () => clearTimeout(t)
  }, [open])

  const heightRef = useRef(onHeight)
  useEffect(() => { heightRef.current = onHeight })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !open) { heightRef.current?.(0); return }
    let last = -1
    let lastAt = 0
    let streak = 0
    const report = () => {
      const h = Math.round(el.getBoundingClientRect().height)
      if (h === last) return
      const now = performance.now()
      // Третье изменение подряд с паузами до 120мс — высота анимируется кадр за кадром: следуем без перехода
      // (одна-две поправки после раскладки остаются обычным плавным переходом)
      streak = last !== -1 && now - lastAt < FOLLOW_GAP_MS ? streak + 1 : 0
      const follow = streak >= 2
      last = h
      lastAt = now
      heightRef.current?.(h, follow)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => { ro.disconnect(); heightRef.current?.(0) }
  }, [open])

  const curWord = cur == null ? null : words.find(w => w.index === cur) ?? null
  return (
    <div
      className={shown ? 'catchCover catchCoverShown' : 'catchCover'}
      ref={ref} onTransitionEnd={onTransitionEnd}
    >
      <CatchStrip
        title={title} words={words} cur={cur} typedBy={typedBy} phase={phase} results={results}
        live={live} onPick={onPick}
      />
      <CatchSheet
        phase={phase} cur={curWord} helped={helped} model={model} isLast={isLast} hasPrev={hasPrev} shift={shift}
        onKey={onKey} onBackspace={onBackspace} onNext={onNext} onPrev={onPrev} onCheck={onCheck}
        onHelp={onHelp} onReveal={onReveal} onFinish={onFinish}
      />
      <i className="catchCoverVeil" aria-hidden="true" />
    </div>
  )
}

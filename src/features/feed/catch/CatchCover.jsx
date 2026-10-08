import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import CatchStrip from './CatchStrip.jsx'
import CatchSheet from './CatchSheet.jsx'

// «Накрытие» слайда в режиме «Ловли слов»: полоска фразы (CatchStrip) над шторкой набора (CatchSheet), одним блоком
// у нижней навигации (feed-catch.css: .catchCover). Это ОДИН элемент с одной анимацией: выезжает снизу целиком
// (transform 260мс), у детей собственных анимаций появления/ухода нет. Закрытие (open=false) — он так же уезжает вниз,
// по окончании перехода (transitionend) вызывается onClosed — родитель размонтирует блок (useSlideCatch.coverGone;
// таймер CATCH_COVER_OUT_MS там — только страховка). will-change: transform стоит лишь на время перехода
// (.catchCoverMoving). Высота блока (шторка + полоска) уходит в onHeight(px) из
// ResizeObserver — FeedSlide кладёт её в --catch-cover-h, чтобы сдвинуть иконку паузы и чипы звука (0, когда закрыто);
// одинаковая высота подряд наружу не уходит (ResizeObserver шлёт и субпиксельный шум), любая другая — уходит сразу.
// Второй аргумент onHeight(h, follow): follow=true, когда высота меняется кадр за кадром (сворачивание клавиатуры на
// «Проверить») — тогда иконки следуют за ней без собственного перехода (иначе каждый кадр
// перезапускал бы их 260мс-переход — дрожание); одиночный скачок (follow=false) едет плавным переходом 260мс.
// live — лента видна и слайд активен: canvas массы шариков в полоске живёт; false (ушли на другую вкладку) — спит.
// Canvas живёт и пока блок уезжает (live не зависит от open): иначе в первом кадре ухода он снимал бы картинку покоя
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
  // Первый кадр — в спрятанном положении, иначе переходу transform нечего играть; закрытие — сразу (сброс при рендере)
  const [ticked, setTicked] = useState(false)
  if (!open && ticked) setTicked(false)
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => setTicked(true))
    return () => cancelAnimationFrame(id)
  }, [open])
  const shown = open && ticked
  // Положение, в котором закончился последний переход: пока оно не совпало с желаемым — блок едет (will-change)
  const [settled, setSettled] = useState(false)
  function onTransitionEnd(e) {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
    setSettled(shown)
    if (!open) onClosed?.()
  }

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
      className={`catchCover${shown ? ' catchCoverShown' : ''}${shown !== settled ? ' catchCoverMoving' : ''}`}
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
    </div>
  )
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import CatchStrip from './CatchStrip.jsx'
import CatchSheet from './CatchSheet.jsx'

// «Накрытие» слайда в режиме «Ловли слов»: полоска фразы (CatchStrip) над шторкой набора (CatchSheet), одним блоком
// у нижней навигации (feed-catch.css: .catchCover). Панель ДВИЖЕТСЯ (transform 260мс) и при этом её содержимое проявляется
// через слой-заливку .catchCoverVeil цвета панели (#1a1d22, поверх всего): сама панель и её фон всегда opacity 1, а заливка
// меняет только opacity, синхронно с движением (тот же старт, те же 260мс). ОТКРЫТИЕ: монтируется спрятанной (translateY 105%,
// заливка 1), кадром позже (rAF, ticked) получает .catchCoverShown — панель выезжает снизу; первые 10% пути (26мс)
// заливка остаётся на 1 (содержимое закрыто целиком), затем линейно идёт к 0 за оставшиеся 234мс, к последнему кадру
// выезда всё внутри на 100%. УХОД (open=false, «Готово»): панель уезжает вниз (ускоряющаяся кривая — не «залипает» в
// конце); первые 10% пути заливка остаётся на 0 (содержимое ещё видно целиком), затем идёт к 1 (transition: opacity
// 234ms linear 26ms — одно правило на оба направления, конец вместе с движением); под панелью открывается готовая фраза
// (useCatchPrepare).
// По окончании transform (transitionend самого блока) вызывается onClosed — родитель размонтирует блок
// (useSlideCatch.coverGone; таймер CATCH_COVER_OUT_MS там — страховка; при prefers-reduced-motion переходов нет, onClosed
// зовётся сразу). will-change: transform стоит лишь на время перехода (.catchCoverMoving), у заливки его нет.
// Высота блока (шторка + полоска) уходит в onHeight(px) из ResizeObserver — FeedSlide кладёт её в --catch-cover-h, чтобы
// сдвинуть иконку паузы и чипы звука (0, когда закрыто). Первый раз высота уходит в том же коммите, где блок получает
// .catchCoverShown, поэтому иконки (переход 260мс) стартуют в одном кадре с выездом и едут синхронно — ничего не прыгает;
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
  // Первый кадр — в спрятанном положении (translateY 105%, заливка 1), иначе переходу нечего играть; закрытие — сразу
  // (сброс при рендере)
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
  // Размонтирование — по концу transform самого блока; opacity заливки (она всплывает сюда же) отсекаем по target/propertyName
  function onTransitionEnd(e) {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
    setSettled(shown)
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
    if (!el || !shown) { heightRef.current?.(0); return }
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
  }, [shown])

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
      <i className="catchCoverVeil" aria-hidden="true" />
    </div>
  )
}

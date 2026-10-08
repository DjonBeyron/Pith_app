import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import CatchStrip from './CatchStrip.jsx'
import CatchSheet from './CatchSheet.jsx'

// «Накрытие» слайда в режиме «Ловли слов»: полоска фразы (CatchStrip) над шторкой набора (CatchSheet), одним блоком
// у нижней навигации (feed-catch.css: .catchCover). Открытие: шторка выезжает снизу (260мс), полоска — через ~120мс
// из-под неё (z-index ниже шторки); закрытие (open=false) — обе уезжают вниз, родитель размонтирует блок
// после CATCH_COVER_OUT_MS (useSlideCatch.mounted). Высота блока (шторка + полоска) уходит в onHeight(px) из
// ResizeObserver — FeedSlide кладёт её в --catch-cover-h, чтобы сдвинуть иконку паузы и чипы звука (0, когда закрыто);
// одинаковая высота подряд наружу не уходит (ResizeObserver шлёт и субпиксельный шум).
// live — лента видна и слайд активен: canvas массы шариков в полоске живёт; false (ушли на другую вкладку) — спит.
// Остальные пропсы — для CatchStrip (title, words, cur, typedBy, phase, results, onPick) и CatchSheet
// (hasPrev/onPrev — «Предыдущее слово»).
export default function CatchCover({
  open, onHeight, live = true,
  title, words, cur, typedBy, phase, results, onPick,
  helped, model, isLast, hasPrev, onKey, onBackspace, onNext, onPrev, onCheck, onHelp, onReveal, onFinish,
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

  const heightRef = useRef(onHeight)
  useEffect(() => { heightRef.current = onHeight })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !open) { heightRef.current?.(0); return }
    let last = -1
    const report = () => {
      const h = Math.round(el.getBoundingClientRect().height)
      if (h === last) return
      last = h
      heightRef.current?.(h)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => { ro.disconnect(); heightRef.current?.(0) }
  }, [open])

  const curWord = cur == null ? null : words.find(w => w.index === cur) ?? null
  return (
    <div className={`catchCover${shown ? ' catchCoverShown' : ''}`} ref={ref}>
      <CatchStrip
        title={title} words={words} cur={cur} typedBy={typedBy} phase={phase} results={results}
        live={open && live} onPick={onPick}
      />
      <CatchSheet
        phase={phase} cur={curWord} helped={helped} model={model} isLast={isLast} hasPrev={hasPrev}
        onKey={onKey} onBackspace={onBackspace} onNext={onNext} onPrev={onPrev} onCheck={onCheck}
        onHelp={onHelp} onReveal={onReveal} onFinish={onFinish}
      />
    </div>
  )
}

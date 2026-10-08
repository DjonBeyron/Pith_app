import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { splitTitleTokens } from '../../../shared/lib/titleWords.js'
import PhraseBubbleSpoiler from '../PhraseBubbleSpoiler.jsx'
import { LEVEL_CLASS } from './feedCatch.js'
import { hitWordIndex, underlineBox } from './catchStripGeom.js'
import { measureWords } from './catchWordRects.js'
import { explodeAt } from './catchTiming.js'

// Фраза в полоске «Ловли слов» (CatchStrip.jsx): шарики лежат отдельными облачками над каждым словом (один canvas на
// всю фразу, на слабых устройствах — по статичной маске на слово), между словами — чистый промежуток. Прямоугольники
// слов (regions) меряются здесь же по span'ам (data-index) через ResizeObserver и уходят наверх в onMeasure — CatchStrip
// отдаёт их обратно сюда (regions) и в строку набранного (ширины слотов). Шрифт — .feedPhrase (как в ленте).
// Тап по облачку не взрывает его: onTap отдаёт событие сюда, слово ищется по координате тапа среди span'ов → onPick(index).
// Активное слово — подчёркивание с треугольником (.catchUnderline) ниже облачка: положение — из rect span'а
// относительно обёртки, пишется прямо в style (transform/width, переход 200мс), пересчёт при смене cur и ресайзе.
// Финал (result): клавиатура сначала уезжает (CATCH_COLLAPSE_MS), затем облачка раскрываются по очереди слева направо
// (шаг CATCH_EXPLODE_STEP_MS): таймер наращивает счётчик взорванных, слова под ещё не взорванным облачком скрыты
// (.catchWordWait). Верно набранные слова — цветом уровня (LEVEL_CLASS).
// live — canvas живёт (накрытие открыто и лента видна); false → спит картинкой покоя, состояние не трогается
export default function CatchStripPhrase({
  title, words, cur = null, result = false, results = null, live = true, regions = null, onMeasure, onPick,
}) {
  const tokens = splitTitleTokens(title)
  const wrapRef = useRef(null)
  const phraseRef = useRef(null)
  const ulRef = useRef(null)
  const levelOf = index => words.find(w => w.index === index)?.level ?? 0
  const okOf = index => results?.find(r => r.index === index)?.ok ?? false
  const showUnderline = !result && cur != null

  // Замер слов: первый отчёт приходит сразу после подключения наблюдателя (до отрисовки кадра); дальше — при смене
  // размеров фразы или любого слова (шрифт подгрузился, перенос строк). setState только в колбэке наблюдателя
  const measureRef = useRef(onMeasure)
  useEffect(() => { measureRef.current = onMeasure })
  useLayoutEffect(() => {
    const phrase = phraseRef.current
    if (!phrase) return
    const ro = new ResizeObserver(() => measureRef.current?.(measureWords(phrase)))
    ro.observe(phrase)
    phrase.querySelectorAll('[data-index]').forEach(el => ro.observe(el))
    return () => ro.disconnect()
  }, [title])

  // Подчёркивание — под активным span'ом, координаты относительно обёртки (обе rect сдвигаются вместе с полоской)
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const phrase = phraseRef.current
    const ul = ulRef.current
    if (!wrap || !phrase || !ul || !showUnderline) return
    const span = phrase.querySelector(`[data-index="${cur}"]`)
    if (!span) return
    const place = () => {
      const b = underlineBox(span.getBoundingClientRect(), wrap.getBoundingClientRect())
      ul.style.transform = `translate(${b.x}px, ${b.y}px)`
      ul.style.width = `${b.w}px`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [cur, showUnderline, title])

  // Финал: счётчик взорванных облачков растёт по таймерам (setState в колбэках таймеров)
  const count = words.length
  const [boomed, setBoomed] = useState(0)
  useEffect(() => {
    if (!result) return
    const ids = []
    for (let i = 1; i <= count; i++) ids.push(setTimeout(() => setBoomed(i), explodeAt(i - 1)))
    return () => ids.forEach(clearTimeout)
  }, [result, count])
  const exploded = result ? boomed : 0

  // Тап по облачку → слово по координате
  function tap(e) {
    const phrase = phraseRef.current
    if (!phrase || !onPick) return
    const rects = [...phrase.querySelectorAll('[data-index]')].map(el => {
      const r = el.getBoundingClientRect()
      return { index: Number(el.dataset.index), left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    })
    const index = hitWordIndex(rects, e.clientX, e.clientY)
    if (index != null) onPick(index)
  }

  // Сколько слов стоит до токена: знак после слова k открывается вместе с ним (когда exploded > k)
  let wordsBefore = 0
  return (
    <div className="catchStripPhraseWrap" ref={wrapRef}>
      <PhraseBubbleSpoiler active={live} onTap={result ? undefined : tap} explode={exploded} regions={regions ?? []}>
        <div className="feedPhrase catchStripPhrase" ref={phraseRef}>
          {tokens.map((t, i) => {
            const wait = result && exploded < count && (t.word ? t.index : wordsBefore - 1) >= exploded
            if (!t.word) return <span key={i} className={wait ? 'catchWordWait' : undefined}>{t.text}</span>
            wordsBefore++
            const lvl = result && okOf(t.index) ? LEVEL_CLASS(levelOf(t.index)) : ''
            const cls = [lvl, wait ? 'catchWordWait' : ''].filter(Boolean).join(' ')
            return <span key={i} className={cls || undefined} data-index={t.index}>{t.text}</span>
          })}
        </div>
      </PhraseBubbleSpoiler>
      {showUnderline && <i ref={ulRef} className={`catchUnderline catchLvl${levelOf(cur)}`} aria-hidden="true" />}
    </div>
  )
}

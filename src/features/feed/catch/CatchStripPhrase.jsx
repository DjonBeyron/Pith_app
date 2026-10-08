import { useLayoutEffect, useRef } from 'react'
import { splitTitleTokens } from '../../../shared/lib/titleWords.js'
import PhraseBubbleSpoiler from '../PhraseBubbleSpoiler.jsx'
import { LEVEL_CLASS } from './feedCatch.js'
import { hitWordIndex, underlineBox } from './catchStripGeom.js'

// Фраза в полоске «Ловли слов» (CatchStrip.jsx): ОДНА живая масса шариков на всю фразу — тот же PhraseBubbleSpoiler,
// что и в ленте (canvas на способных устройствах, статичный узор на слабых), а не туман на каждом слове.
// Шрифт — .feedPhrase (как в ленте), поэтому сетка шариков считается так же. Тап по массе не взрывает её: onTap
// отдаёт событие сюда, слово ищется по координате тапа среди span'ов (data-index) → onPick(index). Активное слово —
// подчёркивание с треугольником (.catchUnderline) ниже массы: его положение берётся из rect span'а относительно
// обёртки и пишется прямо в style (transform/width, переход 200мс), пересчёт при смене cur и ресайзе.
// Финал (result): explode → шарики разлетаются, текст открыт; верно набранные слова — цветом уровня (LEVEL_CLASS).
// live — canvas живёт (накрытие открыто и лента видна); false → спит картинкой покоя, состояние не трогается
export default function CatchStripPhrase({ title, words, cur = null, result = false, results = null, live = true, onPick }) {
  const tokens = splitTitleTokens(title)
  const wrapRef = useRef(null)
  const phraseRef = useRef(null)
  const ulRef = useRef(null)
  const levelOf = index => words.find(w => w.index === index)?.level ?? 0
  const okOf = index => results?.find(r => r.index === index)?.ok ?? false
  const showUnderline = !result && cur != null

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

  // Тап по массе → слово по координате
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

  return (
    <div className="catchStripPhraseWrap" ref={wrapRef}>
      <PhraseBubbleSpoiler active={live} onTap={result ? undefined : tap} explode={result}>
        <div className={`feedPhrase catchStripPhrase${result ? ' catchStripOrig' : ''}`} ref={phraseRef}>
          {tokens.map((t, i) => {
            if (!t.word) return <span key={i}>{t.text}</span>
            const cls = result && okOf(t.index) ? LEVEL_CLASS(levelOf(t.index)) : ''
            return <span key={i} className={cls || undefined} data-index={t.index}>{t.text}</span>
          })}
        </div>
      </PhraseBubbleSpoiler>
      {showUnderline && <i ref={ulRef} className={`catchUnderline catchLvl${levelOf(cur)}`} aria-hidden="true" />}
    </div>
  )
}

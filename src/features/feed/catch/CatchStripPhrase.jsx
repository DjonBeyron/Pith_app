import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import PhraseBubbleSpoiler from '../PhraseBubbleSpoiler.jsx'
import { LEVEL_CLASS } from './feedCatch.js'
import { hitWordIndex, underlineBox } from './catchStripGeom.js'
import { measureWords, naturalWidth } from './catchWordRects.js'
import { phraseUnits } from './catchPhraseUnits.js'
import { nextFit, fontPx, FIT_NONE } from './catchFit.js'
import { explodeAt } from './catchTiming.js'

// Фраза в полоске «Ловли слов» (CatchStrip.jsx): шарики лежат отдельными облачками над каждым словом (один canvas на
// всю фразу, на слабых устройствах — по статичной маске на слово), между словами — нарочно большой чистый промежуток
// (word-spacing в feed-catch-strip.css); знаки препинания прилипают к своему слову (phraseUnits). Прямоугольники
// слов (regions) меряются здесь же по span'ам (data-index) через ResizeObserver и уходят наверх в onMeasure — CatchStrip
// отдаёт их обратно сюда (regions) и в строку набранного (ширины слотов). Шрифт — .feedPhrase (как в ленте).
// Фраза всегда в одну строку (white-space: nowrap) и по центру полоски: не влезла по ширине — уменьшается ВСЯ целиком
// (fit.scale → font-size, word-spacing в em уменьшается вместе с ним; catchFit.js), переносится только если и при
// минимальном масштабе не влезает (fit.wrap). Масштаб считает тот же наблюдатель, что и замер слов: пока масштаб
// меняется или ещё не применён к DOM, regions не отдаём (они были бы по старой раскладке) — отчёт приходит со
// следующим срабатыванием наблюдателя (второй проход), поэтому шарики собираются по готовой раскладке один раз.
// Тап по облачку не взрывает его: onTap отдаёт событие сюда, слово ищется по координате тапа среди span'ов → onPick(index).
// Активное слово — подчёркивание с треугольником (.catchUnderline) ниже облачка, шириной в облачко целиком (слово +
// запас): положение — из rect span'а относительно обёртки, пишется прямо в style (transform/width, переход 200мс),
// пересчёт при смене cur, масштаба и ресайзе.
// Финал (result): клавиатура сначала уезжает (CATCH_COLLAPSE_MS), затем облачка раскрываются по очереди слева направо
// (шаг CATCH_EXPLODE_STEP_MS): таймер наращивает счётчик взорванных, слова под ещё не взорванным облачком скрыты
// (.catchWordWait). Верно набранные слова — цветом уровня (LEVEL_CLASS).
// live — canvas живёт (накрытие открыто и лента видна); false → спит картинкой покоя, состояние не трогается
const MAX_FIT_STEPS = 4 // подряд смен масштаба, после которых фразу больше не подгоняем, пока не пришёл замер

export default function CatchStripPhrase({
  title, words, cur = null, result = false, results = null, live = true, regions = null, fit = FIT_NONE, onFit, onMeasure, onPick,
}) {
  const units = phraseUnits(title)
  const wrapRef = useRef(null)
  const phraseRef = useRef(null)
  const ulRef = useRef(null)
  const levelOf = index => words.find(w => w.index === index)?.level ?? 0
  const okOf = index => results?.find(r => r.index === index)?.ok ?? false
  const showUnderline = !result && cur != null

  // Замер: масштаб (уместить фразу в одну строку), затем слова. Первый отчёт приходит сразу после подключения
  // наблюдателя (до отрисовки кадра); дальше — при смене размеров обёртки, фразы или любого слова (шрифт подгрузился,
  // масштаб применился). setState только в колбэке наблюдателя
  const measureRef = useRef(onMeasure)
  const fitRef = useRef(fit)
  const onFitRef = useRef(onFit)
  useLayoutEffect(() => { measureRef.current = onMeasure; fitRef.current = fit; onFitRef.current = onFit })
  useLayoutEffect(() => {
    const phrase = phraseRef.current
    const wrap = wrapRef.current
    if (!phrase || !wrap) return
    let steps = 0 // подряд сменённых масштабов без замера: предохранитель от петли «замер → масштаб → замер»
    const ro = new ResizeObserver(() => {
      const cur = fitRef.current
      // Масштаб ещё не применён к DOM (React не успел перерисовать) — меряем нечего: слова лежат по старой раскладке,
      // отчёт был бы лишним (ещё одна сборка шариков); наблюдатель сработает снова, когда размеры изменятся
      if (parseFloat(phrase.style.fontSize) !== fontPx(cur.scale)) return
      const next = steps < MAX_FIT_STEPS ? nextFit(cur, naturalWidth(phrase, cur.scale), wrap.clientWidth) : cur
      if (next !== cur) { steps++; fitRef.current = next; onFitRef.current?.(next); return }
      steps = 0
      measureRef.current?.(measureWords(phrase))
    })
    ro.observe(wrap)
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
    ro.observe(phrase)
    return () => ro.disconnect()
  }, [cur, showUnderline, title, fit.scale])

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

  const phraseCls = fit.wrap ? 'feedPhrase catchStripPhrase catchStripPhraseWrapText' : 'feedPhrase catchStripPhrase'
  return (
    <div className="catchStripPhraseWrap" ref={wrapRef}>
      <PhraseBubbleSpoiler active={live} onTap={result ? undefined : tap} explode={exploded} regions={regions ?? []}>
        <div className={phraseCls} ref={phraseRef} style={{ fontSize: fontPx(fit.scale) }}>
          {units.map(u => {
            // Слово (со своими знаками) под ещё не взорванным облачком скрыто
            const wait = result && exploded < count && u.index >= exploded
            const lvl = result && okOf(u.index) ? LEVEL_CLASS(levelOf(u.index)) : ''
            const cls = [lvl, wait ? 'catchWordWait' : ''].filter(Boolean).join(' ')
            return (
              <Fragment key={u.index}>
                <span className={cls || undefined} data-index={u.index}>{u.text}</span>
                {u.gap}
              </Fragment>
            )
          })}
        </div>
      </PhraseBubbleSpoiler>
      {showUnderline && <i ref={ulRef} className={`catchUnderline catchLvl${levelOf(cur)}`} aria-hidden="true" />}
    </div>
  )
}

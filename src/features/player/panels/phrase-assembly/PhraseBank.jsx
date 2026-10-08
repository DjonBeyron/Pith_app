import { Fragment, useRef, useLayoutEffect } from 'react'
import PhraseWordChip from './PhraseWordChip.jsx'
import { splitBankRows, TWO_ROW_MIN } from './bankRows.js'

// Банк слов «Собери фразу». Чипы идут одним flex-потоком в порядке банка; после каждого стоит
// скрытый «разрыв» (.phraseBankBr) — раскладка (bankRows.js) включает нужные, и при ≥ 4 чипах
// выходят ровно две строки, сбалансированные по ширине (по центру, один gap).
// Ширины меряются после монтирования; пересчёт — при смене набора чипов, ресайзе контейнера
// и чипов (загрузился шрифт). Использованные чипы остаются на месте (тусклые), поэтому набор для
// раскладки не меняется по ходу ответа и банк не прыгает. Разрывы переключаются прямо в DOM
// (classList), а не через состояние: чипы не перемонтируются, лишнего рендера нет.
export default function PhraseBank({ chips, usedIdxs, disabled, onPick }) {
  const poolRef = useRef(null)
  // Набор чипов (тексты по порядку): меняется — раскладка считается заново
  const signature = chips.map(c => c.text).join('\u0001')

  useLayoutEffect(() => {
    const pool = poolRef.current
    if (!pool) return undefined
    const chipEls = pool.querySelectorAll('.phraseChip')
    const brEls = pool.querySelectorAll('.phraseBankBr')

    let alive = true
    function layout() {
      if (!alive) return
      const gap = parseFloat(getComputedStyle(pool).columnGap) || 8
      const widths = Array.from(chipEls, el => el.getBoundingClientRect().width)
      const cuts = new Set(splitBankRows(widths, gap, pool.clientWidth))
      brEls.forEach((br, i) => br.classList.toggle('phraseBankBrOn', cuts.has(i)))
    }

    layout()
    // Идемпотентно: layout трогает только классы разрывов, а при неизменном результате
    // classList.toggle ничего не меняет — петли наблюдателя нет
    const ro = new ResizeObserver(layout)
    ro.observe(pool)
    chipEls.forEach(el => ro.observe(el))
    document.fonts?.ready.then(layout)
    return () => { alive = false; ro.disconnect() }
  }, [signature])

  return (
    <div ref={poolRef} className={`phrasePool${chips.length >= TWO_ROW_MIN ? ' phrasePoolTwo' : ''}`}>
      {chips.map((chip, i) => (
        <Fragment key={i}>
          <PhraseWordChip
            word={chip.text}
            used={usedIdxs.has(i)}
            disabled={disabled}
            onClick={e => onPick(i, e.currentTarget.getBoundingClientRect())}
          />
          <span className="phraseBankBr" aria-hidden="true" />
        </Fragment>
      ))}
    </div>
  )
}

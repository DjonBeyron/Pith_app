import { splitTitleTokens } from '../../../shared/lib/titleWords.js'
import { plural } from '../../../shared/lib/plural.js'
import { LEVEL_CLASS } from './feedCatch.js'

// Полоска фразы «Ловли слов» — отдельный блок над шторкой (feed-catch-strip.css). Пока печатаем (phase 'type'):
// у каждого слова свой туман (.fwMasked + .fwMaskPattern.bubblePattern), знаки без тумана; активное слово
// подчёркнуто (.catchUnderline — полоска 3px + треугольник вниз, цвет по уровню через .catchLvl0..4); тап по слову →
// onPick(index). Под фразой строка ввода (.catchTypedLine): набранное по порядку слов, активное — лаймом с курсором.
// Финал (phase 'result'): туманы спадают, слова, набранные верно, — цветом уровня (LEVEL_CLASS); ниже набранное:
// верные зелёным, неверные красным, пропущенные — «—»; строка факта «Расслышал N из M слов».
// words — catchWords(title, knowledge): [{ index, text, key, level }]; typedBy — Map index → строка;
// results — [{ index, ok, typed }] на финале
export default function CatchStrip({ title, words, cur = null, typedBy, phase = 'type', results = null, onPick }) {
  const tokens = splitTitleTokens(title)
  const wordOf = index => words.find(w => w.index === index) ?? null
  const resultOf = index => results?.find(r => r.index === index) ?? null
  const result = phase === 'result'

  return (
    <div className={`catchStrip${result ? ' catchStripResult' : ''}`} role="group" aria-label="Фраза">
      <div className="feedPhrase catchStripPhrase">
        {tokens.map((t, i) => {
          if (!t.word) return <span key={i}>{t.text}</span>
          const w = wordOf(t.index)
          const level = w?.level ?? 0
          const r = resultOf(t.index)
          const cls = result
            ? `fwWord ${r?.ok ? LEVEL_CLASS(level) : ''}`.trim()
            : `fwWord fwMasked catchLvl${level}${t.index === cur ? ' catchCur' : ''}`
          return (
            <span key={i} className={cls} onClick={result ? undefined : e => { e.stopPropagation(); onPick?.(t.index) }}>
              {t.text}
              <i className="fwMaskPattern bubblePattern" aria-hidden="true" />
              {!result && t.index === cur && <i className="catchUnderline" aria-hidden="true" />}
            </span>
          )
        })}
      </div>

      {!result ? (
        <div className="catchTypedLine" aria-live="polite">
          {words.map(w => {
            const typed = typedBy?.get(w.index) ?? ''
            const on = w.index === cur
            if (!typed && !on) return null
            return (
              <span key={w.index} className={on ? 'catchTypedWord catchTypedWordCur' : 'catchTypedWord'}>
                {typed}
                {on && <i className="twCaret catchCaret" aria-hidden="true" />}
              </span>
            )
          })}
        </div>
      ) : (
        <>
          <div className="catchCompareLine" aria-label="Набранное">
            {words.map(w => {
              const r = resultOf(w.index)
              const typed = r?.typed ?? ''
              const cls = !typed ? 'catchCmpWord catchCmpMiss' : r.ok ? 'catchCmpWord catchCmpOk' : 'catchCmpWord catchCmpBad'
              return <span key={w.index} className={cls}>{typed || '—'}</span>
            })}
          </div>
          <div className="catchFact" role="status">
            Расслышал {results?.filter(r => r.ok).length ?? 0} из {words.length} {plural(words.length, 'слова', 'слов', 'слов')}
          </div>
        </>
      )}
    </div>
  )
}

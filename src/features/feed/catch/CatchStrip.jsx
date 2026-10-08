import { plural } from '../../../shared/lib/plural.js'
import CatchStripPhrase from './CatchStripPhrase.jsx'

// Полоска фразы «Ловли слов» — отдельный блок над шторкой (feed-catch-strip.css). Сверху фраза под одной живой
// массой шариков с подчёркиванием активного слова (CatchStripPhrase: тап по массе → onPick(index)). Пока печатаем
// (phase 'type'): под фразой строка ввода (.catchTypedLine) — набранное по порядку слов, активное лаймом с курсором.
// Финал (phase 'result'): шарики разлетаются, оригинал проявляется первым, через ~150мс — набранное
// (.catchCompareLine: верные зелёным, неверные красным, пропущенные «—»), между ними тонкая линия
// (.catchCompareRule); строка факта «Расслышал N из M слов».
// words — catchWords(title, knowledge): [{ index, text, key, level }]; typedBy — Map index → строка;
// results — [{ index, ok, typed }] на финале; live — canvas массы живёт (накрытие открыто и лента видна)
export default function CatchStrip({ title, words, cur = null, typedBy, phase = 'type', results = null, live = true, onPick }) {
  const result = phase === 'result'
  const resultOf = index => results?.find(r => r.index === index) ?? null

  return (
    <div className={`catchStrip${result ? ' catchStripResult' : ''}`} role="group" aria-label="Фраза">
      <CatchStripPhrase title={title} words={words} cur={cur} result={result} results={results} live={live} onPick={onPick} />

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
          <div className="catchCompareRule" aria-hidden="true" />
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

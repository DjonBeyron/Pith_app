import { useState } from 'react'
import { plural } from '../../../shared/lib/plural.js'
import CatchStripPhrase from './CatchStripPhrase.jsx'
import CatchTypedLine from './CatchTypedLine.jsx'
import { compareDelay } from './catchTiming.js'

// Полоска фразы «Ловли слов» — отдельный блок над шторкой (feed-catch-strip.css). Сверху фраза: шарики отдельными
// облачками над каждым словом, с подчёркиванием активного (CatchStripPhrase: тап по облачку → onPick(index)). Под
// ней строка набранного (CatchTypedLine) — слова стоят колонками ПОД своими облачками: ширины слотов берутся из замера
// слов (onMeasure → metrics), он же отдаёт облачкам их прямоугольники (regions).
// Финал (phase 'result'): клавиатура уехала, облачка раскрываются по очереди; после последнего проявляются линия
// (.catchCompareRule), цвета набранного (верные зелёным, неверные красным, пропущенные «—») и строка факта
// «Расслышал N из M слов» — линия и факт раскрываются высотой (.catchFold), строка набранного остаётся на месте.
// words — catchWords(title, knowledge): [{ index, text, key, level }]; typedBy — Map index → строка;
// results — [{ index, ok, typed }] на финале; live — canvas облачков живёт (накрытие открыто и лента видна)
export default function CatchStrip({ title, words, cur = null, typedBy, phase = 'type', results = null, live = true, onPick }) {
  const result = phase === 'result'
  // Замер слов приходит из наблюдателя за размерами; неизменившийся замер состояние не трогает
  const [metrics, setMetrics] = useState(null)
  const onMeasure = m => setMetrics(prev => (prev && prev.sig === m.sig ? prev : m))
  const okCount = results?.filter(r => r.ok).length ?? 0

  return (
    <div
      className={`catchStrip${result ? ' catchStripResult' : ''}`}
      style={result ? { '--catch-cmp-delay': `${compareDelay(words.length)}ms` } : undefined}
      role="group"
      aria-label="Фраза"
    >
      <CatchStripPhrase
        title={title} words={words} cur={cur} result={result} results={results} live={live}
        regions={metrics?.regions ?? null} onMeasure={onMeasure} onPick={onPick}
      />
      <div className={result ? 'catchFold catchFoldOpen' : 'catchFold'} aria-hidden="true">
        <div><div className="catchCompareRule" /></div>
      </div>
      <CatchTypedLine title={title} widths={metrics?.widths} typedBy={typedBy} cur={cur} result={result} results={results} />
      <div className={result ? 'catchFold catchFoldOpen' : 'catchFold'}>
        <div>
          {result && (
            <div className="catchFact" role="status">
              Расслышал {okCount} из {words.length} {plural(words.length, 'слова', 'слов', 'слов')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

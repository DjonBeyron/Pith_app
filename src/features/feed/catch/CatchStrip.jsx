import { useCallback, useState } from 'react'
import CatchStripPhrase from './CatchStripPhrase.jsx'
import CatchTypedLine from './CatchTypedLine.jsx'
import CatchFact from './CatchFact.jsx'
import { compareDelay, factDelay, compressDelay } from './catchTiming.js'
import { FIT_NONE } from './catchFit.js'

// Полоска фразы «Ловли слов» — отдельный блок над шторкой (feed-catch-strip.css). Сверху фраза: шарики отдельными
// облачками над каждым словом, с подчёркиванием активного (CatchStripPhrase: тап по облачку → onPick(index)). Под
// ней строка набранного (CatchTypedLine) — слова стоят колонками ПОД своими облачками: ширины слотов берутся из замера
// слов (onMeasure → metrics), он же отдаёт облачкам их прямоугольники (regions). Фраза всегда в одну строку: если с
// большими промежутками между словами она не влезает, масштаб (fit — catchFit.js; считает CatchStripPhrase) уменьшает её
// целиком, и тот же масштаб получает строка набранного — слоты остаются точно под облачками.
// Между фразой и строкой набранного — слот .catchCmpSlot (8px) с линией по центру, под строкой набранного — слот факта
// .catchFactSlot (76px: 46px воздуха над текстом факта): оба есть ВСЕГДА, во время набора пустые и прозрачные, поэтому на финале ничего не раздвигается.
// Финал (phase 'result'): клавиатура уехала, облачка раскрываются по очереди; после последнего рисуется линия
// (.catchCompareRule, scaleX 0→1), затем под строкой набранного плавно проявляется факт «Расслышал N из M слов»
// (CatchFact), цвета набранного (верные зелёным, неверные красным, пропущенные «—») проявляются в строке набранного —
// она та же и остаётся на своём месте. Затем (--catch-compress-delay = compressDelay) обе строки одновременно сжимаются
// к центру: word-spacing из широкого (--catch-ws) в обычный пробел (--catch-ws-end), 450мс; одно правило
// .catchStripResult в CSS на обе строки, слоты набранного остаются под своими словами (одинаковые ширины и промежутки).
// words — catchWords(title, knowledge): [{ index, text, key, level }]; typedBy — Map index → строка;
// results — [{ index, ok, typed }] на финале; live — canvas облачков живёт (накрытие открыто и лента видна)
export default function CatchStrip({ title, words, cur = null, typedBy, phase = 'type', results = null, live = true, onPick }) {
  const result = phase === 'result'
  // Замер слов приходит из наблюдателя за размерами; неизменившийся замер состояние не трогает
  const [metrics, setMetrics] = useState(null)
  // Стабильный колбэк: CatchStripPhrase мемоизирован и не должен перерисовываться на каждую набранную букву
  const onMeasure = useCallback(m => setMetrics(prev => (prev && prev.sig === m.sig ? prev : m)), [])
  const [fit, setFit] = useState(FIT_NONE)
  const okCount = results?.filter(r => r.ok).length ?? 0
  const n = words.length
  const delays = {
    '--catch-cmp-delay': `${compareDelay(n)}ms`, '--catch-fact-delay': `${factDelay(n)}ms`, '--catch-compress-delay': `${compressDelay(n)}ms`,
  }

  return (
    <div
      className={`catchStrip${result ? ' catchStripResult' : ''}`}
      style={result ? delays : undefined}
      role="group"
      aria-label="Фраза"
    >
      <CatchStripPhrase
        title={title} words={words} cur={cur} result={result} results={results} live={live}
        regions={metrics?.regions ?? null} fit={fit} onFit={setFit} onMeasure={onMeasure} onPick={onPick}
      />
      <div className="catchCmpSlot">
        <div className="catchCompareRule" aria-hidden="true" />
      </div>
      <CatchTypedLine
        title={title} widths={metrics?.widths} fit={fit} typedBy={typedBy} cur={cur} result={result} results={results}
      />
      <div className="catchFactSlot">
        {result && <CatchFact ok={okCount} total={words.length} />}
      </div>
    </div>
  )
}

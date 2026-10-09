import { TEST_LANGS } from './antiPredictModes.js'
import ContextSeriesBlock from './ContextSeriesBlock.jsx'
import RestartSeriesBlock from './RestartSeriesBlock.jsx'

// Раздел «Простые тесты» вкладки «Голос» — две серии, СРАЗУ видимые (не свёрнуты): тест 1 (длина контекста) и тест 2 (6 нажатий подряд).
// Кнопки «Сказать»/«Стоп» и живая строка «Слышу/Услышали» стоят прямо в тесте; общие probe/series/restart приходят из AdminSpeechTab.
export default function SimpleTestsBlock({ caps, reference, lang, setLang, probe, series, onPickStep, restart }) {
  const { view, busy, start, stop } = probe
  const cooling = !!view.cooling && !busy
  return (
    <section className="aspBlock" data-testid="simple-tests">
      <h3 className="aspH">Простые тесты</h3>
      <div className="aspRow">
        <span className="aspLabelInline">Язык</span>
        {TEST_LANGS.map(l => (
          <button key={l} className={`aspChip${l === lang ? ' aspChipOn' : ''}`} disabled={busy} onClick={() => setLang(l)}>{l}</button>
        ))}
      </div>
      <ContextSeriesBlock series={series} lang={lang} reference={reference} busy={busy || cooling} view={view} onPick={onPickStep} onSay={() => start()} onStop={stop} />
      <RestartSeriesBlock rs={restart} probe={probe} recognition={caps.recognition} lang={lang} />
    </section>
  )
}

import { useState } from 'react'
import { VOSK_SERIES_HOWTO } from './antiPredictInfo.js'
import { useVoskEngine } from './voskSession.js'
import { useVoskSeries } from './useVoskSeries.js'
import { TABS } from './voskSeries.js'
import { buildSeriesReport } from './voskSeriesReport.js'
import { copyText } from './copyText.js'
import VoskSettings from './VoskSettings.jsx'
import VoskCtxPanel from './VoskCtxPanel.jsx'
import VoskTrapsBlock from './VoskTrapsBlock.jsx'
import VoskPairsBlock from './VoskPairsBlock.jsx'
import VoskSummary from './VoskSummary.jsx'
import VoskRunsTable from './VoskRunsTable.jsx'
import { LivePartial } from './VoskCards.jsx'

const PANELS = { ctx: VoskCtxPanel, trap: VoskTrapsBlock, pair: VoskPairsBlock }

// «Тест 3. Vosk — закрытый словарь (усложнённый)»: на виду в «Простых тестах», работает только когда модель Vosk загружена в память
// (эксперимент 10 в «Проверки → Дополнительно»). A — контекст в двух режимах, B — ловушки, C — пары форм; D — условия, E — порог уверенности,
// F — тайминги и авто-стоп. engine — подставной движок для стенда; по умолчанию общий (voskSession.js).
export default function VoskSeriesBlock({ engine }) {
  const live = useVoskEngine()
  const eng = engine ?? live
  const rec = useVoskSeries(eng)
  const { state, patch, setAutoStop, stop, clear } = rec
  const [note, setNote] = useState('')
  const Panel = PANELS[state.tab]
  const can = eng.ready && !rec.live

  async function copy() {
    setNote((await copyText(buildSeriesReport(state, eng.info ?? {}))) ? 'Итог Vosk-серии скопирован' : 'Не удалось скопировать — выделите текст вручную')
  }

  return (
    <div className="apCard apSeries" data-testid="vosk-series">
      <h4 className="apTestH">Тест 3. Vosk — закрытый словарь (усложнённый)</h4>
      <ol className="apHow" aria-label="Порядок действий">{VOSK_SERIES_HOWTO.map(t => <li key={t}>{t}</li>)}</ol>
      {!eng.loaded && (
        <div className="vkGate">
          <button className="aspSay apSmall" disabled data-testid="vk-gate">Сначала загрузите движок</button>
          <p className="aspHint">Модель Vosk загружается в «Проверки → Дополнительно → 10. Vosk»: «Скачать модель», затем «Загрузить движок в память». Потом вернитесь сюда.</p>
        </div>
      )}
      <VoskSettings state={state} patch={patch} setAutoStop={setAutoStop} busy={!!rec.live} />
      <div className="aspRow" role="tablist" aria-label="Часть теста">
        {TABS.map(t => <button key={t.id} role="tab" aria-selected={t.id === state.tab} className={`aspChip${t.id === state.tab ? ' aspChipOn' : ''}`} disabled={!!rec.live} data-testid={`vk-tab-${t.id}`} onClick={() => patch({ tab: t.id })}>{t.label}</button>)}
      </div>
      <Panel rec={rec} can={can} />
      <LivePartial live={rec.live} />
      {eng.loaded && eng.busy && !rec.live && <p className="aspHint">Микрофон занят другой записью Vosk — дождитесь конца.</p>}
      {rec.error && <div className="aspErr"><b>{rec.error}</b></div>}
      <VoskSummary state={state} />
      <div className="aspRow">
        <button className="aeRefresh" onClick={copy} data-testid="vk-copy">Скопировать итог Vosk-серии</button>
        <button className="aeRefresh" disabled={!state.runs.length || !!rec.live} onClick={() => { clear(); setNote('Серия Vosk очищена') }}>Очистить серию</button>
        {rec.live && <button className="aspStop" onClick={stop}>Стоп</button>}
      </div>
      {note && <p className="aeHint">{note}</p>}
      <details className="apMore">
        <summary>Подробнее: все прогоны таблицей</summary>
        <VoskRunsTable runs={state.runs} />
      </details>
    </div>
  )
}

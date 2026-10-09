import { useState } from 'react'
import { STRATEGY_IDS } from '../../../shared/lib/speech/speechRestart.js'
import { RESTART_INTRO, STRATEGY_INFO, strategyLabel } from './restartStrategies.js'
import { SERIES_SIZE, tableRows, conclusions, seriesLines } from './restartSeries.js'
import { copyText } from './copyText.js'

const CLS = { ok: 'ок', deaf: 'ГЛУХОЙ', error: 'ошибка' }
const ms = v => (v == null ? '—' : `${v}`)

// Блок «Надёжность второго запуска» пробы «Голос»: переключатель стратегии перезапуска (S1…S5), автотест «Серия из 6 нажатий подряд»,
// таблица по стратегиям (успешных из 6, глухих, среднее время до audiostart/result), выводы и «Скопировать итог серии стратегий».
export default function RestartSeriesBlock({ rs, probe, recognition, lang }) {
  const [note, setNote] = useState('')
  const { state, strategy } = rs
  const { view, busy } = probe
  const cooling = !!view.cooling && !busy
  const act = state.active
  const done = act?.runs.length ?? 0
  const rows = tableRows(state)
  const last = act?.runs[done - 1]
  const mismatch = act && act.strategy !== strategy

  async function copy() {
    const text = seriesLines(state, lang).join('\n')
    setNote((await copyText(text)) ? `Итог скопирован (${text.length} симв.)` : 'Не удалось скопировать — выделите текст вручную')
  }

  return (
    <details className="apBox">
      <summary className="apSum">Надёжность второго запуска · стратегия {strategy}{act ? ` · серия ${act.strategy}: ${done} из ${SERIES_SIZE}` : ''}</summary>
      <p className="aspHint">{RESTART_INTRO}</p>
      <div className="aspRow"><span className="aspLabelInline">Стратегия перезапуска</span></div>
      <div className="aspChips">
        {STRATEGY_IDS.map(id => (
          <button key={id} className={`aspChip${id === strategy ? ' aspChipOn' : ''}`} disabled={busy} aria-pressed={id === strategy} onClick={() => rs.choose(id)}>{id}</button>
        ))}
      </div>
      <p className="aspHint"><b>{strategyLabel(strategy)}</b>. {STRATEGY_INFO[strategy].text}</p>
      <div className="aspRow">
        <button className="aspSay apSmall" disabled={busy || cooling || !recognition} onClick={() => rs.start(lang)}>Серия из 6 нажатий подряд ({strategy})</button>
        {act && <button className="aeRefresh" disabled={busy} onClick={rs.cancel}>Прервать серию</button>}
      </div>
      {act && (
        <div className="apCard apSeries" data-testid="rs-active">
          <b className="apSay">{done === 0 ? `Скажи фразу (1 из ${SERIES_SIZE})` : `Нажми ещё раз (${done + 1} из ${SERIES_SIZE})`}</b>
          {last && <span className="aspHint">Прошлый заход: {CLS[last.cls]}{last.recovered ? ' (спасён авто-повтором)' : ''}{last.audio != null ? ` · audiostart ${last.audio} мс` : ''}{last.result != null ? ` · result ${last.result} мс` : ''}</span>}
          {mismatch && <span className="aspHint">Идёт серия {act.strategy}, а выбрана {strategy}: нажатия с другой стратегией в серию не идут.</span>}
          <div className="aspRow">
            <button className="aspSay apSmall" data-testid="rs-say" disabled={busy || cooling || !recognition} onClick={() => probe.start()}>
              {cooling ? 'Подготовка микрофона…' : busy ? 'Слушаю…' : `Сказать (${done + 1} из ${SERIES_SIZE})`}
            </button>
            <button className="aspStop" disabled={!busy} onClick={probe.stop}>Стоп</button>
          </div>
        </div>
      )}
      <div className="aspTableWrap"><table className="aspTable" aria-label="Итог серий по стратегиям">
        <thead><tr><th>Стр.</th><th>Успешных</th><th>Глухих</th><th>Ошибок</th><th>audiostart, мс</th><th>result, мс</th><th>Заходы</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id} className={r.id === strategy ? 'apHit' : ''}>
            <td>{r.id}{r.partial ? '…' : ''}</td>
            {r.stats ? (<>
              <td>{r.stats.ok} из {r.stats.n}</td><td>{r.stats.deafRuns}</td><td>{r.stats.err}</td><td>{ms(r.stats.audio)}</td><td>{ms(r.stats.result)}</td>
              <td className="apWrap">{r.runs.map(x => CLS[x.cls] + (x.recovered ? '*' : '')).join(' ')}</td>
            </>) : <td colSpan={6}>нет данных</td>}
          </tr>
        ))}</tbody>
      </table></div>
      <ul className="apConc">{conclusions(state).map(c => <li key={c}>{c}</li>)}</ul>
      <p className="aspHint">«Глухой» запуск = audiostart быстрее 120 мс и нет soundstart/speechstart/result за 4 с (подозрение на глухую сессию). * — заход спасён автоматическим повтором (deaf_retry).</p>
      <div className="aspRow">
        <button className="aeRefresh" onClick={copy}>Скопировать итог серии стратегий</button>
        <button className="aeRefresh" disabled={busy} onClick={() => { rs.clear(); setNote('Итоги серий очищены') }}>Очистить итоги</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
    </details>
  )
}

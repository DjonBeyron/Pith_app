import { useState } from 'react'
import { STRATEGY_IDS } from '../../../shared/lib/speech/speechRestart.js'
import { RESTART_INTRO, STRATEGY_INFO, strategyLabel } from './restartStrategies.js'
import { SERIES_SIZE, tableRows, conclusions, seriesLines } from './restartSeries.js'
import { runLine, runVerdict, runTime, strategyLine } from './restartCards.js'
import { RESTART_HOWTO } from './antiPredictInfo.js'
import LiveHeard from './LiveHeard.jsx'
import { copyText } from './copyText.js'

const CLS = { ok: 'ок', deaf: 'ГЛУХОЙ', error: 'ошибка' }
const ms = v => (v == null ? '—' : `${v}`)

// Строка попытки серии: «Попытка 3 из 6 — Услышали: «hello»», вывод простыми словами и время до ответа
function RunCard({ run, i }) {
  const v = runVerdict(run)
  return (
    <div className={`apRun apRun-${v.tone}`} data-testid="rs-run">
      <div className="apHeard">{runLine(run, i, SERIES_SIZE)}</div>
      <div className={`apVerdict apV-${v.tone}`}>{v.text}{runTime(run) ? <span className="aspHint"> · {runTime(run)}</span> : null}</div>
    </div>
  )
}

// «Тест 2. Не глохнет ли микрофон?» (надёжность второго запуска) пробы «Голос»: шпаргалка, переключатель стратегии (S1…S5), автотест «Серия из 6 нажатий подряд» с карточками попыток
// и живой строкой «Слышу…», сводка по стратегиям простыми строками; широкая таблица, выводы и объяснения — в «Подробнее».
export default function RestartSeriesBlock({ rs, probe, recognition, lang }) {
  const [note, setNote] = useState('')
  const { state, strategy } = rs
  const { view, busy } = probe
  const cooling = !!view.cooling && !busy
  const act = state.active
  const done = act?.runs.length ?? 0
  const rows = tableRows(state)
  const shown = act ?? state.results[strategy] // идущая серия или последняя завершённая по выбранной стратегии
  const mismatch = act && act.strategy !== strategy

  async function copy() {
    const text = seriesLines(state, lang).join('\n')
    setNote((await copyText(text)) ? `Итог скопирован (${text.length} симв.)` : 'Не удалось скопировать — выделите текст вручную')
  }

  return (
    <div className="apCard apSeries">
      <h4 className="apTestH">Тест 2. Не глохнет ли микрофон? (серия из 6 нажатий)</h4>
      <ol className="apHow" aria-label="Порядок действий">{RESTART_HOWTO.map(t => <li key={t}>{t}</li>)}</ol>
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
          {mismatch && <span className="aspHint">Идёт серия {act.strategy}, а выбрана {strategy}: нажатия с другой стратегией в серию не идут.</span>}
          <div className="aspRow">
            <button className="aspSay apSmall" data-testid="rs-say" disabled={busy || cooling || !recognition} onClick={() => probe.start()}>
              {cooling ? 'Подготовка микрофона…' : busy ? 'Слушаю…' : `Сказать (${done + 1} из ${SERIES_SIZE})`}
            </button>
            <button className="aspStop" disabled={!busy} onClick={probe.stop}>Стоп</button>
          </div>
          <LiveHeard view={view} />
        </div>
      )}
      {shown?.runs.length > 0 && (<>
        <b className="apCardHead">Попытки · серия {shown.strategy ?? strategy}{act ? ' (идёт)' : ''}</b>
        {shown.runs.map((run, i) => <RunCard key={i} run={run} i={i} />)}
      </>)}
      <b className="apCardHead">Сводка по стратегиям</b>
      <ul className="apConc" data-testid="rs-summary">{rows.map(r => <li key={r.id}>{strategyLine(r)}</li>)}</ul>
      <div className="aspRow">
        <button className="aeRefresh" onClick={copy}>Скопировать итог серии стратегий</button>
        <button className="aeRefresh" disabled={busy} onClick={() => { rs.clear(); setNote('Итоги серий очищены') }}>Очистить итоги</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
      <details className="apMore">
        <summary>Подробнее: таблица, выводы, объяснения</summary>
        <p className="aspHint">{RESTART_INTRO}</p>
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
      </details>
    </div>
  )
}

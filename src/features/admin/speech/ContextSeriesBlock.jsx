import { useState } from 'react'
import { SERIES_HOWTO, SERIES_INTRO } from './antiPredictInfo.js'
import { rowsOf, conclusions, seriesLines } from './contextSeries.js'
import { compareLines } from './seriesCards.js'
import { ResultTable, CompareTable } from './SeriesTables.jsx'
import SeriesStepCard from './SeriesStepCard.jsx'
import LiveHeard from './LiveHeard.jsx'
import { copyText } from './copyText.js'
import { strategyLabel } from './restartStrategies.js'

// Серия «влияет ли длина контекста»: шпаргалка из 3 шагов, 4 карточки шагов («что сказать» → «Услышали» → вывод простыми словами), «Сказать» с живой строкой
// «Слышу…», «Языки рядом» строками, «Скопировать итог серии». Широкие таблицы, выводы и настройки эталонов — в «Подробнее».
// strategy — выбранная стратегия перезапуска (читает её контроллер пробы на каждом тапе, поэтому «Тест 1» идёт на ней же).
// Режимы 2 (10 альтернатив) и 3 (история interim) включаются на шагах серии автоматически (useAntiPredict.getExtra).
export default function ContextSeriesBlock({ series, lang, reference, busy, view, onPick, onSay, onStop, strategy }) {
  const { state, step, setRef, setWord, clear } = series
  const { cfg } = state
  const [edit, setEdit] = useState({ word: cfg.word, wrong: cfg.wrong })
  const [note, setNote] = useState('')
  const active = step != null && reference === cfg.refs[step]
  const langsWith = Object.keys(state.langs).filter(l => rowsOf(state, l).length)
  const rows = rowsOf(state, lang)
  const side = compareLines(state, langsWith)

  async function copy() {
    setNote((await copyText(seriesLines(state, langsWith.length ? langsWith : [lang]).join('\n'))) ? 'Итог серии скопирован' : 'Не удалось скопировать — выделите текст вручную')
  }

  return (
    <div className="apCard apSeries">
      <h4 className="apTestH">Тест 1. Исправляет ли движок мою ошибку? (серия из 4 шагов)</h4>
      <ol className="apHow" aria-label="Порядок действий">{SERIES_HOWTO.map(t => <li key={t}>{t}</li>)}</ol>
      <b className="apCardHead">Шаги · {lang}</b>
      {cfg.refs.map((r, i) => <SeriesStepCard key={i} i={i} cfg={cfg} row={state.langs[lang]?.[i] ?? null} on={active && step === i} busy={busy} onPick={onPick} />)}
      <div className="aspRow">
        <button className="aspSay apSmall" onClick={onSay} disabled={busy || !active}>{active ? `Сказать (шаг ${step + 1})` : 'Выберите шаг'}</button>
        <button className="aspStop" onClick={onStop} disabled={!busy}>Стоп</button>
        {view?.status === 'listening' && <span className="aspRec"><i className="aspDot" />идёт запись…</span>}
      </div>
      <LiveHeard view={view} show={active && view?.reference === reference} />
      {strategy && <p className="aspHint" data-testid="step-strategy">Перезапуск микрофона: <b>{strategyLabel(strategy)}</b> (выбирается в «Тесте 2» ниже и действует на все нажатия «Сказать»).</p>}
      {side.length > 0 && langsWith.length > 1 && (<><b className="apCardHead">Языки рядом</b><ul className="apConc">{side.map(t => <li key={t}>{t}</li>)}</ul></>)}
      <div className="aspRow">
        <button className="aeRefresh" onClick={copy}>Скопировать итог серии</button>
        <button className="aeRefresh" disabled={!rows.length} onClick={() => { clear(lang); setNote(`Серия ${lang} очищена`) }}>Очистить серию {lang}</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
      <details className="apMore">
        <summary>Подробнее: таблица, выводы, настройки</summary>
        <p className="aspHint">{SERIES_INTRO}</p>
        {rows.length ? (<>
          <ResultTable rows={rows} />
          <ul className="apConc">{conclusions(rows).map(c => <li key={c}>{c}</li>)}</ul>
        </>) : <p className="aspHint">На этом языке результатов пока нет: пройдите шаги 1–4.</p>}
        {langsWith.length > 1 && <CompareTable state={state} langs={langsWith} />}
        <div className="apStepWord">
          <label className="aspLabel">Ключевое слово<input className="aspInput" value={edit.word} onChange={e => setEdit({ ...edit, word: e.target.value })} disabled={busy} spellCheck={false} autoCapitalize="off" /></label>
          <label className="aspLabel">Говорим ошибочно<input className="aspInput" value={edit.wrong} onChange={e => setEdit({ ...edit, wrong: e.target.value })} disabled={busy} spellCheck={false} autoCapitalize="off" /></label>
          <button className="aeRefresh" disabled={busy || (edit.word === cfg.word && edit.wrong === cfg.wrong)} onClick={() => setWord(edit.word, edit.wrong)}>Подставить слово во все эталоны</button>
          {cfg.refs.map((r, i) => (
            <label key={i} className="aspLabel">Эталон шага {i + 1}
              <input className="aspInput" value={r} onChange={e => setRef(i, e.target.value)} disabled={busy} spellCheck={false} autoCapitalize="off" />
            </label>
          ))}
        </div>
      </details>
    </div>
  )
}

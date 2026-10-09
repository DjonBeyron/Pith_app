import { useState } from 'react'
import { SERIES_INTRO } from './antiPredictInfo.js'
import { KIND_LABEL, stepCaption, rowsOf, conclusions, rulesText, seriesLines } from './contextSeries.js'
import { copyText } from './copyText.js'

const pct = c => (typeof c === 'number' ? `${c}%` : '—')

// Таблица результатов серии для одного языка: длина контекста → top-1 → буквально/исправлено → уверенность → правила → где литерально
function ResultTable({ rows }) {
  return (
    <div className="aspTableWrap"><table className="aspTable" aria-label="Результаты серии">
      <thead><tr><th>Слов</th><th>Эталон</th><th>Top-1</th><th>Вид</th><th>Conf.</th><th>Правила</th><th>Литерально</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.step} className={r.kind === 'ref' ? 'apHit' : ''}>
          <td>{r.n}</td><td>{r.ref}</td><td>{r.top1}</td>
          <td>{KIND_LABEL[r.kind]}{r.fixed ? ' · interim исправлен' : ''}</td><td>{pct(r.conf)}</td>
          <td className="apWrap">{rulesText(r.verdicts)}</td><td className="apWrap">{r.literal.length ? r.literal.join(', ') : 'нет'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}

// Языки рядом: по строке на длину контекста, в ячейке «вид · уверенность»
function CompareTable({ state, langs }) {
  const ns = [...new Set(langs.flatMap(l => rowsOf(state, l).map(r => r.n)))].sort((a, b) => a - b)
  const cell = (l, n) => { const r = rowsOf(state, l).find(x => x.n === n); return r ? `${KIND_LABEL[r.kind]} ${pct(r.conf)}` : '—' }
  return (
    <div className="aspTableWrap"><table className="aspTable" aria-label="Сравнение языков">
      <thead><tr><th>Слов</th>{langs.map(l => <th key={l}>{l}</th>)}</tr></thead>
      <tbody>{ns.map(n => <tr key={n}><td>{n}</td>{langs.map(l => <td key={l}>{cell(l, n)}</td>)}</tr>)}</tbody>
    </table></div>
  )
}

// Серия «влияет ли длина контекста»: 4 эталона с одним ключевым словом, шаги, таблица результатов по языкам, «Скопировать итог серии».
// Режимы 2 (10 альтернатив) и 3 (история interim) включаются на шагах серии автоматически (useAntiPredict.getExtra).
export default function ContextSeriesBlock({ series, lang, reference, busy, view, onPick, onSay, onStop }) {
  const { state, step, setRef, setWord, clear } = series
  const { cfg } = state
  const [edit, setEdit] = useState({ word: cfg.word, wrong: cfg.wrong })
  const [note, setNote] = useState('')
  const active = step != null && reference === cfg.refs[step]
  const langsWith = Object.keys(state.langs).filter(l => rowsOf(state, l).length)
  const rows = rowsOf(state, lang)

  async function copy() {
    setNote((await copyText(seriesLines(state, langsWith.length ? langsWith : [lang]).join('\n'))) ? 'Итог серии скопирован' : 'Не удалось скопировать — выделите текст вручную')
  }

  return (
    <div className="apCard apSeries">
      <b>Серия: влияет ли длина контекста</b>
      <p className="aspHint">{SERIES_INTRO}</p>
      <div className="apStepWord">
        <label className="aspLabel">Ключевое слово<input className="aspInput" value={edit.word} onChange={e => setEdit({ ...edit, word: e.target.value })} disabled={busy} spellCheck={false} autoCapitalize="off" /></label>
        <label className="aspLabel">Говорим ошибочно<input className="aspInput" value={edit.wrong} onChange={e => setEdit({ ...edit, wrong: e.target.value })} disabled={busy} spellCheck={false} autoCapitalize="off" /></label>
        <button className="aeRefresh" disabled={busy || (edit.word === cfg.word && edit.wrong === cfg.wrong)} onClick={() => setWord(edit.word, edit.wrong)}>Подставить слово во все эталоны</button>
      </div>
      {cfg.refs.map((r, i) => (
        <div key={i} className="apStep">
          <div className="aspRow">
            <button className={`aspChip${active && step === i ? ' aspChipOn' : ''}`} disabled={busy} onClick={() => onPick(i)}>Шаг {i + 1}</button>
            <input className="aspInput apStepRef" value={r} onChange={e => setRef(i, e.target.value)} disabled={busy} spellCheck={false} autoCapitalize="off" aria-label={`Эталон шага ${i + 1}`} />
          </div>
          <div className={`aspHint${active && step === i ? ' apSay' : ''}`}>{stepCaption(cfg, i)}</div>
        </div>
      ))}
      <div className="aspRow">
        <button className="aspSay apSmall" onClick={onSay} disabled={busy || !active}>{active ? `Сказать (шаг ${step + 1})` : 'Выберите шаг'}</button>
        <button className="aspStop" onClick={onStop} disabled={!busy}>Стоп</button>
        {view?.status === 'listening' && <span className="aspRec"><i className="aspDot" />идёт запись…</span>}
      </div>
      {view?.final && active && <div className="aspHint">Последний итог: «{view.final.text}» — результат внесён в таблицу.</div>}
      <b className="apCardHead">Результаты · {lang}</b>
      {rows.length ? (<>
        <ResultTable rows={rows} />
        <ul className="apConc">{conclusions(rows).map(c => <li key={c}>{c}</li>)}</ul>
      </>) : <p className="aspHint">На этом языке результатов пока нет: пройдите шаги 1–4.</p>}
      {langsWith.length > 1 && (<><b className="apCardHead">Языки рядом</b><CompareTable state={state} langs={langsWith} /></>)}
      <div className="aspRow">
        <button className="aeRefresh" onClick={copy}>Скопировать итог серии</button>
        <button className="aeRefresh" disabled={!rows.length} onClick={() => { clear(lang); setNote(`Серия ${lang} очищена`) }}>Очистить серию {lang}</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
    </div>
  )
}

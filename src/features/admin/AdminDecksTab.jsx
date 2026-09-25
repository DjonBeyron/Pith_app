import { useState, useEffect, useCallback } from 'react'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listLessonCards } from '../../shared/lib/lessonsApi.js'
import { MIN_CARDS } from '../reviewCards/reviewCardCopy.js'
import { buildDeckReport } from './deckReport.js'

// Админ → «Колоды»: слова без колоды повтора или с колодой меньше минимума
// (этап 3 системы повторения, PROJECT.md → «Колоды»). Слово без колоды не
// попадёт в повторение. «Карточки» открывает редактор колоды урока
const STATUS_TEXT = { none: 'нет колоды', few: 'мало', ok: 'готово' }

export default function AdminDecksTab({ onOpenCards }) {
  const [rows, setRows] = useState(null) // null — загрузка
  const [err, setErr] = useState('')
  const [onlyProblems, setOnlyProblems] = useState(true)

  const load = useCallback(() => {
    setErr('')
    return Promise.all([loadCurricula(), listLessonCards()])
      .then(([curricula, lessons]) => setRows(buildDeckReport(curricula, lessons)))
      .catch(e => { setErr(e?.message ?? 'Не загрузилось'); setRows([]) })
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- первичная загрузка списка
  useEffect(() => { load() }, [load])

  const shown = (rows ?? []).filter(r => !onlyProblems || r.status !== 'ok')
  const count = s => (rows ?? []).filter(r => r.status === s).length

  return (
    <div className="aeWrap">
      <div className="aeHead">
        <span className="aeTitle">Колоды повтора</span>
        <button className="aeRefresh" onClick={load}>Обновить</button>
      </div>
      {rows && (
        <p className="aeHint">
          Слов: {rows.length} · без колоды: {count('none')} · мало (&lt; {MIN_CARDS}): {count('few')}
        </p>
      )}
      <label className="adkFilter">
        <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />
        только без колоды и с малой колодой
      </label>
      {err && <p className="aeError">{err}</p>}
      {rows === null && <p className="aeHint">Загрузка...</p>}
      {rows && shown.length === 0 && !err && <p className="aeHint">Проблемных слов нет</p>}
      {shown.map(r => (
        <div key={r.word} className="aeRow adkRow">
          <div className="adkTop">
            <span className="adkWord">{r.word}</span>
            <span className={`adkChip adkChip--${r.status}`}>
              {STATUS_TEXT[r.status]}{r.status !== 'none' ? ` · ${r.cards}` : ''}
            </span>
          </div>
          {r.lessons.map(l => (
            <div key={l.id} className="adkLesson">
              <span className="adkLessonName">{l.moduleTitle} → {l.title} · {l.cards}</span>
              <button className="aeRefresh" onClick={() => onOpenCards?.({ id: l.id, moduleLessons: [] })}>
                Карточки
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

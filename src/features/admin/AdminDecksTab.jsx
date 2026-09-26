import { useState, useEffect, useCallback } from 'react'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listLessonCards } from '../../shared/lib/lessonsApi.js'
import { MIN_CARDS } from '../reviewCards/reviewCardCopy.js'
import { buildDeckReport } from './deckReport.js'
import { listWordMemory, debugAddWord, debugRemoveWord } from '../../shared/api/memoryApi.js'
import { localToday } from '../review/reviewDecks.js'
import AdminLearnControls from './AdminLearnControls.jsx'
import { onDeckSaved } from '../reviewCards/deckSavedEvent.js'

// Админ → «Колоды»: слова без колоды повтора или с колодой меньше минимума
// (этап 3 системы повторения, PROJECT.md → «Колоды»). Слово без колоды не
// попадёт в повторение. «Карточки» открывает редактор колоды урока.
// «＋ В обучение» (AdminLearnControls) — слово в СВОЮ память админа к повтору
// сегодня: проверить вкладку «Память», не проходя урок
const STATUS_TEXT = { none: 'нет колоды', few: 'мало', ok: 'готово' }

export default function AdminDecksTab({ onOpenCards }) {
  const [rows, setRows] = useState(null) // null — загрузка
  const [err, setErr] = useState('')
  const [onlyProblems, setOnlyProblems] = useState(true)
  const [memory, setMemory] = useState(() => new Map()) // своя память: word → строка
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    setErr('')
    return Promise.all([loadCurricula(), listLessonCards(), listWordMemory()])
      .then(([curricula, lessons, mem]) => {
        setRows(buildDeckReport(curricula, lessons))
        setMemory(new Map(mem.map(m => [m.word, m])))
      })
      .catch(e => { setErr(e?.message ?? 'Не загрузилось'); setRows([]) })
  }, [])

  async function toLearn(word, run, done) {
    setBusy(true)
    const res = await run(word)
    setNote(res == null || res.ok === false ? `Не вышло для «${word}» (нужна миграция memory_debug_add и права админа)` : done)
    const mem = await listWordMemory()
    setMemory(new Map(mem.map(m => [m.word, m])))
    setBusy(false)
  }
  const addToLearn = word => toLearn(word, debugAddWord, `«${word}» — к повтору сегодня. Открой вкладку «Память»`)
  const removeFromLearn = word => toLearn(word, debugRemoveWord, `«${word}» убрано из обучения`)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- первичная загрузка списка
  useEffect(() => { load() }, [load])
  // Колоду сохранили в редакторе карточек (он поверх этой вкладки) — перечитать
  useEffect(() => onDeckSaved(() => { load() }), [load])

  const shown = (rows ?? []).filter(r => !onlyProblems || r.status !== 'ok')
  const count = s => (rows ?? []).filter(r => r.status === s).length
  const today = localToday()

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
      {note && <p className="aeHint">{note}</p>}
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
          <AdminLearnControls
            word={r.word}
            mem={memory.get(r.word)}
            cards={r.cards}
            today={today}
            busy={busy}
            onAdd={addToLearn}
            onRemove={removeFromLearn}
          />
          {r.lessons.map(l => (
            <div key={l.id} className="adkLesson">
              <span className="adkLessonName">{l.moduleTitle} → {l.title} · {l.cards}</span>
              <button className="aeRefresh" onClick={() => onOpenCards?.({ id: l.id, moduleLessons: l.moduleLessons })}>
                Карточки
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

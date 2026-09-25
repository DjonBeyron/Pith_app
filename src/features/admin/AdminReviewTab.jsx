import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { listWordMemory, debugShiftMemory } from '../../shared/api/memoryApi.js'
import { localToday } from '../review/reviewDecks.js'

const ReviewScreen = lazy(() => import('../review/ReviewScreen.jsx'))

// Админ → «Повторение»: временный вход в плеер повторения (этап 4 системы
// повторения, до вкладки «Моё обучение» этапа 5) и инструменты проверки —
// своя память слов (шаг, срок) и «прожить N дней» (memory_debug_shift:
// сроки своей памяти сдвигаются назад, как будто дни прошли).
export default function AdminReviewTab() {
  const [rows, setRows] = useState(null) // null — загрузка
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => listWordMemory().then(m =>
    setRows([...m].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.word.localeCompare(b.word)))), [])

  useEffect(() => { load() }, [load]) // первичная загрузка списка

  async function shift(days) {
    const n = await debugShiftMemory(days)
    setNote(n == null ? 'Не вышло (нужна миграция памяти и права админа)' : `Сдвинуто слов: ${n} на ${days} дн.`)
    load()
  }

  const today = localToday()
  const due = (rows ?? []).filter(r => r.due_on <= today).length

  return (
    <div className="aeWrap">
      <div className="aeHead">
        <span className="aeTitle">Повторение (тест)</span>
        <button className="aeRefresh" onClick={load}>Обновить</button>
      </div>
      <p className="aeHint">
        Слов в памяти: {rows?.length ?? '…'} · к повтору сегодня: {rows ? due : '…'}
      </p>
      <div className="arvActions">
        <button className="arvStart" onClick={() => setOpen(true)}>Начать повторение</button>
        <button className="aeRefresh" onClick={() => shift(1)}>Прожить 1 день</button>
        <button className="aeRefresh" onClick={() => shift(7)}>Прожить 7 дней</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
      {rows?.length === 0 && <p className="aeHint">Память пуста — пройди урок-слово в любом модуле</p>}
      {(rows ?? []).map(r => (
        <div key={r.word} className="aeRow arvRow">
          <span className="arvWord">{r.word}</span>
          <span className="arvMeta">шаг {r.step} · {r.due_on <= today ? 'сегодня' : r.due_on}</span>
        </div>
      ))}
      {open && (
        <Suspense fallback={null}>
          <ReviewScreen onClose={() => { setOpen(false); load() }} />
        </Suspense>
      )}
    </div>
  )
}
